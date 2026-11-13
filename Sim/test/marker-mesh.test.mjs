import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkerMeshes } from '../public/js/view/3d/marker-mesh.js';

const displayConfig = Object.freeze({ referenceElevationM: -2500, verticalScale: 2 });
const waypoints = [
  { id: 'sol120-wb1', label: 'Sol 120 / WB1', sol: 120, latDeg: 18.43906919, lonDeg: 77.44940206, xM: 0, yM: 0, zM: -2500 },
  { id: 'sol164-roubion', label: 'Sol 164 / Roubion', sol: 164, latDeg: 18.4276934, lonDeg: 77.45165066, xM: 100, yM: -20, zM: -2490 },
];

function build(overrides = {}) {
  return buildMarkerMeshes({
    waypoints,
    routePoints: [
      { xM: 0, yM: 0, zM: -2500 },
      { xM: 100, yM: -20, zM: -2490 },
    ],
    corridorWidthM: 20,
    displayConfig,
    ...overrides,
  });
}

function assertGeometry(geometry) {
  assert.ok(geometry.positions instanceof Float32Array);
  assert.ok(geometry.normals instanceof Float32Array);
  assert.ok(geometry.indices instanceof Uint32Array);
  assert.ok(geometry.sourceElevationsM instanceof Float32Array);
  assert.equal(geometry.positions.length % 3, 0);
  assert.equal(geometry.normals.length, geometry.positions.length);
  assert.equal(geometry.sourceElevationsM.length, geometry.positions.length / 3);
  assert.equal(geometry.indices.length % 3, 0);
  const vertexCount = geometry.positions.length / 3;
  for (const index of geometry.indices) assert.ok(index < vertexCount);
  for (const value of geometry.positions) assert.ok(Number.isFinite(value));
  for (const value of geometry.normals) assert.ok(Number.isFinite(value));
}

test('marker mesh: deterministic pure typed-array geometry and frozen provenance metadata', () => {
  const first = build();
  const second = build();
  assert.equal(first.metadata.status, 'ok');
  assert.equal(first.metadata.validWaypointCount, 2);
  assert.equal(first.metadata.validRouteSegmentCount, 1);
  assert.deepEqual(first.routeRibbon.positions, second.routeRibbon.positions);
  assert.deepEqual(first.routeRibbon.indices, second.routeRibbon.indices);
  assert.deepEqual(first.metadata, second.metadata);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.metadata));
  assert.ok(Object.isFrozen(first.metadata.waypoints[0]));
  assert.ok(Object.isFrozen(first.waypointBeacons[0].parts[0]));
  assert.equal(first.metadata.waypointSource.name, 'Mars 2020 Initial Reports');
  assert.equal(first.metadata.sourceVerticalDatum, null);
  assert.match(first.metadata.sourceVerticalDatumStatus, /not supplied or verified/i);
  assert.equal(first.metadata.corridorGuidesFollowTerrain, false);
  assert.match(first.metadata.corridorGuideElevationSource, /not independently sampled from terrain/i);
  assert.match(first.metadata.routeNote, /not an actual rover traverse/);
  assert.equal(first.metadata.routeRepresentation.includes('simplified waypoint connection'), true);

  for (const beacon of first.waypointBeacons) {
    assert.equal(beacon.parts.length, 3);
    for (const part of beacon.parts) assertGeometry(part.geometry);
  }
  assertGeometry(first.routeRibbon);
  assertGeometry(first.corridorBoundaries.left);
  assertGeometry(first.corridorBoundaries.right);
  assert.deepEqual(first.waypointBeacons.map((beacon) => beacon.waypoint.role), ['start', 'destination']);
  assert.deepEqual(first.waypointBeacons.map((beacon) => beacon.waypoint.id), ['sol120-wb1', 'sol164-roubion']);
  assert.deepEqual(first.waypointBeacons.map((beacon) => beacon.waypoint.sol), [120, 164]);
});

test('marker mesh: source elevation is transformed by reference and vertical scale; decoration remains display-only', () => {
  const result = build();
  const beaconBase = result.waypointBeacons[0].parts[0].geometry;
  assert.equal(beaconBase.sourceElevationsM[0], -2500);
  assert.ok(Math.abs(beaconBase.positions[2] - 0.025) < 1e-6);

  const route = result.routeRibbon;
  assert.ok(Math.abs(Math.min(...route.positions.filter((_, i) => i % 3 === 2)) - 0.045) < 1e-6);
  assert.ok(Math.abs(Math.max(...route.positions.filter((_, i) => i % 3 === 2)) - 20.045) < 1e-5);
  assert.ok(route.sourceElevationsM.includes(-2500));
  assert.ok(route.sourceElevationsM.includes(-2490));
  assert.equal(result.displayConfig.referenceElevationM, -2500);
  assert.equal(result.displayConfig.verticalScale, 2);
});

