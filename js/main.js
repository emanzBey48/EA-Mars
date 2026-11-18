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
import { STATUS, UnavailableLayer, dtmBaseDescriptor, loadOrthoDescriptor } from './surface/layers.js';
import { createDefaultSurfaceRegistry } from './surface/registry.js';
import { MarswalkSim, createWorldSnapshot } from './simulation/sim.js';
import { Camera, buildTerrainImage, buildTerrainImageFromGrid, render } from './view/render.js';
import { buildPlannerWindowInput, prepareRouteGrid, ROUTE_GRID_MODE } from './route/legacy-grid-plan.js';
import {
  cameraRelativeMovement, createFirstPersonCamera, lookCamera, setFirstPersonLook, setFirstPersonPose, zoomCamera,
} from './view/3d/camera.js';
import { createCameraMotion } from './view/3d/camera-motion.js';
import { createTerrainRenderer } from './view/3d/renderer.js';
import { createQualityGovernor, QUALITY_MODES } from './view/3d/quality-governor.js';
import { buildTerrainMesh } from './view/3d/terrain-mesh.js';
import { buildHorizonMesh, regionalGridFromBinary } from './view/3d/horizon-mesh.js';
import { buildMarkerMeshes } from './view/3d/marker-mesh.js';
import { buildRouteGuideRibbon } from './view/3d/route-ribbon.js';
import { bindControls } from './input/input.js';
import { createStops } from './geo/rover-observations.js';
import { createRoverGallery } from './view/rover-gallery.js';
import { createHud } from './view/hud.js';
import { buildPlannedRouteLinePositions, derivePlannedRouteGuidance } from './view/route-guidance.js';
import { createFootprintTrail } from './view/3d/footprint-trail.js';
import { combineTraverseMarkers, prepareArchiveTraverse, prepareArchiveTraverse3d } from './view/traverse-layer.js';
import { createMinimap } from './view/minimap/minimap.js';
import { classifyPlanResponse } from './route/plan-response-state.js';
import { createGlobeScreen } from './view/globe/index.js';
import { createShowreel, buildDefaultShowreelSteps } from './app/showreel.js';
import { typeLabel as regionTypeLabel } from './view/globe/regions.js';
import { createHelmetOverlay } from './view/helmet.js';
import { createAutoDriveControls } from './view/auto-drive-controls.js';
import { createViewModeBar } from './view/minimap/view-mode-bar.js';
import { computeModeField, drawModeOverlay } from './view/minimap/view-modes.js';
import { createAutoDrive } from './simulation/auto-drive.js';
import { createDemoFlow, PLAN_SPEED_MPS } from './app/demo-flow.js';
import { createCrewSim } from './simulation/crew-sim.js';
import { resolveSelectionPoints, OUTSIDE_PATCH_NOTE } from './app/free-start.js';
import { createBiomeTracker } from './app/biome-label.js';
import { createBiomeChip } from './view/biome-chip.js';
import { chaikinSmooth } from './simulation/path-smooth-local.js';
import { createCrewStrip } from './view/crew-strip.js';

import { initI18n } from './app/i18n.js';
import { createLangSwitch } from './app/lang-switch.js';

const $ = (id) => document.getElementById(id);
initI18n();
createLangSwitch();
window.addEventListener('langchange', () => {
  try { minimapController.draw(); hudMinimapController?.draw?.(); drawMinimapModeOverlay(); } catch { /* yok say */ }
});
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
const DEFAULT_WAYPOINT_POINTS = waypoints.map((w) => ({ xM: w.local.x, yM: w.local.y }));
const PRESET_MISSION_ROUTES = {
  'sol120-sol164': {
    start: DEFAULT_WAYPOINT_POINTS[0],
    end: DEFAULT_WAYPOINT_POINTS[1],
    startLabel: WAYPOINTS[0].label,
    endLabel: WAYPOINTS[1].label,
    custom: false,
  },
  'crater-flat': {
    start: { xM: 40, yM: -180 },
    end: { xM: 260, yM: -420 },
    startLabel: 'Krater Tabanı A',
    endLabel: 'Krater Tabanı B',
    custom: true,
  },
  'nw-ridge': {
    start: { xM: -260, yM: 220 },
    end: { xM: 180, yM: -40 },
    startLabel: 'Kuzeybatı Sırtı A',
    endLabel: 'Delta Eşiği B',
    custom: true,
  },
};
let targetYawRad = Math.atan2(waypoints[1].local.y - waypoints[0].local.y, waypoints[1].local.x - waypoints[0].local.x);
const sim = new MarswalkSim({ a: waypoints[0].local, b: waypoints[1].local }, SCENARIO);
const camera = new Camera();
const camera3d = createFirstPersonCamera({ xM: waypoints[0].local.x, yM: waypoints[0].local.y, yawRad: targetYawRad });
const cameraMotion = createCameraMotion({ idleBreathing: false });
let lastCameraMotion = null;
const registry = createDefaultSurfaceRegistry({ expectedFrame: MAP_FRAME, adapter, baseUrl: 'data' });
const layers = { dtm: new UnavailableLayer(dtmBaseDescriptor(), 'Yükleniyor…'), ortho: null, selectionReport: null };
let terrain = null;
// K3-10: planlayıcı + minimap ızgarası. grid !== null yalnız legacy köprü DTM'inde (bir kez yeniden örneklenmiş düzenli ızgara).
let routeGrid = { mode: ROUTE_GRID_MODE.NATIVE, interpolation: null, grid: null, resampleMs: null, error: null };
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
document.body.classList.add('view-2d');
let hasEntered3dOnce = false;
let viewRequestId = 0;
let renderer3d = null;
let renderer3dError = null;
let terrainMeshError = null;
let terrainMeshBuildMs = null;
let horizonGrid = null; // MOLA-class regional grid (K2-3); regional context only
let horizonMesh = null; // rebuilt for the current terrain display config
let horizonStatus = 'loading';
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
let demoFlow = null; // tanıtım akışı (küre/kask/otomatik sürüş); ?intro=0 ile kurulmaz
let plannedRouteLinePositions = new Float32Array();
let plannedRouteRibbon = null;
let plannedRoutePathCumulativeM = [];
const footprintTrail = createFootprintTrail({ sampleElevation: (xM, yM) => layers.dtm.sampleElevation(xM, yM) });
let footprintTrailSnapshot = footprintTrail.getSnapshot();
let lastMinimapFootprintRefreshS = -Infinity;
let orthoOverlay = null;
let vikingBaseStatus = 'loading';
let vikingBaseAttribution = null;
let vikingBaseLicense = null;
let vikingBaseNativeMPerPx = null;

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
const minimapGlobalButton = $('minimap-fit-global');
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
const btnOpenRouteSetup = $('btn-open-route-setup');
const presentationHud = $('presentation-hud');
const btnClosePresentation = $('btn-close-presentation');
const btnDemoTour = $('btn-demo-tour');
const btnDemoToggleView = $('btn-demo-toggle-view');
const btnDemoRestart = $('btn-demo-restart');
const presGuideBanner = $('pres-guide-banner');
const hudMinimapWidget = $('hud-minimap-widget');
const hudMinimapDist = $('hud-minimap-dist');
const hudMinimapFollowBtn = $('hud-minimap-follow');
const hudMinimapOpenSetupBtn = $('hud-minimap-open-setup');
const hudMinimapCanvas = $('hud-minimap-canvas');
const missionSetupOverlay = $('mission-setup-overlay');
const btnCloseSetup = $('btn-close-setup');
const setupStepBanner = $('setup-step-banner');
const setupMapSlot = $('setup-map-slot');
const setupPlannerSlot = $('setup-planner-slot');
const setupCorridorInput = $('setup-corridor-input');
const btnLaunch3d = $('btn-launch-3d');
const btnLaunch2d = $('btn-launch-2d');
const panelMapHome = $('panel-map-home');
const panelPlannerHome = $('panel-planner-home');
const btnPresetRoutes = Array.from(document.querySelectorAll('.btn-preset-route'));

let presentationModeActive = false;
let pendingDemoTour = false;
let missionSetupOpen = false;
let pendingAutoPlan = false;
let hudMinimapFollow = true;
let hudMinimapAcc = 0;
let lastHudMinimapX = NaN;
let lastHudMinimapY = NaN;
let lastHudMinimapYaw = NaN;

const minimapController = createMinimap({
  canvas: minimapCanvas,
  terrain,
  descriptor: MAP_FRAME,
  onPointSelected: ({ kind, xM, yM, byDrag }) => showSelectedPoint(kind, { xM, yM }, Boolean(byDrag)),
  onCellClick: (point) => explainMinimapCell(point),
});

const hudMinimapController = hudMinimapCanvas
  ? createMinimap({
    canvas: hudMinimapCanvas,
    terrain,
    descriptor: MAP_FRAME,
    compactHud: true,
  })
  : null;

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

