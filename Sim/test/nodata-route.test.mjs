// Stage 29B — uçtan uca no-data kapsamı (sentetik fixture, modül-modül). Fixture bellekte üretilir; diske bağımlı değildir.
// Çalıştırma: node --test test/nodata-route.test.mjs
// Veri SENTETİKTİR (scripts/make-nodata-fixture.mjs); gerçek DTM, CRS/datum veya rota güvenliği iddiası taşımaz.
// "FINDING" etiketli yorumlar, bu testlerin ortaya çıkardığı açık noktalardır (orkestra şefine raporlanır).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildNoDataFixture, terrainZ, NODATA_VALUE, NODATA_BITS, NODATA_FIXTURE_SCHEMA,
  FIXTURE_ROWS, FIXTURE_COLS, FIXTURE_NW_X_M, FIXTURE_NW_Y_M, FIXTURE_VALID_MIN, FIXTURE_VALID_MAX,
} from '../scripts/make-nodata-fixture.mjs';
import {
  createDemWindow, cellToLocal, localToCell, buildFieldForWindow, planWalkingRoute, explainLocal,
} from '../public/js/route/route-service.js';
import { buildWalkabilityField, explainCell, STATUS } from '../public/js/route/cost-model.js';
import { planRouteVariants, routePreferenceParams, ROUTE_PREFERENCE_IDS } from '../public/js/route/route-compare.js';
import { attachWorker } from '../public/js/route/pathfinder.worker.js';
import { buildRouteRibbon } from '../public/js/view/3d/route-ribbon.js';
import { createFootprintTrail, FOOTPRINT_INSTANCE_FLOATS, FOOTPRINT_QUAD_FLOATS } from '../public/js/view/3d/footprint-trail.js';
import { buildTerrainMesh } from '../public/js/view/3d/terrain-mesh.js';
import { MarswalkSim, createWorldSnapshot } from '../public/js/simulation/sim.js';
import { SCENARIO } from '../public/js/config.js';
import { createMinimap } from '../public/js/view/minimap/minimap.js';
import { elevationStats, slopeStats, findDepressions } from '../public/js/geo/relief-metrics.js';

// ------------------------------------------------------------------------------------------------ fixture ve kurulum

const FX = buildNoDataFixture();
const ROWS = FIXTURE_ROWS, COLS = FIXTURE_COLS;
const ND32 = Math.fround(NODATA_VALUE);

// Beklenen no-data kümesi: JSON geometrisinden BAĞIMSIZ olarak (test içi basit genişletme).
function expandGeometry(geometry) {
  const set = new Set();
  for (const g of geometry) {
    assert.equal(g.kind, 'rect', 'bilinmeyen şekil türü');
    for (let r = g.rowMin; r <= g.rowMax; r++) for (let c = g.colMin; c <= g.colMax; c++) set.add(r * COLS + c);
  }
  return set;
}
const ND_SET = expandGeometry(FX.json.geometry);
const isNdCell = (r, c) => ND_SET.has(r * COLS + c);

/** Beklenen bilinmeyen-durum kodu: no-data -> NO_DATA; kenar veya 3x3 komşuluğunda no-data -> EDGE_UNKNOWN; aksi null. */
function expectedUnknownStatus(r, c) {
  if (isNdCell(r, c)) return STATUS.NO_DATA;
  if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) return STATUS.EDGE_UNKNOWN;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (isNdCell(r + dr, c + dc)) return STATUS.EDGE_UNKNOWN;
  }
  return null;
}

const VALID = { validMin: FIXTURE_VALID_MIN, validMax: FIXTURE_VALID_MAX };
const RAW = (elevation = FX.elevation) => ({
  elevation, rows: ROWS, cols: COLS, cellSizeM: 1, nwXM: FIXTURE_NW_X_M, nwYM: FIXTURE_NW_Y_M,
  noDataValue: NODATA_VALUE, ...VALID,
});
const WIN = createDemWindow(RAW());
const at = (r, c) => cellToLocal(WIN, r, c);
const fieldDefault = buildFieldForWindow(WIN, undefined);

// Test noktaları: pencere ortasındaki adanın (satır 90..109, sütun 110..129) iki yanı, satır 100.
const WEST = { row: 100, col: 90 };
const EAST = { row: 100, col: 150 };

/** Test tarafı örnekleyici (surface/layers.js kalıbı): geçerli kot -> ok; no-data -> no_data; pencere dışı. */
function sampler(win) {
  return (xM, yM) => {
    const cell = localToCell(win, xM, yM);
    if (!cell.inside) return { status: 'out_of_bounds', value: null };
    const z = win.elevation[cell.row * win.cols + cell.col];
    if (!Number.isFinite(z) || Math.fround(z) === ND32 || z < FIXTURE_VALID_MIN || z > FIXTURE_VALID_MAX) {
      return { status: 'no_data', value: null };
    }
    return { status: 'ok', value: z };
  };
}
const sampleWin = sampler(WIN);

