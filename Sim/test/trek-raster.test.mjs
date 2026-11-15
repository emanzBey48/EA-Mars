// Stage 37A tests: Mars Trek exportImage GeoTIFF parser (synthetic TIFFs only; no network, no fixtures from disk).
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseExportedTiff } from '../public/js/geo/trek-raster.js';

const TYPE_SIZE = { 2: 1, 3: 2, 4: 4, 12: 8 };

/**
 * Minimal classic TIFF writer for tests. Options:
 *   width, height, format ('S16'|'F32'), values (row-major array), bigEndian, tile (edge, else strips),
 *   rowsPerStrip, nodata (string written to GDAL_NODATA), geo (default true), modelType, rasterType,
 *   angularUnits, pixelScale, pixelScaleY, tiepoint [lon,lat], tiepointIJ, samples, bitsPerSample,
 *   sampleFormat, compression, photometric, nextIfd, magic, corrupt ('tileByteCount'|'offsetOutside'|'truncate').
 */
function buildTiff(o) {
  const le = o.bigEndian !== true;
  const W = o.width;
  const H = o.height;
  const bps = o.format === 'S16' ? 2 : 4;
  const sampleFormat = o.sampleFormat ?? (o.format === 'S16' ? 2 : 3);
  const bitsPerSample = o.bitsPerSample ?? bps * 8;
  const val = (i) => o.values[i];
  const writeSample = (buf, off, v) => {
    if (o.format === 'S16') {
      if (le) buf.writeInt16LE(v, off); else buf.writeInt16BE(v, off);
    } else if (le) buf.writeFloatLE(v, off); else buf.writeFloatBE(v, off);
  };

  const blocks = [];
  let counts = [];
  let rowsPerStrip = o.rowsPerStrip ?? H;
  if (o.tile) {
    const t = o.tile;
    const across = Math.ceil(W / t);
    const down = Math.ceil(H / t);
    for (let tr = 0; tr < down; tr++) {
      for (let tc = 0; tc < across; tc++) {
        const buf = Buffer.alloc(t * t * bps); // zero padding past the image edge
        for (let r = 0; r < t; r++) {
          for (let c = 0; c < t; c++) {
            const gr = tr * t + r;
            const gc = tc * t + c;
            if (gr < H && gc < W) writeSample(buf, (r * t + c) * bps, val(gr * W + gc));
          }
        }
        blocks.push(buf);
      }
    }
    counts = blocks.map((b) => b.length);
  } else {
    rowsPerStrip = Math.min(rowsPerStrip, H);
    for (let s = 0; s * rowsPerStrip < H; s++) {
      const rows = Math.min(rowsPerStrip, H - s * rowsPerStrip);
      const buf = Buffer.alloc(rows * W * bps);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < W; c++) writeSample(buf, (r * W + c) * bps, val((s * rowsPerStrip + r) * W + c));
      }
      blocks.push(buf);
    }
    counts = blocks.map((b) => b.length);
  }

  const entries = [];
  const add = (tag, type, vals) => entries.push({ tag, type, vals });
  add(256, 3, [W]);
  add(257, 3, [H]);
  add(258, 3, [bitsPerSample]);
  add(259, 3, [o.compression ?? 1]);
  add(262, 3, [o.photometric ?? 1]);
  add(277, 3, [o.samples ?? 1]);
  add(284, 3, [1]);
  add(339, 3, [sampleFormat]);
  if (o.tile) {
    add(322, 3, [o.tile]);
    add(323, 3, [o.tile]);
    add(324, 4, blocks.map(() => 0));
    add(325, 4, counts.slice());
  } else {
    add(278, 3, [rowsPerStrip]);
    add(273, 4, blocks.map(() => 0));
    add(279, 4, counts.slice());
  }
  if (o.geo !== false) {
    const ps = o.pixelScale ?? 0.01;
    const psY = o.pixelScaleY ?? ps;
    const [tLon, tLat] = o.tiepoint ?? [77.0, 18.9];
    const ij = o.tiepointIJ ?? [0, 0, 0];
    add(33550, 12, [ps, psY, 0]);
    add(33922, 12, [...ij, tLon, tLat, 0]);
    const ascii = 'GCS Name = GCS_Mars_2000|Datum = D_Mars_2000|';
    const keys = [
      [1024, 0, 1, o.modelType ?? 2],
      [1025, 0, 1, o.rasterType ?? 1],
      [2048, 0, 1, 32767],
      [2054, 0, 1, o.angularUnits ?? 9102],
      [2057, 34736, 1, 1],
      [2059, 34736, 1, 2],
      [2049, 34737, ascii.length, 0],
    ];
    add(34735, 3, [1, 1, 0, keys.length, ...keys.flat()]);
    add(34736, 12, [0.0174532925199433, 3396190, 169.8944472236118]);
    add(34737, 2, ascii);
  }
  if (o.nodata !== undefined) add(42113, 2, `${o.nodata}\0`);
  entries.sort((a, b) => a.tag - b.tag);

  const encodeVals = (e) => {
    if (e.type === 2) return Buffer.from(`${e.vals}`, 'latin1');
    const size = TYPE_SIZE[e.type];
    const buf = Buffer.alloc(size * e.vals.length);
    e.vals.forEach((v, k) => {
      const off = k * size;
      if (e.type === 3) { if (le) buf.writeUInt16LE(v, off); else buf.writeUInt16BE(v, off); }
      else if (e.type === 4) { if (le) buf.writeUInt32LE(v, off); else buf.writeUInt32BE(v, off); }
      else if (e.type === 12) { if (le) buf.writeDoubleLE(v, off); else buf.writeDoubleBE(v, off); }
    });
    return buf;
  };

  const n = entries.length;
  const ifdOff = 8;
  const ifdLen = 2 + 12 * n + 4;
  let extrasLen = 0;
  for (const e of entries) {
    const size = e.type === 2 ? Buffer.byteLength(`${e.vals}`, 'latin1') : TYPE_SIZE[e.type] * e.vals.length;
    if (size > 4) extrasLen += size + (size % 2);
  }
  let cur = ifdOff + ifdLen + extrasLen;
  const blockOffsets = [];
  for (const b of blocks) { blockOffsets.push(cur); cur += b.length; }
  for (const e of entries) {
    if (e.tag === 273 || e.tag === 324) e.vals = blockOffsets.slice();
  }
  if (o.corrupt === 'tileByteCount') {
    const e = entries.find((x) => x.tag === 325);
    e.vals[0] += 4;
  }
  if (o.corrupt === 'offsetOutside') {
    const e = entries.find((x) => x.tag === 324 || x.tag === 273);
    e.vals[0] = 1e9;
  }
  const total = cur;
  const out = Buffer.alloc(total);
  out.write(le ? 'II' : 'MM', 0, 'latin1');
  if (le) { out.writeUInt16LE(o.magic ?? 42, 2); out.writeUInt32LE(ifdOff, 4); } else { out.writeUInt16BE(o.magic ?? 42, 2); out.writeUInt32BE(ifdOff, 4); }
  const w16 = (v, off) => (le ? out.writeUInt16LE(v, off) : out.writeUInt16BE(v, off));
  const w32 = (v, off) => (le ? out.writeUInt32LE(v, off) : out.writeUInt32BE(v, off));
  w16(n, ifdOff);
  let extraCur = ifdOff + ifdLen;
  entries.forEach((e, i) => {
    const at = ifdOff + 2 + 12 * i;
    const payload = encodeVals(e);
    w16(e.tag, at);
    w16(e.type, at + 2);
    w32(e.type === 2 ? payload.length : e.vals.length, at + 4);
    if (payload.length <= 4) {
      payload.copy(out, at + 8);
    } else {
      w32(extraCur, at + 8);
      payload.copy(out, extraCur);
      extraCur += payload.length + (payload.length % 2);
    }
  });
  w32(0, ifdOff + 2 + 12 * n); // nextIFD
  blocks.forEach((b, i) => b.copy(out, blockOffsets[i]));
  if (o.nextIfd) w32(o.nextIfd, ifdOff + 2 + 12 * n);
  if (o.corrupt === 'truncate') return out.subarray(0, out.length - 10);
  return out;
}

