// Stage 23D: regression tests for geo/mars-sun.js.
//
// What this pins (current code): marsSunDirection returns the unit vector [east, north, up] toward the Sun in the
// local horizon frame, using the NASA GISS Mars24 D-1 declination
//   delta = asin(0.42565 * sin(Ls)) + 0.25 deg * sin(Ls)      (the 0.25 deg term is added in degrees -> radians)
// and hour angle H = (trueSolarHour - 12) * 15 deg. Spherical Mars; no equation of time (LTST already includes it).
// The app uses ONE SCENARIO configuration (main.js: latitude of WB1, Ls = 0 deg, local true solar hour 15:00).
// That is a scenario setting, NOT a claim about the real date/time of the Perseverance drive.
//
// The expected values below are computed independently of the module: the Sun is built in an equatorial
// frame (X = observer meridian at the equator, Y = east, Z = north pole) and projected onto the local
// east/north/up basis with dot products, instead of the module's closed-form expressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsSunDirection } from '../public/js/geo/mars-sun.js';
import { WAYPOINTS } from '../public/js/config.js';

const R = Math.PI / 180;
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

// Mars24 D-1, written independently (degrees in, radians out).
function mars24Declination(LsDeg) {
  const s = Math.sin(LsDeg * R);
  return Math.asin(0.42565 * s) + (0.25 * s) * R;
}

function expectedSun(latDeg, LsDeg, hour) {
  const d = mars24Declination(LsDeg);
  const H = (hour - 12) * 15 * R; // positive in the afternoon (Sun west of the meridian)
  const sun = [Math.cos(d) * Math.cos(H), -Math.cos(d) * Math.sin(H), Math.sin(d)];
  const phi = latDeg * R;
  const up = [Math.cos(phi), 0, Math.sin(phi)];
  const east = [0, 1, 0];
  const north = [-Math.sin(phi), 0, Math.cos(phi)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(sun, east), dot(sun, north), dot(sun, up)];
}

test('declination used by the module equals Mars24 D-1 at the solstices and equinox (via local noon at the subsolar latitude)', () => {
  // At local noon on latitude = delta, the Sun is at the zenith: up == 1. That recovers delta from the module itself.
  for (const Ls of [0, 90, 180, 270, 45, 123.4]) {
    const d = mars24Declination(Ls) / R;
    const v = marsSunDirection({ latitudeDeg: d, solarLongitudeDeg: Ls, trueSolarHour: 12 });
    near(v[2], 1, 1e-12, `Ls=${Ls}`);
    near(v[0], 0, 1e-12); near(v[1], 0, 1e-12);
  }
  // Numeric anchors of the formula: Ls 90 -> asin(0.42565) + 0.25 deg ~ 25.44 deg; Ls 0/180 -> 0.
  near(mars24Declination(90) / R, Math.asin(0.42565) / R + 0.25, 1e-12);
  near(mars24Declination(90) / R, 25.4418, 5e-4, 'documented magnitude of the Ls=90 declination');
  near(mars24Declination(0), 0, 1e-15);
  near(mars24Declination(270), -mars24Declination(90), 1e-15);
});

test('unit length (1e-12) and agreement with the independent closed form over a lat/Ls/hour grid', () => {
  let n = 0;
  for (let lat = -90; lat <= 90; lat += 15) {
    for (let Ls = 0; Ls < 360; Ls += 30) {
      for (let h = 0; h <= 24; h += 1.5) {
        const v = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: Ls, trueSolarHour: h });
        assert.equal(v.length, 3);
        near(norm(v), 1, 1e-12, `norm lat=${lat} Ls=${Ls} h=${h}`);
        const e = expectedSun(lat, Ls, h);
        for (let k = 0; k < 3; k++) near(v[k], e[k], 1e-12, `component ${k} lat=${lat} Ls=${Ls} h=${h}`);
        n++;
      }
    }
  }
  assert.equal(n, 13 * 12 * 17); // lat -90..90 step 15 (13) x Ls 0..330 step 30 (12) x hour 0..24 step 1.5 (17)
});

test('equinox Ls = 0 at the equator: noon is the zenith, 06:00 east horizon, 18:00 west horizon, midnight nadir', () => {
  const at = (hour) => marsSunDirection({ latitudeDeg: 0, solarLongitudeDeg: 0, trueSolarHour: hour });
  const noon = at(12);
  near(noon[0], 0, 1e-15); near(noon[1], 0, 1e-15); near(noon[2], Math.cos(0), 1e-15);
  const dawn = at(6), dusk = at(18), midnight = at(0);
  near(dawn[0], 1, 1e-12); near(dawn[2], 0, 1e-12);
  near(dusk[0], -1, 1e-12); near(dusk[2], 0, 1e-12);
  near(midnight[2], -1, 1e-12);
});

test('hour-of-day semantics: 06:00 sun in the east, 18:00 in the west, midnight below the horizon', () => {
  for (const lat of [-40, 0, 18.44, 40]) {
    for (const Ls of [0, 90, 180, 270]) {
      const dawn = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: Ls, trueSolarHour: 6 });
      const dusk = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: Ls, trueSolarHour: 18 });
      const midnight = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: Ls, trueSolarHour: 0 });
      assert.ok(dawn[0] > 0, `east>0 at 06:00 (lat ${lat}, Ls ${Ls})`);
      assert.ok(dusk[0] < 0, `east<0 at 18:00 (lat ${lat}, Ls ${Ls})`);
      assert.ok(midnight[2] < 0, `up<0 at midnight (lat ${lat}, Ls ${Ls})`);
    }
  }
});

