// Astronot kaskı içinden bakış katmanı (saf sunum; simülasyon kuralı yok).
// Uyarılar "planlama göstergesi" dilindedir; güvenli rota iddiası içermez.

export const WARNING_DEFAULT_TTL_MS = 6000;

/** Uyarı seçeneklerini normalize eder (saf). */
export function resolveWarning(text, opts = {}) {
  const level = opts.level === 'warn' ? 'warn' : 'info';
  const t = Number(opts.ttlMs);
  const ttlMs = Number.isFinite(t) && t > 0 ? Math.min(t, 60000) : WARNING_DEFAULT_TTL_MS;
  const clean = String(text ?? '').trim();
  return { text: clean, level, ttlMs, visible: clean.length > 0 };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const RIVETS = [[4, 6], [96, 6], [4, 94], [96, 94], [50, 2.2], [14, 98], [86, 98]];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildFrame() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'mw-helmet-frame');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <linearGradient id="mwHelmetGold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#b8892f" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#e8c36a" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#b8892f" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="mwHelmetNeck" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#050607" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#050607" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path fill-rule="evenodd" fill="#1b1e22"
      d="M0 0H100V100H0Z M5 7 Q5 3 10 3 H90 Q95 3 95 7 V91 Q95 96 90 96 H10 Q5 96 5 91 Z"/>
    <path fill="none" stroke="#3a4048" stroke-width="0.5"
      d="M5 7 Q5 3 10 3 H90 Q95 3 95 7 V91 Q95 96 90 96 H10 Q5 96 5 91 Z"/>
    <rect x="22" y="0" width="56" height="3.2" fill="url(#mwHelmetGold)"/>
    <rect x="0" y="86" width="100" height="14" fill="url(#mwHelmetNeck)"/>
    ${RIVETS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#4b525b"/><circle cx="${x - 0.25}" cy="${y - 0.25}" r="0.3" fill="#9aa3ad"/>`).join('')}
  `;
  return svg;
}

export function createHelmetOverlay({ root } = {}) {
  const host = root || (typeof document !== 'undefined' ? document.body : null);
  if (!host || typeof document === 'undefined') {
    const noop = () => {};
    return { show: noop, hide: noop, showWarning: noop, clearWarning: noop, setStatus: noop, dispose: noop };
  }

  const wrap = el('div', 'mw-helmet');
  wrap.hidden = true;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.append(
    el('div', 'mw-helmet-vignette'),
    el('div', 'mw-helmet-fog'),
    el('div', 'mw-helmet-glare'),
    el('div', 'mw-helmet-glow'),
    buildFrame()
  );

  const chip = el('div', 'mw-helmet-chip');
  chip.hidden = true;
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-live', 'polite');
  const status = el('div', 'mw-helmet-status');
  status.hidden = true;
  wrap.append(chip, status);
  host.appendChild(wrap);

  let timer = null;
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  function clearWarning() {
    clearTimer();
    chip.classList.remove('is-visible');
    chip.hidden = true;
  }

  function showWarning(text, opts) {
    const w = resolveWarning(text, opts);
    clearTimer();
    if (!w.visible) { clearWarning(); return; }
    chip.textContent = w.text;
    chip.dataset.level = w.level;
    chip.hidden = false;
    void chip.offsetWidth;
    chip.classList.add('is-visible');
    timer = setTimeout(clearWarning, w.ttlMs);
  }

  function setStatus(s = {}) {
    const parts = [];
    if (Number.isFinite(s.o2Pct)) parts.push(`O₂ ${Math.round(s.o2Pct)}%`);
    if (Number.isFinite(s.suitTempC)) parts.push(`Giysi ${Math.round(s.suitTempC)}°C`);
    status.textContent = parts.join('  ·  ');
    status.hidden = parts.length === 0;
  }

  return {
    show() { wrap.hidden = false; },
    hide() { wrap.hidden = true; clearWarning(); },
    showWarning,
    clearWarning,
    setStatus,
    dispose() { clearTimer(); wrap.remove(); },
  };
}
