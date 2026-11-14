// 23B — A* rota planlayıcı motoru. Saf modül: DOM, ağ, dosya ve global durum yok.
// Maliyet alanı (CostField, 23A) sözleşmesini tüketir; cost-model.js'e bağımlı DEĞİLDİR.
//
// CostField: { schema:'marswalk.cost-field.v1', rows, cols, cellSizeM, cost: Float32Array(rows*cols), score?, status?, slopeDeg? }
//   idx = row*cols + col; row 0 = kuzey, col 0 = batı.
//   cost[i]: metre başına seyahat çarpanı; sonlu >= 1 geçilebilir, Infinity geçilemez.
//
// Adım maliyeti: mesafe(merkezler) * (cost[a] + cost[b]) / 2 (metre-eşdeğeri).
// Sezgisel: oktil mesafe * (alandaki gerçek en küçük geçilebilir çarpan). Her adım >= minCost*mesafe olduğundan
// h kabul edilebilir (admissible) ve tutarlıdır (consistent).

export const PATHFINDER_VERSION = '1.0.0';
export const COST_FIELD_SCHEMA = 'marswalk.cost-field.v1';

const SQRT2 = Math.SQRT2;
const GEOM_EPS = 1e-9; // kapalı supercover toleransı (muhafazakâr: köşeye değen hücre de "dokunulmuş" sayılır)
const AUTO_HIER_CELLS = 1_000_000;
const SMOOTH_WINDOW = 96; // yol indeksi cinsinden en uzak görüş hattı denemesi
// Komşu sırası sabit (determinizm): önce ortogonal, sonra çapraz.
const DR = [-1, 0, 0, 1, -1, -1, 1, 1];
const DC = [0, -1, 1, 0, -1, 1, -1, 1];

// ---------------------------------------------------------------------------------------------
// Doğrulama

function validateField(field) {
  if (!field || typeof field !== 'object') return { ok: false, reason: 'field eksik veya nesne değil' };
  if (field.schema !== undefined && field.schema !== COST_FIELD_SCHEMA) {
    return { ok: false, reason: `Bilinmeyen field.schema: ${String(field.schema)}` };
  }
  const { rows, cols, cellSizeM, cost } = field;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return { ok: false, reason: 'rows/cols pozitif tam sayı olmalı' };
  }
  const n = rows * cols;
  if (!Number.isSafeInteger(n) || n > 0x7fffffff) return { ok: false, reason: 'rows*cols Int32 sınırını aşıyor' };
  if (!Number.isFinite(cellSizeM) || cellSizeM <= 0) return { ok: false, reason: 'cellSizeM sonlu ve pozitif olmalı' };
  if (!(cost instanceof Float32Array || cost instanceof Float64Array) || cost.length !== n) {
    return { ok: false, reason: 'cost, rows*cols uzunluğunda Float32Array olmalı' };
  }
  for (const key of ['score', 'status', 'slopeDeg']) {
    const a = field[key];
    if (a !== undefined && a !== null && (!ArrayBuffer.isView(a) || a.length !== n)) {
      return { ok: false, reason: `${key} verilmişse rows*cols uzunluğunda typed array olmalı` };
    }
  }
  let minCost = Infinity, maxFinite = 1;
  for (let i = 0; i < n; i++) {
    const v = cost[i];
    if (v === Infinity) continue;
    // NaN, -Infinity, <1 ve negatif değerler sessizce düzeltilmez.
    if (!(v >= 1) || !Number.isFinite(v)) {
      return { ok: false, reason: `cost[${i}]=${v} geçersiz: Infinity veya sonlu >= 1 olmalı` };
    }
    if (v < minCost) minCost = v;
    if (v > maxFinite) maxFinite = v;
  }
  // Taşma koruması: en kötü birikimli g üst sınırı = cellSizeM * 2 * maxCost * (hücre sayısı). Sonlu olmalı;
  // aksi halde adım maliyetleri Infinity'ye taşar ve sahte "no_path" üretirdi.
  const gBound = cellSizeM * 2 * maxFinite * n;
  if (!Number.isFinite(gBound)) {
    return { ok: false, reason: `cellSizeM*2*maxCost*rows*cols=${gBound} sonlu değil (cellSizeM=${cellSizeM}, maxCost=${maxFinite}); maliyet birikimi taşar` };
  }
  return { ok: true, rows, cols, cellSizeM, cost, n, minCost };
}

