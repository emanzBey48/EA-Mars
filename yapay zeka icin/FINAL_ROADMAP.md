# Marswalk — FİNAL AŞAMALI YOL HARİTASI (Küre → Seçim → Rota → Kask İçi 1. Şahıs)

**Tarih:** 15 Kasım 2026 · **Dal/çalışma ağacı:** `codex/efe-visual-realism`, `C:\Users\efese\Desktop\Nasaspaceapps-efe` · **Durum:** yalnız analiz ve plan; uygulama kodu, veri ve test değiştirilmedi/çalıştırılmadı.
**Kural:** Bu belgedeki her "mevcut durum" ifadesi kaynak koddan okunarak doğrulandı (`dosya:satır`). Okunamayan/ölçülemeyen her şey **"doğrulanmadı"** diye yazıldı. Eski notlar (`road map.md`, `README.md`, `DEMO_NOTES.md`) yalnız kaynak kodla çelişmediği yerde kullanıldı.
**Etiketler** (DEMO_NOTES ile uyumlu, bir tane eklendi): **ÖLÇÜM** · **HESAP** · **SENARYO** (kaynaksız seçilmiş parametre) · **SUNUM** (yalnız görsel) · **MODEL** (yeni: fiziksel bir modelden/yaklaşımdan türetilmiş, ölçüm değil).

---

## A. Yönetici özeti ve boşluk tablosu

