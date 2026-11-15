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

### Jüri ve Demo Modu (60–90 Saniyelik Örnek Senaryo)

Jüriye ve kullanıcılara 60–90 saniyede etkileyici, temiz ve odaklanmış bir sunum yapmak için:
```bash
npm start
# Tarayıcıda aç: http://127.0.0.1:8080/?demo=1
```
Bu komutla uygulama doğrudan **Sunum Modu**'nda açılır:
- Sol 120 (WB1) → Sol 164 (Roubion) A* EVA yürünebilirlik rotası otomatik hesaplanır ve gösterilir.
- 1× gerçek dikey ölçekte (1:1 bilimsel kot farkı) HiRISE ortomozaik dokusu üzerinde 3D birinci şahıs görünüme geçilir.
- Ekranın sol üstünde en kritik telemetriyi (Konum, İlerleme, Kot, Eğim, Yürünebilirlik Göstergesi, Saat) içeren şık yarı-şeffaf sunum kapsülü gösterilir.
- Turkuaz kılavuz şerit izlenerek Sol 164'e varıldığında `#arrived-banner` başarı rozeti şık bir biçimde belirir.
- Sunum modundan çıkmak için `Esc` tuşuna basabilir veya `✕ Kapat` butonuna tıklayabilirsiniz.

## Sunulan Temel Özellikler

1. **HiRISE 1 m DTM Arazi Tabanı:** USGS Mars 2020 TRN 1 m kot modeli ve Horn 3×3 gradyanıyla türetilen anlık eğim.
2. **HiRISE Kontrollü Ortomozaik:** WMTS z17 (0.318 m/px) ve z14 (2.544 m/px) albedo dokuları; Hibrit / Orto / Hillshade kaplama modları. Bu WMTS örnekleme aralığı 25 cm/piksel değildir.
3. **A* EVA Yürünebilirlik Planlayıcısı:** Çok kriterli maliyet fonksiyonuyla (eğim, pürüzlülük, veri geçerliliği) insansı EVA rotası ve minimap ısı haritası. (Planlama göstergesi — güvenli rota sertifikası değildir.)
4. **1× Gerçek Bilimsel Dikey Ölçek:** Varsayılan 1:1 kot farkı, dinamik ölçek seçici (1×, 2×, 3×) ve astronot rig oranlarının 1:1 kilitlenmesi.
5. **USGS SIM 3464 Jeoloji Haritası:** 1:75.000 ölçekli formasyon sınırları, haritalanmış kontağa olan anlık mesafe ve belirsizlik bildirimleri.
6. **Mars Yüzey Yerçekimi Zıplama Balistiği:** 3.71 m/s² yerçekimi altında ~1.3 s uçuş, havada momentum korunumu, inişte yumuşak kamera esnemesi (landing dip).
7. **Perseverance Ham Fotoğraf Arşivi:** Sol 120 ve Sol 164 duraklarında Navcam/Hazcam/Mastcam-Z fotoğraflarıyla birinci şahıs ufuk yönelimi.
8. **Sağlam 2D Fallback:** WebGL2 desteği bulunmadığında veya kullanıcı 2D'yi seçtiğinde tüm katmanlar ve rota planlaması 2D Canvas üzerinde kesintisiz çalışır.
9. **Mars global minimap bağlamı:** Viking MDIM 2.1 renkli karo piramidi, Jezero çevresinde 232 m/piksel kesit ve yakın ölçekte HiRISE DTM hillshade katmanını gösterir. Viking mozaik kot verisi veya ortogörüntü değildir; lisans manifestte belirtilmemiştir.
10. **Otomatik EVA rota sunumu:** Başlangıç ve bitiş noktalarını minimap'te seçip EVA yürünebilirlik rotasını planladıktan sonra başlangıç ayarlarından otomatik takip açılabilir. Astronot planlı polylinedaki hücreleri sırayla izler; tempo, yerel DTM eğimine göre açıkça senaryo varsayımı olarak değişir. Çalışma sırasında sağ alttaki kaydırıcı simülasyon zamanını 0,5×–10× aralığında ayarlar. Bu özellik gerçek astronot biyomekaniği veya operasyonel otonomi değildir.
11. **Süre kısıtlı rota denemesi:** Otomatik sürüşte sağ alttan kalan süreyi dakika olarak girip rotayı anlık konumdan yeniden planlayabilirsiniz. Planlayıcı, 1 m DTM EVA göstergesinin ortak ölçeğinde farklı maliyet ağırlıklı döngüsüz adayları karşılaştırır; istenen süreye sığanlar arasından en yüksek minimum/ortalama EVA göstergeli adayı seçer. Süre mümkün değilse kask HUD'ında kısa, sönümlü uyarı çıkar ve mevcut rota korunur. Bu EVA göstergesi güvenlik veya gerçek astronot güvenilirliği ölçümü değildir; kayalar, regolit, görüş ve suit/insan etkenleri modellenmez.

