# Stage: Otomatik kalite yönetimi (quality governor) ve yer gölgesi incelemesi

Kapsam: yalnız görsel kalite. Kot, eğim, no-data, rota ve mesh geometrisi değişmedi. Tüm değerler sunum parametresidir; ölçülmüş fiziksel değer değildir.

## 1. Governor API

`public/js/view/3d/quality-governor.js` (saf modül, DOM/WebGL/saat yok, zaman kare aralıklarının toplamıyla ilerler).

- `createQualityGovernor({ mode, levels, thresholds })` → `{ update(frameDtMs, { hidden, paused }), getState(), setMode(mode), reset() }`
- `update` döndürür: `{ level, changed, reason }`. Nedenler: `warmup`, `filling`, `settle`, `hold`, `outlier`, `hidden`, `paused`, `manual`, `frame-time-low`, `frame-time-severe`, `frame-time-recovered`, `invalid-sample`.
- `getState()`: `{ mode, level, levelIndex, medianFrameMs, medianFps, sampleCount, elapsedS, changeCount, changes[] }`. `changes` her adımın `{ tS, from, to, reason }` kaydıdır (son 100).
- Eşikler (`QUALITY_GOVERNOR_DEFAULTS`): hedef 45 fps, düşük 35 fps, toparlanma 55 fps; pencere 30 kare (en az 15 örnek); ısınma 3 sn; düşürme beklemesi 2 sn (35 fps altında 1 sn); yükseltme beklemesi 10 sn ve en az 15 sn seviyede kalma; değişiklik sonrası 1,5 sn örnek atılır; tek kare > 250 ms aykırı değerdir (ardışık uzun kareler gerçek yavaşlık sayılır).

## 2. Seviye → ayar tablosu (`QUALITY_LEVEL_SETTINGS`)

| Seviye | Gölge | Mikro detay | Çakıl | Kaya | Krater | Toz | Ufuk | Ayak izi |
|---|---|---|---|---|---|---|---|---|
| high (varsayılan) | high (2048, 3×3) | 1 | 1 | 1 | 1 | 1 | açık | tümü |
| medium | low (1024, 1 tap) | 0,6 | 1 | 0,6 | 0,6 | 1 | açık | tümü |
| low | off | 0,3 | 0 | 0 | 0 | 1 | açık | tümü |
| minimal | off | 0,3 | 0 | 0 | 0 | 1 | **kapalı** | **son 60** |

Kazançlar shader'da `uDetailGain` (vec4) ve `uDustGain` (float) uniform'larıyla uygulanır; 0 olan katman dallanmayla atlanır. `high` kazançları 1 olduğundan görüntü önceki sürümle aynıdır (görsel karşılaştırma yapıldı). Gölge kullanıcı `?shadows=` veya seçeneğiyle sabitlendiyse governor gölgeye dokunmaz.

## 3. Entegrasyon noktaları

- `public/js/main.js:21` governor import; `1943–1948` kare başında `qualityGovernor.update(...)` ve `renderer3d.setQualityLevel(...)` (yalnız 3D görünüm, ayrıca gizli sekme, duraklatma ve kurulum paneli ölçülmez); `1956–1960` `?quality=` okuma ve `withQualityDiagnostics`; `2140` `getDiagnostics().renderer.quality`.
- `public/js/view/3d/renderer.js`: `215` pass 0 kazanç koşulları; `635` durum değişkenleri; `1242`, `1251` ufuk geçidi; `1268` kazanç uniform'ları; `1379` ayak izi sınırı (`firstDrawn`); `1581` `appliedQuality` tanılama alanı; `1626` `setQualityLevel`.
- Shadow ön ayarı `applyShadowQuality` ile (eski `setShadowQuality` davranışı korundu).

## 4. Ölçümler (headless Edge, GPU'ya bağlı yük için DPR 2)

