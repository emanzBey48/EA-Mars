# Marswalk — Tam Proje Yol Haritası

**Son güncelleme:** 14 Kasım 2026
**Proje:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Bu belge:** Kodlama planı ve karar kaydıdır; uygulama/test çalıştırma kaydı değildir.

## Durum etiketleri ve bilgi kaynağı

- **TAMAMLANDI — dosya/kaynakla:** Güncel dosyalar veya birincil kaynak bunu destekliyor.
- **TAMAMLANDI — kullanıcı bildirimi:** Kullanıcı tamamlandığını söyledi; bağımsız doğrulama yapılmadı.
- **AÇIK:** İş sürüyor veya teslimi henüz kodda görünmüyor.
- **BEKLEMEDE:** Bağımlılık/etkinlik zamanı gelene kadar ertelendi.
- **KULLANICI BİLDİRDİ:** Kullanıcı tarafından iletilen tarih/test bilgisi; bağımsız doğrulama değildir.

**[KULLANICI BİLDİRDİ]** Etkinlik tarihleri 14–15 Kasım 2026 olarak bildirildi; bu tarih bilgisi resmi takvimden bağımsız doğrulanmış değildir.

**[KULLANICI BİLDİRDİ]** Alparslan regresyon kontrollerinin tümünün geçtiğini söyledi. Ayrıca 13 Kasım'da kullanıcı simülasyonun açıldığını, arayüzde “Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor)” uyarısını gördüğünü ve mevcut 3D görünümün hedef FPS deneyimine yakın olmadığını bildirdi. Bu kullanıcı gözlemleri bağımsız runtime kabulü değildir.

## Güncel yürütme kararı — 14 Kasım 2026

**Dosya ve Git ile doğrulandı:** Çalışma dalı `alparslan/stage14-kinematics-visuals-integration`, HEAD `18b4137`. Stage 13 rig pozları `653bf73`, Stage 14 suit/eklem ayrıntıları `e14b661`, renderer/kamera entegrasyonu `502d76c` ve son koordinat/HUD/view-model düzeltmeleri `18b4137` ile kaynakta mevcut. Aşağıdaki eski “Stage 13 sıradaki iş” ve “önce Stage 6” ifadeleri tarihsel plan olarak okunur; bu yürütme kararı onların yerine geçer. Stage 6 yeni USGS adayının ürün özelinde düşey datum kanıtı gelene kadar `needs_review` durumunda kalır; kullanıcı bu turda Stage 6 üzerinde çalışma istemedi.

**Alparslan — sıradaki entegrasyon görevi: Stage 13/14 görsel kabulü.** İnceleme sınırı `Sim/public/js/main.js`, `Sim/public/js/view/3d/renderer.js`, `camera.js`, `Sim/scripts/smoke-e2e.mjs`; teslim dosyası `Sim/stage14-visual-acceptance.md` olur. Başlangıç, yürüyüş, sıçrama yükseliş/tepe/iniş, iniş toparlanması, duraklatma, bilinmeyen temas ve 2D fallback için mevcut smoke kapsamını ve eksik görüntüleri kaydeder. Kabul: her durum için gerçek tarayıcı gözlemi/görüntüsüyle alt kadrajdaki kolların ve gövdenin okunabilirliği, kesilme/örtüşme, kot bilinmezliği uyarısı ve fallback sonucu açıkça geçer/kalır diye raporlanır. Statik kod incelemesi veya mevcut PNG tek başına görsel kabul değildir. Uygulama/test çalıştırma ve kod değişikliği, kullanıcı ayrıca açıkça istemeden bu görev kapsamında yapılmaz; o zamana kadar raporda kabul beklemede denir. Kusur bulunursa düzeltme ayrı tek kabul ölçütlü işe ayrılır.

**Efe — paralel bağımsız rig denetimi.** Salt okunur kaynak sınırı `Sim/public/js/view/3d/astronaut-rig.js` ve `Sim/test/astronaut-rig.test.mjs`; teslim dosyası `Sim/stage14-rig-audit.md` olur. Alparslan'ın entegrasyon dosyalarını düzenlemez. `timeS`, hızlar, `grounded`, `airborne`, `phase`, `landingRecovery`, `landingRecoveryFrac` ve `groundContactStatus` girdileri için idle/walk/ascent/apex/descent/landing/unknown pozlarının deterministik beklenenlerini ve first-person parça listesini kısa bir denetim matrisiyle verir. Kabul: her pozun girdi koşulu, beklenen eklem/alt kadraj davranışı ve bilinmeyen temas sınırı kaynak satırıyla gösterilir; fiziksel suit biyomekaniği iddiası kurulmaz. Görsel kabulde rig kaynaklı kusur bulunursa yalnız kendi rig dosyası/test kümesi için ayrı branch ve düzeltme görevi açılır; aynı dosyada eşzamanlı çalışma yapılmaz.

**Doğrulama ayrımı:** Bu plan için kaynak/Git statik olarak incelendi; mevcut Stage 13/14 entegrasyonu bu turda uygulama, smoke veya birim testiyle çalıştırılmadı. Önceki test sayıları yeni görsel kabulün sonucu değildir. Entegrasyon ve son kabul sahibi Alparslan'dır.

**Teslim ve paylaşım:** Alparslan ve Efe kendi rapor görevleri bittiğinde yalnız ilgili teslim dosyasını `git status` ve staged diff ile denetleyip kısa ömürlü kendi dallarında açıklayıcı commit atar ve remote'a push eder. Kullanıcıya commit hash'i, push sonucu ve çalıştırılmamış testleri açıkça bildirirler; push hatasında yerel commit'i paylaşılmış gibi sunmazlar. Mevcut kullanıcı belge, ekran görüntüsü, TIFF ve `.crdownload` değişiklikleri görev commit'lerine eklenmez.

## 14 Kasım 2026 — USGS DTM migration bağımsız inceleme kararı

**Durum: FAIL / kabul edilmedi.** `eb385ea` üzerindeki `codex/data-jezero-1m-dtm` commit’i yeni USGS Mars 2020 TRN HiRISE DTM Mosaic’e geçişi ve TIFF pencereli yükleyici/provider’ı ekledi; commit remote’a push edilmişti. Bağımsız inceleme, Stage 6 veri kaynağı kabulü için aşağıdaki engelleri buldu. Stage 13 hâlâ ayrı Efe görevidir, ancak şu anki sıradaki kod işi değildir: önce Alparslan bu blokları giderir ve bağımsız kabul ister.

