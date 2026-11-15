import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothPolyline, smoothPolylineCached } from '../public/js/geo/smooth-path.js';

const L = [{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 10 }, { xM: 20, yM: 10 }];
const turn = (p, q, r) => {
  const a = Math.atan2(q.yM - p.yM, q.xM - p.xM);
  const b = Math.atan2(r.yM - q.yM, r.xM - q.xM);
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
};
const maxTurn = (pts) => Math.max(...pts.slice(1, -1).map((q, i) => turn(pts[i], q, pts[i + 2])));

test('endpoints preserved and format kept ({xM,yM} and {x,y})', () => {
  const out = smoothPolyline(L);
  assert.deepEqual(out[0], L[0]);
  assert.deepEqual(out[out.length - 1], L[3]);
  const xy = smoothPolyline(L.map((p) => ({ x: p.xM, y: p.yM })));
  assert.ok('x' in xy[0] && !('xM' in xy[0]));
});

test('corner angle becomes smoother and point count is bounded', () => {
  const out = smoothPolyline(L, { iterations: 3 });
  assert.ok(maxTurn(out) < maxTurn(L) / 1.8, `${maxTurn(out)} vs ${maxTurn(L)}`);
  assert.ok(out.length < 200);
  assert.ok(smoothPolyline(L, { iterations: 99 }).length < 20000);
});

test('no NaN, invalid input safe, input not mutated', () => {
  const copy = JSON.parse(JSON.stringify(L));
  const out = smoothPolyline([...L, { xM: NaN, yM: 1 }, null]);
  assert.ok(out.every((p) => Number.isFinite(p.xM) && Number.isFinite(p.yM)));
  assert.deepEqual(L, copy);
  assert.deepEqual(smoothPolyline(null), []);
  assert.equal(smoothPolyline([{ xM: 1, yM: 2 }]).length, 1);
  assert.equal(smoothPolyline(L, { iterations: 0, minSpacingM: 0 }).length, 4);
});

test('minSpacingM thins points; cached returns same object for same input', () => {
  const dense = Array.from({ length: 50 }, (_, i) => ({ xM: i * 0.2, yM: Math.sin(i / 5) }));
  const out = smoothPolyline(dense, { minSpacingM: 2 });
  assert.ok(out.length < 15);
  assert.equal(smoothPolylineCached(L), smoothPolylineCached(L));
});

