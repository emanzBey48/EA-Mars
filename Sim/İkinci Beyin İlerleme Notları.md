# Marswalk — İkinci Beyin İlerleme Notları

**Güncelleme:** 12 Kasım 2026  
**Kapsam:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Notun amacı:** Doğrulanmış proje bağlamını, geçerli kararları ve sıradaki işi tek yerde tutmak.

## Bilginin durumu

- **[DOSYA/KAYNAKLA DOĞRULANDI]**: Sim içindeki mevcut kaynak ve metadata’da görülen bilgi veya doğrudan birincil kaynakta desteklenen bulgu.
- **[KULLANICI BİLDİRDİ]**: Kullanıcının paylaştığı bilgi; bağımsız test sonucu anlamına gelmez.
- **[AÇIK]**: Henüz uygulanmadı, doğrulanmadı veya dış veriye erişim bekliyor.

## Ürün hedefi ve kapsam

**[KARAR]** Challenge, *Interplanetary Survival Guide: Martian Map*. Kullanıcı Marswalk’ta astronotu kendisi kontrol eder; rota üzerindeki ilerleme, koridor dışına çıkma ve az sayıda kaynaklı arazi göstergesi anlaşılır biçimde sunulur. Bu, genel Mars fizik motoru veya güvenlik/karar destek sistemi değildir.

**[DOSYA/KAYNAKLA DOĞRULANDI]** İlk oynanabilir MVP 2D kanvas haritasıdır: WASD/ok tuşlarıyla hareket, senaryo saati, duraklat/devam, yeniden başlat, rota sapması ve koridor, DTM kotu ile 3×3 Horn eğimi. HiRISE’den türetilmiş gölgeli kabartma görsel amaçlıdır; ortogörüntü değildir.

**[YÖN/KARAR]** İleride 3D’ye geçiş düşünülebilir; henüz 3D uygulama yok. Geçişten önce jeo-uzamsal/çevresel hesaplamalar, simülasyon durumu ve UI/render durumu kararlı sözleşmelerle ayrılmalı. Fizik ve veri hesapları saf/deterministik kalmalı; renderer kamera, sprite, animasyon ve etiketleri yönetmeli. Veri örnekleri/snapshot’lar kopyalanmış ve değiştirilemez olmalı.

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

- `public/js/geo.js`: equirectangular/PDS dönüşümleri, yerel dünya–piksel eşlemesi, nokta-segment uzaklığı, saf Horn 3×3 gradyanı.
- `public/js/layers.js`: metadata descriptor’ı, `GridElevationLayer`, kot/eğim örnekleme, no-data/out-of-bounds/unavailable durumları, DTM yükleme.
- `public/js/sim.js`: kullanıcı hareketi, senaryo saati, faz, rota ilerlemesi/sapması.
- `public/js/render.js`: kamera, terrain görseli ve Canvas çizimi.
- `public/js/input.js`: klavye/fare ve kontrol bağlama.
- `public/js/hud.js`: DOM panelleri ve göstergeler.
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

**[KULLANICI BİLDİRDİ]** Alparslan uygulamayı yerel olarak test ettiğini söyledi. Başarılı/başarısız sonucu veya hangi kontrollerin tamamlandığı henüz bildirilmedi. Bu notta hiçbir test veya uygulama çalıştırılmadı.

## Kararlar ve açık konular

### Kararlar

1. Kullanıcı kontrollü 2D Marswalk MVP korunur; 3D şimdilik kapsam dışıdır.
2. PLACES polylinesi alınana kadar rota düz çizgisi açıkça “basitleştirilmiş waypoint bağlantısı” olarak etiketlenir.
3. DTM kotu arşiv ürününden örneklenen değer; eğim DTM’den hesaplanan değer; oyuncu konumu/saat/hız/koridor senaryo/UI değeridir.
4. No-data ve unavailable değerleri sıfıra çevrilmez; güvenlik iddiası veya skor üretilmez.

### Açık konular

- Yerel kullanıcı testinin sonucu ve demo öncesi kalan UX sorunları.
- `SurfaceProvider → immutable WorldSnapshot/RenderFrame` refaktörünün başka AI tarafından uygulanıp uygulanmadığı; mevcut kaynakta henüz görünmüyor.
- PLACES ham CSV’nin engelsiz ağdan alınması, etiket/SIS ve koordinat çerçevesinin doğrulanması.
- DTM–JP2 yarım piksel kayıt farkının gerektiğinde piksel merkezi/köşesi düzeyinde bağımsız yeniden teyidi.

## Önerilen sonraki somut adım

**Stage 6 validator boşlukları:** Registry/provider iskeletini yeniden yazma. License/usage, sayısal footprint ve route intersection, `verticalDatumVerified === true`, zorunlu `expectedFrame` ve doğrulanabilir dönüşüm kanıtını fail-closed tamamla; yalnız bu görev için sentetik testleri güncelle. Gerçek organizer verisi gelmeden yeni adapter uydurma.

## Git çalışma kuralı

Workspace kökündeki `emanzBey48/EA-Mars` için yerel `main`, `origin` ve `54747f7` başlangıç commit’i vardır. Git LFS push sertifika doğrulamasında başarısız oldu; remote durumu doğrulanmış değildir. AI’lar her önemli ve gözden geçirilebilir görev aşamasında ilgili değişiklikleri ayrı commit etsin; staged diff’i önceden incelesin ve paylaşım için branch’ini push etsin. Push başarısızsa commit hash’ini ve hatayı bildir, TLS doğrulamasını kapatma. Alparslan entegrasyon sahibi olarak PR/diff’i inceler. Testler yalnız kullanıcı istediğinde çalıştırılır.

**Teammate:** Becerileri ve ilgisi öğrenilene kadar sabit kod görevi atanmadı. Uygunsa PLACES kaynak/koordinat doğrulaması veya demo QA ayrı koşullu paket olabilir.

