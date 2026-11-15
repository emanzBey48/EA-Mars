# K2-1/K2-2 Birinci şahıs kamera hareketi denetimi (Efe)

Dal: `codex/efe-visual-realism`. Bu belge görsel hissiyatı tarif eder; ölçülmüş biyomekanik veya astronot/suit verisi iddia etmez.

## 1. Mevcut durum (değişiklik öncesi)

Baş hareketi **zaten vardı**, `camera.js` içinde değil, `main.js` içinde satır-içi (eski satır ~1505-1532) hesaplanıyordu:

| Durum | Eski davranış | Sorun |
|---|---|---|
| Yürüme (`grounded`, hız > 0,04 m/s) | dikey `0,024·sn·sin 2φ`, pitch `0,006·sn·sin φ`, roll `0,005·sn·cos φ` | Yanal salınım yok. Eller yanal salınır (`VM_STEP_SWAY_X`), kamera salınmaz; iki görünüm birbirini tutmaz. |
| Duruş / nefes | Yok (nefes yalnız el görünüm modelinde, 4 mm) | Duruşta kamera tamamen donuk. |
| Eşik altı / duruş geçişi | Ofset birden 0'a düşer | Yürüyüşten duruşa geçişte 2,4 cm'e kadar tek karelik sıçrama. |
| Hava (`airborne`) | Yürüme ofseti anında kapanır, pitch `vz·0,006` (±0,018) | Sıçrama başında 2,4 cm ve pitch sıçraması. |
| İniş | `-0,055·sin(π·frac)`, nod `-0,015`, roll | `frac` yalnızca ~2 kare sürer (sim `landingRecoveryDurationS=0,25` sim-s = 8x saatte ~31 ms). Dip tek karede tepe değerine çıkar: ölçülen maks. kare farkı **0,0549 m**. |
| Duraklatma | Yürüme ofseti `gaitDistanceM` ile donar | Doğru; değişmedi. |

Rig tarafında (`astronaut-rig.js`) `BREATH_HZ = 0,22` değeri sim zamanı `timeS` üzerinde çalışıyor; `timeScale = 8` olduğu için duvar saatinde ~1,76 Hz. Bu, el nefesinin hızlı titreşimi demektir. Rig bu görevde değiştirilmedi (bkz. Bölüm 8).

## 2. Yeni modül: `public/js/view/3d/camera-motion.js`

Saf modül: DOM, GL, global state yok. Yalnız `config.js` (`SCENARIO.timeScale`) okunur. Mevcut inline hesabı taşır ve eksikleri ekler. Durum yalnız `createCameraMotion` kapanışındadır (singleton yok).

### API
```js
const motion = createCameraMotion({ intensity = 1 });   // intensity in [0, 1]; 0 = tam kapalı
const out = motion.update({ timeS, horizontalSpeedMps, verticalSpeedMps, grounded, airborne,
                            phase, landingRecoveryFrac, gaitDistanceM });
// out = { eyeOffsetZ, eyeOffsetLateral, pitchOffsetRad, rollOffsetRad, gains: { walk, idle, air } }
motion.reset();
```
- `yawOffsetRad` **eklenmedi**: yaw, kullanıcının yönünü değiştirir; yürüyüş/iniş hissiyatına katkısı yok.
- `phase === 'paused'` çıktıyı birebir dondurur (zaman ilerlemez, durum güncellenmez).
- Zaman sıfırlanır (geri giden `timeS`, sahne yeniden başlatma) → kapılar sıfırdan başlar.
- Geçersiz/eksik girdi: sanitize edilir (negatif hız 0, NaN alanlar 0, `timeS` NaN ise son çıktı). NaN üretmez.

