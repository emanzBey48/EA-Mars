// Adaptive quality governor (view/3d/quality-governor.js): pure decisions from frame intervals.
//
// What this pins: slow frames step the level down only after the hold time (and never during warm-up); fast
// frames step it up only after the recovery hold AND the minimum dwell; a single long frame is an outlier while a
// sustained slow run is counted; hidden/paused samples are ignored; a pinned mode disables stepping; steps are
// one level at a time; the decisions are deterministic; the settings tables are frozen and monotone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUALITY_GOVERNOR_DEFAULTS, QUALITY_LEVELS, QUALITY_LEVEL_SETTINGS, QUALITY_MODES, createQualityGovernor,
} from '../public/js/view/3d/quality-governor.js';
import { SHADOW_QUALITY, SHADOW_QUALITY_NAMES } from '../public/js/view/3d/shadow-map.js';

const repeat = (value, count) => Array.from({ length: count }, () => value);
const seconds = (ms, count) => ms * count / 1000;

test('sustained slow frames step down only after the hold, never during warm-up', () => {
  const g = createQualityGovernor();
  const results = [];
  for (const dt of [...repeat(16, 188), ...repeat(25, 120)]) results.push(g.update(dt));
  const { changes } = g.getState();
  assert.equal(changes.length, 1, 'exactly one step down');
  assert.equal(changes[0].from, 'high');
  assert.equal(changes[0].to, 'medium');
  assert.equal(changes[0].reason, 'frame-time-low');
  // Warm-up covers the first 3 s; the median crosses below 45 fps after ~15 slow frames; then 2 s must hold.
  assert.ok(changes[0].tS >= 5.0, `dropped too early at ${changes[0].tS}s`);
  assert.ok(changes[0].tS <= 6.5, `dropped too late at ${changes[0].tS}s`);
  assert.ok(results.slice(0, 180).every((r) => r.level === 'high' && r.reason === 'warmup'), 'warm-up holds high');
});

test('a severe run (below 35 fps) steps down after the shorter hold, still one level at a time', () => {
  const g = createQualityGovernor();
  for (const dt of repeat(16, 188)) g.update(dt);
  for (const dt of repeat(40, 200)) g.update(dt); // 25 fps: severe
  const { changes } = g.getState();
  assert.equal(changes[0].reason, 'frame-time-severe');
  assert.equal(changes[0].to, 'medium');
  // Severe hold is 1 s, the normal hold 2 s; the frame sequences differ, so the margin is checked loosely (measured ~0.8 s).
  const normal = createQualityGovernor();
  for (const dt of repeat(16, 188)) normal.update(dt);
  for (const dt of repeat(25, 200)) normal.update(dt); // 40 fps: normal hold
  assert.ok(normal.getState().changes[0].tS - changes[0].tS >= 0.5, 'the severe hold is shorter than the normal hold');
});

test('a single 300 ms spike is an outlier and does not change the level', () => {
  const g = createQualityGovernor();
  const results = [];
  for (const dt of repeat(20, 300)) results.push(g.update(dt)); // 50 fps, above the target
  results.push(g.update(300));
  for (const dt of repeat(20, 300)) results.push(g.update(dt));
  assert.equal(results.find((r) => r.reason === 'outlier')?.level, 'high', 'the spike is reported as an outlier');
  assert.equal(g.getState().changeCount, 0, 'no level change from one spike');
});

test('a sustained run of long frames is counted, not discarded as outliers', () => {
  const g = createQualityGovernor();
  for (const dt of repeat(16, 188)) g.update(dt);
  for (const dt of repeat(260, 30)) g.update(dt); // 3.8 fps for 7.8 s
  const { changes } = g.getState();
  assert.ok(changes.length >= 1, 'a real stall steps the level down');
  assert.equal(changes[0].to, 'medium');
});

