# Marswalk — Proje Amacı ve İlerleme

**Son güncelleme:** 14 Kasım 2026
**Proje:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Hedef uygulama:** `C:\Users\Erdem\OneDrive\Desktop\nasa space apps\Sim`

Bu belge, projeyi devralan kişi veya başka bir yapay zekâ için adım adım devir notudur. Güncel kod ve birincil kaynaklar, eski notlardan daha güncel olabilir; çelişkide güncel kaynaklara bakıp bu notu düzelt.

## 1. Ürün vaadi ve sınırlar

Marswalk’ın nihai amacı, kullanıcının astronotu Mars yüzeyinde **birinci şahıs bakışla keşif için** yönettiği ayrıntılı bir 3D simülasyon oluşturmaktır. Kullanıcının “FPS” ifadesi first-person keşif/kamera anlamındadır; silah/çatışma oyunu değildir. Jezero 2D Canvas uygulaması oynanabilir ara MVP’dir. WebGL2 terrain viewer’a first-person kamera/yönlü hareket/yüzey teması ve sunum amaçlı astronot rig’i eklendi (`fbc623f`); bu dikey dilim gösterilebilir bir aşamadır, nihai FPS ürünü veya doğrulanmış fizik motoru değildir. MVP rota ve koridor ilişkisini, arşiv DTM kotunu ve DTM’den türetilen eğimi kaynak/birim/yöntem bilgileriyle gösterir. Challenge adı *Interplanetary Survival Guide: Martian Map*.

Ürün doğrulanmış genel Mars fizik motoru, canlı NASA telemetrisi, gerçek rover kontrolü veya güvenlik/karar destek sistemi değildir. Yeni first-person hareket Mars yerçekimi ve atmosferini kaynaklı, kapsamı açık parametrelerle dikkate almalıdır. NASA Planet Compare yüzey yerçekimini 3.71 m/s², NSSDC Mars Fact Sheet yaklaşık 3.73 m/s² olarak verir; kaynak/yuvarlama farkı belirtilmelidir. NSSDC ortalama basıncı 6.36 mbar (mevsimsel 4.0–8.7 mbar), yoğunluğu yaklaşık 0.016 ± 0.006 kg/m³ olarak verir. Bunlar Jezero’da belirli tarih/sol için ölçüm değildir. Suit/insan kütlesi, aerodinamik kesit/drag katsayısı ve yerel koşullar kaynaksızsa atmosferin karakter hareketine etkisini fiziksel gerçek gibi uydurma. Rota sapması sadece seçilmiş senaryo çizgisine uzaklığı gösterir. 10 m/yan koridor uygulama varsayımıdır; güvenlik sınırı değildir. Bilimsel ölçüm, veri setinden hesaplanan sonuç, senaryo varsayımı ve UI değeri ayrı etiketlenmelidir.

**Kullanıcı etkileşimi:** Stage 10 first-person diliminde göz hizası kamera, kamera yönlü WASD/ok hareketi, DTM temas örneği ve kaynaklı Mars yüzey yerçekimi referanslı oyun sıçraması vardır. Hareket modeli basitleştirilmiş senaryo davranışıdır; suit biyomekaniği veya tam Mars fizik modeli değildir. Bilinmeyen temas `grounded` durumundan ayrıdır; temas kaybı tek başına düşüş başlatmaz. P/Space duraklat/devam ve R yeniden başlat korunur. Sıradaki planlama işi Stage 8 demo kapsamı ve 60–90 saniyelik gösterim akışını kararlaştırmaktır.

**[KULLANICI BİLDİRDİ — 13 Kasım 2026, Stage 10 öncesi]** Simülasyon açılıyor; arayüzde “Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor)” uyarısı görülüyor ve o tarihteki 3D görünüm istenen FPS deneyimine yakın değil. Bu, o anki kullanıcı gözlemidir; bağımsız runtime kabul raporu değildir. Stage 10 first-person dilimi sonradan eklendi ve ayrı doğrulandı; bu JP2 sınırlamasını çözmez. JPEG 2000 çözücü bulunmadığı için zemin DTM’den türetilmiş hillshade’dir, ortogörüntü değildir. JP2 decoder ve half-pixel kayıt/alignment doğrulaması ayrı ve first-person hareketten bağımsız iştir.

## 2. Çalışmanın kronolojisi ve her aşamanın amacı

