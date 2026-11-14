// App bootstrap (composition root): coordinates simulation, SurfaceProvider sampling,
// immutable WorldSnapshot creation, canvas rendering, input and HUD.
import { SCENARIO, WAYPOINTS, MAP_FRAME, ROUTE_ORIGIN_NOTE, SOURCES, ORTHO_MOSAIC_SOURCES } from './config.js';
import { adapterFromLabel } from './geo/geo.js';
import { marsSunDirection } from './geo/mars-sun.js';
import {
  createGeologyIndex, lookupGeologicUnitLocal, toGeologySnapshot,
  createGeologicContactField, nearestGeologicContactM,
  GEOLOGY_POSITIONAL_UNCERTAINTY_M, GEOLOGY_LICENSE_NOT_STATED,
} from './geo/geology.js';
import { createGeologyRegistry, lookupBestGeologicUnit } from './geo/geology-registry.js';
import { UnavailableLayer, dtmBaseDescriptor, loadOrthoDescriptor } from './surface/layers.js';
import { createDefaultSurfaceRegistry } from './surface/registry.js';
import { MarswalkSim, createWorldSnapshot } from './simulation/sim.js';
import { Camera, buildTerrainImage, render } from './view/render.js';
import {
  cameraRelativeMovement, createFirstPersonCamera, lookCamera, setFirstPersonLook, setFirstPersonPose, zoomCamera,
} from './view/3d/camera.js';
import { createTerrainRenderer } from './view/3d/renderer.js';
import { ASTRONAUT_RIG } from './view/3d/astronaut-rig.js';
import { buildTerrainMesh } from './view/3d/terrain-mesh.js';
import { buildMarkerMeshes } from './view/3d/marker-mesh.js';
import { buildRouteRibbon } from './view/3d/route-ribbon.js';
import { bindControls } from './input/input.js';
import { createStops } from './geo/rover-observations.js';
import { createRoverGallery } from './view/rover-gallery.js';
import { createHud } from './view/hud.js';
import { buildPlannedRouteLinePositions, derivePlannedRouteGuidance } from './view/route-guidance.js';
import { createFootprintTrail } from './view/3d/footprint-trail.js';
import { combineTraverseMarkers, prepareArchiveTraverse, prepareArchiveTraverse3d } from './view/traverse-layer.js';
import { createMinimap } from './view/minimap/minimap.js';
import { classifyPlanResponse } from './view/minimap/plan-response-state.js';

const $ = (id) => document.getElementById(id);
const urlParams = new URLSearchParams(window.location.search);
const debugParams = urlParams;
const debugEnabled = debugParams.get('debug') === '1' || window.__MARSWALK_ENABLE_DEBUG__ === true;
const forceWebgl2Failure = debugEnabled && debugParams.get('testWebGL2Failure') === '1';
const initialViewParam = urlParams.get('view')?.toLowerCase();
const startIn3dRequested = initialViewParam === '3d';
const urlScaleParam = Number(urlParams.get('scale'));
let currentVerticalScale = [1, 2, 3].includes(urlScaleParam) ? urlScaleParam : 1;
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
const targetYawRad = Math.atan2(waypoints[1].local.y - waypoints[0].local.y, waypoints[1].local.x - waypoints[0].local.x);
const sim = new MarswalkSim({ a: waypoints[0].local, b: waypoints[1].local }, SCENARIO);
const camera = new Camera();
const camera3d = createFirstPersonCamera({ xM: waypoints[0].local.x, yM: waypoints[0].local.y, yawRad: targetYawRad });
const registry = createDefaultSurfaceRegistry({ expectedFrame: MAP_FRAME, adapter, baseUrl: 'data' });
const layers = { dtm: new UnavailableLayer(dtmBaseDescriptor(), 'Yükleniyor…'), ortho: null, selectionReport: null };
let terrain = null;
let terrainMesh = null;
let markerMesh = null;
let archiveTraverse = null;
let archiveTraverse3d = null;
let archiveTraverseStatus = 'loading';
let archiveMarkerBase = null;
let combinedArchiveMarkers = null;
let markerMeshError = null;
let lastSnapshot = null;
let activeView = '2d';
let hasEntered3dOnce = false;
let viewRequestId = 0;
let renderer3d = null;
let renderer3dError = null;
let terrainMeshError = null;
let terrainMeshBuildMs = null;
let geologyIndex = null;
let geologyRegistry = null;
let geologyContactField = null;
let geologySegmentsLocal = [];
let geologyLinePositions = new Float32Array();
let geologyStatus = 'loading';
let geologyLayerVisible = true;
let minimapEndpoints = { start: null, end: null };
let routeWorker = null;
let routeWorkerId = 0;
let routeWorkerReady = false;
let pendingInitId = null;
let pendingPlanId = null;
let latestExplainId = null;
let endpointRevision = 0;
const routeWorkerRequests = new Map();
let routeHeatmap = null;
let activeRoute = null;
let plannedRouteLinePositions = new Float32Array();
let plannedRouteRibbon = null;
let plannedRoutePathCumulativeM = [];
const footprintTrail = createFootprintTrail({ sampleElevation: (xM, yM) => layers.dtm.sampleElevation(xM, yM) });
let footprintTrailSnapshot = footprintTrail.getSnapshot();
let lastMinimapFootprintRefreshS = -Infinity;
let orthoOverlay = null;

const mapWrap = $('mapwrap');
const canvas2d = $('map');
const canvas3d = $('map-3d');
const ctx2d = canvas2d.getContext('2d');
const view2dBtn = $('btn-view-2d');
const view3dBtn = $('btn-view-3d');
const selectOrthoMode = $('select-ortho-mode');
const selectVerticalScale = $('select-vertical-scale');
const viewNote = $('view-note');
const viewStatus = $('view-status');
const fpReticle = $('fp-reticle');
const fpHudHint = $('fp-hud-hint');
const geologyToggle = $('toggle-geology');
const minimapCanvas = $('minimap-canvas');
const minimapStartLabel = $('minimap-start');
const minimapEndLabel = $('minimap-end');
const minimapStatus = $('minimap-status');
const minimapGeologyToggle = $('minimap-toggle-geology');
const minimapArchiveToggle = $('minimap-toggle-archive');
const minimapOrthoToggle = $('minimap-toggle-ortho');
const minimapLayerStatus = $('minimap-layer-status');
const minimapHeatmapToggle = $('minimap-toggle-heatmap');
const minimapPlanButton = $('minimap-plan-route');
const minimapRoutePreference = $('minimap-route-preference');
const minimapRouteSummary = $('minimap-route-summary');
const minimapCellExplanation = $('minimap-cell-explanation');
const orthoStatus = $('ortho-status');
const btnDemoMode = $('btn-demo-mode');
const btnHeaderDemo = $('btn-header-demo');
const presentationHud = $('presentation-hud');
const btnClosePresentation = $('btn-close-presentation');
const btnDemoTour = $('btn-demo-tour');
const btnDemoToggleView = $('btn-demo-toggle-view');
const btnDemoRestart = $('btn-demo-restart');
const presGuideBanner = $('pres-guide-banner');

let presentationModeActive = false;
let pendingDemoTour = false;

function setPresentationMode(active) {
  presentationModeActive = Boolean(active);
  document.body.classList.toggle('presentation-mode', presentationModeActive);
  if (presentationHud) presentationHud.hidden = !presentationModeActive;
  if (btnDemoMode) btnDemoMode.setAttribute('aria-pressed', String(presentationModeActive));
  if (btnHeaderDemo) btnHeaderDemo.setAttribute('aria-pressed', String(presentationModeActive));
  updateHud();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, mapWrap.clientWidth), h = Math.max(1, mapWrap.clientHeight);
  if (activeView === '3d' && renderer3d) {
    renderer3d.resize(w, h, dpr);
  }
}

async function startDemoTour() {
  setPresentationMode(true);
  if (currentVerticalScale !== 1) {
    rebuildTerrainMeshForScale(1);
  }
  const startPt = { xM: waypoints[0].local.x, yM: waypoints[0].local.y };
  const endPt = { xM: waypoints[1].local.x, yM: waypoints[1].local.y };
  showSelectedPoint('start', startPt);
  showSelectedPoint('end', endPt);
  if (routeWorkerReady) {
    planMinimapRoute();
  } else {
    pendingDemoTour = true;
  }
  if (presGuideBanner) {
    presGuideBanner.textContent = 'Sol 120 (WB1) → Sol 164 (Roubion) A* rotası hesaplanıyor. 1× gerçek dikey ölçekte HiRISE ortomozaik üzerinde turkuaz kılavuz şeridi izleyerek WASD ile ilerleyin!';
  }
  if (renderer3d && layers.dtm.available && !terrainMeshError && !forceWebgl2Failure) {
    await selectView('3d');
  } else {
    await selectView('2d');
  }
}

