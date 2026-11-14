// USGS SIM 3464 geologic-unit index (Sun & Stack 2020). Pure module: no DOM, fetch, fs or module state.
// The caller loads the GeoJSON + manifest and injects them; coordinates are [lon degE, lat degN] (planetocentric).
//
// Boundary rule (deterministic): a query point within BOUNDARY_EPS_DEG of a polygon edge (exterior or hole)
// counts as a candidate for that feature. If all candidates share one unit code the result is 'ok' (lowest
// featureId, `onBoundary: true` when no candidate strictly contains the point); if candidates carry different
// unit codes the result is 'ambiguous' with the candidates sorted by featureId. Nothing is guessed.
// Clip edges of the corridor bbox are coverage limits, not geologic contacts (flagged `clipEdge` in segments).

export const BOUNDARY_EPS_DEG = 1e-9; // ~60 micrometres at Mars scale; only catches exactly-on-edge queries
export const MIN_RING_POSITIONS = 4; // closed ring: first == last, >= 3 distinct vertices
export const LOOKUP_STATUS = Object.freeze({
  OK: 'ok', OUTSIDE: 'outside_coverage', INVALID: 'invalid_input', AMBIGUOUS: 'ambiguous',
});

// Positional-uncertainty statement taken from USGS SIM 3464 readme/FGDC metadata (horizpar), not invented here.
export const GEOLOGY_CAVEATS = Object.freeze([
  'Harita 1:75.000 ölçeklidir; birim sınırları indikatiftir, saha gerçeği değildir.',
  'USGS readme/FGDC (horizpar): harita yarı-kontrollü CTX mozaiği üzerinde üretildi; yüzey operasyonu CTX mozaiğine göre ~100-200 m rastgele ofset beklenir.',
  'Birim kodu yalnız haritalanmış jeolojik birimi gösterir; mineraloji, güvenlik veya geçilebilirlik iddiası değildir.',
]);

// Quoted source: readme/FGDC horizpar "random offsets of about 100-200 meters" (semi-controlled CTX vs surface-ops CTX).
export const GEOLOGY_POSITIONAL_UNCERTAINTY_M = Object.freeze({ min: 100, max: 200 });
export const GEOLOGY_LICENSE_NOT_STATED = 'not_stated'; // FGDC accconst "None"; no public-domain statement
export const GEOLOGY_CAVEAT_TR = 'Harita ölçeğinde (1:75.000) birim ataması indikatiftir; konum belirsizliği ~100–200 m, saha gerçeği değildir. Mineraloji, güvenlik veya geçilebilirlik iddiası yoktur.';
export const GEOLOGY_CAVEAT_EN = 'Map-scale (1:75,000) unit assignment is indicative; positional uncertainty ~100-200 m; not field truth. No mineralogy, safety or traversability claim.';

// Stable WorldSnapshot field for Stage 19B (suggested name `geology`). Every snapshot has exactly these keys.
export const GEOLOGY_SNAPSHOT_CONTRACT = Object.freeze({
  schema: 'marswalk.geology-snapshot.v1',
  snapshotField: 'geology',
  keys: Object.freeze([
    'status', 'unitCode', 'unitName', 'onBoundary', 'candidates', 'positionalUncertaintyM',
    'mapScale', 'citation', 'doi', 'license', 'caveatTr', 'caveatEn',
  ]),
  statuses: Object.freeze(['ok', 'outside_coverage', 'invalid_input', 'ambiguous']),
});

