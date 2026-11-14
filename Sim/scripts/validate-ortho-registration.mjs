// Stage 21B-Ön: sayısal ortomozaik <-> DTM hizalama ölçümü (ölçüm aracı; karar yalnız kanıta dayanır).
//
//   node scripts/validate-ortho-registration.mjs [--out <dir>] [--range 3] [--step 0.5] [--wide 20] [--wide-stride 3]
//
// Yöntem (ayrıntılar: Sim/stage21b-registration-audit.md):
//  * DTM penceresi (data/dtm_subset.f32, 1 m, PixelIsArea) hücre merkezleri, DTM etiketindeki projeksiyon
//    ofsetleriyle projeksiyon metrelerine ve oradan lon/lat'a çevrilir (R=3396190 m, latTs0=0, lon0=0).
//  * HiRISE 25 cm WMTS karoları (z17, 0.318 m/px) bu lon/lat'ta örneklenir. Her DTM hücresi 4x4 alt örnek
//    ortalamasıdır; tüm alt örnekler alpha=255 değilse hücre geçersiz kalır (dolgu / sıfırlama yok).
//  * Karşılaştırılan iki ölçü: (a) DTM hillshade, 8 güneş azimutu x 45° yükseklik (güneş bilinmiyor) ve
//    (b) ışıktan bağımsız gradyan büyüklükleri: |grad orto| <-> |grad Z|.
//  * Hillshade/eğim, DTM ızgarasında (dx,dy) piksel kaydırılır (yarım piksel adım, ±3 piksel) ve Pearson
//    normalize çapraz korelasyon hesaplanır. Örnek: H_s(r,c) = H(r-dy, c-dx).
//  * Karar eşikleri ÖNCEDEN sabitlenmiş sezgisel değerlerdir (THRESHOLDS); literatürden doğrulanmamıştır.
//    Hiçbir eşik sağlanmazsa veya tepe belirsizse sonuç "kanıtlanamadı" olur; "hizalı" yalnız tüm ölçütler
//    birlikte sağlandığında yazılır.
//
// Hillshade ortomozaik değildir; bu betik ortoyu DTM'den türetilmiş gölgeyle karıştırmaz.
// Pure fonksiyonlar dışa aktarılır; CLI yalnız doğrudan çalıştırıldığında devreye girer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCapabilities, deriveMatrixGeometry, decodePng } from './build-ortho-mosaic.mjs';
import { EquirectangularProjection, horn3x3Gradient } from '../public/js/geo/geo.js';

const DEG = Math.PI / 180;
export const RADIUS_M = 3396190;
export const TILE_PX = 256;
export const ZOOM = 17;
export const AZIMUTHS_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
export const SUN_ALT_DEG = 45;
export const NODATA_THRESHOLD = -1e30; // DTM no-data bit pattern 0xFF7FFFFB (~ -3.4e38); no-data is converted to NaN on load
export const THRESHOLDS = Object.freeze({
  minOverlapCells: 20000,       // en az bu kadar ortak geçerli hücre
  minCorrelation: 0.30,         // tepe r eşiği (sezgisel)
  minPeakMargin: 0.05,          // tepe ile ikinci tepe arası fark (sezgisel)
  centreTolPx: 0.5,             // "sıfır ötelenme" toleransı (bir yarım piksel adım)
  secondPeakExclusionPx: 1.5,   // ikinci tepe için tepe çevresinde dışlanan yarıçap
});

// ------------------------------------------------------------------ DTM window

