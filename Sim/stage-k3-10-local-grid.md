# Stage K3-10: legacy DTM için koordinat köprüsünden düzenli yerel ızgara (saf yeniden örnekleme yardımcısı)

Kapsam: yalnız yeni dosyalar. `public/js/geo/local-grid.js` (saf modül), `test/local-grid.test.mjs` (sentetik girdi),
`scripts/local-grid-evidence.mjs` (gerçek veri kanıtı, CLI), bu rapor. Uygulama kodu (`main.js`, `registry.js`,
`render.js`, `layers.js`, `route-service.js` vb.) değiştirilmedi; entegrasyon Alparslan'a aittir. Git: yalnız
status/diff; commit ve push yapılmadı.

Etiketler: **DOĞRULANDI** = bağımsız yolla (proje modülü kullanılmadan) yeniden hesaplandı veya uygulamanın gerçek
kod yolundan ölçüldü. **OLASI** = akıl yürütme, sayısal olarak doğrulanmadı.

---

## 1. Yönetici özeti

| Konu | Sonuç | Etiket |
|---|---|---|
| Çerçeve kayması (WB1 / Roubion / doğu kenar) | Eski düzenli çerçevede 18,68 / 23,44 / 40,66 m. Yeni ızgarada planlayıcının değeri örneklendiği nokta ile **0,57 / 0,46 m** içinde (hücre merkezi ↔ nokta; en fazla yarım köşegen 0,71 m). | DOĞRULANDI |
| Planlayıcı hücresi = örnekleyici hücresi | WB1 ve Roubion'da **evet** (yeni). Eski çerçevede 18 ve 22 hücre kayık. | DOĞRULANDI |
| Roubion eğimi | Örnekleyici **3,821°**; yeni nearest planlayıcı **3,821°** (birebir); yeni bilinear **3,496°**; eski 8,590°. | DOĞRULANDI |
| Kot tutarlılığı (hücre merkezi) | WB1 fark −0,0012 m; Roubion −0,016 m (bilinear − örnekleyici). Global: bilinear medyan 0,012 m, **p95 0,057 m, maks 0,148 m** (eğimli hücrelerde). Nearest modu örnekleyiciyle **3600/3600 tam eşleşiyor**. | DOĞRULANDI |
| Hedef "bilinear fark < 0,05 m" | **Kısmen.** Medyan hedefte; p95 ve maks hedefin üstünde. Sebep: örnekleyici en yakın-hücre, bilinear yumuşatma; eğimli hücrede yarım hücre × eğim mertebesi. | DOĞRULANDI (sebep: OLASI, ağırlıklı) |
| Bilinear yumuşatma eğimi düşürür mü? | Evet, hafifçe: P99 13,68° → 13,43°, maks 36,04° → 35,32°; P50 değişmez (3,08 → 3,07). | DOĞRULANDI |
| Süre | Bilinear yeniden örnekleme 273–380 ms (1,95 milyon hücre); nearest 87–113 ms. Hedef ≲ 1–2 s karşılandı. | DOĞRULANDI |
| Rota (WB1 → Roubion) | En kısa: 14,10° → 9,87° (bilinear) / 11,69° (nearest). Dengeli: 9,77° → 9,69° / 9,77°. En düz: 731,09 m → 729,66 m (bilinear) / 730,50 m (nearest). Yeni değerler aşağıda tabloda. | DOĞRULANDI (ölçüm); nedensel sebep OLASI |
| Testler | Yeni 11/11 yeşil. Tam paket `node --test test/` **640/640, çıkış kodu 0** (başlangıç 612; 11 benim, kalanı diğer ajan/ön değişikliklerden). | DOĞRULANDI |

---

## 2. API (`public/js/geo/local-grid.js`)

