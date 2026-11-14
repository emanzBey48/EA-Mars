// App bootstrap (composition root): coordinates simulation, SurfaceProvider sampling,
// immutable WorldSnapshot creation, canvas rendering, input and HUD.
import { SCENARIO, WAYPOINTS, MAP_FRAME, ROUTE_ORIGIN_NOTE, SOURCES } from './config.js';
import { adapterFromLabel } from './geo/geo.js';
import {
  createGeologyIndex, lookupGeologicUnitLocal, toGeologySnapshot,
  createGeologicContactField, nearestGeologicContactM,
} from './geo/geology.js';
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
import { bindControls } from './input/input.js';
import { createStops } from './geo/rover-observations.js';
import { createRoverGallery } from './view/rover-gallery.js';
import { createHud } from './view/hud.js';
import { combineTraverseMarkers, prepareArchiveTraverse, prepareArchiveTraverse3d } from './view/traverse-layer.js';

const $ = (id) => document.getElementById(id);
const urlParams = new URLSearchParams(window.location.search);
const debugParams = urlParams;
const debugEnabled = debugParams.get('debug') === '1' || window.__MARSWALK_ENABLE_DEBUG__ === true;
const forceWebgl2Failure = debugEnabled && debugParams.get('testWebGL2Failure') === '1';
const initialViewParam = urlParams.get('view')?.toLowerCase();
const startIn3dRequested = initialViewParam === '3d';
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
let geologyContactField = null;
let geologySegmentsLocal = [];
let geologyLinePositions = new Float32Array();
let geologyStatus = 'loading';
let geologyLayerVisible = true;

const mapWrap = $('mapwrap');
const canvas2d = $('map');
const canvas3d = $('map-3d');
const ctx2d = canvas2d.getContext('2d');
const view2dBtn = $('btn-view-2d');
const view3dBtn = $('btn-view-3d');
const viewNote = $('view-note');
const viewStatus = $('view-status');
const fpReticle = $('fp-reticle');
const fpHudHint = $('fp-hud-hint');
const geologyToggle = $('toggle-geology');
const FIRST_PERSON_NOTE = 'Birinci şahıs: WASD ile yürü, 3D sahneye tıklayıp fareyle bak, Space ile küçük bir simülasyon sıçraması yap, P ile duraklat. Esc fare kilidini bırakır. Arazi yüksekliği 3× dikey sunum abartısıdır; yandan ışık da yalnızca görsel kabartma okunurluğu içindir.';

try {
  if (forceWebgl2Failure) throw new Error('Test-only forced WebGL2 initialization failure');
  renderer3d = createTerrainRenderer(canvas3d, { collectDiagnostics: debugEnabled });
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
  return terrainMesh;
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
    prepareArchiveDisplay();
    const { polylineLengthM, straightLengthM } = archiveTraverse.comparison;
    status.textContent = `Sürüş arşivi: Sol 116 Site 4 Drive 1250 → Sol 157 Site 6 Drive 0. Sol 120 ve 164 görüntü kayıtlarına aittir. Yerel harita düzleminde arşiv izi ${polylineLengthM.toFixed(0)} m, senaryo düz hattı ${straightLengthM.toFixed(0)} m.`;
  } catch (error) {
    status.textContent = 'MMGIS sürüş arşivi kullanılamıyor.';
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
  viewNote.textContent = FIRST_PERSON_NOTE;
  viewStatus.hidden = true;
}

function buildSnapshot() {
  const position = { xM: sim.pos.x, yM: sim.pos.y };
  const lookup = geologyIndex ? lookupGeologicUnitLocal(geologyIndex, adapter, position) : null;
  const geology = toGeologySnapshot(lookup, geologyIndex);
  const contact = geology.status === 'ok' || geology.status === 'ambiguous'
    ? nearestGeologicContactM(geologyContactField, position) : null;
  lastSnapshot = createWorldSnapshot({
    sim,
    surfaceProvider: layers.dtm,
    adapter,
    waypoints,
    routeNote: ROUTE_ORIGIN_NOTE,
    geology,
    geologyLayerStatus: geologyStatus,
    geologyContactDistanceM: contact?.distanceM,
  });
  return lastSnapshot;
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
    geologyContactField = createGeologicContactField(geologyIndex, adapter);
    geologySegmentsLocal = uniqueGeologySegments(geologyContactField.polylines);
    if (terrainMesh) geologyLinePositions = buildGeologyLinePositions();
    geologyStatus = 'ready';
    updateHud();
  } catch (error) {
    geologyIndex = null;
    geologyContactField = null;
    geologySegmentsLocal = [];
    geologyLinePositions = new Float32Array();
    geologyStatus = 'unavailable';
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
  hud.updateHud(snapshot);
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

void loadRoverGallery();
geologyToggle?.addEventListener('change', () => { geologyLayerVisible = geologyToggle.checked; updateHud(); });
void loadGeology();
void loadArchiveTraverse();

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
      viewNote.textContent = `${FIRST_PERSON_NOTE} Fare kilitli.`;
    } else if (activeView === '3d') {
      viewNote.textContent = FIRST_PERSON_NOTE;
    }
  },
  onCorridorChange: (val) => {
    const next = sim.setCorridorHalfWidth(val);
    hud.renderLayerPanel(layers, terrain, next);
    if (terrainMesh && layers.dtm.available) {
      markerMesh = null;
      build3dMarkersOnce();
    }
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

  if (startIn3dRequested && layers.dtm.available && renderer3d && !forceWebgl2Failure) {
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
  camera.cx = snapshot.astronaut.xM; camera.cy = snapshot.astronaut.yM;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, mapWrap.clientWidth), h = Math.max(1, mapWrap.clientHeight);
  const pixelWidth = Math.round(w * dpr), pixelHeight = Math.round(h * dpr);
  if (canvas2d.width !== pixelWidth || canvas2d.height !== pixelHeight) {
    canvas2d.width = pixelWidth; canvas2d.height = pixelHeight;
  }
  if (activeView === '2d') {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx2d, w, h, { camera, snapshot, terrain, geologySegments: geologyLayerVisible ? geologySegmentsLocal : [], archiveTraverse: $('toggle-archive-traverse').checked ? archiveTraverse : null });
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
      render(ctx2d, w, h, { camera, snapshot, terrain, geologySegments: geologyLayerVisible ? geologySegmentsLocal : [], archiveTraverse: $('toggle-archive-traverse').checked ? archiveTraverse : null });
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
    getSnapshot: () => lastSnapshot,
    getDiagnostics: () => ({
      activeView,
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
      snapshot: lastSnapshot ? {
        elevationStatus: lastSnapshot.astronaut.elevationStatus,
        zM: lastSnapshot.astronaut.zM,
      } : null,
    }),
  };
}
