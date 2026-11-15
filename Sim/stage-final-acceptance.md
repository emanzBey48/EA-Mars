# Son kabul raporu (K1-3) — 15 Kasım 2026

**Sorumlu:** Efe · **Dal:** `codex/efe-visual-realism` · **HEAD:** `53068e6` · **Çalışma klasörü:** `C:\Users\efese\Desktop\Nasaspaceapps-efe\Sim` (git worktree)

**Kapsam ve yöntem:** Bu rapor yalnızca gözlenmiş kanıtı içerir: birim test çıktısı, ön uçuş çıktısı ve başsız Edge üzerinde yazılmış bir betiğin (`accept.mjs`, scratchpad) DOM/`getDiagnostics()` okumaları ve ekran görüntüleri. Kod incelemesi PASS sayılmamıştır. Görsel **kalite** değerlendirilmedi; yalnızca işlev. Uygulama kodu değiştirilmedi. `npm run smoke` bu oturumda **çalıştırılmadı** (portlar 8181/9333 başka bir ajanda).

Etiketler: **PASS** = gözlendi ve beklenen davranış görüldü · **FAIL** = gözlendi ve beklenmeyen davranış · **NOT-TESTED** = bu kabulde denenmedi (neden yazılı) · **SEE-SCREENSHOT** = görsel insan incelemesi gerektirir.

## (a) Otomatik kontroller

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| `node --test test/` (`Sim` içinde) | **574 / 574 geçti, 0 başarısız, çıkış kodu 0** (mevcut ağaçta yeniden çalıştırma, süre ~39 s). İlk çalıştırma 573/573 idi; aradaki bir testin farkı, rapor yazılırken Ajan R'nin `test/footprint-trail.test.mjs` dosyasına eklediği testtir. | `scratchpad\final-acceptance\unit-tests-rerun.txt` (ilk çalıştırma: `unit-tests.txt`, `unit-tests-exit.txt`) |
| `node scripts/preflight.mjs` | **HAZIR** — Node 1/1, DTM 4/4, Ortho 6/6, Mars Trek 8/8, Viking 3/3, MOLA 2/2, Jeoloji 8/8, Perseverance 2/2, no-data 1/1; hata 0, uyarı 0; çıkış kodu 0 | Komut çıktısı (bu raporu yazan oturum) |
| `npm run smoke` | **NOT-TESTED** — başka ajanın portları (8181/9333) ile çakışma önlendi | — |

## (b) Tarayıcı kabulü (başsız Edge, portlar 8291/9544, betik: `scratchpad\final-acceptance\accept.mjs`)

Ekran görüntüleri klasörü: `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\final-acceptance\`
(Aynı klasörde bu kabulden önceki çalıştırmalardan kalan `a1-*`, `a2-*`, `a3-*`, `a4-*`, `b1-*`, `c1-*`, `c2-*`, `c3-*` dosyaları vardır; bunlar bu kabulün kanıtı değildir. Sonuç dosyası: `results.json`.)

| ID | Madde | Durum | Gözlenen kanıt | Görüntü (klasör içinde) |
|---|---|---|---|---|
| D1 | `?demo=1` akışı açılıyor mu | **PASS** | Sunum HUD'u görünür; banner "Sol 120 (WB1) → Sol 164 (Roubion) A* rotası hesaplanıyor"; rota özeti "Toplam mesafe 730 m" (kontrol, özet hesaplanana kadar bekler); 3D görünüm açık; normal modda `window.marswalk` yok. Konsolda yalnız `/favicon.ico` 404 (bkz. §c-7). | `demo-01-open.png` |
| D2 | 3D birinci şahıs açılır, WebGL2 renderer hazır | **PASS** | `activeView: 3d`, `rendererError: null`, `cameraMode: first-person`, göz yüksekliği 1,48 m, `verticalScale: 1` | — |
| D2b | Eller var; gövde ileri bakışta yok | **PASS** (görsel) | `fp-01-forward-pitch0.png`: alt köşelerde iki beyaz eldiven/ön kol, sahnede gövde yok. `fp-02-lookdown.png`: aşağı bakışta yalnız eldiven ve ön kol seçilebiliyor. | `fp-01-forward-pitch0.png`, `fp-02-lookdown.png` |
| R1 | Rota tercihi değişince rota/özet güncelleniyor (dengeli → en kısa → en düz) | **PASS** | Her değişimde "Rota hesaplanıyor" durumu gözlendi (`sawBusy: true`) ve özet değişti. Son çalıştırma: dengeli "730 m, en dik eğim 9,8°"; en kısa "730 m, 14,1°"; en düz "731 m, 10,1°, yürünebilirlik 99/100". Bkz. §c-2. | `panel-00-before-pref-change.png`, `route-01-preferences.png` |
| M1 | Minimap global ↔ Jezero yakınlaştırma ve Viking katmanı | **PASS** | "Mars globali göster" → 10.000 km ölçekli Viking görünümü; "Kapsama sığdır" → 1 km ölçekli Jezero/HiRISE hillshade ve rota çizgisi. Katman durumu: "Viking MDIM 2.1: hazır · 232 m/px · lisans: belirtilmemiş". Görüntüde "yerel ayrıntı yok / orto-kot verisi değildir" etiketi var. | `minimap-02-global.png`, `minimap-03-jezero.png` |
| M2 | Minimap no-data / EDGE_UNKNOWN hücre reddi | **NOT-TESTED** | Tarayıcıdan no-data veya EDGE_UNKNOWN hücresi seçmek için kanca yok; yüklü pencerede no-data sayısı 0 (K1-2 notu). Sentetik birim testi bu kanıtın yerine geçmez. | — |
| F1 | Yürürken ayak izi oluşuyor mu | **PASS** (sayı) / SEE-SCREENSHOT (görsel) | `footprints.count`: 0 → 11 (W 3,5 s; yatay yer değişimi 33,7 m; hareket fazı `running`). Görsel izler `walk-01-after-W.png` karesinde seçilemedi; görsel doğrulama yapılmadı. | `walk-01-after-W.png` |
| H1 | Varsayılan ufuk açık | **PASS** | `renderer.horizon.status: ready`, 168 112 üçgen, etiket "Bölgesel bağlam, ~463 m/piksel. Düşey datum doğrulanmadı. Yürünebilirlik puanı yok." | — |
| H2 | `?horizon=off` ufku kapatıyor | **PASS** | `renderer.horizon.status: off`, 0 üçgen | — |
| S1 | `?scale=3` abartı rozeti | **PASS** | Rozet: "Dikey ölçek: 3× Görsel Abartı (sunum parametresidir; gerçek arazi eğimi daha düzdür)", sınıf `scale-exaggerated` | `scale-03-badge.png` |
| X1 | 2D düğmesiyle 2D Canvas'a geçiş | **PASS** | `activeView: 2d`, `#map` görünür | `fallback-01-2d-button.png` |
| X2 | WebGL2 hatasında 2D fallback | **PASS** | `testWebGL2Failure=1` ile `activeView: 2d`, `rendererAvailable: false`, "3D desteklenmiyor" düğmesi devre dışı | `fallback-02-webgl2-forced-failure.png` |

