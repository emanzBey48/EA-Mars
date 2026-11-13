# Marswalk — Tam Proje Yol Haritası

**Son güncelleme:** 13 Kasım 2026
**Proje:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Bu belge:** Kodlama planı ve karar kaydıdır; uygulama/test çalıştırma kaydı değildir.

## Durum etiketleri ve bilgi kaynağı

- **TAMAMLANDI — dosya/kaynakla:** Güncel dosyalar veya birincil kaynak bunu destekliyor.
- **TAMAMLANDI — kullanıcı bildirimi:** Kullanıcı tamamlandığını söyledi; bağımsız doğrulama yapılmadı.
- **AÇIK:** İş sürüyor veya teslimi henüz kodda görünmüyor.
- **BEKLEMEDE:** Bağımlılık/etkinlik zamanı gelene kadar ertelendi.
- **KULLANICI BİLDİRDİ:** Kullanıcı tarafından iletilen tarih/test bilgisi; bağımsız doğrulama değildir.

**[KULLANICI BİLDİRDİ]** Etkinlik tarihleri 14–15 Kasım 2026 olarak bildirildi; bu yol haritasının 13 Kasım güncellemesi itibarıyla yaklaşık bir gün kaldı. Bu tarih bilgisi resmi takvimden bağımsız doğrulanmış değildir.

**[KULLANICI BİLDİRDİ]** Alparslan regresyon kontrollerinin tümünün geçtiğini söyledi. Ayrıca 13 Kasım'da kullanıcı simülasyonun açıldığını, arayüzde “Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor)” uyarısını gördüğünü ve mevcut 3D görünümün hedef FPS deneyimine yakın olmadığını bildirdi. Bu kullanıcı gözlemleri bağımsız runtime kabulü değildir.

## Ürün hedefi ve kapsam sınırları

Marswalk’ın nihai ürün vizyonu, oyuncunun Mars yüzeyinde astronotu **birinci şahıs bakışla keşif amacıyla** yönettiği ayrıntılı, kullanıcı kontrollü bir 3D simülasyondur. “FPS” first-person kamera/kontrol anlamındadır; shooter, silah veya çatışma mekaniği değildir. Çalışan 2D Canvas MVP ve mevcut WebGL2 terrain görüntüleyicisi bu hedefe giden ara kilometre taşlarıdır; ikisi de nihai deneyim değildir. Kullanıcı, mevcut 3D'nin istediği deneyime yakın olmadığını bildirdi. Seçili resmi challenge: *Interplanetary Survival Guide: Martian Map*.

**Bilimsel/ürün sınırı:** Canlı NASA telemetrisi izlenimi, gerçek rover karar desteği, güvenli/güvensiz rota kararı veya veriyle desteklenmeyen risk/güvenlik skoru üretme. FPS hareketi Mars yerçekimi ve atmosfer koşullarını dikkate almalı; sayıların birimi, birincil kaynak, uzamsal/zamansal kapsam ve senaryo varsayımları ayrı gösterilmeli. Astronot/giysi kütlesi ve aerodinamik katsayıları kaynaksızsa atmosfer sürüklemesini gerçekçi fizik gibi uygulama. Kullanıcı yönlendirmesiyle yarışma verisi gelene kadar yerel doğrulanmış HiRISE verisi ana yüzey girdisidir.

NASA başlangıç referansları: yüzey yerçekimi NASA Planet Compare'da 3.71 m/s², NASA NSSDC Mars Fact Sheet'te yaklaşık 3.73 m/s² olarak yuvarlanır; kaynak/yuvarlama farkı saklı tutulur. NSSDC ortalama yüzey basıncını 6.36 mbar (mevsimsel 4.0–8.7 mbar), yüzey yoğunluğunu yaklaşık 0.016 ± 0.006 kg/m³ ve atmosferin hacimce çoğunluğunu CO₂ (~95.1%) olarak listeler. Bunlar Jezero'da belirli bir sol/saate ait atmosfer ölçümü değildir. [NASA Planet Compare](https://solarsystem.nasa.gov/planet-compare/?intent=121), [NASA NSSDC Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html).

## Bilimsel veri zemini ve kurallar

### Yerel rasterlar

**[DOĞRULANDI]** Yerel DTM `DTEEC_045994_1985_046060_1985_U01.IMG`, PDS3 `MRO-M-HIRISE-5-DTM-V1.0`: 6673×14266 piksel, yaklaşık 1.009663 m/piksel, 32-bit PC_REAL, Mars 2000 eşpotansiyel yüzeyine göre metre. Projeksiyon equirectangular; planetosentrik enlem, 15° standart paralel, merkez meridyen 77.44°E, yarıçap yaklaşık 3394.8398 km. No-data bit deseni `FF7FFFFB`; geçerli aralık yaklaşık −2679.20…−2388.31 m.

Orto `ESP_046060_1985_RED_C_01_ORTHO.JP2` aynı boyut/CRS ve yaklaşık aynı ölçek metadata’sı taşıyor. GeoTIFF `PixelIsArea` okuması ile PDS merkez konvansiyonu arasında yarım piksel x/y kaydı (yaklaşık 0.71 m) vardır. Uygulama kot örneklemesinde DTM PDS etiketini esas alıyor ve hizalama/kayıt belirsizliğini açıklıyor. JPEG2000 çözücüsü olmadığı için orto görsel katmanı etkin değildir; zemin DTM’den türetilmiş görsel kabartmadır.

