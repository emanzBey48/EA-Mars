# Stage 14 Rig Denetimi (Efe, bağımsız, salt okunur)

- **Amaç:** `poseAstronautRig` girdi → poz eşlemesini, first-person parça listesini, poz sınırlarındaki süreklilik ve zincirli eklem bağını kaynak satırı ve ölçümle belgelemek (roadmap "Efe — paralel bağımsız rig denetimi", `yapay zeka icin/road map.md:25`).
- **Tarih:** 14 Kasım 2026. **Okuyucu:** Alparslan (entegrasyon sahibi). **Denetim kapsamı:** yalnız rig kinematiği; rapor hazırlanırken rig/test salt okunur incelendi. Eşlik eden Claude değişiklikleri aynı denetim raporunun bulgularından ayrı bir değişiklik kümesidir.
- **Kaynaklar (salt okunur):** `Sim/public/js/view/3d/astronaut-rig.js`, `Sim/test/astronaut-rig.test.mjs`. Yalnız bağlam için okundu: `renderer.js:528-602`, `simulation/sim.js:99-250,320-348`, `config.js:5-13`, `main.js:346-358`.
- **Sınır:** Bu belge **yalnız sunum (presentation-only) kinematiğidir**; giysi, insan veya EVA biyomekaniği iddiası yoktur. Açılar/ofsetler görsel tasarım değeridir (`astronaut-rig.js:24-29`). "Apollo/Mars EVA loping" yorumları kod yorumudur, kaynaklı ölçüm değildir.
- **Test durumu:** Bu raporun önceki rig-test çalıştırması `node --test test/astronaut-rig.test.mjs` için **17/17** bildirmişti. Bu paylaşım öncesi doğrulamada `npm test` **46/46 geçti, 0 başarısız**. Smoke (`npm run smoke`), tarayıcı ve görsel kabul çalıştırılmadı; bu belge görsel kabul değildir. Tablodaki ek sayılar geçici betikle (`poseAstronautRig` doğrudan çağrılarak) ölçüldü.

## 1. Poz seçimi (öncelik sırası, `astronaut-rig.js:111-131`)

1. `phase==='airborne'` veya `airborne===true` veya (`contactKnown && !grounded`) → **airborne** (`:119`)
2. `!contactKnown` (`groundContactStatus` verilmiş ve `!=='ok'`) → **unknown** (`:121`)
3. `phase` `stop`/`arrived` → **stop** (`:123`)
4. `recFrac>0 && speed<=0.04` → **landing** (`:125`)
5. `speed>0.04 && phase∉{idle,ready}` → **walk** (`:127`); `paused` ayrı poz değildir, hız varsa walk olur
6. aksi → **idle** (`:129`)

`recFrac` (`:113-116`): `landingRecovery===false` her zaman 0; `true` ise `landingRecoveryFrac` (yoksa 1), [0,1]'e kırpılır; `landingRecovery` yoksa `frac>0` yeter. `contactKnown` = status yok veya `'ok'` (`:111`). Doğrulama: `:508-518`.

## 2. Denetim matrisi

Ölçüm girdileri (hepsi `groundContactStatus:'ok'`, `phase:'running'` ayrıca belirtilmedikçe): idle `t=1,v=0`; walk `v=1.2, t=0.25/(1.2/1.25)=0.2604 s` (gait faz π/2); airborne `t=2, h=0.5` ve `vz=+2.4/0/-2.4`; landing `h=0, t=2`, frac 1 ve 0.5. Değerler rad (rot) / model birimi (ofs), eksenler X=sol-sağ, Y=derinlik (ön −Y), Z=yukarı.

