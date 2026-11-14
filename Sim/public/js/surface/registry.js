// Layer manifest contract, field-level metadata validator and SurfaceProvider registry/factory.
// Ensures incoming datasets are NEVER guessed (CRS, unit, datum, scaling, no-data or pixel convention).
// Only verified manifests become active SurfaceProviders; ambiguous (`needs_review`), `invalid` or
// `unavailable` manifests fall back cleanly to `UnavailableLayer` (or a registered fallback provider).
import { STATUS, makeDescriptor, UnavailableLayer, dtmBaseDescriptor, loadDtmLayer } from './layers.js';
import { adapterFromLabel } from '../geo/geo.js';
import { MAP_FRAME, WAYPOINTS } from '../config.js';

const LEGACY_HIRISE_FRAME = Object.freeze({
  productId: 'DTEEC_045994_1985_046060_1985_U01',
  lines: 14266,
  samples: 6673,
  radiusKm: 3394.8398133163,
  centerLatDeg: 15,
  centerLonDeg: 77.44,
  mapScaleM: 1.0096633268711,
  lineProjectionOffset: 1088495.5,
  sampleProjectionOffset: 3210.5000000001,
  sourceUrl: 'https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=MRO-M-HIRISE-5-DTM-V1.0',
});

function makeLegacyCoordinateBridge(canonicalAdapter, legacyLabel) {
  const legacyAdapter = adapterFromLabel(legacyLabel, WAYPOINTS[0]);
  const bridge = {
    grid: legacyAdapter.grid,
    localToCell(x, y) {
      const latLon = canonicalAdapter.localToLatLon(x, y);
      const legacyLocal = legacyAdapter.latLonToLocal(latLon.latDeg, latLon.lonDeg);
      return legacyAdapter.localToCell(legacyLocal.x, legacyLocal.y);
    },
    pixelToLocal(row, col) {
      const legacyLocal = legacyAdapter.pixelToLocal(row, col);
      const latLon = legacyAdapter.localToLatLon(legacyLocal.x, legacyLocal.y);
      return canonicalAdapter.latLonToLocal(latLon.latDeg, latLon.lonDeg);
    },
  };
  const controls = WAYPOINTS.map((w) => {
    const canonicalLocal = canonicalAdapter.latLonToLocal(w.latDeg, w.lonDeg);
    const legacyLocal = legacyAdapter.latLonToLocal(w.latDeg, w.lonDeg);
    const cell = legacyAdapter.localToCell(legacyLocal.x, legacyLocal.y);
    const legacyCellLocal = legacyAdapter.pixelToLocal(cell.row, cell.col);
    const cellLatLon = legacyAdapter.localToLatLon(legacyCellLocal.x, legacyCellLocal.y);
    const canonicalCell = canonicalAdapter.latLonToLocal(cellLatLon.latDeg, cellLatLon.lonDeg);
    const residualM = Math.hypot(canonicalCell.x - canonicalLocal.x, canonicalCell.y - canonicalLocal.y);
    return { id: w.id, row: cell.row, col: cell.col, residualM };
  });
  const toleranceM = Math.SQRT1_2 * legacyLabel.mapScaleM;
  if (controls.some((c) => !Number.isFinite(c.residualM) || c.residualM > toleranceM)) {
    throw new Error(`Legacy DTM waypoint transform residual exceeds half-pixel diagonal (${toleranceM.toFixed(3)} m)`);
  }
  return { adapter: bridge, controls, toleranceM };
}

function validateLegacyFixture(meta) {
  const label = meta?.label;
  const window = meta?.window;
  const checks = [
    label?.productId === LEGACY_HIRISE_FRAME.productId,
    label?.dataSetId === 'MRO-M-HIRISE-5-DTM-V1.0',
    label?.lines === LEGACY_HIRISE_FRAME.lines && label?.samples === LEGACY_HIRISE_FRAME.samples,
    label?.radiusKm === LEGACY_HIRISE_FRAME.radiusKm && label?.centerLatDeg === LEGACY_HIRISE_FRAME.centerLatDeg && label?.centerLonDeg === LEGACY_HIRISE_FRAME.centerLonDeg,
    label?.mapScaleM === LEGACY_HIRISE_FRAME.mapScaleM && label?.lineProjectionOffset === LEGACY_HIRISE_FRAME.lineProjectionOffset && label?.sampleProjectionOffset === LEGACY_HIRISE_FRAME.sampleProjectionOffset,
    label?.sampleType === 'PC_REAL' && label?.sampleBits === 32 && label?.bands === 1,
    label?.missingConstantHex === 'FF7FFFFB' && Number.isFinite(label?.validMin) && Number.isFinite(label?.validMax) && label.validMin < label.validMax,
    typeof label?.note === 'string' && label.note.includes('Mars 2000 Datum'),
    meta?.dataFile === 'dtm_subset.f32' && Number.isInteger(window?.rows) && Number.isInteger(window?.cols) &&
      Number.isInteger(window?.row0) && Number.isInteger(window?.col0) && window.rows > 0 && window.cols > 0,
    meta?.coverage?.localBoundsM && WAYPOINTS.every((w) => {
      const DEG = Math.PI / 180;
      const kx = LEGACY_HIRISE_FRAME.radiusKm * 1000 * Math.cos(LEGACY_HIRISE_FRAME.centerLatDeg * DEG) * DEG;
      const ky = LEGACY_HIRISE_FRAME.radiusKm * DEG;
      const x = (w.lonDeg - WAYPOINTS[0].lonDeg) * kx;
      const y = (w.latDeg - WAYPOINTS[0].latDeg) * ky;
      const b = meta.coverage.localBoundsM;
      return x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax;
    }),
  ];
  const ok = checks.every(Boolean);
  return {
    status: ok ? VALIDATION_STATUS.SUPPORTED : VALIDATION_STATUS.INVALID,
    samplingAllowed: ok,
    reasonCode: ok ? 'verified_legacy_hirise_fixture' : 'invalid_legacy_hirise_fixture',
    summary: ok
      ? 'Önceden hazırlanmış MRO HiRISE PDS3 DTM fixture kimliği, datum notu, frame ve rota kapsaması doğrulandı.'
      : 'Legacy HiRISE fixture metadata does not match the verified PDS3 dataset/frame contract.',
    fields: {},
    issues: ok ? [] : [{ field: 'legacyFixture', status: VALIDATION_STATUS.INVALID, message: 'Legacy DTM metadata/frame check failed.' }],
  };
}

