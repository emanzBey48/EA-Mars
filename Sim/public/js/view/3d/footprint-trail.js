// Presentation-only footprint trail geometry (Aşama 32A). Pure CPU data: no DOM, WebGL, network or file access.
// Görsel izdir: bu veri regolit/zemin mekaniği, ayak boyu veya insan adım uzunluğu iddiası taşımaz.
import { ASTRONAUT_RIG } from './astronaut-rig.js';

export const FOOTPRINT_TRAIL_SCHEMA_VERSION = 1;
/** Floats per footprint in `instances`: x, y, zM, yawRad, side, alpha, scale, nx, ny, nz. */
export const FOOTPRINT_INSTANCE_FLOATS = 10;
/** Floats per footprint in `quads`: four corners, each x, y, zM (source metres, lifted along the normal). */
export const FOOTPRINT_QUAD_FLOATS = 12;
/** Number of perimeter points in the presentation-only boot-sole silhouette. */
export const FOOTPRINT_OUTLINE_POINT_COUNT = 16;
/** Floats per footprint in `soleContours`: centre plus the perimeter, each x, y, zM. */
export const FOOTPRINT_CONTOUR_FLOATS = (FOOTPRINT_OUTLINE_POINT_COUNT + 1) * 3;

const RIG_BOOT = ASTRONAUT_RIG.parts.leftBoot;
// Coordinates are (forward along heading, physical-left across heading), normalized to the
// footprint bounds. The narrower heel, slight arch, broad ball and rounded toe make this read
// as a boot sole while keeping all samples inside the existing bounding quad.
const SOLE_OUTLINE = Object.freeze([
  [-0.50, -0.20], [-0.46, -0.31], [-0.32, -0.38], [-0.12, -0.31],
  [0.08, -0.39], [0.29, -0.36], [0.43, -0.28], [0.50, -0.15],
  [0.50, 0.15], [0.43, 0.28], [0.29, 0.36], [0.08, 0.39],
  [-0.12, 0.31], [-0.32, 0.38], [-0.46, 0.31], [-0.50, 0.20],
]);

/**
 * Tasarım/senaryo parametreleri. Hiçbiri biyomekanik ya da insan ölçüsü değildir.
 * - strideLengthM: rig'in görsel stride sabiti (ASTRONAUT_RIG.metadata.presentationStrideLengthM).
 *   Ayak izi aralığı = stride / 2; her ayak bir tam stride'da bir temas eder.
 * - lateralOffsetM: rig bot merkezinin yanal ofseti (görsel).
 * - footprintLengthM / footprintWidthM: rig bot boyutu (görsel).
 * - groundOffsetM: z-fighting önleme ofseti, zemin normali yönünde (metre).
 * - capacity: halka tampon üst sınırı (senaryo değeri).
 * - fadeSeconds: iz ömrü, senaryo saniyesi (timeS; 8x zaman ölçeğinde yaklaşık duvar saatinin 8 katı).
 * - landingBaseScale / landingExtraScale: tek iniş yamasının ölçeği; extra * landingRecoveryFrac ile şiddetlenir.
 * - maxGaitStepM: tek güncellemede bu aşılırsa süreksizlik (sıçrama/teleport) sayılır, iz üretilmez.
 * - maxTeleportM: tek güncellemede yatay konum sıçraması eşiği.
 */
export const FOOTPRINT_DEFAULTS = Object.freeze({
  strideLengthM: ASTRONAUT_RIG.metadata.presentationStrideLengthM,
  lateralOffsetM: Math.abs(RIG_BOOT.center[0]),
  footprintLengthM: RIG_BOOT.size[1],
  footprintWidthM: RIG_BOOT.size[0],
  groundOffsetM: 0.01,
  capacity: 400,
  fadeSeconds: 120,
  landingBaseScale: 1.6,
  landingExtraScale: 0.8,
  maxGaitStepM: 2 * ASTRONAUT_RIG.metadata.presentationStrideLengthM,
  maxTeleportM: 4,
});

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp01 = (value) => Math.max(0, Math.min(1, value));