- `extract-dtm.mjs` ürün kimliği, boyut, tiepoint/yarıçap, no-data, geçerli değer aralığı, datum ve lisans gibi kritik değerleri TIFF etiketlerinden kanıtlamadan varsayıyor/sabitliyor; strip düzeni ve sıkıştırma doğrulanmıyor.
- Registry’de boolean/metin bayrakları ve `frameMatchesConfig` “supported” durumuna geçirebiliyor, ancak bağımsız dönüşüm/rezidüel kanıtı yok. Piksel kontrolü yalnızca değerin sonlu olup olmadığını test ediyor.
- Resmî ürün etiketi/SIS, provenance, datum ve lisans-kullanım QC kapısı kapatılmadı. USGS release sayfası hak bilgisini tam olarak “This work is marked with CC0 1.0 Universal” diye verir ([USGS data release](https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic)); bu kaynak ifadesi manifest/doğrulayıcıya bağlanmalı, dosya/ürün kimliği ve kullanım kaydı ayrıca doğrulanmalıdır.
- Yeni migration için bağımsız kabul testi/çalıştırması yapılmadı. Stage 8–12 için geçmişte kaydedilmiş test sonuçları yeni terrain kabulü değildir.

**Tarihsel Stage 6 kod görevi (Alparslan):** çıkarıcıyı TIFF tag’leri/strip ve compression düzeni doğrulanmadan veri üretmeyecek biçimde fail-closed yap; manifestte kaynak, ürün kimliği, datum, lisans ve kullanım şartını birincil kayda bağla; kanonik frame/footprint ve raster dönüşümünü sayısal test/rezidüel kanıtıyla doğrula; ardından bağımsız review ve açıkça istenen kabul çalıştırmasına sun. Güncel yürütme önceliği belgenin başındadır.

İnceleme anında working tree’de legacy IMG/JP2 silme kayıtları ile camera/renderer/test/screenshot değişiklikleri ve TIFF/`.crdownload` untracked dosyaları vardı. Bunlar `eb385ea`’e veya yalnız notları kapsayan commit’e atfedilmez.

## Ürün hedefi ve kapsam sınırları

Marswalk’ın nihai ürün vizyonu, oyuncunun Mars yüzeyinde astronotu **birinci şahıs bakışla keşif amacıyla** yönettiği ayrıntılı, kullanıcı kontrollü bir 3D simülasyondur. “FPS” first-person kamera/kontrol anlamındadır; shooter, silah veya çatışma mekaniği değildir. Çalışan 2D Canvas MVP ve WebGL2 terrain görüntüleyicisi bu hedefe giden ara kilometre taşlarıdır; Stage 10 first-person/rig dikey dilimi eklense de nihai deneyim değildir. Kullanıcının 13 Kasım’daki “3D deneyim hedefe yakın değil” bildirimi Stage 10 entegrasyonundan önceki görünüm içindir; sonraki dilimin bağımsız doğrulaması ayrı kayıtlıdır. Seçili resmi challenge: *Interplanetary Survival Guide: Martian Map*.

**Bilimsel/ürün sınırı:** Canlı NASA telemetrisi izlenimi, gerçek rover karar desteği, güvenli/güvensiz rota kararı veya veriyle desteklenmeyen risk/güvenlik skoru üretme. FPS hareketi Mars yerçekimi ve atmosfer koşullarını dikkate almalı; sayıların birimi, birincil kaynak, uzamsal/zamansal kapsam ve senaryo varsayımları ayrı gösterilmeli. Astronot/giysi kütlesi ve aerodinamik katsayıları kaynaksızsa atmosfer sürüklemesini gerçekçi fizik gibi uygulama. 14 Kasım 2026 itibarıyla kullanıcı eski IMG DTM ve JP2 orto dosyalarının geçersiz olduğunu bildirdi; bunları aktif veri girdisi veya otomatik fallback olarak kullanma. Yeni raster ancak provenance, datum, lisans/kullanım ve uzamsal uygunluğu doğrulandıktan sonra ana yüzey kaynağı olabilir.

NASA başlangıç referansları: yüzey yerçekimi NASA Planet Compare'da 3.71 m/s², NASA NSSDC Mars Fact Sheet'te yaklaşık 3.73 m/s² olarak yuvarlanır; kaynak/yuvarlama farkı saklı tutulur. NSSDC ortalama yüzey basıncını 6.36 mbar (mevsimsel 4.0–8.7 mbar), yüzey yoğunluğunu yaklaşık 0.016 ± 0.006 kg/m³ ve atmosferin hacimce çoğunluğunu CO₂ (~95.1%) olarak listeler. Bunlar Jezero'da belirli bir sol/saate ait atmosfer ölçümü değildir. [NASA Planet Compare](https://solarsystem.nasa.gov/planet-compare/?intent=121), [NASA NSSDC Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html).

## Bilimsel veri zemini ve kurallar

### Yerel rasterlar

**[TARİHSEL METADATA; AKTİF GİRDİ DEĞİL]** Önceki DTM `DTEEC_045994_1985_046060_1985_U01.IMG` için kaydedilmiş PDS3 metadata: 6673×14266 piksel, yaklaşık 1.009663 m/piksel, 32-bit PC_REAL, Mars 2000 eşpotansiyel yüzeyine göre metre. Equirectangular, planetosentrik enlem, 15° standart paralel, merkez meridyen 77.44°E, yarıçap yaklaşık 3394.8398 km; no-data `FF7FFFFB`, geçerli aralık yaklaşık −2679.20…−2388.31 m. **[KULLANICI BİLDİRDİ]** Bu DTM ile `ESP_046060_1985_RED_C_01_ORTHO.JP2` geçersizdir; sebep henüz belgelenmedi. Aşağıdaki tarihsel rota/profil ve stage kayıtları eski veriyle yapılmış kayıt olarak kalır, yeni veri için doğrulama sayılmaz.

Eski orto `ESP_046060_1985_RED_C_01_ORTHO.JP2` için aynı boyut/CRS, yarım piksel kayıt notu ve decoder sınırlaması yalnızca tarihsel kayıttır; kullanıcı bu dosyanın geçersiz olduğunu bildirmiştir. Kullanılabilir yeni ortogörüntü bildirilmedi. Hillshade hiçbir zaman orto diye adlandırılmaz.

