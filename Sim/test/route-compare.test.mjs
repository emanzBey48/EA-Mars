import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemWindow, cellToLocal, buildFieldForWindow, planWalkingRoute,
} from '../public/js/route/route-service.js';
import { DEFAULT_COST_PARAMS } from '../public/js/route/cost-model.js';
import {
  planRouteVariants, describeRoutePreference, ROUTE_PREFERENCES, ROUTE_PREFERENCE_IDS,
  ROUTE_COMPARE_DISCLAIMER_TR, REFERENCE_PREFERENCE_ID,
} from '../public/js/route/route-compare.js';
import { SCENARIO } from '../public/js/config.js';

const ND = -9999;
const FORBIDDEN_TR = /güvenli(?!k)|güvensiz|tehlike/i;
const BASE = -2500;

function makeWin(rows, cols, fn, o = {}) {
  const elevation = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = fn(r, c);
  return createDemWindow({ elevation, rows, cols, cellSizeM: 1, nwXM: -50, nwYM: 40, noDataValue: ND, ...o });
}
const at = (win, r, c) => cellToLocal(win, r, c);
const pathCells = (res) => res.path.map((p) => [p.row, p.col]);
const fakeClock = () => { let t = 0; return () => t++; };

// Yaklaşık 12° eğimli Gauss tepe (sigma 10, H 3.8): düz yol tepeden geçer; "en düşük eğim" çevreden dolanır.
const HILL = (r, c) => BASE + 3.8 * Math.exp(-(((r - 40) ** 2) + ((c - 40) ** 2)) / 200);
function hillWin() { return makeWin(80, 80, HILL); }
const HILL_START = (w) => at(w, 40, 10), HILL_END = (w) => at(w, 40, 70);

test('ROUTE_PREFERENCES: sabit sıra, derin dondurulmuş, senaryo etiketli, sert kısıt aynı', () => {
  assert.deepEqual(ROUTE_PREFERENCE_IDS, ['shortest', 'balanced', 'gentle']);
  assert.equal(REFERENCE_PREFERENCE_ID, 'balanced');
  assert.ok(Object.isFrozen(ROUTE_PREFERENCES) && Object.isFrozen(ROUTE_PREFERENCES.gentle.costParams.costK));
  const maxSlopes = ROUTE_PREFERENCE_IDS.map((id) => ROUTE_PREFERENCES[id].costParams.maxSlopeDeg.value);
  assert.deepEqual(new Set(maxSlopes), new Set([DEFAULT_COST_PARAMS.maxSlopeDeg.value]));
  for (const id of ROUTE_PREFERENCE_IDS) {
    const p = ROUTE_PREFERENCES[id];
    assert.equal(p.status, 'scenario');
    assert.match(p.note, /NASA eşiği değildir; senaryo ağırlığıdır/);
    for (const leaf of Object.values(p.costParams)) {
      assert.equal(leaf.status, 'scenario');
      assert.ok(typeof leaf.source === 'string' && leaf.source.length > 0);
      assert.ok(Number.isFinite(leaf.value));
    }
  }
  // Dengeli = mevcut varsayılan (23C referansı).
  const b = ROUTE_PREFERENCES.balanced.costParams;
  for (const k of ['maxSlopeDeg', 'comfortableSlopeDeg', 'roughnessRefM', 'costK', 'costP']) {
    assert.equal(b[k].value, DEFAULT_COST_PARAMS[k].value, k);
  }
  // Yumuşak ağırlıklar ön ayarlar arasında gerçekten farklı.
  assert.notEqual(ROUTE_PREFERENCES.shortest.costParams.costK.value, ROUTE_PREFERENCES.gentle.costParams.costK.value);
  // Her ön ayar cost-model'de geçerli (aralık ve konfor < maks).
  const win = makeWin(10, 10, () => BASE);
  for (const id of ROUTE_PREFERENCE_IDS) {
    const params = Object.fromEntries(Object.entries(ROUTE_PREFERENCES[id].costParams).map(([k, v]) => [k, v.value]));
    assert.doesNotThrow(() => buildFieldForWindow(win, params), id);
  }
});

