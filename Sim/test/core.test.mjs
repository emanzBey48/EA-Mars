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
import { cameraRelativeMovement, createFirstPersonCamera, getViewProjectionMatrix, lookCamera, setFirstPersonPose } from '../public/js/view/3d/camera.js';
import { ASTRONAUT_RIG, poseAstronautRig } from '../public/js/view/3d/astronaut-rig.js';
import { MAP_FRAME, WAYPOINTS, SCENARIO, ROUTE_ORIGIN_NOTE } from '../public/js/config.js';

const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const A = adapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg);
const B = adapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);
const NODATA = 0xFF7FFFFB;

test('adapter: waypoints land on expected DTM cells, origin is (0,0), route ≈ 687.343 m', () => {
  assert.deepEqual([A.x, A.y], [0, 0]);
  const ca = adapter.localToCell(A.x, A.y), cb = adapter.localToCell(B.x, B.y);
  assert.deepEqual([ca.row, ca.col], [13647, 13423]);
  assert.deepEqual([cb.row, cb.col], [14322, 13557]);
  assert.ok(Math.abs(Math.hypot(B.x - A.x, B.y - A.y) - 687.343) < 0.001);
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
  assert.ok(Math.abs(s.value - Math.atan(0.1) * 180 / Math.PI) < 2e-3);
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
  assert.ok(meta.routeCheck.samples >= 680);
});

/** Builds a synthetic valid manifest (strictly for testing validator branches; NOT competition data). */
function syntheticManifest(overrides = {}) {
  const ca = adapter.localToCell(A.x, A.y);
  const cb = adapter.localToCell(B.x, B.y);
  // Loaded window derived from the waypoint cells (+ margin); local bounds are the exact affine
  // outer edges of that window, as the validator recomputes them (PixelIsArea, +-0.5 px).
  const margin = 40;
  const window = {
    row0: Math.min(ca.row, cb.row) - margin,
    col0: Math.min(ca.col, cb.col) - margin,
    rows: Math.abs(ca.row - cb.row) + 2 * margin + 1,
    cols: Math.abs(ca.col - cb.col) + 2 * margin + 1,
  };
  const nw = adapter.pixelToLocal(window.row0 - 0.5, window.col0 - 0.5);
  const se = adapter.pixelToLocal(window.row0 + window.rows - 0.5, window.col0 + window.cols - 0.5);
  const pdsUrl = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl';
  const base = buildHiriseManifestFromMeta({
    window,
    windowStats: { noData: 0, invalid: 0 },
    routeCheck: { lengthM: Math.hypot(B.x - A.x, B.y - A.y), samples: 700, nonOkElevationSamples: 0 },
    transformComparison: {
      sourceUrl: pdsUrl,
      pdsGrid: {
        sourceUrl: pdsUrl,
        lineProjectionOffset: MAP_FRAME.lineProjectionOffset,
        sampleProjectionOffset: MAP_FRAME.sampleProjectionOffset,
        mapScaleM: MAP_FRAME.mapScaleM,
        radiusKm: MAP_FRAME.radiusKm,
      },
      tiffGrid: {
        lineProjectionOffset: MAP_FRAME.upperLeftY - MAP_FRAME.mapScaleM / 2,
        sampleProjectionOffset: -(MAP_FRAME.upperLeftX + MAP_FRAME.mapScaleM / 2),
      },
    },
    label: {
      ...MAP_FRAME,
      productId: 'SYNTHETIC_TEST_MANIFEST',
      productVersionId: '1',
      producer: 'USGS Astrogeology Science Center / NASA JPL',
      citation: 'Fergason et al. (2020), USGS Mars 2020 TRN HiRISE DTM Mosaic',
      useConstraints: 'This work is marked with CC0 1.0 Universal',
      useConstraintsEvidence: {
        statement: 'This work is marked with CC0 1.0 Universal',
        sourceUrl: 'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic',
      },
      provenanceEvidence: {
        productId: 'SYNTHETIC_TEST_MANIFEST',
        version: '1',
        sourceUrl: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl',
      },
      verticalDatum: 'MOLA Geoid (areoid)',
      verticalDatumVerified: true,
      verticalDatumEvidence: {
        statement: 'MOLA Geoid (areoid)',
        sourceUrl: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.xml',
      },
      projectionType: 'EQUIRECTANGULAR',
      latitudeType: 'PLANETOCENTRIC',
      positiveLongitude: 'EAST',
      rotationDeg: 0,
      sampleType: 'IEEE_REAL',
      sampleBits: 32,
      bands: 1,
      compression: 1,
      planarConfig: 1,
      byteOrder: 'LITTLE_ENDIAN',
      scalingFactor: 1,
      offset: 0,
      missingConstantHex: 'FF7FFFFB',
      noDataSource: 'TIFF_GDAL_NODATA',
      rangeSemantics: 'loaded_window_observed_extrema_only',
      observedMin: -2590.5,
      observedMax: -2540.2,
    },
    frameMatchesConfig: true,
    crsText: 'Equirectangular test CRS',
    coverage: {
      description: 'Sentetik test penceresi (yalnız doğrulayıcı testi için)',
      localBoundsM: { xMin: nw.x, xMax: se.x, yMin: se.y, yMax: nw.y },
    },
    timeCoverage: 'Sentetik test zaman kapsamı',
    transformControls: [
      { id: WAYPOINTS[0].id, row: ca.row, col: ca.col },
      { id: WAYPOINTS[1].id, row: cb.row, col: cb.col },
    ],
    transformToleranceM: 0.71,
    humanReviewRequired: false,
  });
  return { ...base, ...overrides };
}

