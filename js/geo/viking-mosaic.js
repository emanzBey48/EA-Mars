// Stage 36A: Viking MDIM 2.1 colour global mosaic (BigTIFF) helpers.
//
// Pure and deterministic: no fs, no network, no DOM. File access is injected: every reader takes
// read(offset, length) -> Buffer (exactly `length` bytes or throw). Only node:zlib is used.
//
// Scientific rules enforced here:
//  * This is a processed 232 m/px colour mosaic. It is NOT orthoimagery and NOT elevation data.
//  * GDAL_NODATA is 0: a pixel whose three bands are all 0 is no-data. It is never averaged into valid
//    pixels and never written as black; a block with no valid source pixel gets alpha 0 and RGB 0.
//  * Every header field that is not positively recognised throws an explicit Error (fail closed).
//  * Pixel convention is PIXEL_IS_AREA (integer = pixel edge). Edge ownership follows geo/trek-tiles.js:
//    lon is taken modulo 360 into [-180, 180) (+180 == -180 -> column 0), lat is clamped to [-90, 90]
//    (lat -90 -> last row).
import zlib from 'node:zlib';
import { normalizeLon, matrixGeometry, TILE_SIZE_PX } from './trek-tiles.js';

/** Values the ingest script insists on before it streams the 12.7 GB file. Anything else is a hard error. */
export const VIKING_EXPECTED = Object.freeze({
  width: 92160,
  height: 46080,
  bands: 3,
  bitsPerSample: 8,
  compression: 1,
  photometric: 2,
  planarConfig: 1,
  rowsPerStrip: 1,
  stripCount: 46080,
  pixelScaleM: 231.5417872,
  radiusM: 3396190,
  noDataText: '0',
  rasterType: 1, // GTRasterTypeGeoKey PixelIsArea
});

const EPS = 1e-9;
const TYPE_SIZE = Object.freeze({ 1: 1, 2: 1, 3: 2, 4: 4, 7: 1, 11: 4, 12: 8, 16: 8 });
const U64_MAX_SAFE = Number.MAX_SAFE_INTEGER;

// ------------------------------------------------------------------ BigTIFF header

