// Stage 23D — route bridge: minimap local metres <-> 23A cost field / 23B A* planner.
//
// Pure, browser-safe module: no fs / fetch / DOM, no module-level mutable state. Every result is plain,
// JSON-serialisable data (no typed arrays, NaN or Infinity inside results) and deep-frozen. The only
// non-deterministic field is `timing.elapsedMs`.
//
// PLANNING AID ONLY. The EVA walkability score is a transparent planning indicator, not a safety certificate.
// Coarse DEMs (> RESOLUTION_THRESHOLDS.evaWalkabilityMaxM per cell) never yield a walkability score.
//
// Frames. Local plane = project plane: x east, y north, metres, origin = WB1 waypoint (geo.js WorldAdapter).
// A DEM window stores `nwXM, nwYM` = local coordinates of the WEST/NORTH EDGE of cell (0,0) (same meaning as the
// minimap terrain bounds `{ nwXM, nwYM, widthM, heightM }`). Cell (row, col) covers
//   x in [nwXM + col*h, nwXM + (col+1)*h),  y in (nwYM - (row+1)*h, nwYM - row*h]   (half-open, like minimap
// `selectionRejection`); its centre is (nwXM + (col+0.5)*h, nwYM - (row+0.5)*h).

import { buildWalkabilityField, explainCell, STATUS } from './cost-model.js';
import { planRoute } from './pathfinder.js';

export const ROUTE_SERVICE_VERSION = '1.0.0';
export const DEM_WINDOW_SCHEMA = 'marswalk.dem-window.v1';

// Resolution honesty guard. Thresholds are SCENARIO values (no primary source): the cost model was designed for a
// ~1 m DTM (HiRISE); coarser grids smooth away human-step-scale slope and must not produce a walkability score.
export const RESOLUTION_THRESHOLDS = Object.freeze({
  evaWalkabilityMaxM: 2,
  regionalPreplanMaxM: 50,
  status: 'scenario',
  source: 'Tasarım seçimi (senaryo): 23A modeli ~1 m DTM için tasarlandı; kaynaklı eşik yok',
});

const TEXT = Object.freeze({
  capTR: 'Planlama göstergesi — güvenlik sertifikası değildir; nihai rota kararı ekip ve görev kontrolündedir. Rover izi veya rover limitleri insan limiti değildir.',
  capEN: 'Planning aid, not a safety certificate; final route decisions rest with the crew and mission control. Rover traverses or rover limits are not human limits.',
  evaTR: 'EVA yürünebilirlik puanı (~1 m DTM ölçeği): eşikler birincil kaynaksız "senaryo" parametreleridir; kaya/blok tespiti yoktur.',
  evaEN: 'EVA walkability score (~1 m DTM scale): thresholds are unsourced "scenario" parameters; no rock/boulder detection.',
  regTR: 'Bölgesel ön planlama, yürünebilirlik puanı değildir: yalnız eğim temelli; kaba çözünürlükte yerel eğim düşük görünür.',
  regEN: 'Regional pre-planning, NOT a walkability score: slope-based only; at coarse resolution local slope is underestimated.',
  globalTR: 'Küresel bağlam çözünürlüğü: rota/puan üretilmez; yalnız saha seçimi için bağlam.',
  globalEN: 'Global-context resolution: no route or score is produced; context for site selection only.',
});