/** Reads data/dtm_subset.json + .f32; verifies size, counts valid cells and converts no-data to NaN. */
export function readDtmWindow(dataDir, fsApi = fs) {
  const meta = JSON.parse(fsApi.readFileSync(path.join(dataDir, 'dtm_subset.json'), 'utf8'));
  const { rows, cols, row0, col0 } = { rows: meta.window.rows, cols: meta.window.cols, row0: meta.window.row0, col0: meta.window.col0 };
  const buf = fsApi.readFileSync(path.join(dataDir, meta.dataFile));
  if (buf.length !== rows * cols * 4) throw new Error(`DTM byte size ${buf.length} != ${rows}x${cols}x4`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const Z = new Float32Array(rows * cols);
  let valid = 0;
  for (let i = 0; i < Z.length; i++) {
    const v = dv.getFloat32(i * 4, true); // float32 little-endian
    if (Number.isFinite(v) && v > NODATA_THRESHOLD) { Z[i] = v; valid++; } else Z[i] = NaN;
  }
  return {
    meta, rows, cols, row0, col0, Z, validCount: valid,
    L0: meta.label.lineProjectionOffset, S0: meta.label.sampleProjectionOffset,
    cellSizeM: meta.label.mapScaleM,
  };
}

/** Projected centre (metres, east/north) of full-product cell (row, col); PixelIsArea: integer index = centre. */
export function cellCentreProjectedM({ L0, S0 }, row, col) {
  return { X: col - S0, Y: L0 - row };
}

/** Pure check: lon/lat of window edges from the DTM label grid, to compare with the extractor's own bounds. */
export function windowEdgesLonLat(dtm, proj = new EquirectangularProjection({ radiusM: RADIUS_M })) {
  const { L0, S0, rows, cols, row0, col0 } = dtm;
  const west = proj.inverse((col0 - 0.5) - S0, 0).lonDeg;
  const east = proj.inverse((col0 + cols - 0.5) - S0, 0).lonDeg;
  const north = proj.inverse(0, L0 - (row0 - 0.5)).latDeg;
  const south = proj.inverse(0, L0 - (row0 + rows - 0.5)).latDeg;
  return { west, east, north, south };
}

// ------------------------------------------------------------------ ortho sampling

/** Projected metres -> global z17 continuous pixel coordinates (integer = pixel edge). */
export function projectedToGlobalPx(g, proj, X, Y) {
  const p = proj.inverse(X, Y);
  return { gx: (p.lonDeg + 180) / g.degPerPx, gy: (90 - p.latDeg) / g.degPerPx };
}

/**
 * Resamples the ortho gray level onto the DTM grid. Each DTM cell (1 m) is averaged over a 4x4 footprint
 * sub-sample grid. A cell is valid only when ALL 16 sub-samples are inside a loaded tile with alpha === 255.
 * Missing tiles and alpha < 255 stay NaN: no fill, no zeroing.
 */
export function resampleOrthoToDtm({ dtm, g, proj, tileAt, offsetsM = [-0.375, -0.125, 0.125, 0.375] }) {
  const n = dtm.rows * dtm.cols;
  const out = new Float32Array(n).fill(NaN);
  const valid = new Uint8Array(n);
  for (let r = 0; r < dtm.rows; r++) {
    for (let c = 0; c < dtm.cols; c++) {
      const i = r * dtm.cols + c;
      const { X, Y } = cellCentreProjectedM(dtm, dtm.row0 + r, dtm.col0 + c);
      const cg = projectedToGlobalPx(g, proj, X, Y);
      const ctile = tileAt(Math.floor(Math.floor(cg.gy) / TILE_PX), Math.floor(Math.floor(cg.gx) / TILE_PX));
      if (!ctile) continue; // centre tile absent: whole footprint is absent too
      let sum = 0, cnt = 0, ok = true;
      for (const dy of offsetsM) {
        for (const dx of offsetsM) {
          const p = projectedToGlobalPx(g, proj, X + dx, Y + dy);
          const ix = Math.floor(p.gx), iy = Math.floor(p.gy);
          const t = tileAt(Math.floor(iy / TILE_PX), Math.floor(ix / TILE_PX));
          if (!t) { ok = false; break; }
          const k = (iy % TILE_PX) * TILE_PX + (ix % TILE_PX);
          if (t.alpha[k] !== 255) { ok = false; break; }
          sum += t.gray[k]; cnt++;
        }
        if (!ok) break;
      }
      if (ok && cnt === offsetsM.length * offsetsM.length) { out[i] = sum / cnt; valid[i] = 1; }
    }
  }
  return { values: out, valid, count: valid.reduce((s, v) => s + v, 0) };
}

/** Decodes one z17 tile (gray+alpha, 8 bit, 256x256) and caches it. Returns null when the file is absent. */
export function makeTileCache(tilesRoot, zoom = ZOOM, fsApi = fs) {
  const cache = new Map();
  return {
    tileAt(row, col) {
      const key = `${row}/${col}`;
      if (cache.has(key)) return cache.get(key);
      const p = path.join(tilesRoot, String(zoom), String(row), `${col}.png`);
      let val = null;
      if (fsApi.existsSync(p)) {
        const img = decodePng(fsApi.readFileSync(p));
        if (img.width !== TILE_PX || img.height !== TILE_PX || img.channels !== 2) {
          throw new Error(`Tile ${key}: beklenmeyen biçim ${img.width}x${img.height} kanal=${img.channels}`);
        }
        const n = TILE_PX * TILE_PX;
        const gray = new Uint8Array(n), alpha = new Uint8Array(n);
        for (let k = 0; k < n; k++) { gray[k] = img.data[2 * k]; alpha[k] = img.data[2 * k + 1]; }
        val = { gray, alpha };
      }
      cache.set(key, val);
      return val;
    },
    loaded() { return [...cache.values()].filter(Boolean).length; },
    entries() { return cache; },
  };
}

// ------------------------------------------------------------------ DTM terrain, hillshade, gradients

/** Horn gradients (east-positive dzdx, north-positive dzdy) on interior cells; valid mask + |grad Z| (m/m). */
export function terrainFromDtm(dtm, cellSizeM = dtm.cellSizeM) {
  const { rows, cols, Z } = dtm;
  const n = rows * cols;
  const dzdx = new Float32Array(n), dzdy = new Float32Array(n), mag = new Float32Array(n);
  const valid = new Uint8Array(n);
  const z9 = new Array(9);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      z9[0] = Z[i - cols - 1]; z9[1] = Z[i - cols]; z9[2] = Z[i - cols + 1];
      z9[3] = Z[i - 1]; z9[4] = Z[i]; z9[5] = Z[i + 1];
      z9[6] = Z[i + cols - 1]; z9[7] = Z[i + cols]; z9[8] = Z[i + cols + 1];
      const gr = horn3x3Gradient(z9, cellSizeM);
      if (!gr) continue;
      dzdx[i] = gr.dzdx; dzdy[i] = gr.dzdy; mag[i] = Math.hypot(gr.dzdx, gr.dzdy); valid[i] = 1;
    }
  }
  return { dzdx, dzdy, mag, valid };
}

