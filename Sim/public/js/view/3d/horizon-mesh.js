// Stage K2-3/K2-4: distant "regional context" horizon built from the NASA Mars Trek MOLA grid
// (mola-jezero.f32 / .json, ~463 m/pixel). CPU-only and renderer-independent: no DOM, WebGL, fetch or file access.
// The caller parses the grid (regionalGridFromBinary), supplies the local window bounds and the local adapter.
//
// Scientific boundaries (see Sim/stage-horizon-audit.md and Sim/stage37-regional-dem-audit.md):
//  * This is REGIONAL CONTEXT. It is never the route height, never a walkability score, and the local HiRISE
//    DTM heights are never changed or blended with MOLA. The MOLA - local DTM difference is only MEASURED at the
//    seam and written to meta; the seam is closed visually by an inset start and a downward skirt.
//  * Vertical datum and latitude convention are NOT verified (meta.datumStatus = 'needs_review').
//  * Colours, skirt depth, haze and grading are presentation parameters ("gorsel yaklasim"), not measurements.
//  * Mars curvature uses the physical drop d^2/(2R) measured from the frame origin (the tangent point); it is
//    a geometric approximation, reported in meta.
//  * No-data cells are never converted to 0. A quad with any invalid corner is not emitted (no bridging triangles).
//
// Geometry: a graded tensor grid of local-metre nodes. Along each axis the spacing is max(minSpacingM,
// spacingGrade * distance from the local window), so samples are dense near the window and sparse far away.
// Cells inside the local window (plus margin) are removed, so the horizon never overlaps the local DTM.

import { createRegionalGrid, sampleBilinear } from '../../geo/regional-dem.js';
import { MARS_RADIUS_M } from '../../geo/trek-tiles.js';
import {
  PALETTE_LINEAR, TERRAIN_SHADING_PARAMS, paletteAlbedo, slopeAlbedoFactor, terrainSlopeWeight,
} from './terrain-shading.js';

export const HORIZON_SCHEMA = 'marswalk.horizon.v1';
export const HORIZON_LABEL = 'Bölgesel bağlam, ~463 m/piksel. Düşey datum doğrulanmadı. Yürünebilirlik puanı yok.';
export const HORIZON_SOURCE = 'NASA Mars Trek MOLA (ImageServer), ~463 m/piksel';
export const HORIZON_LICENSE_NOTE = 'lisans belirtilmemiş (ImageServer copyrightText boş); atıf: NASA Mars Trek / MOLA';

export const HORIZON_DEFAULTS = Object.freeze({
  innerMarginM: 2, // horizon starts this far outside the local window (visual seam; sunum)
  outerRadiusM: 80000, // ~80 km; the MOLA window reaches ~84 km E-W and ~89 km N-S around WB1
  minSpacingM: 463, // = MOLA native pixel; no oversampling of regional data
  spacingGrade: 0.01, // spacing = max(minSpacingM, grade * distance): coarser with distance (sunum)
  skirtDepthM: 25, // downward skirt under the seam; hides cracks (sunum)
  curvature: true, // Mars sphere drop d^2/(2R) from the frame origin
  maxVertices: 150000,
  // Same fallback the renderer uses for pass 0 elevation shading (terrainMesh.bounds has no minZDisplay).
  elevBoundsDisplay: Object.freeze([-20, 20]),
});

// Aerial perspective for the horizon only (sunum): distant ridges dissolve into the sky colour.
export const HORIZON_HAZE = Object.freeze({ densityPerM: 1.6e-4, maxAmount: 0.95 });
// Separate projection for the horizon pass (camera.js itself is not changed).
export const HORIZON_NEAR_M = 60;
export const HORIZON_FAR_M = 200000;

const REGIONAL_SCHEMA = 'marswalk.regional-dem.v1';
const NODE_EPS_M = 1e-6;

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validates the prepared regional JSON metadata and its raw Float32 LE buffer, and returns a regional grid
 * (createRegionalGrid). Every finite value is valid; non-finite values stay no-data. Nothing is zero-filled.
 */
