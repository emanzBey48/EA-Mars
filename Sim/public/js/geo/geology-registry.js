// Stage 27 — multi-map geology registry. Pure module: no DOM, fetch, fs or module state.
//
// Combines several geology.js indexes (each one map: e.g. SIM 3464 Jezero 1:75,000, a future SIM 3292 global
// 1:20,000,000) and answers "which unit is at this point according to the MOST DETAILED map covering it".
// Nothing is invented: only the injected indexes are consulted; with no covering map the answer is
// `outside_coverage`. When maps give different unit codes the answer is flagged (`conflict`), never silently merged.
//
// This module does NOT ship any global map. A global map must be supplied by the caller as a geology.js index.

import { lookupGeologicUnit, toGeologySnapshot, LOOKUP_STATUS } from './geology.js';

export const GEOLOGY_REGISTRY_SCHEMA = 'marswalk.geology-registry.v1';
export const GEOLOGY_BEST_SCHEMA = 'marswalk.geology-best.v1';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}
// C5: the registry must never freeze or mutate a caller's index. geology.js indexes are already deep-frozen and are
// shared as is; an index that is not (hand-built / unfrozen) is copied first, then the COPY is frozen by the registry.
function ownedIndex(idx) {
  const frozen = Object.isFrozen(idx) && Object.isFrozen(idx.features) && Object.isFrozen(idx.coverageBbox)
    && Object.isFrozen(idx.counts) && Object.isFrozen(idx.provenance) && idx.features.every((f) => Object.isFrozen(f));
  return frozen ? idx : structuredClone(idx);
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const fmtScale = (d) => `1:${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/**
 * entries: [{ id, index, mapScaleDenominator?, positionalUncertaintyM:{min,max}, license, citation?,
 *             unitScheme?, extentLonLat? }]
 *  - index: geology.js index (schema marswalk.geology-index.v1). Coverage = index.coverageBbox [w,s,e,n].
 *  - mapScaleDenominator: required unless index.provenance.scaleDenominator exists; SMALLER = MORE DETAILED.
 *  - positionalUncertaintyM, license: required (use 'not_stated' when the source gives none; never invent).
 *  - citation: required unless index.provenance.citation exists.
 *  - unitScheme: optional label; two maps are only "comparable" when both name the same scheme.
 *  - extentLonLat: optional; if given it must equal index.coverageBbox (consistency check, never overrides).
 *  - allowRejectedGeometry: an index with counts.rejectedPolygons/rejectedRings > 0 is an incomplete map and is
 *    REJECTED by default; with `true` it is accepted and every lookup result carries a `warnings` entry.
 *  - Caller indexes are never mutated: unfrozen indexes are copied, geology.js (already frozen) ones are shared.
 * Invalid input throws TypeError (the registry is built once at start-up, not per query).
 */
export function createGeologyRegistry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new TypeError('createGeologyRegistry: boş olmayan giriş dizisi gerekli');
  const seen = new Set();
  const out = entries.map((e, i) => {
    const where = `entries[${i}]`;
    if (!e || typeof e !== 'object') throw new TypeError(`${where}: nesne olmalı`);
    if (!nonEmpty(e.id)) throw new TypeError(`${where}.id: boş olmayan metin gerekli`);
    if (seen.has(e.id)) throw new TypeError(`${where}.id: yinelenen kimlik ${e.id}`);
    seen.add(e.id);
    const idx = e.index;
    if (!idx || idx.schema !== 'marswalk.geology-index.v1') throw new TypeError(`${where}.index: geology.js indeksi gerekli`);
    const cov = idx.coverageBbox;
    if (!Array.isArray(cov) || cov.length !== 4 || !cov.every(isNum) || cov[0] > cov[2] || cov[1] > cov[3]) {
      throw new TypeError(`${where}.index: kapsam bbox'ı yok/geçersiz (boş harita)`);
    }
    if (e.extentLonLat !== undefined) {
      const x = e.extentLonLat;
      if (!Array.isArray(x) || x.length !== 4 || !x.every(isNum) || x.some((v, k) => Math.abs(v - cov[k]) > 1e-9)) {
        throw new TypeError(`${where}.extentLonLat indeksin coverageBbox değeriyle uyuşmuyor`);
      }
    }
    const denom = e.mapScaleDenominator ?? idx.provenance?.scaleDenominator;
    if (!isNum(denom) || !(denom > 0)) throw new TypeError(`${where}.mapScaleDenominator: pozitif sayı gerekli`);
    const u = e.positionalUncertaintyM;
    if (!u || !isNum(u.min) || !isNum(u.max) || u.min < 0 || u.max < u.min) throw new TypeError(`${where}.positionalUncertaintyM: {min,max} (0 <= min <= max) gerekli`);
    if (!nonEmpty(e.license)) throw new TypeError(`${where}.license: metin gerekli ('not_stated' yazılabilir; uydurma yok)`);
    const citation = e.citation ?? idx.provenance?.citation;
    if (!nonEmpty(citation)) throw new TypeError(`${where}.citation: metin gerekli`);
    if (e.unitScheme !== undefined && !nonEmpty(e.unitScheme)) throw new TypeError(`${where}.unitScheme: boş olmayan metin olmalı`);
    // C4: a map whose rings were rejected is incomplete; a lookup would silently fall through to a coarser map.
    const rejected = (idx.counts?.rejectedPolygons ?? 0) + (idx.counts?.rejectedRings ?? 0);
    const warnings = [];
    if (rejected > 0) {
      if (e.allowRejectedGeometry !== true) {
        throw new TypeError(`${where}.index: ${idx.counts.rejectedPolygons} poligon/${idx.counts.rejectedRings} halka reddedilmiş (eksik harita); allowRejectedGeometry:true ile uyarıyla kabul edilebilir`);
      }
      warnings.push(`${e.id}: ${idx.counts.rejectedPolygons} poligon / ${idx.counts.rejectedRings} halka reddedildi; harita eksik, boşluklarda daha kaba haritaya düşülebilir`);
    }
    return {
      id: e.id, index: ownedIndex(idx), extentLonLat: cov.slice(), mapScaleDenominator: denom, mapScale: fmtScale(denom),
      positionalUncertaintyM: { min: u.min, max: u.max }, license: e.license, citation,
      doi: idx.provenance?.doi ?? null, unitScheme: e.unitScheme ?? null, warnings,
    };
  });
  // Finest (smallest denominator) first; ties by id -> input order never matters.
  out.sort((a, b) => a.mapScaleDenominator - b.mapScaleDenominator || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return deepFreeze({ schema: GEOLOGY_REGISTRY_SCHEMA, entries: out, order: out.map((x) => x.id) });
}

