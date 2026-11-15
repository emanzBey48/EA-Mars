// Stage K2-3/K2-4: regional-context horizon mesh from the MOLA-class grid. Pure functions only; the real
// prepared grid (data/regional-dem/mola-jezero.*) and the real local window (data/dtm_subset.json) are read here
// from disk by the test itself, not by the module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HORIZON_DEFAULTS, HORIZON_LABEL, buildHorizonMesh, regionalGridFromBinary,
} from '../public/js/view/3d/horizon-mesh.js';
import { createRegionalGrid } from '../public/js/geo/regional-dem.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';
import { MARS_RADIUS_M } from '../public/js/geo/trek-tiles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const regionalMeta = JSON.parse(readFileSync(path.join(dataDir, 'regional-dem', 'mola-jezero.json'), 'utf8'));
const regionalBytes = readFileSync(path.join(dataDir, 'regional-dem', 'mola-jezero.f32'));
const dtmMeta = JSON.parse(readFileSync(path.join(dataDir, 'dtm_subset.json'), 'utf8'));
const LOCAL = dtmMeta.coverage.localBoundsM;
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const realGrid = () => regionalGridFromBinary(regionalMeta, toArrayBuffer(regionalBytes));
const DISPLAY1 = Object.freeze({ referenceElevationM: -2570, verticalScale: 1 });

let cachedReal = null;
function realHorizon(overrides = {}) {
  if (!cachedReal || Object.keys(overrides).length) {
    const built = buildHorizonMesh({
      regionalGrid: realGrid(),
      localWindowBounds: LOCAL,
      localFrame: { adapter },
      displayConfig: DISPLAY1,
      ...overrides,
    });
    if (Object.keys(overrides).length === 0) cachedReal = built;
    return built;
  }
  return cachedReal;
}

const rectDistance = (x, y) => Math.hypot(Math.max(0, LOCAL.xMin - x, x - LOCAL.xMax), Math.max(0, LOCAL.yMin - y, y - LOCAL.yMax));
const inside = (x, y) => x > LOCAL.xMin && x < LOCAL.xMax && y > LOCAL.yMin && y < LOCAL.yMax;

// ---------- parsing ----------

test('regionalGridFromBinary accepts the prepared MOLA grid and keeps every finite value valid', () => {
  const grid = realGrid();
  assert.equal(grid.width, 384);
  assert.equal(grid.height, 384);
  assert.equal(grid.validMask.reduce((s, v) => s + v, 0), 384 * 384);
  assert.equal(grid.pixelSizeDeg, 0.0078125);
});

test('regionalGridFromBinary rejects a byte-length mismatch and a foreign schema', () => {
  assert.throws(() => regionalGridFromBinary(regionalMeta, toArrayBuffer(regionalBytes).slice(4)), RangeError);
  assert.throws(() => regionalGridFromBinary({ ...regionalMeta, schema: 'other' }, toArrayBuffer(regionalBytes)), TypeError);
});

// ---------- mesh contract and geometry on the real grid ----------

test('real-grid horizon satisfies the mesh contract (typed arrays, aligned lengths, unit normals, no NaN)', () => {
  const h = realHorizon();
  const V = h.positions.length / 3;
  assert.ok(h.positions instanceof Float32Array && h.normals instanceof Float32Array && h.colorsRgb instanceof Float32Array);
  assert.ok(h.indices instanceof Uint32Array);
  assert.equal(h.normals.length, h.positions.length);
  assert.equal(h.colorsRgb.length, h.positions.length);
  assert.equal(h.sourceElevationsM.length, V);
  assert.equal(h.indices.length % 3, 0);
  assert.ok(h.indices.every((i) => i < V), 'every index is in range');
  for (let i = 0; i < h.positions.length; i++) assert.ok(Number.isFinite(h.positions[i]), 'finite position');
  for (let i = 0; i < h.normals.length; i += 3) {
    const len = Math.hypot(h.normals[i], h.normals[i + 1], h.normals[i + 2]);
    assert.ok(Math.abs(len - 1) < 1e-4, `unit normal (got ${len})`);
  }
  for (let i = 0; i < h.colorsRgb.length; i++) assert.ok(h.colorsRgb[i] >= 0 && h.colorsRgb[i] <= 1, 'albedo in [0,1]');
  assert.ok(h.bounds.minZ <= h.bounds.maxZ && Number.isFinite(h.bounds.minX));
});

