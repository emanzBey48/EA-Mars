// Stage 21A: Mars Trek 25 cm HiRISE ortho WMTS tiles -> aligned mosaic PNG + alignment manifest.
//
// Pure core (exported, no hidden state) + CLI guarded by an import.meta check.
//   node scripts/build-ortho-mosaic.mjs --out <dir> [--zoom 17] [--window corridor|tiles|route|dtm]
//        [--margin-m 0] [--allow-missing]
// Never writes into the repo unless --out points there. No dependencies (node:zlib / node:crypto only).
//
// Scientific rules enforced here:
//  * Output is the HiRISE ORTHO mosaic from NASA Mars Trek tiles; it is NOT the DTM hillshade.
//  * Alignment with the DTM is derived from tile arithmetic only. It is NOT visually verified
//    (the manifest says so explicitly); half-pixel registration of the source raster is unproven.
//  * Missing tiles fail closed (or are left fully transparent + listed); nothing is synthesised.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { WAYPOINTS, MAP_FRAME } from '../public/js/config.js';
import { EquirectangularProjection, adapterFromLabel } from '../public/js/geo/geo.js';

const DEG = Math.PI / 180;
export const MARS_RADIUS_M = MAP_FRAME.radiusKm * 1000;
const POW2_EPS = 1e-9;

export const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ------------------------------------------------------------------ WMTS capabilities / tile matrix math

/** Parses the WMTS capabilities text (comments stripped: the file carries a commented-out legacy matrix set). */
export function parseCapabilities(xmlText) {
  const xml = xmlText.replace(/<!--[\s\S]*?-->/g, '');
  const tag = (s, name) => {
    const m = s.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
    return m ? m[1].trim() : null;
  };
  const matrices = new Map();
  for (const m of xml.matchAll(/<TileMatrix>([\s\S]*?)<\/TileMatrix>/g)) {
    const b = m[1];
    const zoom = Number(tag(b, 'ows:Identifier'));
    const [lon, lat] = tag(b, 'TopLeftCorner').split(/\s+/).map(Number);
    matrices.set(zoom, {
      zoom,
      scaleDenominator: Number(tag(b, 'ScaleDenominator')),
      topLeftLonDeg: lon,
      topLeftLatDeg: lat,
      tileWidth: Number(tag(b, 'TileWidth')),
      tileHeight: Number(tag(b, 'TileHeight')),
      matrixWidth: Number(tag(b, 'MatrixWidth')),
      matrixHeight: Number(tag(b, 'MatrixHeight')),
    });
  }
  const layer = tag(xml, 'Layer') || '';
  const bboxM = layer.match(/<ows:BoundingBox crs="([^"]+)">\s*<ows:LowerCorner>([^<]+)<\/ows:LowerCorner>\s*<ows:UpperCorner>([^<]+)<\/ows:UpperCorner>/);
  const resUrl = layer.match(/<ResourceURL[^>]*template="([^"]+)"/);
  return {
    layerId: tag(layer, 'ows:Identifier'),
    tileMatrixSetId: tag(xml.slice(xml.indexOf('</Layer>')).replace(/^[\s\S]*?(?=<TileMatrixSet>)/, ''), 'ows:Identifier'),
    supportedCrs: tag(xml, 'ows:SupportedCRS'),
    layerBboxCrs: bboxM ? bboxM[1] : null,
    layerBboxDeg: bboxM ? (() => {
      const [w, s] = bboxM[2].trim().split(/\s+/).map(Number);
      const [e, n] = bboxM[3].trim().split(/\s+/).map(Number);
      return { west: w, south: s, east: e, north: n };
    })() : null,
    resourceUrlTemplate: resUrl ? resUrl[1] : null,
    matrices,
  };
}

/**
 * Derives the exact geometry of a TileMatrix. The XML gives no extent; the matrix is taken to span the whole globe
 * from TopLeftCorner (-180, 90) in degrees (CRS units for urn:ogc:def:crs:EPSG::104905 here), and this assumption is
 * cross-checked against manifest tile ranges elsewhere. ScaleDenominator is NOT used (it is built on an Earth radius).
 */
