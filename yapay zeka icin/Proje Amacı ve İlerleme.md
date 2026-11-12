# Marswalk — Proje Amacı ve İlerleme

**Son güncelleme:** 12 Kasım 2026  
**Proje:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Hedef uygulama:** `C:\Users\Erdem\OneDrive\Desktop\nasa space apps\Sim`

Bu belge, projeyi devralan kişi veya başka bir yapay zekâ için adım adım devir notudur. Güncel kod ve birincil kaynaklar, eski notlardan daha güncel olabilir; çelişkide güncel kaynaklara bakıp bu notu düzelt.

## 1. Ürün vaadi ve sınırlar

Marswalk, kullanıcının Jezero haritasında astronotu klavyeyle yönettiği kısa, oynanabilir bir Mars yürüyüş deneyimidir. Kullanıcı rota çizgisi ve koridorla ilişkisini görür; konumundaki arşiv DTM kotu ve DTM’den hesaplanan eğim, kaynak/birim/yöntem bilgileriyle gösterilir. Challenge adı *Interplanetary Survival Guide: Martian Map*.

Ürün genel Mars fizik motoru, canlı NASA telemetrisi, gerçek rover kontrolü veya güvenlik/karar destek sistemi değildir. Rota sapması sadece seçilmiş senaryo çizgisine uzaklığı gösterir. 10 m/yan koridor uygulama varsayımıdır; güvenlik sınırı değildir. Bilimsel ölçüm, veri setinden hesaplanan sonuç, senaryo varsayımı ve UI değeri ayrı etiketlenmelidir.

**Kullanıcı etkileşimi:** WASD/oklarla astronot hareketi; P/Space duraklat/devam; R yeniden başlat; yakınlaştırma yalnız görünüm. Beklenen demo akışı 60–90 saniyedir.

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

### E. Kapsamı küçültme ve 2D oynanabilir MVP

Proje kapsamı kullanıcı kontrollü tek bir kısa harita deneyimi olarak sabitlendi. Node.js ≥20, bağımlılıksız vanilla JavaScript ES modules ve Canvas 2D ile `Sim` içinde uygulandı. Kullanıcı hareketi/saat/rota sapmasıyla DTM kot/eğim değerleri ve metadata paneli birleştirildi. DTM yoksa oyun açılabilir; katman unavailable olarak işaretlenir. Orto çözücü olmadığı için DTM’den türetilmiş hillshade kullanılır ve ortogörüntü diye adlandırılmaz.

### F. Hesaplama, veri ve render ayrımı

Saf jeo-uzamsal hesaplar `public/js/geo/geo.js` içinde; veri katmanı/sample durumları `public/js/surface/layers.js` içinde; kullanıcı simülasyonu `public/js/simulation/sim.js` içinde; Canvas görünümü `public/js/view/render.js` içindedir. `createWorldSnapshot()` surface provider’dan kot/eğim alır; `zM` Mars 2000 yüzey yüksekliğidir (astronot beden yüksekliği değil), no-data/unavailable durumunda `null` kalır. Snapshot kopyalanıp derin dondurulur. `public/js/view/hud.js` ve `render()` aynı snapshot’ı tüketir; renderer canlı `sim`/`layer`/`adapter` almaz. Debug handle yalnız `?debug=1` ile açılır.

### G. Regresyon kontrolü ve kullanıcı bildirimi

**[KULLANICI BİLDİRDİ]** Alparslan son regresyon kontrollerinin tümünün geçtiğini bildirdi. Kodlama ajanı bu notu hazırlarken `npm test`, smoke testi veya uygulamayı yeniden çalıştırmadı. Sonuçları bağımsız doğrulanmış gibi aktarma. Yeni koddan sonra regression testlerini yeniden çalıştırıp sonucu kullanıcıdan/çıktı loglarından teyit et.

### H. Manifest ve provider registry — kısmen tamamlandı