function assertCellsOk(path, field, label) {
  for (const p of path) {
    const i = p.row * COLS + p.col;
    assert.equal(field.status[i], STATUS.OK, `${label}: yol hücresi (${p.row},${p.col}) OK değil (durum ${field.status[i]})`);
    assert.ok(!isNdCell(p.row, p.col), `${label}: yol hücresi (${p.row},${p.col}) no-data`);
  }
}

// ------------------------------------------------------------------------------------------------ (k) fixture

test('(k) fixture deterministik: iki üretim bayt-bayt aynı; JSON geometrisi Float32 no-data kümesiyle birebir aynı', () => {
  const a = buildNoDataFixture();
  const b = buildNoDataFixture();
  assert.equal(Buffer.compare(a.f32, b.f32), 0, 'iki .f32 üretimi bayt-bayt aynı olmalı');
  assert.equal(a.jsonText, b.jsonText);
  assert.equal(a.f32.length, ROWS * COLS * 4);

  const json = JSON.parse(a.jsonText);
  assert.equal(json.schema, NODATA_FIXTURE_SCHEMA);
  assert.equal(json.synthetic, true);
  assert.match(json.label, /gerçek veri değildir/);
  assert.equal(json.noDataBits, '0xFF7FFFFB');
  assert.equal(json.noDataValue, -3.4028226550889045e38, 'sentinel JSON içinde okunabilir değerle yazılı');
  assert.equal(Math.fround(json.noDataValue), ND32);

  // Ham baytlardan (Float32 little-endian) no-data bit deseni okunur; JSON geometrisi ile karşılaştırılır.
  const fromBytes = new Set();
  for (let i = 0; i < ROWS * COLS; i++) {
    if (a.f32.readUInt32LE(i * 4) === NODATA_BITS) fromBytes.add(i);
  }
  const fromJson = expandGeometry(json.geometry);
  assert.deepEqual([...fromBytes].sort((x, y) => x - y), [...fromJson].sort((x, y) => x - y));
  assert.equal(json.noDataCellCount, fromBytes.size);

  // Geçerli hücreler sonlu ve aralık içinde; hiçbir hücre 0 değil.
  for (let i = 0; i < ROWS * COLS; i++) {
    if (fromBytes.has(i)) continue;
    const z = a.f32.readFloatLE(i * 4);
    assert.ok(Number.isFinite(z) && z >= FIXTURE_VALID_MIN && z <= FIXTURE_VALID_MAX, `hücre ${i} aralık dışı: ${z}`);
    assert.notEqual(z, 0);
  }
  assert.equal(json.sha256Data, crypto.createHash('sha256').update(a.f32).digest('hex'));
  // Ada sınırları JSON'da tutarlı: x [-10,10], y [-10,10].
  assert.deepEqual(json.islandBoundsM, { minX: -10, maxX: 10, minY: -10, maxY: 10 });
});

// ------------------------------------------------------------------------------------------------ (a) maliyet alanı

test('(a) maliyet alanı: no-data ve 3x3 komşuluğu (EDGE_UNKNOWN) geçilemez; sahte skor/eğim/0 kot yok', () => {
  const f = buildWalkabilityField({ elevation: FX.elevation, rows: ROWS, cols: COLS, cellSizeM: 1, noDataValue: NODATA_VALUE, ...VALID });
  let unknownCount = 0, knownCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const exp = expectedUnknownStatus(r, c);
      if (exp !== null) {
        unknownCount++;
        assert.equal(f.status[i], exp, `(${r},${c}) durum kodu`);
        assert.equal(f.cost[i], Infinity, `(${r},${c}) geçilemez olmalı`);
        assert.equal(f.score[i], 0, `(${r},${c}) skor 0`);
        assert.ok(Number.isNaN(f.slopeDeg[i]), `(${r},${c}) eğim uydurulmamalı`);
        assert.ok(Number.isNaN(f.roughnessM[i]), `(${r},${c}) pürüzlülük uydurulmamalı`);
        continue;
      }
      knownCount++;
      assert.equal(f.status[i], STATUS.OK, `(${r},${c}) geçerli hücre OK olmalı`);
      // Sentinel (~-3.4e38) ile hesaplanmış bir eğim 90°'ye yakın olurdu; geçerli hücrelerde eğim sonlu ve küçük.
      assert.ok(Number.isFinite(f.slopeDeg[i]) && f.slopeDeg[i] < 20, `(${r},${c}) eğim ${f.slopeDeg[i]}`);
      assert.ok(f.cost[i] >= 1 && Number.isFinite(f.cost[i]), `(${r},${c}) maliyet`);
      assert.ok(f.score[i] >= 1 && f.score[i] <= 100, `(${r},${c}) skor ${f.score[i]}`);
    }
  }
  assert.equal(unknownCount + knownCount, ROWS * COLS);
  assert.ok(unknownCount > 0 && knownCount > 0);
  // Açıklama fonksiyonu da aynı durum adını verir.
  assert.equal(explainCell(f, 99, 119).statusName, 'NO_DATA');
  assert.equal(explainCell(f, 89, 119).statusName, 'EDGE_UNKNOWN');
  assert.equal(explainCell(f, 100, 100).statusName, 'OK');
});

// ------------------------------------------------------------------------------------------------ (b) planWalkingRoute

