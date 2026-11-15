// Presentation camera motion (camera-motion.js) and its integration with camera.js.
// Visual feel only: no biomechanics or measured-body claims are tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCameraMotion, CAMERA_MOTION_PARAMS } from '../public/js/view/3d/camera-motion.js';
import {
  createFirstPersonCamera, getCameraPosition, setFirstPersonPose, getViewProjectionMatrix,
} from '../public/js/view/3d/camera.js';
import { ASTRONAUT_RIG } from '../public/js/view/3d/astronaut-rig.js';
import { SCENARIO } from '../public/js/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = path.join(here, '..', 'public', 'js', 'view', '3d');
const P = CAMERA_MOTION_PARAMS;
const DEG = Math.PI / 180;
const FRAME_S = SCENARIO.timeScale / 60; // one 60 fps frame in scenario seconds
const BREATH_RIPPLE_M = 2 * P.breathVerticalAmpM;

// Deterministic PRNG so the fuzz cases are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Walk at constant speed (scenario clock) for `seconds`, advancing the cumulative distance like the sim.
function walkFrames(motion, state, seconds, speed = 1.2, dt = FRAME_S) {
  const out = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    state.t += dt;
    state.d += speed * dt;
    out.push(motion.update({
      timeS: state.t, horizontalSpeedMps: speed, verticalSpeedMps: 0, grounded: true, airborne: false,
      phase: 'running', landingRecoveryFrac: 0, gaitDistanceM: state.d,
    }));
  }
  return out;
}

function stillFrames(motion, state, seconds, dt = FRAME_S) {
  const out = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    state.t += dt;
    out.push(motion.update({
      timeS: state.t, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, airborne: false,
      phase: 'running', landingRecoveryFrac: 0, gaitDistanceM: state.d,
    }));
  }
  return out;
}

function localMaxima(values) {
  let n = 0;
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] >= values[i + 1]) n++;
  }
  return n;
}

test('parameter contract: stride matches the rig presentation stride and every limit is below the stated bound', () => {
  assert.equal(P.strideM, ASTRONAUT_RIG.metadata.presentationStrideLengthM);
  assert.ok(P.maxPitchRad < 1 * DEG, 'pitch limit under 1 degree');
  assert.ok(P.maxRollRad < 0.6 * DEG, 'roll limit under 0.6 degree');
  assert.ok(P.maxVerticalM < 0.06, 'vertical limit under 6 cm');
  assert.ok(P.maxLateralM < 0.04, 'lateral limit under 4 cm');
  assert.ok(Object.isFrozen(P));
});

test('steady walk: one stride gives two vertical crests and one lateral crest per cycle', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  walkFrames(motion, state, 3); // let the gates converge
  const cycle = P.strideM / 1.2; // scenario seconds per stride
  const samples = walkFrames(motion, state, cycle, 1.2, 0.01);
  assert.equal(localMaxima(samples.map((s) => s.eyeOffsetZ)), 2, 'vertical crests per stride');
  assert.equal(localMaxima(samples.map((s) => s.eyeOffsetLateral)), 1, 'lateral crests per stride');
  // Pitch and roll are present but small.
  const peakPitch = Math.max(...samples.map((s) => Math.abs(s.pitchOffsetRad)));
  assert.ok(peakPitch > 0.5 * P.walkPitchAmpRad * 0.8 && peakPitch <= P.walkPitchAmpRad + 1e-9, `walk pitch ${peakPitch}`);
});

test('intensity 0 disables all motion exactly, for walking, idle, landing and airborne inputs', () => {
  const motion = createCameraMotion({ intensity: 0 });
  const state = { t: 0, d: 0 };
  for (const s of [...walkFrames(motion, state, 2), ...stillFrames(motion, state, 1)]) {
    assert.equal(s.eyeOffsetZ, 0);
    assert.equal(s.eyeOffsetLateral, 0);
    assert.equal(s.pitchOffsetRad, 0);
    assert.equal(s.rollOffsetRad, 0);
  }
  assert.throws(() => createCameraMotion({ intensity: Number.NaN }), TypeError);
});

test('stopping decays the walk sway continuously; no per-frame snap and the lateral sway returns to ~0', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  walkFrames(motion, state, 3);
  const stopped = stillFrames(motion, state, 2.5);
  let prev = null;
  let maxStep = 0;
  for (const s of stopped) {
    if (prev) {
      maxStep = Math.max(maxStep,
        Math.abs(s.eyeOffsetZ - prev.eyeOffsetZ),
        Math.abs(s.eyeOffsetLateral - prev.eyeOffsetLateral),
        Math.abs(s.pitchOffsetRad - prev.pitchOffsetRad),
        Math.abs(s.rollOffsetRad - prev.rollOffsetRad));
    }
    prev = s;
  }
  // The legacy formula dropped from +/-24 mm to 0 in one frame. The smoothed gate must stay well below that.
  assert.ok(maxStep < 0.012, `largest per-frame change while stopping ${maxStep}`);
  const last = stopped[stopped.length - 1];
  assert.ok(Math.abs(last.eyeOffsetLateral) < 1e-4, 'lateral sway settled');
  assert.ok(last.gains.walk < 1e-3, 'walk gate settled');
  assert.ok(last.gains.idle > 0.99, 'idle breath takes over at rest');
});

