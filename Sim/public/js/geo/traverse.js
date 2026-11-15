// Archival Perseverance traverse subset (Sol 120-164 window) -> local metre plane.
// Pure module: no DOM, no fetch, no state. Parsed JSON and a coordinate adapter are injected.
//
// Science rules:
// - The MMGIS traverse is an ARCHIVAL drive record, not live telemetry and not a safety route.
// - The straight WB1 -> Roubion line used by the scenario is NOT the real traverse; this module only
//   MEASURES the difference. It never decides which waypoint source is canonical.
// - Missing / invalid coordinates are skipped and counted; nothing is zero-filled.

import { pointToSegment } from './geo.js';

export const DEFAULT_SOL_MIN = 120;
export const DEFAULT_SOL_MAX = 164;
export const MARS_RADIUS_M = 3396190; // USGS DTM mosaic sphere (see config MAP_FRAME); used for great-circle metres.

const DEG = Math.PI / 180;

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/** Frozen provenance. Strings are taken from the repository data files; nothing here is invented. */
export const TRAVERSE_PROVENANCE = deepFreeze({
  source: 'NASA/JPL Mars 2020 MMGIS (mars.nasa.gov/mmgis-maps/M20)',
  traverseProduct: 'M20_traverse.json (GeoJSON "M20_Traverse_Path_tosol2022", CRS84 lon/lat/elevation)',
  waypointProduct: 'M20_waypoints.json (GeoJSON "M20_waypoints_sol2022_all", lon/lat/elevation)',
  traverseUrl: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json',
  waypointUrl: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
  fgdcTitle: 'Perseverance (Mars 2020) Path',
  // FGDC file leaves Originator, Use_Constraints and dc.rights empty: no license/credit text is provided.
  credit: null,
  creditNote: 'FGDC (perseverance_traverse_fgdc.html) has empty Originator / Use_Constraints / dc.rights; no credit or license text is supplied by the file.',
  nature: 'archival MMGIS traverse; not live telemetry; not a safety route',
  nature_tr: 'Arşiv MMGIS sürüş izi; canlı telemetri değildir; güvenli rota değildir.',
  routeCaveat_tr: 'Senaryodaki WB1-Roubion düz hattı gerçek rover izi değildir; gerçek iz bu modülün ölçtüğü arşiv polyline\'ıdır.',
  corridorNote: 'Corridor width is a scenario assumption, not a NASA operational limit.',
});

function isObj(v) { return v !== null && typeof v === 'object'; }
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function validLonLat(lon, lat) {
  return isNum(lon) && isNum(lat) && lat >= -90 && lat <= 90 && lon >= -360 && lon <= 360;
}

function assertFeatureCollection(json, name) {
  if (!isObj(json) || json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
    throw new TypeError(`${name} must be a parsed GeoJSON FeatureCollection`);
  }
}