const CAV_SCORE_KEYS = ['score', 'minScore', 'meanScore', 'roughnessM', 'roughness'];

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o) && !ArrayBuffer.isView(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (Number.isFinite(v) ? v : null); // JSON-safe number

/** 'eva_walkability' | 'regional_preplan' | 'global_context' for a cell size in metres/pixel. */
export function classifyResolution(cellSizeM) {
  if (!isFiniteNum(cellSizeM) || !(cellSizeM > 0)) throw new TypeError('cellSizeM pozitif sonlu sayı olmalı');
  if (cellSizeM <= RESOLUTION_THRESHOLDS.evaWalkabilityMaxM) return 'eva_walkability';
  if (cellSizeM <= RESOLUTION_THRESHOLDS.regionalPreplanMaxM) return 'regional_preplan';
  return 'global_context';
}

function modeTexts(cls) {
  if (cls === 'eva_walkability') return { tr: `${TEXT.evaTR} ${TEXT.capTR}`, en: `${TEXT.evaEN} ${TEXT.capEN}` };
  if (cls === 'regional_preplan') return { tr: `${TEXT.regTR} ${TEXT.capTR}`, en: `${TEXT.regEN} ${TEXT.capEN}` };
  return { tr: `${TEXT.globalTR} ${TEXT.capTR}`, en: `${TEXT.globalEN} ${TEXT.capEN}` };
}

// ------------------------------------------------------------------------------------------------------------
// DEM window

/**
 * Creates a frozen DEM window descriptor. `elevation` is a row-major Float32Array/Float64Array (row 0 = north).
 * nwXM/nwYM = local metres of the WEST/NORTH EDGE of cell (0,0). Optional widthM/heightM are verified
 * (must equal cols*cellSizeM / rows*cellSizeM). `adapter` (optional) must expose localToLatLon(x, y).
 */
export function createDemWindow(input) {
  if (!input || typeof input !== 'object') throw new TypeError('createDemWindow: girdi nesnesi gerekli');
  const { elevation, rows, cols, cellSizeM, nwXM, nwYM, noDataValue, validMin, validMax, coverageMask, adapter } = input;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) throw new TypeError('rows/cols pozitif tam sayı olmalı');
  if (!isFiniteNum(cellSizeM) || !(cellSizeM > 0)) throw new TypeError('cellSizeM pozitif sonlu olmalı');
  if (!isFiniteNum(nwXM) || !isFiniteNum(nwYM)) throw new TypeError('nwXM/nwYM sonlu sayı olmalı');
  if (!(elevation instanceof Float32Array || elevation instanceof Float64Array)) throw new TypeError('elevation Float32Array/Float64Array olmalı');
  if (elevation.length !== rows * cols) throw new TypeError('elevation uzunluğu rows*cols olmalı');
  const widthM = cols * cellSizeM, heightM = rows * cellSizeM;
  for (const [k, expected] of [['widthM', widthM], ['heightM', heightM]]) {
    if (input[k] !== undefined && !(Math.abs(input[k] - expected) <= 1e-9 * Math.max(1, expected))) {
      throw new TypeError(`${k}=${input[k]} beklenen ${expected} (cols/rows*cellSizeM) ile uyuşmuyor`);
    }
  }
  for (const [k, v] of [['noDataValue', noDataValue], ['validMin', validMin], ['validMax', validMax]]) {
    if (v !== undefined && !isFiniteNum(v)) throw new TypeError(`${k} sonlu sayı olmalı`);
  }
  if (adapter !== undefined && adapter !== null && typeof adapter.localToLatLon !== 'function') throw new TypeError('adapter.localToLatLon fonksiyonu gerekli');
  const resolutionClass = classifyResolution(cellSizeM);
  const win = {
    schema: DEM_WINDOW_SCHEMA, rows, cols, cellSizeM, nwXM, nwYM, widthM, heightM,
    bounds: { nwXM, nwYM, widthM, heightM },
    resolutionClass,
    elevation, noDataValue, validMin, validMax, coverageMask: coverageMask ?? undefined,
    adapter: adapter ?? null,
  };
  // Memo store lives inside the returned object (non-enumerable): no module-level state.
  win.bounds = Object.freeze(win.bounds);
  Object.defineProperty(win, '_fieldCache', { value: new Map(), enumerable: false });
  return Object.freeze(win);
}

function assertWindow(win) {
  if (!win || win.schema !== DEM_WINDOW_SCHEMA) throw new TypeError('geçerli bir DEM penceresi gerekli (createDemWindow)');
}

// ------------------------------------------------------------------------------------------------------------
// Coordinates

/**
 * Local metres -> cell. Same half-open rule as minimap `selectionRejection`:
 * inside <=> !(x < nwX || x >= nwX+widthM || y > nwY || y <= nwY-heightM).
 * snapOffsetM = cell centre - query point (metres, east/north positive); null when outside.
 */
