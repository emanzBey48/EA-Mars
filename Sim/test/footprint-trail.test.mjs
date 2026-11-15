import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFootprintTrail,
  FOOTPRINT_CONTOUR_FLOATS,
  FOOTPRINT_DEFAULTS,
  FOOTPRINT_INSTANCE_FLOATS,
  FOOTPRINT_OUTLINE_POINT_COUNT,
  FOOTPRINT_QUAD_FLOATS,
} from '../public/js/view/3d/footprint-trail.js';
import { ASTRONAUT_RIG, poseAstronautRig } from '../public/js/view/3d/astronaut-rig.js';

const BASE_Z = -2589.359; // Mars 2000 metres, same order as the Sol 120 / WB1 DTM window
const Z_TOL = 5e-4; // Float32 resolution near 2.6 km is about 2.4e-4 m
const STRIDE = FOOTPRINT_DEFAULTS.strideLengthM;
const HALF_STEP = STRIDE / 2;
const LATERAL = FOOTPRINT_DEFAULTS.lateralOffsetM;

const flat = (z = BASE_Z) => () => ({ status: 'ok', value: z });
const plane = (a, b, c) => (x, y) => ({ status: 'ok', value: a * x + b * y + c });

// Feeds a straight walk from the origin. Gait distance equals distance walked, so positions are exact.
function walkStraight(trail, {
  toM, stepM = 0.05, headingRad = 0, startTimeS = 0, grounded = true, airborne = false,
} = {}) {
  const n = Math.round(toM / stepM);
  for (let i = 0; i <= n; i++) {
    const g = i * stepM;
    trail.update({
      timeS: startTimeS + i * stepM,
      xM: g * Math.cos(headingRad),
      yM: g * Math.sin(headingRad),
      headingRad,
      gaitDistanceM: g,
      grounded,
      airborne,
    });
  }
}

const inst = (snap, i) => Array.from(snap.instances.subarray(i * FOOTPRINT_INSTANCE_FLOATS, (i + 1) * FOOTPRINT_INSTANCE_FLOATS));
const quadOf = (snap, i) => Array.from(snap.quads.subarray(i * FOOTPRINT_QUAD_FLOATS, (i + 1) * FOOTPRINT_QUAD_FLOATS));

test('footprint trail: left/right alternate, spacing is stride/2, lateral sign follows heading', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  walkStraight(trail, { toM: 30 });
  const snap = trail.getSnapshot();

  // Footfalls at (k + 1/2) * stride/2: 1.5, 4.5, 7.5, ... 28.5 m -> 10 footprints in 30 m.
  assert.equal(snap.count, 10);
  assert.equal(snap.counters.footfalls, 10);
  for (let i = 0; i < snap.count; i++) {
    const [x, y, , yaw, side] = inst(snap, i);
    assert.ok(Math.abs(x - (1.5 + 3 * i)) < 1e-4, `footprint ${i} along position`);
    assert.equal(side, i % 2 === 0 ? 1 : -1, `footprint ${i} alternates left/right`);
    assert.ok(Math.abs(y - side * LATERAL) < 1e-4, `footprint ${i} lateral offset sign`);
    assert.ok(Math.abs(yaw) < 1e-6);
  }
  // Consecutive footprints are one half-stride apart along the heading.
  for (let i = 1; i < snap.count; i++) {
    const dx = inst(snap, i)[0] - inst(snap, i - 1)[0];
    assert.ok(Math.abs(dx - HALF_STEP) < 1e-4, `spacing ${i}`);
  }
});

