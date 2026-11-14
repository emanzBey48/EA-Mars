// Presentation-only astronaut part geometry and deterministic pose generation.
import { SCENARIO } from '../../config.js';

// `leftWristRing` / `rightWristRing` are the suit's metallic wrist coupling rings; they sit between the
// sleeve and the glove, so a first-person view-model sees them as part of the glove assembly.
export const FIRST_PERSON_RIG_PARTS = Object.freeze([
  'torso',
  'chestPack',
  'leftArm',
  'rightArm',
  'leftGlove',
  'rightGlove',
  'leftWristRing',
  'rightWristRing',
]);

/**
 * Aşama 16 (provisional until the Aşama 15 camera/scale contract is frozen): parts a first-person
 * renderer may draw ONLY while the player looks down, so legs and boots can appear in the lower frame.
 * Data only; `FIRST_PERSON_RIG_PARTS` (what the renderer draws today) is intentionally unchanged
 * except for the wrist rings. Their poses are always present in `poseAstronautRig(...).parts`.
 * The ankle rings are the metallic couplings between leg and boot.
 */
export const FIRST_PERSON_LOWER_BODY_PARTS = Object.freeze([
  'leftLeg', 'rightLeg', 'leftBoot', 'rightBoot', 'leftAnkleRing', 'rightAnkleRing',
]);

// Presentation stride (visual design constant) and arm-swing share of the leg swing. See metadata note.
const PRESENTATION_STRIDE_LENGTH_M = 6;
const ARM_TO_LEG_SWING_RATIO = 0.5;

// ---- Gait scaling model (Froude similarity) -------------------------------------------------
// Dimensionless speed Fr = v^2 / (g * L). Walk->run transition near Fr ~ 0.5 is the textbook dynamic
// similarity rule (Alexander-type scaling); this is a Froude-based MODEL, source not verified here,
// and L is an assumed illustrative leg length, not a suit or body measurement.
const GAIT_LEG_LENGTH_M = 0.9;
const WALK_RUN_FROUDE = 0.5;
const EARTH_GRAVITY_MPS2 = 9.80665; // standard gravity, for comparison only
const MARS_GRAVITY_MPS2 = SCENARIO.marsGravityMps2; // 3.71 m/s^2, NASA rounded surface reference
// Presentation stride model: stride ~ v^0.6 (Alexander-type relative stride ~ Fr^0.3), anchored so
// that the reference speed returns exactly the legacy 6 m presentation stride.
const STRIDE_REFERENCE_SPEED_MPS = SCENARIO.walkSpeedMps;
const STRIDE_MIN_SPEED_MPS = 0.05;
const STRIDE_SPEED_EXPONENT = 0.6;

const AXIS_SIDE_NOTE = 'Rig local +X is the PHYSICAL LEFT after heading + forwardHeadingOffsetRad; ' +
  'ids named left* sit at local -X and are therefore physically on the right (stage32a finding). ' +
  'Use `side` for any user-facing label; ids are kept for backwards compatibility.';

// ---- Palette (visual approach only; not a measured suit/body specification) ------------------
const SUIT_WHITE = [0.92, 0.91, 0.88]; // off-white outer layer (sRGB), below 1.0 so it does not clip in sunlight
const SUIT_LIMB_WHITE = [0.90, 0.89, 0.86];
const HELMET_WHITE = [0.93, 0.92, 0.89];
const METAL_GRAY = [0.55, 0.57, 0.60];
const MODULE_GRAY = [0.58, 0.60, 0.63];
const GLOVE_DARK = [0.20, 0.22, 0.25];
const BOOT_DARK = [0.17, 0.17, 0.19];
const SOLE_DARK = [0.07, 0.07, 0.08];
const VISOR_GOLD = [0.62, 0.46, 0.16];
const PLSS_WHITE = [0.82, 0.81, 0.77];
const PANEL_DARK = [0.25, 0.26, 0.28];
const ANTENNA_GRAY = [0.75, 0.78, 0.82];

const MATERIALS = Object.freeze({
  fabric: { roughness: 0.88, metallic: 0 },
  shell: { roughness: 0.55, metallic: 0 },
  metal: { roughness: 0.35, metallic: 0.8 },
  module: { roughness: 0.5, metallic: 0.3 },
  rubber: { roughness: 0.92, metallic: 0 },
  gold: { roughness: 0.12, metallic: 1 },
});

/**
 * Immutable, renderer-independent rig template. All dimensions, colors, and proportions are visual
 * design units only; they do not describe a real suit, human body, or biomechanical model.
 *
 * Coordinate system: X is astronaut-left/right, Y is horizontal depth, Z is up. The astronaut faces
 * local -Y. `geometry.positions` contains a reusable unit box centered at the origin; each part's
 * `size`, `center`, `pivot`, `colorRgb` (display color), `material` (`albedoLinear`, `roughness`,
 * `metallic`; metadata for a future lit renderer) and `side` are plain data a renderer can use to instance it.
 * Simulation `headingRad` is measured from +X; with the renderer's standard +Z yaw, use
 * `headingRad + metadata.forwardHeadingOffsetRad` to align the local -Y forward axis to that heading.
 */