/** Hillshade = max(0, n . L) with n = (-dzdx, -dzdy, 1)/|.| and L from azimuth (clockwise from north) and altitude. */
export function hillshadeFromTerrain(terr, azDeg, altDeg = SUN_ALT_DEG) {
  const az = azDeg * DEG, alt = altDeg * DEG;
  const Lx = Math.sin(az) * Math.cos(alt), Ly = Math.cos(az) * Math.cos(alt), Lz = Math.sin(alt);
  const H = new Float32Array(terr.valid.length);
  for (let i = 0; i < H.length; i++) {
    if (!terr.valid[i]) continue;
    const zx = terr.dzdx[i], zy = terr.dzdy[i];
    const d = (-zx * Lx - zy * Ly + Lz) / Math.hypot(zx, zy, 1);
    H[i] = Math.max(0, d);
  }
  return H;
}

/** Central-difference gradient magnitude of the resampled ortho brightness (per DTM metre); needs 4 valid neighbours. */
export function brightnessGradient(R, Rvalid, rows, cols) {
  const n = rows * cols;
  const G = new Float32Array(n), valid = new Uint8Array(n);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (!Rvalid[i - 1] || !Rvalid[i + 1] || !Rvalid[i - cols] || !Rvalid[i + cols]) continue;
      const gx = (R[i + 1] - R[i - 1]) / 2, gy = (R[i - cols] - R[i + cols]) / 2;
      G[i] = Math.hypot(gx, gy); valid[i] = 1;
    }
  }
  return { G, valid };
}

// ------------------------------------------------------------------ correlation

/** Bilinear sample at fractional index (r, c); NaN when outside or when any of the 4 neighbours is invalid. */
export function bilinear(arr, valid, rows, cols, r, c) {
  if (!(r >= 0 && c >= 0 && r <= rows - 1 && c <= cols - 1)) return NaN;
  const r0 = Math.floor(r), c0 = Math.floor(c);
  const r1 = Math.min(r0 + 1, rows - 1), c1 = Math.min(c0 + 1, cols - 1);
  const fr = r - r0, fc = c - c0;
  const i00 = r0 * cols + c0, i01 = r0 * cols + c1, i10 = r1 * cols + c0, i11 = r1 * cols + c1;
  if (!valid[i00] || !valid[i01] || !valid[i10] || !valid[i11]) return NaN;
  return (arr[i00] * (1 - fc) + arr[i01] * fc) * (1 - fr) + (arr[i10] * (1 - fc) + arr[i11] * fc) * fr;
}