function buildLegacyDescriptor(meta, validation) {
  const label = meta.label;
  return makeDescriptor({
    id: 'hirise-legacy-jezero-dtm',
    kind: 'elevation',
    title: 'HiRISE DTM (legacy PDS3 Jezero fixture)',
    source: 'NASA Planetary Data System · MRO HiRISE',
    product: label.productId,
    version: label.productVersionId,
    attribution: `${label.productId} · MRO-M-HIRISE-5-DTM-V1.0`,
    license: null,
    unit: 'm',
    verticalDatum: 'Mars 2000 Datum (martian equipotential surface)',
    verticalDatumVerified: true,
    verticalDatumEvidence: label.note,
    crs: meta.crsText,
    pixelScaleM: label.mapScaleM,
    size: { rows: label.lines, cols: label.samples, loadedWindow: meta.window, pixelRegistration: 'CENTER_PDS_1BASED' },
    coverage: meta.coverage,
    timeCoverage: meta.timeCoverage,
    noData: { constantHex: label.missingConstantHex, rule: 'Exact 32-bit PDS3 MISSING_CONSTANT pattern → no_data' },
    quality: { validMin: label.validMin, validMax: label.validMax, windowStats: meta.windowStats, transformControls: meta.waypointCells, sourceUrl: LEGACY_HIRISE_FRAME.sourceUrl },
    validation,
    access: { status: STATUS.OK, reason: null },
  });
}

/** Overall validation & readiness states for a layer manifest. */
export const VALIDATION_STATUS = Object.freeze({
  SUPPORTED: 'supported',       // All required metadata + canonical local-metre transform verified
  NEEDS_REVIEW: 'needs_review', // Human verification required; sampling is disabled
  UNAVAILABLE: 'unavailable',   // Data file/resource not accessible
  INVALID: 'invalid',           // Missing, contradictory or unsupported metadata
});

/** Formats actually supported by the zero-dependency runtime today. */
export const SUPPORTED_FORMATS = Object.freeze([
  'GEOTIFF_FLOAT32_WINDOW',
  'USGS_TRN_HIRISE_F32_WINDOW',
  'PDS3_PC_REAL_F32_WINDOW',
]);

const REL_TOL = 1e-6;
const OFFICIAL_PDS_GRID = Object.freeze({
  sourceUrl: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl',
  lineProjectionOffset: 1106617.5,
  sampleProjectionOffset: -4577366.5,
  mapScaleM: 1,
  radiusKm: 3396.19,
});
const TRUSTED_LEGACY_ENTRIES = new WeakSet();
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isPosNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isFinNum = (v) => typeof v === 'number' && Number.isFinite(v);
const closeMetres = (a, b) => isFinNum(a) && isFinNum(b) && Math.abs(a - b) <= 1e-6;

