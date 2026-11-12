// Prepares a read-only window of the local HiRISE DTM for the browser app and inspects the ortho JP2 header.
// Usage:  node scripts/extract-dtm.mjs [path/to/DTM.IMG] [path/to/ORTHO.JP2]
// Inputs are opened read-only ('r'). Outputs go to Sim/data/ only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterFromLabel, pointToSegment } from '../public/js/geo/geo.js';
import { GridElevationLayer, makeDescriptor, STATUS } from '../public/js/surface/layers.js';
import { WAYPOINTS, MAP_FRAME } from '../public/js/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const simRoot = path.resolve(here, '..');
const dtmPath = path.resolve(process.argv[2] ?? path.join(simRoot, '..', 'DTEEC_045994_1985_046060_1985_U01.IMG'));
const jp2Path = path.resolve(process.argv[3] ?? path.join(simRoot, '..', 'ESP_046060_1985_RED_C_01_ORTHO.JP2'));
const outDir = path.join(simRoot, 'data');
const MARGIN_CELLS = 500; // window margin around the route bounding box

// ---------------------------------------------------------------- PDS3 label
function readPdsLabel(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(65536);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    const text = head.toString('latin1', 0, n);
    const end = text.search(/\r?\nEND\s*\r?\n/);
    if (!text.startsWith('PDS_VERSION_ID') || end < 0) throw new Error('PDS3 etiketi bulunamadı');
    const lines = text.slice(0, end).replace(/\/\*.*?\*\//g, '').split(/\r?\n/);
    const kv = {}; const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*([\^A-Z0-9_:]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let [, key, val] = m;
      if (val.startsWith('"') && !/"\s*$/.test(val.slice(1))) { // multi-line quoted string
        while (i + 1 < lines.length && !/"\s*$/.test(val)) val += ' ' + lines[++i].trim();
      }
      if (key === 'OBJECT') { stack.push(val.trim()); continue; }
      if (key === 'END_OBJECT') { stack.pop(); continue; }
      kv[[...stack, key].join('.')] = val.trim();
    }
    return kv;
  } finally { fs.closeSync(fd); }
}
const num = (s) => { if (s == null) return NaN; return parseFloat(String(s).replace(/<.*?>/g, '').trim()); };
const str = (s) => (s == null ? null : String(s).replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim());
const hexConst = (s) => { const m = String(s ?? '').match(/16#([0-9A-F]+)#/i); return m ? m[1].toUpperCase() : null; };

// ---------------------------------------------------------------- JP2 / GeoJP2 header
const GEOJP2_UUID = 'b14bf8bd083d4b43a5ae8cd7d5a6ce03';
function inspectJp2(file) {
  const out = { file: path.basename(file), readable: false };
  if (!fs.existsSync(file)) { out.error = 'Dosya bulunamadı'; return out; }
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    let off = 0;
    while (off < size) {
      const h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, off);
      let len = h.readUInt32BE(0); const type = h.toString('latin1', 4, 8); let hl = 8;
      if (len === 1) { len = Number(h.readBigUInt64BE(8)); hl = 16; }
      if (len === 0) len = size - off;
      if (type === 'jp2h' || type === 'uuid') {
        const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off);
        if (type === 'jp2h') {
          const i = b.indexOf('ihdr', 0, 'latin1');
          if (i > 0) { out.height = b.readUInt32BE(i + 4); out.width = b.readUInt32BE(i + 8); out.components = b.readUInt16BE(i + 12); out.bitsPerComponent = (b[i + 14] & 0x7f) + 1; }
        } else if (b.subarray(hl, hl + 16).toString('hex') === GEOJP2_UUID) {
          out.geotiff = parseGeoTiff(b.subarray(hl + 16));
        }
      }
      off += len;
    }
    out.readable = true;
  } catch (e) { out.error = e.message; } finally { fs.closeSync(fd); }
  return out;
}
function parseGeoTiff(b) {
  const le = b.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const f64 = (o) => (le ? b.readDoubleLE(o) : b.readDoubleBE(o));
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };
  const ifd = u32(4); const n = u16(ifd); const tags = {};
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12; const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    const vo = (sizes[type] ?? 1) * cnt <= 4 ? e + 8 : u32(e + 8);
    const v = [];
    for (let j = 0; j < cnt; j++) {
      if (type === 3) v.push(u16(vo + 2 * j)); else if (type === 4) v.push(u32(vo + 4 * j));
      else if (type === 12) v.push(f64(vo + 8 * j)); else if (type === 2) { v.push(b.toString('latin1', vo, vo + cnt).replace(/\0/g, '')); break; }
    }
    tags[tag] = v;
  }
  const geoKeys = {}; const dir = tags[34735] ?? [];
  for (let k = 4; k + 3 < dir.length; k += 4) {
    const [id, loc, count, idx] = dir.slice(k, k + 4);
    geoKeys[id] = loc === 0 ? idx : loc === 34736 ? (tags[34736] ?? []).slice(idx, idx + count) : loc === 34737 ? String(tags[34737]?.[0] ?? '').slice(idx, idx + count) : null;
  }
  const one = (x) => (Array.isArray(x) ? x[0] : x);
  return {
    pixelScale: tags[33550] ?? null,
    tiePoint: tags[33922] ?? null,
    rasterType: geoKeys[1025] === 1 ? 'PixelIsArea' : geoKeys[1025] === 2 ? 'PixelIsPoint' : null,
    citation: geoKeys[1026] ?? null,
    projCoordTrans: geoKeys[3075] ?? null, // 17 = Equirectangular
    linearUnits: geoKeys[3076] ?? null, // 9001 = metre
    // 3088 = ProjCenterLongGeoKey, 3089 = ProjCenterLatGeoKey (GDAL writes Equirectangular lat_ts here).
    centerLong: one(geoKeys[3088]), stdParallel1: one(geoKeys[3089]),
    falseEasting: one(geoKeys[3082]), falseNorthing: one(geoKeys[3083]),
    semiMajor: one(geoKeys[2057]), semiMinor: one(geoKeys[2058]),
  };
}

