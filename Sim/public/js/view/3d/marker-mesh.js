// Presentation-only 3D waypoint beacons, route ground guides, and corridor boundary markers.
// Deterministic CPU geometry generator returning typed arrays for WebGL2 rendering.

const TAU = Math.PI * 2;

const DEFAULT_ROUTE_ORIGIN_NOTE =
  'İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değil.';
const DEFAULT_CORRIDOR_NOTE =
  'Rota koridoru senaryo varsayımıdır, NASA operasyonel limiti değildir.';

/**
 * Visual styling specs for known mission waypoints.
 * Dimensions and colors are presentation choices for navigational clarity;
 * they do not describe physical hardware on Mars.
 */
const BEACON_THEMES = {
  'sol120-wb1': {
    label: 'Sol 120 / WB1 (Başlangıç)',
    baseRadius: 1.1,
    baseHeight: 0.35,
    mastRadius: 0.16,
    mastHeight: 3.65,
    gemRadius: 0.45,
    gemHeight: 1.0,
    colors: {
      base: [0.35, 0.40, 0.45],
      mast: [0.65, 0.72, 0.78],
      gemTop: [0.15, 0.92, 0.75],    // Cyan / emerald glow
      gemBottom: [0.08, 0.72, 0.58],
      accent: [0.20, 0.85, 0.70],
    },
  },
  'sol164-roubion': {
    label: 'Sol 164 / Roubion (Hedef)',
    baseRadius: 1.3,
    baseHeight: 0.45,
    mastRadius: 0.18,
    mastHeight: 4.4,
    gemRadius: 0.55,
    gemHeight: 1.2,
    colors: {
      base: [0.38, 0.32, 0.25],
      mast: [0.50, 0.44, 0.34],      // Muted bronze (low saturation)
      gemTop: [0.50, 0.41, 0.28],     // Dull dark amber (no bright yellow)
      gemBottom: [0.38, 0.31, 0.22],
      accent: [0.46, 0.38, 0.27],
    },
  },
  default: {
    label: 'Waypoint',
    baseRadius: 1.0,
    baseHeight: 0.3,
    mastRadius: 0.15,
    mastHeight: 3.5,
    gemRadius: 0.4,
    gemHeight: 0.9,
    colors: {
      base: [0.4, 0.4, 0.4],
      mast: [0.7, 0.7, 0.7],
      gemTop: [0.50, 0.43, 0.31],
      gemBottom: [0.38, 0.33, 0.25],
      accent: [0.46, 0.40, 0.30],
    },
  },
};

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
    this.bounds = {
      minX: Infinity, maxX: -Infinity,
      minY: Infinity, maxY: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
    };
  }

  addVertex(x, y, z, nx, ny, nz, r, g, b) {
    const x32 = Math.fround(x);
    const y32 = Math.fround(y);
    const z32 = Math.fround(z);
    const index = this.positions.length / 3;

    this.positions.push(x32, y32, z32);
    this.normals.push(Math.fround(nx), Math.fround(ny), Math.fround(nz));
    this.colors.push(Math.fround(r), Math.fround(g), Math.fround(b));

    if (x32 < this.bounds.minX) this.bounds.minX = x32;
    if (x32 > this.bounds.maxX) this.bounds.maxX = x32;
    if (y32 < this.bounds.minY) this.bounds.minY = y32;
    if (y32 > this.bounds.maxY) this.bounds.maxY = y32;
    if (z32 < this.bounds.minZ) this.bounds.minZ = z32;
    if (z32 > this.bounds.maxZ) this.bounds.maxZ = z32;

    return index;
  }

  addTriangle(i1, i2, i3) {
    this.indices.push(i1, i2, i3);
  }

  addQuad(i1, i2, i3, i4) {
    this.indices.push(i1, i2, i3, i1, i3, i4);
  }

  /**
   * Adds an N-sided regular prism (cylinder approximation).
   */
  addPrism({ cx, cy, baseZ, topZ, radius, sides = 6, colorTop, colorSide, colorBottom }) {
    const angleStep = TAU / sides;
    const topCenter = this.addVertex(cx, cy, topZ, 0, 0, 1, ...colorTop);
    const bottomCenter = this.addVertex(cx, cy, baseZ, 0, 0, -1, ...(colorBottom || colorSide));

    const topRing = [];
    const bottomRing = [];

    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = cx + radius * cos;
      const y = cy + radius * sin;

      topRing.push(this.addVertex(x, y, topZ, 0, 0, 1, ...colorTop));
      bottomRing.push(this.addVertex(x, y, baseZ, 0, 0, -1, ...(colorBottom || colorSide)));
    }

    // Top and bottom caps
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      this.addTriangle(topCenter, topRing[i], topRing[next]);
      this.addTriangle(bottomCenter, bottomRing[next], bottomRing[i]);
    }

    // Side quads with outward normals
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const midAngle = (i + 0.5) * angleStep;
      const nx = Math.cos(midAngle);
      const ny = Math.sin(midAngle);

      const angleA = i * angleStep;
      const angleB = next * angleStep;
      const xA = cx + radius * Math.cos(angleA);
      const yA = cy + radius * Math.sin(angleA);
      const xB = cx + radius * Math.cos(angleB);
      const yB = cy + radius * Math.sin(angleB);

      const v1 = this.addVertex(xA, yA, baseZ, nx, ny, 0, ...colorSide);
      const v2 = this.addVertex(xB, yB, baseZ, nx, ny, 0, ...colorSide);
      const v3 = this.addVertex(xB, yB, topZ, nx, ny, 0, ...colorSide);
      const v4 = this.addVertex(xA, yA, topZ, nx, ny, 0, ...colorSide);

      this.addQuad(v1, v2, v3, v4);
    }
  }

  /**
   * Adds an octahedron / double-cone crystal gem at beacon apex.
   */
  addOctahedron({ cx, cy, centerZ, radius, halfHeight, sides = 6, colorTop, colorBottom }) {
    const angleStep = TAU / sides;
    const topZ = centerZ + halfHeight;
    const bottomZ = centerZ - halfHeight;

    for (let i = 0; i < sides; i++) {
      const angleA = i * angleStep;
      const angleB = ((i + 1) % sides) * angleStep;

      const xA = cx + radius * Math.cos(angleA);
      const yA = cy + radius * Math.sin(angleA);
      const xB = cx + radius * Math.cos(angleB);
      const yB = cy + radius * Math.sin(angleB);

      // Top triangle normal
      const e1x = xB - xA, e1y = yB - yA, e1z = 0;
      const e2x = -radius * Math.cos(angleA), e2y = -radius * Math.sin(angleA), e2z = halfHeight;
      const crossX = e1y * e2z - e1z * e2y;
      const crossY = e1z * e2x - e1x * e2z;
      const crossZ = e1x * e2y - e1y * e2x;
      const lenTop = Math.hypot(crossX, crossY, crossZ) || 1;
      const nxTop = crossX / lenTop, nyTop = crossY / lenTop, nzTop = crossZ / lenTop;

      const vt = this.addVertex(cx, cy, topZ, nxTop, nyTop, nzTop, ...colorTop);
      const v1 = this.addVertex(xA, yA, centerZ, nxTop, nyTop, nzTop, ...colorTop);
      const v2 = this.addVertex(xB, yB, centerZ, nxTop, nyTop, nzTop, ...colorTop);
      this.addTriangle(vt, v1, v2);

      // Bottom triangle normal (points downward-outward)
      const eb2x = -radius * Math.cos(angleA), eb2y = -radius * Math.sin(angleA), eb2z = -halfHeight;
      const crossBX = e1y * eb2z - e1z * eb2y;
      const crossBY = e1z * eb2x - e1x * eb2z;
      const crossBZ = e1x * eb2y - e1y * eb2x;
      const lenBot = Math.hypot(crossBX, crossBY, crossBZ) || 1;
      const nxBot = -crossBX / lenBot, nyBot = -crossBY / lenBot, nzBot = -crossBZ / lenBot;

      const vb = this.addVertex(cx, cy, bottomZ, nxBot, nyBot, nzBot, ...colorBottom);
      const vb1 = this.addVertex(xB, yB, centerZ, nxBot, nyBot, nzBot, ...colorBottom);
      const vb2 = this.addVertex(xA, yA, centerZ, nxBot, nyBot, nzBot, ...colorBottom);
      this.addTriangle(vb, vb1, vb2);
    }
  }

  /**
   * Adds a ground chevron pointing along forward direction (target heading).
   */
  addChevron({
    cx, cy, baseZ,
    forwardX, forwardY,
    normalX, normalY,
    width = 1.8,
    length = 2.0,
    thickness = 0.12,
    color = [0.50, 0.43, 0.30],
  }) {
    const topZ = baseZ + thickness;
    const fx = forwardX, fy = forwardY;
    const nx = normalX, ny = normalY;

    // 6-vertex chevron contour in the XY plane:
    // P1: front tip
    // P2: left wingtip
    // P3: left inner notch
    // P4: rear central notch
    // P5: right inner notch
    // P6: right wingtip
    const pts = [
      [cx + 0.60 * length * fx, cy + 0.60 * length * fy],                         // 0: tip
      [cx - 0.40 * length * fx + 0.50 * width * nx, cy - 0.40 * length * fy + 0.50 * width * ny], // 1: left wing
      [cx - 0.15 * length * fx + 0.22 * width * nx, cy - 0.15 * length * fy + 0.22 * width * ny], // 2: left inner
      [cx - 0.35 * length * fx, cy - 0.35 * length * fy],                         // 3: rear notch
      [cx - 0.15 * length * fx - 0.22 * width * nx, cy - 0.15 * length * fy - 0.22 * width * ny], // 4: right inner
      [cx - 0.40 * length * fx - 0.50 * width * nx, cy - 0.40 * length * fy - 0.50 * width * ny], // 5: right wing
    ];

    // Top face vertices (normal [0, 0, 1])
    const topIndices = pts.map(([x, y]) => this.addVertex(x, y, topZ, 0, 0, 1, ...color));

    // Top face triangles:
    // Left wing: (0, 1, 2) and (0, 2, 3)
    this.addTriangle(topIndices[0], topIndices[1], topIndices[2]);
    this.addTriangle(topIndices[0], topIndices[2], topIndices[3]);
    // Right wing: (0, 3, 4) and (0, 4, 5)
    this.addTriangle(topIndices[0], topIndices[3], topIndices[4]);
    this.addTriangle(topIndices[0], topIndices[4], topIndices[5]);

    // Side skirt quads for thickness
    const sideColor = [color[0] * 0.75, color[1] * 0.75, color[2] * 0.75];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[next];

      // Edge normal (outward in XY plane)
      const edx = x2 - x1, edy = y2 - y1;
      const elen = Math.hypot(edx, edy) || 1;
      const enx = -edy / elen, eny = edx / elen;

      const v1 = this.addVertex(x1, y1, baseZ, enx, eny, 0, ...sideColor);
      const v2 = this.addVertex(x2, y2, baseZ, enx, eny, 0, ...sideColor);
      const v3 = this.addVertex(x2, y2, topZ, enx, eny, 0, ...sideColor);
      const v4 = this.addVertex(x1, y1, topZ, enx, eny, 0, ...sideColor);

      this.addQuad(v1, v2, v3, v4);
    }
  }

  /**
   * Adds a vertical marker post / boundary stake.
   */
  addPost({ cx, cy, baseZ, height = 1.0, radius = 0.1, sides = 6, color = [0.25, 0.70, 0.95], capColor = null }) {
    this.addPrism({
      cx, cy,
      baseZ,
      topZ: baseZ + height,
      radius,
      sides,
      colorTop: capColor || color,
      colorSide: color,
      colorBottom: color,
    });
  }

  build(metadata, displayConfig) {
    const vertexCount = this.positions.length / 3;
    const indexCount = this.indices.length;

    const positions = new Float32Array(this.positions);
    const normals = new Float32Array(this.normals);
    const colorsRgb = new Float32Array(this.colors);
    const indices = new Uint32Array(this.indices);

    const bounds = vertexCount > 0 ? {
      minX: this.bounds.minX, maxX: this.bounds.maxX,
      minY: this.bounds.minY, maxY: this.bounds.maxY,
      minZ: this.bounds.minZ, maxZ: this.bounds.maxZ,
    } : { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

    return deepFreeze({
      positions,
      normals,
      colorsRgb,
      indices,
      vertexCount,
      triangleCount: indexCount / 3,
      bounds,
      metadata,
      displayConfig,
    });
  }
}

