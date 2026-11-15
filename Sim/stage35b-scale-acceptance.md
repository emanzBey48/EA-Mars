# Stage 35B — Dikey Ölçeği Gerçeğe Çekme, Dinamik Ölçek Seçici & UI Ölçek Kontrolleri Kabul Raporu (Alparslan)

- **Aşama:** Stage 35B — Dikey Ölçeği Gerçeğe Çekme, Dinamik Ölçek Seçici & UI Ölçek Kontrolleri Entegrasyonu
- **Sorumlu:** Alparslan (Entegrasyon Sahibi)
- **Tarih:** 2026-11-15
- **İlgili Dosyalar:**
  - `Sim/public/js/main.js`
  - `Sim/public/js/view/3d/renderer.js`
  - `Sim/public/js/view/hud.js`
  - `Sim/public/index.html`
  - `Sim/public/styles.css`
  - `yapay zeka icin/road map.md`
- **Referanslar:** Efe'nin Stage 35A denetim raporu (`Sim/stage35-scale-audit.md`), `scale-contract.test.mjs`, `relief-metrics.js`.

---

## 1. Amaç ve Kapsam

Stage 35A'da Efe tarafından yapılan jeodezik ve kabartma ölçümlerinde (`Sim/stage35-scale-audit.md`), Perseverance WB1 → Roubion penceresindeki gerçek HiRISE DTM kot aralığının P1–P99 diliminde 31,59 m, medyan yüzey eğiminin 3,11°, en derin kapalı çukurun 7,98 m ve en belirgin tepenin 8,07 m olduğu belirlenmiştir.

Önceki uygulamada `main.js:423` içinde dikey ölçek `verticalScale: 3` olarak sabitlenmişti. 3× abartı sunumu şu olumsuz etkilere yol açmaktaydı:
1. 8 m yüksekliğindeki tepe 24 m devasa bir tepe gibi görünmekte, en dik 35,8° yamaç 65,2° aşırı bir uçuruma dönüşmekteydi.
2. `renderer.js:649` içinde 3. şahıs / serbest dünya modunda astronot rig'i `rigVerticalScale = firstPerson ? 1 : verticalScale` formülüyle Z ekseninde 3 kat esnetilerek astronotun boyu 1,48 m yerine 4,44 m'ye uzamaktaydı.

Stage 35B kapsamında:
- Varsayılan dikey ölçek bilimsel 1:1 gerçek kot değerine (`verticalScale: 1`) çekildi.
- 3. şahıs dünya modunda astronot gövdesinin dikeyde esnemesi engellendi; giysi ve insan oranları daima 1:1 (`rigVerticalScale = 1.0`) tutuldu.
- Kullanıcıya görünüm araç çubuğunda 1× Gerçek Ölçek, 2× Görsel Abartı ve 3× Görsel Abartı arasında dinamik geçiş sağlayan şık bir dikey ölçek seçici (`#select-vertical-scale`) entegre edildi.
- HUD ve katman paneline bilimsel ölçek rozeti (`#scale-badge-container`) ve bilgilendirici notlar eklendi.
- Ölçek değiştiğinde arazinin yanı sıra jeoloji çizgileri, waypoint beacon'ları, MMGIS arşiv sürüş izi ve planlanan rota kılavuz şeridinin tek `displayConfig` üzerinden dinamik yeniden oluşturulması sağlandı.

---

## 2. Yapılan Değişiklikler ve Mimari Uygulama