function approxEq(a, b, tol = REL_TOL) {
  return isFinNum(a) && isFinNum(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

/**
 * Validates a layer manifest field-by-field against the mandatory canonical simulation frame.
 * Never guesses missing CRS, unit, datum, scaling, usage license or no-data rules.
 *
 * @param {object} manifest
 * @param {object} expectedFrame  canonical MAP_FRAME (radiusKm, centerLatDeg, centerLonDeg, mapScaleM, ...)
 * @returns {{
 *   status: 'supported'|'needs_review'|'unavailable'|'invalid',
 *   samplingAllowed: boolean,
 *   reasonCode: string,
 *   summary: string,
 *   fields: Record<string, {status: string, message: string}>,
 *   issues: Array<{field: string, status: string, message: string}>
 * }}
 */
export function validateLayerManifest(manifest, expectedFrame) {
  const fields = {};
  const issues = [];
  const record = (field, status, message) => {
    fields[field] = { status, message };
    if (status !== VALIDATION_STATUS.SUPPORTED) issues.push({ field, status, message });
  };

  if (!expectedFrame || typeof expectedFrame !== 'object') {
    return {
      status: VALIDATION_STATUS.INVALID,
      samplingAllowed: false,
      reasonCode: 'expected_frame_required',
      summary: 'expectedFrame parametresi zorunludur; hedef koordinat çerçevesi kontrol edilmeden örnekleme açılamaz.',
      fields: { expectedFrame: { status: VALIDATION_STATUS.INVALID, message: 'expectedFrame parametresi sağlanmadı.' } },
      issues: [{ field: 'expectedFrame', status: VALIDATION_STATUS.INVALID, message: 'expectedFrame parametresi sağlanmadı.' }],
    };
  }

  if (!manifest || typeof manifest !== 'object') {
    return {
      status: VALIDATION_STATUS.INVALID,
      samplingAllowed: false,
      reasonCode: 'manifest_missing',
      summary: 'Katman manifesti eksik veya geçersiz nesne.',
      fields,
      issues: [{ field: 'manifest', status: VALIDATION_STATUS.INVALID, message: 'Manifest nesnesi sağlanmadı.' }],
    };
  }

  // 1. Identity, source, product/version, attribution & usage license
  if (isNonEmptyStr(manifest.id) && isNonEmptyStr(manifest.title) && isNonEmptyStr(manifest.kind)) {
    record('identity', VALIDATION_STATUS.SUPPORTED, `${manifest.id} (${manifest.kind})`);
  } else {
    record('identity', VALIDATION_STATUS.INVALID, 'id, title ve kind zorunludur.');
  }

  const provenanceEvidence = manifest.provenanceEvidence;
  if (
    isNonEmptyStr(manifest.product) && isNonEmptyStr(manifest.version) && isNonEmptyStr(manifest.source) && isNonEmptyStr(manifest.attribution) &&
    provenanceEvidence?.productId === manifest.product && provenanceEvidence?.version === manifest.version &&
    provenanceEvidence?.sourceUrl === 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl'
  ) {
    record('provenance', VALIDATION_STATUS.SUPPORTED, `${manifest.product} v${manifest.version} · ${manifest.source}`);
  } else {
    record('provenance', VALIDATION_STATUS.NEEDS_REVIEW, 'Ürün kimliği/sürümü resmi ürün label kaynağıyla eşleştirilmedi.');
  }

  const useConstraints = manifest.useConstraints;
  const useEvidence = manifest.useConstraintsEvidence;
  if (
    useConstraints === 'This work is marked with CC0 1.0 Universal' &&
    useEvidence?.statement === useConstraints &&
    useEvidence?.sourceUrl === 'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic'
  ) {
    record('license', VALIDATION_STATUS.SUPPORTED, `${useConstraints} [USGS data release]`);
  } else {
    record('license', VALIDATION_STATUS.NEEDS_REVIEW, 'USGS release kullanım şartı ve birebir kaynak kanıtı doğrulanmadı; atıf tek başına yeterli değil.');
  }

  // 2. Target body & observation/product time coverage + explicit non-live relation to sim clock
  const body = String(manifest.body ?? '').toUpperCase();
  if (body === 'MARS') {
    record('body', VALIDATION_STATUS.SUPPORTED, 'MARS');
  } else {
    record('body', VALIDATION_STATUS.INVALID, `Hedef gövde MARS olmalıdır (gelen: ${manifest.body ?? 'boş'}).`);
  }

  const tc = manifest.timeCoverage;
  if (tc && isNonEmptyStr(tc.summary) && tc.simClockRelation === 'independent_static_archive') {
    record('timeCoverage', VALIDATION_STATUS.SUPPORTED, `${tc.summary} (simülasyon saatinden bağımsız arşiv verisi)`);
  } else if (tc && isNonEmptyStr(tc.summary)) {
    record('timeCoverage', VALIDATION_STATUS.NEEDS_REVIEW, 'Zaman kapsamı ile simülasyon saati ilişkisi (simClockRelation) açıkça doğrulanmalı; canlı veri varsayılmaz.');
  } else {
    record('timeCoverage', VALIDATION_STATUS.INVALID, 'timeCoverage.summary zorunludur.');
  }

  // 3. Unit & explicit vertical datum proof with evidence
  const datumEvidence = manifest.verticalDatumEvidence;
  if (manifest.unit !== 'm') {
    record('verticalReference', VALIDATION_STATUS.INVALID, 'Düşey birim m olmalıdır.');
  } else if (
    !isNonEmptyStr(manifest.verticalDatum) || manifest.verticalDatumVerified !== true ||
    !datumEvidence || datumEvidence.statement !== manifest.verticalDatum ||
    ![
      'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl',
      'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.xml',
    ].includes(datumEvidence?.sourceUrl)
  ) {
    record('verticalReference', VALIDATION_STATUS.NEEDS_REVIEW, 'Ürüne özgü düşey datum doğrulanabilir kaynak kanıtıyla sağlanmadı; kot örneklemesi kapalı.');
  } else {
    record('verticalReference', VALIDATION_STATUS.SUPPORTED, `Birim: m · Düşey datum: ${manifest.verticalDatum} [${datumEvidence.sourceUrl}]`);
  }

  // 4. Full CRS / projection definition & canonical local-metre transform calculation check
  const crs = manifest.crs;
  if (!crs || typeof crs !== 'object') {
    record('crs', VALIDATION_STATUS.INVALID, 'CRS tanımı eksik; projeksiyon tahmin edilmez.');
  } else if (
    crs.projectionType !== 'EQUIRECTANGULAR' ||
    crs.latitudeType !== 'PLANETOCENTRIC' ||
    crs.positiveLongitudeDirection !== 'EAST' ||
    !approxEq(crs.rotationDeg ?? NaN, 0)
  ) {
    record('crs', VALIDATION_STATUS.INVALID, 'Yalnız doğrulanmış EQUIRECTANGULAR / PLANETOCENTRIC / EAST / 0° dönüşlü CRS destekleniyor.');
  } else if (
    !approxEq(crs.radiusKm, expectedFrame.radiusKm) ||
    !approxEq(crs.centerLatDeg, expectedFrame.centerLatDeg) ||
    !approxEq(crs.centerLonDeg, expectedFrame.centerLonDeg)
  ) {
    record('crs', VALIDATION_STATUS.INVALID, 'CRS küre yarıçapı veya merkez enlem/boylamı kanonik yerel metre düzlemiyle uyuşmuyor.');
  } else {
    // Recompute a georeferencing residual against the independently sourced waypoint coordinates.
    const DEG = Math.PI / 180;
    const rM = crs.radiusKm * 1000;
    const kx = rM * Math.cos((crs.centerLatDeg ?? 0) * DEG) * DEG;
    const ky = rM * DEG;
    const g = manifest.grid;
    const controls = manifest.quality?.transformControls;
    const toleranceM = manifest.quality?.transformToleranceM;
    if (!g || !isPosNum(g.mapScaleM) || !isPosNum(g.lines) || !isPosNum(g.samples) || !isFinNum(g.lineProjectionOffset) || !isFinNum(g.sampleProjectionOffset)) {
      record('crs', VALIDATION_STATUS.NEEDS_REVIEW, 'Dönüşüm residual hesabı için doğrulanmış raster grid bulunamadı.');
    } else {
      const controlById = new Map((Array.isArray(controls) ? controls : []).map((c) => [c.id, c]));
      const requiredControls = WAYPOINTS.map((w) => {
        const c = controlById.get(w.id);
        if (!c || !Number.isInteger(c.row) || !Number.isInteger(c.col) || c.row < 0 || c.col < 0 || c.row >= g.lines || c.col >= g.samples) return { id: w.id, residualM: Infinity };
        const cellX = (c.col - g.sampleProjectionOffset) * g.mapScaleM;
        const cellY = (g.lineProjectionOffset - c.row) * g.mapScaleM;
        const expectedX = (w.lonDeg - crs.centerLonDeg) * kx;
        const expectedY = (w.latDeg - crs.centerLatDeg) * ky;
        return { id: w.id, residualM: Math.hypot(cellX - expectedX, cellY - expectedY) };
      });
      const maxResidualM = Math.max(...requiredControls.map((c) => c.residualM));
      const pixelHalfDiagonalM = Math.SQRT1_2 * g.mapScaleM;
      if (!Array.isArray(controls) || controls.length !== WAYPOINTS.length || !Number.isFinite(maxResidualM) || !isPosNum(toleranceM) || toleranceM > pixelHalfDiagonalM + 0.01 || maxResidualM > toleranceM) {
        record('crs', VALIDATION_STATUS.NEEDS_REVIEW, `Waypoint hücre merkezleri için sayısal residual doğrulanmadı (max ${Number.isFinite(maxResidualM) ? maxResidualM.toFixed(3) : 'belirsiz'} m; tolerans ${toleranceM ?? 'eksik'} m).`);
      } else {
        record('crs', VALIDATION_STATUS.SUPPORTED, `Equirectangular dönüşüm kontrolü: ${requiredControls.length} waypoint, max residual ${maxResidualM.toFixed(3)} m / ${toleranceM} m.`);
      }
    }
  }

  // Compare the TIFF PixelIsArea affine with the independently published PDS3 grid.
  // Persisted residuals are reporting data, never a substitute for this calculation.
  const comparison = manifest.quality?.transformComparison;
  const g = manifest.grid;
  const pds = comparison?.pdsGrid;
  const tiff = comparison?.tiffGrid;
  const officialGridMatches = comparison?.sourceUrl === OFFICIAL_PDS_GRID.sourceUrl &&
    pds?.sourceUrl === OFFICIAL_PDS_GRID.sourceUrl &&
    ['lineProjectionOffset', 'sampleProjectionOffset', 'mapScaleM', 'radiusKm']
      .every((key) => closeMetres(pds?.[key], OFFICIAL_PDS_GRID[key]));
  if (!officialGridMatches || !g || !isFinNum(g.upperLeftX) || !isFinNum(g.upperLeftY) || !isPosNum(g.mapScaleM)) {
    record('registration', VALIDATION_STATUS.NEEDS_REVIEW, 'Resmî PDS3 grid veya TIFF affine köşe koordinatları eksik/uyumsuz.');
  } else {
    const tiffLineOffset = g.upperLeftY - g.mapScaleM / 2;
    const tiffSampleOffset = -(g.upperLeftX + g.mapScaleM / 2);
    const corners = [[1, 1], [1, g.samples], [g.lines, 1], [g.lines, g.samples]];
    const maxResidualM = Math.max(...corners.map(([line, sample]) => {
      const xTiff = g.upperLeftX + (sample - 0.5) * g.mapScaleM;
      const yTiff = g.upperLeftY - (line - 0.5) * g.mapScaleM;
      const xPds = (sample - 1 - OFFICIAL_PDS_GRID.sampleProjectionOffset) * OFFICIAL_PDS_GRID.mapScaleM;
      const yPds = (OFFICIAL_PDS_GRID.lineProjectionOffset - line + 1) * OFFICIAL_PDS_GRID.mapScaleM;
      return Math.hypot(xTiff - xPds, yTiff - yPds);
    }));
    const toleranceM = Math.SQRT1_2 * g.mapScaleM;
    if (!closeMetres(tiff?.lineProjectionOffset, tiffLineOffset) ||
        !closeMetres(tiff?.sampleProjectionOffset, tiffSampleOffset) ||
        !closeMetres(g.lineProjectionOffset, tiffLineOffset) ||
        !closeMetres(g.sampleProjectionOffset, tiffSampleOffset) ||
        !isFinNum(maxResidualM) || maxResidualM > toleranceM) {
      record('registration', VALIDATION_STATUS.NEEDS_REVIEW, `TIFF/PDS3 köşe dönüşümü uyuşmuyor (max residual ${maxResidualM} m).`);
    } else {
      record('registration', VALIDATION_STATUS.SUPPORTED, `TIFF/PDS3 dört köşe max residual ${maxResidualM.toFixed(3)} m / ${toleranceM.toFixed(3)} m.`);
    }
  }

  // 5. Grid dimensions, numerical coverage, resolution, row/col orientation & pixel registration
  const grid = manifest.grid;
  if (!grid || typeof grid !== 'object') {
    record('grid', VALIDATION_STATUS.INVALID, 'Grid boyutu, çözünürlük ve piksel kuralı eksik.');
  } else if (
    !isPosNum(grid.lines) || !isPosNum(grid.samples) ||
    !isPosNum(grid.mapScaleM) || !isFinNum(grid.lineProjectionOffset) || !isFinNum(grid.sampleProjectionOffset)
  ) {
    record('grid', VALIDATION_STATUS.INVALID, 'lines, samples, mapScaleM ve projeksiyon ofsetleri sayısal olmalıdır.');
  } else if (grid.rowDirection !== 'SOUTH' || grid.colDirection !== 'EAST') {
    record('grid', VALIDATION_STATUS.INVALID, `Satır/sütun yönü SOUTH/EAST olmalıdır (gelen: ${grid.rowDirection}/${grid.colDirection}).`);
  } else {
    const pixelReg = grid.pixelRegistration ?? (grid.rasterType === 'PixelIsArea' ? 'PIXEL_IS_AREA' : null);
    if (pixelReg !== 'PIXEL_IS_AREA' || grid.rasterType !== 'PixelIsArea') {
      record('grid', VALIDATION_STATUS.NEEDS_REVIEW, `Piksel kayıt kuralı (${pixelReg ?? 'belirsiz'}) yarım piksel belirsizliği içeriyor; insan doğrulaması olmadan örnekleme açılmaz.`);
    } else if (
      !approxEq(grid.mapScaleM, expectedFrame.mapScaleM) ||
      !approxEq(grid.lineProjectionOffset, expectedFrame.lineProjectionOffset) ||
      !approxEq(grid.sampleProjectionOffset, expectedFrame.sampleProjectionOffset) ||
      grid.lines !== expectedFrame.lines ||
      grid.samples !== expectedFrame.samples
    ) {
      record('grid', VALIDATION_STATUS.INVALID, 'Grid ölçeği, boyutu veya projeksiyon ofseti kanonik çerçeveyle uyuşmuyor.');
    } else {
      record('grid', VALIDATION_STATUS.SUPPORTED, `${grid.lines}×${grid.samples} hücre, ${grid.mapScaleM.toFixed(6)} m/px, ${pixelReg}`);
    }
  }

  // Numerical coverage & bounds check
  const cov = manifest.coverage;
  if (!cov || typeof cov !== 'object') {
    record('coverage', VALIDATION_STATUS.INVALID, 'Kapsama alanı (coverage) nesnesi eksik.');
  } else if (!isNonEmptyStr(cov.description)) {
    record('coverage', VALIDATION_STATUS.INVALID, 'Kapsama alanı açıklaması (coverage.description) eksik.');
  } else if (cov.localBoundsM && isFinNum(cov.localBoundsM.xMin) && isFinNum(cov.localBoundsM.xMax) && isFinNum(cov.localBoundsM.yMin) && isFinNum(cov.localBoundsM.yMax)) {
    const { xMin, xMax, yMin, yMax } = cov.localBoundsM;
    const window = manifest.grid?.loadedWindow;
    const windowValid = Number.isInteger(window?.row0) && Number.isInteger(window?.col0) &&
      Number.isInteger(window?.rows) && Number.isInteger(window?.cols) &&
      window.row0 >= 0 && window.col0 >= 0 && window.rows > 0 && window.cols > 0 &&
      window.row0 + window.rows <= manifest.grid?.lines && window.col0 + window.cols <= manifest.grid?.samples;
    if (xMin >= xMax || yMin >= yMax) {
      record('coverage', VALIDATION_STATUS.INVALID, 'Sayısal localBoundsM sınırları geçersiz (xMin >= xMax veya yMin >= yMax).');
    } else if (!windowValid || !manifest.crs || !isPosNum(manifest.crs.radiusKm) ||
      !isFinNum(manifest.crs.centerLatDeg) || !isFinNum(manifest.crs.centerLonDeg) ||
      !isPosNum(manifest.grid.mapScaleM) || !isFinNum(manifest.grid.lineProjectionOffset) ||
      !isFinNum(manifest.grid.sampleProjectionOffset)) {
      record('coverage', VALIDATION_STATUS.NEEDS_REVIEW, 'Yüklenen raster penceresinin sayısal boyutu/çerçevesi doğrulanmadı.');
    } else {
      const sourceAdapter = adapterFromLabel({ ...manifest.crs, ...manifest.grid }, WAYPOINTS[0]);
      const nw = sourceAdapter.pixelToLocal(window.row0 - 0.5, window.col0 - 0.5);
      const se = sourceAdapter.pixelToLocal(window.row0 + window.rows - 0.5, window.col0 + window.cols - 0.5);
      const boundsMatch = closeMetres(xMin, nw.x) && closeMetres(xMax, se.x) &&
        closeMetres(yMin, se.y) && closeMetres(yMax, nw.y);
      const endpointsCovered = WAYPOINTS.every((w) => {
        const { x, y } = sourceAdapter.latLonToLocal(w.latDeg, w.lonDeg);
        return x >= nw.x && x <= se.x && y >= se.y && y <= nw.y;
      });
      if (!boundsMatch || !endpointsCovered) {
        record('coverage', VALIDATION_STATUS.NEEDS_REVIEW, 'Bildirilen kapsama sınırları raster penceresinin affine sınırlarıyla veya rota uçlarıyla uyuşmuyor.');
      } else {
        record('coverage', VALIDATION_STATUS.SUPPORTED, `Affine penceresi ve iki rota ucu doğrulandı [x: ${xMin.toFixed(1)}..${xMax.toFixed(1)}, y: ${yMin.toFixed(1)}..${yMax.toFixed(1)}] m`);
      }
    }
  } else if (cov.latLonBounds && isFinNum(cov.latLonBounds.north) && isFinNum(cov.latLonBounds.south) && isFinNum(cov.latLonBounds.west) && isFinNum(cov.latLonBounds.east)) {
    const { north, south, west, east } = cov.latLonBounds;
    if (south >= north || west >= east) {
      record('coverage', VALIDATION_STATUS.INVALID, 'Sayısal latLonBounds sınırları geçersiz.');
    } else {
      record('coverage', VALIDATION_STATUS.NEEDS_REVIEW, `Enlem/boylam sınırları ${south.toFixed(4)}°..${north.toFixed(4)}°K, ${west.toFixed(4)}°..${east.toFixed(4)}°D; yüklenen pencere affine sınırları gerekli.`);
    }
  } else {
    record('coverage', VALIDATION_STATUS.NEEDS_REVIEW, 'Sayısal kapsama sınırları (localBoundsM veya latLonBounds) bulunamadı; insan incelemesi gerekir.');
  }

  // 6. No-data / special value, scaling/offset, valid range & format
  const valSpec = manifest.valueEncoding;
  if (!valSpec || typeof valSpec !== 'object') {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'Değer kodlaması (format, scaling, no-data ve pencere extrema bilgisi) eksik.');
  } else if (!SUPPORTED_FORMATS.includes(valSpec.format)) {
    record('valueEncoding', VALIDATION_STATUS.INVALID, `Desteklenmeyen veri biçimi: ${valSpec.format ?? 'belirsiz'}. Yalnız ${SUPPORTED_FORMATS.join(', ')} desteklenir.`);
  } else if (valSpec.sampleType !== 'IEEE_REAL' || valSpec.sampleBits !== 32 || valSpec.bands !== 1 || valSpec.compression !== 1 || ![1, 2].includes(valSpec.planarConfig) || valSpec.byteOrder !== 'LITTLE_ENDIAN') {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'Sample type/bits/bands/compression/planar config/byte order açık ve desteklenen değerler olmalıdır.');
  } else if (valSpec.noDataSource !== 'TIFF_GDAL_NODATA' || valSpec.rangeSemantics !== 'loaded_window_observed_extrema_only') {
    record('valueEncoding', VALIDATION_STATUS.NEEDS_REVIEW, 'No-data kaynağı veya extrema değerlerinin yalnızca pencere gözlemi olduğu belirtilmedi.');
  } else if (!approxEq(valSpec.scalingFactor, 1) || !approxEq(valSpec.offset, 0)) {
    record('valueEncoding', VALIDATION_STATUS.NEEDS_REVIEW, `SCALING_FACTOR=${valSpec.scalingFactor}, OFFSET=${valSpec.offset}: birim dönüşümü insan doğrulaması bekliyor.`);
  } else if (!isNonEmptyStr(valSpec.noDataHex) || !/^[0-9A-F]{8}$/i.test(valSpec.noDataHex)) {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'noDataHex (32-bit hex MISSING_CONSTANT) açıkça tanımlanmalıdır; 0 varsayılmaz.');
  } else if (!isFinNum(valSpec.observedMin) || !isFinNum(valSpec.observedMax) || valSpec.observedMin >= valSpec.observedMax) {
    record('valueEncoding', VALIDATION_STATUS.INVALID, 'Yüklenen pencerenin sonlu observedMin/observedMax değerleri eksik veya geçersiz.');
  } else {
    record('valueEncoding', VALIDATION_STATUS.SUPPORTED, `Biçim: ${valSpec.format}, no-data: 0x${valSpec.noDataHex.toUpperCase()}; pencere extrema [${valSpec.observedMin}, ${valSpec.observedMax}] m (ürün geçerlilik aralığı değildir).`);
  }

  // 7. Access & human review flags
  const access = manifest.access;
  if (!access || access.status !== STATUS.OK) {
    record('access', VALIDATION_STATUS.UNAVAILABLE, access?.reason ?? 'Veri kaynağına erişilemiyor.');
  } else {
    record('access', VALIDATION_STATUS.SUPPORTED, 'Yerel veri penceresi erişilebilir.');
  }

  const route = manifest.quality?.routeCheck;
  const routeLengthM = Math.hypot(
    (WAYPOINTS[1].lonDeg - WAYPOINTS[0].lonDeg) * expectedFrame.radiusKm * 1000 * Math.cos(expectedFrame.centerLatDeg * Math.PI / 180) * Math.PI / 180,
    (WAYPOINTS[1].latDeg - WAYPOINTS[0].latDeg) * expectedFrame.radiusKm * 1000 * Math.PI / 180,
  );
  if (!route || !isFinNum(routeLengthM) || !isFinNum(route.lengthM) || Math.abs(route.lengthM - routeLengthM) > 0.001 ||
      !Number.isInteger(route.samples) || route.samples < 2 || route.nonOkElevationSamples !== 0 ||
      manifest.quality?.windowStats?.noData !== 0 || manifest.quality?.windowStats?.invalid !== 0) {
    record('route', VALIDATION_STATUS.NEEDS_REVIEW, 'Hazırlanan pencerede rota kapsamı/geçerli hücre sayımı doğrulanmadı.');
  } else {
    record('route', VALIDATION_STATUS.SUPPORTED, `${route.samples} rota örneği bildirildi; yükleyici rota penceresindeki tüm hücreleri raster üzerinden yeniden sayar.`);
  }

  if (manifest.humanReviewRequired === true) {
    record('humanReview', VALIDATION_STATUS.NEEDS_REVIEW, manifest.humanReviewNote ?? 'Manifest insan incelemesi gerektiriyor; örnekleme kapalı.');
  } else {
    record('humanReview', VALIDATION_STATUS.SUPPORTED, 'Açık insan incelemesi kilidi yok.');
  }

  // Overall status priority: INVALID > UNAVAILABLE > NEEDS_REVIEW > SUPPORTED
  let status = VALIDATION_STATUS.SUPPORTED;
  let reasonCode = 'verified';
  if (issues.some((i) => i.status === VALIDATION_STATUS.INVALID)) {
    status = VALIDATION_STATUS.INVALID;
    reasonCode = `invalid_${issues.find((i) => i.status === VALIDATION_STATUS.INVALID).field}`;
  } else if (issues.some((i) => i.status === VALIDATION_STATUS.UNAVAILABLE)) {
    status = VALIDATION_STATUS.UNAVAILABLE;
    reasonCode = 'resource_unavailable';
  } else if (issues.some((i) => i.status === VALIDATION_STATUS.NEEDS_REVIEW)) {
    status = VALIDATION_STATUS.NEEDS_REVIEW;
    reasonCode = `needs_review_${issues.find((i) => i.status === VALIDATION_STATUS.NEEDS_REVIEW).field}`;
  }

  const summary = status === VALIDATION_STATUS.SUPPORTED
    ? 'Tüm zorunlu metadata, düşey datum kanıtı, lisans ve kanonik yerel metre dönüşümü doğrulandı (supported).'
    : issues.map((i) => `[${i.field} → ${i.status}] ${i.message}`).join(' | ');

  return {
    status,
    samplingAllowed: status === VALIDATION_STATUS.SUPPORTED,
    reasonCode,
    summary,
    fields,
    issues,
  };
}