**[KULLANICI/TEKNİK METADATA BİLDİRİMİ; ÜRÜN KABULÜ DEĞİL]** Yeni aday `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`, 1,839,545,409 bayttır. TIFF metadata incelemesi 21,400×21,488, tek bant float32, sıkıştırmasız, 1 m/piksel, `PixelIsArea`, no-data `-3.40282265508890445e+38` ve user-defined equirectangular Mars Sphere frame’i (yarıçap/semi-axes 3,396,190 m, lat_ts=0, lon₀=0) gösterdi. Raster köşe kapsamı X=4,577,366…4,598,766 m, Y=1,085,130…1,106,618 m. Sol 120/WB1 (4,590,789.880; 1,092,970.249 m; sütun/satır 13,423/13,647) ile Sol 164/Roubion (4,590,923.166; 1,092,295.952 m; 13,557/14,322) raster içinde; örnek değerleri sırasıyla −2568.0872 m ve −2584.9160 m. Bu iki noktanın hücreleri geçerli görünür; **tüm rota boyunca no-data taraması yapılmadı**. Dosya boyutu/TIFF şeritleri/EOF tutarlı, tam dosya hash’i alınmadı. Bu TIFF incelemesi resmi label/SIS, kaynak/provenance, düşey datum, lisans/kullanım koşulu veya DTM kotlarının bilimsel yorumunu doğrulamamıştır; nokta kotlarını eski DTM/PDS değerleriyle eşdeğer kabul etme.

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

Aşama numaraları yürütme sırası değildir. **Güncel durum (14 Kasım 2026):** Stage 8–12 tarihsel kabul kayıtlarına sahiptir; Stage 13/14 kodu ve entegrasyonu `653bf73`, `e14b661`, `502d76c` ve `18b4137` içinde bulunur. Güncel görsel kabul açık kalır; sonraki Alparslan/Efe görevleri bu belgenin başındaki yürütme kararındadır. Yeni USGS GeoTIFF adayının düşey referansı ürün özelinde kanıtlanmadığı için `needs_review` sürer; eski HiRISE fallback kodda korunur. Ortogörüntü decoder/hizalaması ayrı iştir.

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

### 6. Yeni raster intake ve adapter kayıt katmanı — KISMEN TAMAMLANDI; yeni GeoTIFF doğrulaması açık

- **Amaç:** Yeni GeoTIFF adayını, kaynak/datum/kapsam doğrulandıktan sonra mevcut `SurfaceProvider`/snapshot yoluna bağlamak; belirsiz veriyle yanlış bilimsel değer üretimini engellemek.
- **Mevcut kaynak:** `public/js/surface/registry.js` manifest validator’ı, `SurfaceProviderRegistry`, HiRISE sağlayıcı/factory ve fallback’i içeriyor. `main.js` varsayılan HiRISE sağlayıcısını seçiyor; HUD doğrulama/seçim durumunu gösterebiliyor. `test/core.test.mjs` sentetik manifest ve fallback kontrolleri içeriyor.
- **Açık çıktı:** Eklenmiş TIFF adayının resmî ürün label/SIS ve kullanım koşullarını doğrula; düşey datum/provenance’ı kanıtla; tüm demo alanı ve rota boyunca footprint/no-data kapsamını çıkar; yeniden çerçeveleme ve raster hazırlama yöntemini belirle. Bu artık “veri gelmesini bekleme” işi değil, **resmi metadata doğrulama kapısıdır**. Kanıt geçerse yeni TIFF için bounded-window ingest/adapter tasarla ve registry geçişini yap. Veri/etiket belirsizken yeni formatı veya değerleri supported sayma.
- **Sahip:** Alparslan (factory/entegrasyon). Efe'nin becerisi ve kapasitesi uygunsa ayrı manifest/atıf denetimi veya test QA paketi alabilir.
- **Bağımlılık:** Aşama 4 SurfaceProvider/WorldSnapshot; yeni TIFF’in resmi tanımlayıcıları ve kullanım koşulu erişilebilir olmalı. Eski IMG/JP2 kullanıcı bildirimine göre geçersiz ve çalışma ağacında silinmiş görünüyor; dosya değişikliklerine dokunma.
- **Mevcut açıklar:** (1) license/usage alanı yok ve doğrulanmıyor; (2) coverage yalnız `description` metniyle denetleniyor, sayısal footprint ve rota/dünya kesişimi doğrulanmıyor; (3) `verticalDatumVerified` yalnız `false` iken review oluşturuyor, alan yokken manifest supported olabilir; (4) `expectedFrame` `validateLayerManifest()` için opsiyonel ve verilmezse CRS/grid karşılaştırmaları atlanıyor; `transformVerified` bayrağı dönüşümü matematiksel olarak doğrulamıyor.
- **Kabul:** Yeni rasterın kaynak, datum, lisans/kullanım, frame dönüşümü, sayısal footprint ve tüm rota no-data durumu belgelendirilmiş doğrulanabilir kanıtla geçer; geçmezse aktif örnekleme olmaz. Başarılı geçişte 2D ve 3D aynı yeni provider/snapshot sözleşmesini kullanır. Registry’nin fallback kabiliyeti korunur; fallback yalnız ayrı doğrulanmış/kullanılabilir HiRISE provider’a gider. Kullanıcı tarafından geçersiz bildirilen mevcut IMG/JP2 provider olarak seçilmez; kullanılabilir doğrulanmış provider yoksa katman `unavailable` olur.
- **Tahmin:** Kodun yeni denetiminden önce süre tahmini verilmesin. Gerçek format geldiğinde adapter kapsamı o verinin label/SIS ve dönüşümüne göre ayrıca belirlenir.
- **Kesme çizgisi:** Bilinmeyen CRS/datum’ı “otomatik algılama” ile içeri alma. Doğrulama/adapter tamamlanamıyorsa eski fixture’a sessizce dönme; katmanı `unavailable` bırakıp UI’da ve demo planında durumu açıkça göster.

**Not:** Registry/manifest validator kaynakta mevcut, ancak desteklenen mevcut biçim hazırlanmış `PDS3_PC_REAL_F32_WINDOW` ve varsayılan provider eski HiRISE DTM’dir. Yeni GeoTIFF’in kayıt/loader biçimi henüz uygulanmış veya doğrulanmış değildir. Eski validator test kayıtları yeni TIFF kabulü sayılmaz.

### 7. Gerçek PLACES traverse doğrulaması — AÇIK / 3D dikey dilimden sonra ayrı dış veri işi

- **Amaç:** Basitleştirilmiş çizgiyi gerçek traverse ile, erişilebilir olduğu ölçüde değiştirmek veya karşılaştırmak.
- **Çıktı:** PDS release/ürün kimliği doğrulanmış ham lokalizasyon dosyası ve PDS4 label/SIS; Sol 120–164 kayıt filtresi; koordinat/frame dönüşümü; DTM extent ve no-data filtresi; gerçek polyline uzunluk/profil karşılaştırması.
- **Sahip:** Alparslan; Efe'nin erişimi varsa indirme/label incelemesine destek vermesi koşullu.
- **Bağımlılık:** PDS’nin raw CSV’sine engelsiz erişim ve coordinate frame belgeleri.
- **Kabul:** Üçüncü taraf yerine PDS primary file; koordinatlar dokümana göre dönüştürülmüş; footprint/no-data gerçekten kontrol edilmiş; yol noktaları/ölçüm zamanları kaynağıyla sunulmuş. Erişim yoksa mevcut çizgi simülasyonda kalır ve “gerçek PLACES değil” etiketi korunur.
- **Tahmin:** 2–4 saat erişim sağlandığında; 45–60 dakika endpoint denemesinden sonra engel tekrarlanırsa park et ve hackathon demosunu bloke etme.

