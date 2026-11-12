// Format-independent data layer boundary.
// Every layer exposes a `descriptor` (metadata + access status). Elevation layers additionally expose
// sampleElevation(x, y) and sampleSlope(x, y) in LOCAL SIM METRES; they never return 0 in place of missing data.
// A future organiser-provided dataset only needs a loader that produces a descriptor + one of these classes.
import { horn3x3Gradient } from '../geo/geo.js';

/** Sample statuses. Anything other than OK carries no numeric value. */
export const STATUS = Object.freeze({
  OK: 'ok',
  NO_DATA: 'no_data',
  OUT_OF_BOUNDS: 'out_of_bounds',
  UNAVAILABLE: 'unavailable',
  INVALID: 'invalid',
});

/** Creates a descriptor with every documented field present (null = not known / not applicable). */
export function makeDescriptor(fields) {
  return {
    id: null, kind: null, title: null,
    source: null, product: null, version: null, attribution: null,
    unit: null, verticalDatum: null, crs: null,
    pixelScaleM: null, size: null, coverage: null, timeCoverage: null,
    noData: null, quality: null,
    access: { status: STATUS.UNAVAILABLE, reason: 'Yüklenmedi' },
    ...fields,
  };
}

/** Layer that could not be loaded (or is deliberately disabled). Implements SurfaceProvider; sampling reports `unavailable`. */
export class UnavailableLayer {
  constructor(descriptor, reason) {
    this.descriptor = { ...descriptor, access: { status: STATUS.UNAVAILABLE, reason } };
  }
  get available() { return false; }
  sampleElevation() {
    return {
      status: STATUS.UNAVAILABLE,
      value: null,
      unit: this.descriptor.unit ?? 'm',
      verticalDatum: this.descriptor.verticalDatum ?? null,
      source: this.descriptor.product ?? null,
      method: null,
      cell: null,
      reason: this.descriptor.access.reason,
    };
  }
  sampleSlope() {
    return {
      status: STATUS.UNAVAILABLE,
      value: null,
      unit: '°',
      verticalDatum: this.descriptor.verticalDatum ?? null,
      source: this.descriptor.product ?? null,
      method: '3×3 Horn sonlu farkı, atan(√((dz/dx)²+(dz/dy)²))',
      window: '3×3',
      cell: null,
      reason: this.descriptor.access.reason,
    };
  }
  sampleSurface(xM, yM) {
    const elevation = this.sampleElevation(xM, yM);
    const slope = this.sampleSlope(xM, yM);
    return { elevation, slope, zM: null, status: elevation.status };
  }
}

/**
 * In-memory window of a gridded elevation product.
 * `values` is a Float32Array (row-major, `rows` x `cols`) whose cell (0,0) is product cell (rowOffset, colOffset).
 * No-data is detected from the exact 32-bit pattern; values outside [validMin, validMax] or non-finite are `invalid`.
 */
export class GridElevationLayer {
  constructor({ descriptor, adapter, values, rows, cols, rowOffset, colOffset, noDataBits, validMin, validMax }) {
    if (values.length !== rows * cols) throw new Error('values length does not match rows*cols');
    this.descriptor = descriptor;
    this.adapter = adapter;
    this.values = values;
    this.bits = new Uint32Array(values.buffer, values.byteOffset, values.length);
    this.rows = rows; this.cols = cols;
    this.rowOffset = rowOffset; this.colOffset = colOffset;
    this.noDataBits = noDataBits >>> 0;
    this.validMin = validMin; this.validMax = validMax;
    this.cellSizeM = adapter.grid.scale;
  }
  get available() { return true; }

