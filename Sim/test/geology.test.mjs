import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import {
  createGeologyIndex, lookupGeologicUnit, lookupGeologicUnitLocal,
  geologicBoundarySegments, geologicBoundarySegmentsToLocal, LOOKUP_STATUS, GEOLOGY_CAVEATS,
  GEOLOGY_SNAPSHOT_CONTRACT, GEOLOGY_CAVEAT_TR, toGeologySnapshot, createGeologicContactField, nearestGeologicContactM,
} from '../public/js/geo/geology.js';
import { WAYPOINTS, MAP_FRAME } from '../public/js/config.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';

const DATA_DIR = new URL('../data/usgs-sim3464-geology/', import.meta.url);
const readText = (name) => fs.readFileSync(new URL(name, DATA_DIR), 'utf8');
const manifest = JSON.parse(readText('manifest.json'));
const corridor = JSON.parse(readText('jezero_geounits_corridor.geojson'));
const realIndex = createGeologyIndex(corridor, { source: manifest });
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);

// Independent reference: plain crossing-number ray cast on exterior rings, straight from the raw GeoJSON.
function bruteForceUnit(geojson, lon, lat) {
  const hits = [];
  for (const f of geojson.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      const inRing = (ring) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
      };
      if (inRing(rings[0]) && !rings.slice(1).some(inRing)) hits.push(f.properties.symbol);
    }
  }
  return hits;
}

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feat = (symbol, name, geometry, OBJECTID) => ({ type: 'Feature', properties: { symbol, name, OBJECTID }, geometry });
const collection = (features, bbox) => ({ type: 'FeatureCollection', ...(bbox ? { bbox } : {}), features });
const lookup = (index, lonDeg, latDeg) => lookupGeologicUnit(index, { lonDeg, latDeg });

test('geology: real corridor structure and units', () => {
  assert.equal(corridor.features.length, 3);
  assert.equal(realIndex.counts.acceptedFeatures, 3);
  assert.equal(realIndex.counts.skippedFeatures, 0);
  assert.deepEqual(realIndex.units.map((u) => u.code), ['NHjf2', 'Njf', 'Nle']);
  assert.deepEqual(realIndex.coverageBbox, [77.42, 18.41, 77.48, 18.46]);
  const p = realIndex.provenance;
  assert.equal(p.doi, 'https://doi.org/10.3133/sim3464');
  assert.equal(p.scaleDenominator, 75000);
  assert.match(p.citation, /Sun, V\.Z\., and Stack, K\.M\., 2020/);
  assert.equal(p.nativeCrs.centralMeridian, '77.5°E');
  assert.match(p.exportCrs, /Planetocentric/);
  assert.equal(p.license, 'not_stated');
  assert.ok(p.caveats === GEOLOGY_CAVEATS && p.caveats.some((c) => c.includes('100-200 m')));
});

test('geology: index, lookups and segments are deep-frozen, deterministic and do not mutate input', () => {
  const before = JSON.stringify(corridor);
  const again = createGeologyIndex(corridor, { source: manifest });
  assert.equal(JSON.stringify(corridor), before);
  assert.equal(JSON.stringify(again), JSON.stringify(realIndex));
  assert.ok(Object.isFrozen(realIndex) && Object.isFrozen(realIndex.features[0].polygons[0][0]));
  assert.throws(() => { 'use strict'; realIndex.counts.acceptedFeatures = 9; }, TypeError);
  const r = lookup(realIndex, 77.4494, 18.4386);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.unit));
  assert.deepEqual(lookup(realIndex, 77.4494, 18.4386), r);
  const segs = geologicBoundarySegments(realIndex);
  assert.ok(Object.isFrozen(segs) && Object.isFrozen(segs[0].lonLat[0]));
  assert.equal(JSON.stringify(geologicBoundarySegments(realIndex)), JSON.stringify(segs));
});

test('geology: both config waypoints lie in Njf (checked against brute-force ray cast)', () => {
  for (const wp of WAYPOINTS) {
    const r = lookup(realIndex, wp.lonDeg, wp.latDeg);
    assert.equal(r.status, LOOKUP_STATUS.OK, wp.id);
    assert.equal(r.unit.code, 'Njf', wp.id);
    assert.equal(r.unit.name, 'Jezero floor unit');
    assert.equal(r.featureId, 1150);
    assert.equal(r.onBoundary, false);
    assert.deepEqual(bruteForceUnit(corridor, wp.lonDeg, wp.latDeg), ['Njf']);
  }
});