function syncMinimapCorridor() {
  const corridor = (minimapEndpoints.start && minimapEndpoints.end) || debugEnabled
    ? { a: waypoints[0].local, b: waypoints[1].local, halfWidthM: sim.corridorHalfWidthM }
    : null;
  minimapController.setCorridor(corridor);
  hudMinimapController?.setCorridor(corridor);
}

function updateMissionSetupUi() {
  if (!setupStepBanner || !btnLaunch3d || !btnLaunch2d) return;
  const hasStart = Boolean(minimapEndpoints.start);
  const hasEnd = Boolean(minimapEndpoints.end);
  const isComputing = pendingInitId !== null || pendingPlanId !== null;
  const hasRouteOk = activeRoute?.status === 'ok';
  const plannerUnavailable = !routeWorkerReady && pendingInitId === null;
  const canLaunch = hasStart && hasEnd && !isComputing && (hasRouteOk || plannerUnavailable || !layers.dtm.available);

  if (!hasStart) {
    setupStepBanner.textContent = '1. Adım: Harita üzerinde yürüyüşe başlayacağınız Başlangıç (A) noktasını tıklayın veya alttan örnek bir rota seçin.';
  } else if (!hasEnd) {
    setupStepBanner.textContent = '2. Adım: Harita üzerinde Hedef / Bitiş (B) noktasını tıklayın — ardından koridor ve A* rotası otomatik hesaplanacaktır.';
  } else if (pendingInitId !== null) {
    setupStepBanner.textContent = 'HiRISE DTM yürüyüş alanı Worker içinde hazırlanıyor… Koridor ve rota otomatik hesaplanacak.';
  } else if (pendingPlanId !== null) {
    setupStepBanner.textContent = 'Seçtiğiniz başlangıç, hedef ve koridor için A* yürünebilirlik rotası hesaplanıyor…';
  } else if (hasRouteOk) {
    const lengthStr = Number.isFinite(activeRoute?.stats?.lengthM) ? `${activeRoute.stats.lengthM.toFixed(0)} m` : '';
    const durS = activeRoute?.stats?.estimatedDurationS;
    const durStr = Number.isFinite(durS)
      ? (Math.floor(durS / 60) > 0 ? `${Math.floor(durS / 60)} dk ${Math.round(durS % 60)} sn` : `${Math.round(durS)} sn`)
      : '';
    const detail = [lengthStr, durStr].filter(Boolean).join(' · ');
    setupStepBanner.textContent = `Koridor ve A* rotası hazır${detail ? ` (${detail})` : ''}. Artık simülasyona girebilirsiniz.`;
  } else if (plannerUnavailable || !layers.dtm.available) {
    setupStepBanner.textContent = 'Rota planlayıcı veya DTM hazır değil; seçilen noktalarla devam edebilirsiniz.';
  } else {
    setupStepBanner.textContent = `Rota hesaplanamadı (${activeRoute?.reason || activeRoute?.status || 'erişilemeyen nokta'}). Haritada başka noktalar veya alttan örnek rota seçin.`;
  }

  btnLaunch3d.disabled = !canLaunch || !renderer3d || !layers.dtm.available || Boolean(terrainMeshError);
  btnLaunch2d.disabled = !canLaunch;
  btnLaunch3d.textContent = isComputing ? '⏳ Rota Hesaplanıyor…' : '🚀 3D Simülasyona Başla';
}

function applyCustomMissionRoute(startPt, endPt, { startLabel = 'Kullanıcı Başlangıcı', endLabel = 'Kullanıcı Hedefi', custom = true } = {}) {
  if (!startPt || !endPt) return;
  const startGeo = adapter.localToLatLon(startPt.xM, startPt.yM);
  const endGeo = adapter.localToLatLon(endPt.xM, endPt.yM);
  waypoints[0] = {
    ...waypoints[0],
    id: 'sol120-wb1',
    label: startLabel,
    sol: custom ? null : WAYPOINTS[0].sol,
    latDeg: startGeo.latDeg,
    lonDeg: startGeo.lonDeg,
    local: { x: startPt.xM, y: startPt.yM },
    custom: Boolean(custom),
  };
  waypoints[1] = {
    ...waypoints[1],
    id: 'sol164-roubion',
    label: endLabel,
    sol: custom ? null : WAYPOINTS[1].sol,
    latDeg: endGeo.latDeg,
    lonDeg: endGeo.lonDeg,
    local: { x: endPt.xM, y: endPt.yM },
    custom: Boolean(custom),
  };
  targetYawRad = Math.atan2(waypoints[1].local.y - waypoints[0].local.y, waypoints[1].local.x - waypoints[0].local.x);
  sim.setRoute({ a: { x: startPt.xM, y: startPt.yM }, b: { x: endPt.xM, y: endPt.yM } });
  if (layers.dtm.available) {
    const startElev = layers.dtm.sampleElevation(waypoints[0].local.x, waypoints[0].local.y);
    if (startElev?.status === 'ok' && Number.isFinite(startElev.value)) {
      sim.resolveSurfaceContact(startElev);
    }
  }
  camera3d.xM = waypoints[0].local.x;
  camera3d.yM = waypoints[0].local.y;
  camera3d.yawRad = targetYawRad;
  camera3d.dynamicPitchOffsetRad = 0;
  camera3d.dynamicRollOffsetRad = 0;
  camera3d.dynamicEyeOffsetM = 0;
  cameraMotion.reset();
  lastCameraMotion = null;
  sim.headingRad = targetYawRad;
  hasEntered3dOnce = false;

  markerMesh = null;
  combinedArchiveMarkers = null;
  archiveMarkerBase = null;
  if (terrainMesh && layers.dtm.available) {
    build3dMarkersOnce();
  }

  const archiveMainToggle = $('toggle-archive-traverse');
  if (custom) {
    if (archiveMainToggle) archiveMainToggle.checked = false;
    if (minimapArchiveToggle) minimapArchiveToggle.checked = false;
  }

  resetFootprints();
  lastHudMinimapX = NaN;
  lastHudMinimapY = NaN;
  lastHudMinimapYaw = NaN;
  syncMinimapCorridor();
  refreshMinimapOverlays();
  updateHud();
}

function applyCorridorHalfWidth(val) {
  const next = sim.setCorridorHalfWidth(val);
  const sidebarCorridor = $('in-corridor');
  if (sidebarCorridor) sidebarCorridor.value = String(next);
  if (setupCorridorInput) setupCorridorInput.value = String(next);
  hud.renderLayerPanel(layers, terrain, next, currentVerticalScale);
  if (terrainMesh && layers.dtm.available) {
    markerMesh = null;
    combinedArchiveMarkers = null;
    archiveMarkerBase = null;
    build3dMarkersOnce();
  }
  syncMinimapCorridor();
  updateHud();
  return next;
}

function clearMissionEndpoints(statusMessage = 'Noktalar temizlendi. Yeni başlangıç ve bitiş seçerek yeniden planlayın.') {
  minimapEndpoints = { start: null, end: null };
  pendingAutoPlan = false;
  endpointRevision++;
  minimapStartLabel.textContent = 'Seçilmedi';
  minimapEndLabel.textContent = 'Seçilmedi';
  minimapController.setEndpoints(minimapEndpoints);
  hudMinimapController?.setEndpoints(minimapEndpoints);
  minimapController.setSelectionMode(null);
  $('minimap-pick-start').setAttribute('aria-pressed', 'false');
  $('minimap-pick-end').setAttribute('aria-pressed', 'false');
  if (pendingPlanId !== null) routeWorkerRequests.delete(pendingPlanId);
  pendingPlanId = null;
  minimapStatus.textContent = statusMessage;
  activeRoute = null;
  preparePlannedRouteGuide();
  const clearPlanning = { heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null };
  minimapController.setPlanning(clearPlanning);
  hudMinimapController?.setPlanning(clearPlanning);
  syncMinimapCorridor();
  renderRouteSummary({ status: 'idle', reason: 'Noktalar temizlendi' });
  updateRouteButton();
  updateMissionSetupUi();
}

function openMissionSetup({ resetSelection = false } = {}) {
  if (!missionSetupOverlay) return;
  if (document.pointerLockElement === canvas3d) document.exitPointerLock();
  if (panelMapHome && setupMapSlot) {
    while (panelMapHome.firstChild) setupMapSlot.appendChild(panelMapHome.firstChild);
  }
  if (panelPlannerHome && setupPlannerSlot) {
    while (panelPlannerHome.firstChild) setupPlannerSlot.appendChild(panelPlannerHome.firstChild);
  }
  if (setupCorridorInput) setupCorridorInput.value = String(sim.corridorHalfWidthM);
  missionSetupOpen = true;
  missionSetupOverlay.hidden = false;
  updateViewControls();
  if (resetSelection) {
    clearMissionEndpoints('Haritada Başlangıç (A) noktasını seçin.');
  }
  if (!minimapEndpoints.start) setMinimapPickMode('start');
  else if (!minimapEndpoints.end) setMinimapPickMode('end');
  updateMissionSetupUi();
  requestAnimationFrame(() => minimapController.fit());
}

