# Marswalk — Interplanetary Survival Guide: Martian Map

Kullanıcı kontrollü, kısa (60–90 sn) bir Jezero yüzey keşif simülasyonu. Astronotu klavyeyle Sol 120 / WB1 waypoint'inden Sol 164 / Roubion waypoint'ine yürütürsünüz. **Mars fizik motoru, canlı NASA telemetrisi, güvenlik veya karar destek aracı değildir.** Jüri ve sınır notları için `DEMO_NOTES.md`; son kabul kanıtı için `stage-final-acceptance.md` dosyasına bakın.

Proje kökü: `C:\Users\efese\Desktop\Nasaspaceapps\Sim`

## Gereksinimler

- Node.js ≥ 20 (`npm test` için). `npm run smoke` ve tarayıcı betiği için Node ≥ 22 (genel `WebSocket`) ve yerel Edge veya Chrome gerekir.
- npm paketi kurulmaz; bağımlılık yoktur.
- Veri: ekranda gösterilen (aktif) arazi `Sim/data/legacy-hirise/dtm_subset.f32` (~7,5 MB, legacy PDS3 yedek); analiz adayı `Sim/data/dtm_subset.f32` (~7,6 MB, USGS 1 m). İkisi de Git LFS ile izlenir. Dosya 132 baytlık bir işaretçi ise `git lfs pull` çalıştırın.

## Çalıştırma

```powershell
cd "C:\Users\efese\Desktop\Nasaspaceapps\Sim"
node scripts/preflight.mjs   # ön uçuş: LFS işaretçisi, veri ve kaynak kontrolleri (HAZIR bekleyin)
npm start                    # http://127.0.0.1:8080/  (PORT ortam değişkeni ile değiştirilebilir)
npm test                     # node:test birim testleri
npm run smoke               # isteğe bağlı: başsız Edge/Chrome ile uçtan uca kontrol (Node ≥ 22); ekran görüntüleri test-output/ içine
```

`prepare-data` (`node scripts/extract-dtm.mjs`) kaynak USGS DTM GeoTIFF dosyasını ister; bu dosya depoda yoktur. `data/` içindeki hazır çıktılar çalışma için yeterlidir; yalnız veriyi yeniden üretmek gerekirse kullanın.

Uygulama veri yoksa da açılır; DTM'ye bağlı göstergeler "Kullanılamıyor" durumunu gösterir. Çalışma anında internet veya PLACES dosyası gerekmez.

### URL parametreleri (koddan doğrulandı)

| Parametre | Değerler | Etki |
|---|---|---|
| `demo=1` veya `presentation=1` | — | Sunum modunda açar ve örnek görevi otomatik hazırlar (`main.js`). |
| `view=3d` | — | 3D birinci şahıs görünümünü açar; DTM ve WebGL2 yoksa 2D kalır. |
| `scale` | `1` (varsayılan), `2`, `3` | Dikey ölçek. 1 gerçek kot (1:1); 2 ve 3 görsel abartıdır ve rozetle belirtilir. |
| `shadows` | `off`, `low`, `high` (varsayılan) | Güneş gölge haritası çözünürlüğü: 0 / 1024 px / 2048 px. |
| `horizon` | `off` | Bölgesel MOLA ufkunu kapatır. Diğer değerler ufku açık bırakır. |
| `debug=1` | — | `window.marswalk` test kancasını açar. Yalnız geliştirme ve test için. |
| `testWebGL2Failure=1` | (yalnız `debug=1` ile) | WebGL2 hatasını zorlar; 2D fallback'i sınamak için. |

## Kontroller (`public/js/input/input.js` ile doğrulandı)

