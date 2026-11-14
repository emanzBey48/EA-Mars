import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import {
  createGeologyIndex, lookupGeologicUnit, lookupGeologicUnitLocal,
  geologicBoundarySegments, geologicBoundarySegmentsToLocal, LOOKUP_STATUS, GEOLOGY_CAVEATS,
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

test('geology: manifest hashes match the data files after CRLF -> LF normalisation', () => {
  const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const entry = manifest.files.find((f) => f.name === 'jezero_geounits_corridor.geojson');
  const normalised = Buffer.from(readText(entry.name).replace(/\r\n/g, '\n'), 'utf8');
  assert.equal(normalised.length, entry.size_bytes);
  assert.equal(sha(normalised), entry.sha256);
});
