// Otomatik sürüş paneli (sağ alt). Zaman kontrolleri yalnız otomatik açıkken görünür.

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 10;
export const SPEED_STEP = 0.5;

/** Hız çarpanını 0.5..10 aralığına kenetler ve 0.5 adıma yuvarlar (saf). */
export function clampSpeedMultiplier(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  const stepped = Math.round(v / SPEED_STEP) * SPEED_STEP;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, stepped));
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createAutoDriveControls({ root, onAutoToggle, onSpeed, onPause, onReroute } = {}) {
  const host = root || document.body;
  let autoOn = false;
  let paused = false;
  let speed = 1;

  const panel = el('div', 'mw-auto-panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Otomatik sürüş kontrolleri');

  const autoBtn = el('button', 'mw-auto-btn mw-auto-toggle', 'Otomatik sürüş: Kapalı');
  autoBtn.type = 'button';
  autoBtn.setAttribute('aria-pressed', 'false');
  autoBtn.setAttribute('aria-label', 'Otomatik sürüşü aç veya kapat');

  const rerouteBtn = el('button', 'mw-auto-btn mw-auto-reroute', 'Rotayı konumdan yeniden çiz');
  rerouteBtn.type = 'button';
  rerouteBtn.setAttribute('aria-label', 'Rotayı mevcut konumdan yeniden çiz');

  const time = el('div', 'mw-auto-time');
  const label = el('label', 'mw-auto-speed-label');
  label.htmlFor = 'mw-auto-speed';
  label.textContent = 'Zaman hızı ';
  const valueLbl = el('span', 'mw-auto-speed-value', '1x');
  label.appendChild(valueLbl);
  const slider = el('input', 'mw-auto-slider');
  slider.type = 'range';
  slider.id = 'mw-auto-speed';
  slider.min = String(SPEED_MIN);
  slider.max = String(SPEED_MAX);
  slider.step = String(SPEED_STEP);
  slider.value = '1';
  slider.setAttribute('aria-label', 'Simülasyon zaman hızı çarpanı');
  const pauseBtn = el('button', 'mw-auto-btn mw-auto-pause', 'Durdur');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.setAttribute('aria-label', 'Simülasyonu durdur veya devam ettir');
  time.append(label, slider, pauseBtn);

  panel.append(autoBtn, rerouteBtn, time);
  host.appendChild(panel);

  function render() {
    autoBtn.textContent = `Otomatik sürüş: ${autoOn ? 'Açık' : 'Kapalı'}`;
    autoBtn.setAttribute('aria-pressed', String(autoOn));
    autoBtn.classList.toggle('is-on', autoOn);
    rerouteBtn.hidden = !autoOn;
    time.hidden = !autoOn;
    valueLbl.textContent = `${speed}x`;
    slider.value = String(speed);
    pauseBtn.textContent = paused ? 'Devam' : 'Durdur';
    pauseBtn.setAttribute('aria-pressed', String(paused));
  }

  const onAuto = () => { autoOn = !autoOn; render(); onAutoToggle?.(autoOn); };
  const onSlide = () => { speed = clampSpeedMultiplier(slider.value); render(); onSpeed?.(speed); };
  const onPauseClick = () => { paused = !paused; render(); onPause?.(paused); };
  const onRe = () => onReroute?.();

  autoBtn.addEventListener('click', onAuto);
  slider.addEventListener('input', onSlide);
  pauseBtn.addEventListener('click', onPauseClick);
  rerouteBtn.addEventListener('click', onRe);
  render();

  return {
    setAutoOn(b) { autoOn = Boolean(b); render(); },
    setSpeed(n) { speed = clampSpeedMultiplier(n); render(); },
    setPaused(b) { paused = Boolean(b); render(); },
    destroy() {
      autoBtn.removeEventListener('click', onAuto);
      slider.removeEventListener('input', onSlide);
      pauseBtn.removeEventListener('click', onPauseClick);
      rerouteBtn.removeEventListener('click', onRe);
      panel.remove();
    },
  };
}
