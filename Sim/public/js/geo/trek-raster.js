// Stage 37A: parser for Mars Trek ImageServer `exportImage` GeoTIFF responses.
//
// Pure and browser-safe: no fs / fetch / DOM. Input bytes are untrusted; every offset and count is bounds-checked
// before a read. Nothing in the input is executed.
//
// Supported form (the form observed in Stage 26A evidence: export-mola.tiff S16 and export-gale.tiff F32):
//   * classic TIFF (magic 42), little- or big-endian, exactly one IFD (nextIFD = 0);
//   * one band, PhotometricInterpretation 1 (BlackIsZero), PlanarConfiguration 1 (or absent);
//   * 16-bit signed integer (SampleFormat 2, BitsPerSample 16 -> pixelType 'S16') or 32-bit IEEE float
//     (SampleFormat 3, BitsPerSample 32 -> pixelType 'F32');
//   * uncompressed (Compression 1), either STRIPPED or TILED (tile edge a multiple of 16; padded edge tiles are
//     read only inside the image). The Stage 26A evidence is TILED (one full tile, e.g. 128x128 for a 128x128 export,
//     and a 100x100 Gale export stored in a padded 128x128 tile);
//   * ModelPixelScale (square, degrees), ModelTiepoint at the raster origin, no ModelTransformation;
//   * GeoKeys: GTModelType = 2 (geographic), GTRasterType 1 (PixelIsArea) or 2 (PixelIsPoint), GeogAngularUnits = 9102 (degree).
// Refused with an explicit error: BigTIFF (TypeError), compression, multi-band, multi-IFD, other sample types,
// non-square pixels, rotated/transformed rasters, unknown no-data text (TypeError); corrupt sizes/offsets (RangeError).
//
// No-data policy (fail-closed):
//   * GDAL_NODATA (tag 42113) is honoured when present: matching cells get validMask 0 and KEEP their stored value.
//   * When it is absent, NOTHING is treated as no-data: every value is kept, validMask 1; the parser only COUNTS
//     suspicious values (fill-like, NaN, zero) so the caller can report them. The parser never maps no-data to 0.
//   * NaN cells (F32 only) get validMask 0 and keep NaN.
//
// Grid convention: row 0 is the northern edge; PixelIsArea cell (row, col) has its centre at
//   lon = west + (col + 0.5) * pixelSizeDeg,  lat = north - (row + 0.5) * pixelSizeDeg.

const MAX_PIXELS = 64_000_000;
const MAX_TAG_VALUES = 1_000_000;
const DEG_PER_RAD_UNIT = 9102; // EPSG code for the degree angular unit used in GeoKeys

const TAG = Object.freeze({
  ImageWidth: 256, ImageLength: 257, BitsPerSample: 258, Compression: 259, Photometric: 262,
  StripOffsets: 273, SamplesPerPixel: 277, RowsPerStrip: 278, StripByteCounts: 279, PlanarConfig: 284,
  TileWidth: 322, TileLength: 323, TileOffsets: 324, TileByteCounts: 325, SampleFormat: 339,
  ModelPixelScale: 33550, ModelTiepoint: 33922, ModelTransformation: 34264,
  GeoKeyDirectory: 34735, GeoDoubleParams: 34736, GeoAsciiParams: 34737, GdalNoData: 42113,
});
const GEOKEY = Object.freeze({
  GTModelType: 1024, GTRasterType: 1025, GeographicType: 2048, GeogAngularUnits: 2054,
  GeogSemiMajorAxis: 2057, GeogInvFlattening: 2059,
});
const TYPE_SIZE = Object.freeze({ 1: 1, 2: 1, 3: 2, 4: 4, 6: 1, 7: 1, 8: 2, 9: 4, 11: 4, 12: 8 });
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function assertRange(length, offset, size, what) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > length) {
    throw new RangeError(`${what}: bayt aralığı dosya dışında (offset=${offset}, boyut=${size}, dosya=${length})`);
  }
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('parseExportedTiff: Uint8Array veya ArrayBuffer bekleniyor');
}