test('no triangle centroid lies inside the local DTM window, and the inner edge sits the documented margin outside it', () => {
  const h = realHorizon();
  for (let t = 0; t < h.indices.length; t += 3) {
    let cx = 0, cy = 0;
    for (let k = 0; k < 3; k++) {
      cx += h.positions[h.indices[t + k] * 3];
      cy += h.positions[h.indices[t + k] * 3 + 1];
    }
    cx /= 3; cy /= 3;
    assert.ok(!inside(cx, cy), `triangle centroid (${cx.toFixed(1)}, ${cy.toFixed(1)}) inside the local window`);
  }
  // The inner rectangle is the window grown by innerMarginM (2 m). Surface vertices lie on it or outside.
  const margin = HORIZON_DEFAULTS.innerMarginM;
  let minDist = Infinity;
  for (let v = 0; v < h.meta.counts.surfaceVertices; v++) {
    minDist = Math.min(minDist, rectDistance(h.positions[v * 3], h.positions[v * 3 + 1]));
  }
  assert.ok(Math.abs(minDist - margin) < 0.02, `nearest surface vertex ${minDist} m vs margin ${margin} m`);
});

test('ring spacing grows monotonically with distance; near spacing equals the MOLA pixel, far spacing is coarser', () => {
  const h = realHorizon();
  const d = h.meta.spacing.distancesFromWindowM;
  for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1], 'distances strictly increasing');
  const steps = d.slice(1).map((v, i) => v - d[i]);
  // The last step is clipped at the outer radius, so only the full steps are compared.
  for (let i = 1; i < steps.length - 1; i++) assert.ok(steps[i] >= steps[i - 1] - 1e-9, 'steps non-decreasing');
  assert.ok(Math.abs(steps[0] - HORIZON_DEFAULTS.minSpacingM) < 1e-6, 'near spacing = MOLA pixel');
  assert.ok(steps[steps.length - 1] > steps[0] * 1.5, 'far spacing is coarser');
  assert.equal(d[d.length - 1], HORIZON_DEFAULTS.outerRadiusM);
});

test('cells are kept while their centre lies within the outer radius; corner vertices may extend one cell further', () => {
  const h = realHorizon();
  const d = h.meta.spacing.distancesFromWindowM;
  const maxStep = Math.max(...d.slice(1).map((v, i) => v - d[i]));
  const limit = HORIZON_DEFAULTS.outerRadiusM + maxStep + 0.05;
  for (let v = 0; v < h.meta.counts.surfaceVertices; v++) {
    assert.ok(rectDistance(h.positions[v * 3], h.positions[v * 3 + 1]) <= limit, 'surface vertex within outer radius + one cell');
  }
});

test('real-grid heights stay inside the MOLA value range and the display Z matches (raw - reference - drop) * scale', () => {
  const h = realHorizon();
  const raw = h.sourceElevationsM;
  assert.ok(Math.min(...raw) >= regionalMeta.grid.valueStats.min - 1e-3, 'not below MOLA min');
  assert.ok(Math.max(...raw) <= regionalMeta.grid.valueStats.max + 1e-3, 'not above MOLA max');
  const R = MARS_RADIUS_M;
  // Skirt bottoms are pushed down by skirtDepthM on purpose; they carry the seam height, not a source height.
  for (let v = 0; v < h.meta.counts.surfaceVertices; v += 97) {
    const x = h.positions[v * 3], y = h.positions[v * 3 + 1];
    const expected = (raw[v] - DISPLAY1.referenceElevationM - (x * x + y * y) / (2 * R)) * DISPLAY1.verticalScale;
    assert.ok(Math.abs(h.positions[v * 3 + 2] - expected) < 1e-2, `z ${h.positions[v * 3 + 2]} vs ${expected}`);
  }
});

test('skirt walls take the colour of the surface vertex they hang from', () => {
  const h = realHorizon();
  const first = h.meta.counts.surfaceVertices;
  const surfaceAt = new Map();
  for (let v = 0; v < first; v++) surfaceAt.set(`${h.positions[v * 3]},${h.positions[v * 3 + 1]}`, v);
  let matched = 0;
  for (let v = first; v < h.positions.length / 3; v++) {
    const src = surfaceAt.get(`${h.positions[v * 3]},${h.positions[v * 3 + 1]}`);
    if (src === undefined) continue;
    matched++;
    for (let k = 0; k < 3; k++) assert.equal(h.colorsRgb[v * 3 + k], h.colorsRgb[src * 3 + k]);
  }
  assert.ok(matched >= h.meta.counts.skirtVertices / 2, `matched ${matched} of ${h.meta.counts.skirtVertices}`);
});

test('skirt walls exist under the seam and their normals are horizontal', () => {
  const h = realHorizon();
  assert.ok(h.meta.counts.skirtVertices > 0 && h.meta.counts.skirtTriangles > 0);
  const first = h.meta.counts.surfaceVertices;
  for (let v = first; v < h.positions.length / 3; v++) assert.ok(Math.abs(h.normals[v * 3 + 2]) < 1e-6, 'wall normal is horizontal');
});

