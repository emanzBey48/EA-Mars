import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SITE_FRAME_ASSUMPTION, STOP_SITE_DRIVE, OBSERVATION_DISCLAIMER,
  parseObservationRecord, parseObservationManifest, parseDescriptionAzEl,
  quaternionToRollPitchYawDeg, roverAzElToVector, roverVectorToAzEl, localDirectionToCameraAngles,
  resolvePointing, crossCheckDescription, crossCheckCompassLabel, parseCompassLabel,
  createStops, matchObservationToStop, nearestStop,
} from '../public/js/geo/rover-observations.js';
import { createFirstPersonCamera, getViewProjectionMatrix } from '../public/js/view/3d/camera.js';
import { WAYPOINTS, MAP_FRAME } from '../public/js/config.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';

const DEG = Math.PI / 180;
const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const manifest = readJson('../data/perseverance-raw/manifest.json');
const waypointRows = readJson('../data/mars-trek/M20_waypoints.json').features.map((f) => f.properties);
const parsed = parseObservationManifest(manifest);
const byId = (prefix) => parsed.observations.find((o) => o.imageId.startsWith(prefix));
const OK = { acceptAssumption: SITE_FRAME_ASSUMPTION };

function syntheticRecord(overrides = {}) {
  return {
    imageid: 'NLM_0120_0000000000_000ECM_TEST', sol: 120, instrument: 'NAVCAM_LEFT', camera_name: 'CAHVORE',
    description_tr: 'test', date_taken_mars: 'Sol-00120M13:00:00.000', site: 4, drive: '1250',
    attitude: '(1,0,0,0)', mastAz: 0, mastEl: 0, credit: 'NASA/JPL-Caltech', ...overrides,
  };
}
const synth = (o) => { const r = parseObservationRecord(syntheticRecord(o)); assert.ok(r.ok, JSON.stringify(r.errors)); return r.observation; };

/** Projects a world point through camera.js' own matrix; returns NDC and clip w. */
function projectThroughCamera(cameraAngles, worldDelta) {
  const camera = createFirstPersonCamera({ xM: 0, yM: 0, zDisplay: 0, eyeHeightM: 1, yawRad: cameraAngles.yawRad, pitchRad: cameraAngles.pitchRad });
  const m = getViewProjectionMatrix(camera, 1);
  const p = [worldDelta.east * 10, worldDelta.north * 10, worldDelta.up * 10, 1]; // eye sits at zDisplay 0 (setFirstPersonPose adds eye height separately)
  const clip = [0, 1, 2, 3].map((row) => m[row] * p[0] + m[4 + row] * p[1] + m[8 + row] * p[2] + m[12 + row] * p[3]);
  return { ndcX: clip[0] / clip[3], ndcY: clip[1] / clip[3], w: clip[3] };
}

test('manifest: all 12 records parse with verbatim provenance and no rejects', () => {
  assert.equal(parsed.ok, true);
  assert.equal(parsed.observations.length, 12);
  assert.equal(parsed.rejected.length, 0);
  assert.equal(parsed.observations.filter((o) => o.sol === 120).length, 6);
  assert.equal(parsed.observations.filter((o) => o.sol === 164).length, 6);
  assert.equal(parsed.provenance.citation, manifest.citation);
  assert.equal(parsed.provenance.liveTelemetry, false);
  assert.equal(parsed.provenance.scienceCalibrated, false);
  assert.equal(parsed.provenance.disclaimer, OBSERVATION_DISCLAIMER);
  // Credits are copied exactly; instrument-specific institutions appear only where the data has them.
  assert.equal(byId('LRE_0120').credit, 'NASA/JPL-Caltech/LANL/CNES/IRAP');
  assert.equal(byId('ZL0_0164').credit, 'NASA/JPL-Caltech/ASU');
  assert.equal(byId('NLM_0120').credit, 'NASA/JPL-Caltech');
  assert.ok(parsed.observations.every((o) => o.baseCreditPresent));
  assert.ok(!parsed.observations.some((o) => /MSSS/.test(o.credit)), 'MSSS is not in the data and must not be invented');
  // Mounting classification.
  assert.equal(byId('FRF_0164').mounting, 'body');
  assert.equal(byId('CCF_0120').mounting, 'body');
  assert.equal(byId('NLF_0164').mounting, 'mast');
  assert.equal(byId('CCF_0120').mastAzDeg, null);
  assert.equal(byId('CCF_0120').mastElDeg, null);
  assert.equal(parsed.warnings.length, 0, parsed.warnings.join('; '));
});