const GRID_W = 4;
const GRID_H = 3;
const grid = (f) => Array.from({ length: GRID_W * GRID_H }, (_, i) => f(i));

test('S16 strip TIFF with GeoKeys: size, values, bounds and ellipsoid parse exactly', () => {
  const values = grid((i) => -2700 + i * 10);
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values, pixelScale: 0.25, tiepoint: [77.0, 18.9] }));
  assert.equal(r.width, GRID_W);
  assert.equal(r.height, GRID_H);
  assert.equal(r.pixelType, 'S16');
  assert.equal(r.meta.layout, 'stripped');
  assert.deepEqual(Array.from(r.values), values);
  assert.equal(r.validMask.every((m) => m === 1), true);
  assert.equal(r.bounds.west, 77.0);
  assert.equal(r.bounds.north, 18.9);
  assert.ok(Math.abs(r.bounds.east - (77.0 + GRID_W * 0.25)) < 1e-12);
  assert.ok(Math.abs(r.bounds.south - (18.9 - GRID_H * 0.25)) < 1e-12);
  assert.equal(r.pixelSizeDeg, 0.25);
  assert.equal(r.meta.geo.semiMajorAxisM, 3396190);
  assert.equal(r.meta.geo.inverseFlattening, 169.8944472236118);
  assert.equal(r.meta.geo.geographicType, 32767);
  assert.equal(r.meta.geo.angularUnit, 'degree');
  assert.equal(r.meta.rasterType, 'PixelIsArea');
  assert.equal(r.meta.geo.geoText[0], 'GCS Name = GCS_Mars_2000');
});