test('recovery needs the recovery hold and the minimum dwell at the lower level', () => {
  const g = createQualityGovernor();
  for (const dt of repeat(16, 188)) g.update(dt);
  for (const dt of repeat(25, 120)) g.update(dt);
  const dropAt = g.getState().changes[0].tS;
  for (const dt of repeat(12, 2200)) g.update(dt); // 83 fps for ~26 s
  const { changes } = g.getState();
  assert.equal(changes.length, 2, 'one step back up');
  assert.equal(changes[1].from, 'medium');
  assert.equal(changes[1].to, 'high');
  assert.equal(changes[1].reason, 'frame-time-recovered');
  assert.ok(changes[1].tS - dropAt >= QUALITY_GOVERNOR_DEFAULTS.minDwellS, 'upgrade waits for the minimum dwell');
  assert.ok(changes[1].tS - dropAt <= QUALITY_GOVERNOR_DEFAULTS.minDwellS + 2, 'upgrade is not delayed far beyond the hold');
});

test('fast frames never climb above the best level', () => {
  const g = createQualityGovernor();
  for (const dt of repeat(8, 1500)) g.update(dt);
  assert.equal(g.getState().level, 'high');
  assert.equal(g.getState().changeCount, 0);
});

test('hidden or paused samples are not measured and restart the window', () => {
  const g = createQualityGovernor();
  for (const dt of repeat(16, 188)) g.update(dt);
  const hidden = repeat(1000, 20).map(() => g.update(1000, { hidden: true }));
  const paused = repeat(40, 200).map(() => g.update(40, { paused: true }));
  assert.ok(hidden.every((r) => r.reason === 'hidden' && !r.changed));
  assert.ok(paused.every((r) => r.reason === 'paused' && !r.changed));
  assert.equal(g.getState().changeCount, 0, 'no change from hidden or paused frames');
  assert.equal(g.getState().sampleCount, 0, 'the window restarts after a pause');
});

test('no decision during the first 3 s of accumulated frame time (warm-up)', () => {
  const g = createQualityGovernor();
  // 2.5 s of very slow frames during warm-up: no decision.
  for (const dt of repeat(100, 25)) assert.equal(g.update(dt).reason, 'warmup');
  assert.equal(g.getState().changeCount, 0);
});

test('a pinned mode disables stepping and logs the pin', () => {
  const g = createQualityGovernor({ mode: 'low' });
  assert.equal(g.getState().level, 'low');
  const results = repeat(25, 1200).map((dt) => g.update(dt));
  assert.ok(results.every((r) => r.reason === 'manual' && !r.changed));
  assert.equal(g.getState().changeCount, 0);

  g.setMode('auto');
  for (const dt of repeat(25, 400)) g.update(dt);
  assert.equal(g.getState().level, 'minimal', 'auto resumes stepping from the pinned level');

  g.setMode('medium');
  const pin = g.getState().changes.at(-1);
  assert.equal(pin.reason, 'manual');
  assert.equal(pin.to, 'medium');
});

test('pinning the current level does not log a change', () => {
  const g = createQualityGovernor();
  g.setMode('high');
  assert.equal(g.getState().changeCount, 0);
});

test('every step is exactly one level and the ladder ends at minimal', () => {
  const g = createQualityGovernor();
  for (const dt of repeat(16, 188)) g.update(dt);
  for (const dt of repeat(200, 400)) g.update(dt); // 5 fps for 80 s
  const { changes, level } = g.getState();
  assert.equal(level, 'minimal');
  assert.equal(changes.length, 3);
  changes.forEach((change, i) => {
    assert.equal(QUALITY_LEVELS.indexOf(change.to) - QUALITY_LEVELS.indexOf(change.from), 1, `step ${i} is one level`);
    if (i > 0) assert.ok(change.tS - changes[i - 1].tS >= 1.5, 'steps are spaced by the settle time');
  });
  assert.deepEqual(changes.map((c) => c.to), ['medium', 'low', 'minimal']);
});

test('the decision sequence is deterministic for the same frame sequence', () => {
  const frames = [];
  let seed = 12345;
  for (let i = 0; i < 2500; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const r = seed / 4294967296;
    frames.push({ dt: 8 + r * 60, hidden: i % 977 === 0, paused: i % 1313 === 0 && i > 0 });
  }
  const run = () => {
    const g = createQualityGovernor();
    const out = frames.map((f) => g.update(f.dt, { hidden: f.hidden, paused: f.paused }));
    return { out, state: g.getState() };
  };
  assert.deepEqual(run(), run());
});