/** Builds a layer manifest from the prepared HiRISE `dtm_subset.json` metadata. */
export function buildHiriseManifestFromMeta(meta) {
  const label = meta.label ?? {};
  return {
    id: 'hirise-jezero-dtm',
    title: label.title ?? 'USGS Mars 2020 TRN HiRISE DTM Mozaiği (Jezero)',
    kind: 'elevation',
    product: label.productId ?? 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40',
    version: String(label.productVersionId ?? 'soc_006_blend40'),
    source: label.producer ?? 'USGS Astrogeology Science Center / NASA JPL',
    attribution: label.citation ?? 'USGS Astrogeology / NASA / JPL-Caltech / Univ. of Arizona',
    useConstraints: label.useConstraints ?? null,
    useConstraintsEvidence: label.useConstraintsEvidence ?? null,
    provenanceEvidence: label.provenanceEvidence ?? null,
    body: 'MARS',
    timeCoverage: {
      summary: meta.timeCoverage ?? (label.dataSetId ? `${label.dataSetId} · ${label.sourceProductIds}` : 'Statik arşiv ürünü'),
      simClockRelation: 'independent_static_archive',
    },
    unit: 'm',
    verticalDatum: label.verticalDatum ?? null,
    verticalDatumVerified: label.verticalDatumVerified === true,
    verticalDatumEvidence: label.verticalDatumEvidence ?? null,
    crs: {
      projectionType: label.projectionType,
      latitudeType: label.latitudeType,
      positiveLongitudeDirection: label.positiveLongitude,
      radiusKm: label.radiusKm,
      centerLatDeg: label.centerLatDeg,
      centerLonDeg: label.centerLonDeg,
      rotationDeg: label.rotationDeg,
      description: meta.crsText,
    },
    grid: {
      lines: label.lines,
      samples: label.samples,
      mapScaleM: label.mapScaleM,
      lineProjectionOffset: label.lineProjectionOffset,
      sampleProjectionOffset: label.sampleProjectionOffset,
      upperLeftX: label.upperLeftX,
      upperLeftY: label.upperLeftY,
      rowDirection: 'SOUTH',
      colDirection: 'EAST',
      pixelRegistration: label.pixelRegistration ?? (label.rasterType === 'PixelIsArea' ? 'PIXEL_IS_AREA' : 'CENTER_PDS_1BASED'),
      rasterType: label.rasterType ?? 'PixelIsArea',
      loadedWindow: meta.window ?? null,
    },
    coverage: meta.coverage ?? null,
    valueEncoding: {
      format: 'GEOTIFF_FLOAT32_WINDOW',
      sampleType: label.sampleType,
      sampleBits: label.sampleBits,
      bands: label.bands,
      compression: label.compression,
      planarConfig: label.planarConfig,
      byteOrder: label.byteOrder,
      noDataSource: label.noDataSource,
      rangeSemantics: label.rangeSemantics,
      scalingFactor: label.scalingFactor,
      offset: label.offset,
      noDataHex: label.missingConstantHex,
      observedMin: label.observedMin,
      observedMax: label.observedMax,
    },
    quality: {
      windowStats: meta.windowStats ?? null,
      registration: meta.registration ?? null,
      transformControls: meta.transformControls ?? null,
      transformToleranceM: meta.transformToleranceM ?? null,
      transformComparison: meta.transformComparison ?? null,
      routeCheck: meta.routeCheck ?? null,
    },
    access: { status: STATUS.OK, reason: null },
    humanReviewRequired: label.verticalDatumVerified !== true,
    humanReviewNote: label.verticalDatumVerified === true ? null : 'Ürüne özgü düşey datum kanıtı yok; candidate örneklemeye kapalı.',
  };
}

