// Minimap altına konacak yatay görüş modu segment çubuğu (radio mantığı: aynı anda tek mod) + aktif mod için legend şeridi.
// Yalnız DOM sunumu; mod hesabı view-modes.js'te. Temel sınıflar `mw-holo-bar`, ek stil `mw-vm-*` (css/view-modes.css).
import { VIEW_MODES, DEFAULT_MODE_ID, legendFor, nextMode, rampCssGradient } from './view-modes.js';

const BADGE = Object.freeze({ 'scenario-model': 'model', 'unavailable-data': 'veri yok' });

export function createViewModeBar({ root, onChange = () => {}, initial = DEFAULT_MODE_ID } = {}) {
  if (!root || typeof root.appendChild !== 'function') throw new Error('createViewModeBar: root HTMLElement gerekli');
  const doc = root.ownerDocument;
  let current = nextMode(DEFAULT_MODE_ID, initial);
  let rangeText = null;

  const bar = doc.createElement('div');
  bar.className = 'mw-holo-bar mw-vm-bar';
  bar.setAttribute('role', 'radiogroup');
  bar.setAttribute('aria-label', 'Görüş modu');
  const buttons = new Map();
  for (const m of VIEW_MODES) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'mw-holo-bar__btn mw-vm-btn';
    b.dataset.mode = m.id;
    b.dataset.basis = m.dataBasis;
    b.setAttribute('role', 'radio');
    b.title = `${m.label}: ${m.description}`;
    const text = doc.createElement('span');
    text.className = 'mw-vm-btn__label';
    text.textContent = m.shortLabel;
    b.appendChild(text);
    const badge = BADGE[m.dataBasis];
    if (badge) {
      const s = doc.createElement('span');
      s.className = 'mw-vm-badge';
      s.textContent = badge;
      b.appendChild(s);
    }
    b.addEventListener('click', () => setMode(m.id, true));
    buttons.set(m.id, b);
    bar.appendChild(b);
  }

  const legend = doc.createElement('div');
  legend.className = 'mw-vm-legend';
  const ramp = doc.createElement('div');
  ramp.className = 'mw-vm-legend__ramp';
  const lmin = doc.createElement('span'); lmin.className = 'mw-vm-legend__min';
  const lmax = doc.createElement('span'); lmax.className = 'mw-vm-legend__max';
  const rampRow = doc.createElement('div'); rampRow.className = 'mw-vm-legend__row';
  rampRow.append(lmin, ramp, lmax);
  const note = doc.createElement('div'); note.className = 'mw-vm-legend__note';
  legend.append(rampRow, note);
  root.append(bar, legend);

  function refresh() {
    for (const [id, b] of buttons) {
      const on = id === current;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    const leg = legendFor(current);
    const grad = rampCssGradient(current);
    legend.hidden = current === 'normal';
    rampRow.hidden = !grad;
    if (grad) ramp.style.background = grad;
    lmin.textContent = rangeText?.min ?? 'düşük';
    lmax.textContent = rangeText?.max ?? 'yüksek';
    note.textContent = [leg.label, leg.disclaimer].filter(Boolean).join(' - ');
    legend.dataset.mode = current;
    note.title = note.textContent;
  }

  function setMode(id, notify = false) {
    const next = nextMode(current, id);
    const changed = next !== current;
    current = next;
    if (changed) rangeText = null;
    refresh();
    if (changed && notify) onChange(current);
  }

  refresh();
  return {
    setMode: (id) => setMode(id, false),
    getMode: () => current,
    /** Aktif modun alanı hazır olunca min/max etiketlerini günceller (isteğe bağlı). field = computeModeField sonucu. */
    setField(field) {
      rangeText = field ? { min: `${+field.min.toPrecision(4)}`, max: `${+field.max.toPrecision(4)}${field.legend?.unit ? ' ' + field.legend.unit : ''}` } : null;
      refresh();
    },
    destroy() { bar.remove(); legend.remove(); buttons.clear(); },
  };
}
