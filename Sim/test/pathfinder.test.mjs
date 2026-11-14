import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, handlePlanMessage } from '../public/js/route/pathfinder.js';

const INF = Infinity;
const SQ2 = Math.SQRT2;

function makeField(rows, cols, fn, cellSizeM = 1) {
  const cost = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cost[r * cols + c] = fn(r, c);
  return { schema: 'marswalk.cost-field.v1', rows, cols, cellSizeM, cost };
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deepFreezeCheck(o) {
  if (o === null || typeof o !== 'object') return true;
  return Object.isFrozen(o) && Object.values(o).every(deepFreezeCheck);
}
// Bağımsız Dijkstra referansı (O(n^2), 8-komşu, köşe kesme yasak).
function dijkstraRef(field, s, e) {
  const { rows, cols, cost, cellSizeM } = field;
  const n = rows * cols;
  const dist = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  dist[s.row * cols + s.col] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    const r = Math.floor(u / cols), c = u % cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const v = nr * cols + nc;
      if (cost[v] === INF) continue;
      if (dr && dc && (cost[r * cols + nc] === INF || cost[nr * cols + c] === INF)) continue;
      const w = (dr && dc ? SQ2 : 1) * cellSizeM * (cost[u] + cost[v]) / 2;
      if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
    }
  }
  return dist[e.row * cols + e.col];
}
const chebyshev = (a, b) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

test('açık alan: oktil optimal uzunluk ve bitişik hücre zinciri', () => {
  const f = makeField(30, 40, () => 1, 2);
  const res = planRoute({ field: f, start: { row: 2, col: 3 }, end: { row: 20, col: 30 } });
  assert.equal(res.status, 'ok');
  const dr = 18, dc = 27;
  const octile = (dc - dr + SQ2 * dr) * 2;
  assert.ok(Math.abs(res.stats.lengthM - octile) < 1e-9);
  assert.ok(Math.abs(res.stats.totalCost - octile) < 1e-6);
  assert.deepEqual(res.path[0], { row: 2, col: 3 });
  assert.deepEqual(res.path.at(-1), { row: 20, col: 30 });
  for (let i = 1; i < res.path.length; i++) assert.equal(chebyshev(res.path[i - 1], res.path[i]), 1);
  assert.equal(res.stats.impassableCrossings, 0);
  assert.equal(res.algorithm.hierarchical, false);
  assert.equal(res.segments.length, res.path.length - 1);
});

test('başlangıç = hedef: tek hücreli yol', () => {
  const f = makeField(5, 5, () => 1);
  const res = planRoute({ field: f, start: { row: 1, col: 1 }, end: { row: 1, col: 1 } });
  assert.equal(res.status, 'ok');
  assert.equal(res.path.length, 1);
  assert.equal(res.stats.lengthM, 0);
});

test('geçitli duvar: geçitten geçer, uzunluk elle hesaplanmış (4*sqrt2+6)', () => {
  const f = makeField(5, 7, (r, c) => (c === 3 && r < 4 ? INF : 1));
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 0, col: 6 } });
  assert.equal(res.status, 'ok');
  assert.ok(res.path.some((p) => p.row === 4 && p.col === 3), 'geçit hücresinden geçmeli');
  assert.ok(Math.abs(res.stats.lengthM - (4 * SQ2 + 6)) < 1e-9);
  assert.ok(Math.abs(res.stats.totalCost - dijkstraRef(f, { row: 0, col: 0 }, { row: 0, col: 6 })) < 1e-6);
});

test('geçitsiz duvar: no_path ve açıklayıcı reason', () => {
  const f = makeField(6, 7, (r, c) => (c === 3 ? INF : 1));
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 5, col: 6 } });
  assert.equal(res.status, 'no_path');
  assert.ok(res.reason.length > 10);
  assert.deepEqual(res.path, []);
});

test('başlangıç/hedef geçilemez: start_blocked / end_blocked', () => {
  const f = makeField(5, 5, (r, c) => ((r === 0 && c === 0) || (r === 4 && c === 4) ? INF : 1));
  assert.equal(planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 2, col: 2 } }).status, 'start_blocked');
  assert.equal(planRoute({ field: f, start: { row: 2, col: 2 }, end: { row: 4, col: 4 } }).status, 'end_blocked');
});