function caveats(entry) {
  const u = entry.positionalUncertaintyM;
  const global = entry.mapScaleDenominator >= 1_000_000;
  return {
    tr: `Harita ölçeğinde (${entry.mapScale}) birim ataması indikatiftir; konum belirsizliği ~${u.min}–${u.max} m (kaynak beyanı), saha gerçeği değildir.` +
      `${global ? ' Küresel/bölgesel bağlam: yerel (insan adımı ölçeği) kullanım için uygun değildir.' : ''} Mineraloji, güvenlik veya geçilebilirlik iddiası yoktur.`,
    en: `Map-scale (${entry.mapScale}) unit assignment is indicative; positional uncertainty ~${u.min}-${u.max} m (as stated by the source); not field truth.` +
      `${global ? ' Global/regional context: not suitable for local (human-step-scale) use.' : ''} No mineralogy, safety or traversability claim.`,
  };
}

// toGeologySnapshot hard-codes SIM 3464 uncertainty/license/caveat text; re-label per source map here.
function snapshotFor(entry, lookup) {
  const base = toGeologySnapshot(lookup, entry.index);
  const c = caveats(entry);
  return deepFreeze({
    ...base,
    positionalUncertaintyM: { ...entry.positionalUncertaintyM },
    mapScale: entry.mapScale, citation: entry.citation, doi: entry.doi, license: entry.license,
    caveatTr: c.tr, caveatEn: c.en,
  });
}

// `reason`: geology.js outside reason ('outside_bbox' | 'no_polygon') or null. `relation`: 'finer' = a more detailed
// map that was queried but did not answer ('no_polygon': the point is inside its bbox but in no polygon, so the
// registry fell back to a coarser map); 'coarser' = a coarser map queried for comparison.
const chainItem = (entry, lookup, relation = 'coarser') => ({
  sourceMapId: entry.id, mapScale: entry.mapScale, mapScaleDenominator: entry.mapScaleDenominator, status: lookup.status,
  relation, reason: lookup.reason ?? null,
  unitCode: lookup.status === LOOKUP_STATUS.OK ? lookup.unit.code : null,
  unitName: lookup.status === LOOKUP_STATUS.OK ? lookup.unit.name : null,
  candidates: lookup.status === LOOKUP_STATUS.AMBIGUOUS ? lookup.candidates.map((c) => c.code) : [],
});

export const REGISTRY_OVERRIDDEN_SNAPSHOT_KEYS = Object.freeze([
  'positionalUncertaintyM', 'mapScale', 'citation', 'doi', 'license', 'caveatTr', 'caveatEn',
]);

const NO_CONFLICT = () => ({ flag: false, differs: false, comparable: false, equalScaleTie: false, codes: [], note: null });

/**
 * Most detailed covering map wins. `status`: ok | ambiguous | outside_coverage | invalid_input (geology.js statuses).
 * `fallbackChain` = every COARSER map that was also queried (relation 'coarser') plus any FINER map whose bbox
 * contains the point but whose polygons do not (relation 'finer', status outside_coverage, reason 'no_polygon').
 * `conflict.differs` = a coarser covering map names a different unit code; `conflict.comparable` = all compared maps
 * declare the same unitScheme; `conflict.flag` = differs AND comparable for at least one pair (differing codes between
 * undeclared/different schemes are expected and are NOT a contradiction). Equal-scale maps with different codes set
 * `conflict.equalScaleTie` and the note says the winner was chosen by id order. `warnings` lists registry-level map
 * warnings (entries accepted with allowRejectedGeometry). Never reads a map outside the registry; no global fallback.
 */
