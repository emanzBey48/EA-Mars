# Stage: Demo modu FPS düşüşü ve "En düz" tercih incelemesi

Kapsam: salt-okuma ölçümü ve kök neden analizi. Repo kodunda değişiklik yapılmadı; `node --test` ve `npm run smoke` bu incelemede çalıştırılmadı (düzeltme yok).

## Görev 1: Demo modunda FPS düşüşü

Ölçüm: başsız Chrome, 1600x1000, 3D görünüm, 3 sn `requestAnimationFrame` sayacı. Makine yükü koşulara göre değişti (demo koşusu 23–30 FPS aralığında); aşağıdaki fark ±5 FPS gürültünün çok üzerinde.

| Koşul | FPS | Not |
|---|---|---|
| normal (3D) | 76.7 / 81.3 / 81.4 | rota yok |
| `?demo=1` (rota + sunum) | 29.2 / 29.5 / 29.7 / 30.1 | düşüş burada |
| demo + `*{backdrop-filter:none}` | 28.7 | etkisiz |
| demo + minimap kartı `display:none` | 29.9 | etkisiz (rAF döngüsü sürüyor) |
| demo + `#presentation-hud` gizli | 30.4 | etkisiz |
| demo + ribbon çizimi atlanır (4008 index) | 23.3 (aynı oturumda referans 23.2) | etkisiz |
| demo + LINES çizimi atlanır | 27.8 / 28.8 | etkisiz |
| demo + `setLineDash` no-op | 25.2 | etkisiz |
| demo + `shadowBlur` = 0 (enjekte) | **73.5** | düzelir |
| demo + 2D canvas çizim çağrıları no-op | **72.7** | düzelir |
| demo, rota temizlendi (`#minimap-clear-points`) | 72.6 | düzelir |
| sunum modu, rota yok | 71.7 | sunum modu tek başına sorun değil |
| normal + backdrop-filter kapalı | 81.7 | etkisiz |

Renderer CPU süresi (`frameRenderMs`, `renderTimingMs`) tüm koşullarda 0.3–0.8 ms. Demo profilinde ana iş parçacığının ~%90'ı boşta. Yani darboğaz JS/WebGL çağrıları değil; 2D canvas'ın raster/kompozit maliyeti.

### Kök neden

