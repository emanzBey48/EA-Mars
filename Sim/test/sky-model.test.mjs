// Stage Visual A: regression tests for view/3d/sky-model.js (pure sky / sun / tone-map model).
//
// What this pins: finite, bounded linear radiance; butterscotch day gradient (R > G > B); monotone
// zenith-to-horizon brightening; low-sun darkening and bluer forward-scattered halo; night floor; sun disc
// size from NSSDC-derived constants; tone curve and sRGB round trip; and that the GLSL block is generated
// from the same numbers as the JS mirror (so the shader and the tests cannot silently diverge).
// These are presentation checks. They do not claim measured Mars radiometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENT_SCALE, MARS_LIGHTING_GLSL, MARS_SUN_ANGULAR_DIAMETER_ARCMIN, MARS_SUN_ANGULAR_RADIUS_RAD,
  SKY_PARAMS, applyAerialPerspective, encodeOutput, hgLobe, linearToSrgb, luminance, marsHazeColor,
  marsSkyAmbient, marsSkyRadiance, marsSunDiscRadiance, marsSunIrradiance, srgbToLinear, toneMap,
} from '../public/js/view/3d/sky-model.js';

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dir = (azDeg, elDeg) => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
};
const sunAt = (elDeg, azDeg = 0) => dir(azDeg, elDeg);
const finite3 = (c) => c.length === 3 && c.every(Number.isFinite);
const inUnit = (c) => c.every((v) => v >= 0 && v <= 1);

test('sun apparent size: NSSDC 1919 arcsec at 1 AU scaled by Mars distance 1.524 AU (≈21 arcmin)', () => {
  assert.ok(Math.abs(MARS_SUN_ANGULAR_DIAMETER_ARCMIN - 20.99) < 0.05, `got ${MARS_SUN_ANGULAR_DIAMETER_ARCMIN}`);
  // Radius in radians must agree with the arcminute diameter.
  const diamArcmin = (2 * MARS_SUN_ANGULAR_RADIUS_RAD * 180 * 60) / Math.PI;
  assert.ok(Math.abs(diamArcmin - MARS_SUN_ANGULAR_DIAMETER_ARCMIN) < 1e-9);
});

test('sky radiance is finite, within 0..1, over a grid of view and sun directions', () => {
  for (const sunEl of [-30, -6, 0, 3, 10, 30, 60, 85]) {
    for (let az = 0; az < 360; az += 45) {
      for (let el = -20; el <= 90; el += 10) {
        const c = marsSkyRadiance(dir(az, el), sunAt(sunEl, 0));
        assert.ok(finite3(c), `non-finite at sun ${sunEl}, view ${az}/${el}`);
        assert.ok(inUnit(c), `out of range at sun ${sunEl}, view ${az}/${el}: ${c}`);
      }
    }
  }
});

test('day sky is butterscotch: red > green > blue at zenith and horizon for a high sun', () => {
  const sun = sunAt(60, 0);
  for (const el of [85, 30, 3]) {
    const [r, g, b] = marsSkyRadiance(dir(120, el), sun);
    assert.ok(r > g && g > b, `not butterscotch at elevation ${el}: ${[r, g, b]}`);
  }
});

test('high-sun sky brightens monotonically toward the horizon, away from the sun halo', () => {
  const sun = sunAt(60, 0);
  // Rays at azimuth 180 and elevation <= 20 are more than 100 deg from the sun, so the forward halo is
  // negligible there (a 30-deg-off-sun ray is NOT halo-free: that is intended aureole behaviour).
  let previous = -Infinity;
  for (let el = 20; el >= 1; el -= 1) {
    const L = luminance(marsSkyRadiance(dir(180, el), sun));
    assert.ok(L >= previous - 1e-3, `luminance dropped at elevation ${el}: ${L} < ${previous}`);
    previous = L;
  }
  assert.ok(luminance(marsSkyRadiance(dir(180, 1), sun)) > luminance(marsSkyRadiance(dir(180, 80), sun)),
    'horizon must be brighter than zenith');
});

test('forward halo: sky looking toward a 60-deg sun is brighter than the same elevation looking away', () => {
  const sun = sunAt(60, 0);
  const toward = luminance(marsSkyRadiance(dir(0, 70), sun));
  const away = luminance(marsSkyRadiance(dir(180, 70), sun));
  assert.ok(toward > away, `halo missing: toward ${toward} vs away ${away}`);
});

