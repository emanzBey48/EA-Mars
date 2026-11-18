// Ekip mini şeridi (sağ alt, otomatik sürüş paneline bitişik): her yoldaş için kalan rota mesafesi. Yalnız DOM sunumu.

export function formatCrewRow(c) {
  if (!c) return '';
  return c.arrived ? `${c.label} · vardı` : `${c.label} · ${(c.remainingM >= 50 ? Math.round(c.remainingM / 5) * 5 : Math.round(c.remainingM))} m`;
}

export function createCrewStrip({ parent, doc = document } = {}) {
  const root = doc.createElement('div');
  root.className = 'mw-crew-strip';
  root.setAttribute('aria-label', 'Ekip');
  root.hidden = true;
  (parent ?? doc.body).appendChild(root);
  let last = '';
  return {
    update(list) {
      const items = Array.isArray(list) ? list : [];
      root.hidden = items.length === 0;
      const text = items.map(formatCrewRow).join('|');
      if (text === last) return;
      last = text;
      root.textContent = '';
      for (const c of items) {
        const row = doc.createElement('span');
        row.className = 'mw-crew-strip__item';
        row.textContent = formatCrewRow(c);
        root.appendChild(row);
      }
    },
    destroy() { root.remove(); },
  };
}