### A. Proje bağlamı ve veri envanteri

Başlangıçta `yapay zeka icin/SYSTEM_PROMPT.md`, proje kararları ve yerel HiRISE DTM/orto incelendi. Amaç, uzantı/ad varsaymak yerine metadata ve birincil kaynaklardan CRS, çözünürlük, kapsam ve no-data bilgisini doğrulamaktı. Yol haritası ve devir notları `yapay zeka icin/road map.md`, `yapay zeka icin/MARSWALK_NEXT_STEPS.md` ve `Sim/İkinci Beyin İlerleme Notları.md` içindedir; tarihlerini ve güncel kaynakla tutarlılıklarını kontrol et.

### B. Raster metadata ve ölçek kararının çözümü

**[DOSYA/KAYNAKLA DOĞRULANDI]** DTM `DTEEC_045994_1985_046060_1985_U01.IMG`, PDS3 veri kümesi `MRO-M-HIRISE-5-DTM-V1.0`, 6673×14266 piksel, 32-bit PC_REAL ve yaklaşık 1.009663 m/piksel. Kotlar Mars 2000 eşpotansiyel datumuna göre metredir. Harita projeksiyonu equirectangular; planetosentrik enlem, 15° standart paralel, merkez boylam 77.44°E, yarıçap yaklaşık 3394.8398 km. No-data tam bit örüntüsü `FF7FFFFB`, geçerli kot aralığı yaklaşık −2679.20…−2388.31 m.

Orto `ESP_046060_1985_RED_C_01_ORTHO.JP2`, DTM ile aynı piksel boyutlarında; başlığında equirectangular GeoTIFF georeferansı ve yaklaşık aynı ölçek bulunuyor. **Hizalama/piksel kaydı kesin çözülmüş değildir:** JP2 GeoTIFF `PixelIsArea` yorumu ve PDS piksel-merkezi konvansiyonu arasında yarım sütun + yarım satır, yaklaşık 0.71 m fark hesaplandı. Bu, aynı CRS/boyut metadata’sıyla birlikte görsel hizalama kanıtı sayılmaz. Uygulama orto görüntüyü göstermiyor; orto yalnızca başlık/metadata incelemesinde. Gerekirse piksel merkezi/köşesi konvansiyonunu bağımsız teknik yöntemle yeniden doğrula.

Ölçek çelişkisi çözüldü: ürün sayfasında görülen 0.25 m/piksel `A` sınıfı içindir; yerel ürün `C` sınıfında yaklaşık 1 m/piksel, metadata’dan hesaplanan değer 1.009663’tür.

### C. Demo rotasının seçimi ve PLACES araştırması

PDS Mars 2020 Initial Reports’taki waypoint’ler kullanıldı:

- Sol 120 / WB1: 18.43906919°N, 77.44940206°E.
- Sol 164 / Roubion: 18.42769340°N, 77.45165066°E.

Bu noktalar arasında yerel equirectangular metre düzlemindeki doğru yaklaşık 686.204 m’dir. **Bu gerçek Perseverance traverse polyline’ı değil, iki tarihsel waypoint’in basitleştirilmiş bağlantısıdır.** Tüm demo metninde bu caveat korunmalı.

PDS Search API metadata’sı PLACES release 16.0 içindeki `best_interp.csv` ürününü doğruladı: `urn:nasa:pds:mars2020_rover_places:data_localizations:best_interp.csv::16.0`, bildirilen boyut 8,684,070 bayt. API/ürün metadata’sı erişilebilirken WUSTL ham dosya endpoint’i yerel ağda CSV yerine MEB engel sayfası döndürdü. Gerçek polyline, PDS koordinat çerçevesiyle ham dosya erişilmeden kurulmuş sayılmaz. Üçüncü taraf kaynakla değiştirme.

### D. DTM profilinin hazırlanması

`scripts/extract-dtm.mjs` kaynak DTM’yi salt okunur inceler, rota çevresinden `Sim/data` içine küçük float32 altkümesi ve metadata çıkarır; JP2 başlığını da kaydeder. `data/dtm_subset.json → routeCheck` mevcut kayıtlı profili verir: doğru üzerinde 681 örnek (yaklaşık 1.009 m adım), kot örneklerinde no-data yok; min/max −2588.546/−2568.352 m, uçlar −2569.435/−2588.449 m. 3×3 Horn eğimi ortalama 4.691°, P90 8.360°, maksimum 18.904°.

