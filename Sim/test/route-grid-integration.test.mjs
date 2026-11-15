// Stage K3-10 — legacy köprü DTM için planlayıcı/minimap düzenli ızgara entegrasyonu (saf yardımcılar).
// YALNIZ SENTETİK girdi: gerçek veri dosyası okunmaz. Köprü, local-grid.test.mjs ile aynı (anizotropik) kurgudadır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { noDataFloat32FromBits } from '../public/js/geo/local-grid.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';
import { GridElevationLayer, STATUS } from '../public/js/surface/layers.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';
import {
  buildPlannerWindowInput, legacyWindowBoundsM, LEGACY_DTM_DESCRIPTOR_ID, prepareRouteGrid, ROUTE_GRID_INTERPOLATION,
  ROUTE_GRID_MODE, shouldRegrid,
} from '../public/js/route/legacy-grid-plan.js';
import { buildFieldForWindow, cellToLocal, createDemWindow, localToCell } from '../public/js/route/route-service.js';
import { routePreferenceParams } from '../public/js/route/route-compare.js';
import { buildTerrainImage, buildTerrainImageFromGrid } from '../public/js/view/render.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CELL_STATUS = { OK: 0, NO_DATA: 2, EDGE_UNKNOWN: 5 };

// Legacy PDS3 etiketinin çerçeve parametreleri (yalnız çerçeve; veri yok).
const LEGACY_LABEL = {
  radiusKm: 3394.8398133163, centerLatDeg: 15, centerLonDeg: 77.44, mapScaleM: 1.0096633268711,
  lineProjectionOffset: 1088495.5, sampleProjectionOffset: 3210.5000000001, lines: 14266, samples: 6673,
  pixelRegistration: 'CENTER_PDS_1BASED',
};
const ROW0 = 5915, COL0 = 3242, SRC_ROWS = 60, SRC_COLS = 80;
const NODATA_BITS = 0xFF7FFFFB;
const NODATA = noDataFloat32FromBits(NODATA_BITS);
const SLOPE_X = 0.05, SLOPE_Y = -0.03, OFFSET = 1000;
const LEGACY_CONTROLS = [{ id: 'WB1', row: 1, col: 1, residualM: 0 }, { id: 'ROUB', row: 2, col: 2, residualM: 0 }];

/** registry.js makeLegacyCoordinateBridge ile aynı kurgu: legacy piksel -> enlem/boylam -> kanonik yerel metre. */
function makeBridge() {
  const canonical = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
  const legacy = adapterFromLabel(LEGACY_LABEL, WAYPOINTS[0]);
  return {
    grid: legacy.grid,
    localToCell(x, y) {
      const ll = canonical.localToLatLon(x, y);
      const lL = legacy.latLonToLocal(ll.latDeg, ll.lonDeg);
      return legacy.localToCell(lL.x, lL.y);
    },
    pixelToLocal(row, col) {
      const lL = legacy.pixelToLocal(row, col);
      const ll = legacy.localToLatLon(lL.x, lL.y);
      return canonical.latLonToLocal(ll.latDeg, ll.lonDeg);
    },
  };
}

/**
 * Sentetik legacy katman. `legacy: false` ise USGS/native benzeri descriptor (köprü kontrolü yok).
 * `blockNoData` kaynak hücrelerinde gerçek no-data bit desenini yazar; sampler bunu no-data olarak görür.
 */
function makeLayer({ legacy = true, blockNoData = null, spy = null } = {}) {
  const adapter = makeBridge();
  const values = new Float32Array(SRC_ROWS * SRC_COLS);
  for (let r = 0; r < SRC_ROWS; r++) for (let c = 0; c < SRC_COLS; c++) {
    const p = adapter.pixelToLocal(ROW0 + r, COL0 + c);
    values[r * SRC_COLS + c] = OFFSET + SLOPE_X * p.x + SLOPE_Y * p.y;
  }
  if (blockNoData) {
    const dv = new DataView(values.buffer);
    for (let r = blockNoData.r0; r <= blockNoData.r1; r++) for (let c = blockNoData.c0; c <= blockNoData.c1; c++) {
      dv.setUint32((r * SRC_COLS + c) * 4, NODATA_BITS, true);
    }
  }
  const descriptor = legacy
    ? { id: LEGACY_DTM_DESCRIPTOR_ID, product: 'SENTETIK_LEGACY', unit: 'm', verticalDatum: null, quality: { transformControls: LEGACY_CONTROLS } }
    : { id: 'hirise-dtm', product: 'SENTETIK_USGS', unit: 'm', verticalDatum: null, quality: {} };
  const layer = new GridElevationLayer({
    descriptor, adapter, values, rows: SRC_ROWS, cols: SRC_COLS, rowOffset: ROW0, colOffset: COL0,
    noDataBits: NODATA_BITS, validMin: -1e6, validMax: 1e6,
  });
  if (spy) {
    const original = layer.sampleElevation.bind(layer);
    layer.sampleElevation = (x, y) => { spy.calls++; return original(x, y); };
  }
  return layer;
}

