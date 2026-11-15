// Stage Visual A: regression tests for view/3d/terrain-shading.js (terrain surface appearance only).
//
// What this pins: deterministic, world-fixed micro detail that is bounded (slope cap, tone amplitude) and
// fades to zero with camera distance; analytic noise derivatives match finite differences; the slope
// weight is monotone in the physical tangent; the ortho luminance/palette chroma split behaves as documented;
// the mesh-border haze fade only applies to far views; and the GLSL block agrees with the JS constants.
// None of this touches elevation, slope data, no-data cells or geometry. Micro detail is visual detail, not data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  worleyEdge, terrainFields, MICRO_DERIVATIVE_BOUND, ORTHO_MID_LUMA, PALETTE_LINEAR, TERRAIN_SHADING_GLSL, TERRAIN_SHADING_PARAMS,
  combineAlbedo, hash2, hashUnit, meshEdgeFade, microDetail, octaveFade, orthoCoverage, orthoGain,
  paletteAlbedo, perturbNormal, slopeAlbedoFactor, slopeRoughness, tanSlopeFromNormalZ, terrainSlopeWeight,
  valueNoiseD, pebbleDetail, rockDetail, craterDetail, applyDust,
} from '../public/js/view/3d/terrain-shading.js';

const P = TERRAIN_SHADING_PARAMS;
const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const finite = (xs) => xs.every((v) => Number.isFinite(v));

// Deterministic pseudo-random sample points over a wide range including negatives (no Math.random).
function samples(n) {
  const out = [];
  let s = 12345;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const x = ((s >>> 8) / 16777216) * 2000 - 1000;
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const y = ((s >>> 8) / 16777216) * 2000 - 1000;
    out.push([x, y]);
  }
  return out;
}

test('micro detail is deterministic and world-fixed (same coordinates give the same result)', () => {
  for (const [x, y] of samples(50)) {
    const a = microDetail(x, y, 10, 1.3);
    const b = microDetail(x, y, 10, 1.3);
    assert.deepEqual(a, b);
  }
  const d1 = microDetail(10.2, 4.4, 5).slopeX;
  const d2 = microDetail(10.9, 4.4, 5).slopeX;
  assert.notEqual(d1, d2, 'detail must vary with world position');
});

test('micro detail is bounded: slope within the cap, tone within the summed octave amplitude, no NaN', () => {
  const toneBound = P.octaves.reduce((s, o) => s + o.toneAmp, 0) + P.ripple.toneAmp + P.crack.toneAmp;
  for (const [x, y] of samples(800)) {
    for (const dist of [0, 3, 40, 200, 900]) {
      const m = microDetail(x, y, dist, 1 + P.slopeRoughnessGain);
      assert.ok(finite([m.slopeX, m.slopeY, m.tone]));
      assert.ok(Math.hypot(m.slopeX, m.slopeY) <= P.microSlopeMax + 1e-9, 'slope cap exceeded');
      assert.ok(Math.abs(m.tone) <= toneBound + 1e-9, 'tone amplitude exceeded');
    }
  }
});

test('octave fade: 1 when close, monotone non-increasing with distance, 0 far beyond its features', () => {
  for (let i = 0; i < P.octaves.length; i++) {
    assert.equal(octaveFade(i, 0), 1);
    let prev = 1;
    for (let d = 0; d <= P.octaves[i].wavelengthM * P.fadeEndPerWavelength * 1.5; d += P.octaves[i].wavelengthM) {
      const w = octaveFade(i, d);
      assert.ok(w <= prev + 1e-12 && w >= 0 && w <= 1);
      prev = w;
    }
    assert.equal(octaveFade(i, P.octaves[i].wavelengthM * P.fadeEndPerWavelength + 1), 0);
  }
  const far = microDetail(3.3, 7.7, 5000);
  assert.equal(far.slopeX, 0);
  assert.equal(far.slopeY, 0);
  assert.equal(far.tone, 0);
});

