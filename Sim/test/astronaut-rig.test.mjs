import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASTRONAUT_RIG,
  FIRST_PERSON_RIG_PARTS,
  FIRST_PERSON_LOWER_BODY_PARTS,
  poseAstronautRig,
  chainedLimbPart,
  blendRigPoses,
  strideLengthForSpeedM,
  froudeNumber,
  walkRunTransitionSpeedMps,
  resolvePartMaterial,
  RIG_GEOMETRY_NAMES,
  createRigUnitGeometry,
  createRigGeometryAtlas,
} from '../public/js/view/3d/astronaut-rig.js';

const STATUS = Object.freeze({ OK: 'ok', NO_DATA: 'no_data', OUT_OF_BOUNDS: 'out_of_bounds', UNAVAILABLE: 'unavailable' });

const srgbToLinearRef = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

test('rig material resolver: every part resolves to valid linear albedo, roughness and metallic', () => {
  for (const [id, part] of Object.entries(ASTRONAUT_RIG.parts)) {
    const m = resolvePartMaterial(part);
    assert.equal(m.albedoLinear.length, 3, `${id} albedo length`);
    assert.ok(m.albedoLinear.every((c) => c >= 0 && c <= 1), `${id} albedo in [0,1]`);
    assert.ok(m.roughness >= 0 && m.roughness <= 1, `${id} roughness in [0,1]`);
    assert.ok(m.metallic >= 0 && m.metallic <= 1, `${id} metallic in [0,1]`);
    // The template's own albedoLinear is the authority when present (4-decimal rounding of sRGB->linear).
    part.material.albedoLinear.forEach((c, i) => assert.equal(m.albedoLinear[i], c, `${id} albedo channel ${i}`));
  }
  assert.equal(resolvePartMaterial(ASTRONAUT_RIG.parts.visor).metallic, 1, 'visor is metallic gold');
  assert.equal(resolvePartMaterial(ASTRONAUT_RIG.parts.leftWristRing).metallic > 0.5, true, 'coupling rings are metal');
});

test('rig material resolver: suit reads as off-white in linear light (bright, not beige-tinted)', () => {
  const torso = resolvePartMaterial(ASTRONAUT_RIG.parts.torso).albedoLinear;
  assert.ok(torso.every((c) => c > 0.7), `torso linear albedo too dark: ${torso}`);
  assert.ok(torso[2] <= torso[0] + 0.02, 'torso albedo is not blue-tinted');
  assert.ok(torso[0] - torso[2] < 0.12, 'torso albedo warmth should stay small (white, not beige)');
});

test('rig material resolver: falls back to colorRgb (sRGB -> linear, matte) when material is absent or invalid', () => {
  const fallback = resolvePartMaterial({ colorRgb: [0.5, 0.5, 0.5] });
  assert.ok(Math.abs(fallback.albedoLinear[0] - srgbToLinearRef(0.5)) < 1e-12);
  assert.equal(fallback.roughness, 0.8);
  assert.equal(fallback.metallic, 0);
  const badRoughness = resolvePartMaterial({ colorRgb: [0.5, 0.5, 0.5], material: { albedoLinear: [1, 1, 1], roughness: 2, metallic: 0 } });
  assert.equal(badRoughness.roughness, 0.8, 'invalid material is ignored');
  assert.throws(() => resolvePartMaterial({ colorRgb: [2, 0, 0] }), TypeError);
  assert.throws(() => resolvePartMaterial({}), TypeError);
});

test('rig material resolver returns copies, so the frozen template cannot be mutated through it', () => {
  const m = resolvePartMaterial(ASTRONAUT_RIG.parts.torso);
  m.albedoLinear[0] = 0;
  assert.notEqual(ASTRONAUT_RIG.parts.torso.material.albedoLinear[0], 0);
});

