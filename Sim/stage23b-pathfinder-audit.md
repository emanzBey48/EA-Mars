# Stage 23B — A* rota planlayıcı denetim notu

Dosyalar: `Sim/public/js/route/pathfinder.js`, `pathfinder.worker.js`, `Sim/test/pathfinder.test.mjs`.
Etiketler: DOĞRULANDI = testle/ölçümle görüldü; OLASI = akıl yürütme, henüz ölçülmedi.

## API
- `planRoute({ field, start, end, budget?, options? })` -> `{ status, reason, path, stats, segments, algorithm }`. Durumlar: `ok | no_path | invalid_input | start_blocked | end_blocked | budget_exceeded` (yeni durum eklenmedi). Hiçbir durumda sahte yol yok; hata hallerinde `path: []` ve nedeni anlatan `reason`. `planRoute` istisna fırlatmaz: beklenmeyen hata (fırlatan getter, tahsis hatası vb.) `invalid_input` + `reason: "beklenmeyen hata: …"` döner. DOĞRULANDI.
- `budget` (undefined veya düz nesne; `null`/dizi/ilkel geçersiz): `maxExpansions` pozitif sonlu tam sayı, `maxMs` pozitif sonlu sayı; bilinmeyen anahtar reddedilir. Varsayılan genişletme bütçesi 2n+1000. DOĞRULANDI.
- `options` (undefined veya düz nesne): `smooth` boolean (varsayılan false), `hierarchical` `true | false | 'auto'` (varsayılan false = kesin optimal), `coarseFactor` tam sayı >= 2 (varsayılan 8), `corridorCells` tam sayı >= 1 (varsayılan 2, kaba hücre). Yanlış tip/aralık/bilinmeyen anahtar -> `invalid_input`; sessiz varsayılana düşme yok. 'auto' yalnız > 1e6 hücrede hiyerarşik. DOĞRULANDI.
- `field.schema` isteğe bağlıdır; verilmişse tam olarak `'marswalk.cost-field.v1'` olmalı, aksi `invalid_input`. `field.cost` `Float32Array` veya `Float64Array` kabul edilir. DOĞRULANDI.
- `handlePlanMessage({type:'plan', id, field, start, end, budget, options})` -> `{type:'result', id, result}` veya `{type:'error', id, message}` (yalnız bilinmeyen mesaj tipi); saf, structuredClone ile uyumlu. DOĞRULANDI.
- `algorithm.optimality`: `optimal | near_optimal | grid_optimal_then_smoothed | none`. Sonuç donmuş (deep-freeze). DOĞRULANDI.
- `stats` (eklenen alanlar): `gridCost`, `costMetric`, `smoothingGain` (aşağıda). Mevcut alanlar değişmedi.
- Girdi doğrulama: cost yalnız Infinity veya sonlu >= 1; NaN/<1/-Inf, uzunluk uyuşmazlığı, cellSizeM<=0, tam sayı olmayan start/end, ve `cellSizeM*2*maxCost*rows*cols` sonlu değilse (ör. `cellSizeM: 1e308`) -> `invalid_input`. DOĞRULANDI.

## Maliyet ölçüleri (DENETİM DÜZELTMESİ)
- `stats.totalCost` = DÖNEN yolun maliyeti, `stats.costMetric` ölçüsünde:
  - `'grid_step'`: yumuşatılmamış yol; adım = mesafe x (cost[a]+cost[b])/2. Tam A*'da bu, Dijkstra referansıyla eşleşen ızgara optimumudur.
  - `'line_integral'`: yumuşatma uygulandıysa; kısayol segmentleri hücre-içi-uzunluk ağırlıklı çizgi entegrali ile ölçülür.
- `stats.gridCost` = yumuşatmadan önceki A* yolunun ızgara-adımı maliyeti (her zaman hesaplanır). Hiyerarşikte bu, koridor-içi aramanın optimumudur (global optimum değil).
- `stats.smoothingGain` = `gridCost - totalCost` (yumuşatma uygulanmadıysa 0; >= 0).
- Kabul kuralı: bir kısayol yalnız çizgi maliyeti, değiştirdiği ızgara koşusunun maliyetinden büyük değilse alınır; toplam da `gridCost`'u aşarsa yumuşatma geri alınır. Yani yumuşatma AYNI ölçüde yolu kötüleştirmez. Ancak çizgi-integrali ile ızgara-adımı ölçüleri farklıdır: yumuşatılmış `totalCost`, ızgara optimumuyla karşılaştırılamaz ve ondan düşük çıkabilir. Bağımsız ölçümle 48/48 rastgele karşılaştırmada yumuşatılmış maliyet ızgara optimumunun altındaydı (en çok %8,9). Bu "daha ucuz/daha güvenli rota" iddiası değildir; `reason` metni bunu açıkça söyler.

