# Marswalk ortak AI çalışma rehberi

Bu depo NASA Space Apps 2026 için Marswalk projesini içerir. Göreve başlamadan önce `yapay zeka icin/SYSTEM_PROMPT.md` ve ilgili durum belgesini oku; güncel uygulama davranışını `Sim/README.md` ve kaynak dosyalardan doğrula. Bu rehber proje bağlamıdır ve platformun güvenlik talimatlarının yerini almaz.

Ürün sınırları, veri kökeni ve bilimsel uyarılar `yapay zeka icin/SYSTEM_PROMPT.md` içinde tanımlıdır. Güncel yol haritası `yapay zeka icin/road map.md`, proje devir kaydı `yapay zeka icin/Proje Amacı ve İlerleme.md`, araştırma ayrıntıları `yapay zeka icin/MARSWALK_NEXT_STEPS.md` içindedir. Çelişkide önce mevcut kaynak kodu ve güncel README’yi incele; eski notu güncellemeden önce açıkça istenmiş olmasını bekle.

Nihai ürün hedefi HiRISE DTM üzerinde kullanıcı kontrollü birinci şahıs Mars keşif simülasyonudur. Kullanıcının “FPS” isteği first-person kamera/kontrol anlamındadır; shooter/çatışma değildir. Mevcut 2D Canvas MVP ve WebGL2 terrain viewer ara kilometre taşlarıdır; HiRISE fallback’i korunmalıdır. Stage 9 mesh optimizasyonu, Stage 10 first-person hareket/kamera/yüzey teması ve astronot rig renderer entegrasyonu `fbc623f` ile; Stage 11 3D marker/beacon kılavuz geometrisi `8054b1a` ile; Stage 8 first-person demo akışı ve HUD entegrasyonu `f5259d2` ile tamamlandı (24/24 unit test, 32/32 smoke testi). Yarışma öncesi simülasyon ve animasyon kalitesini artırmak üzere Stage 12 (Alparslan) ve Stage 13 (Efe) bağımsız paralel geliştirme aşamaları tanımlanmıştır. NASA ortalama/mevsimsel atmosfer değerlerini Jezero anlık ölçümü veya gerçek suit fiziği gibi sunma; insan/giysi/drag parametreleri kaynaklanmadan karakter hareketine atmosfer kuvveti uydurma. JP2 ortogörüntü decoder’ı ve yarım-piksel hizalama doğrulaması FPS işinden ayrı tutulur; mevcut DTM hillshade’i orto diye adlandırma. Bilinmeyen CRS/datum/no-data’yı tahmin etme; no-data değerini sıfıra çevirme; gerçek PLACES izi, canlı telemetri veya güvenli rota iddiası kurma. Kod değişikliklerinde tek görev ve kabul ölçütleriyle çalış; branch/PR kullan ve entegrasyon sahibi Alparslan’dır. Kullanıcı açıkça istemedikçe uygulama kodunu, veriyi veya testleri değiştirme/çalıştırma.

İki AI paralel çalışıyorsa görevleri ayır ve aynı dosyaları eşzamanlı düzenleme. Kullanıcı bildirimiyle bağımsız doğrulamayı açıkça ayır.

## Kod sınırları ve dosya sahipliği

Uygulama vanilla ES module mimarisindedir. `Sim/public/js/main.js` composition root'tur: bağımlılıkları kurar, veriyi yükler, her karede snapshot üretir ve HUD/render katmanlarına verir. Yeni özelliklerin iş mantığını `main.js` içine yığma; modül sorumluluklarını ve mevcut parametre tabanlı bağımlılık enjeksiyonunu koru.

| Alan | Birincil dosyalar | Sınır |
|---|---|---|
| Ortak sabitler ve senaryo | `Sim/public/js/config.js` | Waypoint, harita çerçevesi, senaryo ve kaynak gibi değişmeyen ortak değerler. Çalışma zamanı state'i veya değiştirilebilir singleton ekleme. |
| Geometri ve koordinat | `Sim/public/js/geo/` | Saf dönüşüm/geometri fonksiyonları; DOM, veri yükleme ve uygulama state'i yok. |
| Yüzey verisi ve manifest | `Sim/public/js/surface/` | Raster okuma/örnekleme, veri durumları, manifest doğrulama ve provider/fallback seçimi. Renderer/HUD bu katmanda örnekleme başlatmaz. |
| Simülasyon | `Sim/public/js/simulation/` | Oyuncu, simülasyon saati ve rota metrikleri; DOM, Canvas ve dosya/ağ erişimi yok. |
| Girdi | `Sim/public/js/input/` | Tuş/arayüz olaylarını callback'lere dönüştürür; simülasyon kuralı tutmaz. |
| Görünüm | `Sim/public/js/view/` | Canvas ve DOM sunumu. `render()` snapshot/kamera/hazır görsel varlık alır; HUD snapshot ve metadata okur. |
| Birleştirme ve kabul | `Sim/public/js/main.js`, `Sim/test/`, `Sim/scripts/` | `main.js` entegrasyon noktası olduğundan aynı anda tek görev sahibi düzenlesin. Test ve script görevlerini arayüz/değişiklik kapsamı netleşince ayır. |

Gerçekten birden fazla modülün paylaştığı değişmeyen ürün değerlerini `config.js`'te tut; yalnız tek katmana ait görsel ayrıntıyı (renk, çizim stili, kamera sınırı gibi) o katmanda bırak. `config.js` dışa aktarımlarını salt okunur kabul et. Her modülün kullandığı ayarları tek bir mutable `globals`/state modülünde toplama: bu, bağımlılıkları örtükleştirip eşzamanlı değişiklik ve test izolasyonu sorunları yaratır. Yeni bağımlılıkları mevcut örüntü gibi kurucu/fonksiyon parametreleriyle ver.