function resolveElevation(point, sampleElevationFn) {
  if (point?.elevationStatus !== undefined && point.elevationStatus !== 'ok') {
    return { status: point.elevationStatus, value: null };
  }
  if (Number.isFinite(point.zM)) return { status: 'ok', value: point.zM };
  if (Number.isFinite(point.elevationM)) return { status: 'ok', value: point.elevationM };
  if (typeof sampleElevationFn === 'function') {
    const x = point.xM ?? point.local?.x ?? point.x;
    const y = point.yM ?? point.local?.y ?? point.y;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const sample = sampleElevationFn(x, y);
      if (sample && sample.status === 'ok' && Number.isFinite(sample.value)) {
        return { status: 'ok', value: sample.value };
      }
      return { status: sample?.status || 'unavailable', value: null };
    }
  }
  return { status: 'unavailable', value: null };
}

function assertDisplayConfig(displayConfig) {
  if (!displayConfig ||
      !Number.isFinite(displayConfig.referenceElevationM) ||
      !Number.isFinite(displayConfig.verticalScale) ||
      displayConfig.verticalScale <= 0) {
    throw new TypeError('displayConfig requires finite referenceElevationM and positive verticalScale');
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value; // TypedArray buffer views cannot be frozen
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/**
 * Builds pure CPU 3D geometries for mission waypoint beacons, route ground guides,
 * and corridor boundary markers.
 *
 * Rules:
 * - Deterministic, renderer-independent, dependency-free.
 * - No-data cells are NEVER converted to zero; points without confirmed elevation are omitted.
 * - Positions contain local metres (X, Y) and display Z:
 *   displayZ = (elevationM - referenceElevationM) * verticalScale.
 * - Colors are provided in `colorsRgb` (Float32Array [0..1]).
 *
 * @param {object} options
 * @param {Array<object>} options.waypoints - Mission waypoints (Sol 120, Sol 164)
 * @param {object} [options.route] - { a: {x,y}, b: {x,y} }
 * @param {Array<object>} [options.routePoints] - [ {x,y}, {x,y} ] alternative
 * @param {number} [options.corridorHalfWidthM] - Corridor half-width in metres (default: 10)
 * @param {number} [options.corridorWidthM] - Full corridor width alternative
 * @param {object} options.displayConfig - { referenceElevationM, verticalScale }
 * @param {object} [options.surfaceProvider] - SurfaceProvider with sampleElevation(x, y)
 * @param {Function} [options.sampleElevation] - Direct elevation sampling function
 * @param {number} [options.guideSpacingM=30] - Distance in metres between ground chevrons
 * @param {number} [options.corridorPostSpacingM=60] - Distance in metres between corridor boundary posts
 * @returns {{positions: Float32Array, normals: Float32Array, colorsRgb: Float32Array, indices: Uint32Array, bounds: object, metadata: object, displayConfig: object}}
 */
export function buildMarkerMeshes({
  waypoints = [],
  route = null,
  routePoints = null,
  corridorHalfWidthM = null,
  corridorWidthM = null,
  displayConfig,
  surfaceProvider = null,
  sampleElevation = null,
  guideSpacingM = 30.0,
  corridorPostSpacingM = 60.0,
} = {}) {
  assertDisplayConfig(displayConfig);
  if (!Array.isArray(waypoints)) throw new TypeError('waypoints must be an array');

  const sampler = sampleElevation || (surfaceProvider?.sampleElevation ? (x, y) => surfaceProvider.sampleElevation(x, y) : null);
  const { referenceElevationM, verticalScale } = displayConfig;

  const halfWidth = Number.isFinite(corridorHalfWidthM)
    ? corridorHalfWidthM
    : (Number.isFinite(corridorWidthM) ? corridorWidthM / 2 : 10.0);

  const builder = new MeshBuilder();
  let beaconCount = 0;
  let guideCount = 0;
  let corridorMarkerCount = 0;
  let omittedCount = 0;
  const waypointMetadata = [];
  const beaconDrawRanges = [];

  // 1. Waypoint Beacons (Sol 120 / WB1, Sol 164 / Roubion)
  for (const wp of waypoints) {
    const x = wp.xM ?? wp.local?.x ?? wp.x;
    const y = wp.yM ?? wp.local?.y ?? wp.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const elev = resolveElevation(wp, sampler);
    const theme = BEACON_THEMES[wp.id] || BEACON_THEMES.default;

    waypointMetadata.push({
      id: wp.id || 'unnamed-waypoint',
      label: wp.label || theme.label,
      sol: wp.sol ?? null,
      latDeg: wp.latDeg ?? null,
      lonDeg: wp.lonDeg ?? null,
      localXM: x,
      localYM: y,
      elevationM: elev.value,
      elevationStatus: elev.status,
      theme: wp.id in BEACON_THEMES ? wp.id : 'default',
    });

    if (elev.status !== 'ok' || !Number.isFinite(elev.value)) {
      // Rule: Never invent zero elevation for unknown or no-data coordinates.
      omittedCount++;
      continue;
    }

    const groundDisplayZ = (elev.value - referenceElevationM) * verticalScale;
    const { baseRadius, baseHeight, mastRadius, mastHeight, gemRadius, gemHeight, colors } = theme;
    const indexStart = builder.indices.length;

    // Base podium (flanged step)
    builder.addPrism({
      cx: x, cy: y,
      baseZ: groundDisplayZ,
      topZ: groundDisplayZ + baseHeight,
      radius: baseRadius,
      sides: 8,
      colorTop: colors.base,
      colorSide: [colors.base[0] * 0.8, colors.base[1] * 0.8, colors.base[2] * 0.8],
      colorBottom: colors.base,
    });

    // Central mast / pillar
    builder.addPrism({
      cx: x, cy: y,
      baseZ: groundDisplayZ + baseHeight,
      topZ: groundDisplayZ + baseHeight + mastHeight,
      radius: mastRadius,
      sides: 6,
      colorTop: colors.mast,
      colorSide: colors.mast,
      colorBottom: colors.mast,
    });

    // Gem / Beacon head crystal at apex
    const gemCenterZ = groundDisplayZ + baseHeight + mastHeight + (gemHeight / 2);
    builder.addOctahedron({
      cx: x, cy: y,
      centerZ: gemCenterZ,
      radius: gemRadius,
      halfHeight: gemHeight / 2,
      sides: 6,
      colorTop: colors.gemTop,
      colorBottom: colors.gemBottom,
    });

    beaconDrawRanges.push({
      id: wp.id || 'unnamed-waypoint',
      localXM: x,
      localYM: y,
      indexStart,
      indexCount: builder.indices.length - indexStart,
    });
    beaconCount++;
  }

  // 2. Route Guides (Chevrons) & Corridor Boundary Markers
  let routeA = null, routeB = null;
  if (route?.a && route?.b) {
    routeA = { x: route.a.xM ?? route.a.x, y: route.a.yM ?? route.a.y };
    routeB = { x: route.b.xM ?? route.b.x, y: route.b.yM ?? route.b.y };
  } else if (Array.isArray(routePoints) && routePoints.length >= 2) {
    routeA = { x: routePoints[0].xM ?? routePoints[0].local?.x ?? routePoints[0].x, y: routePoints[0].yM ?? routePoints[0].local?.y ?? routePoints[0].y };
    routeB = { x: routePoints[1].xM ?? routePoints[1].local?.x ?? routePoints[1].x, y: routePoints[1].yM ?? routePoints[1].local?.y ?? routePoints[1].y };
  } else if (waypoints.length >= 2) {
    routeA = { x: waypoints[0].xM ?? waypoints[0].local?.x ?? waypoints[0].x, y: waypoints[0].yM ?? waypoints[0].local?.y ?? waypoints[0].y };
    routeB = { x: waypoints[1].xM ?? waypoints[1].local?.x ?? waypoints[1].x, y: waypoints[1].yM ?? waypoints[1].local?.y ?? waypoints[1].y };
  }

  if (routeA && routeB && Number.isFinite(routeA.x) && Number.isFinite(routeA.y) &&
      Number.isFinite(routeB.x) && Number.isFinite(routeB.y)) {
    const dx = routeB.x - routeA.x;
    const dy = routeB.y - routeA.y;
    const lengthM = Math.hypot(dx, dy);

    if (lengthM > 1e-3) {
      const fx = dx / lengthM;
      const fy = dy / lengthM;
      const nx = -fy;
      const ny = fx;

      // Ground Chevrons along route segment
      const guideInterval = Math.max(5.0, guideSpacingM);
      const chevronCount = Math.floor(lengthM / guideInterval);

      for (let i = 1; i <= chevronCount; i++) {
        const dist = i * guideInterval;
        if (dist >= lengthM - 5.0) break; // Don't collide with the target beacon

        const gx = routeA.x + fx * dist;
        const gy = routeA.y + fy * dist;
        const elev = resolveElevation({ x: gx, y: gy }, sampler);

        if (elev.status !== 'ok' || !Number.isFinite(elev.value)) {
          omittedCount++;
          continue;
        }

        // Slight vertical lift (+0.08m) prevents Z-fighting against the terrain surface.
        const baseZ = (elev.value - referenceElevationM) * verticalScale + 0.08;

        builder.addChevron({
          cx: gx, cy: gy, baseZ,
          forwardX: fx, forwardY: fy,
          normalX: nx, normalY: ny,
          width: 1.8,
          length: 2.2,
          thickness: 0.12,
          color: [0.52, 0.42, 0.26], // Muted earth-amber guide
        });
        guideCount++;

        // Add a guide post every 3rd chevron for silhouette visibility over terrain swells
        if (i % 3 === 0) {
          builder.addPost({
            cx: gx, cy: gy,
            baseZ,
            height: 1.2,
            radius: 0.08,
            color: [0.52, 0.47, 0.40],
            capColor: [0.60, 0.40, 0.20], // Muted reflector cap
          });
        }
      }

      // Corridor Boundary Markers (left and right edges)
      if (halfWidth > 0 && corridorPostSpacingM > 0) {
        const postInterval = Math.max(10.0, corridorPostSpacingM);
        const postSteps = Math.floor(lengthM / postInterval);

        for (let i = 1; i <= postSteps; i++) {
          const dist = i * postInterval;
          if (dist >= lengthM - 10.0) break;

          const cx = routeA.x + fx * dist;
          const cy = routeA.y + fy * dist;

          // Left border (+halfWidth * normal)
          const lx = cx + halfWidth * nx;
          const ly = cy + halfWidth * ny;
          const elevL = resolveElevation({ x: lx, y: ly }, sampler);
          if (elevL.status === 'ok' && Number.isFinite(elevL.value)) {
            const baseZL = (elevL.value - referenceElevationM) * verticalScale + 0.04;
            builder.addPost({
              cx: lx, cy: ly,
              baseZ: baseZL,
              height: 0.8,
              radius: 0.09,
              color: [0.25, 0.72, 0.95], // Corridor boundary blue
              capColor: [0.45, 0.85, 1.0],
            });
            corridorMarkerCount++;
          } else {
            omittedCount++;
          }

          // Right border (-halfWidth * normal)
          const rx = cx - halfWidth * nx;
          const ry = cy - halfWidth * ny;
          const elevR = resolveElevation({ x: rx, y: ry }, sampler);
          if (elevR.status === 'ok' && Number.isFinite(elevR.value)) {
            const baseZR = (elevR.value - referenceElevationM) * verticalScale + 0.04;
            builder.addPost({
              cx: rx, cy: ry,
              baseZ: baseZR,
              height: 0.8,
              radius: 0.09,
              color: [0.25, 0.72, 0.95],
              capColor: [0.45, 0.85, 1.0],
            });
            corridorMarkerCount++;
          } else {
            omittedCount++;
          }
        }
      }
    }
  }

  const metadata = {
    kind: '3d-markers',
    description: 'Presentation-only 3D waypoint beacons, route ground chevrons, and corridor boundary markers.',
    routeOriginNote: route?.routeOriginNote || DEFAULT_ROUTE_ORIGIN_NOTE,
    corridorNote: DEFAULT_CORRIDOR_NOTE,
    beaconCount,
    guideCount,
    corridorMarkerCount,
    omittedCount,
    corridorHalfWidthM: halfWidth,
    waypoints: waypointMetadata,
    beaconDrawRanges,
  };

  return builder.build(metadata, displayConfig);
}

/**
 * Additive builder: small micro-markers for intermediate archival sol stops (e.g. Sol 122..155 of the
 * MMGIS traverse). Separate from buildMarkerMeshes, which is unchanged.
 *
 * Each stop: { id, sol, xM, yM } (local metres) plus optional elevationM / zM; otherwise the sampler is used.
 * Archive elevations from the traverse file are NOT consumed here. Stops without a confirmed elevation
 * are omitted (counted), never placed at zero.
 *
 * @param {object} options
 * @param {Array<object>} options.stops
 * @param {object} options.displayConfig - { referenceElevationM, verticalScale }
 * @param {object} [options.surfaceProvider]
 * @param {Function} [options.sampleElevation]
 * @returns frozen mesh { positions, normals, colorsRgb, indices, vertexCount, triangleCount, bounds, metadata, displayConfig }
 */
export function buildIntermediateSolMarkers({
  stops = [],
  displayConfig,
  surfaceProvider = null,
  sampleElevation = null,
} = {}) {
  assertDisplayConfig(displayConfig);
  if (!Array.isArray(stops)) throw new TypeError('stops must be an array');

  const sampler = sampleElevation || (surfaceProvider?.sampleElevation ? (x, y) => surfaceProvider.sampleElevation(x, y) : null);
  const { referenceElevationM, verticalScale } = displayConfig;
  const builder = new MeshBuilder();
  const stopMetadata = [];
  let markerCount = 0;
  let omittedCount = 0;

  const baseColor = [0.30, 0.34, 0.38];
  const postColor = [0.62, 0.55, 0.85];
  const gemTop = [0.78, 0.66, 1.0];
  const gemBottom = [0.52, 0.40, 0.82];

  for (const stop of stops) {
    const x = stop?.xM ?? stop?.local?.x ?? stop?.x;
    const y = stop?.yM ?? stop?.local?.y ?? stop?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { omittedCount++; continue; }
    const elev = resolveElevation({ ...stop, x, y }, sampler);
    stopMetadata.push({
      id: stop.id || 'unnamed-sol-stop',
      sol: stop.sol ?? null,
      localXM: x,
      localYM: y,
      elevationM: elev.value,
      elevationStatus: elev.status,
    });
    if (elev.status !== 'ok' || !Number.isFinite(elev.value)) { omittedCount++; continue; }

    const gz = (elev.value - referenceElevationM) * verticalScale;
    builder.addPrism({
      cx: x, cy: y, baseZ: gz, topZ: gz + 0.12, radius: 0.45, sides: 8,
      colorTop: baseColor, colorSide: baseColor, colorBottom: baseColor,
    });
    builder.addPrism({
      cx: x, cy: y, baseZ: gz + 0.12, topZ: gz + 1.32, radius: 0.07, sides: 6,
      colorTop: postColor, colorSide: postColor, colorBottom: postColor,
    });
    builder.addOctahedron({
      cx: x, cy: y, centerZ: gz + 1.55, radius: 0.2, halfHeight: 0.23, sides: 6,
      colorTop: gemTop, colorBottom: gemBottom,
    });
    markerCount++;
  }

  const metadata = {
    kind: '3d-intermediate-sol-markers',
    description: 'Presentation-only micro-markers at archival end-of-drive stops of the MMGIS traverse.',
    note: 'Archival markers; not live telemetry; not a safety route. Marker size is a presentation choice.',
    markerCount,
    omittedCount,
    stops: stopMetadata,
  };
  return builder.build(metadata, displayConfig);
}
