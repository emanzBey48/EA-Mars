// Stage 37A: regional (MOLA-class) height grid sampling, resampling to the project's local metre plane,
// comparison against a local DTM window, and a latitude-convention experiment.
//
// Pure: no fs / fetch / DOM. Uses geo.js (projection, local adapter) and trek-tiles.js (Mars sphere radius).
//
// Scientific rules enforced here:
//  * No-data is never converted to 0. A bilinear sample touching any invalid neighbour is null (no edge smoothing).
//  * The project plane is the sphere R = 3396190 m with PLANETOCENTRIC latitude (geo.js EquirectangularProjection);
//    the local DTM label declares PLANETOCENTRIC latitude too.
//  * Hypothesis H1: the Trek grid's latitude axis is the same planetocentric latitude (identity mapping).
//    Hypothesis H2: the Trek grid's latitude axis is GEODETIC on the ellipsoid of the GeoTIFF GeoKeys
//    (a, 1/f from the file). H2 is a hypothesis about what the grid index means; it is not confirmed by sampling.
//  * The experiment reports numbers only. Its verdict is always `needs_review`: the vertical datum of the local DTM is
//    not verified, so an absolute offset cannot be attributed to a latitude convention.

import { EquirectangularProjection, WorldAdapter } from './geo.js';
import { MARS_RADIUS_M } from './trek-tiles.js';

const DEG = Math.PI / 180;
export const SHAPE_THRESHOLD_M = 0.5; // assumption used for the "discriminable by shape" verdict; stated in the report
export const DEFAULT_STRIDE = 10; // local DTM cells between sample points (1 m DTM -> 10 m spacing)
const IDENTITY = (latDeg) => latDeg;

function finite(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Validates a parsed raster (see parseExportedTiff) and returns a frozen grid view. */
export function createRegionalGrid(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new TypeError('createRegionalGrid: parsed raster bekleniyor');
  const { width, height, values, validMask, bounds, pixelSizeDeg } = parsed;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError('createRegionalGrid: geçersiz boyut');
  }
  if (!values || values.length !== width * height) throw new RangeError('createRegionalGrid: values uzunluğu boyutla uyuşmuyor');
  if (!validMask || validMask.length !== width * height) throw new RangeError('createRegionalGrid: validMask uzunluğu uyuşmuyor');
  if (!bounds || ![bounds.west, bounds.east, bounds.south, bounds.north].every(finite)) {
    throw new RangeError('createRegionalGrid: bounds geçersiz');
  }
  if (!(pixelSizeDeg > 0) || !finite(pixelSizeDeg)) throw new RangeError('createRegionalGrid: pixelSizeDeg geçersiz');
  return Object.freeze({ width, height, values, validMask, bounds, pixelSizeDeg });
}

function gridIndex(grid, lonDeg, latDeg) {
  return {
    u: (lonDeg - grid.bounds.west) / grid.pixelSizeDeg - 0.5, // continuous column of cell centres
    v: (grid.bounds.north - latDeg) / grid.pixelSizeDeg - 0.5, // continuous row of cell centres
  };
}

/** Nearest cell: status 'ok' | 'no_data' | 'outside'. Never converts no-data to 0. */
export function sampleNearest(grid, lonDeg, latDeg) {
  if (!finite(lonDeg) || !finite(latDeg)) return { status: 'outside', value: null, col: null, row: null };
  const { u, v } = gridIndex(grid, lonDeg, latDeg);
  const col = Math.floor(u + 0.5);
  const row = Math.floor(v + 0.5);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return { status: 'outside', value: null, col, row };
  const i = row * grid.width + col;
  if (!grid.validMask[i] || !Number.isFinite(grid.values[i])) return { status: 'no_data', value: null, col, row };
  return { status: 'ok', value: grid.values[i], col, row };
}

/**
 * Bilinear sample at cell-centre interpolation. Returns null when the point is outside the cell-centre hull,
 * or when ANY of the (up to four) neighbouring cells is no-data. No edge smoothing, no zero substitution.
 */
