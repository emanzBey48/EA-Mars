// Stage 36A tests: Viking MDIM 2.1 BigTIFF header/strip checks, native lon/lat <-> pixel, box aggregation, PNG codec.
// Uses only small synthetic BigTIFFs built in memory. The 12.7 GB source file is NOT read here.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import {
  VIKING_EXPECTED, parseBigTiffHeader, verifyContiguousStrips, lonLatToNativePixel, nativePixelToLonLat,
  pyramidLevelGeometry, newNoDataStats, scanNoDataRow, cropRgbRowToRgba, createBoxAggregator,
  downsampleRgbaBox2, extractTileRgba, encodePngRgba, decodePngRgba, crc32,
} from '../public/js/geo/viking-mosaic.js';

const R = 3396190;
const PS = 231.5417872;

// ------------------------------------------------------------------ synthetic BigTIFF builder

function buildBigTiff(o = {}) {
  const W = o.W ?? 64, H = o.H ?? 32, bands = o.bands ?? 3, rps = o.rps ?? 1;
  const bits = o.bits ?? Array(bands).fill(8);
  const pixel = o.pixel ?? ((x, y) => [(x * 3) % 256, (y * 7) % 256, 128]);
  const rowBytes = W * bands;
  const nStrips = Math.ceil(H / rps);
  const rowsIn = (i) => Math.min(rps, H - i * rps);

  const S = (vals) => { const b = Buffer.alloc(2 * vals.length); vals.forEach((v, i) => b.writeUInt16LE(v, 2 * i)); return b; };
  const L = (vals) => { const b = Buffer.alloc(4 * vals.length); vals.forEach((v, i) => b.writeUInt32LE(v, 4 * i)); return b; };
  const D = (vals) => { const b = Buffer.alloc(8 * vals.length); vals.forEach((v, i) => b.writeDoubleLE(v, 8 * i)); return b; };
  const A = (s) => Buffer.from(s + '\0', 'latin1');
  const L8 = (n) => Buffer.alloc(8 * n);

  const stripOffRaw = L8(nStrips), stripCntRaw = L8(nStrips);
  const entries = [
    { id: 256, type: 4, count: 1, raw: L([W]) },
    { id: 257, type: 4, count: 1, raw: L([H]) },
    { id: 258, type: 3, count: bits.length, raw: S(bits) },
    { id: 259, type: 3, count: 1, raw: S([o.compression ?? 1]) },
    { id: 262, type: 3, count: 1, raw: S([o.photometric ?? 2]) },
    { id: 273, type: 16, count: nStrips, raw: stripOffRaw },
    { id: 277, type: 3, count: 1, raw: S([bands]) },
    { id: 278, type: 4, count: 1, raw: L([rps]) },
    { id: 279, type: 16, count: nStrips, raw: stripCntRaw },
    { id: 284, type: 3, count: 1, raw: S([o.planar ?? 1]) },
    { id: 33550, type: 12, count: 3, raw: D([PS, PS, 0]) },
    { id: 33922, type: 12, count: 6, raw: D([0, 0, 0, -Math.PI * R, Math.PI * R / 2, 0]) },
    { id: 34735, type: 3, count: 16, raw: S([1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 2057, 34736, 1, 0]) },
    { id: 34736, type: 12, count: 2, raw: D([R, R]) },
    { id: 34737, type: 2, count: 14, raw: A('Mars|GCS_Mars') },
  ];
  if (o.noData !== null) entries.push({ id: 42113, type: 2, count: 2, raw: A(o.noData ?? '0') });
  entries.sort((a, b) => a.id - b.id);

  const ifdOff = 16, ifdLen = 8 + entries.length * 20 + 8;
  let pos = ifdOff + ifdLen;
  for (const e of entries) {
    if (e.raw.length > 8) { e.off = pos; pos += e.raw.length + (e.raw.length & 1); }
  }
  const dataStart = pos;
  const counts = Array.from({ length: nStrips }, (_, i) => rowsIn(i) * rowBytes);
  if (o.countMutate) o.countMutate(counts);
  const offsets = [];
  let p = dataStart;
  for (let i = 0; i < nStrips; i++) { offsets.push(p); p += counts[i]; }
  if (o.offsetMutate) o.offsetMutate(offsets);
  offsets.forEach((v, i) => stripOffRaw.writeBigUInt64LE(BigInt(v), 8 * i));
  counts.forEach((v, i) => stripCntRaw.writeBigUInt64LE(BigInt(v), 8 * i));

  const total = dataStart + counts.reduce((s, v) => s + v, 0);
  const buf = Buffer.alloc(total);
  buf.write('II', 0, 'latin1');
  buf.writeUInt16LE(o.magic ?? 43, 2);
  buf.writeUInt16LE(8, 4);
  buf.writeUInt16LE(0, 6);
  buf.writeBigUInt64LE(BigInt(ifdOff), 8);
  buf.writeBigUInt64LE(BigInt(entries.length), ifdOff);
  entries.forEach((e, i) => {
    const eo = ifdOff + 8 + i * 20;
    buf.writeUInt16LE(e.id, eo);
    buf.writeUInt16LE(e.type, eo + 2);
    buf.writeBigUInt64LE(BigInt(e.count), eo + 4);
    if (e.raw.length > 8) buf.writeBigUInt64LE(BigInt(e.off), eo + 12);
    else e.raw.copy(buf, eo + 12);
    if (e.raw.length > 8) e.raw.copy(buf, e.off);
  });
  // Pixel rows, strip by strip (rps rows per strip), at the (possibly mutated) offsets.
  for (let i = 0; i < nStrips; i++) {
    let q = offsets[i];
    for (let y = i * rps; y < i * rps + rowsIn(i); y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b] = pixel(x, y);
        buf[q++] = r; buf[q++] = g; buf[q++] = b;
        if (bands === 4) buf[q++] = 255;
      }
    }
  }
  if (o.order) buf.write(o.order, 0, 'latin1');
  return buf;
}