test('(b1) rota: adanın batısından doğusuna plan adanın etrafını dolaşır; hiçbir yol hücresi no-data/EDGE değil', () => {
  const res = planWalkingRoute({ window: WIN, startLocal: at(WEST.row, WEST.col), endLocal: at(EAST.row, EAST.col) });
  assert.equal(res.status, 'ok', res.reason);
  assertCellsOk(res.path, fieldDefault, 'düz-hat-aşan rota');
  // Düz hat (60 m) adadan geçer: iki uç arası düz hatta no-data/EDGE hücreleri sayılmalı.
  assert.ok(res.stats.unknownCellsOnStraightLine > 0, 'düz hat adadan geçmeli (test senaryosu doğrulaması)');
  assert.ok(res.stats.lengthM >= 60 - 1e-9, `yol uzunluğu ${res.stats.lengthM} düz hattan kısa olamaz`);
  assert.ok(res.stats.lengthM > 61, 'ada dolaşıldığı için yol düz hattan belirgin uzun olmalı');
  // Yol adanın kuzeyinden (satır <= 88) veya güneyinden (satır >= 111) geçer.
  const islandColsCrossing = res.path.filter((p) => p.col >= 110 && p.col <= 129);
  assert.ok(islandColsCrossing.length > 0);
  for (const p of islandColsCrossing) assert.ok(p.row <= 88 || p.row >= 111, `ada içinden geçiş (${p.row},${p.col})`);
});

test('(b2) uç nokta no-data adasının İÇİNDEyse start_blocked/end_blocked ve açık TR/EN neden; kenar komşusu EDGE_UNKNOWN nedeni', () => {
  const inStart = planWalkingRoute({ window: WIN, startLocal: at(99, 119), endLocal: at(EAST.row, EAST.col) });
  assert.equal(inStart.status, 'start_blocked');
  assert.equal(inStart.blocked?.statusName, 'NO_DATA');
  assert.match(inStart.reason, /Başlangıç hücresi \(99,119\) geçilemez: NO_DATA/);
  assert.match(inStart.reasonEN, /Start cell \(99,119\) is impassable: NO_DATA/);
  assert.deepEqual(inStart.path, []);
  assert.equal(inStart.stats, null);

  const inEnd = planWalkingRoute({ window: WIN, startLocal: at(WEST.row, WEST.col), endLocal: at(99, 119) });
  assert.equal(inEnd.status, 'end_blocked');
  assert.equal(inEnd.blocked?.statusName, 'NO_DATA');
  assert.match(inEnd.reason, /Hedef hücresi \(99,119\) geçilemez: NO_DATA/);
  assert.match(inEnd.reasonEN, /End cell \(99,119\) is impassable: NO_DATA/);

  // Adanın hemen kuzeyi (satır 89; ada satır 90'da başlar): no-data'ya komşu, kendisi geçerli -> EDGE_UNKNOWN nedeniyle başlangıç engellenir.
  const ring = planWalkingRoute({ window: WIN, startLocal: at(89, 119), endLocal: at(EAST.row, EAST.col) });
  assert.equal(ring.status, 'start_blocked');
  assert.equal(ring.blocked?.statusName, 'EDGE_UNKNOWN');
  assert.match(ring.reason, /EDGE_UNKNOWN/);
});

test('(b3) tüm yolu kapatan no-data şeridi: no_path ve açık neden', () => {
  const elev = new Float32Array(FX.elevation);
  for (let r = 80; r <= 120; r++) for (let c = 0; c < COLS; c++) elev[r * COLS + c] = NODATA_VALUE;
  const win = createDemWindow(RAW(elev));
  const res = planWalkingRoute({ window: win, startLocal: cellToLocal(win, 40, 60), endLocal: cellToLocal(win, 170, 60) });
  assert.equal(res.status, 'no_path');
  assert.match(res.reason, /geçilebilir bağlantı yok/);
  assert.match(res.reasonEN, /No passable connection/);
  assert.deepEqual(res.path, []);
});

test('(b4) dar koridor: kuzeyden güneye rota duvar boşluğundan (satır 150-151, sütun 101..104) geçer', () => {
  const res = planWalkingRoute({ window: WIN, startLocal: at(120, 60), endLocal: at(180, 60) });
  assert.equal(res.status, 'ok', res.reason);
  assertCellsOk(res.path, fieldDefault, 'koridor rotası');
  const wallCells = res.path.filter((p) => p.row === 150 || p.row === 151);
  assert.ok(wallCells.length >= 2, 'duvar satırlarından geçiş olmalı');
  for (const p of wallCells) {
    assert.ok(p.col >= 101 && p.col <= 104, `duvar satırında boşluk dışı geçiş (${p.row},${p.col})`);
  }
});

// ------------------------------------------------------------------------------------------------ (c) planRouteVariants