function getFirstPersonNote(scale = currentVerticalScale) {
  const scaleText = scale === 1
    ? 'Dikey ölçek: 1× gerçek Mars kotu (bilimsel 1:1).'
    : `Dikey ölçek: ${scale}× görsel sunum abartısıdır.`;
  return `Birinci şahıs: WASD ile yürü, 3D sahneye tıklayıp fareyle bak, Space ile sıçra, P ile duraklat. Esc fare kilidini bırakır. ${scaleText} Güneş senaryosu: yerel gerçek güneş saati 15.00, Lₛ 0°.`;
}

function showSelectedPoint(kind, point, byDrag = false) {
  const label = `${point.xM.toFixed(1)} m doğu, ${point.yM.toFixed(1)} m kuzey (WB1 orijini)`;
  if (kind === 'start') minimapStartLabel.textContent = label;
  else minimapEndLabel.textContent = label;
  minimapEndpoints = { ...minimapEndpoints, [kind]: point };
  endpointRevision++;
  if (pendingPlanId !== null) routeWorkerRequests.delete(pendingPlanId);
  pendingPlanId = null;
  minimapController.setEndpoints(minimapEndpoints);
  activeRoute = null;
  preparePlannedRouteGuide();
  minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null });
  renderRouteSummary({ status: 'idle', reason: 'Yeni nokta seçildi' });
  minimapStatus.textContent = 'Nokta kaydedildi. Planlama göstergesi — güvenli rota sertifikası değildir.';
  updateRouteButton();
  minimapController.setSelectionMode(null);
  $('minimap-pick-start').setAttribute('aria-pressed', 'false');
  $('minimap-pick-end').setAttribute('aria-pressed', 'false');

  if (byDrag && minimapEndpoints.start && minimapEndpoints.end && routeWorkerReady) {
    planMinimapRoute();
  }
}

const minimapController = createMinimap({
  canvas: minimapCanvas,
  terrain,
  descriptor: MAP_FRAME,
  onPointSelected: ({ kind, xM, yM, byDrag }) => showSelectedPoint(kind, { xM, yM }, Boolean(byDrag)),
  onCellClick: (point) => explainMinimapCell(point),
});

function updateRouteButton() {
  const endpointsReady = Boolean(layers.dtm.available && minimapEndpoints.start && minimapEndpoints.end);
  minimapPlanButton.disabled = !endpointsReady || !routeWorkerReady || pendingInitId !== null || pendingPlanId !== null;
  minimapPlanButton.textContent = pendingInitId !== null
    ? 'Planlama alanı hazırlanıyor…'
    : pendingPlanId !== null
      ? 'Rota hesaplanıyor…'
      : !endpointsReady
        ? 'Başlangıç ve bitiş seçin'
        : routeWorkerReady ? 'Rota planla' : 'Rota planlayıcı kullanılamıyor';
}

function renderRouteSummary(result) {
  const rows = [];
  const add = (key, value, className = '') => rows.push([key, value, className]);
  const stats = result?.stats;
  if (result?.status !== 'ok' || !stats) {
    add('Rota', result?.reason || result?.status || 'Henüz hesaplanmadı');
  } else {
    add('Toplam mesafe', Number.isFinite(stats.lengthM) ? `${stats.lengthM.toFixed(0)} m` : 'bilinmiyor');
    if (Number.isFinite(stats.estimatedDurationS)) {
      const mins = Math.floor(stats.estimatedDurationS / 60);
      const secs = Math.round(stats.estimatedDurationS % 60);
      const timeStr = mins > 0 ? `${mins} dk ${secs} sn` : `${secs} sn`;
      add('Tahmini yürüme süresi', `${timeStr} (0,8 m/s senaryo hızı)`);
    } else {
      add('Tahmini yürüme süresi', 'yok (bölgesel çözünürlük)');
    }
    if (Number.isFinite(stats.meanScore)) {
      const score = Math.round(stats.meanScore);
      const scoreClass = score >= 70 ? 'summary-score-high' : score >= 40 ? 'summary-score-med' : 'summary-score-low';
      add('Ortalama yürünebilirlik', `${score}/100`, scoreClass);
    }
    if (Number.isFinite(stats.maxSlopeDeg)) {
      add('En dik eğim', `${stats.maxSlopeDeg.toFixed(1)}° (çarpan: ${Number(stats.maxCost).toFixed(2)})`);
    } else {
      add('En dik eğim', `çarpan: ${Number(stats.maxCost).toFixed(2)}`);
    }
    if (stats.elevationProfileComplete && Number.isFinite(stats.elevationGainM) && Number.isFinite(stats.elevationLossM)) {
      const netDelta = stats.elevationGainM - stats.elevationLossM;
      const netStr = netDelta >= 0 ? `+${netDelta.toFixed(1)} m` : `${netDelta.toFixed(1)} m`;
      add('Kot değişimi (ΔZ)', `+${stats.elevationGainM.toFixed(1)} m / −${stats.elevationLossM.toFixed(1)} m (net: ${netStr})`);
    } else {
      add('Kot değişimi (ΔZ)', 'profil eksik');
    }
  }
  minimapRouteSummary.replaceChildren(...rows.flatMap(([key, value, className]) => {
    const dt = document.createElement('dt'); dt.textContent = key;
    const dd = document.createElement('dd'); dd.textContent = value;
    if (className) dd.className = className;
    return [dt, dd];
  }));
}

function updateHeatmap(data) {
  if (!(data?.score instanceof Uint8Array) || !(data?.status instanceof Uint8Array)) return null;
  const canvas = document.createElement('canvas'); canvas.width = data.cols; canvas.height = data.rows;
  const context = canvas.getContext('2d');
  const image = context.createImageData(data.cols, data.rows);
  for (let i = 0; i < data.score.length; i++) {
    const p = i * 4, score = data.score[i];
    if (data.status[i] !== 0) { image.data[p + 3] = 0; continue; }
    image.data[p] = 245 - Math.round(score * 1.65);
    image.data[p + 1] = 48 + Math.round(score * 1.55);
    image.data[p + 2] = 55; image.data[p + 3] = 190;
  }
  context.putImageData(image, 0, 0);
  return {
    canvas,
    bounds: { nwXM: data.nwXM, nwYM: data.nwYM, widthM: data.cols * data.cellSizeM, heightM: data.rows * data.cellSizeM },
    score: data.score,
    status: data.status,
    rows: data.rows,
    cols: data.cols,
    nwXM: data.nwXM,
    nwYM: data.nwYM,
    cellSizeM: data.cellSizeM,
  };
}

function handleRouteWorkerMessage({ data }) {
  if (!data || !routeWorkerRequests.has(data.id)) return;
  const pending = routeWorkerRequests.get(data.id);
  routeWorkerRequests.delete(data.id);
  if (pending.kind === 'init') {
    if (data.id !== pendingInitId) return;
    pendingInitId = null;
    if (data.type === 'error') {
      routeWorkerReady = false;
      minimapStatus.textContent = `Planlama alanı hazırlanamadı: ${data.reason || data.message || 'Worker hatası'}.`;
      updateRouteButton();
      return;
    }
    if (data.type !== 'window-ready') return;
    routeWorkerReady = true;
    routeHeatmap = updateHeatmap(data.heatmap);
    minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: activeRoute?.status === 'ok' ? activeRoute.path : null, segments: activeRoute?.status === 'ok' ? activeRoute.segments : null });
    minimapStatus.textContent = routeHeatmap
      ? 'Dengeli EVA yürünebilirlik alanı hazır. Planlama göstergesi — güvenli rota sertifikası değildir.'
      : 'Rota planlama alanı hazır; ısı haritası verisi Worker yanıtında bulunamadı.';
    if (pendingDemoTour && minimapEndpoints.start && minimapEndpoints.end) {
      pendingDemoTour = false;
      planMinimapRoute();
    }
    updateRouteButton();
    return;
  }
  if (pending.kind === 'plan') {
    const preference = minimapRoutePreference?.value ?? 'balanced';
    const responseState = classifyPlanResponse({
      responseId: data.id,
      pendingPlanId,
      pendingEndpointRevision: pending.endpointRevision,
      endpointRevision,
      pendingPreference: pending.preference,
      currentPreference: preference,
    });
    if (responseState === 'stale') return;
    pendingPlanId = null;
    if (responseState === 'superseded') {
      updateRouteButton();
      planMinimapRoute();
      return;
    }
  } else if (pending.kind === 'explain' && data.id !== latestExplainId) {
    return;
  }
  if (data.type === 'error') {
    const reason = data.reason || data.message || 'işlem başarısız';
    if (pending.kind === 'plan') {
      activeRoute = null;
      preparePlannedRouteGuide();
      minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null });
      renderRouteSummary({ status: 'error', reason });
      minimapStatus.textContent = `Rota planlayıcı: ${reason}`;
    }
    if (pending.kind === 'explain') minimapCellExplanation.textContent = `Hücre açıklaması alınamadı: ${reason}`;
    updateRouteButton();
    return;
  }
  if (data.type === 'result' && pending.kind === 'plan') {
    activeRoute = data.result;
    preparePlannedRouteGuide();
    minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: activeRoute?.status === 'ok' ? activeRoute.path : null, segments: activeRoute?.status === 'ok' ? activeRoute.segments : null });
    renderRouteSummary(activeRoute);
    minimapStatus.textContent = activeRoute?.status === 'ok'
      ? `Rota planlandı. ${activeRoute.mode === 'eva_walkability' ? 'EVA yürünebilirlik' : 'Bölgesel ön planlama'}. Planlama göstergesi — güvenli rota sertifikası değildir.`
      : activeRoute?.reason || `Rota üretilemedi (${activeRoute?.status || 'bilinmiyor'}).`;
    if (presentationModeActive && presGuideBanner && activeRoute?.status === 'ok') {
      presGuideBanner.textContent = 'Sol 120 → Sol 164 A* EVA rotası hazır! 1× gerçek dikey ölçekte HiRISE ortomozaik üzerinde turkuaz şeridi takip ederek yürüyüşe başlayın. Hedefe varıldığında başarı rozeti belirecektir.';
    }
  } else if (data.type === 'cell-result' && pending.kind === 'explain') {
    renderCellExplanation(data.result);
  }
  updateRouteButton();
}