function closeMissionSetup() {
  if (!missionSetupOverlay) return;
  if (setupMapSlot && panelMapHome) {
    while (setupMapSlot.firstChild) panelMapHome.appendChild(setupMapSlot.firstChild);
  }
  if (setupPlannerSlot && panelPlannerHome) {
    while (setupPlannerSlot.firstChild) panelPlannerHome.appendChild(setupPlannerSlot.firstChild);
  }
  missionSetupOpen = false;
  missionSetupOverlay.hidden = true;
  minimapController.setSelectionMode(null);
  $('minimap-pick-start').setAttribute('aria-pressed', 'false');
  $('minimap-pick-end').setAttribute('aria-pressed', 'false');
  updateViewControls();
  requestAnimationFrame(() => minimapController.draw());
}

async function startDemoTour(selection = null) {
  if (missionSetupOpen) closeMissionSetup();
  setPresentationMode(true);
  if (currentVerticalScale !== 1) {
    rebuildTerrainMeshForScale(1);
  }
  // Küreden serbest nokta seçildiyse ve Jezero HiRISE yamasındaysa rota o noktalardan kurulur; aksi halde varsayılan.
  const resolved = selection ? resolveSelectionPoints(selection, {
    toLocal: (lat, lon) => adapter.latLonToLocal(lat, lon),
    bounds: layers.dtm.available ? layers.dtm.descriptor?.coverage?.localBoundsM : null,
    defaults: { start: DEFAULT_WAYPOINT_POINTS[0], end: DEFAULT_WAYPOINT_POINTS[1] },
    isValidAt: (x, y) => layers.dtm.sampleElevation(x, y)?.status === 'ok',
  }) : null;
  const startPt = resolved ? resolved.start : DEFAULT_WAYPOINT_POINTS[0];
  const endPt = resolved ? resolved.end : DEFAULT_WAYPOINT_POINTS[1];
  const useCustom = Boolean(resolved?.anyCustom);
  patchNote = resolved?.outside ? OUTSIDE_PATCH_NOTE : null;
  const archiveMainToggle = $('toggle-archive-traverse');
  if (archiveMainToggle) archiveMainToggle.checked = !useCustom;
  if (minimapArchiveToggle) minimapArchiveToggle.checked = !useCustom;
  applyCustomMissionRoute(startPt, endPt, {
    startLabel: useCustom ? 'Seçilen başlangıç' : WAYPOINTS[0].label,
    endLabel: useCustom ? 'Seçilen varış' : WAYPOINTS[1].label,
    custom: useCustom,
  });
  showSelectedPoint('start', startPt, false, { autoPlan: false, applyRoute: false });
  showSelectedPoint('end', endPt, false, { autoPlan: false, applyRoute: false });
  if (routeWorkerReady && pendingInitId === null) {
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

function showSelectedPoint(kind, point, byDrag = false, { autoPlan = true, custom = true, applyRoute = true } = {}) {
  const label = `${point.xM.toFixed(1)} m doğu, ${point.yM.toFixed(1)} m kuzey (WB1 orijini)`;
  if (kind === 'start') minimapStartLabel.textContent = label;
  else minimapEndLabel.textContent = label;
  minimapEndpoints = { ...minimapEndpoints, [kind]: point };
  endpointRevision++;
  if (pendingPlanId !== null) routeWorkerRequests.delete(pendingPlanId);
  pendingPlanId = null;
  pendingAutoPlan = false;
  minimapController.setEndpoints(minimapEndpoints);
  hudMinimapController?.setEndpoints(minimapEndpoints);
  activeRoute = null;
  preparePlannedRouteGuide();
  const clearPlanning = { heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null };
  minimapController.setPlanning(clearPlanning);
  hudMinimapController?.setPlanning(clearPlanning);
  renderRouteSummary({ status: 'idle', reason: 'Yeni nokta seçildi' });
  minimapStatus.textContent = 'Nokta kaydedildi. Planlama göstergesi — güvenli rota sertifikası değildir.';
  updateRouteButton();

  if (!byDrag && kind === 'start' && !minimapEndpoints.end) {
    setMinimapPickMode('end');
  } else {
    minimapController.setSelectionMode(null);
    $('minimap-pick-start').setAttribute('aria-pressed', 'false');
    $('minimap-pick-end').setAttribute('aria-pressed', 'false');
  }

  if (minimapEndpoints.start && minimapEndpoints.end) {
    if (applyRoute) {
      applyCustomMissionRoute(minimapEndpoints.start, minimapEndpoints.end, {
        startLabel: custom ? 'Kullanıcı Başlangıcı' : WAYPOINTS[0].label,
        endLabel: custom ? 'Kullanıcı Hedefi' : WAYPOINTS[1].label,
        custom,
      });
    } else {
      syncMinimapCorridor();
    }
    if (autoPlan) {
      if (routeWorkerReady && pendingInitId === null) {
        planMinimapRoute();
      } else {
        pendingAutoPlan = true;
      }
    }
  } else {
    syncMinimapCorridor();
  }
  updateMissionSetupUi();
}

minimapGlobalButton?.addEventListener('click', () => minimapController.fitGlobal());
if (minimapGlobalButton) minimapGlobalButton.disabled = true;
loadVikingMinimapBase().then((base) => {
  vikingBaseStatus = 'ready';
  vikingBaseAttribution = base.attribution;
  vikingBaseLicense = base.license;
  vikingBaseNativeMPerPx = base.nativeMPerPx;
  minimapController.setGlobalBase(base);
  hudMinimapController?.setGlobalBase(base);
  if (minimapGlobalButton) minimapGlobalButton.disabled = false;
  refreshMinimapOverlays();
}).catch((error) => {
  vikingBaseStatus = 'unavailable';
  vikingBaseAttribution = null;
  vikingBaseLicense = null;
  vikingBaseNativeMPerPx = null;
  minimapController.setGlobalBase(null);
  hudMinimapController?.setGlobalBase(null);
  if (minimapGlobalButton) minimapGlobalButton.disabled = true;
  refreshMinimapOverlays();
  console.warn(`Viking global minimap katmanı kullanılamıyor: ${error.message}`);
});

function localBoundsFromGeo(lonWest, lonEast, latNorth, latSouth) {
  const nw = adapter.latLonToLocal(latNorth, lonWest);
  const se = adapter.latLonToLocal(latSouth, lonEast);
  return { nwXM: nw.x, nwYM: nw.y, widthM: se.x - nw.x, heightM: nw.y - se.y };
}

function loadVikingImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`PNG karosu yüklenemedi: ${source}`));
    image.src = source;
  });
}

