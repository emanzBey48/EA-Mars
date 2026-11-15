import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MARS_RADIUS_M, sha256Hex, parseCapabilities, deriveMatrixGeometry, groundSampleDistance, scaleDenominatorImpliedDegPerPx,
  tileBoundsDeg, tileBoundsProjectedM, lonLatToGlobalPixel, globalPixelToLonLat, pixelCenterToLonLat, globalPixelToTile,
  pixelBoundsForBbox, tileCoverageForBbox, crc32, decodePng, encodePng, readPngHeader, buildMosaic, uvMappingForWindow, localToUv,
  parseFgdc, auditInventory, namedWindows, expandBboxMetres, defaultLocalAdapter, runBuild,
} from '../scripts/build-ortho-mosaic.mjs';
import {
  readDtmWindow, windowEdgesLonLat, resampleOrthoToDtm, terrainFromDtm, hillshadeFromTerrain, brightnessGradient,
  bilinear, correlateAtShift, scanShifts, peakSummary, decideRegistration, runValidation, THRESHOLDS,
} from '../scripts/validate-ortho-registration.mjs';
import { EquirectangularProjection } from '../public/js/geo/geo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data', 'mars-trek');
const TILES = path.join(DATA, 'ortho-tiles');
const caps = parseCapabilities(fs.readFileSync(path.join(DATA, 'hirise_ortho_25cm_WMTSCapabilities.xml'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const geo = (z) => deriveMatrixGeometry(caps.matrices.get(z));
const readTile = (z, row, col) => { const p = path.join(TILES, String(z), String(row), `${col}.png`); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// deterministic pseudo-random bytes
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 24; }; }
function synth(width, height, channels, seed = 1) {
  const r = lcg(seed), data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = r();
  return { width, height, channels, data };
}

// ---------------------------------------------------------------- capabilities and tile math
test('capabilities: 18 active matrices (commented legacy set ignored), CRS and layer', () => {
  assert.equal(caps.matrices.size, 18);
  assert.deepEqual([...caps.matrices.keys()], Array.from({ length: 18 }, (_, i) => i));
  assert.equal(caps.matrices.get(0).matrixWidth, 2); // the commented block says 3
  assert.equal(caps.supportedCrs, 'urn:ogc:def:crs:EPSG::104905');
  assert.equal(caps.tileMatrixSetId, 'default028mm');
  assert.equal(caps.layerId, 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd');
  assert.match(caps.resourceUrlTemplate, /\{TileMatrix\}\/\{TileRow\}\/\{TileCol\}\.png$/);
  const g17 = caps.matrices.get(17);
  assert.deepEqual([g17.matrixWidth, g17.matrixHeight, g17.tileWidth, g17.tileHeight, g17.topLeftLonDeg, g17.topLeftLatDeg], [262144, 131072, 256, 256, -180, 90]);
});

test('tile geometry: whole-globe matrix, exact degrees per pixel, tile bounds', () => {
  const g0 = geo(0), g16 = geo(16), g17 = geo(17);
  near(g0.degPerPx, 180 / 256);
  near(g17.degPerPx, 360 / (262144 * 256), 1e-18);
  near(g17.degPerPx * 2, g16.degPerPx, 1e-18);
  assert.deepEqual(tileBoundsDeg(g0, 0, 0), { west: -180, east: 0, north: 90, south: -90 }); // zoom 0: 2x1 tiles, 180 deg each
  assert.deepEqual(tileBoundsDeg(g0, 0, 1), { west: 0, east: 180, north: 90, south: -90 });
  assert.throws(() => tileBoundsDeg(g0, 1, 0), RangeError); // matrix is 2x1
  // manifest level ranges (independent, from the dataset provider) at zoom 16
  const nw = tileBoundsDeg(g16, 26053, 93733), se = tileBoundsDeg(g16, 26057, 93736);
  near(nw.north, 18.44329833984375); near(nw.west, 77.44537353515625);
  near(se.south, 18.4295654296875); near(se.east, 77.45635986328125);
  // rows run north -> south
  assert.ok(tileBoundsDeg(g16, 26054, 93733).north < nw.north);
});

test('projected metre bounds use R=3396190 m equirectangular (latTs0=0, lon0=0)', () => {
  const g = geo(17);
  const b = tileBoundsProjectedM(g, 52111, 187470);
  const d = tileBoundsDeg(g, 52111, 187470);
  near(b.xMin, d.west * MARS_RADIUS_M * Math.PI / 180, 1e-6);
  near(b.yMax, d.north * MARS_RADIUS_M * Math.PI / 180, 1e-6);
  near(b.xMax - b.xMin, 256 * g.degPerPx * MARS_RADIUS_M * Math.PI / 180, 1e-6);
});

test('GSD: zoom 17 is ~0.318 m/px (N-S, projected) and ~0.302 m on-ground E-W at Jezero, NOT 0.25 m', () => {
  const lat = 18.4357;
  const g16 = groundSampleDistance(geo(16), lat), g17 = groundSampleDistance(geo(17), lat);
  near(g17.northSouthM, 0.31797, 1e-4);
  near(g17.eastWestGroundM, 0.30166, 1e-4);
  near(g16.northSouthM, 0.63595, 2e-4);
  assert.ok(g17.northSouthM > 0.25 && g17.eastWestGroundM > 0.25);
  // manifest-declared resolutions agree to its printed precision
  for (const L of manifest.files.ortho_tiles.levels) near(groundSampleDistance(geo(L.zoom), lat).northSouthM, L.resolution_m_per_px, 1e-3);
});

test('ScaleDenominator in the XML is Earth-based: it does not reproduce the Mars degree grid', () => {
  const m = caps.matrices.get(17), g = geo(17);
  const earthMean = scaleDenominatorImpliedDegPerPx(m, 6371007.2);
  const mars = scaleDenominatorImpliedDegPerPx(m, MARS_RADIUS_M);
  assert.ok(Math.abs(earthMean / g.degPerPx - 1) < 0.002);
  assert.ok(Math.abs(mars / g.degPerPx - 1) > 0.5);
});

test('pixel <-> lon/lat round trip with explicit pixel-is-area convention', () => {
  const g = geo(17);
  for (const [lon, lat] of [[77.4494015, 18.4386299], [77.4517, 18.4328], [-179.999, 89.5], [0, 0]]) {
    const p = lonLatToGlobalPixel(g, lon, lat), q = globalPixelToLonLat(g, p.gx, p.gy);
    near(q.lonDeg, lon, 1e-9); near(q.latDeg, lat, 1e-9);
  }
  // integer coordinate = pixel edge; centre is +0.5 px
  const edge = globalPixelToLonLat(g, 47991674, 13339633), centre = pixelCenterToLonLat(g, 47991674, 13339633);
  near(centre.lonDeg - edge.lonDeg, g.degPerPx / 2, 1e-12);
  near(edge.latDeg - centre.latDeg, g.degPerPx / 2, 1e-12);
  // tile edge consistency: top-left pixel of tile equals tileBoundsDeg corner
  const t = tileBoundsDeg(g, 52107, 187467), e = globalPixelToLonLat(g, 187467 * 256, 52107 * 256);
  near(e.lonDeg, t.west, 1e-9); near(e.latDeg, t.north, 1e-9);
  assert.deepEqual(globalPixelToTile(g, 187467 * 256 + 255, 52107 * 256 + 3), { col: 187467, row: 52107, px: 255, py: 3 });
});

test('tile coverage: exact tile bbox -> that tile only; corridor completely present at zoom 17', () => {
  const g = geo(17);
  const b = tileBoundsDeg(g, 52111, 187470);
  const c = tileCoverageForBbox(g, b);
  assert.deepEqual(c.tiles, [{ row: 52111, col: 187470 }]);
  const cc = manifest.target_region.corridor_bounds;
  const cov = tileCoverageForBbox(g, { west: cc.west_lon_deg, east: cc.east_lon_deg, south: cc.south_lat_deg, north: cc.north_lat_deg });
  assert.ok(cov.tiles.length > 0);
  for (const t of cov.tiles) assert.ok(readTile(17, t.row, t.col), `missing ${t.row}/${t.col}`);
});

test('window gaps are reported honestly: config route bbox is NOT covered by zoom 15-17, is by zoom 14', () => {
  const route = namedWindows({ manifest }).route;
  const missingAt = (z) => tileCoverageForBbox(geo(z), route).tiles.filter((t) => !readTile(z, t.row, t.col)).length;
  assert.ok(missingAt(17) > 0);
  assert.ok(missingAt(16) > 0);
  assert.equal(missingAt(14), 0);
});

// ---------------------------------------------------------------- PNG codec
test('crc32 known vector', () => assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926));

test('PNG encode/decode round trip: every filter type 0-4, channels 1-4, odd sizes', () => {
  for (const channels of [1, 2, 3, 4]) {
    for (const filterType of [0, 1, 2, 3, 4]) {
      const img = synth(13, 7, channels, 10 * channels + filterType);
      const back = decodePng(encodePng(img, { filterType }));
      assert.equal(back.width, 13); assert.equal(back.height, 7); assert.equal(back.channels, channels);
      assert.deepEqual(Buffer.from(back.data), Buffer.from(img.data), `ch${channels} f${filterType}`);
    }
  }
  const mixed = synth(32, 10, 2, 99);
  assert.deepEqual(Buffer.from(decodePng(encodePng(mixed, { filterType: [0, 1, 2, 3, 4] })).data), Buffer.from(mixed.data));
});

test('PNG encode is deterministic and decode fails closed on bad input', () => {
  const img = synth(20, 20, 2, 5);
  const a = encodePng(img), b = encodePng(img);
  assert.ok(a.equals(b));
  const h = readPngHeader(a);
  assert.deepEqual([h.width, h.height, h.bitDepth, h.colorType, h.interlace], [20, 20, 8, 4, 0]);
  const flip = (buf, off, v) => { const c = Buffer.from(buf); c[off] = v; return c; };
  assert.throws(() => decodePng(flip(a, 0, 0)), /signature/);
  assert.throws(() => decodePng(flip(a, 20, a[20] ^ 0xff)), /CRC/); // IHDR payload corrupted
  assert.throws(() => decodePng(a.subarray(0, a.length - 20)), /Truncated|IEND|CRC/);
  // unsupported bit depth / interlace / color type, with valid CRCs
  const reCrc = (buf) => { const c = Buffer.from(buf); c.writeUInt32BE(crc32(c.subarray(12, 29)), 29); return c; };
  assert.throws(() => decodePng(reCrc(flip(a, 24, 16))), /bit depth/);
  assert.throws(() => decodePng(reCrc(flip(a, 28, 1))), /Interlaced/);
  assert.throws(() => decodePng(reCrc(flip(a, 25, 3))), /color type/);
});

// ---------------------------------------------------------------- real tiles
test('all 91 tiles: IHDR is 256x256, 8-bit, grayscale+alpha, non-interlaced', () => {
  let n = 0;
  for (const L of manifest.files.ortho_tiles.levels) {
    for (let row = L.row_range[0]; row <= L.row_range[1]; row++) for (let col = L.col_range[0]; col <= L.col_range[1]; col++) {
      const h = readPngHeader(readTile(L.zoom, row, col));
      assert.deepEqual([h.width, h.height, h.bitDepth, h.colorType, h.interlace], [256, 256, 8, 4, 0], `${L.zoom}/${row}/${col}`);
      n++;
    }
  }
  assert.equal(n, manifest.files.ortho_tiles.total_tiles);
});

test('inventory audit vs manifest: counts, bytes, lat/lon ranges, resolution all match (manifest has no per-tile hashes)', () => {
  const a = auditInventory({ manifest, tilesRoot: TILES, matrices: caps.matrices });
  assert.equal(a.totalTilesFound, 91);
  for (const l of a.levels) {
    assert.ok(l.tileCountMatchesManifest && l.bytesMatchManifest && l.latRangeMatches && l.lonRangeMatches && l.resolutionMatches, `zoom ${l.zoom}`);
  }
  assert.equal(manifest.files.ortho_tiles.levels.some((l) => l.sha256 || l.tiles), false);
});

test('real tiles decode: pinned sha256 (as received) and dimensions', () => {
  const pinned = {
    '17/52107/187467': '8d7981985591ff61fe5d0a96476da8ccb8b7aa05256e5c079929c62e8de94e7a',
    '17/52111/187470': '1f95d0180e81d73425616a3b58bb54b557ce66811edee9b97154aa413f535983',
    '16/26053/93733': '385cf1c880080b8c64bb73c7842571dcb957d6d013866191627b08830b71054b',
  };
  for (const [k, hash] of Object.entries(pinned)) {
    const [z, row, col] = k.split('/').map(Number);
    const buf = readTile(z, row, col);
    assert.equal(sha256Hex(buf), hash, k);
    const img = decodePng(buf);
    assert.deepEqual([img.width, img.height, img.channels], [256, 256, 2]);
    // re-encode round trip preserves pixels exactly
    assert.deepEqual(Buffer.from(decodePng(encodePng(img, { filterType: 4 })).data), Buffer.from(img.data));
    // imagery is not blank (guards against a decoder returning zeros)
    const vals = new Set(); for (let i = 0; i < img.data.length; i += 2) vals.add(img.data[i]);
    assert.ok(vals.size > 50);
  }
});

test('FGDC parse: title, abstract verbatim, empty rights/constraints stay empty (no invented licence)', () => {
  const f = parseFgdc(fs.readFileSync(path.join(DATA, 'hirise_ortho_25cm_fgdc.html'), 'utf8'));
  assert.equal(f.title, 'MRO HiRISE, Jezero Mosaic, Controlled');
  assert.match(f.abstract, /USGS Astrogeology Science Center has generated and delivered/);
  assert.equal(f.dcRights, ''); assert.equal(f.useConstraints, ''); assert.equal(f.originator, '');
  near(f.boundsDeg.west, 77.22293); near(f.boundsDeg.north, 18.66931);
});

// ---------------------------------------------------------------- mosaic (synthetic and real)
test('mosaic placement: synthetic tiles land at the right pixels; crop is pixel exact', () => {
  const g = geo(17);
  const mk = (row, col) => { const img = synth(256, 256, 2, row * 7 + col); for (let i = 1; i < img.data.length; i += 2) img.data[i] = 255; return img; };
  const tiles = { '0/0': mk(0, 0), '0/1': mk(0, 1), '1/0': mk(1, 0), '1/1': mk(1, 1) };
  const base = { row: 52107, col: 187467 };
  const store = new Map();
  for (const [k, v] of Object.entries(tiles)) { const [r, c] = k.split('/').map(Number); store.set(`${base.row + r}/${base.col + c}`, v); }
  const readSynth = (row, col) => { const v = store.get(`${row}/${col}`); return v ? encodePng(v) : null; };
  const x0 = base.col * 256 + 200, y0 = base.row * 256 + 250;
  const px = { x0, y0, x1: x0 + 120, y1: y0 + 20 };
  const m = buildMosaic({ matrix: g, pixelBounds: px, readTile: readSynth });
  assert.deepEqual([m.width, m.height, m.channels, m.missing.length, m.tiles.length], [120, 20, 2, 0, 4]);
  const at = (gx, gy) => { const t = store.get(`${Math.floor(gy / 256)}/${Math.floor(gx / 256)}`); return t.data[((gy % 256) * 256 + (gx % 256)) * 2]; };
  for (const [dx, dy] of [[0, 0], [55, 0], [56, 5], [119, 19], [60, 6]]) assert.equal(m.data[(dy * 120 + dx) * 2], at(x0 + dx, y0 + dy), `${dx},${dy}`);
});

test('mosaic missing tiles: fail closed by default; explicit mode leaves alpha 0 and lists them', () => {
  const g = geo(17);
  const opaque = synth(256, 256, 2, 3);
  for (let i = 1; i < opaque.data.length; i += 2) opaque.data[i] = 255;
  const img = encodePng(opaque);
  const rd = (row, col) => (row === 100 && col === 100 ? img : null);
  const px = { x0: 100 * 256, y0: 100 * 256, x1: 100 * 256 + 300, y1: 100 * 256 + 10 };
  assert.throws(() => buildMosaic({ matrix: g, pixelBounds: px, readTile: rd }), (e) => e.missing.length === 1 && e.missing[0].col === 101);
  const m = buildMosaic({ matrix: g, pixelBounds: px, readTile: rd, allowMissing: true });
  assert.deepEqual(m.missing, [{ row: 100, col: 101 }]);
  assert.equal(m.transparentPixels, (300 - 256) * 10);
  for (let x = 256; x < 300; x++) assert.equal(m.data[x * 2 + 1], 0);
});

test('UV mapping: corners map to 0/1 and agree with geo.js local plane', () => {
  const g = geo(17), ad = defaultLocalAdapter();
  const px = { x0: 47991674, y0: 13339633, x1: 47992856, y1: 13341459 };
  const map = uvMappingForWindow(g, px, (la, lo) => ad.latLonToLocal(la, lo));
  const nw = globalPixelToLonLat(g, px.x0, px.y0), se = globalPixelToLonLat(g, px.x1, px.y1);
  const a = ad.latLonToLocal(nw.latDeg, nw.lonDeg), b = ad.latLonToLocal(se.latDeg, se.lonDeg);
  near(map.localBoundsM.xMin, a.x, 1e-9); near(map.localBoundsM.yMax, a.y, 1e-9);
  const uvNw = localToUv(map, a.x, a.y), uvSe = localToUv(map, b.x, b.y);
  near(uvNw.u, 0, 1e-12); near(uvNw.v, 0, 1e-12); near(uvSe.u, 1, 1e-12); near(uvSe.v, 1, 1e-12);
  // width/height in metres follow the 0.318 m/px projected GSD
  near(map.sizeM.width / (px.x1 - px.x0), groundSampleDistance(g, 18.4).eastWestProjectedM, 1e-9);
  // a sim-plane point maps to the matching pixel centre: Sol 120 waypoint pixel
  const wp = ad.latLonToLocal(18.43906919, 77.44940206);
  const uv = localToUv(map, wp.x, wp.y);
  const gp = lonLatToGlobalPixel(g, 77.44940206, 18.43906919);
  near(uv.u * (px.x1 - px.x0), gp.gx - px.x0, 1e-6); near(uv.v * (px.y1 - px.y0), gp.gy - px.y0, 1e-6);
});

test('expandBboxMetres grows by the requested metres (latTs0 = 0 plane)', () => {
  const b = { west: 77, east: 78, south: 18, north: 19 };
  const e = expandBboxMetres(b, 50);
  near((b.west - e.west) * MARS_RADIUS_M * Math.PI / 180, 50, 1e-6);
  const p = pixelBoundsForBbox(geo(17), b), g = geo(17);
  assert.ok(p.x0 <= lonLatToGlobalPixel(g, 77, 19).gx && p.x1 >= lonLatToGlobalPixel(g, 78, 19).gx);
  assert.ok(p.y0 <= lonLatToGlobalPixel(g, 77, 19).gy && p.y1 >= lonLatToGlobalPixel(g, 77, 18).gy);
});

// ---------------------------------------------------------------- end-to-end build
test('end-to-end corridor zoom 17: complete, deterministic, honest manifest', () => {
  const a = runBuild({ zoom: 17, window: 'corridor', marginM: 0, allowMissing: false });
  const b = runBuild({ zoom: 17, window: 'corridor', marginM: 0, allowMissing: false });
  assert.ok(a.png.equals(b.png));
  assert.equal(JSON.stringify(a.manifestOut), JSON.stringify(b.manifestOut));
  const m = a.manifestOut;
  assert.equal(m.missingTiles.length, 0);
  assert.equal(m.mosaic.transparentPixels, 0);
  assert.equal(m.tiles.length, 54);
  assert.ok(m.tiles.every((t) => t.status === 'ok' && /^[0-9a-f]{64}$/.test(t.sha256)));
  assert.equal(m.registration.alignmentVsDtmVisuallyVerified, false);
  assert.equal(m.registration.halfPixelRegistrationOfSourceRasterVerified, false);
  assert.equal(m.attribution.licenseStatus, 'NOT_STATED_IN_PROVIDED_FGDC');
  assert.equal(m.groundSampleDistance.meetsNominal25cm, false);
  assert.match(m.product.kind, /Not the DTM hillshade/);
  // output PNG decodes back to the declared size and equals the stitched pixels
  const img = decodePng(a.png);
  assert.deepEqual([img.width, img.height], m.window.sizePx);
  assert.equal(sha256Hex(a.png), m.mosaic.sha256);
  // pixel spot check against the source tile
  const g = geo(17), px = m.window.pixelBoundsGlobal;
  const gx = px.x0 + 500, gy = px.y0 + 700, t = globalPixelToTile(g, gx, gy);
  const src = decodePng(readTile(17, t.row, t.col));
  assert.equal(img.data[(700 * img.width + 500) * 2], src.data[(t.py * 256 + t.px) * 2]);
  // window contains the requested corridor (outward rounding) and is within one pixel of it
  const req = m.window.requestedBboxDeg, act = m.window.actualBboxDeg;
  assert.ok(act.west <= req.west && act.east >= req.east && act.south <= req.south && act.north >= req.north);
  assert.ok(req.west - act.west < g.degPerPx && act.north - req.north < g.degPerPx);
  // mosaic only covers part of the DTM mesh window; manifest says so
  assert.ok(m.meshWindow.mosaicCoversFractionOfMeshWindow > 0.05 && m.meshWindow.mosaicCoversFractionOfMeshWindow < 0.2);
  assert.equal(m.otherWindowCoverage.corridor.complete, true);
  assert.equal(m.otherWindowCoverage.route.complete, false);
});

test('end-to-end: route window at zoom 17 fails closed on the missing tiles; zoom 14 works', () => {
  assert.throws(() => runBuild({ zoom: 17, window: 'route', marginM: 0, allowMissing: false }), /Missing 6 tile/);
  const part = runBuild({ zoom: 17, window: 'route', marginM: 0, allowMissing: true });
  assert.equal(part.manifestOut.missingTiles.length, 6);
  assert.ok(part.manifestOut.mosaic.transparentPixels > 0);
  assert.equal(runBuild({ zoom: 14, window: 'route', marginM: 0, allowMissing: false }).manifestOut.missingTiles.length, 0);
});

// ---------------------------------------------------------------- Stage 21B-On: ortho <-> DTM registration test
// Synthetic helpers: smooth fields so that bilinear sub-pixel shifts are well defined.
const smoothField = (rows, cols) => {
  const f = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    f[r * cols + c] = Math.sin(r * 0.31) * 3 + Math.cos(c * 0.23 + r * 0.07) * 2 + Math.sin((r + c) * 0.11);
  }
  return f;
};
const allValid = (n) => new Uint8Array(n).fill(1);
const interiorIdx = (rows, cols, m = 6) => {
  const out = [];
  for (let r = m; r < rows - m; r++) for (let c = m; c < cols - m; c++) out.push(r * cols + c);
  return Int32Array.from(out);
};

test('registration: DTM window read matches the extractor (count, no-data, edge geolocation)', () => {
  const dd = path.join(here, '..', 'data');
  const dtm = readDtmWindow(dd);
  assert.equal(dtm.Z.length, dtm.rows * dtm.cols);
  assert.equal(dtm.validCount, dtm.meta.windowStats.valid);
  assert.equal(dtm.validCount, dtm.rows * dtm.cols); // extractor reports zero no-data in this window
  // edge lon/lat from the PixelIsArea label reproduce the extractor's own coverage bounds (metres)
  const e = windowEdgesLonLat(dtm), ref = dtm.meta.coverage.latLonBounds, R = 3396190 * Math.PI / 180;
  for (const k of ['west', 'east', 'north', 'south']) assert.ok(Math.abs(e[k] - ref[k]) * R < 1e-3, `${k} edge drift`);
});

test('registration: Horn terrain on a plane gives the exact slope; hillshade follows the sun side', () => {
  const rows = 12, cols = 12;
  const Z = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) Z[r * cols + c] = c * 0.5; // rises east at 0.5 m/m
  const terr = terrainFromDtm({ rows, cols, Z }, 1);
  const i = 5 * cols + 5;
  assert.ok(terr.valid[i]);
  assert.ok(Math.abs(terr.dzdx[i] - 0.5) < 1e-6 && Math.abs(terr.dzdy[i]) < 1e-6);
  // normal n = (-0.5, 0, 1)/sqrt(1.25); L(az, 45 deg): n.L = (-0.5*sin(az) + cos(az)... ) evaluated analytically
  const s = Math.SQRT1_2, norm = Math.sqrt(1.25);
  const expWest = (0.5 * s + s) / norm; // az 270: L = (-s, 0, s)
  const expEast = (-0.5 * s + s) / norm; // az 90:  L = ( s, 0, s)
  const hWest = hillshadeFromTerrain(terr, 270, 45), hEast = hillshadeFromTerrain(terr, 90, 45);
  assert.ok(Math.abs(hWest[i] - expWest) < 1e-6, `west ${hWest[i]} vs ${expWest}`);
  assert.ok(Math.abs(hEast[i] - expEast) < 1e-6, `east ${hEast[i]} vs ${expEast}`);
  assert.ok(hWest[i] > hEast[i], 'slope facing west must be brighter under a western sun');
  // border cells (no 3x3 neighbourhood) are not valid
  assert.equal(terr.valid[0], 0);
});

