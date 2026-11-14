// Runtime decision: use native WebGL2. The existing app is dependency-free vanilla ES modules,
// runs locally/offline, and already passes typed-array render assets between layers. WebGL2 can
// upload those arrays directly and supports 32-bit element indices without adding a package or CDN.
// This keeps deployment simple; the tradeoff is that shaders and GPU resource lifecycle live here.

import { firstPersonLookDownFraction, getCameraPosition, getViewProjectionMatrix } from './camera.js';
import { ASTRONAUT_RIG, FIRST_PERSON_LOWER_BODY_PARTS, FIRST_PERSON_RIG_PARTS, poseAstronautRig } from './astronaut-rig.js';

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
in float aAlpha;
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
out vec3 vNormal;
out vec3 vWorldPos;
out vec3 vColor;
out float vAlpha;
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
  vNormal = normalize(rotatedNormal);
  vWorldPos = worldPosition;
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uViewProjection * vec4(worldPosition, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorldPos;
in vec3 vColor;
in float vAlpha;
uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform vec3 uCameraEye;
uniform vec2 uElevBounds;
uniform float uTerrainExaggeration;
uniform int uRenderPass;
uniform float uAlpha;
uniform sampler2D uOrthoTexFine;
uniform sampler2D uOrthoTexCoarse;
uniform vec4 uOrthoUvFine;
uniform vec4 uOrthoUvCoarse;
uniform int uOrthoMode;
uniform int uHasOrthoFine;
uniform int uHasOrthoCoarse;
out vec4 outColor;

void main() {
  vec3 lightDir = normalize(uLightDirection);
  vec3 toCamera = uCameraEye - vWorldPos;
  float dist = length(toCamera);
  vec3 viewDir = dist > 1e-4 ? toCamera / dist : vec3(0.0, 0.0, 1.0);
  vec3 horizonColor = vec3(0.78, 0.51, 0.36);

  if (uRenderPass == 3) {
    // Martian butterscotch dust sky dome & solar scattering
    vec3 rayDir = normalize(vWorldPos - uCameraEye);
    float z = clamp(rayDir.z, -0.25, 1.0);
    vec3 groundHaze = vec3(0.54, 0.32, 0.22);
    vec3 midSky = vec3(0.46, 0.27, 0.21);
    vec3 zenithSky = vec3(0.15, 0.10, 0.14);
    vec3 sky;
    if (z < 0.0) {
      sky = mix(horizonColor, groundHaze, clamp(-z * 4.0, 0.0, 1.0));
    } else {
      float h = pow(z, 0.52);
      sky = mix(horizonColor, midSky, clamp(h * 1.65, 0.0, 1.0));
      sky = mix(sky, zenithSky, smoothstep(0.28, 0.95, h));
    }
    float sunCos = max(dot(rayDir, lightDir), 0.0);
    float daylight = smoothstep(0.0, 0.08, lightDir.z);
    float glow = 0.07 * pow(sunCos, 16.0) + 0.10 * pow(sunCos, 120.0);
    // A representative 0.175° angular radius as seen from Mars.
    float sunDistance = length(rayDir - lightDir);
    float edge = max(fwidth(sunDistance), 0.0001);
    float disc = 1.0 - smoothstep(0.00305 - edge, 0.00305 + edge, sunDistance);
    sky += daylight * (vec3(1.0, 0.83, 0.66) * glow + vec3(0.65, 0.58, 0.46) * disc);
    outColor = vec4(sky, 1.0);
    return;
  }

  vec3 normal = normalize(vNormal);
  // Use the same horizon fade for direct sunlight on every scene pass.
  float daylight = smoothstep(0.0, 0.08, lightDir.z);
  float ndotl = max(dot(normal, lightDir), 0.0) * daylight;
  float hemi = 0.5 + 0.5 * normal.z;
  vec3 ambient = mix(vec3(0.24, 0.14, 0.11), vec3(0.42, 0.29, 0.23), hemi);
  vec3 halfVec = normalize(lightDir + viewDir);
  float ndoth = max(dot(normal, halfVec), 0.0);

  if (uRenderPass == 0) {
    // Jezero Crater terrain: hypsometric regolith + steep bedrock + sedimentary strata + dust fog
    float span = max(1.0, uElevBounds.y - uElevBounds.x);
    float elevFrac = clamp((vWorldPos.z - uElevBounds.x) / span, 0.0, 1.0);
    vec3 basinOchre = vec3(0.62, 0.35, 0.22);
    vec3 deltaRust = vec3(0.79, 0.45, 0.27);
    vec3 ridgeSand = vec3(0.90, 0.58, 0.36);
    vec3 regolith = elevFrac < 0.5
      ? mix(basinOchre, deltaRust, elevFrac * 2.0)
      : mix(deltaRust, ridgeSand, (elevFrac - 0.5) * 2.0);
    float slope = clamp((1.0 - normal.z) * 3.2, 0.0, 1.0);
    vec3 bedrock = vec3(0.38, 0.24, 0.19);
    regolith = mix(regolith, bedrock, smoothstep(0.18, 0.85, slope) * 0.65);
    float strata = 0.975 + 0.025 * sin(vWorldPos.z * 2.4);
    regolith *= strata;

    // HiRISE WMTS Orthomosaic overlay (Stage 39B)
    if (uOrthoMode > 0) {
      vec2 uvFine = vec2(vWorldPos.x * uOrthoUvFine.x + uOrthoUvFine.y, vWorldPos.y * uOrthoUvFine.z + uOrthoUvFine.w);
      vec2 uvCoarse = vec2(vWorldPos.x * uOrthoUvCoarse.x + uOrthoUvCoarse.y, vWorldPos.y * uOrthoUvCoarse.z + uOrthoUvCoarse.w);
      bool inFine = uvFine.x >= 0.0 && uvFine.x <= 1.0 && uvFine.y >= 0.0 && uvFine.y <= 1.0;
      bool inCoarse = uvCoarse.x >= 0.0 && uvCoarse.x <= 1.0 && uvCoarse.y >= 0.0 && uvCoarse.y <= 1.0;
      vec4 orthoTexel = vec4(0.0);
      bool hasSample = false;

      if (uHasOrthoFine == 1 && inFine) {
        vec4 fTex = texture(uOrthoTexFine, uvFine);
        if (fTex.a > 0.5) {
          orthoTexel = fTex;
          hasSample = true;
        }
      }
      if (!hasSample && uHasOrthoCoarse == 1 && inCoarse) {
        vec4 cTex = texture(uOrthoTexCoarse, uvCoarse);
        if (cTex.a > 0.5) {
          orthoTexel = cTex;
          hasSample = true;
        }
      }

      if (hasSample) {
        float orthoLum = orthoTexel.r;
        if (uOrthoMode == 1) {
          // Hybrid: modulate base regolith with contrast-rich detail multiplier
          float detailMult = mix(0.45, 1.45, orthoLum);
          regolith = regolith * detailMult;
        } else if (uOrthoMode == 2) {
          // Pure HiRISE grayscale albedo
          regolith = vec3(orthoLum);
        }
      }
    }

    // Terrain positions are pre-scaled, so these normals still contain the
    // visual exaggeration. Restore source slopes before calculating sunlight.
    vec3 terrainNormal = normalize(vec3(normal.xy, normal.z * uTerrainExaggeration));
    float direct = max(dot(terrainNormal, lightDir), 0.0) * daylight;
    vec3 diffuseSky = vec3(0.39, 0.35, 0.33);
    vec3 lit = regolith * vColor * (diffuseSky + vec3(0.64, 0.60, 0.55) * direct);
    float fogFactor = clamp(1.0 - exp(-dist * 0.00045), 0.0, 0.82);
    outColor = vec4(mix(lit, horizonColor, fogFactor), 1.0);
    return;
  }

  if (uRenderPass == 1) {
    // 3D Waypoint beacons & route corridor guides
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5) * 0.32;
    float spec = pow(ndoth, 36.0) * 0.28 * daylight;
    vec3 lit = uBaseColor * vColor * (0.38 + 0.68 * ndotl) + vec3(spec + rim);
    float fogFactor = clamp(1.0 - exp(-dist * 0.00035), 0.0, 0.65);
    outColor = vec4(mix(lit, horizonColor, fogFactor), uAlpha * vAlpha);
    return;
  }

  // Pass 2: Astronaut EVA suit & first-person view-model arms/gloves/chestPack
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0) * 0.22;
  float spec = pow(ndoth, 32.0) * 0.22 * daylight;
  vec3 suitLit = uBaseColor * vColor * (ambient * 0.85 + 0.78 * ndotl) + vec3(1.0, 0.90, 0.78) * (spec + rim);
  outColor = vec4(suitLit, uAlpha);
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