test('(c1) planRouteVariants: üç tercihin hiçbir yol hücresi no-data/EDGE değil; her tercih kendi alanında OK', () => {
  const out = planRouteVariants({ window: WIN, startLocal: at(WEST.row, WEST.col), endLocal: at(EAST.row, EAST.col) });
  assert.equal(out.status, 'ok', out.reason);
  for (const id of ROUTE_PREFERENCE_IDS) {
    const r = out.results[id];
    assert.equal(r.status, 'ok', `${id}: ${r.reason}`);
    assertCellsOk(r.path, buildFieldForWindow(WIN, routePreferenceParams(id)), `tercih ${id}`);
  }
  assert.equal(out.comparison.available, true);
});

test('(c2) planRouteVariants: başlangıç no-data adasındaysa üç tercih de AYNI açık nedeni verir', () => {
  const out = planRouteVariants({ window: WIN, startLocal: at(99, 119), endLocal: at(EAST.row, EAST.col) });
  assert.equal(out.status, 'failed');
  assert.match(out.reason, /Başlangıç hücresi \(99,119\) geçilemez: NO_DATA/);
  assert.match(out.reasonEN, /Start cell \(99,119\) is impassable: NO_DATA/);
  for (const id of ROUTE_PREFERENCE_IDS) {
    const r = out.results[id];
    assert.equal(r.status, 'start_blocked', id);
    assert.equal(r.reason, out.reason, `${id} nedeni ortak nedenle aynı olmalı`);
    assert.equal(r.reasonEN, out.reasonEN, `${id} EN nedeni`);
    assert.deepEqual(r.path, []);
  }
  assert.equal(out.comparison.available, false);
});

// ------------------------------------------------------------------------------------------------ (d) worker

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

test('(d) worker: init-window heatmap no-data işaretli; plan mesajları no-data geçmez ya da açık neden döner', () => {
  const scope = makeScope();
  const ready = send(scope, { type: 'init-window', id: 1, window: RAW() });
  assert.equal(ready.type, 'window-ready');
  const hm = ready.heatmap;
  assert.equal(hm.status.length, ROWS * COLS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const exp = expectedUnknownStatus(r, c);
      const st = hm.status[r * COLS + c];
      if (exp !== null) assert.equal(st, exp, `heatmap (${r},${c})`);
      else assert.ok(st === STATUS.OK || st === STATUS.TOO_STEEP, `heatmap (${r},${c}) bilinen hücre ${st}`);
    }
  }

  const ex = send(scope, { type: 'explain-cell', id: 2, point: at(99, 119) });
  assert.equal(ex.type, 'cell-result');
  assert.equal(ex.result.cellStatus, 'NO_DATA');
  assert.equal(ex.result.passable, false);
  assert.equal(ex.result.slopeDeg, null, 'no-data eğimi null (sıfır değil)');

  for (const pref of ['balanced', 'shortest', 'flattest']) {
    const msg = send(scope, { type: 'plan-walking-route', id: 10, preference: pref, startLocal: at(WEST.row, WEST.col), endLocal: at(EAST.row, EAST.col) });
    assert.equal(msg.type, 'result');
    assert.equal(msg.result.status, 'ok', `${pref}: ${msg.result.reason}`);
    assert.equal(msg.preference, pref === 'flattest' ? 'gentle' : pref);
    for (const p of msg.result.path) {
      assert.equal(hm.status[p.row * COLS + p.col], STATUS.OK, `${pref}: yol hücresi (${p.row},${p.col})`);
    }
  }

  const blocked = send(scope, { type: 'plan-walking-route', id: 11, preference: 'shortest', startLocal: at(99, 119), endLocal: at(EAST.row, EAST.col) });
  assert.equal(blocked.result.status, 'start_blocked');
  assert.match(blocked.result.reason, /NO_DATA/);
  assert.deepEqual(blocked.result.path, []);

  const variants = send(scope, { type: 'plan-route-variants', id: 12, startLocal: at(WEST.row, WEST.col), endLocal: at(EAST.row, EAST.col) });
  assert.equal(variants.type, 'variants-result');
  assert.equal(variants.result.status, 'ok');
});

// ------------------------------------------------------------------------------------------------ (e) rota şeridi

function vertexCell(positions, v) {
  return localToCell(WIN, positions[v * 3], positions[v * 3 + 1]);
}

test('(e1) rota şeridi: bulunan yol no-data deliğinden geçmez; hiçbir vertex no-data hücresinin üstüne düşmez', () => {
  const res = planWalkingRoute({ window: WIN, startLocal: at(WEST.row, WEST.col), endLocal: at(EAST.row, EAST.col) });
  assert.equal(res.status, 'ok', res.reason);
  const ribbon = buildRouteRibbon({ path: res.path, segments: res.segments, sampleElevation: sampleWin });
  assert.ok(ribbon.runs.length >= 1);
  assert.ok(ribbon.vertexCount > 0 && ribbon.triangleCount > 0);
  assert.equal(ribbon.counters.skippedUnknown, 0, 'geçilebilir yolun şeridi bilinmeyen kota değmemeli');
  for (let v = 0; v < ribbon.vertexCount; v++) {
    const cell = vertexCell(ribbon.positions, v);
    assert.ok(cell.inside, `vertex ${v} pencere dışında`);
    assert.ok(!isNdCell(cell.row, cell.col), `vertex ${v} no-data hücresinde (${cell.row},${cell.col})`);
    const z = ribbon.sourceElevationsM[v];
    assert.ok(Number.isFinite(z) && z >= FIXTURE_VALID_MIN && z <= FIXTURE_VALID_MAX, `vertex ${v} kotu ${z}`);
  }
  for (let i = 0; i < ribbon.indices.length; i++) assert.ok(ribbon.indices[i] < ribbon.vertexCount);
});