| Poz | Girdi koşulu (satır) | Root (ofs Z / rot X) | Kollar (pitch, flare) | Eldivenler | Bacaklar / botlar | Kask / vizör | First-person `viewModel` |
|---|---|---|---|---|---|---|---|
| **idle** | `speed<=0.04` veya phase `idle`/`ready`, recFrac=0 (`:129`); `timeS` yalnız nefes için (`:136`) | Z `0.006·sin(2π·0.22·t)` = 0.0059; rot 0 (`:317`) | pitch −0.0177, flare ±0.02 (`:321-322`) | pitch −0.112 (arm+grip), roll 0.05 (`:325-327`) | hepsi 0 (sabit, `:331`) | rot X −0.0079, vizör kaskı izler (`:318-320`) | ofs Z 0.0039, rot X 0.0059; `breathPhaseRad`=1.382, `stepPhaseRad`=0 (`:347-384`) |
| **walk** | `speed>0.04`, phase≠idle/ready, recFrac sınırsız (`:127`); `gaitHz=speed/1.25`, `faz=2π·f·timeS` (`:133-134`) | Z 0.0603, rot X 0.060, Y 0.013, Z 0.017; Z aralığı [−0.005, 0.070] (`:152-159`) | pitch ∓0.322 (zıt yönde), flare ±0.054; tepe |pitch| 0.374 (`:165-179`) | pitch −0.422/+, roll 0.091 (`:177-178`) | bacak pitch ±0.446 (maks 0.52), bot `offset Y` ±0.22 (`:181-204`) | rot X −0.021 (gövde eğimini dengeler, `:161`) | ofs X 0.0051, Z 0.0077; rot Z 0.0086; `stepPhaseRad`=gait fazı (`:354-361`) |
| **ascent** | airborne ve `vz>0.5`; `tAscent=smoothstep((vz−0.5)/1)` (`:211`); vz=2.4 → tAscent=1 | Z 0, rot X +0.045 (`:215-216`) | pitch −0.55, flare ±0.10 (`:225-226`) | pitch −0.633 | bacak +0.22, bot +0.10 (`:238-247`) | rot X −0.020 | ofs Z +0.0107 (`:365`), nefes ×0.5 |
| **apex** | `|vz|<=0.5`; `tApex=1−tAscent−tDescent` (`:213`); vz=0 | Z `0.012·sin(2.5·t)` = −0.0115 (t=2), rot 0 (`:222`) | pitch −0.26, flare ±0.20 (`:225-226`) | roll ±0.277 | bacak sol +0.10 / sağ +0.02 (stagger ±0.04), spread ±0.05 | rot 0 | ofs Z 0.0007 |
| **descent** | `vz<−0.5`; `tDescent=smoothstep((−vz−0.5)/1)`; vz=−2.4 → 1 | Z 0, rot X −0.040 | pitch −0.32, flare ±0.14 | pitch −0.443 | bacak −0.26, bot −0.14 (temas öncesi öne uzanma) | rot X −0.042 | ofs Z −0.0093 |
| **landing** | `speed<=0.04`, `recFrac>0`, temas `ok`, grounded, phase≠stop/arrived (`:125`) | Z `−0.065·frac` (frac1 −0.065, frac.5 −0.031); rot X `+0.045·frac` (`:264-266`) | pitch `−0.18·frac`, flare ±(0.02·(1−frac)+0.22·frac) = ±0.22 (`:272-277`) | roll ±0.279 | bacak −0.18·frac, bot +0.14·frac, spread ±0.04 (`:290-298`) | rot X −0.0135 (frac1) | ofs Z −0.0105, rot X 0.0122 (frac1; dip `:373-377`) |
| **stop** | `phase==='stop'` veya `'arrived'`, zeminde, temas bilinir (`:123`); zamandan bağımsız sabit (`:299-306`) | 0 / 0 | pitch −0.035, flare ±0.02 | pitch −0.115, roll 0.05 | 0 | 0 | nefes hâlâ var: ofs Z 0.0039 (zaman bağlı) |
| **unknown** | `groundContactStatus` verilmiş ve `!=='ok'`, ve `airborne!==true`, `phase!=='airborne'` (`:119-122`) | 0 / 0 | stop ile aynı sabit poz (`:307-314`) | stop ile aynı | 0 | 0 | tamamen 0, fazlar 0 (`:342-345`) |

