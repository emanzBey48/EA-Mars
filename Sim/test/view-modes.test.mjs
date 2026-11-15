import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEW_MODES, VIEW_MODE_IDS, nextMode, computeModeField, marchingSquares, buildContours, drawModeOverlay, legendFor,
} from '../public/js/view/minimap/view-modes.js';

function makeGrid(rows, cols, fn, { noData = () => false } = {}) {
  const elevation = new Float32Array(rows * cols), validMask = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (noData(r, c)) { elevation[i] = -3.4e38; validMask[i] = 0; } else { elevation[i] = fn(r, c); validMask[i] = 1; }
  }
  return { rows, cols, cellSizeM: 1, nwXM: 100, nwYM: 200, elevation, validMask };
}

test('mod listesi: 8 mod, dürüst dataBasis, "güvenli" kelimesi yok', () => {
  assert.equal(VIEW_MODES.length, 8);
  const bases = new Set(['real-dtm', 'scenario-model', 'unavailable-data']);
  for (const m of VIEW_MODES) {
    assert.ok(bases.has(m.dataBasis), m.id);
    assert.doesNotMatch(`${m.label} ${m.description} ${JSON.stringify(legendFor(m.id))}`, /güvenli/i);
  }
  assert.equal(VIEW_MODES.find((m) => m.id === 'chemical').dataBasis, 'unavailable-data');
  assert.equal(VIEW_MODES.find((m) => m.id === 'thermal').dataBasis, 'scenario-model');
});

test('exclusivity: nextMode geçerli kimliği seçer, geçersizde mevcut modu korur', () => {
  assert.equal(nextMode('normal', 'thermal'), 'thermal');
  assert.equal(nextMode('thermal', 'bogus'), 'thermal');
  assert.equal(nextMode('bogus', 'bogus'), 'normal');
  assert.equal(nextMode('thermal', undefined), 'thermal');
  assert.ok(VIEW_MODE_IDS.includes(nextMode('x', 'chemical')));
});

test('kontur: rampa DEM beklenen sayıda çizgi üretir', () => {
  // z = col (0..19): seviyeler 0.5,1.5.. her biri 1 dikey çizgi; yükseklik 19 satır aralığı -> 18 kare satırı
  const g = makeGrid(20, 20, (r, c) => c);
  const out = marchingSquares(Float32Array.from(g.elevation), 20, 20, [4.5, 10.5]);
  assert.equal(out.length, 2);
  for (const l of out) assert.equal(l.segs.length / 4, 19); // rows-1 segment
  const b = buildContours(Float32Array.from(g.elevation), 20, 20, { interval: 5 });
  assert.deepEqual(b.lines.map((l) => l.level), [0, 5, 10, 15]);
  assert.ok(b.lines.find((l) => l.level === 0).major && !b.lines.find((l) => l.level === 5).major);
  // seviye 0 -> x=0.5 (>=0 her yerde) segment yok? c>=0 hepsi >= 0: code 15 atlanır
  assert.equal(b.lines.find((l) => l.level === 0).segs.length, 0);
});

test('kontur: no-data hücreden çizgi geçmez', () => {
  const g = makeGrid(20, 20, (r, c) => c, { noData: (r, c) => c >= 9 && c <= 11 && r >= 8 && r <= 12 });
  const f = computeModeField('topographic', { grid: g });
  for (const l of f.contours.lines) {
    for (let i = 0; i < l.segs.length; i += 2) {
      const x = l.segs[i], y = l.segs[i + 1];
      // no-data bölgesi içinde (hücre merkezleri 9..11 x 8..12) kalan karelerin hiçbir noktası olmamalı
      const inside = x > 9.5 - 1 && x < 11.5 + 1 && y > 8.5 - 1 && y < 12.5 + 1 && x >= 9.5 - 0.5 && x <= 11.5 + 0.5 && y >= 8.5 - 0.5 && y <= 12.5 + 0.5;
      assert.equal(inside, false, `segment no-data içinde: ${x},${y}`);
    }
  }
  assert.ok(f.contours.lines.some((l) => l.segs.length > 0));
});

test('computeModeField: şekiller, min<=max, NaN yok (geçerli hücrelerde), no-data NaN kalır', () => {
  const g = makeGrid(16, 24, (r, c) => 10 + 0.3 * c + 0.2 * r + Math.sin(c) * 0.1, { noData: (r, c) => r === 5 && c === 6 });
  assert.equal(computeModeField('normal', { grid: g }), null);
  assert.equal(computeModeField('optical', { grid: g }), null);
  assert.equal(computeModeField('chemical', { grid: g }), null);
  for (const mode of ['thermal', 'topographic', 'geophysical', 'atmospheric', 'radiation']) {
    const f = computeModeField(mode, { grid: g });
    assert.equal(f.width, 24); assert.equal(f.height, 16);
    assert.equal(f.values.length, 16 * 24);
    assert.ok(f.min <= f.max, mode);
    assert.ok(Number.isFinite(f.min) && Number.isFinite(f.max));
    assert.ok(Number.isNaN(f.values[5 * 24 + 6]), `${mode}: no-data NaN`);
    let valid = 0;
    for (let i = 0; i < f.values.length; i++) if (!Number.isNaN(f.values[i])) valid++;
    assert.equal(valid, 16 * 24 - 1, `${mode}: geçerli hücre sayısı`);
    assert.ok(f.legend.label && f.legend.disclaimer);
    assert.equal(computeModeField(mode, { grid: g }), f, 'önbellek aynı nesneyi döndürür');
  }
});

test('thermal: güneşe bakan yamaç daha sıcak, gece sıfır; geofizik pürüzlülük düz alanda 0', () => {
  const g = makeGrid(12, 12, (r, c) => c * 0.5); // doğuya doğru yükselir -> batıya bakan yamaç
  const lowSun = computeModeField('thermal', { grid: g, sunElevationDeg: 20, timeOfDayHour: 16 }); // batı güneşi
  const eastSun = computeModeField('thermal', { grid: g, sunElevationDeg: 20, timeOfDayHour: 8 });
  const mid = 6 * 12 + 6;
  assert.ok(lowSun.values[mid] > eastSun.values[mid]);
  const night = computeModeField('thermal', { grid: g, sunElevationDeg: -5, timeOfDayHour: 22 });
  assert.equal(night.max, 0);
  const flat = makeGrid(8, 8, () => 5);
  assert.equal(computeModeField('geophysical', { grid: flat }).max, 0);
});

test('drawModeOverlay: sahte ctx ile hata vermez; chemical hatch + etiket, uydurma değer yok', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'measureText' ? () => ({ width: 50 }) : (...a) => { calls.push([p, a]); }), set: () => true });
  const g = makeGrid(10, 10, (r, c) => c);
  const proj = (x, y) => [(x - 100) * 10, (200 - y) * 10];
  drawModeOverlay(ctx, { mode: 'chemical', field: null, projectToCanvas: proj, canvasW: 200, canvasH: 200, bounds: { nwXM: 100, nwYM: 200, widthM: 10, heightM: 10 } });
  assert.ok(calls.some(([n, a]) => n === 'fillText' && /Kimyasal harita verisi yok/.test(a[0])));
  calls.length = 0;
  const f = computeModeField('topographic', { grid: g });
  drawModeOverlay(ctx, { mode: 'topographic', field: f, projectToCanvas: proj, canvasW: 200, canvasH: 200 });
  assert.ok(calls.some(([n]) => n === 'stroke'));
  assert.throws(() => computeModeField('nope', { grid: g }));
});
