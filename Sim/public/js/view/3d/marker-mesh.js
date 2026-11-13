// Pure CPU geometry for waypoint beacons and simplified route guidance.

const DEFAULT_ROUTE_CAVEAT =
  'Simplified connection between historical Sol 120 / WB1 and Sol 164 / Roubion waypoints; not an actual rover traverse or operational guidance.';
const WAYPOINT_SOURCE = Object.freeze({
  name: 'Mars 2020 Initial Reports',
  url: 'https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf',
  coordinateDescription: 'Historical waypoint coordinates; planetocentric latitude, east-positive longitude.',
});

const BEACON_COLORS = Object.freeze({
  base: Object.freeze([0.12, 0.22, 0.30]),
  mast: Object.freeze([0.82, 0.86, 0.88]),
  start: Object.freeze([0.20, 0.80, 0.48]),
  destination: Object.freeze([1.00, 0.58, 0.16]),
  intermediate: Object.freeze([0.88, 0.88, 0.72]),
});
const ROUTE_COLOR = Object.freeze([0.20, 0.78, 0.92]);
const CORRIDOR_COLOR = Object.freeze([0.95, 0.78, 0.28]);
const MARKER_DISPLAY = Object.freeze({
  baseRadius: 0.62,
  baseHeight: 0.16,
  mastRadius: 0.10,
  mastHeight: 1.35,
  lampRadius: 0.34,
  lampHeight: 0.48,
  polygonSides: 8,
  routeRibbonWidthM: 1.2,
  corridorGuideWidthM: 0.12,
  routeLiftDisplay: 0.045,
  corridorLiftDisplay: 0.065,
  beaconGroundLiftDisplay: 0.025,
});

/**
 * Build renderer-independent marker geometry in the simulation's local metre plane.
 *
 * Input schema:
 * - `waypoints`: array of `{id,label,sol,latDeg,lonDeg,xM,yM,zM,elevationStatus?}`. Sol 120
 *   is classified as the start and Sol 164 as the destination regardless of array order. If neither
 *   appears, array order is the deterministic fallback: first=start, last=destination, any middle
 *   entries=intermediate (a single waypoint is start). Other Sol values remain intermediate.
 *   `xM`/`yM`
 *   must already be projected by the composition root. `zM` is the sampled source ground elevation
 *   in metres; its vertical datum is not part of this input contract and is neither received nor
 *   verified here. Absent/null/non-finite values or an explicit non-`ok` elevationStatus omit that
 *   beacon. Latitude/longitude are copied only as provenance and are never projected here.
 * - `routePoints`: ordered array of `{xM,yM,zM,elevationStatus?}` in the same local metre plane.
 *   Adjacent valid points form a route segment; an invalid/unknown point breaks the route and is
 *   never bridged. Two endpoints describe the current simplified straight waypoint connection.
 * - `corridorWidthM`: full scenario corridor width in metres. Its boundary centerlines are offset
 *   by ±corridorWidthM/2 from each route segment (e.g. 20 m yields ±10 m).
 * - `displayConfig`: `{referenceElevationM,verticalScale}`. Ground display Z is computed only as
 *   `(zM-referenceElevationM)*verticalScale`; small visual lifts and beacon dimensions are local
 *   display-space choices and do not alter the reported source elevation.
 *
 * Returned mesh objects and metadata are frozen. Typed arrays are fresh per call (JavaScript does
 *   not allow freezing non-empty typed arrays); callers should treat them as immutable assets.
 * No DOM, WebGL, provider, raster, or coordinate transform is accessed by this module.
 *
 * @param {{waypoints:Array<object>,routePoints:Array<object>,corridorWidthM:number,
 *   displayConfig:{referenceElevationM:number,verticalScale:number},routeNote?:string}} input
 * @returns {{waypointBeacons:Array<object>,routeRibbon:object,corridorBoundaries:{left:object,right:object},metadata:object,displayConfig:object}}
 */