test('registration: correlation recovers a known integer and half-pixel shift on a smooth field', () => {
  const rows = 80, cols = 80, B = smoothField(rows, cols), Bv = allValid(rows * cols);
  const idx = interiorIdx(rows, cols);
  // A(r,c) = B(r - dy, c - dx) with dx=1, dy=-2 -> peak at (1,-2)
  const A = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) A[r * cols + c] = bilinear(B, Bv, rows, cols, r + 2, c - 1);
  const base = { A, indexList: idx, B, Bvalid: Bv, rows, cols, minN: 100 };
  const hit = correlateAtShift({ ...base, dx: 1, dy: -2 });
  assert.ok(hit.r > 0.999, `integer peak r=${hit.r}`);
  assert.ok(correlateAtShift({ ...base, dx: 0, dy: 0 }).r < hit.r);
  // half-pixel: A sampled at c-0.5 -> peak at dx=0.5
  const H = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) H[r * cols + c] = bilinear(B, Bv, rows, cols, r, c - 0.5);
  const surf = scanShifts({ A: H, indexList: idx, B, Bvalid: Bv, rows, cols, range: 3, step: 0.5, minN: 100 });
  const pk = peakSummary(surf);
  assert.equal(pk.top.dx, 0.5);
  assert.equal(pk.top.dy, 0);
  assert.ok(pk.top.r > 0.99);
  assert.equal(surf.length, 169); // 13 x 13 half-pixel grid for +-3 px
});

