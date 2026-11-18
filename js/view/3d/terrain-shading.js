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
  // Reference look: Perseverance raw-image ground (ochre-tan fine regolith, darker basaltic stones, pale dust).
  basinSrgb: Object.freeze([0.52, 0.37, 0.27]),
  deltaSrgb: Object.freeze([0.66, 0.47, 0.34]),
  ridgeSrgb: Object.freeze([0.77, 0.57, 0.42]),
  // Steep, rougher basaltic bedrock tone: dark grey-brown (sunum).
  bedrockSrgb: Object.freeze([0.27, 0.22, 0.19]),
  // Converts the sRGB palette to a linear diffuse reflectance of plausible magnitude (sunum).
  albedoScale: 0.70,
  // Fraction of the palette's linear chroma kept, at constant luminance (sunum). The warm sky ambient multiplies
  // the albedo's R/B ratio several times over; without this the ground rendered at saturation ~0.85 (red-orange).
  // 0.20 brings the rendered mid tone to ~0.55-0.6 saturation (butterscotch/regolith), measured in the browser.
  paletteChromaKeep: 0.30,
  // Real-slope weighting (tan of the *physical* slope, exaggeration undone): 10° … 35° (sunum).
  slopeTanStart: Math.tan((10 * Math.PI) / 180),
  slopeTanEnd: Math.tan((35 * Math.PI) / 180),
  slopeBedrockMix: 0.55,
  slopeDarkening: 0.30,
  slopeRoughnessGain: 0.60,
  // Micro detail octaves (görsel detay, veri değildir). slopeAmp is the max per-axis slope perturbation
  // of that octave; toneAmp is the max relative albedo change.
  // Tone amplitudes raised so the near field (0-20 m) shows grain and mottling; still below ~±12 % per octave.
  // Wavelengths are mutually irrational-ish and each octave is sampled in its own rotated frame (rotRad), so
  // the value-noise lattices never line up with each other or with the world axes.
  octaves: Object.freeze([
    Object.freeze({ wavelengthM: 0.173, slopeAmp: 0.40, toneAmp: 0.18, rotRad: 0.0 }),
    Object.freeze({ wavelengthM: 0.587, slopeAmp: 0.22, toneAmp: 0.14, rotRad: 0.83 }),
    Object.freeze({ wavelengthM: 2.21, slopeAmp: 0.10, toneAmp: 0.07, rotRad: 1.91 }),
    Object.freeze({ wavelengthM: 7.13, slopeAmp: 0.05, toneAmp: 0.08, rotRad: 2.73 }),
  ]),
  // Wind-ripple micro texture on dusty ground (gorsel detay, veri degildir): faint, distance-faded, low on slopes.
  ripple: Object.freeze({ wavelengthM: 0.41, windRad: 0.61, slopeAmp: 0.07, toneAmp: 0.035, fadeStartM: 5, fadeEndM: 22 }),
  // Polygonal desiccation/thermal cracks on hard ground (Worley edge distance on a warped, rotated lattice).
  crack: Object.freeze({ cellM: 1.17, rotRad: 0.37, widthCell: 0.05, toneAmp: 0.22, fadeStartM: 5, fadeEndM: 15 }),
  // An octave fades out between wavelength×start and wavelength×end metres from the camera, i.e. before
  // its features fall below ~2 px (≈0.0019 rad/px for the 80° first-person FOV at ~900 px).
  fadeStartPerWavelength: 50,
  fadeEndPerWavelength: 220,
  // Pebble/gravel scatter (gorsel detay, veri degildir): world-fixed deterministic discs, one per jittered grid cell.
  // Each layer: cell size, max pebble radius (<= 0.22 cell so pebble + contact ring stay inside the cell), presence
  // probability, relative tone amplitude, and the distance range over which the layer fades out (metres).
  // Every stone layer sits on its own rotated (rotRad) and offset (ox, oy) lattice with a gentle sinusoidal warp, its
  // stones are elliptical (elong) with random orientation and faceted outline (facet), and its density is
  // modulated by the shared "stony patch" field (clump 0..1) and by slope (slopeBoost): clusters and bare dusty
  // gaps instead of an even scatter. The finest layer imitates the dense mm-cm granules seen in rover close-ups.
  pebbles: Object.freeze([
    Object.freeze({ cellM: 0.30, radiusM: 0.066, density: 0.62, toneAmp: 0.30, fadeStartM: 8, fadeEndM: 24, rotRad: 0.41, ox: 13.7, oy: 5.3, elong: 0.7, facet: 0.14, clump: 0.7, slopeBoost: 0.5 }),
    Object.freeze({ cellM: 0.95, radiusM: 0.20, density: 0.14, toneAmp: 0.24, fadeStartM: 20, fadeEndM: 60, rotRad: 1.37, ox: 41.1, oy: 77.9, elong: 0.9, facet: 0.16, clump: 0.8, slopeBoost: 0.7 }),
    Object.freeze({ cellM: 0.14, radiusM: 0.0308, density: 0.8, toneAmp: 0.30, fadeStartM: 4, fadeEndM: 14, rotRad: 2.26, ox: 3.9, oy: 29.3, warp: 0, elong: 0.4, facet: 0.1, clump: 0.5, slopeBoost: 0.3 }),
  ]),
  pebbleHeightPerRadius: 1.6,
  pebbleSlopeMax: 0.9,
  pebbleOrthoToneReduction: 0.85,

  // Rocks and scattered boulders (gorsel detay, veri degildir):
  // Medium stones and boulders: angular, elongated, mostly darker than the soil (basalt), with contact shadows.
  rocks: Object.freeze([
    Object.freeze({ cellM: 1.8, radiusM: 0.38, density: 0.30, toneAmp: 0.45, fadeStartM: 18, fadeEndM: 55, rotRad: 0.93, ox: 7.3, oy: 61.7, elong: 0.8, facet: 0.22, clump: 0.85, slopeBoost: 1.1 }),
    Object.freeze({ cellM: 4.8, radiusM: 1.02, density: 0.17, toneAmp: 0.45, fadeStartM: 30, fadeEndM: 95, rotRad: 2.11, ox: 88.3, oy: 19.1, elong: 0.7, facet: 0.24, clump: 0.9, slopeBoost: 1.4 }),
    Object.freeze({ cellM: 0.7, radiusM: 0.15, density: 0.34, toneAmp: 0.40, fadeStartM: 8, fadeEndM: 30, rotRad: 0.29, ox: 51.9, oy: 14.3, elong: 0.8, facet: 0.22, clump: 0.85, slopeBoost: 1.0 }),
  ]),
  rockHeightPerRadius: 1.4,
  rockSlopeMax: 0.9,
  rockOrthoToneReduction: 0.80,

  // Impact pits and small craters (gorsel detay, veri degildir):
  // Deterministic world-fixed bowl depressions with inward sloping walls, shaded interiors, and raised rims.
  // Rare, shallow, eroded and irregular (not a regular dimple field): large cells, low density, soft rims.
  craters: Object.freeze([
    Object.freeze({ cellM: 5.3, radiusM: 1.12, density: 0.13, depthAmp: 0.26, toneAmp: 0.10, fadeStartM: 15, fadeEndM: 65, rotRad: 0.71, ox: 23.1, oy: 9.7 }),
    Object.freeze({ cellM: 13.7, radiusM: 3.0, density: 0.10, depthAmp: 0.30, toneAmp: 0.12, fadeStartM: 30, fadeEndM: 120, rotRad: 1.83, ox: 57.7, oy: 31.3 }),
  ]),
  craterSlopeMax: 0.55,
  craterOrthoToneReduction: 0.75,

  // Surface dust mantle (gorsel detay, veri degildir):
  // Warm ferric oxide aeolian dust layer that settles on gentle slopes and hollows,
  // softening underlying texture pixels, mesh facets, and contrast seams.
  dustSrgb: Object.freeze([0.80, 0.64, 0.47]),
  dustBaseAmount: 0.34,
  dustDriftAmp: 0.20,
  dustSlopeCutoff: 0.70,
  dustWavelengthM: 8.5,

  // Hard cap on the total micro slope perturbation (|dh/dx,dh/dy| vector length).
  microSlopeMax: 0.60,
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
  dust: Object.freeze(paletteLinear(P.dustSrgb)),
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

