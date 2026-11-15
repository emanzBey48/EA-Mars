import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteRibbon, ROUTE_RIBBON_DEFAULTS, ROUTE_RIBBON_NOTE } from '../public/js/view/3d/route-ribbon.js';

const BASE_Z = -2600;
const OFFSET = ROUTE_RIBBON_DEFAULTS.groundOffsetM;
const flat = (z = BASE_Z) => () => ({ status: 'ok', value: z });
const plane = (a, b, c) => (x, y) => ({ status: 'ok', value: a * x + b * y + c });
const line = (...pts) => pts.map(([xM, yM]) => ({ xM, yM }));
const triangles = (r) => {
  const out = [];
  for (let i = 0; i < r.indices.length; i += 3) out.push([r.indices[i], r.indices[i + 1], r.indices[i + 2]]);
  return out;
};
// XY signed area (x2) of an emitted triangle, read from the display positions.
const area2 = (r, [a, b, c]) => {
  const p = r.positions;
  return (p[b * 3] - p[a * 3]) * (p[c * 3 + 1] - p[a * 3 + 1]) - (p[b * 3 + 1] - p[a * 3 + 1]) * (p[c * 3] - p[a * 3]);
};

test('flat straight path: width, cumulative u and triangle count', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [10, 0]), sampleElevation: flat(), sampleSpacingM: 1 });
  assert.equal(r.vertexCount, 22);
  assert.equal(r.triangleCount, 20);
  assert.equal(r.runs.length, 1);
  assert.ok(Math.abs(r.runs[0].lengthM - 10) < 1e-9);
  for (let k = 0; k < 11; k++) {
    const left = 2 * k;
    const right = 2 * k + 1;
    assert.ok(Math.abs(r.positions[left * 3] - k) < 1e-4);
    assert.ok(Math.abs(r.positions[left * 3 + 1] - ROUTE_RIBBON_DEFAULTS.widthM / 2) < 1e-4);
    assert.ok(Math.abs(r.positions[right * 3 + 1] + ROUTE_RIBBON_DEFAULTS.widthM / 2) < 1e-4);
    assert.ok(Math.abs(r.uvs[left * 2] - k) < 1e-4, 'u is cumulative length');
    assert.equal(r.uvs[left * 2 + 1], 0);
    assert.equal(r.uvs[right * 2 + 1], 1);
  }
});

test('sloped surface: each rail is sampled at its own XY and lifted by groundOffset', () => {
  const f = plane(0.5, 0.2, BASE_Z);
  const ref = -2600;
  const r = buildRouteRibbon({
    path: line([0, 0], [10, 0], [10, 10]),
    sampleElevation: f,
    displayConfig: { referenceElevationM: ref, verticalScale: 1 },
  });
  for (let v = 0; v < r.vertexCount; v++) {
    const x = r.positions[v * 3];
    const y = r.positions[v * 3 + 1];
    const zM = f(x, y).value;
    assert.ok(Math.abs(r.sourceElevationsM[v] - zM) < 1e-3, `source z at vertex ${v}`);
    assert.ok(Math.abs(r.positions[v * 3 + 2] - ((zM - ref) + OFFSET)) < 1e-3, `display z at vertex ${v}`);
  }
  // Left and right rails on a y-slope must sit at different heights (not one averaged value).
  assert.ok(Math.abs(r.positions[2] - r.positions[5]) > 0.1);
});

test('vertical exaggeration: display z is (zM - ref) * scale + offset for scale 1 and 3', () => {
  const f = plane(0.4, -0.3, BASE_Z);
  for (const scale of [1, 3]) {
    const r = buildRouteRibbon({
      path: line([0, 0], [6, 0], [6, 6]),
      sampleElevation: f,
      displayConfig: { referenceElevationM: -2600, verticalScale: scale },
    });
    for (let v = 0; v < r.vertexCount; v++) {
      const expected = (r.sourceElevationsM[v] + 2600) * scale + OFFSET;
      assert.ok(Math.abs(r.positions[v * 3 + 2] - expected) < 1e-3, `scale ${scale} vertex ${v}`);
    }
    assert.equal(r.meta.verticalScaleApplied, true);
  }
});