test('sign conventions: local direction -> camera yaw/pitch matches camera.js projection numerically', () => {
  const cases = {
    north: { east: 0, north: 1, up: 0 }, east: { east: 1, north: 0, up: 0 },
    south: { east: 0, north: -1, up: 0 }, west: { east: -1, north: 0, up: 0 },
    up: { east: 0, north: 0.5, up: 0.5 }, down: { east: 0.5, north: 0, up: -0.5 },
  };
  for (const [name, dir] of Object.entries(cases)) {
    const n = Math.hypot(dir.east, dir.north, dir.up);
    const unit = { east: dir.east / n, north: dir.north / n, up: dir.up / n };
    const angles = localDirectionToCameraAngles(unit);
    const hit = projectThroughCamera(angles, unit);
    assert.ok(hit.w > 0, `${name}: in front of camera`);
    assert.ok(Math.abs(hit.ndcX) < 1e-4 && Math.abs(hit.ndcY) < 1e-4, `${name}: lands at screen centre (${hit.ndcX}, ${hit.ndcY})`);
  }
  assert.ok(Math.abs(localDirectionToCameraAngles({ east: 0, north: 1, up: 0 }).yawRad - Math.PI / 2) < 1e-12); // north = +90 deg yaw
  assert.ok(Math.abs(localDirectionToCameraAngles({ east: 1, north: 0, up: 0 }).yawRad) < 1e-12); // east = yaw 0
  assert.ok(localDirectionToCameraAngles({ east: 0, north: 0, up: 1 }).pitchRad > 1.5); // up = positive pitch
});

test('rover az/el with level north-facing rover (identity attitude): az 0=north, 90=east, 180=south, 270=west', () => {
  const expectYaw = { 0: Math.PI / 2, 90: 0, 180: -Math.PI / 2, 270: Math.PI };
  for (const [az, yaw] of Object.entries(expectYaw)) {
    const p = resolvePointing(synth({ mastAz: Number(az), mastEl: 0 }), OK);
    assert.ok(p.available);
    assert.ok(Math.abs(p.camera.yawRad - yaw) < 1e-9, `az ${az}: yaw ${p.camera.yawRad}`);
    assert.ok(Math.abs(p.camera.pitchRad) < 1e-9);
    assert.ok(Math.abs(p.siteFrame.azDeg - Number(az)) < 1e-9);
    const hit = projectThroughCamera(p.camera, p.local);
    assert.ok(hit.w > 0 && Math.abs(hit.ndcX) < 1e-4 && Math.abs(hit.ndcY) < 1e-4);
  }
  assert.ok(Math.abs(resolvePointing(synth({ mastAz: 0, mastEl: 30 }), OK).camera.pitchRad - 30 * DEG) < 1e-9);
  assert.ok(Math.abs(resolvePointing(synth({ mastAz: 0, mastEl: -30 }), OK).camera.pitchRad + 30 * DEG) < 1e-9);
  assert.ok(Math.abs(resolvePointing(synth({ mastAz: 0, mastEl: -23 }), OK).local.up + Math.sin(23 * DEG)) < 1e-9); // el<0 looks down
});

test('rover heading rotates pointing clockwise from north (rover facing east: az 0 -> east)', () => {
  const q = { w: Math.cos(Math.PI / 4), z: Math.sin(Math.PI / 4) }; // yaw +90 deg about +Z (down) = clockwise
  const o = synth({ attitude: `(${q.w},0,0,${q.z})`, mastAz: 0, mastEl: 0 });
  const p = resolvePointing(o, OK);
  assert.ok(Math.abs(p.camera.yawRad) < 1e-9, 'east = yaw 0');
  assert.ok(Math.abs(p.siteFrame.azDeg - 90) < 1e-9);
  assert.ok(Math.abs(p.roverHeadingDeg - 90) < 1e-9);
});

