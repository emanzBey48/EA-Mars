import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemWindow, localToCell, cellToLocal, buildFieldForWindow, planWalkingRoute, explainLocal,
  classifyResolution, RESOLUTION_THRESHOLDS,
} from '../public/js/route/route-service.js';
import { explainCell, STATUS } from '../public/js/route/cost-model.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';

const ND = -9999;
function makeWin(rows, cols, fn, o = {}) {
  const elevation = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = fn(r, c);
  return createDemWindow({ elevation, rows, cols, cellSizeM: 1, nwXM: -50, nwYM: 40, noDataValue: ND, ...o });
}
const at = (win, r, c) => cellToLocal(win, r, c);
const strip = (res) => { const { timing, ...rest } = res; return rest; };
function scan(o, visit, key = '') {
  visit(o, key);
  if (o && typeof o === 'object') for (const k of Object.keys(o)) scan(o[k], visit, k);
}

test('createDemWindow validates sizes and bounds consistency', () => {
  const e = new Float32Array(6);
  assert.throws(() => createDemWindow({ elevation: e, rows: 2, cols: 4, cellSizeM: 1, nwXM: 0, nwYM: 0 }), /rows\*cols/);
  assert.throws(() => createDemWindow({ elevation: e, rows: 2, cols: 3, cellSizeM: 0, nwXM: 0, nwYM: 0 }), /cellSizeM/);
  assert.throws(() => createDemWindow({ elevation: [1, 2, 3, 4, 5, 6], rows: 2, cols: 3, cellSizeM: 1, nwXM: 0, nwYM: 0 }), /Float32Array/);
  assert.throws(() => createDemWindow({ elevation: e, rows: 2, cols: 3, cellSizeM: 2, nwXM: 0, nwYM: 0, widthM: 5, heightM: 4 }), /widthM/);
  const w = createDemWindow({ elevation: e, rows: 2, cols: 3, cellSizeM: 2, nwXM: -1, nwYM: 7, widthM: 6, heightM: 4 });
  assert.deepEqual({ ...w.bounds }, { nwXM: -1, nwYM: 7, widthM: 6, heightM: 4 });
  assert.ok(Object.isFrozen(w));
});

test('coordinate mapping: round trip and half-open rule identical to minimap selectionRejection', () => {
  const win = makeWin(8, 10, () => 0, { cellSizeM: 2.5, nwXM: -12.5, nwYM: 33 });
  const b = win.bounds;
  // Replicated documented minimap rule (no import from minimap.js).
  const minimapRejects = (x, y) => x < b.nwXM || x >= b.nwXM + b.widthM || y > b.nwYM || y <= b.nwYM - b.heightM;
  assert.equal(b.widthM, 25); assert.equal(b.heightM, 20);
  const xs = [b.nwXM - 1e-9, b.nwXM, b.nwXM + 1e-9, 0, b.nwXM + b.widthM - 1e-9, b.nwXM + b.widthM, b.nwXM + b.widthM + 1e-9];
  const ys = [b.nwYM + 1e-9, b.nwYM, b.nwYM - 1e-9, 20, b.nwYM - b.heightM + 1e-9, b.nwYM - b.heightM, b.nwYM - b.heightM - 1e-9];
  for (const x of xs) for (const y of ys) {
    const c = localToCell(win, x, y);
    assert.equal(c.inside, !minimapRejects(x, y), `(${x},${y})`);
    if (c.inside) {
      assert.ok(c.row >= 0 && c.row < win.rows && c.col >= 0 && c.col < win.cols);
      assert.equal(c.col, Math.min(win.cols - 1, Math.floor((x - b.nwXM) / 2.5)));
      assert.equal(c.row, Math.min(win.rows - 1, Math.floor((b.nwYM - y) / 2.5)));
    }
  }
  // Edge points: NW corner belongs to cell (0,0); SE corner is outside.
  assert.deepEqual([localToCell(win, b.nwXM, b.nwYM).row, localToCell(win, b.nwXM, b.nwYM).col], [0, 0]);
  assert.equal(localToCell(win, b.nwXM + b.widthM, b.nwYM - b.heightM).inside, false);
  // Round trip for all centres.
  for (let r = 0; r < win.rows; r++) for (let c = 0; c < win.cols; c++) {
    const p = cellToLocal(win, r, c);
    const q = localToCell(win, p.xM, p.yM);
    assert.deepEqual([q.row, q.col, q.inside], [r, c, true]);
    assert.ok(Math.abs(q.snapOffsetM.dx) < 1e-12 && Math.abs(q.snapOffsetM.dy) < 1e-12);
  }
  const off = localToCell(win, b.nwXM + 0.5, b.nwYM - 0.25);
  assert.ok(Math.abs(off.snapOffsetM.dx - 0.75) < 1e-12 && Math.abs(off.snapOffsetM.dy + 1) < 1e-12);
  assert.throws(() => cellToLocal(win, 8, 0), RangeError);
});

