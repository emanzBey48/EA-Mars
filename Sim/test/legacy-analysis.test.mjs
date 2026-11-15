// Stage K3-8/K3-9 — yalnız SENTETİK girdilerle saf fonksiyon testleri. Gerçek veri dosyalarına bağlı değildir.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  terrainAniso, brightnessGradientAniso, resampleOrthoAtPositions, evaluateSurface, decideLegacyRegistration,
  runOrthoRegistration, scanPositionShift, compareAtPositions, regularFramePositions, K3_THRESHOLDS,
} from '../scripts/validate-ortho-registration-legacy.mjs';
import { longSlopeShare, noDataFloatFromBits } from '../scripts/legacy-analysis.mjs';
import { createDemWindow } from '../public/js/route/route-service.js';
import { hillshadeFromTerrain } from '../scripts/validate-ortho-registration.mjs';

function surfaceFrom(peaks, base = 0) {
  const out = [];
  for (let dy = -3; dy <= 3; dy += 0.5) for (let dx = -3; dx <= 3; dx += 0.5) {
    const hit = peaks.find((p) => p.dx === dx && p.dy === dy);
    out.push({ dx, dy, r: hit ? hit.r : base, n: 30000 });
  }
  return out;
}

test('anizotropik Horn gradyanı düzlemde doğru eğimi verir (doğu +, kuzey +)', () => {
  const rows = 9, cols = 9, sx = 1.0457, sy = 1.0101, a = 0.3, b = -0.7;
  const Z = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) Z[r * cols + c] = a * (c * sx) + b * (-r * sy);
  const t = terrainAniso(Z, rows, cols, sx, sy);
  const i = 4 * cols + 4;
  assert.equal(t.valid[i], 1);
  assert.ok(Math.abs(t.dzdx[i] - a) < 1e-5, `dzdx ${t.dzdx[i]}`);
  assert.ok(Math.abs(t.dzdy[i] - b) < 1e-5, `dzdy ${t.dzdy[i]}`);
});

test('no-data komşusu olan hücre gradyana girmez (dolgu yok)', () => {
  const rows = 5, cols = 5;
  const Z = new Float32Array(rows * cols).fill(1);
  Z[1 * cols + 1] = NaN;
  const t = terrainAniso(Z, rows, cols, 1, 1);
  assert.equal(t.valid[2 * cols + 2], 0);
});

test('parlaklık gradyanı büyüklüğü: anizotropik aralıkla doğru', () => {
  const rows = 5, cols = 5, sx = 2, sy = 4;
  const R = new Float32Array(rows * cols), V = new Uint8Array(rows * cols).fill(1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) R[r * cols + c] = 6 * (c * sx) + 8 * (-r * sy);
  const g = brightnessGradientAniso(R, V, rows, cols, sx, sy);
  const i = 2 * cols + 2;
  assert.equal(g.valid[i], 1);
  assert.ok(Math.abs(g.G[i] - Math.hypot(6, 8)) < 1e-4, `G ${g.G[i]}`);
});

test('ortomozaik örnekleme: uvMapping ile piksel, alpha=0 ve kapsam dışı hücre geçersiz', () => {
  const W = 40, H = 40;
  const gray = new Uint8Array(W * H), alpha = new Uint8Array(W * H).fill(255);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) gray[r * W + c] = c; // gri = sütun indeksi
  alpha[25 * W + 10] = 0; // (ix=10, iy=25) alpha=0
  const mosaic = { W, H, gray, alpha, uv: { uScale: 1 / W, uOffset: 0, vScale: -1 / H, vOffset: 1 } };
  // yerel (x,y): px=x, py=H-y. Hücre merkezi x=10.5, y=H-25.5 -> py=25.5 (iy=25, alpha=0 bölgesi)
  const xs = Float64Array.from([10.5, 20.5, -5]), ys = Float64Array.from([H - 25.5, H - 15.5, 5]);
  const out = resampleOrthoAtPositions({ xs, ys, rows: 1, cols: 3, mosaic });
  assert.equal(out.valid[0], 0, 'alpha=0 komşuluk geçersiz kalmalı');
  assert.equal(out.valid[1], 1);
  assert.equal(out.values[1], 20, 'ortalama sütun indeksi (ix=20)');
  assert.equal(out.valid[2], 0, 'mozaik dışı hücre dolgulanmaz');
  assert.ok(Number.isNaN(out.values[2]));
});

