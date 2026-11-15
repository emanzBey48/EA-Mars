// Simulation core: player state, scenario clock, route progress and corridor deviation.
// Works purely in the local metre plane (x east, y north). No DOM, no screen coordinates.
import { pointToSegment } from '../geo/geo.js';
import { toGeologySnapshot } from '../geo/geology.js';

const EMPTY_GEOLOGY_SNAPSHOT = toGeologySnapshot(null, null);

export const PHASE = Object.freeze({ READY: 'ready', RUNNING: 'running', PAUSED: 'paused', ARRIVED: 'arrived' });

/**
 * Flight clock scale. Missing (undefined/null) keeps the walking clock, i.e. no slowdown.
 * Otherwise it must be finite and within [1, timeScale]; anything else is a configuration error and throws.
 */
export function resolveAirborneTimeScale(scenario) {
  const base = scenario.timeScale;
  const air = scenario.airborneTimeScale ?? base;
  if (!Number.isFinite(air) || air < 1 || air > base) {
    throw new RangeError(`airborneTimeScale must be finite and within [1, timeScale=${base}]; got ${air}`);
  }
  return air;
}

/** Smoothing time constant (wall seconds) for clock-scale changes. Missing means an instant switch (0). */
export function resolveClockSmoothingWallS(scenario) {
  const tau = scenario.timeScaleSmoothingWallS ?? 0;
  if (!Number.isFinite(tau) || tau < 0) {
    throw new RangeError(`timeScaleSmoothingWallS must be finite and >= 0; got ${tau}`);
  }
  return tau;
}

export class MarswalkSim {
  /**
   * @param {{a:{x:number,y:number}, b:{x:number,y:number}}} route  finite straight segment in local metres
   * @param {object} scenario  see config.js SCENARIO
   */
  constructor(route, scenario) {
    this.route = route;
    this.scenario = { ...scenario };
    this.airborneTimeScale = resolveAirborneTimeScale(scenario);
    this.clockSmoothingWallS = resolveClockSmoothingWallS(scenario);
    this.corridorHalfWidthM = scenario.corridorHalfWidthM;
    const pad = scenario.roamLimitM;
    this.bounds = {
      xMin: Math.min(route.a.x, route.b.x) - pad, xMax: Math.max(route.a.x, route.b.x) + pad,
      yMin: Math.min(route.a.y, route.b.y) - pad, yMax: Math.max(route.a.y, route.b.y) + pad,
    };
    this.restart();
  }

  restart() {
    this.phase = PHASE.READY;
    this.pos = { x: this.route.a.x, y: this.route.a.y };
    this.headingRad = Math.atan2(this.route.b.y - this.route.a.y, this.route.b.x - this.route.a.x);
    this.simTimeS = 0;
    this.distanceWalkedM = 0;
    this.verticalSpeedMps = 0;
    this.grounded = false;
    this.airborne = false; // active ballistic motion, separate from whether current DTM contact is known
    this.landingRecovery = false;
    this.landingRecoveryTimerS = 0;
    this.bodyWorldZReferenceM = null;
    this.heightAboveReferenceM = 0;
    this.horizontalVelocityXMps = 0;
    this.horizontalVelocityYMps = 0;
    this.timeScaleEffective = this.scenario.timeScale; // current smoothed scenario-clock scale (sim s per wall s)
    this.trail = [{ x: this.pos.x, y: this.pos.y }];
  }

  /**
   * Advances the scenario clock by `dt` wall seconds and returns the simulated seconds elapsed.
   * The scale relaxes exponentially from its current value toward `airborneTimeScale` (flight clock)
   * or `timeScale` (walking clock) with time constant `clockSmoothingWallS`. The returned value is the exact
   * integral of that relaxation over the step, so the simulated time depends only on wall time, not on
   * how it is split into frames. Physics runs in simulated seconds and is not affected by the clock choice.
   */
  advanceSimClock(dt, flightClock) {
    const target = flightClock ? this.airborneTimeScale : this.scenario.timeScale;
    const tau = this.clockSmoothingWallS;
    const s0 = this.timeScaleEffective;
    const k = tau > 0 ? -Math.expm1(-dt / tau) : 1; // 1 - exp(-dt / tau)
    const dtSim = target * dt + (s0 - target) * tau * k;
    this.timeScaleEffective = target + (s0 - target) * (1 - k);
    return dtSim;
  }