function requireFinite(name, value) {
  if (!isFiniteNumber(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function requirePositive(name, value) {
  requireFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function resolveConfig(options) {
  const c = { ...FOOTPRINT_DEFAULTS, ...options };
  requirePositive('strideLengthM', c.strideLengthM);
  requirePositive('footprintLengthM', c.footprintLengthM);
  requirePositive('footprintWidthM', c.footprintWidthM);
  requirePositive('fadeSeconds', c.fadeSeconds);
  requirePositive('landingBaseScale', c.landingBaseScale);
  requirePositive('maxGaitStepM', c.maxGaitStepM);
  requirePositive('maxTeleportM', c.maxTeleportM);
  requireFinite('lateralOffsetM', c.lateralOffsetM);
  requireFinite('groundOffsetM', c.groundOffsetM);
  requireFinite('landingExtraScale', c.landingExtraScale);
  if (c.lateralOffsetM < 0) throw new RangeError('lateralOffsetM must not be negative');
  if (c.groundOffsetM < 0) throw new RangeError('groundOffsetM must not be negative');
  if (c.landingExtraScale < 0) throw new RangeError('landingExtraScale must not be negative');
  if (!Number.isInteger(c.capacity) || c.capacity < 1) throw new RangeError('capacity must be a positive integer');
  return Object.freeze(c);
}

function resolveDisplay(displayConfig) {
  if (displayConfig === null || displayConfig === undefined) return null;
  requireFinite('displayConfig.referenceElevationM', displayConfig.referenceElevationM);
  requirePositive('displayConfig.verticalScale', displayConfig.verticalScale);
  return Object.freeze({
    referenceElevationM: displayConfig.referenceElevationM,
    verticalScale: displayConfig.verticalScale,
  });
}

function buildMeta(config, display) {
  const exaggerated = display !== null && display.verticalScale !== 1;
  return deepFreeze({
    schemaVersion: FOOTPRINT_TRAIL_SCHEMA_VERSION,
    kind: 'presentation-only footprint trail (görsel iz)',
    units: {
      xM: 'local metres (x east, y north)',
      zM: 'Mars 2000 metres, source elevation (not display units)',
      yawRad: 'radians, simulation heading convention',
      alpha: 'fraction 0..1 (1 = fresh)',
      scale: 'multiplier of the footprint size',
      normal: 'unit vector with nz > 0',
    },
    layout: {
      instances: 'x, y, zM, yawRad, side, alpha, scale, nx, ny, nz (FOOTPRINT_INSTANCE_FLOATS per footprint)',
      quads: 'corners c0..c3 as x, y, zM (FOOTPRINT_QUAD_FLOATS per footprint); order (-a,-b), (+a,-b), (+a,+b), (-a,+b) in (heading-along, physical-left) axes',
      soleContours: 'centre plus 16 boot-sole perimeter points as x, y, zM; toe points along +heading; source metres with groundOffsetM lift',
    },
    side: '+1 = physical left of the heading, -1 = physical right, 0 = centred landing patch. Footprints alternate over the placed footprints; the first one after a reset follows the gait schedule (footfall k even = left).',
    parameters: config,
    display,
    verticalExaggerated: exaggerated,
    verticalExaggerationLabel: exaggerated ? `görsel dikey abartı ×${display.verticalScale}` : null,
    verticalScaleApplied: false,
    caveats: [
      'Görsel iz; regolit, zemin mekaniği veya iz derinliği iddiası değildir.',
      'Ayak yerleşimi rig sabitlerinden türetilmiş görsel varsayımdır; insan adım uzunluğu değildir.',
      'Kot kaynak Mars 2000 metresidir (zM); görsel dikey ölçek bu modülde uygulanmaz, renderer uygular.',
      'No-data veya bilinmeyen köşesi olan yama üretilmez; zemin uydurulmaz, 0 kot kullanılmaz.',
    ],
  });
}

/**
 * Creates a bounded, deterministic footprint trail. The caller owns the clock (`timeS`) and the
 * player state; the trail holds only its own ring of footprints and counters.
 *
 * @param {object} options
 * @param {(xM:number, yM:number) => {status:string, value?:number|null}} options.sampleElevation
 *   Injected surface sampler in local metres. Same shape as `GridElevationLayer.sampleElevation`
 *   (used by view/route-guidance.js). Only `status === 'ok'` with a finite `value` is usable.
 * @param {{referenceElevationM:number, verticalScale:number}|null} [options.displayConfig]
 *   Optional display config. It is echoed in metadata only; positions stay in source metres.
 * @param {number} [options.capacity] ring capacity (default FOOTPRINT_DEFAULTS.capacity)
 * @param {number} [options.strideLengthM] visual stride; footfall spacing is stride / 2
 * @param {number} [options.lateralOffsetM] footprint centre offset from the heading line
 * @param {number} [options.footprintLengthM] along-heading size at scale 1
 * @param {number} [options.footprintWidthM] across-heading size at scale 1
 * @param {number} [options.groundOffsetM] lift along the surface normal (z-fighting guard)
 * @param {number} [options.fadeSeconds] footprint lifetime in scenario seconds
 * @param {number} [options.landingBaseScale]
 * @param {number} [options.landingExtraScale]
 * @param {number} [options.maxGaitStepM] gait jumps larger than this are discontinuities
 * @param {number} [options.maxTeleportM] position jumps larger than this are discontinuities
 */
export function createFootprintTrail({ sampleElevation, displayConfig = null, ...options } = {}) {
  if (typeof sampleElevation !== 'function') {
    throw new TypeError('sampleElevation(xM, yM) returning {status, value} is required');
  }
  const config = resolveConfig(options);
  const display = resolveDisplay(displayConfig);
  const meta = buildMeta(config, display);
  const halfStepM = config.strideLengthM / 2;

  let items = [];          // oldest -> newest; bornS is non-decreasing so expiry is a prefix
  let counters = freshCounters();
  let anchor = null;       // { gaitDistanceM, xM, yM } last accepted state
  let nextFootfallIndex = 0;
  let lastFootSide = null; // side of the last footprint actually placed (landing patches excluded)
  let wasAirborne = false;
  let lastTimeS = null;

  function freshCounters() {
    return {
      footfalls: 0,
      landings: 0,
      skippedUnknown: 0,
      skippedAirborne: 0,
      skippedNotGrounded: 0,
      evicted: 0,
      expired: 0,
      gaitResets: 0,
      discontinuities: 0,
      clockResets: 0,
    };
  }

  function clearState() {
    items = [];
    anchor = null;
    nextFootfallIndex = 0;
    lastFootSide = null;
    wasAirborne = false;
    lastTimeS = null;
  }

  // Smallest k >= 0 with (k + 1/2) * halfStep > gaitDistanceM. Footfall k sits at (k + 1/2) * halfStep.
  function firstFootfallIndexAfter(gaitDistanceM) {
    return Math.max(0, Math.floor(gaitDistanceM / halfStepM - 0.5) + 1);
  }

  function reanchor(state) {
    anchor = { gaitDistanceM: state.gaitDistanceM, xM: state.xM, yM: state.yM };
    nextFootfallIndex = firstFootfallIndexAfter(state.gaitDistanceM);
  }

  function expire(timeS) {
    let drop = 0;
    while (drop < items.length && timeS - items[drop].bornS >= config.fadeSeconds) drop++;
    if (drop > 0) {
      items = items.slice(drop);
      counters.expired += drop;
    }
  }

  /**
   * Places a boot-sole decal and its legacy bounding quad at (cxM, cyM), oriented along heading.
   * Returns false when any bounding, centre or perimeter sample is unknown.
   */
  function placeFootprint({ cxM, cyM, headingRad, side, scale, bornS }) {
    const a = config.footprintLengthM * scale;
    const b = config.footprintWidthM * scale;
    const ux = Math.cos(headingRad);
    const uy = Math.sin(headingRad);
    const vx = -uy; // physical left of the heading
    const vy = ux;
    const hax = (a / 2) * ux, hay = (a / 2) * uy;
    const hbx = (b / 2) * vx, hby = (b / 2) * vy;
    const corners = [
      [cxM - hax - hbx, cyM - hay - hby],
      [cxM + hax - hbx, cyM + hay - hby],
      [cxM + hax + hbx, cyM + hay + hby],
      [cxM - hax + hbx, cyM - hay + hby],
    ];
    const z = [];
    for (const [x, y] of corners) {
      const sample = sampleElevation(x, y);
      if (!sample || sample.status !== 'ok' || !isFiniteNumber(sample.value)) return false;
      z.push(sample.value);
    }

    // Normal from three corners: along edge c0->c1 and across edge c0->c3.
    const e1 = [corners[1][0] - corners[0][0], corners[1][1] - corners[0][1], z[1] - z[0]];
    const e2 = [corners[3][0] - corners[0][0], corners[3][1] - corners[0][1], z[3] - z[0]];
    let n = cross(e1, e2);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (!(len > 1e-12)) return false;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];

    const lift = config.groundOffsetM;
    const quad = new Float64Array(FOOTPRINT_QUAD_FLOATS);
    for (let i = 0; i < 4; i++) {
      quad[i * 3] = corners[i][0] + n[0] * lift;
      quad[i * 3 + 1] = corners[i][1] + n[1] * lift;
      quad[i * 3 + 2] = z[i] + n[2] * lift;
    }
    const soleContours = new Float64Array(FOOTPRINT_CONTOUR_FLOATS);
    const centreSample = sampleElevation(cxM, cyM);
    if (!centreSample || centreSample.status !== 'ok' || !isFiniteNumber(centreSample.value)) return false;
    soleContours[0] = cxM + n[0] * lift;
    soleContours[1] = cyM + n[1] * lift;
    soleContours[2] = centreSample.value + n[2] * lift;
    for (let i = 0; i < SOLE_OUTLINE.length; i++) {
      const [along, across] = SOLE_OUTLINE[i];
      const x = cxM + along * a * ux + across * b * vx;
      const y = cyM + along * a * uy + across * b * vy;
      const sample = sampleElevation(x, y);
      if (!sample || sample.status !== 'ok' || !isFiniteNumber(sample.value)) return false;
      const offset = (i + 1) * 3;
      soleContours[offset] = x + n[0] * lift;
      soleContours[offset + 1] = y + n[1] * lift;
      soleContours[offset + 2] = sample.value + n[2] * lift;
    }
    items.push({
      bornS,
      xM: cxM,
      yM: cyM,
      zM: (z[0] + z[1] + z[2] + z[3]) / 4,
      yawRad: headingRad,
      side,
      scale,
      normal: n,
      quad,
      soleContours,
    });
    if (items.length > config.capacity) {
      items.shift();
      counters.evicted++;
    }
    return true;
  }

  /**
   * Advances the trail with the current player state.
   * @param {{timeS:number, xM:number, yM:number, headingRad:number, gaitDistanceM:number,
   *   grounded:boolean, airborne?:boolean, landingRecoveryFrac?:number}} input
   *   `gaitDistanceM` is cumulative horizontal distance (sim `distanceWalkedM` / snapshot
   *   `astronaut.movement.gaitDistanceM`). `timeS` is scenario time (`simTimeS`), which does not
   *   advance while paused, so a paused trail does not age.
   */
  function update(input) {
    if (!input || typeof input !== 'object') throw new TypeError('update requires an input object');
    const timeS = requireFinite('timeS', input.timeS);
    const xM = requireFinite('xM', input.xM);
    const yM = requireFinite('yM', input.yM);
    const headingRad = requireFinite('headingRad', input.headingRad);
    const gaitDistanceM = requireFinite('gaitDistanceM', input.gaitDistanceM);
    const grounded = input.grounded === true;
    const airborne = input.airborne === true;
    const landingFrac = isFiniteNumber(input.landingRecoveryFrac) ? clamp01(input.landingRecoveryFrac) : 1;

    if (lastTimeS !== null && timeS < lastTimeS) {
      counters.clockResets++;
      clearState();
    }
    lastTimeS = timeS;
    expire(timeS);

    const state = { timeS, xM, yM, headingRad, gaitDistanceM, grounded, airborne };
    if (anchor === null) {
      reanchor(state);
      wasAirborne = airborne;
      return;
    }

    const deltaGait = gaitDistanceM - anchor.gaitDistanceM;
    const deltaXY = Math.hypot(xM - anchor.xM, yM - anchor.yM);
    if (deltaGait < 0) {
      counters.gaitResets++;
      reanchor(state);
      wasAirborne = airborne;
      return;
    }
    if (deltaGait > config.maxGaitStepM || deltaXY > config.maxTeleportM) {
      counters.discontinuities++;
      reanchor(state);
      wasAirborne = airborne;
      return;
    }

    if (deltaGait > 0) {
      // Footfalls inside (anchor, now] are placed on the straight segment between the two samples.
      while ((nextFootfallIndex + 0.5) * halfStepM <= gaitDistanceM) {
        const d = (nextFootfallIndex + 0.5) * halfStepM;
        // Schedule parity (even: physical left) only seeds the first footprint; afterwards sides alternate
        // over the footprints actually placed, so a flight or no-data gap cannot yield two same-side prints.
        const paritySide = nextFootfallIndex % 2 === 0 ? 1 : -1;
        nextFootfallIndex++;
        if (airborne) {
          counters.skippedAirborne++;
          continue;
        }
        if (!grounded) {
          counters.skippedNotGrounded++;
          continue;
        }
        const side = lastFootSide === null ? paritySide : -lastFootSide;
        const t = (d - anchor.gaitDistanceM) / deltaGait;
        const px = anchor.xM + t * (xM - anchor.xM);
        const py = anchor.yM + t * (yM - anchor.yM);
        const cxM = px + side * config.lateralOffsetM * -Math.sin(headingRad);
        const cyM = py + side * config.lateralOffsetM * Math.cos(headingRad);
        if (placeFootprint({ cxM, cyM, headingRad, side, scale: 1, bornS: timeS })) {
          counters.footfalls++;
          lastFootSide = side;
        } else {
          counters.skippedUnknown++;
        }
      }
    }

    // Touchdown: one wider, centred patch. Its size follows the landing recovery fraction (visual only).
    if (wasAirborne && grounded && !airborne) {
      const scale = config.landingBaseScale + config.landingExtraScale * landingFrac;
      if (placeFootprint({ cxM: xM, cyM: yM, headingRad, side: 0, scale, bornS: timeS })) counters.landings++;
      else counters.skippedUnknown++;
    }

    anchor = { gaitDistanceM, xM, yM };
    wasAirborne = airborne;
  }

  /** Immutable copy of the current trail: typed arrays are fresh, oldest first. */
  function getSnapshot() {
    const n = items.length;
    const instances = new Float32Array(n * FOOTPRINT_INSTANCE_FLOATS);
    const quads = new Float32Array(n * FOOTPRINT_QUAD_FLOATS);
    const soleContours = new Float32Array(n * FOOTPRINT_CONTOUR_FLOATS);
    const nowS = lastTimeS ?? 0;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const alpha = clamp01(1 - (nowS - it.bornS) / config.fadeSeconds);
      const o = i * FOOTPRINT_INSTANCE_FLOATS;
      instances[o] = it.xM;
      instances[o + 1] = it.yM;
      instances[o + 2] = it.zM;
      instances[o + 3] = it.yawRad;
      instances[o + 4] = it.side;
      instances[o + 5] = alpha;
      instances[o + 6] = it.scale;
      instances[o + 7] = it.normal[0];
      instances[o + 8] = it.normal[1];
      instances[o + 9] = it.normal[2];
      quads.set(it.quad, i * FOOTPRINT_QUAD_FLOATS);
      soleContours.set(it.soleContours, i * FOOTPRINT_CONTOUR_FLOATS);
    }
    return Object.freeze({
      schemaVersion: FOOTPRINT_TRAIL_SCHEMA_VERSION,
      count: n,
      capacity: config.capacity,
      shapePointCount: FOOTPRINT_OUTLINE_POINT_COUNT,
      instances,
      quads,
      soleContours,
      counters: Object.freeze({ ...counters }),
      meta,
    });
  }

  /** Clears footprints, anchor state and counters. */
  function reset() {
    clearState();
    counters = freshCounters();
  }

  return Object.freeze({ update, getSnapshot, reset });
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
