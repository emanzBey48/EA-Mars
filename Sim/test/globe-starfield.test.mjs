import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStarField, makeGalaxyPixels, STAR_COUNT } from '../public/js/view/globe/globe.js';

test('yildiz alani tohumlu ve deterministik', () => {
  const a = makeStarField(500, 7), b = makeStarField(500, 7), c = makeStarField(500, 8);
  assert.deepEqual(a.pos, b.pos); assert.deepEqual(a.color, b.color); assert.deepEqual(a.data, b.data);
  assert.notDeepEqual(a.pos, c.pos);
  assert.equal(makeStarField().count, STAR_COUNT);
});

test('yildiz parametreleri sinirlar icinde, cogu sonuk', () => {
  const s = makeStarField(STAR_COUNT);
  let dim = 0;
  for (let i = 0; i < s.count; i++) {
    const size = s.data[i * 2], br = s.data[i * 2 + 1];
    assert.ok(size >= 1 && size <= 4.3, `size ${size}`);
    assert.ok(br >= 0.1 && br <= 1, `bright ${br}`);
    if (br < 0.35) dim++;
    assert.ok(Math.abs(Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]) - 40) < 1e-3);
    for (let k = 0; k < 3; k++) assert.ok(s.color[i * 3 + k] >= 0.6 && s.color[i * 3 + k] <= 1);
  }
  assert.ok(dim / s.count > 0.6);
});

test('galaksi bandi deterministik ve soluk (kanal <= 0.25)', () => {
  const a = makeGalaxyPixels(96, 48, 1), b = makeGalaxyPixels(96, 48, 1);
  assert.deepEqual(a, b);
  let max = 0;
  for (let i = 0; i < a.length; i += 4) { max = Math.max(max, a[i], a[i + 1], a[i + 2]); assert.equal(a[i + 3], 255); }
  assert.ok(max <= Math.ceil(0.25 * 255) + 1, `max ${max}`);
  assert.ok(max > 10);
});
