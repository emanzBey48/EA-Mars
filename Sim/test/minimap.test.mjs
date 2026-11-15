// Minimap selection tests (node:test, fake canvas/DOM, no browser). Run: node --test test/minimap.test.mjs
// selectionRejection is module-private, so it is exercised through pointer events on the minimap canvas
// and the rejection text it draws via ctx.fillText.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMinimap } from '../public/js/view/minimap/minimap.js';
import { STATUS as ROUTE_CELL_STATUS } from '../public/js/route/cost-model.js';

const CANVAS_PX = 400;
const NODATA_RGB = [255, 0, 255];
const VALID_RGB = [100, 120, 80];
const REJECT = {
  noDtm: 'DTM kapsamı yüklenmedi; nokta seçilemez.',
  outside: 'Nokta yüklenen DTM kapsamının dışında.',
  nodata: 'Bu hücre no-data veya geçersiz; başka bir nokta seçin.',
};

// 20x20 DTM, 1 m per cell, north-west corner at (-10, 10): covers x in [-10, 10), y in (-10, 10].
const BOUNDS = { nwXM: -10, nwYM: 10, widthM: 20, heightM: 20 };
const GRID = 20;

/** Terrain canvas whose pixels are the prepared image; `paint(row, col)` returns RGB for a cell. */
function fakeTerrain(paint = () => VALID_RGB) {
  const data = new Uint8ClampedArray(GRID * GRID * 4);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const [R, G, B] = paint(r, c);
      const o = (r * GRID + c) * 4;
      data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 255;
    }
  }
  const image = { width: GRID, height: GRID, data };
  return {
    canvas: {
      width: GRID,
      height: GRID,
      getContext: () => ({ getImageData: () => image }),
    },
    bounds: { ...BOUNDS },
  };
}

/** Records every fillText call; all other 2D context calls are no-ops. */
function fakeCtx() {
  const texts = [];
  const target = { measureText: () => ({ width: 10 }), texts, fillCalls: 0, fillStyles: [], shadowBlur: 0, shadowBlurWrites: [], strokeCount: 0 };
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'fillText') return (text) => { texts.push(text); };
      if (prop === 'fill') return () => { t.fillCalls++; t.fillStyles.push(t.fillStyle); };
      if (prop === 'stroke') return () => { t.strokeCount++; };
      return () => undefined;
    },
    set(t, prop, value) {
      if (prop === 'shadowBlur') t.shadowBlurWrites.push(value);
      t[prop] = value;
      return true;
    },
  });
  return ctx;
}

/** Fake canvas element with working listener registry so tests can dispatch pointer events. */
function fakeCanvas() {
  const listeners = new Map();
  const ctx = fakeCtx();
  const canvas = {
    width: 0,
    height: 0,
    style: { cursor: '' }, // minimap.js sets canvas.style.cursor (drag/hover feedback, destroy())
    getContext: (kind) => (kind === '2d' ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_PX, height: CANVAS_PX }),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.({ button: 0, pointerId: 1, ...event }); },
    // Shown by default; tests set `shown = false` to model a display:none ancestor.
    shown: true,
    getClientRects: () => (canvas.shown ? [{}] : []),
  };
  return { canvas, ctx };
}

/** Screen position of a world point under the minimap's current view (devicePixelRatio 1, rect 400x400). */
function screenFor(view, xM, yM) {
  return {
    clientX: CANVAS_PX / 2 + (xM - view.centerXM) * view.pxPerM,
    clientY: CANVAS_PX / 2 - (yM - view.centerYM) * view.pxPerM,
  };
}

/** Simulates a click (no drag) at the given world point. */
function clickWorld(mini, canvas, xM, yM) {
  const p = screenFor(mini.getView(), xM, yM);
  canvas.dispatch('pointerdown', p);
  canvas.dispatch('pointerup', p);
}

function setupMinimap({ terrain, planStatus = new Uint8Array(GRID * GRID) }) {
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  const { canvas, ctx } = fakeCanvas();
  const picks = [];
  const mini = createMinimap({
    canvas,
    terrain,
    selectionMode: 'start',
    onPointSelected: (point) => picks.push(point),
  });
  mini.setPlanning({ heatmap: {
    status: planStatus, rows: GRID, cols: GRID, nwXM: BOUNDS.nwXM, nwYM: BOUNDS.nwYM,
    cellSizeM: 1,
  } });
  const restore = () => {
    mini.destroy();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  };
  return { mini, canvas, ctx, picks, restore };
}

test('minimap selection: no DTM loaded -> rejected with explicit message, nothing selected', () => {
  const { mini, canvas, ctx, picks, restore } = setupMinimap({ terrain: null });
  try {
    clickWorld(mini, canvas, 0, 0);
    assert.deepEqual(picks, []);
    assert.ok(ctx.texts.includes(REJECT.noDtm), 'rejection text is drawn on the minimap');
  } finally { restore(); }
});

