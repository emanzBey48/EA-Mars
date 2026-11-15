// Stage K3-9 — analizlerin AKTİF (legacy HiRISE) DTM penceresinde yeniden koşulması.
//
//   node scripts/legacy-analysis.mjs [--minDepthM 1] [--minProminenceM 1] [--json <dosya>]
//
// Kapsam: (a) kabartma özeti (relief-metrics), (b) WB1 → Roubion üç tercihli rota (route-compare), (c) uç nokta
// kot/eğimleri. Her biri iki DTM için yan yana: AKTİF legacy (uygulama sağlayıcısı) ve USGS ADAYI (uygulamada
// kullanılmıyor; yalnız kıyas). Legacy için iki çerçeve ayrı raporlanır:
//   * "uygulama-örnekleme" çerçevesi: sağlayıcının köprüsü (provider.adapter), kot/eğim örnekleyicisi bunu kullanır;
//   * "uygulama-düzenli" çerçeve: minimap terrain ve rota planlayıcısı (main.js initializeRouteWorker, render.js
//     buildTerrainImage) nwXM + (col+0.5)*cellSizeM düzenli ızgarasını kullanır. Bu iki çerçeve Doğu-Batı'da ayrılır.
// Veri yalnız okunur. Ölçümler senaryo parametreleridir; kaya/blok tespiti değildir.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { elevationStats, slopeStats, findDepressions, findSummits } from '../public/js/geo/relief-metrics.js';
import { createDemWindow, buildFieldForWindow, localToCell, cellToLocal } from '../public/js/route/route-service.js';
import { planRouteVariants, routePreferenceParams, ROUTE_PREFERENCE_IDS } from '../public/js/route/route-compare.js';
import { GridElevationLayer, STATUS } from '../public/js/surface/layers.js';
import { MAP_FRAME, WAYPOINTS } from '../public/js/config.js';
import {
  loadLegacyProvider, loadRawDtm, LEGACY_DIR, USGS_DIR,
} from './validate-ortho-registration-legacy.mjs';

export const NODATA_F32_BITS = 0xFF7FFFFB;
export const ROUTE_SLOPE_THRESHOLD_DEG = 5;
const SAMPLE_STEP_M = 0.25;

/** Stage 35 (stage35-scale-audit.md) USGS adayı kabartma sayıları — karşılaştırma referansı (yeniden hesaplanır). */
export const STAGE35_REFERENCE = Object.freeze({
  elevRangeM: 44.842, slopeP50: 3.11, slopeP90: 7.54, slopeP99: 13.54, slopeMax: 35.77,
  deepestBasinM: 7.98, mostProminentSummitM: 8.07,
});
/** Efe'nin USGS adayı rota sayıları (stage/route belgeleri): uzunluk ve maks eğim. */
export const USGS_ROUTE_REFERENCE = Object.freeze({ balanced: { lengthM: 730.505, maxSlopeDeg: 9.81 }, shortest: { lengthM: 730.505, maxSlopeDeg: 10.64 }, gentle: { lengthM: 732.161, maxSlopeDeg: 9.27 } });

// ------------------------------------------------------------------ saf yardımcılar

/** Dış rota polilinini (xM,yM) 0,25 m örneklerle tarar; her örnek hücresinin eğimi eşiği aşıyor mu (uzunluk payı). */
export function longSlopeShare(win, slopeDeg, pts, thrDeg = ROUTE_SLOPE_THRESHOLD_DEG, stepM = SAMPLE_STEP_M) {
  let total = 0, above = 0, unknown = 0, maxSlope = -Infinity;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const L = Math.hypot(b.xM - a.xM, b.yM - a.yM);
    if (!(L > 0)) continue;
    const n = Math.max(1, Math.ceil(L / stepM));
    const w = L / n;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const x = a.xM + (b.xM - a.xM) * t, y = a.yM + (b.yM - a.yM) * t;
      const c = localToCell(win, x, y);
      if (!c.inside) { unknown += w; continue; }
      const v = slopeDeg[c.row * win.cols + c.col];
      if (!Number.isFinite(v)) { unknown += w; continue; }
      total += w;
      if (v > thrDeg) above += w;
      if (v > maxSlope) maxSlope = v;
    }
  }
  return {
    sampledLengthM: total + unknown,
    knownLengthM: total,
    unknownLengthM: unknown,
    shareAbove: total > 0 ? above / total : null,
    maxSampledSlopeDeg: Number.isFinite(maxSlope) ? maxSlope : null,
  };
}