test('valueNoise analytic derivatives match central finite differences', () => {
  const h = 1e-5;
  for (const [x, y] of samples(60)) {
    const px = x * 0.013, py = y * 0.013;
    const n = valueNoiseD(px, py);
    const fdx = (valueNoiseD(px + h, py).value - valueNoiseD(px - h, py).value) / (2 * h);
    const fdy = (valueNoiseD(px, py + h).value - valueNoiseD(px, py - h).value) / (2 * h);
    assert.ok(Math.abs(n.dx - fdx) < 1e-3, `dx mismatch ${n.dx} vs ${fdx}`);
    assert.ok(Math.abs(n.dy - fdy) < 1e-3, `dy mismatch ${n.dy} vs ${fdy}`);
    assert.ok(n.value >= 0 && n.value <= 1, 'value noise must stay in [0,1]');
    assert.ok(Math.abs(n.dx) <= MICRO_DERIVATIVE_BOUND + 1e-9 && Math.abs(n.dy) <= MICRO_DERIVATIVE_BOUND + 1e-9);
  }
});

test('hash: deterministic, unit values in [0,1), spread over integer lattice (no constant output)', () => {
  let distinct = new Set();
  for (let ix = -20; ix < 20; ix++) for (let iy = -20; iy < 20; iy++) {
    const u = hashUnit(ix, iy);
    assert.ok(u >= 0 && u < 1);
    assert.equal(hashUnit(ix, iy), u);
    distinct.add(hash2(ix, iy));
  }
  assert.ok(distinct.size > 1500, `hash collapsed: ${distinct.size} distinct of 1600`);
});

test('slope weight: 0 on gentle ground, 1 on steep ground, monotone in between', () => {
  assert.equal(terrainSlopeWeight(0), 0);
  assert.equal(terrainSlopeWeight(Math.tan((5 * Math.PI) / 180)), 0);
  assert.equal(terrainSlopeWeight(Math.tan((40 * Math.PI) / 180)), 1);
  let prev = -1;
  for (let deg = 0; deg <= 50; deg += 0.5) {
    const w = terrainSlopeWeight(Math.tan((deg * Math.PI) / 180));
    assert.ok(w >= prev - 1e-12 && w >= 0 && w <= 1, `not monotone at ${deg} deg`);
    prev = w;
  }
  assert.ok(slopeRoughness(1) > slopeRoughness(0));
  assert.ok(slopeAlbedoFactor(1) < slopeAlbedoFactor(0));
});

test('tanSlopeFromNormalZ: flat normal gives zero, steep normal gives the analytic tangent', () => {
  assert.equal(tanSlopeFromNormalZ(1), 0);
  assert.ok(Math.abs(tanSlopeFromNormalZ(0.5) - Math.sqrt(0.75) / 0.5) < 1e-12);
  assert.ok(Number.isFinite(tanSlopeFromNormalZ(0)), 'horizontal normal must stay finite (clamped)');
});

test('perturbed normal stays unit length and keeps a positive vertical component for small slopes', () => {
  for (const [x, y] of samples(200)) {
    const m = microDetail(x, y, 8, 1.2);
    const n = perturbNormal([0, 0, 1], m.slopeX, m.slopeY);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-12);
    assert.ok(n[2] > 0);
  }
  assert.deepEqual(perturbNormal([0, 0, 1], 0, 0), [0, 0, 1]);
});

test('palette: finite, positive, basin→delta→ridge along elevation', () => {
  for (let f = 0; f <= 1.0001; f += 0.05) {
    const a = paletteAlbedo(f);
    assert.ok(finite(a) && a.every((v) => v >= 0));
  }
  assert.deepEqual(paletteAlbedo(0), [...PALETTE_LINEAR.basin]);
  assert.deepEqual(paletteAlbedo(0.5), [...PALETTE_LINEAR.delta]);
  assert.deepEqual(paletteAlbedo(1), [...PALETTE_LINEAR.ridge]);
  // Viewer palette is butterscotch: red dominates, not the processed Viking hue (blue-ish).
  for (const c of [PALETTE_LINEAR.basin, PALETTE_LINEAR.delta, PALETTE_LINEAR.ridge]) {
    assert.ok(c[0] > c[1] && c[1] > c[2], 'palette must be red > green > blue');
  }
});