test('manifest validator: returns supported for complete verified manifest, needs_review or invalid for ambiguous/missing fields', () => {
  const okRes = validateLayerManifest(syntheticManifest(), MAP_FRAME);
  assert.equal(okRes.status, VALIDATION_STATUS.SUPPORTED);
  assert.equal(okRes.samplingAllowed, true);
  assert.equal(okRes.reasonCode, 'verified');
  assert.deepEqual(okRes.issues, []);

  // Ambiguous pixel registration (e.g. PixelIsArea vs PDS 1-based center) -> needs_review, sampling disabled
  const areaGrid = syntheticManifest({
    grid: { ...syntheticManifest().grid, pixelRegistration: 'AREA_GEOTIFF_UL' },
  });
  const areaRes = validateLayerManifest(areaGrid, MAP_FRAME);
  assert.equal(areaRes.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(areaRes.samplingAllowed, false);
  assert.equal(areaRes.fields.grid.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(areaRes.reasonCode, 'needs_review_grid');

  // Unverified scaling/offset -> needs_review, sampling disabled
  const scaled = syntheticManifest({
    valueEncoding: { ...syntheticManifest().valueEncoding, scalingFactor: 0.5, offset: -1000 },
  });
  const scaledRes = validateLayerManifest(scaled, MAP_FRAME);
  assert.equal(scaledRes.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(scaledRes.samplingAllowed, false);
  assert.equal(scaledRes.fields.valueEncoding.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(scaledRes.reasonCode, 'needs_review_valueEncoding');

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
        humanReviewRequired: true,
      }),
      createLayer: async () => syntheticLayer(),
    }),
  });

  // Direct load of unverified candidate disables sampling and returns UnavailableLayer (zM: null, never 0)
  const direct = await reg.loadProvider('synthetic-unverified-candidate');
  assert.equal(direct.validation.status, VALIDATION_STATUS.NEEDS_REVIEW);
  assert.equal(direct.validation.reasonCode, 'needs_review_humanReview');
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