### 8. Demo kapsamı ve sunum akışı — TAMAMLANDI

- **Amaç:** Kısa, tekrar edilebilir ve bilimsel sınırlamaları açık demo hazırlamak.
- **Çıktı:** 3D `?view=3d` doğrudan açılış parametresi, başlangıçta Sol 164 Roubion fenerine hedef kilidi (`targetYawRad`), first-person ekran nişangahı (`#fp-reticle`), ekran içi HUD kontrol kapsülü (`#fp-hud-hint`) ve Sol 164 varış başarı rozeti entegre edildi. 2D fallback tam olarak korunur.
- **Sahip:** Alparslan (entegrasyon ve demo sunumu).
- **Kabul:** Yeni makinede README adımları; WASD, duraklat, koridor dışı/geri dönüş ve katman unavailable durumu denenmiş; gerçek PLACES değil ve güvenlik aracı değil açıklaması gözle görünür; attribution okunabilir. Bağımsız testlerde 24/24 unit test, 32/32 smoke testi ve 60.4 FPS geçmiştir.

### 9. 3D terrain viewer — İLK RUNTIME KABULÜ TAMAM; SON OPTİMİZASYON REGRESYONU SIRADA

- **Amaç:** Doğrulanmış HiRISE DTM/fixture’ını kaynağı değiştirilebilir provider sınırında tutarak 3D terrain ve snapshot-driven renderer için teknik taban sağlamak. Bu orbit-camera viewer, nihai FPS keşif deneyimi değildir.
- **Çıktı:** Aşamalı 3D sahne/terrain ve etkileşim. Terrain mesh ve no-data boşlukları; kullanıcı kontrollü astronot/avatar; kamera ve temel aydınlatma; mevcut WorldSnapshot/HUD ile entegrasyon. Ayrı render modülü; Mars 2000 bilimsel `zM` ile görsel vertical scale/offset kararı yazılı. 2D renderer ara sürüm/fallback olarak korunur.
- **Sahip:** Alparslan runtime/scene/camera seçimi ve uygulama entegrasyonunun; Efe renderer’dan bağımsız CPU terrain mesh builder’ın sahibidir.
- **Bağımlılık:** Aşama 4 WorldSnapshot/SurfaceProvider sınırı; başlangıç verisi olarak yerel HiRISE fixture. Organizer verisi gelirse aşama 6 intake tamamlanmadan ona geçme.
- **Kabul:** 3D yalnız mevcut arşiv/hesaplanan veriyi doğru provenance ile sunar; `zM` kaynak kotu olarak kalır ve görsel dikey abartıdan ayrılır; no-data mesh’te sahte sıfır yüzey üretmez; `zM=null` iken 3D avatar modeli gizlenip yatay konum ve “yükseklik bilinmiyor” durumu HUD/ekran göstergesinde korunur; avatar ve kamera snapshot/sim kurallarıyla çalışır; 2D sürüm açılabilir kalır.
- **Tarihsel ilk kabul (13 Kasım 2026):** Stage 9 kabul düzeltmeleri `d471d6a` commit’inde; o turda `npm test` 13/13, `npm run smoke` 26/26 geçti. Başsız smoke ölçümü 1.93 sn mesh CPU / 3.21 sn ilk 3D geçişi ve 29.1 FPS verdi; FPS ortam koşullarına duyarlıdır, GPU belleği ölçülmedi. Sonraki `661d9c7` optimizasyonu `643026b` ile entegre edildi.
- **Güncel kapanış:** `fbc623f` üzerinde optimizasyon sonrası birleşik sürüm bağımsız olarak denetlendi; `npm test` 18/18 ve `npm run smoke` 32/32 geçti. İlk bağımsız smoke turundaki iki mevcut 2D timing kontrolü tekrar çalıştırmada geçti. Stage 9 regresyon kontrolü artık beklemede değildir.

### 10. Birinci şahıs Mars keşfi ve karakter hareketi — ENTEGRASYON TAMAMLANDI

- **Amaç:** Terrain viewer'ı FPS/first-person keşif yönünde ilerletmek: göz hizası kamera, kamera yönüne göre hareket, DTM üzerinde zemin teması ve kaynaklı Mars yerçekimiyle düşey hareket. Bu shooter değildir.
- **Çıktı:** Küçük ve oynanabilir first-person dikey dilim; simülasyon zaman adımına bağlı hız/ivme ve zemin teması kuralları; 3D kamera/input/snapshot entegrasyonu. Oyuncu ayak/beden yüksekliği, kaynak yüzey kotu `zM` ve görsel `zDisplay` ayrı temsil edilir. Astronot rig/pozu ayrı modülde hazırlanır ve sonra renderer’a bağlanır.
- **Sahiplik:** Tamamlanan Stage 10 paketinde Alparslan `main.js`, `config.js`, `simulation/`, `input/`, `view/3d/camera.js`, `renderer.js` ve snapshot/provider entegrasyonunu koordine etti; Efe `view/3d/astronaut-rig.js` içinde renderer’dan bağımsız, sunum amaçlı parça geometrisi ve poz üreticisini sağladı. Ortak hareket API’si `timeS`, yatay/düşey hız, `grounded`, açık jump trajectory `airborne`, `phase` ve `groundContactStatus` alanlarını taşır. Gelecek işlerde de entegrasyon sıcak noktalarının tek sahibi Alparslan’dır; Efe’ye yeni modül/QA paketi açık dosya sınırıyla ayrıca atanır. Aynı dosya kümesi eşzamanlı düzenlenmez.
- **Bağımlılık:** Stage 9 runtime kabulinde HiRISE 3D terrain akışının kullanılabilirliği; Stage 4 snapshot/provider sınırı; HiRISE DTM fixture. Yarışma dataset’i veya yeni terrain adapter gerekmez.
- **Fizik/atmosfer:** Model parametreleri NASA birincil kaynak, birim ve kapsamla belgelensin. 3.71 ve 3.73 m/s² kaynak yuvarlamaları açık tutulup seçilen g girdisi gerekçelendirilsin. Basınç/yoğunluk genel/ortalama referans olarak etiketlensin. İnsan/giysi kütlesi, kesit alanı, sürükleme katsayısı ve yerel rüzgâr doğrulanmadan bunların etkisi gerçekçi karakter fiziği diye sunulmasın; atmosfer girdisi parametrelenmemişse sayısal kuvvet eklenmesin.
- **Kabul:** Kamera göz hizasında oyuncu konum/yönünü izler; bakış açısı kullanıcı kontrolündedir; kamera yönüne göre normalize edilmiş hareket; simülasyon zaman adımından bağımsız tutarlı hareket ve pause/restart; geçerli DTM kotuna basma; no-data/invalid/out-of-bounds/unavailable kot sıfıra çevrilmeden açık fallback; `zM` ile görsel Z ayrımı; 2D fallback korunur. Efe’nin animasyon modülü aynı girdi için deterministik idle/walk/stop/airborne pozları verir; renderer entegrasyonu sonrası first-person görünümde kolların/gövdenin kadrajda okunabilirliği ayrıca gözden geçirilir.
- **Durum (13 Kasım 2026):** Stage 10 kod paketi `fbc623f` (`feat: integrate astronaut rig into first-person renderer`) ile tamamlandı ve origin’e push edildi. Alparslan first-person kamera/yönlü hareket/DTM teması/kaynaklı Mars g girdisi ile rig renderer entegrasyonunu; Efe renderer’dan bağımsız `astronaut-rig.js` parça şablonu ve deterministik poz üreticisini sağladı. Snapshot API’si `grounded`, açık `airborne` jump niyeti ve `groundContactStatus` değerlerini ayırır; bilinmeyen temas tek başına yerçekimi başlatmaz veya uçuş pozu iddia etmez. Bilinmeyen kotta dünya rig’i gizlenir, first-person view-model retained kamera pozu varsa kalabilir. Bağımsız doğrulama `npm test` 18/18, `npm run smoke` 32/32 geçti. Bu, nihai ürün tamamlandı anlamına gelmez; UX gözden geçirmesi ve demo kararı sürer.