export const ASTRONAUT_RIG = deepFreeze({
  metadata: {
    kind: 'presentation-only astronaut rig',
    units: 'local model units; dimensions and stride are visual choices, not suit/body measurements',
    axes: { x: 'left/right', y: 'horizontal depth', z: 'up' },
    forward: '-Y',
    forwardHeadingOffsetRad: Math.PI / 2,
    geometryDescription: 'Low-poly cuboids; no physical or suit-biomechanics claim',
    sideConvention: AXIS_SIDE_NOTE,
    appearance: 'white/off-white fabric outer layer, grey metallic coupling rings, dark boots/gloves, gold reflective visor; ' +
      'visual approach inspired by public EVA imagery, no suit measurement or exact colour claim',
    // Visual choice, NOT biomechanics: scenario time runs `SCENARIO.timeScale` (8x) faster than wall
    // time, so wall-clock arm cadence = timeScale * speed / stride. 6 m gives ~1.6 Hz at 1.2 m/s (the
    // previous 1.25 m gave ~7.7 Hz). Consumers that mirror the gait (e.g. camera head-bob) should read
    // this value instead of hard-coding a stride.
    presentationStrideLengthM: PRESENTATION_STRIDE_LENGTH_M,
    gaitModel: {
      note: 'Froude-similarity model; source not verified; leg length is an assumed illustrative value',
      legLengthM: GAIT_LEG_LENGTH_M,
      walkRunFroude: WALK_RUN_FROUDE,
      marsGravityMps2: MARS_GRAVITY_MPS2,
      earthGravityMps2: EARTH_GRAVITY_MPS2,
      strideReferenceSpeedMps: STRIDE_REFERENCE_SPEED_MPS,
      strideSpeedExponent: STRIDE_SPEED_EXPONENT,
    },
    firstPersonParts: FIRST_PERSON_RIG_PARTS,
    firstPersonLowerBodyParts: FIRST_PERSON_LOWER_BODY_PARTS,
    // Suggestion for the integration owner only (Aşama 17); provisional, not wired to any renderer.
    // Draw the lower-body parts only when the view pitch is at least `minLookDownPitchRad` below the
    // horizon, fading in until `fullLookDownPitchRad`; they must not cover the normal-view frame.
    // Per-part hip/ankle hinge pivots are `parts[id].pivot`; neutral boot sole sits at z = 0.01.
    firstPersonLowerBody: {
      parts: FIRST_PERSON_LOWER_BODY_PARTS,
      visibleOnlyWhenLookingDown: true,
      minLookDownPitchRad: 0.6,
      fullLookDownPitchRad: 1.0,
      provisional: true,
      note: 'suggestion only; thresholds are not tied to camera.js conventions',
    },
  },
  geometry: createUnitBoxGeometry(),
  parts: {
    torso: part('torso', [0.44, 0.34, 0.58], [0, 0, 0.99], [0, 0, 0.99], SUIT_WHITE, 'fabric'),
    chestPack: part('chestPack', [0.26, 0.14, 0.22], [0, -0.23, 0.99], [0, 0, 0.99], MODULE_GRAY, 'module'),
    helmet: part('helmet', [0.34, 0.31, 0.32], [0, 0, 1.48], [0, 0, 1.34], HELMET_WHITE, 'shell'),
    visor: part('visor', [0.23, 0.035, 0.16], [0, -0.17, 1.48], [0, 0, 1.34], VISOR_GOLD, 'gold'),
    backpack: part('backpack', [0.34, 0.23, 0.43], [0, 0.21, 0.99], [0, 0.21, 0.99], PLSS_WHITE, 'shell'),
    plssAntenna: part('plssAntenna', [0.035, 0.035, 0.30], [0.12, 0.23, 1.35], [0.12, 0.23, 1.205], ANTENNA_GRAY, 'metal'),
    plssPanel: part('plssPanel', [0.22, 0.02, 0.20], [0, 0.335, 1.02], [0, 0.335, 1.02], PANEL_DARK, 'module'),
    neckRing: part('neckRing', [0.27, 0.25, 0.06], [0, 0, 1.30], [0, 0, 1.30], METAL_GRAY, 'metal'),
    waistRing: part('waistRing', [0.46, 0.36, 0.05], [0, 0, 0.70], [0, 0, 0.70], METAL_GRAY, 'metal'),
    leftArm: part('leftArm', [0.19, 0.23, 0.53], [-0.34, 0, 0.96], [-0.27, 0, 1.22], SUIT_LIMB_WHITE, 'fabric'),
    rightArm: part('rightArm', [0.19, 0.23, 0.53], [0.34, 0, 0.96], [0.27, 0, 1.22], SUIT_LIMB_WHITE, 'fabric'),
    leftWristRing: part('leftWristRing', [0.215, 0.255, 0.05], [-0.34, 0, 0.70], [-0.34, 0, 0.70], METAL_GRAY, 'metal'),
    rightWristRing: part('rightWristRing', [0.215, 0.255, 0.05], [0.34, 0, 0.70], [0.34, 0, 0.70], METAL_GRAY, 'metal'),
    leftGlove: part('leftGlove', [0.13, 0.16, 0.17], [-0.34, -0.02, 0.615], [-0.34, 0, 0.695], GLOVE_DARK, 'rubber'),
    rightGlove: part('rightGlove', [0.13, 0.16, 0.17], [0.34, -0.02, 0.615], [0.34, 0, 0.695], GLOVE_DARK, 'rubber'),
    leftLeg: part('leftLeg', [0.21, 0.25, 0.53], [-0.14, 0, 0.40], [-0.14, 0, 0.65], SUIT_LIMB_WHITE, 'fabric'),
    rightLeg: part('rightLeg', [0.21, 0.25, 0.53], [0.14, 0, 0.40], [0.14, 0, 0.65], SUIT_LIMB_WHITE, 'fabric'),
    leftAnkleRing: part('leftAnkleRing', [0.235, 0.27, 0.045], [-0.14, 0, 0.152], [-0.14, 0, 0.152], METAL_GRAY, 'metal'),
    rightAnkleRing: part('rightAnkleRing', [0.235, 0.27, 0.045], [0.14, 0, 0.152], [0.14, 0, 0.152], METAL_GRAY, 'metal'),
    leftBoot: part('leftBoot', [0.23, 0.34, 0.16], [-0.14, -0.035, 0.09], [-0.14, 0, 0.17], BOOT_DARK, 'rubber'),
    rightBoot: part('rightBoot', [0.23, 0.34, 0.16], [0.14, -0.035, 0.09], [0.14, 0, 0.17], BOOT_DARK, 'rubber'),
    leftSole: part('leftSole', [0.238, 0.348, 0.047], [-0.14, -0.035, 0.0315], [-0.14, -0.035, 0.0315], SOLE_DARK, 'rubber'),
    rightSole: part('rightSole', [0.238, 0.348, 0.047], [0.14, -0.035, 0.0315], [0.14, -0.035, 0.0315], SOLE_DARK, 'rubber'),
  },
});

// Rigid attachments: the child follows the parent's complete pose with no motion of its own.
// (Neutral center/pivot of the child are fixed template data; see rigidFollowPart.)
const RIGID_FOLLOWERS = Object.freeze({
  visor: 'helmet',
  leftWristRing: 'leftArm',
  rightWristRing: 'rightArm',
  leftAnkleRing: 'leftLeg',
  rightAnkleRing: 'rightLeg',
  leftSole: 'leftBoot',
  rightSole: 'rightBoot',
});
const FOLLOWER_IDS = Object.freeze(Object.keys(RIGID_FOLLOWERS));
const PART_IDS = Object.freeze(Object.keys(ASTRONAUT_RIG.parts));

