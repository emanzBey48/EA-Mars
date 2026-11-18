// Mars küresi giriş ekranı. Kullanım: createGlobeScreen({ root, onSimulate, getEtaMinutes }) -> { show, hide, dispose }
// Doku: USGS Astrogeology Viking MDIM 2.1 renkli mozaik (ortogörüntü değil). Konumlar yaklaşıktır.
import { createGlobe } from './globe.js';
import { createGlobePanel } from './globe-panel.js';
import { REGIONS, REGION_TYPES, findRegionAt, typeLabel } from './regions.js';
import { makeFreePoint, hoverLabel } from './free-point.js';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createGlobeScreen({ root, onSimulate, getEtaMinutes = () => null, dataBase = 'data/viking-mdim', regions = REGIONS, onUnavailable = null }) {
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
  let globe = null, unavailable = false;
  try {
    globe = createGlobe({ canvas, dataBase, onPick, onHover });
  } catch (e) {
    unavailable = true; // WebGL yok/başlatılamadı: ekran uygulamayı örtmez
    try { console.info('[globe] kullanılamıyor:', e?.message); } catch { /* yok say */ }
  }
  if (unavailable) {
    screen.remove();
    try { onUnavailable?.(); } catch { /* yok say */ }
    return { unavailable: true, pickRegion() {}, simulate() { return Promise.resolve(); }, show() {}, hide() {}, dispose() { state.disposed = true; } };
  }

  const panel = createGlobePanel({
    parent: screen, regions, regionTypes: REGION_TYPES, getEtaMinutes,
    onClear: (which) => { state[which] = null; syncMarkers(); },
    onSimulate: (sel) => simulate(sel),
  });

  function syncMarkers() { globe?.setMarkers({ start: state.start, end: state.end }); }

  function onHover(p) {
    const m = p ? findRegionAt(p.lat, p.lon, { regions }) : null;
    // Dönen küre üzerinde hover/tıklama dönüş matrisiyle doğru lat/lon bulur; hover dönüşü durdurmaz.
    if (!p) { tip.hidden = true; return; }
    const lab = hoverLabel(p.lat, p.lon, m, typeLabel);
    tipName.textContent = lab.name;
    tipType.textContent = lab.detail;
    tip.hidden = false;
    const r = screen.getBoundingClientRect();
    // Imleç sağ kenara/panele yakınsa ipucu imlecin soluna açılır (panel altında kesilmesin).
    const x = p.clientX - r.left, y = p.clientY - r.top;
    const flip = x > r.width - 640;
    tip.style.left = flip ? `${Math.max(8, x - 16 - tip.offsetWidth)}px` : `${x + 16}px`;
    tip.style.top = `${Math.min(r.height - tip.offsetHeight - 8, y + 16)}px`;
  }

  function onPick(p) {
    if (state.busy) return;
    // Serbest nokta: isimli bölgeye yapışmadan tam tıklanan lat/lon.
    const r = makeFreePoint(p.lat, p.lon, regions);
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
    pickRegion(id, which) {
      if (state.busy) return;
      const r = regions.find((x) => x.id === id);
      if (!r) return;
      if (which === 'start') { state.start = r; panel.setStart(r); }
      else if (which === 'end') { state.end = r; panel.setEnd(r); }
      else return;
      syncMarkers();
    },
    simulate() { return simulate({ start: state.start, end: state.end }); },
    show() { screen.classList.remove('mw-globe-screen--hidden'); globe?.resetView(); globe?.setActive(true); requestAnimationFrame(() => panel.show()); },
    hide() { screen.classList.add('mw-globe-screen--hidden'); panel.hide(); globe?.setActive(false); tip.hidden = true; },
    dispose() { state.disposed = true; globe?.dispose(); panel.dispose(); screen.remove(); },
  };
}
