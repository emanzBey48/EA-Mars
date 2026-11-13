// CPU-only terrain mesh preparation. The returned asset contains no renderer/runtime objects.

/**
 * Builds a renderer-independent terrain mesh from a gridded elevation layer.
 *
 * Each valid raster cell becomes a vertex at the cell centre. A quad is emitted only when all four
 * surrounding cells are valid, so no-data and invalid cells remain open holes. Source elevations
 * stay in their original datum and metres; only the display Z in `positions` is vertically scaled.
 *
 * @param {object} layer GridElevationLayer-like object with cellState(), adapter.pixelToLocal(),
 *   rows, cols, rowOffset, colOffset, cellSizeM, and descriptor.
 * @param {{referenceElevationM: number, verticalScale: number}} displayConfig
 * @returns {{positions: Float32Array, normals: Float32Array, indices: Uint32Array,
 *   sourceElevationsM: Float32Array, bounds: object, provenance: object, displayConfig: object}}
 */
export function buildTerrainMesh(layer, displayConfig) {
  assertLayer(layer);
  assertDisplayConfig(displayConfig);

  const { rows, cols, rowOffset, colOffset } = layer;
  const cellCount = rows * cols;
  const elevations = new Float32Array(cellCount);
  const valid = new Uint8Array(cellCount);
  let validVertexCount = 0;
  let nonOkCellCount = 0;
  let sourceMinM = Infinity;
  let sourceMaxM = -Infinity;
  const bounds = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  };

  // Cache status and coordinates once; renderer frames never need to query the source layer.
  const localXY = new Float32Array(cellCount * 2);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const state = layer.cellState(row + rowOffset, col + colOffset);
      if (state?.status !== 'ok' || !Number.isFinite(state.value)) {
        nonOkCellCount++;
        continue;
      }

      const { x, y } = layer.adapter.pixelToLocal(row + rowOffset, col + colOffset);
      const zDisplay = (state.value - displayConfig.referenceElevationM) * displayConfig.verticalScale;
      assertFloat32(x, 'local X');
      assertFloat32(y, 'local Y');
      assertFloat32(zDisplay, 'display Z');
      const x32 = Math.fround(x);
      const y32 = Math.fround(y);
      const z32 = Math.fround(zDisplay);

      valid[i] = 1;
      elevations[i] = state.value;
      localXY[i * 2] = x32;
      localXY[i * 2 + 1] = y32;
      validVertexCount++;
      sourceMinM = Math.min(sourceMinM, state.value);
      sourceMaxM = Math.max(sourceMaxM, state.value);
      bounds.minX = Math.min(bounds.minX, x32);
      bounds.maxX = Math.max(bounds.maxX, x32);
      bounds.minY = Math.min(bounds.minY, y32);
      bounds.maxY = Math.max(bounds.maxY, y32);
      bounds.minZ = Math.min(bounds.minZ, z32);
      bounds.maxZ = Math.max(bounds.maxZ, z32);
    }
  }

  const quadCapacity = Math.max(0, (rows - 1) * (cols - 1));
  let validQuadCount = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const nw = row * cols + col;
      const sw = (row + 1) * cols + col;
      const ne = nw + 1;
      const se = sw + 1;
      if (!(valid[nw] && valid[sw] && valid[ne] && valid[se])) continue;
      validQuadCount++;
    }
  }

  const positions = new Float32Array(validVertexCount * 3);
  const sourceElevationsM = new Float32Array(validVertexCount);
  const vertexForCell = new Int32Array(cellCount);
  vertexForCell.fill(-1);
  let vertex = 0;
  for (let i = 0; i < cellCount; i++) {
    if (!valid[i]) continue;
    const x = localXY[i * 2];
    const y = localXY[i * 2 + 1];
    const zDisplay = (elevations[i] - displayConfig.referenceElevationM) * displayConfig.verticalScale;
    vertexForCell[i] = vertex;
    positions[vertex * 3] = x;
    positions[vertex * 3 + 1] = y;
    positions[vertex * 3 + 2] = zDisplay;
    sourceElevationsM[vertex] = elevations[i];
    vertex++;
  }

  const indices = new Uint32Array(validQuadCount * 6);
  let indexLength = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const nw = row * cols + col;
      const sw = (row + 1) * cols + col;
      const ne = nw + 1;
      const se = sw + 1;
      if (!(valid[nw] && valid[sw] && valid[ne] && valid[se])) continue;

      // Rows increase southward. This winding gives both triangles an upward-facing normal.
      indices[indexLength++] = vertexForCell[nw];
      indices[indexLength++] = vertexForCell[sw];
      indices[indexLength++] = vertexForCell[ne];
      indices[indexLength++] = vertexForCell[ne];
      indices[indexLength++] = vertexForCell[sw];
      indices[indexLength++] = vertexForCell[se];
    }
  }

  const normals = buildNormals(positions, indices);
  const empty = validVertexCount === 0;
  const descriptor = layer.descriptor ?? {};
  const boundsM = empty
    ? { minX: null, maxX: null, minY: null, maxY: null, minZ: null, maxZ: null }
    : { ...bounds };
  const display = Object.freeze({
    referenceElevationM: displayConfig.referenceElevationM,
    verticalScale: displayConfig.verticalScale,
  });

  return {
    positions,
    normals,
    indices,
    sourceElevationsM,
    bounds: boundsM,
    provenance: {
      source: descriptor.source ?? null,
      product: descriptor.product ?? null,
      version: descriptor.version ?? null,
      unit: descriptor.unit ?? null,
      verticalDatum: descriptor.verticalDatum ?? null,
      resolutionM: Number.isFinite(layer.cellSizeM) ? layer.cellSizeM : null,
      sourceElevationRangeM: empty ? null : { min: sourceMinM, max: sourceMaxM },
      validVertexCount,
      nonOkCellCount,
      validQuadCount,
      omittedQuadCount: quadCapacity - validQuadCount,
      cellRegistration: 'PDS grid cell centres; local X east, Y north',
    },
    displayConfig: display,
  };
}

function assertLayer(layer) {
  if (!layer || typeof layer.cellState !== 'function' || typeof layer.adapter?.pixelToLocal !== 'function') {
    throw new TypeError('layer must expose cellState() and adapter.pixelToLocal()');
  }
  if (![layer.rows, layer.cols, layer.rowOffset, layer.colOffset].every(Number.isInteger) ||
      layer.rows < 1 || layer.cols < 1) {
    throw new TypeError('layer grid dimensions and offsets must be integers, with positive dimensions');
  }
}

function assertDisplayConfig(config) {
  if (!config || !Number.isFinite(config.referenceElevationM) ||
      !Number.isFinite(config.verticalScale) || config.verticalScale <= 0) {
    throw new TypeError('displayConfig requires finite referenceElevationM and positive verticalScale');
  }
}

function assertFloat32(value, label) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new RangeError(`${label} cannot be represented as a finite Float32 value`);
  }
}

function buildNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const abX = positions[b] - positions[a];
    const abY = positions[b + 1] - positions[a + 1];
    const abZ = positions[b + 2] - positions[a + 2];
    const acX = positions[c] - positions[a];
    const acY = positions[c + 1] - positions[a + 1];
    const acZ = positions[c + 2] - positions[a + 2];
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (length > 0) {
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    } else {
      // A valid but isolated sample is retained in the vertex-aligned source arrays; mark its normal up.
      normals[i + 2] = 1;
    }
  }
  return normals;
}