/**
 * Pearson correlation between fixed field A (cells in indexList) and B shifted by (dx, dy) DTM pixels:
 * B_s(r,c) = B(r - dy, c - dx). Only cells where both values exist are used.
 */
export function correlateAtShift({ A, indexList, B, Bvalid, rows, cols, dx, dy, minN }) {
  let n = 0, sA = 0, sB = 0, sAA = 0, sBB = 0, sAB = 0;
  for (let k = 0; k < indexList.length; k++) {
    const i = indexList[k];
    const r = (i / cols) | 0, c = i - r * cols;
    const b = bilinear(B, Bvalid, rows, cols, r - dy, c - dx);
    if (Number.isNaN(b)) continue;
    const a = A[i];
    n++; sA += a; sB += b; sAA += a * a; sBB += b * b; sAB += a * b;
  }
  if (n < minN) return { r: NaN, n };
  const ma = sA / n, mb = sB / n;
  const va = sAA / n - ma * ma, vb = sBB / n - mb * mb;
  if (!(va > 0) || !(vb > 0)) return { r: NaN, n };
  return { r: (sAB / n - ma * mb) / Math.sqrt(va * vb), n };
}

/** Correlation surface over the (2*steps+1)^2 grid of half-pixel (or step) shifts. */
export function scanShifts(opts) {
  const { range, step } = opts;
  const steps = Math.round(range / step);
  const surface = [];
  for (let j = -steps; j <= steps; j++) {
    for (let i = -steps; i <= steps; i++) {
      const dx = i * step, dy = j * step;
      const { r, n } = correlateAtShift({ ...opts, dx, dy });
      surface.push({ dx, dy, r, n });
    }
  }
  return surface;
}

/** Top peak, and the best value at least `secondPeakExclusionPx` away from it (second-peak margin). */
export function peakSummary(surface, excludePx = THRESHOLDS.secondPeakExclusionPx) {
  let top = null;
  for (const s of surface) if (!Number.isNaN(s.r) && (!top || s.r > top.r)) top = s;
  if (!top) return { top: null, second: null, margin: NaN };
  let second = null;
  for (const s of surface) {
    if (Number.isNaN(s.r) || Math.hypot(s.dx - top.dx, s.dy - top.dy) <= excludePx) continue;
    if (!second || s.r > second.r) second = s;
  }
  return { top, second, margin: second ? top.r - second.r : NaN };
}

/** Far-shift baseline: correlations at integer shifts with Chebyshev distance in [minD, maxD]. */
export function farShiftBaseline(opts, minD = 6, maxD = 10) {
  const vals = [];
  for (let dy = -maxD; dy <= maxD; dy++) {
    for (let dx = -maxD; dx <= maxD; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < minD) continue;
      const { r } = correlateAtShift({ ...opts, dx, dy });
      if (!Number.isNaN(r)) vals.push(r);
    }
  }
  vals.sort((a, b) => a - b);
  return { count: vals.length, max: vals.length ? vals[vals.length - 1] : NaN, median: vals.length ? vals[vals.length >> 1] : NaN };
}

// ------------------------------------------------------------------ decision

/**
 * Verdict per pre-registered rule. "hizalı" requires ALL of:
 *  - enough overlap cells; hillshade (best azimuth) AND gradient-magnitude surfaces each have a top peak
 *    within centreTolPx of (0,0), r >= minCorrelation, and a margin >= minPeakMargin over the second peak.
 * Anything else is "kanıtlanamadı" with the failing criteria listed.
 */
