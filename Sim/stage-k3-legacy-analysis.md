# Stage K3-8 / K3-9: AKTİF legacy HiRISE DTM üzerinde ortomozaik kayıt ölçümü ve analiz yeniden koşusu

Kapsam: salt ölçüm ve teşhis. Uygulama kodu (`public/js/**`), veri dosyaları ve mevcut betikler değiştirilmedi.
Yeni dosyalar: `scripts/validate-ortho-registration-legacy.mjs` (K3-8), `scripts/legacy-analysis.mjs` (K3-9),
`test/legacy-analysis.test.mjs` (yalnız sentetik girdiler), bu rapor. Git: yalnız status/diff; commit/push yapılmadı.

Etiketler: **DOĞRULANDI** = bağımsız bir yolla (proje modülü kullanılmadan) yeniden hesaplandı veya uygulamanın
gerçek kod yolundan ölçüldü. **OLASI** = akıl yürütme veya kısmi kanıt, sayısal olarak doğrulanmadı.

---

## 1. Yönetici özeti

| Konu | Sonuç | Etiket |
|---|---|---|
| Aktif legacy DTM ↔ ortomozaik kayıt (K3-8) | **kanıtlanamadı.** High-pass korelasyon tepesi r = 0,021 (uzak-kayma tabanı maks 0,010). Ölçüm aracı, aynı boru hattıyla USGS adayında 39A değerlerini birebir üretti; yöntem çalışıyor, legacy veriyle ilişki yok. | DOĞRULANDI |
| Legacy ↔ USGS yüzey farkı | Ortalama 0,558 m, std 3,112 m. Yatay öteleme taramasında iç minimum yok (±30 m aralıkta da kenarda). Legacy'nin ortomozaikle hizası için dolaylı kanıt **bulunmadı**. | DOĞRULANDI |
| Düzenli çerçeve sapması | Uygulamanın minimap ve rota planlayıcısı DTM'yi düzenli ızgarayla (1,00966 m/hücre) yerleştiriyor; örnekleyici ise köprüyü (doğu-batı ~1,0457 m/hücre) kullanıyor. Sapma: WB1 ~18,7 m, Roubion ~23,4 m, pencere doğu kenarı ~40,7 m. | DOĞRULANDI (kod + bağımsız hesap) |
| Kabartma özeti (K3-9) | Legacy kot aralığı 46,09 m (USGS adayı 44,84 m; belge 44,84 m, yeniden üretildi). | DOĞRULANDI |
| Rota (K3-9) | Legacy düzenli çerçevede: dengeli 729,66 m / 9,77°, en kısa 729,66 m / 14,10°, en düz 731,09 m / 10,11°. UI özeti (9,8° / 14,1° / 10,1°) ile tutarlı. USGS adayı belge değerleriyle birebir (730,505 / 9,81; 730,505 / 10,64; 732,161 / 9,27). | DOĞRULANDI |
| Uygulamadaki sayılar | Bağımsız ham-f32 hesabı kot istatistikleri, WB1 hücre kotu, düzenli çerçeve sapması ve legacy−USGS farkını uygulamayla birebir eşleştirdi. | DOĞRULANDI |

---

## 2. K3-8: ortomozaik ↔ aktif legacy DTM

### 2.1 Yöntem (önceden sabitlendi; sonuç görülmeden)

- **DTM:** `data/legacy-hirise/dtm_subset.{json,f32}`, 1669 × 1129 hücre, geçerli 1 884 301, no-data 0. Sağlayıcı,
  uygulamanın kendi kodu (`surface/registry.js` → `loadProvider('hirise-legacy-jezero-dtm')`) ile yüklendi; doğrulama
  durumu `supported`. Hücre konumu sağlayıcının köprüsünden (`registry.js:22-36`) alındı.
- **Kanonik düzlemde hücre aralığı eşit değil:** Doğu 1,04570 m, Kuzey 1,01006 m (köşeler arası fark 0,9 µm).
  Gradyanlar bu aralıklarla anizotropik hesaplandı.
- **Ortomozaik:** `data/ortho/ortho-mosaic-z17-tiles.png` + manifest; SHA-256 manifestle eşleşti. Örnekleme uygulamanın
  `uvMapping`'iyle (`surface/ortho-layer.js` sözleşmesi). 4×4 alt örnek, tümü alpha=255 değilse hücre geçersiz.
  Ortak geçerli hücre 337 384. Mozaik yalnız Sol 120 koridorunu kaplar (~488 × 733 m).