### Davranış
- **Yürüme:** faz `2π·gaitDistanceM / 6 m` (rig ile aynı; `presentationStrideLengthM`). Dikey `sin 2φ` (bir adımda 2 tepe), yanal `sin φ` (1 tepe), pitch `sin φ`, roll `cos φ`. Genlik = yürüme kapısı × `min(1, v/1,4)`; yürüme kapısı `smoothstep((v−0,04)/0,2)`. Hız 0,04 m/s altına inince kapı **sürekli** söner.
- **Nefes (duruş):** duvar saatinde 0,25 Hz (`timeS / timeScale`), dikey 2,5 mm, pitch 0,0015 rad, roll 0,0008 rad. Yürüme ile birlikte söner.
- **İniş:** `frac`'ın yükselen kenarında (touchdown) başlayan **1,2 sim-s'lik sunum penceresi**. Dip `−0,055·sin²(π·u)`, nod `−0,010·sin²(π·u)` pitch, roll `0,004·sin²(π·u)·sin(2π·u)`. Yürüme kapısı pencere boyunca kapalıdır. Dip yumuşak başlar (sıfır hız) ve tepeden sonra monoton döner.
- **Havada:** yürüme kapısı kapanır, ek salınım yok. Bakış pitch'i `vz·0,006` (±0,012) yalnız havadayken güncellenir; iniş anında son değeri tutar ve sönümlenir (sim `vz`'yi 0'a çeker, bu sıçrama engellenir).
- **Süreklilik:** tüm kapılar birinci dereceden alçak geçiren filtre (`τ = 0,25` sim-s) ile yumuşatılır.

### Parametre tablosu (sunum parametresi, tümü `CAMERA_MOTION_PARAMS`)
| Parametre | Değer | Üst sınır (sert) | Not |
|---|---|---|---|
| Dikey yürüme | 0,024 m | `maxVerticalM = 0,059` (< 6 cm) | Eski değer korundu. |
| Yanal yürüme | 0,012 m | `maxLateralM = 0,039` (< 4 cm) | Yeni. |
| Pitch yürüme | 0,006 rad | `maxPitchRad = 0,017` (< 1°) | Eski değer korundu. |
| Roll yürüme | 0,005 rad | `maxRollRad = 0,0104` (< 0,6°) | Eski değer korundu. |
| Nefes dikey / pitch / roll | 0,0025 m / 0,0015 / 0,0008 rad | — | Yeni. 0,25 Hz duvar saati. |
| İniş dip | 0,055 m | — | Eski değer; pencere 1,2 sim-s'e yayıldı. |
| İniş nod | 0,010 rad | — | Eski 0,015 rad; üst sınırı (1°) tutmak için düşürüldü. |
| İniş roll | 0,004 rad | — | Eski değer. |
| Bakış (havada) | 0,006 rad/(m/s), ±0,012 | — | Eski ±0,018 idi; 1° sınırı için düşürüldü. |
| Kapı τ | 0,25 sim-s | — | Yeni. |