test('dik/engebeli yüzey: gentle, shortest den uzun veya eşit ve maks eğimi küçük veya eşit (monoton beklenti)', () => {
  const win = hillWin();
  const out = planRouteVariants({ window: win, startLocal: HILL_START(win), endLocal: HILL_END(win) });
  assert.equal(out.status, 'ok', out.reason);
  const s = out.results.shortest.summary, g = out.results.gentle.summary;
  assert.ok(g.lengthM >= s.lengthM, `gentle ${g.lengthM} < shortest ${s.lengthM}`);
  assert.ok(g.maxSlopeDeg <= s.maxSlopeDeg, `gentle maks ${g.maxSlopeDeg} > shortest ${s.maxSlopeDeg}`);
  // Gerçek fark var: gentle tepeden dolanır.
  assert.ok(g.lengthM > s.lengthM + 5);
  assert.ok(g.maxSlopeDeg < s.maxSlopeDeg - 3);
  const cmp = out.comparison.items.gentle;
  assert.equal(cmp.identicalPath, false);
  assert.ok(cmp.deltaLengthM > 0 && cmp.deltaLengthPct > 0 && cmp.deltaMaxSlopeDeg < 0);
  assert.ok(cmp.lateralDeviation.maxM > 0 && cmp.lateralDeviation.meanM > 0);
  assert.ok(cmp.lateralDeviation.meanM <= cmp.lateralDeviation.maxM);
  // Fark tanımları: yüzde = Δ / referans uzunluğu.
  const ref = out.results.balanced.summary;
  assert.ok(Math.abs(cmp.deltaLengthPct - (100 * (g.lengthM - ref.lengthM)) / ref.lengthM) < 1e-9);
  assert.ok(Math.abs(cmp.deltaLengthM - (g.lengthM - ref.lengthM)) < 1e-9);
});

test('düz zemin: üç tercih aynı yol, identicalPath true, tüm Δ = 0', () => {
  const win = makeWin(30, 40, () => BASE);
  const out = planRouteVariants({ window: win, startLocal: at(win, 5, 5), endLocal: at(win, 5, 30) });
  assert.equal(out.status, 'ok');
  const cells = ROUTE_PREFERENCE_IDS.map((id) => JSON.stringify(pathCells(out.results[id])));
  assert.equal(new Set(cells).size, 1);
  for (const id of ['shortest', 'gentle']) {
    const c = out.comparison.items[id];
    assert.equal(c.identicalPath, true);
    assert.equal(c.identicalNote.includes('fark yokluğu normal'), true);
    assert.equal(c.deltaLengthM, 0);
    assert.equal(c.deltaLengthPct, 0);
    assert.equal(c.deltaMaxSlopeDeg, 0);
    assert.equal(c.deltaMinScore, 0);
    assert.deepEqual(c.lateralDeviation, { direction: 'candidate_to_reference', meanM: 0, maxM: 0 });
  }
  // Özet: uzunluk stats'ten; süre planner'ın senaryo hızından (25 m / 1,2 m/s = config.js SCENARIO.walkSpeedMps).
  // Eski beklenti 0,8 m/s idi; süre tahmini artık simülasyon yürüme hızını kullanır.
  assert.ok(Math.abs(out.results.balanced.summary.lengthM - 25) < 1e-9);
  assert.ok(Math.abs(out.results.balanced.summary.estimatedDurationS - 25 / SCENARIO.walkSpeedMps) < 1e-9);
  assert.equal(out.results.gentle.summary.minScore, 100);
  assert.match(out.results.gentle.summary.scoreSource, /kendi ağırlıklarıyla/);
});

