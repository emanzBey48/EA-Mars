// Pure terrain *surface appearance* model shared by the WebGL2 renderer (GLSL) and tests (JS mirror).
// No DOM, no WebGL, no state. It never changes elevation, slope data, no-data cells, routes or mesh
// geometry: everything here only alters how an already-built terrain fragment is shaded.
//
// Labels used for every constant below (see the table in Sim/stage-visual-a-scene-audit.md):
//   "sunum"   = presentation parameter chosen for this viewer, not a measurement.
//   "görsel detay, veri değildir" = procedural micro detail: deterministic, fixed to world X/Y metres,
//               fades with distance, carries NO terrain information and must never be read as data.
// Palette hues are the viewer's existing butterscotch/regolith elevation ramp (presentation). The Viking
// MDIM colour measurement (hue ≈ 272°, i.e. stretched/processed colour) is deliberately NOT used as a
// terrain hue. When a HiRISE grayscale ortho texel exists, LUMINANCE comes from the ortho and CHROMA from
// the palette; the ortho is never recoloured into a different "ortho" claim and hillshade is never
// called ortho.
//
// The GLSL block expects marsLighting GLSL (srgbToLinear, LUMA709) to be pasted before it.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a * (1 - t) + b * t;
const LUMA = [0.2126, 0.7152, 0.0722];
const srgbToLinear1 = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

export const TERRAIN_SHADING_PARAMS = Object.freeze({
  // Elevation ramp, sRGB display values (sunum; unchanged from the pre-existing viewer palette).
  basinSrgb: Object.freeze([0.62, 0.35, 0.22]),
  deltaSrgb: Object.freeze([0.79, 0.45, 0.27]),
  ridgeSrgb: Object.freeze([0.90, 0.58, 0.36]),
  // Steep, rougher bedrock tone (sunum).
  bedrockSrgb: Object.freeze([0.38, 0.24, 0.19]),
  // Converts the sRGB palette to a linear diffuse reflectance of plausible magnitude (sunum).
  albedoScale: 0.70,
  // Fraction of the palette's linear chroma kept, at constant luminance (sunum). The warm sky ambient multiplies
  // the albedo's R/B ratio several times over; without this the ground rendered at saturation ~0.85 (red-orange).
  // 0.20 brings the rendered mid tone to ~0.55-0.6 saturation (butterscotch/regolith), measured in the browser.
  paletteChromaKeep: 0.20,
  // Real-slope weighting (tan of the *physical* slope, exaggeration undone): 10° … 35° (sunum).
  slopeTanStart: Math.tan((10 * Math.PI) / 180),
  slopeTanEnd: Math.tan((35 * Math.PI) / 180),
  slopeBedrockMix: 0.55,
  slopeDarkening: 0.30,
  slopeRoughnessGain: 0.60,
  // Micro detail octaves (görsel detay, veri değildir). slopeAmp is the max per-axis slope perturbation
  // of that octave; toneAmp is the max relative albedo change.
  // Tone amplitudes raised so the near field (0-20 m) shows grain and mottling; still below ~±12 % per octave.
  octaves: Object.freeze([
    Object.freeze({ wavelengthM: 0.18, slopeAmp: 0.26, toneAmp: 0.12 }),
    Object.freeze({ wavelengthM: 0.60, slopeAmp: 0.16, toneAmp: 0.10 }),
    Object.freeze({ wavelengthM: 2.00, slopeAmp: 0.10, toneAmp: 0.07 }),
    Object.freeze({ wavelengthM: 6.50, slopeAmp: 0.05, toneAmp: 0.08 }),
  ]),
  // An octave fades out between wavelength×start and wavelength×end metres from the camera, i.e. before
  // its features fall below ~2 px (≈0.0019 rad/px for the 80° first-person FOV at ~900 px).
  fadeStartPerWavelength: 50,
  fadeEndPerWavelength: 220,
  // Pebble/gravel scatter (gorsel detay, veri degildir): world-fixed deterministic discs, one per jittered grid cell.
  // Each layer: cell size, max pebble radius (<= 0.22 cell so pebble + contact ring stay inside the cell), presence
  // probability, relative tone amplitude, and the distance range over which the layer fades out (metres).
  pebbles: Object.freeze([
    Object.freeze({ cellM: 0.30, radiusM: 0.066, density: 0.55, toneAmp: 0.16, fadeStartM: 8, fadeEndM: 24 }),
    Object.freeze({ cellM: 0.95, radiusM: 0.20, density: 0.10, toneAmp: 0.12, fadeStartM: 20, fadeEndM: 60 }),
  ]),
  pebbleHeightPerRadius: 0.9,
  pebbleSlopeMax: 0.6,
  pebbleOrthoToneReduction: 0.85,
  // Hard cap on the total micro slope perturbation (|dh/dx,dh/dy| vector length).
  microSlopeMax: 0.45,
  // Ortho coverage tone detail already resolves ~0.32 m texels: micro tone is reduced by this fraction there.
  microToneOrthoReduction: 0.60,
  // Ortho luminance → relative gain around the palette mid luminance (same law as the earlier hybrid mode).
  orthoGainMin: 0.45,
  orthoGainMax: 1.45,
  // Soft ortho footprint: weight rises 0→1 over this fraction of the texture width from its border (sunum).
  orthoEdgeUv: 0.02,
  // Alpha of a texel below/above these values is treated as outside/inside coverage (smooth in between).
  orthoAlphaLow: 0.15,
  orthoAlphaHigh: 0.85,
  // Fade of the mesh's outermost ring into the haze colour, metres (sunum; hides nothing inside the mesh).
  meshEdgeFadeM: 140,
  // The border fade only applies to fragments seen from this far away (smoothstep range, metres), so
  // standing near the mesh border does not wash out the ground around the viewer (sunum).
  meshEdgeFadeViewStartM: 200,
  meshEdgeFadeViewEndM: 700,
});

