// Pure Mars sky / sunlight / tone-mapping model shared by the WebGL2 renderer (GLSL) and tests (JS).
// No DOM, no WebGL, no state. Every constant is defined once here; the GLSL source below is generated
// from the same numbers, so the JS mirror functions and the shader evaluate the same formula.
//
// Units: all radiance/irradiance values are *relative linear RGB* (0..1 scene units before exposure),
// not calibrated W/m²/sr. Colours tagged "presentation" are visual approximations chosen for this
// viewer, not measurements from rover images. Only the sun's apparent size is computed from sources.
//
// Sources (re-read in Stage Visual A, Nov 2026):
// - NASA NSSDC Mars Fact Sheet: semimajor axis 1.52366231 AU (the module uses the rounded 1.524; the
//   difference changes the sun diameter by <0.1 %):
//   https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
// - NASA NSSDC Sun Fact Sheet: apparent diameter at 1 AU = 1919 arcsec (max 1952, min 1887):
//   https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html
// - NASA Photojournal PIA19400 "Sunset in Mars' Gale Crater" caption: "Dust in the Martian atmosphere has
//   fine particles that permit blue light to penetrate the atmosphere more efficiently"; blue colours stay
//   "closer to sun's part of the sky"; "The effect is most pronounced near sunset":
//   https://science.nasa.gov/photojournal/sunset-in-mars-gale-crater
//   (The caption supports only the qualitative behaviour. It gives no numbers for colours or intensities.)
// - Tone curve: K. Narkowicz, "ACES Filmic Tone Mapping Curve" (fitted approximation, 2016):
//   https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/  (not re-read here;
//   standard published coefficients, labelled as a rendering convention, not Mars science).
// - sRGB transfer function (IEC 61966-2-1) and Rec.709 luma weights: standard colour conventions.

const ARCSEC_TO_RAD = Math.PI / (180 * 3600);

/** NSSDC Sun fact sheet: apparent solar diameter seen from 1 AU, arcseconds. */
export const SUN_APPARENT_DIAMETER_AT_1AU_ARCSEC = 1919;
/** NSSDC Mars fact sheet: Mars/Earth semimajor-axis ratio (mean Mars–Sun distance in AU). */
export const MARS_MEAN_SUN_DISTANCE_AU = 1.524;
/** Derived: mean apparent solar diameter from Mars ≈ 1259″ ≈ 21.0′ (1919″ / 1.524). */
export const MARS_SUN_ANGULAR_DIAMETER_ARCMIN = SUN_APPARENT_DIAMETER_AT_1AU_ARCSEC / MARS_MEAN_SUN_DISTANCE_AU / 60;
/** Derived angular radius in radians (≈ 0.00305 rad). Orbit eccentricity (±~9 %) is ignored. */
export const MARS_SUN_ANGULAR_RADIUS_RAD = (SUN_APPARENT_DIAMETER_AT_1AU_ARCSEC / MARS_MEAN_SUN_DISTANCE_AU / 2) * ARCSEC_TO_RAD;

/**
 * Presentation parameters. Colours are linear RGB in relative scene units; NONE is a measured value.
 * The qualitative behaviour (butterscotch day sky, bluish forward-scattered glow concentrated around a
 * low sun, reddish sky away from it) follows the PIA19400 caption; magnitudes are visual approximations.
 */