test('sert kısıt: 22° duvar üç tercihte de aynı sonuç (gevşetme yok)', () => {
  // Tüm satırlarda 22° (tan = 0,404) yükselip alçalan kesit: her satırda dik hücreler yol kesiyor.
  const win = makeWin(20, 60, (r, c) => {
    if (c < 30) return BASE;
    if (c <= 34) return BASE + 0.404 * (c - 29);
    if (c <= 39) return BASE + 0.404 * (5 - (c - 34));
    return BASE;
  });
  const out = planRouteVariants({ window: win, startLocal: at(win, 10, 5), endLocal: at(win, 10, 55) });
  const statuses = ROUTE_PREFERENCE_IDS.map((id) => out.results[id].status);
  assert.deepEqual(statuses, ['no_path', 'no_path', 'no_path'], `durumlar: ${statuses}`);
  const reasons = ROUTE_PREFERENCE_IDS.map((id) => out.results[id].reason);
  assert.equal(new Set(reasons).size, 1);
  assert.equal(out.status, 'failed');
  assert.equal(out.reason, reasons[0]);
});

test('no-data adası: tüm tercihler adayı dolaşır, hiçbir yol no-data (veya komşu kenar) hücresine girmez', () => {
  const win = makeWin(60, 80, (r, c) => (r >= 25 && r <= 35 && c >= 35 && c <= 45 ? ND : BASE));
  const out = planRouteVariants({ window: win, startLocal: at(win, 30, 10), endLocal: at(win, 30, 70) });
  assert.equal(out.status, 'ok', out.reason);
  for (const id of ROUTE_PREFERENCE_IDS) {
    const r = out.results[id];
    assert.equal(r.status, 'ok');
    assert.equal(r.stats.impassableCrossings, 0, id);
    for (const p of r.path) {
      const inIsland = p.row >= 24 && p.row <= 36 && p.col >= 34 && p.col <= 46; // ada + 1 hücre fail-closed kenar
      assert.equal(inIsland, false, `${id} yolu ada yakınında (${p.row},${p.col})`);
    }
  }
  // Ada etrafındaki dolambaç: tüm tercihler aynı ada yönünü kullanır ama yol uzunluğu düz hattan uzun.
  assert.ok(out.results.balanced.summary.lengthM > 60);
});

test('başlangıç geçilemez: her tercih aynı açık nedeni alır (planner nedeni AYNEN)', () => {
  const win = makeWin(60, 80, (r, c) => (r >= 25 && r <= 35 && c >= 35 && c <= 45 ? ND : BASE));
  const start = at(win, 30, 40), end = at(win, 30, 70);
  const direct = planWalkingRoute({ window: win, startLocal: start, endLocal: end });
  assert.equal(direct.status, 'start_blocked');
  const out = planRouteVariants({ window: win, startLocal: start, endLocal: end });
  for (const id of ROUTE_PREFERENCE_IDS) {
    assert.equal(out.results[id].status, 'start_blocked');
    assert.equal(out.results[id].reason, direct.reason);
    assert.equal(out.results[id].path.length, 0);
    assert.equal(out.results[id].summary, null);
  }
  assert.equal(out.status, 'failed');
  assert.equal(out.reason, direct.reason);
  assert.equal(out.comparison.available, false);
});

test('bütçe: gerçek planner ile çok düşük maxExpansions tüm tercihlerde budget_exceeded', () => {
  const win = hillWin();
  const budget = { maxExpansions: 1 };
  const out = planRouteVariants({ window: win, startLocal: HILL_START(win), endLocal: HILL_END(win), budget });
  for (const id of ROUTE_PREFERENCE_IDS) assert.equal(out.results[id].status, 'budget_exceeded');
  assert.equal(out.status, 'failed');
  assert.match(out.reason, /genişletme bütçesi/);
});

test('bütçe: aynı bütçe her çağrıya iletilir; yalnız bir tercih aşılırsa diğerleri başarılı kalır', () => {
  const win = hillWin();
  const budget = { maxExpansions: 100000 };
  const seen = [];
  const gentleK = ROUTE_PREFERENCES.gentle.costParams.costK.value;
  const planner = (args) => {
    seen.push(args.budget);
    if (args.params.costK === gentleK) return planWalkingRoute({ ...args, budget: { maxExpansions: 1 } });
    return planWalkingRoute(args);
  };
  const out = planRouteVariants({ window: win, startLocal: HILL_START(win), endLocal: HILL_END(win), budget, planner });
  assert.equal(seen.length, 3);
  assert.ok(seen.every((b) => b === budget));
  assert.equal(out.results.gentle.status, 'budget_exceeded');
  assert.equal(out.results.shortest.status, 'ok');
  assert.equal(out.results.balanced.status, 'ok');
  assert.equal(out.status, 'partial');
  assert.match(out.reason, /En düşük eğim: /);
  const c = out.comparison.items.gentle;
  assert.equal(c.available, false);
  assert.match(c.reason, /başarısız/);
});