const readerOf = (buf) => (off, len) => buf.subarray(off, off + len);
const parseOf = (buf, size = buf.length) => parseBigTiffHeader(readerOf(buf), size);

// ------------------------------------------------------------------ header and strips

test('BigTIFF header parses the synthetic RGB file and matches the verified Viking layout', () => {
  const buf = buildBigTiff({ W: 64, H: 32 });
  const h = parseOf(buf);
  assert.equal(h.width, 64);
  assert.equal(h.height, 32);
  assert.equal(h.bands, 3);
  assert.equal(h.bitsPerSample, 8);
  assert.equal(h.compression, 1);
  assert.equal(h.planarConfig, 1);
  assert.equal(h.photometric, 2);
  assert.equal(h.rowsPerStrip, 1);
  assert.equal(h.stripCount, 32);
  assert.equal(h.pixelScaleM, PS);
  assert.ok(Math.abs(h.tiepoint.x + Math.PI * R) < 1e-6);
  assert.equal(h.radiusM, R);
  assert.equal(h.radiusMatchesInGeoDoubleParams, 2);
  assert.equal(h.noDataText, '0');
  assert.ok(Object.isFrozen(h));
  assert.ok(Object.isFrozen(h.tiepoint));
  const v = verifyContiguousStrips({ stripOffsets: h.stripOffsets, stripByteCounts: h.stripByteCounts, width: h.width, height: h.height, bands: h.bands, rowsPerStrip: h.rowsPerStrip, fileSize: buf.length });
  assert.equal(v.contiguous, true);
  assert.equal(v.totalBytesMatches, true);
  assert.equal(v.withinFile, true);
  assert.equal(v.trailingBytes, 0);
});

test('the parser rejects unsupported formats with explicit messages', () => {
  assert.throws(() => parseOf(buildBigTiff({ magic: 42 })), /not a BigTIFF: magic 42/);
  assert.throws(() => parseOf(buildBigTiff({ order: 'MM' })), /big-endian is not supported/);
  assert.throws(() => parseOf(buildBigTiff({ compression: 5 })), /Compression 5 unsupported/);
  assert.throws(() => parseOf(buildBigTiff({ bits: [16, 16, 16] })), /not 8-bit/);
  assert.throws(() => parseOf(buildBigTiff({ bands: 4 })), /SamplesPerPixel 4 unsupported/);
  assert.throws(() => parseOf(buildBigTiff({ planar: 2 })), /PlanarConfiguration 2 unsupported/);
  assert.throws(() => parseOf(buildBigTiff({ photometric: 1 })), /Photometric\w* 1 unsupported/);
  assert.throws(() => parseOf(buildBigTiff({ noData: null })), /GDAL_NODATA.*missing/);
  assert.throws(() => parseOf(buildBigTiff({ countMutate: (c) => { c[3] += 8; } })), /strip 3: byte count/);
});

