// Deterministic route-following controller for the presentation simulation.
// It follows the active planner polyline; pace variation is an explicit scenario heuristic.
import { paceFactorForSlope } from './walk-pace.js';

export function createAutoDriveController(path, {
  waypointRadiusM = 1.2,
} = {}) {
  if (!Array.isArray(path) || path.length < 2 || path.some((p) => !Number.isFinite(p?.xM) || !Number.isFinite(p?.yM))) {
    return null;
  }
  let targetIndex = 1;
  const points = path.map(({ xM, yM }) => ({ xM, yM }));

  return Object.freeze({
    update(position, slope = {}) {
      if (!Number.isFinite(position?.xM) || !Number.isFinite(position?.yM)) return null;
      while (targetIndex < points.length - 1) {
        const target = points[targetIndex];
        const currentDistance = Math.hypot(target.xM - position.xM, target.yM - position.yM);
        const next = points[targetIndex + 1];
        const nextDistance = Math.hypot(next.xM - position.xM, next.yM - position.yM);
        if (currentDistance > waypointRadiusM && nextDistance >= currentDistance - 0.05) break;
        targetIndex++;
      }
      const target = points[targetIndex];
      const dx = target.xM - position.xM;
      const dy = target.yM - position.yM;
      const distanceM = Math.hypot(dx, dy);
      const slopeDeg = slope?.status === 'ok' && Number.isFinite(slope.value) ? Math.max(0, slope.value) : null;
      // Scenario-only pace adjustment; no empirical suited-astronaut gait model is claimed.
      const paceFactor = paceFactorForSlope(slopeDeg);
      return Object.freeze({
        moveX: distanceM > 1e-6 ? dx / distanceM : 0,
        moveY: distanceM > 1e-6 ? dy / distanceM : 0,
        headingRad: Math.atan2(dy, dx),
        targetIndex,
        targetCount: points.length,
        distanceToTargetM: distanceM,
        slopeDeg,
        paceFactor,
        complete: targetIndex === points.length - 1 && distanceM <= waypointRadiusM,
      });
    },
  });
}
