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

**[KULLANICI BİLDİRDİ]** Alparslan regresyon kontrollerinin tümünün geçtiğini söyledi. Bu notu hazırlayan ajan uygulamayı/testleri yeniden çalıştırmadı ve sonuçlara ilişkin kullanıcıdan ayrıntılı log alınmadı.

## Ürün hedefi ve kapsam sınırları

Marswalk’ın nihai ürün vizyonu, astronotun Mars yüzeyini keşfettiği ayrıntılı ve kullanıcı kontrollü bir 3D simülasyondur. Şu an çalışan 2D Canvas deneyimi bu hedefe giden MVP/ara kilometre taşıdır; ürün amacı olarak 3D’nin yerini almaz. Seçili resmi challenge: *Interplanetary Survival Guide: Martian Map*.

**Bilimsel/ürün sınırı:** Genel amaçlı ve doğrulanmamış Mars fizik modeli, canlı NASA telemetrisi izlenimi, gerçek rover karar desteği, güvenli/güvensiz rota kararı veya veriyle desteklenmeyen risk/güvenlik skoru üretme. 3D renderer nihai ürün vizyonudur; kullanıcı yönlendirmesiyle yarışma verisi gelene kadar yerel doğrulanmış HiRISE verisi üstünde ana geliştirme odağıdır.

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

Tahminler bugünden ileriye yönelik odaklı çalışma saatidir; iki kişilik ekibin toplamı belirtilmedikçe Alparslan’ın entegrasyon/uygulama emeği içindir. Takım arkadaşının becerileri bilinmediğinden sabit teknik sahiplik verilmemiştir.

### 1. MVP kapsamını sabitleme — TAMAMLANDI

- **Amaç:** Challenge’a bağlı, kısa ve oynanabilir demo sınırını belirlemek.
- **Çıktı:** Kullanıcı kontrollü astronot; yerel harita; 60–90 sn demo akışı; rota/sapma ve en çok iki savunulabilir arazi göstergesi.
- **Sahip:** Alparslan (ürün kararı); takım arkadaşı daha sonra gözden geçirebilir.
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
- **Sahip:** Alparslan (entegrasyon); takım arkadaşına becerisi uygunsa demo/QA paketi.
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
- **Sahip:** Alparslan (factory/entegrasyon). Takım arkadaşı becerileri uygunsa ayrı manifest/atıf denetimi veya test QA paketi alabilir.
- **Bağımlılık:** Aşama 4 SurfaceProvider/WorldSnapshot. Gerçek organizer dataset’i henüz `Sim/data` içinde yok.
- **Mevcut açıklar:** (1) license/usage alanı yok ve doğrulanmıyor; (2) coverage yalnız `description` metniyle denetleniyor, sayısal footprint ve rota/dünya kesişimi doğrulanmıyor; (3) `verticalDatumVerified` yalnız `false` iken review oluşturuyor, alan yokken manifest supported olabilir; (4) `expectedFrame` `validateLayerManifest()` için opsiyonel ve verilmezse CRS/grid karşılaştırmaları atlanıyor; `transformVerified` bayrağı dönüşümü matematiksel olarak doğrulamıyor.
- **Kabul:** Yarışma verisi alındığında açıklar fail-closed kapanır; HiRISE çıktısı/snapshot alanları ve fallback davranışı korunur; bilinmeyen format/CRS aktif örnekleme açmaz; UI durumları görünür kalır. Dönüşüm ve footprint kanıtı yalnız manifest bayrağı olarak kalmayıp doğrulanabilir girdilerle sınanır.
- **Tahmin:** Kodun yeni denetiminden önce süre tahmini verilmesin. Gerçek format geldiğinde adapter kapsamı o verinin label/SIS ve dönüşümüne göre ayrıca belirlenir.
- **Kesme çizgisi:** Bilinmeyen format/CRS’i “otomatik algılama” ile içeri alma; event sırasında veri geldiğinde ilk 60–90 dakikada metadata/erişim doğrulanamazsa yerel HiRISE fixture’a dön.

**Not:** Registry/manifest validator kaynakta mevcut. Önceki “henüz görünmüyor” ifadesi eskimişti. Kullanıcı 12 Kasım 2026’da regresyon kontrollerinin geçtiğini bildirdi; bu yol haritası testleri bağımsız olarak yeniden çalıştırmış sayılmaz.