test('geology: dense grid over the corridor agrees with brute-force reference', () => {
  const [w, s, e, n] = realIndex.coverageBbox;
  const seen = new Set();
  let mismatches = 0;
  for (let i = 1; i < 60; i++) {
    for (let j = 1; j < 50; j++) {
      const lon = w + ((e - w) * i) / 60 + 1.234e-7, lat = s + ((n - s) * j) / 50 + 2.345e-7;
      const ref = bruteForceUnit(corridor, lon, lat);
      const got = lookup(realIndex, lon, lat);
      if (ref.length === 1) { seen.add(ref[0]); if (got.status !== 'ok' || got.unit.code !== ref[0]) mismatches++; }
      else if (ref.length === 0) { if (got.status !== 'outside_coverage') mismatches++; }
      else if (got.status !== 'ambiguous') mismatches++;
    }
  }
  assert.equal(mismatches, 0);
  assert.ok(seen.has('Njf') && seen.has('Nle'), `units sampled: ${[...seen]}`);
});

test('geology: local-metre lookup through the real adapter', () => {
  const origin = lookupGeologicUnitLocal(realIndex, adapter, { xM: 0, yM: 0 });
  assert.equal(origin.status, 'ok');
  assert.equal(origin.unit.code, 'Njf');
  const wp2 = adapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);
  const r2 = lookupGeologicUnitLocal(realIndex, adapter, { xM: wp2.x, yM: wp2.y });
  assert.equal(r2.status, 'ok');
  assert.equal(r2.unit.code, 'Njf');
  assert.equal(lookupGeologicUnitLocal(realIndex, adapter, { xM: 1e6, yM: 0 }).status, 'outside_coverage');
  for (const bad of [{ xM: NaN, yM: 0 }, { xM: 0, yM: Infinity }, { xM: '1', yM: 0 }, undefined]) {
    assert.equal(lookupGeologicUnitLocal(realIndex, adapter, bad).status, 'invalid_input');
  }
  assert.equal(lookupGeologicUnitLocal(realIndex, null, { xM: 0, yM: 0 }).status, 'invalid_input');
});

test('geology: invalid lookup input never yields a unit', () => {
  for (const q of [{ lonDeg: NaN, latDeg: 18.4 }, { lonDeg: 77.45, latDeg: 91 }, { lonDeg: null, latDeg: 18.4 }, {}, undefined]) {
    const r = lookupGeologicUnit(realIndex, q);
    assert.equal(r.status, 'invalid_input');
    assert.equal(r.unit, null);
  }
  assert.equal(lookupGeologicUnit(null, { lonDeg: 1, latDeg: 1 }).status, 'invalid_input');
  const out = lookup(realIndex, 77.5, 18.5);
  assert.equal(out.status, 'outside_coverage');
  assert.equal(out.unit, null);
});

test('geology: polygon with hole, MultiPolygon and concave shape', () => {
  const holed = collection([
    feat('A', 'Holed', { type: 'Polygon', coordinates: [sq(0, 0, 10, 10), sq(4, 4, 6, 6)] }, 1),
    feat('B', 'Multi', { type: 'MultiPolygon', coordinates: [[sq(20, 0, 22, 2)], [sq(30, 0, 32, 2), sq(30.5, 0.5, 31.5, 1.5)]] }, 2),
    feat('C', 'Concave', { type: 'Polygon', coordinates: [[[40, 0], [50, 0], [50, 10], [45, 10], [45, 5], [40, 5], [40, 0]]] }, 3),
  ]);
  const idx = createGeologyIndex(holed);
  assert.equal(lookup(idx, 2, 2).unit.code, 'A');
  assert.equal(lookup(idx, 5, 5).status, 'outside_coverage'); // inside the hole
  assert.equal(lookup(idx, 21, 1).unit.code, 'B');
  assert.equal(lookup(idx, 31, 1).status, 'outside_coverage'); // MultiPolygon hole
  assert.equal(lookup(idx, 30.2, 1).unit.code, 'B');
  assert.equal(lookup(idx, 25, 1).status, 'outside_coverage'); // gap between parts
  assert.equal(lookup(idx, 42, 2).unit.code, 'C');
  assert.equal(lookup(idx, 42, 8).status, 'outside_coverage'); // notch of the concave shape
  assert.equal(lookup(idx, 47, 8).unit.code, 'C');
  // A hole edge counts as the polygon boundary, not outside.
  const edge = lookup(idx, 4, 5);
  assert.equal(edge.status, 'ok');
  assert.equal(edge.onBoundary, true);
});