export function sampleBilinear(grid, lonDeg, latDeg) {
  if (!finite(lonDeg) || !finite(latDeg)) return null;
  const { u, v } = gridIndex(grid, lonDeg, latDeg);
  const W = grid.width;
  const H = grid.height;
  if (!(u >= 0 && u <= W - 1 && v >= 0 && v <= H - 1)) return null;
  const c0 = Math.floor(u);
  const r0 = Math.floor(v);
  const c1 = c0 >= W - 1 ? c0 : c0 + 1;
  const r1 = r0 >= H - 1 ? r0 : r0 + 1;
  const fu = u - c0;
  const fv = v - r0;
  const i00 = r0 * W + c0;
  const i01 = r0 * W + c1;
  const i10 = r1 * W + c0;
  const i11 = r1 * W + c1;
  if (!grid.validMask[i00] || !grid.validMask[i01] || !grid.validMask[i10] || !grid.validMask[i11]) return null;
  const a = grid.values[i00];
  const b = grid.values[i01];
  const c = grid.values[i10];
  const d = grid.values[i11];
  const value = (1 - fv) * ((1 - fu) * a + fu * b) + fv * ((1 - fu) * c + fu * d);
  return Number.isFinite(value) ? value : null;
}

/** Geocentric (planetocentric) -> geodetic latitude on an ellipsoid with inverse flattening invFlattening. */
export function planetocentricToGeodeticDeg(latDeg, invFlattening) {
  if (!finite(latDeg) || !finite(invFlattening) || invFlattening <= 0) throw new RangeError('geçersiz enlem/düzleşme');
  const f = 1 / invFlattening;
  const oneMinusE2 = (1 - f) * (1 - f);
  return Math.atan(Math.tan(latDeg * DEG) / oneMinusE2) / DEG;
}

/** Geodetic -> planetocentric latitude (inverse of planetocentricToGeodeticDeg). */
export function geodeticToPlanetocentricDeg(latDeg, invFlattening) {
  if (!finite(latDeg) || !finite(invFlattening) || invFlattening <= 0) throw new RangeError('geçersiz enlem/düzleşme');
  const f = 1 / invFlattening;
  return Math.atan((1 - f) * (1 - f) * Math.tan(latDeg * DEG)) / DEG;
}

/**
 * Local metre frame of the project: equirectangular sphere (lat_ts 0, lon0 0) shifted so the origin point is (0,0).
 * Returns { adapter, originLatDeg, originLonDeg, radiusM }. Uses geo.js conventions (x east, y north).
 */
export function createLocalFrame({ originLatDeg, originLonDeg, radiusM = MARS_RADIUS_M }) {
  if (![originLatDeg, originLonDeg, radiusM].every(finite)) throw new RangeError('createLocalFrame: parametreler geçersiz');
  const projection = new EquirectangularProjection({ radiusM, centerLatDeg: 0, centerLonDeg: 0 });
  const adapter = new WorldAdapter(projection, null, { latDeg: originLatDeg, lonDeg: originLonDeg });
  return Object.freeze({ adapter, originLatDeg, originLonDeg, radiusM, projection });
}

/**
 * Resamples the regional grid onto a local metre grid.
 * extent: { xMinM, xMaxM, yMinM, yMaxM, cellM } in local metres (x east, y north, origin at the frame origin).
 * Cell (row, col) centre: x = xMinM + (col + 0.5) cellM; y = yMaxM - (row + 0.5) cellM.
 * latMap maps the planetocentric latitude of the local point to the grid's latitude axis (H1: identity).
 * Invalid cells: values[i] = NaN and validMask[i] = 0 (never 0).
 */
