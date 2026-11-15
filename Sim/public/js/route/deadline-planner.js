// Time-constrained EVA route alternatives. This is a scenario planner, not a safety system.
import { buildFieldForWindow, planWalkingRoute } from './route-service.js';
import { routePreferenceParams } from './route-compare.js';
import { STATUS } from './cost-model.js';
import { paceFactorForSlope } from '../simulation/walk-pace.js';

export const DEADLINE_ROUTE_SCHEMA = 'marswalk.deadline-route.v1';
// Cost weights are candidate-generation scenario values. Unknown cells and the common slope cutoff remain blocked.
export const DEADLINE_COST_K_PROFILES = Object.freeze([1, 9, 30, 100, 300, 700]);

function fieldForDeadlineProfile(referenceField, costK) {
  if (costK === referenceField.params.costK.value) return referenceField;
  const cost = new Float32Array(referenceField.cost.length).fill(Infinity);
  const exponent = referenceField.params.costP.value;
  for (let i = 0; i < cost.length; i++) {
    if (referenceField.status[i] !== STATUS.OK) continue;
    const combinedIndicator = referenceField.score[i] / 100;
    cost[i] = 1 + costK * Math.pow(1 - combinedIndicator, exponent);
  }
  const baseCost = referenceField.params.costK;
  const params = {
    ...referenceField.params,
    costK: { ...baseCost, value: costK, status: 'scenario', source: 'Deadline route candidate profile (scenario weight)' },
  };
  return { ...referenceField, cost, params };
}

function summarizeOnReferenceField(path, field) {
  let minScore = 100, scoreSum = 0, scoreCount = 0;
  for (const point of path) {
    const score = field.score[point.row * field.cols + point.col];
    if (!Number.isFinite(score)) continue;
    minScore = Math.min(minScore, score);
    scoreSum += score;
    scoreCount++;
  }
  return scoreCount ? { minScore, meanScore: scoreSum / scoreCount } : { minScore: null, meanScore: null };
}

function estimateWallEtaS(path, field, cellSizeM, walkSpeedMps, timeScale) {
  let seconds = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const distanceM = Math.hypot(b.row - a.row, b.col - a.col) * cellSizeM;
    const slopeA = field.slopeDeg[a.row * field.cols + a.col];
    const slopeB = field.slopeDeg[b.row * field.cols + b.col];
    const paceA = paceFactorForSlope(slopeA), paceB = paceFactorForSlope(slopeB);
    const paceFactor = (paceA + paceB) / 2;
    seconds += distanceM / (walkSpeedMps * paceFactor * timeScale);
  }
  return seconds;
}

function isSimplePath(path, cols) {
  const ids = new Set(path.map((p) => p.row * cols + p.col));
  return ids.size === path.length;
}

/**
 * Builds loop-free candidate routes using one common DTM score scale and returns the best-scoring route
 * whose scenario wall-clock ETA fits the requested remaining time. All thresholds/weights remain scenario choices.
 */
export function planDeadlineRoutes({ window, referenceField: suppliedReferenceField = null, startLocal, endLocal, deadlineSeconds, walkSpeedMps = 1.2, timeScale = 1 }) {
  if (!window || window.resolutionClass !== 'eva_walkability') {
    return { schema: DEADLINE_ROUTE_SCHEMA, status: 'unavailable', reason: 'Yerel EVA puanı için ~1 m DTM gerekir.', candidates: [], selected: null };
  }
  if (![deadlineSeconds, walkSpeedMps, timeScale].every(Number.isFinite) || deadlineSeconds <= 0 || walkSpeedMps <= 0 || timeScale <= 0) {
    return { schema: DEADLINE_ROUTE_SCHEMA, status: 'invalid_input', reason: 'Kalan süre, senaryo hızı ve zaman ölçeği pozitif ve sonlu olmalı.', candidates: [], selected: null };
  }

  const baseParams = routePreferenceParams('balanced');
  const referenceField = suppliedReferenceField ?? buildFieldForWindow(window, baseParams);
  if (referenceField.rows !== window.rows || referenceField.cols !== window.cols || referenceField.cellSizeM !== window.cellSizeM) {
    return { schema: DEADLINE_ROUTE_SCHEMA, status: 'invalid_input', reason: 'EVA alanı DTM penceresiyle uyuşmuyor.', candidates: [], selected: null };
  }
  const candidates = [];
  const seen = new Set();
  for (const costK of DEADLINE_COST_K_PROFILES) {
    const field = fieldForDeadlineProfile(referenceField, costK);
    const params = baseParams;
    const route = planWalkingRoute({ window, field, params, startLocal, endLocal });
    if (route.status !== 'ok' || route.mode !== 'eva_walkability' || !Array.isArray(route.path) || route.path.length < 2) continue;
    if (!isSimplePath(route.path, window.cols)) continue;
    const key = route.path.map((p) => `${p.row},${p.col}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    const score = summarizeOnReferenceField(route.path, referenceField);
    candidates.push({
      id: `cost-k-${costK}`,
      costK,
      route,
      etaSeconds: estimateWallEtaS(route.path, referenceField, window.cellSizeM, walkSpeedMps, timeScale),
      ...score,
      pathCellCount: route.path.length,
    });
  }

  const feasible = candidates.filter((candidate) => candidate.etaSeconds <= deadlineSeconds);
  feasible.sort((a, b) => b.minScore - a.minScore || b.meanScore - a.meanScore || b.etaSeconds - a.etaSeconds);
  return {
    schema: DEADLINE_ROUTE_SCHEMA,
    status: feasible.length ? 'ok' : candidates.length ? 'deadline_too_short' : 'no_path',
    reason: feasible.length ? null : candidates.length
      ? 'İstenen kalan sürede tamamlanabilecek bir senaryo rotası bulunamadı.'
      : 'Geçerli DTM EVA rota adayı üretilemedi.',
    deadlineSeconds,
    candidates,
    selected: feasible[0] ?? null,
    caveat: 'EVA puanı DTM eğim/pürüzlülük tabanlı senaryo göstergesidir; kaya, regolit, suit/human factors veya güvenliği ölçmez. Rota güvenli rota garantisi değildir.',
  };
}
