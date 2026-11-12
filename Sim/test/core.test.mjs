// Core tests (node:test, no dependencies). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterFromLabel, pointToSegment, horn3x3Gradient } from '../public/js/geo/geo.js';
import { GridElevationLayer, UnavailableLayer, makeDescriptor, loadDtmLayer, STATUS } from '../public/js/surface/layers.js';
import {
  VALIDATION_STATUS,
  validateLayerManifest,
  buildHiriseManifestFromMeta,
  SurfaceProviderRegistry,
  createDefaultSurfaceRegistry,
} from '../public/js/surface/registry.js';
import { MarswalkSim, PHASE, createWorldSnapshot } from '../public/js/simulation/sim.js';
import { MAP_FRAME, WAYPOINTS, SCENARIO, ROUTE_ORIGIN_NOTE } from '../public/js/config.js';

const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const A = adapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg);
const B = adapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);
const NODATA = 0xFF7FFFFB;

test('adapter: waypoints land on expected DTM cells, origin is (0,0), route ≈ 686.204 m', () => {
  assert.deepEqual([A.x, A.y], [0, 0]);
  const ca = adapter.localToCell(A.x, A.y), cb = adapter.localToCell(B.x, B.y);
  assert.deepEqual([ca.row, ca.col], [6415, 3742]);
  assert.deepEqual([cb.row, cb.col], [7083, 3870]);
  assert.ok(Math.abs(Math.hypot(B.x - A.x, B.y - A.y) - 686.204) < 0.001);
  assert.ok(B.x > 0 && B.y < 0, 'Roubion is east-south-east of WB1: x east-positive, y north-positive');
});

test('adapter: pixel<->local round-trip; row grows southward while y grows northward', () => {
  const p = adapter.localToPixel(123.4, -567.8);
  const q = adapter.pixelToLocal(p.row, p.col);
  assert.ok(Math.abs(q.x - 123.4) < 1e-6 && Math.abs(q.y + 567.8) < 1e-6);
  const r0 = adapter.localToPixel(0, 0).row, r1 = adapter.localToPixel(0, 10).row;
  assert.ok(r1 < r0);
  const ll = adapter.localToLatLon(0, 0);
  assert.ok(Math.abs(ll.latDeg - WAYPOINTS[0].latDeg) < 1e-10 && Math.abs(ll.lonDeg - WAYPOINTS[0].lonDeg) < 1e-10);
});

test('deviation: shortest distance to the FINITE segment in metres', () => {
  const a = { x: 0, y: 0 }, b = { x: 0, y: -100 };
  assert.equal(pointToSegment(5, -50, a.x, a.y, b.x, b.y).distance, 5);
  assert.equal(pointToSegment(0, 10, a.x, a.y, b.x, b.y).distance, 10); // beyond start: distance to endpoint, not to infinite line
  assert.equal(pointToSegment(3, -104, a.x, a.y, b.x, b.y).distance, 5);
});

/** Synthetic 7x7 layer around WB1 cell; plane z = -2500 + 0.1*east + 0.0*north (slope atan(0.1)). */
function syntheticLayer(mutator) {
  const { row, col } = adapter.localToCell(0, 0);
  const rows = 7, cols = 7, row0 = row - 3, col0 = col - 3;
  const values = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) values[r * cols + c] = -2500 + 0.1 * c * MAP_FRAME.mapScaleM;
  mutator?.(values, new Uint32Array(values.buffer), cols);
  return new GridElevationLayer({
    descriptor: makeDescriptor({ product: 'synthetic', unit: 'm', verticalDatum: 'Mars 2000' }), adapter,
    values, rows, cols, rowOffset: row0, colOffset: col0, noDataBits: NODATA, validMin: -2679.2, validMax: -2388.31,
  });
}

