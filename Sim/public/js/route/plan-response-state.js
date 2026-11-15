// Pure request-state guard shared by the route UI and its deterministic tests.
export function classifyPlanResponse({
  responseId,
  pendingPlanId,
  pendingEndpointRevision,
  endpointRevision,
  pendingPreference,
  currentPreference,
}) {
  if (responseId !== pendingPlanId || pendingEndpointRevision !== endpointRevision) return 'stale';
  if (pendingPreference !== currentPreference) return 'superseded';
  return 'current';
}
