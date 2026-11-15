// Minimap "görüş modları" katmanı: düzenli yerel-metre ızgarasından (route grid) türetilen, şeffaf bir overlay canvas'a çizilen
// alan/kontur üreticileri. Saf hesap + parametre enjeksiyonu; ızgara örneklemesi, ağ veya DOM erişimi yok.
//
// DÜRÜST ETİKETLEME: her mod `dataBasis` taşır.
//   'real-dtm'         : gerçek HiRISE DTM'den türetilmiş (kontur, DTM pürüzlülüğü, hillshade)
//   'scenario-model'   : DTM geometrisi + açıkça etiketli senaryo parametreleri (ölçüm DEĞİL)
//   'unavailable-data' : projede ilgili veri yok; uydurma değer çizilmez
// No-data hücreler (validMask != 1 veya sonlu olmayan kot) hiçbir modda renklendirilmez; alanda NaN olarak korunur.

export const VIEW_MODES = Object.freeze([
  Object.freeze({ id: 'normal', label: 'Normal görünüm', shortLabel: 'Normal', dataBasis: 'real-dtm',
    description: 'Ek katman yok; minimap olduğu gibi gösterilir.' }),
  Object.freeze({ id: 'optical', label: 'Optik (DTM hillshade)', shortLabel: 'Optik', dataBasis: 'real-dtm',
    description: 'DTM hillshade, ortogörüntü değildir.' }),
  Object.freeze({ id: 'thermal', label: 'Termal (senaryo modeli)', shortLabel: 'Termal', dataBasis: 'scenario-model',
    description: 'Eğim/bakı ve varsayılan güneş açısından göreli ısınma indeksi; ölçüm değildir.' }),
  Object.freeze({ id: 'topographic', label: 'Topografik kontur', shortLabel: 'Topo', dataBasis: 'real-dtm',
    description: 'Gerçek DTM kotlarından kontur çizgileri.' }),
  Object.freeze({ id: 'geophysical', label: 'Jeofizik (yalnız DTM pürüzlülüğü)', shortLabel: 'Jeofizik', dataBasis: 'unavailable-data',
    description: 'Jeofizik ölçüm verisi yok; yalnızca DTM yerel pürüzlülüğü gösterilir.' }),
  Object.freeze({ id: 'atmospheric', label: 'Atmosfer (senaryo)', shortLabel: 'Atmosfer', dataBasis: 'scenario-model',
    description: 'Kottan barometrik göreli basınç gradyanı (ölçek yüksekliği senaryo parametresi).' }),
  Object.freeze({ id: 'radiation', label: 'Radyasyon (senaryo)', shortLabel: 'Radyasyon', dataBasis: 'scenario-model',
    description: 'Göreli, illüstratif gösterge; MSL RAD ölçümü değildir.' }),
  Object.freeze({ id: 'chemical', label: 'Kimyasal (veri yok)', shortLabel: 'Kimyasal', dataBasis: 'unavailable-data',
    description: 'Kimyasal harita verisi yok (CRISM/GRS bu projede bulunmuyor).' }),
]);

export const VIEW_MODE_IDS = Object.freeze(VIEW_MODES.map((m) => m.id));
export const DEFAULT_MODE_ID = 'normal';

/** Mod kimliği doğrulama: bilinmeyen/eksik istek mevcut modu korur (tek seferde tek mod, radio mantığı). */
export function nextMode(current, requested, validIds = VIEW_MODE_IDS) {
  return validIds.includes(requested) ? requested : (validIds.includes(current) ? current : DEFAULT_MODE_ID);
}

export const getMode = (id) => VIEW_MODES.find((m) => m.id === id) ?? null;

// ---- Senaryo parametreleri (ölçüm değil) ----
export const SCENARIO = Object.freeze({
  sunElevationDeg: 35,
  timeOfDayHour: 13,
  scaleHeightM: 11000, // Mars atmosfer ölçek yüksekliği ~11 km (yaklaşık, senaryo parametresi)
});