- **Kaydırma:** H_s(r,c) = H(r−dy, c−dx), dx/dy legacy hücre birimi. ±3 px, 0,5 px adım, 8 güneş azimutu × 45°.
- **Ölçütler:** (a) ham hillshade, (b) high-pass (r=5) hillshade ↔ high-pass ortomozaik, (c) |∇ortho| ↔ |∇Z| (birim/m).
- **Ön-kayıtlı karar:** *ölçüldü* ⇔ ortak hücre ≥ 20 000 **ve** (b) en iyi azimut tepesi geçer **ve** (c) gradyan tepesi geçer.
  Geçiş: |tepe konumu| ≤ 1,0 px **ve** r ≥ 0,30 **ve** ikinci tepeyle fark ≥ 0,02. (a) yalnız raporlanır (albedo karışık).
  Aksi halde *kanıtlanamadı*. "Hizalı" bu betikte yazılmaz.
  Not: (a)-(c) için tek bir "tepe" yerine iki bağımsız yüzey şartı yorumu, ölçümden önce yazıldı.

### 2.2 Sonuçlar

| Ölçüt | En iyi tepe (px) | r | İkinci tepe farkı | Uzak-kayma tabanı (maks / medyan) | Geçer mi |
|---|---|---|---|---|---|
| (a) ham hillshade, az 45° | (−2,5; −2,5) | 0,1803 | 0,0020 | — | hayır (raporlanır) |
| (b) high-pass r=5, az 135° | (−3,0; +0,5) | 0,0211 | 0,0025 | 0,0102 / 0,0009 | **hayır** |
| (c) gradyan büyüklüğü | (−3,0; +3,0) | −0,0375 | 0,0003 | −0,0264 / −0,0375 | **hayır** |

**Karar: kanıtlanamadı.** Aktif legacy DTM ile ortomozaik arasında bu yöntemle ölçülebilir bir ilişki yok; en iyi
high-pass tepesi uzak-kayma tabanının (0,010) yalnız iki katı kadar ve r = 0,021 < 0,30.

**Kontrol (aynı boru hattı, USGS adayı, ortak hücre 357 216):** (b) az 270°, tepe (+0,5; −0,5) px, r = 0,3975, fark
0,0245. (c) tepe (−3; −3) px, r = 0,1135, fark 0,0250. Bu değerler 39A raporundaki (`stage39-ortho-diagnosis.md`
§2.3) değerlerle **birebir** aynı. Yani yöntem bilinen bir DTM'de doğru tepeyi buluyor; legacy için negatif sonuç
yönteme değil veriye ait. Kontrolde karar da *kanıtlanamadı* çıktı, çünkü (c) gradyan kriteri USGS'te bile geçmedi
(bkz. §5, sorun 5).

### 2.3 Legacy ↔ USGS yüzey farkı ve yatay öteleme (dolaylı kanıt)

Ortak konum = köprü (coğrafi) konumu; USGS bilinear örnekleme; kaydırma USGS'te 1 m/px.

| Ölçüm | n | Ortalama (m) | Std (m) | maks \|fark\| (m) |
|---|---|---|---|---|
| Sıfır öteleme, köprü konumu | 1 800 015 | 0,558 | 3,112 | 12,537 |
| Sıfır öteleme, düzenli (minimap/planlayıcı) konum | 1 834 854 | 0,306 | 3,174 | 12,427 |

Yatay öteleme taraması (ortak örnek kümesi; kenar payı ile kaydırmayla küme değişmez):

| Aralık / adım | En küçük std (m) | Konum (dx, dy) m | Sıfırda std | Kenara değiyor mu |
|---|---|---|---|---|
| ±10 m / 0,5 m | 2,952 | (−5,5; +10) | 3,128 | **evet** |
| ±30 m / 1 m | 2,598 | (−6; +30) | 3,153 | **evet** |