// ---------- curvature and vertical scale ----------

test('curvature removes exactly d^2/(2R) from the display height, and turning it off removes nothing', () => {
  const grid = realGrid();
  const on = realHorizon();
  const off = buildHorizonMesh({ regionalGrid: grid, localWindowBounds: LOCAL, localFrame: { adapter }, displayConfig: DISPLAY1, curvature: false });
  assert.equal(on.positions.length, off.positions.length, 'same vertex layout');
  let worst = 0;
  for (let v = 0; v < on.positions.length / 3; v++) {
    const x = on.positions[v * 3], y = on.positions[v * 3 + 1];
    const drop = (x * x + y * y) / (2 * MARS_RADIUS_M);
    worst = Math.max(worst, Math.abs((off.positions[v * 3 + 2] - on.positions[v * 3 + 2]) - drop));
  }
  assert.ok(worst < 2e-2, `curvature residual ${worst} m`);
  assert.equal(off.meta.parameters.curvature, false);
  const far = (80000 ** 2) / (2 * MARS_RADIUS_M);
  assert.ok(Math.abs(far - 942) < 1, `drop at 80 km is ~0.94 km (got ${far.toFixed(1)} m)`);
});

test('verticalScale 3 multiplies display Z exactly and is labelled as visual exaggeration', () => {
  const s1 = realHorizon();
  const s3 = buildHorizonMesh({
    regionalGrid: realGrid(), localWindowBounds: LOCAL, localFrame: { adapter },
    displayConfig: { referenceElevationM: -2570, verticalScale: 3 },
  });
  assert.equal(s3.positions.length, s1.positions.length);
  let worst = 0;
  for (let v = 0; v < s1.positions.length / 3; v++) worst = Math.max(worst, Math.abs(s3.positions[v * 3 + 2] - 3 * s1.positions[v * 3 + 2]));
  assert.ok(worst < 2e-2, `scale residual ${worst}`);
  assert.equal(s1.meta.visualExaggerationNote, null);
  assert.match(s3.meta.visualExaggerationNote, /3x/);
  assert.equal(s3.sourceElevationsM.length, s1.sourceElevationsM.length, 'source heights are not scaled');
  assert.equal(s3.sourceElevationsM[0], s1.sourceElevationsM[0]);
});

// ---------- labels, freezing, determinism, measurement ----------

test('metadata is deep-frozen and carries the regional-context labels', () => {
  const h = realHorizon();
  assert.ok(Object.isFrozen(h.meta) && Object.isFrozen(h.meta.parameters) && Object.isFrozen(h.meta.counts));
  assert.throws(() => { 'use strict'; h.meta.walkability = true; }, TypeError);
  assert.equal(h.meta.layer, 'regional-context');
  assert.equal(h.meta.walkability, false);
  assert.equal(h.meta.datumStatus, 'needs_review');
  assert.equal(h.meta.label, HORIZON_LABEL);
  assert.match(h.meta.label, /Bölgesel bağlam, ~463 m\/piksel/);
  assert.match(h.meta.label, /Yürünebilirlik puanı yok/);
  assert.match(h.meta.source, /NASA Mars Trek MOLA \(ImageServer\), ~463 m\/piksel/);
  assert.equal(h.provenance.verticalDatumStatus, 'needs_review');
});

test('seam difference is measured against a supplied local sampler and never changes heights', () => {
  const none = realHorizon();
  assert.equal(none.meta.seam.status, 'not_measured');
  const measured = buildHorizonMesh({
    regionalGrid: realGrid(), localWindowBounds: LOCAL, localFrame: { adapter }, displayConfig: DISPLAY1,
    localElevationAt: () => -2570 + 5, // constant local height 5 m above the reference
  });
  assert.equal(measured.meta.seam.status, 'measured');
  assert.ok(measured.meta.seam.n > 100);
  assert.ok(Number.isFinite(measured.meta.seam.meanM) && Number.isFinite(measured.meta.seam.stdM));
  assert.ok(measured.meta.seam.maxAbsM >= Math.abs(measured.meta.seam.meanM));
  assert.equal(none.positions.length, measured.positions.length, 'sampler does not alter geometry');
  assert.equal(Buffer.compare(Buffer.from(none.positions.buffer), Buffer.from(measured.positions.buffer)), 0);
});

