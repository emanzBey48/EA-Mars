import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkabilityField, explainCell, STATUS, DEFAULT_COST_PARAMS } from '../public/js/route/cost-model.js';

const ND = -3.4028226550889044e+38; // 0xFF7FFFFB as float32

function grid(rows, cols, fn) {
  const e = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) e[r * cols + c] = fn(r, c);
  return e;
}
const build = (elevation, rows, cols, extra = {}) => buildWalkabilityField({ elevation, rows, cols, cellSizeM: 1, noDataValue: ND, ...extra });
const idx = (cols, r, c) => r * cols + c;

test('flat grid: interior score 100, cost 1; border EDGE_UNKNOWN', () => {
  const f = build(grid(7, 7, () => 100), 7, 7);
  const i = idx(7, 3, 3);
  assert.equal(f.status[i], STATUS.OK);
  assert.equal(f.score[i], 100);
  assert.equal(f.cost[i], 1);
  assert.equal(f.slopeDeg[i], 0);
  assert.equal(f.schema, 'marswalk.cost-field.v1');
});

test('grid edge cells are EDGE_UNKNOWN, impassable, NaN slope', () => {
  const f = build(grid(5, 5, () => 0), 5, 5);
  for (let c = 0; c < 5; c++) for (const r of [0, 4]) {
    const i = idx(5, r, c);
    assert.equal(f.status[i], STATUS.EDGE_UNKNOWN);
    assert.equal(f.cost[i], Infinity); assert.equal(f.score[i], 0); assert.ok(Number.isNaN(f.slopeDeg[i]));
  }
});

test('uniform ramp: slope equals atan(rise/run) and score is monotone non-increasing', () => {
  let prev = 101;
  // Dyadic rises per cell are exact in float32, so the 1e-6 rad bound tests the model, not input quantisation.
  for (const k of [0, 1 / 32, 1 / 16, 1 / 8, 3 / 16, 1 / 4, 5 / 16, 11 / 32]) {
    const deg = Math.atan(k) * 180 / Math.PI;
    const f = build(grid(9, 9, (r, c) => k * c), 9, 9);
    const i = idx(9, 4, 4);
    assert.ok(Math.abs(f.slopeDeg[i] * Math.PI / 180 - Math.atan(k)) < 1e-6, `slope ${deg}`);
    assert.equal(f.roughnessM[i] < 1e-4, true);
    assert.ok(f.score[i] <= prev); prev = f.score[i];
    assert.equal(f.status[i], STATUS.OK);
  }
  assert.ok(prev < 100);
});

test('north-up orientation: surface rising to the north has the same slope as rising to the east', () => {
  const k = 0.2;
  const east = build(grid(7, 7, (r, c) => k * c), 7, 7);
  const north = build(grid(7, 7, (r) => k * (6 - r)), 7, 7);
  assert.ok(Math.abs(east.slopeDeg[idx(7, 3, 3)] - north.slopeDeg[idx(7, 3, 3)]) < 1e-5);
});

test('steep ramp beyond maxSlope -> TOO_STEEP, impassable', () => {
  const k = Math.tan(30 * Math.PI / 180);
  const f = build(grid(7, 7, (r, c) => k * c), 7, 7);
  const i = idx(7, 3, 3);
  assert.equal(f.status[i], STATUS.TOO_STEEP);
  assert.equal(f.cost[i], Infinity); assert.equal(f.score[i], 0);
  assert.ok(Math.abs(f.slopeDeg[i] - 30) < 1e-4);
});

test('step cliff makes the cells beside it TOO_STEEP', () => {
  const f = build(grid(9, 9, (r, c) => (c < 4 ? 0 : 20)), 9, 9);
  assert.equal(f.status[idx(9, 4, 3)], STATUS.TOO_STEEP);
  assert.equal(f.status[idx(9, 4, 4)], STATUS.TOO_STEEP);
  assert.equal(f.status[idx(9, 4, 6)], STATUS.OK);
  assert.equal(f.cost[idx(9, 4, 4)], Infinity);
});