export function deriveMatrixGeometry(m) {
  if (m.topLeftLonDeg !== -180 || m.topLeftLatDeg !== 90) throw new Error('Unexpected TopLeftCorner; global -180/90 assumption invalid');
  const degPerPxX = 360 / (m.matrixWidth * m.tileWidth);
  const degPerPxY = 180 / (m.matrixHeight * m.tileHeight);
  if (Math.abs(degPerPxX - degPerPxY) > degPerPxX * 1e-12) throw new Error('Non-square pixels in degrees');
  return { ...m, degPerPx: degPerPxX, tileSpanLonDeg: degPerPxX * m.tileWidth, tileSpanLatDeg: degPerPxY * m.tileHeight };
}

/** Ground sample distance of a pixel at a latitude (equirectangular, latTs0 = 0, sphere R). */
export function groundSampleDistance(g, latDeg, radiusM = MARS_RADIUS_M) {
  const mPerDeg = radiusM * DEG;
  return {
    northSouthM: g.degPerPx * mPerDeg,
    eastWestProjectedM: g.degPerPx * mPerDeg, // latTs0 = 0: projected plane pixel is square
    eastWestGroundM: g.degPerPx * mPerDeg * Math.cos(latDeg * DEG),
  };
}

/** Scale-denominator-implied metres per pixel under a given body radius (0.28 mm OGC pixel), for the mismatch audit. */
export function scaleDenominatorImpliedDegPerPx(m, radiusM) {
  return (m.scaleDenominator * 0.00028) / (radiusM * DEG);
}

function assertTile(g, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= g.matrixHeight || col >= g.matrixWidth) {
    throw new RangeError(`Tile (${row},${col}) outside matrix ${g.matrixWidth}x${g.matrixHeight} at zoom ${g.zoom}`);
  }
}

/** Tile edges in degrees. Row 0 is the north row. */
export function tileBoundsDeg(g, row, col) {
  assertTile(g, row, col);
  return {
    west: -180 + col * g.tileSpanLonDeg,
    east: -180 + (col + 1) * g.tileSpanLonDeg,
    north: 90 - row * g.tileSpanLatDeg,
    south: 90 - (row + 1) * g.tileSpanLatDeg,
  };
}

/** Tile edges in projected metres (sphere equirectangular latTs0=0, lon0=0: X = lon*R*DEG, Y = lat*R*DEG). */
export function tileBoundsProjectedM(g, row, col, radiusM = MARS_RADIUS_M) {
  const b = tileBoundsDeg(g, row, col);
  const p = new EquirectangularProjection({ radiusM });
  const sw = p.forward(b.south, b.west), ne = p.forward(b.north, b.east);
  return { xMin: sw.X, xMax: ne.X, yMin: sw.Y, yMax: ne.Y };
}

/** Continuous global pixel coordinates; integer values are pixel EDGES (pixel-is-area). Pixel centre = index + 0.5. */
export function lonLatToGlobalPixel(g, lonDeg, latDeg) {
  return { gx: (lonDeg + 180) / g.degPerPx, gy: (90 - latDeg) / g.degPerPx };
}
export function globalPixelToLonLat(g, gx, gy) {
  return { lonDeg: -180 + gx * g.degPerPx, latDeg: 90 - gy * g.degPerPx };
}
/** Lon/lat of the CENTRE of integer pixel (ix, iy). */
export function pixelCenterToLonLat(g, ix, iy) {
  return globalPixelToLonLat(g, ix + 0.5, iy + 0.5);
}
/** Global pixel index <-> (tile, in-tile pixel). */
export function globalPixelToTile(g, ix, iy) {
  return { col: Math.floor(ix / g.tileWidth), row: Math.floor(iy / g.tileHeight), px: ix % g.tileWidth, py: iy % g.tileHeight };
}

/** Outward-rounded integer pixel rectangle [x0,x1) x [y0,y1) covering a lon/lat bbox. */
export function pixelBoundsForBbox(g, bbox) {
  const nw = lonLatToGlobalPixel(g, bbox.west, bbox.north), se = lonLatToGlobalPixel(g, bbox.east, bbox.south);
  const r = (v, f) => f(Math.round(v * 1e6) / 1e6); // absorb ~1e-6 px float noise on exact edges
  return { x0: r(nw.gx, Math.floor), y0: r(nw.gy, Math.floor), x1: r(se.gx, Math.ceil), y1: r(se.gy, Math.ceil) };
}

/** Tiles (row/col list + ranges) touched by a lon/lat bbox. */
export function tileCoverageForBbox(g, bbox) {
  const px = pixelBoundsForBbox(g, bbox);
  const colMin = Math.floor(px.x0 / g.tileWidth), colMax = Math.ceil(px.x1 / g.tileWidth) - 1;
  const rowMin = Math.floor(px.y0 / g.tileHeight), rowMax = Math.ceil(px.y1 / g.tileHeight) - 1;
  const tiles = [];
  for (let row = rowMin; row <= rowMax; row++) for (let col = colMin; col <= colMax; col++) tiles.push({ row, col });
  return { rowMin, rowMax, colMin, colMax, tiles };
}