/** Eşikli çukur/tepe listesinin ilk n kaydını tabloya uygun düz nesneye çevirir. */
export function topRecords(list, n, key) {
  return list.slice(0, n).map((b, i) => ({
    rank: i + 1, [key]: b[key], minOrPeakM: b.minElevationM ?? b.peakElevationM,
    baseOrSpillM: b.spillElevationM ?? b.baseElevationM, xM: b.xM, yM: b.yM, areaM2: b.areaM2, cellCount: b.cellCount,
    noDataTemasi: b.noDataTemasi,
  }));
}

/** Uygulamanın kullandığı 32-bit no-data deseni (float) — main.js initializeRouteWorker ile aynı yöntem. */
export function noDataFloatFromBits(bits) {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, bits >>> 0, true);
  return dv.getFloat32(0, true);
}

/** Kabartma istatistikleri (eşik senaryo parametreleri çağırandan gelir). */
export function reliefSummary(grid, { minDepthM, minProminenceM }) {
  const elev = elevationStats(grid);
  const slope = slopeStats(grid);
  const dep = findDepressions(grid, { minDepthM });
  const sum = findSummits(grid, { minProminenceM });
  return {
    elevation: elev,
    slope,
    depressions: { counts: dep.counts, top: dep.basins.slice(0, 5).map((b, i) => ({ rank: i + 1, depthM: b.depthM, minElevationM: b.minElevationM, xM: b.xM, yM: b.yM, areaM2: b.areaM2, noDataTemasi: b.noDataTemasi })) },
    summits: { counts: sum.counts, top: sum.summits.slice(0, 5).map((s, i) => ({ rank: i + 1, prominenceM: s.prominenceM, peakElevationM: s.peakElevationM, xM: s.xM, yM: s.yM, areaM2: s.areaM2, noDataTemasi: s.noDataTemasi })) },
  };
}

/** Rota tercihlerini (planRouteVariants çıktısı) tabloya dönüştürür. Eğim payı pencere eğim alanından hesaplanır. */
export function routeTable(win, out) {
  const rows = {};
  for (const id of ROUTE_PREFERENCE_IDS) {
    const res = out.results[id];
    if (res.status !== 'ok') { rows[id] = { status: res.status, reason: res.reason }; continue; }
    const field = buildFieldForWindow(win, routePreferenceParams(id));
    const share = longSlopeShare(win, field.slopeDeg, res.path);
    rows[id] = {
      status: 'ok',
      lengthM: res.stats.lengthM,
      plannerMaxSlopeDeg: res.stats.maxSlopeDeg,
      sampledMaxSlopeDeg: share.maxSampledSlopeDeg,
      minScore: res.summary.minScore,
      meanScore: res.summary.meanScore,
      elevationGainM: res.stats.elevationGainM,
      elevationLossM: res.stats.elevationLossM,
      shareAbove5DegPct: share.shareAbove === null ? null : share.shareAbove * 100,
      unknownLengthM: share.unknownLengthM,
      cellsOnPath: res.path.length,
    };
  }
  return { perPreference: rows, comparison: out.comparison, status: out.status };
}