```js
resampleToRegularLocalGrid({
  sampleElevation,        // (xM, yM) => { status, value }   uygulama örnekleyicisi (status 'ok' = sonlu değer)
  adapter,                // köprü: { localToCell(x,y) -> {row,col}, pixelToLocal(row,col) -> {x,y} }
                          //   (bilinear için zorunlu; uygulamada provider.adapter)
  bounds: { minXM, maxXM, minYM, maxYM },
  cellSizeM = 1,
  interpolation = 'bilinear' | 'nearest',
  noDataValue = -3,4028226551e38 (PDS MISSING_CONSTANT 0xFF7FFFFB, float32 kesin değer),
  validMin, validMax,     // isteğe bağlı; birlikte verilir, yalnız çıktıda geçer
}) -> frozen {
  schema: 'marswalk.local-grid.v1',
  elevation: Float32Array (satır-majör, satır 0 = kuzey),
  validMask: Uint8Array (1 geçerli, 0 bilinmiyor),
  rows, cols, cellSizeM, nwXM, nwYM, widthM, heightM, noDataValue, validMin?, validMax?,
  stats: { total, known, unknown },
  meta:  { schema, method: 'coordinate-bridge-resample', source: 'coordinate bridge', interpolation, ... }   (donmuş)
}
toDemWindowInput(result, { adapter? })  -> createDemWindow girdisi (elevation, rows, cols, cellSizeM, nwXM, nwYM,
                                           noDataValue, validMin?, validMax?, coverageMask = validMask, adapter?)
```

Tasarım notları:
- Hücre merkezi: `x = nwXM + (col+0.5)·cellSizeM`, `y = nwYM − (row+0.5)·cellSizeM`; `createDemWindow` ile aynı
  kural. Izgara `(minXM, maxYM)` köşesinden başlar; satır/sütun sayısı span/hücre'nin tavanıdır.
- No-data hiçbir zaman 0 değildir. Eksik hücre `noDataValue` (float32 kesin) ve `validMask = 0` ile işaretlenir.
- Bilinear: bir hücre yalnız dört komşu kaynak hücresinin **tamamı** geçerliyse geçerlidir. Eksik komşu, geçerli
  hücreyi kirletmez; hücre no-data kalır.
- Kaynak değerleri `sampleElevation` ile hücre merkezlerinde bir kez alınır ve önbelleğe konur (1,95 milyon hücrede
  yaklaşık 3 MB + 2 MB tampon). `adapter` yalnız konum eşlemesi içindir (`localToLatLon` gerekmez).
- Sayısal kapsam: bilinear, köşe hücre merkezleri arasında kalan noktaları interpolasyonla üretir; kaynak kapsam
  dışı kalan hücre no-data olur.

---

## 3. Testler

`node --test test/local-grid.test.mjs` → **11/11 yeşil** (yalnız sentetik girdi; gerçek veri dosyası yok).

| Test | Ne kanıtlar |
|---|---|
| Köprü anizotropik | E-W 1,0457 m ve N-S 1,0101 m (±0,002) — test senaryosu gerçekten anizotropik. |
| bilinear düzlem | Düzlemsel yüzeyde (z = 1000 + 0,05x − 0,03y) her geçerli hücre analitik değerle ≤ 1e-4 m. |
| nearest çerçeve | Örnekleyiciye giden her nokta, düzenli hücre merkeziyle **≤ 1e-6 m** aynı (çerçeve kayması yok). |
| no-data bloğu | Bloktan ≥ 3 hücre uzaktaki hücreler geçerli ve doğru; blok içi/yakını no-data deseni; sıfır sızıntısı yok. |
| sınır | Kaynak kapsamı 15 m taşan kutuda: geçerli hücreler kaynak merkezleri arasında; diğerleri no-data. |
| cellSizeM 1 ve 2 | Boyut, köşe (`nwXM/nwYM`), planar değer. |
| deterministik | Aynı girdi: bayt-bayt aynı `elevation`, `validMask`, `meta`. |
| donmuş | Sonuç, `meta`, `stats` donmuş; yazma `TypeError`. |
| status ok + NaN | Sonlu olmayan değer → bilinmiyor (0 değil). |
| hatalı girdi | Sampler yok, bounds geçersiz, cellSizeM ≤ 0, interpolation bilinmiyor, adapter yok (bilinear), NaN noData, yalnız validMin, validMax<validMin, sampler `undefined` döndürürse açık hata. |
| createDemWindow uyumu | `toDemWindowInput` → `createDemWindow` kabul eder; aynı hücre eşlemesi ve değer. |

