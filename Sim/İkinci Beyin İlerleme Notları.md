# Marswalk — İkinci Beyin İlerleme Notları

**Güncelleme:** 13 Kasım 2026
**Kapsam:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Notun amacı:** Doğrulanmış proje bağlamını, geçerli kararları ve sıradaki işi tek yerde tutmak.

## Bilginin durumu

- **[DOSYA/KAYNAKLA DOĞRULANDI]**: Sim içindeki mevcut kaynak ve metadata’da görülen bilgi veya doğrudan birincil kaynakta desteklenen bulgu.
- **[KULLANICI BİLDİRDİ]**: Kullanıcının paylaştığı bilgi; bağımsız test sonucu anlamına gelmez.
- **[AÇIK]**: Henüz uygulanmadı, doğrulanmadı veya dış veriye erişim bekliyor.

## Ürün hedefi ve kapsam

**[ÜRÜN VİZYONU]** Challenge, *Interplanetary Survival Guide: Martian Map*. Nihai amaç, kullanıcının astronotu Mars yüzeyinde yönettiği ayrıntılı bir 3D keşif simülasyonudur. Mevcut 2D Canvas MVP, bu hedefe giden etkinlik öncesi ara kilometre taşıdır. Simülasyon ve çevre ayrıntısı kaynakla doğrulanmalı; ürün canlı telemetri veya rover güvenlik/karar destek sistemi iddiası taşımaz.

**[DOSYA/KAYNAKLA DOĞRULANDI]** İlk oynanabilir MVP 2D kanvas haritasıdır: WASD/ok tuşlarıyla hareket, senaryo saati, duraklat/devam, yeniden başlat, rota sapması ve koridor, DTM kotu ile 3×3 Horn eğimi. HiRISE’den türetilmiş gölgeli kabartma görsel amaçlıdır; ortogörüntü değildir.

**[YÖN/KARAR]** 3D nihai ürün yönüdür; henüz uygulama yok ve etkinlik öncesi takvimde ertelendi. Geçişten önce jeo-uzamsal/çevresel hesaplamalar, simülasyon durumu ve UI/render durumu kararlı sözleşmelerle ayrılmalı. Fizik ve veri hesapları saf/deterministik kalmalı; renderer kamera, sprite, animasyon ve etiketleri yönetmeli. Veri örnekleri/snapshot’lar kopyalanmış ve değiştirilemez olmalı.

## Yerel HiRISE verileri ve hizalama

**[DOSYA/KAYNAKLA DOĞRULANDI]** DTM ürünü `DTEEC_045994_1985_046060_1985_U01.IMG`, PDS veri kümesi `MRO-M-HIRISE-5-DTM-V1.0`; boyut 6673×14266, örnek türü 32-bit PC_REAL, çözünürlük yaklaşık 1.009663 m/piksel. Kotlar Mars 2000 eşpotansiyel yüzeyine göre metredir. Georeferans equirectangular, planetosentrik enlem, 15° standart enlem, merkez boylamı 77.44°E ve küre yarıçapı yaklaşık 3394.8398 km. No-data bit deseni `FF7FFFFB`’dir.

**[DOSYA/KAYNAKLA DOĞRULANDI]** Orto JP2 `ESP_046060_1985_RED_C_01_ORTHO.JP2`, 6673×14266 ve yaklaşık aynı CRS/ölçektedir. Sim’deki başlık incelemesi aynı boyut ve CRS’i, fakat GeoTIFF `PixelIsArea` yorumuyla DTM PDS piksel merkezi arasında 0.5 sütun + 0.5 satır (yaklaşık 0.71 m) farkı kaydeder. Uygulama DTM örneklemesinde PDS etiketini esas alır; bu küçük kayıt belirsizliğini UI’da açıklar. Görsel bindirme doğrulanmış gibi sunulmamalı.

**[ÇÖZÜLDÜ]** HiRISE ürün sayfasındaki 0.25 m/piksel bilgisi bu yerel `C` ürünü için geçerli değildir. HiRISE SIS’te `A` ölçeği 0.25 m sınıfı, `C` 1 m sınıfı olarak ayrılır; yerel piksel ölçeği yaklaşık 1.009663 m’dir.

