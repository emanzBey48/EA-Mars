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
 * @param {{timeS:number, horizontalSpeedMps:number, verticalSpeedMps:number,
 *   grounded:boolean, airborne?:boolean, landingRecovery?:boolean, landingRecoveryFrac?:number,
 *   groundContactStatus?:string, phase:'idle'|'walk'|'stop'|'airborne'|'paused'|'ready'|'running'|'arrived'}} state
 * @returns {{pose:'idle'|'walk'|'stop'|'airborne'|'landing'|'unknown', gaitPhaseRad:number, gaitFrequencyHz:number,
 *   rootOffset:[number,number,number], rootRotationRad:[number,number,number],
 *   parts:Record<string,{offset:[number,number,number],rotationRad:[number,number,number]}>}}
 */
export function poseAstronautRig(state) {
  assertMotionState(state);

  const { timeS, horizontalSpeedMps: speed, verticalSpeedMps, grounded, groundContactStatus, phase } = state;
  const contactKnown = groundContactStatus === undefined || groundContactStatus === 'ok';
  const recFrac = (state.landingRecovery === true || (state.landingRecoveryFrac ?? 0) > 0)
    ? (state.landingRecoveryFrac !== undefined ? state.landingRecoveryFrac : 1.0)
    : 0;

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
  const gaitPhaseRad = pose === 'walk' ? positiveModulo(TAU * gaitFrequencyHz * timeS, TAU) : 0;
  const cycle = Math.sin(gaitPhaseRad);
  const parts = {};
  let rootOffset = [0, 0, 0];
  let rootRotationRad = [0, 0, 0];

  if (pose === 'walk') {
    // Apollo/Mars EVA loping gait: wide stride amplitude, pronounced vertical flight bounce (bob),
    // and rhythmic low-gravity arm counter-swing with pressurized suit clearance.
    const speedNorm = Math.min(1, speed / 1.4);
    const amplitude = 0.52 * speedNorm;
    const lopeBounce = 0.035 * speedNorm * (1 - Math.cos(2 * gaitPhaseRad));
    const squash = 0.065 * recFrac;
    rootOffset = [0, 0, lopeBounce - squash];

    const forwardLean = 0.04 * speedNorm;
    const hipRoll = 0.015 * speedNorm * cycle;
    const sway = 0.02 * speedNorm * cycle;
    rootRotationRad = [forwardLean + 0.03 * speedNorm * cycle, hipRoll, sway];

    const helmetRot = [-0.35 * rootRotationRad[0], -0.4 * hipRoll, -0.3 * sway];
    parts.helmet = hingedPart3D('helmet', helmetRot);
    parts.visor = chainedLimbPart('visor', 'helmet', helmetRot, [0, 0, 0]);

    const armSwing = 0.72 * amplitude * cycle;
    const armFlare = 0.06 + 0.15 * recFrac;
    const leftArmRot = [-armSwing, armFlare, -0.04 * cycle];
    const rightArmRot = [armSwing, -armFlare, 0.04 * cycle];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);

    // EVA gloves follow arms with natural pre-curved inward working grip
    const leftGrip = [-0.10, 0.05, -0.03 * cycle];
    const rightGrip = [-0.10, -0.05, 0.03 * cycle];
    parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, leftGrip);
    parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, rightGrip);

    const legSwing = amplitude * cycle;
    const legAbsorb = 0.12 * recFrac;
    const legClearance = 0.03;
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
    const leftArmRot = [leftArmPitch, leftArmRoll, 0];
    const rightArmRot = [leftArmPitch, -leftArmRoll, 0];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);

    // Hands adapt dynamically across jump regimes
    const gripPitch = tAscent * -0.08 + tApex * -0.06 + tDescent * -0.12;
    const gripRoll = tAscent * 0.04 + tApex * 0.08 + tDescent * 0.05;
    parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, [gripPitch, gripRoll, 0]);
    parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, [gripPitch, -gripRoll, 0]);

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
    const squash = -0.065 * recFrac;
    rootOffset = [0, 0, squash];
    rootRotationRad = [0.045 * recFrac, 0, 0];

    const helmetRot = [-0.30 * rootRotationRad[0], 0, 0];
    parts.helmet = hingedPart3D('helmet', helmetRot);
    parts.visor = chainedLimbPart('visor', 'helmet', helmetRot, [0, 0, 0]);

    const armFlare = 0.22 * recFrac;
    const armPitch = -0.18 * recFrac;
    const leftArmRot = [armPitch, armFlare, 0];
    const rightArmRot = [armPitch, -armFlare, 0];
    parts.leftArm = hingedPart3D('leftArm', leftArmRot);
    parts.rightArm = hingedPart3D('rightArm', rightArmRot);

    // Wrists flex to cushion landing impact
    const landGrip = [-0.14 * recFrac, 0.06 * recFrac, 0];
    parts.leftGlove = chainedLimbPart('leftGlove', 'leftArm', leftArmRot, landGrip);
    parts.rightGlove = chainedLimbPart('rightGlove', 'rightArm', rightArmRot, [-0.14 * recFrac, -0.06 * recFrac, 0]);

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
    const breath = Math.sin(TAU * 0.22 * timeS);
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

  return deepFreeze({ pose, gaitPhaseRad, gaitFrequencyHz, rootOffset, rootRotationRad, parts });
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

  // 7. Combined orientation: parent rotation + child local rotation
  const rotationRad = [
    parentRotationRad[0] + childLocalRotationRad[0],
    parentRotationRad[1] + childLocalRotationRad[1],
    parentRotationRad[2] + childLocalRotationRad[2],
  ];

  return { offset, rotationRad };
}

function hingedPart(id, angleRad) {
  return hingedPart3D(id, [angleRad, 0, 0]);
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

function fixedPart() {
  return { offset: [0, 0, 0], rotationRad: [0, 0, 0] };
}

function assertMotionState(state) {
  if (!state || !Number.isFinite(state.timeS) || state.timeS < 0 ||
      !Number.isFinite(state.horizontalSpeedMps) || state.horizontalSpeedMps < 0 ||
      !Number.isFinite(state.verticalSpeedMps) || typeof state.grounded !== 'boolean' ||
      (state.airborne !== undefined && typeof state.airborne !== 'boolean') ||
      (state.landingRecovery !== undefined && typeof state.landingRecovery !== 'boolean') ||
      (state.landingRecoveryFrac !== undefined && (!Number.isFinite(state.landingRecoveryFrac) || state.landingRecoveryFrac < 0))) {
    throw new TypeError('state requires finite timeS, non-negative horizontalSpeedMps, finite verticalSpeedMps, and boolean grounded');
  }
  const phases = ['idle', 'walk', 'stop', 'airborne', 'paused', 'ready', 'running', 'arrived'];
  if (!phases.includes(state.phase)) throw new TypeError(`state.phase must be one of: ${phases.join(', ')}`);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
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