test('strip offsets running past the end of the file are rejected', () => {
  const buf = buildBigTiff({ W: 64, H: 32 });
  // Declare the file 10 bytes shorter than it is: the last strip now crosses the declared end.
  assert.throws(() => parseOf(buf, buf.length - 10), /strip 31: offset .* runs past end of file/);
});

test('a non-contiguous strip table is reported with the first break index', () => {
  const buf = buildBigTiff({ W: 64, H: 32, offsetMutate: (o) => { o[10] += 8; } });
  const h = parseOf(buf);
  const v = verifyContiguousStrips({ stripOffsets: h.stripOffsets, stripByteCounts: h.stripByteCounts, width: h.width, height: h.height, bands: h.bands, rowsPerStrip: h.rowsPerStrip, fileSize: buf.length });
  assert.equal(v.contiguous, false);
  assert.equal(v.firstBreak, 10);
  assert.equal(v.countMatches, true);
});

test('a wrong total byte count is reported by verifyContiguousStrips', () => {
  const counts = Array.from({ length: 32 }, () => 64 * 3);
  counts[0] -= 3;
  const offsets = counts.map((_, i) => 1000 + i * 192);
  const v = verifyContiguousStrips({ stripOffsets: offsets, stripByteCounts: counts, width: 64, height: 32, bands: 3, rowsPerStrip: 1, fileSize: 1e6 });
  assert.equal(v.totalBytesMatches, false);
  assert.equal(v.firstBadCount, 0);
  assert.equal(v.contiguous, false);
});

// ------------------------------------------------------------------ native lon/lat <-> pixel

test('Jezero waypoint maps to native column 65907 and row 18319', () => {
  const p = lonLatToNativePixel(77.44940206, 18.43906919);
  assert.equal(p.col, 65907);
  assert.equal(p.row, 18319);
  assert.ok(Math.abs(p.x - 65907.047) < 1e-2);
  assert.ok(Math.abs(p.y - 18319.598) < 1e-2);
});

test('edge ownership follows the trek-tiles policy (+180 == -180 is column 0, lat -90 is the last row)', () => {
  const W = VIKING_EXPECTED.width, H = VIKING_EXPECTED.height;
  assert.equal(lonLatToNativePixel(180, 0).col, 0);
  assert.equal(lonLatToNativePixel(-180, 0).col, 0);
  assert.equal(lonLatToNativePixel(540, 0).col, 0); // modulo 360
  assert.equal(lonLatToNativePixel(0, -90).row, H - 1);
  assert.equal(lonLatToNativePixel(0, 90).row, 0);
  assert.equal(lonLatToNativePixel(179.9999999, 0).col, W - 1);
  assert.equal(lonLatToNativePixel(0, -120).row, H - 1); // clamped latitude
  assert.throws(() => lonLatToNativePixel(0, NaN), /finite/);
  assert.throws(() => lonLatToNativePixel(NaN, 0), /finite|longitude/);
});

test('lon/lat -> pixel -> lon/lat round trip is within half a pixel', () => {
  const half = 0.5 / (VIKING_EXPECTED.width / 360); // half a native pixel, in degrees of longitude
  for (const [lon, lat] of [[77.44940206, 18.43906919], [-120.25, -55.5], [0.001, 0.001], [179.5, 89.5], [-179.5, -89.5]]) {
    const p = lonLatToNativePixel(lon, lat);
    const back = nativePixelToLonLat(p.x, p.y);
    const dLon = Math.abs(((back.lonDeg - lon + 540) % 360) - 180);
    assert.ok(dLon <= half, `lon ${lon}: ${dLon} > ${half}`);
    assert.ok(Math.abs(back.latDeg - lat) <= half, `lat ${lat}`);
  }
});

