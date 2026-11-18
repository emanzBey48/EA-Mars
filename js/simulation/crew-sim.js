// Ekip yoldaslari (saf simulasyon; DOM/ag yok). followIndex'teki kisi OYUNCUdur (gercek sim); digerleri ayni
// polyline uzerinde senaryo hiziyla ilerleyen yoldaslardir. Yalniz 2B haritada gosterilir.
// offsetsM: yoldas basina sayi (baslangic yay-uzunlugu, m) veya { arcM, lateralM }.
// autoLayout (varsayilan acik): birlikte modda (tum arcM ~ 0) yoldaslar minimap'te ayrisacak sekilde yol dogrusuna
// dik 4-7 m yan ve 3-6 m arka ofsetle dizilir; ayri modda (arcM > 0) 15-60 m onde ilerler. Bitiste kucuk halkaya yerlesir.

const LATERAL_BASE_M = 4;
const BACK_CYCLE_M = [3, 4.5, 6];
const SPLIT_ARC_MIN_M = 15;
const SPLIT_ARC_MAX_M = 60;
const NORMAL_WINDOW_M = 5; // dik yon, +-5 m'lik kiris ile hesaplanir: kosede ofset ani sicramaz
const ARRIVE_BLEND_M = 10; // son 10 m'de ofset halka yerlesimine yumusakca gecer
const RING_RADIUS_M = 4;

function toPts(polyline) {
  const out = [];
  for (const p of Array.isArray(polyline) ? polyline : []) {
    const x = p?.xM ?? p?.x, y = p?.yM ?? p?.y;
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function buildCum(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return cum;
}

// Yay uzunlugunda nokta; arc < 0 ise ilk dogru geriye, arc > toplam ise son dogru ileriye uzatilir.
function pointAt(pts, cum, arc) {
  const total = cum[cum.length - 1] ?? 0;
  const s = Math.min(total, Math.max(0, arc));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const seg = cum[i] - cum[i - 1];
  const t = seg > 1e-9 ? (s - cum[i - 1]) / seg : 0;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const x = a.x + dx * t, y = a.y + dy * t;
  if (arc < 0) return { x: pts[0].x + ((pts[1].x - pts[0].x) / (cum[1] || 1)) * arc, y: pts[0].y + ((pts[1].y - pts[0].y) / (cum[1] || 1)) * arc };
  return { x, y };
}

function smoothNormal(pts, cum, arc) {
  const total = cum[cum.length - 1];
  const p0 = pointAt(pts, cum, Math.max(-1e6, arc - NORMAL_WINDOW_M));
  const p1 = pointAt(pts, cum, Math.min(total, arc + NORMAL_WINDOW_M));
  let dx = p1.x - p0.x, dy = p1.y - p0.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-9) { dx = pts[pts.length - 1].x - pts[0].x; dy = pts[pts.length - 1].y - pts[0].y; len = Math.hypot(dx, dy) || 1; }
  return { nx: -dy / len, ny: dx / len, tx: dx / len, ty: dy / len };
}

export function createCrewSim({ polyline, count = 1, followIndex = 0, speedMps = 1.2, offsetsM = [], autoLayout = true } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const follow = Number.isInteger(followIndex) ? Math.min(n - 1, Math.max(0, followIndex)) : 0;
  let pts = [], cum = [0];
  const members = [];
  const raw = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (i === follow) continue;
    const o = offsetsM?.[k];
    raw.push({
      i, k,
      arcM: Math.max(0, Number(typeof o === 'number' ? o : o?.arcM) || 0),
      lateralM: Number(typeof o === 'object' ? o?.lateralM : 0) || 0,
    });
    k++;
  }
  const together = autoLayout && raw.every((r) => r.arcM <= 1);
  for (const r of raw) {
    const m = { id: `K${r.i + 1}`, label: `K${r.i + 1}`, arcM: r.arcM, lateralM: r.lateralM, backM: 0, ringRad: (2 * Math.PI * (r.k + 0.5)) / Math.max(1, raw.length) + Math.PI / 2 };
    if (autoLayout) {
      if (together) {
        const side = r.k % 2 === 0 ? 1 : -1;
        m.lateralM = side * Math.min(7, LATERAL_BASE_M + 1.2 * Math.floor(r.k / 2) + 0.5 * (r.k % 2));
        m.backM = BACK_CYCLE_M[r.k % BACK_CYCLE_M.length];
      } else {
        m.arcM = Math.min(SPLIT_ARC_MAX_M, Math.max(SPLIT_ARC_MIN_M, r.arcM));
      }
    }
    members.push(m);
  }
  function nearestArc(p) {
    let best = Infinity, bestArc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 > 1e-12 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      if (d < best) { best = d; bestArc = cum[i - 1] + (cum[i] - cum[i - 1]) * t; }
    }
    return bestArc;
  }
  function setPolyline(poly) {
    // Yeniden planlamada yoldaslar bulunduklari yerden yeni rotaya izdusurulur (sicrama yok).
    const prev = pts.length >= 2 ? members.map((m) => pointAt(pts, cum, m.arcM)) : null;
    pts = toPts(poly);
    cum = pts.length >= 2 ? buildCum(pts) : [0];
    const total = cum[cum.length - 1];
    members.forEach((m, i) => {
      if (prev && pts.length >= 2) m.arcM = nearestArc(prev[i]);
      m.arcM = Math.min(m.arcM, total);
    });
  }
  setPolyline(polyline);
  const speed = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 1.2;

  return {
    setPolyline,
    /** dtSimS: sim saniyesi; speedMultiplier: kullanici zaman carpani (otomatik surus kapaliyken 1). */
    update(dtSimS, speedMultiplier = 1) {
      if (pts.length < 2) return;
      const dt = Number.isFinite(dtSimS) ? Math.max(0, dtSimS) : 0;
      const mult = Number.isFinite(speedMultiplier) ? Math.max(0, speedMultiplier) : 1;
      const total = cum[cum.length - 1];
      for (const m of members) m.arcM = Math.min(total, m.arcM + speed * mult * dt);
    },
    getPositions() {
      if (pts.length < 2) return [];
      const total = cum[cum.length - 1];
      const end = pts[pts.length - 1];
      return members.map((m) => {
        const remaining = Math.max(0, total - m.arcM);
        const w = autoLayout ? Math.min(1, remaining / ARRIVE_BLEND_M) : 1; // 1: tam ofset, 0: halka
        const arc = m.arcM - m.backM * w;
        const base = pointAt(pts, cum, arc);
        const { nx, ny } = smoothNormal(pts, cum, Math.min(total, Math.max(0, arc)));
        let x = base.x + nx * m.lateralM * w, y = base.y + ny * m.lateralM * w;
        if (autoLayout && w < 1) {
          const ringW = 1 - w;
          x += Math.cos(m.ringRad) * RING_RADIUS_M * ringW;
          y += Math.sin(m.ringRad) * RING_RADIUS_M * ringW;
        }
        return {
          id: m.id, label: m.label, xM: x, yM: y,
          arcM: m.arcM, remainingM: remaining, arrived: m.arcM >= total - 1e-9,
        };
      });
    },
    count: () => members.length,
  };
}

