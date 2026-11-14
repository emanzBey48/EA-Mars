// Stage 26A tests: Mars Trek WMTS catalog parsing + generalized geographic tile math.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MARS_RADIUS_M, parseXml, parseWmtsCapabilities, matrixGeometry, normalizeLon,
  tileBoundsLonLat, lonLatToTile, lonLatToPixel, tileRangeForBBox,
  groundSampleDistanceM, chooseZoomForResolution, buildTileUrl, geographicGridProblems,
  matrixSequenceProblems, finestMatrix, MAX_XML_CHARS, TILE_SIZE_PX,
} from '../public/js/geo/trek-tiles.js';
import { summariseLayer, formatTable, summariseServiceDocs } from '../scripts/trek-catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data', 'mars-trek');
const ORTHO_XML = fs.readFileSync(path.join(DATA, 'hirise_ortho_25cm_WMTSCapabilities.xml'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const ORTHO_ID = 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} |${a} - ${b}| = ${Math.abs(a - b)} > ${tol}`);

const matrixXml = (id, w, h, tl = '-180.0 90.0', tile = 256) =>
  `<TileMatrix><ows:Identifier>${id}</ows:Identifier><ScaleDenominator>2.79E+08</ScaleDenominator><TopLeftCorner>${tl}</TopLeftCorner><TileWidth>${tile}</TileWidth><TileHeight>${tile}</TileHeight><MatrixWidth>${w}.0</MatrixWidth><MatrixHeight>${h}.0</MatrixHeight></TileMatrix>`;
const layerXml = ({ id, tms = 'default028mm', fmt = 'image/png', ext = 'png', bbox = '-180.0 -90.0', bboxU = '180.0 90.0', tpl }) => `
  <Layer><ows:Title>Synthetic ${id}</ows:Title><ows:Abstract>synthetic &amp; trimmed</ows:Abstract><ows:Identifier>${id}</ows:Identifier>
    <ows:WGS84BoundingBox crs="urn:ogc:def:crs:OGC:2:84"><ows:LowerCorner>${bbox}</ows:LowerCorner><ows:UpperCorner>${bboxU}</ows:UpperCorner></ows:WGS84BoundingBox>
    <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style><Format>${fmt}</Format>
    <TileMatrixSetLink><TileMatrixSet>${tms}</TileMatrixSet></TileMatrixSetLink>
    <ResourceURL format="${fmt}" resourceType="tile" template="${tpl ?? `https://example.test/${id}/1.0.0//{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`}"/>
  </Layer>`;
const capsXml = (layers, sets) => `<?xml version="1.0"?><Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" version="1.0.0">
  <ows:ServiceIdentification><ows:Title>Synthetic multi</ows:Title></ows:ServiceIdentification><Contents>${layers}${sets}</Contents></Capabilities>`;
const geoSet = (id, crs = 'urn:ogc:def:crs:EPSG::104905', matrices) => `<TileMatrixSet><ows:Identifier>${id}</ows:Identifier><ows:SupportedCRS>${crs}</ows:SupportedCRS>${matrices ?? matrixXml(0, 2, 1) + matrixXml(1, 4, 2) + matrixXml(2, 8, 4)}</TileMatrixSet>`;

// ------------------------------------------------------------------ parsing: real local capabilities (fixture)

test('parses the local Jezero ortho capabilities into one supported catalog entry', () => {
  const cat = parseWmtsCapabilities(ORTHO_XML);
  assert.equal(cat.ok, true);
  assert.equal(cat.layers.length, 1);
  const l = cat.layers[0];
  assert.equal(l.id, ORTHO_ID);
  assert.equal(l.title, ORTHO_ID);
  assert.equal(l.format, 'image/png');
  assert.equal(l.tileMatrixSetId, 'default028mm');
  assert.equal(l.crsUrn, 'urn:ogc:def:crs:EPSG::104905');
  assert.equal(l.status, 'supported');
  assert.deepEqual(l.reasons, []);
  assert.match(l.axisOrderAssumption, /^lon,lat/);
  assert.equal(l.styleId, 'default');
  assert.deepEqual(l.bboxLonLat, { west: 77.2229331, south: 18.3067994, east: 77.583964, north: 18.669315 });
  assert.equal(l.resourceUrlTemplate, `https://trek.nasa.gov/tiles/Mars/EQ/${ORTHO_ID}/1.0.0//{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png`);
});

test('commented-out legacy 3x2 matrix set is ignored: exactly matrices 0..17, 2^(z+1) x 2^z', () => {
  const l = parseWmtsCapabilities(ORTHO_XML).layers[0];
  assert.equal(l.matrixes.length, 18);
  l.matrixes.forEach((m, z) => {
    assert.equal(m.id, String(z));
    assert.equal(m.matrixWidth, 2 ** (z + 1));
    assert.equal(m.matrixHeight, 2 ** z);
    assert.equal(m.tileWidth, 256);
    assert.equal(m.tileHeight, 256);
    assert.deepEqual([...m.topLeft], [-180, 90]);
  });
  assert.equal(l.matrixes[0].scaleDenominatorRaw, 2.7922763629807472e8); // carried raw, never used for metres
});

test('ScaleDenominator is Earth-based and is not used: 0.28 mm x SD disagrees with Mars geometry', () => {
  const m0 = parseWmtsCapabilities(ORTHO_XML).layers[0].matrixes[0];
  const mFromSd = m0.scaleDenominatorRaw * 0.00028; // metres per pixel the XML "claims" at zoom 0 (OGC pixel)
  const mFromGeometry = groundSampleDistanceM(m0, 0).northSouthM;
  assert.ok(Math.abs(mFromSd / mFromGeometry - 1) > 0.5, `SD-implied ${mFromSd} vs geometry ${mFromGeometry}`);
});

// ------------------------------------------------------------------ parsing: synthetic + failure modes