// ------------------------------------------------------------------ PNG codec (no deps)

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
export function crc32(buf, seed = 0) {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes a non-interlaced 8-bit PNG of color type 0/2/4/6. Verifies signature, chunk CRCs and IEND; otherwise throws. */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('Not a PNG (bad signature)');
  let off = 8, ihdr = null, sawEnd = false;
  const idat = [];
  while (off < buf.length) {
    if (off + 12 > buf.length) throw new Error('Truncated PNG chunk');
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (off + 12 + len > buf.length) throw new Error(`Truncated PNG chunk ${type}`);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) throw new Error(`PNG CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      if (len !== 13) throw new Error('Bad IHDR');
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], compression: data[10], filter: data[11], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { sawEnd = true; break; }
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG missing IHDR');
  if (!sawEnd) throw new Error('PNG missing IEND');
  if (ihdr.bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${ihdr.bitDepth}`);
  const channels = CHANNELS_BY_COLOR_TYPE[ihdr.colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${ihdr.colorType}`);
  if (ihdr.interlace !== 0) throw new Error('Interlaced PNG not supported');
  if (ihdr.compression !== 0 || ihdr.filter !== 0) throw new Error('Unsupported PNG compression/filter method');
  if (!(ihdr.width > 0 && ihdr.height > 0)) throw new Error('Bad PNG dimensions');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  if (raw.length !== (stride + 1) * ihdr.height) throw new Error('PNG data length mismatch');
  const out = new Uint8Array(stride * ihdr.height);
  for (let y = 0; y < ihdr.height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? out[dst + i - channels] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= channels ? out[prev + i - channels] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter type ${ft}`);
      }
      out[dst + i] = v & 0xff;
    }
  }
  return { width: ihdr.width, height: ihdr.height, channels, colorType: ihdr.colorType, bitDepth: 8, data: out };
}

/** Reads only the IHDR (after signature + CRC check of that chunk). */
export function readPngHeader(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('Not a PNG');
  if (crc32(buf.subarray(12, 29)) !== buf.readUInt32BE(29)) throw new Error('IHDR CRC mismatch');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], interlace: buf[28] };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Applies PNG filter `ft` (0-4) to one scanline. Exported so tests can build every filter type. */
export function filterScanline(ft, line, prev, channels) {
  const out = Buffer.alloc(line.length);
  for (let i = 0; i < line.length; i++) {
    const a = i >= channels ? line[i - channels] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= channels ? prev[i - channels] : 0;
    const pred = ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : paeth(a, b, c);
    out[i] = (line[i] - pred) & 0xff;
  }
  return out;
}

const COLOR_TYPE_BY_CHANNELS = { 1: 0, 2: 4, 3: 2, 4: 6 };
/**
 * Encodes 8-bit non-interlaced PNG. `filterType` 0-4 is applied to every row (deterministic); an array gives per-row types.
 * Output is deterministic for a given Node/zlib version.
 */
export function encodePng({ width, height, channels, data }, { filterType = 0, level = 9 } = {}) {
  const colorType = COLOR_TYPE_BY_CHANNELS[channels];
  if (colorType === undefined) throw new Error('channels must be 1-4');
  if (data.length !== width * height * channels) throw new Error('Pixel buffer size mismatch');
  const stride = width * channels;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const ft = Array.isArray(filterType) ? filterType[y % filterType.length] : filterType;
    const line = Buffer.from(data.buffer, data.byteOffset + y * stride, stride);
    const prev = y > 0 ? Buffer.from(data.buffer, data.byteOffset + (y - 1) * stride, stride) : null;
    rows[y * (stride + 1)] = ft;
    filterScanline(ft, line, prev, channels).copy(rows, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level })), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ mosaic

