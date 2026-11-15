import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DICT } from '../public/js/app/i18n-dict.js';
import { translate, t, getLang } from '../public/js/app/i18n.js';

test('sözlük girdileri boş değil ve anahtardan farklı (Normal/Panel istisna)', () => {
  const bad = DICT.filter(([a, b]) => !b || (a === b && !['Normal', 'Panel'].includes(a)));
  assert.deepEqual(bad, []);
});
test('şablon eşleme', () => {
  assert.equal(translate('Kişi 1/3 takip ediliyor'), 'Following person 1/3');
  assert.equal(translate('Hedef: 736 m'), 'Target: 736 m');
  assert.equal(translate('Planlama göstergesi — güvenli rota sertifikası değildir.'), 'Planning indicator — not a safe-route certificate.');
  assert.equal(translate('  Rota '), '  Route ');
});
test('TR modunda t() aynen döner', () => {
  assert.equal(getLang(), 'tr');
  assert.equal(t('Hedef: 5 m'), 'Hedef: 5 m');
});
test('index.html statik Türkçe metinlerin >= %95 kapsaması', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const strs = new Set();
  for (const m of html.matchAll(/>([^<>]+)</g)) strs.add(m[1].replace(/&amp;/g, '&').trim());
  for (const m of html.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) strs.add(m[1]);
  const tr = [...strs].filter((s) => /[çğıöşüÇĞİÖŞÜ]/.test(s));
  const missing = tr.filter((s) => translate(s) === s);
  if (missing.length) console.log('çevrilmemiş:', missing);
  assert.ok(tr.length > 20);
  assert.ok((tr.length - missing.length) / tr.length >= 0.95, `eksik: ${missing.length}/${tr.length}`);
});