test('synthetic multi-layer document: different TileMatrixSets, unknown CRS, bad geometry -> needs_review', () => {
  const xml = capsXml(
    layerXml({ id: 'SYN_GOOD_PNG' }) + layerXml({ id: 'SYN_GOOD_JPG', fmt: 'image/jpeg', ext: 'jpg', tms: 'geoB' }) +
    layerXml({ id: 'SYN_MERCATOR', tms: 'merc' }) + layerXml({ id: 'SYN_LATLON', tms: 'latlon' }) +
    layerXml({ id: 'SYN_NOT_2TO1', tms: 'odd' }) + layerXml({ id: 'SYN_MISSING_SET', tms: 'nope' }),
    geoSet('default028mm') + geoSet('geoB', 'urn:ogc:def:crs:IAU2000::104905') +
    geoSet('merc', 'urn:ogc:def:crs:EPSG::3857') +
    geoSet('latlon', 'urn:ogc:def:crs:EPSG::104905', matrixXml(0, 2, 1, '90.0 -180.0')) +
    geoSet('odd', 'urn:ogc:def:crs:EPSG::104905', matrixXml(0, 3, 2)),
  );
  const cat = parseWmtsCapabilities(xml);
  assert.equal(cat.ok, true);
  assert.equal(cat.serviceTitle, 'Synthetic multi');
  const by = Object.fromEntries(cat.layers.map((l) => [l.id, l]));
  assert.equal(by.SYN_GOOD_PNG.status, 'supported');
  assert.equal(by.SYN_GOOD_PNG.abstract, 'synthetic & trimmed');
  assert.equal(by.SYN_GOOD_JPG.status, 'supported');
  assert.equal(by.SYN_GOOD_JPG.format, 'image/jpeg');
  assert.equal(by.SYN_GOOD_JPG.tileMatrixSetId, 'geoB');
  assert.ok(by.SYN_GOOD_JPG.notes.some((n) => /IAU2000/.test(n)));
  assert.equal(by.SYN_MERCATOR.status, 'needs_review');
  assert.ok(by.SYN_MERCATOR.reasons.some((r) => /Unknown CRS.*3857/.test(r)));
  assert.equal(by.SYN_LATLON.status, 'needs_review');
  assert.equal(by.SYN_LATLON.axisOrderAssumption, 'unknown');
  assert.ok(by.SYN_LATLON.reasons.some((r) => /TopLeftCorner/.test(r)));
  assert.equal(by.SYN_NOT_2TO1.status, 'needs_review');
  assert.ok(by.SYN_NOT_2TO1.reasons.some((r) => /2:1/.test(r)));
  assert.equal(by.SYN_MISSING_SET.status, 'needs_review');
  assert.ok(by.SYN_MISSING_SET.reasons.some((r) => /not defined/.test(r)));
});

test('resource template problems fail closed (unknown placeholder, missing {TileRow}, none)', () => {
  const sets = geoSet('default028mm');
  const cat = parseWmtsCapabilities(capsXml(
    layerXml({ id: 'SYN_UNK', tpl: 'https://example.test/{Foo}/{TileMatrix}/{TileRow}/{TileCol}.png' }) +
    layerXml({ id: 'SYN_NOROW', tpl: 'https://example.test/{TileMatrix}/{TileCol}.png' }) +
    `<Layer><ows:Identifier>SYN_KVP</ows:Identifier><Format>image/png</Format><TileMatrixSetLink><TileMatrixSet>default028mm</TileMatrixSet></TileMatrixSetLink></Layer>`,
    sets));
  const by = Object.fromEntries(cat.layers.map((l) => [l.id, l]));
  for (const id of ['SYN_UNK', 'SYN_NOROW', 'SYN_KVP']) assert.equal(by[id].status, 'needs_review', id);
  assert.ok(by.SYN_UNK.reasons.some((r) => /Foo/.test(r)));
  assert.ok(by.SYN_NOROW.reasons.some((r) => /TileRow/.test(r)));
  assert.ok(by.SYN_KVP.reasons.some((r) => /ResourceURL/.test(r)));
});

test('malformed or non-WMTS XML never throws and reports ok:false', () => {
  const bad = [
    '', '   ', 'not xml at all', '<Capabilities><Contents></Capabilities>', '<a><b></a></b>',
    '<?xml version="1.0"?><html><body/></html>', '<Capabilities/>', '<Capabilities><Contents>', null, undefined, 42,
  ];
  for (const b of bad) {
    const r = parseWmtsCapabilities(b);
    assert.equal(r.ok, false, `input ${JSON.stringify(b)}`);
    assert.equal(typeof r.error, 'string');
    assert.deepEqual(r.layers, []);
  }
  const truncated = parseWmtsCapabilities(ORTHO_XML.slice(0, ORTHO_XML.length - 40));
  assert.equal(truncated.ok, false);
});

test('XML scanner: namespaces, CDATA, entities, comments, self-closing, quotes with > inside', () => {
  const n = parseXml(`<?xml version="1.0"?><!DOCTYPE x><!-- c --><ns:Root a="1>2" b='x&amp;y'><ns:K/><![CDATA[<raw>]]><k>t&#65;&lt;</k></ns:Root>`);
  assert.equal(n.name, 'Root');
  assert.equal(n.attrs.a, '1>2');
  assert.equal(n.attrs.b, 'x&y');
  assert.equal(n.children.length, 2);
  assert.equal(n.children[1].text, 'tA<');
  assert.ok(n.text.includes('<raw>'));
});

test('catalog output is deterministic, deeply frozen, and inputs are not mutated', () => {
  const input = String(ORTHO_XML), before = ORTHO_XML.slice();
  const a = parseWmtsCapabilities(input), b = parseWmtsCapabilities(input);
  assert.equal(input, before);
  assert.equal(input.length, ORTHO_XML.length);
  assert.notEqual(a, b); // fresh objects each call (no shared mutable cache)
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.layers) && Object.isFrozen(a.layers[0]) && Object.isFrozen(a.layers[0].matrixes[3]) && Object.isFrozen(a.layers[0].matrixes[3].topLeft));
  assert.ok(Object.isFrozen(a.layers[0].reasons) && Object.isFrozen(a.layers[0].notes));
  assert.throws(() => { 'use strict'; a.layers[0].status = 'x'; }, TypeError);
  assert.throws(() => { 'use strict'; a.layers[0].matrixes.push({}); }, TypeError);
  const f = parseWmtsCapabilities('junk');
  assert.ok(Object.isFrozen(f) && Object.isFrozen(f.layers));
  const node = parseXml('<a x="1"><b>t</b></a>');
  assert.ok(Object.isFrozen(node) && Object.isFrozen(node.attrs) && Object.isFrozen(node.children) && Object.isFrozen(node.children[0]));
  const mg = matrixGeometry(5), probs = geographicGridProblems([{ id: '0', matrixWidth: 3, matrixHeight: 2, tileWidth: 256, tileHeight: 256, topLeft: [-180, 90] }]);
  assert.ok(Object.isFrozen(mg) && Object.isFrozen(probs) && probs.length > 0);
  assert.deepEqual(matrixGeometry(5), mg);
  for (const x of [tileBoundsLonLat(5, 1, 1), lonLatToPixel(5, 10, 10), lonLatToTile(5, 10, 10), tileRangeForBBox(5, { west: 0, south: 0, east: 1, north: 1 }), groundSampleDistanceM(5, 0), chooseZoomForResolution(10, 0)]) {
    assert.ok(Object.isFrozen(x));
  }
});
// ------------------------------------------------------------------ Stage 21A facts reproduced

