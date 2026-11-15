// Stage 17 (K2): camera-attached first-person hands, look-down layers and the first-person draw plan.
// All checks are pure functions of the rig template and pose; no WebGL or DOM is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASTRONAUT_RIG,
  FIRST_PERSON_RIG_PARTS,
  FIRST_PERSON_LOWER_BODY_PARTS,
  FIRST_PERSON_LOOK_DOWN_UPPER_PARTS,
  RIG_SHADOW_CASTER_PARTS,
  firstPersonDrawPlan,
  firstPersonHandParts,
  firstPersonLookDownLayers,
  firstPersonRootPose,
  poseAstronautRig,
} from '../public/js/view/3d/astronaut-rig.js';

const EYE_RIG_Z = 1.48; // camera.js FIRST_PERSON_EYE_HEIGHT_M; the helmet centre in the rig
const ZERO_VIEW_MODEL = Object.freeze({ offset: [0, 0, 0], rotationRad: [0, 0, 0], breathPhaseRad: 0, stepPhaseRad: 0 });

// Same rotation convention as the renderer/shader: X, then Y, then Z.
function rotate([x, y, z], [rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  [y, z] = [cx * y - sx * z, sx * y + cx * z];
  const cy = Math.cos(ry), sy = Math.sin(ry);
  [x, z] = [cy * x + sy * z, -sy * x + cy * z];
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [cz * x - sz * y, sz * x + cz * y, z];
}

// A part centre in the eye frame (eye at the origin, rig forward = -Y, view axis after the root pitch).
function eyeFrameCentre(id, handParts, root) {
  const part = ASTRONAUT_RIG.parts[id];
  const pp = handParts[id];
  const p = part.center.map((v, i) => v + pp.offset[i] + root.rootOffset[i]);
  return rotate(p, root.rootRotationRad);
}

const angleBetween = (a, b) => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))));
};

const idle = { timeS: 1, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'idle' };
const stop = { timeS: 1, horizontalSpeedMps: 0, verticalSpeedMps: 0, grounded: true, phase: 'stop' };
const walkAt = (gaitDistanceM) => ({ timeS: 1, horizontalSpeedMps: 1.4, verticalSpeedMps: 0, grounded: true, phase: 'walk', gaitDistanceM });
const airAt = (verticalSpeedMps) => ({ timeS: 2, horizontalSpeedMps: 1.2, verticalSpeedMps, grounded: false, airborne: true, phase: 'airborne' });

test('Stage 17 K2: first-person hand list is hands only; torso, PLSS, helmet and visor never draw in the forward view', () => {
  assert.deepEqual([...FIRST_PERSON_RIG_PARTS], ['leftArm', 'rightArm', 'leftGlove', 'rightGlove', 'leftWristRing', 'rightWristRing']);
  for (const id of ['torso', 'chestPack', 'backpack', 'helmet', 'visor', 'neckRing', 'waistRing', 'leftSole', 'rightSole', 'plssAntenna', 'plssPanel']) {
    assert.ok(!FIRST_PERSON_RIG_PARTS.includes(id), `${id} must not be in the always-drawn hand list`);
  }
  // Looking down reveals the chest band and torso first; the backpack is behind the eye and never listed.
  assert.deepEqual([...FIRST_PERSON_LOOK_DOWN_UPPER_PARTS], ['neckRing', 'torso', 'chestPack', 'waistRing']);
  assert.ok(!FIRST_PERSON_LOOK_DOWN_UPPER_PARTS.includes('backpack'));
  assert.ok(!FIRST_PERSON_LOOK_DOWN_UPPER_PARTS.includes('helmet') && !FIRST_PERSON_LOOK_DOWN_UPPER_PARTS.includes('visor'));
  assert.ok(Object.isFrozen(FIRST_PERSON_RIG_PARTS) && Object.isFrozen(FIRST_PERSON_LOOK_DOWN_UPPER_PARTS));
});

test('Stage 17 K2: the view-model root is the eye (helmet centre): no forward offset, no scale change', () => {
  assert.equal(ASTRONAUT_RIG.parts.helmet.center[2], EYE_RIG_Z, 'helmet centre equals camera eye height');
  const root = firstPersonRootPose({ pitchRad: 0, viewModel: ZERO_VIEW_MODEL });
  assert.deepEqual([...root.rootOffset], [0, 0, -EYE_RIG_Z], 'rig origin is EYE_RIG_Z below the eye, horizontally on the eye');
  assert.deepEqual([...root.rootRotationRad], [0, 0, 0], 'no rotation at level pitch');
  // The eye point maps exactly to the rig origin, so rotations are about the eye.
  const eyeInRig = rotate([0, 0, EYE_RIG_Z].map((v, i) => v + root.rootOffset[i]), root.rootRotationRad);
  assert.ok(eyeInRig.every((v) => Math.abs(v) < 1e-12), 'eye maps to the view-model origin');
  // Presentation scale is 1: part sizes are the template sizes (the renderer no longer scales the hands).
  assert.deepEqual(ASTRONAUT_RIG.parts.leftGlove.size, [0.13, 0.16, 0.17]);
});

