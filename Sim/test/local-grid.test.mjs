// Stage K3-10 — geo/local-grid.js saf yeniden örnekleme testleri. YALNIZ SENTETİK girdi: gerçek veri dosyası yok.
// Köprü (coordinate bridge) registry.js'deki makeLegacyCoordinateBridge ile aynı biçimde kurulur; örnekleyici
// gerçek GridElevationLayer'dır (uygulamanın sampleElevation sözleşmesi).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resampleToRegularLocalGrid, toDemWindowInput, noDataFloat32FromBits, DEFAULT_NO_DATA_VALUE, LOCAL_GRID_SCHEMA,
} from '../public/js/geo/local-grid.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';
import { GridElevationLayer, STATUS } from '../public/js/surface/layers.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';
import { createDemWindow, localToCell } from '../public/js/route/route-service.js';

// Legacy PDS3 etiketinin çerçeve parametreleri (dtm_subset.json label; yalnız çerçeve, veri yok).
const LEGACY_LABEL = {
  radiusKm: 3394.8398133163, centerLatDeg: 15, centerLonDeg: 77.44, mapScaleM: 1.0096633268711,
  lineProjectionOffset: 1088495.5, sampleProjectionOffset: 3210.5000000001, lines: 14266, samples: 6673,
  pixelRegistration: 'CENTER_PDS_1BASED',
};
const ROW0 = 5915, COL0 = 3242, SRC_ROWS = 60, SRC_COLS = 80;
const NODATA_BITS = 0xFF7FFFFB;
const NODATA = noDataFloat32FromBits(NODATA_BITS);
// Planar test surface z = 1000 + 0.05x - 0.03y (≈3° eğim). Offset keeps z away from 0 over the ~1.2 km window
// (f32 rounding at ~1000 m is ≤ 3e-5 m, inside the 1e-4 m tolerance).
const SLOPE_X = 0.05, SLOPE_Y = -0.03, OFFSET = 1000;

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

/** Sentetik kaynak penceresi: değerler kanonik düzlemde analitik düzlemden, hücre merkezinde örneklenir. */
function makeSource({ blockNoData = null } = {}) {
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
  const layer = new GridElevationLayer({
    descriptor: { product: 'SENTETIK_LEGACY_BOLGE', unit: 'm', verticalDatum: null },
    adapter, values, rows: SRC_ROWS, cols: SRC_COLS, rowOffset: ROW0, colOffset: COL0,
    noDataBits: NODATA_BITS, validMin: -1e6, validMax: 1e6,
  });
  const nw = adapter.pixelToLocal(ROW0 - 0.5, COL0 - 0.5);
  const se = adapter.pixelToLocal(ROW0 + SRC_ROWS - 0.5, COL0 + SRC_COLS - 0.5);
  const footprint = {
    minXM: Math.min(nw.x, se.x), maxXM: Math.max(nw.x, se.x),
    minYM: Math.min(nw.y, se.y), maxYM: Math.max(nw.y, se.y),
  };
  return { adapter, layer, sampler: (x, y) => layer.sampleElevation(x, y), footprint };
}

const planar = (x, y) => OFFSET + SLOPE_X * x + SLOPE_Y * y;

/** Pencerenin sınırlarından 'margin' metre içeri çekilmiş kutu (kaynak kapsamı içinde kalmak için). */
function innerBounds(footprint, margin) {
  return { minXM: footprint.minXM + margin, maxXM: footprint.maxXM - margin, minYM: footprint.minYM + margin, maxYM: footprint.maxYM - margin };
}

test('kaynak köprüsü anizotropik: doğu-batı hücre aralığı ~1,0457 m, kuzey-güney ~1,0101 m', () => {
  const a = makeBridge();
  const e = a.pixelToLocal(ROW0 + 10, COL0 + 10).x - a.pixelToLocal(ROW0 + 10, COL0 + 9).x;
  const n = a.pixelToLocal(ROW0 + 10, COL0 + 10).y - a.pixelToLocal(ROW0 + 11, COL0 + 10).y;
  assert.ok(Math.abs(e - 1.0457) < 0.002, `E-W aralık ${e}`);
  assert.ok(Math.abs(n - 1.0101) < 0.002, `N-S aralık ${n}`);
});

