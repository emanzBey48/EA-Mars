// Stage K3-10 — pure resampling of a coordinate-bridged elevation source onto a REGULAR local metre grid.
//
// Why: a legacy DTM read through a coordinate bridge (geographic reprojection) has cells whose local-metre
// footprint is not a regular grid (E-W ~1.0457 m vs N-S ~1.0101 m in the canonical plane). Minimap and route
// planner assume a regular grid, so their cell (row, col) and the sampler's cell for the same local point differ.
// This module rebuilds the source as a regular grid whose cell centres are sampled through the SAME bridge the
// sampler uses, so both consumers agree on the terrain at every point.
//
// Pure module: no DOM, network or file access. The elevation source is injected:
//   sampleElevation(xM, yM) -> { status, value }   (app sampler contract; status 'ok' means a finite value)
//   adapter (bridge)        -> { localToCell(x,y) -> {row,col}, pixelToLocal(row,col) -> {x,y} }
//                              (`provider.adapter` of a GridElevationLayer; required for 'bilinear')
// No-data is never written as 0: missing cells hold `noDataValue` (finite, default = PDS MISSING_CONSTANT
// 0xFF7FFFFB) and `validMask` = 0. A bilinear cell is valid only if all four bracketing source cells are valid,
// so a missing neighbour never leaks into a valid cell.

export const LOCAL_GRID_SCHEMA = 'marswalk.local-grid.v1';
export const LOCAL_GRID_METHOD = 'coordinate-bridge-resample';
export const LOCAL_GRID_INTERPOLATIONS = Object.freeze(['bilinear', 'nearest']);
/** PDS3 MISSING_CONSTANT of the legacy HiRISE DTM label (`missingConstantHex`). */
export const LEGACY_MISSING_CONSTANT_BITS = 0xFF7FFFFB;

const STATUS_OK = 'ok'; // identical to STATUS.OK in surface/layers.js (geo/ must not import surface/)
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Exact float32 value of a 32-bit pattern (same method as main.js / legacy-analysis.mjs). */
export function noDataFloat32FromBits(bits) {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, bits >>> 0, true);
  return dv.getFloat32(0, true);
}

export const DEFAULT_NO_DATA_VALUE = noDataFloat32FromBits(LEGACY_MISSING_CONSTANT_BITS);

function validateInputs({ sampleElevation, adapter, bounds, cellSizeM, interpolation, noDataValue, validMin, validMax }) {
  if (typeof sampleElevation !== 'function') throw new TypeError('resampleToRegularLocalGrid: sampleElevation fonksiyonu gerekli');
  if (!bounds || typeof bounds !== 'object') throw new TypeError('resampleToRegularLocalGrid: bounds {minXM,maxXM,minYM,maxYM} gerekli');
  const { minXM, maxXM, minYM, maxYM } = bounds;
  if (![minXM, maxXM, minYM, maxYM].every(isFiniteNum)) throw new TypeError('bounds sonlu sayılar olmalı');
  if (!(maxXM > minXM) || !(maxYM > minYM)) throw new RangeError('bounds: maxXM > minXM ve maxYM > minYM olmalı');
  if (!isFiniteNum(cellSizeM) || !(cellSizeM > 0)) throw new RangeError('cellSizeM pozitif sonlu olmalı');
  if (!LOCAL_GRID_INTERPOLATIONS.includes(interpolation)) throw new RangeError(`interpolation ${LOCAL_GRID_INTERPOLATIONS.join('|')} olmalı`);
  if (interpolation === 'bilinear') {
    if (!adapter || typeof adapter.localToCell !== 'function' || typeof adapter.pixelToLocal !== 'function') {
      throw new TypeError('bilinear için adapter (localToCell/pixelToLocal köprüsü) gerekli');
    }
  }
  if (!isFiniteNum(noDataValue)) throw new TypeError('noDataValue sonlu sayı olmalı');
  if ((validMin !== undefined) !== (validMax !== undefined)) throw new TypeError('validMin ve validMax birlikte verilmeli');
  if (validMin !== undefined && !(isFiniteNum(validMin) && isFiniteNum(validMax) && validMin <= validMax)) {
    throw new RangeError('validMin <= validMax sonlu sayılar olmalı');
  }
}