test('ön-kayıtlı karar: tepe konumu, r, ikinci tepe farkı ve birleşik kural', () => {
  const good = surfaceFrom([{ dx: 0, dy: 0, r: 0.5 }, { dx: 3, dy: 3, r: 0.4 }]);
  const e1 = evaluateSurface(good);
  assert.equal(e1.pass, true, e1.reasons.join('; '));
  const off = surfaceFrom([{ dx: 2, dy: 0, r: 0.5 }]);
  assert.equal(evaluateSurface(off).pass, false);
  const weak = surfaceFrom([{ dx: 0, dy: 0, r: 0.25 }]);
  assert.equal(evaluateSurface(weak).pass, false);
  const narrow = surfaceFrom([{ dx: 0, dy: 0, r: 0.5 }, { dx: 0, dy: 2, r: 0.49 }]); // margin 0.01 < 0.02
  assert.equal(evaluateSurface(narrow).pass, false);

  const pass = e1, fail = evaluateSurface(weak);
  assert.equal(decideLegacyRegistration({ overlapCells: 30000, hpEval: pass, gradEval: pass, rawEval: fail }).verdict, 'ölçüldü');
  assert.equal(decideLegacyRegistration({ overlapCells: 30000, hpEval: pass, gradEval: fail, rawEval: pass }).verdict, 'kanıtlanamadı', 'gradyan geçmezse kanıtlanamadı');
  assert.equal(decideLegacyRegistration({ overlapCells: 30000, hpEval: fail, gradEval: pass, rawEval: pass }).verdict, 'kanıtlanamadı', 'high-pass geçmezse kanıtlanamadı');
  assert.equal(decideLegacyRegistration({ overlapCells: 100, hpEval: pass, gradEval: pass, rawEval: pass }).verdict, 'kanıtlanamadı', 'yetersiz ortak hücre');
  assert.equal(K3_THRESHOLDS.minCorrelation, 0.30);
  assert.equal(K3_THRESHOLDS.minPeakMargin, 0.02);
});

test('uçtan uca: bilinen (+2,-1) px kaydırma high-pass korelasyonunda geri bulunur', () => {
  const rows = 60, cols = 60, dx0 = 2, dy0 = -1;
  const Z = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    Z[r * cols + c] = 3 * Math.sin(c / 4.1) + 2 * Math.cos(r / 3.7) + 1.5 * Math.sin((c + 2 * r) / 2.3);
  }
  const terr = terrainAniso(Z, rows, cols, 1, 1);
  const H = hillshadeFromTerrain(terr, 315, 45);
  // Ortomozaik: H'nin kaydırılmış hali (A(r,c)=H(r-dy0,c-dx0)); kaynak dışı hücreler alpha=0.
  const W = cols, Hh = rows;
  const gray = new Uint8Array(W * Hh), alpha = new Uint8Array(W * Hh).fill(0);
  for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) {
    const sr = r - dy0, sc = c - dx0;
    if (sr < 0 || sc < 0 || sr >= rows || sc >= cols || !terr.valid[sr * cols + sc]) continue;
    gray[r * W + c] = Math.round(H[sr * cols + sc] * 255);
    alpha[r * W + c] = 255;
  }
  const mosaic = { W, H: Hh, gray, alpha, uv: { uScale: 1 / W, uOffset: 0, vScale: -1 / Hh, vOffset: 1 } };
  const xs = new Float64Array(rows * cols), ys = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { xs[r * cols + c] = c + 0.5; ys[r * cols + c] = Hh - (r + 0.5); }
  const reg = runOrthoRegistration({
    Z, rows, cols, xs, ys, sxM: 1, syM: 1, mosaic, range: 3, step: 0.5,
    thr: { ...K3_THRESHOLDS, minOverlapCells: 500 },
  });
  assert.equal(reg.highPass.best.top.dx, dx0, `dx=${reg.highPass.best.top.dx}`);
  assert.equal(reg.highPass.best.top.dy, dy0, `dy=${reg.highPass.best.top.dy}`);
  assert.ok(reg.highPass.best.top.r > 0.9, `r=${reg.highPass.best.top.r}`);
});

