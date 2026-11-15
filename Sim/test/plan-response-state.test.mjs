import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPlanResponse } from '../public/js/route/plan-response-state.js';

const base = {
  responseId: 12,
  pendingPlanId: 12,
  pendingEndpointRevision: 4,
  endpointRevision: 4,
  pendingPreference: 'balanced',
  currentPreference: 'balanced',
};

test('plan response is superseded when preference changed while Worker was planning', () => {
  assert.equal(classifyPlanResponse({ ...base, currentPreference: 'shortest' }), 'superseded');
  assert.equal(classifyPlanResponse({ ...base, currentPreference: 'flattest' }), 'superseded');
});

test('plan response remains current when preference did not change', () => {
  assert.equal(classifyPlanResponse(base), 'current');
});

test('plan response from an old request or endpoint revision remains stale', () => {
  assert.equal(classifyPlanResponse({ ...base, responseId: 11, currentPreference: 'shortest' }), 'stale');
  assert.equal(classifyPlanResponse({ ...base, endpointRevision: 5, currentPreference: 'shortest' }), 'stale');
});
