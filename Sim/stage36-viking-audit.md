# Stage 36A: Viking MDIM 2.1 renkli küresel mozaik denetimi ve küçük çıktılar

Kaynak: `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` (12.740.936.469 bayt, depo kökü, git'e girmez; `.gitignore`'da).
Üretici betik: `scripts/ingest-viking-mosaic.mjs`. Saf çekirdek: `public/js/geo/viking-mosaic.js`. Çıktı: `data/viking-mdim/`.

## Ne bu veri, ne değil

- Renkli, işlenmiş 232 m/piksel küresel mozaiktir. **Ortogörüntü değildir, yükseklik verisi değildir, yerel doku olarak kullanılamaz.**
- Jezero'da 1 piksel yaklaşık 232 m'dir; 1328 × 1234 m pencere ~6 × 5 pikseldir.
- Minimap zemini (K0) ve uzak ufuk renk bilgisi için kullanılır.

## Başlık doğrulaması (tam dosya, ölçülen)

| Alan | Ölçülen | Beklenen |
|---|---|---|
| Format | BigTIFF, little-endian (`II`), magic 43 | BigTIFF |
| Boyut | 92160 × 46080 | aynı |
| Bant / bit | 3 × 8 bit (SampleFormat 1,1,1) | 3 × 8 |
| Sıkıştırma / planar / photometric | 1 / 1 / 2 (RGB) | sıkıştırmasız, planar 1 |
| Strip | 46080, `RowsPerStrip` 1, her strip 276.480 bayt | aynı |
| Strip ardışıklığı | 46080/46080 ofset ardışık; ilk kırılma yok; toplam = 92160·46080·3 | ardışık |
| Veri aralığı | 738.069 … 12.740.936.469 (dosya sonu = veri sonu, sondaki bayt 0) | dosya içinde |
| ModelPixelScale | 231,5417872 m | 231,5417872 |
| ModelTiepoint | (−10.669.445,554 ; 5.334.722,777) m; artık 0,0000 px | sol üst köşe, −R·π ; R·π/2 |
| Yarıçap | 3.396.190 m (GeoKey 2057; GeoDoubleParams içinde 2 kez) | 3396190 |
| GDAL_NODATA | `0` | `0` (başka değer reddedilir) |
| GeoAsciiParams | `SimpleCylindrical Mars\|GCS Name = GCS_Mars\|Datum = D_Mars\|Ellipsoid = Mars\|Primem = Reference_Meridian` | Görev notunda "SimpleCylindrical Mars \| GCS_Mars \| D_Mars \| Ellipsoid = Mars" yazıyordu; metin farkı yalnızca ifade biçimidir, alanlar aynıdır |

Konum: Jezero Sol 120 / WB1 (`config.js` WAYPOINTS[0], 18,43906919 °K, 77,44940206 °D) → native sütun **65907**, satır **18319**. Görev notundaki yaklaşık değerle uyumlu.

## No-data (tam dosya taraması)

- Kural: `(0,0,0)` = GDAL_NODATA 0. Ortalamaya katılmaz; tüm bloğu no-data olan çıktı piksel alfa 0 olur.
- Ölçüm: **tam dosyada `(0,0,0)` pikseli 0 / 4.246.732.800** (oran 0). Bir bandı 0 olan piksel de **0**.
- Sonuç: bu üründe no-data piksel fiilen yoktur; 0'a çevirme veya boşluk ortalaması bu veride uygulanmamıştır. Tanım korunmuştur, yeniden çalıştırılırsa yeni bir ürün için de geçerlidir.

## Akış ve bellek

- Tek geçiş: 64 satırlık okumalarla (17,7 MB) satır satır akış. Tam dosya belleğe alınmaz.
- Aynı geçişte: tam dosya SHA-256, no-data taraması, Jezero bölgesel kesiti ve 8192 × 4096 seviye-4 görüntüsü.
- Ölçülen: **süre 53,5 s; tepe RSS 197,5 MiB** (tampon ~149 MiB).
- Aşağı örnekleme: alan-ağırlıklı kutu filtresi. Seviye 4 oranı 11,25 olduğundan kesirli ağırlıklar kullanılır. Seviye 0–3, seviye 4'ten tam 2×2 kutu ile türetilir (alfa-ağırlıklı; bu nedenle düşük seviyeler yaklaşık, tam kaynak ortalaması değildir).

## Piramit ve çıktı (ölçülen)

Şema: 2:1 eşdikdörtgen, 256 px karo, yol `tiles/{z}/{row}/{col}.png` (row 0 = kuzey, col 0 = batı; `ortho-tiles` ile aynı sıra). z0 = 2×1 karo (512×256 dünya piksel).

| z | Karo (cols×rows) | Dünya px | m/px | Karo PNG toplamı | Durum |
|---|---|---|---|---|---|
| 0 | 2×1 | 512×256 | 41.677,5 | 0,26 MiB | yazıldı |
| 1 | 4×2 | 1024×512 | 20.838,8 | 1,02 MiB | yazıldı |
| 2 | 8×4 | 2048×1024 | 10.419,4 | 3,93 MiB | yazıldı |
| 3 | 16×8 | 4096×2048 | 5.209,7 | 14,80 MiB | **yazıldı (maxLevel)** |
| 4 | 32×16 | 8192×4096 | 2.604,8 | 54,66 MiB | ölçüldü, yazılmadı (bütçe aşımı) |

