// Stage K3-8 — AKTİF legacy HiRISE DTM ile ortomozaik kayıt ölçümü (ölçüm aracı; karar önceden sabitlendi).
//
//   node scripts/validate-ortho-registration-legacy.mjs [--out <dir>] [--range 3] [--step 0.5]
//                                                       [--shiftRange 10] [--shiftStep 0.5] [--shiftStride 4]
//
// Veri: Sim/data/legacy-hirise/dtm_subset.{json,f32} (UYGULAMADA AKTİF DTM) ve Sim/data/ortho/ (z17 mozaik + manifest).
//   Karşılaştırma için USGS adayı: Sim/data/dtm_subset.{json,f32} (uygulamada kullanılmıyor; yalnız kıyas).
//
// Yöntem (ayrıntı: Sim/stage-k3-legacy-analysis.md):
//  * Legacy pencere, UYGULAMANIN kendi legacy sağlayıcısıyla yüklenir: surface/registry.js
//    createDefaultSurfaceRegistry().loadProvider('hirise-legacy-jezero-dtm'). Hücre konumu provider.adapter.pixelToLocal
//    ile alınır; bu köprü registry.js makeLegacyCoordinateBridge (satır 31-35) ile birebir aynıdır: legacy projeksiyon
//    lat/lon'a, sonra kanonik (WB1 orijinli) yerel metre düzlemine çevrilir. Köprü enlem-boylam korur ama
//    Doğu-Batı hücre aralığını DEĞİŞTİRİR (kanonik ~1,046 m, KG ~1,010 m); bu nedenle gradyanlar anizotropiktir.
//  * Ortomozaik (data/ortho/ortho-mosaic-z17-tiles.png), uygulamanın uvMapping'iyle (manifest) kanonik düzleme
//    örneklenir. Her DTM hücresi 4x4 alt örnekle ortalanır; tüm alt örnekler alpha=255 değilse hücre geçersiz kalır.
//  * Kaydırma: H_s(r,c) = H(r-dy, c-dx), dx/dy DTM HÜCRE birimi (native legacy piksel). ±3 px, 0,5 adım.
//  * Ölçütler: (a) ham hillshade (8 azimut x 45°), (b) high-pass (r=5) hillshade ↔ high-pass ortomozaik (8 azimut),
//    (c) ışıktan bağımsız gradyan: |grad orto| (parlaklık/m) ↔ |grad Z| (m/m).
//  * ÖN-KAYITLI KARAR (bu dosyanın sonucu görülmeden sabitlendi):
//      ölçüldü  ⇔ ortak hücre >= 20000  VE  (b) en iyi azimut tepesi geçer  VE  (c) gradyan tepesi geçer.
//      Geçiş:  |tepe konumu| <= 1,0 px  VE  r >= 0,30  VE  ikinci tepeyle fark >= 0,02.
//      (a) ham hillshade yalnız rapor edilir: albedo-karışık olduğu için tek başına kanıt sayılmaz.
//      Aksi halde: kanıtlanamadı. "Hizalı" bu betikte hiçbir koşulda yazılmaz.
//  * Hillshade ortomozaik DEĞİLDİR; bu betik ortoyu DTM gölgesiyle karıştırmaz.
//  * Eşikler sezgisel/senaryo değerleridir; literatürle doğrulanmamıştır.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { decodePng } from './build-ortho-mosaic.mjs';
import {
  AZIMUTHS_DEG, SUN_ALT_DEG, hillshadeFromTerrain, highPassField, scanShifts, peakSummary,
  farShiftBaseline, bilinear,
} from './validate-ortho-registration.mjs';
import { validateOrthoAlignmentManifest } from '../public/js/surface/ortho-layer.js';
import { createDefaultSurfaceRegistry } from '../public/js/surface/registry.js';
import { GridElevationLayer } from '../public/js/surface/layers.js';
import { adapterFromLabel } from '../public/js/geo/geo.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, '..', 'data');
export const LEGACY_DIR = path.join(DATA_DIR, 'legacy-hirise');
export const USGS_DIR = DATA_DIR;
export const ORTHO_DIR = path.join(DATA_DIR, 'ortho');
export const ORTHO_MANIFEST = 'ortho-alignment-z17-tiles.json';
export const LEGACY_PROVIDER_ID = 'hirise-legacy-jezero-dtm';

/** Önceden sabitlenmiş eşikler (bkz. dosya başı). Değiştirilmez; sonuçtan sonra ayarlanmaz. */
export const K3_THRESHOLDS = Object.freeze({
  minOverlapCells: 20000,
  minCorrelation: 0.30,
  minPeakMargin: 0.02,
  maxPeakOffsetPx: 1.0,
  peakExcludePx: 1.5, // ikinci tepe dışlama yarıçapı (validate-ortho-registration.mjs ile aynı)
  hpRadius: 5,
  nodataThreshold: -1e30,
});
export const OVERLAP_SUBSAMPLE_OFFSETS_M = Object.freeze([-0.375, -0.125, 0.125, 0.375]);
export const SHIFT_RANGE_DEFAULT_PX = 10;