test('z17 GSD at Jezero latitude is 0.318 m/px (N-S) and 0.3017 m/px (E-W ground)', () => {
  const g = groundSampleDistanceM(17, 18.4357);
  near(g.northSouthM, 0.318, 5e-4);
  near(g.eastWestGroundM, 0.3017, 5e-4);
  assert.equal(g.northSouthM, g.eastWestProjectedM);
  near(groundSampleDistanceM(16, 18.4357).northSouthM, 0.636, 1e-3);
});

test('tile bounds reproduce manifest lon/lat ranges for z13..z17 within 1e-9 deg', () => {
  const l = parseWmtsCapabilities(ORTHO_XML).layers[0];
  for (const L of MANIFEST.files.ortho_tiles.levels) {
    const m = l.matrixes[L.zoom];
    const nw = tileBoundsLonLat(m, L.row_range[0], L.col_range[0]), se = tileBoundsLonLat(m, L.row_range[1], L.col_range[1]);
    near(se.south, L.lat_range[0], 1e-9, `z${L.zoom} south`);
    near(nw.north, L.lat_range[1], 1e-9, `z${L.zoom} north`);
    near(nw.west, L.lon_range[0], 1e-9, `z${L.zoom} west`);
    near(se.east, L.lon_range[1], 1e-9, `z${L.zoom} east`);
    // same result from the bare-zoom default scheme and from the parsed matrix
    assert.deepEqual(tileBoundsLonLat(L.zoom, L.row_range[0], L.col_range[0]), nw);
    near(groundSampleDistanceM(m, (nw.north + se.south) / 2).northSouthM, L.resolution_m_per_px, 1e-3, `z${L.zoom} gsd`);
  }
});

test('Sol 120 waypoint falls in a z17 tile inside the manifest range', () => {
  const wp = MANIFEST.target_region.key_waypoints.Sol_120_WB1;
  const t = lonLatToTile(17, wp.longitude_deg, wp.latitude_deg);
  const L = MANIFEST.files.ortho_tiles.levels.find((x) => x.zoom === 17);
  assert.ok(t.row >= L.row_range[0] && t.row <= L.row_range[1] && t.col >= L.col_range[0] && t.col <= L.col_range[1], JSON.stringify(t));
});

test('manifest corridor at z17 needs exactly the tiles the 21A inventory contains (subset of the 54)', () => {
  const c = MANIFEST.target_region.corridor_bounds;
  const r = tileRangeForBBox(17, { west: c.west_lon_deg, east: c.east_lon_deg, south: c.south_lat_deg, north: c.north_lat_deg });
  const L = MANIFEST.files.ortho_tiles.levels.find((x) => x.zoom === 17);
  assert.equal(r.wrapsAntimeridian, false);
  const [c0, c1] = r.colRanges[0];
  assert.ok(c0 >= L.col_range[0] && c1 <= L.col_range[1] && r.rowMin >= L.row_range[0] && r.rowMax <= L.row_range[1]);
  assert.equal(r.tileCount, (c1 - c0 + 1) * (r.rowMax - r.rowMin + 1));
});

// ------------------------------------------------------------------ tile math

test('lonLat -> tile -> bounds contains the point (round trip, 1e-9 deg) over a lat/lon/zoom grid', () => {
  for (const z of [0, 1, 3, 8, 14, 17, 20]) {
    for (let lon = -179.9; lon < 180; lon += 37.3) {
      for (let lat = -89.9; lat < 90; lat += 29.7) {
        const t = lonLatToTile(z, lon, lat);
        const b = tileBoundsLonLat(z, t.row, t.col);
        const eps = 1e-9;
        assert.ok(lon >= b.west - eps && lon <= b.east + eps && lat >= b.south - eps && lat <= b.north + eps, `z${z} ${lon},${lat} -> ${JSON.stringify(b)}`);
      }
    }
  }
});

test('lonLatToPixel: pixel-is-area (edges are integers, centre is +0.5) and in-tile coordinates', () => {
  // west edge / north edge of tile (row 5, col 9) at z4 is the integer pixel (9*256, 5*256)
  const b = tileBoundsLonLat(4, 5, 9);
  const edge = lonLatToPixel(4, b.west, b.north);
  near(edge.x, 9 * 256, 1e-6); near(edge.y, 5 * 256, 1e-6);
  assert.deepEqual([edge.col, edge.row], [9, 5]);
  near(edge.xInTile, 0, 1e-6);
  // centre of pixel (px 10, py 20) of that tile
  const d = 360 / (2 ** 5 * 256);
  const c = lonLatToPixel(4, b.west + 10.5 * d, b.north - 20.5 * d);
  near(c.xInTile, 10.5, 1e-6); near(c.yInTile, 20.5, 1e-6);
  assert.equal(c.convention, 'pixel-is-area');
  // global pixel centre of the Sol 120 pixel is consistent with the tile coordinate (z17, 1e-6 px)
  const p = lonLatToPixel(17, 77.4494015, 18.4386299);
  near(p.x, p.col * 256 + p.xInTile, 1e-6);
});

test('longitude wrap policy: +180 == -180 (col 0), 190 == -170, -540 == 180 -> col 0; bbox east=180 reaches last col', () => {
  assert.equal(normalizeLon(180), -180);
  assert.equal(normalizeLon(-180), -180);
  assert.equal(normalizeLon(190), -170);
  assert.equal(normalizeLon(-190), 170);
  assert.equal(normalizeLon(540), -180);
  assert.equal(lonLatToTile(6, 180, 0).col, 0);
  assert.equal(lonLatToTile(6, -180, 0).col, 0);
  assert.equal(lonLatToTile(6, 179.999999, 0).col, 2 ** 7 - 1);
  assert.deepEqual(lonLatToTile(6, 190, 10), lonLatToTile(6, -170, 10));
  const r = tileRangeForBBox(6, { west: 170, east: 180, south: 0, north: 10 });
  assert.equal(r.wrapsAntimeridian, false);
  assert.equal(r.colRanges[0][1], 2 ** 7 - 1);
  assert.throws(() => lonLatToTile(6, NaN, 0), RangeError);
  assert.throws(() => lonLatToTile(6, 0, Infinity), RangeError);
});

test('antimeridian-crossing bbox yields two column ranges; full-globe width covers every column', () => {
  const r = tileRangeForBBox(5, { west: 170, east: -170, south: -5, north: 5 });
  assert.equal(r.wrapsAntimeridian, true);
  assert.equal(r.colRanges.length, 2);
  const g = matrixGeometry(5);
  assert.equal(r.colRanges[0][1], g.matrixWidth - 1);
  assert.equal(r.colRanges[1][0], 0);
  const east = r.colRanges[0], west = r.colRanges[1];
  assert.ok(east[0] <= lonLatToTile(5, 170, 0).col && west[1] >= lonLatToTile(5, -170.0001, 0).col);
  const all = tileRangeForBBox(3, { west: -180, east: 180, south: -90, north: 90 });
  assert.deepEqual(all.colRanges, [[0, 2 ** 4 - 1]]);
  assert.equal(all.tileCount, 2 ** 4 * 2 ** 3);
  const wide = tileRangeForBBox(3, { west: -200, east: 200, south: -90, north: 90 });
  assert.equal(wide.tileCount, all.tileCount);
});

