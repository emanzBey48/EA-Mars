// Küre ekranının sağındaki seçim paneli (cam efektli). Yalnız DOM; iş mantığı crew-split/regions'tadır.
import { splitTargetsAcrossCrew } from './crew-split.js';
import { greatCircleDistanceKm, typeSafetyWeight, typeLabel } from './regions.js';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// createGlobePanel({ parent, regions, regionTypes, getEtaMinutes, onSimulate(selection), onClear(which), onChange })
// -> { el, setStart(region|null), setEnd(region|null), getSelection(), show(), hide(), dispose() }
export function createGlobePanel({ parent, regions, regionTypes, getEtaMinutes = () => null, onSimulate, onClear, onChange }) {
  const state = { start: null, end: null, types: new Set(), targetMinutes: null, crewCount: 1, mode: 'together', followIndex: 0 };
  const cleanups = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); cleanups.push(() => el.removeEventListener(ev, fn)); };

  const el = h('aside', 'mw-globe-panel mw-globe-panel--hidden');
  el.setAttribute('aria-label', 'Görev seçimi');
  el.appendChild(h('h2', 'mw-globe-panel__title', 'Görev seçimi'));

  const slot = (label, which) => {
    const row = h('div', 'mw-globe-slot');
    row.appendChild(h('span', 'mw-globe-slot__label', label));
    const name = h('span', 'mw-globe-slot__name', 'Küreden bir nokta seçin');
    const clear = h('button', 'mw-globe-link', 'temizle'); clear.type = 'button';
    on(clear, 'click', () => { state[which] = null; refresh(); onClear?.(which); onChange?.(); });
    row.append(name, clear);
    el.appendChild(row);
    return { name, clear };
  };
  const startSlot = slot('Başlangıç', 'start');
  const endSlot = slot('Varış', 'end');

  // ilgi çekici bölge türleri
  el.appendChild(h('h3', 'mw-globe-panel__h', 'İlgi çekici bölge türleri'));
  const chips = h('div', 'mw-globe-chips');
  for (const t of regionTypes) {
    const b = h('button', 'mw-globe-chip', `${t.icon} ${t.label}`);
    b.type = 'button'; b.setAttribute('aria-pressed', 'false');
    on(b, 'click', () => {
      if (state.types.has(t.id)) state.types.delete(t.id); else state.types.add(t.id);
      b.setAttribute('aria-pressed', String(state.types.has(t.id))); b.classList.toggle('is-on', state.types.has(t.id));
      refresh(); onChange?.();
    });
    chips.appendChild(b);
  }
  el.appendChild(chips);

  // süre
  el.appendChild(h('h3', 'mw-globe-panel__h', 'İstenen varış süresi (dakika)'));
  const minutes = h('input', 'mw-globe-input'); minutes.type = 'number'; minutes.min = '1'; minutes.step = '1'; minutes.placeholder = 'ör. 45';
  on(minutes, 'input', () => { const v = parseFloat(minutes.value); state.targetMinutes = Number.isFinite(v) && v > 0 ? v : null; refresh(); onChange?.(); });
  el.appendChild(minutes);
  el.appendChild(h('p', 'mw-globe-help', 'Süre öncelikli planlanır; rota istenen süreyi aşarsa kaskta bilgi uyarısı çıkar.'));

  // kişi sayısı
  el.appendChild(h('h3', 'mw-globe-panel__h', 'Kişi sayısı'));
  const stepper = h('div', 'mw-globe-stepper');
  const minus = h('button', 'mw-globe-step', '−'), plus = h('button', 'mw-globe-step', '+'), count = h('span', 'mw-globe-count', '1');
  minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'Kişi sayısını azalt'); plus.setAttribute('aria-label', 'Kişi sayısını artır');
  on(minus, 'click', () => setCrew(state.crewCount - 1)); on(plus, 'click', () => setCrew(state.crewCount + 1));
  stepper.append(minus, count, plus); el.appendChild(stepper);

  // birlikte / ayrı
  const modeRow = h('div', 'mw-globe-mode');
  const bTog = h('button', 'mw-globe-mode__btn is-on', 'Birlikte ilerle'), bSplit = h('button', 'mw-globe-mode__btn', 'Ayrı ilerle');
  bTog.type = bSplit.type = 'button';
  on(bTog, 'click', () => setMode('together')); on(bSplit, 'click', () => setMode('split'));
  modeRow.append(bTog, bSplit); el.appendChild(modeRow);

  const splitBox = h('div', 'mw-globe-split'); splitBox.hidden = true;
  const followLbl = h('label', 'mw-globe-help', 'Takip edilecek kişi');
  const follow = h('select', 'mw-globe-input'); followLbl.appendChild(follow);
  on(follow, 'change', () => { state.followIndex = parseInt(follow.value, 10) || 0; refresh(); onChange?.(); });
  const summary = h('div', 'mw-globe-summary');
  splitBox.append(followLbl, summary); el.appendChild(splitBox);

  const go = h('button', 'mw-globe-go', 'SİMÜLE ET'); go.type = 'button'; go.disabled = true;
  on(go, 'click', () => { if (!go.disabled) onSimulate?.(getSelection()); });
  el.appendChild(go);
  el.appendChild(h('p', 'mw-globe-note', 'Simülasyon sahası: Jezero HiRISE DTM (demo). Diğer bölgeler bağlam/etiket amaçlıdır.'));
  el.appendChild(h('p', 'mw-globe-credit', 'Doku: USGS Astrogeology Viking MDIM 2.1'));
  parent.appendChild(el);

  function setCrew(n) {
    state.crewCount = Math.max(1, Math.min(4, n));
    if (state.followIndex >= state.crewCount) state.followIndex = 0;
    refresh(); onChange?.();
  }
  function setMode(m) { state.mode = m; refresh(); onChange?.(); }

  function buildTargets() {
    if (!state.end) return [];
    const endMin = state.targetMinutes ?? getEtaMinutes() ?? 30;
    const targets = [{ id: state.end.id, label: `${state.end.name} (varış)`, estMinutes: endMin }];
    for (const typeId of state.types) {
      let best = null;
      for (const r of regions) {
        if (r.type !== typeId || r.id === state.end.id || (state.start && r.id === state.start.id)) continue;
        const d = greatCircleDistanceKm(r.lat, r.lon, state.end.lat, state.end.lon);
        if (!best || d < best.d) best = { r, d };
      }
      // tahmini süre: tür bağlam zorluğuna göre SENARYO PARAMETRESİ (kaynaklı değil)
      if (best) targets.push({ id: best.r.id, label: `${best.r.name} (${typeLabel(typeId)})`, estMinutes: Math.round(20 + 40 * (typeSafetyWeight[typeId] ?? 0.5)) });
    }
    return targets;
  }

  function split() {
    if (state.mode !== 'split' || state.crewCount < 2) return null;
    return splitTargetsAcrossCrew({ targets: buildTargets(), crewCount: state.crewCount });
  }

  function refresh() {
    startSlot.name.textContent = state.start ? state.start.name : 'Küreden bir nokta seçin';
    endSlot.name.textContent = state.end ? state.end.name : 'Küreden bir nokta seçin';
    startSlot.clear.hidden = !state.start; endSlot.clear.hidden = !state.end;
    count.textContent = String(state.crewCount);
    minus.disabled = state.crewCount <= 1; plus.disabled = state.crewCount >= 4;
    bTog.classList.toggle('is-on', state.mode === 'together'); bSplit.classList.toggle('is-on', state.mode === 'split');
    const sp = split();
    splitBox.hidden = !sp;
    if (sp) {
      follow.textContent = '';
      for (let i = 0; i < state.crewCount; i++) { const o = h('option', '', `Kişi ${i + 1}`); o.value = String(i); follow.appendChild(o); }
      follow.value = String(state.followIndex);
      summary.textContent = '';
      for (const c of sp.crew) {
        const row = h('div', 'mw-globe-summary__row' + (c.index === state.followIndex ? ' is-followed' : ''));
        row.appendChild(h('strong', '', `Kişi ${c.index + 1}: ~${Math.round(c.totalMinutes)} dk`));
        row.appendChild(h('span', '', c.targets.length ? c.targets.map((t) => t.label).join(', ') : '—'));
        summary.appendChild(row);
      }
      summary.appendChild(h('div', 'mw-globe-help', `Süre dengesi: ${(sp.balanceRatio * 100).toFixed(0)}% (en kısa/en uzun). Tahminler senaryo parametresidir, kaynaklı değil.`));
    }
    const same = state.start && state.end && state.start.id !== null && state.start.id === state.end.id;
    go.disabled = !(state.start && state.end) || same;
    go.title = same ? 'Başlangıç ve varış farklı olmalı' : '';
  }

  function getSelection() {
    const sp = split();
    const pt = (r) => (r ? { regionId: r.id, name: r.name, lat: r.lat, lon: r.lon } : null);
    return {
      start: pt(state.start), end: pt(state.end),
      regionTypes: [...state.types],
      targetMinutes: state.targetMinutes,
      crew: {
        count: state.crewCount, mode: state.mode, followIndex: state.followIndex,
        assignments: sp ? sp.crew.map((c) => ({ person: c.index + 1, targets: c.targets, totalMinutes: c.totalMinutes })) : null,
        balanceRatio: sp ? sp.balanceRatio : null,
      },
    };
  }

  refresh();
  return {
    el,
    setStart(r) { state.start = r; refresh(); onChange?.(); },
    setEnd(r) { state.end = r; refresh(); onChange?.(); },
    getSelection,
    show() { el.classList.remove('mw-globe-panel--hidden'); },
    hide() { el.classList.add('mw-globe-panel--hidden'); },
    dispose() { cleanups.forEach((f) => f()); el.remove(); },
  };
}