Yorum: std iki aralıkta da kenarda en düşük; iç minimum yok. Ölçülebilir bir rijit öteleme bulunmadı. Legacy DTM ile
USGS adayı arasındaki 3 m civarı std, iki farklı stereo DTM ürününün tutarsızlığıyla uyumlu (**OLASI**; ürünler
arası kaynak farkı ayrıca doğrulanmadı). Sonuç: legacy'nin ortomozaikle hizası için USGS üzerinden dolaylı kanıt
**yok**. (39A'daki "aynı JEZ ailesi" iddiası legacy ürünü için sınanamadı; legacy ürünü `DTEEC_045994` farklı bir
PDS3 ürünüdür.)

---

## 3. K3-9: analizlerin aktif legacy penceresinde yeniden koşusu

### 3.1 Kabartma özeti (senaryo eşikleri: minDepthM = 1, minProminenceM = 1)

| Ölçüt | Legacy (aktif) | USGS adayı | Stage 35 belge |
|---|---|---|---|
| Kot aralığı (tam, m) | **46,088** | 44,842 | 44,842 |
| Kot min / P1 / P50 / P99 / max (m) | −2592,83 / −2591,22 / −2574,15 / −2553,63 / −2546,74 | −2592,68 / −2590,05 / −2576,22 / −2558,46 / −2547,84 | — |
| Eğim P50 / P90 / P99 / max (°) | 3,15 / 7,74 / 13,78 / 36,04 | 3,11 / 7,54 / 13,54 / 35,77 | 3,11 / 7,54 / 13,54 / 35,77 |
| Hesaplanan eğim hücresi | 1 878 709 | 1 896 642 | — |
| En derin 5 kapalı çukur (m) | 7,51; 1,93; 1,82; 1,35; 1,18 | 7,98; 1,86; 1,81; 1,49; 1,25 | en derin 7,98 |
| En belirgin 5 tepe (m) | 7,78; 4,66; 4,64; 4,23; 3,99 | 8,07; 4,43; 3,77; 3,35; 3,30 | en belirgin 8,07 |
| Eşik üstü çukur / tepe | 7 / 52 | 10 / 51 | — |

USGS sütunu Stage 35 belge değerlerini birebir yeniden üretiyor (**DOĞRULANDI**). Legacy aralığı (46,09 m) USGS'ten
~1,2 m geniş; eğim dağılımı benzer. Kaya/blok tespiti değildir.

### 3.2 WB1 → Roubion rota tercihleri (uygulamanın düzenli çerçevesi)

| Tercih | Legacy: uzunluk / maks eğim (planlayıcı) / min puan / >5° payı | USGS adayı | Belge (USGS) |
|---|---|---|---|
| En kısa (shortest) | 729,660 m / 14,10° / 100,0 / %49,1 | 730,505 m / 10,64° / 100,0 / %43,1 | 730,505 m / 10,64° |
| Dengeli (balanced) | 729,660 m / 9,77° / 98,0 / %48,4 | 730,505 m / 9,81° / 98,0 / %39,9 | 730,505 m / 9,81° |
| En düz (gentle) | 731,088 m / 10,11° / 85,0 / %27,2 | 732,161 m / 9,27° / 90,0 / %13,3 | 732,161 m / 9,27° |

- **UI uyumu:** Ajan P UI ölçümü (dengeli 9,8°, en kısa 14,1°, en düz 10,1°) ve worker replay (729,66 / 9,77;
  729,66 / 14,10; 731,09 / 10,11) ile **birebir**. (**DOĞRULANDI**)
- USGS adayı Efe belge değerlerini birebir üretiyor. (**DOĞRULANDI**)
- Maks eğim: planlayıcı tepe değeri ile yol hücrelerinden örneklenen maksimum **aynı** çıktı (bu çalışmada ayrışma yok).
- >5° payı: "en düz" tercihi legacy'de yol uzunluğunun %27'sinde 5°'yi aşıyor, dengelide %48. Ajan P'nin önerdiği
  "yol uzunluğunun >5° payı" metriğini doğrular (**DOĞRULANDI**, ölçüm bu çalışmada).

### 3.3 Uç noktalar (WB1 ve Roubion)

| Nokta | Kaynak | Kot (m) | Eğim (°) | Hücre |
|---|---|---|---|---|
| WB1 | Legacy, uygulama örnekleyici (köprü) | −2569,435 | 0,863 | (6415, 3742) |
| WB1 | Legacy, düzenli çerçeve (planlayıcı) | −2569,200 | 1,948 | (500, 518) pencere |
| WB1 | USGS adayı | −2568,087 | 3,066 | — |
| Roubion | Legacy, uygulama örnekleyici (köprü) | −2588,449 | 3,821 | (7083, 3870) |
| Roubion | Legacy, düzenli çerçeve (planlayıcı) | −2586,430 | **8,590** | (1168, 650) pencere |
| Roubion | USGS adayı | −2584,916 | 2,200 | — |

