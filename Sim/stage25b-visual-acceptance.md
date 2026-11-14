# Stage 25B — görsel kabul ve smoke senkronizasyonu

Tarih: 14 Kasım 2026

Dal/başlangıç: `codex/stage25b-visual-qa`, `fb0544b`

Komut: `cd Sim; npm run smoke` (Edge headless, yerel sunucu `127.0.0.1:8181`)

## Sonuç

Stage 25B **kısmi kabul** aldı. DTM ve minimap 2D akışı ile kaynak/uyarı metinleri tarayıcıda görünür. İlk şahıs 3D terrain mesh ve rig bu tarayıcı koşusunda açılmadı; bu nedenle Stage 15–18 kamera/rig/güneş görsel kabulü PASS değildir. 19B geoloji HUD/kontak, 22B fotoğraf galerisi ve 24B rota etkileşimi için de bu smoke akışı yeterli görsel kanıt üretmedi.

## Smoke bulguları

Üç smoke çalıştırması yapıldı. İlk ikisi başarısız 3D geçişini ve T2 feragat regex çakışmasını ayırt etmek için; üçüncüsü teşhis alanları ve yeni planlama feragati eklenmişken. Son çalışma **26/32** kontrol geçti. Üçüncü çalıştırmadan sonra T2 kontrolünün yinelenen feragat metinlerini temizlemesi için `replace()` → `replaceAll()` düzeltmesi yapıldı; bu son küçük düzeltme sonrasında smoke yeniden çalıştırılmadı.

- Geçenler arasında uygulamanın açılması, DTM örneklemesi, no-data/kapsam dışı davranışı, kaynak etiketleri, 2D hareket/duraklatma, fallback ve 60.5 FPS (başsız tarayıcı ölçümü) var.
- 5a kaynak/birim/datum kontrolü geçti. 5b ilk iki çalıştırmada yeni arşiv feragatini hesaba katmadığı için, üçüncüde ise “Planlama göstergesi — güvenli rota sertifikası değildir.” açıklaması sayfada birden çok kez bulunduğu için başarısız oldu. Kontrol şimdi üç tam açıklamayı metinden tüm eşleşmelerle çıkarıp, kalan metni tarıyor.
- 3D geçişi üç çalıştırmada da başarısız oldu. Son çalışmada 6a `active=2d`, `mesh=false`, `meshError=null`, `rendererError=null`, 1,884,301 hücre ve CPU build süresi yok olarak raporlandı. İlk geçiş bekleme döngüsü 100 × 100 ms ile sınırlı; CDP çağrı gecikmeleri dahil ölçülen duvar saati 11.1 saniyeydi. Ardından 6b ve 6i de beklenen terrain/rig tanıları gelmediği için başarısız oldu; eye height alanı 1.48 m görünse de `bodyWorldZM=null` ve terrain triangles/rig parts yoktu. 6h hareket yönü/zemin temasını, 6l hareket gait’ini de doğrulayamadı.
- CDP Runtime istisnası gözlenmedi. Tek console error, `http://127.0.0.1:8181/favicon.ico` için 404’tü.

3D geçişindeki kök neden kaynakta belirlendi; Worker yarışı değil. Smoke 0a adımı simülasyonu `paused` yapıyor. `main.js` içindeki `selectView('3d')` geçerli başlangıç kotu bulunca `sim.resolveSurfaceContact(initialElevation)` çağırıyor (yaklaşık satır 513); ancak `simulation/sim.js` yaklaşık satır 208'de `PHASE.PAUSED` iken bu fonksiyon hemen `false` döndürür. Böylece `bodyWorldZM` `null` kalır; `selectView` yaklaşık satır 517'de 3D mesh inşasına ulaşmadan 2D'de kalır. Sonraki 6b/6i/6h/6l başarısızlıkları bunun devamıdır. Bu kabul görevi kök neden modüllerini değiştirmedi.

## Görsel inceleme

Smoke sırasında alınan `05-stage9-3d.png` adlı geçici görüntü yanıltıcı ada rağmen 3D değil, 2D görünümdeydi. Görüntüde 2D DTM hillshade, Jezero minimap, jeoloji sınır anahtarı, arşiv izi anahtarı ve sarı senaryo rotası/koridoru seçilebiliyordu. Minimap metni jeolojiyi hazır, arşiv izini hazır gösteriyordu; arşiv çizgisinin canlı telemetri veya rota önerisi olmadığı açıklaması görünürdü. Ortho katmanı hizalama doğrulanmadığı için kapalıydı.

Galeri için alınan geçici `06-archive-gallery.png` ekran görüntüsü de sayfanın üst görünümünü tekrarladı; ana sayfa kaydırma alanı değil, ayrı panel kaydırıldığı için galeriyi göstermedi. Fotoğraf galerisi görsel kabul edilmedi. Galerinin ayrıca panel içinde kaydırılarak incelenmesi gerekir. CUA in-app browser bu ortamda kullanılabilir değildi; bağımsız görünür tarayıcı incelemesi yapılamadı. Smoke sonrası geçici screenshot’lar temizlendi; önceden izlenen test-output PNG’leri geri yüklendi.

Güneş shader’ı kaynakta gökyüzü diski ve ufuk sönümlemeli doğrudan ışık hesabı içeriyor; `main.js` Mars güneş vektörünü `LTST 15`, `Lₛ 0°` ile veriyor. Fakat 3D render etkinleşmediği için ışığın gerçek sahnedeki görünümü gözlemlenmedi. 1.48 m kamera değeri runtime tanısında bulundu, ancak kask/rig ankrajı ve alt-kadraj kolları görsel olarak doğrulanamadı.

## Kanıt sınırı

Bu kabul tarayıcıda yerel sabit fixture ile yapılan başsız smoke çalışmasıdır. Çıktılar `Sim/test-output/` altındadır ve bu görev commit’ine dahil edilmez. Son T2 `replaceAll()` değişikliği sonrası smoke tekrar edilmedi. 3D, rig, güneş aydınlatması, 19B HUD/kontak, 22B galeri ve 24B gerçek rota seçme/planlama etkileşimi için PASS iddiası yoktur.