const isPlainObject = (o) => {
  if (o === null || typeof o !== 'object' || Array.isArray(o) || ArrayBuffer.isView(o)) return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;
};

// budget/options: undefined veya düz nesne; bilinmeyen anahtar, yanlış tip/aralık -> invalid_input (sessiz varsayılan yok).
function validateBudget(budget) {
  if (budget === undefined) return { ok: true, maxExpansions: undefined, maxMs: undefined };
  if (!isPlainObject(budget)) return { ok: false, reason: 'budget undefined veya düz nesne olmalı' };
  for (const key of Object.keys(budget)) {
    if (key !== 'maxExpansions' && key !== 'maxMs') return { ok: false, reason: `Bilinmeyen budget anahtarı: ${key}` };
  }
  const { maxExpansions, maxMs } = budget;
  if (maxExpansions !== undefined && !(Number.isInteger(maxExpansions) && maxExpansions > 0)) {
    return { ok: false, reason: 'budget.maxExpansions pozitif sonlu tam sayı olmalı' };
  }
  if (maxMs !== undefined && !(typeof maxMs === 'number' && Number.isFinite(maxMs) && maxMs > 0)) {
    return { ok: false, reason: 'budget.maxMs pozitif sonlu sayı olmalı' };
  }
  return { ok: true, maxExpansions, maxMs };
}

function validateOptions(options) {
  const out = { smooth: false, hierarchical: false, coarseFactor: 8, corridorCells: 2 };
  if (options === undefined) return { ok: true, ...out };
  if (!isPlainObject(options)) return { ok: false, reason: 'options undefined veya düz nesne olmalı' };
  for (const key of Object.keys(options)) {
    if (!(key in out)) return { ok: false, reason: `Bilinmeyen options anahtarı: ${key}` };
  }
  const { smooth, hierarchical, coarseFactor, corridorCells } = options;
  if (smooth !== undefined && typeof smooth !== 'boolean') return { ok: false, reason: 'options.smooth boolean olmalı' };
  if (hierarchical !== undefined && typeof hierarchical !== 'boolean' && hierarchical !== 'auto') {
    return { ok: false, reason: "options.hierarchical true, false veya 'auto' olmalı" };
  }
  if (coarseFactor !== undefined && !(Number.isInteger(coarseFactor) && coarseFactor >= 2)) {
    return { ok: false, reason: 'options.coarseFactor tam sayı >= 2 olmalı' };
  }
  if (corridorCells !== undefined && !(Number.isInteger(corridorCells) && corridorCells >= 1)) {
    return { ok: false, reason: 'options.corridorCells tam sayı >= 1 olmalı' };
  }
  return {
    ok: true,
    smooth: smooth ?? out.smooth, hierarchical: hierarchical ?? out.hierarchical,
    coarseFactor: coarseFactor ?? out.coarseFactor, corridorCells: corridorCells ?? out.corridorCells,
  };
}

function validCell(p, rows, cols) {
  return !!p && typeof p === 'object' && Number.isInteger(p.row) && Number.isInteger(p.col) &&
    p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols;
}

// ---------------------------------------------------------------------------------------------
// Çekirdek A* (indeksli ikili yığın, typed array)

function allocBufs(n) {
  return {
    used: false,
    g: new Float64Array(n).fill(Infinity), f: new Float64Array(n), parent: new Int32Array(n).fill(-1),
    closed: new Uint8Array(n), pos: new Int32Array(n).fill(-1), heap: new Int32Array(n),
  };
}

