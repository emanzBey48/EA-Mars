// Anlık yerel jeolojik birim -> sade Türkçe biyom/arazi adı (saf eşleme + hız sınırlayıcı). Birim yoksa null (çip gösterilmez).

const RULES = [
  [/dune|eolian|aeolian|bedform|sand/i, 'Kum tepeleri'],
  [/fan|delta/i, 'Antik delta'],
  [/rim|wall|massif|scarp|crater[ -]?rim/i, 'Krater kenarı'],
  [/etched/i, 'Aşınmış krater zemini'],
  [/floor/i, 'Krater tabanı'],
];

export function biomeFromUnit(unitName) {
  const n = String(unitName ?? '');
  for (const [re, label] of RULES) if (re.test(n)) return label;
  return null;
}

/** Yerel eğimden ikincil ifade; eğim yoksa null. */
export function slopeWord(slopeDeg) {
  if (!Number.isFinite(slopeDeg)) return null;
  if (slopeDeg < 5) return 'düz';
  if (slopeDeg < 15) return 'yamaç';
  return 'dik yamaç';
}

export function biomeLabel({ geology, slopeDeg = null } = {}) {
  if (!geology || geology.status !== 'ok') return null;
  const base = biomeFromUnit(geology.unitName);
  if (!base) return null;
  const s = slopeWord(slopeDeg);
  return { key: base, text: s ? `${base} · ${s}` : base };
}

/** En fazla `minIntervalMs`'de bir yeniden hesap; arada son sonuç döner. */
export function createBiomeTracker({ minIntervalMs = 400 } = {}) {
  let lastAt = -Infinity, last = null;
  return {
    update(input, nowMs) {
      if (nowMs - lastAt < minIntervalMs) return last;
      lastAt = nowMs;
      last = biomeLabel(input);
      return last;
    },
    reset() { lastAt = -Infinity; last = null; },
  };
}