Tam paket: `node --test test/` → 640/640, çıkış kodu 0, 42 s. Yeni test dosyası paket içinde yeşil.

---

## 4. Gerçek veri kanıtı

Komut: `node scripts/local-grid-evidence.mjs --json <scratchpad>\k3-10\local-grid-evidence.json` (çıkış 0, ~6 s toplam:
sağlayıcı yükleme + ham okuma + iki yeniden örnekleme + üç rota planlama). Sağlayıcı, uygulamanın kendi
`loadLegacyProvider()` yolundan gelir (`registry` → `GridElevationLayer`, köprü = `provider.adapter`).

**Kaynak kapsamı (kanonik yerel m):** x −523,84 … 656,75; y −1180,00 … 505,80.
**Yeni ızgara:** 1670 × 1170 hücre @ 1,00966 m. Geçerli 1 948 224 / 1 953 900 (%99,7). Eski düzenli pencere:
1669 × 1129 @ 1,00966 m, yani 1140 m; kaynak kapsamı ise ~1180 m. Eski çerçeve doğu kenarın son ~40 m'sini
kapsamıyordu (bkz. §5).

### 4.1 Uç noktalar

| Nokta | Örnekleyici kotu (hücre) | Yeni: planlayıcı hücresi, kot, merkez kayması | Eski: Δx / Δy (planlayıcı hücresi → köprü konumu) |
|---|---|---|---|
| WB1 (Sol 120) | −2569,435 m (6415, 3742) | (500, 518); −2569,436 m; \|merkez − nokta\| = 0,567 m; örnekleyici hücresiyle aynı: **evet** | 18,68 m / −0,20 m; hücre farkı (0, +18) |
| Roubion (Sol 164) | −2588,449 m (7083, 3870) | (1168, 650); −2588,465 m; 0,456 m; aynı: **evet** | 23,44 m / −0,47 m; hücre farkı (0, +22) |
| Doğu kenar (orta satır, son sütun) | — | yeni ızgara kaynak kapsamını tamamen kaplar | Δx **40,66 m** (kapsam kesilmesi ile birlikte) |

Kot farkı, yeni hücre merkezi − örnekleyici@merkez: WB1 −0,0012 m; Roubion −0,016 m (bilinear).

### 4.2 Eğim (planlayıcı Horn, derece)

| Nokta | Örnekleyici | Yeni bilinear | Yeni nearest | Eski |
|---|---|---|---|---|
| WB1 | 0,863 | 0,668 | **0,863** | 1,948 |
| Roubion | 3,821 | 3,496 | **3,821** | **8,590** |

Dağılım (planlayıcı Horn; P50 / P90 / P99 / maks, °; hesaplanan hücre sayısı):

| Izgara | P50 | P90 | P99 | maks |
|---|---|---|---|---|
| Eski düzenli | 3,15 | 7,74 | 13,78 | 36,04 |
| Yeni bilinear | 3,07 | 7,54 | 13,43 | 35,32 |
| Yeni nearest | 3,08 | 7,63 | 13,68 | 36,04 |

### 4.3 Kot tutarlılığı (her 23. hücre, n = 3600, geçerli ikili)

| Karşılaştırma | Medyan (m) | p95 (m) | Maks (m) | Tam eşleşme |
|---|---|---|---|---|
| Bilinear − örnekleyici (merkezde) | 0,0122 | 0,0574 | 0,1482 | — |
| Nearest − örnekleyici (merkezde) | 0,000000 | 0,000000 | 0,000000 | 3600/3600 |