test('Stage 17 K2: root pitch equals camera pitch (positive rotation looks down) and is clamped like camera.js', () => {
  const pitch = -0.6;
  const root = firstPersonRootPose({ pitchRad: pitch, viewModel: ZERO_VIEW_MODEL });
  const rigForward = rotate([0, -1, 0], root.rootRotationRad);
  const cameraForward = [0, -Math.cos(pitch), Math.sin(pitch)]; // camera.js view direction in rig frame
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(rigForward[i] - cameraForward[i]) < 1e-12, `forward axis ${i}`);
  // Dynamic pitch offset (head-bob / look-down presentation) adds to the look pitch.
  const combined = firstPersonRootPose({ pitchRad: -0.3, dynamicPitchOffsetRad: -0.3, viewModel: ZERO_VIEW_MODEL });
  assert.ok(Math.abs(combined.rootRotationRad[0] - 0.6) < 1e-12);
  // Beyond 85 degrees the pitch is clamped, as in camera.js FIRST_PERSON_MIN/MAX_PITCH_RAD.
  const clamped = firstPersonRootPose({ pitchRad: -2, viewModel: ZERO_VIEW_MODEL });
  assert.ok(Math.abs(clamped.rootRotationRad[0] - (85 * Math.PI) / 180) < 1e-12);
  assert.throws(() => firstPersonRootPose({ pitchRad: Number.NaN }), TypeError);
});

test('Stage 17 K2: hands are camera-attached: their angle to the view axis is identical at every look pitch', () => {
  for (const state of [idle, stop, walkAt(1.7), airAt(1.2), airAt(0), airAt(-1.2)]) {
    const pose = poseAstronautRig(state);
    const hands = firstPersonHandParts(pose.parts);
    for (const id of ['leftGlove', 'rightGlove', 'leftArm']) {
      const angleAt = (pitch) => {
        const root = firstPersonRootPose({ pitchRad: pitch, viewModel: ZERO_VIEW_MODEL });
        const cameraForward = [0, -Math.cos(pitch), Math.sin(pitch)];
        return angleBetween(eyeFrameCentre(id, hands, root), cameraForward);
      };
      const level = angleAt(0);
      assert.ok(Math.abs(angleAt(-0.7) - level) < 1e-9, `${id} angle at -0.7`);
      assert.ok(Math.abs(angleAt(-1.2) - level) < 1e-9, `${id} angle at -1.2`);
    }
  }
});

test('Stage 17 K2: at level view the gloves sit low, forward and to the sides (lower-frame corners), for every pose', () => {
  const pitch0 = firstPersonRootPose({ pitchRad: 0, viewModel: ZERO_VIEW_MODEL });
  const states = [idle, stop, airAt(1.2), airAt(0), airAt(-1.2)];
  for (let k = 0; k <= 12; k++) states.push(walkAt((k / 12) * 6)); // one full presentation stride
  for (const state of states) {
    const hands = firstPersonHandParts(poseAstronautRig(state).parts);
    for (const id of ['leftGlove', 'rightGlove']) {
      const [x, y, z] = eyeFrameCentre(id, hands, pitch0); // eye frame at level pitch: forward = -Y, down = -Z
      const forward = -y;
      const drop = -z;
      const lateral = Math.abs(x);
      const below = Math.atan2(drop, forward); // angle below the view axis
      assert.ok(forward > 0.35 && forward < 0.8, `${id} ${JSON.stringify(state.phase)} forward ${forward.toFixed(3)} m`);
      assert.ok(lateral > 0.2 && lateral < 0.42, `${id} lateral ${lateral.toFixed(3)} m`);
      // Below the horizon and inside the bottom half of the 80 deg vertical field of view (half-angle 40 deg).
      assert.ok(below > 0.25 && below < 0.7, `${id} angle below axis ${(below * 180 / Math.PI).toFixed(1)} deg`);
    }
  }
});