- [HiRISE Jezero ürün sayfası](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985)
- [HiRISE RDR/DTM Ürün Dokümanı (SIS)](https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF)

## Rota, profil ve sınırlamalar

**[DOSYA/KAYNAKLA DOĞRULANDI]** PDS Mars 2020 Initial Reports’ta geçen Sol 120/WB1 `(18.43906919°N, 77.44940206°E)` ile Sol 164/Roubion `(18.42769340°N, 77.45165066°E)` waypoint’leri kullanılıyor. Equirectangular yerel metre düzlemindeki iki uç nokta arasındaki doğru yaklaşık **686.204 m**’dir.

**Önemli:** Bu düz bağlantı, gerçek Perseverance traverse polylinesi değildir. PLACES ham CSV verisi şu anda uygulamada kullanılmıyor. Profil, tarihsel waypoint’ler arasındaki basitleştirilmiş çizginin DTM’den örneklenmesidir; rover’ın gerçek iz profili gibi anlatılmamalı.

**[DOSYA İÇİNDE KAYITLI HESAPLAMA]** `data/dtm_subset.json → routeCheck`: çizgi boyunca 681 örnek (yaklaşık 1.009 m aralık), kot örneklerinin tamamı geçerli; kot min/max **−2588.546/−2568.352 m**, başlangıç/bitiş **−2569.435/−2588.449 m**. 3×3 Horn yöntemiyle eğim ortalaması **4.691°**, P90 **8.360°**, maksimum **18.904°**. Bunlar uygulamanın DTM üzerinden hesapladığı değerlerdir; doğrudan saha ölçümü veya güvenlik puanı değildir.

**[SENARYO VARSAYIMI]** Rota çizgisinin her iki yanında 10 m koridor kullanılır. Bu operasyonel rover kuralı değildir. Uzaklıklar yerel equirectangular projeksiyon düzleminde metre cinsindendir; 18.4° enlem çevresinde doğu-batı ölçek farkı yaklaşık %1.8’dir.

- [Mars 2020 PDS Initial Reports PDF](https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf)

## PLACES erişim durumu

**[DOĞRULANDI / HAM DOSYA ENGELİ SÜRÜYOR]** NASA PDS Search API metadata’sı PLACES release 16.0 içindeki lokalizasyon koleksiyonunu ve `best_interp.csv` ürününü doğruluyor: ürün kimliği `urn:nasa:pds:mars2020_rover_places:data_localizations:best_interp.csv::16.0`, bildirilen boyut 8,684,070 bayt. API/ürün metadata’sı alınabiliyor; WUSTL raw dosya indirme isteği bu ortamda gerçek CSV yerine MEB ağ geçidi blok sayfası döndürdü. Bu nedenle gerçek traverse çizgisi kurulmuş değildir.

Sıradaki dış doğrulama işi, internete kısıtsız bir ortamda PDS Search API’nin doğruladığı aynı ürünün ham CSV’sini ve etiket/SIS belgelerini indirip Sol 120–164 kayıtlarını filtrelemek, koordinat referansını doğrulamak ve DTM kapsamı/no-data ile karşılaştırmaktır. Üçüncü taraf verisiyle değiştirilmemeli.

- [PDS PLACES sayfası](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm)
- [PDS Search API kılavuzu](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html)
- [PDS Localization koleksiyonu](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_rover_places/data_localizations/)

## Güncel uygulama yapısı

**[MEVCUT DOSYALARLA DOĞRULANDI]** Bağımlılıksız Node.js ≥20, vanilla tarayıcı ES modülleri ve Canvas 2D. `npm install` gerekmiyor.

