import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannedRouteLinePositions, derivePlannedRouteGuidance, formatRouteDirection } from '../public/js/view/route-guidance.js';
import { STATUS } from '../public/js/route/cost-model.js';

const route = (path, mode = 'eva_walkability') => ({ status: 'ok', mode, path, provenance: { parameters: [{ name: 'maxSlopeDeg', value: 20 }] } });
const provider = (sampleElevation, cellSizeM = 1) => ({ sampleElevation, cellSizeM });

test('planned ground guide samples provider elevations and omits non-ok routes', () => {
  const positions = buildPlannedRouteLinePositions({
    enabled: true,
    route: route([{ xM: 0, yM: 0 }, { xM: 2, yM: 0 }]),
    surfaceProvider: provider(() => ({ status: 'ok', value: -10 })),
    displayConfig: { referenceElevationM: -12, verticalScale: 3 },
    maxSampleSpacingM: 1,
  });
  assert.equal(positions.length, 12);
  assert.ok(Math.abs(positions[2] - 6.12) < 1e-5);
  assert.ok(Math.abs(positions[5] - 6.12) < 1e-5);
  assert.equal(buildPlannedRouteLinePositions({ route: { status: 'no_path', path: [{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }] } }).length, 0);
});

test('planned ground guide breaks at unknown samples and never invents elevation zero', () => {
  const positions = buildPlannedRouteLinePositions({
    enabled: true,
    route: route([{ xM: 0, yM: 0 }, { xM: 2, yM: 0 }]),
    surfaceProvider: provider((xM) => xM === 1 ? { status: 'no_data', value: null } : { status: 'ok', value: -100 }),
    displayConfig: { referenceElevationM: -100, verticalScale: 3 },
    maxSampleSpacingM: 1,
  });
  assert.equal(positions.length, 0);
  assert.ok([...positions].every(Number.isFinite));
});

test('planned ground guide densifies long segments (<= 4 m) and supports near-field parallel rails without bridging no-data', () => {
  const positions = buildPlannedRouteLinePositions({
    enabled: true,
    route: route([{ xM: 0, yM: 0 }, { xM: 12, yM: 0 }]),
    surfaceProvider: provider(() => ({ status: 'ok', value: -10 }), 10),
    displayConfig: { referenceElevationM: -12, verticalScale: 3 },
    heightOffsetM: 0.28,
    ribbonHalfWidthM: 0.22,
  });
  // 12 m segment with <= 4 m spacing -> 3 intervals -> 3 lines (center + left + right) * 3 segments * 6 floats = 54 floats
  assert.equal(positions.length, 54);
  assert.ok(Math.abs(positions[2] - 6.28) < 1e-5);
});

test('route guidance points to the next route cell and expresses direction relative to heading', () => {
  const guidance = derivePlannedRouteGuidance({
    route: route([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }, { xM: 2, yM: 0 }]),
    position: { xM: 0, yM: 0 }, headingRad: 0,
  });
  assert.equal(guidance.active, true);
  assert.deepEqual(guidance.nextPoint, { xM: 1, yM: 0, row: null, col: null });
  assert.equal(guidance.distanceM, 1);
  assert.equal(guidance.relativeDeg, 0);
  assert.equal(formatRouteDirection(guidance.relativeDeg), 'ön · 0°');
  assert.equal(formatRouteDirection(45), 'sol · 45°');
  assert.equal(formatRouteDirection(-45), 'sağ · -45°');
});

test('current EVA indicator uses raw heatmap arrays and fails closed for unknown/regional cells', () => {
  const heatmap = {
    rows: 3, cols: 3, nwXM: -1, nwYM: 1, cellSizeM: 1,
    score: new Uint8Array([0, 0, 0, 0, 83, 0, 0, 0, 0]),
    status: new Uint8Array([2, 2, 2, 2, STATUS.OK, 2, 2, 2, 2]),
  };
  const surface = { elevation: { status: 'ok', value: -20 }, slope: { status: 'ok', value: 10 } };
  const eva = derivePlannedRouteGuidance({
    route: route([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }]),
    position: { xM: 0.2, yM: -0.2 }, headingRad: 0, surface, heatmap,
  });
  assert.deepEqual(eva.walkability, { available: true, score: 83, slopeDeg: 10, slopeWarning: false, maxSlopeDeg: 20 });

  const unknownSurface = derivePlannedRouteGuidance({ route: route([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }]), position: { xM: 0.2, yM: -0.2 }, surface: { elevation: { status: 'no_data', value: null }, slope: { status: 'no_data', value: null } }, heatmap });
  assert.equal(unknownSurface.walkability.available, false);
  assert.equal('score' in unknownSurface.walkability, false);

  heatmap.status[4] = STATUS.NO_DATA;
  const unknown = derivePlannedRouteGuidance({ route: route([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }]), position: { xM: 0.2, yM: -0.2 }, surface, heatmap });
  assert.equal(unknown.walkability.available, false);
  assert.equal('score' in unknown.walkability, false);

  const regional = derivePlannedRouteGuidance({ route: route([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }], 'regional_preplan'), position: { xM: 0.2, yM: -0.2 }, surface, heatmap });
  assert.equal(regional.walkability.available, false);
  assert.match(regional.walkability.reason, /EVA puanı üretilmiyor/);
});