| Koşul | FPS | Not |
|---|---|---|
| DPR 1, high, boşta | 61 (önce) / 73 (sonra, tekrar) | değişiklik öncesi ve sonrası aynı mertebe |
| DPR 2, high (pinned) | 32,3 | gölge 2048 + 3×3 |
| DPR 2, medium (pinned) | 34,9 | gölge 1024 1-tap, detay azaldı |
| DPR 2, low (pinned) | 40,5 | gölge kapalı |
| DPR 2, minimal (pinned) | 41,0 | ufuk kapalı, ayak izi sınırı |
| DPR 2, auto | 44,5 (son 4 sn) | ortalama medyan 48 fps |
| DPR 1, auto, boşta | 71,6 | düşürme olmadı (doğru) |
| DPR 1, auto, 25 ms CPU boş döngüsü | 38,7 | minimal'a indi, kazanç yok (CPU sınırlı) |

Otomatik geçiş kayıtları (DPR 2, auto):
- t=5,44 sn high → medium (frame-time-low)
- t=9,36 sn medium → low (frame-time-low)
- t=15,97 sn low → minimal (frame-time-low)

Birim test: `test/quality-governor.test.mjs` (18 test). Smoke (auto, varsayılan): 38/38.

## 5. Yer gölgesi okunabilirliği (K2-5)

Görünüm: `fp-ground-shadow` (güneşe sırtı dönük, aşağı bakış). Ölçüm: aynı görüş çizgisinin dikey piksel profili.

Denenen ve geri alınan değişiklikler (`shadow-map.js` HEAD'e döndü, fark yok):
- PCF aralığı 1 texel → 0,5 texel: kenar gradyanı ~%9, toplam gradyan ~%17 arttı. Görsel olarak belirgin değil; geri alındı.
- Eğim bias'ı 1,2 → 0 ve taban bias 0,025 → 0,5 m: piksel değerleri değişmedi (bu görünümde bias gölge yerini etkilemiyor).
- Kenar sönümü 0,08 → 0,0001: değişmedi.
- 1024 çözünürlük / 1 tap (`low`): gradyan genişliği benzer.

Sonuç: gölgenin yumuşaklığı kernel, bias ve çözünürlükten bağımsız. Fiziksel penumbra (~21' güneş) milimetre mertebesindedir; gözlenen geçiş yaklaşık 0,3–0,5 m ölçeğindedir. Kaynağı bu kapsamda tanımlayamadım; olası neden sahne/rig gölge yazımındadır ve doğrulanmadı. Gölge kontrastı büyük ölçüde gökyüzü ortam oranına (`sky-model.js`, `diffuseToDirectRatio = 0,5`) bağlıdır; bu dosya bu görevin kapsamında değildir ve değiştirilmedi.

## 6. Riskler

- Yanlış alarm: governor her yavaşlamayı (CPU, 2D minimap, sekme arka planı) GPU yükü gibi değerlendirir. Örnek: demo modundaki 2D minimap kaynaklı düşüş (`stage-perf-and-preference-review.md`) 3D kaliteyi gereksiz yere düşürebilir. Renderer'ın kendi CPU süresi (`frameRenderMs`) GPU darboğazını ayırt etmek için yeterli değildir; GPU zamanlaması (`EXT_disjoint_timer_query_webgl2`) tarayıcı desteğine bağlıdır.
- Titreme: minimum 15 sn bekleme ve 2 sn düşürme beklemesi ile sınırlı; yine de 45–55 fps bandında iki seviye arasında gidip gelme olabilir.
- `low` seviyesinde kayalar ve krater dokusu kalkar; zemin daha düz görünür (kabul edilebilir, ama sunumda bilinmeli).
- Medium'un FPS kazancı küçüktür (32→35 fps); asıl kazanç shadow kapatmada (`low`/`minimal`).

## 7. Çalıştırılmayanlar / sınırlar

- `now` enjeksiyonu yapılmadı; zaman kare aralıklarından toplanır (deterministik olduğu için).
- Gerçek kullanıcı donanımında (iGPU) doğrulama yapılmadı; ölçümler headless Edge üzerinde.
- Kalite seçimi kullanıcıya gösterilmiyor; yalnız `?quality=` ve diagnostics ile kontrol edilir.
- Git commit/push yapılmadı (kullanıcı talimatı).