const listIndices = (valid) => {
  let n = 0;
  for (let i = 0; i < valid.length; i++) if (valid[i]) n++;
  const out = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < valid.length; i++) if (valid[i]) out[k++] = i;
  return out;
};

// ------------------------------------------------------------------ dosya/sağlayıcı yükleme

/** UYGULAMA registry'sinin fetch sözleşmesini yerel dosyalara bağlar (yalnız 'data/...' yolları). */
export function makeFileFetch(dataDir) {
  return async (url) => {
    const rel = String(url).replace(/^data\//, '');
    const p = path.join(dataDir, rel);
    if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = fs.readFileSync(p);
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  };
}

/** Uygulamanın legacy sağlayıcısını (registry.js) gerçek kodla yükler. Kullanılabilir değilse fırlatır. */
export async function loadLegacyProvider({ dataDir = DATA_DIR } = {}) {
  const canonicalAdapter = adapterFromLabel(MAP_FRAME, WAYPOINTS[0]);
  const registry = createDefaultSurfaceRegistry({
    expectedFrame: MAP_FRAME, adapter: canonicalAdapter, baseUrl: 'data', fetchImpl: makeFileFetch(dataDir),
  });
  const { provider, validation } = await registry.loadProvider(LEGACY_PROVIDER_ID);
  if (!provider.available) throw new Error(`legacy sağlayıcı kullanılamıyor: ${validation.reasonCode} — ${validation.summary}`);
  return { provider, validation, canonicalAdapter };
}

/** Ham f32 penceresini okur (no-data bit deseni korunur) ve geçerli hücre maskesini çıkarır. */
export function loadRawDtm(dir) {
  if (os.endianness() !== 'LE') throw new Error('Big-endian ana makine: float32 LE okuma desteklenmiyor');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'dtm_subset.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, meta.dataFile));
  const { rows, cols, row0, col0 } = meta.window;
  if (buf.length !== rows * cols * 4) throw new Error(`${dir}: f32 boyutu ${buf.length} != ${rows * cols * 4}`);
  const raw = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const bits = new Uint32Array(raw.buffer, raw.byteOffset, raw.length);
  const noDataBits = parseInt(meta.label.missingConstantHex, 16) >>> 0;
  const vmin = meta.label.validMin, vmax = meta.label.validMax;
  const Z = new Float32Array(rows * cols);
  const valid = new Uint8Array(rows * cols);
  let nd = 0;
  for (let i = 0; i < Z.length; i++) {
    const v = raw[i];
    if (bits[i] === noDataBits) { nd++; Z[i] = NaN; continue; }
    if (!Number.isFinite(v) || v < vmin || v > vmax) { Z[i] = NaN; continue; }
    Z[i] = v; valid[i] = 1;
  }
  return {
    dir, meta, rows, cols, row0, col0, raw, Z, valid, noDataBits, noDataCells: nd, validCells: Z.length - nd,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

/** Ortomozaik: manifest doğrulaması + SHA-256 + PNG çözme (gray+alpha). Uygulamanın uvMapping'i kullanılacak. */
export function loadOrthoMosaic(orthoDir = ORTHO_DIR) {
  const manifest = JSON.parse(fs.readFileSync(path.join(orthoDir, ORTHO_MANIFEST), 'utf8'));
  const v = validateOrthoAlignmentManifest(manifest);
  if (!v.valid) throw new Error(`ortho manifesti geçersiz: ${v.errors.join('; ')}`);
  const png = fs.readFileSync(path.join(orthoDir, manifest.mosaic.file));
  const sha = crypto.createHash('sha256').update(png).digest('hex');
  if (sha !== manifest.mosaic.sha256) throw new Error('ortomozaik SHA-256 manifest ile uyuşmuyor');
  const img = decodePng(png);
  if (img.width !== manifest.mosaic.widthPx || img.height !== manifest.mosaic.heightPx || img.channels !== 2) {
    throw new Error(`ortomozaik biçimi beklenenden farklı: ${img.width}x${img.height} kanal=${img.channels}`);
  }
  const W = img.width, H = img.height, n = W * H;
  const gray = new Uint8Array(n), alpha = new Uint8Array(n);
  for (let k = 0; k < n; k++) { gray[k] = img.data[2 * k]; alpha[k] = img.data[2 * k + 1]; }
  return { manifest, W, H, gray, alpha, uv: manifest.uvMapping, sha256: sha, bounds: manifest.window.localBoundsM };
}

// ------------------------------------------------------------------ konum ve türevler

/** Kanonik yerel metre konumu (hücre merkezi). adapter.pixelToLocal: legacy için köprü, USGS için doğrudan. */
export function cellCanonicalPositions(adapter, row0, col0, rows, cols) {
  const n = rows * cols;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = adapter.pixelToLocal(row0 + r, col0 + c);
      xs[r * cols + c] = p.x; ys[r * cols + c] = p.y;
    }
  }
  return { xs, ys };
}

/** Kanonik düzlemde komşu hücre aralıkları (m). Doğu aralığı sxM, kuzey aralığı syM; iki noktada tutarlılık kontrolü. */
export function anisoSpacing(adapter, row0, col0, rows, cols) {
  const at = (r, c) => adapter.pixelToLocal(row0 + r, col0 + c);
  const a = at(0, 0), b = at(0, 1), c2 = at(1, 0);
  const far = { a: at(rows - 2, cols - 2), b: at(rows - 2, cols - 1), c: at(rows - 1, cols - 2) };
  const sxM = b.x - a.x, syM = a.y - c2.y;
  const sxFar = far.b.x - far.a.x, syFar = far.a.y - far.c.y;
  return { sxM, syM, sxFarM: sxFar, syFarM: syFar, uniformWithinMm: Math.max(Math.abs(sxFar - sxM), Math.abs(syFar - syM)) * 1000 };
}

/** Horn (1981) gradyanı, anizotropik hücre aralığıyla (dzdx doğu(+), dzdy kuzey(+)). Eksik komşu → geçersiz. */
export function terrainAniso(Z, rows, cols, sxM, syM) {
  const n = rows * cols;
  const dzdx = new Float32Array(n), dzdy = new Float32Array(n), mag = new Float32Array(n);
  const valid = new Uint8Array(n);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      const a = Z[i - cols - 1], b = Z[i - cols], cc = Z[i - cols + 1];
      const d = Z[i - 1], e = Z[i], f = Z[i + 1];
      const g = Z[i + cols - 1], h = Z[i + cols], ii = Z[i + cols + 1];
      if (![a, b, cc, d, e, f, g, h, ii].every(Number.isFinite)) continue;
      const gx = ((cc + 2 * f + ii) - (a + 2 * d + g)) / (8 * sxM);
      const gy = ((a + 2 * b + cc) - (g + 2 * h + ii)) / (8 * syM);
      dzdx[i] = gx; dzdy[i] = gy; mag[i] = Math.hypot(gx, gy); valid[i] = 1;
    }
  }
  return { dzdx, dzdy, mag, valid };
}