Güncel kodda `public/js/surface/registry.js` manifest alan doğrulayıcısı (`supported`, `needs_review`, `unavailable`, `invalid`), `SurfaceProviderRegistry`, fallback ve yerel HiRISE provider kaydı var. `main.js` registry’den varsayılan HiRISE’yi seçer; HUD validation/seçim raporunu gösterebilir. `test/core.test.mjs` synthetic manifest, belirsiz kayıt/ölçek, reddedilen candidate, fallback ve snapshot devamlılığı için test örnekleri içeriyor.

**Stage 6 tamam değil.** `Sim/data` içinde gerçek organizer verisi yok; desteklenen format şimdilik hazırlanmış `PDS3_PC_REAL_F32_WINDOW`. Registry gerçek yeni format parser’ı değildir; yeni candidate’ın loader’ı/CRS dönüşümü ayrıca yazılmalı. Kodun güncel statik incelemesinde dört fail-closed boşluğu göründü:

1. `license`/usage koşulu manifestte zorunlu ve validate edilmiyor; yalnız source/attribution aranıyor.
2. Mekânsal kapsam sadece `coverage.description` metniyle kontrol ediliyor; sayısal footprint ve rota/dünya çerçevesiyle kesişim doğrulanmıyor.
3. `verticalDatumVerified === false` `needs_review` yapıyor; bayrak yokken datum metni tek başına yeterli görülüp supported olabiliyor. Güvenli doğrulama için `true` açıkça aranmalı.
4. `expectedFrame` argümanı verilmezse CRS/grid karşılaştırması atlanabiliyor. Her doğrulama çağrısında kanonik çerçeve zorunlu olmalı.

Ek olarak `transformVerified` boolean’ı insan/loader iddiasıdır; yeni CRS dönüşümünü matematiksel olarak kendiliğinden doğrulamaz. Dönüşüm parametreleri ve footprint kanıtı doğrulanmalı. Bu boşluklar kapatılana ve gerçek kaynak incelenene kadar bilinmeyen candidate örneklenmemeli.

### I. Git ile ortak çalışma — yerel depo kuruldu; LFS push bekliyor

Workspace kökünde `emanzBey48/EA-Mars` için yerel Git deposu `main` dalında kuruldu; `origin` ayarlı ve AI başlangıç commit’i `54747f7` yerelde. Kimlik doğrulama tamamlandı fakat push sırasında Git LFS’in `github-cloud.s3.amazonaws.com` TLS sertifikası doğrulanamadı; remote’daki branch doğrulanmadı. Büyük IMG/JP2 ve `.f32` LFS’te, proje kodu ve AI yönergeleri aynı depoda. Workspace OneDrive altında olduğundan `.git` eşitleme çatışması riski vardır.

**AI commit kuralı:** Her önemli ve gözden geçirilebilir görev aşamasında yalnız ilgili dosyaları commit et; büyük işi tek commit’te biriktirme. Commit’ten önce staged diff’i gözden geçir. Görev branch’ini remote’a push et ki ekip arkadaşı değişiklikleri görebilsin. Push engellenirse commit hash’ini ve nedeni bildir, remote’a ulaştı iddiasında bulunma. AI kendi kimliğiyle commit etmeli; insanı taklit etmemeli.

## 3. Güncel kod yapısı ve çalışma

| Konum | Sorumluluk |
|---|---|
| `public/js/config.js` | Senaryo, waypoint, MAP_FRAME, rota caveat ve kaynaklar |
| `public/js/geo/geo.js` | Equirectangular/PDS grid/local metre transformu, segment uzaklığı, saf Horn gradyanı |
| `public/js/surface/layers.js` | `GridElevationLayer`, `UnavailableLayer`, `sampleSurface`, metadata ve no-data durumu |
| `public/js/surface/registry.js` | Manifest validator, SurfaceProvider registration/factory/fallback; şu an HiRISE default |
| `public/js/simulation/sim.js` | Hareket, saat, rota metrikleri, immutable `WorldSnapshot` |
| `public/js/input/input.js` / `public/js/view/hud.js` | Girişler ve DOM HUD; HUD snapshot tüketir |
| `public/js/view/render.js` | 2D Canvas kamera, görsel terrain asset’i ve snapshot çizimi |
| `scripts/extract-dtm.mjs` | Kaynak DTM’den altküme/metadata çıkarımı ve JP2 başlık incelemesi |
| `test/core.test.mjs` | Saf hesaplar, no-data, sim, snapshot ve registry birim kontrolleri |
| `scripts/smoke-e2e.mjs` | Başsız tarayıcı etkileşim/kabul kontrolü ve `test-output/` screenshot’ları |

