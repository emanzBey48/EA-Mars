// Flight clock (airborneTimeScale): the hop is slowed on screen while its physics stays in scenario seconds.
// Run: node --test test/airborne-timescale.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarswalkSim, PHASE, createWorldSnapshot, resolveAirborneTimeScale, resolveClockSmoothingWallS } from '../public/js/simulation/sim.js';
import { SCENARIO } from '../public/js/config.js';

const ROUTE = { a: { x: 0, y: 0 }, b: { x: 5000, y: 0 } };
const KNOWN = { status: 'ok', value: -2500 };
const UNKNOWN = { status: 'no-data', value: null };
const G = SCENARIO.marsGravityMps2;
const V0 = SCENARIO.jumpImpulseMps;
const VX = SCENARIO.walkSpeedMps;
const AIR_SIM_S = (2 * V0) / G;          // 1.2938 scenario s
const APEX_M = (V0 * V0) / (2 * G);      // 0.7763 m
const TAU = SCENARIO.timeScaleSmoothingWallS;

function standing(scenario = SCENARIO) {
  const sim = new MarswalkSim(ROUTE, scenario);
  sim.resolveSurfaceContact(KNOWN);
  return sim;
}

/**
 * Takes off while walking forward, flies until landing. Checks the ballistic identities at every airborne
 * frame, measured from the takeoff instant: h(T) = v0 T - g T^2 / 2 and x(T) = x0 + vx T.
 */
function flyWithFrameStep(dtWall) {
  const sim = standing();
  const t0 = sim.simTimeS;
  const x0 = sim.pos.x;
  const frames = [];
  let maxFrameSimS = 0;
  let prevSim = sim.simTimeS;
  let wallS = 0;
  let landedT = null;
  let wallAtLanding = null;
  sim.stepFirstPerson(dtWall, { moveX: 1, jump: true }, KNOWN);
  wallS += dtWall;
  for (let guard = 0; guard < 100000; guard++) {
    const T = sim.simTimeS - t0;
    if (sim.airborne) {
      assert.ok(Math.abs(sim.heightAboveReferenceM - (V0 * T - (G * T * T) / 2)) < 1e-9,
        `height identity at T=${T} (dt ${dtWall}): ${sim.heightAboveReferenceM}`);
      assert.ok(Math.abs(sim.pos.x - (x0 + VX * T)) < 1e-9, `x identity at T=${T}`);
      frames.push({ T, h: sim.heightAboveReferenceM });
    }
    if (!sim.airborne && sim.grounded) { landedT = T; wallAtLanding = wallS; break; }
    sim.stepFirstPerson(dtWall, {}, KNOWN);
    wallS += dtWall;
    maxFrameSimS = Math.max(maxFrameSimS, sim.simTimeS - prevSim);
    prevSim = sim.simTimeS;
  }
  return { sim, landedT, wallS: wallAtLanding, maxFrameSimS, frames, x0, t0 };
}

test('flight clock: ballistic height and horizontal position are exact in scenario time at 30, 60 and 120 fps', () => {
  for (const fps of [30, 60, 120]) {
    const r = flyWithFrameStep(1 / fps);
    assert.ok(r.landedT !== null, `landed at ${fps} fps`);
    // Landing is detected at a frame boundary: the sim time overshoots the analytic flight by at most one flight frame.
    assert.ok(r.landedT >= AIR_SIM_S - 1e-9 && r.landedT <= AIR_SIM_S + r.maxFrameSimS + 1e-9,
      `landing sim time ${r.landedT} in [${AIR_SIM_S}, ${AIR_SIM_S + r.maxFrameSimS}] at ${fps} fps`);
    assert.ok(r.frames.length > 0);
    const apexSampled = Math.max(...r.frames.map((f) => f.h));
    assert.ok(apexSampled <= APEX_M + 1e-9 && apexSampled >= APEX_M - (G * (r.maxFrameSimS ** 2)) / 8 - 1e-9,
      `sampled apex ${apexSampled} near analytic ${APEX_M}`);
  }
});