Bunlar **basitleştirilmiş waypoint çizgisi boyunca arşiv DTM’den örneklenmiş/türetilmiş** değerlerdir; gerçek rover izi, saha ölçümü, geçilebilirlik veya güvenlik puanı değildir. 10 m/yan koridor senaryo varsayımıdır. Yerel equirectangular projeksiyon ~18.4° enlemde doğu-batı mesafesini yaklaşık %1.8 fazla gösterebilir.

### E. 3D ürün vizyonuna giden 2D oynanabilir MVP

Etkinlik öncesi oynanabilir kapsam kullanıcı kontrollü tek bir kısa 2D harita deneyimine indirildi; bu, nihai 3D ürün hedefinden vazgeçildiği anlamına gelmez. Node.js ≥20, bağımlılıksız vanilla JavaScript ES modules ve Canvas 2D ile `Sim` içinde uygulandı. Kullanıcı hareketi/saat/rota sapmasıyla DTM kot/eğim değerleri ve metadata paneli birleştirildi. DTM yoksa oyun açılabilir; katman unavailable olarak işaretlenir. Orto çözücü olmadığı için DTM’den türetilmiş hillshade kullanılır ve ortogörüntü diye adlandırılmaz.

### F. Hesaplama, veri ve render ayrımı

Saf jeo-uzamsal hesaplar `public/js/geo/geo.js` içinde; veri katmanı/sample durumları `public/js/surface/layers.js` içinde; kullanıcı simülasyonu `public/js/simulation/sim.js` içinde; Canvas görünümü `public/js/view/render.js` içindedir. `createWorldSnapshot()` surface provider’dan kot/eğim alır; `zM` Mars 2000 yüzey yüksekliğidir (astronot beden yüksekliği değil), no-data/unavailable durumunda `null` kalır. Snapshot kopyalanıp derin dondurulur. `public/js/view/hud.js` ve `render()` aynı snapshot’ı tüketir; renderer canlı `sim`/`layer`/`adapter` almaz. Debug handle yalnız `?debug=1` ile açılır.

### G. Regresyon kontrolü ve kullanıcı bildirimi

**[KULLANICI BİLDİRDİ]** Alparslan son regresyon kontrollerinin tümünün geçtiğini bildirdi. Kodlama ajanı bu notu hazırlarken `npm test`, smoke testi veya uygulamayı yeniden çalıştırmadı. Sonuçları bağımsız doğrulanmış gibi aktarma. Yeni koddan sonra regression testlerini yeniden çalıştırıp sonucu kullanıcıdan/çıktı loglarından teyit et.

### H. Manifest ve provider registry — kısmen tamamlandı

Güncel kodda `public/js/surface/registry.js` manifest alan doğrulayıcısı (`supported`, `needs_review`, `unavailable`, `invalid`), `SurfaceProviderRegistry`, fallback ve yerel HiRISE provider kaydı var. `main.js` registry’den varsayılan HiRISE’yi seçer; HUD validation/seçim raporunu gösterebilir. `test/core.test.mjs` synthetic manifest, belirsiz kayıt/ölçek, reddedilen candidate, fallback ve snapshot devamlılığı için test örnekleri içeriyor.

**Stage 6 tamam değil.** `Sim/data` içinde gerçek organizer verisi yok; desteklenen format şimdilik hazırlanmış `PDS3_PC_REAL_F32_WINDOW`. Registry gerçek yeni format parser’ı değildir; yeni candidate’ın loader’ı/CRS dönüşümü ayrıca yazılmalı. Kodun güncel statik incelemesinde dört fail-closed boşluğu göründü:

1. Manifestte `license`/usage alanı yok ve doğrulanmıyor; yalnız source/attribution aranıyor.
2. Mekânsal kapsam sadece `coverage.description` metniyle kontrol ediliyor; sayısal footprint ve rota/dünya çerçevesiyle kesişim doğrulanmıyor.
3. `verticalDatumVerified === false` `needs_review` yapıyor; bayrak yokken datum metni tek başına yeterli görülüp supported olabiliyor. Güvenli doğrulama için `true` açıkça aranmalı.
4. `validateLayerManifest(manifest, expectedFrame)` fonksiyonunda `expectedFrame` opsiyonel; verilmezse CRS/grid karşılaştırması atlanabiliyor. Her doğrulama çağrısında kanonik çerçeve zorunlu olmalı.

