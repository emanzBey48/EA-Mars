import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeologyIndex, toGeologySnapshot, GEOLOGY_SNAPSHOT_CONTRACT } from '../public/js/geo/geology.js';
import { createGeologyRegistry, lookupBestGeologicUnit, REGISTRY_OVERRIDDEN_SNAPSHOT_KEYS } from '../public/js/geo/geology-registry.js';
import { WAYPOINTS } from '../public/js/config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'usgs-sim3464-geology');
const corridor = JSON.parse(fs.readFileSync(path.join(dir, 'jezero_geounits_corridor.geojson'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const realIndex = createGeologyIndex(corridor, { source: manifest }); // SIM 3464, 1:75,000 (real data)

// SYNTHETIC test maps (NOT real geology; names say so). Box polygons in [lon, lat].
const box = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
function syntheticIndex(polys, scaleDenominator) {
  const fc = {
    type: 'FeatureCollection', name: 'SYNTHETIC_TEST_MAP',
    features: polys.map((p, i) => ({ type: 'Feature', properties: { OBJECTID: 900 + i, symbol: p.code, name: p.name }, geometry: { type: 'Polygon', coordinates: box(...p.box) } })),
  };
  return createGeologyIndex(fc, { source: { title: 'SYNTHETIC', citation: `SYNTHETIC test map, scale 1:${scaleDenominator}` } });
}
const synDiff = syntheticIndex([
  { code: 'SYN-A', name: 'Synthetic unit A', box: [77.0, 18.0, 78.0, 19.0] },
  { code: 'SYN-B', name: 'Synthetic unit B', box: [78.0, 18.0, 79.0, 19.0] },
], 20000000);
const synSame = syntheticIndex([{ code: 'Njf', name: 'Synthetic same code', box: [77.0, 18.0, 78.0, 19.0] }], 20000000);

const fine = { id: 'sim3464', index: realIndex, positionalUncertaintyM: { min: 100, max: 200 }, license: 'not_stated', unitScheme: 'usgs-sim' };
const coarse = { id: 'SYNTHETIC-global', index: synDiff, mapScaleDenominator: 20000000, positionalUncertaintyM: { min: 5000, max: 20000 }, license: 'not_stated', citation: 'SYNTHETIC test map (not real)' };

const WB1 = { lonDeg: WAYPOINTS[0].lonDeg, latDeg: WAYPOINTS[0].latDeg };
const inCoarseOnly = { lonDeg: 78.5, latDeg: 18.5 }; // outside the corridor bbox, inside synthetic box B
const nowhere = { lonDeg: 10, latDeg: -40 };

test('selects the finer map where both cover; reports the coarser answer and flags a code conflict', () => {
  const reg = createGeologyRegistry([coarse, fine]);
  assert.deepEqual([...reg.order], ['sim3464', 'SYNTHETIC-global']);
  const r = lookupBestGeologicUnit(reg, WB1);
  assert.equal(r.status, 'ok');
  assert.equal(r.sourceMapId, 'sim3464');
  assert.equal(r.mapScale, '1:75,000');
  assert.equal(r.snapshot.unitCode, 'Njf');
  assert.deepEqual({ ...r.snapshot.positionalUncertaintyM }, { min: 100, max: 200 });
  assert.equal(r.fallbackChain.length, 1);
  assert.equal(r.fallbackChain[0].sourceMapId, 'SYNTHETIC-global');
  assert.equal(r.fallbackChain[0].unitCode, 'SYN-A');
  assert.equal(r.conflict.differs, true);
  assert.equal(r.conflict.comparable, false); // schemes not declared the same
  assert.equal(r.conflict.flag, false); // C1: different/undeclared schemes never raise the flag
  assert.deepEqual(r.conflict.codes.map((c) => c.unitCodes[0]), ['Njf', 'SYN-A']);
  assert.match(r.conflict.note, /çelişki sayılmaz/);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.fallbackChain[0].relation, 'coarser');
});

test('C1: real SIM 3464 vs a differently named scheme never flags; same scheme does', () => {
  const other = createGeologyRegistry([fine, { ...coarse, unitScheme: 'other-scheme' }]);
  const c = lookupBestGeologicUnit(other, WB1).conflict;
  assert.deepEqual([c.flag, c.differs, c.comparable], [false, true, false]);
  const same = createGeologyRegistry([fine, { ...coarse, unitScheme: 'usgs-sim' }]);
  const s = lookupBestGeologicUnit(same, WB1).conflict;
  assert.deepEqual([s.flag, s.differs, s.comparable], [true, true, true]);
  assert.doesNotMatch(s.note, /çelişki sayılmaz/);
});

test('C1: Roubion waypoint is Njf on the real corridor index', () => {
  const roubion = WAYPOINTS.find((w) => w.id === 'sol164-roubion');
  const r = lookupBestGeologicUnit(createGeologyRegistry([fine]), { lonDeg: roubion.lonDeg, latDeg: roubion.latDeg });
  assert.equal(r.status, 'ok');
  assert.equal(r.snapshot.unitCode, 'Njf');
});

test('C2: equal-scale maps with different codes -> explicit tie note, id order, flag only if same scheme', () => {
  const mk = (id, code, scheme) => ({ id, index: syntheticIndex([{ code, name: code, box: [77.0, 18.0, 78.0, 19.0] }], 20000000), mapScaleDenominator: 20000000, positionalUncertaintyM: { min: 1, max: 2 }, license: 'not_stated', citation: 'SYNTHETIC', ...(scheme ? { unitScheme: scheme } : {}) });
  const p = { lonDeg: 77.5, latDeg: 18.5 };
  const r1 = lookupBestGeologicUnit(createGeologyRegistry([mk('b-map', 'SYN-Q'), mk('a-map', 'SYN-P')]), p);
  assert.equal(r1.sourceMapId, 'a-map');
  assert.equal(r1.snapshot.unitCode, 'SYN-P');
  assert.equal(r1.conflict.equalScaleTie, true);
  assert.equal(r1.conflict.flag, false); // schemes undeclared
  assert.match(r1.conflict.note, /eşit ölçek; kimlik sırasıyla seçildi/);
  assert.deepEqual(r1.conflict.codes.map((c) => c.unitCodes[0]), ['SYN-P', 'SYN-Q']);
  const r2 = lookupBestGeologicUnit(createGeologyRegistry([mk('b-map', 'SYN-Q', 's'), mk('a-map', 'SYN-P', 's')]), p);
  assert.equal(r2.conflict.flag, true);
  assert.equal(r2.conflict.equalScaleTie, true);
  const r3 = lookupBestGeologicUnit(createGeologyRegistry([mk('b-map', 'SYN-P'), mk('a-map', 'SYN-P')]), p);
  assert.equal(r3.conflict.equalScaleTie, false);
});

test('C4: rejected rings -> entry refused by default; opt-in surfaces warnings; fine-map gap is listed in fallbackChain', () => {
  const broken = createGeologyIndex({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { OBJECTID: 1, symbol: 'SYN-OK', name: 'ok' }, geometry: { type: 'Polygon', coordinates: box(77.0, 18.0, 77.4, 19.0) } },
      { type: 'Feature', properties: { OBJECTID: 3, symbol: 'SYN-OK2', name: 'ok2' }, geometry: { type: 'Polygon', coordinates: box(77.9, 18.0, 78.0, 19.0) } },
      { type: 'Feature', properties: { OBJECTID: 2, symbol: 'SYN-BAD', name: 'bad' }, geometry: { type: 'Polygon', coordinates: [[[77.6, 18], [78, 18], [78, 19], [77.6, 19]]] } }, // unclosed ring
    ],
  }, { source: { title: 'SYNTHETIC', citation: 'SYNTHETIC broken map, scale 1:1000000' } });
  assert.ok(broken.counts.rejectedRings > 0);
  const entry = { id: 'syn-broken', index: broken, positionalUncertaintyM: { min: 1, max: 2 }, license: 'not_stated' };
  assert.throws(() => createGeologyRegistry([entry, coarse]), /reddedilmiş/);
  const reg = createGeologyRegistry([{ ...entry, allowRejectedGeometry: true }, coarse]);
  const r = lookupBestGeologicUnit(reg, { lonDeg: 77.7, latDeg: 18.5 }); // inside broken bbox, polygon was dropped -> falls to coarse
  assert.equal(r.sourceMapId, 'SYNTHETIC-global');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /syn-broken/);
  const missed = r.fallbackChain.find((c) => c.sourceMapId === 'syn-broken');
  assert.deepEqual([missed.status, missed.relation, missed.reason], ['outside_coverage', 'finer', 'no_polygon']);
  // Point outside the fine map's bbox entirely: it is not listed.
  const far = lookupBestGeologicUnit(reg, { lonDeg: 78.5, latDeg: 18.5 });
  assert.ok(!far.fallbackChain.some((c) => c.sourceMapId === 'syn-broken'));
  // Healthy fine map with a gap between its polygons.
  const gap = syntheticIndex([
    { code: 'SYN-L', name: 'L', box: [77.0, 18.0, 77.4, 19.0] }, { code: 'SYN-R', name: 'R', box: [77.6, 18.0, 78.0, 19.0] },
  ], 1000000);
  const reg2 = createGeologyRegistry([{ id: 'syn-gap', index: gap, mapScaleDenominator: 1000000, positionalUncertaintyM: { min: 1, max: 2 }, license: 'not_stated', citation: 'SYNTHETIC' }, coarse]);
  const g = lookupBestGeologicUnit(reg2, { lonDeg: 77.5, latDeg: 18.5 });
  assert.equal(g.sourceMapId, 'SYNTHETIC-global');
  assert.equal(g.fallbackChain[0].sourceMapId, 'syn-gap');
  assert.equal(g.fallbackChain[0].status, 'outside_coverage');
  assert.deepEqual(g.warnings, []);
});

