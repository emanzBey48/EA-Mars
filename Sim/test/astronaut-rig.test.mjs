import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASTRONAUT_RIG,
  FIRST_PERSON_RIG_PARTS,
  poseAstronautRig,
  hingedPart3D,
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
  assert.ok(Math.abs(poseHalf.rootOffset[2]) < 1e-4);

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
  assert.equal(pitched.rotationRad[0], shoulderPitch);
  assert.ok(Math.abs(pitched.offset[1]) > 0.1, 'Glove swung forward/backward with shoulder');
  assert.ok(Math.abs(pitched.offset[2]) > 0.02, 'Glove raised with shoulder swing');

  // Combined shoulder swing + wrist local grip angle: rotations sum cleanly
  const combined = chainedLimbPart('leftGlove', 'leftArm', [shoulderPitch, 0.1, 0], [-0.15, 0.05, 0]);
  assert.ok(Math.abs(combined.rotationRad[0] - (shoulderPitch - 0.15)) < 1e-12);
  assert.ok(Math.abs(combined.rotationRad[1] - 0.15) < 1e-12);
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
  // Differential swing matches arms
  assert.ok(
    Math.abs((peakSwingPose.parts.leftGlove.rotationRad[0] - peakSwingPose.parts.rightGlove.rotationRad[0]) -
             (peakSwingPose.parts.leftArm.rotationRad[0] - peakSwingPose.parts.rightArm.rotationRad[0])) < 1e-12
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
