// Auto-drive (tanitim videosu / sunum): saf, deterministik rota takip mantigi.
// DOM, ag, dosya ve sim state'i yok. Yerel metre duzleminde calisir (x dogu, y kuzey; yaw = atan2(y, x)).
// Cikti sim'in mevcut stepFirstPerson girdisine ({moveX, moveY, headingRad}) cevrilebilir; bkz. stage-auto-drive-integration.md.
// Hiz carpani bir sunum/zaman ayaridir; fizik parametresi veya "guvenli rota" iddiasi degildir.

export const SPEED_MULTIPLIER_MIN = 0.5;
export const SPEED_MULTIPLIER_MAX = 10;
export const SPEED_MULTIPLIER_STEP = 0.5;
const TAU = Math.PI * 2;

/** Rota noktasini {x,y} (veya planlayici {xM,yM}) bicimine normalize eder; gecersizse null. */
function toPt(p) {
  if (!p) return null;
  const x = Number.isFinite(p.x) ? p.x : p.xM;
  const y = Number.isFinite(p.y) ? p.y : p.yM;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizePolyline(pts) {
  if (!Array.isArray(pts)) return [];
  const out = [];
  for (const p of pts) {
    const q = toPt(p);
    if (!q) continue;
    const last = out[out.length - 1];
    if (last && last.x === q.x && last.y === q.y) continue; // ardisik tekrar noktalarini at
    out.push(q);
  }
  return out;
}

/** Hiz carpanini [0.5, 10] araligina kenetler ve 0.5 adima yuvarlar. Sonlu olmayan -> 1. */
export function clampSpeedMultiplier(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  const stepped = Math.round(v / SPEED_MULTIPLIER_STEP) * SPEED_MULTIPLIER_STEP;
  return Math.min(SPEED_MULTIPLIER_MAX, Math.max(SPEED_MULTIPLIER_MIN, stepped));
}

/** b - a farkinin (-pi, pi] araligina sarilmis en kisa isaretli acisi. */
export function shortestAngleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

export function polylineLengthM(pts) {
  const p = normalizePolyline(pts);
  let len = 0;
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return len;
}

/**
 * Noktanin polyline'a en yakin izdusumu (her segmente dik izdusum, uclara kenetli).
 * @returns {{point:{x:number,y:number}, index:number, t:number, distanceM:number, arcM:number}|null}
 *   index = segment indeksi (pts[index]->pts[index+1]), t in [0,1], arcM = polyline basindan yay uzunlugu.
 */
export function nearestPointOnPolyline(pts, p) {
  const poly = normalizePolyline(pts);
  const q = toPt(p);
  if (!q || poly.length === 0) return null;
  if (poly.length === 1) {
    return { point: { ...poly[0] }, index: 0, t: 0, distanceM: Math.hypot(q.x - poly[0].x, q.y - poly[0].y), arcM: 0 };
  }
  let best = null;
  let arc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2)) : 0;
    const px = a.x + dx * t, py = a.y + dy * t;
    const d = Math.hypot(q.x - px, q.y - py);
    if (!best || d < best.distanceM) best = { point: { x: px, y: py }, index: i, t, distanceM: d, arcM: arc + segLen * t };
    arc += segLen;
  }
  return best;
}

function pointAtArc(poly, cum, s) {
  const total = cum[cum.length - 1];
  if (s <= 0) return { ...poly[0] };
  if (s >= total) return { ...poly[poly.length - 1] };
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const segLen = cum[i] - cum[i - 1];
  const t = segLen > 0 ? (s - cum[i - 1]) / segLen : 0;
  return { x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * t, y: poly[i - 1].y + (poly[i].y - poly[i - 1].y) * t };
}

/**
 * @param {{routePolyline?:Array<{x:number,y:number}>, arriveRadiusM?:number, rejoinThresholdM?:number,
 *          maxYawRateRadPerS?:number, lookAheadMinM?:number, lookAheadMaxM?:number, slowdownRadiusM?:number}} opts
 */