// ---------------------------------------------------------------- main
const kv = readPdsLabel(dtmPath);
const label = {
  productId: str(kv.PRODUCT_ID), productVersionId: str(kv.PRODUCT_VERSION_ID), dataSetId: str(kv.DATA_SET_ID),
  sourceProductIds: str(kv.SOURCE_PRODUCT_ID), producer: str(kv.PRODUCER_FULL_NAME),
  recordBytes: num(kv.RECORD_BYTES), imagePointer: num(kv['^IMAGE']),
  lines: num(kv['IMAGE.LINES']), samples: num(kv['IMAGE.LINE_SAMPLES']), bands: num(kv['IMAGE.BANDS']),
  sampleBits: num(kv['IMAGE.SAMPLE_BITS']), sampleType: str(kv['IMAGE.SAMPLE_TYPE']),
  offset: num(kv['IMAGE.OFFSET']), scalingFactor: num(kv['IMAGE.SCALING_FACTOR']),
  missingConstantHex: hexConst(kv['IMAGE.MISSING_CONSTANT']),
  validMin: num(kv['IMAGE.VALID_MINIMUM']), validMax: num(kv['IMAGE.VALID_MAXIMUM']),
  note: str(kv['IMAGE.NOTE']),
  projectionType: str(kv['IMAGE_MAP_PROJECTION.MAP_PROJECTION_TYPE']),
  latitudeType: str(kv['IMAGE_MAP_PROJECTION.PROJECTION_LATITUDE_TYPE']),
  positiveLongitude: str(kv['IMAGE_MAP_PROJECTION.POSITIVE_LONGITUDE_DIRECTION']),
  radiusKm: num(kv['IMAGE_MAP_PROJECTION.A_AXIS_RADIUS']),
  centerLatDeg: num(kv['IMAGE_MAP_PROJECTION.CENTER_LATITUDE']),
  centerLonDeg: num(kv['IMAGE_MAP_PROJECTION.CENTER_LONGITUDE']),
  rotationDeg: num(kv['IMAGE_MAP_PROJECTION.MAP_PROJECTION_ROTATION']),
  mapScaleM: num(kv['IMAGE_MAP_PROJECTION.MAP_SCALE']),
  lineProjectionOffset: num(kv['IMAGE_MAP_PROJECTION.LINE_PROJECTION_OFFSET']),
  sampleProjectionOffset: num(kv['IMAGE_MAP_PROJECTION.SAMPLE_PROJECTION_OFFSET']),
  minLatDeg: num(kv['IMAGE_MAP_PROJECTION.MINIMUM_LATITUDE']), maxLatDeg: num(kv['IMAGE_MAP_PROJECTION.MAXIMUM_LATITUDE']),
  westLonDeg: num(kv['IMAGE_MAP_PROJECTION.WESTERNMOST_LONGITUDE']), eastLonDeg: num(kv['IMAGE_MAP_PROJECTION.EASTERNMOST_LONGITUDE']),
};