async function loadVikingMinimapBase() {
  const response = await fetch('data/viking-mdim/manifest.json');
  if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const projection = manifest?.projection;
  const sourceRadiusM = manifest?.source?.headerSummary?.radiusM;
  if (manifest?.schema !== 'marswalk.viking-mdim-pyramid.v1' || manifest?.scheme?.tileSize !== 256 ||
      !Number.isSafeInteger(manifest?.maxLevelSelection?.chosen) || manifest.maxLevelSelection.chosen < 0 ||
      !String(manifest?.scheme?.pathOrder ?? '').includes('tiles/{z}/{row}/{col}.png') || !Array.isArray(manifest?.levels) ||
      !Number.isFinite(projection?.nativeMPerPx) || projection.nativeMPerPx <= 0 ||
      !String(projection?.type ?? '').toLowerCase().includes('plate carree') ||
      !Array.isArray(projection.lonRangeDeg) || projection.lonRangeDeg.length !== 2 || !projection.lonRangeDeg.every(Number.isFinite) ||
      !Array.isArray(projection.latRangeDeg) || projection.latRangeDeg.length !== 2 || !projection.latRangeDeg.every(Number.isFinite) ||
      projection.lonRangeDeg[1] <= projection.lonRangeDeg[0] || projection.latRangeDeg[0] <= projection.latRangeDeg[1] ||
      !Number.isFinite(sourceRadiusM) || Math.abs(sourceRadiusM - MAP_FRAME.radiusKm * 1000) > 1e-3 ||
      !String(manifest?.noData?.rule ?? '').includes('never averaged') ||
      !manifest.notes?.some((note) => note.includes('ortogörüntü değildir') && note.includes('yükseklik verisi değildir')) ||
      typeof manifest.attribution !== 'string' || typeof manifest.license !== 'string' ||
      typeof manifest?.regional?.file !== 'string' || !Array.isArray(manifest.regional.sizePx) ||
      manifest.regional.sizePx.length !== 2 || !manifest.regional.sizePx.every(Number.isSafeInteger) ||
      !Array.isArray(manifest.regional.lonBoundsDeg) || manifest.regional.lonBoundsDeg.length !== 2 || !manifest.regional.lonBoundsDeg.every(Number.isFinite) ||
      !Array.isArray(manifest.regional.latBoundsDeg) || manifest.regional.latBoundsDeg.length !== 2 || !manifest.regional.latBoundsDeg.every(Number.isFinite)) {
    throw new Error('manifest şeması, koordinat çerçevesi veya no-data/ürün açıklaması beklenenle uyuşmuyor');
  }
  const [lonMin, lonMax] = projection.lonRangeDeg;
  const [latTop, latBottom] = projection.latRangeDeg;
  const worldBounds = localBoundsFromGeo(lonMin, lonMax, Math.max(latTop, latBottom), Math.min(latTop, latBottom));
  const readyLevels = manifest.levels.filter((item) => item.written && item.z <= manifest.maxLevelSelection.chosen);
  if (!readyLevels.some((item) => item.z === 0)) throw new Error('global z0 karoları manifestte yazılı değil');
  const levels = await Promise.all(readyLevels.map(async (item) => {
    const [worldWidth, worldHeight] = item.worldPx ?? [];
    if (!Number.isInteger(item.z) || !Number.isInteger(item.cols) || !Number.isInteger(item.rows) ||
        !Number.isFinite(item.mPerPx) || item.mPerPx <= 0 || worldWidth !== item.cols * manifest.scheme.tileSize ||
        worldHeight !== item.rows * manifest.scheme.tileSize) throw new Error(`Viking z${item.z} karo düzeni geçersiz`);
    const rows = await Promise.all(Array.from({ length: item.rows }, async (_, row) => Promise.all(
      Array.from({ length: item.cols }, async (_, col) => {
        const image = await loadVikingImage(`data/viking-mdim/tiles/${item.z}/${row}/${col}.png`);
        if (image.width !== manifest.scheme.tileSize || image.height !== manifest.scheme.tileSize) {
          throw new Error(`Viking z${item.z}/${row}/${col} karo boyutu geçersiz`);
        }
        const lonWest = lonMin + col * manifest.scheme.tileSize / worldWidth * (lonMax - lonMin);
        const lonEast = lonMin + (col + 1) * manifest.scheme.tileSize / worldWidth * (lonMax - lonMin);
        const latNorth = latTop + row * manifest.scheme.tileSize / worldHeight * (latBottom - latTop);
        const latSouth = latTop + (row + 1) * manifest.scheme.tileSize / worldHeight * (latBottom - latTop);
        return { image, bounds: localBoundsFromGeo(lonWest, lonEast, latNorth, latSouth) };
      }),
    )));
    return { z: item.z, mPerPx: item.mPerPx, tiles: rows.flat() };
  }));
  const regional = manifest.regional;
  const regionalImage = await loadVikingImage(`data/viking-mdim/${regional.file}`);
  if (regionalImage.width !== regional.sizePx?.[0] || regionalImage.height !== regional.sizePx?.[1]) {
    throw new Error('Viking bölgesel kesit boyutu manifestle uyuşmuyor');
  }
  const lonWest = Math.min(...regional.lonBoundsDeg), lonEast = Math.max(...regional.lonBoundsDeg);
  const latSouth = Math.min(...regional.latBoundsDeg), latNorth = Math.max(...regional.latBoundsDeg);
  return {
    levels,
    bounds: worldBounds,
    regional: { image: regionalImage, bounds: localBoundsFromGeo(lonWest, lonEast, latNorth, latSouth) },
    nativeMPerPx: projection.nativeMPerPx,
    attribution: manifest.attribution,
    license: manifest.license,
  };
}

function updateRouteButton() {
  const endpointsReady = Boolean(layers.dtm.available && minimapEndpoints.start && minimapEndpoints.end);
  minimapPlanButton.disabled = !endpointsReady || !routeWorkerReady || pendingInitId !== null || pendingPlanId !== null;
  minimapPlanButton.textContent = pendingInitId !== null
    ? 'Planlama alanı hazırlanıyor…'
    : pendingPlanId !== null
      ? 'Rota hesaplanıyor…'
      : !endpointsReady
        ? 'Başlangıç ve bitiş seçin'
        : routeWorkerReady ? 'Rota planla' : 'Rota planlayıcı hazırlanıyor';
}

function formatDurationS(totalS) {
  const mins = Math.floor(totalS / 60), secs = totalS % 60;
  return mins > 0 ? `${mins} dk ${secs} sn` : `${secs} sn`;
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
      // Süre simülasyon saatindedir: aynı senaryo hızı (config.js SCENARIO.walkSpeedMps) ile hesaplanır.
      const speed = stats.durationAssumption?.value;
      const speedStr = Number.isFinite(speed) ? `${String(speed).replace('.', ',')} m/s` : 'bilinmeyen hız';
      add('Tahmini yürüme süresi', `${formatDurationS(Math.round(stats.estimatedDurationS))} (simülasyon saati, ${speedStr} senaryo hızı)`);
      add('Duvar saati (tahmini)', `${formatDurationS(Math.round(stats.estimatedDurationS / SCENARIO.timeScale))} (×${SCENARIO.timeScale} zaman hızı)`);
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
    const readyPlanning = {
      heatmap: routeHeatmap,
      heatmapVisible: minimapHeatmapToggle.checked,
      route: activeRoute?.status === 'ok' ? activeRoute.path : null,
      segments: activeRoute?.status === 'ok' ? activeRoute.segments : null,
    };
    minimapController.setPlanning(readyPlanning);
    hudMinimapController?.setPlanning(readyPlanning);
    minimapStatus.textContent = routeHeatmap
      ? 'Dengeli EVA yürünebilirlik alanı hazır. Planlama göstergesi — güvenli rota sertifikası değildir.'
      : 'Rota planlama alanı hazır; ısı haritası verisi Worker yanıtında bulunamadı.';
    if ((pendingDemoTour || pendingAutoPlan) && minimapEndpoints.start && minimapEndpoints.end) {
      pendingDemoTour = false;
      pendingAutoPlan = false;
      planMinimapRoute();
    }
    updateRouteButton();
    updateMissionSetupUi();
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
      updateMissionSetupUi();
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
      const errPlanning = { heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null };
      minimapController.setPlanning(errPlanning);
      hudMinimapController?.setPlanning(errPlanning);
      renderRouteSummary({ status: 'error', reason });
      demoFlow?.onRouteResult(null);
      minimapStatus.textContent = `Rota planlayıcı: ${reason}`;
    }
    if (pending.kind === 'explain') minimapCellExplanation.textContent = `Hücre açıklaması alınamadı: ${reason}`;
    updateRouteButton();
    updateMissionSetupUi();
    return;
  }
  if (data.type === 'result' && pending.kind === 'plan') {
    activeRoute = data.result;
    preparePlannedRouteGuide();
    const resultPlanning = {
      heatmap: routeHeatmap,
      heatmapVisible: minimapHeatmapToggle.checked,
      route: activeRoute?.status === 'ok' ? activeRoute.path : null,
      segments: activeRoute?.status === 'ok' ? activeRoute.segments : null,
    };
    minimapController.setPlanning(resultPlanning);
    hudMinimapController?.setPlanning(resultPlanning);
    renderRouteSummary(activeRoute);
    demoFlow?.onRouteResult(activeRoute);
    crewHooks?.rebuild();
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
  updateMissionSetupUi();
}

function ensureRouteWorker() {
  if (routeWorker) return routeWorker;
  routeWorker = new Worker(new URL('./route/pathfinder.worker.js', import.meta.url), { type: 'module' });
  routeWorker.addEventListener('message', handleRouteWorkerMessage);
  routeWorker.addEventListener('error', (event) => {
    routeWorkerReady = false;
    pendingInitId = null;
    pendingPlanId = null;
    pendingAutoPlan = false;
    latestExplainId = null;
    routeWorkerRequests.clear();
    minimapStatus.textContent = `Rota Worker çalışmadı: ${event.message || 'çalışma hatası'}.`;
    updateRouteButton();
    updateMissionSetupUi();
  });
  return routeWorker;
}

// K3-10: legacy köprü DTM'i için düzenli yerel ızgarayı BİR KEZ üretir (ana iş parçacığı, saf geo/route yardımcısı).
// Legacy değilse (USGS/native) grid null kalır ve eski yol aynen çalışır. Hata açıkça bildirilir; sessiz yedek yok.
function resolveRouteGrid(dtm) {
  try {
    return prepareRouteGrid(dtm);
  } catch (error) {
    viewStatus.textContent = `Düzenli yerel ızgara hazırlanamadı; eski ızgara kullanılıyor. ${error.message}`;
    viewStatus.hidden = false;
    return { mode: ROUTE_GRID_MODE.LEGACY_FALLBACK, interpolation: null, grid: null, resampleMs: null, error: error.message };
  }
}