// ---- Renk rampaları [t, r, g, b] ----
export const RAMPS = Object.freeze({
  thermal: [[0, 40, 70, 200], [0.35, 110, 50, 170], [0.7, 240, 130, 30], [1, 255, 240, 80]],
  atmospheric: [[0, 10, 30, 90], [0.5, 40, 110, 190], [1, 170, 225, 255]],
  radiation: [[0, 40, 20, 90], [0.5, 60, 150, 140], [1, 240, 230, 90]],
  geophysical: [[0, 25, 10, 60], [0.45, 170, 40, 90], [0.8, 245, 130, 40], [1, 255, 240, 140]],
});

export function rampColor(stops, t) {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const u = (x - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3]];
}

export function rampCssGradient(modeId) {
  const stops = RAMPS[modeId];
  if (!stops) return null;
  return `linear-gradient(90deg, ${stops.map((s) => `rgb(${s[1]} ${s[2]} ${s[3]}) ${Math.round(s[0] * 100)}%`).join(', ')})`;
}

// ---- Dürüst legend metinleri (Türkçe) ----
const LEGENDS = Object.freeze({
  normal: { unit: '', label: 'Ek katman yok', disclaimer: '' },
  optical: { unit: '', label: 'DTM hillshade', disclaimer: 'DTM hillshade, ortogörüntü değildir.' },
  topographic: { unit: 'm', label: 'Kontur çizgileri (gerçek DTM kotu)', disclaimer: 'HiRISE DTM kotlarından türetilmiştir; no-data hücrelerden çizgi geçmez.' },
  thermal: { unit: 'göreli', label: 'Göreli ısınma indeksi (senaryo modeli, ölçüm değildir)', disclaimer: 'Eğim/bakı ve varsayılan güneş açısına dayanır; gerçek yüzey sıcaklığı değildir.' },
  radiation: { unit: 'göreli', label: 'Göreli, illüstratif; MSL RAD ölçümü değildir', disclaimer: 'Yerel kot farkı küçük olduğundan değerler neredeyse düzgündür; renk ölçeği dar aralığa genişletilmiştir. Doz değeri değildir.' },
  atmospheric: { unit: 'göreli basınç', label: 'Göreli basınç gradyanı (senaryo parametresi)', disclaimer: 'Barometrik yaklaşım, ölçek yüksekliği ~11 km senaryo parametresidir; anlık atmosfer ölçümü değildir. Renk ölçeği dar aralığa genişletilmiştir.' },
  geophysical: { unit: 'm', label: 'Jeofizik ölçüm verisi yok; yalnız DTM pürüzlülüğü', disclaimer: 'Yüzey pürüzlülüğü = 3x3 pencerede kot aralığı (gerçek DTM türevi); alt yüzey bilgisi içermez.' },
  chemical: { unit: '', label: 'Kimyasal harita verisi yok (CRISM/GRS bu projede bulunmuyor)', disclaimer: 'Element/mineral değeri gösterilmez.' },
});
export const legendFor = (modeId) => LEGENDS[modeId] ?? LEGENDS.normal;

// ---- Izgara yardımcıları ----
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function validGrid(grid) {
  const { rows, cols, cellSizeM, elevation, validMask } = grid ?? {};
  return Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && finite(cellSizeM) && cellSizeM > 0
    && elevation && validMask && elevation.length === rows * cols && validMask.length === rows * cols;
}

/** Geçerli hücre kotu; no-data için NaN (hiçbir zaman 0 değil). */
function cleanElevation(grid) {
  const n = grid.rows * grid.cols;
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = grid.validMask[i] === 1 && finite(grid.elevation[i]) ? grid.elevation[i] : NaN;
  return z;
}

function minMax(values) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? { min, max } : { min: 0, max: 0 };
}