export function createAutoDrive({
  routePolyline = [],
  arriveRadiusM = 3,
  rejoinThresholdM = 20,
  maxYawRateRadPerS = 1.5, // ~86 deg/s gercek-zaman tavani (sim zaman carpanindan bagimsiz)
  maxYawAccelRadPerS2 = 4,
  maxYawJerkRadPerS3 = 20,
  walkSpeedMps = 1.2, // kose yavaslamasi icin referans yurume hizi (zaman carpani uygulanmadan)
  cornerArcM = 4, // bir kose donusunun tarayacagi yol uzunlugu (yavaslama olcutu)
  cornerDecelMps2 = 3,
  lookAheadMinM = 3,
  lookAheadMaxM = 6,
  slowdownRadiusM = 8,
  minSlowdown = 0.35,
  maxForwardAngleRad = 0.9, // hedefe aci hatasi bundan buyukse yuruyus durur, yerinde doner
} = {}) {
  let poly = [];
  let cum = [0];
  let enabled = false;
  let paused = false;
  let mult = 1;
  let phase = 'idle';
  let arcM = 0; // takip edilen yay uzunlugu (tekdüze artar)
  let snapPoint = null;
  let slowdown = 1;
  let cornerSlow = 1;
  let yawRate = 0;
  let yawAcc = 0;
  let lastOutYaw = null;

  function resetYawDynamics() { yawRate = 0; yawAcc = 0; lastOutYaw = null; }

  function setPolyline(pts) {
    poly = normalizePolyline(pts);
    cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
    phase = 'idle';
    arcM = 0;
    snapPoint = null;
    slowdown = 1;
    cornerSlow = 1;
    resetYawDynamics();
  }
  setPolyline(routePolyline);

  const totalLen = () => cum[cum.length - 1];
  const hasRoute = () => poly.length >= 2 && totalLen() > 0;

  function engage(playerPos) {
    const n = hasRoute() ? nearestPointOnPolyline(poly, playerPos) : null;
    if (!n) return { action: 'replan', snapPoint: null, distanceM: null, pathIndex: -1 };
    if (n.distanceM <= rejoinThresholdM) {
      snapPoint = n.point;
      arcM = n.arcM;
      phase = n.distanceM <= arriveRadiusM ? 'following' : 'approaching-line';
      slowdown = 1;
      return { action: 'rejoin-line', snapPoint: { ...n.point }, distanceM: n.distanceM, pathIndex: n.index };
    }
    phase = 'idle'; // entegrator yeni rota cizip setPolyline + engage cagirana kadar bekler
    return { action: 'replan', snapPoint: { ...n.point }, distanceM: n.distanceM, pathIndex: n.index };
  }

  function progressFrac() {
    return hasRoute() ? Math.min(1, Math.max(0, arcM / totalLen())) : 0;
  }

  /** Yaklasan koselerin izin verdigi azami yurume hizi (m/s); hiz carpani uygulanmadan sonra oran olarak kullanilir. */
  function cornerAllowedSpeed(fromArc) {
    let allowed = Infinity;
    for (let i = 1; i < poly.length - 1; i++) {
      const d = cum[i] - fromArc;
      if (d < -2) continue;
      if (d > 60) break;
      const a1 = Math.atan2(poly[i].y - poly[i - 1].y, poly[i].x - poly[i - 1].x);
      const a2 = Math.atan2(poly[i + 1].y - poly[i].y, poly[i + 1].x - poly[i].x);
      const theta = Math.abs(shortestAngleDelta(a1, a2));
      if (theta < 0.25) continue;
      const vc = Math.max(1.5, (maxYawRateRadPerS * cornerArcM) / theta);
      allowed = Math.min(allowed, Math.sqrt(vc * vc + 2 * cornerDecelMps2 * Math.max(0, d)));
    }
    return allowed;
  }

  function stepYaw(yaw, err, dt) {
    // Hiz limiti + ivme limiti + jerk limiti: aci hatasina gore hedef hiz profili (sqrt), iki kat integral.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    let y = yaw;
    let e = err;
    for (let i = 0; i < n; i++) {
      const sgn = e < 0 ? -1 : 1;
      const vdes = sgn * Math.min(maxYawRateRadPerS, Math.sqrt(2 * maxYawAccelRadPerS2 * 0.6 * Math.abs(e)));
      const aTarget = Math.max(-maxYawAccelRadPerS2, Math.min(maxYawAccelRadPerS2, (vdes - yawRate) / 0.15));
      const da = maxYawJerkRadPerS3 * h;
      yawAcc += Math.max(-da, Math.min(da, aTarget - yawAcc));
      yawRate += yawAcc * h;
      yawRate = Math.max(-maxYawRateRadPerS, Math.min(maxYawRateRadPerS, yawRate));
      const dy = yawRate * h;
      y += dy;
      e -= dy;
    }
    return y;
  }

  function update(dtWallS, playerPos, playerYawRad = 0) {
    const dt = Number.isFinite(dtWallS) ? Math.max(0, dtWallS) : 0;
    const yaw = Number.isFinite(playerYawRad) ? playerYawRad : 0;
    const base = (extra = {}) => ({
      steerYawRad: yaw, forward: false, arrived: phase === 'arrived', targetPoint: null,
      progressFrac: progressFrac(), phase, ...extra,
    });
    const pos = toPt(playerPos);
    if (!enabled || !pos || !hasRoute() || phase === 'idle') return base();
    if (phase === 'arrived') return base({ arrived: true, progressFrac: 1 });

    const end = poly[poly.length - 1];
    const distEnd = Math.hypot(end.x - pos.x, end.y - pos.y);
    if (distEnd <= arriveRadiusM) {
      phase = 'arrived';
      arcM = totalLen();
      return base({ arrived: true, targetPoint: { ...end }, progressFrac: 1 });
    }

    let target;
    if (phase === 'approaching-line') {
      target = snapPoint ?? nearestPointOnPolyline(poly, pos).point;
      if (Math.hypot(target.x - pos.x, target.y - pos.y) <= Math.min(arriveRadiusM, 1.5)) phase = 'following';
    }
    if (phase === 'following') {
      const n = nearestPointOnPolyline(poly, pos);
      if (n.distanceM > rejoinThresholdM) {
        // Cizgiden cok uzaklasildi: en yakin noktaya don, entegrator isterse engage() ile replan karari alir.
        snapPoint = n.point;
        arcM = n.arcM;
        phase = 'approaching-line';
        target = n.point;
      } else {
        // Yay ilerlemesi geri gitmez (kendini kesen rotalarda sicrama olmasin); makul pencere icinde ilerler.
        if (n.arcM >= arcM && n.arcM - arcM <= 2 * rejoinThresholdM + lookAheadMaxM) arcM = n.arcM;
        const remaining = totalLen() - arcM;
        const look = Math.min(lookAheadMaxM, Math.max(lookAheadMinM, 0.5 * n.distanceM + lookAheadMinM));
        target = pointAtArc(poly, cum, arcM + Math.min(look, remaining));
      }
    }

    const desired = Math.atan2(target.y - pos.y, target.x - pos.x);
    const err = shortestAngleDelta(yaw, desired);
    if (lastOutYaw !== null && Math.abs(shortestAngleDelta(lastOutYaw, yaw)) > 0.2) { yawRate = 0; yawAcc = 0; }
    const steerYawRad = paused ? yaw : stepYaw(yaw, err, dt);
    if (paused) { yawRate = 0; yawAcc = 0; }
    lastOutYaw = steerYawRad;
    const allowed = cornerAllowedSpeed(arcM);
    cornerSlow = Number.isFinite(allowed) ? Math.min(1, allowed / (walkSpeedMps * mult)) : 1;
    slowdown = distEnd < slowdownRadiusM ? Math.max(minSlowdown, distEnd / slowdownRadiusM) : 1;
    const residual = Math.abs(shortestAngleDelta(steerYawRad, desired));
    const forward = !paused && residual <= maxForwardAngleRad;
    return {
      steerYawRad: paused ? yaw : steerYawRad,
      forward,
      arrived: false,
      targetPoint: { x: target.x, y: target.y },
      progressFrac: progressFrac(),
      phase,
    };
  }

  return {
    setPolyline,
    setEnabled(v) { enabled = Boolean(v); if (!enabled && phase !== 'arrived') phase = 'idle'; },
    isEnabled: () => enabled,
    setSpeedMultiplier(n) { mult = clampSpeedMultiplier(n); return mult; },
    getSpeedMultiplier: () => mult,
    setPaused(v) { paused = Boolean(v); },
    isPaused: () => paused,
    engage,
    update,
    /** sim dt'sine uygulanacak carpan: duraklatilmis/devre disi -> 0; varisa yaklasirken yavaslama dahil. */
    effectiveTimeScaleMultiplier: () => (!enabled || paused ? 0 : mult * (phase === 'following' ? Math.min(slowdown, cornerSlow) : 1)),
  };
}

