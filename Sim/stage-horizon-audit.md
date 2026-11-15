# Stage K2-3/K2-4: Bölgesel bağlam ufku (MOLA-sınıfı, pass 7) ve gövde ankrajı düzeltmesi (Efe)

Etiketler: **ÖLÇÜLDÜ** = bu turda hesaplandı; **DOĞRULANDI** = bağımsız betik ham dosyadan yeniden hesapladı; **GÖRSEL YAKLAŞIM** = sunum parametresi, ölçüm değil.
Datum durumu her koşulda `needs_review`. Ufuk yürünebilirlik puanı üretmez ve rota yüksekliğiyle birleştirilmez.

## 1. Dosyalar

| Dosya | Durum | Rol |
|---|---|---|
| `Sim/public/js/view/3d/horizon-mesh.js` | yeni, SAF | `regionalGridFromBinary`, `buildHorizonMesh`, sabitler (`HORIZON_DEFAULTS`, `HORIZON_HAZE`, `HORIZON_NEAR_M`, `HORIZON_FAR_M`, `HORIZON_LABEL`). DOM/GL/ağ/dosya yok. |
| `Sim/test/horizon-mesh.test.mjs` | yeni | 17 test; gerçek `mola-jezero.f32/.json` ve `dtm_subset.json` diskten okunur. |
| `Sim/test/first-person-body-anchor.test.mjs` | yeni | 3 test; gövde ankrajı. |
| `Sim/public/js/view/3d/renderer.js` | değişti | Pass 7 (shader + yükleme + çizim + dispose + tanılama), `?horizon=off` ve `horizon` seçeneği, `firstPersonBodyOrigin` (ankraj düzeltmesi). |
| `Sim/public/js/main.js` | değişti | Yalnız veri yükleme (`loadHorizonGrid`), kurma (`buildHorizonForTerrain`, terrain kurulumu ve ölçek değişiminde), `renderFrame({horizonMesh})`, `getDiagnostics().horizonStatus`. |
| `Sim/public/js/view/3d/camera.js` | değişmedi | Ayrı projeksiyon `getViewProjectionMatrix({...camera, nearM, farM})` ile kuruldu. |

Değişmedi: `config.js`, `simulation/`, `surface/`, `route/`, `geo/`, `minimap/`, `index.html`, `astronaut-rig.js`, `camera-motion.js`, `scripts/smoke-e2e.mjs`, `test-output` (smoke sonrası geri yüklendi).

## 2. API

```js
buildHorizonMesh({
  regionalGrid,        // regionalGridFromBinary(meta, arrayBuffer)
  localWindowBounds,   // {xMin,xMax,yMin,yMax} yerel DTM penceresi (m)
  localFrame,          // {adapter}: yerel DTM ile AYNI adapter (tek metre düzlemi)
  displayConfig,       // {referenceElevationM, verticalScale}
  innerMarginM = 2, outerRadiusM = 80000, minSpacingM = 463, spacingGrade = 0.01,
  skirtDepthM = 25, curvature = true, maxVertices = 150000, elevBoundsDisplay = [-20, 20],
  localElevationAt,    // isteğe bağlı: yalnız dikiş ölçümü için, geometriyi değiştirmez
})
```
Çıktı: `positions`, `normals`, `colorsRgb` (doğrusal albedo), `indices` (Uint32), `sourceElevationsM`, `bounds`, `provenance`, `displayConfig`, `meta` (derin donmuş; `layer:'regional-context'`, `walkability:false`, `datumStatus:'needs_review'`, etiket, parametreler, sayaçlar, dikiş ölçümü).

`localElevationAt` kullanılmadığında `seam.status = 'not_measured'`. `main.js` yerel DTM örneklemesini `STATUS.OK` ile geçirir.

## 3. Geometri