### 7. Gerçek PLACES traverse doğrulaması — AÇIK / 3D dikey dilimden sonra ayrı dış veri işi

- **Amaç:** Basitleştirilmiş çizgiyi gerçek traverse ile, erişilebilir olduğu ölçüde değiştirmek veya karşılaştırmak.
- **Çıktı:** PDS release/ürün kimliği doğrulanmış ham lokalizasyon dosyası ve PDS4 label/SIS; Sol 120–164 kayıt filtresi; koordinat/frame dönüşümü; DTM extent ve no-data filtresi; gerçek polyline uzunluk/profil karşılaştırması.
- **Sahip:** Alparslan; erişimi olan teammate varsa indirme/label incelemesi koşullu.
- **Bağımlılık:** PDS’nin raw CSV’sine engelsiz erişim ve coordinate frame belgeleri.
- **Kabul:** Üçüncü taraf yerine PDS primary file; koordinatlar dokümana göre dönüştürülmüş; footprint/no-data gerçekten kontrol edilmiş; yol noktaları/ölçüm zamanları kaynağıyla sunulmuş. Erişim yoksa mevcut çizgi simülasyonda kalır ve “gerçek PLACES değil” etiketi korunur.
- **Tahmin:** 2–4 saat erişim sağlandığında; 45–60 dakika endpoint denemesinden sonra engel tekrarlanırsa park et ve hackathon demosunu bloke etme.

### 8. Demo dondurma ve sunum — AÇIK; etkinlik öncesi kritik yol

- **Amaç:** Kısa, tekrar edilebilir ve bilimsel sınırlamaları açık demo hazırlamak.
- **Çıktı:** Temiz açılış/başlatma yolu; 60–90 sn kullanıcı senaryosu; kaynak/attribution paneli; fallback akışı; en fazla 3 dakikalık anlatı ve yedek ekran görüntüsü/video.
- **Sahip:** Alparslan entegrasyon/demo; takım arkadaşı ancak becerileri ve müsaitliği teyit edilirse anlatı, görsel inceleme veya QA.
- **Bağımlılık:** MVP; en az bir regresyon geçişi; data adapter yalnız doğrulanmışsa.
- **Kabul:** Yeni makinede README adımları; WASD, duraklat, koridor dışı/geri dönüş ve katman unavailable durumu denenmiş; gerçek PLACES değil ve güvenlik aracı değil açıklaması gözle görünür; attribution okunabilir.
- **Tahmin:** Hazırlıkta 2–3 odaklı saat; etkinlikte ilk demo için 3–5 saat. Gösterim/teslimden 4 saat önce özellik eklemeyi dondur, yalnız kritik hata düzelt.

### 9. Ayrıntılı 3D simülasyon — ÜRÜN HEDEFİ VE ŞU ANKİ ANA GELİŞTİRME ODAĞI

- **Amaç:** Yarışma verisi ulaşana kadar mevcut doğrulanmış HiRISE DTM/fixture’ı kullanarak ayrıntılı 3D simülasyonun oynanabilir dikey dilimini kurmak. Veri kaynağını sonradan değiştirilebilir provider sınırında tut.
- **Çıktı:** Aşamalı 3D sahne/terrain ve etkileşim. Terrain mesh ve no-data boşlukları; kullanıcı kontrollü astronot/avatar; kamera ve temel aydınlatma; mevcut WorldSnapshot/HUD ile entegrasyon. Ayrı render modülü; Mars 2000 bilimsel `zM` ile görsel vertical scale/offset kararı yazılı. 2D renderer ara sürüm/fallback olarak korunur.
- **Sahip:** Arayüz ve entegrasyon Alparslan’da; 3D deneyimi olan takım arkadaşı terrain mesh’i ayrı dosya kümesinde geliştirir. Beceri durumu netleşene kadar görev koşulludur.
- **Bağımlılık:** Aşama 4 WorldSnapshot/SurfaceProvider sınırı; başlangıç verisi olarak yerel HiRISE fixture. Organizer verisi gelirse aşama 6 intake tamamlanmadan ona geçme.
- **Kabul:** 3D yalnız mevcut arşiv/hesaplanan veriyi doğru provenance ile sunar; `zM` kaynak kotu olarak kalır ve görsel dikey abartıdan ayrılır; no-data mesh’te sahte sıfır yüzey üretmez; `zM=null` iken 3D avatar modeli gizlenip yatay konum ve “yükseklik bilinmiyor” durumu HUD/ekran göstergesinde korunur; avatar ve kamera snapshot/sim kurallarıyla çalışır; 2D sürüm açılabilir kalır.
- **Tahmin:** Önce küçük bir dikey dilim ve ardından kullanıcıyla gözden geçirilmiş kapsam planı çıkar; ayrıntılı tamamlanmış ürün için eforu prototip görüldükten sonra tahmin et.