test('minimap selection: point outside loaded coverage is rejected', () => {
  const { mini, canvas, ctx, picks, restore } = setupMinimap({ terrain: fakeTerrain() });
  try {
    clickWorld(mini, canvas, 25, 0); // east of x < 10
    clickWorld(mini, canvas, 0, 15); // north of y <= 10
    assert.deepEqual(picks, []);
    assert.ok(ctx.texts.includes(REJECT.outside));
  } finally { restore(); }
});

test('minimap selection: no-data and invalid DTM cells are rejected (both hatch colours)', () => {
  // Row 10 / col 10 is cell centre (x=0.5, y=-0.5); row 12 / col 4 is (x=-5.5, y=-2.5).
  const terrain = fakeTerrain((r, c) => {
    if (r === 10 && c === 10) return NODATA_RGB;
    if (r === 12 && c === 4) return [90, 0, 90];
    return VALID_RGB;
  });
  const { mini, canvas, ctx, picks, restore } = setupMinimap({ terrain });
  try {
    clickWorld(mini, canvas, 0.5, -0.5);
    assert.deepEqual(picks, []);
    assert.ok(ctx.texts.includes(REJECT.nodata));

    clickWorld(mini, canvas, -5.5, -2.5);
    assert.deepEqual(picks, [], 'dark magenta invalid hatch is rejected too');
  } finally { restore(); }
});

test('minimap selection: valid cell inside coverage is accepted and reported in metres', () => {
  const terrain = fakeTerrain((r, c) => (r === 10 && c === 10 ? NODATA_RGB : VALID_RGB));
  const { mini, canvas, picks, restore } = setupMinimap({ terrain });
  try {
    clickWorld(mini, canvas, -9.5, 9.5); // NW valid cell centre
    assert.equal(picks.length, 1);
    assert.equal(picks[0].kind, 'start');
    assert.ok(Math.abs(picks[0].xM - -9.5) < 1e-6);
    assert.ok(Math.abs(picks[0].yM - 9.5) < 1e-6);
  } finally { restore(); }
});

test('minimap selection: EDGE_UNKNOWN is rejected before sending an endpoint to the planner', () => {
  const planStatus = new Uint8Array(GRID * GRID);
  planStatus[10 * GRID + 10] = ROUTE_CELL_STATUS.EDGE_UNKNOWN;
  planStatus[11 * GRID + 10] = ROUTE_CELL_STATUS.TOO_STEEP;
  const { mini, canvas, ctx, picks, restore } = setupMinimap({ terrain: fakeTerrain(), planStatus });
  try {
    clickWorld(mini, canvas, 0.5, -0.5);
    assert.deepEqual(picks, []);
    assert.ok(ctx.texts.includes('Bu hücrenin komşu yüzey durumu bilinmiyor; başka bir nokta seçin.'));
    clickWorld(mini, canvas, 0.5, -1.5);
    assert.deepEqual(picks, [], 'other blocked planning statuses are rejected too');
    clickWorld(mini, canvas, -9.5, 9.5);
    assert.equal(picks.length, 1, 'known cell stays selectable');
  } finally { restore(); }
});

test('minimap selection: a rejected click after a valid one does not overwrite the endpoint', () => {
  const terrain = fakeTerrain((r, c) => (r === 10 && c === 10 ? NODATA_RGB : VALID_RGB));
  const { mini, canvas, picks, restore } = setupMinimap({ terrain });
  try {
    clickWorld(mini, canvas, -9.5, 9.5);
    mini.setSelectionMode('start');
    clickWorld(mini, canvas, 0.5, -0.5); // no-data
    assert.equal(picks.length, 1, 'no second selection callback for a rejected point');
  } finally { restore(); }
});

test('minimap renders ground-sampled footprint quads and clears them with an empty trail', () => {
  const { mini, ctx, restore } = setupMinimap({ terrain: fakeTerrain() });
  try {
    const before = ctx.fillStyles.length;
    const trail = {
      count: 1,
      quads: new Float32Array([-0.2, -0.2, -1, 0.2, -0.2, -1, 0.2, 0.2, -1, -0.2, 0.2, -1]),
      instances: new Float32Array([0, 0, -1, 0, 1, 0.8, 1, 0, 0, 1]),
    };
    mini.setOverlays({ footprintTrail: trail });
    assert.ok(ctx.fillStyles.slice(before).includes('#24130e'), 'footprint uses the trail fill color');
    const afterDraw = ctx.fillStyles.length;
    mini.setOverlays({ footprintTrail: { count: 0, quads: new Float32Array(), instances: new Float32Array() } });
    assert.ok(!ctx.fillStyles.slice(afterDraw).includes('#24130e'), 'empty reset trail draws no footprint');
  } finally { restore(); }
});

