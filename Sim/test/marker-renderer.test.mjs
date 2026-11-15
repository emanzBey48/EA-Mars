import test from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PERSON_BEACON_HIDE_RADIUS_M, getMarkerDrawPlan } from '../public/js/view/3d/renderer.js';

const markerMesh = {
  indices: new Uint32Array(360),
  metadata: {
    beaconDrawRanges: [
      { id: 'sol120-wb1', localXM: 0, localYM: 0, indexStart: 0, indexCount: 60 },
      { id: 'sol164-roubion', localXM: 100, localYM: -200, indexStart: 90, indexCount: 60 },
    ],
  },
};

test('marker renderer skips only the near first-person beacon range and keeps all following marker indices', () => {
  const plan = getMarkerDrawPlan(markerMesh, { mode: 'first-person', xM: 0, yM: 0 });

  assert.deepEqual(plan.hiddenBeaconIds, ['sol120-wb1']);
  assert.deepEqual(plan.drawRanges, [
    { indexStart: 60, indexCount: 300 },
  ]);
  assert.equal(plan.drawRanges.reduce((sum, range) => sum + range.indexCount, 0), 300);
  // The far beacon, route/corridor geometry, and archive tail remain in the draw span after the hidden first beacon.
  assert.equal(plan.drawRanges[0].indexStart + plan.drawRanges[0].indexCount, markerMesh.indices.length);

  const targetNearby = getMarkerDrawPlan(markerMesh, { mode: 'first-person', xM: 100, yM: -200 });
  assert.deepEqual(targetNearby.hiddenBeaconIds, ['sol164-roubion']);
  assert.deepEqual(targetNearby.drawRanges, [
    { indexStart: 0, indexCount: 90 },
    { indexStart: 150, indexCount: 210 },
  ]);
});

test('marker renderer restores beacons outside the first-person clearance and does not hide them in 2D', () => {
  const beyondRadius = FIRST_PERSON_BEACON_HIDE_RADIUS_M + 0.01;
  assert.deepEqual(getMarkerDrawPlan(markerMesh, { mode: 'first-person', xM: beyondRadius, yM: 0 }), {
    drawRanges: [{ indexStart: 0, indexCount: markerMesh.indices.length }],
    hiddenBeaconIds: [],
  });
  assert.deepEqual(getMarkerDrawPlan(markerMesh, { mode: '2d', xM: 0, yM: 0 }), {
    drawRanges: [{ indexStart: 0, indexCount: markerMesh.indices.length }],
    hiddenBeaconIds: [],
  });
});