test('first-person camera: camera-relative input is normalized and look/pose remain finite', () => {
  const east = cameraRelativeMovement(0, { up: true });
  assert.ok(Math.abs(east.moveX - 1) < 1e-12 && Math.abs(east.moveY) < 1e-12);
  const north = cameraRelativeMovement(Math.PI / 2, { up: true });
  assert.ok(Math.abs(north.moveX) < 1e-12 && Math.abs(north.moveY - 1) < 1e-12);
  const eastFacingRight = cameraRelativeMovement(0, { right: true });
  assert.ok(Math.abs(eastFacingRight.moveX) < 1e-12 && Math.abs(eastFacingRight.moveY + 1) < 1e-12);
  const diagonal = cameraRelativeMovement(0, { up: true, right: true });
  assert.ok(Math.abs(Math.hypot(diagonal.moveX, diagonal.moveY) - 1) < 1e-12);

  const camera = createFirstPersonCamera({ yawRad: 0 });
  setFirstPersonPose(camera, { xM: 10, yM: 20, bodyZDisplay: -3 });
  assert.equal(camera.xM, 10);
  assert.equal(camera.yM, 20);
  assert.ok(camera.zDisplay > -3);
  lookCamera(camera, 100, -20);
  assert.ok(camera.yawRad > 0 && camera.pitchRad > 0);
  assert.ok([...getViewProjectionMatrix(camera, 16 / 9)].every(Number.isFinite));
});

test('astronaut rig: deterministic gait and explicit contact/airborne presentation', () => {
  assert.equal(ASTRONAUT_RIG.metadata.forward, '-Y');
  assert.equal(ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad, Math.PI / 2);
  const moving = { timeS: 1, horizontalSpeedMps: 1, verticalSpeedMps: 0, grounded: true, airborne: false, groundContactStatus: STATUS.OK, phase: 'running' };
  const gait = poseAstronautRig(moving);
  assert.deepEqual(poseAstronautRig(moving), gait);
  assert.equal(gait.pose, 'walk');
  assert.ok(gait.gaitFrequencyHz > 0);
  assert.deepEqual(poseAstronautRig({ ...moving, phase: 'paused' }), gait, 'same frozen snapshot yields same pose');
  const unknown = poseAstronautRig({ ...moving, grounded: false, verticalSpeedMps: -0.3, groundContactStatus: STATUS.NO_DATA });
  assert.equal(unknown.pose, 'unknown', 'unknown contact and a velocity value alone do not assert flight');
  assert.equal(unknown.gaitFrequencyHz, 0);
  assert.equal(poseAstronautRig({ ...moving, grounded: false, airborne: true, groundContactStatus: STATUS.NO_DATA }).pose, 'airborne');
  assert.equal(poseAstronautRig({ ...moving, grounded: false, airborne: false, groundContactStatus: STATUS.OK }).pose, 'airborne');
  assert.equal(poseAstronautRig({ ...moving, grounded: false, groundContactStatus: undefined }).pose, 'airborne', 'legacy callers retain grounded semantics');
});

test('first-person sim: time-step-stable horizontal input, Mars gravity, contact and explicit unknown terrain', () => {
  const wholeStep = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const splitStep = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  wholeStep.stepFirstPerson(0, {}, known);
  splitStep.stepFirstPerson(0, {}, known);
  wholeStep.stepFirstPerson(0.1, { moveX: 1 }, known);
  splitStep.stepFirstPerson(0.05, { moveX: 1 }, known);
  splitStep.stepFirstPerson(0.05, { moveX: 1 }, known);
  assert.ok(Math.abs(wholeStep.pos.x - splitStep.pos.x) < 1e-10);
  assert.ok(Math.abs(wholeStep.simTimeS - splitStep.simTimeS) < 1e-10);
  assert.equal(wholeStep.grounded, true);
  assert.equal(wholeStep.bodyWorldZM, -2500);

  const jump = new MarswalkSim({ a: A, b: B }, SCENARIO);
  jump.stepFirstPerson(0, {}, known);
  jump.stepFirstPerson(0.025, { jump: true }, known);
  assert.equal(jump.grounded, false);
  assert.equal(jump.airborne, true);
  assert.ok(jump.bodyWorldZM > known.value);
  assert.ok(jump.verticalSpeedMps > 0);
  const unknown = { status: STATUS.NO_DATA, value: null };
  jump.stepFirstPerson(0.025, {}, unknown);
  const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
  const snapshot = createWorldSnapshot({
    sim: jump,
    surfaceProvider: { sampleSurface: () => ({
      elevation: { status: STATUS.NO_DATA, value: null, unit: 'm', verticalDatum: 'Mars 2000', source: 'test', method: 'test' },
      slope: { status: STATUS.NO_DATA, value: null, unit: '°' },
      zM: null,
      status: STATUS.NO_DATA,
    }) },
    adapter, waypoints,
  });
  assert.equal(snapshot.astronaut.zM, null);
  assert.equal(snapshot.astronaut.elevationStatus, STATUS.NO_DATA);
  assert.equal(snapshot.astronaut.movement.grounded, false);
  assert.equal(snapshot.astronaut.movement.airborne, true, 'an active jump remains an explicit trajectory through unknown contact');
  assert.equal(snapshot.astronaut.movement.groundContactStatus, STATUS.NO_DATA);
  assert.ok(Number.isFinite(snapshot.astronaut.bodyWorldZM), 'retained world-Z pose anchor is separate from sampled surface zM');
  assert.equal(Object.isFrozen(snapshot.astronaut.movement), true);
  assert.equal(snapshot.astronaut.movement.timeS, jump.simTimeS);
  assert.equal(snapshot.astronaut.movement.phase, PHASE.RUNNING);
});

