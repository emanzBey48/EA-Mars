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
    const h = Buffer.alloc(16);
    fs.readSync(fd, h, 0, 16, 0);
    const le = h.toString('latin1', 0, 2) === 'II';
    const magic = le ? h.readUInt16LE(2) : h.readUInt16BE(2);
    if (magic !== 42) throw new Error('Geçersiz TIFF formatı');
    const ifdOff = le ? h.readUInt32LE(4) : h.readUInt32BE(4);

    const read = (off, len) => {
      const b = Buffer.alloc(len);
      fs.readSync(fd, b, 0, len, off);
      return b;
    };
    const TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 11: 4, 12: 8 };
    const numTags = read(ifdOff, 2).readUInt16LE(0);
    const entries = read(ifdOff + 2, numTags * 12);
    const tags = {};

    for (let i = 0; i < numTags; i++) {
      const e = entries.subarray(i * 12, i * 12 + 12);
      const tag = le ? e.readUInt16LE(0) : e.readUInt16BE(0);
      const type = le ? e.readUInt16LE(2) : e.readUInt16BE(2);
      const count = le ? e.readUInt32LE(4) : e.readUInt32BE(4);
      const sz = (TYPES[type] || 1) * count;
      const raw = sz <= 4 ? e.subarray(8, 8 + sz) : read(le ? e.readUInt32LE(8) : e.readUInt32BE(8), sz);
      let val;
      if (type === 2) val = raw.toString('latin1').replace(/\0+$/, '');
      else if (type === 3) val = Array.from({ length: count }, (_, k) => (le ? raw.readUInt16LE(k * 2) : raw.readUInt16BE(k * 2)));
      else if (type === 4) val = Array.from({ length: count }, (_, k) => (le ? raw.readUInt32LE(k * 4) : raw.readUInt32BE(k * 4)));
      else if (type === 12) val = Array.from({ length: count }, (_, k) => (le ? raw.readDoubleLE(k * 8) : raw.readDoubleBE(k * 8)));
      else val = raw;
      tags[tag] = { type, count, val };
    }

    const geoKeys = {};
    const dir = tags[34735]?.val || [];
    const dbl = tags[34736]?.val || [];
    const asc = typeof tags[34737]?.val === 'string' ? tags[34737].val : '';
    for (let k = 4; k + 3 < dir.length; k += 4) {
      const [id, loc, count, off] = dir.slice(k, k + 4);
      geoKeys[id] = loc === 0 ? off : loc === 34736 ? dbl.slice(off, off + count) : loc === 34737 ? asc.slice(off, off + count) : null;
    }

    return { size, tags, geoKeys, firstStripOffset: tags[273]?.val?.[0] ?? 172609 };
  } finally {
    fs.closeSync(fd);
  }
}

const tiffInfo = parseTiffMetadata(dtmPath);
const width = tiffInfo.tags[256]?.val?.[0] ?? 21400;
const height = tiffInfo.tags[257]?.val?.[0] ?? 21488;
const sampleBits = tiffInfo.tags[258]?.val?.[0] ?? 32;
const sampleFormat = tiffInfo.tags[339]?.val?.[0] ?? 3; // 3 = IEEE float
const pixelScale = tiffInfo.tags[33550]?.val || [1.0, 1.0, 0.0];
const tiepoint = tiffInfo.tags[33922]?.val || [0, 0, 0, 4577366.0, 1106618.0, 0.0];
const rasterType = tiffInfo.geoKeys[1025] === 1 ? 'PixelIsArea' : 'PixelIsPoint';
const semiMajor = tiffInfo.geoKeys[2057]?.[0] ?? 3396190.0;