Sert sınırlar bir **yumuşak diz** (sınırın %80'inden sonra `tanh`) ile uygulanır: sınıra asla ulaşılmaz ve C1 süreklidir.

## 3. Entegrasyon (minimal)

| Dosya | Satır | Değişiklik |
|---|---|---|
| `public/js/main.js` | 16 | `createCameraMotion` içe aktarma |
| `public/js/main.js` | 49-50 | `cameraMotion` örneği ve `lastCameraMotion` |
| `public/js/main.js` | 1507-1530 | Eski satır-içi bob bloğu kaldırıldı; `cameraMotion.update(...)` çağrısı |
| `public/js/main.js` | 1355 | Sahne yeniden başlatmada `cameraMotion.reset()` |
| `public/js/main.js` | 1614 | `getDiagnostics().cameraMotion` (yeni alan; mevcut alanlar değişmedi) |
| `public/js/main.js` | (import) | `ASTRONAUT_RIG` içe aktarması artık kullanılmadığı için kaldırıldı |
| `public/js/view/3d/camera.js` | 147 | `dynamicLateralOffsetM: 0` |
| `public/js/view/3d/camera.js` | 161-185 | `setFirstPersonPose`: `lateralOffsetM` parametresi; `xM/yM` gövde ankrajı olarak kalır; `bodyAnchorXM/YM/ZDisplay` yazılır |
| `public/js/view/3d/camera.js` | 257+ | `getCameraPosition`: yanal ofset **yalnız göz konumunda** (view matrisi, `uCameraEye`) uygulanır |

### Neden yanal ofset yalnız göz konumunda?
İlk denemede yanal ofset `camera.xM/yM`'ye eklendi. Smoke 6h kontrolü (`|cameraX − simX| < 1e-6`) bunu yakaladı ve bu değişmez gövde ankrajını korur. Kararı: `xM/yM` gövdede kalır; gövde, eller, beacon gizleme mesafesi ve gölge ankrajı yanal salınmaz. Göz, `getCameraPosition` içinde kamera-sağ vektörü `(sin yaw, −cos yaw)` boyunca kayar. Ellerin ekranda ~1 cm'lik kayması bu nedenle fiziksel olarak tutarlıdır (kol gövdeye bağlı, baş salınır).

### Neden roll için rig değişikliği yok?
Eller (`renderer.js`, `eyeOrigin = [camera.xM, camera.yM, camera.zDisplay]`) dünya uzayında göze yerleştirilir ve yalnız pitch'i takip eder. Kamera roll'u görünümü döndürdüğünde eller ekranda döner; bu, gövdeye bağlı bir ele baş yatışının doğru görünümüdür. `firstPersonRootPose`'a `dynamicRollOffsetRad` eklemek gereksizdir ve yapılmadı.

## 4. Testler

- `test/camera-motion.test.mjs`: **16/16 yeşil**. Kapsam: parametre sözleşmesi (stride = rig, sınırlar), bir adımda 2 dikey + 1 yanal tepe, `intensity=0` tam sıfır, duruşta sürekli sönüm (kare farkı < 0,012 m), eşik altı sönümü, nefes, iniş penceresi (tepe ortada, monoton dönüş, başlangıçta sıçrama yok), havada yürüme salınımı yok ve bakış sönümü, `paused` donma, determinizm, 4000 rastgele girdide sınırlar + sonluluk, köşe girdileri (NaN yok), reset/geri giden saat, camera.js entegrasyonu (çift sayım yok, yanal yön ve ankraj), main.js'te eski formül yok, modül saflık kontrolü.
- `test/core.test.mjs` (Stage 12) ve `test/first-person-hands.test.mjs`: **değiştirilmedi**, geçmeye devam eder.

## 5. Doğrulama

- `node --test test/` (tam paket): **553/553**, çıkış kodu 0 (başlangıç 537 + 16 yeni).
- `npm run smoke`: **38/38** (6h dahil). Smoke ile değişen takipli `test-output` görüntüleri `git checkout` ile geri yüklendi; yeni takipsiz görüntüler silindi.
- **FPS** (smoke 6c, başsız Chrome): **87,6 FPS**, son render 0,70 ms.
- **Bağımsız zaman serisi** (`scratchpad/camera-motion/run-scenario.mjs`, gerçek `MarswalkSim.stepFirstPerson`, 60 fps, senaryo: yürü 4 sn → dur 2 sn → zıpla → in → yürü):
  - Kare-kare maks. değişim: eyeZ **0,0185 m**, pitch **0,0049 rad**, roll **0,0027 rad**, lat **0,0038 m**. Eski formülün tek karedeki eyeZ sıçraması **0,0547 m** idi.
  - Tepe değerleri: eyeZ +0,0190 / −0,0528 m, pitch 0,0119 rad (0,68°), roll 0,0043 rad (0,25°), lat 0,0103 m. Hepsi sınır içinde.
  - Sabit yürüme: eski formülle farkı 4,5e-5 m (kapı yakınsama artığı, `e^{−1,5/0,25}`); yani eski yürüme hissi korunur.
  - Grafik: `scratchpad/camera-motion/series.png` (mavi = yeni eyeZ, kırmızı = eski; duruş ve iniş anlarında eskinin keskin sıçraması yerine yumuşak eğri). Veri: `scratchpad/camera-motion/series.csv`.
- **Tarayıcı ekran görüntüleri** (`scratchpad/camera-motion/shoot-walk.mjs`, sim `paused` ile dondurularak): `shots/crest.png` (eyeZ +18,8 mm), `shots/trough.png` (−20,3 mm), `shots/landing.png` (dip −44 mm, pitch −0,0083 rad). El NDC'leri kare-kare değişir; bu, kol salınım fazından gelir (sol/sağ eller ayrı yönde kayar), kameradan değil. Kamera ofsetleri değişince el NDC'si dikey dip ile değişmez (eller göze konumlu), bu beklenen durumdur.

## 6. Bilinen sınırlar

1. **Yürüyüş dalgası:** Mars düşük yerçekiminde "daha uzun/yumuşak" dalga istenmişti. Dalga sinüs olarak yumuşak tutuldu, ancak periyodu uzatılmadı: faz rig'in 6 m stride'ına bağlı, periyodu değiştirmek kamera-el-rig senkronunu bozar. Lope için ayrı bir genlik çarpanı da eklenmedi (kapı geçişinde sıçrama üretiyordu).
2. **Yeniden girişte tek kare:** 2D'den 3D'ye dönüşte `update` çağrılmadan geçen zaman, kapıların tek karede hedefe atlamasına yol açabilir (en fazla birkaç mm–2 cm). Düzeltme için 3D'ye girişte `cameraMotion.reset()` çağrısı eklenebilir; bu, `main.js`'in görünüm geçiş kodunda yapılmalıdır.
3. **Rig nefesi (`astronaut-rig.js`, `BREATH_HZ = 0,22`):** `timeS` (sim-s) üzerinde çalışıyor; duvar saatinde ~1,76 Hz. Bu rig dosyası bu görev kapsamında değildi; düzeltme için nefes frekansının `/timeScale` ile ölçeklenmesi gerekir. Kamera nefesi doğru ölçeklendi.
4. **Gövde ankrajı (`renderer.js` ~1301, sahip: renderer/Alparslan):** `bodyOrigin = [camera.xM, camera.yM, camera.zDisplay − eyeHeightM]`. `zDisplay` göz ofsetini (bob ve iniş dip'i, −0,055 m) içerir; bu da bacak/botların dip sırasında yere göre ~5 cm aşağı kaymasına yol açabilir. Kod okumasına dayanır; bakıştan aşağı ekran görüntüsüyle **doğrulanmadı**. Önerilen düzeltme tek satır: `bodyOrigin` için `camera.bodyAnchorZDisplay` kullanmak. `renderer.js` bu görevde değiştirilmedi.
5. Rig'in kendi iniş çökmesi (`rootOffset` içindeki `−0,065·recFrac`, 0,25 sim-s) da çok kısa; bu, sim'in `landingRecoveryDurationS` değeriyle birlikte rig tarafında ayrıca ele alınmalıdır.

## 7. Alparslan için notlar

- `setFirstPersonPose` yeni, geriye dönük uyumlu bir `lateralOffsetM` alır; `getCameraPosition` artık yanal kaymayı içerir (yalnız `dynamicLateralOffsetM ≠ 0` iken; yoksa eski davranış).
- `main.js` bob'u artık `camera-motion.js` üzerinden hesaplar; yeni ofset eklemek için oraya bağlanın, `main.js`'e formül yazmayın.
- `getDiagnostics().cameraMotion` her karede son çıktıyı (ve kapı değerlerini) verir.
- Yukarıdaki Bölüm 6, madde 4 `renderer.js` için tek satırlık bir düzeltmedir; sizin dosyanızda uygulanması önerilir.

## 8. Çalıştırılmayanlar / kapsam dışı

- Look-down (bakış aşağı) ile bacak/bot kayması ekran görüntüsü alınmadı (Bölüm 6.4).
- Rig nefes frekansı ve rig iniş çökmesi değiştirilmedi (dosya sınırı).
- 2D→3D yeniden giriş davranışı test edilmedi (Bölüm 6.2).
- Commit/push yapılmadı (orkestra şefi yapacak).