### 11. 3D Waypoint beacon'ları ve rota kılavuz geometrisi (marker-mesh) — TAMAMLANDI

- **Amaç:** Stage 8 first-person demo akışında astronotun arazide ilerlerken hedefini (Sol 164 / Roubion), başlangıç noktasını (Sol 120 / WB1) ve basitleştirilmiş rota koridorunu 3D uzayda görebilmesini sağlamak; renderer'dan bağımsız saf geometri üretmek.
- **Çıktı:** `Sim/public/js/view/3d/marker-mesh.js` içinde `buildMarkerMeshes({ waypoints, routePoints, corridorWidthM, displayConfig })` API'si ve `Sim/test/marker-mesh.test.mjs` testleri. Sol 120 ve Sol 164 zemin beacon'ları (kaide, dikme, fener), rota boyunca zemin kılavuz şeridi/segmentleri, ±10 m senaryo koridor sınır işaretleri. Saf `Float32Array`/`Uint32Array` geometri veya parça tanımları, derin dondurulmuş veri yapısı ve PDS/sadeleştirilmiş rota caveat metadata'sı.
- **Sahip:** Efe (bağımsız 3D geometri modülü); Alparslan (renderer entegrasyonu).
- **Bağımlılık:** Stage 10 first-person temeli; `config.js` waypoint koordinatları ve DTM yüzey kotu. Renderer entegrasyonu Alparslan'da kalır.
- **Kabul:** WebGL veya DOM nesnesi döndürmez; saf veri üretir. `npm test` altında deterministik 6 birim testi (toplam 24/24) geçer. Sol 120/164 PDS koordinatları ve rota basitleştirilmiş bağlantı caveat'ı metadata içinde taşınır. Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` dosyalarına dokunmaz.
- **Durum:** `8054b1a` ile tamamlandı, Alparslan renderer'a entegre etti; bağımsız birim testleri (24/24) geçti.

### 12. Mars Düşük Yerçekimi Zıplama Fiziği ve Kamera Dinamiği (Alparslan) — TAMAMLANDI

- **Amaç:** Mars'ın 3.71 m/s² yerçekimi altında astronotun zıplama fiziğini gerçekçi kılmak (uzun havada kalma süresi ~1.3 saniye, havada yatay momentumun korunumu / balistik ark, iniş darbe sönümleme süresi / landing impact absorption). Birinci şahıs kamerada adım kafa salınımı (head-bobbing) ve yere inişte yumuşak kamera esnemesi (landing camera dip).
- **Dosya Sınırı:** `Sim/public/js/simulation/sim.js`, `Sim/public/js/config.js`, `Sim/public/js/view/3d/camera.js`, `Sim/public/js/main.js`.
- **Çıktı:**
  - `sim.js`: Mars yerçekimi ($3.71\text{ m/s}^2$) altında zıplama balistiği (itki hızı $\approx 2.4\text{ m/s}$, tepe yüksekliği $\approx 0.78\text{ m}$, havada kalma süresi $\approx 1.29\text{ s} \approx 1.3\text{ s}$), havada yatay momentumun korunumu (havada anlık yön sıfırlanması yerine balistik serbest intikal), zemin temasında iniş darbe sönümleme süresi (`landingRecovery` $\approx 0.25\text{ s}$, zemin temasında ani tekrar zıplamayı engelleyen ve yatay hızı sönümleyip toparlayan mekanizma).
  - `config.js`: Zıplama fizik sabitleri ($g = 3.71\text{ m/s}^2$, $v_{z0} = 2.4\text{ m/s}$, `landingRecoveryDurationS: 0.25`).
  - `camera.js`: Birinci şahıs kamerada adım adım yürüyüş döngüsüne bağlı sinüsoidal kafa salınımı (head-bobbing) ve iniş anında aşağı doğru yumuşak yaylanma/esneme (landing camera dip: `eyeOffsetM` ve `pitchOffsetRad` dinamik ofsetleri).
  - `main.js` & Snapshot sözleşmesi: `WorldSnapshot` astronot nesnesinde Efe'nin kinematik modülünün tüketeceği durum alanları (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`, `landingRecoveryFrac`).
- **Sahip:** Alparslan (simülasyon, config, kamera ve entegrasyon koordinatörü).
- **Doğrulama:** Commit `58660f0` ile uygulandı; bağımsız `npm test` 29/29, `npm run smoke` 32/32 (59.3 FPS). Efe'nin `astronaut-rig.js` dosyasına dokunulmadı.

### 13. Düşük Yerçekimi EVA Loping ve Sıçrama/İniş Poz Kinematiği (Efe) — KODDA TAMAMLANDI; GÖRSEL KABUL AÇIK

