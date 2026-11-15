import { STATUS as WALKABILITY_STATUS } from '../route/cost-model.js';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Build a camera-independent ground guide from a successful planned route.
 * Each interval is sampled against the active surface provider; an unknown sample breaks the line.
 * When `ribbonHalfWidthM > 0`, parallel left/right rails are also sampled to improve near-field
 * 3D readability without bridging across no-data cells.
 */
export function buildPlannedRouteLinePositions({
  route,
  surfaceProvider,
  displayConfig,
  maxSampleSpacingM,
  liftDisplayM = 0.12,
  heightOffsetM,
  ribbonHalfWidthM = 0,
} = {}) {
  if (route?.status !== 'ok' || !Array.isArray(route.path) || route.path.length < 2) return new Float32Array();
  if (typeof surfaceProvider?.sampleElevation !== 'function') return new Float32Array();
  const reference = displayConfig?.referenceElevationM;
  const scale = displayConfig?.verticalScale;
  const cellSize = surfaceProvider.cellSizeM;
  const lift = isFiniteNumber(heightOffsetM) ? heightOffsetM : liftDisplayM;
  if (![reference, scale, cellSize, lift].every(isFiniteNumber) || scale <= 0 || cellSize <= 0) return new Float32Array();
  const spacing = isFiniteNumber(maxSampleSpacingM) && maxSampleSpacingM > 0
    ? Math.min(maxSampleSpacingM, cellSize, 4)
    : Math.min(4, Math.max(0.25, cellSize * 0.5));
  const halfWidth = isFiniteNumber(ribbonHalfWidthM) && ribbonHalfWidthM > 0 ? ribbonHalfWidthM : 0;
  const positions = [];
  let previousCenter = null;
  let previousLeft = null;
  let previousRight = null;

  const sampleVertex = (xM, yM, extraLift = lift) => {
    const sample = surfaceProvider.sampleElevation(xM, yM);
    if (sample?.status !== 'ok' || !isFiniteNumber(sample.value)) return null;
    return [xM, yM, (sample.value - reference) * scale + extraLift];
  };

  const appendCenterSample = (xM, yM) => {
    const current = sampleVertex(xM, yM, lift);
    if (!current) {
      previousCenter = null;
      return;
    }
    if (previousCenter && (previousCenter[0] !== current[0] || previousCenter[1] !== current[1])) {
      positions.push(...previousCenter, ...current);
    }
    previousCenter = current;
  };

  const appendRailSample = (xM, yM, nx, ny) => {
    const railLift = Math.max(0.06, lift * 0.88);
    const left = sampleVertex(xM + nx * halfWidth, yM + ny * halfWidth, railLift);
    if (!left) {
      previousLeft = null;
    } else {
      if (previousLeft && (previousLeft[0] !== left[0] || previousLeft[1] !== left[1])) {
        positions.push(...previousLeft, ...left);
      }
      previousLeft = left;
    }
    const right = sampleVertex(xM - nx * halfWidth, yM - ny * halfWidth, railLift);
    if (!right) {
      previousRight = null;
    } else {
      if (previousRight && (previousRight[0] !== right[0] || previousRight[1] !== right[1])) {
        positions.push(...previousRight, ...right);
      }
      previousRight = right;
    }
  };

  for (let index = 1; index < route.path.length; index++) {
    const a = route.path[index - 1], b = route.path[index];
    if (![a?.xM, a?.yM, b?.xM, b?.yM].every(isFiniteNumber)) {
      previousCenter = null;
      previousLeft = null;
      previousRight = null;
      continue;
    }
    const dx = b.xM - a.xM, dy = b.yM - a.yM;
    const length = Math.hypot(dx, dy);
    const nx = length > 1e-6 ? -dy / length : 0;
    const ny = length > 1e-6 ? dx / length : 0;
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const sx = a.xM + dx * t;
      const sy = a.yM + dy * t;
      appendCenterSample(sx, sy);
      if (halfWidth > 0 && length > 1e-6) {
        appendRailSample(sx, sy, nx, ny);
      }
    }
  }
  return new Float32Array(positions);
}

function normalizeRadians(angle) {
  let value = (angle + Math.PI) % (Math.PI * 2);
  if (value < 0) value += Math.PI * 2;
  return value - Math.PI;
}