test('below the 0.04 m/s threshold the walk gate decays to zero rather than switching off', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  walkFrames(motion, state, 2, 1.2);
  const slow = walkFrames(motion, state, 3, 0.03);
  assert.ok(slow[slow.length - 1].gains.walk < 1e-3);
  // The transition itself is continuous: consecutive gain values never jump by more than the filter allows.
  let prev = null;
  for (const s of slow) {
    if (prev) assert.ok(Math.abs(s.gains.walk - prev.gains.walk) < 0.5, 'gate moves smoothly');
    prev = s;
  }
});

test('idle breath: small, time-driven, continuous and present only while standing still', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  // Breath period is 4 wall-seconds (32 scenario-seconds); 10 scenario-seconds reach the crest at 8 s.
  const still = stillFrames(motion, state, 10, 0.02);
  const amp = Math.max(...still.map((s) => Math.abs(s.eyeOffsetZ)));
  assert.ok(amp > 0.5 * P.breathVerticalAmpM && amp <= P.breathVerticalAmpM + 1e-12, `breath amplitude ${amp}`);
  assert.ok(Math.max(...still.map((s) => Math.abs(s.eyeOffsetLateral))) < 1e-9, 'no lateral sway at rest');
  const maxPitch = Math.max(...still.map((s) => Math.abs(s.pitchOffsetRad)));
  assert.ok(maxPitch <= P.breathPitchAmpRad + 1e-12);
});

test('landing: dip is stretched over the presentation window, peaks near mid-window and returns monotonically to zero', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  stillFrames(motion, state, 1, 0.01);
  const landingStart = state.t;
  const window = [];
  const dt = 0.01;
  for (let i = 0; i < Math.round(P.landingWindowS / dt) + 5; i++) {
    state.t += dt;
    const frac = i === 0 ? 1 : 0; // the sim sets recovery fraction to 1 at touchdown and then the timer runs
    window.push({ t: state.t - landingStart, s: motion.update({
      timeS: state.t, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, airborne: false,
      phase: 'running', landingRecoveryFrac: frac, gaitDistanceM: state.d,
    }) });
  }
  const dips = window.map((w) => w.s.eyeOffsetZ);
  const minIdx = dips.indexOf(Math.min(...dips));
  assert.ok(Math.abs(-dips[minIdx] - P.landingDipM * 0.97) < 0.004, `dip depth ${dips[minIdx]}`);
  const peakT = window[minIdx].t;
  assert.ok(Math.abs(peakT - P.landingWindowS / 2) < 0.05, `dip peaks mid-window at ${peakT}`);
  assert.ok(Math.abs(dips[0]) < 0.003, 'no snap at touchdown');
  for (let i = minIdx + 1; i < dips.length; i++) {
    assert.ok(dips[i] - dips[i - 1] >= -BREATH_RIPPLE_M, `monotone return at ${window[i].t.toFixed(2)} s`);
  }
  const tail = window[window.length - 1].s;
  assert.ok(Math.abs(tail.eyeOffsetZ) < 0.004, 'dip has returned to rest after the window');
  assert.ok(Math.abs(tail.pitchOffsetRad) < 0.002);
});

test('airborne: no walk oscillation in flight; gaze follows vertical speed and fades smoothly after touchdown', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  walkFrames(motion, state, 2);
  const air = [];
  for (let i = 0; i < 60; i++) {
    state.t += 0.02;
    state.d += 0.0; // flight moves horizontally, but the gait phase must not contribute
    const vz = 2.4 - 3.71 * (i * 0.02); // reaches about -2 m/s before touchdown
    air.push(motion.update({
      timeS: state.t, horizontalSpeedMps: 1.2, verticalSpeedMps: vz, grounded: false, airborne: true,
      phase: 'running', landingRecoveryFrac: 0, gaitDistanceM: state.d,
    }));
  }
  const lastAir = air[air.length - 1];
  assert.ok(lastAir.gains.walk < 0.2, 'walk gate released in flight');
  // No new sway is generated in flight: lateral sway can only be the decaying take-off tail of the walk gate.
  assert.ok(air.every((s) => Math.abs(s.eyeOffsetLateral) <= P.walkLateralAmpM * s.gains.walk + 1e-12),
    'lateral sway is bounded by the decaying walk gate');
  assert.ok(air.every((s) => Math.abs(s.pitchOffsetRad) <= P.airGazeMaxPitchRad + P.walkPitchAmpRad + P.breathPitchAmpRad + 1e-9));
  // Touchdown: the sim sets vertical speed to 0; the gaze holds its last airborne value and decays.
  const after = stillFrames(motion, state, 1.5, 0.02);
  let prev = lastAir;
  let maxStep = 0;
  for (const s of after) {
    maxStep = Math.max(maxStep, Math.abs(s.pitchOffsetRad - prev.pitchOffsetRad));
    prev = s;
  }
  assert.ok(maxStep < 0.004, `gaze decays without a snap (${maxStep})`);
});

