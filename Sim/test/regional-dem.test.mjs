// Stage 37A tests: regional grid sampling, local resampling, DTM comparison and latitude-convention experiment.
// Synthetic grids only (no network, no disk data).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRegionalGrid, sampleNearest, sampleBilinear, planetocentricToGeodeticDeg, geodeticToPlanetocentricDeg,
  createLocalFrame, resampleToLocalGrid, createLocalWindow, summarize, compareToLocalDtm,
  latitudeConventionExperiment,
} from '../public/js/geo/regional-dem.js';

const INV_F = 169.8944472236118; // Mars 2000 IAU/IAG flattening as stored in the Trek GeoTIFF (GeoKey 2059)
const ORIGIN = { latDeg: 18.5, lonDeg: 77.5 };

/** Synthetic regional grid: cell centres lon = west + (c+0.5)px, lat = north - (r+0.5)px. f(lonDeg, latDeg) -> value. */
function makeGrid({ west = 77.0, north = 19.0, px = 0.002, width = 500, height = 500, f, invalid = [] }) {
  const values = new Float32Array(width * height);
  const validMask = new Uint8Array(width * height).fill(1);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const lon = west + (c + 0.5) * px;
      const lat = north - (r + 0.5) * px;
      values[r * width + c] = f ? f(lon, lat) : 0;
    }
  }
  for (const [r, c] of invalid) {
    validMask[r * width + c] = 0;
    values[r * width + c] = -9999;
  }
  return createRegionalGrid({
    width,
    height,
    values,
    validMask,
    bounds: { west, east: west + width * px, south: north - height * px, north },
    pixelSizeDeg: px,
  });
}

/** Local DTM window around the frame origin, values from valueFn(lonDeg, latDeg) (planetocentric lat). */
function makeWindow(frame, { xMin = -150, yMax = 150, width = 300, height = 300, cellM = 1, valueFn }) {
  const values = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const x = xMin + (c + 0.5) * cellM;
      const y = yMax - (r + 0.5) * cellM;
      const { latDeg, lonDeg } = frame.adapter.localToLatLon(x, y);
      values[r * width + c] = valueFn(lonDeg, latDeg);
    }
  }
  return createLocalWindow({ width, height, values, xMinM: xMin, yMaxM: yMax, cellM });
}

const lonAt = (g, c) => g.bounds.west + (c + 0.5) * g.pixelSizeDeg;
const latAt = (g, r) => g.bounds.north - (r + 0.5) * g.pixelSizeDeg;

test('sampleBilinear reproduces a linear field exactly at interior points', () => {
  const f = (lon, lat) => 500 * (lat - 18) + 100 * (lon - 77);
  const g = makeGrid({ f, width: 200, height: 200, px: 0.005, north: 19, west: 77 });
  const points = [[77.2, 18.3], [77.61, 18.77], [77.99, 18.01], [77.5, 18.5]]; // all inside the cell-centre hull
  for (const [lon, lat] of points) {
    const v = sampleBilinear(g, lon, lat);
    assert.ok(v !== null);
    assert.ok(Math.abs(v - f(lon, lat)) < 1e-3, `linear field at (${lon}, ${lat}): ${v} vs ${f(lon, lat)}`);
  }
});

test('sampleBilinear is null when any of the 2x2 neighbours is no-data (no smoothing, no zero)', () => {
  const g = makeGrid({ f: () => 10, width: 10, height: 10, px: 0.01, north: 19, west: 77, invalid: [[3, 3]] });
  // Point between centres of cells (2,2),(2,3),(3,2),(3,3): the invalid cell (3,3) is one of its neighbours.
  const inside = sampleBilinear(g, lonAt(g, 2) + 0.005, latAt(g, 2) - 0.005);
  assert.equal(inside, null);
  // Point between cells (1,1)..(2,2): none of its neighbours is invalid.
  const clear = sampleBilinear(g, lonAt(g, 1) + 0.005, latAt(g, 1) - 0.005);
  assert.equal(clear, 10);
});

test('sampleBilinear is null outside the cell-centre hull; the last centre itself is valid', () => {
  const g = makeGrid({ f: () => 7, width: 10, height: 10, px: 0.01, north: 19, west: 77 });
  assert.equal(sampleBilinear(g, lonAt(g, 0) - 0.001, latAt(g, 5)), null); // west of first column centre
  assert.equal(sampleBilinear(g, lonAt(g, 9) + 0.001, latAt(g, 5)), null); // east of last column centre
  assert.equal(sampleBilinear(g, lonAt(g, 9), latAt(g, 9)), 7); // exactly on the last centre
  assert.equal(sampleBilinear(g, Number.NaN, 18.9), null);
});

