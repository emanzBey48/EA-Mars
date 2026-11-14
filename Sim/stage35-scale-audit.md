# Stage 35A — Dikey ölçek ve kabartma denetimi (Efe)

Dosyalar: `public/js/geo/relief-metrics.js` (saf), `scripts/relief-report.mjs` (CLI), `test/relief-metrics.test.mjs` (20 test), `test/scale-contract.test.mjs` (6 test). Komut: `node scripts/relief-report.mjs --minDepthM 0.5 --minProminenceM 0.5 [--out ozet.json]`.
Etiketler: DOĞRULANDI = bu oturumda ölçüldü/okundu (komut veya kod satırı belirtildi); OLASI = kanıt yok veya yorum.
Tarih: 2026-11-14.

## (a) Gerçek DTM ölçümleri (WB1 → Roubion pencere, 1676 × 1135 hücre, 1 m)

DOĞRULANDI (relief-report.mjs çıktısı; bağımsız yeniden hesap ile eşleşti, bkz. aşağı).

| Ölçüm | Değer | Not |
|---|---|---|
| Bilinen / bilinmeyen hücre | 1 902 260 / 0 | Pencerede no-data yok (dtm_subset.json `windowStats.noData = 0`) |
| Kot min / max | −2592,679 / −2547,837 m | |
| Kot P1 / P50 / P99 | −2590,051 / −2576,221 / −2558,464 m | tip-7 yüzdelik |
| Tam kot aralığı | 44,842 m | |
| P1–P99 aralığı | 31,587 m | |
| Eğim P50 / P90 / P99 / max | 3,11° / 7,54° / 13,54° / 35,77° | Horn 3×3; 1 896 642 hücre; 5 618 kenar hücre hesaplanmadı |
| En derin kapalı çukur | 7,98 m, alan 106 505 m², pencerenin global minimumu (x 16,6, y −533,7 m) | |
| 2.–5. çukur derinlik | 1,86 / 1,81 / 1,49 / 1,25 m | alanlar 3 053–7 686 m² |
| En belirgin tepe | 8,07 m (zirve −2557,6 m, geçit −2565,7 m), alan 50 820 m² | |
| 2.–5. tepe belirginlik | 4,43 / 3,77 / 3,35 / 3,30 m | |
| Kenara sızan havza | çukur 45, tepe 53 | listelenmez |

Eşik notu: 0,5 m (çukur ve tepe) bu raporda yalnız örnek senaryo parametresidir; kaynaklı eşik değildir.

## (b) 3× abartının etkisi (main.js:423 `verticalScale: 3`)

Dikey ölçek yalnız z'yi çarpar; x/y değişmez. Bu yüzden görünür yükseklikler ×3, eğimler `atan(3·tan s)` ile değişir.

| Özellik | 1× (gerçek) | 3× (şu anki görünüm) |
|---|---|---|
| Kot P1–P99 aralığı | 31,6 m | ≈ 94,8 m |
| Tam kot aralığı | 44,8 m | ≈ 134,5 m |
| En derin çukur | 7,98 m | ≈ 23,9 m |
| En belirgin tepe | 8,07 m | ≈ 24,2 m |
| Eğim P50 | 3,1° | ≈ 9,3° |
| Eğim P90 | 7,5° | ≈ 21,7° |
| Eğim P99 | 13,5° | ≈ 35,9° |
| Eğim max | 35,8° | ≈ 65,2° |

DOĞRULANDI: sayılar relief-summary.json'dan hesaplandı. OLASI: eğim sayıları yüzdelik sırasının korunduğu varsayımıyla yaklaşıktır (tip-7 ara değer ile dönüşüm tam değildir).

Yorum: 3× abartı, bu pencerede çukur ve tepeleri ve yamaçları olduğundan daha dik gösterir. En dik ölçülen hücre (35,8°) 3×'te yaklaşık 65° görünür.

## (c) Karakter ve kamera ölçü envanteri

Tüm değerler kodda tasarım sabitidir. Kaynaklı insan/kıyafet ölçüsü bulunamadı.

