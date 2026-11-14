import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASTRONAUT_RIG,
  FIRST_PERSON_RIG_PARTS,
  poseAstronautRig,
  chainedLimbPart,
} from '../public/js/view/3d/astronaut-rig.js';

const STATUS = Object.freeze({ OK: 'ok', NO_DATA: 'no_data', OUT_OF_BOUNDS: 'out_of_bounds', UNAVAILABLE: 'unavailable' });

test('astronaut rig: immutable template, coordinate metadata and geometry', () => {
  assert.equal(ASTRONAUT_RIG.metadata.forward, '-Y');
  assert.equal(ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad, Math.PI / 2);
  assert.equal(ASTRONAUT_RIG.metadata.presentationStrideLengthM, 1.25);
  assert.equal(ASTRONAUT_RIG.geometry.primitive, 'triangles');
  assert.ok(ASTRONAUT_RIG.geometry.positions.length > 0);
  assert.ok(ASTRONAUT_RIG.geometry.normals.length === ASTRONAUT_RIG.geometry.positions.length);
  assert.ok(ASTRONAUT_RIG.geometry.indices.length > 0);
  assert.ok(Object.isFrozen(ASTRONAUT_RIG));
  assert.ok(Object.isFrozen(ASTRONAUT_RIG.parts));

  // Base suit parts
  assert.ok(ASTRONAUT_RIG.parts.torso);
  assert.ok(ASTRONAUT_RIG.parts.helmet);
  assert.ok(ASTRONAUT_RIG.parts.visor);
  assert.ok(ASTRONAUT_RIG.parts.backpack);
  assert.ok(ASTRONAUT_RIG.parts.leftArm);
  assert.ok(ASTRONAUT_RIG.parts.rightArm);
  assert.ok(ASTRONAUT_RIG.parts.leftLeg);
  assert.ok(ASTRONAUT_RIG.parts.rightLeg);
  assert.ok(ASTRONAUT_RIG.parts.leftBoot);
  assert.ok(ASTRONAUT_RIG.parts.rightBoot);

  // Stage 14: New detailed EVA parts
  assert.ok(ASTRONAUT_RIG.parts.chestPack, 'Chest pack (DCM) exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.chestPack.colorRgb, [0.85, 0.88, 0.92]);
  assert.ok(ASTRONAUT_RIG.parts.plssAntenna, 'PLSS antenna exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.plssAntenna.colorRgb, [0.75, 0.78, 0.82]);
  assert.ok(ASTRONAUT_RIG.parts.leftGlove, 'Left EVA glove exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.leftGlove.colorRgb, [0.20, 0.22, 0.25]);
  assert.ok(ASTRONAUT_RIG.parts.rightGlove, 'Right EVA glove exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.rightGlove.colorRgb, [0.20, 0.22, 0.25]);

  // First-person rig parts contract
  assert.deepEqual(
    FIRST_PERSON_RIG_PARTS,
    ['torso', 'chestPack', 'leftArm', 'rightArm', 'leftGlove', 'rightGlove']
  );
  assert.deepEqual(ASTRONAUT_RIG.metadata.firstPersonParts, FIRST_PERSON_RIG_PARTS);
});

test('astronaut rig: robust input validation and type assertions', () => {
  const valid = { timeS: 0, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'idle' };

  assert.throws(() => poseAstronautRig(null), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, timeS: -1 }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, horizontalSpeedMps: -0.1 }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, horizontalSpeedMps: NaN }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, verticalSpeedMps: Infinity }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, grounded: 'yes' }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, airborne: 'true' }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, landingRecovery: 1 }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, landingRecoveryFrac: -0.1 }), TypeError);
  assert.throws(() => poseAstronautRig({ ...valid, phase: 'sprinting' }), TypeError);

  // Valid optional parameters do not throw
  assert.doesNotThrow(() => poseAstronautRig({ ...valid, airborne: false, landingRecovery: true, landingRecoveryFrac: 0.5 }));
});

test('astronaut rig: determinism, purity and frozen snapshot isolation', () => {
  const state = {
    timeS: 3.14159,
    horizontalSpeedMps: 1.1,
    verticalSpeedMps: 0,
    grounded: true,
    airborne: false,
    groundContactStatus: STATUS.OK,
    phase: 'running',
  };

  const poseA = poseAstronautRig(state);
  const poseB = poseAstronautRig(state);
  assert.deepEqual(poseA, poseB, 'Identical inputs produce identical deep-equal output');
  assert.ok(Object.isFrozen(poseA));
  assert.ok(Object.isFrozen(poseA.parts));
  for (const part of Object.values(poseA.parts)) {
    assert.ok(Object.isFrozen(part));
    assert.ok(Object.isFrozen(part.offset));
    assert.ok(Object.isFrozen(part.rotationRad));
  }

  // Frozen paused state retention
  const paused = poseAstronautRig({ ...state, phase: 'paused' });
  assert.deepEqual(paused, poseA, 'Paused phase with frozen timeS produces identical frozen pose');
});