/** Rotates (x, y) by `a` radians (mirrors terrainRot in GLSL). */
export const rot2 = (x, y, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
};

/**
 * Shared low-frequency "stony patch" field (JS mirror of the globals set in terrainApplyDust): 0 = smooth dusty
 * ground, 1 = stony hard ground. Large irrational wavelengths in two different rotated frames; no tiling.
 * Returns { patch, mottle } where `mottle` is the second noise value (large-scale wet/dry albedo variation).
 */
export function terrainFields(xM, yM) {
  const a = rot2(xM, yM, 0.52), b = rot2(xM, yM, -0.9);
  const pA = valueNoiseD(a[0] / 29.3 + 11.7, a[1] / 29.3 + 53.1).value;
  const pB = valueNoiseD(b[0] / 9.7 + 71.3, b[1] / 9.7 + 5.9).value;
  return { patch: smoothstep(0.30, 0.70, 0.62 * pA + 0.38 * pB), mottle: pB };
}

/** Distance weight of octave `i` at camera distance `distM` (1 near, 0 far). */
export const octaveFade = (i, distM) => 1 - smoothstep(
  P.octaves[i].wavelengthM * P.fadeStartPerWavelength,
  P.octaves[i].wavelengthM * P.fadeEndPerWavelength,
  Math.max(distM, 0),
);

