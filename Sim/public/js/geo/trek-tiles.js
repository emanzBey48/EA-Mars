// Stage 26A: Mars Trek WMTS capabilities parsing + geographic (EPSG:104905) tile math.
//
// Pure and browser-safe: no fs / fetch / DOM / globals. Every object returned by an exported function is deep-frozen
// (parseXml, parseWmtsCapabilities, geographicGridProblems, matrixGeometry and the tile/GSD helpers); inputs are not mutated.
// Generalises the Stage 21A tile math (scripts/build-ortho-mosaic.mjs) from one layer to any layer whose
// TileMatrixSet is the global geographic grid (TopLeftCorner -180 90, square pixels, 2:1 matrix).
//
// Scientific rules enforced here:
//  * The XML ScaleDenominator is built from an Earth radius and is NEVER used for Mars metres;
//    it is only carried along as `scaleDenominatorRaw`. Metres per pixel come from degrees-per-pixel x metres-per-degree.
//  * Anything not positively recognised (CRS, axis order, matrix geometry, resource template) is `needs_review`
//    (fail closed). Nothing is guessed, nothing is invented: every catalog field is read from the document.
//  * Pixel convention is PIXEL_IS_AREA: integer global pixel coordinates are pixel EDGES, centre = index + 0.5.

export const MARS_RADIUS_M = 3396190; // Mars 2000 sphere used by the project (IAU/IAG semi-major axis)
const DEG = Math.PI / 180;

/**
 * CRS URNs recognised as the Mars 2000 geographic CRS (lon, lat degrees). EPSG spelling: seen in the WMTS capabilities
 * documents. IAU2000 spelling: seen only in the Trek viewer's config.json ("projections.equirectangular"); the layer-search
 * responses saved during Stage 26A contain no CRS URN of either kind. Both are accepted because they name the same code.
 */
export const KNOWN_GEOGRAPHIC_CRS = Object.freeze([
  'urn:ogc:def:crs:EPSG::104905',
  'urn:ogc:def:crs:IAU2000::104905',
]);

/** Default scheme observed in the Mars Trek equirectangular WMTS: zoom z -> (2^(z+1)) x (2^z) tiles of 256 px. */
export const DEFAULT_SCHEME = Object.freeze({ tileSize: 256, baseColumns: 2, baseRows: 1 });
/** The only tile edge length this module's math is accepted for (everything else is needs_review / RangeError). */
export const TILE_SIZE_PX = DEFAULT_SCHEME.tileSize;

const PIXEL_EDGE_EPS = 1e-6; // absorbs float noise on exact tile edges (same policy as Stage 21A)

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ------------------------------------------------------------------ linear XML scanner

/** Hard input limits (fail closed): a WMTS capabilities document is a few KB..MB, never tens of MB. */
export const MAX_XML_CHARS = 20 * 1024 * 1024;
export const MAX_XML_DEPTH = 256;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
  if (e[0] === '#') {
    const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
  }
  return Object.hasOwn(ENTITIES, e) ? ENTITIES[e] : m;
}));
const localName = (qn) => qn.slice(qn.indexOf(':') + 1);
const isWs = (c) => c === 32 || c === 9 || c === 10 || c === 13;
const isNameStart = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isNameChar = (c) => isNameStart(c) || (c >= 48 && c <= 57) || c === 58 || c === 46 || c === 45; // [A-Za-z0-9_:.-]

/**
 * Parses XML text into {name (local, namespace prefix dropped), qname, attrs, children, text}. Skips declarations,
 * comments, DOCTYPE (internal subset is skipped, entities are NOT expanded) and processing instructions; CDATA becomes
 * text. Throws (never loops or rescans) on: input over MAX_XML_CHARS, nesting over MAX_XML_DEPTH, any unclosed
 * comment / CDATA / PI / DOCTYPE / tag / attribute quote, malformed attributes, mismatched or unbalanced tags.
 *
 * Complexity: single forward pass, O(n). Every `indexOf` that fails ends the parse immediately, so no construct is
 * ever searched for twice. The returned tree is deep-frozen.
 */
