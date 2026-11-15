import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAutoDrive, nearestPointOnPolyline, polylineLengthM, clampSpeedMultiplier, shortestAngleDelta,
} from '../public/js/simulation/auto-drive.js';

const L = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }];

// Basit kinematik: sim'in stepFirstPerson'una benzer, sabit hizda yurur.
function simulate(drive, start, yaw0, { steps = 5000, dt = 0.05, speed = 1.2 * 8 } = {}) {
  const pos = { ...start };
  let yaw = yaw0;
  let last = null;
  for (let i = 0; i < steps; i++) {
    last = drive.update(dt, pos, yaw);
    yaw = last.steerYawRad;
    if (last.forward) { pos.x += Math.cos(yaw) * speed * dt; pos.y += Math.sin(yaw) * speed * dt; }
    if (last.arrived) return { pos, yaw, last, steps: i + 1 };
  }
  return { pos, yaw, last, steps };
}

test('en yakin nokta: dik izdusum, uc kenetleme, yay uzunlugu', () => {
  const n = nearestPointOnPolyline(L, { x: 30, y: 5 });
  assert.deepEqual(n.point, { x: 30, y: 0 });
  assert.equal(n.index, 0);
  assert.equal(n.t, 0.5);
  assert.equal(n.distanceM, 5);
  assert.equal(n.arcM, 30);
  const c = nearestPointOnPolyline(L, { x: -10, y: 0 });
  assert.deepEqual(c.point, { x: 0, y: 0 });
  assert.equal(c.t, 0);
  const s = nearestPointOnPolyline(L, { x: 70, y: 30 });
  assert.equal(s.index, 1);
  assert.equal(s.arcM, 90);
  assert.equal(nearestPointOnPolyline([], { x: 0, y: 0 }), null);
  assert.equal(polylineLengthM(L), 120);
});

test('planlayici xM/yM bicimi kabul edilir', () => {
  const n = nearestPointOnPolyline([{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }], { xM: 5, yM: 2 });
  assert.equal(n.distanceM, 2);
});

test('20 m esigi: 19.9 -> rejoin-line, 20.1 -> replan', () => {
  const d = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
  const a = d.engage({ x: 50, y: 19.9 });
  assert.equal(a.action, 'rejoin-line');
  assert.deepEqual(a.snapPoint, { x: 50, y: 0 });
  assert.equal(a.pathIndex, 0);
  assert.ok(Math.abs(a.distanceM - 19.9) < 1e-9);
  const b = d.engage({ x: 50, y: 20.1 });
  assert.equal(b.action, 'replan');
  assert.ok(Math.abs(b.distanceM - 20.1) < 1e-9);
});

test('rejoin-line: once cizgiye yaklasir (approaching-line) sonra following', () => {
  const d = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
  d.setEnabled(true);
  d.engage({ x: 50, y: 10 });
  const r = simulate(d, { x: 50, y: 10 }, 0, { steps: 20, dt: 0.05 });
  assert.ok(['approaching-line', 'following'].includes(r.last.phase));
  const first = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
  first.setEnabled(true);
  first.engage({ x: 50, y: 10 });
  assert.equal(first.update(0.05, { x: 50, y: 10 }, 0).phase, 'approaching-line');
});

test('L sekilli rotada 5000 adimda varis (tek parca ve cok noktali)', () => {
  const d = createAutoDrive({ routePolyline: L });
  d.setEnabled(true);
  assert.equal(d.engage({ x: 0, y: 0 }).action, 'rejoin-line');
  const r = simulate(d, { x: 0, y: 0 }, 0);
  assert.equal(r.last.arrived, true);
  assert.equal(r.last.phase, 'arrived');
  assert.ok(r.steps < 5000);
  assert.ok(Math.hypot(r.pos.x - 60, r.pos.y - 60) <= 3.5);

  const single = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 80, y: 30 }] });
  single.setEnabled(true);
  single.engage({ x: 0, y: 0 });
  const r2 = simulate(single, { x: 0, y: 0 }, Math.PI, { steps: 5000 }); // ters yonde baslar
  assert.equal(r2.last.arrived, true);
});