/** Eğim bileşenleri (doğu+, kuzey+). Komşu no-data ise tek taraflı fark; ikisi de yoksa NaN. */
function gradientAt(z, rows, cols, r, c, cell) {
  const i = r * cols + c;
  const axis = (a, b) => { // a = önceki, b = sonraki
    const va = a >= 0 ? a : -1, vb = b >= 0 ? b : -1;
    const ok = (k) => k >= 0 && !Number.isNaN(z[k]);
    if (ok(va) && ok(vb)) return (z[vb] - z[va]) / (2 * cell);
    if (ok(vb)) return (z[vb] - z[i]) / cell;
    if (ok(va)) return (z[i] - z[va]) / cell;
    return NaN;
  };
  const west = c > 0 ? i - 1 : -1, east = c < cols - 1 ? i + 1 : -1;
  const north = r > 0 ? i - cols : -1, south = r < rows - 1 ? i + cols : -1;
  return { dzdx: axis(west, east), dzdy: axis(south, north) };
}

function sunVector(sunElevationDeg, timeOfDayHour) {
  const e = (sunElevationDeg * Math.PI) / 180;
  // Senaryo: 6h doğu, 12h güney-ekvator yönü kuzey yok sayılır; yalnız görsel yön için basit azimut (sol→sağ).
  const az = ((90 + (timeOfDayHour - 6) * 15) * Math.PI) / 180;
  return { x: Math.cos(e) * Math.sin(az), y: Math.cos(e) * Math.cos(az), z: Math.sin(e), up: e > 0 };
}

// ---- Marching squares (kot/değer konturu) ----
/**
 * values: Float32Array (rows*cols, hücre MERKEZİ değerleri, no-data NaN). levels: artan sayılar.
 * Dört köşesinden biri NaN olan kare atlanır (no-data'dan çizgi geçmez).
 * Dönüş: [{ level, segs: Float32Array [x0,y0,x1,y1,...] }] — koordinatlar hücre-merkezi birimlerinde (x=col+0.5 piksel merkezi).
 */
export function marchingSquares(values, cols, rows, levels) {
  const out = [];
  for (const level of levels) {
    const segs = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = values[r * cols + c], b = values[r * cols + c + 1];
        const d = values[(r + 1) * cols + c], e = values[(r + 1) * cols + c + 1];
        if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(d) || Number.isNaN(e)) continue;
        // köşeler: a=TL b=TR e=BR d=BL
        const code = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (e >= level ? 2 : 0) | (d >= level ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const lerp = (v0, v1) => (level - v0) / (v1 - v0);
        const x0 = c + 0.5, y0 = r + 0.5;
        const top = [x0 + lerp(a, b), y0], right = [x0 + 1, y0 + lerp(b, e)];
        const bottom = [x0 + lerp(d, e), y0 + 1], left = [x0, y0 + lerp(a, d)];
        const push = (p, q) => segs.push(p[0], p[1], q[0], q[1]);
        switch (code) {
          case 1: case 14: push(left, bottom); break;
          case 2: case 13: push(bottom, right); break;
          case 3: case 12: push(left, right); break;
          case 4: case 11: push(top, right); break;
          case 6: case 9: push(top, bottom); break;
          case 7: case 8: push(left, top); break;
          case 5: case 10: {
            const center = (a + b + d + e) / 4;
            if ((center >= level) === (code === 5)) { push(left, top); push(bottom, right); } else { push(left, bottom); push(top, right); }
            break;
          }
          default: break;
        }
      }
    }
    out.push({ level, segs: Float32Array.from(segs) });
  }
  return out;
}

const NICE_INTERVALS = [0.5, 1, 2, 5, 10, 20, 50, 100];
/** Hedef ~12 kontur aralığı; varsayılan 5-10 m civarında seçilir. */
export function autoContourInterval(min, max, targetCount = 12) {
  const range = Math.max(max - min, 1e-6);
  const want = range / targetCount;
  for (const step of NICE_INTERVALS) if (step >= want) return step;
  return NICE_INTERVALS[NICE_INTERVALS.length - 1];
}