/** Great-circle distance in metres on a sphere of radius radiusM. */
export function haversineM(lat1Deg, lon1Deg, lat2Deg, lon2Deg, radiusM = MARS_RADIUS_M) {
  const p1 = lat1Deg * DEG, p2 = lat2Deg * DEG;
  const dp = p2 - p1, dl = (lon2Deg - lon1Deg) * DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Selects the archival drive segments whose Sol lies in [solMin, solMax] and their end-of-drive stops.
 *
 * @param {object} traverseJson parsed M20_traverse.json
 * @param {object} waypointsJson parsed M20_waypoints.json
 * @returns frozen subset: { solMin, solMax, startStop, stops[], segments[], contiguous, gaps[], counts, provenance }
 */
export function selectTraverseSubset(traverseJson, waypointsJson, { solMin = DEFAULT_SOL_MIN, solMax = DEFAULT_SOL_MAX } = {}) {
  assertFeatureCollection(traverseJson, 'traverseJson');
  assertFeatureCollection(waypointsJson, 'waypointsJson');
  if (!isNum(solMin) || !isNum(solMax) || solMin > solMax) throw new RangeError('invalid sol range');

  const counts = {
    traverseFeatures: traverseJson.features.length,
    waypointFeatures: waypointsJson.features.length,
    segmentsInSolRange: 0,
    segmentsSkipped: 0,
    verticesRaw: 0,
    verticesSkippedInvalid: 0,
    verticesDuplicateCollapsed: 0,
    verticesKept: 0,
    stopsMissingWaypoint: 0,
    stopsInvalidCoordinate: 0,
    stopsNotFinal: 0,
  };

  const wpByRmc = new Map();
  for (const f of waypointsJson.features) {
    const rmc = f?.properties?.RMC;
    if (typeof rmc === 'string' && !wpByRmc.has(rmc)) wpByRmc.set(rmc, f);
  }

  const makeStop = (rmc) => {
    const f = wpByRmc.get(rmc);
    if (!f) { counts.stopsMissingWaypoint++; return null; }
    const p = f.properties;
    if (!validLonLat(p.lon, p.lat)) { counts.stopsInvalidCoordinate++; return null; }
    if (p.final !== 'y') counts.stopsNotFinal++;
    return {
      rmc,
      sol: p.sol ?? null,
      site: p.site ?? null,
      drive: p.drive ?? null,
      lonDeg: p.lon,
      latDeg: p.lat,
      archiveElevationM: isNum(p.elev_geoid) ? p.elev_geoid : null, // archival, NOT a DTM sample
      reportedDriveDistM: isNum(p.dist_m) ? p.dist_m : null,
      final: p.final === 'y',
      note: typeof p.Note === 'string' ? p.Note : null,
    };
  };

  const segments = [];
  for (const f of traverseJson.features) {
    const p = f?.properties;
    const sol = p?.sol;
    if (!isNum(sol) || sol < solMin || sol > solMax) continue;
    counts.segmentsInSolRange++;
    const g = f.geometry;
    if (!isObj(g) || g.type !== 'LineString' || !Array.isArray(g.coordinates) ||
        typeof p.fromRMC !== 'string' || typeof p.toRMC !== 'string') {
      counts.segmentsSkipped++;
      continue;
    }
    const vertices = [];
    for (const c of g.coordinates) {
      counts.verticesRaw++;
      const lon = Array.isArray(c) ? c[0] : undefined;
      const lat = Array.isArray(c) ? c[1] : undefined;
      if (!validLonLat(lon, lat)) { counts.verticesSkippedInvalid++; continue; }
      const prev = vertices[vertices.length - 1];
      if (prev && prev.lonDeg === lon && prev.latDeg === lat) { counts.verticesDuplicateCollapsed++; continue; }
      vertices.push({ lonDeg: lon, latDeg: lat, archiveElevationM: isNum(c[2]) ? c[2] : null });
    }
    if (vertices.length < 2) { counts.segmentsSkipped++; continue; }
    counts.verticesKept += vertices.length;
    segments.push({
      sol,
      fromRMC: p.fromRMC,
      toRMC: p.toRMC,
      reportedLengthM: isNum(p.length) ? p.length : null,
      vertices,
    });
  }

  // Contiguity: each segment must start where the previous one ended (fail visible, do not bridge).
  const gaps = [];
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].fromRMC !== segments[i - 1].toRMC) {
      gaps.push({ afterRMC: segments[i - 1].toRMC, nextFromRMC: segments[i].fromRMC });
    }
  }

  const startStop = segments.length ? makeStop(segments[0].fromRMC) : null;
  const stops = [];
  segments.forEach((seg, i) => {
    const stop = makeStop(seg.toRMC);
    if (stop) stops.push({ ...stop, isArrival: i === segments.length - 1 });
  });

  return deepFreeze({
    solMin, solMax,
    startStop,
    stops,
    segments,
    contiguous: gaps.length === 0,
    gaps,
    counts,
    provenance: TRAVERSE_PROVENANCE,
  });
}

/**
 * Projects a subset into the local metre plane via the injected adapter ({ latLonToLocal }).
 * Returns a frozen { polyline[], stops[], startStop, segments[], skipped }. Points whose projection is
 * non-finite are skipped and counted, never zero-filled.
 */
export function projectTraverse(subset, adapter) {
  if (!subset || !Array.isArray(subset.segments)) throw new TypeError('subset required');
  if (!adapter || typeof adapter.latLonToLocal !== 'function') throw new TypeError('adapter.latLonToLocal required');
  let skippedPoints = 0;
  const proj = (lat, lon) => {
    const p = adapter.latLonToLocal(lat, lon);
    if (!p || !isNum(p.x) || !isNum(p.y)) return null;
    return p;
  };

  const polyline = [];
  const segments = subset.segments.map((seg) => {
    const pts = [];
    for (const v of seg.vertices) {
      const p = proj(v.latDeg, v.lonDeg);
      if (!p) { skippedPoints++; continue; }
      const pt = { x: p.x, y: p.y, lonDeg: v.lonDeg, latDeg: v.latDeg, archiveElevationM: v.archiveElevationM };
      pts.push(pt);
      const last = polyline[polyline.length - 1];
      if (!last || last.x !== pt.x || last.y !== pt.y) polyline.push(pt);
    }
    return { sol: seg.sol, fromRMC: seg.fromRMC, toRMC: seg.toRMC, reportedLengthM: seg.reportedLengthM, points: pts, lengthLocalM: polylineLengthM(pts) };
  });

  const projStop = (s) => {
    if (!s) return null;
    const p = proj(s.latDeg, s.lonDeg);
    if (!p) { skippedPoints++; return null; }
    return { ...s, id: `sol${s.sol}-${s.rmc}`, label: `Sol ${s.sol} / Site ${s.site} Drive ${s.drive}`, xM: p.x, yM: p.y };
  };

  return deepFreeze({
    polyline,
    segments,
    startStop: projStop(subset.startStop),
    stops: subset.stops.map(projStop).filter(Boolean),
    skippedPoints,
    provenance: TRAVERSE_PROVENANCE,
  });
}