test('flat window: straight route, EVA mode, scores and elevation', () => {
  const win = makeWin(30, 40, () => -2500);
  const res = planWalkingRoute({ window: win, startLocal: at(win, 5, 5), endLocal: at(win, 5, 30) });
  assert.equal(res.status, 'ok');
  assert.equal(res.mode, 'eva_walkability');
  assert.ok(Math.abs(res.stats.lengthM - 25) < 1e-9);
  assert.equal(res.stats.minScore, 100);
  assert.equal(res.stats.elevationGainM, 0);
  assert.equal(res.stats.tooSteepCellsOnStraightLine, 0);
  assert.ok(Math.abs(res.stats.estimatedDurationS - 25 / 0.8) < 1e-9);
  assert.equal(res.stats.durationAssumption.status, 'scenario');
  assert.deepEqual([res.path[0].row, res.path[0].col], [5, 5]);
  assert.match(res.provenance.caveatTR, /güvenlik sertifikası değildir/);
  assert.match(res.provenance.caveatEN, /not a safety certificate/);
});

test('wall with gap: route passes through the gap cell centres in local metres', () => {
  const win = makeWin(40, 60, (r, c) => (c >= 28 && c <= 30 && !(r >= 18 && r <= 22) ? -2500 + 12 : -2500));
  const s = at(win, 20 - 15, 10), e = at(win, 20 + 14, 50);
  const res = planWalkingRoute({ window: win, startLocal: s, endLocal: e });
  assert.equal(res.status, 'ok');
  const gapYMax = at(win, 18, 0).yM, gapYMin = at(win, 22, 0).yM;
  const wallXMin = at(win, 0, 28).xM, wallXMax = at(win, 0, 30).xM;
  const inWall = res.path.filter((p) => p.xM >= wallXMin && p.xM <= wallXMax);
  assert.ok(inWall.length >= 3);
  for (const p of inWall) {
    assert.ok(p.yM <= gapYMax && p.yM >= gapYMin, `path cell (${p.row},${p.col}) not in gap`);
    const c = cellToLocal(win, p.row, p.col);
    assert.equal(p.xM, c.xM); assert.equal(p.yM, c.yM);
  }
  assert.ok(res.stats.tooSteepCellsOnStraightLine > 0);
  assert.ok(res.stats.lengthRatioToStraight > 1);
  assert.equal(res.stats.impassableCrossings, 0);
});

test('steep ridge avoidance: planned route keeps below max slope while straight line does not', () => {
  // Ridge across columns ~25-35; steep (about 30 deg) for rows < 30, gentle ramp for rows >= 34.
  // Ridge (side slope 1.2 m/m) along rows, lowered to a gentle saddle around row 60.
  const win = makeWin(100, 60, (r, c) => {
    const g = Math.min(1, Math.max(0.15, 0.15 + 0.85 * (Math.abs(r - 60) - 8) / 25));
    return -2500 + g * Math.max(0, 8 - 1.2 * Math.abs(c - 30));
  });
  const res = planWalkingRoute({ window: win, startLocal: at(win, 20, 10), endLocal: at(win, 20, 50) });
  assert.equal(res.status, 'ok');
  assert.ok(res.stats.maxSlopeDeg < 20, `max slope ${res.stats.maxSlopeDeg}`);
  assert.ok(res.stats.tooSteepCellsOnStraightLine > 0);
  assert.ok(res.stats.lengthM > 40 * 1.2);
  assert.ok(res.stats.elevationGainM > 0 && res.stats.elevationLossM > 0);
});