function safeNonNegInt(v, what) {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${what} is not a safe non-negative integer (${v})`);
  return v;
}

function u64(buf, o) {
  const lo = buf.readUInt32LE(o), hi = buf.readUInt32LE(o + 4);
  const v = hi * 2 ** 32 + lo;
  if (!Number.isSafeInteger(v) || v > U64_MAX_SAFE) throw new Error(`64-bit value at byte ${o} exceeds 2^53`);
  return v;
}

function readAt(read, fileSize, off, len, what) {
  safeNonNegInt(off, `${what} offset`);
  safeNonNegInt(len, `${what} length`);
  if (off + len > fileSize) throw new Error(`${what} (offset ${off}, ${len} bytes) runs past end of file (${fileSize} bytes)`);
  const b = read(off, len);
  if (!Buffer.isBuffer(b) || b.length !== len) throw new Error(`${what}: reader returned ${b ? b.length : 'nothing'} bytes, expected ${len}`);
  return b;
}

function tagValues(t) {
  const { type, count, raw } = t;
  if (type === 2) return raw.toString('latin1').replace(/\0+$/, '');
  const readers = {
    1: [1, (b, o) => b[o]],
    7: [1, (b, o) => b[o]],
    3: [2, (b, o) => b.readUInt16LE(o)],
    4: [4, (b, o) => b.readUInt32LE(o)],
    11: [4, (b, o) => b.readFloatLE(o)],
    12: [8, (b, o) => b.readDoubleLE(o)],
    16: [8, u64],
  }[type];
  if (!readers) return null;
  const [size, rd] = readers;
  return Array.from({ length: count }, (_, i) => rd(raw, i * size));
}

/**
 * Parses the BigTIFF header and first IFD. `read(offset, length)` is injected; `fileSize` bounds every access.
 * Throws on: non-BigTIFF, big-endian, compressed data, non-8-bit or non-3-band samples, planar != 1, non-RGB photometric,
 * missing/inconsistent geo keys, a strip table whose offsets or byte counts run past the end of the file.
 * Returns a deep-frozen summary; StripOffsets/StripByteCounts are plain arrays (numbers, one per strip).
 */
export function parseBigTiffHeader(read, fileSize) {
  if (typeof read !== 'function') throw new TypeError('read(offset, length) function required');
  safeNonNegInt(fileSize, 'fileSize');
  const h = readAt(read, fileSize, 0, 16, 'BigTIFF header');
  const order = h.toString('latin1', 0, 2);
  if (order !== 'II') throw new Error(`byte order "${order}" is not little-endian "II" (big-endian is not supported)`);
  const magic = h.readUInt16LE(2);
  if (magic !== 43) throw new Error(`not a BigTIFF: magic ${magic} (expected 43; classic TIFF is not accepted)`);
  if (h.readUInt16LE(4) !== 8 || h.readUInt16LE(6) !== 0) throw new Error('BigTIFF offset-size / reserved fields invalid (expected 8 / 0)');
  const ifdOff = u64(h, 8);
  const nEntries = u64(readAt(read, fileSize, ifdOff, 8, 'IFD entry count'), 0);
  if (nEntries < 1 || nEntries > 4096) throw new Error(`IFD entry count ${nEntries} out of range 1..4096`);
  const entries = readAt(read, fileSize, ifdOff + 8, nEntries * 20, 'IFD entries');

  const tags = new Map();
  for (let i = 0; i < nEntries; i++) {
    const o = i * 20;
    const id = entries.readUInt16LE(o), type = entries.readUInt16LE(o + 2);
    const count = u64(entries, o + 4);
    if (tags.has(id)) throw new Error(`duplicate TIFF tag ${id}`);
    const size = TYPE_SIZE[type];
    if (!size) {
      tags.set(id, { type, count, raw: null }); // unknown type: only an error if a required tag uses it
      continue;
    }
    const bytes = safeNonNegInt(size * count, `tag ${id} byte size`);
    const vf = entries.subarray(o + 12, o + 20);
    const raw = bytes <= 8 ? Buffer.from(vf.subarray(0, bytes)) : readAt(read, fileSize, u64(vf, 0), bytes, `tag ${id} data`);
    tags.set(id, { type, count, raw });
  }

  const req = (id, what) => {
    const t = tags.get(id);
    if (!t) throw new Error(`required tag ${id} (${what}) is missing`);
    if (!t.raw) throw new Error(`tag ${id} (${what}) has unsupported field type ${t.type}`);
    return t;
  };
  const ints = (id, what) => {
    const t = req(id, what);
    if (![3, 4, 16].includes(t.type)) throw new Error(`tag ${id} (${what}) has field type ${t.type}, expected SHORT/LONG/LONG8`);
    return tagValues(t);
  };
  const one = (id, what) => {
    const v = ints(id, what);
    if (v.length !== 1) throw new Error(`${what}: expected 1 value, got ${v.length}`);
    return v[0];
  };
  const doubles = (id, what, n) => {
    const t = req(id, what);
    if (t.type !== 12) throw new Error(`tag ${id} (${what}) has field type ${t.type}, expected DOUBLE`);
    const v = tagValues(t);
    if (v.length !== n) throw new Error(`${what}: expected ${n} doubles, got ${v.length}`);
    if (!v.every(Number.isFinite)) throw new Error(`${what}: non-finite value`);
    return v;
  };

  const width = safeNonNegInt(one(256, 'ImageWidth'), 'ImageWidth');
  const height = safeNonNegInt(one(257, 'ImageLength'), 'ImageLength');
  if (width < 1 || height < 1) throw new Error('ImageWidth/ImageLength must be positive');
  const bands = one(277, 'SamplesPerPixel');
  const bits = ints(258, 'BitsPerSample');
  if (bits.length !== bands) throw new Error(`BitsPerSample has ${bits.length} entries but SamplesPerPixel is ${bands}`);
  if (!bits.every((b) => b === 8)) throw new Error(`BitsPerSample ${bits.join(',')} is not 8-bit in every band`);
  if (bands !== 3) throw new Error(`SamplesPerPixel ${bands} unsupported (RGB 3-band only)`);
  const compression = one(259, 'Compression');
  if (compression !== 1) throw new Error(`Compression ${compression} unsupported (only 1 = uncompressed; no decoder)`);
  const photometric = one(262, 'PhotometricInterpretation');
  if (photometric !== 2) throw new Error(`PhotometricInterpretation ${photometric} unsupported (RGB = 2 only)`);
  const planarConfig = one(284, 'PlanarConfiguration');
  if (planarConfig !== 1) throw new Error(`PlanarConfiguration ${planarConfig} unsupported (chunky/interleaved = 1 only)`);
  let sampleFormat = null;
  if (tags.has(339)) {
    sampleFormat = ints(339, 'SampleFormat');
    if (!sampleFormat.every((s) => s === 1)) throw new Error(`SampleFormat ${sampleFormat.join(',')} is not unsigned integer`);
  }
  const rowsPerStrip = safeNonNegInt(one(278, 'RowsPerStrip'), 'RowsPerStrip');
  if (rowsPerStrip < 1) throw new Error('RowsPerStrip must be >= 1');

  const stripOffsets = ints(273, 'StripOffsets');
  const stripByteCounts = ints(279, 'StripByteCounts');
  const expectedStrips = Math.ceil(height / rowsPerStrip);
  if (stripOffsets.length !== expectedStrips) throw new Error(`StripOffsets has ${stripOffsets.length} entries, expected ${expectedStrips}`);
  if (stripByteCounts.length !== expectedStrips) throw new Error(`StripByteCounts has ${stripByteCounts.length} entries, expected ${expectedStrips}`);
  const rowBytes = width * bands;
  for (let i = 0; i < expectedStrips; i++) {
    const rows = Math.min(rowsPerStrip, height - i * rowsPerStrip);
    const expect = rows * rowBytes;
    if (stripByteCounts[i] !== expect) throw new Error(`strip ${i}: byte count ${stripByteCounts[i]} != ${expect} (${rows} rows x ${rowBytes} bytes)`);
    if (stripOffsets[i] + stripByteCounts[i] > fileSize) {
      throw new Error(`strip ${i}: offset ${stripOffsets[i]} + ${stripByteCounts[i]} bytes runs past end of file (${fileSize})`);
    }
  }

  const ps = doubles(33550, 'ModelPixelScale', 3);
  if (ps[0] !== ps[1] || ps[2] !== 0) throw new Error(`ModelPixelScale ${ps.join(',')}: expected square pixels with Z = 0`);
  const tp = doubles(33922, 'ModelTiepoint', 6);
  if (tp[0] !== 0 || tp[1] !== 0) throw new Error(`ModelTiepoint raster origin (${tp[0]},${tp[1]}) must be (0,0)`);

  // GeoKeyDirectory: header [version=1, keyRevision, minorRevision, numberOfKeys], then 4 SHORTs per key.
  const dirT = req(34735, 'GeoKeyDirectory');
  const dir = tagValues(dirT);
  // Trailing SHORTs beyond 4 + 4*numberOfKeys are tolerated only when they are zero padding (the Viking file has 4).
  if (!Array.isArray(dir) || dir.length < 4 || dir[0] !== 1 || dir.length < 4 + 4 * dir[3]) {
    throw new Error('GeoKeyDirectory header/length invalid');
  }
  if (dir.slice(4 + 4 * dir[3]).some((v) => v !== 0)) throw new Error('GeoKeyDirectory has non-zero data beyond its declared keys');
  const dblT = tags.get(34736);
  const dbl = dblT && dblT.raw && dblT.type === 12 ? tagValues(dblT) : [];
  const asciiT = tags.get(34737);
  const asciiText = asciiT && asciiT.raw && asciiT.type === 2 ? tagValues(asciiT) : '';
  const geoKeys = new Map();
  for (let k = 4; k < 4 + 4 * dir[3]; k += 4) {
    const [id, loc, cnt, off] = dir.slice(k, k + 4);
    let val;
    if (loc === 0) val = cnt === 1 ? off : null;
    else if (loc === 34736) val = off + cnt <= dbl.length && cnt === 1 ? dbl[off] : null;
    else if (loc === 34737) val = off + cnt <= asciiText.length ? asciiText.slice(off, off + cnt) : null;
    else val = null;
    if (geoKeys.has(id)) throw new Error(`GeoKey ${id} duplicated`);
    geoKeys.set(id, val);
  }
  const gk = (id, what) => {
    if (!geoKeys.has(id)) throw new Error(`GeoKey ${id} (${what}) missing`);
    const v = geoKeys.get(id);
    if (v === null) throw new Error(`GeoKey ${id} (${what}) has an unresolved location`);
    return v;
  };
  const rasterType = gk(1025, 'GTRasterTypeGeoKey');
  if (rasterType !== VIKING_EXPECTED.rasterType) throw new Error(`GTRasterTypeGeoKey ${rasterType}: expected PixelIsArea (1)`);
  const modelType = gk(1024, 'GTModelTypeGeoKey');
  const radiusM = gk(2057, 'GeogSemiMajorAxisGeoKey');
  const radiusMatches = dbl.filter((v) => v === radiusM).length;

  const noDataT = req(42113, 'GDAL_NODATA');
  if (noDataT.type !== 2) throw new Error('GDAL_NODATA is not ASCII');
  const noDataText = tagValues(noDataT).trim();

  return Object.freeze({
    format: 'BigTIFF',
    byteOrder: 'little-endian',
    fileSize,
    ifdOffset: ifdOff,
    width,
    height,
    bands,
    bitsPerSample: 8,
    compression,
    photometric,
    planarConfig,
    sampleFormat,
    rowsPerStrip,
    stripCount: stripOffsets.length,
    stripOffsets,
    stripByteCounts,
    pixelScaleM: ps[0],
    pixelScaleYM: ps[1],
    tiepoint: Object.freeze({ rasterI: tp[0], rasterJ: tp[1], x: tp[3], y: tp[4] }),
    radiusM,
    radiusMatchesInGeoDoubleParams: radiusMatches,
    geoKeys: Object.freeze({ modelType, rasterType, semiMajorAxisM: radiusM }),
    geoAsciiText: typeof asciiText === 'string' ? asciiText.replace(/\0+$/, '') : '',
    noDataText,
  });
}

/**
 * Checks the strip table as a whole: every strip has the byte count its rows imply, strip i+1 starts exactly where
 * strip i ends (contiguous), the sum equals width*height*bands, and the last strip ends inside the file.
 * Returns a frozen report; nothing is thrown so the caller can print the failing index.
 */
export function verifyContiguousStrips({ stripOffsets, stripByteCounts, width, height, bands, rowsPerStrip, fileSize }) {
  const n = stripOffsets.length;
  const expectedStrips = Math.ceil(height / rowsPerStrip);
  let firstBreak = null, firstBadCount = null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const rows = Math.min(rowsPerStrip, height - i * rowsPerStrip);
    if (firstBadCount === null && stripByteCounts[i] !== rows * width * bands) firstBadCount = i;
    if (i > 0 && firstBreak === null && stripOffsets[i] !== stripOffsets[i - 1] + stripByteCounts[i - 1]) firstBreak = i;
    sum += stripByteCounts[i];
  }
  const countMatches = n === expectedStrips;
  const lastEnd = n ? stripOffsets[n - 1] + stripByteCounts[n - 1] : 0;
  const totalBytesMatches = sum === width * height * bands;
  return Object.freeze({
    stripCount: n,
    expectedStrips,
    countMatches,
    contiguous: countMatches && firstBreak === null && firstBadCount === null,
    firstBreak,
    firstBadCount,
    totalBytesMatches,
    sumBytes: sum,
    dataStart: n ? stripOffsets[0] : null,
    dataEnd: lastEnd,
    withinFile: lastEnd <= fileSize,
    trailingBytes: fileSize - lastEnd,
  });
}

// ------------------------------------------------------------------ native lon/lat <-> pixel

/**
 * Native plate-carree grid: x = (lon + 180) * width / 360, y = (90 - lat) * height / 180 (pixel-is-area: integer = edge).
 * lon is normalised into [-180, 180) (+180 -> column 0); lat is clamped to [-90, 90] (-90 -> last row). The sphere radius
 * is not needed for pixel mapping; it only checks the metre scale in the ingest script.
 */
export function lonLatToNativePixel(lonDeg, latDeg, width = VIKING_EXPECTED.width, height = VIKING_EXPECTED.height) {
  if (!Number.isFinite(latDeg)) throw new RangeError('latitude must be finite');
  const lon = normalizeLon(lonDeg);
  const lat = Math.min(90, Math.max(-90, latDeg));
  const x = ((lon + 180) * width) / 360;
  const y = ((90 - lat) * height) / 180;
  return Object.freeze({
    x, y,
    col: Math.min(width - 1, Math.floor(x)),
    row: Math.min(height - 1, Math.floor(y)),
  });
}

/** Lon/lat of a continuous native pixel coordinate (inverse of lonLatToNativePixel). */
export function nativePixelToLonLat(x, y, width = VIKING_EXPECTED.width, height = VIKING_EXPECTED.height) {
  return Object.freeze({ lonDeg: -180 + (x * 360) / width, latDeg: 90 - (y * 180) / height });
}

/**
 * Pyramid level geometry from geo/trek-tiles.js (DEFAULT_SCHEME: 2^(z+1) x 2^z tiles of 256 px). Level z covers
 * 512*2^z x 256*2^z pixels, so its metres per pixel are the native value times 92160 / (512*2^z).
 */
export function pyramidLevelGeometry(z, nativeMPerPx = VIKING_EXPECTED.pixelScaleM, nativeWidth = VIKING_EXPECTED.width) {
  const g = matrixGeometry(z);
  const worldW = g.matrixWidth * g.tileWidth, worldH = g.matrixHeight * g.tileHeight;
  return Object.freeze({
    zoom: z,
    cols: g.matrixWidth,
    rows: g.matrixHeight,
    tileSize: g.tileWidth,
    worldWidthPx: worldW,
    worldHeightPx: worldH,
    mPerPx: nativeMPerPx * (nativeWidth / worldW),
    degPerPx: g.degPerPx,
  });
}

// ------------------------------------------------------------------ no-data and row helpers

export function newNoDataStats() {
  return { pixels: 0, allZero: 0, anyZeroChannel: 0 };
}

/** Counts (0,0,0) pixels (all-zero, the no-data rule) and pixels with at least one zero band (reported for comparison). */
export function scanNoDataRow(rgb, width, stats) {
  for (let x = 0; x < width; x++) {
    const p = x * 3;
    const r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
    stats.pixels++;
    if ((r | g | b) === 0) stats.allZero++;
    if (r === 0 || g === 0 || b === 0) stats.anyZeroChannel++;
  }
  return stats;
}

/** Copies n native pixels starting at startCol into RGBA at outPixelOffset. (0,0,0) becomes alpha 0 with RGB 0. */
export function cropRgbRowToRgba(rgb, startCol, n, out, outPixelOffset) {
  for (let i = 0; i < n; i++) {
    const p = (startCol + i) * 3, o = (outPixelOffset + i) * 4;
    const r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
    if ((r | g | b) === 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; }
    else { out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255; }
  }
  return out;
}

// ------------------------------------------------------------------ streamed box-average aggregation

/**
 * Streaming area-weighted box filter (downsampling only). Source rows must be pushed in order 0..srcHeight-1; each
 * destination pixel covers [j*sx, (j+1)*sx) x [r*sy, (r+1)*sy) in source pixels, so non-integer ratios (e.g. 11.25 for the
 * 2:1 pyramid level z4) are handled exactly by overlap weights. (0,0,0) source pixels carry weight 0.
 * A destination pixel is the weighted mean of its valid source pixels with alpha 255; if none is valid it is alpha 0, RGB 0.
 * Memory: one Float64 accumulator per destination row that is still open (at most 2 at a time for sy >= 1).
 * Destination RGBA is written into `dst` (default: new Uint8Array); the destination row r is final once source row
 * floor(...) has passed its end.
 */
export function createBoxAggregator({ srcWidth, srcHeight, dstWidth, dstHeight, dst = null }) {
  for (const [k, v] of Object.entries({ srcWidth, srcHeight, dstWidth, dstHeight })) {
    if (!Number.isSafeInteger(v) || v < 1) throw new RangeError(`${k} must be a positive integer`);
  }
  if (dstWidth > srcWidth || dstHeight > srcHeight) throw new RangeError('box aggregator only downsamples');
  const sx = srcWidth / dstWidth, sy = srcHeight / dstHeight;
  const out = dst ?? new Uint8Array(dstWidth * dstHeight * 4);
  if (out.length !== dstWidth * dstHeight * 4) throw new RangeError('dst length does not match dstWidth*dstHeight*4');

  // Column map: a source pixel of width 1 spans at most ceil(1/sx)+1 <= 2 destination columns because sx >= 1.
  const cCount = new Uint8Array(srcWidth);
  const cJ = new Int32Array(srcWidth * 2), cW = new Float64Array(srcWidth * 2);
  for (let x = 0; x < srcWidth; x++) {
    const a = x, b = x + 1;
    const j0 = Math.floor(a / sx), j1 = Math.min(dstWidth - 1, Math.ceil(b / sx) - 1);
    let k = 0;
    for (let j = j0; j <= j1; j++) {
      const w = Math.min((j + 1) * sx, b) - Math.max(j * sx, a);
      if (w > EPS) {
        if (k >= 2) throw new Error('internal: source pixel spans more than 2 destination columns');
        cJ[x * 2 + k] = j; cW[x * 2 + k] = w; k++;
      }
    }
    cCount[x] = k;
  }

  const rowLen = dstWidth * 4;
  const open = new Map(); // destination row -> Float64 [R, G, B, W] per column
  const pool = [];
  const tR = new Float64Array(dstWidth), tG = new Float64Array(dstWidth), tB = new Float64Array(dstWidth), tW = new Float64Array(dstWidth);
  let rowsSeen = 0, rowsEmitted = 0;

  const take = (r) => {
    let a = open.get(r);
    if (!a) {
      a = pool.length ? pool.pop().fill(0) : new Float64Array(rowLen);
      open.set(r, a);
    }
    return a;
  };
  const emit = (r) => {
    const a = open.get(r);
    open.delete(r);
    const base = r * rowLen;
    for (let j = 0; j < dstWidth; j++) {
      const t = j * 4, o = base + t;
      const W = a ? a[t + 3] : 0;
      if (!(W > EPS)) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; continue; }
      out[o] = clamp8(Math.round(a[t] / W));
      out[o + 1] = clamp8(Math.round(a[t + 1] / W));
      out[o + 2] = clamp8(Math.round(a[t + 2] / W));
      out[o + 3] = 255;
    }
    if (a) pool.push(a);
    rowsEmitted++;
  };

  function pushRow(y, rgb) {
    if (y !== rowsSeen) throw new Error(`source rows must be pushed in order: expected ${rowsSeen}, got ${y}`);
    if (y >= srcHeight) throw new RangeError('more source rows than srcHeight');
    if (rgb.length !== srcWidth * 3) throw new RangeError(`row length ${rgb.length} != ${srcWidth * 3}`);
    rowsSeen++;
    tR.fill(0); tG.fill(0); tB.fill(0); tW.fill(0);
    for (let x = 0; x < srcWidth; x++) {
      const p = x * 3, r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
      if ((r | g | b) === 0) continue; // no-data never participates
      const k = cCount[x];
      for (let q = 0; q < k; q++) {
        const j = cJ[x * 2 + q], w = cW[x * 2 + q];
        tR[j] += w * r; tG[j] += w * g; tB[j] += w * b; tW[j] += w;
      }
    }
    const ra = Math.floor(y / sy);
    const rb = Math.min(dstHeight - 1, Math.ceil((y + 1) / sy) - 1);
    for (let r = ra; r <= rb; r++) {
      const w = Math.min((r + 1) * sy, y + 1) - Math.max(r * sy, y);
      if (w <= EPS) continue;
      const a = take(r);
      for (let j = 0; j < dstWidth; j++) {
        const t = j * 4;
        a[t] += w * tR[j]; a[t + 1] += w * tG[j]; a[t + 2] += w * tB[j]; a[t + 3] += w * tW[j];
      }
    }
    for (let r = ra; r <= rb; r++) {
      if ((r + 1) * sy <= y + 1 + EPS) emit(r);
    }
  }

  function finish() {
    if (rowsSeen !== srcHeight) throw new Error(`only ${rowsSeen} of ${srcHeight} source rows were pushed`);
    if (open.size || rowsEmitted !== dstHeight) throw new Error(`aggregation incomplete: ${rowsEmitted}/${dstHeight} rows emitted, ${open.size} open`);
    return out;
  }

  return Object.freeze({ pushRow, finish, scale: Object.freeze({ sx, sy }) });
}

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Exact 2x2 box reduction of an RGBA image (width and height even). Colour is the alpha-weighted mean of valid
 * (alpha > 0) pixels; alpha is 255 when at least one of the four is valid, else 0 with RGB 0.
 */
export function downsampleRgbaBox2(rgba, width, height) {
  if (width % 2 || height % 2) throw new RangeError('downsampleRgbaBox2 needs even width and height');
  if (rgba.length !== width * height * 4) throw new RangeError('rgba length mismatch');
  const w2 = width / 2, h2 = height / 2;
  const out = new Uint8Array(w2 * h2 * 4);
  for (let y2 = 0; y2 < h2; y2++) {
    for (let x2 = 0; x2 < w2; x2++) {
      let sR = 0, sG = 0, sB = 0, sA = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((2 * y2 + dy) * width + (2 * x2 + dx)) * 4;
          const a = rgba[o + 3];
          if (a === 0) continue;
          sR += rgba[o] * a; sG += rgba[o + 1] * a; sB += rgba[o + 2] * a; sA += a;
        }
      }
      const o = (y2 * w2 + x2) * 4;
      if (sA === 0) continue; // stays 0,0,0,0
      out[o] = Math.round(sR / sA); out[o + 1] = Math.round(sG / sA); out[o + 2] = Math.round(sB / sA); out[o + 3] = 255;
    }
  }
  return out;
}

/** Copies one square tile (row/col in tile units, row 0 = north) out of an RGBA image. */
export function extractTileRgba(rgba, width, height, row, col, tile = TILE_SIZE_PX) {
  if (width % tile || height % tile) throw new RangeError('image size is not a multiple of the tile size');
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || (row + 1) * tile > height || (col + 1) * tile > width) {
    throw new RangeError(`tile ${row}/${col} outside ${width / tile}x${height / tile} tiles`);
  }
  const out = new Uint8Array(tile * tile * 4);
  const rowBytes = tile * 4;
  for (let y = 0; y < tile; y++) {
    const src = ((row * tile + y) * width + col * tile) * 4;
    out.set(rgba.subarray(src, src + rowBytes), y * rowBytes);
  }
  return out;
}

// ------------------------------------------------------------------ PNG (RGBA, 8-bit) codec

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (ISO 3309 / PNG), own implementation. crc32('IEND') === 0xAE426082. */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encodes 8-bit RGBA as a non-interlaced PNG (colour type 6). Every scanline uses filter 0; zlib level 9.
 * Output is deterministic for a given input and Node/zlib build.
 */
export function encodePngRgba(width, height, rgba) {
  if (!(width > 0 && height > 0)) throw new RangeError('PNG size must be positive');
  if (rgba.length !== width * height * 4) throw new RangeError('rgba length mismatch');
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes the RGBA PNGs written by encodePngRgba (and any non-interlaced 8-bit RGBA PNG). Verifies every CRC. */
export function decodePngRgba(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG (bad signature)');
  let off = 8, ihdr = null, sawEnd = false;
  const idat = [];
  while (off < buf.length) {
    if (off + 12 > buf.length) throw new Error('truncated PNG chunk header');
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (off + 12 + len > buf.length) throw new Error(`truncated PNG chunk ${type}`);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) throw new Error(`CRC mismatch in ${type}`);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      if (len !== 13) throw new Error('bad IHDR length');
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], comp: data[10], filter: data[11], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { sawEnd = true; break; }
    off += 12 + len;
  }
  if (!ihdr || !sawEnd) throw new Error('PNG missing IHDR or IEND');
  if (ihdr.bitDepth !== 8 || ihdr.colorType !== 6 || ihdr.comp !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) {
    throw new Error('only non-interlaced 8-bit RGBA PNG is supported');
  }
  const { width, height } = ihdr;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error('inflated PNG data length mismatch');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= 4 ? out[dst + i - 4] : 0;
      const b = y > 0 ? out[dst - stride + i] : 0;
      const c = y > 0 && i >= 4 ? out[dst - stride + i - 4] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`unsupported PNG filter ${ft}`);
      }
      out[dst + i] = v & 0xff;
    }
  }
  return { width, height, rgba: out };
}