test('first-person sim: unknown initial terrain never seeds world Z, ground contact, or a jump', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const unknown = { status: STATUS.UNAVAILABLE, value: null };
  sim.resolveSurfaceContact(unknown);
  sim.stepFirstPerson(0.05, { jump: true }, unknown);
  assert.equal(sim.bodyWorldZM, null);
  assert.equal(sim.bodyWorldZReferenceM, null);
  assert.equal(sim.grounded, false);
  assert.equal(sim.airborne, false);
  assert.equal(sim.verticalSpeedMps, 0);
  assert.equal(sim.heightAboveReferenceM, 0);
});

test('first-person sim: paused valid first contact anchors once without advancing paused state', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  sim.phase = PHASE.PAUSED; // startup flow pauses before selecting the 3D view
  sim.simTimeS = 3.5;
  sim.horizontalVelocityXMps = 0.4;
  sim.horizontalVelocityYMps = -0.2;
  sim.verticalSpeedMps = 0.3;
  const velocities = [sim.horizontalVelocityXMps, sim.horizontalVelocityYMps, sim.verticalSpeedMps];
  const known = { status: STATUS.OK, value: -2500 };

  assert.equal(sim.resolveSurfaceContact(known), true);
  assert.equal(sim.bodyWorldZReferenceM, -2500);
  assert.equal(sim.bodyWorldZM, -2500);
  assert.equal(sim.heightAboveReferenceM, 0);
  assert.equal(sim.grounded, true);
  assert.equal(sim.airborne, false);
  assert.equal(sim.phase, PHASE.PAUSED);
  assert.equal(sim.simTimeS, 3.5);
  assert.deepEqual([sim.horizontalVelocityXMps, sim.horizontalVelocityYMps, sim.verticalSpeedMps], velocities);

  // A paused body with an established origin cannot be re-anchored or have its retained pose reconciled.
  sim.heightAboveReferenceM = 0.6;
  sim.grounded = false;
  sim.airborne = true;
  const before = { reference: sim.bodyWorldZReferenceM, height: sim.heightAboveReferenceM, velocity: sim.verticalSpeedMps };
  assert.equal(sim.resolveSurfaceContact({ status: STATUS.OK, value: -2501 }), false);
  assert.equal(sim.bodyWorldZReferenceM, before.reference);
  assert.equal(sim.heightAboveReferenceM, before.height);
  assert.equal(sim.verticalSpeedMps, before.velocity);
  assert.equal(sim.bodyWorldZM, -2499.4);

  const unknown = new MarswalkSim({ a: A, b: B }, SCENARIO);
  unknown.phase = PHASE.PAUSED;
  assert.equal(unknown.resolveSurfaceContact({ status: STATUS.NO_DATA, value: null }), false);
  assert.equal(unknown.bodyWorldZM, null);
  assert.equal(unknown.bodyWorldZReferenceM, null);
  assert.equal(unknown.grounded, false);
  assert.equal(unknown.airborne, false);
});