test('blocked endpoints: structured status with cell STATUS name, no silent snapping', () => {
  const win = makeWin(30, 40, (r, c) => (r >= 14 && r <= 16 && c >= 14 && c <= 16 ? ND : -2500));
  const good = at(win, 5, 5);
  const bad = at(win, 15, 15);
  const r1 = planWalkingRoute({ window: win, startLocal: bad, endLocal: good });
  assert.equal(r1.status, 'start_blocked');
  assert.equal(r1.blocked.statusName, 'NO_DATA');
  assert.deepEqual(r1.path, []);
  assert.match(r1.reason, /NO_DATA/); assert.match(r1.reasonEN, /No silent snapping/);
  const r2 = planWalkingRoute({ window: win, startLocal: good, endLocal: at(win, 13, 15) }); // neighbour of no-data
  assert.equal(r2.status, 'end_blocked');
  assert.equal(r2.blocked.statusName, 'EDGE_UNKNOWN');
  const r3 = planWalkingRoute({ window: win, startLocal: good, endLocal: at(win, 0, 5) }); // grid edge
  assert.equal(r3.status, 'end_blocked');
  // Optional, reported snap.
  const r4 = planWalkingRoute({ window: win, startLocal: good, endLocal: at(win, 13, 15), options: { snapToNearestPassableWithinM: 3 } });
  assert.equal(r4.status, 'ok');
  assert.equal(r4.endCell.snap.applied, true);
  assert.ok(r4.endCell.snap.distanceM > 0 && r4.endCell.snap.distanceM <= 3);
  assert.notDeepEqual([r4.endCell.snap.to.row, r4.endCell.snap.to.col], [13, 15]);
  const r5 = planWalkingRoute({ window: win, startLocal: good, endLocal: bad, options: { snapToNearestPassableWithinM: 1 } });
  assert.equal(r5.status, 'end_blocked');
});

test('outside coverage and invalid input never throw', () => {
  const win = makeWin(30, 40, () => -2500);
  const r1 = planWalkingRoute({ window: win, startLocal: { xM: 1000, yM: 0 }, endLocal: at(win, 5, 5) });
  assert.equal(r1.status, 'outside_coverage'); assert.equal(r1.which, 'start');
  const r2 = planWalkingRoute({ window: win, startLocal: at(win, 5, 5), endLocal: { xM: 0, yM: -1e6 } });
  assert.equal(r2.status, 'outside_coverage'); assert.equal(r2.which, 'end');
  assert.equal(planWalkingRoute({}).status, 'invalid_input');
  assert.equal(planWalkingRoute(null).status, 'invalid_input');
  assert.equal(planWalkingRoute({ window: win, startLocal: { xM: NaN, yM: 0 }, endLocal: at(win, 5, 5) }).status, 'invalid_input');
  assert.equal(planWalkingRoute({ window: win, startLocal: at(win, 5, 5), endLocal: at(win, 6, 6), options: { bogus: 1 } }).status, 'invalid_input');
});

test('straight-line crossing counts match an independent row scan', () => {
  const win = makeWin(30, 60, (r, c) => (c >= 28 && c <= 30 ? -2500 + 15 : -2500));
  const field = buildFieldForWindow(win);
  const row = 15;
  let expected = 0;
  for (let c = 6; c <= 53; c++) if (field.status[row * 60 + c] === STATUS.TOO_STEEP) expected++;
  assert.ok(expected >= 3);
  const res = planWalkingRoute({ window: win, startLocal: at(win, row, 6), endLocal: at(win, row, 53) });
  assert.equal(res.straightLine.tooSteep, expected);
  assert.equal(res.straightLine.cellsCrossed, 48);
  // The wall spans every row, so no route exists; the counts must still be reported.
  assert.equal(res.status, 'no_path');
  assert.equal(res.straightLine.tooSteep, expected);
  assert.equal(res.stats, null);
});