export function regionalGridFromBinary(meta, buffer) {
  if (!meta || meta.schema !== REGIONAL_SCHEMA) throw new TypeError(`regionalGridFromBinary: ${REGIONAL_SCHEMA} metası bekleniyor`);
  const g = meta.grid;
  if (!g || !Number.isSafeInteger(g.width) || !Number.isSafeInteger(g.height) || g.width < 2 || g.height < 2) {
    throw new RangeError('regionalGridFromBinary: grid boyutu geçersiz');
  }
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('regionalGridFromBinary: ArrayBuffer bekleniyor');
  const count = g.width * g.height;
  if (buffer.byteLength !== count * 4 || g.byteLength !== count * 4) {
    throw new RangeError(`regionalGridFromBinary: bayt sayısı ${buffer.byteLength} ≠ ${count * 4}`);
  }
  const b = g.bounds;
  const px = g.pixelSizeDeg;
  if (!b || ![b.west, b.east, b.south, b.north, px].every(isFiniteNum) || !(px > 0)) {
    throw new RangeError('regionalGridFromBinary: sınır veya piksel boyutu geçersiz');
  }
  if (Math.abs((b.east - b.west) / px - g.width) > 1e-3 || Math.abs((b.north - b.south) / px - g.height) > 1e-3) {
    throw new RangeError('regionalGridFromBinary: sınırlar piksel boyutuyla uyuşmuyor');
  }
  const values = new Float32Array(buffer);
  const validMask = new Uint8Array(count);
  for (let i = 0; i < count; i++) validMask[i] = Number.isFinite(values[i]) ? 1 : 0;
  return createRegionalGrid({
    width: g.width,
    height: g.height,
    values,
    validMask,
    bounds: { west: b.west, east: b.east, south: b.south, north: b.north },
    pixelSizeDeg: px,
  });
}

// One axis of the graded tensor grid. Nodes are the window edges (lowM, highM), a uniform set inside the
// window span, and graded nodes on both sides out to outerM. Returns sorted nodes and the distance list.
function axisNodes(lowM, highM, outerM, minSpacingM, grade) {
  const dists = [0];
  let d = 0;
  while (d < outerM) {
    const step = Math.max(minSpacingM, grade * d);
    d = Math.min(outerM, d + step);
    dists.push(d);
  }
  const span = highM - lowM;
  const interiorCount = Math.max(1, Math.ceil(span / minSpacingM));
  const all = [];
  for (const dd of dists) {
    all.push(lowM - dd);
    all.push(highM + dd);
  }
  for (let k = 0; k <= interiorCount; k++) all.push(lowM + (span * k) / interiorCount);
  all.sort((a, b) => a - b);
  const nodes = [];
  for (const v of all) {
    if (nodes.length === 0 || v - nodes[nodes.length - 1] > NODE_EPS_M) nodes.push(v);
  }
  return { nodes, distancesM: dists };
}

function findNodeIndex(nodes, value) {
  for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i] - value) <= NODE_EPS_M) return i;
  throw new Error('horizon: window edge is not a grid node');
}

function accumulateNormals(positions, indices) {
  const normals = new Float64Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const abX = positions[b] - positions[a], abY = positions[b + 1] - positions[a + 1], abZ = positions[b + 2] - positions[a + 2];
    const acX = positions[c] - positions[a], acY = positions[c + 1] - positions[a + 1], acZ = positions[c + 2] - positions[a + 2];
    const nx = abY * acZ - abZ * acY, ny = abZ * acX - abX * acZ, nz = abX * acY - abY * acX;
    for (const v of [a, b, c]) { normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 0) { normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len; } else { normals[i + 2] = 1; }
  }
  return normals;
}