test('Stage 13: Apollo/Mars EVA loping walk kinematics and flight bounce', () => {
  const strideLen = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
  const speed = 1.0;
  const moving = {
    timeS: 0,
    horizontalSpeedMps: speed,
    verticalSpeedMps: 0,
    grounded: true,
    airborne: false,
    groundContactStatus: STATUS.OK,
    phase: 'walk',
  };

  const pose0 = poseAstronautRig(moving);
  assert.equal(pose0.pose, 'walk');
  assert.equal(pose0.gaitFrequencyHz, speed / strideLen);
  assert.equal(pose0.gaitPhaseRad, 0);

  // Check bounce (bob) across stride cycle: low-gravity lope has flight bounce (rootOffset[2] > 0)
  const quarterCycle = 0.25 / (speed / strideLen);
  const halfCycle = 0.5 / (speed / strideLen);
  const poseQuarter = poseAstronautRig({ ...moving, timeS: quarterCycle });
  const poseHalf = poseAstronautRig({ ...moving, timeS: halfCycle });

  // At quarter cycle (phase = PI/2, 2*phase = PI): 1 - cos(PI) = 2 -> peak bounce
  assert.ok(poseQuarter.rootOffset[2] > 0.02, `Lope bounce ${poseQuarter.rootOffset[2]} m should be pronounced in Mars 0.38g`);
  // At half cycle (phase = PI, 2*phase = 2PI): 1 - cos(2PI) = 0 -> base
  // (only the faded idle breath, at most 0.006 * (1 - speedNorm), remains)
  assert.ok(Math.abs(poseHalf.rootOffset[2]) < 0.006 * (1 - speed / 1.4) + 1e-4);

  // Arm counter-swing: left and right arms swing in opposition
  assert.ok(poseQuarter.parts.leftArm.rotationRad[0] * poseQuarter.parts.rightArm.rotationRad[0] < 0);
  // Pressurized suit lateral clearance flare
  assert.ok(pose0.parts.leftArm.rotationRad[1] > 0.04);
  assert.ok(pose0.parts.rightArm.rotationRad[1] < -0.04);

  // Legs swing in opposition
  assert.ok(poseQuarter.parts.leftLeg.rotationRad[0] * poseQuarter.parts.rightLeg.rotationRad[0] < 0);

  // Pelvic and body lean
  assert.ok(pose0.rootRotationRad[0] > 0, 'Slight forward lean into stride');
});

test('Stage 13: Mars low-gravity airborne 3-stage kinematics (Ascent, Apex Balance, Descent)', () => {
  const baseAirborne = {
    timeS: 2.0,
    horizontalSpeedMps: 0.5,
    grounded: false,
    airborne: true,
    groundContactStatus: STATUS.OK,
    phase: 'running',
  };

  // 1. Ascent (verticalSpeedMps > 0.5): Mars jump launch
  const ascent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: 2.0 });
  assert.equal(ascent.pose, 'airborne');
  // Arms forward and upward (negative pitch in local coords)
  assert.ok(ascent.parts.leftArm.rotationRad[0] < -0.4, 'Ascent arms raised forward/upward');
  assert.ok(ascent.parts.rightArm.rotationRad[0] < -0.4);
  // Legs trailing backward (positive pitch)
  assert.ok(ascent.parts.leftLeg.rotationRad[0] > 0.15, 'Ascent legs trailing backward');
  assert.ok(ascent.parts.rightLeg.rotationRad[0] > 0.15);
  // Root forward tilt
  assert.ok(ascent.rootRotationRad[0] > 0, 'Torso tilted slightly forward into ballistic arc');

  // 2. Apex Balance (|verticalSpeedMps| <= 0.5): Mars low-gravity floating equilibrium
  const apex = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: 0.0 });
  assert.equal(apex.pose, 'airborne');
  // Arms flared wide to sides for balance in low gravity
  assert.ok(apex.parts.leftArm.rotationRad[1] > 0.15, 'Apex left arm flared outward');
  assert.ok(apex.parts.rightArm.rotationRad[1] < -0.15, 'Apex right arm flared outward');
  // Legs in soft, neutral balance
  assert.ok(Math.abs(apex.parts.leftLeg.rotationRad[0]) < 0.15, 'Apex legs softly neutral');
  assert.ok(Math.abs(apex.parts.rightLeg.rotationRad[0]) < 0.15);
  // Neutral level torso
  assert.ok(Math.abs(apex.rootRotationRad[0]) < 0.02, 'Apex torso level');

  // 3. Descent (verticalSpeedMps < -0.5): Mars gravity pull-down before touchdown
  const descent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: -2.0 });
  assert.equal(descent.pose, 'airborne');
  // Feet/legs reaching forward and down to prepare for surface contact (negative pitch)
  assert.ok(descent.parts.leftLeg.rotationRad[0] < -0.15, 'Descent legs reaching forward for touchdown');
  assert.ok(descent.parts.rightLeg.rotationRad[0] < -0.15);
  // Boots in dorsiflexion
  assert.ok(descent.parts.leftBoot.rotationRad[0] < -0.08, 'Descent boots in dorsiflexion');
  // Torso slight rearward brace tilt
  assert.ok(descent.rootRotationRad[0] < 0, 'Torso bracing slightly rearward');

  // Smooth continuity check across boundaries (vz = 0.5 and vz = -0.5)
  const justBelowAscent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: 0.49 });
  const justAboveAscent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: 0.51 });
  assert.ok(Math.abs(justBelowAscent.parts.leftArm.rotationRad[0] - justAboveAscent.parts.leftArm.rotationRad[0]) < 0.02);

  const justAboveDescent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: -0.49 });
  const justBelowDescent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: -0.51 });
  assert.ok(Math.abs(justAboveDescent.parts.leftLeg.rotationRad[0] - justBelowDescent.parts.leftLeg.rotationRad[0]) < 0.02);
});