test('poles clamp: lat +-90 and beyond map to first/last row; bbox beyond poles clamps', () => {
  const z = 4, g = matrixGeometry(z);
  assert.equal(lonLatToTile(z, 0, 90).row, 0);
  assert.equal(lonLatToTile(z, 0, 95).row, 0);
  assert.equal(lonLatToTile(z, 0, -90).row, g.matrixHeight - 1);
  assert.equal(lonLatToTile(z, 0, -120).row, g.matrixHeight - 1);
  near(lonLatToPixel(z, 0, -90).yInTile, 256, 1e-9);
  const r = tileRangeForBBox(z, { west: 0, east: 10, south: -100, north: 100 });
  assert.equal(r.rowMin, 0);
  assert.equal(r.rowMax, g.matrixHeight - 1);
  assert.throws(() => tileRangeForBBox(z, { west: 0, east: 1, south: 5, north: 1 }), RangeError);
});

test('exact tile edges do not pull in the neighbouring tile; point bbox returns one tile', () => {
  const b = tileBoundsLonLat(10, 300, 700);
  const r = tileRangeForBBox(10, { west: b.west, east: b.east, south: b.south, north: b.north });
  assert.equal(r.tileCount, 1);
  assert.deepEqual([r.rowMin, r.rowMax, r.colRanges[0]], [300, 300, [700, 700]]);
  const pt = tileRangeForBBox(10, { west: 12.3, east: 12.3, south: 4.5, north: 4.5 });
  assert.equal(pt.tileCount, 1);
  const p = lonLatToTile(10, 12.3, 4.5);
  assert.deepEqual([pt.rowMin, pt.colRanges[0][0]], [p.row, p.col]);
  const bigger = tileRangeForBBox(10, { west: b.west - 1e-4, east: b.east + 1e-4, south: b.south - 1e-4, north: b.north + 1e-4 });
  assert.equal(bigger.tileCount, 9);
});

test('tile index range checks', () => {
  assert.throws(() => tileBoundsLonLat(3, 8, 0), RangeError); // 2^3 = 8 rows -> 0..7
  assert.throws(() => tileBoundsLonLat(3, 0, 16), RangeError); // 16 cols -> 0..15
  assert.throws(() => tileBoundsLonLat(3, -1, 0), RangeError);
  assert.throws(() => tileBoundsLonLat(3, 0.5, 0), RangeError);
  assert.doesNotThrow(() => tileBoundsLonLat(3, 7, 15));
  assert.throws(() => matrixGeometry(-1), RangeError);
  assert.throws(() => matrixGeometry(31), RangeError);
  assert.throws(() => matrixGeometry(1.5), RangeError);
  assert.throws(() => matrixGeometry('3'), TypeError);
  assert.throws(() => matrixGeometry({ id: '0', matrixWidth: 3, matrixHeight: 2, tileWidth: 256, tileHeight: 256, topLeft: [-180, 90] }), RangeError);
  assert.deepEqual(geographicGridProblems([{ id: '0', matrixWidth: 2, matrixHeight: 1, tileWidth: 256, tileHeight: 256, topLeft: [-180, 90] }]), []);
});

// ------------------------------------------------------------------ GSD / zoom

test('GSD matches the closed form across zooms and latitudes', () => {
  for (let z = 0; z <= 22; z++) {
    for (const lat of [0, 18.4357, -45, 60, 89]) {
      const dpp = 360 / (2 ** (z + 1) * 256); // degrees per pixel
      const ns = dpp * MARS_RADIUS_M * Math.PI / 180;
      const g = groundSampleDistanceM(z, lat);
      near(g.northSouthM, ns, ns * 1e-12, `ns z${z}`);
      near(g.eastWestGroundM, ns * Math.cos(lat * Math.PI / 180), ns * 1e-12, `ew z${z} lat${lat}`);
      near(g.degPerPx, dpp, dpp * 1e-12);
    }
  }
  near(groundSampleDistanceM(0, 0).northSouthM, 360 / 512 * 59274.6, 1, 'z0 equator ~41.7 km/px');
  // radius is a parameter, not a hidden Earth constant
  near(groundSampleDistanceM(5, 0, 6371000).northSouthM / groundSampleDistanceM(5, 0, 3396190).northSouthM, 6371000 / 3396190, 1e-12);
  assert.throws(() => groundSampleDistanceM(5, 0, 0), RangeError);
});

test('chooseZoomForResolution: meets target, is minimal, monotonic, and honest when unreachable', () => {
  let prev = -1;
  for (const target of [50000, 5000, 1302, 463, 200, 100, 25, 5, 1, 0.5, 0.318, 0.3, 0.25, 0.1]) {
    const r = chooseZoomForResolution(target, 18.4357);
    assert.ok(r.zoom >= prev, `monotonic at ${target}`);
    prev = r.zoom;
    assert.equal(r.satisfied, true);
    assert.ok(r.gsdM <= target);
    if (r.zoom > 0) assert.ok(groundSampleDistanceM(r.zoom - 1, 18.4357).northSouthM > target, `zoom ${r.zoom} not minimal for ${target}`);
  }
  assert.equal(chooseZoomForResolution(0.3180001, 18.4357).zoom, 17); // z17 = 0.31799...
  assert.equal(chooseZoomForResolution(0.25, 18.4357).zoom, 18);
  assert.equal(chooseZoomForResolution(1e9, 0).zoom, 0);
  const capped = chooseZoomForResolution(0.25, 18.4357, { maxZoom: 17 });
  assert.equal(capped.zoom, 17);
  assert.equal(capped.satisfied, false);
  assert.equal(chooseZoomForResolution(1, 0, { minZoom: 4 }).zoom >= 4, true);
  assert.throws(() => chooseZoomForResolution(0, 0), RangeError);
  assert.throws(() => chooseZoomForResolution(-1, 0), RangeError);
  assert.throws(() => chooseZoomForResolution(NaN, 0), RangeError);
  assert.throws(() => chooseZoomForResolution(5, 0, { minZoom: 9, maxZoom: 3 }), RangeError);
});

// ------------------------------------------------------------------ URL