/** Worley edge distance F2 - F1 (grid units) at (px, py); 2x2 nearest-quadrant cells (jitter kept in 0.2..0.8), one hash per cell. */
export function worleyEdge(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const sx = fx < 0.5 ? -1 : 0, sy = fy < 0.5 ? -1 : 0;
  let f1 = 8, f2 = 8;
  for (let j = sy; j <= sy + 1; j++) {
    for (let i = sx; i <= sx + 1; i++) {
      const h = hash2(ix + i + 911, iy + j + 577);
      const jx = 0.2 + 0.6 * (((h >>> 8) & 4095) / 4096), jy = 0.2 + 0.6 * ((h >>> 20) / 4096);
      const dx = i + jx - fx, dy = j + jy - fy;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return Math.sqrt(f2) - Math.sqrt(f1);
}

/**
 * Procedural micro detail at local world position (xM, yM) seen from `distM`. `roughness` >= 1 scales the
 * slope amplitude (steeper terrain is rougher). Deterministic, fixed to world coordinates.
 * Returns the slope perturbation (dh/dx, dh/dy), a relative tone offset and the octave weights.
 * Besides the value-noise octaves it adds wind ripples (dusty ground) and polygonal cracks (hard ground).
 */
export function microDetail(xM, yM, distM, roughness = 1, fields = terrainFields(xM, yM)) {
  let sx = 0, sy = 0, tone = 0;
  const weights = [];
  for (let i = 0; i < P.octaves.length; i++) {
    const o = P.octaves[i];
    const fade = octaveFade(i, distM);
    weights.push(fade);
    if (fade <= 0) continue;
    const r = rot2(xM, yM, o.rotRad);
    const n = valueNoiseD(r[0] / o.wavelengthM + i * MICRO_OCTAVE_SEED_STEP[0], r[1] / o.wavelengthM + i * MICRO_OCTAVE_SEED_STEP[1]);
    const k = (o.slopeAmp * roughness * fade) / MICRO_DERIVATIVE_BOUND;
    const g = rot2(n.dx, n.dy, -o.rotRad);
    sx += g[0] * k;
    sy += g[1] * k;
    tone += o.toneAmp * fade * (2 * n.value - 1);
  }
  const slopeW = clamp((roughness - 1) / P.slopeRoughnessGain, 0, 1);
  const R = P.ripple;
  const rm = (1 - smoothstep(0.3, 0.75, fields.patch)) * (1 - slopeW) * (1 - smoothstep(R.fadeStartM, R.fadeEndM, Math.max(distM, 0)));
  if (rm > 0.001) {
    const cw = Math.cos(R.windRad), sw = Math.sin(R.windRad);
    const warp = 0.5 + 0.5 * Math.sin(xM * 0.37 + yM * 0.29 + 1.3 * Math.sin(-xM * 0.21 + yM * 0.43));
    const phase = 6.2831853 * ((xM * cw + yM * sw) / R.wavelengthM + 1.7 * warp);
    const c = Math.cos(phase);
    sx += cw * c * R.slopeAmp * rm;
    sy += sw * c * R.slopeAmp * rm;
    tone += R.toneAmp * rm * c;
  }
  const C = P.crack;
  const cm = smoothstep(0.45, 0.75, fields.patch) * (1 - smoothstep(0.3, 0.7, slopeW)) * (1 - smoothstep(C.fadeStartM, C.fadeEndM, Math.max(distM, 0)));
  if (cm > 0.001) {
    const q = rot2(xM, yM, C.rotRad);
    let px = q[0] / C.cellM, py = q[1] / C.cellM;
    const wpx = px, wpy = py;
    px += 0.18 * (Math.sin(wpy * 0.83 + 0.7) + Math.sin(wpx * 0.41));
    py += 0.18 * (Math.sin(wpx * 0.77 + 1.9) + Math.sin(wpy * 0.43));
    const crack = 1 - smoothstep(0, C.widthCell, worleyEdge(px, py));
    tone -= C.toneAmp * crack * cm;
  }
  const len = Math.hypot(sx, sy);
  if (len > P.microSlopeMax) { sx *= P.microSlopeMax / len; sy *= P.microSlopeMax / len; }
  return { slopeX: sx, slopeY: sy, tone, weights };
}

/** Salted per-cell random in [0, 1): k selects the independent stream (mirrors terrainPebbleRand in GLSL). */
export const pebbleRand = (ix, iy, k) => hashUnit(ix + 7919 * k, iy + 104729 * k);
/** Salted per-cell random for rocks in [0, 1) (mirrors terrainRockRand in GLSL). */
export const rockRand = (ix, iy, k) => hashUnit(ix + 13001 * k, iy + 27011 * k);
/** Salted per-cell random for craters in [0, 1) (mirrors terrainCraterRand in GLSL). */
export const craterRand = (ix, iy, k) => hashUnit(ix + 3571 * k, iy + 49009 * k);

// Warped, rotated lattice shared by stone and crater layers (mirrors the GLSL `p` setup).
function layerLattice(L, xM, yM) {
  const r = rot2(xM, yM, L.rotRad);
  let px = r[0] / L.cellM + L.ox, py = r[1] / L.cellM + L.oy;
  const w = L.warp ?? 0.07;
  if (w > 0) {
    const qx = px, qy = py;
    px += w * (Math.sin(qy * 0.713 + 1.3) + Math.sin(qx * 0.291));
    py += w * (Math.sin(qx * 0.617 + 2.1) + Math.sin(qy * 0.337));
  }
  return [px, py];
}

const STONE_KINDS = {
  pebble: { rand: pebbleRand, hr: () => P.pebbleHeightPerRadius, hmin: 0.3, shadeK: 0.7, shadeB: -0.3, ring: 0.22, slopeMax: () => P.pebbleSlopeMax, layers: () => P.pebbles },
  rock: { rand: rockRand, hr: () => P.rockHeightPerRadius, hmin: 0.25, shadeK: 0.9, shadeB: -0.5, ring: 0.30, slopeMax: () => P.rockSlopeMax, layers: () => P.rocks },
};

function stoneDetail(kind, xM, yM, distM, slopeW, fields) {
  const K = STONE_KINDS[kind];
  let sx = 0, sy = 0, tone = 0;
  for (const L of K.layers()) {
    const fade = 1 - smoothstep(L.fadeStartM, L.fadeEndM, Math.max(distM, 0));
    if (fade <= 0) continue;
    const [px, py] = layerLattice(L, xM, yM);
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const dens = L.density * mix(1, 0.15 + 1.9 * fields.patch, L.clump) * (1 + L.slopeBoost * slopeW);
    if (K.rand(ix, iy, 4) >= dens) continue;
    const cx = 0.3 + 0.4 * K.rand(ix, iy, 1), cy = 0.3 + 0.4 * K.rand(ix, iy, 2);
    const rw = (0.45 + 0.55 * K.rand(ix, iy, 3)) * L.radiusM;
    const ang = K.rand(ix, iy, 6) * Math.PI;
    const bAx = 1 / (1 + L.elong * K.rand(ix, iy, 7));
    const q = rot2((fx - cx) * L.cellM, (fy - cy) * L.cellM, -ang);
    const qnx = q[0] / rw, qny = q[1] / (rw * bAx);
    const th = Math.atan2(qny, qnx);
    const angl = 1 + L.facet * (0.6 * Math.sin(th * 3 + K.rand(ix, iy, 8) * 6.2831853) + 0.4 * Math.cos(th * 5 + K.rand(ix, iy, 9) * 6.2831853));
    const d = Math.hypot(qnx, qny) / angl;
    const shade = (K.rand(ix, iy, 5) - 0.5) * 2;
    if (d < 1) {
      const h = Math.max(Math.sqrt(1 - d * d), K.hmin);
      const k = -K.hr() / h / angl;
      const s = rot2(k * qnx, k * qny / bAx, ang - L.rotRad);
      sx += s[0] * fade;
      sy += s[1] * fade;
      tone += L.toneAmp * (shade * K.shadeK + K.shadeB) * fade;
    } else if (d < 1.35) {
      tone -= K.ring * (1 - smoothstep(1, 1.35, d)) * fade;
    }
  }
  const len = Math.hypot(sx, sy);
  const cap = K.slopeMax();
  if (len > cap) { sx *= cap / len; sy *= cap / len; }
  return { slopeX: sx, slopeY: sy, tone };
}

/**
 * Pebble/gravel/granule scatter at local world position (xM, yM) seen from `distM` (JS mirror of the GLSL
 * terrainPebbles). Deterministic, world-fixed, fades with distance. Returns { slopeX, slopeY, tone }.
 * `slopeW` (0..1) raises the density on steep ground. Visual detail only: carries no terrain data.
 */
export function pebbleDetail(xM, yM, distM, slopeW = 0, fields = terrainFields(xM, yM)) {
  return stoneDetail('pebble', xM, yM, distM, slopeW, fields);
}

/**
 * Rock and boulder scatter (JS mirror of terrainRocks): angular, elongated, mostly darker basalt stones with a
 * contact-shadow ring. Visual detail only: carries no terrain data and never feeds routes or slope analysis.
 */
export function rockDetail(xM, yM, distM, slopeW = 0, fields = terrainFields(xM, yM)) {
  return stoneDetail('rock', xM, yM, distM, slopeW, fields);
}

/**
 * Rare shallow irregular pits (JS mirror of terrainCraters): eroded bowl with a faint soft rim, on a rotated,
 * warped lattice with a faceted (non-circular) outline. Visual detail only.
 */
export function craterDetail(xM, yM, distM, slopeW = 0, fields = terrainFields(xM, yM)) {
  let sx = 0, sy = 0, tone = 0;
  for (const L of P.craters) {
    const fade = 1 - smoothstep(L.fadeStartM, L.fadeEndM, Math.max(distM, 0));
    if (fade <= 0) continue;
    const [px, py] = layerLattice(L, xM, yM);
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    if (craterRand(ix, iy, 4) >= L.density * (1.3 - 0.6 * fields.patch) * (1 - 0.7 * slopeW)) continue;
    const cx = 0.32 + 0.36 * craterRand(ix, iy, 1), cy = 0.32 + 0.36 * craterRand(ix, iy, 2);
    const rw = (0.55 + 0.45 * craterRand(ix, iy, 3)) * L.radiusM;
    const dxw = (fx - cx) * L.cellM, dyw = (fy - cy) * L.cellM;
    const lenDw = Math.hypot(dxw, dyw);
    const th = Math.atan2(dyw, dxw);
    const angl = 1 + 0.22 * Math.sin(th * 3 + craterRand(ix, iy, 6) * 6.2831853) + 0.12 * Math.cos(th * 5 + craterRand(ix, iy, 7) * 6.2831853);
    const d = lenDw / (rw * angl);
    if (d < 1.35 && lenDw > 0.001) {
      const dirX = dxw / lenDw, dirY = dyw / lenDw;
      let ss = 0;
      if (d < 0.85) {
        ss = Math.sin(d * (Math.PI / 0.85)) * L.depthAmp;
        tone -= L.toneAmp * (0.4 + 0.6 * (1 - smoothstep(0, 0.85, d))) * fade;
      } else if (d < 1.15) {
        const rimT = (d - 0.85) / 0.30;
        ss = -Math.sin(rimT * Math.PI) * (L.depthAmp * 0.3);
        tone += L.toneAmp * (0.2 * Math.sin(rimT * Math.PI)) * fade;
      }
      const s = rot2(dirX * ss, dirY * ss, -L.rotRad);
      sx += s[0] * fade;
      sy += s[1] * fade;
    }
  }
  const len = Math.hypot(sx, sy);
  if (len > P.craterSlopeMax) { sx *= P.craterSlopeMax / len; sy *= P.craterSlopeMax / len; }
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
 * Applies the surface dust mantle and large-scale wet/dry mottling to the diffuse albedo (JS mirror of
 * terrainApplyDust). Pale yellowish ferric dust settles on gentle slopes and in smooth (low "stony patch")
 * areas and is shed on steep and stony ground; stony patches read slightly darker, dusty drifts lighter.
 */
export function applyDust(albedo, xM, yM, slopeW, distM, coverage = 0) {
  const { patch, mottle } = terrainFields(xM, yM);
  const slopeFactor = 1 - smoothstep(0.15, P.dustSlopeCutoff, slopeW);
  const dr = rot2(xM, yM, 1.21);
  const nDrift = valueNoiseD(dr[0] / P.dustWavelengthM + 17.3, dr[1] / P.dustWavelengthM + 41.9);
  const nFine = valueNoiseD(xM / 0.45 + 83.1, yM / 0.45 + 19.7);
  const fineGrain = (nFine.value - 0.5) * 0.10 * (1 - smoothstep(4.0, 22.0, distM));
  const drift = (nDrift.value - 0.5) * 2.0;
  let dustFraction = clamp((P.dustBaseAmount + P.dustDriftAmp * drift) * (1.3 - 0.8 * patch), 0.0, 0.85);
  dustFraction = clamp(dustFraction * slopeFactor + fineGrain, 0.0, 0.90);
  const dust = PALETTE_LINEAR.dust;
  const mott = 1 + 0.14 * (mottle - 0.5) - 0.08 * patch;
  return albedo.map((c, i) => (c * (1 - dustFraction) + dust[i] * dustFraction) * mott);
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
      vec3 n = terrainValueNoiseD(terrainRot(xy, ${f(o.rotRad)}) / ${f(o.wavelengthM)} + vec2(${f(i * MICRO_OCTAVE_SEED_STEP[0])}, ${f(i * MICRO_OCTAVE_SEED_STEP[1])}));
      float k = ${f(o.slopeAmp)} * roughness * fade / ${f(MICRO_DERIVATIVE_BOUND)};
      slope += terrainRot(n.yz, ${f(-o.rotRad)}) * k;
      tone += ${f(o.toneAmp)} * fade * (2.0 * n.x - 1.0);
    }
  }`).join('');

const latticeGlsl = (L) => `
      vec2 p = terrainRot(xy, ${f(L.rotRad)}) / ${f(L.cellM)} + vec2(${f(L.ox)}, ${f(L.oy)});
${(L.warp ?? 0.07) > 0 ? `
      p += vec2(${f(L.warp ?? 0.07)} * (sin(p.y * 0.713 + 1.3) + sin(p.x * 0.291)), ${f(L.warp ?? 0.07)} * (sin(p.x * 0.617 + 2.1) + sin(p.y * 0.337)));` : ""}
      ivec2 ic = ivec2(floor(p));
      vec2 fr = p - vec2(ic);`;

const stoneGlsl = (layers, rand, K) => layers.map((L) => `
  {
    float fade = 1.0 - smoothstep(${f(L.fadeStartM)}, ${f(L.fadeEndM)}, dist);
    if (fade > 0.0) {${latticeGlsl(L)}
      float dens = ${f(L.density)} * mix(1.0, 0.15 + 1.9 * gTerrainPatch, ${f(L.clump)}) * (1.0 + ${f(L.slopeBoost)} * gTerrainSlopeW);
      if (${rand}(ic, 4) < dens) {
        vec2 c = vec2(0.3 + 0.4 * ${rand}(ic, 1), 0.3 + 0.4 * ${rand}(ic, 2));
        float rw = (0.45 + 0.55 * ${rand}(ic, 3)) * ${f(L.radiusM)};
        float ang = ${rand}(ic, 6) * 3.14159265;
        float bAx = 1.0 / (1.0 + ${f(L.elong)} * ${rand}(ic, 7));
        vec2 q = terrainRot((fr - c) * ${f(L.cellM)}, -ang);
        vec2 qn = vec2(q.x / rw, q.y / (rw * bAx));
        float th = atan(qn.y, qn.x);
        float angl = 1.0 + ${f(L.facet)} * (0.6 * sin(th * 3.0 + ${rand}(ic, 8) * 6.2831853) + 0.4 * cos(th * 5.0 + ${rand}(ic, 9) * 6.2831853));
        float d = length(qn) / angl;
        float shade = (${rand}(ic, 5) - 0.5) * 2.0;
        if (d < 1.0) {
          float h = max(sqrt(1.0 - d * d), ${f(K.hmin)});
          float k = -${f(K.hr)} / h / angl;
          slope += terrainRot(vec2(k * qn.x, k * qn.y / bAx), ang - ${f(L.rotRad)}) * fade;
          tone += ${f(L.toneAmp)} * (shade * ${f(K.shadeK)} + ${f(K.shadeB)}) * fade;
        } else if (d < 1.35) {
          tone -= ${f(K.ring)} * (1.0 - smoothstep(1.0, 1.35, d)) * fade;
        }
      }
    }
  }`).join('');

const pebbleGlsl = stoneGlsl(P.pebbles, 'terrainPebbleRand', { hr: P.pebbleHeightPerRadius, hmin: 0.3, shadeK: 0.7, shadeB: -0.3, ring: 0.22 });
const rockGlsl = stoneGlsl(P.rocks, 'terrainRockRand', { hr: P.rockHeightPerRadius, hmin: 0.25, shadeK: 0.9, shadeB: -0.5, ring: 0.30 });

const craterGlsl = P.craters.map((L) => `
  {
    float fade = 1.0 - smoothstep(${f(L.fadeStartM)}, ${f(L.fadeEndM)}, dist);
    if (fade > 0.0) {${latticeGlsl(L)}
      if (terrainCraterRand(ic, 4) < ${f(L.density)} * (1.3 - 0.6 * gTerrainPatch) * (1.0 - 0.7 * gTerrainSlopeW)) {
        vec2 c = vec2(0.32 + 0.36 * terrainCraterRand(ic, 1), 0.32 + 0.36 * terrainCraterRand(ic, 2));
        float rw = (0.55 + 0.45 * terrainCraterRand(ic, 3)) * ${f(L.radiusM)};
        vec2 dw = (fr - c) * ${f(L.cellM)};
        float lenDw = length(dw);
        float th = atan(dw.y, dw.x);
        float angl = 1.0 + 0.22 * sin(th * 3.0 + terrainCraterRand(ic, 6) * 6.2831853) + 0.12 * cos(th * 5.0 + terrainCraterRand(ic, 7) * 6.2831853);
        float d = lenDw / (rw * angl);
        if (d < 1.35 && lenDw > 0.001) {
          vec2 dir = dw / lenDw;
          float ss = 0.0;
          if (d < 0.85) {
            ss = sin(d * (3.14159265 / 0.85)) * ${f(L.depthAmp)};
            tone -= ${f(L.toneAmp)} * (0.4 + 0.6 * (1.0 - smoothstep(0.0, 0.85, d))) * fade;
          } else if (d < 1.15) {
            float rimT = (d - 0.85) / 0.30;
            ss = -sin(rimT * 3.14159265) * (${f(L.depthAmp)} * 0.3);
            tone += ${f(L.toneAmp)} * (0.2 * sin(rimT * 3.14159265)) * fade;
          }
          slope += terrainRot(dir * ss, ${f(-L.rotRad)}) * fade;
        }
      }
    }
  }`).join('');

export const TERRAIN_SHADING_GLSL = `
const vec3 TERRAIN_BASIN = ${v3(PALETTE_LINEAR.basin)};
const vec3 TERRAIN_DELTA = ${v3(PALETTE_LINEAR.delta)};
const vec3 TERRAIN_RIDGE = ${v3(PALETTE_LINEAR.ridge)};
const vec3 TERRAIN_BEDROCK = ${v3(PALETTE_LINEAR.bedrock)};
const vec3 TERRAIN_DUST = ${v3(PALETTE_LINEAR.dust)};
const float ORTHO_MID_LUMA = ${f(ORTHO_MID_LUMA)};

// Per-fragment surface fields, written by terrainApplyDust (always evaluated first in the terrain pass) and read
// by the detail layers: gTerrainPatch 0 = smooth dusty ground .. 1 = stony hard ground; gTerrainSlopeW = slope weight.
float gTerrainPatch = 0.5;
float gTerrainSlopeW = 0.0;

vec2 terrainRot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}
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
// Worley edge distance F2 - F1 in grid units (2x2 nearest-quadrant cells, one hash each).
float terrainWorleyEdge(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = p - ip;
  ivec2 ic = ivec2(ip);
  int sx = fp.x < 0.5 ? -1 : 0;
  int sy = fp.y < 0.5 ? -1 : 0;
  float f1 = 8.0, f2 = 8.0;
  for (int j = sy; j <= sy + 1; j++) {
    for (int i = sx; i <= sx + 1; i++) {
      uint h = terrainHash(ic + ivec2(i + 911, j + 577));
      vec2 o = 0.2 + 0.6 * vec2(float((h >> 8u) & 4095u), float(h >> 20u)) / 4096.0;
      vec2 dv = vec2(float(i), float(j)) + o - fp;
      float d = dot(dv, dv);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(f2) - sqrt(f1);
}
// Procedural micro detail (görsel detay, veri değildir): world-fixed, deterministic, distance-faded.
// Value-noise octaves in rotated frames + wind ripples on dusty ground + polygonal cracks on hard ground.
void terrainMicro(vec2 xy, float dist, float roughness, out vec2 slope, out float tone) {
  slope = vec2(0.0);
  tone = 0.0;${octaveGlsl}
  float slopeW = clamp((roughness - 1.0) / ${f(P.slopeRoughnessGain)}, 0.0, 1.0);
  float rm = (1.0 - smoothstep(0.3, 0.75, gTerrainPatch)) * (1.0 - slopeW) * (1.0 - smoothstep(${f(P.ripple.fadeStartM)}, ${f(P.ripple.fadeEndM)}, dist));
  if (rm > 0.01) {
    vec2 wd = vec2(${f(Math.cos(P.ripple.windRad))}, ${f(Math.sin(P.ripple.windRad))});
    float warp = 0.5 + 0.5 * sin(dot(xy, vec2(0.37, 0.29)) + 1.3 * sin(dot(xy, vec2(-0.21, 0.43))));
    float c = cos(6.2831853 * (dot(xy, wd) / ${f(P.ripple.wavelengthM)} + 1.7 * warp));
    slope += wd * (c * ${f(P.ripple.slopeAmp)} * rm);
    tone += ${f(P.ripple.toneAmp)} * rm * c;
  }
  float cm = smoothstep(0.45, 0.75, gTerrainPatch) * (1.0 - smoothstep(0.3, 0.7, slopeW)) * (1.0 - smoothstep(${f(P.crack.fadeStartM)}, ${f(P.crack.fadeEndM)}, dist));
  if (cm > 0.01) {
    vec2 w = terrainRot(xy, ${f(P.crack.rotRad)}) / ${f(P.crack.cellM)};
    vec2 pw = w + 0.18 * vec2(sin(w.y * 0.83 + 0.7) + sin(w.x * 0.41), sin(w.x * 0.77 + 1.9) + sin(w.y * 0.43));
    tone -= ${f(P.crack.toneAmp)} * (1.0 - smoothstep(0.0, ${f(P.crack.widthCell)}, terrainWorleyEdge(pw))) * cm;
  }
  float len = length(slope);
  if (len > ${f(P.microSlopeMax)}) slope *= ${f(P.microSlopeMax)} / len;
}
float terrainPebbleRand(ivec2 cell, int k) { return terrainHashUnit(cell + ivec2(7919 * k, 104729 * k)); }
// Pebble/gravel/granule scatter (gorsel detay, veri degildir): world-fixed, deterministic, distance-faded. Mirrors pebbleDetail().
void terrainPebbles(vec2 xy, float dist, out vec2 slope, out float tone) {
  slope = vec2(0.0);
  tone = 0.0;${pebbleGlsl}
  float len = length(slope);
  if (len > ${f(P.pebbleSlopeMax)}) slope *= ${f(P.pebbleSlopeMax)} / len;
}
float terrainRockRand(ivec2 cell, int k) { return terrainHashUnit(cell + ivec2(13001 * k, 27011 * k)); }
// Rock and boulder scatter (görsel detay, veri değildir): world-fixed, deterministic, distance-faded. Mirrors rockDetail().
void terrainRocks(vec2 xy, float dist, out vec2 slope, out float tone) {
  slope = vec2(0.0);
  tone = 0.0;${rockGlsl}
  float len = length(slope);
  if (len > ${f(P.rockSlopeMax)}) slope *= ${f(P.rockSlopeMax)} / len;
}
float terrainCraterRand(ivec2 cell, int k) { return terrainHashUnit(cell + ivec2(3571 * k, 49009 * k)); }
// Rare shallow irregular pits (görsel detay, veri değildir): world-fixed, deterministic, distance-faded. Mirrors craterDetail().
void terrainCraters(vec2 xy, float dist, out vec2 slope, out float tone) {
  slope = vec2(0.0);
  tone = 0.0;${craterGlsl}
  float len = length(slope);
  if (len > ${f(P.craterSlopeMax)}) slope *= ${f(P.craterSlopeMax)} / len;
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
// Surface dust mantle + wet/dry mottling (görsel detay, veri değildir). Also publishes gTerrainPatch / gTerrainSlopeW
// for the detail layers (stony patches, slope-dependent rock density, ripples, cracks).
vec3 terrainApplyDust(vec3 albedo, vec2 xy, float slopeW, float dist, float coverage) {
  gTerrainSlopeW = slopeW;
  float pA = terrainValueNoiseD(terrainRot(xy, 0.52) / 29.3 + vec2(11.7, 53.1)).x;
  float pB = terrainValueNoiseD(terrainRot(xy, -0.9) / 9.7 + vec2(71.3, 5.9)).x;
  float stony = smoothstep(0.30, 0.70, 0.62 * pA + 0.38 * pB);
  gTerrainPatch = stony;
  float slopeFactor = 1.0 - smoothstep(0.15, ${f(P.dustSlopeCutoff)}, slopeW);
  vec3 nDrift = terrainValueNoiseD(terrainRot(xy, 1.21) / ${f(P.dustWavelengthM)} + vec2(17.3, 41.9));
  vec3 nFine = terrainValueNoiseD(xy / 0.45 + vec2(83.1, 19.7));
  float fineGrain = (nFine.x - 0.5) * 0.10 * (1.0 - smoothstep(4.0, 22.0, dist));
  float drift = (nDrift.x - 0.5) * 2.0;
  float dustFraction = clamp((${f(P.dustBaseAmount)} + ${f(P.dustDriftAmp)} * drift) * (1.3 - 0.8 * stony), 0.0, 0.85);
  dustFraction = clamp(dustFraction * slopeFactor + fineGrain, 0.0, 0.90);
  return mix(albedo, TERRAIN_DUST, dustFraction) * (1.0 + 0.14 * (pB - 0.5) - 0.08 * stony);
}
float terrainMeshEdgeFade(float edgeDistM, float viewDistM) {
  return (1.0 - smoothstep(0.0, ${f(P.meshEdgeFadeM)}, edgeDistM)) *
    smoothstep(${f(P.meshEdgeFadeViewStartM)}, ${f(P.meshEdgeFadeViewEndM)}, viewDistM);
}
`;