test('explainLocal wraps explainCell with local coordinates, JSON-safe', () => {
  const win = makeWin(30, 40, (r, c) => (r === 10 && c === 10 ? ND : -2500 + 0.2 * c));
  const field = buildFieldForWindow(win);
  const p = at(win, 20, 20);
  const ex = explainLocal(win, field, p.xM + 0.2, p.yM - 0.1);
  const ref = explainCell(field, 20, 20);
  assert.equal(ex.status, 'ok');
  assert.deepEqual(ex.cell, { row: 20, col: 20 });
  assert.deepEqual(ex.centre, p);
  assert.ok(Math.abs(ex.snapOffsetM.dx + 0.2) < 1e-12);
  assert.equal(ex.score, ref.score);
  assert.ok(Math.abs(ex.slopeDeg - ref.slopeDeg) < 1e-6);
  assert.equal(ex.passable, true);
  assert.equal(ex.components.length, ref.components.length);
  assert.match(ex.caveatEN, /not a safety certificate/);
  assert.equal(ex.provenance.parameters.find((q) => q.name === 'maxSlopeDeg').status, 'scenario');
  const nd = explainLocal(win, field, at(win, 10, 10).xM, at(win, 10, 10).yM);
  assert.equal(nd.cellStatus, 'NO_DATA'); assert.equal(nd.passable, false);
  assert.equal(nd.slopeDeg, null); assert.equal(nd.elevationM, null); assert.equal(nd.costIsInfinite, true);
  assert.deepEqual(JSON.parse(JSON.stringify(nd)), JSON.parse(JSON.stringify(nd)));
  assert.equal(explainLocal(win, field, 1e6, 0).status, 'outside_coverage');
});

test('resolution guard: 1 m EVA, 20 m regional (no score), 500 m refused', () => {
  assert.equal(classifyResolution(1), 'eva_walkability');
  assert.equal(classifyResolution(RESOLUTION_THRESHOLDS.evaWalkabilityMaxM), 'eva_walkability');
  assert.equal(classifyResolution(20), 'regional_preplan');
  assert.equal(classifyResolution(500), 'global_context');
  assert.throws(() => classifyResolution(0), TypeError);
  const rough = (r, c) => -2500 + ((r * 7 + c * 13) % 5) * 0.5 + 0.3 * c;
  const w20 = makeWin(30, 40, rough, { cellSizeM: 20 });
  const res = planWalkingRoute({ window: w20, startLocal: at(w20, 5, 5), endLocal: at(w20, 20, 30) });
  assert.equal(res.status, 'ok');
  assert.equal(res.mode, 'regional_preplan');
  assert.match(res.modeNote.tr, /yürünebilirlik puanı değildir/);
  assert.match(res.provenance.caveatTR, /yürünebilirlik puanı değildir/);
  const keys = new Set();
  scan(res, (_, k) => keys.add(k));
  for (const k of ['score', 'minScore', 'meanScore', 'roughnessM', 'estimatedDurationS']) assert.ok(!keys.has(k), `leaked ${k}`);
  const ex = explainLocal(w20, buildFieldForWindow(w20), at(w20, 10, 10).xM, at(w20, 10, 10).yM);
  assert.equal(ex.mode, 'regional_preplan');
  assert.ok(!('score' in ex) && !('components' in ex) && !('roughnessM' in ex));
  const w500 = makeWin(10, 10, rough, { cellSizeM: 500 });
  assert.throws(() => buildFieldForWindow(w500), RangeError);
  const rg = planWalkingRoute({ window: w500, startLocal: at(w500, 3, 3), endLocal: at(w500, 6, 6) });
  assert.equal(rg.status, 'resolution_too_coarse');
  assert.deepEqual(rg.path, []);
  const keys2 = new Set(); scan(rg, (_, k) => keys2.add(k));
  assert.ok(!keys2.has('score') && !keys2.has('minScore'));
});