- **Amaç:** Apollo/Mars EVA araştırmalarındaki düşük yerçekimi sıçramalı yürüyüş döngüsü (loping gait), zıplamada havada süzülme (apex balance pose) ve inişte diz bükme/darbe emme (landing squash & recover) pozları. First-person view-model kollarda nefes ve adım salınımı.
- **Dosya Sınırı:** Yalnızca `Sim/public/js/view/3d/astronaut-rig.js` ve buna ait birim testleri.
- **Sınır Kuralı:** Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` ve snapshot sözleşmelerine DOKUNMAZ. Alparslan'ın movement API girdilerine (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`) göre saf deterministik poz üretir.
- **Çıktı:**
  - `astronaut-rig.js`:
    - Düşük yerçekimli EVA loping gait: Apollo astronotlarının Ay/Mars benzeri düşük g ortamındaki karakteristik sıçramalı/sekerek adım kinematiği.
    - Zıplama havada süzülme pozu (apex balance pose): dikey hız sıfıra yaklaşırken bacak ve gövde denge açısı.
    - İniş darbe emme pozu (landing squash & recover): iniş temasında dizlerin bükülmesi ve gövdenin esneyerek toparlanması.
    - First-person view-model: alt kadrajda görünen kollarda dururken nefes alma (idle breathing) ve adım senkronize salınım.
  - Birim testleri: Deterministik poz açıları, bilinmeyen girdide güvenli nötr poza dönüş.
- **Sahip:** Efe (bağımsız astronot rig ve animasyon kinematiği).
- **Bağımlılık:** Stage 10 astronot rig temeli ve Stage 12 movement API girdileri. Raster/provider migration’ına teknik bağımlılığı yoktur. Ayrı clone/branch’te, `astronaut-rig.js` ve kendi test dosyalarıyla paralel yürütülebilir; ortak OneDrive checkout’unda eşzamanlı Git işlemi yapılmaz.
- **Kabul:** Deterministik çıktı: aynı hareket durum parametreleri için aynı eklem açıları/poz transformları üretilir. Bilinmeyen veya tanımsız girdide nötr güvenli poza döner. WebGL veya DOM nesnesi üretmez. Birim testleri yalnız kullanıcı test çalıştırmaya izin verirse çalıştırılır; varsayılan iş akışına test çalıştırma dahil değildir.

### 14. EVA suit ayrıntıları ve first-person entegrasyonu — KODDA MEVCUT; GÖRSEL KABUL AÇIK

- **Dosya/Git kanıtı:** `e14b661` rig'e eldiven/göğüs ünitesi ve zincirli eklem verisi ekledi; `502d76c` kask/ayak bileği, kamera ve renderer entegrasyonunu; `18b4137` koordinat, HUD ve 1:1 first-person view-model düzeltmelerini içerir.
- **Sınır:** Rig geometrisi ve pozları sunum amaçlıdır. Atmosfer shader'ı çevresel görseldir; Jezero anlık ölçümü veya astronot hareketine atmosfer kuvveti kanıtı değildir.
- **Açık kabul:** Yürüyüş, sıçrama evreleri, iniş, duraklatma ve bilinmeyen yüzey temasında gerçek görüntü incelenmeden kadraj/örtüşme kalitesi kabul edilmiş sayılmaz. Başlıktaki Alparslan görsel kabulü ve Efe rig denetimi bu açık için tanımlanmıştır.

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

PLACES kaynağı, yeni raster geçişi, orto decoder/alignment, attribution/manifest QA, demo anlatısı ve Stage 13 rig animasyonu ayrı kabul ölçütlü şeritlerdir. `public/js/main.js`, `config.js`, `geo/` frame varsayımları ve snapshot/provider sözleşmeleri entegrasyon sıcak noktalarıdır: Alparslan koordine eder ve aynı anda tek sahibi olur. Rota hesabı halen `geo` ile `simulation` arasında dağılmıştır; yeni `route/` modülü açmayın. Stage 8 demo akışı tamamlanmıştır; bu eski “sıradaki Stage 8 planlama” ifadesi güncel değildir. Stage 6 metadata/QC ve extractor blokları kapatılıp bağımsız kabul alınana kadar Stage 13 paralel başlatılmaz; sonrasında ayrı branch/dosya kümesinde yürür. Orto dosyası henüz verilmediğinden decoder/alignment bağımsız iştir.

### Tarihsel iş bölümü: Stage 8–12 sonrası raster migration ve Stage 13 planı

| Sahip | Görev paketi | Dosya sınırı | Kabul ölçütü |
|---|---|---|---|
| Alparslan (veri kabul kapısı; ilk iş) | Yeni TIFF için resmî product identity/label/SIS, provenance, lisans/kullanım, vertical datum, grid/PixelIsArea yorumunu doğrula; rota boyunca footprint/no-data QC kanıtını tamamla. | Belge/araştırma çıktısı; çalışma ağacındaki rastera salt okunur erişim. Henüz kod/veri/test değişikliği yok. | Kullanılabilir bir kaynak/datum/kullanım beyanı, dönüşüm girdileri ve tüm demo rotası/kapsam QC’si belgelenir; bilinmeyen alan kalırsa aday reddedilir veya `needs_review` olarak kalır. |
| Alparslan (frame/provider entegrasyonu; QC kapısı geçince) | Equirectangular lat_ts=0/lon₀=0 frame'ine ve yeni provider'a kontrollü geçiş; 2D/3D render aynı snapshot/provider sözleşmesini kullanır. Eski sabitler, HUD atıfları ve örnekleme durumları birlikte güncellenir. | Entegrasyon sahibi tek başına: `Sim/public/js/config.js`, `geo/`, `surface/registry.js`, provider/layers sözleşmeleri, `Sim/public/js/main.js`, HUD ve zorunlu entegrasyon noktaları. | Yeni kaynak doğrulandığında 2D ve WebGL2 aynı konumda geçerli örnek verir; başarısız/unknown candidate `unavailable` kalır. Fallback kabiliyeti kayıtlı kalır fakat yalnız ayrı doğrulanmış/kullanılabilir provider seçilebilir; mevcut geçersiz bildirilen IMG/JP2’ye fallback yapılmaz. |
| Efe (bounded raster hazırlama; frame/metadata sözleşmesi dondurulduktan sonra ayrı branch) | 1.84 GB tam GeoTIFF’i tarayıcıya yüklemeyen, doğrulanmış demo kapsamı için sınırlı pencere/tiling hazırlama akışını tanımla ve uygula; kaynağın provenance/no-data bilgisi çıktıda korunur. | `Sim/scripts/` içindeki ayrı hazırlama aracı ve ona ait yeni test dosyaları; `config.js`, `main.js`, `registry.js`, provider/snapshot sözleşmelerine dokunmaz. Testler kullanıcı istemedikçe çalıştırılmaz. | Hazırlanan çıktı sınırları bellidir, metadata ile kaynak raster/frame/no-data’ya izlenebilir ve tam kaynak raster runtime belleğine alınmadan okunabilir; rotanın her hücresi için no-data durumu raporlanır. |
| Efe (Stage 13 EVA loping; migration’dan bağımsız paralel iş) | Apollo/Mars EVA araştırmalarındaki loping gait, apex balance, landing squash & recover, view-model nefes/adım salınımı. | Ayrı clone/branch’te yalnızca `Sim/public/js/view/3d/astronaut-rig.js` ve buna ait birim testleri; `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` ve snapshot sözleşmelerine dokunmaz. Ortak checkout’ta eşzamanlı Git işlemi yapılmaz. | Stage 12 movement API (`timeS`, hızlar, `grounded`, `airborne`, `phase`, `landingRecovery`, `landingRecoveryFrac`) için saf deterministik poz; tanımsız girdide nötr poza dönüş. Test çalıştırma yalnız kullanıcı isterse. |
| Sonraki bağımsız işler | Gerçek PLACES izi (dış erişim), orto decoder/alignment (yeni orto ve kayıt kanıtı gelirse), demo anlatısı. | Her iş ayrı branch/dosya sınırı; entegrasyon sıcak noktaları yukarıdaki sahibinde kalır. | Yeni veri migration’ını bloke etmez; kaynak ve kayıt kanıtı olmadan gerçek traverse veya orto overlay iddiası üretilmez. |

