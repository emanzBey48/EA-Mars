import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  selectTraverseSubset, projectTraverse, polylineLengthM, polylineSurfaceLengthM, compareToStraightLine,
  compareEndpointsToReferences, haversineM, TRAVERSE_PROVENANCE,
} from '../public/js/geo/traverse.js';
import { buildIntermediateSolMarkers } from '../public/js/view/3d/marker-mesh.js';
import { WAYPOINTS, MAP_FRAME, SCENARIO } from '../public/js/config.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';

const DATA = new URL('../data/mars-trek/', import.meta.url);
const read = (n) => JSON.parse(fs.readFileSync(new URL(n, DATA), 'utf8'));
const traverseJson = read('M20_traverse.json');
const waypointsJson = read('M20_waypoints.json');
const manifest = read('manifest.json');
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const R = 3396190;

const subset = selectTraverseSubset(traverseJson, waypointsJson);
const local = projectTraverse(subset, adapter);

// Independent reference: raw JSON, plain equirectangular maths (lat_ts = 0), no module helpers.
const rawSegs = traverseJson.features.filter((f) => f.properties.sol >= 120 && f.properties.sol <= 164);
const kx = R * Math.PI / 180, ky = R * Math.PI / 180;
const o = { x: WAYPOINTS[0].lonDeg * kx, y: WAYPOINTS[0].latDeg * ky };
const toXY = ([lon, lat]) => ({ x: lon * kx - o.x, y: lat * ky - o.y });

test('subset: verified real-data truth for Sol 120-164 window', () => {
  assert.equal(subset.segments.length, 16);
  assert.equal(subset.segments.length, rawSegs.length);
  assert.equal(subset.stops.length, 16);
  assert.deepEqual(subset.segments.map((s) => s.sol),
    [122, 123, 124, 126, 127, 128, 129, 130, 131, 134, 135, 136, 137, 153, 155, 157]);
  assert.equal(subset.segments[0].fromRMC, '4_1250');
  assert.equal(subset.segments.at(-1).toRMC, '6_0');
  assert.equal(subset.contiguous, true);
  assert.deepEqual(subset.gaps, []);
  // Start stop is Site 4 Drive 1250, which the archive files under Sol 116 (not 120); no Sol 164 stop exists.
  assert.equal(subset.startStop.site, 4);
  assert.equal(subset.startStop.drive, 1250);
  assert.equal(subset.startStop.sol, 116);
  const last = subset.stops.at(-1);
  assert.equal(last.site, 6); assert.equal(last.drive, 0); assert.equal(last.sol, 157);
  assert.equal(last.isArrival, true);
  assert.ok(!subset.stops.some((s) => s.sol === 164 || s.sol === 120));
  assert.ok(subset.stops.every((s) => s.final));
  assert.equal(subset.counts.verticesSkippedInvalid, 0);
  assert.equal(subset.counts.segmentsSkipped, 0);
  assert.equal(subset.counts.stopsMissingWaypoint, 0);
});

test('lengths: polyline length matches independent computation and archive-reported length', () => {
  let ref = 0, refSurface = 0, reported = 0;
  for (const f of rawSegs) {
    reported += f.properties.length;
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const a = toXY(c[i - 1]), b = toXY(c[i]);
      ref += Math.hypot(b.x - a.x, b.y - a.y);
      refSurface += haversineM(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0], R);
    }
  }
  // Concatenated polyline adds the tiny joins between consecutive drive segments (< 0.05 m each in the archive).
  assert.ok(polylineLengthM(local.polyline) - ref >= -1e-6 && polylineLengthM(local.polyline) - ref < 0.1);
  const surface = local.segments.reduce((s, x) => s + polylineSurfaceLengthM(x.points), 0);
  assert.ok(Math.abs(surface - refSurface) < 1e-6);
  // Archive 'length' is rounded to 0.01 m per segment; surface length should agree within 1 %.
  assert.ok(Math.abs(surface - reported) / reported < 0.01, `surface ${surface} vs reported ${reported}`);
  // Local plane (lat_ts = 0) overstates east-west distance, so it is >= the true surface length.
  assert.ok(local.segments.reduce((s, x) => s + x.lengthLocalM, 0) >= surface);
  const segSum = local.segments.reduce((s, x) => s + x.lengthLocalM, 0);
  assert.ok(segSum >= ref - 1e-6 && segSum <= ref + 1e-6);
});

