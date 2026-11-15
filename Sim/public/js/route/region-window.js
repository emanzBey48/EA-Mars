// Pure, bounded crop of a north-up DEM window for a selected local mission.
// Coordinates are local metres; nwXM/nwYM name the west/north CELL EDGES.
// Cropping copies source values exactly, including no-data, and does not infer coverage.

function failure(status, reason) {
  return { status, reason };
}

function isTypedElevation(value) {
  return value instanceof Float32Array || value instanceof Float64Array;
}

function isMask(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

/**
 * Crop the smallest axis-aligned rectangle containing both endpoints, a requested
 * margin, and a one-cell halo for 3x3 surface calculations.
 *
 * The source and result use the route-service DEM convention: row 0 is north,
 * column 0 is west, and nwXM/nwYM are the edges of the first cell. The caller
 * must still validate the resulting cells and route against the planner field;
 * this function only limits the data window and checks geometric coverage.
 */
export function cropDemWindowForEndpoints(windowInput, startLocal, endLocal, {
  marginM = 50,
  maxCells = 2_000_000,
} = {}) {
  const source = windowInput;
  if (!source || typeof source !== 'object' || !isTypedElevation(source.elevation) ||
      !Number.isSafeInteger(source.rows) || source.rows < 3 ||
      !Number.isSafeInteger(source.cols) || source.cols < 3 ||
      !Number.isFinite(source.cellSizeM) || source.cellSizeM <= 0 ||
      !Number.isFinite(source.nwXM) || !Number.isFinite(source.nwYM) ||
      !Number.isSafeInteger(source.rows * source.cols) ||
      source.elevation.length !== source.rows * source.cols ||
      !Number.isFinite(marginM) || marginM < 0 ||
      !Number.isSafeInteger(maxCells) || maxCells < 1) {
    return failure('invalid', 'DEM penceresi, marj veya hücre bütçesi geçersiz.');
  }
  if (source.coverageMask != null &&
      (!isMask(source.coverageMask) || source.coverageMask.length !== source.elevation.length)) {
    return failure('invalid', 'Kapsam maskesi DEM hücreleriyle uyuşmuyor.');
  }
  const points = [startLocal, endLocal];
  if (points.some((p) => !p || !Number.isFinite(p.xM) || !Number.isFinite(p.yM))) {
    return failure('invalid', 'Başlangıç ve bitiş yerel metre koordinatları sonlu olmalı.');
  }

  const { rows, cols, cellSizeM: h, nwXM, nwYM } = source;
  const west = nwXM, east = nwXM + cols * h;
  const north = nwYM, south = nwYM - rows * h;
  if (![east, south].every(Number.isFinite)) return failure('invalid', 'DEM sınırları sonlu değil.');
  const cells = points.map(({ xM, yM }) => {
    if (xM < west || xM >= east || yM > north || yM <= south) return null;
    return { col: Math.floor((xM - west) / h), row: Math.floor((north - yM) / h) };
  });
  if (cells.some((cell) => cell === null)) {
    return failure('outside_coverage', 'Başlangıç veya bitiş yüklenen DEM penceresinin dışında.');
  }
  if (cells.some(({ row, col }) => row < 1 || col < 1 || row >= rows - 1 || col >= cols - 1)) {
    return failure('outside_coverage', 'Seçilen noktanın çevresinde 3×3 DEM hücreleri bulunmuyor.');
  }

  const marginCells = Math.max(1, Math.ceil(marginM / h));
  const row0 = Math.max(0, Math.min(cells[0].row, cells[1].row) - marginCells);
  const col0 = Math.max(0, Math.min(cells[0].col, cells[1].col) - marginCells);
  const row1 = Math.min(rows - 1, Math.max(cells[0].row, cells[1].row) + marginCells);
  const col1 = Math.min(cols - 1, Math.max(cells[0].col, cells[1].col) + marginCells);
  const croppedRows = row1 - row0 + 1;
  const croppedCols = col1 - col0 + 1;
  const cellCount = croppedRows * croppedCols;
  if (!Number.isSafeInteger(cellCount) || cellCount > maxCells) {
    return failure('too_large', `Seçilen bölge ${maxCells} hücre sınırını aşıyor.`);
  }

  const elevation = new source.elevation.constructor(cellCount);
  const coverageMask = source.coverageMask == null ? undefined
    : Array.isArray(source.coverageMask) ? new Array(cellCount)
      : new source.coverageMask.constructor(cellCount);
  for (let row = 0; row < croppedRows; row++) {
    const from = (row0 + row) * cols + col0;
    const to = row * croppedCols;
    elevation.set(source.elevation.subarray(from, from + croppedCols), to);
    if (coverageMask !== undefined) {
      for (let col = 0; col < croppedCols; col++) {
        const value = source.coverageMask[from + col];
        if (value !== 0 && value !== 1 && value !== false && value !== true) {
          return failure('invalid', 'Kapsam maskesi yalnız 0/1 değerleri içermeli.');
        }
        coverageMask[to + col] = value;
      }
    }
  }
  const cropNwXM = west + col0 * h;
  const cropNwYM = north - row0 * h;
  const widthM = croppedCols * h;
  const heightM = croppedRows * h;
  const bounds = { nwXM: cropNwXM, nwYM: cropNwYM, widthM, heightM };
  const window = {
    elevation, rows: croppedRows, cols: croppedCols, cellSizeM: h,
    nwXM: cropNwXM, nwYM: cropNwYM,
    ...(source.noDataValue !== undefined ? { noDataValue: source.noDataValue } : {}),
    ...(source.validMin !== undefined ? { validMin: source.validMin } : {}),
    ...(source.validMax !== undefined ? { validMax: source.validMax } : {}),
    ...(coverageMask !== undefined ? { coverageMask } : {}),
  };
  return { status: 'ready', window, bounds, cellCount };
}