export function lookupBestGeologicUnit(registry, { lonDeg, latDeg } = {}) {
  if (!registry || registry.schema !== GEOLOGY_REGISTRY_SCHEMA) throw new TypeError('lookupBestGeologicUnit: geçerli kayıt (registry) gerekli');
  const results = registry.entries.map((entry) => ({ entry, lookup: lookupGeologicUnit(entry.index, { lonDeg, latDeg }) }));
  const warnings = registry.entries.flatMap((e) => e.warnings);
  if (results.some((r) => r.lookup.status === LOOKUP_STATUS.INVALID)) {
    return deepFreeze({
      schema: GEOLOGY_BEST_SCHEMA, status: LOOKUP_STATUS.INVALID, sourceMapId: null, mapScale: null, mapScaleDenominator: null,
      snapshot: toGeologySnapshot({ status: LOOKUP_STATUS.INVALID }, null), fallbackChain: [],
      conflict: NO_CONFLICT(), warnings, checkedMapIds: registry.order.slice(),
    });
  }
  const answered = (r) => r.lookup.status === LOOKUP_STATUS.OK || r.lookup.status === LOOKUP_STATUS.AMBIGUOUS;
  const bestIdx = results.findIndex(answered);
  if (bestIdx < 0) {
    return deepFreeze({
      schema: GEOLOGY_BEST_SCHEMA, status: LOOKUP_STATUS.OUTSIDE, sourceMapId: null, mapScale: null, mapScaleDenominator: null,
      snapshot: toGeologySnapshot({ status: LOOKUP_STATUS.OUTSIDE }, null),
      fallbackChain: results.map((r) => chainItem(r.entry, r.lookup)),
      conflict: NO_CONFLICT(), warnings, checkedMapIds: registry.order.slice(),
    });
  }
  const best = results[bestIdx];
  const coarser = results.slice(bestIdx + 1);
  // Finer maps that did not answer although the point lies inside their bbox ('no_polygon'): fallback happened inside
  // their extent, so they are listed (relation 'finer') instead of being silently skipped. Maps whose bbox does not
  // contain the point simply do not cover it and are not listed.
  const finerMissed = results.slice(0, bestIdx).filter((r) => r.lookup.reason === 'no_polygon');
  const codesOf = (r) => (r.lookup.status === LOOKUP_STATUS.OK ? [r.lookup.unit.code] : r.lookup.candidates.map((c) => c.code));
  const bestCodes = codesOf(best);
  const codes = [{ sourceMapId: best.entry.id, unitCodes: bestCodes }];
  let differs = false, flag = false, comparable = true, tie = false;
  const tieIds = [];
  for (const r of coarser) {
    if (!answered(r)) continue;
    const cc = codesOf(r);
    codes.push({ sourceMapId: r.entry.id, unitCodes: cc });
    const d = cc.length !== bestCodes.length || cc.some((c) => !bestCodes.includes(c));
    const comp = !!best.entry.unitScheme && best.entry.unitScheme === r.entry.unitScheme;
    if (d) differs = true;
    if (!comp) comparable = false;
    if (d && comp) flag = true; // a contradiction needs the SAME declared unit scheme
    if (r.entry.mapScaleDenominator === best.entry.mapScaleDenominator) { tieIds.push(r.entry.id); if (d) tie = true; }
  }
  let note = null;
  if (flag) note = 'Aynı birim şemasını kullanan haritalar farklı birim kodu veriyor; en ayrıntılı harita gösterildi, çelişki gizlenmedi.';
  else if (differs) note = 'Haritaların birim şemaları aynı olduğu bildirilmemiş; farklı kodlar farklı adlandırmadan veya ölçekten kaynaklanabilir, çelişki sayılmaz (flag=false). En ayrıntılı harita gösterildi.';
  if (tie) note = `${note ? `${note} ` : ''}Eşit ölçek (${best.entry.mapScale}): ${[best.entry.id, ...tieIds].join(', ')} farklı kod veriyor; eşit ölçek; kimlik sırasıyla seçildi (${best.entry.id}).`;
  return deepFreeze({
    schema: GEOLOGY_BEST_SCHEMA,
    status: best.lookup.status, sourceMapId: best.entry.id, mapScale: best.entry.mapScale, mapScaleDenominator: best.entry.mapScaleDenominator,
    snapshot: snapshotFor(best.entry, best.lookup),
    fallbackChain: [...finerMissed.map((r) => chainItem(r.entry, r.lookup, 'finer')), ...coarser.map((r) => chainItem(r.entry, r.lookup))],
    conflict: {
      flag, differs, comparable: codes.length > 1 ? comparable : true, equalScaleTie: tie,
      codes: differs || codes.length > 1 ? codes : [], note,
    },
    warnings,
    checkedMapIds: registry.order.slice(),
  });
}
