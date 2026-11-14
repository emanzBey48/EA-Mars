import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMarkerMeshes } from '../public/js/view/3d/marker-mesh.js';
import { WAYPOINTS, MAP_FRAME, ROUTE_ORIGIN_NOTE } from '../public/js/config.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';

const DISPLAY_CONFIG = {
  referenceElevationM: -2560.0,
  verticalScale: 3.0,
};

test('marker-mesh: input validation rejects invalid displayConfig or non-array waypoints', () => {
  assert.throws(
    () => buildMarkerMeshes({ waypoints: [], displayConfig: null }),
    TypeError,
    'missing displayConfig should throw TypeError'
  );

  assert.throws(
    () => buildMarkerMeshes({ waypoints: [], displayConfig: { referenceElevationM: NaN, verticalScale: 3 } }),
    TypeError,
    'NaN referenceElevationM should throw TypeError'
  );

  assert.throws(
    () => buildMarkerMeshes({ waypoints: [], displayConfig: { referenceElevationM: -2500, verticalScale: 0 } }),
    TypeError,
    'zero or negative verticalScale should throw TypeError'
  );

  assert.throws(
    () => buildMarkerMeshes({ waypoints: 'not-an-array', displayConfig: DISPLAY_CONFIG }),
    TypeError,
    'non-array waypoints should throw TypeError'
  );
});

test('marker-mesh: builds deterministic frozen mesh with valid typed arrays and index bounds', () => {
  const waypoints = [
    { id: 'sol120-wb1', label: 'Sol 120 / WB1', xM: 0, yM: 0, zM: -2569.4 },
    { id: 'sol164-roubion', label: 'Sol 164 / Roubion', xM: 100, yM: -200, zM: -2572.1 },
  ];

  const mesh1 = buildMarkerMeshes({
    waypoints,
    route: { a: { xM: 0, yM: 0, zM: -2569.4 }, b: { xM: 100, yM: -200, zM: -2572.1 } },
    corridorHalfWidthM: 10,
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: (x, y) => ({ status: 'ok', value: -2570.0 }),
  });

  const mesh2 = buildMarkerMeshes({
    waypoints,
    route: { a: { xM: 0, yM: 0, zM: -2569.4 }, b: { xM: 100, yM: -200, zM: -2572.1 } },
    corridorHalfWidthM: 10,
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: (x, y) => ({ status: 'ok', value: -2570.0 }),
  });

  assert.ok(Object.isFrozen(mesh1), 'mesh root must be deeply frozen');
  assert.ok(Object.isFrozen(mesh1.metadata), 'metadata must be frozen');
  assert.ok(Object.isFrozen(mesh1.bounds), 'bounds must be frozen');

  assert.ok(mesh1.positions instanceof Float32Array, 'positions must be Float32Array');
  assert.ok(mesh1.normals instanceof Float32Array, 'normals must be Float32Array');
  assert.ok(mesh1.colorsRgb instanceof Float32Array, 'colorsRgb must be Float32Array');
  assert.ok(mesh1.indices instanceof Uint32Array, 'indices must be Uint32Array');

  assert.equal(mesh1.positions.length % 3, 0, 'positions must contain XYZ triples');
  assert.equal(mesh1.normals.length, mesh1.positions.length, 'normals must align with positions');
  assert.equal(mesh1.colorsRgb.length, mesh1.positions.length, 'colors must align with positions');
  assert.equal(mesh1.indices.length % 3, 0, 'indices must contain triangle triples');

  // Verify vertex index bounds
  const vertexCount = mesh1.positions.length / 3;
  assert.ok(vertexCount > 0, 'must emit vertices');
  for (let i = 0; i < mesh1.indices.length; i++) {
    const idx = mesh1.indices[i];
    assert.ok(idx >= 0 && idx < vertexCount, `index ${idx} out of range [0, ${vertexCount})`);
  }

  // Verify determinism across identical runs
  assert.equal(mesh1.positions.length, mesh2.positions.length);
  assert.equal(mesh1.indices.length, mesh2.indices.length);
  for (let i = 0; i < mesh1.positions.length; i++) {
    assert.equal(mesh1.positions[i], mesh2.positions[i]);
  }
  for (let i = 0; i < mesh1.indices.length; i++) {
    assert.equal(mesh1.indices[i], mesh2.indices[i]);
  }
});