test('attitude quaternion order/direction reproduces M20_waypoints roll/pitch/yaw (data-verified)', () => {
  const row = (rmc) => waypointRows.find((r) => r.RMC === rmc);
  for (const [prefix, rmc] of [['NLM_0120', '4_1250'], ['ZL0_0164', '6_0'], ['NLF_0164', '6_0']]) {
    const rpy = quaternionToRollPitchYawDeg(byId(prefix).attitude);
    const ref = row(rmc);
    assert.ok(circ(rpy.yawDeg, ref.yaw) < 0.5, `${rmc} yaw ${rpy.yawDeg} vs ${ref.yaw}`);
    assert.ok(Math.abs(rpy.pitchDeg - ref.pitch) < 0.5, `${rmc} pitch`);
    assert.ok(Math.abs(rpy.rollDeg - ref.roll) < 0.5, `${rmc} roll`);
  }
  function circ(a, b) { return Math.abs(((a - b + 540) % 360 + 360) % 360 - 180); }
});

test('rover-frame mast az/el agrees with API camera-model A axis for Navcam and Mastcam-Z; SuperCam does not', () => {
  const api = { 120: readJson('../data/perseverance-raw/sol120_api_response.json'), 164: readJson('../data/perseverance-raw/sol164_api_response.json') };
  const axisOf = (rec) => {
    const parts = rec.camera.camera_model_component_list.split(';');
    return parts[1].replace(/[()]/g, '').split(',').map(Number); // A axis of CAHV-family models
  };
  const diffs = {};
  for (const o of parsed.observations.filter((x) => x.mastAzDeg !== null)) {
    const rec = api[o.sol].images.find((r) => r.imageid.startsWith(o.imageId));
    assert.ok(rec, o.imageId);
    const ae = roverVectorToAzEl(axisOf(rec));
    diffs[o.instrument] = Math.max(circDiff(ae.azDeg, o.mastAzDeg), Math.abs(ae.elDeg - o.mastElDeg));
  }
  for (const k of ['NAVCAM_LEFT', 'NAVCAM_RIGHT', 'MCZ_LEFT']) assert.ok(diffs[k] < 1.5, `${k} ${diffs[k]}`);
  assert.ok(diffs.SUPERCAM_RMI > 10, 'known discrepancy: SuperCam CAHV frame differs from mast az/el');
  function circDiff(a, b) { return Math.abs(((a - b + 540) % 360 + 360) % 360 - 180); }
});

test('API xyz is the site-frame (N,E,D) rover position (matches M20_waypoints deltas to < 10 m)', () => {
  const api = readJson('../data/perseverance-raw/sol120_api_response.json');
  const xyz = api.images[0].extended.xyz.replace(/[()]/g, '').split(',').map(Number);
  const a = waypointRows.find((r) => r.RMC === '4_0');
  const b = waypointRows.find((r) => r.RMC === '4_1250');
  assert.ok(Math.abs((b.northing - a.northing) - xyz[0]) < 10);
  assert.ok(Math.abs((b.easting - a.easting) - xyz[1]) < 10);
});

test('real records: pointing is available only for mast cameras and always unverified', () => {
  const nav = resolvePointing(byId('NLM_0120_0677598265'), OK);
  assert.ok(nav.available);
  assert.equal(nav.conventionVerified, false);
  assert.equal(nav.assumption, SITE_FRAME_ASSUMPTION);
  assert.ok(nav.camera.yawRad > -Math.PI && nav.camera.yawRad <= Math.PI);
  // Rover heading -140 deg (SW) + az ~0 -> site azimuth ~220 deg (pitch/roll move it by a few tenths of a degree).
  assert.ok(Math.abs(nav.siteFrame.azDeg - 220) < 3, String(nav.siteFrame.azDeg));
  for (const o of parsed.observations) {
    const p = resolvePointing(o, OK);
    if (o.mounting === 'mast') {
      assert.ok(p.available, o.imageId);
      assert.equal(p.camera.pitchClamped, false);
      assert.equal(p.conventionVerified, false);
    } else {
      assert.equal(p.available, false);
      assert.equal(p.reason, 'body_mounted_camera_mast_angles_not_camera_axis');
      assert.equal(p.camera, null);
    }
  }
});