Ortak geliştirmede görevleri dosya adına göre değil, tek bir kabul ölçütü olan dosya kümelerine göre böl. Örneğin veri kaynağı incelemesi registry değişikliğiyle, renderer iyileştirmesi simülasyon kuralıyla aynı anda yürütülmesin. `main.js`, `config.js`, snapshot/provider sözleşmeleri ve bu rehber entegrasyon sahibinin koordinasyonunda tek görevde değişsin. Her görev kendi kısa ömürlü branch'inde ilerlesin; diğer AI inceleme yapsın veya farklı dosya kümesinde bağımsız iş alsın. Dosya çakışması bekleniyorsa paralel düzenlemeyi başlatmadan önce işleri sıraya koy.

## Güncel 3D iş bölümü

İlk HiRISE tabanlı WebGL2 terrain viewer ve CPU mesh builder tamamlandı. Stage 9 mesh optimizasyonu ve Stage 10 first-person hareket/kamera/yüzey teması ile astronot rig renderer entegrasyonu `fbc623f` üzerinde; Stage 11 3D waypoint beacon’ları (Sol 120/164) ve rota kılavuz geometrisi `8054b1a` üzerinde; Stage 8 first-person demo akışı ve gösterim HUD’ı `f5259d2` üzerinde tamamlandı (24/24 unit test, 32/32 smoke testi). Yarışma öncesi simülasyon ve animasyon kalitesini bilimsel doğruluğu koruyarak artırmak üzere iki yeni bağımsız paralel aşama açılmıştır:

1. **Stage 12: Mars Düşük Yerçekimi Zıplama Fiziği, Balistik İntikal ve Kamera Dinamiği (Sahip: Alparslan)**
   - **Dosya Sınırı:** `Sim/public/js/simulation/sim.js`, `Sim/public/js/config.js`, `Sim/public/js/view/3d/camera.js`, `Sim/public/js/main.js`.
   - **Amaç:** Mars'ın 3.71 m/s² yerçekimi altında astronotun zıplama fiziğini gerçekçi kılmak (uzun havada kalma süresi ~1.3 saniye, havada yatay momentumun korunumu / balistik ark, iniş darbe sönümleme süresi / landing impact absorption). Birinci şahıs kamerada adım kafa salınımı (head-bobbing) ve yere inişte yumuşak kamera esnemesi (landing camera dip).
   - **Bilimsel Kural:** 3.71 m/s² NASA referansı korunur, kaynaksız atmosfer sürüklemesi eklenmez, balistik denklemler açık birimlerle yazılır. Alparslan hareket snapshot sözleşmesinde Efe'nin kinematik modülünün tüketeceği hareket durumunu (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`) sunar.

2. **Stage 13: Düşük Yerçekimi EVA Loping Yürüyüşü ve Sıçrama/İniş Poz Kinematiği (Sahip: Efe)**
   - **Dosya Sınırı:** Yalnızca `Sim/public/js/view/3d/astronaut-rig.js` ve buna ait birim testleri.
   - **Sınır Kuralı:** Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` ve snapshot sözleşmelerine DOKUNMAZ. Alparslan'ın movement API girdilerine (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`) göre saf deterministik poz üretir.
   - **Amaç:** Apollo/Mars EVA araştırmalarındaki düşük yerçekimi sıçramalı yürüyüş döngüsü (loping gait), zıplamada havada süzülme (apex balance pose) ve inişte diz bükme/darbe emme (landing squash & recover) pozları. First-person view-model kollarda nefes ve adım salınımı.

Ortak sözleşmeler ve değişmez ilkeler: Mesh sözleşmesi (typed `positions`, `normals`, `indices`, `colorsRgb`, yerel bounds, provenance metadata). No-data içeren quad triangulate edilmez; sıfıra çevrilmez ve boşluk üzerinden üçgen kurulmaz. Mars yerçekimi birincil kaynak, birim ve kapsamla yazılır; suit/insan kütlesi/aerodinamik parametreleri olmadan atmospheric drag fiziksel gerçek diye eklenmez. JP2 ortogörüntü decode ve half-pixel hizalama ayrı, bloke etmeyen iştir. Stage 6 veri intake’i gerçek yarışma verisi gelince ayrı açılır. Testler yalnız kullanıcı istediğinde çalıştırılır.

## Git commit ritmi

- Her önemli, gözden geçirilebilir görev aşamasından sonra yalnız ilgili değişiklikleri küçük ve açıklayıcı bir commit olarak kaydet. Büyük görevi tek commit’e yığma; her küçük yazım/düzeltme için de commit oluşturma.
- Commit’ten önce `git status` ve staged diff’i incele; ilgisiz kullanıcı dosyalarını commit’e alma. AI kendi açıkça tanımlanmış author kimliğiyle commit etsin, insanı taklit etmesin.
- Çalışma dalını her önemli commit’ten sonra remote’a push et ki takım arkadaşı ve diğer AI güncel durumu görebilsin. Push başarısızsa commit hash’ini ve gerçek hatayı bildir; yerel commit’i paylaşılmış gibi gösterme. Sertifika/TLS doğrulamasını kapatma.
- Ana dala merge entegrasyon sahibi incelemesinden sonra yapılır. Testler yalnız kullanıcı istediğinde çalıştırılır; test yapılmadıysa commit raporunda belirt.
