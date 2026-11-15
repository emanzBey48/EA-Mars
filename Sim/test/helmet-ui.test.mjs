import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSpeedMultiplier } from '../public/js/view/auto-drive-controls.js';
import { resolveWarning, WARNING_DEFAULT_TTL_MS } from '../public/js/view/helmet.js';

test('clampSpeedMultiplier kenetler ve 0.5 adıma yuvarlar', () => {
  assert.equal(clampSpeedMultiplier(0), 0.5);
  assert.equal(clampSpeedMultiplier(-3), 0.5);
  assert.equal(clampSpeedMultiplier(99), 10);
  assert.equal(clampSpeedMultiplier(1.3), 1.5);
  assert.equal(clampSpeedMultiplier(1.2), 1);
  assert.equal(clampSpeedMultiplier('4'), 4);
  assert.equal(clampSpeedMultiplier(NaN), 1);
});

test('resolveWarning ttl ve seviye mantığı', () => {
  assert.equal(resolveWarning('x').ttlMs, WARNING_DEFAULT_TTL_MS);
  assert.equal(resolveWarning('x', { ttlMs: 2500 }).ttlMs, 2500);
  assert.equal(resolveWarning('x', { ttlMs: -1 }).ttlMs, WARNING_DEFAULT_TTL_MS);
  assert.equal(resolveWarning('x', { ttlMs: 1e9 }).ttlMs, 60000);
  assert.equal(resolveWarning('x', { level: 'warn' }).level, 'warn');
  assert.equal(resolveWarning('x', { level: 'zzz' }).level, 'info');
  assert.equal(resolveWarning('   ').visible, false);
});
