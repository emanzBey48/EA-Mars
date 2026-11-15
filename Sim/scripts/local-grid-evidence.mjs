// Stage K3-10 — legacy DTM'in koordinat köprüsü üzerinden düzenli yerel ızgaraya yeniden örneklenmesi kanıtı.
//
//   node scripts/local-grid-evidence.mjs [--cellSizeM <m>] [--json <dosya>]
//
// Legacy DTM uygulamanın KENDİ sağlayıcısıyla (registry -> GridElevationLayer, köprü = provider.adapter) yüklenir.
// Yeni düzenli ızgara geo/local-grid.js ile üretilir; eski düzenli çerçeve (main.js/minimap ile aynı alanlar)
// yan yana ölçülür. Veri yalnız okunur. Ölçümler senaryo parametreleridir; kaya/blok tespiti değildir.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resampleToRegularLocalGrid, toDemWindowInput } from '../public/js/geo/local-grid.js';
import { slopeStats } from '../public/js/geo/relief-metrics.js';
import { createDemWindow, buildFieldForWindow, localToCell, cellToLocal } from '../public/js/route/route-service.js';
import { planRouteVariants, routePreferenceParams, ROUTE_PREFERENCE_IDS } from '../public/js/route/route-compare.js';
import { WAYPOINTS } from '../public/js/config.js';
import { loadLegacyProvider, loadRawDtm, LEGACY_DIR } from './validate-ortho-registration-legacy.mjs';
import { routeTable, noDataFloatFromBits } from './legacy-analysis.mjs';

const DEFAULT_SAMPLE_STRIDE = 23; // global tutarlılık için her 23. hücre (hız)

// Eski sonuçlar (K3-10 öncesi düzenli çerçeve; stage-k3-legacy-analysis.md §3.2–3.3) karşılaştırma için.
export const OLD_FRAME_REFERENCE = Object.freeze({
  frameDxM: { 'WB1 (Sol 120)': 18.68, 'Roubion (Sol 164)': 23.44 },
  eastEdgeDxM: 40.66,
  roubionSlopePlannerDeg: 8.59, roubionSlopeSamplerDeg: 3.82,
  routes: { shortest: { lengthM: 729.660, maxSlopeDeg: 14.10 }, balanced: { lengthM: 729.660, maxSlopeDeg: 9.77 }, gentle: { lengthM: 731.088, maxSlopeDeg: 10.11 } },
});

