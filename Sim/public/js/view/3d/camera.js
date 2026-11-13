// WebGL2 camera math for the local Mars surface frame: X east, Y north, Z up.
// Kept dependency-free so the 3D view works offline alongside the current vanilla ES modules.

const MIN_PITCH_RAD = (5 * Math.PI) / 180;
const MAX_PITCH_RAD = (85 * Math.PI) / 180;

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

function lookAt(eye, target) {
  // Z is up in Marswalk's local surface frame.
  const zAxis = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const xAxis = normalize3(cross3([0, 0, 1], zAxis));
  const yAxis = cross3(zAxis, xAxis);
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
  camera.distanceM = Math.max(0.1, camera.distanceM * scale);
  return camera;
}

/** Returns the camera position in local X/Y metres and display Z. */
export function getCameraPosition(camera) {
  const horizontal = camera.distanceM * Math.cos(camera.pitchRad);
  return {
    xM: camera.targetXM + horizontal * Math.cos(camera.yawRad),
    yM: camera.targetYM + horizontal * Math.sin(camera.yawRad),
    zDisplay: camera.targetZDisplay + camera.distanceM * Math.sin(camera.pitchRad),
  };
}

/** Builds a column-major WebGL clip transform from the camera state and canvas aspect ratio. */
export function getViewProjectionMatrix(camera, aspect) {
  finite(aspect, 'aspect');
  if (aspect <= 0) throw new RangeError('aspect must be greater than zero');
  const eye = getCameraPosition(camera);
  const view = lookAt(
    [eye.xM, eye.yM, eye.zDisplay],
    [camera.targetXM, camera.targetYM, camera.targetZDisplay],
  );
  return multiply4(perspective(camera.fovYRad, aspect, camera.nearM, camera.farM), view);
}