- **Simülasyon öncesi:** Başlangıç/hedef ve rota ayarlarını görev ekranında yapın. “Ayarları İncele” sağ paneldeki görünüm ve katman ayarlarını açar. “Simülasyonu Başlat” seçilen ayarlarla 3D’yi (WebGL2/DTM yoksa 2D’yi) başlatır.
- **Simülasyon sırasında:** 3D birinci şahısta WASD/ok tuşları kamera yönüne göre yürür; `Space` küçük bir senaryo sıçraması yapar. Sol üstteki “HOLO MAP” oyuncuyu ve rotayı gösteren 2D HUD haritasıdır. “Durdur · Ayarlara dön” veya `P`, simülasyonu dondurur ve ayrıntılı ayar panelini geri getirir; “Simülasyonu Başlat” kaldığınız yerden devam eder.
- **2D fallback:** WASD/oklar hareket eder; `P` veya `Space` simülasyonu durdurup ayarlara döndürür.
- **Her iki görünümde:** `R` yeniden başlatır; `+` / `-` ve fare tekerleği görünümü yakınlaştırır. 3D sahneye tıklamak fare bakışını açar; `Esc` fare kilidini bırakır (tarayıcı davranışı).

## Jüri / demo akışı (60–90 sn)

1. `npm start` ardından `http://127.0.0.1:8080/?demo=1` açın. Sol 120 → Sol 164 rotası hesaplanır ve sade 3D simülasyon HUD’ı açılır.
2. WASD ile yürüyün; soldaki holografik 2D harita oyuncuyu ve rotayı izler. `Space` ile sıçrayın.
3. “Durdur · Ayarlara dön” veya `P` ile simülasyonu dondurup ayrıntılı paneli açın. Ayarları değiştirip “3D Simülasyonunu Başlat” ile kaldığınız yerden devam edin.
4. Ayrıntılı sınır ve sayı notları için `DEMO_NOTES.md`.

## Özellikler

1. **HiRISE DTM arazi tabanı (aktif: legacy yedek):** Gösterilen arazi PDS3 DTEEC DTM penceresidir (1669×1129, ~1,01 m/px). USGS Mars 2020 TRN 1 m penceresi (1676×1135) düşey datum kanıtı olmadığı için `needs_review` kalır, UI'de kullanılmaz ve analiz belgelerinde ölçülmüştür. 3×3 Horn gradyanı ile anlık eğim.
2. **HiRISE 25 cm WMTS ortomozaik kaplaması:** z17 (0,318 m/px) ve z14 (2,544 m/px) karoları; Hibrit / Ortomozaik / Hillshade modları. Hizalama ±1,5 m belirsizlikle gösterilir; yarım piksel hizası kanıtlanmadı. Hizası USGS adayı penceresinde ölçüldü; aktif legacy DTM ile hizası ölçülmedi (K3-8).
3. **A* EVA yürünebilirlik planlayıcısı:** Eğim, pürüzlülük ve veri geçerliliğine dayalı maliyet; minimap'te ısı haritası. Planlama göstergesi; güvenli rota sertifikası değildir.
4. **Rota tercihleri:** Dengeli, en kısa, en düz (`gentle` / `flattest`). Ağırlıklar `route/route-compare.js` içinde senaryo parametresidir. Eski `main.js` tablosu kaldırıldı.
5. **Minimap ve sürükle-bırak uçları:** Başlangıç/bitiş seçimi, tercih değişince bayat plan gösterilmez (`route/plan-response-state.js`). No-data ve kenar (EDGE_UNKNOWN) hücreleri seçilemez (kod ve birim testi; tarayıcı kanıtı için `stage-final-acceptance.md`).
6. **Viking MDIM 2.1 global bağlam:** 232 m/piksel renkli küresel mozaik, z0–z3 karo piramidi; "Mars globali göster" ile küresel görünüm. Viking verisi renk bağlamıdır; kot veya ortogörüntü değildir.
7. **Bölgesel MOLA ufku:** `data/regional-dem/` (~463 m/piksel, 384×384). Datum `needs_review`; yürünebilirlik puanı üretmez, yerel DTM ile birleştirilmez. `?horizon=off` ile kapatılır.
8. **1× gerçek dikey ölçek:** Varsayılan; 2× ve 3× görsel abartı seçenekleri ayrı rozetle gösterilir.
9. **Güneş, gökyüzü ve gölge (görsel):** Mars gökyüzü kubbesi, doğrusal ışık ve ACES ton eşleme, güneş gölge haritası. Sunum parametresidir; ölçülmüş değildir.
10. **Ayak izleri ve parlak rota şeridi (görsel):** Yürüyüşte DTM'den örneklenen ayak izleri; emissive rota şeridi. İzler regolit mekaniği iddiası taşımaz.
11. **Birinci şahıs astronot:** Göz hizasında eldiven ve ön kollar; aşağı bakışta gövde kademeli görünür. Yürüme salınımı, nefes ve yumuşak iniş kamera hareketi (`view/3d/camera-motion.js`).
12. **Mars yerçekimi zıplaması:** 3,71 m/s² (NASA küresel referansı), v0 = 2,4 m/s oyun girdisi; ~1,3 s havada, ~0,78 m tepe; inişte 0,25 s darbe sönümü. Atmosfer sürüklemesi yoktur.
13. **USGS SIM 3464 jeoloji haritası:** 1:75.000 formasyon sınırları ve kontağa anlık mesafe; belirsizlik bildirimli.
14. **Perseverance arşiv fotoğrafları ve sürüş izi:** Sol 120 ve Sol 164 durakları için ham JPEG önizlemeleri; arşiv izi rover izidir, insan rotası değildir.
15. **2D Canvas fallback:** WebGL2 yoksa veya 2D seçilirse tüm katmanlar ve rota planlaması 2D'de çalışır.