- Düzgün olmayan tensör ızgara (yerel metre). Her eksende aralık `max(463 m, 0,01 × pencere kenarına uzaklık)`; pencere içinde 463 m düzgün düğümler. Kenar hücreleri `outerRadiusM` (80 km) içinde kalır.
- Yerel pencere (+2 m marj) içindeki hücreler çıkarılır; ufuk pencereyle çakışmaz (test: hiçbir üçgen merkezi pencere içinde değil).
- Her dört köşesi geçerli hücre üçgene dönüşür. No-data veya kapsam dışı köşesi olan hücre atlanır; 0 ile doldurulmaz.
- Dikiş: iç dikdörtgen çevresinde aşağı doğru 25 m etek (ayrı tepe/dip kopyaları, yatay iç normaller). Etek rengi, aynı düğümdeki yüzey rengini alır.
- Mars eğriliği: `z -= (x²+y²)/(2R)`, R = 3 396 190 m; teğet noktası çerçeve orijini (WB1). Kapalıyken fark tamamen 0 (test).
- Dikey ölçek: `(z − ref − drop) × verticalScale`. Ölçek ≠ 1 ise `meta.visualExaggerationNote` yazılır. Kaynak yükseklikler (`sourceElevationsM`) ölçeklenmez.
- Renk: `terrain-shading.js` palet ve eğim kuralları (pass 0 ile aynı); yükseklik aralığı renderer'ın fiilen kullandığı `[-20, 20]` (bkz. Bölüm 9).

## 4. Pass 7 ve projeksiyon

- Sıra: gökyüzü (pass 3) → **pass 7 (ufuk)** → yerel arazi (0) → ... Shadow pass (4) ufku çizmez; ufuk gölge almaz ve vermez.
- Projeksiyon: `getViewProjectionMatrix({...camera, nearM: 60, farM: 200000})`; `camera.js` değiştirilmedi. Yerel projeksiyon (0.05–3000 m) aynen kullanılır.
- Ufuk çizildikten sonra `gl.clear(DEPTH_BUFFER_BIT)`; yerel arazi, izler, rota şeridi ve rig normal derinlik hassasiyetiyle çizilir.
- Aydınlatma: `vColor × (güneş irradyansı × NdotL + gökyüzü ambient)`, ardından `applyAerialPerspective` ile yoğunluk `1.6e-4 /m`, maksimum `0.95` (GÖRSEL YAKLAŞIM). `finishColor` ton eşlemesi.
- Anahtar: `?horizon=off` veya `createTerrainRenderer(..., {horizon:false})`. Yükleme/yükleme hatasında sessizce `unavailable`.
- `getDiagnostics().renderer.horizon = {status:'ready'|'off'|'unavailable', triangles, label}`. `main` tarafında `horizonStatus` da var.

## 5. Ölçümler

| Ölçüm | Değer | Etiket |
|---|---|---|
| Vertex / üçgen (varsayılan) | 84 704 (yüzey 84 676 + etek 28) / 168 112 | ÖLÇÜLDÜ |
| Düğüm ızgarası | 314 × 315; kenar aralığı 463 m (yakın) → 762 m (80 km) | ÖLÇÜLDÜ |
| Ayrıştırma (decimation) | 0 adım (150 000 sınırının altında) | ÖLÇÜLDÜ |
| Kurma süresi (Node, scale 1 / 3) | ~90–125 ms / ~65–100 ms | ÖLÇÜLDÜ |
| Ham MOLA aralığı (ufuk örnekleri) | −3520,6 … −262,7 m | ÖLÇÜLDÜ |
| Mars eğriliği düşüşü 80 km | 942,2 m | ÖLÇÜLDÜ (formül) |
| **Dikiş: MOLA − yerel DTM** (pencere kenarından 1 m içeride, 25 m örnek aralığı, n = 226) | ortalama **−1,23 m**, std **3,85 m**, en büyük |fark| **13,03 m** | ÖLÇÜLDÜ |
| Maksimum uzak yükselti (80 km, pencere dışı MOLA, tüm azimutlar) | **4,39°** (gözün üstünden) | DOĞRULANDI (bağımsız betik) |

Not: `audit37` bütün pencere için ortalama +0,17 m / std 4,27 m vermişti; bu dikiş ölçümü yalnız kenar şeridini örnekler, bu nedenle farklı bir sayıdır. Birleştirme eşiği (audit37: 10 m) bu dikişte aşılmıyor, ama kenar tek tek 13 m'ye kadar çıkıyor; görsel basamaklar buradan gelir.

## 6. Ekran görüntüleri (WB1, göz yüksekliği, eğim 0,03 rad)

Dosyalar (scratchpad):
- Önce (`?horizon=off`): `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\horizon\shots\before-{K,D,G,B}.png`
- Sonra (varsayılan, son kod): `...\scratchpad\horizon\shots\after2-{K,D,G,B}.png`
- Rota + ilk şahıs: `...\shots\before3r-route-fp.png`, `...\shots\after3r-route-fp.png`
- Büyütülmüş ufuk bandı (üstte önce, altta sonra): `...\shots\band2-K.png`, `...\shots\band2-G.png`

