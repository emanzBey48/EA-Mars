# Aşama 32A — Ayak izi geometri ve yerleştirme motoru (audit)

Kapsam: saf veri motoru. DOM, WebGL, ağ ve dosya erişimi yok. Render Aşama 32B'de (Alparslan).
Görsel izdir; regolit/zemin mekaniği, iz derinliği, ayak boyu veya insan adım uzunluğu iddiası yoktur.

## Eklenen dosyalar

- `Sim/public/js/view/3d/footprint-trail.js` (yeni)
- `Sim/test/footprint-trail.test.mjs` (yeni, 18 test)
- `Sim/stage32a-footprint-audit.md` (bu dosya)

Mevcut hiçbir dosya değiştirilmedi (`main.js`, `config.js`, `simulation/`, `surface/`, `input/`, mevcut `view/` dosyaları, `route/`).

## API

```js
createFootprintTrail({ sampleElevation, displayConfig = null, ...options }) -> { update, getSnapshot, reset }

update({ timeS, xM, yM, headingRad, gaitDistanceM, grounded, airborne?, landingRecoveryFrac? }) -> void
getSnapshot() -> { schemaVersion, count, capacity, instances: Float32Array, quads: Float32Array,
                   counters, meta }   // hepsi dondurulmuş; typed array'ler her çağrıda taze kopya
reset() -> void
```

- `sampleElevation(xM, yM) -> {status, value}` enjekte edilir. Şekil `GridElevationLayer.sampleElevation` ve `view/route-guidance.js` ile aynıdır. `sampleSurface` kullanılmadı, çünkü `elevation` alanı iç içedir ve yalnız kot gerekir.
- `instances` (kayıt başına 10 float): `x, y, zM, yawRad, side, alpha, scale, nx, ny, nz`.
- `quads` (kayıt başına 12 float): dört köşe `x, y, zM`; zemin normali yönünde `groundOffsetM` kadar kaldırılmış.
- `side`: `+1` fiziksel sol, `-1` fiziksel sağ, `0` tek ortalanmış iniş yaması.
- Sabitler `FOOTPRINT_DEFAULTS` içinde adlıdır. Stride ve bot boyutu astronaut-rig.js sabitlerinden türetilir (`presentationStrideLengthM = 6`, bot `size`, bot merkez ofseti).

## Alparslan (32B) için kullanım

```js
const trail = createFootprintTrail({
  sampleElevation: (x, y) => layers.dtm.sampleElevation(x, y), // ayni örnekleyici, kare başına yeni yükleme yok
  displayConfig: terrainMesh.displayConfig,                    // yalnız metadata; konum zM ile kalır
});
// Her karede, snapshot'tan:
trail.update({
  timeS: m.timeS, xM: a.xM, yM: a.yM, headingRad: camera3d.yawRad,
  gaitDistanceM: m.gaitDistanceM, grounded: m.grounded, airborne: m.airborne,
  landingRecoveryFrac: m.landingRecoveryFrac,
});
const fp = trail.getSnapshot(); // fp.count, fp.instances, fp.quads, fp.counters, fp.meta
// R tuşunda: trail.reset();  Duraklatmada: update çağrılabilir, timeS donduğu için iz yaşlanmaz.
```

Renderer, `quads` dizisini dört köşeli yama olarak çizer; `meta.verticalExaggerationLabel` doluysa HUD'da etiket gösterilir.

## Tasarım kararları

1. **Factory closure.** `createFootprintTrail` kapalı bir nesne döndürür. Bu, `createFirstPersonCamera` ve `createWorldSnapshot` ile aynı örüntüdür. Durum modül düzeyinde değil, örnek başınadır (test izolasyonu).
2. **Ayak planlaması.** Ayak izi konumları `(k + 1/2) · stride/2` metrede, yani 1.5, 4.5, 7.5 ... m. Aralık `stride/2 = 3 m`. Konum iki örnek arasında doğrusal interpole edilir; bu sayede kare hızından bağımsız eşit aralık sağlanır ve aynı mesafe iki kez sayılmaz.
3. **Ayak yönü (dönüşüm).** İlk iz, rig'in faz kuralıyla uyumludur: fazda ileri olan ayak planlanan temas ayağıdır. Sonraki izler yayınlanmış son ize göre dönüşür. Bu, havada atlanan ya da no-data nedeniyle düşen bir izden sonra aynı tarafın iki kez çıkmasını önler (bkz. "Bulgular", madde 3).
4. **Yama.** Dört köşe, sorgulanan yüzeyin kendi kotuna oturur. Normal, üç köşeden (ilk kenar ve ikinci kenar çaprazı) hesaplanır ve yukarı yönlüdür. Ofset normal yönünde uygulanır, dikey değil; böylece köşe yüzeyden tam `groundOffsetM` yukarıdadır.
5. **No-data.** Dört köşeden biri `status !== 'ok'` veya sonlu olmayan değer dönerse iz bırakılmaz, `skippedUnknown` artar. Kot 0 ile doldurulmaz, boşluk üzerinden üçgen kurulmaz.
6. **Havada ve iniş.** `airborne` iken ayak izi yoktur (`skippedAirborne`). Havadan yere geçişte tek ve ortalanmış bir iniş yaması üretilir. Ölçeği `landingBaseScale + landingExtraScale · landingRecoveryFrac` ile belirlenir; yalnız görsel ölçektir.
7. **Süreksizlik.** Tek güncellemede `gaitDistanceM` artışı `maxGaitStepM` (12 m) veya konum sıçraması `maxTeleportM` (4 m) aşarsa iz üretilmez (`discontinuities`). Gait geriye giderse `gaitResets`, `timeS` geriye giderse `clockResets` artar ve durum sıfırlanır. Bu yüzden iz seli oluşamaz.
8. **Tampon ve ömür.** Halka tampon `capacity` (varsayılan 400) ile sınırlıdır; taşınca en eski atılır (`evicted`). Ömür `fadeSeconds` (varsayılan 120 senaryo saniyesi) ile sınırlıdır. `alpha = 1 - yaş/ömür`; ömrü dolan iz düşer (`expired`).
9. **Duraklatma.** Yaş `timeS`'e bağlıdır. Sim duraklatıldığında `simTimeS` donar, dolayısıyla iz yaşlanmaz.
10. **Display.** `displayConfig` yalnız metadata'ya girer. `verticalScale !== 1` ise `verticalExaggerated` ve `görsel dikey abartı ×N` etiketi yayınlanır. Ölçek bu modülde uygulanmaz (`verticalScaleApplied: false`).