  togglePause() {
    if (this.phase === PHASE.RUNNING) this.phase = PHASE.PAUSED;
    else if (this.phase === PHASE.PAUSED) this.phase = PHASE.RUNNING;
    return this.phase;
  }

  setCorridorHalfWidth(m) {
    const v = Number(m);
    if (!Number.isFinite(v)) return this.corridorHalfWidthM;
    this.corridorHalfWidthM = Math.min(this.scenario.corridorHalfWidthMaxM, Math.max(this.scenario.corridorHalfWidthMinM, v));
    return this.corridorHalfWidthM;
  }

  setRoute(route) {
    if (!route?.a || !route?.b || !Number.isFinite(route.a.x) || !Number.isFinite(route.a.y) || !Number.isFinite(route.b.x) || !Number.isFinite(route.b.y)) return;
    this.route = { a: { x: route.a.x, y: route.a.y }, b: { x: route.b.x, y: route.b.y } };
    const pad = this.scenario.roamLimitM;
    this.bounds = {
      xMin: Math.min(this.route.a.x, this.route.b.x) - pad,
      xMax: Math.max(this.route.a.x, this.route.b.x) + pad,
      yMin: Math.min(this.route.a.y, this.route.b.y) - pad,
      yMax: Math.max(this.route.a.y, this.route.b.y) + pad,
    };
    this.restart();
  }

  /** Scenario speed in local metres per wall-clock second. */
  get metresPerWallSecond() { return this.scenario.walkSpeedMps * this.scenario.timeScale; }

  /**
   * Advances the simulation by dtWall wall-clock seconds.
   * @param {number} dtWall
   * @param {{up?:boolean,down?:boolean,left?:boolean,right?:boolean}} input
   */
  step(dtWall, input = {}) {
    const dt = Math.max(0, Math.min(0.1, dtWall)); // clamp large frame gaps (tab switch etc.)
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iy = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const moving = ix !== 0 || iy !== 0;
    if (this.phase === PHASE.READY && moving) this.phase = PHASE.RUNNING;
    if (this.phase !== PHASE.RUNNING) return;

    this.simTimeS += dt * this.scenario.timeScale;
    if (moving) {
      const n = Math.hypot(ix, iy);
      const d = this.metresPerWallSecond * dt;
      const nx = Math.min(this.bounds.xMax, Math.max(this.bounds.xMin, this.pos.x + (ix / n) * d));
      const ny = Math.min(this.bounds.yMax, Math.max(this.bounds.yMin, this.pos.y + (iy / n) * d));
      this.distanceWalkedM += Math.hypot(nx - this.pos.x, ny - this.pos.y);
      this.pos.x = nx; this.pos.y = ny;
      this.headingRad = Math.atan2(iy, ix);
      const last = this.trail[this.trail.length - 1];
      if (Math.hypot(last.x - nx, last.y - ny) > 2) this.trail.push({ x: nx, y: ny });
    }
    const m = this.metrics();
    if (m.distToEndM <= this.scenario.arrivalRadiusM) this.phase = PHASE.ARRIVED;
  }

