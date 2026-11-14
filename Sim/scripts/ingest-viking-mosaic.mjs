// Stage 36A: Viking MDIM 2.1 colour global mosaic -> streamed 256 px tile pyramid + Jezero regional crop + manifest.
//
// Usage:  node scripts/ingest-viking-mosaic.mjs --input <path/to/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif> --out <dir>
//                                              [--maxLevel N] [--regionDeg D]
//
// The input is opened read-only and streamed row by row (64-row reads). It is never loaded whole. One pass over the file
// computes: the full-file SHA-256, the (0,0,0) no-data statistics, the native Jezero crop and the level-4 image; levels
// 0..3 are reduced from level 4 by an exact 2x2 box (alpha-weighted). Nothing is fetched from the network.
// Outputs go only under --out: tiles/{z}/{row}/{col}.png, regional-jezero-<D>deg-native.png, manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { WAYPOINTS } from '../public/js/config.js';
import {
  VIKING_EXPECTED, parseBigTiffHeader, verifyContiguousStrips, lonLatToNativePixel, nativePixelToLonLat,
  pyramidLevelGeometry, newNoDataStats, scanNoDataRow, cropRgbRowToRgba, createBoxAggregator,
  downsampleRgbaBox2, extractTileRgba, encodePngRgba,
} from '../public/js/geo/viking-mosaic.js';

const MAX_STREAM_LEVEL = 4;          // level 4 = 8192 x 4096 px (33.5 M px). Level 5 would need ~134 M px in memory.
const OUTPUT_BUDGET_BYTES = 40 * 1024 * 1024; // "~40 MB" target for all written output (tiles + regional PNG)
const ROWS_PER_READ = 64;
const PROGRESS_EVERY = 4096;
const SOURCE_NAME = 'Mars_Viking_MDIM21_ClrMosaic_global_232m.tif';
const LICENSE = 'belirtilmemiş';
const LICENSE_EVIDENCE = null; // filled only when the USGS product page was actually read (see stage36-viking-audit.md)
const ATTRIBUTION = 'Mars_Viking_MDIM21_ClrMosaic_global_232m.tif dosya adı: Viking MDIM 2.1 renkli küresel mozaiği; künye/lisans dosyada yok';
const NOTES = [
  'ortogörüntü değildir; yükseklik verisi değildir; yerel doku olarak kullanılamaz (232 m/piksel)',
  'Piramit düzeyleri 2:1 eşdikdörtgen karo şemasıdır (trek-tiles.js DEFAULT_SCHEME); z0 = 2x1 karo (512x256 dünya piksel).',
  'Seviye 4 ve altı tek geçişte, alan-ağırlıklı kutu filtresiyle (oran 11,25) üretilir; üst seviyeler 2x2 kutu ile türetilir.',
  '(0,0,0) = GDAL_NODATA 0: ortalamaya katılmaz; tüm bloğu no-data olan piksel alfa 0 olur, 0 renge ortalanmaz.',
];

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const o = { input: null, out: null, maxLevel: null, regionDeg: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--input') o.input = val();
    else if (a === '--out') o.out = val();
    else if (a === '--maxLevel') o.maxLevel = Number(val());
    else if (a === '--regionDeg') o.regionDeg = Number(val());
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.input) throw new Error('--input <tif> is required');
  if (!o.out) throw new Error('--out <dir> is required');
  if (o.maxLevel !== null && (!Number.isInteger(o.maxLevel) || o.maxLevel < 0 || o.maxLevel > MAX_STREAM_LEVEL)) {
    throw new Error(`--maxLevel must be an integer 0..${MAX_STREAM_LEVEL}`);
  }
  if (!(o.regionDeg > 0 && o.regionDeg <= 20)) throw new Error('--regionDeg must be in (0, 20]');
  return o;
}

const mib = (b) => Math.round((b / 1048576) * 10) / 10;

