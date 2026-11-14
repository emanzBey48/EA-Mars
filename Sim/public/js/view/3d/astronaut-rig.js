// Presentation-only astronaut part geometry and deterministic pose generation.

export const FIRST_PERSON_RIG_PARTS = Object.freeze([
  'torso',
  'chestPack',
  'leftArm',
  'rightArm',
  'leftGlove',
  'rightGlove',
]);

/**
 * Immutable, renderer-independent rig template. All dimensions, colors, and proportions are visual
 * design units only; they do not describe a real suit, human body, or biomechanical model.
 *
 * Coordinate system: X is astronaut-left/right, Y is horizontal depth, Z is up. The astronaut faces
 * local -Y. `geometry.positions` contains a reusable unit box centered at the origin; each part's
 * `size`, `center`, `pivot`, and `colorRgb` are plain arrays a renderer can use to instance it.
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
    presentationStrideLengthM: 1.25,
    firstPersonParts: FIRST_PERSON_RIG_PARTS,
  },
  geometry: createUnitBoxGeometry(),
  parts: {
    torso: part('torso', [0.44, 0.34, 0.58], [0, 0, 0.99], [0, 0, 0.99], [0.94, 0.43, 0.08]),
    chestPack: part('chestPack', [0.26, 0.14, 0.22], [0, -0.23, 0.99], [0, 0, 0.99], [0.85, 0.88, 0.92]),
    helmet: part('helmet', [0.34, 0.31, 0.32], [0, 0, 1.48], [0, 0, 1.34], [0.92, 0.96, 1.0]),
    visor: part('visor', [0.23, 0.035, 0.16], [0, -0.17, 1.48], [0, 0, 1.34], [0.035, 0.12, 0.22]),
    backpack: part('backpack', [0.34, 0.23, 0.43], [0, 0.21, 0.99], [0, 0.21, 0.99], [0.08, 0.58, 0.98]),
    plssAntenna: part('plssAntenna', [0.035, 0.035, 0.30], [0.12, 0.23, 1.35], [0.12, 0.23, 1.205], [0.75, 0.78, 0.82]),
    leftArm: part('leftArm', [0.19, 0.23, 0.53], [-0.34, 0, 0.96], [-0.27, 0, 1.22], [0.96, 0.53, 0.14]),
    rightArm: part('rightArm', [0.19, 0.23, 0.53], [0.34, 0, 0.96], [0.27, 0, 1.22], [0.96, 0.53, 0.14]),
    leftGlove: part('leftGlove', [0.13, 0.16, 0.17], [-0.34, -0.02, 0.615], [-0.34, 0, 0.695], [0.20, 0.22, 0.25]),
    rightGlove: part('rightGlove', [0.13, 0.16, 0.17], [0.34, -0.02, 0.615], [0.34, 0, 0.695], [0.20, 0.22, 0.25]),
    leftLeg: part('leftLeg', [0.21, 0.25, 0.53], [-0.14, 0, 0.40], [-0.14, 0, 0.65], [0.96, 0.53, 0.14]),
    rightLeg: part('rightLeg', [0.21, 0.25, 0.53], [0.14, 0, 0.40], [0.14, 0, 0.65], [0.96, 0.53, 0.14]),
    leftBoot: part('leftBoot', [0.23, 0.34, 0.16], [-0.14, -0.035, 0.09], [-0.14, 0, 0.17], [0.12, 0.18, 0.24]),
    rightBoot: part('rightBoot', [0.23, 0.34, 0.16], [0.14, -0.035, 0.09], [0.14, 0, 0.17], [0.12, 0.18, 0.24]),
  },
});

const TAU = 2 * Math.PI;
const MOVING_SPEED_EPSILON_MPS = 0.04;
const PRESENTATION_STRIDE_LENGTH_M = ASTRONAUT_RIG.metadata.presentationStrideLengthM;

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
 *
 * @param {{timeS:number, horizontalSpeedMps:number, verticalSpeedMps:number,
 *   grounded:boolean, airborne?:boolean, landingRecovery?:boolean, landingRecoveryFrac?:number,
 *   groundContactStatus?:string, gaitDistanceM?:number, phase:'idle'|'walk'|'stop'|'airborne'|'paused'|'ready'|'running'|'arrived'}} state
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
  // Accumulated distance keeps the phase continuous when speed changes; time-based phase is the fallback.
  let gaitPhaseRad = 0;
  if (pose === 'walk') {
    gaitPhaseRad = state.gaitDistanceM !== undefined
      ? positiveModulo(TAU * state.gaitDistanceM / PRESENTATION_STRIDE_LENGTH_M, TAU)
      : positiveModulo(TAU * gaitFrequencyHz * timeS, TAU);
  }
  const cycle = Math.sin(gaitPhaseRad);
  const breath = Math.sin(TAU * BREATH_HZ * timeS);
  const parts = {};
  let rootOffset = [0, 0, 0];
  let rootRotationRad = [0, 0, 0];

  if (pose === 'walk') {
    // Apollo/Mars EVA loping gait: wide stride amplitude, pronounced vertical flight bounce (bob),
    // and rhythmic low-gravity arm counter-swing with pressurized suit clearance.
    // Every walk term starts from the idle pose at the idle/walk threshold: the idle breath fades out
    // with speed, static arm/grip values interpolate from the idle values, and the rhythmic gait
    // terms (swing, bounce, sway, clearance) ease in over GAIT_EASE_MPS above the threshold.
    const speedNorm = Math.min(1, speed / WALK_FULL_SPEED_MPS);
    const ease = smoothstep01((speed - MOVING_SPEED_EPSILON_MPS) / GAIT_EASE_MPS);
    const gaitNorm = speedNorm * ease;
    const idleFade = 1 - speedNorm;
    const amplitude = 0.52 * gaitNorm;
    const lopeBounce = 0.035 * gaitNorm * (1 - Math.cos(2 * gaitPhaseRad));
    const squash = 0.065 * recFrac;
    rootOffset = [0, 0, lopeBounce - squash + 0.006 * breath * idleFade];

    const forwardLean = 0.04 * speedNorm;
    const hipRoll = 0.015 * speedNorm * cycle;
    const sway = 0.02 * speedNorm * cycle;
    rootRotationRad = [forwardLean + 0.03 * speedNorm * cycle, hipRoll, sway];

    const helmetRot = [-0.35 * rootRotationRad[0] - 0.008 * breath * idleFade, -0.4 * hipRoll, -0.3 * sway];
    parts.helmet = hingedPart3D('helmet', helmetRot);
    parts.visor = chainedLimbPart('visor', 'helmet', helmetRot, [0, 0, 0]);

    const armSwing = 0.72 * amplitude * cycle;
    const armFlare = 0.02 + 0.04 * speedNorm + 0.15 * recFrac;
    const armYaw = 0.04 * gaitNorm * cycle;
    const armPitchIdle = -0.018 * breath * idleFade;
    // EVA gloves follow arms with natural pre-curved inward working grip
    const gripPitch = -0.08 - 0.02 * speedNorm - 0.015 * breath * idleFade;
    const gripRoll = 0.03 + 0.02 * speedNorm;
    const gripYaw = 0.03 * gaitNorm * cycle;
    setArms(
      parts,
      [-armSwing + armPitchIdle, armFlare, -armYaw],
      [armSwing + armPitchIdle, -armFlare, armYaw],
      [gripPitch, gripRoll, -gripYaw],
      [gripPitch, -gripRoll, gripYaw],
    );

    const legSwing = amplitude * cycle;
    const legAbsorb = 0.12 * recFrac;
    const legClearance = 0.03 * ease;
    const leftLegRot = [legSwing - legAbsorb, -legClearance, 0];
    const rightLegRot = [-legSwing - legAbsorb, legClearance, 0];
    parts.leftLeg = hingedPart3D('leftLeg', leftLegRot);
    parts.rightLeg = hingedPart3D('rightLeg', rightLegRot);

    const bootSwing = 0.30 * amplitude * cycle;
    const bootAbsorb = 0.10 * recFrac;
    const leftAnklePush = cycle > 0 ? 0.12 * amplitude * cycle : 0.04 * amplitude * cycle;
    const rightAnklePush = -cycle > 0 ? -0.12 * amplitude * cycle : -0.04 * amplitude * cycle;
    const leftBootTargetPitch = bootSwing + leftAnklePush + bootAbsorb;
    const rightBootTargetPitch = -bootSwing + rightAnklePush + bootAbsorb;
    parts.leftBoot = chainedLimbPart('leftBoot', 'leftLeg', leftLegRot, [
      leftBootTargetPitch - leftLegRot[0],
      0,
      0,
    ]);
    parts.rightBoot = chainedLimbPart('rightBoot', 'rightLeg', rightLegRot, [
      rightBootTargetPitch - rightLegRot[0],
      0,
      0,
    ]);
  } else if (pose === 'airborne') {
    // Mars low-gravity jump kinematics (0.38g):
    // 1. Ascent (verticalSpeedMps > 0.5): arms forward/upward, legs trailing backward.
    // 2. Apex Balance (|verticalSpeedMps| <= 0.5): floating equilibrium, arms flared out, legs soft.
    // 3. Descent (verticalSpeedMps < -0.5): legs/boots reaching forward to brace for touchdown.
    const vz = verticalSpeedMps;
    const tAscent = smoothstep01((vz - 0.5) / 1.0);
    const tDescent = smoothstep01((-vz - 0.5) / 1.0);
    const tApex = 1 - tAscent - tDescent;

    const rootPitch = tAscent * 0.045 - tDescent * 0.04;
    rootRotationRad = [rootPitch, 0, 0];

    const helmetRot = [-0.45 * rootPitch - tDescent * 0.06, 0, 0];
    parts.helmet = hingedPart3D('helmet', helmetRot);
    parts.visor = chainedLimbPart('visor', 'helmet', helmetRot, [0, 0, 0]);

    const apexFloat = tApex * 0.012 * Math.sin(timeS * 2.5);
    rootOffset = [0, 0, apexFloat];

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
    const leftBootTargetPitch = bootPitch + stagger * 0.5;
    const rightBootTargetPitch = bootPitch - stagger * 0.5;
    parts.leftBoot = chainedLimbPart('leftBoot', 'leftLeg', leftLegRot, [
      leftBootTargetPitch - leftLegRot[0],
      0,
      0,
    ]);
    parts.rightBoot = chainedLimbPart('rightBoot', 'rightLeg', rightLegRot, [
      rightBootTargetPitch - rightLegRot[0],
      0,
      0,
    ]);
  } else if (pose === 'landing') {
    // Landing squash & recovery: knees flex, torso drops (negative rootOffset Z), arms flare.
    // The idle breath/stance terms fade out as the recovery fraction rises (and back in as it decays),
    // so the pose is continuous with idle when recFrac reaches 0.
    const idleFade = 1 - recFrac;
    const squash = -0.065 * recFrac;
    rootOffset = [0, 0, squash + 0.006 * breath * idleFade];
    rootRotationRad = [0.045 * recFrac, 0, 0];

    const helmetRot = [-0.30 * rootRotationRad[0] - 0.008 * breath * idleFade, 0, 0];
    parts.helmet = hingedPart3D('helmet', helmetRot);
    parts.visor = chainedLimbPart('visor', 'helmet', helmetRot, [0, 0, 0]);

    const armFlare = 0.02 * idleFade + 0.22 * recFrac;
    const armPitch = -0.018 * breath * idleFade - 0.18 * recFrac;
    const leftArmRot = [armPitch, armFlare, 0];
    const rightArmRot = [armPitch, -armFlare, 0];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);

    // Wrists flex to cushion landing impact
    const gripPitch = (-0.08 - 0.015 * breath) * idleFade - 0.14 * recFrac;
    const gripRoll = 0.03 * idleFade + 0.06 * recFrac;
    setArms(
      parts,
      [armPitch, armFlare, 0],
      [armPitch, -armFlare, 0],
      [gripPitch, gripRoll, 0],
      [gripPitch, -gripRoll, 0],
    );

    const legFlex = -0.18 * recFrac;
    const bootFlex = 0.14 * recFrac;
    const legSpread = 0.04 * recFrac;
    const leftLegRot = [legFlex, -legSpread, 0];
    const rightLegRot = [legFlex, legSpread, 0];
    parts.leftLeg = hingedPart3D('leftLeg', leftLegRot);
    parts.rightLeg = hingedPart3D('rightLeg', rightLegRot);
    parts.leftBoot = chainedLimbPart('leftBoot', 'leftLeg', leftLegRot, [bootFlex - legFlex, 0, 0]);
    parts.rightBoot = chainedLimbPart('rightBoot', 'rightLeg', rightLegRot, [bootFlex - legFlex, 0, 0]);
  } else if (pose === 'stop') {
    // Fixed settled stance: no hidden previous-pose state or transition clock is required.
    const leftArmRot = [-0.035, 0.02, 0];
    const rightArmRot = [-0.035, -0.02, 0];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);
    parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, [-0.08, 0.03, 0]);
    parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, [-0.08, -0.03, 0]);
  } else if (pose === 'unknown') {
    // Static neutral presentation: unknown contact is not visually asserted as ground or flight.
    const leftArmRot = [-0.035, 0.02, 0];
    const rightArmRot = [-0.035, -0.02, 0];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);
    parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, [-0.08, 0.03, 0]);
    parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, [-0.08, -0.03, 0]);
  } else {
    // A small deterministic idle breath freezes naturally when the caller freezes timeS.
    rootOffset = [0, 0, 0.006 * breath];
    const helmetRot = [-0.008 * breath, 0, 0];
    parts.helmet = hingedPart3D('helmet', helmetRot);
    parts.visor = chainedLimbPart('visor', 'helmet', helmetRot, [0, 0, 0]);
    const leftArmRot = [-0.018 * breath, 0.02, 0];
    const rightArmRot = [-0.018 * breath, -0.02, 0];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);
    const idleGrip = [-0.08 - 0.015 * breath, 0.03, 0];
    parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, idleGrip);
    parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, [-0.08 - 0.015 * breath, -0.03, 0]);
  }

  for (const id of Object.keys(ASTRONAUT_RIG.parts)) {
    if (!parts[id]) parts[id] = fixedPart();
  }

  const viewModel = buildFirstPersonViewModel(pose, timeS, speed, verticalSpeedMps, gaitPhaseRad, recFrac);

  return deepFreeze({ pose, gaitPhaseRad, gaitFrequencyHz, rootOffset, rootRotationRad, parts, viewModel });
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

function part(id, size, center, pivot, colorRgb) {
  return { id, geometry: 'unitBox', size, center, pivot, colorRgb };
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
      (state.gaitDistanceM !== undefined && (!Number.isFinite(state.gaitDistanceM) || state.gaitDistanceM < 0))) {
    throw new TypeError('state requires finite timeS, non-negative horizontalSpeedMps, finite verticalSpeedMps, boolean grounded, and (if given) finite non-negative gaitDistanceM');
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