// bufs verilirse (aynı boyut) yeniden kullanılır: hiyerarşik -> tam arama geri dönüşünde çift büyük tahsis olmaz.
function astarCore({ rows, cols, cost, cell, start, goal, hMin, maxExp, deadline, mask, bufs }) {
  const n = rows * cols;
  const b = bufs ?? allocBufs(n);
  if (b.used) { b.g.fill(Infinity); b.parent.fill(-1); b.closed.fill(0); b.pos.fill(-1); }
  b.used = true;
  const { g, f, parent, closed, pos, heap } = b;
  let size = 0;
  const gr = (goal / cols) | 0;
  const gc = goal - gr * cols;
  const hScale = hMin * cell;
  const hOf = (idx) => {
    const r = (idx / cols) | 0;
    const dr = Math.abs(r - gr);
    const dc = Math.abs(idx - r * cols - gc);
    return hScale * (dr > dc ? dr - dc + SQRT2 * dc : dc - dr + SQRT2 * dr);
  };
  // Tie-break: küçük f, sonra büyük g, sonra küçük indeks.
  const less = (a, b) => {
    const fa = f[a], fb = f[b];
    if (fa !== fb) return fa < fb;
    const ga = g[a], gb = g[b];
    if (ga !== gb) return ga > gb;
    return a < b;
  };
  const siftUp = (i) => {
    const x = heap[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      const y = heap[p];
      if (!less(x, y)) break;
      heap[i] = y; pos[y] = i; i = p;
    }
    heap[i] = x; pos[x] = i;
  };
  const siftDown = (i) => {
    const x = heap[i];
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) break;
      const r = l + 1;
      const c = (r < size && less(heap[r], heap[l])) ? r : l;
      if (!less(heap[c], x)) break;
      heap[i] = heap[c]; pos[heap[i]] = i; i = c;
    }
    heap[i] = x; pos[x] = i;
  };

  g[start] = 0; f[start] = hOf(start);
  heap[0] = start; pos[start] = 0; size = 1;
  let expanded = 0, bestH = f[start], bestIdx = start; // f[start] = h(start): hiçbir genişletme olmasa da sonlu

  while (size > 0) {
    const cur = heap[0];
    pos[cur] = -1;
    size--;
    if (size > 0) { heap[0] = heap[size]; siftDown(0); }
    closed[cur] = 1;
    if (cur === goal) {
      let len = 0;
      for (let p = cur; p !== -1; p = parent[p]) len++;
      const path = new Int32Array(len);
      for (let p = cur, k = len - 1; p !== -1; p = parent[p], k--) path[k] = p;
      return { status: 'found', path, expanded, cost: g[cur] };
    }
    if (expanded >= maxExp) return { status: 'budget', expanded, bestIdx, bestH };
    if ((expanded & 511) === 0 && deadline !== Infinity && performance.now() > deadline) {
      return { status: 'time', expanded, bestIdx, bestH };
    }
    expanded++;
    const hc = hOf(cur);
    if (hc < bestH) { bestH = hc; bestIdx = cur; }
    const r = (cur / cols) | 0;
    const c = cur - r * cols;
    const cc = cost[cur];
    const gCur = g[cur];
    for (let k = 0; k < 8; k++) {
      const nr = r + DR[k], nc = c + DC[k];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const ni = nr * cols + nc;
      const cn = cost[ni];
      if (cn === Infinity || closed[ni] === 1) continue;
      if (mask !== null && mask.data[((nr / mask.k) | 0) * mask.ccols + ((nc / mask.k) | 0)] === 0) continue;
      let step;
      if (k >= 4) {
        // Köşe kesmek yasak: iki ortogonal komşu da geçilebilir olmalı.
        if (cost[r * cols + nc] === Infinity || cost[nr * cols + c] === Infinity) continue;
        step = SQRT2 * cell * (cc + cn) * 0.5;
      } else {
        step = cell * (cc + cn) * 0.5;
      }
      const ng = gCur + step;
      if (ng < g[ni]) {
        g[ni] = ng; f[ni] = ng + hOf(ni); parent[ni] = cur;
        if (pos[ni] >= 0) siftUp(pos[ni]);
        else { heap[size] = ni; pos[ni] = size; size++; siftUp(size - 1); }
      }
    }
  }
  return { status: 'none', expanded };
}

// ---------------------------------------------------------------------------------------------
// Doğru-segment gezgini: iki hücre merkezi arasındaki kapalı supercover (GEOM_EPS ile genişletilmiş).
// visit(idx, lenCells): lenCells = segmentin hücre içinde kalan gerçek uzunluğu (hücre birimi; köşe temaslarında 0).