test('straight-line comparison: deviation, mean and corridor fraction match brute force', () => {
  const a = adapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg);
  const b = adapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);
  const half = SCENARIO.corridorHalfWidthM;
  const cmp = compareToStraightLine(local.polyline, a, b, { corridorHalfWidthM: half });
  assert.equal(cmp.corridorHalfWidthM, 10);
  assert.match(cmp.corridorHalfWidthLabel, /scenario assumption/);
  assert.match(cmp.note, /not the real traverse/);

  // Independent: perpendicular distance to clamped segment, dense sampling of every edge.
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const dist = (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
  };
  let maxD = 0, sum = 0, inside = 0, tot = 0;
  const P = local.polyline;
  for (let i = 1; i < P.length; i++) {
    maxD = Math.max(maxD, dist(P[i].x, P[i].y));
    const len = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    const n = 2000, w = len / n;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const d = dist(P[i - 1].x + t * (P[i].x - P[i - 1].x), P[i - 1].y + t * (P[i].y - P[i - 1].y));
      sum += d * w; tot += w; if (d <= half) inside += w;
    }
  }
  assert.ok(Math.abs(cmp.maxLateralDeviationM - maxD) < 1e-9);
  assert.ok(Math.abs(cmp.meanLateralDeviationM - sum / tot) < 0.02);
  assert.ok(Math.abs(cmp.fractionInsideCorridor - inside / tot) < 0.005);
  assert.ok(Math.abs(cmp.straightLengthM - Math.hypot(dx, dy)) < 1e-9);
  assert.ok(Math.abs(cmp.lengthDifferenceM - (cmp.polylineLengthM - cmp.straightLengthM)) < 1e-9);
  assert.ok(cmp.polylineLengthM > cmp.straightLengthM, 'real traverse is longer than the straight link');
  assert.ok(cmp.maxLateralDeviationM > 0 && cmp.meanLateralDeviationM <= cmp.maxLateralDeviationM);
  assert.ok(cmp.fractionInsideCorridor >= 0 && cmp.fractionInsideCorridor <= 1);
  // Degenerate: polyline lying on the line has zero deviation and is fully inside.
  const onLine = compareToStraightLine([a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b], a, b);
  assert.ok(onLine.maxLateralDeviationM < 1e-9);
  assert.equal(onLine.fractionInsideCorridor, 1);
  assert.throws(() => compareToStraightLine([a], a, b), TypeError);
  assert.throws(() => compareToStraightLine(P, { x: NaN, y: 0 }, b), TypeError);
});

test('endpoint comparison: PDS config and Mars Trek manifest key_waypoints, numbers only', () => {
  const kw = manifest.target_region.key_waypoints;
  assert.equal(kw.Sol_120_WB1.latitude_deg, 18.4386299);
  const refs = {
    configPds: { start: WAYPOINTS[0], end: WAYPOINTS[1] },
    manifestKeyWaypoints: {
      start: { latDeg: kw.Sol_120_WB1.latitude_deg, lonDeg: kw.Sol_120_WB1.longitude_deg },
      end: { latDeg: kw.Sol_164_Roubion.latitude_deg, lonDeg: kw.Sol_164_Roubion.longitude_deg },
    },
  };
  const r = compareEndpointsToReferences(subset, refs, adapter);
  const pds = r.references.configPds, man = r.references.manifestKeyWaypoints;
  // Config PDS start is exactly the MMGIS 4_1250 waypoint (same lat/lon to the digit).
  assert.ok(pds.start.surfaceM < 0.01, `start vs PDS ${pds.start.surfaceM}`);
  // Config Sol 164 vs MMGIS 6_0 (Sol 157): centimetre-level agreement.
  assert.ok(pds.end.surfaceM < 0.1, `end vs PDS ${pds.end.surfaceM}`);
  // Manifest key_waypoints differ by tens of metres: expose, do not decide.
  const expStart = haversineM(18.43906919, 77.44940206, 18.4386299, 77.4494015, R);
  const expEnd = haversineM(18.42769464, 77.45164982, 18.4328406, 77.451742, R);
  assert.ok(Math.abs(man.start.surfaceM - expStart) < 1e-6);
  assert.ok(Math.abs(man.end.surfaceM - expEnd) < 1e-6);
  assert.ok(man.start.surfaceM > 1 && man.end.surfaceM > 1, 'manifest key_waypoints differ from archive stops by metres, not centimetres');
  assert.ok(man.start.localPlaneM >= man.start.surfaceM - 1e-6);
  assert.match(r.note, /no source is declared canonical/);
  const bad = compareEndpointsToReferences(subset, { x: { start: { latDeg: NaN, lonDeg: 1 }, end: null } });
  assert.equal(bad.references.x.start.status, 'invalid-reference');
  assert.equal(bad.references.x.end.surfaceM, null);
});