### A. Üçüncü Şahıs Astronot Rig Z-Uzamasının Giderilmesi (`renderer.js`)
- `renderer.js` içinde astronot çizim bloğunda yer alan `const rigVerticalScale = firstPerson ? 1 : verticalScale;` satırı `const rigVerticalScale = 1;` olarak güncellendi.
- Kask, torso, kol, bacak ve bot kutu boyutları hem birinci şahıs view-model'de hem de üçüncü şahıs dünya sunumunda 1:1 oranında tutulur.
- Astronotun dünya Z kotu zemine oturtulurken `objectOffset = [player.xM, player.yM, (player.bodyWorldZM - referenceElevationM) * verticalScale]` formülü kullanılarak vücut oranları bozulmadan arazinin yükseltilmiş veya 1:1 Z kotuna temas etmesi sağlandı.
- `createTerrainRenderer` nesnesine harici `setTerrainMesh(newMesh)` metodu eklendi. `renderFrame` içinde `gl.uniform1f(locations.terrainExaggeration, terrainMesh.displayConfig.verticalScale)` shader uniform'u her karede arazinin anlık ölçeğine göre güneş ışığı gölgelendirmesini doğrular.

### B. UI Dikey Ölçek Seçici ve Rozet (`index.html`, `styles.css`)
- `index.html` dosyasında `.view-toolbar` içerisine `#select-vertical-scale` seçicisi ve `<label class="scale-selector-label">` etiketi yerleştirildi:
  - `1`: `1× Gerçek Ölçek (Bilimsel 1:1)` (varsayılan)
  - `2`: `2× Görsel Abartı (Sunum Parametresi)`
  - `3`: `3× Görsel Abartı (Eski Sunum Parametresi)`
- `#view-note` içinde daha önce statik olan `Dikey ölçek 3× sunum abartısıdır.` metni, dinamik olarak güncellenen `<span id="scale-indicator-text">` ile yapılandırıldı.
- `index.html` içindeki Katmanlar (`.card.archive`) bölümünün başına `<div id="scale-badge-container"></div>` rozet alanı eklendi.
- `styles.css` içine `.scale-selector-label`, `#select-vertical-scale`, `.scale-badge`, `.scale-real` ve `.scale-exaggerated` için koyu Mars temalı görsel stiller tanımlandı.

### C. HUD Bilimsel Ölçek Rozeti ve Provenance (`hud.js`)
- `createHud` içine `updateScaleBadge(verticalScale)` fonksiyonu eklendi ve `renderLayerPanel` ile entegre edildi:
  - 1× iken: `"Dikey ölçek: 1× Gerçek Mars Kotu (bilimsel 1:1 · DTM kot farkı birebir korunur)"` (yeşil temalı `.scale-real` rozeti).
  - 2× veya 3× iken: `"Dikey ölçek: ${scale}× Görsel Abartı (sunum parametresidir; gerçek arazi eğimi daha düzdür)"` (kehribar temalı `.scale-exaggerated` rozeti).
- HUD dönüş API'sine `{ renderLayerPanel, updateHud, updateScaleBadge }` dışa aktarımı sağlandı.

### D. Dinamik Ölçek Yönetimi ve Entegrasyon (`main.js`)
- Varsayılan `currentVerticalScale = 1` olarak tanımlandı.
- URL parametresi `?scale=1`, `?scale=2`, `?scale=3` desteği sağlandı (geçersiz veya boş ise varsayılan 1).
- `build3dTerrainOnce()` fonksiyonu `verticalScale: currentVerticalScale` ile ilk mesh'i oluşturur.
- `rebuildTerrainMeshForScale(newScale)` fonksiyonu:
  1. `currentVerticalScale = newScale` atamasını yapar.
  2. `buildTerrainMesh(layers.dtm, { referenceElevationM, verticalScale: newScale })` ile yeni mesh üretir.
  3. `renderer3d?.setTerrainMesh(terrainMesh)` ile GPU tamponlarını günceller.
  4. `geologyLinePositions = buildGeologyLinePositions()` ile jeoloji sınır çizgilerini yeni ölçeğe göre günceller.
  5. `build3dMarkersOnce()` ile 3D waypoint beacon geometrilerini yeni ölçeğe geçirir.
  6. `prepareArchiveDisplay()` ile MMGIS sürüş izini yeni ölçeğe uyarlar.
  7. `preparePlannedRouteGuide()` ile planlanan rota kılavuz şeridini yeni kot ölçeğiyle yeniler.
  8. `updateScaleUi()` ile `#scale-indicator-text`, `#select-vertical-scale` ve HUD rozetini senkronize eder.