test('low sun darkens the zenith and shifts the sunward halo toward blue', () => {
  const zenith = dir(0, 89);
  const high = marsSkyRadiance(zenith, sunAt(60, 0));
  const low = marsSkyRadiance(zenith, sunAt(4, 0));
  assert.ok(luminance(low) < luminance(high), 'zenith should darken when the sun is low');

  // Forward-scattered glow looking straight at the sun: blue/red ratio must rise as the sun sinks.
  const hiGlow = marsSkyRadiance(sunAt(20, 0), sunAt(20, 0));
  const loGlow = marsSkyRadiance(sunAt(4, 0), sunAt(4, 0));
  const hiRatio = hiGlow[2] / hiGlow[0];
  const loRatio = loGlow[2] / loGlow[0];
  assert.ok(loRatio > hiRatio, `halo not bluer at low sun: low ${loRatio} vs high ${hiRatio}`);
});

test('below the twilight range the sky collapses to the night floor (never exactly black)', () => {
  const c = marsSkyRadiance(dir(40, 30), sunAt(-25, 0));
  assert.ok(c.every((v) => v <= SKY_PARAMS.night[0] + 0.01), `sky should be dark: ${c}`);
  assert.ok(c.every((v) => v >= 0));
});

test('direct sun irradiance: zero below the horizon, positive in daylight, reddens at low elevation', () => {
  assert.deepEqual(marsSunIrradiance(sunAt(-5, 0)).map((v) => Math.abs(v) < 1e-12), [true, true, true]);
  const high = marsSunIrradiance(sunAt(60, 0));
  assert.ok(finite3(high) && luminance(high) > 0);
  const low = marsSunIrradiance(sunAt(10, 0));
  assert.ok(low[0] / low[2] > high[0] / high[2], 'low sun should be redder (blue attenuated more)');
});

test('hemispherical ambient: upward normals receive more light than downward (ground bounce is dimmer)', () => {
  const sun = sunAt(50, 0);
  const up = marsSkyAmbient([0, 0, 1], sun);
  const down = marsSkyAmbient([0, 0, -1], sun);
  assert.ok(finite3(up) && finite3(down));
  assert.ok(luminance(up) > luminance(down), 'upward ambient should dominate');
  assert.ok(AMBIENT_SCALE > 0 && Number.isFinite(AMBIENT_SCALE));
});

test('hgLobe is normalised to 1 at the sun, decreasing with angle, bounded in (0, 1]', () => {
  for (const g of [0.75, 0.93]) {
    assert.ok(Math.abs(hgLobe(1, g) - 1) < 1e-12);
    let prev = 1.0000001;
    for (let c = 1; c >= -1; c -= 0.1) {
      const v = hgLobe(c, g);
      assert.ok(v > 0 && v <= 1 + 1e-12);
      assert.ok(v <= prev + 1e-12);
      prev = v;
    }
  }
});

test('sun disc: bright at the centre, zero well outside the disc, limb-darkened', () => {
  const sun = sunAt(40, 0);
  const edge = 1e-4;
  const centre = marsSunDiscRadiance(sun, sun, edge);
  assert.ok(luminance(centre) > 1, 'disc centre should be far above the sky (pre tone-map)');
  const off = dir(0, 40 + 2 * (MARS_SUN_ANGULAR_RADIUS_RAD * 180) / Math.PI);
  assert.ok(luminance(marsSunDiscRadiance(off, sun, edge)) === 0, 'off-disc radiance must be zero');
  // Limb (at the angular radius) is darker than the centre.
  // Perpendicular to the sun direction (sun at azimuth 0): offset along the local "up-tangent" axis.
  const elRad = Math.asin(sun[2]);
  const perp = [-Math.sin(elRad), 0, Math.cos(elRad)];
  const limbDir = norm(sun.map((v, i) => v + MARS_SUN_ANGULAR_RADIUS_RAD * 0.98 * perp[i]));
  assert.ok(luminance(marsSunDiscRadiance(limbDir, sun, edge)) < luminance(centre));
});

test('tone map: bounded 0..1, monotone, maps 0 to 0, and keeps mid greys below clipping', () => {
  assert.equal(toneMap([0, 0, 0])[0], 0);
  let prev = -1;
  for (let x = 0; x <= 8; x += 0.05) {
    const y = toneMap([x, x, x])[0];
    assert.ok(y >= 0 && y <= 1);
    assert.ok(y >= prev - 1e-12, `not monotone at ${x}`);
    prev = y;
  }
  assert.ok(toneMap([0.2, 0.2, 0.2])[0] < 0.6, 'a mid input must not be pushed to white');
});

