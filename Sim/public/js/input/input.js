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
  view2dBtn,
  view3dBtn,
  pauseBtn,
  restartBtn,
  corridorInput,
  lookEl,
  corridorMin,
  corridorMax,
  initialCorridor,
  onTogglePause,
  onRestart,
  onZoom,
  onViewChange,
  onCorridorChange,
  isFirstPerson = () => false,
  onJump = () => {},
  onLook = () => {},
  onPointerLockChange = () => {},
}) {
  const keys = { up: false, down: false, left: false, right: false, jump: false, jumpPressed: false };
  const clearKeys = () => { for (const k in keys) keys[k] = false; };
  const triggerRestart = () => { clearKeys(); onRestart(); };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); return; }
    if (e.code === 'Space' && isFirstPerson()) {
      e.preventDefault();
      keys.jump = true;
      if (!e.repeat) { keys.jumpPressed = true; onJump(); }
    }
    else if (e.code === 'KeyP' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) { clearKeys(); onTogglePause(); } }
    else if (e.code === 'KeyR') { if (!e.repeat) triggerRestart(); }
    else if (e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal') onZoom(1.25);
    else if (e.key === '-' || e.code === 'NumpadSubtract' || e.code === 'Minus') onZoom(0.8);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
    if (e.code === 'Space') keys.jump = false;
  });
  window.addEventListener('blur', clearKeys);

  lookEl?.addEventListener('click', () => {
    if (isFirstPerson() && typeof lookEl.requestPointerLock === 'function' && document.pointerLockElement !== lookEl) {
      const request = lookEl.requestPointerLock();
      request?.catch?.(() => onPointerLockChange(false));
    }
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === lookEl;
    if (!locked) clearKeys();
    onPointerLockChange(locked);
  });
  document.addEventListener('mousemove', (e) => {
    // Screen-right mouse motion should turn the view to the user's right. Positive yaw turns north
    // from an east-facing start, which is screen-left in this camera frame, so invert only X here.
    if (isFirstPerson() && document.pointerLockElement === lookEl) onLook(-e.movementX, e.movementY);
  });

  mapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    onZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  view2dBtn?.addEventListener('click', (e) => { onViewChange('2d'); e.currentTarget.blur(); });
  view3dBtn?.addEventListener('click', (e) => {
    if (!e.currentTarget.disabled) onViewChange('3d');
    e.currentTarget.blur();
  });

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
