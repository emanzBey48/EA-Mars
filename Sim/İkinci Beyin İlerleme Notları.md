# Marswalk — İkinci Beyin İlerleme Notları

**Güncelleme:** 13 Kasım 2026 — Stage 8 demo ve Stage 11 marker-mesh tamamlandı; Stage 12 (Mars zıplama fiziği) ve Stage 13 (EVA loping kinematiği) yeni paralel görevler olarak atandı
**Kapsam:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Notun amacı:** Doğrulanmış proje bağlamını, geçerli kararları ve sıradaki işi tek yerde tutmak.

## Bilginin durumu

- **[DOSYA/KAYNAKLA DOĞRULANDI]**: Sim içindeki mevcut kaynak ve metadata’da görülen bilgi veya doğrudan birincil kaynakta desteklenen bulgu.
- **[KULLANICI BİLDİRDİ]**: Kullanıcının paylaştığı bilgi; bağımsız test sonucu anlamına gelmez.
- **[AÇIK]**: Henüz uygulanmadı, doğrulanmadı veya dış veriye erişim bekliyor.

## Ürün hedefi ve kapsam

**[ÜRÜN VİZYONU]** Challenge, *Interplanetary Survival Guide: Martian Map*. Nihai amaç, kullanıcının astronotu Mars yüzeyinde **birinci şahıs keşif kamerasıyla** yönettiği ayrıntılı 3D simülasyondur. “FPS” first-person keşif/kontrol anlamındadır; shooter değildir. Mevcut 2D Canvas MVP ve WebGL2 orbit-camera viewer ara kilometre taşlarıdır. Simülasyon ve çevre ayrıntısı kaynakla doğrulanmalı; ürün canlı telemetri veya rover güvenlik/karar destek sistemi iddiası taşımaz.

**[DOSYA/KAYNAKLA DOĞRULANDI]** İlk oynanabilir MVP 2D kanvas haritasıdır: WASD/ok tuşlarıyla hareket, senaryo saati, duraklat/devam, yeniden başlat, rota sapması ve koridor, DTM kotu ile 3×3 Horn eğimi. HiRISE’den türetilmiş gölgeli kabartma görsel amaçlıdır; ortogörüntü değildir.

**[GÜNCEL DURUM — KOD/TESTLE DOĞRULANDI]** Stage 9 mesh optimizasyonu ve Stage 10 first-person hareket/kamera/yüzey teması (`fbc623f`), Stage 11 3D waypoint beacon’ları ve rota kılavuz geometrisi (`8054b1a`) ile Stage 8 first-person demo akışı ve HUD entegrasyonu (`f5259d2`) tamamlandı. Bağımsız denetimde `npm test` 24/24 ve `npm run smoke` 32/32 (60.4 FPS) geçti. Sıradaki geliştirme adımı, yarışma öncesi animasyon ve simülasyon gerçekçiliğini artırmak üzere Stage 12 (Alparslan: Mars zıplama fiziği ve kamera dinamiği) ve Stage 13 (Efe: Düşük yerçekimi EVA loping ve sıçrama/iniş kinematiği) bağımsız paralel çalışma paketleridir. Yarışma verisi gelene kadar yerel HiRISE fixture’ı yeterlidir. Jeo-uzamsal/çevresel hesaplamalar, simülasyon durumu ve UI/render durumu kararlı sözleşmelerle ayrılmalı; snapshot’lar kopyalanmış ve değiştirilemez olmalı.

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
- `public/js/simulation/sim.js`: 2D/first-person kullanıcı hareketi, senaryo saati, faz, grounded ile açık airborne yörüngesini ayıran Stage 10 durumu, rota ilerlemesi/sapması ve `WorldSnapshot`.
- `public/js/view/render.js`: kamera ve Canvas çizimi; `render()` snapshot/kamera/hazır terrain asset’i tüketir. `buildTerrainImage(layer)` görsel asset’i raster katmanından önceden üretir.
- `public/js/view/3d/terrain-mesh.js`: renderer’dan bağımsız CPU terrain mesh üretimi; `positions`, `normals`, `indices`, kaynak kotlar, bounds ve provenance döndürür. No-data quad’ları atlar.
- `public/js/view/3d/renderer.js`, `camera.js`: WebGL2 terrain renderer, orbit ve first-person camera sunumu; first-person alt kadraj torso/kollar view-model’i.
- `public/js/view/3d/astronaut-rig.js`: Efe’nin tamamladığı renderer-bağımsız astronot parça şablonu ve snapshot hareketinden deterministik idle/walk/stop/airborne/unknown poz üreticisi; renderer bağlantısı Alparslan’ın entegrasyon paketinde.
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

