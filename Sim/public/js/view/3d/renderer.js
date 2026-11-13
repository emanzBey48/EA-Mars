// Runtime decision: use native WebGL2. The existing app is dependency-free vanilla ES modules,
// runs locally/offline, and already passes typed-array render assets between layers. WebGL2 can
// upload those arrays directly and supports 32-bit element indices without adding a package or CDN.
// This keeps deployment simple; the tradeoff is that shaders and GPU resource lifecycle live here.

import { getViewProjectionMatrix } from './camera.js';
import { ASTRONAUT_RIG, poseAstronautRig } from './astronaut-rig.js';

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
uniform mat4 uViewProjection;
uniform vec3 uLightDirection;
uniform vec3 uObjectOffset;
uniform vec3 uBaseColor;
uniform float uHeadingRad;
uniform float uVerticalScale;
uniform vec3 uPartSize;
uniform vec3 uPartCenter;
uniform vec3 uPartOffset;
uniform vec3 uPartRotationRad;
uniform vec3 uRootOffset;
uniform vec3 uRootRotationRad;
out float vLighting;
out vec3 vColor;
vec3 rotateEuler(vec3 p, vec3 r) {
  float cx = cos(r.x), sx = sin(r.x);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  float cy = cos(r.y), sy = sin(r.y);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  float cz = cos(r.z), sz = sin(r.z);
  return vec3(cz * p.x - sz * p.y, sz * p.x + cz * p.y, p.z);
}
void main() {
  float c = cos(uHeadingRad);
  float s = sin(uHeadingRad);
  vec3 partPosition = rotateEuler(aPosition * uPartSize, uPartRotationRad) + uPartCenter + uPartOffset;
  vec3 rootPosition = rotateEuler(partPosition + uRootOffset, uRootRotationRad);
  vec2 rotatedXY = vec2(c * rootPosition.x - s * rootPosition.y, s * rootPosition.x + c * rootPosition.y);
  vec3 worldPosition = vec3(rotatedXY, rootPosition.z * uVerticalScale) + uObjectOffset;
  vec3 localNormal = aNormal / uPartSize;
  localNormal = rotateEuler(localNormal, uPartRotationRad);
  localNormal = rotateEuler(localNormal, uRootRotationRad);
  vec3 rotatedNormal = vec3(c * localNormal.x - s * localNormal.y, s * localNormal.x + c * localNormal.y, localNormal.z);
  rotatedNormal.z /= uVerticalScale;
  vec3 normal = normalize(rotatedNormal);
  vLighting = 0.28 + 0.72 * max(dot(normal, normalize(uLightDirection)), 0.0);
  vColor = aColor;
  gl_Position = uViewProjection * vec4(worldPosition, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vLighting;
in vec3 vColor;
uniform vec3 uBaseColor;
out vec4 outColor;
void main() {
  outColor = vec4(uBaseColor * vColor * vLighting, 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL2 shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`WebGL2 shader compile failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL2 program allocation failed');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`WebGL2 program link failed: ${message}`);
  }
  return program;
}

function assertMeshAsset(mesh) {
  if (!mesh || !(mesh.positions instanceof Float32Array) || !(mesh.normals instanceof Float32Array) || !(mesh.indices instanceof Uint32Array)) {
    throw new TypeError('terrainMesh must provide Float32Array positions/normals and Uint32Array indices');
  }
  if (mesh.positions.length % 3 !== 0) throw new RangeError('terrainMesh.positions must contain XYZ triples');
  if (mesh.normals.length !== mesh.positions.length) throw new RangeError('terrainMesh.normals must align with positions');
  if (mesh.indices.length % 3 !== 0) throw new RangeError('terrainMesh.indices must contain triangle triples');
  if (!(mesh.sourceElevationsM instanceof Float32Array) || mesh.sourceElevationsM.length !== mesh.positions.length / 3) {
    throw new RangeError('terrainMesh.sourceElevationsM must align with vertices');
  }
  if (!mesh.bounds || !mesh.provenance || !mesh.displayConfig ||
      !Number.isFinite(mesh.displayConfig.referenceElevationM) ||
      !Number.isFinite(mesh.displayConfig.verticalScale) || mesh.displayConfig.verticalScale <= 0) {
    throw new TypeError('terrainMesh must include bounds, provenance, and a valid displayConfig');
  }
  const vertexCount = mesh.positions.length / 3;
  for (const index of mesh.indices) if (index >= vertexCount) throw new RangeError('terrainMesh.indices contains an out-of-range vertex');
}

function createAstronautBuffers(gl, locations) {
  const geometry = ASTRONAUT_RIG.geometry;
  const positions = new Float32Array(geometry.positions);
  const normals = new Float32Array(geometry.normals);
  const indices = new Uint16Array(geometry.indices);
  const vao = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vao || !positionBuffer || !normalBuffer || !indexBuffer) throw new Error('WebGL2 astronaut buffer allocation failed');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(locations.normal);
  gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return { vao, positionBuffer, normalBuffer, indexBuffer, indexCount: indices.length };
}

const FIRST_PERSON_RIG_PARTS = ['torso', 'leftArm', 'rightArm'];
const FIRST_PERSON_RIG_FORWARD_M = 1.6;
const FIRST_PERSON_RIG_ROOT_BELOW_EYE_M = 1.34;

function rotateEuler([x, y, z], [rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  [y, z] = [cx * y - sx * z, sx * y + cx * z];
  const cy = Math.cos(ry), sy = Math.sin(ry);
  [x, z] = [cy * x + sy * z, -sy * x + cy * z];
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [cz * x - sz * y, sz * x + cz * y, z];
}

function rigPartWorldCenter(part, partPose, pose, objectOffset, headingRad, verticalScale) {
  let point = part.center.map((value, i) => value + partPose.offset[i]);
  point = rotateEuler(point.map((value, i) => value + pose.rootOffset[i]), pose.rootRotationRad);
  const c = Math.cos(headingRad), s = Math.sin(headingRad);
  return [
    objectOffset[0] + c * point[0] - s * point[1],
    objectOffset[1] + s * point[0] + c * point[1],
    objectOffset[2] + point[2] * verticalScale,
  ];
}

function pointInClip(point, viewProjection) {
  const [x, y, z] = point;
  const cx = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
  const cy = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
  const cz = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
  const cw = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
  return cw > 0 && Math.abs(cx) <= cw && Math.abs(cy) <= cw && cz >= -cw && cz <= cw;
}

/**
 * Creates a WebGL2 terrain renderer with a snapshot-driven astronaut presentation mesh.
 * The prepared terrain asset owns all terrain vertices/indices; omitted no-data quads remain omitted.
 * This module never samples a layer or changes source zM.
 *
 * `renderFrame({ snapshot, camera, terrainMesh })` is the frame contract. Rig pose comes only from
 * immutable snapshot movement state; world Z comes from bodyWorldZM, while sampled zM remains the
 * current-contact validity signal. The first-person arms/torso are a view model, not another body.
 */
export function createTerrainRenderer(canvas, { clearColor = [0.055, 0.06, 0.075], lightDirection = [-0.45, -0.35, 1], collectDiagnostics = false } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas element is required');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is unavailable in this browser');

  const program = createProgram(gl);
  const locations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    color: gl.getAttribLocation(program, 'aColor'),
    viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
    lightDirection: gl.getUniformLocation(program, 'uLightDirection'),
    objectOffset: gl.getUniformLocation(program, 'uObjectOffset'),
    baseColor: gl.getUniformLocation(program, 'uBaseColor'),
    headingRad: gl.getUniformLocation(program, 'uHeadingRad'),
    verticalScale: gl.getUniformLocation(program, 'uVerticalScale'),
    partSize: gl.getUniformLocation(program, 'uPartSize'),
    partCenter: gl.getUniformLocation(program, 'uPartCenter'),
    partOffset: gl.getUniformLocation(program, 'uPartOffset'),
    partRotationRad: gl.getUniformLocation(program, 'uPartRotationRad'),
    rootOffset: gl.getUniformLocation(program, 'uRootOffset'),
    rootRotationRad: gl.getUniformLocation(program, 'uRootRotationRad'),
  };
  if (locations.position < 0 || locations.normal < 0 || locations.color < 0 || !locations.viewProjection || !locations.lightDirection ||
      !locations.objectOffset || !locations.baseColor || !locations.headingRad || !locations.verticalScale ||
      !locations.partSize || !locations.partCenter || !locations.partOffset || !locations.partRotationRad ||
      !locations.rootOffset || !locations.rootRotationRad) {
    gl.deleteProgram(program);
    throw new Error('WebGL2 shader attributes or uniforms were not linked');
  }

  const lightLength = Math.hypot(...lightDirection);
  if (!(lightLength > 0) || lightDirection.some((value) => !Number.isFinite(value))) throw new TypeError('lightDirection must be a finite non-zero vector');
  const light = lightDirection.map((value) => value / lightLength);
  if (clearColor.length !== 3 || clearColor.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new TypeError('clearColor must contain three normalized color channels');
  }

  let uploadedMesh = null;
  let disposed = false;
  let lastFrameDiagnostics = null;
  const astronaut = createAstronautBuffers(gl, locations);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);

  function releaseMesh() {
    if (!uploadedMesh) return;
    gl.deleteVertexArray(uploadedMesh.vao);
    gl.deleteBuffer(uploadedMesh.positionBuffer);
    gl.deleteBuffer(uploadedMesh.normalBuffer);
    gl.deleteBuffer(uploadedMesh.indexBuffer);
    uploadedMesh = null;
  }

  function uploadMesh(mesh) {
    if (mesh === uploadedMesh?.source) return;
    assertMeshAsset(mesh);
    releaseMesh();
    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    const normalBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vao || !positionBuffer || !normalBuffer || !indexBuffer) throw new Error('WebGL2 terrain buffer allocation failed');

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.normal);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    uploadedMesh = { source: mesh, vao, positionBuffer, normalBuffer, indexBuffer, indexCount: mesh.indices.length };
  }

  return {
    /** Sets the drawing buffer to CSS dimensions multiplied by device pixel ratio. */
    resize(width, height, pixelRatio = 1) {
      if (disposed) throw new Error('Renderer has been disposed');
      if (![width, height, pixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || pixelRatio <= 0) {
        throw new RangeError('width, height, and pixelRatio must be positive finite numbers');
      }
      const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    },

    /** Draws one immutable frame from snapshot, camera state, and a prepared CPU mesh asset. */
    renderFrame({ snapshot, camera, terrainMesh }) {
      const frameStartedAt = collectDiagnostics ? performance.now() : 0;
      if (disposed) throw new Error('Renderer has been disposed');
      if (!snapshot || !snapshot.astronaut || !Object.isFrozen(snapshot)) {
        throw new TypeError('A frozen WorldSnapshot is required');
      }
      if (!camera) throw new TypeError('A camera state is required');
      if (!(canvas.width > 0 && canvas.height > 0)) throw new Error('Call resize() before renderFrame()');
      uploadMesh(terrainMesh);

      const viewProjection = getViewProjectionMatrix(camera, canvas.width / canvas.height);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
      gl.uniform3fv(locations.lightDirection, light);
      gl.uniform3f(locations.objectOffset, 0, 0, 0);
      gl.uniform1f(locations.headingRad, 0);
      gl.uniform1f(locations.verticalScale, 1);
      gl.uniform3f(locations.partSize, 1, 1, 1);
      gl.uniform3f(locations.partCenter, 0, 0, 0);
      gl.uniform3f(locations.partOffset, 0, 0, 0);
      gl.uniform3f(locations.partRotationRad, 0, 0, 0);
      gl.uniform3f(locations.rootOffset, 0, 0, 0);
      gl.uniform3f(locations.rootRotationRad, 0, 0, 0);
      gl.uniform3f(locations.baseColor, 0.78, 0.43, 0.25);
      gl.disableVertexAttribArray(locations.color);
      gl.vertexAttrib3f(locations.color, 1, 1, 1);
      gl.bindVertexArray(uploadedMesh.vao);
      gl.drawElements(gl.TRIANGLES, uploadedMesh.indexCount, gl.UNSIGNED_INT, 0);

      const { astronaut: player } = snapshot;
      const { referenceElevationM, verticalScale } = terrainMesh.displayConfig;
      const elevationKnown = player.elevationStatus === 'ok' && Number.isFinite(player.zM);
      let avatarDrawn = false;
      let firstPersonViewModelDrawn = false;
      let rigPose = null;
      let rigPartsDrawn = [];
      let firstPersonVisibleParts = [];
      let rigPresentation = 'world';
      const movement = player.movement;
      const firstPerson = camera.mode === 'first-person';
      const hasPoseAnchor = Number.isFinite(player.bodyWorldZM);
      const canDrawRig = movement && hasPoseAnchor && (firstPerson || elevationKnown);
      if (canDrawRig) {
        rigPose = poseAstronautRig(movement);
        rigPresentation = firstPerson ? 'first-person-view-model' : 'world';
        const headingRad = (firstPerson && Number.isFinite(camera.yawRad)
          ? camera.yawRad
          : (Number.isFinite(player.headingRad) ? player.headingRad : 0)) + ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad;
        let objectOffset;
        if (firstPerson) {
          // Presentation-only view model: forward and slightly above the body-world anchor so
          // arms/torso enter the lower frame. It is not a second physical/world body position.
          const forwardX = Math.cos(camera.yawRad), forwardY = Math.sin(camera.yawRad);
          objectOffset = [
            camera.xM + forwardX * FIRST_PERSON_RIG_FORWARD_M,
            camera.yM + forwardY * FIRST_PERSON_RIG_FORWARD_M,
            camera.zDisplay - FIRST_PERSON_RIG_ROOT_BELOW_EYE_M * verticalScale,
          ];
        } else {
          objectOffset = [player.xM, player.yM, (player.bodyWorldZM - referenceElevationM) * verticalScale];
        }
        const partIds = firstPerson ? FIRST_PERSON_RIG_PARTS : Object.keys(ASTRONAUT_RIG.parts);
        gl.uniform3fv(locations.objectOffset, objectOffset);
        gl.uniform1f(locations.headingRad, headingRad);
        gl.uniform1f(locations.verticalScale, verticalScale);
        gl.uniform3f(locations.baseColor, 1, 1, 1);
        gl.bindVertexArray(astronaut.vao);
        gl.disableVertexAttribArray(locations.color);
        if (firstPerson) gl.disable(gl.DEPTH_TEST); // Deliberate lower-frame suit overlay; terrain cannot hide it.
        for (const id of partIds) {
          const part = ASTRONAUT_RIG.parts[id];
          const partPose = rigPose.parts[id];
          gl.uniform3fv(locations.partSize, part.size);
          gl.uniform3fv(locations.partCenter, part.center);
          gl.uniform3fv(locations.partOffset, partPose.offset);
          gl.uniform3fv(locations.partRotationRad, partPose.rotationRad);
          gl.uniform3fv(locations.rootOffset, rigPose.rootOffset);
          gl.uniform3fv(locations.rootRotationRad, rigPose.rootRotationRad);
          gl.vertexAttrib3fv(locations.color, part.colorRgb);
          gl.drawElements(gl.TRIANGLES, astronaut.indexCount, gl.UNSIGNED_SHORT, 0);
          rigPartsDrawn.push(id);
          const worldCenter = rigPartWorldCenter(part, partPose, rigPose, objectOffset, headingRad, verticalScale);
          if (pointInClip(worldCenter, viewProjection)) firstPersonVisibleParts.push(id);
        }
        if (firstPerson) gl.enable(gl.DEPTH_TEST);
        firstPersonViewModelDrawn = firstPerson && rigPartsDrawn.length > 0;
        avatarDrawn = !firstPerson && rigPartsDrawn.length > 0;
      }
      gl.bindVertexArray(null);
      if (collectDiagnostics) {
        lastFrameDiagnostics = {
          frameRenderMs: performance.now() - frameStartedAt,
          terrainTriangles: uploadedMesh.indexCount / 3,
          avatarDrawn,
          worldRigDrawn: avatarDrawn,
          firstPersonViewModelDrawn,
          rigPose: rigPose?.pose ?? null,
          rigPresentation,
          rigPartsDrawn,
          firstPersonVisibleParts: rigPresentation === 'first-person-view-model' ? firstPersonVisibleParts : [],
          rigGaitPhaseRad: rigPose?.gaitPhaseRad ?? null,
          rigGaitFrequencyHz: rigPose?.gaitFrequencyHz ?? null,
          rigHeadingRad: rigPose ? ((Number.isFinite(camera.yawRad) ? camera.yawRad : player.headingRad) + ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad) : null,
          surfaceContactStatus: movement?.groundContactStatus ?? null,
          sampledElevationKnown: elevationKnown,
        };
      }
    },

    ...(collectDiagnostics ? { getDiagnostics: () => lastFrameDiagnostics ? { ...lastFrameDiagnostics } : null } : {}),

    dispose() {
      if (disposed) return;
      releaseMesh();
      gl.deleteVertexArray(astronaut.vao);
      gl.deleteBuffer(astronaut.positionBuffer);
      gl.deleteBuffer(astronaut.normalBuffer);
      gl.deleteBuffer(astronaut.indexBuffer);
      gl.deleteProgram(program);
      disposed = true;
    },
  };
}