#### 3D renderer arayüz sözleşmesi — ilk dikey dilim

- **Kurulum/veri hazırlama:** `buildTerrainMesh(layer, displayConfig)` benzeri builder yalnız DTM/provider yüklendikten sonra bir kez çağrılır. `GridElevationLayer.cellState()` ile hücre geçerliliğini ve grid koordinatlarını kullanıp kopyalanmış, hazırlanmış bir terrain mesh asset’i döndürür. Kare başına builder çağrılmaz. Runtime’dan bağımsız arayüz: `positions: Float32Array` (her vertex için local X/Y metre + display Z), `normals: Float32Array`, `indices: Uint32Array`, `sourceElevationsM: Float32Array` (her vertex’in özgün Mars 2000 kotu), `bounds` (local min/max X/Y/display Z), `provenance` (source/product, datum, çözünürlük, kaynak kot aralığı, valid vertex ve atlanan quad sayıları) ve kullanılan display config. Grid eksenleri mevcut `GridElevationLayer` dönüşümlerinden alınır; CRS/datum varsayımı eklenmez. Test çalışması veya test dosyası değişikliği bu görev kapsamında değildir.
- **Kare çizimi:** `render3D({ snapshot, camera, terrainMesh })` benzeri saf render girişi yalnız derin dondurulmuş `WorldSnapshot`, kamera ve hazırlanmış mesh asset’ini tüketir. Renderer canlı `sim`, `layer`, `SurfaceProvider` veya adapter almaz; yükseklik örneklemesi başlatmaz. `main.js` kurulumda builder’ı, her karede renderer’ı çağırıp aynı snapshot’ı paylaşır.
- **Görsel kot dönüşümü (mevcut eski HiRISE provider sözleşmesi):** Eski kaynak `snapshot.astronaut.zM` ve mesh kotları Mars 2000 metre değerleri olarak korunur. Yeni TIFF için düşey datum henüz doğrulanmadığından bu varsayım yeni kaynağa aktarılmaz; yeni manifest kaynak datumunu açıkça taşır ve dönüşüm kanıtlanmadan örnekleme açılmaz. Görsel yükseklik yalnız açık `displayConfig` girdileriyle `zDisplay = (zM - referenceElevationM) × verticalScale` formülünden türetilir. `referenceElevationM` bir görüntüleme başlangıcıdır, datum dönüşümü değildir; WB1 için sabit offset veya bilimsel datum düzeltmesi hardcode edilmez.
- **No-data ve avatar:** Mesh builder yalnız dört köşesi de geçerli olan grid quad’larını triangulate eder; no-data/invalid hücreyi sıfıra çevirmeden ve bilinmeyen üzerinden üçgen köprü kurmadan boş bırakır. Snapshot’ta `astronaut.zM === null` veya `elevationStatus !== 'ok'` ise dünya koordinatındaki tam avatar rig’i çizilmez; HUD “yükseklik bilinmiyor” durumunu korur. First-person’de geçerli bir kamera/poz ankrajı varsa yalnız sunum amaçlı torso/kollar view-model olarak kalabilir; bu retained dünya rig’i veya güncel zemin kotu iddiası değildir. Son geçerli kot ya da sıfır güncel yüzey diye ikame edilmez; yatay hareket snapshot’a göre sürer.
- **Tarihsel ilk dikey dilim kararı:** İlk uygulama doğrulanmış kabul edilen yerel HiRISE fixture’ı ile başlamıştı; bu IMG/JP2 artık kullanıcı bildirimine göre geçersizdir. Registry’nin genel fallback özelliği korunur; sadece ayrı doğrulanmış ve kullanılabilir HiRISE provider’a dönebilir. Mevcut geçersiz bildirilen dosyalar fallback adayı değildir; başka doğrulanmış provider yoksa yüzey `unavailable` kalır. 2D Canvas arayüzü korunur.

Bu sözleşme Efe'nin mesh builder'ı ile Alparslan'ın entegrasyon paketinin arayüzünü tanımlar. Runtime kararı WebGL2 olarak uygulanmış; `referenceElevationM` yüklenen DTM kot aralığının orta noktası, `verticalScale` ise açıkça sunum amaçlı 3× seçilmiştir. Bu değerler ölçüm veya datum düzeltmesi değildir. Mesh arayüzünde değişiklik gerekirse iki görev sahibinin yazılı eşgüdümüyle, ilgili dosyalar düzenlenmeden önce netleştirilir.

Gerçek eşzamanlı çalışma/commit için her takım üyesi ve coding AI kendi clone’unu kullansın; OneDrive dışı clone/worktree tercih edilsin. Entegrasyon sahibi branch/PR diff’lerini gözden geçirip birleştirir. Kodlama işleri tek kabul ölçütlü, kısa ömürlü branch ve açık dosya sınırıyla yürür; `main.js`, `config.js`, registry/provider/snapshot sözleşmeleri entegrasyon sahibinde tek sahipli kalır. Yeni 1.8 GB GeoTIFF’in tamamı tarayıcı belleğine yüklenmez; yalnız doğrulanmış kapsamı taşıyan bounded window/tile yaklaşımı kullanılır. Registry fallback kabiliyeti korunur; geçersiz bildirilen IMG/JP2 aktif/fallback veri değildir. Stage 6 bağımsız kabulinden sonra Stage 13 kendi rig/test dosyalarıyla ayrı branch’te başlatılır; ortak OneDrive checkout’unda eşzamanlı Git işlemi yapılmaz.