- `window.marswalk.getDiagnostics()` çıktısına `verticalScale: currentVerticalScale` eklendi; ayrıca `window.marswalk.rebuildTerrainMeshForScale` ve `window.marswalk.setVerticalScale` metotları debug nesnesine bağlandı.

---

## 3. 1× (Gerçek) vs 3× (Abartı) Karşılaştırması

| Özellik | 1× Gerçek Ölçek (Varsayılan) | 3× Görsel Abartı (Sunum Parametresi) |
|---|---|---|
| Kot P1–P99 Aralığı | 31,59 m (birebir DTM farkı) | ≈ 94,76 m |
| Tam Kot Aralığı | 44,84 m | ≈ 134,53 m |
| En Derin Çukur | 7,98 m | ≈ 23,94 m |
| En Belirgin Tepe | 8,07 m | ≈ 24,21 m |
| Medyan Eğim | 3,11° | ≈ 9,3° |
| P90 Eğim | 7,54° | ≈ 21,7° |
| P99 Eğim | 13,54° | ≈ 35,9° |
| Maksimum Eğim | 35,77° | ≈ 65,2° |
| 3. Şahıs Astronot Boyu | 1,48 m kask seviyesi (1:1 gerçek oran) | 1,48 m kask seviyesi (1:1 gerçek oran — Stage 35B ile korundu) |
| Yüzey Aydınlatması | `uTerrainExaggeration = 1.0` (tam fiziksel yüzey normali) | `uTerrainExaggeration = 3.0` (abartıyı geri alarak gerçek güneş açısı) |

---

## 4. Kural ve Güvenlik/Feragat Uyumu

1. **Yasaklı Kelime Denetimi:**
   Metinlerde `/güvenli(?!k)|güvensiz|tehlike/i` regex kontrolü yapılmıştır. Yeni eklenen hiçbir metinde `"güvenli"`, `"güvensiz"` veya `"tehlike"` terimleri kullanılmamıştır.
2. **Kanonik Feragatler:**
   - `"Planlama göstergesi — güvenli rota sertifikası değildir."`
   - `"Kot ve eğim yalnız arşiv DTM’sinden türetilmiş değerlerdir; güvenli/güvensiz yorumu, tehlike skoru veya rover karar desteği değildir."`
   - `"Sürüş izi canlı telemetri veya güvenli rota bilgisi içermez."`
   feragatleri eksiksiz korunmuştur.
3. **Smoke Test Uyumluluğu:**
   `'Ortogörüntü kullanılamıyor'`, `'ortogörüntü değil'`, `'senaryo varsayımı'`, `'NASA operasyon sınırı değil'` etiketleri tam olarak yer almaktadır.
4. **Dosya Sınırları:**
   Efe'nin dosyalarına (`geo/relief-metrics.js`, `scripts/relief-report.mjs`, `test/relief-metrics.test.mjs`, `test/scale-contract.test.mjs`, `Sim/stage35-scale-audit.md`), kök dizindeki `.tif` ve `.crdownload` dosyalarına hiçbir şekilde dokunulmamıştır.

---

## 5. Sonuç

Stage 35B entegrasyonu başarıyla tamamlanmıştır. Marswalk 3D simülasyonu artık bilimsel 1:1 gerçek Mars topoğrafyası kotlarıyla başlamakta, kullanıcı dilediğinde eğitimsel/sunumsal amaçla 2× veya 3× abartıya anında geçebilmektedir. Üçüncü şahıs modunda astronot oranları bozulmadan daima 1:1 insan ölçüsünde kalmaktadır.