function toRgba(img) {
  const { width, height, channels, data } = img;
  if (channels === 4) return data;
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (channels === 1 || channels === 2) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = data[i * channels]; out[i * 4 + 3] = channels === 2 ? data[i * 2 + 1] : 255; }
    else { out[i * 4] = data[i * 3]; out[i * 4 + 1] = data[i * 3 + 1]; out[i * 4 + 2] = data[i * 3 + 2]; out[i * 4 + 3] = 255; }
  }
  return out;
}
function toGrayAlpha(img) {
  if (img.channels === 2) return img.data;
  const out = new Uint8Array(img.width * img.height * 2);
  for (let i = 0; i < img.width * img.height; i++) { out[i * 2] = img.data[i]; out[i * 2 + 1] = 255; } // channels === 1
  return out;
}

/**
 * Stitches tiles into a pixel-aligned mosaic of the integer pixel rectangle `px` ({x0,y0,x1,y1}) of matrix `g`.
 * `readTile(row, col)` returns a Buffer or null/undefined when absent. Missing tiles throw unless `allowMissing`,
 * in which case their area stays alpha=0 (no fabricated imagery) and they are listed in `missing`.
 */
export function buildMosaic({ matrix: g, pixelBounds: px, readTile, allowMissing = false }) {
  const width = px.x1 - px.x0, height = px.y1 - px.y0;
  if (!(width > 0 && height > 0)) throw new Error('Empty mosaic window');
  const cov = tileCoverageForBbox(g, { ...globalPixelToLonLatBbox(g, px) });
  const decoded = new Map(), tiles = [], missing = [];
  for (const { row, col } of cov.tiles) {
    const buf = readTile(row, col);
    if (!buf) { missing.push({ row, col }); tiles.push({ zoom: g.zoom, row, col, status: 'missing' }); continue; }
    const img = decodePng(buf);
    if (img.width !== g.tileWidth || img.height !== g.tileHeight) throw new Error(`Tile ${row}/${col} size ${img.width}x${img.height} != matrix ${g.tileWidth}x${g.tileHeight}`);
    decoded.set(`${row}/${col}`, img);
    tiles.push({ zoom: g.zoom, row, col, status: 'ok', bytes: buf.length, sha256: sha256Hex(buf), colorType: img.colorType, bitDepth: img.bitDepth });
  }
  if (missing.length && !allowMissing) {
    const e = new Error(`Missing ${missing.length} tile(s): ${missing.map((m) => `${g.zoom}/${m.row}/${m.col}`).join(', ')}`);
    e.missing = missing;
    throw e;
  }
  const color = [...decoded.values()].some((i) => i.channels >= 3);
  const channels = color ? 4 : 2;
  const data = new Uint8Array(width * height * channels); // zero-initialised: alpha 0 = no data
  for (const [key, img] of decoded) {
    const [row, col] = key.split('/').map(Number);
    const src = color ? toRgba(img) : toGrayAlpha(img);
    const tx0 = col * g.tileWidth, ty0 = row * g.tileHeight;
    const ax = Math.max(px.x0, tx0), bx = Math.min(px.x1, tx0 + g.tileWidth);
    const ay = Math.max(px.y0, ty0), by = Math.min(px.y1, ty0 + g.tileHeight);
    for (let gy = ay; gy < by; gy++) {
      const s = ((gy - ty0) * g.tileWidth + (ax - tx0)) * channels;
      const d = ((gy - px.y0) * width + (ax - px.x0)) * channels;
      data.set(src.subarray(s, s + (bx - ax) * channels), d);
    }
  }
  let transparent = 0;
  for (let i = channels - 1; i < data.length; i += channels) if (data[i] === 0) transparent++;
  return { width, height, channels, data, tiles, missing, transparentPixels: transparent };
}

function globalPixelToLonLatBbox(g, px) {
  // shrink by a tiny epsilon so exact tile edges do not pull in the neighbouring tile
  const nw = globalPixelToLonLat(g, px.x0 + 1e-6, px.y0 + 1e-6), se = globalPixelToLonLat(g, px.x1 - 1e-6, px.y1 - 1e-6);
  return { west: nw.lonDeg, north: nw.latDeg, east: se.lonDeg, south: se.latDeg };
}

// ------------------------------------------------------------------ local frame / UV

export function defaultLocalAdapter() {
  const o = WAYPOINTS[0];
  return adapterFromLabel(MAP_FRAME, { latDeg: o.latDeg, lonDeg: o.lonDeg });
}

/**
 * Local-metre rectangle of a pixel rectangle (via injected toLocal(latDeg, lonDeg) -> {x, y}) and the UV affine:
 *   u = x * uScale + uOffset,  v = y * vScale + vOffset   (v = 0 is the TOP image row; do NOT flip-Y again)
 * Exact because both the tile grid and the sim plane are linear in lon/lat (equirectangular, latTs0 = 0).
 */