test('geçersiz girdi: aralık dışı, NaN, tam sayı olmayan, kötü alan', () => {
  const f = makeField(5, 5, () => 1);
  const ok = { row: 1, col: 1 };
  const bad = [{ row: -1, col: 0 }, { row: 5, col: 0 }, { row: NaN, col: 1 }, { row: 1.5, col: 1 }, { row: 1 }, null];
  for (const b of bad) {
    assert.equal(planRoute({ field: f, start: b, end: ok }).status, 'invalid_input');
    assert.equal(planRoute({ field: f, start: ok, end: b }).status, 'invalid_input');
  }
  assert.equal(planRoute(undefined).status, 'invalid_input');
  assert.equal(planRoute({ start: ok, end: ok }).status, 'invalid_input');
  const mk = (patch) => ({ ...f, ...patch });
  assert.equal(planRoute({ field: mk({ cellSizeM: 0 }), start: ok, end: ok }).status, 'invalid_input');
  assert.equal(planRoute({ field: mk({ cellSizeM: NaN }), start: ok, end: ok }).status, 'invalid_input');
  assert.equal(planRoute({ field: mk({ cost: new Float32Array(10) }), start: ok, end: ok }).status, 'invalid_input');
  assert.equal(planRoute({ field: mk({ cost: new Array(25).fill(1) }), start: ok, end: ok }).status, 'invalid_input');
  for (const badVal of [0.5, NaN, -1, -Infinity]) {
    const c = new Float32Array(25).fill(1); c[7] = badVal;
    const res = planRoute({ field: mk({ cost: c }), start: ok, end: { row: 3, col: 3 } });
    assert.equal(res.status, 'invalid_input', `cost=${badVal}`);
  }
});

test('engebe: ucuz dolambaç yerine pahalı kısa yol seçilmez; toplam maliyet referansla aynı', () => {
  const f = makeField(9, 11, (r, c) => (c === 5 && r < 8 ? 100 : 1));
  const s = { row: 0, col: 2 }, e = { row: 0, col: 8 };
  const res = planRoute({ field: f, start: s, end: e });
  assert.equal(res.status, 'ok');
  assert.ok(res.path.some((p) => p.row === 8), 'dolambaçtan geçmeli');
  assert.ok(Math.abs(res.stats.totalCost - dijkstraRef(f, s, e)) < 1e-6);
  assert.ok(res.stats.maxCost < 100);
});

test('köşe kesme yasak', () => {
  const diagOnly = makeField(2, 2, (r, c) => (r === c ? 1 : INF));
  assert.equal(planRoute({ field: diagOnly, start: { row: 0, col: 0 }, end: { row: 1, col: 1 } }).status, 'no_path');
  const oneBlocked = makeField(2, 2, (r, c) => (r === 0 && c === 1 ? INF : 1));
  const res = planRoute({ field: oneBlocked, start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
  assert.equal(res.status, 'ok');
  assert.equal(res.path.length, 3);
  assert.ok(Math.abs(res.stats.lengthM - 2) < 1e-9);
});

test('rastgele küçük alanlarda Dijkstra referansı ile eşleşir (60 alan)', () => {
  const rnd = mulberry32(12345);
  let compared = 0, noPath = 0;
  for (let t = 0; t < 60; t++) {
    const rows = 6 + Math.floor(rnd() * 8), cols = 6 + Math.floor(rnd() * 8);
    const f = makeField(rows, cols, () => (rnd() < 0.22 ? INF : 1 + rnd() * 5), 0.5 + rnd() * 3);
    const pick = () => {
      for (;;) {
        const p = { row: Math.floor(rnd() * rows), col: Math.floor(rnd() * cols) };
        if (f.cost[p.row * cols + p.col] !== INF) return p;
      }
    };
    const s = pick(), e = pick();
    const ref = dijkstraRef(f, s, e);
    const res = planRoute({ field: f, start: s, end: e });
    if (ref === Infinity) { assert.equal(res.status, 'no_path', `alan ${t}`); noPath++; continue; }
    assert.equal(res.status, 'ok', `alan ${t}`);
    assert.ok(Math.abs(res.stats.totalCost - ref) < 1e-6, `alan ${t}: ${res.stats.totalCost} vs ${ref}`);
    assert.equal(res.stats.impassableCrossings, 0);
    compared++;
  }
  assert.ok(compared >= 50, `yalnız ${compared} karşılaştırma`);
  assert.equal(compared + noPath, 60);
});

test('determinizm: aynı girdi aynı çıktı', () => {
  const rnd = mulberry32(7);
  const f = makeField(40, 40, () => (rnd() < 0.15 ? INF : 1 + rnd() * 2));
  f.cost[0] = 1; f.cost[40 * 40 - 1] = 1;
  const args = { field: f, start: { row: 0, col: 0 }, end: { row: 39, col: 39 }, options: { smooth: true } };
  const a = planRoute(args), b = planRoute(args);
  const strip = (r) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });
  assert.deepEqual(strip(a), strip(b));
});