test('first-person sim: unknown contact does not start gravity, while a prior jump remains airborne', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  const unknown = { status: STATUS.UNAVAILABLE, value: null };
  sim.resolveSurfaceContact(known);
  sim.stepFirstPerson(0.05, { moveX: 1 }, known);
  const bodyBeforeUnknown = sim.bodyWorldZM;
  sim.stepFirstPerson(0.05, { moveX: 1 }, unknown);
  assert.equal(sim.grounded, false, 'unknown contact is not grounded');
  assert.equal(sim.airborne, false, 'unknown contact alone does not create a jump trajectory');
  assert.equal(sim.verticalSpeedMps, 0, 'unknown contact alone does not start gravity');
  assert.equal(sim.bodyWorldZM, bodyBeforeUnknown, 'retained body coordinate does not become fabricated ground');

  const jumper = new MarswalkSim({ a: A, b: B }, SCENARIO);
  jumper.resolveSurfaceContact(known);
  jumper.stepFirstPerson(0.025, { jump: true }, known);
  const vBeforeUnknown = jumper.verticalSpeedMps;
  jumper.stepFirstPerson(0.025, {}, unknown);
  assert.equal(jumper.airborne, true);
  assert.ok(jumper.verticalSpeedMps < vBeforeUnknown, 'gravity continues only for the already active jump trajectory');
});

test('Stage 12: Mars low-gravity jump ballistic arc — air time ~1.3 s and apex ~0.78 m', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  sim.resolveSurfaceContact(known);
  assert.equal(sim.grounded, true);

  // Jump trigger
  const dtWall = 0.005; // 0.005 * 8 = 0.04 s sim time per step
  sim.stepFirstPerson(dtWall, { jump: true }, known);
  assert.equal(sim.airborne, true);
  assert.equal(sim.grounded, false);

  const startSimTime = sim.simTimeS;
  let maxApexHeightM = 0;

  while (sim.airborne) {
    const height = sim.heightAboveReferenceM;
    if (height > maxApexHeightM) {
      maxApexHeightM = height;
    }
    sim.stepFirstPerson(dtWall, {}, known);
  }

  const airDurationSimS = sim.simTimeS - startSimTime;
  // Analytical: v0 = 2.4 m/s, g = 3.71 m/s²:
  // apex = 2.4² / (2 * 3.71) = 0.77628 m (~0.78 m)
  // air time = 2 * 2.4 / 3.71 = 1.2938 s (~1.3 s)
  assert.ok(Math.abs(maxApexHeightM - 0.776) < 0.02, `Apex height ${maxApexHeightM} m should be ~0.78 m`);
  assert.ok(Math.abs(airDurationSimS - 1.294) < 0.05, `Air duration ${airDurationSimS} s should be ~1.3 s`);
  assert.equal(sim.grounded, true);
  assert.equal(sim.airborne, false);
});