`stop` ve `unknown` kollu/eldivenli aynı sabit pozdur; fark yalnız `viewModel`'dedir (`stop` nefes alır, `unknown` donuk).

### Unknown-contact sınırı (betikle doğrulandı, `:119-122`)

| Girdi | Sonuç |
|---|---|
| `status=no_data`, `grounded:false`, `airborne:false` | **unknown** |
| `status=no_data`, `grounded:true`, hız 1 | **unknown** (walk yok) |
| `status=no_data`, `phase:'stop'` | **unknown** (stop değil; unknown önceliklidir) |
| `status=no_data/unavailable`, `landingRecovery:true` | **unknown** (landing değil) |
| `status=no_data`, `airborne:true` **veya** `phase:'airborne'` | **airborne** (açık niyet temas durumunu ezer) |
| `status=ok`, `grounded:false`, `airborne:false` veya status verilmemiş | **airborne** (`!grounded` yeterli) |

Yani `unknown` hiçbir zaman "yerde" veya "havada" iddiası kurmaz, ancak çağıran açık `airborne` verirse rig bunu temas bilinmezken de çizer. `airborne` bayrağının sim tarafında bilinmeyen temasta nasıl üretildiği bu denetimin dışındadır.

## 3. First-person parça listesi ve renderer kullanımı

- `FIRST_PERSON_RIG_PARTS = [torso, chestPack, leftArm, rightArm, leftGlove, rightGlove]` (`astronaut-rig.js:3-10`); `ASTRONAUT_RIG.metadata.firstPersonParts` aynı diziyi gösterir (`:31`). Test: `astronaut-rig.test.mjs:46-50`.
- `renderer.js:559`: first-person'da yalnız bu 6 parça çizilir; bacak, bot, kask, vizör, sırt çantası, anten çizilmez. Parça pozu `rigPose.parts[id]` (`:570-574`), kök `rigPose.rootOffset/rootRotationRad` (`:575-576`) olarak uygulanır. `torso` ve `chestPack` hiçbir pozda parça ofseti/rotasyonu almaz (`:330-332`), yalnız kök hareketini taşır.
- `renderer.js:567-583`: first-person'da `DEPTH_TEST` kapatılır, parçalar `FIRST_PERSON_RIG_PARTS` dizi sırasıyla çizilir (arazi gizleyemez; parçalar arası örtüşme çizim sırasına bağlıdır).
- **`pose.viewModel` henüz tüketilmiyor: DOĞRULANDI.** `Sim/public/js` altında `astronaut-rig.js` dışında küçük harfli `viewModel` geçen yer yoktur (renderer yalnız `firstPersonViewModelDrawn` tanılama bayrağını kullanır, `renderer.js:530,584,596`). `viewModel` alanı üretiliyor ve testli (`test:391-497,610-639`) ama çizime bağlı değil; first-person kol hareketi şu an yalnız `parts` + `rootOffset/rootRotation` ile görünür.
- Test sınırı: `test:314-346` yalnız bu 6 parçanın sonlu olduğunu ve kol/eldiven pitch'inin [−1.2, 1.2] içinde kaldığını doğrular; ölçülen en uç `-0.633` (ascent eldiven).

## 4. Poz sınırı sürekliliği (script ölçümü)

Yöntem: aynı `timeS` (0-20 s, 0.137 adımlı, 146 örnek) ile iki girdi arasında tüm parça + kök için en büyük |Δrot| (rad) ve |Δofs|. `vm` = `viewModel`. Test eşikleri `test:604-607,614-621`.