/** Reads one IFD entry's values as numbers (or a string for ASCII). Throws on unsupported element types. */
function decodeEntry(dv, u8, entry, le) {
  const { type, count, dataOffset } = entry;
  const elementSize = TYPE_SIZE[type];
  if (elementSize === undefined) throw new TypeError(`TIFF etiket türü desteklenmiyor: ${type}`);
  if (type === 2) {
    return u8.subarray(dataOffset, dataOffset + count).reduce((s, b) => s + String.fromCharCode(b), '');
  }
  const out = new Array(count);
  for (let k = 0; k < count; k++) {
    const o = dataOffset + k * elementSize;
    switch (type) {
      case 1: case 6: case 7: out[k] = u8[o]; break;
      case 3: out[k] = dv.getUint16(o, le); break;
      case 4: out[k] = dv.getUint32(o, le); break;
      case 8: out[k] = dv.getInt16(o, le); break;
      case 9: out[k] = dv.getInt32(o, le); break;
      case 11: out[k] = dv.getFloat32(o, le); break;
      case 12: out[k] = dv.getFloat64(o, le); break;
      default: throw new TypeError(`TIFF etiket türü desteklenmiyor: ${type}`);
    }
  }
  return out;
}

function parseIfd(dv, u8, le) {
  const len = u8.byteLength;
  const ifdOffset = dv.getUint32(4, le);
  assertRange(len, ifdOffset, 2, 'IFD başlığı');
  const n = dv.getUint16(ifdOffset, le);
  assertRange(len, ifdOffset + 2, n * 12 + 4, 'IFD girdileri');
  const nextIfd = dv.getUint32(ifdOffset + 2 + n * 12, le);
  if (nextIfd !== 0) throw new TypeError('Çok IFD/çok sayfalı TIFF desteklenmiyor (nextIFD != 0)');
  const entries = new Map();
  for (let i = 0; i < n; i++) {
    const e = ifdOffset + 2 + i * 12;
    const tag = dv.getUint16(e, le);
    const type = dv.getUint16(e + 2, le);
    const count = dv.getUint32(e + 4, le);
    if (entries.has(tag)) throw new RangeError(`TIFF etiketi tekrarlı: ${tag}`);
    if (count > MAX_TAG_VALUES) throw new RangeError(`TIFF etiket sayısı aşırı: ${tag} (${count})`);
    const elementSize = TYPE_SIZE[type];
    const size = elementSize === undefined ? 0 : elementSize * count;
    let dataOffset;
    if (elementSize !== undefined && size <= 4) {
      dataOffset = e + 8;
    } else {
      dataOffset = dv.getUint32(e + 8, le);
      if (elementSize !== undefined) assertRange(len, dataOffset, size, `etiket ${tag}`);
    }
    entries.set(tag, { type, count, dataOffset, elementSize });
  }
  return entries;
}

function scalarTag(entries, dv, u8, le, tag, what) {
  const vals = numbersTag(entries, dv, u8, le, tag, what, 1);
  return vals[0];
}

function numbersTag(entries, dv, u8, le, tag, what, expectedCount = null) {
  const entry = entries.get(tag);
  if (!entry) throw new TypeError(`${what} etiketi (${tag}) yok`);
  if (expectedCount !== null && entry.count !== expectedCount) {
    throw new RangeError(`${what} etiketi beklenen ${expectedCount} değer yerine ${entry.count} değer içeriyor`);
  }
  const vals = decodeEntry(dv, u8, entry, le);
  if (typeof vals === 'string') throw new TypeError(`${what} sayısal değil`);
  return vals;
}

function optionalNumbers(entries, dv, u8, le, tag, fallback) {
  if (!entries.has(tag)) return fallback;
  const vals = decodeEntry(dv, u8, entries.get(tag), le);
  if (typeof vals === 'string') throw new TypeError(`etiket ${tag} sayısal değil`);
  return vals;
}