test('footprint trail: boot-sole contour has 16 perimeter points inside the bounding quad; any unknown perimeter sample drops the print', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  walkStraight(trail, { toM: 2 }); // one footfall at 1.5 m, left side, heading 0
  const snap = trail.getSnapshot();
  assert.equal(snap.count, 1);
  assert.equal(snap.shapePointCount, FOOTPRINT_OUTLINE_POINT_COUNT);
  assert.equal(snap.soleContours.length, snap.count * FOOTPRINT_CONTOUR_FLOATS);
  const q = quadOf(snap, 0);
  const xs = [q[0], q[3], q[6], q[9]];
  const ys = [q[1], q[4], q[7], q[10]];
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sole = Array.from(snap.soleContours.subarray(0, FOOTPRINT_CONTOUR_FLOATS));
  // Index 0 is the centre; 1..16 are the perimeter. Heading 0 and a flat surface make contour xy equal footprint xy.
  assert.ok(Math.abs(sole[0] - 1.5) < 1e-4 && Math.abs(sole[1] - LATERAL) < 1e-4, 'contour centre at the footprint centre');
  for (let p = 1; p <= FOOTPRINT_OUTLINE_POINT_COUNT; p++) {
    const x = sole[p * 3];
    const y = sole[p * 3 + 1];
    assert.ok(x >= minX - 1e-4 && x <= maxX + 1e-4 && y >= minY - 1e-4 && y <= maxY + 1e-4, `perimeter point ${p} lies inside the bounding quad`);
  }
  // Toe (+heading) reaches the bounding edge; heel stays behind the centre.
  const xsPerimeter = Array.from({ length: FOOTPRINT_OUTLINE_POINT_COUNT }, (_, i) => sole[(i + 1) * 3]);
  assert.ok(Math.max(...xsPerimeter) > 1.5 + 0.4 * FOOTPRINT_DEFAULTS.footprintLengthM);
  assert.ok(Math.min(...xsPerimeter) < 1.5 - 0.4 * FOOTPRINT_DEFAULTS.footprintLengthM);

  // Perimeter point 8 is the toe edge at (+a/2, -0.15 b) relative to the centre; a sampler hole there must reject the print.
  const a = FOOTPRINT_DEFAULTS.footprintLengthM;
  const b = FOOTPRINT_DEFAULTS.footprintWidthM;
  const holeX = 1.5 + a / 2;
  const holeY = LATERAL - 0.15 * b;
  const holed = createFootprintTrail({
    sampleElevation: (x, y) => (Math.abs(x - holeX) < 1e-9 && Math.abs(y - holeY) < 1e-9)
      ? { status: 'nodata', value: null }
      : { status: 'ok', value: BASE_Z },
  });
  walkStraight(holed, { toM: 2 });
  const holedSnap = holed.getSnapshot();
  assert.equal(holedSnap.count, 0, 'no footprint over an unknown perimeter sample');
  assert.ok(holedSnap.counters.skippedUnknown >= 1);
});

test('footprint trail: heading rotates position; left of heading is physical left (+y at heading 0, -x at heading pi/2)', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  walkStraight(trail, { toM: 2, headingRad: Math.PI / 2 }); // only the 1.5 m footfall lies before 2 m
  const snap = trail.getSnapshot();
  assert.equal(snap.count, 1);
  const [x, y, , yaw, side] = inst(snap, 0);
  assert.equal(side, 1);
  assert.ok(Math.abs(x - (-LATERAL)) < 1e-4, 'left foot at heading pi/2 sits at negative x');
  assert.ok(Math.abs(y - 1.5) < 1e-4);
  assert.ok(Math.abs(yaw - Math.PI / 2) < 1e-6);
});

test('footprint trail: sloped surface gives the plane normal and quads lie on the surface plus offset', () => {
  const a = 0.5, b = 0.25, c = BASE_Z;
  const trail = createFootprintTrail({ sampleElevation: plane(a, b, c) });
  walkStraight(trail, { toM: 10 });
  const snap = trail.getSnapshot();
  assert.ok(snap.count >= 3);
  const L = Math.hypot(a, b, 1);
  const expectedN = [-a / L, -b / L, 1 / L];
  for (let i = 0; i < snap.count; i++) {
    const v = inst(snap, i);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(v[7 + k] - expectedN[k]) < 1e-5, `normal ${k} of ${i}`);
    // Centre height equals the plane at the centre (within Float32 resolution).
    assert.ok(Math.abs(v[2] - (a * v[0] + b * v[1] + c)) < Z_TOL, `centre on plane ${i}`);
    // Every quad corner is `groundOffsetM` above the surface, measured perpendicular to the plane.
    const q = quadOf(snap, i);
    for (let corner = 0; corner < 4; corner++) {
      const X = q[corner * 3], Y = q[corner * 3 + 1], Z = q[corner * 3 + 2];
      const perp = (Z - (a * X + b * Y + c)) / L;
      assert.ok(Math.abs(perp - FOOTPRINT_DEFAULTS.groundOffsetM) < 1e-3, `offset of corner ${corner} of ${i}: ${perp}`);
    }
  }
});