### Viking MDIM 2.1 yerel karo paketi

Uygulama, `data/viking-mdim/manifest.json` ve küçük `tiles/` / Jezero bölgesel PNG çıktılarını varsa kullanır. Çıktılar yoksa veya bir karo yüklenemezse global katman `unavailable` olur; yerel HiRISE minimap ve diğer uygulama akışları çalışmayı sürdürür. “Mars globali göster” düğmesi küresel görünümü açar; “Kapsama sığdır” Jezero DTM alanına döner. 232 m/piksel bölgesel mozaik yalnız renkli bağlam sağlar, yerel yürünebilirlik puanı üretmez.

12,7 GB kaynak `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` uygulamanın çalışması için gerekmez ve git'e eklenmez. Kaynağı hazırlamak gerekirse Sim içindeki git-ignore edilmiş `data-external/` klasöründe tutup ingest betiğine `--input` ile açıkça verin; üretilen küçük karo paketi `data/viking-mdim/` altına yazılır. `.gitignore` altındaki `data/*` kuralı da `data/` içindeki ham TIFF'i yok sayar; allowlist yalnız doğrulanmış DTM fixture'ları, orto karoları ve küçük bölgesel/global ürün çıktıları içindir.

Karo paketini bilerek yeniden üretmek için Sim klasöründe:

```powershell
node scripts/ingest-viking-mosaic.mjs --input data-external/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif --out data/viking-mdim
```

## Kontroller

- **2D:** WASD / ok tuşları hareket eder; P veya Space duraklatır/devam ettirir.
- **3D:** WASD / ok tuşları kamera yönüne göre hareket eder; Space küçük bir simülasyon sıçraması yapar; P duraklatır/devam ettirir. Sahneye tıklamak fare bakışını açar; Esc fare kilidini bırakır.
- **Her iki görünümde:** R yeniden başlatır; + / − / fare tekerleği yalnız görünümü yakınlaştırır.
- Otomatik sürüşte önce başlangıç/bitiş seçip **EVA yürünebilirlik rotasını planlayın**, ardından görev başlangıç ayarlarından otomatik takibi seçerek simülasyonu başlatın. Simülasyon sırasında ayarlar paneli gizlenir; sağ alttaki hız kaydırıcısı görünür. Durdurup ayarlara döndüğünüzde ayrıntılı panel geri gelir.
- Otomatik sürüşte **kalan süreyi (dk)** ayarlayıp **Süreye göre rotayı yenile** seçeneği her an kullanılabilir. Planlayıcı hesaplama sırasında astronotu kısa süre bekletir; döngü içeren yolları reddeder. Daha uzun süre verildiğinde yalnızca üretilen DTM adaylarının izin verdiği ölçüde daha uzun rotalar değerlendirilebilir; istenen varış süresi garanti edilmez.
- Eğim-tempo bağıntısı kaynaklı astronot yürüyüş verisi bulunmadığı için yalnızca görsel/senaryo ayarıdır; rotadaki DTM eğiminden türetilir ve UI'da etiketlenir. Mars atmosferi Jezero anlık ölçümünü ve suit/insan parametrelerini vermediğinden yürüyüş hızına atmosfer kuvveti eklenmez.

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