test('horn3x3Gradient: pure helper computes east/north gradients and rejects invalid inputs', () => {
  const s = MAP_FRAME.mapScaleM;
  // Plane z = 0.2*x - 0.1*y; row grows south (y decreases as row increases)
  const z9 = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const x = dc * s, y = -dr * s;
      z9.push(-2500 + 0.2 * x - 0.1 * y);
    }
  }
  const g = horn3x3Gradient(z9, s);
  assert.ok(g);
  assert.ok(Math.abs(g.dzdx - 0.2) < 1e-10);
  assert.ok(Math.abs(g.dzdy - (-0.1)) < 1e-10);
  assert.ok(Math.abs(g.slopeDeg - Math.atan(Math.hypot(0.2, -0.1)) * 180 / Math.PI) < 1e-10);
  assert.equal(horn3x3Gradient([1, 2, 3], s), null);
  assert.equal(horn3x3Gradient([...z9.slice(0, 8), NaN], s), null);
  assert.equal(horn3x3Gradient(z9, 0), null);
});

test('sampling: valid cell returns value, unit, cell, method; slope via 3x3 Horn', () => {
  const L = syntheticLayer();
  const e = L.sampleElevation(0, 0);
  assert.equal(e.status, STATUS.OK); assert.equal(e.unit, 'm'); assert.ok(e.method && e.source && e.cell);
  const s = L.sampleSlope(0, 0);
  assert.equal(s.status, STATUS.OK);
  assert.ok(Math.abs(s.value - Math.atan(0.1) * 180 / Math.PI) < 1e-3);
  const { row, col } = adapter.localToCell(0, 0);
  const cg = L.cellGradient(row, col);
  assert.equal(cg.status, STATUS.OK);
  assert.equal(cg.slopeDeg, s.value);
});

test('sampling: no-data centre -> no_data (never 0); no-data neighbour -> no slope', () => {
  const center = syntheticLayer((v, bits, cols) => { bits[3 * cols + 3] = NODATA; });
  const e = center.sampleElevation(0, 0);
  assert.equal(e.status, STATUS.NO_DATA); assert.equal(e.value, null);
  const surf = center.sampleSurface(0, 0);
  assert.equal(surf.status, STATUS.NO_DATA); assert.equal(surf.zM, null);
  const neigh = syntheticLayer((v, bits, cols) => { bits[2 * cols + 4] = NODATA; });
  assert.equal(neigh.sampleElevation(0, 0).status, STATUS.OK);
  const s = neigh.sampleSlope(0, 0);
  assert.equal(s.status, STATUS.NO_DATA); assert.equal(s.value, null);
});

test('sampling: out of loaded window, out of product, invalid value, unavailable layer', () => {
  const L = syntheticLayer((v, bits, cols) => { v[3 * cols + 3] = 12345; });
  assert.equal(L.sampleElevation(0, 0).status, STATUS.INVALID);
  const out = L.sampleElevation(50, 0);
  assert.equal(out.status, STATUS.OUT_OF_BOUNDS); assert.match(out.reason, /alt kümesinin dışında/);
  assert.match(L.sampleElevation(0, 20000).reason, /ürün kapsamının dışında/);
  assert.equal(L.sampleSlope(3.5 * MAP_FRAME.mapScaleM, 0).status, STATUS.OUT_OF_BOUNDS); // window edge -> missing neighbour
  assert.equal(L.sampleElevation(NaN, 0).status, STATUS.INVALID);
  const U = new UnavailableLayer(makeDescriptor({ product: 'test-prod', unit: 'm', verticalDatum: 'Mars 2000' }), 'test');
  const ue = U.sampleElevation(0, 0);
  const us = U.sampleSlope(0, 0);
  const uSurf = U.sampleSurface(0, 0);
  assert.equal(ue.status, STATUS.UNAVAILABLE); assert.equal(ue.value, null); assert.equal(ue.unit, 'm'); assert.equal(ue.verticalDatum, 'Mars 2000');
  assert.equal(us.status, STATUS.UNAVAILABLE); assert.equal(us.value, null); assert.equal(us.unit, '°');
  assert.equal(uSurf.status, STATUS.UNAVAILABLE); assert.equal(uSurf.zM, null);
});