/** Sum of Euclidean edge lengths of points with finite x,y. */
export function polylineLengthM(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** Great-circle polyline length (true surface metres on the sphere) from lon/lat points. */
export function polylineSurfaceLengthM(points, radiusM = MARS_RADIUS_M) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineM(points[i - 1].latDeg, points[i - 1].lonDeg, points[i].latDeg, points[i].lonDeg, radiusM);
  }
  return total;
}

/**
 * Compares the archival polyline with the straight line a -> b ({x,y} local metres).
 * Lateral deviation = distance to the finite segment ab (pointToSegment). The maximum over a polyline is
 * attained at a vertex (distance to a convex set is convex along each edge); mean and corridor fraction
 * are length-weighted using edges resampled at <= sampleStepM.
 * corridorHalfWidthM is a SCENARIO assumption, not a NASA limit.
 */
export function compareToStraightLine(points, a, b, { corridorHalfWidthM = 10, sampleStepM = 0.25 } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError('need at least 2 points');
  if (![a?.x, a?.y, b?.x, b?.y].every(isNum)) throw new TypeError('a and b must have finite x,y');
  if (!(corridorHalfWidthM > 0) || !(sampleStepM > 0)) throw new RangeError('corridorHalfWidthM and sampleStepM must be > 0');

  const dev = (x, y) => pointToSegment(x, y, a.x, a.y, b.x, b.y).distance;
  let maxDev = 0, maxAt = null;
  for (const p of points) {
    const d = dev(p.x, p.y);
    if (d > maxDev) { maxDev = d; maxAt = { x: p.x, y: p.y }; }
  }
  let weighted = 0, inside = 0, total = 0;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (len === 0) continue;
    const n = Math.max(1, Math.ceil(len / sampleStepM));
    const w = len / n;
    for (let k = 0; k < n; k++) { // midpoint rule
      const t = (k + 0.5) / n;
      const d = dev(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
      weighted += d * w;
      if (d <= corridorHalfWidthM) inside += w;
      total += w;
    }
  }
  const polyLen = polylineLengthM(points);
  const straightLen = Math.hypot(b.x - a.x, b.y - a.y);
  return deepFreeze({
    polylineLengthM: polyLen,
    straightLengthM: straightLen,
    lengthDifferenceM: polyLen - straightLen,
    lengthRatio: straightLen > 0 ? polyLen / straightLen : null,
    maxLateralDeviationM: maxDev,
    maxDeviationAt: maxAt,
    meanLateralDeviationM: total > 0 ? weighted / total : null,
    corridorHalfWidthM,
    corridorHalfWidthLabel: 'scenario assumption, not a NASA operational limit',
    fractionInsideCorridor: total > 0 ? inside / total : null,
    note: 'Straight line is a simplified scenario link, not the real traverse.',
  });
}

/**
 * Distances (metres) between the traverse subset's start/end and other waypoint sources.
 * Exposes numbers only; does NOT choose a canonical source.
 * @param {object} subset result of selectTraverseSubset
 * @param {{start: {latDeg,lonDeg,id?}, end: {latDeg,lonDeg,id?}}[]|object} references named sources:
 *   { name: { start:{latDeg,lonDeg}, end:{latDeg,lonDeg} } }
 * @param {object} [adapter] optional; if given, local-plane distances are reported as well.
 */
export function compareEndpointsToReferences(subset, references, adapter = null, radiusM = MARS_RADIUS_M) {
  if (!subset?.startStop || !subset.stops?.length) throw new TypeError('subset with start and stops required');
  const s = subset.startStop;
  const e = subset.stops[subset.stops.length - 1];
  const out = {};
  for (const [name, ref] of Object.entries(references ?? {})) {
    const one = (mine, theirs) => {
      if (!validLonLat(theirs?.lonDeg, theirs?.latDeg)) return { status: 'invalid-reference', surfaceM: null, localPlaneM: null };
      const surfaceM = haversineM(mine.latDeg, mine.lonDeg, theirs.latDeg, theirs.lonDeg, radiusM);
      let localPlaneM = null;
      if (adapter) {
        const p = adapter.latLonToLocal(mine.latDeg, mine.lonDeg);
        const q = adapter.latLonToLocal(theirs.latDeg, theirs.lonDeg);
        localPlaneM = Math.hypot(p.x - q.x, p.y - q.y);
      }
      return { status: 'ok', surfaceM, localPlaneM };
    };
    out[name] = { start: one(s, ref?.start), end: one(e, ref?.end) };
  }
  return deepFreeze({
    traverseStart: { rmc: s.rmc, sol: s.sol, latDeg: s.latDeg, lonDeg: s.lonDeg },
    traverseEnd: { rmc: e.rmc, sol: e.sol, latDeg: e.latDeg, lonDeg: e.lonDeg },
    references: out,
    note: 'Numbers only; no source is declared canonical.',
  });
}
