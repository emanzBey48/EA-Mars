# Marswalk MVP — Interplanetary Survival Guide: Martian Map

Kullanıcı kontrollü, kısa (60–90 s) bir Jezero yüzey keşif simülasyonu. Astronotu klavyeyle Sol 120 / WB1
waypoint’inden Sol 164 / Roubion waypoint’ine yürütürsünüz. **Mars fizik motoru, canlı NASA telemetrisi veya
güvenlik/karar destek aracı değildir.**

## Çalıştırma

Gereksinim: Node.js ≥ 20 (testler ve tarayıcı duman testi için ≥ 22). npm paketi kurulmaz; bağımlılık yoktur.

```powershell
cd "C:\Users\Erdem\OneDrive\Desktop\nasa space apps\Sim"
npm run prepare-data   # üst klasördeki DTM’den (salt okunur) data/ altına ~7.5 MB pencere çıkarır; bir kez yeterli
npm start              # http://127.0.0.1:8080/  (PORT ortam değişkeniyle değiştirilebilir)
npm test               # node:test birim testleri
npm run smoke          # isteğe bağlı: yerel Edge/Chrome ile başsız uçtan uca kontrol, ekran görüntüleri test-output/
```

`prepare-data` çalıştırılmamışsa uygulama yine açılır ve hareket çalışır; DTM’ye bağlı göstergeler
“Kullanılamıyor” durumunu gösterir. Çalışma anında internet veya PLACES dosyası gerekmez.

## Kontroller

- **2D:** WASD / ok tuşları hareket eder; P veya Space duraklatır/devam ettirir.
- **3D:** WASD / ok tuşları kamera yönüne göre hareket eder; Space küçük bir simülasyon sıçraması yapar; P duraklatır/devam ettirir. Sahneye tıklamak fare bakışını açar; Esc fare kilidini bırakır.
- **Her iki görünümde:** R yeniden başlatır; + / − / fare tekerleği yalnız görünümü yakınlaştırır.

3D görünümünü doğrudan açmak için sunucuyu başlattıktan sonra `http://127.0.0.1:8080/?view=3d` adresini kullanın. Bu seçim, doğrulanmış HiRISE DTM ve WebGL2 kullanılabilir, başlangıç konumunda kot biliniyorsa uygulanır; aksi durumda 2D görünüm açık kalır.

## Yapı

| Dosya | Görev |
|---|---|
| `public/js/config.js` | Senaryo değerleri (hız, zaman ölçeği, koridor ±10 m), waypointler, harita çerçevesi, kaynaklar |
| `public/js/geo/geo.js` | Tek dünya↔piksel adaptörü: equirectangular projeksiyon, PDS grid, yerel metre düzlemi, segment uzaklığı, saf 3×3 Horn gradyan/eğim yardımcısı (`horn3x3Gradient`) |
| `public/js/surface/layers.js` | Biçimden bağımsız katman ve `SurfaceProvider` sınırı (`GridElevationLayer`, `UnavailableLayer`): `sampleElevation(xM,yM)`, `sampleSlope(xM,yM)`, `sampleSurface(xM,yM)`, açık durumlar (`ok`, `no_data`, `out_of_bounds`, `unavailable`, `invalid`) |
| `public/js/surface/registry.js` | Katman manifest sözleşmesi, alan bazlı metadata doğrulayıcı (`validateLayerManifest`: `supported`, `needs_review`, `unavailable`, `invalid`) ve `SurfaceProviderRegistry` kayıt/seçim/fallback fabrikası |
| `public/js/simulation/sim.js` | Oyuncu, senaryo saati, duraklatma/yeniden başlatma, ilerleme, sapma ve derin dondurulmuş kare sözleşmesi (`createWorldSnapshot`, `deepFreeze`) |
| `public/js/view/render.js` | Saf kanvas çizimi: yalnız değiştirilemez `snapshot` (`WorldSnapshot`), `camera` ve hazırlanmış `terrain` varlığıyla çalışır; canlı `sim`/`layer`/`adapter` almaz ve raster örneklemesi ya da rota matematiği yapmaz |
| `public/js/input/input.js` | Klavye, fare tekerleği ve kontrol butonları/koridor girdisi bağlama (`bindControls`) |
| `public/js/view/hud.js` | Statik bilgi kartları, katman panelleri ve yalnız `WorldSnapshot` tüketen canlı HUD/uyarı banner güncellemeleri (`createHud`; DTM örneklemesi veya simülasyon kuralı içermez) |
| `public/js/main.js` | Uygulama koordinatörü (composition root): her karede `SurfaceProvider` ile örnekleme yapıp tek bir değiştirilemez `WorldSnapshot` üretir ve hem `render` hem `hud`’a verir |
| `scripts/extract-dtm.mjs` | PDS3 etiketini ayrıştırır, doğrular, DTM penceresini çıkarır, JP2 GeoTIFF başlığını inceler, rota kontrolü |
| `scripts/smoke-e2e.mjs` | DevTools protokolüyle gerçek tuş basışlı kabul testi (normal çalıştırmada `window.marswalk` olmadığını doğrular, ardından `?debug=1` ile testleri yürütür) |
| `server.mjs` | Node standart kütüphanesiyle statik sunucu (127.0.0.1) |

