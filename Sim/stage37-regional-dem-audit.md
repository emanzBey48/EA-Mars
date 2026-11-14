# Stage 37A: Bölgesel MOLA kot ızgarası, yerel DTM karşılaştırması ve enlem konvansiyonu (Efe)

Etiketler: **DOĞRULANDI** = kayıtlı ham kanıt (scratchpad `trek\evidence\` veya bu turda indirilen dosya) ile ölçüldü; **ÖLÇÜLDÜ** = bu turdaki hesap; **VARSAYIM** = ölçülmedi, etiketli. Datum sonucu her koşulda `needs_review`.

## 1. Dosyalar

| Dosya | Rol |
|---|---|
| `Sim/public/js/geo/trek-raster.js` | SAF. `parseExportedTiff(bytes)`: ImageServer exportImage GeoTIFF'i. Ağ/dosya yok. |
| `Sim/public/js/geo/regional-dem.js` | SAF. Örnekleme (`sampleBilinear`, `sampleNearest`), yerel metre düzlemine yeniden örnekleme, `compareToLocalDtm`, `latitudeConventionExperiment`, `planetocentricToGeodeticDeg`. |
| `Sim/scripts/fetch-regional-dem.mjs` | CLI. Mod 1 (varsayılan): ağ → `data/regional-dem/`. Mod 2 `--compare`: yerel dosyalar, ağ yok, JSON stdout. |
| `Sim/test/trek-raster.test.mjs` | 14 test (sentetik TIFF; S16/F32, strip/tile, BE, no-data, hata durumları). |
| `Sim/test/regional-dem.test.mjs` | 16 test (örnekleme, yeniden örnekleme, sabit ofset, boş örtüşme, enlem deneyi H1/H2). |
| `Sim/data/regional-dem/mola-jezero.f32` | 589.824 bayt. Float32 LE, 384×384, satır-majör, satır 0 = kuzey. |
| `Sim/data/regional-dem/mola-jezero.json` | 6.997 bayt. Kaynak URL kalıbı, erişim zamanı, sha256, sayaçlar, `needs_review`. |

Toplam çıktı ≈ 0,6 MB (sınır 3 MB). Değiştirilmedi: `main.js`, `config.js`, `view/`, `surface/`, `simulation/`, `route/`, mevcut `geo/` dosyaları, `.gitignore`. `geo/geo.js` ve `geo/trek-tiles.js` yalnız içe aktarıldı.

## 2. Ayrıştırıcı: gerçek yanıtın biçimi (DOĞRULANDI)

26A kanıtları (`export-mola.tiff`, `export-gale.tiff`) ve bu turdaki indirme **klasik TIFF (magic 42), tek IFD, tek bant, sıkıştırmasız, karolu (tiled)** çıktı. Görev metnindeki "şeritli" varsayımı yanlış çıktı; ayrıştırıcı karolu ve şeritli düzenlerin ikisini de destekliyor (yalnız gerçekte gelen sıkıştırmasız biçimler kabul edilir).

- MOLA export (S16): 128×128, `TileWidth=128`, tek karo, `Compression=1`, `SampleFormat=2`, `GDAL_NODATA` etiketi **yok**.
- Gale export (F32): 100×100 görüntü, 128×128 dolgulu karo; `GDAL_NODATA=-9999` (istekteki `noData` parametresinden).
- GeoKeys (her iki dosyada): `GTRasterType=1` (PixelIsArea), `GeographicType=32767` (kullanıcı tanımlı), `GeogAngularUnits=9102`, **`GeogSemiMajorAxis=3396190`, `GeogInvFlattening=169.8944472236118`**. ESRI metni: `GEOGCS["GCS_Mars_2000", ... SPHEROID["Mars_2000_IAU_IAG",3396190.0,169.8944472236118]]`. 26A'da "OLASI" olan 1/f sayısı artık dosyadan okundu. Bu, grid enleminin GeoTIFF'e göre elipsoidal (jeodetik) olduğunu bildirir; ancak bu **iddia**dır, indeksin gerçekte hangi enlem olduğu aşağıdaki ölçümle sınanır.
- Ayrıştırıcının 26A kanıtlarındaki değerleri: Gale ilk iki piksel −4503,2583 / −4503,3296 (26A kaydıyla birebir); MOLA −2716…−1465 (26A ile birebir).
- Karo kenarı dolgusu ve sınır dışı alanlar okunmaz; sıfır dolgu yok.

## 3. MOLA indirmesi (ÖLÇÜLDÜ)

Komut: `node scripts/fetch-regional-dem.mjs --lon 77.449 --lat 18.439 --halfDeg 1.5 --out data/regional-dem`

- Pencere: 75,949–78,949 °D × 16,939–19,939 °K; 384×384; piksel 0,0078125° (≈463 m N–G; ≈463 m D–B, projenin düzleminde).
- İstekler (bu CLI çalıştırması): metadata 1.989 B / 659 ms; exportImage 295.828 B / 1.449 ms (`image/tiff`); identify 213 B / 212 ms. Toplam 3 istek, 298.030 B, 2,8 s. Aralar ≥1,1 s.
- TIFF sha256: `41367561d362c4cc150d97cda58fdc5ef200c8500b356258d4f41c015a109f7c` (ham dosya kaydedilmedi; yalnız özet).
- Değerler: min −3777 m, max +199 m, ortalama −2124,18 m. Geçerli hücre 147.456/147.456; no-data sayısı 0 (etiket yok, hiçbir değer no-data sayılmadı); sıfır değerli hücre 2 (0 olarak bırakıldı).
- ImageServer metadata: `copyrightText` boş, lisans alanı yok → `license: belirtilmemiş`.
- Tutarlılık: bu pencerenin 77,0–77,9 °D / 18,0–18,9 °K alt kümesindeki 13.225 hücrede min −2716, max −1465; 26A export aralığıyla aynı.

### identify ve bizim ızgara (ÖLÇÜLDÜ)
- 77,45 °D / 18,43 °K: servis −2574; en yakın hücremiz −2582 (fark −8 m); bilinear −2577,6.
- Açıklama: exportImage, native grid (0,0078122°, −180 kökenli) ile hizalanmamış 384 piksellik bir ızgara üretiyor (NearestNeighbor yeniden örnekleme). Servisin değeri (−2574) bizim 5×5 komşuluğumuzda tam bir hücre batıda bulunuyor. Fark bir hücrelik kaymadan kaynaklanır, bozulma değil.

## 4. Bağımsız doğrulama (scratchpad betiği, modül kullanılmadı)

Betik `mola-jezero.f32`'yi doğrudan okur, DTM'i `dtm_subset.f32` ve JSON koordinatlarıyla çözer ve iki noktada `identify` sorgular (toplam 4 istek; ilk 2 istek bir önceki koşumdan önbelleğe alındı).

| Nokta | identify | MOLA en yakın | MOLA bilinear | DTM (1 m) | MOLA(bilinear) − DTM | MOLA(en yakın) − identify |
|---|---|---|---|---|---|---|
| WB1 (Sol 120) 18,43906919 / 77,44940206 | −2570 | −2572 | −2571,8 | −2568,0872 | **−3,73 m** | −2 m |
| Roubion (Sol 164) 18,42769340 / 77,45165066 | −2574 | −2582 | −2580,5 | −2584,9160 | **+4,41 m** | −8 m |

- DTM değerleri bağımsız hesapla JSON'daki (`waypointCells` ve `transformControls`) değerlerle **birebir** eşleşti (−2568,0872, −2584,9160). Roubion hücresi (14322, 13557) geo.js konvansiyonuyla (tam sayı = hücre merkezi) tutarlı.
- Bu iki noktadaki artıklar, pencere genelindeki MOLA−DTM std'si (4,3 m) ile uyumludur.
- Bağımsız betik ilk turda iki hata yaptı (DTM sütun işareti; kenar-tabanlı hücre seçimi). İkisi de düzeltildi; sonuçlar yukarıdaki tablodur.

## 5. Yerel DTM karşılaştırması (ÖLÇÜLDÜ)

Yerel DTM: `Sim/data/dtm_subset.f32` (1135 sütun × 1676 satır, 1 m, planetosentrik). Pencere: x −500,9…634,1 m; y −1175,2…500,8 m (origin WB1). **Roadmap'teki "1,3×1,1 km" yanlıştır; ölçülen pencere 1,135 × 1,676 km ≈ 2,5 × 3,6 MOLA hücresi.** Stride 10 m → 18.984 nokta; no-data 0.

**Ana sonuç (MOLA − DTM):**

| Hipotez | n | ortalama | medyan | std | p5 | p95 |
|---|---|---|---|---|---|---|
| H1: Trek enlemi = planetosentrik (projenin konvansiyonu) | 18.984 | **+0,17 m** | +0,04 | **4,27** | −6,55 | +6,71 |
| H2: Trek enlemi = jeodetik (dosyanın 1/f'i) | 18.984 | +130,87 m | +135,35 | 16,20 | +101,2 | +152,3 |

- H2 − H1 (aynı nokta): ortalama +130,7 m, std 17,3 m.
- Merkez (18,43338 °K planetosentrik): jeodetik karşılığı 18,63727 °K; **Δ = 0,20389° = 12,085 km kuzey**. MOLA N-G eğimi merkezde 8,92 m/km; tahmini kayma 107,8 m; ölçülen ortalama 130,7 m (eğim pencere içinde değişiyor).

**Yorum (sınırlı):**
1. H1 belirgin daha iyi uyuyor: ortalama artık 0,17 m (H2: +131 m), std 4,3 m (H2: 16,2 m). Bu, bu turda enlem konvansiyonu hakkında elde edilen en güçlü ölçüm kanıtıdır.
2. **Bağımsız bir doğrulama değildir**: (a) yerel DTM'in `verticalDatum` alanı `null`, `verticalDatumVerified=false`; (b) DTM adı `MOLAtopography_DeltaGeoid`: düşük frekanslı içeriği MOLA kotlarından türetilmiştir, dolayısıyla H1 uyumu kısmen üretim sürecinden gelebilir; (c) pencere yalnız ~2,5 × 3,6 MOLA hücresi kapsar, 18.984 nokta birbiriyle yüksek korelasyonlu; etkin örnek sayısı küçüktür.
3. **Ayırt edicilik (ÖLÇÜLDÜ):** Bu bölgede H1/H2 farkı ~12 km kuzey kaymasına, yani ~108–131 m kot farkına denk geliyor; artık std'si (4,3 m) bunun çok altında. Yöntem bu sahada **ayırt edici**. Ancak mutlak ofset, düşey datum doğrulanmadan bir enlem konvansiyonuna atfedilemez. Şekil eşiği (0,5 m, varsayım, raporda sabit) aşıldığından `shapeDiscriminable=true`; ama `verdict` yine `needs_review`.
4. Sentetik testler deneyin iki yönde de doğru çalıştığını gösterir: doğrusal alanda "ayırt edilemedi (şekil)", eğri alanda H1'i seçer.

**Datum durumu: `needs_review`.** H1 yönünde güçlü ölçüm kanıtı var; datum ve enlem konvansiyonu doğrulanmış değildir. Yerel DTM'in düşey datumu (label) ve MOLA ürününün enlem konvansiyonu kaynaktan teyit edilmeden "doğrulandı" denmez.

## 6. Testler

- `node --test test/trek-raster.test.mjs test/regional-dem.test.mjs`: **30/30** geçti.
- `node --test "test/*.test.mjs"` (tüm paket): **429/429** (başlangıç 399 + yeni 30).
- Test düzeltmeleri: beklentiler yanlıştı, kod değil. (a) `[77.999, 18.001]` grid merkezlerinin dışında; (b) geçersiz hücre origin'in 2×2 komşuluğundaydı; (c) 20 m / 5 m pencere 16 hücredir. Kodda hata bulunmadı; hem sentetik testler hem gerçek kanıt dosyaları aynı sonucu verdi.

## 7. 37B için öneriler (Alparslan)

- **Dosya:** `Sim/data/regional-dem/mola-jezero.f32` + `mola-jezero.json` (Float32 LE, 384×384, satır 0 kuzey; `bounds`, `pixelSizeDeg` json'da). **Not:** mevcut `.gitignore` kuralı `data/*` altını gizler; bu klasörün izlenmesi için bir istisna gerekir. `.gitignore` bu görevde değiştirilmedi (Alparslan'ın sahipliği).
- **Ufuk ızgarası boyutu:** 384² (0,59 MB) yeterli. Daha geniş ufuk gerekirse ≤ 3 MB sınırında kalacak şekilde piksel sayısı arttırılabilir.
- **Etiket metni:** "Bölgesel bağlam, ~463 m/piksel, MOLA (Mars Trek). Düşey datum ve enlem konvansiyonu doğrulanmadı. Yürünebilirlik puanı yok."
- **Enlem konvansiyonu:** 37B örneklemesi H1 (identity) kullanmalı; H2 bu ölçümle desteklenmiyor, ama doğrulanmadığı için etikette belirtilmeli.
- **Dikiş politikası:** Ortalama artık +0,17 m, std 4,3 m: sınır dikişi görsel olarak küçük. Yine de **rota yüksekliği (HiRISE) birleştirilmez**; ufuk ayrı bir "bölgesel bağlam" katmanı olarak kalır. Öneri eşiği: |ortalama artık| > 10 m veya std > 10 m ise birleştirme yapılmaz (bu sınır varsayımdır).
- **Yeniden örnekleme:** Export bbox'ı native grid'e hizalanırsa (0,0078122° ızgara) identify farkı (2–8 m) ortadan kalkar. Bu, 37B'de önerilir.

## 8. Açık noktalar

1. Yerel DTM düşey datumu (`verticalDatum` null): USGS etiketinden teyit gerekir.
2. Trek MOLA ürününün enlem konvansiyonu (küre mi jeodetik mi) için resmi belge yok; bu ölçüm dolaylı.
3. Lisans: ImageServer `copyrightText` boş → "belirtilmemiş". Atıf metni ürün adını yansıtır.
4. Görev metnindeki "1,3 × 1,1 km" yerel DTM pencere tanımı ölçümle uyuşmuyor (1,135 × 1,676 km).
5. Legacy `Sim/data/legacy-hirise/dtm_subset.f32` (7.537.204 bayt) kök `dtm_subset.f32`'den (7.609.040 bayt) farklı; bu turda kullanılmadı, incelenmedi. Kök dosya (uygulamanın kullandığı) esas alındı.
6. Git: bu ortamda `git` çalıştırılamadı (PATH'te yok). Commit/push yapılmadı (görev gereği zaten yapılmayacaktı). Değişiklik kontrolü dosya zaman damgalarıyla yapıldı.
7. Ağ istekleri (trek.nasa.gov, toplam 9): 2 (ilk, ayrıştırma hatasıyla biten koşum) + 3 (CLI başarılı) + 4 (bağımsız betik, 2'si önbellekten). Aralar ≥1,1 s.

## 9. Çalıştırılmayanlar

- Uçtan uca smoke testi (`npm run smoke`) ve tarayıcı görünümü: çalıştırılmadı (görev kapsamı dışı).
- `main.js`, `config.js`, `view/`, `surface/`, `simulation/`, `route/`: dokunulmadı; yalnız `config.js` içindeki `WAYPOINTS` (salt okunur) CLI tarafından içe aktarıldı.