test('geology: boundary rule is deterministic (ambiguous for different units, ok for the same unit)', () => {
  const two = collection([
    feat('Q', 'Right', { type: 'Polygon', coordinates: [sq(10, 0, 20, 10)] }, 7),
    feat('P', 'Left', { type: 'Polygon', coordinates: [sq(0, 0, 10, 10)] }, 3),
    feat('P', 'Left', { type: 'Polygon', coordinates: [sq(0, 10, 10, 20)] }, 9),
  ]);
  const idx = createGeologyIndex(two);
  const shared = lookup(idx, 10, 5);
  assert.equal(shared.status, 'ambiguous');
  assert.equal(shared.unit, null);
  assert.deepEqual(shared.candidates.map((c) => [c.featureId, c.code, c.relation]), [[3, 'P', 'boundary'], [7, 'Q', 'boundary']]);
  assert.deepEqual(lookup(idx, 10, 5), shared);
  const sameUnit = lookup(idx, 5, 10); // edge shared by two features of unit P
  assert.equal(sameUnit.status, 'ok');
  assert.equal(sameUnit.featureId, 3);
  assert.equal(sameUnit.onBoundary, true);
  const vertex = lookup(idx, 10, 10); // corner shared by all three
  assert.equal(vertex.status, 'ambiguous');
  assert.equal(vertex.candidates.length, 3);
});

test('geology: invalid features and rings are skipped with recorded counts, never coerced', () => {
  const idx = createGeologyIndex(collection([
    feat('OK', 'Valid', { type: 'Polygon', coordinates: [sq(0, 0, 1, 1)] }, 1),
    feat('PT', 'Point', { type: 'Point', coordinates: [0, 0] }, 2),
    feat('OPEN', 'Unclosed', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }, 3),
    feat('SHORT', 'Short', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] }, 4),
    feat('NAN', 'Bad coord', { type: 'Polygon', coordinates: [[[0, 0], [1, NaN], [1, 1], [0, 0]]] }, 5),
    feat('BADHOLE', 'Bad hole', { type: 'Polygon', coordinates: [sq(0, 0, 10, 10), [[1, 1], [2, 1], [2, 2]]] }, 6),
    { type: 'Feature', properties: { OBJECTID: 8 }, geometry: { type: 'Polygon', coordinates: [sq(0, 0, 1, 1)] } },
  ]));
  assert.equal(idx.counts.inputFeatures, 7);
  assert.equal(idx.counts.acceptedFeatures, 1);
  assert.equal(idx.counts.skippedFeatures, 6);
  assert.equal(idx.counts.unsupportedGeometry, 1);
  assert.equal(idx.counts.missingProperties, 1);
  assert.equal(idx.counts.rejectedRings, 4);
  assert.equal(idx.counts.rejectedPolygons, 4);
  assert.equal(lookup(idx, 5, 5).status, 'outside_coverage'); // BADHOLE feature was rejected, not "healed"
  assert.throws(() => createGeologyIndex({ type: 'Feature' }), TypeError);
  assert.throws(() => createGeologyIndex(null), TypeError);
  assert.equal(createGeologyIndex(collection([])).provenance.license, 'not_stated');
});

test('geology: boundary segments flag clip edges and convert to local metres', () => {
  const segs = geologicBoundarySegments(realIndex);
  assert.ok(segs.length > 0);
  assert.ok(segs.some((s) => s.clipEdge) && segs.some((s) => !s.clipEdge));
  for (const s of segs) {
    assert.ok(s.lonLat.length >= 2);
    for (const [lon, lat] of s.lonLat) assert.ok(lon >= 77.42 && lon <= 77.48 && lat >= 18.41 && lat <= 18.46);
  }
  const contacts = segs.filter((s) => !s.clipEdge).map((s) => s.unitCode);
  assert.ok(contacts.includes('Njf') && contacts.includes('Nle'));
  const local = geologicBoundarySegmentsToLocal(segs, adapter);
  assert.equal(local.length, segs.length);
  assert.ok(Object.isFrozen(local));
  const [lon, lat] = segs[0].lonLat[0];
  const p = adapter.latLonToLocal(lat, lon);
  assert.deepEqual(local[0].xy[0], [p.x, p.y]);
  assert.throws(() => geologicBoundarySegmentsToLocal(segs, {}), TypeError);
});

const snap = (q) => toGeologySnapshot(lookup(realIndex, q.lonDeg ?? q[0], q.latDeg ?? q[1]), realIndex);