**Bu kabulde denenmeyen maddeler (NOT-TESTED):**
- Sıçrama yayı, iniş pozu ve kamera dip'i (Space ile tuş basışı denenmedi; K1-2 notu bunu zaten NOT-TESTED işaretlemişti).
- Varış rozeti (`#arrived-banner`): Sol 164'e varış denenmedi.
- Sol 164 fotoğraf galerisi ve kamera yönü düğmesi.
- Hızlı ardışık rota isteği yarışı.
- Ortomozaik hizası (görsel ölçüm yok; hizalama zaten `stage39` belirsizliğinde).
- Gerçek no-data tıklaması (M2).
- Yük ve kare süresi (FPS) ölçümü; K2-6 olarak Alparslan'a aittir.

## (c) Bulunan uygulama sorunları (düzeltilmedi; dosya:satır)

1. **Rota süresi 0,8 m/s, simülasyon 1,2 m/s.** `public/js/route/route-service.js:301` varsayılan senaryo hızını 0,8 m/s yapar; `public/js/main.js:348` "(0,8 m/s senaryo hızı)" metnini sabit yazar. Simülasyon ise `public/js/config.js:5` ile 1,2 m/s × 8 kullanır (`hud.js:75` bunu doğru gösterir). Aynı panelde iki farklı hız var.
2. **"En düz" tercihi maksimum eğimi düşürmüyor (gözlendi).** Son çalıştırmada en düz 10,1° (çarpan 1,66), dengeli 9,8° (çarpan 1,03). Tercih adı bu metrikle örtüşmüyor; UI metni ne ölçüldüğünü açıklamıyor. Jüri sorusu olabilir.
3. **Rota uzunluğu belgelerle örtüşmüyor.** UI'de en kısa 730 m ve en düz 731 m; devir notunda 730,505 m ve 732,161 m. Yuvarlama veya uç noktası farkı doğrulanmadı. Tercih/eğim sayıları da devir notundakilerle eşleşmiyor (en kısa maks eğim 14,1° UI'de; devir notunda 10,64°). Kaynağı belirsiz.
4. **Datum çelişkisi (K3-5, açık).** `public/js/config.js:56` `verticalDatumVerified: true`; `data/dtm_subset.json` `verticalDatumVerified: false`. Kanıt yoksa `false` olmalı.
5. **Göz yüksekliği belge çelişkisi.** Kod `public/js/view/3d/camera.js:9` 1,48 m; `e9a0a78` commit mesajı 1,75 m diyor. Kod esas alındı.
6. **Çelişkili ortomozaik uyarısı (gözlendi).** `public/js/view/hud.js:104` "Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor…)" uyarısını eski `layers.ortho` bayrağına göre gösterir. Aynı ekranda WMTS ortomozaik katmanı ayrı olarak sunulduğu yazılıdır (`demo-01-open.png`). Okuyucu iki çelişkili mesaj görür.
7. **Eksik favicon (küçük).** `Sim/public/favicon.ico` yok; tarayıcı `/favicon.ico` için 404 alıyor (`results.json`, D1). Uygulama hatası değil; teslimde temizlik.
8. **Eski PASS ifadeleri.** `stage29-acceptance.md` içindeki birçok PASS, bu raporun kanıtından önce yazılmış kod incelemesidir; K1-2 bölümü onları zaten sınırlandırıyor. Bu rapor eski tabloları değiştirmedi.

## (d) Çalışma ağacı notu

- Bu kabul sırasında çalışma ağacında başka bir ajanın commit edilmemiş değişiklikleri vardı: `Sim/scripts/smoke-e2e.mjs` ve (rapor yazılırken) `Sim/test/footprint-trail.test.mjs`. Onlara dokunulmadı. Uygulama kodu (`public/js/**`) bu değişikliklerden etkilenmedi; tarayıcı kabulü HEAD `53068e6` uygulama kodunu ölçtü.
- Ekran görüntüleri geçici scratchpad klasöründedir. Kalıcı kanıt için `Sim/acceptance-evidence/` gibi bir klasöre kopyalanması gerekir; bu görevde dosya sınırı gereği kopyalanmadı.