test('getState returns copies and the change log is capped', () => {
  const g = createQualityGovernor({ thresholds: { maxChanges: 2 } });
  for (let i = 0; i < 5; i++) { g.setMode('low'); g.setMode('high'); }
  const state = g.getState();
  assert.equal(state.changes.length, 2, 'log keeps the newest two');
  assert.equal(state.changeCount, 10);
  state.changes.push({ tS: 0, from: 'x', to: 'y', reason: 'tamper' });
  state.changes[0].to = 'tampered';
  const again = g.getState();
  assert.equal(again.changes.length, 2);
  assert.ok(again.changes.every((c) => c.reason === 'manual'));
  assert.ok(again.changes.every((c) => c.to !== 'tampered'));
});

test('invalid options throw', () => {
  assert.throws(() => createQualityGovernor({ mode: 'ultra' }), RangeError);
  assert.throws(() => createQualityGovernor({ levels: ['a', 'a'] }), TypeError);
  assert.throws(() => createQualityGovernor({ levels: [] }), TypeError);
  assert.throws(() => createQualityGovernor({ thresholds: { targetFps: 30, lowFps: 40 } }), RangeError);
  assert.throws(() => createQualityGovernor({ thresholds: { windowFrames: 5, minSamples: 10 } }), RangeError);
  assert.throws(() => createQualityGovernor({ mode: 'low', levels: ['high', 'medium'] }), RangeError);
});

test('invalid frame samples are rejected without changing state', () => {
  const g = createQualityGovernor();
  assert.equal(g.update(Number.NaN).reason, 'invalid-sample');
  assert.equal(g.update(-5).reason, 'invalid-sample');
  assert.equal(g.getState().elapsedS, 0);
});

test('reset returns to automatic mode at the best level with an empty log', () => {
  const g = createQualityGovernor({ mode: 'minimal' });
  g.reset();
  assert.equal(g.getState().mode, 'auto');
  assert.equal(g.getState().level, 'high');
  assert.equal(g.getState().changeCount, 0);
});

test('level settings tables are frozen and monotone from high to minimal', () => {
  assert.ok(Object.isFrozen(QUALITY_LEVEL_SETTINGS));
  for (const name of QUALITY_LEVELS) {
    const s = QUALITY_LEVEL_SETTINGS[name];
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.detail), `${name} is frozen`);
    assert.ok(SHADOW_QUALITY_NAMES.includes(s.shadows), `${name} names a known shadow preset`);
    assert.ok(QUALITY_MODES.includes(name));
  }
  const shadowRes = QUALITY_LEVELS.map((n) => SHADOW_QUALITY[QUALITY_LEVEL_SETTINGS[n].shadows].resolution);
  assert.ok(shadowRes.every((r, i) => i === 0 || r <= shadowRes[i - 1]), 'shadow resolution never rises as quality drops');
  for (const key of ['micro', 'pebbles', 'rocks', 'craters', 'dust']) {
    const gains = QUALITY_LEVELS.map((n) => QUALITY_LEVEL_SETTINGS[n].detail[key]);
    assert.ok(gains.every((g, i) => i === 0 || g <= gains[i - 1]), `${key} gain never rises as quality drops`);
    assert.equal(gains[0], 1, `${key} is full at high`);
  }
  assert.equal(QUALITY_LEVEL_SETTINGS.high.horizon, true);
  assert.equal(QUALITY_LEVEL_SETTINGS.minimal.horizon, false, 'minimal turns the regional horizon off');
  assert.ok(QUALITY_LEVEL_SETTINGS.minimal.footprintMax > 0, 'minimal caps the footprints');
});

test('the renderer declares the governor uniforms it writes', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '..', 'public', 'js', 'view', '3d', 'renderer.js'), 'utf8');
  assert.match(source, /uniform vec4 uDetailGain;/);
  assert.match(source, /uniform float uDustGain;/);
  assert.match(source, /detailGain: uniform\('uDetailGain'\)/);
  assert.match(source, /dustGain: uniform\('uDustGain'\)/);
  assert.match(source, /setQualityLevel\(name\)/);
});