test('astronaut rig: immutable template, coordinate metadata and geometry', () => {
  assert.equal(ASTRONAUT_RIG.metadata.forward, '-Y');
  assert.equal(ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad, Math.PI / 2);
  // Stage 16 (Asama 16): 6 m is a visual presentation stride (was 1.25 m); see the tempo test for the rationale.
  assert.equal(ASTRONAUT_RIG.metadata.presentationStrideLengthM, 6);
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
  // Visual-realism stage B: the control module is now a mid-grey unit on a white suit (was light blue-grey
  // [0.85, 0.88, 0.92], which vanished against the new off-white torso).
  assert.deepEqual(ASTRONAUT_RIG.parts.chestPack.colorRgb, [0.58, 0.60, 0.63]);
  assert.ok(ASTRONAUT_RIG.parts.plssAntenna, 'PLSS antenna exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.plssAntenna.colorRgb, [0.75, 0.78, 0.82]);
  assert.ok(ASTRONAUT_RIG.parts.leftGlove, 'Left EVA glove exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.leftGlove.colorRgb, [0.20, 0.22, 0.25]);
  assert.ok(ASTRONAUT_RIG.parts.rightGlove, 'Right EVA glove exists');
  assert.deepEqual(ASTRONAUT_RIG.parts.rightGlove.colorRgb, [0.20, 0.22, 0.25]);

  // First-person rig parts contract
  // Visual-realism stage B: the two metallic wrist rings were appended (drawn after the gloves) so the
  // sleeve/glove coupling is visible in the first-person view-model; the first six entries are unchanged.
  assert.deepEqual(
    FIRST_PERSON_RIG_PARTS,
    ['torso', 'chestPack', 'leftArm', 'rightArm', 'leftGlove', 'rightGlove', 'leftWristRing', 'rightWristRing']
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

  // 1. Ascent (verticalSpeedMps > 0.5): Mars jump launch. Exemplar vz = 1.2 (was 2.0): above 1.0 m/s the
  // pose is deliberately blended with the grounded gait pose for a continuous take-off (stage B), so the
  // pure ascent pose is checked just below the blend window.
  const ascent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: 1.2 });
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
  // Exemplar vz = -1.2 (was -2.0): below -1.0 m/s the pose blends into the touchdown-absorb pose (stage B).
  const descent = poseAstronautRig({ ...baseAirborne, verticalSpeedMps: -1.2 });
  assert.equal(descent.pose, 'airborne');
  // Feet/legs reaching forward and down to prepare for surface contact (negative pitch)
  assert.ok(descent.parts.leftLeg.rotationRad[0] < -0.15, 'Descent legs reaching forward for touchdown');
  assert.ok(descent.parts.rightLeg.rotationRad[0] < -0.15);
  // Boots in dorsiflexion (peak -0.071 here; it was -0.14 at -2.0 before the touchdown blend existed)
  assert.ok(descent.parts.leftBoot.rotationRad[0] < -0.06, 'Descent boots in dorsiflexion');
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
  // (exemplar vz 1.2 / -1.2 instead of +-2.0: the take-off/touchdown blend windows start at +-1.0 m/s)
  const ascent = poseAstronautRig({ timeS: 2.0, horizontalSpeedMps: 0.5, verticalSpeedMps: 1.2, grounded: false, airborne: true, phase: 'running' });
  assert.ok(ascent.parts.leftGlove.rotationRad[0] < -0.4, 'Ascent gloves reaching upward with arms');
  assert.ok(ascent.parts.rightGlove.rotationRad[0] < -0.4);

  // Jump Apex Balance regime: gloves flare wide to sides
  const apex = poseAstronautRig({ timeS: 2.5, horizontalSpeedMps: 0.5, verticalSpeedMps: 0.0, grounded: false, airborne: true, phase: 'running' });
  assert.ok(apex.parts.leftGlove.rotationRad[1] > 0.15, 'Apex left glove flared wide');
  assert.ok(apex.parts.rightGlove.rotationRad[1] < -0.15, 'Apex right glove flared wide');

  // Jump Descent regime: gloves brace forward/downward
  const descent = poseAstronautRig({ timeS: 3.0, horizontalSpeedMps: 0.5, verticalSpeedMps: -1.2, grounded: false, airborne: true, phase: 'running' });
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
  // Golden value (stride 6 m): 2*pi * (1.2 / 6 Hz) * 1.5 s = 2*pi * 0.3 = 0.6*pi = 1.8849555921538759 rad.
  // (Previously, with a 1.25 m stride: 2*pi * 0.44 = 2.7646015351590165 rad.)
  assert.ok(Math.abs(walk.gaitPhaseRad - 1.8849555921538759) < 1e-12, `gait phase ${walk.gaitPhaseRad}`);
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

// --- gaitDistanceM: distance-based gait phase (continuous across speed changes) ---

// SCENARIO.timeScale in config.js (assumed here as a documented test constant; the rig cannot change it).
const SCENARIO_TIME_SCALE = 8;
const SCENARIO_FRAME_DT_S = SCENARIO_TIME_SCALE / 60; // one 60 fps wall frame in scenario seconds

const WALK_DIST = (timeS, speed, gaitDistanceM) => ({
  ...WALK_AT(timeS, speed),
  ...(gaitDistanceM === undefined ? {} : { gaitDistanceM }),
});

function maxFullPoseJump(a, b) {
  const world = maxPoseJump(a, b);
  const vm = maxViewModelJump(a, b);
  return Math.max(world.rot, world.off, vm.rot, vm.off);
}

test('Stage 14+: gaitDistanceM validation', () => {
  for (const bad of [Number.NaN, -1, Infinity, '3', null]) {
    assert.throws(() => poseAstronautRig(WALK_DIST(1, 1, bad)), TypeError, `gaitDistanceM=${String(bad)}`);
  }
  for (const ok of [0, 12.5]) {
    assert.doesNotThrow(() => poseAstronautRig(WALK_DIST(1, 1, ok)), `gaitDistanceM=${ok}`);
  }
  assert.doesNotThrow(() => poseAstronautRig(WALK_AT(1, 1)), 'field stays optional');
});

test('Stage 14+: distance-based phase equals time-based phase at constant speed from t=0', () => {
  const stride = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
  for (const [speed, timeS] of [[0.3, 1.7], [1.0, 12.3], [1.2, 250.5], [2.4, 999.9]]) {
    const timed = poseAstronautRig(WALK_AT(timeS, speed));
    const dist = poseAstronautRig(WALK_DIST(timeS, speed, speed * timeS));
    assert.ok(Math.abs(timed.gaitPhaseRad - dist.gaitPhaseRad) < 1e-9, `phase at v=${speed}, t=${timeS}`);
    assert.equal(dist.gaitFrequencyHz, speed / stride, 'cadence still speed / stride');
    assert.equal(dist.viewModel.stepPhaseRad, dist.gaitPhaseRad, 'viewModel inherits the phase');
    assert.ok(maxFullPoseJump(timed, dist) < 1e-8, 'whole pose agrees');
  }
});

test('Stage 14+: gait phase stays continuous across a speed change when distance is supplied', () => {
  const dist = 123.4;
  const a = poseAstronautRig(WALK_DIST(100, 1.0, dist));
  const b = poseAstronautRig(WALK_DIST(100, 1.01, dist));
  assert.equal(a.gaitPhaseRad, b.gaitPhaseRad, 'same distance gives the same phase');
  // Measured max component difference 3.6e-3 (tolerance ~2.7x). The remainder is not a phase jump: it
  // comes from speed-scaled amplitudes (speedNorm, ease) changing by 1% at the same phase.
  assert.ok(maxFullPoseJump(a, b) < 0.01, `with distance: ${maxFullPoseJump(a, b)}`);

  // Without the field the same 1% speed change shifts the phase by 2*pi*dv*t/stride (a visible jump).
  // With the 6 m stride this is 4.8x smaller than with 1.25 m, and sin() can coincidentally cancel it
  // (e.g. t=100 s gives only 0.003), so t=150 s is used; measured 0.375 there. This documents why the
  // field exists (residual of the stateless fallback).
  const c = poseAstronautRig(WALK_DIST(150, 1.0));
  const d = poseAstronautRig(WALK_DIST(150, 1.01));
  assert.ok(maxFullPoseJump(c, d) > 0.1, `without distance: ${maxFullPoseJump(c, d)}`);
});

test('Stage 14+: speed ramp (landing-recovery style) has smooth gait with distance, jumpy without', () => {
  const dt = SCENARIO_FRAME_DT_S;
  const steps = 600;
  const maxLegStep = (useDistance) => {
    let distance = 0;
    let timeS = 50;
    let prev = null;
    let worst = 0;
    for (let i = 0; i <= steps; i += 1) {
      const frac = i / steps;
      const speed = 1.2 - 0.6 * (1 - Math.abs(2 * frac - 1)); // 1.2 -> 0.6 -> 1.2 m/s
      const pitch = poseAstronautRig(WALK_DIST(timeS, speed, useDistance ? distance : undefined)).parts.leftLeg.rotationRad[0];
      if (prev !== null) worst = Math.max(worst, Math.abs(pitch - prev));
      prev = pitch;
      distance += speed * dt;
      timeS += dt;
    }
    return worst;
  };
  // Realistic scenario frame step (60 fps wall, timeScale 8). Measured (6 m stride): with distance
  // 0.075 rad/step; without distance 0.19 rad/step.
  const withDistance = maxLegStep(true);
  const without = maxLegStep(false);
  assert.ok(withDistance < 0.12, `with distance: ${withDistance}`);
  assert.ok(without > 0.14, `without distance: ${without}`);
  assert.ok(without > 2 * withDistance, 'distance phase is clearly smoother');
});

test('Stage 14+: gaitDistanceM keeps output deterministic and frozen', () => {
  const state = WALK_DIST(37.25, 1.1, 41.0);
  const a = poseAstronautRig(state);
  const b = poseAstronautRig({ ...state });
  assert.deepStrictEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.parts.leftLeg) && Object.isFrozen(a.viewModel));
  assert.ok(a.gaitPhaseRad >= 0 && a.gaitPhaseRad < 2 * Math.PI);
  // Distance only drives the walk phase: other poses ignore it.
  const idle = { timeS: 3, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'idle' };
  assert.deepStrictEqual(poseAstronautRig({ ...idle, gaitDistanceM: 99 }), poseAstronautRig(idle));
});


// ---- Stage 16 (Asama 16): calm tempo, continuity, first-person lower-body data ----

const STAGE16_WALK = (timeS, speed, extra = {}) => ({
  timeS, horizontalSpeedMps: speed, verticalSpeedMps: 0, grounded: true,
  groundContactStatus: STATUS.OK, phase: 'running', ...extra,
});

test('Stage 16: arm swing tempo is calm in wall-clock terms and arms counter-swing the legs', () => {
  const stride = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
  const speed = 1.2; // SCENARIO.walkSpeedMps
  // Wall-clock cadence = timeScale * speed / stride. Before this stage (1.25 m) it was 7.68 Hz.
  const wallHz = SCENARIO_TIME_SCALE * speed / stride;
  assert.ok(wallHz <= 2.0, `wall-clock arm cadence ${wallHz} Hz`);

  // Sample in wall time (scenario time = timeScale * wall time) over several cycles.
  const dtWall = 1 / 2000;
  let prevArm = null;
  let peakArmSpeed = 0;
  let armPeak = 0;
  let legPeak = 0;
  for (let i = 0; i < 4000; i += 1) {
    const pose = poseAstronautRig(STAGE16_WALK(10 + SCENARIO_TIME_SCALE * i * dtWall, speed));
    const arm = pose.parts.leftArm.rotationRad[0];
    if (prevArm !== null) peakArmSpeed = Math.max(peakArmSpeed, Math.abs(arm - prevArm) / dtWall);
    prevArm = arm;
    armPeak = Math.max(armPeak, Math.abs(arm));
    legPeak = Math.max(legPeak, Math.abs(pose.parts.leftLeg.rotationRad[0]));
    // Counter-phase: left and right arm pitch deviate in opposite directions from their shared offset.
    const sum = pose.parts.leftArm.rotationRad[0] + pose.parts.rightArm.rotationRad[0];
    assert.ok(Math.abs(sum) < 1e-9 + 0.04, 'arms counter-swing about a shared small offset');
    // Each arm swings opposite to its same-side leg.
    const armDev = pose.parts.leftArm.rotationRad[0] - (pose.parts.leftArm.rotationRad[0] + pose.parts.rightArm.rotationRad[0]) / 2;
    const legDev = pose.parts.leftLeg.rotationRad[0] - (pose.parts.leftLeg.rotationRad[0] + pose.parts.rightLeg.rotationRad[0]) / 2;
    assert.ok(armDev * legDev <= 1e-12, 'left arm opposes left leg');
  }
  // Measured 0.223 rad peak and 2.25 rad per wall second (was 0.324 rad and 15.5 rad/s).
  assert.ok(peakArmSpeed < 3.5, `peak arm angular speed ${peakArmSpeed} rad/wall-s`);
  assert.ok(armPeak < 0.6 * legPeak, `arm peak ${armPeak} vs leg peak ${legPeak}`);
});

test('Stage 16: speed-change, idle/walk, landing and pause transitions stay continuous', () => {
  // (a) Speed ramp 1.2 -> 0.6 -> 1.2 m/s with integrated gaitDistanceM at the realistic frame step:
  // the worst per-frame arm change must be about the natural per-frame motion at constant speed.
  const worstArmFrame = (speedAt) => {
    let distance = 0;
    let timeS = 50;
    let prev = null;
    let worst = 0;
    for (let i = 0; i <= 600; i += 1) {
      const speed = speedAt(i / 600);
      const pose = poseAstronautRig(STAGE16_WALK(timeS, speed, { gaitDistanceM: distance }));
      if (prev) {
        for (const id of ['leftArm', 'rightArm', 'leftGlove', 'rightGlove']) {
          for (let k = 0; k < 3; k += 1) {
            worst = Math.max(worst, Math.abs(pose.parts[id].rotationRad[k] - prev.parts[id].rotationRad[k]),
              Math.abs(pose.parts[id].offset[k] - prev.parts[id].offset[k]));
          }
        }
      }
      prev = pose;
      distance += speed * SCENARIO_FRAME_DT_S;
      timeS += SCENARIO_FRAME_DT_S;
    }
    return worst;
  };
  const natural = worstArmFrame(() => 1.2);
  const ramped = worstArmFrame((f) => 1.2 - 0.6 * (1 - Math.abs(2 * f - 1)));
  // Measured ratio 1.00 (before this stage: 0.97, i.e. also no extra jump, but each natural frame
  // step was 0.25 rad because the cadence was 8 times faster in phase per frame).
  assert.ok(ramped / natural < 1.15, `ramp/natural per-frame arm change ${ramped / natural}`);
  assert.ok(natural < 0.06, `natural per-frame arm change ${natural} rad`);

  // (b) Landing recovery <-> walk at the 0.04 m/s threshold (same time, same recovery fraction).
  for (const frac of [1, 0.5, 0.1]) {
    const land = poseAstronautRig(LAND_AT(frac, { timeS: 37.3, horizontalSpeedMps: 0.04 }));
    const walk = poseAstronautRig(LAND_AT(frac, { timeS: 37.3, horizontalSpeedMps: 0.0401 }));
    assert.equal(land.pose, 'landing');
    assert.equal(walk.pose, 'walk');
    // Measured rotation jump <= 0.0017 rad (before: 0.21 rad at frac 1); bound covers offsets too.
    assert.ok(maxFullPoseJump(land, walk) < 0.01, `landing->walk at frac ${frac}: ${maxFullPoseJump(land, walk)}`);
  }

  // (c) Pause: frozen timeS and motion state give a bit-identical pose, with or without distance.
  const frozen = STAGE16_WALK(12.5, 1.1, { gaitDistanceM: 13.7 });
  assert.deepStrictEqual(poseAstronautRig({ ...frozen, phase: 'paused' }), poseAstronautRig({ ...frozen, phase: 'paused' }));
  assert.deepStrictEqual(poseAstronautRig({ ...frozen, phase: 'paused' }), poseAstronautRig({ ...frozen, phase: 'walk' }));

  // (d) Gait amplitude eases in from rest: arms at 0.0401 m/s equal the idle arms within a hair.
  const idle = poseAstronautRig(STAGE16_WALK(9, 0.04));
  const justWalking = poseAstronautRig(STAGE16_WALK(9, 0.0401, { gaitDistanceM: 0.5 }));
  for (const id of ['leftArm', 'rightArm', 'leftGlove', 'rightGlove']) {
    for (let k = 0; k < 3; k += 1) {
      assert.ok(Math.abs(idle.parts[id].rotationRad[k] - justWalking.parts[id].rotationRad[k]) < 0.005, `${id} rot ${k}`);
    }
  }

  // (e) Time fallback and distance path agree when distance = speed * time (stateless fallback is exact
  // at constant speed; its residual is only the phase shift after a speed change, covered above).
  for (const [speed, timeS] of [[0.5, 3.3], [1.2, 77.7]]) {
    assert.ok(maxFullPoseJump(
      poseAstronautRig(STAGE16_WALK(timeS, speed)),
      poseAstronautRig(STAGE16_WALK(timeS, speed, { gaitDistanceM: speed * timeS })),
    ) < 1e-8);
  }
});

test('Stage 16: first-person lower-body export is frozen, additive and chained in every pose', () => {
  // Visual-realism stage B: ankle rings appended after the original four lower-body parts.
  assert.deepEqual([...FIRST_PERSON_LOWER_BODY_PARTS], ['leftLeg', 'rightLeg', 'leftBoot', 'rightBoot', 'leftAnkleRing', 'rightAnkleRing']);
  assert.ok(Object.isFrozen(FIRST_PERSON_LOWER_BODY_PARTS));
  // First-person list: original six entries unchanged (wrist rings appended), disjoint from the lower body.
  assert.deepEqual([...FIRST_PERSON_RIG_PARTS].slice(0, 6), ['torso', 'chestPack', 'leftArm', 'rightArm', 'leftGlove', 'rightGlove']);
  assert.ok(FIRST_PERSON_LOWER_BODY_PARTS.every((id) => !FIRST_PERSON_RIG_PARTS.includes(id)));
  const hint = ASTRONAUT_RIG.metadata.firstPersonLowerBody;
  assert.deepEqual([...ASTRONAUT_RIG.metadata.firstPersonLowerBodyParts], [...FIRST_PERSON_LOWER_BODY_PARTS]);
  assert.equal(hint.visibleOnlyWhenLookingDown, true);
  assert.equal(hint.provisional, true);
  assert.ok(hint.minLookDownPitchRad > 0 && hint.minLookDownPitchRad < hint.fullLookDownPitchRad);
  assert.ok(Object.isFrozen(hint));
  for (const id of FIRST_PERSON_LOWER_BODY_PARTS) {
    assert.ok(ASTRONAUT_RIG.parts[id].pivot.every(Number.isFinite), `${id} pivot`);
  }

  const states = [];
  for (const speed of [0, 0.03, 0.0401, 0.3, 0.8, 1.2, 1.4, 2.4]) {
    for (const timeS of [0, 0.37, 2.9, 41.3]) {
      states.push(STAGE16_WALK(timeS, speed), STAGE16_WALK(timeS, speed, { gaitDistanceM: speed * timeS }));
      for (const frac of [0.2, 1]) states.push(LAND_AT(frac, { timeS, horizontalSpeedMps: speed }));
    }
  }
  for (const vz of [-3, -2.4, -0.5, 0, 0.5, 1.5, 3]) states.push(AIR_AT(2, vz));
  states.push({ timeS: 1, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'stop' });
  states.push({ timeS: 1, horizontalSpeedMps: 1, verticalSpeedMps: 0, grounded: false, groundContactStatus: STATUS.NO_DATA, phase: 'running' });

  let maxLegAngle = 0;
  let maxBootAngle = 0;
  let maxAttach = 0;
  for (const state of states) {
    const pose = poseAstronautRig(state);
    for (const id of FIRST_PERSON_LOWER_BODY_PARTS) {
      const p = pose.parts[id];
      assert.ok(p.offset.every(Number.isFinite) && p.rotationRad.every(Number.isFinite), `${id} finite`);
      const angle = Math.max(...p.rotationRad.map(Math.abs));
      if (id.endsWith('Leg')) maxLegAngle = Math.max(maxLegAngle, angle);
      else maxBootAngle = Math.max(maxBootAngle, angle);
    }
    for (const side of ['left', 'right']) {
      const leg = ASTRONAUT_RIG.parts[`${side}Leg`];
      const boot = ASTRONAUT_RIG.parts[`${side}Boot`];
      const legPose = pose.parts[`${side}Leg`];
      const bootPose = pose.parts[`${side}Boot`];
      const bootPivot = addV(addV(rotateEulerRef(subV(boot.pivot, boot.center), bootPose.rotationRad), boot.center), bootPose.offset);
      const carried = addV(leg.pivot, rotateEulerRef(subV(boot.pivot, leg.pivot), legPose.rotationRad));
      maxAttach = Math.max(maxAttach, distV(bootPivot, carried));
    }
  }
  assert.ok(maxAttach < 1e-9, `boot-leg attachment error ${maxAttach}`);
  // Measured max leg angle over this sweep is 0.70 rad (full-speed walk 0.52 + full landing absorb
  // 0.18; it was 0.64 before the landing/walk terms were aligned); bound is pi/4 = 0.785, so no extreme angles.
  assert.ok(maxLegAngle < Math.PI / 4, `leg angle ${maxLegAngle}`);
  assert.ok(maxBootAngle < Math.PI / 4, `boot angle ${maxBootAngle}`);
});

test('Stage 16: unknown contact stays neutral, including lower body and viewModel', () => {
  for (const extra of [{}, { gaitDistanceM: 50 }]) {
    const pose = poseAstronautRig({
      timeS: 12.3, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true,
      groundContactStatus: STATUS.NO_DATA, phase: 'running', ...extra,
    });
    assert.equal(pose.pose, 'unknown');
    assert.deepEqual([...pose.rootOffset], [0, 0, 0]);
    assert.deepEqual([...pose.rootRotationRad], [0, 0, 0]);
    for (const id of FIRST_PERSON_LOWER_BODY_PARTS) {
      assert.deepEqual([...pose.parts[id].offset], [0, 0, 0], `${id} offset`);
      assert.deepEqual([...pose.parts[id].rotationRad], [0, 0, 0], `${id} rotation`);
    }
    assert.deepEqual([...pose.viewModel.offset], [0, 0, 0]);
  }
});

// ---- Visual-realism stage B: appearance metadata, rigid/chained attachments, blends, Mars gait scaling ----

// Template point p of part `id` in the rendered world frame: R(rot) * (p - center) + center + offset.
const worldPoint = (id, pose, p) => {
  const part = ASTRONAUT_RIG.parts[id];
  const pp = pose.parts[id];
  const r = rotateEulerRef(subV(p, part.center), pp.rotationRad);
  return addV(addV(r, part.center), pp.offset);
};

const STAGE_B_STATES = (() => {
  const out = [];
  for (const speed of [0, 0.3, 0.8, 1.4, 2.4]) {
    for (const timeS of [0.37, 2.9]) out.push(STAGE16_WALK(timeS, speed, { gaitDistanceM: speed * timeS }));
    out.push(LAND_AT(0.6, { timeS: 1.1, horizontalSpeedMps: speed }));
  }
  for (const vz of [-2.4, -1.5, -0.4, 0, 0.4, 1.5, 2.4]) out.push(AIR_AT(1.7, vz));
  out.push({ timeS: 3, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'stop' });
  return out;
})();

test('Stage B: appearance metadata is in range and every part has a material and side', () => {
  const sides = new Set(['physicalLeft', 'physicalRight', 'center']);
  for (const [id, part] of Object.entries(ASTRONAUT_RIG.parts)) {
    assert.ok(part.colorRgb.every((c) => c >= 0 && c <= 1), `${id} colorRgb in [0,1]`);
    assert.ok(part.material.albedoLinear.every((c) => c >= 0 && c <= 1), `${id} albedoLinear in [0,1]`);
    assert.ok(part.material.roughness >= 0 && part.material.roughness <= 1, `${id} roughness`);
    assert.ok(part.material.metallic >= 0 && part.material.metallic <= 1, `${id} metallic`);
    assert.ok(sides.has(part.side), `${id} side`);
  }
  // Suit outer layer is warm off-white, not pure white (avoids clipping) and not orange.
  const torso = ASTRONAUT_RIG.parts.torso.colorRgb;
  assert.ok(torso.every((c) => c > 0.75 && c < 0.95), 'torso is off-white');
  assert.ok(torso[2] <= torso[0] + 0.02, 'torso is not blue-tinted');
  assert.ok(ASTRONAUT_RIG.parts.visor.material.metallic >= 0.5, 'visor is a reflective (metallic) gold');
});

test('Stage B: first-person list excludes helmet, visor and PLSS hardware (camera stays clear)', () => {
  for (const id of ['helmet', 'visor', 'backpack', 'plssAntenna', 'plssPanel', 'neckRing', 'waistRing', 'leftSole', 'rightSole']) {
    assert.ok(!FIRST_PERSON_RIG_PARTS.includes(id), `${id} must not be in the first-person list`);
  }
  for (const id of ['leftGlove', 'rightGlove', 'leftWristRing', 'rightWristRing']) {
    assert.ok(FIRST_PERSON_RIG_PARTS.includes(id), `${id} is visible in first person`);
  }
});

test('Stage B: rigid followers coincide with their parent frame and chained children keep their pivot', () => {
  const rigid = { visor: 'helmet', leftWristRing: 'leftArm', rightWristRing: 'rightArm', leftAnkleRing: 'leftLeg', rightAnkleRing: 'rightLeg', leftSole: 'leftBoot', rightSole: 'rightBoot' };
  const chained = { leftGlove: 'leftArm', rightGlove: 'rightArm', leftBoot: 'leftLeg', rightBoot: 'rightLeg' };
  let maxRigid = 0;
  let maxChain = 0;
  for (const state of STAGE_B_STATES) {
    const pose = poseAstronautRig(state);
    for (const [child, parent] of Object.entries(rigid)) {
      for (const p of [ASTRONAUT_RIG.parts[child].center, ASTRONAUT_RIG.parts[child].pivot]) {
        maxRigid = Math.max(maxRigid, distV(worldPoint(child, pose, p), worldPoint(parent, pose, p)));
      }
    }
    for (const [child, parent] of Object.entries(chained)) {
      const cp = ASTRONAUT_RIG.parts[child].pivot;
      const pp = ASTRONAUT_RIG.parts[parent].pivot;
      const expected = addV(pp, rotateEulerRef(subV(cp, pp), pose.parts[parent].rotationRad));
      maxChain = Math.max(maxChain, distV(worldPoint(child, pose, cp), expected));
    }
  }
  assert.ok(maxRigid < 1e-9, `rigid follower error ${maxRigid}`);
  assert.ok(maxChain < 1e-9, `chained pivot error ${maxChain}`);
});

test('Stage B: blendRigPoses endpoints, determinism, continuity and attachments at intermediate t', () => {
  const a = poseAstronautRig(STAGE16_WALK(2.2, 1.2, { gaitDistanceM: 2.6 }));
  const b = poseAstronautRig(AIR_AT(1.7, 1.5));
  const at0 = blendRigPoses(a, b, 0);
  const at1 = blendRigPoses(a, b, 1);
  assert.deepEqual(maxPoseJump(at0, a), { rot: 0, off: 0 });
  assert.deepEqual(maxPoseJump(at1, b), { rot: 0, off: 0 });
  assert.deepEqual(blendRigPoses(a, b, 0.37), blendRigPoses(a, b, 0.37));
  assert.deepEqual(blendRigPoses(a, b, 2), at1, 't is clamped to [0,1]');
  assert.throws(() => blendRigPoses(a, null, 0.5), TypeError);
  assert.throws(() => blendRigPoses(a, b, Number.NaN), TypeError);

  // Sampled blend: largest joint change between consecutive 1/200 steps is small (no snap), and the
  // rigid/chained attachments stay exact at every intermediate t.
  let maxStep = 0;
  let prev = at0;
  let maxAttach = 0;
  for (let k = 1; k <= 200; k += 1) {
    const cur = blendRigPoses(a, b, k / 200);
    const jump = maxPoseJump(prev, cur);
    maxStep = Math.max(maxStep, jump.rot, jump.off);
    prev = cur;
    if (k % 20 === 0) {
      for (const [child, parent] of [['leftBoot', 'leftLeg'], ['rightGlove', 'rightArm'], ['leftAnkleRing', 'leftLeg'], ['visor', 'helmet']]) {
        const pp = ASTRONAUT_RIG.parts[parent].pivot;
        const cp = ASTRONAUT_RIG.parts[child].pivot;
        if (child === 'visor' || child.endsWith('AnkleRing')) {
          maxAttach = Math.max(maxAttach, distV(worldPoint(child, cur, cp), worldPoint(parent, cur, cp)));
        } else {
          const expected = addV(pp, rotateEulerRef(subV(cp, pp), cur.parts[parent].rotationRad));
          maxAttach = Math.max(maxAttach, distV(worldPoint(child, cur, cp), expected));
        }
      }
    }
  }
  assert.ok(maxStep < 0.1, `per-step blend change ${maxStep}`);
  assert.ok(maxAttach < 1e-9, `blend attachment error ${maxAttach}`);
});

test('Stage B: Froude scaling puts the walk-run transition well below Earth values (model, not measured)', () => {
  const meta = ASTRONAUT_RIG.metadata.gaitModel;
  assert.equal(meta.marsGravityMps2, 3.71);
  const vMars = walkRunTransitionSpeedMps();
  const vEarth = walkRunTransitionSpeedMps({ gravityMps2: 9.80665 });
  assert.ok(Math.abs(vMars - Math.sqrt(0.5 * 3.71 * 0.9)) < 1e-12);
  assert.ok(vMars < vEarth);
  assert.ok(Math.abs(vMars / vEarth - Math.sqrt(3.71 / 9.80665)) < 1e-12, 'ratio is sqrt(g_Mars/g_Earth)');
  assert.ok(Math.abs(froudeNumber(vMars) - 0.5) < 1e-12);
});

test('Stage B: presentation stride is preserved and strideLengthForSpeedM is finite and monotone', () => {
  assert.equal(ASTRONAUT_RIG.metadata.presentationStrideLengthM, 6);
  assert.ok(Math.abs(strideLengthForSpeedM(1.2) - 6) < 1e-12, 'reference walk speed returns the legacy 6 m stride');
  let prev = -Infinity;
  for (let v = 0; v <= 3; v += 0.01) {
    const s = strideLengthForSpeedM(v);
    assert.ok(Number.isFinite(s) && s > 0, `finite at ${v}`);
    assert.ok(s >= prev - 1e-12, `monotone at ${v}`);
    prev = s;
  }
  assert.throws(() => strideLengthForSpeedM(-1), TypeError);
  assert.throws(() => strideLengthForSpeedM(Number.NaN), TypeError);
});

test('rig unit geometries: closed outward-wound meshes inside the unit cube with unit normals', () => {
  for (const name of RIG_GEOMETRY_NAMES) {
    const g = createRigUnitGeometry(name);
    const { positions: p, normals: n, indices: ix } = g;
    assert.equal(p.length, n.length, `${name} normals align`);
    assert.equal(ix.length % 3, 0);
    for (let i = 0; i < p.length; i++) assert.ok(Math.abs(p[i]) <= 0.5 + 1e-9, `${name} inside unit cube`);
    for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-9, `${name} unit normal`);
    for (const index of ix) assert.ok(index >= 0 && index < p.length / 3);
    // Signed volume (divergence theorem) must be positive for outward winding, and the mesh must be watertight-ish
    // in the sense that every geometric face normal agrees with the vertex normals on average.
    let volume = 0, agreement = 0, count = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const A = [p[a], p[a + 1], p[a + 2]], B = [p[b], p[b + 1], p[b + 2]], C = [p[c], p[c + 1], p[c + 2]];
      volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const vn = [n[a] + n[b] + n[c], n[a + 1] + n[b + 1] + n[c + 1], n[a + 2] + n[b + 2] + n[c + 2]];
      if (Math.hypot(...fn) > 1e-12) { count++; if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] > 0) agreement++; }
    }
    assert.ok(volume > 0.3 && volume <= 1 + 1e-9, `${name} signed volume ${volume}`);
    assert.equal(agreement, count, `${name} winding agrees with normals`);
  }
});