/** Görüntü testleri için minimal document/canvas taklidi (yalnız pikseller; ağ/DOM yok). */
function withCanvasStub(fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const previous = globalThis.document;
  globalThis.document = {
    createElement() {
      const canvas = { width: 0, height: 0, image: null };
      canvas.getContext = () => ({
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(img) { canvas.image = img; },
      });
      return canvas;
    },
  };
  try { return fn(); } finally {
    if (had) globalThis.document = previous; else delete globalThis.document;
  }
}

/** Katmanın kendi hücrelerinden (aynı çerçeve) elle kurulmuş "ızgara": görüntü karşılaştırması için. */
function gridFromLayerCells(layer) {
  const n = layer.rows * layer.cols;
  const elevation = new Float32Array(n);
  const validMask = new Uint8Array(n);
  for (let r = 0; r < layer.rows; r++) for (let c = 0; c < layer.cols; c++) {
    const st = layer.cellState(r + layer.rowOffset, c + layer.colOffset);
    const i = r * layer.cols + c;
    if (st.status === STATUS.OK) { elevation[i] = st.value; validMask[i] = 1; } else { elevation[i] = NODATA; }
  }
  const nw = layer.adapter.pixelToLocal(layer.rowOffset - 0.5, layer.colOffset - 0.5);
  return {
    rows: layer.rows, cols: layer.cols, cellSizeM: layer.cellSizeM, nwXM: nw.x, nwYM: nw.y,
    elevation, validMask, noDataValue: NODATA,
  };
}

// ------------------------------------------------------------------------------------------------------------
// (a) saf yardımcılar: legacy bayrağı ve native ayrımı

test('(a) shouldRegrid: yalnız legacy kimliği + köprü kontrolü olan descriptor için true', () => {
  assert.equal(shouldRegrid(makeLayer({ legacy: true }).descriptor), true);
  assert.equal(shouldRegrid(makeLayer({ legacy: false }).descriptor), false, 'USGS/native descriptor');
  assert.equal(shouldRegrid({ id: LEGACY_DTM_DESCRIPTOR_ID, quality: {} }), false, 'kontrol noktası yoksa legacy sayılmaz');
  assert.equal(shouldRegrid({ id: LEGACY_DTM_DESCRIPTOR_ID, quality: { transformControls: [] } }), false);
  assert.equal(shouldRegrid(null), false);
  assert.equal(shouldRegrid(undefined), false);
  assert.equal(ROUTE_GRID_INTERPOLATION, 'nearest', 'K3-10 kipi nearest (örnekleyiciyle birebir)');
});

test('(a) legacy kimliği registry.js legacy girişiyle aynı metin (kaynak metni doğrulaması)', () => {
  const registrySource = fs.readFileSync(path.join(HERE, '..', 'public', 'js', 'surface', 'registry.js'), 'utf8');
  assert.ok(registrySource.includes(`id: '${LEGACY_DTM_DESCRIPTOR_ID}'`), 'registry.js legacy kimliği değişmiş olabilir');
});

test('(a) legacyWindowBoundsM: pencere kenarları, kapsam kutusu (sıralı, sonlu, boş değil)', () => {
  const layer = makeLayer();
  const b = legacyWindowBoundsM(layer);
  for (const v of Object.values(b)) assert.ok(Number.isFinite(v));
  assert.ok(b.maxXM > b.minXM && b.maxYM > b.minYM);
  // Kutu, pencerenin kuzeybatı ve güneydoğu köşe merkezlerini kapsar (kenar ortası değil).
  const nw = layer.adapter.pixelToLocal(ROW0 - 0.5, COL0 - 0.5);
  assert.ok(nw.x >= b.minXM - 1e-9 && nw.x <= b.maxXM + 1e-9 && nw.y >= b.minYM - 1e-9 && nw.y <= b.maxYM + 1e-9);
});

// ------------------------------------------------------------------------------------------------------------
// (b) planlayıcı hücresi = örnekleyici hücresi (sentetik anizotropik köprü)

