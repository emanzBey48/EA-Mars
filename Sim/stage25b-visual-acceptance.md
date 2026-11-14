# Stage 25B — görsel kabul ve smoke senkronizasyonu

Tarih: 14 Kasım 2026
Dal/başlangıç: `codex/stage25b-acceptance-update`, `49ac54d`
Kapsam: Stage 15–18, 19B/20B/22B/24A için görsel kabul ve Stage 25B smoke metin senkronizasyonu; ayrıca 24B/25 entegrasyonlarının gözlenen tarayıcı davranışı.
Yol haritası ölçütü: kamera/rig/güneş ve ilgili katmanları gerçek tarayıcıda incelemek; `5b` feragat kontrolünü güncel arşiv/minimap/HUD metinleriyle uyumlu tutmak; first-person rig kadrajının kırpılmadığını doğrulamak.

## Bağımsız kabul bulguları

- **Smoke ve T2 — PASS.** Son kabul kaydındaki `npm test` sonucu **250/250**, `npm run smoke` sonucu **32/32**. T2 kontrolü güncel feragat cümlelerinin tümünü sayfa metninden çıkarıp kalan metinde çelişkili güvenlik/tehlike iddialarını arıyor. Önceki 26/32 ve paused-first-contact-anchor hatası, `0769aa4` ile yapılan düzeltme öncesinin tarihsel sonucudur; güncel durum değildir.
- **Stage 15/17 first-person rig — kısmi PASS.** 3D kabul akışında kamera/kask göz yüksekliği **1,48 m**; torso ve kollar rig çizim/frustum tanısında bulundu. Aşağı bakışta birinci şahıs takım görünümü gözlendi. Bu, tüm yürüme pozlarında bacakların/kolların kırpılmadığını veya zemin clipping'i olmadığını kanıtlayan kapsamlı bir kadraj incelemesi değildir. 32/32 smoke içinde `6i` rig çizim/parça merkezleri ve heading uyumu; `6j` pause poz/gait dondurma; `6l` WASD gait üretimini kontrol eder.
- **Yakın beacon davranışı — PASS.** İlk kişi başlangıcında Sol 120 / WB1 yakın direği `hiddenBeaconIds` içinde ve sahnede gizliydi. Kamera WASD ile ilerleyip WB1'den **4,19 m** uzağa geldiğinde gizli kimlik listesi boşaldı; kullanıcı yeniden beacon yönüne baktığında mast/gem tekrar görünür durumdaydı. İlgili smoke kontrolleri `6a` ve `6h`'dir. Uzaklaşma sonrası görünürlük görsel olarak kontrol edildi.
- **2D fallback — PASS.** `6g`, test koşulunda WebGL2 başlatmasını deterministik olarak başarısız kılıp 2D haritanın görünür/aktif kaldığını doğruluyor. Bu, gerçek cihaz/GPU çeşitliliğinde performans veya WebGL sürücü kabulü değildir.
- **24B rota planlama — PASS (gözlenen tarayıcı akışı).** Tarayıcı `window-ready` durumuna geldikten sonra geçerli başlangıç `(-318.4, 188.9)` ve bitiş `(398.7, -946.5)` seçildi. Sonuç `status=ok`, `mode=eva_walkability`; **497 m**, **10,4 dk**, **+5,4/−17,8 m**, **11°** en büyük eğim ve **1,13** maliyet gösterdi. Minimap'te plan çizgisi ve heatmap görüldü. Hücre açıklaması `96/100` puanını, kullanılan formülü ve planlama/ölçüm sınırlamasını gösterdi. Uç noktaları temizleme işlemi özet/planı sıfırladı; kapsam dışı seçim reddedildi. Fixture'da **0 no-data hücresi** bulunduğundan gerçek no-data hücresine tıklama davranışı sınanmadı.
- **Stage 25 rota HUD ve 3D kılavuz — PASS (temel işlev); görüş sınırı var.** Geçerli bir plan için 3D HUD `sağ · −35°`, **297,1 m**, **100/100** yürünebilirlik ve **0,9°** eğim gösterdi. Planı temizleyince cyan plan çizgisi kayboldu; statik sarı görev çizgisi ve mor arşiv izi kaldı. 3D kılavuz uzak görünümde ince/uzak algılanıyor; oyuncuya yakın mesafede okunabilirliği ayrıca doğrulanmadı.

Bu 24B/25 gözlemleri ekip içindeki bağımsız tarayıcı kabul çalışmasından aktarılmıştır. Geçici ekran görüntüleri denetimden sonra geri yüklendi/korunmadı; bu rapor kalıcı ekran görüntüsü eki sunmaz. Smoke'un ürettiği geçici görüntüler de commit kapsamına alınmadı.

## İncelenmemiş veya kısmi kalanlar

- **Görünür zıplama ve iniş animasyonu — incelenmedi.** Smoke'taki zıplama/temas kontrolleri görsel zıplama yayı, iniş darbe sönümlemesi veya kamera dip hareketini kabul etmez.
- **Mars güneş aydınlatması (Stage 18B) — incelenmedi.** Güneş yönü/ışık davranışının arazideki görünümü için görsel PASS yoktur.
- **19B jeoloji HUD/kontak — incelenmedi.** Geoloji veri/anahtarının görünmesi, hücre seçimi ve açıklama doğruluğunu tek başına kabul etmez.
- **20B arşiv izi — kısmi.** Plan temizleme gözleminde mor arşiv izi sarı görev izi ve cyan plan çizgisinden ayrı kaldı. Arşiv izinin tam görünüm/anahtar akışı ve kapsam sınırları bu turda bağımsız olarak sınanmadı.
- **22B galeri — incelenmedi.** Galeri içeriği/panel kaydırması görsel olarak doğrulanmadı.
- **24A minimap etkileşimi — kısmi.** 24B uç nokta seçimi için minimap üzerinde etkileşim kullanıldı ve kapsam dışı seçim reddedildi; 24A'nın tüm pan/zoom ve gerçek no-data seçimi kabul ölçütleri çalıştırılmadı.
- **24B gerçek no-data seçimi — incelenmedi.** Kullanılan fixture no-data hücresi içermiyordu. Kapsam dışı reddi no-data reddinin yerine geçmez.
- **Stage 25 yakın-alan kılavuz görünürlüğü — açık.** Uzak 3D çizgi gözlendi; oyuncu yakınında çizginin kalınlık/örtüşme/okunabilirliği hakkında PASS verilmedi.

## Kayıt ve sınırlar

Eski rapordaki **26/32**, başarısız 3D ilk geçişine dayanıyordu: smoke başlangıçta simülasyonu paused yaparken `selectView('3d')` yüzey temasını kuramıyor, `bodyWorldZM` null kaldığı için mesh adımına ulaşmıyordu. Bu davranış `0769aa4` ile düzeltildi; son smoke **32/32** olarak kaydedildi. Worker yarışması önceki olası açıklamaydı, doğrulanmış kök neden değildi.

Kabul sonuçları yerel fixture ve belirli tarayıcı oturumlarına aittir. Bu rapor test çıktısı screenshot'ı içermez; kullanıcıya ait TIFF ve `.crdownload` dosyaları değiştirilmemiştir.