test('marker-mesh: carries scientific and scenario metadata (Sol 120/164 coords, route note, corridor assumption)', () => {
  const waypoints = [
    { id: 'sol120-wb1', label: 'Sol 120 / WB1', sol: 120, latDeg: 18.43906919, lonDeg: 77.44940206, xM: 0, yM: 0, zM: -2569.4 },
    { id: 'sol164-roubion', label: 'Sol 164 / Roubion', sol: 164, latDeg: 18.42769340, lonDeg: 77.45165066, xM: 133.4, yM: -673.1, zM: -2572.8 },
  ];

  const mesh = buildMarkerMeshes({
    waypoints,
    route: { a: waypoints[0], b: waypoints[1], routeOriginNote: ROUTE_ORIGIN_NOTE },
    corridorHalfWidthM: 15,
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: () => ({ status: 'ok', value: -2570.0 }),
  });

  const { metadata } = mesh;
  assert.equal(metadata.kind, '3d-markers');
  assert.equal(metadata.routeOriginNote, ROUTE_ORIGIN_NOTE);
  assert.ok(metadata.corridorNote.includes('senaryo varsayımı'));
  assert.equal(metadata.corridorHalfWidthM, 15);
  assert.equal(metadata.beaconCount, 2, 'both Sol 120 and Sol 164 beacons should be built');
  assert.deepEqual(metadata.beaconDrawRanges.map(({ id, localXM, localYM }) => ({ id, localXM, localYM })), [
    { id: 'sol120-wb1', localXM: 0, localYM: 0 },
    { id: 'sol164-roubion', localXM: 133.4, localYM: -673.1 },
  ]);
  assert.ok(metadata.beaconDrawRanges.every((range) => range.indexCount > 0 && range.indexCount % 3 === 0));
  assert.ok(metadata.beaconDrawRanges[0].indexStart + metadata.beaconDrawRanges[0].indexCount <= metadata.beaconDrawRanges[1].indexStart);
  assert.ok(metadata.guideCount > 0, 'ground chevrons should be generated along segment');
  assert.ok(metadata.corridorMarkerCount > 0, 'corridor boundary posts should be generated');
  assert.equal(metadata.omittedCount, 0, 'no points omitted when all elevations are ok');

  // Verify waypoint details
  assert.equal(metadata.waypoints.length, 2);
  assert.equal(metadata.waypoints[0].id, 'sol120-wb1');
  assert.equal(metadata.waypoints[0].sol, 120);
  assert.equal(metadata.waypoints[0].elevationStatus, 'ok');
  assert.equal(metadata.waypoints[1].id, 'sol164-roubion');
  assert.equal(metadata.waypoints[1].sol, 164);
  assert.equal(metadata.waypoints[1].elevationStatus, 'ok');
});

test('marker-mesh: strict no-data handling — unknown elevations are omitted, NEVER converted to 0 m', () => {
  const waypoints = [
    { id: 'sol120-wb1', label: 'Sol 120 / WB1', xM: 0, yM: 0 },           // elevation sampled as OK
    { id: 'sol164-roubion', label: 'Sol 164 / Roubion', xM: 100, yM: 0 }, // elevation sampled as NO_DATA
  ];

  const mesh = buildMarkerMeshes({
    waypoints,
    route: { a: waypoints[0], b: waypoints[1] },
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: (x) => {
      if (x < 50) return { status: 'ok', value: -2569.0 };
      return { status: 'no_data', value: null };
    },
  });

  // Sol 164 is no-data, so it must be omitted from beacons; only Sol 120 is built
  assert.equal(mesh.metadata.beaconCount, 1);
  assert.ok(mesh.metadata.omittedCount > 0, 'points with no_data elevation must be incremented in omittedCount');

  // Verify that NO vertex in the emitted mesh has display Z computed from 0m elevation
  // If 0 was used: displayZ = (0 - (-2560)) * 3 = 7680
  // Real display Z for -2569m is around (-2569 - (-2560)) * 3 = -27
  for (let i = 2; i < mesh.positions.length; i += 3) {
    const z = mesh.positions[i];
    assert.ok(z < 1000, `vertex display Z (${z}) must not be derived from assumed 0m elevation`);
  }

  // All unknown: returns empty valid mesh without crashing
  const emptyMesh = buildMarkerMeshes({
    waypoints: [{ id: 'test', xM: 0, yM: 0 }],
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: () => ({ status: 'unavailable', value: null }),
  });
  assert.equal(emptyMesh.metadata.beaconCount, 0);
  assert.equal(emptyMesh.metadata.omittedCount, 1);
  assert.equal(emptyMesh.positions.length, 0);
  assert.equal(emptyMesh.indices.length, 0);
});