test('marker mesh: Sol 120/164 roles survive reordered inputs; unknown waypoint sets use stable order fallback', () => {
  const reordered = build({ waypoints: [...waypoints].reverse() });
  assert.deepEqual(
    reordered.waypointBeacons.map(({ waypoint }) => [waypoint.sol, waypoint.role]),
    [[164, 'destination'], [120, 'start']],
  );

  const custom = build({
    waypoints: [
      { id: 'custom-a', sol: 4, xM: 0, yM: 0, zM: -2500 },
      { id: 'custom-b', sol: 5, xM: 1, yM: 0, zM: -2500 },
      { id: 'custom-c', sol: 6, xM: 2, yM: 0, zM: -2500 },
    ],
  });
  assert.deepEqual(
    custom.waypointBeacons.map(({ waypoint }) => waypoint.role),
    ['start', 'intermediate', 'destination'],
  );
});

test('marker mesh: corridorWidthM is full width; side guides are centered on ±half width', () => {
  const result = build({
    waypoints: [],
    routePoints: [{ xM: 0, yM: 0, zM: -2500 }, { xM: 10, yM: 0, zM: -2500 }],
  });
  const ys = (geometry) => [...geometry.positions].filter((_, i) => i % 3 === 1);
  const leftY = ys(result.corridorBoundaries.left);
  const rightY = ys(result.corridorBoundaries.right);
  assert.ok(Math.abs(Math.min(...leftY) - 9.88) < 1e-5);
  assert.ok(Math.abs(Math.max(...leftY) - 10) < 1e-5);
  assert.ok(Math.abs(Math.min(...rightY) + 10) < 1e-5);
  assert.ok(Math.abs(Math.max(...rightY) + 9.88) < 1e-5);
  assert.equal(result.metadata.corridorHalfWidthM, 10);
});

test('marker mesh: unknown elevation omits waypoint and breaks route without bridging', () => {
  const result = build({
    waypoints: [waypoints[0], { ...waypoints[1], zM: -2490, elevationStatus: 'no_data' }],
    routePoints: [
      { xM: 0, yM: 0, zM: -2500 },
      { xM: 50, yM: 0, zM: null },
      { xM: 100, yM: 0, zM: -2490 },
    ],
  });
  assert.equal(result.metadata.status, 'partial');
  assert.equal(result.metadata.validWaypointCount, 1);
  assert.equal(result.metadata.omittedWaypointCount, 1);
  assert.equal(result.metadata.waypoints[1].geometryStatus, 'unknown-elevation');
  assert.equal(result.metadata.waypoints[1].sourceElevationM, null, 'stale value is not retained when status is not ok');
  assert.equal(result.metadata.validRouteSegmentCount, 0);
  assert.equal(result.metadata.omittedRoutePointCount, 1);
  assert.equal(result.metadata.omittedRouteSegmentCount, 2);
  assert.equal(result.routeRibbon.positions.length, 0);
  assert.equal(result.corridorBoundaries.left.indices.length, 0);
  assert.equal(result.corridorBoundaries.right.indices.length, 0);
  assert.ok(result.metadata.waypoints.every((waypoint) => waypoint.sourceElevationM !== 0));
});

test('marker mesh: valid zero source elevation is preserved, but invalid coordinates and zero-length segments are omitted', () => {
  const result = build({
    waypoints: [{ id: 'zero', xM: 0, yM: 0, zM: 0 }, { id: 'bad', xM: Infinity, yM: 2, zM: -1 }],
    routePoints: [
      { xM: 0, yM: 0, zM: 0 },
      { xM: 0, yM: 0, zM: 0 },
      { xM: 2, yM: 0, zM: 0 },
    ],
  });
  assert.equal(result.metadata.validWaypointCount, 1);
  assert.equal(result.metadata.omittedWaypointCount, 1);
  assert.equal(result.metadata.waypoints[0].sourceElevationM, 0);
  assert.equal(result.waypointBeacons[0].parts[0].geometry.sourceElevationsM[0], 0);
  assert.equal(result.metadata.validRouteSegmentCount, 1);
  assert.equal(result.metadata.omittedRouteSegmentCount, 1);
  assert.equal(result.metadata.status, 'partial');
});

test('marker mesh: rejects ambiguous dimensions and display transforms', () => {
  assert.throws(() => build({ corridorWidthM: 0 }), /positive finite full width/);
  assert.throws(() => build({ displayConfig: { referenceElevationM: 0, verticalScale: 0 } }), /positive verticalScale/);
  assert.throws(() => build({ waypoints: null }), /waypoints and routePoints arrays/);
});
