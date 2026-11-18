// Üst-orta biyom çipi (yalnız DOM). Metin yoksa gizlenir; değişimde yumuşak fade.
export function createBiomeChip({ parent, doc = document, fadeMs = 250 } = {}) {
  const el = doc.createElement('div');
  el.className = 'mw-biome-chip';
  el.setAttribute('aria-live', 'polite');
  (parent ?? doc.body).appendChild(el);
  let shown = null, timer = null;
  return {
    set(text) {
      const next = text || null;
      if (next === shown) return;
      shown = next;
      clearTimeout(timer);
      if (!next) { el.classList.remove('is-on'); return; }
      if (el.classList.contains('is-on')) {
        el.classList.remove('is-on');
        timer = setTimeout(() => { el.textContent = next; el.classList.add('is-on'); }, fadeMs);
      } else {
        el.textContent = next;
        requestAnimationFrame(() => el.classList.add('is-on'));
      }
    },
    destroy() { clearTimeout(timer); el.remove(); },
  };
}