test('sampleNearest reports ok, no_data and outside without converting no-data to 0', () => {
  const g = makeGrid({ f: () => -123, width: 10, height: 10, px: 0.01, north: 19, west: 77, invalid: [[4, 4]] });
  assert.deepEqual(
    [sampleNearest(g, lonAt(g, 1), latAt(g, 1)).status, sampleNearest(g, lonAt(g, 4), latAt(g, 4)).status],
    ['ok', 'no_data'],
  );
  assert.equal(sampleNearest(g, lonAt(g, 4), latAt(g, 4)).value, null);
  assert.equal(sampleNearest(g, 80, 18.9).status, 'outside');
});

test('geodetic and planetocentric latitudes: analytic relation, round trip and sphere limit', () => {
  // tan(phi_geoc) = (1 - e^2) tan(phi_geod), e^2 = f(2 - f)
  const f = 1 / INV_F;
  const e2 = f * (2 - f);
  const geod = planetocentricToGeodeticDeg(18.43, INV_F);
  assert.ok(Math.abs(Math.tan(18.43 * Math.PI / 180) - (1 - e2) * Math.tan(geod * Math.PI / 180)) < 1e-12);
  // Small-angle check at 45 deg: difference ~ (e^2/2) sin(2 phi) radians.
  const d45 = planetocentricToGeodeticDeg(45, INV_F) - 45;
  const approx = (e2 / 2) * Math.sin(Math.PI / 2) * 180 / Math.PI;
  assert.ok(Math.abs(d45 - approx) < 0.005, `d45=${d45}, approx=${approx}`);
  // Round trip.
  for (const lat of [-80, -18.4, 0, 18.43, 60]) {
    const back = geodeticToPlanetocentricDeg(planetocentricToGeodeticDeg(lat, INV_F), INV_F);
    assert.ok(Math.abs(back - lat) < 1e-9);
  }
  // Sphere limit (very large inverse flattening) and equator/pole fixed points.
  assert.ok(Math.abs(planetocentricToGeodeticDeg(18.43, 1e12) - 18.43) < 1e-9);
  assert.ok(Math.abs(planetocentricToGeodeticDeg(0, INV_F)) < 1e-12);
  assert.ok(Math.abs(planetocentricToGeodeticDeg(90, INV_F) - 90) < 1e-9);
  assert.throws(() => planetocentricToGeodeticDeg(18, 0), RangeError);
});

test('local frame: origin maps to (0,0) and localToLatLon inverts the project plane', () => {
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const o = frame.adapter.localToLatLon(0, 0);
  assert.ok(Math.abs(o.latDeg - ORIGIN.latDeg) < 1e-12);
  assert.ok(Math.abs(o.lonDeg - ORIGIN.lonDeg) < 1e-12);
  const p = frame.adapter.localToLatLon(250, -400);
  const back = frame.adapter.latLonToLocal(p.latDeg, p.lonDeg);
  assert.ok(Math.abs(back.x - 250) < 1e-6 && Math.abs(back.y + 400) < 1e-6);
});

test('resampleToLocalGrid reproduces an analytic field on the local metre grid', () => {
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const f = (lon, lat) => 1000 * (lat - 18.5) + 50 * (lon - 77.5);
  const g = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77 });
  const extent = { xMinM: -200, xMaxM: 200, yMinM: -200, yMaxM: 200, cellM: 20 };
  const out = resampleToLocalGrid(g, frame, extent);
  assert.equal(out.width, 20);
  assert.equal(out.height, 20);
  assert.equal(out.validCount, 400);
  for (let r = 0; r < out.height; r++) {
    for (let c = 0; c < out.width; c++) {
      const x = extent.xMinM + (c + 0.5) * extent.cellM;
      const y = extent.yMaxM - (r + 0.5) * extent.cellM;
      const { latDeg, lonDeg } = frame.adapter.localToLatLon(x, y);
      assert.ok(Math.abs(out.values[r * out.width + c] - f(lonDeg, latDeg)) < 1e-3);
    }
  }
});