test('no-data island: cell and its 3x3 neighbours become unknown, never passable', () => {
  const f = build(grid(11, 11, (r, c) => (r === 5 && c === 5 ? ND : 10)), 11, 11, { noDataValue: ND });
  assert.equal(f.status[idx(11, 5, 5)], STATUS.NO_DATA);
  for (let r = 4; r <= 6; r++) for (let c = 4; c <= 6; c++) {
    if (r === 5 && c === 5) continue;
    const i = idx(11, r, c);
    assert.equal(f.status[i], STATUS.EDGE_UNKNOWN);
    assert.equal(f.cost[i], Infinity); assert.equal(f.score[i], 0);
    assert.ok(Number.isNaN(f.slopeDeg[i])); assert.ok(Number.isNaN(f.roughnessM[i]));
  }
  assert.equal(f.status[idx(11, 5, 8)], STATUS.OK);
});

test('exact 0xFF7FFFFB float32 value is no-data even without noDataValue rounding issues', () => {
  const bits = new Uint32Array([0xFF7FFFFB]);
  const val = new Float32Array(bits.buffer)[0];
  assert.equal(val, ND);
  const e = grid(7, 7, () => 5); e[idx(7, 3, 3)] = val;
  const f = build(e, 7, 7, { noDataValue: ND });
  assert.equal(f.status[idx(7, 3, 3)], STATUS.NO_DATA);
  assert.equal(f.cost[idx(7, 3, 3)], Infinity);
  // without declaring noData, the finite but huge negative still fails validMin
  const g = build(e, 7, 7, { noDataValue: undefined, validMin: -10000, validMax: 10000 });
  assert.equal(g.status[idx(7, 3, 3)], STATUS.INVALID);
});

test('out-of-coverage mask: unknown cells and their neighbours impassable', () => {
  const mask = new Uint8Array(49).fill(1); mask[idx(7, 3, 3)] = 0;
  const f = build(grid(7, 7, () => 1), 7, 7, { coverageMask: mask });
  assert.equal(f.status[idx(7, 3, 3)], STATUS.OUT_OF_COVERAGE);
  assert.equal(f.status[idx(7, 2, 2)], STATUS.EDGE_UNKNOWN);
  assert.equal(f.cost[idx(7, 3, 3)], Infinity);
  assert.equal(f.cost[idx(7, 3, 5)] , 1);
});

test('NaN / Infinity / out-of-range input is INVALID and never 0-filled', () => {
  const e = grid(7, 7, () => 3); e[idx(7, 3, 3)] = NaN; e[idx(7, 1, 1)] = 1e9;
  const f = build(e, 7, 7, { validMin: -9000, validMax: 25000 });
  assert.equal(f.status[idx(7, 3, 3)], STATUS.INVALID);
  assert.equal(f.status[idx(7, 1, 1)], STATUS.INVALID);
  assert.equal(f.status[idx(7, 3, 4)], STATUS.EDGE_UNKNOWN);
  const inf = grid(7, 7, () => 3); inf[idx(7, 3, 3)] = Infinity;
  assert.equal(build(inf, 7, 7).status[idx(7, 3, 3)], STATUS.INVALID);
});

test('roughness: noisy flat terrain scores lower and costs more than smooth flat', () => {
  const smooth = build(grid(9, 9, () => 0), 9, 9);
  const rough = build(grid(9, 9, (r, c) => ((r * 7 + c * 13) % 5) * 0.2), 9, 9);
  const i = idx(9, 4, 4);
  assert.ok(rough.roughnessM[i] > 0);
  assert.ok(rough.score[i] < smooth.score[i]);
  assert.ok(rough.cost[i] > smooth.cost[i]);
});