function ensureRouteWorker() {
  if (routeWorker) return routeWorker;
  routeWorker = new Worker(new URL('./route/pathfinder.worker.js', import.meta.url), { type: 'module' });
  routeWorker.addEventListener('message', handleRouteWorkerMessage);
  routeWorker.addEventListener('error', (event) => {
    routeWorkerReady = false;
    pendingInitId = null;
    pendingPlanId = null;
    latestExplainId = null;
    routeWorkerRequests.clear();
    minimapStatus.textContent = `Rota Worker kullanılamıyor: ${event.message || 'çalışma hatası'}.`;
    updateRouteButton();
  });
  return routeWorker;
}

function initializeRouteWorker() {
  if (!layers.dtm.available || !terrain) return;
  const worker = ensureRouteWorker();
  const values = new Float32Array(layers.dtm.values);
  const dataView = new DataView(new ArrayBuffer(4));
  dataView.setUint32(0, layers.dtm.noDataBits, true);
  const noDataValue = dataView.getFloat32(0, true);
  const request = { type: 'init-window', id: ++routeWorkerId, window: {
    elevation: values, rows: layers.dtm.rows, cols: layers.dtm.cols, cellSizeM: layers.dtm.cellSizeM,
    nwXM: terrain.bounds.nwXM, nwYM: terrain.bounds.nwYM, noDataValue,
    validMin: layers.dtm.validMin, validMax: layers.dtm.validMax,
  } };
  pendingInitId = request.id;
  routeWorkerRequests.set(request.id, { kind: 'init' });
  routeWorkerReady = false;
  minimapStatus.textContent = 'Planlama alanı Worker içinde hazırlanıyor…';
  worker.postMessage(request, [values.buffer]);
}

function renderCellExplanation(result) {
  minimapCellExplanation.hidden = false;
  minimapCellExplanation.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = 'Hücre açıklaması'; minimapCellExplanation.append(heading);
  const entries = [
    ['Durum', result?.cellStatus || result?.status || 'bilinmiyor'],
    ['Yürünebilirlik puanı', Number.isFinite(result?.score) ? `${result.score}/100` : 'üretilmiyor'],
    ['Eğim', Number.isFinite(result?.slopeDeg) ? `${result.slopeDeg.toFixed(2)}°` : 'bilinmiyor'],
    ['Pürüzlülük', Number.isFinite(result?.roughnessM) ? `${result.roughnessM.toFixed(3)} m` : 'bilinmiyor'],
    ['Açıklama', result?.reason || result?.caveatTR || 'Veri açıklaması yok'],
  ];
  for (const [label, value] of entries) { const p = document.createElement('p'); p.textContent = `${label}: ${value}`; minimapCellExplanation.append(p); }
  if (Array.isArray(result?.components)) for (const component of result.components) {
    const p = document.createElement('p'); p.textContent = `${component.name}: ${component.formula}`; minimapCellExplanation.append(p);
  }
}

function explainMinimapCell(point) {
  if (!routeWorkerReady) { minimapStatus.textContent = 'Hücre açıklaması için planlama alanı henüz hazır değil.'; return; }
  const id = ++routeWorkerId;
  if (latestExplainId !== null) routeWorkerRequests.delete(latestExplainId);
  latestExplainId = id;
  routeWorkerRequests.set(id, { kind: 'explain' });
  minimapCellExplanation.hidden = false; minimapCellExplanation.textContent = 'Hücre açıklaması alınıyor…';
  ensureRouteWorker().postMessage({ type: 'explain-cell', id, point });
}

function planMinimapRoute() {
  if (!routeWorkerReady || pendingPlanId !== null || pendingInitId !== null || !minimapEndpoints.start || !minimapEndpoints.end) return;
  const id = ++routeWorkerId;
  activeRoute = null;
  preparePlannedRouteGuide();
  minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null });
  renderRouteSummary({ status: 'pending', reason: 'Rota hesaplanıyor' });
  pendingPlanId = id;
  const prefKey = minimapRoutePreference?.value ?? 'balanced';
  routeWorkerRequests.set(id, { kind: 'plan', endpointRevision, preference: prefKey });
  minimapStatus.textContent = 'Rota hesaplanıyor… Planlama göstergesi — güvenli rota sertifikası değildir.';
  updateRouteButton();
  ensureRouteWorker().postMessage({
    type: 'plan-walking-route',
    id,
    startLocal: minimapEndpoints.start,
    endLocal: minimapEndpoints.end,
    options: { preference: prefKey },
  });
}

function refreshMinimapOverlays() {
  minimapController.setOverlays({
    geologySegments: geologySegmentsLocal,
    archiveTraverse,
    geologyVisible: minimapGeologyToggle.checked && geologyLayerVisible,
    archiveVisible: minimapArchiveToggle.checked && $('toggle-archive-traverse').checked,
    orthoOverlay,
    orthoVisible: minimapOrthoToggle ? minimapOrthoToggle.checked : true,
  });
  const geologyText = geologyStatus === 'ready' ? 'hazır' : geologyStatus === 'loading' ? 'yükleniyor' : 'kullanılamıyor';
  const archiveText = archiveTraverseStatus === 'ready' ? 'hazır' : archiveTraverseStatus === 'loading' ? 'yükleniyor' : 'kullanılamıyor';
  minimapLayerStatus.textContent = `Jeoloji: ${geologyText} · Arşiv izi: ${archiveText}`;
}

function setMinimapPickMode(kind) {
  minimapController.setSelectionMode(kind);
  $('minimap-pick-start').setAttribute('aria-pressed', String(kind === 'start'));
  $('minimap-pick-end').setAttribute('aria-pressed', String(kind === 'end'));
  minimapStatus.textContent = `${kind === 'start' ? 'Başlangıç' : 'Bitiş'} koordinatını seçin. Seçim geçilebilirlik veya rota üretmez.`;
}

$('minimap-pick-start').addEventListener('click', () => setMinimapPickMode('start'));
$('minimap-pick-end').addEventListener('click', () => setMinimapPickMode('end'));
$('minimap-plan-route').addEventListener('click', planMinimapRoute);
minimapRoutePreference?.addEventListener('change', () => {
  if (minimapEndpoints.start && minimapEndpoints.end && routeWorkerReady) {
    planMinimapRoute();
  }
});
minimapHeatmapToggle.addEventListener('change', () => {
  minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: activeRoute?.status === 'ok' ? activeRoute.path : null, segments: activeRoute?.status === 'ok' ? activeRoute.segments : null });
});
$('minimap-fit').addEventListener('click', () => minimapController.fit());
$('minimap-clear-points').addEventListener('click', () => {
  minimapEndpoints = { start: null, end: null };
  endpointRevision++;
  minimapStartLabel.textContent = 'Seçilmedi';
  minimapEndLabel.textContent = 'Seçilmedi';
  minimapController.setEndpoints(minimapEndpoints);
  minimapController.setSelectionMode(null);
  $('minimap-pick-start').setAttribute('aria-pressed', 'false');
  $('minimap-pick-end').setAttribute('aria-pressed', 'false');
  if (pendingPlanId !== null) routeWorkerRequests.delete(pendingPlanId);
  pendingPlanId = null;
  minimapStatus.textContent = 'Noktalar temizlendi. Yeni başlangıç ve bitiş seçerek yeniden planlayın.';
  activeRoute = null;
  preparePlannedRouteGuide();
  minimapController.setPlanning({ heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null });
  renderRouteSummary({ status: 'idle', reason: 'Noktalar temizlendi' });
  updateRouteButton();
});
minimapGeologyToggle.addEventListener('change', () => {
  geologyLayerVisible = minimapGeologyToggle.checked;
  geologyToggle.checked = geologyLayerVisible;
  refreshMinimapOverlays();
  updateHud();
});
minimapArchiveToggle.addEventListener('change', refreshMinimapOverlays);
minimapOrthoToggle?.addEventListener('change', refreshMinimapOverlays);
selectOrthoMode?.addEventListener('change', () => {
  const mode = selectOrthoMode.value;
  if (orthoOverlay) orthoOverlay.mode = mode;
  renderer3d?.setOrthoMode?.(mode);
  refreshMinimapOverlays();
});
refreshMinimapOverlays();

