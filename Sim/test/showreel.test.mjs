import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowreel, buildDefaultShowreelSteps } from '../public/js/app/showreel.js';

function fakeClock() {
  const waits = [];
  return { waits, now: () => 0, wait: async (ms) => { waits.push(ms); } };
}

test('adımlar sırayla çalışır ve bekleme uygulanır', async () => {
  const log = [], clock = fakeClock(), events = [];
  const steps = [
    { id: 'a', label: 'A', waitMs: 10, run: async () => { log.push('a'); } },
    { id: 'b', label: 'B', waitMs: 0, run: async () => { log.push('b'); } },
  ];
  const r = createShowreel({ steps, clock, onStep: (e) => events.push(`${e.id}:${e.status}`) });
  assert.equal(await r.start(), true);
  assert.deepEqual(log, ['a', 'b']);
  assert.deepEqual(clock.waits, [10]);
  assert.equal(r.isRunning(), false);
  assert.equal(events.at(-1), 'null:finished');
});

test('stop() gösteriyi iptal eder', async () => {
  const log = [];
  let r;
  const clock = { now: () => 0, wait: async () => { r.stop(); } };
  const steps = [
    { id: 'a', waitMs: 5, run: async () => { log.push('a'); } },
    { id: 'b', waitMs: 0, run: async () => { log.push('b'); } },
  ];
  r = createShowreel({ steps, clock });
  assert.equal(await r.start(), false);
  assert.deepEqual(log, ['a']);
  assert.equal(r.isRunning(), false);
});

test('hata olursa durur ve bildirir', async () => {
  const log = [], events = [];
  const steps = [
    { id: 'a', waitMs: 0, run: async () => { throw new Error('boom'); } },
    { id: 'b', waitMs: 0, run: async () => { log.push('b'); } },
  ];
  const r = createShowreel({ steps, clock: fakeClock(), onStep: (e) => events.push(e) });
  assert.equal(await r.start(), false);
  assert.deepEqual(log, []);
  const err = events.find((e) => e.status === 'error');
  assert.equal(err.id, 'a');
  assert.equal(err.error.message, 'boom');
  assert.equal(r.isRunning(), false);
});

test('varsayılan adım sırası ve süreleri', async () => {
  const calls = [];
  const api = {
    globe: { pickRegion: (id, w) => calls.push(`pick:${id}:${w}`), simulate: () => calls.push('sim') },
    setViewMode: (m) => calls.push(`mode:${m}`),
    setAutoDrive: (b) => calls.push(`auto:${b}`),
    setAutoSpeed: (n) => calls.push(`speed:${n}`),
  };
  const steps = buildDefaultShowreelSteps(api);
  const clock = fakeClock();
  await createShowreel({ steps, clock }).start();
  assert.deepEqual(calls, [
    'pick:jezero:start', 'pick:olympus:end', 'sim', 'auto:true',
    'mode:topo', 'mode:thermal', 'mode:radiation', 'mode:normal', 'speed:3', 'auto:false',
  ]);
  assert.deepEqual(clock.waits, [3000, 2000, 6000, 4000, 4000, 3000, 5000]);
});

test('eksik api adımları atlanır, hata vermez', async () => {
  const calls = [];
  const steps = buildDefaultShowreelSteps({ setViewMode: (m) => calls.push(m) });
  assert.ok(steps.every((s) => !/pick|simulate|auto|speed/.test(s.id)));
  assert.equal(await createShowreel({ steps, clock: fakeClock() }).start(), true);
  assert.deepEqual(calls, ['topo', 'thermal', 'radiation', 'normal']);
  assert.doesNotThrow(() => buildDefaultShowreelSteps());
});