test('preferences alt kümesi: sabit sıra; dengeli yoksa karşılaştırma açık nedenle kullanılamaz', () => {
  const win = hillWin();
  const out = planRouteVariants({ window: win, startLocal: HILL_START(win), endLocal: HILL_END(win), preferences: ['gentle', 'shortest'] });
  assert.deepEqual(Object.keys(out.results), ['shortest', 'gentle']);
  assert.deepEqual(out.meta.requested, ['shortest', 'gentle']);
  assert.equal(out.comparison.available, false);
  assert.match(out.comparison.reason, /referans/);
  const onlyRef = planRouteVariants({ window: win, startLocal: HILL_START(win), endLocal: HILL_END(win), preferences: ['balanced'] });
  assert.deepEqual(Object.keys(onlyRef.results), ['balanced']);
  assert.equal(onlyRef.comparison.available, true);
  assert.deepEqual(onlyRef.comparison.items, {});
});

test('geçersiz tercih listesi ve argüman: yapısal invalid_input, istisna yok', () => {
  const win = makeWin(10, 10, () => BASE);
  const args = { window: win, startLocal: at(win, 2, 2), endLocal: at(win, 2, 7) };
  for (const preferences of [['x'], [], ['shortest', 'shortest'], 'gentle']) {
    const out = planRouteVariants({ ...args, preferences });
    assert.equal(out.status, 'invalid_input', JSON.stringify(preferences));
    assert.ok(out.reason);
  }
  assert.equal(planRouteVariants(undefined).status, 'invalid_input');
  assert.equal(planRouteVariants({ ...args, now: 5 }).status, 'invalid_input');
});

test('deterministik: aynı girdi, sabit saatle, birebir aynı çıktı; çıktı derin dondurulmuş', () => {
  const win = hillWin();
  const input = { window: win, startLocal: HILL_START(win), endLocal: HILL_END(win), now: fakeClock() };
  const a = planRouteVariants({ ...input, now: fakeClock() });
  const b = planRouteVariants({ ...input, now: fakeClock() });
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.results) && Object.isFrozen(a.results.gentle.path));
  assert.ok(Object.isFrozen(a.comparison.items.gentle.lateralDeviation));
  assert.ok(Object.isFrozen(a.meta.perPreferenceMs));
  assert.equal(a.results.shortest.timing, undefined);
  assert.throws(() => { a.status = 'x'; }, TypeError);
});

test('meta: çağrı sayısı, tercih başına süre (sabit saat) ve toplam süre ölçülür', () => {
  const win = makeWin(10, 10, () => BASE);
  const out = planRouteVariants({ window: win, startLocal: at(win, 2, 2), endLocal: at(win, 2, 7), now: fakeClock() });
  assert.equal(out.meta.plannerCalls, 3);
  assert.deepEqual(Object.keys(out.meta.perPreferenceMs), ['shortest', 'balanced', 'gentle']);
  for (const id of ROUTE_PREFERENCE_IDS) assert.equal(out.meta.perPreferenceMs[id], 1);
  assert.ok(out.meta.totalMs > 0);
  assert.equal(out.meta.caveatTR, ROUTE_COMPARE_DISCLAIMER_TR);
});

