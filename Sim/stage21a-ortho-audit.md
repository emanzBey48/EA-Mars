# Stage 21A — 25 cm HiRISE ortho WMTS karo denetimi (Efe)

Araç: `Sim/scripts/build-ortho-mosaic.mjs`, test: `Sim/test/ortho-mosaic.test.mjs` (21 test yeşil; `node --test test/` 112/112).
Çıktılar repoya yazılmadı; `--out <dizin>` zorunlu. Bu belge ortogörüntü denetimidir; DTM hillshade "ortho" değildir.

## Karo geometrisi
- DOĞRULANDI: TileMatrixSet `default028mm`, CRS `urn:ogc:def:crs:EPSG::104905`, TopLeftCorner `-180 90` (derece), karo 256x256, aktif matris 0..17 (XML'deki yorum satırlı eski 3x2 küme yok sayıldı).
- DOĞRULANDI: matris tüm küreyi kaplar: derece/piksel = 360/(MatrixWidth*256). z16 = 1.0729e-5, z17 = 5.3644e-6 derece/piksel. Manifest lat/lon aralıkları 5 zoom için 1e-9 içinde yeniden üretildi.
- DOĞRULANDI: yol sırası `ortho-tiles/{z}/{row}/{col}.png` (row = kuzeyden güneye, ResourceURL `{TileMatrix}/{TileRow}/{TileCol}`).
- DOĞRULANDI: XML `ScaleDenominator` Dünya yarıçapına göre (R≈6371 km ile 0.1% içinde tutuyor, Mars R=3396.19 km ile %88 sapıyor) — kullanılmadı.

## GSD (enlem 18.4357, R=3396190 m)
- z17: 0.3180 m/px (K-G ve projeksiyon düzlemi), yerde D-B 0.3017 m/px. z16: 0.6360 / 0.6033.
- DOĞRULANDI: "25 cm" nominal ürün adıdır; sunulan en ince karo seviyesi (z17) 25 cm'den kaba. Kaynak çözünürlüğü FGDC'de yok (OLASI: orijinal 25 cm, z17 yeniden örnekleme).

## Çalışma penceresi
- `1328x1234 m` hiçbir veriden yeniden üretilemedi (OLASI/AÇIK). Koridor (manifest) = 375.8x580.6 m; z14 karo birleşimi 1302x1302 m (yerde 1236); DTM alt kümesi 1135x1676 m. Bu sayı 21B'de kaynağı ile birlikte netleştirilmeli.
- Seçilen: `corridor` (manifest `corridor_bounds`), z17, 1182x1826 px, 375.85x580.62 m, yerel x[-118.6, 257.3] y[-488.0, 92.6]. Alternatif `tiles` penceresi (tüm 54 karo): 1536x2304 px, 488.4x732.6 m.
- Mesh penceresi (DTM alt kümesi 1135x1676 m) ortomozaik ile yalnızca ~%11.5 (corridor) / ~%18.8 (tiles) kaplanır; kalan yerde UV [0,1] dışı kalır, hillshade korunmalı.

## Kapsam / eksik
- DOĞRULANDI: z17 54/54, z16 20/20, z15 9/9, z14 4/4, z13 4/4 (toplam 91; her seviye tam dikdörtgen ızgara). Corridor z17 eksiksiz.
- UYARI: `config.js` rota kutusu (Sol 164 lat 18.42769) z15–z17 kapsamının ~111 m güneyinde; z17'de 6 karo eksik (araç hata verir, `--allow-missing` ile alpha=0 + listeler). Tam kapsam yalnız z14/z13'te (0.64→2.5 m/px).
- UYARI: manifest waypoint'leri (18.43863/77.44940, 18.43284/77.45174) config'tekilerden farklı; yerel düzleme çevrilince (-0.03,-26.0) ve (138.7,-369.2) m çıkar (config: (0,0), (133.3,-674.3)). Hangisinin doğru olduğu bu işte çözülmedi (AÇIK).

## Bütünlük / hash
- Manifest karo başına sha256 İÇERMİYOR; yalnız seviye bazında sayı/bayt/aralık: tümü eşleşti (3 950 436 bayt). Karo sha256'ları hesaplanıp hizalama manifestine ve testte 3 karo için sabitlendi.
- 91 PNG IHDR: tümü 256x256, 8 bit, color type 4 (gri+alfa), interlace yok. Dekoder CRC'yi doğrular; 16 bit/palet/interlace'te fail-closed.
- Metin dosyaları (XML, FGDC) diskte CRLF; ham hash eşleşmez, LF-normalize hash manifest ile birebir eşleşir (DOĞRULANDI: yalnız satır sonu farkı).

## Çıktı biçimi
- `ortho-mosaic-z17-<pencere>.png` (gri+alfa 8 bit, filtre 0, deterministik) + `ortho-alignment-z17-<pencere>.json` (şema `marswalk.ortho-alignment.v1`): bbox (derece), yerel metre sınırları (geo.js ile aynı denklemler), UV afin (`u=x*uScale+uOffset`, `v=y*vScale+vOffset`, v=0 üst satır), mesh köşe UV'leri, karo listesi+hash, eksik karolar, GSD, atıf.
- Kayıt: WMTS piksel-alan; piksel merkezi +0.5; tamsayı global koordinat piksel kenarı. DOĞRULANDI (aritmetik): UV köşeleri 0/1'e gider, Sol 120 pikseli karo piksel koordinatıyla 1e-6 px içinde tutarlı.
- Atıf: FGDC başlık/özet birebir kaydedildi; lisans/rights/constraints alanları FGDC'de BOŞ -> `NOT_STATED_IN_PROVIDED_FGDC`. config'teki CC0/atıf DTM ürününe aittir; ortho için varsayılmadı.

## Açık işler (21B, Alparslan)
1. Ortomozaik-DTM hizası GÖRSEL olarak doğrulanmadı; yarı-piksel kaydı kanıtsız (manifestte `false`). Kaya/kenar eşleştirmesiyle görsel kontrol yapılmadan "hizalı" denmemeli.
2. UV uygulaması: 2D Canvas ve WebGL2; pencere dışında hillshade'e dönüş (kenar uzatma yok); v ekseni için tekrar flip-Y yapma.
3. Atıf/lisans arayüzü: ortho lisansı kaynaktan teyit edilene kadar "lisans belirtilmemiş" notu.
4. Rota/waypoint koordinat çelişkisi ve 1328x1234 m kaynağı; Sol 164 için z17 yetmez (z14 veya yeni karo indirmesi).
5. JP2 ortogörüntü ve DTM hillshade ayrı kalır; bu mozaik JP2'nin yerine geçmiş sayılmamalı ürün kabulü yapılana dek.
