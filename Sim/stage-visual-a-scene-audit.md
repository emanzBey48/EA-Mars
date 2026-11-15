# Stage Visual A: Mars sahnesi görüntü gerçekçiliği — denetim ve sonuç

Kapsam: `public/js/view/3d/renderer.js`, `sky-model.js`, `shadow-map.js`, `terrain-shading.js`. Veri, kot, eğim, no-data, rota ve geometri değişmedi; yalnız gölgelendirme ve ışık değişti. Görsel çıktılar sunum parametreleridir, radyometrik ölçüm değildir.

## 1. WIP denetimi (commit `a1078f1`)

- `node --test test/`: WIP ile 444/445 geçti; tek kırmızı test `astronaut-rig.test.mjs` (Ajan B'nin rig değişikliği, bu ajanın kapsamında değil).
- Tarayıcı: sahne siyah veya bozuk değil, shader derlemesi hatasız, konsolda yalnız `favicon.ico` 404 (baseline'da da vardı).
- Onarılan / düzeltilen:
  1. Gökyüzü, güneş diski ve aerial haze, görüntüleme ışınlarıyla (ekran uzayı) aynı uzayda olması için `uSkySunDir` eklendi (`normalize(x, y, z·verticalScale)`). `verticalScale = 1` iken eşdeğer; 2–3× ölçekte güneş diski ve halo gölge yönüyle uyumlu hale geldi. Gölgelendirme (`uLightDirection`, fiziksel güneş + fiziksel normal) değişmedi; bu ikisinin çarpımı tutarlıdır.
  2. `renderer.js` satır sonları karışıktı (CRLF/LF); CRLF'e normalize edildi.
  3. `sky-model.js` kaynak başlığı önceki WIP tarafından "okundu" diye yazılmıştı; bu oturumda URL'ler gerçekten okundu (aşağıda) ve başlık buna göre düzeltildi.
- Doğrulanan kaynaklar (bu oturumda WebFetch ile okundu):
  - NSSDC Mars Fact Sheet: yarı-büyük eksen 1.52366 AU (modül 1.524 kullanıyor; fark güneş çapında <%0,1).
  - NSSDC Sun Fact Sheet: 1 AU'da görünen çap 1919″ (en büyük 1952″, en küçük 1887″).
  - PIA19400 yazısı: ince toz mavi ışığın daha verimli geçmesine izin verir; etki "güneş batımına yakın en belirgin". Yalnız niteliksel; sayısal renk/yoğunluk değerleri bu kaynaktan gelmez.

## 2. Hedeflerin durumu

| Hedef | Durum | Not |
|---|---|---|
| 1. Doğrusal ışık + ACES + sRGB tek geçiş | Çalışıyor | Tüm geçişlerde son adım `finishColor`. Rota/beacon çizgileri `EMISSIVE_GAIN` ile okunur kaldı. |
| 2. Gökyüzü (butterscotch, güneş diski, halo, ufuk tozu) | Çalışıyor | 21′ disk, mavi halo alçak güneşte artıyor. Halo güneşe yakın bölgede belirgin ve biraz "parlama" gibi. |
| 3. Gökyüzünden ortam ışığı | Çalışıyor | `marsSkyAmbient` arazi ve rig için aynı fonksiyon. |
| 4. Arazi yüzey görünümü | Kısmen | Palet ve eğim koyulaşması çalışıyor; ortho varsa luminans ortodan, kroma paletten. Mikro detay yakın planda çok düşük genlikli: ön plan hâlâ tekdüze. |
| 5. Gölge haritası | Çalışıyor | PCF 3×3 (`high`), 1-tap (`low`), `off`. Depth yoksa sessizce kapalı. Rig gölge atar. |
| 6. Sis / hava perspektifi | Çalışıyor | Sis rengi gökyüzü ufuk renginden. Arazi kenar sönümü yalnız uzak görüşte. |
| 7. Tanılama alanları | Çalışıyor | `lighting`, `renderTimingMs`, `shadows` eklendi; mevcut alanlar değişmedi. |

## 3. Sabitler ve etiketleri

Etiketler: **kaynak** = okunmuş URL; **sunum** = görsel yaklaşım, ölçülmüş değil.

| Sabit | Değer | Etiket |
|---|---|---|
| Güneş açısal çapı (Mars) | 1919″/1,524 ≈ 21,0′ | kaynak (NSSDC 1919″; 1,524 yuvarlama) |
| Gökyüzü, gradyan renkleri, halo ağırlıkları | — | sunum |
| Güneş rengi, yoğunluk, sönümleme (τ=0,12) | — | sunum |
| Ortam oranı (diffuse/direct = 0,5) | — | sunum (kaynak doğrulanmadı) |
| Mavi halo varlığı alçak güneşte | niteliksel | kaynak (PIA19400, yalnız niteliksel) |
| Gölge bias, çözünürlük 1024/2048, yarıçap 70/90 m | — | sunum |
| Arazi palet (butterscotch, RGB sRGB) | — | sunum (mevcut viewer paleti) |
| Viking MDIM ton ≈272° | — | **kullanılmadı** (işlenmiş renk) |
| Mikro detay genlikleri ve dalga boyları | — | görsel detay, veri değildir |
| ACES eğrisi (Narkowicz) | — | render kuralı; yayın katsayıları, bu oturumda okunmadı |

## 4. Önce / sonra

- Önce: `research/visual-realism/baseline-screenshots/before-*.png`.
- Sonra: `scratchpad/visual/after-*.png` (overview, fp-toward-sun, fp-horizon-away, fp-lookdown, fp-side, fp-sky).
- Gölge kontrolü: `scratchpad/visual/noshadow-fp-lookdown.png` (`shadows=off`). Aynı görünümde piksel farkı: ~%15 örnekleme noktası farklı, en büyük fark 81/765. Yan görünümde (fp-side) fark yok; gölge o açıdan görünmüyor.

Değerlendirme (dürüst):
- Gökyüzü: ufuk ve güneş çevresi daha atmosferik; güneş halesi önceki düz gradyana göre belirgin. Biraz fazla parlak.
- Arazi: uzak tepeler ve sırtlar artık şekil ve gölge veriyor; yakın arazi hâlâ tekdüze turuncu-kahve. Mikro detay görünür değil. Bu hedef tam karşılanmadı.
- Rig: ACES ile aydınlık bölgeler soluk bej. Rengi Ajan B'nin alanı; görünüm değişimi bu ajanın renderer'ından kaynaklanıyor.
- Ufuk: ~1 km sonra arazi bitiyor. Bu geometri/veri sınırı; yalnız kenar sönümü uygulandı, silüet eklenmedi.

## 5. Performans (aynı makine, Intel Iris Xe, D3D11)

- Önce: ~117,5 FPS; kare CPU süresi medyan 0,30 ms.
- Sonra (gölge `high`): ~107,9 FPS; medyan 0,60 ms. Ölçüm tekrarlı değil; tek koşu.
- Gölge kapalı (`shadows=off`): ~114,8 FPS; medyan 0,40 ms.
- GPU süresi ölçülmedi (CPU komut gönderim süresi).

## 6. Testler ve kabul

- Yeni testler: `test/sky-model.test.mjs` (16), `test/shadow-map.test.mjs` (12), `test/terrain-shading.test.mjs` (15). Hepsi geçti.
  - GLSL ↔ JS sabit eşitliği regex ile sınanıyor (sky ve terrain).
  - Türev testleri sonlu farkla karşılaştırılıyor.
- `node --test test/`: sonuç bu raporun sonunda (rig testi hariç Ajan B'nin).
- `npm run smoke`: 32/32. Smoke `test-output/` tracked görüntülerini değiştirdi; `git checkout --` ile geri alındı.

## 7. Açık noktalar

1. Yakın arazi detayı düşük: mikro tone genlikleri (%5–8) ve eğim genlikleri çok küçük. Artırmak için sunum kararı gerekir.
2. Gölge kenarları PCF 3×3 ile yumuşak; `high` varsayılan. Düşük donanımda `low` veya `off` seçilmeli.
3. Gölge depth yeniden çizimi hücre değişiminde tüm arazi üzerinde yapılır; GPU maliyeti ölçülmedi.
4. `verticalScale` > 1 iken gölge yönü ve gökyüzü güneşi artık tutarlı; ancak ortho terrain renklendirmesi değişmedi.
5. Favicon 404 mevcut bir sorun, bu iş kapsamında değil.

## 8. main.js önerileri (bu ajan değiştirmedi)

- Gölge kalitesi için `createTerrainRenderer(canvas, { shadows })` parametresi `config.js` veya kullanıcı tercihinden verilebilir; şu an URL `?shadows=` ve varsayılan `auto`→`high`.
- `getDiagnostics().renderer.lighting` HUD'a yalnız "sunum" etiketiyle eklenebilir.