/** Parlaklık gradyanı büyüklüğü, birim: parlaklık/m (merkezi fark, anizotropik aralık). */
export function brightnessGradientAniso(R, Rvalid, rows, cols, sxM, syM) {
  const n = rows * cols;
  const G = new Float32Array(n), valid = new Uint8Array(n);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (!Rvalid[i - 1] || !Rvalid[i + 1] || !Rvalid[i - cols] || !Rvalid[i + cols]) continue;
      const gx = (R[i + 1] - R[i - 1]) / (2 * sxM);
      const gy = (R[i - cols] - R[i + cols]) / (2 * syM);
      G[i] = Math.hypot(gx, gy); valid[i] = 1;
    }
  }
  return { G, valid };
}

// ------------------------------------------------------------------ ortomozaik örnekleme

/**
 * Her DTM hücresi için kanonik konumdaki ortomozaik grisi. uvMapping uygulamanın ortho-layer.js sözleşmesiyle
 * aynıdır: px = (x*uScale+uOffset)*W, py = (y*vScale+vOffset)*H (vOrigin top-row). 4x4 alt örnek ortalaması;
 * tüm alt örnekler mozaik içinde ve alpha=255 değilse hücre geçersiz (dolgu/sıfırlama yok).
 */
export function resampleOrthoAtPositions({ xs, ys, rows, cols, mosaic, offsetsM = OVERLAP_SUBSAMPLE_OFFSETS_M }) {
  const n = rows * cols;
  const out = new Float32Array(n).fill(NaN);
  const valid = new Uint8Array(n);
  const { uScale, uOffset, vScale, vOffset } = mosaic.uv;
  const { W, H, gray, alpha } = mosaic;
  const need = offsetsM.length * offsetsM.length;
  for (let i = 0; i < n; i++) {
    const x0 = xs[i], y0 = ys[i];
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
    let sum = 0, cnt = 0, ok = true;
    for (const dy of offsetsM) {
      for (const dx of offsetsM) {
        const px = ((x0 + dx) * uScale + uOffset) * W;
        const py = ((y0 + dy) * vScale + vOffset) * H;
        const ix = Math.floor(px), iy = Math.floor(py);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) { ok = false; break; }
        const k = iy * W + ix;
        if (alpha[k] !== 255) { ok = false; break; }
        sum += gray[k]; cnt++;
      }
      if (!ok) break;
    }
    if (ok && cnt === need) { out[i] = sum / cnt; valid[i] = 1; }
  }
  let count = 0;
  for (let i = 0; i < n; i++) count += valid[i];
  return { values: out, valid, count };
}

