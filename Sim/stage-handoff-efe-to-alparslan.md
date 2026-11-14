# Efe → Alparslan devir notu (15 Kasım 2026)

Dal: `codex/efe-stage13-eva-kinematics` (HEAD `190e133` ve sonrası). Bu dal Alparslan'ın `codex/stage25b-acceptance-update` dalını içerir (son birleştirme: 34B).
Test durumu: `cd Sim; node --test test/` → **429/429, çıkış kodu 0** (Efe çalıştırdı). `npm run smoke`, tarayıcı ve görsel kabul **Efe tarafından çalıştırılmadı**; bunlar Alparslan'ın kabul işidir.

## Hızlı doğrulama (Alparslan için)
1. `git fetch --all` ve bu dalı (veya `main`'e birleşecek dalı) çek.
2. `cd Sim; node --test test/` → 429/429 beklenir.
3. Smoke için: `Sim/data/dtm_subset.f32` gerçek raster olmalı (LFS işaretçisi 132 bayt ise `git lfs pull`); sandbox'ta `127.0.0.1:9333` DevTools erişimi gerekir.
4. `.gitignore`: `Sim/.gitignore` içinde `viking-mdim/` ve `regional-dem/` için istisnalar eklendi (kökte ham `.tif` ignore satırı duruyor, dosya silindi).

## Efe teslimleri ve Alparslan'ın bağlayacağı API'ler

| Aşama | Dosyalar | Alparslan'ın işi | Notlar |
|---|---|---|---|
| **35A** gerçek ölçek | `geo/relief-metrics.js`, `scripts/relief-report.mjs`, `test/relief-metrics|scale-contract.test.mjs`, `stage35-scale-audit.md` | 35B zaten yapıldı (1× varsayılan, seçici, rozet). | Ölçümler (gerçek DTM, 1 m): kot 44,84 m aralık; eğim P50/P90/P99/maks 3,11/7,54/13,54/35,77°; en derin kapalı çukur 7,98 m; en belirgin tepe 8,07 m. Çukur/tepe eşikleri senaryo parametresidir. |
| **32A** ayak izi | `view/3d/footprint-trail.js`, test, `stage32a-footprint-audit.md` | **32B:** render (instanced yama) + minimap/2D izi. | `createFootprintTrail({ sampleElevation, displayConfig, ... })` → `{update, getSnapshot, reset}`. `update({timeS,xM,yM,headingRad,gaitDistanceM,grounded,airborne,landingRecoveryFrac})`. Çıktı `Float32Array` (10/iz) + `quads` (12/iz); **kaynak kot `zM`**: renderer `(zM − ref)·verticalScale` uygular. R/sıfırla → `reset()`. **Bulgu:** rig'de `leftLeg/leftBoot/leftArm` yerel −X'te = fiziksel sağ; ayak izi fiziksel isimlendirme kullanır. İz yalnız görseldir (regolit mekaniği iddiası yok). |
| **33A** rota şeridi | `view/3d/route-ribbon.js`, test, `stage33a-route-ribbon-audit.md` | **33B:** emissive/akan şerit shader'ı, yakın-alan okunabilirliği, minimap parlaması. | `buildRouteRibbon({ path, segments, sampleElevation, displayConfig, widthM, groundOffsetM, sampleSpacingM, cameraXY, nearM, farM })`. `positions` display uzayında → **ölçek değişince yeniden kur** (`rebuildTerrainMeshForScale` zincirine ekle). No-data'da şerit kırılır (`runs`). Miter köşelerinde genişlik en fazla ~1,08× açılır. |
| **34A** rota tercihleri | `route/route-compare.js`, `route/pathfinder.worker.js` (uyumluluk), testler, `stage34a-route-compare-audit.md` | **34B zaten bağlandı; düzeltilmesi gerekenler aşağıda.** | Worker artık `message.preference` veya `options.preference` (`balanced` / `shortest` / `flattest`≡`gentle`) kimliğini kullanır. Yeni mesaj: `plan-route-variants` → `variants-result`. |
| **36A** Viking mozaiği | `geo/viking-mosaic.js`, `scripts/ingest-viking-mosaic.mjs`, test, `stage36-viking-audit.md`, `data/viking-mdim/` | **36B:** minimap K0 zemin katmanı. | Karolar `data/viking-mdim/tiles/{z}/{row}/{col}.png`, z=0..3 (41.677 → 5.210 m/px), 2:1 eşdikdörtgen, 256 px, alfa=0 → no-data (üründe fiilen yok). Bölgesel kesit `regional-jezero-4deg-native.png` (231,54 m/px). **Renk mozaiği; ortogörüntü ve yükseklik DEĞİL.** Lisans `belirtilmemiş` (USGS sayfası 403 verdi). Ham 12,7 GB dosya projeden çıkarıldı. |
| **37A** MOLA bölgesel kot | `geo/trek-raster.js`, `geo/regional-dem.js`, `scripts/fetch-regional-dem.mjs`, testler, `stage37-regional-dem-audit.md`, `data/regional-dem/mola-jezero.{f32,json}` | **37B:** ufuk/bağlam katmanı (+ varsa vekil/önbellek). | 384×384, 0,0078125° (~463 m), pencere 75,95–78,95°D / 16,94–19,94°K, kot −3777…+199 m, no-data yok. Yerel DTM ile karşılaştırma (H1 planetosentrik): ortalama +0,17 m, std 4,27 m; H2 jeodetik: +130,9 m. Datum **`needs_review`** (DTM'in düşey datumu doğrulanmadı; DTM adı `MOLAtopography_DeltaGeoid`). Ufuk ayrı "bölgesel bağlam" katmanı olmalı, rota yüksekliği ile birleştirilmemeli. Etiket önerisi: "Bölgesel bağlam, ~463 m/piksel. Düşey datum doğrulanmadı. Yürünebilirlik puanı yok." |

## Alparslan için düzeltilmesi gerekenler (34B)
- `main.js` içindeki `ROUTE_PREFERENCES` tablosundaki `slopeWeight` / `distanceWeight` değerleri **maliyet modelinde yok** (`Bilinmeyen parametre`) ve worker bunları kullanmaz. Tercih farkı yalnız kimlikten gelir. Tabloyu sadeleştirip sadece `preference` kimliğini gönderin; gerçek ağırlıklar `route/route-compare.js` içindedir.
- Raporda (`stage34b-minimap-acceptance.md`) "costParams iletilir ve rota anında güncellenir" ifadesi worker düzeltmesinden önce doğru değildi; düzeltme sonrası gerçek veride (WB1→Roubion): shortest 730,505 m / 10,64°, balanced 730,505 m / 9,81°, flattest 732,161 m / 9,27°.
- Tercihe özgü ısı haritası yoktur (heatmap `balanced` alanıdır).
- `stage29-acceptance.md` kod/formül incelemesini anlatıyor; tarayıcıda gözlenmiş PASS/FAIL kaydı veya ekran görüntüsü yok. Zıplama/iniş animasyonu, güneş görünümü, galeri ve yakın-alan rota okunabilirliği için gerçek tarayıcı kabul kaydı hâlâ gerekli.
- `stage39-ortho-diagnosis.md` "Yazar: Efe" diyor; bu rapor Efe'nin değildir. Ayrıca "0,0 m projeksiyon sapması" aynı etiket ofsetlerinden hesaplandığı için bağımsız kayıt kanıtı değil, aritmetik tutarlılıktır; korelasyon tepesi zayıf (r≈0,40). Kaplamanın "±1,5 m, yarım-piksel kaya kontrolü doğrulanmamış" etiketiyle açık kalması makul.

## Sıradaki iş bölümü
- **Alparslan:** 32B (ayak izi render) → 33B (parlak rota şeridi) → 36B (Viking zemini) → 37B (ufuk) ; kabul turu (29A gerçek tarayıcı kanıtı) ve 30 (demo dondurma).
- **Efe (kuyruk):** 29B (no-data fixture ve testleri), 29C (ön uçuş kontrolü), 31A (kaynak/atıf derleyici), 31C (jüri sınır kartı), sonra 38A, 41A, 42A, 43A, 44A, 45A.