## Paralel çalışma şeritleri ve dosya sınırları

İki kişilik ekipte teknik sahipliği önceden sabitleme; takım arkadaşının becerileri öğrenildikçe bu şeritlerden uygun olanı seçin. Her bağımsız iş bir kabul ölçütü ve belirli bir dosya kümesiyle tanımlansın. Aynı dosya kümesini aynı anda yalnız bir kişi/AI değiştirsin; bağımsız şeritler ayrı branch ve commit'lerle ilerleyebilir.

| Şerit | Ana klasör | Bağımsız iş örnekleri ve sınır |
|---|---|---|
| Geometri (`geo`) | `Sim/public/js/geo/` | PDS koordinat dönüşümünü veya saf geometri fonksiyonlarını incelemek; dönüşüm varsayımlarını belgelemek. Veri yükleyicisini veya simülasyon state'ini değiştirmez. |
| Yüzey/veri (`surface`) | `Sim/public/js/surface/` | Manifest/atıf/lisans metadata QA’sı veya yeni validator kuralının sınırlı uygulaması. Gerçek dataset, label ve kullanım koşulu doğrulanmadan adapter/format uydurulmaz. |
| Simülasyon (`simulation`) | `Sim/public/js/simulation/` | Hareket, saat, faz ve rota metriği kurallarını incelemek; UI/DOM veya Canvas koduna dokunmamak. |
| Girdi (`input`) | `Sim/public/js/input/` | Klavye ve kontrol erişilebilirliği/olay eşlemesini iyileştirmek; simülasyon kuralını bu dosyalara taşımamak. |
| Görünüm (`view`) | `Sim/public/js/view/` | 2D Canvas ara sürümü ve yeni `view/3d/` sahne, terrain, kamera modülleri; bilimsel örnekleme veya rota hesabını görünüm katmanına eklememek. |

Ek bağımsız işler olarak PLACES kaynak/koordinat doğrulaması, attribution/manifest QA, demo anlatısı ve görsel inceleme alınabilir; bunlar belirli bir takım arkadaşına ancak beceri ve ilgi alanı öğrenilince verilsin. `public/js/main.js`, `config.js` ve snapshot/provider sözleşmeleri entegrasyon sıcak noktalarıdır: entegrasyon sahibi bunları koordine eder ve aynı anda yalnız bir sahibi değiştirir. Rota hesabı halen `geo` ile `simulation` arasında dağılmıştır; bu aşamada yeni `route/` modülü oluşturmayın. 3D renderer şu an ana geliştirme odağıdır ve mevcut HiRISE fixture ile bağımsız `view/3d/` katmanında ilerlemelidir.

### Şu anki iş bölümü: yarışma verisi gelene kadar 3D dikey dilim

