# Efe → Alparslan devir notu (güncel, 15 Kasım 2026)

**Dal:** `codex/efe-visual-realism` @ `53068e6` (bu oturumda çalışılan worktree: `C:\Users\efese\Desktop\Nasaspaceapps-efe`). Önceki sürüm (`190e133` ve `codex/efe-stage13-eva-kinematics` dalı) bu notta yerini bu sürüme bırakmıştır.
**Test durumu (bu oturum):** `cd Sim; node --test test/` → **574/574, çıkış kodu 0** (mevcut çalışma ağacı). `node scripts/preflight.mjs` → **HAZIR**. Tarayıcı kabulü: `Sim/stage-final-acceptance.md` (PASS/FAIL/NOT-TESTED). `npm run smoke` bu oturumda çalıştırılmadı.

## 1. Ortak çalışma klasörü uyarısı

İki oturum aynı klasörde dal değiştirirse birbirinin çalışma ağacını bozar (bu oturumda `Nasaspaceapps` ana klasörü başka bir oturumda çalışıyordu). **Öneri:** her iş için ayrı bir `git worktree` kullanın:

```powershell
git worktree add ..\Nasaspaceapps-<ad> <dal>
```

Bu oturumda ana klasöre dokunulmadı; yalnız `Nasaspaceapps-efe` worktree'si kullanıldı.

## 2. Görsel gerçekçilik dalı (özet)

- Işık: doğrusal ışık + ACES ton eşleme, Mars gökyüzü modeli, gökyüzü ambient ışığı, güneş gölge haritası (`view/3d/shadow-map.js`: `off` / `low` 1024 px / `high` 2048 px, varsayılan `high`), arazi gölgelendirmesi (`terrain-shading.js`), hava perspektifi. Kaynaklar: `SOURCES.md` #11–14 (basınç ve güneş çapı ölçüm değerleri; ton ve gökyüzü renkleri sunum parametresi).
- Karakter: kapsül hatlı beyaz astronot, visor/PLSS/halka parçaları, eklem alanında poz karıştırma, Froude tabanlı adım modeli (L = 0,9 m varsayım, kaynak doğrulanmadı; `strideLengthForSpeedM`).
- Birinci şahıs: yalnız eller ve ön kollar göz hizasında; aşağı bakışta gövde ve bacaklar kademeli görünür (`ab426ee`). Gözlendi: `fp-01-forward-pitch0.png`, `fp-02-lookdown.png`.
- Zemin detayı: yakın alan mikro doku ve ayak izi (görseldir; regolit mekaniği iddiası yok).

## 3. Render pass sözleşmesi (bozulmamalı)

`view/3d/renderer.js` içinde `renderPass` uniform'u:

| Pass | İçerik |
|---|---|
| 0 | Jezero arazi mesh'i |
| 1 | 3D waypoint beacon'ları ve rota kılavuz çizgileri |
| 2 | Astronot rig'i ve birinci şahıs view-model |
| 3 | Gökyüzü kubbesi |
| 4 | Gölge derinliği (erken dönüş; diğer pass'ler gölge haritasını örnekler) |
| 5 | Ayak izleri (instanced yama) |
| 6 | Rota şeridi (emissive, tone-mapped çıktı) |
| 7 | Bölgesel ufuk (MOLA-sınıfı, ayrı projeksiyon, `?horizon=off` ile kapalı) |

Yeni pass gerekirse 8 ve sonrası kullanılır. Pass 4 erken döner; pass 7'nin yerel dünya ile karıştırılmaması için ayrı projeksiyon kullanır.

## 4. Birleştirme ve entegrasyon kararları

- **36B / 622f526 / K3-2 / 31B:** `3cec636`, `20f6558`, `331d1ba`, `2076205`, `919b9a8`, `4f741a5` ile birleştirildi. Kaynak ve sınır paneli 31B'den gelir.
- **ROUTE_PREFERENCES costParams tablosu kaldırıldı.** Önceki `main.js` tablosundaki `slopeWeight` / `distanceWeight` maliyet modelinde yoktu. Güncel durum: `main.js` içinde tablo yok (doğrulandı). Tercih farkı yalnız `route/route-compare.js` içindeki kimlik ön ayarlarından gelir (`shortest`, `balanced`, `gentle`; UI'de `flattest` takma adı). Ön ayar sayıları senaryo parametresidir; kaynaklı değildir.
- **Plan yanıt durumu tek konumda:** `public/js/route/plan-response-state.js` (`classifyPlanResponse`). Minimap'te kopya yok (doğrulandı; test: `test/plan-response-state.test.mjs`).
- **Kamera hareketi:** `view/3d/camera-motion.js` (K2-1/K2-2, `f7ea37b`). Yürüme salınımı, nefes, yumuşak iniş dip'i. `main.js` yalnız bağlar. Dip ölçümü: 0,0549 m maks. kare farkı (`stage-camera-motion-audit.md`).
- **Ufuk:** `view/3d/horizon-mesh.js` (K2-3/K2-4, `bbf75b6`): MOLA bölgesel kot, `needs_review` datum etiketi, yerel HiRISE ile birleştirilmez, yürünebilirlik puanı üretmez. `renderer.horizon.status`: `ready` / `off` / `unavailable`.
- **Minimap:** Viking global katman (K0) ve Jezero yerel katmanı; "Mars globali göster" / "Kapsama sığdır". Viking renk mozaiğidir; kot veya ortogörüntü değildir.

## 5. Ölçümler ve doğrulama (bu oturum)

| Konu | Değer | Kaynak |
|---|---|---|
| Birim testleri | 574/574 | `node --test test/` (çıkış kodu 0) |
| Ön uçuş | HAZIR, hata 0, uyarı 0 | `node scripts/preflight.mjs` |
| Tarayıcı | PASS: D1, D2, D2b, R1, M1, F1, H1, H2, S1, X1, X2. NOT-TESTED: M2, sıçrama, varış rozeti, galeri, ortho hizası | `stage-final-acceptance.md` |
| Rota (UI) | Dengeli 730 m / 9,8°; en kısa 730 m / 14,1°; en düz 731 m / 10,1° | Tarayıcı özeti; devir notundaki 730,505 / 732,161 m ile eşleşmiyor |

## 6. Açık işler ve sahipler

**Alparslan (entegrasyon):**
- K1-5 demo dondurma (yalnız hata düzeltme; `demo-freeze` etiketi henüz yok).
- K1-2 kalan tarayıcı kanıtı: sıçrama/iniş pozu, Sol 164 galerisi, gerçek no-data reddi, varış rozeti, hızlı rota yarışı, ortomozaik hizası.
- K2-6 gerçek cihaz/GPU kare süresi ve FPS ölçümü.
- K3-1: no-data üzerinde yerçekimi kararı (`sim.js`; bu oturumda doğrulanmadı).
- K3-3: rig test sınırının tasarım onayı.
- Rota süresi tutarsızlığı: `route-service.js:301` (0,8 m/s) ile `config.js:5` (1,2 m/s). `main.js:348` sabit metni de bunu yazıyor.

**Efe:**
- K1-4 Viking MDIM 2.1 lisans/atıf teyidi (elle, USGS sayfası). Metin yoksa "belirtilmemiş" kalır.
- K2-5 son gerçekçilik turu (önce/sonra ekran görüntüleri).
- K3-4 rig `left*` adları fiziksel sağ tarafta (`side` metadatası var; renderer/main kullanımı gözden geçirilmedi).
- K3-6: `stage39-ortho-diagnosis.md` "Yazar: Efe" ifadesi düzeltilecek; bu rapor Efe'nin değildir. Ayrıca "0,0 m projeksiyon sapması" aritmetik tutarlılıktır, bağımsız kanıt değildir; korelasyon r≈0,40 zayıftır. `stage34b` raporundaki "costParams iletilir" ifadesi düzeltme öncesinden kalmadır.

**Açık veri/karar:**
- Datum: `config.js:56` `verticalDatumVerified: true`; `data/dtm_subset.json` `false`. Kanıt yoksa `false` olmalı (K3-5).
- Göz yüksekliği: kod 1,48 m (`camera.js:9`); `e9a0a78` mesajı 1,75 m. Kod esas alındı.
- Ortomozaik uyarı metni (`hud.js:104`) eski JP2 bayrağına bağlı; WMTS katmanı ayrı sunulurken iki çelişkili mesaj görünüyor.

## 7. Dosya haritası (değişenler)

- `Sim/DEMO_NOTES.md` (yeni): jüri ve sınır kartı, sayı etiketleri, sorular.
- `Sim/README.md` (güncel): çalıştırma, parametreler, kontroller, bilinen sınırlar.
- `Sim/stage-final-acceptance.md` (yeni): otomatik ve tarayıcı kabulü.
- `yapay zeka icin/road map.md`: en üstte "Proje kapanış durumu" bölümü (mevcut içerik korundu).
- `Sim/stage-handoff-efe-to-alparslan.md` (bu dosya).