function traceSegment(cols, r0, c0, r1, c1, visit) {
  const ax = c0 + 0.5, ay = r0 + 0.5, dx = c1 - c0, dy = r1 - r0;
  const L = Math.hypot(dx, dy);
  if (L === 0) { visit(r0 * cols + c0, 0); return 0; }
  const xMajor = Math.abs(dx) >= Math.abs(dy);
  const a0 = xMajor ? ax : ay, b0 = xMajor ? ay : ax;
  const da = xMajor ? dx : dy, db = xMajor ? dy : dx;
  const mA = xMajor ? c0 : r0, mB = xMajor ? c1 : r1;
  const mLo = Math.min(mA, mB), mHi = Math.max(mA, mB);
  for (let m = mLo; m <= mHi; m++) {
    let ta = (m - GEOM_EPS - a0) / da, tb = (m + 1 + GEOM_EPS - a0) / da;
    let t0 = Math.max(0, Math.min(ta, tb)), t1 = Math.min(1, Math.max(ta, tb));
    const v0 = b0 + db * t0, v1 = b0 + db * t1;
    const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
    const qLo = Math.ceil(lo - GEOM_EPS) - 1, qHi = Math.floor(hi + GEOM_EPS);
    // Gerçek (eps'siz) majör dilim
    ta = (m - a0) / da; tb = (m + 1 - a0) / da;
    const s0 = Math.max(0, Math.min(ta, tb)), s1 = Math.min(1, Math.max(ta, tb));
    for (let q = qLo; q <= qHi; q++) {
      let u0 = s0, u1 = s1;
      if (db === 0) {
        if (b0 < q || b0 > q + 1) { u1 = u0; }
      } else {
        const qa = (q - b0) / db, qb = (q + 1 - b0) / db;
        u0 = Math.max(u0, Math.min(qa, qb)); u1 = Math.min(u1, Math.max(qa, qb));
      }
      const len = u1 > u0 ? (u1 - u0) * L : 0;
      visit(xMajor ? q * cols + m : m * cols + q, len);
    }
  }
  return L;
}

// Bağımsız doğrulayıcı: segment ile her hücrenin kapalı karesinin (±eps) kesişimini slab testiyle bulur.
// traceSegment'ten farklı bir yöntem (sınırlayıcı kutudaki tüm hücreler taranır).
function countImpassableCrossings(field, segs) {
  const { rows, cols, cost } = field;
  let bad = 0;
  for (const [pa, pb] of segs) {
    const ax = pa.col + 0.5, ay = pa.row + 0.5, dx = pb.col - pa.col, dy = pb.row - pa.row;
    const rLo = Math.min(pa.row, pb.row), rHi = Math.max(pa.row, pb.row);
    const cLo = Math.min(pa.col, pb.col), cHi = Math.max(pa.col, pb.col);
    for (let r = rLo; r <= rHi; r++) {
      for (let c = cLo; c <= cHi; c++) {
        if (cost[r * cols + c] !== Infinity) continue;
        let t0 = 0, t1 = 1, hit = true;
        for (const [o, d, lo] of [[ax, dx, c], [ay, dy, r]]) {
          const mn = lo - GEOM_EPS, mx = lo + 1 + GEOM_EPS;
          if (d === 0) { if (o < mn || o > mx) { hit = false; break; } continue; }
          let u = (mn - o) / d, v = (mx - o) / d;
          if (u > v) { const x = u; u = v; v = x; }
          if (u > t0) t0 = u;
          if (v < t1) t1 = v;
          if (t0 > t1) { hit = false; break; }
        }
        if (hit) bad++;
      }
    }
  }
  void rows;
  return bad;
}

// ---------------------------------------------------------------------------------------------
// Yardımcılar

function stepCost(field, a, b) {
  const { cols, cost, cellSizeM } = field;
  const ra = (a / cols) | 0, rb = (b / cols) | 0;
  const diag = ra !== rb && (a - ra * cols) !== (b - rb * cols);
  return (diag ? SQRT2 : 1) * cellSizeM * (cost[a] + cost[b]) * 0.5;
}