test('parameter validation throws TypeError', () => {
  const e = grid(5, 5, () => 0);
  const bad = [
    [{ maxSlopeDeg: NaN }, /sonlu sayı/], [{ maxSlopeDeg: -1 }, /aralık dışı/], [{ maxSlopeDeg: 90 }, /aralık dışı/],
    [{ comfortableSlopeDeg: 25 }, /comfortableSlopeDeg < maxSlopeDeg/], [{ comfortableSlopeDeg: 20 }, /comfortableSlopeDeg < maxSlopeDeg/],
    [{ roughnessRefM: 0 }, /aralık dışı/], [{ costK: -1 }, /aralık dışı/], [{ costP: 0 }, /aralık dışı/],
    [{ nope: 1 }, /Bilinmeyen parametre/], [{ maxSlopeDeg: { value: 'x' } }, /sonlu sayı/],
    [{ maxSlopeDeg: { value: 20, status: 'bogus' } }, /status/], [{ maxSlopeDeg: { foo: 1 } }, /Bilinmeyen alan/],
    [5, /params bir nesne/], [[], /params bir nesne/],
  ];
  for (const [p, re] of bad) assert.throws(() => build(e, 5, 5, { params: p }), { name: 'TypeError', message: re }, JSON.stringify(p));
  assert.throws(() => buildWalkabilityField({ elevation: new Float32Array(3), rows: 5, cols: 5, cellSizeM: 1 }), { name: 'TypeError', message: /elevation uzunluğu/ });
  assert.throws(() => buildWalkabilityField({ elevation: e, rows: 5, cols: 5, cellSizeM: 0 }), { name: 'TypeError', message: /cellSizeM/ });
  assert.throws(() => build(e, 5, 5, { coverageMask: new Uint8Array(3) }), { name: 'TypeError', message: /coverageMask uzunluğu/ });
  assert.throws(() => build(e, 5, 5, { coverageMask: 'x'.repeat(25) }), { name: 'TypeError', message: /coverageMask dizi/ });
});

test('params override changes score monotonically; defaults not mutated', () => {
  const snapshot = JSON.stringify(DEFAULT_COST_PARAMS);
  const k = Math.tan(12 * Math.PI / 180);
  const e = grid(9, 9, (r, c) => k * c);
  const i = idx(9, 4, 4);
  let prev = -1;
  for (const m of [14, 18, 25, 35]) {
    const f = build(e, 9, 9, { params: { maxSlopeDeg: m } });
    assert.ok(f.score[i] >= prev); prev = f.score[i];
    assert.equal(f.params.maxSlopeDeg.value, m);
    assert.equal(f.params.maxSlopeDeg.status, 'scenario');
  }
  const a = build(e, 9, 9, { params: { comfortableSlopeDeg: 4 } });
  const b = build(e, 9, 9, { params: { comfortableSlopeDeg: 11 } });
  assert.ok(b.score[i] >= a.score[i]);
  const c1 = build(e, 9, 9, { params: { costK: 3 } }), c2 = build(e, 9, 9, { params: { costK: 20 } });
  assert.ok(c2.cost[i] > c1.cost[i]);
  assert.equal(JSON.stringify(DEFAULT_COST_PARAMS), snapshot);
});

test('params and provenance are frozen; every default leaf has value/unit/status/source', () => {
  const f = build(grid(5, 5, () => 0), 5, 5);
  assert.ok(Object.isFrozen(f.params) && Object.isFrozen(f.params.maxSlopeDeg) && Object.isFrozen(f.provenance));
  assert.ok(Object.isFrozen(DEFAULT_COST_PARAMS) && Object.isFrozen(DEFAULT_COST_PARAMS.costK));
  assert.throws(() => { 'use strict'; f.params.maxSlopeDeg.value = 99; }, TypeError);
  for (const p of Object.values(DEFAULT_COST_PARAMS)) {
    assert.ok(Number.isFinite(p.value)); assert.ok(p.unit); assert.ok(['sourced', 'scenario'].includes(p.status)); assert.ok(p.source);
  }
  assert.equal(DEFAULT_COST_PARAMS.marsGravityMps2.value, 3.71);
  assert.match(f.provenance.caveatEN, /not a safety certificate/);
  assert.match(f.provenance.caveatTR, /güvenlik sertifikası değildir/);
});

test('deterministic: repeated calls give deepEqual output', () => {
  const e = grid(15, 15, (r, c) => Math.sin(r * 0.7) * 2 + Math.cos(c * 0.4) * 3);
  const a = build(e, 15, 15), b = build(e, 15, 15);
  for (const key of ['cost', 'score', 'status', 'slopeDeg', 'roughnessM']) assert.deepEqual(a[key], b[key]);
  assert.deepEqual(a.params, b.params);
});