const TAU = 2 * Math.PI;
const MOVING_SPEED_EPSILON_MPS = 0.04;

// Stage 16 first-person view-model constants. These are visual choices for the lower-frame torso/arm
// overlay, not suit or human biomechanics measurements. Camera head-bob lives in camera.js (owned
// elsewhere), so these amplitudes are kept small to avoid double-counting the same motion.
const BREATH_HZ = 0.22;
const VM_BREATH_OFFSET_Z = 0.004;
const VM_BREATH_PITCH_RAD = 0.006;
const WALK_FULL_SPEED_MPS = 1.4;
const VM_WALK_FULL_SPEED_MPS = WALK_FULL_SPEED_MPS;
// Speed range above the idle/walk threshold over which rhythmic gait amplitudes ease in from zero.
const GAIT_EASE_MPS = 0.2;
const VALID_PHASES = Object.freeze(['idle', 'walk', 'stop', 'airborne', 'paused', 'ready', 'running', 'arrived']);
const VM_STEP_SWAY_X = 0.006;
const VM_STEP_BOB_Z = 0.008;
const VM_STEP_ROLL_RAD = 0.01;
const VM_AIRBORNE_LAG_Z = 0.01;
const VM_AIRBORNE_LAG_SPEED_MPS = 2.4;
const VM_RECOVERY_DIP_Z = 0.012;
const VM_RECOVERY_DIP_PITCH_RAD = 0.01;

// Idle weight-shift drift (slow, mm scale) layered on the breath; fades with speed and landing recovery.
const IDLE_DRIFT_HZ = 0.07;
const IDLE_DRIFT_X = 0.004;
const IDLE_DRIFT_YAW_RAD = 0.004;

// Transition windows on vertical speed (m/s), design constants mirroring the ~2.4 m/s scenario jump
// impulse (SCENARIO.jumpImpulseMps). With the scenario clock at 8x a 60 fps frame spans ~0.5 m/s of
// vertical speed, so the windows are 0.8 m/s wide to cover about two frames.
const TAKEOFF_BLEND_VZ_FULL_MPS = 2.0; // at/above this the pose is still the grounded gait pose
const TAKEOFF_BLEND_VZ_NONE_MPS = 1.2; // at/below this the pure flight pose applies
const TOUCH_BLEND_VZ_FULL_MPS = -2.0; // at/below this the pose is the touchdown-absorb pose
const TOUCH_BLEND_VZ_NONE_MPS = -1.2;

/**
 * Froude number v^2 / (g L). Defaults: Mars gravity and the model leg length.
 * @param {number} speedMps @param {{gravityMps2?:number, legLengthM?:number}} [opts]
 */
export function froudeNumber(speedMps, { gravityMps2 = MARS_GRAVITY_MPS2, legLengthM = GAIT_LEG_LENGTH_M } = {}) {
  if (!Number.isFinite(speedMps) || speedMps < 0) throw new TypeError('speedMps must be finite and >= 0');
  if (!(gravityMps2 > 0) || !(legLengthM > 0)) throw new TypeError('gravityMps2 and legLengthM must be > 0');
  return (speedMps * speedMps) / (gravityMps2 * legLengthM);
}

/** Speed at which the Froude number reaches the walk->run value: sqrt(Fr * g * L). */
export function walkRunTransitionSpeedMps({
  gravityMps2 = MARS_GRAVITY_MPS2, legLengthM = GAIT_LEG_LENGTH_M, froude = WALK_RUN_FROUDE,
} = {}) {
  if (!(gravityMps2 > 0) || !(legLengthM > 0) || !(froude > 0)) throw new TypeError('gravityMps2, legLengthM and froude must be > 0');
  return Math.sqrt(froude * gravityMps2 * legLengthM);
}

/**
 * Presentation stride length (m) for a horizontal speed: 6 m * (v / 1.2 m/s)^0.6, floored at 0.05 m/s so it
 * is finite and monotone non-decreasing. At the scenario walk speed it equals `presentationStrideLengthM`.
 * It is NOT used by `poseAstronautRig` unless the caller supplies an accumulated `gaitPhaseRad` (see
 * `advanceGaitPhaseRad`); the default phase convention 2π·gaitDistanceM/presentationStrideLengthM is unchanged.
 */
export function strideLengthForSpeedM(speedMps) {
  if (!Number.isFinite(speedMps) || speedMps < 0) throw new TypeError('speedMps must be finite and >= 0');
  const v = Math.max(STRIDE_MIN_SPEED_MPS, speedMps);
  return PRESENTATION_STRIDE_LENGTH_M * Math.pow(v / STRIDE_REFERENCE_SPEED_MPS, STRIDE_SPEED_EXPONENT);
}

/**
 * Pure phase accumulator for a speed-dependent stride: new phase = phase + 2π·Δd / strideLengthForSpeedM(v).
 * The caller keeps the returned phase (state) and passes it back as `gaitPhaseRad`.
 */
export function advanceGaitPhaseRad(phaseRad, deltaDistanceM, speedMps) {
  if (!Number.isFinite(phaseRad) || !Number.isFinite(deltaDistanceM) || deltaDistanceM < 0) {
    throw new TypeError('phaseRad must be finite and deltaDistanceM finite and >= 0');
  }
  return positiveModulo(phaseRad + TAU * deltaDistanceM / strideLengthForSpeedM(speedMps), TAU);
}