## Mevcut 3D viewer ve first-person dilimi

Mevcut kaynakta 2D Canvas MVP'ye ek olarak WebGL2 terrain viewer, göz hizası first-person kamera ve CPU mesh builder bulunur. FPS burada keşif kamerası/kontrolüdür; shooter değildir. Başlangıç verisi doğrulanmış yerel HiRISE DTM fixture'ıdır; yeni veri seti gerekmez.

- **Mevcut 3D paket:** `public/js/view/3d/renderer.js`, `camera.js`, `terrain-mesh.js`, `astronaut-rig.js`, `marker-mesh.js` ve `main.js` entegrasyonu. `marker-mesh.js`, Sol 120 / WB1 ve Sol 164 / Roubion beacon’larıyla basitleştirilmiş rota zemin kılavuzlarını ve senaryo koridoru işaretçilerini üretir; renderer bunları 3D sahnede çizer. Bu rota gerçek Perseverance/PLACES traverse geometrisi değildir ve koridor güvenlik sınırı değildir. Renderer ayrıca rig'in değişmez parça şablonunu ve snapshot'tan üretilen pozu WebGL2'ye aktarır.
- **Mesh sözleşmesi:** `positions: Float32Array` (local X/Y metre ve sunum Z), `normals: Float32Array`, `indices: Uint32Array`, özgün Mars 2000 kotu için `sourceElevationsM`, yerel bounds ve kaynak/datum/çözünürlük ile valid/atlanan hücre sayısını içeren metadata. Görsel Z, `referenceElevationM` ve `verticalScale` ile hesaplanır; kaynak `zM` değişmez.
- **No-data/fallback:** No-data/invalid köşeli quad üçgenlenmez; sıfırla doldurma veya boşluk üzerinden köprü kurma yoktur. 2D HiRISE fallback korunur. Stage 9 runtime kabulinde 2D↔3D, WebGL/mesh fallback, unknown elevation ve ilk mesh açılış maliyeti tarayıcıda doğrulanmalı.
- **Kontroller:** 3D’de WASD/oklar kamera yönüne göre hareket eder; sahneye tıklamak fare bakışını pointer lock ile açar, Esc bırakır; Space kısa simülasyon sıçramasını, P duraklatmayı yapar. 2D’de Space duraklat/devam olarak kalır. R yeniden başlatır.
- **Hareket modeli:** 3D’de simülasyon yatay hızını senaryo seçimi `walkSpeedMps` belirler; dikey ivme NASA Planet Compare’ın yuvarlatılmış Mars yüzey yerçekimi referansı 3.71 m/s²’dir. Bu küresel referanstır, Jezero yerel ölçümü veya tam insan/suit fiziği değildir. Space sıçrama girdisi oyun varsayımıdır; atmosfer sürüklemesi yoktur.
- **Yüzey teması ve bilinmeyen kot:** Simülasyon geçerli DTM örneğinde ayak temasını kotla izler. `astronaut.zM` yalnızca o an örneklenen Mars 2000 yüzey kotudur ve örnek geçersiz/bilinmiyorsa `null` kalır. Simüle edilmiş gövde dünya-Z konumu ve hareket durumu ayrı snapshot alanlarıdır. No-data/out-of-bounds durumunda `grounded=false`, HUD yüzey temasının doğrulanamadığını gösterir; varsa önceki dünya-Z referansı yalnız hareket pozunu sürdürür, güncel zemin/kot yerine kullanılmaz.
- **Rig için hareket snapshot API’si:** `snapshot.astronaut.movement = { timeS, horizontalSpeedMps, verticalSpeedMps, grounded, airborne, phase, groundContactStatus }`. `timeS` senaryo saatidir; hızlar simülasyon zamanı saniyesi başına metre cinsindedir. `groundContactStatus`, o karedeki DTM örnek durumunu; `airborne`, yalnız başlatılmış bir sıçrama/aktif düşey hareket izini belirtir. `bodyWorldZM` bedenin dünya-Z pozudur ve `zM` arşiv yüzey değeriyle karıştırılmamalıdır.
- **Astronot rig sunumu:** `ASTRONAUT_RIG` yerel X sağ/sol, Y derinlik, Z yukarı eksenlerini ve `-Y` ileri yönünü tanımlar; `forwardHeadingOffsetRad` simülasyon heading’ine eklenir. `poseAstronautRig(movement)` saf ve deterministik poz döndürür; parça `size/center/pivot`, eklem dönüşü ve root pozları renderer’da uygulanır. Dikey sunum ölçeği mesh `displayConfig.verticalScale` değerini izler. First-person’de torso ve kollar alt kadrajda view-model olarak çizilir; bu çizim ikinci fiziksel gövde konumu veya suit biyomekaniği değildir.
- **Bilinmeyen temas animasyonu:** `groundContactStatus !== 'ok'` iken rig `grounded=false` değerinden tek başına airborne sonucu çıkarmaz; temas bilinmiyorsa sabit `unknown` nötr poz kullanır. Yalnız `airborne=true` sıçrama izi airborne pozunu sürdürür; bilinmeyen temas tek başına yerçekimi düşüşü başlatmaz. Bu durumda retained kamera pozu için first-person kollar/gövde kalabilir, tam dünya rig’i gizlenir. HUD yüzey kotunun bilinmediğini ayrıca gösterir; retained `bodyWorldZM` güncel zemin diye sunulmaz.
- **Modül sınırı:** Hareket kuralları `simulation/`, klavye/fare olayları `input/`, FPS kamera matematiği `view/3d/camera.js` içinde kalır; `main.js` yüzey örneğini enjekte edip snapshot ve renderer’ı birleştirir. 2D ve WebGL2→2D fallback korunur.

