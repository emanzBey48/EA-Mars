// Perseverance raw-image observation records -> local Marswalk camera pointing (Stage 22A).
// Pure module: no DOM, no network/file access, no app state. Inputs are injected.
//
// Frames (see Sim/stage22a-rover-observations-audit.md for the evidence):
//  - Rover frame: X forward, Y right, Z down. mastAz/mastEl of MAST-mounted cameras (Navcam, Mastcam-Z, SuperCam)
//    are azimuth clockwise from rover-forward and elevation positive up IN THE ROVER FRAME, not in the site frame.
//    Evidence in the API records: the camera-model A axis of NAVCAM/MCZ records has az/el within ~1 deg of mastAz/mastEl.
//  - Site frame: X north, Y east, Z down. The `attitude` quaternion (scalar-first w,x,y,z, rover -> site) reproduces
//    the roll/pitch/yaw of the matching M20_waypoints.json rows (data-verified numerically). That the site frame is
//    north-aligned and that yaw is measured clockwise from north is the standard Mars 2020 definition, supported
//    statistically by the data but not stated in it -> it is an explicit, named assumption (conventionVerified:false).
//  - Marswalk local frame: x east, y north, z up; camera.js yaw 0 = east (+X), positive yaw turns north, pitch + = up.
//
// Nothing here is live telemetry: values are archived raw-image metadata and the images are not science-calibrated.

const DEG = Math.PI / 180;

/** Name of the unverifiable-from-data convention that absolute (site/local) pointing depends on. */
export const SITE_FRAME_ASSUMPTION = 'MARS2020_SITE_FRAME_NORTH_X_EAST_Y_DOWN_Z_YAW_CLOCKWISE_FROM_NORTH';

/** camera.js clamps first-person pitch to +/-85 deg (FIRST_PERSON_*_PITCH_RAD); mirrored here only to flag clamping. */
export const FIRST_PERSON_PITCH_LIMIT_RAD = 85 * DEG;

export const OBSERVATION_DISCLAIMER =
  'Ham (raw) arşiv görüntü meta verisidir; canlı telemetri değildir ve görüntüler bilimsel olarak kalibre edilmemiştir.';

/** Mounting decides whether mastAz/mastEl describe where the camera looks. Unknown instruments fail closed. */
const MAST_INSTRUMENTS = new Set(['NAVCAM_LEFT', 'NAVCAM_RIGHT', 'MCZ_LEFT', 'MCZ_RIGHT', 'SUPERCAM_RMI']);
const BODY_INSTRUMENTS = new Set([
  'FRONT_HAZCAM_LEFT_A', 'FRONT_HAZCAM_RIGHT_A', 'FRONT_HAZCAM_LEFT_B', 'FRONT_HAZCAM_RIGHT_B',
  'REAR_HAZCAM_LEFT', 'REAR_HAZCAM_RIGHT', 'CACHECAM',
]);

/**
 * Config waypoint id -> Mars 2020 RMC (site, drive). Matched by identical lat/lon (<0.5 m) against
 * Sim/data/mars-trek/M20_waypoints.json rows 4_1250 and 6_0; photos sit at those rows.
 */
