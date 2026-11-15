# Stage 33A — Rota şeridi (route ribbon) geometrisi: denetim notu

Kapsam: `planRoute` yolundan zemine oturan parlak şerit mesh'i üreten saf CPU modülü. Render/shader Aşama 33B'dedir.
"Planlama göstergesi — güvenli rota değildir" etiketi `meta.note` içinde taşınır.

## Dosyalar

- `public/js/view/3d/route-ribbon.js` (yeni, saf: DOM/GL/ağ/dosya yok)
- `test/route-ribbon.test.mjs` (yeni, 20 test)
- Değişmedi: `main.js`, `config.js`, `simulation/`, `surface/`, `input/`, mevcut `view/` dosyaları, `route/`.

## API (33B için)

```js
import { buildRouteRibbon } from '../public/js/view/3d/route-ribbon.js';

const ribbon = buildRouteRibbon({
  path: route.path,                 // planRoute: {xM, yM, row, col} (yerel metre)
  segments: route.segments,         // segments[i] = path[i] -> path[i+1]; skor yoksa null
  sampleElevation: (x, y) => layer.sampleElevation(x, y), // {status, value}; no-data asla 0 olmaz
  displayConfig: { referenceElevationM, verticalScale },  // display Z = (zM - ref) * scale + groundOffset
  widthM: 1.2, groundOffsetM: 0.06, sampleSpacingM: 1.0,  // görsel/senaryo parametreleri
  cameraXY: { xM, yM }, nearM: 20, farM: 200,             // yalnız kamera verilirse mesafe kuralı açılır
  maxVertices: 200000,
});
// ribbon.positions (Float32, display), normals, uvs (u = birikimli metre, v = 0 sol / 0.5 köşe / 1 sağ),
// sourceElevationsM (zM), indices (Uint32), bounds (yerel), runs[{startIndex, vertexCount, indexStart,
// indexCount, lengthM, startU, endU, segmentScores}], counters, meta (dondurulmuş).
```

## Temel kararlar

- Her segment eşit parçaya bölünür (kamera yoksa); yol ters çevrilince örnek kümesi aynı kalır.
- Her kenar noktası (sol/sağ) kendi XY'sinde örneklenir; köşe z'si yamaca oturur, `groundOffsetM` display metresi olarak eklenir.
- Bilinmeyen kot (`no_data`, `invalid`, `out_of_bounds`, `unavailable`) o kesiti geçersiz kılar; bağlantı kırılır, boşluk üzerinde üçgen kurulmaz.
- Keskin köşe (> `maxSegmentTurnRad`, varsayılan 60°): kesik (bevel) birleşim, yalnız dış tarafta üçgen; iç tarafta çakışma olur ama üçgen ters dönmez.
- Yumuşak köşe: miter, `1/cos(θ/2)` en fazla 2 ile sınırlı.
- Her üçgenin XY alanı pozitif olmak zorunda; değilse bağlantı kırılır ve `degenerate` sayılır.
- `maxVertices` aşılırsa örnekleme aralığı ikiye katlanır (en fazla 12 kez); hâlâ aşılıyorsa tam run düşürülür (`cappedRuns`). Hata üretilmez.
- Segment skorları yalnız `segments` yolla hizalıysa taşınır; yoksa `null` (uydurma yok).

## Test sonuçları

- `node --test test/route-ribbon.test.mjs`: 20/20 geçti.
- `node --test "test/*.test.mjs"` (paket): 348/348 geçti (başlangıç 328 + 20 yeni).

## Gerçek veri ölçümü (WB1 -> Roubion, `Sim/data/dtm_subset.f32`, scratchpad betiği)

Planner: `status ok`, `eva_walkability`, 676 nokta, 675 segment, süre ~300 ms.

| Ölçüm | Değer |
|---|---|
| Planner `stats.lengthM` | 730,5046 m |
| Polyline (bağımsız hesap) | 730,5046 m (fark 0) |
| Şerit vertex / üçgen / index | 1620 / 1618 / 4854 |
| Kesit (sample) / beklenen (1 m, bağımsız sayım) | 810 / 810 |
| Run sayısı / toplam run uzunluğu | 1 / 730,5046 m (fark 0) |
| Süre (kesit üretimi, ısıtılmış) | ~3–6 ms |
| Tüm vertex'lerde yeniden örnekleme | 1620/1620 `ok`, kaynak z farkı 0 |
| Display z farkı (×3 ölçek, bağımsız) | en fazla 1,4e-6 m |
| Üçgen alanı toplamı / bant beklentisi | 876,607 / 876,606 m² (oran 1,0000018) |
| Pozitif olmayan alanlı üçgen | 0 |
| Normal birim hatası / en küçük normal z | 3,7e-8 / 0,817 |
| Ölçek 1 ile ×3 karşılaştırma | aynı index ve aynı kaynak z |

Gerçek no-data deliği (yarıçap 6 m, yol üzerinde ~300 m):
- 2 run: 294,1 m + 423,7 m (toplam 717,8 m; kırılan kısım ~12,7 m).
- `skippedUnknown` 34, `breaks` 18, deliğe değen üçgen 0, sıfır/NaN kot 0.

Kamera varyantı (WB1 merkezli, yakın 20 m, uzak 200 m): 1364 vertex, 682 kesit. Düz kesitlerde genişlik 1,2 m'den 3,0 m'ye monoton artıyor (8 düz kesit; bu rota 1 m ızgarada neredeyse her kesit köşe).

## Açık noktalar / bilinen sınırlar

1. Miter genişlemesi: köşe kesitlerinde raylar `1/cos(θ/2)` kadar açılır. Bu rotada en fazla 1,082 kat (yakın geometriyle aynı mesafede). "Genişlik monotonluğu" yalnız düz kesitlerde ve sentetik testte kesin; 33B'de köşe genişlemesi kabul edilmeli veya nominal genişlikte kesilmeli.
2. Gerçek veri penceresinde no-data hücresi yok (1 902 260 / 1 902 260 geçerli). Gerçek no-data davranışı yalnız rota üzerine yapay delik konularak sınandı.
3. `alongM` (opsiyonel) üretilmedi; u değeri `uvs` içinde zaten birikimli metre.
4. Kamera mesafe kuralı segmenti adım adım yürür; bu yüzden kamera verildiğinde yön simetrisi garanti değildir (kamera yoksa garantilidir).
5. Ölçümde örnekleyici en yakın hücre (window) semantiğindedir; `GridElevationLayer` ile birebir karşılaştırma yapılmadı.
6. Tarayıcıda görsel doğrulama (şerit parlaklığı, yakın alan okunabilirliği) yapılmadı; bu 33B'nin kabul ölçütü.

## Çalıştırılmayanlar

- Tarayıcı smoke/görsel doğrulama, `npm run smoke`.
- git commit/push (istek üzerine yapılmadı; `git` PATH'te bulunamadı).
- Repoya yazılan scratch betiği yok; ölçüm betiği scratchpad'de.