/** Konturlar: her 5. çizgi (level/interval % 5 == 0) kalın/etiketli. */
export function buildContours(values, cols, rows, { interval = null, majorEvery = 5 } = {}) {
  const { min, max } = minMax(values);
  if (!(max > min)) return { interval: interval ?? 1, lines: [], labels: [] };
  const step = interval ?? autoContourInterval(min, max);
  const levels = [];
  for (let k = Math.ceil(min / step); k * step <= max; k++) levels.push(k * step);
  const lines = marchingSquares(values, cols, rows, levels).map((l, i) => ({
    level: l.level, segs: l.segs, major: Math.round(levels[i] / step) % majorEvery === 0,
  }));
  const labels = [];
  for (const line of lines) {
    if (!line.major || line.segs.length < 4) continue;
    const m = Math.floor(line.segs.length / 8) * 4; // yaklaşık orta segment
    labels.push({ x: (line.segs[m] + line.segs[m + 2]) / 2, y: (line.segs[m + 1] + line.segs[m + 3]) / 2, text: `${Math.round(line.level * 10) / 10} m` });
  }
  return { interval: step, lines, labels };
}

// ---- Alan hesapları ----
function fieldBase(grid, mode, values, extra = {}) {
  const { min, max } = minMax(values);
  return {
    mode, values, width: grid.cols, height: grid.rows, min, max,
    cellM: grid.cellSizeM, nwXM: grid.nwXM ?? 0, nwYM: grid.nwYM ?? 0,
    dataBasis: getMode(mode).dataBasis, legend: legendFor(mode), ...extra,
  };
}

function computeThermal(grid, z, sun) {
  const { rows, cols, cellSizeM } = grid;
  const v = new Float32Array(rows * cols).fill(NaN);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (Number.isNaN(z[i])) continue;
    const { dzdx, dzdy } = gradientAt(z, rows, cols, r, c, cellSizeM);
    if (Number.isNaN(dzdx) || Number.isNaN(dzdy)) continue;
    const inv = 1 / Math.hypot(dzdx, dzdy, 1);
    const cosInc = (-dzdx * sun.x - dzdy * sun.y + sun.z) * inv;
    v[i] = sun.up ? Math.max(0, cosInc) : 0;
  }
  return v;
}

function computeRadiation(grid, z) {
  const { rows, cols, cellSizeM } = grid;
  const v = new Float32Array(rows * cols).fill(NaN);
  const { min, max } = minMax(z);
  const zRef = (min + max) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (Number.isNaN(z[i])) continue;
    const { dzdx, dzdy } = gradientAt(z, rows, cols, r, c, cellSizeM);
    if (Number.isNaN(dzdx) || Number.isNaN(dzdy)) continue;
    const skyView = (1 + 1 / Math.hypot(dzdx, dzdy, 1)) / 2; // eğimli yüzeyde gökyüzü görünürlüğü yaklaşımı
    v[i] = skyView * Math.exp((z[i] - zRef) / SCENARIO.scaleHeightM); // kot etkisi ~% mertebesinde
  }
  return v;
}

function computeAtmospheric(grid, z) {
  const v = new Float32Array(z.length).fill(NaN);
  const { min, max } = minMax(z);
  const zRef = (min + max) / 2;
  for (let i = 0; i < z.length; i++) if (!Number.isNaN(z[i])) v[i] = Math.exp(-(z[i] - zRef) / SCENARIO.scaleHeightM);
  return v;
}

function computeRoughness(grid, z) {
  const { rows, cols } = grid;
  const v = new Float32Array(rows * cols).fill(NaN);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (Number.isNaN(z[i])) continue;
    let lo = Infinity, hi = -Infinity;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const q = z[rr * cols + cc];
      if (Number.isNaN(q)) continue;
      if (q < lo) lo = q;
      if (q > hi) hi = q;
    }
    v[i] = hi - lo;
  }
  return v;
}