// Display Z of a MOLA height: remove the sphere drop (physical, metres), offset to the terrain reference, then the
// same visual vertical scale as the local terrain. Presentation Z only; source heights are not modified.
function displayZ(zM, x, y, referenceM, scale, curvature) {
  const drop = curvature ? (x * x + y * y) / (2 * MARS_RADIUS_M) : 0;
  return (zM - referenceM - drop) * scale;
}

// Albedo rules copied from the pass-0 shader (terrain-shading.js is the source of the constants):
// palette ramp by display elevation, bedrock mix and darkening by physical slope.
function horizonAlbedo(zDisplay, nx, ny, nz, scale, elevMin, elevMax) {
  const span = Math.max(1, elevMax - elevMin);
  const elevFrac = clamp01((zDisplay - elevMin) / span);
  const pz = nz * scale; // undo the display exaggeration of the normal (as the shader does)
  const len = Math.hypot(nx, ny, pz) || 1;
  const nPz = pz / len;
  const tanSlope = Math.sqrt(Math.max(1 - nPz * nPz, 0)) / Math.max(nPz, 0.05);
  const slopeW = terrainSlopeWeight(tanSlope);
  const base = paletteAlbedo(elevFrac);
  const m = TERRAIN_SHADING_PARAMS.slopeBedrockMix * slopeW;
  const f = slopeAlbedoFactor(slopeW);
  return [0, 1, 2].map((i) => (base[i] * (1 - m) + PALETTE_LINEAR.bedrock[i] * m) * f);
}

function measureSeam(sampleZ, localElevationAt, bounds) {
  if (typeof localElevationAt !== 'function') return Object.freeze({ status: 'not_measured', n: 0 });
  const insetM = 1;
  const stepM = 25;
  const pts = [];
  for (let x = bounds.xMin + insetM; x <= bounds.xMax - insetM + 1e-9; x += stepM) {
    pts.push([x, bounds.yMin + insetM], [x, bounds.yMax - insetM]);
  }
  for (let y = bounds.yMin + insetM; y <= bounds.yMax - insetM + 1e-9; y += stepM) {
    pts.push([bounds.xMin + insetM, y], [bounds.xMax - insetM, y]);
  }
  const diffs = [];
  for (const [x, y] of pts) {
    const mola = sampleZ(x, y);
    const local = localElevationAt(x, y);
    if (mola !== null && isFiniteNum(local)) diffs.push(mola - local);
  }
  if (diffs.length === 0) return Object.freeze({ status: 'no_overlap', n: 0 });
  const n = diffs.length;
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const maxAbs = Math.max(...diffs.map((v) => Math.abs(v)));
  return Object.freeze({
    status: 'measured',
    n,
    meanM: mean,
    stdM: Math.sqrt(variance),
    maxAbsM: maxAbs,
    insetM,
    sampleSpacingM: stepM,
    difference: 'MOLA - yerel DTM (pencere kenarinin 1 m icinde)',
    note: 'Gorsel dikis olcumu; iki kaynak birlestirilmedi.',
  });
}