export const STOP_SITE_DRIVE = deepFreeze({
  'sol120-wb1': { site: 4, drive: '1250' },
  'sol164-roubion': { site: 6, drive: '0' },
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const normalizeDeg360 = (deg) => ((deg % 360) + 360) % 360;
const circularDiffDeg = (a, b) => Math.abs(((a - b + 540) % 360 + 360) % 360 - 180);

function wrapPi(rad) {
  const r = ((rad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return r === -Math.PI ? Math.PI : r;
}

/** "(a,b,c,d)" -> numbers or null. */
function parseTuple(text, count) {
  if (typeof text !== 'string') return null;
  const m = /^\s*\(([^()]*)\)\s*$/.exec(text);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length !== count || parts.some((s) => s === '')) return null;
  const nums = parts.map(Number);
  return nums.every(Number.isFinite) ? nums : null;
}

/** Mast angles may legitimately be absent ('', 'UNK', null) for body cameras; anything else must be numeric. */
function parseOptionalAngle(value) {
  if (value === null || value === undefined || value === '' || value === 'UNK') return { value: null, ok: true };
  const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  return Number.isFinite(n) ? { value: n, ok: true } : { value: null, ok: false };
}

/** Parses "az: 359.8°, el: -23.0°" out of a description string. Returns null when absent. */
export function parseDescriptionAzEl(description) {
  if (typeof description !== 'string') return null;
  const m = /az:\s*(-?\d+(?:\.\d+)?)\s*°?\s*,\s*el:\s*(-?\d+(?:\.\d+)?)\s*°?/i.exec(description);
  return m ? { azDeg: Number(m[1]), elDeg: Number(m[2]) } : null;
}

/**
 * Validates and normalises one raw manifest image record. Never throws.
 * @returns {{ok:boolean, observation?:object, errors:string[], warnings:string[]}} (frozen)
 */
export function parseObservationRecord(raw) {
  const errors = [];
  const warnings = [];
  if (!isObject(raw)) return deepFreeze({ ok: false, errors: ['record must be an object'], warnings });

  if (!isNonEmptyString(raw.imageid)) errors.push('imageid missing');
  if (!Number.isInteger(raw.sol) || raw.sol < 0) errors.push('sol must be a non-negative integer');
  if (!isNonEmptyString(raw.instrument)) errors.push('instrument missing');
  if (!Number.isInteger(raw.site) || raw.site < 0) errors.push('site must be a non-negative integer');
  const driveText = typeof raw.drive === 'number' ? String(raw.drive) : raw.drive;
  if (typeof driveText !== 'string' || !/^\d+$/.test(driveText)) errors.push('drive must be digits');
  if (!isNonEmptyString(raw.date_taken_mars)) errors.push('date_taken_mars (LMST) missing');
  if (!isNonEmptyString(raw.credit)) errors.push('credit missing');

  const quat = parseTuple(raw.attitude, 4);
  let attitude = null;
  if (!quat) errors.push('attitude must be a 4-number tuple');
  else {
    const norm = Math.hypot(...quat);
    if (Math.abs(norm - 1) > 1e-3) errors.push(`attitude quaternion is not unit length (${norm})`);
    else attitude = { w: quat[0], x: quat[1], y: quat[2], z: quat[3], order: 'wxyz' };
  }

  const az = parseOptionalAngle(raw.mastAz);
  const el = parseOptionalAngle(raw.mastEl);
  if (!az.ok) errors.push('mastAz is not numeric');
  if (!el.ok) errors.push('mastEl is not numeric');
  if (az.value !== null && !(az.value >= 0 && az.value < 360)) errors.push('mastAz outside [0,360)');
  if (el.value !== null && !(el.value >= -90 && el.value <= 90)) errors.push('mastEl outside [-90,90]');
  if ((az.value === null) !== (el.value === null)) errors.push('mastAz and mastEl must both be present or both absent');

  if (isNonEmptyString(raw.imageid) && Number.isInteger(raw.sol)) {
    const m = /^[A-Z0-9]{3}_(\d{4})_/.exec(raw.imageid);
    if (m && Number(m[1]) !== raw.sol) warnings.push(`sol ${raw.sol} disagrees with imageid sol ${Number(m[1])}`);
  }

  if (errors.length) return deepFreeze({ ok: false, errors, warnings, imageId: isNonEmptyString(raw.imageid) ? raw.imageid : null });

  const instrument = raw.instrument;
  const mounting = MAST_INSTRUMENTS.has(instrument) ? 'mast' : BODY_INSTRUMENTS.has(instrument) ? 'body' : 'unknown';
  if (mounting === 'mast' && az.value === null) warnings.push('mast instrument without mastAz/mastEl');
  const credit = raw.credit.trim();
  const observation = {
    imageId: raw.imageid,
    sol: raw.sol,
    instrument,
    cameraModelType: isNonEmptyString(raw.camera_model_type) ? raw.camera_model_type : (isNonEmptyString(raw.camera_name) ? raw.camera_name : null),
    mounting,
    site: raw.site,
    drive: driveText,
    lmst: raw.date_taken_mars,
    utc: isNonEmptyString(raw.date_taken_utc) ? raw.date_taken_utc : null,
    attitude,
    mastAzDeg: az.value,
    mastElDeg: el.value,
    description: typeof raw.description_tr === 'string' ? raw.description_tr : null,
    title: typeof raw.title === 'string' ? raw.title : null,
    localFile: typeof raw.localFile === 'string' ? raw.localFile : null,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : null,
    // Verbatim credit from the record; never augmented with institutions the data does not name.
    credit,
    baseCreditPresent: credit.startsWith('NASA/JPL-Caltech'),
  };
  return deepFreeze({ ok: true, observation, errors, warnings });
}

/**
 * Parses the whole manifest. Invalid records are reported, not silently dropped.
 * @returns {{ok:boolean, observations:object[], rejected:object[], errors:string[], warnings:string[], provenance:object|null}}
 */
export function parseObservationManifest(manifest) {
  if (!isObject(manifest) || !Array.isArray(manifest.images)) {
    return deepFreeze({ ok: false, observations: [], rejected: [], errors: ['manifest.images missing'], warnings: [], provenance: null });
  }
  const observations = [];
  const rejected = [];
  const warnings = [];
  const seen = new Set();
  manifest.images.forEach((raw, index) => {
    const r = parseObservationRecord(raw);
    r.warnings.forEach((w) => warnings.push(`#${index}: ${w}`));
    if (!r.ok) { rejected.push({ index, imageId: r.imageId ?? null, errors: r.errors }); return; }
    if (seen.has(r.observation.imageId)) { rejected.push({ index, imageId: r.observation.imageId, errors: ['duplicate imageid'] }); return; }
    seen.add(r.observation.imageId);
    observations.push(r.observation);
  });
  if (Number.isInteger(manifest.total_images) && manifest.total_images !== manifest.images.length) {
    warnings.push(`total_images ${manifest.total_images} != images.length ${manifest.images.length}`);
  }
  const citation = isNonEmptyString(manifest.citation) ? manifest.citation : null;
  const provenance = {
    mission: isNonEmptyString(manifest.mission) ? manifest.mission : null,
    citation,
    version: manifest.version ?? null,
    generatedAtUtc: manifest.generated_at_utc ?? null,
    disclaimer: OBSERVATION_DISCLAIMER,
    liveTelemetry: false,
    scienceCalibrated: false,
  };
  return deepFreeze({ ok: observations.length > 0 && rejected.length === 0, observations, rejected, errors: [], warnings, provenance });
}

// ---------------------------------------------------------------------------------------------------------------
// Attitude math

/** Rover -> site rotation from a unit scalar-first quaternion; roll/pitch/yaw in degrees (ZYX, yaw about +Z down). */
export function quaternionToRollPitchYawDeg({ w, x, y, z }) {
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return { rollDeg: roll / DEG, pitchDeg: pitch / DEG, yawDeg: yaw / DEG };
}

function rotateByQuaternion({ w, x, y, z }, v) {
  const [vx, vy, vz] = v;
  // t = 2 * (q.xyz x v); v' = v + w*t + q.xyz x t
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** Rover-frame az/el (az clockwise from forward, el up) -> unit vector in rover frame (X fwd, Y right, Z down). */
export function roverAzElToVector(azDeg, elDeg) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), -Math.sin(el)];
}

/** Inverse of roverAzElToVector (any non-zero vector; used to compare API camera-model axes with mastAz/mastEl). */
export function roverVectorToAzEl(v) {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (!(n > 0)) return null;
  return { azDeg: normalizeDeg360(Math.atan2(v[1], v[0]) / DEG), elDeg: Math.asin(-v[2] / n) / DEG };
}

/** Site-frame (N,E,D) vector -> Marswalk local frame (x east, y north, z up). */
export function siteVectorToLocal(v) {
  return { east: v[1], north: v[0], up: -v[2] };
}

/** Local direction -> camera.js yaw/pitch (yaw 0 = +X east, + turns toward +Y north; pitch + = up). */
export function localDirectionToCameraAngles({ east, north, up }) {
  const horiz = Math.hypot(east, north);
  const n = Math.hypot(east, north, up);
  if (!(n > 0)) return null;
  return {
    yawRad: horiz > 1e-12 ? wrapPi(Math.atan2(north, east)) : 0,
    pitchRad: Math.asin(Math.max(-1, Math.min(1, up / n))),
  };
}

/**
 * Resolves where an observation's camera looked. Fails closed (available:false + reason) when:
 *  - the instrument is body-mounted or unknown (mastAz/mastEl then describe the mast, not the camera),
 *  - mast angles are absent,
 *  - the named site-frame assumption was not explicitly accepted (absolute azimuth would be a guess).
 * Rover-frame az/el is returned whenever the instrument is mast-mounted; it needs no site-frame assumption.
 * Whenever site/local values are returned, conventionVerified is false.
 */
export function resolvePointing(observation, { acceptAssumption = null } = {}) {
  const base = { conventionVerified: false, assumption: null, roverFrame: null, siteFrame: null, local: null, camera: null };
  if (!isObject(observation) || !observation.attitude) {
    return deepFreeze({ ...base, available: false, reason: 'invalid_observation' });
  }
  if (observation.mounting !== 'mast') {
    return deepFreeze({ ...base, available: false, reason: observation.mounting === 'body' ? 'body_mounted_camera_mast_angles_not_camera_axis' : 'unknown_instrument_mounting' });
  }
  if (observation.mastAzDeg === null || observation.mastElDeg === null) {
    return deepFreeze({ ...base, available: false, reason: 'mast_angles_absent' });
  }
  const roverFrame = { azDeg: observation.mastAzDeg, elDeg: observation.mastElDeg };
  if (acceptAssumption !== SITE_FRAME_ASSUMPTION) {
    return deepFreeze({ ...base, available: false, roverFrame, reason: 'site_frame_assumption_not_accepted' });
  }
  const d = rotateByQuaternion(observation.attitude, roverAzElToVector(roverFrame.azDeg, roverFrame.elDeg));
  const siteAzEl = roverVectorToAzEl(d); // site frame: X north, Y east -> azimuth clockwise from north
  const local = siteVectorToLocal(d);
  const angles = localDirectionToCameraAngles(local);
  const pitchClamped = Math.abs(angles.pitchRad) > FIRST_PERSON_PITCH_LIMIT_RAD;
  return deepFreeze({
    available: true,
    reason: null,
    conventionVerified: false,
    assumption: SITE_FRAME_ASSUMPTION,
    roverFrame,
    siteFrame: { azDeg: siteAzEl.azDeg, elDeg: siteAzEl.elDeg },
    local,
    camera: { yawRad: angles.yawRad, pitchRad: angles.pitchRad, pitchClamped },
    roverHeadingDeg: normalizeDeg360(quaternionToRollPitchYawDeg(observation.attitude).yawDeg),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Cross-checks

/** Display strings round to 0.1 deg, so anything within 0.05 deg (+ float epsilon) counts as agreement. */
export const DESCRIPTION_ROUNDING_TOLERANCE_DEG = 0.05 + 1e-9;

/** Compares "az:/el:" in the description with the numeric mastAz/mastEl. */
export function crossCheckDescription(observation) {
  if (!isObject(observation)) return deepFreeze({ status: 'invalid_observation' });
  const parsed = parseDescriptionAzEl(observation.description);
  if (!parsed) return deepFreeze({ status: 'no_description_values', description: null });
  if (observation.mastAzDeg === null || observation.mastElDeg === null) {
    return deepFreeze({ status: 'no_numeric_fields', description: parsed });
  }
  const azDiffDeg = circularDiffDeg(parsed.azDeg, observation.mastAzDeg);
  const elDiffDeg = Math.abs(parsed.elDeg - observation.mastElDeg);
  const agree = azDiffDeg <= DESCRIPTION_ROUNDING_TOLERANCE_DEG && elDiffDeg <= DESCRIPTION_ROUNDING_TOLERANCE_DEG;
  return deepFreeze({ status: agree ? 'agree' : 'disagree', description: parsed, azDiffDeg, elDiffDeg });
}

/** Turkish compass tokens used in description_tr (longest first) with their nominal site azimuths. */
const COMPASS_TOKENS = Object.freeze([
  ['K-KD', 22.5], ['D-KD', 67.5], ['Kuzey', 0], ['Doğu', 90], ['Güney', 180], ['Batı', 270],
]);

/** Compass word in the description ("Kuzey", "K-KD", ...) or null. */
export function parseCompassLabel(description) {
  if (typeof description !== 'string') return null;
  for (const [token, azDeg] of COMPASS_TOKENS) if (description.includes(token)) return { token, azDeg };
  return null;
}

/**
 * Do the compass words in the description match the computed SITE azimuth? (Descriptions label the rover-frame
 * az as if it were a compass bearing; this reveals whether that is justified.) Needs an available pointing.
 */
export function crossCheckCompassLabel(observation, pointing, toleranceDeg = 45) {
  const label = parseCompassLabel(observation?.description);
  if (!label) return deepFreeze({ status: 'no_compass_label' });
  if (!pointing?.available) return deepFreeze({ status: 'pointing_unavailable', label });
  const diffDeg = circularDiffDeg(label.azDeg, pointing.siteFrame.azDeg);
  return deepFreeze({ status: diffDeg <= toleranceDeg ? 'agree' : 'disagree', label, siteAzDeg: pointing.siteFrame.azDeg, diffDeg });
}

// ---------------------------------------------------------------------------------------------------------------
// Stop matching

/**
 * Builds stop descriptors in local metres. `toLocal(latDeg, lonDeg) -> {xM, yM}` is injected (geo.js projection
 * relative to the scenario origin). `siteDriveById` defaults to the audited STOP_SITE_DRIVE table.
 */
export function createStops({ waypoints, toLocal, siteDriveById = STOP_SITE_DRIVE }) {
  if (!Array.isArray(waypoints) || typeof toLocal !== 'function') throw new TypeError('waypoints array and toLocal function are required');
  return deepFreeze(waypoints.map((wp) => {
    const key = siteDriveById[wp?.id];
    if (!key) throw new RangeError(`no site/drive mapping for waypoint ${wp?.id}`);
    const { xM, yM } = toLocal(wp.latDeg, wp.lonDeg);
    if (![xM, yM].every(Number.isFinite)) throw new RangeError(`non-finite local position for ${wp.id}`);
    return { id: wp.id, label: wp.label ?? wp.id, sol: wp.sol, site: key.site, drive: String(key.drive), xM, yM };
  }));
}

/** Exact (site, drive) match. Unknown site/drive -> matched:false (fail closed), never nearest-guessing. */
export function matchObservationToStop(observation, stops) {
  if (!isObject(observation) || !Array.isArray(stops)) return deepFreeze({ matched: false, reason: 'invalid_input' });
  const stop = stops.find((s) => s.site === observation.site && String(s.drive) === observation.drive);
  if (!stop) return deepFreeze({ matched: false, reason: 'unknown_site_drive', site: observation.site, drive: observation.drive });
  return deepFreeze({ matched: true, method: 'site_drive', stop, distanceM: 0, solMatchesStop: stop.sol === observation.sol });
}

/** Nearest stop to a local point; null match beyond maxDistanceM (default 50 m) or for non-finite input. */
export function nearestStop(point, stops, { maxDistanceM = 50 } = {}) {
  if (!isObject(point) || !Number.isFinite(point.xM) || !Number.isFinite(point.yM) || !Array.isArray(stops) || !stops.length
    || !Number.isFinite(maxDistanceM) || maxDistanceM < 0) {
    return deepFreeze({ matched: false, reason: 'invalid_input' });
  }
  let best = null;
  for (const stop of stops) {
    const distanceM = Math.hypot(stop.xM - point.xM, stop.yM - point.yM);
    if (!best || distanceM < best.distanceM) best = { stop, distanceM };
  }
  if (best.distanceM > maxDistanceM) return deepFreeze({ matched: false, reason: 'beyond_max_distance', nearestId: best.stop.id, distanceM: best.distanceM });
  return deepFreeze({ matched: true, method: 'nearest', stop: best.stop, distanceM: best.distanceM });
}