export function resampleToLocalGrid(grid, frame, extent, { latMap = IDENTITY } = {}) {
  validateExtent(extent);
  const width = Math.round((extent.xMaxM - extent.xMinM) / extent.cellM);
  const height = Math.round((extent.yMaxM - extent.yMinM) / extent.cellM);
  const values = new Float32Array(width * height);
  const validMask = new Uint8Array(width * height);
  let validCount = 0;
  for (let row = 0; row < height; row++) {
    const y = extent.yMaxM - (row + 0.5) * extent.cellM;
    for (let col = 0; col < width; col++) {
      const x = extent.xMinM + (col + 0.5) * extent.cellM;
      const { latDeg, lonDeg } = frame.adapter.localToLatLon(x, y);
      const v = sampleBilinear(grid, lonDeg, latMap(latDeg));
      const i = row * width + col;
      if (v === null) {
        values[i] = Number.NaN;
      } else {
        values[i] = v;
        validMask[i] = 1;
        validCount++;
      }
    }
  }
  return Object.freeze({ width, height, values, validMask, validCount, extent: Object.freeze({ ...extent }) });
}

function validateExtent(extent) {
  if (!extent || ![extent.xMinM, extent.xMaxM, extent.yMinM, extent.yMaxM, extent.cellM].every(finite)) {
    throw new RangeError('extent geçersiz');
  }
  if (!(extent.cellM > 0) || !(extent.xMaxM > extent.xMinM) || !(extent.yMaxM > extent.yMinM)) {
    throw new RangeError('extent sınırları geçersiz');
  }
}

/**
 * Local height window (e.g. the 1 m HiRISE DTM subset). Nearest-cell lookup. The DTM's values are the reference.
 * values: row-major, row 0 = north (yMaxM). noDataValue (optional): cells equal to it are invalid; NaN is always invalid.
 */
export function createLocalWindow({ width, height, values, xMinM, yMaxM, cellM, noDataValue = null, validMask = null }) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new RangeError('pencere boyutu geçersiz');
  if (!values || values.length !== width * height) throw new RangeError('pencere values uzunluğu uyuşmuyor');
  if (!(cellM > 0) || !finite(xMinM) || !finite(yMaxM)) throw new RangeError('pencere geometrisi geçersiz');
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const v = values[i];
    const declaredNoData = noDataValue !== null && v === noDataValue;
    const ok = validMask ? validMask[i] === 1 : true;
    mask[i] = ok && !declaredNoData && Number.isFinite(v) ? 1 : 0;
  }
  const extent = Object.freeze({
    xMinM, xMaxM: xMinM + width * cellM, yMinM: yMaxM - height * cellM, yMaxM, cellM,
  });
  return Object.freeze({
    extent,
    width,
    height,
    sample(xM, yM) {
      const col = Math.floor((xM - xMinM) / cellM);
      const row = Math.floor((yMaxM - yM) / cellM);
      if (col < 0 || row < 0 || col >= width || row >= height) return { status: 'outside', value: null };
      const i = row * width + col;
      if (!mask[i]) return { status: 'no_data', value: null };
      return { status: 'ok', value: values[i] };
    },
  });
}

