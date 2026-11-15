import test from 'node:test';
import assert from 'node:assert/strict';
import { latLonToPatchPoint, resolveSelectionPoints, pointInBounds } from '../public/js/app/free-start.js';
import { biomeFromUnit, slopeWord, biomeLabel, createBiomeTracker } from '../public/js/app/biome-label.js';
import { makeFreePoint, formatLatLon, hoverLabel, normalizeLon } from '../public/js/view/globe/free-point.js';
import { REGIONS } from '../public/js/view/globe/regions.js';

const bounds = { xMin: -100, xMax: 100, yMin: -100, yMax: 100 };
const toLocal = (lat, lon) => ({ x: Math.round((lon - 77) * 1e6) / 1e3, y: Math.round((lat - 18) * 1e6) / 1e3 });
const defaults = { start: { xM: -50, yM: -50 }, end: { xM: 50, yM: 50 } };

test('pointInBounds ve latLonToPatchPoint', () => {
  assert.equal(pointInBounds(0, 0, bounds), true);
  assert.equal(pointInBounds(95, 0, bounds, 20), false);
  assert.deepEqual(latLonToPatchPoint(18.01, 77.02, { toLocal, bounds }), { xM: 20, yM: 10 });
  assert.equal(latLonToPatchPoint(30, 77, { toLocal, bounds }), null);
  assert.equal(latLonToPatchPoint(18, 77, { toLocal, bounds, isValidAt: () => false }), null);
});

test('resolveSelectionPoints: serbest nokta yama içinde kullanılır, dışı varsayılan, isimli bölge varsayılan', () => {
  const free = (lat, lon) => ({ regionId: null, name: 'x', lat, lon });
  let r = resolveSelectionPoints({ start: free(18.0, 77.0), end: free(18.04, 77.04) }, { toLocal, bounds, defaults });
  assert.deepEqual([r.start, r.end, r.anyCustom, r.outside], [{ xM: 0, yM: 0 }, { xM: 40, yM: 40 }, true, false]);
  r = resolveSelectionPoints({ start: free(18.0, 77.0), end: free(-40, 10) }, { toLocal, bounds, defaults });
  assert.deepEqual([r.start, r.end, r.startCustom, r.endCustom, r.outside], [{ xM: 0, yM: 0 }, defaults.end, true, false, true]);
  r = resolveSelectionPoints({ start: { regionId: 'jezero', lat: 18, lon: 77 }, end: { regionId: 'gale', lat: 0, lon: 0 } }, { toLocal, bounds, defaults });
  assert.deepEqual([r.start, r.end, r.anyCustom], [defaults.start, defaults.end, false]);
});

test('resolveSelectionPoints: çok yakın başlangıç/varış varsayılan varışa döner', () => {
  const f = { regionId: null, lat: 18, lon: 77 };
  const r = resolveSelectionPoints({ start: f, end: { ...f } }, { toLocal, bounds, defaults });
  assert.deepEqual(r.end, defaults.end);
});

test('biyom eşleme ve eğim ifadesi', () => {
  assert.equal(biomeFromUnit('Jezero floor unit'), 'Krater tabanı');
  assert.equal(biomeFromUnit('Jezero fan 2 unit'), 'Antik delta');
  assert.equal(biomeFromUnit('Crater rim unit'), 'Krater kenarı');
  assert.equal(biomeFromUnit('Eolian bedform unit'), 'Kum tepeleri');
  assert.equal(biomeFromUnit('Lower etched unit'), 'Aşınmış krater zemini');
  assert.equal(biomeFromUnit('bilinmeyen'), null);
  assert.deepEqual([slopeWord(2), slopeWord(8), slopeWord(20), slopeWord(NaN)], ['düz', 'yamaç', 'dik yamaç', null]);
});

test('biomeLabel: birim yoksa null (çip yok)', () => {
  assert.equal(biomeLabel({ geology: { status: 'outside_coverage' } }), null);
  assert.equal(biomeLabel({ geology: null }), null);
  assert.equal(biomeLabel({ geology: { status: 'ok', unitName: 'zzz' } }), null);
  assert.equal(biomeLabel({ geology: { status: 'ok', unitName: 'Jezero floor unit' }, slopeDeg: 2 }).text, 'Krater tabanı · düz');
});

test('tracker: sorgu hızı sınırlı', () => {
  const t = createBiomeTracker({ minIntervalMs: 400 });
  const g = { status: 'ok', unitName: 'Jezero floor unit' };
  assert.equal(t.update({ geology: g }, 0).key, 'Krater tabanı');
  assert.equal(t.update({ geology: { status: 'outside_coverage' } }, 100).key, 'Krater tabanı'); // önbellek
  assert.equal(t.update({ geology: { status: 'outside_coverage' } }, 500), null);
});

test('serbest küre noktası: tam lat/lon, yakın bölge bağlamı, snap yok', () => {
  const p = makeFreePoint(18.4, 77.4, REGIONS);
  assert.equal(p.id, null);
  assert.equal(p.lat, 18.4); assert.equal(p.lon, 77.4);
  assert.match(p.name, /Seçilen nokta · 18\.4°K 77\.4°D \(yakın bölge: Jezero Krateri\)/);
  assert.equal(formatLatLon(-5, -120), '5.0°G 120.0°B');
  assert.equal(normalizeLon(190), -170);
  assert.deepEqual(hoverLabel(10, 20, null), { name: 'Mars yüzeyi', detail: '10.0°K 20.0°D' });
  assert.equal(hoverLabel(1, 2, { region: { name: 'A', type: 't' } }, (t) => `T:${t}`).detail, 'T:t');
});