test('the same inputs give byte-identical output (deterministic)', () => {
  const a = realHorizon();
  const b = buildHorizonMesh({ regionalGrid: realGrid(), localWindowBounds: LOCAL, localFrame: { adapter }, displayConfig: DISPLAY1 });
  assert.equal(Buffer.compare(Buffer.from(a.positions.buffer), Buffer.from(b.positions.buffer)), 0);
  assert.equal(Buffer.compare(Buffer.from(a.normals.buffer), Buffer.from(b.normals.buffer)), 0);
  assert.equal(Buffer.compare(Buffer.from(a.colorsRgb.buffer), Buffer.from(b.colorsRgb.buffer)), 0);
  assert.equal(Buffer.compare(Buffer.from(a.indices.buffer), Buffer.from(b.indices.buffer)), 0);
});

// ---------- synthetic grids: no-data, vertex budget ----------

function syntheticGrid({ invalidEastOfM = null } = {}) {
  // 1 degree square around WB1 at 0.005 deg (~280 m) per pixel, height rises gently to the east.
  const lon0 = WAYPOINTS[0].lonDeg, lat0 = WAYPOINTS[0].latDeg;
  const w = 200, h = 200, px = 0.005;
  const bounds = { west: lon0 - 0.5, east: lon0 + 0.5, south: lat0 - 0.5, north: lat0 + 0.5 };
  const values = new Float32Array(w * h).fill(100);
  const validMask = new Uint8Array(w * h).fill(1);
  if (invalidEastOfM !== null) {
    const frame = adapter;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const lon = bounds.west + (c + 0.5) * px, lat = bounds.north - (r + 0.5) * px;
        const { x } = frame.latLonToLocal(lat, lon);
        if (x > invalidEastOfM) { validMask[r * w + c] = 0; values[r * w + c] = Number.NaN; }
      }
    }
  }
  return createRegionalGrid({ width: w, height: h, values, validMask, bounds, pixelSizeDeg: px });
}

test('no-data cells are skipped: no triangle is emitted over them and no value is zero-filled', () => {
  const small = { xMin: -300, xMax: 300, yMin: -300, yMax: 300 };
  const full = buildHorizonMesh({
    regionalGrid: syntheticGrid(), localWindowBounds: small, localFrame: { adapter },
    displayConfig: DISPLAY1, outerRadiusM: 5000,
  });
  const holed = buildHorizonMesh({
    regionalGrid: syntheticGrid({ invalidEastOfM: 1500 }), localWindowBounds: small, localFrame: { adapter },
    displayConfig: DISPLAY1, outerRadiusM: 5000,
  });
  assert.ok(holed.indices.length < full.indices.length, 'fewer triangles where data is missing');
  // Every pixel east of x = 1500 m is no-data, and bilinear sampling returns null next to any invalid neighbour,
  // so no surface vertex can be east of 1500 m. Surface vertices are the first meta.counts.surfaceVertices entries.
  const surfaceCount = holed.meta.counts.surfaceVertices;
  for (let v = 0; v < surfaceCount; v++) {
    assert.ok(holed.positions[v * 3] <= 1500 + 1e-3, `surface vertex at x=${holed.positions[v * 3]} inside the no-data zone`);
  }
  for (let v = 0; v < holed.positions.length / 3; v++) {
    assert.ok(Number.isFinite(holed.sourceElevationsM[v]) && holed.sourceElevationsM[v] === 100, 'raw value is 100 m, never 0');
  }
});

test('maxVertices is enforced by coarsening the far grid, and the applied decimation is reported', () => {
  const limited = buildHorizonMesh({
    regionalGrid: realGrid(), localWindowBounds: LOCAL, localFrame: { adapter }, displayConfig: DISPLAY1, maxVertices: 20000,
  });
  assert.ok(limited.positions.length / 3 <= 20000, `vertex count ${limited.positions.length / 3}`);
  assert.ok(limited.meta.parameters.decimationSteps > 0);
  assert.ok(limited.meta.parameters.minSpacingM > HORIZON_DEFAULTS.minSpacingM);
  const normal = realHorizon();
  assert.equal(normal.meta.parameters.decimationSteps, 0, 'default budget needs no decimation');
  assert.ok(normal.positions.length / 3 <= HORIZON_DEFAULTS.maxVertices);
});

test('invalid inputs are rejected with clear errors', () => {
  assert.throws(() => buildHorizonMesh({ regionalGrid: null, localWindowBounds: LOCAL, localFrame: { adapter }, displayConfig: DISPLAY1 }), TypeError);
  assert.throws(() => buildHorizonMesh({ regionalGrid: realGrid(), localWindowBounds: { xMin: 0 }, localFrame: { adapter }, displayConfig: DISPLAY1 }), TypeError);
  assert.throws(() => buildHorizonMesh({
    regionalGrid: realGrid(), localWindowBounds: LOCAL, localFrame: { adapter }, displayConfig: { referenceElevationM: 0, verticalScale: 0 },
  }), TypeError);
});