test('explainCell breakdown is consistent with arrays', () => {
  const k = Math.tan(14 * Math.PI / 180);
  const f = build(grid(9, 9, (r, c) => k * c + (r % 2) * 0.1), 9, 9);
  const x = explainCell(f, 4, 4);
  assert.equal(x.statusName, 'OK');
  const [sl, ro, sc, co] = x.components;
  assert.equal(Math.round(100 * sl.contribution * ro.contribution), x.score);
  assert.equal(sc.contribution, x.score);
  assert.ok(Math.abs(co.contribution - x.cost) < 1e-5);
  // property checks instead of re-implementing the formula
  assert.ok(sl.contribution > 0 && sl.contribution <= 1 && ro.contribution > 0 && ro.contribution <= 1);
  assert.ok(x.cost >= 1 && x.cost <= 1 + f.params.costK.value);
  assert.ok(x.score >= 0 && x.score <= 100);
  assert.match(x.caveat, /Planlama göstergesi/);
  assert.equal(x.caveatTR, x.caveat);
  assert.match(x.caveatEN, /not a safety certificate/);
  const edge = explainCell(f, 0, 0);
  assert.equal(edge.statusName, 'EDGE_UNKNOWN'); assert.equal(edge.cost, Infinity);
  assert.equal(edge.components.length, 1);
  const steep = explainCell(build(grid(7, 7, (r, c) => 2 * c), 7, 7), 3, 3);
  assert.equal(steep.statusName, 'TOO_STEEP'); assert.equal(steep.cost, Infinity);
  assert.throws(() => explainCell(f, -1, 0), TypeError);
  assert.throws(() => explainCell(f, 0, 99), TypeError);
});

test('cost is >= 1 and finite for every passable cell, Infinity otherwise', () => {
  const e = grid(30, 30, (r, c) => Math.sin(r * 0.5) * 6 + Math.cos(c * 0.3) * 6);
  const f = build(e, 30, 30);
  for (let i = 0; i < e.length; i++) {
    if (f.status[i] === STATUS.OK) { assert.ok(Number.isFinite(f.cost[i]) && f.cost[i] >= 1); assert.ok(f.score[i] >= 0 && f.score[i] <= 100); }
    else { assert.equal(f.cost[i], Infinity); assert.equal(f.score[i], 0); }
  }
});

test('performance: 1676x1135 grid', () => {
  const rows = 1135, cols = 1676;
  const e = grid(rows, cols, (r, c) => Math.sin(r * 0.01) * 20 + Math.cos(c * 0.013) * 15 + ((r * 31 + c * 17) % 7) * 0.02);
  const t0 = performance.now();
  const f = build(e, rows, cols);
  const ms = performance.now() - t0;
  console.log(`# cost-model 1676x1135: ${ms.toFixed(0)} ms`);
  assert.equal(f.status.length, rows * cols);
  assert.ok(ms < 10000, `too slow: ${ms}`); // generous bound for CI noise; the audit reports the measured value
});

// ---------------------------------------------------------------------------------------------
// Audit-fix tests (findings 1-6, 12)
// ---------------------------------------------------------------------------------------------

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('plane rising in six gradient directions: roughness ~0, direction-independent slope = atan(|g|)', () => {
  // z = gx*col + gy*(rows-1-row): +gx rises east, +gy rises north. All gradients have magnitude 0.2.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.3, 0.9]];
  const expectDeg = Math.atan(0.2) * 180 / Math.PI;
  for (const [dx, dy] of dirs) {
    const m = Math.hypot(dx, dy);
    const gx = 0.2 * dx / m, gy = 0.2 * dy / m;
    const f = build(grid(9, 9, (r, c) => gx * c + gy * (8 - r)), 9, 9);
    for (const [r, c] of [[4, 4], [2, 6], [6, 3]]) {
      const i = idx(9, r, c);
      assert.equal(f.status[i], STATUS.OK, `dir ${dx},${dy}`);
      assert.ok(f.roughnessM[i] < 1e-5, `roughness ${f.roughnessM[i]} dir ${dx},${dy}`);
      assert.ok(Math.abs(f.slopeDeg[i] - expectDeg) < 1e-4, `slope ${f.slopeDeg[i]} dir ${dx},${dy}`);
    }
  }
});

