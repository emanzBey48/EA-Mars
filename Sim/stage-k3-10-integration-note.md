# Stage K3-10 entegrasyon: legacy DTM için planlayıcı ve minimap düzenli yerel ızgarası

Kapsam: legacy PDS3 köprü DTM'i (aktif arazi). Planlayıcı, minimap, ısı haritası ve rota planlama artık `geo/local-grid.js`
ile BİR KEZ üretilen düzenli yerel ızgarayı (1,00966 m, `nearest`) kullanır. 3D mesh, sim ve örnekleyici (şerit, ayak izi,
kılavuz) köprüyü değiştirmeden kullanmaya devam eder. USGS / native yol değişmedi. Commit ve push yapılmadı.

Etiketler: **DOĞRULANDI** = tarayıcıda veya gerçek veriyle ölçüldü. **OLASI** = akıl yürütme.

## 1. Değişiklikler

| Dosya | Ne değişti |
|---|---|
| `public/js/route/legacy-grid-plan.js` (yeni) | Saf: `shouldRegrid(descriptor)` (kimlik `hirise-legacy-jezero-dtm` + `quality.transformControls`), `legacyWindowBoundsM(layer)` (pencere 4 köşesi), `prepareRouteGrid(layer)` (native ise `grid: null`, legacy ise tek `resampleToRegularLocalGrid` çağrısı, `resampleMs`), `buildPlannerWindowInput(grid)` (elevation KOPYASI, coverageMask verilmez). |
| `public/js/view/render.js` | Boyama çekirdeği `paintTerrainCanvas` olarak ortaklaştırıldı; `buildTerrainImage(layer)` davranışı piksel birebir aynı (HEAD ile karşılaştırıldı). Yeni `buildTerrainImageFromGrid(grid)`: yalnız `elevation/validMask` okur, örnekleme yapmaz; gradyan için 3×3 tamamen geçerli değilse düz gölge. |
| `public/js/main.js` | (1) import satırları (15–16); (2) `let routeGrid` (~81); (3) `resolveRouteGrid`, `nativePlannerWindow`, `routeGridDiagnostics` ve `initializeRouteWorker` (~816–866); `init-window` artık `planner` penceresini ve transfer listesini `planner.elevation.buffer` ile verir; (4) DTM yükleyici (~1939–1941): ızgara bir kez üretilir, minimap terrain'i ızgaradan çizilir; (5) `getDiagnostics().routeGrid` (~2167). |
| `test/route-grid-integration.test.mjs` (yeni) | 16 sentetik test (aşağıda). |
| `DEMO_NOTES.md` | Rota özeti ve eğim satırları güncel UI değerlerine çevrildi; planlayıcı ızgarası için yeni satır. Ham 1669×1129 penceresi satırı olduğu gibi kaldı (ham veri, değişmedi). |

Dokunulmayan: `geo/local-grid.js`, `view/minimap/minimap.js`, `view/3d/*`, `surface/*`, `route/route-service.js`,
`route/pathfinder.worker.js`, `simulation/`, `input/`, `scripts/smoke-e2e.mjs`, mevcut testler (sayı güncellemesi gerekmedi).

## 2. Önce / sonra (tarayıcı, `?demo=1`, WB1 → Roubion)

Önce = HEAD (`71db4bb`) kopyası, aynı harness; sonra = bu çalışma ağacı.

| Tercih | Önce: uzunluk / en dik eğim / ΔZ | Sonra: uzunluk / en dik eğim / ΔZ |
|---|---|---|
| En kısa | 730 m / 14,1° / +6,2 / −23,4 | **730 m / 11,7°** / +4,9 / −23,9 |
| Dengeli (demo varsayılanı) | 730 m / 9,8° / +6,1 / −23,3 | 730 m / 9,8° / +4,7 / −23,7 |
| En düz | 731 m / 10,1° / +6,4 / −23,6 | **730 m / 9,5°** / +5,1 / −24,1 |
| Net ΔZ (üç tercih) | −17,2 m | **−19,0 m** |

DOĞRULANDI: Net ΔZ değişimi, örnekleyicinin iki uç noktası arasındaki farkla (WB1 −2569,435 m; Roubion −2588,449 m;
fark −19,01 m) uyuşuyor. Önceki −17,2 m, ~1,8 m'lik bir tutarsızlık demektir; bu fark eski çerçevede uç noktaların 18 ve 22 hücre kaymasıyla tutarlıdır (ölçüm DOĞRULANDI; nedensel bağ OLASI). Yeni değerler
`local-grid-evidence.mjs` ile aynı (nearest: 729,66 / 730,50 m; 11,69 / 9,77 / 9,54°).

Planlayıcı hücresi = örnekleyici hücresi (DOĞRULANDI, gerçek veri, Node probe): WB1 → planlayıcı (500, 518), değer
−2569,4345 m = örnekleyici; Roubion → (1168, 650), −2588,4487 m = örnekleyici. Eski çerçevede 18 ve 22 hücre kayıktı.

## 3. Süre ve bellek

- Yeniden örnekleme: **96–103 ms** (tarayıcı, `routeGrid.resampleMs`); 83 ms (Node probe). Tek seferlik, DTM yüklenince.
- Demo planın hazır olma süresi: 3,0 s (yeni) / 3,4 s (HEAD); fark gürültü düzeyinde. Terrain mesh CPU süresi 165–173 ms (yeni) /
  204 ms (HEAD), 3D mesh hücre sayısı değişmedi (1 884 301).