test('konum taraması: bilinen öteleme (3, -2) m doğrudan geri bulunur (yüzey düzlem değil)', () => {
  // Düz bir düzlemde kaydırma yalnız sabit ofset üretir ve std (ortalama kaldırılmış) bunu göremez; bu yüzden
  // kaydırmayla değişen sinüzoidal bir yüzey kullanılır. USGS sahte çerçevesi: satır = 200 - y, sütun = 200 + x.
  const usgsRows = 400, usgsCols = 400;
  const adapter = { localToPixel: (x, y) => ({ row: 200 - y, col: 200 + x }) };
  const f = (x, y) => 3 * Math.sin(x / 6) + 2 * Math.cos(y / 5) + 1.5 * Math.sin((x + y) / 4);
  const z = new Float32Array(usgsRows * usgsCols), valid = new Uint8Array(usgsRows * usgsCols).fill(1);
  for (let r = 0; r < usgsRows; r++) for (let c = 0; c < usgsCols; c++) z[r * usgsCols + c] = f(c - 200, 200 - r);
  const usgs = { z, valid, rows: usgsRows, cols: usgsCols, row0: 0, col0: 0, adapter };
  const n = 400;
  const xs = new Float64Array(n), ys = new Float64Array(n), zL = new Float32Array(n), validL = new Uint8Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    xs[i] = ((i * 37) % 97) - 48; ys[i] = ((i * 53) % 89) - 44;
    zL[i] = f(xs[i] + 3, ys[i] - 2); // legacy = USGS, (3,-2) m kaydırılmış
  }
  const scan = scanPositionShift({ zL, validL, xs, ys, usgs, rangeM: 5, stepM: 1, stride: 1 });
  assert.equal(scan.best.dxM, 3, `dx=${scan.best.dxM}`);
  assert.equal(scan.best.dyM, -2, `dy=${scan.best.dyM}`);
  assert.ok(scan.best.stdM < 0.05, `std ${scan.best.stdM}`);
  assert.equal(scan.edgeHit, false);
  const zero = compareAtPositions({ zL, validL, xs, ys, usgs });
  assert.ok(zero.stdM > 0.5, `sıfır ötelemede std ${zero.stdM} büyük olmalı`);
});

test('düzenli çerçeve merkezleri: nwXM + (c+0.5)h, nwYM - (r+0.5)h', () => {
  const p = regularFramePositions({ nwXM: -10, nwYM: 5, cellSizeM: 2, rows: 3, cols: 4 });
  assert.equal(p.xs[0], -10 + 0.5 * 2);
  assert.equal(p.ys[0], 5 - 0.5 * 2);
  assert.equal(p.xs[2 * 4 + 3], -10 + 3.5 * 2);
  assert.equal(p.ys[2 * 4 + 3], 5 - 2.5 * 2);
});

test('eğim payı: yolun yarısı eşiğin üstündeyse pay 0,5', () => {
  const win = createDemWindow({
    elevation: new Float32Array(100), rows: 10, cols: 10, cellSizeM: 1, nwXM: 0, nwYM: 10,
    noDataValue: -9999, validMin: -1e9, validMax: 1e9,
  });
  const slope = new Float64Array(100);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) slope[r * 10 + c] = c < 5 ? 2 : 8;
  const share = longSlopeShare(win, slope, [{ xM: 0.5, yM: 5.5 }, { xM: 9.5, yM: 5.5 }], 5);
  assert.equal(share.shareAbove, 0.5);
  assert.equal(share.unknownLengthM, 0);
  assert.equal(share.maxSampledSlopeDeg, 8);
});

test('no-data bit deseni (0xFF7FFFFB) sonlu float olarak okunur', () => {
  const v = noDataFloatFromBits(0xFF7FFFFB);
  assert.ok(Number.isFinite(v));
  assert.ok(v < -3.4e38);
});
