# Stage 34A — Rota tercihleri ve segment karşılaştırması (audit)

Sahip: Efe. Dosyalar: `public/js/route/route-compare.js` (yeni), `test/route-compare.test.mjs` (yeni), bu belge. Değişmedi: `main.js`, `config.js`, `simulation/`, `surface/`, `input/`, `view/`, mevcut `route/` dosyaları (`cost-model.js`, `pathfinder.js`, `pathfinder.worker.js`, `route-service.js`).

## API

- `planRouteVariants({ window, startLocal, endLocal, budget?, options?, preferences?, planner?, now? })` → `{ schema, version, status, reason, reasonEN, results, comparison, meta }` (derin dondurulmuş).
- `describeRoutePreference(id)` → `{ id, label, description, note, disclaimerTR, text }`; bilinmeyen id `TypeError`.
- `ROUTE_PREFERENCES` (sıra: `shortest`, `balanced`, `gentle`), `ROUTE_PREFERENCE_IDS`, `REFERENCE_PREFERENCE_ID = 'balanced'`, `ROUTE_COMPARE_DISCLAIMER_TR`.

Sapma (ROADMAP metninden): `planRoute({grid, costParams, ...})` diye bir API yok. Gerçek çağrı `route-service.planWalkingRoute({ window, startLocal, endLocal, params, budget, options })` üzerinden yapılır; o da `planRoute({ field, ... })` çağırır. Böylece ≤2 m EVA koruması, uç nokta/no-data kuralları ve puan özeti tek-rota akışıyla birebir aynı kalır. Tercih başına `params` (sayılar) geçilir; alan `buildFieldForWindow` önbelleğinden kurulur.

## Tercih ağırlıkları (senaryo parametreleri, NASA eşiği değil)

| Tercih | maxSlopeDeg | comfortableSlopeDeg | roughnessRefM | costK | costP |
|---|---|---|---|---|---|
| En kısa (`shortest`) | 20 | 14 | 0,5 | 1 | 1 |
| Dengeli (`balanced`, referans) | 20 | 8 | 0,25 | 9 | 1,5 |
| En düşük eğim (`gentle`) | 20 | 4 | 0,12 | 30 | 2 |

`maxSlopeDeg` (sert kısıt) üç tercihte aynıdır ve 23A varsayılanından gelir; tercih sert kısıtı gevşetmez. Her ön ayar `status:'scenario'` ve "NASA eşiği değildir; senaryo ağırlığıdır" notu taşır.

## Çıktı