**Özet.**
1. Bugünkü ürün tek bir sahada (Jezero, 1129×1669 hücrelik ≈1,14×1,69 km HiRISE penceresi) çalışan, minimap'ten başlangıç/bitiş seçtiren ve A\* rotasıyla 1. şahıs yürüyüşü sunan bir demodur. Küre, bölge türü, hedef süre, çok kişi, otomatik sürüş, kask, görüş modları **yoktur** (ilgili kaynak taramaları: bkz. tablo).
2. En büyük **veri** boşluğu: repoda yalnız Jezero'ya ait yerel DEM (1 m), 3°×3° MOLA penceresi ve 40 poligonluk jeoloji alt kümesi var; **küresel kot, küresel jeoloji/landform sınıfı, kum tepesi/kutup/delta katmanı, termal/radyasyon/kimya verisi yok**. Küre dokusu için Viking MDIM z0–z3 karo piramidi (4096×2048, 22,9 MB) mevcut ve kullanılabilir.
3. En büyük **mimari** boşluk: `sim.js` rotayı tek bir düz doğru parçası (a→b) olarak tutar (`sim.js:100-111`, `:337-350`); A\* yolu yalnız kılavuzdur (`main.js:297`). Otomatik sürüş, çok bacaklı rota, hedef süre ve koridor/ilerleme ölçümleri bu yüzden önce **çok noktalı rota (polyline) sözleşmesi** ister.
4. Dürüstlük stratejisi: yerel EVA yürünebilirlik puanı yalnız ≤2 m DEM'de (`route-service.js:24-29`); küre/bölge etiketleri **bağlam + senaryo ağırlığı**; küresel kot **ancak bağlam/hover** içindir. Bu nedenle ürün "küre üstünden **saha** seçimi + saha içinde nokta seçimi" iki kademeli tasarlanır; DEM'i olmayan yerde sessiz sahte arazi üretilmez.
5. Hız modeli: mevcut 1,2 m/s senaryo hızı Mars Froude oranıyla **Fr=0,431** (yürüyüş-koşu eşiği 0,5'e yakın); Froude benzerliğiyle ortalama insan yürüyüş hızından türetilen Mars hızı **≈0,82 m/s** (aralık 0,70–0,91). Süre tahmini bu SENARYO/MODEL hızıyla, bilimsel örnekleme süresi katılmadan hesaplanır.
6. 14 aşama (F0–F13), iki şerit: **Alparslan** (`simulation/`, `route/`, `config.js`, `main.js`, `surface/`) ve **Efe** (`view/`, `geo/`, `scripts/`, veri paketleri). Ortak dosyalar (`index.html`, `styles.css`, `minimap.js` uzantı noktaları, `main.js`) yalnız F0/F8'de tek sahipli pencerelerle değişir. Tahmini toplam ≈ 26 kişi-günü (iki kişiyle ≈ 13–15 takvim günü; ölçülmedi, tahmindir).
7. Teslim bağlamı: `road map.md` (K6) teslim saatini 15 Kasım 23:59 olarak, kod dondurmayı 18:00 olarak yazar ve `demo-freeze` etiketi **yoktur** (K1-5 açık). Bu yol haritası mevcut teslim sürümünü **bozmadan**, ayrı dalda ilerlemek üzere yazıldı; teslim ile ilişkisi doğrulanmadı.

### A.1 Mevcut durum ↔ hedef boşluk tablosu (14 madde)

| # | İstek | Mevcut durum (kaynaktan doğrulandı) | Eksik | Risk |
|---|---|---|---|---|
| 1 | Küre giriş ekranı, fareyle döner, başlangıç/varış küreden seçilir | Küre **yok**. Giriş akışı = `#mission-setup-overlay` içinde Jezero minimap (`index.html:280-313`, `main.js:379-399` `openMissionSetup`). Küresel bağlam yalnız "Mars globali göster" ile düz Viking haritası (`index.html:149`, `main.js:548-612`). Viking karo piramidi z0–z3 yazılı, z4 yazılmadı (`data/viking-mdim/manifest.json` `levels[].written`). | WebGL2 küre, sürükle-döndür, ray-sphere seçim, doku birleştirme, nokta pinleri, 2D fallback | Orta: ikinci WebGL bağlamı; kutuplarda doku gerilmesi; Viking lisansı "belirtilmemiş" (K1-4) |
| 2 | Rotada hiçbir konumun eğimi dengeyi bozacak kadar yüksek olmamalı | Sert sınır `maxSlopeDeg=20°`, konfor `8°` (SENARYO, "birincil belge doğrulanmadı") `cost-model.js:39-40`; üç tercihte aynı sert sınır `route-compare.js:27,34`; `impassableCrossings` ve `maxSlopeDeg` istatistikleri var `route-service.js:434-437`. Rota boyunca bağımsız yoğun örnekleme doğrulaması **yok**. | Ayarlanabilir sınır (öneri 15°), yol üstü doğrulama (0,5 m), "sınır içinde rota yok" durumu | Orta: 3×3 Horn ~3 m taban çizgisi eğimi olduğundan olduğundan düşük gösterebilir |
| 3 | Küre görünümünde sağda panel; "Simüle et" ile kalkar; bilimsel ilgi bölge türleri; seçilen türler rotanın İÇİNDEN geçer | Sağ kenar çubuğu var (`index.html:134` `<aside id="panel">`) ama bölge türü yok; 1. şahıse geçerken panel kapanır (`main.js:1402-1404` `panel-collapsed`); "3D Simülasyona Başla" düğmesi var (`index.html:299`). Rota üretimi yalnız uç noktalar + tercih (`dengeli/en kısa/en düz`). | Tür listesi + yerel tür kapsamı (saha başına), via-planlayıcı, panel bileşeni | Yüksek: türün seçilen sahada bulunmaması (veri) ve "içinden geçme"nin tanımı |
| 4 | Jeolojik/topografik bilgi sisteme kayıtlı; fare altı bölge özelliği hafif yazı | Yalnız **Jezero**: `geo/geology-registry.js:47,146` + 40 poligon (`data/usgs-sim3464-geology/jezero_geounits_jezero_subset.geojson`: Njf 2, Aeb 8, Nue 13, Nle 4, NHjf2 12, cr 1) ve 384×384 MOLA penceresi (`data/regional-dem/mola-jezero.json`: 75,949–78,949°D, 16,939–19,939°K, −3777…+199 m, `needs_review`). Hover **yok** (minimap'te yalnız tıklama açıklaması `main.js:885`). | Küresel kot, küresel jeoloji sınıfı, adlandırılmış özellik (gazetteer), kum tepesi/kutup katmanı, bölge arama indeksi | Yüksek: indirme+lisans teyidi (SOURCES kuralı: lisans yazmıyorsa "belirtilmemiş") |
| 5 | Coğrafi özellikler güvenlilik düzeyine etki etmeli | Maliyet yalnız eğim+pürüzlülük (`cost-model.js:9-19`); jeoloji bilinçli olarak maliyete katılmıyor (`road map.md` "Jeolojinin maliyete etkisi" maddesi) | Bölge türü → bağlam ağırlığı tablosu, güvenlik bileşimi, UI'de ayrı gösterim | Orta: ağırlıklar kaynaksız — SENARYO etiketi şart |
| 6 | İstenen varış süresi (güvenlikten öncelikli), kask uyarısı | Süre = uzunluk/hız, yalnız çıktı (`route-service.js:440-444`). İstenen süre girdisi **yok**. Uyarı yalnız koridor sapma şeridi `hud.js:188-191` (düz segmente göre) ve eğim uyarısı `hud.js:212`. Kask yok. | Süre-uyum algoritması (uzatma/kısaltma/imkânsız), güvenlik düzeyi, kask uyarısı | Yüksek: "güvenli rota" dili riski; fizibil olmayan süre |
| 7 | Kişi sayısı; ayrı/beraber; dengeli bölüştürme; takip edilecek kişi | Tek `MarswalkSim` (`main.js:73`). Çok kişi **yok**. | Çok kişili bölüştürme, kişi seçici, yalnız takip edileni simüle/çizme | Orta |
| 8 | "Simüle et" → rota bölgesine zoom → astronot gözüne geçiş | Doğrudan `selectView('3d')` (`main.js:1347-1421`); geçiş animasyonu yok. Renderer yörünge (orbit) kamerayı destekler (`camera.js:92,287-312`, `renderer.js:1087 camera.mode`) fakat `main.js` yalnız 1. şahıs kamerası kullanır (`createCamera` kullanımı yok). | Sahneler arası durum makinesi, küre→bölge→rota→1. şahıs kamera yolu | Orta |
| 9 | Tahmini varış süresi (örnekleme süresi YOK), Mars g + insan yürüyüş hızı; hız ölçekleme | `SCENARIO.walkSpeedMps=1.2` SENARYO (`config.js:5`), `marsGravityMps2=3.71` NASA Planet Compare (`config.js:7`, SOURCES #10; NSSDC 3,73). Froude yardımcıları yalnız görünüm katmanında (`astronaut-rig.js:238-249` `froudeNumber`, `walkRunTransitionSpeedMps`, `WALK_RUN_FROUDE=0.5`, L=0,9 m "kaynak doğrulanmadı"). | Simülasyon katmanında kaynaklı/etiketli hız modeli, eğim çarpanı | Orta: model kaynak teyidi yok (aşağıda C.5) |
| 10 | Astronot gözü: kask (vizör çerçevesi, yansıma, buğu, iç çerçeve) | Kask **yok**. Kamera 1,48 m göz, 80° FOV (`camera.js:9-10`); rig'de vizör parçası dünya görünümü içindir (`renderer.js:292`); 1. şahıs yalnız eller/kollar. | CSS/SVG/Canvas kask katmanı | Düşük–orta |
| 11 | Sol üst köşede yarı saydam holografik 2D minimap | HUD minimap **sol alt**, opak koyu panel (`styles.css:525-537`, `index.html:121-131`), `createMinimap({compactHud:true})` (`main.js:205-212`). | Konum/stil taşıma, holografik stil | Düşük |
| 12 | Sağ altta hız ayarı (yalnız otomatik sürüş açıkken), 0,5×–10×, durdur; otomatik sürüş tuşu; yeniden rota / 20 m kuralı | Otomatik sürüş **yok** (kaynakta `autopilot`/`autoDrive` eşleşmesi yok). Zaman ölçeği ×8 sabit (`config.js:15`); havada `airborneTimeScale=2` (`config.js:17`); `resolveAirborneTimeScale` `[1,timeScale]` dışını **fırlatır** (`sim.js:14-21`); kare başına dt üst sınırı 0,1 sn (`sim.js:122,156`). Tuşlar: WASD/oklar, Space, P, R, +/− (`input.js:4-9,45-53`). | Otomatik sürüş denetleyicisi, polyline takibi, zaman çarpanı, alt-adımlama, yeniden rota | Yüksek: çarpan×8 ile adım atlama |
| 13 | Görüş modları (9), yalnız biri, ısı haritası/kontur | Mod sistemi **yok**. Minimap'te yalnız EVA yürünebilirlik ısı katmanı (`minimap.js:199-215,452-460`). **Kontur çizimi yok.** Gerçek termal/radyasyon/kimya/spektral/jeofizik verisi **yok** (kaynak taraması: THEMIS/TES/CRISM/RAD/GRS/MCD eşleşmesi yalnız `stage26a-trek-catalog-audit.md:20` "THEMIS ±65°" 'OLASI'). | Mod kaydı, ısı + kontur çizicileri, modellenmiş katmanlar, veri adaptörleri | Yüksek: dürüst etiketleme |
| 14 | Görsel kalite, sade arayüz, kayıt için sunum modu, atıf | Sunum modu var ama jüri telemetri kapsülüdür (`index.html:25-76`, `main.js:214-226`, `styles.css:297-376`); `?quality=` yönetici (`main.js:1976-1982`); gökyüzü/gölge/ufuk/kaya/toz mevcut (`README.md:59-65`, K2-5). Temiz kayıt modu ve sinematik kamera **yok**. | `?record=1`, sinematik kamera, çekim listesi, atıf paneli | Düşük–orta |

> **Küçük hata (doğrulandı):** `main.js:2032` `SCENARIO.goalRadiusM` kullanır; `config.js:26`'da yalnız `arrivalRadiusM` var → HUD minimap "Hedef ✓" hiç görünmez. F0'da düzeltilir.

---

## B. Mimari kararlar

### B.1 Yeni modüller ve dosya sahipliği

Prensip (AGENTS.md ile uyumlu): `main.js` yalnız **kurulum + parametre enjeksiyonu + çerçeve döngüsü**; yeni mantık yeni modüllere gider. `main.js` zaten ≈2150 satır (`main.js:1-2144`); **en fazla** F0'da (genişletme noktaları), F7'de (autopilot bağlama) ve F8'de (durum makinesi bağlama) toplam ≈ 150–200 satır eklenir, sonra gövde `app/` altına bölünür (F0 hedefi: ilk bölme).

| Klasör | Yeni dosya (öneri) | Sahip | Sözleşme / not |
|---|---|---|---|
| `public/js/app/` | `scene-machine.js`, `mission-request.js`, `app-bootstrap.js` | Alparslan | Saf durum makinesi + istek şeması; DOM'a dokunmaz (DOM köprüsü `app-bootstrap.js`). |
| `public/js/geo/` | `region-catalog.js`, `region-lookup.js`, `morphometry.js`, `gazetteer.js`, `site-coverage.js` | Efe | Saf; no-data → "bilinmiyor", sıfır değil. |
| `public/js/surface/` | `site-registry.js` (çok-saha) | Alparslan | `createDefaultSurfaceRegistry` (`registry.js:776`) tek `expectedFrame` alır; site başına adaptör/çerçeve parametreleştirilir. |
| `public/js/route/` | `slope-cap.js`, `via-planner.js`, `safety-index.js`, `time-fit.js`, `multi-agent.js`, `rejoin.js` | Alparslan | Worker'da koşar (`pathfinder.worker.js` ile aynı kalıp); `planWalkingRoute` (`route-service.js:321`) sarmalanır, değiştirilmez. |
| `public/js/simulation/` | `route-follower.js`, `autopilot.js`, `gait-speed.js`; `sim.js` küçük uzantı (zaman çarpanı, polyline `setRoutePath`) | Alparslan | Saf/DOM'suz. Snapshot'a `autopilot`, `safety`, `person` alanları eklenir. |
| `public/js/view/globe/` | `globe-renderer.js`, `globe-picking.js` (saf), `globe-texture.js`, `globe-panel.js`, `globe-hover.js`, `fly-path.js` (saf) | Efe | Kendi `<canvas>`/GL bağlamı; `renderer.js`'e dokunmaz. |
| `public/js/view/helmet/` | `helmet-overlay.js`, `helmet-warning.js`, `autodrive-controls.js` | Efe | DOM/CSS/Canvas katmanı; WebGL pass eklemez. |
| `public/js/view/layers/` | `mode-registry.js`, `heat-layer.js`, `contour.js` (saf, marching squares), `layer-sources/*.js` | Efe | Minimap'e **eklenti çizicileri** olarak bağlanır (F0 uzantı noktası). |
| `public/css/` | `globe.css`, `helmet.css`, `modes.css` | Efe | `styles.css` yerine ayrı dosyalar (çakışma yok); `<link>` F0'da bir kez eklenir. |
| `data/mars-global/`, `data/sites/<id>/` | veri paketleri + `manifest.json` | Efe (üretim), Alparslan (kayıt) | Şemalar B.4. |
| `scripts/` | `build-region-catalog.mjs`, `fetch-mola-global.mjs`, `build-site-package.mjs`, `build-type-coverage.mjs` (Efe); `validate-slope-cap.mjs`, `validate-time-fit.mjs` (Alparslan) | — | Mevcut kalıp: `scripts/fetch-regional-dem.mjs`, `ingest-viking-mosaic.mjs`. |

**Dokunulmaz sözleşmeler:** 3D render pass sırası (0 arazi, 1 işaretçi/rota kılavuzu, 2 astronot rig'i, 3 gökyüzü, 4 gölge derinliği, 5 ayak izi, 6 rota şeridi, 7 bölgesel ufuk — `README.md:90`, `renderer.js:1323,1349,1461`); yeni pass gerekirse **8+** ve yalnız Alparslan. HiRISE fallback ve 2D Canvas yolu korunur. `renderer.js`, `camera.js` yalnız Alparslan'ın onaylı küçük uzantılarıyla değişir; Efe bu dosyalara dokunmaz.

### B.2 Küre teknolojisi kararı

- **Seçim:** **Yeni, bağımsız WebGL2 küre görüntüleyici** (`view/globe/`), kendi canvas ve bağlamıyla. Mevcut `renderer.js` (≈91 KB) araziye özel olduğundan genişletilmez; mevcut render pass sözleşmesi bozulmaz.
- **Gerekçe:** küre için UV-küre, tek doku, tek hafif gölgelendirici, ışınla seçim yeterli; mevcut kodla paylaşılan tek şey doku kaynağıdır.
- **Doku kaynağı (repoda VAR):** Viking MDIM 2.1 renkli küresel mozaik, z0–z3 karo piramidi: 2/8/32/128 karo, z3 = 16×8 karo × 256 px = **4096×2048** (5,21 km/px); toplam PNG 22,9 MB (z3 15,5 MB) (`data/viking-mdim/manifest.json`). Kaynak 232 m/px; z4 üretilmedi (`written:false`, bütçe nedeniyle). Yükleme: önce z2 (2048×1024, 4,1 MB), ardından z3 ilerlemeli; `OffscreenCanvas` ile birleştirme, mipmap + anisotropy.
  - Sınır: Viking **renkli işlenmiş mozaik**dir; yükseklik veya ortogörüntü değildir; lisans "belirtilmemiş" (K1-4). Kürede "Viking MDIM 2.1 renkli mozaik" yazar, "gerçek renk" denmez. Işıklandırma (gece/gündüz sınırı) SUNUM'dur; yön `geo/mars-sun.js` `marsSunDirection` ile (senaryo Lₛ 0°, LTST 15:00) verilebilir ve etiketlenir.
  - Opsiyonel zenginleştirme: MOLA gölgelendirilmiş kabartma (Trek WMTS, görsel) ile karıştırma — **indirme gerektirir** (E bölümü).
- **Etkileşim:** sürükle = trackball (quaternion) + sönümlü atalet; tekerlek = yakınlaş (1,3R–6R); çift tık = odaklan; klavye oklar; dokunmatik (pinch) opsiyonel. Seçim = CPU ışın–küre kesişimi → enlem/boylam (planetosentrik, R = 3396,19 km, Viking ile aynı; `config.js:50` `radiusKm`).
- **Fallback:** WebGL2 yoksa 2D eşdikdörtgen seçici (mevcut minimap `fitGlobal`, `minimap.js:160`), aynı panel ve aynı veri.
- **Bağlam bütçesi:** en çok 2 canlı WebGL bağlamı (küre + arazi). Arazi 1. şahıs sahnesine geçilince küre bağlamı `dispose()` edilir (VRAM), geri dönüşte yeniden kurulur.

### B.3 Sahneler arası durum makinesi (`app/scene-machine.js`, saf)

```
BOOT ──ready──▶ GLOBE ──siteClicked/pinsValid──▶ GLOBE(pins)
GLOBE(pins) ──btnRefine──▶ SITE_REFINE (mevcut mission-setup overlay, yalnız seçili saha)
GLOBE(pins)|SITE_REFINE ──btnSimulate [guard: missionRequest geçerli]──▶ PLANNING
PLANNING ──planOk──▶ TRANSITION_ZOOM      PLANNING ──planFail──▶ GLOBE(pins)+hata
TRANSITION_ZOOM (küre→saha→rota sınır kutusu, yörünge kamera, ~4–6 sn)
TRANSITION_ZOOM ──zoomDone──▶ FIRST_PERSON (panel gizli, kask açık)
FIRST_PERSON ──arrived──▶ ARRIVED ──btnBack/R──▶ GLOBE   (FIRST_PERSON ──Esc/btnMenu──▶ PAUSED_MENU)
herhangi ──webgl2Failure──▶ 2D_FALLBACK (küre: 2D seçici; arazi: mevcut 2D Canvas)
```
Kurallar: her geçiş **olay + koruyucu (guard)** tablosu; `FIRST_PERSON` dışında sim durur; geçişte `viewRequestId` yarışı (`main.js:1348`) için sürüm numarası kullanılır; geri dönüşte `restart` + ayak izi temizliği (`main.js:1469`). Mevcut `?demo=1`/`?view=3d` URL yolları `FIRST_PERSON`'a **doğrudan kısayol** olarak korunur (geriye dönük uyum, smoke testi aynı kalır).

### B.4 Yeni veri sözleşmeleri (taslak; JSON, şema sürümlü)

1. **`marswalk.mission-request.v1`** — `{ siteId, start:{latDeg,lonDeg}, end:{latDeg,lonDeg}, regionTypeIds:[...], desiredArrivalS:number|null, emergencyTimePriority:true, party:{count:1..N, mode:'together'|'split'}, preference:'balanced'|'shortest'|'gentle', followedPersonId }`.
2. **`marswalk.site.v1`** (saha manifesti) — `{ id, name, footprintLonLat:[w,s,e,n], dem:{file,cellSizeM,rows,cols,frame,noData,verticalDatumStatus}, resolutionClass('eva_walkability' ≤2 m), ortho?:{...}, geology?:{sourceMapId,...}, typeCoverage:{<typeId>:{areaM2,patches:[{id,polygonLonLat,centroid}]}}, attribution, license, needsReview[] }`.
3. **`marswalk.region-catalog.v1`** — tür tanımları + `contextWeight`(SENARYO) + kaynak/etiket (C.6 tablosu).
4. **`marswalk.route-plan.v2`** — `{ legs:[...], polyline:[{xM,yM,zM,slopeDeg,score,typeId}], perPerson:[{id,polyline,etaS}], stats:{lengthM,etaS,etaAssumption,maxSlopeDeg,p95SlopeDeg}, timeFit:{requestedS,achievedS,mode:'lengthened'|'shortened'|'unchanged'|'infeasible',priority:'time',notes[]}, safety:{level:'ok'|'caution'|'alert',indexMin,indexP10,indexMean,reasons[],caveat}, provenance }`. `safety.caveat` **her zaman** "Planlama göstergesi — güvenli rota sertifikası değildir".
5. **Snapshot eklemeleri** (F0'da donmuş sözleşme): `snapshot.person{id,label}`, `snapshot.autopilot{active,mode:'follow'|'rejoin'|'replan',speedMultiplier,distToRouteM,rejoinTarget}`, `snapshot.safety{level,reasons[],lookaheadWarning}`, `snapshot.route.polyline`, `snapshot.mode{id,label,realness}`. Mevcut `WorldSnapshot` alanları (`sim.js:404-466`) değişmez.
6. **`marswalk.layer-mode.v1`** — `{ id, labelTR, realness:'MEASURED'|'DERIVED'|'MODEL'|'UNAVAILABLE', source, product, nativeCellSize, unit, render:'heat'|'contour'|'rgb'|'none', legend, caveatTR }`.

---

## C. Rota ve model tasarımı

### C.1 Eğim eşiği (madde 2)

- **Öneri (SENARYO, kaynaksız):** `walkSlopeCapDeg = 15°` (normal), `emergencySlopeCapDeg = 20°` (yalnız "süre öncelikli" durumda), konfor platosu `comfortableSlopeDeg = 8°` (mevcut, `cost-model.js:40`). Parametreler `config.js` `SCENARIO`'ya eklenir (F0), etiket "senaryo parametresi; NASA eşiği değildir".
- **Gerekçe (dürüst):** (i) mevcut 20° sert sınır ikincil kaynaklı bir planlama değeridir, birincil belge doğrulanmadı (`cost-model.js:39`); (ii) Apollo 12 anlatımında 10° eğimde sınırlı süre yürünebildiği bildirildi — ikincil, "ipucu" (`stage23a-cost-model-audit.md:11`); (iii) A\* hücre merkezlerindeki 3×3 Horn eğimiyle (`geo.js:172`) çalışır, ~1 m DTM'de ≈3 m taban çizgisidir; adım ölçeğinde yerel eğimi düşük gösterebilir (`README.md` "Bilinen sınırlar" Horn notu; `road map.md` çözünürlük dürüstlüğü) → 20°'nin altında **güvenlik payı** bırakmak için 15°. (iv) Rover limitleri (LRV 22–25° sürüş) insan sınırı olarak **kullanılmaz** (`stage23a-cost-model-audit.md:12`). Mevcut Jezero WB1→Roubion rotalarının en dik eğimi 9,5–11,7° (`DEMO_NOTES.md` §1) → 15° mevcut demoyu etkilemez.
- **Uygulama:** `route/slope-cap.js` `costParams.maxSlopeDeg`'i iki kademe olarak besler (`route-compare.js` ön ayarları `maxSlopeDeg` değerini sabit tutuyor, `:34`; yeni ön ayar türevi eklenir, `route-compare.js` ana dosyası değişmeden sarmalanır). **Garanti kontrolü:** üretilen yol 0,5 m'de yeniden örneklenir; her örnekte kot bilinir ve eğim ≤ sınır olmalıdır, aksi durumda rota "ok" sayılmaz. Hücre merkezleri arası kesişimlerde `impassableCrossings === 0` zorunlu (`route-service.js:435`).
- **Uçlar arasında ≤ sınır rota yoksa:** durum `slope_cap_unreachable` — kullanıcıya "bu uçlar arasında ≤15° rota yok; en yakın erişilebilir hedef/ekle: ..." mesajı; yalnız acil durum açıksa 20° ile yeniden denenir ve güvenlik düzeyi en az `caution`.

### C.2 Bölge türü zorunlu geçiş (madde 3)

1. **Tür → yama (patch):** saha manifestindeki `typeCoverage.patches` (F2). Yama = bitişik hücre kümesi ≥ `minPatchAreaM2` (SENARYO, öneri 2000 m²) ve **tüm hücreleri `eva_walkability` geçilebilir**.
2. **"İçinden geçme" tanımı:** yol, yamanın içinde ≥ `minInsideLengthM` (SENARYO, öneri 20 m) boyunca kalmalı; yama sınırına teğet geçiş sayılmaz. Rota sonunda her tür için `insideLengthM` raporlanır (doğrulama).
3. **Via noktası seçimi:** başlangıçtan ve bitişten iki **tüm-ızgara Dijkstra** maliyet alanı hesaplanır (`route/via-planner.js`, worker, mevcut `pf.cost` dizisi `route-service.js:369-370` üzerinde). Her yama için `min_p (Cs[p] + Ce[p])` ve yama içi iç mesafe şartıyla en ucuz giriş-çıkış çifti seçilir (tam optimum, sezgisel değil).
4. **Sıralama:** K ≤ 6 tür için tüm permütasyonlar (≤720) toplam maliyetle sıralanır; K > 6 ise en yakın komşu + 2-opt. Her bacak `planWalkingRoute` ile gerçek rotaya çevrilir ve birleştirilir (`legs[]`).
5. **Bulunmayan tür:** panelde sönük + gerekçe ("bu sahada yok" / "yama geçilemez"); istek yine de gelirse `type_unavailable` ve rota o tür olmadan üretilir, açıkça yazılır (sessiz düşürme yok).
6. **Maliyete etki (isteğe bağlı, varsayılan açık):** `cost' = cost / w_type` (w: C.6) — "senaryo ağırlığı" etiketli; kapatılabilir (`useContextWeightsInCost`).

### C.3 Hedef süreye göre uzatma/kısaltma (madde 6) — SÜRE GÜVENLİKTEN ÖNCELİKLİ

Girdi `T_req` (sim saniyesi, bilimsel örnekleme süresi **hariç**). Hesaplanan referanslar: `T_via` (seçilen türlerden geçen tercih rotası), `T_min` (acil gevşetmeli en kısa), `T_max` (en düşük eğim + isteğe bağlı yan yol).

- **T_req ≥ T_via → UZATMA (güvenli yönde):** (a) λ taraması: maliyet eğrisi parametrelerini `shortest → balanced → gentle`'e kaydır (daha düz, daha uzun; `route-compare.js:34-45`); (b) hâlâ kısaysa **yan yol (detour) ekleme:** ilgi puanı sırasıyla ek tür/yama via'ları, "en ucuz ekleme" kuralıyla `Δt ≤ kalan fark` olana kadar; (c) kalan fark `±%5`'ten büyükse sonuç `unchanged_below_request` — "rota daha fazla uzatılamıyor; kalan süre için bekleme/örnekleme eklenmedi" (süreyi sahte doldurma yok).
- **T_req < T_via → KISALTMA (güvenlik pahasına):** sırasıyla (1) seçilmemiş ek yan yolları kaldır; (2) `shortest` ön ayarı; (3) **acil gevşetme:** `walkSlopeCap 15° → 20°`, konfor platosu 14°; (4) **acil tempo:** hız yürüyüş-koşu geçiş hızına kadar (`v_wr = √(0,5·g·L) = 1,292 m/s`, L=0,9 m varsayım; MODEL) çıkarılır; (5) hâlâ yetmezse en düşük öncelikli tür çıkarılır **ve bildirilir** ("süre nedeniyle X türü rotadan çıkarıldı"); (6) yine yetmezse `infeasible`: ulaşılabilir en kısa ETA ve boşluk gösterilir, rota yine de en hızlı koşulla üretilir.
- **Güvenlik tetikleri:** adım (3), (4) veya (5) uygulandıysa `timeFit.priority='time'` ve `safety.level ≥ 'caution'`; eğim 15°'yi aşan her segment `alert`. Güvenlik göstergesi (C.6) hesaplanır; **hiçbir durumda rota reddedilmez** (süre öncelikli).
- **Kask uyarısı (HUD, "güvenli rota sertifikası" dili yok):** `safety.level !== 'ok'` ise kalıcı küçük simge + yaklaşırken (30 m ileri bakış, SENARYO) kısa uyarı satırı, ör. "Eğim 17° — planlama sınırı 15° aşıldı (süre öncelikli rota)". Metin kalıbı: "Planlama göstergesi", asla "güvenli/güvensiz".
- **Dürüstlük:** süre tahmini yalnız yürüyüş (C.5); bilimsel örnekleme, bekleme, dinlenme, metabolik sınırlar **modellenmedi** ve UI'de yazılır.

### C.4 Çok kişili bölüştürme (madde 7)

- **Ayrı mod (split):** hedefler = seçilen türlerin yama temsil noktaları (+ gerekiyorsa yama alt-bölümleri). Amaç: `min  max_k T_k`, ikincil `min (max T − min T)`.
  1. Çiftli maliyet matrisi: hedefler + başlangıç + bitiş arası (kaba ızgarada çok-kaynaklı Dijkstra, sonra kesin bacak planı).
  2. Başlangıç ataması: LPT (en uzun işlem önce) + en ucuz ekleme.
  3. Yerel arama: relocate / swap / 2-opt; hedef işlevi `f = max T_k + 0,25·(max T − min T)`.
  4. Hedef sayısı < kişi sayısı: yamalar k-means ile alt hedeflere bölünür; yetmezse bazı kişiler doğrudan başlangıç→bitiş alır ve "paylaşılan hedef yok" notu çıkar.
  5. **Kabul:** `max/min ≤ 1,15` (SENARYO) mümkünse; değilse gerçek oran gösterilir.
- **Beraber mod (together):** tek rota, hedefler TSP sıralamasıyla (≤6 tam, >6 sezgisel); herkes aynı rotayı yürür, kişi seçici yalnız etikettir.
- **Simülasyon:** yalnız **takip edilen kişi** sim'de koşar; diğerleri çizilmez/görünür değildir. Kişi değişince o kişinin rotası baştan oynatılır (basit, ölçülebilir). Minimap yalnız takip edilen kişinin rotasını gösterir. Kişi sayısı üst sınırı `maxParty` SENARYO (öneri 4; takım üst sınırı 6 değildir, bu EVA ekibi varsayımıdır).

### C.5 Yürüyüş hızı ve ETA modeli (madde 9)

- **Mevcut:** `walkSpeedMps = 1.2` SENARYO (`config.js:5`); Mars Froude sayısı `Fr = v²/(g·L) = 1,44/(3,71·0,9) = 0,431` (stage-visual-b §7); Dünya'da 0,163.
- **Önerilen yöntem (Froude dinamik benzerliği, MODEL):** aynı Fr ve aynı bacak uzunluğunda `v_Mars = v_Dünya · √(g_Mars/g_Dünya)`; `g_Mars = 3,71` (NASA Planet Compare, SOURCES #10), `g_Dünya = 9,80665`; oran 0,615 (stage-visual-b §7 ile aynı). Dünya'da rahat yürüyüş hızı `v_D ≈ 1,34 m/s` (SENARYO girdisi; literatür aralığı ~1,2–1,4 m/s). L = 0,9 m varsayım (ölçüm değil).
  - Merkez: `v_Mars ≈ 1,34 · 0,615 = 0,82 m/s`. Belirsizlik: `v_D ∈ [1,2; 1,4]` ve `L ∈ [0,8; 1,0]` → **0,70–0,91 m/s** (hesap: 1,2·0,615·√(0,8/0,9)=0,696; 1,4·0,615·√(1,0/0,9)=0,908).
  - Üst sınır (acil tempo): yürüyüş-koşu geçişi `Fr=0,5` → `v_wr = 1,292 m/s` (`astronaut-rig.js:244-249`, "model parametresi"). Bundan yukarısı yürüyüş değildir; model dışı.
  - **Kaynak notu (doğrulanmadı):** Froude benzerliğinin yürüyüş için kullanımı ve walk→run geçişinde Fr≈0,5 değeri genel olarak Alexander (1984, "The gaits of bipedal and quadrupedal animals") ve Kram, Domingo & Ferris (1997, "Effect of reduced gravity on the preferred walk-run transition speed", J. Exp. Biol.) ile ilişkilendirilir; bu oturumda metinler **açılıp doğrulanmadı**. Basınçlı giysinin etkisi modellenmedi; Mars düşük-g gerçek EVA hız verisi yoktur → sonuç **tahmin**dir, UI'de "senaryo/model" yazar.
- **Eğim etkisi (SENARYO, opsiyonel):** Tobler yürüyüş fonksiyonunun göreli biçimi `m(θ)=exp(−3,5·(|tanθ+0,05| − 0,05))` (dünya yürüyüşü, 1993; Mars/giysi doğrulaması yok): `m(0°)=1`, `m(5°)=0,74`, `m(10°)=0,54`, `m(15°)=0,39`, −2,9°'de 1,19. Varsayılan **kapalı**; açılırsa "dünya-yürüyüş fonksiyonu" etiketi. Alternatif: Minetti vd. (2002) enerji maliyeti eğrisi (kaynak doğrulanmadı).
- **Örnek (HESAP):** Jezero 730 m rota: 1,2 m/s → 608 s ≈ 10 dk 8 sn (mevcut); 0,82 m/s → 890 s ≈ 14 dk 50 sn. Mevcut demonun ~76 sn duvar saati (`DEMO_NOTES.md` §2) bu hızla ~111 sn olur → otomatik sürüş çarpanı (C.7) bunu telafi eder; yalnız **gösterim** ayarıdır.
- **Uygulama:** `simulation/gait-speed.js` (saf): `marsWalkSpeedMps({vEarth, legM, gMars, gEarth})`, `slopeSpeedFactor(θ)`, `etaS(polyline)`. `config.js` `SCENARIO.walkSpeedMps` artık bu fonksiyonun çıktısıyla beslenir (F5'te karar: varsayılanı 0,82'ye çekmek **kullanıcı kararı**; sim hızı ve ETA tek kaynaktan gelir — mevcut 0,8/1,2 tutarsızlığı bir daha doğmaz).

### C.6 Bölge türü → güvenlik/bağlam ağırlıkları (madde 5; hepsi SENARYO)

İlke: **yerel EVA puanı yalnız ≤2 m DEM'den** (`cost-model.js`); bölge türü ayrı bir **bağlam çarpanı `w`**dır (0–1). Kaba küresel/bölgesel katmandan yerel puan üretilmez; küresel etiket "bölgesel bağlam / senaryo ağırlığı" olarak gösterilir. Bileşik: `S_hücre = EVA_puanı(0–100) × w_tür`; rota için `S_min`, `S_p10`, `S_ort` ayrı raporlanır (tek sayıya sıkıştırılmaz).

| Tür (kimlik) | w | Gerekçe (hepsi **senaryo**, sayısal kaynak yok) | Yerel tespit |
|---|---|---|---|
| Düzlük/ova `plain` | 1,00 | Düşük eğim beklentisi | eğim P90 ≤ ~3° (morfometri) |
| Krater tabanı `crater_floor` | 0,95 | Genelde düz; küçük çarpma kraterleri | SIM3464 `Njf`; kapalı çukur (`relief-metrics.findDepressions`, `:393`) |
| Tabakalı/aşınmış çökel `layered_deposit` | 0,80 | Basamaklı/yüzey dokusu belirsiz | SIM3464 `Nue`,`Nle` |
| Antik delta/yelpaze `delta_fan` | 0,85 | Blok/kademe beklentisi (kaya tespiti yok; HiRISE kaya yoğunluğu ürünüyle sonra doğrulanır) | SIM3464 `NHjf2` |
| Volkanik `volcanic` | 0,75 | Pürüzlü lav yüzeyi olasılığı | Tanaka volkanik birimler/gazetteer (küresel); yerel jeoloji haritası varsa o |
| Dağlık/engebeli `highland` | 0,70 | Yüksek yerel kabartma | pürüzlülük/eğim P90 (yerel); Tanaka Noachian yaylalar (küresel bağlam) |
| Kum tepesi `dune_field` | 0,70 | Gevşek/eğimli yüzey olasılığı; insan taşıma kapasitesi verisi yok | SIM3464 `Aeb`; MGD³ (küresel) |
| Krater kenarı/duvarı `crater_rim` | 0,65 | Dik yamaç + kaya | SIM3464 `cr`; halka-sırt morfometrisi |
| Vadi/kanyon `valley_canyon` | 0,65 | Dik duvarlar | gazetteer vallis/chasma + yerel negatif eğrilik |
| Kutup/buz `polar_ice` | 0,60 | Buz/don yüzeyi, aşırı soğuk; veri sınırlı | Tanaka kutup birimleri + enlem ipucu |
| Kaos/çatlak `chaos_fractured` | 0,55 | Düzensiz blok/çatlak | gazetteer chaos/fossae |
| **Bilinmeyen** | — | `w` uygulanmaz; **asla 'ok' değil** (düzey en çok `caution`, neden "bağlam bilinmiyor") | — |

Seviye eşikleri (SENARYO): `caution` = herhangi segmentte eğim > 12° **veya** `S_hücre < 50`; `alert` = eğim > normal sınır (15°) **veya** `S_hücre < 30` **veya** süre-öncelik gevşetmesi uygulandı. UI her bileşeni (eğim, pürüzlülük, tür, kapsam) açıklar (`explainCell` kalıbı `route-service.js:471`).

### C.7 Otomatik sürüş, hız çarpanı ve 20 m yeniden rota kuralı (madde 12)

- **Denetleyici (`simulation/autopilot.js`, saf):** polyline üzerinde saf-takip (lookahead 3 m, SENARYO); çıktı `{moveX, moveY, headingRad}`; hız = `gait-speed.js` (eğime duyarlı ya da sabit); **zıplama yok** (Space otomatik sürüşte yok sayılır); herhangi bir WASD girişi otomatik sürüşü bırakır (manuel öncelik). Tuş önerisi: `KeyT` ("takip") — `input.js` KEYMAP'inde yok, çakışma yok (`input.js:4-9,45-53`); düğme sağ alt panelde.
- **Zaman çarpanı `k ∈ [0,5; 10]`:** `1×` = mevcut sunum temposu (`timeScale=8`, `config.js:15`) olarak tanımlanır; etkin ölçek `timeScale_eff = 8·k`; ekranda "senaryo saati ×(8·k)" yazar (gerçek hız iddiası değil). Uçuş ölçeği: `airborneTimeScale_eff = clamp(airborneTimeScale, 1, timeScale_eff)` (`sim.js:14-21` aralık dışında **fırlatır**; k≥0,5 için 8·0,5=4 ≥ 2 güvenli, ama uygulama yine de kelepçeler). Yumuşatma sabiti `timeScaleSmoothingWallS=0,02` (`config.js:20`) aynı kalır.
- **Alt-adımlama (zorunlu):** `dt` üst sınırı 0,1 sn (`sim.js:122,156`) ve k=10'da `dtSim ≤ 8 sn` → kare başına ≈ 6,6 m adım; ayak izi/rota şeridi/kamera salınımı atlar. Çözüm: otomatik sürüş kare başına `ceil(dtSim/0,25 s)` alt-adım (maks. adım ≤ 0,25 sn sim ≈ 0,2 m) koşar; ayak izi motoru her alt-adımı alır. k > ~3'te kamera salınımı/adım animasyonu genliği azaltılır (SUNUM, F9/F11).
- **Hız çubuğu:** yalnız otomatik sürüş açıkken görünür; "Durdur" = otomatik sürüşü bırakır ve konumda durur (devam için tuş). Sağ alt, kask çerçevesi içinde.
- **20 m yeniden rota kuralı (`route/rejoin.js`):** otomatik sürüş açıldığında anlık konum `p`, eski rota polyline'ına en yakın nokta `q`, `d = |p − q|`.
  - `d < 20 m` (SENARYO `autoRejoinMaxM=20`): `p → q` kısa A\* bağlantısı (engel/eğim kuralları aynı), sonra eski rotayı **q'dan** sürdür. Rota değişmez (aynı `route-plan` kimliği).
  - `d ≥ 20 m`: yeniden planla: `p → (henüz geçilmemiş zorunlu tür via'ları) → varış`; kalan süre bütçesi `T_req − t_geçen`; aynı eğim sınırı ve aynı süre-uyum kuralları. Yeni plan kimliği alır; geri alma yok.
  - `p` no-data/kapsam dışı/hedefe ≤ `arrivalRadiusM=3 m` ise reddet + mesaj. İsabet çizgisi çevresinde titreşimi önlemek için 20/25 m histerezis (SENARYO).
- **Çarpışma ile ilişkiler:** duraklatma (`P`) çarpanı sıfırlamaz; `PHASE.ARRIVED`'da otomatik sürüş kapanır; `R` (yeniden başlat) kapatır.

---

## D. AŞAMALAR (F0–F13)

Ölçek: **S** ≤ 0,5 gün · **M** 0,5–1,5 gün · **L** 1,5–3 gün (kişi-günü, tahmin). Her aşama kendi kısa ömürlü dalında; Alparslan entegrasyon sahibidir (AGENTS.md). Testler yalnız kullanıcı istediğinde koşulur; aşağıdaki "test" satırları **eklenecek** testlerdir.

**Bağımlılık özeti:** `F0 → {F4, F5} → {F6, F7} → F8 → F13`; veri şeridi `F1 → F2 → F3 → F8`; kask/mod şeridi `F0 → F9 → F10`, `F11 ∥ F10`, `F12 ← F8, F9`. Paralel: **F1 ∥ F0**, **F3 ∥ F4 ∥ F5**, **F9 ∥ F7**, **F10 ∥ F11**.

### F0 — Taban, sözleşmeler ve uzantı noktaları — **Alparslan · M**
- **Amaç:** Diğer tüm aşamaların çakışmadan çalışabilmesi için ortak sözleşmeleri dondurmak; küçük hataları kapatmak.
- **Dosyalar:** `config.js` (yeni SENARYO anahtarları: `walkSlopeCapDeg`, `emergencySlopeCapDeg`, `autoRejoinMaxM`, `autopilotSpeedMin/Max`, `maxParty`, `maxRouteDurationS`), `main.js` (**yalnız** `goalRadiusM` düzeltmesi + `app/` köprü çağrıları), `index.html` (boş kök kapsayıcılar: `#app-globe-root`, `#app-helmet-root`, `#app-panel-root`, `<link>` css), `view/minimap/minimap.js` (**uzantı noktası**: `setOverlayDrawers([...])` ve `style:'hologram'|'default'`), `app/scene-machine.js` (iskelet), `app/mission-request.js`, snapshot sözleşme sürümü (`sim.js` snapshot'a boş `person/autopilot/safety/mode`).
- **Bağımlılık:** yok. Kullanıcı kararı **D1 (aktif DTM, K3-7)** ve **38B datum bayrağı (`config.js:56` true↔false)** bu aşamada kayda alınır.
- **Kabul (ölçülebilir):** (1) HUD minimap "Hedef ✓" hedefe ≤3 m'de görünür; (2) `node --test test/` mevcut 612 testle uyumlu (sayı, kullanıcı koşarsa); (3) yeni alanlar `deepFreeze` snapshot'ta bulunur ve `test/core.test.mjs` sözleşmesini bozmaz; (4) `index.html`'de yalnız eklenen kapsayıcılar/linkler (fark ≤ 15 satır); (5) `minimap.js` uzantı noktası yokken davranış birebir aynı.
- **Test/smoke:** `test/scene-machine.test.mjs` (geçiş tablosu), `test/mission-request.test.mjs`; smoke: `?demo=1` akışı değişmeden.
- **Dürüstlük/atıf:** yeni SENARYO anahtarları `config.js`'te "senaryo parametresi" yorumuyla.
- **Paralel:** F1 ile.

### F1 — Küresel bölge verisi ve bölge-türü kataloğu — **Efe · L** (+ kullanıcı indirmesi)
- **Amaç:** Küre üstünde hover bilgisi ve tür kataloğu için küresel, küçük (<~30 MB) veri paketi.
- **Dosyalar:** `scripts/fetch-mola-global.mjs` (Trek ImageServer `exportImage`, S16, bbox/`bboxSR=imageSR=104905`; `fetch-regional-dem.mjs` kalıbı; 8 ppd ≈ 2880×1440 ≈ 8,3 MB ham), `scripts/build-region-catalog.mjs`, `data/mars-global/{mola-8ppd.s16, terrain-class-8ppd.u8, gazetteer.json, dunes-mgd3.json?, manifest.json}`, `geo/region-catalog.js`, `geo/region-lookup.js`, `geo/gazetteer.js`, testler, `stage-f1-region-data-audit.md`.
- **Bağımlılık:** F0 şema dondurması (mission/site/region şemaları) — veri indirme F0 ile paralel başlayabilir. Kullanıcıya bırakılanlar (E bölümü): Tanaka SIM 3292, gazetteer, MGD³ dosyaları.
- **Kabul:** (1) `lookupRegion(lonDeg,latDeg)` her çağrıda ≤ 0,05 ms (ölçülür, hover bütçesi ≤ 4 ms); (2) 1000 rastgele (lon,lat) için sonuç `{terrainClass, nearestFeature?, elevationM?, source, nativeCellKm}` ve hiçbirinde `elevationM` no-data'da 0 değil `null`; (3) Jezero (77,449°D 18,439°K) için kot MOLA penceresiyle uyuşur (|fark| ≤ ~50 m; mevcut identify −2574 vs nearest −2582, `mola-jezero.json` `identifyCheck`); (4) tüm kaynaklar manifestte `license` alanı taşır, yazmıyorsa "belirtilmemiş"; (5) paket toplam boyutu raporlanır, hedef ≤ 30 MB.
- **Test/smoke:** `test/region-lookup.test.mjs`, `test/gazetteer.test.mjs`; veri bütünlüğü `scripts/validate-data-integrity.mjs` genişletmesi.
- **Dürüstlük:** küresel katman "bölgesel bağlam"; 463 m/px (MOLA) ve 1:20 M (Tanaka) çözünürlük her yerde yazılır; yerel puan üretmez; datum `needs_review` (`mola-jezero.json` `datum.status`).
- **Paralel:** F0 ile.

### F2 — Saha (site) paketleri ve çok-saha yüzey kaydı — **Efe (F2a) + Alparslan (F2b) · L**
- **Amaç:** Küre seçiminin karşılık bulacağı ≥ 1 tam destekli saha (Jezero genişletilmiş) ve ≥ 2 aday saha; saha başına tür kapsamı.
- **F2a (Efe) dosyaları:** `scripts/build-site-package.mjs`, `scripts/build-type-coverage.mjs`, `geo/morphometry.js`, `geo/site-coverage.js`, `data/sites/jezero-ext/…`, `data/sites/<gale|columbia>/…`, testler, `stage-f2-site-audit.md`.
  - **Jezero genişletme:** kök dizindeki `DTEEC_045994_1985_046060_1985_U01.IMG` (380.814.764 bayt) tüm kapsamı: 14266×6673 hücre, ~14,4×6,7 km (`legacy-hirise/dtm_subset.json` `lines/samples`, `minLat 18,305…maxLat 18,548`, `west 77,383…east 77,501`). Şu an yalnız 1129×1669 pencere yüklü. Tarayıcı belleği için **parçalı/aşağı örneklenmiş piramit** (1 m çekirdek pencere + 2 m genel; `evaWalkabilityMaxM=2` ile uyumlu). USGS TRN mozaiği ~21,4×21,4 km (77,223–77,584°D, 18,307–18,669°K; `mars-trek/manifest.json`) daha geniş seçenek ama **dosya depoda yok** (yalnız pencere), CC0 (SOURCES #1), düşey datum kanıtı yok (K3-7). Seçim **D1 kararı**na bağlı.
  - **Tür kapsamı (Jezero):** SIM3464 birimleri: `Njf`→crater_floor, `NHjf2`→delta_fan, `Aeb`→dune_field, `Nue/Nle`→layered_deposit, `cr`→crater_rim (alt küme bbox'ları DTEEC ile kesişir: NHjf2 77,326–77,505°D × 18,407–18,580°K; yalnız **bbox** kontrolüdür, alan oranı **ölçülmedi** → F2 kabul ölçütü).
  - **Aday saha 1 m DEM:** Trek ImageServer ürünleri `Gale_DEM_SMG_1m` ve `DEM_1m_ColumbiaHills_fixed` (`stage26a-trek-catalog-audit.md:24`; F32, `exportImage` ≤15000×4100 piksel, `exportTilesAllowed:false`, CORS → vekil/script gerekir `:27`). Kapsam boyutu ve lisans **doğrulanmadı**.
- **F2b (Alparslan) dosyaları:** `surface/site-registry.js` (site manifesti → adaptör + katman; mevcut `registry.js:776` çağrısını parametreleştirir), `main.js` (tek satırlık `siteRegistry` enjeksiyonu F8'e ertelenir), `test/site-registry.test.mjs`.
- **Bağımlılık:** F1 (tür sınıflama yöntemleri), D1. F2b, F2a şemasına bağlı.
- **Kabul:** (1) en az 1 saha `eva_walkability` sınıfında; (2) her sahada `typeCoverage` en az `plain` + 1 başka tür; (3) Jezero için her tür `areaM2` raporlanır (ölçülmüş); (4) saha manifesti `registry.validateLayerManifest` benzeri fail-closed doğrulamadan geçer, bilinmeyen CRS/datum → `needs_review`; (5) no-data hücre sayısı manifestte, 0'a çevirme yok; (6) Jezero genişletilmiş pencerede `route-service` 14×7 km için bellek ≤ ~400 MB (ölçülür; aşılırsa 2 m).
- **Test/smoke:** `test/site-registry.test.mjs`, `test/morphometry.test.mjs`, `test/site-coverage.test.mjs`; `scripts/preflight.mjs` yeni manifestleri tanır.
- **Dürüstlük:** her sahada DEM kaynağı, çözünürlük, lisans (yazmıyorsa "belirtilmemiş"), datum durumu; ortomozaik hizası kanıtlı değilse (K3-8, r=0,021) "ortogörüntü hizalı" denmez.

### F3 — Küre ekranı, hover ve sağ seçim paneli — **Efe · L**
- **Amaç:** Madde 1, 3 (panel), 4 (hover), 14 (görsel).
- **Dosyalar:** `view/globe/*` (B.1), `css/globe.css`, `test/globe-picking.test.mjs`, `test/globe-panel.test.mjs`. Panel öğeleri: saha, başlangıç/varış pinleri, tür çoklu-seçim (11 tür, saha kapsamına göre etkin/sönük), istenen varış süresi (+ "süre güvenlikten önceliklidir" uyarı metni), kişi sayısı + ayrı/beraber, rota tercihi, **Simüle et**.
- **Bağımlılık:** F0 (kapsayıcılar), F1 (hover verisi), F2a (saha listesi). F4 ile paralel; Simüle et düğmesi F8'de bağlanır, burada `onSimulate(missionRequest)` geri çağrısı verilir.
- **Kabul:** (1) küre ≥ 45 FPS (hedef; entegre GPU, ölçülür ve cihaz adı yazılır); (2) hover etiketi ≤ 1 kare gecikme, ≤ 4 ms arama; (3) ışın–küre seçimi: bilinen 20 (lon,lat) için |geri dönüşüm hatası| ≤ 0,01°; (4) sahalar küre üstünde işaretli, saha dışı tıklamada "bu bölge için yerel DEM yok" mesajı + yakın saha önerisi; (5) panel yalnız GLOBE durumunda görünür, `Simüle et` ile kaybolur (CSS sınıfı, animasyon ≤ 400 ms); (6) WebGL2 yokken 2D seçici aynı `missionRequest`'i üretir; (7) etiket yalnız "bölgesel bağlam / yaklaşık", yerel yürünebilirlik iddiası yok.
- **Test/smoke:** saf `globe-picking`, `fly-path`; smoke'a (Alparslan F13'te) "küre yüklenir + hover etiketi + tık" adımı.
- **Atıf:** panel altında "Viking MDIM 2.1 (USGS Astrogeology / NASA) — renkli mozaik, lisans belirtilmemiş" satırı; Tanaka/Gazetteer atıfları.
- **Paralel:** F4/F5 ile.

### F4 — Rota çekirdeği: eğim sınırı, polyline, tür via'sı, güvenlik göstergesi — **Alparslan · L**
- **Amaç:** Madde 2, 3 (via), 5.
- **Dosyalar:** `route/slope-cap.js`, `route/via-planner.js`, `route/safety-index.js`, `simulation/route-follower.js` (polyline metrikleri: `progressM`, `deviationM`, `distToEndM`, `nextPoint`), `sim.js` (`setRoutePath(polyline)`; **mevcut a→b yolu korunur**), `pathfinder.worker.js` (yeni mesaj tipleri: `via-plan`), testler, `scripts/validate-slope-cap.mjs`, `stage-f4-route-audit.md`.
- **Bağımlılık:** F0, F2a/F2b'den en az bir saha manifesti (Jezero ile başlanabilir).
- **Kabul:** (1) Jezero penceresinde 100 rastgele uç çifti × 3 tercih: durumu `ok` olan her yol için bağımsız 0,5 m örneklemede `max eğim ≤ 15°` ve `impassableCrossings=0` (ihlal 0); (2) via planı: her seçili ve **mevcut** tür için `insideLengthM ≥ 20 m` (SENARYO); (3) aynı girdi → aynı yol (deterministik); (4) polyline sim'de ilerleme/sapma **polyline'a** göre hesaplanır (düz segmente göre değil); koridor bandı polyline'a uyar; (5) güvenlik düzeyi kalıbı C.6'ya göre; no-data/kapsam dışı hücre içeren yol asla `ok` değil; (6) worker süresi hedefi: Jezero 1,7 km pencere ≤ 1 sn, genişletilmiş pencere ≤ 5 sn (hedef, ölçülür).
- **Test/smoke:** `test/slope-cap.test.mjs`, `test/via-planner.test.mjs`, `test/safety-index.test.mjs`, `test/route-follower.test.mjs`; `validate-slope-cap.mjs` çıktısı `stage-f4-route-audit.md`'ye yazılır.
- **Dürüstlük:** tüm eşikler/ağırlıklar SENARYO; "güvenlik düzeyi" değil "planlama göstergesi düzeyi"; `caveatTR` zorunlu alan.

### F5 — Yürüyüş hızı/ETA modeli ve hedef-süre uyumu (acil durum) — **Alparslan · M**
- **Amaç:** Madde 6 (süre) ve 9.
- **Dosyalar:** `simulation/gait-speed.js`, `route/time-fit.js`, `config.js` (`walkSpeedMps` türetmesi — **karar D5**), `route/route-service.js` sarmalayıcı yalnız `scenarioSpeed*` seçenekleriyle (dosya değişmez), `test/gait-speed.test.mjs`, `test/time-fit.test.mjs`, `scripts/validate-time-fit.mjs`, `stage-f5-time-audit.md`.
- **Bağımlılık:** F4 (polyline/safety). `gait-speed.js` F4'ten bağımsız başlayabilir.
- **Kabul:** (1) `marsWalkSpeedMps` testle: `v_D=1,34,L=0,9` → 0,82 ± 0,01; oran `√(3,71/9,80665)=0,6151`; (2) `T_req` 5 senaryoda doğru dal: uzatma/kısaltma/aynı/imkânsız; her çıktıda `timeFit.mode` ve gerekçe; (3) kısaltma adım sırası C.3 ile birebir; (4) `T_req` fizibil değilken `infeasible` + ulaşılabilir en kısa ETA ve boşluk; (5) süre öncelikli gevşetme uygulandığında `safety.level ≥ caution` (özellik testi); (6) hiçbir ETA'da bilimsel örnekleme süresi yok (test: `etaAssumption.excludes` içerir).
- **Dürüstlük:** hız modeli "Froude benzerliği (MODEL); L ve v_D varsayım; kaynak metinleri doğrulanmadı; giysi etkisi yok"; `SOURCES.md` üreticisine (`scripts/build-sources-list.mjs`) yeni satırlar.
- **Paralel:** F3, F4 ile (gait-speed kısmı).

### F6 — Çok kişili bölüştürme ve kişi seçici — **Alparslan · M**
- **Amaç:** Madde 7.
- **Dosyalar:** `route/multi-agent.js`, `app/mission-request.js` (party alanları), `main.js` yalnız kişi seçici bağlama (F8 ile birlikte), `test/multi-agent.test.mjs`, `scripts/validate-time-fit.mjs` genişletmesi.
- **Bağımlılık:** F4.
- **Kabul:** (1) 3 kişi × 6 hedef sentetik ızgarada `max/min ≤ 1,15`; (2) hedef sayısı < kişi sayısı durumunda açık not, çökme yok; (3) beraber mod tek polyline; (4) aynı girdi → aynı atama; (5) toplam çalışma süresi ≤ 2 sn (6 hedef, worker); (6) takip edilmeyen kişiler render/snapshot'a girmez (`snapshot.person` yalnız takip edilen).
- **Dürüstlük:** "dengeli süre" = ETA (C.5 modeli), gerçek efor değil.

### F7 — Simülasyon: polyline takip, otomatik sürüş, zaman çarpanı, yeniden rota — **Alparslan · L**
- **Amaç:** Madde 12 (denetleyici + 20 m kuralı + çarpan), 6 (kask uyarı verisi).
- **Dosyalar:** `simulation/autopilot.js`, `route/rejoin.js`, `sim.js` (`setClockMultiplier(k)`, `airborne` kelepçesi), `input/input.js` (`KeyT`, `onAutopilotToggle`, `onSpeedChange` geri çağrıları — **simülasyon kuralı yok**), `main.js` (alt-adımlama çağrısı + snapshot alanları), testler.
- **Bağımlılık:** F4, F5. **F9 ile paralel** (UI sözleşmesi F0'da donmuş).
- **Kabul:** (1) k ∈ {0,5; 1; 3; 10} için 730 m sentetik rotada varış süresi `≈ 730/v / (8k)` ± %2 (duvar saati); (2) k=10'da kare başına maksimum adım ≤ 0,5 m (alt-adımlama ölçüsü); ayak izi aralığı k=1 ile aynı (±10%); (3) `resolveAirborneTimeScale` hiçbir k için fırlatmaz; (4) `d=19,9 m` → rejoin (rota kimliği aynı), `d=20,1 m` → replan (yeni kimlik) — sınır testleri; (5) manuel WASD otomatik sürüşü bırakır; (6) `PAUSED`/`ARRIVED`/`R` durumlarında kapanır; (7) sapma ölçümü polyline'a göre.
- **Test/smoke:** `test/autopilot.test.mjs`, `test/rejoin.test.mjs`, `test/clock-multiplier.test.mjs`; smoke: "otomatik sürüş aç, k=3, hedefe varış".
- **Dürüstlük:** çarpan "senaryo zaman hızlandırma" etiketli; fiziğin (zıplama balistiği) sim-saniyesinde değişmediği not edilir (`stage-airborne-timescale-note.md` ilkesi).

### F8 — Sahne durum makinesi ve uçtan uca akış — **Alparslan (bağlama) + Efe (kamera geçişi) · L**
- **Amaç:** Madde 1+3+8: GLOBE → panel → Simüle et → zoom → 1. şahıs.
- **Dosyalar:** `app/scene-machine.js` (tam), `app/app-bootstrap.js`, `main.js` (enjeksiyon; **net artış ≤ 100 satır**, gövde bölme), Efe: `view/globe/fly-path.js` (saf kamera yolu), `view/3d/camera.js`'e **yalnız Alparslan** ekleme gerekirse (`blendCamera(a,b,t)`), `test/scene-machine.test.mjs` tam tablo, `test/fly-path.test.mjs`.
- **Bağımlılık:** F3, F4, F6, F7, F2b.
- **Kabul:** (1) tüm geçişler tablo testinde; geçersiz olay yok sayılır; (2) "Simüle et" → ≤ 6 sn'de 1. şahıs görünür (zoom ≈ 4–6 sn); (3) yörünge kamera → 1. şahıs geçişinde kare atlaması yok (kare başına poz farkı ≤ eşik; ölçülür); (4) panel kaybolur, kask açılır; (5) geri dönüşte küre durumu (pinler, tür seçimi) korunur; (6) `?demo=1`, `?view=3d` eski yolları çalışır; (7) WebGL2 yok → 2D fallback.
- **Dürüstlük:** geçişte "rota bölgesi" = rota sınır kutusu + pay; veri kapsamı dışına çıkılmaz.

### F9 — Kask, holografik minimap, uyarı ve sağ-alt sürüş kontrolü — **Efe · L**
- **Amaç:** Madde 10, 11, 12 (UI), 6 (uyarı).
- **Dosyalar:** `view/helmet/*`, `css/helmet.css`, `view/layers/` (mod çubuğu iskeleti), `minimap.js` `style:'hologram'` çizimi (F0 uzantı noktası üzerinden), testler.
- **Tasarım:** kask = CSS/SVG katmanı: dış halka (koyu iç çerçeve + eğimli kenar), vizör iç yansıması (düşük alfa, güneş azimutuna bağlı parlama), kenar buğusu (düşük frekanslı gürültü dokusu; koşuda kıpırdar), ince tarama çizgisi. Kamera zaten kask merkezindedir (`camera.js:8`), bu yüzden bakış "içeriden" doğal. **WebGL pass eklenmez** (pass 0–7 korunur). Minimap sol üst, %55–70 saydam, camgöbeği tek-renk "hologram" stili; altında mod çubuğu (F10). Sağ alt: otomatik sürüş düğmesi + (yalnız açıkken) 0,5–10× sürgü + Durdur. Uyarı: kask üst orta, küçük, ≤ 1 satır, 4 sn solar (alert'te kalıcı simge).
- **Bağımlılık:** F0 (kapsayıcılar/sözleşme). F7 verisi gelene kadar sahte (stub) snapshot ile geliştirilir.
- **Kabul:** (1) 1080p'de kask katmanı ek kare süresi ≤ 1 ms (ölçülür); (2) merkez 70% alan %100 saydam (görüş engellenmez); (3) minimap sol üst, sürgü sağ alt, sürgü yalnız `autopilot.active` iken DOM'da görünür; (4) uyarı `safety.level` değişince ≤ 100 ms; (5) `prefers-reduced-motion` altında buğu/tarama sönümlenir; (6) metinlerde "güvenli rota" geçmez (statik grep testi).
- **Atıf:** tüm kask grafikleri özgün/CSS (harici doku yok) → atıf gerekmez; yine de `submission/` listesine "kendi üretimimiz" satırı.
- **Paralel:** F7 ile.

### F10 — Görüş modları (heat + kontur) — **Efe · L**
- **Amaç:** Madde 13.
- **Dosyalar:** `view/layers/{mode-registry,heat-layer,contour}.js`, `view/layers/layer-sources/{optical,topographic,thermal-model,atmos-model,radiation-model,chemical-qual,geophys,spectral}.js`, `css/modes.css`, `test/contour.test.mjs`, `test/layer-modes.test.mjs`, `stage-f10-modes-audit.md`.
- **Bağımlılık:** F1/F2 (MOLA global + saha DEM), F9 (host).
- **Kabul:** (1) aynı anda yalnız bir mod (radyo davranışı, testli); (2) her mod rozet taşır (`ÖLÇÜM/HESAP/MODEL/YOK`) + kaynak + yerel hücre boyutu; (3) kontur: marching squares, DEM no-data hücrelerinde **çizgi kırılır** (köprü yok); ana/ara aralık otomatik (SUNUM); (4) ısı haritası kaba veride **bloklu** (yeniden örnekleme ile uydurma ayrıntı yok); (5) yüklenemeyen kaynak → mod "kullanılamıyor" gri; (6) 9 mod × 3 konumda çizim ≤ 8 ms/yenileme (ölçülür; minimap 0,06 sn aralığı `main.js:2016`).
- **Dürüstlük:** sınıflama tablosu bu belgenin **E.2**'sidir; "spektral" ve "jeofizik" kaynak yoksa **görsel yaklaşım/kullanılamıyor** etiketiyle çıkar.
- **Paralel:** F11 ile.

### F11 — Görsel kalite, dokular ve atıf — **Efe · M**
- **Amaç:** Madde 14 (gerçekçilik, atıf).
- **Dosyalar:** `view/globe/globe-texture.js` (atmosfer halesi, terminatör), `view/3d/sky-model.js`, `terrain-shading.js` parametre ayarları **yalnız** Alparslan onayıyla; `submission/credits.md` (yeni), `build-sources-list.mjs` girdileri, `SOURCES.md` yeniden üretimi.
- **Bağımlılık:** F3, F9.
- **Kabul:** (1) her gösterilen doku/görsel `SOURCES.md` + arayüzde atıflı (statik kontrol: dokular `manifest.license` alanı dolu); (2) kürede/arazide "ortogörüntü" kelimesi yalnız gerçek HiRISE ortomozaiği için; hillshade/Viking için kullanılmaz (statik grep); (3) görsel karşılaştırma önce/sonra ekran görüntüleri `research/visual-realism/` altında; (4) FPS bütçesi bozulmaz (F13 ölçümü).
- **Dürüstlük:** Viking/HiRISE lisans durumu "belirtilmemiş" ise gösterilir (K1-4); NASA görüntü kullanım yönergesi **doğrulanmadı** — kullanıcı teyidi.

### F12 — Sunum/Kayıt modu ve kamera akışı — **Efe (+Alparslan kancaları) · M**
- **Amaç:** Madde 14 (video çekimi için temiz mod).
- **Dosyalar:** `view/helmet/record-mode.js`, `view/globe/fly-path.js` (sinematik yollar), `app/` kancası (Alparslan): `?record=1`, sabit zaman adımı (`?fixedDt=`), `css/record.css`; `submission/shot-list.md`.
- **Tasarım:** `?record=1` = tüm kenar çubuğu/ipuçları/uyarı metni gizli (kask ve minimap kalır), imleç gizli, DPR=1, 1920×1080 sabit, kalite yöneticisi sabit (`?quality=high`, `main.js:1976-1982`), deterministik kamera yolu (küre dönüşü → zoom → yürüyüş → otomatik sürüş). Kayıt: `canvas.captureStream()+MediaRecorder` (tarayıcı desteği/kalite **doğrulanmadı**) veya OBS; kullanıcı kararı.
- **Bağımlılık:** F8, F9.
- **Kabul:** aynı URL iki koşuda aynı kare dizisini (±1 kare) üretir (seed+sabit dt); kayıt modunda hiçbir metin/uyarı bindirmesi yok; Esc ile çıkış.
- **Çekim listesi (≤ 30 sn kesit için; teslim kuralı K6-a teyit edilmedi):** (1) küre dönüşü 4 sn; (2) hover etiketi 2 sn; (3) panel seçimi 4 sn; (4) Simüle et + zoom 5 sn; (5) kask içinden yürüyüş 5 sn; (6) topografik kontur → termal mod 4 sn; (7) otomatik sürüş + hız sürgüsü 3 sn; (8) varış 3 sn. Uzun versiyon 90 sn.

### F13 — Dondurma ve teslim kalitesi — **Alparslan + Efe · M** (SON AŞAMA; bitince proje biter)
- **Amaç:** Regresyon, performans bütçesi, sunum çekim listesi, belgeler, etiket.
- **Dosyalar:** `scripts/smoke-e2e.mjs` (yeni adımlar), `stage-f13-acceptance.md`, `README.md`, `DEMO_NOTES.md`, `SOURCES.md` (yeniden üret), `submission/*`, git etiketi `final-freeze`.
- **Kabul:** (1) `node --test test/` çıkış 0 (kullanıcı koşar; sayı rapora yazılır); (2) `npm run smoke` yeni akışla PASS; (3) **performans bütçesi (hedef, ölçülür, cihaz adı yazılır):** küre ≥ 45 FPS; 1. şahıs + kask + minimap + mod ≥ 30 FPS (kalite yöneticisi serbest) ve ≥ 24 FPS en düşük seviye; başlangıç→küre görünür ≤ 6 sn (önbellekli); küre→1. şahıs ≤ 12 sn; bellek ≤ ~700 MB (tarayıcı görev yöneticisi); (4) 14 maddenin tarayıcı kanıtı (G tablosu) PASS/FAIL/NOT-TESTED; (5) lisans/atıf taraması: `SOURCES.md` ↔ arayüz ↔ `submission/` tutarlı; (6) "güvenli rota", "canlı telemetri", "gerçek renk", "ortogörüntü" (hillshade/Viking için) ifadelerinin yasaklı-kelime taraması 0; (7) eski demo (`?demo=1`) hâlâ çalışır; (8) çekim listesi ekran kaydı alındı.
- **Dürüstlük:** bilinen sınırlar listesi (F bölümündeki risk/kapsam dışı) `DEMO_NOTES.md`'ye işlenir.

**Toplam:** F0 M(1) + F1 L(2,5) + F2 L(2,5) + F3 L(2,5) + F4 L(2,5) + F5 M(1) + F6 M(1) + F7 L(2,5) + F8 L(2,5) + F9 L(2,5) + F10 L(2,5) + F11 M(1) + F12 M(1) + F13 M(1) ≈ **26,5 kişi-günü** (tahmin).

---

## E. Veri ve atıf envanteri

### E.1 Kaynak envanteri

Durum: **VAR** (repoda) · **YOK-İNDİR** (indirilebilir, ajan script veya kullanıcı) · **KULLANICI** (portal/lisans teyidi gerektirir, kullanıcıya bırakılır). Lisans sütunu SOURCES.md kuralını izler: kaynakta yazmıyorsa **belirtilmemiş**.

| Kaynak | Durum | Çözünürlük / boyut | Lisans | Kullanım |
|---|---|---|---|---|
| Viking MDIM 2.1 renkli küresel mozaik, z0–z3 piramit | **VAR** `data/viking-mdim/` | 232 m/px kaynak; z3 5,21 km/px, 4096×2048; PNG toplam 22,9 MB | belirtilmemiş (K1-4) | Küre dokusu, hover renk bağlamı. Ortogörüntü/kot değil. |
| MOLA bölgesel pencere (Jezero) | **VAR** `data/regional-dem/mola-jezero.f32` | 384×384, 0,0078125°, 589.824 bayt | belirtilmemiş; `needs_review` datum | Ufuk/bağlam; küresel değil. |
| HiRISE DTEEC DTM (tüm ürün) | **VAR (kökte, LFS)** `DTEEC_045994_1985_046060_1985_U01.IMG` | 14266×6673, ~1,0097 m/px, 380.814.764 bayt; yüklü pencere 1129×1669 | belirtilmemiş | Jezero genişletme (F2a). |
| USGS Mars 2020 TRN DTM mozaiği (pencere) | **VAR** `data/dtm_subset.f32` (7,6 MB) | 1 m/px; kaynak mozaik 21488×21400 (**depoda yok**) | CC0 1.0 | Aday; datum kanıtı yok (K3-7) |
| HiRISE 25 cm ortomozaik WMTS (z14/z17 birleşik PNG) | **VAR** `data/ortho/` (z17 2,8 MB, z14 0,25 MB) + `mars-trek/ortho-tiles` | z17 0,318 m/px | belirtilmemiş | Optik mod, Jezero; hizası kanıtlı değil (K3-8) |
| HiRISE ortho JP2 (RED) | **VAR (kökte)** `ESP_046060_1985_RED_C_01_ORTHO.JP2` 33,5 MB | tek bant (RED); **JP2 çözücü yok** | belirtilmemiş | Kullanılmıyor |
| USGS SIM 3464 Jezero jeolojisi | **VAR** `data/usgs-sim3464-geology/` (alt küme 40 poligon; hizmet toplam 1308) | 1:75.000 | belirtilmemiş | Jezero tür kapsamı |
| Mars 2020 traverse/waypoint | **VAR** `data/mars-trek/M20_*.json` | vektör | belirtilmemiş | Arşiv; insan rotası değil |
| Perseverance ham görüntü (Sol 120/164) | **VAR** `data/perseverance-raw/` | 12 JPEG | belirtilmemiş | Galeri |
| **MOLA küresel DEM** (Trek ImageServer) | **YOK-İNDİR** | 8 ppd ≈ 2880×1440 S16 ≈ 8,3 MB ham (hesap); 463 m kaynak; istek ≤15000×4100 | belirtilmemiş (copyright boş, `fgdc` boş) | Hover kot, atmosfer/radyasyon modeli, küresel kontur |
| **Küresel jeoloji — Tanaka vd. 2014, USGS SIM 3292, 1:20 M** | **YOK-İNDİR / KULLANICI** | vektör; boyut **doğrulanmadı** | belirtilmemiş → teyit (USGS yayını; kamu malı olması beklenir, **doğrulanmadı**) | Tür sınıfı (volkanik, yayla, kutup, ova) |
| **IAU/USGS Gazetteer of Planetary Nomenclature (Mars)** | **YOK-İNDİR** | nokta/çokgen; boyut küçük (**doğrulanmadı**) | belirtilmemiş → teyit | Adlandırılmış özellik (crater, mons, vallis, chasma, fossae, patera, planum, chaos…) |
| **MGD³ — Mars Global Digital Dune Database** (Hayward vd.) | **YOK-İNDİR / KULLANICI** | vektör; boyut **doğrulanmadı** | belirtilmemiş → teyit | Kum tepesi (küresel) |
| Gale 1 m DEM (`Gale_DEM_SMG_1m`) | **YOK-İNDİR** (Trek ImageServer F32) | 1,687e-5°; kapsam/boyut **doğrulanmadı** | belirtilmemiş | Aday saha |
| Columbia Hills 1 m DEM (`DEM_1m_ColumbiaHills_fixed`) | **YOK-İNDİR** | F32; kapsam **doğrulanmadı** | belirtilmemiş | Aday saha |
| Mars Trek jeoloji WMTS (renk karoları) | **YOK-İNDİR (isteğe bağlı)** | z0..11 | belirtilmemiş | **Yalnız görsel**; birim kodu çıkarımı yapılmaz |
| TES termal atalet / THEMIS gece IR (Putzig & Mellon 2007 vb.) | **KULLANICI (isteğe bağlı)** | ~20 ppd; boyut **doğrulanmadı** | belirtilmemiş | Termal modun gerçek veri alternatifi |
| MSL RAD (Hassler vd. 2014) ölçüm değerleri | **KULLANICI (literatür)** | tek sayılar | belirtilmemiş | Radyasyon modelinin çapası; değer **doğrulanmadı** |
| GRS (Mars Odyssey) element haritaları (Boynton vd. 2007) | **KULLANICI (isteğe bağlı)** | ~5° (≈300 km); boyut **doğrulanmadı** | belirtilmemiş | Kimya (bölgesel bağlam) |
| Çekim yerçekimi/manyetik/kabuk kalınlığı (MRO120D, MGS MAG, InSight modeli) | **KULLANICI (isteğe bağlı)** | 100'lerce km | belirtilmemiş | Jeofizik mod (bölgesel bağlam) |
| CRISM/OMEGA spektral ürünleri | **KULLANICI (isteğe bağlı)** | tek ürün binlerce MB olabilir (**doğrulanmadı**) | belirtilmemiş | Spektral gerçek veri; şu an kapsam dışı |
| NASA Planet Compare g=3,71; NSSDC Mars Fact Sheet | **VAR (SOURCES #10,#11)** | tek sayılar | belirtilmemiş | Hız/atmosfer çapası |
| Mars24 güneş algoritması | **VAR** `geo/mars-sun.js` | formül | belirtilmemiş | Sun yönü, güneşlenme modeli |

**Toplam yeni küresel paket tahmini:** MOLA 8,3 MB + sınıf rasteri ~4 MB (RLE/PNG ile <1 MB) + gazetteer/dune/geoloji vektörleri (basitleştirilmiş) ≈ **15–30 MB** hedef; Git'te ≤100 MB dosya sınırı altında kalınmalı (GitHub; LFS kuralları `.gitattributes`). Bu rakamlar **hedeftir**, indirilen gerçek boyutlar F1'de raporlanır.

### E.2 Görüş modu dürüst sınıflaması (madde 13)

Sınıflar: **[GERÇEK]** repodaki gerçek veriyle · **[İNDİR]** gerçek veri var ama indirilmeli · **[MODEL]** yalnız etiketli modellenmiş/yaklaşık · **[YOK]** veri/model yokluğu nedeniyle eklenemez (şimdilik).

| Mod | Sınıf | Neyle yapılır | Gösterim | Sınır / etiket |
|---|---|---|---|---|
| normal | **[GERÇEK]** | DTM hillshade + HiRISE ortomozaik (Jezero) + Viking (küresel) — mevcut | RGB | Hillshade "ortogörüntü" değildir |
| optical | **[GERÇEK]** (Jezero) | HiRISE 25 cm WMTS (z17 0,318 m/px); küresel: Viking 232 m | RGB | Hizası ±1,5 m (USGS adayında), **aktif DTM ile ölçülmedi** (K3-8: r=0,021); Viking işlenmiş renk |
| thermal | **[MODEL]** (+[İNDİR] TES/THEMIS) | **Göreli günlük ısınma indeksi:** eğim/bakı + Mars24 güneş yönü (`geo/mars-sun.js`) → gün-ışığı alma; sıcaklık (°C/K) **iddia edilmez** | ısı rengi (göreli) | "MODEL — ölçülmüş yüzey sıcaklığı değil"; TES termal atalet indirilirse "bölgesel bağlam" katmanı eklenir |
| spectral | **[YOK]** (zayıf [MODEL] seçeneği) | CRISM/OMEGA/THEMIS **repoda yok** (kaynak taraması). Yalnız Viking RGB bantlarından renk-oranı görünümü yapılabilir | pseudo-renk | Ya "kullanılamıyor" ya da "GÖRSEL YAKLAŞIM — spektral/mineralojik değildir"; **öneri:** ikinci seçenek açıkça etiketli veya gizli (kullanıcı kararı D6) |
| topographic | **[GERÇEK]** yerel + **[İNDİR]** küresel | Yerel: DEM'den kontur (marching squares); küresel bağlam: MOLA 8 ppd | **kontur çizgileri** | Jezero kot aralığı ~46 m (`windowStats`) → kontur 2 m/10 m (SUNUM); MOLA 463 m'de yerel yorum yok; datum `needs_review` |
| geophysical | **[İNDİR]** (aksi hâlde **[YOK]**) | Yerçekimi anomalisi/kabuk kalınlığı/manyetik küresel modeller (100'lerce km) | kontur/ısı | Yerel (EVA) ölçekte anlamsız → yalnız "bölgesel bağlam"; veri yoksa mod gri |
| atmospheric | **[MODEL]** | Barometrik yaklaşım: `P(z)=P0·exp(−z/H)`, çapa NSSDC ortalama 6,36 mbar ve mevsimsel 4,0–8,7 mbar (SOURCES #11); `H` ≈ 11 km **repoda yok → kaynaklanacak/doğrulanmadı**; z = MOLA/DTM kotu | ısı | Yerel pencerede kot farkı ~46 m → harita **neredeyse düzgün** (dürüstçe söylenir); anlamlı olduğu yer küre/saha ölçeği; Jezero anlık ölçümü değildir |
| radiation | **[MODEL]** | Çapa: MSL RAD ölçümü (Hassler vd. 2014; değerler **doğrulanmadı**, [KULLANICI]); atmosferik kolon derinliği (kot) ve DTM'den **gökyüzü görünürlüğü/ufuk engeli** ile göreli ölçekleme | ısı (göreli) | "MODEL — ölçüm değil"; kot-ölçekleme genliği kaynaksız → SENARYO; yerel değişim küçüktür |
| chemical | **[YOK]** nicel; **[GERÇEK]** niteliksel; **[İNDİR]** bölgesel | Jezero'da SIM3464 `Unit_Description/Interpretation` (ör. Njf "mafik bileşim", Goudge vd. atfıyla) kalitatif litoloji; GRS 5° nicel bağlam indirilirse | kategorik/ısı | Konsantrasyon haritası **yerel olarak üretilemez**; yalnız birim yorumu (jeoloji haritası belirsizliği 100–200 m) |

**Karar:** 9 modun tamamı **arayüzde bulunur**; veri durumu rozeti ve "kullanılamıyor" durumu zorunludur. Gerçek veriyle tam çalışanlar: normal, optical, topographic (yerel). Etiketli model: thermal, atmospheric, radiation. Kısmi/kalitatif: chemical. Veri gelene kadar kullanılamaz: geophysical, spectral (veya "görsel yaklaşım").

**Çizim ilkesi:** sürekli dağılımlar (termal, radyasyon, atmosfer, kimya, jeofizik) **renk ısı haritası** (algısal tekdüze, renk körlüğü dostu rampa + lejant + birim); kot/yükselti/çukur/dağ (topographic, jeofizik kontur seçenekleri) **kontur çizgileri**. Her moda "kaynak · çözünürlük · rozet" şeridi. Kaba veri **yeniden örnekleme ile inceltilmez**.

### E.3 Hover/bilgi kaynağı özeti (madde 4)

| Bilgi | Kaynak | Çözünürlük | Durum |
|---|---|---|---|
| Kot (küresel) | MOLA 8 ppd | ~7,4 km/hücre (463 m kaynak, aşağı örneklenmiş) | YOK-İNDİR |
| Landform adı/türü | IAU/USGS Gazetteer | nokta/çokgen | YOK-İNDİR |
| Jeolojik birim sınıfı | Tanaka vd. 2014 (SIM 3292) | 1:20 M | YOK-İNDİR |
| Kum tepesi | MGD³ | vektör | YOK-İNDİR |
| Jezero yerel birim | SIM 3464 | 1:75.000 | **VAR** |
| Renk bağlamı | Viking MDIM 2.1 | 5,2 km/px (z3) | **VAR** |

---

## F. Risk kaydı ve kapsam dışı

### F.1 Risk kaydı

| # | Risk | Olasılık/Etki | Azaltma |
|---|---|---|---|
| R1 | Küresel veri indirme/lisans gecikmesi (Tanaka, gazetteer, MGD³ "belirtilmemiş") | Y/Y | F1'i **kademeli** tasarla: önce MOLA+Viking ile "kot + renk" hover; türler sonradan gelir; lisans yazmıyorsa "belirtilmemiş" olarak göster; yeniden dağıtım kararı kullanıcıda |
| R2 | Yalnız Jezero tam destekli; küre "boş" hissi | Y/O | Aday sahalar (Gale, Columbia Hills) **ayrı** doğrulanır (F2); kürede kapsam işaretleri + açık "veri yok" mesajı; aksi hâlde sessiz sahte arazi **üretilmez** |
| R3 | Süre öncelikli uyarı dilinin "güvenli rota" gibi okunması | O/Y | Sabit metin kalıpları, yasaklı-kelime taraması (F13), `caveatTR` zorunlu |
| R4 | `main.js` büyümesi/çakışma (≈2150 satır) | Y/O | F0'da bölme; Efe `main.js`'e dokunmaz; yalnız `app/` köprüsü; ortak dosyalar tek sahip penceresi |
| R5 | İkinci WebGL bağlamı (küre + arazi) bellek/uyumluluk | O/O | Küre bağlamı FPV'de `dispose`; en çok 2 bağlam; 2D fallback; kalite yöneticisi |
| R6 | Polyline sözleşmesi geçişinin mevcut koridor/ilerleme testlerini kırması | Y/Y | `setRoute` (a→b) korunur, `setRoutePath` eklenir; eski testler değişmeden geçmeli; F4 kabulünde |
| R7 | Hız çarpanı (×80 sim) ile adım atlama/ayak izi kaybı | Y/O | Alt-adımlama (C.7), ≤0,25 sn sim adım; k>3'te animasyon genlik düşürme |
| R8 | Froude/Tobler modeli kaynak doğrulaması yok; Mars giysili yürüyüş verisi yok | Y/O | "MODEL/SENARYO" etiketi; belirsizlik aralığı (0,70–0,91 m/s) UI'de; kullanıcı kararı D5 |
| R9 | Genişletilmiş Jezero penceresinde bellek/süre (95 M hücre ham) | O/Y | Parçalı/2 m aşağı örnekleme; worker; ölçülü bütçe (F2/F4); aksi hâlde 1,7 km pencere kalır |
| R10 | Düşey datum/ortomozaik hizası belirsizliği (K3-5, K3-7, K3-8) çok-saha genişlemesine taşınır | Y/O | Her saha `needs_review` fail-closed; "ortogörüntü hizalı" denmez; D1 kararı F2 öncesi |
| R11 | Kutup/uç enlemlerde Viking doku gerilmesi, kürede sınır dikişi | O/D | Kutup kapakları için özel gölge/çarpıklık notu; hover kutup yakınında "bilgi sınırlı" |
| R12 | Performans: küre + kask + modlar + minimap birlikte kare süresi | O/Y | Bütçe F13'te; mod çizimi 0,06 sn aralıkla; kask CSS-only; ölçüm ≠ varsayım (K2-6 hâlâ açık) |
| R13 | Teslim penceresi/dondurma ile çakışma (K6: 18:00 dondurma, `demo-freeze` yok) | Y/Y | Ayrı dal; mevcut sürümü etiketle; F aşamaları yalnız teslim sonrası/uzatılmış aşama için (doğrulanmadı) |
| R14 | Aday sahalar için Trek ImageServer CORS/hız limiti (`stage26a:27,34`) | O/O | Önceden indirilen paket (script), tarayıcıda doğrudan istek yok |

### F.2 Kapsam dışı (gerekçeli)

- **Canlı telemetri / gerçek Perseverance konumu:** arşiv verisi yalnız bağlam; canlı akış yok (proje ilkesi).
- **Gerçek PLACES izi (Stage 40):** erişim ve çerçeve dönüşümü ayrı iş; bu yol haritasında açılmaz.
- **JP2 ortogörüntü çözücü ve yarım piksel hizası:** ayrı, bloke etmeyen iş (AGENTS.md).
- **Atmosfer sürtünmesi, giysi kütlesi/biyomekanik, metabolik/enerji modeli:** kaynaklı parametre yok → eklenmez; ETA yalnız yürüyüş.
- **Kaya/blok tespiti:** 1 m DTM tek tek kayaları çözmez (cost-model uyarısı); yoğunluk ürünü ayrı.
- **Gerçek termal sıcaklık, element haritası, spektral mineraloji (yerel):** veri yok; mod etiketli/kullanılamıyor.
- **Tüm Mars'ta serbest nokta-nokta EVA rotası:** küresel 1 m DEM yok; kaba DEM'den yerel puan üretilmez. Bu yüzden saha-tabanlı iki kademeli seçim.
- **Saha-arası uzun rota (yüzlerce km):** EVA süre bütçesi (SENARYO `maxRouteDurationS` ≈ 8 sa, kaynaksız) 0,82 m/s'de ≈ 23,6 km üstünü fiziksel olarak karşılamaz.
- **Çok oyunculu ağ, ses, hava durumu animasyonları, Fobos/Deimos:** kapsam dışı (yarışma kalite hedefine katkısı düşük).

---

## G. Kontrol çizelgesi — 14 maddenin aşama eşlemesi

| # | İstek | Birincil aşama | Destek aşamaları | Kabul kanıtı |
|---|---|---|---|---|
| 1 | Küre, döndürme, küreden seçim | **F3** | F1 (doku/hover verisi), F2 (saha listesi), F8 (akış) | F3 kabul 1–6 |
| 2 | Eğim sınırı (yol boyunca) | **F4** | F0 (SENARYO anahtarları), F5 (acil gevşetme) | F4 kabul 1, `validate-slope-cap.mjs` |
| 3 | Sağ panel + tür seçimi + rotadan geçiş | **F3** (panel) + **F4** (via) | F2 (tür kapsamı), F8 (Simüle et → panel kalkar) | F3 kabul 5; F4 kabul 2 |
| 4 | Bölge bilgisi kaydı + hover | **F1** | F2 (saha türleri), F3 (hover UI) | F1 kabul 1–5; F3 kabul 2 |
| 5 | Özellikler güvenliğe etki | **F4** (`safety-index`, C.6 tablosu) | F1 (tür verisi), F9 (gösterim) | F4 kabul 5 |
| 6 | İstenen varış süresi (süre öncelikli), kask uyarısı | **F5** | F4 (güvenlik), F9 (uyarı), F7 (ileri bakış) | F5 kabul 2–5; F9 kabul 4 |
| 7 | Kişi sayısı, ayrı/beraber, dengeli bölüştürme, kişi seçimi | **F6** | F3 (panel), F8 (takip) | F6 kabul 1–6 |
| 8 | Simüle et: zoom → 1. şahıs | **F8** | F3, F7, F12 | F8 kabul 2–3 |
| 9 | Varış süresi (örnekleme yok), Mars g + yürüyüş hızı | **F5** | F2/F4 (uzunluk), F7 (uygulama) | F5 kabul 1,6 |
| 10 | Kask görünümü | **F9** | F11 (görsel), F12 | F9 kabul 1–2 |
| 11 | Sol üst holografik minimap | **F9** | F0 (minimap uzantısı), F10 (modlar) | F9 kabul 3 |
| 12 | Sağ alt hız/otomatik sürüş/20 m kuralı | **F7** (mantık) + **F9** (UI) | F0 (anahtarlar), F5 (hız) | F7 kabul 1–7; F9 kabul 3 |
| 13 | 9 görüş modu (heat/kontur, tek seçim) | **F10** | F1, F2 (veri), F9 (host) | F10 kabul 1–6; E.2 sınıflaması |
| 14 | Görsel kalite, kayıt modu, atıf | **F11** + **F12** | F13 (regresyon/çekim) | F11 kabul 1–2; F12 kabul; F13 kabul 5,8 |

Hiçbir madde boşta değil. **Son aşama F13** bitince proje biter.

---

## H. Doğrulanmayanlar ve karar bekleyenler

**Doğrulanmadı / ölçülmedi** (bu oturumda): testler ve smoke koşulmadı; tarayıcıda hiçbir akış açılmadı; `main.js` içindeki iş akışları (örn. `showSelectedPoint`, `planMinimapRoute`) satır satır izlenmedi, yalnız yapı ve çağrı noktaları okundu; küresel veri kaynaklarının (Tanaka, gazetteer, MGD³, Trek Gale/Columbia DEM) boyut/kapsam/lisansı; Froude/Tobler/Minetti kaynak metinleri; MSL RAD sayısal değerleri; Mars ölçek yüksekliği; DTEEC içinde SIM3464 birimlerinin alan oranları (yalnız bbox kesişimi görüldü); renderer'ın yörünge kamerayla tüm pass'leri hatasız çizdiği (`camera.mode` ayrımı var, çalışma zamanı doğrulanmadı); `canvas.captureStream`/MediaRecorder kalitesi; teslim penceresi ile bu planın ilişkisi.

**Kullanıcı kararları (F aşamalarını bloke eder):**
- **D1** aktif DTM (K3-7: legacy DTEEC mi, USGS adayı `needs_review` mi) — F2 öncesi.
- **D2** Viking lisans/atıf teyidi (K1-4) — küre öncesi (F3/F11).
- **D3** hangi ek sahalar indirilecek (Gale/Columbia Hills/diğer) ve depoda saklama biçimi (LFS vs harici).
- **D4** eğim sınırı onayı (15°/20°, C.1) ve süre-öncelik gevşetme politikası.
- **D5** varsayılan yürüyüş hızı: 1,2 m/s (mevcut) mi, 0,82 m/s (Froude türevi) mi.
- **D6** "spektral" ve "jeofizik" modunun veri gelene kadar gizlenmesi mi, etiketli yaklaşım mı.
- **D7** Tanaka/gazetteer/MGD³/TES/GRS dosyalarının indirilmesi ve yeniden dağıtım lisans teyidi.
- **D8** `maxParty` (öneri 4) ve `maxRouteDurationS` (öneri ≈8 sa) SENARYO değerleri.