function buildSurface({ xs, ys, inner, outerM, sampleZ, referenceM, scale, curvature, skirtDepthM, elevBounds }) {
  const nx = xs.nodes.length;
  const ny = ys.nodes.length;
  const zNode = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const z = sampleZ(xs.nodes[i], ys.nodes[j]);
      zNode[j * nx + i] = z === null ? Number.NaN : z;
    }
  }
  const cw = nx - 1;
  const ch = ny - 1;
  const emit = [];
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const x0 = xs.nodes[i], x1 = xs.nodes[i + 1], y0 = ys.nodes[j], y1 = ys.nodes[j + 1];
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (cx > inner.xMin && cx < inner.xMax && cy > inner.yMin && cy < inner.yMax) continue; // inside the local window
      const dx = Math.max(0, inner.xMin - cx, cx - inner.xMax);
      const dy = Math.max(0, inner.yMin - cy, cy - inner.yMax);
      if (Math.hypot(dx, dy) > outerM) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (Number.isFinite(zNode[a]) && Number.isFinite(zNode[b]) && Number.isFinite(zNode[c]) && Number.isFinite(zNode[d])) {
        emit.push(a, b, c, d);
      }
    }
  }
  // Vertices: nodes used by an emitted quad, in node order.
  const vertexOfNode = new Int32Array(nx * ny).fill(-1);
  const nodeOfVertex = [];
  for (const node of emit) {
    if (vertexOfNode[node] < 0) { vertexOfNode[node] = nodeOfVertex.length; nodeOfVertex.push(node); }
  }
  const positions = [];
  const raw = [];
  for (const node of nodeOfVertex) {
    const i = node % nx, j = Math.floor(node / nx);
    const X = xs.nodes[i], Y = ys.nodes[j];
    positions.push(X, Y, displayZ(zNode[node], X, Y, referenceM, scale, curvature));
    raw.push(zNode[node]);
  }
  const indices = [];
  for (let q = 0; q < emit.length; q += 4) {
    const a = vertexOfNode[emit[q]], b = vertexOfNode[emit[q + 1]], c = vertexOfNode[emit[q + 2]], d = vertexOfNode[emit[q + 3]];
    // Upward-facing winding (x grows east, y grows north): (a,b,c) and (b,d,c).
    indices.push(a, b, c, b, d, c);
  }

  // Skirt: a closed loop of the inner-rectangle perimeter. Its top copies have their own vertices, so the
  // surface normals are not contaminated; the walls face the window (inward normal).
  const iL = findNodeIndex(xs.nodes, inner.xMin), iH = findNodeIndex(xs.nodes, inner.xMax);
  const jL = findNodeIndex(ys.nodes, inner.yMin), jH = findNodeIndex(ys.nodes, inner.yMax);
  const perim = [];
  for (let i = iL; i <= iH; i++) perim.push([i, jL]);
  for (let j = jL + 1; j <= jH; j++) perim.push([iH, j]);
  for (let i = iH - 1; i >= iL; i--) perim.push([i, jH]);
  for (let j = jH - 1; j > jL; j--) perim.push([iL, j]);
  const perimNode = perim.map(([i, j]) => j * nx + i);
  const perimValid = perimNode.map((n) => Number.isFinite(zNode[n]));
  const skirtTopIndex = new Int32Array(perim.length).fill(-1);
  const skirtBottomIndex = new Int32Array(perim.length).fill(-1);
  const skirtNormals = []; // [index, nx, ny, nz] for inward wall normals
  const skirtSource = []; // [skirt vertex, surface vertex at the same node or -1]: walls take the surface colour
  const vertexCountSurface = nodeOfVertex.length;
  let skirtVertexCount = 0;
  const skirtVertexOf = (k, bottom) => {
    const table = bottom ? skirtBottomIndex : skirtTopIndex;
    if (table[k] < 0) {
      const node = perimNode[k];
      const i = node % nx, j = Math.floor(node / nx);
      const X = xs.nodes[i], Y = ys.nodes[j];
      const top = displayZ(zNode[node], X, Y, referenceM, scale, curvature);
      positions.push(X, Y, bottom ? top - skirtDepthM * scale : top);
      raw.push(zNode[node]);
      table[k] = vertexCountSurface + skirtVertexCount;
      skirtSource.push([table[k], vertexOfNode[node]]);
      skirtVertexCount++;
    }
    return table[k];
  };
  const cxWin = (inner.xMin + inner.xMax) / 2, cyWin = (inner.yMin + inner.yMax) / 2;
  const skirtIndices = [];
  for (let k = 0; k < perim.length; k++) {
    const k2 = (k + 1) % perim.length;
    if (!perimValid[k] || !perimValid[k2]) continue;
    const t1 = skirtVertexOf(k, false), t2 = skirtVertexOf(k2, false);
    const b1 = skirtVertexOf(k, true), b2 = skirtVertexOf(k2, true);
    skirtIndices.push(t1, t2, b1, t2, b2, b1);
  }
  for (let k = 0; k < perim.length; k++) {
    for (const bottom of [false, true]) {
      const table = bottom ? skirtBottomIndex : skirtTopIndex;
      if (table[k] < 0) continue;
      const node = perimNode[k];
      const X = xs.nodes[node % nx], Y = ys.nodes[Math.floor(node / nx)];
      const ix = cxWin - X, iy = cyWin - Y;
      const len = Math.hypot(ix, iy) || 1;
      skirtNormals.push([table[k], ix / len, iy / len, 0]);
    }
  }
  return {
    vertexCount: nodeOfVertex.length + skirtVertexCount,
    surfaceVertexCount: nodeOfVertex.length,
    skirtVertexCount,
    quadCount: emit.length / 4,
    nodeCountX: nx,
    nodeCountY: ny,
    positions,
    raw,
    indices: indices.concat(skirtIndices),
    surfaceTriangleCount: indices.length / 3,
    skirtTriangleCount: skirtIndices.length / 3,
    skirtNormals,
    skirtSource,
    elevBounds,
  };
}