test('(b) düzenli ızgara: her hücre merkezinde değer örnekleyiciyle birebir aynı; planlayıcı hücresi = örnekleyici hücresi', () => {
  const layer = makeLayer();
  const { grid } = prepareRouteGrid(layer, { now: () => 0 });
  assert.equal(grid.cellSizeM, layer.cellSizeM, 'hücre boyu katmandan (1,00966 m)');
  let checked = 0;
  for (let row = 0; row < grid.rows; row += 3) for (let col = 0; col < grid.cols; col += 3) {
    const i = row * grid.cols + col;
    if (!grid.validMask[i]) continue;
    const x = grid.nwXM + (col + 0.5) * grid.cellSizeM, y = grid.nwYM - (row + 0.5) * grid.cellSizeM;
    const s = layer.sampleElevation(x, y);
    assert.equal(s.status, 'ok');
    assert.equal(grid.elevation[i], s.value, `hücre (${row},${col}) değeri örnekleyiciyle aynı olmalı`);
    checked++;
  }
  assert.ok(checked > 100, `yeterli örnek (${checked})`);
});

test('(b) planlayıcı penceresinde yerel nokta -> hücre -> değer, örnekleyicinin merkez değeriyle aynı', () => {
  const layer = makeLayer();
  const { grid } = prepareRouteGrid(layer, { now: () => 0 });
  const win = createDemWindow(buildPlannerWindowInput(grid));
  const b = legacyWindowBoundsM(layer);
  let checked = 0;
  for (let k = 0; k < 200; k++) {
    // deterministik düzen (rastgele değil): kaynak penceresinin içinde kalan noktalar
    const x = b.minXM + ((k * 37) % 997) / 997 * (b.maxXM - b.minXM) * 0.9 + 0.5;
    const y = b.minYM + ((k * 61) % 991) / 991 * (b.maxYM - b.minYM) * 0.9 + 0.5;
    const cell = localToCell(win, x, y);
    if (!(cell.row >= 0 && cell.row < win.rows && cell.col >= 0 && cell.col < win.cols)) continue;
    const i = cell.row * win.cols + cell.col;
    if (win.elevation[i] === NODATA) continue;
    const centre = cellToLocal(win, cell.row, cell.col);
    const s = layer.sampleElevation(centre.xM, centre.yM);
    if (s.status !== 'ok') continue;
    assert.equal(win.elevation[i], s.value, `nokta (${x.toFixed(2)},${y.toFixed(2)}) planlayıcı hücresi merkez kotu`);
    checked++;
  }
  assert.ok(checked > 50, `yeterli nokta (${checked})`);
});

test('(b) eski (köprü hücresinden kayık) çerçeve bu sentetik veride gerçekten kayık: test ayırt edicidir', () => {
  const layer = makeLayer();
  // Eski yol: ham pencere + katmanın cellSizeM'i + köşe; köprü hücresiyle örtüşmez.
  const nw = layer.adapter.pixelToLocal(ROW0 - 0.5, COL0 - 0.5);
  const oldWin = createDemWindow({
    elevation: layer.values, rows: layer.rows, cols: layer.cols, cellSizeM: layer.cellSizeM,
    nwXM: nw.x, nwYM: nw.y, noDataValue: NODATA, validMin: -1e6, validMax: 1e6,
  });
  let misaligned = 0;
  for (let row = 2; row < layer.rows - 2; row += 5) for (let col = 2; col < layer.cols - 2; col += 5) {
    const centre = cellToLocal(oldWin, row, col);
    const sampledCell = layer.sampleElevation(centre.xM, centre.yM).cell;
    if (sampledCell && (sampledCell.row !== row + layer.rowOffset || sampledCell.col !== col + layer.colOffset)) misaligned++;
  }
  assert.ok(misaligned > 0, 'eski düzenli çerçevede en az bir hücre kayık olmalı (aksi halde bu test bir şey ölçmez)');
});

// ------------------------------------------------------------------------------------------------------------
// (c) no-data: no-data kalır, 0 olmaz; komşuluk fail-closed