- `results[id]`: `status`, `reason`/`reasonEN` (planner nedeni AYNEN), `mode`, `modeNote`, `path`, `segments`, `stats`, `summary`.
- `summary`: `lengthM`; `estimatedDurationS` (yalnız EVA ve planner stats'ında varsa, yoksa `null`, türetilmez); `elevationGainM/LossM`; `maxSlopeDeg`; `meanScore`/`minScore` + `scoreSource`; `totalCost` + `costMetric` + `costComparable: false`; `hardestSegment` (segment başına ortalama maliyet çarpanı en yüksek olan).
- `comparison` (referans `balanced`): her aday için `identicalPath`, `identicalNote`, `deltaLengthM`, `deltaLengthPct`, `deltaMaxSlopeDeg`, `deltaMinScore` (ortak ölçek, bkz. aşağıda), `lateralDeviation` (`direction: 'candidate_to_reference'`, `meanM`, `maxM`; aday yol 1 m aralıkla örneklenir).
- `status`: `ok` | `partial` | `failed` (hiçbiri başarılı değil; neden tek ortak planner nedeni ise AYNEN, değilse tercih etiketli liste) | `invalid_input` (girdi/tercih listesi hatası).
- `meta`: `plannerCalls`, `totalMs`, `perPreferenceMs` (`now` parametresiyle; tek zamana bağlı alanlar bunlardır).

## Önemli tasarım kararları

1. **Puan tercihe bağlıdır.** Puan, tercihin kendi ağırlıklarıyla hesaplanır. Test geometrisinde (tepe, 80×80) `shortest` ve `balanced` AYNI yolu seçti ama kendi-ağırlık `minScore` değerleri 100 ve 84 çıktı. Bu nedenle `comparison.deltaMinScore` ortak bir ölçekte hesaplanır: referans (`balanced`) ağırlıkları, yalnız yol hücreleri. Özetteki puan ise "tercihin kendi ağırlıklarıyla" etiketlidir. UI iki değeri karıştırmamalı.
2. **Bölgesel pencere (>2 m):** puan ve EVA süresi üretilmez (`null`); Δ puan `null`.
3. **Toplam maliyet** tercihler arası karşılaştırılmaz (`costComparable: false`).
4. **Puan yedeği:** planner `minScore/meanScore` vermezse yol hücrelerinin puanından türetilir ve `scoreSource` bunu yazar. Mevcut planner EVA'da stats'ı her zaman üretir; yedek testte zorlanarak doğrulandı.
5. Sonuçlarda zaman alanı yok; `results` ve `comparison` aynı girdiyle birebir aynıdır (testte doğrulandı).

## Worker sözleşmesi (34B için öneri; worker değiştirilmedi)

`public/js/route/pathfinder.worker.js` mevcut haliyle tercih ağırlığını taşıyamaz:
- `init-window` `params` alır, ama `main.js` göndermez; alan bu anda kurulup sabitlenir.
- `plan-walking-route` her zaman `field` geçirir; `planWalkingRoute` `field` varken `params`'ı yok sayar. Ayrıca `message.budget` iletilmez.

Öneri (Alparslan, worker sahipliğinde):
- Seçenek A: `plan-walking-route` mesajına `params` ve `budget` ekle, `field` geçirme. `buildFieldForWindow` zaten 8 girişli önbellek kullanır.
- Seçenek B (tercih): yeni `plan-route-variants` mesajı. Worker içinde `planRouteVariants({ window, startLocal: message.startLocal, endLocal: message.endLocal, budget: message.budget, options: message.options, preferences: message.preferences })` çağrılır ve `{ type: 'variants-result', id, result }` döner.
- Maliyet: tam pencerede üç tercih ~0,9 s (tercih başına ~300 ms alan kurulumu). Ana iş parçacığında çalıştırılmamalı.

## Gerçek veri (Jezero, WB1 → Roubion, 1 m DTM, varsayılan Stage 23C ile aynı pencere)

| Tercih | Uzunluk (m) | Maks eğim (°) | Puan (kendi / en düşük) | Δuzunluk (m, %) | Δmaks eğim (°) | Δen düşük puan (ortak) | Aynı yol | Yanal sapma ort./maks (m) |
|---|---|---|---|---|---|---|---|---|
| En kısa | 730,505 | 10,64 | 100 (ort. 100) | 0,000 (0,00 %) | +0,83 | −3 | hayır | 4,91 / 24,52 |
| Dengeli (ref.) | 730,505 | 9,81 | 98 (ort. 99,97) | — | — | — | — | — |
| En düşük eğim | 732,161 | 9,27 | 90 (ort. 99,30) | +1,657 (+0,23 %) | −0,54 | +1 | hayır | 20,23 / 51,04 |

23C referansı: dengeli uzunluk 730,5 m ✓; en düşük puan 98 ✓.

Ek engebeli çiftler (tohum 20261114; düz hattın maks eğimi ≥ 8° filtresi; 7 çekimde 2 çift bulundu):
- Çift 1 (düz hat 156,3 m, maks 8,05°): üç tercih 163,284 m; maks eğim 10,34 / 8,05 / 7,25°; gentle→balanced sapma ort. 0,74 m, maks 3,00 m.
- Çift 2 (düz hat 450,1 m, maks 10,36°): üç tercih 457,335 m; maks eğim 8,63° hepsinde; sapma ort. 0,24 m, maks 3,54 m (aynı maks eğim, farklı geometri).

Yorum: Jezero'da tercihler arası fark küçüktür; bu 23C bulgusuyla tutarlıdır. "Tercih farkı yok" sonucu normal ve dürüst bir çıktıdır; UI bunu göstermelidir.

## Bağımsız yeniden hesap (scratchpad betiği, repo dışı)

- Balanced uzunluğu (yol noktalarının Öklid toplamı): 730,505 m; modül 730,505 m; fark 0,000.
- Gentle uzunluğu: 732,161 m; modül 732,161 m; fark 0,000.
- Gentle→balanced yanal sapma (1 m örnekleme, n = 814): bağımsız ort. 20,227 m / maks 51,039 m; modül 20,227 / 51,039; fark 0,000 / 0,000.
- Çift 1 ve çift 2 için uzunluk ve sapma değerleri de birebir eşleşti (yukarıda).

## Test sonuçları

- `node --test test/route-compare.test.mjs`: 18/18 yeşil.
- `node --test test/`: 366/366 yeşil (başlangıç 348 + 18 yeni).
- Duvar testi (22° kesit): üç tercih de gerçek `no_path` üretiyor (522 hücre tarandı); testte tam beklenti olarak sabitlendi.

## Açık noktalar

- Worker `params`/`budget` sözleşmesi (yukarıda) 34B öncesi çözülmeli; aksi halde UI tercih değiştiremez.
- 34B: "en kısa" ile "dengeli" aynı uzunlukta ama farklı yol olabilir; UI'da uzunluk ve yol farkı birlikte gösterilmeli. Puan Δ'ları yalnız ortak ölçek satırında karşılaştırılmalı.
- Tam pencerede üç tercih ~0,9 s; önbellek sıcakken daha hızlı olabilir, ölçülmedi.

## Çalıştırılmayanlar / yapılmayanlar

- git commit ve push yapılmadı (istenmedi). `git` bu ortamda PATH'te değil; dal ve durum kontrolü yapılamadı.
- `smoke-e2e.mjs`, tarayıcı/görsel testi ve worker'ın gerçek thread'deki çalışması denenmedi.
- `main.js`, `config.js`, worker ve diğer mevcut route dosyaları değiştirilmedi.

## Uyumluluk düzeltmesi (Stage 34 → 34B öncesi)

**Sorun (gerçek veride ölçüldü).** `main.js` `plan-walking-route` mesajında `options: { preference, costParams }` ve üst düzey `costParams` (`slopeWeight`/`distanceWeight`) gönderiyordu. Eski worker bunları okumuyordu; `planWalkingRoute` ise `options` içindeki bilinmeyen `preference` anahtarını `invalid_input` ile reddediyordu. Ölçüm (WB1→Roubion, Alparslan mesaj biçimi): üç tercih de `Bilinmeyen options anahtarı: preference` hatası verdi; mesajsız yol 730,505 m / 9,81° çalıştı. `main.js` değişmedi.

**Düzeltme (yalnız `route/pathfinder.worker.js` ve `route/route-compare.js` ek export'ları):**
- Tercih kimliği sırası: `message.preference` → `message.options.preference` → yok. Takma ad: `flattest` ≡ `gentle`. Bilinmeyen kimlik `Bilinmeyen rota tercihi: X` hatası verir; sessiz varsayılan yok.
- Tercih yok veya `balanced`: init-window alanı (eski yol). Tercih belirtilmemiş mesaj yanıtı eskisiyle bayt bayt aynıdır (`{type,id,result}`); `balanced` açıkça istenirse yanıta `preference`, `requestedPreference`, `preferenceNote` eklenir.
- `shortest`/`gentle`: route-compare ön ayar parametreleriyle `buildFieldForWindow` (pencere önbelleği) + `planWalkingRoute`.
- `message.costParams` ve `options.costParams` yok sayılır; `options`tan `preference` ve `costParams` ayıklanır, bu yüzden model'e sızmaz.
- `message.budget` artık planner'a iletilir (yoksa değişmez).
- Yeni `plan-route-variants` `{type,id,startLocal,endLocal,budget?,preferences?}` → `{type:'variants-result', id, result}` (`planRouteVariants`). Takma adlar `preferences` içinde de çözülür.
- `init-window` değişmedi: yeni pencere önceki alanı/önbelleği temizler; başarısız init de önceki pencereyi bırakmaz.
- route-compare.js ek export'ları: `ROUTE_PREFERENCE_ALIASES`, `resolveRoutePreferenceId(id)` (bilinmeyen için `null`), `routePreferenceParams(id)`. Mevcut davranış ve testler değişmedi.

**Kapsam dışı (bilinçli):** tercihe özgü heatmap üretilmedi; `init-window` heatmap'i yalnız balanced'dır. Alparslan'ın `ROUTE_PREFERENCES.costParams` tablosu (`slopeWeight`, `distanceWeight`) yok sayılır; tercih farkı yalnız bu kimlikten gelen route-compare ön ayarlarıyla oluşur.

**Gerçek veri (WB1→Roubion, worker üzerinden, `plan-walking-route` ve `plan-route-variants`):**

| Tercih (mesaj) | Çözülen | Uzunluk (m) | Maks eğim (°) | Δ uzunluk vs dengeli (m) | Δ maks eğim (°) | Yanal sapma ort./maks (m) |
|---|---|---|---|---|---|---|
| `shortest` | shortest | 730,505 | 10,643 | 0,000 | +0,834 | 4,91 / 24,52 |
| `balanced` (referans) | balanced | 730,505 | 9,809 | — | — | — |
| `flattest` (Alparslan) | gentle | 732,161 | 9,274 | +1,657 | −0,535 | 20,23 / 51,04 |

34A bağımsız tablosuyla eşleşir (730,505 / 730,505 / 732,161 m; maks eğim 10,64 / 9,81 / 9,27°). Üç tercih de farklı parametreyle çalışır (`gentle` ≠ `balanced`). Mesajsız yol `balanced` ile aynı yolu üretir.

**Açık noktalar (34B için):**
- `balanced` açık istendiğinde init-window alanı kullanılır; `main.js` init-window'da `params` göndermediği için bu varsayılan parametrelerdir.
- `plan-route-variants` ilk çağrıda `balanced` için init alanından ayrı bir alan daha kurar (önbellek anahtarı farklı); ek maliyet ölçülmedi.
- Testler: `test/pathfinder-worker.test.mjs` 11/11; `node --test test/` 377/377 (başlangıç 366 + 11).
- Çalıştırılmayanlar: git commit/push yapılmadı; `smoke-e2e.mjs`, tarayıcı/gerçek worker thread ve `main.js` UI akışı denenmedi.