test('Stage 12 regression: ballistic touchdown time is stable across frame sizes and zero-delta takeoff', () => {
  const known = { status: STATUS.OK, value: -2500 };
  const expectedS = 2 * SCENARIO.jumpImpulseMps / SCENARIO.marsGravityMps2;
  for (const dtWall of [1 / 120, 1 / 60, 1 / 30, 0.05, 0.1]) {
    const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
    sim.resolveSurfaceContact(known);
    const startS = sim.simTimeS;
    sim.stepFirstPerson(dtWall, { moveX: 1, jump: true }, known);
    let steps = 0;
    let impactS = null;
    while (sim.airborne && steps++ < 100) {
      const v = sim.verticalSpeedMps;
      const h = sim.heightAboveReferenceM;
      const g = SCENARIO.marsGravityMps2;
      const timeToImpactS = (v + Math.sqrt(v * v + 2 * g * h)) / g;
      const dtSim = Math.min(0.1, dtWall) * SCENARIO.timeScale;
      if (timeToImpactS <= dtSim) impactS = sim.simTimeS - startS + timeToImpactS;
      sim.stepFirstPerson(dtWall, {}, known);
    }
    assert.ok(!sim.airborne, `jump should land for dt=${dtWall}`);
    assert.ok(impactS !== null, `impact should be resolved inside a frame for dt=${dtWall}`);
    assert.ok(Math.abs(impactS - expectedS) < 1e-9, `dt=${dtWall} produced ${impactS}s, expected ${expectedS}s`);
    while (sim.landingRecovery && steps++ < 200) sim.stepFirstPerson(dtWall, {}, known);
    const expectedHorizontalM = SCENARIO.walkSpeedMps * (expectedS + SCENARIO.landingRecoveryDurationS / 2);
    assert.ok(Math.abs(sim.pos.x - expectedHorizontalM) < 1e-9,
      `dt=${dtWall} produced ${sim.pos.x}m horizontal travel, expected ${expectedHorizontalM}m`);
  }

  const zeroDelta = new MarswalkSim({ a: A, b: B }, SCENARIO);
  zeroDelta.resolveSurfaceContact(known);
  zeroDelta.stepFirstPerson(0, { jump: true }, known);
  zeroDelta.stepFirstPerson(1 / 60, {}, known);
  assert.equal(zeroDelta.airborne, true, 'a zero-delta takeoff must not be mistaken for a landing on the next frame');
  assert.ok(zeroDelta.heightAboveReferenceM > 0);
});

test('Stage 12: Mid-air horizontal momentum conservation — ballistic transit without mid-air braking', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  sim.resolveSurfaceContact(known);

  // Take off while running forward (+X direction, moveX: 1)
  const dtWall = 0.01;
  sim.stepFirstPerson(dtWall, { moveX: 1, jump: true }, known);
  assert.equal(sim.airborne, true);
  const takeoffVx = sim.horizontalVelocityXMps;
  assert.ok(Math.abs(takeoffVx - SCENARIO.walkSpeedMps) < 1e-6);

  // Release all movement inputs mid-air: momentum must be conserved
  sim.stepFirstPerson(dtWall, { moveX: 0, moveY: 0 }, known);
  assert.equal(sim.airborne, true);
  assert.equal(sim.horizontalVelocityXMps, takeoffVx, 'Horizontal velocity must be conserved mid-air');
  assert.equal(sim.horizontalSpeedMps, SCENARIO.walkSpeedMps);

  // Even if opposite inputs are given mid-air, ballistic momentum is strictly conserved
  sim.stepFirstPerson(dtWall, { moveX: -1 }, known);
  assert.equal(sim.airborne, true);
  assert.equal(sim.horizontalVelocityXMps, takeoffVx, 'No mid-air thrusters/aerodynamic braking on Mars');

  // Verify position advances horizontally by conserved momentum
  const posXBefore = sim.pos.x;
  sim.stepFirstPerson(dtWall, {}, known);
  const dtSim = dtWall * SCENARIO.timeScale;
  assert.ok(Math.abs((sim.pos.x - posXBefore) - takeoffVx * dtSim) < 1e-6);
});

