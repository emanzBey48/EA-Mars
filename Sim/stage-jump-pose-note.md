# K2-5: Sıçrama pozları ve karakter animasyonu (önce/sonra)

Kapsam: `public/js/view/3d/astronaut-rig.js` ve `test/astronaut-rig.test.mjs`. Renderer, kamera, sim, config ve main.js değiştirilmedi. Pozlar yalnızca hareket girdilerinden (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`, `landingRecoveryFrac`, `gaitDistanceM`) üretilir; atmosfer sürüklemesi veya kaynaksız giysi kuvveti yoktur.

Ölçümler, gerçek `MarswalkSim.stepFirstPerson` ile 60 fps (dt = 1/60 s) yürü 3 s, zıpla, havada, yürü 2 s senaryosundan alındı (`scratchpad/jump/harness.mjs`, bağımsız betik). Önizlemeler tarayıcı/WebGL değil, düz gölgeli silüet çizimidir.

## 1. Kare başına en büyük eklem açısı değişimi (rad, 60 fps)

| Segment | Önce (HEAD) | Sonra | Not |
|---|---|---|---|
| Yürüme | 0.076 | 0.076 | Değişmedi (faz kuralı aynı) |
| Kalkış (ilk havadaki kare, vz 1.9) | 0.064 | 0.261 (sol kol) | Hedef ~0.25 |
| Havada en büyük | 0.899 (sol kol, vz 1.4) | 0.226 | Tek karelik sıçrama giderildi |
| İniş öncesi (vz -1.1 → -2.1) | 0.371 | 0.175 | |
| İniş (sönüm başlangıcı) | 0.072 | 0.142 | Yeni değer, bkz. açık noktalar |

## 2. Uçuş pozu ile yürüme pozu arasındaki eklem mesafesi (rad)

Mesafe: 7 eklem + kök için 3 bileşenli rotasyon farkının Öklid normunun ortalaması; yürüme referansı 48 fazlık döngü (1.2 m/s), ortalama alınarak.

| Uçuş örneği | Önce | Sonra |
|---|---|---|
| Apex (vz ≈ 0) | 0.279 | 0.317 |
| Apex (vz ≈ 0.4) | 0.279 | 0.282 |
| Kalkış (vz ≈ 1.4) | 0.340 | 0.212 |
| İniş (vz ≈ -1.1) | 0.303 | 0.255 |
| Temas öncesi (vz ≈ -2.1) | 0.211 | 0.218 |

Hedef 0,4 rad ortalama fark sağlanmadı. Nedeni: yürüme yalnızca 4 eklemi (kollar, bacaklar) büyük açıyla değiştirir; 8 girdilik ortalamada 0,4 için uçuş pozunun inandırıcı olmayan ölçüde abartılması gerekir. Apex pozu kollarda belirgin (roll 0.55 → 0.75 rad), ama bacak farkı küçük kalıyor.

## 3. Nefes

| | Önce | Sonra |
|---|---|---|
| Sim-saniyesi frekansı | 0.22 Hz | 0.03125 Hz (= 0.25 / timeScale) |
| Duvar saati frekansı | 1.76 Hz | 0.25 Hz (camera-motion `breathWallHz` ile aynı) |

Bu bir sunum parametresidir; fizyolojik bir iddia değildir.

## 4. Değişiklikler

- Kalkış/iniş karışımı: ağırlık `vz / 2.4 m/s` (doğrusal, `SCENARIO.jumpImpulseMps`). Önceki sabit pencere (2.0 → 1.2 m/s) 0,8 m/s genişlikteydi ve gerçek 0,5 m/s/kare adımında tek karede ~0,9 rad sıçrama üretiyordu.
- Uçuş pozları: kol yukarı-ileri -0.95 → -1.0, kol yanlara 0.55 → 0.75, bacak geriye 0.38 → 0.45, bacak öne (iniş) -0.50 → -0.55, kol iniş dengesi 0.38 → 0.50.
- Uçuş ve iniş rampaları 1.0 → 1.5 m/s genişlikte (uçuş pozunun kendi kare değişimini ~0,25 altında tutmak için).
- Nefes: `BREATH_WALL_HZ = 0.25`, `BREATH_HZ = BREATH_WALL_HZ / timeScale`.
- Yürüme fazı (`2π · gaitDistanceM / 6`), `presentationStrideLengthM = 6`, parça adları ve 1. şahıs listeleri değişmedi.

## 5. Test değişiklikleri (gerekçeli)

Eski testler sınır değerlerini (vz = ±1.2 örnekleri, boot dorsiflexion, geriye gövde eğimi) yeni karışım pencerelerine göre yazılmıştı. Bunlar gerçek sim değerleriyle çeliştiği için yeniden yazıldı:

- Kalkış/iniş örnekleri vz = 1.5 ve -1.5 (`0.63` ve `0.63` karışım ağırlığı). Saf kalkış pozu, ağırlık vz/2.4 nedeniyle sim içinde hiç ulaşılamaz; eşikler ölçülen karışık değerlere göre ayarlandı (ör. kol < -0.25 ve < -0.35).
- Eski "iniş botları dorsiflexion" beklentisi kaldırıldı: touchdown-absorb pozu (botlar pozitif) ağır basıyor; yerine gövdenin düz kaldığı kontrol edildi.
- Eski "gövde hafif geriye" beklentisi kaldırıldı: absorb pozu ileri yönde 0.045 rad eğim ekliyor.
- Nefes periyodu testi 0.22 yerine `0.25 / 8` kullanıyor.

Yeni testler: uçuş-yürüme mesafe eşikleri (apex ≥ 0.25, iniş ≥ 0.2, kalkış ≥ 0.16 rad; regresyon koruması), sim-sürüşlü kare değişimi ≤ 0.27 rad, iniş sönümünün `landingRecoveryFrac` ile monoton olması, nefes 0.25 Hz duvar saati.

## 6. Önizleme

- `scratchpad\jump\preview-new-jump-side.png` ve `preview-new-jump-34.png`: yeni rig, altı uçuş karesi + iki iniş sönümü karesi.
- `scratchpad\jump\preview-old-jump-side.png` ve `preview-old-jump-34.png`: HEAD rig, aynı kareler.
- `scratchpad\jump\preview-new-walk-side.png`: yürüme döngüsü.

Değerlendirme (önizleme): yeni kalkış karesi yürüyüşe çok yakın; kalkış silüeti zayıf. Eski sürümde kalkış karesi belirgin ama bir karede "patlıyor". Apex 3/4 görünümde kollar açık olarak okunuyor. Önizleme gölge ve ışık içermez; gerçek renderer'da değerlendirilmedi.

## 7. Açık noktalar

- **Kalkış silüeti ve sürekliliği çelişiyor.** Sim 8 kat hızlandığı için uçuş (1.29 sim-s) duvar saatinde ~0.16 s, 60 fps'te ~10 karedir. 0.25 rad/kare sınırı, yürüyüşten kalkış pozuna geçişi ~2 kareye yayar; kalkış pozu bu yüzden zayıf kalır. Gerçek çözüm sim tarafındadır: uçuş sırasında zaman ölçeğini düşürmek veya zıplama süresini uzatmak. Bu config/sim kararıdır, bu görevde yapılmadı.
- Kalkış karesindeki 0.261 rad hedefin (~0.25) hafif üstünde.
- İniş sönümünün ilk karesi (0.142) eski değerden (0.072) büyük; touchdown→absorb geçişi artık daha yumuşak ama sönüm başlangıcı biraz sert.
- Bacak eklemi diz içermiyor; apex ve iniş "bükük diz" yerine kalça ve bilek açılarıyla temsil ediliyor.
- `left*` parça adları değiştirilmedi (renderer kullanıyor); fiziksel taraf `side` alanındadır.
- Renderer tarafında `pose.viewModel` ve `part.material` kullanımı bu görevin kapsamı dışında.

## 8. Doğrulama

- `node --test test/astronaut-rig.test.mjs test/footprint-trail.test.mjs test/first-person-hands.test.mjs`: 72/72 geçti.
- `node --test test/` (Sim kökü): 672/672 geçti, çıkış kodu 0.
- Tarayıcı, smoke ve npm script'leri çalıştırılmadı (portlar diğer ajanlarda).
