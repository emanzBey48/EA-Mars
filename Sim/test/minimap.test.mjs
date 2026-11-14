// Minimap selection tests (node:test, fake canvas/DOM, no browser). Run: node --test test/minimap.test.mjs
// selectionRejection is module-private, so it is exercised through pointer events on the minimap canvas
// and the rejection text it draws via ctx.fillText.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMinimap } from '../public/js/view/minimap/minimap.js';

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
  const target = { measureText: () => ({ width: 10 }), texts };
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'fillText') return (text) => { texts.push(text); };
      return () => undefined;
    },
    set(t, prop, value) { t[prop] = value; return true; },
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

function setupMinimap({ terrain }) {
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
