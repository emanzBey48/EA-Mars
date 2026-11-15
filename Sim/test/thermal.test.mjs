import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDA_DIURNAL_KNOTS,
  interpolateDiurnalTemps,
  formatLmst,
  createThermalModel,
  DEFAULT_THERMAL_SNAPSHOT,
  MARS_SOLAR_HOUR_SECONDS,
} from '../public/js/surface/thermal.js';

test('interpolateDiurnalTemps matches known MEDA extrema and reference points', () => {
  // Midnight
  const t0 = interpolateDiurnalTemps(0);
  assert.equal(t0.groundC, -78.4);
  assert.equal(t0.airC, -79.1);

  // Minimum before dawn (05:30)
  const tDawn = interpolateDiurnalTemps(5.5);
  assert.equal(tDawn.groundC, -84.6);
  assert.equal(tDawn.airC, -84.2);

  // Peak midday sun (13:00)
  const tNoon = interpolateDiurnalTemps(13.0);
  assert.equal(tNoon.groundC, 7.2);
  assert.equal(tNoon.airC, -22.4);

  // Sim reference (15:00)
  const tRef = interpolateDiurnalTemps(15.0);
  assert.equal(tRef.groundC, -9.8);
  assert.equal(tRef.airC, -28.9);

  // Intermediate interpolation between 11:00 (-8.4 C) and 13:00 (7.2 C) at 12:00
  const t12 = interpolateDiurnalTemps(12.0);
  assert.ok(t12.groundC > -8.4 && t12.groundC < 7.2);
  assert.ok(t12.airC > -32.6 && t12.airC < -22.4);

  // Modulo wrap around > 24h
  const t24 = interpolateDiurnalTemps(24.0);
  assert.equal(t24.groundC, -78.4);
});

test('formatLmst formats hours cleanly', () => {
  assert.equal(formatLmst(15.0), '15:00 LMST');
  assert.equal(formatLmst(16.5), '16:30 LMST');
  assert.equal(formatLmst(5.75), '05:45 LMST');
});

test('createThermalModel produces consistent and physically sound samples', () => {
  const model = createThermalModel();

  // Initial reference sample at t = 0
  const s0 = model.sample({ simTimeS: 0, elevationM: -2540, slopeDeg: 2 });
  assert.equal(s0.status, 'ok');
  assert.equal(s0.sol, 120);
  assert.equal(s0.lmstString, '15:00 LMST');
  assert.equal(s0.pressureMbar, 7.54);
  assert.equal(s0.isRealData, true);
  assert.ok(s0.groundTempC < 0, 'Late afternoon ground temp is sub-zero');
  assert.ok(s0.airTempC < s0.groundTempC, 'Air is colder than ground in late afternoon');

  // After 1 Mars solar hour (~3699s)
  const s1 = model.sample({ simTimeS: MARS_SOLAR_HOUR_SECONDS, elevationM: -2540 });
  assert.equal(s1.lmstString, '16:00 LMST');
  assert.ok(s1.groundTempC < s0.groundTempC, 'Temperature drops toward evening');

  // Elevation barometric effect: higher elevation has lower atmospheric pressure
  const sHigh = model.sample({ simTimeS: 0, elevationM: -2400 });
  const sLow = model.sample({ simTimeS: 0, elevationM: -2600 });
  assert.ok(sHigh.pressureMbar < sLow.pressureMbar, 'Pressure decreases with elevation');

  // Slope / bedrock effect on thermal inertia
  const sCliff = model.sample({ simTimeS: 0, elevationM: -2540, slopeDeg: 15 });
  assert.ok(sCliff.thermalInertiaSI > s0.thermalInertiaSI, 'Steep slope has higher thermal inertia');
});

test('DEFAULT_THERMAL_SNAPSHOT has frozen shape with valid metrics', () => {
  assert.equal(DEFAULT_THERMAL_SNAPSHOT.status, 'ok');
  assert.equal(DEFAULT_THERMAL_SNAPSHOT.groundTempC, -9.8);
  assert.equal(DEFAULT_THERMAL_SNAPSHOT.airTempC, -28.9);
  assert.equal(DEFAULT_THERMAL_SNAPSHOT.pressureMbar, 7.54);
  assert.ok(Object.isFrozen(DEFAULT_THERMAL_SNAPSHOT));
});