function lineCost(field, a, b) {
  // Düz segment maliyeti: segment boyunca hücre içi uzunluk ağırlıklı çarpan * metre. Geçilemez hücre -> blocked.
  const { cols, cost, cellSizeM } = field;
  const ra = (a / cols) | 0, rb = (b / cols) | 0;
  let blocked = false, acc = 0, sum = 0;
  const L = traceSegment(cols, ra, a - ra * cols, rb, b - rb * cols, (idx, len) => {
    const v = cost[idx];
    if (v === Infinity) blocked = true;
    else { acc += len * v; sum += len; }
  });
  if (blocked) return { blocked: true, cost: Infinity };
  return { blocked: false, cost: sum > 0 ? cellSizeM * L * (acc / sum) : 0 };
}

function segmentCost(field, a, b) {
  const { cols } = field;
  const ra = (a / cols) | 0, rb = (b / cols) | 0;
  const ca = a - ra * cols, cb = b - rb * cols;
  if (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1) return stepCost(field, a, b);
  return lineCost(field, a, b).cost;
}

function smoothPath(field, path) {
  const m = path.length;
  if (m < 3) return path;
  const pre = new Float64Array(m);
  for (let i = 1; i < m; i++) pre[i] = pre[i - 1] + stepCost(field, path[i - 1], path[i]);
  const out = [path[0]];
  let i = 0;
  while (i < m - 1) {
    let best = i + 1;
    const jMax = Math.min(m - 1, i + SMOOTH_WINDOW);
    for (let j = i + 2; j <= jMax; j++) {
      const lc = lineCost(field, path[i], path[j]);
      if (lc.blocked) continue;
      const run = pre[j] - pre[i];
      if (lc.cost <= run * (1 + 1e-12)) best = j; // yalnız maliyeti artırmayan yer değiştirmeler
    }
    out.push(path[best]);
    i = best;
  }
  return Int32Array.from(out);
}

function buildCoarse(field, k) {
  // Kaba hücre geçilebilir <=> içinde en az bir geçilebilir ince hücre var.
  // Kaba maliyet = geçilebilir ince hücrelerin ORTALAMASI (min değil: "ucuz tek hücre" yüzünden
  // engebeli bölgenin ucuz görünmesini sınırlar). Ortalama kabul edilebilir değildir -> yaklaşık-optimal.
  const { rows, cols, cost } = field;
  const crows = Math.ceil(rows / k), ccols = Math.ceil(cols / k);
  const sum = new Float64Array(crows * ccols);
  const cnt = new Int32Array(crows * ccols);
  for (let r = 0; r < rows; r++) {
    const cr = ((r / k) | 0) * ccols;
    for (let c = 0; c < cols; c++) {
      const v = cost[r * cols + c];
      if (v === Infinity) continue;
      const ci = cr + ((c / k) | 0);
      sum[ci] += v; cnt[ci]++;
    }
  }
  const ccost = new Float32Array(crows * ccols);
  let minCost = Infinity;
  for (let i = 0; i < ccost.length; i++) {
    if (cnt[i] === 0) ccost[i] = Infinity;
    else {
      const v = Math.max(1, sum[i] / cnt[i]);
      ccost[i] = v;
      if (ccost[i] < minCost) minCost = ccost[i];
    }
  }
  return { rows: crows, cols: ccols, cost: ccost, cellSizeM: field.cellSizeM * k, minCost: Math.fround(minCost) };
}

function deepFreeze(o) {
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
  if (ArrayBuffer.isView(o)) return o;
  Object.freeze(o);
  for (const key of Object.keys(o)) deepFreeze(o[key]);
  return o;
}

const emptyStats = (expanded = 0, elapsedMs = 0) => ({
  lengthM: 0, totalCost: 0, cellsExpanded: expanded, elapsedMs, maxCost: 0, meanCost: 0, impassableCrossings: 0,
  gridCost: 0, costMetric: 'grid_step', smoothingGain: 0,
});

function failure(status, reason, expanded, t0, algo) {
  return deepFreeze({
    status, reason, path: [], stats: emptyStats(expanded, performance.now() - t0), segments: [],
    algorithm: { name: 'astar-8n', hierarchical: false, smoothed: false, version: PATHFINDER_VERSION, optimality: 'none', ...algo },
  });
}

