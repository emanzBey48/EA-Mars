// Pure sun shadow-map math (orthographic light space) shared by the WebGL2 renderer and tests.
// No DOM, no WebGL, no state. The renderer owns textures/framebuffers; this module only answers
// "which light-space matrix covers this focus region" and "what are the receiver bias constants".
//
// Everything here is a PRESENTATION parameter (coverage radius, resolution, bias, kernel). Shadows are
// generated from the mesh the viewer already draws; they add no terrain data. Mars shadows read softer
// than Earth's because of the dusty sky: that softness comes from the sky-derived ambient term in
// sky-model.js (diffuse/direct ratio, presentation) plus the PCF kernel, not from a measured penumbra.
//
// Light direction note: the renderer passes the sun direction in DISPLAY space,
// normalize(sunE, sunN, sunUp * verticalScale), so the shadow *horizontal length* of an exaggerated hill
// matches the physical length (height*s / (tan(elev)*s)). 1:1 rigs then cast marginally shorter shadows
// when verticalScale > 1; this is documented in Sim/stage-visual-a-scene-audit.md.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Quality presets (presentation). `kernel`: 0 = one hardware-PCF tap, 1 = 3×3 taps. */
export const SHADOW_QUALITY = Object.freeze({
  off: Object.freeze({ name: 'off', resolution: 0, radiusM: 0, kernel: 0 }),
  low: Object.freeze({ name: 'low', resolution: 1024, radiusM: 70, kernel: 0 }),
  high: Object.freeze({ name: 'high', resolution: 2048, radiusM: 90, kernel: 1 }),
});
export const DEFAULT_SHADOW_QUALITY = 'high';
export const SHADOW_QUALITY_NAMES = Object.freeze(Object.keys(SHADOW_QUALITY));

/** Receiver bias constants (metres in light depth) — mirrored by the renderer's GLSL. Presentation. */
export const SHADOW_BIAS = Object.freeze({
  baseBiasM: 0.04,
  slopeBiasTexels: 1.2,
  maxSlopeTan: 4.0,
  normalOffsetTexels: 1.5,
});
/** Sun elevation (sin) below which shadows are disabled (long, unstable shadows; direct light already faded). */
export const SHADOW_MIN_SUN_SIN = 0.03;
/** Fraction of the shadow map border over which the shadow fades to "lit". */
export const SHADOW_EDGE_FADE_UV = 0.08;
/** Extra depth range toward the light, in multiples of the coverage radius, so off-box casters still shadow the box. */
export const SHADOW_CASTER_PAD_RADII = 2.0;

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (!(l > 0)) throw new RangeError('direction must be non-zero');
  return [v[0] / l, v[1] / l, v[2] / l];
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Resolves a quality name (or undefined/'auto') to a preset; unknown names fall back to the default. */
export function resolveShadowQuality(name) {
  if (typeof name === 'string' && Object.hasOwn(SHADOW_QUALITY, name)) return SHADOW_QUALITY[name];
  return SHADOW_QUALITY[DEFAULT_SHADOW_QUALITY];
}

/**
 * Coverage radius for the current camera (presentation). First person: the preset radius. Orbit: the
 * smallest preset×2^k (k ≤ 3) that covers ~45 % of the orbit distance, so zooming does not re-render
 * the cached terrain shadow every frame.
 */
export function chooseShadowRadiusM(camera, preset) {
  if (!preset || !(preset.radiusM > 0)) return 0;
  if (camera?.mode === 'first-person' || !Number.isFinite(camera?.distanceM)) return preset.radiusM;
  let r = preset.radiusM;
  for (let k = 0; k < 3 && r < camera.distanceM * 0.45; k++) r *= 2;
  return r;
}

/** Focus region centre for the camera: eye XY in first person, orbit target otherwise. */
export function shadowFocusXY(camera) {
  if (camera?.mode === 'first-person') return [camera.xM, camera.yM];
  return [camera.targetXM, camera.targetYM];
}

/**
 * Builds an orthographic light-space transform covering the world box
 * [focus ± radius] × [zMin, zMax] (display metres). The focus is snapped to `radius/4` so the matrix (and the
 * cached terrain depth) is stable while the player moves inside a cell.
 *
 * Returns { enabled:false, reason } when the sun is too low/below the horizon, otherwise
 * { enabled:true, viewProjection:Float32Array(16) (column-major, world→clip), lightDir (unit, toward sun),
 *   centerXM, centerYM, radiusM, texelWorldM, depthRangeM, cacheKey }.
 */