test('F32 tiled TIFF with padded edge tiles reads only the image area', () => {
  const W = 20;
  const H = 18;
  const values = Array.from({ length: W * H }, (_, i) => Math.fround(-4500 + i * 0.5));
  const r = parseExportedTiff(buildTiff({ width: W, height: H, format: 'F32', values, tile: 16 }));
  assert.equal(r.pixelType, 'F32');
  assert.equal(r.meta.layout, 'tiled 16x16');
  assert.equal(r.values.length, W * H);
  assert.deepEqual(Array.from(r.values), values);
});

test('big-endian (MM) TIFF parses to the same values', () => {
  const values = grid((i) => i * 7 - 30);
  const le = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values }));
  const be = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values, bigEndian: true }));
  assert.equal(be.meta.byteOrder, 'BE');
  assert.deepEqual(Array.from(be.values), Array.from(le.values));
});

test('declared GDAL_NODATA: matching cells are invalid, keep their stored value (not 0)', () => {
  const values = grid((i) => (i === 2 || i === 7 ? -9999 : i + 1));
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'F32', values, nodata: '-9999' }));
  assert.equal(r.noDataDeclared, true);
  assert.equal(r.noDataValue, -9999);
  assert.equal(r.validMask[2], 0);
  assert.equal(r.validMask[7], 0);
  assert.equal(r.values[2], -9999, 'no-data cell keeps its raw value; it is never replaced with 0');
  assert.equal(r.values[7], -9999);
  assert.equal(r.meta.counts.noDataMatches, 2);
  assert.equal(r.meta.counts.invalid, 2);
  assert.equal(r.meta.counts.valid, GRID_W * GRID_H - 2);
});

test('no GDAL_NODATA tag: nothing is no-data; zeros and fill-like values are kept and counted', () => {
  const values = grid((i) => (i === 0 ? 0 : i === 1 ? -32768 : i + 100));
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values }));
  assert.equal(r.noDataDeclared, false);
  assert.equal(r.noDataValue, null);
  assert.equal(r.values[0], 0, 'zero is a value, not no-data');
  assert.equal(r.values[1], -32768, 'fill-like value is kept');
  assert.equal(r.validMask.every((m) => m === 1), true);
  assert.equal(r.meta.counts.zeroCount, 1);
  assert.equal(r.meta.counts.suspiciousFillCount, 1);
  assert.equal(r.meta.counts.invalid, 0);
});

test('F32 NaN cells are invalid and keep NaN (no zero substitution)', () => {
  const values = grid((i) => (i === 4 ? Number.NaN : i));
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'F32', values }));
  assert.equal(r.validMask[4], 0);
  assert.ok(Number.isNaN(r.values[4]));
  assert.equal(r.meta.counts.nanCount, 1);
  assert.equal(r.meta.counts.validMinValue, 0);
});