export function buildMarkerMeshes(input) {
  assertInput(input);
  const { waypoints, routePoints, corridorWidthM, displayConfig } = input;
  const display = Object.freeze({
    referenceElevationM: displayConfig.referenceElevationM,
    verticalScale: displayConfig.verticalScale,
  });
  const normalizedWaypoints = waypoints.map(normalizePoint);
  const waypointRoles = classifyWaypointRoles(waypoints);
  const normalizedRoute = routePoints.map(normalizePoint);
  const waypointBeacons = [];
  const waypointRecords = [];
  let omittedWaypoints = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const original = waypoints[i] ?? {};
    const point = normalizedWaypoints[i];
    if (!point.ok) {
      omittedWaypoints++;
      waypointRecords.push(waypointRecord(original, point.reason));
      continue;
    }
    const beacon = buildBeacon({ ...original, ...point }, display, waypointRoles[i]);
    waypointBeacons.push(beacon);
    waypointRecords.push(waypointRecord(original, 'built'));
  }

  const routeRibbonBuilder = new MeshBuilder();
  const leftBoundaryBuilder = new MeshBuilder();
  const rightBoundaryBuilder = new MeshBuilder();
  let validRouteSegmentCount = 0;
  let omittedRouteSegmentCount = 0;
  const corridorHalfWidthM = corridorWidthM / 2;
  const ribbonHalfWidthM = MARKER_DISPLAY.routeRibbonWidthM / 2;
  const guideHalfWidthM = MARKER_DISPLAY.corridorGuideWidthM / 2;

  for (let i = 0; i + 1 < normalizedRoute.length; i++) {
    const a = normalizedRoute[i];
    const b = normalizedRoute[i + 1];
    if (!a.ok || !b.ok) {
      omittedRouteSegmentCount++;
      continue;
    }
    const dx = b.xM - a.xM;
    const dy = b.yM - a.yM;
    const length = Math.hypot(dx, dy);
    if (!(length > 0) || !Number.isFinite(length)) {
      omittedRouteSegmentCount++;
      continue;
    }
    const normalX = -dy / length;
    const normalY = dx / length;
    addRibbonSegment(routeRibbonBuilder, a, b, normalX, normalY, 0, display, MARKER_DISPLAY.routeLiftDisplay, ribbonHalfWidthM);
    addRibbonSegment(leftBoundaryBuilder, a, b, normalX, normalY, corridorHalfWidthM - guideHalfWidthM, display, MARKER_DISPLAY.corridorLiftDisplay, guideHalfWidthM);
    addRibbonSegment(rightBoundaryBuilder, a, b, normalX, normalY, -corridorHalfWidthM + guideHalfWidthM, display, MARKER_DISPLAY.corridorLiftDisplay, guideHalfWidthM);
    validRouteSegmentCount++;
  }

  const omittedRoutePoints = normalizedRoute.reduce((count, point) => count + (point.ok ? 0 : 1), 0);
  const geometryCount = waypointBeacons.reduce((count, beacon) => count + beacon.parts.length, 0) +
    (routeRibbonBuilder.vertexCount ? 1 : 0) + (leftBoundaryBuilder.vertexCount ? 1 : 0) +
    (rightBoundaryBuilder.vertexCount ? 1 : 0);
  const hasOmissions = omittedWaypoints > 0 || omittedRoutePoints > 0 || omittedRouteSegmentCount > 0;
  const status = geometryCount === 0 ? 'unavailable' : hasOmissions ? 'partial' : 'ok';
  const metadata = deepFreeze({
    status,
    coordinateSystem: 'local X east / Y north in metres; Z is display-space height',
    sourceElevationUnit: 'm',
    sourceVerticalDatum: null,
    sourceVerticalDatumStatus: 'Not supplied or verified by this geometry module',
    waypointSource: { ...WAYPOINT_SOURCE },
    waypoints: waypointRecords,
    routeRepresentation: 'ordered piecewise straight segments; current route is a simplified waypoint connection, not an actual rover traverse',
    routeNote: typeof input.routeNote === 'string' && input.routeNote.trim() ? input.routeNote : DEFAULT_ROUTE_CAVEAT,
    corridorGuidesFollowTerrain: false,
    corridorGuideElevationSource: 'Guide ribbons reuse centerline endpoint elevations; lateral offsets are not independently sampled from terrain.',
    corridorWidthM,
    corridorHalfWidthM,
    validWaypointCount: waypointBeacons.length,
    omittedWaypointCount: omittedWaypoints,
    validRoutePointCount: normalizedRoute.filter((point) => point.ok).length,
    omittedRoutePointCount: omittedRoutePoints,
    validRouteSegmentCount,
    omittedRouteSegmentCount,
    generatedGeometryCount: geometryCount,
    visualDimensionsArePresentationChoices: true,
  });

  return Object.freeze({
    waypointBeacons: Object.freeze(waypointBeacons),
    routeRibbon: routeRibbonBuilder.toGeometry(),
    corridorBoundaries: Object.freeze({
      left: leftBoundaryBuilder.toGeometry(),
      right: rightBoundaryBuilder.toGeometry(),
    }),
    metadata,
    displayConfig: display,
  });
}

