// Tanıtım akışı orkestrasyonu: küre ekranı -> 3B mod, kask uyarıları, otomatik sürüş ve minimap görünüm modu.
// Saf yardımcılar + parametre enjeksiyonlu fabrika; DOM yalnız verilen `doc` üzerinden. Planlama göstergesidir; güvenlik iddiası yok.

export const PLAN_SPEED_MPS = 1.2; // route-service varsayılan sim yürüyüş hızı (duvar saati değil)
export const MAX_SUBSTEP_S = 0.05;

/** Rota ETA'sı (sim saniyesi) -> istenen süre aşılıyorsa amber uyarı metni, aksi halde null. */
export function etaWarningText({ etaS, lengthM = null, targetMinutes }) {
  const target = Number(targetMinutes);
  if (!(target > 0)) return null;
  const eta = Number.isFinite(etaS) && etaS > 0 ? etaS : (Number.isFinite(lengthM) && lengthM > 0 ? lengthM / PLAN_SPEED_MPS : null);
  if (eta === null) return null;
  const etaMin = eta / 60;
  if (etaMin <= target) return null;
  return `⚠ İstenen süre aşılıyor (rota ≈ ${Math.round(etaMin)} dk, istenen ${Math.round(target)} dk) — süre öncelikli, planlama göstergesi`;
}

/** Çok kişili seçim için HUD etiketi; tek kişide null. */
export function crewLabel(crew) {
  if (!crew || !(crew.count >= 2)) return null;
  const idx = Number.isInteger(crew.followIndex) ? crew.followIndex + 1 : 1;
  const sep = crew.mode === 'split' ? ' · ayrı ilerleme' : '';
  return `Kişi ${idx}/${crew.count} takip ediliyor${sep}`;
}

/** Seçilen bölge türleri için rozet metni ("bağlam seçimi"), boşsa null. */
export function regionBadgeText(regionTypes, labelOf = (t) => t) {
  const arr = Array.isArray(regionTypes) ? regionTypes : regionTypes instanceof Set ? [...regionTypes] : [];
  if (!arr.length) return null;
  return `İlgi (bağlam seçimi): ${arr.map((t) => String(labelOf(t))).join(', ')}`;
}

/** Sim dt'sini ≤ MAX_SUBSTEP_S alt-adımlara böler. */
export function subSteps(dt, maxStep = MAX_SUBSTEP_S) {
  const out = [];
  let rem = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  while (rem > 1e-9) { const h = Math.min(rem, maxStep); out.push(h); rem -= h; }
  return out;
}

