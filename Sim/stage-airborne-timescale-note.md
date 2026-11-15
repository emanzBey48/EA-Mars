# Uçuşta zaman hızı (airborne time scale) notu

**Durum:** uygulandı, commit yok (çalışma ağacında). **Kapsam:** yalnız sunum süresi; zıplama fiziği değişmedi.

## 1. Sorun

Senaryo saati `SCENARIO.timeScale = 8` ile çalışır (yürüyüşü 60–90 sn'lik demoya sığdırmak için). Zıplamanın uçuşu 1,29 sim-saniyesi sürer, ama duvar saatinde yalnızca ~0,16 s (≈10 kare) görünür. Düşük yerçekiminin "uzun süzülmesi" göz açıp kapayana kadar biter; kamera dip ve poz geçişleri de bu süreye sıkışır.

## 2. Tasarım

- `sim.js` `stepFirstPerson`: sabit `dt * timeScale` yerine `advanceSimClock(dt, flightClock)` kullanılır. `flightClock = airborne || landingRecovery || bu karede zıplama başlıyor`. Zıplama başlangıç koşulu, zıplama bloğundaki koşulla birebir aynıdır (başlangıç karesindeki `landingRecovery` değeri ile).
- Ölçek, `airborneTimeScale` (varsayılan **2**) ile `timeScale` (8) arasında üstel olarak yumuşatılır; sabit zaman sabiti `timeScaleSmoothingWallS` (varsayılan **0,02 s**).
- Sim-zamanı adımı yumuşatılmış ölçeğin **tam integralidir**: `dtSim = T·dt + (s0 − T)·τ·(1 − e^(−dt/τ))`. Bu sayede sonuç yalnız duvar saatine bağlıdır, kare bölünmesine bağlı değildir (test: 1000 küçük adım = tek büyük adım, 1e-12).
- Sim saati, zıplama balistiği (3,71 m/s², v0 = 2,4 m/s, havada yatay momentum korunumu, iniş toparlanması sim-saniyesi cinsinden) değişmedi. Duraklatma (`PHASE.PAUSED`) hiçbir şeyi ilerletmez.
- `simTimeS` hâlâ sim saatidir. Yeni snapshot alanı: `astronaut.movement.timeScaleEffective` (yumuşatılmış ölçek). Mevcut alanlar değişmedi.
- Doğrulama: `airborneTimeScale` ve `timeScaleSmoothingWallS` `resolveAirborneTimeScale` / `resolveClockSmoothingWallS` ile kontrol edilir. Geçersiz değer (1 altı, `timeScale` üstü, sonlu olmayan) `RangeError` fırlatır. Tanımsız `airborneTimeScale` eski davranışı korur (yavaşlama yok).

## 3. Ölçüm (60 fps, yürü 2 s → zıpla → in → yürü; eski = HEAD)

Kaynak: `scratchpad/airborne/compare.mjs` (eski sürüm HEAD'den kopyalanmış, bağımsız betik).

| Metrik | ESKİ (HEAD) | YENİ | Analitik |
|---|---|---|---|
| Uçuş sim süresi (s) | 1,333 | 1,320 | 1,294 |
| Uçuş yatay mesafe (m) | 1,600 | 1,584 | 1,553 |
| Tepe yüksekliği (m) | 0,7756 | 0,7762 | 0,7763 |
| Uçuş duvar saati (s) | 0,167 | **0,600** | 0,647 |
| Uçuştaki kare sayısı (60 fps) | 9 | 35 | — |
| İniş toparlanma duvar saati (s) | 0,033 | 0,133 | — |
| Kamera maks. ΔPitch / kare (rad) | 0,0049 | 0,0035 | — |
| Kamera maks. ΔZ / kare (m) | 0,0185 | 0,0186 | — |
| Rig maks. poz değişimi / kare (rad) | 0,242 | 0,184 | Ajan V hedefi 0,26 |

Sim süresi ve mesafe farkı, kare sınırının (ESKİ 8×/60 = 0,133 sim-s; YENİ 2×/60 = 0,033 sim-s) kuantalaması kadardır. Tepe yüksekliği kare bağımsız olarak aynıdır.

Kare hızına göre (YENİ): 30 fps uçuş duvar 0,600 s; 60 fps 0,600 s; 240 fps 0,588 s. Sim süresi 240 fps'de analitikten 0,001 s sapar.

## 4. Yumuşatma seçimi (60 fps, uçuş duvar saati, analitik/2 = 0,647 s)

| τ (s) | Uçuş duvar saati (s) | Kayıp (≈ 6τ/2) | Yorum |
|---|---|---|---|
| 0 (anlık) | 0,633 | ~0,01 (kuantalama) | Hız tek karede sıçrar (9,6 → 2,4 m/s duvar). |
| **0,02** (seçilen) | **0,600** | ~0,05 | ~1 kare yumuşatma; kayıp yumuşatma payı içinde. |
| 0,05 | 0,483 | ~0,16 | Hedeften çok uzak; kabul edilmedi. |

Üstel yukarı-aşağı geçiş, uçuş başında ölçeği 8'den 2'ye indirirken fazla sim-zamanı üretir (6·τ sim-s). Bu yüzden uçuş duvar süresi kısalır. Bunu tamamen gidermek için sönümlü aşım gerekir; bu, sunum için gereksiz karmaşıklık olarak reddedildi. Karar sahibi τ'yu değiştirebilir (`config.js`).

## 5. Kamera ve rig etkisi

- **Yürüyüş kamera salınımı** mesafeye bağlıdır; değişmedi (ΔZ/kare ≈ 0,0186 m).
- **Kamera pitch/kare** düştü (0,0049 → 0,0035 rad). Uçuş kareleri daha az ve yavaş ilerlediği için.
- **Landing dip penceresi** (1,2 sim-s) artık duvarda ~0,25 s sürer (önce ~0,13 s). Dip tepe noktası 0,083 → 0,183 s; sıfıra dönüş 0,133 → 0,250 s.
- **Açık kalan kalıntı:** dip tepe eğimi kare başına ~0,0186 m olarak kaldı. Sebep: 2×'ten 8×'e dönüş, dip eğimi en dik olduğu anda oluyor. Eski sürümde de aynı büyüklüktü, yani regresyon değil. Düzeltme seçeneği: `camera-motion.js` `landingWindowS` değerini 1,2'den ~2,4 sim-s'e çıkarmak (kare başına ~0,009 m), ancak bu kamera hissini değiştirir. Sahibi karar vermeli.
- **Rig** poz değişimi kare başına 0,242'den 0,184 rad'a düştü. Ajan V'nin 0,26 rad/kare hedefi aşılmıyor.

## 6. Bilinen sınırlar

- Kamera nefesi (`camera-motion.js`, `breath = timeS / timeScale`) ve rig nefesi (`astronaut-rig.js`, `BREATH_HZ = BREATH_WALL_HZ / timeScale`) hâlâ `timeScale` varsayar. Uçuş ve iniş sırasında bu iki nefes duvar hızı değişir. Nefes, duruşta kapandığı için uçuşta etkisi küçüktür, ama ölçülmedi.
- Yatay duvar hızı uçuşta 9,6 m/s'den 2,4 m/s'ye iner (`walkSpeedMps × airborneTimeScale`). Bu, istenen yavaşlamadır.
- Yere temas kare sınırında tespit edilir; kuantalama uçuş süresini bir kareye kadar etkiler (60 fps'te ~0,033 sim-s).
- Düz yürüyüş `step()` (2D) ve rota ETA (`duvar saati = sim saati / timeScale`) değişmedi; zıplama yalnız `stepFirstPerson` yolunu etkiler.

## 7. Testler

- `test/airborne-timescale.test.mjs` (yeni, 10 test): tepe/yatay kimlikler (30/60/120 fps) sim-zamanında 1e-9'a kadar; duvar uçuş süresi aralığı; kare bölünmesinden bağımsız integral; yakınsama ve geri dönüş; yürüyüşte regresyon yok; duraklatma (zaman ve momentum donar); bilinmeyen zemin üstünde uçuş; config doğrulama; sıfır yumuşatma; snapshot alanı.
- `test/core.test.mjs` (2 test, gerekçeli uyarlama):
  - *Stage 12 momentum:* adım sim süresi `dtWall × timeScale` yerine ölçülen `simTimeS` farkı ile hesaplanır. Ölçek artık yumuşatılmış ve uçuşta farklıdır.
  - *Stage 12 landing recovery:* sabit `timer / timeScale` beklentisi yerine, toparlanma bitene kadar adım atılır ve duvar süresi `0,25 / airborneTimeScale` ± 0,02 ile karşılaştırılır.
- Tam paket: **682 / 682 yeşil**, çıkış kodu 0 (başlangıç 672 + 10 yeni).

## 8. Dosyalar

- `Sim/public/js/simulation/sim.js` (advanceSimClock, validators, flight clock, snapshot alanı)
- `Sim/public/js/config.js` (`airborneTimeScale: 2`, `timeScaleSmoothingWallS: 0.02`)
- `Sim/public/js/view/hud.js` (yalnız satır 75: "uçuşta zaman hızı 2×")
- `Sim/DEMO_NOTES.md` (zıplama/zaman satırları)
- `Sim/test/core.test.mjs` (2 test uyarlaması), `Sim/test/airborne-timescale.test.mjs` (yeni)
- `Sim/stage-airborne-timescale-note.md` (bu not)
