// Stage 29B — sentetik no-data test fixture'ı. SENTETİK TEST VERİSİDİR; gerçek bir DTM, NASA/USGS ürünü veya
// CRS/datum iddiası DEĞİLDİR. Yalnız no-data kapsam testleri (test/nodata-route.test.mjs) ve yerel elle inceleme içindir.
//
// Deterministik: aynı kod her çalıştırmada bayt-bayt aynı .f32 ve .json üretir (ham Float32 değerleri Math.fround ile
// yazılır; rastgelelik yoktur).
//
// Kullanım:  node scripts/make-nodata-fixture.mjs [--out <dizin>]
//   varsayılan çıktı: Sim/data/nodata-fixture (bu betiğin bulunduğu Sim klasörüne göre)
//   üretilen dosyalar: nodata-fixture.f32 (Float32 little-endian, row-major, row 0 = kuzey) + nodata-fixture.json
//
// Testler bu modülden `buildNoDataFixture()` import eder; diske bağımlı değildir.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NODATA_FIXTURE_SCHEMA = 'marswalk.nodata-fixture.v1';
export const NODATA_FIXTURE_LABEL = 'SENTETİK TEST VERİSİ — gerçek veri değildir (no-data kapsam testleri için).';
export const NODATA_FIXTURE_FILE_BASENAME = 'nodata-fixture';

/** Gerçek ürünle uyumlu no-data sentinel'i: Float32 bit deseni 0xFF7FFFFB. */
export const NODATA_VALUE = -3.4028226550889045e38;
export const NODATA_BITS = 0xFF7FFFFB;

export const FIXTURE_ROWS = 200;
export const FIXTURE_COLS = 240;
export const FIXTURE_CELL_SIZE_M = 1;
/** Pencerenin kuzey-batı köşesi (yerel metre). Hücre (r,c) merkezi: x = NW_X + (c+0.5), y = NW_Y - (r+0.5). */
export const FIXTURE_NW_X_M = -120;
export const FIXTURE_NW_Y_M = 100;
export const FIXTURE_VALID_MIN = -2700;
export const FIXTURE_VALID_MAX = -2300;

// Tüm koordinatlar kapsayıcı (inclusive) HÜCRE indeksleridir. Sıra önemsizdir; birleşimleri no-data kümesidir.
export const FIXTURE_GEOMETRY = Object.freeze([
  { id: 'island', kind: 'rect', rowMin: 90, rowMax: 109, colMin: 110, colMax: 129,
    role: 'pencere ortasında 20x20 m no-data adası; yerel (0,0) merkezinde, yoldaşı engeller' },
  { id: 'north-edge-strip', kind: 'rect', rowMin: 0, rowMax: 59, colMin: 180, colMax: 183,
    role: 'kuzey grid kenarına (satır 0) değen 4 m genişliğinde no-data şeridi' },
  { id: 'isolated-hole', kind: 'rect', rowMin: 60, rowMax: 60, colMin: 60, colMax: 60,
    role: 'tek hücrelik izole no-data deliği' },
  { id: 'corridor-wall-west', kind: 'rect', rowMin: 150, rowMax: 151, colMin: 20, colMax: 99,
    role: 'dar koridorun batı duvarı (2 satır kalınlıkta)' },
  { id: 'corridor-wall-east', kind: 'rect', rowMin: 150, rowMax: 151, colMin: 106, colMax: 219,
    role: 'dar koridorun doğu duvarı; geçilebilir boşluk sütun 100..105 (3x3 kuralıyla 101..104 geçilebilir)' },
]);

/** Yerel kot formülü (sentetik): hafif eğimli düzlem + yumuşak Gauss tümseği. Birimi metre; datum iddiası yok. */
export function terrainZ(xM, yM) {
  const dx = xM - 80.5, dy = yM - 69.5;
  return -2500 + 0.02 * xM + 0.01 * yM + 6 * Math.exp(-(dx * dx + dy * dy) / (2 * 18 * 18));
}

/** Hücre (r,c) merkezinin yerel koordinatı. */
export function fixtureCellCentreM(row, col) {
  return { xM: FIXTURE_NW_X_M + (col + 0.5) * FIXTURE_CELL_SIZE_M, yM: FIXTURE_NW_Y_M - (row + 0.5) * FIXTURE_CELL_SIZE_M };
}

function geometryCellSet() {
  const set = new Set();
  for (const g of FIXTURE_GEOMETRY) {
    for (let r = g.rowMin; r <= g.rowMax; r++) for (let c = g.colMin; c <= g.colMax; c++) set.add(r * FIXTURE_COLS + c);
  }
  return set;
}

