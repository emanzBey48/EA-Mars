# Stage 21B-Ön: ortomozaik <-> DTM sayısal hizalama testi

Karar: **KANITLANAMADI.** Bu taramada ortomozaik ile DTM hillshade'i arasında güvenilir bir hizalama kanıtı yok. "Hizalı" denmemelidir.

Görsel (kaya/kenar) kontrolü yapılmadı; bu belge yalnız sayısal ölçümü içerir. Hillshade ortomozaik değildir; ortoyu DTM'den türetilmiş gölgeyle karıştırmayın.

## Girdiler
- DTM: `Sim/data/dtm_subset.json` + `dtm_subset.f32` (USGS/Mars Trek TRN HiRISE DTM, 1 m, PixelIsArea). Pencere 1676 x 1135 hücre, 1 902 260 geçerli, no-data 0. Eski `data/legacy-hirise/` (DTEEC_045994, farklı ürün ve pencere) kullanılmadı.
- Orto: `Sim/data/mars-trek/ortho-tiles/17/**` (z17, 54 karo, 0.3180 m/px; tümü yüklendi, alpha=255 olan 3 538 944 piksel, alpha 0 / kısmi 0).
- Projeksiyon: iki ürün de eşdikdörtgen, latTs0=0, lon0=0, R=3 396 190 m (DTM etiketi 3396.19 km ile aynı). Karşılaştırma projeksiyon metresinde yapıldı.

## Konvensiyon
- DTM hücre merkezi (PixelIsArea, DTM etiketi): `X = col - S0`, `Y = L0 - row` (S0 = -4577366.5, L0 = 1106617.5). Hücre kenarları, çıkarıcının kendi `coverage.latLonBounds` değerleriyle **0 m** sapma ile eşleşti (ölçüldü).
- Ortonun pikseli PixelIsArea (WMTS); tamsayı global koordinat piksel kenarıdır. Yarım piksel belirsizliği bu yüzden tarama adımına (0.5 px) dahil edildi, ayrıca tahmin edilmedi.
- Her DTM hücresi 1 m, 4x4 alt örnek ortalamasıyla ortodan okundu. Tüm 16 alt örnek alpha=255 karoda değilse hücre geçersiz (NaN). Eksik karo / alpha 0 **sıfırlanmadı**; boşluk üzerinden üçgen/değer üretilmedi.

## Yöntem
- (a) Hillshade: DTM Horn eğimi (`geo.js` `horn3x3Gradient`), 8 güneş azimutu (0..315°, adım 45°) x 45° yükseklik. Güneş konumu bilinmediği için en iyi azimut seçildi (çoklu karşılaştırma yükü var).
- (b) Işıktan bağımsız: `|∇orto|` (DTM ızgarası, merkezi fark) ile `|∇Z|` (Horn eğimi).
- Kaydırma: hillshade/eğim, DTM ızgarasında (dx, dy) piksel kaydırılır; `H_s(r,c) = H(r-dy, c-dx)`, bilinear örnekleme. Tarama: ±3 px, 0.5 px adım, 13 x 13 = 169 nokta.
- Korelasyon: ortak geçerli hücrelerde Pearson normalize çapraz korelasyon. Ortak hücre sayısı 357 216 (parlaklık), 354 780 (gradyan).
- Uzak kayma tabanı: tam sayı kaymalar, Chebyshev uzaklığı 6–10 px (320 nokta), hillshade (en iyi azimut) ve gradyan için.

## Ölçümler

| Ölçü | Tepe (dx, dy) px | Tepe r | İkinci tepe r (fark) | r @ (0,0) | Uzak-kayma tabanı maks / medyan |
|---|---|---|---|---|---|
| Hillshade, az 315° (en iyi azimut) | (+1.5, +0.5) | 0.3169 | (+1, +2) 0.3109 (fark 0.006) | 0.2809 | 0.2569 / 0.1280 |
| Hillshade, diğer azimutlar | (-3..+2, -3..+3) | 0.037–0.285 | — | — | — |
| Gradyan \|∇orto\| ~ \|∇Z\| | (-3, -3) (tarama sınırı) | 0.1135 | (-1, -3) 0.0885 (fark 0.025) | -0.0384 | 0.1110 / 0.0138 |
| Geniş teşhis (gradyan, ±20 px, her 3. hücre, karara girmez) | (-2, -4) | 0.1185 | fark 0.0085 | — | — |

