// EVA walkability cost model (Stage 23A).
//
// PLANNING AID ONLY. The score is a transparent, adjustable planning indicator for human EVA walking.
// It is NOT a safety certificate, NOT a rover trafficability model and does NOT detect rocks/boulders
// (a ~1 m DTM cannot resolve individual rocks). Valid only at ~1 m DTM scale (HiRISE); coarse DEMs must not use it.
//
// Pure module: no DOM, no I/O, no mutable singletons. Grid convention: row-major, row 0 = north, col 0 = west.
//
// Per-cell formulas (3x3 window around the cell; cell size h = cellSizeM):
//   slope:      Horn (1981) via geo.horn3x3Gradient  -> slopeDeg = atan(hypot(dz/dx, dz/dy))
//   roughness:  RMS of the 8 neighbour residuals from the Horn plane through the centre cell
//               r = sqrt( mean_k ( z_k - (z_c + dzdx*dx_k + dzdy*dy_k) )^2 ), dx_k,dy_k = +-h. Unit: metres.
//               A perfect ramp gives r = 0 (slope is NOT double-counted). Depends on h: valid only near the
//               calibration scale (~1 m); do not compare values across different cell sizes.
//   slopeFactor = 0 if slope >= maxSlopeDeg, else 1 - d^2, d = max(0, (tan s - tan c)/(tan m - tan c))
//                 (c = comfortableSlopeDeg, m = maxSlopeDeg; plateau 1 below c, C1-smooth, monotone, 0 at m)
//   roughFactor = 1 / (1 + (r / roughnessRefM)^2)   (0.5 at r = roughnessRefM)
//   score       = round(100 * slopeFactor * roughFactor)            (0..100)
//   cost        = 1 + costK * (1 - slopeFactor*roughFactor)^costP   (>= 1, per-metre multiplier; Infinity if impassable)
// Unknown data (no-data, invalid, outside coverage, non-finite, or 3x3 window touching unknown/grid edge)
// is never passable: cost = Infinity, score = 0, slope/roughness = NaN.

import { horn3x3Gradient } from '../geo/geo.js';

export const STATUS = Object.freeze({ OK: 0, TOO_STEEP: 1, NO_DATA: 2, OUT_OF_COVERAGE: 3, INVALID: 4, EDGE_UNKNOWN: 5 });
const STATUS_NAMES = Object.freeze(['OK', 'TOO_STEEP', 'NO_DATA', 'OUT_OF_COVERAGE', 'INVALID', 'EDGE_UNKNOWN']);

const MODEL_NAME = 'marswalk-eva-walkability';
const MODEL_VERSION = '1.0.0';
const NO_SRC = 'Birincil kaynak bulunamadı (bkz. stage23a-cost-model-audit.md); senaryo varsayımı';

function leaf(value, unit, status, source) { return { value, unit, status, source }; }
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}

export const DEFAULT_COST_PARAMS = deepFreeze({
  maxSlopeDeg: leaf(20, 'deg', 'scenario', NO_SRC + '; Artemis planlama değeri ~20° ikincil kaynaklarda anıldı, birincil belge doğrulanmadı'),
  comfortableSlopeDeg: leaf(8, 'deg', 'scenario', NO_SRC + '; Apollo 12 anlatımında 10° eğimde sınırlı süre yürünebildiği bildirildi (ikincil)'),
  roughnessRefM: leaf(0.25, 'm', 'scenario', 'Tasarım seçimi (scenario); kalibrasyon yok — 1 m DTM ölçeğinde 3x3 plan-artığı RMS yarı-puan değeri'),
  costK: leaf(9, '1', 'scenario', 'Tasarım seçimi: en kötü geçilebilir hücre maliyeti 1+costK'),
  costP: leaf(1.5, '1', 'scenario', 'Tasarım seçimi: maliyet eğrisi üssü'),
  marsGravityMps2: leaf(3.71, 'm/s^2', 'sourced', 'NASA Planet Compare (Mars yüzey yerçekimi), https://solarsystem.nasa.gov/planet-compare/?intent=121 — değer proje config.js kaynak listesinden; bu modülde yeniden çekilmedi. Skorları etkilemez, yalnız bilgi amaçlı'),
});

const OVERRIDE_SOURCE = 'Kullanıcı geçersiz kılma (senaryo)';

const RANGES = {
  maxSlopeDeg: [0, 60, true], comfortableSlopeDeg: [0, 60, false], roughnessRefM: [0, 10, true],
  costK: [0, 1000, false], costP: [0.1, 10, false], marsGravityMps2: [0, 30, true],
};