export function createDemoFlow({
  doc, mapWrap, globeScreen = null, helmet = null, autoDrive, getPlayerPos, getRoutePath, getRouteStats,
  requestReplan = () => false, onAutoChange = () => {}, setHudMinimapVisible = () => {}, onReturnToGlobe = () => {}, typeLabel = (t) => t,
}) {
  let selection = null;
  let in3d = false;
  let autoOn = false;
  let waitingReplan = false;
  let controls = null;
  let backBtn = null;
  function setHelmetMode(on) {
    doc.body.classList.toggle('mw-helmet-mode', Boolean(on));
    if (!backBtn) {
      backBtn = doc.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'mw-back-globe';
      backBtn.textContent = 'Küreye dön';
      backBtn.addEventListener('click', () => { api.leave3d(); onReturnToGlobe(); });
      doc.body.appendChild(backBtn);
    }
    backBtn.hidden = !on;
    try { doc.defaultView?.dispatchEvent(new doc.defaultView.Event('resize')); } catch { /* yok say */ }
  }
  const tag = doc.createElement('div');
  tag.className = 'mw-demo-tags';
  tag.hidden = true;
  mapWrap.appendChild(tag);

  function polylineNow() {
    const p = getRoutePath?.();
    return Array.isArray(p) && p.length >= 2 ? p.map((q) => ({ x: q.xM ?? q.x, y: q.yM ?? q.y })) : null;
  }

  function renderTags() {
    tag.textContent = '';
    if (!selection) { tag.hidden = true; return; }
    const parts = [crewLabel(selection.crew), regionBadgeText(selection.regionTypes, typeLabel)].filter(Boolean);
    for (const t of parts) { const s = doc.createElement('span'); s.className = 'mw-demo-tag'; s.textContent = t; tag.appendChild(s); }
    tag.hidden = parts.length === 0 || !in3d;
  }

  function checkEta() {
    if (!selection || !helmet) return;
    const stats = getRouteStats?.() ?? {};
    const text = etaWarningText({ etaS: stats.estimatedDurationS, lengthM: stats.lengthM, targetMinutes: selection.targetMinutes });
    if (text) helmet.showWarning(text, { level: 'warn', ttlMs: 12000 });
  }

  function engageNow() {
    const pos = getPlayerPos();
    const poly = polylineNow();
    if (!poly) { waitingReplan = true; autoDrive.setEnabled(true); return; }
    autoDrive.setPolyline(poly);
    const dec = autoDrive.engage(pos);
    autoDrive.setEnabled(true);
    if (dec.action === 'replan') { waitingReplan = true; if (!requestReplan(pos)) { /* plan sürüyor olabilir; sonuç gelince devam */ } }
    else waitingReplan = false;
  }

  function setAuto(on) {
    autoOn = Boolean(on);
    controls?.setAutoOn(autoOn);
    if (autoOn) engageNow();
    else { autoDrive.setEnabled(false); waitingReplan = false; }
    onAutoChange(autoOn);
  }

  const api = {
    attachControls(c) { controls = c; controls?.setAutoOn?.(false); },
    toggleAuto: (on) => setAuto(on),
    setPaused(p) { autoDrive.setPaused(p); controls?.setPaused?.(p); },
    setSpeed(x) { const v = autoDrive.setSpeedMultiplier(x); controls?.setSpeed?.(v); return v; },
    reroute() { if (autoOn) { waitingReplan = true; autoDrive.setPolyline([]); requestReplan(getPlayerPos()); } },
    /** Yeni rota planı geldi. */
    onRouteResult(route) {
      if (route?.status === 'ok') {
        if (in3d) checkEta();
        if (autoOn && waitingReplan) engageNow();
      } else if (autoOn && waitingReplan) {
        setAuto(false);
      }
    },
    /** Küre seçiminden 3B moda geçildi. */
    enter3d(sel) {
      selection = sel ?? null; in3d = true;
      helmet?.show(); setHelmetMode(true); renderTags(); setHudMinimapVisible(true);
      controls?.setVisible?.(true);
      setTimeout(checkEta, 800);
    },
    leave3d() { in3d = false; if (autoOn) setAuto(false); helmet?.hide(); setHelmetMode(false); tag.hidden = true; },
    isAuto: () => autoOn,
    /** Karede çağrılır; aktif değilse null. */
    autoStep(dtWall, { yawRad, simPhase }) {
      if (!autoOn || !in3d) return null;
      const pos = getPlayerPos();
      if (simPhase === 'arrived') { setAuto(false); return null; }
      const d = autoDrive.update(dtWall, pos, yawRad);
      if (d.arrived) { setAuto(false); return null; }
      const scaled = dtWall * autoDrive.effectiveTimeScaleMultiplier();
      return {
        yawRad: d.steerYawRad,
        moveX: d.forward ? Math.cos(d.steerYawRad) : 0,
        moveY: d.forward ? Math.sin(d.steerYawRad) : 0,
        steps: subSteps(Math.min(scaled, 1)),
        progressFrac: d.progressFrac,
      };
    },
    getSelection: () => selection,
    dispose() { tag.remove(); backBtn?.remove(); globeScreen?.dispose?.(); },
  };
  return api;
}