test('footprint trail: flat quad has the boot-size edges (along and across heading)', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  walkStraight(trail, { toM: 2 });
  const q = quadOf(trail.getSnapshot(), 0);
  const c = (i) => [q[i * 3], q[i * 3 + 1], q[i * 3 + 2]];
  const dist = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]);
  assert.ok(Math.abs(dist(c(0), c(1)) - FOOTPRINT_DEFAULTS.footprintLengthM) < 1e-3, 'along edge');
  assert.ok(Math.abs(dist(c(0), c(3)) - FOOTPRINT_DEFAULTS.footprintWidthM) < 1e-3, 'across edge');
});

test('footprint trail: no-data cells never receive a footprint and no invented 0 elevation appears', () => {
  // Valid ground only up to x = 8 m; beyond that the sampler reports no_data.
  const sampleElevation = (x) => (x <= 8 ? { status: 'ok', value: BASE_Z } : { status: 'no_data', value: null });
  const trail = createFootprintTrail({ sampleElevation });
  walkStraight(trail, { toM: 20 });
  const snap = trail.getSnapshot();
  const totalFootfalls = 7; // 1.5, 4.5, ..., 19.5
  assert.equal(snap.count, 3); // 1.5, 4.5, 7.5 (corners stay within x <= 8)
  assert.equal(snap.counters.skippedUnknown, totalFootfalls - snap.count);
  for (let i = 0; i < snap.count; i++) {
    assert.ok(Math.abs(inst(snap, i)[2] - BASE_Z) < Z_TOL);
  }
  const all = [...snap.instances, ...snap.quads];
  assert.ok(all.every((v) => Number.isFinite(v)), 'no NaN values');
  assert.ok(snap.quads.every((v, i) => (i % 3 !== 2) || v !== 0), 'no zero elevation');
});

test('footprint trail: airborne suppresses footfalls; touchdown emits exactly one wide centred patch', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  // Index-based phases avoid float edge cases: 0.05 m per step. Airborne for steps 121..179 (6.05..8.95 m).
  for (let i = 0; i <= 240; i++) {
    const g = i * 0.05;
    const airborne = i > 120 && i < 180;
    trail.update({
      timeS: i * 0.05,
      xM: g,
      yM: 0,
      headingRad: 0,
      gaitDistanceM: g,
      grounded: !airborne,
      airborne,
      landingRecoveryFrac: 1,
    });
  }
  const snap = trail.getSnapshot();
  assert.equal(snap.counters.skippedAirborne, 1, 'only the 7.5 m footfall falls in flight');
  assert.equal(snap.counters.landings, 1);
  // Footfalls 1.5, 4.5 and 10.5 (after touchdown); the 7.5 m one is skipped -> 3 footprints + 1 landing patch.
  assert.equal(snap.counters.footfalls, 3);
  assert.equal(snap.count, 4);
  const landings = [];
  for (let i = 0; i < snap.count; i++) if (inst(snap, i)[4] === 0) landings.push(inst(snap, i));
  assert.equal(landings.length, 1, 'exactly one centred landing patch');
  const landing = landings[0];
  // With landingRecoveryFrac 1: scale = 1.6 + 0.8 = 2.4.
  assert.ok(Math.abs(landing[6] - (FOOTPRINT_DEFAULTS.landingBaseScale + FOOTPRINT_DEFAULTS.landingExtraScale)) < 1e-6);
  assert.ok(Math.abs(landing[0] - 9) < 1e-4, 'landing at touchdown position (9 m)');
});