const SUPPORTED_GEOMETRY =new Set(['Polygon', 'MultiPolygon']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const validLon = (v) => Number.isFinite(v) && v >= -360 && v <= 360;
const validLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;

/** Validates a GeoJSON linear ring; returns a flat [lon0, lat0, lon1, lat1, ...] copy or null. Never closes/repairs. */
function parseRing(ring) {
  if (!Array.isArray(ring) || ring.length < MIN_RING_POSITIONS) return null;
  const flat = [];
  for (const pos of ring) {
    if (!Array.isArray(pos) || pos.length < 2 || !validLon(pos[0]) || !validLat(pos[1])) return null;
    flat.push(pos[0], pos[1]);
  }
  const n = flat.length;
  if (flat[0] !== flat[n - 2] || flat[1] !== flat[n - 1]) return null; // must be explicitly closed
  return flat;
}

function ringBbox(flat, box) {
  for (let i = 0; i < flat.length; i += 2) {
    if (flat[i] < box[0]) box[0] = flat[i];
    if (flat[i + 1] < box[1]) box[1] = flat[i + 1];
    if (flat[i] > box[2]) box[2] = flat[i];
    if (flat[i + 1] > box[3]) box[3] = flat[i + 1];
  }
}

/** Parses one polygon (array of rings) -> array of flat rings, or null when any ring is invalid. */
function parsePolygon(rings, counts) {
  if (!Array.isArray(rings) || rings.length === 0) { counts.rejectedPolygons++; return null; }
  const parsed = [];
  for (const ring of rings) {
    const flat = parseRing(ring);
    if (!flat) { counts.rejectedRings++; counts.rejectedPolygons++; return null; } // dropping a hole would coerce area
    parsed.push(flat);
  }
  return parsed;
}

function parseProvenance(source, geojson) {
  const s = source && typeof source === 'object' ? source : {};
  const cs = s.coordinate_system || {};
  const citation = typeof s.citation === 'string' ? s.citation : null;
  const doiMatch = citation && citation.match(/https:\/\/doi\.org\/\S+?(?=[\s,;]|$)/);
  const scaleMatch = citation && citation.match(/scale 1:(\d[\d,.]*)/);
  const scaleDenominator = scaleMatch ? Number(scaleMatch[1].replace(/[,.]/g, '')) : null;
  return {
    title: s.title ?? null,
    datasetVersion: s.dataset_version ?? null,
    citation,
    doi: doiMatch ? doiMatch[0] : null,
    scaleDenominator,
    nativeCrs: {
      projection: cs.native_projection ?? null,
      centralMeridian: cs.central_meridian ?? null,
      datum: cs.reference_datum ?? null,
      radiusM: cs.radius_equatorial_m ?? null,
    },
    exportCrs: cs.geojson_export_crs ?? null,
    // Not invented: USGS metadata gives accconst "None" and no public-domain statement for this dataset.
    license: typeof s.license === 'string' ? s.license : 'not_stated',
    productName: typeof geojson.name === 'string' ? geojson.name : null,
    caveats: GEOLOGY_CAVEATS,
    attribution: citation ? `USGS SIM 3464 — ${citation}` : 'USGS SIM 3464 (Sun & Stack, 2020)',
  };
}

/**
 * Builds a deep-frozen index from a GeoJSON FeatureCollection (Polygon/MultiPolygon, [lon,lat]).
 * @param {object} geojson FeatureCollection; properties `symbol`/`name`/`OBJECTID` as in the SIM 3464 export
 * @param {{source?: object}} opts `source` = dataset manifest (citation, coordinate_system, ...)
 */
export function createGeologyIndex(geojson, { source = null } = {}) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new TypeError('createGeologyIndex: GeoJSON FeatureCollection expected');
  }
  const counts = {
    inputFeatures: geojson.features.length, acceptedFeatures: 0, skippedFeatures: 0,
    unsupportedGeometry: 0, missingProperties: 0, rejectedPolygons: 0, rejectedRings: 0,
  };
  const features = [];
  geojson.features.forEach((f, index) => {
    const g = f && f.geometry;
    const p = f && f.properties;
    if (!g || !SUPPORTED_GEOMETRY.has(g.type)) { counts.unsupportedGeometry++; counts.skippedFeatures++; return; }
    if (!p || typeof p.symbol !== 'string' || !p.symbol || typeof p.name !== 'string' || !p.name) {
      counts.missingProperties++; counts.skippedFeatures++; return;
    }
    const rawPolys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const polygons = (Array.isArray(rawPolys) ? rawPolys : []).map((poly) => parsePolygon(poly, counts)).filter(Boolean);
    if (polygons.length === 0) { counts.skippedFeatures++; return; }
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of polygons) ringBbox(poly[0], bbox); // holes lie inside the exterior ring
    const id = Number.isInteger(p.OBJECTID) ? p.OBJECTID : `feature-${index}`;
    features.push({ id, unit: { code: p.symbol, name: p.name }, bbox, polygons });
    counts.acceptedFeatures++;
  });

  const cov = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    cov[0] = Math.min(cov[0], f.bbox[0]); cov[1] = Math.min(cov[1], f.bbox[1]);
    cov[2] = Math.max(cov[2], f.bbox[2]); cov[3] = Math.max(cov[3], f.bbox[3]);
  }
  const declared = Array.isArray(geojson.bbox) && geojson.bbox.length === 4 && geojson.bbox.every(Number.isFinite)
    ? geojson.bbox.slice() : null;
  const unitMap = new Map();
  for (const f of features) {
    const u = unitMap.get(f.unit.code) || { code: f.unit.code, name: f.unit.name, featureCount: 0 };
    u.featureCount++;
    unitMap.set(f.unit.code, u);
  }
  return deepFreeze({
    schema: 'marswalk.geology-index.v1',
    features,
    units: [...unitMap.values()].sort((a, b) => (a.code < b.code ? -1 : 1)),
    // Coverage = declared GeoJSON bbox when present (clipped corridor), else union of feature bboxes.
    coverageBbox: declared || (features.length ? cov : null),
    counts,
    provenance: parseProvenance(source, geojson),
  });
}

