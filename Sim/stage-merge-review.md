# Stage merge review — Alparslan/Codex K1 birleşimi incelemesi

**Tarih:** 15 Kasım 2026
**Dal/çalışma ağacı:** `codex/efe-visual-realism` (worktree `C:\Users\efese\Desktop\Nasaspaceapps-efe`)
**İncelenen birleşim:** `26fa9b0`…`53068e6` (fare bakışı, ayak izi, `db15f8f` sahne/rota UI sadeleştirmesi, `3e1f570`, K1 kabul kayıtları, `b69eb2b` HUD uç değerleri)
**Commit/push:** yapılmadı (orkestra şefi yapacak).

## 1. Özet

| Konu | Sonuç |
|---|---|
| `npm run smoke` | Başlangıç **35/38** → son **38/38**. Kırmızı üç kontrol (1, 5a, 5b) ürün kuralı ihlali değil; etiketler kapalı `<details>` bölümlerinde duruyordu. Karar: erişilebilir kabul, smoke okuması güncellendi (bkz. §2). |
| `node --test test/` | **574/574**, çıkış kodu 0 (573 + yeni Efe regresyon testi). |
| Efe modülleri | Gerçek hata bulunmadı. Fare bakışı işareti, ayak izi sol/sağ ayrımı, kamera-motion sınırları doğru. Sole konturu için eksik test eklendi. |
| Alparslan dosyaları | Düzeltilmedi; bulgular §4'te (dosya:satır + öneri). En önemlisi: kontrol paneli ve "Katmanlar ve köken" açık değilse ürün etiketleri ilk bakışta görünmüyor; demo modunda FPS düşüşü. |
| K1 kabul kanıtı | 9 görüntünün 5'i iddiayı destekliyor; 4'ünde iddia görüntüyle desteklenmiyor veya kısmen destekleniyor (§5). `stage29-acceptance.md` içinde eski "9/9 PASS" bölümü yeni K1-2 bölümüyle çelişiyor. |
| Görsel regresyon | Efe sahnesi çalışıyor: eller/kollar alt köşede, gövde ileri bakışta yok, rota şeridi, uzak ufuk (`status: ready`), `rendererError: null`. |

## 2. Smoke kontrol 1, 5a, 5b — kök neden

**Teşhis yöntemi:** `git show bbf75b6:Sim/public/index.html` (son yeşil smoke) ile güncel HTML/JS karşılaştırıldı; her dizge için kapsayıcı `<details>` zinciri `index.html` satır numaralarından belirlendi. `document.body.innerText` kapalı `<details>` içeriğini dışarıda bıraktığı için bu kapsayıcılar kontrol sonucunu belirledi.

| Kontrol | Dizge | (a) HTML'den silinmiş mi? | (b) DOM'da ama kapalı/katlanmış mı? | (c) Yeniden ifade edilmiş mi? | Kaynak (güncel) |
|---|---|---|---|---|---|
| 1 | `yeniden başlat` (küçük harf) | Hayır | **Evet** — "Kontroller ve simülasyon" `<details>` (kapalı) | Hayır (`Yeniden başlat` düğmesi `:181`, küçük harfli metin `:176` ve `:198`) | `index.html:169-183`, `:176`, `:198` |
| 1 | `WASD` | Hayır | Hayır — `start-hint` görünür | — | `index.html:115` (geçer) |
| 5a | `DTEEC_045994_1985_046060_1985_U01` | HTML'de yok; JS üretir | **Evet** — `layerCard` `#layers` içine yazılır, kapsayıcı "Katmanlar ve köken" (kapalı) | Hayır (`surface/registry.js:10`) | `index.html:229-241`, `view/hud.js:30-66` |
| 5a | `Birim` | Hayır (JS: `hud.js:46`, değişmemiş) | **Evet** — aynı `#layers` kartı | Hayır | `view/hud.js:46` |
| 5a | `Mars 2000` (datum) | JS: `registry.js:103` → `hud.js:47` | **Evet** — aynı kart | Hayır | `surface/registry.js:103` |
| 5a | `senaryo varsayımı` | Hayır (metin aynen) | **Evet** — "Senaryo/UI" `<details>` (kapalı) | Hayır | `index.html:185-199`, `:195` |
| 5a | `NASA operasyon sınırı değil` | Hayır | **Evet** — aynı kapalı Senaryo bölümü | Hayır | `index.html:195` |
| 5a | `yerel equirectangular projeksiyon düzleminde hesaplanır` | Hayır | **Evet** — aynı kapalı Senaryo bölümü | Hayır | `index.html:195` |
| 5b | `Kot ve eğim yalnız arşiv DTM’sinden türetilmiş değerlerdir; …` | Hayır | **Evet** — "Hesaplanan" `<details>` (kapalı) | Hayır | `index.html:201-209`, `:208` |
| 5b | `Sürüş izi canlı telemetri veya güvenli rota bilgisi içermez.` | Hayır | **Evet** — "Katmanlar ve köken" (kapalı) | Hayır | `index.html:229-241`, `:237` |
| 5b | `EVA yürünebilirlik puanı ve kılavuz çizgi planlama göstergesidir; güvenli rota sertifikası değildir.` | Hayır | **Evet** — "Kaynaklar ve sınırlar" (kapalı) | Hayır | `index.html:243-254`, `:249` |
| 5b | `Planlama göstergesi — güvenli rota sertifikası değildir.` | Hayır | Hayır — `planning-disclaimer` rota panelinde açık | — | `index.html:158` (geçer) |