## Git paylaşımı — 14 Kasım 2026 durum kaydı

- Workspace kökünde `emanzBey48/EA-Mars` için yerel Git deposu ve `origin` ayarlı. `alparslan/stage8-demo-orchestration` çalışma dalında Stage 12 Mars zıplama ve kamera dinamikleri (`58660f0`) ile Efe Stage 8 QA merge'i (`9819da2`) remote'a push edilmiş durumdadır.
- Güncel paralel 3D görev bölümü `d6a1189 docs: align 3D roadmap for parallel work` commit’iyle `origin/docs/parallel-roadmap` dalına push edilmişti.
- `yapay zeka icin` yönergeleri ile `Sim` kodu aynı repo kökündedir. 381 MB IMG, 34 MB JP2 ve 7.5 MB F32 `.gitattributes` ile Git LFS üzerinden izlenir; normal Git’e eklenmez.
- Workspace OneDrive altında olduğundan, Git çalışma kopyasını OneDrive senkronizasyonunun dışına almak daha güvenlidir. Takım üyeleri ayrı clone/worktree kullansın; OneDrive `.git` senkronizasyonu ortak Git yöntemi olmasın.
- `Sim/.gitignore` `dtm_subset.f32`, `dtm_subset.json` ve `ortho_inspection.json` dosyalarını izlemeye alır; F32 LFS üzerinden klonlanır. Mevcut `test-output` ekran görüntüleri de ilk importta eklendi.
- AI’lar her önemli, gözden geçirilebilir görev aşamasında ilgili değişiklikleri ayrı commit etsin; büyük işleri tek commit’e yığmasın. Commit öncesi `git status` ve staged diff kontrol edilsin; ilgisiz kullanıcı değişiklikleri eklenmesin. Kullanıcı onayı gereken durumda onay olmadan commit/push yapılmasın. Push başarısızsa hash ve engel raporlansın. Güvenlik/sertifika doğrulaması kapatılmasın.
- Commit author kimliği AI’yı belirtmeli ve bir insanı taklit etmemeli. Ana dal entegrasyon sahibi tarafından PR/diff incelemesiyle birleştirilmeli. Testler yalnız kullanıcı istediğinde çalıştırılmalı; çalıştırılmayan test başarılıymış gibi raporlanmamalı.

## Tarihsel raster geçişi ve kalan işler — 14 Kasım 2026

| Sahip | Uygulama durumu | Yarışma verisinden önce kalan |
|---|---|---|
| Alparslan | WebGL2 viewer ve Stage 8–12 tamamlandı. | Önce yeni TIFF’in provenance/datum/lisans/rota kapsamını doğrula; sonra frame, provider, HUD ve `main.js` migration’ını tek entegrasyon görevi olarak yürüt. |
| Efe | CPU mesh, memory optimization, astronaut rig, marker mesh ve Stage 8 QA katkısı tamamlandı. | Alparslan’ın migration’ından bağımsız olarak ayrı clone/branch’te Stage 13 rig kinematiği; raster preparation aracı ise frame/metadata sözleşmesi dondurulduğunda ayrı dosya kümesinde. |

- **Stage 9:** İlk runtime kabul turu `d471d6a` üzerinde (`13/13`, `26/26`) geçti. Sonraki mesh optimizasyonunu da içeren `fbc623f` kod HEAD’i bağımsız `18/18`, `32/32` ile tekrar doğrulandı; birleşik regresyon tamamlandı. Orbit viewer nihai ürün değildir.
- **Stage 10:** First-person movement/camera/surface-contact ve bağımsız rig + renderer entegrasyonu `fbc623f` ile tamamlandı; bağımsız QA `npm test` 18/18, `npm run smoke` 32/32. İlk smoke tekrarında iki mevcut 2D timing kontrolü geçti.
- **Stage 11:** Efe'nin `marker-mesh.js` modülü ve Alparslan'ın renderer entegrasyonu `8054b1a` ile tamamlandı; bağımsız `npm test` 24/24. Sol 120/164 beacon'ları ve rota kılavuz çizgileri sahneye eklendi.
- **Stage 8:** First-person demo akışı ve HUD entegrasyonu `f5259d2` ile tamamlandı (3D doğrudan açılış `?view=3d`, Sol 164 hedef feneri kilidi, nişangah, kontrol paneli kapsülü ve varış başarı rozeti; Efe QA ve marker doğrulama birleştirmesi `7ed695e` / `9819da2`; 25/25 unit test, 32/32 smoke, 60.4 FPS).
- **Stage 12:** Alparslan tarafından tamamlandı (`58660f0`); Mars $3.71\text{ m/s}^2$ yerçekimi altında zıplama balistiği, havada momentum korunumu, iniş darbe sönümlemesi ve kamerada adım kafa salınımı ile iniş esnemesi uygulandı (29/29 unit test, 32/32 smoke, 59.3 FPS).
- **Stage 13:** Efe’nin migration’dan bağımsız paralel görevi; ayrı clone/branch ve yalnız `astronaut-rig.js` + ilgili test dosyaları. Düşük yerçekimli EVA loping gait, apex balance, landing squash & recover ve view-model nefes/adım salınım kinematiği. Testler ancak kullanıcı isterse çalıştırılır.
- **Stage 7 / PLACES:** Alparslan’ın ayrı, bloke etmeyen dış veri işi. PDS dosyasına erişim olursa 2–4 saat; endpoint engeli 45–60 dakikada çözülmezse park et.
- **Stage 6 / yeni raster intake:** Yeni TIFF adayı mevcut; resmi product label/SIS, kaynak, lisans/kullanım, düşey datum ve rota-wide footprint/no-data doğrulama kapısı açık. Kanıt geçmeden adapter aktif edilmez; bu artık verinin gelmesini bekleme işi değildir.

**Sıradaki işler:** Alparslan önce Stage 6 extractor/manifest/frame-validation bloklarını fail-closed kapatıp bağımsız review alır; migration/terrain kabulü geçmeden yeni provider’ı kabul edilmiş sayma. Efe Stage 13’ü bu kabulden sonra ayrı branch’te yalnız `astronaut-rig.js` ve ilgili testlerde yürütür; test çalıştırma yalnız kullanıcı isteğiyle yapılır. Registry fallback kabiliyeti korunur, ancak geçersiz bildirilen IMG/JP2 fallback adayı değildir; doğrulanmış provider yoksa katman `unavailable` olur. Orto decoder ve PLACES gerçek izi ayrı/koşullu işlerdir.