const P = TERRAIN_SHADING_PARAMS;
export const MICRO_DERIVATIVE_BOUND = 1.875; // max |d value-noise / d cell| of the quintic value noise
export const MICRO_OCTAVE_SEED_STEP = Object.freeze([31.7, 57.3]); // per-octave cell offset (decorrelates octaves)

// Linear palette colour with its luminance preserved and its chroma scaled by paletteChromaKeep.
const paletteLinear = (srgb) => {
  const lin = srgb.map((v) => srgbToLinear1(v) * P.albedoScale);
  const L = lin[0] * LUMA[0] + lin[1] * LUMA[1] + lin[2] * LUMA[2];
  return lin.map((v) => L + P.paletteChromaKeep * (v - L));
};
export const PALETTE_LINEAR = Object.freeze({
  basin: Object.freeze(paletteLinear(P.basinSrgb)),
  delta: Object.freeze(paletteLinear(P.deltaSrgb)),
  ridge: Object.freeze(paletteLinear(P.ridgeSrgb)),
  bedrock: Object.freeze(paletteLinear(P.bedrockSrgb)),
});
const lumaOf = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
/** Palette luminance the ortho gain is centred on (the delta/regolith mid tone). */
export const ORTHO_MID_LUMA = lumaOf(PALETTE_LINEAR.delta);