// Yerli (USGS/native) yol: layers.dtm değerleri olduğu gibi kopyalanır; davranış K3-10 öncesiyle aynıdır.
function nativePlannerWindow() {
  const values = new Float32Array(layers.dtm.values);
  const dataView = new DataView(new ArrayBuffer(4));
  dataView.setUint32(0, layers.dtm.noDataBits, true);
  return {
    elevation: values, rows: layers.dtm.rows, cols: layers.dtm.cols, cellSizeM: layers.dtm.cellSizeM,
    nwXM: terrain.bounds.nwXM, nwYM: terrain.bounds.nwYM, noDataValue: dataView.getFloat32(0, true),
    validMin: layers.dtm.validMin, validMax: layers.dtm.validMax,
  };
}

function routeGridDiagnostics() {
  const g = routeGrid.grid;
  return {
    mode: routeGrid.mode,
    interpolation: routeGrid.interpolation,
    rows: g ? g.rows : (layers.dtm?.rows ?? null),
    cols: g ? g.cols : (layers.dtm?.cols ?? null),
    cellSizeM: g ? g.cellSizeM : (layers.dtm?.cellSizeM ?? null),
    nwXM: g ? g.nwXM : (terrain?.bounds?.nwXM ?? null),
    nwYM: g ? g.nwYM : (terrain?.bounds?.nwYM ?? null),
    resampleMs: routeGrid.resampleMs,
    error: routeGrid.error,
  };
}

function initializeRouteWorker() {
  if (!layers.dtm.available || !terrain) return;
  const worker = ensureRouteWorker();
  const planner = routeGrid.grid ? buildPlannerWindowInput(routeGrid.grid) : nativePlannerWindow();
  const request = { type: 'init-window', id: ++routeWorkerId, window: planner };
  pendingInitId = request.id;
  routeWorkerRequests.set(request.id, { kind: 'init' });
  routeWorkerReady = false;
  minimapStatus.textContent = 'Planlama alanı Worker içinde hazırlanıyor…';
  updateMissionSetupUi();
  worker.postMessage(request, [planner.elevation.buffer]);
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
    ['Açıklama', result?.reason || result?.caveatTR || '—'],
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
  const pendingPlanning = { heatmap: routeHeatmap, heatmapVisible: minimapHeatmapToggle.checked, route: null };
  minimapController.setPlanning(pendingPlanning);
  hudMinimapController?.setPlanning(pendingPlanning);
  renderRouteSummary({ status: 'pending', reason: 'Rota hesaplanıyor' });
  pendingPlanId = id;
  const prefKey = minimapRoutePreference?.value ?? 'balanced';
  routeWorkerRequests.set(id, { kind: 'plan', endpointRevision, preference: prefKey });
  minimapStatus.textContent = 'Rota hesaplanıyor… Planlama göstergesi — güvenli rota sertifikası değildir.';
  updateRouteButton();
  updateMissionSetupUi();
  ensureRouteWorker().postMessage({
    type: 'plan-walking-route',
    id,
    startLocal: minimapEndpoints.start,
    endLocal: minimapEndpoints.end,
    options: { preference: prefKey },
  });
}

function refreshMinimapOverlays() {
  const overlayState = {
    geologySegments: geologySegmentsLocal,
    archiveTraverse,
    geologyVisible: minimapGeologyToggle.checked && geologyLayerVisible,
    archiveVisible: minimapArchiveToggle.checked && $('toggle-archive-traverse').checked,
    orthoOverlay,
    orthoVisible: minimapOrthoToggle ? minimapOrthoToggle.checked : true,
  };
  minimapController.setOverlays(overlayState);
  hudMinimapController?.setOverlays(overlayState);
  // Yalnızca hazır/yüklenen katmanlar listelenir; eksik katman için satır yazılmaz.
  const stateText = (s) => (s === 'ready' ? 'hazır' : s === 'loading' ? 'yükleniyor' : null);
  const geologyText = stateText(geologyStatus);
  const archiveText = stateText(archiveTraverseStatus);
  const parts = [];
  if (geologyText) parts.push(`Jeoloji: ${geologyText}`);
  if (archiveText) parts.push(`Arşiv izi: ${archiveText}`);
  if (vikingBaseStatus === 'ready') parts.push(`Viking MDIM 2.1: hazır · ${Math.round(vikingBaseNativeMPerPx)} m/px · ${vikingBaseAttribution}`);
  else if (vikingBaseStatus === 'loading') parts.push('Viking global: yükleniyor');
  minimapLayerStatus.textContent = parts.join(' · ');
}

function setMinimapPickMode(kind) {
  minimapController.setSelectionMode(kind);
  $('minimap-pick-start').setAttribute('aria-pressed', String(kind === 'start'));
  $('minimap-pick-end').setAttribute('aria-pressed', String(kind === 'end'));
  if (kind) {
    minimapStatus.textContent = `${kind === 'start' ? 'Başlangıç' : 'Bitiş'} koordinatını seçin. Seçim geçilebilirlik veya rota üretmez.`;
  }
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
  const planningState = {
    heatmap: routeHeatmap,
    heatmapVisible: minimapHeatmapToggle.checked,
    route: activeRoute?.status === 'ok' ? activeRoute.path : null,
    segments: activeRoute?.status === 'ok' ? activeRoute.segments : null,
  };
  minimapController.setPlanning(planningState);
  hudMinimapController?.setPlanning(planningState);
});
$('minimap-fit').addEventListener('click', () => minimapController.fit());
$('minimap-clear-points').addEventListener('click', () => clearMissionEndpoints());
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
  view3dBtn.title = '3D görünüm için WebGL2 gerekir.';
  viewStatus.textContent = `3D görünüm açılamadı: ${error.message}. 2D harita kullanılabilir.`;
  viewStatus.hidden = false;
}

function updateViewControls() {
  const is3d = activeView === '3d';
  document.body.classList.toggle('view-3d', is3d);
  document.body.classList.toggle('view-2d', !is3d);
  view2dBtn.setAttribute('aria-pressed', String(!is3d));
  view3dBtn.setAttribute('aria-pressed', String(is3d));
  view3dBtn.disabled = !renderer3d || !layers.dtm.available || Boolean(terrainMeshError);
  view3dBtn.textContent = terrainMeshError
    ? '3D açılamadı'
    : !renderer3d
      ? '3D desteklenmiyor'
      : !layers.dtm.available
        ? '3D DTM yükleniyor…'
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
  if (hudMinimapWidget) {
    hudMinimapWidget.hidden = !is3d || missionSetupOpen;
  }
  if (!is3d) demoFlow?.leave3d();
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
  buildHorizonForTerrain();
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

// Regional-context horizon (K2-3/K2-4). Distant MOLA-class context only: the local DTM heights are never changed,
// the seam difference is measured inside buildHorizonMesh, and the horizon never feeds route height or walkability.
function buildHorizonForTerrain() {
  horizonMesh = null;
  if (!horizonGrid || !terrainMesh || !layers.dtm.available) return;
  const localWindowBounds = layers.dtm.descriptor?.coverage?.localBoundsM;
  try {
    horizonMesh = buildHorizonMesh({
      regionalGrid: horizonGrid,
      localWindowBounds,
      localFrame: { adapter },
      displayConfig: terrainMesh.displayConfig,
      localElevationAt: (x, y) => {
        const sample = layers.dtm.sampleElevation(x, y);
        return sample?.status === STATUS.OK ? sample.value : null;
      },
    });
    horizonStatus = 'ready';
  } catch (error) {
    horizonMesh = null;
    horizonStatus = `unavailable: ${error.message}`;
  }
}

async function loadHorizonGrid() {
  try {
    const [metaRes, binRes] = await Promise.all([
      fetch('data/regional-dem/mola-jezero.json'),
      fetch('data/regional-dem/mola-jezero.f32'),
    ]);
    if (!metaRes.ok || !binRes.ok) throw new Error(`HTTP ${metaRes.status}/${binRes.status}`);
    horizonGrid = regionalGridFromBinary(await metaRes.json(), await binRes.arrayBuffer());
    horizonStatus = 'loaded';
    if (terrainMesh) buildHorizonForTerrain();
  } catch (error) {
    horizonGrid = null;
    horizonMesh = null;
    horizonStatus = `unavailable: ${error.message}`;
  }
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
  buildHorizonForTerrain();
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
  // Tek yön kılavuzu: yumuşatılmış yol, koyu kesikli şerit (renk/alfa route-ribbon.js'ten gelir; guideAlpha renderer'a iletilir).
  plannedRouteRibbon = buildRouteGuideRibbon({
    path: smoothedRoutePath() ?? path,
    segments: null,
    sampleElevation: (xM, yM) => layers.dtm.sampleElevation(xM, yM),
    displayConfig: terrainMesh.displayConfig,
    sampleSpacingM: 1.5,
    provenance: { source: 'active route planner result (smoothed)', mode: activeRoute.mode ?? null },
  });
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
    status.textContent = 'MMGIS sürüş arşivi yüklenemedi.';
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
    viewStatus.textContent = `3D görünüm açılamadı: ${renderer3dError?.message ?? 'WebGL2 başlatılamadı'}. 2D harita kullanılabilir.`;
    viewStatus.hidden = false;
    return;
  }
  if (!layers.dtm.available) {
    viewStatus.textContent = '3D terrain için HiRISE DTM henüz hazır değil; 2D görünüm açık kalıyor.';
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
  if (!debugEnabled && !document.body.classList.contains('panel-collapsed')) {
    document.body.classList.add('panel-collapsed');
    btnTogglePanel?.setAttribute('aria-pressed', 'false');
    requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, mapWrap.clientWidth), h = Math.max(1, mapWrap.clientHeight);
      if (activeView === '3d' && renderer3d) renderer3d.resize(w, h, dpr);
    });
  }
  if (hudMinimapController) {
    lastHudMinimapX = NaN;
    lastHudMinimapY = NaN;
    lastHudMinimapYaw = NaN;
    hudMinimapController.setPlayer({ xM: sim.pos.x, yM: sim.pos.y, headingRad: sim.headingRad });
    if (hudMinimapFollow) hudMinimapController.centerOn(sim.pos.x, sim.pos.y, 1.35);
    else hudMinimapController.fit();
  }
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
  hudMinimapController?.setOverlays({ footprintTrail: footprintTrailSnapshot });
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
    hudMinimapController?.setOverlays({ footprintTrail: footprintTrailSnapshot });
    if (missionSetupOpen || !document.body.classList.contains('panel-collapsed')) {
      minimapController.setPlayer({ xM: astronaut.xM, yM: astronaut.yM, headingRad: astronaut.headingRad });
    }
    lastMinimapFootprintRefreshS = snapshot.simTimeS;
  }
  updateFootprints.lastCount = footprintTrailSnapshot.count;
}

