// App bootstrap (composition root): coordinates simulation, SurfaceProvider sampling,
// immutable WorldSnapshot creation, canvas rendering, input and HUD.
import { SCENARIO, WAYPOINTS, MAP_FRAME, ROUTE_ORIGIN_NOTE, SOURCES } from './config.js';
import { adapterFromLabel } from './geo/geo.js';
import { UnavailableLayer, dtmBaseDescriptor, loadOrthoDescriptor } from './surface/layers.js';
import { createDefaultSurfaceRegistry } from './surface/registry.js';
import { MarswalkSim, createWorldSnapshot } from './simulation/sim.js';
import { Camera, buildTerrainImage, render } from './view/render.js';
import { createCamera as create3dCamera, setCameraTarget, zoomCamera } from './view/3d/camera.js';
import { createTerrainRenderer } from './view/3d/renderer.js';
import { buildTerrainMesh } from './view/3d/terrain-mesh.js';
import { bindControls } from './input/input.js';
import { createHud } from './view/hud.js';

const $ = (id) => document.getElementById(id);
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
const sim = new MarswalkSim({ a: waypoints[0].local, b: waypoints[1].local }, SCENARIO);
const camera = new Camera();
const camera3d = create3dCamera({ targetXM: waypoints[0].local.x, targetYM: waypoints[0].local.y });
const registry = createDefaultSurfaceRegistry({ expectedFrame: MAP_FRAME, adapter, baseUrl: 'data' });
const layers = { dtm: new UnavailableLayer(dtmBaseDescriptor(), 'Yükleniyor…'), ortho: null, selectionReport: null };
let terrain = null;
let terrainMesh = null;
let lastSnapshot = null;
let activeView = '2d';
let viewRequestId = 0;
let renderer3d = null;
let renderer3dError = null;
let terrainMeshError = null;

const mapWrap = $('mapwrap');
const canvas2d = $('map');
const canvas3d = $('map-3d');
const ctx2d = canvas2d.getContext('2d');
const view2dBtn = $('btn-view-2d');
const view3dBtn = $('btn-view-3d');
const viewNote = $('view-note');
const viewStatus = $('view-status');

try {
  renderer3d = createTerrainRenderer(canvas3d);
} catch (error) {
  renderer3dError = error;
  view3dBtn.disabled = true;
  view3dBtn.title = 'Bu tarayıcıda WebGL2 kullanılamıyor.';
  viewStatus.textContent = `3D görünüm kullanılamıyor: ${error.message}. 2D harita kullanılabilir.`;
  viewStatus.hidden = false;
}

function updateViewControls() {
  view2dBtn.setAttribute('aria-pressed', String(activeView === '2d'));
  view3dBtn.setAttribute('aria-pressed', String(activeView === '3d'));
  view3dBtn.disabled = !renderer3d || !layers.dtm.available || Boolean(terrainMeshError);
  view3dBtn.textContent = terrainMeshError
    ? '3D kullanılamıyor'
    : !renderer3d
      ? '3D desteklenmiyor'
      : !layers.dtm.available
        ? (layers.dtm.descriptor.access.reason === 'Yükleniyor…' ? '3D DTM yükleniyor…' : '3D DTM yok')
        : '3D';
  canvas2d.hidden = activeView !== '2d';
  canvas3d.hidden = activeView !== '3d';
  viewNote.hidden = activeView !== '3d';
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
    verticalScale: 3,
  };
  const prepared = buildTerrainMesh(layers.dtm, displayConfig);
  if (!prepared.indices.length) throw new Error('DTM penceresinde çizilebilir geçerli terrain quad’ı bulunamadı.');
  terrainMesh = prepared;
  return terrainMesh;
}

function setActiveView(view) {
  activeView = view;
  updateViewControls();
}

