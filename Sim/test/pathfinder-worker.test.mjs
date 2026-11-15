import test from 'node:test';
import assert from 'node:assert/strict';
import { attachWorker } from '../public/js/route/pathfinder.worker.js';
import {
  createDemWindow, cellToLocal, buildFieldForWindow, planWalkingRoute,
} from '../public/js/route/route-service.js';
import { planRouteVariants, ROUTE_PREFERENCE_IDS } from '../public/js/route/route-compare.js';
import { SCENARIO } from '../public/js/config.js';

const ND = -9999;
const BASE = -2500;

// Ham init-window girdisi (main.js ile aynı biçim; params yok).
function rawWin(rows, cols, fn) {
  const elevation = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = fn(r, c);
  return { elevation, rows, cols, cellSizeM: 1, nwXM: -50, nwYM: 40, noDataValue: ND };
}
const HILL = (r, c) => BASE + 3.8 * Math.exp(-(((r - 40) ** 2) + ((c - 40) ** 2)) / 200);
const FLAT = () => BASE;
// 22° duvar (route-compare "sert kısıt" testiyle aynı kesit): üç tercih de no_path.
const WALL = (r, c) => {
  if (c < 30) return BASE;
  if (c <= 34) return BASE + 0.404 * (c - 29);
  if (c <= 39) return BASE + 0.404 * (5 - (c - 34));
  return BASE;
};
function at(raw, r, c) {
  const w = createDemWindow(raw);
  return cellToLocal(w, r, c);
}
const HILL_RAW = rawWin(80, 80, HILL);
const HS = at(HILL_RAW, 40, 10), HE = at(HILL_RAW, 40, 70);

function makeScope() {
  const scope = { out: [], postMessage(m) { this.out.push(m); }, onmessage: null };
  assert.equal(attachWorker(scope), true);
  return scope;
}
function send(scope, msg) {
  scope.out.length = 0;
  scope.onmessage({ data: msg });
  assert.equal(scope.out.length, 1, `tek yanıt beklendi: ${JSON.stringify(scope.out)}`);
  return scope.out[0];
}
// Zaman alanı (timing.elapsedMs) çalıştırmaya bağlı; eşitlik için çıkarılır.
function stripTiming(r) {
  const { timing, ...rest } = r;
  return JSON.parse(JSON.stringify(rest));
}
const plan = (id, extra = {}) => ({ type: 'plan-walking-route', id, startLocal: HS, endLocal: HE, ...extra });

// Alparslan'ın main.js (planMinimapRoute) güncel mesaj biçimi, birebir.
const alparslanMsg = (id, prefKey) => ({
  type: 'plan-walking-route', id, startLocal: HS, endLocal: HE,
  options: { preference: prefKey },
});

test('(a) mesajsız ve balanced aynı sonucu verir; mesajsız yol eski yolla bayt bayt aynı', () => {
  const scope = makeScope();
  assert.equal(send(scope, { type: 'init-window', id: 1, window: HILL_RAW }).type, 'window-ready');
  const legacy = send(scope, plan(2));
  const balanced = send(scope, plan(3, { preference: 'balanced' }));
  const balancedOpt = send(scope, plan(4, { options: { preference: 'balanced' } }));
  assert.equal(legacy.type, 'result');
  // Tercih eklenmemiş eski mesaj: yalnız {type,id,result}.
  assert.deepEqual(Object.keys(legacy).sort(), ['id', 'result', 'type']);
  assert.equal(legacy.result.status, 'ok', legacy.result.reason);
  // Eski yol: init-window alanı (params undefined) ile doğrudan planWalkingRoute (önceki worker davranışı).
  const win = createDemWindow(HILL_RAW);
  const direct = planWalkingRoute({ window: win, field: buildFieldForWindow(win, undefined), startLocal: HS, endLocal: HE });
  assert.equal(JSON.stringify(stripTiming(legacy.result)), JSON.stringify(stripTiming(direct)));
  // Açık balanced: aynı result; yalnız mesaj üst düzeyinde preference alanları eklenir.
  assert.equal(JSON.stringify(stripTiming(balanced.result)), JSON.stringify(stripTiming(legacy.result)));
  assert.equal(JSON.stringify(stripTiming(balancedOpt.result)), JSON.stringify(stripTiming(legacy.result)));
  assert.equal(balanced.preference, 'balanced');
  assert.match(balanced.preferenceNote, /güvenli rota sertifikası değildir/);
});