| Değer | Konum | Etiket |
|---|---|---|
| Göz yüksekliği 1,48 m | `view/3d/camera.js:9` `FIRST_PERSON_EYE_HEIGHT_M` | tasarım sabiti / senaryo parametresi |
| Kask merkezi z = 1,48 m, torso 0,44×0,34×0,58 m, kol/bacak/bot ölçüleri | `view/3d/astronaut-rig.js` `ASTRONAUT_RIG.parts` | tasarım sabiti (metadata: "not suit/body measurements") |
| Görsel adım 6 m | `astronaut-rig.js` `presentationStrideLengthM` | tasarım sabiti (metadata: "visual choice, NOT biomechanics") |
| Yürüyüş hızı 1,2 m/s, zıplama 2,4 m/s | `config.js` `SCENARIO` | senaryo parametresi |

Kaynak denemesi: NASA-STD-3001 Vol 2 (standards.nasa.gov ve nasa.gov adresleri) denendi; iki URL de HTTP 404 döndü. Bu oturumda antropometri veya kıyafet ölçüsü okunamadı → **kaynak bulunamadı**. Sayı uydurulmadı.

Doğrulanan kod gerçeği (DOĞRULANDI): aktif birinci şahıs yolunda kamera `setFirstPersonPose` varsayılan `verticalScale = 1` ile çalışır (`camera.js:164`), yani göz yüksekliği ölçeklenmez. `renderer.js:649` birinci şahısta rig ölçeğini 1 yapar.

## (d) Alparslan için 35B önerileri

1. **Üçüncü şahıs rig'i 3× uzuyor (DOĞRULANDI).** `renderer.js:649` `rigVerticalScale = firstPerson ? 1 : verticalScale`; `:661` gövde konumu ve `:673` uniform aynı ölçeği kullanır. Dünya modunda 1,48 m kask ≈ 4,44 m görünür. 35B ya rig ölçeğini 1 yapmalı ya da bu abartıyı etiketlemeli.
2. `main.js:423` `verticalScale: 3` sabit. 35B'de varsayılan 1, "görsel dikey abartı" anahtarı (1/2/3) önerilir. Mesh, tepe/çukur ve rota kılavuzu aynı `displayConfig`'ten beslenmeli.
3. 1× için: `terrain-mesh.js` sözleşmesi (verticalScale=1 → fark birebir) `scale-contract.test.mjs` ile kilitlendi; 35B bu testi bozmamalı.
4. Çukur/tepe görünürlüğü: 1× ile 0,5 m altındaki özellikler (P1–P99'un ~%3'ü) tarayıcıda zor okunabilir; 2×/3× seçeneği "abartılı" etiketiyle korunmalı (yol haritası 35B kuralı).

## Doğrulama

- `node --test test/relief-metrics.test.mjs test/scale-contract.test.mjs`: 26/26 geçti (ilk çalıştırmada 3 hata vardı: `slopeStats` çift normalizasyon ve `deepFreeze` alt nesneleri dondurmuyordu; ikisi de düzeltildi, testler gevşetilmedi).
- `node --test test/`: 300/300 geçti, 0 başarısız. Başlangıç referansı 268'di; yeni dosyalar 26 test ekler, kalan fark uzlaştırılmadı.
- Bağımsız yeniden hesap (scratchpad `relief-verify.mjs`, priority-flood yerine kenardan minimax Dijkstra, maximin ile tepeler; repo modülü kullanılmadı): kot yüzdelikleri, eğim P50/P90/P99/max ve kompte sayısı, 5 çukurun derinlik + alan, 5 tepenin belirginlik + alan — 34 karşılaştırmanın tamamı eşleşti (maks. fark 0).
- Veri: LFS işaretçisi değil; boyut 7 609 040 bayt, SHA-256 `fa12…79c9` doğrulandı.

## Açık noktalar

- Gerçek pencerede no-data yok; no-data davranışı yalnız sentetik testlerle kanıtlandı.
- Çukur ve tepe tanımı priority-flood tabanlı; "kaya/blok" tespiti iddiası yoktur (1 m DTM kayaları çözmez).
- 3× eğim sayıları yaklaşıktır (B bölümü).
- Kaynak eksikliği: (c) bölümündeki insan/kıyafet ölçüleri kaynaksızdır.
