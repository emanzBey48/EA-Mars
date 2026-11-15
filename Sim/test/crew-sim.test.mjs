import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewSim } from '../public/js/simulation/crew-sim.js';
import { chaikinSmooth } from '../public/js/simulation/path-smooth-local.js';

const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

test('count=1 -> bos liste', () => {
  assert.deepEqual(createCrewSim({ polyline: line, count: 1 }).getPositions(), []);
});

test('yoldaslar senaryo hiziyla ilerler, oyuncu haric', () => {
  const c = createCrewSim({ polyline: line, count: 3, followIndex: 1, speedMps: 1.2, autoLayout: false });
  const p0 = c.getPositions();
  assert.deepEqual(p0.map((p) => p.label), ['K1', 'K3']);
  c.update(10, 1);
  assert.ok(Math.abs(c.getPositions()[0].xM - 12) < 1e-9);
});

test('hiz carpani uygulanir, 0 durdurur', () => {
  const c = createCrewSim({ polyline: line, count: 2, speedMps: 1, autoLayout: false });
  c.update(10, 5);
  assert.ok(Math.abs(c.getPositions()[0].xM - 50) < 1e-9);
  c.update(10, 0);
  assert.ok(Math.abs(c.getPositions()[0].xM - 50) < 1e-9);
});

test('rota bitince son noktada durur', () => {
  const c = createCrewSim({ polyline: line, count: 2, speedMps: 1, autoLayout: false });
  c.update(1000, 10);
  const p = c.getPositions()[0];
  assert.equal(p.xM, 100);
  assert.equal(p.remainingM, 0);
  assert.equal(p.arrived, true);
});

test('baslangic ofsetleri ve yanal ofset', () => {
  const c = createCrewSim({ polyline: line, count: 3, offsetsM: [10, { arcM: 0, lateralM: 2 }], autoLayout: false });
  const [a, b] = c.getPositions();
  assert.equal(a.xM, 10);
  assert.equal(b.yM, 2);
});

test('replan: yoldas yeni rotaya izdusurulur', () => {
  const c = createCrewSim({ polyline: line, count: 2, speedMps: 1, autoLayout: false });
  c.update(30, 1);
  c.setPolyline([{ x: 30, y: 0 }, { x: 30, y: 50 }]);
  const p = c.getPositions()[0];
  assert.ok(Math.abs(p.xM - 30) < 1e-9 && Math.abs(p.yM) < 1e-9);
});

test('chaikin uclari sabit tutar ve kosegi yumusatir', () => {
  const s = chaikinSmooth([{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 10 }], { iterations: 2 });
  assert.deepEqual([s[0].x, s[0].y], [0, 0]);
  assert.deepEqual([s.at(-1).x, s.at(-1).y], [10, 10]);
  assert.ok(s.length > 3);
  assert.ok(!s.some((p) => p.x === 10 && p.y === 0));
});

const dist = (a, b) => Math.hypot(a.xM - b.xM, a.yM - b.yM);

test('birlikte mod: yoldaslar yol dogrusuna dik 4-7 m yan ve geride, birbirinden ayrisir', () => {
  const c = createCrewSim({ polyline: line, count: 4, offsetsM: [0, 0, 0].map((a) => ({ arcM: a, lateralM: 2.5 })) });
  c.update(30, 1);
  const ps = c.getPositions();
  const lead = 30 * 1.2; // oyuncu ~ ayni hizla (36 m)
  for (const p of ps) {
    assert.ok(Math.abs(p.yM) >= 4 - 1e-9 && Math.abs(p.yM) <= 7 + 1e-9, `yan ${p.yM}`);
    const back = lead - p.xM;
    assert.ok(back >= 3 - 1e-9 && back <= 6 + 1e-9, `arka ${back}`);
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(dist(ps[i], ps[j]) > 3);
});

test('birlikte mod: koseden donerken ofset sicramaz (kare basina < 1 m)', () => {
  const L = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }];
  const c = createCrewSim({ polyline: L, count: 3, speedMps: 1.2 });
  let prev = c.getPositions();
  let maxStep = 0;
  for (let i = 0; i < 1500; i++) {
    c.update(0.1, 1);
    const now = c.getPositions();
    now.forEach((p, k) => { maxStep = Math.max(maxStep, dist(p, prev[k])); });
    prev = now;
  }
  assert.ok(maxStep < 1, `maxStep ${maxStep}`);
});

test('ayri mod: yoldaslar oyuncudan 15-60 m onde baslar', () => {
  const c = createCrewSim({ polyline: line, count: 4, offsetsM: [{ arcM: 20 }, { arcM: 40 }, { arcM: 60 }] });
  const xs = c.getPositions().map((p) => p.xM);
  assert.deepEqual(xs.map((x) => Math.round(x)), [20, 40, 60]);
  const far = createCrewSim({ polyline: line, count: 2, offsetsM: [{ arcM: 500 }] });
  assert.equal(far.getPositions()[0].xM, 60);
});

test('bitis: yoldaslar ust uste binmez (halka yerlesimi)', () => {
  const c = createCrewSim({ polyline: line, count: 5, speedMps: 1 });
  c.update(1000, 10);
  const ps = c.getPositions();
  assert.ok(ps.every((p) => p.arrived));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(dist(ps[i], ps[j]) > 2, `${i}-${j}`);
  for (const p of ps) assert.ok(Math.abs(Math.hypot(p.xM - 100, p.yM) - 4) < 1e-6);
});