test('footprint trail: placed footprints keep alternating across a flight gap and a no-data gap', () => {
  // No-data corridor between 20 and 24 m; flight from 12.05 to 13.95 m (skips the 13.5 m footfall).
  const sampleElevation = (x) => (x > 20 && x < 24 ? { status: 'no_data', value: null } : { status: 'ok', value: BASE_Z });
  const trail = createFootprintTrail({ sampleElevation });
  for (let i = 0; i <= 600; i++) {
    const g = i * 0.05;
    const airborne = i > 240 && i < 280;
    trail.update({
      timeS: i * 0.05, xM: g, yM: 0, headingRad: 0, gaitDistanceM: g,
      grounded: !airborne, airborne, landingRecoveryFrac: 1,
    });
  }
  const snap = trail.getSnapshot();
  assert.ok(snap.counters.skippedAirborne >= 1, 'a footfall fell in flight');
  assert.ok(snap.counters.skippedUnknown >= 1, 'a footfall fell on no-data');
  const feet = [];
  for (let i = 0; i < snap.count; i++) {
    const side = inst(snap, i)[4];
    if (side !== 0) feet.push(side);
  }
  assert.ok(feet.length > 4);
  for (let i = 1; i < feet.length; i++) assert.notEqual(feet[i], feet[i - 1], `footprint ${i} alternates`);
});

test('footprint trail: landing severity follows landingRecoveryFrac', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  trail.update({ timeS: 0, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true, airborne: false });
  trail.update({ timeS: 0.1, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: false, airborne: true });
  trail.update({ timeS: 0.2, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true, airborne: false, landingRecoveryFrac: 0.5 });
  const snap = trail.getSnapshot();
  assert.equal(snap.count, 1);
  assert.ok(Math.abs(inst(snap, 0)[6] - (FOOTPRINT_DEFAULTS.landingBaseScale + 0.5 * FOOTPRINT_DEFAULTS.landingExtraScale)) < 1e-6);
  // Staying on the ground does not emit a second landing.
  trail.update({ timeS: 0.3, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true, airborne: false });
  assert.equal(trail.getSnapshot().counters.landings, 1);
});

test('footprint trail: capacity overflow drops the oldest and keeps order', () => {
  const big = createFootprintTrail({ sampleElevation: flat() });
  const small = createFootprintTrail({ sampleElevation: flat(), capacity: 5 });
  walkStraight(big, { toM: 30 });
  walkStraight(small, { toM: 30 });
  const b = big.getSnapshot();
  const s = small.getSnapshot();
  assert.equal(s.count, 5);
  assert.equal(s.counters.evicted, 10 - 5);
  assert.deepEqual(Array.from(s.instances), Array.from(b.instances.subarray(5 * FOOTPRINT_INSTANCE_FLOATS)));
  assert.deepEqual(Array.from(s.quads), Array.from(b.quads.subarray(5 * FOOTPRINT_QUAD_FLOATS)));
});

test('footprint trail: alpha fades with scenario time and expired footprints leave the buffer', () => {
  const trail = createFootprintTrail({ sampleElevation: flat(), fadeSeconds: 10 });
  trail.update({ timeS: 0, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true });
  trail.update({ timeS: 1, xM: 2, yM: 0, headingRad: 0, gaitDistanceM: 2, grounded: true });
  assert.equal(trail.getSnapshot().count, 1);
  assert.equal(inst(trail.getSnapshot(), 0)[5], 1);

  trail.update({ timeS: 6, xM: 2, yM: 0, headingRad: 0, gaitDistanceM: 2, grounded: true });
  assert.ok(Math.abs(inst(trail.getSnapshot(), 0)[5] - 0.5) < 1e-6, 'half faded at 5 s of age out of 10');

  trail.update({ timeS: 11, xM: 2, yM: 0, headingRad: 0, gaitDistanceM: 2, grounded: true });
  const snap = trail.getSnapshot();
  assert.equal(snap.count, 0);
  assert.equal(snap.counters.expired, 1);
});

