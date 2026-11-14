// WebGL2 camera math for the local Mars surface frame: X east, Y north, Z up.
// Kept dependency-free so the 3D view works offline alongside the current vanilla ES modules.

const MIN_PITCH_RAD = (5 * Math.PI) / 180;
const MAX_PITCH_RAD = (85 * Math.PI) / 180;
const FIRST_PERSON_MIN_PITCH_RAD = (-85 * Math.PI) / 180;
const FIRST_PERSON_MAX_PITCH_RAD = (85 * Math.PI) / 180;
const FIRST_PERSON_EYE_HEIGHT_M = 1.75;
const FIRST_PERSON_FOV_Y_RAD = (80 * Math.PI) / 180; // 80 deg vertical FOV for natural exploration vista

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!(length > 0)) throw new RangeError('Cannot normalize a zero-length vector');
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function perspective(fovYRad, aspect, nearM, farM) {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (nearM - farM);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (farM + nearM) * nf, -1,
    0, 0, 2 * farM * nearM * nf, 0,
  ]);
}

function lookAt(eye, target, rollRad = 0) {
  // Z is up in Marswalk's local surface frame.
  const zAxis = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  let xAxis = normalize3(cross3([0, 0, 1], zAxis));
  let yAxis = cross3(zAxis, xAxis);
  if (rollRad !== 0) {
    const cr = Math.cos(rollRad);
    const sr = Math.sin(rollRad);
    const rx = [
      xAxis[0] * cr + yAxis[0] * sr,
      xAxis[1] * cr + yAxis[1] * sr,
      xAxis[2] * cr + yAxis[2] * sr,
    ];
    const ry = [
      yAxis[0] * cr - xAxis[0] * sr,
      yAxis[1] * cr - xAxis[1] * sr,
      yAxis[2] * cr - xAxis[2] * sr,
    ];
    xAxis = rx;
    yAxis = ry;
  }
  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]),
    -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]),
    -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]),
    1,
  ]);
}

function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

/**
 * Creates mutable, per-view orbit-camera state. The target Z is a display-space coordinate,
 * never a Mars datum conversion. Input coordinates use local metres and display Z.
 */
export function createCamera({
  targetXM = 0,
  targetYM = 0,
  targetZDisplay = 0,
  distanceM = 1200,
  yawRad = -Math.PI / 2,
  pitchRad = Math.PI / 4,
  fovYRad = Math.PI / 3,
  nearM = 0.1,
  farM = 10000,
} = {}) {
  const camera = {
    targetXM: finite(targetXM, 'targetXM'),
    targetYM: finite(targetYM, 'targetYM'),
    targetZDisplay: finite(targetZDisplay, 'targetZDisplay'),
    distanceM: finite(distanceM, 'distanceM'),
    yawRad: finite(yawRad, 'yawRad'),
    pitchRad: finite(pitchRad, 'pitchRad'),
    fovYRad: finite(fovYRad, 'fovYRad'),
    nearM: finite(nearM, 'nearM'),
    farM: finite(farM, 'farM'),
  };
  if (camera.distanceM <= 0) throw new RangeError('distanceM must be greater than zero');
  if (!(camera.fovYRad > 0 && camera.fovYRad < Math.PI)) throw new RangeError('fovYRad must be between 0 and PI');
  if (!(camera.nearM > 0 && camera.farM > camera.nearM)) throw new RangeError('Camera clipping planes are invalid');
  camera.pitchRad = Math.min(MAX_PITCH_RAD, Math.max(MIN_PITCH_RAD, camera.pitchRad));
  return camera;
}