test('C5: registry does not freeze or mutate caller index objects', () => {
  const raw = JSON.parse(JSON.stringify(realIndex)); // unfrozen plain copy
  const before = JSON.stringify(raw);
  const reg = createGeologyRegistry([{ ...fine, id: 'raw', index: raw }]);
  assert.equal(Object.isFrozen(raw), false);
  assert.equal(Object.isFrozen(raw.features), false);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(lookupBestGeologicUnit(reg, WB1).snapshot.unitCode, 'Njf');
  raw.features.length = 0; // later caller mutation must not change the registry
  assert.equal(lookupBestGeologicUnit(reg, WB1).snapshot.unitCode, 'Njf');
  assert.ok(Object.isFrozen(reg.entries[0].index));
  // already-frozen geology.js indexes are shared, not copied
  assert.equal(createGeologyRegistry([fine]).entries[0].index, realIndex);
});

test('C3: registry overridden snapshot keys are pinned; other keys come from geology.js', () => {
  assert.deepEqual([...REGISTRY_OVERRIDDEN_SNAPSHOT_KEYS], ['positionalUncertaintyM', 'mapScale', 'citation', 'doi', 'license', 'caveatTr', 'caveatEn']);
  const reg = createGeologyRegistry([fine]);
  const r = lookupBestGeologicUnit(reg, WB1);
  assert.deepEqual(Object.keys(r.snapshot), [...GEOLOGY_SNAPSHOT_CONTRACT.keys]);
  const base = toGeologySnapshot({ status: 'ok', unit: { code: 'Njf', name: 'Jezero floor unit' }, onBoundary: false }, realIndex);
  for (const k of GEOLOGY_SNAPSHOT_CONTRACT.keys) {
    if (!REGISTRY_OVERRIDDEN_SNAPSHOT_KEYS.includes(k)) assert.deepEqual(r.snapshot[k], base[k], k);
  }
});

