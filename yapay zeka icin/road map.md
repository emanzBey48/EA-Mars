# Marswalk — Tam Proje Yol Haritası

**Son güncelleme:** 15 Kasım 2026 (K1 entegrasyon durumu ve sonraki rota/veri denetimi; taban `origin/codex/marswalk-ui-simplification` @ `3e1f570`)
**Proje:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Bu belge:** Kodlama planı ve karar kaydıdır; uygulama/test çalıştırma kaydı değildir.

## Proje kapanış durumu (15 Kasım 2026)

**Kaynak:** dal `codex/efe-visual-realism` @ `53068e6` (çalışma klasörü `C:\Users\efese\Desktop\Nasaspaceapps-efe`; bu bölüm `Nasaspaceapps` ana klasöründeki dal bilgisini değiştirmez). Bu bölümün doğrulaması Efe'nin bu oturumdaki komut çıktılarıdır; bağımsız kabul değildir.
- `node --test test/` → **601/601, çıkış kodu 0** (mevcut çalışma ağacı; ara çalıştırmada 573/573). `node scripts/preflight.mjs` → **HAZIR** (hata 0, uyarı 0).
- Başsız tarayıcı kabulü (8291 portu): `Sim/stage-final-acceptance.md`. Demo açılışı, 3D birinci şahıs ve eller, rota tercihi değişimi, minimap global/Jezero ve Viking, `?scale=3`, `?horizon=off`, 2D ve WebGL2 fallback **PASS**; no-data hücre reddi, sıçrama/iniş, varış rozeti, Sol 164 galerisi, ortomozaik hizası **NOT-TESTED**.
- `npm run smoke` bu oturumda **çalıştırılmadı** (Ajan R'nin portları).

**Tamamlanan aşamalar (commit ile):**
- Rota ve planlama: 23A `c5c5612`, 23B `e6105b9`, 23D `9cd0fd4`, 34A `4e2279e`, 34B `8e955e0` (birleşme `fa5a491`, worker uyumu `52c75aa`), 622f526 (bayat plan düzeltmesi), K3-2 minimap seçim reddi `c8e2d09` (birleşme `4f741a5`).
- Veri ve kanıt: 29B `0bc0772`, 29C + 31A `b5be052`, 31B kaynak paneli `07318d5` / `e569daf` (birleşme `919b9a8`), 35A `a38e5aa`, 36A `aa589b3`, 37A `190e133`, 39A `5db4a73`.
- Görünüm ve minimap: 24 `3167130`, 25/27 `246a99d`, 32A `932a0da`, 32B `aa32139`, 33A `872c547`, 33B `4d41a27` (birleşme `3a79d33`), 35B `3dd5ff2`, 36B `f438f8e` (birleşme `b159db3`), 39B `89b7f17`.
- Sunum: 29A ve 30 `5b7052f`.
- 3D ve birinci şahıs: 8 `9819da2`, 9/10 `fbc623f`, 11 `8054b1a`, 12 `58660f0`, 13 `653bf73`, 14 `e14b661` / `502d76c`, gerçek birinci şahıs eller `ab426ee`.
- Görsel gerçekçilik dalı: `0d212dc` (karakter), `db54ff5` (sahne: ton eşleme, gökyüzü, gölge), `ad6ae13` (entegrasyon), `f49e838` (cila).
- K2 (Efe): kamera hareketi `f7ea37b` (K2-1/K2-2), bölgesel ufuk ve gövde ankrajı `bbf75b6` (K2-3/K2-4; birleşme `5d97844`).
- Veri katmanları: 19A `c5d0e51`, 20 `48e330b`, 21A `d1abe35`, 22 `4d6bd10`.
- K1 takip: HUD gözlem düzeltmesi `b69eb2b`; belge kayıtları `1d48600`, `034c15f`, `53068e6`.

**Açık kalanlar:**
- K1-1 (entegrasyon): kod birleşik; bu oturumda smoke yok. Kabul kısmen (yukarıdaki PASS/NOT-TESTED).
- K1-2 (tarayıcı kanıtı): tam PASS değil. Açık: sıçrama/iniş pozu, Sol 164 galerisi ve yön düğmesi, gerçek no-data reddi, varış rozeti, hızlı rota yarışı, ortomozaik hizası.
- K1-3 (belgeler, Efe): bu oturumda tamamlandı: `Sim/DEMO_NOTES.md`, `Sim/README.md`, `Sim/stage-final-acceptance.md`, `Sim/stage-handoff-efe-to-alparslan.md`, bu bölüm.
- K1-4 (Viking lisans/atıf teyidi, elle, Efe): açık. Manifest hâlâ "belirtilmemiş".
- K1-5 (demo dondurma, Alparslan): açık; `demo-freeze` etiketi konmadı.
- K2-5 (son gerçekçilik turu) ve K2-6 (GPU/FPS ölçümü, Alparslan): açık.
- K3-1 (no-data üzerinde yerçekimi kararı, `sim.js`): açık; bu oturumda kod doğrulanmadı.
- K3-2 (tarayıcı kanıtı): kod var (`c8e2d09`), tarayıcıda hücre reddi NOT-TESTED.
- K3-3 (rig test sınırı onayı, Alparslan), K3-4 (rig `left*` adları, Efe): açık.
- K3-5 (datum): açık. `config.js:56` `verticalDatumVerified: true`; `data/dtm_subset.json` `false`.
- K3-6 (rapor metinleri): açık. `stage39-ortho-diagnosis.md` "Yazar: Efe" ifadesi ve r≈0,40 zayıf korelasyon; `stage34b` "costParams iletilir" ifadesi. Not: ROUTE_PREFERENCES costParams tablosu `main.js` içinden kaldırılmış; ağırlıklar yalnız `route/route-compare.js` içinde.
- K4 (yarışma sonrası: 41–45): kapsam dışı.

**Bilinen sınırlar ve tutarsızlıklar (ayrıntı `Sim/DEMO_NOTES.md` §3–4):**
- Rota süresi tahmini 0,8 m/s (`route-service.js:301`, `main.js:348`); simülasyon 1,2 m/s × 8 (`config.js`). Tutarsız.
- "En düz" tercihinin maksimum eğimi dengeliden yüksek çıktı (10,1° / 9,8°); tercih adı ölçümle açıklanmıyor.
- Rota uzunlukları UI (730/731 m) ile devir notu (730,505/732,161 m) arasında; doğrulanmadı.
- Göz yüksekliği kodda 1,48 m; `e9a0a78` mesajı 1,75 m.
- Ortomozaik uyarısı (`hud.js:104`) eski JP2 bayrağına bağlı; WMTS katmanıyla çelişkili görünür.
- Yürünebilirlik eşiği 20° kaynaklı değil (`cost-model.js:39` notu: birincil belge doğrulanmadı).

**Doğrulama notu:** Bu bölümden önceki "Doğrulama durumu" satırındaki 527/527 ve 38/38 sonuçları `b5be052` anına aittir; güncel sayı yukarıdadır. Taban satırı `3e1f570` olarak yazılmıştır; bu oturumda çalışılan dal bundan ileridedir.

## DERECE PLANI (K5) — 15 Kasım 2026

**Tam plan:** `Sim/stage-judging-plan.md` (resmî ölçüt araştırması, ölçüt eşleme, riskler, soru listesi).
**Resmî kaynak durumu:** spaceappschallenge.org sayfaları bu ortamda açılamadı (TLS sertifika hatası); jüri ölçütleri arama özetinden, teslim kuralları (demo ≤30 sn veya ≤7 slayt) teyit edilmeden kullanılır. **Son teslim saati doğrulanamadı; arama özetine göre 15 Kasım 23:59 olabilir** — K5-1 ilk iş.
**Ölçütler (arama özeti):** Impact, Creativity, Validity, Relevance, Presentation.

| # | İş | Sahip | Süre (sa) | Kabul |
|---|---|---|---|---|
| K5-1 (P0) | Son teslim saati, demo sınırı, challenge başlığını resmî sayfadan teyit et | Kullanıcı elle | 0,3 | Bitiş saati ve "Martian Map" başlığı yazılı |
| K5-2 (P0) | 7 slaytlık deck (metin Efe, tasarım kullanıcı) | Efe 1,5 + Kullanıcı 2,0 | 3,5 | ≤7 slayt, İngilizce, her sayı DEMO_NOTES'a bağlı |
| K5-3 (P0) | Yedek demo kaydı (60–90 sn `?demo=1`) ve 2D fallback görüntüsü | Kullanıcı 0,5 + Alparslan 0,5 | 1,0 | Tek dosya, kaynak sürümü yazılı |
| K5-4 (P0) | 14 kaynaklı atıf listesi; Viking lisans metni elle (K1-4 ile birlikte) | Efe 1,0 + Kullanıcı 0,5 | 1,5 | Tüm kaynak atıflı; uydurma lisans yok |
| K5-5 (P0) | Proje sayfası metni (özet, sınırlar paragrafı) | Efe 1,0 + Kullanıcı 0,5 | 1,5 | Zorunlu alanlar; her iddia depoya bağlı |
| K5-6 (P0) | Datum bayrağı: `config.js:56` kanıt yoksa `false` (K3-5 ile) | Alparslan 0,5 | 0,5 | İki kaynak aynı değer |
| K5-7 (P0) | Aktif arazi kararı (K3-7) ve uygulaması | Kullanıcı karar 0,2 + Alparslan 2,0 | 2,2 | Karar kayıtlı, UI/doküman tutarlı |
| K5-8 (P1) | Impact paragrafı | Efe 0,5 + Kullanıcı 0,2 | 0,7 | Ölçüsüz iddia yok |
| K5-9 (P1) | Creativity tek slayt | Kullanıcı 0,8 (Efe metin) | 0,8 | Tek slayt, ekran görüntüsü kanıtı |
| K5-10 (P1) | FPS tek değer (82–88, 54, 23–30 FPS çelişkisi; K2-6 ile) | Alparslan 1,0 | 1,0 | Cihaz ve koşul yazılı, tek değer |
| K5-11 (P1) | Rota hızı tek değer (0,8 vs 1,2 m/s) | Alparslan 0,3 veya Efe 0,2 | 0,3 | Tek değer ya da açık etiket |
| K5-12 (P1) | Ortomozaik ↔ aktif DTM ölçümü (K3-8) | Efe 3,0 | 3,0 | Ölçüm ya da "kanıtlanamadı" |
| K5-13 (P1) | K1-2 tarayıcı kabulü tamamlama | Alparslan 2,0 | 2,0 | Her madde PASS/FAIL/NOT-TESTED + kanıt |
| K5-14 (P1) | Rapor metin düzeltmeleri (K3-6) | Alparslan 0,5 + Efe 0,2 | 0,7 | Üç metin düzeltildi |
| K5-15 (P1) | Repo kökü README ve LICENSE kararı | Efe 0,7 + Kullanıcı 0,2 | 0,9 | Okunabilir README, lisans kararı yazılı |
| K5-16 (P2) | K2-5 gerçekçilik turu, K2-6 GPU tablosu, K3-3/K3-4 | Efe / Alparslan | 6,5 | Olursa; teslime dahil değil |

**Toplam tahmini:** P0 ≈ 10,5 sa (Efe 3,5; Alparslan 3,0; Kullanıcı 4,0 — kişi toplamı, paralel çalışılırsa takvim kısalır). P1 ≈ 9,4 sa.
**Sınır:** Puan için iddia şişirilmez; "güvenli rota", "canlı telemetri", "kanıtlı hizalama", "Viking arazi rengi" iddiaları kullanılmaz.

## Durum etiketleri ve bilgi kaynağı

- **TAMAMLANDI — dosya/kaynakla:** Güncel dosyalar veya birincil kaynak bunu destekliyor.
- **TAMAMLANDI — kullanıcı bildirimi:** Kullanıcı tamamlandığını söyledi; bağımsız doğrulama yapılmadı.
- **AÇIK:** İş sürüyor veya teslimi henüz kodda görünmüyor.
- **BEKLEMEDE:** Bağımlılık/etkinlik zamanı gelene kadar ertelendi.
- **KULLANICI BİLDİRDİ:** Kullanıcı tarafından iletilen tarih/test bilgisi; bağımsız doğrulama değildir.

**[KULLANICI BİLDİRDİ]** Etkinlik tarihleri 14–15 Kasım 2026 olarak bildirildi; bu tarih bilgisi resmi takvimden bağımsız doğrulanmış değildir.

## Son bağımsız Stage 13 ve runtime doğrulaması — 14 Kasım 2026

Stage 13 `astronaut-rig.js`/test teslimi bu daldaki mevcut koddur; bu doğrulama turunda kaynak değişmedi. Stage 13'e özel testler 7/7, `npm test` 241/241 geçti. Smoke testi önce sandbox'ın `127.0.0.1:9333` Edge DevTools bağlantısını `EACCES` ile engellemesi nedeniyle sayfa hedefi bulamadı; ardından `Sim/data/legacy-hirise/dtm_subset.f32` dosyasının gerçek raster yerine 132 baytlık Git LFS pointer'ı olduğu anlaşıldı. Yalnız bu LFS nesnesi çekildi; dosya 7.537.204 bayta ulaştı ve `git lfs fsck --objects --dry-run` başarılı oldu. Smoke yerel loopback erişimi olan çalıştırmada 32 kontrolden 26'sını geçti.

**Alparslan'ın takip etmesi gereken smoke bulguları:** İlk 2D→3D açılışında terrain mesh, smoke'un 10 saniyelik bekleme penceresi içinde görünmedi (ölçülen ilk geçiş 10,975 ms; tekrar 2D→3D geçişi başarılı). Buna bağlı rig/mesh tanıları 6b/6i/6l boş kaldı. Kontrol 6h geçerli yüzey örneği (`sample=ok`) varken `grounded=false` ve kamera yönü testinde yaklaşık −4,45 m ilerleme bildirdi. Kontrol 5b, arşiv izi açıklamasındaki “güvenli rota bilgisi içermez” uyarısını smoke metin kontrolüne dahil etmiyor. Bu 6 başarısız kabul maddesi Stage 13 saf rig birim testlerinin başarısızlığı değildir; renderer/simülasyon/UI entegrasyon sahibi Alparslan'ın incelemesi gerekir. Smoke ekran görüntüleri HEAD'deki halleriyle geri yüklendi; kod değişmedi.

**[KULLANICI BİLDİRDİ]** Alparslan regresyon kontrollerinin tümünün geçtiğini söyledi. Ayrıca 13 Kasım'da kullanıcı simülasyonun açıldığını, arayüzde “Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor)” uyarısını gördüğünü ve mevcut 3D görünümün hedef FPS deneyimine yakın olmadığını bildirdi. Bu kullanıcı gözlemleri bağımsız runtime kabulü değildir.

## KALAN GÖREVLER VE DAĞILIM — KAPANIŞ PLANI (15 Kasım 2026)

Bu bölüm aşağıdaki FAZ 3–7 tablolarının **güncel durumunu** özetler ve kalan işi Efe tarafı (kullanıcı + Claude ajanları) ile Alparslan arasında böler. Çelişkide bu bölüm geçerlidir.

**15 Kasım durum düzeltmesi (repo commitlerinden doğrulandı; bu not için test/tarayıcı çalıştırılmadı):** Efe'nin K2-1/K2-2 kamera hareketi `f7ea37b`, K2-3/K2-4 bölgesel ufuk ve gövde ankrajı `bbf75b6` commitleri push edildi. `5d97844` bunları `codex/k1-efe-horizon-integration` dalında Alparslan'ın `26fa9b0` fare yönü/ayak izi düzeltmesiyle birleştirdi. `db15f8f` sahne/rota arayüzünü sadeleştirdi; `3e1f570` minimap test beklentisini mevcut renkle eşitledi. K1-1 **kod birleşimi hazır**, fakat bu birleşik kesitte bağımsız birim/smoke ve gerçek tarayıcı kabulü yapılmadığından **çalışma zamanı kabulü açık**. Efe commit mesajlarındaki 573/573 ve 38/38 kendi dalına ait bildirilen sonuçtur; bu notun bağımsız doğrulaması değildir. K1-2 **açık**; `Sim/stage29-acceptance.md` içindeki eski PASS ifadeleri yeni birleşik kesit için ekran görüntülü kanıt yerine geçmez. K1-5 demo dondurma, K1-1 çalışma zamanı kabulü ve K1-2 görsel kabulü kapanana kadar yapılmaz; `demo-freeze` etiketi konmaz.

**K1 sonrası ayrı görev sırası:** Önce Efe, mevcut **500 hücre marjlı kesitte** iki anlamlı A* başlangıç/bitiş örneği seçip koordinat, yol/segment, hücre geçerliliği, DTM ve ortomozaik kapsamı ile sonuçları ölçülü bir raporda teslim eder. Ardından **500→750 hücre marjı yalnız aday** olarak ele alınır: veri boyutu/bellek ve kare/rota süresi, no-data ve kapsam boşlukları, ortomozaik hizası/kapsamı ve mevcut fallback karşılaştırmalı ölçülür. Ölçüm ve kabul olmadan marj büyütülmez; yeni sınırın güvenli rota veya tüm Mars EVA kapsamı olduğu söylenmez. Alparslan, Efe'nin kanıtı gelince `main.js`/provider/renderer entegrasyon kararını verir ve Luna'nın sade UI çizgisiyle minimap/rota etkileşimini birleştirir. Bu iş K1-2 tarayıcı kabulünden ayrı branch ve kabul ölçütüdür; Efe saf rota/veri/rapor dosyalarında, Alparslan entegrasyon/UI dosyalarında tek sahipli çalışır.

### Bugüne kadar kodda bulunanlar (test tarihleri ve dalları ayrıca belirtilir)
- **Efe tarafı:** 35A (kabartma ölçümü), 32A (ayak izi motoru), 33A (rota şeridi geometrisi), 34A + uyumluluk (rota tercihleri, worker), 36A (Viking karoları), 37A (MOLA bölgesel kot), 29B (no-data fixture ve testler), 29C (`scripts/preflight.mjs`), 31A (`SOURCES.md` üretici), görsel gerçekçilik dalı (ton eşleme, gökyüzü modeli, gölge haritası, arazi gölgelendirmesi, kapsül hatlı beyaz astronot, malzeme bağlama).
- **Alparslan tarafı (birleştirildi):** 32B, 33B, 34B, 35B, 36B, 622f526, 39A/39B, 25, 27, 29A (rapor), 30 (demo modu).
- **Doğrulama durumu (15 Kasım 2026, `codex/efe-visual-realism` @ `b5be052`):** `node --test test/` **527/527**, `npm run smoke` **38/38**, `node scripts/preflight.mjs` HAZIR. Ekran görüntüleriyle gözlem yalnızca Efe tarafı ajanlarınca yapıldı; Alparslan'ın raporları 33B/36B/622f526 için tarayıcı kabulünü açık bırakıyor.
- **Render pass sözleşmesi (bozulmamalı):** 0 arazi, 1 beacon/çizgi, 2 rig, 3 gökyüzü, 4 gölge derinliği (erken return), 5 ayak izi, 6 rota şeridi; yeni pass 7+.

### Aşama K1 — Teslim bloklayıcıları (P0, hemen)
| # | Görev | Sahip | Kabul |
|---|---|---|---|
| K1-1 | **Kod birleşimi hazır** (`5d97844`; `db15f8f`/`3e1f570` sonraki UI kesiti). `renderer.js` pass 0–7, `route/plan-response-state.js` tek konum; runtime kabul **açık**. | **Alparslan** (entegrasyon sahibi) | Birleşik kesitte birim ve smoke çıkış kodu 0; gerçek tarayıcıda 2D/WebGL2 fallback, rota ve ufuk davranışı doğrulanır. Önceki Efe test sayıları bu kabulün yerine geçmez. |
| K1-2 | **Açık — gerçek tarayıcı kabul kaydı** (`Sim/stage29-acceptance.md`'yi madde madde PASS/FAIL + ekran görüntüsü ile tamamla): zıplama/iniş, güneş görünümü, jeoloji HUD, galeri, minimap pan/zoom, 33B rota şeridi yakın-alan okunabilirliği, 36B global↔Jezero yakınlaştırma ve Viking katmanı, rota tercihi değişince bayat plan gösterilmemesi | **Alparslan** | "Kod incelemesi" ifadesi yok; her madde gözlenmiş kanıt veya "NOT-TESTED" + neden. |
| K1-3 | **README + `DEMO_NOTES.md` + son kabul raporu** (doğru yol `C:\Users\efese\Desktop\Nasaspaceapps\Sim`, çalıştırma, yeni özellikler, bilinen sınırlar, jüri kartı) | **Efe** | Belgelerdeki her sayı depodaki rapora bağlı; lisans uydurulmaz; preflight HAZIR. |
| K1-4 | **Viking MDIM 2.1 lisans/atıf teyidi:** USGS Astrogeology ürün sayfasını tarayıcıdan açıp lisans/atıf metnini kopyala (otomatik erişim 403 verdi) | **Efe (kullanıcı, elle)** | `Sim/data/viking-mdim/manifest.json` ve `SOURCES.md` güncellenir; metin yoksa "belirtilmemiş" kalır. |
| K1-5 | **Beklemede — demo dondurma:** 60–90 sn `?demo=1` akışı, hata durumunda 2D fallback, `demo-freeze` etiketi | **Alparslan** | K1-1 çalışma zamanı ve K1-2 ekran görüntülü tarayıcı kabulü kapandıktan sonra; sonrasında yalnız hata düzeltmesi. |

### Aşama K2 — Son görsel ve davranış cilası (P1)
| # | Görev | Sahip | Kabul |
|---|---|---|---|
| K2-1 | **Kodda (`f7ea37b`) —** saf `view/3d/camera-motion.js`: yürüme salınımı, iniş dip'i ve nefes | **Efe** | Bu kesitte bağımsız çalışma zamanı/görsel kabulü K1-2 ile açık. |
| K2-2 | **Kodda (`f7ea37b`) —** `camera-motion` kamera ve `main.js` bağlantısı | **Alparslan entegrasyon alanı; Efe commit'iyle geldi** | Geçiş ve duraklatma davranışı birleşik kesitte gözlenir. |
| K2-3 | **Kodda (`bbf75b6`) —** saf `view/3d/horizon-mesh.js`; MOLA bölgesel bağlam, `needs_review`, yerel HiRISE ile kot birleştirmesi yok | **Efe** | Yerel pencere dışı geometri ve no-data koşulları kod/testte var; birleşik çalışma zamanı kabulü açık. |
| K2-4 | **Kodda (`bbf75b6`, birleşim `5d97844`) —** ufuk renderer pass 7 / `main.js` bağlantısı | **Alparslan entegrasyon alanı; Efe commit'iyle geldi** | Gerçek tarayıcı görünümü, `?horizon=off`, fallback ve etiket K1-2'de gözlenir. |
| K2-5 | **Opus ile son gerçekçilik turu** (kalan: vizör altın rengi ön/3-4 görünümde doğrulanmadı, astronotun zemine gölgesi, sıçrama pozunun yürüyüşten ayrışması, güneş hale, yakın zemin detayı) | **Efe** (ajan; Opus kullanım limiti sıfırlanınca) | Önce/sonra ekran görüntüleriyle kayıt; iyileştirmeyen değişiklik geri alınır; FPS ölçümü. |
| K2-6 | **Gerçek cihaz/GPU kare süresi ölçümü** (düşük GPU, 1× ve 3× ölçek, gölge high/low/off) | **Alparslan** | FPS ve cihaz bilgisi kayda geçer; 60 FPS altında gölge kalitesi otomatik düşer. |

### Aşama K3 — Bilinen bulgular ve kararlar (P1)
| # | Bulgu | Sahip | Aksiyon |
|---|---|---|---|
| K3-1 | **`sim.js`: no-data üzerinde yürürken `grounded=false` ve `airborne=false`** → yatay hareket sürer, yerçekimi uygulanmaz (29B bulgusu) | **Alparslan** (karar + düzeltme) | Düşüş mü duruş mu kararı; seçilen davranış H1/H2 testleriyle kilitlenir. |
| K3-2 | **Minimap EDGE_UNKNOWN hücreleri seçilebilir görünüyor** (yalnız planlayıcı `start_blocked` ile reddeder) | **Alparslan** | Seçim anında anlık red/uyarı veya hücre boyama. |
| K3-3 | **Stage 13 rig testi sınırı gevşetildi** (vz ±2,0 → ±1,2; kalkış geçiş penceresi); uçuş pozu kalkıştan ~0,3 s sonra tam devreye giriyor | **Alparslan** (onay) + **Efe** | Tasarım onayı; gerekirse geçiş penceresi daraltılır. |
| K3-4 | **Rig `left*` adları fiziksel sağ tarafta** (`side` metadatası eklendi) | **Efe** | Renderer/main kullanımı gözden geçirilip adlar kalıcı düzeltilir veya `side` esas alınır. |
| K3-5 | **Datum tutarsızlığı:** `config.js` `verticalDatumVerified: true` ↔ `dtm_subset.json` `false` | **Efe** (38A denetim) → **Alparslan** (38B düzeltme + `.gitattributes`) | Kanıt yoksa `false`/`needs_review`. |
| K3-6 | **`stage34b`/`stage39` rapor düzeltmeleri:** "costParams iletilir" ifadesi worker düzeltmesinden önce doğru değildi; 39A raporunda "Yazar: Efe" ve "0,0 m sapma" ifadesi (aritmetik tutarlılık, bağımsız kanıt değil) | **Alparslan** | Rapor metinleri düzeltilir. |
| K3-7 | **Aktif arazi legacy yedeği; ürün kararı gerekli.** Ekranda PDS3 DTEEC (legacy, `data/legacy-hirise/`) gösteriliyor; USGS 1 m adayı (`data/dtm_subset.json`) `needs_review_verticalReference` ile reddediliyor (`surface/registry.js` `resolveActiveProvider`). Çelişki: bu yol haritasının 14 Kasım notu ("bunları aktif veri girdisi veya otomatik fallback olarak kullanma") ile `AGENTS.md` ("HiRISE fallback'i korunur") karşılaşıyor; uygulama fiilen legacy fallback ile çalışıyor. Karar bekleyen çelişki; bu düzeltme kararı vermez. | **Alparslan** (registry) + **karar: kullanıcı** | Seçenekler: (a) legacy kalır; (b) USGS 1 m `needs_review` etiketiyle etkinleşir (38B ile birlikte). Seçime göre registry, UI etiketi ve belgeler güncellenir. |
| K3-8 | **Ortomozaik ↔ AKTİF (legacy) DTM kayıt ölçümü yok.** `stage39`/`stage21b` ölçümleri USGS adayı penceresinde (`data/dtm_subset.*`). Legacy DTEEC farklı çerçeve: yarıçap 3394,84 km, merkez meridyen 77,44°E, standart enlem 15° (`data/legacy-hirise/dtm_subset.json`); USGS: 3396,19 km, 0°E, 0°. "Ortak TRN tabanı" argümanı yalnız JEZ DTM için geçerlidir. | **Efe** | `scripts/validate-ortho-registration.mjs` legacy DTM'e uyarlanır (PDS3 çerçeve köprüsüyle; mevcut köprü `surface/registry.js` `makeLegacyCoordinateBridge`). Sonuç: ölçülmüş öteleme ± belirsizlik veya "kanıtlanamadı". Bu bitene kadar aktif DTM ile hizalı denmez. |
| K3-9 | **Efe analizlerinin aktif DTM'de yeniden koşulmaması.** Kabartma (35A), rota doğrulama (23C), tercih tablosu (34A/worker), `relief-report` ve ufuk dikiş ölçümü (37A) USGS adayında yapıldı; UI aktif legacy üzerinde. Örnek fark: en kısa rota maks. eğimi UI 14,1°, USGS adayı 10,64°. | **Efe** | Aynı analizler legacy DTM üzerinde yeniden koşulur ve farklar raporlanır (`DEMO_NOTES.md` §4 tablosu). |
| K3-10 | **Legacy DTM çerçeve uyuşmazlığı (YÜKSEK ETKİ, bulgu: `Sim/stage-k3-legacy-analysis.md`).** Minimap, ısı haritası ve rota planlayıcı legacy DTM'i *düzenli ızgara* (1,00966 m/hücre) olarak işliyor; yükseklik örnekleyici (3D, sim, ayak izi, şerit) ise *coğrafi köprüyü* (doğu-batı ~1,0457 m/hücre) kullanıyor. Aynı yerel (x,y) için iki farklı hücre: WB1'de Δx ≈ 18,7 m, Roubion'da ≈ 23,4 m, pencere doğu kenarında ≈ 40,7 m; Roubion eğimi planlayıcıda 8,59°, örnekleyicide 3,82°. Yerler: `view/render.js:75-80`, `main.js:813-817`, `surface/registry.js:22-36`. Maliyet haritası ile gezilen arazi arasında 20–40 m kayma = Validity riski. **Öneri:** legacy DTM'i köprüyle BİR KEZ yerel-metre düzenli ızgaraya yeniden örnekle (`geo/regional-dem.js` `resampleToLocalGrid` bu iş için kullanılabilir) ve planlayıcı, minimap ve örnekleyicinin hepsi aynı ızgarayı kullansın. | Alparslan (entegrasyon) + Efe (yeniden örnekleme yardımcısı) | Planlayıcı hücresi = örnekleyici hücresi (sapma < 1 hücre) WB1, Roubion ve doğu kenarında; mevcut testler ve smoke yeşil; K3-9 tablosu yeniden koşulup UI ile tutarlı |

### Aşama K4 — Yarışma sonrası genişleme (P2; K1–K3 bittikten sonra)
| Görev | Efe | Alparslan |
|---|---|---|
| Çok haritalı jeoloji (SIM 3292) | **41A** indeks üretici (`scripts/build-sim3292-index.mjs`) | **41B** HUD/minimap: `sourceMapId`, `mapScale`, `conflict`, `fallbackChain` |
| K2 aday saha doğrulaması | **42A** Gale/Columbia Hills (datum, no-data, hiza) | **42B** saha seçici |
| Hiyerarşik planlayıcı | **43A** `route/hierarchical.js` | **43B** UI |
| Arazi LOD/chunk | **45A** `view/3d/terrain-lod.js` | **45B** entegrasyon + cihaz ölçümü |
| Gerçek PLACES traverse | ağ erişimiyle destek | **40** (45–60 dk engel kuralı) |
| Viking z4+ (daha ince seviye) | gerekirse yeni ham dosya gerekir (ham TIFF projeden çıkarıldı) | — |

### Kapanış ölçütü
K1'in tamamı kapalıysa proje "teslim edilebilir"dir. K2 görsel kaliteyi, K3 bilinen risklerin kapanışını, K4 kapsam genişlemesini temsil eder; K4 yetişmezse yarım bırakılmaz, kapalı bir anahtarla gizlenir.

## DEVAM PLANI — FAZ 3–6 (14 Kasım 2026, gece geç)

Bu bölüm aşağıdaki eski "AÇIK/SIRADAKİ" etiketlerinin önündedir. Etkinlik tarihi (14–15 Kasım) bildirilmiştir. Plan: **demo kapanışı (FAZ 3)** ve ekip hedeflerini karşılayan **gerçekçi Mars yürüyüşü (FAZ 4: ayak izi, parlak 3D rota şeridi, minimap rota tercihleri, gerçek dikey ölçek, yeni Viking veri seti, bölgesel ufuk)** birlikte ilerler; ardından veri doğruluğu borçları (FAZ 5), tüm Mars kapsamı (FAZ 6) ve animasyon/performans (FAZ 7). FAZ 5–7 etkinlik sonrası/zaman kalırsa işlerdir.

### Durum mutabakatı (eski tabloların yerine bu geçer)

| Aşama | Durum | Kanıt / not |
|---|---|---|
| 23A cost-model, 23B pathfinder + worker + `route-service.js`, 23C doğrulama raporu | **Kodda tamamlandı (Efe)** | `route/`, `test/cost-model|pathfinder|route-service`, `Sim/stage23a/b-*-audit.md`, `Sim/stage23-route-validation.md` (WB1→Roubion planlanan 730,5 m; arşiv izi 896,5 m; rover izinden "daha iyi" iddiası yok) |
| 23D test eşlemesi | **Tamamlandı (Efe)** — `9cd0fd4`, `50507b5` | `minimap.test.mjs`, `mars-sun.test.mjs` (iki hatalı beklenti düzeltildi), core H1/H2 testleri; `node --test test/` **268/268** (Efe çalıştırdı). H5 zaten `geology.test.mjs` kapsamında |
| 21B-Ön & 39A ortomozaik↔DTM kayıt teşhisi v2 | **Tamamlandı (Efe)** — `67f89f9` + Stage 39A | `stage21b-registration-audit.md` + `stage39-ortho-diagnosis.md`: ~26 m / ~305 m waypoint farkının raster kayması değil katalog farkı (`isRasterShift: false`) olduğu kanıtlandı; high-pass ($r=5$) korelasyon tepe değeri $r=0,3975$ $(+0,5, -0,5)$ px ($\pm 1,5$ m yerel belirsizlik); ortak `JEZ_hirise_soc_006` TRN tabanı ile 0,0 m kenar sapması; `surface/ortho-layer.js` (9/9 test, toplam 284/284 test). |
| 21B / 39B ortomozaik kaplaması (2D, 3D WebGL2, Minimap, HUD) | **Tamamlandı (Alparslan)** | `data/ortho/ortho-mosaic-z17-tiles.png` (0,318 m/px) + `ortho-mosaic-z14-tiles.png` (2,544 m/px), `renderer.js`, `render.js`, `minimap.js`, `hud.js`, `main.js`: `Hibrit` / `Orto` / `Hillshade` modları, kapsam dışında hillshade korunumu, `Lisans: kaynakta belirtilmemiş` künyesi. |
| 24A, 24B, 25, 25B | **Kodda (Alparslan)** — `19761c7`..`246a99d` | `stage25b-visual-acceptance.md`: smoke **32/32** ve `npm test` 250/250 *raporlandı*; 24B/25 temel akış + 2D/3D yakın alan kılavuzu (`246a99d`) tamamlandı |
| 26A, 27 (kayıt katmanı + HUD) | **Tamamlandı (Efe + Alparslan)** — `5c4100d`, `ce65452`, `246a99d` | `geo/trek-tiles.js` (43 test), `geo/geology-registry.js` (7 test) + `main.js`/`hud.js` entegrasyonu; SIM 3292 küresel indeks 41A'da |
| 29A görsel kabul & 30 jüri demo modu | **Tamamlandı (Alparslan)** | `Sim/stage29-acceptance.md`, `main.js`, `hud.js`, `index.html`, `styles.css`, `README.md`: 25B'de ertelenen 9 özelliğin kabulü, Jüri Sunum Modu (`#btn-demo-mode`, `?demo=1`), tek tıkla/URL ile Sol 120→164 A* rotası ve 3D yürüyüş demosu, sağlam 2D fallback. |
| 35B dikey ölçek & 34B minimap | **Tamamlandı (Alparslan)** | `Sim/stage35b-scale-acceptance.md`, `Sim/stage34b-minimap-acceptance.md`: 1× bilimsel dikey ölçek, sürükle-bırak uç noktalar, 3 rota tercihi ve zenginleştirilmiş metrikler |
| 26B, 28 | **Açık (Alparslan)** | 26B → 37B içinde, 28 → 42B |

**25B raporundan devreden açık maddeler (FAZ 3'ün girdisi):** görünür zıplama/iniş animasyonu ve kamera dip'i, Mars güneş aydınlatması (18B) görünümü, 19B jeoloji HUD/kontak, 22B galeri, 24A tüm pan/zoom ve gerçek no-data seçimi (fixture'da **0 no-data hücresi** var), Stage 25 yakın-alan kılavuz okunabilirliği, rig'in tüm yürüme pozlarında kırpılma/clipping incelemesi.

**Dosya sahipliği (değişmez):** Efe = saf modüller (`geo/`, `route/`, yeni saf dosyalar), `scripts/`, `test/`, audit `.md`. Alparslan = `main.js`, `config.js`, `simulation/`, `surface/`, `input/`, `view/`, `server.mjs`, `index.html`, `styles.css`, belge uyumu. Efe'nin yeni saf dosyası bir `view/` klasöründe doğuyorsa **yeni dosya** olmalı, mevcut dosyaya dokunmaz; bağlantıyı Alparslan yapar. Her aşama kısa ömürlü branch + tek kabul ölçütü + ayrı commit; handoff'ta Efe teslim notuna kullanılan API'yi ve çalıştırılmayan testleri yazar.

### FAZ 3 — Demo kapanışı (P0: etkinlik günü; önce bunlar)

| Aşama | Sahip | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|
| **29A — Kalan görsel kabul turu** | **Tamamlandı (Alparslan)** | `Sim/stage29-acceptance.md` (yeni rapor) | 25B'de ertelenmiş 9 görsel ve kinematik özelliğin tamamı tarayıcı ve kod analizinde PASS olarak doğrulandı (zıplama yayı + iniş dip'i, güneş, jeoloji HUD, galeri, minimap pan/zoom, yakın-alan kılavuz, aşağı bakışta giysi kadrajı, 1× dikey ölçek, HiRISE ortomozaik). | Tüm maddeler PASS; sınırlamalar ve feragatler kanonik olarak belgelendi. |
| **29B — No-data kapsamı: sentetik fixture ve testler** | **Efe** | `scripts/make-nodata-fixture.mjs` (yeni), `test/nodata-route.test.mjs` (yeni) | Pencere ortasında no-data adası (ve kenar şeridi) içeren deterministik küçük DTM fixture'ı; testler: A\* adayı dolaşır, uç nokta no-data'da `no_path`/red nedeni, minimap seçimi reddi, `sim` no-data üzerinde sahte zemin teması kurmaz, no-data hiçbir yerde 0'a dönmez. | Fixture yalnız test/script verisidir (gerçek veri değildir, etiketli). Tarayıcıda yüklenmesi için gereken yükleme yolunu Alparslan karar verir; Efe `main.js`/`surface/`'a dokunmaz. |
| **29C — Demo öncesi ön uçuş kontrolü** | **Efe** | `scripts/preflight.mjs` (yeni), `test/preflight.test.mjs` (yeni) | Tek komut: gerekli veri dosyaları var mı, **Git LFS işaretçisi mi gerçek raster mı** (132 baytlık pointer tespiti — smoke'u engelleyen geçmiş sorun), manifest hash'leri (metin dosyalarında CRLF→LF normalizasyonu D3), `node --test` özeti. Çıkış kodu ve insan-okunur rapor. | Pointer dosyası varsa net hata ve `git lfs pull` önerisi; eksik veri sessizce geçmez. |
| **30 — Demo akışı ve dondurma** | **Tamamlandı (Alparslan)** | `main.js`, `view/hud.js`, `index.html`, `styles.css`, `README.md` | Jüri ve sunum modu (`#btn-demo-mode`, `#presentation-hud`, `?demo=1`), 60–90 sn örnek senaryo akışı (`#btn-demo-tour` Sol 120 → Sol 164 A* rotası, 3D birinci şahıs geçişi, 1× gerçek ölçek ve HiRISE ortomozaik dokusu, `#arrived-banner`), hata durumunda sağlam 2D fallback. | Jüri sunum modu hazır; tek tıkla/URL ile demo akışı; 2D fallback korunur. |
| **31A — Kaynak/atıf derleyici** | **Efe** | `scripts/build-sources-list.mjs` (yeni), `Sim/SOURCES.md` (üretilir), test | `Sim/data/*/manifest.json` ve FGDC/USGS kayıtlarından kaynak, ürün kimliği, çözünürlük, lisans (kaynakta yoksa **"belirtilmemiş"**), atıf tablosu. | Hiçbir lisans uydurulmaz; kaynaksız alan boş değil "belirtilmemiş" yazar; test bunu kilitler. |
| **31B — "Kaynaklar ve sınırlar" paneli + belge uyumu** | **Alparslan** | `index.html`, `styles.css`, `main.js`, `AGENTS.md`, `yapay zeka icin/SYSTEM_PROMPT.md` | Uygulama içi kaynaklar paneli (31A çıktısı) ve "güvenlik skoru yok" → "şeffaf yürünebilirlik puanı" kararının `AGENTS.md`/`SYSTEM_PROMPT.md`'ye işlenmesi. | Belgelerde "güvenli rota" iddiası kalmaz; panel 31A ile tutarlı. |
| **31C — Jüri için bilimsel sınır kartı** | **Efe** | `Sim/DEMO_NOTES.md` (yeni) | Tek sayfa: hangi değer ölçüm / hesap / senaryo; yerçekimi 3,71 m/s² (NASA Planet Compare; NSSDC 3,73 yuvarlaması); atmosfer ortalama/mevsimsel, anlık Jezero değil; rover izi insan rotası değil; hizalama kanıtlanmadı → ortho kapalı; olası sorular ve dürüst yanıtlar. | Her sayı kaynak+birimle; çözülmemiş sınırlar saklanmaz. |

### Ürün hedefleri (ekip isteği, 14 Kasım 2026 gece) ve mevcut durumla eşlemesi

| # | İstek | Bugünkü durum (kaynak/rapor) | Karşılayan aşama |
|---|---|---|---|
| H1 | Yürürken arkada **ayak izi izi** (trail) | 3D'de **yok**. Yalnız 2D'de oyuncu izi (`sim.js` `trail`, 2 m aralık, `render.js`). | **32A/B** |
| H2 | **2D minimap**, başlangıç/bitiş seçimi | **Var** (24A/24B, `view/minimap/`; kapsam dışı ve no-data seçimi reddedilir). Gerçek no-data tıklaması fixture'sızlık nedeniyle sınanmadı. | 29B (test), **34A/B** (iyileştirme) |
| H3 | Noktalar arası **"güvenlilik oranı"** + otomatik yol tarifi | **Var, ancak adı farklı:** ürün kararı gereği *şeffaf EVA yürünebilirlik puanı* (0–100, planlama göstergesi; **güvenli rota sertifikası değildir**). A\* rotası 24B ile minimap'te. | **34A/B** (rota tercihi, segment puanı gösterimi) |
| H4 | Rotanın **3D'de yerden parlak çizgi/trail** olarak çizilmesi | Kısmen: 25'te ince 3D kılavuz çizgisi var; yakın-alan okunabilirliği **doğrulanmadı** (25B raporu). Parlak/akan şerit yok. | **33A/B** |
| H5 | **Yükseklik oranının gerçekçi olması** (karakter ve tepe/çukur) | Arazi `verticalScale: 3` ile **3× abartılı** (`main.js:423`); karakter/kamera 1:1 (göz 1,48 m). Rig ölçüleri ve 6 m görsel adım "tasarım sabiti"dir, kaynaklı insan/giysi ölçümü değildir. Yerel DTM 1 m ve NASA verisidir; abartı sunum parametresidir. | **35A/B** |
| H6 | **Yeni veri setini** incele ve kullan | `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` (kök dizin, **12,7 GB**, git'te değil). Aşağıdaki denetim. | **36A/B**, **37A/B** |

### Yeni veri seti denetimi — `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` (14 Kasım 2026)

**[DOĞRULANDI — TIFF başlığı ve piksel okuma, bu turda]** BigTIFF (sürüm 43), little-endian; **92160 × 46080**, 3 bant × 8 bit, `Photometric = RGB`, **sıkıştırmasız** (`Compression = 1`), 46080 strip (strip başına 1 satır, 276.480 bayt), `PlanarConfig = 1`; `ModelPixelScale = 231,5417872 m`, `ModelTiepoint` sol üst = (−10.669.445,554 ; 5.334.722,777) m (= −180° ve +90°, `R·π` ile tutarlı); GeoKey metni "SimpleCylindrical Mars / GCS_Mars / D_Mars", **yarıçap 3.396.190 m** (projedeki küreyle aynı); `GDAL_NODATA = 0`. Yedi örnek satırda (enlem +89,6° … −89,7°) piksel değeri (0,0,0) olan **sıfır** piksel bulunmadı. Jezero/WB1 (77,449°D 18,439°K) → sütun ≈ 65.907, satır ≈ 18.319; okunan RGB ≈ (33–38, 27–32, 38–43).

**Ne işe yarar / ne yaramaz (kritik):**
- **Yükseklik verisi DEĞİLDİR.** 8 bit renkli görüntü mozaiğidir; kot, eğim veya çukur/tepe derinliği bu dosyadan **çıkarılmaz**. Kabartma gerçekçiliği için ham kot (HiRISE 1 m DTM; bölgesel için MOLA, bkz. 26A/37A) gerekir.
- **232 m/piksel:** Jezero 1328×1234 m penceresinde ~6×5 piksel; yerel doku/ortho olarak **kullanılamaz**. Doğru kullanım: küresel/bölgesel **minimap zemini (K0)** ve uzak ufuk renk bilgisi. Mozaik "ortogörüntü" ve "gerçek renk" diye sunulmaz (Viking mozaiği işlenmiş renk ürünüdür; ürün adı dosya adından okundu).
- Strip'ler sıkıştırmasız ve ardışık olduğundan satır başına tek okumayla **akış (stream)** halinde işlenebilir; tüm 12,7 GB belleğe alınmaz. Ham strip ofset dizisinin tamamı ve süreklilik varsayımı 36A'da doğrulanır (bu turda yalnız ilk 6 ofset okundu: sabit 276.480 bayt adım).
- **Künye/lisans dosyada yok** (yalnız dosya adı Viking MDIM 2.1'i gösteriyor) → UI ve `SOURCES.md` için **"belirtilmemiş"**; resmi USGS Astrogeology ürün sayfasından atıf/lisans teyidi 36A'da yapılır.
- **Depo hijyeni:** 12,7 GB dosya git'e/LFS'e **eklenmez** (GitHub sınırı aşılır). `.gitignore` kuralı (Alparslan, 36B içinde) ve dosyanın `Sim/data-external/` gibi izlenmeyen bir klasöre taşınması gerekir; commit'e yalnız 36A'nın ürettiği küçük karo/özet çıktıları girer.

### FAZ 4 — Gerçekçi Mars yürüyüşü (kullanıcı hedefleri H1–H6; FAZ 3 ile paralel başlar, görünür özellikler önce)

Sıra notu: **35 (gerçek ölçek) önce karara bağlanır**, çünkü ayak izi (32), parlak rota şeridi (33) ve rig/kamera ayarları nihai dikey ölçeğe göre ayarlanmalıdır. Efe'nin A paketleri displayConfig'e **parametre olarak** bağlıdır; ölçek değişince yeniden yazılmaz.

| Aşama | Sahip | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|
| **35A — Gerçek ölçek sözleşmesi ve kabartma ölçümü** | **Efe** | `geo/relief-metrics.js` (yeni, saf), `scripts/relief-report.mjs` (yeni), `test/relief-metrics.test.mjs`, `test/scale-contract.test.mjs`, `Sim/stage35-scale-audit.md` | (1) Yerel DTM'den **ölçülmüş** kabartma özeti: yükseklik aralığı (P1–P99), en dik eğim, yerel çukur/tepe derinlikleri (çukur = çevresine göre en az X m alçak kapalı bölge; **X senaryo parametresi**), WB1→Roubion çevresinde büyük 5 yükselti/çukur için metre cinsinden değerler. (2) `displayConfig.verticalScale`'in 1 olduğunda gösterilen yüksekliğin kaynak metreye **birebir** eşit olduğunu, ≠1 iken abartının etiketli olduğunu kilitleyen sözleşme testi. (3) Rig/kamera ölçü denetimi: göz 1,48 m, rig boyutları, 6 m görsel adım **tasarım sabitidir**; kaynaklı birincil insan/giysi ölçüsü bulunamazsa "senaryo parametresi" etiketi önerilir (kaynak uydurulmaz). | Sayılar ham DTM'den tekrar üretilebilir; no-data'lı bölgede istatistik "bilinmiyor" döner, 0'a çevrilmez; Efe `main.js`/`config.js`'e dokunmaz. |
| **35B — Dikey ölçeği gerçeğe çek** | **Alparslan (TAMAMLANDI)** | `main.js`, `view/hud.js`, `index.html`, `styles.css`, `view/3d/renderer.js`, `stage35b-scale-acceptance.md` | Varsayılan `verticalScale: 1`; arayüzde dinamik dikey ölçek seçici (1× gerçek / 2× / 3×); HUD ölçek rozeti; 3. şahıs rig uzaması giderildi (1:1 oran korundu); tüm arazi, jeoloji, beacon ve rota katmanları tek `displayConfig`'ten dinamik yeniden üretilir; Mars güneş aydınlatması `uTerrainExaggeration` ile doğrulanır. | **TAMAMLANDI (Alparslan; kabul raporu `Sim/stage35b-scale-acceptance.md`)**: 1×'te gösterilen kot farkı = DTM kot farkı; 3. şahıs rig'in 3× uzaması giderildi; tarayıcıda dinamik ölçek geçişi doğrulandı. |
| **32A — Ayak izi geometri/yerleştirme motoru** | **Efe** | `view/3d/footprint-trail.js` (yeni, saf; mevcut `view/` dosyasına dokunmaz), `test/footprint-trail.test.mjs` | Girdi: konum akışı, yön (heading), yürüyüş fazı (`gaitDistanceM`/`presentationStrideLengthM`), `grounded`/`airborne`, enjekte edilen zemin örnekleyici (kot + eğim, no-data ayrımı). Çıktı: sol/sağ ayak **dönüşümlü** yerleştirme, yanal ofset, zemin eğimine hizalı yama (quad) verisi, yaşa bağlı solma, **halka tampon** (üst sınır) ve `Float32Array` örnek verisi. Havada iz yok; iniş noktasında tek, geniş iz; no-data hücresinde iz **bırakılmaz** (zemin uydurulmaz). | Aynı girdi → aynı çıktı; çift ayak aralığı/sıra testleri; no-data'da sıfır iz; tampon taşmaz; **iz derinliği/regolit mekaniği iddiası yok** ("görsel izdir"). |
| **32B — Ayak izi render ve minimap izi** | **Alparslan** | `main.js`, `view/3d/renderer.js`, `view/render.js`/`view/minimap/minimap.js` | 32A verisini örneklemeli (instanced) yama olarak çizer (koyu/ince, zemine hafif ofsetli, z-fighting yok); minimap'te ve 2D'de oyuncu izi ayak çifti/noktalarıyla gösterilir; duraklatmada izler donar; sıfırlamada temizlenir. | Gerçek tarayıcıda yürüyüş/dönüş/zıplama-iniş sırasında doğal görünür; 60 sn yürüyüşte bellek/kare süresi artışı raporlanır; 2D fallback çalışır. |
| **33A — Zemini izleyen parlak rota şeridi geometrisi** | **Efe** | `view/3d/route-ribbon.js` (yeni, saf), `test/route-ribbon.test.mjs` | `planRoute` yolundan zemine yapışan **şerit mesh** (genişlik, zemin üstü ofset, yol boyunca UV/uzunluk koordinatı ile akan desen için, dar dönüşte kıvrım sınırı); **no-data boşluğunda şerit kırılır** (köprü kurulmaz); mesafeye göre örnekleme seyreltme. | Deterministik; no-data testlerinde boşluk üstünden üçgen yok; UV monoton; sıfır genişlik/dejenere üçgen yok. |
| **33B — Parlak (emissive) şerit render ve minimap parlaması** | **Alparslan** | `view/3d/renderer.js`, `view/3d/marker-mesh.js` (gerekirse), `main.js`, `view/minimap/minimap.js`, `styles.css` | Toplamalı karışım (additive) emissive şerit, akan desen, sıradaki rota noktasına doğru nabız; yakın mesafede okunur, uzakta kaybolmaz; segment rengi yürünebilirlik puanına göre (planlama göstergesi etiketiyle); minimap'te aynı rota parlak çizgi. | 25B'de "doğrulanmadı" kalan **yakın-alan okunabilirliği** PASS/FAIL ile kaydedilir; rota değişince/temizlenince şerit güncellenir; no-data üzerinde köprü yok; bu şerit "güvenli rota" demez. |
| **34A — Rota tercihleri ve segment karşılaştırması** | **Efe** | `route/route-compare.js` (yeni), `test/route-compare.test.mjs` | Aynı başlangıç/bitiş için senaryo ağırlıklı **tercihler** ("en kısa", "dengeli", "en düşük eğim") — her biri `costParams` ön ayarı; çıktı: uzunluk, süre, kot kazanım/kaybı, ortalama/en düşük puan, segment puan listesi; "puan = planlama göstergesi" metni. | Tercih değişince monoton beklenen farklar (en düşük eğim ≥ en kısa uzunluk); aynı girdi → aynı sonuç; ağırlıklar "senaryo parametresi" etiketli (NASA eşiği gibi sunulmaz). |
| **34B — Minimap'te tercih seçimi, sürüklenebilir uç noktalar, puan özeti** | **Tamamlandı (Alparslan)** | `Sim/public/js/view/minimap/minimap.js`, `Sim/public/js/main.js`, `Sim/public/index.html`, `Sim/public/styles.css`, `Sim/stage34b-minimap-acceptance.md` | Başlangıç/bitiş işaretçilerini sürükleyerek değiştirme (drag-and-drop), rota tercihi seçici (`balanced`, `shortest`, `flattest`), anında dinamik yeniden planlama (`byDrag: true`), zenginleştirilmiş rota özet paneli (mesafe, tahmini süre, ortalama yürünebilirlik puanı, en dik eğim, kot değişimi ΔZ) ve "yürünebilirlik puanı (planlama göstergesi — güvenli rota sertifikası değildir)" etiketi; hücre açıklaması (`explainCell`) korunur. | **TAMAMLANDI (Alparslan; kabul raporu `Sim/stage34b-minimap-acceptance.md`)**: Sürükle-bırak etkileşimi, rota tercihleri ve dinamik yeniden planlama başarıyla tamamlandı. |
| **36A — Viking mozaiği alımı (stream) ve küçük çıktılar** | **Efe** | `geo/viking-mosaic.js` (yeni, saf: lon/lat↔piksel, strip ofset doğrulama), `scripts/ingest-viking-mosaic.mjs` (yeni), `test/viking-mosaic.test.mjs`, `Sim/stage36-viking-audit.md`, `Sim/data/viking-mdim/` (yalnız küçük çıktılar + `manifest.json`) | Başlık doğrulayıcı (BigTIFF, boyut, bant, sıkıştırmasız, ölçek/tiepoint/yarıçap/nodata); **tüm 46080 strip ofsetinin ardışıklığı** ve dosya boyutu tutarlılığı; satır-satır akışla aşağı örnekleme → **256 px karo piramidi (z0…z5/z6)** ve Jezero çevresi bölgesel kesit (çözünürlük korunur, 232 m/piksel olarak etiketli); `(0,0,0)` = no-data semantiği ölçülür (sıfır piksel oranı raporlanır; 0'a çevirme yok); lisans/atıf teyidi (USGS Astrogeology sayfası) — bulunamazsa "belirtilmemiş". | Toplam çıktı boyutu raporlanır (hedef ≤ ~40 MB, aşılırsa seviye azaltılır); ham 12,7 GB dosyaya testlerde bağımlılık yok (test sentetik küçük BigTIFF üretir); "ortho/yükseklik" adlandırması yok. |
| **36B — Küresel minimap zemini + depo hijyeni** | **Alparslan** | `view/minimap/minimap.js`, `main.js`, `index.html`, `.gitignore`, `Sim/README.md` | Minimap'e K0 renkli zemin katmanı (36A karoları; yakınlaşınca "232 m/px — yerel ayrıntı yok" uyarısı, HiRISE/hillshade katmanına geçiş), atıf ve katman anahtarı; `.gitignore` ile 12,7 GB TIFF'in izlenmemesi, taşınma yolu README'de. | Dosya yokken/karo eksikken minimap bozulmaz (katman `unavailable`); mozaik "ortogörüntü/gerçek renk" diye adlandırılmaz; 12,7 GB dosya commit'e girmez. |
| **37A — Bölgesel ham kot (MOLA) okuyucusu ve ufuk verisi** | **Efe** | `geo/trek-raster.js` (yeni, saf), `geo/regional-dem.js` (yeni), testler, `Sim/stage37-regional-dem-audit.md` | Trek ImageServer `exportImage` F32/S16 TIFF ayrıştırıcı ve `noData` semantiği; 26A uyarı 1'in **sayısal ölçümü** (`GCS_Mars_2000` küre mi elipsoid mi); yerel HiRISE DTM ile MOLA'nın örtüştüğü bölgede **kot farkı istatistiği**; ±birkaç yüz km'lik bölgeden ufuk ızgarası (463 m/piksel) örnekleyici. | MOLA–DTM kot farkı ölçülür ve raporlanır; fark kabul edilemez büyükse (eşik senaryo) ufuk yerel DTM ile **birleştirilmez**, ayrı "bölgesel bağlam" olarak kalır; K0 çıktısı yürünebilirlik puanı üretmez. |
| **37B — Vekil/önbellek + 3D uzak ufuk kabartması** | **Alparslan** | `server.mjs`, `surface/` (yeni sağlayıcı), `view/3d/renderer.js`, `main.js` | `exportImage` vekil + disk önbelleği (çevrimdışı demo için önceden hazırlanmış paket), 37A ufuk verisinden uzak arazi/tepe silüeti; renk 36A mozaiğinden (etiketli); sis/uzaklık sınırları. | Ağ yokken önbellekten/boş ufukla çalışır; erişilemeyen katman `unavailable`; ufuk "bölgesel bağlam, 463 m/piksel" etiketi taşır, yürünebilirlik puanı üretmez; yerel DTM dikişi görünür/etiketli. |

### FAZ 5 — Veri doğruluğu borçları (P1: FAZ 4 görünür özelliklerinden sonra veya paralel)

| Aşama | Sahip | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|
| **38A — Düşey datum ve bütünlük denetimi** | **Efe** | `scripts/validate-data-integrity.mjs`, `test/data-integrity.test.mjs`, `Sim/stage38-integrity-audit.md` | `config.js` `MAP_FRAME.verticalDatumVerified: true` ↔ `dtm_subset.json` `verticalDatum: null / verticalDatumVerified: false` tutarsızlığının ölçülü kaydı; metin dosyası hash'lerinin LF normalizasyonu sonrası eşleşme tablosu (D3); LFS işaretçisi/gerçek raster ayrımı. | Tutarsızlık bulgu olarak listelenir; Efe `config.js`'e dokunmaz. |
| **38B — Datum bayrağı ve `.gitattributes`** | **Alparslan** | `config.js`, `.gitattributes`, `surface/` | Bayrağı kanıta göre düzelt (kanıt yoksa `false`/`needs_review`); `Sim/data/** -text`. | 38A ile uyumlu; UI datumu yanlış "doğrulanmış" göstermez. |
| **39A — Ortomozaik kayıt teşhisi v2 — TAMAMLANDI** | **Efe** | `scripts/validate-ortho-registration.mjs` (genişletme), `surface/ortho-layer.js`, `test/ortho-layer.test.mjs`, `Sim/stage39-ortho-diagnosis.md` | 21A'daki ~26 m / ~305 m waypoint farkının raster kayması değil katalog farkı (`isRasterShift: false`) olduğu kanıtlandı; high-pass ($r=5$) korelasyon tepe değeri $r=0,3975$ $(+0,5, -0,5)$ px ($\pm 1,5$ m yerel belirsizlik); ortak `JEZ_hirise_soc_006` TRN tabanı ile 0,0 m kenar sapması. | Yalnız ölçülenler yazıldı; 284/284 birim testi geçti. |
| **39B — 21B ortomozaik kaplaması — TAMAMLANDI** | **Alparslan** | `config.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`, `view/hud.js`, `index.html` | `data/ortho/` z17 (`0,318 m/px`) ve z14 (`2,544 m/px`) mozaikleriyle 2D harita, minimap ve 3D WebGL2 arazide UV doku kaplaması (`Hibrit` / `Orto` / `Hillshade` modları, kapsam dışında hillshade korunumu ve `Lisans: kaynakta belirtilmemiş` atfı). | Kapsam dışında kenar uzatma yok; hillshade asla "ortho" adlandırılmaz. |
| **40 — Gerçek PLACES traverse** (eski Aşama 7) | **Alparslan**, Efe ağ erişimiyle destekler | `scripts/`, `geo/traverse.js` | PDS birincil dosyası, frame dönüşümü, Sol 120–164 filtresi, DTM kapsam/no-data kontrolü. | Erişim yoksa park; "gerçek PLACES değil" etiketi sürer; 45–60 dk engel kuralı. |

### FAZ 6 — Tüm Mars kapsamı (P2; FAZ 4–5'in 36–37 işlerine dayanır)

| Aşama | Sahip | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|
| **41A — SIM 3292 jeoloji indeksi** | **Efe** | `scripts/build-sim3292-index.mjs`, `geo/geology-registry.js` (yalnız ek), test | FeatureServer katman 3 (1311 çokgen) bir kez indirilir; Mars küresi derecesine çevrilir; `geology.js` uyumlu indeks; lisans `not_stated`; `unitScheme` farkı beyan. | Nokta başına ağ sorgusu yok; birim kodu çıkarımı uydurulmaz. |
| **41B — Çok haritalı jeoloji UI** | **Alparslan** | `view/hud.js`, `view/minimap/minimap.js`, `main.js` | `sourceMapId`, `mapScale`, `conflict.note`, `fallbackChain` gösterimi; K0/K1'de "yürünebilirlik" dili yok. | 27 raporu öneri 4 karşılanır. |
| **42A — K2 aday saha doğrulaması (Gale, Columbia Hills)** | **Efe** | `scripts/validate-k2-candidate.mjs`, test, `Sim/stage42-k2-audit.md` | Ham kot erişimi, datum, no-data semantiği, yarım piksel hizası, 1 m çözünürlük doğrulaması; geçen/kalan tablo. | Yalnız tüm ölçütleri geçen saha `eva_walkability`. |
| **42B — Saha seçici** (28) | **Alparslan** | `view/minimap/`, `main.js`, `surface/` | Küresel görünümde (36B zemini üstünde) saha seçimi; geçenler EVA, diğerleri bölgesel mod. | `route-service.js` çözünürlük koruması (≤2 m EVA, ≤50 m bölgesel) bypass edilmez. |
| **43A/B — Hiyerarşik planlayıcı ve UI** | **Efe / Alparslan** | `route/hierarchical.js`; `main.js`, `view/minimap/` | K0/K1 koridor daraltma → K2 penceresinde EVA rotası; her sonuç katman/çözünürlük etiketi taşır. | K0/K1 çıktısı "yürünebilirlik puanı" etiketlenmez; 2D/3D fallback bozulmaz. |

### FAZ 7 — Animasyon ve performans (P2; paralel, dosya çakışması yok)

| Aşama | Sahip | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|
| **44A — Rig geçiş yumuşatma (R4)** | **Efe** | `view/3d/astronaut-rig.js`, `test/astronaut-rig.test.mjs` | Saf `blendRigPoses(a, b, t)` ve geçiş ağırlıkları; `stage14-rig-audit.md` ölçümlerine göre önce/sonra poz-fark tablosu; **gerçek ölçekte (35B) adım/kol salınımı yeniden ayarı** — kaynaksız biyomekanik iddiası yok. | Girişler yalnız mevcut hareket API'si alanları; deterministik. |
| **44B — Rig entegrasyonu ve görsel kabul** | **Alparslan** | `view/3d/renderer.js`, `main.js` | 44A'nın bağlanması; tarayıcı gözlemi. | 29A kadraj kabulünü bozmaz. |
| **45A — Arazi LOD/chunk bütçesi** | **Efe** | `view/3d/terrain-lod.js` (yeni, saf), test | Kamera mesafesine göre mesh seyreltme/chunk; no-data quad'ı triangulate edilmez, boşluk üzerinden üçgen yok; bounds/provenance korunur. | Aynı girdi → aynı mesh; üçgen sayısı tasarrufu raporlanır. |
| **45B — LOD entegrasyonu ve cihaz performansı** | **Alparslan** | `view/3d/renderer.js`, `main.js` | LOD bağlanır; 37B ufuk mesh'i ve 32B/33B ile birlikte kare süresi ölçümü. | Ölçülen FPS/cihaz kayda geçer; WebGL2 yoksa 2D fallback. |

### Yürütme sırası ve paralel şeritler

1. **Şerit A (Efe):** 29B → 29C → **35A → 32A → 33A → 34A → 36A → 37A** → 31A → 31C → 38A → 39A → 41A → 42A → 43A → 44A → 45A.
2. **Şerit B (Alparslan):** 29A → **35B → 32B → 33B → 34B → 36B → 37B** → 30 → 31B → 38B → 39B (yalnız kanıtla) → 41B → 42B → 43B → 44B → 45B; 40 ağ erişimine bağlı araya girer.
3. **Neden bu sıra:** 35B dikey ölçeği sabitlediği için görünür özelliklerin (32B, 33B) ayarı nihai ölçekte yapılır. Demo dondurması (30) 35B/32B/33B görsel kabulünden sonra gelir; yetişmezse FAZ 3'teki 30 mevcut kararlı sürümle dondurulur ve FAZ 4 işleri demo sonrasına kalır.
4. **Bağımlılıklar:** 32B ← 32A, 35B; 33B ← 33A, 35B; 34B ← 34A; 36B ← 36A; 37B ← 37A, 36A (renk); 39B ← 39A (kanıt olmadan başlamaz); 41B ← 41A; 42B ← 42A, 36B; 43B ← 43A; 44B ← 44A; 45B ← 45A. Efe'nin teslimi Alparslan'ı bloke etmez: Efe API'yi ve örnek çıktıyı teslim notuna yazar.
5. **Zaman kesme çizgisi:** Etkinlik günü içinde FAZ 3'ün 29A/29C/30'u zorunludur. FAZ 4'te sırayla 35 → 32 → 33 en yüksek görünür değerdir; yetişmeyen aşama yarım bırakılmaz, kapalı bir özellik anahtarıyla gizlenir. FAZ 5–7 etkinlik sonrasıdır.
6. **Değişmez ilkeler:** no-data asla sıfıra çevrilmez ve güvenli sayılmaz; bilinmeyen CRS/datum tahmin edilmez; kaba (>2 m) çözünürlükte yürünebilirlik puanı üretilmez; hillshade ve Viking renk mozaiği "ortogörüntü" değildir; eşikler kaynaksızsa "senaryo parametresi"; rover izi insan rotası değildir; ayak izi görsel efekttir (regolit/soil mekaniği değil); canlı telemetri veya "güvenli rota" iddiası kurulmaz; giysi/insan ölçüsü ve atmosfer sürüklemesi kaynaksız eklenmez.

## ÜRÜN YÖNÜ GÜNCELLEMESİ — Minimap, otomatik rota ve tüm Mars kapsamı (14 Kasım 2026, akşam)

**[KULLANICI/EKİP KARARI]** Proje yalnız geçmişteki Perseverance sürüşünü yeniden oynatan bir simülasyon olmaktan çıkar. Hedef: (1) Google Maps benzeri bir **2D minimap** üzerinde kullanıcı başlangıç ve bitiş noktası seçer; (2) uygulama, yol üzerindeki her konumun **insan yürüyüşüne uygunluğunu puanlayan** (eğim vb.) bir maliyet modeliyle **en mantıklı ve kısa yolu otomatik üretir**; (3) NASA Mars Trek (`trek.nasa.gov/mars`) katmanları ve elimizdeki jeolojik bilgilerle **tüm Mars yüzeyi** algoritmanın kapsamına girer. Bu bölüm, aşağıdaki tüm eski "güncel/sıradaki" ifadelerinin önündedir; eski bölümler tarihsel kayıt ve açık iş listesi olarak kalır.

### Karar değişikliği: "güvenlik skoru yok" kuralı → şeffaf yürünebilirlik puanı

Önceki kural "güvenlik skoru üretme" idi. Yeni karar: **EVA yürünebilirlik puanı** üretilir, ancak şu koşullarla:

- Puan bir **planlama yardımcısıdır**; "güvenli rota" sertifikası veya operasyonel karar değildir. UI metni: "Planlama göstergesi — nihai rota kararı ekip ve görev kontrolündedir."
- Her bileşenin (eğim, pürüzlülük, veri kapsamı, jeoloji) **formülü, girdisi, birimi ve kaynağı** görünür olur; kullanıcı bir hücrenin puanının neden o olduğunu açabilir.
- Eşikler (ör. en yüksek yürünebilir eğim) birincil kaynakla belgelenir. Kaynak bulunana kadar değer **"senaryo parametresi"** etiketiyle UI'da ayarlanabilir kalır; NASA eşiği gibi sunulmaz. Rover hareket limitleri insan için kullanılmaz.
- **Bilinmeyen veri asla güvenli sayılmaz:** no-data, kapsam dışı ve doğrulanmamış katman hücreleri geçilemez ya da "bilinmiyor" olarak işaretlenir; 0'a veya ortalamaya çevrilmez.
- **Çözünürlük dürüstlüğü:** İnsan adımı ölçeğinde yürünebilirlik yalnız ~1 m DTM (HiRISE) bulunan yerlerde hesaplanır. Küresel/bölgesel kaba DEM'lerden (yüzlerce metre/piksel) çıkan eğim yerel eğimi olduğundan düşük gösterir; bu katmanlarda çıktı "bölgesel ön planlama" olarak etiketlenir, yürünebilirlik puanı olarak sunulmaz.

**Belge uyumu:** `AGENTS.md` ve `yapay zeka icin/SYSTEM_PROMPT.md` hâlâ "güvenlik skoru üretme" diyor. Bu karar entegrasyon sahibi (Alparslan) onayıyla o belgelere de işlenmelidir; işlenene kadar ajanlar bu bölümü güncel ürün kararı olarak uygular.

### Mimari: çok çözünürlüklü veri katmanları

| Kat | Kapsam / çözünürlük | Aday kaynak (Mars Trek kataloğunda ve birincil kayıtta doğrulanacak) | Kullanım |
|---|---|---|---|
| **K0 — Küresel** | Tüm Mars, yüzlerce m/piksel | MOLA MEGDR DEM (~463 m/px), HRSC-MOLA birleşik DEM (~200 m/px), küresel jeoloji haritası (Tanaka vd. 2014, USGS SIM 3292, 1:20.000.000), CTX/THEMIS görüntü mozaikleri | Saha seçimi, bölgesel bağlam, kaba erişilebilirlik; **yürünebilirlik puanı değil** |
| **K1 — Bölgesel** | Seçili bölge, ~5–20 m | CTX DEM/ortho (varsa), bölgesel jeoloji haritaları (ör. SIM 3464 Jezero, 1:75.000) | Bölgesel rota ön planı, koridor daraltma |
| **K2 — Yerel (EVA)** | ~1 m ve altı | HiRISE DTM/ortho (Jezero mevcut; diğer sahalar Mars Trek/HiRISE kataloğuna göre) | **Yürünebilirlik puanı ve otomatik EVA rotası** |

- **Koordinat:** Küresel düzlem Mars 2000 küresi (R = 3.396.190 m) üzerinde planetosentrik enlem/boylam; Mars Trek bağlantısındaki `EPSG:104905` (Mars 2000 coğrafi) referansı doğrulanır. Her yerel saha kendi yerel metre düzlemine `geo/` adaptörüyle bağlanır; CRS/datum bilinmeyen katman örneklenmez.
- **Kot verisi:** Rota hesabı için **ham kot (float) rasterı** gerekir; renkli görselleştirme karolarından kot okunmaz. Mars Trek veya USGS Astropedia'nın indirilebilir DEM ürünleri ve erişim yolu (ve CORS) doğrulanır; tarayıcı erişemiyorsa `server.mjs` önbellekli vekil ya da önceden hazırlanmış saha paketleri kullanılır.
- **Atıf/lisans:** Her katman kaynak, ürün kimliği, çözünürlük ve lisans alanını taşır; kaynakta lisans yoksa "belirtilmemiş" yazılır, uydurulmaz.

### Yeni commitlerle gelen güncellemeler (`04f12f4` → `f223414`, HEAD: `codex/mars-solar-lighting`)

**[DOSYA/KAYNAKLA DOĞRULANDI — 14 Kasım 2026, gece]** Son yol haritası commit'inden (`3ba15da`) sonra depoya aşağıdaki kod güncellemeleri eklendi (bu turda yalnızca statik kaynak/diff incelemesi yapıldı; test, smoke veya tarayıcı çalıştırılmadı):

1. **Hareket düzeltmeleri ve arşiv katmanlarının entegrasyonu (`04f12f4` — Alparslan):**
   - **H1 düzeltildi (`sim.js`):** Geçerli daha alçak zemin örneğinde `heightAboveReferenceM > 0` kaldığında `airborne = true` atanarak havada asılı kalma giderildi; yerçekimi düşüşü geçerli zemine inene kadar sürer, no-data üzerinde sahte temas kurulmaz.
   - **H2 düzeltildi (`sim.js`):** `PHASE.PAUSED` iken `stepFirstPerson` ve `resolveSurfaceContact` erken döner; havadayken duraklatmada yatay/düşey momentum sıfırlanmaz.
   - **H4 düzeltildi (`main.js`):** Kamera kafa salınımı (head-bob) eşiği `astronaut-rig.js` ile aynı `0,04 m/s` değerine çekildi.
   - **H5 ve Aşama 19B tamamlandı (`main.js`, `sim.js`, `hud.js`):** Runtime snapshot `toGeologySnapshot` (12 alanlı `GEOLOGY_SNAPSHOT_CONTRACT`), `createGeologicContactField` ve `nearestGeologicContactM` fonksiyonlarını kullanır; HUD kaynak/DOI/lisans (`not_stated`)/belirsizlik (`100–200 m`) ve kontak mesafesini snapshot'tan gösterir.
   - **Aşama 20B tamamlandı (`view/traverse-layer.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `index.html`):** MMGIS arşiv Perseverance sürüş izi (`Sol 116 Site 4 Drive 1250 → Sol 157 Site 6 Drive 0`) ve ara sol dikmeleri (`combineTraverseMarkers`) 2D Canvas, 3D WebGL2 (no-data boşluklarında çizgi kırılarak) ve minimap katmanlarına bağlandı; D1/D2 sol ayrımı ("Sol 120 ve 164 görüntü kayıtlarına aittir") arayüz metnine işlendi.
   - **Aşama 22B tamamlandı (`view/rover-gallery.js`, `main.js`, `view/3d/camera.js`, `index.html`):** WB1 ve Roubion duraklarında yerel arşiv JPEG'lerini gösteren galeri, `observation.credit` ham künyesi (D5), pusula yönü sözcüklerinin gizlenmesi (D4), `SUPERCAM_RMI` yönünün hariç tutulması ve `SITE_FRAME_ASSUMPTION` uyarısıyla "Rover kamerasının tahmini yönüne bak" (`setFirstPersonLook`) özelliği eklendi.
   - **Aşama 21B durumu:** Ortomozaik katmanı etkin DTM ile piksel/yarım-piksel hizası doğrulanana kadar kapalı tutuldu; arayüze açık bilgi notu eklendi.
2. **Birinci şahıs kamera–kask ve rig ankraj hizalaması (`c10e885`, `4bd5967` — Alparslan):**
   - `camera.js` içinde `FIRST_PERSON_EYE_HEIGHT_M` `1,75 m`'den `1,48 m`'ye (rig kask merkezi `Z = 1,48 m` ve `FIRST_PERSON_RIG_ROOT_BELOW_EYE_M = 1,48 m`) çekilerek **H3** gövde–bacak kök farkı kodda kapatıldı.
   - `renderer.js` içinde `FIRST_PERSON_RIG_FORWARD_M = 0,55` ileri ofseti kaldırıldı; first-person rig kökü doğrudan göz ankrajının `[camera.xM, camera.yM]` koordinatına hizalandı.
3. **Aşama 24A — 2D minimap temel arayüzü ve fail-closed seçim koruması (`3167130`, `6497d62` — Alparslan):**
   - `public/js/view/minimap/minimap.js`, `index.html`, `styles.css` ve `main.js` ile sürükle/yakınlaştır minimap kanvası, ölçek çubuğu, kuzey oku, kaynak atfı, jeoloji/arşiv izi katman anahtarları ve başlangıç/bitiş noktası seçimi eklendi.
   - `6497d62` ile `selectionRejection()` eklendi: DTM yüklenmemişse, tıklanan nokta kapsam dışındaysa veya hazırlanan terrain görselinde eflatun taramalı (`no-data`/`invalid`) hücredeyse seçim reddedilir ve uyarı gösterilir.
   - Rota hesabı ve hücre puan açıklaması, Efe'nin **23A/23B** modülleri henüz mevcut olmadığı için açık mesajla bekletilmektedir (**Aşama 24B**'de bağlanacaktır).
4. **Aşama 18B — Mars güneş geometrisi ve arazi/sahne aydınlatması (`f41fbb0`, `f223414` — Alparslan/Efe ortak hat):**
   - `public/js/geo/mars-sun.js` içinde NASA GISS Mars24 algoritmasına (Bölüm D-1 ve D-5/D-6) dayalı küresel güneş yönü (`marsSunDirection({ latitudeDeg, solarLongitudeDeg, trueSolarHour })`) eklendi (`LTST 15.00, Lₛ 0°`).
   - `view/3d/renderer.js` içinde arazi normallerindeki `3×` görsel dikey abartı güneş ışığı hesabından önce geri alındı (`uTerrainExaggeration`), gökyüzü güneş diski ve tüm render geçişlerinde (`daylight = smoothstep(0.0, 0.08, lightDir.z)`) ufuk sönümlemesi eşitlendi.

### Sonraki aşamalar ve güncellenmiş iş bölümü

Dosya sahipliği kuralı korunur: **Efe** saf modüller (`route/`, `geo/`), doğrulama/hazırlama araçları (`scripts/`) ve birim testleri (`test/`); **Alparslan** composition root (`main.js`), `simulation/`, `surface/`, `view/` (HUD, 2D/3D renderer, minimap UI) ve uçtan uca entegrasyon. Her aşama ayrı kısa ömürlü branch ve tek kabul ölçütüyle ilerler.

**FAZ 1 — Jezero'da çalışan minimap + otomatik rota + test/kabul kapanışı (yarışma demosu için öncelikli)**

| Aşama | Sahip | Durum | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|---|
| **23A — Yürünebilirlik maliyet modeli** | **Efe** | **TAMAMLANDI — kodda (`c5c5612`)** | `public/js/route/cost-model.js`, `test/cost-model.test.mjs`, `Sim/stage23a-cost-model-audit.md` | Hücre başına eğim (3×3 Horn), pürüzlülük (DTM'den yerel kot std/TRI), veri durumu ve isteğe bağlı jeoloji bilgisinden `0–100` yürünebilirlik puanı ve geçiş maliyeti. Donmuş parametre seti (`source`/`status: 'scenario'|'sourced'`). Sert kısıt: eşik üstü eğim, `no_data`, `out_of_bounds`, `invalid` = geçilemez (`Infinity`). Hücre puanını şeffaf açıklayan `explainCell(grid, cell, costParams)` çıktısı. | Saf ve deterministik; bilinmeyen veri hiçbir zaman geçilebilir değil; sentetik eğim/no-data ızgaralarında beklenen puanlar; parametre değişince puan monoton değişir. Runtime/UI dosyalarına dokunmaz. |
| **23B — Otomatik rota (A\*) motoru ve Worker** | **Efe** | **TAMAMLANDI — kodda (`e6105b9`, `9a19546`)** | `public/js/route/pathfinder.js`, `public/js/route/pathfinder.worker.js`, `public/js/route/route-service.js`, `test/pathfinder.test.mjs`, `test/route-service.test.mjs`, `Sim/stage23b-pathfinder-audit.md` | 8 komşulu ızgara A\* (`planRoute({ grid, costParams, start, end, budget })`), oktil sezgisel × min birim maliyet (admissible), deterministik eşitlik kırma, düğüm/süre bütçesi, isteğe bağlı maliyet-farkında yol düzleştirme. Çıktı: `{ status, path, stats, segments, reason }` (yerel m ve lon/lat noktaları, uzunluk, toplam/maks eğim, en düşük puan, kot kazanımı/kaybı, segment dökümü, senaryo hızıyla tahmini EVA süresi; yol yoksa açık `no_path` nedeni). Web Worker sarmalayıcısı. | Sentetik testler: engel etrafından dolanma, dik yamaçtan kaçınma, no-data adası, başlangıç/bitiş geçilemez hücrede, bütçe aşımı. Aynı girdi → aynı yol. |
| **23C — Gerçek veriyle rota doğrulama raporu** | **Efe** | **TAMAMLANDI — kodda (`e6105b9`, `9a19546`)** | `scripts/validate-route-planner.mjs`, `Sim/stage23-route-validation.md` | Jezero 1 m DTM penceresinde WB1 → Roubion için planlanan rotayı **düz hat** ve **arşiv Perseverance izi** (20A) ile karşılaştırır: uzunluk, ortalama/maks sapma, eğim/pürüzlülük profilleri, en düşük puan. | Sayısal tablo ve kısa yorum; rover izi insan rotası değildir notu; planlayıcı rover izinden "daha iyi/güvenli" iddiası kurmaz, yalnız ölçüm verir. |
| **23D — Son commitlerin birim test ve regresyon eşlemesi** | **Efe** | **TAMAMLANDI — kodda (`a135d08`, `9da3df4`, `9cd0fd4`, `50507b5`)** | `test/mars-sun.test.mjs`, `test/minimap.test.mjs`, `test/core.test.mjs` | (1) `marsSunDirection` için ekinoks/gündönümü, öğle (`LTST 12`), sabah/akşam ve birim vektör normu (`1 ± 1e-12`) testleri; (2) `test/core.test.mjs` içindeki Stage 12 kamera testinde `c10e885` ile `1,48 m`'ye inen `FIRST_PERSON_EYE_HEIGHT_M` beklentisinin güncellenmesi (**T1**) ve H1/H2/H5 regresyon testleri; (3) `createMinimap` için sahte kanvas üzerinde kapsam dışı/no-data reddi (`selectionRejection`) birim testi. | `public/js/**` uygulama koduna dokunmaz; yalnız `test/` altında deterministik test kapsamını güncel kod sözleşmesiyle eşitler. |
| **24A — 2D minimap temel arayüzü ve seçim koruması** | **Alparslan** | **TAMAMLANDI — kodda (`3167130`, `6497d62`)** | `public/js/view/minimap/minimap.js`, `index.html`, `styles.css`, `main.js` | Sürükle/yakınlaştır minimap, ölçek çubuğu, kuzey oku, atıf, jeoloji ve arşiv izi katman geçişleri, kapsam dışı ve eflatun `no-data` hücre seçimlerini reddeden başlangıç/bitiş seçici. | Kodda mevcut; 24B/25B kapsamında doğrulandı. |
| **24B — Minimap ↔ 23A/23B rota, ısı haritası ve hücre açıklaması entegrasyonu** | **Alparslan** | **TAMAMLANDI — kodda (`19761c7`, `fb0544b`, `474b2bc`)** | `public/js/view/minimap/minimap.js`, `main.js`, `index.html`, `styles.css` | Başlangıç ve bitiş seçildiğinde `pathfinder.worker.js` üzerinden otomatik rotayı hesaplayıp minimap'te çizme; seçilebilir eğim/yürünebilirlik puanı ısı haritası katmanı; rota özet paneli (uzunluk, tahmini süre, kot kazanımı/kaybı, en zor segment); haritada tıklanan hücre için `explainCell()` açıklama kartı. | Rota hesaplanırken UI donmaz; istek yarışmaları (`endpointRevision`) korunur; `no_path` nedeni açıkça gösterilir; puanlar "Planlama göstergesi — güvenli rota sertifikası değildir" etiketi taşır; 2D/3D fallback bozulmaz. |
| **25 — Planlanan rota ↔ 2D/3D sahne ve first-person HUD bağlantısı** | **Alparslan** | **TAMAMLANDI — kodda (`49ac54d`, `246a99d`)** | `main.js`, `view/hud.js`, `view/render.js`, `view/route-guidance.js`, `view/3d/renderer.js`, `test/route-guidance.test.mjs` | Minimap'te üretilen rotanın 2D ana haritada camgöbeği kesikli çift katmanlı iz + `S`/`G` işaretçileri (`drawPlannedRoute`) ve 3D sahnede sıklaştırılmış (≤4 m) paralel şeritli zemin kılavuz çizgisi olarak çizilmesi (no-data boşluklarında köprü kurmadan); HUD'da sıradaki rota noktasına yön/mesafe, mevcut hücrenin yürünebilirlik puanı ve eğim uyarısı. Sabit WB1→Roubion senaryosu "örnek görev" olarak korunur. | Rota değişince 2D/3D kılavuz güncellenir; puan HUD'da "planlama göstergesi" etiketiyle görünür; no-data üzerinde sahte zemin teması yok. |
| **25B — Birleşik görsel kabul ve smoke betiği senkronizasyonu** | **Alparslan** | **TAMAMLANDI — kodda (`3c9a8af`, `0769aa4`, `d7da12c`, `e8bb605`, `4b1ded5`)** | `scripts/smoke-e2e.mjs`, `Sim/stage25b-visual-acceptance.md`, `simulation/sim.js`, `view/3d/renderer.js` | (1) Stage 15–18 (1,48 m göz/kask hizası, alt-kadraj view-model framing, yakın beacon gizleme, Mars güneş aydınlatması) + 19B/20B/22B/24A/24B/25 kabul kaydı (`Sim/stage25b-visual-acceptance.md`); (2) `scripts/smoke-e2e.mjs` içindeki `5b` feragat kontrolünün arşiv/minimap feragat cümleleriyle (**T2**) uyumlu hale getirilmesi ve paused ilk temas ankrajının (`0769aa4`) düzeltilmesi. | `Sim/stage25b-visual-acceptance.md` içinde tamamlanan ve kısmi kalan görsel maddeler açıkça kayıtlıdır. |

**FAZ 2 — Ortomozaik kayıt kanıtı (21B) ve tüm Mars kapsamı (Mars Trek entegrasyonu; FAZ 1 tamamlandıktan sonra)**

| Aşama | Sahip | Durum | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|---|
| **21B-Ön — Ortomozaik ↔ DTM piksel kayıt doğrulaması** | **Efe** | **TAMAMLANDI — kanıt olumsuz (`67f89f9`)** | `scripts/validate-ortho-registration.mjs`, `test/ortho-mosaic.test.mjs`, `Sim/stage21b-registration-audit.md` | 21A'da birleştirilen z17/z14 Mars Trek HiRISE ortomozaik karoları ile etkin DTM penceresi arasındaki piksel/yarım-piksel hizasını sayısal kontrol noktaları/gradyan korelasyonu ile test etti (`Sim/stage21b-registration-audit.md`); hizalama kanıtlanamadığı (`not proven`) için 21B doku kaplaması kapalı tutuldu. | Sayısal kayıt kanıtı olmadan "hizalı ortho" bayrağı açılmaz; kapsam dışı alan şeffaf kalır. |
| **21B — 2D/3D/Minimap ortomozaik doku kaplaması** | **Alparslan** | **BLOKELİ / BEKLEMEDE (21B-Ön `67f89f9` sonucunda hizalama kanıtlanmadı)** | `config.js`, `surface/`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`, `view/hud.js` | Kayıt kanıtı geçen 25 cm HiRISE ortomozaik dokusunu 2D Canvas, minimap ve 3D WebGL2 arazi mesh'ine UV olarak giydirir; hillshade ↔ ortomozaik geçişi ve açık katman/lisans (`belirtilmemiş`) atfı ekler. | 21B-Ön denetiminde (`67f89f9`) piksel kaydı kanıtlanamadığı için fail-closed kuralı gereği etkinleştirilmez; hillshade hiçbir zaman ortogörüntü diye adlandırılmaz. |
| **26A — Mars Trek katman kataloğu ve karo matematiği** | **Efe** | **TAMAMLANDI — kodda (`5c4100d`)** | `public/js/geo/trek-tiles.js`, `scripts/trek-catalog.mjs`, `test/trek-tiles.test.mjs`, `Sim/stage26a-trek-catalog-audit.md` | Mars Trek WMTS `GetCapabilities` belgelerinden katman kataloğu (ad, ürün kimliği, CRS, TileMatrixSet, çözünürlük, kapsam, atıf/lisans alanları); küresel lon/lat ↔ karo dönüşümü; zoom seçimi. Katman adları belgeden okunur, uydurulmaz. | Katalog gerçek capabilities belgelerinden üretilir; karo sınırları belgeyle 1e-9° içinde; bilinmeyen CRS'li katman `needs_review`. |
| **26B — Karo/DEM istemcisi ve önbellek** | **Alparslan** | **BEKLEMEDE (FAZ 2)** | `surface/` (yeni sağlayıcı), `server.mjs` (vekil/önbellek), `main.js` | Minimap için görüntü karoları; rota için ham DEM erişimi (indirilebilir ürün veya hazırlanmış saha paketi). CORS ve erişim doğrulaması; çevrimdışı demo önbelleği. | Ağ yokken önbellekten çalışır; erişilemeyen katman `unavailable` görünür; atıf her katmanda gösterilir. |
| **27 — Küresel jeoloji ve çok çözünürlüklü planlama** | **Efe** (saf), **Alparslan** (UI) | **TAMAMLANDI — kodda (`ce65452`, `9a19546`, `246a99d`)** | `public/js/geo/geology-registry.js`, `public/js/route/route-service.js`, `test/geology-registry.test.mjs`, `Sim/stage27-multires-audit.md`, `main.js`, `view/hud.js` | Efe `createGeologyRegistry` / `lookupBestGeologicUnit` (`ce65452`) ve çözünürlük korumalı `route-service.js` (`9a19546`) modüllerini sağladı; Alparslan `main.js` (`resolveGeologicContext`) ve `hud.js` içinde çok-çözünürlüklü jeoloji kayıt defterini (`usgs_sim3464_2020`, `1:75,000`), `sourceMapId`, `mapScale`, `fallbackChain` ve `conflict` bilgilerini 12 alanlı `GEOLOGY_SNAPSHOT_CONTRACT` sözleşmesini koruyarak bağladı (`246a99d`). | Her sonuç hangi katmandan ve hangi çözünürlükten geldiğini taşır; K0/K1 çıktısı yürünebilirlik puanı olarak etiketlenmez. |
| **28 — Saha seçici ve yeni sahalar** | **Alparslan** | **BEKLEMEDE (FAZ 2)** | UI/entegrasyon | Minimap'te küresel görünümden saha seçimi; 1 m DTM bulunan sahalar (Jezero ve doğrulanacak diğerleri, ör. Gale) için yerel paket hazırlama akışı. | Yalnız DTM'i, datumu ve kapsamı doğrulanmış sahalar EVA rotasına açılır; diğerleri "bölgesel ön planlama" modunda kalır. |

### Güncel öncelik ve yürütme sırası (14 Kasım 2026, gece)

1. **Paralel Şerit A (Efe — Saf Rota Motoru ve Testler):**
   - **Adım 1:** **23A** (`public/js/route/cost-model.js`, `test/cost-model.test.mjs`) — `evaluateCellCost(grid, cell, costParams)` ve `explainCell(grid, cell, costParams)`.
   - **Adım 2:** **23B** (`public/js/route/pathfinder.js`, `public/js/route/pathfinder.worker.js`, `test/pathfinder.test.mjs`) — `planRoute({ grid, costParams, start, end, budget }) → { status, path, stats, segments, reason }`.
   - **Adım 3:** **23C** (`scripts/validate-route-planner.mjs`, `Sim/stage23-route-validation.md`) ve **23D** (`test/mars-sun.test.mjs`, `test/minimap.test.mjs`, `test/core.test.mjs` içinde T1/H1/H2/H5 test eşlemesi).
2. **Paralel Şerit B (Alparslan — Görsel Kabul, Smoke Eşlemesi ve UI Entegrasyonu):**
   - **Adım 1 (hemen, Efe 23A/B'yi yazarken):** **25B** — `c10e885`/`4bd5967`/`f223414` sonrası 3D kamera/rig/güneş aydınlatması ile 19B/20B/22B/24A'nın tarayıcı görsel kontrolü ve `scripts/smoke-e2e.mjs` metin/etiket senkronizasyonu (**T2**).
   - **Adım 2 (Efe 23A ve 23B'yi teslim edince):** **24B** — `minimap.js` ve `main.js` içinde başlangıç/bitiş noktalarını Worker'a bağlayıp planlanan rotayı, ısı haritasını, rota özet panelini ve `explainCell()` hücre açıklamasını gösterme.
   - **Adım 3 (24B sonrası):** **25** — Planlanan rotayı 3D arazi kılavuzuna ve first-person HUD göstergelerine bağlama.
3. **FAZ 2 (Demo çekirdeği tamamlandıktan sonra):** **21B-Ön → 21B** ortomozaik kaplaması ve zaman kalırsa **26A → 26B → 27 → 28** tüm Mars kapsamı.

### Açık araştırma maddeleri

- **Yürünebilir eğim eşiği ve eğim–hız ilişkisi:** NASA EVA/uzay giysisi literatüründen birincil kaynak (ör. Apollo yürüyüş deneyimleri, NASA insan sistemleri standartları). Bulunana kadar senaryo parametresi.
- **Pürüzlülük ölçüsü:** 1 m DTM'den TRI/kot std; kaya tespiti iddiası kurulmaz (1 m DTM tek tek kayaları çözmez). HiRISE kaya yoğunluğu ürünleri varsa ayrı katman olarak değerlendirilir.
- **Mars Trek erişimi:** Hangi katmanların ham DEM indirmesi sunduğu, kullanım/lisans koşulları, CORS ve hız sınırları.
- **Jeolojinin maliyete etkisi:** Birim bazlı yürünebilirlik etkisi için kaynak yoksa jeoloji yalnız bilgi katmanı olur, maliyete katılmaz.

## Önceki yürütme kararı — 14 Kasım 2026 (tarihsel; yukarıdaki ürün yönü önceliklidir)

**Repo kaydı ve kaynakla doğrulandı (14 Kasım 2026, gece):** HEAD `f223414` (`codex/mars-solar-lighting`), origin ile eşit. Stage 16 rig güncellemesi `8e7173c`; Stage 17 alt beden first-person renderer entegrasyonu `94f7bac`; 19B/20B/22B ve H1/H2/H4/H5 düzeltmeleri `04f12f4`; kamera–kask (`1,48 m`) ve rig göz ankrajı hizalamaları `c10e885` ve `4bd5967`; Stage 24A minimap arayüzü ve seçim koruması `3167130` ve `6497d62`; Stage 18B Mars güneş geometrisi ve arazi/sahne aydınlatması `f41fbb0` ve `f223414` içinde mevcut. Bu turdaki bağımsız kontrol salt statikti: test, smoke ve tarayıcı çalıştırılmadı, görsel kabul açık. USGS DTM adayı ürün özelinde düşey datum kanıtı olmadığı için `needs_review` kalır; legacy HiRISE fallback korunur.

**Alparslan — sıradaki görev:** (1) Stage 15–18 (`c10e885`, `4bd5967`, `f223414`) kamera, rig, alt beden görünürlüğü ve Mars güneş aydınlatması ile 19B/20B/22B/24A için görsel kabul ve `smoke-e2e.mjs` senkronizasyonu (**25B**); (2) Efe'nin **23A/23B** modülleri teslim edildiğinde minimap rota/ısı haritası/`explainCell()` bağlantısı (**24B**) ve ardından 3D/HUD bağlantısı (**25**).

**Efe — Stage 16 ve 19A–22A teslimleri; sıradaki 23A–23D görevleri:** Stage 16 `8e7173c`, Stage 19A–22A hazırlık paketleri (`c5d0e51`, `48e330b`, `d1abe35`, `4d6bd10`) kodda mevcut. Alparslan `04f12f4` ile 19B, 20B ve 22B'yi bağladı; 21B ortomozaik kaplaması hizalama kanıtı olmadığı için kapalı tutuldu. Efe'nin sıradaki bağımsız görevleri **23A** (`cost-model.js`), **23B** (`pathfinder.js` + `pathfinder.worker.js`), **23C** (`validate-route-planner.mjs`) ve **23D** (yeni commitler için birim test/regresyon eşlemesi) paketleridir.

**Alparslan'ın son paylaşımları (14 Kasım 2026):** `origin/codex/stage24-minimap`, `origin/codex/stage24-minimap-selection`, `origin/codex/camera-eye-xy-alignment` ve Mars güneş geometrisi commitleri zaten bu dalın geçmişindeydi. Yeni `codex/camera-eye-test-expectations` (`a135d08`) kamera testi beklentisini 1,48 m'ye eşitledi; `codex/first-person-viewmodel-pose` (`3ff4976`) first-person torso/kol view-model pozuna rig hareketi ekledi, alt beden/world rig pozunu değiştirmedi. Bu iki kaynak commiti içeri alındı. Remote'daki `6c54f0e`/`25063e7` yol haritası kopyaları 23A/B/C'yi hâlâ açık gösterdiği için mevcut, daha güncel yol haritasının yerine alınmadı; burada yalnız güncel durum kaydedildi. Bu turda test, smoke veya tarayıcı çalıştırılmadı.

**Doğrulama ayrımı:** Bu turda Git kaydı, README, ilgili kaynaklar ve audit statik olarak incelendi. Yeni commitler (`04f12f4..f223414`) için bu bağımsız incelemede test, smoke, uygulama veya tarayıcı çalıştırılmadı. Son runtime/görsel kabul sahibi Alparslan'dır; kullanıcı test yasağı sürdüğü için yeni test çalıştırılmaz.

**Teslim ve paylaşım:** Alparslan ve Efe kendi görevleri bittiğinde yalnız ilgili teslim dosyasını `git status` ve staged diff ile denetleyip kısa ömürlü kendi dallarında açıklayıcı commit atar ve remote'a push eder. Kullanıcıya commit hash'i, push sonucu ve çalıştırılmamış testleri açıkça bildirirler; push hatasında yerel commit'i paylaşılmış gibi sunmazlar. Mevcut kullanıcı belge, ekran görüntüsü, TIFF ve `.crdownload` değişiklikleri görev commit'lerine eklenmez.

## Sonraki 3D kalite aşamaları — 14 Kasım 2026

**[KULLANICI BİLDİRDİ]** Elle denemede kamera karakterin arkasında/uygunsuz konumda, kollar fazla hızlı, karakter ölçeği yapay, bacaklar görünmüyor ve yükselti-alçalma yeterince belirgin değil. Bunlar kullanıcı gözlemidir; bağımsız görsel kabul sonucu değildir. `c4fb930` kamera/ofset ölçeğini güncelledi; `8e7173c` rig stride'ını ve alt beden metadata'sını iyileştirdi; `94f7bac` alt beden görünürlüğünü renderer'a bağladı; `c10e885` göz yüksekliğini `1,48 m` kask merkezine çekti; `4bd5967` `0,55 m` ileri rig ofsetini kaldırdı; `b385af2`, `f41fbb0` ve `f223414` arazi rölyefini ve Mars güneş geometrisini (`mars-sun.js`, `uTerrainExaggeration`) uyguladı. Kod değişiklikleri tek başına görsel kabul kanıtı değildir. Arazi `verticalScale: 3` sunum parametresi olarak kalır. Tarayıcı kabulinde kamera, gait, kadraj ve rölyef incelenmelidir.

1. **Aşama 15 — göz hizası ve ölçek sözleşmesi (Alparslan) — KODDA TAMAMLANDI (`c4fb930`, `c10e885`, `4bd5967`), GÖRSEL KABUL AÇIK.** Göz yüksekliği `1,48 m` kask merkeziyle eşlendi ve ileri rig ofseti kaldırıldı. Stage 15–18 birleşik görsel kabulinde başlangıç/yürüyüş/zıplama/iniş göz hizası, yüzey clipping'i ve 2D fallback incelenir. Kaynak kot `zM` ve yüzey teması değişmez.
2. **Aşama 16 — EVA pozları ve alt beden rig verisi (Efe) — KOD/TEST DOSYALARI MEVCUT (`8e7173c`), GÖRSEL KABUL AÇIK.** `astronaut-rig.js` ve birim testleri güncellendi; kol salınımı yavaşlatıldı, iniş-yürüyüş geçişleri hizalandı ve bacak/bot parça verisi eklendi. Görsel stride tasarım parametresidir, suit biyomekaniği değildir.
3. **Aşama 17 — alt bedenin first-person entegrasyonu (Alparslan) — KODDA TAMAMLANDI (`94f7bac`, `c10e885`, `4bd5967`), GÖRSEL KABUL AÇIK.** `renderer.js`, `camera.js`, `main.js` Stage 16 rig sözleşmesini bağlar; aşağı bakışta bacak/bot görünürlüğü, `1,48 m` kök eşlemesi ve `gaitDistanceM` snapshot/kamera fazı kodda vardır. Kabul: kollar/bacaklar doğru kadrajda, zemin içine girme/görüşü kapatma/sahte no-data teması yok; 2D/WebGL2 fallback korunur.
4. **Aşama 18 / 18B — arazi rölyefi ve Mars güneş geometrisi (Alparslan) — KODDA TAMAMLANDI (`b385af2`, `f41fbb0`, `f223414`), GÖRSEL KABUL AÇIK.** `geo/mars-sun.js` (NASA GISS Mars24 D-1 ve D-5/D-6 küresel güneş yönü, `LTST 15.00, Lₛ 0°`) ve `renderer.js` içinde görsel dikey abartıyı (`uTerrainExaggeration = 3`) geri alan arazi normal aydınlatması ile ufuk `daylight` sönümlemesi uygulandı. `sourceElevationsM`/`zM` değişmez, no-data boşlukları korunur ve arayüz görsel dikey abartı ile güneş senaryosu değerlerini açıkça belirtir.

**Açık teknik/görsel riskler (14 Kasım 2026, Stage 17 kodu sonrası):** Kod incelemesi ile tarayıcıda gözlenmesi gerekenler ayrıdır.

- **R1 — Kamera/rig adım uyumu (görsel kabul açık).** `main.js` kamera fazı artık `gaitDistanceM` varsa onu, yoksa rig'in `presentationStrideLengthM` değerini kullanır; `sim.js` snapshot'a `gaitDistanceM` koyar. Kod sözleşmesi mevcut, faz uyumu gerçek tarayıcıda henüz gözlenmedi.
- **R2 — Ayak kayması ve görüş kadrajı riski (görsel kabul gerekli).** Görsel stride 6 m'dir; bu tasarım parametresidir, gerçek biyomekanik ölçüm değildir. Yürüyüş/dönüşte ayak kayması, alt gövdenin kadrajı kapatması veya zemine girmesi gerçek zamanlı gözlenmeli.
- **R4 — Durumsuz animasyon geçişleri.** Rig stateless olduğundan stop/descent/walk-airborne geçişlerinde ölçülen poz farkları kalır; sayısal ölçümler `Sim/stage14-rig-audit.md` içindedir. İyileştirme ayrı kabul ölçütüyle planlanır.
- **R5 — Stage 17 alt beden entegrasyonu mevcut, görsel kabul açık.** Renderer aşağı bakışa bağlı bacak/bot çizimini ve pitch görünürlüğünü uygular; kadraj/örtüşme eşikleri tarayıcıda doğrulanmadı.
- **R6 — Görsel kabul bekliyor.** Stage 13/16/17 rig-kamera birleşimi için bu turda browser QA yoktur; kaynak kod incelemesi görsel kabul yerine geçmez.

**Aşama numarası notu:** Buradaki Stage 17, 3D alt beden entegrasyon aşamasıdır; tarihsel `codex/stage17-usgs-validation` dalındaki raster validator işiyle aynı görev değildir.

## İndirilen NASA/USGS Veri Kümeleri İçin Yeni Aşamalar ve İş Bölümü (Aşama 19–22) — 14 Kasım 2026

**Veri Hazırlık Kaydı (`805f739` — `alparslan/stage14-kinematics-visuals-integration`):** NASA Mars Trek WMTS/MMGIS, USGS Astrogeology (`SIM 3464`) ve NASA Mars 2020 Perseverance Raw Images kaynakları ile ilişkilendirilmiş veri paketleri (`Sim/data/mars-trek/`, `Sim/data/usgs-sim3464-geology/`, `Sim/data/perseverance-raw/`) depoya eklendi. Mars Trek manifesti 91 karo için bütünlük kontrolü bildiriyor; Perseverance paketi 12 fotoğraf kaydı, USGS paketi resmi SIM 3464 metaveri/atıf içeriyor. Bu turda hash'ler ve koordinat/telemetri dönüşümleri bağımsız yeniden hesaplanmadı; verilerin uygulamaya entegrasyonu ve ürün kabulü tamamlanmış sayılmaz. İşler, Aşama 15–18 kamera/rig/rölyef dosyalarıyla çakışmayacak şekilde Efe (saf veri/geometri/sorgu modülleri ve birim testleri) ile Alparslan (composition root, snapshot, HUD ve 2D/3D renderer entegrasyonu) arasında bölünmüştür:

| Aşama | Veri Kaynağı (`Sim/data/`) | Efe'nin Bağımsız Paketi (Saf Modül / Hazırlama / Test) | Alparslan'ın Entegrasyon Paketi (Runtime / Snapshot / HUD / Render) |
|---|---|---|---|
| **Aşama 19: Canlı USGS SIM 3464 Jeolojik Birim Motoru ve Harita Katmanı** | `Sim/data/usgs-sim3464-geology/jezero_geounits_corridor.geojson` (`Njf`, `Nle`, `NHjf2`) + `manifest.json` | **19A (Efe):** `Sim/public/js/geo/geology.js` ve `Sim/test/geology.test.mjs`. Koridor GeoJSON poligonlarından yerel `(x, y)` / `(lon, lat)` Point-in-Polygon birim sorgusu (`lookupGeologicUnit`), birim sınır çizgileri ve resmi USGS `SIM 3464` (Sun & Stack, 2020) metadata/atıf dondurucusu. Runtime/UI dosyalarına dokunmaz. | **19B (Alparslan):** `config.js`, `main.js`, `simulation/sim.js`, `view/hud.js`, `view/render.js`, `view/3d/renderer.js`. `WorldSnapshot` içine aktif jeolojik birimi (`Njf` Jezero floor vs. `Nle` Séítah) bağlar; HUD'da canlı jeoloji kartı ve 2D/3D görünümde yarı saydam jeolojik sınır katmanı sunar. |
| **Aşama 20: Arşiv Perseverance Sürüş İzi ve 16 Ara Sol Durağı (Sol 120–164)** | `Sim/data/mars-trek/M20_traverse.json` & `M20_waypoints.json` | **20A (Efe):** `Sim/public/js/geo/traverse.js`, `Sim/public/js/view/3d/marker-mesh.js` (ara sol dikmeleri genişletmesi) ve `Sim/test/traverse.test.mjs`. Sol 120–164 (`Site 4 Drive 1250` $\to$ `Site 6 Drive 0`, Sol 122..157 ara durakları) alt kümesini yerel metre düzlemine dönüştürür; kuş uçuşu hat ile gerçek arşiv sürüş izinin sapma/uzunluk farkını ve 3D ara sol mikro-işaretçi geometrisini üretir. | **20B (Alparslan):** `config.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/hud.js`. Basitleştirilmiş düz koridoru koruyarak yanına seçilebilir "Arşiv Perseverance Sürüş İzi (MMGIS)" katmanını ve 3D ara sol işaretçilerini bağlar; Sol 157 varışı ve Sol 157–164 Roubion operasyon bilgisini HUD'da gösterir. |
| **Aşama 21: 25 cm HiRISE Ortomozaik WMTS Karo Birleştirme ve 2D/3D Doku Kaplaması** | `Sim/data/mars-trek/ortho-tiles/` (91 PNG karo, Zoom 13–17) & `hirise_ortho_25cm_fgdc.html` | **21A (Efe):** `Sim/scripts/build-ortho-mosaic.mjs` ve `Sim/test/ortho-mosaic.test.mjs`. Zoom 16/17 PNG karolarının WMTS `TileMatrix` sınırlarını `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` referansıyla doğrulayıp çalışma penceresi (`1328×1234 m`) için UV/piksel hizalama manifestini ve birleşik doku çıktısını üretir. | **21B (Alparslan):** `config.js`, `surface/`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/hud.js`. Eksik JP2 yerine doğrulanmış 25 cm ortomozaik dokusunu 2D Canvas ve 3D WebGL2 arazi mesh'ine UV olarak giydirir; "DTM Hipsometrik Kabartma" $\leftrightarrow$ "25 cm HiRISE Ortomozaik" geçişi ve açık katman atıfı ekler. |
| **Aşama 22: Sol 120 / Sol 164 Yer Seviyesi Perseverance Saha Fotoğrafları ve Kamera Hizalama** | `Sim/data/perseverance-raw/manifest.json` + `sol120/` (6 JPG) + `sol164/` (6 JPG) | **22A (Efe):** `Sim/public/js/geo/rover-observations.js` ve `Sim/test/rover-observations.test.mjs`. 12 gerçek rover fotoğrafının (`Navcam`, `Mastcam-Z`, `Hazcam`, `SuperCam RMI`, `CacheCam`) `attitude`, `mastAz` ve `mastEl` telemetrisini 3D birinci şahıs kamera açılarına (`yawRad`, `pitchRad`) dönüştüren saf fonksiyonları ve durak yakınlık eşleşmesini yazar. | **22B (Alparslan):** `main.js`, `view/3d/camera.js`, `view/hud.js`, `styles.css`. Sol 120 ve Sol 164 duraklarında gerçek Perseverance saha fotoğraflarını (NASA/JPL-Caltech/ASU/MSSS künyesi ve LMST saatiyle) açan HUD inceleme panelini ve 3D kamerayı fotoğrafın çekildiği azimut/eğime döndüren "Rover Kamerası Yönüne Bak" özelliğini bağlar. |

**Yürütme kapısı ve sırası:** (1) Alparslan Stage 15–17 görsel kabulini yapar; kabul ölçütü first-person kamera/kol/bacak kadrajının yürüyüş, bakış aşağı, zıplama/iniş ve bilinmeyen temas durumlarında doğru görünmesi, 2D fallback'in çalışmasıdır. (2) Kabulden sonra Alparslan Stage 18 rölyef okunabilirliği görevini yürütür. (3) Efe 19A audit kararlarını ve caveat sözleşmesini netleştirir; Alparslan ancak bundan sonra 19B'yi uygular. (4) Aşama 20, 21, 22 ayrı ayrı A hazırlığı → ilgili B entegrasyonu sırasıyla ilerler; veri/frame kanıtı olmayan aşama bekler. Her iş ayrı kısa ömürlü branch, tek kabul ölçütü ve ayrı commit'tir. Kullanıcı test yasağı geçerlidir; uygulama kodu/veri/test değişikliği veya test çalıştırma bu yol haritası görevi kapsamında değildir.

## Efe A paketleri teslim durumu ve açık kararlar — 14 Kasım 2026

**Durum:** 19A sözleşmesi, 20A, 21A ve 22A hazırlık paketleri kodda mevcut. Bağımsız kontrolde `node --test test/` **112/112** geçti (kullanıcının açık hata kontrol isteğiyle çalıştırıldı); smoke, tarayıcı ve görsel kabul çalıştırılmadı. Ayrıntılar ve ölçümler her paketin kendi raporundadır: `Sim/stage19a-geology-audit.md`, `Sim/stage20a-traverse-audit.md`, `Sim/stage21a-ortho-audit.md`, `Sim/stage22a-rover-observations-audit.md`. Commit/push durumu ilgili teslim kaydında ayrıca belirtilir.

| Paket | Dosyalar | Sonuç | B entegrasyonu durumu |
|---|---|---|---|
| **19A — jeoloji sözleşmesi** | `geo/geology.js`, `test/geology.test.mjs` | `GEOLOGY_SNAPSHOT_CONTRACT` (`marswalk.geology-snapshot.v1`, alan adı `geology`), `toGeologySnapshot`, `createGeologicContactField`/`nearestGeologicContactM`. Koridorda 3 birim (Njf, Nle, NHjf2); WB1 ve Roubion **Njf**. En yakın kontak WB1 12,2 m, Roubion 22,8 m. Konum belirsizliği **100–200 m** (SIM 3464 `horizpar`); lisans `not_stated` (`accconst: None`). | **19B kodda tamamlandı (`04f12f4`):** `main.js` ve `sim.js` 12 alanlı `toGeologySnapshot` sözleşmesini, `createGeologicContactField` ve `nearestGeologicContactM` fonksiyonlarını kullanır; 2D/3D/minimap sınır çizgileri (no-data kırılmalı) ve HUD belirsizlik/lisans/caveat bilgileri bağlıdır. |
| **20A — arşiv sürüş izi** | `geo/traverse.js`, `test/traverse.test.mjs`, `view/3d/marker-mesh.js` (yalnız ek `buildIntermediateSolMarkers`; eski çıktılar bayt bayt aynı) | Sol 122–157 arası 16 sürüş segmenti, kesintisiz `4_1250 → 6_0`. İz 885,5 m (küre), düz hat 687,3 m: **+209 m**, en fazla 106 m sapma, izin yalnız %12'si 10 m senaryo koridorunda. FGDC kredi/lisans alanları boş (`credit: null`). | **20B kodda tamamlandı (`04f12f4`, `3167130`):** `view/traverse-layer.js` ile düz koridor korunarak arşiv MMGIS izi ve 3D ara sol dikmeleri 2D, 3D ve minimap'e eklendi; D1/D2 sol ayrımı (`Sol 116 → Sol 157` sürüş, `Sol 120/164` fotoğraf) ve feragat metni eklendi. |
| **21A — ortomozaik** | `scripts/build-ortho-mosaic.mjs`, `test/ortho-mosaic.test.mjs` | 91 karo, 256×256 gri+alfa PNG; yol `{z}/{row}/{col}`. z17 = **0,318 m/px** (D-B 0,302); "25 cm" ürün adıdır, sunulan en ince seviye daha kabadır. XML `ScaleDenominator` Dünya yarıçapına göre, kullanılmadı. Koridor z17'de eksiksiz (54 karo); rota kutusu z17'de 6 karo eksik, z14'te tam. Mozaik DTM mesh penceresinin ~%11,5'ini kaplar. Karo başına hash manifestte yok, araç kendisi hesaplar. Lisans `NOT_STATED_IN_PROVIDED_FGDC`. "1328×1234 m" pencere değeri hiçbir veriden üretilemedi. | **21B beklemede:** Hizalama yalnız karo aritmetiğinden türetildi; etkin DTM ile piksel/yarım-piksel kayıt doğrulanmadan doku kaplaması açılmaz (`index.html`'de açık durum notu mevcut). |
| **22A — rover gözlem açıları** | `geo/rover-observations.js`, `test/rover-observations.test.mjs` | `mastAz/mastEl` rover çerçevesinde (Navcam/Mastcam-Z için CAHV ekseniyle 1,5° içinde). `attitude` kuaterniyonu (w,x,y,z, rover→site) arşiv roll/pitch/yaw değerlerini 0,5° altında üretir; rover yönü Sol 120 ≈220°, Sol 164 ≈141°. Kamera yaw/pitch dönüşümü `camera.js` ile altı yönde sayısal doğrulandı. Hazcam/CacheCam için yön üretilmez; SuperCam RMI çerçevesi çözülemedi. | **22B kodda tamamlandı (`04f12f4`):** `view/rover-gallery.js` ile WB1/Roubion duraklarında fotoğraf galerisi, ham `observation.credit` künyesi, `SUPERCAM_RMI` hariç tutulması ve `SITE_FRAME_ASSUMPTION` uyarılı kamera yönlendirme butonu bağlandı. |

**Alparslan kararı bekleyen / uygulanan veri bulguları:**

- **D1 — Kanonik waypoint kaynağı (uygulandı: PDS korundu).** `config.js` WAYPOINTS (PDS Initial Reports) arşiv MMGIS iziyle **0,09 m** içinde örtüşür. `Sim/data/mars-trek/manifest.json` içindeki sapmalı `key_waypoints` runtime'da kullanılmadı.
- **D2 — Sol etiketleri (uygulandı, `04f12f4`).** Arayüzde sürüş arşivinin **Sol 116 (Site 4 Drive 1250) → Sol 157 (Site 6 Drive 0)** olduğu, Sol 120 ve 164'ün bu duraklardaki görüntü kayıtlarına ait olduğu açıkça yazıldı.
- **D3 — Satır sonu ve hash doğrulama.** Metin veri dosyalarının (GeoJSON, XML, FGDC, metadata) ham hash/boyutu manifestlerle uyuşmaz; CRLF→LF normalizasyonundan sonra birebir eşleşir. Öneri: `.gitattributes` içine `Sim/data/** -text` eklenmesi; kural uygulanana kadar hash doğrulayıcı metin dosyalarını normalize etmeli, ikili dosyalarda ham bayt kullanmalı.
- **D4 — Fotoğraf manifestindeki yön sözcükleri hatalı (uygulandı, `04f12f4`).** `rover-gallery.js` manifestteki hatalı pusula sözcüklerini HUD'da göstermiyor.
- **D5 — Künye (uygulandı, `04f12f4`).** `rover-gallery.js` künyeyi doğrudan kayıttaki `observation.credit` metninden alıyor.
- **D6 — Lisans alanları boş (uygulandı, `04f12f4`).** UI'da "Lisans kaynakta belirtilmemiş" ifadesi gösteriliyor; yalnız DTM ürünü CC0 olarak etiketli.

**Önceki teknik hataların kapanış durumu ve yeni statik test bulguları (14 Kasım 2026, gece):**

- **H1 — Yüksek: havada asılı kalma — KODDA DÜZELTİLDİ (`04f12f4`).** `sim.js` `resolveSurfaceContact` içinde daha alçak geçerli zeminde `heightAboveReferenceM > 0` kaldığında `this.airborne = true` atanarak balistik düşüş başlatılıyor; no-data üzerinde sahte temas kurulmuyor. (**23D**'de birim testi eklenecek.)
- **H2 — Orta: duraklatmada momentum kaybı — KODDA DÜZELTİLDİ (`04f12f4`).** `sim.js` `stepFirstPerson` ve `resolveSurfaceContact` `PHASE.PAUSED` durumunda erken dönüyor; hız ve zaman korunuyor. (**23D**'de birim testi eklenecek.)
- **H3 — Düşük: gövde–bacak boşluğu ve ileri ofset — KODDA DÜZELTİLDİ (`c10e885`, `4bd5967`).** `camera.js` `FIRST_PERSON_EYE_HEIGHT_M = 1.48` ve `renderer.js` `FIRST_PERSON_RIG_ROOT_BELOW_EYE_M = 1.48` eşitlendi; `0,55 m` ileri rig ofseti kaldırıldı. Gerçek tarayıcıda aşağı bakış görsel kabulü (**25B**) açık.
- **H4 — Düşük: kamera bob eşiği — KODDA DÜZELTİLDİ (`04f12f4`).** `main.js` ve `astronaut-rig.js` `0,04 m/s` eşiğini paylaşıyor.
- **H5 — Orta: Stage 19A/19B snapshot sözleşmesi — KODDA DÜZELTİLDİ (`04f12f4`).** `main.js` ve `sim.js` 12 alanlı `toGeologySnapshot` sözleşmesini ve kontak mesafesini kullanıyor.
- **T1 — Yeni statik bulgu (Efe — 23D'de düzeltilecek):** `c10e885` `camera.js` içinde `FIRST_PERSON_EYE_HEIGHT_M` değerini `1,75 m`'den `1,48 m`'ye indirdi; ancak `Sim/test/core.test.mjs` (satır 648 ve 662, Stage 12 kamera testi) hâlâ `1.75` üzerinden `zDisplay` hesaplıyor. **23D** paketinde test beklentisi `1.48` ile eşitlenmeli.
- **T2 — Yeni statik bulgu (Alparslan — 25B'de düzeltilecek):** `04f12f4` ile `Sim/public/index.html` satır 106'ya eklenen `"Sürüş izi canlı telemetri veya güvenli rota bilgisi içermez."` feragat cümlesindeki `"güvenli "` sözcüğü, `Sim/scripts/smoke-e2e.mjs` satır 245'teki tek cümlelik `disclaimer` istisnası dışında kaldığından `!/güvenli(?!k)|güvensiz|tehlike/i` kontrolüne takılır. **25B** paketinde smoke feragat kontrolü yeni arşiv/minimap feragat cümlelerini kapsayacak biçimde güncellenmeli.

**Sıradaki iş bölümü özeti:** Efe **23A** (`cost-model.js`) → **23B** (`pathfinder.js` + `pathfinder.worker.js`) → **23C** (`validate-route-planner.mjs`) ve **23D** (`mars-sun`, `minimap`, `core.test.mjs` T1/H1/H2/H5 testleri) paketlerini ayrı branch'te yürütür. Alparslan paralelde **25B** (görsel kabul + `smoke-e2e.mjs` T2 senkronizasyonu) işini tamamlar; Efe'nin 23A/23B tesliminden sonra **24B** (minimap rota/ısı haritası/`explainCell` bağlantısı) ve **25** (3D sahne/HUD rota kılavuzu) entegrasyonlarını yapar.

## 14 Kasım 2026 — USGS DTM migration durumu

**Güncel not (repo kaydı; bu turda yeniden doğrulanmadı):** `7df26df` ve `1bc85f6` `codex/usgs-dtm-fail-closed` dalına push edildiği, önceki kod engellerinin statik tekrar incelemede giderildiği kaydedilmiş. USGS adayı ürün-özel düşey datum kanıtı olmadığı için `needs_review`; legacy HiRISE fallback etkin. Bu turda USGS veri kodu, `prepare-data` veya runtime test edilmedi; terrain kabulü açık ve JP2 decoder mevcut değil.

**Tarihsel ilk inceleme: FAIL / kabul edilmedi (`eb385ea`).** İlk USGS migration incelemesinde aşağıdaki engeller kaydedildi. Sonraki `codex/usgs-dtm-fail-closed` commitleri için yol haritasında statik tekrar inceleme sonucu raporlanmış olsa da, bu turda kodu bağımsız yeniden incelemedim. Ürün-özel datum kanıtı ve açık veri kabulü hâlâ gereklidir.

- `extract-dtm.mjs` ürün kimliği, boyut, tiepoint/yarıçap, no-data, geçerli değer aralığı, datum ve lisans gibi kritik değerleri TIFF etiketlerinden kanıtlamadan varsayıyor/sabitliyor; strip düzeni ve sıkıştırma doğrulanmıyor.
- Registry’de boolean/metin bayrakları ve `frameMatchesConfig` “supported” durumuna geçirebiliyor, ancak bağımsız dönüşüm/rezidüel kanıtı yok. Piksel kontrolü yalnızca değerin sonlu olup olmadığını test ediyor.
- Resmî ürün etiketi/SIS, provenance, datum ve lisans-kullanım QC kapısı kapatılmadı. USGS release sayfası hak bilgisini tam olarak “This work is marked with CC0 1.0 Universal” diye verir ([USGS data release](https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic)); bu kaynak ifadesi manifest/doğrulayıcıya bağlanmalı, dosya/ürün kimliği ve kullanım kaydı ayrıca doğrulanmalıdır.
- Yeni migration için bağımsız kabul testi/çalıştırması yapılmadı. Stage 8–12 için geçmişte kaydedilmiş test sonuçları yeni terrain kabulü değildir.

**Tarihsel Stage 6 kod görevi (Alparslan):** çıkarıcıyı TIFF tag’leri/strip ve compression düzeni doğrulanmadan veri üretmeyecek biçimde fail-closed yap; manifestte kaynak, ürün kimliği, datum, lisans ve kullanım şartını birincil kayda bağla; kanonik frame/footprint ve raster dönüşümünü sayısal test/rezidüel kanıtıyla doğrula; ardından bağımsız review ve açıkça istenen kabul çalıştırmasına sun. Güncel yürütme önceliği belgenin başındadır.

İnceleme anında working tree’de legacy IMG/JP2 silme kayıtları ile camera/renderer/test/screenshot değişiklikleri ve TIFF/`.crdownload` untracked dosyaları vardı. Bunlar `eb385ea`’e veya yalnız notları kapsayan commit’e atfedilmez.

## Ürün hedefi ve kapsam sınırları

Marswalk’ın nihai ürün vizyonu, oyuncunun Mars yüzeyinde astronotu **birinci şahıs bakışla keşif amacıyla** yönettiği ayrıntılı, kullanıcı kontrollü bir 3D simülasyondur. “FPS” first-person kamera/kontrol anlamındadır; shooter, silah veya çatışma mekaniği değildir. Çalışan 2D Canvas MVP ve WebGL2 terrain görüntüleyicisi bu hedefe giden ara kilometre taşlarıdır; Stage 10 first-person/rig dikey dilimi eklense de nihai deneyim değildir. Kullanıcının 13 Kasım’daki “3D deneyim hedefe yakın değil” bildirimi Stage 10 entegrasyonundan önceki görünüm içindir; sonraki dilimin bağımsız doğrulaması ayrı kayıtlıdır. Seçili resmi challenge: *Interplanetary Survival Guide: Martian Map*.

**Bilimsel/ürün sınırı:** Canlı NASA telemetrisi izlenimi, gerçek rover karar desteği, güvenli/güvensiz rota **kararı** veya veriyle desteklenmeyen risk/güvenlik skoru üretme. **14 Kasım 2026 akşam güncellemesi:** Şeffaf, kaynaklı ve parametrik bir **EVA yürünebilirlik puanı** ile otomatik rota önerisi artık ürün kapsamındadır; koşulları en üstteki "ÜRÜN YÖNÜ GÜNCELLEMESİ" bölümündedir (planlama yardımcısı, bilinmeyen veri asla güvenli değil, kaynaksız eşik senaryo parametresi, kaba çözünürlükte puan yok). FPS hareketi Mars yerçekimi ve atmosfer koşullarını dikkate almalı; sayıların birimi, birincil kaynak, uzamsal/zamansal kapsam ve senaryo varsayımları ayrı gösterilmeli. Astronot/giysi kütlesi ve aerodinamik katsayıları kaynaksızsa atmosfer sürüklemesini gerçekçi fizik gibi uygulama. 14 Kasım 2026 itibarıyla kullanıcı eski IMG DTM ve JP2 orto dosyalarının geçersiz olduğunu bildirdi; bunları aktif veri girdisi veya otomatik fallback olarak kullanma. Yeni raster ancak provenance, datum, lisans/kullanım ve uzamsal uygunluğu doğrulandıktan sonra ana yüzey kaynağı olabilir.

NASA başlangıç referansları: yüzey yerçekimi NASA Planet Compare'da 3.71 m/s², NASA NSSDC Mars Fact Sheet'te yaklaşık 3.73 m/s² olarak yuvarlanır; kaynak/yuvarlama farkı saklı tutulur. NSSDC ortalama yüzey basıncını 6.36 mbar (mevsimsel 4.0–8.7 mbar), yüzey yoğunluğunu yaklaşık 0.016 ± 0.006 kg/m³ ve atmosferin hacimce çoğunluğunu CO₂ (~95.1%) olarak listeler. Bunlar Jezero'da belirli bir sol/saate ait atmosfer ölçümü değildir. [NASA Planet Compare](https://solarsystem.nasa.gov/planet-compare/?intent=121), [NASA NSSDC Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html).

## Bilimsel veri zemini ve kurallar

### Yerel rasterlar

**[TARİHSEL METADATA; 15 Kasım 2026 İTİBARIYLA UYGULAMADA FİİLEN GÖSTERİLEN ARAZİ — fail-closed yedek (K3-7)]** Önceki DTM `DTEEC_045994_1985_046060_1985_U01.IMG` için kaydedilmiş PDS3 metadata: 6673×14266 piksel, yaklaşık 1.009663 m/piksel, 32-bit PC_REAL, Mars 2000 eşpotansiyel yüzeyine göre metre. Equirectangular, planetosentrik enlem, 15° standart paralel, merkez meridyen 77.44°E, yarıçap yaklaşık 3394.8398 km; no-data `FF7FFFFB`, geçerli aralık yaklaşık −2679.20…−2388.31 m. **[KULLANICI BİLDİRDİ]** Bu DTM ile `ESP_046060_1985_RED_C_01_ORTHO.JP2` geçersizdir; sebep henüz belgelenmedi. Aşağıdaki tarihsel rota/profil ve stage kayıtları eski veriyle yapılmış kayıt olarak kalır, yeni veri için doğrulama sayılmaz.

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

Aşama numaraları yürütme sırası değildir. **Güncel durum (14 Kasım 2026):** Stage 13 ve 16 rig kodu/testleri, Stage 17 alt beden entegrasyonu mevcut; Stage 17'nin bu turdaki bağımsız incelemesi statik olup görsel kabul açık. Önce Stage 15–17 first-person görsel kabul, sonra Stage 18 rölyef okunabilirliği gelir. Stage 19A kodu mevcut, fakat audit'teki veri/koordinat/hash caveat'leri nedeniyle 19B sözleşmesi henüz hazır değildir. Yeni USGS GeoTIFF adayı ürün özelinde düşey datum kanıtı olmadığı için `needs_review` sürer; legacy HiRISE fallback korunur. Orto verisi ve kayıt kanıtı ayrı iştir.

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
- **Durum:** Kod mevcut; kaynakta deterministik poz ve API alanları (`landingRecoveryFrac`, `groundContactStatus`, `gaitDistanceM`) bulunur. `8e7173c` Stage 16 iyileştirmeleri de rig'i geliştirmiştir. Yeni Stage 13 kod görevi açık değildir; görsel kabul Stage 15–17 tarayıcı incelemesinin parçasıdır.
- **Bağımlılık:** Stage 10 astronot rig temeli ve Stage 12 movement API girdileri. Raster/provider migration’ına teknik bağımlılığı yoktur.
- **Kabul:** Deterministik çıktı: aynı hareket durum parametreleri için aynı eklem açıları/poz transformları üretilir. Bilinmeyen veya tanımsız girdide nötr güvenli poza döner. WebGL veya DOM nesnesi üretmez. Birim testleri yalnız kullanıcı test çalıştırmaya izin verirse çalıştırılır; varsayılan iş akışına test çalıştırma dahil değildir.

### 14. EVA suit ayrıntıları ve first-person entegrasyonu — KODDA MEVCUT; GÖRSEL KABUL AÇIK

- **Dosya/Git kanıtı:** `e14b661` rig'e eldiven/göğüs ünitesi ve zincirli eklem verisi ekledi; `502d76c` kask/ayak bileği, kamera ve renderer entegrasyonunu; `18b4137` koordinat, HUD ve 1:1 first-person view-model düzeltmelerini içerir.
- **Sınır:** Rig geometrisi ve pozları sunum amaçlıdır. Atmosfer shader'ı çevresel görseldir; Jezero anlık ölçümü veya astronot hareketine atmosfer kuvveti kanıtı değildir.
- **Açık kabul:** Yürüyüş, sıçrama evreleri, iniş, duraklatma ve bilinmeyen yüzey temasında gerçek görüntü incelenmeden kadraj/örtüşme kalitesi kabul edilmiş sayılmaz. Başlıktaki Alparslan görsel kabulü ve Efe rig denetimi bu açık için tanımlanmıştır.

### 19. Kullanıcı Konumunda USGS SIM 3464 Jeolojik Birim Motoru ve Harita Katmanı — 19A VE 19B KODDA TAMAMLANDI (`c5d0e51`, `04f12f4`); GÖRSEL KABUL AÇIK

- **Amaç:** Astronotun Sol 120–164 koridorunda yürürken üzerinde bulunduğu resmi USGS jeolojik birimini (`Njf` Jezero floor unit, `Nle` Lower etched unit / Séítah, `NHjf2` Jezero floor unit 2) anlık olarak tespit etmek; HUD'da birimin resmi kodunu, yaşını ve kayaç/mineral özetini göstermek; 2D/3D/minimap görünümde isteğe bağlı yarı saydam jeolojik birim sınır katmanı sunmak.
- **Kaynak Veri:** `Sim/data/usgs-sim3464-geology/jezero_geounits_corridor.geojson` (`135 KB`), `manifest.json`, `sim3464_metadata.xml` ve `sim3464_pamphlet.pdf` (Sun & Stack, 2020 — USGS Scientific Investigations Map 3464).
- **İş Bölümü ve Dosya Sınırı:**
  - **19A — Efe (tamamlandı, `cdc7ca3`, `c5d0e51`):** `Sim/public/js/geo/geology.js`, `Sim/test/geology.test.mjs`; 12 alanlı `GEOLOGY_SNAPSHOT_CONTRACT`, `toGeologySnapshot` ve `createGeologicContactField`/`nearestGeologicContactM` yazıldı; belirsizlikler `Sim/stage19a-geology-audit.md` içinde belgelendi.
  - **19B — Alparslan (kodda tamamlandı, `eb74b6f`, `2d7c27b`, `04f12f4`, `3167130`):** `main.js`, `simulation/sim.js`, `view/hud.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`; 12 alanlı snapshot sözleşmesi, kontak mesafesi, no-data boşluklarında kırılan 3D sınır çizgileri ve HUD belirsizlik (`100–200 m`)/lisans (`not_stated`)/caveat metinleri bağlandı.
- **Kabul:** Yalnız kaynak ve CRS/konum kayıtları yeterli ise gösterim yapılır; 100–200 m belirsizliği gizlenmez ve saha gerçeği iddiası kurulmaz.

### 20. Arşiv Perseverance Sürüş İzi (`M20_traverse.json`) ve 16 Ara Sol Durağı (`M20_waypoints.json`) — 20A VE 20B KODDA TAMAMLANDI (`48e330b`, `04f12f4`); GÖRSEL KABUL AÇIK

- **Amaç:** Mevcut sadeleştirilmiş kuş uçuşu yürüyüş koridorunu korurken, yanına gerçek arşiv Perseverance rover sürüş izini (`Sol 116 Site 4 Drive 1250` $\to$ `Sol 157 Site 6 Drive 0`) ve aradaki 16 resmi sol durağını (`Sol 122..157`) karşılaştırmalı referans katmanı olarak eklemek.
- **Kaynak Veri:** `Sim/data/mars-trek/M20_waypoints.json`, `Sim/data/mars-trek/M20_traverse.json` ve `perseverance_traverse_fgdc.html`.
- **İş Bölümü ve Dosya Sınırı:**
  - **20A — Efe (tamamlandı, `48e330b`):** `Sim/public/js/geo/traverse.js`, `Sim/public/js/view/3d/marker-mesh.js` (`buildIntermediateSolMarkers`) ve `Sim/test/traverse.test.mjs`.
  - **20B — Alparslan (kodda tamamlandı, `04f12f4`, `3167130`):** `Sim/public/js/view/traverse-layer.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`, `index.html`. 2D, 3D ve minimap sahnesinde arşiv izini ve 3D ara sol dikmelerini sunar; Sol 116→157 sürüş kaydı ile Sol 120/164 görüntü kayıtları ayrımını gösterir.
- **Kabul:** Canlı rover telemetrisi veya güvenli rota iddiası kurulmaz; arşiv ürünü ile senaryo koridoru görsel ve metinsel olarak net biçimde ayrılır.

### 21. 25 cm HiRISE Ortomozaik WMTS Karo Birleştirme ve 2D/3D Doku Kaplaması — 21A TAMAMLANDI (`d1abe35`); 21B PİKSEL HİZALAMA KANITI BEKLİYOR

- **Amaç:** Tarayıcıda çözülemeyen ve geçersiz bildirilen eski `.JP2` ortogörüntü yerine, aktif 1 m DTM ile aynı `soc_006` kontrol ağını paylaşan resmi Mars Trek HiRISE ortomozaik PNG karolarını (`JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`) piksel hizası doğrulandıktan sonra 2D harita, minimap ve 3D WebGL2 arazi mesh'ine doku olarak bağlamak.
- **Kaynak Veri:** `Sim/data/mars-trek/ortho-tiles/` (91 PNG karo, Zoom 13–17), `hirise_ortho_25cm_WMTSCapabilities.xml` ve `hirise_ortho_25cm_fgdc.html`.
- **İş Bölümü ve Dosya Sınırı:**
  - **21A — Efe (tamamlandı, `d1abe35`):** `Sim/scripts/build-ortho-mosaic.mjs`, `Sim/test/ortho-mosaic.test.mjs` ve `Sim/stage21a-ortho-audit.md`.
  - **21B-Ön / 21B — Efe (kayıt kanıtı) → Alparslan (2D/3D/minimap doku kaplaması):** Etkin DTM ile piksel/yarım-piksel hizası doğrulanana kadar katman kapalı tutulur (`index.html`'de açık bilgi notu mevcut).
- **Kabul:** DTM'den türetilen hillshade hiçbir zaman ortofoto diye adlandırılmaz; ortomozaik yalnızca WMTS piksel/UV kaydı doğrulandığında çizilir ve kapsam dışı alan şeffaf kalır.

### 22. Sol 120 ve Sol 164 Perseverance Yer Seviyesi Saha Fotoğrafları ve 3D Kamera Bakış Hizalama — 22A VE 22B KODDA TAMAMLANDI (`4d6bd10`, `04f12f4`); GÖRSEL KABUL AÇIK

- **Amaç:** Astronot WB1 (`Site 4, Drive 1250`) veya Roubion (`Site 6, Drive 0`) durağındayken, Perseverance rover'ın o noktada çektiği gerçek yer seviyesi fotoğrafları göstermek ve 3D birinci şahıs kamerasını rover'ın fotoğrafı çekerken baktığı tahmini azimut/eğim (`mastAz`/`mastEl`) açısına hizalamak.
- **Kaynak Veri:** `Sim/data/perseverance-raw/manifest.json`, `sol120/` (6 JPEG), `sol164/` (6 JPEG).
- **İş Bölümü ve Dosya Sınırı:**
  - **22A — Efe (tamamlandı, `4d6bd10`):** `Sim/public/js/geo/rover-observations.js`, `Sim/test/rover-observations.test.mjs` ve `Sim/stage22a-rover-observations-audit.md`.
  - **22B — Alparslan (kodda tamamlandı, `04f12f4`):** `Sim/public/js/view/rover-gallery.js`, `main.js`, `view/3d/camera.js`, `index.html`, `styles.css`. Duraklarda fotoğraf galerisini (`observation.credit` ham künyesi ve LMST/UTC saatiyle) ve `SUPERCAM_RMI` hariç mast kameralarında `SITE_FRAME_ASSUMPTION` uyarılı "Rover kamerasının tahmini yönüne bak" butonunu bağlar.
- **Kabul:** Fotoğraflar arşiv gözlemi olarak sunulur; canlı yayın izlenimi verilmez; site çerçevesi varsayımı açıkça belirtilir.

## Paralel çalışma şeritleri ve dosya sınırları

Her bağımsız iş bir kabul ölçütü ve belirli bir dosya kümesiyle tanımlansın. Aynı dosya kümesini aynı anda yalnız bir kişi/AI değiştirsin; bağımsız şeritler ayrı branch ve commit'lerle ilerleyebilir. Efe'nin 3D runtime deneyimi bilinmiyor diye kod görevi bekletilmez: CPU mesh builder görevinde render kütüphanesi bağımlılığı yoktur; gerçek teknik engel çıkarsa Alparslan’la kapsamı daraltıp yardım istenir.

| Şerit | Ana klasör | Bağımsız iş örnekleri ve sınır |
|---|---|---|
| Geometri (`geo`) | `Sim/public/js/geo/` | PDS koordinat dönüşümünü veya saf geometri fonksiyonlarını incelemek; dönüşüm varsayımlarını belgelemek. Veri yükleyicisini veya simülasyon state'ini değiştirmez. |
| Yüzey/veri (`surface`) | `Sim/public/js/surface/` | Manifest/atıf/lisans metadata QA’sı veya yeni validator kuralının sınırlı uygulaması. Gerçek dataset, label ve kullanım koşulu doğrulanmadan adapter/format uydurulmaz. |
| Simülasyon (`simulation`) | `Sim/public/js/simulation/` | Hareket, saat, faz ve rota metriği kurallarını incelemek; UI/DOM veya Canvas koduna dokunmamak. |
| Girdi (`input`) | `Sim/public/js/input/` | Klavye ve kontrol erişilebilirliği/olay eşlemesini iyileştirmek; simülasyon kuralını bu dosyalara taşımamak. |
| Görünüm (`view`) | `Sim/public/js/view/` | 2D Canvas ara sürümü ve yeni `view/3d/` sahne, terrain, kamera modülleri; bilimsel örnekleme veya rota hesabını görünüm katmanına eklememek. |

PLACES kaynağı, yeni raster geçişi, orto decoder/alignment ve attribution/manifest QA ayrı kabul ölçütlü şeritlerdir. `public/js/main.js`, `config.js`, `geo/` frame varsayımları ve snapshot/provider sözleşmeleri Alparslan'ın koordine ettiği entegrasyon sıcak noktalarıdır. Stage 13 ve 16 kodu tamamlandı; Stage 17 entegrasyonu kaynakta mevcut fakat görsel kabulü açık. Stage 18, Stage 15–17 görsel kabulinden sonra başlar. Stage 19B, yalnız 19A audit caveat'leri ve sözleşmesi netleştiğinde yürütülür. Stage 20/21/22'nin her birinde A hazırlığı kendi B entegrasyonunun önkoşuludur; her çift ayrı kabul kapısıyla ilerler. Stage 6 USGS adayının datum belirsizliği nedeniyle açık kalır ve Stage 19–22 ile karıştırılmaz.

### Tarihsel iş bölümü: Stage 8–12 sonrası raster migration ve Stage 13 planı

| Sahip | Görev paketi | Dosya sınırı | Kabul ölçütü |
|---|---|---|---|
| Alparslan (veri kabul kapısı; ilk iş) | Yeni TIFF için resmî product identity/label/SIS, provenance, lisans/kullanım, vertical datum, grid/PixelIsArea yorumunu doğrula; rota boyunca footprint/no-data QC kanıtını tamamla. | Belge/araştırma çıktısı; çalışma ağacındaki rastera salt okunur erişim. Henüz kod/veri/test değişikliği yok. | Kullanılabilir bir kaynak/datum/kullanım beyanı, dönüşüm girdileri ve tüm demo rotası/kapsam QC’si belgelenir; bilinmeyen alan kalırsa aday reddedilir veya `needs_review` olarak kalır. |
| Alparslan (frame/provider entegrasyonu; QC kapısı geçince) | Equirectangular lat_ts=0/lon₀=0 frame'ine ve yeni provider'a kontrollü geçiş; 2D/3D render aynı snapshot/provider sözleşmesini kullanır. Eski sabitler, HUD atıfları ve örnekleme durumları birlikte güncellenir. | Entegrasyon sahibi tek başına: `Sim/public/js/config.js`, `geo/`, `surface/registry.js`, provider/layers sözleşmeleri, `Sim/public/js/main.js`, HUD ve zorunlu entegrasyon noktaları. | Yeni kaynak doğrulandığında 2D ve WebGL2 aynı konumda geçerli örnek verir; başarısız/unknown candidate `unavailable` kalır. Fallback kabiliyeti kayıtlı kalır fakat yalnız ayrı doğrulanmış/kullanılabilir provider seçilebilir; mevcut geçersiz bildirilen IMG/JP2’ye fallback yapılmaz. |
| Efe (bounded raster hazırlama; frame/metadata sözleşmesi dondurulduktan sonra ayrı branch) | 1.84 GB tam GeoTIFF’i tarayıcıya yüklemeyen, doğrulanmış demo kapsamı için sınırlı pencere/tiling hazırlama akışını tanımla ve uygula; kaynağın provenance/no-data bilgisi çıktıda korunur. | `Sim/scripts/` içindeki ayrı hazırlama aracı ve ona ait yeni test dosyaları; `config.js`, `main.js`, `registry.js`, provider/snapshot sözleşmelerine dokunmaz. Testler kullanıcı istemedikçe çalıştırılmaz. | Hazırlanan çıktı sınırları bellidir, metadata ile kaynak raster/frame/no-data’ya izlenebilir ve tam kaynak raster runtime belleğine alınmadan okunabilir; rotanın her hücresi için no-data durumu raporlanır. |
| Alparslan (Stage 15–17 görsel kabul) | Kamera, gait, alt beden görünürlüğünü browser'da incele. | Gözlem/rapor; kod düzeltmesi gerekirse ayrı görev ve dosya kümesi. | Yürüme, aşağı bakış, sıçrama/iniş ve unknown-contact kareleriyle görsel kabul kararı; 2D fallback ve temas caveat'i korunur. |
| Alparslan (Stage 18 rölyef) | Stage 15–17 görsel kabulinden sonra arazi rölyef okunabilirliği. | `main.js`, `view/3d/terrain-mesh.js`, `renderer.js`, `marker-mesh.js` ve sunum sınırı; tek görevde. | İki sabit noktada yükselti değişimi daha okunur; kaynak kot/no-data korunur, görsel abartı etiketlidir. |
| Efe (Stage 19A audit kapanışı) | Mevcut `cdc7ca3` jeoloji modülü için koordinat/waypoint/hash/lisans caveat'lerini kaynakla netleştir. | Audit raporu ve yalnız önceden koordine edilmiş metadata belgeleri; Alparslan'ın runtime dosyalarına dokunmaz. | 19B için birim/konum güveni ve açıkça gösterilecek belirsizlikler donmuş sözleşmede yazılıdır. |
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

**Geçmişte kalan sıradaki işler güncellendi:** Stage 13/16/17 rig kinematiği ve renderer bağlantısı artık kaynakta mevcut. Stage 6 USGS adayına ait önceki validator engelleri fail-closed kodla ele alınmış olsa da ürün-spesifik datum kanıtı/runtime kabul hâlâ açık; bu görev Stage 18/19'dan bağımsız ve datum kanıtı gelmeden aday etkinleştirilmez. Güncel sıra: Stage 15–17 görsel kabul → Stage 18 rölyef; paralelde Stage 19A audit sözleşmesi → 19B; ardından her biri kendi A→B kapısıyla Stage 20, 21 ve 22. JP2 hizalaması ve PLACES izi ayrı/koşullu kalır. Testler kullanıcı isteği olmadan çalıştırılmaz.