test('bilinear: düzlemsel kaynakta düzenli ızgara değeri analitik yüzeye ≤ 1e-4 m uyar', () => {
  const { sampler, adapter, footprint } = makeSource();
  const res = resampleToRegularLocalGrid({
    sampleElevation: sampler, adapter, bounds: innerBounds(footprint, 5), cellSizeM: 1.0096633268711, interpolation: 'bilinear',
  });
  let checked = 0, maxErr = 0;
  for (let row = 0; row < res.rows; row++) for (let col = 0; col < res.cols; col++) {
    const i = row * res.cols + col;
    if (!res.validMask[i]) continue;
    const x = res.nwXM + (col + 0.5) * res.cellSizeM, y = res.nwYM - (row + 0.5) * res.cellSizeM;
    maxErr = Math.max(maxErr, Math.abs(res.elevation[i] - planar(x, y)));
    checked++;
  }
  assert.ok(checked > 0.9 * res.rows * res.cols, `geçerli hücre az: ${checked}`);
  assert.ok(maxErr <= 1e-4, `maks hata ${maxErr} m`);
});

test('nearest: örnekleyici merkezi ile düzenli hücre merkezi AYNI yere bakar (çerçeve kayması < 1e-6 m)', () => {
  const { sampler, adapter, footprint } = makeSource();
  const calls = [];
  const spy = (x, y) => { calls.push([x, y]); return sampler(x, y); };
  const bounds = innerBounds(footprint, 5);
  const res = resampleToRegularLocalGrid({ sampleElevation: spy, bounds, cellSizeM: 1, interpolation: 'nearest' });
  assert.equal(calls.length, res.rows * res.cols);
  let k = 0, maxShift = 0;
  for (let row = 0; row < res.rows; row++) for (let col = 0; col < res.cols; col++) {
    const ex = res.nwXM + (col + 0.5) * res.cellSizeM, ey = res.nwYM - (row + 0.5) * res.cellSizeM;
    maxShift = Math.max(maxShift, Math.abs(calls[k][0] - ex), Math.abs(calls[k][1] - ey));
    k++;
  }
  assert.ok(maxShift < 1e-6, `çerçeve kayması ${maxShift} m`);
  // nearest değeri: örnekleyicinin döndürdüğü tam hücre değeri (0'a çevrilmemiş)
  const i = Math.floor(res.rows / 2) * res.cols + Math.floor(res.cols / 2);
  assert.equal(res.validMask[i], 1);
  assert.equal(res.elevation[i], sampler(res.nwXM + (Math.floor(res.cols / 2) + 0.5), res.nwYM - (Math.floor(res.rows / 2) + 0.5)).value);
});

test('kaynak no-data bloğu: sahte 0 yok, bloktan uzak hücreler geçerli, komşu hücre kirlenmez', () => {
  const block = { r0: 20, r1: 22, c0: 30, c1: 33 };
  const { sampler, adapter, footprint } = makeSource({ blockNoData: block });
  const res = resampleToRegularLocalGrid({
    sampleElevation: sampler, adapter, bounds: innerBounds(footprint, 5), cellSizeM: 1.0096633268711, interpolation: 'bilinear',
  });
  let far = 0, invalidNear = 0;
  for (let row = 0; row < res.rows; row++) for (let col = 0; col < res.cols; col++) {
    const i = row * res.cols + col;
    const x = res.nwXM + (col + 0.5) * res.cellSizeM, y = res.nwYM - (row + 0.5) * res.cellSizeM;
    const near = adapter.localToCell(x, y);
    const sr = near.row - ROW0, sc = near.col - COL0;
    const inMargin = sr >= block.r0 - 2 && sr <= block.r1 + 2 && sc >= block.c0 - 2 && sc <= block.c1 + 2;
    if (!inMargin) {
      far++;
      assert.equal(res.validMask[i], 1, `bloktan uzak hücre geçersiz (${row},${col})`);
      assert.ok(Math.abs(res.elevation[i] - planar(x, y)) <= 1e-4, 'uzak hücre değeri bozuk');
    } else if (!res.validMask[i]) {
      invalidNear++;
      assert.equal(res.elevation[i], NODATA, 'geçersiz hücre no-data deseni taşımalı');
    } else {
      assert.ok(Math.abs(res.elevation[i] - planar(x, y)) <= 1e-4, 'blok kenarında geçerli hücre bozuk');
    }
  }
  assert.ok(far > 0 && invalidNear > 0, `far=${far} invalidNear=${invalidNear}`);
  for (let i = 0; i < res.elevation.length; i++) {
    if (!res.validMask[i]) assert.equal(res.elevation[i], res.noDataValue);
    else assert.notEqual(res.elevation[i], 0, 'geçerli hücre sıfır olmamalı (planar yüzey 0 değil)');
  }
  assert.equal(res.stats.known + res.stats.unknown, res.stats.total);
});