test('bütçe aşıldı: sahte yol yok', () => {
  const f = makeField(100, 100, () => 1);
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 99, col: 99 }, budget: { maxExpansions: 10 } });
  assert.equal(res.status, 'budget_exceeded');
  assert.deepEqual(res.path, []);
  assert.match(res.reason, /bütçe/);
  assert.equal(res.stats.cellsExpanded, 10);
  const t = planRoute({ field: makeField(600, 600, () => 1), start: { row: 0, col: 0 }, end: { row: 599, col: 599 }, budget: { maxMs: 1e-6 } });
  assert.equal(t.status, 'budget_exceeded');
  assert.match(t.reason, /süre bütçesi/);
});

test('bütçe kesintisi: reason koordinatları ızgara sınırı içinde, Infinity yok (düz ve hiyerarşik)', () => {
  const rows = 300, cols = 400;
  const f = makeField(rows, cols, () => 1);
  const coord = (reason) => {
    const m = reason.match(/\((\d+),(\d+)\)/);
    assert.ok(m, reason);
    return { row: Number(m[1]), col: Number(m[2]) };
  };
  const s = { row: 0, col: 0 }, e = { row: rows - 1, col: cols - 1 };
  // Hiç genişletme olmadan kesinti (maxExpansions: 1 -> yalnız başlangıç genişler) ve hemen-süre kesintisi.
  const cases = [
    planRoute({ field: f, start: s, end: e, budget: { maxExpansions: 1 } }),
    planRoute({ field: f, start: s, end: e, budget: { maxMs: 1e-6 } }),
    planRoute({ field: f, start: s, end: e, budget: { maxExpansions: 1 }, options: { hierarchical: true } }),
    planRoute({ field: f, start: s, end: e, budget: { maxMs: 1e-6 }, options: { hierarchical: true } }),
    // Kaba arama tamamlanır (50x38 ≈ ~50 genişletme), ince arama kesilir.
    planRoute({ field: f, start: s, end: e, budget: { maxExpansions: 200 }, options: { hierarchical: true } }),
  ];
  for (const res of cases) {
    assert.equal(res.status, 'budget_exceeded');
    assert.ok(!/Infinity|NaN/.test(res.reason), res.reason);
    const p = coord(res.reason);
    assert.ok(p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols, res.reason);
  }
  assert.match(cases[2].reason, /kaba ızgarada/);
  assert.match(cases[4].reason, /bütçe/);
  // Kaba hücre koordinatı: 400 sütunluk ince ızgara indeksiyle yanlış biçimlenmemeli (kaba sütun < 50).
  assert.ok(coord(cases[2].reason).col < Math.ceil(cols / 8));
});

function randomTerrain(rows, cols, seed) {
  // Düşük frekanslı engebe + engel bloblar, Float32 maliyetler.
  const rnd = mulberry32(seed);
  const bumps = Array.from({ length: 25 }, () => ({ r: rnd() * rows, c: rnd() * cols, rad: 6 + rnd() * 25, h: rnd() * 8 }));
  const blobs = Array.from({ length: 14 }, () => ({ r: rnd() * rows, c: rnd() * cols, rad: 4 + rnd() * 14 }));
  return makeField(rows, cols, (r, c) => {
    for (const b of blobs) if (Math.hypot(r - b.r, c - b.c) < b.rad) return INF;
    let v = 1 + rnd() * 0.5;
    for (const b of bumps) { const d = Math.hypot(r - b.r, c - b.c); if (d < b.rad) v += b.h * (1 - d / b.rad); }
    return v;
  });
}
function freeCell(f, rnd, near) {
  // near'a en yakın (Chebyshev halkaları) geçilebilir hücre; deterministik.
  for (let d = 0; d < Math.max(f.rows, f.cols); d++) {
    for (let r = Math.max(0, near.row - d); r <= Math.min(f.rows - 1, near.row + d); r++) {
      for (let c = Math.max(0, near.col - d); c <= Math.min(f.cols - 1, near.col + d); c++) {
        if (f.cost[r * f.cols + c] !== INF) return { row: r, col: c };
      }
    }
  }
  throw new Error('geçilebilir hücre yok');
}