// ------------------------------------------------------------------ karar

/** Tek yüzey değerlendirmesi (ön-kayıtlı kurallar). Tepe, ikinci tepeye göre margin ile ölçülür. */
export function evaluateSurface(surface, thr = K3_THRESHOLDS) {
  const pk = peakSummary(surface, thr.peakExcludePx);
  if (!pk.top) return { pass: false, top: null, second: null, margin: null, offsetPx: null, reasons: ['geçerli tepe yok'] };
  const offsetPx = Math.hypot(pk.top.dx, pk.top.dy);
  const reasons = [];
  if (!(offsetPx <= thr.maxPeakOffsetPx)) reasons.push(`tepe konumu ${offsetPx.toFixed(2)} px > ${thr.maxPeakOffsetPx} px`);
  if (!(pk.top.r >= thr.minCorrelation)) reasons.push(`tepe r=${pk.top.r.toFixed(4)} < ${thr.minCorrelation}`);
  if (!(pk.margin !== null && pk.margin >= thr.minPeakMargin)) reasons.push(`ikinci tepe farkı=${pk.margin === null ? 'yok' : pk.margin.toFixed(4)} < ${thr.minPeakMargin}`);
  return { pass: reasons.length === 0, top: pk.top, second: pk.second, margin: pk.margin, offsetPx, reasons };
}

/**
 * Ön-kayıtlı karar: "ölçüldü" yalnız (b) high-pass ve (c) gradyan yüzeyleri geçerse ve ortak hücre yeterliyse.
 * (a) ham hillshade raporlanır ama karara girmez. Aksi halde "kanıtlanamadı". "Hizalı" yazılmaz.
 */
export function decideLegacyRegistration({ overlapCells, hpEval, gradEval, rawEval, thr = K3_THRESHOLDS }) {
  const reasons = [];
  if (!(overlapCells >= thr.minOverlapCells)) reasons.push(`ortak geçerli hücre ${overlapCells} < ${thr.minOverlapCells}`);
  if (!hpEval.pass) reasons.push(`high-pass (b): ${hpEval.reasons.join(', ')}`);
  if (!gradEval.pass) reasons.push(`gradyan (c): ${gradEval.reasons.join(', ')}`);
  const verdict = reasons.length === 0 ? 'ölçüldü' : 'kanıtlanamadı';
  return {
    verdict, reasons,
    rawHillshadeNote: rawEval.pass ? 'ham hillshade de geçti (albedo karışık; karara girmez)' : `ham hillshade geçmedi: ${rawEval.reasons.join(', ')}`,
  };
}

// ------------------------------------------------------------------ tam ortomozaik taraması

/**
 * Ortomozaik ↔ legacy DTM kaydırma taraması. Girdi: Z (NaN geçersiz), konumlar, anizotropik aralık, mozaik.
 * Döner: a/b/c yüzeyleri ve karar. Dizi çıktıları JSON'a uygun değildir; `toJsonSummary` kullanın.
 */