test('buildTileUrl substitutes the real ortho template and collapses the double slash', () => {
  const tpl = parseWmtsCapabilities(ORTHO_XML).layers[0].resourceUrlTemplate;
  const url = buildTileUrl(tpl, { tileMatrix: 17, row: 52107, col: 187467, style: 'default', tileMatrixSet: 'default028mm' });
  assert.equal(url, `https://trek.nasa.gov/tiles/Mars/EQ/${ORTHO_ID}/1.0.0/default/default028mm/17/52107/187467.png`);
  assert.equal(url, MANIFEST.files.ortho_tiles.wmts_service_url_template.replace('{TileMatrix}', '17').replace('{TileRow}', '52107').replace('{TileCol}', '187467'));
  assert.equal(buildTileUrl('https://h.test/{TileMatrix}/{TileRow}/{TileCol}.jpg', { tileMatrix: '3', row: 1, col: 2 }), 'https://h.test/3/1/2.jpg');
});

test('buildTileUrl validation: placeholders, values, matrix bounds, scheme', () => {
  const ok = 'https://h.test/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png';
  const good = { tileMatrix: 3, row: 1, col: 1, style: 'default', tileMatrixSet: 'tms' };
  assert.doesNotThrow(() => buildTileUrl(ok, good));
  assert.throws(() => buildTileUrl(ok, { ...good, style: undefined }), RangeError); // {Style} without value
  assert.throws(() => buildTileUrl(ok, { ...good, tileMatrixSet: '../x' }), RangeError);
  assert.throws(() => buildTileUrl('https://h.test/{TileMatrix}/{TileCol}.png', good), RangeError); // missing {TileRow}
  assert.throws(() => buildTileUrl('https://h.test/{TileMatrix}/{TileRow}.png', good), RangeError); // missing {TileCol}
  assert.throws(() => buildTileUrl('https://h.test/{TileRow}/{TileCol}.png', good), RangeError); // missing {TileMatrix}
  assert.throws(() => buildTileUrl('https://h.test/{Bogus}/{TileMatrix}/{TileRow}/{TileCol}', good), RangeError);
  assert.throws(() => buildTileUrl('ftp://h.test/{TileMatrix}/{TileRow}/{TileCol}', good), TypeError);
  assert.throws(() => buildTileUrl(null, good), TypeError);
  for (const bad of [{ row: -1, col: 0 }, { row: 0, col: -1 }, { row: 1.5, col: 0 }, { row: 0, col: NaN }, { row: '1', col: 0 }]) {
    assert.throws(() => buildTileUrl(ok, { ...good, ...bad }), RangeError, JSON.stringify(bad));
  }
  for (const bad of [undefined, null, '', 'a/b', '1 2']) assert.throws(() => buildTileUrl(ok, { ...good, tileMatrix: bad }), RangeError);
  assert.doesNotThrow(() => buildTileUrl(ok, { ...good, row: 7, col: 15, matrix: 3 }));
  const parsed = parseWmtsCapabilities(ORTHO_XML).layers[0].matrixes[3]; // parsed matrix objects are accepted too
  assert.doesNotThrow(() => buildTileUrl(ok, { ...good, row: 7, col: 15, matrix: parsed }));
  assert.throws(() => buildTileUrl(ok, { ...good, row: 8, col: 0, matrix: parsed }), RangeError);
  assert.throws(() => buildTileUrl(ok, { ...good, row: 8, col: 0, matrix: 3 }), RangeError);
  assert.throws(() => buildTileUrl(ok, { ...good, row: 0, col: 16, matrix: 3 }), RangeError);
});

// ------------------------------------------------------------------ CLI helpers

test('CLI helpers: table rows from geometry, service-doc projection', () => {
  const l = parseWmtsCapabilities(ORTHO_XML).layers[0];
  const s = summariseLayer(l);
  assert.equal(s.zooms, '0..17');
  near(s.finestGsdM, 0.318, 5e-4);
  assert.match(formatTable([l]), /image\/png\s+default028mm\s+0\.\.17\s+0\.3180\s+supported/);
  const bad = parseWmtsCapabilities(capsXml(layerXml({ id: 'X', tms: 'm' }), geoSet('m', 'urn:ogc:def:crs:EPSG::3857'))).layers[0];
  assert.equal(summariseLayer(bad).finestGsdM, null);
  assert.match(formatTable([bad]), /needs_review: X: Unknown CRS/);
  const docs = summariseServiceDocs([{ productLabel: 'P', title: 'T', serviceTypes: ['Mosaic', 'raster'], projection: 'urn:ogc:def:crs:EPSG::104905', bbox: '1,2,3,4', item_UUID: 'u' }]);
  assert.deepEqual(docs[0].serviceTypes, ['Mosaic', 'raster']);
  assert.equal(docs[0].projection, 'urn:ogc:def:crs:EPSG::104905');
});

// ------------------------------------------------------------------ XML scanner: linear time, hard guards (review #1)