**Ölçek uyuşmazlığı çözüldü:** HiRISE ürün sayfasındaki 0.25 m/piksel bilgisi yerel `C` ürünü için değildir. Ürün SIS’inde `A` 0.25 m sınıfı, `C` 1 m sınıfıdır; yerel ölçüm ~1.009663 m/piksel.

### Rota ve göstergeler

- Sol 120/WB1: 18.43906919°N, 77.44940206°E.
- Sol 164/Roubion: 18.42769340°N, 77.45165066°E.
- Uç noktaları birleştiren doğru, yerel projeksiyon düzleminde 686.204 m.
- **Kritik uyarı:** Bu çizgi gerçek PDS PLACES traverse polyline’ı değildir; iki tarihsel waypoint arasındaki sadeleştirilmiş bağlantıdır.
- `data/dtm_subset.json` içindeki `routeCheck`: 681 örnek, kot örneklemlerinde no-data yok; min/max −2588.546/−2568.352 m; uç kotlar −2569.435/−2588.449 m. 3×3 Horn eğimi ortalama 4.691°, P90 8.360°, maksimum 18.904°. Bunlar bu basitleştirilmiş çizgi boyunca arşiv DTM’den örneklenmiş/türetilmiş sonuçlardır; saha ölçümü veya güvenlik sınıflandırması değildir.
- 10 m/yan koridor **senaryo varsayımıdır**. Mesafe/koridor yerel equirectangular projeksiyon düzleminde hesaplanır; ~18.4° enlemde doğu-batı ölçek farkı yaklaşık %1.8’dir.

### Kaynak/attribution

- [HiRISE Jezero DTM ürün sayfası](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985)
- [HiRISE RDR/DTM SIS](https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF)
- [Mars 2020 PDS Initial Reports](https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf)
- [PDS PLACES bilgi sayfası](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm)
- [NASA PDS Search API kılavuzu](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html)

Veri katmanlarında kaynak, ürün/sürüm, atıf/lisans bilgisi, birim, düşey datum, CRS, mekânsal ve zamansal kapsam, dönüşüm ve no-data kuralı taşınmalı. Ölçülen/arşivlenen ürün değeri, model/hesap sonucu, senaryo varsayımı ve UI değeri ayrı etiketlenmeli. CRS veya datum bilinmiyorsa tahmin edilmemeli; gösterge `unavailable`/`needs_review` kalmalı. No-data asla 0’a dönüştürülmemeli. Simülasyon saati NASA gözlem zamanı değildir.

## Aşamalar

Tahminler bugünden ileriye yönelik odaklı çalışma saatidir; iki kişilik ekibin toplamı belirtilmedikçe Alparslan’ın entegrasyon/uygulama emeği içindir. İş paketleri kişinin daha önce belirli bir 3D kütüphanesini kullanmış olmasına bağlanmaz; kapsam, kabul ölçütü ve dosya sahipliği açıktır.

Aşama numaraları yürütme sırası değildir. Güncel sıra: `643026b` birleşik sürümde Stage 9 regresyon kontrolünü tekrar et; ardından Alparslan’ın Stage 10 first-person hareket/kamera/yüzey teması ile Efe’nin ayrı astronot rig/poz modülünü yürüt; Stage 8 demo/sunum bu ürün yönü gösterilebilir olduğunda dondurulur. Stage 6 validator/adapter yalnız gerçek yarışma verisi ulaştığında açılır. Ortogörüntü decoder/alignment işi FPS hareket paketinden ayrı ve bloke etmeyen bir iş olarak planlanır.

### 1. MVP kapsamını sabitleme — TAMAMLANDI

- **Amaç:** Challenge’a bağlı, kısa ve oynanabilir demo sınırını belirlemek.
- **Çıktı:** Kullanıcı kontrollü astronot; yerel harita; 60–90 sn demo akışı; rota/sapma ve en çok iki savunulabilir arazi göstergesi.
- **Sahip:** Alparslan (ürün kararı); Efe daha sonra gözden geçirebilir.
- **Bağımlılık:** Challenge ve veri kapsamı.
- **Kabul:** Kullanıcı astronotu kendisi kontrol eder; açıkça ölçüm/hesap/senaryo ayrımı vardır; güvenlik skoru yoktur.
- **Tahmin:** Tamamlandı; ileriye dönük ek iş yok.

### 2. Veri ve rota doğrulama — TAMAMLANDI / PLACES KOLU AÇIK

- **Amaç:** Kullanılabilir alanı, grid/ölçeği ve rota uçlarını kanıta dayalı belirlemek.
- **Çıktı:** HiRISE DTM/orto metadata’sı, PDS merkez-piksel transformu, yarım piksel kaydı notu, Sol120–Sol164 uçları ve yerel DTM profil/eğim özeti.
- **Sahip:** Alparslan; PLACES ham dosya doğrulaması için kısıtsız ağ erişimi olan ekip üyesi koşullu olarak.
- **Bağımlılık:** Yerel rasterlar ve PDS/HiRISE birincil dokümantasyonu.
- **Kabul:** Raster boyutu, CRS, ölçek, datum, no-data ve örnekleme açıklanmış; çizginin gerçek rover polyline’ı olmadığı görünür biçimde etiketli.
- **Tahmin:** Mevcut kanıt tamamlandı. PLACES ham CSV erişirse 2–4 saat; WUSTL/MEB engeli 45–60 dakikada çözülmezse durdur, veri uydurma.

### 3. Fixture tabanlı oynanabilir 2D MVP — TAMAMLANDI (kaynakta); kullanıcı kabulü bildirimi ayrıca