**[STAGE 9 — TARİHSEL İLK KABUL]** `d471d6a` commit’inde `npm test` 13/13, `npm run smoke` 26/26 geçti. 1,884,301 hücreli mesh CPU hazırlığı 1.93 sn, ilk 3D geçişi 3.21 sn; bu başsız çalıştırmada yaklaşık 29.1 FPS ölçüldü. FPS ortama duyarlıdır; GPU belleği ölçülmedi.

**[STAGE 9 REGRESYONU + STAGE 10 — BAĞIMSIZ SON DOĞRULAMA, 13 KASIM]** Mesh bellek optimizasyonu, first-person movement/camera/contact ve astronot rig renderer entegrasyonunu içeren `fbc623f` kod HEAD’i bağımsız denetlendi: `npm test` 18/18, son `npm run smoke` 32/32 geçti. İlk audit smoke turunda iki mevcut 2D timing kontrolü geçici başarısız oldu; hemen tekrarında tüm 32 smoke kontrolü geçti. Smoke 3D geçişi, first-person rig görünürlüğü/heading, gait/pause, bilinmeyen temas ile devam eden jump ayrımı, 2D kontrolleri ve WebGL2 fallback’i kapsadı.

**[STAGE 11 VE STAGE 8 — BAĞIMSIZ DOĞRULAMA, 13 KASIM]** Efe'nin 3D waypoint beacon ve rota kılavuz geometrisi `8054b1a` ile tamamlandı. Alparslan'ın Stage 8 first-person demo akışı, nişangah (`#fp-reticle`), kontrol kapsülü (`#fp-hud-hint`) ve Sol 164 Roubion varış rozeti entegrasyonu `f5259d2` ile tamamlandı. Bağımsız doğrulamada `npm test` 24/24, `npm run smoke` 32/32 geçti (60.4 FPS).

## Kararlar ve açık konular

### Kararlar

1. Kullanıcı kontrollü 2D Marswalk MVP korunur; nihai ürün hedefi first-person 3D keşiftir. Mevcut orbit-camera terrain görüntüsü ara kilometre taşıdır.
2. PLACES polylinesi alınana kadar rota düz çizgisi açıkça “basitleştirilmiş waypoint bağlantısı” olarak etiketlenir.
3. DTM kotu arşiv ürününden örneklenen değer; eğim DTM’den hesaplanan değer; oyuncu konumu/saat/hız/koridor senaryo/UI değeridir.
4. No-data ve unavailable değerleri sıfıra çevrilmez; güvenlik iddiası veya skor üretilmez.

### Açık konular

- Stage 12 (Alparslan): Mars 3.71 m/s² yerçekimi altında astronot zıplama mekaniği (~1.3 s uçuş, balistik momentum korunumu, iniş darbe sönümleme süresi / `landingRecovery`), birinci şahıs adım kafa salınımı (head-bobbing) ve iniş kamera esnemesi (landing camera dip).
- Stage 13 (Efe): `view/3d/astronaut-rig.js` içinde düşük yerçekimi EVA loping yürüyüşü, apex balance pose, landing squash & recover ve first-person view-model kollarda nefes/adım salınımı. Efe diğer dosyalara dokunmaz.
- JP2 JPEG 2000 decoder/lisansı ve PixelIsArea/PDS yarım-piksel hizalama araştırması; FPS işinden bağımsızdır.
- PLACES ham CSV’nin engelsiz ağdan alınması, etiket/SIS ve koordinat çerçevesinin doğrulanması.
- Yarışma verisi ulaşınca Stage 6 validator boşlukları ve veri adapter intake’i ayrı iş olarak açılmalı; şimdilik bu 3D ana iş hattını bloke etmez.