test('(e2) sentetik yol no-data adasının ÜSTÜNDEN geçerse şerit kırılır; boşlukta üçgen yok', () => {
  const y = at(100, 0).yM;
  const path = [{ xM: at(100, 84).xM, yM: y }, { xM: at(100, 155).xM, yM: y }]; // satır 100, adanın içinden
  const ribbon = buildRouteRibbon({ path, sampleElevation: sampleWin, sampleSpacingM: 1 });
  assert.ok(ribbon.runs.length >= 2, `şerit kırılmalı (runs=${ribbon.runs.length})`);
  assert.ok(ribbon.counters.skippedUnknown > 0);
  assert.ok(ribbon.counters.breaks > 0);
  for (let v = 0; v < ribbon.vertexCount; v++) {
    const cell = vertexCell(ribbon.positions, v);
    assert.ok(!isNdCell(cell.row, cell.col), `vertex ${v} no-data üstünde`);
  }
  // Her üçgenin x-aralığı en fazla bir örnekleme adımı (1 m) olmalı: boşluğu köprüleyen üçgen olmamalı.
  for (let t = 0; t < ribbon.indices.length; t += 3) {
    const xs = [0, 1, 2].map((k) => ribbon.positions[ribbon.indices[t + k] * 3]);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 1 + 1e-6, `üçgen ${t / 3} boşluğu köprülüyor: ${xs}`);
  }
});

// ------------------------------------------------------------------------------------------------ (f) ayak izi

function walkEast(trail, fromX, toX, yM, stepM = 0.05) {
  const n = Math.round((toX - fromX) / stepM);
  for (let i = 0; i <= n; i++) {
    const g = i * stepM;
    trail.update({ timeS: g, xM: fromX + g, yM, headingRad: 0, gaitDistanceM: g, grounded: true, airborne: false });
  }
}

test('(f) ayak izi: oyuncu no-data adası üzerinden geçerken iz bırakılmaz; skippedUnknown artar; değerler sonlu', () => {
  const trail = createFootprintTrail({ sampleElevation: sampleWin });
  const plain = createFootprintTrail({ sampleElevation: (x, y) => ({ status: 'ok', value: terrainZ(x, y) }) });
  const y = at(100, 0).yM;
  walkEast(trail, at(100, 85).xM, at(100, 155).xM, y);
  walkEast(plain, at(100, 85).xM, at(100, 155).xM, y);
  const snap = trail.getSnapshot();
  const ref = plain.getSnapshot();

  assert.equal(ref.counters.skippedUnknown, 0, 'referans (ada yok) yürüyüşte bilinmeyen atlanmamalı');
  assert.ok(snap.counters.skippedUnknown > 0, 'ada üzerinde ayak izi atlanmalı');
  assert.ok(snap.count > 0 && snap.count < ref.count, `iz sayısı ${snap.count} < ${ref.count} olmalı`);

  for (let i = 0; i < snap.count; i++) {
    const o = i * FOOTPRINT_INSTANCE_FLOATS;
    const x = snap.instances[o], yy = snap.instances[o + 1], z = snap.instances[o + 2];
    assert.ok([x, yy, z, snap.instances[o + 5]].every(Number.isFinite), `iz ${i} sonlu değil`);
    assert.ok(z > -2510 && z < -2490, `iz ${i} kotu ${z} (sentinel/0 olabilir)`);
    assert.ok(!(Math.abs(x) < 10 && Math.abs(yy) < 10), `iz ${i} ada merkezinde (${x},${yy})`);
  }
  for (let i = 0; i < snap.count; i++) {
    for (let k = 0; k < 4; k++) {
      const o = i * FOOTPRINT_QUAD_FLOATS + k * 3;
      const qx = snap.quads[o], qy = snap.quads[o + 1], qz = snap.quads[o + 2];
      assert.ok([qx, qy, qz].every(Number.isFinite), `iz ${i} köşe ${k} sonlu değil`);
      assert.ok(qz > -2510 && qz < -2490, `iz ${i} köşe ${k} kotu ${qz}`);
      assert.ok(!isNdCell(localToCell(WIN, qx, qy).row, localToCell(WIN, qx, qy).col), `iz ${i} köşe ${k} no-data üstünde`);
    }
  }
});

// ------------------------------------------------------------------------------------------------ (g) arazi mesh'i

function fakeLayer(win) {
  return {
    rows: ROWS, cols: COLS, rowOffset: 0, colOffset: 0, cellSizeM: 1,
    descriptor: { source: 'synthetic', product: NODATA_FIXTURE_SCHEMA, version: '1', unit: 'm', verticalDatum: null },
    cellState(row, col) {
      const z = win.elevation[row * COLS + col];
      if (Math.fround(z) === ND32) return { status: 'no_data', value: null };
      return { status: 'ok', value: z };
    },
    adapter: { pixelToLocal: (row, col) => { const p = cellToLocal(win, row, col); return { x: p.xM, y: p.yM }; } },
  };
}

