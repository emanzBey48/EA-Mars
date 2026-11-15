// Runtime decision: use native WebGL2. The existing app is dependency-free vanilla ES modules,
// runs locally/offline, and already passes typed-array render assets between layers. WebGL2 can
// upload those arrays directly and supports 32-bit element indices without adding a package or CDN.
// This keeps deployment simple; the tradeoff is that shaders and GPU resource lifecycle live here.
//
// Lighting (Stage Visual A): every pass (sky, terrain, guides/lines, astronaut rig) shades in LINEAR light
// with the shared Mars sky/sun model from sky-model.js, is tone mapped (ACES fitted curve) and sRGB
// encoded exactly once at the end of the fragment shader. Terrain surface appearance comes from
// terrain-shading.js; the sun shadow map from shadow-map.js. All of this is presentation only: it never
// changes elevation, slope, no-data cells, routes or mesh geometry.

import { firstPersonLookDownFraction, getCameraPosition, getViewProjectionMatrix } from './camera.js';
import { ASTRONAUT_RIG, FIRST_PERSON_LOWER_BODY_PARTS, FIRST_PERSON_RIG_PARTS, createRigGeometryAtlas, poseAstronautRig, resolvePartMaterial } from './astronaut-rig.js';
import { MARS_LIGHTING_GLSL, MARS_SUN_ANGULAR_DIAMETER_ARCMIN, SKY_PARAMS, luminance, marsSunIrradiance } from './sky-model.js';
import { TERRAIN_SHADING_GLSL, TERRAIN_SHADING_PARAMS } from './terrain-shading.js';
import {
  SHADOW_QUALITY_NAMES, SHADOW_RECEIVER_GLSL, chooseShadowRadiusM, computeShadowLightSpace,
  resolveShadowQuality, shadowFocusXY,
} from './shadow-map.js';

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
in float aAlpha;
in vec2 aRouteUv;
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
out vec2 vRouteUv;
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
  vRouteUv = aRouteUv;
  gl_Position = uViewProjection * vec4(worldPosition, 1.0);
}`;

// Render passes: 0 terrain, 1 guides/lines/beacons (emissive), 2 astronaut rig (material-lit), 3 sky dome,
// 4 shadow depth only, 5 footprint decal (terrain-lit, no emissive).
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
in vec3 vNormal;
in vec3 vWorldPos;
in vec3 vColor;
in float vAlpha;
in vec2 vRouteUv;
uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform vec3 uCameraEye;
uniform vec2 uElevBounds;
uniform vec4 uTerrainBounds;
uniform float uTerrainExaggeration;
uniform int uRenderPass;
uniform float uAlpha;
uniform float uRouteTimeS;
uniform float uRoutePulseUM;
uniform sampler2D uOrthoTexFine;
uniform sampler2D uOrthoTexCoarse;
uniform vec4 uOrthoUvFine;
uniform vec4 uOrthoUvCoarse;
uniform int uOrthoMode;
uniform int uHasOrthoFine;
uniform int uHasOrthoCoarse;
uniform mat4 uLightVP;
uniform sampler2DShadow uShadowMap;
uniform vec4 uShadowParams;
uniform vec3 uShadowLightDir;
uniform int uShadowMode;
uniform float uReceiveShadow;
uniform vec3 uSkySunDir;
uniform vec3 uPartAlbedo; // rig pass: linear albedo of the current part (from part.material)
uniform vec2 uPartRoughMetal; // rig pass: x = roughness, y = metallic
out vec4 outColor;
${MARS_LIGHTING_GLSL}
${TERRAIN_SHADING_GLSL}
${SHADOW_RECEIVER_GLSL}

// Output transform shared by every pass, plus a +-0.5 LSB blue-noise-free dither against gradient banding.
vec4 finishColor(vec3 linearColor, float alpha) {
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  return vec4(encodeOutput(linearColor) + dither, alpha);
}

void main() {
  if (uRenderPass == 4) { outColor = vec4(0.0); return; }
  vec3 sunDir = normalize(uLightDirection);
  // Sky dome, sun disc and aerial haze live in DISPLAY space (rays are display vectors); the sun there is
  // normalize(x, y, z * verticalScale). Equal to sunDir at verticalScale 1.
  vec3 skySunDir = normalize(uSkySunDir);
  vec3 toCamera = uCameraEye - vWorldPos;
  float dist = length(toCamera);
  vec3 viewDir = dist > 1e-4 ? toCamera / dist : vec3(0.0, 0.0, 1.0);
  vec3 rayV = vWorldPos - uCameraEye;

  if (uRenderPass == 3) {
    // Procedural Mars sky dome: butterscotch gradient, forward-scattering halo, ~21' sun disc.
    vec3 rayDir = normalize(rayV);
    vec3 sky = marsSkyRadiance(rayDir, skySunDir);
    float angEdge = max(fwidth(length(rayDir - skySunDir)), 0.0001);
    sky += marsSunDiscRadiance(rayDir, skySunDir, angEdge);
    outColor = finishColor(sky, 1.0);
    return;
  }

  vec3 normal = normalize(vNormal);

  // Pass 6: planned-route emissive ribbon (pass 4 is the shadow depth pass and returns early above).
  if (uRenderPass == 6) {
    float flow = 0.5 + 0.5 * sin((vRouteUv.x - uRouteTimeS * 2.8) * 0.72);
    float pulseDelta = abs(vRouteUv.x - uRoutePulseUM);
    float pulse = exp(-pulseDelta * pulseDelta / 30.0);
    // vColor is an sRGB score colour; go through the shared linear -> ACES -> sRGB output so the ribbon matches the scene.
    vec3 routeBase = srgbToLinear(clamp(vColor, 0.0, 1.0));
    // Saturation boost (presentation): ACES + the warm haze washed the score colours out to pastel. Same hue ramp.
    float routeLuma = dot(routeBase, LUMA709);
    routeBase = max(mix(vec3(routeLuma), routeBase, 1.3), vec3(0.0));
    vec3 glow = routeBase * (0.36 + 0.26 * flow + 1.10 * pulse) * EMISSIVE_GAIN;
    outColor = finishColor(glow, 0.78 + 0.18 * pulse);
    return;
  }

  if (uRenderPass == 0) {
    // Terrain normals contain the visual vertical exaggeration; restore the physical normal for lighting/slope.
    vec3 nPhys = normalize(vec3(normal.xy, normal.z * uTerrainExaggeration));
    float tanSlope = sqrt(max(1.0 - nPhys.z * nPhys.z, 0.0)) / max(nPhys.z, 0.05);
    float slopeW = terrainSlopeWeight(tanSlope);

    float span = max(1.0, uElevBounds.y - uElevBounds.x);
    float elevFrac = clamp((vWorldPos.z - uElevBounds.x) / span, 0.0, 1.0);
    vec3 palette = mix(terrainPalette(elevFrac), TERRAIN_BEDROCK, slopeW * ${TERRAIN_SHADING_PARAMS.slopeBedrockMix.toFixed(4)});

    // HiRISE WMTS grayscale ortho: luminance from the ortho texel, chroma from the palette (soft footprint).
    float wf = 0.0, gF = 1.0, wc = 0.0, gC = 1.0;
    if (uOrthoMode > 0) {
      if (uHasOrthoFine == 1) {
        vec2 uvF = vec2(vWorldPos.x * uOrthoUvFine.x + uOrthoUvFine.y, vWorldPos.y * uOrthoUvFine.z + uOrthoUvFine.w);
        vec4 tF = texture(uOrthoTexFine, uvF);
        wf = orthoCoverage(uvF, tF.a);
        gF = orthoGain(tF.r);
      }
      if (uHasOrthoCoarse == 1) {
        vec2 uvC = vec2(vWorldPos.x * uOrthoUvCoarse.x + uOrthoUvCoarse.y, vWorldPos.y * uOrthoUvCoarse.z + uOrthoUvCoarse.w);
        vec4 tC = texture(uOrthoTexCoarse, uvC);
        wc = orthoCoverage(uvC, tC.a);
        gC = orthoGain(tC.r);
      }
    }
    float coverage = wf + (1.0 - wf) * wc;
    float gain = coverage > 0.0001 ? (wf * gF + (1.0 - wf) * wc * gC) / coverage : 1.0;
    vec3 albedo = terrainCombineAlbedo(palette, coverage, gain, uOrthoMode == 2);

    // Procedural micro detail (visual detail, not data): world-fixed, deterministic, faded with distance.
    vec2 microSlope = vec2(0.0);
    float microTone = 0.0;
    if (dist < ${(TERRAIN_SHADING_PARAMS.octaves[3].wavelengthM * TERRAIN_SHADING_PARAMS.fadeEndPerWavelength).toFixed(1)}) {
      terrainMicro(vWorldPos.xy, dist, 1.0 + ${TERRAIN_SHADING_PARAMS.slopeRoughnessGain.toFixed(4)} * slopeW, microSlope, microTone);
    }
    // Pebble/gravel scatter (visual detail, not data): kept weak where HiRISE ortho luminance exists.
    if (dist < ${TERRAIN_SHADING_PARAMS.pebbles[1].fadeEndM.toFixed(1)}) {
      vec2 pebSlope; float pebTone;
      terrainPebbles(vWorldPos.xy, dist, pebSlope, pebTone);
      microSlope += pebSlope;
      albedo *= 1.0 + pebTone * (1.0 - coverage * ${TERRAIN_SHADING_PARAMS.pebbleOrthoToneReduction.toFixed(4)});
    }
    albedo *= (1.0 + microTone * (1.0 - coverage * ${TERRAIN_SHADING_PARAMS.microToneOrthoReduction.toFixed(4)}));
    albedo *= 1.0 - ${TERRAIN_SHADING_PARAMS.slopeDarkening.toFixed(4)} * slopeW;

    vec3 nLit = terrainPerturbNormal(nPhys, microSlope);
    float ndotl = max(dot(nLit, sunDir), 0.0);
    float shadow = shadowFactor(vWorldPos, normal);
    vec3 direct = marsSunIrradiance(sunDir) * (ndotl * shadow);
    vec3 ambient = marsSkyAmbient(nLit, sunDir);
    vec3 lit = albedo * (direct + ambient);

    lit = applyAerialPerspective(lit, dist, rayV, skySunDir, HAZE_DENSITY, HAZE_MAX);
    if (uTerrainBounds.z > uTerrainBounds.x) {
      float edgeM = min(min(vWorldPos.x - uTerrainBounds.x, uTerrainBounds.z - vWorldPos.x),
                        min(vWorldPos.y - uTerrainBounds.y, uTerrainBounds.w - vWorldPos.y));
      lit = mix(lit, marsHazeColor(rayV, skySunDir), terrainMeshEdgeFade(edgeM, dist));
    }
    outColor = finishColor(lit, 1.0);
    return;
  }

  if (uRenderPass == 1) {
    // Waypoint beacons, route guides and surface lines: mostly emissive so they stay readable after tone mapping.
    vec3 base = srgbToLinear(clamp(uBaseColor * vColor, 0.0, 1.0));
    float ndotl = max(dot(normal, sunDir), 0.0);
    vec3 shaded = base * (marsSunIrradiance(sunDir) * ndotl + marsSkyAmbient(normal, sunDir));
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5) * 0.18;
    vec3 lit = base * (0.62 * EMISSIVE_GAIN) + 0.55 * shaded + vec3(rim) * base;
    lit = applyAerialPerspective(lit, dist, rayV, skySunDir, HAZE_DENSITY * 0.6, 0.45);
    outColor = finishColor(lit, uAlpha * vAlpha); // vAlpha: per-footprint fade (1.0 for beacons/lines)
    return;
  }

  if (uRenderPass == 5) {
    // Footprint decal (presentation, görsel iz): dark regolith lit like the terrain. No emissive term, so it
    // darkens in shadow and never glows; uAlpha * vAlpha gives the per-footprint fade.
    vec3 decal = srgbToLinear(clamp(uBaseColor * vColor, 0.0, 1.0));
    float ndotlD = max(dot(normal, sunDir), 0.0);
    float shadowD = shadowFactor(vWorldPos, normal);
    vec3 litD = decal * (marsSunIrradiance(sunDir) * (ndotlD * shadowD) + marsSkyAmbient(normal, sunDir));
    litD = applyAerialPerspective(litD, dist, rayV, skySunDir, HAZE_DENSITY, HAZE_MAX);
    outColor = finishColor(litD, uAlpha * vAlpha);
    return;
  }

  // Pass 2: astronaut EVA suit and first-person view-model. Material = linear albedo, roughness, metallic
  // (uniforms from part.material). Dielectric parts get a diffuse lobe plus a faint sun/sky specular;
  // metallic parts (visor, coupling rings) reflect the sky dome with their own albedo as F0.
  float roughness = clamp(uPartRoughMetal.x, 0.02, 1.0);
  float metallic = clamp(uPartRoughMetal.y, 0.0, 1.0);
  vec3 F0 = mix(vec3(RIG_F0), uPartAlbedo, metallic);
  vec3 diffuseAlbedo = uPartAlbedo * (1.0 - metallic);
  float ndotl = max(dot(normal, sunDir), 0.0);
  float shadow = shadowFactor(vWorldPos, normal);
  vec3 sunIrr = marsSunIrradiance(sunDir);
  vec3 ambient = rigSkyAmbient(marsSkyAmbient(normal, sunDir));
  vec3 halfVec = normalize(sunDir + viewDir);
  float ndoth = max(dot(normal, halfVec), 0.0);
  float lobeWidth = max(roughness * roughness, RIG_SPEC_WIDTH_FLOOR);
  float sunLobe = exp(-(1.0 - ndoth) / lobeWidth) * RIG_SPEC_PEAK;
  vec3 specSun = F0 * sunIrr * (ndotl * shadow * sunLobe);
  float ndotv = max(dot(normal, viewDir), 0.0);
  vec3 fresnel = F0 + (1.0 - F0) * pow(1.0 - ndotv, 5.0);
  float gloss = (1.0 - roughness) * (1.0 - roughness);
  vec3 envRefl = marsSkyRadiance(reflect(-viewDir, normal), sunDir);
  vec3 specEnv = fresnel * envRefl * (gloss * RIG_ENV_STRENGTH);
  vec3 lit = diffuseAlbedo * (sunIrr * (ndotl * shadow) + ambient) + specSun + specEnv;
  lit = applyAerialPerspective(lit, dist, rayV, skySunDir, HAZE_DENSITY, HAZE_MAX);
  outColor = finishColor(lit, uAlpha);
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
  const geometry = createRigGeometryAtlas();
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
  return { vao, positionBuffer, normalBuffer, indexBuffer, indexCount: indices.length, ranges: geometry.ranges };
}

// Draws one rig part from the shared geometry atlas (falls back to the unit box range).
function drawRigPart(gl, astronaut, part) {
  const range = astronaut.ranges[part.geometry] ?? astronaut.ranges.unitBox;
  gl.drawElements(gl.TRIANGLES, range.indexCount, gl.UNSIGNED_SHORT, range.indexStart * 2);
}

// Per-part material uniforms, resolved once from the frozen rig template (linear albedo, roughness, metallic).
const RIG_MATERIALS = Object.freeze(Object.fromEntries(
  Object.keys(ASTRONAUT_RIG.parts).map((id) => [id, Object.freeze(resolvePartMaterial(ASTRONAUT_RIG.parts[id]))]),
));
function setRigMaterialUniforms(gl, locations, id) {
  const material = RIG_MATERIALS[id];
  gl.uniform3fv(locations.partAlbedo, material.albedoLinear);
  gl.uniform2f(locations.partRoughMetal, material.roughness, material.metallic);
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
export function createTerrainRenderer(canvas, { clearColor = [0.055, 0.06, 0.075], lightDirection = [-0.45, -0.35, 1], collectDiagnostics = false, shadows = 'auto' } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas element is required');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is unavailable in this browser');

  const program = createProgram(gl);
  const uniform = (name) => gl.getUniformLocation(program, name);
  const locations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    color: gl.getAttribLocation(program, 'aColor'),
    footprintAlpha: gl.getAttribLocation(program, 'aAlpha'),
    routeUv: gl.getAttribLocation(program, 'aRouteUv'),
    viewProjection: uniform('uViewProjection'),
    lightDirection: uniform('uLightDirection'),
    objectOffset: uniform('uObjectOffset'),
    baseColor: uniform('uBaseColor'),
    headingRad: uniform('uHeadingRad'),
    verticalScale: uniform('uVerticalScale'),
    partSize: uniform('uPartSize'),
    partCenter: uniform('uPartCenter'),
    partOffset: uniform('uPartOffset'),
    partRotationRad: uniform('uPartRotationRad'),
    rootOffset: uniform('uRootOffset'),
    rootRotationRad: uniform('uRootRotationRad'),
    cameraEye: uniform('uCameraEye'),
    elevBounds: uniform('uElevBounds'),
    terrainBounds: uniform('uTerrainBounds'),
    terrainExaggeration: uniform('uTerrainExaggeration'),
    renderPass: uniform('uRenderPass'),
    alpha: uniform('uAlpha'),
    orthoTexFine: uniform('uOrthoTexFine'),
    orthoTexCoarse: uniform('uOrthoTexCoarse'),
    orthoUvFine: uniform('uOrthoUvFine'),
    orthoUvCoarse: uniform('uOrthoUvCoarse'),
    orthoMode: uniform('uOrthoMode'),
    hasOrthoFine: uniform('uHasOrthoFine'),
    hasOrthoCoarse: uniform('uHasOrthoCoarse'),
    lightVP: uniform('uLightVP'),
    shadowMap: uniform('uShadowMap'),
    shadowParams: uniform('uShadowParams'),
    shadowLightDir: uniform('uShadowLightDir'),
    skySunDir: uniform('uSkySunDir'),
    shadowMode: uniform('uShadowMode'),
    receiveShadow: uniform('uReceiveShadow'),
    partAlbedo: uniform('uPartAlbedo'),
    partRoughMetal: uniform('uPartRoughMetal'),
    routeTimeS: uniform('uRouteTimeS'),
    routePulseUM: uniform('uRoutePulseUM'),
  };
  if (locations.position < 0 || locations.normal < 0 || locations.color < 0 || locations.footprintAlpha < 0 || locations.routeUv < 0 || !locations.viewProjection || !locations.lightDirection ||
      !locations.objectOffset || !locations.baseColor || !locations.headingRad || !locations.verticalScale ||
      !locations.partSize || !locations.partCenter || !locations.partOffset || !locations.partRotationRad ||
      !locations.rootOffset || !locations.rootRotationRad || !locations.cameraEye || !locations.elevBounds || !locations.renderPass || !locations.alpha ||
      !locations.routeTimeS || !locations.routePulseUM ||
      !locations.orthoTexFine || !locations.orthoTexCoarse || !locations.orthoUvFine || !locations.orthoUvCoarse || !locations.orthoMode || !locations.hasOrthoFine || !locations.hasOrthoCoarse ||
      !locations.lightVP || !locations.shadowMap || !locations.shadowParams || !locations.shadowLightDir || !locations.shadowMode || !locations.receiveShadow || !locations.terrainBounds ||
      !locations.partAlbedo || !locations.partRoughMetal) {
    gl.deleteProgram(program);
    throw new Error('WebGL2 shader attributes or uniforms were not linked');
  }

  // Distinct texture units for the differently-typed samplers from the very first draw.
  gl.useProgram(program);
  gl.uniform1i(locations.orthoTexFine, 0);
  gl.uniform1i(locations.orthoTexCoarse, 1);
  gl.uniform1i(locations.shadowMap, 2);

  const lightLength = Math.hypot(...lightDirection);
  if (!(lightLength > 0) || lightDirection.some((value) => !Number.isFinite(value))) throw new TypeError('lightDirection must be a finite non-zero vector');
  const light = lightDirection.map((value) => value / lightLength);
  if (clearColor.length !== 3 || clearColor.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new TypeError('clearColor must contain three normalized color channels');
  }

  let uploadedMesh = null;
  let uploadedMarkerMesh = null;
  let uploadedRouteRibbon = null;
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

  const anisotropyExt = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAnisotropy = anisotropyExt ? Math.min(8, gl.getParameter(anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 1;

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
    let uploaded = false;
    if (image instanceof HTMLImageElement || image instanceof ImageBitmap || image instanceof HTMLCanvasElement) {
      glInstance.texImage2D(glInstance.TEXTURE_2D, 0, glInstance.RGBA, glInstance.RGBA, glInstance.UNSIGNED_BYTE, image);
      uploaded = true;
    } else if (image && image.data && image.width && image.height) {
      glInstance.texImage2D(glInstance.TEXTURE_2D, 0, glInstance.RGBA, image.width, image.height, 0, glInstance.RGBA, glInstance.UNSIGNED_BYTE, image.data);
      uploaded = true;
    }
    // Mipmaps + anisotropy remove distant shimmer of the 0.318 m/px ortho; footprint/UV mapping is unchanged.
    if (uploaded) glInstance.generateMipmap(glInstance.TEXTURE_2D);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_MIN_FILTER, uploaded ? glInstance.LINEAR_MIPMAP_LINEAR : glInstance.LINEAR);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_MAG_FILTER, glInstance.LINEAR);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_WRAP_S, glInstance.CLAMP_TO_EDGE);
    glInstance.texParameteri(glInstance.TEXTURE_2D, glInstance.TEXTURE_WRAP_T, glInstance.CLAMP_TO_EDGE);
    if (anisotropyExt && maxAnisotropy > 1) glInstance.texParameterf(glInstance.TEXTURE_2D, anisotropyExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
    glInstance.bindTexture(glInstance.TEXTURE_2D, null);
    return tex;
  }
  const astronaut = createAstronautBuffers(gl, locations);

  // Sky dome: renderer-owned unit cube (independent of the rig geometry), scaled by the vertex shader.
  const skyDome = (() => {
    const positions = new Float32Array([
      -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
      -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    ]);
    const indices = new Uint16Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]);
    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vao || !positionBuffer || !indexBuffer) throw new Error('WebGL2 sky dome buffer allocation failed');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { vao, positionBuffer, indexBuffer, indexCount: indices.length };
  })();

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

  // ---------- sun shadow map (presentation; silently disabled when depth textures/FBOs are unavailable) ----------
  function readShadowQualityRequest(requested) {
    if (requested && requested !== 'auto') return requested;
    try {
      const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('shadows') : null;
      return SHADOW_QUALITY_NAMES.includes(fromUrl) ? fromUrl : undefined;
    } catch { return undefined; }
  }
  let shadowPreset = resolveShadowQuality(readShadowQualityRequest(shadows));
  let shadowSupported = null; // null = not tried yet
  let shadowTerrainTarget = null; // cached terrain-only depth
  let shadowFinalTarget = null; // terrain depth + dynamic rig casters (sampled by receivers)
  let shadowTerrainKey = null;
  let shadowTerrainMesh = null;
  let shadowFailureReason = null;

  const dummyShadowTexture = (() => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 1, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  })();

  function createDepthTarget(resolution) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, resolution, resolution);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!complete) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return null;
    }
    return { texture, framebuffer, resolution };
  }
  function releaseDepthTarget(target) {
    if (!target) return;
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
  }
  function releaseShadowTargets() {
    releaseDepthTarget(shadowTerrainTarget);
    releaseDepthTarget(shadowFinalTarget);
    shadowTerrainTarget = null;
    shadowFinalTarget = null;
    shadowTerrainKey = null;
  }
  function ensureShadowTargets(resolution) {
    if (shadowSupported === false) return false;
    if (shadowTerrainTarget && shadowTerrainTarget.resolution === resolution && shadowFinalTarget) return true;
    releaseShadowTargets();
    try {
      for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++); // drop unrelated earlier errors
      shadowTerrainTarget = createDepthTarget(resolution);
      shadowFinalTarget = createDepthTarget(resolution);
      if (!shadowTerrainTarget || !shadowFinalTarget || gl.getError() !== gl.NO_ERROR) throw new Error('depth framebuffer incomplete');
      shadowSupported = true;
      return true;
    } catch (error) {
      releaseShadowTargets();
      shadowSupported = false;
      shadowFailureReason = error?.message ?? 'depth texture unavailable';
      return false;
    }
  }

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

  // Resets the per-object transform uniforms to identity (world-space geometry such as terrain/markers).
  function setIdentityObject(renderPass, baseColor = [1, 1, 1], partSize = [1, 1, 1]) {
    gl.uniform1i(locations.renderPass, renderPass);
    gl.uniform3f(locations.objectOffset, 0, 0, 0);
    gl.uniform1f(locations.headingRad, 0);
    gl.uniform1f(locations.verticalScale, 1);
    gl.uniform3f(locations.partSize, partSize[0], partSize[1], partSize[2]);
    gl.uniform3f(locations.partCenter, 0, 0, 0);
    gl.uniform3f(locations.partOffset, 0, 0, 0);
    gl.uniform3f(locations.partRotationRad, 0, 0, 0);
    gl.uniform3f(locations.rootOffset, 0, 0, 0);
    gl.uniform3f(locations.rootRotationRad, 0, 0, 0);
    gl.uniform3f(locations.baseColor, baseColor[0], baseColor[1], baseColor[2]);
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  function releaseRouteRibbon() {
    if (!uploadedRouteRibbon) return;
    gl.deleteVertexArray(uploadedRouteRibbon.vao);
    gl.deleteBuffer(uploadedRouteRibbon.positionBuffer);
    gl.deleteBuffer(uploadedRouteRibbon.normalBuffer);
    gl.deleteBuffer(uploadedRouteRibbon.colorBuffer);
    gl.deleteBuffer(uploadedRouteRibbon.uvBuffer);
    gl.deleteBuffer(uploadedRouteRibbon.indexBuffer);
    uploadedRouteRibbon = null;
  }

  function uploadRouteRibbon(mesh) {
    if (!mesh) { releaseRouteRibbon(); return; }
    if (mesh === uploadedRouteRibbon?.source) return;
    const vertexCount = mesh.positions?.length / 3;
    if (!(mesh.positions instanceof Float32Array) || !(mesh.normals instanceof Float32Array) ||
        !(mesh.colorsRgb instanceof Float32Array) || !(mesh.uvs instanceof Float32Array) ||
        !(mesh.indices instanceof Uint32Array) || mesh.positions.length % 3 !== 0 ||
        mesh.normals.length !== mesh.positions.length || mesh.colorsRgb.length !== mesh.positions.length ||
        mesh.uvs.length !== vertexCount * 2 || mesh.indices.length % 3 !== 0) {
      throw new TypeError('plannedRouteRibbon must provide aligned position, normal, color, UV and index arrays');
    }
    if (mesh.indices.length === 0) { releaseRouteRibbon(); return; }
    releaseRouteRibbon();
    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    const normalBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vao || !positionBuffer || !normalBuffer || !colorBuffer || !uvBuffer || !indexBuffer) {
      throw new Error('WebGL2 route ribbon buffer allocation failed');
    }
    gl.bindVertexArray(vao);
    for (const [buffer, data, location, size] of [
      [positionBuffer, mesh.positions, locations.position, 3],
      [normalBuffer, mesh.normals, locations.normal, 3],
      [colorBuffer, mesh.colorsRgb, locations.color, 3],
      [uvBuffer, mesh.uvs, locations.routeUv, 2],
    ]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    uploadedRouteRibbon = { source: mesh, vao, positionBuffer, normalBuffer, colorBuffer, uvBuffer, indexBuffer, indexCount: mesh.indices.length };
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
    renderFrame({ snapshot, camera, terrainMesh, markerMesh = null, geologyLinePositions = null, archiveLinePositions = null, plannedRouteLinePositions = null, plannedRouteRibbon = null, plannedRoutePulseUM = 0, footprintTrail = null }) {
      const frameStartedAt = collectDiagnostics ? now() : 0;
      if (disposed) throw new Error('Renderer has been disposed');
      if (!snapshot || !snapshot.astronaut || !Object.isFrozen(snapshot)) {
        throw new TypeError('A frozen WorldSnapshot is required');
      }
      if (!camera) throw new TypeError('A camera state is required');
      if (!(canvas.width > 0 && canvas.height > 0)) throw new Error('Call resize() before renderFrame()');
      uploadMesh(terrainMesh);
      uploadRouteRibbon(plannedRouteRibbon);

      const viewProjection = getViewProjectionMatrix(camera, canvas.width / canvas.height);
      const eye = getCameraPosition(camera);
      const minZDisplay = Number.isFinite(terrainMesh.bounds?.minZDisplay) ? terrainMesh.bounds.minZDisplay : -20;
      const maxZDisplay = Number.isFinite(terrainMesh.bounds?.maxZDisplay) ? terrainMesh.bounds.maxZDisplay : 20;

      const { astronaut: player } = snapshot;
      const { referenceElevationM, verticalScale } = terrainMesh.displayConfig;
      const elevationKnown = player.elevationStatus === 'ok' && Number.isFinite(player.zM);
      const movement = player.movement;
      const firstPerson = camera.mode === 'first-person';
      const hasPoseAnchor = Number.isFinite(player.bodyWorldZM);
      const canDrawRig = movement && hasPoseAnchor && (firstPerson || elevationKnown);
      // The same pure pose drives the drawn rig and its shadow caster.
      const framePose = movement && hasPoseAnchor ? poseAstronautRig(movement) : null;
      const rigHeadingRad = (firstPerson && Number.isFinite(camera.yawRad)
        ? camera.yawRad
        : (Number.isFinite(player.headingRad) ? player.headingRad : 0)) + ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad;
      // Physical body anchor: where the world rig stands (also where its shadow is cast from in first person).
      const worldRigOffset = hasPoseAnchor
        ? [player.xM, player.yM, (player.bodyWorldZM - referenceElevationM) * verticalScale]
        : null;

      const timings = collectDiagnostics ? { shadowMs: 0, skyMs: 0, terrainMs: 0, guidesMs: 0, rigMs: 0 } : null;
      let t0 = collectDiagnostics ? now() : 0;
      const lap = (key) => { if (timings) { const t = now(); timings[key] += t - t0; t0 = t; } };

      // ----- Shadow passes (cached terrain depth + per-frame rig caster) -----
      let shadowMode = 0;
      let shadowLightSpace = null;
      let shadowTerrainRendered = false;
      let shadowRigCasting = false;
      let shadowSampleTexture = dummyShadowTexture;
      const sunDisplay = (() => {
        const x = light[0], y = light[1], z = light[2] * verticalScale;
        const l = Math.hypot(x, y, z);
        return [x / l, y / l, z / l];
      })();
      if (shadowPreset.resolution > 0 && shadowSupported !== false) {
        const [focusX, focusY] = shadowFocusXY(camera);
        const radiusM = chooseShadowRadiusM(camera, shadowPreset);
        if (Number.isFinite(focusX) && Number.isFinite(focusY) && radiusM > 0) {
          shadowLightSpace = computeShadowLightSpace({
            sunDirDisplay: sunDisplay, focusXM: focusX, focusYM: focusY, radiusM,
            zMinM: minZDisplay - 2, zMaxM: maxZDisplay + 4, resolution: shadowPreset.resolution,
          });
        }
        if (shadowLightSpace?.enabled && ensureShadowTargets(shadowPreset.resolution)) {
          const res = shadowPreset.resolution;
          const cacheKey = `${shadowLightSpace.cacheKey}|${verticalScale}`;
          gl.useProgram(program);
          // Never sample a texture that is a framebuffer attachment during this pass.
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, dummyShadowTexture);
          gl.uniform1i(locations.shadowMap, 2);
          gl.uniform1i(locations.shadowMode, 0);
          gl.uniform1f(locations.receiveShadow, 0);
          gl.uniformMatrix4fv(locations.viewProjection, false, shadowLightSpace.viewProjection);
          gl.uniform3f(locations.cameraEye, eye.xM, eye.yM, eye.zDisplay);
          gl.uniform1f(locations.terrainExaggeration, verticalScale);
          gl.viewport(0, 0, res, res);
          gl.enable(gl.DEPTH_TEST);
          gl.depthMask(true);
          if (shadowTerrainKey !== cacheKey || shadowTerrainMesh !== uploadedMesh.source) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTerrainTarget.framebuffer);
            gl.clearDepth(1);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(1.5, 2.0);
            setIdentityObject(4);
            gl.disableVertexAttribArray(locations.color);
            gl.vertexAttrib3f(locations.color, 1, 1, 1);
            gl.bindVertexArray(uploadedMesh.vao);
            gl.drawElements(gl.TRIANGLES, uploadedMesh.indexCount, gl.UNSIGNED_INT, 0);
            gl.disable(gl.POLYGON_OFFSET_FILL);
            shadowTerrainKey = cacheKey;
            shadowTerrainMesh = uploadedMesh.source;
            shadowTerrainRendered = true;
          }
          // The physical body casts a shadow even in first person (the first-person arms are only a view model).
          shadowRigCasting = Boolean(framePose && worldRigOffset && elevationKnown);
          if (shadowRigCasting) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, shadowTerrainTarget.framebuffer);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, shadowFinalTarget.framebuffer);
            gl.blitFramebuffer(0, 0, res, res, 0, 0, res, res, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFinalTarget.framebuffer);
            setIdentityObject(4);
            gl.uniform3fv(locations.objectOffset, worldRigOffset);
            gl.uniform1f(locations.headingRad, rigHeadingRad);
            gl.bindVertexArray(astronaut.vao);
            gl.disableVertexAttribArray(locations.color);
            gl.vertexAttrib3f(locations.color, 1, 1, 1);
            gl.uniform3fv(locations.rootOffset, framePose.rootOffset);
            gl.uniform3fv(locations.rootRotationRad, framePose.rootRotationRad);
            for (const id of Object.keys(ASTRONAUT_RIG.parts)) {
              const part = ASTRONAUT_RIG.parts[id];
              const partPose = framePose.parts[id];
              if (!part || !partPose) continue;
              gl.uniform3fv(locations.partSize, part.size);
              gl.uniform3fv(locations.partCenter, part.center);
              gl.uniform3fv(locations.partOffset, partPose.offset);
              gl.uniform3fv(locations.partRotationRad, partPose.rotationRad);
              drawRigPart(gl, astronaut, part);
            }
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.bindVertexArray(null);
          gl.viewport(0, 0, canvas.width, canvas.height);
          shadowSampleTexture = shadowRigCasting ? shadowFinalTarget.texture : shadowTerrainTarget.texture;
          shadowMode = shadowPreset.kernel > 0 ? 2 : 1;
        }
      }
      lap('shadowMs');

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
      gl.uniform3fv(locations.lightDirection, light);
      gl.uniform3fv(locations.skySunDir, sunDisplay);
      gl.uniform3f(locations.cameraEye, eye.xM, eye.yM, eye.zDisplay);
      gl.uniform2f(locations.elevBounds, minZDisplay, maxZDisplay);
      const tb = terrainMesh.bounds;
      if (Number.isFinite(tb?.minX) && Number.isFinite(tb?.maxX) && Number.isFinite(tb?.minY) && Number.isFinite(tb?.maxY)) {
        gl.uniform4f(locations.terrainBounds, tb.minX, tb.minY, tb.maxX, tb.maxY);
      } else {
        gl.uniform4f(locations.terrainBounds, 0, 0, 0, 0);
      }
      gl.uniform1f(locations.terrainExaggeration, verticalScale);
      gl.uniform1f(locations.alpha, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, shadowSampleTexture);
      gl.uniform1i(locations.shadowMap, 2);
      gl.uniform1i(locations.shadowMode, shadowMode);
      if (shadowLightSpace?.enabled) {
        gl.uniformMatrix4fv(locations.lightVP, false, shadowLightSpace.viewProjection);
        gl.uniform4f(locations.shadowParams, shadowLightSpace.texelWorldM, shadowLightSpace.depthRangeM, 1 / shadowPreset.resolution, 0);
        gl.uniform3fv(locations.shadowLightDir, shadowLightSpace.lightDir);
      } else {
        gl.uniform4f(locations.shadowParams, 1, 1, 1, 0);
        gl.uniform3f(locations.shadowLightDir, 0, 0, 1);
      }
      gl.uniform1f(locations.receiveShadow, 0);

      // Pass 3: procedural Martian sky dome (sunlit gradient, forward-scattering halo, 21' sun disc)
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      setIdentityObject(3, [1, 1, 1], [2000, 2000, 2000]);
      gl.uniform3f(locations.objectOffset, eye.xM, eye.yM, eye.zDisplay);
      gl.disableVertexAttribArray(locations.color);
      gl.vertexAttrib3f(locations.color, 1, 1, 1);
      gl.disableVertexAttribArray(locations.normal);
      gl.vertexAttrib3f(locations.normal, 0, 0, 1);
      gl.bindVertexArray(skyDome.vao);
      gl.drawElements(gl.TRIANGLES, skyDome.indexCount, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      lap('skyMs');

      // Pass 0: Jezero Crater Terrain Mesh
      setIdentityObject(0, [0.78, 0.43, 0.25]);
      gl.uniform1f(locations.receiveShadow, 1);
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
      lap('terrainMs');

      // Pass 1: 3D Waypoint Beacons and Route Guides (if supplied)
      let markersDrawn = false;
      let markerDrawPlan = { drawRanges: [], hiddenBeaconIds: [] };
      let markerIndexCountDrawn = 0;
      if (markerMesh) {
        uploadMarkerMesh(markerMesh);
      }
      if (uploadedMarkerMesh && uploadedMarkerMesh.indexCount > 0) {
        setIdentityObject(1);
        gl.uniform1f(locations.receiveShadow, 0);
        gl.uniform1f(locations.alpha, 1);
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
        gl.uniform1f(locations.receiveShadow, 0);
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
      lap('guidesMs');

      if (uploadedRouteRibbon) {
        gl.uniform1i(locations.renderPass, 6); // 6 = route ribbon (4 = shadow depth, 5 = footprints)
        gl.uniform1f(locations.receiveShadow, 0);
        gl.uniform1f(locations.alpha, 1);
        gl.uniform1f(locations.routeTimeS, snapshot.astronaut.movement?.timeS ?? 0);
        gl.uniform1f(locations.routePulseUM, Number.isFinite(plannedRoutePulseUM) ? plannedRoutePulseUM : 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.bindVertexArray(uploadedRouteRibbon.vao);
        gl.drawElements(gl.TRIANGLES, uploadedRouteRibbon.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

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
        // Own pass (5): terrain-lit dark decal, no emissive. World-space quads: identity transforms, receives shadow.
        setIdentityObject(5);
        gl.uniform1f(locations.receiveShadow, 1);
        gl.uniform1f(locations.alpha, 0.9);
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

      let avatarDrawn = false;
      let firstPersonViewModelDrawn = false;
      let rigPose = null;
      let rigPartsDrawn = [];
      let firstPersonVisibleParts = [];
      let rigPresentation = 'world';
      if (canDrawRig) {
        rigPose = framePose;
        rigPresentation = firstPerson ? 'first-person-view-model' : 'world';
        const headingRad = rigHeadingRad;
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
          objectOffset = worldRigOffset;
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
        // Third-person rig receives terrain/self shadows; the camera-attached view model does not.
        gl.uniform1f(locations.receiveShadow, firstPerson ? 0 : 1);
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
          setRigMaterialUniforms(gl, locations, id);
          gl.vertexAttrib3fv(locations.color, part.colorRgb);
          drawRigPart(gl, astronaut, part);
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
              setRigMaterialUniforms(gl, locations, id);
              gl.vertexAttrib3fv(locations.color, part.colorRgb);
              drawRigPart(gl, astronaut, part);
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
      gl.activeTexture(gl.TEXTURE0);
      lap('rigMs');
      if (collectDiagnostics) {
        const sunIrr = marsSunIrradiance(light);
        lastFrameDiagnostics = {
          frameRenderMs: now() - frameStartedAt,
          terrainTriangles: uploadedMesh.indexCount / 3,
          footprintCount: footprintCountDrawn,
          footprintVertexCount: footprintCountDrawn * 6,
          plannedRouteLineVertexCount: plannedRouteLinePositions instanceof Float32Array ? plannedRouteLinePositions.length / 3 : 0,
          plannedRouteRibbonVertexCount: uploadedRouteRibbon ? uploadedRouteRibbon.source.positions.length / 3 : 0,
          plannedRouteRibbonTriangleCount: uploadedRouteRibbon ? uploadedRouteRibbon.indexCount / 3 : 0,
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
          // Stage Visual A additions (existing keys above are unchanged).
          renderTimingMs: { total: now() - frameStartedAt, ...timings, note: 'CPU command-submission time; GPU time not measured' },
          shadowResolution: shadowMode > 0 ? shadowPreset.resolution : 0,
          lighting: {
            model: 'linear light + ACES (Narkowicz) + sRGB, shared by sky/terrain/guides/rig',
            sunDirection: [...light],
            sunElevationDeg: (Math.asin(Math.min(1, Math.max(-1, light[2]))) * 180) / Math.PI,
            sunIrradianceLuma: luminance(sunIrr),
            sunAngularDiameterArcmin: MARS_SUN_ANGULAR_DIAMETER_ARCMIN,
            exposure: SKY_PARAMS.exposure,
            shadows: {
              requested: shadowPreset.name,
              active: shadowMode > 0,
              supported: shadowSupported,
              failureReason: shadowFailureReason,
              resolution: shadowMode > 0 ? shadowPreset.resolution : 0,
              kernel: shadowMode === 2 ? '3x3' : (shadowMode === 1 ? '1-tap' : 'none'),
              coverageRadiusM: shadowLightSpace?.enabled ? shadowLightSpace.radiusM : 0,
              texelWorldM: shadowLightSpace?.enabled ? shadowLightSpace.texelWorldM : null,
              terrainDepthRerendered: shadowTerrainRendered,
              rigCasting: shadowRigCasting,
              disabledReason: shadowLightSpace && !shadowLightSpace.enabled ? shadowLightSpace.reason : null,
            },
            labels: 'sunum/presentation parameters; see Sim/stage-visual-a-scene-audit.md',
          },
        };
      }
    },

    /** Sets shadow quality: 'off' | 'low' | 'high'. Unknown names fall back to the default preset. */
    setShadowQuality(name) {
      if (disposed) return;
      const next = resolveShadowQuality(name);
      if (next === shadowPreset) return;
      shadowPreset = next;
      releaseShadowTargets();
    },

    getShadowQuality() {
      return shadowPreset.name;
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
      releaseShadowTargets();
      if (dummyShadowTexture) gl.deleteTexture(dummyShadowTexture);
      releaseRouteRibbon();
      if (orthoTexFine) { gl.deleteTexture(orthoTexFine); orthoTexFine = null; }
      if (orthoTexCoarse) { gl.deleteTexture(orthoTexCoarse); orthoTexCoarse = null; }
      if (dummyTexture) { gl.deleteTexture(dummyTexture); }
      gl.deleteVertexArray(skyDome.vao);
      gl.deleteBuffer(skyDome.positionBuffer);
      gl.deleteBuffer(skyDome.indexBuffer);
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