test('resampleToLocalGrid applies the latitude mapping and marks invalid cells NaN with mask 0', () => {
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const f = (lon, lat) => 1000 * (lat - 18.5);
  const g = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77 });
  const shifted = resampleToLocalGrid(g, frame, { xMinM: -20, xMaxM: 20, yMinM: -20, yMaxM: 20, cellM: 10 }, { latMap: (lat) => lat + 0.01 });
  // Cell (row 0, col 0) has its centre at x = -15, y = 15 (metres).
  const p = frame.adapter.localToLatLon(-15, 15);
  assert.ok(Math.abs(shifted.values[0] - 1000 * (p.latDeg + 0.01 - 18.5)) < 1e-3);

  // A no-data cell far from the origin does not touch the local window's 2x2 neighbourhoods: all 4 cells stay valid.
  const remote = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77, invalid: [[100, 100]] });
  const ok4 = resampleToLocalGrid(remote, frame, { xMinM: -10, xMaxM: 10, yMinM: -10, yMaxM: 10, cellM: 5 });
  assert.equal(ok4.width * ok4.height, 16); // 20 m window at 5 m cells
  assert.equal(ok4.validCount, 16);
  // No-data in the 2x2 neighbourhood of the origin: every local cell there becomes NaN with mask 0 (never 0).
  const near = makeGrid({
    f, width: 500, height: 500, px: 0.002, north: 19, west: 77,
    invalid: [[249, 249], [249, 250], [250, 249], [250, 250]],
  });
  const holed = resampleToLocalGrid(near, frame, { xMinM: -10, xMaxM: 10, yMinM: -10, yMaxM: 10, cellM: 5 });
  assert.equal(holed.validCount, 0);
  assert.equal(holed.validMask.reduce((s, m) => s + m, 0), 0);
  assert.ok(holed.values.every((v) => Number.isNaN(v)));
  assert.throws(() => resampleToLocalGrid(g, frame, { xMinM: 0, xMaxM: 0, yMinM: 0, yMaxM: 1, cellM: 1 }), RangeError);
});

test('compareToLocalDtm recovers a known constant offset (MOLA - DTM = +3 m)', () => {
  const f = (lon, lat) => 500 * (lat - 18.5) + 100 * (lon - 77.5);
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const g = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77 });
  const dtm = makeWindow(frame, { valueFn: (lon, lat) => f(lon, lat) - 3 });
  const cmp = compareToLocalDtm({ regionalGrid: g, localDtm: dtm, frame, stride: 5 });
  assert.ok(cmp.residual.n > 1000);
  assert.ok(Math.abs(cmp.residual.mean - 3) < 1e-3, `mean ${cmp.residual.mean}`);
  assert.ok(cmp.residual.std < 1e-3);
  assert.equal(cmp.overlapNote, null);
  assert.ok(cmp.detection.note.includes('MOLA'));
  assert.equal(cmp.detection.windowInMolaCells.ns > 0, true);
});

test('compareToLocalDtm with no overlap reports n = 0 and an explicit note', () => {
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const g = makeGrid({ f: () => 1, width: 50, height: 50, px: 0.01, north: 41, west: 10 });
  const dtm = makeWindow(frame, { valueFn: () => 0 });
  const cmp = compareToLocalDtm({ regionalGrid: g, localDtm: dtm, frame, stride: 10 });
  assert.equal(cmp.residual.n, 0);
  assert.equal(cmp.residual.mean, null);
  assert.ok(cmp.overlapNote && cmp.overlapNote.includes('n=0'));
  assert.equal(cmp.stats.molaNoData > 0, true);
});

test('createLocalWindow: outside, declared no-data and NaN are reported, never converted', () => {
  const values = new Float32Array([1, -9999, Number.NaN, 4]);
  const w = createLocalWindow({ width: 2, height: 2, values, xMinM: 0, yMaxM: 2, cellM: 1, noDataValue: -9999 });
  assert.deepEqual(w.sample(0.5, 1.5), { status: 'ok', value: 1 });
  assert.equal(w.sample(1.5, 1.5).status, 'no_data');
  assert.equal(w.sample(0.5, 0.5).status, 'no_data');
  assert.equal(w.sample(1.5, 0.5).value, 4);
  assert.equal(w.sample(-1, 0).status, 'outside');
});

test('summarize: mean, median, sample std and linear percentiles', () => {
  const s = summarize([5, 1, 4, 2, 3]);
  assert.equal(s.n, 5);
  assert.equal(s.mean, 3);
  assert.equal(s.median, 3);
  assert.ok(Math.abs(s.std - Math.sqrt(2.5)) < 1e-12);
  assert.equal(s.min, 1);
  assert.equal(s.max, 5);
  assert.ok(Math.abs(s.p5 - 1.2) < 1e-12);
  assert.ok(Math.abs(s.p95 - 4.8) < 1e-12);
  const empty = summarize([]);
  assert.equal(empty.n, 0);
  assert.equal(empty.mean, null);
  assert.equal(empty.note, 'örtüşme yok');
});