export function decideRegistration({ overlapCells, hillshade, gradient, thresholds = THRESHOLDS }) {
  const reasons = [];
  const check = (name, s) => {
    if (!s || !s.top) { reasons.push(`${name}: geçerli tepe yok`); return false; }
    let ok = true;
    if (Math.abs(s.top.dx) > thresholds.centreTolPx || Math.abs(s.top.dy) > thresholds.centreTolPx) {
      reasons.push(`${name}: tepe (${s.top.dx}, ${s.top.dy}) px, sıfır ötelenmede değil`); ok = false;
    }
    if (!(s.top.r >= thresholds.minCorrelation)) { reasons.push(`${name}: tepe r=${fmt(s.top.r)} < ${thresholds.minCorrelation}`); ok = false; }
    if (!(s.margin >= thresholds.minPeakMargin)) { reasons.push(`${name}: ikinci tepe farkı=${fmt(s.margin)} < ${thresholds.minPeakMargin} (belirsiz tepe)`); ok = false; }
    return ok;
  };
  if (!(overlapCells >= thresholds.minOverlapCells)) reasons.push(`ortak geçerli hücre ${overlapCells} < ${thresholds.minOverlapCells}`);
  const hsOk = check('hillshade', hillshade);
  const gOk = check('gradyan', gradient);
  const enough = overlapCells >= thresholds.minOverlapCells;
  const verdict = enough && hsOk && gOk ? 'hizalı' : 'kanıtlanamadı';
  return { verdict, reasons };
}

const fmt = (v) => (Number.isFinite(v) ? v.toFixed(4) : String(v));

// ------------------------------------------------------------------ run

function parseArgs(argv) {
  const o = { out: null, range: 3, step: 0.5, wide: 20, wideStride: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--range') o.range = Number(argv[++i]);
    else if (a === '--step') o.step = Number(argv[++i]);
    else if (a === '--wide') o.wide = Number(argv[++i]);
    else if (a === '--wide-stride') o.wideStride = Number(argv[++i]);
    else throw new Error(`Bilinmeyen argüman: ${a}`);
  }
  if (!(o.step > 0) || o.range % o.step !== 0) throw new Error('--range, --step tam katlar olmalı');
  return o;
}