test('rotadan 12 m uzakta baslayip yine varir', () => {
  const d = createAutoDrive({ routePolyline: L });
  d.setEnabled(true);
  assert.equal(d.engage({ x: 20, y: 12 }).action, 'rejoin-line');
  const r = simulate(d, { x: 20, y: 12 }, 1, { steps: 5000 });
  assert.equal(r.last.arrived, true);
});

test('yumusak donus: kare basina yaw degisimi maxYawRate * dt ile sinirli', () => {
  const d = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 100, y: 0 }], maxYawRateRadPerS: 2 });
  d.setEnabled(true);
  d.engage({ x: 0, y: 0 });
  const u = d.update(0.1, { x: 0, y: 0 }, Math.PI / 2);
  assert.ok(Math.abs(shortestAngleDelta(Math.PI / 2, u.steerYawRad)) <= 2 * 0.1 + 1e-12);
});

test('duraklatma: forward=false, carpan 0; devam edince geri gelir', () => {
  const d = createAutoDrive({ routePolyline: L });
  d.setEnabled(true);
  d.engage({ x: 0, y: 0 });
  d.setSpeedMultiplier(4);
  assert.equal(d.update(0.05, { x: 0, y: 0 }, 0).forward, true);
  d.setPaused(true);
  assert.equal(d.isPaused(), true);
  const u = d.update(0.05, { x: 0, y: 0 }, 0);
  assert.equal(u.forward, false);
  assert.equal(u.steerYawRad, 0);
  assert.equal(d.effectiveTimeScaleMultiplier(), 0);
  d.setPaused(false);
  assert.equal(d.effectiveTimeScaleMultiplier(), 4);
});

test('hiz kenetleme 0.5..10, adim 0.5', () => {
  assert.equal(clampSpeedMultiplier(0), 0.5);
  assert.equal(clampSpeedMultiplier(0.2), 0.5);
  assert.equal(clampSpeedMultiplier(1.2), 1);
  assert.equal(clampSpeedMultiplier(1.3), 1.5);
  assert.equal(clampSpeedMultiplier(10), 10);
  assert.equal(clampSpeedMultiplier(99), 10);
  assert.equal(clampSpeedMultiplier(NaN), 1);
  const d = createAutoDrive({});
  assert.equal(d.setSpeedMultiplier(7.3), 7.5);
  assert.equal(d.getSpeedMultiplier(), 7.5);
});

test('varis: arrived kalici, forward=false, progressFrac=1; devre disi -> idle', () => {
  const d = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
  d.setEnabled(true);
  d.engage({ x: 0, y: 0 });
  const u = d.update(0.05, { x: 9, y: 0 }, 0);
  assert.equal(u.arrived, true);
  assert.equal(u.forward, false);
  assert.equal(u.progressFrac, 1);
  assert.equal(d.update(0.05, { x: 0, y: 0 }, 0).arrived, true); // kalici
  const off = createAutoDrive({ routePolyline: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
  off.engage({ x: 0, y: 0 });
  assert.equal(off.update(0.05, { x: 0, y: 0 }, 0).forward, false); // setEnabled(false)
});

test('bos/tek noktali rota: replan, update guvenli', () => {
  const d = createAutoDrive({ routePolyline: [{ x: 1, y: 1 }] });
  d.setEnabled(true);
  assert.equal(d.engage({ x: 0, y: 0 }).action, 'replan');
  assert.equal(d.update(0.05, { x: 0, y: 0 }, 0).forward, false);
});

test('shortestAngleDelta sarmalama', () => {
  assert.ok(Math.abs(shortestAngleDelta(3, -3) - (2 * Math.PI - 6)) < 1e-12);
  assert.ok(Math.abs(shortestAngleDelta(-3, 3) + (2 * Math.PI - 6)) < 1e-12);
});