test('no-data island: run breaks, no triangle spans the gap, no 0 or NaN elevation', () => {
  const sampler = (x, y) => (x >= 8 && x <= 12
    ? { status: 'no_data', value: null }
    : { status: 'ok', value: BASE_Z });
  const r = buildRouteRibbon({ path: line([0, 0], [20, 0]), sampleElevation: sampler, sampleSpacingM: 1 });
  assert.equal(r.runs.length, 2);
  assert.ok(r.counters.skippedUnknown > 0);
  assert.ok(r.counters.breaks > 0);
  for (const v of r.sourceElevationsM) assert.ok(Number.isFinite(v) && v !== 0);
  for (let v = 0; v < r.vertexCount; v++) {
    const x = r.positions[v * 3];
    assert.ok(x < 8 - 1e-4 || x > 12 + 1e-4, `no vertex inside the no-data island (x=${x})`);
  }
  for (const tri of triangles(r)) {
    const xs = tri.map((v) => r.positions[v * 3]);
    assert.ok(xs.every((x) => x < 8) || xs.every((x) => x > 12), 'triangle does not cross the gap');
  }
});

test('whole path unknown: empty mesh with explicit counters and reason', () => {
  const r = buildRouteRibbon({
    path: line([0, 0], [5, 0]),
    sampleElevation: () => ({ status: 'no_data', value: null }),
  });
  assert.equal(r.vertexCount, 0);
  assert.equal(r.triangleCount, 0);
  assert.equal(r.positions.length, 0);
  assert.deepEqual(r.runs, []);
  assert.equal(r.bounds, null);
  assert.ok(r.counters.skippedUnknown > 0);
  assert.equal(r.meta.emptyReason, 'no_valid_samples');
});

test('single point, empty and non-array paths return an empty result without throwing', () => {
  for (const [path, reason] of [[line([1, 1]), 'path_too_short'], [[], 'path_too_short'], [null, 'path_not_array']]) {
    const r = buildRouteRibbon({ path, sampleElevation: flat() });
    assert.equal(r.vertexCount, 0);
    assert.deepEqual(r.runs, []);
    assert.equal(r.meta.emptyReason, reason);
  }
});

test('invalid sampler is a programming error', () => {
  assert.throws(() => buildRouteRibbon({ path: line([0, 0], [1, 0]) }), TypeError);
});

test('90 degree corner: bevel joint, every triangle has positive XY area', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [10, 0], [10, 10]), sampleElevation: plane(0.1, 0.05, BASE_Z) });
  assert.equal(r.counters.bevelJoints, 1);
  assert.ok(r.triangleCount > 0);
  for (const tri of triangles(r)) assert.ok(area2(r, tri) > 0, `triangle ${tri} must be positively oriented`);
  assert.equal(r.counters.degenerate, 0);
});

test('sharp U-turn: no folded or crossing triangle (positive area everywhere)', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [10, 0], [0, 0.5]), sampleElevation: flat(), sampleSpacingM: 1 });
  for (const tri of triangles(r)) assert.ok(area2(r, tri) > 0, `triangle ${tri} must be positively oriented`);
});

test('reversed path yields the same set of triangles and the same total length', () => {
  const pts = line([0, 0], [10, 0], [10, 10], [20, 10.5]);
  const f = plane(0.3, 0.1, BASE_Z);
  const fwd = buildRouteRibbon({ path: pts, sampleElevation: f });
  const rev = buildRouteRibbon({ path: [...pts].reverse(), sampleElevation: f });
  const keyOf = (r) => triangles(r).map((tri) => tri
    .map((v) => [r.positions[v * 3], r.positions[v * 3 + 1], r.positions[v * 3 + 2]].map((c) => c.toFixed(4)).join(','))
    .sort()
    .join('|')).sort();
  assert.deepEqual(keyOf(rev), keyOf(fwd));
  const sum = (r) => r.runs.reduce((s, run) => s + run.lengthM, 0);
  assert.ok(Math.abs(sum(fwd) - sum(rev)) < 1e-6);
  const total = 10 + 10 + Math.hypot(10, 0.5);
  assert.ok(Math.abs(sum(fwd) - total) < 1e-6);
  // u runs in the walking direction: the same ground point has u_rev = total - u_fwd.
  const uByXY = (r) => {
    const m = new Map();
    for (let v = 0; v < r.vertexCount; v++) {
      const key = [r.positions[v * 3], r.positions[v * 3 + 1]].map((c) => c.toFixed(4)).join(',');
      m.set(key, r.uvs[v * 2]);
    }
    return m;
  };
  const uf = uByXY(fwd);
  const ur = uByXY(rev);
  let matched = 0;
  for (const [key, u] of uf) {
    if (!ur.has(key)) continue;
    matched++;
    assert.ok(Math.abs(ur.get(key) - (total - u)) < 1e-3, `u reverses at ${key}`);
  }
  assert.ok(matched >= fwd.vertexCount * 0.9, 'most ground points are shared by both directions');
});