/** Uç noktaları iki kaynakla (uygulama örnekleyici ve planlayıcı çerçevesi) okur. */
export function endpointRow({ label, x, y, sampler, win, field, elevationAtCell, bridgeCell, bridgeCentre }) {
  const sampleE = sampler.sampleElevation(x, y);
  const sampleS = sampler.sampleSlope(x, y);
  const c = localToCell(win, x, y);
  const idx = c.inside ? c.row * win.cols + c.col : -1;
  const cellCentre = c.inside ? cellToLocal(win, c.row, c.col) : null;
  return {
    label,
    xM: x, yM: y,
    sampler: { elevationM: sampleE.status === STATUS.OK ? sampleE.value : null, status: sampleE.status, slopeDeg: sampleS.status === STATUS.OK ? sampleS.value : null, slopeStatus: sampleS.status, cell: sampleE.cell ?? null },
    plannerFrame: { cell: c.inside ? { row: c.row, col: c.col } : null, elevationM: idx >= 0 ? elevationAtCell(idx) : null, slopeDeg: idx >= 0 && field ? field.slopeDeg[idx] : null, centreXM: cellCentre?.xM ?? null, centreYM: cellCentre?.yM ?? null },
    bridgeCell: bridgeCell ?? null, bridgeCentreXM: bridgeCentre?.x ?? null, bridgeCentreYM: bridgeCentre?.y ?? null,
  };
}