test('invalid data: fails closed with counts, never zero-fills', () => {
  assert.throws(() => selectTraverseSubset(null, waypointsJson), TypeError);
  assert.throws(() => selectTraverseSubset(traverseJson, { type: 'Feature' }), TypeError);
  assert.throws(() => selectTraverseSubset(traverseJson, waypointsJson, { solMin: 5, solMax: 1 }), RangeError);

  const seg = (sol, from, to, coords) => ({
    type: 'Feature', properties: { sol, fromRMC: from, toRMC: to, length: 1 }, geometry: { type: 'LineString', coordinates: coords },
  });
  const wp = (rmc, sol, lat, lon, fin = 'y') => ({ type: 'Feature', properties: { RMC: rmc, sol, site: 1, drive: 2, lat, lon, final: fin }, geometry: null });
  const t = { type: 'FeatureCollection', features: [
    seg(130, 'A', 'B', [[77.0, 18.0, 1], [null, 18.0], ['77.1', 18.0], [NaN, 1], [77.0, 95], [77.001, 18.001, null], [77.001, 18.001, 2]]),
    seg(131, 'B', 'C', [[77.001, 18.001]]), // < 2 valid vertices
    { type: 'Feature', properties: { sol: 132, fromRMC: 'C', toRMC: 'D' }, geometry: { type: 'Point', coordinates: [77, 18] } },
    seg(133, 'D', 'E', [[77.002, 18.002], [77.003, 18.003]]),
    seg(500, 'X', 'Y', [[0, 0], [1, 1]]), // outside sol range
  ] };
  const w = { type: 'FeatureCollection', features: [wp('A', 129, 18, 77), wp('B', 130, 18.001, 77.001), wp('E', 133, null, 77.003)] };
  const s = selectTraverseSubset(t, w);
  assert.equal(s.segments.length, 2);
  assert.equal(s.counts.segmentsInSolRange, 4);
  assert.equal(s.counts.segmentsSkipped, 2);
  assert.equal(s.counts.verticesSkippedInvalid, 4); // null lon, string lon, NaN, lat 95
  assert.equal(s.counts.verticesDuplicateCollapsed, 1);
  assert.equal(s.segments[0].vertices.length, 2);
  assert.equal(s.stops.length, 1); // 'E' has null lat -> skipped, not (0, lon)
  assert.equal(s.counts.stopsInvalidCoordinate, 1);
  assert.equal(s.counts.stopsMissingWaypoint, 0);
  assert.equal(s.contiguous, false);
  assert.equal(s.gaps.length, 1);
  assert.ok(s.segments.every((x) => x.vertices.every((v) => v.lonDeg !== 0 && v.latDeg !== 0)));

  // Adapter returning non-finite points: skipped and counted.
  const flaky = { latLonToLocal: (lat, lon) => (lon > 77.0005 ? { x: NaN, y: 0 } : { x: lon, y: lat }) };
  const p = projectTraverse(s, flaky);
  assert.ok(p.skippedPoints > 0);
  assert.ok(p.polyline.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)));
  assert.throws(() => projectTraverse(s, {}), TypeError);
});

test('frozen provenance and determinism', () => {
  assert.ok(Object.isFrozen(TRAVERSE_PROVENANCE));
  assert.ok(Object.isFrozen(subset) && Object.isFrozen(subset.segments[0]) && Object.isFrozen(local.polyline));
  assert.match(TRAVERSE_PROVENANCE.nature, /archival MMGIS traverse; not live telemetry; not a safety route/);
  assert.match(TRAVERSE_PROVENANCE.source, /MMGIS/);
  assert.equal(TRAVERSE_PROVENANCE.credit, null);
  assert.throws(() => { TRAVERSE_PROVENANCE.source = 'x'; }, TypeError);
  const again = projectTraverse(selectTraverseSubset(traverseJson, waypointsJson), adapter);
  assert.deepEqual(again, local);
  assert.equal(local.provenance, TRAVERSE_PROVENANCE);
  // Archive elevations are carried under a distinct name so they are not mistaken for DTM samples.
  assert.ok(local.stops.every((s) => s.elevationM === undefined && Number.isFinite(s.archiveElevationM)));
});