Dürüst değerlendirme:
- **Kazanım:** Önce, yerel pencere bitince zemin ~500 m'de düz bir kesim gibi sona eriyor ve gökyüzü doğrudan başlıyordu. Sonra arazi pencerenin ötesinde sürüyor; uzak yamaçlar ve yumuşak sırtlar sisle gökyüzüne karışıyor. Bu, kullanıcının şikâyetini (ufukta hiç arazi yok) giderir.
- **Sınır:** Veri ~463 m/piksel ve pencere dışı en yüksek açı 4,4°. Silüet keskin tepeler değil, alçak ve yumuşak sırtlar. Jezero krater kenarı (yaklaşık 10–20 km) yaklaşık 1–2° düzeyinde kalır; görsel olarak zor fark edilir. Veride olmayan keskin silüet eklenmedi.
- **Kuzey (K) görünümü:** Sol tarafta geniş, düz bir sis rampası oluşuyor. Bu, veri olarak doğru bir uzak yamaçtır, ama fotogerçekçi değildir; sis gibi okunabilir.
- **Güney (G) görünümü:** Pencere kenarında ~3 px yüksekliğinde hafif bir basamak (yüzey MOLA ile yerel DTM arasındaki 1–13 m fark) ve koyu bir etek şeridi görünür. Etek çatlağı kapatır, ama basamak gizlenmez. Birleştirme yasak olduğu için bu kabul edilmiş bir sınırlamadır.
- **Rota karesi:** Rota şeridi, izler, HUD ve rig değişmedi; ufuk farkı burada da küçük.
- **Karar:** Varsayılan AÇIK bırakıldı (kullanıcının istediği yön ve sürekli ufuk), kapatmak için `?horizon=off`. Kazanım mütevazı; "belirgin tepe silüeti" iddia edilmiyor.

## 7. Bağımsız ufuk profili doğrulaması

Betik (`scratchpad\horizon\verify-profile.mjs`) yalnız ham `mola-jezero.f32/.json` ve `dtm_subset.f32/.json` dosyalarını okur; proje modülü kullanmaz. Kendi bilineer örnekleyicisi, kendi equirectangular formülü ve kendi kamera projeksiyonu ile, göz noktası WB1 için her azimut için yerel DTM (pencere içi) ve MOLA (pencere dışı, `d²/2R` düşüşlü) üzerinden düşey açı profili hesaplar. Sonra ekran sütunlarında ilk görünür ufuk satırını öngörür ve `before`/`after` farkının ilk değişen satırıyla karşılaştırır (fark eşiği > 1 LSB; 6 LSB eşiği ince silüeti kaçırdı, bu bir ölçüm hatasıydı).

| Yön | Sütun (öngörü/gözlem, px) | Sonuç |
|---|---|---|
| K (kuzey) | 465/465, 467/468, 473/473, 479/479, 479/479 | 5/5 |
| D (doğu) | 482/482, 485/yok, 485/484, 468/476, 483/483 | 3/4 (1 sütun görünmez, 1 sütun 8 px) |
| G (güney) | 476/476, 474/474, 468/473, 464/469, 448/455 | 2/5 birebir; 3 sütun 5–7 px aşağıda |
| B (batı) | 447/447, 447/448, 447/447, 465/466, 453/453 | 5/5 (≤1 px) |

Yorum: 17 gözlemli sütunun 14'ü 1 px içinde; üç farkın nedeni en uzak yamaçların üst kenarının gökyüzü sisiyle aynı renge karışması (eşiğin altı). Geometri ve projeksiyon doğru; ufuk silüeti ham veriden bağımsız olarak doğrulandı.

## 8. Gövde ankrajı düzeltmesi (K2 bulgusu)

- Kök neden doğrulandı: `bodyOrigin = [camera.xM, camera.yM, camera.zDisplay - camera.eyeHeightM]`; `camera.zDisplay = bodyZ + (eyeHeight + eyeOffset)·scale`, dolayısıyla gövde Z'si göz dip/bob ofsetini taşıyordu.
- Düzeltme: `firstPersonBodyOrigin(camera)` (renderer.js, export) → `camera.bodyAnchorZDisplay` (zaten `setFirstPersonPose` tarafından yazılıyor) ve `bodyAnchorXM/YM`. Ankraj yoksa eski formül (geriye dönük).
- Test: `first-person-body-anchor.test.mjs` 3/3. Göz ofseti −0,12 … +0,04 m için gövde Z sabit; göz ofseti hâlâ hareket ediyor.
- Çizim sırası, eller ve gölge değişmedi.