test('footprint trail: same input sequence gives byte-identical typed arrays', () => {
  const run = () => {
    const trail = createFootprintTrail({ sampleElevation: plane(0.3, -0.2, BASE_Z) });
    walkStraight(trail, { toM: 25, headingRad: 0.7, stepM: 0.1 });
    return trail.getSnapshot();
  };
  const a = run();
  const b = run();
  assert.ok(a.instances instanceof Float32Array);
  assert.ok(a.quads instanceof Float32Array);
  assert.ok(a.count > 0);
  assert.equal(Buffer.compare(Buffer.from(a.instances.buffer), Buffer.from(b.instances.buffer)), 0);
  assert.equal(Buffer.compare(Buffer.from(a.quads.buffer), Buffer.from(b.quads.buffer)), 0);
});

test('footprint trail: frame-rate independent, no double counting for repeated or finer updates', () => {
  const coarse = createFootprintTrail({ sampleElevation: flat() });
  const fine = createFootprintTrail({ sampleElevation: flat() });
  walkStraight(coarse, { toM: 30, stepM: 1 });
  walkStraight(fine, { toM: 30, stepM: 0.02 });
  assert.equal(coarse.getSnapshot().count, fine.getSnapshot().count);
  // Repeating the same gait distance must not place new footprints.
  const before = fine.getSnapshot().count;
  fine.update({ timeS: 100, xM: 30, yM: 0, headingRad: 0, gaitDistanceM: 30, grounded: true });
  assert.equal(fine.getSnapshot().count, before);
});

test('footprint trail: teleport and backward gait never flood the trail', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  trail.update({ timeS: 0, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true });
  // Large jump in gait distance and position (reset / teleport): no footprints for the skipped span.
  trail.update({ timeS: 0.1, xM: 500, yM: 0, headingRad: 0, gaitDistanceM: 500, grounded: true });
  let snap = trail.getSnapshot();
  assert.equal(snap.count, 0);
  assert.equal(snap.counters.discontinuities, 1);
  // Gait distance going backwards is a reset, not negative stepping.
  trail.update({ timeS: 0.2, xM: 10, yM: 0, headingRad: 0, gaitDistanceM: 10, grounded: true });
  snap = trail.getSnapshot();
  assert.equal(snap.counters.gaitResets, 1);
  assert.equal(snap.count, 0);
  // Walking resumes on the global schedule (footfalls at 1.5 + 3k m): 10.5 and 13.5 lie in (10, 14].
  trail.update({ timeS: 0.3, xM: 14, yM: 0, headingRad: 0, gaitDistanceM: 14, grounded: true });
  snap = trail.getSnapshot();
  assert.equal(snap.count, 2);
  assert.ok(Math.abs(inst(snap, 0)[0] - 10.5) < 1e-4);
  assert.ok(Math.abs(inst(snap, 1)[0] - 13.5) < 1e-4);
});

test('footprint trail: paused time (unchanged timeS) does not age footprints', () => {
  const trail = createFootprintTrail({ sampleElevation: flat(), fadeSeconds: 10 });
  trail.update({ timeS: 0, xM: 0, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true });
  trail.update({ timeS: 1, xM: 2, yM: 0, headingRad: 0, gaitDistanceM: 2, grounded: true });
  for (let i = 0; i < 1000; i++) {
    trail.update({ timeS: 1, xM: 2, yM: 0, headingRad: 0, gaitDistanceM: 2, grounded: true });
  }
  const snap = trail.getSnapshot();
  assert.equal(snap.count, 1);
  assert.equal(snap.counters.expired, 0);
  assert.equal(inst(snap, 0)[5], 1);
});

