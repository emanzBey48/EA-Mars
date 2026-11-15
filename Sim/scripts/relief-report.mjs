// Stage 35A — ölçülmüş kabartma raporu (gerçek HiRISE DTM alt penceresi).
//
// Kullanım:
//   node scripts/relief-report.mjs --minDepthM <m> --minProminenceM <m> [--out <ozet.json>]
//
//   Veri: Sim/data/dtm_subset.f32 (float32 LE, satır öncelikli, 0 = kuzey) + dtm_subset.json (salt okunur).
//   --minDepthM / --minProminenceM: ZORUNLU senaryo parametreleri (varsayılan yok). Kaynaklı eşik değildir.
//   Repoya dosya yazılmaz; JSON yalnız --out verilirse yazılır. Veri LFS işaretçisiyse net hata verir.
// PLANLAMA/ÖLÇÜM ARACI: sayılar ölçülen DTM'den çıkar; kaya/blok tespiti değildir.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { elevationStats, slopeStats, findDepressions, findSummits } from '../public/js/geo/relief-metrics.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const NODATA = -3.4028226550889044e38; // 0xFF7FFFFB (dtm_subset.json: missingConstantHex)
const EXPECTED_SHA256 = 'fa1265290add466c7d68af1cfdb0aefbf9a49a35b710ab0fc6543d6f7ce379c9'; // validate-route-planner ile aynı

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} bir değer ister`);
  return v;
}
function requiredNumber(name) {
  const raw = argValue(name);
  if (raw === undefined) {
    throw new Error(`${name} zorunlu (senaryo parametresi; varsayılan yok). Örnek: --${name.slice(2)} 0.5`);
  }
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${name} sonlu ve ≥ 0 olmalı (verilen: ${raw})`);
  return v;
}

const minDepthM = requiredNumber('--minDepthM');
const minProminenceM = requiredNumber('--minProminenceM');
const outPath = argValue('--out') ?? null;

if (os.endianness() !== 'LE') throw new Error('Big-endian ana makine: float32 LE okuma desteklenmiyor');

const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'dtm_subset.json'), 'utf8'));
const f32Path = path.join(dataDir, 'dtm_subset.f32');
const buf = fs.readFileSync(f32Path);
if (buf.length === 132 || buf.subarray(0, 24).toString('utf8').startsWith('version https://git-lfs')) {
  throw new Error(`${f32Path} bir Git LFS işaretçisi (${buf.length} bayt); gerçek veri yok. 'git lfs pull' gerekli.`);
}
const { row0, col0, rows, cols } = meta.window;
if (buf.length !== rows * cols * 4) throw new Error(`dtm_subset.f32 boyutu ${buf.length} != ${rows * cols * 4}`);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
if (sha !== EXPECTED_SHA256) throw new Error(`SHA-256 uyuşmuyor: ${sha}`);
const elevation = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));

// Pencere çerçevesi: validate-route-planner.mjs ile aynı (WB1 = yerel orijin, NW kenarı = hücre merkezi - 0,5).
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const nw = adapter.pixelToLocal(row0 - 0.5, col0 - 0.5);
const wb1 = adapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg);
const roubion = adapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);

const grid = {
  elevation, rows, cols, cellSizeM: MAP_FRAME.mapScaleM,
  noDataValue: NODATA, validMin: MAP_FRAME.validMin, validMax: MAP_FRAME.validMax,
  nwXM: nw.x, nwYM: nw.y,
};

const t0 = performance.now();
const elev = elevationStats(grid);
const slope = slopeStats(grid);
const dep = findDepressions(grid, { minDepthM });
const sum = findSummits(grid, { minProminenceM });
const ms = Math.round(performance.now() - t0);

const r3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const fmt = (v, unit = '') => (v === null ? 'bilinmiyor' : `${r3(v)}${unit}`);

const window = {
  file: 'Sim/data/dtm_subset.f32', sha256: sha, rows, cols, cellSizeM: MAP_FRAME.mapScaleM,
  rowOffset: row0, colOffset: col0,
  localBoundsM: {
    xMin: r3(nw.x), xMax: r3(nw.x + cols * MAP_FRAME.mapScaleM),
    yMin: r3(nw.y - rows * MAP_FRAME.mapScaleM), yMax: r3(nw.y),
  },
  waypointsLocalM: {
    sol120WB1: { x: r3(wb1.x), y: r3(wb1.y) },
    sol164Roubion: { x: r3(roubion.x), y: r3(roubion.y) },
  },
};