/**
 * Creates a deterministic, renderer-independent pose for the static rig template.
 *
 * The caller supplies the current motion state. `phase` may be an animation intent (`idle`, `walk`,
 * `stop`, `airborne`, or `paused`) or a simulation lifecycle phase (`ready`, `running`, `arrived`).
 * If `groundContactStatus` is supplied, only a valid `ok` sample can classify an ungrounded body as
 * airborne. `airborne` is the explicit jump/trajectory intent; unknown contact alone never starts
 * that pose and produces a static `unknown` neutral pose. This presentation state makes no contact
 * claim. When contact status is omitted, the legacy `grounded` behavior is retained. Explicit `stop`
 * or lifecycle `arrived` selects the settled stop pose; `running` with zero horizontal speed is
 * idle, since a stateless input cannot infer that a stop transition just occurred. `paused` is not
 * a separate body pose: retain the motion state and freeze `timeS` while paused, and the exact same
 * input produces the exact same pose. A stateless `stop` is a settled, time-independent stance
 * because no transition-start timestamp is provided.
 *
 * `offset` and `rotationRad` in each part pose are local model units/radians. The offset is applied
 * to that template part's neutral `center`; its rotation is applied about that resulting center.
 * A renderer may then apply the whole-rig world transform (including heading) separately.
 *
 * Optional `gaitDistanceM` (finite, >= 0) is the cumulative horizontal distance travelled, in metres. When
 * given, the walk gait phase is `2π · gaitDistanceM / presentationStrideLengthM`, so it stays continuous
 * while speed changes; when omitted, the phase is `2π · (speed / stride) · timeS` as before.
 * Optional `gaitPhaseRad` (finite) is a caller-accumulated phase (see `advanceGaitPhaseRad`) and wins over both.
 *
 * Mid-air, the pose is a continuous blend of the flight pose with the grounded gait pose near take-off
 * (vertical speed 2.0 -> 1.2 m/s) and with the touchdown-absorb pose before landing (-1.2 -> -2.0 m/s), so a
 * jump does not snap the whole body between poses. All weights are functions of the inputs only.
 *
 * @param {{timeS:number, horizontalSpeedMps:number, verticalSpeedMps:number,
 *   grounded:boolean, airborne?:boolean, landingRecovery?:boolean, landingRecoveryFrac?:number,
 *   groundContactStatus?:string, gaitDistanceM?:number, gaitPhaseRad?:number,
 *   phase:'idle'|'walk'|'stop'|'airborne'|'paused'|'ready'|'running'|'arrived'}} state
 * `viewModel` is an additive, presentation-only first-person overlay (local model units/radians) for the
 * lower-frame torso/arms: `offset` and `rotationRad` are small breath and step/landing terms, and
 * `breathPhaseRad` / `stepPhaseRad` expose the phases they use. It does not alter any other field.
 *
 * @returns {{pose:'idle'|'walk'|'stop'|'airborne'|'landing'|'unknown', gaitPhaseRad:number, gaitFrequencyHz:number,
 *   rootOffset:[number,number,number], rootRotationRad:[number,number,number],
 *   parts:Record<string,{offset:[number,number,number],rotationRad:[number,number,number]}>,
 *   viewModel:{offset:[number,number,number], rotationRad:[number,number,number],
 *     breathPhaseRad:number, stepPhaseRad:number}}}
 */
export function poseAstronautRig(state) {
  assertMotionState(state);

  const { timeS, horizontalSpeedMps: speed, verticalSpeedMps, grounded, groundContactStatus, phase } = state;
  const contactKnown = groundContactStatus === undefined || groundContactStatus === 'ok';
  // An explicit `landingRecovery: false` forces no recovery; the fraction is clamped to [0, 1].
  let recFrac = 0;
  if (state.landingRecovery !== false && (state.landingRecovery === true || (state.landingRecoveryFrac ?? 0) > 0)) {
    recFrac = Math.min(1, state.landingRecoveryFrac !== undefined ? state.landingRecoveryFrac : 1);
  }

  let pose;
  if (phase === 'airborne' || state.airborne === true || (contactKnown && !grounded)) {
    pose = 'airborne';
  } else if (!contactKnown) {
    pose = 'unknown';
  } else if (phase === 'stop' || phase === 'arrived') {
    pose = 'stop';
  } else if (recFrac > 0 && speed <= MOVING_SPEED_EPSILON_MPS) {
    pose = 'landing';
  } else if (speed > MOVING_SPEED_EPSILON_MPS && phase !== 'idle' && phase !== 'ready') {
    pose = 'walk';
  } else {
    pose = 'idle';
  }

  const gaitFrequencyHz = pose === 'walk' ? speed / PRESENTATION_STRIDE_LENGTH_M : 0;
  // Accumulated phase / distance keeps the phase continuous when speed changes; time-based phase is the fallback.
  const gaitPhaseFor = () => {
    if (state.gaitPhaseRad !== undefined) return positiveModulo(state.gaitPhaseRad, TAU);
    if (state.gaitDistanceM !== undefined) return positiveModulo(TAU * state.gaitDistanceM / PRESENTATION_STRIDE_LENGTH_M, TAU);
    return positiveModulo(TAU * (speed / PRESENTATION_STRIDE_LENGTH_M) * timeS, TAU);
  };
  const gaitPhaseRad = pose === 'walk' ? gaitPhaseFor() : 0;

  let core;
  if (pose === 'walk' || pose === 'landing' || pose === 'idle') {
    core = groundedCore({ timeS, speed: pose === 'walk' ? speed : 0, recFrac, gaitPhaseRad });
  } else if (pose === 'airborne') {
    core = airborneCore({ timeS, speed, verticalSpeedMps, recFrac: 0, carryPhaseRad: gaitPhaseFor() });
  } else {
    core = staticStanceCore();
  }

  const parts = completeParts(core.parts);
  const viewModel = buildFirstPersonViewModel(pose, timeS, speed, verticalSpeedMps, gaitPhaseRad, recFrac);

  return deepFreeze({
    pose, gaitPhaseRad, gaitFrequencyHz,
    rootOffset: core.rootOffset, rootRotationRad: core.rootRotationRad, parts, viewModel,
  });
}

/**
 * Pure, continuous blend between two poses (anything with `rootOffset`, `rootRotationRad`, `parts`).
 * Offsets and Euler angles are interpolated linearly; rigid followers (visor, wrist/ankle rings, soles)
 * are re-derived from their blended parents so attachments stay exact. `t` is clamped to [0, 1];
 * t = 0 returns `a` and t = 1 returns `b` (as copies, only the three pose fields).
 */
export function blendRigPoses(a, b, t) {
  if (!isPoseLike(a) || !isPoseLike(b) || !Number.isFinite(t)) {
    throw new TypeError('blendRigPoses requires two pose objects and a finite t');
  }
  const w = Math.max(0, Math.min(1, t));
  if (w === 0) return copyPoseFields(a);
  if (w === 1) return copyPoseFields(b);
  const core = blendCores(a, b, w);
  return deepFreeze({
    rootOffset: core.rootOffset, rootRotationRad: core.rootRotationRad, parts: completeParts(core.parts),
  });
}

