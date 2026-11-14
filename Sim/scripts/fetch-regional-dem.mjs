#!/usr/bin/env node
// Stage 37A CLI: fetches a regional MOLA height window from the Mars Trek ImageServer, writes a small local grid,
// and (with --compare) measures it against the local HiRISE 1 m DTM subset.
//
//   node scripts/fetch-regional-dem.mjs --lon 77.449 --lat 18.439 --halfDeg 1.5 --out data/regional-dem
//   node scripts/fetch-regional-dem.mjs --compare --out data/regional-dem        (no network)
//
// Network: only https://trek.nasa.gov (ImageServer metadata, exportImage, identify). At most 3 requests per run,
// at least 1.1 s between requests, a 60 s timeout per request, an 8 MB body cap. The User-Agent is generic.
// Downloaded bytes are untrusted data: they are parsed by the bounds-checked trek-raster.js and never executed.
//
// Outputs (only): <out>/mola-jezero.f32 (Float32 LE, row-major, row 0 = north) and <out>/mola-jezero.json.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { parseExportedTiff } from '../public/js/geo/trek-raster.js';
import { MARS_RADIUS_M } from '../public/js/geo/trek-tiles.js';
import {
  createRegionalGrid, sampleNearest, sampleBilinear, createLocalFrame, createLocalWindow,
  compareToLocalDtm, latitudeConventionExperiment,
} from '../public/js/geo/regional-dem.js';
import { WAYPOINTS } from '../public/js/config.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(SCRIPT_DIR, '../data/regional-dem');
const DEFAULT_DTM_DIR = path.resolve(SCRIPT_DIR, '../data');

const SERVICE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/mola128_mola64_merge_90Nto90S_SimpleC_clon0/ImageServer';
const LAYER_NAME = 'mola128_mola64_merge_90Nto90S_SimpleC_clon0';
const USER_AGENT = 'marswalk-research-script';
const SOURCE_PIXEL_DEG = 0.00781224569558698; // ImageServer pixelSizeX (imageserver-mola.json)
const WKID = 104905;
const MAX_REQUESTS = 3;
const REQUEST_GAP_MS = 1100;
const TIMEOUT_MS = 60_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const IDENTIFY_LON = 77.45;
const IDENTIFY_LAT = 18.43;