export function localToCell(win, xM, yM) {
  assertWindow(win);
  if (!isFiniteNum(xM) || !isFiniteNum(yM)) return { row: NaN, col: NaN, inside: false, snapOffsetM: null };
  const h = win.cellSizeM;
  const inside = !(xM < win.nwXM || xM >= win.nwXM + win.widthM || yM > win.nwYM || yM <= win.nwYM - win.heightM);
  let col = Math.floor((xM - win.nwXM) / h), row = Math.floor((win.nwYM - yM) / h);
  if (!inside) return { row, col, inside: false, snapOffsetM: null };
  col = Math.max(0, Math.min(win.cols - 1, col)); // float rounding at the far edge only
  row = Math.max(0, Math.min(win.rows - 1, row));
  const c = cellToLocal(win, row, col);
  return { row, col, inside: true, snapOffsetM: { dx: c.xM - xM, dy: c.yM - yM } };
}

/** Cell -> local metres of the cell CENTRE. */
export function cellToLocal(win, row, col) {
  assertWindow(win);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= win.rows || col >= win.cols) {
    throw new RangeError('cellToLocal: hücre indeksi pencere dışında');
  }
  return { xM: win.nwXM + (col + 0.5) * win.cellSizeM, yM: win.nwYM - (row + 0.5) * win.cellSizeM };
}

// ------------------------------------------------------------------------------------------------------------
// Cost field (memoised per window by params hash)