PowerShell’de yerel çalıştırma:

```powershell
cd "C:\Users\Erdem\OneDrive\Desktop\nasa space apps\Sim"
npm start
```

Tarayıcı `http://127.0.0.1:8080/`. Node.js ≥20; paket/bağımlılık kurulumuna gerek yok. Gerekirse kaynak DTM’den altküme üretmek için `npm run prepare-data` (kaynak IMG/JP2 Sim’in bir üst klasöründe aranır). Birim testleri `npm test`; README smoke testi için Node.js ≥22 ve Edge/Chrome gerektiğini belirtir: `npm run smoke`. **Ajan, kullanıcı söylemedikçe çalıştırdığını iddia etmemeli.** Kullanıcı manuel regresyonun geçtiğini söyledi; bu bilgi “kullanıcı bildirimi” olarak kalmalı.

## 4. Kalan işler ve öncelik

1. **Stage 6 doğrulamasını kapat:** Lisans/usage alanı, sayısal spatial bounds/intersection ve zorunlu doğrulanmış düşey datum alanlarını validator’a ekle; transform/frame kontrolünü açık kanıtla fail-closed yap; synthetic valid/invalid testleri güncelle. İlk bounded kodlama promptu hazırlanmıştı; registry’nin son hali ise promptun bazı kısımlarını içeriyor, tüm boşlukları değil. Bir sonraki AI kodlama adımında güncel kaynak incelensin.
2. **Gerçek organizer dataset’i gelirse:** Önce dosya/label/SIS/provenance, format, CRS, birim/datum, zaman/kapsam, no-data, scaling/offset, lisans ve footprint doğrula. Uygun loader yoksa `UnavailableLayer`/HiRISE fallback kullan. Bilinmeyen CRS’i tahmin etme.
3. **PLACES raw CSV’yi engelsiz ağdan al:** PDS Search API ile doğrulanmış aynı release/product’ı indir; coordinate frame ve label/SIS ile Sol 120–164 gerçek polyline’ı çıkar, DTM footprint/no-data’yı kontrol et. Erişim yine bloklanırsa mevcut simplified line ve görünür caveat kalır.
4. **Demo freeze:** Etkinlik tarihleri 14–15 Kasım 2026 olduğu kullanıcı tarafından bildirildi; 12 Kasım itibarıyla yaklaşık iki gün var. İlk demo için özellik eklemeyi erken dondur, kullanıcı akışını ve attribution/fallback’i göster; son 4 saatte yalnız kritik hata düzelt.
5. **3D:** Etkinlik sonrasına ertelendi. Önce mevcut `WorldSnapshot` ve surface adapter korunarak renderer spike yap; Mars 2000 `zM` ile display vertical offset’i ayır. Yeni motor/ekonomi ancak açık kapsam ve zaman varsa.

## 5. Kaynaklar ve atıf

- [HiRISE Jezero ürünü](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985)
- [HiRISE RDR/DTM SIS](https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF)
- [Mars 2020 PDS Initial Reports](https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf)
- [PDS PLACES](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm)
- [NASA PDS Search API kılavuzu](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html)

Kaynak rasterın ölçüm/ürün değeri, bu uygulamanın türettiği profil/eğim, senaryo koridoru ve görsel sunum ayrı tutulmalı. Ürün atfını göster; lisans/usage koşulu bulunmadan şart uydurma.