- Legacy − USGS kot farkı: WB1 −1,348 m; Roubion −3,533 m (**DOĞRULANDI**).
- Düzenli çerçeve sapması (aynı pencere hücresi için coğrafi − düzenli): WB1 Δx **+18,68 m**; Roubion Δx **+23,44 m**,
  Δy −0,47 m; pencere batı kenarı 0,02 m, doğu kenarı **+40,66 m** (**DOĞRULANDI**, bağımsız hesap).
- Sonuç: planlayıcının Roubion'da kullandığı hücrenin eğimi (8,59°) örnekleyicinin (3,82°) iki katından fazla.

---

## 4. Bağımsız doğrulama (proje modülü kullanılmadan)

`scratchpad/k3-legacy/independent-check.mjs`: yalnız ham f32, JSON etiketleri ve elle yazılmış projeksiyon formülleri.

| Büyüklük | Bağımsız | Uygulama / betik | Eşleşme |
|---|---|---|---|
| Legacy kot aralığı (m) | 46,088 | 46,088 | evet |
| Legacy min / max (m) | −2592,832 / −2546,743 | −2592,83 / −2546,74 | evet |
| Legacy P1 / P50 / P99 (m) | −2591,22 / −2574,15 / −2553,63 | aynı | evet |
| WB1 hücresi (tam indeks) ve kotu | (6415, 3742), −2569,435 | (6415, 3742), −2569,435 | evet |
| Planlayıcı WB1 sütunu | 518 | 518 | evet |
| Doğu kenar düzenli sapması (m) | 40,66 | 40,66 | evet |
| Legacy − USGS, sıfır öteleme (ort. / std / n) | 0,558 / 3,112 / 1 800 015 | 0,558 / 3,112 / 1 800 015 | evet |

Not: bağımsız betiğin ilk sürümü, legacy etiketinin PDS3 1-tabanlı piksel kuralını (`CENTER_PDS_1BASED`, `geo.js`
`PdsGrid`) yanlış varsaydığı için WB1 hücresinde 1 px kaydı. Hata bağımsız betikte bulundu ve düzeltildi; uygulama
kodu doğruydu. Bu rapordaki tüm sayılar düzeltilmiş sürümden.

---

## 5. Bulunan sorunlar

1. **Çerçeve uyuşmazlığı (yüksek etki; DOĞRULANDI).** Aktif legacy DTM iki farklı yerel çerçevede kullanılıyor:
   - Örnekleyici ve kot/eğim sorguları köprüyü kullanıyor (`surface/registry.js:22-36`, `surface/layers.js:GridElevationLayer`).
   - Minimap terrain görüntüsü: `view/render.js:75-80` konumu köprüden alıyor ama genişliği `cols * cellSizeM`
     (düzenli) olarak veriyor.
   - Rota çalışanı: `main.js:813-817` `nwXM` (köprü) ve `cellSizeM = 1,00966` (düzenli) gönderiyor.
   Sonuç: minimapta DTM, ortomozaikten doğu kenarda ~41 m kayık çizilir (**OLASI** görsel etki; ortomozaik kanonik
   manifestten geliyor, DTM düzenli); rota uçları WB1'de ~19 m, Roubion'da ~23 m, planlayıcının okuduğu hücrede
   gösterildiğinden farklı yerlerden örneklenir. Önerilen çözüm (Alparslan kararı): legacy için düzenli ızgara yerine
   köprü konumuna göre hücre eşlemesi (renderer ve worker), veya legacy'nin kanonik düzlemde yeniden örneklenmesi.
2. **Legacy metadata kapsam kutusu legacy düzleminde (DOĞRULANDI).** `data/legacy-hirise/dtm_subset.json`
   `coverage.localBoundsM` (x −505,79…634,12) değerleri, `x = (col_kenar − colWB1)·1,00966` formülüyle tam eşleşiyor;
   yani legacy düzlemi. Köprünün kanonik sınırları ≈ −523,8…656,8 m. `registry.js:58-76` yalnız iki rota ucunun kutu
   içinde olmasını denetlediği için doğrulama geçiyor. Kapsam etiketi olarak kullanılıyorsa tutarsız.
