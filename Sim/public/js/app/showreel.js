// Tanıtım videosu için otomatik gösteri (showreel). Saf mantık: DOM/ağ yok, saat enjekte edilir.
// createShowreel({ steps, clock, onStep }) -> { start, stop, isRunning }
// Her adım: { id, label, waitMs, run: async () => void }. run bittikten sonra waitMs kadar beklenir.
// onStep({ id, label, index, total, status: 'start'|'done'|'error'|'stopped'|'finished', error? })

const defaultClock = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function createShowreel({ steps = [], clock = defaultClock, onStep = () => {} } = {}) {
  let running = false;
  let token = 0;

  function emit(info) {
    try { onStep(info); } catch { /* geri çağrı hatası gösteriyi bozmasın */ }
  }

  async function start() {
    if (running) return false;
    running = true;
    const my = ++token;
    const total = steps.length;
    const cancelled = () => my !== token;
    for (let i = 0; i < total; i++) {
      if (cancelled()) return false;
      const s = steps[i];
      const base = { id: s.id, label: s.label, index: i, total };
      emit({ ...base, status: 'start' });
      try {
        if (typeof s.run === 'function') await s.run();
        if (cancelled()) return false;
        if (s.waitMs > 0) await clock.wait(s.waitMs);
      } catch (error) {
        if (!cancelled()) { running = false; emit({ ...base, status: 'error', error }); }
        return false;
      }
      if (cancelled()) return false;
      emit({ ...base, status: 'done' });
    }
    running = false;
    emit({ id: null, label: null, index: total, total, status: 'finished' });
    return true;
  }

  function stop() {
    if (!running) return;
    token++;
    running = false;
    emit({ id: null, label: null, index: -1, total: steps.length, status: 'stopped' });
  }

  return { start, stop, isRunning: () => running };
}

// api: { globe:{pickRegion(id,'start'|'end'), simulate()}, setViewMode(id), setAutoDrive(bool), setAutoSpeed(n), wait(ms) }
// Eksik api parçası olan adım atlanır (listeye eklenmez).
export function buildDefaultShowreelSteps(api = {}) {
  const globe = api.globe ?? {};
  const has = (fn) => typeof fn === 'function';
  const steps = [];
  const add = (id, label, waitMs, run) => { steps.push({ id, label, waitMs, run }); };

  add('globe-spin', 'Küre döner', 3000, async () => {});
  if (has(globe.pickRegion)) {
    add('pick-start', 'Başlangıç: Jezero', 0, async () => { await globe.pickRegion('jezero', 'start'); });
    add('pick-end', 'Varış: Olympus Mons', 2000, async () => { await globe.pickRegion('olympus', 'end'); });
  }
  if (has(globe.simulate)) {
    add('simulate', 'Simüle et (kask içi)', 6000, async () => { await globe.simulate(); });
  }
  if (has(api.setAutoDrive)) {
    add('auto-on', 'Otomatik sürüş aç', 0, async () => { await api.setAutoDrive(true); });
  }
  if (has(api.setViewMode)) {
    for (const [mode, ms] of [['topo', 4000], ['thermal', 4000], ['radiation', 3000], ['normal', 0]]) {
      add(`mode-${mode}`, `Görünüm: ${mode}`, ms, async () => { await api.setViewMode(mode); });
    }
  }
  if (has(api.setAutoSpeed)) {
    add('speed-3x', 'Hız 3x', 5000, async () => { await api.setAutoSpeed(3); });
  }
  if (has(api.setAutoDrive)) {
    add('auto-off', 'Otomatik sürüş kapat', 0, async () => { await api.setAutoDrive(false); });
  }
  return steps;
}