function readGeoKeys(entries, dv, u8, le) {
  if (!entries.has(TAG.GeoKeyDirectory)) throw new TypeError('GeoKeyDirectory yok: coğrafi referans gerekli');
  const dir = numbersTag(entries, dv, u8, le, TAG.GeoKeyDirectory, 'GeoKeyDirectory');
  if (dir.length < 4) throw new RangeError('GeoKeyDirectory başlığı eksik');
  const nKeys = dir[3];
  if (dir.length < 4 + nKeys * 4) throw new RangeError('GeoKeyDirectory girdileri eksik');
  const doubles = entries.has(TAG.GeoDoubleParams) ? numbersTag(entries, dv, u8, le, TAG.GeoDoubleParams, 'GeoDoubleParams') : [];
  const asciiEntry = entries.get(TAG.GeoAsciiParams);
  const ascii = asciiEntry ? decodeEntry(dv, u8, asciiEntry, le) : '';
  const keys = new Map();
  for (let k = 0; k < nKeys; k++) {
    const [id, location, count, value] = dir.slice(4 + k * 4, 8 + k * 4);
    if (location === 0) {
      keys.set(id, value);
    } else if (location === TAG.GeoDoubleParams) {
      if (value >= doubles.length) throw new RangeError(`GeoDoubleParams indeksi aralık dışı (${value})`);
      keys.set(id, doubles[value]);
    } else if (location === TAG.GeoAsciiParams) {
      if (typeof ascii !== 'string' || value + count > ascii.length) throw new RangeError('GeoAsciiParams aralığı aşıldı');
      keys.set(id, ascii.slice(value, value + count));
    }
  }
  const geoText = typeof ascii === 'string'
    ? ascii.split('|').map((s) => s.replace(/\0/g, '').trim()).filter((s) => s.length > 0)
    : [];
  return { keys, geoText };
}

/**
 * Parses a single-band Mars Trek exportImage GeoTIFF.
 * @param {Uint8Array|ArrayBuffer} input raw response body
 * @returns {Readonly<{width:number,height:number,pixelType:'S16'|'F32',values:(Int16Array|Float32Array),validMask:Uint8Array,
 *   noDataDeclared:boolean,noDataValue:(number|null),noDataText:(string|null),pixelSizeDeg:number,
 *   bounds:Readonly<{west:number,east:number,south:number,north:number}>,meta:object}>}
 */
