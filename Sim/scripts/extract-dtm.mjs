// Prepares a read-only window of the verified USGS Mars 2020 TRN HiRISE DTM mosaic for the browser app.
// Usage:  node scripts/extract-dtm.mjs [path/to/DTM.tif]
// Inputs are opened read-only ('r'). Outputs go to Sim/data/ only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterFromLabel, pointToSegment } from '../public/js/geo/geo.js';
import { GridElevationLayer, makeDescriptor, STATUS } from '../public/js/surface/layers.js';
import { WAYPOINTS, MAP_FRAME } from '../public/js/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const simRoot = path.resolve(here, '..');
const defaultTif = path.join(simRoot, '..', 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif');
const altTif = path.join(simRoot, 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif');
const dtmPath = path.resolve(process.argv[2] ?? (fs.existsSync(defaultTif) ? defaultTif : altTif));
const outDir = path.join(simRoot, 'data');
const MARGIN_CELLS = 500; // window margin around the route bounding box

console.log('Kaynak DTM:', dtmPath);
if (!fs.existsSync(dtmPath)) {
  console.error(`DTM dosyası bulunamadı: ${dtmPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------- Parse GeoTIFF metadata
function parseTiffMetadata(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const h = Buffer.alloc(8);
    if (fs.readSync(fd, h, 0, h.length, 0) !== h.length) throw new Error('Kısa TIFF başlığı');
    const le = h.toString('latin1', 0, 2) === 'II';
    if (!le && h.toString('latin1', 0, 2) !== 'MM') throw new Error('TIFF byte-order işareti geçersiz');
    const u16 = (b, o = 0) => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
    const u32 = (b, o = 0) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
    const magic = u16(h, 2);
    if (magic !== 42) throw new Error('Geçersiz TIFF formatı');
    const ifdOff = u32(h, 4);

    const read = (off, len) => {
      if (!Number.isSafeInteger(off) || !Number.isSafeInteger(len) || off < 0 || len < 0 || off + len > size) {
        throw new Error(`TIFF aralık sınır dışında: offset=${off}, bytes=${len}, file=${size}`);
      }
      const b = Buffer.alloc(len);
      if (fs.readSync(fd, b, 0, len, off) !== len) throw new Error(`TIFF kısa okuma: offset=${off}, bytes=${len}`);
      return b;
    };
    const TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
    const numTags = u16(read(ifdOff, 2));
    const entries = read(ifdOff + 2, numTags * 12);
    const tags = {};

    for (let i = 0; i < numTags; i++) {
      const e = entries.subarray(i * 12, i * 12 + 12);
      const tag = u16(e, 0);
      const type = u16(e, 2);
      const count = u32(e, 4);
      if (!TYPES[type] || count < 1 || tags[tag]) throw new Error(`TIFF tag ${tag} yinelenmiş veya desteklenmeyen type/count içeriyor`);
      const sz = TYPES[type] * count;
      const raw = sz <= 4 ? e.subarray(8, 8 + sz) : read(u32(e, 8), sz);
      let val;
      if (type === 2) val = raw.toString('latin1').replace(/\0+$/, '');
      else if ([1, 6, 7].includes(type)) val = Array.from(raw.subarray(0, count));
      else if ([3, 8].includes(type)) val = Array.from({ length: count }, (_, k) => u16(raw, k * 2));
      else if ([4, 9].includes(type)) val = Array.from({ length: count }, (_, k) => u32(raw, k * 4));
      else if (type === 11) val = Array.from({ length: count }, (_, k) => le ? raw.readFloatLE(k * 4) : raw.readFloatBE(k * 4));
      else if (type === 12) val = Array.from({ length: count }, (_, k) => (le ? raw.readDoubleLE(k * 8) : raw.readDoubleBE(k * 8)));
      else val = raw;
      tags[tag] = { type, count, val, raw: Buffer.from(raw) };
    }

    const geoKeys = {};
    if (!tags[34735] || tags[34735].type !== 3 || tags[34735].count < 4) throw new Error('GeoKeyDirectoryTag (34735) eksik/geçersiz');
    const dir = tags[34735].val;
    if (dir[0] !== 1 || dir[1] !== 1 || dir[2] !== 0 || dir.length !== 4 + dir[3] * 4) throw new Error('GeoKeyDirectoryTag sürümü veya uzunluğu desteklenmiyor');
    const dbl = tags[34736]?.val || [];
    const asc = typeof tags[34737]?.val === 'string' ? tags[34737].val : '';
    for (let k = 4; k + 3 < dir.length; k += 4) {
      const [id, loc, count, off] = dir.slice(k, k + 4);
      if (geoKeys[id] !== undefined) throw new Error(`GeoKey ${id} yinelenmiş`);
      if (loc === 0) geoKeys[id] = count === 1 ? off : null;
      else if (loc === 34735 && off + count <= dir.length) geoKeys[id] = dir.slice(off, off + count);
      else if (loc === 34736 && off + count <= dbl.length) geoKeys[id] = dbl.slice(off, off + count);
      else if (loc === 34737 && off + count <= asc.length) geoKeys[id] = asc.slice(off, off + count).replace(/\0+$/, '');
      else throw new Error(`GeoKey ${id} geçersiz location/count içeriyor`);
    }

    return { size, le, tags, geoKeys };
  } finally {
    fs.closeSync(fd);
  }
}

const tiffInfo = parseTiffMetadata(dtmPath);
if (path.basename(dtmPath) !== 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif') throw new Error('Input filename is not the identified USGS Jezero DTM mosaic');
const required = (id, type, count) => {
  const tag = tiffInfo.tags[id];
  if (!tag || tag.type !== type || (count != null && tag.count !== count)) throw new Error(`Gerekli TIFF tag ${id} type=${type}, count=${count ?? 'any'} eksik/uyumsuz`);
  return tag.val;
};
const scalar = (id, type) => required(id, type, 1)[0];
const width = scalar(256, 4), height = scalar(257, 4);
const sampleBits = scalar(258, 3), compression = scalar(259, 3), photometric = scalar(262, 3);
const samplesPerPixel = scalar(277, 3), rowsPerStrip = scalar(278, 4), planarConfig = scalar(284, 3), sampleFormat = scalar(339, 3);
const stripOffsets = required(273, 4), stripByteCounts = required(279, 4);
const pixelScale = required(33550, 12, 3), tiepoint = required(33922, 12, 6);
const noDataText = required(42113, 2, null).trim();
const geoKey = (id) => tiffInfo.geoKeys[id];
const scalarKey = (id) => Array.isArray(geoKey(id)) && geoKey(id).length === 1 ? geoKey(id)[0] : geoKey(id);
const rasterKey = scalarKey(1025), modelType = scalarKey(1024), coordTransform = scalarKey(3075);
const semiMajor = scalarKey(2057);
if (width !== 21400 || height !== 21488) throw new Error(`Boyutlar resmi mozaik boyutlarıyla uyuşmuyor: ${width}×${height}`);
if (sampleBits !== 32 || sampleFormat !== 3 || samplesPerPixel !== 1 || planarConfig !== 1 || photometric !== 1) throw new Error('Yalnız tek bant, 32-bit IEEE float, contiguous, BlackIsZero raster desteklenir');
if (compression !== 1) throw new Error(`Sıkıştırma ${compression} desteklenmiyor; güvenli decode yok`);
if (rasterKey !== 1) throw new Error(`GeoKey GTRasterTypeGeoKey PixelIsArea (=1) olmalı; gelen ${rasterKey ?? 'yok'}`);
if (modelType !== 1 || coordTransform !== 17) throw new Error(`GeoKey projeksiyon tanımı Equirectangular olmalı (model=1, transform=17); gelen ${modelType}/${coordTransform}`);
if (!Number.isFinite(semiMajor) || semiMajor !== 3396190) throw new Error(`GeoKey semi-major radius eksik/uyumsuz: ${semiMajor}`);
const standardParallelDeg = scalarKey(3078), centralMeridianDeg = scalarKey(3080);
if (standardParallelDeg !== 0 || centralMeridianDeg !== 0) throw new Error('GeoKey standard parallel/central meridian eksik veya beklenmeyen');
if (pixelScale[0] !== 1 || pixelScale[1] !== 1 || pixelScale[2] !== 0 || tiepoint[0] !== 0 || tiepoint[1] !== 0 || tiepoint[2] !== 0) throw new Error('PixelScale/Tiepoint eksik veya beklenmeyen axis/origin içeriyor');
if (stripOffsets.length !== stripByteCounts.length || stripOffsets.length !== Math.ceil(height / rowsPerStrip)) throw new Error('StripOffsets/StripByteCounts sayısı RowsPerStrip ile uyuşmuyor');
if (!tiffInfo.le) throw new Error('Big-endian float TIFF desteklenmiyor; endian dönüşümü açıkça uygulanmalı');
const strips = stripOffsets.map((offset, i) => {
  const rows = Math.min(rowsPerStrip, height - i * rowsPerStrip);
  const expectedBytes = rows * width * 4;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(stripByteCounts[i]) || stripByteCounts[i] !== expectedBytes || offset + expectedBytes > tiffInfo.size) {
    throw new Error(`Strip ${i} byte offset/count yapısı beklenenden farklı`);
  }
  return { offset, bytes: expectedBytes, rowStart: i * rowsPerStrip, rows };
});
const sortedStrips = [...strips].sort((a, b) => a.offset - b.offset);
for (let i = 1; i < sortedStrips.length; i++) if (sortedStrips[i - 1].offset + sortedStrips[i - 1].bytes > sortedStrips[i].offset) throw new Error('Strip aralıkları üst üste biniyor');
if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(noDataText)) throw new Error(`GDAL_NODATA tag sayısal float32 değil: ${noDataText}`);
const noDataValue = Number(noDataText);
const noDataBuffer = Buffer.alloc(4); noDataBuffer.writeFloatLE(noDataValue, 0);
const noDataBits = noDataBuffer.readUInt32LE(0) >>> 0;
if (!Number.isFinite(noDataValue) || !Number.isFinite(noDataBuffer.readFloatLE(0))) throw new Error('Nodata değeri sonlu float32 değil');
const rasterType = 'PixelIsArea';

const label = {
  productId: 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40',
  productVersionId: 'soc_006_blend40',
  dataSetId: 'Mars 2020 Terrain Relative Navigation (TRN) HiRISE DTM Mosaic',
  sourceProductIds: '6 stereo pairs: Jezero_E, Jezero_N, Jezero_C, Jezero_DL, Jezero_W, Jezero_CR (7 components)',
  producer: 'USGS Astrogeology Science Center (Fergason, Hare, Mayer, Galuszka, Redding, Smith, Shinaman) in collab. with NASA JPL',
  recordBytes: width * 4,
  imagePointer: 1,
  lines: height,
  samples: width,
  bands: 1,
  sampleBits,
  sampleType: sampleFormat === 3 ? 'IEEE_REAL' : 'UNKNOWN',
  noDataSource: 'TIFF_GDAL_NODATA',
  validRangeScope: 'loaded_window_observed',
  sampleFormat,
  compression,
  planarConfig,
  photometric,
  byteOrder: 'LITTLE_ENDIAN',
  stripCount: strips.length,
  offset: 0,
  scalingFactor: 1,
  missingConstantHex: noDataBits.toString(16).padStart(8, '0').toUpperCase(),
  validMin: null,
  validMax: null,
  projectionType: 'EQUIRECTANGULAR',
  latitudeType: 'PLANETOCENTRIC',
  positiveLongitude: 'EAST',
  radiusKm: semiMajor / 1000,
  centerLatDeg: standardParallelDeg,
  centerLonDeg: centralMeridianDeg,
  rotationDeg: 0,
  mapScaleM: pixelScale[0],
  upperLeftX: tiepoint[3],
  upperLeftY: tiepoint[4],
  lineProjectionOffset: tiepoint[4] - (rasterType === 'PixelIsArea' ? 0.5 * pixelScale[1] : 0),
  sampleProjectionOffset: -(tiepoint[3] + (rasterType === 'PixelIsArea' ? 0.5 * pixelScale[0] : 0)),
  rasterType,
  pixelRegistration: rasterType === 'PixelIsArea' ? 'PIXEL_IS_AREA' : 'CENTER_PDS_1BASED',
  verticalDatum: null,
  verticalDatumVerified: false,
  verticalDatumEvidence: null,
  minLatDeg: 18.306799449686565,
  maxLatDeg: 18.669315006877746,
  westLonDeg: 77.22293307697142,
  eastLonDeg: 77.58396402093508,
  useConstraints: 'This work is marked with CC0 1.0 Universal',
  useConstraintsEvidence: { statement: 'This work is marked with CC0 1.0 Universal', sourceUrl: 'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic' },
  provenanceEvidence: {
    productId: 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40',
    version: 'soc_006_blend40',
    sourceUrl: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl',
  },
  citation: 'Fergason, R. L., et al., 2020, 51st LPSC, Abstract #2020. DOI: 10.5066/P9REJ9JN',
};

console.log('Doğrulanan DTM başlığı:', {
  lines: label.lines,
  samples: label.samples,
  scaleM: label.mapScaleM,
  upperLeft: [label.upperLeftX, label.upperLeftY],
  L0: label.lineProjectionOffset,
  S0: label.sampleProjectionOffset,
  radiusKm: label.radiusKm,
  noDataHex: label.missingConstantHex,
});

// ---------------------------------------------------------------- Coordinate Adapter & Waypoints
const adapter = adapterFromLabel(label, WAYPOINTS[0]);
if (
  label.mapScaleM !== MAP_FRAME.mapScaleM ||
  label.lineProjectionOffset !== MAP_FRAME.lineProjectionOffset ||
  label.sampleProjectionOffset !== MAP_FRAME.sampleProjectionOffset ||
  label.radiusKm !== MAP_FRAME.radiusKm ||
  label.lines !== MAP_FRAME.lines || label.samples !== MAP_FRAME.samples ||
  label.upperLeftX !== MAP_FRAME.upperLeftX || label.upperLeftY !== MAP_FRAME.upperLeftY
) throw new Error('TIFF grid / axis / projection values do not match the checked canonical frame; extraction refused');
const wp = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
const wpCells = wp.map((w) => adapter.localToCell(w.local.x, w.local.y));
const transformToleranceM = Math.SQRT1_2 * label.mapScaleM + 0.01;
const transformControls = wp.map((w, i) => {
  const cell = wpCells[i];
  const center = adapter.pixelToLocal(cell.row, cell.col);
  const residualM = Math.hypot(center.x - w.local.x, center.y - w.local.y);
  return { id: w.id, row: cell.row, col: cell.col, residualM: +residualM.toFixed(6) };
});
if (transformControls.some((c) => c.residualM > transformToleranceM)) throw new Error('Waypoint transform residual exceeds half-cell-diagonal tolerance');

console.log('Waypointler ve hücreler:');
wp.forEach((w, i) => {
  console.log(`  ${w.label}: local (${w.local.x.toFixed(2)}, ${w.local.y.toFixed(2)}) m -> cell row ${wpCells[i].row}, col ${wpCells[i].col} (rowF: ${wpCells[i].rowF.toFixed(3)}, colF: ${wpCells[i].colF.toFixed(3)})`);
});

// Determine extraction window bounding box
const rMin = Math.min(...wpCells.map((c) => c.row));
const rMax = Math.max(...wpCells.map((c) => c.row));
const cMin = Math.min(...wpCells.map((c) => c.col));
const cMax = Math.max(...wpCells.map((c) => c.col));
const row0 = Math.max(0, rMin - MARGIN_CELLS);
const row1 = Math.min(label.lines - 1, rMax + MARGIN_CELLS);
const col0 = Math.max(0, cMin - MARGIN_CELLS);
const col1 = Math.min(label.samples - 1, cMax + MARGIN_CELLS);
const rows = row1 - row0 + 1;
const cols = col1 - col0 + 1;

console.log('Çıkarılacak pencere:', { row0, row1, col0, col1, rows, cols, totalCells: rows * cols, bytes: rows * cols * 4 });

// ---------------------------------------------------------------- Extract window from TIFF
const out = Buffer.alloc(rows * cols * 4);
const fd = fs.openSync(dtmPath, 'r');
try {
  for (let r = 0; r < rows; r++) {
    const fileRow = row0 + r;
    const strip = strips[Math.floor(fileRow / rowsPerStrip)];
    if (!strip || fileRow < strip.rowStart || fileRow >= strip.rowStart + strip.rows) throw new Error(`Strip mapping missing for row ${fileRow}`);
    const pos = strip.offset + (fileRow - strip.rowStart) * label.recordBytes + col0 * 4;
    const got = fs.readSync(fd, out, r * cols * 4, cols * 4, pos);
    if (got !== cols * 4) throw new Error(`Kısa okuma: satır ${fileRow}, istenen ${cols * 4}, okunan ${got}`);
  }
} finally {
  fs.closeSync(fd);
}

// Float32 and Uint32 views
const values = new Float32Array(out.buffer, out.byteOffset, rows * cols);
const bits = new Uint32Array(out.buffer, out.byteOffset, rows * cols);

let nValid = 0, nNoData = 0, nInvalid = 0;
let zMin = Infinity, zMax = -Infinity;

for (let i = 0; i < values.length; i++) {
  const u = bits[i];
  const v = values[i];
  if (u === noDataBits) {
    nNoData++;
  } else if (!Number.isFinite(v)) {
    nInvalid++;
  } else {
    nValid++;
    if (v < zMin) zMin = v;
    if (v > zMax) zMax = v;
  }
}
if (!nValid) throw new Error('Window has no valid elevation cells; output refused');
label.validMin = zMin;
label.validMax = zMax;

console.log('Pencere istatistiği:', { valid: nValid, noData: nNoData, invalid: nInvalid, zMin, zMax });

// Window coverage in local metres and lat/lon
const nw = adapter.pixelToLocal(row0 - 0.5, col0 - 0.5);
const se = adapter.pixelToLocal(row1 + 0.5, col1 + 0.5);
const nwLL = adapter.localToLatLon(nw.x, nw.y);
const seLL = adapter.localToLatLon(se.x, se.y);

// ---------------------------------------------------------------- Route validation
const descriptor = makeDescriptor({
  product: label.productId,
  unit: 'm',
  verticalDatum: label.verticalDatum,
});
const layer = new GridElevationLayer({
  descriptor,
  adapter,
  values,
  rows,
  cols,
  rowOffset: row0,
  colOffset: col0,
  noDataBits,
  validMin: label.validMin,
  validMax: label.validMax,
});

const A = wp[0].local;
const B = wp[1].local;
const seg = pointToSegment(0, 0, A.x, A.y, B.x, B.y);
const N = 681; // 681 samples across ~687.3 m segment
const zs = [];
const slopes = [];
let nonOk = 0;

for (let k = 0; k < N; k++) {
  const t = k / (N - 1);
  const x = A.x + t * (B.x - A.x);
  const y = A.y + t * (B.y - A.y);
  const e = layer.sampleElevation(x, y);
  const s = layer.sampleSlope(x, y);
  if (e.status === STATUS.OK) zs.push(e.value);
  else nonOk++;
  if (s.status === STATUS.OK) slopes.push(s.value);
}

const sorted = [...slopes].sort((a, b) => a - b);
const routeCheck = {
  lengthM: +seg.length.toFixed(3),
  samples: N,
  nonOkElevationSamples: nonOk,
  slopeSamples: slopes.length,
  elevMin: +Math.min(...zs).toFixed(3),
  elevMax: +Math.max(...zs).toFixed(3),
  elevStart: +zs[0].toFixed(3),
  elevEnd: +zs[zs.length - 1].toFixed(3),
  slopeMeanDeg: +(slopes.reduce((a, b) => a + b, 0) / slopes.length).toFixed(3),
  slopeP90Deg: +sorted[Math.floor(0.9 * (sorted.length - 1))].toFixed(3),
  slopeMaxDeg: +sorted[sorted.length - 1].toFixed(3),
};

console.log('Rota kontrolü:', routeCheck);

// ---------------------------------------------------------------- Save outputs
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'dtm_subset.f32'), Buffer.from(values.buffer, values.byteOffset, values.byteLength));

const st = fs.statSync(dtmPath);
const meta = {
  generatedBy: 'scripts/extract-dtm.mjs',
  generatedAt: new Date().toISOString(),
  sourceFile: { name: path.basename(dtmPath), bytes: st.size, modified: st.mtime.toISOString() },
  dataFile: 'dtm_subset.f32',
  dataEncoding: 'float32 little-endian, satır öncelikli, no-data bit deseni korunmuş',
  label,
  frameMatchesConfig: (
    Math.abs(MAP_FRAME.radiusKm - label.radiusKm) <= 1e-6 &&
    Math.abs(MAP_FRAME.centerLatDeg - label.centerLatDeg) <= 1e-6 &&
    Math.abs(MAP_FRAME.centerLonDeg - label.centerLonDeg) <= 1e-6 &&
    Math.abs(MAP_FRAME.mapScaleM - label.mapScaleM) <= 1e-6 &&
    Math.abs(MAP_FRAME.lineProjectionOffset - label.lineProjectionOffset) <= 1e-6 &&
    Math.abs(MAP_FRAME.sampleProjectionOffset - label.sampleProjectionOffset) <= 1e-6 &&
    MAP_FRAME.lines === label.lines &&
    MAP_FRAME.samples === label.samples
  ),
  crsText: `Equirectangular, küre R=${label.radiusKm} km, merkez meridyen ${label.centerLonDeg}°E, standart enlem ${label.centerLatDeg}°, planetosentrik, doğu-pozitif`,
  window: { row0, col0, rows, cols, marginCells: MARGIN_CELLS },
  coverage: {
    description: `Yüklenen alt küme: satır ${row0}–${row1}, sütun ${col0}–${col1} (0 tabanlı). Ürünün tamamı ${label.lines}×${label.samples} hücre, enlem ${label.minLatDeg.toFixed(4)}–${label.maxLatDeg.toFixed(4)}°, boylam ${label.westLonDeg.toFixed(4)}–${label.eastLonDeg.toFixed(4)}°E.`,
    localBoundsM: { xMin: nw.x, xMax: se.x, yMin: se.y, yMax: nw.y },
    latLonBounds: { north: nwLL.latDeg, south: seLL.latDeg, west: nwLL.lonDeg, east: seLL.lonDeg },
  },
  timeCoverage: label.dataSetId + ' · ' + label.sourceProductIds,
  windowStats: { valid: nValid, noData: nNoData, invalid: nInvalid, min: nValid ? zMin : null, max: nValid ? zMax : null },
  registration: {
    checked: true,
    rasterType: label.rasterType,
    pixelRegistration: label.pixelRegistration,
    convention: 'GeoTIFF PixelIsArea: hücre merkezi = (X_ul + (col + 0.5)*scale, Y_ul - (row + 0.5)*scale); continuous col = X - 4577366.5, row = 1106617.5 - Y',
    note: 'GeoTIFF PixelIsArea hücre merkezi dönüşümü doğrulanmıştır. No-data değeri 0xFF7FFFFB tam bit deseniyle korunmuştur.',
  },
  waypointCells: wp.map((w, i) => ({
    id: w.id,
    local: w.local,
    row: wpCells[i].row,
    col: wpCells[i].col,
    rowF: wpCells[i].rowF,
    colF: wpCells[i].colF,
  })),
  routeCheck,
  transformControls,
  transformToleranceM,
};

fs.writeFileSync(path.join(outDir, 'dtm_subset.json'), JSON.stringify(meta, null, 2));

const orthoInspection = {
  file: null,
  available: false,
  decodeReason: 'Kullanıcı eski JP2 ortogörüntüyü geçersiz bildirdi; yeni doğrulanmış orto ürün pakete henüz eklenmedi. Mevcut zemin DTM’den türetilmiş gölgeli kabartmadır (orto değildir).',
};
fs.writeFileSync(path.join(outDir, 'ortho_inspection.json'), JSON.stringify(orthoInspection, null, 2));

console.log('Başarıyla tamamlandı: dtm_subset.f32 ve dtm_subset.json yazıldı.');