function assertInput(input) {
  if (!input || !Array.isArray(input.waypoints) || !Array.isArray(input.routePoints)) {
    throw new TypeError('input requires waypoints and routePoints arrays');
  }
  if (!Number.isFinite(input.corridorWidthM) || input.corridorWidthM <= 0) {
    throw new TypeError('corridorWidthM must be a positive finite full width');
  }
  const config = input.displayConfig;
  if (!config || !Number.isFinite(config.referenceElevationM) ||
      !Number.isFinite(config.verticalScale) || config.verticalScale <= 0) {
    throw new TypeError('displayConfig requires finite referenceElevationM and positive verticalScale');
  }
}

function normalizePoint(point) {
  if (!point || !Number.isFinite(point.xM) || !Number.isFinite(point.yM) ||
      !Number.isFinite(Math.fround(point.xM)) || !Number.isFinite(Math.fround(point.yM))) {
    return { ok: false, reason: 'invalid-coordinate' };
  }
  if (point.elevationStatus !== undefined && point.elevationStatus !== 'ok') {
    return { ok: false, reason: 'unknown-elevation' };
  }
  if (!Number.isFinite(point.zM) || !Number.isFinite(Math.fround(point.zM))) {
    return { ok: false, reason: 'unknown-elevation' };
  }
  return { ok: true, xM: point.xM, yM: point.yM, zM: point.zM };
}

function classifyWaypointRoles(waypoints) {
  const hasKnownMarswalkSol = waypoints.some((waypoint) => waypoint?.sol === 120 || waypoint?.sol === 164);
  if (hasKnownMarswalkSol) {
    return waypoints.map((waypoint) => {
      if (waypoint?.sol === 120) return 'start';
      if (waypoint?.sol === 164) return 'destination';
      return 'intermediate';
    });
  }
  return waypoints.map((_, index) => {
    if (index === 0) return 'start';
    if (waypoints.length > 1 && index === waypoints.length - 1) return 'destination';
    return 'intermediate';
  });
}

function waypointRecord(waypoint, geometryStatus) {
  return {
    id: typeof waypoint.id === 'string' ? waypoint.id : null,
    label: typeof waypoint.label === 'string' ? waypoint.label : null,
    sol: Number.isInteger(waypoint.sol) ? waypoint.sol : null,
    latDeg: Number.isFinite(waypoint.latDeg) ? waypoint.latDeg : null,
    lonDeg: Number.isFinite(waypoint.lonDeg) ? waypoint.lonDeg : null,
    geometryStatus,
    sourceElevationM: geometryStatus === 'built' && Number.isFinite(waypoint.zM) && Number.isFinite(Math.fround(waypoint.zM))
      ? waypoint.zM
      : null,
  };
}

function buildBeacon(point, displayConfig, role) {
  const baseZ = displayZ(point.zM, displayConfig, MARKER_DISPLAY.beaconGroundLiftDisplay);
  const baseTop = baseZ + MARKER_DISPLAY.baseHeight;
  const mastTop = baseTop + MARKER_DISPLAY.mastHeight;
  const lampBottom = mastTop - MARKER_DISPLAY.lampHeight * 0.25;
  const lampTop = lampBottom + MARKER_DISPLAY.lampHeight;
  const parts = [];

  const base = new MeshBuilder();
  addCylinder(base, point.xM, point.yM, baseZ, baseZ + MARKER_DISPLAY.baseHeight, MARKER_DISPLAY.baseRadius, point.zM);
  parts.push(part('beacon-base', BEACON_COLORS.base, base));

  const mast = new MeshBuilder();
  addCylinder(mast, point.xM, point.yM, baseTop, mastTop, MARKER_DISPLAY.mastRadius, point.zM);
  parts.push(part('beacon-mast', BEACON_COLORS.mast, mast));

  const lamp = new MeshBuilder();
  addCylinder(lamp, point.xM, point.yM, lampBottom, lampTop, MARKER_DISPLAY.lampRadius, point.zM);
  parts.push(part('beacon-light', BEACON_COLORS[role] ?? BEACON_COLORS.intermediate, lamp));

  return Object.freeze({
    waypoint: Object.freeze({
      id: typeof point.id === 'string' ? point.id : null,
      label: typeof point.label === 'string' ? point.label : null,
      sol: Number.isInteger(point.sol) ? point.sol : null,
      latDeg: Number.isFinite(point.latDeg) ? point.latDeg : null,
      lonDeg: Number.isFinite(point.lonDeg) ? point.lonDeg : null,
      xM: point.xM,
      yM: point.yM,
      sourceElevationM: point.zM,
      role,
    }),
    parts: Object.freeze(parts),
  });
}