export const SKY_PARAMS = Object.freeze({
  // Day sky gradient (sun high). Presentation: butterscotch zenith/horizon.
  zenithHigh: Object.freeze([0.138, 0.079, 0.056]),
  horizonHigh: Object.freeze([0.52, 0.215, 0.12]),
  // Low-sun sky gradient (sun near horizon): darker, redder away from the sun. Presentation.
  zenithLow: Object.freeze([0.05, 0.032, 0.03]),
  horizonLow: Object.freeze([0.30, 0.12, 0.07]),
  // Night floor so the dome never goes to exact black. Presentation.
  night: Object.freeze([0.004, 0.004, 0.006]),
  // sin(sun elevation) range over which the gradient switches from "low" to "high". Presentation.
  lowSunStart: 0.0,
  lowSunEnd: 0.45,
  // Twilight: sky light fades between these sin(elevation) values (≈ −8° … +3.4°). Presentation.
  twilightStart: -0.14,
  twilightEnd: 0.06,
  // Gradient exponent (larger → thinner bright horizon band). Presentation.
  horizonExponent: 2.6,
  // Below-horizon haze relative to the horizon colour. Presentation.
  groundHazeScale: 0.72,
  // Extra dust band hugging the horizon. Presentation.
  horizonDustStrength: 0.10,
  horizonDustSharpness: 14.0,
  // Forward-scattering aureole: Henyey–Greenstein lobes normalised to 1 at the sun. Presentation.
  // Narrow lobes (g close to 1) and modest strength: a thin dust-scatter ring around the disc, not a broad glare.
  haloWarmColor: Object.freeze([0.90, 0.62, 0.40]),
  haloWarmG: 0.94,
  haloWarmIntensity: 0.15,
  // Tight bluish lobe that strengthens as the sun lowers (PIA19400 qualitative behaviour). Presentation.
  haloBlueColor: Object.freeze([0.30, 0.48, 0.85]),
  haloBlueG: 0.97,
  haloBlueIntensity: 0.30,
  // Direct sunlight. Relative units chosen so the full scene sits in 0..1 before the tone curve.
  sunColor: Object.freeze([1.0, 0.93, 0.82]), // presentation: slightly warm, dimmer than Earth
  sunIntensity: 0.45,
  // Effective optical depth for sun reddening/dimming with air mass. Presentation, NOT a measured tau.
  sunExtinctionTau: 0.12,
  sunExtinctionRgb: Object.freeze([0.85, 1.0, 1.2]),
  // Diffuse (sky) to direct (sun) ratio for an upward surface with the sun high. Larger than an Earth
  // clear sky so Mars shadows read softer/lighter; presentation parameter, source not verified.
  diffuseToDirectRatio: 0.5,
  // Ground-bounce tint/strength for downward-facing normals. Presentation.
  groundBounceTint: Object.freeze([0.36, 0.20, 0.12]),
  groundBounceStrength: 0.35,
  // Sun-disc radiance relative to sunIntensity (bright after tone mapping, not physical). Presentation.
  sunDiscRadianceScale: 2.6,
  // Disc edge darkening (centre = 1, limb = this value). Presentation.
  sunLimbDarkening: 0.6,
  // Aerial perspective. Presentation distances/limits.
  hazeDensityPerM: 0.00045,
  hazeMaxAmount: 0.82,
  hazeDesaturation: 0.35,
  // Global exposure applied before the tone curve. Presentation.
  exposure: 1.0,
  // Emissive guide gain (beacons/lines) so they stay readable after tone mapping. Presentation.
  emissiveGain: 1.5,
});

/**
 * Astronaut rig shading (presentation). The rig is lit by the same sun and sky as the terrain, but a white
 * suit must not turn beige: the warm sky ambient is partly replaced by a neutral, slightly cool tint, and
 * the materials get a Fresnel/specular response. Values are visual approximations, not suit measurements.
 */
export const RIG_LIGHT_PARAMS = Object.freeze({
  // Fraction of the warm sky ambient kept; the rest is the neutral-cool tint below (shaded faces read grey-blue).
  ambientWarmKeep: 0.2,
  ambientCoolTint: Object.freeze([0.90, 0.98, 1.10]),
  // Dielectric Fresnel reflectance at normal incidence (common ~4 % default).
  dielectricF0: 0.04,
  // Peak of the sun specular lobe relative to the sun irradiance (normalised Gaussian in angle).
  specularPeak: 0.35,
  // Lower bound of the lobe width (roughness^2), so a mirror-like visor stays finite.
  specularWidthFloor: 0.004,
  // Strength of the sky-dome reflection, scaled by gloss (1 - roughness)^2. 1.0 lets the gold visor read as metal
  // (it reflects the darker lower sky and ground, so a weaker factor left it nearly brown).
  envReflectStrength: 1.0,
});