try {
  if (forceWebgl2Failure) throw new Error('Test-only forced WebGL2 initialization failure');
  renderer3d = createTerrainRenderer(canvas3d, {
    collectDiagnostics: debugEnabled,
    lightDirection: marsSunDirection({ latitudeDeg: WAYPOINTS[0].latDeg, solarLongitudeDeg: 0, trueSolarHour: 15 }),
  });
  if (orthoOverlay) renderer3d.setOrthoOverlay(orthoOverlay);
} catch (error) {
  renderer3dError = error;
  view3dBtn.disabled = true;
  view3dBtn.title = 'Bu tarayıcıda WebGL2 kullanılamıyor.';
  viewStatus.textContent = `3D görünüm kullanılamıyor: ${error.message}. 2D harita kullanılabilir.`;
  viewStatus.hidden = false;
}

function updateViewControls() {
  const is3d = activeView === '3d';
  view2dBtn.setAttribute('aria-pressed', String(!is3d));
  view3dBtn.setAttribute('aria-pressed', String(is3d));
  view3dBtn.disabled = !renderer3d || !layers.dtm.available || Boolean(terrainMeshError);
  view3dBtn.textContent = terrainMeshError
    ? '3D kullanılamıyor'
    : !renderer3d
      ? '3D desteklenmiyor'
      : !layers.dtm.available
        ? (layers.dtm.descriptor.access.reason === 'Yükleniyor…' ? '3D DTM yükleniyor…' : '3D DTM yok')
        : '3D';
  canvas2d.hidden = is3d;
  canvas3d.hidden = !is3d;
  viewNote.hidden = !is3d;
  if (fpReticle) {
    fpReticle.hidden = !is3d;
    if (!is3d) fpReticle.classList.remove('locked');
  }
  if (fpHudHint) {
    fpHudHint.hidden = !is3d;
  }
}

function updateScaleUi() {
  const scaleText = $('scale-indicator-text');
  if (scaleText) {
    scaleText.textContent = currentVerticalScale === 1
      ? 'Dikey ölçek: 1× gerçek Mars kotu (bilimsel 1:1).'
      : `Dikey ölçek: ${currentVerticalScale}× görsel sunum abartısıdır.`;
  }
  if (selectVerticalScale && Number(selectVerticalScale.value) !== currentVerticalScale) {
    selectVerticalScale.value = String(currentVerticalScale);
  }
  if (activeView === '3d') {
    const isLocked = document.pointerLockElement === canvas3d;
    viewNote.textContent = isLocked ? `${getFirstPersonNote()} Fare kilitli.` : getFirstPersonNote();
  }
  hud.updateScaleBadge?.(currentVerticalScale);
}

function rebuildTerrainMeshForScale(newScale) {
  if (![1, 2, 3].includes(newScale)) return;
  currentVerticalScale = newScale;
  if (!layers.dtm.available || typeof layers.dtm.cellState !== 'function') {
    updateScaleUi();
    return;
  }
  const stats = layers.dtm.descriptor?.quality?.windowStats;
  if (!Number.isFinite(stats?.min) || !Number.isFinite(stats?.max)) {
    updateScaleUi();
    return;
  }
  const referenceElevationM = terrainMesh?.displayConfig?.referenceElevationM ?? ((stats.min + stats.max) / 2);
  const displayConfig = {
    referenceElevationM,
    verticalScale: currentVerticalScale,
  };
  const buildStartedAt = performance.now();
  let prepared;
  try {
    prepared = buildTerrainMesh(layers.dtm, displayConfig);
  } finally {
    terrainMeshBuildMs = performance.now() - buildStartedAt;
  }
  if (!prepared.indices.length) throw new Error('DTM penceresinde çizilebilir geçerli terrain quad’ı bulunamadı.');
  terrainMesh = prepared;
  renderer3d?.setTerrainMesh?.(terrainMesh);
  archiveTraverse3d = null;
  combinedArchiveMarkers = null;
  archiveMarkerBase = null;
  markerMesh = null;
  prepareArchiveDisplay();
  geologyLinePositions = buildGeologyLinePositions();
  build3dMarkersOnce();
  preparePlannedRouteGuide();
  updateScaleUi();
}

function build3dTerrainOnce() {
  if (terrainMesh) return terrainMesh;
  if (!layers.dtm.available || typeof layers.dtm.cellState !== 'function') {
    throw new Error('Doğrulanmış HiRISE DTM mesh oluşturmak için kullanılamıyor.');
  }
  const stats = layers.dtm.descriptor?.quality?.windowStats;
  if (!Number.isFinite(stats?.min) || !Number.isFinite(stats?.max)) {
    throw new Error('DTM penceresinin kot aralığı bulunamadı; görsel referans kotu belirlenemiyor.');
  }
  // Presentation origin is the loaded fixture's range midpoint; vertical exaggeration is visual only.
  const displayConfig = {
    referenceElevationM: (stats.min + stats.max) / 2,
    verticalScale: currentVerticalScale,
  };
  const buildStartedAt = performance.now();
  let prepared;
  try {
    prepared = buildTerrainMesh(layers.dtm, displayConfig);
  } finally {
    terrainMeshBuildMs = performance.now() - buildStartedAt;
  }
  if (!prepared.indices.length) throw new Error('DTM penceresinde çizilebilir geçerli terrain quad’ı bulunamadı.');
  terrainMesh = prepared;
  prepareArchiveDisplay();
  geologyLinePositions = buildGeologyLinePositions();
  build3dMarkersOnce();
  preparePlannedRouteGuide();
  updateScaleUi();
  return terrainMesh;
}

function preparePlannedRouteGuide() {
  plannedRouteLinePositions = activeRoute?.status === 'ok' && terrainMesh
    ? buildPlannedRouteLinePositions({
      route: activeRoute,
      surfaceProvider: layers.dtm,
      displayConfig: terrainMesh.displayConfig,
      liftDisplayM: 0.28,
      ribbonHalfWidthM: 0.22,
    })
    : new Float32Array();
  plannedRouteRibbon = null;
  plannedRoutePathCumulativeM = [];
  if (activeRoute?.status !== 'ok' || !terrainMesh || !Array.isArray(activeRoute.path)) return;

  const path = activeRoute.path;
  plannedRoutePathCumulativeM = [0];
  for (let i = 1; i < path.length; i++) {
    plannedRoutePathCumulativeM.push(plannedRoutePathCumulativeM[i - 1] + Math.hypot(path[i].xM - path[i - 1].xM, path[i].yM - path[i - 1].yM));
  }
  const ribbon = buildRouteRibbon({
    path,
    segments: activeRoute.segments,
    sampleElevation: (xM, yM) => layers.dtm.sampleElevation(xM, yM),
    displayConfig: terrainMesh.displayConfig,
    sampleSpacingM: 1.5,
    provenance: { source: 'active route planner result', mode: activeRoute.mode ?? null },
  });
  const colorsRgb = new Float32Array(ribbon.positions.length);
  const hasAlignedScores = Array.isArray(activeRoute.segments) && activeRoute.segments.length === path.length - 1;
  for (let vertex = 0; vertex < ribbon.vertexCount; vertex++) {
    const alongM = ribbon.uvs[vertex * 2];
    let segmentIndex = 0;
    while (segmentIndex + 1 < plannedRoutePathCumulativeM.length - 1 && alongM > plannedRoutePathCumulativeM[segmentIndex + 1]) segmentIndex++;
    colorsRgb.set(routeScoreColor(hasAlignedScores ? activeRoute.segments[segmentIndex]?.score : null), vertex * 3);
  }
  plannedRouteRibbon = { ...ribbon, colorsRgb };
}

function routeScoreColor(score) {
  if (!Number.isFinite(score)) return [0.74, 0.82, 0.84];
  const value = Math.max(0, Math.min(100, score));
  if (value <= 50) {
    const t = value / 50;
    return [0.96 + 0.04 * t, 0.24 + 0.34 * t, 0.20 - 0.08 * t];
  }
  const t = (value - 50) / 50;
  return [1 - 0.72 * t, 0.58 + 0.34 * t, 0.12 + 0.58 * t];
}

function plannedRoutePulseDistance(player) {
  const path = activeRoute?.status === 'ok' ? activeRoute.path : null;
  if (!Array.isArray(path) || path.length < 2 || !Number.isFinite(player?.xM) || !Number.isFinite(player?.yM)) return 0;
  let bestDistanceSq = Infinity;
  let alongM = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.xM - a.xM, dy = b.yM - a.yM;
    const lengthSq = dx * dx + dy * dy;
    if (!(lengthSq > 0)) continue;
    const t = Math.max(0, Math.min(1, ((player.xM - a.xM) * dx + (player.yM - a.yM) * dy) / lengthSq));
    const x = a.xM + dx * t, y = a.yM + dy * t;
    const distanceSq = (player.xM - x) ** 2 + (player.yM - y) ** 2;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      alongM = (plannedRoutePathCumulativeM[i] ?? 0) + Math.sqrt(lengthSq) * t;
    }
  }
  const totalM = plannedRoutePathCumulativeM.at(-1) ?? 0;
  return Math.min(totalM, alongM + 18);
}