// Hinged joints (offset is a pure function of the rotation about the pivot) and chained children
// (glove on arm, boot on leg). Chained children are blended in their parent-local frame, not in world Euler.
const HINGE_IDS = Object.freeze(['helmet', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
const CHAIN_PARENT = Object.freeze({ leftGlove: 'leftArm', rightGlove: 'rightArm', leftBoot: 'leftLeg', rightBoot: 'rightLeg' });

function isPoseLike(p) {
  return p && typeof p === 'object' && Array.isArray(p.rootOffset) && Array.isArray(p.rootRotationRad) && p.parts && typeof p.parts === 'object';
}

function copyPoseFields(p) {
  const parts = {};
  for (const id of PART_IDS) {
    const src = p.parts[id] ?? fixedPart();
    parts[id] = { offset: [...src.offset], rotationRad: [...src.rotationRad] };
  }
  return deepFreeze({ rootOffset: [...p.rootOffset], rootRotationRad: [...p.rootRotationRad], parts });
}

function lerp3(a, b, w) {
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}

// Blends two poses/cores (anything with rootOffset, rootRotationRad and parts[id].rotationRad). Missing parts
// count as zero rotation (a missing chained child counts as zero local rotation, i.e. it rides its parent).
// Hinge and chain-local rotations are interpolated, then every offset is re-derived from the blended
// rotations, so pivots and chained attachments are exact for every t, not only at the endpoints.
// Followers are not returned here; completeParts derives them from the blended parents.
function blendCores(a, b, w) {
  const rotOf = (p, id) => (p.parts[id] ? [...p.parts[id].rotationRad] : [0, 0, 0]);
  const localOf = (p, id) => (p.parts[id] ? localRotationOf(rotOf(p, CHAIN_PARENT[id]), rotOf(p, id)) : [0, 0, 0]);
  const parts = {};
  for (const id of HINGE_IDS) {
    parts[id] = hingedPart3D(id, lerp3(rotOf(a, id), rotOf(b, id), w));
  }
  for (const id of Object.keys(CHAIN_PARENT)) {
    const parentRot = parts[CHAIN_PARENT[id]].rotationRad;
    parts[id] = chainedLimbPart(id, CHAIN_PARENT[id], parentRot, lerp3(localOf(a, id), localOf(b, id), w));
  }
  return {
    rootOffset: lerp3(a.rootOffset, b.rootOffset, w),
    rootRotationRad: lerp3(a.rootRotationRad, b.rootRotationRad, w),
    parts,
  };
}

// Child rotation relative to its parent: R_local = R_parent^T * R_child, as Euler angles in the rig convention.
function localRotationOf(parentRot, childRot) {
  const rp = eulerToMatrix(parentRot);
  const rpT = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rp[j][i]));
  return matrixToEuler(multiply3x3(rpT, eulerToMatrix(childRot)));
}

// Weight of the grounded gait pose toward 'running' (lope); 0 below Fr ~0.35, 1 above ~0.65.
function lopeWeight(speed) {
  return smoothstep01((froudeNumber(speed) - 0.35) / 0.3);
}

// Grounded pose: walk / idle / landing share one parameterisation, so that
// idle = speed 0, landing = speed 0 with recovery, and walk-with-recovery agree at the 0.04 m/s threshold.
function groundedCore({ timeS, speed, recFrac, gaitPhaseRad }) {
  const cycle = Math.sin(gaitPhaseRad);
  const breath = Math.sin(TAU * BREATH_HZ * timeS);
  // Apollo/Mars EVA loping gait: wide stride amplitude, pronounced vertical flight bounce (bob),
  // and rhythmic low-gravity arm counter-swing with pressurized suit clearance.
  // Every walk term starts from the idle pose at the idle/walk threshold: the idle breath fades out
  // with speed, static arm/grip values interpolate from the idle values, and the rhythmic gait
  // terms (swing, bounce, sway, clearance) ease in over GAIT_EASE_MPS above the threshold.
  const speedNorm = Math.min(1, speed / WALK_FULL_SPEED_MPS);
  const ease = smoothstep01((speed - MOVING_SPEED_EPSILON_MPS) / GAIT_EASE_MPS);
  const gaitNorm = speedNorm * ease;
  // Froude-based lope weight (Mars g): reaches ~0.5 near the model walk->run speed, adds longer
  // flight bounce, deeper forward lean and slightly wider swing. It is 0 at the 0.04 m/s threshold.
  const lope = lopeWeight(speed);
  const idleFade = (1 - speedNorm) * (1 - recFrac);
  const amplitude = 0.52 * gaitNorm * (1 + 0.1 * lope);
  const lopeBounce = 0.035 * gaitNorm * (1 + 0.6 * lope) * (1 - Math.cos(2 * gaitPhaseRad));
  const squash = 0.065 * recFrac;
  const driftPhase = TAU * IDLE_DRIFT_HZ * timeS;
  const driftX = IDLE_DRIFT_X * Math.sin(driftPhase) * idleFade;
  const driftYaw = IDLE_DRIFT_YAW_RAD * Math.sin(driftPhase + 1.3) * idleFade;
  const rootOffset = [driftX, 0, lopeBounce - squash + 0.006 * breath * idleFade];

  const forwardLean = (0.04 + 0.035 * lope) * speedNorm;
  const hipRoll = 0.015 * speedNorm * cycle;
  // Shoulder (upper body) yaw; the legs counter-rotate (pelvis yaw) so shoulders and hips oppose.
  const shoulderYaw = 0.045 * gaitNorm * cycle;
  const pelvisYaw = 0.035 * gaitNorm * cycle;
  const gaitLeanRad = forwardLean + 0.03 * speedNorm * cycle;
  const recoveryLeanRad = 0.045 * recFrac;
  const rootRotationRad = [gaitLeanRad + recoveryLeanRad, hipRoll, shoulderYaw + driftYaw];

  const parts = {};
  parts.helmet = hingedPart3D('helmet', [
    -0.35 * gaitLeanRad - 0.30 * recoveryLeanRad - 0.008 * breath * idleFade, -0.4 * hipRoll, -0.3 * shoulderYaw,
  ]);

  // Arms counter-swing (opposite sign to the same-side leg) at a calmer share of the leg swing.
  const armSwing = ARM_TO_LEG_SWING_RATIO * amplitude * cycle;
  const armFlare = 0.02 * (1 - recFrac) + 0.04 * speedNorm + 0.22 * recFrac;
  const armYaw = 0.04 * gaitNorm * cycle;
  const armPitchIdle = -0.018 * breath * idleFade - 0.18 * recFrac;
  // EVA gloves follow arms with natural pre-curved inward working grip
  const gripPitch = (-0.08 - 0.02 * speedNorm) * (1 - recFrac) - 0.015 * breath * idleFade - 0.14 * recFrac;
  const gripRoll = (0.03 + 0.02 * speedNorm) * (1 - recFrac) + 0.06 * recFrac;
  const gripYaw = 0.03 * gaitNorm * cycle;
  setArms(
    parts,
    [-armSwing + armPitchIdle, armFlare, -armYaw],
    [armSwing + armPitchIdle, -armFlare, armYaw],
    [gripPitch, gripRoll, -gripYaw],
    [gripPitch, -gripRoll, gripYaw],
  );

  const legSwing = amplitude * cycle;
  const legAbsorb = 0.18 * recFrac;
  const legClearance = 0.03 * ease + 0.04 * recFrac;
  const legYaw = -(shoulderYaw + pelvisYaw);
  const leftLegRot = [legSwing - legAbsorb, -legClearance, legYaw];
  const rightLegRot = [-legSwing - legAbsorb, legClearance, legYaw];
  parts.leftLeg = hingedPart3D('leftLeg', leftLegRot);
  parts.rightLeg = hingedPart3D('rightLeg', rightLegRot);

  const bootSwing = 0.30 * amplitude * cycle;
  const bootAbsorb = 0.14 * recFrac;
  const leftAnklePush = cycle > 0 ? 0.12 * amplitude * cycle : 0.04 * amplitude * cycle;
  const rightAnklePush = -cycle > 0 ? -0.12 * amplitude * cycle : -0.04 * amplitude * cycle;
  const leftBootTargetPitch = bootSwing + leftAnklePush + bootAbsorb;
  const rightBootTargetPitch = -bootSwing + rightAnklePush + bootAbsorb;
  parts.leftBoot = chainedLimbPart('leftBoot', 'leftLeg', leftLegRot, [leftBootTargetPitch - leftLegRot[0], 0, 0]);
  parts.rightBoot = chainedLimbPart('rightBoot', 'rightLeg', rightLegRot, [rightBootTargetPitch - rightLegRot[0], 0, 0]);

  return { rootOffset, rootRotationRad, parts };
}