test('flight clock: wall-clock flight is ~1.29 s / airborneTimeScale, shortened only by the smoothing ramp', () => {
  const r = flyWithFrameStep(1 / 60);
  const ideal = AIR_SIM_S / SCENARIO.airborneTimeScale;        // 0.647 s
  const rampCostS = ((SCENARIO.timeScale - SCENARIO.airborneTimeScale) * TAU) / SCENARIO.airborneTimeScale;
  assert.ok(r.wallS <= ideal + 2 / 60, `flight wall ${r.wallS} s not longer than ideal ${ideal} s`);
  assert.ok(r.wallS >= ideal - rampCostS - 2 / 60, `flight wall ${r.wallS} s within smoothing allowance of ${ideal} s`);
  // The walking-clock flight was ~1.29 / 8 = 0.16 s of wall time; the new one must be clearly longer than that.
  assert.ok(r.wallS > 3 * (AIR_SIM_S / SCENARIO.timeScale), `flight wall ${r.wallS} s vs old ${AIR_SIM_S / SCENARIO.timeScale} s`);
});

test('flight clock: the clock integral depends only on wall time, not on frame partition', () => {
  const coarse = standing();
  const fine = standing();
  // Start from the walking scale, then request the flight clock for the same total wall time.
  const coarseSim = coarse.advanceSimClock(0.1, true);
  let fineSim = 0;
  for (let i = 0; i < 1000; i++) fineSim += fine.advanceSimClock(0.0001, true);
  assert.ok(Math.abs(coarseSim - fineSim) < 1e-12, `coarse ${coarseSim} vs fine ${fineSim}`);
  assert.ok(Math.abs(coarse.timeScaleEffective - fine.timeScaleEffective) < 1e-12);
  assert.ok(coarse.timeScaleEffective > SCENARIO.airborneTimeScale, 'still relaxing toward the flight scale');
});

test('flight clock: converges to airborneTimeScale in flight, then relaxes back to the walking clock after recovery', () => {
  const sim = standing();
  sim.stepFirstPerson(1 / 60, { jump: true }, KNOWN);
  for (let i = 0; i < 10; i++) sim.stepFirstPerson(1 / 60, {}, KNOWN);
  assert.equal(sim.airborne, true);
  assert.ok(Math.abs(sim.timeScaleEffective - SCENARIO.airborneTimeScale) < 0.01, `flight scale ${sim.timeScaleEffective}`);
  for (let i = 0; i < 1000 && !sim.grounded; i++) sim.stepFirstPerson(1 / 60, {}, KNOWN);
  assert.equal(sim.grounded, true);
  assert.equal(sim.landingRecovery, true);
  for (let i = 0; i < 1000 && sim.landingRecovery; i++) sim.stepFirstPerson(1 / 60, {}, KNOWN);
  assert.equal(sim.landingRecovery, false);
  const atExpiry = sim.timeScaleEffective;
  assert.ok(atExpiry < SCENARIO.airborneTimeScale + 0.5, `scale at recovery expiry ${atExpiry} is still the flight clock`);
  sim.stepFirstPerson(1 / 60, { moveX: 1 }, KNOWN);
  assert.ok(sim.timeScaleEffective > atExpiry, 'walking clock relaxes upward after recovery');
  for (let i = 0; i < 60; i++) sim.stepFirstPerson(1 / 60, { moveX: 1 }, KNOWN);
  assert.ok(Math.abs(sim.timeScaleEffective - SCENARIO.timeScale) < 1e-6);
});

test('walking on the ground keeps the walking clock exactly (no regression)', () => {
  const sim = standing();
  const t0 = sim.simTimeS;
  for (let i = 0; i < 120; i++) sim.stepFirstPerson(1 / 60, { moveX: 1 }, KNOWN);
  assert.equal(sim.timeScaleEffective, SCENARIO.timeScale);
  assert.ok(Math.abs((sim.simTimeS - t0) - 2 * SCENARIO.timeScale) < 1e-9);
});

test('PAUSED: no scenario time, no flight-clock drift, and momentum survives a pause in mid-air', () => {
  const sim = standing();
  sim.stepFirstPerson(1 / 60, { moveX: 1, jump: true }, KNOWN);
  for (let i = 0; i < 6; i++) sim.stepFirstPerson(1 / 60, {}, KNOWN);
  const frozen = {
    simTimeS: sim.simTimeS, x: sim.pos.x, vx: sim.horizontalVelocityXMps, h: sim.heightAboveReferenceM,
    v: sim.verticalSpeedMps, scale: sim.timeScaleEffective,
  };
  assert.equal(sim.togglePause(), PHASE.PAUSED);
  for (let i = 0; i < 300; i++) sim.stepFirstPerson(1 / 60, { moveX: -1, jump: true }, KNOWN);
  assert.deepEqual({
    simTimeS: sim.simTimeS, x: sim.pos.x, vx: sim.horizontalVelocityXMps, h: sim.heightAboveReferenceM,
    v: sim.verticalSpeedMps, scale: sim.timeScaleEffective,
  }, frozen, 'paused frames change nothing');
  sim.togglePause();
  sim.stepFirstPerson(1 / 60, {}, KNOWN);
  assert.equal(sim.horizontalVelocityXMps, frozen.vx, 'horizontal momentum conserved across the pause');
  assert.ok(sim.simTimeS > frozen.simTimeS);
});