| Sınır | Dünya Δrot / Δofs | `viewModel` Δrot / Δofs | Yorum |
|---|---|---|---|
| idle→walk (hız 0.04 → 0.0401) | 2.0e-3 / 7.3e-4 | 2.9e-4 / 2.9e-4 | Sürekli (`:147-148` ease) |
| landing(frac=1e-6)→idle | 2.7e-7 / 1.3e-7 | 1.0e-8 / 1.2e-8 | Sürekli |
| landing frac 0.5→0.4 | 2.8e-2 / 1.2e-2 | 1.0e-3 / 1.2e-3 | Yumuşak azalma |
| airborne smoothstep sınırları vz=±0.5, ±1.5 (±1e-4) | ≤1.1e-8 / ≤5.6e-9 | 0 / 8.3e-7 | Sürekli; vz taramasında dvz=0.01 başına en çok 5.4e-3 rad |
| walk→airborne (h=0.5 / 1.2, vz=2.4) | **0.70 / 0.40**, **0.87 / 0.51** | 3.6e-3 / 1.1e-2, 8.6e-3 / 1.0e-2 | Dünya pozunda **kesikli** (karışım yok); `viewModel` sürekli |
| idle→airborne (vz=2.4) | 0.59 / 0.32 | 3.0e-3 / 1.2e-2 | Aynı |
| airborne(descent vz=−2.4)→landing(frac=1) | **0.28 / 0.079** | 1.3e-2 / 4.0e-3 | Dünya pozunda sıçrama (özellikle bot −0.14→+0.14); `viewModel` testin eşiğinde |
| airborne(vz=−0.5)→landing(frac=1) | 0.28 / 0.126 | 1.3e-2 / 1.2e-2 | Aynı |
| landing(h=0)→walk(h=1.2), frac=1 | 0.56 / 0.31 | 8.6e-3 / 8.5e-3 | Hız eşiği geçişi, kesikli |
| landing(h=0.04)→walk(h=0.0401), frac=1 | **0.27 / 0.12** (frac 0.5: 0.14 / 0.062) | 2.9e-4 / 2.9e-4 | `speed<=0.04` eşiğinde kesik; walk dalı landing pozuna karışmaz (`:141-204` vs `:259-298`) |
| idle→stop | 0.068 / 0.033 | 0 / 0 | Küçük atlama (stop sabit, idle nefesli) |
| walk(1.2)→stop | 0.45 / 0.22 | 8.6e-3 / 8.5e-3 | Stop zaman-geçişsiz, anlık |
| idle→unknown | 0.068 / 0.033 | 6.0e-3 / 4.0e-3 | Küçük |

Dünya pozu için testin garantisi yalnız idle↔walk ve landing↔idle'dır (`test:604-607`); walk↔airborne ve airborne↔landing yalnız `viewModel` için doğrulanıyor (`test:614-621`). Bu belge o kesintileri kusur olarak değil, **durumsuz (stateless) tasarımın sonucu** olarak kaydeder; görsel etkisi Alparslan'ın kabulünde ölçülür.

### Zincirli eklem bağlanma hatası

1952 durum (hızlar 0-2.5, vz −3..+3, landing frac 0.1-1, stop/idle/unknown, 0-3 s) üzerinde, pozlanmış pivot noktası ile üst parçanın taşıdığı pivot arasındaki uzaklık:

| Bağ | Maks hata (model birimi) |
|---|---|
| eldiven bileği ↔ kol (`chainedLimbPart`, `:416-462`) | 3.4e-16 |
| bot ↔ bacak | 2.0e-16 |
| vizör ↔ kask | 2.2e-16 |
| eldiven pivotu ↔ kol alt ucu | 3.4e-16 (şablon `0.695 = 0.695`) |

**Şablon notu (poz değil):** bot pivot Z = 0.17, bacak alt ucu Z = 0.135; bot, bacağın altına 0.035 birim binen bir kutu olarak tasarlanmıştır (`:45,47`). Hiçbir pozda değişmez.

## 5. Bilinen sınırlar / Alparslan'ın görsel kabulü için açık maddeler