// Mars low-gravity jump kinematics (0.38g), flight pose only:
// 1. Ascent (verticalSpeedMps > 0.5): arms forward/upward, legs trailing backward.
// 2. Apex Balance (|verticalSpeedMps| <= 0.5): floating equilibrium, arms flared out, legs soft.
// 3. Descent (verticalSpeedMps < -0.5): legs/boots reaching forward to brace for touchdown.
function flightCore(timeS, vz) {
  const tAscent = smoothstep01((vz - 0.5) / 1.0);
  const tDescent = smoothstep01((-vz - 0.5) / 1.0);
  const tApex = 1 - tAscent - tDescent;

  const rootPitch = tAscent * 0.045 - tDescent * 0.04;
  const rootRotationRad = [rootPitch, 0, 0];
  const apexFloat = tApex * 0.012 * Math.sin(timeS * 2.5);
  const rootOffset = [0, 0, apexFloat];

  const parts = {};
  parts.helmet = hingedPart3D('helmet', [-0.45 * rootPitch - tDescent * 0.06, 0, 0]);

  const leftArmPitch = tAscent * -0.55 + tApex * -0.26 + tDescent * -0.32;
  const leftArmRoll = tAscent * 0.10 + tApex * 0.20 + tDescent * 0.14;
  // Hands adapt dynamically across jump regimes
  const gripPitch = tAscent * -0.08 + tApex * -0.06 + tDescent * -0.12;
  const gripRoll = tAscent * 0.04 + tApex * 0.08 + tDescent * 0.05;
  setArms(
    parts,
    [leftArmPitch, leftArmRoll, 0],
    [leftArmPitch, -leftArmRoll, 0],
    [gripPitch, gripRoll, 0],
    [gripPitch, -gripRoll, 0],
  );

  const legPitch = tAscent * 0.22 + tApex * 0.06 - tDescent * 0.26;
  const legSpread = 0.03 + tApex * 0.02;
  const stagger = tApex * 0.04;
  const leftLegRot = [legPitch + stagger, -legSpread, 0];
  const rightLegRot = [legPitch - stagger, legSpread, 0];
  parts.leftLeg = hingedPart3D('leftLeg', leftLegRot);
  parts.rightLeg = hingedPart3D('rightLeg', rightLegRot);

  const bootPitch = tAscent * 0.10 + tApex * 0.02 - tDescent * 0.14;
  parts.leftBoot = chainedLimbPart('leftBoot', 'leftLeg', leftLegRot, [bootPitch + stagger * 0.5 - leftLegRot[0], 0, 0]);
  parts.rightBoot = chainedLimbPart('rightBoot', 'rightLeg', rightLegRot, [bootPitch - stagger * 0.5 - rightLegRot[0], 0, 0]);

  return { rootOffset, rootRotationRad, parts };
}

// Airborne pose: the flight pose, blended continuously with the carried grounded gait pose just after
// take-off and with the touchdown-absorb pose just before landing (weights from vertical speed only).
function airborneCore({ timeS, speed, verticalSpeedMps: vz, carryPhaseRad }) {
  const flight = flightCore(timeS, vz);
  const carrySpeed = speed > MOVING_SPEED_EPSILON_MPS ? speed : 0;
  const wTakeoff = smoothstep01((vz - TAKEOFF_BLEND_VZ_NONE_MPS) / (TAKEOFF_BLEND_VZ_FULL_MPS - TAKEOFF_BLEND_VZ_NONE_MPS));
  const wTouch = smoothstep01((vz - TOUCH_BLEND_VZ_NONE_MPS) / (TOUCH_BLEND_VZ_FULL_MPS - TOUCH_BLEND_VZ_NONE_MPS));
  let core = flight;
  if (wTakeoff > 0) {
    core = blendCores(core, groundedCore({ timeS, speed: carrySpeed, recFrac: 0, gaitPhaseRad: carryPhaseRad }), wTakeoff);
  }
  if (wTouch > 0) {
    core = blendCores(core, groundedCore({ timeS, speed: carrySpeed, recFrac: 1, gaitPhaseRad: carryPhaseRad }), wTouch);
  }
  return core;
}

// Settled stop pose and static unknown-contact pose are the same fixed stance. No hidden previous-pose
// state or transition clock is required.
function staticStanceCore() {
  const parts = {};
  setArms(parts, [-0.035, 0.02, 0], [-0.035, -0.02, 0], [-0.08, 0.03, 0], [-0.08, -0.03, 0]);
  return { rootOffset: [0, 0, 0], rootRotationRad: [0, 0, 0], parts };
}