test('plane with both gx and gy nonzero: roughness ~0 (a dy sign flip would make it non-zero), slope = atan(hypot)', () => {
  for (const [gx, gy] of [[0.125, 0.09375], [-0.125, 0.09375], [0.125, -0.09375], [-0.125, -0.09375]]) {
    const f = build(grid(9, 9, (r, c) => gx * c + gy * (8 - r)), 9, 9);
    const i = idx(9, 4, 4);
    assert.ok(f.roughnessM[i] < 1e-6, `roughness ${f.roughnessM[i]}`);
    assert.ok(Math.abs(f.slopeDeg[i] - Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI) < 1e-4);
  }
  // sanity of the detector: an anti-plane (gy mirrored in the north direction only on one half) must be rough
  const kink = build(grid(9, 9, (r, c) => 0.125 * c + 0.09375 * Math.abs(4 - r)), 9, 9);
  assert.ok(kink.roughnessM[idx(9, 4, 4)] > 1e-3);
});

test('cellSizeM = 5: ramp slope is atan(rise/5), roughness ~0', () => {
  const f = buildWalkabilityField({ elevation: grid(9, 9, (r, c) => c), rows: 9, cols: 9, cellSizeM: 5, noDataValue: ND });
  const i = idx(9, 4, 4);
  assert.ok(Math.abs(f.slopeDeg[i] - Math.atan(1 / 5) * 180 / Math.PI) < 1e-4);
  assert.ok(f.roughnessM[i] < 1e-6);
  assert.equal(f.cellSizeM, 5);
});

test('cost/score are monotone in slope and in roughness; cost within [1, 1+costK]', () => {
  const costK = DEFAULT_COST_PARAMS.costK.value;
  let pc = 0, ps = 101;
  for (let deg = 0; deg < 19.9; deg += 0.7) {
    const f = build(grid(9, 9, (r, c) => Math.tan(deg * Math.PI / 180) * c), 9, 9);
    const i = idx(9, 4, 4);
    assert.equal(f.status[i], STATUS.OK);
    assert.ok(f.cost[i] >= pc && f.cost[i] >= 1 && f.cost[i] <= 1 + costK, `deg ${deg} cost ${f.cost[i]}`);
    assert.ok(f.score[i] <= ps);
    pc = f.cost[i]; ps = f.score[i];
  }
  pc = 0; ps = 101;
  for (const amp of [0, 0.02, 0.05, 0.1, 0.3, 1]) {
    const f = build(grid(9, 9, (r, c) => ((r + c) % 2) * amp), 9, 9);
    const i = idx(9, 4, 4);
    assert.ok(f.cost[i] >= pc && f.score[i] <= ps, `amp ${amp}`);
    pc = f.cost[i]; ps = f.score[i];
  }
  assert.ok(pc > 1 && ps < 100);
});

test('randomised invariant: OK cells have a fully clean 3x3 window; every cell touching an unknown is non-OK', () => {
  const VMIN = -100, VMAX = 100;
  for (let seed = 1; seed <= 25; seed++) {
    const rnd = mulberry32(seed);
    const rows = 30, cols = 28, n = rows * cols;
    const e = grid(rows, cols, (r, c) => Math.sin(r * 0.2 + seed) + Math.cos(c * 0.17) + (rnd() - 0.5) * 0.01);
    const mask = new Uint8Array(n).fill(1);
    const kinds = [() => NaN, () => Infinity, () => -Infinity, () => ND, () => 1e9, () => -1e9];
    for (let k = 0; k < Math.floor(n * 0.02); k++) {
      const i = Math.floor(rnd() * n);
      if (rnd() < 0.2) mask[i] = 0; else e[i] = kinds[Math.floor(rnd() * kinds.length)]();
    }
    const f = build(e, rows, cols, { noDataValue: ND, validMin: VMIN, validMax: VMAX, coverageMask: mask });
    const bad = (i) => mask[i] !== 1 || !Number.isFinite(e[i]) || e[i] === ND || e[i] < VMIN || e[i] > VMAX;
    let okCount = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = idx(cols, r, c);
      let windowClean = r > 0 && c > 0 && r < rows - 1 && c < cols - 1;
      if (windowClean) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (bad(idx(cols, r + a, c + b))) windowClean = false;
      if (f.status[i] === STATUS.OK) {
        okCount++;
        assert.ok(windowClean, `seed ${seed} cell ${r},${c} OK with unclean window`);
        assert.ok(Number.isFinite(f.cost[i]) && f.cost[i] >= 1);
      } else {
        assert.equal(f.cost[i], Infinity); assert.equal(f.score[i], 0);
        if (!windowClean) assert.notEqual(f.status[i], STATUS.OK);
      }
      // gentle terrain: a clean window must yield an OK cell (otherwise the invariant above would be vacuous)
      if (windowClean) assert.equal(f.status[i], STATUS.OK, `seed ${seed} cell ${r},${c}`);
    }
    assert.ok(okCount / n > 0.3, `seed ${seed}: OK fraction ${okCount / n}`);
  }
});

