// Stage 23C — real-data validation of the 23A/23B/23D route planner on the Jezero 1 m DTM window.
//
// Usage:  node scripts/validate-route-planner.mjs [--out <summary.json>] [--synthetic]
//   Data: Sim/data/dtm_subset.f32 (float32 LE, row-major, row 0 = north, 1676 x 1135) + dtm_subset.json (read-only).
//   The window is the TIFF-derived subset; the 1.8 GB TIFF is NOT read. Nothing is written into the repo; the
//   summary JSON goes to --out (or stdout only when omitted). --synthetic runs a pipeline self-check on a
//   deterministic synthetic surface (numbers are NOT real data).
// PLANNING AID: numbers describe the scenario cost model; they do not show the planner beats the rover.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDemWindow, buildFieldForWindow, planWalkingRoute, cellToLocal, localToCell } from '../public/js/route/route-service.js';
import { STATUS } from '../public/js/route/cost-model.js';
import { adapterFromLabel, pointToSegment } from '../public/js/geo/geo.js';
import { selectTraverseSubset, projectTraverse, polylineLengthM, compareToStraightLine } from '../public/js/geo/traverse.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const args = process.argv.slice(2);
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const synthetic = args.includes('--synthetic');
const EXPECTED_SHA256 = 'fa1265290add466c7d68af1cfdb0aefbf9a49a35b710ab0fc6543d6f7ce379c9'; // LFS pointer oid
const NODATA = -3.4028226550889044e38; // 0xFF7FFFFB
const STATUS_NAMES = ['OK', 'TOO_STEEP', 'NO_DATA', 'OUT_OF_COVERAGE', 'INVALID', 'EDGE_UNKNOWN'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pct = (arr, p) => { if (!arr.length) return null; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

// ---------------------------------------------------------------- data
let meta, elevation, dataFacts;
if (synthetic) {
  const rows = 1676, cols = 1135;
  elevation = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    elevation[r * cols + c] = -2570 + 6 * Math.sin(r / 40) * Math.cos(c / 55) + 3 * Math.sin((r + 2 * c) / 17);
  }
  meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'dtm_subset.json'), 'utf8'));
  dataFacts = { source: 'SENTETİK (gerçek veri değil)', sha256: null };
} else {
  if (os.endianness() !== 'LE') throw new Error('Big-endian ana makine: float32 LE okuma desteklenmiyor');
  meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'dtm_subset.json'), 'utf8'));
  const f32 = path.join(dataDir, 'dtm_subset.f32');
  const buf = fs.readFileSync(f32);
  const { rows, cols } = meta.window;
  if (buf.length !== rows * cols * 4) throw new Error(`dtm_subset.f32 boyutu ${buf.length} != ${rows * cols * 4} (LFS işaretçisi olabilir)`);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== EXPECTED_SHA256) throw new Error(`SHA-256 uyuşmuyor: ${sha}`);
  elevation = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); // aligned copy
  dataFacts = { source: 'Sim/data/dtm_subset.f32 (LFS, TIFF\'ten türetilmiş pencere; TIFF bu ortamda yok)', sha256: sha, sha256Matches: true };
}
const { row0, col0, rows, cols } = meta.window;
let noData = 0, vmin = Infinity, vmax = -Infinity;
for (let i = 0; i < elevation.length; i++) {
  const z = elevation[i];
  if (z === Math.fround(NODATA)) noData++;
  else if (z < vmin) vmin = z; else if (z > vmax) vmax = z;
  if (z > vmax) vmax = z;
}
Object.assign(dataFacts, { rows, cols, cells: rows * cols, noDataCells: noData, validMin: vmin, validMax: vmax });

// ---------------------------------------------------------------- window in the project local frame
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]); // origin = WB1
const nw = adapter.pixelToLocal(row0 - 0.5, col0 - 0.5); // west/north EDGE of window cell (0,0)
const win = createDemWindow({
  elevation, rows, cols, cellSizeM: MAP_FRAME.mapScaleM, nwXM: nw.x, nwYM: nw.y,
  noDataValue: NODATA, validMin: MAP_FRAME.validMin, validMax: MAP_FRAME.validMax, adapter,
});
const wb1 = adapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg);
const rou = adapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);

let t = performance.now();
const field = buildFieldForWindow(win);
const fieldMs = performance.now() - t;
const statusCounts = {};
const slopes = [];
for (let i = 0; i < field.status.length; i++) {
  const n = STATUS_NAMES[field.status[i]];
  statusCounts[n] = (statusCounts[n] ?? 0) + 1;
  if (Number.isFinite(field.slopeDeg[i])) slopes.push(field.slopeDeg[i]);
}
const fieldFacts = {
  buildMs: r2(fieldMs), statusCounts,
  slopeDeg: { p50: r2(pct(slopes, 0.5)), p90: r2(pct(slopes, 0.9)), p99: r2(pct(slopes, 0.99)), max: r2(slopes.reduce((m, v) => Math.max(m, v), 0)) },
  tooSteepFraction: r2((statusCounts.TOO_STEEP ?? 0) / field.status.length * 100),
};