/** Neutral-cool rig ambient (JS mirror of rigSkyAmbient in the GLSL block). Keeps the luminance of `ambient`. */
export function rigAmbientTint(ambient) {
  const l = luminance(ambient);
  const keep = RIG_LIGHT_PARAMS.ambientWarmKeep;
  return ambient.map((v, i) => keep * v + (1 - keep) * l * RIG_LIGHT_PARAMS.ambientCoolTint[i]);
}

const LUMA = [0.2126, 0.7152, 0.0722]; // Rec.709

// ---------- small vector helpers (mirroring GLSL built-ins) ----------
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a * (1 - t) + b * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp3 = (a, lo, hi) => a.map((v) => clamp(v, lo, hi));
export const luminance = (c) => dot3(c, LUMA);

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (!(l > 0)) throw new RangeError('direction must be non-zero');
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Henyey–Greenstein lobe normalised to 1 at cosTheta = 1. Returns (0, 1]. */
export function hgLobe(cosTheta, g) {
  const denom = 1 + g * g - 2 * g * clamp(cosTheta, -1, 1);
  return Math.pow(((1 - g) * (1 - g)) / denom, 1.5);
}

const P = SKY_PARAMS;
// Derived ambient scale: an upward normal receives diffuseToDirectRatio × sunIntensity (in luminance)
// when the sun is high. Computed once from the same parameters and baked into GLSL.
const SKY_AMBIENT_TINT_HIGH = mix3(P.zenithHigh, P.horizonHigh, 0.55);
export const AMBIENT_SCALE = (P.diffuseToDirectRatio * P.sunIntensity) / luminance(SKY_AMBIENT_TINT_HIGH);

function skyGradientColors(sunZ) {
  const lowSun = 1 - smoothstep(P.lowSunStart, P.lowSunEnd, sunZ);
  return {
    lowSun,
    zenith: mix3(P.zenithHigh, P.zenithLow, lowSun),
    horizon: mix3(P.horizonHigh, P.horizonLow, lowSun),
    skyLight: smoothstep(P.twilightStart, P.twilightEnd, sunZ),
  };
}

/** Linear sky radiance looking along unit `rayDir` with unit `sunDir` (both local X east, Y north, Z up). */
export function marsSkyRadiance(rayDir, sunDir) {
  const ray = normalize3(rayDir);
  const sun = normalize3(sunDir);
  const { lowSun, zenith, horizon, skyLight } = skyGradientColors(sun[2]);
  const vz = clamp(ray[2], -1, 1);
  const up = Math.max(vz, 0);
  const t = Math.pow(1 - up, P.horizonExponent);
  let sky = mix3(zenith, horizon, t);
  sky = mix3(sky, scale3(horizon, P.groundHazeScale), clamp(-vz * 4, 0, 1));
  sky = add3(sky, scale3(horizon, P.horizonDustStrength * Math.exp(-Math.abs(vz) * P.horizonDustSharpness)));
  const cosT = clamp(dot3(ray, sun), -1, 1);
  const halo = add3(
    scale3(P.haloWarmColor, hgLobe(cosT, P.haloWarmG) * P.haloWarmIntensity),
    scale3(P.haloBlueColor, hgLobe(cosT, P.haloBlueG) * P.haloBlueIntensity * lowSun),
  );
  sky = add3(sky, scale3(halo, smoothstep(-0.04, 0.04, sun[2])));
  return clamp3(add3(P.night, scale3(sky, skyLight)), 0, 1);
}

/** Direct-sun irradiance colour (linear) for unit `sunDir`; zero below the horizon (renderer daylight). */
export function marsSunIrradiance(sunDir) {
  const sun = normalize3(sunDir);
  const daylight = smoothstep(0, 0.08, sun[2]);
  const airMass = 1 / Math.max(sun[2], 0.035);
  const trans = P.sunExtinctionRgb.map((k) => Math.exp(-P.sunExtinctionTau * k * (airMass - 1)));
  return scale3(mul3(P.sunColor, trans), P.sunIntensity * daylight);
}