## Önerilen sonraki somut adım

**Şu anki adım:** Alparslan ve Efe paralel olarak Stage 12 ve Stage 13 geliştirme paketlerini yürütür:
- Alparslan (`sim.js`, `config.js`, `camera.js`, `main.js`): Mars yerçekimi zıplama balistiği, havada yatay momentumun korunumu, iniş darbe sönümlemesi ve kamerada adım kafa salınımı ile iniş esnemesini tamamlar; snapshot hareket API'sinde Efe için gerekli alanları (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`) yayınlar.
- Efe (`view/3d/astronaut-rig.js` ve birim testleri): Alparslan'ın movement API girdilerine göre Apollo/Mars EVA araştırmalarındaki deterministik loping yürüyüş kinematiği, apex balance pose, landing squash & recover ve view-model kollarda nefes/adım salınımını üretir. Efe simülasyon, kamera, renderer ve main dosyalarına dokunmaz.
JP2 decode/alignment bağımsız ve bloke etmeyen iştir; PLACES doğrulaması engelsiz PDS erişimine bağlıdır; Stage 6 organizer-data intake’i gerçek yarışma dataset’i ve label/SIS gelene kadar bekler. No-data, provenance ve 2D fallback politikaları değişmez.

## Git çalışma kuralı

`emanzBey48/EA-Mars` remote’una erişim doğrulandı. `docs/shared-code-boundaries` dalındaki `aae4830` commit’i kod modüllerini alan klasörlerine taşıdı ve remote’a push edildi; bilinen son durumda `main`’e merge edilmemişti. LFS’deki 381 MB IMG, 34 MB JP2 ve 7.5 MB F32 dosyaları Git LFS ile izleniyor. Workspace OneDrive altında; iki kişinin aynı `.git` klasörünü eşzamanlı kullanması yerine ayrı clone veya worktree ve ayrı branch kullanması önerilir.

AI’lar önemli ve gözden geçirilebilir aşamaları küçük commit’lere ayırsın; staged diff’i önceden incelesin ve görev branch’ini paylaşsın. Kullanıcı onayı bekleniyorsa commit/push yapma. Push başarısızsa commit hash’ini ve gerçek hatayı bildir; TLS doğrulamasını kapatma. Alparslan entegrasyon sahibi olarak PR/diff’i inceler. Testler yalnız kullanıcı istediğinde çalıştırılır.

**Efe’nin görev durumu:** CPU mesh builder (`3600563`), mesh bellek optimizasyonu (`661d9c7`), astronot rig/poz üreticisi (`fbc623f`) ve 3D marker-mesh modülü (`8054b1a`) tamamlandı. Efe'nin yeni paralel kod görevi Stage 13'tür: `Sim/public/js/view/3d/astronaut-rig.js` ve buna ait birim testlerinde renderer'dan bağımsız düşük yerçekimi EVA loping yürüyüş kinematiği, apex balance, landing squash & recover ve view-model salınımı üretmektir. Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` ve snapshot sözleşmelerine dokunmaz; entegrasyon Alparslan'dadır.

## Tarihsel not — Stage 10 entegrasyonu öncesi (13 Kasım 2026)

