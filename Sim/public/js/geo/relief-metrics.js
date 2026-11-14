// Stage 35A — ölçülmüş kabartma istatistikleri (saf modül: DOM, ağ, dosya erişimi yok).
//
// Girdi (grid): { elevation (row-major, row 0 = kuzey, Float32Array/Float64Array/dizi), rows, cols,
//   cellSizeM, noDataValue | validMin+validMax (en az biri AÇIKÇA verilmeli), nwXM?, nwYM? }.
// nwXM/nwYM: pencere kuzey-batı köşesinin yerel düzlemdeki (metre) koordinatı; verilmezse 0.
//
// BİLİNMEYEN HÜCRE: sonlu olmayan, noDataValue ile (float32 olarak) eşit veya beyan edilen
// [validMin, validMax] dışında kalan hücre. Bilinmeyen hücre ASLA 0 kot veya 0 eğim olarak
// kullanılmaz; istatistiklerde yalnız "bilinmiyor" sayısına girer.
//
// ÇUKUR/TEPE EŞİKLERİ SENARYO PARAMETRELERİDİR: `minDepthM` ve `minProminenceM` çağıranın açıkça
// vermesi gereken değerlerdir (varsayılan yok). Hiçbiri NASA veya başka bir kaynağın eşiği değildir.
// 1 m DTM kayaları/blokları çözmez; çıktıdaki "çukur"/"tepe" kaya tespiti iddiası taşımaz.
//
// Yöntem özeti:
//   - Yüzey yüksekliği: bilinen hücrelerin Float64 kopyası, tip-7 (doğrusal ara değer) yüzdelikler.
//   - Eğim: geo.horn3x3Gradient (Horn 1981), yalnız dokuz hücresi de bilinen iç hücrelerde.
//   - Çukur/tepe: priority-flood (Barnes 2014 yaklaşımı, 8 komşu). Kenar hücreleri ve bilinmeyen
//     hücrelere komşu bilinen hücreler "çıkış" (taşma noktası) kabul edilir. Bir havza, taşma
//     noktası pencere kenarındaysa "kenara sızar" ve listelenmez. Sayılan kapalı havzalar için
//     derinlik = taşma seviyesi - en alçak hücre kotu.
//   - Tepe belirginliği: aynı işlem -z üzerinde; belirginlik = tepe kotu - en düşük geçit (col) kotu.

import { horn3x3Gradient } from './geo.js';

export const RELIEF_METRICS_SCHEMA = 'marswalk.relief-metrics.v1';

const NEIGH8 = Object.freeze([
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
]);

/** Yalnız okuma: bilinen veriyi, bilinmeyen hücre maskesini ve yerel koordinat çerçevesini hazırlar. */
export function normalizeGrid(grid) {
  if (!grid || typeof grid !== 'object') throw new TypeError('grid nesnesi gerekli');
  const { elevation, rows, cols, cellSizeM } = grid;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new TypeError('rows/cols pozitif tam sayı olmalı');
  }
  if (!(cellSizeM > 0) || !Number.isFinite(cellSizeM)) throw new TypeError('cellSizeM pozitif sonlu olmalı');
  const n = rows * cols;
  if (!elevation || typeof elevation.length !== 'number' || elevation.length !== n) {
    throw new TypeError('elevation uzunluğu rows*cols olmalı');
  }
  const hasNd = grid.noDataValue !== undefined;
  const hasRangeMin = grid.validMin !== undefined;
  const hasRangeMax = grid.validMax !== undefined;
  if (hasRangeMin !== hasRangeMax) throw new TypeError('validMin ve validMax birlikte verilmeli');
  const hasRange = hasRangeMin && hasRangeMax;
  if (!hasNd && !hasRange) {
    throw new TypeError('noDataValue veya validMin+validMax açıkça tanımlanmalı; bilinmeyen veri varsayılmaz');
  }
  if (hasNd && !Number.isFinite(grid.noDataValue)) throw new TypeError('noDataValue sonlu olmalı');
  if (hasRange && !(grid.validMin <= grid.validMax)) throw new TypeError('validMin <= validMax olmalı');
  const nwXM = grid.nwXM ?? 0;
  const nwYM = grid.nwYM ?? 0;
  if (!Number.isFinite(nwXM) || !Number.isFinite(nwYM)) throw new TypeError('nwXM/nwYM sonlu olmalı');

  // Float32 karşılaştırma: kaynak no-data bit deseni ile aynı yuvarlama.
  const nd = hasNd ? Math.fround(grid.noDataValue) : null;
  const vmin = hasRange ? Math.fround(grid.validMin) : -Infinity;
  const vmax = hasRange ? Math.fround(grid.validMax) : Infinity;
  const known = new Uint8Array(n);
  const z = new Float64Array(n).fill(NaN);
  let knownCount = 0;
  for (let i = 0; i < n; i++) {
    const v = elevation[i];
    const f = Math.fround(v);
    if (!Number.isFinite(v) || (nd !== null && f === nd) || f < vmin || f > vmax) continue;
    known[i] = 1;
    z[i] = v;
    knownCount++;
  }
  return Object.freeze({
    rows, cols, n, cellSizeM, nwXM, nwYM, known, z, knownCount, unknownCount: n - knownCount,
  });
}