test('fail closed: without accepting the named assumption no site/local/camera angle is produced', () => {
  const o = byId('NLM_0120_0677598265');
  for (const opts of [undefined, {}, { acceptAssumption: true }, { acceptAssumption: 'something else' }]) {
    const p = resolvePointing(o, opts);
    assert.equal(p.available, false);
    assert.equal(p.reason, 'site_frame_assumption_not_accepted');
    assert.equal(p.camera, null);
    assert.equal(p.siteFrame, null);
    assert.equal(p.local, null);
    assert.ok(Math.abs(p.roverFrame.azDeg - o.mastAzDeg) < 1e-12, 'rover-frame values stay available');
  }
  assert.equal(resolvePointing(null, OK).reason, 'invalid_observation');
  assert.equal(resolvePointing(synth({ instrument: 'MYSTERY_CAM' }), OK).reason, 'unknown_instrument_mounting');
  assert.equal(resolvePointing(synth({ instrument: 'CACHECAM', mastAz: 'UNK', mastEl: 'UNK' }), OK).available, false);
});

test('description az/el vs numeric fields: 8 agree, 4 have no description values (2 Hazcam, 2 CacheCam), none disagree', () => {
  const statuses = parsed.observations.map((o) => crossCheckDescription(o).status);
  assert.equal(statuses.filter((s) => s === 'agree').length, 8);
  assert.equal(statuses.filter((s) => s === 'no_description_values').length, 4);
  assert.equal(statuses.filter((s) => s === 'disagree').length, 0);
  assert.deepEqual(parseDescriptionAzEl('x (az: 359.8°, el: -23.0°)'), { azDeg: 359.8, elDeg: -23 });
  assert.equal(parseDescriptionAzEl('no angles'), null);
  const bad = synth({ description_tr: 'x (az: 120.0°, el: -10.0°)', mastAz: 300, mastEl: -10 });
  assert.equal(crossCheckDescription(bad).status, 'disagree');
  const wrap = synth({ description_tr: 'x (az: 359.9°, el: 0.0°)', mastAz: 359.93, mastEl: 0 });
  assert.equal(crossCheckDescription(wrap).status, 'agree');
  const wrap2 = synth({ description_tr: 'x (az: 0.0°, el: 0.0°)', mastAz: 359.97, mastEl: 0 });
  assert.equal(crossCheckDescription(wrap2).status, 'agree', 'azimuth wrap-around 360 -> 0');
});

test('compass words in descriptions are NOT confirmed by the computed site azimuth for Sol 120 north-labelled shots', () => {
  assert.deepEqual(parseCompassLabel('Kuzey Ufku Navcam (az: 359.8°)'), { token: 'Kuzey', azDeg: 0 });
  assert.equal(parseCompassLabel('K-KD Yönü').azDeg, 22.5);
  assert.equal(parseCompassLabel('Hazcam'), null);
  const north = byId('NLM_0120_0677598265');
  const r = crossCheckCompassLabel(north, resolvePointing(north, OK));
  assert.equal(r.status, 'disagree');
  assert.ok(r.diffDeg > 100);
  assert.equal(crossCheckCompassLabel(north, resolvePointing(north)).status, 'pointing_unavailable');
  assert.equal(crossCheckCompassLabel(byId('CCF_0120'), null).status, 'no_compass_label');
});