test('(b) Alparslan gerçek mesajı (flattest) hata vermez ve gentle ile aynı sonucu üretir', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  const flattest = send(scope, alparslanMsg(2, 'flattest'));
  const gentle = send(scope, plan(3, { preference: 'gentle' }));
  assert.equal(flattest.type, 'result', JSON.stringify(flattest));
  assert.equal(flattest.result.status, 'ok', flattest.result.reason);
  assert.equal(flattest.preference, 'gentle');
  assert.equal(flattest.requestedPreference, 'flattest');
  assert.equal(JSON.stringify(stripTiming(flattest.result)), JSON.stringify(stripTiming(gentle.result)));
});

test('(b2) Alparslan mesajının üç tercihi (balanced/shortest/flattest) hata vermeden çalışır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  for (const key of ['balanced', 'shortest', 'flattest']) {
    const message = alparslanMsg(10, key);
    assert.deepEqual(Object.keys(message).sort(), ['endLocal', 'id', 'options', 'startLocal', 'type']);
    assert.deepEqual(message.options, { preference: key });
    const m = send(scope, message);
    assert.equal(m.type, 'result', `${key}: ${JSON.stringify(m)}`);
    assert.equal(m.result.status, 'ok', `${key}: ${m.result.reason}`);
    assert.equal(m.requestedPreference, key);
  }
});

test('(c) dik yamaçta shortest <= balanced <= gentle uzunluk; gentle maks eğimi <= shortest', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  const s = send(scope, plan(2, { preference: 'shortest' })).result;
  const b = send(scope, plan(3, { preference: 'balanced' })).result;
  const g = send(scope, plan(4, { preference: 'gentle' })).result;
  for (const r of [s, b, g]) assert.equal(r.status, 'ok', r.reason);
  assert.ok(s.stats.lengthM <= b.stats.lengthM + 1e-9, `shortest ${s.stats.lengthM} > balanced ${b.stats.lengthM}`);
  assert.ok(b.stats.lengthM <= g.stats.lengthM + 1e-9, `balanced ${b.stats.lengthM} > gentle ${g.stats.lengthM}`);
  assert.ok(g.stats.lengthM > s.stats.lengthM + 5, 'gentle tepeden dolanmalı (gerçek fark)');
  assert.ok(g.stats.maxSlopeDeg <= s.stats.maxSlopeDeg, `gentle maks ${g.stats.maxSlopeDeg} > shortest ${s.stats.maxSlopeDeg}`);
});

test('(d) bilinmeyen tercih açık hata verir; sonraki geçerli mesaj yine çalışır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  const bad = send(scope, plan(2, { preference: 'fastest' }));
  assert.equal(bad.type, 'error');
  assert.equal(bad.id, 2);
  assert.equal(bad.message, 'Bilinmeyen rota tercihi: fastest');
  const badOpt = send(scope, { type: 'plan-walking-route', id: 3, startLocal: HS, endLocal: HE, options: { preference: 'zzz' } });
  assert.equal(badOpt.message, 'Bilinmeyen rota tercihi: zzz');
  const ok = send(scope, plan(4, { preference: 'shortest' }));
  assert.equal(ok.type, 'result');
  assert.equal(ok.result.status, 'ok');
});

test('(e) plan-route-variants üç sonuç döner ve planRouteVariants doğrudan çağrısıyla aynıdır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  const v = send(scope, { type: 'plan-route-variants', id: 2, startLocal: HS, endLocal: HE });
  assert.equal(v.type, 'variants-result');
  assert.equal(v.id, 2);
  assert.deepEqual(Object.keys(v.result.results), ROUTE_PREFERENCE_IDS);
  const direct = planRouteVariants({ window: createDemWindow(HILL_RAW), startLocal: HS, endLocal: HE });
  assert.equal(v.result.status, direct.status);
  assert.equal(JSON.stringify(v.result.results), JSON.stringify(direct.results));
  assert.equal(JSON.stringify(v.result.comparison), JSON.stringify(direct.comparison));
});

test('(e2) plan-route-variants tercih takma adını (flattest) kanonik id ile çözer', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  const v = send(scope, { type: 'plan-route-variants', id: 2, startLocal: HS, endLocal: HE, preferences: ['flattest', 'balanced'] });
  assert.equal(v.type, 'variants-result');
  assert.deepEqual(v.result.meta.requested, ['balanced', 'gentle']);
  assert.equal(v.result.status, 'ok', v.result.reason);
});