test('nodata text "nan" is honoured for F32 and matches NaN cells', () => {
  const values = grid((i) => (i === 3 ? Number.NaN : i + 0.5));
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'F32', values, nodata: 'nan' }));
  assert.equal(r.noDataDeclared, true);
  assert.ok(Number.isNaN(r.noDataValue));
  assert.equal(r.validMask[3], 0);
  assert.equal(r.meta.counts.noDataMatches, 1);
});

test('PixelIsPoint shifts the bounds by half a pixel', () => {
  const values = grid((i) => i);
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values, rasterType: 2, pixelScale: 0.5, tiepoint: [10, 20] }));
  assert.equal(r.meta.rasterType, 'PixelIsPoint');
  assert.equal(r.bounds.west, 10 - 0.25);
  assert.equal(r.bounds.north, 20 + 0.25);
});

test('min/max of valid values are reported', () => {
  const values = grid((i) => -10 + i);
  const r = parseExportedTiff(buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values }));
  assert.equal(r.meta.counts.validMinValue, -10);
  assert.equal(r.meta.counts.validMaxValue, -10 + GRID_W * GRID_H - 1);
});

test('unsupported formats fail with TypeError', () => {
  const values = grid((i) => i);
  const base = { width: GRID_W, height: GRID_H, format: 'S16', values };
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, compression: 5 })), TypeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, magic: 43 })), /BigTIFF/);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, samples: 3 })), TypeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, bitsPerSample: 8, sampleFormat: 1 })), TypeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, sampleFormat: 1 })), TypeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, photometric: 2 })), TypeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, nextIfd: 512 })), /çok IFD|nextIFD/);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, pixelScale: 0.1, pixelScaleY: 0.2 })), /kare değil/);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, tiepointIJ: [1, 0, 0] })), /raster orijinde/);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, modelType: 1 })), /geografik/);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, angularUnits: 9101 })), /derece/);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, nodata: 'bilinmeyen' })), TypeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, geo: false })), /ModelPixelScale|GeoKeyDirectory/);
});

test('corrupt sizes, offsets and truncated files fail with RangeError', () => {
  const values = grid((i) => i);
  const base = { width: GRID_W, height: GRID_H, format: 'S16', values };
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, corrupt: 'offsetOutside' })), RangeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, corrupt: 'truncate' })), RangeError);
  const tiled = { width: 20, height: 18, format: 'F32', values: Array.from({ length: 360 }, (_, i) => i), tile: 16 };
  assert.throws(() => parseExportedTiff(buildTiff({ ...tiled, corrupt: 'tileByteCount' })), RangeError);
  assert.throws(() => parseExportedTiff(buildTiff({ ...base, tile: 12 })), RangeError); // tile edge not a multiple of 16
});

test('non-TIFF input and wrong input types are rejected', () => {
  assert.throws(() => parseExportedTiff(new Uint8Array([1, 2, 3])), RangeError);
  assert.throws(() => parseExportedTiff(new Uint8Array(64)), TypeError); // byte order unknown
  assert.throws(() => parseExportedTiff('II*\0'), TypeError);
  assert.throws(() => parseExportedTiff(null), TypeError);
  const ok = buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values: grid((i) => i) });
  assert.throws(() => parseExportedTiff(ok.subarray(0, 4)), RangeError); // header cut short
});

test('ArrayBuffer input is accepted and the output is frozen', () => {
  const bytes = buildTiff({ width: GRID_W, height: GRID_H, format: 'S16', values: grid((i) => i) });
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const r = parseExportedTiff(ab);
  assert.equal(r.width, GRID_W);
  assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.bounds), true);
  assert.equal(Object.isFrozen(r.meta), true);
});

test('parsing is deterministic and does not mutate the input bytes', () => {
  const bytes = buildTiff({ width: GRID_W, height: GRID_H, format: 'F32', values: grid((i) => i * 0.25) });
  const copy = Buffer.from(bytes);
  const a = parseExportedTiff(bytes);
  const b = parseExportedTiff(bytes);
  assert.deepEqual(Array.from(a.values), Array.from(b.values));
  assert.deepEqual(a.bounds, b.bounds);
  assert.equal(Buffer.compare(Buffer.from(bytes), copy), 0);
});