## Yapı

| Dosya | Görev |
|---|---|
| `public/js/config.js` | Senaryo değerleri (hız 1,2 m/s, zaman hızlandırma ×8, koridor ±10 m, yerçekimi 3,71), waypoint'ler, harita çerçevesi, kaynaklar |
| `public/js/main.js` | Uygulama koordinatörü: veri yükleme, her karede `WorldSnapshot` üretimi, renderer ve HUD bağlantısı |
| `public/js/geo/` | Saf geometri: `geo.js` (projeksiyon, Horn gradyanı), `relief-metrics.js`, `viking-mosaic.js`, `trek-raster.js`, `regional-dem.js` |
| `public/js/surface/` | Raster okuma, manifest doğrulama, `SurfaceProvider` ve fallback seçimi (`layers.js`, `registry.js`) |
| `public/js/simulation/sim.js` | Oyuncu, senaryo saati, zıplama ve iniş fiziği, snapshot sözleşmesi |
| `public/js/route/` | A* planlayıcı (`cost-model.js`, `route-service.js`, `pathfinder.worker.js`), `route-compare.js` (tercihler), `plan-response-state.js` |
| `public/js/view/render.js` | 2D Canvas çizimi (yalnız snapshot ve hazır varlıklar alır) |
| `public/js/view/3d/` | WebGL2: `renderer.js` (render pass'leri), `camera.js`, `camera-motion.js`, `terrain-mesh.js`, `astronaut-rig.js`, `marker-mesh.js`, `footprint-trail.js`, `route-ribbon.js`, `horizon-mesh.js`, `shadow-map.js`, `sky-model.js`, `terrain-shading.js` |
| `public/js/view/minimap/minimap.js` | Minimap: Viking global, HiRISE yerel katman, rota planlama |
| `public/js/view/hud.js` | Snapshot okuyan HUD ve uyarı şeritleri |
| `public/js/input/input.js` | Klavye, fare tekerleği ve buton bağlamaları (simülasyon kuralı içermez) |
| `scripts/` | `extract-dtm.mjs`, `preflight.mjs`, `smoke-e2e.mjs`, `relief-report.mjs`, `ingest-viking-mosaic.mjs`, `fetch-regional-dem.mjs`, `validate-ortho-registration.mjs`, `build-sources-list.mjs` |
| `server.mjs` | Node standart kütüphanesiyle statik sunucu (`127.0.0.1`) |

### 3D render pass sözleşmesi

`renderer.js` içinde `renderPass` değerleri: 0 arazi · 1 işaretçi ve rota kılavuzları · 2 astronot rig'i ve birinci şahıs view-model · 3 gökyüzü · 4 gölge derinliği (erken dönüş) · 5 ayak izleri · 6 rota şeridi · 7 bölgesel ufuk. Yeni pass'ler 8 ve sonrası kullanır.

## Koordinatlar ve veri kararları

- **Yerel düzlem:** x doğu, y kuzey, metre; orijin Sol 120 / WB1. Equirectangular, küre R = 3396,190 km, merkez meridyen 0°, standart enlem 0°, planetosentrik. Ölçek ekvatorda doğrudur; ~18,4°K'da doğu-batı mesafeleri ~%5,4 fazla çıkar.
- **Piksel dönüşümü (PixelIsArea):** `X = 4577366,5 + col`, `Y = 1106617,5 − row`.
- **Aktif DTM (K3-7 / K5-7 kararı):** Ekranda USGS Mars 2020 TRN HiRISE DTM mozaiği 1 m penceresi (`data/dtm_subset.json`) gösterilir. Çerçeve: EQUIRECTANGULAR, PLANETOCENTRIC, EAST, rotasyon 0; küre yarıçapı 3396,190 km; merkez meridyen 0°, standart enlem 0° (`MAP_FRAME`); map scale 1,0 m/px; 21488×21400 kaynak mozaik, 1676×1135 yüklenen pencere. Etiket datumu: Mars equipotential surface (MOLA areoid / DeltaGeoid, Fergason vd. 2020, PDS3 LBL kanıtı). Legacy PDS3 DTEEC DTM (`data/legacy-hirise/`) ise çevrimdışı fallback yedeği olarak tutulur.
- **Düşey datum:** Mars eşpotansiyel yüzeyi (MOLA areoid / DeltaGeoid). `data/dtm_subset.json` ve `config.js` içinde `verticalDatumVerified: true` ve kanıt URL'siyle eşitlenmiştir (K3-7 / K5-7). Mutlak kot iddiası yapılmaz; eğim ve göreli kabartma doğrudan bu veriden türetilir.
- **No-data:** `0xFF7FFFFB` tam bit deseni `no_data`; geçerli aralık dışı `invalid`. Asla 0 ile değiştirilmez. Eğim, 3×3 pencerede bir hücre bile geçersizse üretilmez.
- **Kapsam:** Tarayıcıya yalnız rota çevresindeki pencere yüklenir; dışı `out_of_bounds` olarak raporlanır. Aktif legacy penceresi 1 884 301 geçerli hücre, 0 no-data; USGS adayı penceresi 1 902 260 geçerli hücre, 0 no-data.
- **Rota kökeni:** İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değildir. PLACES kullanılmadı.

## Değer etiketleri

- **Aktif DTM:** USGS Mars 2020 TRN HiRISE DTM mozaiği (`JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40`); lisans CC0 1.0 (`SOURCES.md` #1).
- **Yedek fallback sağlayıcı:** Legacy PDS3 DTEEC DTM (`DTEEC_045994_1985_046060_1985_U01`); lisans belirtilmemiş (`SOURCES.md` #2).
- **Ölçülen:** Aktif USGS penceresinde kot aralığı 44,84 m; eğim P50/P90/maks 3,11°/7,54°/35,77° (`stage35-scale-audit.md`). Düz hat 687,3 m, ortalama eğim 4,45°, rota boyu 730,5 m.
- **Senaryo:** hız, zaman hızlandırma, koridor, yürünebilirlik eşikleri (20° vb.), rota tercih ağırlıkları.
- **Sunum:** gökyüzü ve ton, gölge, ayak izi, şerit, kamera salınımı, giysi malzemesi, abartı seçenekleri.

Tüm kaynak, lisans ve birim bilgileri `SOURCES.md` dosyasındadır (`scripts/build-sources-list.mjs` ile üretilir). Kaynakta lisans yazmayan alan **belirtilmemiş** olarak kalır; 14 kaynaktan 12'sinde lisans belirtilmemiştir.

## Bilinen sınırlar

- **Yürünebilirlik:** Planlama göstergesidir. Güvenli rota sertifikası değildir. Eşikler senaryo parametresidir.
- **Rota süresi:** Tek kaynak olarak simülasyon yürüyüş hızına (1,2 m/s, `SCENARIO.walkSpeedMps`) eşitlenmiştir (K5-11 / `stage-route-eta-note.md`). Simülasyon saati ve duvar saati ayrı etiketlerle sunulur; eski 0,8 m/s sabit değeri kaldırılmıştır.
- **"En düz" tercihi:** Maksimum eğimi dengeli tercihten düşürmeyebilir (aktif legacy UI özetinde 10,1° ve 9,8°; USGS adayında 9,27° ve 9,81°). Tercih adı ne ölçtüğünü tam açıklamaz.
- **Aktif DTM ↔ analiz DTM'i:** UI aktif legacy DTM ile çalışır; rota ve eğim analizlerinin çoğu USGS adayı penceresinde yapıldı. Aynı uç noktalarda en kısa rota maks. eğimi UI'de 14,1°, USGS adayında 10,64°. Analizlerin legacy üzerinde yeniden koşulması K3-9'dadır.
- **Ortomozaik hizası:** ±1,5 m belirsizlik (USGS adayı penceresinde ölçüldü); aktif legacy DTM ile hizası **ölçülmedi**; yarım piksel hizası kanıtlanmadı. `hud.js:104` uyarısı WMTS katmanıyla çelişkili görünebilir.
- **Viking:** Renk bağlamıdır (232 m/px); USGS Astropedia ürün metadata'sı erişimi "Public domain", kullanım kısıtını "None" olarak verir. Kaynak atfı ve kanıt `SOURCES.md` #9'da.
- **MOLA ufku:** Datum doğrulanmadı (`needs_review`); uzak silüet alçak ve bulanık, bölgesel bağlam olarak sunulur.
- **Datum bayrağı:** `config.js` içinde `verticalDatumVerified: false` yapılarak `data/dtm_subset.json` ile eşitlendi (Stage 38B / K5-6). Kanıt eklenene kadar mutlak kot iddiası yapılmaz.
- **Görsel kalite:** Gölge yumuşak; eller kalın; uzak ufuk silüeti alçaktır. Bunlar sunum tercihleridir, ölçülmüş değildir.
- **Göz yüksekliği:** Kod 1,48 m; bir commit mesajı 1,75 m diyor. Suit ölçümü yoktur.
- **Atmosfer:** Mars basıncı ve yoğunluğu (NSSDC ortalama/mevsimsel) gösterilir; hareket fiziğine sürükleme eklenmemiştir.
- **Render:** Ortogörüntü JP2 çözücüsü yoktur; DTM hillshade ve WMTS karoları kullanılır.
- **Kabul:** `npm run smoke` ve tam tarayıcı kabulü (sıçrama/iniş, varış rozeti, galeri) `stage-final-acceptance.md` içinde işaretlidir.

## Doğrulama

- `node --test test/`: 681/681 (çıkış kodu 0), mevcut çalışma ağacında 15 Kasım 2026.
- `node scripts/preflight.mjs`: HAZIR (hata 0, uyarı 0).
- `npm run smoke`: bu sürümde çalıştırılmadı; önceki sürüm kayıtları commit mesajlarında. Güncel smoke sonucu için yeniden çalıştırın.

## Viking MDIM 2.1 yerel karo paketi

Uygulama `data/viking-mdim/manifest.json` ve küçük `tiles/` ile Jezero bölgesel PNG çıktılarını varsa kullanır. Çıktılar yoksa veya bir karo yüklenemezse global katman `unavailable` olur; yerel HiRISE minimap ve diğer akışlar çalışmayı sürdürür. "Mars globali göster" küresel görünümü açar; "Kapsama sığdır" Jezero'ya döner. 232 m/piksel bölgesel mozaik yalnız renkli bağlam sağlar; yerel yürünebilirlik puanı üretmez.

12,7 GB kaynak `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` uygulamanın çalışması için gerekmez ve git'e eklenmez. Kaynağı hazırlamak için `data-external/` klasörüne koyup ingest betiğine `--input` ile açıkça verin:

```powershell
node scripts/ingest-viking-mosaic.mjs --input data-external/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif --out data/viking-mdim
```

## Kaynaklar

- USGS Astropedia TRN HiRISE DTM: https://doi.org/10.5066/P9REJ9JN
- Fergason vd. 2020 (LPSC #2020): https://www.hou.usra.edu/meetings/lpsc2020/pdf/2020.pdf
- NASA Mars yerçekimi referansı (Planet Compare): https://solarsystem.nasa.gov/planet-compare/?intent=121
- Mars 2020 Initial Reports: https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf
- PLACES (kullanılmadı): https://pds-geosciences.wustl.edu/missions/mars2020/places.htm

Görüntü ve veri: NASA / JPL-Caltech / University of Arizona / USGS Astrogeology Science Center (ürün bazında atıflar `SOURCES.md` dosyasındadır).