function sha256Hex(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/**
 * Bellek içi fixture. Döner: { elevation (Float32Array), f32 (Buffer), jsonText (string), json (nesne) }.
 * Aynı çağrılar bayt-bayt aynı sonucu verir.
 */
export function buildNoDataFixture() {
  // Sentinel'in Float32 yuvarlamasının bit desenini doğrula (yanlış sentinel sessizce yazılmasın).
  const ndF32 = new Float32Array([NODATA_VALUE]);
  const ndBits = new Uint32Array(ndF32.buffer)[0];
  if (ndBits !== NODATA_BITS) throw new Error(`no-data bit deseni 0x${ndBits.toString(16)} beklenen 0x${NODATA_BITS.toString(16)}`);

  const n = FIXTURE_ROWS * FIXTURE_COLS;
  const elevation = new Float32Array(n);
  const nd = geometryCellSet();
  for (let r = 0; r < FIXTURE_ROWS; r++) {
    for (let c = 0; c < FIXTURE_COLS; c++) {
      const i = r * FIXTURE_COLS + c;
      if (nd.has(i)) { elevation[i] = NODATA_VALUE; continue; }
      const { xM, yM } = fixtureCellCentreM(r, c);
      elevation[i] = terrainZ(xM, yM);
    }
  }
  const f32 = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) f32.writeFloatLE(elevation[i], i * 4);

  const island = FIXTURE_GEOMETRY[0];
  const json = {
    schema: NODATA_FIXTURE_SCHEMA,
    synthetic: true,
    label: NODATA_FIXTURE_LABEL,
    dataFile: `${NODATA_FIXTURE_FILE_BASENAME}.f32`,
    dtype: 'float32',
    byteOrder: 'little-endian',
    rows: FIXTURE_ROWS,
    cols: FIXTURE_COLS,
    cellSizeM: FIXTURE_CELL_SIZE_M,
    nwXM: FIXTURE_NW_X_M,
    nwYM: FIXTURE_NW_Y_M,
    widthM: FIXTURE_COLS * FIXTURE_CELL_SIZE_M,
    heightM: FIXTURE_ROWS * FIXTURE_CELL_SIZE_M,
    cellRule: 'row-major, row 0 = north, col 0 = west; cell (r,c) centre x = nwXM + (c+0.5)*cellSizeM, y = nwYM - (r+0.5)*cellSizeM',
    noDataValue: NODATA_VALUE,
    noDataBits: `0x${NODATA_BITS.toString(16).toUpperCase()}`,
    validMin: FIXTURE_VALID_MIN,
    validMax: FIXTURE_VALID_MAX,
    noDataCellCount: nd.size,
    islandBoundsM: {
      minX: FIXTURE_NW_X_M + island.colMin * FIXTURE_CELL_SIZE_M,
      maxX: FIXTURE_NW_X_M + (island.colMax + 1) * FIXTURE_CELL_SIZE_M,
      minY: FIXTURE_NW_Y_M - (island.rowMax + 1) * FIXTURE_CELL_SIZE_M,
      maxY: FIXTURE_NW_Y_M - island.rowMin * FIXTURE_CELL_SIZE_M,
    },
    geometry: FIXTURE_GEOMETRY.map((g) => ({ ...g })),
    terrain: {
      model: 'sentetik düzlem + Gauss tümseği',
      formula: 'z = -2500 + 0.02*x + 0.01*y + 6*exp(-((x-80.5)^2 + (y-69.5)^2) / (2*18^2)), x/y yerel metre',
      unit: 'm',
      verticalDatum: null,
      note: 'Datum veya gerçek Mars yükseklik iddiası yoktur.',
    },
    sha256Data: sha256Hex(f32),
    generator: 'scripts/make-nodata-fixture.mjs',
    caveat: 'Yalnız test ve script verisi. Gerçek NASA/USGS ürünü değildir; CRS/datum tahmini yapılmamıştır.',
  };
  const jsonText = `${JSON.stringify(json, null, 2)}\n`;
  return { elevation, f32, json, jsonText };
}

function parseArgs(argv) {
  const out = { out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      const v = argv[++i];
      if (!v) throw new Error('--out bir dizin ister');
      out.out = v;
    } else {
      throw new Error(`Bilinmeyen argüman: ${argv[i]}`);
    }
  }
  return out;
}

function main(argv) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(argv);
  const outDir = args.out ? path.resolve(args.out) : path.resolve(scriptDir, '..', 'data', 'nodata-fixture');
  const { f32, jsonText } = buildNoDataFixture();
  fs.mkdirSync(outDir, { recursive: true });
  const f32Path = path.join(outDir, `${NODATA_FIXTURE_FILE_BASENAME}.f32`);
  const jsonPath = path.join(outDir, `${NODATA_FIXTURE_FILE_BASENAME}.json`);
  fs.writeFileSync(f32Path, f32);
  fs.writeFileSync(jsonPath, jsonText, 'utf8');
  process.stdout.write(`${f32Path} (${f32.length} bayt)\n${jsonPath} (${Buffer.byteLength(jsonText)} bayt)\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main(process.argv.slice(2));
