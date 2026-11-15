// Küre üzerinde serbest nokta seçimi (saf). Seçim isimli bölgeye yapışmaz; ad yalnız yakın bölge bağlamı verir.
import { greatCircleDistanceKm } from './regions.js';

export const NEAR_REGION_KM = 1500;

export function normalizeLon(lon) {
  if (lon >= -180 && lon <= 180) return lon;
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lon > 0) l = 180;
  return l;
}

export function formatLatLon(lat, lon, digits = 1) {
  const l = normalizeLon(lon);
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'K' : 'G'} ${Math.abs(l).toFixed(digits)}°${l >= 0 ? 'D' : 'B'}`;
}

export function nearestRegion(lat, lon, regions, maxKm = NEAR_REGION_KM) {
  let best = null;
  for (const r of regions ?? []) {
    const d = greatCircleDistanceKm(lat, lon, r.lat, r.lon);
    if (d <= maxKm && (!best || d < best.distKm)) best = { region: r, distKm: d };
  }
  return best;
}

/** Bölge benzeri nesne: { id:null, name, lat, lon, free:true, type? }. Panel/işaretçi bunu bölge gibi kullanır. */
export function makeFreePoint(lat, lon, regions) {
  const l = normalizeLon(lon);
  const near = nearestRegion(lat, l, regions);
  const ctx = near ? ` (yakın bölge: ${near.region.name})` : '';
  return { id: null, name: `Seçilen nokta · ${formatLatLon(lat, l)}${ctx}`, lat, lon: l, free: true };
}

export function hoverLabel(lat, lon, match, typeLabel = (t) => t) {
  if (match) return { name: match.region.name, detail: typeLabel(match.region.type) };
  return { name: 'Mars yüzeyi', detail: formatLatLon(lat, lon) };
}