test('(c) kaynak no-data bloğu: grid no-data kalır (0 değil), validMask 0; planlayıcı NO_DATA; komşular EDGE_UNKNOWN', () => {
  const layer = makeLayer({ blockNoData: { r0: 20, r1: 24, c0: 30, c1: 34 } });
  const { grid } = prepareRouteGrid(layer, { now: () => 0 });
  for (let i = 0; i < grid.elevation.length; i++) {
    if (grid.validMask[i] === 0) assert.equal(grid.elevation[i], grid.noDataValue, 'no-data hücresi noDataValue taşır');
  }
  const win = createDemWindow(buildPlannerWindowInput(grid));
  const field = buildFieldForWindow(win, routePreferenceParams('balanced'));
  let noDataCells = 0, edgeCells = 0, badValid = 0;
  for (let i = 0; i < grid.elevation.length; i++) {
    if (grid.validMask[i] === 0) {
      noDataCells++;
      if (field.status[i] !== CELL_STATUS.NO_DATA) badValid++;
    }
  }
  for (let i = 0; i < grid.elevation.length; i++) if (field.status[i] === CELL_STATUS.EDGE_UNKNOWN) edgeCells++;
  assert.ok(noDataCells > 0, 'sentetik no-data bloğu ızgaraya geçti');
  assert.equal(badValid, 0, 'her no-data hücresi planlayıcıda NO_DATA');
  assert.ok(edgeCells > 0, 'no-data bloğunun komşuluğu EDGE_UNKNOWN (fail-closed) olmalı');
  // Geçerli bir hücre no-data komşusu varsa asla OK olmamalı (komşu kaynak 3x3 bilinmiyor).
  for (let row = 1; row < grid.rows - 1; row++) for (let col = 1; col < grid.cols - 1; col++) {
    const i = row * grid.cols + col;
    if (grid.validMask[i] !== 1) continue;
    let touchesNoData = false;
    for (let dr = -1; dr <= 1 && !touchesNoData; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (grid.validMask[(row + dr) * grid.cols + (col + dc)] === 0) { touchesNoData = true; break; }
    }
    if (touchesNoData) assert.notEqual(field.status[i], CELL_STATUS.OK, `(${row},${col}) no-data komşusuyla OK olamaz`);
  }
});

// ------------------------------------------------------------------------------------------------------------
// (d) USGS/native yolunda ızgara üretilmez, örnekleme yapılmaz

test('(d) native (USGS) katman: ızgara üretilmez, sampler hiç çağrılmaz, mod native', () => {
  const spy = { calls: 0 };
  const layer = makeLayer({ legacy: false, spy });
  const result = prepareRouteGrid(layer, { now: () => 0 });
  assert.equal(result.mode, ROUTE_GRID_MODE.NATIVE);
  assert.equal(result.grid, null);
  assert.equal(result.resampleMs, null);
  assert.equal(spy.calls, 0, 'native yolda örnekleme yapılmamalı');
});

test('(d) legacy katman: ızgara bir kez üretilir, süre raporlanır, mod legacy-bridge-regridded', () => {
  const ticks = [100, 142];
  const result = prepareRouteGrid(makeLayer(), { now: () => ticks.shift() });
  assert.equal(result.mode, ROUTE_GRID_MODE.LEGACY_REGRIDDED);
  assert.equal(result.interpolation, 'nearest');
  assert.equal(result.resampleMs, 42);
  assert.ok(result.grid && result.grid.rows > 0 && result.grid.cols > 0);
});

// ------------------------------------------------------------------------------------------------------------
// (e) init-window girdi sözleşmesi

test('(e) buildPlannerWindowInput: createDemWindow kabul eder, elevation kopya, grid bozulmaz, klonlanabilir', () => {
  const layer = makeLayer({ blockNoData: { r0: 20, r1: 22, c0: 30, c1: 31 } });
  const { grid } = prepareRouteGrid(layer, { now: () => 0 });
  const before = Array.from(grid.elevation.slice(0, 200));
  const input = buildPlannerWindowInput(grid);
  assert.notEqual(input.elevation.buffer, grid.elevation.buffer, 'transfer edilen tampon kopya olmalı');
  assert.deepEqual(Array.from(grid.elevation.slice(0, 200)), before, 'grid değerleri değişmemeli');
  assert.equal(input.rows, grid.rows);
  assert.equal(input.cols, grid.cols);
  assert.equal(input.cellSizeM, grid.cellSizeM);
  assert.equal(input.nwXM, grid.nwXM);
  assert.equal(input.nwYM, grid.nwYM);
  assert.equal(input.noDataValue, grid.noDataValue);
  assert.equal(input.adapter, null, 'adapter klonlanamaz fonksiyon taşımaz');
  assert.equal(input.coverageMask, undefined, 'no-data NO_DATA olarak kalır; kapsam maskesi verilmez');
  assert.doesNotThrow(() => createDemWindow(input));
  assert.doesNotThrow(() => structuredClone(input), 'postMessage ile klonlanabilir olmalı');
  const win = createDemWindow(structuredClone(input));
  assert.equal(win.rows * win.cols, grid.elevation.length);
});