/** Converts a manifest + validation result into a layer descriptor for the UI and UnavailableLayer. */
export function manifestToDescriptor(manifest, validation) {
  const base = dtmBaseDescriptor();
  if (!manifest || typeof manifest !== 'object') {
    return makeDescriptor({
      ...base,
      validation,
      access: { status: STATUS.INVALID, reason: validation?.summary ?? 'Geçersiz manifest' },
    });
  }
  const accessStatus = validation.samplingAllowed
    ? STATUS.OK
    : validation.status === VALIDATION_STATUS.UNAVAILABLE
      ? STATUS.UNAVAILABLE
      : STATUS.INVALID;
  return makeDescriptor({
    id: manifest.id ?? base.id,
    kind: manifest.kind ?? base.kind,
    title: manifest.title ?? base.title,
    source: manifest.source ?? base.source,
    product: manifest.product ?? base.product,
    version: manifest.version ?? null,
    attribution: manifest.attribution ?? base.attribution,
    license: manifest.useConstraints ?? null,
    body: manifest.body ?? 'MARS',
    unit: manifest.unit ?? null,
    verticalDatum: manifest.verticalDatum ?? null,
    verticalDatumVerified: manifest.verticalDatumVerified ?? null,
    verticalDatumEvidence: manifest.verticalDatumEvidence ?? null,
    crs: manifest.crs?.description ?? (manifest.crs ? `${manifest.crs.projectionType ?? '?'} (${manifest.crs.latitudeType ?? '?'})` : null),
    pixelScaleM: manifest.grid?.mapScaleM ?? null,
    size: manifest.grid ? {
      rows: manifest.grid.lines,
      cols: manifest.grid.samples,
      loadedWindow: manifest.grid.loadedWindow ?? null,
      rowDirection: manifest.grid.rowDirection,
      colDirection: manifest.grid.colDirection,
      pixelRegistration: manifest.grid.pixelRegistration,
    } : null,
    coverage: manifest.coverage ?? null,
    timeCoverage: manifest.timeCoverage?.summary ?? (typeof manifest.timeCoverage === 'string' ? manifest.timeCoverage : null),
    simClockRelation: manifest.timeCoverage?.simClockRelation ?? null,
    noData: manifest.valueEncoding ? {
      constantHex: manifest.valueEncoding.noDataHex,
      rule: `Tam 32-bit desen eşleşmesi (0x${manifest.valueEncoding.noDataHex}) → no_data · ölçek=${manifest.valueEncoding.scalingFactor}, ofset=${manifest.valueEncoding.offset}`,
    } : null,
    quality: manifest.valueEncoding ? {
      observedMin: manifest.valueEncoding.observedMin,
      observedMax: manifest.valueEncoding.observedMax,
      format: manifest.valueEncoding.format,
      windowStats: manifest.quality?.windowStats ?? null,
      registration: manifest.quality?.registration ?? null,
    } : null,
    validation,
    access: {
      status: accessStatus,
      reason: validation.samplingAllowed ? null : `[${validation.status} / ${validation.reasonCode}] ${validation.summary}`,
    },
  });
}