test('(f) init-window öncesi plan mesajları "önce init-window" hatası verir', () => {
  const scope = makeScope();
  const a = send(scope, plan(1, { preference: 'shortest' }));
  assert.equal(a.type, 'error');
  assert.equal(a.message, 'önce init-window gönderilmeli');
  const b = send(scope, { type: 'plan-route-variants', id: 2, startLocal: HS, endLocal: HE });
  assert.equal(b.type, 'error');
  assert.equal(b.message, 'önce init-window gönderilmeli');
});

test('(g) yeni init-window eski pencerenin alanını/önbelleğini temizler', () => {
  const scope = makeScope();
  const flatRaw = rawWin(30, 40, FLAT);
  const wallRaw = rawWin(20, 60, WALL);
  const fs = at(flatRaw, 5, 5), fe = at(flatRaw, 5, 30);
  send(scope, { type: 'init-window', id: 1, window: flatRaw });
  const before = send(scope, { type: 'plan-walking-route', id: 2, startLocal: fs, endLocal: fe, preference: 'shortest' });
  assert.equal(before.result.status, 'ok', 'eski düz pencerede rota bulunmalı');
  // Duvar penceresi: aynı koordinatlar artık geçilemez kesit içinden geçer. Eski alan kullanılırsa rota bulunur.
  const ws = at(wallRaw, 10, 5), we = at(wallRaw, 10, 55);
  assert.equal(send(scope, { type: 'init-window', id: 3, window: wallRaw }).type, 'window-ready');
  for (const pref of ['shortest', 'balanced', 'gentle']) {
    const m = send(scope, { type: 'plan-walking-route', id: 4, startLocal: ws, endLocal: we, preference: pref });
    assert.equal(m.result.status, 'no_path', `${pref}: ${m.result.status}`);
  }
  const mv = send(scope, { type: 'plan-route-variants', id: 5, startLocal: ws, endLocal: we });
  assert.equal(mv.result.status, 'failed');
  // Başarısız yeni init: eski pencere önce temizlenir; hiçbir plan eski DEM ile çalışmaz.
  assert.equal(send(scope, { type: 'init-window', id: 6, window: { rows: 0 } }).type, 'error');
  const stale = send(scope, { type: 'plan-walking-route', id: 7, startLocal: fs, endLocal: fe, preference: 'shortest' });
  assert.equal(stale.type, 'error');
  assert.equal(stale.message, 'önce init-window gönderilmeli');
  const staleV = send(scope, { type: 'plan-route-variants', id: 8, startLocal: fs, endLocal: fe });
  assert.equal(staleV.message, 'önce init-window gönderilmeli');
});

test('(h) message.costParams içindeki bilinmeyen alanlar maliyet modeline sızmaz', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: HILL_RAW });
  const clean = send(scope, plan(2, { preference: 'gentle' })).result;
  const dirty = send(scope, plan(3, { preference: 'gentle', costParams: { slopeWeight: 3, distanceWeight: 0.5, bogus: 9 } }));
  assert.equal(dirty.type, 'result', JSON.stringify(dirty));
  assert.equal(JSON.stringify(stripTiming(dirty.result)), JSON.stringify(stripTiming(clean)));
  // Tercih olmadan yalnız üst düzey costParams: yok sayılır, eski yol.
  const legacy = send(scope, plan(4));
  const legacyDirty = send(scope, plan(5, { costParams: { bogus: 1 } }));
  assert.equal(legacyDirty.type, 'result', JSON.stringify(legacyDirty));
  assert.equal(JSON.stringify(stripTiming(legacyDirty.result)), JSON.stringify(stripTiming(legacy.result)));
  // options.costParams bilinmeyen alan içerse de planner'a sızmaz (options'tan ayıklanır).
  const optDirty = send(scope, { type: 'plan-walking-route', id: 6, startLocal: HS, endLocal: HE, options: { preference: 'gentle', costParams: { bogus: 2 } } });
  assert.equal(optDirty.type, 'result', JSON.stringify(optDirty));
  assert.equal(JSON.stringify(stripTiming(optDirty.result)), JSON.stringify(stripTiming(clean)));
});

test('(i) bilinmeyen mesaj tipi ve init-window hatası mevcut kalıpla raporlanır', () => {
  const scope = makeScope();
  const unknown = send(scope, { type: 'nope', id: 1 });
  assert.equal(unknown.message, 'Bilinmeyen mesaj tipi: nope');
  const badInit = send(scope, { type: 'init-window', id: 2, window: { rows: 0 } });
  assert.equal(badInit.type, 'error');
});