function assertMarkerMeshAsset(mesh) {
  if (!mesh || !(mesh.positions instanceof Float32Array) ||
      !(mesh.normals instanceof Float32Array) ||
      !(mesh.colorsRgb instanceof Float32Array) ||
      !(mesh.indices instanceof Uint32Array)) {
    throw new TypeError('markerMesh must provide Float32Array positions/normals/colorsRgb and Uint32Array indices');
  }
  if (mesh.positions.length % 3 !== 0) throw new RangeError('markerMesh.positions must contain XYZ triples');
  if (mesh.normals.length !== mesh.positions.length) throw new RangeError('markerMesh.normals must align with positions');
  if (mesh.colorsRgb.length !== mesh.positions.length) throw new RangeError('markerMesh.colorsRgb must align with positions');
  if (mesh.indices.length % 3 !== 0) throw new RangeError('markerMesh.indices must contain triangle triples');
  if (!mesh.bounds || !mesh.metadata) {
    throw new TypeError('markerMesh must include bounds and metadata');
  }
  const vertexCount = mesh.positions.length / 3;
  for (const index of mesh.indices) if (index >= vertexCount) throw new RangeError('markerMesh.indices contains an out-of-range vertex');
  const beaconRanges = mesh.metadata.beaconDrawRanges;
  if (beaconRanges !== undefined) {
    if (!Array.isArray(beaconRanges)) throw new TypeError('markerMesh.metadata.beaconDrawRanges must be an array');
    let previousEnd = 0;
    for (const range of beaconRanges) {
      const end = range?.indexStart + range?.indexCount;
      if (typeof range?.id !== 'string' || !Number.isFinite(range.localXM) || !Number.isFinite(range.localYM) ||
          !Number.isSafeInteger(range.indexStart) || !Number.isSafeInteger(range.indexCount) || range.indexStart < previousEnd ||
          range.indexCount <= 0 || range.indexCount % 3 !== 0 || end > mesh.indices.length) {
        throw new RangeError('markerMesh.metadata.beaconDrawRanges contains an invalid or overlapping beacon range');
      }
      previousEnd = end;
    }
  }
}