function stableStringify(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/** Builds (or returns the memoised) 23A CostField for the window. Throws for global-context resolution. */
export function buildFieldForWindow(win, params) {
  assertWindow(win);
  if (win.resolutionClass === 'global_context') {
    throw new RangeError(`Küresel bağlam çözünürlüğü (${win.cellSizeM} m/piksel): maliyet alanı üretilmez`);
  }
  const key = stableStringify(params);
  const cache = win._fieldCache;
  if (cache.has(key)) return cache.get(key);
  const field = buildWalkabilityField({
    elevation: win.elevation, rows: win.rows, cols: win.cols, cellSizeM: win.cellSizeM,
    noDataValue: win.noDataValue, validMin: win.validMin, validMax: win.validMax, coverageMask: win.coverageMask,
    params: params ?? undefined,
  });
  Object.freeze(field);
  if (cache.size >= 8) cache.delete(cache.keys().next().value);
  cache.set(key, field);
  return field;
}

const D2R = Math.PI / 180;
// Slope-only cost for regional pre-planning: same slope term as 23A, NO roughness term, NO score.
function regionalCost(field) {
  const P = field.params;
  const m = P.maxSlopeDeg.value, c = P.comfortableSlopeDeg.value;
  const tc = Math.tan(c * D2R), tm = Math.tan(m * D2R);
  const out = new Float32Array(field.rows * field.cols).fill(Infinity);
  for (let i = 0; i < out.length; i++) {
    if (field.status[i] !== STATUS.OK) continue;
    const s = field.slopeDeg[i];
    if (!(s < m)) continue;
    const d = Math.max(0, (Math.tan(s * D2R) - tc) / (tm - tc));
    const sf = Math.max(0, 1 - d * d);
    out[i] = 1 + P.costK.value * Math.pow(1 - sf, P.costP.value);
  }
  return out;
}

function plannerFieldFor(win, field) {
  if (win.resolutionClass === 'eva_walkability') return field;
  // regional: strip score/roughness so the planner cannot report a walkability score.
  return { schema: field.schema, rows: field.rows, cols: field.cols, cellSizeM: field.cellSizeM, cost: regionalCost(field), slopeDeg: field.slopeDeg };
}

// ------------------------------------------------------------------------------------------------------------
// Helpers

const STATUS_NAME = ['OK', 'TOO_STEEP', 'NO_DATA', 'OUT_OF_COVERAGE', 'INVALID', 'EDGE_UNKNOWN'];
const STATUS_TEXT = Object.freeze({
  OK: ['geçilebilir', 'passable'],
  TOO_STEEP: ['eğim senaryo eşiğinin üstünde (geçilemez)', 'slope above scenario threshold (impassable)'],
  NO_DATA: ['no-data (bilinmiyor; geçilebilir sayılmaz)', 'no-data (unknown; never treated as passable)'],
  OUT_OF_COVERAGE: ['kapsam dışı (bilinmiyor)', 'out of coverage (unknown)'],
  INVALID: ['geçersiz kot değeri (bilinmiyor)', 'invalid elevation value (unknown)'],
  EDGE_UNKNOWN: ['komşu pencere bilinmiyor/ızgara kenarı (fail-closed)', '3x3 window touches unknown data or the grid edge (fail-closed)'],
  IMPASSABLE: ['geçilemez', 'impassable'],
});

function cellStatusName(field, idx) {
  if (field.status && field.status.length > idx) return STATUS_NAME[field.status[idx]] ?? 'IMPASSABLE';
  return 'IMPASSABLE';
}

// Closed supercover of the segment between two cell centres: every cell whose closed square is touched.
function supercover(r0, c0, r1, c1, visit) {
  const EPS = 1e-9;
  const ax = c0 + 0.5, ay = r0 + 0.5, dx = c1 - c0, dy = r1 - r0;
  if (dx === 0 && dy === 0) { visit(r0, c0); return; }
  const xMajor = Math.abs(dx) >= Math.abs(dy);
  const a0 = xMajor ? ax : ay, b0 = xMajor ? ay : ax;
  const da = xMajor ? dx : dy, db = xMajor ? dy : dx;
  const mLo = Math.min(xMajor ? c0 : r0, xMajor ? c1 : r1), mHi = Math.max(xMajor ? c0 : r0, xMajor ? c1 : r1);
  for (let m = mLo; m <= mHi; m++) {
    const ta = (m - EPS - a0) / da, tb = (m + 1 + EPS - a0) / da;
    const t0 = Math.max(0, Math.min(ta, tb)), t1 = Math.min(1, Math.max(ta, tb));
    const v0 = b0 + db * t0, v1 = b0 + db * t1;
    const qLo = Math.ceil(Math.min(v0, v1) - EPS) - 1, qHi = Math.floor(Math.max(v0, v1) + EPS);
    for (let q = qLo; q <= qHi; q++) { if (xMajor) visit(q, m); else visit(m, q); }
  }
}

function straightLineReport(win, field, a, b) {
  const byStatus = {};
  let crossed = 0, tooSteep = 0, unknown = 0;
  supercover(a.row, a.col, b.row, b.col, (r, c) => {
    if (r < 0 || c < 0 || r >= win.rows || c >= win.cols) return;
    crossed++;
    const i = r * win.cols + c;
    const name = field.cost[i] === Infinity ? cellStatusName(field, i) : 'OK';
    byStatus[name] = (byStatus[name] ?? 0) + 1;
    if (name === 'TOO_STEEP') tooSteep++;
    else if (name !== 'OK') unknown++;
  });
  return { cellsCrossed: crossed, tooSteep, unknown, byStatus, lengthM: Math.hypot(b.row - a.row, b.col - a.col) * win.cellSizeM };
}

function bilinear(win, rf, cf) {
  const r0 = Math.max(0, Math.min(win.rows - 2, Math.floor(rf))), c0 = Math.max(0, Math.min(win.cols - 2, Math.floor(cf)));
  const fr = rf - r0, fc = cf - c0;
  const z = win.elevation, w = win.cols;
  const a = z[r0 * w + c0], b = z[r0 * w + c0 + 1], c = z[(r0 + 1) * w + c0], d = z[(r0 + 1) * w + c0 + 1];
  return (a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr;
}

function elevationProfile(win, cells) {
  let gain = 0, loss = 0, prev = null, complete = true;
  const sample = (rf, cf) => {
    const z = (win.rows < 2 || win.cols < 2) ? win.elevation[Math.round(rf) * win.cols + Math.round(cf)] : bilinear(win, rf, cf);
    if (!Number.isFinite(z)) { complete = false; return; }
    if (prev !== null) { const dz = z - prev; if (dz > 0) gain += dz; else loss -= dz; }
    prev = z;
  };
  for (let i = 0; i < cells.length; i++) {
    if (i === 0) { sample(cells[0].row, cells[0].col); continue; }
    const p = cells[i - 1], q = cells[i];
    const n = Math.max(1, Math.ceil(Math.hypot(q.row - p.row, q.col - p.col)));
    for (let k = 1; k <= n; k++) sample(p.row + (q.row - p.row) * k / n, p.col + (q.col - p.col) * k / n);
  }
  return { gain, loss, complete };
}

function paramSummary(field) {
  return Object.keys(field.params).map((k) => {
    const p = field.params[k];
    return { name: k, value: p.value, unit: p.unit, status: p.status, source: p.source };
  });
}

function snapNearest(win, cost, row, col, withinM) {
  const R = Math.ceil(withinM / win.cellSizeM);
  let best = null;
  for (let r = Math.max(0, row - R); r <= Math.min(win.rows - 1, row + R); r++) {
    for (let c = Math.max(0, col - R); c <= Math.min(win.cols - 1, col + R); c++) {
      if (cost[r * win.cols + c] === Infinity) continue;
      const d = Math.hypot(r - row, c - col) * win.cellSizeM;
      if (d > withinM) continue;
      if (!best || d < best.d || (d === best.d && (r < best.row || (r === best.row && c < best.col)))) best = { row: r, col: c, d };
    }
  }
  return best;
}

const PLANNER_STATUS_EN = Object.freeze({
  no_path: 'No passable connection between start and end', budget_exceeded: 'Search budget exceeded; no route produced',
  invalid_input: 'Invalid planner input',
});
const SERVICE_OPTION_KEYS = ['snapToNearestPassableWithinM', 'scenarioSpeedMps'];
export const DEFAULT_SCENARIO_SPEED_MPS = Object.freeze({
  value: 0.8, unit: 'm/s', status: 'scenario',
  source: 'Senaryo varsayımı (düz hızlı yürüyüş); kaynaklı değer yok, eğim/giysi etkisi modellenmedi',
});

function fail(status, reasonTR, reasonEN, extra = {}) {
  return deepFreeze({ status, reason: reasonTR, reasonEN, mode: null, path: [], segments: [], stats: null, ...extra });
}

// ------------------------------------------------------------------------------------------------------------
// Public planning API

/**
 * Plans a route between two LOCAL-metre points on a DEM window.
 * Never throws; failures are structured (`status` + TR/EN reason). No silent snapping: blocked endpoints are
 * reported (`start_blocked` / `end_blocked`) unless options.snapToNearestPassableWithinM > 0.
 */
export function planWalkingRoute(args) {
  const t0 = performance.now();
  try {
    return planImpl(args, t0);
  } catch (err) {
    return fail('invalid_input', `beklenmeyen hata: ${err && err.message ? err.message : String(err)}`, `unexpected error: ${err && err.message ? err.message : String(err)}`);
  }
}

function planImpl(args, t0) {
  if (!args || typeof args !== 'object') return fail('invalid_input', 'argüman nesne olmalı', 'argument must be an object');
  const win = args.window;
  if (!win || win.schema !== DEM_WINDOW_SCHEMA) return fail('invalid_input', 'geçerli DEM penceresi gerekli', 'valid DEM window required');
  const { startLocal, endLocal } = args;
  for (const [n, p] of [['startLocal', startLocal], ['endLocal', endLocal]]) {
    if (!p || !isFiniteNum(p.xM) || !isFiniteNum(p.yM)) return fail('invalid_input', `${n} {xM,yM} sonlu sayı olmalı`, `${n} must be {xM,yM} finite numbers`);
  }
  const o = args.options ?? {};
  if (typeof o !== 'object' || Array.isArray(o)) return fail('invalid_input', 'options düz nesne olmalı', 'options must be a plain object');
  const snapWithin = o.snapToNearestPassableWithinM ?? 0;
  if (!isFiniteNum(snapWithin) || snapWithin < 0) return fail('invalid_input', 'snapToNearestPassableWithinM >= 0 sayı olmalı', 'snapToNearestPassableWithinM must be a number >= 0');
  const speed = o.scenarioSpeedMps ?? DEFAULT_SCENARIO_SPEED_MPS.value;
  if (!isFiniteNum(speed) || !(speed > 0)) return fail('invalid_input', 'scenarioSpeedMps > 0 olmalı', 'scenarioSpeedMps must be > 0');
  const plannerOptions = {};
  for (const k of Object.keys(o)) if (!SERVICE_OPTION_KEYS.includes(k)) plannerOptions[k] = o[k];

  const cls = win.resolutionClass;
  const texts = modeTexts(cls);
  if (cls === 'global_context') {
    return fail('resolution_too_coarse',
      `Pencere çözünürlüğü ${win.cellSizeM} m/piksel (küresel bağlam): rota/puan üretilmez. ${TEXT.globalTR}`,
      `Window resolution ${win.cellSizeM} m/pixel (global context): no route or score is produced. ${TEXT.globalEN}`,
      { resolution: { cellSizeM: win.cellSizeM, class: cls }, provenance: { caveatTR: texts.tr, caveatEN: texts.en } });
  }

  const s0 = localToCell(win, startLocal.xM, startLocal.yM);
  if (!s0.inside) return fail('outside_coverage', 'Başlangıç noktası yüklenen DEM penceresinin dışında', 'Start point is outside the loaded DEM window', { which: 'start' });
  const e0 = localToCell(win, endLocal.xM, endLocal.yM);
  if (!e0.inside) return fail('outside_coverage', 'Bitiş noktası yüklenen DEM penceresinin dışında', 'End point is outside the loaded DEM window', { which: 'end' });

  const field = args.field ?? buildFieldForWindow(win, args.params);
  if (!field || field.rows !== win.rows || field.cols !== win.cols || field.cellSizeM !== win.cellSizeM) {
    return fail('invalid_input', 'field boyutları pencereyle uyuşmuyor', 'field dimensions do not match the window');
  }
  const pf = plannerFieldFor(win, field);
  const cost = pf.cost;

  const resolveEnd = (which, cell, req) => {
    const idx = cell.row * win.cols + cell.col;
    if (cost[idx] !== Infinity) return { ok: true, row: cell.row, col: cell.col, snap: { applied: false, requestedWithinM: snapWithin } };
    const name = cellStatusName(field, idx);
    if (snapWithin > 0) {
      const best = snapNearest(win, cost, cell.row, cell.col, snapWithin);
      if (best) {
        return { ok: true, row: best.row, col: best.col, snap: { applied: true, requestedWithinM: snapWithin, distanceM: best.d, from: { row: cell.row, col: cell.col }, to: { row: best.row, col: best.col } } };
      }
    }
    const [tr, en] = STATUS_TEXT[name] ?? STATUS_TEXT.IMPASSABLE;
    const c = cellToLocal(win, cell.row, cell.col);
    return {
      ok: false,
      result: fail(`${which}_blocked`,
        `${which === 'start' ? 'Başlangıç' : 'Hedef'} hücresi (${cell.row},${cell.col}) geçilemez: ${name} — ${tr}. Sessiz kaydırma yapılmadı${snapWithin > 0 ? ` (${snapWithin} m içinde geçilebilir hücre yok)` : ''}.`,
        `${which === 'start' ? 'Start' : 'End'} cell (${cell.row},${cell.col}) is impassable: ${name} — ${en}. No silent snapping${snapWithin > 0 ? ` (no passable cell within ${snapWithin} m)` : ''}.`,
        { which, mode: cls, blocked: { which, row: cell.row, col: cell.col, xM: c.xM, yM: c.yM, statusName: name, requested: { xM: req.xM, yM: req.yM } }, provenance: { caveatTR: texts.tr, caveatEN: texts.en } }),
    };
  };
  const rs = resolveEnd('start', s0, startLocal);
  if (!rs.ok) return rs.result;
  const re = resolveEnd('end', e0, endLocal);
  if (!re.ok) return re.result;

  const straight = straightLineReport(win, { cost, status: field.status }, rs, re);
  const res = planRoute({ field: pf, start: { row: rs.row, col: rs.col }, end: { row: re.row, col: re.col }, budget: args.budget, options: plannerOptions });
  const timing = { elapsedMs: performance.now() - t0 };
  const resolution = { cellSizeM: win.cellSizeM, class: cls, thresholds: RESOLUTION_THRESHOLDS };
  const provenance = {
    model: field.provenance.model, modelVersion: field.provenance.version, serviceVersion: ROUTE_SERVICE_VERSION,
    mode: cls === 'eva_walkability' ? 'eva_walkability' : 'regional_preplan',
    caveatTR: texts.tr, caveatEN: texts.en,
    parameters: paramSummary(field), warnings: field.provenance.warnings,
    dem: { cellSizeM: win.cellSizeM, rows: win.rows, cols: win.cols },
  };
  const mode = provenance.mode;
  if (res.status !== 'ok') {
    return deepFreeze({
      status: res.status, reason: res.reason, reasonEN: `${PLANNER_STATUS_EN[res.status] ?? res.status} (planner detail in Turkish: ${res.reason})`, mode, path: [], segments: [], stats: null,
      startCell: endpointInfo(win, field, rs, startLocal, s0), endCell: endpointInfo(win, field, re, endLocal, e0),
      straightLine: straight, resolution, provenance, algorithm: res.algorithm, timing,
    });
  }

  const cellPath = res.path;
  const path = cellPath.map((p) => { const c = cellToLocal(win, p.row, p.col); return { xM: c.xM, yM: c.yM, row: p.row, col: p.col }; });
  const ll = args.localToLatLon ?? (win.adapter ? (x, y) => win.adapter.localToLatLon(x, y) : null);
  let pathLatLon;
  if (typeof ll === 'function') {
    pathLatLon = path.map((p) => { const q = ll(p.xM, p.yM); return { latDeg: q.latDeg, lonDeg: q.lonDeg }; });
  }
  const eva = mode === 'eva_walkability';
  const segments = res.segments.map((s) => {
    const a = cellToLocal(win, s.from.row, s.from.col), b = cellToLocal(win, s.to.row, s.to.col);
    const seg = { from: { xM: a.xM, yM: a.yM, row: s.from.row, col: s.from.col }, to: { xM: b.xM, yM: b.yM, row: s.to.row, col: s.to.col }, lengthM: s.lengthM, cost: s.cost };
    if (eva && s.score !== undefined) seg.score = s.score;
    return seg;
  });
  const prof = elevationProfile(win, cellPath);
  const st = res.stats;
  const stats = {
    lengthM: st.lengthM, totalCost: st.totalCost, gridCost: st.gridCost, costMetric: st.costMetric, meanCost: st.meanCost, maxCost: st.maxCost,
    impassableCrossings: st.impassableCrossings, cellsExpanded: st.cellsExpanded,
    maxSlopeDeg: num(st.maxSlopeDeg), elevationGainM: prof.gain, elevationLossM: prof.loss, elevationProfileComplete: prof.complete,
    tooSteepCellsOnStraightLine: straight.tooSteep, unknownCellsOnStraightLine: straight.unknown,
    straightLineLengthM: straight.lengthM, lengthRatioToStraight: straight.lengthM > 0 ? st.lengthM / straight.lengthM : null,
  };
  if (eva) {
    stats.minScore = num(st.minScore); stats.meanScore = num(st.meanScore);
    stats.estimatedDurationS = st.lengthM / speed;
    stats.durationAssumption = { ...DEFAULT_SCENARIO_SPEED_MPS, value: speed, note: 'Tahmini süre = düz yol uzunluğu / senaryo hızı; eğim, giysi veya metabolik model yok' };
  }
  for (const k of eva ? [] : CAV_SCORE_KEYS) delete stats[k];

  const out = {
    status: 'ok', reason: res.reason, mode, path, segments, stats,
    startCell: endpointInfo(win, field, rs, startLocal, s0), endCell: endpointInfo(win, field, re, endLocal, e0),
    straightLine: straight, resolution, provenance, algorithm: { ...res.algorithm, service: ROUTE_SERVICE_VERSION }, timing,
  };
  if (pathLatLon) out.pathLatLon = pathLatLon;
  if (!eva) out.modeNote = { tr: 'bölgesel ön planlama, yürünebilirlik puanı değildir', en: 'regional pre-planning, not a walkability score' };
  return deepFreeze(out);
}

function endpointInfo(win, field, rc, requested, cell0) {
  const c = cellToLocal(win, rc.row, rc.col);
  const idx = rc.row * win.cols + rc.col;
  return {
    row: rc.row, col: rc.col, xM: c.xM, yM: c.yM, requested: { xM: requested.xM, yM: requested.yM },
    snapOffsetM: cell0.snapOffsetM, statusName: cellStatusName(field, idx) === 'IMPASSABLE' ? 'OK' : cellStatusName(field, idx),
    snap: rc.snap,
  };
}

/**
 * Explains one cell given LOCAL metres (what minimap `onCellClick` needs). JSON-safe: non-finite numbers -> null.
 * Coarse windows return slope/status only (no score, roughness or score components).
 */
export function explainLocal(win, field, xM, yM) {
  assertWindow(win);
  const cls = win.resolutionClass;
  const texts = modeTexts(cls);
  const base = { schema: 'marswalk.explain-local.v1', mode: cls === 'eva_walkability' ? 'eva_walkability' : cls === 'regional_preplan' ? 'regional_preplan' : 'global_context', resolution: { cellSizeM: win.cellSizeM, class: cls } };
  const cell = localToCell(win, xM, yM);
  if (!cell.inside) return deepFreeze({ ...base, status: 'outside_coverage', reason: 'Nokta yüklenen DEM penceresinin dışında', reasonEN: 'Point is outside the loaded DEM window', caveatTR: texts.tr, caveatEN: texts.en });
  const centre = cellToLocal(win, cell.row, cell.col);
  if (cls === 'global_context') {
    return deepFreeze({ ...base, status: 'resolution_too_coarse', cell: { row: cell.row, col: cell.col }, centre, snapOffsetM: cell.snapOffsetM, caveatTR: texts.tr, caveatEN: texts.en });
  }
  if (!field) throw new TypeError('explainLocal: field gerekli');
  const ex = explainCell(field, cell.row, cell.col);
  const idx = cell.row * win.cols + cell.col;
  const known = ex.status === STATUS.OK || ex.status === STATUS.TOO_STEEP || ex.status === STATUS.EDGE_UNKNOWN;
  const out = {
    ...base, status: 'ok', cell: { row: cell.row, col: cell.col }, centre, snapOffsetM: cell.snapOffsetM,
    cellStatus: ex.statusName, passable: ex.status === STATUS.OK && ex.cost !== Infinity,
    slopeDeg: num(ex.slopeDeg), elevationM: known && Number.isFinite(win.elevation[idx]) ? win.elevation[idx] : null,
    caveatTR: texts.tr, caveatEN: texts.en,
    provenance: { model: field.provenance.model, modelVersion: field.provenance.version, parameters: paramSummary(field) },
  };
  if (cls === 'eva_walkability') {
    out.score = ex.score; out.roughnessM = num(ex.roughnessM); out.cost = num(ex.cost); out.costIsInfinite = ex.cost === Infinity;
    out.components = ex.components.map((c) => ({ name: c.name, input: num(c.input), unit: c.unit, contribution: num(c.contribution), formula: c.formula }));
  } else {
    out.note = { tr: 'bölgesel ön planlama, yürünebilirlik puanı değildir', en: 'regional pre-planning, not a walkability score' };
  }
  return deepFreeze(out);
}
