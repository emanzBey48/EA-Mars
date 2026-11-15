import test from 'node:test';
import assert from 'node:assert/strict';
import { etaWarningText, crewLabel, regionBadgeText, subSteps } from '../public/js/app/demo-flow.js';

test('etaWarningText: yalnız süre aşılırsa uyarır, güvenli rota dili yok', () => {
  assert.equal(etaWarningText({ etaS: 600, targetMinutes: 20 }), null);
  const t = etaWarningText({ etaS: 1800, targetMinutes: 20 });
  assert.match(t, /rota ≈ 30 dk, istenen 20 dk/);
  assert.doesNotMatch(t, /güvenli rota/i);
  assert.equal(etaWarningText({ etaS: 1800, targetMinutes: null }), null);
  assert.match(etaWarningText({ lengthM: 3600, targetMinutes: 10 }), /50 dk/);
});
test('crewLabel yalnız 2+ kişide', () => {
  assert.equal(crewLabel({ count: 1 }), null);
  assert.equal(crewLabel({ count: 3, mode: 'split', followIndex: 1 }), 'Kişi 2/3 takip ediliyor · ayrı ilerleme');
});
test('regionBadgeText bağlam seçimi', () => {
  assert.equal(regionBadgeText([]), null);
  assert.match(regionBadgeText(['crater', 'delta']), /bağlam seçimi.*crater, delta/);
});
test('subSteps <= 0.05', () => {
  const s = subSteps(0.167);
  assert.ok(s.every((x) => x <= 0.05 + 1e-12));
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 0.167) < 1e-9);
});