// ---------------------------------------------------------------- profile helper (sampling a local polyline)
function profile(points, fld) {
  const seen = new Set();
  const slope = [], sc = [], byStatus = {};
  const visit = (x, y) => {
    const c = localToCell(win, x, y);
    if (!c.inside) { byStatus.OUTSIDE_WINDOW = (byStatus.OUTSIDE_WINDOW ?? 0) + 1; return; }
    const i = c.row * cols + c.col;
    if (seen.has(i)) return; seen.add(i);
    const n = STATUS_NAMES[fld.status[i]];
    byStatus[n] = (byStatus[n] ?? 0) + 1;
    if (Number.isFinite(fld.slopeDeg[i])) slope.push(fld.slopeDeg[i]);
    if (fld.status[i] === STATUS.OK) sc.push(fld.score[i]);
  };
  let len = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k], L = Math.hypot(b.x - a.x, b.y - a.y);
    len += L;
    const n = Math.max(1, Math.ceil(L / 0.25));
    for (let s = 0; s <= n; s++) visit(a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n);
  }
  return {
    lengthM: r2(len), cellsTouched: seen.size, byStatus,
    tooSteepCells: byStatus.TOO_STEEP ?? 0,
    unknownCells: (byStatus.NO_DATA ?? 0) + (byStatus.INVALID ?? 0) + (byStatus.OUT_OF_COVERAGE ?? 0) + (byStatus.EDGE_UNKNOWN ?? 0) + (byStatus.OUTSIDE_WINDOW ?? 0),
    slopeDeg: { p50: r2(pct(slope, 0.5)), p90: r2(pct(slope, 0.9)), max: r2(slope.reduce((m, v) => Math.max(m, v), 0)) },
    minScoreOnPassable: sc.length ? Math.min(...sc) : null, meanScoreOnPassable: sc.length ? r2(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
  };
}
function densify(pts, step = 1) {
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < n; s++) out.push({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n });
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function distToPolyline(p, line) {
  let d = Infinity;
  for (let k = 1; k < line.length; k++) d = Math.min(d, pointToSegment(p.x, p.y, line[k - 1].x, line[k - 1].y, line[k].x, line[k].y).distance);
  return d;
}
function deviation(from, to) {
  const ds = densify(from).map((p) => distToPolyline(p, to));
  return { meanM: r2(ds.reduce((a, b) => a + b, 0) / ds.length), maxM: r2(Math.max(...ds)), p90M: r2(pct(ds, 0.9)) };
}

// ---------------------------------------------------------------- archive traverse (20A)
const traverseJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'mars-trek', 'M20_traverse.json'), 'utf8'));
const waypointsJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'mars-trek', 'M20_waypoints.json'), 'utf8'));
const proj = projectTraverse(selectTraverseSubset(traverseJson, waypointsJson), adapter);
const archive = proj.polyline.map((p) => ({ x: p.x, y: p.y }));
const outside = archive.filter((p) => !localToCell(win, p.x, p.y).inside).length;
const xs = archive.map((p) => p.x), ys = archive.map((p) => p.y);
const coverage = {
  archivePoints: archive.length, archivePointsOutsideWindow: outside,
  archiveBBoxLocalM: { xMin: r2(Math.min(...xs)), xMax: r2(Math.max(...xs)), yMin: r2(Math.min(...ys)), yMax: r2(Math.max(...ys)) },
  windowBoundsLocalM: { xMin: r2(win.nwXM), xMax: r2(win.nwXM + win.widthM), yMin: r2(win.nwYM - win.heightM), yMax: r2(win.nwYM) },
  marginToWindowEdgeM: r2(Math.min(Math.min(...xs) - win.nwXM, win.nwXM + win.widthM - Math.max(...xs), Math.min(...ys) - (win.nwYM - win.heightM), win.nwYM - Math.max(...ys))),
  waypointsInside: [wb1, rou].map((p) => localToCell(win, p.x, p.y).inside),
};