/** Hemispherical ambient: sky colour for upward normals, ground bounce for downward ones. */
export function marsSkyAmbient(normal, sunDir) {
  const n = normalize3(normal);
  const sun = normalize3(sunDir);
  const { zenith, horizon, skyLight } = skyGradientColors(sun[2]);
  const skyAmb = scale3(mix3(zenith, horizon, 0.55), AMBIENT_SCALE * skyLight);
  const sunIrr = marsSunIrradiance(sun);
  const bounce = (luminance(sunIrr) * Math.max(sun[2], 0) + luminance(skyAmb)) * P.groundBounceStrength;
  const groundAmb = scale3(P.groundBounceTint, bounce);
  return mix3(groundAmb, skyAmb, 0.5 + 0.5 * n[2]);
}

/** ACES fitted curve (Narkowicz) with exposure; input linear ≥ 0, output linear 0..1. */
export function toneMap(color, exposure = P.exposure) {
  return color.map((v) => {
    const x = Math.max(v, 0) * exposure;
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1);
  });
}

export const srgbToLinear = (c) => c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
export const linearToSrgb = (c) => c.map((v) => {
  const x = clamp(v, 0, 1);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
});

/** Display (sRGB-encoded) colour from linear scene colour: the single output transform for every pass. */
export const encodeOutput = (linear) => linearToSrgb(toneMap(linear));

/** Aerial-perspective colour: the sky just above the horizon in the viewing azimuth (so far terrain fades into it). */
export function marsHazeColor(rayDir, sunDir) {
  const r = normalize3(rayDir);
  return marsSkyRadiance([r[0], r[1], Math.max(r[2], 0) * 0.25 + 0.015], sunDir);
}

/**
 * Sun-disc radiance (linear) along `rayDir`: angular radius from the NSSDC-derived constant, mild limb
 * darkening (presentation), anti-aliased by `edgeRad` (GLSL passes fwidth of the angular distance).
 */
export function marsSunDiscRadiance(rayDir, sunDir, edgeRad = 0.0001) {
  const ray = normalize3(rayDir);
  const sun = normalize3(sunDir);
  const d = Math.hypot(ray[0] - sun[0], ray[1] - sun[1], ray[2] - sun[2]);
  const edge = Math.max(edgeRad, 0.0001);
  const disc = 1 - smoothstep(MARS_SUN_ANGULAR_RADIUS_RAD - edge, MARS_SUN_ANGULAR_RADIUS_RAD + edge, d);
  const mu = Math.sqrt(Math.max(1 - Math.pow(Math.min(d / MARS_SUN_ANGULAR_RADIUS_RAD, 1), 2), 0));
  const limb = mix(P.sunLimbDarkening, 1, mu);
  return scale3(marsSunIrradiance(sun), P.sunDiscRadianceScale * disc * limb);
}

/** Mixes a linear colour toward the sky's near-horizon colour along `rayDir` (camera → fragment). */
export function applyAerialPerspective(color, distanceM, rayDir, sunDir, density = P.hazeDensityPerM, maxAmount = P.hazeMaxAmount) {
  const f = clamp(1 - Math.exp(-Math.max(distanceM, 0) * density), 0, maxAmount);
  const haze = marsHazeColor(rayDir, sunDir);
  const lum = luminance(color);
  const desat = mix3(color, [lum, lum, lum], f * P.hazeDesaturation);
  return mix3(desat, haze, f);
}

// ---------- GLSL generation from the same constants ----------
export function glslFloat(value) {
  if (!Number.isFinite(value)) throw new RangeError('GLSL constant must be finite');
  let s = value.toFixed(8).replace(/0+$/, '');
  if (s.endsWith('.')) s += '0';
  return s;
}
const v3 = (a) => `vec3(${a.map(glslFloat).join(', ')})`;

/**
 * GLSL ES 3.00 helper block: constants + marsSkyRadiance, marsSunIrradiance, marsSkyAmbient,
 * shadow-independent applyAerialPerspective, toneMap, srgbToLinear, encodeOutput. Paste after the
 * precision statement. `shadowFactor` lives in the renderer because it depends on its uniforms.
 */