export function uvMappingForWindow(g, px, toLocal) {
  const nw = globalPixelToLonLat(g, px.x0, px.y0), se = globalPixelToLonLat(g, px.x1, px.y1);
  const a = toLocal(nw.latDeg, nw.lonDeg), b = toLocal(se.latDeg, se.lonDeg);
  const xMin = a.x, xMax = b.x, yMax = a.y, yMin = b.y;
  const uScale = 1 / (xMax - xMin), vScale = -1 / (yMax - yMin);
  return {
    bboxDeg: { west: nw.lonDeg, east: se.lonDeg, north: nw.latDeg, south: se.latDeg },
    localBoundsM: { xMin, xMax, yMin, yMax },
    sizeM: { width: xMax - xMin, height: yMax - yMin },
    uv: { uScale, uOffset: -xMin * uScale, vScale, vOffset: -yMax * vScale, vOrigin: 'top-row' },
  };
}
export function localToUv(mapping, x, y) {
  const { uScale, uOffset, vScale, vOffset } = mapping.uv;
  return { u: x * uScale + uOffset, v: y * vScale + vOffset };
}

// ------------------------------------------------------------------ metadata helpers

export function parseFgdc(html) {
  const meta = (n) => { const m = html.match(new RegExp(`<meta name="${n}" content="([^"]*)"`)); return m ? m[1] : null; };
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? null;
  const abs = html.match(/<dt><em>Abstract:<\/em>\s*<dd>\s*([\s\S]*?)<\/dd>/);
  const field = (name) => { const m = html.match(new RegExp(`<dt><em>${name}:</em>([^<]*)</dt>`)); return m ? m[1].trim() : null; };
  return {
    title,
    abstract: abs ? abs[1].trim() : null,
    dcRights: meta('dc.rights'),
    dcCreator: meta('dc.creator'),
    originator: field('Originator'),
    publicationDate: field('Publication_Date'),
    accessConstraints: field('Access_Constraints'),
    useConstraints: field('Use_Constraints'),
    boundsDeg: {
      west: Number(field('West_Bounding_Coordinate')), east: Number(field('East_Bounding_Coordinate')),
      north: Number(field('North_Bounding_Coordinate')), south: Number(field('South_Bounding_Coordinate')),
    },
  };
}

const tilePath = (root, z, row, col) => path.join(root, String(z), String(row), `${col}.png`);

/** Inventory audit of the tile files against manifest.json levels (the manifest carries NO per-tile hashes). */
export function auditInventory({ manifest, tilesRoot, matrices, fsApi = fs }) {
  const meta = manifest.files.ortho_tiles;
  const levels = [];
  for (const L of meta.levels) {
    const g = deriveMatrixGeometry(matrices.get(L.zoom));
    let count = 0, bytes = 0;
    const present = new Set();
    for (let row = L.row_range[0]; row <= L.row_range[1]; row++) {
      for (let col = L.col_range[0]; col <= L.col_range[1]; col++) {
        const p = tilePath(tilesRoot, L.zoom, row, col);
        if (fsApi.existsSync(p)) { count++; bytes += fsApi.statSync(p).size; present.add(`${row}/${col}`); }
      }
    }
    const gridTiles = (L.row_range[1] - L.row_range[0] + 1) * (L.col_range[1] - L.col_range[0] + 1);
    const nw = tileBoundsDeg(g, L.row_range[0], L.col_range[0]), se = tileBoundsDeg(g, L.row_range[1], L.col_range[1]);
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const gsd = groundSampleDistance(g, (nw.north + se.south) / 2);
    levels.push({
      zoom: L.zoom,
      gridTiles, tilesFound: count, tileCountMatchesManifest: count === L.tile_count && gridTiles === L.tile_count,
      bytesFound: bytes, bytesMatchManifest: bytes === L.total_bytes,
      latRangeMatches: near(se.south, L.lat_range[0]) && near(nw.north, L.lat_range[1]),
      lonRangeMatches: near(nw.west, L.lon_range[0]) && near(se.east, L.lon_range[1]),
      resolutionManifestM: L.resolution_m_per_px, resolutionComputedM: gsd.northSouthM,
      resolutionMatches: Math.abs(gsd.northSouthM - L.resolution_m_per_px) < 0.001,
    });
  }
  return { totalTilesFound: levels.reduce((s, l) => s + l.tilesFound, 0), manifestTotalTiles: meta.total_tiles, levels };
}