test('loader: missing data -> UnavailableLayer; frame mismatch disables sampling', async () => {
  const notFound = async () => ({ ok: false, status: 404 });
  const L = await loadDtmLayer({ baseUrl: 'x', adapter, expectedFrame: MAP_FRAME, fetchImpl: notFound });
  assert.equal(L.available, false); assert.equal(L.sampleElevation(0, 0).status, STATUS.UNAVAILABLE);
  const meta = { label: { ...MAP_FRAME, centerLonDeg: 77.5, sampleType: 'PC_REAL', sampleBits: 32 }, window: {} };
  const badFrame = async () => ({ ok: true, json: async () => meta });
  const M = await loadDtmLayer({ baseUrl: 'x', adapter, expectedFrame: MAP_FRAME, fetchImpl: badFrame });
  assert.equal(M.available, false); assert.match(M.descriptor.access.reason, /CRS\/grid doğrulanamadı/);
});

test('sim: movement, clock, pause, restart, corridor warning on/off', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  assert.equal(sim.phase, PHASE.READY);
  sim.step(0.05, {}); assert.equal(sim.simTimeS, 0, 'clock waits for first input');
  for (let i = 0; i < 10; i++) sim.step(0.05, { right: true });
  assert.equal(sim.phase, PHASE.RUNNING);
  const v = SCENARIO.walkSpeedMps * SCENARIO.timeScale;
  assert.ok(Math.abs(sim.pos.x - v * 0.5) < 1e-9);
  assert.ok(Math.abs(sim.simTimeS - 0.5 * SCENARIO.timeScale) < 1e-9);
  // walk east until outside the 10 m corridor
  while (!sim.metrics().outsideCorridor) sim.step(0.05, { right: true });
  assert.ok(sim.metrics().deviationM > 10);
  sim.togglePause(); const t = sim.simTimeS, x = sim.pos.x;
  sim.step(0.05, { left: true }); assert.equal(sim.simTimeS, t); assert.equal(sim.pos.x, x);
  sim.togglePause();
  while (sim.metrics().outsideCorridor) sim.step(0.05, { left: true });
  assert.ok(sim.metrics().deviationM <= 10);
  sim.setCorridorHalfWidth(2); assert.equal(sim.metrics().outsideCorridor, sim.metrics().deviationM > 2);
  sim.restart();
  assert.deepEqual([sim.pos.x, sim.pos.y, sim.simTimeS, sim.phase], [A.x, A.y, 0, PHASE.READY]);
});

