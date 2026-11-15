// K2 follow-up: the first-person torso/legs must stand on the body anchor, not on the moving eye. The old
// anchor (camera.zDisplay - eyeHeightM) carried the eye's dip/bob offset into the body (about 5 cm drop on landing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstPersonCamera, setFirstPersonPose } from '../public/js/view/3d/camera.js';
import { firstPersonBodyOrigin } from '../public/js/view/3d/renderer.js';

const EYE_HEIGHT_M = 1.48;

test('body origin Z ignores the eye dip and the head bob', () => {
  for (const eyeOffsetM of [-0.12, -0.05, 0, 0.04]) {
    const cam = createFirstPersonCamera({ xM: 0, yM: 0, zDisplay: 0 });
    setFirstPersonPose(cam, { xM: 10, yM: 20, bodyZDisplay: -2500, eyeOffsetM, lateralOffsetM: 0.03 });
    const [x, y, z] = firstPersonBodyOrigin(cam);
    assert.equal(x, 10);
    assert.equal(y, 20);
    assert.equal(z, -2500, `body Z must not follow eyeOffsetM=${eyeOffsetM}`);
    // The eye itself still moves with the dip (presentation of the head).
    assert.ok(Math.abs(cam.zDisplay - (-2500 + EYE_HEIGHT_M + eyeOffsetM)) < 1e-9);
  }
});

test('body origin XY stays on the body anchor under lateral head sway', () => {
  const cam = createFirstPersonCamera({ xM: 0, yM: 0, zDisplay: 0, yawRad: 0.7 });
  setFirstPersonPose(cam, { xM: 3, yM: -4, bodyZDisplay: 1, lateralOffsetM: 0.08 });
  const [x, y] = firstPersonBodyOrigin(cam);
  assert.equal(x, 3);
  assert.equal(y, -4);
});

test('a camera that was never posed from a body anchor keeps the legacy eye-minus-height origin', () => {
  const cam = createFirstPersonCamera({ xM: 1, yM: 2, zDisplay: 5 });
  const [x, y, z] = firstPersonBodyOrigin(cam);
  assert.equal(x, 1);
  assert.equal(y, 2);
  assert.ok(Math.abs(z - (5 - EYE_HEIGHT_M)) < 1e-12);
});