const fieldCache = new WeakMap(); // grid -> Map(key -> field)

/**
 * mode için alan üretir; normal/optical/chemical için null (overlay alanı yok). Sonuç grid+parametre başına önbelleklenir.
 * @returns {{values:Float32Array,width:number,height:number,min:number,max:number,legend:object,cellM:number,nwXM:number,nwYM:number,
 *   contours?:object}|null}
 */
export function computeModeField(mode, { grid, sunElevationDeg = SCENARIO.sunElevationDeg, timeOfDayHour = SCENARIO.timeOfDayHour } = {}) {
  if (!getMode(mode)) throw new RangeError(`computeModeField: bilinmeyen mod '${mode}'`);
  if (mode === 'normal' || mode === 'optical' || mode === 'chemical') return null;
  if (!validGrid(grid)) throw new TypeError('computeModeField: geçerli grid (rows, cols, cellSizeM, elevation, validMask) gerekli');
  const key = `${mode}|${sunElevationDeg}|${timeOfDayHour}`;
  let perGrid = fieldCache.get(grid);
  if (!perGrid) { perGrid = new Map(); fieldCache.set(grid, perGrid); }
  if (perGrid.has(key)) return perGrid.get(key);
  const z = cleanElevation(grid);
  let field;
  switch (mode) {
    case 'topographic': {
      const contours = buildContours(z, grid.cols, grid.rows);
      field = fieldBase(grid, mode, z, { contours, legend: { ...legendFor(mode), label: `Kontur aralığı ${contours.interval} m (her 5. çizgi kalın)` } });
      break;
    }
    case 'thermal': field = fieldBase(grid, mode, computeThermal(grid, z, sunVector(sunElevationDeg, timeOfDayHour))); break;
    case 'radiation': field = fieldBase(grid, mode, computeRadiation(grid, z)); break;
    case 'atmospheric': {
      const values = computeAtmospheric(grid, z);
      const { min, max } = minMax(values);
      const levels = [];
      for (let k = 1; k <= 4; k++) levels.push(min + ((max - min) * k) / 5);
      field = fieldBase(grid, mode, values, { isobars: max > min ? marchingSquares(values, grid.cols, grid.rows, levels) : [] });
      break;
    }
    case 'geophysical': field = fieldBase(grid, mode, computeRoughness(grid, z)); break;
    default: return null;
  }
  perGrid.set(key, field);
  return field;
}

// ---- Çizim ----
const heatBitmaps = new WeakMap(); // field -> canvas
const defaultMakeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

