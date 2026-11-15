// Chaikin köşe yumuşatma (saf). Yalnız görsel/sürüş çizgisini yumuşatır; planlayıcı sonucunu değiştirmez.
// Noktalar {x,y} veya {xM,yM}; çıktı {x,y,xM,yM} taşır. Uç noktalar sabit kalır.

function pt(p) {
  const x = p?.xM ?? p?.x;
  const y = p?.yM ?? p?.y;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function chaikinSmooth(points, { iterations = 2 } = {}) {
  const src = Array.isArray(points) ? points.map(pt).filter(Boolean) : [];
  if (src.length < 3) return src.map((p) => ({ x: p.x, y: p.y, xM: p.x, yM: p.y }));
  let cur = src;
  const n = Math.max(0, Math.min(4, Math.floor(iterations)));
  for (let it = 0; it < n; it++) {
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur.map((p) => ({ x: p.x, y: p.y, xM: p.x, yM: p.y }));
}