test('Stage 13: Landing squash, impact absorption and recovery kinematics', () => {
  const landingStationary = {
    timeS: 5.0,
    horizontalSpeedMps: 0,
    verticalSpeedMps: 0,
    grounded: true,
    airborne: false,
    landingRecovery: true,
    landingRecoveryFrac: 1.0, // Peak impact right at touchdown
    groundContactStatus: STATUS.OK,
    phase: 'running',
  };

  const peakLanding = poseAstronautRig(landingStationary);
  assert.equal(peakLanding.pose, 'landing');

  // Root drop (squash): negative rootOffset[2]
  assert.ok(peakLanding.rootOffset[2] < -0.05, `Landing squash ${peakLanding.rootOffset[2]} m should drop root downward`);
  // Forward torso dip absorbing impact
  assert.ok(peakLanding.rootRotationRad[0] > 0.02);

  // Knee/hip flexion: thighs flex forward (negative angle) and boots flex (positive angle)
  assert.ok(peakLanding.parts.leftLeg.rotationRad[0] < -0.12, 'Legs flex on touchdown');
  assert.ok(peakLanding.parts.rightLeg.rotationRad[0] < -0.12);
  assert.ok(peakLanding.parts.leftBoot.rotationRad[0] > 0.08, 'Boots flex to maintain ground contact');

  // Arms flare outward to absorb shock
  assert.ok(peakLanding.parts.leftArm.rotationRad[1] > 0.18, 'Left arm flared outward on landing impact');
  assert.ok(peakLanding.parts.rightArm.rotationRad[1] < -0.18, 'Right arm flared outward on landing impact');

  // Recovery decay: as landingRecoveryFrac drops from 1.0 to 0.5 to 0.0
  const midLanding = poseAstronautRig({ ...landingStationary, landingRecoveryFrac: 0.5 });
  assert.equal(midLanding.pose, 'landing');
  assert.ok(midLanding.rootOffset[2] > peakLanding.rootOffset[2], 'Root squash diminishes as recovery fraction decreases');
  assert.ok(midLanding.parts.leftArm.rotationRad[1] < peakLanding.parts.leftArm.rotationRad[1]);

  // When recovery expires (landingRecovery = false, frac = 0), returns to idle
  const recovered = poseAstronautRig({ ...landingStationary, landingRecovery: false, landingRecoveryFrac: 0 });
  assert.equal(recovered.pose, 'idle');
  assert.ok(recovered.rootOffset[2] >= 0, 'Squash fully relieved in idle pose');

  // Moving landing recovery (landing with forward momentum)
  const movingLanding = poseAstronautRig({
    ...landingStationary,
    horizontalSpeedMps: 1.2,
    landingRecoveryFrac: 0.8,
  });
  assert.equal(movingLanding.pose, 'walk');
  assert.ok(movingLanding.parts.leftArm.rotationRad[1] > 0.15, 'Arm flare remains active while moving during recovery');
});

test('Stage 14: Hierarchical chained limb kinematics (chainedLimbPart)', () => {
  // Neutral pose with zero rotation: child must have zero offset and zero rotation
  const neutral = chainedLimbPart('leftGlove', 'leftArm', [0, 0, 0], [0, 0, 0]);
  assert.ok(Math.hypot(...neutral.offset) < 1e-12, 'Neutral chained part offset must be zero');
  assert.deepEqual(neutral.rotationRad, [0, 0, 0]);

  // Shoulder pitch rotation of 0.5 rad: glove must orbit shoulder joint
  const shoulderPitch = 0.5;
  const pitched = chainedLimbPart('leftGlove', 'leftArm', [shoulderPitch, 0, 0], [0, 0, 0]);
  assert.ok(Math.abs(pitched.rotationRad[0] - shoulderPitch) < 1e-9, 'Pure shoulder pitch survives matrix round-trip');
  assert.ok(Math.abs(pitched.offset[1]) > 0.1, 'Glove swung forward/backward with shoulder');
  assert.ok(Math.abs(pitched.offset[2]) > 0.02, 'Glove raised with shoulder swing');

  // Combined shoulder + wrist rotations are intentionally not compared with a small-angle sum here:
  // that was only a loose approximation. The exact composition is covered by the dedicated
  // matrix-composition test below ('chainedLimbPart composes parent and child orientation ...').
});

