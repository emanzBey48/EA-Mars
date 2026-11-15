// Mürettebat hedef dağıtımı: açgözlü en-uzun-önce (LPT) ile süreleri dengeler. Saf fonksiyon.

export function splitTargetsAcrossCrew({ targets = [], crewCount = 1 } = {}) {
  if (!Number.isInteger(crewCount) || crewCount < 1) {
    throw new RangeError('crewCount 1 veya daha büyük bir tamsayı olmalı');
  }
  for (const t of targets) {
    if (!Number.isFinite(t.estMinutes) || t.estMinutes < 0) {
      throw new RangeError(`estMinutes geçersiz: ${t.id}`);
    }
  }
  const crew = Array.from({ length: crewCount }, (_, index) => ({ index, targets: [], totalMinutes: 0 }));
  const order = targets.map((t, i) => ({ t, i }))
    .sort((a, b) => (b.t.estMinutes - a.t.estMinutes) || (a.i - b.i));
  for (const { t } of order) {
    let pick = crew[0];
    for (const c of crew) if (c.totalMinutes < pick.totalMinutes) pick = c;
    pick.targets.push(t);
    pick.totalMinutes += t.estMinutes;
  }
  const totals = crew.map((c) => c.totalMinutes);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  return {
    crew,
    totalMinutes: totals.reduce((a, b) => a + b, 0),
    makespanMinutes: max,
    // min/max, 1 = tam denge; hiç iş yoksa 1.
    balanceRatio: max === 0 ? 1 : min / max,
  };
}