test('symmetry around local noon: east flips sign, north and up are equal', () => {
  for (const lat of [-70, -18.4, 0, 18.44, 63]) {
    for (const Ls of [0, 77, 135, 250]) {
      for (const dh of [0.25, 1, 3.3, 6, 9.9]) {
        const a = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: Ls, trueSolarHour: 12 - dh });
        const b = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: Ls, trueSolarHour: 12 + dh });
        near(a[0], -b[0], 1e-14); near(a[1], b[1], 1e-14); near(a[2], b[2], 1e-14);
      }
    }
  }
});

test('hour is periodic with 24 h (no clamping); 36 == 12', () => {
  const a = marsSunDirection({ latitudeDeg: 18.4, solarLongitudeDeg: 33, trueSolarHour: 12 });
  const b = marsSunDirection({ latitudeDeg: 18.4, solarLongitudeDeg: 33, trueSolarHour: 36 });
  const c = marsSunDirection({ latitudeDeg: 18.4, solarLongitudeDeg: 33, trueSolarHour: -12 });
  for (let k = 0; k < 3; k++) { near(a[k], b[k], 1e-12); near(a[k], c[k], 1e-12); }
});

test('polar day and polar night sanity (lat 80, Ls 90/270)', () => {
  // Ls 90: delta ~ +25.44 deg; at lat +80 the Sun never sets (min up = -cos(80+25.44 deg) > 0) and at lat -80 never rises.
  let minUpNorth = Infinity, maxUpSouth = -Infinity, minUpNorth270 = Infinity, maxUpNorth270 = -Infinity;
  for (let h = 0; h < 24; h += 0.25) {
    minUpNorth = Math.min(minUpNorth, marsSunDirection({ latitudeDeg: 80, solarLongitudeDeg: 90, trueSolarHour: h })[2]);
    maxUpSouth = Math.max(maxUpSouth, marsSunDirection({ latitudeDeg: -80, solarLongitudeDeg: 90, trueSolarHour: h })[2]);
    const v270 = marsSunDirection({ latitudeDeg: 80, solarLongitudeDeg: 270, trueSolarHour: h })[2];
    minUpNorth270 = Math.min(minUpNorth270, v270); maxUpNorth270 = Math.max(maxUpNorth270, v270);
  }
  assert.ok(minUpNorth > 0.2, `polar day min up ${minUpNorth}`);
  near(minUpNorth, -Math.cos((80 + mars24Declination(90) / R) * R), 1e-12);
  assert.ok(maxUpSouth < -0.2, `southern winter max up ${maxUpSouth}`);
  assert.ok(maxUpNorth270 < -0.2, `polar night max up ${maxUpNorth270}`);
});

test('scenario configuration used by main.js (WB1 latitude, Ls 0, 15:00 local true solar time) - scenario, not a real date', () => {
  const lat = WAYPOINTS[0].latDeg;
  const v = marsSunDirection({ latitudeDeg: lat, solarLongitudeDeg: 0, trueSolarHour: 15 });
  // Ls 0 -> delta 0 ; H = 45 deg.
  near(v[0], -Math.sin(45 * R), 1e-12, 'sun is west of the meridian');
  near(v[1], -Math.sin(lat * R) * Math.cos(45 * R), 1e-12, 'sun is south of the zenith plane for a northern site at equinox');
  near(v[2], Math.cos(lat * R) * Math.cos(45 * R), 1e-12);
  assert.ok(v[2] > 0.6 && v[2] < 0.7, 'scenario Sun elevation is ~42 deg');
});

test('invalid inputs: CURRENT behaviour is NaN vectors (no exception); empty call throws TypeError', () => {
  // FINDING (reported, not fixed - geo/mars-sun.js is not in Efe's file set): bad input is not rejected. A caller
  // passing NaN/undefined gets a vector of NaN and no error; the renderer would then light the scene with NaN.
  for (const bad of [
    { latitudeDeg: NaN, solarLongitudeDeg: 0, trueSolarHour: 12 },
    { latitudeDeg: 0, solarLongitudeDeg: NaN, trueSolarHour: 12 },
    { latitudeDeg: 0, solarLongitudeDeg: 0, trueSolarHour: NaN },
    { latitudeDeg: 0, solarLongitudeDeg: 0, trueSolarHour: undefined },
    { latitudeDeg: Infinity, solarLongitudeDeg: 0, trueSolarHour: 12 },
    {},
  ]) {
    const v = marsSunDirection(bad);
    assert.equal(v.length, 3);
    assert.ok(v.some((x) => Number.isNaN(x)), `expected NaN components for ${JSON.stringify(bad)}`);
  }
  // Strings are coerced by arithmetic (not by validation) -> numeric result.
  const s = marsSunDirection({ latitudeDeg: '10', solarLongitudeDeg: '0', trueSolarHour: '12' });
  assert.ok(s.every(Number.isFinite));
  assert.throws(() => marsSunDirection(), TypeError);
  // Latitudes beyond +-90 are not rejected either: the result is still unit length (formula is smooth).
  const over = marsSunDirection({ latitudeDeg: 120, solarLongitudeDeg: 0, trueSolarHour: 10 });
  near(norm(over), 1, 1e-12);
});

test('returns a fresh plain array each call (no shared mutable state)', () => {
  const a = marsSunDirection({ latitudeDeg: 10, solarLongitudeDeg: 0, trueSolarHour: 15 });
  const b = marsSunDirection({ latitudeDeg: 10, solarLongitudeDeg: 0, trueSolarHour: 15 });
  assert.notEqual(a, b);
  a[0] = 99;
  assert.notEqual(marsSunDirection({ latitudeDeg: 10, solarLongitudeDeg: 0, trueSolarHour: 15 })[0], 99);
});