test('bölgesel çözünürlük (5 m): puan ve EVA süresi üretilmez, yol yine de planlanır', () => {
  const win = makeWin(20, 20, () => BASE, { cellSizeM: 5 });
  const out = planRouteVariants({ window: win, startLocal: at(win, 2, 2), endLocal: at(win, 2, 15) });
  assert.equal(out.status, 'ok', out.reason);
  for (const id of ROUTE_PREFERENCE_IDS) {
    assert.equal(out.results[id].mode, 'regional_preplan');
    assert.equal(out.results[id].summary.minScore, null);
    assert.equal(out.results[id].summary.meanScore, null);
    assert.equal(out.results[id].summary.estimatedDurationS, null);
    assert.match(out.results[id].summary.scoreSource, /üretilmez/);
  }
  assert.equal(out.comparison.items.gentle.deltaMinScore, null);
});

test('puan yedeği: planner stats puanı vermezse yol hücrelerinden türetilir ve kaynağı yazılır', () => {
  const win = makeWin(30, 40, () => BASE);
  const stripped = (args) => {
    const r = planWalkingRoute(args);
    const stats = { ...r.stats }; delete stats.minScore; delete stats.meanScore;
    return { ...r, stats };
  };
  const out = planRouteVariants({ window: win, startLocal: at(win, 5, 5), endLocal: at(win, 5, 30), planner: stripped });
  assert.equal(out.results.balanced.summary.minScore, 100);
  assert.equal(out.results.balanced.summary.meanScore, 100);
  assert.match(out.results.balanced.summary.scoreSource, /hücre puanları/);
});

test('özet: en zor segment ve yol-yol sapması; tercihler arası toplam maliyet karşılaştırılmaz', () => {
  const win = hillWin();
  const out = planRouteVariants({ window: win, startLocal: HILL_START(win), endLocal: HILL_END(win) });
  const s = out.results.shortest.summary;
  assert.equal(s.costComparable, false);
  assert.ok(s.hardestSegment && Number.isInteger(s.hardestSegment.index));
  assert.ok(s.hardestSegment.costPerM >= 1);
  assert.equal(s.lengthM, out.results.shortest.stats.lengthM);
  assert.equal(s.totalCost, out.results.shortest.stats.totalCost);
  assert.equal(s.costMetric, out.results.shortest.stats.costMetric);
});

test('başlangıç = bitiş: sıfır uzunluk, aynı yol, oran alanları null', () => {
  const win = makeWin(10, 10, () => BASE);
  const p = at(win, 4, 4);
  const out = planRouteVariants({ window: win, startLocal: p, endLocal: p });
  assert.equal(out.status, 'ok', out.reason);
  const c = out.comparison.items.gentle;
  assert.equal(c.identicalPath, true);
  assert.equal(c.deltaLengthM, 0);
  assert.equal(c.deltaLengthPct, null);
});

test('describeRoutePreference: ad, açıklama, senaryo notu ve feragat; yasaklı kelime yalnız feragatte', () => {
  for (const id of ROUTE_PREFERENCE_IDS) {
    const d = describeRoutePreference(id);
    assert.equal(d.id, id);
    assert.ok(d.label && d.description && d.note);
    assert.equal(d.disclaimerTR, 'Planlama göstergesi — güvenli rota sertifikası değildir; ağırlıklar senaryo parametresidir.');
    assert.ok(d.text.includes(ROUTE_COMPARE_DISCLAIMER_TR));
    const rest = d.text.replace(ROUTE_COMPARE_DISCLAIMER_TR, '');
    assert.equal(FORBIDDEN_TR.test(rest), false, `${id}: ${rest}`);
    assert.ok(Object.isFrozen(d));
  }
  assert.throws(() => describeRoutePreference('nope'), (e) => e instanceof TypeError && /Bilinmeyen rota tercihi/.test(e.message));
  assert.throws(() => describeRoutePreference(undefined), TypeError);
});

test('girdi nesneleri değiştirilmez (budget donmaz, preferences dizisi kopyalanır)', () => {
  const win = makeWin(10, 10, () => BASE);
  const budget = { maxExpansions: 100000 };
  const prefs = ['gentle', 'shortest'];
  planRouteVariants({ window: win, startLocal: at(win, 2, 2), endLocal: at(win, 2, 7), budget, preferences: prefs });
  assert.equal(Object.isFrozen(budget), false);
  assert.deepEqual(prefs, ['gentle', 'shortest']);
});