// Route fixture: 3 points -> 2 segments, scores aligned with segments.
const ROUTE_PLANNING = () => ({
  route: [{ xM: -8, yM: -8 }, { xM: 0, yM: 0 }, { xM: 8, yM: -2 }],
  segments: [{ score: 80 }, { score: 20 }],
});
const STROKES_PER_ROUTE_DRAW = 6; // halo + body + dashed core, one stroke per segment each

test('minimap route: segments never set a positive shadowBlur and no shadow stays active', () => {
  const { mini, ctx, restore } = setupMinimap({ terrain: fakeTerrain() });
  try {
    mini.setPlanning(ROUTE_PLANNING());
    assert.ok(ctx.strokeCount >= STROKES_PER_ROUTE_DRAW, 'route segments are stroked');
    assert.ok(ctx.shadowBlurWrites.every((v) => v === 0), `shadowBlur is never raised (saw ${JSON.stringify(ctx.shadowBlurWrites)})`);
    assert.equal(ctx.shadowBlur, 0, 'no shadow is left active after drawing');
  } finally { restore(); }
});

test('minimap route: a route change redraws immediately while the minimap is shown', () => {
  const { mini, ctx, restore } = setupMinimap({ terrain: fakeTerrain() });
  try {
    const before = ctx.strokeCount;
    mini.setPlanning(ROUTE_PLANNING());
    assert.equal(ctx.strokeCount - before, STROKES_PER_ROUTE_DRAW, 'one full route draw');
    const second = ctx.strokeCount;
    mini.setPlanning({ route: [{ xM: 0, yM: 0 }, { xM: 4, yM: 4 }], segments: [{ score: 50 }] });
    assert.equal(ctx.strokeCount - second, 3, 'new single-segment route is drawn at once');
  } finally { restore(); }
});

test('minimap: a hidden canvas (display:none ancestor) is not drawn; shown again it redraws', () => {
  const { mini, canvas, ctx, restore } = setupMinimap({ terrain: fakeTerrain() });
  try {
    canvas.shown = false;
    const hiddenStart = ctx.strokeCount;
    mini.setPlanning(ROUTE_PLANNING());
    mini.draw();
    assert.equal(ctx.strokeCount, hiddenStart, 'no strokes while hidden');
    canvas.shown = true;
    mini.draw();
    assert.ok(ctx.strokeCount - hiddenStart >= STROKES_PER_ROUTE_DRAW, 'the pending state is drawn once shown');
  } finally { restore(); }
});

test('minimap: hidden document skips drawing and visibilitychange redraws', () => {
  const previousDocument = globalThis.document;
  const doc = {
    hidden: true,
    listeners: new Map(),
    addEventListener(type, fn) { this.listeners.set(type, fn); },
    removeEventListener(type) { this.listeners.delete(type); },
  };
  globalThis.document = doc;
  let restore = () => {};
  try {
    const built = setupMinimap({ terrain: fakeTerrain() });
    restore = built.restore;
    const { mini, ctx } = built;
    mini.setPlanning(ROUTE_PLANNING());
    assert.equal(ctx.strokeCount, 0, 'a hidden document draws nothing');
    doc.hidden = false;
    doc.listeners.get('visibilitychange')();
    assert.ok(ctx.strokeCount >= STROKES_PER_ROUTE_DRAW, 'the pending state is drawn when the document becomes visible');
  } finally {
    restore();
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('minimap route animation: redraws at about 15 Hz while shown and stops while hidden', () => {
  const previousRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const previousCaf = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const previousPerf = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const queue = [];
  const clock = { t: 1000 };
  Object.defineProperty(globalThis, 'requestAnimationFrame', { value: (fn) => { queue.push(fn); return queue.length; }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { value: () => {}, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock.t }, configurable: true, writable: true });
  const { mini, canvas, ctx, restore } = setupMinimap({ terrain: fakeTerrain() });
  // One 60 Hz frame: advance the fake clock and run the frame callbacks queued so far.
  const frames = (count) => {
    for (let i = 0; i < count; i++) {
      clock.t += 1000 / 60;
      for (const fn of queue.splice(0)) fn();
    }
  };
  try {
    mini.setPlanning(ROUTE_PLANNING()); // immediate draw; schedules the animation
    const start = ctx.strokeCount;
    frames(60); // one simulated second
    const drawsPerSecond = (ctx.strokeCount - start) / STROKES_PER_ROUTE_DRAW;
    assert.ok(drawsPerSecond >= 13 && drawsPerSecond <= 17, `about 15 redraws per second, got ${drawsPerSecond}`);

    canvas.shown = false;
    frames(2); // at most one in-flight frame callback may still fire
    const hiddenStart = ctx.strokeCount;
    frames(60);
    assert.equal(ctx.strokeCount, hiddenStart, 'animation draws nothing while hidden');
  } finally {
    restore();
    for (const [name, desc] of [['requestAnimationFrame', previousRaf], ['cancelAnimationFrame', previousCaf], ['performance', previousPerf]]) {
      if (desc) Object.defineProperty(globalThis, name, desc); else delete globalThis[name];
    }
  }
});
