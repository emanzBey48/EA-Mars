// Stage K3-10 — legacy DTM (koordinat köprüsü) için planlayıcı/minimap ızgarası: saf yardımcılar.
//
// Legacy PDS3 DTM, örnekleyicide coğrafi köprüyle okunur (doğu-batı ~1,0457 m, kuzey-güney ~1,0101 m hücre). Planlayıcı
// ve minimap ise düzenli ızgara varsayar; bu yüzden aynı yerel (x,y) için iki farklı hücre kullanılıyordu. Bu modül
// köprü kaynağını BİR KEZ düzenli yerel ızgaraya (1,00966 m) yeniden örnekler; planlayıcı ve minimap bu ızgarayı kullanır.
// Kip `nearest`: hücre merkezi değeri örnekleyicinin o noktadaki değeriyle birebir aynıdır.
//
// Saf modül: DOM, ağ, worker veya uygulama state'i yok. Çağıran (main.js) layer nesnesini ve sonucu yönetir.
// USGS / yerli (native) düzenli kanonik yol bu modülün kapsamı dışındadır: shouldRegrid false döner ve ızgara üretilmez.

import { noDataFloat32FromBits, resampleToRegularLocalGrid, toDemWindowInput } from '../geo/local-grid.js';

/** surface/registry.js legacy girişinin descriptor kimliği (aynı metin; test bunu kaynak metninde doğrular). */
export const LEGACY_DTM_DESCRIPTOR_ID = 'hirise-legacy-jezero-dtm';
export const ROUTE_GRID_INTERPOLATION = 'nearest';
export const ROUTE_GRID_MODE = Object.freeze({
  NATIVE: 'native',
  LEGACY_REGRIDDED: 'legacy-bridge-regridded',
  LEGACY_FALLBACK: 'legacy-bridge-native-fallback',
});

/**
 * true yalnız legacy köprü DTM'i için: kimlik eşleşir VE sağlayıcı köprü kontrol noktası taşır (registry.js,
 * `quality.transformControls`). USGS / native descriptor'ı false döner.
 */
export function shouldRegrid(descriptor) {
  const controls = descriptor?.quality?.transformControls;
  return descriptor?.id === LEGACY_DTM_DESCRIPTOR_ID && Array.isArray(controls) && controls.length > 0;
}

/**
 * Yüklenen pencerenin yerel metre sınırları (kaynak pencere kenarları, hücre merkezi değil). Dört köşenin
 * min/maks değeri alınır; köprü dönük olsa bile kapsam kutusu tüm pencereyi kapsar.
 */
export function legacyWindowBoundsM(layer) {
  const { adapter, rowOffset, colOffset, rows, cols } = layer;
  const r0 = rowOffset - 0.5, r1 = rowOffset + rows - 0.5;
  const c0 = colOffset - 0.5, c1 = colOffset + cols - 0.5;
  const corners = [[r0, c0], [r0, c1], [r1, c0], [r1, c1]].map(([r, c]) => adapter.pixelToLocal(r, c));
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  return {
    minXM: Math.min(...xs), maxXM: Math.max(...xs),
    minYM: Math.min(...ys), maxYM: Math.max(...ys),
  };
}

/**
 * Planlayıcı/minimap ızgarasını hazırlar. Legacy değilse { mode: 'native', grid: null } döner (örnekleme yapılmaz).
 * Legacy ise düzenli ızgarayı BİR KEZ üretir; süre (ms) `resampleMs` ile raporlanır.
 * Hata fırlatabilir; çağıran bunu açık bir yedek moduna çevirmelidir (sessizce yutulmaz).
 */
export function prepareRouteGrid(layer, { interpolation = ROUTE_GRID_INTERPOLATION, now = () => performance.now() } = {}) {
  if (!shouldRegrid(layer?.descriptor)) {
    return { mode: ROUTE_GRID_MODE.NATIVE, interpolation: null, grid: null, resampleMs: null };
  }
  const bounds = legacyWindowBoundsM(layer);
  const hasRange = Number.isFinite(layer.validMin) && Number.isFinite(layer.validMax);
  const t0 = now();
  const grid = resampleToRegularLocalGrid({
    sampleElevation: (xM, yM) => layer.sampleElevation(xM, yM),
    adapter: layer.adapter,
    bounds,
    cellSizeM: layer.cellSizeM,
    interpolation,
    noDataValue: noDataFloat32FromBits(layer.noDataBits),
    ...(hasRange ? { validMin: layer.validMin, validMax: layer.validMax } : {}),
  });
  return { mode: ROUTE_GRID_MODE.LEGACY_REGRIDDED, interpolation, grid, resampleMs: now() - t0 };
}

/**
 * `init-window` mesajının `window` gövdesi (route-service `createDemWindow` sözleşmesi).
 * elevation KOPYASIDIR: worker'a transfer edilen tampon, minimap'in kullandığı grid'i ayrıca bozmaz.
 * coverageMask BİLEREK verilmez: no-data hücreler noDataValue ile NO_DATA olarak kalır (yerli/USGS yoluyla aynı
 * etiket). Kaynak kapsamı dışı kenar hücreleri de aynı no-data değerini taşır; 0'a çevrilmez.
 */
export function buildPlannerWindowInput(grid) {
  const { coverageMask, ...input } = toDemWindowInput(grid);
  return { ...input, elevation: new Float32Array(grid.elevation) };
}