/** Creates an eye-level camera. Yaw 0 points east (+X), positive yaw turns north (+Y). */
export function createFirstPersonCamera({
  xM = 0,
  yM = 0,
  zDisplay = 0,
  yawRad = 0,
  pitchRad = 0,
  eyeHeightM = FIRST_PERSON_EYE_HEIGHT_M,
  fovYRad = FIRST_PERSON_FOV_Y_RAD,
  nearM = 0.05,
  farM = 3000,
} = {}) {
  const camera = {
    mode: 'first-person',
    xM: finite(xM, 'xM'),
    yM: finite(yM, 'yM'),
    zDisplay: finite(zDisplay, 'zDisplay'),
    yawRad: finite(yawRad, 'yawRad'),
    pitchRad: finite(pitchRad, 'pitchRad'),
    eyeHeightM: finite(eyeHeightM, 'eyeHeightM'),
    fovYRad: finite(fovYRad, 'fovYRad'),
    nearM: finite(nearM, 'nearM'),
    farM: finite(farM, 'farM'),
    dynamicPitchOffsetRad: 0,
    dynamicRollOffsetRad: 0,
    dynamicEyeOffsetM: 0,
  };
  if (camera.eyeHeightM <= 0) throw new RangeError('eyeHeightM must be greater than zero');
  if (!(camera.fovYRad > 0 && camera.fovYRad < Math.PI)) throw new RangeError('fovYRad must be between 0 and PI');
  if (!(camera.nearM > 0 && camera.farM > camera.nearM)) throw new RangeError('Camera clipping planes are invalid');
  camera.pitchRad = Math.min(FIRST_PERSON_MAX_PITCH_RAD, Math.max(FIRST_PERSON_MIN_PITCH_RAD, camera.pitchRad));
  return camera;
}

/** Updates the eye-level camera pose from the simulated body position in display coordinates.
 * The body anchor already includes terrain vertical exaggeration. By default, eye height and motion
 * offsets remain presentation metres to match the 1:1 first-person rig. `verticalScale` is a legacy,
 * explicit opt-in for callers that need those offsets exaggerated; the active first-person view omits it.
 */
export function setFirstPersonPose(camera, {
  xM,
  yM,
  bodyZDisplay,
  verticalScale = 1,
  eyeOffsetM = 0,
  pitchOffsetRad = 0,
  rollOffsetRad = 0,
}) {
  if (camera.mode !== 'first-person') throw new TypeError('A first-person camera is required');
  camera.xM = finite(xM, 'xM');
  camera.yM = finite(yM, 'yM');
  const scale = finite(verticalScale, 'verticalScale');
  if (scale <= 0) throw new RangeError('verticalScale must be greater than zero');
  const eyeOffset = finite(eyeOffsetM ?? 0, 'eyeOffsetM');
  const pitchOffset = finite(pitchOffsetRad ?? 0, 'pitchOffsetRad');
  const rollOffset = finite(rollOffsetRad ?? 0, 'rollOffsetRad');
  camera.zDisplay = finite(bodyZDisplay, 'bodyZDisplay') + (camera.eyeHeightM + eyeOffset) * scale;
  camera.dynamicEyeOffsetM = eyeOffset;
  camera.dynamicPitchOffsetRad = pitchOffset;
  camera.dynamicRollOffsetRad = rollOffset;
  return camera;
}

/** Applies mouse deltas; positive horizontal movement turns east-facing yaw toward north. */
export function lookCamera(camera, deltaX, deltaY, sensitivity = 0.0025) {
  if (camera.mode !== 'first-person') throw new TypeError('A first-person camera is required');
  camera.yawRad = finite(camera.yawRad + finite(deltaX, 'deltaX') * finite(sensitivity, 'sensitivity'), 'yawRad');
  camera.pitchRad = Math.min(FIRST_PERSON_MAX_PITCH_RAD, Math.max(FIRST_PERSON_MIN_PITCH_RAD,
    camera.pitchRad - finite(deltaY, 'deltaY') * sensitivity));
  return camera;
}

/** Converts forward/back and strafe input to a normalized local-world movement vector. */
export function cameraRelativeMovement(yawRad, { up = false, down = false, left = false, right = false } = {}) {
  const forward = (up ? 1 : 0) - (down ? 1 : 0);
  const strafe = (right ? 1 : 0) - (left ? 1 : 0);
  if (!forward && !strafe) return { moveX: 0, moveY: 0 };
  const fx = Math.cos(finite(yawRad, 'yawRad'));
  const fy = Math.sin(yawRad);
  // Positive strafe follows camera-right: south when facing east, east when facing north.
  const rx = fy, ry = -fx;
  const x = fx * forward + rx * strafe;
  const y = fy * forward + ry * strafe;
  const length = Math.hypot(x, y);
  return { moveX: x / length, moveY: y / length };
}