function addCylinder(builder, xM, yM, bottomZ, topZ, radius, sourceZ) {
  const sides = MARKER_DISPLAY.polygonSides;
  const bottom = [];
  const top = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    const x = xM + Math.cos(angle) * radius;
    const y = yM + Math.sin(angle) * radius;
    bottom.push([x, y, bottomZ]);
    top.push([x, y, topZ]);
  }
  const bottomCenter = [xM, yM, bottomZ];
  const topCenter = [xM, yM, topZ];
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    builder.addTriangle(bottomCenter, bottom[next], bottom[i], [sourceZ, sourceZ, sourceZ]);
    builder.addTriangle(topCenter, top[i], top[next], [sourceZ, sourceZ, sourceZ]);
    builder.addTriangle(bottom[i], bottom[next], top[next], [sourceZ, sourceZ, sourceZ]);
    builder.addTriangle(bottom[i], top[next], top[i], [sourceZ, sourceZ, sourceZ]);
  }
}

function addRibbonSegment(builder, a, b, normalX, normalY, centerOffsetM, displayConfig, liftDisplay, halfWidthM = centerOffsetM) {
  const leftA = [a.xM + normalX * (centerOffsetM + halfWidthM), a.yM + normalY * (centerOffsetM + halfWidthM)];
  const leftB = [b.xM + normalX * (centerOffsetM + halfWidthM), b.yM + normalY * (centerOffsetM + halfWidthM)];
  const rightB = [b.xM + normalX * (centerOffsetM - halfWidthM), b.yM + normalY * (centerOffsetM - halfWidthM)];
  const rightA = [a.xM + normalX * (centerOffsetM - halfWidthM), a.yM + normalY * (centerOffsetM - halfWidthM)];
  const aZ = displayZ(a.zM, displayConfig, liftDisplay);
  const bZ = displayZ(b.zM, displayConfig, liftDisplay);
  builder.addTriangle([leftA[0], leftA[1], aZ], [rightA[0], rightA[1], aZ], [rightB[0], rightB[1], bZ], [a.zM, a.zM, b.zM], true);
  builder.addTriangle([leftA[0], leftA[1], aZ], [rightB[0], rightB[1], bZ], [leftB[0], leftB[1], bZ], [a.zM, b.zM, b.zM], true);
}

function part(id, colorRgb, builder) {
  return Object.freeze({ id, colorRgb, geometry: builder.toGeometry() });
}

function displayZ(sourceElevationM, displayConfig, visualLiftDisplay) {
  const value = (sourceElevationM - displayConfig.referenceElevationM) * displayConfig.verticalScale + visualLiftDisplay;
  assertFloat32(value, 'display Z');
  return value;
}

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.indices = [];
    this.sourceElevationsM = [];
    this.bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  }

  get vertexCount() { return this.positions.length / 3; }

  addTriangle(a, b, c, sourceElevations, forceUp = false) {
    const pa = toFloat32Point(a), pb = toFloat32Point(b), pc = toFloat32Point(c);
    let ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    let ac = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    let normal = cross(ab, ac);
    if (forceUp && normal[2] < 0) {
      [pb, pc] = [pc, pb];
      [sourceElevations[1], sourceElevations[2]] = [sourceElevations[2], sourceElevations[1]];
      ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      ac = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      normal = cross(ab, ac);
    }
    const length = Math.hypot(...normal);
    if (!(length > 0) || !Number.isFinite(length)) return;
    for (const [vertexIndex, p] of [pa, pb, pc].entries()) {
      const index = this.vertexCount;
      this.indices.push(index);
      this.positions.push(...p);
      this.normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
      const sourceZ = sourceElevations[vertexIndex];
      // Geometry vertex source values identify the sampled ground anchor; visual lift/height is not source data.
      this.sourceElevationsM.push(sourceZ);
      this.bounds.minX = Math.min(this.bounds.minX, p[0]); this.bounds.maxX = Math.max(this.bounds.maxX, p[0]);
      this.bounds.minY = Math.min(this.bounds.minY, p[1]); this.bounds.maxY = Math.max(this.bounds.maxY, p[1]);
      this.bounds.minZ = Math.min(this.bounds.minZ, p[2]); this.bounds.maxZ = Math.max(this.bounds.maxZ, p[2]);
    }
  }

  toGeometry() {
    const empty = this.vertexCount === 0;
    return Object.freeze({
      primitive: 'triangles',
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
      sourceElevationsM: new Float32Array(this.sourceElevationsM),
      bounds: Object.freeze(empty
        ? { minX: null, maxX: null, minY: null, maxY: null, minZ: null, maxZ: null }
        : { ...this.bounds }),
    });
  }
}

function toFloat32Point(point) {
  const result = point.map(Math.fround);
  if (result.length !== 3 || result.some((value) => !Number.isFinite(value))) {
    throw new RangeError('marker mesh position cannot be represented as finite Float32 XYZ');
  }
  return result;
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function assertFloat32(value, label) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new RangeError(`${label} cannot be represented as a finite Float32 value`);
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