test('marker-mesh: explicit non-ok status rejects stale elevation before sampler fallback', () => {
  let samplerCalls = 0;
  const stalePoint = {
    id: 'sol164-roubion',
    xM: 100,
    yM: 0,
    zM: -2572.8,
    elevationM: -2572.8,
    elevationStatus: 'no_data',
  };

  const mesh = buildMarkerMeshes({
    waypoints: [stalePoint],
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: () => {
      samplerCalls++;
      return { status: 'ok', value: -2572.8 };
    },
  });

  assert.equal(samplerCalls, 0, 'an explicit non-ok status must stop before sampler fallback');
  assert.equal(mesh.metadata.beaconCount, 0);
  assert.equal(mesh.metadata.omittedCount, 1);
  assert.equal(mesh.metadata.waypoints[0].elevationStatus, 'no_data');
  assert.equal(mesh.metadata.waypoints[0].elevationM, null);
  assert.equal(mesh.positions.length, 0);
});

test('marker-mesh: corridor posts reflect corridorHalfWidth changes and route geometry', () => {
  const waypoints = [
    { id: 'sol120-wb1', xM: 0, yM: 0, zM: -2560 },
    { id: 'sol164-roubion', xM: 0, yM: 300, zM: -2560 }, // Route goes purely North (+Y), so normal is West (-X)
  ];

  const meshNarrow = buildMarkerMeshes({
    waypoints,
    route: { a: waypoints[0], b: waypoints[1] },
    corridorHalfWidthM: 10,
    corridorPostSpacingM: 50,
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: () => ({ status: 'ok', value: -2560 }),
  });

  const meshWide = buildMarkerMeshes({
    waypoints,
    route: { a: waypoints[0], b: waypoints[1] },
    corridorHalfWidthM: 40,
    corridorPostSpacingM: 50,
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: () => ({ status: 'ok', value: -2560 }),
  });

  // For North-heading route, left corridor is -halfWidth on X, right is +halfWidth on X
  // Narrow bounds should span approx [-10, 10] on X
  // Wide bounds should span approx [-40, 40] on X
  assert.ok(meshNarrow.bounds.minX < -9 && meshNarrow.bounds.minX > -15);
  assert.ok(meshNarrow.bounds.maxX > 9 && meshNarrow.bounds.maxX < 15);

  assert.ok(meshWide.bounds.minX < -38 && meshWide.bounds.minX > -45);
  assert.ok(meshWide.bounds.maxX > 38 && meshWide.bounds.maxX < 45);
});

test('marker-mesh: real Jezero waypoints and MAP_FRAME integration', () => {
  const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
  const waypoints = WAYPOINTS.map((w) => ({
    ...w,
    local: adapter.latLonToLocal(w.latDeg, w.lonDeg),
  }));

  const mesh = buildMarkerMeshes({
    waypoints,
    route: { a: waypoints[0].local, b: waypoints[1].local },
    corridorHalfWidthM: 10,
    displayConfig: DISPLAY_CONFIG,
    sampleElevation: () => ({ status: 'ok', value: -2569.4 }),
  });

  assert.equal(mesh.metadata.beaconCount, 2);
  assert.ok(mesh.metadata.guideCount >= 15, 'expected at least 15 chevrons on ~686m route');
  assert.ok(mesh.metadata.corridorMarkerCount >= 10, 'expected corridor posts on ~686m route');
  assert.ok(mesh.triangleCount > 500, 'marker mesh contains adequate low-poly detail');
});