- Bölgesel kesit (Jezero, native, 4°×4°): 1024×1024 PNG, 1,86 MiB. Pencere: sütun 65395–66418, satır 17807–18830; lon 75,449–79,449 °D; lat 16,441–20,441 °K. Native 231,54 m/px.
- Bütçe: maxLevel = en büyük z ≤ 4, öyle ki z0..z + bölgesel PNG ≤ 40 MiB. Kümülatif: 2,13 / 3,15 / 7,08 / 21,87 / 76,53 MiB (z4 dahil). Seçim z3 → **toplam çıktı 21,87 MiB**.
- Z5 üretilmedi: RGBA ~512 MiB bellek ister ve çıktısı z4'ün yaklaşık 4 katı (~230 MB) olur.

## Testler

- `test/viking-mosaic.test.mjs`: 22 test, yalnızca sentetik küçük BigTIFF'ler; 12,7 GB dosyaya bağımlılık yok. Kapsam: başlık ayrıştırma, reddedilen biçimler (sıkıştırma, 16 bit, 4 bant, planar 2, classic TIFF, big-endian, eksik no-data, bayt sayısı hatası, dosya sonunu aşan ofset), strip kopukluğu, Jezero (65907/18319), kenar sahipliği (+180 → sütun 0, −90 → son satır), yarım piksel gidiş-dönüş, seviye geometrisi, no-data dışlama, kesirli ağırlıklar, PNG bayt-düzeyi gidiş-dönüş, CRC, determinizm, donmuş çıktılar.
- `npm test`: **399/399** geçti (başlangıç 377 + 22 yeni).

## Bağımsız doğrulama (`scratchpad/verify-viking.mjs`, üretim modülü içe aktarılmadı)

- Jezero merkez pikseli (bölge PNG 512,512 ↔ ham 18319,65907): PNG **(34,28,40,255)**, ham **(34,28,40)** → birebir. Görev aralığı (33–38, 27–32, 38–43) içinde.
- Bölgesel kesitten 2000 rastgele piksel: **0 uyuşmazlık**.
- z0 örnekleri (3 piksel, ham dosyadan 180×180 bağımsız kutu ortalaması): en fazla **1 birim** fark. Sebep: z0, zincirleme türetilmiş olduğu için yuvarlama farkı; beklenen.
- Karo sayısı ve baytları: Get-ChildItem benzeri yeniden sayım manifestle **birebir** (z0–z3: 2/8/32/128 dosya; toplam 20.982.058 bayt karo + 1.954.639 bayt bölge = 22.936.697 = `outputTotalBytes`).
- Tam dosya SHA-256 (manifest): `61a5a2ee52c34f5cd76d4c8a45e6148b965514561bdd6bd06afe73130069adc3`. Bağımsız `Get-FileHash -Algorithm SHA256` sonucu aynı değer (büyük/küçük harf farkı dışında): eşleşti.

## Lisans ve atıf

- `license`: **"belirtilmemiş"**. Dosyada künye/lisans yok.
- USGS Astrogeology ürün sayfaları denendi:
  - `https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m` → HTTP 403.
  - `https://astrogeology.usgs.gov/search/map/viking_mdim2_1_grayscale_global_mosaic_232m` → HTTP 403.
- Arama özeti "public domain / no use constraints" diyor; ancak sayfanın kendisi okunamadığı için bu ifade **teyit edilmiş kanıt değildir** ve kullanılmadı. Teyit için sayfanın bir tarayıcıdan açılıp lisans metninin doğrudan alınması gerekir.
- `attribution`: "Mars_Viking_MDIM21_ClrMosaic_global_232m.tif dosya adı: Viking MDIM 2.1 renkli küresel mozaiği; künye/lisans dosyada yok".

## Alparslan için (36B) yükleme notları

- Yol: `Sim/data/viking-mdim/tiles/{z}/{row}/{col}.png`, z ∈ {0,1,2,3}. Dünya 512·2^z × 256·2^z piksel; karo 256 px.
- Seviye → m/px: z0 41.677,5 · z1 20.838,8 · z2 10.419,4 · z3 5.209,7.
- Minimap K0 için z0–z3 kullanılabilir; yakınlaşınca "232 m/px — yerel ayrıntı yok" uyarısı gerekir.
- Bölgesel kesit: `Sim/data/viking-mdim/regional-jezero-4deg-native.png` (lon 75,449–79,449, lat 16,441–20,441). Native 231,54 m/px.
- Boş/eksik karo: (RGBA alfa 0 değildir, dosya yoktur) — UI katman `unavailable` durumuna düşmeli.
- Atıf metni: `manifest.json` → `attribution`. Lisans teyidi yapılana kadar "belirtilmemiş" gösterilmelidir.
- Manifest: `Sim/data/viking-mdim/manifest.json` (kaynak SHA-256, başlık özeti, seviye tablosu, no-data istatistikleri, `notes`).

## Açık noktalar

1. Lisans/atıf teyidi yapılmadı (403). Kullanıcı tarayıcıdan USGS sayfasını açıp lisans metnini iletmelidir.
2. z0–z3 seviyeleri z4'ten alfa-ağırlıklı 2×2 ile türetildi; tam kaynak ortalamasından ±1 birim sapma ölçüldü.
3. z4 ve z5 yazılmadı (bütçe ve bellek). Daha ince seviye gerekirse ayrı bir akış geçişi gerekir.
4. Bu üründe no-data piksel yok; no-data kuralı yalnızca başka bir ürün için bir sigorta.
5. Commit ve push yapılmadı; `.gitignore`, mevcut dosyalar ve ham `.tif` değiştirilmedi.

## Çalıştırılmayanlar

- `main.js`, `config.js`, `view/`, `surface/`, `simulation/`, mevcut `route/` ve `geo/` dosyalarına dokunulmadı; `trek-tiles.js` yalnızca içe aktarıldı.
- Tarayıcı smoke testi çalıştırılmadı (görsel katman yok).