test('deterministic: identical input gives byte-identical output', () => {
  const args = { path: line([0, 0], [10, 0], [10, 10]), sampleElevation: plane(0.2, -0.1, BASE_Z), sampleSpacingM: 0.7 };
  const a = buildRouteRibbon(args);
  const b = buildRouteRibbon(args);
  for (const key of ['positions', 'normals', 'uvs', 'indices', 'sourceElevationsM']) {
    assert.ok(Buffer.from(a[key].buffer, a[key].byteOffset, a[key].byteLength)
      .equals(Buffer.from(b[key].buffer, b[key].byteOffset, b[key].byteLength)), key);
  }
});

test('maxVertices: spacing is coarsened and the cap is respected without throwing', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [200, 0]), sampleElevation: flat(), sampleSpacingM: 1, maxVertices: 40 });
  assert.ok(r.vertexCount <= 40);
  assert.ok(r.counters.spacingPasses >= 1);
  assert.ok(r.runs.length >= 1);
});

test('maxVertices: a run that cannot fit is dropped whole and counted', () => {
  const zig = line([0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [5, 4], [5, 5]);
  const r = buildRouteRibbon({ path: zig, sampleElevation: flat(), maxVertices: 10 });
  assert.ok(r.vertexCount <= 10);
  assert.ok(r.counters.cappedRuns >= 1);
});

test('5 km straight path: vertex and index counts are reported and consistent', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [5000, 0]), sampleElevation: flat(), sampleSpacingM: 1 });
  assert.equal(r.vertexCount, 2 * 5001);
  assert.equal(r.triangleCount, 2 * 5000);
  assert.equal(r.indices.length, 3 * r.triangleCount);
  assert.equal(r.meta.vertexCount, r.vertexCount);
});

test('normals are unit length and point upward; indices stay in range', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [10, 0], [10, 10]), sampleElevation: plane(0.3, 0.2, BASE_Z) });
  for (let v = 0; v < r.vertexCount; v++) {
    const n = [r.normals[v * 3], r.normals[v * 3 + 1], r.normals[v * 3 + 2]];
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, `unit normal at ${v}`);
    assert.ok(n[2] > 0, `upward normal at ${v}`);
  }
  for (const i of r.indices) assert.ok(i < r.vertexCount);
  assert.equal(r.indices.length % 3, 0);
});

test('bounds are local and match the positions', () => {
  const r = buildRouteRibbon({ path: line([0, 0], [10, 0]), sampleElevation: flat() });
  assert.equal(r.bounds.minX, 0);
  assert.equal(r.bounds.maxX, 10);
  assert.ok(r.bounds.minY < 0 && r.bounds.maxY > 0);
});

test('meta is deep frozen, carries the planning label and the exaggeration label only when scaled', () => {
  const plain = buildRouteRibbon({ path: line([0, 0], [5, 0]), sampleElevation: flat() });
  assert.ok(Object.isFrozen(plain.meta));
  assert.ok(Object.isFrozen(plain.runs[0]));
  assert.ok(plain.meta.note.includes('güvenli rota değildir'));
  assert.equal(plain.meta.note, ROUTE_RIBBON_NOTE);
  assert.equal(plain.meta.verticalExaggerationLabel, null);
  const scaled = buildRouteRibbon({
    path: line([0, 0], [5, 0]), sampleElevation: flat(), displayConfig: { referenceElevationM: -2600, verticalScale: 3 },
  });
  assert.ok(scaled.meta.verticalExaggerationLabel.includes('×3'));
  assert.equal(scaled.meta.parameters.labels.widthM, 'görsel/senaryo parametresi');
});

