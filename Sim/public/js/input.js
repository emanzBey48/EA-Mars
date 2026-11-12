// Keyboard, mouse-wheel and button input wiring.
// Holds only UI input state (`keys`) and delegates actions via callbacks; no simulation rules live here.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function bindControls({
  mapEl,
  pauseBtn,
  restartBtn,
  corridorInput,
  corridorMin,
  corridorMax,
  initialCorridor,
  onTogglePause,
  onRestart,
  onZoom,
  onCorridorChange,
}) {
  const keys = { up: false, down: false, left: false, right: false };
  const clearKeys = () => { for (const k in keys) keys[k] = false; };
  const triggerRestart = () => { clearKeys(); onRestart(); };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); return; }
    if (e.code === 'KeyP' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) onTogglePause(); }
    else if (e.code === 'KeyR') { if (!e.repeat) triggerRestart(); }
    else if (e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal') onZoom(1.25);
    else if (e.key === '-' || e.code === 'NumpadSubtract' || e.code === 'Minus') onZoom(0.8);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', clearKeys);

  mapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    onZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  pauseBtn.addEventListener('click', (e) => { onTogglePause(); e.currentTarget.blur(); });
  restartBtn.addEventListener('click', (e) => { triggerRestart(); e.currentTarget.blur(); });

  corridorInput.min = corridorMin;
  corridorInput.max = corridorMax;
  corridorInput.value = initialCorridor;
  corridorInput.addEventListener('change', () => {
    corridorInput.value = onCorridorChange(corridorInput.value);
  });

  return { keys, clearKeys };
}