  /**
   * Advances first-person motion using a camera-relative horizontal direction and the most
   * recently sampled surface value supplied by the composition root. This module never queries
   * a layer/provider itself. `bodyWorldZReferenceM` is a retained Mars-world-Z origin only; it is
   * not a replacement for the current sample when that sample is unknown.
   *
   * @param {number} dtWall wall-clock delta in seconds
   * @param {{moveX?:number,moveY?:number,jump?:boolean,headingRad?:number}} input normalized local-world input
   * @param {{status?:string,value?:number|null}} surface most recent elevation sample at current pos
   */
  stepFirstPerson(dtWall, input = {}, surface = {}) {
    const dt = Math.max(0, Math.min(0.1, dtWall));
    const moveX = Number.isFinite(input.moveX) ? input.moveX : 0;
    const moveY = Number.isFinite(input.moveY) ? input.moveY : 0;
    const moveLength = Math.hypot(moveX, moveY);
    const moving = moveLength > 0;

    if (this.phase === PHASE.PAUSED) return;
    if (this.phase === PHASE.ARRIVED) {
      this.horizontalVelocityXMps = 0;
      this.horizontalVelocityYMps = 0;
      return;
    }

    const sampleKnown = this.resolveSurfaceContact(surface);

    if (this.phase === PHASE.READY && (moving || input.jump)) this.phase = PHASE.RUNNING;
    if (this.phase !== PHASE.RUNNING) return;

    if (Number.isFinite(input.headingRad)) this.headingRad = input.headingRad;

    // Flight clock: slowed while airborne, during landing recovery, and for a jump that starts this frame.
    // The jump predicate mirrors the jump block below; landingRecovery here is the start-of-frame value, and
    // the recovery timer is inert while that flag is false, so the two agree.
    const jumpStarts = Boolean(input.jump) && this.grounded && !this.landingRecovery && sampleKnown && this.bodyWorldZReferenceM !== null;
    const dtSim = this.advanceSimClock(dt, this.airborne || this.landingRecovery || jumpStarts);

    // Landing recovery timer: elapsed in scenario time
    if (this.landingRecovery && dtSim > 0) {
      this.landingRecoveryTimerS = Math.max(0, this.landingRecoveryTimerS - dtSim);
      if (this.landingRecoveryTimerS <= 0) {
        this.landingRecovery = false;
        this.landingRecoveryTimerS = 0;
      }
    }

    if (input.jump && this.grounded && !this.landingRecovery && sampleKnown && this.bodyWorldZReferenceM !== null) {
      this.verticalSpeedMps = this.scenario.jumpImpulseMps;
      this.grounded = false;
      this.airborne = true;
      if (moving) {
        const speed = this.scenario.walkSpeedMps;
        this.horizontalVelocityXMps = (moveX / moveLength) * speed;
        this.horizontalVelocityYMps = (moveY / moveLength) * speed;
      }
    }

    if (this.airborne && this.bodyWorldZReferenceM !== null && dtSim > 0) {
      const previousVerticalSpeedMps = this.verticalSpeedMps;
      this.verticalSpeedMps -= this.scenario.marsGravityMps2 * dtSim;
      this.heightAboveReferenceM += (previousVerticalSpeedMps + this.verticalSpeedMps) * 0.5 * dtSim;
      if (this.heightAboveReferenceM <= 0 && sampleKnown) {
        this.heightAboveReferenceM = 0;
        this.verticalSpeedMps = 0;
        this.grounded = true;
        this.airborne = false;
        const recDur = this.scenario.landingRecoveryDurationS ?? 0.25;
        if (recDur > 0) {
          this.landingRecovery = true;
          this.landingRecoveryTimerS = recDur;
        } else {
          this.landingRecovery = false;
          this.landingRecoveryTimerS = 0;
        }
      }
    }

    this.simTimeS += dtSim;

    if (this.airborne) {
      // In ballistic flight, horizontal velocity is conserved; mid-air braking is unphysical without thrusters.
    } else if (this.landingRecovery) {
      // During landing recovery, ground velocity smoothly equalizes toward commanded ground input
      const targetSpeed = moving ? this.scenario.walkSpeedMps : 0;
      const targetVx = moving ? (moveX / moveLength) * targetSpeed : 0;
      const targetVy = moving ? (moveY / moveLength) * targetSpeed : 0;
      const recDur = this.scenario.landingRecoveryDurationS ?? 0.25;
      const blendFactor = recDur > 0 ? Math.min(1, Math.max(0, dtSim / recDur)) : 1;
      this.horizontalVelocityXMps += (targetVx - this.horizontalVelocityXMps) * blendFactor;
      this.horizontalVelocityYMps += (targetVy - this.horizontalVelocityYMps) * blendFactor;
    } else if (moving && dtSim > 0) {
      const nx = moveX / moveLength, ny = moveY / moveLength;
      const speed = this.scenario.walkSpeedMps;
      this.horizontalVelocityXMps = nx * speed;
      this.horizontalVelocityYMps = ny * speed;
    } else {
      this.horizontalVelocityXMps = 0;
      this.horizontalVelocityYMps = 0;
    }

    const currentSpeed = this.horizontalSpeedMps;
    if (currentSpeed > 0 && dtSim > 0) {
      const dx = this.horizontalVelocityXMps * dtSim;
      const dy = this.horizontalVelocityYMps * dtSim;
      const nextX = Math.min(this.bounds.xMax, Math.max(this.bounds.xMin, this.pos.x + dx));
      const nextY = Math.min(this.bounds.yMax, Math.max(this.bounds.yMin, this.pos.y + dy));
      this.distanceWalkedM += Math.hypot(nextX - this.pos.x, nextY - this.pos.y);
      this.pos.x = nextX;
      this.pos.y = nextY;
      const last = this.trail[this.trail.length - 1];
      if (Math.hypot(last.x - nextX, last.y - nextY) > 2) this.trail.push({ x: nextX, y: nextY });
    }
    const m = this.metrics();
    if (m.distToEndM <= this.scenario.arrivalRadiusM) {
      this.phase = PHASE.ARRIVED;
      this.horizontalVelocityXMps = 0;
      this.horizontalVelocityYMps = 0;
    }
  }

