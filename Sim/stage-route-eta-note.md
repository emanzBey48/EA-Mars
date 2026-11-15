# Rota süre tahmini ile simülasyon hızı tutarsızlığı (stage-route-eta)

Planlama göstergesidir; güvenli rota sertifikası değildir. Hız bir senaryo parametresidir, kaynaklı bir insan yürüme hızı değildir.

## Sorun

- Rota özetindeki "Tahmini yürüme süresi" düz yol uzunluğunu `DEFAULT_SCENARIO_SPEED_MPS` (0,8 m/s) ile bölüyordu.
- Simülasyon yürüme hızı `config.js` `SCENARIO.walkSpeedMps` (1,2 m/s, simülasyon saati) idi.
- Metin de sabitti: `main.js` "(0,8 m/s senaryo hızı)" yazıyordu.
- Sonuç: 730 m rota arayüzde ~15 dk 12 sn, simülasyonda ~10 dk 8 sn sürüyordu.

## Değişiklik

| Dosya | Ne değişti |
|---|---|
| `Sim/public/js/route/pathfinder.worker.js` | `withScenarioSpeed`: `plan-walking-route` ve `plan-route-variants` için `options.scenarioSpeedMps` verilmemişse `config.js` `SCENARIO.walkSpeedMps` eklenir. `plan-route-variants` artık `options`'ı da iletir. |
| `Sim/public/js/route/route-service.js` | `DEFAULT_SCENARIO_SPEED_MPS.value` 0,8 → 1,2 (config ile aynı değer; `test/route-service.test.mjs` eşitliği zorlar). Yeni isteğe bağlı `scenarioSpeedSource` seçeneği. `durationAssumption.source` kullanılan hızın kaynağını yazar. `null` hız artık sessizce varsayılana düşmez, açık `invalid_input` verir. |
| `Sim/public/js/main.js` (`renderRouteSummary`, `formatDurationS`) | Süre satırı "(simülasyon saati, 1,2 m/s senaryo hızı)" der. Ayrı "Duvar saati (tahmini)" satırı `simülasyon saati / SCENARIO.timeScale` ile hesaplanır. Sabit "0,8 m/s" metni kaldırıldı. |
| `Sim/test/*.test.mjs` | `route-service` ve `route-compare` testlerindeki 25/0,8 beklentisi 25/1,2'ye çekildi (senaryo hızı değişti). Worker için yeni testler (s1–s7) ve birim testleri eklendi. |

Hesap değişmedi: yol, maliyet ve tercihler aynıdır. Yalnız süre bölenidir.

## Sonuç (legacy DTM, WB1 -> Roubion, planlayıcı 729,66 m)

| Gösterim | Önce | Sonra |
|---|---|---|
| Simülasyon saati (arayüz süresi) | 15 dk 12 sn (0,8 m/s) | 10 dk 8 sn (1,2 m/s) |
| Duvar saati (×8) | ayrı gösterilmiyordu | 1 dk 16 sn |

Uzunluk gösterimi tek kuraldır: tamsayı metre (`toFixed(0)`). 730 m ve 731 m değerleri aktif legacy DTM'den gelir. 730,505 m ve 732,161 m değerleri USGS adayı penceresinden gelir. Fark DTM kaynaklıdır, yuvarlamadan kaynaklanmaz.

## Doğrulama

- Bağımsız betik (`scratchpad/eta/verify-eta.mjs`): gerçek legacy pencere, Roubion koordinatı config içe aktarılmadan ham formülle hesaplandı; süre = uzunluk / 1,2 ✔; variants üç tercih ✔; override ✔.
- Route testleri: `pathfinder-worker`, `route-service`, `route-compare`, `plan-response-state`, `nodata-route`, `pathfinder` hepsi geçti (103/103).
- Tam paket: bu değişiklikle ilgisiz olarak `astronaut-rig` testlerinde 4 kırmızı var (eşzamanlı rig çalışması); bu aşamanın dosyaları değildir.
- Tarayıcı smoke çalıştırılmadı. Smoke betiği süre metnini kontrol etmez; 5a/5b etiketleri ve feragat kuralları değişmedi.