test('stop matching: site/drive to Sol 120 / WB1 and Sol 164 / Roubion; unknown fails closed', () => {
  const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
  const stops = createStops({ waypoints: WAYPOINTS, toLocal: (lat, lon) => { const p = adapter.latLonToLocal(lat, lon); return { xM: p.x, yM: p.y }; } });
  assert.equal(stops.length, 2);
  assert.ok(Math.abs(stops[0].xM) < 1e-6 && Math.abs(stops[0].yM) < 1e-6);
  const dist = Math.hypot(stops[1].xM, stops[1].yM);
  assert.ok(dist > 600 && dist < 800, String(dist));
  for (const o of parsed.observations) {
    const m = matchObservationToStop(o, stops);
    assert.ok(m.matched, o.imageId);
    assert.equal(m.stop.id, o.sol === 120 ? 'sol120-wb1' : 'sol164-roubion');
    assert.equal(m.distanceM, 0);
    assert.equal(m.solMatchesStop, true);
  }
  const unknown = matchObservationToStop(synth({ site: 5, drive: '0' }), stops);
  assert.equal(unknown.matched, false);
  assert.equal(unknown.reason, 'unknown_site_drive');
  assert.equal(matchObservationToStop(null, stops).matched, false);
  assert.equal(matchObservationToStop(byId('NLM_0120'), 'nope').matched, false);
  // nearest-stop with distance
  const near = nearestStop({ xM: stops[1].xM + 3, yM: stops[1].yM + 4 }, stops);
  assert.equal(near.matched, true);
  assert.equal(near.stop.id, 'sol164-roubion');
  assert.ok(Math.abs(near.distanceM - 5) < 1e-9);
  const far = nearestStop({ xM: 300, yM: 300 }, stops);
  assert.equal(far.matched, false);
  assert.equal(far.reason, 'beyond_max_distance');
  assert.equal(nearestStop({ xM: NaN, yM: 0 }, stops).matched, false);
  assert.equal(nearestStop({ xM: 0, yM: 0 }, []).matched, false);
  assert.equal(nearestStop({ xM: 0, yM: 0 }, stops, { maxDistanceM: -1 }).matched, false);
  assert.throws(() => createStops({ waypoints: [{ id: 'nope', latDeg: 0, lonDeg: 0 }], toLocal: () => ({ xM: 0, yM: 0 }) }), RangeError);
  assert.throws(() => createStops({ waypoints: 5, toLocal: null }), TypeError);
  assert.deepEqual(Object.keys(STOP_SITE_DRIVE), ['sol120-wb1', 'sol164-roubion']);
});

test('frozen output and determinism', () => {
  const again = parseObservationManifest(JSON.parse(JSON.stringify(manifest)));
  assert.deepEqual(again, parsed);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.observations) && Object.isFrozen(parsed.observations[0]));
  assert.ok(Object.isFrozen(parsed.observations[0].attitude) && Object.isFrozen(parsed.provenance));
  const a = resolvePointing(parsed.observations[0], OK);
  const b = resolvePointing(parsed.observations[0], OK);
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.camera) && Object.isFrozen(a.local));
  assert.throws(() => { 'use strict'; parsed.observations[0].sol = 1; }, TypeError);
  assert.ok(Object.isFrozen(STOP_SITE_DRIVE));
  // input is not mutated
  const raw = syntheticRecord();
  const snapshot = JSON.stringify(raw);
  parseObservationRecord(raw);
  assert.equal(JSON.stringify(raw), snapshot);
});

test('invalid input handling never throws and reports errors', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}]) {
    const r = parseObservationRecord(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  }
  const cases = [
    { imageid: '' }, { sol: -1 }, { sol: 1.5 }, { instrument: null }, { site: 'four' }, { drive: 'abc' }, { date_taken_mars: '' },
    { credit: '' }, { attitude: '(1,0,0)' }, { attitude: '(2,0,0,0)' }, { attitude: '(a,b,c,d)' }, { attitude: null },
    { mastAz: 360 }, { mastAz: -1 }, { mastEl: 91 }, { mastAz: 'north' }, { mastAz: 10, mastEl: 'UNK' },
  ];
  for (const override of cases) {
    const r = parseObservationRecord(syntheticRecord(override));
    assert.equal(r.ok, false, JSON.stringify(override));
  }
  assert.equal(parseObservationRecord(syntheticRecord({ drive: 1250 })).observation.drive, '1250');
  assert.ok(parseObservationRecord(syntheticRecord({ imageid: 'NLM_0999_x_y' })).warnings.length === 1);
  for (const bad of [null, {}, { images: 'x' }, []]) assert.equal(parseObservationManifest(bad).ok, false);
  const mixed = parseObservationManifest({ ...manifest, images: [...manifest.images, { imageid: 'junk' }, manifest.images[0]] });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.observations.length, 12);
  assert.equal(mixed.rejected.length, 2);
  assert.ok(mixed.rejected.some((r) => r.errors.includes('duplicate imageid')));
  assert.equal(roverVectorToAzEl([0, 0, 0]), null);
  assert.equal(localDirectionToCameraAngles({ east: 0, north: 0, up: 0 }), null);
  // vector round trip
  const rt = roverVectorToAzEl(roverAzElToVector(123.4, -33.3));
  assert.ok(Math.abs(rt.azDeg - 123.4) < 1e-9 && Math.abs(rt.elDeg + 33.3) < 1e-9);
});