| # | Madde | Durum |
|---|---|---|
| 1 | **Zaman ölçeği ×8 ile iniş toparlanması çok kısa.** `landingRecoveryDurationS=0.25` sim-saniye (`config.js:11`), `dtSim = dt·timeScale` (`sim.js:99,119-120`), `timeScale=8` (`config.js:13`) → ~31 ms gerçek süre ≈ 1.9 kare @60 Hz. Squash/çömelme gerçek ekranda neredeyse görünmeyebilir. | **DOĞRULANDI** (kaynak + hesap); görsel etki **OLASI** |
| 2 | **Sıçrama süresi de aynı ölçekte kısalır:** `2·2.4/3.71 ≈ 1.29` sim-s (`config.js:7,9`, yerçekimi `sim.js:140`) ≈ 0.16 s gerçek süre; ascent/apex/descent geçişleri birkaç karede. | Hesap **DOĞRULANDI**; algı **OLASI** |
| 3 | **Yürüyüş döngüsü hızlı:** gait `timeS` ve hız sim saatinden gelir (`sim.js:336-337`); 1.2 m/s → 0.96 Hz sim = ~7.7 Hz gerçek. 60 Hz'de ≈ 7.8 kare/döngü; titrek/aliasing görünebilir. | Sayı **DOĞRULANDI**; görsel **OLASI** |
| 4 | **Gait fazı durumsuz: `faz=2π·(v/1.25)·timeS` (`:133-134`).** Hız değişince faz `Δf·t` kadar atlar. Ölçüm: dv=0.01 için sol bacak pitch atlaması t=1'de 0.025, t=10'da 0.25, t=100'de 0.60 rad. Yavaşlama/hızlanma ve rota boyunca değişen hızda uzun oturumlarda sarsıntı beklenir. Phase-accumulator rig dışı (çağıran) bir durum gerektirir. | **DOĞRULANDI** (script) |
| 5 | **Kamera dip fazı ile rig squash fazı uyumsuz.** Kamera `sin(frac·π)` kullanır (`main.js:349`): frac=1'de 0, frac=0.5'te tepe. Rig squash `0.065·frac` doğrusal, frac=1'de tepe (`:264`). Çömelme kolları/gövdeyi önce, kamera dip'i sonra tepe yapar. | **DOĞRULANDI** (iki formül); görsel etki **OLASI** |
| 6 | **Head-bob eşiği farklı:** `main.js:357` `speed>0.1` ve recovery yokken bob; rig walk eşiği `0.04` ve recFrac>0 iken de walk (`:127,152-166`). 0.04-0.1 m/s aralığında rig yürürken kamera bob yok. | **DOĞRULANDI** (iki eşik); görsel **OLASI** |
| 7 | **`viewModel` renderer'a bağlı değil** (bölüm 3). Rig'in nefes/adım/dip terimleri first-person'da görünmüyor. | **DOĞRULANDI** |
| 8 | **First-person çizim: derinlik testi kapalı** (`renderer.js:567`). Kollar/eldivenler/torso/chestPack yalnız dizi sırasıyla üst üste çizilir; örtüşme sıralaması dizi sırasına bağlıdır. Kol–gövde kesilme/örtüşme gerçek görüntüyle bakılmalıdır. | **DOĞRULANDI** (kod); sonuç **OLASI** |
| 9 | **First-person'da bacaklar/botlar/kask çizilmez** (`renderer.js:559`); landing'in bacak/bot pozu first-person'da görünmez, görünen etki kök Z/rot ile kol/eldiven pozundan gelir. | **DOĞRULANDI** |
| 10 | **Kesikli dünya pozu geçişleri** (bölüm 4: walk↔airborne 0.7-0.87 rad, airborne→landing 0.28 rad, landing(h≈0.04)→walk 0.27 rad). Yalnız `world` avatarda tam gövde etkiler; `viewModel` sürekli. | **DOĞRULANDI** (ölçüm); görsel şiddet **OLASI** |
| 11 | **Unknown + açık `airborne:true`** rig'de airborne çizer (`:119`); sim tarafı bunu bilinmeyen temasta üretiyorsa bilinmezlik uyarısıyla çelişir. Bu belge sim kaynağını denetlemedi. | Rig davranışı **DOĞRULANDI**; sim tarafı **OLASI** |
| 12 | Veri/LFS/legacy ortogörüntü sorunu bu denetimin kapsamı dışındadır; yalnız işaret: roadmap'te ayrı iş olarak izlenir. | Kapsam dışı |