test('geology snapshot contract: frozen, exact keys, real WB1/Roubion values', () => {
  assert.ok(Object.isFrozen(GEOLOGY_SNAPSHOT_CONTRACT) && Object.isFrozen(GEOLOGY_SNAPSHOT_CONTRACT.keys));
  for (const wp of WAYPOINTS) {
    const s = snap(wp);
    assert.deepEqual(Object.keys(s), [...GEOLOGY_SNAPSHOT_CONTRACT.keys]);
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.positionalUncertaintyM) && Object.isFrozen(s.candidates));
    assert.throws(() => { 'use strict'; s.unitCode = 'X'; }, TypeError);
    assert.equal(s.status, 'ok');
    assert.equal(s.unitCode, 'Njf');
    assert.equal(s.unitName, 'Jezero floor unit');
    assert.equal(s.onBoundary, false);
    assert.deepEqual(s.candidates, []);
    assert.deepEqual(s.positionalUncertaintyM, { min: 100, max: 200 });
    assert.equal(s.mapScale, '1:75,000');
    assert.equal(s.doi, 'https://doi.org/10.3133/sim3464');
    assert.equal(s.citation, manifest.citation);
    assert.equal(s.license, 'not_stated');
    assert.match(s.caveatTr, /indikatif/);
    assert.match(s.caveatTr, /100–200 m/);
    assert.match(s.caveatTr, /saha gerçeği değildir/);
    assert.match(s.caveatTr, /Mineraloji/);
    assert.match(s.caveatEn, /not field truth/);
  }
  assert.ok(GEOLOGY_CAVEAT_TR.length < 220);
  // Plain JSON-able data (no functions/undefined): survives a round trip unchanged.
  assert.deepEqual(JSON.parse(JSON.stringify(snap(WAYPOINTS[0]))), snap(WAYPOINTS[0]));
});

test('geology snapshot contract: non-ok statuses never fabricate a unit', () => {
  const outside = toGeologySnapshot(lookup(realIndex, 77.5, 18.5), realIndex);
  const invalid = toGeologySnapshot(lookup(realIndex, NaN, 18.4), realIndex);
  const noInput = toGeologySnapshot(undefined, realIndex);
  const bogus = toGeologySnapshot({ status: 'ok-ish', unit: { code: 'Njf', name: 'x' } }, realIndex);
  const forged = toGeologySnapshot({ status: 'outside_coverage', unit: { code: 'Njf', name: 'x' } }, realIndex);
  assert.equal(outside.status, 'outside_coverage');
  assert.equal(invalid.status, 'invalid_input');
  assert.equal(noInput.status, 'invalid_input');
  assert.equal(bogus.status, 'invalid_input');
  for (const s of [outside, invalid, noInput, bogus, forged]) {
    assert.equal(s.unitCode, null); assert.equal(s.unitName, null); assert.equal(s.onBoundary, false);
    assert.deepEqual(s.candidates, []);
    assert.deepEqual(Object.keys(s), [...GEOLOGY_SNAPSHOT_CONTRACT.keys]);
    assert.match(s.caveatTr, /indikatif/);
  }
  const idx = createGeologyIndex(collection([
    feat('Q', 'Right', { type: 'Polygon', coordinates: [sq(10, 0, 20, 10)] }, 7),
    feat('P', 'Left', { type: 'Polygon', coordinates: [sq(0, 0, 10, 10)] }, 3),
  ]));
  const amb = toGeologySnapshot(lookup(idx, 10, 5), idx);
  assert.equal(amb.status, 'ambiguous');
  assert.equal(amb.unitCode, null);
  assert.equal(amb.onBoundary, true);
  assert.deepEqual(amb.candidates, [
    { featureId: 3, unitCode: 'P', unitName: 'Left' }, { featureId: 7, unitCode: 'Q', unitName: 'Right' },
  ]);
  assert.ok(Object.isFrozen(amb.candidates[0]));
  const edge = toGeologySnapshot(lookup(idx, 0, 5), idx); // exactly on an edge, single unit
  assert.equal(edge.status, 'ok');
  assert.equal(edge.onBoundary, true);
  const noIndex = toGeologySnapshot(lookup(idx, 5, 5), null); // missing provenance -> nulls, caveats stay
  assert.equal(noIndex.citation, null); assert.equal(noIndex.mapScale, null); assert.equal(noIndex.doi, null);
  assert.match(noIndex.caveatTr, /indikatif/);
});