async function selectView(view) {
  const requestId = ++viewRequestId;
  if (view !== '3d') {
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
  setActiveView('3d');
  viewStatus.hidden = true;
}

function buildSnapshot() {
  lastSnapshot = createWorldSnapshot({
    sim,
    surfaceProvider: layers.dtm,
    adapter,
    waypoints,
    routeNote: ROUTE_ORIGIN_NOTE,
  });
  return lastSnapshot;
}

const hud = createHud({
  waypoints,
  routeLengthM: sim.metrics().routeLengthM,
  corridorHalfWidthM: sim.corridorHalfWidthM,
  scenario: SCENARIO,
  routeOriginNote: ROUTE_ORIGIN_NOTE,
  sources: SOURCES,
});

const updateHud = () => hud.updateHud(buildSnapshot());

const { keys } = bindControls({
  mapEl: mapWrap,
  view2dBtn,
  view3dBtn,
  pauseBtn: $('btn-pause'),
  restartBtn: $('btn-restart'),
  corridorInput: $('in-corridor'),
  corridorMin: SCENARIO.corridorHalfWidthMinM,
  corridorMax: SCENARIO.corridorHalfWidthMaxM,
  initialCorridor: sim.corridorHalfWidthM,
  onTogglePause: () => { sim.togglePause(); updateHud(); },
  onRestart: () => { sim.restart(); updateHud(); },
  onZoom: (factor) => {
    camera.zoom(factor);
    zoomCamera(camera3d, 1 / factor);
  },
  onViewChange: (view) => { void selectView(view); },
  onCorridorChange: (val) => {
    const next = sim.setCorridorHalfWidth(val);
    hud.renderLayerPanel(layers, terrain, next);
    updateHud();
    return next;
  },
});

updateViewControls();

hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM);

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
    } catch (error) {
      viewStatus.textContent = `2D DTM görseli hazırlanamadı; metre ızgarası kullanılacak. ${error.message}`;
      viewStatus.hidden = false;
    }
  }
  updateViewControls();
  hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM);
  updateHud();
})();

// Main animation loop: one immutable WorldSnapshot is shared by the active renderer and HUD.
let last = performance.now(), hudAcc = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  sim.step(dt, keys);
  const snapshot = buildSnapshot();
  camera.cx = snapshot.astronaut.xM; camera.cy = snapshot.astronaut.yM;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, mapWrap.clientWidth), h = Math.max(1, mapWrap.clientHeight);
  const pixelWidth = Math.round(w * dpr), pixelHeight = Math.round(h * dpr);
  if (canvas2d.width !== pixelWidth || canvas2d.height !== pixelHeight) {
    canvas2d.width = pixelWidth; canvas2d.height = pixelHeight;
  }
  if (activeView === '2d') {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx2d, w, h, { camera, snapshot, terrain });
  } else if (renderer3d && terrainMesh) {
    try {
      renderer3d.resize(w, h, dpr);
      const player = snapshot.astronaut;
      const hasElevation = player.elevationStatus === 'ok' && Number.isFinite(player.zM);
      const zDisplay = hasElevation
        ? (player.zM - terrainMesh.displayConfig.referenceElevationM) * terrainMesh.displayConfig.verticalScale
        : (terrainMesh.bounds.minZ + terrainMesh.bounds.maxZ) / 2; // camera pivot from terrain bounds, never a substitute astronaut elevation
      setCameraTarget(camera3d, { xM: player.xM, yM: player.yM, zDisplay });
      renderer3d.renderFrame({ snapshot, camera: camera3d, terrainMesh });
    } catch (error) {
      try { renderer3d.dispose(); } catch { /* retain the 2D fallback */ }
      renderer3d = null;
      renderer3dError = error;
      activeView = '2d';
      updateViewControls();
      viewStatus.textContent = `3D görünüm durdu: ${error.message}. 2D harita kullanılabilir.`;
      viewStatus.hidden = false;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx2d, w, h, { camera, snapshot, terrain });
    }
  }
  hudAcc += dt; if (hudAcc > 0.08) { hudAcc = 0; hud.updateHud(snapshot); }
  requestAnimationFrame(frame);
}
updateHud();
requestAnimationFrame(frame);

// Debug/test handle is NEVER exposed during normal runs; only when explicitly enabled via ?debug=1 or __MARSWALK_ENABLE_DEBUG__.
const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1' || window.__MARSWALK_ENABLE_DEBUG__ === true;
if (debugEnabled) {
  window.marswalk = { sim, camera, camera3d, adapter, registry, layers, waypoints, keys, updateHud, getSnapshot: () => lastSnapshot };
}