test('sınır: kaynak kapsamı dışındaki hücreler no-data; geçerli hücreler kaynak merkezleri arasında', () => {
  const { sampler, adapter, footprint, layer } = makeSource();
  const pad = 15; // kaynak kapsamını 15 m taşan kutu
  const bounds = { minXM: footprint.minXM - pad, maxXM: footprint.maxXM + pad, minYM: footprint.minYM - pad, maxYM: footprint.maxYM + pad };
  const res = resampleToRegularLocalGrid({ sampleElevation: sampler, adapter, bounds, cellSizeM: 1, interpolation: 'bilinear' });
  const first = adapter.pixelToLocal(ROW0, COL0), last = adapter.pixelToLocal(ROW0 + SRC_ROWS - 1, COL0 + SRC_COLS - 1);
  const xLo = Math.min(first.x, last.x), xHi = Math.max(first.x, last.x), yLo = Math.min(first.y, last.y), yHi = Math.max(first.y, last.y);
  let invalid = 0, valid = 0;
  for (let row = 0; row < res.rows; row++) for (let col = 0; col < res.cols; col++) {
    const i = row * res.cols + col;
    const x = res.nwXM + (col + 0.5) * res.cellSizeM, y = res.nwYM - (row + 0.5) * res.cellSizeM;
    if (res.validMask[i]) {
      valid++;
      assert.ok(x >= xLo - 1e-9 && x <= xHi + 1e-9 && y >= yLo - 1e-9 && y <= yHi + 1e-9, 'geçerli hücre kaynak merkezleri dışında');
    } else {
      invalid++;
      assert.equal(res.elevation[i], NODATA);
    }
  }
  assert.ok(invalid > 0 && valid > 0, `valid=${valid} invalid=${invalid}`);
  assert.ok(layer.available);
});

test('cellSizeM 2 ve 1: boyutlar, köşe ve planar değerler tutarlı', () => {
  const { sampler, adapter, footprint } = makeSource();
  const bounds = innerBounds(footprint, 8);
  for (const cell of [1, 2]) {
    const res = resampleToRegularLocalGrid({ sampleElevation: sampler, adapter, bounds, cellSizeM: cell, interpolation: 'bilinear' });
    assert.equal(res.cellSizeM, cell);
    assert.equal(res.cols, Math.ceil((bounds.maxXM - bounds.minXM) / cell - 1e-9));
    assert.equal(res.rows, Math.ceil((bounds.maxYM - bounds.minYM) / cell - 1e-9));
    assert.equal(res.nwXM, bounds.minXM);
    assert.equal(res.nwYM, bounds.maxYM);
    assert.equal(res.widthM, res.cols * cell);
    let maxErr = 0;
    for (let row = 0; row < res.rows; row++) for (let col = 0; col < res.cols; col++) {
      const i = row * res.cols + col;
      if (!res.validMask[i]) continue;
      const x = res.nwXM + (col + 0.5) * cell, y = res.nwYM - (row + 0.5) * cell;
      maxErr = Math.max(maxErr, Math.abs(res.elevation[i] - planar(x, y)));
    }
    assert.ok(maxErr <= 1e-4, `cellSizeM=${cell} maks hata ${maxErr}`);
  }
});

test('deterministik: aynı girdi bayt-bayt aynı çıktı', () => {
  const { sampler, adapter, footprint } = makeSource({ blockNoData: { r0: 10, r1: 12, c0: 40, c1: 41 } });
  const run = () => resampleToRegularLocalGrid({
    sampleElevation: sampler, adapter, bounds: innerBounds(footprint, 5), cellSizeM: 1.0096633268711, interpolation: 'bilinear',
  });
  const a = run(), b = run();
  assert.equal(Buffer.compare(Buffer.from(a.elevation.buffer), Buffer.from(b.elevation.buffer)), 0);
  assert.equal(Buffer.compare(Buffer.from(a.validMask.buffer), Buffer.from(b.validMask.buffer)), 0);
  assert.deepEqual(a.meta, b.meta);
});