test('(g) arazi mesh\'i: no-data içeren quad triangulate edilmez; geçerli quad\'lar edilir; kot sentinel/0 değil', () => {
  const mesh = buildTerrainMesh(fakeLayer(WIN), { referenceElevationM: -2500, verticalScale: 3 });
  const valid = (r, c) => !isNdCell(r, c);

  let validQuads = 0;
  for (let r = 1; r < ROWS; r++) {
    for (let c = 1; c < COLS; c++) {
      if (valid(r - 1, c - 1) && valid(r - 1, c) && valid(r, c - 1) && valid(r, c)) validQuads++;
    }
  }
  assert.ok(validQuads > 0 && validQuads < (ROWS - 1) * (COLS - 1));
  assert.equal(mesh.provenance.validQuadCount, validQuads);
  assert.equal(mesh.provenance.omittedQuadCount, (ROWS - 1) * (COLS - 1) - validQuads);
  assert.equal(mesh.indices.length, validQuads * 6);

  const validCells = [];
  for (let i = 0; i < ROWS * COLS; i++) if (valid(Math.floor(i / COLS), i % COLS)) validCells.push(i);
  assert.equal(mesh.positions.length / 3, validCells.length);
  assert.equal(mesh.provenance.validVertexCount, validCells.length);

  // Her vertex, geçerli bir hücreye bağlıdır ve kotu fixture'daki hücre değerinin AYNISIdır (ortalama/0 yok).
  for (let v = 0; v < validCells.length; v++) {
    assert.equal(mesh.sourceElevationsM[v], FX.elevation[validCells[v]], `vertex ${v} kotu`);
  }
  // Her üçgen, tamamı geçerli 2x2 bloktan oluşur (boşluk üzerinde üçgen yok).
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const cells = [0, 1, 2].map((k) => validCells[mesh.indices[t + k]]);
    const rows = cells.map((i) => Math.floor(i / COLS)), cols = cells.map((i) => i % COLS);
    assert.ok(Math.max(...rows) - Math.min(...rows) <= 1 && Math.max(...cols) - Math.min(...cols) <= 1, `üçgen ${t / 3} geniş`);
    for (const i of cells) assert.ok(valid(Math.floor(i / COLS), i % COLS), `üçgen ${t / 3} no-data köşesi`);
  }
  assert.ok(mesh.sourceElevationsM.every((z) => z >= FIXTURE_VALID_MIN && z <= FIXTURE_VALID_MAX));
  assert.ok(Object.values(mesh.bounds).every(Number.isFinite));
});

// ------------------------------------------------------------------------------------------------ (h) simülasyon

function surfaceFor(s) {
  return {
    elevation: { status: s.status, value: s.value, unit: 'm', verticalDatum: null, source: 'nodata-fixture', method: 'test' },
    slope: { status: 'no_data', value: null, unit: '°' },
    zM: s.status === 'ok' ? s.value : null,
    status: s.status,
  };
}

test('(h) simülasyon: no-data üzerinde grounded sahte kurulmaz, zıplama ve iniş yok, origin yeniden tohumlanmaz; çıkışta yeniden temas', () => {
  const sim = new MarswalkSim({ a: { x: at(100, 85).xM, y: at(100, 0).yM }, b: { x: at(100, 180).xM, y: at(100, 0).yM } }, SCENARIO);
  const provider = { sampleSurface: (x, y) => surfaceFor(sampleWin(x, y)) };

  const first = sampleWin(sim.pos.x, sim.pos.y);
  assert.equal(first.status, 'ok');
  assert.equal(sim.resolveSurfaceContact(first), true);
  assert.equal(sim.grounded, true);

  let noDataFrames = 0;
  let originAtEntry = null;
  for (let i = 0; i < 6000 && sim.pos.x < 45; i++) {
    const smp = sampleWin(sim.pos.x, sim.pos.y);
    sim.stepFirstPerson(0.05, { moveX: 1 }, smp);
    if (smp.status === 'ok') continue;
    noDataFrames++;
    if (originAtEntry === null) originAtEntry = sim.bodyWorldZReferenceM;
    assert.equal(sim.grounded, false, 'no-data karesinde grounded olmamalı');
    assert.equal(sim.airborne, false, 'no-data karesinde uçuş başlamamalı');
    assert.equal(sim.landingRecovery, false, 'no-data karesinde iniş toparlanması olmamalı');
    assert.equal(sim.verticalSpeedMps, 0);
    assert.equal(sim.bodyWorldZReferenceM, originAtEntry, 'no-data origin yeniden tohumlamaz');
    // Zıplama girdisi no-data üzerinde etkisiz.
    sim.stepFirstPerson(0.05, { moveX: 1, jump: true }, smp);
    assert.equal(sim.airborne, false, 'no-data üzerinde zıplama başlamaz');
    assert.equal(sim.grounded, false);
    if (noDataFrames === 3) {
      const snap = createWorldSnapshot({ sim, surfaceProvider: provider });
      assert.equal(snap.astronaut.zM, null, 'snapshot zM null (0 değil)');
      assert.equal(snap.astronaut.elevationStatus, 'no_data');
      assert.equal(snap.astronaut.movement.grounded, false);
      assert.equal(snap.astronaut.movement.groundContactStatus, 'no_data');
      assert.equal(snap.astronaut.movement.landingRecovery, false);
    }
  }
  assert.ok(noDataFrames > 0, 'yürüyüş no-data adasından geçmeliydi');
  // FINDING (orkestra şefine): no-data üzerinde gövde yatay hareketini sürdürür; ne durur ne düşer (airborne=false,
  // gravity uygulanmaz). Bu test o davranışı kilitlemez; yalnız grounded/airborne/iniş/origin değişmezlerini doğrular.

  // Adadan çıkınca geçerli zemin yeniden temas kurar; no-data çıkışı iniş sayılmaz.
  assert.equal(sim.grounded, true, 'geçerli zemine dönünce yeniden temas');
  assert.equal(sim.airborne, false);
  assert.equal(sim.landingRecovery, false, 'no-data çıkışı sahte iniş olarak sayılmaz');
});