// Fills the non-follower parts that a core did not pose, then derives every rigid follower.
function completeParts(coreParts) {
  const parts = {};
  for (const id of PART_IDS) {
    if (RIGID_FOLLOWERS[id]) continue;
    parts[id] = coreParts[id] ?? fixedPart();
  }
  for (const id of FOLLOWER_IDS) parts[id] = rigidFollowPart(id, RIGID_FOLLOWERS[id], parts[RIGID_FOLLOWERS[id]]);
  return parts;
}

/**
 * A child rigidly attached to a parent moves exactly with the parent's pose: its neutral center is carried
 * about the parent's resulting center by the parent rotation, and it takes the parent's rotation.
 */
export function rigidFollowPart(childId, parentId, parentPose) {
  const parent = ASTRONAUT_RIG.parts[parentId];
  const child = ASTRONAUT_RIG.parts[childId];
  const d = [child.center[0] - parent.center[0], child.center[1] - parent.center[1], child.center[2] - parent.center[2]];
  const rd = rotateEuler(d, parentPose.rotationRad);
  const offset = [0, 1, 2].map((i) => parent.center[i] + parentPose.offset[i] + rd[i] - child.center[i] + 0);
  return { offset, rotationRad: [parentPose.rotationRad[0] + 0, parentPose.rotationRad[1] + 0, parentPose.rotationRad[2] + 0] };
}