/** Relation of a point to one flat ring: 'boundary' | 'inside' | 'outside' (even-odd ray cast, +x ray). */
function ringRelation(ring, x, y) {
  let inside = false;
  const eps2 = BOUNDARY_EPS_DEG * BOUNDARY_EPS_DEG;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const ax = ring[j], ay = ring[j + 1], bx = ring[i], by = ring[i + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const ex = x - (ax + t * dx), ey = y - (ay + t * dy);
    if (ex * ex + ey * ey <= eps2) return 'boundary';
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) * dx) / dy) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

/** Polygon (exterior + holes): exterior minus holes; edges of any ring are 'boundary'. */
function polygonRelation(rings, x, y) {
  const outer = ringRelation(rings[0], x, y);
  if (outer === 'outside') return 'outside';
  if (outer === 'boundary') return 'boundary';
  for (let k = 1; k < rings.length; k++) {
    const r = ringRelation(rings[k], x, y);
    if (r === 'boundary') return 'boundary';
    if (r === 'inside') return 'outside'; // inside a hole
  }
  return 'inside';
}

function featureRelation(feature, x, y) {
  const m = BOUNDARY_EPS_DEG;
  const b = feature.bbox;
  if (x < b[0] - m || x > b[2] + m || y < b[1] - m || y > b[3] + m) return 'outside';
  let rel = 'outside';
  for (const poly of feature.polygons) {
    const r = polygonRelation(poly, x, y);
    if (r === 'inside') return 'inside';
    if (r === 'boundary') rel = 'boundary';
  }
  return rel;
}

const result = (status, extra = {}) => Object.freeze({ status, unit: null, featureId: null, ...extra });