## Algoritma ve takaslar
- 8-komşu A*; adım = mesafe(merkez) x (cost[a]+cost[b])/2; tie-break: küçük f, büyük g, küçük indeks (deterministik). Komşu sırası sabit.
- Yığın: indeksli ikili yığın (decrease-key), `Int32Array/Float64Array/Uint8Array`, düğüm başına nesne yok.
- Sapma notu: g/f için Float32 yerine **Float64** kullanıldı (Float32 birikimi 1e-6 referans toleransını bozabilir; bellek ~55 MB/1,9 M hücre).
- Köşe kesme yasak: çapraz adımda iki ortogonal komşu da geçilebilir olmalı. DOĞRULANDI (2x2 testleri).
- Hiyerarşik: kaba hücre geçilebilir <=> içinde geçilebilir ince hücre var; kaba maliyet = geçilebilir ince maliyetlerin ORTALAMASI. Kaba A* -> yol çevresinde `corridorCells` kaba hücre koridor -> koridorla sınırlı ince A*. Kaba veya koridor araması başarısızsa tam ızgaraya düşülür (`reason` içinde "koridor"/"kaba" notu, `hierarchical:false`, `optimality:'optimal'`). Ortalama kabul edilebilir değildir, bu yüzden hiyerarşik sonuç "near_optimal"; asla "optimal" etiketlenmez. DOĞRULANDI.
- Bütçe kesintisi `reason`'ı: kaba aramada kesilirse koordinat KABA ızgarada verilir ("kaba ızgarada (k=..) ... (r,c) ≈ ince (r*k,c*k)"); eskiden kaba indeks ince sütun sayısıyla biçimleniyordu. Hiç genişletme olmadan kesilirse alt sınır başlangıç hücresinin oktil değeridir (eskiden "Infinity m").
- Bellek: hiyerarşik -> tam arama geri dönüşünde ince tamponlar (g,f,parent,closed,pos,heap) yeniden kullanılır; çift büyük tahsis yok. Kaba ızgara tamponları ayrı ve küçüktür.
- Yumuşatma (açık): yol üzerinde en çok 96 indeks ileri görüş hattı denenir; segment kapalı supercover (eps 1e-9, köşe teması dahil) boyunca tüm hücreler geçilebilir ve çizgi-integrali maliyeti <= değiştirilen koşunun ızgara maliyeti ise kısaltılır.

## Kabul edilebilirlik (admissibility)
h = oktil(dr,dc) x cellSizeM x minCost. Her adım >= minCost x mesafe ve oktil tutarlı olduğundan h tutarlı => ilk çıkan hedef optimaldir. `maxMs` her 512 genişletmede kontrol edilir (süre, doğrulama dahil istek başından sayılır). DOĞRULANDI (referans testi).

## Doğrulama sonuçları (31/31 pathfinder testi yeşil)
- Dijkstra referansı: 60 rastgele küçük alan (seed'li), fark < 1e-6; test artık `compared + noPath === 60` ve `compared >= 50` iddia eder (eski totoloji kaldırıldı). DOĞRULANDI.
- `impassableCrossings === 0` yalnız bunu açıkça iddia eden testlerde doğrulanır (açık alan, rastgele alanlar, hiyerarşik, yumuşatma, koridor geri dönüşü); her çıktıda değil. DOĞRULANDI (iddia edilen yerlerde).
- Hiyerarşik/tam maliyet oranı (300x360, 6 tohum): 1.0000, 1.0007, 1.0000, 1.0000, 1.0020, 1.0000; altısında da hiyerarşik yol GERÇEKTEN kullanıldı (`hierarchical === true` iddia edilir), eşik < 1.005; genişletme tam/hiy ≈ 0,52 (eşik 0,75). Açık 1676x1135 alanda oran 1.0119 (eşik 1.025). Yalnız sentetik alanlar; gerçek DTM'de farklı olabilir: OLASI.
- Koridor geri dönüşü: 64x64 tek-geçitli duvar (geçit koridor dışında), `corridorCells:1`: kaba yol var, ince koridor kapalı -> `hierarchical:false`, `/koridor/` notu, maliyet tam A* ile eşit. Kaba ızgarada da kapalı durumda `no_path` + "kaba" notu. DOĞRULANDI.
- Bütçe kesintisi koordinatları ince ızgara sınırı içinde, "Infinity/NaN" yok (düz ve hiyerarşik, maxExpansions ve maxMs). DOĞRULANDI.
- Worker: sahte `WorkerGlobalScope` olmadan içe aktarma `onmessage`'ı bağlamaz; sahte WorkerGlobalScope ile bağlanır ve mesaj gidiş-dönüşü doğrulandı; `attachWorker(scope)` dışa aktarılır. DOĞRULANDI (gerçek tarayıcı Worker'ı ile denenmedi: OLASI).

## Performans (Node 26, bu makine, tek ölçüm)
- 1676x1135 (1,9 M hücre) açık rastgele maliyet: tam A* ~530 ms (1,71 M genişletme); hiyerarşik ~45 ms (119 K genişletme). Test eşikleri yavaş makine payıyla gevşek (tam < 3 s, hiyerarşik < tam/2). Engelli gerçek DTM'de daha yavaş olabilir: OLASI. Yumuşatma süresi ayrıca ölçülmedi.