export function runValidation(opts, { dataDir, fsApi = fs } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dd = dataDir || path.join(here, '..', 'data');
  const capsXml = fsApi.readFileSync(path.join(dd, 'mars-trek', 'hirise_ortho_25cm_WMTSCapabilities.xml'), 'utf8');
  const caps = parseCapabilities(capsXml);
  const g = deriveMatrixGeometry(caps.matrices.get(ZOOM));
  const proj = new EquirectangularProjection({ radiusM: RADIUS_M });

  const dtm = readDtmWindow(dd, fsApi);
  const edges = windowEdgesLonLat(dtm, proj);
  const ref = dtm.meta.coverage.latLonBounds;
  const edgeResidualM = {
    west: (edges.west - ref.west) * DEG * RADIUS_M, east: (edges.east - ref.east) * DEG * RADIUS_M,
    north: (edges.north - ref.north) * DEG * RADIUS_M, south: (edges.south - ref.south) * DEG * RADIUS_M,
  };

  const cache = makeTileCache(path.join(dd, 'mars-trek', 'ortho-tiles'), ZOOM, fsApi);
  const ortho = resampleOrthoToDtm({ dtm, g, proj, tileAt: cache.tileAt });
  const alphaHist = { zero: 0, full: 0, partial: 0 };
  for (const t of cache.entries().values()) {
    if (!t) continue;
    for (const a of t.alpha) { if (a === 0) alphaHist.zero++; else if (a === 255) alphaHist.full++; else alphaHist.partial++; }
  }

  const terr = terrainFromDtm(dtm);
  const Rgrad = brightnessGradient(ortho.values, ortho.valid, dtm.rows, dtm.cols);

  // Indices for the fixed (ortho) side; the shifted (DTM) side is sampled with bilinear + its own validity.
  const idxBrightness = listIndices(ortho.valid);
  const idxGradient = listIndices(Rgrad.valid);
  const common = { rows: dtm.rows, cols: dtm.cols, range: opts.range, step: opts.step, minN: THRESHOLDS.minOverlapCells };

  // Overlap: cells where the ortho brightness AND the DTM terrain exist (approx. count at zero shift).
  let overlapBrightness = 0;
  for (const i of idxBrightness) if (terr.valid[i]) overlapBrightness++;
  let overlapGradient = 0;
  for (const i of idxGradient) if (terr.valid[i]) overlapGradient++;

  const hillshadeRuns = [];
  let bestHs = null;
  for (const az of AZIMUTHS_DEG) {
    const H = hillshadeFromTerrain(terr, az, SUN_ALT_DEG);
    const surface = scanShifts({ ...common, A: ortho.values, indexList: idxBrightness, B: H, Bvalid: terr.valid });
    const pk = peakSummary(surface);
    const run = { azimuthDeg: az, altitudeDeg: SUN_ALT_DEG, peak: pk, surface, overlapCells: pk.top ? pk.top.n : 0 };
    hillshadeRuns.push(run);
    if (pk.top && (!bestHs || pk.top.r > bestHs.peak.top.r)) bestHs = run;
  }
  const gradSurface = scanShifts({ ...common, A: Rgrad.G, indexList: idxGradient, B: terr.mag, Bvalid: terr.valid });
  const gradPeak = peakSummary(gradSurface);

  const baselineHs = bestHs ? farShiftBaseline({ ...common, A: ortho.values, indexList: idxBrightness, B: hillshadeFromTerrain(terr, bestHs.azimuthDeg), Bvalid: terr.valid }) : null;
  const baselineGrad = farShiftBaseline({ ...common, A: Rgrad.G, indexList: idxGradient, B: terr.mag, Bvalid: terr.valid });

  // Wide diagnostic (gradient only, integer shifts, strided cells): is any offset outside +-range clearly better?
  const strideIdx = idxGradient.filter((_, k) => k % opts.wideStride === 0);
  const wideSurface = [];
  for (let dy = -opts.wide; dy <= opts.wide; dy++) {
    for (let dx = -opts.wide; dx <= opts.wide; dx++) {
      const { r, n } = correlateAtShift({ ...common, A: Rgrad.G, indexList: strideIdx, B: terr.mag, Bvalid: terr.valid, dx, dy, minN: 1000 });
      wideSurface.push({ dx, dy, r, n });
    }
  }
  const widePeak = peakSummary(wideSurface, 2);

  const decision = decideRegistration({
    overlapCells: Math.min(overlapBrightness, overlapGradient),
    hillshade: bestHs ? { top: bestHs.peak.top, margin: bestHs.peak.margin } : null,
    gradient: { top: gradPeak.top, margin: gradPeak.margin },
  });

  const result = {
    schema: 'marswalk.ortho-registration-test.v1',
    status: 'ölçüm: ortho/DTM hizası kanıtlanamadı veya hizalı olarak değerlendirildi (karar aşağıda); hillshade ortomozaik değildir',
    dtm: {
      file: dtm.meta.dataFile, rows: dtm.rows, cols: dtm.cols, row0: dtm.row0, col0: dtm.col0, validCells: dtm.validCount,
      convention: 'PixelIsArea; hücre merkezi X = col - S0, Y = L0 - row (DTM etiketi); R=3396190 m, latTs0=0, lon0=0',
      sampleProjectionOffset: dtm.S0, lineProjectionOffset: dtm.L0,
      windowEdgeResidualM_vsExtractor: edgeResidualM,
    },
    ortho: {
      zoom: ZOOM, degPerPx: g.degPerPx, metresPerPx: g.degPerPx * RADIUS_M * DEG,
      tilesLoaded: cache.loaded(), alphaHistogramOfLoadedTiles: alphaHist,
      resampledValidCells: ortho.count, footprintSubsamples: '4x4 per 1 m DTM cell; all alpha=255',
    },
    overlap: { brightnessCells: overlapBrightness, gradientCells: overlapGradient },
    shiftGrid: { rangePx: opts.range, stepPx: opts.step, shiftConvention: 'H_s(r,c) = H(r-dy, c-dx); dx>0: hillshade features displaced east by dx px' },
    hillshade: {
      note: 'Güneş azimutu/yüksekliği bilinmiyor: 8 azimut x 45° tarandı; karar en iyi azimutu kullanır (çoklu karşılaştırma yükü).',
      perAzimuth: hillshadeRuns.map((r) => ({ azimuthDeg: r.azimuthDeg, top: r.peak.top, secondR: r.peak.second ? r.peak.second.r : null, margin: r.peak.margin })),
      best: bestHs ? { azimuthDeg: bestHs.azimuthDeg, top: bestHs.peak.top, second: bestHs.peak.second, margin: bestHs.peak.margin } : null,
      farShiftBaseline: baselineHs,
      surfaceBest: bestHs ? bestHs.surface : null,
    },
    gradient: {
      note: 'Işıktan bağımsız: |grad orto| (DTM ızgarası, 1 m) ile |grad Z| (Horn) karşılaştırması.',
      top: gradPeak.top, second: gradPeak.second, margin: gradPeak.margin,
      farShiftBaseline: baselineGrad,
      surface: gradSurface,
    },
    wideDiagnostic: {
      note: `Yalnız teşhis: gradyan, tam sayı kaydırma +-${opts.wide} px, her ${opts.wideStride}. hücre. Karara girmez.`,
      top: widePeak.top, second: widePeak.second, margin: widePeak.margin,
    },
    thresholds: THRESHOLDS,
    decision,
    caveats: [
      'Eşikler sezgiseldir; önceden sabitlendi, literatürle doğrulanmadı.',
      'Hillshade azimut ve yükseklik varsayımlıdır; en iyi azimut seçimi çoklu karşılaştırma yapar.',
      'Ortonun geçerli alanı yalnız z17 karolarının kapsadığı kısımdır; DTM penceresinin büyük kısmı kapsanmaz.',
      'Half-pixel kaydı bu taramada yarım piksel adımlarla dolaylı olarak test edilir; kaynak raster kaydı ayrıca kanıtlanmadı.',
    ],
  };
  return result;
}