// ---------- deterministic hashing / noise (JS mirror of the GLSL below) ----------
/** PCG2D hash (Jarzynski & Olano, "Hash Functions for GPU Rendering", 2020) on two int32 cell coordinates. */
export function hash2(ix, iy) {
  let x = (Math.imul(ix | 0, 1664525) + 1013904223) >>> 0;
  let y = (Math.imul(iy | 0, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}
/** Uniform value in [0, 1) with 24 significant bits (exactly representable in float32). */
export const hashUnit = (ix, iy) => (hash2(ix, iy) >>> 8) / 16777216;

/** Quintic-interpolated value noise in [0, 1] with analytic derivatives wrt cell coordinates. */
export function valueNoiseD(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const a = hashUnit(ix, iy), b = hashUnit(ix + 1, iy), c = hashUnit(ix, iy + 1), d = hashUnit(ix + 1, iy + 1);
  const k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return {
    value: a + k1 * ux + k2 * uy + k4 * ux * uy,
    dx: dux * (k1 + k4 * uy),
    dy: duy * (k2 + k4 * ux),
  };
}

/** Distance weight of octave `i` at camera distance `distM` (1 near, 0 far). */
export const octaveFade = (i, distM) => 1 - smoothstep(
  P.octaves[i].wavelengthM * P.fadeStartPerWavelength,
  P.octaves[i].wavelengthM * P.fadeEndPerWavelength,
  Math.max(distM, 0),
);

/**
 * Procedural micro detail at local world position (xM, yM) seen from `distM`. `roughness` ≥ 1 scales the
 * slope amplitude (steeper terrain is rougher). Deterministic, fixed to world coordinates.
 * Returns the slope perturbation (dh/dx, dh/dy), a relative tone offset and the octave weights.
 */
export function microDetail(xM, yM, distM, roughness = 1) {
  let sx = 0, sy = 0, tone = 0;
  const weights = [];
  for (let i = 0; i < P.octaves.length; i++) {
    const o = P.octaves[i];
    const fade = octaveFade(i, distM);
    weights.push(fade);
    if (fade <= 0) continue;
    const n = valueNoiseD(xM / o.wavelengthM + i * MICRO_OCTAVE_SEED_STEP[0], yM / o.wavelengthM + i * MICRO_OCTAVE_SEED_STEP[1]);
    const k = (o.slopeAmp * roughness * fade) / MICRO_DERIVATIVE_BOUND;
    sx += n.dx * k;
    sy += n.dy * k;
    tone += o.toneAmp * fade * (2 * n.value - 1);
  }
  const len = Math.hypot(sx, sy);
  if (len > P.microSlopeMax) { sx *= P.microSlopeMax / len; sy *= P.microSlopeMax / len; }
  return { slopeX: sx, slopeY: sy, tone, weights };
}

/** Salted per-cell random in [0, 1): k selects the independent stream (mirrors terrainPebbleRand in GLSL). */
export const pebbleRand = (ix, iy, k) => hashUnit(ix + 7919 * k, iy + 104729 * k);

/**
 * Pebble/gravel scatter at local world position (xM, yM) seen from `distM` (JS mirror of the GLSL
 * terrainPebbles). Deterministic, world-fixed, fades with distance. Returns { slopeX, slopeY, tone }.
 * Visual detail only: carries no terrain data and never feeds routes or slope analysis.
 */
export function pebbleDetail(xM, yM, distM) {
  let sx = 0, sy = 0, tone = 0;
  for (const L of P.pebbles) {
    const fade = 1 - smoothstep(L.fadeStartM, L.fadeEndM, Math.max(distM, 0));
    if (fade <= 0) continue;
    const px = xM / L.cellM, py = yM / L.cellM;
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const cx = 0.3 + 0.4 * pebbleRand(ix, iy, 1);
    const cy = 0.3 + 0.4 * pebbleRand(ix, iy, 2);
    const radius = (0.5 + 0.5 * pebbleRand(ix, iy, 3)) * (L.radiusM / L.cellM);
    if (pebbleRand(ix, iy, 4) >= L.density) continue;
    const dxw = (fx - cx) * L.cellM, dyw = (fy - cy) * L.cellM;
    const rw = radius * L.cellM;
    const d = Math.hypot(dxw, dyw) / rw;
    const shade = (pebbleRand(ix, iy, 5) - 0.5) * 2; // -1 dark .. +1 light pebble
    if (d < 1) {
      const h = Math.max(Math.sqrt(1 - d * d), 0.3);
      // Dome H = hPerR * rw * sqrt(1 - d^2): dH/dx = -hPerR * (dxw / rw) / sqrt(1 - d^2) (dimensionless slope).
      const k = -P.pebbleHeightPerRadius / h * fade;
      sx += k * dxw / rw;
      sy += k * dyw / rw;
      tone += L.toneAmp * shade * 0.8 * fade;
    } else if (d < 1.35) {
      tone -= 0.08 * (1 - smoothstep(1, 1.35, d)) * fade; // contact darkening ring
    }
  }
  const len = Math.hypot(sx, sy);
  if (len > P.pebbleSlopeMax) { sx *= P.pebbleSlopeMax / len; sy *= P.pebbleSlopeMax / len; }
  return { slopeX: sx, slopeY: sy, tone };
}
/** Applies the micro slope to a unit normal (local X east, Y north, Z up) and renormalises. */
export function perturbNormal(normal, slopeX, slopeY) {
  const x = normal[0] - slopeX * normal[2];
  const y = normal[1] - slopeY * normal[2];
  const z = normal[2];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/** 0 on gentle ground → 1 on steep ground, from the tangent of the PHYSICAL slope. Monotone. */
export const terrainSlopeWeight = (tanSlope) => smoothstep(P.slopeTanStart, P.slopeTanEnd, Math.max(tanSlope, 0));
/** tan(slope) from the physical (exaggeration-undone) normal's Z component. */
export const tanSlopeFromNormalZ = (nz) => Math.sqrt(Math.max(1 - nz * nz, 0)) / Math.max(nz, 0.05);
export const slopeRoughness = (slopeWeight) => 1 + P.slopeRoughnessGain * slopeWeight;
export const slopeAlbedoFactor = (slopeWeight) => 1 - P.slopeDarkening * slopeWeight;

/** Elevation ramp (linear albedo) for `elevFrac` 0..1 (sunum palette). */
export function paletteAlbedo(elevFrac) {
  const f = clamp(elevFrac, 0, 1);
  const a = f < 0.5 ? PALETTE_LINEAR.basin : PALETTE_LINEAR.delta;
  const b = f < 0.5 ? PALETTE_LINEAR.delta : PALETTE_LINEAR.ridge;
  const t = f < 0.5 ? f * 2 : (f - 0.5) * 2;
  return a.map((v, i) => mix(v, b[i], t));
}

// ---------- ortho luminance + palette chroma ----------
/** Relative luminance gain for an ortho texel value (display gray 0..1), centred on 1 near mid gray. */
export const orthoGain = (gray) => mix(P.orthoGainMin, P.orthoGainMax, clamp(gray, 0, 1));
/** Smooth ortho coverage weight from UV (0..1 inside) and texel alpha: 0 outside, 1 well inside. */
export function orthoCoverage(u, v, alpha = 1) {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return 0;
  const edge = Math.min(u, 1 - u, v, 1 - v);
  return smoothstep(0, P.orthoEdgeUv, edge) * smoothstep(P.orthoAlphaLow, P.orthoAlphaHigh, alpha);
}
/**
 * Final diffuse albedo: palette chroma × luminance. Without ortho (coverage 0) the palette luminance is
 * kept (pure DTM colourisation). With ortho the luminance becomes ORTHO_MID_LUMA × gain, the chroma stays
 * the palette's. `monochrome` (pure-ortho mode) drops the chroma to neutral gray at the same luminance.
 */
export function combineAlbedo(paletteRgb, coverage, gain, monochrome = false) {
  const lp = Math.max(lumaOf(paletteRgb), 1e-5);
  const target = mix(lp, ORTHO_MID_LUMA * gain, clamp(coverage, 0, 1));
  const chroma = monochrome ? [1, 1, 1].map((v) => v * lp) : paletteRgb;
  const chromaLuma = Math.max(lumaOf(chroma), 1e-5);
  const k = target / chromaLuma;
  return [chroma[0] * k, chroma[1] * k, chroma[2] * k];
}
/**
 * Fraction of the haze colour mixed in at distance `edgeDistM` from the mesh border (1 at the border),
 * only for fragments viewed from far away (`viewDistM`). Interior no-data gaps are never affected.
 */
export const meshEdgeFade = (edgeDistM, viewDistM) =>
  (1 - smoothstep(0, P.meshEdgeFadeM, edgeDistM)) * smoothstep(P.meshEdgeFadeViewStartM, P.meshEdgeFadeViewEndM, viewDistM);

// ---------- GLSL generation from the same constants ----------
const f = (value) => {
  if (!Number.isFinite(value)) throw new RangeError('GLSL constant must be finite');
  let s = value.toFixed(8).replace(/0+$/, '');
  if (s.endsWith('.')) s += '0';
  return s;
};
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;

const octaveGlsl = P.octaves.map((o, i) => `
  {
    float fade = 1.0 - smoothstep(${f(o.wavelengthM * P.fadeStartPerWavelength)}, ${f(o.wavelengthM * P.fadeEndPerWavelength)}, dist);
    if (fade > 0.0) {
      vec3 n = terrainValueNoiseD(xy / ${f(o.wavelengthM)} + vec2(${f(i * MICRO_OCTAVE_SEED_STEP[0])}, ${f(i * MICRO_OCTAVE_SEED_STEP[1])}));
      float k = ${f(o.slopeAmp)} * roughness * fade / ${f(MICRO_DERIVATIVE_BOUND)};
      slope += n.yz * k;
      tone += ${f(o.toneAmp)} * fade * (2.0 * n.x - 1.0);
    }
  }`).join('');

const pebbleGlsl = P.pebbles.map((L) => `
  {
    float fade = 1.0 - smoothstep(${f(L.fadeStartM)}, ${f(L.fadeEndM)}, dist);
    if (fade > 0.0) {
      vec2 p = xy / ${f(L.cellM)};
      ivec2 ic = ivec2(floor(p));
      vec2 fr = p - vec2(ic);
      vec2 c = vec2(0.3 + 0.4 * terrainPebbleRand(ic, 1), 0.3 + 0.4 * terrainPebbleRand(ic, 2));
      float rw = (0.5 + 0.5 * terrainPebbleRand(ic, 3)) * ${f(L.radiusM)};
      if (terrainPebbleRand(ic, 4) < ${f(L.density)}) {
        vec2 dw = (fr - c) * ${f(L.cellM)};
        float d = length(dw) / rw;
        float shade = (terrainPebbleRand(ic, 5) - 0.5) * 2.0;
        if (d < 1.0) {
          float h = max(sqrt(1.0 - d * d), 0.3);
          slope += -${f(P.pebbleHeightPerRadius)} / h * fade * dw / rw;
          tone += ${f(L.toneAmp)} * shade * 0.8 * fade;
        } else if (d < 1.35) {
          tone -= 0.08 * (1.0 - smoothstep(1.0, 1.35, d)) * fade;
        }
      }
    }
  }`).join('');
export const TERRAIN_SHADING_GLSL = `
const vec3 TERRAIN_BASIN = ${v3(PALETTE_LINEAR.basin)};
const vec3 TERRAIN_DELTA = ${v3(PALETTE_LINEAR.delta)};
const vec3 TERRAIN_RIDGE = ${v3(PALETTE_LINEAR.ridge)};
const vec3 TERRAIN_BEDROCK = ${v3(PALETTE_LINEAR.bedrock)};
const float ORTHO_MID_LUMA = ${f(ORTHO_MID_LUMA)};

uint terrainHash(ivec2 cell) {
  uvec2 v = uvec2(cell);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v.x;
}
float terrainHashUnit(ivec2 cell) { return float(terrainHash(cell) >> 8u) / 16777216.0; }
// x = value (0..1), yz = derivative wrt cell coordinates.
vec3 terrainValueNoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = p - i;
  vec2 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * fr * fr * (fr * (fr - 2.0) + 1.0);
  ivec2 ic = ivec2(i);
  float a = terrainHashUnit(ic);
  float b = terrainHashUnit(ic + ivec2(1, 0));
  float c = terrainHashUnit(ic + ivec2(0, 1));
  float d = terrainHashUnit(ic + ivec2(1, 1));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du.x * (k1 + k4 * u.y), du.y * (k2 + k4 * u.x));
}
// Procedural micro detail (görsel detay, veri değildir): world-fixed, deterministic, distance-faded.
void terrainMicro(vec2 xy, float dist, float roughness, out vec2 slope, out float tone) {
  slope = vec2(0.0);
  tone = 0.0;${octaveGlsl}
  float len = length(slope);
  if (len > ${f(P.microSlopeMax)}) slope *= ${f(P.microSlopeMax)} / len;
}
float terrainPebbleRand(ivec2 cell, int k) { return terrainHashUnit(cell + ivec2(7919 * k, 104729 * k)); }
// Pebble/gravel scatter (gorsel detay, veri degildir): world-fixed, deterministic, distance-faded. Mirrors pebbleDetail().
void terrainPebbles(vec2 xy, float dist, out vec2 slope, out float tone) {
  slope = vec2(0.0);
  tone = 0.0;${pebbleGlsl}
  float len = length(slope);
  if (len > ${f(P.pebbleSlopeMax)}) slope *= ${f(P.pebbleSlopeMax)} / len;
}
vec3 terrainPerturbNormal(vec3 n, vec2 slope) {
  return normalize(vec3(n.xy - slope * n.z, n.z));
}
float terrainSlopeWeight(float tanSlope) {
  return smoothstep(${f(P.slopeTanStart)}, ${f(P.slopeTanEnd)}, max(tanSlope, 0.0));
}
vec3 terrainPalette(float elevFrac) {
  float e = clamp(elevFrac, 0.0, 1.0);
  return e < 0.5 ? mix(TERRAIN_BASIN, TERRAIN_DELTA, e * 2.0) : mix(TERRAIN_DELTA, TERRAIN_RIDGE, (e - 0.5) * 2.0);
}
float orthoGain(float gray) {
  return mix(${f(P.orthoGainMin)}, ${f(P.orthoGainMax)}, clamp(gray, 0.0, 1.0));
}
float orthoCoverage(vec2 uv, float alpha) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, ${f(P.orthoEdgeUv)}, edge) * smoothstep(${f(P.orthoAlphaLow)}, ${f(P.orthoAlphaHigh)}, alpha);
}
vec3 terrainCombineAlbedo(vec3 paletteRgb, float coverage, float gain, bool monochrome) {
  float lp = max(dot(paletteRgb, LUMA709), 0.00001);
  float target = mix(lp, ORTHO_MID_LUMA * gain, clamp(coverage, 0.0, 1.0));
  vec3 chroma = monochrome ? vec3(lp) : paletteRgb;
  return chroma * (target / max(dot(chroma, LUMA709), 0.00001));
}
float terrainMeshEdgeFade(float edgeDistM, float viewDistM) {
  return (1.0 - smoothstep(0.0, ${f(P.meshEdgeFadeM)}, edgeDistM)) *
    smoothstep(${f(P.meshEdgeFadeViewStartM)}, ${f(P.meshEdgeFadeViewEndM)}, viewDistM);
}
`;