/**
 * Registry and factory for SurfaceProviders.
 * Keeps `SurfaceProvider` contract intact (`sampleElevation`, `sampleSlope`, `sampleSurface`).
 * The USGS Jezero TRN mosaic is preferred when validated; the prior PDS3 IMG-derived DTM remains a
 * coordinate-bridged fallback. The JP2 source stays unavailable until a decoder is present.
 */
export class SurfaceProviderRegistry {
  constructor({ expectedFrame, adapter, defaultProviderId = 'hirise-jezero-dtm' }) {
    this.expectedFrame = expectedFrame;
    this.adapter = adapter;
    this.defaultProviderId = defaultProviderId;
    this.entries = new Map();
  }

  register(entry) {
    if (!entry || !isNonEmptyStr(entry.id) || typeof entry.load !== 'function') {
      throw new Error('Provider kaydı için geçerli id ve load() işlevi zorunludur.');
    }
    this.entries.set(entry.id, entry);
    return this;
  }

  listRegisteredIds() {
    return [...this.entries.keys()];
  }

  instantiateFromManifest(manifest, createSupportedLayer = null) {
    const validation = validateLayerManifest(manifest, this.expectedFrame);
    const descriptor = manifestToDescriptor(manifest, validation);
    if (!validation.samplingAllowed || typeof createSupportedLayer !== 'function') {
      const reason = `[${validation.status} / ${validation.reasonCode}] ${validation.summary}`;
      return {
        provider: new UnavailableLayer(descriptor, reason),
        validation,
        descriptor,
      };
    }
    const provider = createSupportedLayer(descriptor);
    return { provider, validation, descriptor };
  }