test('Stage 17 K2: the hand pose is a pure function of the world pose and does not change it', () => {
  const pose = poseAstronautRig(walkAt(2.3));
  const before = JSON.stringify(pose.parts);
  const hands = firstPersonHandParts(pose.parts);
  assert.equal(JSON.stringify(pose.parts), before, 'world parts unchanged');
  assert.ok(Object.isFrozen(pose) && Object.isFrozen(pose.parts.leftArm));
  // The view-model arm is carried forward: its pitch is the hold pitch plus half the world swing.
  assert.ok(hands.leftArm.rotationRad[0] < -1.25 && hands.leftArm.rotationRad[0] > -1.6);
  assert.throws(() => firstPersonHandParts({ leftArm: pose.parts.leftArm }), TypeError);
});

test('Stage 17 K2: look-down layers hand over from chest to legs, stay within [0, 1] and are monotone', () => {
  const at0 = firstPersonLookDownLayers(0);
  assert.deepEqual([at0.upperAlpha, at0.legAlpha], [0, 0]);
  const early = firstPersonLookDownLayers(0.2);
  assert.ok(Math.abs(early.upperAlpha - 0.2) < 1e-12 && early.legAlpha === 0, 'chest appears alone before the legs');
  const full = firstPersonLookDownLayers(1);
  assert.deepEqual([full.upperAlpha, full.legAlpha], [0, 1], 'at full look-down the legs replace the chest');
  let previousLeg = -1;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const { upperAlpha, legAlpha } = firstPersonLookDownLayers(t);
    assert.ok(upperAlpha >= 0 && upperAlpha <= 1 && legAlpha >= 0 && legAlpha <= 1, `alpha range at ${t}`);
    assert.ok(upperAlpha <= t + 1e-12, 'chest weight never exceeds the look-down fraction');
    assert.ok(Math.abs(upperAlpha - t * (1 - legAlpha)) < 1e-12, 'chest fades as the legs arrive');
    assert.ok(legAlpha >= previousLeg, 'leg weight is monotone in look-down');
    previousLeg = legAlpha;
  }
  assert.throws(() => firstPersonLookDownLayers(Number.NaN), TypeError);
});

test('Stage 17 K2: draw plan shows hands always, body only when looking down with valid contact', () => {
  const forward = firstPersonDrawPlan({ lookDownFraction: 0, bodyContactKnown: true });
  assert.deepEqual([...forward.hands], [...FIRST_PERSON_RIG_PARTS]);
  assert.deepEqual(forward.upper, []);
  assert.deepEqual(forward.legs, []);
  assert.equal(forward.upperAlpha, 0);

  const midDown = firstPersonDrawPlan({ lookDownFraction: 0.5, bodyContactKnown: true });
  assert.deepEqual([...midDown.upper], [...FIRST_PERSON_LOOK_DOWN_UPPER_PARTS]);
  assert.ok(midDown.upperAlpha > 0 && midDown.upperAlpha < 1);
  assert.ok(midDown.legAlpha > 0 && midDown.legAlpha < 1);
  assert.deepEqual([...midDown.legs], [...FIRST_PERSON_LOWER_BODY_PARTS]);

  // Full look-down: the legs and boots are drawn and the chest has handed over (no opaque torso hiding them).
  const fullDown = firstPersonDrawPlan({ lookDownFraction: 1, bodyContactKnown: true });
  assert.deepEqual([...fullDown.upper], []);
  assert.equal(fullDown.upperAlpha, 0);
  assert.equal(fullDown.legAlpha, 1);
  assert.deepEqual([...fullDown.legs], [...FIRST_PERSON_LOWER_BODY_PARTS]);

  // No valid DTM contact: the body is never drawn from a stale or unknown anchor, but hands stay.
  const noContact = firstPersonDrawPlan({ lookDownFraction: 1, bodyContactKnown: false });
  assert.deepEqual([...noContact.hands], [...FIRST_PERSON_RIG_PARTS]);
  assert.deepEqual(noContact.upper, []);
  assert.deepEqual(noContact.legs, []);

  for (const plan of [forward, midDown, fullDown, noContact]) {
    for (const id of ['backpack', 'helmet', 'visor', 'leftSole', 'rightSole']) {
      assert.ok(![...plan.hands, ...plan.upper, ...plan.legs].includes(id), `${id} is never in the first-person plan`);
    }
  }
});

test('Stage 17 K2: the sun shadow caster keeps the complete body, including parts the camera never draws', () => {
  for (const id of ['torso', 'chestPack', 'backpack', 'helmet', 'visor', 'leftArm', 'rightGlove', 'leftLeg', 'rightBoot', 'leftWristRing']) {
    assert.ok(RIG_SHADOW_CASTER_PARTS.includes(id), `${id} casts a shadow`);
  }
  assert.equal(RIG_SHADOW_CASTER_PARTS.length, Object.keys(ASTRONAUT_RIG.parts).length);
});