  /** Classifies one product cell. Returns { status, value?, reason? }. */
  cellState(row, col) {
    const r = row - this.rowOffset, c = col - this.colOffset;
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) {
      const g = this.adapter.grid;
      const inProduct = row >= 0 && col >= 0 && row < g.lines && col < g.samples;
      return {
        status: STATUS.OUT_OF_BOUNDS,
        reason: inProduct ? 'Yüklenen DTM alt kümesinin dışında (ürün kapsamı içinde, bu demoda yüklenmedi)' : 'DTM ürün kapsamının dışında',
      };
    }
    const i = r * this.cols + c;
    if (this.bits[i] === this.noDataBits) return { status: STATUS.NO_DATA, reason: 'Ürün no-data hücresi (MISSING_CONSTANT)' };
    const v = this.values[i];
    if (!Number.isFinite(v) || v < this.validMin || v > this.validMax) {
      return { status: STATUS.INVALID, reason: 'Değer VALID_MINIMUM/VALID_MAXIMUM aralığı dışında' };
    }
    return { status: STATUS.OK, value: v };
  }

  sampleElevation(xM, yM) {
    const source = this.descriptor.product;
    const unit = this.descriptor.unit ?? 'm';
    const verticalDatum = this.descriptor.verticalDatum ?? null;
    const method = 'En yakın hücre (piksel merkezi)';
    if (!Number.isFinite(xM) || !Number.isFinite(yM)) {
      return { status: STATUS.INVALID, value: null, unit, verticalDatum, cell: null, method, source, reason: 'Geçersiz konum' };
    }
    const cell = this.adapter.localToCell(xM, yM);
    const st = this.cellState(cell.row, cell.col);
    const base = { unit, verticalDatum, cell: { row: cell.row, col: cell.col }, method, source };
    if (st.status !== STATUS.OK) return { ...base, status: st.status, value: null, reason: st.reason };
    return { ...base, status: STATUS.OK, value: st.value, reason: null };
  }

  /**
   * 3x3 Horn gradient/slope at product cell (row, col), using `cellState` for every cell in the window
   * and the shared `horn3x3Gradient` helper. Any non-OK cell in the 3x3 window -> no gradient/slope value.
   */
  cellGradient(row, col) {
    const z9 = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const st = this.cellState(row + dr, col + dc);
        if (st.status !== STATUS.OK) {
          const which = dr === 0 && dc === 0 ? 'Merkez hücre' : 'Komşu hücre';
          return { status: st.status, reason: `${which}: ${st.reason}` };
        }
        z9.push(st.value);
      }
    }
    const g = horn3x3Gradient(z9, this.cellSizeM);
    if (!g) return { status: STATUS.INVALID, reason: 'Geçersiz 3×3 komşuluk veya hücre ölçeği' };
    return { status: STATUS.OK, ...g };
  }

  /** Horn (1981) 3x3 finite difference at the nearest cell. Any non-OK cell in the window -> no slope value. */
  sampleSlope(xM, yM) {
    const source = this.descriptor.product;
    const verticalDatum = this.descriptor.verticalDatum ?? null;
    const method = '3×3 Horn sonlu farkı, atan(√((dz/dx)²+(dz/dy)²))';
    if (!Number.isFinite(xM) || !Number.isFinite(yM)) {
      return { status: STATUS.INVALID, value: null, unit: '°', verticalDatum, cell: null, method, window: '3×3', source, reason: 'Geçersiz konum' };
    }
    const { row, col } = this.adapter.localToCell(xM, yM);
    const g = this.cellGradient(row, col);
    if (g.status !== STATUS.OK) {
      return { status: g.status, value: null, unit: '°', verticalDatum, reason: g.reason, cell: { row, col }, method, window: '3×3', source };
    }
    return {
      status: STATUS.OK, value: g.slopeDeg, dzdx: g.dzdx, dzdy: g.dzdy,
      unit: '°', verticalDatum, cell: { row, col }, method, window: '3×3', cellSizeM: this.cellSizeM, source, reason: null,
    };
  }

  /** Combined SurfaceProvider query at local metre coordinates (xM, yM). Never substitutes 0 for missing zM. */
  sampleSurface(xM, yM) {
    const elevation = this.sampleElevation(xM, yM);
    const slope = this.sampleSlope(xM, yM);
    const zM = elevation.status === STATUS.OK ? elevation.value : null;
    return { elevation, slope, zM, status: elevation.status };
  }
}

const REL_TOL = 1e-9;
function sameFrame(a, b) {
  const keys = ['radiusKm', 'centerLatDeg', 'centerLonDeg', 'mapScaleM', 'lineProjectionOffset', 'sampleProjectionOffset', 'lines', 'samples'];
  const bad = keys.filter((k) => !(Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) <= REL_TOL * Math.max(1, Math.abs(b[k]))));
  return bad;
}

/** Base descriptor for the local HiRISE DTM; filled in from the prepared metadata when available. */
export function dtmBaseDescriptor() {
  return makeDescriptor({
    id: 'hirise-dtm', kind: 'elevation', title: 'HiRISE DTM (Jezero)',
    source: 'NASA PDS / HiRISE (University of Arizona, USGS Astrogeology)',
    product: 'DTEEC_045994_1985_046060_1985_U01', version: null,
    attribution: 'NASA/JPL/University of Arizona (HiRISE)',
    unit: 'm', verticalDatum: 'Mars 2000 (Smith vd. 2001) eşpotansiyel yüzeyi',
  });
}