- **Amaç:** Uçtan uca demo akışını çalışır kılmak.
- **Çıktı:** `Sim` içinde vanilla JS Canvas 2D; WASD/oklar; senaryo saati; duraklat/yeniden başlat; rota/±10 m senaryo koridoru; DTM kotu/Horn eğimi; kaynak ve sınırlama paneli.
- **Sahip:** Alparslan (entegrasyon); Efe becerisi uygunsa demo/QA paketine destek olabilir.
- **Bağımlılık:** Aşamalar 1–2 ve yerel raster.
- **Kabul:** README’deki komutlarla başlar; hareket ve sapma çalışır; raster verisi yoksa uygulama açılır ve katman unavailable görünür; gerçek PLACES izi/güvenlik aracı gibi sunulmaz.
- **Tahmin:** Kod mevcut. Son regresyon başarısı kullanıcı bildirimi; bağımsız tekrar bu notta yapılmadı.

### 4. Hesaplama/veri/render ayrımı ve snapshot sözleşmesi — TAMAMLANDI (kaynakta)

- **Amaç:** Bilimsel hesapları UI/render durumundan ayırıp ileride başka renderer’a geçişi ucuzlatmak.
- **Çıktı:** `public/js/geo/geo.js` koordinat ve Horn saf fonksiyonları; `public/js/surface/layers.js` SurfaceProvider rolü; `public/js/simulation/sim.js` derin dondurulmuş `WorldSnapshot`; HUD ve render aynı snapshot’ı tüketir; debug yalnız opt-in.
- **Sahip:** Alparslan.
- **Bağımlılık:** 2D MVP.
- **Kabul:** Snapshot kopyalanıp derin dondurulmuş; `zM` Mars 2000 kotu, datum/status ile; no-data/unavailable `zM:null`; HUD örnekleme yapmıyor; renderer canlı sim/layer/adapter almıyor.
- **Tahmin:** Kod ve testler mevcut. Kullanıcı regresyonu geçtiğini bildirdi; bu ajan çalıştırmadı.

### 5. Regresyon kapısı — TAMAMLANDI (kullanıcı bildirimi)

- **Amaç:** Snapshot refaktöründen sonra oynanabilir 2D davranışını doğrulamak.
- **Çıktı:** Kullanıcı `npm test`, `npm run smoke` ve yerel elle denemelerin geçtiğini bildirdi.
- **Sahip:** Alparslan.
- **Bağımlılık:** Aşama 4.
- **Kabul:** Kullanıcının bildirimine göre regresyon kontrolleri başarılı. Loglar bu belgede incelenmiş/yeniden çalıştırılmış sayılmaz.
- **Tahmin:** Bildirilen test emeği tamamlandı; yeni kod öncesinde regression komutlarını tekrar çalıştırmak kodlama AI’sının kabul işi olmalı.

### 6. Yarışma verisi intake ve adapter kayıt katmanı — KISMEN TAMAMLANDI; veri gelene kadar beklemede

- **Amaç:** Organizatör verisi geldiğinde çekirdeği değiştirmeden tanımlı `SurfaceProvider`/snapshot yoluna bağlamak; belirsiz veriyle yanlış bilimsel değer üretimini engellemek.
- **Mevcut kaynak:** `public/js/surface/registry.js` manifest validator’ı, `SurfaceProviderRegistry`, HiRISE sağlayıcı/factory ve fallback’i içeriyor. `main.js` varsayılan HiRISE sağlayıcısını seçiyor; HUD doğrulama/seçim durumunu gösterebiliyor. `test/core.test.mjs` sentetik manifest ve fallback kontrolleri içeriyor.
- **Açık çıktı:** Yarışma verisi geldiğinde mevcut registry’yi fail-closed koşullarla tamamlamak ve sentetik testlerle sınamak; veri gelmeden yeni format/adapter uydurmamak. Bu iş, 3D dikey dilimden sonra açılacak.
- **Sahip:** Alparslan (factory/entegrasyon). Efe'nin becerisi ve kapasitesi uygunsa ayrı manifest/atıf denetimi veya test QA paketi alabilir.
- **Bağımlılık:** Aşama 4 SurfaceProvider/WorldSnapshot. Gerçek organizer dataset’i henüz `Sim/data` içinde yok.
- **Mevcut açıklar:** (1) license/usage alanı yok ve doğrulanmıyor; (2) coverage yalnız `description` metniyle denetleniyor, sayısal footprint ve rota/dünya kesişimi doğrulanmıyor; (3) `verticalDatumVerified` yalnız `false` iken review oluşturuyor, alan yokken manifest supported olabilir; (4) `expectedFrame` `validateLayerManifest()` için opsiyonel ve verilmezse CRS/grid karşılaştırmaları atlanıyor; `transformVerified` bayrağı dönüşümü matematiksel olarak doğrulamıyor.
- **Kabul:** Yarışma verisi alındığında açıklar fail-closed kapanır; HiRISE çıktısı/snapshot alanları ve fallback davranışı korunur; bilinmeyen format/CRS aktif örnekleme açmaz; UI durumları görünür kalır. Dönüşüm ve footprint kanıtı yalnız manifest bayrağı olarak kalmayıp doğrulanabilir girdilerle sınanır.
- **Tahmin:** Kodun yeni denetiminden önce süre tahmini verilmesin. Gerçek format geldiğinde adapter kapsamı o verinin label/SIS ve dönüşümüne göre ayrıca belirlenir.
- **Kesme çizgisi:** Bilinmeyen format/CRS’i “otomatik algılama” ile içeri alma; event sırasında veri geldiğinde ilk 60–90 dakikada metadata/erişim doğrulanamazsa yerel HiRISE fixture’a dön.