// Independent reference: segment distances straight from raw GeoJSON rings, local plane via adapter, no clip edges.
function bruteForceContactM(geojson, bbox, ad, xM, yM) {
  const eps = 1e-9;
  const onClip = (a, b) => [0, 2].some((k) => Math.abs(a[0] - bbox[k]) <= eps && Math.abs(b[0] - bbox[k]) <= eps)
    || [1, 3].some((k) => Math.abs(a[1] - bbox[k]) <= eps && Math.abs(b[1] - bbox[k]) <= eps);
  let best = Infinity;
  for (const f of geojson.features) {
    for (const rings of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) {
      for (const ring of rings) {
        for (let i = 0; i + 1 < ring.length; i++) {
          if (onClip(ring[i], ring[i + 1])) continue;
          const A = ad.latLonToLocal(ring[i][1], ring[i][0]), B = ad.latLonToLocal(ring[i + 1][1], ring[i + 1][0]);
          const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((xM - A.x) * dx + (yM - A.y) * dy) / l2)) : 0;
          best = Math.min(best, Math.hypot(xM - A.x - t * dx, yM - A.y - t * dy));
        }
      }
    }
  }
  return best;
}

test('geology: nearest-contact distance matches brute force and excludes clip edges', () => {
  const field = createGeologicContactField(realIndex, adapter);
  assert.ok(Object.isFrozen(field));
  const pts = WAYPOINTS.map((wp) => adapter.latLonToLocal(wp.latDeg, wp.lonDeg));
  const measured = pts.map((p) => nearestGeologicContactM(field, { xM: p.x, yM: p.y }));
  pts.forEach((p, i) => {
    const ref = bruteForceContactM(corridor, realIndex.coverageBbox, adapter, p.x, p.y);
    assert.ok(Math.abs(measured[i].distanceM - ref) < 1e-6, `${i}: ${measured[i].distanceM} vs ${ref}`);
  });
  // Measured through the project's local plane (the earlier audit's ~11.6/~22.1 m used a different projection).
  assert.ok(Math.abs(measured[0].distanceM - 12.17) < 0.05, `WB1 ${measured[0].distanceM}`);
  assert.ok(Math.abs(measured[1].distanceM - 22.82) < 0.05, `Roubion ${measured[1].distanceM}`);
  assert.deepEqual([measured[0].unitCode, measured[1].unitCode], ['Njf', 'Nle']); // contact is with the neighbouring polygon's edge
  // Random grid points agree with brute force too.
  for (let i = 0; i < 40; i++) {
    const x = -2500 + ((i * 7919) % 5000), y = -2500 + ((i * 104729) % 5000);
    const got = nearestGeologicContactM(field, { xM: x, yM: y });
    assert.ok(Math.abs(got.distanceM - bruteForceContactM(corridor, realIndex.coverageBbox, adapter, x, y)) < 1e-6);
  }
  // Clip edges are not contacts: a single square's only edges are clip edges -> no contact at all.
  const sqIdx = createGeologyIndex(collection([feat('A', 'Sq', { type: 'Polygon', coordinates: [sq(0, 0, 1, 1)] }, 1)], [0, 0, 1, 1]));
  const flat = { latLonToLocal: (lat, lon) => ({ x: lon * 1000, y: lat * 1000 }) };
  assert.equal(nearestGeologicContactM(createGeologicContactField(sqIdx, flat), { xM: 500, yM: 500 }), null);
  const pair = createGeologyIndex(collection([ // no declared bbox -> union bbox; only the shared edge x=1 is a contact
    feat('A', 'L', { type: 'Polygon', coordinates: [sq(0, 0, 1, 1)] }, 1),
    feat('B', 'R', { type: 'Polygon', coordinates: [sq(1, 0, 2, 1)] }, 2),
  ]));
  assert.ok(Math.abs(nearestGeologicContactM(createGeologicContactField(pair, flat), { xM: 600, yM: 100 }).distanceM - 400) < 1e-9);
  for (const bad of [{ xM: NaN, yM: 0 }, {}, undefined]) assert.equal(nearestGeologicContactM(field, bad), null);
  assert.equal(nearestGeologicContactM(null, { xM: 0, yM: 0 }), null);
  assert.throws(() => createGeologicContactField(realIndex, {}), TypeError);
});

test('geology: manifest hashes match the data files after CRLF -> LF normalisation', () => {
  const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const entry = manifest.files.find((f) => f.name === 'jezero_geounits_corridor.geojson');
  const normalised = Buffer.from(readText(entry.name).replace(/\r\n/g, '\n'), 'utf8');
  assert.equal(normalised.length, entry.size_bytes);
  assert.equal(sha(normalised), entry.sha256);
});