/** Hash audit of the text metadata files named in the manifest (CRLF-normalised retry reported separately). */
export function auditMetadataFiles({ manifest, dir, fsApi = fs }) {
  return manifest.files.metadata_and_vectors
    .filter((f) => /ortho|WMTS/.test(f.file))
    .map((f) => {
      const buf = fsApi.readFileSync(path.join(dir, f.file));
      const lf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      return {
        file: f.file, manifestSha256: f.sha256, manifestSize: f.size_bytes,
        diskSize: buf.length, diskSha256: sha256Hex(buf), matches: sha256Hex(buf) === f.sha256,
        lfNormalisedSha256: sha256Hex(lf), lfNormalisedMatches: sha256Hex(lf) === f.sha256,
      };
    });
}

// ------------------------------------------------------------------ windows

export function namedWindows({ manifest, dtmSubset = null, waypoints = WAYPOINTS, tileUnion = null }) {
  const c = manifest.target_region.corridor_bounds;
  const lats = waypoints.map((w) => w.latDeg), lons = waypoints.map((w) => w.lonDeg);
  const w = {
    corridor: { west: c.west_lon_deg, east: c.east_lon_deg, south: c.south_lat_deg, north: c.north_lat_deg, source: 'manifest.target_region.corridor_bounds' },
    route: { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats), source: 'config.js WAYPOINTS bbox (Sol 120 / Sol 164)' },
  };
  if (dtmSubset) { const b = dtmSubset.coverage.latLonBounds; w.dtm = { west: b.west, east: b.east, south: b.south, north: b.north, source: 'data/dtm_subset.json coverage.latLonBounds' }; }
  if (tileUnion) w.tiles = { ...tileUnion, source: 'union of tiles present at chosen zoom' };
  return w;
}
export function expandBboxMetres(b, marginM, radiusM = MARS_RADIUS_M) {
  const d = marginM / (radiusM * DEG); // latTs0 = 0 plane: same metres/deg both axes
  return { west: b.west - d, east: b.east + d, south: b.south - d, north: b.north + d };
}

// ------------------------------------------------------------------ alignment manifest