function resolveParams(override) {
  const eff = {};
  for (const k of Object.keys(DEFAULT_COST_PARAMS)) eff[k] = { ...DEFAULT_COST_PARAMS[k] };
  if (override != null) {
    if (typeof override !== 'object' || Array.isArray(override)) throw new TypeError('params bir nesne olmalı');
    for (const k of Object.keys(override)) {
      if (!(k in eff)) throw new TypeError(`Bilinmeyen parametre: ${k}`);
      const v = override[k];
      // Overrides are ALWAYS scenario values with a fixed source text; only DEFAULT leaves may be 'sourced'.
      if (typeof v === 'number') { eff[k].value = v; eff[k].status = 'scenario'; eff[k].source = OVERRIDE_SOURCE; }
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const f of Object.keys(v)) if (!(f in eff[k]) && f !== 'note') throw new TypeError(`Bilinmeyen alan: ${k}.${f}`);
        if (v.status !== undefined && v.status !== 'scenario') throw new TypeError(`${k}.status geçersiz kılmada yalnız 'scenario' olabilir (sourced yalnız varsayılanlara aittir)`);
        if (v.note !== undefined && typeof v.note !== 'string') throw new TypeError(`${k}.note metin olmalı`);
        if (v.value !== undefined) eff[k].value = v.value;
        if (v.unit !== undefined) eff[k].unit = v.unit;
        eff[k].status = 'scenario';
        eff[k].source = OVERRIDE_SOURCE; // user-supplied source text is never trusted as provenance
        const notes = [];
        if (typeof v.source === 'string' && v.source) notes.push(`Kullanıcı kaynak beyanı (doğrulanmadı): ${v.source}`);
        if (v.note) notes.push(v.note);
        if (notes.length) eff[k].note = notes.join(' | ');
      } else throw new TypeError(`Parametre ${k} sayı veya {value,...} olmalı`);
    }
  }
  for (const k of Object.keys(eff)) {
    const p = eff[k];
    if (typeof p.value !== 'number' || !Number.isFinite(p.value)) throw new TypeError(`${k}.value sonlu sayı olmalı`);
    if (p.status !== 'sourced' && p.status !== 'scenario') throw new TypeError(`${k}.status 'sourced'|'scenario' olmalı`);
    if (typeof p.unit !== 'string' || typeof p.source !== 'string' || !p.source) throw new TypeError(`${k}.unit/source geçersiz`);
    const [lo, hi, exclLo] = RANGES[k];
    if (p.value > hi || (exclLo ? p.value <= lo : p.value < lo)) throw new TypeError(`${k}.value aralık dışı (${exclLo ? '(' : '['}${lo}, ${hi}])`);
  }
  if (!(eff.comfortableSlopeDeg.value < eff.maxSlopeDeg.value)) throw new TypeError('comfortableSlopeDeg < maxSlopeDeg olmalı');
  return deepFreeze(eff);
}

const D2R = Math.PI / 180;
function factors(slopeDeg, roughM, P) {
  const m = P.maxSlopeDeg.value, c = P.comfortableSlopeDeg.value;
  let slopeFactor = 0;
  if (slopeDeg < m) {
    const tc = Math.tan(c * D2R), tm = Math.tan(m * D2R), ts = Math.tan(slopeDeg * D2R);
    const d = Math.max(0, (ts - tc) / (tm - tc));
    slopeFactor = Math.max(0, 1 - d * d);
  }
  const q = roughM / P.roughnessRefM.value;
  const roughFactor = 1 / (1 + q * q);
  const combined = slopeFactor * roughFactor;
  const cost = slopeDeg >= m ? Infinity : 1 + P.costK.value * Math.pow(1 - combined, P.costP.value);
  return { slopeFactor, roughFactor, combined, cost };
}

const PROVENANCE = deepFreeze({
  model: MODEL_NAME, version: MODEL_VERSION,
  slope: 'Horn 3x3 (geo.horn3x3Gradient)', roughness: '3x3 Horn düzlemi artığı RMS (m); hücre boyutuna bağlı',
  caveatTR: 'Planlama göstergesi — güvenlik sertifikası değildir; nihai rota kararı ekip ve görev kontrolündedir. Kaya/blok tespiti yapmaz; yalnız ~1 m DTM ölçeğinde geçerlidir. Eşikler birincil kaynaksız "senaryo" parametreleridir; rover limitleri insan limiti değildir. Bilinmeyen veri asla geçilebilir sayılmaz.',
  caveatEN: 'Planning aid, not a safety certificate; final route decisions rest with the crew and mission control. No rock/boulder detection; valid only at ~1 m DTM scale. Thresholds are unsourced "scenario" parameters; rover limits are not human limits. Unknown data is never treated as passable.',
});

