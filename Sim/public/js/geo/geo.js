// Coordinate adapters. Single place for: lat/lon <-> projected metres <-> raster pixel <-> local sim plane.
// Pure module (no DOM), shared by the browser app, the data-prep script and the tests.
//
// Simulation plane: x grows east, y grows north, metres, origin = Sol 120 / WB1 waypoint.
// The local plane is the DTM's equirectangular map plane shifted to the origin.
// In the USGS Mars 2020 TRN HiRISE DTM mosaic, projection is Equirectangular (R=3396190 m, lat_ts=0°, lon0=0°).
// At ~18.4°N east-west distances are overstated by ~5.4% (1 / cos 18.4°). North-south distances are true-scale.

const DEG = Math.PI / 180;

/** Equirectangular (sphere) projection as declared in the USGS DTM mosaic metadata and PDS/ISIS labels. */
export class EquirectangularProjection {
  constructor({ radiusM, centerLatDeg = 0, centerLonDeg = 0 }) {
    if (![radiusM, centerLatDeg, centerLonDeg].every(Number.isFinite)) {
      throw new Error('Projection parameters missing or non-numeric');
    }
    this.radiusM = radiusM;
    this.centerLatDeg = centerLatDeg; // standard parallel (lat_ts)
    this.centerLonDeg = centerLonDeg; // central meridian
    this.kx = radiusM * Math.cos(centerLatDeg * DEG) * DEG; // metres per degree of longitude
    this.ky = radiusM * DEG; // metres per degree of latitude
  }
  forward(latDeg, lonDeg) {
    return { X: (lonDeg - this.centerLonDeg) * this.kx, Y: (latDeg - this.centerLatDeg) * this.ky };
  }
  inverse(X, Y) {
    return { latDeg: this.centerLatDeg + Y / this.ky, lonDeg: this.centerLonDeg + X / this.kx };
  }
  describe() {
    return `Equirectangular, küre R=${(this.radiusM / 1000).toFixed(6)} km, merkez meridyen ${this.centerLonDeg}°E, ` +
      `standart enlem ${this.centerLatDeg}°, planetosentrik enlem, doğu-pozitif boylam`;
  }
}

/**
 * Raster grid <-> projected metres.
 * Supports:
 *   1) GeoTIFF PixelIsArea convention (cell centres are at integer 0-based row/col):
 *      X = (col - S0) * scale = (upperLeftX + (col + 0.5) * scale)
 *      Y = (L0 - row) * scale = (upperLeftY - (row + 0.5) * scale)
 *      Continuous pixel: col = X / scale + S0, row = L0 - Y / scale
 *   2) PDS3 1-based convention:
 *      col = X / scale + S0 - 1, row = L0 - 1 - Y / scale
 */
export class PdsGrid {
  constructor({
    mapScaleM,
    lineProjectionOffset,
    sampleProjectionOffset,
    lines,
    samples,
    upperLeftX = null,
    upperLeftY = null,
    pixelRegistration = 'PIXEL_IS_AREA',
  }) {
    if (![mapScaleM, lineProjectionOffset, sampleProjectionOffset, lines, samples].every(Number.isFinite)) {
      throw new Error('Grid parameters missing or non-numeric');
    }
    this.scale = mapScaleM;
    this.L0 = lineProjectionOffset;
    this.S0 = sampleProjectionOffset;
    this.lines = lines;
    this.samples = samples;
    this.pixelRegistration = pixelRegistration;
    this.upperLeftX = upperLeftX;
    this.upperLeftY = upperLeftY;
  }

  /** Continuous 0-based pixel coordinates (integers = cell centres). */
  projectedToPixel(X, Y) {
    if (this.pixelRegistration === 'PIXEL_IS_AREA') {
      return {
        col: X / this.scale + this.S0,
        row: this.L0 - Y / this.scale,
      };
    }
    // Legacy PDS3 1-based:
    return {
      col: X / this.scale + this.S0 - 1,
      row: this.L0 - 1 - Y / this.scale,
    };
  }