- `public/js/geo/geo.js`: equirectangular/PDS dönüşümleri, yerel dünya–piksel eşlemesi, nokta-segment uzaklığı, saf Horn 3×3 gradyanı.
- `public/js/surface/layers.js`: metadata descriptor’ı, `GridElevationLayer`, kot/eğim örnekleme, no-data/out-of-bounds/unavailable durumları, DTM yükleme.
- `public/js/surface/registry.js`: manifest validator, provider registry ve HiRISE fallback.
- `public/js/simulation/sim.js`: kullanıcı hareketi, senaryo saati, faz, rota ilerlemesi/sapması ve `WorldSnapshot`.
- `public/js/view/render.js`: kamera ve Canvas çizimi; `render()` snapshot/kamera/hazır terrain asset’i tüketir. `buildTerrainImage(layer)` görsel asset’i raster katmanından önceden üretir.
- `public/js/input/input.js`: klavye/fare ve kontrol bağlama.
- `public/js/view/hud.js`: DOM panelleri ve göstergeler.
- `public/js/main.js`: birleştirme noktası; `window.marswalk` yalnız `?debug=1` veya açık debug bayrağıyla açılır.
- `scripts/extract-dtm.mjs`: üst klasördeki gerçek DTM’den uygulama alt kümesini ve metadata’yı üretir; JP2 başlığını inceler.

**[KAYNAKTA TAMAMLANDI]** `layers.js` `SurfaceProvider` sınırını, `sim.js` derin dondurulmuş `createWorldSnapshot()` sözleşmesini içeriyor. `main.js` her karede snapshot üretip `render()` ve HUD’a veriyor; renderer canlı `sim`/`layer`/`adapter` almıyor. `registry.js` manifest validator, provider registry ve HiRISE fallback içeriyor. Stage 6’nın validator boşlukları hâlâ açıktır; ayrıntı için `yapay zeka icin/Proje Amacı ve İlerleme.md` ve `yapay zeka icin/road map.md` dosyalarına bak.

## Yerel çalıştırma ve doğrulama

**[README / package.json ile doğrulandı]** PowerShell’de:

```powershell
cd "C:\Users\Erdem\OneDrive\Desktop\nasa space apps\Sim"
npm start
```

Tarayıcı: `http://127.0.0.1:8080/` (isteğe bağlı `PORT` ortam değişkeniyle değişir). Girdi rasterları Sim’in bir üst klasöründe bulunmalıdır. Şu an hazırlanmış `data/dtm_subset.f32` ve `.json` zaten var; `npm run prepare-data` yalnız DTM alt kümesini yeniden üretmek gerektiğinde çalıştırılır.

- Birim testleri: `npm test` — Node.js ≥20; `node:test` ile geometri, örnekleme/no-data, eğim, sim hareketi/saat ve rota sapması.
- Başsız tarayıcı smoke testi: `npm run smoke` — README Node.js ≥22 ve yerel Edge/Chrome gerektiğini söyler; DevTools ile giriş ve arayüz kontrolleri yapıp `test-output/` ekran görüntüleri üretir.
- Elle demo: WASD/ok, P/Space duraklat-devam, R yeniden başlat; koridor dışına çıkma/geri dönme; DTM kot/eğim ve katman durumunu izleme.

**[KULLANICI BİLDİRDİ]** Alparslan 12 Kasım’da regresyon kontrollerinin geçtiğini bildirdi. Bu oturumda testler yeniden çalıştırılmadı; bağımsız doğrulama değildir.

## Kararlar ve açık konular

### Kararlar

1. Kullanıcı kontrollü 2D Marswalk MVP mevcut demo için korunur; ayrıntılı 3D simülasyon nihai ürün hedefidir ve sonraki aşamada yürütülür.
2. PLACES polylinesi alınana kadar rota düz çizgisi açıkça “basitleştirilmiş waypoint bağlantısı” olarak etiketlenir.
3. DTM kotu arşiv ürününden örneklenen değer; eğim DTM’den hesaplanan değer; oyuncu konumu/saat/hız/koridor senaryo/UI değeridir.
4. No-data ve unavailable değerleri sıfıra çevrilmez; güvenlik iddiası veya skor üretilmez.

### Açık konular