// ------------------------------------------------------------------------------------------------------------
// (f) minimap görüntüsü: düzenli ızgaradan, örnekleme yok, planlayıcıyla aynı çerçeve

test('(f) buildTerrainImageFromGrid = buildTerrainImage (aynı hücreler): piksel birebir', () => {
  withCanvasStub(() => {
    const layer = makeLayer({ blockNoData: { r0: 20, r1: 24, c0: 30, c1: 34 } });
    const fromLayer = buildTerrainImage(layer);
    const fromGrid = buildTerrainImageFromGrid(gridFromLayerCells(layer));
    assert.equal(fromGrid.canvas.image.width, fromLayer.canvas.image.width);
    assert.equal(fromGrid.canvas.image.height, fromLayer.canvas.image.height);
    assert.deepEqual(Array.from(fromGrid.canvas.image.data), Array.from(fromLayer.canvas.image.data));
    assert.equal(fromGrid.zMin, fromLayer.zMin);
    assert.equal(fromGrid.zMax, fromLayer.zMax);
    assert.deepEqual({ ...fromGrid.bounds }, { ...fromLayer.bounds });
  });
});

test('(f) görüntü çerçevesi planlayıcı penceresiyle aynı (nwXM/nwYM/genişlik/yükseklik)', () => {
  withCanvasStub(() => {
    const layer = makeLayer();
    const { grid } = prepareRouteGrid(layer, { now: () => 0 });
    const win = createDemWindow(buildPlannerWindowInput(grid));
    const terrain = buildTerrainImageFromGrid(grid);
    assert.equal(terrain.bounds.nwXM, win.nwXM);
    assert.equal(terrain.bounds.nwYM, win.nwYM);
    assert.ok(Math.abs(terrain.bounds.widthM - win.widthM) < 1e-9);
    assert.ok(Math.abs(terrain.bounds.heightM - win.heightM) < 1e-9);
    assert.equal(terrain.canvas.image.width, win.cols);
    assert.equal(terrain.canvas.image.height, win.rows);
  });
});

test('(f) no-data hücreleri eflatun taranır (G=0, R=B), geçerli hücreler arazi rengi', () => {
  withCanvasStub(() => {
    const layer = makeLayer({ blockNoData: { r0: 20, r1: 24, c0: 30, c1: 34 } });
    const grid = gridFromLayerCells(layer);
    const { canvas } = buildTerrainImageFromGrid(grid);
    const data = canvas.image.data;
    let hatch = 0, terrainPx = 0;
    for (let i = 0; i < grid.elevation.length; i++) {
      const p = i * 4;
      if (grid.validMask[i] === 0) {
        hatch++;
        assert.equal(data[p + 1], 0);
        assert.equal(data[p], data[p + 2]);
      } else if (data[p + 1] !== 0) terrainPx++;
    }
    assert.ok(hatch > 0 && terrainPx > 0);
  });
});

test('(f) ızgara uzunluğu tutarsızsa açık hata (sessiz görüntü yok)', () => {
  withCanvasStub(() => {
    const layer = makeLayer();
    const grid = gridFromLayerCells(layer);
    assert.throws(() => buildTerrainImageFromGrid({ ...grid, elevation: grid.elevation.slice(1) }), TypeError);
    assert.throws(() => buildTerrainImageFromGrid({ ...grid, cellSizeM: 0 }), TypeError);
    assert.throws(() => buildTerrainImageFromGrid(null), TypeError);
  });
});

test('(f) görüntü yolu kaynak sampler çağırmaz (yalnız grid okunur)', () => {
  withCanvasStub(() => {
    const spy = { calls: 0 };
    const layer = makeLayer({ spy });
    const grid = gridFromLayerCells(layer);
    spy.calls = 0;
    buildTerrainImageFromGrid(grid);
    assert.equal(spy.calls, 0);
  });
});

test('(g) ROUTE_GRID_MODE değerleri ve planlayıcı ızgarası yalnız legacy için tanımlı', () => {
  assert.equal(ROUTE_GRID_MODE.NATIVE, 'native');
  assert.equal(ROUTE_GRID_MODE.LEGACY_REGRIDDED, 'legacy-bridge-regridded');
  assert.equal(ROUTE_GRID_MODE.LEGACY_FALLBACK, 'legacy-bridge-native-fallback');
  assert.ok(Number.isFinite(NODATA) && NODATA !== 0, 'no-data sıfır değil');
});