async function loadGeology() {
  try {
    const [geoResponse, manifestResponse] = await Promise.all([
      fetch('data/usgs-sim3464-geology/jezero_geounits_corridor.geojson'),
      fetch('data/usgs-sim3464-geology/manifest.json'),
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
      orthoStatus.textContent = `HiRISE WMTS Ortomozaik: z17 (${gsd17} m/px) ve z14 (${gsd14} m/px) yüklendi · WMTS projeksiyon aritmetiği`;
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
void loadHorizonGrid();
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
    cameraMotion.reset();
    lastCameraMotion = null;
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
  onCorridorChange: (val) => applyCorridorHalfWidth(val),
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

btnOpenRouteSetup?.addEventListener('click', () => openMissionSetup());
hudMinimapOpenSetupBtn?.addEventListener('click', () => openMissionSetup());
btnCloseSetup?.addEventListener('click', () => closeMissionSetup());
hudMinimapFollowBtn?.addEventListener('click', () => {
  hudMinimapFollow = !hudMinimapFollow;
  hudMinimapFollowBtn.setAttribute('aria-pressed', String(hudMinimapFollow));
  hudMinimapFollowBtn.textContent = hudMinimapFollow ? '🎯 Takip: Açık' : '🗺️ Tümü';
  if (!hudMinimapFollow) {
    hudMinimapController?.fit();
  } else if (hudMinimapController) {
    lastHudMinimapX = NaN;
    hudMinimapController.setPlayer({ xM: sim.pos.x, yM: sim.pos.y, headingRad: sim.headingRad });
    hudMinimapController.centerOn(sim.pos.x, sim.pos.y, 1.35);
  }
});
if (setupCorridorInput) {
  setupCorridorInput.min = String(SCENARIO.corridorHalfWidthMinM);
  setupCorridorInput.max = String(SCENARIO.corridorHalfWidthMaxM);
  setupCorridorInput.value = String(sim.corridorHalfWidthM);
  const onSetupCorridorInput = () => {
    const val = Number(setupCorridorInput.value);
    if (Number.isFinite(val)) applyCorridorHalfWidth(val);
  };
  setupCorridorInput.addEventListener('input', onSetupCorridorInput);
  setupCorridorInput.addEventListener('change', onSetupCorridorInput);
}
for (const presetBtn of btnPresetRoutes) {
  presetBtn.addEventListener('click', () => {
    const preset = PRESET_MISSION_ROUTES[presetBtn.dataset.preset];
    if (!preset) return;
    for (const btn of btnPresetRoutes) btn.classList.toggle('is-active', btn === presetBtn);
    const archiveMainToggle = $('toggle-archive-traverse');
    if (archiveMainToggle) archiveMainToggle.checked = !preset.custom;
    if (minimapArchiveToggle) minimapArchiveToggle.checked = !preset.custom;
    applyCustomMissionRoute(preset.start, preset.end, {
      startLabel: preset.startLabel,
      endLabel: preset.endLabel,
      custom: preset.custom,
    });
    showSelectedPoint('start', preset.start, false, { autoPlan: false, applyRoute: false });
    showSelectedPoint('end', preset.end, false, { autoPlan: false, applyRoute: false });
    if (routeWorkerReady && pendingInitId === null) {
      planMinimapRoute();
    } else {
      pendingAutoPlan = true;
    }
    updateMissionSetupUi();
  });
}
btnLaunch3d?.addEventListener('click', async () => {
  closeMissionSetup();
  await selectView('3d');
});
btnLaunch2d?.addEventListener('click', async () => {
  closeMissionSetup();
  await selectView('2d');
});

window.addEventListener('keydown', (e) => {
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && showreel &&
      !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '')) {
    // R oyun içinde "yeniden başlat"; gösteri yalnız küre ekranında başlar, çalışırken her yerde durdurulur.
    // Yakalama aşamasında çalışır: gösteriyi başlatan/durduran R, input.js'in "yeniden başlat"ına ulaşmaz.
    if (showreel.isRunning()) { showreel.stop(); e.stopImmediatePropagation(); return; }
    if (document.querySelector('.mw-globe-screen:not(.mw-globe-screen--hidden)')) { showreel.start(); e.stopImmediatePropagation(); return; }
  }
  if (e.key === 'Escape' && !document.pointerLockElement) {
    if (missionSetupOpen) closeMissionSetup();
    else if (presentationModeActive) setPresentationMode(false);
  }
}, true);

const btnTogglePanel = $('btn-toggle-panel');
btnTogglePanel?.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('panel-collapsed');
  btnTogglePanel.setAttribute('aria-pressed', String(!collapsed));
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, mapWrap.clientWidth), h = Math.max(1, mapWrap.clientHeight);
    if (activeView === '3d' && renderer3d) renderer3d.resize(w, h, dpr);
  });
});

document.addEventListener('click', (event) => {
  const target = event.target;
  const summary = target instanceof Element ? target.closest('summary') : null;
  const details = summary?.parentElement;
  if (details?.tagName === 'DETAILS' && !details.classList.contains('toolbar-settings') &&
      (details.classList.contains('disclosure') || details.classList.contains('secondary-options'))) {
    event.preventDefault();
    details.open = true;
    const isCollapsed = details.classList.toggle('is-collapsed');
    if (!isCollapsed && details.matches('#panel > details.disclosure')) {
      for (const card of document.querySelectorAll('#panel > details.disclosure')) {
        if (card !== details) card.classList.add('is-collapsed');
      }
    }
  }

  for (const settingsEl of document.querySelectorAll('details.toolbar-settings[open]')) {
    if (!(target instanceof Node) || !settingsEl.contains(target)) {
      settingsEl.open = false;
    }
  }
});

updateViewControls();

hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM, currentVerticalScale);

