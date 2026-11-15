// Presentation-only first-person camera motion: walk sway, idle breath, landing dip and nod.
// This is visual feel (görsel hissiyat), NOT measured biomechanics and NOT a suit or body model.
// Pure apart from the closure state created by createCameraMotion: no DOM, no GL, no module globals.
import { SCENARIO } from '../../config.js';

const TAU = 2 * Math.PI;

// Presentation parameters (sunum parametreleri). Amplitudes are at full walk speed.
export const CAMERA_MOTION_PARAMS = Object.freeze({
  // Gait phase = TAU * gaitDistanceM / strideM, the same convention as astronaut-rig.js
  // (ASTRONAUT_RIG.metadata.presentationStrideLengthM). One stride = two vertical crests, one lateral crest.
  strideM: 6,
  walkFullSpeedMps: 1.4,
  walkStartSpeedMps: 0.04, // same threshold as MOVING_SPEED_EPSILON_MPS in astronaut-rig.js
  walkEaseSpeedMps: 0.2,
  walkVerticalAmpM: 0.024,
  walkLateralAmpM: 0.012,
  walkPitchAmpRad: 0.006,
  walkRollAmpRad: 0.005,
  // Idle breath: slow wall-clock rate. The scenario clock runs timeScale times faster than wall time.
  breathWallHz: 0.25,
  breathVerticalAmpM: 0.0025,
  breathPitchAmpRad: 0.0015,
  breathRollAmpRad: 0.0008,
  // Landing: dip and nod follow sin(pi * t / window) from the rising edge of landingRecoveryFrac. The sim's own
  // recovery timer (0.25 scenario s, ~31 ms wall at 8x) spans only ~2 frames, so the dip is stretched here.
  landingWindowS: 1.2,
  landingDipM: 0.055,
  landingNodPitchRad: 0.010,
  landingRollRad: 0.004,
  // Airborne gaze: a slow pitch that follows vertical speed. It is not an oscillation.
  airGazePitchPerMpsRad: 0.006,
  airGazeMaxPitchRad: 0.012,
  // Gate smoothing time constant (scenario seconds). Every gate is low-passed, so no amplitude snaps.
  gateTauS: 0.25,
  // Hard presentation limits. A soft knee at 80% of each limit keeps the response smooth near the bound.
  maxVerticalM: 0.059,
  maxLateralM: 0.039,
  maxPitchRad: 0.017,
  maxRollRad: 0.0104,
});