test('registration: resampling fails closed (NaN, never zero) on missing or non-opaque tiles', () => {
  const g = geo(17);
  const proj = new EquirectangularProjection({ radiusM: 3396190 });
  // real DTM label offsets, cells around Sol 120 / WB1 (lon 77.4494 E)
  const dtm = { rows: 4, cols: 4, row0: 13647, col0: 13423, L0: 1106617.5, S0: -4577366.5, cellSizeM: 1 };
  const none = resampleOrthoToDtm({ dtm, g, proj, tileAt: () => null });
  assert.equal(none.count, 0);
  assert.ok(none.values.every(Number.isNaN));
  const partial = resampleOrthoToDtm({
    dtm, g, proj,
    tileAt: () => ({ gray: new Uint8Array(65536).fill(200), alpha: new Uint8Array(65536).fill(0) }),
  });
  assert.equal(partial.count, 0, 'alpha 0 must not count as valid');
  assert.ok(partial.values.every(Number.isNaN));
});

test('registration: decision is conservative (only a clean, centred, sharp peak is "hizalı")', () => {
  const good = { top: { dx: 0, dy: 0, r: 0.8, n: 1e5 }, margin: 0.2 };
  const grad = { top: { dx: 0.5, dy: -0.5, r: 0.6, n: 1e5 }, margin: 0.1 };
  assert.equal(decideRegistration({ overlapCells: 1e5, hillshade: good, gradient: grad }).verdict, 'hizalı');
  // off-centre peak
  assert.equal(decideRegistration({ overlapCells: 1e5, hillshade: { top: { dx: 2, dy: 0, r: 0.8, n: 1e5 }, margin: 0.2 }, gradient: grad }).verdict, 'kanıtlanamadı');
  // low correlation
  assert.equal(decideRegistration({ overlapCells: 1e5, hillshade: { top: { dx: 0, dy: 0, r: 0.2, n: 1e5 }, margin: 0.2 }, gradient: grad }).verdict, 'kanıtlanamadı');
  // ambiguous second peak
  assert.equal(decideRegistration({ overlapCells: 1e5, hillshade: { top: { dx: 0, dy: 0, r: 0.8, n: 1e5 }, margin: 0.01 }, gradient: grad }).verdict, 'kanıtlanamadı');
  // too little overlap
  assert.equal(decideRegistration({ overlapCells: 10, hillshade: good, gradient: grad }).verdict, 'kanıtlanamadı');
  assert.equal(decideRegistration({ overlapCells: 1e5, hillshade: null, gradient: grad }).verdict, 'kanıtlanamadı');
  assert.ok(THRESHOLDS.minCorrelation > 0);
});

test('registration: real DTM vs z17 ortho run does NOT claim alignment (current evidence is insufficient)', () => {
  const res = runValidation({ range: 3, step: 0.5, wide: 4, wideStride: 3 });
  assert.equal(res.dtm.validCells, 1902260);
  assert.equal(res.ortho.tilesLoaded, 54);
  assert.equal(res.decision.verdict, 'kanıtlanamadı');
  assert.ok(res.decision.reasons.length >= 1);
  assert.equal(res.hillshade.perAzimuth.length, 8);
  assert.equal(res.hillshade.surfaceBest.length, 169);
});