test('hiyerarşik: tam A*a göre maliyet oranı ölçülür, geçilemez hücre geçmez', () => {
  const ratios = [];
  for (let seed = 1; seed <= 6; seed++) {
    const f = randomTerrain(300, 360, seed * 101);
    const rnd = mulberry32(seed);
    const s = freeCell(f, rnd, { row: 3, col: 3 }), e = freeCell(f, rnd, { row: 290, col: 350 });
    const full = planRoute({ field: f, start: s, end: e });
    const hier = planRoute({ field: f, start: s, end: e, options: { hierarchical: true } });
    if (full.status !== 'ok') { assert.equal(hier.status, full.status); continue; }
    assert.equal(hier.status, 'ok');
    assert.equal(hier.stats.impassableCrossings, 0);
    assert.ok(hier.stats.totalCost >= full.stats.totalCost - 1e-6, 'hiyerarşik tam optimalden iyi olamaz');
    // Bu tohumların hepsinde hiyerarşik yol GERÇEKTEN kullanıldı (geri dönüş yok): ölçüldü.
    assert.equal(hier.algorithm.hierarchical, true, `seed ${seed}: hiyerarşik yol kullanılmadı: ${hier.reason}`);
    assert.equal(hier.algorithm.optimality, 'near_optimal');
    assert.match(hier.reason, /YAKLAŞIK/);
    assert.ok(hier.stats.cellsExpanded < full.stats.cellsExpanded * 0.75,
      `genişletme tam ${full.stats.cellsExpanded} / hiy ${hier.stats.cellsExpanded}`); // ölçülen oran <= 0.52
    assert.equal(hier.stats.costMetric, 'grid_step');
    ratios.push(hier.stats.totalCost / full.stats.totalCost);
    console.log(`hiyerarşik seed ${seed}: oran ${(hier.stats.totalCost / full.stats.totalCost).toFixed(4)}, ` +
      `genişletme tam ${full.stats.cellsExpanded} / hiy ${hier.stats.cellsExpanded}, hiy=${hier.algorithm.hierarchical}`);
  }
  assert.equal(ratios.length, 6);
  const worst = Math.max(...ratios);
  console.log(`hiyerarşik en kötü oran ${worst.toFixed(4)}`);
  assert.ok(worst < 1.005, `oran ${worst}`); // ölçülen en kötü 1.0020
});

test('hiyerarşik: koridor başarısızsa tam aramaya düşer (hierarchical:false, koridor notu)', () => {
  // Kaba ızgarada geçilebilir görünen (duvar tek sütun, kaba hücreler hâlâ geçilebilir) ama ince ızgarada
  // koridor içinde tamamen kapalı; tek geçit (row 60) koridor dışında.
  const f = makeField(64, 64, (r, c) => (c === 32 && r !== 60 ? INF : 1));
  const s = { row: 2, col: 2 }, e = { row: 2, col: 60 };
  const res = planRoute({ field: f, start: s, end: e, options: { hierarchical: true, corridorCells: 1 } });
  assert.equal(res.status, 'ok');
  assert.equal(res.algorithm.hierarchical, false);
  assert.equal(res.algorithm.optimality, 'optimal');
  assert.match(res.reason, /koridor/);
  assert.equal(res.stats.impassableCrossings, 0);
  const full = planRoute({ field: f, start: s, end: e });
  // Geri dönüş tam A*'dır: aynı optimum (hiyerarşik yol asla "optimal" diye etiketlenmedi).
  assert.ok(Math.abs(res.stats.totalCost - full.stats.totalCost) < 1e-9);
  assert.ok(res.stats.cellsExpanded > full.stats.cellsExpanded, 'başarısız koridor araması da sayılır');
});

test('hiyerarşik: kaba ızgarada yol yoksa tam arama notu ve no_path tutarlı', () => {
  const f = makeField(64, 64, (r, c) => (c >= 24 && c < 40 ? INF : 1)); // 16 sütun kalın duvar: kaba hücreler de kapalı
  const res = planRoute({ field: f, start: { row: 2, col: 2 }, end: { row: 2, col: 60 }, options: { hierarchical: true } });
  assert.equal(res.status, 'no_path');
  assert.match(res.reason, /kaba/);
});