## Sınırlar
- Yol ızgara-yönlü; yumuşatma görüş hattı kısaltır ama gerçek "any-angle optimal" (Theta*) değildir (bkz. Maliyet ölçüleri).
- Kenar/no_data/out_of_coverage kararları 23A `cost` alanına kodlanmıştır; planlayıcı `status` dizisini okumaz.
- `minScore`, `maxSlopeDeg`, `maxCost` segment boyunca uzunluğu >0 olan hücrelerden hesaplanır.
- Bellek: tam arama ~29 byte/hücre (1,9 M hücre için yaklaşık 55 MB). Hiyerarşikte tamponlar tek kez ayrılır ve geri dönüşte yeniden kullanılır; hesap değeri, tarayıcı ölçümü yok: OLASI.
- Bütçe aşımında kısmi yol döndürülmez; yalnız en iyi sınır hücresi `reason`'da bildirilir.
- `budget`/`options` için `null` artık geçersizdir (önceden sessizce varsayılan); eski çağıranlar `undefined` geçmeli.

## Denetim düzeltmeleri (bağımsız inceleme bulguları)
Test sayısı: 20 -> 31 (hepsi yeşil, `node --test test/pathfinder.test.mjs` ~2,3 s).
1. Yumuşatma metrik etiketi: `gridCost`, `costMetric`, `smoothingGain` eklendi; `reason` karşılaştırılamazlığı açıkça yazar; kabul kuralı korundu. Testler yeni alanları kullanır ve en az bir vakada çizgi maliyetinin ızgaranın altında çıktığını doğrular.
2. `budget`/`options` doğrulaması (örnekler: `budget:5`, `'abc'`, `options:7`, `hierarchical:'yes'`, `coarseFactor:NaN` -> `invalid_input`). Not: `maxMs:0` ve `corridorCells:0` artık geçersiz; eski testler `maxMs:1e-6` ve `corridorCells:1` ile güncellendi.
3. Hiyerarşik kesinti `reason` koordinatı artık doğru ızgara sütun sayısıyla biçimlenir.
4. Genişletmesiz kesintide alt sınır sonlu (başlangıç oktil değeri).
5. `cellSizeM:1e308` -> `invalid_input` (maliyet taşması sahte `no_path` üretmez).
6. Worker yalnız gerçek `WorkerGlobalScope` içinde bağlanır; `attachWorker(scope)` dışa aktarıldı.
7. `planRoute` try/catch ile sarıldı; yeni durum eklenmedi, `invalid_input` + "beklenmeyen hata: …".
8. `field.schema` doğrulaması testle sabitlendi; Float64 `cost` kabulü belgelendi/test edildi.
9. Hiyerarşik -> tam arama geri dönüşünde tamponlar yeniden kullanılıyor.
- Test güçlendirmeleri: totoloji kaldırıldı, koridor geri dönüş testi deterministik ve `hierarchical===false` + `/koridor/` iddia eder, hiyerarşik yolun gerçekten kullanıldığı kanıtlandı, gevşek oranlar ölçülen değerin ~2 katına çekildi, worker "mod truthy" kontrolü gerçek gidiş-dönüşle değiştirildi.

## 23C / 24 için açık maddeler
- Çağrı: `new Worker(new URL('../route/pathfinder.worker.js', import.meta.url), { type: 'module' })`; `postMessage({type:'plan', id, field, start, end, budget, options}, [field.cost.buffer])`. UYARI: `field.cost` daha büyük bir buffer'ın görünümü (view) ise `cost.buffer`'ı transfer etmek çağıranın TÜM buffer'ını (görünümün dışındaki verilerle birlikte) boşaltır ve diğer görünümleri detach eder. Yalnızca `cost` kendi başına ayrılmış buffer'a sahipse transfer et; aksi halde kopya (yapılandırılmış klon) kullan. Alan ana iş parçacığında tekrar gerekiyorsa da transfer yerine kopya. OLASI (Worker içinde ölçülmedi).
- Eski sonuçları yok saymak için `id` artan sayaçla eşleştirilmeli; yeni istek gelince eski cevap atılır.
- İptal: bu sürümde yok (senkron döngü). Öneri: iptal için `worker.terminate()` + yeni Worker; ilerleme için `budget.maxExpansions` ile dilimli çağrı. >1 sn işler için "hesaplanıyor" göstergesi önerilir.
- 'auto' hiyerarşik eşiği (1e6 hücre) gerçek DTM penceresinde 23C ile ayarlanmalı; gerçek veride oran ölçülmeden "yaklaşık" notu UI'da gösterilmeli.
- 23A `cost` Float32Array/Float64Array ve (rows, cols, cellSizeM) üretimi sözleşmeye uymalı; aksi halde `invalid_input` döner (reason ile).