test('ortho: luminance follows the ortho texel while chroma stays palette, without ortho the palette is kept', () => {
  const pal = PALETTE_LINEAR.delta;
  const noOrtho = combineAlbedo(pal, 0, 1);
  assert.ok(Math.abs(lumaOf(noOrtho) - lumaOf(pal)) < 1e-9, 'no coverage keeps palette luminance');
  const bright = combineAlbedo(pal, 1, orthoGain(1));
  const dark = combineAlbedo(pal, 1, orthoGain(0));
  assert.ok(lumaOf(bright) > lumaOf(dark), 'brighter ortho texel must brighten the terrain');
  assert.ok(Math.abs(lumaOf(bright) - ORTHO_MID_LUMA * orthoGain(1)) < 1e-6);
  // Chroma ratio preserved (palette hue survives).
  const r1 = bright[0] / bright[2], r2 = pal[0] / pal[2];
  assert.ok(Math.abs(r1 - r2) / r2 < 1e-6, 'chroma must come from the palette');
  // Monochrome (pure ortho mode) is neutral grey at the same luminance.
  const mono = combineAlbedo(pal, 1, 1, true);
  assert.ok(Math.abs(mono[0] - mono[1]) < 1e-9 && Math.abs(mono[1] - mono[2]) < 1e-9);
});

test('ortho gain and coverage: gain bounded, coverage 0 outside the texture and 1 well inside', () => {
  for (let g = -0.5; g <= 1.5; g += 0.1) {
    const v = orthoGain(g);
    assert.ok(v >= P.orthoGainMin - 1e-12 && v <= P.orthoGainMax + 1e-12);
  }
  assert.equal(orthoCoverage(-0.01, 0.5, 1), 0);
  assert.equal(orthoCoverage(0.5, 1.01, 1), 0);
  assert.equal(orthoCoverage(0.5, 0.5, 1), 1);
  assert.equal(orthoCoverage(0.5, 0.5, 0), 0, 'transparent texel is not coverage');
});

test('mesh border haze: nothing in the interior or for near views; full at the border for far views', () => {
  assert.equal(meshEdgeFade(500, 2000), 0, 'interior fragments are never hazed');
  assert.equal(meshEdgeFade(0, 50), 0, 'near views are never hazed');
  assert.ok(Math.abs(meshEdgeFade(0, 2000) - 1) < 1e-12, 'far border fragment is fully hazed');
  let prev = -1;
  for (let v = 0; v <= 1200; v += 25) {
    const f = meshEdgeFade(0, v);
    assert.ok(f >= prev - 1e-12 && f >= 0 && f <= 1);
    prev = f;
  }
});

test('slope albedo darkening is bounded by slopeDarkening', () => {
  assert.ok(Math.abs(slopeAlbedoFactor(1) - (1 - P.slopeDarkening)) < 1e-12);
});

test('GLSL terrain block carries the same palette and ortho mid constants as the JS mirror', () => {
  const vec = (name) => {
    const m = new RegExp(`const vec3 ${name} = vec3\\(([^)]*)\\);`).exec(TERRAIN_SHADING_GLSL);
    assert.ok(m, `missing ${name}`);
    return m[1].split(',').map((s) => Number(s.trim()));
  };
  for (const [name, js] of [['TERRAIN_BASIN', PALETTE_LINEAR.basin], ['TERRAIN_DELTA', PALETTE_LINEAR.delta],
    ['TERRAIN_RIDGE', PALETTE_LINEAR.ridge], ['TERRAIN_BEDROCK', PALETTE_LINEAR.bedrock]]) {
    const g = vec(name);
    js.forEach((v, i) => assert.ok(Math.abs(g[i] - v) < 1e-7, `${name}[${i}]`));
  }
  const mid = new RegExp('const float ORTHO_MID_LUMA = ([-0-9.e]+);').exec(TERRAIN_SHADING_GLSL);
  assert.ok(mid && Math.abs(Number(mid[1]) - ORTHO_MID_LUMA) < 1e-7);
  for (const fn of ['terrainValueNoiseD', 'terrainMicro', 'terrainPerturbNormal', 'terrainSlopeWeight', 'terrainPalette',
    'orthoGain', 'orthoCoverage', 'terrainCombineAlbedo', 'terrainMeshEdgeFade']) {
    assert.ok(TERRAIN_SHADING_GLSL.includes(fn), `missing GLSL ${fn}`);
  }
});

test('shading module does not alter geometry-facing data: it exports no sampling or elevation functions', async () => {
  const src = fs.readFileSync(new URL('../public/js/view/3d/terrain-shading.js', import.meta.url), 'utf8');
  assert.ok(!/elevation|sampleElevation|zM\b|sourceElevations/.test(src.replace(/\/\/.*$/gm, '')), 'terrain shading must not touch elevation data');
});