function currentWalkability(route, position, surface, heatmap) {
  const slope = surface?.slope;
  const slopeDeg = slope?.status === 'ok' && isFiniteNumber(slope.value) ? slope.value : null;
  const maxSlopeDeg = route?.provenance?.parameters?.find((p) => p?.name === 'maxSlopeDeg')?.value;
  if (route?.mode !== 'eva_walkability') {
    return {
      available: false, slopeDeg,
      slopeWarning: isFiniteNumber(maxSlopeDeg) && slopeDeg !== null && slopeDeg >= maxSlopeDeg,
      reason: 'Bu çözünürlükte EVA puanı üretilmiyor.',
    };
  }
  if (surface?.elevation?.status !== 'ok' || !isFiniteNumber(surface.elevation.value) || slopeDeg === null) {
    return { available: false, slopeDeg, reason: 'Mevcut yüzey/eğim örneği geçerli değil; EVA puanı bilinmiyor.' };
  }
  if (!heatmap || !(heatmap.score instanceof Uint8Array) || !(heatmap.status instanceof Uint8Array) ||
      heatmap.score.length !== heatmap.rows * heatmap.cols || heatmap.status.length !== heatmap.rows * heatmap.cols ||
      ![heatmap.nwXM, heatmap.nwYM, heatmap.cellSizeM].every(isFiniteNumber) || heatmap.cellSizeM <= 0) {
    return { available: false, slopeDeg, reason: 'Yürünebilirlik alanı kullanılamıyor.' };
  }
  const col = Math.floor((position.xM - heatmap.nwXM) / heatmap.cellSizeM);
  const row = Math.floor((heatmap.nwYM - position.yM) / heatmap.cellSizeM);
  if (row < 0 || col < 0 || row >= heatmap.rows || col >= heatmap.cols) {
    return { available: false, slopeDeg, reason: 'Konum planlama alanı dışında; EVA puanı bilinmiyor.' };
  }
  const index = row * heatmap.cols + col;
  const status = heatmap.status[index];
  if (status !== WALKABILITY_STATUS.OK) {
    const statusReason = status === WALKABILITY_STATUS.TOO_STEEP
      ? 'Eğim, rota modelindeki senaryo eşiğinde veya üzerinde.'
      : 'Geçerli yürünebilirlik değeri yok; hücre bilinmiyor/geçilemez.';
    return { available: false, status, slopeDeg, slopeWarning: status === WALKABILITY_STATUS.TOO_STEEP, reason: statusReason };
  }
  return {
    available: true,
    score: heatmap.score[index],
    slopeDeg,
    slopeWarning: Number.isFinite(maxSlopeDeg) && slopeDeg !== null && slopeDeg >= maxSlopeDeg,
    maxSlopeDeg: isFiniteNumber(maxSlopeDeg) ? maxSlopeDeg : null,
  };
}

/** Derive next route-cell navigation and current-cell indicators for first-person HUD presentation. */
export function derivePlannedRouteGuidance({ route, position, headingRad, surface, heatmap } = {}) {
  if (route?.status !== 'ok' || !Array.isArray(route.path) || route.path.length < 2 ||
      !isFiniteNumber(position?.xM) || !isFiniteNumber(position?.yM)) return { active: false };
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < route.path.length; i++) {
    const point = route.path[i];
    if (!isFiniteNumber(point?.xM) || !isFiniteNumber(point?.yM)) continue;
    const d = Math.hypot(point.xM - position.xM, point.yM - position.yM);
    if (d < nearestDistance) { nearestDistance = d; nearestIndex = i; }
  }
  if (!Number.isFinite(nearestDistance)) return { active: false };
  let targetIndex = Math.min(route.path.length - 1, nearestIndex + 1);
  const target = route.path[targetIndex];
  const dx = target.xM - position.xM, dy = target.yM - position.yM;
  const bearingRad = Math.atan2(dy, dx);
  const relativeRad = isFiniteNumber(headingRad) ? normalizeRadians(bearingRad - headingRad) : null;
  return {
    active: true,
    nextPoint: { xM: target.xM, yM: target.yM, row: target.row ?? null, col: target.col ?? null },
    distanceM: Math.hypot(dx, dy),
    bearingDeg: (bearingRad * 180 / Math.PI + 360) % 360,
    relativeDeg: relativeRad === null ? null : relativeRad * 180 / Math.PI,
    atDestination: targetIndex === route.path.length - 1,
    mode: route.mode,
    walkability: currentWalkability(route, position, surface, heatmap),
  };
}

export function formatRouteDirection(relativeDeg) {
  if (!isFiniteNumber(relativeDeg)) return 'yön bilinmiyor';
  const absolute = Math.abs(relativeDeg);
  const side = absolute < 22.5 ? 'ön' : absolute > 157.5 ? 'arka' : relativeDeg > 0 ? 'sol' : 'sağ';
  return `${side} · ${Math.round(relativeDeg)}°`;
}