test('experiment: linear field with DTM on H1 gives H1 ~0 and H2 = slope x latitude shift; shape not discriminable', () => {
  const k = 500; // m per degree latitude
  const f = (lon, lat) => k * (lat - 18);
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const g = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77 });
  const dtm = makeWindow(frame, { valueFn: (lon, lat) => f(lon, lat) });
  const exp = latitudeConventionExperiment({ regionalGrid: g, localDtm: dtm, frame, invFlattening: INV_F, stride: 5 });
  assert.equal(exp.status, 'needs_review');
  assert.equal(exp.datum.verticalDatumVerified, false);
  assert.ok(Math.abs(exp.hypotheses.H1.residual.mean) < 1e-3);
  const delta = planetocentricToGeodeticDeg(18.5, INV_F) - 18.5;
  const expectedShift = k * delta;
  assert.ok(Math.abs(exp.hypotheses.H2.residual.mean - expectedShift) < 0.5, `H2 mean ${exp.hypotheses.H2.residual.mean} vs ${expectedShift}`);
  assert.equal(exp.shapeDiscriminable, false);
  assert.ok(exp.discrimination.startsWith('ayırt edilemedi'));
  assert.ok(Math.abs(exp.centre.predictedShiftM - exp.absoluteOffsetDifferenceM) < 0.5);
  assert.ok(Math.abs(exp.centre.deltaNorthKm - delta * 3396190 * Math.PI / 180 / 1000) < 1e-3);
});

test('experiment: curved field with DTM on H1 is discriminated by shape (H1 fits better than H2)', () => {
  const f = (lon, lat) => 200 * Math.sin((2 * Math.PI * (lat - 18)) / 0.04);
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const g = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77 });
  const dtm = makeWindow(frame, { valueFn: (lon, lat) => f(lon, lat) });
  const exp = latitudeConventionExperiment({ regionalGrid: g, localDtm: dtm, frame, invFlattening: INV_F, stride: 5 });
  assert.equal(exp.shapeDiscriminable, true);
  assert.ok(exp.discrimination.startsWith('şekil farkı ölçülebilir'));
  assert.ok(exp.hypotheses.H1.residual.std < exp.hypotheses.H2.residual.std);
  assert.ok(exp.hypotheses.H1.residual.std < 5);
  assert.equal(exp.status, 'needs_review');
});

test('experiment is deterministic and its outputs are frozen', () => {
  const f = (lon, lat) => 300 * Math.sin((2 * Math.PI * (lat - 18)) / 0.05);
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const g = makeGrid({ f, width: 500, height: 500, px: 0.002, north: 19, west: 77 });
  const dtm = makeWindow(frame, { width: 120, height: 120, valueFn: (lon, lat) => f(lon, lat) + 2 });
  const a = latitudeConventionExperiment({ regionalGrid: g, localDtm: dtm, frame, invFlattening: INV_F, stride: 4 });
  const b = latitudeConventionExperiment({ regionalGrid: g, localDtm: dtm, frame, invFlattening: INV_F, stride: 4 });
  assert.deepEqual(a, b);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.hypotheses), true);
  assert.throws(() => latitudeConventionExperiment({ regionalGrid: g, localDtm: dtm, frame, invFlattening: 0 }), RangeError);
});

test('input validation: bad grids and strides are rejected with explicit errors', () => {
  assert.throws(() => createRegionalGrid(null), TypeError);
  assert.throws(() => createRegionalGrid({ width: 2, height: 2, values: new Float32Array(3), validMask: new Uint8Array(4), bounds: { west: 0, east: 1, south: 0, north: 1 }, pixelSizeDeg: 0.5 }), RangeError);
  const frame = createLocalFrame({ originLatDeg: ORIGIN.latDeg, originLonDeg: ORIGIN.lonDeg });
  const g = makeGrid({ f: () => 0, width: 10, height: 10, px: 0.01, north: 19, west: 77 });
  const dtm = makeWindow(frame, { width: 10, height: 10, valueFn: () => 0 });
  assert.throws(() => compareToLocalDtm({ regionalGrid: g, localDtm: dtm, frame, stride: 0 }), RangeError);
  assert.throws(() => createLocalFrame({ originLatDeg: Number.NaN, originLonDeg: 1 }), RangeError);
});
