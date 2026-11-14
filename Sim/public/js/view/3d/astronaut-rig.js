// Presentation-only astronaut part geometry and deterministic pose generation.

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
  },
  geometry: createUnitBoxGeometry(),
  parts: {
    torso: part('torso', [0.44, 0.34, 0.58], [0, 0, 0.99], [0, 0, 0.99], [0.94, 0.43, 0.08]),
    helmet: part('helmet', [0.34, 0.31, 0.32], [0, 0, 1.48], [0, 0, 1.34], [0.92, 0.96, 1.0]),
    visor: part('visor', [0.23, 0.035, 0.16], [0, -0.17, 1.48], [0, 0, 1.34], [0.035, 0.12, 0.22]),
    backpack: part('backpack', [0.34, 0.23, 0.43], [0, 0.21, 0.99], [0, 0.21, 0.99], [0.08, 0.58, 0.98]),
    leftArm: part('leftArm', [0.19, 0.23, 0.53], [-0.34, 0, 0.96], [-0.27, 0, 1.22], [0.96, 0.53, 0.14]),
    rightArm: part('rightArm', [0.19, 0.23, 0.53], [0.34, 0, 0.96], [0.27, 0, 1.22], [0.96, 0.53, 0.14]),
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
    const sway = 0.02 * speedNorm * cycle;
    rootRotationRad = [forwardLean + 0.03 * speedNorm * cycle, 0, sway];

    const armSwing = 0.72 * amplitude * cycle;
    const armFlare = 0.06 + 0.15 * recFrac;
    parts.leftArm = hingedPart3D('leftArm', [-armSwing, armFlare, -0.04 * cycle]);
    parts.rightArm = hingedPart3D('rightArm', [armSwing, -armFlare, 0.04 * cycle]);

    const legSwing = amplitude * cycle;
    const legAbsorb = 0.12 * recFrac;
    const legClearance = 0.03;
    parts.leftLeg = hingedPart3D('leftLeg', [legSwing - legAbsorb, -legClearance, 0]);
    parts.rightLeg = hingedPart3D('rightLeg', [-legSwing - legAbsorb, legClearance, 0]);

    const bootSwing = 0.30 * amplitude * cycle;
    const bootAbsorb = 0.10 * recFrac;
    parts.leftBoot = hingedPart3D('leftBoot', [bootSwing + bootAbsorb, -legClearance, 0]);
    parts.rightBoot = hingedPart3D('rightBoot', [-bootSwing + bootAbsorb, legClearance, 0]);
  } else if (pose === 'airborne') {
    // Mars low-gravity jump kinematics (0.38g):
    // 1. Ascent (verticalSpeedMps > 0.5): arms forward/upward, legs trailing backward.
    // 2. Apex Balance (|verticalSpeedMps| <= 0.5): floating equilibrium, arms flared out, legs soft.
    // 3. Descent (verticalSpeedMps < -0.5): legs/boots reaching forward to brace for touchdown.
    const vz = verticalSpeedMps;
    const tAscent = Math.max(0, Math.min(1, (vz - 0.5) / 1.0));
    const tDescent = Math.max(0, Math.min(1, (-vz - 0.5) / 1.0));
    const tApex = 1 - tAscent - tDescent;

    const rootPitch = tAscent * 0.045 - tDescent * 0.04;
    rootRotationRad = [rootPitch, 0, 0];

    const apexFloat = tApex * 0.012 * Math.sin(timeS * 2.5);
    rootOffset = [0, 0, apexFloat];

    const leftArmPitch = tAscent * -0.55 + tApex * -0.26 + tDescent * -0.32;
    const leftArmRoll = tAscent * 0.10 + tApex * 0.20 + tDescent * 0.14;
    parts.leftArm = hingedPart3D('leftArm', [leftArmPitch, leftArmRoll, 0]);
    parts.rightArm = hingedPart3D('rightArm', [leftArmPitch, -leftArmRoll, 0]);

    const legPitch = tAscent * 0.22 + tApex * 0.06 - tDescent * 0.26;
    const legSpread = 0.03 + tApex * 0.02;
    const stagger = tApex * 0.04;
    parts.leftLeg = hingedPart3D('leftLeg', [legPitch + stagger, -legSpread, 0]);
    parts.rightLeg = hingedPart3D('rightLeg', [legPitch - stagger, legSpread, 0]);

    const bootPitch = tAscent * 0.10 + tApex * 0.02 - tDescent * 0.14;
    parts.leftBoot = hingedPart3D('leftBoot', [bootPitch + stagger * 0.5, -legSpread, 0]);
    parts.rightBoot = hingedPart3D('rightBoot', [bootPitch - stagger * 0.5, legSpread, 0]);
  } else if (pose === 'landing') {
    // Landing squash & recovery: knees flex, torso drops (negative rootOffset Z), arms flare.
    const squash = -0.065 * recFrac;
    rootOffset = [0, 0, squash];
    rootRotationRad = [0.045 * recFrac, 0, 0];

    const armFlare = 0.22 * recFrac;
    const armPitch = -0.18 * recFrac;
    parts.leftArm = hingedPart3D('leftArm', [armPitch, armFlare, 0]);
    parts.rightArm = hingedPart3D('rightArm', [armPitch, -armFlare, 0]);

    const legFlex = -0.18 * recFrac;
    const bootFlex = 0.14 * recFrac;
    const legSpread = 0.04 * recFrac;
    parts.leftLeg = hingedPart3D('leftLeg', [legFlex, -legSpread, 0]);
    parts.rightLeg = hingedPart3D('rightLeg', [legFlex, legSpread, 0]);
    parts.leftBoot = hingedPart3D('leftBoot', [bootFlex, -legSpread, 0]);
    parts.rightBoot = hingedPart3D('rightBoot', [bootFlex, legSpread, 0]);
  } else if (pose === 'stop') {
    // Fixed settled stance: no hidden previous-pose state or transition clock is required.
    parts.leftArm = hingedPart3D('leftArm', [-0.035, 0.02, 0]);
    parts.rightArm = hingedPart3D('rightArm', [-0.035, -0.02, 0]);
  } else if (pose === 'unknown') {
    // Static neutral presentation: unknown contact is not visually asserted as ground or flight.
    parts.leftArm = hingedPart3D('leftArm', [-0.035, 0.02, 0]);
    parts.rightArm = hingedPart3D('rightArm', [-0.035, -0.02, 0]);
  } else {
    // A small deterministic idle breath freezes naturally when the caller freezes timeS.
    const breath = Math.sin(TAU * 0.22 * timeS);
    rootOffset = [0, 0, 0.006 * breath];
    parts.leftArm = hingedPart3D('leftArm', [-0.018 * breath, 0.02, 0]);
    parts.rightArm = hingedPart3D('rightArm', [-0.018 * breath, -0.02, 0]);
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