**Sonuç sınıflandırması:** (a) silinmiş — **yok**; (c) yeniden ifade — **yok**; (b) kapalı bölümde — **tüm eksikler**. Kayıp bir feragat metni yoktur; `bbf75b6`'daki metinler aynen durur.

**Kök neden:** `db15f8f` ("Simplify Marswalk scene and route UI") kontrol, senaryo, hesaplanan, rota, arşiv ve kaynak bölümlerini `<details>` içine aldı. Smoke ise görünür metni `innerText` ile okuyor; kapalı içerik okunamıyor.

**Uyumluluk kararı (ürün kuralı):**
- Zorunlu rota feragati "Planlama göstergesi — güvenli rota sertifikası değildir." rota sonuçlarının yanında **varsayılan olarak görünür** (`index.html:158`, `planning-disclaimer`; ayrıca `main.js` durum metinleri 422/470/553).
- Diğer kaynak/birim/datum/feragat etiketleri açılabilir `<details>` içinde ve erişilebilir. Kural bunu kabul eder; ürün kuralı ihlali sayılmadı. Kabul ettiğim risk: ilk açılışta kot/eğim değerleri ve bunların feragatı kapalı kalıyor (§4, bulgu 2-3).
- Feragat metinleri silinmediği için HTML'e dokunulmadı.

**Smoke değişikliği (yalnız kontrol 1, 5a, 5b; `Sim/scripts/smoke-e2e.mjs`):**
- `readTextWithDisclosuresOpen(expr)` yardımcısı eklendi: sayfadaki tüm `details` öğelerini geçici olarak açar, `innerText` okur, eski `open` durumlarını `finally` ile geri yazar. Varsayılan görünüm değişmez.
- Kontrol 1 `domText`, 5a/5b `text` bu okumayı kullanır. Beklenen metinler, regex'ler ve diğer kontroller değişmedi.
- 5b'nin "feragat dışı güvenli/güvensiz/tehlike" kontrolü açık bölümlerle de geçiyor: feragat dışı iddia bulunmadı.
- Ürün kuralı ihlali olmadığı için kontroller gevşetilmedi.

## 3. Efe modülleri incelemesi