// ------------------------------------------------------------------ CLI

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function argVal(argv, name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} bir değer ister`);
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const minDepthM = Number(argVal(argv, '--minDepthM', '1'));
  const minProminenceM = Number(argVal(argv, '--minProminenceM', '1'));
  if (!(minDepthM >= 0) || !(minProminenceM >= 0)) throw new Error('--minDepthM / --minProminenceM sonlu ve >= 0 olmalı');
  const jsonPath = argVal(argv, '--json', null);

  // ---- legacy: uygulama sağlayıcısı (gerçek kod yolu)
  const { provider, validation, canonicalAdapter } = await loadLegacyProvider();
  if (validation.status !== 'supported') throw new Error(`legacy doğrulaması supported değil: ${validation.status}`);
  const L = loadRawDtm(LEGACY_DIR);
  const legacyBits = L.noDataBits;
  const legacyGrid = {
    elevation: provider.values, rows: L.rows, cols: L.cols, cellSizeM: provider.cellSizeM,
    nwXM: provider.adapter.pixelToLocal(L.row0 - 0.5, L.col0 - 0.5).x,
    nwYM: provider.adapter.pixelToLocal(L.row0 - 0.5, L.col0 - 0.5).y,
    noDataValue: noDataFloatFromBits(legacyBits), validMin: L.meta.label.validMin, validMax: L.meta.label.validMax,
  };

  // ---- USGS adayı (yalnız kıyas; canonical = MAP_FRAME çerçevesi)
  const U = loadRawDtm(USGS_DIR);
  const usgsGrid = {
    elevation: U.raw, rows: U.rows, cols: U.cols, cellSizeM: MAP_FRAME.mapScaleM,
    nwXM: canonicalAdapter.pixelToLocal(U.row0 - 0.5, U.col0 - 0.5).x,
    nwYM: canonicalAdapter.pixelToLocal(U.row0 - 0.5, U.col0 - 0.5).y,
    noDataValue: noDataFloatFromBits(U.noDataBits), validMin: U.meta.label.validMin, validMax: U.meta.label.validMax,
  };
  const usgsLayer = new GridElevationLayer({
    descriptor: { product: 'USGS_ADAY_JEZ_hirise_soc_006', unit: 'm', verticalDatum: null }, adapter: canonicalAdapter,
    values: U.raw, rows: U.rows, cols: U.cols, rowOffset: U.row0, colOffset: U.col0, noDataBits: U.noDataBits,
    validMin: U.meta.label.validMin, validMax: U.meta.label.validMax,
  });

  // ---- legacy düzenli çerçeve (minimap/planlayıcı) — main.js initializeRouteWorker ile aynı alanlar
  const legacyRegular = { ...legacyGrid, adapter: canonicalAdapter };
  const legacyWin = createDemWindow(legacyRegular);
  const usgsWin = createDemWindow({ ...usgsGrid, adapter: canonicalAdapter });

  // ---- kabartma (eşikler çağırandan)
  const relief = {
    legacy: reliefSummary(legacyGrid, { minDepthM, minProminenceM }),
    usgs: reliefSummary(usgsGrid, { minDepthM, minProminenceM }),
  };

  // ---- rota (WB1 -> Roubion, yerel metre; uçlar kanonik çerçeveden)
  const wb1 = canonicalAdapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg);
  const rou = canonicalAdapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg);
  const startLocal = { xM: wb1.x, yM: wb1.y }, endLocal = { xM: rou.x, yM: rou.y };
  const routeLegacy = routeTable(legacyWin, planRouteVariants({ window: legacyWin, startLocal, endLocal }));
  const routeUsgs = routeTable(usgsWin, planRouteVariants({ window: usgsWin, startLocal, endLocal }));

  // ---- uç noktaları
  const legacyField = buildFieldForWindow(legacyWin, routePreferenceParams('balanced'));
  const usgsField = buildFieldForWindow(usgsWin, routePreferenceParams('balanced'));
  const legacyElevAtCell = (idx) => (L.valid[idx] ? provider.values[idx] : null);
  const usgsElevAtCell = (idx) => (U.valid[idx] ? U.Z[idx] : null);
  const endpoints = [
    { label: 'WB1 (Sol 120)', ...wb1 },
    { label: 'Roubion (Sol 164)', ...rou },
  ].map((pt) => {
    const lc = provider.adapter.localToCell(pt.x, pt.y);
    const lCentre = provider.adapter.pixelToLocal(lc.row, lc.col);
    const uc = canonicalAdapter.localToCell(pt.x, pt.y);
    const uCentre = canonicalAdapter.pixelToLocal(uc.row, uc.col);
    const legacyRow = endpointRow({
      label: pt.label, x: pt.x, y: pt.y, sampler: provider, win: legacyWin, field: legacyField,
      elevationAtCell: legacyElevAtCell,
      bridgeCell: { row: lc.row, col: lc.col }, bridgeCentre: lCentre,
    });
    const usgsRow = endpointRow({
      label: pt.label, x: pt.x, y: pt.y, sampler: usgsLayer, win: usgsWin, field: usgsField,
      elevationAtCell: usgsElevAtCell, bridgeCell: { row: uc.row, col: uc.col }, bridgeCentre: uCentre,
    });
    // Düzenli çerçeve kayması: aynı pencere hücresi için coğrafi (köprü) konum − düzenli (planlayıcı) konum.
    const pc = localToCell(legacyWin, pt.x, pt.y);
    const plannerCentre = cellToLocal(legacyWin, pc.row, pc.col);
    const geoPlannerCell = provider.adapter.pixelToLocal(L.row0 + pc.row, L.col0 + pc.col);
    const frameDisplacement = {
      plannerCell: { row: pc.row, col: pc.col },
      plannerCellDxM: geoPlannerCell.x - plannerCentre.xM,
      plannerCellDyM: geoPlannerCell.y - plannerCentre.yM,
    };
    return { label: pt.label, legacy: legacyRow, usgs: usgsRow, frameDisplacement };
  });
  // Pencere kenarlarında düzenli çerçeve kayması (orta satır): batı, doğu kenarı.
  const midRow = Math.floor(L.rows / 2);
  const displacementAt = (col) => {
    const reg = cellToLocal(legacyWin, midRow, col);
    const geo = provider.adapter.pixelToLocal(L.row0 + midRow, L.col0 + col);
    return { col, dxM: geo.x - reg.xM, dyM: geo.y - reg.yM };
  };
  const windowFrameDisplacement = { westEdge: displacementAt(0), eastEdge: displacementAt(L.cols - 1) };

  // ---- çıktı
  const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'yok' : v.toFixed(d));
  console.log('=== K3-9: analizlerin AKTİF legacy DTM penceresinde yeniden koşulması ===');
  console.log(`Eşikler (senaryo): minDepthM=${minDepthM}, minProminenceM=${minProminenceM}`);
  console.log(`Legacy: ${L.rows}x${L.cols}, geçerli ${L.validCells}; USGS adayı: ${U.rows}x${U.cols}, geçerli ${U.validCells}`);
  console.log('');
  console.log('-- (a) Kabartma özeti (tablo: legacy | USGS adayı | Stage 35 belge değeri)');
  const e = relief.legacy.elevation, eu = relief.usgs.elevation;
  console.log(`Kot aralığı (tam, m): ${f(e.rangeM, 3)} | ${f(eu.rangeM, 3)} | ${STAGE35_REFERENCE.elevRangeM}`);
  console.log(`Kot min/P1/P50/P99/max (m): ${f(e.minM, 2)}/${f(e.p1M, 2)}/${f(e.p50M, 2)}/${f(e.p99M, 2)}/${f(e.maxM, 2)} | ${f(eu.minM, 2)}/${f(eu.p1M, 2)}/${f(eu.p50M, 2)}/${f(eu.p99M, 2)}/${f(eu.maxM, 2)}`);
  const sl = relief.legacy.slope, su = relief.usgs.slope;
  console.log(`Eğim P50/P90/P99/max (°): ${f(sl.p50Deg)}/${f(sl.p90Deg)}/${f(sl.p99Deg)}/${f(sl.maxDeg)} | ${f(su.p50Deg)}/${f(su.p90Deg)}/${f(su.p99Deg)}/${f(su.maxDeg)} | ${STAGE35_REFERENCE.slopeP50}/${STAGE35_REFERENCE.slopeP90}/${STAGE35_REFERENCE.slopeP99}/${STAGE35_REFERENCE.slopeMax}`);
  console.log(`Eğim hesaplanan hücre: legacy ${sl.computedCount}, USGS ${su.computedCount}`);
  const dl = relief.legacy.depressions, du = relief.usgs.depressions;
  console.log(`En derin 5 kapalı çukur (m) — legacy: ${dl.top.map((b) => `${f(b.depthM)}${b.noDataTemasi ? '*' : ''}`).join(', ') || 'yok'} | USGS: ${du.top.map((b) => `${f(b.depthM)}${b.noDataTemasi ? '*' : ''}`).join(', ') || 'yok'} (Stage35 en derin: ${STAGE35_REFERENCE.deepestBasinM})`);
  const sl5 = relief.legacy.summits, su5 = relief.usgs.summits;
  console.log(`En belirgin 5 tepe (m) — legacy: ${sl5.top.map((s) => f(s.prominenceM)).join(', ') || 'yok'} | USGS: ${su5.top.map((s) => f(s.prominenceM)).join(', ') || 'yok'} (Stage35 en belirgin: ${STAGE35_REFERENCE.mostProminentSummitM})`);
  console.log(`Çukur/tepe sayımı — legacy: kapalı ${dl.counts.closedBasins}/${sl5.counts.closedHills}, eşik üstü ${dl.counts.closedAboveThreshold}/${sl5.counts.closedAboveThreshold}; USGS: kapalı ${du.counts.closedBasins}/${su5.counts.closedHills}, eşik üstü ${du.counts.closedAboveThreshold}/${su5.counts.closedAboveThreshold}`);
  console.log('');
  console.log('-- (b) WB1 → Roubion rota tercihleri (uygulama düzenli çerçevesi; legacy | USGS adayı)');
  for (const id of ROUTE_PREFERENCE_IDS) {
    const a = routeLegacy.perPreference[id], b = routeUsgs.perPreference[id];
    const ref = USGS_ROUTE_REFERENCE[id];
    const fmtRow = (r) => (r.status !== 'ok' ? `durum ${r.status}` : `${f(r.lengthM, 3)} m, maks(planlayıcı) ${f(r.plannerMaxSlopeDeg)}°, maks(örnek) ${f(r.sampledMaxSlopeDeg)}°, min puan ${f(r.minScore, 3)}, >5° payı ${f(r.shareAbove5DegPct, 1)}%`);
    console.log(`${id}: ${fmtRow(a)} | ${fmtRow(b)} | belge USGS: ${ref.lengthM} m ${ref.maxSlopeDeg}°`);
  }
  console.log(`Karşılaştırma (legacy, dengeli referans): ${routeLegacy.comparison.available ? 'var' : 'yok: ' + routeLegacy.comparison.reason}`);
  console.log('');
  console.log('-- (c) Uç noktalar: uygulama örnekleyici (legacy: sağlayıcı; USGS: GridElevationLayer)');
  for (const ep of endpoints) {
    const L1 = ep.legacy, U1 = ep.usgs;
    console.log(`${ep.label}: legacy kot ${f(L1.sampler.elevationM, 3)} m (${L1.sampler.status}), eğim ${f(L1.sampler.slopeDeg, 3)}° (${L1.sampler.slopeStatus}) | USGS kot ${f(U1.sampler.elevationM, 3)} m (${U1.sampler.status}), eğim ${f(U1.sampler.slopeDeg, 3)}° (${U1.sampler.slopeStatus})`);
    console.log(`    legacy çerçeve farkı: örnekleyici hücresi ${JSON.stringify(L1.sampler.cell)} vs düzenli (planlayıcı) hücresi ${JSON.stringify(L1.plannerFrame.cell)}; planlayıcı kot ${f(L1.plannerFrame.elevationM, 3)} m, eğim ${f(L1.plannerFrame.slopeDeg, 3)}°`);
    const fd = ep.frameDisplacement;
    console.log(`    düzenli çerçeve kayması (aynı pencere hücresi, coğrafi köprü − düzenli): planlayıcı hücresi (${fd.plannerCell.row},${fd.plannerCell.col}) için Δx ${f(fd.plannerCellDxM, 2)} m, Δy ${f(fd.plannerCellDyM, 2)} m`);
  }
  console.log('');
  const pass = routeLegacy.perPreference.balanced.status === 'ok';
  console.log(`Rota durumu: ${routeLegacy.status} (legacy), ${routeUsgs.status} (USGS)`);
  console.log(`Düzenli çerçeve kayması (pencere, orta satır): batı kenar Δx ${f(windowFrameDisplacement.westEdge.dxM, 2)} m; doğu kenar Δx ${f(windowFrameDisplacement.eastEdge.dxM, 2)} m (coğrafi − düzenli)`);
  const result = {
    schema: 'marswalk.k3-9-legacy-analysis.v1',
    status: 'senaryo parametreli ölçüm; kaya/blok tespiti değildir; tercih ağırlıkları senaryodur',
    scenarioParameters: { minDepthM, minProminenceM, routeSlopeThresholdDeg: ROUTE_SLOPE_THRESHOLD_DEG },
    frames: { legacyApp: 'provider.adapter (köprü), kot/eğim örnekleyicisi', legacyRegular: 'nwXM + (col+0.5)*cellSizeM (minimap/planlayıcı)', usgs: 'MAP_FRAME (canonical)' },
    legacy: { provider: { id: provider.id ?? 'hirise-legacy-jezero-dtm', validation: validation.status }, sha256: L.sha256, rows: L.rows, cols: L.cols, validCells: L.validCells, cellSizeM: provider.cellSizeM, nwXM: legacyGrid.nwXM, nwYM: legacyGrid.nwYM },
    usgs: { sha256: U.sha256, rows: U.rows, cols: U.cols, validCells: U.validCells, cellSizeM: usgsGrid.cellSizeM },
    relief,
    stage35Reference: STAGE35_REFERENCE,
    route: { legacyRegular: routeLegacy, usgs: routeUsgs, usgsReference: USGS_ROUTE_REFERENCE },
    endpoints,
    windowFrameDisplacement,
    caveats: [
      'Kabartma ve rota sayıları senaryo parametreleriyle üretilir; kaya/blok tespiti değildir.',
      'Legacy düzenli çerçeve ile köprü çerçevesi Doğu-Batı yönünde ayrılır (ayrıntı: stage-k3-legacy-analysis.md).',
      'Eğim, uygulamadaki gibi kanonik çerçevede tek hücre aralığıyla (1,00966 m) hesaplanır; E-W gerçek aralık ~0,992 m.',
      'USGS sayıları Efe belgelerinin kıyas değeridir; aktif uygulama verisi değildir.',
    ],
    pass,
  };
  if (jsonPath) {
    fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`Yazıldı: ${jsonPath}`);
  }
  return result;
}

if (isMain) {
  main().catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  });
}