// Presentation-only clearance so the first-person camera does not render the beacon mast it starts inside.
export const FIRST_PERSON_BEACON_HIDE_RADIUS_M = 2.5;

/** Pure marker draw-plan helper; beacon ranges are index counts, camera position is local-world XY. */
export function getMarkerDrawPlan(markerMesh, camera) {
  const indexCount = markerMesh?.indices?.length ?? 0;
  if (indexCount <= 0) return { drawRanges: [], hiddenBeaconIds: [] };
  const fullRange = [{ indexStart: 0, indexCount }];
  if (camera?.mode !== 'first-person' || !Number.isFinite(camera.xM) || !Number.isFinite(camera.yM)) {
    return { drawRanges: fullRange, hiddenBeaconIds: [] };
  }

  const hidden = (markerMesh.metadata?.beaconDrawRanges ?? []).filter((beacon) =>
    Number.isFinite(beacon.localXM) && Number.isFinite(beacon.localYM) &&
    Math.hypot(camera.xM - beacon.localXM, camera.yM - beacon.localYM) <= FIRST_PERSON_BEACON_HIDE_RADIUS_M,
  ).sort((a, b) => a.indexStart - b.indexStart);
  if (hidden.length === 0) return { drawRanges: fullRange, hiddenBeaconIds: [] };

  const drawRanges = [];
  let cursor = 0;
  for (const beacon of hidden) {
    if (beacon.indexStart > cursor) drawRanges.push({ indexStart: cursor, indexCount: beacon.indexStart - cursor });
    cursor = Math.max(cursor, beacon.indexStart + beacon.indexCount);
  }
  if (cursor < indexCount) drawRanges.push({ indexStart: cursor, indexCount: indexCount - cursor });
  return { drawRanges, hiddenBeaconIds: hidden.map((beacon) => beacon.id) };
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

// Presentation-frame placement only; camera eye height and physical lower-body anchor remain 1.48 m.
const FIRST_PERSON_VIEW_MODEL_ROOT_BELOW_EYE_M = 1.05;
// Keep the presentation-only upper-body model in front of the near plane. Placing its cuboids
// around the eye anchor makes them straddle the camera and cover the central view at all pitches.
const FIRST_PERSON_VIEW_MODEL_FORWARD_M = 0.85;
const FIRST_PERSON_VIEW_MODEL_SCALE = 0.65;

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
    footprintAlpha: gl.getAttribLocation(program, 'aAlpha'),
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
    cameraEye: gl.getUniformLocation(program, 'uCameraEye'),
    elevBounds: gl.getUniformLocation(program, 'uElevBounds'),
    terrainExaggeration: gl.getUniformLocation(program, 'uTerrainExaggeration'),
    renderPass: gl.getUniformLocation(program, 'uRenderPass'),
    alpha: gl.getUniformLocation(program, 'uAlpha'),
    orthoTexFine: gl.getUniformLocation(program, 'uOrthoTexFine'),
    orthoTexCoarse: gl.getUniformLocation(program, 'uOrthoTexCoarse'),
    orthoUvFine: gl.getUniformLocation(program, 'uOrthoUvFine'),
    orthoUvCoarse: gl.getUniformLocation(program, 'uOrthoUvCoarse'),
    orthoMode: gl.getUniformLocation(program, 'uOrthoMode'),
    hasOrthoFine: gl.getUniformLocation(program, 'uHasOrthoFine'),
    hasOrthoCoarse: gl.getUniformLocation(program, 'uHasOrthoCoarse'),
  };
  if (locations.position < 0 || locations.normal < 0 || locations.color < 0 || locations.footprintAlpha < 0 || !locations.viewProjection || !locations.lightDirection ||
      !locations.objectOffset || !locations.baseColor || !locations.headingRad || !locations.verticalScale ||
      !locations.partSize || !locations.partCenter || !locations.partOffset || !locations.partRotationRad ||
      !locations.rootOffset || !locations.rootRotationRad || !locations.cameraEye || !locations.elevBounds || !locations.renderPass || !locations.alpha ||
      !locations.orthoTexFine || !locations.orthoTexCoarse || !locations.orthoUvFine || !locations.orthoUvCoarse || !locations.orthoMode || !locations.hasOrthoFine || !locations.hasOrthoCoarse) {
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
  let uploadedMarkerMesh = null;
  let disposed = false;
  let lastFrameDiagnostics = null;

  let orthoTexFine = null;
  let orthoTexCoarse = null;
  let orthoMode = 1; // 0 = hillshade, 1 = hybrid, 2 = ortho
  let hasOrthoFine = 0;
  let hasOrthoCoarse = 0;
  const orthoUvFine = new Float32Array(4);
  const orthoUvCoarse = new Float32Array(4);
  let currentOrthoAssets = null;

  function create1x1Texture(glInstance) {
    const tex = glInstance.createTexture();
    glInstance.bindTexture(glInstance.TEXTURE_2D, tex);
    glInstance.texImage2D(glInstance.TEXTURE_2D, 0, glInstance.RGBA, 1, 1, 0, glInstance.RGBA, glInstance.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_MIN_FILTER, glInstance.LINEAR);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_MAG_FILTER, glInstance.LINEAR);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_WRAP_S, glInstance.CLAMP_TO_EDGE);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_WRAP_T, glInstance.CLAMP_TO_EDGE);
    glInstance.bindTexture(glInstance.TEXTURE_2D, null);
    return tex;
  }
  const dummyTexture = create1x1Texture(gl);

  function uploadOrthoTexture(glInstance, existingTex, image) {
    const tex = existingTex || glInstance.createTexture();
    glInstance.bindTexture(glInstance.TEXTURE_2D, tex);
    glInstance.pixelStorei(glInstance.UNPACK_FLIP_Y_WEBGL, false);
    glInstance.pixelStorei(glInstance.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (image instanceof HTMLImageElement || image instanceof ImageBitmap || image instanceof HTMLCanvasElement) {
      glInstance.texImage2D(glInstance.TEXTURE_2D, 0, glInstance.RGBA, glInstance.RGBA, glInstance.UNSIGNED_BYTE, image);
    } else if (image && image.data && image.width && image.height) {
      glInstance.texImage2D(glInstance.TEXTURE_2D, 0, glInstance.RGBA, image.width, image.height, 0, glInstance.RGBA, glInstance.UNSIGNED_BYTE, image.data);
    }
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_MIN_FILTER, glInstance.LINEAR);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_MAG_FILTER, glInstance.LINEAR);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_WRAP_S, glInstance.CLAMP_TO_EDGE);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_WRAP_T, glInstance.CLAMP_TO_EDGE);
    glInstance.bindTexture(glInstance.TEXTURE_2D, null);
    return tex;
  }
  const astronaut = createAstronautBuffers(gl, locations);
  const geologyVao = gl.createVertexArray();
  const geologyPositionBuffer = gl.createBuffer();
  if (!geologyVao || !geologyPositionBuffer) throw new Error('WebGL2 geology boundary buffers unavailable');
  gl.bindVertexArray(geologyVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, geologyPositionBuffer);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  const footprintVao = gl.createVertexArray();
  const footprintPositionBuffer = gl.createBuffer();
  const footprintAlphaBuffer = gl.createBuffer();
  if (!footprintVao || !footprintPositionBuffer || !footprintAlphaBuffer) throw new Error('WebGL2 footprint buffers unavailable');
  gl.bindVertexArray(footprintVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, footprintPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 400 * 6 * 3 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, footprintAlphaBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 400 * 6 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(locations.footprintAlpha);
  gl.vertexAttribPointer(locations.footprintAlpha, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  let footprintPositions = new Float32Array(400 * 6 * 3);
  let footprintAlphas = new Float32Array(400 * 6);
  let footprintGpuCapacity = 400;
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

  function releaseMarkerMesh() {
    if (!uploadedMarkerMesh) return;
    gl.deleteVertexArray(uploadedMarkerMesh.vao);
    gl.deleteBuffer(uploadedMarkerMesh.positionBuffer);
    gl.deleteBuffer(uploadedMarkerMesh.normalBuffer);
    gl.deleteBuffer(uploadedMarkerMesh.colorBuffer);
    gl.deleteBuffer(uploadedMarkerMesh.indexBuffer);
    uploadedMarkerMesh = null;
  }

  function uploadMarkerMesh(mesh) {
    if (!mesh) {
      releaseMarkerMesh();
      return;
    }
    if (mesh === uploadedMarkerMesh?.source) return;
    assertMarkerMeshAsset(mesh);
    releaseMarkerMesh();

    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    const normalBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vao || !positionBuffer || !normalBuffer || !colorBuffer || !indexBuffer) {
      throw new Error('WebGL2 marker buffer allocation failed');
    }

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.normal);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colorsRgb, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.color);
    gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    uploadedMarkerMesh = {
      source: mesh,
      vao,
      positionBuffer,
      normalBuffer,
      colorBuffer,
      indexBuffer,
      indexCount: mesh.indices.length,
    };
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
    renderFrame({ snapshot, camera, terrainMesh, markerMesh = null, geologyLinePositions = null, archiveLinePositions = null, plannedRouteLinePositions = null, footprintTrail = null }) {
      const frameStartedAt = collectDiagnostics ? performance.now() : 0;
      if (disposed) throw new Error('Renderer has been disposed');
      if (!snapshot || !snapshot.astronaut || !Object.isFrozen(snapshot)) {
        throw new TypeError('A frozen WorldSnapshot is required');
      }
      if (!camera) throw new TypeError('A camera state is required');
      if (!(canvas.width > 0 && canvas.height > 0)) throw new Error('Call resize() before renderFrame()');
      uploadMesh(terrainMesh);

      const viewProjection = getViewProjectionMatrix(camera, canvas.width / canvas.height);
      const eye = getCameraPosition(camera);
      const minZDisplay = Number.isFinite(terrainMesh.bounds?.minZDisplay) ? terrainMesh.bounds.minZDisplay : -20;
      const maxZDisplay = Number.isFinite(terrainMesh.bounds?.maxZDisplay) ? terrainMesh.bounds.maxZDisplay : 20;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
      gl.uniform3fv(locations.lightDirection, light);
      gl.uniform3f(locations.cameraEye, eye.xM, eye.yM, eye.zDisplay);
      gl.uniform2f(locations.elevBounds, minZDisplay, maxZDisplay);
      gl.uniform1f(locations.terrainExaggeration, terrainMesh.displayConfig.verticalScale);

      // Pass 3: Procedural Martian Skybox Dome & Solar Mie Scattering
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.uniform1i(locations.renderPass, 3);
      gl.uniform3f(locations.objectOffset, eye.xM, eye.yM, eye.zDisplay);
      gl.uniform1f(locations.headingRad, 0);
      gl.uniform1f(locations.verticalScale, 1);
      gl.uniform3f(locations.partSize, 2000, 2000, 2000);
      gl.uniform3f(locations.partCenter, 0, 0, 0);
      gl.uniform3f(locations.partOffset, 0, 0, 0);
      gl.uniform3f(locations.partRotationRad, 0, 0, 0);
      gl.uniform3f(locations.rootOffset, 0, 0, 0);
      gl.uniform3f(locations.rootRotationRad, 0, 0, 0);
      gl.uniform3f(locations.baseColor, 1, 1, 1);
      gl.disableVertexAttribArray(locations.color);
      gl.vertexAttrib3f(locations.color, 1, 1, 1);
      gl.bindVertexArray(astronaut.vao);
      gl.drawElements(gl.TRIANGLES, astronaut.indexCount, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);

      // Pass 0: Jezero Crater Terrain Mesh
      gl.uniform1i(locations.renderPass, 0);
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

      // HiRISE Orthomosaic texture bindings & uniforms (Stage 39B)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hasOrthoFine && orthoTexFine ? orthoTexFine : dummyTexture);
      gl.uniform1i(locations.orthoTexFine, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, hasOrthoCoarse && orthoTexCoarse ? orthoTexCoarse : dummyTexture);
      gl.uniform1i(locations.orthoTexCoarse, 1);

      gl.uniform4fv(locations.orthoUvFine, orthoUvFine);
      gl.uniform4fv(locations.orthoUvCoarse, orthoUvCoarse);
      gl.uniform1i(locations.orthoMode, orthoMode);
      gl.uniform1i(locations.hasOrthoFine, hasOrthoFine);
      gl.uniform1i(locations.hasOrthoCoarse, hasOrthoCoarse);

      gl.bindVertexArray(uploadedMesh.vao);
      gl.drawElements(gl.TRIANGLES, uploadedMesh.indexCount, gl.UNSIGNED_INT, 0);

      // Pass 1: 3D Waypoint Beacons and Route Guides (if supplied)
      let markersDrawn = false;
      let markerDrawPlan = { drawRanges: [], hiddenBeaconIds: [] };
      let markerIndexCountDrawn = 0;
      if (markerMesh) {
        uploadMarkerMesh(markerMesh);
      }
      if (uploadedMarkerMesh && uploadedMarkerMesh.indexCount > 0) {
        gl.uniform1i(locations.renderPass, 1);
        gl.uniform1f(locations.alpha, 1);
        gl.uniform3f(locations.objectOffset, 0, 0, 0);
        gl.uniform1f(locations.headingRad, 0);
        gl.uniform1f(locations.verticalScale, 1);
        gl.uniform3f(locations.partSize, 1, 1, 1);
        gl.uniform3f(locations.partCenter, 0, 0, 0);
        gl.uniform3f(locations.partOffset, 0, 0, 0);
        gl.uniform3f(locations.partRotationRad, 0, 0, 0);
        gl.uniform3f(locations.rootOffset, 0, 0, 0);
        gl.uniform3f(locations.rootRotationRad, 0, 0, 0);
        gl.uniform3f(locations.baseColor, 1, 1, 1);
        gl.disableVertexAttribArray(locations.footprintAlpha);
        gl.vertexAttrib1f(locations.footprintAlpha, 1);
        gl.bindVertexArray(uploadedMarkerMesh.vao);
        markerDrawPlan = getMarkerDrawPlan(uploadedMarkerMesh.source, camera);
        for (const range of markerDrawPlan.drawRanges) {
          gl.drawElements(
            gl.TRIANGLES,
            range.indexCount,
            gl.UNSIGNED_INT,
            range.indexStart * Uint32Array.BYTES_PER_ELEMENT,
          );
          markerIndexCountDrawn += range.indexCount;
        }
        gl.bindVertexArray(null);
        markersDrawn = markerIndexCountDrawn > 0;
      }

      function drawSurfaceLines(positions, red, green, blue, baseGreen = 1, baseBlue = 1, lineWidth = 2) {
        if (!(positions instanceof Float32Array) || positions.length < 6) return;
        gl.uniform1i(locations.renderPass, 1);
        gl.uniform1f(locations.alpha, 1);
        gl.uniform3f(locations.objectOffset, 0, 0, 0);
        gl.uniform1f(locations.headingRad, 0);
        gl.uniform1f(locations.verticalScale, 1);
        gl.uniform3f(locations.baseColor, 1, baseGreen, baseBlue);
        gl.bindVertexArray(geologyVao);
        gl.disableVertexAttribArray(locations.footprintAlpha);
        gl.vertexAttrib1f(locations.footprintAlpha, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, geologyPositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.disableVertexAttribArray(locations.normal);
        gl.vertexAttrib3f(locations.normal, 0, 0, 1);
        gl.disableVertexAttribArray(locations.color);
        gl.vertexAttrib3f(locations.color, red, green, blue);
        gl.lineWidth(lineWidth);
        gl.drawArrays(gl.LINES, 0, positions.length / 3);
        gl.bindVertexArray(null);
      }
      drawSurfaceLines(geologyLinePositions, 1, 0.82, 0.22, 0.84, 0.24, 2);
      drawSurfaceLines(archiveLinePositions, 0.81, 0.67, 1, 1, 1, 2);
      drawSurfaceLines(plannedRouteLinePositions, 0.12, 0.92, 0.78, 0.96, 1, 3);

      let footprintCountDrawn = 0;
      const footprintCount = Number.isInteger(footprintTrail?.count) ? footprintTrail.count : 0;
      const footprintQuads = footprintTrail?.quads;
      const footprintInstances = footprintTrail?.instances;
      if (footprintCount > 0 && footprintQuads instanceof Float32Array && footprintInstances instanceof Float32Array &&
          footprintQuads.length === footprintCount * 12 && footprintInstances.length === footprintCount * 10) {
        const vertexCount = footprintCount * 6;
        if (footprintPositions.length < vertexCount * 3) footprintPositions = new Float32Array(vertexCount * 3);
        if (footprintAlphas.length < vertexCount) footprintAlphas = new Float32Array(vertexCount);
        if (footprintCount > footprintGpuCapacity) {
          footprintGpuCapacity = Math.max(footprintCount, Math.ceil(footprintGpuCapacity * 1.5));
          gl.bindBuffer(gl.ARRAY_BUFFER, footprintPositionBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, footprintGpuCapacity * 6 * 3 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, footprintAlphaBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, footprintGpuCapacity * 6 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
        }
        const { referenceElevationM: footprintReferenceM, verticalScale: footprintVerticalScale } = terrainMesh.displayConfig;
        const corners = [0, 1, 2, 0, 2, 3];
        for (let i = 0; i < footprintCount; i++) {
          const sourceOffset = i * 12;
          const alpha = Math.max(0, Math.min(1, footprintInstances[i * 10 + 5]));
          for (let vertex = 0; vertex < 6; vertex++) {
            const source = sourceOffset + corners[vertex] * 3;
            const target = (i * 6 + vertex) * 3;
            footprintPositions[target] = footprintQuads[source];
            footprintPositions[target + 1] = footprintQuads[source + 1];
            footprintPositions[target + 2] = (footprintQuads[source + 2] - footprintReferenceM) * footprintVerticalScale;
            footprintAlphas[i * 6 + vertex] = alpha;
          }
        }
        gl.uniform1i(locations.renderPass, 1);
        gl.uniform1f(locations.alpha, 0.9);
        gl.uniform3f(locations.objectOffset, 0, 0, 0);
        gl.uniform1f(locations.headingRad, 0);
        gl.uniform1f(locations.verticalScale, 1);
        gl.uniform3f(locations.baseColor, 1, 1, 1);
        gl.disableVertexAttribArray(locations.normal);
        gl.vertexAttrib3f(locations.normal, 0, 0, 1);
        gl.disableVertexAttribArray(locations.color);
        gl.vertexAttrib3f(locations.color, 0.34, 0.25, 0.20);
        gl.bindVertexArray(footprintVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, footprintPositionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, footprintPositions.subarray(0, vertexCount * 3));
        gl.bindBuffer(gl.ARRAY_BUFFER, footprintAlphaBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, footprintAlphas.subarray(0, vertexCount));
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
        footprintCountDrawn = footprintCount;
      }

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
        // In both first-person and world modes, the astronaut suit maintains 1:1 human proportions.
        // Z-axis of body geometry is not stretched; ground contact altitude is positioned by objectOffset.
        const rigVerticalScale = 1;
        let objectOffset;
        if (firstPerson) {
          // This is a camera-relative visual overlay, not a second physical body position. A forward
          // offset keeps the suit cuboids out of the near plane while their eye-relative Z leaves them
          // in the lower frame. The world rig and look-down legs retain their physical anchors.
          objectOffset = [
            camera.xM + Math.cos(camera.yawRad) * FIRST_PERSON_VIEW_MODEL_FORWARD_M,
            camera.yM + Math.sin(camera.yawRad) * FIRST_PERSON_VIEW_MODEL_FORWARD_M,
            camera.zDisplay - FIRST_PERSON_VIEW_MODEL_ROOT_BELOW_EYE_M * rigVerticalScale,
          ];
        } else {
          objectOffset = [player.xM, player.yM, (player.bodyWorldZM - referenceElevationM) * verticalScale];
        }
        // The view-model terms are additive presentation motion for the upper body only.
        // Keep the world rig and the first-person legs anchored to the unmodified pose.
        const upperBodyPose = firstPerson ? {
          rootOffset: rigPose.rootOffset.map((value, i) => value + rigPose.viewModel.offset[i]),
          rootRotationRad: rigPose.rootRotationRad.map((value, i) => value + rigPose.viewModel.rotationRad[i]),
        } : rigPose;
        const partIds = firstPerson ? FIRST_PERSON_RIG_PARTS : Object.keys(ASTRONAUT_RIG.parts);
        gl.uniform1i(locations.renderPass, 2);
        gl.uniform3fv(locations.objectOffset, objectOffset);
        gl.uniform1f(locations.headingRad, headingRad);
        gl.uniform1f(locations.verticalScale, rigVerticalScale);
        gl.uniform3f(locations.baseColor, 1, 1, 1);
        gl.bindVertexArray(astronaut.vao);
        gl.disableVertexAttribArray(locations.color);
        if (firstPerson) gl.disable(gl.DEPTH_TEST); // Deliberate lower-frame suit overlay; terrain cannot hide it.
        gl.uniform1f(locations.alpha, 1);
        for (const id of partIds) {
          const part = ASTRONAUT_RIG.parts[id];
          const partPose = rigPose.parts[id];
          const presentationScale = firstPerson ? FIRST_PERSON_VIEW_MODEL_SCALE : 1;
          const presentedPart = firstPerson ? {
            ...part,
            size: part.size.map((value) => value * presentationScale),
            center: part.center.map((value) => value * presentationScale),
          } : part;
          const presentedPartPose = firstPerson ? {
            ...partPose, offset: partPose.offset.map((value) => value * presentationScale),
          } : partPose;
          const presentedRootPose = firstPerson ? {
            ...upperBodyPose, rootOffset: upperBodyPose.rootOffset.map((value) => value * presentationScale),
          } : upperBodyPose;
          gl.uniform3fv(locations.partSize, presentedPart.size);
          gl.uniform3fv(locations.partCenter, presentedPart.center);
          gl.uniform3fv(locations.partOffset, presentedPartPose.offset);
          gl.uniform3fv(locations.partRotationRad, partPose.rotationRad);
          gl.uniform3fv(locations.rootOffset, presentedRootPose.rootOffset);
          gl.uniform3fv(locations.rootRotationRad, presentedRootPose.rootRotationRad);
          gl.vertexAttrib3fv(locations.color, part.colorRgb);
          gl.drawElements(gl.TRIANGLES, astronaut.indexCount, gl.UNSIGNED_SHORT, 0);
          rigPartsDrawn.push(id);
          const worldCenter = rigPartWorldCenter(presentedPart, presentedPartPose, presentedRootPose, objectOffset, headingRad, rigVerticalScale);
          if (pointInClip(worldCenter, viewProjection)) firstPersonVisibleParts.push(id);
        }
        if (firstPerson) {
          gl.enable(gl.DEPTH_TEST);
          const lowerBody = ASTRONAUT_RIG.metadata.firstPersonLowerBody;
          const lookDown = firstPersonLookDownFraction(camera, lowerBody.minLookDownPitchRad, lowerBody.fullLookDownPitchRad);
          // Boots require current valid DTM contact; a retained airborne anchor is never treated as ground.
          if (elevationKnown && lookDown > 0) {
            const lowerBodyOffset = [objectOffset[0], objectOffset[1], camera.zDisplay - camera.eyeHeightM];
            gl.uniform3fv(locations.objectOffset, lowerBodyOffset);
            gl.uniform1f(locations.alpha, lookDown);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            for (const id of FIRST_PERSON_LOWER_BODY_PARTS) {
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
              const worldCenter = rigPartWorldCenter(part, partPose, rigPose, lowerBodyOffset, headingRad, rigVerticalScale);
              if (pointInClip(worldCenter, viewProjection)) firstPersonVisibleParts.push(id);
            }
            gl.disable(gl.BLEND);
          }
          gl.uniform1f(locations.alpha, 1);
        }
        firstPersonViewModelDrawn = firstPerson && rigPartsDrawn.length > 0;
        avatarDrawn = !firstPerson && rigPartsDrawn.length > 0;
      }
      gl.bindVertexArray(null);
      if (collectDiagnostics) {
        lastFrameDiagnostics = {
          frameRenderMs: performance.now() - frameStartedAt,
          terrainTriangles: uploadedMesh.indexCount / 3,
          footprintCount: footprintCountDrawn,
          footprintVertexCount: footprintCountDrawn * 6,
          plannedRouteLineVertexCount: plannedRouteLinePositions instanceof Float32Array ? plannedRouteLinePositions.length / 3 : 0,
          markersDrawn,
          markerTriangles: uploadedMarkerMesh ? uploadedMarkerMesh.indexCount / 3 : 0,
          markerIndexCountDrawn,
          hiddenBeaconIds: markerDrawPlan.hiddenBeaconIds,
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
          orthoMode: orthoMode === 2 ? 'ortho' : (orthoMode === 1 ? 'hybrid' : 'hillshade'),
          orthoFineLoaded: Boolean(hasOrthoFine),
          orthoCoarseLoaded: Boolean(hasOrthoCoarse),
        };
      }
    },

    /**
     * Updates or binds the multi-tier HiRISE orthomosaic assets.
     * @param {Object|null} orthoAssets - { mode, fine: { layer, image }, coarse: { layer, image } }
     */
    setOrthoOverlay(orthoAssets) {
      if (disposed) return;
      currentOrthoAssets = orthoAssets ?? null;
      if (!orthoAssets) {
        hasOrthoFine = 0;
        hasOrthoCoarse = 0;
        return;
      }
      const modeStr = orthoAssets.mode ?? 'hybrid';
      orthoMode = modeStr === 'ortho' ? 2 : (modeStr === 'hybrid' ? 1 : 0);

      const fine = orthoAssets.fine;
      if (fine?.image) {
        orthoTexFine = uploadOrthoTexture(gl, orthoTexFine, fine.image);
        hasOrthoFine = 1;
        const uvT = fine.layer?.uvTransformVec4 || fine.uvTransformVec4;
        if (uvT && uvT.length === 4) {
          orthoUvFine.set(uvT);
        } else if (fine.layer?.uvMapping) {
          const m = fine.layer.uvMapping;
          orthoUvFine.set([m.uScale, m.uOffset, m.vScale, m.vOffset]);
        }
      } else {
        hasOrthoFine = 0;
      }

      const coarse = orthoAssets.coarse;
      if (coarse?.image) {
        orthoTexCoarse = uploadOrthoTexture(gl, orthoTexCoarse, coarse.image);
        hasOrthoCoarse = 1;
        const uvT = coarse.layer?.uvTransformVec4 || coarse.uvTransformVec4;
        if (uvT && uvT.length === 4) {
          orthoUvCoarse.set(uvT);
        } else if (coarse.layer?.uvMapping) {
          const m = coarse.layer.uvMapping;
          orthoUvCoarse.set([m.uScale, m.uOffset, m.vScale, m.vOffset]);
        }
      } else {
        hasOrthoCoarse = 0;
      }
    },

    /** Updates the orthomosaic blending mode without re-uploading textures. */
    setOrthoMode(mode) {
      if (currentOrthoAssets) currentOrthoAssets.mode = mode;
      orthoMode = mode === 'ortho' ? 2 : (mode === 'hybrid' ? 1 : 0);
    },

    /**
     * Explicitly updates and uploads the prepared terrain mesh asset.
     * Ensures GPU buffers and terrain exaggeration reflect the new mesh asset immediately.
     * @param {Object} newMesh
     */
    setTerrainMesh(newMesh) {
      if (disposed) return;
      assertMeshAsset(newMesh);
      uploadMesh(newMesh);
    },

    ...(collectDiagnostics ? { getDiagnostics: () => lastFrameDiagnostics ? { ...lastFrameDiagnostics } : null } : {}),

    dispose() {
      if (disposed) return;
      releaseMesh();
      releaseMarkerMesh();
      if (orthoTexFine) { gl.deleteTexture(orthoTexFine); orthoTexFine = null; }
      if (orthoTexCoarse) { gl.deleteTexture(orthoTexCoarse); orthoTexCoarse = null; }
      if (dummyTexture) { gl.deleteTexture(dummyTexture); }
      gl.deleteVertexArray(geologyVao);
      gl.deleteBuffer(geologyPositionBuffer);
      gl.deleteVertexArray(footprintVao);
      gl.deleteBuffer(footprintPositionBuffer);
      gl.deleteBuffer(footprintAlphaBuffer);
      gl.deleteVertexArray(astronaut.vao);
      gl.deleteBuffer(astronaut.positionBuffer);
      gl.deleteBuffer(astronaut.normalBuffer);
      gl.deleteBuffer(astronaut.indexBuffer);
      gl.deleteProgram(program);
      disposed = true;
    },
  };
}