/** Looks up the mapped geologic unit at a planetocentric lon/lat (degrees). Result is frozen. */
export function lookupGeologicUnit(index, { lonDeg, latDeg } = {}) {
  if (!index || index.schema !== 'marswalk.geology-index.v1' || !validLon(lonDeg) || !validLat(latDeg)) {
    return result(LOOKUP_STATUS.INVALID);
  }
  const c = index.coverageBbox;
  const m = BOUNDARY_EPS_DEG;
  if (!c || lonDeg < c[0] - m || lonDeg > c[2] + m || latDeg < c[1] - m || latDeg > c[3] + m) {
    return result(LOOKUP_STATUS.OUTSIDE, { reason: 'outside_bbox' });
  }
  const candidates = [];
  for (const f of index.features) {
    const relation = featureRelation(f, lonDeg, latDeg);
    if (relation !== 'outside') candidates.push({ featureId: f.id, code: f.unit.code, name: f.unit.name, relation });
  }
  if (candidates.length === 0) return result(LOOKUP_STATUS.OUTSIDE, { reason: 'no_polygon' });
  candidates.sort((a, b) => (String(a.featureId) < String(b.featureId) ? -1 : String(a.featureId) > String(b.featureId) ? 1 : 0));
  const sameUnit = candidates.every((cd) => cd.code === candidates[0].code);
  if (!sameUnit) {
    return result(LOOKUP_STATUS.AMBIGUOUS, { candidates: Object.freeze(candidates.map((cd) => Object.freeze(cd))) });
  }
  const first = candidates[0];
  const onBoundary = !candidates.some((cd) => cd.relation === 'inside');
  return result(LOOKUP_STATUS.OK, {
    unit: Object.freeze({ code: first.code, name: first.name }), featureId: first.featureId, onBoundary,
  });
}

/** Local-metre lookup via an injected adapter exposing localToLatLon(x, y) -> {latDeg, lonDeg}. */
export function lookupGeologicUnitLocal(index, adapter, { xM, yM } = {}) {
  if (!adapter || typeof adapter.localToLatLon !== 'function' || !Number.isFinite(xM) || !Number.isFinite(yM)) {
    return result(LOOKUP_STATUS.INVALID);
  }
  const { latDeg, lonDeg } = adapter.localToLatLon(xM, yM);
  return lookupGeologicUnit(index, { lonDeg, latDeg });
}