const problems = [];
if (label.sampleType !== 'PC_REAL' || label.sampleBits !== 32 || label.bands !== 1) problems.push('örnek türü PC_REAL/32-bit/1 bant değil');
if (label.recordBytes !== label.samples * 4) problems.push('RECORD_BYTES ≠ LINE_SAMPLES×4');
if (label.offset !== 0 || label.scalingFactor !== 1) problems.push('OFFSET/SCALING_FACTOR 0/1 değil');
if (label.projectionType !== 'EQUIRECTANGULAR' || label.rotationDeg !== 0) problems.push('projeksiyon equirectangular/0° değil');
if (label.latitudeType !== 'PLANETOCENTRIC' || label.positiveLongitude !== 'EAST') problems.push('enlem/boylam türü beklenen değil');
if (!label.missingConstantHex) problems.push('MISSING_CONSTANT okunamadı');
if (problems.length) { console.error('DTM etiketi doğrulanamadı:', problems.join('; ')); process.exit(1); }

const adapter = adapterFromLabel(label, WAYPOINTS[0]);
const wp = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
const wpCells = wp.map((w) => adapter.localToCell(w.local.x, w.local.y));

const rMin = Math.min(...wpCells.map((c) => c.row)), rMax = Math.max(...wpCells.map((c) => c.row));
const cMin = Math.min(...wpCells.map((c) => c.col)), cMax = Math.max(...wpCells.map((c) => c.col));
const row0 = Math.max(0, rMin - MARGIN_CELLS), row1 = Math.min(label.lines - 1, rMax + MARGIN_CELLS);
const col0 = Math.max(0, cMin - MARGIN_CELLS), col1 = Math.min(label.samples - 1, cMax + MARGIN_CELLS);
const rows = row1 - row0 + 1, cols = col1 - col0 + 1;

const imageStart = (label.imagePointer - 1) * label.recordBytes;
const out = Buffer.alloc(rows * cols * 4);
const fd = fs.openSync(dtmPath, 'r');
try {
  for (let r = 0; r < rows; r++) {
    const pos = imageStart + (row0 + r) * label.recordBytes + col0 * 4;
    const got = fs.readSync(fd, out, r * cols * 4, cols * 4, pos);
    if (got !== cols * 4) throw new Error(`Kısa okuma, satır ${row0 + r}`);
  }
} finally { fs.closeSync(fd); }

// Normalise to little-endian float32 (PC_REAL is already little-endian; this keeps bit patterns intact).
const values = new Float32Array(rows * cols);
const bits = new Uint32Array(values.buffer);
for (let i = 0; i < values.length; i++) bits[i] = out.readUInt32LE(i * 4);

const noDataBits = parseInt(label.missingConstantHex, 16) >>> 0;
let nValid = 0, nNoData = 0, nInvalid = 0, zMin = Infinity, zMax = -Infinity;
for (let i = 0; i < values.length; i++) {
  if (bits[i] === noDataBits) { nNoData++; continue; }
  const v = values[i];
  if (!Number.isFinite(v) || v < label.validMin || v > label.validMax) { nInvalid++; continue; }
  nValid++; if (v < zMin) zMin = v; if (v > zMax) zMax = v;
}

// Window coverage in local metres (cell edges) and lat/lon.
const nw = adapter.pixelToLocal(row0 - 0.5, col0 - 0.5), se = adapter.pixelToLocal(row1 + 0.5, col1 + 0.5);
const nwLL = adapter.localToLatLon(nw.x, nw.y), seLL = adapter.localToLatLon(se.x, se.y);