// Stage 16: presentation-only first-person breath and step terms. Reads only values already derived
// by poseAstronautRig; it never changes the world-rig outputs.
function buildFirstPersonViewModel(pose, timeS, horizontalSpeedMps, verticalSpeedMps, gaitPhaseRad, recFrac) {
  if (pose === 'unknown') {
    // Unknown contact stays neutral: no breath, no step, no contact claim.
    return deepFreeze({ offset: [0, 0, 0], rotationRad: [0, 0, 0], breathPhaseRad: 0, stepPhaseRad: 0 });
  }

  const breathPhaseRad = positiveModulo(TAU * BREATH_HZ * timeS, TAU);
  const breath = Math.sin(breathPhaseRad);
  let breathScale = 1;
  let offsetX = 0;
  let offsetZ = 0;
  let rollRad = 0;

  if (pose === 'walk') {
    // Breath fades toward half strength as speed rises; step sway is synchronized to gait phase.
    const speedNorm = Math.min(1, horizontalSpeedMps / VM_WALK_FULL_SPEED_MPS);
    breathScale = 1 - 0.5 * speedNorm;
    const gaitSin = Math.sin(gaitPhaseRad);
    offsetX = VM_STEP_SWAY_X * speedNorm * gaitSin;
    offsetZ = VM_STEP_BOB_Z * speedNorm * (1 - Math.cos(2 * gaitPhaseRad)) / 2;
    rollRad = VM_STEP_ROLL_RAD * speedNorm * gaitSin;
  } else if (pose === 'airborne') {
    // No step sway in flight; arms lag slightly (up when rising, down when falling), clamped.
    breathScale = 0.5;
    offsetZ = VM_AIRBORNE_LAG_Z * Math.max(-1, Math.min(1, verticalSpeedMps / VM_AIRBORNE_LAG_SPEED_MPS));
  }

  offsetZ += VM_BREATH_OFFSET_Z * breathScale * breath;
  const pitchRad = VM_BREATH_PITCH_RAD * breathScale * breath;

  let dipZ = 0;
  let dipPitchRad = 0;
  if (pose === 'walk' || pose === 'landing') {
    // Landing recovery dip, applied during landing and during walk-with-recovery.
    dipZ = -VM_RECOVERY_DIP_Z * recFrac;
    dipPitchRad = VM_RECOVERY_DIP_PITCH_RAD * recFrac;
  }

  return deepFreeze({
    offset: [offsetX, 0, offsetZ + dipZ],
    rotationRad: [pitchRad + dipPitchRad, 0, rollRad],
    breathPhaseRad,
    stepPhaseRad: gaitPhaseRad,
  });
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function part(id, size, center, pivot, colorRgb, materialKey) {
  const material = MATERIALS[materialKey];
  const side = center[0] > 1e-9 ? 'physicalLeft' : center[0] < -1e-9 ? 'physicalRight' : 'center';
  return {
    id, geometry: 'unitBox', size, center, pivot, colorRgb, side,
    material: {
      albedoLinear: colorRgb.map((c) => Math.round(srgbToLinear(c) * 1e4) / 1e4),
      roughness: material.roughness,
      metallic: material.metallic,
    },
  };
}

/**
 * Pure material resolver for the renderer. Uses `part.material` (linear albedo, roughness, metallic) when it is
 * valid; otherwise falls back to the legacy path: `colorRgb` (sRGB) converted to linear, matte dielectric.
 * Returns fresh values; never mutates the frozen rig template.
 */
export function resolvePartMaterial(part) {
  const m = part?.material;
  const inUnit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (m && Array.isArray(m.albedoLinear) && m.albedoLinear.length === 3 && m.albedoLinear.every(inUnit) &&
      inUnit(m.roughness) && inUnit(m.metallic)) {
    return { albedoLinear: [...m.albedoLinear], roughness: m.roughness, metallic: m.metallic };
  }
  const color = part?.colorRgb;
  if (!Array.isArray(color) || color.length !== 3 || !color.every(inUnit)) {
    throw new TypeError('rig part requires a valid material or colorRgb in [0, 1]');
  }
  return { albedoLinear: color.map(srgbToLinear), roughness: 0.8, metallic: 0 };
}

export function hingedPart3D(id, rotationRad, extraOffset = [0, 0, 0]) {
  const { center, pivot } = ASTRONAUT_RIG.parts[id];
  const dx = center[0] - pivot[0];
  const dy = center[1] - pivot[1];
  const dz = center[2] - pivot[2];
  const [rx, ry, rz] = rotateEuler([dx, dy, dz], rotationRad);
  return {
    offset: [rx - dx + extraOffset[0], ry - dy + extraOffset[1], rz - dz + extraOffset[2]],
    rotationRad: [...rotationRad],
  };
}

/**
 * Calculates hierarchical kinematics for a child part attached to a parent joint (e.g. glove on arm).
 * The child rotates with its own local joint rotation (wrist) and is carried by the parent's pivot rotation (shoulder).
 * The returned rotationRad is the true orientation composition R = R_parent * R_child (child applied
 * first, Euler order X then Y then Z as in rotateEuler), re-extracted to Euler angles. It is not a
 * component-wise sum, which only approximates the composition for small angles.
 *
 * @param {string} childId
 * @param {string} parentId
 * @param {[number,number,number]} parentRotationRad
 * @param {[number,number,number]} childLocalRotationRad
 * @returns {{offset:[number,number,number], rotationRad:[number,number,number]}}
 */
export function chainedLimbPart(childId, parentId, parentRotationRad, childLocalRotationRad = [0, 0, 0]) {
  const parent = ASTRONAUT_RIG.parts[parentId];
  const child = ASTRONAUT_RIG.parts[childId];

  // 1. Child neutral vector relative to child pivot (e.g. glove center relative to wrist)
  const dChild = [
    child.center[0] - child.pivot[0],
    child.center[1] - child.pivot[1],
    child.center[2] - child.pivot[2],
  ];
  // 2. Rotate child relative to its own pivot by childLocalRotationRad
  const dChildRot = rotateEuler(dChild, childLocalRotationRad);

  // 3. Child pivot relative to parent pivot (e.g. wrist relative to shoulder)
  // combined with the locally rotated child offset
  const dParent = [
    child.pivot[0] - parent.pivot[0] + dChildRot[0],
    child.pivot[1] - parent.pivot[1] + dChildRot[1],
    child.pivot[2] - parent.pivot[2] + dChildRot[2],
  ];

  // 4. Rotate the entire chain by parentRotationRad (e.g. shoulder rotation)
  const dParentRot = rotateEuler(dParent, parentRotationRad);

  // 5. Final world-relative position of child center relative to parent pivot
  const finalCenter = [
    parent.pivot[0] + dParentRot[0],
    parent.pivot[1] + dParentRot[1],
    parent.pivot[2] + dParentRot[2],
  ];

  // 6. Child offset is difference between final center and neutral center
  const offset = [
    finalCenter[0] - child.center[0],
    finalCenter[1] - child.center[1],
    finalCenter[2] - child.center[2],
  ];

  // 7. Combined orientation: true matrix composition R = R_parent * R_child (child applied first).
  // With an identity child rotation the composition is exactly the parent rotation (no matrix round-trip).
  const childIsIdentity = childLocalRotationRad[0] === 0 && childLocalRotationRad[1] === 0 && childLocalRotationRad[2] === 0;
  const rotationRad = childIsIdentity
    ? [parentRotationRad[0], parentRotationRad[1], parentRotationRad[2]]
    : matrixToEuler(multiply3x3(eulerToMatrix(parentRotationRad), eulerToMatrix(childLocalRotationRad)));

  return { offset, rotationRad };
}

function rotateEuler([x, y, z], [rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y1 = cx * y - sx * z;
  const z1 = sx * y + cx * z;
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x2 = cy * x + sy * z1;
  const z2 = -sy * x + cy * z1;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [cz * x2 - sz * y1, sz * x2 + cz * y1, z2];
}

// R = Rz(rz) * Ry(ry) * Rx(rx) applied to column vectors, matching rotateEuler's X -> Y -> Z order.
// Verified against rotateEuler: Rx gives (y1, z1), Ry gives (x2, z2), Rz gives (x3, y3) with the same
// sign conventions as the standard right-handed axis matrices.
function eulerToMatrix([rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}

function multiply3x3(a, b) {
  return a.map((row) => [0, 1, 2].map((col) => row[0] * b[0][col] + row[1] * b[1][col] + row[2] * b[2][col]));
}

// Inverse of eulerToMatrix for the same convention. Gimbal lock (|R[2][0]| ~ 1) sets rz = 0.
function matrixToEuler(r) {
  const clean = (v) => (Object.is(v, -0) ? 0 : v);
  const clamped = Math.max(-1, Math.min(1, r[2][0]));
  const ry = clean(-Math.asin(clamped));
  if (Math.abs(r[2][0]) > 0.999999) {
    return [clean(Math.atan2(-r[1][2], r[1][1])), ry, 0];
  }
  return [clean(Math.atan2(r[2][1], r[2][2])), ry, clean(Math.atan2(r[1][0], r[0][0]))];
}

function fixedPart() {
  return { offset: [0, 0, 0], rotationRad: [0, 0, 0] };
}

function assertMotionState(state) {
  if (!state || !Number.isFinite(state.timeS) || state.timeS < 0 ||
      !Number.isFinite(state.horizontalSpeedMps) || state.horizontalSpeedMps < 0 ||
      !Number.isFinite(state.verticalSpeedMps) || typeof state.grounded !== 'boolean' ||
      (state.airborne !== undefined && typeof state.airborne !== 'boolean') ||
      (state.landingRecovery !== undefined && typeof state.landingRecovery !== 'boolean') ||
      (state.landingRecoveryFrac !== undefined && (!Number.isFinite(state.landingRecoveryFrac) || state.landingRecoveryFrac < 0)) ||
      (state.gaitDistanceM !== undefined && (!Number.isFinite(state.gaitDistanceM) || state.gaitDistanceM < 0)) ||
      (state.gaitPhaseRad !== undefined && !Number.isFinite(state.gaitPhaseRad))) {
    throw new TypeError('state requires finite timeS, non-negative horizontalSpeedMps, finite verticalSpeedMps, boolean grounded, and (if given) finite non-negative gaitDistanceM / finite gaitPhaseRad');
  }
  if (!VALID_PHASES.includes(state.phase)) throw new TypeError(`state.phase must be one of: ${VALID_PHASES.join(', ')}`);
}

// Writes the arm hinges and the chained gloves (wrist rotations are local to each arm).
function setArms(parts, leftArmRot, rightArmRot, leftGrip, rightGrip) {
  parts.leftArm = hingedPart3D('leftArm', leftArmRot);
  parts.rightArm = hingedPart3D('rightArm', rightArmRot);
  parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, leftGrip);
  parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, rightGrip);
}

function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function createUnitBoxGeometry() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    { normal: [1, 0, 0], corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { normal: [-1, 0, 0], corners: [[-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { normal: [0, 1, 0], corners: [[0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]] },
    { normal: [0, -1, 0], corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
    { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { normal: [0, 0, -1], corners: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]] },
  ];
  for (const face of faces) {
    const first = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(...corner);
      normals.push(...face.normal);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  return { primitive: 'triangles', positions, normals, indices };
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