/**
 * Builds the regional-context horizon mesh.
 *
 * @param {object} options
 * @param {object} options.regionalGrid   regionalGridFromBinary(...) result (createRegionalGrid shape).
 * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} options.localWindowBounds local DTM window (local metres).
 * @param {{adapter:{localToLatLon:(x:number,y:number)=>{latDeg:number,lonDeg:number}}}} options.localFrame
 *        the SAME adapter the local DTM uses, so horizon and local terrain share one metre plane.
 * @param {{referenceElevationM:number,verticalScale:number}} options.displayConfig terrain display config.
 * @param {number} [options.innerMarginM], [options.outerRadiusM], [options.minSpacingM], [options.spacingGrade],
 *        [options.skirtDepthM], [options.curvature], [options.maxVertices], [options.elevBoundsDisplay]
 * @param {(x:number,y:number)=>number|null} [options.localElevationAt] optional local DTM height (metres) for the
 *        seam measurement only; never used to change any height.
 * @returns {{positions:Float32Array, normals:Float32Array, colorsRgb:Float32Array, indices:Uint32Array,
 *   sourceElevationsM:Float32Array, bounds:object, provenance:object, displayConfig:object, meta:object}}
 */
export function buildHorizonMesh(options) {
  const opts = { ...HORIZON_DEFAULTS, ...stripUndefined(options) };
  const { regionalGrid, localWindowBounds, localFrame, displayConfig } = options ?? {};
  if (!regionalGrid || !Number.isSafeInteger(regionalGrid.width) || !regionalGrid.bounds) {
    throw new TypeError('buildHorizonMesh: regionalGrid (regionalGridFromBinary) gerekir');
  }
  const w = localWindowBounds;
  if (!w || ![w.xMin, w.xMax, w.yMin, w.yMax].every(isFiniteNum) || !(w.xMax > w.xMin) || !(w.yMax > w.yMin)) {
    throw new TypeError('buildHorizonMesh: localWindowBounds {xMin,xMax,yMin,yMax} gerekir');
  }
  if (typeof localFrame?.adapter?.localToLatLon !== 'function') throw new TypeError('buildHorizonMesh: localFrame.adapter.localToLatLon gerekir');
  if (!displayConfig || !isFiniteNum(displayConfig.referenceElevationM) || !isFiniteNum(displayConfig.verticalScale) || displayConfig.verticalScale <= 0) {
    throw new TypeError('buildHorizonMesh: displayConfig (referenceElevationM, verticalScale>0) gerekir');
  }
  for (const key of ['innerMarginM', 'outerRadiusM', 'minSpacingM', 'spacingGrade', 'skirtDepthM', 'maxVertices']) {
    if (!isFiniteNum(opts[key]) || opts[key] < 0) throw new RangeError(`buildHorizonMesh: ${key} geçersiz`);
  }
  if (!(opts.minSpacingM > 0) || !(opts.outerRadiusM > opts.innerMarginM)) throw new RangeError('buildHorizonMesh: aralık parametreleri geçersiz');

  const scale = displayConfig.verticalScale;
  const referenceM = displayConfig.referenceElevationM;
  const curvature = opts.curvature !== false;
  const inner = Object.freeze({
    xMin: w.xMin - opts.innerMarginM, xMax: w.xMax + opts.innerMarginM,
    yMin: w.yMin - opts.innerMarginM, yMax: w.yMax + opts.innerMarginM,
  });
  const sampleZ = (x, y) => {
    const { latDeg, lonDeg } = localFrame.adapter.localToLatLon(x, y);
    return sampleBilinear(regionalGrid, lonDeg, latDeg); // null outside coverage or next to no-data
  };
  const elevBounds = opts.elevBoundsDisplay;
  const elevMin = elevBounds[0], elevMax = elevBounds[1];

  let spacing = { minSpacingM: opts.minSpacingM, spacingGrade: opts.spacingGrade };
  let decimationSteps = 0;
  let surface = null;
  let xs = null, ys = null;
  for (;;) {
    xs = axisNodes(inner.xMin, inner.xMax, opts.outerRadiusM, spacing.minSpacingM, spacing.spacingGrade);
    ys = axisNodes(inner.yMin, inner.yMax, opts.outerRadiusM, spacing.minSpacingM, spacing.spacingGrade);
    surface = buildSurface({
      xs, ys, inner, outerM: opts.outerRadiusM, sampleZ, referenceM, scale, curvature,
      skirtDepthM: opts.skirtDepthM, elevBounds,
    });
    if (surface.vertexCount <= opts.maxVertices) break;
    if (decimationSteps >= 40) throw new RangeError('buildHorizonMesh: maxVertices sınırına indirgenemedi');
    spacing = { minSpacingM: spacing.minSpacingM * 1.2, spacingGrade: spacing.spacingGrade * 1.2 };
    decimationSteps++;
  }

  const V = surface.vertexCount;
  const positions = new Float32Array(surface.positions);
  const sourceElevationsM = new Float32Array(surface.raw);
  const indices = new Uint32Array(surface.indices);
  if (positions.length !== V * 3 || sourceElevationsM.length !== V) throw new Error('buildHorizonMesh: vertex arrays misaligned');
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) throw new RangeError('buildHorizonMesh: non-finite position');
  }
  const normalsF64 = accumulateNormals(positions, indices);
  for (const [v, nxW, nyW, nzW] of surface.skirtNormals) {
    normalsF64[v * 3] = nxW; normalsF64[v * 3 + 1] = nyW; normalsF64[v * 3 + 2] = nzW;
  }
  const normals = new Float32Array(normalsF64);
  const colorsRgb = new Float32Array(V * 3);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let v = 0; v < V; v++) {
    const p = v * 3;
    const c = horizonAlbedo(positions[p + 2], normals[p], normals[p + 1], normals[p + 2], scale, elevMin, elevMax);
    colorsRgb[p] = c[0]; colorsRgb[p + 1] = c[1]; colorsRgb[p + 2] = c[2];
    bounds.minX = Math.min(bounds.minX, positions[p]); bounds.maxX = Math.max(bounds.maxX, positions[p]);
    bounds.minY = Math.min(bounds.minY, positions[p + 1]); bounds.maxY = Math.max(bounds.maxY, positions[p + 1]);
    bounds.minZ = Math.min(bounds.minZ, positions[p + 2]); bounds.maxZ = Math.max(bounds.maxZ, positions[p + 2]);
  }
  // Skirt walls hang from the surface edge, so they take that surface colour (a bedrock-dark wall read as a crack).
  for (const [dst, src] of surface.skirtSource) {
    if (src < 0) continue;
    colorsRgb[dst * 3] = colorsRgb[src * 3];
    colorsRgb[dst * 3 + 1] = colorsRgb[src * 3 + 1];
    colorsRgb[dst * 3 + 2] = colorsRgb[src * 3 + 2];
  }

  const seam = measureSeam(sampleZ, options.localElevationAt, w);
  const validRaw = sourceElevationsM.filter((v) => Number.isFinite(v));
  const rawMin = validRaw.length ? Math.min(...validRaw) : null;
  const rawMax = validRaw.length ? Math.max(...validRaw) : null;

  const meta = deepFreeze({
    schema: HORIZON_SCHEMA,
    layer: 'regional-context',
    walkability: false,
    label: HORIZON_LABEL,
    source: HORIZON_SOURCE,
    license: HORIZON_LICENSE_NOTE,
    datumStatus: 'needs_review',
    latitudeConvention: 'H1 (planetocentric, identity) is the best-supported hypothesis in Sim/stage37-regional-dem-audit.md; not verified',
    verticalScale: scale,
    visualExaggerationNote: scale === 1 ? null : `Gorsel abartı: ${scale}x (sunum parametresi; kaynak kotu degistirilmedi)`,
    parameters: {
      innerMarginM: opts.innerMarginM,
      outerRadiusM: opts.outerRadiusM,
      minSpacingM: spacing.minSpacingM,
      spacingGrade: spacing.spacingGrade,
      skirtDepthM: opts.skirtDepthM,
      curvature,
      curvatureTangentPoint: 'frame origin (WB1)',
      maxVertices: opts.maxVertices,
      decimationSteps,
      elevBoundsDisplay: [elevMin, elevMax],
      localWindowBoundsM: { xMin: w.xMin, xMax: w.xMax, yMin: w.yMin, yMax: w.yMax },
      innerBoundsM: { ...inner },
    },
    grid: { pixelSizeDeg: regionalGrid.pixelSizeDeg, width: regionalGrid.width, height: regionalGrid.height },
    spacing: {
      nodeCountX: surface.nodeCountX,
      nodeCountY: surface.nodeCountY,
      distancesFromWindowM: xs.distancesM,
    },
    counts: {
      vertices: V,
      surfaceVertices: surface.surfaceVertexCount,
      skirtVertices: surface.skirtVertexCount,
      triangles: indices.length / 3,
      surfaceTriangles: surface.surfaceTriangleCount,
      skirtTriangles: surface.skirtTriangleCount,
      quads: surface.quadCount,
    },
    valueRangeM: { min: rawMin, max: rawMax },
    seam,
    notes: [
      'Yerel pencere dışında; yerel DTM kotları değiştirilmedi.',
      'Yürünebilirlik puanı üretilmez; rota yüksekliği bu katmandan alınmaz.',
      'No-data veya kapsam dışı hücre üçgen üretmez; 0 ile doldurulmaz.',
    ],
  });

  return {
    positions,
    normals,
    colorsRgb,
    indices,
    sourceElevationsM,
    bounds: deepFreeze({ ...bounds }),
    provenance: deepFreeze({
      source: HORIZON_SOURCE,
      product: 'mola128_mola64_merge_90Nto90S_SimpleC_clon0',
      unit: 'm',
      verticalDatum: null,
      verticalDatumStatus: 'needs_review',
      resolutionM: 463,
      sourceElevationRangeM: validRaw.length ? { min: rawMin, max: rawMax } : null,
      colorSpace: 'linear albedo (colorsRgb)',
      cellRegistration: 'MOLA grid cell centres; local X east, Y north',
    }),
    displayConfig: Object.freeze({ referenceElevationM: referenceM, verticalScale: scale }),
    meta,
  };
}

function stripUndefined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) if (value !== undefined) out[key] = value;
  return out;
}