  /** Reconciles body motion with a fresh sample injected by the composition root. */
  resolveSurfaceContact(surface = {}) {
    const hasKnownSurface = surface.status === 'ok' && Number.isFinite(surface.value);
    // Paused first-entry frames may establish the one-time world-Z origin needed to construct the 3D view.
    // Once anchored, paused contact remains frozen; unknown samples never seed an origin.
    if (this.phase === PHASE.PAUSED) {
      if (this.bodyWorldZReferenceM !== null || !hasKnownSurface) return false;
      this.bodyWorldZReferenceM = surface.value;
      this.heightAboveReferenceM = 0;
      this.grounded = true;
      this.airborne = false;
      return true;
    }
    if (hasKnownSurface) {
      if (this.bodyWorldZReferenceM === null) {
        this.bodyWorldZReferenceM = surface.value;
        this.heightAboveReferenceM = 0;
        this.grounded = true;
        this.airborne = false;
      } else if (this.grounded) {
        this.bodyWorldZReferenceM = surface.value;
        this.heightAboveReferenceM = 0;
        this.airborne = false;
      } else {
        const bodyWorldZM = this.bodyWorldZReferenceM + this.heightAboveReferenceM;
        this.bodyWorldZReferenceM = surface.value;
        this.heightAboveReferenceM = bodyWorldZM - surface.value;
        if (this.heightAboveReferenceM > 0) {
          // A valid, lower surface confirms the retained body position is above ground.
          this.airborne = true;
        } else {
          const wasAirborne = this.airborne;
          this.heightAboveReferenceM = 0;
          this.verticalSpeedMps = 0;
          this.grounded = true;
          this.airborne = false;
          if (wasAirborne) {
            const recDur = this.scenario.landingRecoveryDurationS ?? 0.25;
            if (recDur > 0) {
              this.landingRecovery = true;
              this.landingRecoveryTimerS = recDur;
            } else {
              this.landingRecovery = false;
              this.landingRecoveryTimerS = 0;
            }
          }
        }
      }
      return true;
    }
    // Keep an existing world-Z origin for an airborne trajectory; it is never current ground.
    this.grounded = false;
    return false;
  }

  get horizontalSpeedMps() {
    return Math.hypot(this.horizontalVelocityXMps, this.horizontalVelocityYMps);
  }

  get landingRecoveryFrac() {
    const dur = this.scenario.landingRecoveryDurationS;
    if (!this.landingRecovery || !dur || dur <= 0) return 0;
    return Math.max(0, Math.min(1, this.landingRecoveryTimerS / dur));
  }

  get bodyWorldZM() {
    return this.bodyWorldZReferenceM === null ? null : this.bodyWorldZReferenceM + this.heightAboveReferenceM;
  }

  /** Teleport (used by tests / debugging only). */
  setPosition(x, y) { this.pos = { x, y }; }

  metrics() {
    const { a, b } = this.route;
    const s = pointToSegment(this.pos.x, this.pos.y, a.x, a.y, b.x, b.y);
    return {
      routeLengthM: s.length,
      deviationM: s.distance, // shortest horizontal distance to the FINITE segment, metres
      outsideCorridor: s.distance > this.corridorHalfWidthM,
      corridorHalfWidthM: this.corridorHalfWidthM,
      progressM: s.t * s.length, // along-route position of the closest point
      progressFrac: s.t,
      distToEndM: Math.hypot(this.pos.x - b.x, this.pos.y - b.y),
      closestPoint: { xM: s.closest.x, yM: s.closest.y },
    };
  }
}

/** Recursively freezes plain objects and arrays so consumers cannot mutate a snapshot. */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Produces a copied, deeply immutable WorldSnapshot / RenderFrame for the current simulation step.
 * - `zM` is the Mars 2000 surface elevation (NOT astronaut body height); `null` whenever status !== 'ok' (never 0).
 * - Consumers (HUD, renderer) read exclusively from this snapshot and cannot mutate live simulation state.
 */