**Not:** Registry/manifest validator kaynakta mevcut. Önceki “henüz görünmüyor” ifadesi eskimişti. Kullanıcı 12 Kasım 2026’da regresyon kontrollerinin geçtiğini bildirdi; bu yol haritası testleri bağımsız olarak yeniden çalıştırmış sayılmaz.

### 7. Gerçek PLACES traverse doğrulaması — AÇIK / 3D dikey dilimden sonra ayrı dış veri işi

- **Amaç:** Basitleştirilmiş çizgiyi gerçek traverse ile, erişilebilir olduğu ölçüde değiştirmek veya karşılaştırmak.
- **Çıktı:** PDS release/ürün kimliği doğrulanmış ham lokalizasyon dosyası ve PDS4 label/SIS; Sol 120–164 kayıt filtresi; koordinat/frame dönüşümü; DTM extent ve no-data filtresi; gerçek polyline uzunluk/profil karşılaştırması.
- **Sahip:** Alparslan; Efe'nin erişimi varsa indirme/label incelemesine destek vermesi koşullu.
- **Bağımlılık:** PDS’nin raw CSV’sine engelsiz erişim ve coordinate frame belgeleri.
- **Kabul:** Üçüncü taraf yerine PDS primary file; koordinatlar dokümana göre dönüştürülmüş; footprint/no-data gerçekten kontrol edilmiş; yol noktaları/ölçüm zamanları kaynağıyla sunulmuş. Erişim yoksa mevcut çizgi simülasyonda kalır ve “gerçek PLACES değil” etiketi korunur.
- **Tahmin:** 2–4 saat erişim sağlandığında; 45–60 dakika endpoint denemesinden sonra engel tekrarlanırsa park et ve hackathon demosunu bloke etme.

### 8. Demo dondurma ve sunum — AÇIK; Stage 10 ürün yönü gösterilebilir olduktan sonra

- **Amaç:** Kısa, tekrar edilebilir ve bilimsel sınırlamaları açık demo hazırlamak.
- **Çıktı:** Temiz açılış/başlatma yolu; 60–90 sn kullanıcı senaryosu; kaynak/attribution paneli; fallback akışı; en fazla 3 dakikalık anlatı ve yedek ekran görüntüsü/video.
- **Sahip:** Alparslan entegrasyon/demo; Efe ancak becerisi ve müsaitliği teyit edilirse anlatı, görsel inceleme veya QA desteği verir.
- **Bağımlılık:** Stage 9 runtime kabulinin ve Stage 10 first-person keşif diliminin demo kapsamına girip girmeyeceği kullanıcı/entegrasyon sahibi tarafından kararlaştırılır. Yarışma verisi adapter’ı ve orto decoder bu aşamanın önkoşulu değildir.
- **Kabul:** Yeni makinede README adımları; WASD, duraklat, koridor dışı/geri dönüş ve katman unavailable durumu denenmiş; gerçek PLACES değil ve güvenlik aracı değil açıklaması gözle görünür; attribution okunabilir.
- **Tahmin:** Hazırlıkta 2–3 odaklı saat; etkinlikte ilk demo için 3–5 saat. Gösterim/teslimden 4 saat önce özellik eklemeyi dondur, yalnız kritik hata düzelt.

### 9. 3D terrain viewer — İLK RUNTIME KABULÜ TAMAM; SON OPTİMİZASYON REGRESYONU SIRADA

- **Amaç:** Doğrulanmış HiRISE DTM/fixture’ını kaynağı değiştirilebilir provider sınırında tutarak 3D terrain ve snapshot-driven renderer için teknik taban sağlamak. Bu orbit-camera viewer, nihai FPS keşif deneyimi değildir.
- **Çıktı:** Aşamalı 3D sahne/terrain ve etkileşim. Terrain mesh ve no-data boşlukları; kullanıcı kontrollü astronot/avatar; kamera ve temel aydınlatma; mevcut WorldSnapshot/HUD ile entegrasyon. Ayrı render modülü; Mars 2000 bilimsel `zM` ile görsel vertical scale/offset kararı yazılı. 2D renderer ara sürüm/fallback olarak korunur.
- **Sahip:** Alparslan runtime/scene/camera seçimi ve uygulama entegrasyonunun; Efe renderer’dan bağımsız CPU terrain mesh builder’ın sahibidir.
- **Bağımlılık:** Aşama 4 WorldSnapshot/SurfaceProvider sınırı; başlangıç verisi olarak yerel HiRISE fixture. Organizer verisi gelirse aşama 6 intake tamamlanmadan ona geçme.
- **Kabul:** 3D yalnız mevcut arşiv/hesaplanan veriyi doğru provenance ile sunar; `zM` kaynak kotu olarak kalır ve görsel dikey abartıdan ayrılır; no-data mesh’te sahte sıfır yüzey üretmez; `zM=null` iken 3D avatar modeli gizlenip yatay konum ve “yükseklik bilinmiyor” durumu HUD/ekran göstergesinde korunur; avatar ve kamera snapshot/sim kurallarıyla çalışır; 2D sürüm açılabilir kalır.
- **Durum (13 Kasım 2026):** Stage 9 kabul düzeltmeleri `d471d6a` commit’inde; 2D↔3D, görünür avatar, unknown elevation suppression, WebGL2 fallback ve ölçümlerle `npm test` 13/13, `npm run smoke` 26/26 geçti. Başsız smoke ölçümü 1.93 sn mesh CPU / 3.21 sn ilk 3D geçişi ve 29.1 FPS verdi; FPS ortam koşullarına duyarlıdır, GPU belleği ölçülmedi. Sonrasında Efe’nin `661d9c7` mesh bellek optimizasyonu `643026b` ile eklendi; birleşik HEAD için regresyon smoke’u henüz çalıştırılmadı.
- **Tahmin:** İlk runtime kabul turu tamamlandı. Birleşik HEAD regresyon smoke’u sıradaki kısa doğrulamadır; Stage 10 kapsamının eforu ilk prototip ve kullanıcı gözden geçirmesinden sonra tahmin edilecek.