function cellXY(g, row, col) {
  return { xM: g.nwXM + (col + 0.5) * g.cellSizeM, yM: g.nwYM - (row + 0.5) * g.cellSizeM };
}

function isBorder(g, row, col) {
  return row === 0 || col === 0 || row === g.rows - 1 || col === g.cols - 1;
}

function hasUnknownNeighbour(g, row, col) {
  for (const [dr, dc] of NEIGH8) {
    const r = row + dr, c = col + dc;
    if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue; // kenar ayrı ele alınır
    if (!g.known[r * g.cols + c]) return true;
  }
  return false;
}

/** Tip-7 (doğrusal ara değer) yüzdelik; `sorted` artan sıralı ve boş değildir. */
function percentileSorted(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

// Çıktılar ağaç biçimindedir (döngü yok); önceden donmuş alt nesneler de özyinelemede atlanmaz.
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function requireNonNegativeParam(value, name) {
  if (value === undefined) throw new TypeError(`${name} zorunlu senaryo parametresi (varsayılan yok)`);
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} sonlu ve ≥ 0 olmalı`);
  return value;
}

/** Bilinen hücrelerin kot istatistikleri. Bilinmeyen hücreler sayılır ama değerlere girmez. */
export function elevationStats(grid) {
  const g = normalizeGrid(grid);
  const base = {
    schema: RELIEF_METRICS_SCHEMA,
    kind: 'elevation',
    cellCount: g.n,
    validCount: g.knownCount,
    unknownCount: g.unknownCount,
    unknownFraction: g.n > 0 ? g.unknownCount / g.n : 0,
    percentileMethod: 'tip-7 (doğrusal ara değer), yalnız bilinen hücreler',
  };
  if (g.knownCount === 0) {
    return deepFreeze({ ...base, minM: null, maxM: null, rangeM: null, p1M: null, p50M: null, p99M: null, p1p99RangeM: null });
  }
  const vals = new Float64Array(g.knownCount);
  let k = 0;
  for (let i = 0; i < g.n; i++) if (g.known[i]) vals[k++] = g.z[i];
  vals.sort();
  const minM = vals[0];
  const maxM = vals[vals.length - 1];
  const p1M = percentileSorted(vals, 0.01);
  const p50M = percentileSorted(vals, 0.5);
  const p99M = percentileSorted(vals, 0.99);
  return deepFreeze({ ...base, minM, maxM, rangeM: maxM - minM, p1M, p50M, p99M, p1p99RangeM: p99M - p1M });
}

/** Horn eğim alanı (derece). Hesaplanamayan hücreler NaN kalır; 0'a çevrilmez. */
export function slopeFieldDeg(grid) {
  return slopeFromNormalized(normalizeGrid(grid));
}

function slopeFromNormalized(g) {
  const out = new Float64Array(g.n).fill(NaN);
  const z9 = new Float64Array(9);
  for (let r = 1; r < g.rows - 1; r++) {
    for (let c = 1; c < g.cols - 1; c++) {
      let complete = true;
      let k = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const i = (r + dr) * g.cols + (c + dc);
          if (!g.known[i]) complete = false;
          z9[k++] = g.z[i];
        }
      }
      if (!complete) continue;
      const h = horn3x3Gradient(z9, g.cellSizeM);
      if (h) out[r * g.cols + c] = h.slopeDeg;
    }
  }
  return out;
}

/** Eğim istatistikleri (P50/P90/P99/max). Hesaplanamayan hücreler ayrı sayılır. */
export function slopeStats(grid) {
  const g = normalizeGrid(grid);
  const slope = slopeFromNormalized(g);
  let computed = 0;
  for (let i = 0; i < g.n; i++) if (Number.isFinite(slope[i])) computed++;
  const vals = new Float64Array(computed);
  let k = 0;
  for (let i = 0; i < g.n; i++) if (Number.isFinite(slope[i])) vals[k++] = slope[i];
  const base = {
    schema: RELIEF_METRICS_SCHEMA,
    kind: 'slope',
    method: 'Horn 3x3 (geo.horn3x3Gradient); kenar ve bilinmeyen komşulu hücreler hesaplanmaz',
    cellSizeM: g.cellSizeM,
    computedCount: computed,
    uncomputedKnownCount: g.knownCount - computed,
    unknownCount: g.unknownCount,
    percentileMethod: 'tip-7 (doğrusal ara değer)',
  };
  if (computed === 0) return deepFreeze({ ...base, p50Deg: null, p90Deg: null, p99Deg: null, maxDeg: null });
  vals.sort();
  return deepFreeze({
    ...base,
    p50Deg: percentileSorted(vals, 0.5),
    p90Deg: percentileSorted(vals, 0.9),
    p99Deg: percentileSorted(vals, 0.99),
    maxDeg: vals[vals.length - 1],
  });
}

/**
 * Priority-flood: her bilinen hücrenin "su seviyesini" döndürür (dolu yüzey). Çıkış hücreleri
 * (pencere kenarı veya bilinmeyen komşusu olan bilinen hücre) z değeriyle başlar. Derinlik = filled - z.
 */
function fillDepressions(g, z) {
  const { rows, cols, n, known } = g;
  const filled = new Float64Array(n).fill(NaN);
  const seen = new Uint8Array(n);
  const heapKey = new Float64Array(n);
  const heapIdx = new Int32Array(n);
  let size = 0;
  let popKey = 0;

  const less = (ka, ia, kb, ib) => ka < kb || (ka === kb && ia < ib);
  const push = (key, idx) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(key, idx, heapKey[p], heapIdx[p])) break;
      heapKey[i] = heapKey[p];
      heapIdx[i] = heapIdx[p];
      i = p;
    }
    heapKey[i] = key;
    heapIdx[i] = idx;
  };
  const pop = () => {
    const top = heapIdx[0];
    popKey = heapKey[0];
    size--;
    if (size > 0) {
      const key = heapKey[size];
      const idx = heapIdx[size];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= size) break;
        if (c + 1 < size && less(heapKey[c + 1], heapIdx[c + 1], heapKey[c], heapIdx[c])) c++;
        if (!less(heapKey[c], heapIdx[c], key, idx)) break;
        heapKey[i] = heapKey[c];
        heapIdx[i] = heapIdx[c];
        i = c;
      }
      heapKey[i] = key;
      heapIdx[i] = idx;
    }
    return top;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!known[i]) continue;
      if (isBorder(g, r, c) || hasUnknownNeighbour(g, r, c)) {
        filled[i] = z[i];
        seen[i] = 1;
        push(z[i], i);
      }
    }
  }
  while (size > 0) {
    const i = pop();
    const level = popKey;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    for (const [dr, dc] of NEIGH8) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      if (!known[j] || seen[j]) continue;
      seen[j] = 1;
      const f = z[j] > level ? z[j] : level;
      filled[j] = f;
      push(f, j);
    }
  }
  return filled;
}

/**
 * Kapalı-olmayan ve kapalı tüm "göllerin" (aynı taşma seviyesine sahip bağlı derin hücreler) ham
 * listesi. `z` bilinmeyen hücrelerde NaN olmalıdır. Döner: { levelZ, extremeZ, extremeIndex,
 * cellCount, depth, leaksToEdge, touchesUnknown, spillIntoUnknown }.
 */
function analyzeBasins(g, z) {
  const { rows, cols, n, known } = g;
  const filled = fillDepressions(g, z);
  const labelled = new Int32Array(n).fill(-1);
  const rimSeen = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const lakes = [];

  for (let i = 0; i < n; i++) {
    if (!known[i] || labelled[i] >= 0 || !(filled[i] > z[i])) continue;
    const id = lakes.length;
    const level = filled[i];
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    labelled[i] = id;
    let extremeZ = Infinity;
    let extremeIndex = -1;
    let lakeOnEdge = false;
    let lakeTouchesUnknown = false;
    while (head < tail) {
      const k = queue[head++];
      const r = (k / cols) | 0;
      const c = k - r * cols;
      // En alçak hücre; eşitlikte satır-sütun (doğrusal indeks) sırası kazanır.
      if (z[k] < extremeZ || (z[k] === extremeZ && k < extremeIndex)) {
        extremeZ = z[k];
        extremeIndex = k;
      }
      if (isBorder(g, r, c)) lakeOnEdge = true;
      if (hasUnknownNeighbour(g, r, c)) lakeTouchesUnknown = true;
      for (const [dr, dc] of NEIGH8) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (!known[j] || labelled[j] >= 0) continue;
        if (filled[j] === level && filled[j] > z[j]) {
          labelled[j] = id;
          queue[tail++] = j;
        }
      }
    }

    // Taşma (rim) analizi: rim hücreleri derinliği 0 olan komşulardır; taşma noktası filled === level.
    let spillOnEdge = false;
    let spillIntoUnknown = false;
    let rimTouchesUnknown = lakeTouchesUnknown;
    for (let q = 0; q < tail; q++) {
      const k = queue[q];
      const r = (k / cols) | 0;
      const c = k - r * cols;
      for (const [dr, dc] of NEIGH8) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (!known[j] || labelled[j] === id || rimSeen[j] === id) continue;
        rimSeen[j] = id;
        const unk = hasUnknownNeighbour(g, rr, cc);
        if (unk) rimTouchesUnknown = true;
        if (filled[j] === level) {
          if (isBorder(g, rr, cc)) spillOnEdge = true;
          if (unk) spillIntoUnknown = true;
        }
      }
    }

    lakes.push({
      levelZ: level,
      extremeZ,
      extremeIndex,
      cellCount: tail,
      depth: level - extremeZ,
      leaksToEdge: lakeOnEdge || spillOnEdge,
      touchesUnknown: rimTouchesUnknown,
      spillIntoUnknown,
    });
  }
  return lakes;
}

function basinRecord(g, lake) {
  const row = (lake.extremeIndex / g.cols) | 0;
  const col = lake.extremeIndex - row * g.cols;
  const { xM, yM } = cellXY(g, row, col);
  return {
    row, col, xM, yM,
    cellCount: lake.cellCount,
    areaM2: lake.cellCount * g.cellSizeM * g.cellSizeM,
    noDataTemasi: lake.touchesUnknown,
    spillIntoUnknown: lake.spillIntoUnknown,
  };
}

const ALT_SINIR_NOTE_TR =
  'ALT SINIR: havza bilinmeyen (no-data) hücrelere değiyor; bilinmeyen tarafın kotu bilinmediği için ' +
  'derinlik kesin değildir, yalnız bilinen hücrelerden ölçülmüş değer olarak okunmalıdır.';

function compareRanked(valueKey) {
  return (a, b) => (b[valueKey] - a[valueKey]) || (a.row - b.row) || (a.col - b.col);
}

/**
 * Kenara sızmayan kapalı çukurlar (derinlik ≥ minDepthM). `minDepthM` zorunlu senaryo parametresidir.
 * Sıralama: derinlik azalan, eşitlikte satır, sonra sütun artan.
 */
export function findDepressions(grid, options) {
  const minDepthM = requireNonNegativeParam(options?.minDepthM, 'minDepthM');
  const g = normalizeGrid(grid);
  const lakes = analyzeBasins(g, g.z);
  const closedAll = lakes.filter((l) => !l.leaksToEdge);
  const basins = closedAll
    .filter((l) => l.depth >= minDepthM)
    .map((l) => ({
      ...basinRecord(g, l),
      minElevationM: l.extremeZ,
      spillElevationM: l.levelZ,
      depthM: l.depth,
      depthNote: l.touchesUnknown ? ALT_SINIR_NOTE_TR : null,
    }))
    .sort(compareRanked('depthM'));
  return deepFreeze({
    schema: RELIEF_METRICS_SCHEMA,
    kind: 'depression',
    scenarioParameter: { name: 'minDepthM', valueM: minDepthM, note: 'senaryo parametresi; kaynaklı eşik değildir' },
    method: 'priority-flood, 8 komşu; kenar ve bilinmeyen komşu çıkış kabul edilir; kenara sızan havza listelenmez',
    counts: {
      totalBasins: lakes.length,
      closedBasins: closedAll.length,
      edgeLeakingBasins: lakes.length - closedAll.length,
      closedAboveThreshold: basins.length,
      closedAboveThresholdTouchingUnknown: basins.filter((b) => b.noDataTemasi).length,
    },
    basins: Object.freeze(basins),
  });
}

/**
 * Tepe belirginliği (aynı yöntem, -z üzerinde). `minProminenceM` zorunlu senaryo parametresidir.
 * Belirginlik = tepe kotu - en düşük geçit kotu (taşma seviyesi). Sıralama: belirginlik azalan.
 */
export function findSummits(grid, options) {
  const minProminenceM = requireNonNegativeParam(options?.minProminenceM, 'minProminenceM');
  const g = normalizeGrid(grid);
  const negZ = new Float64Array(g.n).fill(NaN);
  for (let i = 0; i < g.n; i++) if (g.known[i]) negZ[i] = -g.z[i];
  const lakes = analyzeBasins(g, negZ);
  const closedAll = lakes.filter((l) => !l.leaksToEdge);
  const summits = closedAll
    .filter((l) => l.depth >= minProminenceM)
    .map((l) => ({
      ...basinRecord(g, l),
      peakElevationM: -l.extremeZ,
      baseElevationM: -l.levelZ,
      prominenceM: l.depth,
      depthNote: l.touchesUnknown ? ALT_SINIR_NOTE_TR : null,
    }))
    .sort(compareRanked('prominenceM'));
  return deepFreeze({
    schema: RELIEF_METRICS_SCHEMA,
    kind: 'summit',
    scenarioParameter: { name: 'minProminenceM', valueM: minProminenceM, note: 'senaryo parametresi; kaynaklı eşik değildir' },
    method: 'priority-flood -z üzerinde, 8 komşu; kenara sızan tepe listelenmez',
    counts: {
      totalHills: lakes.length,
      closedHills: closedAll.length,
      edgeLeakingHills: lakes.length - closedAll.length,
      closedAboveThreshold: summits.length,
      closedAboveThresholdTouchingUnknown: summits.filter((s) => s.noDataTemasi).length,
    },
    summits: Object.freeze(summits),
  });
}