Ek olarak `transformVerified` boolean’ı insan/loader iddiasıdır; yeni CRS dönüşümünü matematiksel olarak kendiliğinden doğrulamaz. Dönüşüm parametreleri ve footprint kanıtı doğrulanmalı. Bu boşluklar kapatılana ve gerçek kaynak incelenene kadar bilinmeyen candidate örneklenmemeli.

### I. Git ile ortak çalışma — güncel dal bilgisi

En son belge ve paralel iş bölümü güncellemesi `d6a1189 docs: align 3D roadmap for parallel work` commit’iyle `origin/docs/parallel-roadmap`’a push edildi. Önceki `aae4830` modül düzenlemesi `origin/docs/shared-code-boundaries` dalındadır. IMG/JP2/F32 Git LFS’te izlenir; workspace OneDrive altında olduğundan `.git` eşitleme çatışması riski vardır.

**AI commit kuralı:** Her önemli ve gözden geçirilebilir görev aşamasında yalnız ilgili dosyaları commit et; büyük işi tek commit’te biriktirme. Commit’ten önce staged diff’i gözden geçir. Görev branch’ini remote’a push et ki ekip arkadaşı değişiklikleri görebilsin. Push engellenirse commit hash’ini ve nedeni bildir, remote’a ulaştı iddiasında bulunma. AI kendi kimliğiyle commit etmeli; insanı taklit etmemeli.

## 3. Güncel kod yapısı ve çalışma

| Konum | Sorumluluk |
|---|---|
| `public/js/config.js` | Senaryo, waypoint, MAP_FRAME, rota caveat ve kaynaklar |
| `public/js/geo/geo.js` | Equirectangular/PDS grid/local metre transformu, segment uzaklığı, saf Horn gradyanı |
| `public/js/surface/layers.js` | `GridElevationLayer`, `UnavailableLayer`, `sampleSurface`, metadata ve no-data durumu |
| `public/js/surface/registry.js` | Manifest validator, SurfaceProvider registration/factory/fallback; şu an HiRISE default |
| `public/js/simulation/sim.js` | Hareket, saat, rota metrikleri, derin dondurulmuş `WorldSnapshot` |
| `public/js/input/input.js` / `public/js/view/hud.js` | Girişler ve DOM HUD; HUD snapshot tüketir |
| `public/js/view/render.js` | 2D Canvas kamera, görsel terrain asset’i ve snapshot çizimi; `buildTerrainImage(layer)` asset’i önceden katmandan hazırlar |
| `scripts/extract-dtm.mjs` | Kaynak DTM’den altküme/metadata çıkarımı ve JP2 başlık incelemesi |
| `test/core.test.mjs` | Saf hesaplar, no-data, sim, snapshot ve registry birim kontrolleri |
| `scripts/smoke-e2e.mjs` | Başsız tarayıcı etkileşim/kabul kontrolü ve `test-output/` screenshot’ları |

PowerShell’de yerel çalıştırma:

```powershell
cd "C:\Users\Erdem\OneDrive\Desktop\nasa space apps\Sim"
npm start
```

Tarayıcı `http://127.0.0.1:8080/`. Node.js ≥20; paket/bağımlılık kurulumuna gerek yok. Gerekirse kaynak DTM’den altküme üretmek için `npm run prepare-data` (kaynak IMG/JP2 Sim’in bir üst klasöründe aranır). Birim testleri `npm test`; README smoke testi için Node.js ≥22 ve Edge/Chrome gerektiğini belirtir: `npm run smoke`. **Ajan, kullanıcı söylemedikçe çalıştırdığını iddia etmemeli.** Kullanıcı manuel regresyonun geçtiğini söyledi; bu bilgi “kullanıcı bildirimi” olarak kalmalı.

## 4. Tamamlanan Aşamalar ve Kalan İşler