### 10. Birinci şahıs Mars keşfi ve karakter hareketi — PLANLAMA TAMAM; UYGULAMA SIRADA

- **Amaç:** Terrain viewer'ı FPS/first-person keşif yönünde ilerletmek: göz hizası kamera, kamera yönüne göre hareket, DTM üzerinde zemin teması ve kaynaklı Mars yerçekimiyle düşey hareket. Bu shooter değildir.
- **Çıktı:** Küçük ve oynanabilir first-person dikey dilim; simülasyon zaman adımına bağlı hız/ivme ve zemin teması kuralları; 3D kamera/input/snapshot entegrasyonu. Oyuncu ayak/beden yüksekliği, kaynak yüzey kotu `zM` ve görsel `zDisplay` ayrı temsil edilir. Astronot rig/pozu ayrı modülde hazırlanır ve sonra renderer’a bağlanır.
- **Sahiplik:** Alparslan `main.js`, `config.js`, `simulation/`, `input/`, `view/3d/camera.js` ve snapshot/provider entegrasyonunun tek sahibidir. Efe yeni `view/3d/astronaut-rig.js` içinde renderer’dan bağımsız, sunum amaçlı astronot parça geometrisi ve hareket pozu üretir. Alparslan önce ortak hareket durumu alanlarını tanımlar (`timeS`, yatay/düşey hız, `grounded`, `phase`); Efe bu sözleşmeye göre çalışır. Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/`, test ve snapshot/provider dosyalarına dokunmaz. Modül entegrasyonu ve first-person kamera açısı/kadrajı Alparslan’da kalır; dosya kümeleri eşzamanlı düzenlenmez.
- **Bağımlılık:** Stage 9 runtime kabulinde HiRISE 3D terrain akışının kullanılabilirliği; Stage 4 snapshot/provider sınırı; HiRISE DTM fixture. Yarışma dataset’i veya yeni terrain adapter gerekmez.
- **Fizik/atmosfer:** Model parametreleri NASA birincil kaynak, birim ve kapsamla belgelensin. 3.71 ve 3.73 m/s² kaynak yuvarlamaları açık tutulup seçilen g girdisi gerekçelendirilsin. Basınç/yoğunluk genel/ortalama referans olarak etiketlensin. İnsan/giysi kütlesi, kesit alanı, sürükleme katsayısı ve yerel rüzgâr doğrulanmadan bunların etkisi gerçekçi karakter fiziği diye sunulmasın; atmosfer girdisi parametrelenmemişse sayısal kuvvet eklenmesin.
- **Kabul:** Kamera göz hizasında oyuncu konum/yönünü izler; bakış açısı kullanıcı kontrolündedir; kamera yönüne göre normalize edilmiş hareket; simülasyon zaman adımından bağımsız tutarlı hareket ve pause/restart; geçerli DTM kotuna basma; no-data/invalid/out-of-bounds/unavailable kot sıfıra çevrilmeden açık fallback; `zM` ile görsel Z ayrımı; 2D fallback korunur. Efe’nin animasyon modülü aynı girdi için deterministik idle/walk/stop/airborne pozları verir; renderer entegrasyonu sonrası first-person görünümde kolların/gövdenin kadrajda okunabilirliği ayrıca gözden geçirilir.
- **Durum (13 Kasım 2026):** Ürün kapsamı ve dosya paylaşımı planlandı; kodlama henüz başlamadı. İlk sırada Alparslan’ın hareket arayüzünü ve kamera/movement dikey dilimini başlatması, ardından Efe’nin ayrık rig/poz paketinin aynı arayüze göre paralel ilerlemesi var. Efor prototipten sonra tahmin edilecek.

### Ayrı, bloke etmeyen veri/görsel işi — HiRISE JP2 ortogörüntü decode ve hizalama

- Arayüzdeki “Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor)” bildirimi mevcut sınırlamadır: DTM'den türetilen hillshade ortofoto değildir.
- JP2 decoder seçimi/lisansı ve yarım piksel `PixelIsArea`/PDS center kaydı teknik olarak çözülüp görüntüyle doğrulanmadan ortogörüntü DTM üzerine hizalanmış gibi çizilmez.
- Bu görev FPS hareketinden bağımsızdır; Stage 9/10'un önkoşulu değildir. Kullanıcı uyarıyı gördüğünü bildirdi; bu bir runtime QA başarı kaydı değildir.

## Paralel çalışma şeritleri ve dosya sınırları

Her bağımsız iş bir kabul ölçütü ve belirli bir dosya kümesiyle tanımlansın. Aynı dosya kümesini aynı anda yalnız bir kişi/AI değiştirsin; bağımsız şeritler ayrı branch ve commit'lerle ilerleyebilir. Efe'nin 3D runtime deneyimi bilinmiyor diye kod görevi bekletilmez: CPU mesh builder görevinde render kütüphanesi bağımlılığı yoktur; gerçek teknik engel çıkarsa Alparslan’la kapsamı daraltıp yardım istenir.

| Şerit | Ana klasör | Bağımsız iş örnekleri ve sınır |
|---|---|---|
| Geometri (`geo`) | `Sim/public/js/geo/` | PDS koordinat dönüşümünü veya saf geometri fonksiyonlarını incelemek; dönüşüm varsayımlarını belgelemek. Veri yükleyicisini veya simülasyon state'ini değiştirmez. |
| Yüzey/veri (`surface`) | `Sim/public/js/surface/` | Manifest/atıf/lisans metadata QA’sı veya yeni validator kuralının sınırlı uygulaması. Gerçek dataset, label ve kullanım koşulu doğrulanmadan adapter/format uydurulmaz. |
| Simülasyon (`simulation`) | `Sim/public/js/simulation/` | Hareket, saat, faz ve rota metriği kurallarını incelemek; UI/DOM veya Canvas koduna dokunmamak. |
| Girdi (`input`) | `Sim/public/js/input/` | Klavye ve kontrol erişilebilirliği/olay eşlemesini iyileştirmek; simülasyon kuralını bu dosyalara taşımamak. |
| Görünüm (`view`) | `Sim/public/js/view/` | 2D Canvas ara sürümü ve yeni `view/3d/` sahne, terrain, kamera modülleri; bilimsel örnekleme veya rota hesabını görünüm katmanına eklememek. |

PLACES kaynağı, orto decoder/alignment, attribution/manifest QA ve demo anlatısı bağımsız işlerdir. `public/js/main.js`, `config.js` ve snapshot/provider sözleşmeleri entegrasyon sıcak noktalarıdır: Alparslan koordine eder ve aynı anda tek sahibi olur. Rota hesabı halen `geo` ile `simulation` arasında dağılmıştır; yeni `route/` modülü açmayın. İlk 3D viewer kodu tamam; sıradaki sıra birleşik Stage 9 regresyon doğrulaması, Stage 10 first-person hareket/kamera ve Efe’nin bağımsız astronot rig modülü, sonra Stage 8 demo ürünleştirmesidir.

### Güncel iş bölümü: Stage 9 birleşik regresyonundan Stage 10 FPS keşfine

| Sahip | Görev paketi | Dosya sınırı | Kabul ölçütü |
|---|---|---|---|
| Alparslan (runtime/scene/camera; TAMAMLANDI) | Native WebGL2 seçildi; renderer lifecycle’ı ve snapshot bağlantısı kuruldu; 2D/3D seçimi entegre edildi. | `Sim/public/js/main.js`, `Sim/public/js/view/3d/renderer.js`, `camera.js`; bu dosyaların entegrasyon sahibi tek sahibi. | Runtime seçimi/gerekçesi `renderer.js`’te kayıtlı; kare başına renderer immutable `WorldSnapshot`, kamera ve hazırlanmış mesh asset’ini alır; canlı sim/layer/provider örneklemez; 2D fallback kodda mevcut. |
| Efe (paralel kod paketi; TAMAMLANDI) | HiRISE `GridElevationLayer` girdisinden renderer’dan bağımsız CPU terrain mesh asset’i üret. Görev belirli bir 3D kütüphane deneyimine bağlı değildir. | `Sim/public/js/view/3d/terrain-mesh.js`; yalnız bu modüle özel yardımcılar. `main.js`, `config.js`, `renderer.js`, `camera.js`, `surface/`, `simulation/` ve test dosyalarına dokunma. | `positions: Float32Array` (local X/Y metre + display Z), `normals: Float32Array`, `indices: Uint32Array`, vertex-aligned `sourceElevationsM: Float32Array`; yerel metre koordinatlarında bounds; kaynak `zM`, datum, çözünürlük ve valid/omitted sayıları içeren provenance. Görsel Z açık `referenceElevationM`/`verticalScale` ile hesaplanır. No-data içeren quad üçgenlenmez, sıfırla doldurulmaz veya boşluk üzerinden köprülenmez. WebGL/Three.js nesnesi döndürmez. |
| Alparslan (Stage 9 runtime kabulü; ilk tur TAMAMLANDI) | 2D↔3D, avatar görünürlüğü, unknown elevation, WebGL2 fallback ve ilk açılış/perf ölçümü. | `main.js`, `renderer.js`, `camera.js`, `input/`, smoke script’i; Stage 9 düzeltmeleri `d471d6a`. | `npm test` 13/13, `npm run smoke` 26/26; 1.93 sn CPU mesh / 3.21 sn ilk geçiş, bu başsız smoke’ta 29.1 FPS. `661d9c7` optimizasyonu sonrası birleşik HEAD regresyonu sırada. |
| Alparslan (Stage 10 hareket/kamera temeli; SIRADAKİ) | Hareket durumu arayüzü, göz hizası kamera, kamera yönlü WASD/fare bakışı, DTM teması ve kaynaklı Mars yerçekimi. | `simulation/`, `input/`, `view/3d/camera.js`; `main.js`, `config.js` ve snapshot/provider entegrasyonu tek sahibinde. | Zaman adımından bağımsız hareket, normalize çapraz yön, geçerli DTM’ye basma, kot bilinmiyorsa sıfır/zemin uydurmama, kaynak `zM`/display Z ayrımı ve 2D fallback. Kaynaklanmamış suit/atmosfer kuvveti yok. |
| Efe (astronot rig/animasyon; YENİ PAKET) | Renderer’dan bağımsız astronot parça geometrisi ve simülasyon durumuna bağlı idle/walk/stop/airborne pozu. | Yeni `Sim/public/js/view/3d/astronaut-rig.js` ve yalnız bu modülün yardımcıları. `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/`, test ve snapshot/provider sözleşmesine dokunma. | Saf girdi/çıktı pozu (`timeS`, yatay/düşey hız, `grounded`, `phase`); aynı girdi aynı poz; gait hızı hareket hızıyla değişir; pause’da donma. Sunum animasyonu; suit biyomekaniği iddiası yok. Hareket alanlarını Alparslan teyit ettikten sonra başla; renderer entegrasyonu Alparslan’da. |
| Sonraki bağımsız dalga | Yarışma verisi geldiğinde Stage 6 intake/validator; 3D yolunu bekletmeden ayrı branch’te aç. Bilinen validator işi daha erken alınırsa sentetik validator dosya kümesi ayrıca atanır. | `surface/registry.js`, ilgili ayrı validator testleri; ilk iki paketin dosyalarına dokunma. | License/usage, sayısal footprint+kesişim, doğrulanmış vertical datum, zorunlu `expectedFrame` ve dönüşüm kanıtı fail-closed sınanır; HiRISE fallback korunur. Gerçek format/data gelmeden adapter uydurulmaz. |

#### 3D renderer arayüz sözleşmesi — ilk dikey dilim

- **Kurulum/veri hazırlama:** `buildTerrainMesh(layer, displayConfig)` benzeri builder yalnız DTM/provider yüklendikten sonra bir kez çağrılır. `GridElevationLayer.cellState()` ile hücre geçerliliğini ve grid koordinatlarını kullanıp kopyalanmış, hazırlanmış bir terrain mesh asset’i döndürür. Kare başına builder çağrılmaz. Runtime’dan bağımsız arayüz: `positions: Float32Array` (her vertex için local X/Y metre + display Z), `normals: Float32Array`, `indices: Uint32Array`, `sourceElevationsM: Float32Array` (her vertex’in özgün Mars 2000 kotu), `bounds` (local min/max X/Y/display Z), `provenance` (source/product, datum, çözünürlük, kaynak kot aralığı, valid vertex ve atlanan quad sayıları) ve kullanılan display config. Grid eksenleri mevcut `GridElevationLayer` dönüşümlerinden alınır; CRS/datum varsayımı eklenmez. Test çalışması veya test dosyası değişikliği bu görev kapsamında değildir.
- **Kare çizimi:** `render3D({ snapshot, camera, terrainMesh })` benzeri saf render girişi yalnız derin dondurulmuş `WorldSnapshot`, kamera ve hazırlanmış mesh asset’ini tüketir. Renderer canlı `sim`, `layer`, `SurfaceProvider` veya adapter almaz; yükseklik örneklemesi başlatmaz. `main.js` kurulumda builder’ı, her karede renderer’ı çağırıp aynı snapshot’ı paylaşır.
- **Görsel kot dönüşümü:** Kaynak `snapshot.astronaut.zM` ve mesh’in kaynak kotları Mars 2000 metre değerleri olarak korunur. Görsel yükseklik yalnız açık `displayConfig` girdileriyle `zDisplay = (zM - referenceElevationM) × verticalScale` formülünden türetilir. `referenceElevationM` bir görüntüleme başlangıcıdır, datum dönüşümü değildir; WB1 için sabit offset veya bilimsel datum düzeltmesi hardcode edilmez. `verticalScale` da yalnız sunum katsayısıdır; kaynak `zM`/snapshot değiştirilmez. Avatarın model içi ayak yüksekliği varsa ayrı açık görsel geometri parametresidir.
- **No-data ve avatar:** Mesh builder yalnız dört köşesi de geçerli olan grid quad’larını triangulate eder; no-data/invalid hücreyi sıfıra çevirmeden ve bilinmeyen üzerinden üçgen köprü kurmadan boş bırakır. Snapshot’ta `astronaut.zM === null` veya `elevationStatus !== 'ok'` ise dünya koordinatında avatar mesh’i çizilmez; yatay konum ve “yükseklik bilinmiyor” durumu HUD/ekran göstergesinde sunulur. Son geçerli kotu veya sıfırı ikame etmez; simülasyonun x/y hareketi snapshot’a göre sürer.
- **Veri ve geri dönüş:** Başlangıç fixture’ı mevcut doğrulanmış HiRISE DTM’dir; yarışma verisi geldiğinde yeni adapter/manifest intake ayrıca doğrulanır. 2D Canvas görünümü çalışır seçim/fallback olarak kalır.

Bu sözleşme Efe'nin mesh builder'ı ile Alparslan'ın entegrasyon paketinin arayüzünü tanımlar. Runtime kararı WebGL2 olarak uygulanmış; `referenceElevationM` yüklenen DTM kot aralığının orta noktası, `verticalScale` ise açıkça sunum amaçlı 3× seçilmiştir. Bu değerler ölçüm veya datum düzeltmesi değildir. Mesh arayüzünde değişiklik gerekirse iki görev sahibinin yazılı eşgüdümüyle, ilgili dosyalar düzenlenmeden önce netleştirilir.

Gerçek eşzamanlı çalışma/commit için her takım üyesi ve coding AI kendi clone’unu kullanmalı; aynı makinede çalışıyorlarsa OneDrive dışında ayrı clone veya ayrı Git worktree tercih edilmeli. Aynı OneDrive klasöründeki ortak `.git` checkout’unda iki kişinin/AI’nın paralel dosya ve Git işlemleri güvenli değildir. Entegrasyon sahibi branch/PR diff’lerini gözden geçirip birleştirir. Kodlamada bir seferde tek 3D dikey dilim aç; mevcut 2D MVP ve `Sim/data` girdilerini koru. Yarışma verisi gelene kadar 3D odağı doğrulanmış yerel HiRISE fixture’ı ile sürdür; veriyi uydurma veya 3D prototipi ona bağımlı kılma.

## Git paylaşımı — 13 Kasım 2026 durum kaydı

- Workspace kökünde `emanzBey48/EA-Mars` için yerel Git deposu ve `origin` ayarlı. `docs/shared-code-boundaries` branch’indeki `aae4830` commit’inin `origin/docs/shared-code-boundaries`’a push edildiği biliniyor. Mevcut bilgiye göre bu commit `main`’e birleştirilmiş değil.
- Güncel paralel 3D görev bölümü `d6a1189 docs: align 3D roadmap for parallel work` commit’iyle `origin/docs/parallel-roadmap` dalına push edildi. Önceki paylaşılan belge eşitlemeleri `3060829`, `0bddf5e` ve `ae570b5`; modül düzenlemesi `aae4830` (`docs/shared-code-boundaries`) olarak kayıtlıdır.
- `yapay zeka icin` yönergeleri ile `Sim` kodu aynı repo kökündedir. 381 MB IMG, 34 MB JP2 ve 7.5 MB F32 `.gitattributes` ile Git LFS üzerinden izlenir; normal Git’e eklenmez.
- Workspace OneDrive altında olduğundan, Git çalışma kopyasını OneDrive senkronizasyonunun dışına almak daha güvenlidir. Takım üyeleri ayrı clone/worktree kullansın; OneDrive `.git` senkronizasyonu ortak Git yöntemi olmasın.
- `Sim/.gitignore` `dtm_subset.f32`, `dtm_subset.json` ve `ortho_inspection.json` dosyalarını izlemeye alır; F32 LFS üzerinden klonlanır. Mevcut `test-output` ekran görüntüleri de ilk importta eklendi.
- AI’lar her önemli, gözden geçirilebilir görev aşamasında ilgili değişiklikleri ayrı commit etsin; büyük işleri tek commit’e yığmasın. Commit öncesi `git status` ve staged diff kontrol edilsin; ilgisiz kullanıcı değişiklikleri eklenmesin. Kullanıcı onayı gereken durumda onay olmadan commit/push yapılmasın. Push başarısızsa hash ve engel raporlansın. Güvenlik/sertifika doğrulaması kapatılmasın.
- Commit author kimliği AI’yı belirtmeli ve bir insanı taklit etmemeli. Ana dal entegrasyon sahibi tarafından PR/diff incelemesiyle birleştirilmeli. Testler yalnız kullanıcı istediğinde çalıştırılmalı; çalıştırılmayan test başarılıymış gibi raporlanmamalı.

## Yarışma verisi gelene kadar kalan işler — 13 Kasım 2026

| Sahip | Uygulama durumu | Yarışma verisinden önce kalan |
|---|---|---|
| Efe | CPU mesh builder (`3600563`) ve memory optimization (`661d9c7`) tamam; `643026b` ile entegrasyon dalına geldi. | Yeni görev: Alparslan’ın hareket arayüzü teyit edilince `view/3d/astronaut-rig.js` içinde renderer-bağımsız, sunum amaçlı astronot model/poz üretimi. Entegrasyon ve kamera dosyaları Alparslan’da. |
| Alparslan | WebGL2 viewer, 2D/3D seçimi ve Stage 9 ilk runtime kabul turu `d471d6a` üzerinde tamam; `npm test` 13/13, smoke 26/26. | Efe optimizasyonu (`661d9c7`) sonrası birleşik HEAD regresyon smoke’u; ardından Stage 10 first-person movement/camera/surface-contact, hareket arayüzü ve rig renderer entegrasyonu. |

- **Stage 9:** İlk runtime kabul turu `d471d6a` üzerinde tamamlandı (`npm test` 13/13, smoke 26/26); sonraki mesh bellek optimizasyonu `661d9c7` birleşik HEAD’e geldikten sonra kısa regresyon tekrarı gerekiyor. Orbit viewer hâlâ first-person nihai hedef değildir.
- **Stage 10:** Planlama ve dosya paylaşımı hazır; Alparslan movement/camera/surface-contact entegrasyonunu yürütür, Efe bağımsız `astronaut-rig.js` animasyon modülünü geliştirir.
- **Stage 8:** Demo dondurma/sunum hazırlığı açık; Stage 10 demoya girecekse first-person dilim gösterilebilir olduktan sonra yapılır. Önceki süre tahmini eski kapsam içindir; yeni ürün yönüne göre güncellenecek.
- **Stage 7 / PLACES:** Alparslan’ın ayrı, bloke etmeyen dış veri işi. PDS dosyasına erişim olursa 2–4 saat; endpoint engeli 45–60 dakikada çözülmezse park et.
- **Stage 6 / yarışma verisi intake:** Veri gelene kadar beklemede. Gerçek dataset ve label/SIS olmadan yeni adapter veya format geliştirme.

**Sıradaki işler:** Alparslan birleşik HEAD üzerinde Stage 9 regresyon smoke’unu tekrarlayıp sonucu kaydetsin. Ardından hareket durumu arayüzünü ve Stage 10 kamera/hareket/DTM teması paketini başlatsın; Efe `view/3d/astronaut-rig.js` poz üreticisini bu arayüzle ayrı branch’te geliştirsin. Alparslan modülü renderer’a bağlayıp görsel kadrajı kabul etsin. Orto decode/hizalama ve erişim mümkünse PLACES yarışma verisinden bağımsız işlerdir; Stage 6 organizer verisini bekler.

