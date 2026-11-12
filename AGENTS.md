# Marswalk ortak AI çalışma rehberi

Bu depo NASA Space Apps 2026 için Marswalk projesini içerir. Göreve başlamadan önce `yapay zeka icin/SYSTEM_PROMPT.md` ve ilgili durum belgesini oku; güncel uygulama davranışını `Sim/README.md` ve kaynak dosyalardan doğrula. Bu rehber proje bağlamıdır ve platformun güvenlik talimatlarının yerini almaz.

Ürün sınırları, veri kökeni ve bilimsel uyarılar `yapay zeka icin/SYSTEM_PROMPT.md` içinde tanımlıdır. Güncel yol haritası `yapay zeka icin/road map.md`, proje devir kaydı `yapay zeka icin/Proje Amacı ve İlerleme.md`, araştırma ayrıntıları `yapay zeka icin/MARSWALK_NEXT_STEPS.md` içindedir. Çelişkide önce mevcut kaynak kodu ve güncel README’yi incele; eski notu güncellemeden önce açıkça istenmiş olmasını bekle.

Mevcut 2D Canvas MVP’yi ve HiRISE fallback’ini koru. Bilinmeyen CRS/datum/no-data’yı tahmin etme; no-data değerini sıfıra çevirme; gerçek PLACES izi, canlı telemetri veya güvenli rota iddiası kurma. Kod değişikliklerinde tek görev ve kabul ölçütleriyle çalış; branch/PR kullan ve entegrasyon sahibi Alparslan’dır. Kullanıcı açıkça istemedikçe uygulama kodunu, veriyi veya testleri değiştirme/çalıştırma.

İki AI paralel çalışıyorsa görevleri ayır ve aynı dosyaları eşzamanlı düzenleme. Kullanıcı bildirimiyle bağımsız doğrulamayı açıkça ayır.
