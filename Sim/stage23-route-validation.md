# Stage 23C — Gerçek veriyle rota planlayıcı doğrulaması

Betik: `Sim/scripts/validate-route-planner.mjs` (`node scripts/validate-route-planner.mjs [--out özet.json] [--synthetic]`; repoya yazmaz). Köprü: `route/route-service.js` (23D). Etiketler: DOĞRULANDI = betik çıktısında görüldü; OLASI = yorum.

## Uyarılar (önce okuyun)
- Puan bir **planlama göstergesidir**; güvenlik sertifikası değildir. Bu rapor planlayıcının rover izinden "daha iyi/güvenli" olduğunu **iddia etmez**; yalnız ölçüm verir. Rover izi insan rotası değildir; rover limitleri insan limiti değildir.
- Eşikler (maxSlope 20°, comfortable 8°, roughnessRef 0.25 m, costK/P) birincil kaynaksız **senaryo** parametreleridir.
- 1 m DTM tek tek kayaları çözmez; kaya/blok tespiti yoktur. Pürüzlülük 3x3 plan-artığı RMS'tir.
- USGS DTM'nin düşey datumu uygulamada `needs_review` kabul edilir. Not (tutarsızlık, DOĞRULANDI): `config.js` MAP_FRAME `verticalDatumVerified: true` yazar, `dtm_subset.json` etiketi `verticalDatum: null, verticalDatumVerified: false` der. Rota yalnız yerel eğimle ilgilidir, mutlak kot iddiası yoktur.
- Yerel düzlem eş-dikdörtgen: doğu-batı uzaklıklar ~%5,4 şişkin (geo.js notu); kuzey-güney doğru ölçek. Uzunluklar yerel düzlem metresidir (20A'nın bildirdiği 885,5 m arşiv uzunluğu ile 896,5 m farkı bundan OLASI).

## Veri (DOĞRULANDI)
- Kaynak: `Sim/data/dtm_subset.f32` (Git LFS, TIFF'ten türetilmiş pencere; 1,8 GB TIFF bu ortamda yok, okunmadı). SHA-256 `fa1265290add466c7d68af1cfdb0aefbf9a49a35b710ab0fc6543d6f7ce379c9` = LFS işaretçisi (eşleşti). Pencere satır 13147, sütun 12923, 1676×1135 = 1.902.260 hücre, 1 m.
- No-data hücre: **0**; geçerli kot aralığı −2592,68 … −2547,84 m. Durumlar: OK 1.894.952; TOO_STEEP 1.690 (%0,09); EDGE_UNKNOWN 5.618 (pencere kenarı). Eğim P50 3,11°, P90 7,54°, P99 13,54°, maks 35,77°.
- Kapsam: arşiv izi 478 nokta, **0 nokta pencere dışında**; iz en yakın pencere kenarına 437 m uzakta; WB1 ve Roubion pencere içinde.

## WB1 → Roubion (varsayılan parametreler; hücre merkezleri, 1 m)
| | Uzunluk (m) | Eğim P50/P90/maks (°) | En düşük puan | TOO_STEEP / bilinmeyen hücre |
|---|---|---|---|---|
| Planlanan | 730,5 | 4,05 / 7,27 / 9,81 | 98 | 0 / 0 |
| Düz hat | 687,3 | 4,06 / 7,97 / 18,41 | 25 | 0 / 0 |
| Arşiv Perseverance izi | 896,5 | 2,59 / 6,02 / 10,68 | 93 | 0 / 0 |

Not: eğim/puan değerleri yolun dokunduğu benzersiz hücreler üzerinden (0,25 m örnekleme) hesaplandı. Düz hattın puan 25 olan hücresi 18,41° eğimlidir (eşik altı, bu yüzden TOO_STEEP değil).

| Karşılaştırma | Ort. sapma (m) | Maks sapma (m) |
|---|---|---|
| Planlanan → arşiv (P90 104 m) | 54,8 | 121,9 |
| Arşiv → planlanan | 52,8 | 114,9 |
| Planlanan → düz hat | 13,6 | 32,9 |
| Arşiv → düz hat (20A: 106 m maks) | 59,0 | 106,4 |

Planlanan rota düz hatta yakın kalıp 43 m (%6) uzar; yalnız eğimli kısımdan kaçınır (düz hattın maks 18,4° → planlananın maks 9,8°). Arşiv izi %30 daha uzundur ve planlananla ~55 m ortalama ayrılır; rover'ın gerçek kısıtları (kaya, kum, sürüş operasyon kuralları) modelde yoktur, bu yüzden ayrışma "model/senaryo eşiği ile rover pratiği" farkı olarak okunmalıdır, hata veya üstünlük olarak değil. Arşiv izi de hiçbir TOO_STEEP hücreye girmedi (maks 10,68°).

## Duyarlılık (WB1 → Roubion)
| maxSlope° | comfortable° | Uzunluk (m) | En düşük puan | Düz hatta TOO_STEEP | Pencerede TOO_STEEP % |
|---|---|---|---|---|---|
| 15 | 5 / 8 / 12 | 733,0 / 730,5 / 730,5 | 82 / 93 / 99 | 11 | 0,58 |
| 20 | 5 / 8 / 12 | 730,5 / 730,5 / 730,5 | 90 / 98 / 99 | 0 | 0,09 |
| 25 | 5 / 8 / 12 | 730,5 / 730,5 / 730,5 | 95 / 98 / 99 | 0 | 0,01 |

Yorum (DOĞRULANDI, bu pencere ve bu çift için): rota uzunluğu eşiklere neredeyse duyarsız (730,5 m; yalnız 15°/5°'de 733,0 m); asıl değişen en düşük puandır (comfortable eşiği düştükçe puan düşer). 15° eşiğinde düz hat 11 TOO_STEEP hücreden geçer ama planlanan rota aynı kalır. Genellenmesi OLASI değildir; tek çift.

## Rastgele çiftler (tohum 20261114, 150–600 m)
5 çiftin 5'i başarılı (başarı oranı 1,0). Uzunluk/düz hat oranları 1,02–1,08 (ort. 1,05); en düşük puan 95–99; düz hatta TOO_STEEP 0. Planlama süresi 15–29 ms (ort. 18,8 ms). Çiftler yalnız geçilebilir hücreler arasından seçildi (15 denemede 5 çift); bu dar örnek genel başarı oranı kanıtı değildir.

## Süre (Node 26, bu makine, tek koşu)
Maliyet alanı (1,9 M hücre) 272 ms; ana rota 41 ms (43.790 genişletme, tam optimal A*); duyarlılık koşuları (alan yeniden kurma dahil) 286–420 ms.

## Bulgular / boşluklar
- Eğimli (>20°) hücreler pencerenin yalnız %0,09'u; bu bölgede 20° eşiği rotayı neredeyse hiç kısıtlamıyor. Bu yüzden planlanan rota düz hatta çok yakın; eşiğin ayırt ediciliği Jezero koridorunda düşük (OLASI: daha engebeli bölgede farklı).
- Rota hücre merkezlerinden geçer (kullanıcı noktası hücreye oturtulur); `snapOffsetM` raporlanır.
- `--synthetic` modu yalnız boru hattı kendi kendine denetimidir; gerçek veri değildir.