test('pebble scatter: deterministic, world-fixed, bounded, fades to zero with distance, sparse', () => {
  const far = P.pebbles[1].fadeEndM + 1;
  let nonZero = 0, total = 0, maxTone = 0, maxSlope = 0;
  for (const [x, y] of samples(2000)) {
    const a = pebbleDetail(x, y, 2), b = pebbleDetail(x, y, 2);
    assert.deepEqual(a, b, 'deterministic');
    assert.ok(finite([a.slopeX, a.slopeY, a.tone]));
    assert.ok(Math.hypot(a.slopeX, a.slopeY) <= P.pebbleSlopeMax + 1e-9, 'slope capped');
    maxSlope = Math.max(maxSlope, Math.hypot(a.slopeX, a.slopeY));
    maxTone = Math.max(maxTone, Math.abs(a.tone));
    total++; if (a.tone !== 0 || a.slopeX !== 0) nonZero++;
    const f = pebbleDetail(x, y, far);
    assert.ok(f.tone === 0 && f.slopeX === 0 && f.slopeY === 0, 'no pebbles beyond the fade range');
  }
  assert.ok(maxTone <= 0.6, `tone amplitude stays modest (${maxTone})`);
  assert.ok(nonZero / total > 0.03 && nonZero / total < 0.7, `pebbles are sparse but present (${nonZero / total})`);
});

test('pebble scatter: pebbles sit inside their cell so only the own cell has to be evaluated', () => {
  for (const L of P.pebbles) assert.ok(L.radiusM <= 0.22 * L.cellM + 1e-12, 'pebble radius <= 0.22 cell');
  assert.ok(P.pebbleOrthoToneReduction > P.microToneOrthoReduction, 'ortho luminance is protected more from pebbles');
});