function listIndices(valid) {
  let n = 0;
  for (let i = 0; i < valid.length; i++) if (valid[i]) n++;
  const out = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < valid.length; i++) if (valid[i]) out[k++] = i;
  return out;
}

function printSummary(res) {
  const p = (s) => (s && s.top ? `(${s.top.dx}, ${s.top.dy}) px  r=${fmt(s.top.r)}  ikinci-tepe farkı=${fmt(s.margin)}  n=${s.top.n}` : 'tepe yok');
  console.log(`DTM penceresi: ${res.dtm.rows}x${res.dtm.cols}, geçerli ${res.dtm.validCells}; kenar sapması (çıkarıcıya göre, m): ${Object.values(res.dtm.windowEdgeResidualM_vsExtractor).map((v) => v.toExponential(1)).join(' ')}`);
  console.log(`Orto: z17 ${res.ortho.metresPerPx.toFixed(4)} m/px, yüklenen karo ${res.ortho.tilesLoaded}, yeniden örneklenen geçerli DTM hücresi ${res.ortho.resampledValidCells}`);
  console.log(`Ortak hücre: parlaklık ${res.overlap.brightnessCells}, gradyan ${res.overlap.gradientCells}`);
  for (const r of res.hillshade.perAzimuth) console.log(`  hillshade az=${String(r.azimuthDeg).padStart(3)}: ${p({ top: r.top, margin: r.margin })}`);
  console.log(`Hillshade en iyi: az=${res.hillshade.best ? res.hillshade.best.azimuthDeg : '-'} -> ${p(res.hillshade.best)}`);
  console.log(`  uzak-kayma tabanı (r): maks=${fmt(res.hillshade.farShiftBaseline && res.hillshade.farShiftBaseline.max)} medyan=${fmt(res.hillshade.farShiftBaseline && res.hillshade.farShiftBaseline.median)}`);
  console.log(`Gradyan (ışıktan bağımsız): ${p(res.gradient)}`);
  console.log(`  uzak-kayma tabanı (r): maks=${fmt(res.gradient.farShiftBaseline.max)} medyan=${fmt(res.gradient.farShiftBaseline.median)}`);
  console.log(`Geniş teşhis (+-${res.wideDiagnostic.note.match(/\+-(\d+)/)[1]} px, gradyan): ${p(res.wideDiagnostic)}`);
  console.log(`KARAR: ${res.decision.verdict}`);
  for (const r of res.decision.reasons) console.log(`  - ${r}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const res = runValidation(opts);
    printSummary(res);
    if (opts.out) {
      fs.mkdirSync(opts.out, { recursive: true });
      const file = path.join(opts.out, 'ortho-registration-z17.json');
      fs.writeFileSync(file, JSON.stringify(res, null, 2) + '\n');
      console.log(`Yazıldı: ${file}`);
    }
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}