test('rig geometry atlas: ranges tile the shared index buffer, are Uint16-safe, and every part names a known unit mesh', () => {
  const atlas = createRigGeometryAtlas();
  assert.ok(atlas.positions.length / 3 < 65536);
  let cursor = 0;
  for (const name of RIG_GEOMETRY_NAMES) {
    const r = atlas.ranges[name];
    assert.equal(r.indexStart, cursor, `${name} start`);
    cursor += r.indexCount;
  }
  assert.equal(cursor, atlas.indices.length);
  for (const [id, part] of Object.entries(ASTRONAUT_RIG.parts)) assert.ok(RIG_GEOMETRY_NAMES.includes(part.geometry), `${id} geometry`);
  assert.equal(ASTRONAUT_RIG.parts.helmet.geometry, 'sphere');
  assert.equal(ASTRONAUT_RIG.parts.visor.geometry, 'sphere');
  assert.ok(Object.values(ASTRONAUT_RIG.parts).filter((p) => p.geometry !== 'unitBox').length >= 20, 'silhouette is no longer all boxes');
  assert.throws(() => createRigUnitGeometry('nope'), TypeError);
});

test('rig visor: gold ellipsoid fronting the helmet (helmet front is the -Y face) and clear of the first-person list', () => {
  const { helmet, visor } = ASTRONAUT_RIG.parts;
  const helmetFrontY = helmet.center[1] - helmet.size[1] / 2;
  const visorFrontY = visor.center[1] - visor.size[1] / 2;
  assert.ok(visorFrontY <= helmetFrontY && visorFrontY >= helmetFrontY - 0.03, 'visor just proud of the helmet shell');
  assert.ok(visor.size[0] < helmet.size[0] && visor.size[2] < helmet.size[2]);
  assert.equal(resolvePartMaterial(visor).metallic, 1);
  assert.ok(!FIRST_PERSON_RIG_PARTS.includes('helmet') && !FIRST_PERSON_RIG_PARTS.includes('visor'));
});
test('jump flight poses are clearly distinct from the walking gait (apex wings, ascent reach, descent brace)', () => {
  const base = { timeS: 3, horizontalSpeedMps: 0, grounded: false, airborne: true, phase: 'airborne' };
  const walk = poseAstronautRig({ timeS: 3, horizontalSpeedMps: 1.2, verticalSpeedMps: 0, grounded: true, phase: 'walk' });
  const ascent = poseAstronautRig({ ...base, verticalSpeedMps: 1.2 });
  const apex = poseAstronautRig({ ...base, verticalSpeedMps: 0 });
  const descent = poseAstronautRig({ ...base, verticalSpeedMps: -1.2 });
  assert.ok(Math.abs(walk.parts.leftArm.rotationRad[1]) < 0.15, 'walking arms hang close to the body');
  assert.ok(apex.parts.leftArm.rotationRad[1] > 0.45, 'apex arms are flared wide for balance');
  assert.ok(apex.parts.leftLeg.rotationRad[0] * apex.parts.rightLeg.rotationRad[0] < 0, 'apex legs are split (one forward, one back)');
  assert.ok(ascent.parts.leftArm.rotationRad[0] < -0.7, 'ascent arms reach well forward/up');
  assert.ok(descent.parts.leftLeg.rotationRad[0] < -0.3, 'descent legs reach forward to brace');
  assert.ok(descent.parts.leftArm.rotationRad[1] > 0.3, 'descent arms stay out for balance');
});