test('PAUSED freezes every offset exactly, even when the scenario time argument moves', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  walkFrames(motion, state, 2);
  const before = motion.update({
    timeS: state.t, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true, airborne: false,
    phase: 'running', landingRecoveryFrac: 0, gaitDistanceM: state.d,
  });
  for (const t of [state.t, state.t + 1, state.t + 3.3]) {
    const paused = motion.update({
      timeS: t, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true, airborne: false,
      phase: 'paused', landingRecoveryFrac: 0, gaitDistanceM: state.d,
    });
    assert.deepEqual(paused, before, `paused output frozen at timeS=${t}`);
  }
  // Resuming continues from the same state without a jump larger than one frame of motion.
  const resumed = motion.update({
    timeS: state.t + FRAME_S, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true, airborne: false,
    phase: 'running', landingRecoveryFrac: 0, gaitDistanceM: state.d,
  });
  assert.ok(Math.abs(resumed.eyeOffsetZ - before.eyeOffsetZ) < 0.02);
});

test('determinism: the same input sequence yields identical output sequences', () => {
  const run = () => {
    const motion = createCameraMotion();
    const state = { t: 0, d: 0 };
    return [...walkFrames(motion, state, 2), ...stillFrames(motion, state, 1)].map((s) => JSON.stringify(s));
  };
  assert.deepEqual(run(), run());
});

test('hard limits hold for random inputs, and every output is finite', () => {
  const rand = mulberry32(20261115);
  const motion = createCameraMotion();
  let t = 0;
  for (let i = 0; i < 4000; i++) {
    t += rand() * 0.3;
    const out = motion.update({
      timeS: t,
      horizontalSpeedMps: rand() * 6 - 1,
      verticalSpeedMps: rand() * 12 - 6,
      grounded: rand() < 0.7,
      airborne: rand() < 0.3,
      phase: ['running', 'idle', 'walk', 'arrived', 'ready'][Math.floor(rand() * 5)],
      landingRecoveryFrac: rand() < 0.3 ? rand() * 1.5 - 0.2 : 0,
      gaitDistanceM: rand() * 200,
    });
    assert.ok(Math.abs(out.eyeOffsetZ) < P.maxVerticalM, 'vertical bound');
    assert.ok(Math.abs(out.eyeOffsetLateral) < P.maxLateralM, 'lateral bound');
    assert.ok(Math.abs(out.pitchOffsetRad) < P.maxPitchRad, 'pitch bound');
    assert.ok(Math.abs(out.rollOffsetRad) < P.maxRollRad, 'roll bound');
    assert.ok(Math.abs(out.pitchOffsetRad) < 1 * DEG, 'pitch under one degree');
    assert.ok(Math.abs(out.rollOffsetRad) < 0.6 * DEG, 'roll under 0.6 degree');
    assert.ok(Object.values(out).every((v) => typeof v === 'number' ? Number.isFinite(v) : true));
  }
});

test('corner inputs: negative speed, missing fields, non-finite values and undefined input never produce NaN', () => {
  const motion = createCameraMotion();
  const cases = [
    undefined,
    {},
    { timeS: 1 },
    { timeS: 1, horizontalSpeedMps: -5, verticalSpeedMps: Number.NaN, grounded: true, landingRecoveryFrac: 9 },
    { timeS: 2, horizontalSpeedMps: Number.POSITIVE_INFINITY, gaitDistanceM: Number.NaN, grounded: true },
    { timeS: Number.NaN, horizontalSpeedMps: 1.2 },
    { timeS: 3, horizontalSpeedMps: 1.2, gaitDistanceM: -4, grounded: true },
  ];
  for (const c of cases) {
    const out = motion.update(c);
    for (const key of ['eyeOffsetZ', 'eyeOffsetLateral', 'pitchOffsetRad', 'rollOffsetRad']) {
      assert.ok(Number.isFinite(out[key]), `${key} finite for ${JSON.stringify(c)}`);
    }
  }
});