| Dosya | Değişiklik | Doğrulama | Sonuç |
|---|---|---|---|
| `view/3d/camera-motion.js` | `idleBreathing` seçeneği (varsayılan `true`), tip kontrolü | Sınırlar: `maxPitchRad` 0,017 rad (≈0,97°) < 1°; `maxRollRad` 0,0104 rad (≈0,60°) < 0,6°; `softLimit` toplam ofsete uygulanıyor, bileşenlere değil. Testler `camera-motion.test.mjs:72-73` ve sertlik testleri geçiyor. | Hata yok. Not: `main.js:50` `idleBreathing: false` veriyor, yani uygulamada idle nefes kapalı (bkz. §4 bulgu 4). |
| `view/3d/footprint-trail.js` | Boot-sole konturu (16 çevre noktası + merkez), `soleContours`, `shapePointCount` | Sol vektör `(-uy, ux)`, yan ofset `side·L·(−sin h, cos h)` doğru; alternasyon yerleştirilen izler üzerinden çalışıyor; kontur bounding quad içinde (`SOLE_OUTLINE` ±0,5 / ±0,39); bir çevre örneği no-data ise iz düşmüyor (`skippedUnknown`). | Hata yok. **Eksik test eklendi** (aşağıda). |
| `test/footprint-trail.test.mjs` | Yeni test: kontur sayısı/uzunluğu, bounding quad içi, toe/heel, çevrede no-data ile iz reddi | `node --test test/footprint-trail.test.mjs`: 19/19 | Eklendi. |
| `input.js` (Alparslan, yalnız okundu) | `onLook(-movementX, movementY)` | `camera.js:197-203`: `yaw += dx·s`, `pitch -= dy·s`; pozitif yaw kuzeye = sola. Fare sağa → yaw azalır → sağa bakış ✓. Fare aşağı → pitch azalır → aşağı bakış ✓. `main.js:1413` ters çevirme yapmıyor (çift ters çevirme yok). | Kod doğru. Canlı pointer-lock testi yapılmadı (headless). |
| `renderer.js` (yalnız okundu) | Pass 7 (ufuk), pass 5 sole fan, `footprintVertexCountDrawn`, `horizon` tanısı | Pass sırası korundu (0–7); pass 7 sonrası derinlik temizleniyor; `horizonRequested` kapalıyken `status: 'off'`. Ayak izi fan: 16 üçgen × 3 = 48 köşe, `footprintVerticesPerSole` ile tutarlı. | Hata yok. Not: `lap('skyMs')` iki kez; `lap` `+=` ile biriktirdiği için ufuk süresi `skyMs`'e karışıyor (yalnız tanı etiketi). |
| `view/render.js` (yalnız okundu) | 2D sole yolu, `#24130e`, alfa 0,84 | Fallback yolu (`quads`) korunmuş. | Hata yok. |
| `view/hud.js` (yalnız okundu) | `observedMin/Max` yerine `windowStats` yedeği | `Number.isFinite` kontrolü; "bilinmiyor" yedeği | Hata yok. |

**Düzeltme yapılan Efe dosyası:** yalnız `test/footprint-trail.test.mjs` (yeni test). Üretim kodunda hata bulunmadığı için `camera-motion.js`, `footprint-trail.js`, `astronaut-rig.js` değiştirilmedi.

## 4. Alparslan dosyalarındaki bulgular (düzeltilmedi)