/** Isı haritasını (no-data hücreler şeffaf) bir kez önceden render eder. */
export function renderHeatCanvas(field, makeCanvas = defaultMakeCanvas) {
  const cached = heatBitmaps.get(field);
  if (cached) return cached;
  const stops = RAMPS[field.mode];
  const canvas = makeCanvas(field.width, field.height);
  const g = canvas.getContext('2d');
  const img = g.createImageData(field.width, field.height);
  const span = field.max - field.min;
  for (let i = 0; i < field.values.length; i++) {
    const v = field.values[i];
    if (Number.isNaN(v)) continue; // şeffaf kalır
    const t = span > 0 ? (v - field.min) / span : 0.5;
    const [r, gg, b] = rampColor(stops, t);
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  heatBitmaps.set(field, canvas);
  return canvas;
}

function caption(ctx, text, sub, canvasW, canvasH) {
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  const w = Math.min(canvasW - 8, Math.max(ctx.measureText(text).width, ctx.measureText(sub).width) + 12);
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(4, canvasH - 40, w, 36);
  ctx.fillStyle = '#e8eef8';
  ctx.fillText(text, 10, canvasH - 22, w - 12);
  ctx.fillStyle = '#aab6c8';
  ctx.fillText(sub, 10, canvasH - 8, w - 12);
  ctx.restore();
}

function hatchPattern(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = 'rgba(190,200,220,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -h; k < w; k += 14) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
  ctx.stroke();
  ctx.restore();
}

/**
 * Overlay canvas'a çizer. `ctx` caller tarafından dpr ile ölçeklenmiş, CSS-piksel koordinatlıdır; caller önce clearRect yapar.
 * projectToCanvas(xM, yM) -> [px, py] (CSS px). minimap.getView() ile: px=W/2+(x-cx)*s, py=H/2-(y-cy)*s.
 * `field` zorunlu olan modlar: thermal/topographic/atmospheric/radiation/geophysical. chemical için `bounds` (opsiyonel) gerekir.
 */
export function drawModeOverlay(ctx, { mode, field = null, projectToCanvas, canvasW, canvasH, cellM = null, opacity = 0.6, makeCanvas = defaultMakeCanvas, bounds = null } = {}) {
  const meta = getMode(mode);
  if (!meta || mode === 'normal') return;
  const leg = legendFor(mode);
  if (mode === 'optical') { caption(ctx, leg.label, leg.disclaimer, canvasW, canvasH); return; }
  if (mode === 'chemical') {
    const b = bounds ?? (field ? { nwXM: field.nwXM, nwYM: field.nwYM, widthM: field.width * field.cellM, heightM: field.height * field.cellM } : null);
    if (b) {
      const [x0, y0] = projectToCanvas(b.nwXM, b.nwYM), [x1, y1] = projectToCanvas(b.nwXM + b.widthM, b.nwYM - b.heightM);
      hatchPattern(ctx, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else hatchPattern(ctx, 0, 0, canvasW, canvasH);
    caption(ctx, leg.label, leg.disclaimer, canvasW, canvasH);
    return;
  }
  if (!field) return;
  const cell = cellM ?? field.cellM;
  const [ox, oy] = projectToCanvas(field.nwXM, field.nwYM);
  const [ex, ey] = projectToCanvas(field.nwXM + cell, field.nwYM - cell);
  const sx = ex - ox, sy = ey - oy; // piksel/hücre
  if (!(sx > 0) || !(sy > 0)) return;
  // Görünür değilse çizme
  if (ox > canvasW || oy > canvasH || ox + field.width * sx < 0 || oy + field.height * sy < 0) { caption(ctx, leg.label, leg.disclaimer, canvasW, canvasH); return; }

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(sx, sy);
  if (RAMPS[mode]) {
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = sx < 1.5;
    ctx.drawImage(renderHeatCanvas(field, makeCanvas), 0, 0, field.width, field.height);
  }
  const unit = Math.max(sx, sy);
  const strokeSet = (lines, color, widthPx, alpha) => {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = widthPx / unit;
    ctx.beginPath();
    for (const segs of lines) for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); }
    ctx.stroke();
  };
  if (mode === 'topographic' && field.contours) {
    strokeSet(field.contours.lines.filter((l) => !l.major).map((l) => l.segs), '#ffd9a0', 0.8, opacity);
    strokeSet(field.contours.lines.filter((l) => l.major).map((l) => l.segs), '#fff1d0', 1.8, Math.min(1, opacity + 0.3));
  }
  if (mode === 'atmospheric' && field.isobars) strokeSet(field.isobars.map((l) => l.segs), '#e6f4ff', 1, 0.7);
  ctx.restore();

  if (mode === 'topographic' && field.contours) {
    ctx.save();
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const lab of field.contours.labels) {
      const px = ox + lab.x * sx, py = oy + lab.y * sy;
      if (px < 0 || py < 0 || px > canvasW || py > canvasH) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText(lab.text, px, py);
      ctx.fillStyle = '#fff1d0'; ctx.fillText(lab.text, px, py);
    }
    ctx.restore();
  }
  caption(ctx, field.legend.label, field.legend.disclaimer, canvasW, canvasH);
}