const formatScale = (d) => (Number.isFinite(d) ? `1:${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : null);

/**
 * Pure projection of a lookup result to the plain, deep-frozen object 19B puts into WorldSnapshot.geology.
 * Only status 'ok' carries a unit; outside_coverage / invalid_input / ambiguous never fabricate one (an unknown
 * status is treated as invalid_input). `candidates` is always an array (non-empty only for 'ambiguous').
 */
export function toGeologySnapshot(lookupResult, index) {
  const r = lookupResult && typeof lookupResult === 'object' ? lookupResult : {};
  const status = GEOLOGY_SNAPSHOT_CONTRACT.statuses.includes(r.status) ? r.status : LOOKUP_STATUS.INVALID;
  const ok = status === LOOKUP_STATUS.OK && r.unit && typeof r.unit.code === 'string';
  const cands = status === LOOKUP_STATUS.AMBIGUOUS && Array.isArray(r.candidates)
    ? r.candidates.map((c) => ({ featureId: c.featureId, unitCode: c.code, unitName: c.name })) : [];
  const p = index && index.provenance ? index.provenance : null;
  return deepFreeze({
    status,
    unitCode: ok ? r.unit.code : null,
    unitName: ok ? r.unit.name : null,
    onBoundary: ok ? r.onBoundary === true : (status === LOOKUP_STATUS.AMBIGUOUS && Array.isArray(r.candidates)
      && r.candidates.every((c) => c.relation === 'boundary')),
    candidates: cands,
    positionalUncertaintyM: { min: GEOLOGY_POSITIONAL_UNCERTAINTY_M.min, max: GEOLOGY_POSITIONAL_UNCERTAINTY_M.max },
    mapScale: p ? formatScale(p.scaleDenominator) : null,
    citation: p ? p.citation : null,
    doi: p ? p.doi : null,
    license: GEOLOGY_LICENSE_NOT_STATED,
    caveatTr: GEOLOGY_CAVEAT_TR,
    caveatEn: GEOLOGY_CAVEAT_EN,
  });
}

/**
 * Builds a frozen local-metre contact field (geologic contacts only: clipEdge runs are excluded) for repeated
 * nearest-contact queries. adapter.latLonToLocal(latDeg, lonDeg) -> {x, y}. Build once, query every frame.
 */
export function createGeologicContactField(index, adapter) {
  const segs = geologicBoundarySegmentsToLocal(geologicBoundarySegments(index).filter((s) => !s.clipEdge), adapter);
  return deepFreeze({
    schema: 'marswalk.geology-contacts.v1',
    polylines: segs.map((s) => ({ featureId: s.featureId, unitCode: s.unitCode, xy: s.xy })),
  });
}

/** Euclidean distance (m) from (xM, yM) to the nearest contact, or null when input/field is invalid or empty. */
export function nearestGeologicContactM(field, { xM, yM } = {}) {
  if (!field || field.schema !== 'marswalk.geology-contacts.v1' || !Number.isFinite(xM) || !Number.isFinite(yM)) return null;
  let best = null;
  for (const pl of field.polylines) {
    for (let i = 0; i + 1 < pl.xy.length; i++) {
      const [ax, ay] = pl.xy[i], [bx, by] = pl.xy[i + 1];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((xM - ax) * dx + (yM - ay) * dy) / len2)) : 0;
      const d = Math.hypot(xM - (ax + t * dx), yM - (ay + t * dy));
      if (!best || d < best.distanceM) best = { distanceM: d, featureId: pl.featureId, unitCode: pl.unitCode };
    }
  }
  return best ? Object.freeze(best) : null;
}

function onDeclaredBboxEdge(ax, ay, bx, by, bbox) {
  if (!bbox) return false;
  const e = BOUNDARY_EPS_DEG;
  const near = (v, w) => Math.abs(v - w) <= e;
  return (near(ax, bbox[0]) && near(bx, bbox[0])) || (near(ax, bbox[2]) && near(bx, bbox[2]))
    || (near(ay, bbox[1]) && near(by, bbox[1])) || (near(ay, bbox[3]) && near(by, bbox[3]));
}

/**
 * Boundary polylines in lon/lat for later rendering (no rendering here). Each ring is split into runs of edges
 * with equal `clipEdge` flag (true = lies on the declared GeoJSON bbox, i.e. data clip, not a geologic contact).
 * Shared contacts between two polygons appear once per polygon (duplicated); dedupe is a renderer concern.
 * @returns {ReadonlyArray<{featureId, unitCode, role:'exterior'|'hole', clipEdge:boolean, lonLat:Array<[number,number]>}>}
 */
export function geologicBoundarySegments(index) {
  const out = [];
  const bbox = index.coverageBbox;
  for (const f of index.features) {
    for (const poly of f.polygons) {
      poly.forEach((ring, k) => {
        let run = null;
        for (let i = 0; i + 3 < ring.length; i += 2) {
          const clip = onDeclaredBboxEdge(ring[i], ring[i + 1], ring[i + 2], ring[i + 3], bbox);
          if (!run || run.clipEdge !== clip) {
            run = { featureId: f.id, unitCode: f.unit.code, role: k === 0 ? 'exterior' : 'hole', clipEdge: clip, lonLat: [[ring[i], ring[i + 1]]] };
            out.push(run);
          }
          run.lonLat.push([ring[i + 2], ring[i + 3]]);
        }
      });
    }
  }
  return deepFreeze(out);
}

/** Converts boundary polylines to local metres via adapter.latLonToLocal(latDeg, lonDeg) -> {x, y}. */
export function geologicBoundarySegmentsToLocal(segments, adapter) {
  if (!adapter || typeof adapter.latLonToLocal !== 'function') throw new TypeError('adapter.latLonToLocal required');
  return deepFreeze(segments.map((s) => ({
    featureId: s.featureId, unitCode: s.unitCode, role: s.role, clipEdge: s.clipEdge,
    xy: s.lonLat.map(([lon, lat]) => { const p = adapter.latLonToLocal(lat, lon); return [p.x, p.y]; }),
  })));
}