// ------------------------------------------------------------------ main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = performance.now();
  const inputPath = path.resolve(opts.input);
  const outDir = path.resolve(opts.out);
  console.log(`Kaynak (salt-okunur): ${inputPath}`);

  const fd = fs.openSync(inputPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const read = (off, len) => {
      const b = Buffer.allocUnsafe(len);
      const n = fs.readSync(fd, b, 0, len, off);
      if (n !== len) throw new Error(`short read at ${off}: ${n} of ${len} bytes`);
      return b;
    };

    // 1) Header and strip table: explicit errors for anything unexpected.
    const h = parseBigTiffHeader(read, size);
    const expect = (cond, msg) => { if (!cond) throw new Error(`header expectation failed: ${msg}`); };
    expect(h.width === VIKING_EXPECTED.width && h.height === VIKING_EXPECTED.height, `size ${h.width}x${h.height} != ${VIKING_EXPECTED.width}x${VIKING_EXPECTED.height}`);
    expect(h.bands === VIKING_EXPECTED.bands && h.bitsPerSample === 8, 'bands/bits');
    expect(h.compression === 1 && h.planarConfig === 1 && h.photometric === 2, 'compression/planar/photometric');
    expect(h.rowsPerStrip === VIKING_EXPECTED.rowsPerStrip && h.stripCount === VIKING_EXPECTED.stripCount, 'strip layout');
    expect(Math.abs(h.pixelScaleM - VIKING_EXPECTED.pixelScaleM) < 1e-9, `pixel scale ${h.pixelScaleM}`);
    expect(h.radiusM === VIKING_EXPECTED.radiusM && h.radiusMatchesInGeoDoubleParams >= 1, `radius ${h.radiusM}`);
    expect(h.noDataText === VIKING_EXPECTED.noDataText, `GDAL_NODATA "${h.noDataText}" (only 0 is supported)`);
    expect(h.geoKeys.rasterType === VIKING_EXPECTED.rasterType, 'PixelIsArea');
    const tiepointX = -Math.PI * VIKING_EXPECTED.radiusM, tiepointY = (Math.PI * VIKING_EXPECTED.radiusM) / 2;
    const tpResidualPx = Math.hypot(h.tiepoint.x - tiepointX, h.tiepoint.y - tiepointY) / VIKING_EXPECTED.pixelScaleM;
    expect(tpResidualPx <= 0.5, `tiepoint residual ${tpResidualPx.toFixed(3)} px exceeds half a pixel`);

    const strips = verifyContiguousStrips({
      stripOffsets: h.stripOffsets, stripByteCounts: h.stripByteCounts, width: h.width, height: h.height,
      bands: h.bands, rowsPerStrip: h.rowsPerStrip, fileSize: size,
    });
    expect(strips.countMatches, `strip count ${strips.stripCount} != ${strips.expectedStrips}`);
    expect(strips.contiguous, `strips not contiguous (first break at strip ${strips.firstBreak}, first bad count ${strips.firstBadCount})`);
    expect(strips.totalBytesMatches, `strip byte sum ${strips.sumBytes} != ${h.width * h.height * h.bands}`);
    expect(strips.withinFile, 'last strip ends past EOF');
    console.log(`Başlık doğrulandı: ${h.width}x${h.height}, ${h.bands}x${h.bitsPerSample} bit, sıkıştırmasız, ${h.stripCount} ardışık strip, dosya ${size} bayt.`);
    console.log(`Tiepoint artığı ${tpResidualPx.toFixed(4)} px; ölçek ${h.pixelScaleM} m/px; yarıçap ${h.radiusM} m.`);

    // 2) Output geometry: Jezero regional window (native pixels, centred on WAYPOINTS[0]).
    const W = h.width, H = h.height;
    const pxPerDeg = W / 360;
    const N = Math.round(opts.regionDeg * pxPerDeg);
    if (Math.abs(N - opts.regionDeg * pxPerDeg) > 1e-9) throw new Error(`--regionDeg ${opts.regionDeg} does not give an integer pixel window`);
    const wp = WAYPOINTS[0];
    const centre = lonLatToNativePixel(wp.lonDeg, wp.latDeg, W, H);
    const c0 = Math.min(W - N, Math.max(0, centre.col - N / 2));
    const r0 = Math.min(H - N, Math.max(0, centre.row - N / 2));
    const regionRgba = new Uint8Array(N * N * 4);

    // 3) Level-4 aggregation target (the finest streamed level) and the no-data scan.
    const L = MAX_STREAM_LEVEL;
    const g4 = pyramidLevelGeometry(L, h.pixelScaleM, W);
    const level4 = new Uint8Array(g4.worldWidthPx * g4.worldHeightPx * 4);
    const agg = createBoxAggregator({ srcWidth: W, srcHeight: H, dstWidth: g4.worldWidthPx, dstHeight: g4.worldHeightPx, dst: level4 });
    const stats = newNoDataStats();

    // 4) Single streamed pass: whole-file SHA-256 (header prefix, strips, trailing bytes), no-data scan, crop, aggregation.
    const sha = crypto.createHash('sha256');
    let hashed = 0;
    const hashRange = (start, end) => {
      for (let off = start; off < end; off += 16 * 1048576) {
        const len = Math.min(16 * 1048576, end - off);
        const b = read(off, len);
        sha.update(b);
        hashed += len;
      }
    };
    hashRange(0, h.stripOffsets[0]);
    const rowBytes = W * h.bands;
    const chunk = Buffer.allocUnsafe(ROWS_PER_READ * rowBytes);
    let peakRss = process.memoryUsage().rss;
    let rowsStreamed = 0;
    for (let y0 = 0; y0 < H; y0 += ROWS_PER_READ) {
      const n = Math.min(ROWS_PER_READ, H - y0);
      const len = n * rowBytes;
      const off = h.stripOffsets[y0]; // contiguous (verified above): row y0 starts at this offset
      const got = fs.readSync(fd, chunk, 0, len, off);
      if (got !== len) throw new Error(`short strip read at row ${y0}: ${got} of ${len} bytes`);
      sha.update(chunk.subarray(0, len));
      hashed += len;
      for (let k = 0; k < n; k++) {
        const y = y0 + k;
        const rgb = chunk.subarray(k * rowBytes, (k + 1) * rowBytes);
        scanNoDataRow(rgb, W, stats);
        agg.pushRow(y, rgb);
        if (y >= r0 && y < r0 + N) cropRgbRowToRgba(rgb, c0, N, regionRgba, (y - r0) * N);
        rowsStreamed++;
      }
      if (y0 % (PROGRESS_EVERY - (PROGRESS_EVERY % ROWS_PER_READ)) === 0) {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        console.log(`  satır ${y0 + n}/${H} (${((100 * (y0 + n)) / H).toFixed(1)}%), süre ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      }
    }
    const lastEnd = strips.dataEnd;
    hashRange(lastEnd, size);
    const sha256 = sha.digest('hex');
    if (hashed !== size) throw new Error(`hashed ${hashed} bytes of ${size}`);
    agg.finish();
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    // 5) Pyramid: level 4 from the aggregator, levels 0..3 by exact 2x2 reduction.
    const images = new Array(L + 1);
    images[L] = level4;
    for (let z = L - 1; z >= 0; z--) {
      const gz = pyramidLevelGeometry(z, h.pixelScaleM, W);
      images[z] = downsampleRgbaBox2(images[z + 1], gz.worldWidthPx * 2, gz.worldHeightPx * 2);
    }
    const alphaZeroFraction = (img) => {
      let zero = 0;
      for (let i = 3; i < img.length; i += 4) if (img[i] === 0) zero++;
      return zero / (img.length / 4);
    };

    // 6) Encode every candidate level and the regional PNG (in memory; sizes decide the default maxLevel).
    const regionPng = encodePngRgba(N, N, regionRgba);
    const encoded = [];
    for (let z = 0; z <= L; z++) {
      const gz = pyramidLevelGeometry(z, h.pixelScaleM, W);
      const tiles = [];
      for (let row = 0; row < gz.rows; row++) {
        for (let col = 0; col < gz.cols; col++) {
          const rgba = extractTileRgba(images[z], gz.worldWidthPx, gz.worldHeightPx, row, col, gz.tileSize);
          tiles.push({ row, col, png: encodePngRgba(gz.tileSize, gz.tileSize, rgba) });
        }
      }
      encoded.push({ z, gz, tiles, bytes: tiles.reduce((s, t) => s + t.png.length, 0), alphaZero: alphaZeroFraction(images[z]) });
    }

    // 7) Choose maxLevel: default = largest level whose cumulative output (z0..z plus regional PNG) fits the budget.
    const cumulative = [];
    let acc = regionPng.length;
    for (let z = 0; z <= L; z++) { acc += encoded[z].bytes; cumulative.push(acc); }
    let chosen;
    if (opts.maxLevel !== null) chosen = opts.maxLevel;
    else {
      chosen = -1;
      for (let z = 0; z <= L; z++) if (cumulative[z] <= OUTPUT_BUDGET_BYTES) chosen = z;
      if (chosen < 0) throw new Error(`even level 0 + regional PNG exceeds the ${mib(OUTPUT_BUDGET_BYTES)} MiB budget`);
    }
    const outputBytes = cumulative[chosen];
    const explicitOverBudget = opts.maxLevel !== null && outputBytes > OUTPUT_BUDGET_BYTES;

    // 8) Write only the chosen levels, the regional PNG and the manifest (under --out only).
    fs.mkdirSync(outDir, { recursive: true });
    fs.rmSync(path.join(outDir, 'tiles'), { recursive: true, force: true });
    for (let z = 0; z <= chosen; z++) {
      for (const t of encoded[z].tiles) {
        const dir = path.join(outDir, 'tiles', String(z), String(t.row));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${t.col}.png`), t.png);
      }
    }
    const regionName = `regional-jezero-${opts.regionDeg}deg-native.png`;
    fs.writeFileSync(path.join(outDir, regionName), regionPng);

    const regionLonWest = -180 + (c0 * 360) / W, regionLonEast = -180 + ((c0 + N) * 360) / W;
    const regionLatNorth = 90 - (r0 * 180) / H, regionLatSouth = 90 - ((r0 + N) * 180) / H;
    const noDataFull = {
      rule: '(0,0,0) = GDAL_NODATA 0 (all three bands zero); never averaged; blocks without valid pixels get alpha 0',
      scannedFullFile: true,
      totalPixels: stats.pixels,
      allZeroPixels: stats.allZero,
      allZeroFraction: stats.allZero / stats.pixels,
      anyZeroBandPixels: stats.anyZeroChannel,
      anyZeroBandFraction: stats.anyZeroChannel / stats.pixels,
    };

    const elapsedS = (performance.now() - t0) / 1000;
    const manifest = {
      schema: 'marswalk.viking-mdim-pyramid.v1',
      generatedBy: 'scripts/ingest-viking-mosaic.mjs',
      generatedAt: new Date().toISOString(),
      source: {
        file: SOURCE_NAME,
        bytes: size,
        sha256,
        sha256Method: 'Full-file SHA-256 computed in the single streamed pass (header prefix, every strip, trailing bytes); all bytes hashed (bytesHashed equals file size).',
        headerSummary: {
          format: h.format, byteOrder: h.byteOrder, width: h.width, height: h.height, bands: h.bands, bitsPerSample: h.bitsPerSample,
          compression: h.compression, photometric: h.photometric, planarConfig: h.planarConfig, rowsPerStrip: h.rowsPerStrip,
          stripCount: h.stripCount, firstStripOffsets: h.stripOffsets.slice(0, 6), dataStart: strips.dataStart, dataEnd: strips.dataEnd,
          pixelScaleM: h.pixelScaleM, tiepoint: { xM: h.tiepoint.x, yM: h.tiepoint.y, residualPx: tpResidualPx },
          radiusM: h.radiusM, radiusMatchesInGeoDoubleParams: h.radiusMatchesInGeoDoubleParams,
          geoKeys: { modelType: h.geoKeys.modelType, rasterType: h.geoKeys.rasterType, semiMajorAxisM: h.geoKeys.semiMajorAxisM },
          geoAsciiText: h.geoAsciiText, noDataText: h.noDataText,
        },
        stripCheck: strips,
      },
      projection: {
        type: 'plate carree (equirectangular, lon/lat degrees), PixelIsArea, sphere R = 3396190 m',
        lonRangeDeg: [-180, 180], latRangeDeg: [90, -90], pixelsPerDegree: pxPerDeg, nativeMPerPx: h.pixelScaleM,
        note: 'Metre scale checked against R: 360/W deg x R x pi/180 = native pixel size.',
      },
      scheme: {
        tileSize: 256, baseColumns: 2, baseRows: 1,
        pathOrder: 'tiles/{z}/{row}/{col}.png (z = level; row 0 = north; col 0 = west; same order as ortho-tiles)',
      },
      levels: encoded.map((e) => ({
        z: e.z,
        cols: e.gz.cols,
        rows: e.gz.rows,
        tiles: e.tiles.length,
        worldPx: [e.gz.worldWidthPx, e.gz.worldHeightPx],
        mPerPx: e.gz.mPerPx,
        degPerPx: e.gz.degPerPx,
        pngBytesTotal: e.bytes,
        pngBytesPerTileAvg: Math.round(e.bytes / e.tiles.length),
        pngBytesMaxTile: Math.max(...e.tiles.map((t) => t.png.length)),
        alphaZeroFraction: e.alphaZero,
        written: e.z <= chosen,
      })),
      maxLevelSelection: {
        rule: `largest level z <= ${MAX_STREAM_LEVEL} whose cumulative output (z0..z plus regional PNG) is <= ${OUTPUT_BUDGET_BYTES} bytes`,
        requested: opts.maxLevel,
        chosen,
        budgetBytes: OUTPUT_BUDGET_BYTES,
        cumulativeBytesByLevel: cumulative,
        exceedsBudgetByExplicitRequest: explicitOverBudget,
        streamLimitNote: `level ${MAX_STREAM_LEVEL + 1} (z5) needs ~${(4 * g4.worldWidthPx * g4.worldHeightPx * 4 / 1048576).toFixed(0)} MiB of RGBA in memory and would be about 4x the level-4 PNG size; not produced.`,
      },
      outputTotalBytes: outputBytes,
      regional: {
        file: regionName,
        sizePx: [N, N],
        nativeMPerPx: h.pixelScaleM,
        windowPixel: { col0: c0, row0: r0, cols: N, rows: N },
        centrePixel: { col: centre.col, row: centre.row, lonDeg: wp.lonDeg, latDeg: wp.latDeg, source: 'config.js WAYPOINTS[0] (Sol 120 / WB1)' },
        lonBoundsDeg: [regionLonWest, regionLonEast],
        latBoundsDeg: [regionLatSouth, regionLatNorth],
        bytes: regionPng.length,
        sha256: crypto.createHash('sha256').update(regionPng).digest('hex'),
        alphaZeroFraction: alphaZeroFraction(regionRgba),
        label: '232 m/piksel: native resolution, not finer; yerel doku değildir.',
      },
      noData: noDataFull,
      measurements: {
        elapsedSeconds: Math.round(elapsedS * 10) / 10,
        rowsStreamed,
        bytesHashed: hashed,
        chunkRows: ROWS_PER_READ,
        peakRssMiB: mib(peakRss),
        streamingBufferMiB: mib(chunk.length + level4.length + regionRgba.length),
      },
      license: LICENSE,
      licenseEvidence: LICENSE_EVIDENCE,
      attribution: ATTRIBUTION,
      notes: NOTES,
    };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    console.log('Seviye tablosu:');
    for (const l of manifest.levels) {
      console.log(`  z${l.z}: ${l.cols}x${l.rows} karo, ${l.worldPx[0]}x${l.worldPx[1]} px, ${l.mPerPx.toFixed(1)} m/px, ${mib(l.pngBytesTotal)} MiB${l.written ? '' : ' (yazılmadı)'}`);
    }
    console.log(`Seçilen maxLevel=${chosen}; toplam çıktı ${mib(outputBytes)} MiB (bütçe ${mib(OUTPUT_BUDGET_BYTES)} MiB).`);
    console.log(`No-data (0,0,0): ${stats.allZero} / ${stats.pixels} (${(100 * stats.allZero / stats.pixels).toFixed(4)} %).`);
    console.log(`SHA-256 ${sha256}`);
    console.log(`Süre ${elapsedS.toFixed(1)} s; tepe RSS ${mib(peakRss)} MiB.`);
    console.log(`Çıktı: ${outDir}`);
  } finally {
    fs.closeSync(fd);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