test('intermediate sol markers: valid, deterministic, frozen geometry', () => {
  const stops = local.stops.filter((s) => !s.isArrival);
  assert.equal(stops.length, 15);
  const display = { referenceElevationM: -2560, verticalScale: 3 };
  const flat = () => ({ status: 'ok', value: -2570 });
  const m = buildIntermediateSolMarkers({ stops, displayConfig: display, sampleElevation: flat });
  assert.equal(m.metadata.kind, '3d-intermediate-sol-markers');
  assert.equal(m.metadata.markerCount, 15);
  assert.equal(m.metadata.omittedCount, 0);
  assert.ok(m.positions instanceof Float32Array && m.normals instanceof Float32Array);
  assert.ok(m.colorsRgb instanceof Float32Array && m.indices instanceof Uint32Array);
  assert.equal(m.positions.length, m.vertexCount * 3);
  assert.equal(m.normals.length, m.positions.length);
  assert.equal(m.colorsRgb.length, m.positions.length);
  assert.equal(m.indices.length, m.triangleCount * 3);
  assert.ok(m.vertexCount > 0 && m.triangleCount > 0);
  for (const arr of [m.positions, m.normals, m.colorsRgb]) assert.ok(arr.every(Number.isFinite));
  assert.ok(m.indices.every((i) => i < m.vertexCount));
  assert.ok(m.colorsRgb.every((c) => c >= 0 && c <= 1));
  // Per-marker vertex/index counts are identical, so totals scale linearly.
  const one = buildIntermediateSolMarkers({ stops: stops.slice(0, 1), displayConfig: display, sampleElevation: flat });
  assert.equal(m.vertexCount, one.vertexCount * 15);
  assert.equal(m.triangleCount, one.triangleCount * 15);
  // Z range: ground (-2570 -> -30) up to a small gem below ~2 m above ground.
  assert.ok(m.bounds.minZ >= -30 - 1e-3 && m.bounds.maxZ - m.bounds.minZ < 2.5);
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.metadata) && Object.isFrozen(m.bounds));
  const m2 = buildIntermediateSolMarkers({ stops, displayConfig: display, sampleElevation: flat });
  assert.deepEqual(Array.from(m2.positions), Array.from(m.positions));
  assert.deepEqual(Array.from(m2.indices), Array.from(m.indices));
});

test('intermediate sol markers: no-data omitted, never zero; input validation', () => {
  const display = { referenceElevationM: -2560, verticalScale: 3 };
  const stops = [
    { id: 'a', sol: 1, xM: 0, yM: 0 },
    { id: 'b', sol: 2, xM: 10, yM: 0, archiveElevationM: -2500 }, // archive elevation must be ignored
    { id: 'c', sol: 3, xM: NaN, yM: 0 },
    { id: 'd', sol: 4, xM: 5, yM: 5, elevationM: -2565 },
  ];
  const sampler = (x) => (x === 0 ? { status: 'ok', value: -2570 } : { status: 'no-data', value: null });
  const m = buildIntermediateSolMarkers({ stops, displayConfig: display, sampleElevation: sampler });
  assert.equal(m.metadata.markerCount, 2); // a (sampled) and d (explicit elevation)
  assert.equal(m.metadata.omittedCount, 2); // b (no-data), c (non-finite x)
  assert.equal(m.metadata.stops.find((s) => s.id === 'b').elevationStatus, 'no-data');
  assert.equal(m.metadata.stops.find((s) => s.id === 'b').elevationM, null);
  const empty = buildIntermediateSolMarkers({ stops: [], displayConfig: display });
  assert.equal(empty.vertexCount, 0);
  assert.equal(empty.indices.length, 0);
  assert.throws(() => buildIntermediateSolMarkers({ stops: 'x', displayConfig: display }), TypeError);
  assert.throws(() => buildIntermediateSolMarkers({ stops: [], displayConfig: null }), TypeError);
});
