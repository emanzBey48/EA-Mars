// Stage Visual A: regression tests for view/3d/shadow-map.js (pure light-space math for the sun shadow map).
//
// What this pins: quality presets and fallbacks; coverage radius rules; the orthographic light matrix covers
// the focus box (corners and interior points land inside NDC), is non-degenerate, snaps to a stable cache
// key inside a cell, and is disabled for a low or below-horizon sun; receiver bias is monotone and bounded;
// and the GLSL receiver snippet uses uniform names that the renderer actually declares.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_SHADOW_QUALITY, SHADOW_BIAS, SHADOW_MIN_SUN_SIN, SHADOW_QUALITY, SHADOW_QUALITY_NAMES,
  SHADOW_RECEIVER_GLSL, chooseShadowRadiusM, computeShadowLightSpace, multiply4, projectToLightNdc,
  receiverBiasM, receiverNormalOffsetM, resolveShadowQuality, shadowFocusXY,
} from '../public/js/view/3d/shadow-map.js';

const sunAt = (elDeg, azDeg = 30) => {
  const el = (elDeg * Math.PI) / 180, az = (azDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
};
const box = (over = {}) => ({
  sunDirDisplay: sunAt(40), focusXM: 100, focusYM: -50, radiusM: 90, zMinM: -20, zMaxM: 30, resolution: 2048, ...over,
});

test('quality presets: off/low/high, unknown names and auto fall back to the default (high)', () => {
  assert.deepEqual(SHADOW_QUALITY_NAMES, ['off', 'low', 'high']);
  assert.equal(DEFAULT_SHADOW_QUALITY, 'high');
  assert.equal(resolveShadowQuality('off').resolution, 0);
  assert.equal(resolveShadowQuality('low').resolution, 1024);
  assert.equal(resolveShadowQuality('high').resolution, 2048);
  assert.equal(resolveShadowQuality('bogus').name, 'high');
  assert.equal(resolveShadowQuality(undefined).name, 'high');
  assert.equal(resolveShadowQuality('auto').name, 'high');
  assert.equal(resolveShadowQuality('__proto__').name, 'high');
});

test('coverage radius: first person uses the preset; orbit grows only when the orbit distance needs it', () => {
  assert.equal(chooseShadowRadiusM({ mode: 'first-person' }, SHADOW_QUALITY.high), SHADOW_QUALITY.high.radiusM);
  assert.equal(chooseShadowRadiusM({ mode: 'orbit', distanceM: 10 }, SHADOW_QUALITY.high), 90);
  const far = chooseShadowRadiusM({ mode: 'orbit', distanceM: 1000 }, SHADOW_QUALITY.high);
  assert.ok(far > 90 && far <= 90 * 8, `radius ${far} should grow but stay within 2^3`);
  assert.equal(chooseShadowRadiusM({ mode: 'orbit', distanceM: 1000 }, SHADOW_QUALITY.off), 0, 'off has no radius');
});

test('focus point: eye XY in first person, orbit target otherwise', () => {
  assert.deepEqual(shadowFocusXY({ mode: 'first-person', xM: 3, yM: 4, targetXM: 9, targetYM: 9 }), [3, 4]);
  assert.deepEqual(shadowFocusXY({ mode: 'orbit', xM: 3, yM: 4, targetXM: 9, targetYM: 8 }), [9, 8]);
});

test('light space: covers the focus box corners and interior points inside NDC, for several sun angles', () => {
  for (const el of [5, 12, 25, 40, 60, 80]) {
    for (const az of [0, 90, 200, 300]) {
      const ls = computeShadowLightSpace(box({ sunDirDisplay: sunAt(el, az) }));
      assert.equal(ls.enabled, true, `sun ${el}/${az} should cast shadows`);
      const m = ls.viewProjection;
      assert.equal(m.length, 16);
      assert.ok(Array.from(m).every(Number.isFinite), 'matrix must be finite');
      const { centerXM: cx, centerYM: cy, radiusM: r } = ls;
      for (const dx of [-r, 0, r]) for (const dy of [-r, 0, r]) for (const z of [-20, 5, 30]) {
        const ndc = projectToLightNdc(m, [cx + dx, cy + dy, z]);
        assert.ok(ndc.every((v) => Number.isFinite(v)));
        assert.ok(Math.abs(ndc[0]) <= 1 + 1e-5 && Math.abs(ndc[1]) <= 1 + 1e-5, `xy outside at ${el}/${az}: ${ndc}`);
        assert.ok(ndc[2] >= -1 - 1e-5 && ndc[2] <= 1 + 1e-5, `z outside at ${el}/${az}: ${ndc[2]}`);
      }
      const centre = projectToLightNdc(m, [cx, cy, (-20 + 30) / 2]);
      assert.ok(Math.abs(centre[0]) < 1e-5 && Math.abs(centre[1]) < 1e-5, 'box centre maps to NDC origin');
    }
  }
});

test('light space is non-degenerate and the light direction is a unit vector pointing at the sun', () => {
  const ls = computeShadowLightSpace(box());
  const m = ls.viewProjection;
  // Depth convention: a point nearer the light has SMALLER NDC depth (occluders are compared as "closer").
  const c = [ls.centerXM, ls.centerYM, 0];
  const nearLight = projectToLightNdc(m, c.map((v, i) => v + ls.lightDir[i] * 40));
  const farFromLight = projectToLightNdc(m, c.map((v, i) => v - ls.lightDir[i] * 40));
  assert.ok(nearLight[2] < farFromLight[2], `depth convention inverted: ${nearLight[2]} vs ${farFromLight[2]}`);
  const l = Math.hypot(...ls.lightDir);
  assert.ok(Math.abs(l - 1) < 1e-9);
  assert.ok(ls.lightDir[2] > 0, 'light direction points upward toward the sun');
  assert.ok(ls.depthRangeM > 0 && Number.isFinite(ls.depthRangeM));
  assert.ok(ls.texelWorldM > 0 && ls.texelWorldM < 1, `texel ${ls.texelWorldM} m (expected sub-metre at 2048)`);
});

test('caster padding: a caster placed toward the light beyond the box still lands inside the depth range', () => {
  const ls = computeShadowLightSpace(box());
  const toward = [ls.lightDir[0], ls.lightDir[1], ls.lightDir[2]];
  const p = [ls.centerXM + toward[0] * 150, ls.centerYM + toward[1] * 150, 0 + toward[2] * 150];
  const ndc = projectToLightNdc(ls.viewProjection, p);
  assert.ok(ndc[2] >= -1 && ndc[2] <= 1, `caster toward light clipped out of depth: ${ndc[2]}`);
});

test('cache key: stable inside one snap cell, changes across cells and with resolution', () => {
  const a = computeShadowLightSpace(box({ focusXM: 100.0, focusYM: -50.0 }));
  const b = computeShadowLightSpace(box({ focusXM: 101.0, focusYM: -49.5 }));
  const c = computeShadowLightSpace(box({ focusXM: 300.0, focusYM: -50.0 }));
  const d = computeShadowLightSpace(box({ focusXM: 100.0, focusYM: -50.0, resolution: 1024 }));
  assert.equal(a.cacheKey, b.cacheKey, 'small motion must not invalidate the cached terrain depth');
  assert.notEqual(a.cacheKey, c.cacheKey);
  assert.notEqual(a.cacheKey, d.cacheKey);
});

test('sun below the shadow threshold or below the horizon disables shadows with a reason', () => {
  // sin(0.5 deg) ≈ 0.0087 < SHADOW_MIN_SUN_SIN (0.03): below the threshold.
  const low = computeShadowLightSpace(box({ sunDirDisplay: sunAt(0.5) }));
  assert.equal(low.enabled, false);
  assert.equal(low.reason, 'sun-below-shadow-threshold');
  const night = computeShadowLightSpace(box({ sunDirDisplay: sunAt(-20) }));
  assert.equal(night.enabled, false);
});

test('invalid inputs are rejected, not silently accepted', () => {
  assert.throws(() => computeShadowLightSpace(box({ radiusM: 0 })), RangeError);
  assert.throws(() => computeShadowLightSpace(box({ resolution: 0 })), RangeError);
  assert.throws(() => computeShadowLightSpace(box({ zMinM: 10, zMaxM: 0 })), RangeError);
  assert.throws(() => computeShadowLightSpace(box({ focusXM: NaN })), RangeError);
  assert.throws(() => computeShadowLightSpace(box({ sunDirDisplay: [0, 0, 0] })), RangeError);
});

test('multiply4 with identity returns the matrix unchanged', () => {
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const M = new Float32Array(Array.from({ length: 16 }, (_, i) => i * 0.5 - 2));
  assert.deepEqual(Array.from(multiply4(I, M)), Array.from(M));
  assert.deepEqual(Array.from(multiply4(M, I)), Array.from(M));
});

test('receiver bias: at least the constant term, monotone in slope, bounded by the tan clamp, finite at grazing', () => {
  const texel = 0.11;
  assert.ok(Math.abs(receiverBiasM(texel, 1) - SHADOW_BIAS.baseBiasM) < 1e-12, 'flat ground gets only the base bias');
  let prev = 0;
  for (let c = 1; c >= 0; c -= 0.05) {
    const b = receiverBiasM(texel, c);
    assert.ok(Number.isFinite(b) && b >= prev - 1e-12, `not monotone at cos ${c}`);
    prev = b;
  }
  const maxBias = SHADOW_BIAS.baseBiasM + SHADOW_BIAS.slopeBiasTexels * texel * SHADOW_BIAS.maxSlopeTan;
  assert.ok(receiverBiasM(texel, 0) <= maxBias + 1e-12, 'grazing bias must be clamped');
  assert.ok(receiverNormalOffsetM(texel) > 0);
});

test('GLSL receiver snippet references only uniforms the renderer declares', () => {
  const src = fs.readFileSync(new URL('../public/js/view/3d/renderer.js', import.meta.url), 'utf8');
  const used = ['uLightVP', 'uShadowMap', 'uShadowParams', 'uShadowLightDir', 'uShadowMode', 'uReceiveShadow'];
  for (const name of used) {
    assert.ok(SHADOW_RECEIVER_GLSL.includes(name), `snippet should use ${name}`);
    assert.ok(new RegExp(`uniform [a-zA-Z0-9]+ ${name};`).test(src), `renderer must declare ${name}`);
  }
  assert.ok(SHADOW_RECEIVER_GLSL.includes('float shadowFactor(vec3 worldPos, vec3 surfaceNormal)'));
});