export function buildAlignmentManifest({ capabilities, g, windowName, windowSource, requestedBbox, marginM, mosaic, pixelBounds, mosaicFile, mosaicSha256,
  mosaicBytes, toLocal, fgdc, fileHashes, inventory, metadataAudit, dtmSubset, otherWindowCoverage }) {
  const mapping = uvMappingForWindow(g, pixelBounds, toLocal);
  const centreLat = (mapping.bboxDeg.north + mapping.bboxDeg.south) / 2;
  const gsd = groundSampleDistance(g, centreLat);
  let meshWindow = null;
  if (dtmSubset) {
    const lb = dtmSubset.coverage.localBoundsM;
    const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const covered = ov(lb.xMin, lb.xMax, mapping.localBoundsM.xMin, mapping.localBoundsM.xMax) * ov(lb.yMin, lb.yMax, mapping.localBoundsM.yMin, mapping.localBoundsM.yMax);
    meshWindow = {
      source: 'data/dtm_subset.json coverage.localBoundsM',
      localBoundsM: lb,
      uvOfMeshCorners: {
        northWest: localToUv(mapping, lb.xMin, lb.yMax), southEast: localToUv(mapping, lb.xMax, lb.yMin),
      },
      mosaicCoversFractionOfMeshWindow: covered / ((lb.xMax - lb.xMin) * (lb.yMax - lb.yMin)),
      note: 'UV outside [0,1] has no ortho imagery: keep DTM hillshade there (never stretch / clamp-extend the edge).',
    };
  }
  return {
    schema: 'marswalk.ortho-alignment.v1',
    product: {
      kind: 'HiRISE orthomosaic (WMTS tiles from NASA Mars Trek). Not the DTM hillshade; not from JP2.',
      layerId: capabilities.layerId, tileMatrixSet: capabilities.tileMatrixSetId, crs: capabilities.supportedCrs, zoom: g.zoom,
      resourceUrlTemplate: capabilities.resourceUrlTemplate,
    },
    tileMatrix: {
      topLeftCornerDeg: { lon: g.topLeftLonDeg, lat: g.topLeftLatDeg }, tilePx: [g.tileWidth, g.tileHeight],
      matrixSize: [g.matrixWidth, g.matrixHeight], degPerPx: g.degPerPx,
      pathOrder: 'ortho-tiles/{zoom}/{row}/{col}.png (row = TileRow, north = 0)',
      extentAssumption: 'matrix spans the globe (-180..180, 90..-90); ScaleDenominator is Earth-based and NOT used',
    },
    registration: {
      convention: 'PIXEL_IS_AREA (WMTS): pixel (i,j) spans [lon0+i*d, lon0+(i+1)*d]; its centre is +0.5 px. Integer global coordinates are pixel EDGES.',
      pixelCenterOffsetPx: 0.5,
      glTexelNote: 'UV edges u=0/1 map to the outer mosaic pixel edges; GL texel centres (i+0.5)/W are consistent with this convention.',
      halfPixelRegistrationOfSourceRasterVerified: false,
      alignmentVsDtmVisuallyVerified: false,
      statusTr: 'Hizalama DTM ile gorsel olarak DOGRULANMADI; sadece karo aritmetigi (WMTS) ile turetildi. Kaynak raster yari-piksel kaydi kanitlanmadi.',
    },
    groundSampleDistance: {
      atLatDeg: centreLat, ...gsd,
      nominalClaim: '25 cm', meetsNominal25cm: gsd.eastWestGroundM <= 0.25 && gsd.northSouthM <= 0.25,
      note: 'Metres per pixel from degree grid and R=3396190 m; zoom 17 is the finest tile level available.',
    },
    window: {
      name: windowName, source: windowSource, requestedBboxDeg: requestedBbox, marginM,
      pixelBoundsGlobal: pixelBounds, sizePx: [mosaic.width, mosaic.height],
      actualBboxDeg: mapping.bboxDeg, localBoundsM: mapping.localBoundsM, sizeM: mapping.sizeM,
      localFrame: 'Sim local plane: x east, y north, metres, origin = Sol 120 waypoint, equirectangular latTs0=0 lon0=0 R=3396190 (geo.js)',
    },
    uvMapping: mapping.uv,
    meshWindow,
    otherWindowCoverage,
    mosaic: {
      file: mosaicFile, bytes: mosaicBytes, sha256: mosaicSha256, widthPx: mosaic.width, heightPx: mosaic.height,
      channels: mosaic.channels, bitDepth: 8, layout: mosaic.channels === 2 ? 'gray+alpha' : 'RGBA', transparentPixels: mosaic.transparentPixels,
    },
    tiles: mosaic.tiles, missingTiles: mosaic.missing,
    integrity: {
      note: 'manifest.json carries no per-tile sha256; sha256 below are computed here and can be pinned.',
      inventory, metadataFiles: metadataAudit, sourceFileSha256: fileHashes,
    },
    attribution: {
      fgdcTitle: fgdc.title, fgdcAbstractVerbatim: fgdc.abstract, fgdcDcRights: fgdc.dcRights, fgdcUseConstraints: fgdc.useConstraints,
      fgdcAccessConstraints: fgdc.accessConstraints, fgdcOriginator: fgdc.originator,
      licenseStatus: 'NOT_STATED_IN_PROVIDED_FGDC',
      creditAsFoundInManifest: 'USGS/NASA MRO HiRISE Controlled Orthomosaic (25cm resolution) over Jezero crater TRN basemap; generated by the USGS Astrogeology Science Center (per FGDC abstract); served by NASA JPL Mars Trek',
      note: 'FGDC rights/constraints fields are empty. config.js MAP_FRAME.attribution/CC0 text belongs to the DTM product; 21B must confirm ortho licence before claiming it.',
    },
    caveats: [
      'Alignment with the DTM is NOT visually verified.',
      'Half-pixel registration of the source orthomosaic is not proven by any provided metadata.',
      'This is orthoimagery, not DTM hillshade; do not label the hillshade "ortho".',
      'Tile alpha < 255 / alpha 0 means no data; no imagery was synthesised.',
    ],
  };
}

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const o = { zoom: 17, window: 'corridor', marginM: 0, allowMissing: false, out: null, dataDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--zoom') o.zoom = Number(argv[++i]);
    else if (a === '--window') o.window = argv[++i];
    else if (a === '--margin-m') o.marginM = Number(argv[++i]);
    else if (a === '--data-dir') o.dataDir = argv[++i];
    else if (a === '--allow-missing') o.allowMissing = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!o.out) throw new Error('--out <dir> is required (outputs are never written implicitly into the repo)');
  return o;
}