test('Stage 12: Landing impact recovery — recovery state active, jump blocked, timer expiry and snapshot', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  sim.resolveSurfaceContact(known);

  // Jump
  const dtWall = 0.01;
  sim.stepFirstPerson(dtWall, { jump: true }, known);
  assert.equal(sim.airborne, true);
  assert.equal(sim.landingRecovery, false);

  // Step until landing
  while (sim.airborne) {
    sim.stepFirstPerson(dtWall, {}, known);
  }

  // Right after landing: landingRecovery must be active
  assert.equal(sim.grounded, true);
  assert.equal(sim.airborne, false);
  assert.equal(sim.landingRecovery, true);
  assert.ok(sim.landingRecoveryTimerS > 0);
  assert.ok(sim.landingRecoveryFrac > 0 && sim.landingRecoveryFrac <= 1);

  // WorldSnapshot movement contract must include landingRecovery and landingRecoveryFrac
  const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
  const snap = createWorldSnapshot({
    sim,
    surfaceProvider: { sampleSurface: () => ({
      elevation: known,
      slope: { status: STATUS.OK, value: 0 },
    }) },
    adapter,
    waypoints,
  });
  assert.equal(snap.astronaut.movement.landingRecovery, true);
  assert.ok(snap.astronaut.movement.landingRecoveryFrac > 0);
  assert.equal(Object.isFrozen(snap.astronaut.movement), true);

  // Attempting to jump during landing recovery must be blocked
  sim.stepFirstPerson(dtWall, { jump: true }, known);
  assert.equal(sim.airborne, false, 'Jump must be blocked during landing recovery');
  assert.equal(sim.grounded, true);

  // Advance time past landingRecoveryDurationS
  const remainingWallTime = (sim.landingRecoveryTimerS / SCENARIO.timeScale) + 0.05;
  sim.stepFirstPerson(remainingWallTime, {}, known);
  assert.equal(sim.landingRecovery, false);
  assert.equal(sim.landingRecoveryTimerS, 0);
  assert.equal(sim.landingRecoveryFrac, 0);

  // Jump is now unblocked
  sim.stepFirstPerson(dtWall, { jump: true }, known);
  assert.equal(sim.airborne, true);
});

test('Stage 12: First-person camera dynamic offsets and view-projection calculation', () => {
  const camera = createFirstPersonCamera({ yawRad: 0, pitchRad: 0.1 });
  assert.equal(camera.dynamicPitchOffsetRad, 0);
  assert.equal(camera.dynamicEyeOffsetM, 0);

  // Set pose with dynamic offsets
  setFirstPersonPose(camera, {
    xM: 10,
    yM: 20,
    bodyZDisplay: 5,
    verticalScale: 3,
    eyeOffsetM: -0.05,
    pitchOffsetRad: -0.012,
  });

  assert.equal(camera.xM, 10);
  assert.equal(camera.yM, 20);
  assert.equal(camera.dynamicEyeOffsetM, -0.05);
  assert.equal(camera.dynamicPitchOffsetRad, -0.012);
  // Expected zDisplay: 5 + (1.48 - 0.05) * 3 = 5 + 1.43 * 3 = 9.29
  assert.ok(Math.abs(camera.zDisplay - (5 + (1.48 - 0.05) * 3)) < 1e-9);

  // Base pitch remains unchanged
  assert.equal(camera.pitchRad, 0.1);

  // View-projection matrix must be finite and valid
  const matrix = getViewProjectionMatrix(camera, 16 / 9);
  assert.equal(matrix.length, 16);
  assert.ok([...matrix].every(Number.isFinite));

  // Resetting offsets to default restores standard pose
  setFirstPersonPose(camera, { xM: 10, yM: 20, bodyZDisplay: 5, verticalScale: 3 });
  assert.equal(camera.dynamicEyeOffsetM, 0);
  assert.equal(camera.dynamicPitchOffsetRad, 0);
  assert.ok(Math.abs(camera.zDisplay - (5 + 1.48 * 3)) < 1e-9);
});

test('H1: body above a LOWER valid ground re-enters flight, falls until landing, and never reports contact before then', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const high = { status: STATUS.OK, value: -2500 };
  sim.resolveSurfaceContact(high);
  sim.stepFirstPerson(0.01, { jump: true }, high);
  for (let i = 0; i < 5; i++) sim.stepFirstPerson(0.01, {}, high); // 0.4 s sim time, well before ~1.29 s landing
  assert.equal(sim.airborne, true);
  assert.ok(sim.heightAboveReferenceM > 0);

  // Valid sample 2 m lower than the retained ground: body is still above it, so flight continues.
  const lower = { status: STATUS.OK, value: -2502 };
  const bodyBefore = sim.bodyWorldZM;
  assert.equal(sim.resolveSurfaceContact(lower), true);
  assert.equal(sim.airborne, true, 'lower valid ground with heightAbove > 0 keeps the body airborne');
  assert.equal(sim.grounded, false);
  assert.ok(Math.abs(sim.bodyWorldZM - bodyBefore) < 1e-9, 'resampling does not teleport the body');
  assert.ok(Math.abs(sim.heightAboveReferenceM - (bodyBefore - lower.value)) < 1e-9);

  let steps = 0;
  while (sim.airborne && steps < 5000) {
    sim.stepFirstPerson(0.01, {}, lower);
    if (sim.airborne) assert.equal(sim.grounded, false, 'no ground contact is reported mid-fall');
    steps++;
  }
  assert.ok(steps > 0, 'the fall takes time');
  assert.equal(sim.grounded, true, 'landing occurs on the lower valid ground');
  assert.equal(sim.bodyWorldZReferenceM, -2502);
  assert.equal(sim.heightAboveReferenceM, 0);
  assert.equal(sim.landingRecovery, true);
});