/**
 * Resamples the source onto a regular grid of `cellSizeM` cells covering `bounds`.
 * Cell (row, col) centre: x = nwXM + (col + 0.5)·cellSizeM, y = nwYM − (row + 0.5)·cellSizeM (row 0 = north).
 * The grid starts at (minXM, maxYM); rows/cols are the ceilings of the spans, so the last cell may reach past
 * maxXM/minYM by less than one cell.
 *
 * @returns frozen result: { schema, elevation: Float32Array, validMask: Uint8Array, rows, cols, cellSizeM,
 *   nwXM, nwYM, widthM, heightM, noDataValue, validMin?, validMax?, stats: {total, known, unknown}, meta }
 */
export function resampleToRegularLocalGrid({
  sampleElevation,
  adapter = null,
  bounds,
  cellSizeM = 1,
  interpolation = 'bilinear',
  noDataValue = DEFAULT_NO_DATA_VALUE,
  validMin,
  validMax,
} = {}) {
  validateInputs({ sampleElevation, adapter, bounds, cellSizeM, interpolation, noDataValue, validMin, validMax });
  const { minXM, maxXM, minYM, maxYM } = bounds;
  const cols = Math.ceil((maxXM - minXM) / cellSizeM - 1e-9);
  const rows = Math.ceil((maxYM - minYM) / cellSizeM - 1e-9);
  if (!(rows >= 1 && cols >= 1)) throw new RangeError('bounds ve cellSizeM ile en az bir hücre üretilmeli');
  const nwXM = minXM, nwYM = maxYM;
  const ndF = Math.fround(noDataValue);
  const n = rows * cols;
  const elevation = new Float32Array(n).fill(ndF);
  const validMask = new Uint8Array(n);
  let known = 0;

  const sampleOk = (xM, yM) => {
    const s = sampleElevation(xM, yM);
    if (!s || typeof s !== 'object') throw new TypeError('sampleElevation {status,value} döndürmeli');
    return s.status === STATUS_OK && isFiniteNum(s.value) ? s.value : NaN;
  };

  if (interpolation === 'nearest') {
    for (let row = 0; row < rows; row++) {
      const y = nwYM - (row + 0.5) * cellSizeM;
      for (let col = 0; col < cols; col++) {
        const x = nwXM + (col + 0.5) * cellSizeM;
        const v = sampleOk(x, y);
        if (Number.isNaN(v)) continue;
        const i = row * cols + col;
        elevation[i] = v; validMask[i] = 1; known++;
      }
    }
  } else {
    // Bilinear: corner values are source cell centres sampled once through the sampler and cached in a
    // window that covers every source cell touched by the target grid (+2 cell margin).
    const c0 = adapter.localToCell(minXM, maxYM), c1 = adapter.localToCell(maxXM, minYM);
    const c2 = adapter.localToCell(minXM, minYM), c3 = adapter.localToCell(maxXM, maxYM);
    const rMin = Math.min(c0.row, c1.row, c2.row, c3.row) - 2, rMax = Math.max(c0.row, c1.row, c2.row, c3.row) + 2;
    const cMin = Math.min(c0.col, c1.col, c2.col, c3.col) - 2, cMax = Math.max(c0.col, c1.col, c2.col, c3.col) + 2;
    const cacheW = cMax - cMin + 1, cacheN = (rMax - rMin + 1) * cacheW;
    const cacheVal = new Float64Array(cacheN);
    const cacheState = new Uint8Array(cacheN); // 0 = not computed, 1 = known, 2 = unknown
    const cornerValue = (r, c) => {
      const inside = r >= rMin && r <= rMax && c >= cMin && c <= cMax;
      const k = inside ? (r - rMin) * cacheW + (c - cMin) : -1;
      if (k >= 0 && cacheState[k] !== 0) return cacheState[k] === 1 ? cacheVal[k] : NaN;
      const p = adapter.pixelToLocal(r, c);
      const v = sampleOk(p.x, p.y);
      if (k >= 0) { cacheState[k] = Number.isNaN(v) ? 2 : 1; cacheVal[k] = v; }
      return v;
    };
    for (let row = 0; row < rows; row++) {
      const y = nwYM - (row + 0.5) * cellSizeM;
      for (let col = 0; col < cols; col++) {
        const x = nwXM + (col + 0.5) * cellSizeM;
        // Bracket the query point by the four source cell centres around it (bridge is affine: cells are
        // locally a parallelogram grid, and the bracket is chosen from the nearest source cell's neighbours).
        const near = adapter.localToCell(x, y);
        const r0 = near.row, cc0 = near.col;
        const p00 = adapter.pixelToLocal(r0, cc0);
        const pE = adapter.pixelToLocal(r0, cc0 + 1);
        const pS = adapter.pixelToLocal(r0 + 1, cc0);
        const cB = (x - p00.x) * (pE.x - p00.x) >= 0 ? cc0 + 1 : cc0 - 1;
        const rB = (y - p00.y) * (pS.y - p00.y) >= 0 ? r0 + 1 : r0 - 1;
        const pCB = adapter.pixelToLocal(r0, cB);
        const pRB = adapter.pixelToLocal(rB, cc0);
        const tx = (x - p00.x) / (pCB.x - p00.x);
        const ty = (y - p00.y) / (pRB.y - p00.y);
        const v00 = cornerValue(r0, cc0), v10 = cornerValue(r0, cB);
        const v01 = cornerValue(rB, cc0), v11 = cornerValue(rB, cB);
        if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v01) || Number.isNaN(v11)) continue;
        const v = (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 + (1 - tx) * ty * v01 + tx * ty * v11;
        if (!Number.isFinite(v)) continue;
        const i = row * cols + col;
        elevation[i] = v; validMask[i] = 1; known++;
      }
    }
  }

  const total = n;
  const stats = Object.freeze({ total, known, unknown: total - known });
  const meta = Object.freeze({
    schema: LOCAL_GRID_SCHEMA,
    method: LOCAL_GRID_METHOD,
    source: 'coordinate bridge',
    interpolation,
    cellSizeM,
    rows, cols,
    nwXM, nwYM,
    boundsM: Object.freeze({ minXM, maxXM, minYM, maxYM }),
    noDataValue: ndF,
    description: 'Koordinat köprüsü üzerinden düzenli yerel ızgara; kaynak no-data 0 yapılmadı, eksik hücreler noDataValue ile işaretli.',
  });
  return Object.freeze({
    schema: LOCAL_GRID_SCHEMA,
    elevation, validMask,
    rows, cols, cellSizeM, nwXM, nwYM,
    widthM: cols * cellSizeM, heightM: rows * cellSizeM,
    noDataValue: ndF,
    validMin, validMax,
    stats, meta,
  });
}

/**
 * Maps a resample result to the input shape of `route-service.createDemWindow` (planner window and minimap
 * terrain both consume the same regular grid). Pure: returns a new plain object.
 */
export function toDemWindowInput(result, { adapter = null } = {}) {
  if (!result || result.schema !== LOCAL_GRID_SCHEMA) throw new TypeError('toDemWindowInput: resampleToRegularLocalGrid çıktısı gerekli');
  return {
    elevation: result.elevation,
    rows: result.rows, cols: result.cols, cellSizeM: result.cellSizeM,
    nwXM: result.nwXM, nwYM: result.nwYM,
    noDataValue: result.noDataValue,
    validMin: result.validMin, validMax: result.validMax,
    coverageMask: result.validMask,
    adapter,
  };
}