## 9. Gözlenen, değiştirilmeyen davranış (Alparslan'a not)

- `renderer.js` pass 0 renklendirmesi `terrainMesh.bounds.minZDisplay` okur, ama `buildTerrainMesh` bu anahtarı üretmez (`minZ`/`maxZ` üretir). Sonuç: renk rampası sabit `[-20, 20]` aralığına göre hesaplanıyor. Bu mevcut bir davranış; ufuk renkleri uyum için aynısını kullanır. Düzeltmek terrain renklerini değiştirir, bu yüzden dokunulmadı.
- `main.js` ve `renderer.js` dosyalarında UTF-8 Türkçe metinler PowerShell `Get-Content` ile yanlış (cp1252) okunuyor; dosyalar UTF-8 olarak doğru. Düzenleme araçları etkilenmez.

## 10. Performans

| Ölçüm | Horizon kapalı | Horizon açık |
|---|---|---|
| Smoke 6c (son koşu, ufuk açık) | — | 82,1 |
| Smoke 6c (ilk koşu, ufuk açık) | — | 81,1 |
| Aynı ortamda, WB1 dirs (fpsOff/fpsOn) | 82,3 | 79,3 (~%3,6 düşüş) |
| Rota modu (`route-fp`) | 28,1 | 27,7 (rota planlama yükü, horizon değil) |
| `frameRenderMs` (ortalama) | 0,70 | 0,80 |

Hedef: 60 FPS'in altına düşmedi; vertex azaltması gerekmedi.

## 11. Doğrulama

- `cd Sim; node --test test/` → **573/573**, çıkış kodu 0 (başlangıç 553 + 20 yeni: `horizon-mesh.test.mjs` 17, `first-person-body-anchor.test.mjs` 3). Ayrıntı: `scratchpad\horizon\full-tests.txt`.
- `npm run smoke` → **38/38**, çıkış kodu 0; 6c 82,1 FPS; 6i, 32b ve rota/iz kontrolleri geçti. Ayrıntı: `scratchpad\horizon\smoke2.txt`.
- Smoke çıktıları takipli `Sim/test-output/*.png` dosyalarını değiştirdi; `git checkout -- Sim/test-output` ile geri yüklendi, yeni takipsiz PNG'ler silindi.

## 12. Açık sorunlar ve sınırlar

1. Dikiş basamakları (1–13 m) görünür; birleştirme yasak. Alternatif, yerel DTM'nin kenarına veri-bağımsız bir geçiş yapmak da kural dışı; kabul edilen sınırlama.
2. Yükseklik datumu ve MOLA enlem konvansiyonu doğrulanmadı (`needs_review`). Yerel DTM `MAP_FRAME.verticalDatumVerified: true` iddiasını taşıyor, ama `dtm_subset.json` `verticalDatumVerified: false` diyor; bu çelişki bu görevde çözülmedi.
3. Lisans: ImageServer `copyrightText` boş; meta "belirtilmemiş" der.
4. Ufuk pencere dışında 80 km'ye kadar; ötesi (≥80 km) çizilmez, ama o mesafede eğrilik düşüşü (~0,94 km) zaten çoğu yüzeyi gizler.
5. Eğrilik teğet noktası WB1; kamera pencere içinde 1 km'ye kadar kayınca 80 km'de ~25 m kayma olabilir.
6. Dal durumu: çalışma ağacı `codex/k1-acceptance` dalında (HEAD `7375240`, merge commit'leri). Görev `codex/efe-visual-realism` (`f7ea37b`) diyordu; `git diff f7ea37b HEAD -- Sim` boş, yani Sim kaynağı aynı. Dal değiştirilmedi.

## 13. Çalıştırılmayanlar / ortam notları

- Commit ve push yapılmadı (orkestra şefi yapacak).
- Arka planda bu oturumdan kalan iki `node server.mjs` süreci (PID 35964, 21440) ve kullanıcının tarayıcı süreçleri görüldü; bunlara dokunulmadı.
- `Sim/data/regional-dem/` dosyaları git'te takipli (ls-files ile doğrulandı); `.gitignore` değiştirilmedi.