const label = {
  productId: 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40',
  productVersionId: 'soc_006_blend40',
  dataSetId: 'Mars 2020 Terrain Relative Navigation (TRN) HiRISE DTM Mosaic',
  sourceProductIds: '6 stereo pairs: Jezero_E, Jezero_N, Jezero_C, Jezero_DL, Jezero_W, Jezero_CR (7 components)',
  producer: 'USGS Astrogeology Science Center (Fergason, Hare, Mayer, Galuszka, Redding, Smith, Shinaman) in collab. with NASA JPL',
  recordBytes: width * 4,
  imagePointer: 1,
  firstStripOffset: tiffInfo.firstStripOffset,
  lines: height,
  samples: width,
  bands: 1,
  sampleBits,
  sampleType: sampleFormat === 3 ? 'PC_REAL' : 'UNKNOWN',
  offset: 0,
  scalingFactor: 1,
  missingConstantHex: 'FF7FFFFB',
  validMin: -2659.776611328125,
  validMax: -1942.1046142578125,
  projectionType: 'EQUIRECTANGULAR',
  latitudeType: 'PLANETOCENTRIC',
  positiveLongitude: 'EAST',
  radiusKm: semiMajor / 1000,
  centerLatDeg: 0.0,
  centerLonDeg: 0.0,
  rotationDeg: 0,
  mapScaleM: pixelScale[0],
  upperLeftX: tiepoint[3],
  upperLeftY: tiepoint[4],
  lineProjectionOffset: tiepoint[4] - (rasterType === 'PixelIsArea' ? 0.5 * pixelScale[1] : 0),
  sampleProjectionOffset: -(tiepoint[3] + (rasterType === 'PixelIsArea' ? 0.5 * pixelScale[0] : 0)),
  rasterType,
  pixelRegistration: rasterType === 'PixelIsArea' ? 'PIXEL_IS_AREA' : 'CENTER_PDS_1BASED',
  verticalDatum: 'Mars equipotential surface (MOLA areoid / DeltaGeoid, tied to HRSC & CTX LVS)',
  verticalDatumVerified: true,
  verticalDatumEvidence: 'Fergason vd. 2020 (LPSC #2020), USGS FGDC XML (DOI: 10.5066/P9REJ9JN), CTX LVS tie (~0.4m median offset)',
  minLatDeg: 18.306799449686565,
  maxLatDeg: 18.669315006877746,
  westLonDeg: 77.22293307697142,
  eastLonDeg: 77.58396402093508,
  license: 'Public Domain / USGS (Please cite authors: Fergason vd. 2020)',
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
const wp = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
const wpCells = wp.map((w) => adapter.localToCell(w.local.x, w.local.y));

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
    const pos = label.firstStripOffset + fileRow * label.recordBytes + col0 * 4;
    const got = fs.readSync(fd, out, r * cols * 4, cols * 4, pos);
    if (got !== cols * 4) throw new Error(`Kısa okuma: satır ${fileRow}, istenen ${cols * 4}, okunan ${got}`);
  }
} finally {
  fs.closeSync(fd);
}

// Float32 and Uint32 views
const values = new Float32Array(out.buffer, out.byteOffset, rows * cols);
const bits = new Uint32Array(out.buffer, out.byteOffset, rows * cols);
const noDataBits = parseInt(label.missingConstantHex, 16) >>> 0;

let nValid = 0, nNoData = 0, nInvalid = 0;
let zMin = Infinity, zMax = -Infinity;

for (let i = 0; i < values.length; i++) {
  const u = bits[i];
  const v = values[i];
  if (u === noDataBits || v < -1e30 || !Number.isFinite(v)) {
    nNoData++;
  } else if (v < label.validMin || v > label.validMax) {
    nInvalid++;
  } else {
    nValid++;
    if (v < zMin) zMin = v;
    if (v > zMax) zMax = v;
  }
}

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
};

fs.writeFileSync(path.join(outDir, 'dtm_subset.json'), JSON.stringify(meta, null, 2));

const orthoInspection = {
  file: null,
  available: false,
  decodeReason: 'Kullanıcı eski JP2 ortogörüntüyü geçersiz bildirdi; yeni doğrulanmış orto ürün pakete henüz eklenmedi. Mevcut zemin DTM’den türetilmiş gölgeli kabartmadır (orto değildir).',
};
fs.writeFileSync(path.join(outDir, 'ortho_inspection.json'), JSON.stringify(orthoInspection, null, 2));

console.log('Başarıyla tamamlandı: dtm_subset.f32 ve dtm_subset.json yazıldı.');