- Yerel kullanıcı testinin sonucu ve demo öncesi kalan UX sorunları.
- Stage 6 manifest validator boşluklarının kapatılması ve yalnız istenirse ilgili sentetik testlerin çalıştırılması.
- Ayrıntılı 3D hedef için sahne/terrain, etkileşim ve kaynaklı simülasyon kapsamı ayrı kabul ölçütleriyle planlanmalı; mevcut kaynakta 3D renderer yok.
- PLACES ham CSV’nin engelsiz ağdan alınması, etiket/SIS ve koordinat çerçevesinin doğrulanması.
- DTM–JP2 yarım piksel kayıt farkının gerektiğinde piksel merkezi/köşesi düzeyinde bağımsız yeniden teyidi.

## Önerilen sonraki somut adım

**Stage 6 validator boşlukları:** Registry/provider iskeletini yeniden yazma. License/usage, sayısal footprint ve route intersection, `verticalDatumVerified === true`, zorunlu `expectedFrame` ve doğrulanabilir dönüşüm kanıtını fail-closed tamamla; yalnız bu görev için sentetik testleri güncelle. Gerçek organizer verisi gelmeden yeni adapter uydurma.

## Git çalışma kuralı

`emanzBey48/EA-Mars` remote’una erişim doğrulandı. `docs/shared-code-boundaries` dalındaki `aae4830` commit’i kod modüllerini alan klasörlerine taşıdı ve remote’a push edildi; bilinen son durumda `main`’e merge edilmemişti. LFS’deki 381 MB IMG, 34 MB JP2 ve 7.5 MB F32 dosyaları Git LFS ile izleniyor. Workspace OneDrive altında; iki kişinin aynı `.git` klasörünü eşzamanlı kullanması yerine ayrı clone veya worktree ve ayrı branch kullanması önerilir.

AI’lar önemli ve gözden geçirilebilir aşamaları küçük commit’lere ayırsın; staged diff’i önceden incelesin ve görev branch’ini paylaşsın. Kullanıcı onayı bekleniyorsa commit/push yapma. Push başarısızsa commit hash’ini ve gerçek hatayı bildir; TLS doğrulamasını kapatma. Alparslan entegrasyon sahibi olarak PR/diff’i inceler. Testler yalnız kullanıcı istediğinde çalıştırılır.

**Teammate:** Becerileri ve ilgisi öğrenilene kadar sabit kod görevi atanmadı. Uygunsa PLACES kaynak/koordinat doğrulaması veya demo QA ayrı koşullu paket olabilir.

## 13 Kasım 2026 oturum özeti

- **[KAYNAKTA TAMAMLANDI]** `Sim/public/js` modülleri alanlara göre düzenlendi: `geo/`, `surface/`, `simulation/`, `input/` ve `view/`. `main.js` ile `config.js` entegrasyon noktaları olarak kökte kaldı; `index.html` giriş yolu değişmedi.
- **[MİMARİ KARAR]** Her modülün paylaşılan çalışma zamanı state’ini okuyacağı mutable global dosya oluşturulmadı. Ortak değişmeyen değerler `config.js`’te; çalışma zamanı bağımlılıkları parametre/callback ile aktarılıyor. `main.js`, `config.js` ve snapshot/provider sözleşmeleri koordine edilerek değiştirilmesi gereken sıcak noktalardır.
- **[AÇIK]** Rota geometrisi ve metrikleri hâlâ `geo` ile `simulation` arasında dağılmıştır; henüz `route/` modülü yok. 3D renderer da yok; nihai ürün hedefi olarak etkinlik sonrası `view/3d/` altında planlanmalıdır.
- **[GIT]** `docs/parallel-roadmap` dalındaki belge eşitlemesi `3060829 docs: align Marswalk project notes with current code` commit’iyle `origin/docs/parallel-roadmap` dalına push edildi. Önceki `aae4830` modül düzenleme commit’i `docs/shared-code-boundaries` dalındadır. Bu oturumda uygulama koduna/testlere dokunulmadı.
- **[DOĞRULAMA]** `git diff --check` temizdi. Bu oturumda test çalıştırılmadı.