- **[KAYNAKTA TAMAMLANDI]** `Sim/public/js` modülleri alanlara göre düzenlendi: `geo/`, `surface/`, `simulation/`, `input/` ve `view/`. `main.js` ile `config.js` entegrasyon noktaları olarak kökte kaldı; `index.html` giriş yolu değişmedi.
- **[MİMARİ KARAR]** Her modülün paylaşılan çalışma zamanı state’ini okuyacağı mutable global dosya oluşturulmadı. Ortak değişmeyen değerler `config.js`’te; çalışma zamanı bağımlılıkları parametre/callback ile aktarılıyor. `main.js`, `config.js` ve snapshot/provider sözleşmeleri koordine edilerek değiştirilmesi gereken sıcak noktalardır.
- **[DURUM]** Rota geometrisi ve metrikleri hâlâ `geo` ile `simulation` arasında dağılmıştır; yeni `route/` modülü yok. WebGL2 renderer, kamera ve CPU mesh builder artık mevcut; bunlar first-person deneyimi tamamlanmış olduğu anlamına gelmez.
- **[GIT]** Güncel görev bölümü ve belge eşitlemesi `d6a1189 docs: align 3D roadmap for parallel work` commit’iyle `origin/docs/parallel-roadmap` dalına push edildi. Önceki `aae4830` modül düzenleme commit’i `docs/shared-code-boundaries` dalındadır. Bu işte uygulama koduna/testlere dokunulmadı.
- **[O ZAMANKİ GIT/DOĞRULAMA DURUMU]** Bu notun ilk yazıldığı sırada entegrasyon dalı `codex/stage9-acceptance-fixes`, son kod commit’i `643026b` idi; mesh optimizasyonu sonrası regresyon tekrarlanmamıştı. Bu kayıt Stage 10 entegrasyonundan önceki durumu anlatır.

## Güncel durum — Stage 8 ve Stage 11 tamamlanması; Stage 12 ve Stage 13 başlangıcı (13 Kasım 2026)

- **Kod HEAD:** `f5259d2 feat: complete Stage 8 first-person demo experience and presentation flow`, `alparslan/stage8-demo-orchestration` dalında.
- **Tamamlanan Aşamalar:** Stage 8 first-person demo akışı ve HUD entegrasyonu (`f5259d2`), Stage 11 3D waypoint beacon'ları ve rota kılavuz geometrisi (`8054b1a`), Stage 10 first-person hareket/temas ve astronot rig renderer entegrasyonu (`fbc623f`), Stage 9 mesh optimizasyon regresyonu. Bağımsız QA: `npm test` 24/24, `npm run smoke` 32/32 geçti (60.4 FPS).
- **Yeni Paralel Görevler:**
  - **Stage 12 (Alparslan):** Mars Düşük Yerçekimi Zıplama Fiziği, Balistik İntikal ve Kamera Dinamiği (`Sim/public/js/simulation/sim.js`, `Sim/public/js/config.js`, `Sim/public/js/view/3d/camera.js`, `Sim/public/js/main.js`). 3.71 m/s² NASA referansı korunur, kaynaksız atmosfer sürüklemesi eklenmez; zıplama balistiği (~1.3 s uçuş süresi, havada momentum korunumu), iniş darbe sönümleme süresi (`landingRecovery`), kamerada adım kafa salınımı (head-bobbing) ve iniş kamera esnemesi (landing camera dip) geliştirilir; snapshot sözleşmesinde durum alanları (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`) yayınlanır.
  - **Stage 13 (Efe):** Düşük Yerçekimi EVA Loping Yürüyüşü ve Sıçrama/İniş Poz Kinematiği (`Sim/public/js/view/3d/astronaut-rig.js` ve buna ait birim testleri). Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` ve snapshot sözleşmelerine DOKUNMAZ; Alparslan'ın movement API girdilerine göre Apollo/Mars EVA araştırmalarındaki loping gait, apex balance pose, landing squash & recover ve view-model kollarda nefes/adım salınımı üretir.
- **Sıradaki ürün kararı:** Stage 12 ve Stage 13 geliştirmelerinin tamamlanmasının ardından yarışma öncesi animasyon ve simülasyon deneyiminin gözden geçirilmesi. JP2 decode/alignment bloke etmeyen ayrı iş; Stage 6 intake ve gerçek PLACES izi veri/erişim koşulludur.