## Bulgular ve açık noktalar

1. **Rig adlandırma tersliği (Efe'nin kendi rig dosyası; bu görevde değiştirilmedi).** Rig yerel `+X` yönü, `heading + π/2` dönüşümünden sonra fiziksel sola denk gelir. Bu yüzden `leftArm`, `leftLeg`, `leftBoot` (`x = -0.14`) fiziksel sağ tarafta çizilir. Test bunu rig çıktısından doğrular. Ayak izinde fiziksel isimlendirme kullanıldı. 32B renderer sol/sağ etiketi kullanacaksa bu tersliği bilmelidir.
2. **Sayım formülü.** `D/(stride/2)` yaklaşıktır. Kesin sayı `floor((D − stride/4)/(stride/2)) + 1`'dir. Bağımsız hesapta `D = 47.9 m` için ham oran 15.97, kesin sayı 16 çıktı. Fark en fazla bir izdir ve tam sayıya yuvarlamayla açıklanır.
3. **Havada atlanan izden sonra boşluk.** Uçuşta düşen bir planlanmış ayak izi çizilmez; iki yayınlanmış iz arasında 6 m boşluk oluşur. Sim ile yapılan senaryoda (aşağıya bakın) bu tam olarak bir atlanan iz olarak görüldü. Alternasyon bu boşluktan sonra da korunur.
4. **Mevcut `verticalScale`.** `main.js` satır 423'te `verticalScale: 3` kullanılıyor. Aşama 35B'de 1×'e alınması planlanıyor; bu modül her iki durumda da doğru çalışır ve metadata etiketi değişikliği yansıtır.
5. **Float32 hassasiyeti.** `zM` Float32 olarak saklanır. Mars 2000 kotu yaklaşık −2589 m civarında ise çözünürlük ~2.4·10⁻⁴ m'dir. Görsel amaç için yeterlidir; testlerde 5·10⁻⁴ m tolerans kullanıldı.
6. **Eşikler.** `maxGaitStepM`, `maxTeleportM`, `fadeSeconds`, `capacity`, `landingBaseScale/ExtraScale` ve `groundOffsetM` senaryo/tasarım değerleridir. Kaynaklı bir değer değildir.
7. **Yön kaynağı.** 32B'de `headingRad` kamera yaw'ı olmalıdır (ilk şahıs). `main.js` satır 784'te `sim.headingRad = camera3d.yawRad` eşitlemesini yapıyor (satır 616'da ise başlangıçta `targetYawRad`); ayak izi yönü ile kamera yönü bu eşitlemeyle tutarlıdır.
8. **Eski 2D `sim.trail`** (2 m aralık) kullanılmadı ve değiştirilmedi.

## Doğrulama

- `node --test test/footprint-trail.test.mjs`: **18/18** yeşil.
- `node --test "test/*.test.mjs"` (ve birebir `node --test test/`): **318/318** yeşil (başlangıç 300 + 18 yeni).
- Bağımsız yeniden hesap (scratchpad `verify-footprint.mjs`, modül formülleri kullanılmadan):
  - Ayak izi sayısı, beş farklı mesafede (30, 31.2, 47.9, 60, 100.3 m) kaba kuvvet sayımıyla birebir eşleşti: fark 0.
  - Eğimli yüzey (`z = 0.5x + 0.25y`): analitik eğim 29.205932°, en kötü normal açı hatası 2·10⁻¹⁴ derece.
- Gerçek `sim.js` ile senaryo (scratchpad `sim-footprint-scenario.mjs`; `MarswalkSim` + `createWorldSnapshot`, 6 s yürüyüş, 3 s duraklatma, 1 zıplama, 8 s yürüyüş):
  - Yürünen mesafe 134.56 m, ayak olayı sayısı 45 (44 iz + 1 havada atlanan), tek iniş yaması.
  - Yürüyüş sırasında iz aralığı 3 m; havada atlanan izden dolayı tek 6 m boşluk.
  - Duraklatmada `simTimeS` donuyor; sol/sağ dönüşümü korunuyor (`sidesAlternate: true`).

## Çalıştırılmayanlar ve sınırlar

- Tarayıcı, WebGL ve `npm run smoke` çalıştırılmadı; render 32B'de.
- Git commit/push yapılmadı (orkestra şefinin işi). Bu ortamda `git` komutu PATH'te değil.
- Renderer, minimap ve HUD bağlantısı yapılmadı (32B).