test('pebble scatter: GLSL block mirrors the JS constants and the renderer wires it in', () => {
  assert.match(TERRAIN_SHADING_GLSL, /void terrainPebbles\(/);
  assert.match(TERRAIN_SHADING_GLSL, /7919 \* k/);
  const renderer = fs.readFileSync(new URL('../public/js/view/3d/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /terrainPebbles\(vWorldPos\.xy/);
});

test('rock scatter: deterministic, world-fixed, bounded, fades to zero with distance, sparse', () => {
  const far = P.rocks[1].fadeEndM + 1;
  let nonZero = 0, total = 0, maxTone = 0, maxSlope = 0;
  for (const [x, y] of samples(2000)) {
    const a = rockDetail(x, y, 5), b = rockDetail(x, y, 5);
    assert.deepEqual(a, b, 'deterministic');
    assert.ok(finite([a.slopeX, a.slopeY, a.tone]));
    assert.ok(Math.hypot(a.slopeX, a.slopeY) <= P.rockSlopeMax + 1e-9, 'slope capped');
    maxSlope = Math.max(maxSlope, Math.hypot(a.slopeX, a.slopeY));
    maxTone = Math.max(maxTone, Math.abs(a.tone));
    total++; if (a.tone !== 0 || a.slopeX !== 0) nonZero++;
    const f = rockDetail(x, y, far);
    assert.ok(f.tone === 0 && f.slopeX === 0 && f.slopeY === 0, 'no rocks beyond fade range');
  }
  assert.ok(maxTone <= 1.0, `tone amplitude stays modest (${maxTone})`);
  assert.ok(nonZero / total > 0.02 && nonZero / total < 0.6, `rocks are present (${nonZero / total})`);
});

test('crater scatter: deterministic, world-fixed, bounded, fades to zero with distance, bowl depression', () => {
  const far = P.craters[1].fadeEndM + 1;
  let nonZero = 0, total = 0, maxTone = 0, maxSlope = 0;
  for (const [x, y] of samples(2000)) {
    const a = craterDetail(x, y, 5), b = craterDetail(x, y, 5);
    assert.deepEqual(a, b, 'deterministic');
    assert.ok(finite([a.slopeX, a.slopeY, a.tone]));
    assert.ok(Math.hypot(a.slopeX, a.slopeY) <= P.craterSlopeMax + 1e-9, 'slope capped');
    maxSlope = Math.max(maxSlope, Math.hypot(a.slopeX, a.slopeY));
    maxTone = Math.max(maxTone, Math.abs(a.tone));
    total++; if (a.tone !== 0 || a.slopeX !== 0) nonZero++;
    const f = craterDetail(x, y, far);
    assert.ok(f.tone === 0 && f.slopeX === 0 && f.slopeY === 0, 'no craters beyond fade range');
  }
  assert.ok(maxTone <= 0.6, `tone amplitude stays modest (${maxTone})`);
  assert.ok(nonZero / total > 0.01 && nonZero / total < 0.5, `craters are present (${nonZero / total})`);
});

test('rock and crater scatter: cells preserve containment and GLSL block mirrors JS functions', () => {
  for (const L of P.rocks) assert.ok(L.radiusM <= 0.22 * L.cellM + 1e-12, 'rock radius <= 0.22 cell');
  for (const L of P.craters) assert.ok(L.radiusM <= 0.22 * L.cellM + 1e-12, 'crater radius <= 0.22 cell');
  assert.match(TERRAIN_SHADING_GLSL, /void terrainRocks\(/);
  assert.match(TERRAIN_SHADING_GLSL, /void terrainCraters\(/);
  assert.match(TERRAIN_SHADING_GLSL, /13001 \* k/);
  assert.match(TERRAIN_SHADING_GLSL, /3571 \* k/);
  const renderer = fs.readFileSync(new URL('../public/js/view/3d/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /terrainRocks\(vWorldPos\.xy/);
  assert.match(renderer, /terrainCraters\(vWorldPos\.xy/);
});

test('surface dust mantle: deterministic, sheds on steep slopes, blends on gentle slopes', () => {
  const base = [0.20, 0.15, 0.12];
  for (const [x, y] of samples(50)) {
    const a = applyDust(base, x, y, 0.1, 10);
    const b = applyDust(base, x, y, 0.1, 10);
    assert.deepEqual(a, b, 'deterministic');
    assert.ok(finite(a) && a.every((v) => v >= 0), 'finite positive albedo');
    // On flat ground, dust adds warm tone (increases R and G)
    assert.ok(a[0] >= base[0] * 0.95);
    // On steep slope, dust is shed (albedo remains close to base)
    const steep = applyDust(base, x, y, 0.95, 10);
    assert.ok(Math.abs(steep[0] - base[0]) < 0.05, 'steep slope sheds dust');
  }
  assert.match(TERRAIN_SHADING_GLSL, /vec3 terrainApplyDust\(/);
  assert.match(TERRAIN_SHADING_GLSL, /const vec3 TERRAIN_DUST =/);
  const renderer = fs.readFileSync(new URL('../public/js/view/3d/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /terrainApplyDust\(albedo/);
});
test('realistic ground: octave lattices are rotated and irrational, stone layers use distinct rotated lattices', () => {
  const rots = P.octaves.map((o) => o.rotRad);
  assert.equal(new Set(rots).size, rots.length, 'each octave samples its own rotated frame');
  const layers = [...P.pebbles, ...P.rocks, ...P.craters];
  assert.equal(new Set(layers.map((L) => L.rotRad)).size, layers.length, 'no two scatter layers share a lattice rotation');
  const ratios = P.octaves.slice(1).map((o, i) => o.wavelengthM / P.octaves[i].wavelengthM);
  for (const r of ratios) assert.ok(Math.abs(r - Math.round(r)) > 0.05, `octave ratio ${r} must not be an integer`);
});

test('stony-patch field, ripples and cracks: deterministic, bounded, faded with distance', () => {
  let lo = 1, hi = 0;
  for (const [x, y] of samples(400)) {
    const fl = terrainFields(x, y);
    lo = Math.min(lo, fl.patch); hi = Math.max(hi, fl.patch);
    assert.ok(fl.patch >= 0 && fl.patch <= 1 && fl.mottle >= 0 && fl.mottle <= 1);
    const e = worleyEdge(x * 0.7, y * 0.7);
    assert.ok(Number.isFinite(e) && e >= 0 && e < 1.5, `worley edge ${e}`);
    const far = microDetail(x, y, P.crack.fadeEndM + P.ripple.fadeEndM + 1, 1);
    assert.ok(Number.isFinite(far.tone));
  }
  assert.ok(lo < 0.2 && hi > 0.8, `patch field spans dusty to stony (${lo}..${hi})`);
  assert.match(TERRAIN_SHADING_GLSL, /float terrainWorleyEdge\(/);
  assert.match(TERRAIN_SHADING_GLSL, /gTerrainPatch/);
});