test('same declared unit scheme + different code = comparable conflict; same code = no conflict', () => {
  const regSameScheme = createGeologyRegistry([fine, { ...coarse, unitScheme: 'usgs-sim' }]);
  const c = lookupBestGeologicUnit(regSameScheme, WB1).conflict;
  assert.equal(c.flag, true); assert.equal(c.comparable, true); assert.equal(c.differs, true);
  const regAgree = createGeologyRegistry([fine, { ...coarse, index: synSame, unitScheme: 'usgs-sim' }]);
  const a = lookupBestGeologicUnit(regAgree, WB1);
  assert.equal(a.conflict.flag, false);
  assert.equal(a.conflict.note, null);
  assert.equal(a.snapshot.unitCode, 'Njf');
});

test('falls back to the coarser map where only it covers; metadata comes from the chosen map', () => {
  const reg = createGeologyRegistry([fine, coarse]);
  const r = lookupBestGeologicUnit(reg, inCoarseOnly);
  assert.equal(r.status, 'ok');
  assert.equal(r.sourceMapId, 'SYNTHETIC-global');
  assert.equal(r.mapScale, '1:20,000,000');
  assert.equal(r.snapshot.unitCode, 'SYN-B');
  assert.equal(r.snapshot.mapScale, '1:20,000,000');
  assert.deepEqual({ ...r.snapshot.positionalUncertaintyM }, { min: 5000, max: 20000 });
  assert.equal(r.snapshot.citation, 'SYNTHETIC test map (not real)');
  assert.match(r.snapshot.caveatTr, /1:20,000,000/);
  assert.match(r.snapshot.caveatTr, /uygun değildir/); // global-context caveat
  assert.doesNotMatch(r.snapshot.caveatTr, /1:75\.000/); // no SIM 3464 text leaking
  assert.equal(r.fallbackChain.length, 0);
  assert.equal(r.conflict.flag, false);
});