test('camera: width grows monotonically with distance and is capped; spacing is denser near the camera', () => {
  const r = buildRouteRibbon({
    path: line([0, 0], [300, 0]),
    sampleElevation: flat(),
    sampleSpacingM: 1,
    cameraXY: { xM: 0, yM: 0 },
    nearM: 20,
    farM: 200,
  });
  const widths = [];
  const xs = [];
  for (let k = 0; k < r.vertexCount / 2; k++) {
    xs.push(r.positions[2 * k * 3]);
    widths.push(r.positions[(2 * k) * 3 + 1] - r.positions[(2 * k + 1) * 3 + 1]);
  }
  for (let k = 1; k < widths.length; k++) assert.ok(widths[k] >= widths[k - 1] - 1e-4, 'monotone width');
  assert.ok(Math.abs(widths[0] - ROUTE_RIBBON_DEFAULTS.widthM) < 1e-3);
  assert.ok(Math.abs(widths[widths.length - 1] - ROUTE_RIBBON_DEFAULTS.widthM * 2.5) < 1e-3, 'far width capped at x2.5');
  const near = xs.filter((x) => x <= 20).length;
  const far = xs.filter((x) => x >= 200 && x <= 220).length;
  assert.ok(near / 20 > far / 20, 'near stations are denser');
});

test('segment scores are carried only when segments line up with the path, never invented', () => {
  const path = line([0, 0], [10, 0], [20, 0]);
  const segments = [{ score: 91, cost: 1.2, lengthM: 10 }, { cost: 1.1, lengthM: 10 }];
  const r = buildRouteRibbon({ path, segments, sampleElevation: flat(), sampleSpacingM: 1 });
  assert.equal(r.runs.length, 1);
  const scores = r.runs[0].segmentScores;
  assert.equal(scores[0].segmentIndex, 0);
  assert.equal(scores[0].score, 91);
  assert.equal(scores[1].segmentIndex, 1);
  assert.equal(scores[1].score, null);
  const mismatch = buildRouteRibbon({ path, segments: [{ score: 5 }], sampleElevation: flat() });
  assert.equal(mismatch.runs[0].segmentScores, null);
});

test('displayConfig is validated and labelled but source metres stay unchanged', () => {
  assert.throws(() => buildRouteRibbon({
    path: line([0, 0], [1, 0]), sampleElevation: flat(), displayConfig: { referenceElevationM: 0, verticalScale: 0 },
  }), TypeError);
  const r = buildRouteRibbon({ path: line([0, 0], [1, 0]), sampleElevation: flat(-2000) });
  assert.equal(r.meta.displayConfig, null);
  assert.ok(Math.abs(r.sourceElevationsM[0] + 2000) < 1e-3);
  assert.ok(Math.abs(r.positions[2] - (-2000 + OFFSET)) < 1e-3);
});

test('dash option leaves gaps along the path and never bridges them; smooth option rounds corners', async () => {
  const { buildRouteGuideRibbon } = await import('../public/js/view/3d/route-ribbon.js');
  const solid = buildRouteRibbon({ path: line([0, 0], [20, 0]), sampleElevation: flat(), sampleSpacingM: 1 });
  const dashed = buildRouteRibbon({ path: line([0, 0], [20, 0]), sampleElevation: flat(), sampleSpacingM: 1, dashM: 2, gapM: 2 });
  assert.equal(dashed.runs.length, 5);
  assert.ok(solid.runs.length === 1 && dashed.runs.length > solid.runs.length);
  // Yuvarlak uç: her dash'in ilk kesiti tam genişlikten dar (kırpılmış köşe), orta kesit tam genişlik.
  const widthAt = (ribbon, vi) => Math.hypot(ribbon.positions[vi * 3] - ribbon.positions[(vi + 1) * 3],
    ribbon.positions[vi * 3 + 1] - ribbon.positions[(vi + 1) * 3 + 1]);
  const r0 = dashed.runs[0];
  assert.ok(widthAt(dashed, r0.startIndex) < 0.5 * 1.2 + 1e-6);
  let maxW = 0;
  for (let v = 0; v < r0.vertexCount; v += 2) maxW = Math.max(maxW, widthAt(dashed, r0.startIndex + v));
  assert.ok(Math.abs(maxW - 1.2) < 1e-3);
  assert.ok(widthAt(dashed, r0.startIndex + r0.vertexCount - 2) < 0.5 * 1.2 + 1e-6);
  assert.ok(Math.abs(dashed.runs.reduce((s, r) => s + r.lengthM, 0) - 10) < 1e-6);
  const guide = buildRouteGuideRibbon({ path: line([0, 0], [10, 0], [10, 10]), sampleElevation: flat() });
  assert.ok(guide.runs.length >= 2);
  assert.equal(guide.colorsRgb.length, guide.positions.length);
  for (const t of triangles(guide)) assert.ok(area2(guide, t) > 0);
});
