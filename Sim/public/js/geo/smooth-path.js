// Görsel rota yumuşatma: ham (ızgara A*) polyline köşelerini Chaikin köşe kesme ile yuvarlar.
// Saf fonksiyon: DOM, ağ, durum yok. Yalnız ÇİZİM içindir; planlanan rota, maliyet veya yürünebilirlik hesabını değiştirmez.
// Girdi {x,y} veya {xM,yM} olabilir; çıktı aynı anahtar biçimindedir. Uç noktalar (keepEnds) korunur.

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const MAX_ITERATIONS = 5;
const MAX_POINTS = 20000;

function keysOf(points) {
  for (const p of points) {
    if (p && isFiniteNumber(p.xM) && isFiniteNumber(p.yM)) return ['xM', 'yM'];
    if (p && isFiniteNumber(p.x) && isFiniteNumber(p.y)) return ['x', 'y'];
  }
  return ['xM', 'yM'];
}

// Aynı doğrultudaki ara noktaları at: köşe kesme uzun düz parçalar üzerinde etkili olsun.
function dropCollinear(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (scale > 0 && Math.abs(cross) / scale < 1e-6) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function chaikin(pts, keepEnds, maxCutM) {
  const n = pts.length;
  const out = [];
  if (keepEnds) out.push(pts[0]);
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const r = Math.min(0.25, maxCutM / len);
    const first = i === 0 && keepEnds;
    const last = i === n - 2 && keepEnds;
    if (!first) out.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
    if (!last) out.push([b[0] - (b[0] - a[0]) * r, b[1] - (b[1] - a[1]) * r]);
  }
  if (keepEnds) out.push(pts[n - 1]);
  return out;
}

/**
 * @param {Array<{x:number,y:number}|{xM:number,yM:number}>} points
 * @param {{iterations?:number, keepEnds?:boolean, minSpacingM?:number, maxCutM?:number}} [options]
 * @returns {Array<object>} yeni dizi; girdi değiştirilmez. Geçersiz girdi -> [].
 */
export function smoothPolyline(points, { iterations = 2, keepEnds = true, minSpacingM = 1.5, maxCutM = 6 } = {}) {
  if (!Array.isArray(points)) return [];
  const [kx, ky] = keysOf(points);
  const clean = [];
  for (const p of points) {
    if (p && isFiniteNumber(p[kx]) && isFiniteNumber(p[ky])) clean.push([p[kx], p[ky]]);
  }
  const wrap = (arr) => arr.map(([x, y]) => ({ [kx]: x, [ky]: y }));
  if (clean.length < 3) return wrap(clean);

  const iters = Math.max(0, Math.min(MAX_ITERATIONS, Math.floor(isFiniteNumber(iterations) ? iterations : 2)));
  const cut = isFiniteNumber(maxCutM) && maxCutM > 0 ? maxCutM : 6;
  let pts = dropCollinear(clean);
  for (let i = 0; i < iters; i++) {
    if (pts.length * 2 > MAX_POINTS) break;
    pts = chaikin(pts, keepEnds, cut);
  }
  if (!keepEnds && pts.length === 0) return [];

  const spacing = isFiniteNumber(minSpacingM) && minSpacingM > 0 ? minSpacingM : 0;
  if (spacing > 0 && pts.length > 2) {
    const thin = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = thin[thin.length - 1];
      if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= spacing) thin.push(pts[i]);
    }
    const lastPt = pts[pts.length - 1];
    const prev = thin[thin.length - 1];
    // Son nokta daima korunur; öncekine çok yakınsa önceki atılır (uç hedef değişmez).
    if (thin.length > 1 && Math.hypot(lastPt[0] - prev[0], lastPt[1] - prev[1]) < spacing * 0.5) thin.pop();
    thin.push(lastPt);
    pts = thin;
  }
  return wrap(pts);
}

const smoothCache = new WeakMap();

/** smoothPolyline sonucunu girdi dizisi kimliğine göre önbellekler (ham rota dizisi değişmedikçe yeniden hesaplanmaz). */
export function smoothPolylineCached(points, options = {}) {
  if (!Array.isArray(points)) return [];
  const key = `${options.iterations ?? 2}|${options.keepEnds ?? true}|${options.minSpacingM ?? 1.5}|${options.maxCutM ?? 6}|${points.length}`;
  let entry = smoothCache.get(points);
  if (entry && entry.key === key) return entry.value;
  const value = smoothPolyline(points, options);
  smoothCache.set(points, { key, value });
  return value;
}