/**
 * Loads the prepared DTM window (data/dtm_subset.json + .f32) produced by scripts/extract-dtm.mjs.
 * Never throws: on any failure returns an UnavailableLayer carrying the reason.
 */
export async function loadDtmLayer({ baseUrl, adapter, expectedFrame, fetchImpl = fetch }) {
  const base = dtmBaseDescriptor();
  let meta;
  try {
    const res = await fetchImpl(`${baseUrl}/dtm_subset.json`);
    if (!res.ok) return new UnavailableLayer(base, `DTM meta verisi bulunamadı (HTTP ${res.status}). Önce "npm run prepare-data" çalıştırın.`);
    meta = await res.json();
  } catch (e) {
    return new UnavailableLayer(base, `DTM meta verisi okunamadı: ${e.message}`);
  }
  const label = meta.label;
  const mismatch = sameFrame(label, expectedFrame);
  const descriptor = {
    ...base,
    version: label.productVersionId ?? null,
    crs: meta.crsText,
    pixelScaleM: label.mapScaleM,
    size: { rows: label.lines, cols: label.samples, loadedWindow: meta.window },
    coverage: meta.coverage,
    timeCoverage: meta.timeCoverage,
    noData: { constantHex: label.missingConstantHex, rule: 'Tam 32-bit desen eşleşmesi → no_data' },
    quality: { validMin: label.validMin, validMax: label.validMax, windowStats: meta.windowStats, registration: meta.registration },
  };
  if (mismatch.length) {
    return new UnavailableLayer(descriptor, `CRS/grid doğrulanamadı (uyuşmayan alanlar: ${mismatch.join(', ')}); örnekleme devre dışı.`);
  }
  if (label.sampleType !== 'PC_REAL' || label.sampleBits !== 32) {
    return new UnavailableLayer(descriptor, `Desteklenmeyen örnek türü ${label.sampleType}/${label.sampleBits}`);
  }
  let buf;
  try {
    const res = await fetchImpl(`${baseUrl}/${meta.dataFile}`);
    if (!res.ok) return new UnavailableLayer(descriptor, `DTM verisi bulunamadı (HTTP ${res.status})`);
    buf = await res.arrayBuffer();
  } catch (e) {
    return new UnavailableLayer(descriptor, `DTM verisi okunamadı: ${e.message}`);
  }
  const { rows, cols, row0, col0 } = meta.window;
  if (buf.byteLength !== rows * cols * 4) {
    return new UnavailableLayer(descriptor, `DTM veri boyutu beklenenden farklı (${buf.byteLength} ≠ ${rows * cols * 4} bayt)`);
  }
  // Prepared file is little-endian float32 (same as PDS PC_REAL); all target browsers are little-endian.
  const values = new Float32Array(buf);
  return new GridElevationLayer({
    descriptor: { ...descriptor, access: { status: STATUS.OK, reason: null } },
    adapter, values, rows, cols, rowOffset: row0, colOffset: col0,
    noDataBits: parseInt(label.missingConstantHex, 16), validMin: label.validMin, validMax: label.validMax,
  });
}

/** Orthoimage descriptor. Decoding JPEG 2000 is not possible in this stack, so the layer is reported unavailable. */
export async function loadOrthoDescriptor({ baseUrl, fetchImpl = fetch }) {
  const base = makeDescriptor({
    id: 'hirise-ortho', kind: 'image', title: 'HiRISE ortogörüntü (RED, C = 1 m ölçek)',
    source: 'NASA PDS / HiRISE (University of Arizona)', product: 'ESP_046060_1985_RED_C_01_ORTHO',
    attribution: 'NASA/JPL/University of Arizona (HiRISE)', unit: '8-bit DN (tek bant)',
  });
  let info = null;
  try {
    const res = await fetchImpl(`${baseUrl}/ortho_inspection.json`);
    if (res.ok) info = await res.json();
  } catch { /* ignore: reason below */ }
  const reason = info?.decodeReason ?? 'JPEG 2000 kod çözücü bu yığında yok (tarayıcılar JP2 görüntüleyemiyor, Node’da yerel çözücü yok).';
  return new UnavailableLayer({
    ...base,
    crs: info?.crsText ?? null, pixelScaleM: info?.pixelScaleM ?? null,
    size: info ? { rows: info.height, cols: info.width } : null,
    quality: info ? { registration: info.registration } : null,
  }, reason);
}