### 4.4 WB1 → Roubion üç tercih (uzunluk m | planlayıcı maks eğim ° | min puan | >5° payı %)

| Tercih | Eski düzenli (mevcut UI değeri) | Yeni bilinear | Yeni nearest | Belge (eski) |
|---|---|---|---|---|
| En kısa | 729,660 \| 14,10 \| 100,0 \| 49,1 | 729,660 \| **9,87** \| 100,0 \| 40,7 | 729,660 \| 11,69 \| 100,0 \| 41,3 | 729,66 \| 14,1 |
| Dengeli | 729,660 \| 9,77 \| 98,0 \| 48,4 | 729,660 \| 9,69 \| 98,0 \| 42,4 | 729,660 \| 9,77 \| 98,0 \| 43,4 | 729,66 \| 9,77 |
| En düz | 731,088 \| 10,11 \| 85,0 \| 27,2 | 729,660 \| 9,34 \| 89,0 \| 21,5 | 730,496 \| 9,54 \| 89,0 \| 22,4 | 731,088 \| 10,11 |

Yorum (DOĞRULANDI ölçüm; sebep OLASI): en kısa tercihin 14,10° tepe değeri eski çerçevede tek hücrede çıkıyor;
yeni ızgarada aynı rota 9,87° (bilinear) / 11,69° (nearest). Tek hücre maksimumları hassastır; bu fark çerçeve
kaymasına bağlanabilir, ama ayrı bir tek-hücre incelemesi yapılmadı. En düz tercihte rota değişiyor (731 → 730/729 m).

---

## 5. Bağımsız doğrulama (proje modülü yok)

Betik: `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\k3-10\independent-check.mjs`
(yalnız ham f32, etiket sabitleri ve elle yazılmış eşdikdörtgen formülleri; `Sim/public/js` ve `Sim/scripts` içe
aktarılmadı; çıktı: aynı klasörde ilgili JSON'dan okunan değerler).

| Büyüklük | Bağımsız | Uygulama / modül | Fark |
|---|---|---|---|
| E-W / N-S hücre aralığı (m) | 1,04570 / 1,01006 | 1,0457 / 1,0101 | eşleşir |
| WB1 örnekleyici kotu (m) | −2569,43457 | −2569,435 | f32 gösterimi |
| Roubion örnekleyici kotu (m) | −2588,44873 | −2588,449 | f32 gösterimi |
| Yeni WB1 hücre kotu, bilinear (m) | −2569,43587 | −2569,43579 | 8e-5 (f32 depolama) |
| Yeni Roubion hücre kotu, bilinear (m) | −2588,46484 | −2588,46484 | 8e-6 |
| Yeni Roubion eğimi (°) | 3,4976 | 3,4957 | 0,0019 (f32 gürültüsü) |
| Yeni WB1 eğimi (°) | 0,66885 | 0,66806 | 0,0008 |
| Eski çerçeve Δx WB1 / Roubion / doğu kenar (m) | 18,683 / 23,439 / 40,663 | 18,68 / 23,44 / 40,66 | eşleşir |
| Kaynak sınırı NW (m) | −523,32 (merkez) | −523,84 (hücre kenarı) | 0,52 m = yarım hücre; beklenen, hata değil |

---

## 6. Süre

| Adım | Süre |
|---|---|
| Bilinear yeniden örnekleme (1,95 milyon hücre) | 273–380 ms |
| Nearest yeniden örnekleme | 87–113 ms |
| Üç rota planlama (eski, yeni bilinear, yeni nearest) | ~3,1–3,5 s |
| Betiğin toplam süresi (sağlayıcı yükleme ve ham okuma dahil) | ~6,1–6,3 s |

Yeniden örnekleme hedefi (≲ 1–2 s) karşılandı.

---

## 7. Yöntem sınırları

1. **Bilinear ↔ nearest sampler uyuşmazlığı (ölçüldü).** Örnekleyici (3D, sim, ayak izi, şerit) en yakın hücre
   kullanır. Bilinear ızgara eğimli hücrelerde en fazla 0,15 m (p95 0,057 m) sapar. Nearest modu örnekleyiciyle
   tam eşleşir, ama yalnız hücre merkezlerinde; merkez dışı noktada fark yine eğim × ofset mertebesindedir.
   **Karar Alparslan'ındır:** (a) nearest: 3D/sim ile sayısal eşleşme; (b) bilinear: basamaklanmayı azaltır ve
   eğimi hafifçe düşürür (P99 −0,25°, maks −0,72°).
2. **Eğim hâlâ tek hücre aralığıyla hesaplanır.** Yeni ızgara kendi içinde gerçekten düzenli (her iki eksende
   1,00966 m) olduğu için planlayıcı tarafında bu sorun kalkar. Örnekleyicinin `GridElevationLayer.sampleSlope`
   fonksiyonu ise köprü kafesinde hâlâ `grid.scale` (isotropik) kullanır; kaynak E-W aralığı 1,0457 m. Bu, K3-8
   sorun 3'ün örnekleyici tarafıdır ve bu yardımcı tarafından değiştirilmedi (OLASI küçük yanlılık, ~%3,5 E-W
   gradyanı; ölçülmedi).