// ------------------------------------------------------------------------------------------------ (i) minimap

const CANVAS_PX = 400;
const NODATA_RGB = [255, 0, 255];
const DARK_NODATA_RGB = [90, 0, 90];
const VALID_RGB = [100, 120, 80];
const REJECT_NODATA = 'Bu hücre no-data veya geçersiz; başka bir nokta seçin.';
const HOLE = { row: 60, col: 60 };

function fixtureTerrainCanvas() {
  const data = new Uint8ClampedArray(ROWS * COLS * 4);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const rgb = !isNdCell(r, c) ? VALID_RGB : (r === HOLE.row && c === HOLE.col ? DARK_NODATA_RGB : NODATA_RGB);
      data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
    }
  }
  const image = { width: COLS, height: ROWS, data };
  return {
    canvas: { width: COLS, height: ROWS, getContext: () => ({ getImageData: () => image }) },
    bounds: { nwXM: FIXTURE_NW_X_M, nwYM: FIXTURE_NW_Y_M, widthM: COLS, heightM: ROWS },
  };
}

/** Metin ve yay (arc) çağrılarını kaydeden 2D bağlam; diğer çağrılar no-op. */
function recordingCanvas() {
  const texts = [];
  const arcs = [];
  const target = { measureText: () => ({ width: 10 }) };
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'fillText') return (text) => { texts.push(text); };
      if (prop === 'arc') return (x, y, r) => { arcs.push({ x, y, r }); };
      return () => undefined;
    },
    set(t, prop, value) { t[prop] = value; return true; },
  });
  const listeners = new Map();
  const canvas = {
    width: 0, height: 0, style: { cursor: '' },
    getContext: (kind) => (kind === '2d' ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_PX, height: CANVAS_PX }),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.({ button: 0, pointerId: 1, ...event }); },
  };
  return { canvas, ctx, texts, arcs };
}

