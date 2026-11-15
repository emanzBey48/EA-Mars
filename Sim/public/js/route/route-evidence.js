// Evidence attached to a planned EVA route. These are data checks and model limits,
// never a probability of safety or a certificate that the route is traversable.
// Pure module: no DOM, file/network access, mutable singleton, or raster sampling.

export const ROUTE_EVIDENCE_SCHEMA = 'marswalk.route-evidence.v1';

const isFinitePositive = (value) => Number.isFinite(value) && value > 0;
const isFiniteNonNegative = (value) => Number.isFinite(value) && value >= 0;

function freezePlain(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePlain(child);
    Object.freeze(value);
  }
  return value;
}

function label(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function datumEvidence(descriptor) {
  const rawEvidence = descriptor?.verticalDatumEvidence;
  const evidence = label(rawEvidence) ?? label(rawEvidence?.sourceUrl);
  const verified = descriptor?.verticalDatumVerified === true && evidence !== null;
  const explicitlyUnverified = descriptor?.verticalDatumVerified === false ||
    (descriptor?.verticalDatumVerified === true && evidence === null);
  return {
    status: verified ? 'verified' : explicitlyUnverified ? 'unverified' : 'unknown',
    name: label(descriptor?.verticalDatum),
    evidence: verified ? evidence : null,
  };
}

function unavailable(reason, data, limitations) {
  return freezePlain({
    schema: ROUTE_EVIDENCE_SCHEMA,
    status: 'unavailable',
    reason,
    eta: null,
    data,
    limitations,
    safetyCertification: false,
    reliabilityProbability: null,
  });
}

/**
 * Summarize what a completed route actually supports. `scenarioSpeedMps` and
 * `timeScale` must come from the active scenario; if omitted, only the speed
 * recorded by the route result may be used. No fallback speed is invented.
 */
export function summarizeRouteEvidence({
  route,
  descriptor = null,
  providerStatus = null,
  scenarioSpeedMps = null,
  timeScale = null,
} = {}) {
  const accessStatus = label(providerStatus) ?? label(descriptor?.access?.status);
  const resolutionM = isFinitePositive(route?.resolution?.cellSizeM) ? route.resolution.cellSizeM : null;
  const datum = datumEvidence(descriptor);
  const data = {
    source: label(descriptor?.source),
    product: label(descriptor?.product),
    attribution: label(descriptor?.attribution),
    license: label(descriptor?.license),
    providerStatus: accessStatus,
    validationStatus: label(descriptor?.validation?.status),
    resolutionM,
    resolutionClass: label(route?.resolution?.class),
    verticalDatum: datum,
    pathElevationProfile: route?.stats?.elevationProfileComplete === true ? 'complete'
      : route?.stats?.elevationProfileComplete === false ? 'incomplete' : 'unknown',
    plannedPathImpassableCrossings: Number.isSafeInteger(route?.stats?.impassableCrossings)
      ? route.stats.impassableCrossings : null,
    straightLineUnknownCells: Number.isSafeInteger(route?.stats?.unknownCellsOnStraightLine)
      ? route.stats.unknownCellsOnStraightLine : null,
  };
  const limitations = [
    'Bu bir planlama göstergesidir; güvenli rota sertifikası veya NASA operasyon eşiği değildir.',
    'DTM kaya, regolit, görüş, giysi performansı ve güncel çevre koşullarını doğrulamaz.',
  ];
  if (!route || route.status !== 'ok') {
    return unavailable('Hesaplanmış geçerli rota yok.', data, limitations);
  }
  if (route.mode !== 'eva_walkability' || resolutionM === null || resolutionM > 2) {
    limitations.push('Kaba veya bilinmeyen çözünürlükten yerel EVA güvenilirliği çıkarılmaz.');
    return unavailable('Yerel EVA çözünürlüğünde doğrulanmış rota yok.', data, limitations);
  }
  if (!Array.isArray(route.path) || route.path.length === 0 ||
      !isFiniteNonNegative(route.stats?.lengthM)) {
    return unavailable('Rota geometrisi veya uzunluğu eksik.', data, limitations);
  }
  if (data.pathElevationProfile !== 'complete' || data.plannedPathImpassableCrossings !== 0) {
    limitations.push('Planlı yolun tüm kot/engel hücreleri doğrulanmadı.');
    return unavailable('Rota veri kapsamı eksik.', data, limitations);
  }

  const recordedSpeed = route.stats?.durationAssumption?.value;
  const speedExplicit = scenarioSpeedMps !== null && scenarioSpeedMps !== undefined;
  const speed = speedExplicit ? (isFinitePositive(scenarioSpeedMps) ? scenarioSpeedMps : null)
    : isFinitePositive(recordedSpeed) ? recordedSpeed : null;
  const rawSimSeconds = speed === null ? null : route.stats.lengthM / speed;
  const simSeconds = isFiniteNonNegative(rawSimSeconds) ? rawSimSeconds : null;
  const rawWallSeconds = simSeconds !== null && isFinitePositive(timeScale)
    ? simSeconds / timeScale : null;
  const wallSeconds = isFiniteNonNegative(rawWallSeconds) ? rawWallSeconds : null;
  if (speed === null) limitations.push('Senaryo yürüme hızı bilinmiyor; varış süresi hesaplanmadı.');
  else if (simSeconds === null) limitations.push('Varış süresi sonlu bir değer olarak hesaplanamadı.');
  if (datum.status !== 'verified') limitations.push('Düşey datum doğrulaması eksik veya bilinmiyor.');
  const providerVerified = accessStatus === 'ok' || accessStatus === 'supported';
  if (!providerVerified) {
    limitations.push('Aktif yüzey sağlayıcısının destek durumu doğrulanmadı.');
  }
  if (!data.source || !data.product) limitations.push('Yüzey verisinin kaynak veya ürün kimliği eksik.');
  const evidenceReady = providerVerified && datum.status === 'verified' && data.source !== null && data.product !== null;

  return freezePlain({
    schema: ROUTE_EVIDENCE_SCHEMA,
    status: evidenceReady ? 'ready' : 'limited',
    reason: evidenceReady ? null : 'Rota hesaplandı; veri kökeni veya datum kanıtı eksik.',
    eta: simSeconds === null ? null : {
      simulationSeconds: simSeconds,
      wallSeconds,
      speedMps: speed,
      timeScale: isFinitePositive(timeScale) ? timeScale : null,
      speedSource: isFinitePositive(scenarioSpeedMps) ? 'active_scenario' : 'route_result_assumption',
      method: 'route_length_m / scenario_speed_mps',
      caveat: 'Eğim, duraklama, giysi, yorgunluk ve metabolik etki süre modeline katılmaz.',
    },
    data,
    limitations,
    safetyCertification: false,
    reliabilityProbability: null,
  });
}