/** Summary statistics (sample std with n-1; linear-interpolated percentiles). Empty input -> n 0 and nulls. */
export function summarize(values) {
  const n = values.length;
  if (n === 0) {
    return Object.freeze({ n: 0, mean: null, median: null, std: null, min: null, max: null, p5: null, p95: null, note: 'örtüşme yok' });
  }
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  const std = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  const sorted = Float64Array.from(values).sort();
  const pct = (p) => {
    const h = (n - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.min(n - 1, lo + 1);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  };
  return Object.freeze({
    n, mean, median: pct(0.5), std, min, max, p5: pct(0.05), p95: pct(0.95), note: null,
  });
}

/**
 * Collects aligned residual samples (MOLA - DTM) on a stride of the local window for one or more latitude mappings.
 * A point is kept only if the DTM is valid AND every mapping gives a valid MOLA sample (so the sets stay aligned).
 */
function collectAligned({ regionalGrid, localDtm, frame, latMaps, stride }) {
  const ext = localDtm.extent;
  const step = stride * ext.cellM;
  const names = Object.keys(latMaps);
  const residuals = {};
  for (const name of names) residuals[name] = [];
  const dtmValues = [];
  const stats = { candidatePoints: 0, dtmNoData: 0, molaNoData: 0, kept: 0 };
  for (let y = ext.yMinM + step / 2; y < ext.yMaxM; y += step) {
    for (let x = ext.xMinM + step / 2; x < ext.xMaxM; x += step) {
      stats.candidatePoints++;
      const d = localDtm.sample(x, y);
      if (d.status !== 'ok') { stats.dtmNoData++; continue; }
      const { latDeg, lonDeg } = frame.adapter.localToLatLon(x, y);
      const molas = {};
      let allValid = true;
      for (const name of names) {
        const m = sampleBilinear(regionalGrid, lonDeg, latMaps[name](latDeg));
        if (m === null) { allValid = false; break; }
        molas[name] = m;
      }
      if (!allValid) { stats.molaNoData++; continue; }
      stats.kept++;
      dtmValues.push(d.value);
      for (const name of names) residuals[name].push(molas[name] - d.value);
    }
  }
  return { residuals, dtmValues, stats };
}

/** Detection-power note: how many MOLA cells the local window spans. */
export function detectionPowerNote({ extent, frame, regionalGrid }) {
  // Metres are the project plane's (geo.js equirectangular, lat_ts 0): the same metres the DTM window uses.
  const { kx, ky } = frame.projection;
  const molaEwM = regionalGrid.pixelSizeDeg * kx;
  const molaNsM = regionalGrid.pixelSizeDeg * ky;
  const windowEwM = extent.xMaxM - extent.xMinM;
  const windowNsM = extent.yMaxM - extent.yMinM;
  const spanEw = windowEwM / molaEwM;
  const spanNs = windowNsM / molaNsM;
  return Object.freeze({
    windowEwM: round3(windowEwM),
    windowNsM: round3(windowNsM),
    molaCellEwM: round3(molaEwM),
    molaCellNsM: round3(molaNsM),
    windowInMolaCells: Object.freeze({ ew: round3(spanEw), ns: round3(spanNs) }),
    note: `Yerel pencere ${Math.round(windowEwM)} m x ${Math.round(windowNsM)} m; MOLA hücresi ~${Math.round(molaNsM)} m (N-G) x ${Math.round(molaEwM)} m (D-B); `
      + `pencere ~${spanEw.toFixed(1)} x ${spanNs.toFixed(1)} MOLA hücresi kapsar. İstatistik MOLA'nın ~463 m çözünürlüğündeki `
      + 'düşük frekanslı kot farkını ölçer; DTM\'in 1 m ayrıntısını sınamaz.',
  });
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/**
 * Compares the regional grid (under one latitude mapping, default identity) with a local DTM window.
 * Returns MOLA - DTM statistics over the overlap, with skip counters and a detection-power note.
 */
export function compareToLocalDtm({ regionalGrid, localDtm, frame, latMap = IDENTITY, stride = DEFAULT_STRIDE }) {
  validateStride(stride);
  const { residuals, stats } = collectAligned({
    regionalGrid, localDtm, frame, latMaps: { mola: latMap }, stride,
  });
  const summary = summarize(residuals.mola);
  return Object.freeze({
    stats: Object.freeze(stats),
    residual: summary,
    overlapNote: summary.n === 0 ? 'Örtüşen geçerli nokta yok: karşılaştırma yapılamadı (n=0).' : null,
    detection: detectionPowerNote({ extent: localDtm.extent, frame, regionalGrid }),
  });
}

function validateStride(stride) {
  if (!Number.isSafeInteger(stride) || stride < 1) throw new RangeError('stride pozitif tamsayı olmalı');
}

/**
 * Latitude-convention experiment: compares H1 (identity) and H2 (grid latitude is geodetic) against the local DTM.
 * Returns numbers and a verdict. Status is always 'needs_review'.
 */
export function latitudeConventionExperiment({
  regionalGrid, localDtm, frame, invFlattening, stride = DEFAULT_STRIDE, shapeThresholdM = SHAPE_THRESHOLD_M,
}) {
  validateStride(stride);
  if (!finite(invFlattening) || invFlattening <= 0) throw new RangeError('invFlattening geçersiz');
  const h2Map = (lat) => planetocentricToGeodeticDeg(lat, invFlattening);
  const { residuals, dtmValues, stats } = collectAligned({
    regionalGrid, localDtm, frame, latMaps: { H1: IDENTITY, H2: h2Map }, stride,
  });
  const h1 = summarize(residuals.H1);
  const h2 = summarize(residuals.H2);
  const pointShift = residuals.H2.map((v, i) => v - residuals.H1[i]); // MOLA(H2) - MOLA(H1), same DTM point
  const shift = summarize(pointShift);

  // Centre-point analysis: how far apart the two readings are in metres of latitude, and the local N-S gradient.
  const ext = localDtm.extent;
  const cx = (ext.xMinM + ext.xMaxM) / 2;
  const cy = (ext.yMinM + ext.yMaxM) / 2;
  const centre = frame.adapter.localToLatLon(cx, cy);
  const kyM = frame.projection.ky;
  const latGeodeticDeg = h2Map(centre.latDeg);
  const deltaLatDeg = latGeodeticDeg - centre.latDeg;
  const deltaNorthKm = (deltaLatDeg * kyM) / 1000;
  const dl = 0.05;
  const zNorth = sampleBilinear(regionalGrid, centre.lonDeg, centre.latDeg + dl);
  const zSouth = sampleBilinear(regionalGrid, centre.lonDeg, centre.latDeg - dl);
  const gradientMPerM = zNorth === null || zSouth === null ? null : (zNorth - zSouth) / (2 * dl * kyM);
  const predictedShiftM = gradientMPerM === null ? null : gradientMPerM * deltaLatDeg * kyM;

  const shapeSignalM = shift.std;
  const shapeDiscriminable = shift.n > 0 && shapeSignalM !== null && shapeSignalM >= shapeThresholdM;
  let discrimination;
  if (shift.n === 0) {
    discrimination = 'ayırt edilemedi: örtüşen nokta yok';
  } else if (!shapeDiscriminable) {
    discrimination = `ayırt edilemedi (şekil): H1 ile H2 arasındaki noktasal fark std=${shapeSignalM.toFixed(3)} m < eşik ${shapeThresholdM} m; `
      + 'fark pencere boyunca neredeyse sabit bir ofset olarak görünür.';
  } else {
    discrimination = `şekil farkı ölçülebilir (std=${shapeSignalM.toFixed(3)} m >= ${shapeThresholdM} m), ancak ortalama ofset `
      + 'düşey datum doğrulanmadan bir enlem konvansiyonuna atfedilemez.';
  }

  return Object.freeze({
    status: 'needs_review',
    stats: Object.freeze(stats),
    hypotheses: Object.freeze({
      H1: Object.freeze({
        label: 'Trek enlemi = planetosentrik küre enlemi (projenin konvansiyonu)',
        residual: h1,
      }),
      H2: Object.freeze({
        label: `Trek enlemi = jeodetik enlem (GeoTIFF anahtarları: 1/f=${invFlattening}); varsayım, örnekleme ile doğrulanmadı`,
        residual: h2,
      }),
    }),
    pointwiseShiftM: shift,
    absoluteOffsetDifferenceM: shift.mean,
    shapeThresholdM: shapeThresholdM,
    shapeDiscriminable,
    discrimination,
    centre: Object.freeze({
      latPlanetocentricDeg: centre.latDeg,
      latGeodeticDeg,
      deltaLatDeg,
      deltaNorthKm: round3(deltaNorthKm),
      molaNsGradientMPerKm: gradientMPerM === null ? null : gradientMPerM * 1000,
      predictedShiftM: predictedShiftM === null ? null : round3(predictedShiftM),
    }),
    datum: Object.freeze({
      verticalDatumVerified: false,
      note: 'Yerel DTM düşey datumu doğrulanmamış (label verticalDatum null, DeltaGeoid adı). Mutlak ofset tek başına H1/H2 kararı değildir.',
    }),
    dtmValueCount: dtmValues.length,
    detection: detectionPowerNote({ extent: localDtm.extent, frame, regionalGrid }),
  });
}
