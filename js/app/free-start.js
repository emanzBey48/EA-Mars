// Küreden seçilen lat/lon -> Jezero HiRISE yaması yerel noktası (saf). Yama dışı için varsayılan nokta kullanılır.

export const OUTSIDE_PATCH_NOTE = 'Simülasyon sahası: Jezero HiRISE';

export function pointInBounds(x, y, b, marginM = 0) {
  return Boolean(b) && Number.isFinite(x) && Number.isFinite(y)
    && x >= b.xMin + marginM && x <= b.xMax - marginM && y >= b.yMin + marginM && y <= b.yMax - marginM;
}

/** toLocal(latDeg, lonDeg) -> {x,y}. Yama kapsamındaysa {xM,yM}, değilse null. */
export function latLonToPatchPoint(lat, lon, { toLocal, bounds, marginM = 20, isValidAt = null }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof toLocal !== 'function') return null;
  const p = toLocal(lat, lon);
  if (!p || !pointInBounds(p.x, p.y, bounds, marginM)) return null;
  if (isValidAt && !isValidAt(p.x, p.y)) return null;
  return { xM: p.x, yM: p.y };
}

/**
 * selection.start/end -> yerel noktalar. Yalnız regionId === null (serbest tıklama) noktalar yama içindeyse kullanılır.
 * İsimli bölge (regionId dolu) veya yama dışı: defaults.
 */
export function resolveSelectionPoints(selection, { toLocal, bounds, defaults, marginM = 20, minSepM = 15, isValidAt = null }) {
  const pick = (s) => (s && (s.regionId ?? null) === null ? latLonToPatchPoint(s.lat, s.lon, { toLocal, bounds, marginM, isValidAt }) : null);
  let start = pick(selection?.start);
  let end = pick(selection?.end);
  const a = start ?? defaults.start, b = end ?? defaults.end;
  if (Math.hypot(a.xM - b.xM, a.yM - b.yM) < minSepM) { end = null; if (start && Math.hypot(start.xM - defaults.end.xM, start.yM - defaults.end.yM) < minSepM) start = null; }
  const outside = (selection?.start != null && !start) || (selection?.end != null && !end);
  return { start: start ?? defaults.start, end: end ?? defaults.end, startCustom: Boolean(start), endCustom: Boolean(end), anyCustom: Boolean(start || end), outside };
}