test('(i) minimap: no-data hücreye tıklama reddedilir (metin çizilir), geçerli hücre kabul edilir, red önceki uç noktayı ezmez', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  const { canvas, texts, arcs } = recordingCanvas();
  const picks = [];
  const mini = createMinimap({ canvas, terrain: fixtureTerrainCanvas(), selectionMode: 'start', onPointSelected: (p) => picks.push(p) });
  // K3-2: minimap selection is fail-closed until it knows the planner's per-cell status (no heatmap -> every click is rejected).
  mini.setPlanning({ heatmap: { status: fieldDefault.status, rows: ROWS, cols: COLS, nwXM: FIXTURE_NW_X_M, nwYM: FIXTURE_NW_Y_M, cellSizeM: 1 } });
  const screen = (xM, yM) => {
    const v = mini.getView();
    return { clientX: CANVAS_PX / 2 + (xM - v.centerXM) * v.pxPerM, clientY: CANVAS_PX / 2 - (yM - v.centerYM) * v.pxPerM };
  };
  const click = (xM, yM) => {
    const p = screen(xM, yM);
    canvas.dispatch('pointerdown', p);
    canvas.dispatch('pointerup', p);
  };
  try {
    // Ada merkezi (0,0) ve delik (-59.5, 39.5): no-data -> reddedilir.
    click(0, 0);
    assert.deepEqual(picks, []);
    assert.ok(texts.includes(REJECT_NODATA), 'no-data reddi ekranda metin olarak çizilir');
    click(-59.5, 39.5);
    assert.deepEqual(picks, [], 'koyu eflatun (tek hücre delik) de reddedilir');

    // K3-2: adanın kuzey komşu halkası (satır 89, sütun 120) görsel olarak geçerli boyanır ama planlayıcıda EDGE_UNKNOWN'dur;
    // minimap bunu artık planlayıcıya göndermeden reddeder.
    const edgeCell = { xM: FIXTURE_NW_X_M + 120 + 0.5, yM: FIXTURE_NW_Y_M - 89 - 0.5 };
    assert.equal(fieldDefault.status[89 * COLS + 120], STATUS.EDGE_UNKNOWN, 'varsayım: bu hücre EDGE_UNKNOWN');
    click(edgeCell.xM, edgeCell.yM);
    assert.deepEqual(picks, [], 'EDGE_UNKNOWN hücre minimap seçiminde reddedilir');
    assert.ok(texts.some((t) => String(t).includes('komşu yüzey durumu bilinmiyor')), 'EDGE_UNKNOWN reddi ekranda metin olarak çizilir');

    // Geçerli hücre (satır 20, sütun 20) kabul edilir.
    const valid = { xM: -100, yM: 80 };
    click(valid.xM, valid.yM);
    assert.equal(picks.length, 1);
    assert.equal(picks[0].kind, 'start');
    assert.ok(Math.abs(picks[0].xM - valid.xM) < 1e-6 && Math.abs(picks[0].yM - valid.yM) < 1e-6);

    // Bitiş modu: no-data reddedilir ve başlangıç işaretçisi önceki geçerli noktada kalır.
    mini.setSelectionMode('end');
    click(0, 0);
    assert.equal(picks.length, 1, 'reddedilen bitiş tıklaması geri çağrı üretmez');
    const startMarkers = arcs.filter((a) => a.r === 7);
    const last = startMarkers[startMarkers.length - 1];
    const expected = screen(valid.xM, valid.yM);
    assert.ok(Math.abs(last.x - expected.clientX) < 1e-6 && Math.abs(last.y - expected.clientY) < 1e-6,
      'başlangıç işaretçisi reddedilen tıklamadan sonra yerinde');
  } finally {
    mini.destroy();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

// ÇÖZÜLDÜ (K3-2, Alparslan): eskiden minimap EDGE_UNKNOWN hücrelerini kabul ediyordu (yalnız planner start_blocked ile
// reddediyordu). Artık planlama ısı haritası verilmeden hiçbir nokta kabul edilmez ve EDGE_UNKNOWN/TOO_STEEP/NO_DATA hücreleri
// seçim anında reddedilir; test (i) bunu kilitler.

// ------------------------------------------------------------------------------------------------ (j) rölyef metrikleri

test('(j) relief-metrics: no-data\'ya değen havza noDataTemasi:true; kot istatistikleri no-data\'yı 0 saymaz', () => {
  const grid = (elevation) => ({
    elevation, rows: ROWS, cols: COLS, cellSizeM: 1, nwXM: FIXTURE_NW_X_M, nwYM: FIXTURE_NW_Y_M,
    noDataValue: NODATA_VALUE, ...VALID,
  });

  // İstatistikler (ham fixture, çukur yok): no-data bilinmeyen sayılır, min/max sentinel veya 0 değildir.
  const es = elevationStats(grid(FX.elevation));
  assert.equal(es.unknownCount, ND_SET.size);
  assert.equal(es.validCount, ROWS * COLS - ND_SET.size);
  assert.ok(es.minM > FIXTURE_VALID_MIN && es.maxM < FIXTURE_VALID_MAX, `istatistik aralığı ${es.minM}..${es.maxM}`);
  assert.ok(es.p1M > FIXTURE_VALID_MIN);
  const ss = slopeStats(grid(FX.elevation));
  assert.ok(ss.maxDeg > 0 && ss.maxDeg < 20, `eğim maksimumu ${ss.maxDeg}: sentinel sızmamalı`);

  // İki sentetik 5 m çukur: biri ada kuzeyinde (satır 88, sütun 119; çevresinde satır 89 no-data'ya komşu, yani
  // havzanın kenar hücreleri bilinmeyene değer), diğeri uzakta (satır 30, sütun 30).
  const elev = new Float32Array(FX.elevation);
  elev[88 * COLS + 119] = FX.elevation[88 * COLS + 119] - 5;
  elev[30 * COLS + 30] = FX.elevation[30 * COLS + 30] - 5;
  const dep = findDepressions(grid(elev), { minDepthM: 1 });
  const nearIsland = dep.basins.find((b) => b.row === 88 && b.col === 119);
  const farAway = dep.basins.find((b) => b.row === 30 && b.col === 30);
  assert.ok(nearIsland && farAway, `çukurlar bulunmalı: ${JSON.stringify(dep.basins.map((b) => [b.row, b.col]))}`);
  assert.equal(nearIsland.noDataTemasi, true);
  assert.equal(nearIsland.spillIntoUnknown, true);
  assert.match(nearIsland.depthNote, /ALT SINIR/);
  assert.ok(Math.abs(nearIsland.depthM - 5) < 0.5, `derinlik ${nearIsland.depthM}`);
  assert.equal(farAway.noDataTemasi, false);
  assert.equal(farAway.depthNote, null);
  assert.ok(Math.abs(farAway.depthM - 5) < 0.5, `derinlik ${farAway.depthM}`);
  for (const b of dep.basins) {
    assert.ok(b.minElevationM > FIXTURE_VALID_MIN && b.minElevationM < FIXTURE_VALID_MAX, 'çukur dibi sentinel/0 değil');
  }
});