test('worldSnapshot: produces deeply frozen frame with zM surface elevation (null on no_data/unavailable) and isolates live sim', () => {
  const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const validProvider = syntheticLayer();
  const snapOk = createWorldSnapshot({ sim, surfaceProvider: validProvider, adapter, waypoints, routeNote: ROUTE_ORIGIN_NOTE });

  assert.equal(snapOk.phase, PHASE.READY);
  assert.equal(snapOk.astronaut.xM, 0);
  assert.equal(snapOk.astronaut.yM, 0);
  assert.equal(snapOk.astronaut.elevationStatus, STATUS.OK);
  assert.ok(Number.isFinite(snapOk.astronaut.zM) && snapOk.astronaut.zM < -2000);
  assert.equal(snapOk.astronaut.zM, snapOk.surface.elevation.value);
  assert.equal(snapOk.astronaut.zDatum, 'Mars 2000');

  // Deep immutability check across nested objects and arrays
  assert.ok(Object.isFrozen(snapOk));
  assert.ok(Object.isFrozen(snapOk.astronaut));
  assert.ok(Object.isFrozen(snapOk.surface));
  assert.ok(Object.isFrozen(snapOk.surface.elevation));
  assert.ok(Object.isFrozen(snapOk.surface.elevation.cell));
  assert.ok(Object.isFrozen(snapOk.route));
  assert.ok(Object.isFrozen(snapOk.route.a));
  assert.ok(Object.isFrozen(snapOk.route.closestPoint));
  assert.ok(Object.isFrozen(snapOk.route.waypoints));
  assert.ok(Object.isFrozen(snapOk.route.waypoints[0]));
  assert.ok(Object.isFrozen(snapOk.trail));
  assert.ok(Object.isFrozen(snapOk.trail[0]));
  assert.throws(() => { snapOk.astronaut.xM = 999; }, TypeError);
  assert.throws(() => { snapOk.trail.push({ xM: 1, yM: 2 }); }, TypeError);
  assert.throws(() => { snapOk.trail[0].xM = 42; }, TypeError);
  assert.throws(() => { snapOk.route.closestPoint.xM = 42; }, TypeError);

  // Advancing live sim does not mutate previously captured snapshot
  sim.step(0.05, { right: true });
  assert.equal(snapOk.astronaut.xM, 0);
  assert.notEqual(sim.pos.x, 0);

  // No-data and unavailable providers produce zM === null (never 0)
  sim.restart();
  const noDataProvider = syntheticLayer((v, bits, cols) => { bits[3 * cols + 3] = NODATA; });
  const snapNd = createWorldSnapshot({ sim, surfaceProvider: noDataProvider, adapter, waypoints, routeNote: ROUTE_ORIGIN_NOTE });
  assert.equal(snapNd.astronaut.elevationStatus, STATUS.NO_DATA);
  assert.equal(snapNd.astronaut.zM, null);
  assert.equal(snapNd.surface.elevation.value, null);

  const unavailProvider = new UnavailableLayer(makeDescriptor({ product: 'none' }), 'devre dışı');
  const snapUn = createWorldSnapshot({ sim, surfaceProvider: unavailProvider, adapter, waypoints, routeNote: ROUTE_ORIGIN_NOTE });
  assert.equal(snapUn.astronaut.elevationStatus, STATUS.UNAVAILABLE);
  assert.equal(snapUn.astronaut.zM, null);
});

test('prepared data (if present): route samples are all valid DTM cells', { skip: !fs.existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dtm_subset.json')) }, () => {
  const meta = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dtm_subset.json'), 'utf8'));
  assert.equal(meta.frameMatchesConfig, true);
  assert.equal(meta.routeCheck.nonOkElevationSamples, 0);
  assert.equal(meta.routeCheck.samples, 681);
});

/** Builds a synthetic valid manifest (strictly for testing validator branches; NOT competition data). */
function syntheticManifest(overrides = {}) {
  const base = buildHiriseManifestFromMeta({
    label: {
      productId: 'SYNTHETIC_TEST_MANIFEST',
      productVersionId: '1',
      projectionType: 'EQUIRECTANGULAR',
      latitudeType: 'PLANETOCENTRIC',
      positiveLongitude: 'EAST',
      rotationDeg: 0,
      sampleType: 'PC_REAL',
      sampleBits: 32,
      scalingFactor: 1,
      offset: 0,
      missingConstantHex: 'FF7FFFFB',
      validMin: -2679.2,
      validMax: -2388.31,
      ...MAP_FRAME,
    },
    frameMatchesConfig: true,
    crsText: 'Equirectangular test CRS',
    coverage: { description: 'Sentetik test penceresi (yalnız doğrulayıcı testi için)' },
    timeCoverage: 'Sentetik test zaman kapsamı',
  });
  return { ...base, ...overrides };
}