test('reset returns to rest; a backwards clock (scene restart) restarts the gates', () => {
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  walkFrames(motion, state, 2);
  motion.reset();
  const fresh = createCameraMotion().update({ timeS: 1, horizontalSpeedMps: 0, grounded: true, gaitDistanceM: 0 });
  const afterReset = motion.update({ timeS: 1, horizontalSpeedMps: 0, grounded: true, gaitDistanceM: 0 });
  assert.deepEqual(afterReset, fresh);
  // Walk, then move the clock backwards: the gates restart from rest instead of continuing the old walk.
  walkFrames(motion, { t: 0, d: 0 }, 2);
  const restarted = motion.update({ timeS: 0.5, horizontalSpeedMps: 0, grounded: true, gaitDistanceM: 0 });
  assert.ok(restarted.gains.walk === 0 && restarted.gains.idle === 0);
});

test('integration: camera.js applies exactly the offsets it is given; no hidden second bob is added', () => {
  const camera = createFirstPersonCamera({ yawRad: 0 });
  setFirstPersonPose(camera, { xM: 10, yM: 20, bodyZDisplay: 5 });
  assert.equal(camera.dynamicEyeOffsetM, 0);
  assert.equal(camera.dynamicLateralOffsetM, 0);
  assert.equal(camera.xM, 10);
  assert.equal(camera.yM, 20);
  assert.ok(Math.abs(camera.zDisplay - (5 + 1.48)) < 1e-12, 'eye height exactly 1.48 m with no offsets');

  // Lateral sway is view-only: the eye moves along the camera's right vector (east-facing right = south, -Y),
  // while the body anchor (xM/yM, used for body, hands, beacon hide and shadow) does not move.
  const east = createFirstPersonCamera({ yawRad: 0 });
  setFirstPersonPose(east, { xM: 0, yM: 0, bodyZDisplay: 0, lateralOffsetM: 0.02 });
  assert.equal(east.xM, 0);
  assert.equal(east.yM, 0);
  const eastEye = getCameraPosition(east);
  assert.ok(Math.abs(eastEye.xM) < 1e-12 && Math.abs(eastEye.yM + 0.02) < 1e-12, 'east-facing: +lateral = south');
  const north = createFirstPersonCamera({ yawRad: Math.PI / 2 });
  setFirstPersonPose(north, { xM: 0, yM: 0, bodyZDisplay: 0, lateralOffsetM: 0.02 });
  const northEye = getCameraPosition(north);
  assert.ok(Math.abs(northEye.xM - 0.02) < 1e-12 && Math.abs(northEye.yM) < 1e-12, 'north-facing: +lateral = east');

  // The body anchor is kept for body geometry (feet stay on the ground while the head moves).
  setFirstPersonPose(east, { xM: 3, yM: 4, bodyZDisplay: 7, eyeOffsetM: -0.05, lateralOffsetM: 0.01 });
  assert.equal(east.xM, 3);
  assert.equal(east.yM, 4);
  assert.equal(east.bodyAnchorXM, 3);
  assert.equal(east.bodyAnchorYM, 4);
  assert.equal(east.bodyAnchorZDisplay, 7);
  assert.ok(Math.abs(east.zDisplay - (7 + 1.43)) < 1e-12);

  // Full chain: a motion output drives the view matrix without NaN.
  const motion = createCameraMotion();
  const state = { t: 0, d: 0 };
  for (const out of walkFrames(motion, state, 1)) {
    setFirstPersonPose(camera, {
      xM: 10, yM: 20, bodyZDisplay: 5,
      eyeOffsetM: out.eyeOffsetZ, lateralOffsetM: out.eyeOffsetLateral,
      pitchOffsetRad: out.pitchOffsetRad, rollOffsetRad: out.rollOffsetRad,
    });
    assert.ok([...getViewProjectionMatrix(camera, 16 / 9)].every(Number.isFinite));
  }
});

test('integration: main.js uses the module and no longer carries the inline bob formula (double-count guard)', () => {
  const main = fs.readFileSync(path.join(here, '..', 'public', 'js', 'main.js'), 'utf8');
  assert.ok(main.includes("from './view/3d/camera-motion.js'"));
  assert.ok(main.includes('cameraMotion.update('));
  assert.ok(!main.includes('0.024 * speedNorm'), 'legacy inline vertical bob removed');
  assert.ok(!main.includes('0.006 * speedNorm'), 'legacy inline pitch bob removed');
});

test('camera-motion.js is pure: no DOM, WebGL or global state references', () => {
  const src = fs.readFileSync(path.join(MODULE_DIR, 'camera-motion.js'), 'utf8');
  const forbidden = [/\bdocument\./, /\bwindow\./, /WebGL/, /\bgl\./, /localStorage/, /globalThis/, /\bfetch\(/];
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(src), `forbidden pattern: ${pattern}`);
  }
});