  async loadProvider(id, options = {}) {
    const entry = this.entries.get(id);
    if (!entry) {
      const validation = {
        status: VALIDATION_STATUS.UNAVAILABLE,
        samplingAllowed: false,
        reasonCode: 'provider_not_registered',
        summary: `Kayıtlı olmayan yüzey sağlayıcı: ${id}`,
        fields: {},
        issues: [{ field: 'id', status: VALIDATION_STATUS.UNAVAILABLE, message: `${id} kayıtlı değil.` }],
      };
      const desc = manifestToDescriptor({ id, title: id, kind: 'elevation', product: id }, validation);
      return { id, provider: new UnavailableLayer(desc, desc.access.reason), validation };
    }
    try {
      const trustedLegacy = TRUSTED_LEGACY_ENTRIES.has(entry);
      const expectedFrame = trustedLegacy ? LEGACY_HIRISE_FRAME : this.expectedFrame;
      const loaded = await entry.load({ ...options, expectedFrame, adapter: this.adapter });
      // The legacy fixture has its own PDS3 validator. All other manifests must pass
      // the registry validator even if a loader supplies a claimed validation result.
      const validation = trustedLegacy && loaded.validation
        ? loaded.validation : validateLayerManifest(loaded.manifest, expectedFrame);
      const descriptor = manifestToDescriptor(loaded.manifest, validation);
      if (!validation.samplingAllowed) {
        return {
          id,
          provider: new UnavailableLayer(descriptor, descriptor.access.reason),
          validation,
        };
      }
      const provider = await loaded.createLayer(descriptor);
      return { id, provider, validation };
    } catch (e) {
      const validation = {
        status: VALIDATION_STATUS.UNAVAILABLE,
        samplingAllowed: false,
        reasonCode: 'load_exception',
        summary: `Sağlayıcı yüklenirken hata: ${e.message}`,
        fields: {},
        issues: [{ field: 'access', status: VALIDATION_STATUS.UNAVAILABLE, message: e.message }],
      };
      const desc = manifestToDescriptor({ id: entry.id, title: entry.title, kind: 'elevation', product: entry.id }, validation);
      return { id, provider: new UnavailableLayer(desc, desc.access.reason), validation };
    }
  }