- **Yerel düzlem:** x doğu, y kuzey, metre; orijin Sol 120 / WB1. Düzlem, DTM mozaik başlığındaki equirectangular
  harita düzleminin orijine kaydırılmış hâlidir (küre R = 3396.190 km, merkez meridyen 0.0°E, standart enlem 0.0°, planetosentrik).
  Bu projeksiyonda ölçek ekvatorda (0°) doğrudur; ~18.4°K’de doğu-batı mesafeleri ≈ %5.4 fazla (1 / cos 18.4°), kuzey-güney mesafeleri doğrudur.
- **Piksel dönüşümü (GeoTIFF PixelIsArea kuralı):**
  Hücre merkezi (0 tabanlı satır/sütun):
  `X = 4577366.5 + col`, `Y = 1106617.5 - row`.
  Ters dönüşüm: `col = X - 4577366.5`, `row = 1106617.5 - Y`.
  Hücre indeksi: `Math.round(col)`, `Math.round(row)`.
- **Düşey datum:** Mars eşpotansiyel yüzeyi (MOLA areoid / DeltaGeoid; HRSC Level 5 ve CTX LVS DTM referanslı).
- **Doğrulama:** Waypointler (13647, 13423) ve (14322, 13557) hücrelerine düşüyor; çizgi 687.343 m; 681 örneğin tamamı geçerli,
  kot −2589.359…−2567.980 m, eğim ort. 4.446°, P90 8.003°, maks. 18.410° (`data/dtm_subset.json` → `routeCheck`).
- **No-data:** `MISSING_CONSTANT` `0xFF7FFFFB` tam 32-bit bit deseniyle → `no_data`; `VALID_MINIMUM/MAXIMUM` dışı → `invalid`.
  Asla 0 ile değiştirilmez. Eğim: 3×3 Horn; dokuz hücreden biri geçersizse değer üretilmez.
- **Kapsam:** Tarayıcıya yalnız rota çevresindeki pencere (satır 13147–14822, sütun 12923–14057, 1,902,260 hücre, ~7.6 MB) yüklenir; dışı
  `out_of_bounds` (“yüklenen alt kümenin dışında”) olarak raporlanır.
- **Ortogörüntü durumu:** Eski JP2 kullanıcı tarafından geçersiz bildirildi; bağımlılıksız yığında yeni doğrulanmış orto pakete henüz eklenmedi.
  Zemin, DTM’den türetilmiş gölgeli kabartma + kot renklendirmesidir ve ortogörüntü olarak adlandırılmaz.
- **Manifest doğrulaması:** `public/js/surface/registry.js` içindeki `validateLayerManifest` CRS, birim, düşey datum kanıtı,
  lisans/kullanım şartı, sayısal sınır kapsama ve piksel kayıt kuralını zorunlu `expectedFrame` parametresiyle alan bazında denetler (`supported`, `needs_review`, `unavailable`, `invalid`).
  Belirsiz veya uyumsuz katmanlar sessizce örneklenmez ve kot asla `0` ile doldurulmaz; geçersiz bildirilen eski IMG/JP2 fallback olarak seçilmez,
  doğrulanmış sağlayıcı yoksa katman açıkça `UnavailableLayer` durumunda kalır.

## Değer etiketleri

- **Arşiv ürünü:** USGS Mars 2020 TRN HiRISE DTM Mozaiği `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40` (m, MOLA areoid / DeltaGeoid datumu).
- **Hesaplanan:** oyuncu konumunda en yakın hücre kotu; 3×3 Horn eğimi.
- **Senaryo/UI:** konum, 1.2 m/s × 8 zaman hızlandırma, senaryo saati, ilerleme, sapma, ±10 m koridor.
- **Rota kökeni:** İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değil (PLACES kullanılmadı).

## Kaynaklar

- USGS Astropedia TRN HiRISE DTM: https://doi.org/10.5066/P9REJ9JN
- Fergason vd. 2020 (LPSC #2020): https://www.hou.usra.edu/meetings/lpsc2020/pdf/2020.pdf
- NASA Mars Yerçekimi Referansı: https://solarsystem.nasa.gov/planet-compare/?intent=121
- Mars 2020 Initial Reports: https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf
- PLACES: https://pds-geosciences.wustl.edu/missions/mars2020/places.htm

Görüntü/veri: NASA / JPL-Caltech / University of Arizona / USGS Astrogeology Science Center.