// ---------------------------------------------------------------- main comparison
function runPlan(params, start, end, options) {
  const t1 = performance.now();
  const res = planWalkingRoute({ window: win, field: params ? buildFieldForWindow(win, params) : field, startLocal: start, endLocal: end, options });
  return { res, ms: performance.now() - t1 };
}
const S = { xM: wb1.x, yM: wb1.y }, E = { xM: rou.x, yM: rou.y };
const main = runPlan(null, S, E);
const planned = main.res;
const result = { script: 'validate-route-planner.mjs', synthetic, data: dataFacts, field: fieldFacts, coverage };
if (planned.status !== 'ok') {
  result.main = { status: planned.status, reason: planned.reason };
} else {
  const plannedPts = planned.path.map((p) => ({ x: p.xM, y: p.yM }));
  const straightPts = [{ x: S.xM, y: S.yM }, { x: E.xM, y: E.yM }];
  result.main = {
    status: 'ok', runtimeMs: r2(main.ms), plannerCellsExpanded: planned.stats.cellsExpanded,
    straightLengthM: r2(Math.hypot(E.xM - S.xM, E.yM - S.yM)),
    planned: { ...profile(plannedPts, field), plannerStats: { lengthM: r2(planned.stats.lengthM), minScore: planned.stats.minScore, meanScore: r2(planned.stats.meanScore), maxSlopeDeg: r2(planned.stats.maxSlopeDeg), elevationGainM: r2(planned.stats.elevationGainM), elevationLossM: r2(planned.stats.elevationLossM), estimatedDurationS_scenario: r2(planned.stats.estimatedDurationS) } },
    straight: { ...profile(straightPts, field), crossingsFromPlanner: planned.straightLine },
    archive: { ...profile(archive, field), polylineLengthM: r2(polylineLengthM(archive)) },
    plannedVsArchive: { plannedToArchive: deviation(plannedPts, archive), archiveToPlanned: deviation(archive, plannedPts) },
    plannedVsStraight: (({ meanLateralDeviationM, maxLateralDeviationM, lengthRatio }) => ({ meanM: r2(meanLateralDeviationM), maxM: r2(maxLateralDeviationM), lengthRatio: r2(lengthRatio) }))(compareToStraightLine(plannedPts, straightPts[0], straightPts[1])),
    archiveVsStraight: (({ meanLateralDeviationM, maxLateralDeviationM, lengthRatio }) => ({ meanM: r2(meanLateralDeviationM), maxM: r2(maxLateralDeviationM), lengthRatio: r2(lengthRatio) }))(compareToStraightLine(archive, straightPts[0], straightPts[1])),
  };
}

// ---------------------------------------------------------------- sensitivity
result.sensitivity = [];
for (const maxS of [15, 20, 25]) for (const comf of [5, 8, 12]) {
  const params = { maxSlopeDeg: maxS, comfortableSlopeDeg: comf };
  const { res, ms } = runPlan(params, S, E);
  const f = buildFieldForWindow(win, params);
  result.sensitivity.push({
    maxSlopeDeg: maxS, comfortableSlopeDeg: comf, status: res.status, lengthM: r2(res.stats?.lengthM), minScore: res.stats?.minScore ?? null,
    meanScore: r2(res.stats?.meanScore), maxSlopeOnPathDeg: r2(res.stats?.maxSlopeDeg), tooSteepOnStraight: res.straightLine?.tooSteep ?? null,
    tooSteepFractionPct: r2(Array.prototype.filter.call(f.status, (v) => v === STATUS.TOO_STEEP).length / f.status.length * 100), ms: r2(ms),
  });
}

// ---------------------------------------------------------------- random pairs
const rnd = mulberry32(20261114);
const pairs = [];
let attempts = 0;
while (pairs.length < 5 && attempts < 100000) {
  attempts++;
  const a = [Math.floor(rnd() * rows), Math.floor(rnd() * cols)], b = [Math.floor(rnd() * rows), Math.floor(rnd() * cols)];
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (d < 150 || d > 600) continue;
  if (field.cost[a[0] * cols + a[1]] === Infinity || field.cost[b[0] * cols + b[1]] === Infinity) continue;
  pairs.push([a, b]);
}
result.randomPairs = pairs.map(([a, b]) => {
  const s = cellToLocal(win, a[0], a[1]), e = cellToLocal(win, b[0], b[1]);
  const { res, ms } = runPlan(null, { xM: s.xM, yM: s.yM }, { xM: e.xM, yM: e.yM });
  return {
    from: a, to: b, status: res.status, straightM: r2(Math.hypot(a[0] - b[0], a[1] - b[1])), lengthM: r2(res.stats?.lengthM),
    lengthRatio: r2(res.stats?.lengthRatioToStraight), minScore: res.stats?.minScore ?? null,
    tooSteepOnStraight: res.straightLine?.tooSteep ?? null, ms: r2(ms),
  };
});
const okPairs = result.randomPairs.filter((p) => p.status === 'ok');
result.randomPairSummary = {
  attempts, planned: result.randomPairs.length, ok: okPairs.length,
  successRate: result.randomPairs.length ? okPairs.length / result.randomPairs.length : null,
  meanLengthRatio: okPairs.length ? r2(okPairs.reduce((s, p) => s + p.lengthRatio, 0) / okPairs.length) : null,
  meanMs: okPairs.length ? r2(okPairs.reduce((s, p) => s + p.ms, 0) / okPairs.length) : null,
};

const json = JSON.stringify(result, null, 2);
if (outPath) fs.writeFileSync(outPath, json);
console.log(json);
