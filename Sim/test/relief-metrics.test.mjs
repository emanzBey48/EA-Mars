import test from 'node:test';
import assert from 'node:assert/strict';

import { elevationStats, slopeStats, findDepressions, findSummits, RELIEF_METRICS_SCHEMA } from '../public/js/geo/relief-metrics.js';

const ND = -9999;

/** Sentetik ızgara: `fill(r, c)` ile üretilir; cs = 1 m varsayılan. */
function grid(rows, cols, fill, extra = {}) {
  const elevation = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = fill(r, c);
  return { elevation, rows, cols, cellSizeM: 1, noDataValue: ND, ...extra };
}

/** Düz `base` yüzey; verilen (r,c,z) noktaları üzerine yazılır. */
function flatWith(rows, cols, base, overrides, extra = {}) {
  const map = new Map(overrides.map(([r, c, z]) => [r * cols + c, z]));
  return grid(rows, cols, (r, c) => (map.has(r * cols + c) ? map.get(r * cols + c) : base), extra);
}

const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≠ ${expected}`);

// ---------------------------------------------------------------- yüzdelikler ve bilinmeyen veri

test('elevationStats: tip-7 yüzdelikler ve aralık bilinen değerlerle eşleşir', () => {
  const g = grid(10, 10, (r, c) => r * 10 + c); // 0..99
  const s = elevationStats(g);
  assert.equal(s.schema, RELIEF_METRICS_SCHEMA);
  assert.equal(s.validCount, 100);
  assert.equal(s.unknownCount, 0);
  near(s.minM, 0);
  near(s.maxM, 99);
  near(s.rangeM, 99);
  near(s.p1M, 0.99);
  near(s.p50M, 49.5);
  near(s.p99M, 98.01);
  near(s.p1p99RangeM, 97.02);
});

test('elevationStats: no-data ve NaN hücreler 0 kot olarak girmez, yalnız bilinmiyor sayılır', () => {
  const g = grid(4, 4, (r, c) => (r * 4 + c === 0 || r * 4 + c === 5 ? ND : r * 4 + c === 7 ? NaN : 10 + (r * 4 + c)));
  const s = elevationStats(g);
  assert.equal(s.unknownCount, 3);
  assert.equal(s.validCount, 13);
  near(s.minM, 11); // i=1 -> 11; ne 0, ne -9999 ne de NaN
  assert.ok(s.minM > 0);
  assert.ok(s.p1M > 0);
});

test('bilinmeyen veri beyan edilmeden kabul edilmez (noDataValue veya validMin+validMax zorunlu)', () => {
  const elevation = new Float32Array([1, 2, 3, 4]);
  assert.throws(() => elevationStats({ elevation, rows: 2, cols: 2, cellSizeM: 1 }), TypeError);
  assert.throws(() => elevationStats({ elevation, rows: 2, cols: 2, cellSizeM: 1, validMin: 0 }), TypeError);
  assert.doesNotThrow(() => elevationStats({ elevation, rows: 2, cols: 2, cellSizeM: 1, validMin: 0, validMax: 10 }));
});

test('validMin/validMax dışındaki değerler bilinmiyor sayılır', () => {
  const elevation = new Float32Array([5, 6, 7, 1000]);
  const s = elevationStats({ elevation, rows: 2, cols: 2, cellSizeM: 1, validMin: 0, validMax: 10 });
  assert.equal(s.unknownCount, 1);
  near(s.maxM, 7);
});

// ---------------------------------------------------------------- eğim

test('slopeStats: 45° düzlem (dz/dx = 1 m/m) için iç hücreler 45°, kenarlar hesaplanmaz', () => {
  const s = slopeStats(grid(5, 5, (r, c) => c));
  assert.equal(s.computedCount, 9);
  assert.equal(s.uncomputedKnownCount, 16);
  near(s.p50Deg, 45, 1e-9);
  near(s.maxDeg, 45, 1e-9);
  near(s.p99Deg, 45, 1e-9);
});

test('slopeStats: ortadaki no-data her iç hücrenin 3x3 penceresine girer; eğim uydurulmaz', () => {
  const s = slopeStats(grid(5, 5, (r, c) => (r === 2 && c === 2 ? ND : c)));
  assert.equal(s.computedCount, 0);
  assert.equal(s.p50Deg, null);
  assert.equal(s.maxDeg, null);
  assert.equal(s.unknownCount, 1);
});

// ---------------------------------------------------------------- çukur

test('çukur: 5 m derin tek hücre çukur (taşma 100 m, dip 95 m)', () => {
  const g = flatWith(9, 9, 100, [[4, 4, 95]]);
  const r = findDepressions(g, { minDepthM: 1 });
  assert.equal(r.kind, 'depression');
  assert.equal(r.basins.length, 1);
  const [b] = r.basins;
  assert.equal(b.row, 4);
  assert.equal(b.col, 4);
  near(b.depthM, 5);
  near(b.minElevationM, 95);
  near(b.spillElevationM, 100);
  assert.equal(b.cellCount, 1);
  near(b.areaM2, 1);
  assert.equal(b.noDataTemasi, false);
  assert.equal(b.depthNote, null);
  assert.equal(r.counts.closedAboveThreshold, 1);
});

test('çukur: yerel koordinat pencere kuzey-batı köşesine göre hücre merkezi (x = nwX + (col+0.5)·h)', () => {
  const g = flatWith(9, 9, 100, [[4, 4, 95]], { nwXM: 1000, nwYM: 2000, cellSizeM: 2 });
  const [b] = findDepressions(g, { minDepthM: 1 }).basins;
  near(b.xM, 1000 + 4.5 * 2);
  near(b.yM, 2000 - 4.5 * 2);
  near(b.areaM2, 4);
});

test('çukur: 2x2 havza alanı ve en alçak hücre (eşitlikte satır-sütun sırası)', () => {
  const g = flatWith(9, 9, 100, [[4, 4, 95], [4, 5, 95], [5, 4, 95], [5, 5, 95]]);
  const [b] = findDepressions(g, { minDepthM: 1 }).basins;
  assert.equal(b.cellCount, 4);
  near(b.areaM2, 4);
  assert.equal(b.row, 4);
  assert.equal(b.col, 4);
});

test('düz ızgarada çukur yok', () => {
  const r = findDepressions(grid(9, 9, () => 100), { minDepthM: 0 });
  assert.equal(r.basins.length, 0);
  assert.equal(r.counts.totalBasins, 0);
});

test('kenara sızan çukur listelenmez (taşma noktası pencere kenarında)', () => {
  const g = flatWith(5, 5, 100, [[1, 1, 95]]);
  const r = findDepressions(g, { minDepthM: 1 });
  assert.equal(r.basins.length, 0);
  assert.equal(r.counts.edgeLeakingBasins, 1);
});

test('no-data adasına değen havza noDataTemasi:true ve alt sınır notu alır', () => {
  // 9x9 düz 100 m, 5 m çukur; (2,4) bilinmeyen (no-data) hücre çukurun kuzey rimi yakınında.
  const g = flatWith(9, 9, 100, [[4, 4, 95], [2, 4, ND]]);
  const r = findDepressions(g, { minDepthM: 1 });
  assert.equal(r.basins.length, 1);
  const [b] = r.basins;
  assert.equal(b.noDataTemasi, true);
  assert.equal(b.spillIntoUnknown, true);
  assert.ok(b.depthNote && b.depthNote.includes('ALT SINIR'));
  near(b.depthM, 5);
  // no-data hücresi 0'a çevrilmedi: 0 m kot hiçbir yerde görünmez.
  assert.ok(r.basins.every((x) => x.minElevationM !== 0));
});

test('minDepthM zorunlu ve negatif olamaz (varsayılan yok)', () => {
  const g = grid(5, 5, () => 100);
  assert.throws(() => findDepressions(g, {}), TypeError);
  assert.throws(() => findDepressions(g, { minDepthM: -1 }), TypeError);
  assert.throws(() => findDepressions(g), TypeError);
});

test('minDepthM monoton: artan eşik, eşit veya daha az çukur verir', () => {
  // Birbirinden ayrık 1, 2, 3, 5, 8 m çukurlar (7 m aralıklı, taşma plato 100 m).
  const pits = [[3, 3, 99], [3, 10, 98], [3, 17, 97], [10, 3, 95], [10, 10, 92]];
  const g = flatWith(21, 21, 100, pits);
  const thresholds = [0.5, 1.5, 2.5, 4, 6, 9];
  const counts = thresholds.map((t) => findDepressions(g, { minDepthM: t }).basins.length);
  assert.deepEqual(counts, [5, 4, 3, 2, 1, 0]);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
  const depths = findDepressions(g, { minDepthM: 0.5 }).basins.map((b) => b.depthM);
  assert.deepEqual(depths, [8, 5, 3, 2, 1]);
});

test('sıralama deterministik: derinlik azalan, eşitlikte satır sonra sütun artan; iki çalıştırma aynı', () => {
  const g = flatWith(15, 15, 100, [[2, 2, 96], [6, 6, 96], [12, 12, 95]]);
  const a = findDepressions(g, { minDepthM: 1 });
  const b = findDepressions(g, { minDepthM: 1 });
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.basins.map((x) => [x.row, x.col, x.depthM]),
    [[12, 12, 5], [2, 2, 4], [6, 6, 4]],
  );
});

test('çıktılar derin dondurulmuş: değiştirme denemesi TypeError verir', () => {
  const r = findDepressions(flatWith(9, 9, 100, [[4, 4, 95]]), { minDepthM: 1 });
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.basins));
  assert.ok(Object.isFrozen(r.basins[0]));
  assert.ok(Object.isFrozen(r.counts));
  assert.throws(() => { r.basins[0].depthM = 0; }, TypeError);
  assert.throws(() => { r.basins.push({}); }, TypeError);
});

// ---------------------------------------------------------------- tepe

test('tepe: 3 m belirgin tepe (zirve 103 m, geçit 100 m)', () => {
  const g = flatWith(9, 9, 100, [[4, 4, 103]]);
  const r = findSummits(g, { minProminenceM: 2 });
  assert.equal(r.kind, 'summit');
  assert.equal(r.summits.length, 1);
  const [s] = r.summits;
  assert.equal(s.row, 4);
  assert.equal(s.col, 4);
  near(s.peakElevationM, 103);
  near(s.baseElevationM, 100);
  near(s.prominenceM, 3);
  assert.equal(s.noDataTemasi, false);
});

test('tepe: minProminenceM eşiği tepeyi eler; kenara sızan tepe listelenmez', () => {
  const g = flatWith(9, 9, 100, [[4, 4, 103]]);
  assert.equal(findSummits(g, { minProminenceM: 3.5 }).summits.length, 0);
  const edge = flatWith(5, 5, 100, [[1, 1, 103]]);
  const r = findSummits(edge, { minProminenceM: 1 });
  assert.equal(r.summits.length, 0);
  assert.equal(r.counts.edgeLeakingHills, 1);
  assert.throws(() => findSummits(g, {}), TypeError);
});

test('tepe belirginliği monoton: artan eşik, daha az tepe', () => {
  const g = flatWith(21, 21, 100, [[3, 3, 101], [3, 10, 102], [3, 17, 103], [10, 3, 105], [10, 10, 108]]);
  const counts = [0.5, 1.5, 2.5, 4, 6, 9].map((t) => findSummits(g, { minProminenceM: t }).summits.length);
  assert.deepEqual(counts, [5, 4, 3, 2, 1, 0]);
});

// ---------------------------------------------------------------- eğim ve çukur birlikte

test('düz eğimli düzlemde çukur sayılmaz (tek yönlü eğim kapalı havza oluşturmaz)', () => {
  const r = findDepressions(grid(9, 9, (rr, c) => c), { minDepthM: 0.01 });
  assert.equal(r.basins.length, 0);
});