3. **Eğim: tek hücre aralığı (OLASI, sayısal etki hesaplandı, uygulama ölçülmedi).** `layers.js:153-157` ve
   `cost-model` tek `cellSizeM` ile iki eksende de gradyan alıyor. Kanonik doğu aralığı gerçek yere göre
   (1/cos φ) şişkin: legacy için gerçek doğu aralığı ~0,992 m (uygulamadaki 1,00966 yerine), USGS için ~0,949 m
   (1 m yerine). Bu, doğu-batı gradyan bileşenini legacy'de ~%1,7, USGS'te ~%5 düşük gösterir. Tahmin; uygulama
   sayılarıyla ölçülmedi.
4. **Ortomozaik kaydı kanıtlanamadı (DOĞRULANDI).** Aktif legacy DTM ile ortomozaik arasında kayıt kanıtı yok. UI'de
   hizalı diye sunulmamalı; overlay varsa "kanıtlanamadı" etiketi uygun.
5. **Karar kuralı çok katı (Alparslan/kullanıcı kararı; değiştirilmedi).** (c) gradyan kriteri, USGS kontrolünde bile
   geçmedi (r = 0,114, fark 0,025). Kural, mevcut boru hattıyla hiçbir veri setinde *ölçüldü* üretmiyor. Eşikler
   önceden sabitlendiği için bu çalışmada gevşetilmedi; bir sonraki aşamada ayrı bir önceden-kayıt kararı gerekir.
6. **Z17 mozaiğin kaynak yarım-piksel kaydı kanıtlanmadı (`ortho-alignment-z17-tiles.json` `registration`).**
   Bu, 39A bulgusuyla tutarlı; K3-8 bunu çözmez.

---

## 6. Testler ve doğrulama

- Yeni birim testleri: `node --test test/legacy-analysis.test.mjs` → **10/10 yeşil** (yalnız sentetik girdiler;
  gerçek veri dosyalarına bağımlılık yok). Kapsam: anizotropik Horn ve parlaklık gradyanı, no-data komşuluğu, mozaik
  örnekleme (alpha=0 ve kapsam dışı), ön-kayıtlı karar kuralları, bilinen (+2,−1) px kaydırmanın uçtan uca geri
  bulunması, bilinen (3,−2) m konum kaydırmasının geri bulunması (düz düzlem yerine sinüzoidal yüzey; düz düzlemde
  kaydırma sabit ofset olur ve std bunu göremez), düzenli çerçeve merkezleri, eğim payı, no-data bit deseni.
- Tam paket: `cd Sim; node --test test/` → **611/611 yeşil, çıkış kodu 0** (başlangıç 601 + 10 yeni).
- Gerçek veri çalıştırmaları: `node scripts/validate-ortho-registration-legacy.mjs --out …\scratchpad\k3-legacy`
  (çıkış 0, ~23 s), `--shiftRange 30 --shiftStep 1 --shiftStride 4` (ek tarama), `node scripts/legacy-analysis.mjs --json …`
  (çıkış 0).
- Yardımcı çıktılar (repo dışı): `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\k3-legacy\k3-8-ortho-registration-legacy.json`,
  `…\k3-legacy\wide\k3-8-ortho-registration-legacy.json`, `…\k3-legacy\k3-9-legacy-analysis.json`,
  `…\k3-legacy\independent-check.mjs`, `…\k3-legacy\full-test.txt`.

## 7. Çalıştırılmayanlar ve sınırlar

- Tarayıcı ve smoke testi çalıştırılmadı (talimat gereği).
- Git commit/push yapılmadı (talimat gereği); üç yeni dosya ve bu rapor commit bekliyor.
- Z14 ortomozaik (kaba, ~2,5 m/px) test edilmedi; JP2 kapsam dışı.
- Legacy f32 SHA-256 (`05c48a93…`) hesaplandı ama beklenen değerle karşılaştırılmadı (uygulama legacy için SHA
  denetlemiyor); **doğrulanamadı**.
- USGS ↔ legacy kaynak farkının nedeni (ürün kalitesi, tie-point) ayrı bir iş; bu raporda ölçülmedi.
