// Stage 26A: Mars Trek layer catalog CLI.
//   node scripts/trek-catalog.mjs <capabilities.xml | http(s) URL> [--json out.json] [--timeout ms]
//   node scripts/trek-catalog.mjs --list-known
//   node scripts/trek-catalog.mjs --service-search [DEM|Hillshade|Mosaic|...] [--json out.json]
//
// Reads WMTS GetCapabilities (local file or URL), prints a layer table and optionally writes the catalog JSON to the
// path given with --json (never anywhere implicit). Nothing is invented: every field is parsed from the document;
// unknown CRS / matrix geometry is reported as needs_review. No dependencies (global fetch, Node >= 18).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWmtsCapabilities, groundSampleDistanceM, finestMatrix, MARS_RADIUS_M } from '../public/js/geo/trek-tiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KNOWN_ORTHO_XML = path.join(HERE, '..', 'data', 'mars-trek', 'hirise_ortho_25cm_WMTSCapabilities.xml');
export const TREK_SEARCH_URL = 'https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems';
const USER_AGENT = 'marswalk-catalog';

export async function fetchText(url, { timeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: ac.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** One printable row per layer. Max-zoom GSD is computed from geometry only (never from ScaleDenominator). */
export function summariseLayer(l) {
  // finest = highest numeric matrix id, never "last in document order"
  const last = finestMatrix(l.matrixes);
  const ids = l.matrixes.map((m) => m.id);
  const numeric = ids.length > 0 && ids.every((x) => /^(0|[1-9]\d*)$/.test(x ?? ''));
  const first = numeric ? l.matrixes.reduce((a, m) => (Number(m.id) < Number(a.id) ? m : a)) : l.matrixes[0];
  let gsd = null;
  if (l.status === 'supported' && last) gsd = groundSampleDistanceM(last, 0).northSouthM;
  return {
    id: l.id, format: l.format, tileMatrixSet: l.tileMatrixSetId, crs: l.crsUrn,
    zooms: l.matrixes.length ? `${first.id}..${(last ?? l.matrixes[l.matrixes.length - 1]).id}` : '-', finestGsdM: gsd, status: l.status,
    reasons: l.reasons,
  };
}

export function formatTable(layers) {
  const rows = layers.map(summariseLayer);
  const head = ['id', 'fmt', 'tileMatrixSet', 'zooms', 'finest m/px', 'status'];
  const body = rows.map((r) => [r.id ?? '?', r.format ?? '?', r.tileMatrixSet ?? '?', r.zooms, r.finestGsdM == null ? '-' : r.finestGsdM.toFixed(4), r.status]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => String(b[i]).length)));
  const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
  const out = [line(head), line(w.map((n) => '-'.repeat(n))), ...body.map(line)];
  for (const r of rows) for (const why of r.reasons) out.push(`  needs_review: ${r.id}: ${why}`);
  return out.join('\n');
}

/** Compact projection of Trek layer-search "docs" (serviceTypes tell whether a raw 'raster' ImageServer exists). */
export function summariseServiceDocs(docs) {
  return docs.map((d) => ({
    productLabel: d.productLabel, title: d.title, productCat1: d.productCat1 ?? null, productCat2: d.productCat2 ?? null,
    instrument: d.instrument ?? null, coverage: d.coverage ?? null, bbox: d.bbox ?? null,
    projection: typeof d.projection === 'string' && d.projection.startsWith('urn:') ? d.projection : (d.trekProjection ?? null),
    serviceTypes: d.serviceTypes ?? [], uuid: d.item_UUID ?? null,
  }));
}

const samePath = (a, b) => {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const x = real(a), y = real(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

export function parseArgs(argv) {
  const o = { source: null, json: null, timeoutMs: 30000, listKnown: false, serviceSearch: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error('Usage: --json needs an output file path');
      o.json = v;
    }
    else if (a === '--timeout') o.timeoutMs = Number(argv[++i]);
    else if (a === '--list-known') o.listKnown = true;
    else if (a === '--service-search') o.serviceSearch = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '';
    else if (a.startsWith('--')) throw new Error(`Unknown argument ${a}`);
    else if (!o.source) o.source = a;
    else throw new Error(`Unexpected argument ${a}`);
  }
  if (!o.listKnown && o.serviceSearch === null && !o.source) throw new Error('Usage: trek-catalog.mjs <capabilities.xml|URL> [--json out] | --list-known | --service-search [productCat2]');
  if (!(o.timeoutMs > 0)) throw new Error('--timeout must be > 0');
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const inputPath = o.serviceSearch !== null ? null : (o.listKnown ? KNOWN_ORTHO_XML : o.source);
  if (o.json && inputPath && !/^https?:\/\//i.test(inputPath) && samePath(o.json, inputPath)) {
    throw new Error(`Refusing to overwrite the input file with --json (${o.json})`);
  }
  let result;
  if (o.serviceSearch !== null) {
    const q = new URLSearchParams({ start: '0', rows: '2000' });
    if (o.serviceSearch) { q.set('facetKeys', 'productCat2'); q.set('facetValues', o.serviceSearch); }
    const url = `${TREK_SEARCH_URL}?${q}`;
    const j = JSON.parse(await fetchText(url, { timeoutMs: o.timeoutMs }));
    const items = summariseServiceDocs(j.response.docs.filter((d) => d.itemType === 'product'));
    console.log(`source: ${url}\nproducts: ${items.length} (numFound ${j.response.numFound})`);
    if (Number(j.response.numFound) > j.response.docs.length) {
      console.warn(`WARNING: result is TRUNCATED: ${j.response.docs.length} of ${j.response.numFound} documents returned (rows limit); counts below cover only the returned rows.`);
    }
    for (const p of items) console.log(`${p.productCat2 ?? '-'}\t${p.productLabel}\t${p.bbox}\t[${p.serviceTypes.join('+')}]`);
    result = { source: url, products: items };
  } else {
    const src = o.listKnown ? KNOWN_ORTHO_XML : o.source;
    const xml = /^https?:\/\//i.test(src) ? await fetchText(src, { timeoutMs: o.timeoutMs }) : fs.readFileSync(src, 'utf8');
    const cat = parseWmtsCapabilities(xml);
    if (!cat.ok) { console.error(`PARSE FAIL (needs_review): ${cat.error}`); process.exitCode = 2; return; }
    console.log(`source: ${src}\nservice: ${cat.serviceTitle}\nR = ${MARS_RADIUS_M} m (Mars 2000 sphere); m/px from degrees per pixel, ScaleDenominator ignored`);
    console.log(formatTable(cat.layers));
    result = { source: src, ...cat };
  }
  if (o.json) { fs.writeFileSync(o.json, JSON.stringify(result, null, 2) + '\n'); console.log(`wrote ${o.json}`); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exitCode = 1; });