// Tanıtım akışı (küre -> kask + holografik minimap + otomatik sürüş). ?intro=0 ile tamamen atlanır (smoke/geliştirme).
const introEnabled = urlParams.get('intro') !== '0';
let resolveDataReady = () => {};
const dataReady = new Promise((resolve) => { resolveDataReady = resolve; });
let globeScreen = null;
let globeUnavailable = false; // WebGL yoksa küre atlanır, uygulama intro=0 gibi açılır
let introSimulate = null;
let showreel = null;
let modeState = { mode: 'normal', field: null, overlay: null, acc: 0 };
const SHOW_3D_OVERLAY_LINES = false;
let crewHooks = null;
let biomeHooks = null;
let patchNote = null; // yama dışı seçimde tek sakin bilgi satırı
// Planlayıcı yolunu Chaikin ile yumuşatır (2 iterasyon, uçlar sabit); otomatik sürüş ve yoldaşlar bunu kullanır.
let smoothedCache = { src: null, out: null };
function smoothedRoutePath() {
  if (activeRoute?.status !== 'ok' || !Array.isArray(activeRoute.path) || activeRoute.path.length < 2) return null;
  if (smoothedCache.src !== activeRoute.path) smoothedCache = { src: activeRoute.path, out: chaikinSmooth(activeRoute.path, { iterations: 2 }) };
  return smoothedCache.out;
}
if (introEnabled) {
  const autoDrive = createAutoDrive({});
  const helmet = createHelmetOverlay({ root: mapWrap });
  helmet.hide();
  const dock = document.createElement('div');
  dock.className = 'mw-holo-dock';
  mapWrap.appendChild(dock);
  if (hudMinimapWidget) { dock.appendChild(hudMinimapWidget); hudMinimapWidget.classList.add('mw-holo'); }
  const barRoot = document.createElement('div');
  barRoot.className = 'mw-holo-bar';
  dock.appendChild(barRoot);
  demoFlow = createDemoFlow({
    doc: document, mapWrap, helmet, autoDrive, typeLabel: regionTypeLabel, getInfoNote: () => patchNote, onReturnToGlobe: () => globeScreen?.show(),
    getPlayerPos: () => ({ x: sim.pos.x, y: sim.pos.y }),
    getRoutePath: () => smoothedRoutePath(),
    getRouteStats: () => activeRoute?.stats ?? null,
    requestReplan: (pos) => {
      if (pendingPlanId !== null || !routeWorkerReady || !minimapEndpoints.end) return false;
      minimapEndpoints = { ...minimapEndpoints, start: { xM: pos.x, yM: pos.y } };
      endpointRevision++;
      planMinimapRoute();
      return true;
    },
  });
  const controls = createAutoDriveControls({
    root: mapWrap,
    onAutoToggle: (on) => demoFlow.toggleAuto(on),
    onSpeed: (v) => demoFlow.setSpeed(v),
    onPause: (p) => demoFlow.setPaused(p),
    onReroute: () => demoFlow.reroute(),
  });
  demoFlow.attachControls(controls);

  // Ekip (yalnız 2B minimap; 3B sahneye eklenmez): oyuncu gerçek sim, diğerleri aynı rotada ilerleyen yoldaşlar.
  const crewStrip = createCrewStrip({ parent: mapWrap.querySelector('.mw-auto-panel') ?? mapWrap });
  let crew = null, crewSelection = null, crewPushAcc = 0;
  const pushCompanions = (list) => {
    minimapController.setCompanions?.(list);
    hudMinimapController?.setCompanions?.(list);
    crewStrip.update(list);
  };
  crewHooks = {
    rebuild() {
      const sel = demoFlow.getSelection();
      const poly = smoothedRoutePath();
      if (!demoFlow.isIn3d() || !(sel?.crew?.count >= 2) || !poly) {
        if (crew) { crew = null; crewSelection = null; pushCompanions([]); }
        return;
      }
      if (crew && crewSelection === sel) { crew.setPolyline(poly); return; }
      crewSelection = sel;
      const others = sel.crew.count - 1;
      const offsetsM = Array.from({ length: others }, (_, k) => (sel.crew.mode === 'split'
        ? { arcM: 20 * (k + 1), lateralM: 0 }
        : { arcM: 0, lateralM: (k % 2 === 0 ? 1 : -1) * 2.5 * (Math.floor(k / 2) + 1) }));
      crew = createCrewSim({ polyline: poly, count: sel.crew.count, followIndex: sel.crew.followIndex ?? 0, speedMps: SCENARIO.walkSpeedMps, offsetsM });
      pushCompanions(crew.getPositions());
    },
    step(dt) {
      if (crew && !demoFlow.isIn3d()) { crew = null; crewSelection = null; pushCompanions([]); return; }
      if (!crew) return;
      const frozen = missionSetupOpen || sim.phase === 'paused';
      crew.update(frozen ? 0 : dt, demoFlow.getCrewTimeScale());
      crewPushAcc += dt;
      if (crewPushAcc >= 0.1) { crewPushAcc = 0; pushCompanions(crew.getPositions()); }
    },
  };

  // Anlık biyom çipi: snapshot'taki gerçek jeolojik birimden; birim yoksa çip hiç gösterilmez.
  const biomeChip = createBiomeChip({ parent: mapWrap });
  const biomeTracker = createBiomeTracker({ minIntervalMs: 400 });
  biomeHooks = {
    update(snapshot, nowMs) {
      const on = demoFlow.isIn3d() && !missionSetupOpen;
      const label = on ? biomeTracker.update({ geology: snapshot.geology, slopeDeg: snapshot.surface?.slope?.status === 'ok' ? snapshot.surface.slope.value : null }, nowMs) : null;
      biomeChip.set(label?.text ?? null);
    },
  };

  // M: haritayı ekranın %75'ine büyüt / küçült. Esc küçültür.
  const mapScrim = document.createElement('div');
  mapScrim.className = 'mw-map-scrim';
  document.body.appendChild(mapScrim);
  function setMapExpanded(on) {
    const next = Boolean(on);
    if (next === dock.classList.contains('is-expanded')) return;
    dock.classList.toggle('is-expanded', next);
    mapScrim.classList.toggle('is-on', next);
    qualityGovernor.notifyLoadChange?.();
    if (next && document.pointerLockElement) document.exitPointerLock?.();
    modeState.acc = 1;
    requestAnimationFrame(() => { hudMinimapController?.draw?.(); drawMinimapModeOverlay(); });
    setTimeout(() => { hudMinimapController?.draw?.(); drawMinimapModeOverlay(); }, 300);
  }
  mapScrim.addEventListener('click', () => setMapExpanded(false));
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (dock.classList.contains('is-expanded')) setMapExpanded(false); return; }
    if (e.code !== 'KeyM' || e.repeat) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (!document.body.classList.contains('view-3d') || missionSetupOpen) return;
    if (document.querySelector('.mw-globe-screen:not(.mw-globe-screen--hidden)')) return;
    e.preventDefault();
    setMapExpanded(!dock.classList.contains('is-expanded'));
  });
  const overlay = document.createElement('canvas');
  overlay.className = 'mw-mode-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  hudMinimapWidget?.appendChild(overlay);
  modeState.overlay = overlay;
  const modeBar = createViewModeBar({
    root: barRoot,
    onChange: (mode) => applyMode(mode),
  });
  function applyMode(mode) {
    modeState.mode = mode;
    qualityGovernor.notifyLoadChange?.();
    let field = null;
    try { field = computeModeField(mode, { grid: routeGrid.grid }); } catch { field = null; }
    modeState.field = field;
    modeBar.setField(field);
  }
  // Küre ekranı görünürken oyun tuşları (W/A/S/D/Space/P/ok) sim'e gitmesin; input.js'e dokunmadan yakalama aşamasında engellenir.
  window.addEventListener('keydown', (e) => {
    if (!document.querySelector('.mw-globe-screen:not(.mw-globe-screen--hidden)')) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyP', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.stopImmediatePropagation();
  }, true);
  globeScreen = createGlobeScreen({
    root: document.body,
    onUnavailable: () => { globeUnavailable = true; },
    getEtaMinutes: () => (Number.isFinite(activeRoute?.stats?.estimatedDurationS) ? activeRoute.stats.estimatedDurationS / 60 : null),
    onSimulate: introSimulate = async (selection) => {
      await dataReady;
      globeScreen.hide();
      await startDemoTour(selection);
      setPresentationMode(false);
      demoFlow.enter3d(selection);
      crewHooks?.rebuild();
    },
  });
  // Tanıtım gösterisi (yalnız sunum): ?showreel=1 veya R tuşu.
  showreel = createShowreel({
    steps: buildDefaultShowreelSteps({
      globe: globeScreen,
      setViewMode: (id) => { modeBar.setMode(id); applyMode(id); },
      setAutoDrive: (on) => demoFlow.toggleAuto(on),
      setAutoSpeed: (n) => demoFlow.setSpeed(n),
    }),
    onStep: (e) => console.info('[showreel]', e.status, e.id),
  });
}

