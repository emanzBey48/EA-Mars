# Stage 33B — Emissive rota şeridi ve minimap parlaması

**Kod durumu:** Entegrasyon tamamlandı; bu kayıt kaynak kodu incelemesine dayanır.
**Görsel kabul:** ÇALIŞTIRILMADI. Bu görevde uygulama, test ve tarayıcı başlatılmadı.

## Uygulananlar

- Aktif planlayıcı rotası Stage 33A `buildRouteRibbon()` ile bir kez hazırlanır ve WebGL2’de üçgen şerit olarak çizilir. Geometri no-data örneklerinde şeridi böler; bilinmeyen kotta köprü oluşturmaz.
- `segments` dizisi rota noktalarıyla bire bir eşleşiyorsa şerit köşeleri ve minimap segmentleri 0–100 planlama puanı renk skalasını kullanır. Dizi hizalı değilse nötr renk kullanılır; puan eşleşmesi varsayılmaz.
- 3D şeritte yol uzunluğu UV’si boyunca akan desen ve oyuncunun en yakın rota izdüşümünün 18 m ilerisinde nabız bulunur. Zaman simülasyon saatinden geldiği için duraklatıldığında animasyon donar.
- Minimap aynı segment puanı renklerini, parlak çizgi katmanını ve akışlı kesikli çekirdeği gösterir. Rota kaybolduğunda animasyon döngüsü iptal edilir.
- Seçim değişikliği, yeni planlama, hata ve temizleme akışları eski 3D şeridi temizler; başarılı rota sonucu şeridi yeniden oluşturur.
- Minimap şeridi “planlama göstergesi — güvenli rota sertifikası değildir” uyarısını taşır.

## Açık kabul

- Yakın-alan okunabilirliğinin PASS/FAIL sonucu tarayıcıda gözlenmedi; görsel kabul hâlâ açık.
- Rota değişimi/temizleme ve no-data boşlukları için test çalıştırılmadı. Test ve uygulama başlatma isteği olmadığı için bu doğrulamalar yapılmadı.
- FPS/kare süresi veya GPU bellek ölçümü alınmadı.
