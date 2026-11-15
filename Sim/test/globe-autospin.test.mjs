import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_SPIN_SECONDS_PER_TURN, AUTO_SPIN_RAD_PER_S, autoSpinStep, pickLatLon } from '../public/js/view/globe/globe.js';

test('otomatik dönüş: 5 sn/tur = 72 derece/sn', () => {
  assert.equal(AUTO_SPIN_SECONDS_PER_TURN, 5);
  assert.ok(Math.abs(AUTO_SPIN_RAD_PER_S * 180 / Math.PI - 72) < 1e-9);
});

test('autoSpinStep: yumuşak hızlanma, sıçrama yok, durunca sıfıra iner', () => {
  let s = 0, prev = 0;
  for (let i = 0; i < 120; i++) { s = autoSpinStep(s, 1 / 60, true); assert.ok(s >= prev && s - prev < 0.05); prev = s; }
  assert.ok(s > 0.8 && s <= 1);
  for (let i = 0; i < 300; i++) s = autoSpinStep(s, 1 / 60, false);
  assert.ok(s < 0.01);
});

test('dönen küre üzerinde ışın-küre seçimi yaw ile tutarlı lat/lon verir', () => {
  const base = { ndcX: 0, ndcY: 0, fovY: 0.8, aspect: 1.5, distance: 3.2, pitch: 0 };
  const a = pickLatLon({ ...base, yaw: 0.4 }), b = pickLatLon({ ...base, yaw: 0.4 + Math.PI / 2 });
  assert.ok(Math.abs(a.lat) < 1e-6 && Math.abs(b.lat) < 1e-6);
  let d = Math.abs(a.lon - b.lon); if (d > 180) d = 360 - d;
  assert.ok(Math.abs(d - 90) < 1e-6, `${a.lon} ${b.lon}`);
});
