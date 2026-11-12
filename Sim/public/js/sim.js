// Simulation core: player state, scenario clock, route progress and corridor deviation.
// Works purely in the local metre plane (x east, y north). No DOM, no screen coordinates.
import { pointToSegment } from './geo.js';

export const PHASE = Object.freeze({ READY: 'ready', RUNNING: 'running', PAUSED: 'paused', ARRIVED: 'arrived' });

export class MarswalkSim {
  /**
   * @param {{a:{x:number,y:number}, b:{x:number,y:number}}} route  finite straight segment in local metres
   * @param {object} scenario  see config.js SCENARIO
   */
  constructor(route, scenario) {
    this.route = route;
    this.scenario = { ...scenario };
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
    this.trail = [{ x: this.pos.x, y: this.pos.y }];
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
export function createWorldSnapshot({ sim, surfaceProvider, adapter, waypoints = [], routeNote = '' }) {
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
      latDeg: ll.latDeg,
      lonDeg: ll.lonDeg,
    },
    surface: {
      elevation,
      slope,
    },
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