function prepareArchiveDisplay() {
  if (!archiveTraverse || !terrainMesh) return;
  try {
    archiveTraverse3d = prepareArchiveTraverse3d(archiveTraverse, layers.dtm, terrainMesh.displayConfig);
  } catch (error) {
    console.warn('Arşiv sürüş izinin 3D katmanı hazırlanamadı:', error);
  }
}

function displayedMarkerMesh() {
  const base = markerMesh || build3dMarkersOnce();
  if (!$('toggle-archive-traverse').checked || !archiveTraverse3d) return base;
  if (base !== archiveMarkerBase || !combinedArchiveMarkers) {
    archiveMarkerBase = base;
    combinedArchiveMarkers = combineTraverseMarkers(base, archiveTraverse3d.markers);
  }
  return combinedArchiveMarkers;
}

async function loadArchiveTraverse() {
  const status = $('archive-traverse-status');
  status.textContent = 'MMGIS sürüş arşivi yükleniyor…';
  try {
    const files = ['M20_traverse.json', 'M20_waypoints.json'];
    const [traverse, stops] = await Promise.all(files.map(async (file) => {
      const response = await fetch(`data/mars-trek/${file}`);
      if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
      return response.json();
    }));
    archiveTraverse = prepareArchiveTraverse(traverse, stops, adapter, {
      ...sim.route, corridorHalfWidthM: sim.corridorHalfWidthM,
    });
    archiveTraverseStatus = 'ready';
    prepareArchiveDisplay();
    const { polylineLengthM, straightLengthM } = archiveTraverse.comparison;
    status.textContent = `Sürüş arşivi: Sol 116 Site 4 Drive 1250 → Sol 157 Site 6 Drive 0. Sol 120 ve 164 görüntü kayıtlarına aittir. Yerel harita düzleminde arşiv izi ${polylineLengthM.toFixed(0)} m, senaryo düz hattı ${straightLengthM.toFixed(0)} m.`;
    refreshMinimapOverlays();
  } catch (error) {
    archiveTraverseStatus = 'unavailable';
    status.textContent = 'MMGIS sürüş arşivi kullanılamıyor.';
    refreshMinimapOverlays();
    console.warn('MMGIS sürüş arşivi yüklenemedi:', error);
  }
}

function buildGeologyLinePositions() {
  if (!geologySegmentsLocal.length) return new Float32Array();
  const { referenceElevationM, verticalScale } = terrainMesh.displayConfig;
  const cellSizeM = layers.dtm.cellSizeM;
  if (!Number.isFinite(cellSizeM) || cellSizeM <= 0) return new Float32Array();
  const maxStepM = cellSizeM * 0.25;
  const positions = [];
  for (const segment of geologySegmentsLocal) {
    for (let i = 1; i < segment.xy.length; i++) {
      const [ax, ay] = segment.xy[i - 1], [bx, by] = segment.xy[i];
      const distanceM = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(distanceM / maxStepM));
      let previous = null;
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const sample = layers.dtm.sampleElevation(x, y);
        if (sample.status !== 'ok' || !Number.isFinite(sample.value)) {
          // Break the line at every invalid sub-sample. Never bridge across a no-data interval.
          previous = null;
          continue;
        }
        const current = [x, y, (sample.value - referenceElevationM) * verticalScale + 0.04];
        if (previous) positions.push(...previous, ...current);
        previous = current;
      }
    }
  }
  return new Float32Array(positions);
}

function isExpectedGeologyManifest(manifest) {
  const citation = typeof manifest?.citation === 'string' ? manifest.citation.toLowerCase() : '';
  const title = typeof manifest?.title === 'string' ? manifest.title.toLowerCase() : '';
  const cs = manifest?.coordinate_system;
  const exportCrs = typeof cs?.geojson_export_crs === 'string' ? cs.geojson_export_crs.toLowerCase() : '';
  const projection = typeof cs?.native_projection === 'string' ? cs.native_projection.toLowerCase() : '';
  const datum = typeof cs?.reference_datum === 'string' ? cs.reference_datum.toLowerCase() : '';
  const lonLatOrder = exportCrs.includes('planetocentric') && exportCrs.includes('longitude/latitude')
    && exportCrs.includes('x=lon°e') && exportCrs.includes('y=lat°n');
  const expectedRadiusM = MAP_FRAME.radiusKm * 1000;
  const radiusMatches = [cs?.radius_equatorial_m, cs?.radius_polar_m].every((radius) =>
    Number.isFinite(radius) && Math.abs(radius - expectedRadiusM) <= 1,
  );
  // EPSG:4326 is a generic Earth CRS label and is not accepted as evidence of Mars coordinates.
  return title.includes('sim 3464') && citation.includes('sun') && citation.includes('stack')
    && citation.includes('2020') && citation.includes('10.3133/sim3464')
    && lonLatOrder && projection.includes('mars transverse mercator')
    && datum === 'mars 2000 sphere' && radiusMatches
    && String(cs?.central_meridian ?? '').includes('77.5');
}

function build3dMarkersOnce() {
  if (markerMesh) return markerMesh;
  if (!layers.dtm.available || !terrainMesh) return null;
  try {
    markerMesh = buildMarkerMeshes({
      waypoints,
      route: { a: waypoints[0].local, b: waypoints[1].local },
      corridorHalfWidthM: sim.corridorHalfWidthM,
      displayConfig: terrainMesh.displayConfig,
      surfaceProvider: layers.dtm,
    });
  } catch (error) {
    markerMeshError = error;
    console.warn('3D marker mesh hazırlanamadı:', error);
  }
  return markerMesh;
}

function setActiveView(view) {
  activeView = view;
  updateViewControls();
}

async function selectView(view) {
  const requestId = ++viewRequestId;
  if (view !== '3d') {
    if (document.pointerLockElement === canvas3d) document.exitPointerLock();
    setActiveView('2d');
    if (!terrainMeshError && renderer3d) viewStatus.hidden = true;
    return;
  }
  if (!renderer3d) {
    viewStatus.textContent = `3D görünüm kullanılamıyor: ${renderer3dError?.message ?? 'WebGL2 başlatılamadı'}. 2D harita kullanılabilir.`;
    viewStatus.hidden = false;
    return;
  }
  if (!layers.dtm.available) {
    viewStatus.textContent = '3D terrain için HiRISE DTM kullanılamıyor; 2D görünüm açık kalıyor.';
    viewStatus.hidden = false;
    return;
  }
  const initialElevation = lastSnapshot?.surface?.elevation;
  if (sim.bodyWorldZM === null && initialElevation?.status === 'ok' && Number.isFinite(initialElevation.value)) {
    sim.resolveSurfaceContact(initialElevation);
    updateHud();
  }
  if (!Number.isFinite(lastSnapshot?.astronaut?.bodyWorldZM)) {
    viewStatus.textContent = 'Birinci şahıs 3D için başlangıç konumunda geçerli HiRISE DTM kotu gerekir; mevcut kot bilinmiyor. 2D görünüm açık kalıyor.';
    viewStatus.hidden = false;
    return;
  }
  if (!terrainMesh) {
    view3dBtn.disabled = true;
    viewStatus.textContent = '3D terrain hazırlanıyor…';
    viewStatus.hidden = false;
    // Let the status message paint before the one-time CPU mesh build on the main thread.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // A newer 2D/3D choice supersedes this pending request.
    if (requestId !== viewRequestId) return;
    try {
      build3dTerrainOnce();
    } catch (error) {
      terrainMeshError = error;
      viewStatus.textContent = `3D terrain hazırlanamadı: ${error.message}. 2D görünüm açık kalıyor.`;
      viewStatus.hidden = false;
      updateViewControls();
      return;
    }
  }
  if (requestId !== viewRequestId) return;
  if (!hasEntered3dOnce) {
    camera3d.yawRad = targetYawRad;
    sim.headingRad = targetYawRad;
    hasEntered3dOnce = true;
  } else {
    camera3d.yawRad = sim.headingRad;
  }
  setActiveView('3d');
  viewNote.textContent = getFirstPersonNote();
  viewStatus.hidden = true;
}