| Sahip | Görev paketi | Dosya sınırı | Kabul ölçütü |
|---|---|---|---|
| Alparslan (entegrasyon sahibi) | 3D arayüzünü ve render/snapshot bağlantısını belirle; 3D açılış seçimi, ortak ayarlar ve entegrasyonu yönet. | `Sim/public/js/main.js`, `config.js`, snapshot/provider sözleşmeleri; entegrasyon öncesi tek sahip. | Mesh yalnız yükleme/kurulum aşamasında katmandan hazırlanır; kare başına renderer yalnız immutable `WorldSnapshot`, kamera ve hazır mesh asset’i alır; canlı sim/layer/provider örneklemez; 2D fallback çalışır. |
| Takım arkadaşı — 3D deneyimi varsa | HiRISE DTM fixture’ından 3D terrain mesh, kot renkleri/aydınlatma ve no-data boşluklarını üret. | Yeni `Sim/public/js/view/3d/terrain.js` ve bu modülün özel yardımcıları; `main.js`, `config.js`, `surface/`, `simulation/` yok. | 1.009663 m hücre ölçeği korunur; Mars 2000 `zM` bilimsel kaynak kotu kalır; no-data sıfır tabanlı yüzey olmaz; orto hizalıymış gibi sunulmaz. |
| Takım arkadaşı — 3D deneyimi yoksa alternatif paket | 3D kullanıcı akışı, sahne içi bilgi hiyerarşisi ve asset/ölçek gereksinimleri için kısa referans araştırması ve wireframe kabul listesi hazırla. | Doküman/araştırma çıktısı; uygulama dosyalarına dokunma. | Avatar, kamera, yön/ölçek, rota, HUD ve veri kökeni için karar listesi çıkar; doğrulanmayan asset/lisans varsayımı yapma. |
| Alparslan + reviewer sıralı entegrasyonu | Astronot/avatar, kamera kontrolleri ve HUD’ı terrain renderer’a bağla; sonra organizer verisi gerçekten ulaşınca Stage 6 intake aç. | Avatar/kamera için ayrı `view/3d/` dosyaları; `input/`, `main.js` ve snapshot sözleşmesi entegrasyon sahibinin değişiklik sırasına bağlı. | WASD ile avatar hareketi sim state’i izler; kamera takibi kararlı; 2D/3D seçiminde aynı sim ve kaynak metadatası korunur. |

#### 3D renderer arayüz sözleşmesi — ilk dikey dilim

- **Kurulum/veri hazırlama:** `buildTerrainMesh(layer, displayConfig)` benzeri builder yalnız DTM/provider yüklendikten sonra bir kez çağrılır. `GridElevationLayer.cellState()` ile hücre geçerliliğini ve grid koordinatlarını kullanıp kopyalanmış, hazırlanmış bir terrain mesh asset’i (geometri, yerel sınırlar ve provenance/çizim metadata’sı) döndürür. Kare başına builder çağrılmaz.
- **Kare çizimi:** `render3D({ snapshot, camera, terrainMesh })` benzeri saf render girişi yalnız derin dondurulmuş `WorldSnapshot`, kamera ve hazırlanmış mesh asset’ini tüketir. Renderer canlı `sim`, `layer`, `SurfaceProvider` veya adapter almaz; yükseklik örneklemesi başlatmaz. `main.js` kurulumda builder’ı, her karede renderer’ı çağırıp aynı snapshot’ı paylaşır.
- **Görsel kot dönüşümü:** Kaynak `snapshot.astronaut.zM` ve mesh’in kaynak kotları Mars 2000 metre değerleri olarak korunur. Görsel yükseklik yalnız açık `displayConfig` girdileriyle `zDisplay = (zM - referenceElevationM) × verticalScale` formülünden türetilir. `referenceElevationM` bir görüntüleme başlangıcıdır, datum dönüşümü değildir; WB1 için sabit offset veya bilimsel datum düzeltmesi hardcode edilmez. `verticalScale` da yalnız sunum katsayısıdır; kaynak `zM`/snapshot değiştirilmez. Avatarın model içi ayak yüksekliği varsa ayrı açık görsel geometri parametresidir.
- **No-data ve avatar:** Mesh builder yalnız dört köşesi de geçerli olan grid quad’larını triangulate eder; no-data/invalid hücreyi sıfıra çevirmeden ve bilinmeyen üzerinden üçgen köprü kurmadan boş bırakır. Snapshot’ta `astronaut.zM === null` veya `elevationStatus !== 'ok'` ise dünya koordinatında avatar mesh’i çizilmez; yatay konum ve “yükseklik bilinmiyor” durumu HUD/ekran göstergesinde sunulur. Son geçerli kotu veya sıfırı ikame etmez; simülasyonun x/y hareketi snapshot’a göre sürer.
- **Veri ve geri dönüş:** Başlangıç fixture’ı mevcut doğrulanmış HiRISE DTM’dir; yarışma verisi geldiğinde yeni adapter/manifest intake ayrıca doğrulanır. 2D Canvas görünümü çalışır seçim/fallback olarak kalır.