  pixelToProjected(row, col) {
    if (this.pixelRegistration === 'PIXEL_IS_AREA') {
      return {
        X: (col - this.S0) * this.scale,
        Y: (this.L0 - row) * this.scale,
      };
    }
    // Legacy PDS3 1-based:
    return {
      X: (col + 1 - this.S0) * this.scale,
      Y: (this.L0 - 1 - row) * this.scale,
    };
  }
}

/** Composes projection + grid + local origin. This is the only world<->pixel adapter. */
export class WorldAdapter {
  constructor(projection, grid, originLatLon) {
    this.projection = projection;
    this.grid = grid;
    const o = projection.forward(originLatLon.latDeg, originLatLon.lonDeg);
    this.originX = o.X;
    this.originY = o.Y;
    this.originLatLon = originLatLon;
  }
  latLonToLocal(latDeg, lonDeg) {
    const p = this.projection.forward(latDeg, lonDeg);
    return { x: p.X - this.originX, y: p.Y - this.originY };
  }
  localToLatLon(x, y) {
    return this.projection.inverse(x + this.originX, y + this.originY);
  }
  localToPixel(x, y) {
    return this.grid.projectedToPixel(x + this.originX, y + this.originY);
  }
  pixelToLocal(row, col) {
    const p = this.grid.pixelToProjected(row, col);
    return { x: p.X - this.originX, y: p.Y - this.originY };
  }
  /** Nearest cell (0-based, full-product indices). */
  localToCell(x, y) {
    const { row, col } = this.localToPixel(x, y);
    return { row: Math.round(row), col: Math.round(col), rowF: row, colF: col };
  }
}

/** Builds projection + grid from parsed DTM label values. */
export function adapterFromLabel(label, originLatLon) {
  const radiusM = (label.radiusKm != null ? label.radiusKm : (label.radiusM != null ? label.radiusM / 1000 : 3396.190)) * 1000;
  const projection = new EquirectangularProjection({
    radiusM,
    centerLatDeg: label.centerLatDeg ?? 0,
    centerLonDeg: label.centerLonDeg ?? 0,
  });
  const pixelReg = label.pixelRegistration ?? (label.rasterType === 'PixelIsArea' ? 'PIXEL_IS_AREA' : 'CENTER_PDS_1BASED');
  const grid = new PdsGrid({
    mapScaleM: label.mapScaleM,
    lineProjectionOffset: label.lineProjectionOffset,
    sampleProjectionOffset: label.sampleProjectionOffset,
    lines: label.lines,
    samples: label.samples,
    upperLeftX: label.upperLeftX ?? null,
    upperLeftY: label.upperLeftY ?? null,
    pixelRegistration: pixelReg,
  });
  return new WorldAdapter(projection, grid, originLatLon);
}

/** Shortest horizontal distance (m) from point P to the finite segment AB, plus projection info. */
export function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  const tClamped = Math.max(0, Math.min(1, t));
  const cx = ax + tClamped * dx, cy = ay + tClamped * dy;
  return { distance: Math.hypot(px - cx, py - cy), t: tClamped, tRaw: t, closest: { x: cx, y: cy }, length: Math.sqrt(len2) };
}

/**
 * Pure 3x3 Horn (1981) finite-difference gradient and slope on a north-up raster grid.
 * `z9` is a 9-element row-major array:
 *   [a, b, c,   // row - 1 (north, west -> east)
 *    d, e, f,   // row     (west -> east)
 *    g, h, i]   // row + 1 (south, west -> east)
 * Row index increases southward; `dzdx` is east-positive and `dzdy` is north-positive.
 * Returns null if `cellSizeM` is invalid or any of the 9 elevations is non-finite.
 */
export function horn3x3Gradient(z9, cellSizeM) {
  if (!z9 || z9.length !== 9 || !(cellSizeM > 0) || !Number.isFinite(cellSizeM)) return null;
  for (let k = 0; k < 9; k++) if (!Number.isFinite(z9[k])) return null;
  const [a, b, c, d, , f, g, h, i] = z9;
  const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSizeM); // east-positive
  const dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8 * cellSizeM); // north-positive
  const slopeRad = Math.atan(Math.hypot(dzdx, dzdy));
  const slopeDeg = slopeRad * 180 / Math.PI;
  return { dzdx, dzdy, slopeRad, slopeDeg };
}