function argVal(argv, name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} bir değer ister`);
  return v;
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

async function main() {
  const argv = process.argv.slice(2);
  const jsonPath = argVal(argv, '--json', null);
  const t0 = performance.now();

  const { provider, validation, canonicalAdapter } = await loadLegacyProvider();
  if (validation.status !== 'supported') throw new Error(`legacy doğrulaması supported değil: ${validation.status}`);
  const L = loadRawDtm(LEGACY_DIR);
  const adapter = provider.adapter; // köprü: örnekleyicinin kullandığı nesne
  const cellSizeM = Number(argVal(argv, '--cellSizeM', String(provider.cellSizeM)));
  if (!(cellSizeM > 0)) throw new Error('--cellSizeM pozitif olmalı');
  const { validMin, validMax } = L.meta.label;
  const noDataValue = noDataFloatFromBits(L.noDataBits);

  // Kaynak kapsamı (kanonik yerel metre) — köşe hücrelerinin merkez sınırları.
  const nw = adapter.pixelToLocal(L.row0 - 0.5, L.col0 - 0.5);
  const se = adapter.pixelToLocal(L.row0 + L.rows - 0.5, L.col0 + L.cols - 0.5);
  const bounds = {
    minXM: Math.min(nw.x, se.x), maxXM: Math.max(nw.x, se.x),
    minYM: Math.min(nw.y, se.y), maxYM: Math.max(nw.y, se.y),
  };

  // ---- ESKİ düzenli çerçeve (main.js initializeRouteWorker / render.js ile aynı alanlar)
  const oldWin = createDemWindow({
    elevation: provider.values, rows: L.rows, cols: L.cols, cellSizeM: provider.cellSizeM,
    nwXM: nw.x, nwYM: nw.y, noDataValue, validMin, validMax, adapter: canonicalAdapter,
  });

  // ---- YENİ düzenli ızgara (köprü örneklemesi, bilinear) ve nearest karşılaştırması
  const sampleElevation = (x, y) => provider.sampleElevation(x, y);
  const tR0 = performance.now();
  const resB = resampleToRegularLocalGrid({ sampleElevation, adapter, bounds, cellSizeM, interpolation: 'bilinear', noDataValue, validMin, validMax });
  const tRB = performance.now() - tR0;
  const tN0 = performance.now();
  const resN = resampleToRegularLocalGrid({ sampleElevation, adapter, bounds, cellSizeM, interpolation: 'nearest', noDataValue, validMin, validMax });
  const tRN = performance.now() - tN0;
  const newWin = createDemWindow(toDemWindowInput(resB, { adapter: canonicalAdapter }));
  const newWinNearest = createDemWindow(toDemWindowInput(resN, { adapter: canonicalAdapter }));
  const newParamsField = buildFieldForWindow(newWin, routePreferenceParams('balanced'));
  const newNearestField = buildFieldForWindow(newWinNearest, routePreferenceParams('balanced'));
  const oldParamsField = buildFieldForWindow(oldWin, routePreferenceParams('balanced'));

  // ---- uç noktaları
  const endpoints = [
    { label: 'WB1 (Sol 120)', ...canonicalAdapter.latLonToLocal(WAYPOINTS[0].latDeg, WAYPOINTS[0].lonDeg) },
    { label: 'Roubion (Sol 164)', ...canonicalAdapter.latLonToLocal(WAYPOINTS[1].latDeg, WAYPOINTS[1].lonDeg) },
  ];
  const endpointRows = endpoints.map((P) => {
    const sS = provider.sampleElevation(P.x, P.y);
    const sSlope = provider.sampleSlope(P.x, P.y);
    // yeni çerçeve: planlayıcının hücresi, değer bu hücre merkezinde örneklendi
    const cN = localToCell(newWin, P.x, P.y);
    const CN = cellToLocal(newWin, cN.row, cN.col);
    const iN = cN.row * newWin.cols + cN.col;
    const sAtCN = provider.sampleElevation(CN.xM, CN.yM);
    // eski çerçeve: planlayıcı hücresi, köprüdeki gerçek konumu
    const cO = localToCell(oldWin, P.x, P.y);
    const CO = cellToLocal(oldWin, cO.row, cO.col);
    const geoO = adapter.pixelToLocal(L.row0 + cO.row, L.col0 + cO.col);
    const iO = cO.row * oldWin.cols + cO.col;
    return {
      label: P.label,
      sampler: { elevationM: sS.value, slopeDeg: sSlope.value, cell: sS.cell, status: sS.status },
      newFrame: {
        cell: { row: cN.row, col: cN.col }, centreXM: CN.xM, centreYM: CN.yM,
        displacementM: Math.hypot(CN.xM - P.x, CN.yM - P.y),
        elevationM: resB.validMask[iN] ? resB.elevation[iN] : null,
        samplerAtCentreM: sAtCN.status === 'ok' ? sAtCN.value : null,
        elevationDiffAtCentreM: resB.validMask[iN] && sAtCN.status === 'ok' ? resB.elevation[iN] - sAtCN.value : null,
        slopeDeg: newParamsField.slopeDeg[iN],
        nearestGridSlopeDeg: newNearestField.slopeDeg[iN],
        cellIsCanonicalSamplerCell: sAtCN.cell ? (sAtCN.cell.row === sS.cell?.row && sAtCN.cell.col === sS.cell?.col) : null,
      },
      oldFrame: {
        cell: { row: cO.row, col: cO.col }, centreXM: CO.xM, centreYM: CO.yM,
        geoCell: { row: L.row0 + cO.row, col: L.col0 + cO.col },
        dxM: geoO.x - CO.xM, dyM: geoO.y - CO.yM,
        cellDiff: sS.cell ? { dRow: L.row0 + cO.row - sS.cell.row, dCol: L.col0 + cO.col - sS.cell.col } : null,
        elevationM: L.valid[iO] ? provider.values[iO] : null,
        slopeDeg: oldParamsField.slopeDeg[iO],
      },
    };
  });

  // ---- global tutarlılık: yeni ızgara (bilinear/nearest) vs örnekleyici, hücre merkezlerinde (seyrek alt örnek)
  const diffsB = [], diffsN = [];
  let nearestExactMismatch = 0, nearestCompared = 0;
  for (let row = 0; row < resB.rows; row += DEFAULT_SAMPLE_STRIDE) for (let col = 0; col < resB.cols; col += DEFAULT_SAMPLE_STRIDE) {
    const x = resB.nwXM + (col + 0.5) * resB.cellSizeM, y = resB.nwYM - (row + 0.5) * resB.cellSizeM;
    const s = provider.sampleElevation(x, y);
    const i = row * resB.cols + col;
    if (s.status !== 'ok' || !resB.validMask[i]) continue;
    diffsB.push(Math.abs(resB.elevation[i] - s.value));
    if (resN.validMask[i]) {
      diffsN.push(Math.abs(resN.elevation[i] - s.value));
      nearestCompared++;
      if (resN.elevation[i] !== s.value) nearestExactMismatch++;
    }
  }
  diffsB.sort((a, b) => a - b); diffsN.sort((a, b) => a - b);

  // ---- eğim: yeniden örneklenmiş ızgarada bilinear mi nearest mi daha yumuşak? (planlayıcı Horn, aynı stencil)
  const kNd = { noDataValue, validMin, validMax };
  const slopeOld = slopeStats({ elevation: provider.values, rows: L.rows, cols: L.cols, cellSizeM: provider.cellSizeM, ...kNd });
  const slopeNew = slopeStats({ elevation: resB.elevation, rows: resB.rows, cols: resB.cols, cellSizeM: resB.cellSizeM, noDataValue: resB.noDataValue, validMin, validMax });
  const slopeNear = slopeStats({ elevation: resN.elevation, rows: resN.rows, cols: resN.cols, cellSizeM: resN.cellSizeM, noDataValue: resN.noDataValue, validMin, validMax });

  // ---- rota: WB1 -> Roubion, eski ve yeni çerçeve
  const startLocal = { xM: endpoints[0].x, yM: endpoints[0].y }, endLocal = { xM: endpoints[1].x, yM: endpoints[1].y };
  const tRt0 = performance.now();
  const routeOld = routeTable(oldWin, planRouteVariants({ window: oldWin, startLocal, endLocal }));
  const routeNew = routeTable(newWin, planRouteVariants({ window: newWin, startLocal, endLocal }));
  const routeNearest = routeTable(newWinNearest, planRouteVariants({ window: newWinNearest, startLocal, endLocal }));
  const tRt = performance.now() - tRt0;

  const totalMs = performance.now() - t0;
  const result = {
    schema: 'marswalk.k3-10-local-grid-evidence.v1',
    status: 'senaryo ölçümü; kaya/blok tespiti değildir',
    provider: { id: provider.descriptor?.id ?? 'hirise-legacy-jezero-dtm', validation: validation.status, cellSizeM: provider.cellSizeM },
    cellSizeM,
    sourceBoundsM: bounds,
    oldWindow: { rows: oldWin.rows, cols: oldWin.cols, nwXM: oldWin.nwXM, nwYM: oldWin.nwYM },
    newWindow: { rows: newWin.rows, cols: newWin.cols, nwXM: newWin.nwXM, nwYM: newWin.nwYM, meta: resB.meta, stats: resB.stats, nearestStats: resN.stats },
    timingMs: { resampleBilinear: tRB, resampleNearest: tRN, routePlanning: tRt, total: totalMs },
    endpoints: endpointRows,
    globalConsistency: {
      stride: DEFAULT_SAMPLE_STRIDE,
      bilinearVsSamplerM: { n: diffsB.length, median: pct(diffsB, 0.5), p95: pct(diffsB, 0.95), max: diffsB[diffsB.length - 1] ?? null },
      nearestVsSamplerM: { n: diffsN.length, median: pct(diffsN, 0.5), p95: pct(diffsN, 0.95), max: diffsN[diffsN.length - 1] ?? null, exactMismatch: nearestExactMismatch, compared: nearestCompared },
    },
    slope: { old: slopeOld, newBilinear: slopeNew, newNearest: slopeNear },
    route: { old: routeOld, newBilinear: routeNew, newNearest: routeNearest },
    oldReference: OLD_FRAME_REFERENCE,
    caveats: [
      'Eğim tek hücre aralığıyla (cellSizeM) hesaplanır; uygulamadaki gibi (eksen-bağımsız değil).',
      'Yeni ızgarada bilinear değer hücre merkezinde; sampler en yakın hücredir: aralarındaki fark yarım hücre × eğim mertebesindedir.',
      'Bu betik uygulama kodunu değiştirmez; yalnız geo/local-grid.js yardımcısını ölçer.',
    ],
  };

  // ---- çıktı
  const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'yok' : v.toFixed(d));
  console.log('=== K3-10: legacy köprü -> düzenli yerel ızgara (bilinear) kanıtı ===');
  console.log(`Kaynak: ${L.rows}x${L.cols} legacy; yeni ızgara: ${newWin.rows}x${newWin.cols} @ ${cellSizeM} m; eski: ${oldWin.rows}x${oldWin.cols}`);
  console.log(`Kapsam (kanonik yerel m): x ${f(bounds.minXM, 2)}..${f(bounds.maxXM, 2)}, y ${f(bounds.minYM, 2)}..${f(bounds.maxYM, 2)}`);
  console.log(`Süre (ms): bilinear ${f(tRB, 0)}, nearest ${f(tRN, 0)}, rota ${f(tRt, 0)}, toplam ${f(totalMs, 0)}`);
  console.log('');
  console.log('-- Uç noktalar: örnekleyici | yeni ızgara | eski düzenli çerçeve');
  for (const ep of endpointRows) {
    const n = ep.newFrame, o = ep.oldFrame;
    console.log(`${ep.label}`);
    console.log(`  kot: örnekleyici ${f(ep.sampler.elevationM, 3)} m (hücre ${JSON.stringify(ep.sampler.cell)}) | yeni hücre ${f(n.elevationM, 3)} m, merkez=${f(n.centreXM, 2)},${f(n.centreYM, 2)} | fark (yeni hücre merkezi - örnekleyici@merkez) ${f(n.elevationDiffAtCentreM, 4)} m`);
    console.log(`  eğim: örnekleyici ${f(ep.sampler.slopeDeg, 3)}° | yeni bilinear planlayıcı ${f(n.slopeDeg, 3)}° | yeni nearest planlayıcı ${f(n.nearestGridSlopeDeg, 3)}° | eski planlayıcı ${f(o.slopeDeg, 3)}°`);
    console.log(`  çerçeve kayması: yeni |merkez - nokta| = ${f(n.displacementM, 3)} m (hücre ${JSON.stringify(n.cell)}); eski Δx ${f(o.dxM, 2)} m, Δy ${f(o.dyM, 2)} m (planlayıcı hücresi ${JSON.stringify(o.cell)} -> köprü ${JSON.stringify(o.geoCell)})`);
    console.log(`  hücre farkı (eski planlayıcı - örnekleyici): ${JSON.stringify(o.cellDiff)}; yeni hücre örnekleyiciyle aynı mı: ${n.cellIsCanonicalSamplerCell}`);
  }
  console.log('');
  console.log('-- Global tutarlılık (her 23. hücre; yalnız geçerli ikililer)');
  console.log(`bilinear - örnekleyici (m): medyan ${f(result.globalConsistency.bilinearVsSamplerM.median, 4)}, p95 ${f(result.globalConsistency.bilinearVsSamplerM.p95, 4)}, maks ${f(result.globalConsistency.bilinearVsSamplerM.max, 4)} (n=${diffsB.length})`);
  console.log(`nearest  - örnekleyici (m): medyan ${f(result.globalConsistency.nearestVsSamplerM.median, 6)}, maks ${f(result.globalConsistency.nearestVsSamplerM.max, 6)}; tam eşleşmeyen ${nearestExactMismatch}/${nearestCompared}`);
  console.log('');
  console.log('-- Eğim dağılımı (planlayıcı Horn; P50/P90/P99/maks °)');
  for (const [k, s] of [['eski düzenli', slopeOld], ['yeni bilinear', slopeNew], ['yeni nearest', slopeNear]]) {
    console.log(`${k}: ${f(s.p50Deg)}/${f(s.p90Deg)}/${f(s.p99Deg)}/${f(s.maxDeg)}, hesaplanan hücre ${s.computedCount}`);
  }
  console.log('');
  console.log('-- WB1 -> Roubion tercihleri (uzunluk m | maks eğim planlayıcı ° | min puan | >5° payı %)');
  console.log('   sütunlar: eski düzenli | yeni bilinear | yeni nearest | belge (eski)');
  for (const id of ROUTE_PREFERENCE_IDS) {
    const a = routeOld.perPreference[id], b = routeNew.perPreference[id], c = routeNearest.perPreference[id], ref = OLD_FRAME_REFERENCE.routes[id];
    const fmt = (r) => (r.status !== 'ok' ? `durum ${r.status}` : `${f(r.lengthM, 3)} | ${f(r.plannerMaxSlopeDeg, 2)}° | ${f(r.minScore, 1)} | %${f(r.shareAbove5DegPct, 1)}`);
    console.log(`${id}: ${fmt(a)}  ||  ${fmt(b)}  ||  ${fmt(c)}  ||  ${ref.lengthM} | ${ref.maxSlopeDeg}°`);
  }
  console.log('');
  if (jsonPath) {
    fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`Yazıldı: ${jsonPath}`);
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  });
}