export function parseXml(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('XML text is empty');
  if (text.length > MAX_XML_CHARS) throw new Error(`XML input too large (${text.length} > ${MAX_XML_CHARS} characters)`);
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = src.length;
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  const fail = (what, at) => { throw new Error(`${what} at offset ${at}`); };
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) { top.text += decode(src.slice(i)); break; }
    if (lt > i) top.text += decode(src.slice(i, lt));
    const c1 = src.charCodeAt(lt + 1);
    if (c1 === 33) { // '<!'
      if (src.startsWith('<!--', lt)) {
        const e = src.indexOf('-->', lt + 4);
        if (e < 0) fail('Unclosed comment', lt);
        i = e + 3;
      } else if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt + 9);
        if (e < 0) fail('Unclosed CDATA section', lt);
        top.text += src.slice(lt + 9, e);
        i = e + 3;
      } else if (src.startsWith('<!DOCTYPE', lt)) {
        let e = src.indexOf('>', lt + 9);
        if (e < 0) fail('Unclosed DOCTYPE', lt);
        if (src.slice(lt + 9, e).includes('[')) { // internal subset: skip up to "]" then ">"; never expanded
          const cb = src.indexOf(']', lt + 9);
          e = cb < 0 ? -1 : src.indexOf('>', cb);
          if (e < 0) fail('Unclosed DOCTYPE internal subset', lt);
        }
        i = e + 1;
      } else fail('Unsupported markup declaration', lt);
    } else if (c1 === 63) { // '<?'
      const e = src.indexOf('?>', lt + 2);
      if (e < 0) fail('Unclosed processing instruction', lt);
      i = e + 2;
    } else {
      let p = lt + 1;
      const closing = c1 === 47;
      if (closing) p++;
      if (!isNameStart(src.charCodeAt(p))) fail('Invalid markup', lt);
      const nameStart = p;
      while (p < n && isNameChar(src.charCodeAt(p))) p++;
      const qname = src.slice(nameStart, p);
      while (p < n && isWs(src.charCodeAt(p))) p++;
      if (closing) {
        if (src.charCodeAt(p) !== 62) fail('Malformed closing tag', lt);
        if (stack.length < 2 || top.qname !== qname) fail(`Mismatched closing tag </${qname}>`, lt);
        stack.pop();
        i = p + 1;
        continue;
      }
      const attrs = {};
      let selfClose = false;
      for (;;) {
        if (p >= n) fail('Unclosed tag', lt);
        const c = src.charCodeAt(p);
        if (c === 62) { p++; break; }
        if (c === 47) { if (src.charCodeAt(p + 1) !== 62) fail('Malformed tag', lt); selfClose = true; p += 2; break; }
        if (!isNameStart(c)) fail('Malformed attribute', p);
        const as = p;
        while (p < n && isNameChar(src.charCodeAt(p))) p++;
        const an = src.slice(as, p);
        while (p < n && isWs(src.charCodeAt(p))) p++;
        if (src.charCodeAt(p) !== 61) fail(`Attribute "${an}" has no value`, p);
        p++;
        while (p < n && isWs(src.charCodeAt(p))) p++;
        const q = src.charCodeAt(p);
        if (q !== 34 && q !== 39) fail(`Attribute "${an}" value is not quoted`, p);
        const qe = src.indexOf(q === 34 ? '"' : "'", p + 1);
        if (qe < 0) fail(`Unclosed attribute value "${an}"`, p);
        attrs[an] = decode(src.slice(p + 1, qe));
        p = qe + 1;
        while (p < n && isWs(src.charCodeAt(p))) p++;
      }
      if (!selfClose && stack.length > MAX_XML_DEPTH) fail(`Nesting deeper than ${MAX_XML_DEPTH}`, lt);
      const node = { name: localName(qname), qname, attrs, children: [], text: '' };
      top.children.push(node);
      if (!selfClose) stack.push(node);
      i = p;
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed element <${stack[stack.length - 1].qname}>`);
  if (root.children.length !== 1) throw new Error('XML must have exactly one root element');
  return deepFreeze(root.children[0]);
}

const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const kid = (n, name) => kids(n, name)[0] ?? null;
const txt = (n) => (n ? n.text.trim() : '');
const kidText = (n, name) => { const k = kid(n, name); return k ? txt(k) : null; };
const numList = (s, n) => {
  if (typeof s !== 'string') return null;
  const parts = s.trim().split(/\s+/);
  if (parts.length !== n) return null;
  const v = parts.map(Number);
  return v.every(Number.isFinite) ? v : null;
};

// ------------------------------------------------------------------ WMTS capabilities -> catalog

/** Template placeholders defined by OGC WMTS 1.0.0 RESTful. */
export const WMTS_PLACEHOLDERS = Object.freeze(['Style', 'TileMatrixSet', 'TileMatrix', 'TileRow', 'TileCol']);

function parseMatrix(node) {
  const topLeft = numList(kidText(node, 'TopLeftCorner'), 2);
  return {
    id: kidText(node, 'Identifier'),
    matrixWidth: Number(kidText(node, 'MatrixWidth')),
    matrixHeight: Number(kidText(node, 'MatrixHeight')),
    tileWidth: Number(kidText(node, 'TileWidth')),
    tileHeight: Number(kidText(node, 'TileHeight')),
    topLeft,
    scaleDenominatorRaw: Number(kidText(node, 'ScaleDenominator')),
  };
}

const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/**
 * Checks that a matrix list is the global geographic grid this module's math is valid for. Returns the list of
 * problems (empty = supported).
 */
export function geographicGridProblems(matrixes) {
  const p = [];
  if (!matrixes.length) return ['TileMatrixSet has no TileMatrix'];
  for (const m of matrixes) {
    const tag = `TileMatrix ${m.id}`;
    if (m.id == null || m.id === '') { p.push('TileMatrix without Identifier'); continue; }
    if (!m.topLeft || m.topLeft[0] !== -180 || m.topLeft[1] !== 90) p.push(`${tag}: TopLeftCorner is not "-180 90" (lon, lat order unproven)`);
    if (!(m.tileWidth > 0 && m.tileHeight > 0) || m.tileWidth !== m.tileHeight) p.push(`${tag}: non-square or invalid tile size`);
    else if (m.tileWidth !== TILE_SIZE_PX) p.push(`${tag}: tile size ${m.tileWidth} is not ${TILE_SIZE_PX} px (only ${TILE_SIZE_PX} px tiles are supported)`);
    if (!Number.isInteger(m.matrixWidth) || !Number.isInteger(m.matrixHeight) || m.matrixWidth < 1 || m.matrixHeight < 1) p.push(`${tag}: invalid MatrixWidth/MatrixHeight`);
    else if (m.matrixWidth !== 2 * m.matrixHeight) p.push(`${tag}: matrix is not 2:1 (square degree pixels over -180..180 x 90..-90 not guaranteed)`);
    else if (!isPow2(m.matrixHeight)) p.push(`${tag}: MatrixHeight is not a power of two`);
  }
  return deepFreeze(p);
}

/**
 * Checks the matrix list as a whole: ids must be unique non-negative decimal integers forming exactly 0..n-1 (any document
 * order). Returns the list of problems (empty = ok). Per-matrix geometry is geographicGridProblems' job.
 */
export function matrixSequenceProblems(matrixes) {
  const p = [], seen = new Set();
  for (const m of matrixes) {
    if (m.id == null || m.id === '') continue; // reported by geographicGridProblems
    if (!/^(0|[1-9]\d{0,3})$/.test(m.id)) { p.push(`TileMatrix id "${m.id}" is not a plain non-negative integer`); continue; }
    if (seen.has(m.id)) p.push(`duplicate TileMatrix id "${m.id}"`);
    seen.add(m.id);
  }
  const n = matrixes.length;
  for (let z = 0; z < n; z++) if (!seen.has(String(z))) { p.push(`TileMatrix ids are not the contiguous range 0..${n - 1} (missing ${z})`); break; }
  return deepFreeze(p);
}

/** The matrix with the highest numeric id (finest zoom), independent of document order; null if none/non-numeric. */
export function finestMatrix(matrixes) {
  let best = null;
  for (const m of matrixes) {
    const z = /^(0|[1-9]\d*)$/.test(m.id ?? '') ? Number(m.id) : null;
    if (z !== null && (best === null || z > best.z)) best = { z, m };
  }
  return best ? best.m : null;
}

const FORMAT_EXT = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/jpg': ['jpg', 'jpeg'], 'image/gif': ['gif'], 'image/webp': ['webp'], 'image/tiff': ['tif', 'tiff'] };

function buildEntry(layer, tmsLink, tmsById, tmsLinkCount, dupLayerIds) {
  const reasons = [], notes = [];
  const id = kidText(layer, 'Identifier');
  if (!id) reasons.push('Layer has no Identifier');
  const formats = kids(layer, 'Format').map(txt).filter(Boolean);
  const format = formats[0] ?? null;
  if (!format) reasons.push('Layer declares no Format');
  if (formats.length > 1) notes.push(`multiple formats declared: ${formats.join(', ')} (first used)`);
  const tmsId = tmsLink ? kidText(tmsLink, 'TileMatrixSet') : null;
  if (!tmsId) reasons.push('Layer has no TileMatrixSetLink');
  if (tmsLinkCount > 1) notes.push(`layer links ${tmsLinkCount} TileMatrixSets; one entry per link`);
  const defs = tmsId ? tmsById.get(tmsId) ?? [] : [];
  const tms = defs.length === 1 ? defs[0] : null;
  if (tmsId && !defs.length) reasons.push(`TileMatrixSet "${tmsId}" is not defined in Contents`);
  else if (defs.length > 1) reasons.push(`duplicate TileMatrixSet id "${tmsId}" (${defs.length} definitions; none is picked)`);
  if (id && dupLayerIds.has(id)) reasons.push(`duplicate Layer id "${id}"`);

  const crsUrn = tms ? kidText(tms, 'SupportedCRS') : null;
  if (tms && !crsUrn) reasons.push('TileMatrixSet has no SupportedCRS');
  else if (crsUrn && !KNOWN_GEOGRAPHIC_CRS.includes(crsUrn)) reasons.push(`Unknown CRS "${crsUrn}" (only Mars 2000 geographic EPSG:104905 is supported)`);
  else if (crsUrn && crsUrn.includes('IAU2000')) notes.push('CRS spelled with IAU2000 authority; same code 104905 as EPSG variant');

  const matrixes = tms ? kids(tms, 'TileMatrix').map(parseMatrix) : [];
  if (tms) reasons.push(...geographicGridProblems(matrixes), ...matrixSequenceProblems(matrixes));
  let axisOrderAssumption = 'unknown';
  if (matrixes.length && matrixes.every((m) => m.topLeft && m.topLeft[0] === -180 && m.topLeft[1] === 90)) {
    axisOrderAssumption = 'lon,lat (TopLeftCorner "-180 90"; same order as the document\'s BoundingBox corners)';
  }

  const rurls = kids(layer, 'ResourceURL').filter((r) => (r.attrs.resourceType ?? 'tile') === 'tile');
  const rurl = rurls.find((r) => !format || r.attrs.format === format) ?? rurls[0] ?? null;
  const resourceUrlTemplate = rurl?.attrs.template ?? null;
  const styleEl = kids(layer, 'Style').find((s) => s.attrs.isDefault === 'true') ?? kid(layer, 'Style');
  if (!resourceUrlTemplate) reasons.push('No RESTful tile ResourceURL (KVP-only layers unsupported)');
  else {
    const names = [...resourceUrlTemplate.matchAll(/\{([^{}]*)\}/g)].map((x) => x[1]);
    if (names.includes('Style') && !(styleEl && kidText(styleEl, 'Identifier'))) reasons.push('ResourceURL uses {Style} but the layer has no <Style> with an Identifier');
    if (rurl.attrs.format && format && rurl.attrs.format !== format) reasons.push(`ResourceURL format "${rurl.attrs.format}" differs from layer Format "${format}"`);
    const ext = /\.([A-Za-z0-9]+)$/.exec(resourceUrlTemplate.split(/[?#]/)[0])?.[1]?.toLowerCase();
    const want = format ? FORMAT_EXT[format.toLowerCase()] : null;
    if (ext && want && !want.includes(ext)) reasons.push(`Format "${format}" does not match ResourceURL extension ".${ext}"`);
    const unknown = names.filter((n) => !WMTS_PLACEHOLDERS.includes(n));
    if (unknown.length) reasons.push(`ResourceURL has unknown placeholder(s): ${[...new Set(unknown)].join(', ')}`);
    for (const need of ['TileMatrix', 'TileRow', 'TileCol']) if (!names.includes(need)) reasons.push(`ResourceURL lacks {${need}}`);
    if (!/^https?:\/\//i.test(resourceUrlTemplate)) reasons.push('ResourceURL is not http(s)');
  }

  // Bounding box in lon/lat: WGS84BoundingBox is the OGC lon,lat box; BoundingBox is used only for the known CRS.
  let bboxLonLat = null;
  const wgs = kid(layer, 'WGS84BoundingBox');
  const bb = kids(layer, 'BoundingBox').find((b) => KNOWN_GEOGRAPHIC_CRS.includes(b.attrs.crs));
  for (const box of [wgs, bb]) {
    if (bboxLonLat || !box) continue;
    const lo = numList(kidText(box, 'LowerCorner'), 2), up = numList(kidText(box, 'UpperCorner'), 2);
    if (lo && up && lo[0] <= up[0] && lo[1] <= up[1]) bboxLonLat = { west: lo[0], south: lo[1], east: up[0], north: up[1] };
  }
  if (!bboxLonLat) notes.push('no usable lon/lat bounding box in document');

  const abstract = kidText(layer, 'Abstract');
  const style = styleEl;
  const entry = {
    id, title: kidText(layer, 'Title') ?? id, ...(abstract ? { abstract } : {}),
    format, tileMatrixSetId: tmsId, crsUrn, axisOrderAssumption, styleId: style ? kidText(style, 'Identifier') : null,
    matrixes, resourceUrlTemplate, ...(bboxLonLat ? { bboxLonLat } : {}),
    status: reasons.length ? 'needs_review' : 'supported', reasons, notes,
  };
  return entry;
}

/**
 * Parses a WMTS 1.0.0 Capabilities document. Never throws: malformed input yields
 * {ok:false, error, layers:[]}. Layers come back as catalog entries (see buildEntry); anything unrecognised is
 * `needs_review` with human-readable `reasons`.
 */
export function parseWmtsCapabilities(xmlText) {
  const fail = (error) => deepFreeze({ ok: false, error, reasons: [error], serviceTitle: null, layers: [] });
  let root;
  try {
    root = parseXml(xmlText);
    if (root.name !== 'Capabilities') throw new Error(`Root element is <${root.qname}>, expected WMTS <Capabilities>`);
  } catch (e) {
    return fail(String(e.message ?? e));
  }
  const contents = kid(root, 'Contents');
  if (!contents) return fail('No <Contents> element');
  const tmsById = new Map(); // id -> [definitions]; more than one definition = ambiguous, never resolved by picking one
  for (const t of kids(contents, 'TileMatrixSet')) {
    const tid = kidText(t, 'Identifier');
    if (tid) tmsById.set(tid, [...(tmsById.get(tid) ?? []), t]); // Contents-level only (not the links inside Layer)
  }
  const layerEls = kids(contents, 'Layer');
  if (!layerEls.length) return fail('<Contents> has no <Layer>');
  const idCount = new Map();
  for (const layer of layerEls) { const lid = kidText(layer, 'Identifier'); if (lid) idCount.set(lid, (idCount.get(lid) ?? 0) + 1); }
  const dupLayerIds = new Set([...idCount].filter(([, c]) => c > 1).map(([k]) => k));
  const layers = [];
  for (const layer of layerEls) {
    const links = kids(layer, 'TileMatrixSetLink');
    if (!links.length) layers.push(buildEntry(layer, null, tmsById, 0, dupLayerIds));
    for (const link of links) layers.push(buildEntry(layer, link, tmsById, links.length, dupLayerIds));
  }
  const si = kid(root, 'ServiceIdentification');
  return deepFreeze({ ok: true, error: null, serviceTitle: si ? kidText(si, 'Title') : null, layers });
}

// ------------------------------------------------------------------ tile geometry

/**
 * Geometry of one TileMatrix. `zoomOrMatrix` is either a zoom integer (DEFAULT_SCHEME: 2^(z+1) x 2^z tiles of 256 px)
 * or a parsed matrix entry ({id, matrixWidth, matrixHeight, tileWidth, tileHeight, topLeft}); the latter is validated
 * as the global geographic grid and throws otherwise (fail closed).
 */
export function matrixGeometry(zoomOrMatrix, scheme = DEFAULT_SCHEME) {
  let zoom = null, mw, mh, tw, th;
  if (typeof zoomOrMatrix === 'number') {
    zoom = zoomOrMatrix;
    if (!Number.isInteger(zoom) || zoom < 0 || zoom > 30) throw new RangeError(`zoom must be an integer in 0..30, got ${zoomOrMatrix}`);
    if (!scheme || scheme.tileSize !== TILE_SIZE_PX || scheme.baseColumns !== 2 * scheme.baseRows || !isPow2(scheme.baseRows)) {
      throw new RangeError(`Unsupported tile scheme (only ${TILE_SIZE_PX} px tiles with a 2:1 power-of-two base grid)`);
    }
    mw = scheme.baseColumns * 2 ** zoom; mh = scheme.baseRows * 2 ** zoom; tw = th = scheme.tileSize;
  } else if (zoomOrMatrix && typeof zoomOrMatrix === 'object') {
    const problems = geographicGridProblems([zoomOrMatrix]);
    if (problems.length) throw new RangeError(`Unsupported tile matrix: ${problems.join('; ')}`);
    ({ matrixWidth: mw, matrixHeight: mh, tileWidth: tw, tileHeight: th } = zoomOrMatrix);
    const z = Number(zoomOrMatrix.id);
    zoom = Number.isInteger(z) ? z : null;
  } else throw new TypeError('zoom number or matrix object required');
  const degPerPx = 360 / (mw * tw);
  if (Math.abs(degPerPx - 180 / (mh * th)) > degPerPx * 1e-12) throw new RangeError('Non-square pixels in degrees');
  return deepFreeze({ zoom, matrixWidth: mw, matrixHeight: mh, tileWidth: tw, tileHeight: th, degPerPx, tileSpanLonDeg: degPerPx * tw, tileSpanLatDeg: degPerPx * th });
}

const MAX_ABS_LON_DEG = 1e6;
const snap = (v) => { const r = Math.round(v); return Math.abs(v - r) < PIXEL_EDGE_EPS ? r : v; };

/**
 * Longitude wrap policy: lon is taken modulo 360 into [-180, 180). +180 therefore equals -180 (westmost column) for
 * point lookups; bbox EAST edges are handled separately (see tileRangeForBBox) so that an east edge of exactly +180 still
 * reaches the last column. Latitude is clamped to [-90, 90]; lat -90 falls in the last row, +90 in row 0.
 */
export function normalizeLon(lonDeg) {
  if (!Number.isFinite(lonDeg)) throw new RangeError('longitude must be finite');
  if (Math.abs(lonDeg) > MAX_ABS_LON_DEG) throw new RangeError(`|longitude| must be <= ${MAX_ABS_LON_DEG} degrees (float precision of the modulo is gone beyond that)`);
  const w = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return w;
}
const clampLat = (latDeg) => {
  if (!Number.isFinite(latDeg)) throw new RangeError('latitude must be finite');
  return Math.min(90, Math.max(-90, latDeg));
};

/** Tile edges in degrees. Row 0 is the north row; col 0 the westmost. */
export function tileBoundsLonLat(zoomOrMatrix, row, col) {
  const g = matrixGeometry(zoomOrMatrix);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= g.matrixHeight || col >= g.matrixWidth) {
    throw new RangeError(`Tile (${row},${col}) outside matrix ${g.matrixWidth}x${g.matrixHeight}`);
  }
  return deepFreeze({
    west: -180 + col * g.tileSpanLonDeg, east: -180 + (col + 1) * g.tileSpanLonDeg,
    north: 90 - row * g.tileSpanLatDeg, south: 90 - (row + 1) * g.tileSpanLatDeg,
  });
}

/**
 * Continuous global pixel coordinates (PIXEL_IS_AREA: integer = pixel edge, pixel centre = index + 0.5) and the owning
 * tile with the in-tile continuous coordinate.
 */
export function lonLatToPixel(zoomOrMatrix, lonDeg, latDeg) {
  const g = matrixGeometry(zoomOrMatrix);
  const x = (normalizeLon(lonDeg) + 180) / g.degPerPx, y = (90 - clampLat(latDeg)) / g.degPerPx;
  const col = Math.min(g.matrixWidth - 1, Math.floor(x / g.tileWidth)), row = Math.min(g.matrixHeight - 1, Math.floor(y / g.tileHeight));
  return deepFreeze({
    convention: 'pixel-is-area', x, y, col, row,
    xInTile: x - col * g.tileWidth, yInTile: y - row * g.tileHeight,
  });
}

export function lonLatToTile(zoomOrMatrix, lonDeg, latDeg) {
  const p = lonLatToPixel(zoomOrMatrix, lonDeg, latDeg);
  return deepFreeze({ zoom: matrixGeometry(zoomOrMatrix).zoom, row: p.row, col: p.col });
}

/**
 * Tiles touched by a lon/lat bbox. If east < west (after the bbox is expressed in degrees), or west+width crosses +180,
 * the bbox crosses the antimeridian and two column ranges are returned. A width >= 360 covers every column.
 * Exact tile edges do not pull in the neighbouring tile (1e-6 px snap).
 */
export function tileRangeForBBox(zoomOrMatrix, bbox) {
  const g = matrixGeometry(zoomOrMatrix);
  const { west, south, east, north } = bbox ?? {};
  for (const v of [west, south, east, north]) if (!Number.isFinite(v)) throw new RangeError('bbox needs finite west/south/east/north');
  if (south > north) throw new RangeError('bbox south > north');
  const s = clampLat(south), n = clampLat(north);
  let width = east - west;
  if (width < 0) { // east < west -> antimeridian crossing; the wrapped width must be a real span in (0, 360]
    width += 360;
    if (!(width > 0 && width <= 360)) throw new RangeError(`bbox east < west wraps to an invalid width (${width} deg): west=${west}, east=${east}`);
  }
  const fullGlobe = width >= 360;
  const w0 = fullGlobe ? -180 : normalizeLon(west);
  const w1 = fullGlobe ? 180 : w0 + width;
  const colRange = (a, b) => {
    const x0 = snap((a + 180) / g.degPerPx), x1 = snap((b + 180) / g.degPerPx);
    const c0 = Math.min(g.matrixWidth - 1, Math.max(0, Math.floor(x0 / g.tileWidth)));
    const c1 = Math.min(g.matrixWidth - 1, Math.max(c0, Math.ceil(x1 / g.tileWidth) - 1));
    return [c0, c1];
  };
  const colRanges = w1 > 180 ? [colRange(w0, 180), colRange(-180, w1 - 360)] : [colRange(w0, w1)];
  const y0 = snap((90 - n) / g.degPerPx), y1 = snap((90 - s) / g.degPerPx);
  const rowMin = Math.min(g.matrixHeight - 1, Math.max(0, Math.floor(y0 / g.tileHeight)));
  const rowMax = Math.min(g.matrixHeight - 1, Math.max(rowMin, Math.ceil(y1 / g.tileHeight) - 1));
  const cols = colRanges.reduce((t, [a, b]) => t + (b - a + 1), 0);
  return deepFreeze({ zoom: g.zoom, rowMin, rowMax, colRanges, wrapsAntimeridian: colRanges.length > 1, tileCount: cols * (rowMax - rowMin + 1) });
}

// ------------------------------------------------------------------ resolution

/**
 * Ground sample distance of one pixel, from geometry only: degrees per pixel x metres per degree on a sphere of radiusM.
 * northSouthM (= projected plane pixel, the coarsest axis) and eastWestGroundM (shrinks with cos(lat)).
 */
export function groundSampleDistanceM(zoomOrMatrix, latDeg, radiusM = MARS_RADIUS_M) {
  const g = matrixGeometry(zoomOrMatrix);
  if (!(radiusM > 0)) throw new RangeError('radiusM must be > 0');
  const mPerDeg = radiusM * DEG, lat = clampLat(latDeg);
  return deepFreeze({
    zoom: g.zoom, degPerPx: g.degPerPx,
    northSouthM: g.degPerPx * mPerDeg,
    eastWestProjectedM: g.degPerPx * mPerDeg,
    eastWestGroundM: g.degPerPx * mPerDeg * Math.cos(lat * DEG),
  });
}

/**
 * Smallest zoom whose coarsest-axis pixel (northSouthM) is <= targetMPerPx, within [minZoom, maxZoom].
 * `satisfied:false` means even maxZoom is coarser than the target (never silently pretends otherwise).
 * Monotonic: a smaller target never yields a smaller zoom.
 */
export function chooseZoomForResolution(targetMPerPx, latDeg, { minZoom = 0, maxZoom = 30, radiusM = MARS_RADIUS_M } = {}) {
  if (!(targetMPerPx > 0) || !Number.isFinite(targetMPerPx)) throw new RangeError('targetMPerPx must be a positive number');
  if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom) || minZoom < 0 || maxZoom > 30 || minZoom > maxZoom) throw new RangeError('invalid zoom limits');
  let z = Math.ceil(Math.log2(groundSampleDistanceM(0, latDeg, radiusM).northSouthM / targetMPerPx));
  z = Math.min(maxZoom, Math.max(minZoom, z));
  while (z > minZoom && groundSampleDistanceM(z - 1, latDeg, radiusM).northSouthM <= targetMPerPx) z--; // guard float error in log2
  while (z < maxZoom && groundSampleDistanceM(z, latDeg, radiusM).northSouthM > targetMPerPx) z++;
  const gsd = groundSampleDistanceM(z, latDeg, radiusM);
  return deepFreeze({ zoom: z, gsdM: gsd.northSouthM, eastWestGroundM: gsd.eastWestGroundM, satisfied: gsd.northSouthM <= targetMPerPx });
}

// ------------------------------------------------------------------ URL

// Identifier values substituted into a URL path: one safe segment; never "." / ".." (dot-only), no / \ ? # % whitespace.
const IDENT = /^(?!\.+$)[A-Za-z0-9_.-]+$/;

/**
 * Substitutes a WMTS RESTful template. Throws on: non-http(s) template, unknown placeholders, missing mandatory
 * placeholders ({TileMatrix},{TileRow},{TileCol}), invalid row/col/tileMatrix, or (when opts.matrix is supplied) a tile
 * outside that matrix. {Style} and {TileMatrixSet} must be supplied when the template contains them.
 * Identifier values (tileMatrix, style, tileMatrixSet) must match IDENT (no dot-only segments, slashes, "%", "?", "#",
 * whitespace). Duplicate slashes in the path part only (e.g. "1.0.0//{Style}") are collapsed; scheme "://", query and
 * fragment are left untouched.
 */
export function buildTileUrl(template, { tileMatrix, row, col, style, tileMatrixSet, matrix } = {}) {
  if (typeof template !== 'string' || !/^https?:\/\//i.test(template)) throw new TypeError('template must be an http(s) URL template');
  const names = [...template.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  const unknown = names.filter((n) => !WMTS_PLACEHOLDERS.includes(n));
  if (unknown.length) throw new RangeError(`Unknown placeholder(s) in template: ${[...new Set(unknown)].join(', ')}`);
  for (const need of ['TileMatrix', 'TileRow', 'TileCol']) if (!names.includes(need)) throw new RangeError(`Template lacks {${need}}`);
  const tm = typeof tileMatrix === 'string' ? tileMatrix : String(tileMatrix);
  if (tileMatrix === undefined || tileMatrix === null || !IDENT.test(tm)) throw new RangeError(`Invalid tileMatrix ${String(tileMatrix)}`);
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col) || row < 0 || col < 0) throw new RangeError(`row/col must be non-negative integers (got ${row}, ${col})`);
  if (matrix) {
    const g = matrixGeometry(matrix);
    if (row >= g.matrixHeight || col >= g.matrixWidth) throw new RangeError(`Tile (${row},${col}) outside matrix ${g.matrixWidth}x${g.matrixHeight}`);
  }
  const values = { TileMatrix: tm, TileRow: String(row), TileCol: String(col), Style: style, TileMatrixSet: tileMatrixSet };
  for (const n of ['Style', 'TileMatrixSet']) {
    if (names.includes(n) && !(typeof values[n] === 'string' && IDENT.test(values[n]))) throw new RangeError(`Template needs a valid ${n} value`);
  }
  const url = template.replace(/\{([^{}]*)\}/g, (_, n) => values[n]);
  const i = url.indexOf('://') + 3;
  const rest = url.slice(i), cut = rest.search(/[?#]/), pathPart = cut < 0 ? rest : rest.slice(0, cut);
  return url.slice(0, i) + pathPart.replace(/\/{2,}/g, '/') + (cut < 0 ? '' : rest.slice(cut)); // query/fragment untouched
}