test('outside all maps -> outside_coverage, no unit, no invented fallback', () => {
  const reg = createGeologyRegistry([fine, coarse]);
  const r = lookupBestGeologicUnit(reg, nowhere);
  assert.equal(r.status, 'outside_coverage');
  assert.equal(r.sourceMapId, null);
  assert.equal(r.snapshot.unitCode, null);
  assert.equal(r.snapshot.status, 'outside_coverage');
  assert.equal(r.fallbackChain.length, 2);
  assert.ok(r.fallbackChain.every((c) => c.status === 'outside_coverage' && c.unitCode === null));
  const only = createGeologyRegistry([fine]);
  assert.equal(lookupBestGeologicUnit(only, inCoarseOnly).status, 'outside_coverage');
  assert.equal(lookupBestGeologicUnit(only, { lonDeg: NaN, latDeg: 1 }).status, 'invalid_input');
});

test('ambiguity in the best map is reported, not resolved by a coarser map', () => {
  const amb = syntheticIndex([
    { code: 'SYN-X', name: 'X', box: [77.0, 18.0, 77.5, 19.0] },
    { code: 'SYN-Y', name: 'Y', box: [77.5, 18.0, 78.0, 19.0] },
  ], 1000000);
  const reg = createGeologyRegistry([{ id: 'syn-amb', index: amb, mapScaleDenominator: 1000000, positionalUncertaintyM: { min: 1, max: 2 }, license: 'not_stated', citation: 'SYNTHETIC' }, coarse]);
  const r = lookupBestGeologicUnit(reg, { lonDeg: 77.5, latDeg: 18.5 }); // exactly on the shared edge
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.sourceMapId, 'syn-amb');
  assert.equal(r.snapshot.unitCode, null);
  assert.deepEqual(r.snapshot.candidates.map((c) => c.unitCode).sort(), ['SYN-X', 'SYN-Y']);
});

test('deterministic, order independent and deep-frozen', () => {
  const a = createGeologyRegistry([fine, coarse]), b = createGeologyRegistry([coarse, fine]);
  for (const p of [WB1, inCoarseOnly, nowhere]) {
    assert.deepEqual(lookupBestGeologicUnit(a, p), lookupBestGeologicUnit(b, p));
    assert.deepEqual(lookupBestGeologicUnit(a, p), lookupBestGeologicUnit(a, p));
  }
  const r = lookupBestGeologicUnit(a, WB1);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.snapshot) && Object.isFrozen(r.fallbackChain) && Object.isFrozen(r.conflict.codes));
  assert.throws(() => { r.status = 'x'; }, TypeError);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.entries[0]));
});

test('invalid entries are rejected', () => {
  const bad = (patch, re) => assert.throws(() => createGeologyRegistry([{ ...fine, ...patch }]), re);
  assert.throws(() => createGeologyRegistry([]), TypeError);
  assert.throws(() => createGeologyRegistry('x'), TypeError);
  assert.throws(() => createGeologyRegistry([null]), /nesne/);
  bad({ id: '' }, /id/);
  bad({ index: {} }, /index/);
  bad({ index: null }, /index/);
  bad({ license: undefined }, /license/);
  bad({ positionalUncertaintyM: { min: 5, max: 1 } }, /positionalUncertaintyM/);
  bad({ positionalUncertaintyM: undefined }, /positionalUncertaintyM/);
  bad({ mapScaleDenominator: -1 }, /mapScaleDenominator/);
  bad({ extentLonLat: [0, 0, 1, 1] }, /extentLonLat/);
  bad({ citation: '' }, /citation/);
  assert.throws(() => createGeologyRegistry([fine, { ...fine }]), /yinelenen/);
  // index without scale information and no explicit denominator
  const noScale = createGeologyIndex({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { symbol: 'Q', name: 'q' }, geometry: { type: 'Polygon', coordinates: box(0, 0, 1, 1) } }] }, { source: { citation: 'SYNTHETIC without scale' } });
  assert.throws(() => createGeologyRegistry([{ ...coarse, index: noScale, mapScaleDenominator: undefined }]), /mapScaleDenominator/);
  // empty map (no coverage)
  const empty = createGeologyIndex({ type: 'FeatureCollection', features: [] });
  assert.throws(() => createGeologyRegistry([{ ...coarse, index: empty }]), /kapsam/);
  assert.throws(() => lookupBestGeologicUnit({}, WB1), TypeError);
  // matching extentLonLat is accepted
  assert.doesNotThrow(() => createGeologyRegistry([{ ...fine, extentLonLat: [...realIndex.coverageBbox] }]));
});