export function runOrthoRegistration({ Z, rows, cols, xs, ys, sxM, syM, mosaic, range = 3, step = 0.5, thr = K3_THRESHOLDS }) {
  if (!(step > 0) || Math.abs(range / step - Math.round(range / step)) > 1e-9) throw new Error('range, step tam kat olmalı');
  const terr = terrainAniso(Z, rows, cols, sxM, syM);
  const ortho = resampleOrthoAtPositions({ xs, ys, rows, cols, mosaic });
  const idxOrtho = listIndices(ortho.valid);
  let overlapCells = 0;
  for (const i of idxOrtho) if (terr.valid[i]) overlapCells++;
  const common = { rows, cols, range, step, minN: thr.minOverlapCells };

  // (a) ham hillshade
  const rawRuns = AZIMUTHS_DEG.map((az) => {
    const H = hillshadeFromTerrain(terr, az, SUN_ALT_DEG);
    const surface = scanShifts({ ...common, A: ortho.values, indexList: idxOrtho, B: H, Bvalid: terr.valid });
    return { azimuthDeg: az, surface, eval: evaluateSurface(surface, thr) };
  });
  const bestRaw = pickBest(rawRuns);

  // (b) high-pass (r=5): ortomozaik ve hillshade aynı filtreyle
  const hpOrtho = highPassField(ortho.values, ortho.valid, rows, cols, thr.hpRadius);
  const idxHp = [];
  for (let i = 0; i < hpOrtho.valid.length; i++) if (hpOrtho.valid[i] && terr.valid[i]) idxHp.push(i);
  const hpRuns = AZIMUTHS_DEG.map((az) => {
    const H = hillshadeFromTerrain(terr, az, SUN_ALT_DEG);
    const hpH = highPassField(H, terr.valid, rows, cols, thr.hpRadius);
    const surface = scanShifts({ ...common, A: hpOrtho.highPass, indexList: idxHp, B: hpH.highPass, Bvalid: hpH.valid });
    return { azimuthDeg: az, surface, eval: evaluateSurface(surface, thr) };
  });
  const bestHp = pickBest(hpRuns);

  // (c) gradyan büyüklüğü (ışıktan bağımsız)
  const Rg = brightnessGradientAniso(ortho.values, ortho.valid, rows, cols, sxM, syM);
  const idxG = [];
  for (let i = 0; i < Rg.valid.length; i++) if (Rg.valid[i] && terr.valid[i]) idxG.push(i);
  const gradSurface = scanShifts({ ...common, A: Rg.G, indexList: idxG, B: terr.mag, Bvalid: terr.valid });
  const gradEval = evaluateSurface(gradSurface, thr);

  const baselineHp = farShiftBaseline({ ...common, A: hpOrtho.highPass, indexList: idxHp, B: hillshadeFromTerrain(terr, bestHp.azimuthDeg, SUN_ALT_DEG), Bvalid: terr.valid }, 6, 10);
  const baselineGrad = farShiftBaseline({ ...common, A: Rg.G, indexList: idxG, B: terr.mag, Bvalid: terr.valid }, 6, 10);

  const decision = decideLegacyRegistration({ overlapCells, hpEval: bestHp.eval, gradEval, rawEval: bestRaw.eval, thr });
  return {
    overlapCells,
    orthoValidCells: ortho.count,
    raw: { best: summarizeRun(bestRaw), perAzimuth: rawRuns.map(summarizeRun) },
    highPass: { best: summarizeRun(bestHp), perAzimuth: hpRuns.map(summarizeRun), farShiftBaseline: baselineHp, surface: bestHp.surface },
    gradient: { eval: gradEval, top: gradEval.top, second: gradEval.second, margin: gradEval.margin, offsetPx: gradEval.offsetPx, farShiftBaseline: baselineGrad, surface: gradSurface },
    decision,
    shiftFromHighPassPx: bestHp.eval.top ? { dx: bestHp.eval.top.dx, dy: bestHp.eval.top.dy, uncertaintyPx: step } : null,
  };
}

function pickBest(runs) {
  let best = null;
  for (const r of runs) if (r.eval.top && (!best || r.eval.top.r > best.eval.top.r)) best = r;
  return best ?? runs[0];
}
function summarizeRun(run) {
  return { azimuthDeg: run.azimuthDeg, top: run.eval.top, second: run.eval.second, margin: run.eval.margin, offsetPx: run.eval.offsetPx, pass: run.eval.pass, reasons: run.eval.reasons };
}

// ------------------------------------------------------------------ legacy ↔ USGS konum karşılaştırması

/**
 * Legacy hücrelerini (xs, ys konumlarında, geçerli maske) USGS'te örnekler ve kot farkı istatistiği üretir.
 * shiftXM/shiftYM: USGS örnekleme konumuna eklenen kaydırma (m); USGS 1 m kanonik düzlemde olduğu için m = px.
 */
export function compareAtPositions({ zL, validL, xs, ys, usgs, shiftXM = 0, shiftYM = 0, stride = 1, idx = null }) {
  const list = idx ?? (() => {
    const out = [];
    for (let i = 0; i < validL.length; i += 1) if (validL[i]) out.push(i);
    return Int32Array.from(out);
  })();
  let n = 0, sum = 0, sumsq = 0, maxAbs = 0;
  for (let k = 0; k < list.length; k += stride) {
    const i = list[k];
    const p = usgs.adapter.localToPixel(xs[i] + shiftXM, ys[i] + shiftYM);
    const zu = bilinear(usgs.z, usgs.valid, usgs.rows, usgs.cols, p.row - usgs.row0, p.col - usgs.col0);
    if (Number.isNaN(zu)) continue;
    const d = zL[i] - zu;
    n++; sum += d; sumsq += d * d; if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
  }
  if (n === 0) return { n: 0, meanM: null, stdM: null, maxAbsM: null };
  const mean = sum / n;
  const variance = Math.max(0, sumsq / n - mean * mean);
  return { n, meanM: mean, stdM: Math.sqrt(variance), maxAbsM: maxAbs };
}

/**
 * Yatay öteleme taraması: legacy konumlarına (shiftXM, shiftYM) eklenerek USGS'te örnekle; kot farkının
 * standart sapmasını (ortalama kaldırılmış) minimize eden öteleme. Sonuç bir kanıt değil, ölçümdür.
 */