// ---------------------------------------------------------------- JP2 registration check
const jp2 = inspectJp2(jp2Path);
let registration = { checked: false, note: 'Ortho JP2 GeoTIFF bilgisi okunamadı; hizalama yalnız DTM etiketine dayanıyor.' };
if (jp2.geotiff?.tiePoint && jp2.geotiff?.pixelScale) {
  const g = jp2.geotiff; const s = label.mapScaleM;
  const [, , , tx, ty] = g.tiePoint; const [sx, sy] = g.pixelScale;
  const area = g.rasterType === 'PixelIsArea';
  const jp2CenterX0 = tx + (area ? 0.5 * sx : 0), jp2CenterY0 = ty - (area ? 0.5 * sy : 0);
  const pdsC0 = adapter.grid.pixelToProjected(0, 0);
  const dColPx = (jp2CenterX0 - pdsC0.X) / s, dRowPx = (pdsC0.Y - jp2CenterY0) / s;
  const sameDims = jp2.width === label.samples && jp2.height === label.lines;
  const sameCrs = Math.abs(g.stdParallel1 - label.centerLatDeg) < 1e-9 && Math.abs(g.centerLong - label.centerLonDeg) < 1e-9 &&
    Math.abs(g.semiMajor - label.radiusKm * 1000) < 1e-3 && g.projCoordTrans === 17 && g.linearUnits === 9001 &&
    Math.abs(sx - s) < 1e-9 && Math.abs(sy - s) < 1e-9;
  registration = {
    checked: true, sameDims, sameCrs, jp2RasterType: g.rasterType,
    pdsConvention: 'PDS3: 1 tabanlı LINE/SAMPLE piksel merkezi; X=(SAMPLE−SAMPLE_PROJECTION_OFFSET)·MAP_SCALE, Y=(LINE_PROJECTION_OFFSET−LINE)·MAP_SCALE',
    jp2MinusPdsCenterOffsetPx: { col: +dColPx.toFixed(6), row: +dRowPx.toFixed(6) },
    note: `Aynı boyut ve CRS: ${sameDims && sameCrs ? 'evet' : 'HAYIR'}. JP2 GeoTIFF (${g.rasterType}) ile DTM PDS etiketi arasında ` +
      `piksel merkezinde ${dColPx.toFixed(3)} sütun / ${dRowPx.toFixed(3)} satır fark var (≈${(Math.hypot(dColPx, dRowPx) * s).toFixed(2)} m). ` +
      'Uygulama örneklenen katman olan DTM’nin PDS etiketini esas alır; bu yarım piksellik belirsizlik konum/kot gösteriminde belirtilir.',
  };
}
const orthoInspection = {
  file: jp2.file, width: jp2.width ?? null, height: jp2.height ?? null, components: jp2.components ?? null,
  bitsPerComponent: jp2.bitsPerComponent ?? null, geotiff: jp2.geotiff ?? null,
  crsText: jp2.geotiff ? `Equirectangular (GeoJP2), std. paralel (ProjCenterLat) ${jp2.geotiff.stdParallel1}°, merkez boylam ${jp2.geotiff.centerLong}°, R=${jp2.geotiff.semiMajor} m` : null,
  pixelScaleM: jp2.geotiff?.pixelScale?.[0] ?? null, registration,
  decodeReason: jp2.readable
    ? 'Ortogörüntü kullanılamıyor: JP2 başlığı/GeoTIFF okundu, ancak bu bağımlılıksız yığında JPEG 2000 piksel kod çözücü yok (tarayıcılar JP2 göstermiyor, Node/Python ortamında OpenJPEG/GDAL/Pillow kurulu değil). Harita zemini DTM’den türetilmiştir.'
    : `Ortogörüntü kullanılamıyor: ${jp2.error ?? 'dosya okunamadı'}`,
};