test('donmuş çıktı ve meta: yazma hata verir, meta kaynak/yöntem alanlarını taşır', () => {
  const { sampler, adapter, footprint } = makeSource();
  const res = resampleToRegularLocalGrid({ sampleElevation: sampler, adapter, bounds: innerBounds(footprint, 5), cellSizeM: 1, interpolation: 'bilinear' });
  assert.ok(Object.isFrozen(res) && Object.isFrozen(res.meta) && Object.isFrozen(res.stats));
  assert.throws(() => { res.rows = 1; }, TypeError);
  assert.throws(() => { res.meta.method = 'x'; }, TypeError);
  assert.equal(res.schema, LOCAL_GRID_SCHEMA);
  assert.equal(res.meta.source, 'coordinate bridge');
  assert.equal(res.meta.method, 'coordinate-bridge-resample');
  assert.equal(res.meta.interpolation, 'bilinear');
  assert.equal(res.noDataValue, DEFAULT_NO_DATA_VALUE);
  assert.equal(noDataFloat32FromBits(0xFF7FFFFB), DEFAULT_NO_DATA_VALUE);
});

test('sampler status ok ama değer sonlu değilse hücre bilinmiyor (0 değil)', () => {
  const sampler = (x, y) => (x > 0 ? { status: STATUS.OK, value: Number.NaN } : { status: STATUS.OK, value: 2 });
  const res = resampleToRegularLocalGrid({ sampleElevation: sampler, bounds: { minXM: -3, maxXM: 3, minYM: -2, maxYM: 2 }, cellSizeM: 1, interpolation: 'nearest' });
  for (let row = 0; row < res.rows; row++) for (let col = 0; col < res.cols; col++) {
    const i = row * res.cols + col;
    const x = res.nwXM + (col + 0.5);
    if (x > 0) { assert.equal(res.validMask[i], 0); assert.equal(res.elevation[i], res.noDataValue); }
    else { assert.equal(res.validMask[i], 1); assert.equal(res.elevation[i], 2); }
  }
});

test('hatalı girdi açık hata verir', () => {
  const { sampler, adapter, footprint } = makeSource();
  const good = { sampleElevation: sampler, adapter, bounds: innerBounds(footprint, 5), cellSizeM: 1, interpolation: 'bilinear' };
  assert.throws(() => resampleToRegularLocalGrid({ ...good, sampleElevation: null }), TypeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, bounds: undefined }), TypeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, bounds: { minXM: 0, maxXM: 0, minYM: 0, maxYM: 1 } }), RangeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, cellSizeM: 0 }), RangeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, cellSizeM: Number.NaN }), RangeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, interpolation: 'cubic' }), RangeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, adapter: null }), TypeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, noDataValue: Number.NaN }), TypeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, validMin: -5 }), TypeError);
  assert.throws(() => resampleToRegularLocalGrid({ ...good, validMin: 5, validMax: -5 }), RangeError);
  assert.throws(() => resampleToRegularLocalGrid({ sampleElevation: () => undefined, bounds: { minXM: 0, maxXM: 2, minYM: 0, maxYM: 2 }, cellSizeM: 1, interpolation: 'nearest' }), TypeError);
});

test('toDemWindowInput: createDemWindow ile aynı hücre eşlemesi (planlayıcı penceresi)', () => {
  const { sampler, adapter, footprint } = makeSource();
  const res = resampleToRegularLocalGrid({ sampleElevation: sampler, adapter, bounds: innerBounds(footprint, 5), cellSizeM: 1.0096633268711, interpolation: 'bilinear', validMin: -1e6, validMax: 1e6 });
  const win = createDemWindow(toDemWindowInput(res));
  assert.equal(win.rows, res.rows);
  assert.equal(win.cols, res.cols);
  assert.equal(win.noDataValue, res.noDataValue);
  const probe = [[0, 0], [Math.floor(res.rows / 2), Math.floor(res.cols / 3)], [res.rows - 1, res.cols - 1]];
  for (const [r, c] of probe) {
    const x = res.nwXM + (c + 0.5) * res.cellSizeM, y = res.nwYM - (r + 0.5) * res.cellSizeM;
    const cell = localToCell(win, x, y);
    assert.equal(cell.inside, true);
    assert.equal(cell.row, r);
    assert.equal(cell.col, c);
    assert.equal(win.elevation[r * win.cols + c], res.elevation[r * res.cols + c]);
  }
  assert.throws(() => toDemWindowInput({ schema: 'x' }), TypeError);
});