test('Stage 14: EVA Glove synchronization and grip angle across all animation regimes', () => {
  // Walk (Loping) regime
  const moving = { timeS: 1.0, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true, phase: 'walk' };
  const walkPose = poseAstronautRig(moving);
  assert.ok(walkPose.parts.leftGlove);
  assert.ok(walkPose.parts.rightGlove);
  // Gloves counter-swing rhythmically in opposition around neutral grip
  const strideLen = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
  const quarterCycle = 0.25 / (1.2 / strideLen);
  const peakSwingPose = poseAstronautRig({ ...moving, timeS: quarterCycle });
  assert.ok(
    peakSwingPose.parts.leftGlove.rotationRad[0] * peakSwingPose.parts.rightGlove.rotationRad[0] < 0,
    'At peak stride swing, gloves swing in opposite pitch directions'
  );
  // Differential swing follows arms (true rotation composition adds small second-order terms)
  assert.ok(
    Math.abs((peakSwingPose.parts.leftGlove.rotationRad[0] - peakSwingPose.parts.rightGlove.rotationRad[0]) -
             (peakSwingPose.parts.leftArm.rotationRad[0] - peakSwingPose.parts.rightArm.rotationRad[0])) < 0.05
  );
  // Gloves maintain outward suit-clearance flare
  assert.ok(walkPose.parts.leftGlove.rotationRad[1] > 0);
  assert.ok(walkPose.parts.rightGlove.rotationRad[1] < 0);

  // Jump Ascent regime: gloves follow arms reaching forward/upward
  const ascent = poseAstronautRig({ timeS: 2.0, horizontalSpeedMps: 0.5, verticalSpeedMps: 2.0, grounded: false, airborne: true, phase: 'running' });
  assert.ok(ascent.parts.leftGlove.rotationRad[0] < -0.4, 'Ascent gloves reaching upward with arms');
  assert.ok(ascent.parts.rightGlove.rotationRad[0] < -0.4);

  // Jump Apex Balance regime: gloves flare wide to sides
  const apex = poseAstronautRig({ timeS: 2.5, horizontalSpeedMps: 0.5, verticalSpeedMps: 0.0, grounded: false, airborne: true, phase: 'running' });
  assert.ok(apex.parts.leftGlove.rotationRad[1] > 0.15, 'Apex left glove flared wide');
  assert.ok(apex.parts.rightGlove.rotationRad[1] < -0.15, 'Apex right glove flared wide');

  // Jump Descent regime: gloves brace forward/downward
  const descent = poseAstronautRig({ timeS: 3.0, horizontalSpeedMps: 0.5, verticalSpeedMps: -2.0, grounded: false, airborne: true, phase: 'running' });
  assert.ok(descent.parts.leftGlove.rotationRad[0] < -0.3, 'Descent gloves positioned to brace');

  // Landing impact regime: wrists flex to absorb touchdown shock
  const landing = poseAstronautRig({ timeS: 3.5, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, landingRecovery: true, landingRecoveryFrac: 1.0, phase: 'running' });
  assert.ok(landing.parts.leftGlove.rotationRad[1] > 0.20, 'Landing shock flare active on left glove');
  assert.ok(landing.parts.rightGlove.rotationRad[1] < -0.20, 'Landing shock flare active on right glove');

  // Static parts check: chestPack and plssAntenna remain rigidly anchored
  assert.deepEqual(walkPose.parts.chestPack.offset, [0, 0, 0]);
  assert.deepEqual(walkPose.parts.chestPack.rotationRad, [0, 0, 0]);
  assert.deepEqual(walkPose.parts.plssAntenna.offset, [0, 0, 0]);
  assert.deepEqual(walkPose.parts.plssAntenna.rotationRad, [0, 0, 0]);
});

test('Stage 14: First-person view-model compatibility across all poses (arms, gloves, chestPack)', () => {
  const testStates = [
    { name: 'idle', state: { timeS: 1, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'idle' } },
    { name: 'walk', state: { timeS: 1.5, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true, phase: 'walk' } },
    { name: 'airborne-ascent', state: { timeS: 2, horizontalSpeedMps: 0.8, verticalSpeedMps: 2.1, grounded: false, airborne: true, phase: 'running' } },
    { name: 'airborne-apex', state: { timeS: 2.6, horizontalSpeedMps: 0.8, verticalSpeedMps: 0.05, grounded: false, airborne: true, phase: 'running' } },
    { name: 'airborne-descent', state: { timeS: 3.2, horizontalSpeedMps: 0.8, verticalSpeedMps: -2.2, grounded: false, airborne: true, phase: 'running' } },
    { name: 'landing-impact', state: { timeS: 3.8, horizontalSpeedMps: 0.4, verticalSpeedMps: 0, grounded: true, landingRecovery: true, landingRecoveryFrac: 1.0, phase: 'running' } },
    { name: 'stop', state: { timeS: 0, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'stop' } },
  ];

  for (const { name, state } of testStates) {
    const pose = poseAstronautRig(state);
    assert.ok(pose.rootOffset.every(Number.isFinite), `${name}: rootOffset must be finite`);
    assert.ok(pose.rootRotationRad.every(Number.isFinite), `${name}: rootRotationRad must be finite`);

    for (const partId of FIRST_PERSON_RIG_PARTS) {
      const part = pose.parts[partId];
      assert.ok(part, `${name}: part ${partId} must exist`);
      assert.ok(part.offset.every(Number.isFinite), `${name}: ${partId} offset must be finite`);
      assert.ok(part.rotationRad.every(Number.isFinite), `${name}: ${partId} rotationRad must be finite`);

      // View-model arms and gloves pitch bounds: must stay naturally in lower view, never inverted
      if (partId.includes('Arm') || partId.includes('Glove')) {
        const pitch = part.rotationRad[0];
        assert.ok(
          pitch >= -1.2 && pitch <= 1.2,
          `${name}: ${partId} pitch ${pitch} rad must stay within comfortable FOV bounds`
        );
      }
    }
  }
});

