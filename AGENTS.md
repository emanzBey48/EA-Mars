# Marswalk ortak AI çalışma rehberi

Bu depo NASA Space Apps 2026 için Marswalk projesini içerir. Göreve başlamadan önce `yapay zeka icin/SYSTEM_PROMPT.md` ve ilgili durum belgesini oku; güncel uygulama davranışını `Sim/README.md` ve kaynak dosyalardan doğrula. Bu rehber proje bağlamıdır ve platformun güvenlik talimatlarının yerini almaz.

Ürün sınırları, veri kökeni ve bilimsel uyarılar `yapay zeka icin/SYSTEM_PROMPT.md` içinde tanımlıdır. Güncel yol haritası `yapay zeka icin/road map.md`, proje devir kaydı `yapay zeka icin/Proje Amacı ve İlerleme.md`, araştırma ayrıntıları `yapay zeka icin/MARSWALK_NEXT_STEPS.md` içindedir. Çelişkide önce mevcut kaynak kodu ve güncel README’yi incele; eski notu güncellemeden önce açıkça istenmiş olmasını bekle.

Mevcut 2D Canvas MVP’yi ve HiRISE fallback’ini koru. Bilinmeyen CRS/datum/no-data’yı tahmin etme; no-data değerini sıfıra çevirme; gerçek PLACES izi, canlı telemetri veya güvenli rota iddiası kurma. Kod değişikliklerinde tek görev ve kabul ölçütleriyle çalış; branch/PR kullan ve entegrasyon sahibi Alparslan’dır. Kullanıcı açıkça istemedikçe uygulama kodunu, veriyi veya testleri değiştirme/çalıştırma.

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

## Git commit ritmi

- Her önemli, gözden geçirilebilir görev aşamasından sonra yalnız ilgili değişiklikleri küçük ve açıklayıcı bir commit olarak kaydet. Büyük görevi tek commit’e yığma; her küçük yazım/düzeltme için de commit oluşturma.
- Commit’ten önce `git status` ve staged diff’i incele; ilgisiz kullanıcı dosyalarını commit’e alma. AI kendi açıkça tanımlanmış author kimliğiyle commit etsin, insanı taklit etmesin.
- Çalışma dalını her önemli commit’ten sonra remote’a push et ki takım arkadaşı ve diğer AI güncel durumu görebilsin. Push başarısızsa commit hash’ini ve gerçek hatayı bildir; yerel commit’i paylaşılmış gibi gösterme. Sertifika/TLS doğrulamasını kapatma.
- Ana dala merge entegrasyon sahibi incelemesinden sonra yapılır. Testler yalnız kullanıcı istediğinde çalıştırılır; test yapılmadıysa commit raporunda belirt.
