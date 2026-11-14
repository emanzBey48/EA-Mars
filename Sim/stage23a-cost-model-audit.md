# Stage 23A — EVA yürünebilirlik maliyet modeli denetimi

Kod: `Sim/public/js/route/cost-model.js` · Test: `Sim/test/cost-model.test.mjs` (29 test). Puan bir **planlama göstergesidir**; güvenlik sertifikası, rover trafficability modeli veya kaya/blok tespiti değildir.

## Kaynaklar (aramada bulunan / bulunamayan)

| Bulgu | Kaynak | Kullanım | Durum |
|---|---|---|---|
| Mars yerçekimi 3.71 m/s² | NASA Planet Compare — https://solarsystem.nasa.gov/planet-compare/?intent=121 (proje `config.js` SOURCES listesinden) | `marsGravityMps2` (yalnız bilgi, hesaba girmez) | Değer proje kaynak listesinden alındı; bu modülde sayfa yeniden açılıp doğrulanmadı |
| Artemis EVA yolculukları için <20° eğim planlama değeri | Universe Today / phys.org (2023, ay güney kutbu yürüyüş rotaları) ve bir öğrenci sunumu — ikincil, URL kaydedilmedi | `maxSlopeDeg=20` için yalnız ipucu | doğrulanmadı (arama özeti) — birincil belge (NASA-STD-3001 / Artemis gereksinimi) açılmadı; **scenario** |
| Apollo 12: 10° eğimde yürüyüş sınırlı süre sürdürülebildi | Apollo Lunar Surface Journal anlatımı (arama özeti; sayfa URL'si kaydedilmedi) | `comfortableSlopeDeg=8` için yalnız ipucu | doğrulanmadı (arama özeti); **scenario** |
| Apollo 15/16 LRV sürüş eğimleri maks. 22.1° / 24.7° | NASA NTRS 20250011301 (LPSC 2026 özeti) — https://ntrs.nasa.gov/citations/20250011301 (kayıt numarasından türetilmiş adres, açılmadı) | KULLANILMADI — rover verisi, insan sınırı değildir | doğrulanmadı (arama özeti); kullanılmadı |
| Düşük g'de yürüyüş: tepe dikey kuvvet ve adım sıklığı azalır, enerji maliyeti 1 g'den düşük | Newman vd. (NASA Ames/MIT, 1990'lar yeraltı treadmill), URL yok | Eğim eşiği vermez | doğrulanmadı (arama özeti); eğim içermiyor |
| İnsan kısmi yerçekiminde sayısal azami yürüyüş eğimi | — | Alıntılanabilir sayı **bulunamadı** | Eşikler `scenario` kaldı |

Not: Gerçek WebFetch ile birincil belgeler açılmadı; yalnız arama özetlerine dayanılır. Atıf uydurulmadı.

## Model formülleri (3x3 pencere, h = cellSizeM)
- Eğim: `geo.horn3x3Gradient` (Horn 1981), yeniden yazılmadı.
- Pürüzlülük r: merkezden geçen Horn düzlemine göre 8 komşu artığının RMS'i (m). Rampada 0 (eğim iki kez sayılmaz). Hücre boyutuna bağlıdır.
- slopeFactor = 0 (s ≥ max), aksi `1 − d²`, `d = max(0,(tan s − tan c)/(tan m − tan c))`.
- roughFactor = `1/(1+(r/roughnessRefM)²)`; score = `round(100·slopeFactor·roughFactor)`.
- cost = `1 + costK·(1 − slopeFactor·roughFactor)^costP` (≥1); sert kısıt s ≥ max → TOO_STEEP, Infinity.
- Bilinmeyen: no-data (tam eşitlik `Math.fround`), sonlu olmayan/validMin–validMax dışı (INVALID), kapsam maskesi 0. 3x3 pencere ızgara dışına çıkıyor veya bilinmeyene değiyorsa EDGE_UNKNOWN (fail-closed). Hepsi cost=Infinity, score=0, slope/roughness=NaN.

## Parametreler
| Ad | Değer | Birim | Durum |
|---|---|---|---|
| maxSlopeDeg | 20 | deg | scenario |
| comfortableSlopeDeg | 8 | deg | scenario |
| roughnessRefM | 0.25 | m | scenario |
| costK | 9 | 1 | scenario (tasarım) |
| costP | 1.5 | 1 | scenario (tasarım) |
| marsGravityMps2 | 3.71 | m/s² | sourced (hesaba girmez) |

Geçersiz kılma: sayı veya `{value,...}`; sonlu/aralık/`comfortable < max` doğrulaması, aksi TypeError. Varsayılanlar derin dondurulmuştur.

## Bilinen sınırlamalar
- Yalnız ~1 m DTM ölçeğinde anlamlı; kaba DEM'de (10–500 m/px) kullanılmaz, yerel eğimi düşük gösterir.
- Pürüzlülük hücre boyutuna bağlı; kaya/blok, regolit taşıma gücü, kayma, jeoloji etkisi YOK.
- Yokuş aşağı/yukarı yön asimetrisi yok (23B segment kotundan hesaplayabilir). Eşikler kaynaksız, ayarlanabilir.
- Eşit eğim eşiğinde float32 yuvarlama sınırı birkaç 1e-6° oynatabilir.

## Ölçülen performans
1676×1135 (1.9 M hücre): ~390–450 ms (Node 26, sentetik arazi, düzeltme sonrası ölçüm); test sınırı CI gürültüsü için 10 s.

## Denetim düzeltmeleri
Test sayısı 18 → 29 (hepsi geçti). Genel sözleşme (alan adları, STATUS kodları, cost/score anlamı) değişmedi; yalnız `provenance.warnings` ve `explainCell().caveatTR/caveatEN` eklendi.
1. `coverageMask`: yalnız tam `1`/`true` kapsanmış sayılır; `false/null/NaN/undefined/2` → OUT_OF_COVERAGE. Dizi/typed array değilse veya uzunluk ≠ rows*cols ise TypeError. Değerler 0/1 olmalı.
2. No-data eşleşmesi hem ham `z === nd` hem `fround(z) === fround(nd)` ile yapılır (Float64 + -9999.1 durumu kapandı; 0xFF7FFFFB korunur).
3. noDataValue ve validMin/validMax verilmezse `provenance.warnings` içinde `NO_UNKNOWN_DATA_DECLARED` (TR/EN, dondurulmuş); fırlatılmaz. Çağıran sentinel/aralık bildirmelidir.
4. Verilen ama sonlu sayı olmayan (string, NaN, null, ±Infinity) validMin/validMax/noDataValue → TypeError; validMin > validMax → TypeError; `undefined` = verilmedi.
5. Aralık karşılaştırması `Math.fround(validMin/validMax)` ile yapılır.
6. Geçersiz kılmalar daima `scenario`, kaynak sabit "Kullanıcı geçersiz kılma (senaryo)"; açık `status:'sourced'` TypeError; kullanıcının `source` metni güvenilmeden `note` alanına "doğrulanmadı" ibaresiyle taşınır.
7. `marsGravityMps2` kaynak metnine URL ve "config.js'ten, bu modülde yeniden çekilmedi" notu eklendi (skoru etkilemez).
8. Kaynak tablosunda arama özetinden gelen satırlar "doğrulanmadı (arama özeti)" olarak yeniden etiketlendi; hiçbir satır birincil belgeye karşı doğrulanmış değil.
9. `roughnessRefM` kaynak metni: "Tasarım seçimi (scenario); kalibrasyon yok".
10. `explainCell` artık `caveatTR` + `caveatEN` döndürür (`caveat` = TR, uyumluluk için).
Testler: 6 yön düzlemi + gx/gy≠0 düzlem (dy işaret hatasını yakalar), cellSizeM=5 rampa, tohumlu rastgele değişmez testi (25 tohum, OK oranı > %30), monotonluk/sınır özellik testleri, bulgu 1–6 regresyonları; `assert.throws` artık tür + mesaj regex'i ister; tautolojik maliyet yeniden-hesabı özellik kontrolüyle değişti; performans sınırı 10 s.
Yapılmayanlar: mikro-tahsis optimizasyonu (bulgu 11) — gereksiz; ölçülen süre ~0.4 s.

## Açık işler
- 23B: `cost` per-metre çarpandır; kenar maliyeti = mesafe × ortalama(cost uçları), Infinity kenarı atla. Köşegen adımlarda iki hücre de OK olmalı; çapraz köşe kesmeyi 23B denetlesin.
- 23C: gerçek Jezero DTM'de eğim/pürüzlülük dağılımını raporla; eşikleri birincil kaynakla (NASA-STD-3001, Artemis EVA gereksinimleri) güncelle.
- 24: UI'da her parametrenin `status`/`source` etiketi ve "planlama göstergesi" metni gösterilsin; `explainCell()` kullanılsın.
