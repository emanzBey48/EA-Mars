// Quality governor stability: no flapping, spike robustness, post-upgrade lock, notifyLoadChange.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityGovernor, QUALITY_LEVEL_SETTINGS } from '../public/js/view/3d/quality-governor.js';

const repeat = (value, count) => Array.from({ length: count }, () => value);
const feed = (g, dts, ctx) => dts.map((dt) => g.update(dt, ctx));

test('a 45..55 fps band never changes the level (no flapping)', () => {
  const g = createQualityGovernor();
  feed(g, repeat(16, 200));
  // Alternate 20 ms (50 fps) and 21 ms (47.6 fps) for 5 minutes.
  const dts = [];
  for (let i = 0; i < 7000; i++) dts.push(i % 2 ? 21 : 20);
  feed(g, dts);
  assert.equal(g.getState().changeCount, 0);
});

test('load oscillating around the thresholds never steps faster than the dwell times', () => {
  const g = createQualityGovernor();
  feed(g, repeat(16, 200));
  // 12 s slow (35 fps-ish) / 12 s fast (80 fps) repeated for ~10 min.
  const dts = [];
  for (let c = 0; c < 25; c++) dts.push(...repeat(26, 460), ...repeat(12, 1000));
  feed(g, dts);
  const { changes } = g.getState();
  for (let i = 1; i < changes.length; i++) {
    const gap = changes[i].tS - changes[i - 1].tS;
    const up = changes[i].reason === 'frame-time-recovered';
    assert.ok(gap >= (up ? 15 : 4) - 0.05, `gap ${gap}s before change ${i} (${changes[i].reason})`);
  }
});

test('single spikes and a few long frames do not alter decisions', () => {
  const g = createQualityGovernor();
  const dts = [];
  for (let i = 0; i < 1500; i++) dts.push(i % 40 === 0 ? 180 : 14); // 1 in 40 frames is 180 ms; median stays 14 ms
  feed(g, dts);
  assert.equal(g.getState().changeCount, 0);
});

test('an upgrade followed by a drop locks that level against upgrades for 30 s', () => {
  const g = createQualityGovernor();
  feed(g, repeat(16, 188));
  feed(g, repeat(25, 120)); // drop to medium
  feed(g, repeat(12, 1500)); // recover to high
  assert.equal(g.getState().level, 'high');
  const upAt = g.getState().changes.at(-1).tS;
  feed(g, repeat(25, 200)); // slow again: dropped back
  const state = g.getState();
  assert.equal(state.level, 'medium');
  assert.deepEqual(state.lockedLevels, ['high']);
  const dropAt = state.changes.at(-1).tS;
  assert.ok(dropAt - upAt >= 4);
  // Fast frames immediately after: must stay at medium until the lock ends.
  let t = 0;
  while (t < 24) { g.update(12); t += 0.012; } // past the 15 s dwell + 10 s hold would be 25 s; lock ends at 30 s
  assert.equal(g.getState().level, 'medium', 'locked within 30 s of the drop');
  feed(g, repeat(12, 2500)); // another 30 s
  assert.equal(g.getState().level, 'high', 'upgrade allowed after the lock ends');
});

test('hidden, unfocused and resume frames are not measured', () => {
  const g = createQualityGovernor();
  feed(g, repeat(16, 188));
  const res = feed(g, repeat(500, 40), { focused: false });
  assert.ok(res.every((r) => r.reason === 'unfocused'));
  const first = g.update(300); // resume frame: ignored through the resume settle
  assert.equal(first.reason, 'outlier');
  assert.equal(g.update(100).reason, 'settle');
  assert.equal(g.getState().changeCount, 0);
});

test('notifyLoadChange restarts the measurement window and is optional', () => {
  const g = createQualityGovernor();
  feed(g, repeat(16, 188));
  feed(g, repeat(16, 40));
  assert.ok(g.getState().sampleCount >= 15);
  g.notifyLoadChange();
  assert.equal(g.getState().sampleCount, 0);
  assert.equal(g.getState().loadChangeCount, 1);
  // Slow frames during the settle window (helmet fade-in) do not count.
  const res = feed(g, repeat(60, 20)); // 1.2 s < 1.5 s settle
  assert.ok(res.every((r) => r.reason === 'settle'));
  assert.equal(g.getState().changeCount, 0);
  // Never calling it leaves the governor working.
  const h = createQualityGovernor();
  feed(h, [...repeat(16, 188), ...repeat(25, 200)]);
  assert.equal(h.getState().level, 'medium');
});

test('detail gains per level match the renderer uniform keys and the requested ladder', () => {
  const d = (n) => QUALITY_LEVEL_SETTINGS[n].detail;
  assert.deepEqual(Object.keys(d('high')).sort(), ['craters', 'dust', 'micro', 'pebbles', 'rocks']);
  assert.deepEqual(d('high'), { micro: 1, pebbles: 1, rocks: 1, craters: 1, dust: 1 });
  assert.ok(d('medium').pebbles < 1 && d('medium').craters < 1 && d('medium').rocks === 1);
  assert.equal(d('low').pebbles, 0.5);
  assert.equal(d('low').rocks, 0.5);
  assert.deepEqual([d('minimal').micro, d('minimal').pebbles, d('minimal').rocks, d('minimal').craters], [0, 0, 0, 0]);
});