  async resolveActiveProvider({ preferredId = this.defaultProviderId, ...options } = {}) {
    const primary = await this.loadProvider(preferredId, options);
    if (primary.provider.available) {
      return {
        activeId: primary.id,
        provider: primary.provider,
        validation: primary.validation,
        fallbackUsed: false,
        rejectedCandidate: null,
        competitionDataStatus: 'Tercih edilen doğrulanmış USGS Mars 2020 TRN HiRISE DTM mozaiği aktif.',
      };
    }
    let failedDefault = null;
    if (preferredId !== this.defaultProviderId) {
      failedDefault = await this.loadProvider(this.defaultProviderId, options);
      if (failedDefault.provider.available) {
        return {
          activeId: failedDefault.id,
          provider: failedDefault.provider,
          validation: failedDefault.validation,
          fallbackUsed: true,
          rejectedCandidate: { id: preferredId, status: primary.validation.status, reasonCode: primary.validation.reasonCode, summary: primary.validation.summary },
          competitionDataStatus: `Aday katman (${preferredId}) reddedildi; doğrulanmış USGS HiRISE sağlayıcısı seçildi.`,
        };
      }
    }
    const fallback = this.entries.has('hirise-legacy-jezero-dtm')
      ? await this.loadProvider('hirise-legacy-jezero-dtm', options)
      : (failedDefault ?? primary);
    if (!fallback.provider.available) {
      return {
        activeId: fallback.id,
        provider: fallback.provider,
        validation: fallback.validation,
        fallbackUsed: fallback.id !== preferredId,
        rejectedCandidate: { id: preferredId, status: primary.validation.status, reasonCode: primary.validation.reasonCode, summary: primary.validation.summary },
        competitionDataStatus: `USGS adayı ve legacy HiRISE fallback kullanılamıyor: ${primary.validation.summary}${failedDefault ? ` · ${failedDefault.validation.summary}` : ''}`,
      };
    }
    return {
      activeId: fallback.id,
      provider: fallback.provider,
      validation: fallback.validation,
      fallbackUsed: true,
      rejectedCandidate: {
        id: preferredId,
        status: primary.validation.status,
        reasonCode: primary.validation.reasonCode,
        summary: primary.validation.summary,
      },
      competitionDataStatus: `USGS adayı (${primary.validation.status}: ${primary.validation.reasonCode}) kullanılmadı; legacy PDS3 HiRISE DTM fallback aktif.`,
    };
  }
}

/** Creates the registry with the USGS Jezero DTM preferred and the older PDS3 DTM as its fallback. */
export function createDefaultSurfaceRegistry({ expectedFrame, adapter, baseUrl = 'data', fetchImpl = fetch }) {
  const registry = new SurfaceProviderRegistry({
    expectedFrame,
    adapter,
    defaultProviderId: 'hirise-jezero-dtm',
  });

  registry.register({
    id: 'hirise-jezero-dtm',
    title: 'USGS Mars 2020 TRN HiRISE DTM Mozaiği (Jezero)',
    isCompetitionData: false,
    load: async () => {
      let meta;
      try {
        const res = await fetchImpl(`${baseUrl}/dtm_subset.json`);
        if (!res.ok) {
          return {
            manifest: {
              ...buildHiriseManifestFromMeta({ label: expectedFrame }),
              access: { status: STATUS.UNAVAILABLE, reason: `DTM meta verisi bulunamadı (HTTP ${res.status}). Önce "npm run prepare-data" çalıştırın.` },
            },
          };
        }
        meta = await res.json();
      } catch (e) {
        return {
          manifest: {
            ...buildHiriseManifestFromMeta({ label: expectedFrame }),
            access: { status: STATUS.UNAVAILABLE, reason: `DTM meta verisi okunamadı: ${e.message}` },
          },
        };
      }
      const manifest = buildHiriseManifestFromMeta(meta);
      return {
        manifest,
        createLayer: async (validatedDescriptor) => {
          const layer = await loadDtmLayer({ baseUrl, adapter, expectedFrame, fetchImpl });
          if (layer.available) {
            // The prepared rectangular window contains the whole straight demo route.
            // Scan every loaded cell, including cells between the extractor's route samples.
            let valid = 0, noData = 0, invalid = 0;
            let observedMin = Infinity, observedMax = -Infinity;
            for (let i = 0; i < layer.values.length; i++) {
              if (layer.bits[i] === layer.noDataBits) { noData++; continue; }
              const value = layer.values[i];
              if (!Number.isFinite(value)) { invalid++; continue; }
              valid++;
              if (value < observedMin) observedMin = value;
              if (value > observedMax) observedMax = value;
            }
            const stats = meta.windowStats;
            if (valid !== stats?.valid || noData !== stats?.noData || invalid !== stats?.invalid ||
                noData !== 0 || invalid !== 0 || observedMin !== stats?.min || observedMax !== stats?.max ||
                observedMin !== meta.label?.observedMin || observedMax !== meta.label?.observedMax) {
              return new UnavailableLayer(validatedDescriptor, 'DTM pencere rasterı manifestteki tam hücre sayımı/extrema ile uyuşmuyor; USGS örneklemesi kapalı.');
            }
            layer.descriptor = {
              ...layer.descriptor,
              ...validatedDescriptor,
              access: { status: STATUS.OK, reason: null },
            };
          } else {
            layer.descriptor = {
              ...layer.descriptor,
              validation: validatedDescriptor.validation,
            };
          }
          return layer;
        },
      };
    },
  });

  const legacyEntry = {
    id: 'hirise-legacy-jezero-dtm',
    title: 'HiRISE PDS3 Jezero DTM legacy fallback',
    expectedFrame: LEGACY_HIRISE_FRAME,
    load: async ({ adapter: canonicalAdapter }) => {
      try {
        const res = await fetchImpl(`${baseUrl}/legacy-hirise/dtm_subset.json`);
        if (!res.ok) throw new Error(`Legacy DTM metadata unavailable (HTTP ${res.status})`);
        const meta = await res.json();
        const validation = validateLegacyFixture(meta);
        const manifest = buildLegacyDescriptor(meta, validation);
        const bridge = validation.samplingAllowed ? makeLegacyCoordinateBridge(canonicalAdapter, meta.label) : null;
        return {
          manifest,
          validation,
          createLayer: async () => {
            const layer = await loadDtmLayer({
              baseUrl: `${baseUrl}/legacy-hirise`,
              adapter: bridge.adapter,
              expectedFrame: LEGACY_HIRISE_FRAME,
              fetchImpl,
            });
            if (layer.available) {
              layer.descriptor = {
                ...manifest,
                quality: { ...manifest.quality, transformControls: bridge.controls, transformToleranceM: bridge.toleranceM },
                access: { status: STATUS.OK, reason: null },
              };
            }
            return layer;
          },
        };
      } catch (error) {
        return {
          manifest: { id: 'hirise-legacy-jezero-dtm', title: 'HiRISE PDS3 Jezero DTM legacy fallback', kind: 'elevation' },
          validation: {
            status: VALIDATION_STATUS.UNAVAILABLE,
            samplingAllowed: false,
            reasonCode: 'legacy_fixture_unavailable',
            summary: error.message,
            fields: {},
            issues: [{ field: 'access', status: VALIDATION_STATUS.UNAVAILABLE, message: error.message }],
          },
        };
      }
    },
  };
  TRUSTED_LEGACY_ENTRIES.add(legacyEntry);
  registry.register(legacyEntry);

  return registry;
}