export function runBuild(opts, { fsApi = fs } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = opts.dataDir || path.join(here, '..', 'data', 'mars-trek');
  const tilesRoot = path.join(dataDir, 'ortho-tiles');
  const manifest = JSON.parse(fsApi.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  const capsText = fsApi.readFileSync(path.join(dataDir, 'hirise_ortho_25cm_WMTSCapabilities.xml'), 'utf8');
  const fgdcBuf = fsApi.readFileSync(path.join(dataDir, 'hirise_ortho_25cm_fgdc.html'));
  const capabilities = parseCapabilities(capsText);
  if (!capabilities.matrices.has(opts.zoom)) throw new Error(`Zoom ${opts.zoom} not in TileMatrixSet`);
  const g = deriveMatrixGeometry(capabilities.matrices.get(opts.zoom));
  const fgdc = parseFgdc(fgdcBuf.toString('utf8'));
  const dtmPath = path.join(dataDir, '..', 'dtm_subset.json');
  const dtmSubset = fsApi.existsSync(dtmPath) ? JSON.parse(fsApi.readFileSync(dtmPath, 'utf8')) : null;

  const level = manifest.files.ortho_tiles.levels.find((l) => l.zoom === opts.zoom);
  const tileUnion = level ? {
    ...(() => { const nw = tileBoundsDeg(g, level.row_range[0], level.col_range[0]), se = tileBoundsDeg(g, level.row_range[1], level.col_range[1]); return { west: nw.west, east: se.east, north: nw.north, south: se.south }; })(),
  } : null;
  const windows = namedWindows({ manifest, dtmSubset, tileUnion });
  const chosen = windows[opts.window];
  if (!chosen) throw new Error(`Unknown window ${opts.window}; choose ${Object.keys(windows).join('|')}`);
  const requested = expandBboxMetres(chosen, opts.marginM);
  const pixelBounds = pixelBoundsForBbox(g, requested);

  const readTile = (row, col) => {
    const p = tilePath(tilesRoot, g.zoom, row, col);
    return fsApi.existsSync(p) ? fsApi.readFileSync(p) : null;
  };
  const mosaic = buildMosaic({ matrix: g, pixelBounds, readTile, allowMissing: opts.allowMissing });

  // Coverage of every named window at this zoom (never silently ignores windows that tiles do not reach).
  const otherWindowCoverage = {};
  for (const [name, b] of Object.entries(windows)) {
    const cov = tileCoverageForBbox(g, b);
    const miss = cov.tiles.filter((t) => !readTile(t.row, t.col));
    otherWindowCoverage[name] = { tilesNeeded: cov.tiles.length, tilesMissing: miss.length, complete: miss.length === 0, missingSample: miss.slice(0, 6) };
  }

  const localAdapter = defaultLocalAdapter();
  const png = encodePng(mosaic, { filterType: 0, level: 9 });
  const mosaicFile = `ortho-mosaic-z${g.zoom}-${opts.window}.png`;
  const manifestOut = buildAlignmentManifest({
    capabilities, g, windowName: opts.window, windowSource: chosen.source, requestedBbox: chosen, marginM: opts.marginM, mosaic, pixelBounds,
    mosaicFile, mosaicSha256: sha256Hex(png), mosaicBytes: png.length, toLocal: localAdapter.latLonToLocal.bind(localAdapter),
    fgdc, fileHashes: {
      'hirise_ortho_25cm_WMTSCapabilities.xml': sha256Hex(Buffer.from(capsText, 'utf8')),
      'hirise_ortho_25cm_fgdc.html': sha256Hex(fgdcBuf),
    },
    inventory: auditInventory({ manifest, tilesRoot, matrices: capabilities.matrices, fsApi }),
    metadataAudit: auditMetadataFiles({ manifest, dir: dataDir, fsApi }), dtmSubset, otherWindowCoverage,
  });
  return { png, mosaicFile, manifestOut, manifestFile: `ortho-alignment-z${g.zoom}-${opts.window}.json` };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const r = runBuild(opts);
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, r.mosaicFile), r.png);
    fs.writeFileSync(path.join(opts.out, r.manifestFile), JSON.stringify(r.manifestOut, null, 2) + '\n');
    console.log(`OK ${r.mosaicFile} ${r.manifestOut.mosaic.widthPx}x${r.manifestOut.mosaic.heightPx} sha256=${r.manifestOut.mosaic.sha256}`);
    console.log(`   ${r.manifestFile} missing=${r.manifestOut.missingTiles.length} (alignment NOT visually verified)`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