const timed = (fn) => { const t0 = process.hrtime.bigint(); const r = fn(); return { r, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };

test('XML scanner is linear on adversarial input: each case finishes < 1000 ms and fails closed', () => {
  const cases = {
    'unclosed "<a " x200000': '<a '.repeat(200000),
    'unclosed attr quote x170000': '<a b="'.repeat(170000),
    'unclosed comment x250000': '<!--'.repeat(250000),
    'unclosed CDATA x100000': '<![CDATA['.repeat(100000),
    'unclosed PI x300000': '<?'.repeat(300000),
    'unclosed DOCTYPE x120000': '<!DOCTYPE'.repeat(120000),
    'lone "<" x500000': '<'.repeat(500000),
    'nested open tags x200000': '<a>'.repeat(200000),
    'ampersands x500000': `<a>${'&'.repeat(500000)}</a>`,
  };
  const report = [];
  for (const [name, xml] of Object.entries(cases)) {
    const { r, ms } = timed(() => parseWmtsCapabilities(xml));
    report.push(`${name}: ${ms.toFixed(1)} ms`);
    assert.ok(ms < 1000, `${name} took ${ms} ms`);
    if (name.startsWith('ampersands')) { assert.equal(r.ok, false); assert.match(r.error, /Root element/); } // parses fine, rejected as non-WMTS
    else { assert.equal(r.ok, false, name); assert.equal(typeof r.error, 'string'); assert.deepEqual(r.layers, []); }
  }
  console.log(`  [timing] ${report.join('; ')}`);
});

test('XML scanner reports a structured error for each unclosed construct', () => {
  for (const [xml, re] of [
    ['<a><!-- never closed</a>', /Unclosed comment/], ['<a><![CDATA[ never</a>', /Unclosed CDATA/], ['<a><? pi</a>', /Unclosed processing/],
    ['<a b="1</a>', /Unclosed attribute value/], ['<a b=1></a>', /not quoted/], ['<a b></a>', /no value/], ['<a', /Unclosed tag/],
    ['<a></b>', /Mismatched/], ['<a><b></a>', /Mismatched|Unclosed/], ['<a>x < y</a>', /Invalid markup/],
  ]) assert.throws(() => parseXml(xml), re, xml);
});

test('XML scanner size/depth guards fail closed', () => {
  const big = `<Capabilities>${' '.repeat(MAX_XML_CHARS)}</Capabilities>`;
  const r = parseWmtsCapabilities(big);
  assert.equal(r.ok, false);
  assert.match(r.error, /too large/);
  assert.deepEqual(r.reasons, [r.error]);
  assert.equal(parseWmtsCapabilities(`<Capabilities>${'<a>'.repeat(300)}${'</a>'.repeat(300)}</Capabilities>`).ok, false); // depth > 256
  const deepOk = parseXml(`${'<a>'.repeat(200)}${'</a>'.repeat(200)}`);
  assert.equal(deepOk.name, 'a');
});

test('valid 1 MB padded capabilities (comment + whitespace + CDATA padding) parses fast and identically', () => {
  const plain = parseWmtsCapabilities(ORTHO_XML);
  const pad = 'x'.repeat(1024 * 1024);
  const padded = ORTHO_XML.replace('<Contents>', `<!-- ${pad} --><Contents><![CDATA[${pad}]]>   \r\n`).replace(/^(<\?xml[^>]*\?>)?/, `$1<!-- ${pad} -->`);
  assert.ok(padded.length > 3 * 1024 * 1024);
  const { r, ms } = timed(() => parseWmtsCapabilities(padded));
  console.log(`  [timing] ${(padded.length / 1048576).toFixed(1)} MB padded fixture: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 1000, `${ms} ms`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.layers, plain.layers);
});

test('XML scanner: BOM, CRLF, single/double quoted attrs, entities, self-closing with space, unknown entity kept', () => {
  const n = parseXml('\uFEFF<?xml version="1.0"?>\r\n<r:A xmlns:r="u"\r\n   p = \'q&quot;\'  s="a&#x41;&#66;&unknown;" >\r\n  <B  />\r\n  <C>x</C >\r\n</r:A>');
  assert.equal(n.name, 'A');
  assert.equal(n.attrs.p, 'q"');
  assert.equal(n.attrs.s, 'aAB&unknown;');
  assert.deepEqual(n.children.map((c) => c.name), ['B', 'C']);
  assert.equal(n.children[1].text, 'x');
  assert.throws(() => parseXml('<a>x</a><b/>'), /exactly one root/);
  assert.equal(parseXml('<!DOCTYPE a [ <!ENTITY e "boom"> ]><a>&e;</a>').text, '&e;'); // internal subset skipped, entity NOT expanded
});

// ------------------------------------------------------------------ fail-closed catalog rules (review #2-#4, #7-#10)

const stat = (xml) => Object.fromEntries(parseWmtsCapabilities(xml).layers.map((l) => [l.id, l]));

test('tile size other than 256 is needs_review, and matrixGeometry rejects it', () => {
  const by = stat(capsXml(layerXml({ id: 'T512', tms: 't512' }) + layerXml({ id: 'T256' }),
    geoSet('t512', undefined, matrixXml(0, 2, 1, '-180.0 90.0', 512)) + geoSet('default028mm')));
  assert.equal(TILE_SIZE_PX, 256);
  assert.equal(by.T512.status, 'needs_review');
  assert.ok(by.T512.reasons.some((r) => /512 is not 256/.test(r)), by.T512.reasons.join('|'));
  assert.equal(by.T256.status, 'supported');
  assert.throws(() => matrixGeometry({ id: '0', matrixWidth: 2, matrixHeight: 1, tileWidth: 512, tileHeight: 512, topLeft: [-180, 90] }), RangeError);
  assert.throws(() => matrixGeometry(3, { tileSize: 512, baseColumns: 2, baseRows: 1 }), RangeError);
  assert.throws(() => matrixGeometry(3, { tileSize: 256, baseColumns: 3, baseRows: 1 }), RangeError);
});

test('TileMatrix ids: duplicates, gaps and non-integers need review; finest is the max zoom regardless of order', () => {
  const swapped = geoSet('s', undefined, matrixXml(0, 2, 1) + matrixXml(2, 8, 4) + matrixXml(1, 4, 2));
  const dup = geoSet('d', undefined, matrixXml(0, 2, 1) + matrixXml(1, 4, 2) + matrixXml(1, 4, 2));
  const gap = geoSet('g', undefined, matrixXml(0, 2, 1) + matrixXml(2, 8, 4));
  const nonInt = geoSet('n', undefined, matrixXml('a', 2, 1));
  const from1 = geoSet('f', undefined, matrixXml(1, 4, 2) + matrixXml(2, 8, 4));
  const by = stat(capsXml(['s', 'd', 'g', 'n', 'f'].map((t) => layerXml({ id: `L_${t}`, tms: t })).join(''), swapped + dup + gap + nonInt + from1));
  assert.equal(by.L_s.status, 'supported'); // any document order is fine when ids are 0..n-1
  assert.equal(finestMatrix(by.L_s.matrixes).id, '2');
  assert.equal(summariseLayer(by.L_s).zooms, '0..2');
  near(summariseLayer(by.L_s).finestGsdM, groundSampleDistanceM(2, 0).northSouthM, 1e-9);
  assert.ok(by.L_d.reasons.some((r) => /duplicate TileMatrix id "1"/.test(r)));
  assert.ok(by.L_g.reasons.some((r) => /contiguous range 0\.\.1 \(missing 1\)/.test(r)));
  assert.ok(by.L_n.reasons.some((r) => /not a plain non-negative integer/.test(r)));
  assert.ok(by.L_f.reasons.some((r) => /missing 0/.test(r)));
  for (const k of ['d', 'g', 'n', 'f']) assert.equal(by[`L_${k}`].status, 'needs_review', k);
  assert.equal(summariseLayer(by.L_d).finestGsdM, null);
  assert.deepEqual([...matrixSequenceProblems([{ id: '0' }, { id: '0' }])].length > 0, true);
});

test('swapped z16/z17 matrix order in the real ortho document still reports finest = 17', () => {
  const m = (z) => new RegExp(`<TileMatrix>\\s*<ows:Identifier>${z}</ows:Identifier>[\\s\\S]*?</TileMatrix>`);
  const s16 = m(16).exec(ORTHO_XML)?.[0], s17 = m(17).exec(ORTHO_XML)?.[0];
  assert.ok(s16 && s17 && ORTHO_XML.indexOf(s16) < ORTHO_XML.indexOf(s17));
  const swapped = ORTHO_XML.replace(s16, '\u0000A').replace(s17, '\u0000B').replace('\u0000A', s17).replace('\u0000B', s16);
  const l = parseWmtsCapabilities(swapped).layers[0];
  assert.equal(l.matrixes[16].id, '17'); // document order preserved
  assert.equal(l.status, 'supported');
  assert.equal(finestMatrix(l.matrixes).id, '17');
  const s = summariseLayer(l);
  assert.equal(s.zooms, '0..17');
  near(s.finestGsdM, 0.318, 5e-4);
});

test('duplicate TileMatrixSet ids: every linked layer is needs_review, neither definition is picked (wrong one first too)', () => {
  const good = geoSet('dup'), bad = geoSet('dup', 'urn:ogc:def:crs:EPSG::3857');
  for (const sets of [bad + good, good + bad, good + good]) {
    const by = stat(capsXml(layerXml({ id: 'A', tms: 'dup' }) + layerXml({ id: 'B', tms: 'dup' }) + layerXml({ id: 'C' }), sets + geoSet('default028mm')));
    for (const id of ['A', 'B']) {
      assert.equal(by[id].status, 'needs_review', id);
      assert.ok(by[id].reasons.some((r) => /duplicate TileMatrixSet id "dup"/.test(r)), by[id].reasons.join('|'));
      assert.deepEqual(by[id].matrixes, []);
      assert.equal(by[id].crsUrn, null);
    }
    assert.equal(by.C.status, 'supported');
  }
});

test('{Style} without <Style>, format/extension mismatch, ResourceURL format mismatch -> needs_review', () => {
  const sets = geoSet('default028mm');
  const noStyle = layerXml({ id: 'NOSTYLE' }).replace(/<Style isDefault="true">[\s\S]*?<\/Style>/, '');
  const noStyleOk = layerXml({ id: 'NOSTYLE_FINE', tpl: 'https://x.test/{TileMatrix}/{TileRow}/{TileCol}.png' }).replace(/<Style isDefault="true">[\s\S]*?<\/Style>/, '');
  const extMismatch = layerXml({ id: 'EXT', fmt: 'image/png', ext: 'jpg' });
  const jpgOk = layerXml({ id: 'JPEG_OK', fmt: 'image/jpeg', ext: 'jpeg' });
  const fmtMismatch = layerXml({ id: 'FMT' }).replace('<ResourceURL format="image/png"', '<ResourceURL format="image/jpeg"');
  const by = stat(capsXml(noStyle + noStyleOk + extMismatch + jpgOk + fmtMismatch, sets));
  assert.equal(by.NOSTYLE.status, 'needs_review');
  assert.ok(by.NOSTYLE.reasons.some((r) => /\{Style\}.*no <Style>/.test(r)));
  assert.equal(by.NOSTYLE_FINE.status, 'supported');
  assert.equal(by.EXT.status, 'needs_review');
  assert.ok(by.EXT.reasons.some((r) => /does not match ResourceURL extension "\.jpg"/.test(r)));
  assert.equal(by.JPEG_OK.status, 'supported');
  assert.equal(by.FMT.status, 'needs_review');
  assert.ok(by.FMT.reasons.some((r) => /differs from layer Format/.test(r)));
});

test('duplicate Layer ids mark every entry; zero layers is ok:false', () => {
  const sets = geoSet('default028mm');
  const by = parseWmtsCapabilities(capsXml(layerXml({ id: 'SAME' }) + layerXml({ id: 'SAME' }) + layerXml({ id: 'OTHER' }), sets)).layers;
  assert.deepEqual(by.map((l) => [l.id, l.status]), [['SAME', 'needs_review'], ['SAME', 'needs_review'], ['OTHER', 'supported']]);
  assert.ok(by[0].reasons.some((r) => /duplicate Layer id "SAME"/.test(r)) && by[1].reasons.some((r) => /duplicate Layer id/.test(r)));
  // one Layer linked to two TileMatrixSets is NOT a duplicate id
  const two = capsXml(layerXml({ id: 'TWO' }).replace('</TileMatrixSetLink>', '</TileMatrixSetLink><TileMatrixSetLink><TileMatrixSet>other</TileMatrixSet></TileMatrixSetLink>'), sets + geoSet('other'));
  assert.deepEqual(parseWmtsCapabilities(two).layers.map((l) => l.status), ['supported', 'supported']);
  for (const empty of [capsXml('', sets), '<Capabilities><Contents/></Capabilities>']) {
    const r = parseWmtsCapabilities(empty);
    assert.equal(r.ok, false);
    assert.match(r.error, /no <Layer>/);
    assert.deepEqual(r.layers, []);
  }
});

// ------------------------------------------------------------------ tile edge ownership (review #15a)
// Rule implemented by lonLatToPixel/lonLatToTile (floor of the pixel coordinate): a tile OWNS its west and north edges;
// its east and south edges belong to the next tile (east/south neighbour). Exceptions: lon +180 wraps to col 0 and
// lat -90 clamps to the last row (the grid has no tile beyond them). tileRangeForBBox is the opposite, deliberately
// inclusive-by-area: a bbox that exactly equals a tile returns only that tile.

function assertEdgeOwnership(z, r, c) {
  const g = matrixGeometry(z), b = tileBoundsLonLat(z, r, c);
  const midLon = (b.west + b.east) / 2, midLat = (b.south + b.north) / 2, ctx = `z${z} r${r} c${c}`;
  const own = (lon, lat) => { const t = lonLatToTile(z, lon, lat); return [t.row, t.col]; };
  assert.deepEqual(own(b.west, midLat), [r, c], `${ctx} west edge`);
  assert.deepEqual(own(b.west, b.north), [r, c], `${ctx} NW corner`);
  assert.deepEqual(own(midLon, b.north), [r, c], `${ctx} north edge`);
  assert.deepEqual(own(b.east, midLat), [r, c + 1 === g.matrixWidth ? 0 : c + 1], `${ctx} east edge -> next col`);
  assert.deepEqual(own(midLon, b.south), [r + 1 === g.matrixHeight ? r : r + 1, c], `${ctx} south edge -> next row`);
  assert.deepEqual(own(b.east, b.south), [r + 1 === g.matrixHeight ? r : r + 1, c + 1 === g.matrixWidth ? 0 : c + 1], `${ctx} SE corner`);
  // one ulp-scale step inside stays in the tile; bbox that equals the tile returns exactly that tile
  const rg = tileRangeForBBox(z, b);
  assert.deepEqual([rg.rowMin, rg.rowMax, rg.colRanges, rg.tileCount], [r, r, [[c, c]], 1], `${ctx} bbox == tile`);
}

test('edge ownership: west & north edges belong to the tile, east & south to the next (every tile z3..z6)', () => {
  for (let z = 3; z <= 6; z++) {
    const g = matrixGeometry(z);
    for (let r = 0; r < g.matrixHeight; r++) for (let c = 0; c < g.matrixWidth; c++) assertEdgeOwnership(z, r, c);
  }
});

test('edge ownership holds for sampled tiles at z13..z17 (deterministic sample incl. first/last row/col)', () => {
  let s = 12345;
  const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
  for (let z = 13; z <= 17; z++) {
    const g = matrixGeometry(z), picks = [[0, 0], [0, g.matrixWidth - 1], [g.matrixHeight - 1, 0], [g.matrixHeight - 1, g.matrixWidth - 1]];
    for (let k = 0; k < 40; k++) picks.push([rnd(g.matrixHeight), rnd(g.matrixWidth)]);
    for (const [r, c] of picks) assertEdgeOwnership(z, r, c);
  }
  // the real Jezero tile range
  const L = MANIFEST.files.ortho_tiles.levels.find((x) => x.zoom === 17);
  assertEdgeOwnership(17, L.row_range[0], L.col_range[0]);
  assertEdgeOwnership(17, L.row_range[1], L.col_range[1]);
});

// ------------------------------------------------------------------ bbox / lon guards (review #12, #13)

test('tileRangeForBBox: east < west must wrap to a width in (0, 360]; otherwise RangeError', () => {
  assert.throws(() => tileRangeForBBox(5, { west: 200, east: -200, south: 0, north: 1 }), RangeError);
  assert.throws(() => tileRangeForBBox(5, { west: 180, east: -180, south: 0, north: 1 }), RangeError); // wraps to 0
  assert.throws(() => tileRangeForBBox(5, { west: 400, east: -400, south: 0, north: 1 }), RangeError);
  const ok = tileRangeForBBox(5, { west: 170, east: -170, south: 0, north: 1 });
  assert.equal(ok.wrapsAntimeridian, true);
  assert.ok(ok.tileCount > 1);
  assert.equal(tileRangeForBBox(5, { west: 10, east: 10, south: 0, north: 0 }).tileCount, 1); // point bbox still fine
});

test('normalizeLon rejects |lon| > 1e6 (modulo precision) but accepts the boundary and ordinary wraps', () => {
  assert.throws(() => normalizeLon(1e6 + 1), RangeError);
  assert.throws(() => normalizeLon(-1e7), RangeError);
  assert.throws(() => lonLatToTile(5, 1e12, 0), RangeError);
  assert.doesNotThrow(() => normalizeLon(1e6));
  assert.doesNotThrow(() => normalizeLon(-1e6));
  assert.equal(normalizeLon(720 + 45), 45);
});

// ------------------------------------------------------------------ URL safety (review #5, #6)

test('buildTileUrl rejects traversal / delimiter / encoded identifier values', () => {
  const ok = 'https://h.test/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png';
  const good = { tileMatrix: 3, row: 1, col: 1, style: 'default', tileMatrixSet: 'tms' };
  for (const bad of ['..', '.', '...', 'a/b', 'a\\b', 'a?b', 'a#b', 'a b', 'a\tb', 'a\nb', '%2e%2e', '%2E%2E', 'a%2fb', '..%2f', 'a:b', 'ä', '']) {
    for (const key of ['style', 'tileMatrixSet']) assert.throws(() => buildTileUrl(ok, { ...good, [key]: bad }), RangeError, `${key}=${JSON.stringify(bad)}`);
    assert.throws(() => buildTileUrl(ok, { ...good, tileMatrix: bad }), RangeError, `tileMatrix=${JSON.stringify(bad)}`);
  }
  for (const fine of ['default', 'a.b', 'a..b', 'v1.0-x_y', '0']) assert.doesNotThrow(() => buildTileUrl(ok, { ...good, style: fine }), fine);
  assert.throws(() => buildTileUrl(ok, { ...good, tileMatrix: 1e21 }), RangeError);
  assert.equal(buildTileUrl(ok, { ...good, style: 'a..b' }), 'https://h.test/a..b/tms/3/1/1.png');
});

test('buildTileUrl: rows/cols are non-negative safe integers within the supplied matrix', () => {
  const t = 'https://h.test/{TileMatrix}/{TileRow}/{TileCol}.png', m = parseWmtsCapabilities(ORTHO_XML).layers[0].matrixes[3];
  for (const bad of [{ row: -1, col: 0 }, { row: 0, col: -1 }, { row: 1.5, col: 0 }, { row: 0, col: Infinity }, { row: 2 ** 53, col: 0 }, { row: 8, col: 0 }, { row: 0, col: 16 }]) {
    assert.throws(() => buildTileUrl(t, { tileMatrix: 3, matrix: m, ...bad }), RangeError, JSON.stringify(bad));
  }
  assert.equal(buildTileUrl(t, { tileMatrix: 3, matrix: m, row: 7, col: 15 }), 'https://h.test/3/7/15.png');
});

test('buildTileUrl collapses // only in the path: scheme, query and fragment stay intact', () => {
  const g = { tileMatrix: 1, row: 0, col: 0, style: 'default' };
  assert.equal(buildTileUrl('https://h.test/a//{Style}//{TileMatrix}/{TileRow}/{TileCol}.png?src=http://a.test//b#x//y', g), 'https://h.test/a/default/1/0/0.png?src=http://a.test//b#x//y');
  assert.equal(buildTileUrl('http://h.test//{TileMatrix}/{TileRow}/{TileCol}?u=https://q//r', g), 'http://h.test/1/0/0?u=https://q//r');
  assert.equal(buildTileUrl('https://h.test/{TileMatrix}/{TileRow}/{TileCol}#//', g), 'https://h.test/1/0/0#//');
});

// ------------------------------------------------------------------ CLI parsing (review #14)

test('CLI: --json needs a value; --json may not equal the input file; truncation is reported', async () => {
  const cli = await import('../scripts/trek-catalog.mjs');
  assert.throws(() => cli.parseArgs(['x.xml', '--json']), /--json needs an output file path/);
  assert.throws(() => cli.parseArgs(['x.xml', '--json', '--timeout', '5']), /--json needs/);
  assert.equal(cli.parseArgs(['x.xml', '--json', 'out.json']).json, 'out.json');
  const { spawnSync } = await import('node:child_process');
  const script = path.join(here, '..', 'scripts', 'trek-catalog.mjs');
  const same = spawnSync(process.execPath, [script, cli.KNOWN_ORTHO_XML, '--json', cli.KNOWN_ORTHO_XML], { encoding: 'utf8' });
  assert.equal(same.status, 1);
  assert.match(same.stderr, /Refusing to overwrite/);
  assert.equal(fs.readFileSync(cli.KNOWN_ORTHO_XML, 'utf8'), ORTHO_XML); // untouched
  const noVal = spawnSync(process.execPath, [script, cli.KNOWN_ORTHO_XML, '--json'], { encoding: 'utf8' });
  assert.equal(noVal.status, 1);
  assert.match(noVal.stderr, /--json needs/);
  const known = spawnSync(process.execPath, [script, '--list-known', '--json', cli.KNOWN_ORTHO_XML], { encoding: 'utf8' });
  assert.equal(known.status, 1);
});