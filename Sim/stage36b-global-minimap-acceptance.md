# Stage 36B — Küresel minimap zemini ve depo hijyeni

**Kod durumu:** Entegrasyon tamamlandı; kaynak ve manifest statik olarak incelendi.
**Runtime/görsel kabul:** ÇALIŞTIRILMADI. Uygulama, test ve tarayıcı başlatılmadı.

## Uygulananlar

- Minimap manifesti doğrular ve yalnız manifestte yazılı karo seviyelerini yükler. Karo yolu, piksel ölçüsü, Mars yarıçapı, no-data kuralı, lisans/attribution ve ürünün ortogörüntü/yükseklik verisi olmadığına dair notlar kontrol edilir.
- Karo bounds’ları manifestteki lon/lat çözünürlüğünden MAP_FRAME yarıçapıyla yerel metre düzlemine çevrilir. Global seviyeler ölçeğe göre seçilir; 232 m/piksel Jezero kesiti üst katman, mevcut HiRISE DTM hillshade ise yerel detay olarak çizilir.
- “Mars globali göster” ve “Kapsama sığdır” görünümleri ayrıdır. Harita seçimi hâlâ yalnız geçerli HiRISE DTM alanı ve maskesi içinde kabul edilir.
- Global/region görseli eksik, hatalı veya manifestle uyumsuzsa Viking katmanı `unavailable` olur; yerel HiRISE minimap çalışmayı sürdürür.
- Harita içi anahtar, 232 m/piksel Viking renk mozaiğinin ortogörüntü/kot verisi olmadığını ve lisansın belirtilmediğini söyler; manifest attribution’ı katman durumunda gösterilir.
- Sim `.gitignore` içine `data-external/` eklendi. 12,7 GB kaynak TIFF git’e alınmaz; README’de yerel hazırlama klasörü ve isteğe bağlı `ingest-viking-mosaic.mjs --input ... --out ...` komutu anlatılır.

## Açık kabul

- Gerçek tarayıcıda global↔Jezero yakınlaştırma, katman çizim sırası ve eksik karo fallback’i gözlenmedi.
- Unit test, smoke, uygulama ve ingest çalıştırılmadı. Kare süresi/bellek ölçümü alınmadı.