function resolveGeologicContext(xM, yM) {
  const position = { xM, yM };
  if (geologyRegistry) {
    const { latDeg, lonDeg } = adapter.localToLatLon(xM, yM);
    const best = lookupBestGeologicUnit(geologyRegistry, { lonDeg, latDeg });
    const geology = {
      ...best.snapshot,
      sourceMapId: best.sourceMapId,
      mapScale: best.mapScale ?? best.snapshot.mapScale,
      mapScaleDenominator: best.mapScaleDenominator,
      fallbackChain: best.fallbackChain,
      conflict: best.conflict,
    };
    const contact = geology.status === 'ok' || geology.status === 'ambiguous'
      ? nearestGeologicContactM(geologyContactField, position) : null;
    return { geology, contactDistanceM: contact?.distanceM ?? null };
  }
  const lookup = geologyIndex ? lookupGeologicUnitLocal(geologyIndex, adapter, position) : null;
  const base = toGeologySnapshot(lookup, geologyIndex);
  const geology = {
    ...base,
    sourceMapId: null,
    mapScaleDenominator: null,
    fallbackChain: [],
    conflict: null,
  };
  const contact = geology.status === 'ok' || geology.status === 'ambiguous'
    ? nearestGeologicContactM(geologyContactField, position) : null;
  return { geology, contactDistanceM: contact?.distanceM ?? null };
}

function buildSnapshot() {
  const { geology, contactDistanceM } = resolveGeologicContext(sim.pos.x, sim.pos.y);
  lastSnapshot = createWorldSnapshot({
    sim,
    surfaceProvider: layers.dtm,
    adapter,
    waypoints,
    routeNote: ROUTE_ORIGIN_NOTE,
    geology,
    geologyLayerStatus: geologyStatus,
    geologyContactDistanceM: contactDistanceM,
  });
  return lastSnapshot;
}

function resetFootprints() {
  footprintTrail.reset();
  footprintTrailSnapshot = footprintTrail.getSnapshot();
  lastMinimapFootprintRefreshS = -Infinity;
  minimapController.setOverlays({ footprintTrail: footprintTrailSnapshot });
}

function updateFootprints(snapshot) {
  const astronaut = snapshot.astronaut;
  const movement = astronaut.movement;
  const is2d = activeView === '2d';
  footprintTrail.update({
    timeS: snapshot.simTimeS,
    xM: astronaut.xM,
    yM: astronaut.yM,
    headingRad: astronaut.headingRad,
    gaitDistanceM: movement.gaitDistanceM,
    grounded: is2d ? astronaut.elevationStatus === 'ok' : movement.grounded,
    airborne: is2d ? false : movement.airborne,
    landingRecoveryFrac: movement.landingRecoveryFrac,
  });
  footprintTrailSnapshot = footprintTrail.getSnapshot();
  const countChanged = footprintTrailSnapshot.count !== updateFootprints.lastCount;
  // The minimap is a low-rate overview; avoid redrawing it at display refresh rate.
  if (countChanged || snapshot.simTimeS - lastMinimapFootprintRefreshS >= 1) {
    minimapController.setOverlays({ footprintTrail: footprintTrailSnapshot });
    lastMinimapFootprintRefreshS = snapshot.simTimeS;
  }
  updateFootprints.lastCount = footprintTrailSnapshot.count;
}

async function loadGeology() {
  try {
    const [geoResponse, manifestResponse] = await Promise.all([
      fetch('/data/usgs-sim3464-geology/jezero_geounits_corridor.geojson'),
      fetch('/data/usgs-sim3464-geology/manifest.json'),
    ]);
    if (!geoResponse.ok || !manifestResponse.ok) throw new Error(`HTTP ${geoResponse.status}/${manifestResponse.status}`);
    const [geojson, manifest] = await Promise.all([geoResponse.json(), manifestResponse.json()]);
    if (!isExpectedGeologyManifest(manifest)) throw new Error('Jeoloji manifesti SIM 3464 / Mars koordinat çerçevesiyle uyuşmuyor');
    geologyIndex = createGeologyIndex(geojson, { source: manifest });
    if (!geologyIndex.counts.acceptedFeatures || geologyIndex.counts.skippedFeatures > 0) {
      throw new Error('Jeoloji verisinde poligon atlandı; kısmi katman kullanılmadı');
    }
    geologyRegistry = createGeologyRegistry([{
      id: 'usgs_sim3464_2020',
      index: geologyIndex,
      mapScaleDenominator: geologyIndex.provenance?.scaleDenominator ?? 75000,
      positionalUncertaintyM: geologyIndex.provenance?.positionalUncertaintyM ?? GEOLOGY_POSITIONAL_UNCERTAINTY_M,
      license: geologyIndex.provenance?.license ?? GEOLOGY_LICENSE_NOT_STATED,
      citation: geologyIndex.provenance?.citation ?? 'Sun & Stack (2020), USGS SIM 3464',
      unitScheme: 'usgs-sim3464',
    }]);
    geologyContactField = createGeologicContactField(geologyIndex, adapter);
    geologySegmentsLocal = uniqueGeologySegments(geologyContactField.polylines);
    if (terrainMesh) geologyLinePositions = buildGeologyLinePositions();
    geologyStatus = 'ready';
    refreshMinimapOverlays();
    updateHud();
  } catch (error) {
    geologyIndex = null;
    geologyRegistry = null;
    geologyContactField = null;
    geologySegmentsLocal = [];
    geologyLinePositions = new Float32Array();
    geologyStatus = 'unavailable';
    refreshMinimapOverlays();
    console.warn('USGS jeoloji katmanı kullanılamıyor:', error);
    updateHud();
  }
}

function uniqueGeologySegments(segments) {
  const seen = new Set();
  const unique = [];
  for (const segment of segments) {
    for (let i = 1; i < segment.xy.length; i++) {
      const a = segment.xy[i - 1], b = segment.xy[i];
      const ka = `${a[0].toFixed(6)},${a[1].toFixed(6)}`;
      const kb = `${b[0].toFixed(6)},${b[1].toFixed(6)}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ ...segment, xy: [a, b] });
    }
  }
  return unique;
}

const hud = createHud({
  waypoints,
  routeLengthM: sim.metrics().routeLengthM,
  corridorHalfWidthM: sim.corridorHalfWidthM,
  scenario: SCENARIO,
  routeOriginNote: ROUTE_ORIGIN_NOTE,
  sources: SOURCES,
});

const roverGallery = createRoverGallery({
  container: $('rover-gallery'),
  stops: createStops({
    waypoints,
    toLocal(latDeg, lonDeg) {
      const { x, y } = adapter.latLonToLocal(latDeg, lonDeg);
      return { xM: x, yM: y };
    },
  }),
  onPointCamera: (look) => {
    if (activeView === '3d') setFirstPersonLook(camera3d, look);
  },
});

function updateHudFromSnapshot(snapshot) {
  hud.updateHud(snapshot, {
    plannedRouteGuidance: derivePlannedRouteGuidance({
      route: activeRoute,
      position: snapshot.astronaut,
      headingRad: snapshot.astronaut.headingRad,
      surface: snapshot.surface,
      heatmap: routeHeatmap,
    }),
    showPlannedRouteGuidance: activeView === '3d',
  });
  roverGallery.update(snapshot.astronaut, { firstPerson: activeView === '3d' });
}

const updateHud = () => updateHudFromSnapshot(buildSnapshot());

async function loadRoverGallery() {
  try {
    const response = await fetch('data/perseverance-raw/manifest.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    roverGallery.setManifest(await response.json());
  } catch (error) {
    roverGallery.setManifest(null);
    console.warn('Perseverance fotoğraf arşivi kullanılamıyor:', error);
  }
  updateHud();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Görsel yüklenemedi: ${src}`));
    img.src = src;
  });
}