## Teslim durumu

- Bu belge rig davranışının salt okunur denetim çıktısıdır; kod/test değişiklikleri ayrı diff bölümlerinde incelenmiştir.
- Çalıştırılan: tam birim test paketi (46/46). Çalıştırılmayan: smoke, tarayıcı/görsel kabul.
- Rig kaynaklı kusur görsel kabulde doğrulanırsa düzeltme yalnız `astronaut-rig.js` ve `astronaut-rig.test.mjs` için ayrı branch/tek kabul ölçütlü işe açılmalıdır (roadmap `:25`).

## Ek: Mesafe tabanlı yürüyüş fazı (gaitDistanceM)

- **Problem:** Madde 4'teki durumsuz faz `2π·(v/1.25)·timeS` hız değişince `Δf·t` kadar atlar. Ölçüm: hız 1.00→1.01 m/s iken `timeS=50` s'de en büyük bileşen farkı 0.22, `timeS=100` s'de 0.36 (sol bacak pitch'i dahil; kol, eldiven, bot, kask ve `viewModel.stepPhaseRad` aynı fazı kullanır). İniş toparlanmasında sim hızı sürekli karıştırdığı için titreme beklenir.
- **Çözüm (`astronaut-rig.js`):** İsteğe bağlı `gaitDistanceM` (sonlu, >= 0; kümülatif yatay mesafe, m). Verilirse faz `2π·gaitDistanceM/presentationStrideLengthM` olur; mesafe birikimli olduğundan hız değişse de faz sürekli kalır. Verilmezse eski zaman tabanlı formül aynen kullanılır. `gaitFrequencyHz = hız/adım` (kadans) ve `viewModel.stepPhaseRad = gaitPhaseRad` değişmedi. Geçersiz değer (NaN, negatif, Infinity, string) `TypeError` fırlatır. Alan yalnız `walk` pozunun fazını etkiler.
- **Geriye uyumluluk kanıtı:** `gaitDistanceM` olmadan, rastgele geçerli 20000 girdide (tüm fazlar, temas durumları, iniş alanları, timeS<500) eski dosya kopyasıyla `deepStrictEqual` çıktısı birebir aynı. Mevcut golden `gaitPhaseRad` testi dokunulmadan geçiyor. Sabit hızda `gaitDistanceM = hız·timeS` ile faz zaman tabanlıyla en çok 1.8e-12 rad farklı (5000 örnek).
- **Önce/sonra (ölçüm):** Aynı 1% hız değişimi, sabit mesafe 123.4 m: mesafe ile en büyük bileşen farkı 3.6e-3 (kalan, hız-ölçekli genliklerden gelir, faz atlaması değildir) / mesafesiz 0.22 (t=50) ve 0.36 (t=100). 1.2→0.6→1.2 m/s rampası (10 s, 1/60 s adım, `timeS≈50`): kare başına en büyük sol bacak pitch değişimi mesafe ile 0.044 rad, mesafesiz 0.30 rad.
- **Testler:** 5 yeni test (`astronaut-rig.test.mjs` sonu); tam paket 51/51. Smoke ve görsel kabul çalıştırılmadı.
- **AÇIK ENTEGRASYON MADDESİ (Alparslan, yapılmadı):** `simulation/sim.js` içindeki `createWorldSnapshot` `movement` nesnesine `gaitDistanceM: sim.distanceWalkedM` eklenmeli (ve movement'ı rig'e geçiren yolun bu alanı iletmesi doğrulanmalı). O dosya Alparslan'ındır; bu işte dokunulmadı. Alan iletilene kadar rig eski zaman tabanlı fazı kullanır ve Madde 4 sarsıntısı sürer.