export const MARS_LIGHTING_GLSL = `
const vec3 SKY_ZENITH_HIGH = ${v3(P.zenithHigh)};
const vec3 SKY_HORIZON_HIGH = ${v3(P.horizonHigh)};
const vec3 SKY_ZENITH_LOW = ${v3(P.zenithLow)};
const vec3 SKY_HORIZON_LOW = ${v3(P.horizonLow)};
const vec3 SKY_NIGHT = ${v3(P.night)};
const vec3 HALO_WARM_COLOR = ${v3(P.haloWarmColor)};
const vec3 HALO_BLUE_COLOR = ${v3(P.haloBlueColor)};
const vec3 SUN_COLOR = ${v3(P.sunColor)};
const vec3 SUN_EXTINCTION_RGB = ${v3(P.sunExtinctionRgb)};
const vec3 GROUND_BOUNCE_TINT = ${v3(P.groundBounceTint)};
const vec3 LUMA709 = ${v3(LUMA)};
const float SUN_ANGULAR_RADIUS = ${glslFloat(MARS_SUN_ANGULAR_RADIUS_RAD)};
const float SUN_DISC_RADIANCE = ${glslFloat(P.sunDiscRadianceScale)};
const float SUN_INTENSITY = ${glslFloat(P.sunIntensity)};
const float AMBIENT_SCALE = ${glslFloat(AMBIENT_SCALE)};
const float EXPOSURE = ${glslFloat(P.exposure)};
const float EMISSIVE_GAIN = ${glslFloat(P.emissiveGain)};
const float HAZE_DENSITY = ${glslFloat(P.hazeDensityPerM)};
const float HAZE_MAX = ${glslFloat(P.hazeMaxAmount)};
const float RIG_AMBIENT_WARM_KEEP = ${glslFloat(RIG_LIGHT_PARAMS.ambientWarmKeep)};
const vec3 RIG_AMBIENT_COOL_TINT = ${v3(RIG_LIGHT_PARAMS.ambientCoolTint)};
const float RIG_F0 = ${glslFloat(RIG_LIGHT_PARAMS.dielectricF0)};
const float RIG_SPEC_PEAK = ${glslFloat(RIG_LIGHT_PARAMS.specularPeak)};
const float RIG_SPEC_WIDTH_FLOOR = ${glslFloat(RIG_LIGHT_PARAMS.specularWidthFloor)};
const float RIG_ENV_STRENGTH = ${glslFloat(RIG_LIGHT_PARAMS.envReflectStrength)};

// Rig-only ambient: keeps the sky luminance but neutralises most of its warm tint (see RIG_LIGHT_PARAMS).
vec3 rigSkyAmbient(vec3 ambient) {
  float l = dot(ambient, LUMA709);
  return RIG_AMBIENT_WARM_KEEP * ambient + (1.0 - RIG_AMBIENT_WARM_KEEP) * l * RIG_AMBIENT_COOL_TINT;
}
float hgLobe(float cosTheta, float g) {
  float denom = 1.0 + g * g - 2.0 * g * clamp(cosTheta, -1.0, 1.0);
  return pow(((1.0 - g) * (1.0 - g)) / denom, 1.5);
}
vec3 marsSkyRadiance(vec3 rayDir, vec3 sunDir) {
  vec3 ray = normalize(rayDir);
  vec3 sun = normalize(sunDir);
  float lowSun = 1.0 - smoothstep(${glslFloat(P.lowSunStart)}, ${glslFloat(P.lowSunEnd)}, sun.z);
  vec3 zenith = mix(SKY_ZENITH_HIGH, SKY_ZENITH_LOW, lowSun);
  vec3 horizon = mix(SKY_HORIZON_HIGH, SKY_HORIZON_LOW, lowSun);
  float skyLight = smoothstep(${glslFloat(P.twilightStart)}, ${glslFloat(P.twilightEnd)}, sun.z);
  float vz = clamp(ray.z, -1.0, 1.0);
  float t = pow(1.0 - max(vz, 0.0), ${glslFloat(P.horizonExponent)});
  vec3 sky = mix(zenith, horizon, t);
  sky = mix(sky, horizon * ${glslFloat(P.groundHazeScale)}, clamp(-vz * 4.0, 0.0, 1.0));
  sky += horizon * (${glslFloat(P.horizonDustStrength)} * exp(-abs(vz) * ${glslFloat(P.horizonDustSharpness)}));
  float cosT = clamp(dot(ray, sun), -1.0, 1.0);
  vec3 halo = HALO_WARM_COLOR * (hgLobe(cosT, ${glslFloat(P.haloWarmG)}) * ${glslFloat(P.haloWarmIntensity)})
    + HALO_BLUE_COLOR * (hgLobe(cosT, ${glslFloat(P.haloBlueG)}) * ${glslFloat(P.haloBlueIntensity)} * lowSun);
  sky += halo * smoothstep(-0.04, 0.04, sun.z);
  return clamp(SKY_NIGHT + sky * skyLight, 0.0, 1.0);
}
vec3 marsSunIrradiance(vec3 sunDir) {
  vec3 sun = normalize(sunDir);
  float daylight = smoothstep(0.0, 0.08, sun.z);
  float airMass = 1.0 / max(sun.z, 0.035);
  vec3 trans = exp(-${glslFloat(P.sunExtinctionTau)} * SUN_EXTINCTION_RGB * (airMass - 1.0));
  return SUN_COLOR * trans * (SUN_INTENSITY * daylight);
}
vec3 marsSkyAmbient(vec3 normal, vec3 sunDir) {
  vec3 n = normalize(normal);
  vec3 sun = normalize(sunDir);
  float lowSun = 1.0 - smoothstep(${glslFloat(P.lowSunStart)}, ${glslFloat(P.lowSunEnd)}, sun.z);
  vec3 zenith = mix(SKY_ZENITH_HIGH, SKY_ZENITH_LOW, lowSun);
  vec3 horizon = mix(SKY_HORIZON_HIGH, SKY_HORIZON_LOW, lowSun);
  float skyLight = smoothstep(${glslFloat(P.twilightStart)}, ${glslFloat(P.twilightEnd)}, sun.z);
  vec3 skyAmb = mix(zenith, horizon, 0.55) * (AMBIENT_SCALE * skyLight);
  vec3 sunIrr = marsSunIrradiance(sun);
  float bounce = (dot(sunIrr, LUMA709) * max(sun.z, 0.0) + dot(skyAmb, LUMA709)) * ${glslFloat(P.groundBounceStrength)};
  return mix(GROUND_BOUNCE_TINT * bounce, skyAmb, 0.5 + 0.5 * n.z);
}
vec3 marsHazeColor(vec3 rayDir, vec3 sunDir) {
  vec3 r = normalize(rayDir);
  return marsSkyRadiance(vec3(r.xy, max(r.z, 0.0) * 0.25 + 0.015), sunDir);
}
vec3 marsSunDiscRadiance(vec3 rayDir, vec3 sunDir, float edgeRad) {
  vec3 ray = normalize(rayDir);
  vec3 sun = normalize(sunDir);
  float d = length(ray - sun);
  float edge = max(edgeRad, 0.0001);
  float disc = 1.0 - smoothstep(SUN_ANGULAR_RADIUS - edge, SUN_ANGULAR_RADIUS + edge, d);
  float mu = sqrt(max(1.0 - pow(min(d / SUN_ANGULAR_RADIUS, 1.0), 2.0), 0.0));
  float limb = mix(${glslFloat(P.sunLimbDarkening)}, 1.0, mu);
  return marsSunIrradiance(sun) * (SUN_DISC_RADIANCE * disc * limb);
}
vec3 applyAerialPerspective(vec3 color, float dist, vec3 rayDir, vec3 sunDir, float density, float maxAmount) {
  float f = clamp(1.0 - exp(-max(dist, 0.0) * density), 0.0, maxAmount);
  vec3 haze = marsHazeColor(rayDir, sunDir);
  float lum = dot(color, LUMA709);
  vec3 desat = mix(color, vec3(lum), f * ${glslFloat(P.hazeDesaturation)});
  return mix(desat, haze, f);
}
vec3 toneMap(vec3 c) {
  vec3 x = max(c, 0.0) * EXPOSURE;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  vec3 x = clamp(c, 0.0, 1.0);
  return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), x));
}
vec3 encodeOutput(vec3 linearColor) {
  return linearToSrgb(toneMap(linearColor));
}
`;