test('sRGB transfer round trip is exact to 1e-6 and encodeOutput stays within 0..1', () => {
  for (let v = 0; v <= 1; v += 0.05) {
    const back = srgbToLinear(linearToSrgb([v, v, v]));
    assert.ok(Math.abs(back[0] - v) < 1e-6, `round trip failed at ${v}`);
  }
  const enc = encodeOutput([3, 0.5, 0.01]);
  assert.ok(inUnit(enc) && finite3(enc));
});

test('aerial perspective: no haze at zero distance, approaches haze colour, respects maxAmount', () => {
  const sun = sunAt(40, 0);
  const ray = dir(90, 2);
  const c = [0.4, 0.2, 0.1];
  assert.deepEqual(applyAerialPerspective(c, 0, ray, sun), c);
  const far = applyAerialPerspective(c, 1e9, ray, sun, SKY_PARAMS.hazeDensityPerM, 0.5);
  const haze = marsHazeColor(ray, sun);
  // With maxAmount 0.5 the result is halfway (after desaturation) between the desaturated input and the haze.
  const lum = luminance(c);
  const desat = c.map((v) => v * (1 - 0.5 * SKY_PARAMS.hazeDesaturation) + lum * 0.5 * SKY_PARAMS.hazeDesaturation);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(far[i] - (desat[i] * 0.5 + haze[i] * 0.5)) < 1e-9);
  assert.ok(finite3(applyAerialPerspective(c, Infinity, ray, sun)));
});

test('GLSL block is generated from the same constants as the JS mirror (no silent divergence)', () => {
  const floatConst = (name) => {
    const m = new RegExp(`const float ${name} = ([-0-9.e]+);`).exec(MARS_LIGHTING_GLSL);
    assert.ok(m, `missing const float ${name}`);
    return Number(m[1]);
  };
  const vecConst = (name) => {
    const m = new RegExp(`const vec3 ${name} = vec3\\(([^)]*)\\);`).exec(MARS_LIGHTING_GLSL);
    assert.ok(m, `missing const vec3 ${name}`);
    return m[1].split(',').map((s) => Number(s.trim()));
  };
  const close = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  close(floatConst('SUN_ANGULAR_RADIUS'), MARS_SUN_ANGULAR_RADIUS_RAD, 1e-7);
  close(floatConst('AMBIENT_SCALE'), AMBIENT_SCALE);
  close(floatConst('EXPOSURE'), SKY_PARAMS.exposure);
  close(floatConst('EMISSIVE_GAIN'), SKY_PARAMS.emissiveGain);
  close(floatConst('HAZE_DENSITY'), SKY_PARAMS.hazeDensityPerM);
  close(floatConst('HAZE_MAX'), SKY_PARAMS.hazeMaxAmount);
  close(floatConst('SUN_INTENSITY'), SKY_PARAMS.sunIntensity);
  for (const [glsl, js] of [
    ['SKY_ZENITH_HIGH', SKY_PARAMS.zenithHigh], ['SKY_HORIZON_HIGH', SKY_PARAMS.horizonHigh],
    ['SKY_ZENITH_LOW', SKY_PARAMS.zenithLow], ['SKY_HORIZON_LOW', SKY_PARAMS.horizonLow],
    ['HALO_WARM_COLOR', SKY_PARAMS.haloWarmColor], ['HALO_BLUE_COLOR', SKY_PARAMS.haloBlueColor],
    ['SUN_COLOR', SKY_PARAMS.sunColor], ['GROUND_BOUNCE_TINT', SKY_PARAMS.groundBounceTint],
  ]) {
    const got = vecConst(glsl);
    js.forEach((v, i) => close(got[i], v));
  }
  for (const fn of ['marsSkyRadiance', 'marsSunIrradiance', 'marsSkyAmbient', 'marsSunDiscRadiance', 'applyAerialPerspective', 'toneMap', 'encodeOutput']) {
    assert.ok(new RegExp(`vec3 ${fn}\\(|float ${fn}\\(|vec3 ${fn}\\(`).test(MARS_LIGHTING_GLSL), `missing GLSL ${fn}`);
  }
});

test('luminance uses Rec.709 weights', () => {
  assert.ok(Math.abs(luminance([1, 1, 1]) - 1) < 1e-12);
  assert.ok(Math.abs(luminance([1, 0, 0]) - 0.2126) < 1e-12);
});