const P = CAMERA_MOTION_PARAMS;
const ZERO_GAINS = Object.freeze({ walk: 0, idle: 0, air: 0 });
const ZERO_OUTPUT = Object.freeze({
  eyeOffsetZ: 0,
  eyeOffsetLateral: 0,
  pitchOffsetRad: 0,
  rollOffsetRad: 0,
  gains: ZERO_GAINS,
});

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep01(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// Identity up to 80% of the limit, then a C1-continuous tanh knee that approaches but never reaches the limit.
function softLimit(x, limit) {
  const knee = 0.8 * limit;
  const a = Math.abs(x);
  if (a <= knee) return x;
  const y = knee + (limit - knee) * Math.tanh((a - knee) / (limit - knee));
  return x < 0 ? -y : y;
}

// Converts -0 to +0 so that intensity 0 yields exactly zero everywhere.
function noNegativeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Creates per-view camera motion state. `update(input)` returns the presentation offsets for this frame:
 * `eyeOffsetZ` (m, vertical), `eyeOffsetLateral` (m, positive = camera right), `pitchOffsetRad` and
 * `rollOffsetRad` (rad). Yaw is intentionally not offset: it would change the heading the user steers by.
 *
 * Inputs (all optional, sanitized): timeS, horizontalSpeedMps, verticalSpeedMps, grounded, airborne,
 * phase, landingRecoveryFrac, gaitDistanceM. Phase 'paused' freezes the output exactly. Each gate is
 * low-passed in scenario time, so the output is continuous in time and deterministic for the same
 * input sequence. A non-finite timeS returns the last output unchanged.
 *
 * @param {{intensity?: number, idleBreathing?: boolean}} [options] intensity in [0, 1]; 0 disables all motion exactly.
 *   `idleBreathing` retains the module's presentation option; callers can turn it off to keep an idle camera still.
 */
export function createCameraMotion({ intensity = 1, idleBreathing = true } = {}) {
  if (!Number.isFinite(intensity)) throw new TypeError('intensity must be finite');
  if (typeof idleBreathing !== 'boolean') throw new TypeError('idleBreathing must be a boolean');
  const k = clamp01(intensity);
  let state = null;
  let last = ZERO_OUTPUT;

  function update(input = {}) {
    const timeS = input.timeS;
    if (!Number.isFinite(timeS) || input.phase === 'paused') return last;
    // A backwards clock means a scene reset: restart the gates from rest.
    if (state === null || timeS < state.timeS) {
      state = { timeS, walk: 0, idle: 0, air: 0, prevFrac: 0, landingStartS: null, gazeVz: 0 };
    }
    const alpha = 1 - Math.exp(-(timeS - state.timeS) / P.gateTauS);

    const speed = Math.max(0, finiteOr(input.horizontalSpeedMps, 0));
    const frac = clamp01(finiteOr(input.landingRecoveryFrac, 0));
    // Rising edge of the sim's recovery fraction marks touchdown; the presentation window starts there.
    if (frac > 0 && state.prevFrac <= 0) state.landingStartS = timeS;
    state.prevFrac = frac;
    const sinceLandingS = state.landingStartS === null ? Infinity : timeS - state.landingStartS;
    const landingActive = sinceLandingS < P.landingWindowS;
    const landingU = landingActive ? sinceLandingS / P.landingWindowS : 0; // 0 at touchdown, 1 at window end
    // sin^2(pi u): zero velocity at touchdown, so the absorption starts softly; peak at u = 0.5.
    const dipSin = Math.sin(Math.PI * landingU);
    const dip = dipSin * dipSin;
    const airborne = input.airborne === true;
    const stand = input.grounded === true && !airborne && !landingActive;
    const easeIn = smoothstep01((speed - P.walkStartSpeedMps) / P.walkEaseSpeedMps);
    const walkTarget = stand ? easeIn * clamp01(speed / P.walkFullSpeedMps) : 0;
    const idleTarget = idleBreathing && stand ? 1 - easeIn : 0;
    const airTarget = airborne ? 1 : 0;
    state.walk += (walkTarget - state.walk) * alpha;
    state.idle += (idleTarget - state.idle) * alpha;
    state.air += (airTarget - state.air) * alpha;
    state.timeS = timeS;

    const d = input.gaitDistanceM;
    const phi = Number.isFinite(d) && d >= 0 ? (TAU * d) / P.strideM : TAU * (speed / P.strideM) * timeS;
    const sinPhi = Math.sin(phi);
    const breath = Math.sin(TAU * P.breathWallHz * (timeS / SCENARIO.timeScale));
    // The sim zeroes vertical speed on touchdown; hold the last airborne value so the gaze fades out smoothly.
    if (airborne) state.gazeVz = finiteOr(input.verticalSpeedMps, 0);
    const gaze = Math.max(-P.airGazeMaxPitchRad, Math.min(P.airGazeMaxPitchRad,
      state.gazeVz * P.airGazePitchPerMpsRad)) * state.air;

    const gW = state.walk;
    const gI = state.idle;
    const rawZ = gW * P.walkVerticalAmpM * Math.sin(2 * phi) + gI * P.breathVerticalAmpM * breath - P.landingDipM * dip;
    const rawLat = gW * P.walkLateralAmpM * sinPhi;
    const rawPitch = gW * P.walkPitchAmpRad * sinPhi + gI * P.breathPitchAmpRad * breath + gaze - P.landingNodPitchRad * dip;
    const rawRoll = gW * P.walkRollAmpRad * Math.cos(phi) + gI * P.breathRollAmpRad * breath +
      P.landingRollRad * dip * Math.sin(TAU * landingU);

    last = Object.freeze({
      eyeOffsetZ: noNegativeZero(softLimit(k * rawZ, P.maxVerticalM)),
      eyeOffsetLateral: noNegativeZero(softLimit(k * rawLat, P.maxLateralM)),
      pitchOffsetRad: noNegativeZero(softLimit(k * rawPitch, P.maxPitchRad)),
      rollOffsetRad: noNegativeZero(softLimit(k * rawRoll, P.maxRollRad)),
      gains: Object.freeze({ walk: gW, idle: gI, air: state.air }),
    });
    return last;
  }

  function reset() {
    state = null;
    last = ZERO_OUTPUT;
  }

  return Object.freeze({ update, reset });
}