export function scanPositionShift({ zL, validL, xs, ys, usgs, rangeM = SHIFT_RANGE_DEFAULT_PX, stepM = 0.5, stride = 4 }) {
  if (!(stepM > 0) || Math.abs(rangeM / stepM - Math.round(rangeM / stepM)) > 1e-9) throw new Error('rangeM, stepM tam kat olmalı');
  // Ortak örnek kümesi: her kaydırma için USGS penceresi içinde kalan hücreler (kümenin kaydırmayla değişmemesi için
  // kenarlara (rangeM + 1 px) pay bırakılır). Aksi halde std, kaydırmayla değişen örnek kümesinin etkisini taşır.
  const margin = rangeM + 1;
  const idx = [];
  for (let i = 0; i < validL.length; i++) {
    if (!validL[i]) continue;
    const p = usgs.adapter.localToPixel(xs[i], ys[i]);
    const rr = p.row - usgs.row0, cc = p.col - usgs.col0;
    if (rr < margin || cc < margin || rr > usgs.rows - 1 - margin || cc > usgs.cols - 1 - margin) continue;
    idx.push(i);
  }
  const sub = Int32Array.from(idx.filter((_, k) => k % stride === 0));
  const steps = Math.round(rangeM / stepM);
  const grid = [];
  for (let j = -steps; j <= steps; j++) {
    for (let i = -steps; i <= steps; i++) {
      const dxM = i * stepM, dyM = j * stepM;
      const s = compareAtPositions({ zL, validL, xs, ys, usgs, shiftXM: dxM, shiftYM: dyM, idx: sub });
      grid.push({ dxM, dyM, n: s.n, meanM: s.meanM, stdM: s.stdM });
    }
  }
  let best = null, zero = null;
  for (const g of grid) {
    if (g.stdM === null) continue;
    if (!best || g.stdM < best.stdM) best = g;
    if (g.dxM === 0 && g.dyM === 0) zero = g;
  }
  const edgeHit = best ? (Math.abs(best.dxM) === rangeM || Math.abs(best.dyM) === rangeM) : false;
  return { rangeM, stepM, stride, best, zero, edgeHit, grid };
}

/** Düzenli (uygulamanın minimap/planlayıcı) çerçevesindeki hücre merkezleri: nwXM + (c+0.5)h, nwYM - (r+0.5)h. */
export function regularFramePositions({ nwXM, nwYM, cellSizeM, rows, cols }) {
  const n = rows * cols;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    xs[r * cols + c] = nwXM + (c + 0.5) * cellSizeM;
    ys[r * cols + c] = nwYM - (r + 0.5) * cellSizeM;
  }
  return { xs, ys };
}