async function loadOrthoMosaics() {
  try {
    let orthoLayerMod = null;
    try {
      orthoLayerMod = await import('./surface/ortho-layer.js');
    } catch (err) {
      console.warn('ortho-layer.js modülü dinamik yüklenemedi:', err);
    }

    const [z17ManifestResp, z14ManifestResp] = await Promise.all([
      fetch(ORTHO_MOSAIC_SOURCES.z17Manifest),
      fetch(ORTHO_MOSAIC_SOURCES.z14Manifest),
    ]);
    if (!z17ManifestResp.ok || !z14ManifestResp.ok) {
      throw new Error(`Manifest HTTP hatası: z17=${z17ManifestResp.status}, z14=${z14ManifestResp.status}`);
    }
    const [z17Manifest, z14Manifest] = await Promise.all([
      z17ManifestResp.json(),
      z14ManifestResp.json(),
    ]);

    const [z17Img, z14Img] = await Promise.all([
      loadImage(ORTHO_MOSAIC_SOURCES.z17Image),
      loadImage(ORTHO_MOSAIC_SOURCES.z14Image),
    ]);

    let fineLayer = null;
    let coarseLayer = null;
    let descriptor = null;

    if (orthoLayerMod?.createOrthoLayer) {
      fineLayer = orthoLayerMod.createOrthoLayer(z17Manifest);
      coarseLayer = orthoLayerMod.createOrthoLayer(z14Manifest);
      if (orthoLayerMod.createMultiZoomOrthoDescriptor) {
        descriptor = orthoLayerMod.createMultiZoomOrthoDescriptor({
          fineLayer,
          coarseLayer,
          mode: selectOrthoMode?.value ?? ORTHO_MOSAIC_SOURCES.defaultMode,
        });
      }
    } else {
      const makeLayer = (m) => {
        const b = m.window.localBoundsM;
        const uv = m.uvMapping;
        return {
          available: true,
          zoom: m.product.zoom,
          layerId: m.product.layerId,
          gsdM: m.groundSampleDistance.northSouthM,
          localBoundsM: { ...b },
          renderBoundsM: { nwXM: b.xMin, nwYM: b.yMax, widthM: b.xMax - b.xMin, heightM: b.yMax - b.yMin },
          uvMapping: { ...uv },
          uvTransformVec4: new Float32Array([uv.uScale, uv.uOffset, uv.vScale, uv.vOffset]),
          attribution: 'NASA Mars Trek / USGS Astrogeology / HiRISE',
          registration: m.registration,
        };
      };
      fineLayer = makeLayer(z17Manifest);
      coarseLayer = makeLayer(z14Manifest);
    }

    const mode = selectOrthoMode?.value ?? ORTHO_MOSAIC_SOURCES.defaultMode;
    orthoOverlay = {
      mode,
      fine: {
        layer: fineLayer,
        image: z17Img,
        renderBoundsM: fineLayer.renderBoundsM,
        uvTransformVec4: fineLayer.uvTransformVec4,
      },
      coarse: {
        layer: coarseLayer,
        image: z14Img,
        renderBoundsM: coarseLayer.renderBoundsM,
        uvTransformVec4: coarseLayer.uvTransformVec4,
      },
      descriptor,
    };

    if (renderer3d) {
      renderer3d.setOrthoOverlay(orthoOverlay);
    }
    refreshMinimapOverlays();

    layers.orthoMosaic = {
      descriptor: {
        title: 'USGS/NASA MRO HiRISE Kontrollü Ortomozaik (WMTS z17/z14)',
        product: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
        version: 'WMTS z17/z14',
        body: 'MARS',
        source: 'NASA JPL Mars Trek / USGS Astrogeology',
        attribution: 'USGS Astrogeology / NASA / JPL-Caltech / Univ. of Arizona',
        license: 'Lisans: kaynakta belirtilmemiş',
        unit: 'Albedo (gri tonlama albedo)',
        crs: 'urn:ogc:def:crs:EPSG::104905 (Equirectangular Mars 2000 Sphere)',
        pixelScaleM: fineLayer.gsdM,
        access: { status: 'ok' },
        validation: { status: 'supported', summary: 'WMTS karo projeksiyon aritmetiğiyle hizalandı (Stage 39A)' },
        size: {
          rows: fineLayer.mosaicMeta?.heightPx ?? 2304,
          cols: fineLayer.mosaicMeta?.widthPx ?? 1536,
          pixelRegistration: 'PIXEL_IS_AREA (WMTS)',
        },
        coverage: { description: 'Jezero krateri rover keşif koridoru (z17: 0.318 m/px) ve tüm DTM penceresi (z14: 2.544 m/px)' },
        timeCoverage: 'MRO HiRISE arşiv ürünü',
        quality: { registration: { note: 'WMTS projeksiyon aritmetiği; görsel kayaç kontrolü doğrulanmadı' } },
      },
    };
    hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM);

    if (orthoStatus) {
      const gsd17 = (fineLayer.gsdM || 0.318).toFixed(3);
      const gsd14 = (coarseLayer.gsdM || 2.544).toFixed(3);
      orthoStatus.textContent = `HiRISE WMTS Ortomozaik: z17 (${gsd17} m/px) ve z14 (${gsd14} m/px) yüklendi · WMTS projeksiyon aritmetiği · ${ORTHO_MOSAIC_SOURCES.licenseNotice}`;
    }
  } catch (err) {
    console.warn('HiRISE ortomozaik yüklenemedi:', err);
    if (orthoStatus) {
      orthoStatus.textContent = `HiRISE WMTS Ortomozaik: Yüklenemedi (${err.message}) · DTM kabartması gösterilmeye devam ediliyor.`;
    }
  }
}

void loadRoverGallery();
geologyToggle?.addEventListener('change', () => {
  geologyLayerVisible = geologyToggle.checked;
  minimapGeologyToggle.checked = geologyLayerVisible;
  refreshMinimapOverlays();
  updateHud();
});
$('toggle-archive-traverse').addEventListener('change', refreshMinimapOverlays);
void loadGeology();
void loadArchiveTraverse();
void loadOrthoMosaics();

const { keys } = bindControls({
  mapEl: mapWrap,
  lookEl: canvas3d,
  view2dBtn,
  view3dBtn,
  pauseBtn: $('btn-pause'),
  restartBtn: $('btn-restart'),
  corridorInput: $('in-corridor'),
  corridorMin: SCENARIO.corridorHalfWidthMinM,
  corridorMax: SCENARIO.corridorHalfWidthMaxM,
  initialCorridor: sim.corridorHalfWidthM,
  onTogglePause: () => { sim.togglePause(); updateHud(); },
  onRestart: () => {
    sim.restart();
    resetFootprints();
    hasEntered3dOnce = false;
    camera3d.yawRad = targetYawRad;
    camera3d.dynamicPitchOffsetRad = 0;
    camera3d.dynamicRollOffsetRad = 0;
    camera3d.dynamicEyeOffsetM = 0;
    updateHud();
  },
  onZoom: (factor) => {
    camera.zoom(factor);
    zoomCamera(camera3d, 1 / factor);
  },
  onViewChange: (view) => { void selectView(view); },
  isFirstPerson: () => activeView === '3d',
  onLook: (dx, dy) => {
    lookCamera(camera3d, dx, dy);
    sim.headingRad = camera3d.yawRad;
  },
  onPointerLockChange: (locked) => {
    const isLocked = locked && document.pointerLockElement === canvas3d;
    if (fpReticle) {
      fpReticle.classList.toggle('locked', isLocked);
    }
    if (activeView === '3d' && isLocked) {
      viewNote.textContent = `${getFirstPersonNote()} Fare kilitli.`;
    } else if (activeView === '3d') {
      viewNote.textContent = getFirstPersonNote();
    }
  },
  onCorridorChange: (val) => {
    const next = sim.setCorridorHalfWidth(val);
    hud.renderLayerPanel(layers, terrain, next, currentVerticalScale);
    if (terrainMesh && layers.dtm.available) {
      markerMesh = null;
      build3dMarkersOnce();
    }
    updateHud();
    return next;
  },
});

if (selectVerticalScale) {
  selectVerticalScale.value = String(currentVerticalScale);
  selectVerticalScale.addEventListener('change', () => {
    rebuildTerrainMeshForScale(Number(selectVerticalScale.value));
  });
}

btnDemoMode?.addEventListener('click', () => setPresentationMode(!presentationModeActive));
btnHeaderDemo?.addEventListener('click', () => setPresentationMode(!presentationModeActive));
btnClosePresentation?.addEventListener('click', () => setPresentationMode(false));
btnDemoTour?.addEventListener('click', () => void startDemoTour());
btnDemoToggleView?.addEventListener('click', () => void selectView(activeView === '3d' ? '2d' : '3d'));
btnDemoRestart?.addEventListener('click', () => {
  sim.restart();
  resetFootprints();
  hasEntered3dOnce = false;
  camera3d.yawRad = targetYawRad;
  updateHud();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.pointerLockElement && presentationModeActive) {
    setPresentationMode(false);
  }
});

updateViewControls();

hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM, currentVerticalScale);

// Data loading via SurfaceProviderRegistry (app is playable meanwhile)
(async () => {
  const [selection, ortho] = await Promise.all([
    registry.resolveActiveProvider(),
    loadOrthoDescriptor({ baseUrl: 'data' }),
  ]);
  layers.dtm = selection.provider;
  layers.ortho = ortho;
  layers.selectionReport = selection;
  if (layers.dtm.available) {
    try {
      terrain = buildTerrainImage(layers.dtm);
      minimapController.setTerrain(terrain);
    } catch (error) {
      minimapController.setTerrain(null);
      viewStatus.textContent = `2D DTM görseli hazırlanamadı; metre ızgarası kullanılacak. ${error.message}`;
      viewStatus.hidden = false;
    }
  } else {
    minimapController.setTerrain(null);
  }
  minimapController.setDescriptor(layers.dtm.descriptor);
  initializeRouteWorker();
  updateRouteButton();
  updateViewControls();
  hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM, currentVerticalScale);
  updateScaleUi();
  updateHud();

  if (urlParams.get('demo') === '1' || urlParams.get('presentation') === '1') {
    await startDemoTour();
  } else if (startIn3dRequested && layers.dtm.available && renderer3d && !forceWebgl2Failure) {
    await selectView('3d');
  }
})();