test('unknown terrain mid-flight: flight clock and ballistics continue; no landing without a known sample', () => {
  const sim = standing();
  sim.stepFirstPerson(1 / 60, { moveX: 1, jump: true }, KNOWN);
  for (let i = 0; i < 4; i++) sim.stepFirstPerson(1 / 60, {}, UNKNOWN);
  assert.equal(sim.airborne, true);
  assert.equal(sim.grounded, false);
  assert.ok(sim.timeScaleEffective < SCENARIO.timeScale, 'flight clock still applies through unknown terrain');
});

test('config validation: airborneTimeScale must be finite and within [1, timeScale]; missing means no slowdown', () => {
  for (const bad of [0.5, 0, -1, SCENARIO.timeScale + 0.01, Number.NaN, Number.POSITIVE_INFINITY, '2']) {
    assert.throws(() => new MarswalkSim(ROUTE, { ...SCENARIO, airborneTimeScale: bad }), RangeError, `airborneTimeScale=${String(bad)}`);
  }
  assert.throws(() => new MarswalkSim(ROUTE, { ...SCENARIO, timeScaleSmoothingWallS: -0.01 }), RangeError);
  assert.throws(() => new MarswalkSim(ROUTE, { ...SCENARIO, timeScaleSmoothingWallS: Number.NaN }), RangeError);

  const { airborneTimeScale, ...withoutAir } = SCENARIO;
  assert.equal(airborneTimeScale, SCENARIO.airborneTimeScale);
  assert.equal(resolveAirborneTimeScale(withoutAir), SCENARIO.timeScale, 'missing value keeps the walking clock');
  assert.equal(resolveAirborneTimeScale({ timeScale: 8, airborneTimeScale: 1 }), 1);
  assert.equal(resolveAirborneTimeScale({ timeScale: 8, airborneTimeScale: 8 }), 8);
  assert.equal(resolveClockSmoothingWallS({ timeScale: 8 }), 0);
  assert.equal(resolveClockSmoothingWallS({ timeScale: 8, timeScaleSmoothingWallS: 0.05 }), 0.05);
});

test('zero smoothing switches the clock instantly; the flight identities still hold', () => {
  const scenario = { ...SCENARIO, timeScaleSmoothingWallS: 0 };
  const sim = new MarswalkSim(ROUTE, scenario);
  sim.resolveSurfaceContact(KNOWN);
  const t0 = sim.simTimeS;
  sim.stepFirstPerson(1 / 60, { jump: true }, KNOWN);
  assert.equal(sim.timeScaleEffective, SCENARIO.airborneTimeScale);
  assert.ok(Math.abs((sim.simTimeS - t0) - (SCENARIO.airborneTimeScale / 60)) < 1e-12, 'takeoff frame runs at the flight scale');
});

test('snapshot: movement exposes timeScaleEffective; existing movement fields are unchanged', () => {
  const sim = standing();
  sim.stepFirstPerson(1 / 60, { moveX: 1, jump: true }, KNOWN);
  const snap = createWorldSnapshot({ sim, surfaceProvider: null, adapter: null });
  const m = snap.astronaut.movement;
  for (const key of ['timeS', 'horizontalSpeedMps', 'verticalSpeedMps', 'grounded', 'airborne', 'landingRecovery',
    'landingRecoveryFrac', 'gaitDistanceM', 'phase', 'groundContactStatus']) {
    assert.ok(Object.prototype.hasOwnProperty.call(m, key), `movement.${key} present`);
  }
  assert.ok(Number.isFinite(m.timeScaleEffective));
  assert.ok(m.timeScaleEffective <= SCENARIO.timeScale && m.timeScaleEffective >= SCENARIO.airborneTimeScale - 1e-9);
  assert.equal(m.timeS, sim.simTimeS);
  assert.equal(Object.isFrozen(m), true);
});