Bu sözleşme, uygulama prompt’u ve terrain görevini açmak için başlangıç kabulüdür; render kütüphanesi veya görsel ölçek değeri seçimini dayatmaz. Belirli `referenceElevationM` ve `verticalScale` değerleri prototip/ürün kararı olarak ayrıca verilmeli; ölçülmüş/datum gerçekleri gibi sunulmamalıdır. AI kodlama yardımı ayrı review veya farklı dosya kümesinde çalışır; entegrasyon dosyalarına eşzamanlı yazmaz.

Gerçek eşzamanlı çalışma/commit için her takım üyesi ve coding AI kendi clone’unu kullanmalı; aynı makinede çalışıyorlarsa OneDrive dışında ayrı clone veya ayrı Git worktree tercih edilmeli. Aynı OneDrive klasöründeki ortak `.git` checkout’unda iki kişinin/AI’nın paralel dosya ve Git işlemleri güvenli değildir. Entegrasyon sahibi branch/PR diff’lerini gözden geçirip birleştirir. Kodlamada bir seferde tek 3D dikey dilim aç; mevcut 2D MVP ve `Sim/data` girdilerini koru. Yarışma verisi gelene kadar 3D odağı doğrulanmış yerel HiRISE fixture’ı ile sürdür; veriyi uydurma veya 3D prototipi ona bağımlı kılma.

## Git paylaşımı — 13 Kasım 2026 durum kaydı

- Workspace kökünde `emanzBey48/EA-Mars` için yerel Git deposu ve `origin` ayarlı. `docs/shared-code-boundaries` branch’indeki `aae4830` commit’inin `origin/docs/shared-code-boundaries`’a push edildiği biliniyor. Mevcut bilgiye göre bu commit `main`’e birleştirilmiş değil.
- Önceki belge eşitlemeleri `3060829`, `0bddf5e` ve `ae570b5` commit’leriyle `origin/docs/parallel-roadmap` dalına push edildi; bu güncel 3D görev bölümü henüz commit edilmedi.
- `yapay zeka icin` yönergeleri ile `Sim` kodu aynı repo kökündedir. 381 MB IMG, 34 MB JP2 ve 7.5 MB F32 `.gitattributes` ile Git LFS üzerinden izlenir; normal Git’e eklenmez.
- Workspace OneDrive altında olduğundan, Git çalışma kopyasını OneDrive senkronizasyonunun dışına almak daha güvenlidir. Takım üyeleri ayrı clone/worktree kullansın; OneDrive `.git` senkronizasyonu ortak Git yöntemi olmasın.
- `Sim/.gitignore` `dtm_subset.f32`, `dtm_subset.json` ve `ortho_inspection.json` dosyalarını izlemeye alır; F32 LFS üzerinden klonlanır. Mevcut `test-output` ekran görüntüleri de ilk importta eklendi.
- AI’lar her önemli, gözden geçirilebilir görev aşamasında ilgili değişiklikleri ayrı commit etsin; büyük işleri tek commit’e yığmasın. Commit öncesi `git status` ve staged diff kontrol edilsin; ilgisiz kullanıcı değişiklikleri eklenmesin. Kullanıcı onayı gereken durumda onay olmadan commit/push yapılmasın. Push başarısızsa hash ve engel raporlansın. Güvenlik/sertifika doğrulaması kapatılmasın.
- Commit author kimliği AI’yı belirtmeli ve bir insanı taklit etmemeli. Ana dal entegrasyon sahibi tarafından PR/diff incelemesiyle birleştirilmeli. Testler yalnız kullanıcı istediğinde çalıştırılmalı; çalıştırılmayan test başarılıymış gibi raporlanmamalı.

## Şu anki en iyi sonraki adım

**Aşama 9’un ilk dikey dilimini başlat:** Önce Alparslan 3D renderer ↔ `WorldSnapshot` arayüzünü ve görsel yükseklik eşlemesini kilitlesin. Ardından 3D deneyimi olan takım arkadaşı `view/3d/terrain.js` içinde yalnız yerel HiRISE fixture’ından mesh üretimini geliştirsin; deneyimi yoksa 3D sahne/HUD gereksinim ve görsel hiyerarşi araştırmasını teslim etsin. Bu aşamada mevcut 2D fallback’i koru, no-data için sahte taban üretme, bilimsel kotla görsel Z’yi ayrı tut. Organizer verisi geldiğinde Stage 6 intake’i ayrı görev olarak aç; PLACES ham dosya işi de ayrı dış veri kolu kalsın.