// Main animation loop: one immutable WorldSnapshot is shared by the active renderer and HUD.
let last = performance.now(), hudAcc = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  if (activeView === '3d') {
    const move = cameraRelativeMovement(camera3d.yawRad, keys);
    sim.stepFirstPerson(dt, { ...move, jump: keys.jumpPressed, headingRad: camera3d.yawRad }, {
      status: lastSnapshot?.surface?.elevation?.status,
      value: lastSnapshot?.surface?.elevation?.value,
    });
    keys.jumpPressed = false;
  } else {
    sim.step(dt, keys);
  }
  if (activeView === '3d') {
    // Composition root samples current ground after movement; simulation rules only receive the sample.
    sim.resolveSurfaceContact(layers.dtm.sampleElevation(sim.pos.x, sim.pos.y));
  }
  const snapshot = buildSnapshot();
  updateFootprints(snapshot);
  camera.cx = snapshot.astronaut.xM; camera.cy = snapshot.astronaut.yM;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, mapWrap.clientWidth), h = Math.max(1, mapWrap.clientHeight);
  const pixelWidth = Math.round(w * dpr), pixelHeight = Math.round(h * dpr);
  if (canvas2d.width !== pixelWidth || canvas2d.height !== pixelHeight) {
    canvas2d.width = pixelWidth; canvas2d.height = pixelHeight;
  }
  const routeEndpoints = { start: minimapEndpoints.start, goal: minimapEndpoints.end };
  if (activeView === '2d') {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx2d, w, h, {
      camera,
      snapshot,
      terrain,
      orthoOverlay,
      geologySegments: geologyLayerVisible ? geologySegmentsLocal : [],
      archiveTraverse: $('toggle-archive-traverse').checked ? archiveTraverse : null,
      plannedRoute: activeRoute?.status === 'ok' ? activeRoute.path : null,
      routeEndpoints: routeEndpoints.start || routeEndpoints.goal ? { start: routeEndpoints.start, goal: routeEndpoints.goal } : null,
      footprintTrail: footprintTrailSnapshot,
    });
  } else if (renderer3d && terrainMesh) {
    try {
      renderer3d.resize(w, h, dpr);
      const player = snapshot.astronaut;
      const mov = player.movement;
      const hasElevation = player.elevationStatus === 'ok' && Number.isFinite(player.zM);

      let eyeOffsetM = 0;
      let pitchOffsetRad = 0;
      let rollOffsetRad = 0;

      if (mov?.landingRecovery) {
        // Landing compression dip: cushions impact with downward camera dip (~0.055 m) and slight pitch tilt
        const frac = Math.max(0, Math.min(1, mov.landingRecoveryFrac ?? 0));
        const dipCurve = Math.sin(frac * Math.PI);
        eyeOffsetM = -0.055 * dipCurve;
        pitchOffsetRad = -0.015 * dipCurve;
        rollOffsetRad = 0.004 * dipCurve * Math.sin(frac * 2 * Math.PI);
      } else if (mov?.airborne) {
        // Ballistic 0.38g flight: subtle vertical-velocity gaze tracking
        const vz = mov.verticalSpeedMps ?? 0;
        pitchOffsetRad = Math.max(-0.018, Math.min(0.018, vz * 0.006));
      } else if (mov?.grounded && !mov?.airborne && !mov?.landingRecovery && (mov?.horizontalSpeedMps ?? 0) > 0.04) {
        // Mars 0.38g loping head-bob: rhythmic flight bounce, pitch nod, and subtle weight-shift roll
        // Match MOVING_SPEED_EPSILON_MPS in astronaut-rig.js.
        const speed = mov.horizontalSpeedMps;
        const speedNorm = Math.min(1, speed / 1.4);
        const strideM = ASTRONAUT_RIG.metadata.presentationStrideLengthM;
        const phase = mov.gaitDistanceM !== undefined
          ? 2 * Math.PI * mov.gaitDistanceM / strideM
          : 2 * Math.PI * (speed / strideM) * (mov.timeS ?? 0);
        eyeOffsetM = 0.024 * speedNorm * Math.sin(2 * phase);
        pitchOffsetRad = 0.006 * speedNorm * Math.sin(phase);
        rollOffsetRad = 0.005 * speedNorm * Math.cos(phase);
      }

      if (Number.isFinite(player.bodyWorldZM)) {
        const bodyZDisplay = (player.bodyWorldZM - terrainMesh.displayConfig.referenceElevationM) * terrainMesh.displayConfig.verticalScale;
        setFirstPersonPose(camera3d, {
          xM: player.xM,
          yM: player.yM,
          bodyZDisplay,
          eyeOffsetM,
          pitchOffsetRad,
          rollOffsetRad,
        });
      } else {
        // Keep the last eye Z if no sampled world-Z anchor exists; never invent zero terrain height.
        camera3d.xM = player.xM;
        camera3d.yM = player.yM;
        camera3d.dynamicPitchOffsetRad = pitchOffsetRad;
        camera3d.dynamicRollOffsetRad = rollOffsetRad;
      }
      renderer3d.renderFrame({
        snapshot,
        camera: camera3d,
        terrainMesh,
        markerMesh: displayedMarkerMesh(),
        archiveLinePositions: $('toggle-archive-traverse').checked ? archiveTraverse3d?.linePositions : null,
        geologyLinePositions: geologyLayerVisible ? geologyLinePositions : null,
        plannedRouteLinePositions,
        plannedRouteRibbon,
        plannedRoutePulseUM: plannedRoutePulseDistance(player),
        footprintTrail: footprintTrailSnapshot,
      });
      if (!hasElevation) {
        viewStatus.textContent = `DTM yüzey kotu bilinmiyor (${player.elevationStatus}); zemin teması doğrulanamıyor. Kamera yalnız saklanan hareket dünya-Z referansını kullanır; bu güncel yüzey kotu değildir.`;
        viewStatus.hidden = false;
      } else {
        viewStatus.hidden = true;
      }
    } catch (error) {
      try { renderer3d.dispose(); } catch { /* retain the 2D fallback */ }
      renderer3d = null;
      renderer3dError = error;
      activeView = '2d';
      updateViewControls();
      viewStatus.textContent = `3D görünüm durdu: ${error.message}. 2D harita kullanılabilir.`;
      viewStatus.hidden = false;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx2d, w, h, {
        camera,
        snapshot,
        terrain,
        orthoOverlay,
        geologySegments: geologyLayerVisible ? geologySegmentsLocal : [],
        archiveTraverse: $('toggle-archive-traverse').checked ? archiveTraverse : null,
        plannedRoute: activeRoute?.status === 'ok' ? activeRoute.path : null,
        routeEndpoints: routeEndpoints.start || routeEndpoints.goal ? { start: routeEndpoints.start, goal: routeEndpoints.goal } : null,
        footprintTrail: footprintTrailSnapshot,
      });
    }
  }
  hudAcc += dt; if (hudAcc > 0.08) { hudAcc = 0; updateHudFromSnapshot(snapshot); }
  requestAnimationFrame(frame);
}
updateHud();
requestAnimationFrame(frame);

// Debug/test handle is NEVER exposed during normal runs; only when explicitly enabled via ?debug=1 or __MARSWALK_ENABLE_DEBUG__.
if (debugEnabled) {
  window.marswalk = {
    sim, camera, camera3d, adapter, registry, layers, waypoints, keys, updateHud,
    rebuildTerrainMeshForScale,
    setVerticalScale: (scale) => rebuildTerrainMeshForScale(Number(scale)),
    setPresentationMode,
    startDemoTour,
    isPresentationMode: () => presentationModeActive,
    getSnapshot: () => lastSnapshot,
    getDiagnostics: () => ({
      activeView,
      presentationMode: presentationModeActive,
      verticalScale: currentVerticalScale,
      rendererAvailable: Boolean(renderer3d),
      rendererError: renderer3dError?.message ?? null,
      terrainMeshReady: Boolean(terrainMesh),
      terrainMeshError: terrainMeshError?.message ?? null,
      terrainMeshBuildMs,
      terrainMeshCellCount: layers.dtm?.rows * layers.dtm?.cols || null,
      terrainMeshProvenance: terrainMesh ? { ...terrainMesh.provenance } : null,
      markerMeshReady: Boolean(markerMesh),
      markerMeshError: markerMeshError?.message ?? null,
      markerTriangles: markerMesh ? markerMesh.indices.length / 3 : 0,
      cameraMode: camera3d.mode,
      cameraEyeHeightM: camera3d.eyeHeightM,
      cameraFovYRad: camera3d.fovYRad,
      movement: lastSnapshot?.astronaut?.movement ?? null,
      renderer: renderer3d?.getDiagnostics?.() ?? null,
      footprints: {
        count: footprintTrailSnapshot.count,
        capacity: footprintTrailSnapshot.capacity,
        counters: footprintTrailSnapshot.counters,
      },
      orthoOverlay: orthoOverlay ? {
        mode: orthoOverlay.mode,
        fineAvailable: Boolean(orthoOverlay.fine?.image),
        coarseAvailable: Boolean(orthoOverlay.coarse?.image),
      } : null,
      snapshot: lastSnapshot ? {
        elevationStatus: lastSnapshot.astronaut.elevationStatus,
        zM: lastSnapshot.astronaut.zM,
      } : null,
    }),
  };
}