test('pyramid level geometry uses the 2:1 trek-tiles scheme and scales metres per pixel', () => {
  const g0 = pyramidLevelGeometry(0);
  assert.equal(g0.cols, 2);
  assert.equal(g0.rows, 1);
  assert.equal(g0.worldWidthPx, 512);
  assert.ok(Math.abs(g0.mPerPx - PS * 180) < 1e-6);
  const g4 = pyramidLevelGeometry(4);
  assert.equal(g4.cols, 32);
  assert.equal(g4.rows, 16);
  assert.equal(g4.worldWidthPx, 8192);
  assert.ok(Math.abs(g4.mPerPx - PS * 11.25) < 1e-6);
  assert.ok(Object.isFrozen(g4));
});

// ------------------------------------------------------------------ no-data and aggregation

test('no-data scan separates (0,0,0) from pixels with one zero band', () => {
  const row = Uint8Array.from([0, 0, 0, 0, 5, 9, 7, 0, 3, 1, 1, 1]);
  const s = scanNoDataRow(row, 4, newNoDataStats());
  // (0,0,0) is all-zero; (0,5,9) and (7,0,3) have one zero band each; (1,1,1) has none.
  assert.deepEqual(s, { pixels: 4, allZero: 1, anyZeroChannel: 3 });
});

test('crop maps (0,0,0) to alpha 0 and keeps valid pixels opaque', () => {
  const row = Uint8Array.from([0, 0, 0, 10, 20, 30]);
  const out = cropRgbRowToRgba(row, 0, 2, new Uint8Array(8), 0);
  assert.deepEqual([...out], [0, 0, 0, 0, 10, 20, 30, 255]);
});

test('box aggregation preserves a uniform colour exactly (integer 2x and fractional 2.25x ratios)', () => {
  const pix = (w, h) => { const a = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) { a[i * 3] = 60; a[i * 3 + 1] = 120; a[i * 3 + 2] = 180; } return a; };
  for (const [sw, dw] of [[4, 2], [9, 4]]) {
    const agg = createBoxAggregator({ srcWidth: sw, srcHeight: sw, dstWidth: dw, dstHeight: dw });
    const src = pix(sw, sw);
    for (let y = 0; y < sw; y++) agg.pushRow(y, src.subarray(y * sw * 3, (y + 1) * sw * 3));
    const out = agg.finish();
    for (let i = 0; i < dw * dw; i++) assert.deepEqual([...out.subarray(i * 4, i * 4 + 4)], [60, 120, 180, 255], `${sw}->${dw} pixel ${i}`);
  }
});

test('no-data pixels do not enter the mean: half-zero block averages only valid pixels and keeps alpha 255', () => {
  // 4x2 source -> 2x1 destination (2x2 blocks). Block 0 = {(0,0,0),(100,50,20)} per row; block 1 = all no-data.
  const src = Uint8Array.from([
    0, 0, 0, 100, 50, 20, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 100, 50, 20, 0, 0, 0, 0, 0, 0,
  ]);
  const agg = createBoxAggregator({ srcWidth: 4, srcHeight: 2, dstWidth: 2, dstHeight: 1 });
  agg.pushRow(0, src.subarray(0, 12));
  agg.pushRow(1, src.subarray(12, 24));
  const out = agg.finish();
  assert.deepEqual([...out.subarray(0, 4)], [100, 50, 20, 255], 'mean of valid pixels only, not darkened to 50,25,10');
  assert.deepEqual([...out.subarray(4, 8)], [0, 0, 0, 0], 'all no-data block is alpha 0, never 0 averaged into colour');
});

test('fractional overlap weights: partial coverage is weighted by the overlap length', () => {
  // 3x1 source -> 2x1 destination, sx = 1.5. Dst 0 covers src [0,1.5), dst 1 covers [1.5,3).
  const src = Uint8Array.from([0, 0, 0, 90, 0, 0, 30, 0, 0]);
  const agg = createBoxAggregator({ srcWidth: 3, srcHeight: 1, dstWidth: 2, dstHeight: 1 });
  agg.pushRow(0, src);
  const out = agg.finish();
  assert.equal(out[0], 90); // only valid overlap is src 1 (weight 0.5) -> mean 90
  assert.equal(out[3], 255);
  assert.equal(out[4], 50); // (0.5*90 + 1*30) / 1.5
  assert.equal(out[7], 255);
});