export function createWorldSnapshot({
  sim, surfaceProvider, adapter, waypoints = [], routeNote = '',
  geology = EMPTY_GEOLOGY_SNAPSHOT, geologyLayerStatus = 'unavailable', geologyContactDistanceM = null,
}) {
  const xM = sim.pos.x;
  const yM = sim.pos.y;
  const m = sim.metrics();
  const ll = adapter ? adapter.localToLatLon(xM, yM) : { latDeg: null, lonDeg: null };
  const surf = surfaceProvider
    ? surfaceProvider.sampleSurface(xM, yM)
    : {
      elevation: { status: 'unavailable', value: null, unit: 'm', verticalDatum: null, source: null, method: null, cell: null, reason: 'Yüzey sağlayıcı yok' },
      slope: { status: 'unavailable', value: null, unit: '°', verticalDatum: null, source: null, method: null, window: '3×3', cell: null, reason: 'Yüzey sağlayıcı yok' },
      zM: null,
      status: 'unavailable',
    };

  const cloneSample = (s) => ({
    status: s.status,
    value: s.status === 'ok' && Number.isFinite(s.value) ? s.value : null,
    unit: s.unit ?? null,
    verticalDatum: s.verticalDatum ?? null,
    source: s.source ?? null,
    method: s.method ?? null,
    window: s.window ?? null,
    cellSizeM: s.cellSizeM ?? null,
    cell: s.cell ? { row: s.cell.row, col: s.cell.col } : null,
    dzdx: s.dzdx ?? null,
    dzdy: s.dzdy ?? null,
    reason: s.reason ?? null,
  });

  const elevation = cloneSample(surf.elevation);
  const slope = cloneSample(surf.slope);
  const zM = elevation.status === 'ok' ? elevation.value : null;

  const snapshot = {
    phase: sim.phase,
    simTimeS: sim.simTimeS,
    distanceWalkedM: sim.distanceWalkedM,
    astronaut: {
      xM,
      yM,
      headingRad: sim.headingRad,
      zM, // Mars 2000 surface elevation in metres, or null (never 0 on missing data; not body height)
      zDatum: elevation.verticalDatum,
      elevationStatus: elevation.status,
      bodyWorldZM: Number.isFinite(sim.bodyWorldZM) ? sim.bodyWorldZM : null,
      movement: {
        timeS: sim.simTimeS,
        horizontalSpeedMps: sim.horizontalSpeedMps,
        verticalSpeedMps: sim.verticalSpeedMps,
        grounded: sim.grounded,
        airborne: sim.airborne,
        landingRecovery: sim.landingRecovery ?? false,
        landingRecoveryFrac: sim.landingRecoveryFrac ?? 0,
        timeScaleEffective: sim.timeScaleEffective, // smoothed scenario-clock scale (sim s per wall s)
        gaitDistanceM: sim.distanceWalkedM,
        phase: sim.phase,
        groundContactStatus: elevation.status,
      },
      latDeg: ll.latDeg,
      lonDeg: ll.lonDeg,
    },
    surface: {
      elevation,
      slope,
    },
    geology: geology ?? EMPTY_GEOLOGY_SNAPSHOT,
    geologyLayerStatus,
    geologyContactDistanceM: Number.isFinite(geologyContactDistanceM) && geologyContactDistanceM >= 0
      ? geologyContactDistanceM : null,
    route: {
      a: { xM: sim.route.a.x, yM: sim.route.a.y },
      b: { xM: sim.route.b.x, yM: sim.route.b.y },
      routeLengthM: m.routeLengthM,
      progressM: m.progressM,
      progressFrac: m.progressFrac,
      distToEndM: m.distToEndM,
      deviationM: m.deviationM,
      corridorHalfWidthM: m.corridorHalfWidthM,
      outsideCorridor: m.outsideCorridor,
      closestPoint: { xM: m.closestPoint.xM, yM: m.closestPoint.yM },
      routeNote,
      waypoints: waypoints.map((wp) => ({
        id: wp.id,
        label: wp.label,
        sol: wp.sol ?? null,
        latDeg: wp.latDeg,
        lonDeg: wp.lonDeg,
        xM: wp.local.x,
        yM: wp.local.y,
        custom: Boolean(wp.custom),
      })),
    },
    trail: sim.trail.map((p) => ({ xM: p.x, yM: p.y })),
  };

  return deepFreeze(snapshot);
}

export function formatClock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