function drawMinimapModeOverlay() {
  const { overlay, mode, field } = modeState;
  const cv = hudMinimapCanvas;
  if (!overlay || !cv || !hudMinimapController) return;
  const w = cv.offsetWidth, h = cv.offsetHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  overlay.style.left = `${cv.offsetLeft}px`; overlay.style.top = `${cv.offsetTop}px`;
  overlay.style.width = `${w}px`; overlay.style.height = `${h}px`;
  if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
    overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
  }
  const ctx = overlay.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (mode === 'normal') return;
  const v = hudMinimapController.getView();
  drawModeOverlay(ctx, {
    mode, field, canvasW: w, canvasH: h, cellM: field?.cellM ?? null,
    projectToCanvas: (x, y) => [w / 2 + (x - v.centerXM) * v.pxPerM, h / 2 - (y - v.centerYM) * v.pxPerM],
  });
}

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
    routeGrid = resolveRouteGrid(layers.dtm);
    try {
      terrain = routeGrid.grid ? buildTerrainImageFromGrid(routeGrid.grid) : buildTerrainImage(layers.dtm);
      minimapController.setTerrain(terrain);
      hudMinimapController?.setTerrain(terrain);
    } catch (error) {
      minimapController.setTerrain(null);
      hudMinimapController?.setTerrain(null);
      viewStatus.textContent = `2D DTM görseli hazırlanamadı; metre ızgarası kullanılacak. ${error.message}`;
      viewStatus.hidden = false;
    }
  } else {
    minimapController.setTerrain(null);
    hudMinimapController?.setTerrain(null);
  }
  minimapController.setDescriptor(layers.dtm.descriptor);
  hudMinimapController?.setDescriptor(layers.dtm.descriptor);
  syncMinimapCorridor();
  initializeRouteWorker();
  updateRouteButton();
  updateMissionSetupUi();
  updateViewControls();
  hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM, currentVerticalScale);
  updateScaleUi();
  updateHud();
  resolveDataReady();

  if (urlParams.get('demo') === '1' || urlParams.get('presentation') === '1') {
    await startDemoTour();
  } else if (startIn3dRequested && layers.dtm.available && renderer3d && !forceWebgl2Failure) {
    await selectView('3d');
  } else if (introEnabled && !globeUnavailable) {
    // Küre ekranı üstte; 3B/HUD arkada hazır. Rota planı Jezero varsayılanıyla SİMÜLE ET'te başlar.
    globeScreen?.show();
    if (urlParams.get('showreel') === '1') showreel?.start();
  } else if (!debugEnabled) {
    openMissionSetup({ resetSelection: true });
  }
})();

// Adaptive quality governor: ?quality=auto (default) | high | medium | low | minimal. A named level pins it.
const qualityRequest = (() => {
  try {
    const value = new URLSearchParams(location.search).get('quality');
    return QUALITY_MODES.includes(value) ? value : 'auto';
  } catch { return 'auto'; }
})();
const qualityGovernor = createQualityGovernor({ mode: qualityRequest });
function withQualityDiagnostics(rendererDiagnostics) {
  return rendererDiagnostics ? { ...rendererDiagnostics, quality: qualityGovernor.getState() } : null;
}

// Main animation loop: one immutable WorldSnapshot is shared by the active renderer and HUD.
let last = performance.now(), hudAcc = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  // Presentation only: 2D view, hidden tab, paused simulation and the setup panel are not measured.
  const qualityStep = qualityGovernor.update(dt * 1000, {
    hidden: document.hidden || activeView !== '3d' || !renderer3d || missionSetupOpen,
    paused: sim.phase === 'paused',
    focused: document.hasFocus(),
  });
  if (activeView === '3d') renderer3d?.setQualityLevel(qualityStep.level);
  if (!missionSetupOpen) {
    if (activeView === '3d') {
      const surfaceNow = {
        status: lastSnapshot?.surface?.elevation?.status,
        value: lastSnapshot?.surface?.elevation?.value,
      };
      const auto = demoFlow?.autoStep(dt, { yawRad: camera3d.yawRad, simPhase: sim.phase });
      if (auto) {
        // Otomatik sürüş: yön ve kamera yaw'ı rotadan; hız çarpanı sim dt'sine, alt-adımlar ≤ 0.05 s.
        camera3d.yawRad = auto.yawRad;
        for (const h of auto.steps) {
          sim.stepFirstPerson(h, { moveX: auto.moveX, moveY: auto.moveY, jump: false, headingRad: auto.yawRad }, surfaceNow);
          sim.resolveSurfaceContact(layers.dtm.sampleElevation(sim.pos.x, sim.pos.y));
        }
      } else {
        const move = cameraRelativeMovement(camera3d.yawRad, keys);
        sim.stepFirstPerson(dt, { ...move, jump: keys.jumpPressed, headingRad: camera3d.yawRad }, surfaceNow);
      }
      keys.jumpPressed = false;
    } else {
      sim.step(dt, keys);
    }
    if (activeView === '3d') {
      // Composition root samples current ground after movement; simulation rules only receive the sample.
      sim.resolveSurfaceContact(layers.dtm.sampleElevation(sim.pos.x, sim.pos.y));
    }
  }
  crewHooks?.step(dt);
  const snapshot = buildSnapshot();
  biomeHooks?.update(snapshot, now);
  updateFootprints(snapshot);
  hudMinimapAcc += dt;
  if (activeView === '3d' && hudMinimapController && !missionSetupOpen && hudMinimapAcc >= 0.06) {
    hudMinimapAcc = 0;
    const p = snapshot.astronaut;
    const movedOrTurned = !Number.isFinite(lastHudMinimapX)
      || Math.hypot(p.xM - lastHudMinimapX, p.yM - lastHudMinimapY) >= 0.05
      || Math.abs(p.headingRad - lastHudMinimapYaw) >= 0.015;
    if (movedOrTurned) {
      lastHudMinimapX = p.xM;
      lastHudMinimapY = p.yM;
      lastHudMinimapYaw = p.headingRad;
      hudMinimapController.setPlayer({ xM: p.xM, yM: p.yM, headingRad: p.headingRad });
      if (hudMinimapFollow) {
        hudMinimapController.centerOn(p.xM, p.yM, 1.35);
      }
      if (hudMinimapDist) {
        const distM = Math.hypot(waypoints[1].local.x - p.xM, waypoints[1].local.y - p.yM);
        hudMinimapDist.textContent = distM <= SCENARIO.goalRadiusM ? 'Hedef ✓' : `Hedef: ${distM.toFixed(0)} m`;
      }
    }
  }
  modeState.acc += dt;
  if (modeState.overlay && activeView === '3d' && modeState.acc >= 0.1) { modeState.acc = 0; drawMinimapModeOverlay(); }
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

      // Presentation camera motion (walk sway and landing dip) from camera-motion.js; idle breathing is disabled in-app.
      const motion = cameraMotion.update({
        timeS: mov?.timeS,
        horizontalSpeedMps: mov?.horizontalSpeedMps,
        verticalSpeedMps: mov?.verticalSpeedMps,
        grounded: mov?.grounded,
        airborne: mov?.airborne,
        phase: mov?.phase,
        landingRecoveryFrac: mov?.landingRecoveryFrac,
        gaitDistanceM: mov?.gaitDistanceM,
      });
      lastCameraMotion = motion;
      const eyeOffsetM = motion.eyeOffsetZ;
      const lateralOffsetM = motion.eyeOffsetLateral;
      const pitchOffsetRad = motion.pitchOffsetRad;
      const rollOffsetRad = motion.rollOffsetRad;

      if (Number.isFinite(player.bodyWorldZM)) {
        const bodyZDisplay = (player.bodyWorldZM - terrainMesh.displayConfig.referenceElevationM) * terrainMesh.displayConfig.verticalScale;
        setFirstPersonPose(camera3d, {
          xM: player.xM,
          yM: player.yM,
          bodyZDisplay,
          eyeOffsetM,
          lateralOffsetM,
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
        // 3B sarı jeoloji ve mor arşiv çizgileri kapalı (kod duruyor; bayrakla açılır).
        archiveLinePositions: SHOW_3D_OVERLAY_LINES && $('toggle-archive-traverse').checked ? archiveTraverse3d?.linePositions : null,
        geologyLinePositions: SHOW_3D_OVERLAY_LINES && geologyLayerVisible ? geologyLinePositions : null,
        plannedRouteLinePositions,
        disableSurfaceOverlayLines: !SHOW_3D_OVERLAY_LINES,
        plannedRouteRibbon,
        plannedRoutePulseUM: plannedRoutePulseDistance(player),
        footprintTrail: footprintTrailSnapshot,
        horizonMesh,
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
    introSimulate: (sel) => introSimulate?.(sel),
    demoFlow: () => demoFlow,
    getActiveRoute: () => activeRoute,
    getMinimapEndpoints: () => minimapEndpoints,
    setModeForShot: (m) => document.querySelector(`.mw-vm-btn[data-mode="${m}"]`)?.click(),
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
      routeGrid: routeGridDiagnostics(),
      horizonStatus,
      markerMeshReady: Boolean(markerMesh),
      markerMeshError: markerMeshError?.message ?? null,
      markerTriangles: markerMesh ? markerMesh.indices.length / 3 : 0,
      cameraMode: camera3d.mode,
      cameraEyeHeightM: camera3d.eyeHeightM,
      cameraFovYRad: camera3d.fovYRad,
      cameraMotion: lastCameraMotion,
      movement: lastSnapshot?.astronaut?.movement ?? null,
      renderer: withQualityDiagnostics(renderer3d?.getDiagnostics?.() ?? null),
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
