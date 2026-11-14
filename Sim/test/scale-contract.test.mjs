// Stage 35A — dikey ölçek sözleşmesi: buildTerrainMesh çıktısında z farkı kaynak kot farkına eşit olmalı
// (verticalScale = 1) veya tam olarak verticalScale katı olmalı; no-data asla kota çevrilmez.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTerrainMesh } from '../public/js/view/3d/terrain-mesh.js';

const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≠ ${expected}`);

/** Gerçek GridElevationLayer sözleşmesini taklit eden sentetik katman (cellState + adapter.pixelToLocal). */
function syntheticLayer(values, { rowOffset = 0, colOffset = 0 } = {}) {
  const rows = values.length;
  const cols = values[0].length;
  return {
    rows,
    cols,
    rowOffset,
    colOffset,
    cellSizeM: 1,
    descriptor: {
      source: 'synthetic', product: 'synthetic-scale-contract', version: 'test',
      unit: 'm', verticalDatum: 'synthetic', resolutionM: 1,
    },
    adapter: {
      pixelToLocal(row, col) {
        return { x: col * 1, y: -row * 1 };
      },
    },
    cellState(row, col) {
      const v = values[row - rowOffset]?.[col - colOffset];
      if (v === undefined || v === null) return { status: 'no_data' };
      return { status: 'ok', value: v };
    },
  };
}

// Her değer 1/4 m'nin tam katı ve |değer| < 4096: float32'de TAM temsil edilir, farklar da tamdır.
const REF = -2560;
const EXACT = [
  [-2559.5, -2559.25, -2559.0],
  [-2558.5, -2558.25, -2558.0],
  [-2557.5, -2557.0, -2556.5],
];

function pairwiseDiffError(mesh, source) {
  let worst = 0;
  const count = mesh.sourceElevationsM.length;
  for (let a = 0; a < count; a++) {
    for (let b = 0; b < count; b++) {
      const meshDz = mesh.positions[b * 3 + 2] - mesh.positions[a * 3 + 2];
      const srcDz = source[b] - source[a];
      worst = Math.max(worst, Math.abs(meshDz - srcDz));
    }
  }
  return worst;
}

test('verticalScale = 1: mesh z farkı kaynak kot farkına birebir eşit (tol 1e-9 m)', () => {
  const mesh = buildTerrainMesh(syntheticLayer(EXACT), { referenceElevationM: REF, verticalScale: 1 });
  const source = Array.from(mesh.sourceElevationsM);
  assert.equal(source.length, 9);
  assert.ok(pairwiseDiffError(mesh, source) <= 1e-9, 'z farkları kaynak farkıyla eşleşmiyor');
  assert.equal(mesh.displayConfig.verticalScale, 1);
  assert.equal(mesh.displayConfig.referenceElevationM, REF);
});

test('verticalScale = 3: z 3 katına çıkar; metadata verticalScale=3 olarak korunur; kaynak kot değişmez', () => {
  const mesh = buildTerrainMesh(syntheticLayer(EXACT), { referenceElevationM: REF, verticalScale: 3 });
  const source = Array.from(mesh.sourceElevationsM);
  for (let k = 0; k < source.length; k++) {
    assert.ok(Math.abs(mesh.positions[k * 3 + 2] - 3 * (source[k] - REF)) <= 1e-9, `vertex ${k} z 3x değil`);
  }
  assert.equal(mesh.displayConfig.verticalScale, 3);
  assert.equal(mesh.displayConfig.referenceElevationM, REF);
  // Kaynak kot dizisi ölçekten bağımsızdır: EXACT ile birebir.
  assert.deepEqual(source, EXACT.flat());
  // Görünür farkın 1x'e oranı 3'tür (sözleşmenin özü).
  const z1 = buildTerrainMesh(syntheticLayer(EXACT), { referenceElevationM: REF, verticalScale: 1 });
  const span3 = mesh.bounds.maxZ - mesh.bounds.minZ;
  const span1 = z1.bounds.maxZ - z1.bounds.minZ;
  assert.ok(Math.abs(span3 - 3 * span1) <= 1e-9);
  assert.equal(z1.provenance.sourceElevationRangeM.min, -2559.5);
  assert.equal(z1.provenance.sourceElevationRangeM.max, -2556.5);
});

test('gerçek DTM değerleri (float32 yuvarlamalı): verticalScale=1 farkı 2e-6 m içinde (float32 ulp sınırı)', () => {
  // Jezero penceresinden okunan gözlemlenen uç değerler (dtm_subset.json windowStats).
  const min = -2592.678955078125;
  const max = -2547.8369140625;
  const mid = Math.fround(-2570.123456789);
  const values = [[min, mid, max], [mid, min, max], [max, mid, min]];
  const ref = (min + max) / 2;
  const mesh = buildTerrainMesh(syntheticLayer(values), { referenceElevationM: ref, verticalScale: 1 });
  const source = Array.from(mesh.sourceElevationsM);
  assert.ok(pairwiseDiffError(mesh, source) <= 2e-6);
});

test('no-data çevresindeki quad üçgenlenmez: 3x3 merkez no-data -> 0 üçgen, 4 quad atlanır', () => {
  const values = [
    [-2559.5, -2559.25, -2559.0],
    [-2558.5, null, -2558.0],
    [-2557.5, -2557.0, -2556.5],
  ];
  const mesh = buildTerrainMesh(syntheticLayer(values), { referenceElevationM: REF, verticalScale: 3 });
  assert.equal(mesh.indices.length, 0);
  assert.equal(mesh.provenance.validVertexCount, 8);
  assert.equal(mesh.provenance.omittedQuadCount, 4);
  assert.equal(mesh.provenance.nonOkCellCount, 1);
});

test('no-data sıfır kota dönüşmez: 4x4 köşe no-data -> 8 quad, hiçbir vertex 0 m kaynak değeri taşımaz', () => {
  const values = [
    [null, -2559.25, -2559.0, -2558.75],
    [-2558.5, -2558.25, -2558.0, -2557.75],
    [-2557.5, -2557.0, -2556.5, -2556.25],
    [-2556.0, -2555.75, -2555.5, -2555.25],
  ];
  const mesh = buildTerrainMesh(syntheticLayer(values), { referenceElevationM: REF, verticalScale: 3 });
  assert.equal(mesh.indices.length, 8 * 6);
  assert.equal(mesh.provenance.validQuadCount, 8);
  assert.equal(mesh.provenance.validVertexCount, 15);
  for (const v of mesh.sourceElevationsM) {
    assert.ok(Number.isFinite(v));
    assert.ok(v < -2500, `kaynak kot ${v} beklenen Jezero aralığında değil (sıfır/no-data sızıntısı?)`);
  }
  for (const idx of mesh.indices) assert.ok(idx < 15, 'üçgen eksik vertex’e işaret ediyor');
  // Geçerli en alçak kot -2559,25 (köşe no-data hariç): z = 3 * (-2559,25 - REF) = 2,25 m.
  near(mesh.bounds.minZ, 3 * (-2559.25 - REF));
  near(mesh.bounds.maxZ, 3 * (-2555.25 - REF));
});

test('geçersiz verticalScale (0, NaN) reddedilir', () => {
  const layer = syntheticLayer(EXACT);
  assert.throws(() => buildTerrainMesh(layer, { referenceElevationM: REF, verticalScale: 0 }), TypeError);
  assert.throws(() => buildTerrainMesh(layer, { referenceElevationM: REF, verticalScale: Number.NaN }), TypeError);
});