test('determinism, frozen outputs, JSON safety, memoisation', () => {
  const win = makeWin(30, 40, (r, c) => -2500 + Math.sin(r / 3) * Math.cos(c / 4));
  const args = { window: win, startLocal: at(win, 4, 4), endLocal: at(win, 25, 35) };
  const a = planWalkingRoute(args), b = planWalkingRoute(args);
  assert.equal(a.status, 'ok');
  assert.deepEqual(strip(a), strip(b));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.path) && Object.isFrozen(a.path[0]) && Object.isFrozen(a.stats) && Object.isFrozen(a.provenance));
  assert.throws(() => { a.path.push({}); }, TypeError);
  assert.throws(() => { a.stats.lengthM = 0; }, TypeError);
  scan(a, (v) => {
    assert.ok(!ArrayBuffer.isView(v), 'typed array in result');
    if (typeof v === 'number') assert.ok(Number.isFinite(v), 'non-finite number in result');
  });
  assert.deepEqual(JSON.parse(JSON.stringify(strip(a))), JSON.parse(JSON.stringify(strip(a))));
  const f1 = buildFieldForWindow(win), f2 = buildFieldForWindow(win, undefined), f3 = buildFieldForWindow(win, { maxSlopeDeg: 15 });
  assert.equal(f1, f2); assert.notEqual(f1, f3);
  assert.equal(buildFieldForWindow(win, { maxSlopeDeg: 15 }), f3);
  assert.equal(f3.params.maxSlopeDeg.value, 15);
  assert.ok(Object.isFrozen(f1));
});

test('localToLatLon injection: fake linear adapter and the real adapter', () => {
  const win = makeWin(30, 40, () => -2500);
  const fake = (x, y) => ({ latDeg: 10 + y * 1e-5, lonDeg: 20 + x * 2e-5 });
  const res = planWalkingRoute({ window: win, startLocal: at(win, 5, 5), endLocal: at(win, 5, 20), localToLatLon: fake });
  assert.equal(res.pathLatLon.length, res.path.length);
  res.path.forEach((p, i) => {
    assert.ok(Math.abs(res.pathLatLon[i].latDeg - (10 + p.yM * 1e-5)) < 1e-12);
    assert.ok(Math.abs(res.pathLatLon[i].lonDeg - (20 + p.xM * 2e-5)) < 1e-12);
  });
  assert.equal(planWalkingRoute({ window: win, startLocal: at(win, 5, 5), endLocal: at(win, 5, 20) }).pathLatLon, undefined);
  // Real adapter as core.test.mjs builds it; window placed around the WB1 origin (local 0,0).
  const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
  const w2 = makeWin(40, 50, () => -2500, { nwXM: -25, nwYM: 20, adapter });
  const r2 = planWalkingRoute({ window: w2, startLocal: { xM: 0, yM: 0 }, endLocal: { xM: 10.2, yM: -5.3 } });
  assert.equal(r2.status, 'ok');
  assert.equal(r2.pathLatLon.length, r2.path.length);
  for (let i = 0; i < r2.path.length; i++) {
    const back = adapter.latLonToLocal(r2.pathLatLon[i].latDeg, r2.pathLatLon[i].lonDeg);
    assert.ok(Math.hypot(back.x - r2.path[i].xM, back.y - r2.path[i].yM) < 1e-6);
  }
  const wb1 = adapter.localToLatLon(r2.path[0].xM, r2.path[0].yM);
  assert.ok(Math.abs(wb1.latDeg - WAYPOINTS[0].latDeg) < 1e-4 && Math.abs(wb1.lonDeg - WAYPOINTS[0].lonDeg) < 1e-4);
});
