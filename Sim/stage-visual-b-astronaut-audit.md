# Görsel gerçekçilik Ajan B: astronot rig denetimi

Kapsam: `public/js/view/3d/astronaut-rig.js` ve `test/astronaut-rig.test.mjs`. Renderer, kamera, sim ve main.js değiştirilmedi. Commit yapılmadı (WIP `a1078f1` üzerinde çalışma ağacı değişikliği).

Bu belgedeki görsel değerlendirme bir **önizlemedir**: tarayıcı/WebGL çalıştırılmadı, uygulama renderer'ı kullanılmadı. Renkler görsel yaklaşımdır; gerçek EVA giysi ölçüsü, malzeme veya insan biyomekaniği iddiası yoktur. Atmosfer sürüklemesi ve kaynaksız giysi kütlesi kuvveti eklenmedi.

## 1. WIP denetimi ve kırmızı test

- WIP `a1078f1` doğrulanmamıştı. Başlangıçta 1 test kırmızıydı: "first-person lower-body export ... chained in every pose", hata `boot-leg attachment error 0.00775`.
- Neden: `blendCores` karışımı parça ofsetlerini ve Euler açılarını bağımsız lineer karıştırıyordu. Hava durumunda (takeoff/touchdown karışım penceresi) bot, bacağın kendi dönüşüyle tutarlı kalmıyordu. Teşhis betiği (`scratchpad/rig/attach-diag.mjs`) hatanın yalnızca `vz = ±1.5` gibi karışık havada çıktığını gösterdi (`-1.5: 4.3e-3`, `+1.5: 7.7e-3`).
- Düzeltme: karışım eklem alanında yapılıyor. Menteşe dönüşleri (`helmet`, kollar, bacaklar) ve zincir çocuklarının (eldiven, bot) ebeveyn-yerel dönüşleri ayrı ayrı lerp ediliyor; ofsetler karışık dönüşlerden yeniden türetiliyor (`hingedPart3D`, `chainedLimbPart`). Sonuç: t'nin her değeri için bağlantı hatası 1e-9'un altında. Kullanılan yeni yardımcılar: `blendCores`, `localRotationOf`, `HINGE_IDS`, `CHAIN_PARENT`. `blendRigPoses` artık bu çekirdeği kullanıyor.
- Test değişiklikleri (WIP'in kendisi yaptı, gerekçesi doğru ama tartışmalı): Stage 13 örnekleri `vz = ±2.0` yerine `±1.2` olarak değiştirildi ve bot dorsiflexion eşiği `-0.08`den `-0.06`ya çekildi. Gerekçe: `TAKEOFF_BLEND_VZ_FULL_MPS = 2.0` ve `TOUCH_BLEND_VZ_FULL_MPS = -2.0` pencereleri. Bkz. açık nokta A.
- Yeni test seti eklendi (6 test: görünüm metadatası, ilk şahıs listesi, rigid/zincir takibi, blend, Froude, stride; bkz. §3-§7).

## 2. Renk ve malzeme tablosu (sRGB, görsel yaklaşım)

| Parça | colorRgb | material (roughness / metallic) | side |
|---|---|---|---|
| torso | [0.86, 0.85, 0.81] | fabric 0.88 / 0 | merkez |
| leftArm / rightArm, leftLeg / rightLeg | [0.84, 0.83, 0.79] | fabric 0.88 / 0 | fiziksel sol/sağ |
| helmet | [0.88, 0.87, 0.84] | shell 0.55 / 0 | merkez |
| visor | [0.62, 0.46, 0.16] altın | gold 0.12 / 1 | merkez |
| leftGlove / rightGlove | [0.20, 0.22, 0.25] | rubber 0.92 / 0 | yan |
| leftBoot / rightBoot | [0.17, 0.17, 0.19] | rubber 0.92 / 0 | yan |
| leftSole / rightSole | [0.07, 0.07, 0.08] | rubber 0.92 / 0 | yan |
| neckRing, waistRing, bilek/ayak halkaları | [0.55, 0.57, 0.60] gri metal | metal 0.35 / 0.8 | merkez/yan |
| chestPack | [0.58, 0.60, 0.63] | module 0.5 / 0.3 | merkez |
| backpack (PLSS) | [0.82, 0.81, 0.77] | shell 0.55 / 0 | merkez |
| plssPanel / plssAntenna | [0.25, 0.26, 0.28] / [0.75, 0.78, 0.82] | module / metal | merkez |

- `colorRgb` ve `material.albedoLinear` (sRGB→doğrusal dönüşüm, 4 ondalık) tüm parçalarda [0, 1] aralığında. Testle kilitlendi.
- Turuncu giysi kaldırıldı; gövde beyaza yakın, mavi tonsuz (`torso[2] <= torso[0] + 0.02`).

## 3. Yeni parçalar ve ebeveyn takibi

| Parça | Ebeveyn | Takip türü | Not |
|---|---|---|---|
| visor | helmet | rigid (rigidFollowPart) | Kask ile birlikte döner |
| leftWristRing / rightWristRing | leftArm / rightArm | rigid | Kolun alt ucunda |
| leftAnkleRing / rightAnkleRing | leftLeg / rightLeg | rigid | Bacak-bot bağlantısı |
| leftSole / rightSole | leftBoot / rightBoot | rigid | Bot tabanı z=0.01 |
| leftGlove / rightGlove | leftArm / rightArm | chained (zincir) | Bilekten dönüş yerel |
| leftBoot / rightBoot | leftLeg / rightLeg | chained | Ayak bileği yerel |
| backpack, plssPanel, plssAntenna, neckRing, waistRing | (gövde / kök) | sabit, kök hareketini izler | Ebeveyn eklem değil; mevcut tasarım |

Testle kilitlendi: rigid takipçiler için `W_child(p) = W_parent(p)` (1e-9), zincir çocukları için pivot-ebeveyn formülü (1e-9), tüm durum taramasında ve karışım ara değerlerinde.

## 4. First-person listeleri

- `FIRST_PERSON_RIG_PARTS` (renderer'ın bugün kullandığı): torso, chestPack, leftArm, rightArm, leftGlove, rightGlove, leftWristRing, rightWristRing. Eklenen iki parça bilek halkalarıdır.
- Kask, vizör, PLSS, boyun/bel halkaları, bot tabanları ilk şahıs listesinde YOK (kamerayı kapatmaz). Testle kilitlendi.
- `FIRST_PERSON_LOWER_BODY_PARTS`: leftLeg, rightLeg, leftBoot, rightBoot, leftAnkleRing, rightAnkleRing (eksen değişmedi, halkalar eklendi).

## 5. Geriye dönük uyumluluk

- Renderer'ın kullandığı alanlar: `ASTRONAUT_RIG.parts[id].colorRgb`, `size`, `center`, `pivot`, `geometry`, `FIRST_PERSON_RIG_PARTS`, `ASTRONAUT_RIG.metadata.firstPersonParts`. Hepsi korundu; yalnızca yeni parça ve alanlar eklendi (`material`, `side`, bilek/ayak halkaları, visor, PLSS).
- Parça adları değişmedi; `helmet`, `visor`, `backpack`, `plssAntenna`, `plssPanel`, `neckRing`, `waistRing`, `leftSole`, `rightSole` ve ana parçalar `ASTRONAUT_RIG.parts` içinde bulunur.
- `metadata.presentationStrideLengthM = 6` ve faz kuralı `2π·gaitDistanceM/presentationStrideLengthM` aynen korundu (`footprint-trail` ve kamera fazı bağlı). `strideLengthForSpeedM` bu faz kuralını değiştirmez; yalnızca yardımcı fonksiyon olarak eklendi (test: `strideLengthForSpeedM(1.2) = 6`).

## 6. Blend ve geçişler (sayısal)

Test içinde (yeni, `test/astronaut-rig.test.mjs` Stage B bloğu):
- `blendRigPoses(a,b,0) = a`, `(a,b,1) = b` (tam eşitlik), `t` kıstırma, determinizm, geçersiz girdi TypeError.
- 200 adımlık karışımda ardışık kareler arası maksimum eklem değişimi < 0.1 rad (assert eşiği; ölçülen değer bu belgede raporlanmadı).
- Karışım ara değerlerinde (her 20 adımda) bot, bilek/ayak halkası, eldiven ve vizör bağlantı hatası < 1e-9.

Sim-tahrikli karşılaştırma (`scratchpad/rig/sequence-compare.mjs`): gerçek `MarswalkSim.stepFirstPerson` 60 fps (dt = 1/60 s), yürü 5 s → dur 2 s → zıpla → havada → yürü 3 s. Her segmentte kareler arası en büyük parça dönüşü değişimi (rad):

| Segment | Eski rig (cf51058) | Yeni rig | Not |
|---|---|---|---|
| walk (yürü) | 0.0746 (leftLeg) | 0.0759 (leftLeg) | Eşdeğer; yeni fazla ~1.7 % |
| stop (yürüyüşten duruşa) | 0.0514 (rightGlove) | 0.0514 | Aynı; hız sürekli |
| jump (kalkış) | 0.5337 (leftArm) | 0.4509 (rightArm) | Hâlâ yüksek, bkz. açık nokta A |
| air (uçuş + iniş) | 0.5233 (leftLeg) | 0.3136 (leftLeg) | Azaldı, %40 |
| walk2 (iniş sonrası yürü) | 0.0746 | 0.0759 | Eşdeğer |

Yorum: yeni rig uçuş ve iniş geçişlerini belirgin yumuşatıyor, ama kalkış anında kare başına ~0.45 rad hâlâ var. Bunun nedeni karışım penceresinin (0.8 m/s) 60 fps'te yalnızca ~1.6 karede kapanması ve yürüyüş ile uçuş pozları arasında ~0.55 rad fark. Durumsuz (stateless) bir tasarımla tek kare içinde tamamen düzeltilemez; bkz. açık nokta A.

## 7. Froude ve Mars yerçekimi lope ölçeklemesi

Model: Fr = v²/(g·L), L = 0.9 m (varsayılan model boyu, ölçüm değil), kaynak doğrulanmadı ("Froude ölçeklemesine dayalı model, kaynak doğrulanmadı"). Walk→run eşiği Fr = 0.5 (model parametresi).

- Mars (g = 3.71 m/s²): v_geçiş = √(0.5 · 3.71 · 0.9) = **1.292 m/s**
- Dünya (g = 9.80665 m/s²): v_geçiş = √(0.5 · 9.80665 · 0.9) = **2.101 m/s**
- Oran = √(3.71 / 9.80665) = 0.6151; Mars geçiş hızı Dünya'dakinin ~%62'si. Testle kilitlendi.
- Senaryo yürüyüş hızı 1.2 m/s'de Fr = 1.44 / (3.71 · 0.9) = **0.431** (Mars) ve 0.163 (Dünya). Lope ağırlığı Mars'ta 0.17 civarıdır, yani yürüyüş hâlâ yürüyüş.

Stride: `strideLengthForSpeedM(v) = 6 · (v/1.2)^0.6`, v ≥ 0.05. Değerler: 0.6 m/s → 3.96 m; 2.4 m/s → 9.09 m. Monoton non-decreasing, sonlu (testle).

## 8. Önizleme (tarayıcı yok; düz gölgeli silüet)

Üretilen dosyalar (`scratchpad/rig/` altında):
- `C:\Users\efese\AppData\Local\Temp\claude\95fe7bc92ea59d43\8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df\scratchpad\rig\preview-walk-34.png`: 8 yürüme karesi, 3/4 görünüm.
- `...\scratchpad\rig\preview-walk-side.png`: aynı, yan görünüm.
- `...\scratchpad\rig\preview-jump-side.png`: kalkış (2.4 m/s), 1.2, 0, −0.8, −1.8, −2.4 ve iniş; yan görünüm.
- `...\scratchpad\rig\preview-jump-34.png`: aynı, 3/4 görünüm.
- `...\scratchpad\rig\preview-idle-34.png`: duruş ve stop, 3/4.

Değerlendirme (önizleme, dürüst): beyaz giysi, gri bağlantı halkaları, koyu eldiven ve botlar, altın vizör okunuyor. Yürüme karesinde kol-bacak ters fazı ve hafif gövde eğimi görünüyor. Uçuş pozları yeterince ayrışmıyor; kalkış ile yürüyüş arasındaki fark küçük, zıplama silüeti zayıf. Gerçek renderer'da gölge ve ışık olmadan yargılanamaz. Önizleme ile renderer'ın farkı yüksek olabilir.

## 9. Renderer için öneriler (Ajan A / Alparslan)

1. `part.material` (albedoLinear, roughness, metallic) ve `part.side` henüz kullanılmıyor. Işık/gölge ajanı bu alanları okuyabilir; `albedoLinear` doğrusal uzayda, `colorRgb` sRGB.
2. Yeni parçalar (visor, bilek/ayak halkaları, soles, PLSS, boyun/bel halkaları) renderer'da `Object.keys(ASTRONAUT_RIG.parts)` ile zaten çizilir. Üçüncü şahısta görünürler; ilk şahısta yalnız bilek halkaları eklendi.
3. `pose.viewModel` hâlâ renderer tarafından tüketilmiyor (önceki denetim bulgusu). Bu, ilk şahıs nefes ve adım salınımının çizime bağlı olmadığı anlamına gelir.

## 10. Test sonuçları

- `node --test test/astronaut-rig.test.mjs test/footprint-trail.test.mjs`: **50/50** geçti (WIP kırmızı testi dahil).
- `node --test test/` (tam paket): **479/479** geçti, çıkış kodu **0**.
- Tarayıcı, smoke, npm run smoke çalıştırılmadı (yetki Ajan A'da).

## 11. Açık noktalar

- **A. Kalkış/iniş geçiş sürekliliği.** Mevcut karışım durumsuz; kalkışta 2.4 m/s impulsu ile ilk kare ~0.45 rad. Olası seçenekler: (a) karışım penceresini daraltmak (ascent pozunu daha uzun gösterir, ama kareler arası sıçrama artar); (b) rig'e çerçeve başına durumlu yay (critically damped spring) eklemek, bu Alparslan/renderer kararı ve "durumsuz" kuralı ile çelişir; (c) kalkışta gait ile uçuş arasında ortak bir ara poz tanımlamak. Karar Alparslan'a bırakıldı.
- **B. WIP testlerinin gevşetilmesi.** Stage 13 örnekleri `vz=±2.0`dan `±1.2`ye alındı ve bot dorsiflexion eşiği `-0.08`den `-0.06`ya çekildi. Gerçek sim impulsu (2.4 m/s) bu kadar uzun bir gait karışımını gerektiriyor; "Ascent" pozu gerçek kalkışta neredeyse hiç görünmüyor. Bu bir tasarım kararı, test gevşetmesi değil; ama Alparslan onaylamalı.
- **C. Gövde elemanları (backpack, plssPanel, neckRing, waistRing) yalnız kökü izler**, ayrı bir eklem değil. Kol ve bacak ile birlikte tam kinematik değil.
- **D. `leftLeg/leftBoot/leftArm` isimleri** hâlâ yerel −X'te, fiziksel sağda (stage32a bulgusu). `side` alanı kullanıcıya dönük etiket için eklendi.
- **E. Önizleme yalnızca silüet**, gerçek ışık/gölge ve renderer kalitesi değerlendirilmedi.