test('footprint trail: snapshot metadata and counters are frozen; display exaggeration is labelled', () => {
  const trail = createFootprintTrail({
    sampleElevation: flat(),
    displayConfig: { referenceElevationM: BASE_Z, verticalScale: 3 },
  });
  walkStraight(trail, { toM: 2 });
  const snap = trail.getSnapshot();
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.counters));
  assert.ok(Object.isFrozen(snap.meta));
  assert.ok(Object.isFrozen(snap.meta.parameters));
  assert.ok(Object.isFrozen(snap.meta.caveats));
  assert.equal(snap.meta.verticalScaleApplied, false);
  assert.equal(snap.meta.verticalExaggerated, true);
  assert.match(snap.meta.verticalExaggerationLabel, /×3/);
  assert.equal(snap.schemaVersion, 1);

  const real = createFootprintTrail({ sampleElevation: flat(), displayConfig: { referenceElevationM: BASE_Z, verticalScale: 1 } });
  assert.equal(real.getSnapshot().meta.verticalExaggerated, false);
  assert.equal(real.getSnapshot().meta.verticalExaggerationLabel, null);
});

test('footprint trail: invalid inputs are rejected loudly', () => {
  assert.throws(() => createFootprintTrail({}), TypeError);
  assert.throws(() => createFootprintTrail({ sampleElevation: flat(), capacity: 0 }), RangeError);
  assert.throws(() => createFootprintTrail({ sampleElevation: flat(), displayConfig: { referenceElevationM: 0, verticalScale: 0 } }), RangeError);
  const trail = createFootprintTrail({ sampleElevation: flat() });
  assert.throws(() => trail.update({ timeS: 0, xM: Number.NaN, yM: 0, headingRad: 0, gaitDistanceM: 0, grounded: true }), TypeError);
});

test('footprint trail: empty snapshot and reset', () => {
  const trail = createFootprintTrail({ sampleElevation: flat() });
  let snap = trail.getSnapshot();
  assert.equal(snap.count, 0);
  assert.equal(snap.instances.length, 0);
  walkStraight(trail, { toM: 6 });
  assert.ok(trail.getSnapshot().count > 0);
  trail.reset();
  snap = trail.getSnapshot();
  assert.equal(snap.count, 0);
  assert.equal(snap.counters.footfalls, 0);
});

test('footprint trail: footfall sides agree with the astronaut rig gait phase (checked on rig output)', () => {
  // 1) Verify the axis convention from the rig itself: rig +X maps to the physical left of the heading.
  for (const headingRad of [0, 0.7, -2.1]) {
    const theta = headingRad + ASTRONAUT_RIG.metadata.forwardHeadingOffsetRad;
    const worldX = [Math.cos(theta), Math.sin(theta)];
    const physicalLeft = [-Math.sin(headingRad), Math.cos(headingRad)];
    assert.ok(Math.abs(worldX[0] - physicalLeft[0]) < 1e-12 && Math.abs(worldX[1] - physicalLeft[1]) < 1e-12);
  }

  // 2) At each footfall distance, the rig's most forward boot (planted foot) decides the expected side.
  const trail = createFootprintTrail({ sampleElevation: flat() });
  walkStraight(trail, { toM: 19.6 }); // footfalls 1.5 ... 19.5 m: seven of them
  const snap = trail.getSnapshot();
  assert.equal(snap.count, 7);
  for (let k = 0; k < snap.count; k++) {
    const d = (k + 0.5) * HALF_STEP;
    const pose = poseAstronautRig({
      timeS: 1,
      horizontalSpeedMps: 1.2,
      verticalSpeedMps: 0,
      grounded: true,
      phase: 'walk',
      gaitDistanceM: d,
    });
    const yL = pose.parts.leftBoot.offset[1];
    const yR = pose.parts.rightBoot.offset[1];
    assert.ok(Math.abs(yL - yR) > 0.05, `rig feet clearly separated at ${d} m`);
    const forwardBoot = yL < yR ? 'leftBoot' : 'rightBoot';
    // Rig +X is the physical left, so a boot with centre x > 0 is the physical-left foot.
    const forwardCenterX = ASTRONAUT_RIG.parts[forwardBoot].center[0];
    const plantedSide = Math.sign(forwardCenterX);
    assert.equal(inst(snap, k)[4], plantedSide, `footfall ${k} at ${d} m matches the rig's forward foot`);
  }
});
