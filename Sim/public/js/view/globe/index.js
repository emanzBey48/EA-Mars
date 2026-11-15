// Mars küresi giriş ekranı. Kullanım: createGlobeScreen({ root, onSimulate, getEtaMinutes }) -> { show, hide, dispose }
// Doku: USGS Astrogeology Viking MDIM 2.1 renkli mozaik (ortogörüntü değil). Konumlar yaklaşıktır.
import { createGlobe } from './globe.js';
import { createGlobePanel } from './globe-panel.js';
import { REGIONS, REGION_TYPES, findRegionAt, typeLabel } from './regions.js';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createGlobeScreen({ root, onSimulate, getEtaMinutes = () => null, dataBase = '/data/viking-mdim', regions = REGIONS }) {
  const screen = h('div', 'mw-globe-screen mw-globe-screen--hidden');
  const canvas = h('canvas', 'mw-globe-canvas');
  const title = h('div', 'mw-globe-title');
  title.append(h('strong', '', 'MARSWALK'), h('span', '', 'Bir bölge seçin: önce başlangıç, sonra varış'));
  const hint = h('div', 'mw-globe-hint', 'Sürükle: döndür · Tekerlek: yakınlaştır · Tıkla: başlangıç / varış');
  const tip = h('div', 'mw-globe-tip'); tip.hidden = true;
  const tipName = h('strong'), tipType = h('span'), tipNote = h('em', '', 'yaklaşık, sunum amaçlı');
  tip.append(tipName, tipType, tipNote);
  screen.append(canvas, title, hint, tip);
  root.appendChild(screen);

  const state = { start: null, end: null, busy: false, disposed: false };
  let globe = null, errorEl = null;
  try {
    globe = createGlobe({ canvas, dataBase, onPick, onHover });
  } catch (e) {
    errorEl = h('div', 'mw-globe-error', `Küre gösterilemedi (${e.message}). WebGL gerekli.`);
    screen.appendChild(errorEl);
  }

  const panel = createGlobePanel({
    parent: screen, regions, regionTypes: REGION_TYPES, getEtaMinutes,
    onClear: (which) => { state[which] = null; syncMarkers(); },
    onSimulate: (sel) => simulate(sel),
  });

  function syncMarkers() { globe?.setMarkers({ start: state.start, end: state.end }); }

  function onHover(p) {
    const m = p ? findRegionAt(p.lat, p.lon, { regions }) : null;
    globe?.setAutoRotatePaused(!!m);
    if (!m) { tip.hidden = true; return; }
    tipName.textContent = m.region.name;
    tipType.textContent = typeLabel(m.region.type);
    tip.hidden = false;
    const r = screen.getBoundingClientRect();
    tip.style.left = `${p.clientX - r.left + 16}px`; tip.style.top = `${p.clientY - r.top + 16}px`;
  }

  function onPick(p) {
    if (state.busy) return;
    const m = findRegionAt(p.lat, p.lon, { regions });
    if (!m) return;
    const r = m.region;
    // 1. tıklama başlangıç, 2. varış; sonraki tıklamalar varışı değiştirir.
    if (!state.start) { state.start = r; panel.setStart(r); }
    else { state.end = r; panel.setEnd(r); }
    syncMarkers();
  }

  async function simulate(selection) {
    if (state.busy || !selection.start || !selection.end) return;
    state.busy = true;
    panel.hide();
    const target = selection.end;
    await Promise.all([
      globe ? globe.flyTo(target.lat, target.lon, 1200) : new Promise((r) => setTimeout(r, 1200)),
      new Promise((r) => setTimeout(r, 600)),
    ]);
    if (state.disposed) return;
    state.busy = false;
    onSimulate?.(selection);
  }

  return {
    show() { screen.classList.remove('mw-globe-screen--hidden'); globe?.setActive(true); requestAnimationFrame(() => panel.show()); },
    hide() { screen.classList.add('mw-globe-screen--hidden'); panel.hide(); globe?.setActive(false); tip.hidden = true; },
    dispose() { state.disposed = true; globe?.dispose(); panel.dispose(); screen.remove(); },
  };
}