test('Stage 14: chainedLimbPart composes parent and child orientation as a true rotation', () => {
  const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: ${actual} vs ${expected}`);
  const assertEulerNear = (actual, expected, msg) => expected.forEach((e, i) => near(actual[i], e, `${msg} axis ${i}`));

  // Local reference: explicit axis matrices multiplied as Rz * Ry * Rx (X first, then Y, then Z).
  const axisX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const axisY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const axisZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
  const matVec = (M, v) => M.map((row) => row.reduce((s, m, k) => s + m * v[k], 0));
  const eulerMatrix = ([rx, ry, rz]) => mul(axisZ(rz), mul(axisY(ry), axisX(rx)));
  const applyEuler = (euler, v) => matVec(eulerMatrix(euler), v);

  // (1) Zero child rotation returns the parent orientation
  const parentAngles = [0.3, 0.2, 0.1];
  const parentOnly = chainedLimbPart('leftGlove', 'leftArm', parentAngles, [0, 0, 0]);
  assertEulerNear(parentOnly.rotationRad, parentAngles, 'zero child rotation');

  // (2) Same-axis rotations compose additively: Rx(0.3) * Rx(0.2) = Rx(0.5)
  const sameAxis = chainedLimbPart('leftGlove', 'leftArm', [0.3, 0, 0], [0.2, 0, 0]);
  assertEulerNear(sameAxis.rotationRad, [0.5, 0, 0], 'same-axis composition');

  // (3) Different axes: result differs from the component sum and matches child-then-parent application
  const parent = [0.5, 0, 0];
  const child = [0, 0.5, 0];
  const mixed = chainedLimbPart('leftGlove', 'leftArm', parent, child);
  const componentSum = [parent[0] + child[0], parent[1] + child[1], parent[2] + child[2]];
  assert.ok(
    mixed.rotationRad.some((angle, i) => Math.abs(angle - componentSum[i]) > 1e-3),
    'mixed-axis composition must differ from the plain component sum'
  );
  const v = [1.2, -0.7, 0.4];
  const expectedVector = applyEuler(parent, applyEuler(child, v));
  const actualVector = applyEuler(mixed.rotationRad, v);
  expectedVector.forEach((e, i) => near(actualVector[i], e, `child-then-parent vector axis ${i}`));

  // (4) All outputs are finite plain numbers
  for (const result of [parentOnly, sameAxis, mixed]) {
    assert.ok(result.rotationRad.every((angle) => Number.isFinite(angle)), 'rotationRad must be finite');
    assert.ok(result.offset.every((value) => Number.isFinite(value)), 'offset must be finite');
  }
});

test('Stage 16: first-person viewModel breathing and step sway', () => {
  const BREATH_HZ_LOCAL = 0.22;
  const STRIDE_M = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
  const idleAt = (timeS) => ({ timeS, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'running' });
  const walkAt = (timeS, speed) => ({ timeS, horizontalSpeedMps: speed, verticalSpeedMps: 0, grounded: true, phase: 'walk' });
  const airAt = (timeS, verticalSpeedMps) => ({
    timeS, horizontalSpeedMps: 0.5, verticalSpeedMps, grounded: false, airborne: true,
    groundContactStatus: STATUS.OK, phase: 'running',
  });
  const landingState = {
    timeS: 3.8, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true,
    landingRecovery: true, landingRecoveryFrac: 1.0, groundContactStatus: STATUS.OK, phase: 'running',
  };
  const stopState = { timeS: 0.5, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'stop' };
  const unknownState = {
    timeS: 2, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: false, airborne: false,
    groundContactStatus: STATUS.NO_DATA, phase: 'running',
  };

  // (1) Field exists, is frozen and finite for every pose
  const cases = {
    idle: { state: idleAt(1.3), pose: 'idle' },
    walk: { state: walkAt(1.5, 1.2), pose: 'walk' },
    airborne: { state: airAt(2, 2.0), pose: 'airborne' },
    landing: { state: landingState, pose: 'landing' },
    stop: { state: stopState, pose: 'stop' },
    unknown: { state: unknownState, pose: 'unknown' },
  };
  for (const [name, { state, pose: expectedPose }] of Object.entries(cases)) {
    const result = poseAstronautRig(state);
    assert.equal(result.pose, expectedPose, `${name}: expected pose`);
    const vm = result.viewModel;
    assert.ok(vm && typeof vm === 'object', `${name}: viewModel must exist`);
    assert.ok(Object.isFrozen(vm), `${name}: viewModel must be frozen`);
    assert.ok(Object.isFrozen(vm.offset), `${name}: viewModel.offset must be frozen`);
    assert.ok(Object.isFrozen(vm.rotationRad), `${name}: viewModel.rotationRad must be frozen`);
    assert.equal(vm.offset.length, 3, `${name}: offset has 3 components`);
    assert.equal(vm.rotationRad.length, 3, `${name}: rotationRad has 3 components`);
    assert.ok(vm.offset.every(Number.isFinite), `${name}: offset must be finite`);
    assert.ok(vm.rotationRad.every(Number.isFinite), `${name}: rotationRad must be finite`);
    assert.ok(Number.isFinite(vm.breathPhaseRad), `${name}: breathPhaseRad must be finite`);
    assert.ok(Number.isFinite(vm.stepPhaseRad), `${name}: stepPhaseRad must be finite`);
  }

  // (2) Idle breath varies with timeS and is periodic with period 1 / BREATH_HZ
  const early = poseAstronautRig(idleAt(0.7)).viewModel;
  const later = poseAstronautRig(idleAt(1.9)).viewModel;
  assert.notEqual(early.offset[2], later.offset[2], 'idle breath must vary with timeS');
  assert.ok(Math.abs(early.offset[2]) <= 0.004 + 1e-12, 'idle breath offset stays small');
  const period = 1 / BREATH_HZ_LOCAL;
  const cycleA = poseAstronautRig(idleAt(0.7)).viewModel;
  const cycleB = poseAstronautRig(idleAt(0.7 + period)).viewModel;
  assert.ok(Math.abs(cycleA.offset[2] - cycleB.offset[2]) < 1e-9, 'breath offset periodic');
  assert.ok(Math.abs(cycleA.rotationRad[0] - cycleB.rotationRad[0]) < 1e-9, 'breath pitch periodic');
  assert.ok(Math.abs(cycleA.breathPhaseRad - cycleB.breathPhaseRad) < 1e-9, 'breath phase periodic');

  // (3) Walk step phase matches gait phase; left/right sway flips sign between quarter and three-quarter cycle
  const speed = 1.0;
  const gaitHz = speed / STRIDE_M;
  const walkQuarter = poseAstronautRig(walkAt(0.25 / gaitHz, speed));
  const walkThreeQuarter = poseAstronautRig(walkAt(0.75 / gaitHz, speed));
  assert.equal(walkQuarter.viewModel.stepPhaseRad, walkQuarter.gaitPhaseRad, 'stepPhaseRad equals gaitPhaseRad');
  assert.equal(walkThreeQuarter.viewModel.stepPhaseRad, walkThreeQuarter.gaitPhaseRad, 'stepPhaseRad equals gaitPhaseRad');
  assert.ok(
    walkQuarter.viewModel.offset[0] * walkThreeQuarter.viewModel.offset[0] < 0,
    'lateral step sway must have opposite sign at quarter and three-quarter cycle'
  );
  assert.ok(Math.abs(walkQuarter.viewModel.offset[0]) > 0.004, 'walk sway has visible amplitude at speed');

  // (4) Unknown contact is neutral: zero offset and rotation, zero phases
  const unknown = poseAstronautRig(unknownState);
  assert.equal(unknown.pose, 'unknown');
  assert.deepEqual(unknown.viewModel.offset, [0, 0, 0]);
  assert.deepEqual(unknown.viewModel.rotationRad, [0, 0, 0]);
  assert.equal(unknown.viewModel.breathPhaseRad, 0);
  assert.equal(unknown.viewModel.stepPhaseRad, 0);

  // (5) Continuity at the walk/idle and airborne vertical-speed boundaries
  const walkSlow = poseAstronautRig({ timeS: 1.0, horizontalSpeedMps: 0.041, verticalSpeedMps: 0, grounded: true, phase: 'running' });
  const idleRest = poseAstronautRig(idleAt(1.0));
  assert.equal(walkSlow.pose, 'walk');
  assert.equal(idleRest.pose, 'idle');
  for (let i = 0; i < 3; i += 1) {
    assert.ok(Math.abs(walkSlow.viewModel.offset[i] - idleRest.viewModel.offset[i]) < 2e-4, `walk/idle offset axis ${i} continuous`);
    assert.ok(Math.abs(walkSlow.viewModel.rotationRad[i] - idleRest.viewModel.rotationRad[i]) < 2e-4, `walk/idle rotation axis ${i} continuous`);
  }
  const airBelow = poseAstronautRig(airAt(2.0, 0.49)).viewModel;
  const airAbove = poseAstronautRig(airAt(2.0, 0.51)).viewModel;
  for (let i = 0; i < 3; i += 1) {
    assert.ok(Math.abs(airBelow.offset[i] - airAbove.offset[i]) < 1e-3, `airborne offset axis ${i} continuous`);
    assert.ok(Math.abs(airBelow.rotationRad[i] - airAbove.rotationRad[i]) < 1e-3, `airborne rotation axis ${i} continuous`);
  }

  // (6) Determinism: identical input yields deep-equal viewModel
  const walkInput = walkAt(1.5, 1.2);
  assert.deepEqual(poseAstronautRig(walkInput).viewModel, poseAstronautRig(walkInput).viewModel);

  // (7) Existing walk outputs remain present and unchanged in meaning
  const walk = poseAstronautRig(walkInput);
  assert.equal(walk.pose, 'walk');
  assert.equal(walk.gaitFrequencyHz, 1.2 / STRIDE_M);
  // Golden value: 2*pi * (1.2 / 1.25 Hz) * 1.5 s = 2*pi * 1.44 -> 2*pi * 0.44 = 2.76460153515902 rad.
  assert.ok(Math.abs(walk.gaitPhaseRad - 2.7646015351590165) < 1e-12, `gait phase ${walk.gaitPhaseRad}`);
  assert.equal(walk.rootOffset.length, 3);
  assert.equal(walk.rootRotationRad.length, 3);
  assert.deepEqual(Object.keys(walk.parts).sort(), Object.keys(ASTRONAUT_RIG.parts).sort());
});

// ---- Stage 13 follow-up: attachment invariant, continuity, clamping ----

// Local copy of the rig's Euler convention (X, then Y, then Z) so the test does not depend on internals.
function rotateEulerRef([x, y, z], [rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y1 = cx * y - sx * z;
  const z1 = sx * y + cx * z;
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x2 = cy * x + sy * z1;
  const z2 = -sy * x + cy * z1;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [cz * x2 - sz * y1, sz * x2 + cz * y1, z2];
}
const addV = (a, b) => a.map((v, i) => v + b[i]);
const subV = (a, b) => a.map((v, i) => v - b[i]);
const distV = (a, b) => Math.hypot(...subV(a, b));

const WALK_AT = (timeS, speed) => ({ timeS, horizontalSpeedMps: speed, verticalSpeedMps: 0, grounded: true, phase: 'walk' });
const AIR_AT = (timeS, vz) => ({
  timeS, horizontalSpeedMps: 0.5, verticalSpeedMps: vz, grounded: false, airborne: true,
  groundContactStatus: STATUS.OK, phase: 'running',
});
const LAND_AT = (frac, extra = {}) => ({
  timeS: 2, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true,
  landingRecovery: true, landingRecoveryFrac: frac, groundContactStatus: STATUS.OK, phase: 'running', ...extra,
});

function maxPoseJump(a, b) {
  let rot = 0;
  let off = 0;
  const track = (p, q) => {
    for (let i = 0; i < 3; i += 1) {
      rot = Math.max(rot, Math.abs(p.rotationRad[i] - q.rotationRad[i]));
      off = Math.max(off, Math.abs(p.offset[i] - q.offset[i]));
    }
  };
  for (const id of Object.keys(a.parts)) track(a.parts[id], b.parts[id]);
  track({ rotationRad: a.rootRotationRad, offset: a.rootOffset }, { rotationRad: b.rootRotationRad, offset: b.rootOffset });
  return { rot, off };
}

function maxViewModelJump(a, b) {
  let rot = 0;
  let off = 0;
  for (let i = 0; i < 3; i += 1) {
    rot = Math.max(rot, Math.abs(a.viewModel.rotationRad[i] - b.viewModel.rotationRad[i]));
    off = Math.max(off, Math.abs(a.viewModel.offset[i] - b.viewModel.offset[i]));
  }
  return { rot, off };
}

test('Stage 13: glove stays attached at the wrist (arm lower end) in every regime', () => {
  const quarter = 0.25 / (1.0 / ASTRONAUT_RIG.metadata.presentationStrideLengthM);
  const states = {
    'walk quarter cycle': WALK_AT(quarter, 1.0),
    'airborne ascent': AIR_AT(2, 2),
    'landing peak': LAND_AT(1),
    idle: { timeS: 1.3, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'idle' },
  };
  for (const [name, state] of Object.entries(states)) {
    const pose = poseAstronautRig(state);
    for (const side of ['left', 'right']) {
      const arm = ASTRONAUT_RIG.parts[`${side}Arm`];
      const glove = ASTRONAUT_RIG.parts[`${side}Glove`];
      const armPose = pose.parts[`${side}Arm`];
      const glovePose = pose.parts[`${side}Glove`];

      // Arm lower end (local -Z end of the arm box) in the posed frame.
      const armLowerEnd = addV(
        addV(rotateEulerRef([0, 0, -arm.size[2] / 2], armPose.rotationRad), arm.center),
        armPose.offset,
      );
      // Glove wrist pivot in the posed frame.
      const glovePivot = addV(
        addV(rotateEulerRef(subV(glove.pivot, glove.center), glovePose.rotationRad), glove.center),
        glovePose.offset,
      );
      // Wrist carried by the shoulder rotation about the arm pivot.
      const chainedWrist = addV(arm.pivot, rotateEulerRef(subV(glove.pivot, arm.pivot), armPose.rotationRad));

      assert.ok(distV(glovePivot, chainedWrist) < 1e-9, `${name} ${side}: glove pivot follows the shoulder-carried wrist`);
      assert.ok(distV(glovePivot, armLowerEnd) < 1e-9, `${name} ${side}: glove pivot coincides with the arm lower end`);
    }
  }
});

test('Stage 13: world pose is continuous across idle/walk and landing/idle transitions', () => {
  let walkJump = { rot: 0, off: 0 };
  let landJump = { rot: 0, off: 0 };
  for (const timeS of [0, 0.3, 1, 2.5, 5, 10.7, 33.3, 100]) {
    // Speed 0.04 is idle (threshold is exclusive); 0.0401 is walk, same time and lifecycle phase.
    const idle = poseAstronautRig({ timeS, horizontalSpeedMps: 0.04, verticalSpeedMps: 0, grounded: true, phase: 'running' });
    const walk = poseAstronautRig({ timeS, horizontalSpeedMps: 0.0401, verticalSpeedMps: 0, grounded: true, phase: 'running' });
    assert.equal(idle.pose, 'idle');
    assert.equal(walk.pose, 'walk');
    const a = maxPoseJump(idle, walk);
    walkJump = { rot: Math.max(walkJump.rot, a.rot), off: Math.max(walkJump.off, a.off) };

    const settled = poseAstronautRig({ ...LAND_AT(0, { landingRecovery: false }), timeS });
    const justLanded = poseAstronautRig({ ...LAND_AT(1e-6), timeS });
    assert.equal(settled.pose, 'idle');
    assert.equal(justLanded.pose, 'landing');
    const b = maxPoseJump(settled, justLanded);
    landJump = { rot: Math.max(landJump.rot, b.rot), off: Math.max(landJump.off, b.off) };
  }
  assert.ok(walkJump.rot < 0.005, `idle->walk rotation jump ${walkJump.rot}`);
  assert.ok(walkJump.off < 0.003, `idle->walk offset jump ${walkJump.off}`);
  assert.ok(landJump.rot < 1e-4, `landing->idle rotation jump ${landJump.rot}`);
  assert.ok(landJump.off < 1e-4, `landing->idle offset jump ${landJump.off}`);
});

test('Stage 13: viewModel is continuous across walk->airborne and airborne->landing', () => {
  const walk = poseAstronautRig(WALK_AT(2, 0.5));
  const launch = poseAstronautRig(AIR_AT(2, 2.4));
  const j1 = maxViewModelJump(walk, launch);
  assert.ok(j1.off < 0.015, `walk->airborne offset jump ${j1.off}`);
  assert.ok(j1.rot < 0.01, `walk->airborne rotation jump ${j1.rot}`);

  const descent = poseAstronautRig(AIR_AT(2, -2));
  const touchdown = poseAstronautRig(LAND_AT(1));
  const j2 = maxViewModelJump(descent, touchdown);
  assert.ok(j2.off < 0.005, `airborne->landing offset jump ${j2.off}`);
  assert.ok(j2.rot < 0.02, `airborne->landing rotation jump ${j2.rot}`);
});

test('Stage 16: paused viewModel matches running viewModel; airborne lag and landing dip ordering', () => {
  const frozen = WALK_AT(1.7, 1.1);
  assert.deepEqual(
    poseAstronautRig({ ...frozen, phase: 'paused' }).viewModel,
    poseAstronautRig(frozen).viewModel,
    'same frozen input yields the same viewModel while paused',
  );

  const rising = poseAstronautRig(AIR_AT(2, 2.4)).viewModel;
  const falling = poseAstronautRig(AIR_AT(2, -2.4)).viewModel;
  assert.ok(rising.offset[2] > falling.offset[2], 'view-model sits higher when rising than falling');

  const dipFull = poseAstronautRig(LAND_AT(1)).viewModel;
  const dipHalf = poseAstronautRig(LAND_AT(0.5)).viewModel;
  assert.ok(dipFull.offset[2] < dipHalf.offset[2], 'landing dip is deeper at frac 1 than 0.5');
});

test('Stage 13: landing recovery fraction is clamped and an explicit false disables it', () => {
  assert.deepEqual(poseAstronautRig(LAND_AT(2)), poseAstronautRig(LAND_AT(1)), 'frac 2 equals frac 1');

  const off = poseAstronautRig(LAND_AT(0.5, { landingRecovery: false }));
  assert.equal(off.pose, 'idle');
  assert.deepEqual(off, poseAstronautRig(LAND_AT(0, { landingRecovery: false })), 'frac ignored when recovery is false');

  // recovery true without a fraction means full recovery
  assert.deepEqual(poseAstronautRig(LAND_AT(undefined)), poseAstronautRig(LAND_AT(1)));
});

test('Stage 14+: Chained boot-to-leg ankle kinematics and helmet/visor horizon stabilization', () => {
  const strideLen = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
  const speed = 1.2;
  const quarterCycle = 0.25 / (speed / strideLen);

  const walkPose = poseAstronautRig({
    timeS: quarterCycle,
    horizontalSpeedMps: speed,
    verticalSpeedMps: 0,
    grounded: true,
    phase: 'walk',
  });

  // Boots must translate horizontally (offset[1] != 0) with the swinging legs rather than rotating in place
  assert.ok(Math.abs(walkPose.parts.leftBoot.offset[1]) > 0.12, 'Left boot follows swinging left ankle');
  assert.ok(Math.abs(walkPose.parts.rightBoot.offset[1]) > 0.12, 'Right boot follows swinging right ankle');
  assert.ok(
    walkPose.parts.leftBoot.offset[1] * walkPose.parts.rightBoot.offset[1] < 0,
    'Left and right boots translate in opposite directions during stride'
  );

  // Helmet counter-stabilizes against forward torso lean and visor tracks helmet
  assert.ok(walkPose.parts.helmet.rotationRad[0] < 0, 'Helmet counter-pitches to keep gaze level');
  assert.deepEqual(
    walkPose.parts.visor.rotationRad,
    walkPose.parts.helmet.rotationRad,
    'Visor rotation stays locked to helmet'
  );
  assert.ok(Math.abs(walkPose.parts.visor.offset[1]) > 0, 'Visor orbits neck pivot with helmet');
});