// ---------------------------------------------------------------- route validation (same sampling the app uses)
const descriptor = makeDescriptor({ product: label.productId, unit: 'm', verticalDatum: 'Mars 2000' });
const layer = new GridElevationLayer({ descriptor, adapter, values, rows, cols, rowOffset: row0, colOffset: col0, noDataBits, validMin: label.validMin, validMax: label.validMax });
const A = wp[0].local, B = wp[1].local; const seg = pointToSegment(0, 0, A.x, A.y, B.x, B.y);
const N = 681; const zs = []; const slopes = []; let nonOk = 0;
for (let k = 0; k < N; k++) {
  const t = k / (N - 1); const x = A.x + t * (B.x - A.x), y = A.y + t * (B.y - A.y);
  const e = layer.sampleElevation(x, y); const s = layer.sampleSlope(x, y);
  if (e.status === STATUS.OK) zs.push(e.value); else nonOk++;
  if (s.status === STATUS.OK) slopes.push(s.value);
}
const sorted = [...slopes].sort((a, b) => a - b);
const routeCheck = {
  lengthM: +seg.length.toFixed(3), samples: N, nonOkElevationSamples: nonOk, slopeSamples: slopes.length,
  elevMin: +Math.min(...zs).toFixed(3), elevMax: +Math.max(...zs).toFixed(3),
  elevStart: +zs[0].toFixed(3), elevEnd: +zs[zs.length - 1].toFixed(3),
  slopeMeanDeg: +(slopes.reduce((a, b) => a + b, 0) / slopes.length).toFixed(3),
  slopeP90Deg: +sorted[Math.floor(0.9 * (sorted.length - 1))].toFixed(3), slopeMaxDeg: +sorted[sorted.length - 1].toFixed(3),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'dtm_subset.f32'), Buffer.from(values.buffer));
const st = fs.statSync(dtmPath);
const meta = {
  generatedBy: 'scripts/extract-dtm.mjs', generatedAt: new Date().toISOString(),
  sourceFile: { name: path.basename(dtmPath), bytes: st.size, modified: st.mtime.toISOString() },
  dataFile: 'dtm_subset.f32', dataEncoding: 'float32 little-endian, satır öncelikli, no-data bit deseni korunmuş',
  label,
  frameMatchesConfig: Object.keys(MAP_FRAME).every((k) => Math.abs(MAP_FRAME[k] - label[k]) <= 1e-9 * Math.max(1, Math.abs(label[k]))),
  crsText: `Equirectangular, küre R=${label.radiusKm} km (merkez enlemdeki yerel yarıçap), merkez meridyen ${label.centerLonDeg}°E, standart enlem ${label.centerLatDeg}°, planetosentrik, doğu-pozitif`,
  window: { row0, col0, rows, cols, marginCells: MARGIN_CELLS },
  coverage: {
    description: `Yüklenen alt küme: satır ${row0}–${row1}, sütun ${col0}–${col1} (0 tabanlı). Ürünün tamamı ${label.lines}×${label.samples} hücre, enlem ${label.minLatDeg.toFixed(4)}–${label.maxLatDeg.toFixed(4)}°, boylam ${label.westLonDeg.toFixed(4)}–${label.eastLonDeg.toFixed(4)}°E.`,
    localBoundsM: { xMin: nw.x, xMax: se.x, yMin: se.y, yMax: nw.y },
    latLonBounds: { north: nwLL.latDeg, south: seLL.latDeg, west: nwLL.lonDeg, east: seLL.lonDeg },
  },
  timeCoverage: `Stereo kaynak gözlemleri ${label.sourceProductIds}; edinim tarihleri bu PDS etiketinde yok.`,
  windowStats: { valid: nValid, noData: nNoData, invalid: nInvalid, min: nValid ? zMin : null, max: nValid ? zMax : null },
  registration,
  waypointCells: wp.map((w, i) => ({ id: w.id, local: w.local, row: wpCells[i].row, col: wpCells[i].col, rowF: wpCells[i].rowF, colF: wpCells[i].colF })),
  routeCheck,
};
fs.writeFileSync(path.join(outDir, 'dtm_subset.json'), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(outDir, 'ortho_inspection.json'), JSON.stringify(orthoInspection, null, 2));

console.log('DTM:', label.productId, `${label.lines}×${label.samples}`, `${label.mapScaleM} m/px`);
console.log('Pencere:', { row0, col0, rows, cols }, 'MB:', (out.length / 1e6).toFixed(1));
console.log('Pencere istatistiği:', meta.windowStats);
console.log('Waypoint hücreleri:', meta.waypointCells.map((w) => `${w.id} r=${w.row} c=${w.col} (x=${w.local.x.toFixed(2)}, y=${w.local.y.toFixed(2)})`).join(' | '));
console.log('Rota kontrolü:', routeCheck);
console.log('Hizalama:', registration.note);
console.log('Config çerçevesi etiketle aynı:', meta.frameMatchesConfig);