1. **`Sim/public/index.html:169`** — "Kontroller ve simülasyon" kapalı. İlk açılışta WASD/Yeniden başlat listesi ve düğmesi görünmüyor (start-hint yine WASD'yi anlatıyor). Öneri: `<details class="card disclosure" open>`.
2. **`Sim/public/index.html:201-209`** — "Hesaplanan" kapalı. Kot/eğim değerleri ve feragatı ilk açılışta gizli. Öneri: en azından özet satırı görünür olsun (ör. `v-elev`/`v-slope` summary içinde) ya da bölüm `open`.
3. **`Sim/public/index.html:229-241`** — "Katmanlar ve köken" kapalı. DTM kaynak/birim/datum kartları ve "Sürüş izi canlı telemetri…" feragatı kapalı. Kabul kanıtındaki 03 görüntüsü bu bölümü açıp çekilmiş.
4. **`Sim/public/js/main.js:50`** — `createCameraMotion({ idleBreathing: false })`. K2-1 kapsamındaki "nefes" uygulamada kapalı. Bilinçli bir karar mı, onaylanmalı.
5. **`Sim/public/js/view/3d/renderer.js:1190` ve `:1219`** — `lap('skyMs')` iki kez; ufuk süresi `skyMs` tanı alanına karışıyor. Düzeltme: ufuk için ayrı `lap('horizonMs')` anahtarı (tanı alanı, görsel etkisi yok).
6. **Demo modu FPS (`main.js` demo akışı, `?demo=1`)** — Aynı sahne, horizon açık: demo olmadan **97,3 FPS**; `demo=1` ile **29–30 FPS**. Horizon A/B: açık 29,1 / kapalı 30,3 → düşüş ufuktan değil. Demo modunun kare başına işi incelenmeli (K2-6 ile birlikte). Ölçüm headless Edge, GPU: Intel Iris Xe (ANGLE D3D11); yalnız CPU komut gönderim süresi ölçülüyor.
7. **`Sim/stage29-acceptance.md`** — dosyanın üst K1 bölümü doğru ("K1-2 tam PASS değildir"), ama alttaki eski "Stage 29A" bölümü (§1 "9/9 PASS", §2.1–2.9 PASS, §4 "Stage 30 … tam hazır") aynı dosyada çelişiyor. §2.3 "yaklaşık 84 m" ifadesi, 03 görüntüsündeki "yaklaşık 12 m" ile uyuşmuyor. Öneri: eski bölümü "superseded — K1 kayıtlarına bakınız" olarak işaretlemek.
8. **`Sim/acceptance-evidence/k1-2/07-2d-fallback.png`** — dosya adı yanıltıcı: görüntü manuel 2D geçişi; WebGL2 hatası fallback'i yalnız test-only (smoke 6g). Yeniden adlandırma öneri.
9. **`Sim/public/js/view/render.js` ile `view/3d/footprint-trail.js`** — 2D sole dolgusu `#24130e`, 3D pass 5 rengi `(0.19, 0.105, 0.072)` ≈ `#301b12`. Küçük fark; bilinçli mi onaylanmalı.

## 5. K1 kabul kanıtı denetimi (`Sim/acceptance-evidence/k1-2/*.png`)

| Görüntü | Rapordaki iddia | Görüntü ne gösteriyor | Destek |
|---|---|---|---|
| `01-demo-3d.png` | 3D birinci şahıs, eller, turkuaz şerit (33B), sarı planlı rota, turuncu gökyüzü | Eller alt köşede, turkuaz şerit, sarı planlı rota/koridor, turuncu gökyüzü ve arazi | **Destekli.** Güneş açısı ve renk doğruluğu iddia edilmemiş (kapsam doğru). |
| `02-gallery.png` | Sol 120 Navcam, LMST/UTC, NASA/JPL-Caltech künyesi, yön varsayım uyarısı | Sol 120 Sol Navcam, LMST/UTC, künye, "Tahmini yön, doğrulanmamış site çerçevesi varsayımına dayanır" | **Destekli.** |
| `02-gallery.png` | "Rover kamerasının tahmini yönüne bak" butonu 3D yönünü değiştirdi (PASS) | Öncesi/sonrası kare yok; butonun etkisi görüntüyle kanıtlanmıyor | **Desteklenmiyor** (metin beyanı). |
| `03-geology.png` | Njf, SIM 3464 1:75.000, ~12 m, 100–200 m belirsizlik, indikatif | Metinler birebir görünüyor | **Destekli.** |
| `03-geology.png` | DTM kalite satırı `-2592.83…-2546.74 m` (`b69eb2b`) | Görüntüde "Kalite" satırı yok (panel kırpılmış) | **Desteklenmiyor** (görüntüde yok). |
| `04-global-viking.png` | Viking global, 10.000 km ölçek, Viking kot/orto değil | 10.000 km ölçek ve "Viking … kot/orto verisi değildir" etiketleri okunuyor; başlangıç/bitiş etiketleri üst üste | **Kısmen destekli** (etiket çakışması). |
| `05-minimap-zoom.png` | 1 km → 500 m zoom | 500 m ölçek görünüyor; 1 km başlangıç karesi yok | **Kısmen destekli.** |
| `06-minimap-pan.png` | Sürükleyince işaretçiler tuval içinde kaydı | 05'e göre başlangıç/bitiş işaretçileri farklı konumda | **Kısmen destekli.** |
| `07-2d-fallback.png` | "2D fallback" | Manuel 2D geçiş; otomatik WebGL2 fallback değil | **İsim yanıltıcı**; "2D/3D elle geçiş" iddiası destekli. |
| `08-route-replanning.png` | Tercih değişince "Rota hesaplanıyor" ve eski özet yerine yenisi | Metin "Rota hesaplanıyor" ✓; **haritada önceki rota çizgisi hâlâ çizili** | **Kısmen.** "Bayat plan gösterilmemesi" görüntüyle desteklenmiyor: hesaplama sırasında eski geometri görünür. |
| `09-route-flattest.png` | "731 m ve yeni çizgi görüldü" | Özet 730 → 731 m; rota geometrisi 07/08 ile görsel olarak ayırt edilemiyor | **Desteklenmiyor** ("yeni çizgi" görsel olarak yok). Seçilen başlangıç/bitiş çifti tercihleri ayırt etmiyor. |

Dürüstçe `NOT-TESTED` işaretli maddeler (sıçrama/iniş, Sol 164 galerisi, gerçek no-data reddi, hızlı istek yarışı) için kanıt yok ve belgede de iddia edilmiyor. K1-2 "tam PASS değil" kararı görüntülerle uyumlu.

**Önerim:** K1-2 PASS'ten önce: (a) 03'e "Kalite" satırını içeren kırpma, (b) 08/09 için rota tercihlerinin farklı geometri verdiği bir çift ve öncesi/sonrası kare, (c) galeri yön butonu için öncesi/sonrası kare eklensin.

## 6. Görsel regresyon (Efe işleri)

Betik: `scratchpad\review\shoot-efe.mjs` (kopya; `SIM` = `Nasaspaceapps-efe\Sim`; portlar 8191/9444). Çıktılar:

- Scratchpad klasörü: `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\review\`
  - `efe-review-overview.png`, `efe-review-fp-toward-sun.png`, `efe-review-fp-horizon-away.png`, `efe-review-fp-lookdown.png`, `efe-review-fp-side.png`, `efe-review-fp-sky.png`
  - `efe-walk-overview.png`, `efe-walk-fp-lookdown.png`, `efe-walk-fp-horizon-away.png` (demo=1, 2,5 s yürüyüş sonrası)
  - `ab-on-overview.png`, `ab-off-overview.png`, `ab-nodemo-overview.png` (FPS A/B)

Gözlemler:
- **Birinci şahıs elleri/kolları:** alt köşelerde, gövde (PLSS/kask/vizör) ileri bakışta yok. ✓ (`efe-review-overview.png`, `efe-review-fp-lookdown.png`). Yakın bakışta eldivenler ve bilek halkaları görünür.
- **Uzak ufuk (pass 7):** `horizon.status = ready`, 168 112 üçgen; etiket "Bölgesel bağlam, ~463 m/piksel. Düşey datum doğrulanmadı. Yürünebilirlik puanı yok." Görüntüde ufuk siluetleri var (`efe-review-fp-horizon-away.png`); pass 7'yi yerel terrain'den görsel olarak ayırmak kesin değil, sayısal kanıt tanılardan geliyor.
- **Rota şeridi (pass 6):** `ribbonTris: 1336`; `efe-walk-overview.png` içinde turkuaz şerit ve arşiv izi görünür. ✓
- **Ayak izleri (pass 5):** `footprints: 8` tanılandı; `efe-walk-fp-lookdown.png` kadrajında izler ayırt edilemedi. **Görsel olarak doğrulanamadı** (kare açısı). Diagnostik var, görüntü kanıtı zayıf.
- **Konsol:** `rendererError: null`; tek konsol hatası `favicon.ico` 404 (zararsız).
- `fp-toward-sun`, `fp-side`, `fp-sky` kareleri üretildi ama ayrıntılı incelenmedi.

## 7. Test ve smoke sonuçları

- `node --test test/` → **574/574**, çıkış kodu 0 (yeni test dahil; başlangıç 573/573).
- `npm run smoke` → **38/38** (değişiklik sonrası çalıştırıldı; yukarıdaki §2 smoke değişikliği dahil).
- Smoke `Sim/test-output/` takipli 5 PNG'sini değiştirdi; `git checkout -- Sim/test-output` ile geri yüklendi. Takipsiz 4 yeni görüntü (`06-near-beacon-cleared.png`, `32b-2d-footprints.png`, `32b-3d-footprints.png`, `32b-jump.png`) silindi.
- Son `git status`: değişen dosyalar yalnız `Sim/scripts/smoke-e2e.mjs`, `Sim/test/footprint-trail.test.mjs` ve yeni `Sim/stage-merge-review.md`.

**Çalıştırılmayanlar / sınırlar:**
- Canlı tarayıcıda fare bakışı (pointer-lock) ve yürüyüşte ayak izi kadrajı tekrar test edilmedi; yalnız kod incelemesi ve tanılar.
- K1-2 tarayıcı kabulü yeniden yapılmadı; §5 yalnız mevcut görüntülerin denetimi.
- `scripts/preflight.mjs`, düşük GPU/mobil ölçümü, gerçek cihaz FPS ölçümü yapılmadı (K2-6).
- `index.html`, `styles.css`, `main.js`, `input.js`, `hud.js`, `render.js`, `minimap.js`, `renderer.js`, `config.js`, `simulation/`, `surface/`, `route/`, `geo/` değiştirilmedi.
- Ajan D belge dosyaları (`Sim/README.md`, `Sim/DEMO_NOTES.md`, `Sim/stage-final-acceptance.md`, `yapay zeka icin/road map.md`, `Sim/stage-handoff-efe-to-alparslan.md`) değiştirilmedi.
- Commit/push yapılmadı.