/** Sets an explicit local-world target; zDisplay is presentation space, not source elevation zM. */
export function setCameraTarget(camera, { xM, yM, zDisplay }) {
  camera.targetXM = finite(xM, 'xM');
  camera.targetYM = finite(yM, 'yM');
  camera.targetZDisplay = finite(zDisplay, 'zDisplay');
  return camera;
}

/** Applies orbit deltas while keeping the view above the terrain plane. */
export function orbitCamera(camera, deltaYawRad, deltaPitchRad) {
  camera.yawRad += finite(deltaYawRad, 'deltaYawRad');
  camera.pitchRad = Math.min(MAX_PITCH_RAD, Math.max(MIN_PITCH_RAD, camera.pitchRad + finite(deltaPitchRad, 'deltaPitchRad')));
  return camera;
}

/** Multiplies camera distance by a positive factor (>1 moves farther away). */
export function zoomCamera(camera, factor) {
  const scale = finite(factor, 'factor');
  if (scale <= 0) throw new RangeError('factor must be greater than zero');
  if (camera.mode === 'first-person') {
    camera.fovYRad = Math.max(0.35, Math.min(1.5, camera.fovYRad * scale));
    return camera;
  }
  camera.distanceM = Math.max(0.1, camera.distanceM * scale);
  return camera;
}

/** Returns the camera position in local X/Y metres and display Z. */
export function getCameraPosition(camera) {
  if (camera.mode === 'first-person') return { xM: camera.xM, yM: camera.yM, zDisplay: camera.zDisplay };
  const horizontal = camera.distanceM * Math.cos(camera.pitchRad);
  return {
    xM: camera.targetXM + horizontal * Math.cos(camera.yawRad),
    yM: camera.targetYM + horizontal * Math.sin(camera.yawRad),
    zDisplay: camera.targetZDisplay + camera.distanceM * Math.sin(camera.pitchRad),
  };
}

/** Returns the first-person look-down amount from 0 (horizon) to 1 (full lower-body view). */
export function firstPersonLookDownFraction(camera, minLookDownPitchRad, fullLookDownPitchRad) {
  if (camera?.mode !== 'first-person') throw new TypeError('A first-person camera is required');
  const min = finite(minLookDownPitchRad, 'minLookDownPitchRad');
  const full = finite(fullLookDownPitchRad, 'fullLookDownPitchRad');
  if (min < 0 || full <= min) throw new RangeError('Look-down pitch thresholds are invalid');
  const effectivePitch = Math.min(FIRST_PERSON_MAX_PITCH_RAD,
    Math.max(FIRST_PERSON_MIN_PITCH_RAD, camera.pitchRad + (camera.dynamicPitchOffsetRad || 0)));
  return Math.max(0, Math.min(1, (-effectivePitch - min) / (full - min)));
}

/** Builds a column-major WebGL clip transform from the camera state and canvas aspect ratio. */
export function getViewProjectionMatrix(camera, aspect) {
  finite(aspect, 'aspect');
  if (aspect <= 0) throw new RangeError('aspect must be greater than zero');
  const eye = getCameraPosition(camera);
  if (camera.mode === 'first-person') {
    const effectivePitch = Math.min(
      FIRST_PERSON_MAX_PITCH_RAD,
      Math.max(FIRST_PERSON_MIN_PITCH_RAD, camera.pitchRad + (camera.dynamicPitchOffsetRad || 0))
    );
    const cosPitch = Math.cos(effectivePitch);
    const target = [
      eye.xM + Math.cos(camera.yawRad) * cosPitch,
      eye.yM + Math.sin(camera.yawRad) * cosPitch,
      eye.zDisplay + Math.sin(effectivePitch),
    ];
    return multiply4(
      perspective(camera.fovYRad, aspect, camera.nearM, camera.farM),
      viewFromEye(eye, target, camera.dynamicRollOffsetRad || 0),
    );
  }
  const view = lookAt(
    [eye.xM, eye.yM, eye.zDisplay],
    [camera.targetXM, camera.targetYM, camera.targetZDisplay],
  );
  return multiply4(perspective(camera.fovYRad, aspect, camera.nearM, camera.farM), view);
}

function viewFromEye(eye, target, rollRad = 0) {
  return lookAt([eye.xM, eye.yM, eye.zDisplay], target, rollRad);
}