// ---------------------------------------------------------------------------------------------
// Genel API

export function planRoute(args) {
  const t0 = performance.now();
  try {
    return planRouteImpl(args, t0);
  } catch (err) {
    // Düşmanca girdi (fırlatan getter, bellek tahsis hatası...) asla istisna olarak sızmaz; yeni durum eklenmez.
    let msg;
    try { msg = String(err && err.message ? err.message : err); } catch { msg = 'açıklanamayan hata'; }
    return failure('invalid_input', `beklenmeyen hata: ${msg}`, 0, t0);
  }
}

function planRouteImpl(args, t0) {
  if (!args || typeof args !== 'object') return failure('invalid_input', 'planRoute argümanı nesne olmalı', 0, t0);
  const { field, start, end } = args;
  const bv = validateBudget(args.budget);
  if (!bv.ok) return failure('invalid_input', bv.reason, 0, t0);
  const opt = validateOptions(args.options);
  if (!opt.ok) return failure('invalid_input', opt.reason, 0, t0);
  const budget = { maxExpansions: bv.maxExpansions, maxMs: bv.maxMs };
  const v = validateField(field);
  if (!v.ok) return failure('invalid_input', v.reason, 0, t0);
  const { rows, cols, n, cost, minCost } = v;
  const cell = v.cellSizeM;
  if (!validCell(start, rows, cols)) return failure('invalid_input', 'start {row,col} tam sayı ve alan içinde olmalı', 0, t0);
  if (!validCell(end, rows, cols)) return failure('invalid_input', 'end {row,col} tam sayı ve alan içinde olmalı', 0, t0);
  const maxExpIn = budget.maxExpansions;
  const s = start.row * cols + start.col;
  const e = end.row * cols + end.col;
  if (cost[s] === Infinity) return failure('start_blocked', `Başlangıç hücresi (${start.row},${start.col}) geçilemez`, 0, t0);
  if (cost[e] === Infinity) return failure('end_blocked', `Hedef hücresi (${end.row},${end.col}) geçilemez`, 0, t0);

  const field2 = { rows, cols, cost, cellSizeM: cell };
  const deadline = budget.maxMs !== undefined ? t0 + budget.maxMs : Infinity;
  let remaining = maxExpIn !== undefined ? maxExpIn : 2 * n + 1000; // A* hücre başına en fazla 1 genişletme yapar
  let expandedTotal = 0;
  const notes = [];

  const wantHier = opt.hierarchical === true || (opt.hierarchical === 'auto' && n > AUTO_HIER_CELLS);
  let cellPath = null;
  let usedHier = false;
  let fineBufs = null; // maskeli ince arama ve tam arama geri dönüşü aynı tamponları paylaşır

  // gridCols: bestIdx'in ait olduğu ızgaranın sütun sayısı (kaba aramada kaba ızgara). k: kaba çarpan (ince arama için 1).
  const interrupted = (res, gridCols, k) => {
    const bi = res.bestIdx;
    const br = (bi / gridCols) | 0;
    const bc = bi - br * gridCols;
    const why = res.status === 'time' ? `süre bütçesi (${budget.maxMs} ms)` : `genişletme bütçesi (${maxExpIn})`;
    const where = k > 1
      ? `kaba ızgarada (k=${k}) en yakın sınır hücresi (${br},${bc}) ≈ ince (${br * k},${bc * k})`
      : `hedefe en yakın sınır hücresi (${br},${bc})`;
    return failure('budget_exceeded',
      `${why} aşıldı; ${expandedTotal} hücre genişletildi, ${where}, ` +
      `kalan oktil alt sınır ${(res.bestH).toFixed(1)} m. Yol bulunamadı (sahte yol üretilmedi).`, expandedTotal, t0);
  };

  if (wantHier && s !== e) {
    const k = opt.coarseFactor;
    const corr = opt.corridorCells;
    if (k >= Math.min(rows, cols)) {
      notes.push('hiyerarşik istendi ama coarseFactor alan boyutundan büyük; tam arama kullanıldı');
    } else {
      const coarse = buildCoarse(field2, k);
      const cs = ((start.row / k) | 0) * coarse.cols + ((start.col / k) | 0);
      const ce = ((end.row / k) | 0) * coarse.cols + ((end.col / k) | 0);
      const cres = astarCore({
        rows: coarse.rows, cols: coarse.cols, cost: coarse.cost, cell: coarse.cellSizeM, start: cs, goal: ce,
        hMin: coarse.minCost, maxExp: remaining, deadline, mask: null,
      });
      expandedTotal += cres.expanded; remaining -= cres.expanded;
      if (cres.status === 'budget' || cres.status === 'time') return interrupted(cres, coarse.cols, k);
      if (cres.status === 'found') {
        const data = new Uint8Array(coarse.rows * coarse.cols);
        for (const ci of cres.path) {
          const cr = (ci / coarse.cols) | 0, cc = ci - cr * coarse.cols;
          for (let r = Math.max(0, cr - corr); r <= Math.min(coarse.rows - 1, cr + corr); r++) {
            for (let c = Math.max(0, cc - corr); c <= Math.min(coarse.cols - 1, cc + corr); c++) data[r * coarse.cols + c] = 1;
          }
        }
        fineBufs = allocBufs(n);
        const fres = astarCore({
          rows, cols, cost, cell, start: s, goal: e, hMin: minCost, maxExp: remaining, deadline,
          mask: { data, k, ccols: coarse.cols }, bufs: fineBufs,
        });
        expandedTotal += fres.expanded; remaining -= fres.expanded;
        if (fres.status === 'budget' || fres.status === 'time') return interrupted(fres, cols, 1);
        if (fres.status === 'found') { cellPath = fres.path; usedHier = true; }
        else notes.push('koridor içinde yol bulunamadı; tam ızgara aramasına geri dönüldü');
      } else {
        notes.push('kaba ızgarada yol bulunamadı; tam ızgara aramasına geri dönüldü');
      }
    }
  }

  if (cellPath === null) {
    const res = astarCore({ rows, cols, cost, cell, start: s, goal: e, hMin: minCost, maxExp: remaining, deadline, mask: null, bufs: fineBufs });
    expandedTotal += res.expanded;
    if (res.status === 'budget' || res.status === 'time') return interrupted(res, cols, 1);
    if (res.status === 'none') {
      return failure('no_path',
        `Başlangıç ile hedef arasında geçilebilir bağlantı yok (${res.expanded} hücre tarandı; köşe kesme yasak, geçilemez hücreler aşılmaz)` +
        (notes.length ? `; not: ${notes.join('; ')}` : ''), expandedTotal, t0);
    }
    cellPath = res.path;
  }

  const unsmoothedCost = (() => { let t = 0; for (let i = 1; i < cellPath.length; i++) t += stepCost(field2, cellPath[i - 1], cellPath[i]); return t; })();
  let finalPath = cellPath;
  let smoothed = false;
  if (opt.smooth === true && cellPath.length > 2) {
    const sp = smoothPath(field2, cellPath);
    if (sp.length < cellPath.length) {
      let t = 0;
      for (let i = 1; i < sp.length; i++) t += segmentCost(field2, sp[i - 1], sp[i]);
      if (t <= unsmoothedCost * (1 + 1e-12)) { finalPath = sp; smoothed = true; }
      else notes.push('yumuşatma maliyeti artıracağı için uygulanmadı');
    }
  }

  // Çıktı: path, segmentler, istatistikler.
  const toCell = (i) => { const r = (i / cols) | 0; return { row: r, col: i - r * cols }; };
  const path = Array.from(finalPath, toCell);
  const score = field.score ?? null;
  const slope = field.slopeDeg ?? null;
  const segments = [];
  const segPairs = [];
  let lengthM = 0, totalCost = 0, maxCost = 0, minScore = Infinity, maxSlope = -Infinity;
  let scoreAcc = 0, scoreLen = 0;
  const visitStats = (idx, len) => {
    if (len <= 1e-12) return;
    const c = cost[idx];
    if (c > maxCost) maxCost = c;
    if (score) { if (score[idx] < minScore) minScore = score[idx]; }
    if (slope) { const sv = slope[idx]; if (Number.isFinite(sv) && sv > maxSlope) maxSlope = sv; }
  };
  if (finalPath.length === 1) {
    visitStats(finalPath[0], 1);
    if (score) { minScore = score[finalPath[0]]; scoreAcc = score[finalPath[0]]; scoreLen = 1; }
  }
  for (let i = 1; i < finalPath.length; i++) {
    const a = finalPath[i - 1], b = finalPath[i];
    const pa = path[i - 1], pb = path[i];
    const segLenM = Math.hypot(pb.row - pa.row, pb.col - pa.col) * cell;
    const segCost = segmentCost(field2, a, b);
    let sAcc = 0, sLen = 0;
    traceSegment(cols, pa.row, pa.col, pb.row, pb.col, (idx, len) => {
      visitStats(idx, len);
      if (score && len > 1e-12) { sAcc += score[idx] * len; sLen += len; }
    });
    const seg = { from: pa, to: pb, lengthM: segLenM, cost: segCost };
    if (score && sLen > 0) { seg.score = sAcc / sLen; scoreAcc += sAcc; scoreLen += sLen; }
    segments.push(seg);
    segPairs.push([pa, pb]);
    lengthM += segLenM; totalCost += segCost;
  }
  const stats = {
    lengthM, totalCost, cellsExpanded: expandedTotal, elapsedMs: performance.now() - t0,
    maxCost, meanCost: lengthM > 0 ? totalCost / lengthM : cost[finalPath[0]],
    impassableCrossings: countImpassableCrossings(field2, segPairs),
    // totalCost = DÖNEN yolun maliyeti, costMetric ölçüsünde. Yumuşatılmışsa çizgi-integralidir ve ızgara optimumuyla
    // karşılaştırılamaz (gridCost'tan düşük olabilir). gridCost = yumuşatmadan önceki A* yolunun ızgara-adımı maliyeti.
    gridCost: unsmoothedCost,
    costMetric: smoothed ? 'line_integral' : 'grid_step',
    smoothingGain: smoothed ? Math.max(0, unsmoothedCost - totalCost) : 0,
  };
  if (score) { stats.minScore = minScore; stats.meanScore = scoreLen > 0 ? scoreAcc / scoreLen : minScore; }
  if (slope && maxSlope > -Infinity) stats.maxSlopeDeg = maxSlope;

  const optimality = usedHier ? 'near_optimal' : (smoothed ? 'grid_optimal_then_smoothed' : 'optimal');
  const reasonParts = [
    usedHier
      ? 'Hiyerarşik arama: koridor içinde yol bulundu; YAKLAŞIK-optimal (global optimal garanti edilmez)'
      : 'Tam ızgara A*: 8-komşu ızgarada optimal maliyetli yol',
  ];
  if (smoothed) {
    reasonParts.push(
      'görüş hattı yumuşatması uygulandı: aynı ölçüde (çizgi-integrali) maliyet artmadı; ancak yumuşatılmış totalCost ' +
      `(${totalCost.toFixed(3)}) çizgi-integrali ölçüsündedir, ızgara-adımı optimumuyla (gridCost=${unsmoothedCost.toFixed(3)}) ` +
      'KARŞILAŞTIRILAMAZ ve ondan düşük olabilir; bu bir daha-ucuz/daha-güvenli iddiası değildir');
  }
  reasonParts.push(...notes);
  return deepFreeze({
    status: 'ok', reason: reasonParts.join('; '), path, stats, segments,
    algorithm: { name: 'astar-8n', hierarchical: usedHier, smoothed, version: PATHFINDER_VERSION, optimality },
  });
}

/** Worker/ana iş parçacığı ortak mesaj işleyicisi (saf). */
export function handlePlanMessage(message) {
  const id = message && typeof message === 'object' ? message.id : undefined;
  try {
    if (!message || typeof message !== 'object' || message.type !== 'plan') {
      throw new Error(`Bilinmeyen mesaj tipi: ${message && typeof message === 'object' ? String(message.type) : typeof message}`);
    }
    const result = planRoute({
      field: message.field, start: message.start, end: message.end, budget: message.budget, options: message.options,
    });
    return { type: 'result', id, result };
  } catch (err) {
    return { type: 'error', id, message: String(err && err.message ? err.message : err) };
  }
}