const WARN_NO_UNKNOWN = Object.freeze({
  code: 'NO_UNKNOWN_DATA_DECLARED',
  textTR: 'noDataValue ve validMin/validMax verilmedi: sentinel (ör. -9999) değerleri geçerli arazi sayılır. Çağıran taraf kaynağın no-data değerini veya geçerli aralığı bildirmelidir.',
  textEN: 'Neither noDataValue nor validMin/validMax was declared: sentinel values (e.g. -9999) are treated as valid terrain. Callers must declare the source no-data value or a valid range.',
});

function optFinite(name, v) {
  if (v === undefined) return undefined; // undefined = not provided
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} sonlu bir sayı olmalı (verildi: ${String(v)})`);
  return v;
}

/**
 * Build the walkability field. Input contract:
 *  - elevation: Float32Array/Float64Array/Array, length rows*cols, row-major, row 0 = north.
 *  - noDataValue / validMin / validMax: `undefined` = not declared; otherwise MUST be finite numbers (TypeError else).
 *    CALLERS MUST declare the source's sentinel and/or valid range; if neither is declared a sentinel plateau
 *    (e.g. -9999) is treated as terrain and `provenance.warnings` carries NO_UNKNOWN_DATA_DECLARED.
 *  - coverageMask: array/typed array of length rows*cols whose values must be exactly 0 or 1 (true accepted as 1).
 *    A cell is covered ONLY if its value is 1/true; anything else (0, false, null, NaN, undefined, 2...) is OUT_OF_COVERAGE.
 */
export function buildWalkabilityField(input) {
  if (!input || typeof input !== 'object') throw new TypeError('girdi nesnesi gerekli');
  const { elevation, rows, cols, cellSizeM, coverageMask, params } = input;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) throw new TypeError('rows/cols pozitif tam sayı olmalı');
  if (!(cellSizeM > 0) || !Number.isFinite(cellSizeM)) throw new TypeError('cellSizeM pozitif sonlu olmalı');
  const n = rows * cols;
  if (!elevation || typeof elevation.length !== 'number' || elevation.length !== n) throw new TypeError('elevation uzunluğu rows*cols olmalı');
  if (coverageMask != null) {
    if (!(Array.isArray(coverageMask) || (ArrayBuffer.isView(coverageMask) && !(coverageMask instanceof DataView)))) throw new TypeError('coverageMask dizi veya typed array olmalı');
    if (coverageMask.length !== n) throw new TypeError('coverageMask uzunluğu rows*cols olmalı');
  }
  const noDataValue = optFinite('noDataValue', input.noDataValue);
  const validMin = optFinite('validMin', input.validMin);
  const validMax = optFinite('validMax', input.validMax);
  if (validMin !== undefined && validMax !== undefined && validMin > validMax) throw new TypeError('validMin <= validMax olmalı');
  const P = resolveParams(params);
  const ndRaw = noDataValue !== undefined ? noDataValue : null;
  const ndF = ndRaw !== null ? Math.fround(ndRaw) : null;
  // Elevation is typically float32: compare against the float32-rounded bounds so boundary cells are accepted.
  const vmin = validMin !== undefined ? Math.fround(validMin) : -Infinity;
  const vmax = validMax !== undefined ? Math.fround(validMax) : Infinity;
  const provenance = (noDataValue === undefined && validMin === undefined && validMax === undefined)
    ? deepFreeze({ ...PROVENANCE, warnings: [{ ...WARN_NO_UNKNOWN }] })
    : deepFreeze({ ...PROVENANCE, warnings: [] });

  const cost = new Float32Array(n).fill(Infinity);
  const score = new Uint8Array(n);
  const status = new Uint8Array(n).fill(STATUS.EDGE_UNKNOWN);
  const slopeDeg = new Float32Array(n).fill(NaN);
  const roughnessM = new Float32Array(n).fill(NaN);

  // Pass 1: intrinsic cell state; `unknown[i]` = 1 if the cell itself cannot be used as input.
  const unknown = new Uint8Array(n);
  const own = new Uint8Array(n); // own status (OK / NO_DATA / OUT_OF_COVERAGE / INVALID)
  for (let i = 0; i < n; i++) {
    const z = elevation[i];
    if (coverageMask != null && coverageMask[i] !== 1 && coverageMask[i] !== true) { own[i] = STATUS.OUT_OF_COVERAGE; unknown[i] = 1; }
    else if (ndRaw !== null && (z === ndRaw || Math.fround(z) === ndF)) { own[i] = STATUS.NO_DATA; unknown[i] = 1; }
    else if (!Number.isFinite(z) || z < vmin || z > vmax) { own[i] = STATUS.INVALID; unknown[i] = 1; }
  }

  const z9 = new Float64Array(9);
  const h = cellSizeM;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (own[i] !== STATUS.OK) { status[i] = own[i]; continue; }
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) continue; // EDGE_UNKNOWN
      let bad = false, k = 0;
      for (let dr = -1; dr <= 1 && !bad; dr++) {
        const base = (r + dr) * cols + c;
        for (let dc = -1; dc <= 1; dc++) {
          const j = base + dc;
          if (unknown[j]) { bad = true; break; }
          z9[k++] = elevation[j];
        }
      }
      if (bad) continue; // EDGE_UNKNOWN (window touches unknown cell)
      const g = horn3x3Gradient(z9, h);
      if (!g) continue;
      // Roughness: RMS residual of 8 neighbours from the Horn plane through the centre.
      const zc = z9[4], gx = g.dzdx, gy = g.dzdy;
      let ss = 0;
      for (let q = 0; q < 9; q++) {
        if (q === 4) continue;
        const dx = ((q % 3) - 1) * h, dy = (1 - Math.floor(q / 3)) * h; // east +, north +
        const res = z9[q] - (zc + gx * dx + gy * dy);
        ss += res * res;
      }
      const s = Math.fround(g.slopeDeg), rough = Math.fround(Math.sqrt(ss / 8));
      slopeDeg[i] = s; roughnessM[i] = rough;
      const f = factors(s, rough, P);
      if (s >= P.maxSlopeDeg.value) { status[i] = STATUS.TOO_STEEP; continue; }
      status[i] = STATUS.OK;
      score[i] = Math.round(100 * f.combined);
      cost[i] = f.cost;
    }
  }
  return { schema: 'marswalk.cost-field.v1', rows, cols, cellSizeM, cost, score, status, slopeDeg, roughnessM, params: P, provenance };
}

export function explainCell(field, row, col) {
  if (!field || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= field.rows || col >= field.cols) {
    throw new TypeError('explainCell: geçersiz alan veya hücre indeksi');
  }
  const i = row * field.cols + col;
  const st = field.status[i];
  const out = {
    status: st, statusName: STATUS_NAMES[st], slopeDeg: field.slopeDeg[i], roughnessM: field.roughnessM[i],
    score: field.score[i], cost: field.cost[i], components: [], caveat: field.provenance.caveatTR,
    caveatTR: field.provenance.caveatTR, caveatEN: field.provenance.caveatEN,
  };
  const P = field.params;
  const s = out.slopeDeg, rgh = out.roughnessM;
  if (Number.isNaN(s)) {
    out.components.push({ name: 'veri durumu', input: STATUS_NAMES[st], unit: '-', contribution: 0,
      formula: 'Bilinmeyen/geçersiz veri: skor 0, maliyet = Infinity (asla geçilebilir sayılmaz)' });
    return out;
  }
  const f = factors(s, rgh, P);
  out.components.push(
    { name: 'eğim', input: s, unit: 'deg', contribution: f.slopeFactor,
      formula: `slopeFactor = 0 (s >= ${P.maxSlopeDeg.value}°) aksi 1 - d^2, d = max(0,(tan s - tan ${P.comfortableSlopeDeg.value}°)/(tan ${P.maxSlopeDeg.value}° - tan ${P.comfortableSlopeDeg.value}°))` },
    { name: 'pürüzlülük', input: rgh, unit: 'm', contribution: f.roughFactor,
      formula: `roughFactor = 1/(1+(r/${P.roughnessRefM.value} m)^2); r = 3x3 Horn düzlemi artığı RMS` },
    { name: 'puan', input: f.combined, unit: '1', contribution: out.score,
      formula: 'score = round(100 * slopeFactor * roughFactor)' },
    { name: 'maliyet', input: 1 - f.combined, unit: '1', contribution: out.cost,
      formula: `cost = 1 + ${P.costK.value} * (1 - slopeFactor*roughFactor)^${P.costP.value}; eğim >= eşik ise Infinity` },
  );
  return out;
}