// ------------------------------------------------------------------ CLI

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function argNum(argv, name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = Number(argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`${name} sayı olmalı`);
  return v;
}
function argStr(argv, name) {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const range = argNum(argv, '--range', 3);
  const step = argNum(argv, '--step', 0.5);
  const shiftRange = argNum(argv, '--shiftRange', SHIFT_RANGE_DEFAULT_PX);
  const shiftStep = argNum(argv, '--shiftStep', 0.5);
  const shiftStride = argNum(argv, '--shiftStride', 4);
  const outDir = argStr(argv, '--out');

  const { provider, validation, canonicalAdapter } = await loadLegacyProvider();
  const legacy = loadRawDtm(LEGACY_DIR);
  const usgsRaw = loadRawDtm(USGS_DIR);
  const mosaic = loadOrthoMosaic();

  // Doğrulama: uygulama sağlayıcısının köprüsü, registry.js satır 22-36 formülünün bağımsız kurulumuyla aynı mı?
  const legacyAdapter = adapterFromLabel(legacy.meta.label, WAYPOINTS[0]);
  const indepBridge = (row, col) => {
    const ll = legacyAdapter.pixelToLocal(row, col);
    const g = legacyAdapter.localToLatLon(ll.x, ll.y);
    return canonicalAdapter.latLonToLocal(g.latDeg, g.lonDeg);
  };
  const probe = [[0, 0], [700, 500], [legacy.rows - 1, legacy.cols - 1]];
  const bridgeCheck = probe.map(([r, c]) => {
    const a = provider.adapter.pixelToLocal(legacy.row0 + r, legacy.col0 + c);
    const b = indepBridge(legacy.row0 + r, legacy.col0 + c);
    return Math.hypot(a.x - b.x, a.y - b.y);
  });

  const spacing = anisoSpacing(provider.adapter, legacy.row0, legacy.col0, legacy.rows, legacy.cols);
  const { xs, ys } = cellCanonicalPositions(provider.adapter, legacy.row0, legacy.col0, legacy.rows, legacy.cols);
  const t0 = Date.now();
  const reg = runOrthoRegistration({
    Z: legacy.Z, rows: legacy.rows, cols: legacy.cols, xs, ys, sxM: spacing.sxM, syM: spacing.syM, mosaic, range, step,
  });
  const ortMs = Date.now() - t0;

  // Kontrol: AYNI boru hattı bilinen USGS adayına (kanonik çerçeve, 1 m) uygulanır. Hat bir tepe bulabiliyor mu?
  const usgsPos = cellCanonicalPositions(canonicalAdapter, usgsRaw.row0, usgsRaw.col0, usgsRaw.rows, usgsRaw.cols);
  const usgsSpacing = anisoSpacing(canonicalAdapter, usgsRaw.row0, usgsRaw.col0, usgsRaw.rows, usgsRaw.cols);
  const ctrl = runOrthoRegistration({
    Z: usgsRaw.Z, rows: usgsRaw.rows, cols: usgsRaw.cols, xs: usgsPos.xs, ys: usgsPos.ys,
    sxM: usgsSpacing.sxM, syM: usgsSpacing.syM, mosaic, range, step,
  });

  // (d) legacy ↔ USGS aday kot farkı
  const usgsAdapter = canonicalAdapter;
  const usgs = { z: usgsRaw.Z, valid: usgsRaw.valid, rows: usgsRaw.rows, cols: usgsRaw.cols, row0: usgsRaw.row0, col0: usgsRaw.col0, adapter: usgsAdapter };
  const zeroBridge = compareAtPositions({ zL: legacy.Z, validL: legacy.valid, xs, ys, usgs });
  const nwXM = provider.adapter.pixelToLocal(legacy.row0 - 0.5, legacy.col0 - 0.5).x;
  const nwYM = provider.adapter.pixelToLocal(legacy.row0 - 0.5, legacy.col0 - 0.5).y;
  const regPos = regularFramePositions({ nwXM, nwYM, cellSizeM: provider.cellSizeM, rows: legacy.rows, cols: legacy.cols });
  const zeroRegular = compareAtPositions({ zL: legacy.Z, validL: legacy.valid, xs: regPos.xs, ys: regPos.ys, usgs });
  const shiftScan = scanPositionShift({ zL: legacy.Z, validL: legacy.valid, xs, ys, usgs, rangeM: shiftRange, stepM: shiftStep, stride: shiftStride });

  const fmt = (v, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? 'yok' : v.toFixed(d));
  const pk = (t) => (t ? `(${t.dx}, ${t.dy}) px  r=${fmt(t.r, 4)}` : 'tepe yok');
  console.log('=== K3-8: AKTİF legacy DTM ↔ ortomozaik kayıt ölçümü ===');
  console.log(`Sağlayıcı: ${provider.descriptor.product} · doğrulama ${validation.status} (uygulama bunu kabul etti)`);
  console.log(`Legacy pencere: ${legacy.rows}x${legacy.cols} hücre, geçerli ${legacy.validCells}, no-data ${legacy.noDataCells}; f32 SHA-256 ${legacy.sha256.slice(0, 16)}… (beklenen değer yok: doğrulanamadı)`);
  console.log(`Köprü tutarlılığı (sağlayıcı vs betik, m): ${bridgeCheck.map((v) => v.toExponential(1)).join(' ')}`);
  console.log(`Kanonik hücre aralığı: Doğu ${fmt(spacing.sxM, 5)} m, Kuzey ${fmt(spacing.syM, 5)} m (uzak köşede fark ${spacing.uniformWithinMm.toExponential(1)} mm)`);
  console.log(`Ortomozaik: z17 ${mosaic.W}x${mosaic.H}, SHA-256 doğrulandı; yeniden örneklenen geçerli hücre ${reg.orthoValidCells}; ortak hücre ${reg.overlapCells}`);
  console.log(`Kaydırma: ±${range} px, adım ${step} px; süre ${ortMs} ms`);
  console.log(`(a) ham hillshade en iyi az=${reg.raw.best.azimuthDeg}°: ${pk(reg.raw.best.top)}, ikinci tepe farkı=${fmt(reg.raw.best.margin, 4)} (karara girmez)`);
  console.log(`(b) high-pass r=${K3_THRESHOLDS.hpRadius} en iyi az=${reg.highPass.best.azimuthDeg}°: ${pk(reg.highPass.best.top)}, ikinci tepe farkı=${fmt(reg.highPass.best.margin, 4)}, uzak-kayma maks=${fmt(reg.highPass.farShiftBaseline.max, 4)} medyan=${fmt(reg.highPass.farShiftBaseline.median, 4)}`);
  console.log(`(c) gradyan: ${pk(reg.gradient.top)}, ikinci tepe farkı=${fmt(reg.gradient.margin, 4)}, uzak-kayma maks=${fmt(reg.gradient.farShiftBaseline.max, 4)} medyan=${fmt(reg.gradient.farShiftBaseline.median, 4)}`);
  console.log(`KARAR: ${reg.decision.verdict}`);
  for (const r of reg.decision.reasons) console.log(`  - ${r}`);
  console.log(`  - ${reg.decision.rawHillshadeNote}`);
  console.log(`KONTROL (aynı boru hattı, USGS adayı; ortak hücre ${ctrl.overlapCells}): (b) en iyi az=${ctrl.highPass.best.azimuthDeg}°: ${pk(ctrl.highPass.best.top)}, fark=${fmt(ctrl.highPass.best.margin, 4)}, uzak-kayma maks=${fmt(ctrl.highPass.farShiftBaseline.max, 4)} | (c) ${pk(ctrl.gradient.top)}, fark=${fmt(ctrl.gradient.margin, 4)} | KARAR: ${ctrl.decision.verdict}`);
  console.log(`(d) Legacy − USGS (ortak konum, bridge çerçevesi): n=${zeroBridge.n}, ortalama=${fmt(zeroBridge.meanM)} m, std=${fmt(zeroBridge.stdM)} m, maks|fark|=${fmt(zeroBridge.maxAbsM)} m`);
  console.log(`    düzenli (minimap/planlayıcı) çerçeve: n=${zeroRegular.n}, ortalama=${fmt(zeroRegular.meanM)} m, std=${fmt(zeroRegular.stdM)} m, maks|fark|=${fmt(zeroRegular.maxAbsM)} m`);
  console.log(`    yatay öteleme taraması (±${shiftRange} m, ${shiftStep} m adım, stride ${shiftStride}): en küçük std ${fmt(shiftScan.best.stdM)} m at (${shiftScan.best.dxM}, ${shiftScan.best.dyM}) m; sıfırda std ${fmt(shiftScan.zero.stdM)} m; kenar=${shiftScan.edgeHit}`);

  const result = {
    schema: 'marswalk.k3-8-ortho-registration-legacy.v1',
    status: 'ölçüm; karar önceden sabit eşiklerle; hillshade ortomozaik değildir',
    thresholds: K3_THRESHOLDS,
    shiftGrid: { rangePx: range, stepPx: step, convention: 'H_s(r,c)=H(r-dy,c-dx); dx,dy legacy hücre (native piksel)' },
    provider: { id: LEGACY_PROVIDER_ID, product: provider.descriptor.product, validationStatus: validation.status, reasonCode: validation.reasonCode },
    legacy: { rows: legacy.rows, cols: legacy.cols, row0: legacy.row0, col0: legacy.col0, validCells: legacy.validCells, noDataCells: legacy.noDataCells, sha256: legacy.sha256, spacingM: spacing },
    mosaic: { file: mosaic.manifest.mosaic.file, W: mosaic.W, H: mosaic.H, sha256: mosaic.sha256, uv: mosaic.uv },
    overlapCells: reg.overlapCells,
    orthoValidCells: reg.orthoValidCells,
    control: {
      description: 'AYNI boru hattı USGS adayına (kanonik çerçeve, 1 m) uygulanır; yöntemin bilinen bir DTM ile tepe bulup bulmadığını gösterir',
      overlapCells: ctrl.overlapCells,
      highPassBest: { azimuthDeg: ctrl.highPass.best.azimuthDeg, top: ctrl.highPass.best.top, margin: ctrl.highPass.best.margin, farShiftBaseline: ctrl.highPass.farShiftBaseline },
      gradient: { top: ctrl.gradient.top, margin: ctrl.gradient.margin, farShiftBaseline: ctrl.gradient.farShiftBaseline },
      decision: ctrl.decision,
    },
    raw: reg.raw,
    highPass: { best: reg.highPass.best, perAzimuth: reg.highPass.perAzimuth, farShiftBaseline: reg.highPass.farShiftBaseline },
    gradient: { top: reg.gradient.top, second: reg.gradient.second, margin: reg.gradient.margin, offsetPx: reg.gradient.offsetPx, farShiftBaseline: reg.gradient.farShiftBaseline, pass: reg.gradient.eval.pass, reasons: reg.gradient.eval.reasons },
    decision: reg.decision,
    shiftFromHighPassPx: reg.shiftFromHighPassPx,
    legacyVsUsgs: { bridgeZeroShift: zeroBridge, regularFrameZeroShift: zeroRegular, shiftScan: { rangeM: shiftRange, stepM: shiftStep, stride: shiftStride, best: shiftScan.best, zero: shiftScan.zero, edgeHit: shiftScan.edgeHit, grid: shiftScan.grid } },
    regularFrame: { nwXM, nwYM, cellSizeM: provider.cellSizeM },
    caveats: [
      'Eşikler sezgiseldir; önceden sabitlendi, literatürle doğrulanmadı.',
      'Hillshade azimut/yükseklik varsayımlıdır; en iyi azimut seçimi çoklu karşılaştırma yapar (8 azimut).',
      'Ortomozaik yalnız z17 karolarının kapsadığı kısımdır (~488 x 733 m); legacy pencerenin tamamını kapsamaz.',
      'USGS karşılaştırması uygulama dışı bir adaydır; legacy↔USGS yakınlığı ortomozaik hizasının KANITI değildir (yalnız dolaylı ipucu).',
      'Z17 mozaiğin kaynak raster yarım-piksel kaydı kanıtlanmadı (manifest: halfPixelRegistrationOfSourceRasterVerified=false).',
    ],
  };
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, 'k3-8-ortho-registration-legacy.json');
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log(`Yazıldı: ${file}`);
  }
  return result;
}

if (isMain) {
  main().catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  });
}