**Renderer rig entegrasyonu:** first-person suit torso/kolları alt-kadraj view-model olarak render edilir. Smoke rig parça çizimini, merkezlerin kamera frustum’unda kalmasını, heading ekseni hizasını, hareket kaynaklı gait’i, pause freeze’i, bilinmeyen temas ile aktif jump ayrımını ve 2D fallback’i kontrol eder; screenshot’ta torso/kolların gerçek kadrajı görsel olarak ayrıca incelendi. `npm test` 18/18 ve `npm run smoke` 32/32 geçti. Rig unknown-contact pozu fiziksel grounded/airborne alanlarını değiştirmez.

**Stage 9 + 10 doğrulama (13 Kasım 2026):** Stage 9 sonrası önceki birleşik HEAD’de `npm test` 16/16 ve `npm run smoke` 28/28 geçti. Renderer rig entegrasyonundan sonra güncel doğrulama `npm test` 18/18 ve `npm run smoke` 32/32’dir.

**Ortogörüntü uyarısı:** JPEG 2000 çözücü olmadığı için `ESP_046060_1985_RED_C_01_ORTHO.JP2` uygulamada gösterilmez; mevcut zemin DTM'den türetilmiş hillshade + kot renklendirmesidir, orto değildir. Decoder/lisans ve JP2 `PixelIsArea` ile PDS piksel merkezi arasındaki yaklaşık yarım-piksel hizalama sorunu ayrı, bloke etmeyen iştir; hizalama doğrulanmadan orto overlay'i yapılmamalıdır.

Görev kabul ölçütleri ve daha ayrıntılı render/snapshot sözleşmesi depo kökündeki `yapay zeka icin/road map.md` ve `AGENTS.md` dosyalarındadır.

## Koordinatlar ve veri kararları