test('yumuşatma: aynı ölçüde maliyet artmaz; gridCost/costMetric/smoothingGain etiketleri; uç noktalar aynı', () => {
  let shortened = 0, lowerThanGrid = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const f = randomTerrain(150, 150, seed * 17);
    const rnd = mulberry32(seed + 99);
    const s = freeCell(f, rnd, { row: 2, col: 2 }), e = freeCell(f, rnd, { row: 145, col: 140 });
    const a = planRoute({ field: f, start: s, end: e });
    if (a.status !== 'ok') continue;
    const b = planRoute({ field: f, start: s, end: e, options: { smooth: true } });
    assert.equal(b.status, 'ok');
    assert.equal(a.stats.costMetric, 'grid_step');
    assert.equal(a.stats.smoothingGain, 0);
    assert.equal(a.stats.gridCost, a.stats.totalCost);
    // Kabul kuralı: kısayol çizgi maliyeti <= değiştirdiği ızgara koşusu; bu yüzden toplam gridCost'u aşmaz.
    assert.equal(b.stats.gridCost, a.stats.totalCost, 'gridCost = yumuşatılmamış A* totalCost');
    assert.ok(b.stats.totalCost <= b.stats.gridCost * (1 + 1e-12), `${b.stats.totalCost} > ${b.stats.gridCost}`);
    assert.ok(b.stats.smoothingGain >= 0);
    assert.ok(Math.abs(b.stats.smoothingGain - (b.stats.gridCost - b.stats.totalCost)) < 1e-9);
    if (b.algorithm.smoothed) {
      assert.equal(b.stats.costMetric, 'line_integral');
      assert.match(b.reason, /KARŞILAŞTIRILAMAZ/);
      assert.match(b.reason, /gridCost/);
    } else {
      assert.equal(b.stats.costMetric, 'grid_step');
      assert.equal(b.stats.smoothingGain, 0);
    }
    if (b.stats.smoothingGain > 1e-9) lowerThanGrid++;
    assert.equal(b.stats.impassableCrossings, 0);
    assert.deepEqual(b.path[0], s);
    assert.deepEqual(b.path.at(-1), e);
    assert.ok(b.path.length <= a.path.length);
    if (b.path.length < a.path.length) shortened++;
    let len = 0;
    for (const sg of b.segments) len += sg.lengthM;
    assert.ok(Math.abs(len - b.stats.lengthM) < 1e-6);
  }
  assert.ok(shortened >= 1, 'yumuşatma en az bir yolu kısaltmalı');
  assert.ok(lowerThanGrid >= 1, 'yumuşatılmış çizgi-integrali maliyeti ızgara optimumundan düşük çıkabilir (etiketli)');
});

test('yumuşatma uygulanmadıysa etiketler ızgara-adımı', () => {
  const f = makeField(6, 6, () => 1);
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 0, col: 1 }, options: { smooth: true } });
  assert.equal(res.status, 'ok');
  assert.equal(res.algorithm.smoothed, false);
  assert.equal(res.stats.costMetric, 'grid_step');
  assert.equal(res.stats.gridCost, res.stats.totalCost);
  assert.equal(res.stats.smoothingGain, 0);
});

test('yumuşatma: kapalı hücre kenarından geçen görüş hattı reddedilir', () => {
  // Köşegen üzerinde engel var; düz çizgi engele değer.
  const f = makeField(9, 9, (r, c) => (r === 4 && c === 4 ? INF : 1));
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 8, col: 8 }, options: { smooth: true } });
  assert.equal(res.status, 'ok');
  assert.equal(res.stats.impassableCrossings, 0);
});

test('score/slope varsa istatistikler hesaplanır', () => {
  const f = makeField(6, 6, () => 1);
  f.score = new Uint8Array(36).fill(80); f.score[2 * 6 + 2] = 40;
  f.slopeDeg = new Float32Array(36).fill(3); f.slopeDeg[2 * 6 + 2] = 12;
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 5, col: 5 } });
  assert.equal(res.status, 'ok');
  assert.equal(res.stats.minScore, 40);
  assert.equal(res.stats.maxSlopeDeg, 12);
  assert.ok(res.stats.meanScore <= 80 && res.stats.meanScore >= 40);
});