export function computeShadowLightSpace({ sunDirDisplay, focusXM, focusYM, radiusM, zMinM, zMaxM, resolution }) {
  if (![focusXM, focusYM, radiusM, zMinM, zMaxM, resolution].every(Number.isFinite) || !(radiusM > 0) || !(resolution > 0) || !(zMaxM >= zMinM)) {
    throw new RangeError('computeShadowLightSpace needs finite focus, radius > 0, zMin ≤ zMax and resolution > 0');
  }
  const sun = normalize3(sunDirDisplay);
  if (sun[2] < SHADOW_MIN_SUN_SIN) return { enabled: false, reason: 'sun-below-shadow-threshold' };

  const grid = radiusM / 4;
  const cx = Math.round(focusXM / grid) * grid;
  const cy = Math.round(focusYM / grid) * grid;
  const cz = (zMinM + zMaxM) / 2;

  // Light basis: z-axis of view space points toward the light (OpenGL convention: camera looks down -z).
  const up = Math.abs(sun[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize3(cross3(up, sun));
  const upV = cross3(sun, right);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const dx of [-radiusM, radiusM]) for (const dy of [-radiusM, radiusM]) for (const z of [zMinM, zMaxM]) {
    const p = [cx + dx - cx, cy + dy - cy, z - cz];
    const vx = dot3(right, p), vy = dot3(upV, p), vz = dot3(sun, p);
    minX = Math.min(minX, vx); maxX = Math.max(maxX, vx);
    minY = Math.min(minY, vy); maxY = Math.max(maxY, vy);
    minZ = Math.min(minZ, vz); maxZ = Math.max(maxZ, vz);
  }
  // Casters outside the box toward the light still shadow it: extend the near side (toward the light).
  maxZ += SHADOW_CASTER_PAD_RADII * radiusM;
  const near = -maxZ, far = -minZ; // positive distances along -z of the light view

  // View matrix (column-major): rows right/upV/sun, translated so the box centre is the origin.
  const view = new Float32Array([
    right[0], upV[0], sun[0], 0,
    right[1], upV[1], sun[1], 0,
    right[2], upV[2], sun[2], 0,
    -dot3(right, [cx, cy, cz]), -dot3(upV, [cx, cy, cz]), -dot3(sun, [cx, cy, cz]), 1,
  ]);
  const w = maxX - minX, h = maxY - minY, d = far - near;
  const proj = new Float32Array([
    2 / w, 0, 0, 0,
    0, 2 / h, 0, 0,
    0, 0, -2 / d, 0,
    -(maxX + minX) / w, -(maxY + minY) / h, -(far + near) / d, 1,
  ]);
  const viewProjection = multiply4(proj, view);
  const texelWorldM = Math.max(w, h) / resolution;
  const key = [cx, cy, radiusM, zMinM, zMaxM, resolution, ...sun].map((v) => (Number.isInteger(v) ? v : v.toFixed(5))).join('|');
  return {
    enabled: true,
    viewProjection,
    lightDir: sun,
    centerXM: cx,
    centerYM: cy,
    radiusM,
    texelWorldM,
    depthRangeM: d,
    cacheKey: key,
  };
}

/** Column-major 4×4 multiply, out = a × b. */
export function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

/** Transforms a world point to clip space; returns NDC [x, y, z] (w = 1 for orthographic matrices). */
export function projectToLightNdc(viewProjection, p) {
  const m = viewProjection;
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
  ];
}

/** Receiver depth bias in metres: constant + slope-scaled term (JS mirror of the GLSL). */
export function receiverBiasM(texelWorldM, cosTheta) {
  const c = clamp(cosTheta, 0.05, 1);
  const tanTheta = Math.min(Math.sqrt(1 - c * c) / c, SHADOW_BIAS.maxSlopeTan);
  return SHADOW_BIAS.baseBiasM + SHADOW_BIAS.slopeBiasTexels * texelWorldM * tanTheta;
}
/** World-space receiver offset along the surface normal, metres. */
export const receiverNormalOffsetM = (texelWorldM) => SHADOW_BIAS.normalOffsetTexels * texelWorldM;

/**
 * GLSL receiver snippet. Expects: uniform mat4 uLightVP; uniform sampler2DShadow uShadowMap (precision
 * highp declared by the caller); uniform vec4 uShadowParams (x texelWorldM, y depthRangeM);
 * uniform vec3 uShadowLightDir; uniform int uShadowMode (0 off, 1 one tap, 2 3×3); uniform float uReceiveShadow.
 * `shadowFactor` returns 1 = lit, 0 = fully in direct-sun shadow.
 */
const g = (v) => { let s = Number(v).toFixed(6).replace(/0+$/, ''); if (s.endsWith('.')) s += '0'; return s; };
export const SHADOW_RECEIVER_GLSL = `
float shadowFactor(vec3 worldPos, vec3 surfaceNormal) {
  if (uShadowMode == 0 || uReceiveShadow < 0.5) return 1.0;
  float cosT = clamp(dot(normalize(surfaceNormal), uShadowLightDir), 0.05, 1.0);
  float tanT = min(sqrt(1.0 - cosT * cosT) / cosT, ${g(SHADOW_BIAS.maxSlopeTan)});
  float biasM = ${g(SHADOW_BIAS.baseBiasM)} + ${g(SHADOW_BIAS.slopeBiasTexels)} * uShadowParams.x * tanT;
  vec3 p = worldPos + normalize(surfaceNormal) * (${g(SHADOW_BIAS.normalOffsetTexels)} * uShadowParams.x);
  vec4 clip = uLightVP * vec4(p, 1.0);
  vec3 s = clip.xyz / clip.w * 0.5 + 0.5;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  s.z -= biasM / uShadowParams.y;
  float lit;
  if (uShadowMode == 1) {
    lit = texture(uShadowMap, s);
  } else {
    vec2 texel = vec2(uShadowParams.z);
    lit = 0.0;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        lit += texture(uShadowMap, vec3(s.xy + vec2(float(i), float(j)) * texel, s.z));
      }
    }
    lit /= 9.0;
  }
  float edge = min(min(s.x, 1.0 - s.x), min(s.y, 1.0 - s.y));
  return mix(1.0, lit, smoothstep(0.0, ${g(SHADOW_EDGE_FADE_UV)}, edge));
}
`;