test('finding 1: coverageMask only 1/true counts as covered (false/null/NaN/undefined/2 -> OUT_OF_COVERAGE)', () => {
  const e = grid(7, 7, () => 1), c = idx(7, 3, 3);
  for (const bad of [false, null, NaN, undefined, 0, 2, '1']) {
    const mask = new Array(49).fill(true); mask[c] = bad;
    const f = build(e, 7, 7, { coverageMask: mask });
    assert.equal(f.status[c], STATUS.OUT_OF_COVERAGE, `value ${String(bad)}`);
    assert.equal(f.cost[c], Infinity); assert.equal(f.score[c], 0);
    assert.equal(f.status[idx(7, 3, 4)], STATUS.EDGE_UNKNOWN);
  }
  const ok = build(e, 7, 7, { coverageMask: new Array(49).fill(true) });
  assert.equal(ok.status[c], STATUS.OK);
  const okNum = build(e, 7, 7, { coverageMask: new Float32Array(49).fill(1) });
  assert.equal(okNum.status[c], STATUS.OK);
  const nan = new Float32Array(49).fill(1); nan[c] = NaN;
  assert.equal(build(e, 7, 7, { coverageMask: nan }).status[c], STATUS.OUT_OF_COVERAGE);
});

test('finding 2: noDataValue matches Float64 and Float32 inputs (non float32-exact sentinel -9999.1)', () => {
  const f64 = new Float64Array(49).fill(-9999.1);
  assert.equal(build(f64, 7, 7, { noDataValue: -9999.1 }).status[idx(7, 3, 3)], STATUS.NO_DATA);
  const f32 = new Float32Array(49).fill(-9999.1);
  assert.equal(build(f32, 7, 7, { noDataValue: -9999.1 }).status[idx(7, 3, 3)], STATUS.NO_DATA);
  const arr = new Array(49).fill(-9999.1);
  assert.equal(build(arr, 7, 7, { noDataValue: -9999.1 }).status[idx(7, 3, 3)], STATUS.NO_DATA);
  // ordinary terrain stays valid when a sentinel is declared
  assert.equal(build(new Float64Array(49).fill(12.5), 7, 7, { noDataValue: -9999.1 }).status[idx(7, 3, 3)], STATUS.OK);
});

test('finding 3: unknown-data metadata is required; declared metadata carries no warning', () => {
  assert.throws(() => build(grid(5, 5, () => -9999), 5, 5, { noDataValue: undefined }), {
    name: 'TypeError', message: /noDataValue, validMin ve validMax veya coverageMask/,
  });
  for (const extra of [{ noDataValue: -9999 }, { validMin: -10, validMax: 10 }]) {
    const f = build(grid(5, 5, () => 0), 5, 5, extra);
    assert.deepEqual(f.provenance.warnings, []);
    assert.ok(Object.isFrozen(f.provenance.warnings));
    assert.equal(f.provenance.model, 'marswalk-eva-walkability');
  }
  const mask = new Uint8Array(25).fill(1); mask[idx(5, 2, 2)] = 0;
  const masked = build(grid(5, 5, () => -9999), 5, 5, { coverageMask: mask });
  assert.equal(masked.status[idx(5, 2, 2)], STATUS.OUT_OF_COVERAGE);
});

