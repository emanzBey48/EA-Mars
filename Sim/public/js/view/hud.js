// HUD and DOM panel rendering. Consumes immutable `WorldSnapshot` frames and layer descriptors;
// performs no DTM sampling, no simulation rules, and no coordinate math.
import { STATUS } from '../surface/layers.js';
import { PHASE, formatClock } from '../simulation/sim.js';

const $ = (id) => document.getElementById(id);

const STATUS_TEXT = {
  [STATUS.NO_DATA]: 'Veri yok (no-data)',
  [STATUS.OUT_OF_BOUNDS]: 'Kapsam dışı',
  [STATUS.UNAVAILABLE]: 'Kullanılamıyor',
  [STATUS.INVALID]: 'Geçersiz',
};

const PHASE_TEXT = {
  [PHASE.READY]: 'Hazır — hareketle başlar',
  [PHASE.RUNNING]: 'Çalışıyor',
  [PHASE.PAUSED]: 'Duraklatıldı',
  [PHASE.ARRIVED]: 'Hedefe ulaşıldı',
};

function esc(s) { return String(s ?? '—').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function fmtSample(s, digits, unitText) {
  if (s.status === STATUS.OK) return { text: `${s.value.toFixed(digits)} ${unitText}`, ok: true };
  return { text: `${STATUS_TEXT[s.status] ?? s.status}${s.reason ? ' — ' + s.reason : ''}`, ok: false };
}

function layerCard(d) {
  const ok = d.access.status === STATUS.OK;
  const v = d.validation;
  const valBadge = v
    ? `<span class="${v.status === 'supported' ? 'st-ok' : 'st-bad'}">${esc(v.status)}</span>` +
      (v.reasonCode ? ` <span class="muted">(${esc(v.reasonCode)})</span>` : '') +
      (v.summary ? ` — ${esc(v.summary)}` : '')
    : (ok ? '<span class="st-ok">supported</span>' : `<span class="st-bad">${esc(d.access.status)}</span>`);
  const rows = [
    ['Durum', `<span class="${ok ? 'st-ok' : 'st-bad'}">${ok ? 'Yüklendi' : 'Kullanılamıyor'}</span>${ok ? '' : ' — ' + esc(d.access.reason)}`],
    ['Metadata doğrulaması', valBadge],
    ['Ürün', esc(d.product) + (d.version ? ` (sürüm ${esc(d.version)})` : '')],
    ['Gövde', esc(d.body ?? 'MARS')],
    ['Kaynak', esc(d.source)],
    ['Atıf', esc(d.attribution)],
    ['Lisans / kullanım', esc(d.license ?? 'USGS / Public Domain (Please cite authors)')],
    ['Birim', esc(d.unit)],
    ['Düşey datum', esc(d.verticalDatum) + (d.verticalDatumEvidence ? ` <span class="muted small">(${esc(d.verticalDatumEvidence)})</span>` : '')],
    ['CRS', esc(d.crs)],
    ['Piksel ölçeği', d.pixelScaleM ? `${d.pixelScaleM.toFixed(4)} m/piksel (1 m TRN mozaik)` : '—'],
    ['Boyut / piksel kuralı', d.size ? `${d.size.rows} × ${d.size.cols} hücre` + (d.size.loadedWindow ? ` · yüklenen pencere ${d.size.loadedWindow.rows} × ${d.size.loadedWindow.cols}` : '') + (d.size.pixelRegistration ? ` · ${esc(d.size.pixelRegistration)}` : '') : '—'],
    ['Kapsama', esc(d.coverage?.description)],
    ['Zaman kapsamı', esc(d.timeCoverage) + (d.simClockRelation === 'independent_static_archive' ? ' · simülasyon saatinden bağımsız statik arşiv verisi (canlı/eşzamanlı değil)' : '')],
    ['No-data', d.noData ? `${esc(d.noData.constantHex)} — ${esc(d.noData.rule)}` : '—'],
  ];
  if (d.quality?.windowStats) {
    const s = d.quality.windowStats;
    rows.push(['Kalite', `Pencerede gözlenen uç kotlar ${d.quality.observedMin}…${d.quality.observedMax} m (ürün geçerlilik sınırı değil) · ${s.valid} finite, ${s.noData} no-data, ${s.invalid} geçersiz hücre`]);
  }
  if (d.quality?.registration?.note) rows.push(['Hizalama', esc(d.quality.registration.note)]);
  return `<div class="layer"><b>${esc(d.title)}</b><table>${rows.map(([k, vRow]) => `<tr><td>${k}</td><td>${vRow}</td></tr>`).join('')}</table></div>`;
}

export function createHud({ waypoints, routeLengthM, corridorHalfWidthM, scenario, routeOriginNote, sources }) {
  $('route-note').textContent = routeOriginNote;
  $('route-wps').innerHTML = waypoints.map((w) =>
    `<li><b>${w.label}</b>: ${w.latDeg.toFixed(8)}°K, ${w.lonDeg.toFixed(8)}°D (planetosentrik) → yerel (${w.local.x.toFixed(1)}, ${w.local.y.toFixed(1)}) m</li>`).join('') +
    `<li>Düz çizgi uzunluğu (yerel projeksiyon düzleminde): ${routeLengthM.toFixed(1)} m · Kaynak: Mars 2020 Initial Reports (PDS)</li>`;
  $('sources').innerHTML = sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.label}</a></li>`).join('') +
    '<li>Görüntü/veri: NASA / JPL-Caltech / University of Arizona / USGS Astrogeology Science Center.</li>';
  $('v-speed').textContent = `${scenario.walkSpeedMps} m/s senaryo hızı × ${scenario.timeScale} zaman hızlandırma (gerçek Mars yürüyüş hızı iddiası değil). 3D düşey ivme: ${scenario.marsGravityMps2} m/s² (NASA küresel referansı; Jezero yerel ölçümü değil). Space sıçrama girdisi ${scenario.jumpImpulseMps} m/s oyun varsayımıdır, suit performansı değildir.`;

  function renderLayerPanel(layers, terrain, currentCorridorM = corridorHalfWidthM) {
    const regBanner = layers.selectionReport
      ? `<div class="layer muted small"><b>SurfaceProvider Kayıt/Seçim:</b> Aktif sağlayıcı <code>${esc(layers.selectionReport.activeId)}</code> (${esc(layers.selectionReport.validation?.status ?? '—')}). ${esc(layers.selectionReport.competitionDataStatus)}</div>`
      : '';
    $('layers').innerHTML = regBanner + [layers.dtm.descriptor, layers.ortho?.descriptor].filter(Boolean).map(layerCard).join('');
    const notes = [];
    if (!layers.ortho?.available) notes.push('Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor / geçersiz bildirildi).');
    if (!layers.dtm.available) notes.push(`DTM kullanılamıyor: ${layers.dtm.descriptor.access.reason}`);
    const legend = $('legend');
    if (terrain) {
      const grad = terrain.ramp.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(',');
      legend.innerHTML = `<b>Zemin: DTM’den türetilmiş gölgeli kabartma + kot renklendirmesi</b> (ortogörüntü değil; görsel amaçlı)` +
        `<div class="bar" style="background:linear-gradient(90deg,${grad})"></div>` +
        `<div class="row"><span>${terrain.zMin.toFixed(1)} m</span><span>MOLA areoid / DeltaGeoid</span><span>${terrain.zMax.toFixed(1)} m</span></div>` +
        `<div><span class="swatch"></span>${routeOriginNote}</div><div><span class="swatch corr"></span>senaryo koridoru (±${currentCorridorM} m, güvenlik sınırı değil) · <span class="swatch nd"></span>no-data</div>`;
    } else {
      legend.innerHTML = `<b>Zemin yok</b> — raster verisi kullanılamıyor; yalnız metre ızgarası.<div><span class="swatch"></span>${routeOriginNote}</div><div><span class="swatch corr"></span>senaryo koridoru (güvenlik sınırı değil)</div>`;
    }
    const rb = $('raster-banner'); rb.hidden = notes.length === 0; rb.textContent = notes.join(' ');
    $('v-calc-note').textContent = layers.dtm.available
      ? `Kaynak: ${layers.dtm.descriptor.product}. Kot: en yakın DTM hücresi (MOLA areoid / DeltaGeoid datumu, m). Eğim: aynı hücrede 3×3 Horn, hücre ${layers.dtm.cellSizeM.toFixed(2)} m; 9 hücrenin hepsi geçerli değilse eğim üretilmez.`
      : 'DTM katmanı yüklenmediği için kot ve eğim hesaplanmıyor.';
  }

  function updateHud(snapshot) {
    const { phase, simTimeS, distanceWalkedM, astronaut, surface, route } = snapshot;
    const ph = $('phase'); ph.textContent = PHASE_TEXT[phase]; ph.className = `phase ${phase}`;
    $('btn-pause').textContent = phase === PHASE.PAUSED ? 'Devam' : 'Duraklat';
    $('v-pos').textContent = `x = ${astronaut.xM.toFixed(1)} m (doğu), y = ${astronaut.yM.toFixed(1)} m (kuzey)`;
    $('v-latlon').textContent = Number.isFinite(astronaut.latDeg) && Number.isFinite(astronaut.lonDeg)
      ? `${astronaut.latDeg.toFixed(6)}°K, ${astronaut.lonDeg.toFixed(6)}°D (DTM equirectangular tanımıyla)`
      : '—';
    $('v-clock').textContent = `${formatClock(simTimeS)} (senaryo süresi, T+0’dan)`;
    $('v-progress').textContent = `${route.progressM.toFixed(1)} / ${route.routeLengthM.toFixed(1)} m (%${(route.progressFrac * 100).toFixed(1)}) · hedefe ${route.distToEndM.toFixed(1)} m`;
    const dev = $('v-dev');
    dev.textContent = `${route.deviationM.toFixed(1)} m — ${route.outsideCorridor ? `koridor dışında (> ${route.corridorHalfWidthM} m)` : `koridor içinde (≤ ${route.corridorHalfWidthM} m)`} (yerel equirectangular düzlemde; güvenlik sınırı değil)`;
    dev.className = route.outsideCorridor ? 'status-bad' : 'status-ok';
    $('v-walked').textContent = `${distanceWalkedM.toFixed(1)} m`;

    const e = surface.elevation;
    const s = surface.slope;
    const ef = fmtSample(e, 2, 'm (MOLA areoid / DeltaGeoid)');
    if (!ef.ok) ef.text = `Yükseklik bilinmiyor — ${ef.text}`;
    const sf = fmtSample(s, 1, '°');
    $('v-elev').innerHTML = `<span class="${ef.ok ? 'status-ok' : 'status-bad'}">${esc(ef.text)}</span>` +
      (e.cell ? ` <span class="muted small">hücre satır ${e.cell.row}, sütun ${e.cell.col} · ${esc(e.method)}</span>` : '');
    $('v-slope').innerHTML = `<span class="${sf.ok ? 'status-ok' : 'status-bad'}">${esc(sf.text)}</span>` +
      (s.method ? ` <span class="muted small">${esc(s.method)}</span>` : '');

    const banner = $('deviation-banner');
    banner.hidden = !route.outsideCorridor;
    if (route.outsideCorridor) banner.textContent = `Rota koridorundan saptınız: segmente ${route.deviationM.toFixed(1)} m (senaryo koridoru ±${route.corridorHalfWidthM} m, güvenlik sınırı değil). Çizgiye geri dönün.`;
    $('arrived-banner').hidden = phase !== PHASE.ARRIVED;
    $('start-hint').hidden = phase !== PHASE.READY;
  }

  return { renderLayerPanel, updateHud };
}