test('manifest validator: returns supported for complete verified manifest, needs_review or invalid for ambiguous/missing fields', () => {
  const okRes = validateLayerManifest(syntheticManifest(), MAP_FRAME);
  assert.equal(okRes.status, VALIDATION_STATUS.SUPPORTED);
  assert.equal(okRes.samplingAllowed, true);

  // Ambiguous pixel registration (e.g. PixelIsArea vs PDS 1-based center) -> needs_review, sampling disabled
  const areaGrid = syntheticManifest({
    grid: { ...syntheticManifest().grid, pixelRegistration: 'AREA_GEOTIFF_UL' },
  });
  const areaRes = validateLayerManifest(areaGrid, MAP_FRAME);
  assert.equal(areaRes.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(areaRes.samplingAllowed, false);
  assert.equal(areaRes.fields.grid.status, VALIDATION_STATUS.NEEDS_REVIEW);

  // Unverified scaling/offset -> needs_review, sampling disabled
  const scaled = syntheticManifest({
    valueEncoding: { ...syntheticManifest().valueEncoding, scalingFactor: 0.5, offset: -1000 },
  });
  const scaledRes = validateLayerManifest(scaled, MAP_FRAME);
  assert.equal(scaledRes.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(scaledRes.samplingAllowed, false);
  assert.equal(scaledRes.fields.valueEncoding.status, VALIDATION_STATUS.NEEDS_REVIEW);

  // Unknown CRS or missing unit/no-data -> invalid, sampling disabled
  const badCrs = syntheticManifest({
    crs: { ...syntheticManifest().crs, projectionType: 'SINUSOIDAL' },
    unit: null,
  });
  const badRes = validateLayerManifest(badCrs, MAP_FRAME);
  assert.equal(badRes.status, VALIDATION_STATUS.INVALID);
  assert.equal(badRes.samplingAllowed, false);
  assert.equal(badRes.fields.crs.status, VALIDATION_STATUS.INVALID);
  assert.equal(badRes.fields.verticalReference.status, VALIDATION_STATUS.INVALID);
});

test('SurfaceProviderRegistry: rejects unverified candidate manifest (no 0 elevation) and falls back to verified provider', async () => {
  const reg = new SurfaceProviderRegistry({ expectedFrame: MAP_FRAME, adapter, defaultProviderId: 'hirise-jezero-dtm' });
  reg.register({
    id: 'hirise-jezero-dtm',
    title: 'HiRISE DTM (Jezero)',
    load: async () => ({
      manifest: syntheticManifest({ id: 'hirise-jezero-dtm' }),
      createLayer: async () => syntheticLayer(),
    }),
  });
  reg.register({
    id: 'synthetic-unverified-candidate',
    title: 'Sentetik Doğrulanmamış Aday (Yarışma Verisi Değil)',
    load: async () => ({
      manifest: syntheticManifest({
        id: 'synthetic-unverified-candidate',
        crs: { ...syntheticManifest().crs, transformVerified: false },
      }),
      createLayer: async () => syntheticLayer(),
    }),
  });

  // Direct load of unverified candidate disables sampling and returns UnavailableLayer (zM: null, never 0)
  const direct = await reg.loadProvider('synthetic-unverified-candidate');
  assert.equal(direct.validation.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(direct.provider.available, false);
  const surf = direct.provider.sampleSurface(0, 0);
  assert.equal(surf.status, STATUS.UNAVAILABLE);
  assert.equal(surf.zM, null);

  // resolveActiveProvider falls back to default HiRISE provider and keeps WorldSnapshot contract intact
  const resolved = await reg.resolveActiveProvider({ preferredId: 'synthetic-unverified-candidate' });
  assert.equal(resolved.fallbackUsed, true);
  assert.equal(resolved.activeId, 'hirise-jezero-dtm');
  assert.equal(resolved.rejectedCandidate.id, 'synthetic-unverified-candidate');
  assert.equal(resolved.rejectedCandidate.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(resolved.provider.available, true);

  const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const snap = createWorldSnapshot({ sim, surfaceProvider: resolved.provider, adapter, waypoints, routeNote: ROUTE_ORIGIN_NOTE });
  assert.equal(snap.astronaut.elevationStatus, STATUS.OK);
  assert.ok(Number.isFinite(snap.astronaut.zM) && snap.astronaut.zM < -2000);
});