3. **Kenar kaybı.** Bilinear için dört komşu gerekli: kaynak kapsamının ~5 676 hücresi (%0,3) no-data. Nearest
   için 1 670 hücre.
4. **Düzlem-dışı doğrulama.** Testler düzlemsel yüzeyle çalışır; gerçek veri yalnız evidence betiğinde.
5. **`regional-dem.js` `resampleToLocalGrid` bu iş için uygun değil.** Yol haritasındaki öneri (K3-10, "bu iş için
   kullanılabilir") doğru değil: fonksiyon `createRegionalGrid` ile üretilmiş lat/lon düzenli bir gridde
   `sampleBilinear(grid, lonDeg, latDeg)` kullanır; PDS köprüsü (`provider.adapter`) ile çalışmaz. Bu yardımcı
   gerekçesiyle yazıldı.

---

## 8. Alparslan için entegrasyon adımları (kod yazılmadı; yalnız öneri)

Dosya:satır değerleri bu worktree'den (`143a0be`) alınmıştır.

1. **Yeniden örnekleme (legacy yolunda, yalnız legacy için).** `main.js:1899` civarı, `terrain = buildTerrainImage(layers.dtm)`
   çağrısından önce: sınırı `layers.dtm.adapter.pixelToLocal` ile hesapla (evidence betiğindeki `bounds` ile
   aynı: pencere kenarı `row0 − 0.5`, `col0 − 0.5` ve karşı köşe), sonra
   `resampleToRegularLocalGrid({ sampleElevation: (x,y)=>layers.dtm.sampleElevation(x,y), adapter: layers.dtm.adapter,
   bounds, cellSizeM: layers.dtm.cellSizeM, interpolation: 'bilinear'|'nearest', validMin: layers.dtm.validMin,
   validMax: layers.dtm.validMax })`. USGS yolu değişmez (K3-7 kararına bağlı, aşağıda).
2. **Planlayıcı penceresi.** `main.js:813-817` (`initializeRouteWorker`): `elevation`, `rows`, `cols`, `cellSizeM`,
   `nwXM`, `nwYM`, `noDataValue` alanlarını yeni sonuçtan verin; `main.js:809` `new Float32Array(layers.dtm.values)`
   ve `main.js:823` transfer listesi (`[values.buffer]`) yeni `elevation.buffer` olmalı. Worker tarafında
   `createDemWindow` çağrısı aynı alanları kullanır (`route/pathfinder.worker.js` doğrulanmalı; bu incelemede
   okunmadı).
3. **Minimap terrain.** `view/render.js:15-82` (`buildTerrainImage(layer)`): şu an `rowOffset/colOffset`, `cellState`,
   `cellGradient` ve `layer.adapter.pixelToLocal` ile okuyor (satır 16, 25, 59, 75). Yeni bir yol gerekir:
   `buildTerrainImageFromGrid(grid)` (aynı görsel mantık: Horn, renk; **sampling yok**, yalnız `grid.elevation` ve
   `validMask`); bounds `{nwXM: grid.nwXM, nwYM: grid.nwYM, widthM: grid.widthM, heightM: grid.heightM}`. Eski
   fonksiyon USGS yolu için kalır.
4. **Isı haritası ve `explainCell`.** `minimap.js:199-211` heatmap ızgarasını `nwXM/cellSizeM` ile düzenli okur;
   heatmap worker'dan geliyor (`main.js:705`). Adım 2 uygulanınca otomatik tutarlı olur. `route-service.js:463`
   `explainLocal` aynı pencereyi kullanır.
5. **3D ve sim örnekleyici DEĞİŞMEZ.** `layers.dtm.sampleElevation` (`main.js:1054, 1136, 1246, 1949`) ve
   `terrain-mesh.js:79` (`adapter.pixelToLocal`) zaten köprüyü kullanır. Yeni ızgara ile 3D arasındaki kalan fark
   §7.1'deki bilinear/nearest sapmasıdır.
6. **Geriye dönük uyum.** `registry.js:849-898` legacy girişi ve `registry.js:22-36` köprü değişmez. Yeni yardımcı
   yalnız çağrılırsa devreye girer; USGS (`registry.js` `hirise-jezero-dtm`) yoluna dokunmaz.
7. **Test/smoke etkisi.** Mevcut testlerde legacy rota sayısı sabit değildir (`grep 729|14.10|9.77` yalnız
   `local-grid.test.mjs`'te; `legacy-analysis.test.mjs` yalnız düzenli çerçeve merkez formülünü test eder).
   `smoke-e2e.mjs` UI metinlerini ve rota sayılarını nasıl beklediği okunmadı; Alparslan entegrasyonda
   çalıştırmalı (talimat gereği bu görevde çalıştırılmadı).
8. **Kapsam etiketi (K3-10 sorun 2).** `coverage.localBoundsM` legacy düzlemindedir (yukarıda §4 kapsam). Yeni
   ızgaranın kapsamı kanonik düzlemdedir; etiket buna göre güncellenmeli veya kapsam bu yeni ızgaradan okunmalı.

---

## 9. K3-7 ile ilişki

- K3-7 (aktif arazi kararı) USGS 1 m adayını etkinleştirirse, USGS yolu zaten kanonik düzlemde düzenlidir
  (`MAP_FRAME` mapScaleM = 1,0; pixel → yerel metre eşit aralıklı). Bu durumda bu yardımcı **gereksiz** kalır;
  K3-10 yalnız legacy DTM için geçerlidir.
- K3-7 legacy'yi aktif tutarsa (seçenek a), bu yardımcı gereklidir. Alparslan'ın kararı önce K3-7'den gelmelidir.
- USGS yolundaki 1/cos(enlem) ölçek sorunu (K3-8 sorun 3) bu yardımcıyla ilgili değildir; ayrıca ele alınmalıdır.

---

## 10. Çalıştırılmayanlar ve sınırlar

- Tarayıcı, smoke (`npm run smoke` / `smoke-e2e.mjs`) ve UI testi çalıştırılmadı (talimat gereği).
- Uygulama kodu, veri ve mevcut testler değiştirilmedi; yalnız dört yeni dosya eklendi.
- Git commit/push yapılmadı (talimat gereği).
- Worker (`route/pathfinder.worker.js`) ve `route-compare.js` içinde yeni pencere alanlarıyla uyum okunmadı.
- USGS yolu için karşılaştırma yapılmadı (K3-7 kararı bekliyor).
- Kaynak PDS etiketindeki yarım-piksel kayıt belirsizliği (K3-8 sorun 6) bu raporda değerlendirilmedi.