Hillshade azimut tablosu (en iyi tepe, r): 0°: (-2,+3) 0.226; 45°: (-3,+3) 0.140; 90°: (-3,-3) 0.087; 135°: (-3,-3) 0.096; 180°: (-3,-3) 0.037; 225°: (+2,-3) 0.150; 270°: (+2,-1) 0.285; 315°: (+1.5,+0.5) 0.317.

Kenar sapması (DTM etiketi vs çıkarıcı sınırları): 0 m.

## Karar ve gerekçe
Eşikler (önceden sabitlendi, sonuçlara göre değiştirilmedi, literatürle doğrulanmadı): tepe |dx|,|dy| ≤ 0.5 px; tepe r ≥ 0.30; ikinci tepe farkı ≥ 0.05 (ikinci tepe, tepeden > 1.5 px uzakta); ortak hücre ≥ 20 000.

Başarısız olan ölçütler:
- Hillshade: tepe (+1.5, +0.5) px, sıfır ötelenmede değil; ikinci tepe farkı 0.006 (belirsiz).
- Gradyan: tepe (-3, -3) px, tarama sınırında; r = 0.114 < 0.30; ikinci tepe farkı 0.025.
- Sıfır ötelenmede gradyan korelasyonu negatif (-0.038): ışıktan bağımsız ölçü ortonun ve DTM'nin tutarlı biçimde hizalandığını göstermiyor.

Yorum: hillshade korelasyonu, uzak kaymalarda bile 0.13 medyan ve 0.26 maksimum veriyor. Bu ölçü, geometrik hizalamayı ayırt etmekte zayıf; düşük korelasyon değerleri büyük ölçekli parlaklık trendinden gelebilir. Güneş konumu (azimut/yükseklik) bilinmediği için bu tarama tek başına ortonun DTM'ye göre konumunu saptayamıyor.

Geniş teşhis ±20 px'te de net bir tepe bulamadı (r = 0.118, fark 0.0085; gradyan uzak-kayma tabanının maksimumuna çok yakın). Gerçek bir ofset ±3 px dışında olsa bile bu tarama onu güvenle göstermiyor.

## Stage 21A ile tutarlılık
- Stage 21A'daki açık konu (manifest waypoint'leri ile `config.js` arasındaki ~26 m / ~130 m fark) bu testte çözülmedi. Bu fark, ortonun DTM'ye göre ofsetini açıklayabilir; ancak bu belge bunu kanıtlamaz.
- Tile-hash ve 3.95 MB bütünlük kontrolleri 21A'da yapıldı; bu testte yeniden kullanılmadı.

## Lisans / CRS
- Ortonun lisansı kaynakta belirtilmemiş (`NOT_STATED_IN_PROVIDED_FGDC`); tahmin edilmedi. DTM'nin CC0 ibaresi yalnız DTM'ye aittir.
- CRS: iki ürün için de etiket/FGDC ifadeleri kullanıldı; yeni bir CRS/datum varsayımı yapılmadı.

## Gelecek adımlar (21B, sahibi Alparslan)
1. Orto için gerçek kaynaklı bir kontrol noktası (kaya/kenar eşleştirmesi, görsel) olmadan hizalama iddia edilmemeli.
2. Güneş azimutu/yüksekliği için kaynaklı bir değer (örn. HiRISE görüntüsünün EDR/RDR etiketi) bulunursa hillshade testi sabit ışıkla yeniden yapılmalı.
3. Waypoint koordinat çelişkisi (manifest vs config) çözülmeden ±3 px taraması yeterli değil; ±30 m gibi geniş bir tarama, sonuçların kaynağı netleşince tasarlanmalı.

## Araçlar ve çalıştırma
- `node scripts/validate-ortho-registration.mjs --out <dizin>` (~18 s). Ham sonuçlar (korelasyon yüzeyleri dahil) `--out` dizinine yazılır; repoya yazılmaz.
- `node --test test/ortho-mosaic.test.mjs`: 27/27 geçti (yeni 6 test: DTM okuma, Horn/hillshade analitik değer, sentetik tam ve yarım piksel kayma kurtarma, eksik karoda NaN, konservatif karar, gerçek veri çalıştırması "hizalı" demez).

## Engeller
- `git` bu ortamda PATH'te yok; commit/branch yapılmadı.
- Sayısal taramada hillshade korelasyonu için uzak-kayma tabanı yüksek çıktı; eşikler ön-kayıtlı kaldı, sonradan ayarlanmadı.