// Süre tahmini (stage-route-eta): düz 687 m hat (1 m hücre, tek satır), süre = uzunluk / senaryo hızı.
const FLAT_RAW = rawWin(5, 700, FLAT);
const FLAT_S = at(FLAT_RAW, 2, 5), FLAT_E = at(FLAT_RAW, 2, 692);
const flatPlan = (id, extra = {}) => ({ type: 'plan-walking-route', id, startLocal: FLAT_S, endLocal: FLAT_E, ...extra });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('(s1) plan-walking-route: options yoksa süre simülasyon hızıyla (config SCENARIO.walkSpeedMps) hesaplanır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  const r = send(scope, flatPlan(2)).result;
  assert.equal(r.status, 'ok', JSON.stringify(r.reason));
  assert.ok(near(r.stats.lengthM, 687), `uzunluk ${r.stats.lengthM}`);
  assert.ok(near(r.stats.estimatedDurationS, r.stats.lengthM / SCENARIO.walkSpeedMps), `süre ${r.stats.estimatedDurationS}`);
  assert.equal(r.stats.durationAssumption.value, SCENARIO.walkSpeedMps);
  assert.equal(r.stats.durationAssumption.status, 'scenario');
  assert.match(r.stats.durationAssumption.source, /config\.js SCENARIO\.walkSpeedMps/);
});

test('(s2) plan-walking-route: preference (options.preference) isteğinde de config hızı kullanılır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  const r = send(scope, flatPlan(2, { options: { preference: 'gentle' } })).result;
  assert.equal(r.status, 'ok');
  assert.ok(near(r.stats.estimatedDurationS, r.stats.lengthM / SCENARIO.walkSpeedMps));
  assert.equal(r.stats.durationAssumption.value, SCENARIO.walkSpeedMps);
});

test('(s3) plan-walking-route: options.scenarioSpeedMps verilirse o kullanılır ve çağıran kaynağı etiketlenir', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  const r = send(scope, flatPlan(2, { options: { scenarioSpeedMps: 0.8 } })).result;
  assert.equal(r.status, 'ok');
  assert.ok(near(r.stats.estimatedDurationS, r.stats.lengthM / 0.8));
  assert.equal(r.stats.durationAssumption.value, 0.8);
  assert.match(r.stats.durationAssumption.source, /çağıranın verdiği/);
});

test('(s4) geçersiz scenarioSpeedMps açık invalid_input olarak döner (sessiz varsayılan yok)', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  for (const bad of [0, -1, Number.NaN, '1.2', null]) {
    const r = send(scope, flatPlan(2, { options: { scenarioSpeedMps: bad } })).result;
    assert.equal(r.status, 'invalid_input', `değer ${String(bad)}: ${JSON.stringify(r.status)}`);
    assert.match(r.reason, /scenarioSpeedMps/);
  }
});

test('(s5) plan-route-variants: her tercihin süresi aynı senaryo hızından (uzunluk / 1,2 m/s)', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  const v = send(scope, { type: 'plan-route-variants', id: 2, startLocal: FLAT_S, endLocal: FLAT_E });
  assert.equal(v.type, 'variants-result');
  for (const id of ROUTE_PREFERENCE_IDS) {
    const r = v.result.results[id];
    assert.equal(r.status, 'ok', `${id}: ${r.reason}`);
    assert.ok(near(r.stats.lengthM, 687), `${id} uzunluk ${r.stats.lengthM}`);
    assert.ok(near(r.summary.estimatedDurationS, 687 / SCENARIO.walkSpeedMps), `${id} süre ${r.summary.estimatedDurationS}`);
    assert.equal(r.stats.durationAssumption.value, SCENARIO.walkSpeedMps);
  }
});

test('(s6) plan-route-variants: options.scenarioSpeedMps tüm tercihlerde kullanılır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  const v = send(scope, { type: 'plan-route-variants', id: 2, startLocal: FLAT_S, endLocal: FLAT_E, options: { scenarioSpeedMps: 2 } });
  for (const id of ROUTE_PREFERENCE_IDS) {
    assert.ok(near(v.result.results[id].summary.estimatedDurationS, 687 / 2), `${id}`);
  }
});

test('(s7) plan-route-variants: geçersiz hız her tercihte invalid_input olarak raporlanır', () => {
  const scope = makeScope();
  send(scope, { type: 'init-window', id: 1, window: FLAT_RAW });
  const v = send(scope, { type: 'plan-route-variants', id: 2, startLocal: FLAT_S, endLocal: FLAT_E, options: { scenarioSpeedMps: -3 } });
  assert.notEqual(v.result.status, 'ok');
  for (const id of ROUTE_PREFERENCE_IDS) assert.equal(v.result.results[id].status, 'invalid_input');
});