`Sim/public/js/view/minimap/minimap.js` (Alparslan'ın dosyası):
- `draw()` (satır 339) rota varken tüm minimapi yeniden çiziyor (terrain `drawImage`, ortho, global base).
- Rota bloğu (satır 421–438) her segment için iki kez `stroke` yapıyor ve her segmentte `ctx.shadowBlur = 8` (satır 434) ile `globalCompositeOperation = 'lighter'` kullanıyor. Segment sayısı ~670; shadowBlur 2D canvas'ta en pahalı işlemlerden biri.
- Animasyon döngüsü (satır 519–527) rota varken her karede `draw()` çağırıp kendini yeniden planlıyor; görünürlük kontrolü yok. Bu yüzden minimap gizlendiğinde (display:none) bile maliyet sürüyor.

Demo'da rota, normal akışta yalnızca kullanıcı rota planladığında oluştuğu için ilk açılışta düşüş yok; jüri demosu rota+sunum modunu birlikte açtığında düşüş ortaya çıkıyor.

### Öneri (Alparslan, minimap.js)

1. Satır 434: segment başına `shadowBlur` kaldır. Glow'u rotayı tek `beginPath`/tek `stroke` ile bir kez çizerek ya da offscreen canvas'ta önceden üreterek uygula. Enjekte deney: 73.5 FPS.
2. Satır 519–527: animasyonu ~10–15 Hz ile sınırla ve minimap görünür değilken (kart gizli / 3D görünümde) yeniden planlamayı durdur (IntersectionObserver ya da görünürlük kontrolü). Display:none deneyi bunun da gerekli olduğunu gösteriyor.
3. İsteğe bağlı: rota katmanını ayrı bir overlay canvas'a al; animasyon tikinde terrain'i yeniden çizme.

`backdrop-filter` (styles.css satır 13, 23, 181, 294): ölçülebilir etkisi yok; yalnızca temizlik olarak düşünülebilir, FPS düzeltmesi değildir.

## Görev 2: "En düz" tercihi eğimi düşürmüyor mu?

### Worker, Efe'nin doğrulama penceresi (`Sim/data/dtm_subset.*`, 1676x1135, 1.0 m)

Gerçek `attachWorker` + app mesaj biçimi, WB1 (0,0) -> Roubion (133.285, -674.297):

| Tercih | Uzunluk (m) | Maks eğim |
|---|---|---|
| balanced | 730.505 | 9.81° |
| shortest | 730.505 | 10.64° |
| flattest (=gentle) | 732.161 | 9.27° |

Efe'nin beklenen değerleriyle birebir eşleşiyor.

### UI, uygulamanın gerçekte yüklediği DTM

Tarayıcıda gerçek UI (demo uçları, `#minimap-route-preference` değiştirildi). `init-window` mesajı yakalandı ve aynı veriyle worker Node'da yeniden çalıştırıldı:

| Tercih | UI özeti (uzunluk / maks eğim) | Worker replay |
|---|---|---|
| balanced | 730 m / 9.8° | 729.66 / 9.77° |
| shortest | 730 m / 14.1° | 729.66 / 14.10° |
| flattest | 731 m / 10.1° | 731.09 / 10.11° |

UI ile worker birebir tutarlı. Fark veri kaynağından geliyor.

### Neden iki sonuç farklı

- Uç noktalar aynı (WB1 = 0,0; Roubion = 133.285, -674.297).
- Uygulama birincil `hirise-jezero-dtm` (`dtm_subset`, Efe'nin doğrulamasında kullanılan) kaynağını reddediyor: `needs_review_verticalReference` (düşey datum kanıtı yok), `layers.selectionReport.rejectedCandidate`. Bunun yerine `hirise-legacy-jezero-dtm` (`Sim/data/legacy-hirise/dtm_subset.*`, 1669x1129, 1.0097 m, datum doğrulanmış) yükleniyor. Jüriye giden sayılar bu legacy pencereden geliyor. (Bu durum `2a2b2c2` "Stage 38A" commit'indeki "datum flag inconsistency" notuyla ilgili.)
- Preference wiring'de hata yok: `main.js` `planMinimapRoute` (satır 543–562) `options.preference` gönderiyor; worker `requestedPreferenceOf` ile okuyor, `flattest` takma adını `gentle`'a çözüyor, tercihe özel alanı kuruyor. Üç seçimde UI özeti doğru değişiyor; `classifyPlanResponse` bayat yanıtı doğru eliyor.

### "En düz" neden maks eğimi düşürmüyor

- Tercih, maks tek-hücre eğimini değil, maliyet integralini minimize ediyor (gentle: costK 30, costP 2). Maks eğim tek hücrelik bir metrik.
- Legacy pencerede path-örneklemesi (kendi bağımsız hesabım, aynı yükseklik dizisi): yol uzunluğunun >5°'lik payı balanced %10.6, flattest %5.7; >8° payı %0.7 vs %0.3; ancak tek hücre maksimumu 8.8° vs 10.7° (örnekleme) — karışık sonuç. Planner'ın maks eğim değeri (9.77/10.11) örneklemeden farklı; hangi yöntemin daha kesin olduğu belirlenmedi.
- Sonuç: "En düz" etiketi, UI'daki "En dik eğim" metriğiyle çelişiyor. Kod hatası değil, metrik/etiket uyumsuzluğu.

Öneri (main.js/minimap.js, Alparslan — düzeltilmedi): özet satırına "yol uzunluğunun >5° payı" ekle ya da "En düz" açıklamasını "eğim cezası en düşük; tek hücre maksimumu garanti değil" olarak netleştir.

## Değişen dosyalar

- Yeni: `Sim/stage-perf-and-preference-review.md` (bu rapor).
- Repo kodu: değişiklik yok. Efe dosyalarında (worker, route-compare, renderer) kusur bulunmadı.
- Scratchpad (geçici, repo dışı): `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\perf\` (perf.mjs, route-pref.mjs, route-ui.mjs, route-legacy.mjs, patch-*.js).

## Çalıştırılmayanlar

- `node --test test/` ve `npm run smoke`: kod değişmediği için çalıştırılmadı.
- Git: yalnız status/log/show. Çalışma sırasında dal HEAD'i `7e88380`'den `2a2b2c2`'ye (Stage 38A, yalnız `Sim/scripts`, `Sim/test`, `Sim/stage38-integrity-audit.md`) ilerledi; bu oturumun yazımı değildi. Ölçülen kodlar (minimap, worker, renderer) bu commit'te değişmemiş.