- **Yerel düzlem:** x doğu, y kuzey, metre; orijin Sol 120 / WB1. Düzlem, DTM etiketindeki equirectangular
  harita düzleminin orijine kaydırılmış hâlidir (küre R = 3394.8398 km, merkez meridyen 77.44°E, standart enlem 15°).
  Bu projeksiyonda ölçek 15°’de doğrudur; ~18.4°K’de doğu-batı mesafeleri ≈ %1.8 fazla, kuzey-güney mesafeleri doğrudur.
- **Piksel dönüşümü (PDS3 kuralı):** 1 tabanlı LINE/SAMPLE piksel merkezidir;
  `X = (SAMPLE − SAMPLE_PROJECTION_OFFSET)·MAP_SCALE`, `Y = (LINE_PROJECTION_OFFSET − LINE)·MAP_SCALE`.
  Kodda 0 tabanlı `(row, col)` = `(LINE−1, SAMPLE−1)`; hücre merkezleri tam sayılardır, satır güneye artar.
- **JP2 karşılaştırması:** JP2 GeoTIFF anahtarları aynı CRS’i ve boyutu bildiriyor; ancak `PixelIsArea` olarak okunduğunda
  JP2 piksel merkezleri DTM etiketine göre 0.5 sütun doğuda / 0.5 satır güneyde (≈0.71 m). Örneklenen katman DTM olduğu için
  DTM etiketi esas alındı; bu yarım piksellik kayıt belirsizliği arayüzde belirtiliyor.
- **Doğrulama:** Waypointler (6415, 3742) ve (7083, 3870) hücrelerine düşüyor; çizgi 686.204 m; 681 örneğin tamamı geçerli,
  kot −2588.546…−2568.352 m, eğim ort. 4.691°, P90 8.36°, maks. 18.904° (`data/dtm_subset.json` → `routeCheck`).
- **No-data:** `MISSING_CONSTANT 16#FF7FFFFB#` tam bit deseniyle → `no_data`; `VALID_MINIMUM/MAXIMUM` dışı → `invalid`.
  Asla 0 ile değiştirilmez. Eğim: 3×3 Horn; dokuz hücreden biri geçersizse değer üretilmez.
- **Kapsam:** Tarayıcıya yalnız rota çevresindeki pencere (satır 5915–7583, sütun 3242–4370) yüklenir; dışı
  `out_of_bounds` (“yüklenen alt kümenin dışında”) olarak raporlanır.
- **Ortogörüntü devre dışı:** Bu bağımlılıksız yığında JPEG 2000 kod çözücü yok. Zemin, DTM’den türetilmiş gölgeli kabartma +
  kot renklendirmesidir ve ortogörüntü olarak adlandırılmaz.
- **Yarışma verisi ve manifest doğrulaması:** Şu anda `Sim/data` içinde yalnızca doğrulanmış yerel HiRISE DTM fixture’ı vardır;
  organizatörün yarışma verisi henüz mevcut değildir. Yeni bir katman eklendiğinde `public/js/surface/registry.js` içindeki
  `validateLayerManifest` CRS, birim, düşey datum, piksel kayıt kuralı (`CENTER_PDS_1BASED`), ölçek/ofset ve no-data alanlarını
  alan bazında denetler (`supported`, `needs_review`, `unavailable`, `invalid`). Belirsiz veya uyumsuz katmanlar sessizce
  örneklenmez ve kot asla `0` ile doldurulmaz; uygulama doğrulanmış HiRISE sağlayıcısına veya `UnavailableLayer` durumuna geri dönerek oynanabilir kalır.

## Değer etiketleri

- **Arşiv ürünü:** HiRISE DTM `DTEEC_045994_1985_046060_1985_U01` (m, Mars 2000 datumu), ortho `ESP_046060_1985_RED_C_01_ORTHO` (kullanılamıyor).
- **Hesaplanan:** oyuncu konumunda en yakın hücre kotu; 3×3 Horn eğimi.
- **Senaryo/UI:** konum, 1.2 m/s × 8 zaman hızlandırma, senaryo saati, ilerleme, sapma, ±10 m koridor.
- **Rota kökeni:** İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değil (PLACES kullanılmadı).

## Kaynaklar

- HiRISE Jezero ürünü: https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985
- HiRISE RDR/DTM SIS: https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF
- Mars 2020 Initial Reports: https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf
- PLACES: https://pds-geosciences.wustl.edu/missions/mars2020/places.htm

Görüntü/veri: NASA/JPL/University of Arizona (HiRISE).
