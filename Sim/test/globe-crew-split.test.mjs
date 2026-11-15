import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTargetsAcrossCrew } from '../public/js/view/globe/crew-split.js';

const T = (id, m) => ({ id, label: id, estMinutes: m });

test('tek kişi tüm hedefleri alır', () => {
  const r = splitTargetsAcrossCrew({ targets: [T('a', 10), T('b', 20)], crewCount: 1 });
  assert.equal(r.crew.length, 1);
  assert.equal(r.crew[0].totalMinutes, 30);
  assert.equal(r.balanceRatio, 1);
});

test('LPT süreleri dengeler ve hiçbir hedef kaybolmaz', () => {
  const targets = [T('a', 50), T('b', 40), T('c', 30), T('d', 20), T('e', 10), T('f', 10)];
  const r = splitTargetsAcrossCrew({ targets, crewCount: 3 });
  const ids = r.crew.flatMap((c) => c.targets.map((t) => t.id)).sort();
  assert.deepEqual(ids, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(r.totalMinutes, 160);
  assert.ok(r.makespanMinutes <= 60, `makespan ${r.makespanMinutes}`);
  assert.ok(r.balanceRatio > 0.8 && r.balanceRatio <= 1);
});

test('hedeften fazla kişi: boş kişiler olur, balanceRatio 0', () => {
  const r = splitTargetsAcrossCrew({ targets: [T('a', 10)], crewCount: 3 });
  assert.equal(r.crew.filter((c) => c.targets.length === 0).length, 2);
  assert.equal(r.balanceRatio, 0);
});

test('hedef yoksa balanceRatio 1; girdi dizisi değişmez', () => {
  assert.equal(splitTargetsAcrossCrew({ targets: [], crewCount: 2 }).balanceRatio, 1);
  const targets = [T('a', 5), T('b', 9)];
  splitTargetsAcrossCrew({ targets, crewCount: 2 });
  assert.deepEqual(targets.map((t) => t.id), ['a', 'b']);
});

test('geçersiz girdi RangeError', () => {
  assert.throws(() => splitTargetsAcrossCrew({ targets: [], crewCount: 0 }), RangeError);
  assert.throws(() => splitTargetsAcrossCrew({ targets: [T('a', -1)], crewCount: 1 }), RangeError);
  assert.throws(() => splitTargetsAcrossCrew({ targets: [T('a', NaN)], crewCount: 1 }), RangeError);
});