function parseArgs(argv) {
  const args = { lon: 77.449, lat: 18.439, halfDeg: 1.5, out: DEFAULT_OUT, compare: false, dtmDir: DEFAULT_DTM_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${a} bir değer ister`);
      return argv[++i];
    };
    if (a === '--lon') args.lon = Number(next());
    else if (a === '--lat') args.lat = Number(next());
    else if (a === '--halfDeg') args.halfDeg = Number(next());
    else if (a === '--out') args.out = path.resolve(next());
    else if (a === '--dtm-dir') args.dtmDir = path.resolve(next());
    else if (a === '--compare') args.compare = true;
    else throw new Error(`bilinmeyen argüman: ${a}`);
  }
  if (![args.lon, args.lat, args.halfDeg].every(Number.isFinite)) throw new Error('--lon, --lat, --halfDeg sayısal olmalı');
  if (!(args.halfDeg > 0 && args.halfDeg <= 5)) throw new Error('--halfDeg 0 ile 5 arasında olmalı');
  if (Math.abs(args.lat) + args.halfDeg > 85) throw new Error('pencere kutuptan çok yakın');
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

class RequestBudget {
  constructor(max) {
    this.max = max;
    this.used = 0;
    this.log = [];
    this.lastStart = 0;
  }
  async get(name, url, expect) {
    if (this.used >= this.max) throw new Error(`istek bütçesi aşıldı (${this.max})`);
    if (this.used > 0) await sleep(Math.max(0, REQUEST_GAP_MS - (Date.now() - this.lastStart)));
    this.used++;
    this.lastStart = Date.now();
    const started = Date.now();
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error(`${name}: yanıt çok büyük (${declared} bayt)`);
    const body = Buffer.from(await res.arrayBuffer());
    const elapsedMs = Date.now() - started;
    if (body.length > MAX_BODY_BYTES) throw new Error(`${name}: gövde sınırı aşıldı`);
    const entry = {
      name, url, status: res.status, contentType: res.headers.get('content-type'), bytes: body.length,
      sha256: sha256(body), elapsedMs,
    };
    this.log.push(entry);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    if (expect === 'json' && body[0] !== 0x7b) throw new Error(`${name}: JSON bekleniyordu`);
    return { body, entry, contentType: entry.contentType };
  }
}

function exportUrl(bbox, size) {
  const q = new URLSearchParams({
    bbox: bbox.map((v) => v.toFixed(6)).join(','),
    bboxSR: String(WKID),
    imageSR: String(WKID),
    size: `${size},${size}`,
    format: 'tiff',
    pixelType: 'S16',
    interpolation: 'RSP_NearestNeighbor',
    f: 'image',
  });
  return `${SERVICE}/exportImage?${q.toString()}`;
}

function identifyUrl(lon, lat) {
  const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: WKID } });
  const q = new URLSearchParams({
    geometry, geometryType: 'esriGeometryPoint', returnGeometry: 'false', returnCatalogItems: 'false', f: 'json',
  });
  return `${SERVICE}/identify?${q.toString()}`;
}

function summaryOfValues(values, validMask) {
  let n = 0; let sum = 0; let min = Infinity; let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (!validMask[i]) continue;
    const v = values[i];
    n++; sum += v; if (v < min) min = v; if (v > max) max = v;
  }
  return { valid: n, mean: n ? sum / n : null, min: n ? min : null, max: n ? max : null };
}

async function fetchMode(args) {
  const size = Math.round((2 * args.halfDeg) / SOURCE_PIXEL_DEG);
  if (size < 2 || size > 1024 || size * size * 4 > MAX_OUTPUT_BYTES) {
    throw new Error(`piksel boyutu uygun değil: ${size} (en fazla ${MAX_OUTPUT_BYTES} bayt çıktı)`);
  }
  const bbox = [args.lon - args.halfDeg, args.lat - args.halfDeg, args.lon + args.halfDeg, args.lat + args.halfDeg];
  const budget = new RequestBudget(MAX_REQUESTS);
  const accessedAt = new Date().toISOString();
  const t0 = Date.now();

  const metaRes = await budget.get('imageserver-metadata', `${SERVICE}?f=json`, 'json');
  const meta = JSON.parse(metaRes.body.toString('utf8'));
  if (meta.pixelType !== 'S16' || meta.bandCount !== 1) throw new Error('servis S16 tek bant değil; beklenmeyen ürün');

  const exportRes = await budget.get('exportImage', exportUrl(bbox, size));
  if (exportRes.body[0] === 0x7b) throw new Error(`exportImage JSON hata döndü: ${exportRes.body.toString('utf8').slice(0, 200)}`);
  const parsed = parseExportedTiff(exportRes.body);
  if (parsed.pixelType !== 'S16') throw new Error(`beklenen S16, gelen ${parsed.pixelType}`);
  const tol = SOURCE_PIXEL_DEG * 1.01;
  const b = parsed.bounds;
  if (Math.abs(b.west - bbox[0]) > tol || Math.abs(b.south - bbox[1]) > tol
    || Math.abs(b.east - bbox[2]) > tol || Math.abs(b.north - bbox[3]) > tol) {
    throw new Error(`dönen sınırlar istenen bbox ile uyuşmuyor: ${JSON.stringify(b)}`);
  }
  const grid = createRegionalGrid(parsed);

  const idRes = await budget.get('identify', identifyUrl(IDENTIFY_LON, IDENTIFY_LAT), 'json');
  const idJson = JSON.parse(idRes.body.toString('utf8'));
  const serviceValue = Number(idJson.value);
  if (!Number.isFinite(serviceValue)) throw new Error('identify değeri sayısal değil');

  const nearest = sampleNearest(grid, IDENTIFY_LON, IDENTIFY_LAT);
  const bilinear = sampleBilinear(grid, IDENTIFY_LON, IDENTIFY_LAT);
  const sum = summaryOfValues(grid.values, grid.validMask);
  const invalidCount = grid.values.length - sum.valid;

  const f32 = Buffer.alloc(grid.values.length * 4);
  for (let i = 0; i < grid.values.length; i++) f32.writeFloatLE(grid.values[i], i * 4);
  if (f32.length > MAX_OUTPUT_BYTES) throw new Error('çıktı boyutu sınırı aşıldı');

  const resolutionM = SOURCE_PIXEL_DEG * MARS_RADIUS_M * Math.PI / 180;
  const json = {
    schema: 'marswalk.regional-dem.v1',
    product: {
      serviceDescription: meta.serviceDescription ?? LAYER_NAME,
      layer: LAYER_NAME,
      serviceUrl: SERVICE,
      serviceCrsWkid: WKID,
      nativePixelDeg: meta.pixelSizeX ?? SOURCE_PIXEL_DEG,
      nominalPixelM: Math.round(resolutionM),
      serviceCopyrightText: meta.copyrightText ?? '',
    },
    attribution: `NASA Mars Trek / MOLA (${meta.serviceDescription ?? LAYER_NAME})`,
    license: 'belirtilmemiş',
    status: 'needs_review',
    accessedAt,
    request: {
      userAgent: USER_AGENT,
      requestCount: budget.log.length,
      minGapMs: REQUEST_GAP_MS,
      totalElapsedMs: Date.now() - t0,
      totalBytes: budget.log.reduce((s, e) => s + e.bytes, 0),
      urlTemplates: {
        metadata: `${SERVICE}?f=json`,
        exportImage: `${SERVICE}/exportImage?bbox={west},{south},{east},{north}&bboxSR=104905&imageSR=104905&size={n},{n}&format=tiff&pixelType=S16&interpolation=RSP_NearestNeighbor&f=image`,
        identify: `${SERVICE}/identify?geometry={x,y,wkid:104905}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`,
      },
      log: budget.log,
    },
    exportParams: { bbox: bbox.map((v) => Number(v.toFixed(6))), bboxSR: WKID, imageSR: WKID, size: [size, size], pixelType: 'S16' },
    rawResponse: {
      sha256: budget.log[1].sha256,
      bytes: exportRes.body.length,
      contentType: exportRes.contentType,
      headerHex: exportRes.body.subarray(0, 16).toString('hex'),
      byteOrder: parsed.meta.byteOrder,
      width: parsed.width,
      height: parsed.height,
      bitsPerSample: parsed.meta.bitsPerSample,
      stripCount: parsed.meta.stripCount,
      rasterType: parsed.meta.rasterType,
      tiepoint: parsed.meta.tiepoint,
      geo: parsed.meta.geo,
    },
    noData: {
      declaredInTiff: parsed.noDataDeclared,
      noDataText: parsed.noDataText,
      policy: 'GDAL_NODATA etiketi yok; hiçbir değer no-data sayılmadı, sıfır 0 olarak bırakıldı. Sayaçlar aşağıda.',
      counts: parsed.meta.counts,
    },
    grid: {
      file: 'mola-jezero.f32',
      encoding: 'float32 little-endian, satır-majör, row 0 = kuzey',
      width: grid.width,
      height: grid.height,
      pixelSizeDeg: grid.pixelSizeDeg,
      bounds: grid.bounds,
      cellConvention: parsed.meta.cellConvention,
      byteLength: f32.length,
      validCount: sum.valid,
      invalidCount,
      valueStats: { min: sum.min, max: sum.max, mean: sum.mean },
    },
    datum: {
      status: 'needs_review',
      declaredInTiff: {
        geographicType: parsed.meta.geo.geographicType,
        semiMajorAxisM: parsed.meta.geo.semiMajorAxisM,
        inverseFlattening: parsed.meta.geo.inverseFlattening,
        geoText: parsed.meta.geo.geoText,
      },
      note: 'GeoTIFF elipsoid tanımlıyor (a, 1/f). Izgara enleminin küre (planetosentrik) mi jeodetik mi olduğu yerel DTM ile ölçülmeden doğrulanmadı; compare modu bunu ölçer.',
    },
    identifyCheck: {
      lonDeg: IDENTIFY_LON,
      latDeg: IDENTIFY_LAT,
      serviceValue,
      serviceRaw: idJson,
      nearestValue: nearest.status === 'ok' ? nearest.value : null,
      nearestStatus: nearest.status,
      nearestCell: { row: nearest.row, col: nearest.col },
      bilinearValue: bilinear,
      differenceNearestMinusServiceM: nearest.status === 'ok' ? nearest.value - serviceValue : null,
    },
    notes: [
      'Bölgesel bağlam, ~463 m/piksel; yürünebilirlik puanı üretilmez.',
      'Düşey datum ve enlem konvansiyonu doğrulanmadı (status needs_review).',
      'Ham TIFF dosyası kaydedilmedi; yalnız sha256 ve başlık özeti.',
    ],
    generatedBy: 'Sim/scripts/fetch-regional-dem.mjs',
  };

  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'mola-jezero.f32'), f32);
  fs.writeFileSync(path.join(args.out, 'mola-jezero.json'), `${JSON.stringify(json, null, 2)}\n`);
  return { json, outDir: args.out };
}

function readDtmWindow(dtmDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dtmDir, 'dtm_subset.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(dtmDir, 'dtm_subset.f32'));
  const rows = meta.window.rows;
  const cols = meta.window.cols;
  if (buf.length !== rows * cols * 4) throw new Error(`dtm_subset.f32 boyutu beklenenle uyuşmuyor (${buf.length})`);
  const values = new Float32Array(rows * cols);
  for (let i = 0; i < values.length; i++) values[i] = buf.readFloatLE(i * 4);
  const hex = meta.label.missingConstantHex;
  const ndv = Buffer.from(hex, 'hex').readFloatBE(0);
  const lb = meta.coverage.localBoundsM;
  return { meta, window: createLocalWindow({ width: cols, height: rows, values, xMinM: lb.xMin, yMaxM: lb.yMax, cellM: meta.label.mapScaleM, noDataValue: ndv }) };
}

function compareMode(args) {
  const json = JSON.parse(fs.readFileSync(path.join(args.out, 'mola-jezero.json'), 'utf8'));
  const f32 = fs.readFileSync(path.join(args.out, 'mola-jezero.f32'));
  const n = json.grid.width * json.grid.height;
  if (f32.length !== n * 4) throw new Error('mola-jezero.f32 boyutu json ile uyuşmuyor');
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = f32.readFloatLE(i * 4);
  const grid = createRegionalGrid({
    width: json.grid.width,
    height: json.grid.height,
    values,
    validMask: new Uint8Array(n).fill(1),
    bounds: json.grid.bounds,
    pixelSizeDeg: json.grid.pixelSizeDeg,
  });
  const { meta: dtmMeta, window: dtm } = readDtmWindow(args.dtmDir);
  const wb1 = WAYPOINTS[0];
  const frame = createLocalFrame({ originLatDeg: wb1.latDeg, originLonDeg: wb1.lonDeg });
  const invFlattening = json.datum.declaredInTiff.inverseFlattening;
  const experiment = latitudeConventionExperiment({ regionalGrid: grid, localDtm: dtm, frame, invFlattening });
  const h1Only = compareToLocalDtm({ regionalGrid: grid, localDtm: dtm, frame });
  return {
    dtm: { file: 'dtm_subset.f32', window: dtmMeta.window, extent: dtm.extent, verticalDatumVerified: dtmMeta.label.verticalDatumVerified },
    frameOrigin: { id: wb1.id, latDeg: wb1.latDeg, lonDeg: wb1.lonDeg },
    h1Only,
    experiment,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.compare) {
    const result = compareMode(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const { json, outDir } = await fetchMode(args);
  const summary = {
    outDir,
    f32Bytes: json.grid.byteLength,
    size: `${json.grid.width}x${json.grid.height}`,
    pixelSizeDeg: json.grid.pixelSizeDeg,
    valueRange: json.grid.valueStats,
    validCount: json.grid.validCount,
    invalidCount: json.grid.invalidCount,
    requestCount: json.request.requestCount,
    totalElapsedMs: json.request.totalElapsedMs,
    totalBytes: json.request.totalBytes,
    identifyCheck: { serviceValue: json.identifyCheck.serviceValue, nearestValue: json.identifyCheck.nearestValue, differenceM: json.identifyCheck.differenceNearestMinusServiceM },
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch-regional-dem: ${err.message}\n`);
  process.exitCode = 1;
});