// JSON tam hassasiyette kalır (analiz için); yuvarlama yalnız ekran çıktısındadır.
const top = (list, n = 5) => list.slice(0, n).map((b, i) => ({ rank: i + 1, ...b }));
const result = {
  schema: 'marswalk.relief-report.v1',
  scenarioParameters: { minDepthM, minProminenceM, note: 'senaryo parametreleri; kaynaklı eşik değildir' },
  window,
  elevation: elev,
  slope,
  depressions: { counts: dep.counts, topByDepth: top(dep.basins) },
  summits: { counts: sum.counts, topByProminence: top(sum.summits) },
  computeMs: ms,
};

if (outPath) fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

console.log('=== Stage 35A kabartma raporu (ölçülmüş DTM penceresi) ===');
console.log(`Pencere: ${rows} x ${cols} hücre, ${MAP_FRAME.mapScaleM} m; SHA-256 doğrulandı`);
console.log(`Yerel sınır (m): x ${r3(window.localBoundsM.xMin)} … ${r3(window.localBoundsM.xMax)}, y ${r3(window.localBoundsM.yMin)} … ${r3(window.localBoundsM.yMax)}`);
console.log(`WB1 (Sol 120) yerel: x ${r3(wb1.x)}, y ${r3(wb1.y)}; Roubion (Sol 164) yerel: x ${r3(roubion.x)}, y ${r3(roubion.y)}`);
console.log('');
console.log(`Bilinen / bilinmeyen hücre: ${elev.validCount} / ${elev.unknownCount}`);
console.log(`Kot (m): min ${fmt(elev.minM)}, P1 ${fmt(elev.p1M)}, P50 ${fmt(elev.p50M)}, P99 ${fmt(elev.p99M)}, max ${fmt(elev.maxM)}`);
console.log(`Aralık: tam ${fmt(elev.rangeM, ' m')}, P1–P99 ${fmt(elev.p1p99RangeM, ' m')}`);
console.log(`Eğim (Horn, derece): P50 ${fmt(slope.p50Deg)}, P90 ${fmt(slope.p90Deg)}, P99 ${fmt(slope.p99Deg)}, max ${fmt(slope.maxDeg)} (hesaplanan ${slope.computedCount}; hesaplanamayan ${slope.uncomputedKnownCount})`);
console.log('');
console.log(`Çukur (minDepthM=${minDepthM} m, senaryo): toplam havza ${dep.counts.totalBasins}, kapalı ${dep.counts.closedBasins}, kenara sızan ${dep.counts.edgeLeakingBasins}, eşik üstü ${dep.counts.closedAboveThreshold} (no-data temaslı ${dep.counts.closedAboveThresholdTouchingUnknown})`);
for (const b of result.depressions.topByDepth) {
  console.log(`  #${b.rank} derinlik ${r3(b.depthM)} m | en alçak ${r3(b.minElevationM)} m | yerel x ${r3(b.xM)}, y ${r3(b.yM)} | alan ${r3(b.areaM2)} m² (${b.cellCount} hücre)${b.noDataTemasi ? ' | no-data temaslı (ALT SINIR)' : ''}`);
}
console.log('');
console.log(`Tepe (minProminenceM=${minProminenceM} m, senaryo): toplam ${sum.counts.totalHills}, kapalı ${sum.counts.closedHills}, kenara sızan ${sum.counts.edgeLeakingHills}, eşik üstü ${sum.counts.closedAboveThreshold} (no-data temaslı ${sum.counts.closedAboveThresholdTouchingUnknown})`);
for (const s of result.summits.topByProminence) {
  console.log(`  #${s.rank} belirginlik ${r3(s.prominenceM)} m | zirve ${r3(s.peakElevationM)} m, geçit ${r3(s.baseElevationM)} m | yerel x ${r3(s.xM)}, y ${r3(s.yM)} | alan ${r3(s.areaM2)} m² (${s.cellCount} hücre)${s.noDataTemasi ? ' | no-data temaslı (ALT SINIR)' : ''}`);
}
console.log('');
console.log(`Hesap süresi: ${ms} ms${outPath ? `; özet JSON: ${outPath}` : ''}`);