test('handlePlanMessage: gidiş-dönüş ve hata yolu', () => {
  const f = makeField(10, 10, () => 1);
  const out = handlePlanMessage({ type: 'plan', id: 42, field: f, start: { row: 0, col: 0 }, end: { row: 9, col: 9 }, budget: {}, options: {} });
  assert.equal(out.type, 'result');
  assert.equal(out.id, 42);
  assert.equal(out.result.status, 'ok');
  const cloned = structuredClone(out); // worker postMessage ile uyumlu
  assert.equal(cloned.result.path.length, out.result.path.length);
  const bad = handlePlanMessage({ type: 'nope', id: 7 });
  assert.equal(bad.type, 'error');
  assert.equal(bad.id, 7);
  assert.equal(handlePlanMessage(null).type, 'error');
  const inv = handlePlanMessage({ type: 'plan', id: 1, field: null });
  assert.equal(inv.type, 'result');
  assert.equal(inv.result.status, 'invalid_input');
});

test('çıktı derin dondurulmuş ve girdi alanına referans paylaşmaz', () => {
  const f = makeField(8, 8, () => 1);
  const before = Float32Array.from(f.cost);
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 7, col: 7 }, options: { smooth: true } });
  assert.ok(deepFreezeCheck(res));
  assert.throws(() => { 'use strict'; res.path.push({ row: 0, col: 0 }); });
  assert.deepEqual(f.cost, before);
  assert.ok(deepFreezeCheck(planRoute({ field: f, start: { row: -1, col: 0 }, end: { row: 1, col: 1 } })));
});

test('geçersiz budget: düz nesne olmayan, kötü değer, bilinmeyen anahtar -> invalid_input', () => {
  const f = makeField(6, 6, () => 1);
  const base = { field: f, start: { row: 0, col: 0 }, end: { row: 5, col: 5 } };
  const bads = [5, 'abc', null, [], true, () => 1, { maxExpansions: 0 }, { maxExpansions: -3 }, { maxExpansions: 1.5 },
    { maxExpansions: NaN }, { maxExpansions: Infinity }, { maxExpansions: '10' }, { maxMs: 0 }, { maxMs: -1 },
    { maxMs: NaN }, { maxMs: Infinity }, { maxMs: '5' }, { maxExpansion: 10 }, { foo: 1 }];
  for (const budget of bads) {
    const res = planRoute({ ...base, budget });
    assert.equal(res.status, 'invalid_input', `budget=${String(JSON.stringify(budget) ?? typeof budget)}`);
    assert.match(res.reason, /budget/);
    assert.deepEqual(res.path, []);
  }
  assert.equal(planRoute({ ...base, budget: undefined }).status, 'ok');
  assert.equal(planRoute({ ...base, budget: {} }).status, 'ok');
  assert.equal(planRoute({ ...base, budget: { maxExpansions: 100000, maxMs: 60000 } }).status, 'ok');
  assert.equal(planRoute({ ...base, budget: Object.create(null) }).status, 'ok');
});

test('geçersiz options: düz nesne olmayan, kötü değer, bilinmeyen anahtar -> invalid_input', () => {
  const f = makeField(20, 20, () => 1);
  const base = { field: f, start: { row: 0, col: 0 }, end: { row: 19, col: 19 } };
  const bads = [7, 'x', null, [], { hierarchical: 'yes' }, { hierarchical: 1 }, { hierarchical: null }, { smooth: 'true' },
    { smooth: 1 }, { smooth: null }, { coarseFactor: NaN }, { coarseFactor: 1 }, { coarseFactor: 2.5 }, { coarseFactor: '8' },
    { coarseFactor: Infinity }, { corridorCells: 0 }, { corridorCells: -1 }, { corridorCells: 1.5 }, { corridorCells: NaN },
    { smoothing: true }, { hierarchic: true }];
  for (const options of bads) {
    const res = planRoute({ ...base, options });
    assert.equal(res.status, 'invalid_input', `options=${JSON.stringify(options)}`);
    assert.match(res.reason, /options/);
    assert.deepEqual(res.path, []);
  }
  for (const options of [undefined, {}, { smooth: false }, { hierarchical: false }, { hierarchical: 'auto' }, { hierarchical: true, coarseFactor: 4, corridorCells: 1 }]) {
    assert.equal(planRoute({ ...base, options }).status, 'ok', JSON.stringify(options));
  }
});

test('field.schema: yok kabul, doğruysa kabul, farklıysa invalid_input; Float64 cost kabul', () => {
  const f = makeField(5, 5, () => 1);
  const base = { start: { row: 0, col: 0 }, end: { row: 4, col: 4 } };
  const { schema, ...noSchema } = f;
  assert.equal(planRoute({ ...base, field: noSchema }).status, 'ok');
  assert.equal(planRoute({ ...base, field: f }).status, 'ok');
  for (const bad of ['marswalk.cost-field.v2', '', null, 1]) {
    const res = planRoute({ ...base, field: { ...f, schema: bad } });
    assert.equal(res.status, 'invalid_input', String(bad));
    assert.match(res.reason, /schema/);
  }
  const f64 = { ...f, cost: Float64Array.from(f.cost) };
  assert.equal(planRoute({ ...base, field: f64 }).status, 'ok');
});