export function parseExportedTiff(input) {
  const u8 = toBytes(input);
  const len = u8.byteLength;
  if (len < 8) throw new RangeError('TIFF çok kısa');
  const order = String.fromCharCode(u8[0], u8[1]);
  let le;
  if (order === 'II') le = true;
  else if (order === 'MM') le = false;
  else throw new TypeError('TIFF bayt sırası tanınmıyor');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const magic = dv.getUint16(2, le);
  if (magic === 43) throw new TypeError('BigTIFF desteklenmiyor (ImageServer exportImage yanıtı classic TIFF)');
  if (magic !== 42) throw new TypeError(`TIFF sihirli sayısı tanınmıyor: ${magic}`);

  const entries = parseIfd(dv, u8, le);

  const width = scalarTag(entries, dv, u8, le, TAG.ImageWidth, 'ImageWidth');
  const height = scalarTag(entries, dv, u8, le, TAG.ImageLength, 'ImageLength');
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`geçersiz boyut ${width}x${height}`);
  }
  if (width * height > MAX_PIXELS) throw new RangeError(`piksel sayısı aşırı: ${width}x${height}`);

  const tiled = entries.has(TAG.TileWidth) || entries.has(TAG.TileLength) || entries.has(TAG.TileOffsets);
  if (tiled && (!entries.has(TAG.TileWidth) || !entries.has(TAG.TileLength) || !entries.has(TAG.TileOffsets) || !entries.has(TAG.TileByteCounts))) {
    throw new RangeError('karolu TIFF etiketleri eksik (TileWidth/TileLength/TileOffsets/TileByteCounts)');
  }
  if (tiled && entries.has(TAG.StripOffsets)) throw new TypeError('hem karolu hem şeritli etiketler var: belirsiz TIFF');
  if (optionalNumbers(entries, dv, u8, le, TAG.Compression, [1])[0] !== 1) {
    throw new TypeError('Sıkıştırmalı TIFF desteklenmiyor (Compression != 1)');
  }
  if (optionalNumbers(entries, dv, u8, le, TAG.Photometric, [1])[0] !== 1) {
    throw new TypeError('PhotometricInterpretation != 1 (BlackIsZero) desteklenmiyor');
  }
  if (optionalNumbers(entries, dv, u8, le, TAG.SamplesPerPixel, [1])[0] !== 1) {
    throw new TypeError('Çok bantlı TIFF desteklenmiyor (SamplesPerPixel != 1)');
  }
  if (optionalNumbers(entries, dv, u8, le, TAG.PlanarConfig, [1])[0] !== 1) {
    throw new TypeError('PlanarConfiguration != 1 desteklenmiyor');
  }

  const bpsArr = numbersTag(entries, dv, u8, le, TAG.BitsPerSample, 'BitsPerSample', 1);
  const sfArr = optionalNumbers(entries, dv, u8, le, TAG.SampleFormat, [1]);
  if (sfArr.length !== 1) throw new TypeError('SampleFormat tek bant için tek değer olmalı');
  let pixelType;
  if (bpsArr[0] === 16 && sfArr[0] === 2) pixelType = 'S16';
  else if (bpsArr[0] === 32 && sfArr[0] === 3) pixelType = 'F32';
  else throw new TypeError(`Desteklenmeyen piksel biçimi: BitsPerSample=${bpsArr[0]}, SampleFormat=${sfArr[0]} (yalnız S16 ve F32)`);
  const bytesPerSample = bpsArr[0] / 8;

  const total = width * height;
  const values = pixelType === 'S16' ? new Int16Array(total) : new Float32Array(total);
  const readAt = (o) => (pixelType === 'S16' ? dv.getInt16(o, le) : dv.getFloat32(o, le));
  let stripCount = 0;
  let rowsPerStrip = 0;
  let layout;
  if (tiled) {
    // Uncompressed tiles. The ImageServer writes full-size tiles that may be padded past the image edge
    // (e.g. a 100x100 image in 128x128 tiles, observed in Stage 26A Gale evidence); padding is skipped.
    const tw = numbersTag(entries, dv, u8, le, TAG.TileWidth, 'TileWidth', 1)[0];
    const tl = numbersTag(entries, dv, u8, le, TAG.TileLength, 'TileLength', 1)[0];
    if (!Number.isSafeInteger(tw) || !Number.isSafeInteger(tl) || tw < 16 || tl < 16 || tw % 16 || tl % 16) {
      throw new RangeError(`karo boyutu geçersiz: ${tw}x${tl} (16'nın katı, en az 16 olmalı)`);
    }
    const across = Math.ceil(width / tw);
    const down = Math.ceil(height / tl);
    const tileOffsets = numbersTag(entries, dv, u8, le, TAG.TileOffsets, 'TileOffsets');
    const tileBytes = numbersTag(entries, dv, u8, le, TAG.TileByteCounts, 'TileByteCounts');
    if (tileOffsets.length !== across * down || tileBytes.length !== across * down) {
      throw new RangeError(`karo sayısı uyuşmuyor: beklenen ${across * down}, offsets ${tileOffsets.length}, counts ${tileBytes.length}`);
    }
    const tileExpected = tw * tl * bytesPerSample;
    for (let t = 0; t < tileOffsets.length; t++) {
      if (tileBytes[t] !== tileExpected) throw new RangeError(`karo ${t} boyutu ${tileBytes[t]} != beklenen ${tileExpected} (sıkıştırmasız olmalı)`);
      assertRange(len, tileOffsets[t], tileExpected, `karo ${t}`);
      const tileRow = Math.floor(t / across);
      const tileCol = t % across;
      const rMax = Math.min(tl, height - tileRow * tl);
      const cMax = Math.min(tw, width - tileCol * tw);
      for (let r = 0; r < rMax; r++) {
        for (let c = 0; c < cMax; c++) {
          const o = tileOffsets[t] + (r * tw + c) * bytesPerSample;
          values[((tileRow * tl + r) * width) + tileCol * tw + c] = readAt(o);
        }
      }
    }
    stripCount = tileOffsets.length;
    rowsPerStrip = tl;
    layout = `tiled ${tw}x${tl}`;
  } else {
    const rowsPerStripRaw = optionalNumbers(entries, dv, u8, le, TAG.RowsPerStrip, [height])[0];
    rowsPerStrip = Math.min(rowsPerStripRaw, height);
    if (!Number.isSafeInteger(rowsPerStrip) || rowsPerStrip < 1) throw new RangeError('RowsPerStrip geçersiz');
    stripCount = Math.ceil(height / rowsPerStrip);
    const stripOffsets = numbersTag(entries, dv, u8, le, TAG.StripOffsets, 'StripOffsets');
    const stripBytes = numbersTag(entries, dv, u8, le, TAG.StripByteCounts, 'StripByteCounts');
    if (stripOffsets.length !== stripCount || stripBytes.length !== stripCount) {
      throw new RangeError(`şerit sayısı uyuşmuyor: beklenen ${stripCount}, offsets ${stripOffsets.length}, counts ${stripBytes.length}`);
    }
    for (let s = 0; s < stripCount; s++) {
      const rows = Math.min(rowsPerStrip, height - s * rowsPerStrip);
      const expected = rows * width * bytesPerSample;
      if (stripBytes[s] !== expected) {
        throw new RangeError(`şerit ${s} boyutu ${stripBytes[s]} != beklenen ${expected} (sıkıştırmasız olmalı)`);
      }
      assertRange(len, stripOffsets[s], expected, `şerit ${s}`);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < width; c++) {
          values[(s * rowsPerStrip + r) * width + c] = readAt(stripOffsets[s] + (r * width + c) * bytesPerSample);
        }
      }
    }
    layout = 'stripped';
  }

  // Georeferencing.
  if (entries.has(TAG.ModelTransformation)) throw new TypeError('ModelTransformation desteklenmiyor');
  const scale = numbersTag(entries, dv, u8, le, TAG.ModelPixelScale, 'ModelPixelScale');
  if (scale.length < 2) throw new RangeError('ModelPixelScale en az 2 değer olmalı');
  const [sx, sy] = scale;
  if (!(sx > 0) || !(sy > 0) || !Number.isFinite(sx) || !Number.isFinite(sy)) throw new RangeError('piksel ölçeği geçersiz');
  if (Math.abs(sx - sy) > 1e-9 * sx) throw new TypeError(`piksel kare değil (${sx} != ${sy})`);
  const tie = numbersTag(entries, dv, u8, le, TAG.ModelTiepoint, 'ModelTiepoint', 6);
  if (tie[0] !== 0 || tie[1] !== 0 || tie[2] !== 0) throw new TypeError('ModelTiepoint raster orijinde değil desteklenmiyor');
  if (!Number.isFinite(tie[3]) || !Number.isFinite(tie[4])) throw new RangeError('ModelTiepoint koordinatı geçersiz');

  const { keys, geoText } = readGeoKeys(entries, dv, u8, le);
  if (keys.get(GEOKEY.GTModelType) !== 2) throw new TypeError('GTModelType geografik (2) değil');
  const rasterTypeKey = keys.has(GEOKEY.GTRasterType) ? keys.get(GEOKEY.GTRasterType) : 1;
  if (rasterTypeKey !== 1 && rasterTypeKey !== 2) throw new TypeError(`GTRasterType desteklenmiyor: ${rasterTypeKey}`);
  if (keys.get(GEOKEY.GeogAngularUnits) !== DEG_PER_RAD_UNIT) throw new TypeError('GeogAngularUnits derece (9102) değil');
  const semiMajorAxisM = keys.has(GEOKEY.GeogSemiMajorAxis) ? keys.get(GEOKEY.GeogSemiMajorAxis) : null;
  const invFlattening = keys.has(GEOKEY.GeogInvFlattening) ? keys.get(GEOKEY.GeogInvFlattening) : null;

  const shift = rasterTypeKey === 2 ? 0.5 : 0; // PixelIsPoint: tie point is the pixel centre
  const west = tie[3] - shift * sx;
  const north = tie[4] + shift * sy;
  const bounds = Object.freeze({ west, east: west + width * sx, south: north - height * sy, north });

  // No-data.
  let noDataDeclared = false;
  let noDataValue = null;
  let noDataText = null;
  if (entries.has(TAG.GdalNoData)) {
    const text = decodeEntry(dv, u8, entries.get(TAG.GdalNoData), le).replace(/\0/g, '').trim();
    noDataText = text;
    noDataDeclared = true;
    if (/^nan$/i.test(text)) noDataValue = Number.NaN;
    else if (NUMBER_RE.test(text)) noDataValue = pixelType === 'F32' ? Math.fround(Number(text)) : Number(text);
    else throw new TypeError(`GDAL_NODATA metni çözümlenemedi: "${text}"`);
  }

  const validMask = new Uint8Array(total).fill(1);
  const counts = { total, valid: 0, invalid: 0, noDataMatches: 0, nanCount: 0, zeroCount: 0, suspiciousFillCount: 0 };
  let vmin = Number.POSITIVE_INFINITY;
  let vmax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i++) {
    const v = values[i];
    const isNaN_ = Number.isNaN(v);
    if (isNaN_) counts.nanCount++;
    if (v === 0) counts.zeroCount++;
    const fill = pixelType === 'S16' ? (v === -32768 || v === 32767) : (!Number.isFinite(v) || Math.abs(v) >= 1e30);
    if (fill) counts.suspiciousFillCount++;
    const matchesNoData = noDataDeclared && (Number.isNaN(noDataValue) ? isNaN_ : v === noDataValue);
    if (matchesNoData) counts.noDataMatches++;
    if (isNaN_ || matchesNoData) {
      validMask[i] = 0;
      counts.invalid++;
    } else {
      counts.valid++;
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
  }

  const meta = Object.freeze({
    byteOrder: le ? 'LE' : 'BE',
    bitsPerSample: bpsArr[0],
    sampleFormat: sfArr[0],
    layout,
    rowsPerStrip,
    stripCount,
    rasterType: rasterTypeKey === 2 ? 'PixelIsPoint' : 'PixelIsArea',
    tiepoint: Object.freeze({ lonDeg: tie[3], latDeg: tie[4] }),
    geo: Object.freeze({
      geographicType: keys.has(GEOKEY.GeographicType) ? keys.get(GEOKEY.GeographicType) : null,
      angularUnit: 'degree',
      semiMajorAxisM,
      inverseFlattening: invFlattening,
      geoText: Object.freeze(geoText),
    }),
    counts: Object.freeze({
      ...counts,
      validMinValue: counts.valid > 0 ? vmin : null,
      validMaxValue: counts.valid > 0 ? vmax : null,
    }),
    cellConvention: 'row 0 = north edge; centre lon = west + (col + 0.5) * pixelSizeDeg; lat = north - (row + 0.5) * pixelSizeDeg',
  });

  return Object.freeze({
    width,
    height,
    pixelType,
    values,
    validMask,
    noDataDeclared,
    noDataValue,
    noDataText,
    pixelSizeDeg: sx,
    bounds,
    meta,
  });
}