test('box aggregator enforces row order, completeness and downsampling only', () => {
  const agg = createBoxAggregator({ srcWidth: 2, srcHeight: 2, dstWidth: 1, dstHeight: 1 });
  assert.throws(() => agg.pushRow(1, new Uint8Array(6)), /in order/);
  agg.pushRow(0, new Uint8Array(6));
  assert.throws(() => agg.finish(), /only 1 of 2/);
  assert.throws(() => createBoxAggregator({ srcWidth: 2, srcHeight: 2, dstWidth: 4, dstHeight: 1 }), /downsamples/);
});

test('2x2 reduction is alpha-weighted and keeps fully transparent blocks at 0', () => {
  // 4x2 image. Row 0: two valid pixels (10,20,30) and (50,60,70) in the first block, then two transparent pixels.
  // Row 1 is entirely transparent.
  const img = Uint8Array.from([
    10, 20, 30, 255, 50, 60, 70, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const out = downsampleRgbaBox2(img, 4, 2);
  assert.deepEqual([...out.subarray(0, 4)], [30, 40, 50, 255]);
  assert.deepEqual([...out.subarray(4, 8)], [0, 0, 0, 0]);
});

test('extractTileRgba copies the requested 256 px tile', () => {
  const W = 512, H = 256;
  const img = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.set([x & 255, y, 0, 255], (y * W + x) * 4);
  const t = extractTileRgba(img, W, H, 0, 1);
  assert.equal(t.length, 256 * 256 * 4);
  assert.deepEqual([...t.subarray(0, 4)], [0, 0, 0, 255]); // tile origin = source x 256
  assert.throws(() => extractTileRgba(img, W, H, 1, 0), /outside/);
});

// ------------------------------------------------------------------ PNG codec

test('PNG encode -> decode is byte exact, uses filter 0 and inflates to the expected scanlines', () => {
  const w = 17, h = 9;
  let s = 12345;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i++) { s = (s * 1103515245 + 12345) >>> 0; rgba[i] = s >>> 24; }
  const png = encodePngRgba(w, h, rgba);
  const dec = decodePngRgba(png);
  assert.equal(dec.width, w);
  assert.equal(dec.height, h);
  assert.deepEqual(Buffer.from(dec.rgba), Buffer.from(rgba));
  // IDAT chunk starts after the 8-byte signature + IHDR chunk (8 + 13 + 4 = 25 bytes).
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.toString('latin1', 37, 41), 'IDAT');
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(raw.length, (w * 4 + 1) * h);
  for (let y = 0; y < h; y++) assert.equal(raw[y * (w * 4 + 1)], 0, `row ${y} filter`);
});

test('PNG encoding is deterministic for identical input', () => {
  const rgba = new Uint8Array(8 * 8 * 4).map((_, i) => (i * 37) & 255);
  assert.deepEqual(encodePngRgba(8, 8, rgba), encodePngRgba(8, 8, rgba));
});

test('PNG decoder rejects a corrupted chunk (CRC mismatch) and a bad signature', () => {
  const png = encodePngRgba(4, 4, new Uint8Array(4 * 4 * 4).fill(9));
  const bad = Buffer.from(png);
  bad[45] ^= 0x01; // inside the IDAT payload
  assert.throws(() => decodePngRgba(bad), /CRC mismatch/);
  assert.throws(() => decodePngRgba(Buffer.from('not a png at all')), /bad signature/);
});

test('crc32 matches the known IEND vector', () => {
  assert.equal(crc32(Buffer.from('IEND', 'latin1')), 0xae426082);
});

test('parsed and computed results are deep-frozen, so callers cannot mutate them', () => {
  const p = lonLatToNativePixel(10, 10);
  assert.ok(Object.isFrozen(p));
  const g = pyramidLevelGeometry(2);
  assert.ok(Object.isFrozen(g));
});