test('cellSizeM aşırı büyük: maliyet taşması sahte no_path yerine invalid_input', () => {
  const f = makeField(10, 10, () => 1, 1e308);
  const res = planRoute({ field: f, start: { row: 0, col: 0 }, end: { row: 9, col: 9 } });
  assert.equal(res.status, 'invalid_input');
  assert.match(res.reason, /taşar|sonlu/);
  // Makul büyük değer hâlâ çalışır.
  const ok = planRoute({ field: makeField(10, 10, () => 1, 1e6), start: { row: 0, col: 0 }, end: { row: 9, col: 9 } });
  assert.equal(ok.status, 'ok');
  assert.ok(Number.isFinite(ok.stats.totalCost));
});

test('düşmanca girdi: fırlatan getter istisna sızdırmaz (yapılandırılmış invalid_input)', () => {
  const f = makeField(5, 5, () => 1);
  const base = { start: { row: 0, col: 0 }, end: { row: 4, col: 4 } };
  const boom = { ...f };
  Object.defineProperty(boom, 'rows', { enumerable: true, get() { throw new Error('rows patladı'); } });
  let res;
  assert.doesNotThrow(() => { res = planRoute({ ...base, field: boom }); });
  assert.equal(res.status, 'invalid_input');
  assert.match(res.reason, /beklenmeyen hata: rows patladı/);
  assert.deepEqual(res.path, []);
  const badStart = { get row() { throw new Error('start patladı'); }, col: 0 };
  assert.doesNotThrow(() => { res = planRoute({ field: f, start: badStart, end: base.end }); });
  assert.equal(res.status, 'invalid_input');
  const badBudget = { get maxMs() { throw new Error('budget patladı'); } };
  assert.doesNotThrow(() => { res = planRoute({ ...base, field: f, budget: badBudget }); });
  assert.equal(res.status, 'invalid_input');
  const throwingArgs = { get field() { throw new Error('args patladı'); } };
  assert.doesNotThrow(() => { res = planRoute(throwingArgs); });
  assert.equal(res.status, 'invalid_input');
  assert.ok(deepFreezeCheck(res));
  // handlePlanMessage de yapılandırılmış sonuç döndürür (istisna veya 'error' değil).
  const out = handlePlanMessage({ type: 'plan', id: 3, field: boom, ...base });
  assert.equal(out.type, 'result');
  assert.equal(out.result.status, 'invalid_input');
});

function fakeWorkerScope() {
  const posted = [];
  return { posted, postMessage(m) { posted.push(m); } };
}

test('worker: attachWorker mesajı gidiş-dönüş işler', async () => {
  const { attachWorker } = await import('../public/js/route/pathfinder.worker.js');
  assert.equal(attachWorker(null), false);
  assert.equal(attachWorker({}), false);
  const scope = fakeWorkerScope();
  assert.equal(attachWorker(scope), true);
  const f = makeField(10, 10, () => 1);
  scope.onmessage({ data: { type: 'plan', id: 9, field: f, start: { row: 0, col: 0 }, end: { row: 9, col: 9 } } });
  assert.equal(scope.posted.length, 1);
  assert.equal(scope.posted[0].type, 'result');
  assert.equal(scope.posted[0].id, 9);
  assert.equal(scope.posted[0].result.status, 'ok');
  scope.onmessage({ data: { type: 'nope', id: 10 } });
  assert.equal(scope.posted[1].type, 'error');
});