test('finding 4: non-finite / non-number validMin, validMax, noDataValue throw TypeError; validMin > validMax too', () => {
  const e = grid(5, 5, () => 0);
  const cases = [
    [{ validMin: '-10' }, /validMin/], [{ validMin: NaN }, /validMin/], [{ validMin: null }, /validMin/], [{ validMin: -Infinity }, /validMin/],
    [{ validMax: '10' }, /validMax/], [{ validMax: NaN }, /validMax/], [{ validMax: null }, /validMax/],
    [{ noDataValue: '-9999' }, /noDataValue/], [{ noDataValue: NaN }, /noDataValue/], [{ noDataValue: null }, /noDataValue/], [{ noDataValue: Infinity }, /noDataValue/],
    [{ validMin: 5, validMax: 1 }, /validMin <= validMax/],
  ];
  for (const [extra, re] of cases) assert.throws(() => build(e, 5, 5, extra), { name: 'TypeError', message: re }, JSON.stringify(extra));
  // undefined = not provided; equal bounds are legal
  assert.throws(() => build(e, 5, 5, { validMin: undefined, validMax: undefined, noDataValue: undefined }), /noDataValue, validMin ve validMax veya coverageMask/);
  assert.throws(() => build(e, 5, 5, { noDataValue: undefined, validMin: 0 }), /noDataValue, validMin ve validMax veya coverageMask/);
  assert.doesNotThrow(() => build(e, 5, 5, { validMin: 0, validMax: 0 }));
});

test('finding 5: boundary cells equal to the float32 of validMin/validMax are accepted', () => {
  const flat = grid(7, 7, () => 0.1); // float32(0.1) > double 0.1
  assert.ok(flat[0] !== 0.1);
  assert.equal(build(flat, 7, 7, { validMax: 0.1 }).status[idx(7, 3, 3)], STATUS.OK);
  const flat2 = grid(7, 7, () => 0.3); // float32(0.3) < double 0.3
  assert.equal(build(flat2, 7, 7, { validMin: 0.3 }).status[idx(7, 3, 3)], STATUS.OK);
  // genuinely outside still rejected
  assert.equal(build(grid(7, 7, () => 0.2), 7, 7, { validMax: 0.1 }).status[idx(7, 3, 3)], STATUS.INVALID);
});

test('finding 6: overrides are always scenario with a fixed source; explicit sourced status is rejected', () => {
  const e = grid(5, 5, () => 0);
  assert.throws(() => build(e, 5, 5, { params: { maxSlopeDeg: { value: 20, status: 'sourced', source: 'NASA' } } }),
    { name: 'TypeError', message: /scenario/ });
  assert.throws(() => build(e, 5, 5, { params: { marsGravityMps2: { status: 'sourced' } } }), { name: 'TypeError', message: /scenario/ });
  const f = build(e, 5, 5, { params: { maxSlopeDeg: { value: 18, source: 'NASA-STD-9999', note: 'deneme' }, costK: 4, marsGravityMps2: { value: 3.72 } } });
  for (const k of ['maxSlopeDeg', 'costK', 'marsGravityMps2']) {
    assert.equal(f.params[k].status, 'scenario');
    assert.equal(f.params[k].source, 'Kullanıcı geçersiz kılma (senaryo)');
  }
  assert.match(f.params.maxSlopeDeg.note, /deneme/);
  assert.match(f.params.maxSlopeDeg.note, /doğrulanmadı/);
  // defaults untouched and still sourced only where intended
  assert.equal(DEFAULT_COST_PARAMS.marsGravityMps2.status, 'sourced');
  assert.match(DEFAULT_COST_PARAMS.marsGravityMps2.source, /planet-compare\/\?intent=121/);
  assert.match(DEFAULT_COST_PARAMS.roughnessRefM.source, /kalibrasyon yok/);
  assert.equal(f.params.comfortableSlopeDeg.status, 'scenario');
});
