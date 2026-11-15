// Presentation-only pace adjustment shared by auto-drive playback and deadline ETA estimates.
// These values are not a sourced suited-astronaut gait model.

export const SCENARIO_PACE_MODEL = Object.freeze({
  comfortableSlopeDeg: 5,
  slowdownPerDegree: 0.018,
  minimumFactor: 0.62,
  source: 'Marswalk scenario assumption; not a validated suited-astronaut gait model',
});

export function paceFactorForSlope(slopeDeg) {
  if (!Number.isFinite(slopeDeg)) return 1;
  return Math.max(
    SCENARIO_PACE_MODEL.minimumFactor,
    Math.min(1, 1 - Math.max(0, Math.max(0, slopeDeg) - SCENARIO_PACE_MODEL.comfortableSlopeDeg) * SCENARIO_PACE_MODEL.slowdownPerDegree),
  );
}