test('worker içe aktarma: WorkerGlobalScope yoksa (window/ana iş parçacığı) onmessage bağlanmaz', async () => {
  const saved = { self: Object.getOwnPropertyDescriptor(globalThis, 'self'), wgs: Object.getOwnPropertyDescriptor(globalThis, 'WorkerGlobalScope') };
  try {
    const fakeSelf = fakeWorkerScope();
    fakeSelf.onmessage = 'mevcut-window-isleyicisi';
    Object.defineProperty(globalThis, 'self', { value: fakeSelf, configurable: true, writable: true });
    delete globalThis.WorkerGlobalScope;
    await import('../public/js/route/pathfinder.worker.js?no-wgs');
    assert.equal(fakeSelf.onmessage, 'mevcut-window-isleyicisi', 'ana iş parçacığında ezilmemeli');
    // WorkerGlobalScope tanımlı ama self onun örneği değil: yine bağlanmaz.
    globalThis.WorkerGlobalScope = class FakeWGS {};
    await import('../public/js/route/pathfinder.worker.js?not-instance');
    assert.equal(fakeSelf.onmessage, 'mevcut-window-isleyicisi');
  } finally {
    for (const [k, d] of [['self', saved.self], ['WorkerGlobalScope', saved.wgs]]) {
      if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
    }
  }
});

test('worker içe aktarma: sahte WorkerGlobalScope içinde bağlanır ve mesaj gidiş-dönüşü çalışır', async () => {
  const saved = { self: Object.getOwnPropertyDescriptor(globalThis, 'self'), wgs: Object.getOwnPropertyDescriptor(globalThis, 'WorkerGlobalScope') };
  try {
    class FakeWGS {}
    const fakeSelf = Object.assign(new FakeWGS(), fakeWorkerScope());
    Object.defineProperty(globalThis, 'WorkerGlobalScope', { value: FakeWGS, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'self', { value: fakeSelf, configurable: true, writable: true });
    await import('../public/js/route/pathfinder.worker.js?with-wgs');
    assert.equal(typeof fakeSelf.onmessage, 'function');
    const f = makeField(8, 8, () => 1);
    fakeSelf.onmessage({ data: { type: 'plan', id: 77, field: f, start: { row: 0, col: 0 }, end: { row: 7, col: 7 }, options: { smooth: true } } });
    assert.equal(fakeSelf.posted.length, 1);
    assert.equal(fakeSelf.posted[0].id, 77);
    assert.equal(fakeSelf.posted[0].result.status, 'ok');
  } finally {
    for (const [k, d] of [['self', saved.self], ['WorkerGlobalScope', saved.wgs]]) {
      if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
    }
  }
});

test('worker dosyası Node içinde (self/WorkerGlobalScope yok) sorunsuz içe aktarılır', async () => {
  assert.equal(typeof globalThis.WorkerGlobalScope, 'undefined');
  const mod = await import('../public/js/route/pathfinder.worker.js?plain-node');
  assert.equal(typeof mod.attachWorker, 'function');
});

test('performans: 1676x1135 açık rastgele maliyet alanı', () => {
  const rows = 1135, cols = 1676;
  const rnd = mulberry32(2026);
  const f = makeField(rows, cols, () => 1 + rnd() * 3, 1);
  const s = { row: 20, col: 20 }, e = { row: rows - 20, col: cols - 20 };
  const full = planRoute({ field: f, start: s, end: e });
  assert.equal(full.status, 'ok');
  const hier = planRoute({ field: f, start: s, end: e, options: { hierarchical: true } });
  assert.equal(hier.status, 'ok');
  const auto = planRoute({ field: f, start: s, end: e, options: { hierarchical: 'auto' } });
  assert.equal(auto.algorithm.hierarchical, true);
  assert.equal(hier.stats.impassableCrossings, 0);
  console.log(`PERF tam: ${full.stats.elapsedMs.toFixed(0)} ms, genişletme ${full.stats.cellsExpanded}, maliyet ${full.stats.totalCost.toFixed(1)}`);
  console.log(`PERF hiyerarşik: ${hier.stats.elapsedMs.toFixed(0)} ms, genişletme ${hier.stats.cellsExpanded}, maliyet ${hier.stats.totalCost.toFixed(1)}, oran ${(hier.stats.totalCost / full.stats.totalCost).toFixed(4)}`);
  // Ölçülen: tam ~530 ms, hiyerarşik ~45 ms, oran 1.0119, genişletme 1.71 M / 119 K. Sınırlar ~2x-5x gevşek (yavaş CI payı).
  assert.ok(hier.stats.totalCost / full.stats.totalCost < 1.025, `oran ${hier.stats.totalCost / full.stats.totalCost}`);
  assert.ok(hier.stats.cellsExpanded < full.stats.cellsExpanded * 0.15);
  assert.ok(full.stats.elapsedMs < 3000, `tam A* ${full.stats.elapsedMs} ms`);
  assert.ok(hier.stats.elapsedMs < full.stats.elapsedMs * 0.5, 'hiyerarşik belirgin biçimde daha hızlı olmalı');
});
