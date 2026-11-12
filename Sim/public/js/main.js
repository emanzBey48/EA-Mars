// App bootstrap (composition root): coordinates simulation, SurfaceProvider sampling,
// immutable WorldSnapshot creation, canvas rendering, input and HUD.
import { SCENARIO, WAYPOINTS, MAP_FRAME, ROUTE_ORIGIN_NOTE, SOURCES } from './config.js';
import { adapterFromLabel } from './geo.js';
import { UnavailableLayer, dtmBaseDescriptor, loadOrthoDescriptor } from './layers.js';
import { createDefaultSurfaceRegistry } from './registry.js';
import { MarswalkSim, createWorldSnapshot } from './sim.js';
import { Camera, buildTerrainImage, render } from './render.js';
import { bindControls } from './input.js';
import { createHud } from './hud.js';

const $ = (id) => document.getElementById(id);
const adapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
const waypoints = WAYPOINTS.map((w) => ({ ...w, local: adapter.latLonToLocal(w.latDeg, w.lonDeg) }));
const sim = new MarswalkSim({ a: waypoints[0].local, b: waypoints[1].local }, SCENARIO);
const camera = new Camera();
const registry = createDefaultSurfaceRegistry({ expectedFrame: MAP_FRAME, adapter, baseUrl: 'data' });
const layers = { dtm: new UnavailableLayer(dtmBaseDescriptor(), 'Yükleniyor…'), ortho: null, selectionReport: null };
let terrain = null;
let lastSnapshot = null;

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
  mapEl: $('map'),
  pauseBtn: $('btn-pause'),
  restartBtn: $('btn-restart'),
  corridorInput: $('in-corridor'),
  corridorMin: SCENARIO.corridorHalfWidthMinM,
  corridorMax: SCENARIO.corridorHalfWidthMaxM,
  initialCorridor: sim.corridorHalfWidthM,
  onTogglePause: () => { sim.togglePause(); updateHud(); },
  onRestart: () => { sim.restart(); updateHud(); },
  onZoom: (factor) => camera.zoom(factor),
  onCorridorChange: (val) => {
    const next = sim.setCorridorHalfWidth(val);
    hud.renderLayerPanel(layers, terrain, next);
    updateHud();
    return next;
  },
});

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
  if (layers.dtm.available) terrain = buildTerrainImage(layers.dtm);
  hud.renderLayerPanel(layers, terrain, sim.corridorHalfWidthM);
  updateHud();
})();

// Main animation loop: produces one immutable WorldSnapshot per frame and feeds both renderer and HUD.
const canvas = $('map'); const ctx = canvas.getContext('2d');
let last = performance.now(), hudAcc = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  sim.step(dt, keys);
  const snapshot = buildSnapshot();
  camera.cx = snapshot.astronaut.xM; camera.cy = snapshot.astronaut.yM;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(ctx, w, h, { camera, snapshot, terrain });
  hudAcc += dt; if (hudAcc > 0.08) { hudAcc = 0; hud.updateHud(snapshot); }
  requestAnimationFrame(frame);
}
updateHud();
requestAnimationFrame(frame);

// Debug/test handle is NEVER exposed during normal runs; only when explicitly enabled via ?debug=1 or __MARSWALK_ENABLE_DEBUG__.
const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1' || window.__MARSWALK_ENABLE_DEBUG__ === true;
if (debugEnabled) {
  window.marswalk = { sim, camera, adapter, registry, layers, waypoints, keys, updateHud, getSnapshot: () => lastSnapshot };
}