- Kalıcı ek bellek: `routeGrid.grid` (elevation 7,8 MB + validMask 2 MB) ana iş parçacığında tutuluyor; minimap tuvali 1170×1670
  (7,8 MB) eski 1129×1669 (7,5 MB) yerine geçiyor. Net ≈ +10 MB. (OLASI: planlayıcı başlatıldıktan sonra `grid.elevation`
  serbest bırakılabilir; bu adım kapsam dışında bırakıldı.)

## 4. Testler ve smoke

- Yeni `test/route-grid-integration.test.mjs`: **16/16 yeşil**. Kapsam: (a) legacy bayrağı ve sınırlar, registry kimlik metni;
  (b) hücre merkezi değerleri örnekleyiciyle birebir, planlayıcı noktası → değer eşleşmesi, eski çerçevenin ayırt edici olduğu;
  (c) no-data = `noDataValue` (0 değil), planlayıcıda NO_DATA, komşuluk EDGE_UNKNOWN; (d) native yolda ızgara yok, sampler çağrısı 0;
  legacy'de tek üretim ve süre; (e) `createDemWindow` kabul eder, `structuredClone` ile klonlanır, grid bozulmaz;
  (f) görüntü: legacy katmanla piksel birebir, planlayıcı çerçevesiyle aynı nwXM/nwYM, no-data eflatun, sampler çağrısı yok.
- `node --test test/`: **698/698, çıkış kodu 0** (başlangıç 682 + yeni 16).
- `npm run smoke`: **38/38**, çıkış kodu 0. 6a'daki `hücre=1884301` 3D mesh sayısıdır (ham pencere), değişmedi; smoke bu sayıyı
  doğrulamaz. 4d–4f no-data enjeksiyonu sampler'a yapılır, planlayıcı kopyası bunu görmez; smoke yine geçti.
  Smoke sonrası takipli `test-output` PNG'leri `git checkout` ile geri alındı, yeni PNG'ler silindi.
- Konsolda yalnız `favicon.ico` 404 (HEAD'de de var).

## 5. Tarayıcı gözlemi (başsız Edge, DOĞRULANDI)

- `routeGrid`: `legacy-bridge-regridded`, `nearest`, 1670×1170, `cellSizeM` 1,0096633, `nwXM` −523,84, `nwYM` 505,80.
- `rendererError: null`; 3D aktif; FPS 59,4 (HEAD 59,7; headless, GPU değil); `frameRenderMs` medyan 0,9 ms (aynı).
- 3D genel görünüm ve yakın alan: rota şeridi zemine oturuyor, havada asılı parça görünmüyor (gözle).
- Minimap (panel, heatmap açık): rota, ısı haritası bandı ve terrain aynı çerçevede; "Bitiş" işaretçisi ve rota bandı
  hizalı. HUD minimap (başlangıçta, 3D): beyaz rota çizgisi ısı haritası bandının ortasında.
- Ekran görüntüleri (scratch): `...\scratchpad\k3-10-integration\k3-10-shot1-3d-overview.png`,
  `...\k3-10-shot3-3d-closeup.png`, `...\k3-10-shot2-minimap-panel.png`, `...\k3-10-shot2b-hud-minimap.png`.
- Gözlem sınırı: piksel-düzeyinde hizalama ölçümü yapılmadı; hizalama gözle değerlendirildi.

## 6. Riskler

1. **3D mesh ↔ düzenli ızgara:** 3D mesh köprü dörtgenlerini kullanır (`terrain-mesh.js`, değişmedi). Hücre merkezlerinde
   değerler birebir aynıdır; merkez dışında fark, yarım hücre × eğim mertebesindedir (K3-10 evidence §7.1, OLASI küçük sapma).
2. **Kalıcı bellek +~10 MB** (§3).
3. **Yedek mod** (`legacy-bridge-native-fallback`): ızgara üretilemezse uyarı `viewStatus` içinde gösterilir ve eski
   (kaymış) çerçeve kullanılır. Sessiz değildir ama kaymayı düzeltmez.
4. **Kapsam etiketi:** `coverage.localBoundsM` hâlâ legacy düzleminde (K3-10 §8.8). Bu çalışmada değiştirilmedi.
5. **Etiket:** planlayıcıda kaynak kapsamı dışındaki kenar hücreleri ve kaynak no-data'sı aynı NO_DATA etiketini alır
   (coverageMask bilerek verilmedi).
6. **Karar bağımlılığı (K3-7):** USGS etkinleşirse `prepareRouteGrid` native döner ve eski yol çalışır; bu kod gereksiz kalır.

## 7. Alparslan için notlar

- `main.js` değişen yerler yukarıdaki tablo; `initializeRouteWorker` içinde `values` değişkeni kaldırıldı, transfer listesi
  `planner.elevation.buffer`.
- `render.js`: `buildTerrainImage` içi `paintTerrainCanvas` çağrısına taşındı (çıktı birebir aynı, HEAD ile doğrulandı).
- `minimap.js` değişmedi; `selectionRejection` yeni ızgarayla uyumlu (heatmap `nwXM/nwYM/cellSizeM/rows/cols/status`
  aynı çerçeveden gelir, terrain piksel maskesi aynı renk kuralını kullanır).
- `local-grid.js`: hata bulunmadı; değişmedi.

## 8. Çalıştırılmayanlar ve sınırlar

- Commit ve push yapılmadı (talimat gereği). Çalışma ağacında başka ajanların yarım dosyalarına dokunulmadı.
- USGS yolu tarayıcıda çalıştırılmadı (K3-7 kararı bekliyor); yalnız birim testiyle (d) kapsandı.
- Yedek mod (fallback) tarayıcıda tetiklenmedi.
- Piksel-düzeyinde minimap hizası ölçülmedi; gözlem gözle yapıldı.