test('H1: no-data sample mid-fall creates no fake contact, landing, or recovery', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  const noData = { status: STATUS.NO_DATA, value: null };
  sim.resolveSurfaceContact(known);
  sim.stepFirstPerson(0.01, { jump: true }, known);
  sim.stepFirstPerson(0.01, {}, known);
  assert.equal(sim.airborne, true);

  const refBefore = sim.bodyWorldZReferenceM;
  for (let i = 0; i < 5; i++) {
    sim.stepFirstPerson(0.01, {}, noData);
    assert.equal(sim.grounded, false, 'no-data is never ground contact');
    assert.equal(sim.landingRecovery, false, 'no-data never starts landing recovery');
    assert.equal(sim.bodyWorldZReferenceM, refBefore, 'no-data does not reseed the ground origin');
  }
  assert.equal(sim.resolveSurfaceContact(noData), false);
  assert.equal(sim.grounded, false);
  assert.equal(sim.landingRecovery, false);
});

test('H2: PAUSED freezes flight -- stepFirstPerson and resolveSurfaceContact return early, momentum intact', () => {
  const sim = new MarswalkSim({ a: A, b: B }, SCENARIO);
  const known = { status: STATUS.OK, value: -2500 };
  sim.resolveSurfaceContact(known);
  sim.stepFirstPerson(0.01, { moveX: 1, jump: true }, known);
  sim.stepFirstPerson(0.01, { moveX: 1 }, known);
  assert.equal(sim.airborne, true);
  assert.equal(sim.togglePause(), PHASE.PAUSED);

  const frozen = {
    x: sim.pos.x, y: sim.pos.y, t: sim.simTimeS,
    vx: sim.horizontalVelocityXMps, vy: sim.horizontalVelocityYMps, vz: sim.verticalSpeedMps,
    h: sim.heightAboveReferenceM, ref: sim.bodyWorldZReferenceM,
    grounded: sim.grounded, airborne: sim.airborne, recovery: sim.landingRecovery,
  };
  assert.ok(frozen.vx > 0 && frozen.vz !== 0, 'flight has horizontal and vertical momentum before pause');

  const unknown = { status: STATUS.UNAVAILABLE, value: null };
  assert.equal(sim.resolveSurfaceContact(unknown), false);
  assert.equal(sim.resolveSurfaceContact(known), false, 'paused resolve does not reconcile');
  sim.stepFirstPerson(0.05, { moveX: -1, jump: true }, unknown);
  sim.stepFirstPerson(0.05, { moveX: -1 }, known);

  assert.deepEqual({
    x: sim.pos.x, y: sim.pos.y, t: sim.simTimeS,
    vx: sim.horizontalVelocityXMps, vy: sim.horizontalVelocityYMps, vz: sim.verticalSpeedMps,
    h: sim.heightAboveReferenceM, ref: sim.bodyWorldZReferenceM,
    grounded: sim.grounded, airborne: sim.airborne, recovery: sim.landingRecovery,
  }, frozen, 'paused frames change nothing, including air momentum');

  assert.equal(sim.togglePause(), PHASE.RUNNING);
  sim.stepFirstPerson(0.01, { moveX: -1 }, known);
  assert.equal(sim.horizontalVelocityXMps, frozen.vx, 'ballistic momentum survives resume unchanged');
});