1. **Stage 9 — 3D viewer runtime kabulü:** İlk tur `d471d6a` üzerinde `npm test` 13/13 ve `npm run smoke` 26/26 geçti. Ardından mesh optimizasyonunu içeren `fbc623f` kod HEAD’i Stage 10 entegrasyonuyla birlikte bağımsız doğrulandı: `npm test` 18/18 ve `npm run smoke` 32/32.
2. **Stage 10 — first-person keşif ve rig entegrasyonu:** `fbc623f` ile tamamlandı. Alparslan movement/camera/surface-contact ve renderer entegrasyonunun; Efe `view/3d/astronaut-rig.js` renderer-bağımsız rig/poz modülünün sahibiydi. Snapshot hareket sözleşmesi `timeS`, yatay/düşey hız, `grounded`, açık `airborne`, `phase` ve `groundContactStatus` taşır.
3. **Stage 11 — 3D waypoint beacon ve rota kılavuz geometrisi:** `8054b1a` ile tamamlandı. Efe `marker-mesh.js` modülünü yazdı, Alparslan renderer'a entegre etti. Sol 120 / WB1 ve Sol 164 / Roubion 3D fenerleri, rota şeridi ve koridor sınırları eklendi.
4. **Stage 8 — first-person demo akışı ve HUD entegrasyonu:** `f5259d2` ve `9819da2` ile tamamlandı. Doğrudan 3D URL açılışı (`?view=3d`), Sol 164 hedef kilidi, nişangah (`#fp-reticle`), kontrol kılavuz kapsülü (`#fp-hud-hint`) ve Roubion varış rozeti eklendi.
5. **Stage 12 — Mars düşük yerçekimi zıplama balistiği ve kamera dinamikleri:** `58660f0` ile Alparslan tarafından tamamlandı. Mars $3.71\text{ m/s}^2$ yerçekimi altında $v_0 = 2.4\text{ m/s}$ dikey zıplama dürtüsüyle $\sim 1.3\text{ s}$ hava süresi ve $\sim 0.78\text{ m}$ apeks doğrulandı. Havada yatay momentum korunumu (balistik transit), iniş darbe sönümleme süresi (`landingRecovery` $\sim 0.25\text{ s}$) ve birinci şahıs adım kafa salınımı (head-bobbing) ile iniş kamera esnemesi (landing dip) eklendi. Bağımsız `npm test` 29/29 ve `npm run smoke` 32/32 geçti (59.3 FPS).
6. **Sıradaki iş — Stage 13: Düşük Yerçekimi EVA Loping ve Sıçrama/İniş Poz Kinematiği:** Efe'nin kodlama görevidir. Yalnızca `Sim/public/js/view/3d/astronaut-rig.js` ve birim testlerinde Alparslan'ın snapshot'a eklediği `landingRecovery`, `landingRecoveryFrac`, `grounded`, `airborne` verilerini tüketerek Apollo/Mars EVA loping yürüyüşü, apex balance, landing squash & recover ve view-model salınım kinematiğini kodlar; renderer/simülasyon dosyalarına dokunmaz.
7. **Atmosfer/kuvvet modeli:** NASA ortalama/seasonal değerlerini referans ve senaryo girdisi olarak açıkça etiketle. Belirli Jezero hava koşulu veya gerçek uzay giysisi modeli olduğunu ileri sürme; gerekli kütle/drag/wind parametreleri kaynaklandırılmadan karakter hareketine atmosfer kuvveti uydurma.
8. **Ortogörüntü ayrı işi:** JP2 çözme kütüphanesi/lisansı ve `PixelIsArea` ile PDS pixel-center yarım piksel farkı araştırılsın; hizalama doğrulanmadan görsel bindirme iddiası kurma. Stage 12/13 önkoşulu değildir.
9. **Yarışma verisi/PLACES:** Gerçek veri gelince Stage 6 intake’i kanıtla aç; gerçek PLACES traverse ise erişilebilir aynı birincil PDS ürünüyle ayrı doğrulansın. HiRISE fallback’i ve rota caveat’ı korunur.

## 5. Kaynaklar ve atıf

- [HiRISE Jezero ürünü](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985)
- [HiRISE RDR/DTM SIS](https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF)
- [Mars 2020 PDS Initial Reports](https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf)
- [PDS PLACES](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm)
- [NASA PDS Search API kılavuzu](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html)
- [NASA Solar System Exploration — Mars yerçekimi](https://solarsystem.nasa.gov/planet-compare/?intent=121)
- [NASA NSSDC Mars Fact Sheet — yerçekimi ve atmosfer ortalamaları/aralıkları](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html)

Kaynak rasterın ölçüm/ürün değeri, bu uygulamanın türettiği profil/eğim, senaryo koridoru ve görsel sunum ayrı tutulmalı. Ürün atfını göster; lisans/usage koşulu bulunmadan şart uydurma.
