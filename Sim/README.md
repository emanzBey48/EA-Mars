# Marswalk — Interplanetary Survival Guide: Martian Map

Kullanıcı kontrollü, kısa (60–90 sn) bir Jezero yüzey keşif simülasyonu. Astronotu klavyeyle Sol 120 / WB1 waypoint'inden Sol 164 / Roubion waypoint'ine yürütürsünüz. **Mars fizik motoru, canlı NASA telemetrisi, güvenlik veya karar destek aracı değildir.** Jüri ve sınır notları için [`DEMO_NOTES.md`](DEMO_NOTES.md); son kabul kanıtı için [`stage-final-acceptance.md`](stage-final-acceptance.md); canlı yayınlama adımları için [`DEPLOYMENT.md`](DEPLOYMENT.md) dosyasına bakın.

Uygulama klasörü: `Sim/` (depo kökünden `cd Sim`) · İngilizce/Türkçe üst proje tanıtımı: [`../README.md`](../README.md) · 🚀 **Canlı Demo:** <https://emanzbey48.github.io/EA-Mars/>

## Gereksinimler

- **Node.js ≥ 20** (`npm test` ve yerel sunucu için). `npm run smoke` ve tarayıcı betiği için **Node.js ≥ 22** (genel `WebSocket`) ve yerel Edge veya Chrome gerekir.
- npm paketi kurulmaz; çalışma zamanı bağımlılığı yoktur.
- **Veri:** Ekranda gösterilen (aktif) arazi `data/legacy-hirise/dtm_subset.f32` (~7,5 MB, legacy PDS3 yedek); analiz adayı `data/dtm_subset.f32` (~7,6 MB, USGS 1 m). `5c8090c` commit'inden itibaren bu iki ~7,5–7,6 MB `.f32` dosyası düz Git blob'u olarak saklanır; projeyi klonlamak veya çalıştırmak için `git-lfs` gerekmez. Depo dışındaki büyük ham `.IMG` / `.JP2` dosyaları yalnızca `npm run prepare-data` ile `dtm_subset` verisini sıfırdan yeniden üretmek isterseniz gereklidir.

## Çalıştırma

```powershell
cd Sim
node scripts/preflight.mjs   # ön uçuş: veri dosyaları, PNG imzaları ve SHA-256 manifest kontrolleri (HAZIR bekleyin)
npm start                    # http://127.0.0.1:8080/  (PORT ortam değişkeni ile değiştirilebilir)
npm test                     # node:test birim testleri
npm run smoke                # isteğe bağlı: başsız Edge/Chrome ile uçtan uca kontrol (Node ≥ 22); ekran görüntüleri test-output/ içine
```

`prepare-data` (`node scripts/extract-dtm.mjs`) kaynak USGS DTM GeoTIFF dosyasını ister; bu dosya depoda yoktur. `data/` içindeki hazır çıktılar çalışma için yeterlidir; yalnız veriyi yeniden üretmek gerekirse kullanın.

Uygulama veri yoksa da açılır; DTM'ye bağlı göstergeler "Kullanılamıyor" durumunu gösterir. Çalışma anında internet veya PLACES dosyası gerekmez.

### URL parametreleri (koddan doğrulandı)

| Parametre | Değerler | Etki |
|---|---|---|
| `lang` | `tr` (varsayılan), `en` | Arayüz dilini seçer (`?lang=` > `localStorage` `marswalk.lang` > `'tr'`). Sol alttaki **TR \| EN** anahtarıyla da anlık değiştirilebilir (`app/i18n.js`, `app/lang-switch.js`). |
| `demo=1` veya `presentation=1` | — | Sunum modunda açar ve örnek görevi otomatik hazırlar (`main.js`). |
| `view=3d` | — | 3D birinci şahıs görünümünü açar; DTM ve WebGL2 yoksa 2D kalır. |
| `scale` | `1` (varsayılan), `2`, `3` | Dikey ölçek. 1 gerçek kot (1:1); 2 ve 3 görsel abartıdır ve rozetle belirtilir. |
| `shadows` | `off`, `low`, `high` (varsayılan) | Güneş gölge haritası çözünürlüğü: 0 / 1024 px / 2048 px. |
| `horizon` | `off` | Bölgesel MOLA ufkunu kapatır. Diğer değerler ufku açık bırakır. |
| `debug=1` | — | `window.marswalk` test kancasını açar. Yalnız geliştirme ve test için. |
| `testWebGL2Failure=1` | (yalnız `debug=1` ile) | WebGL2 hatasını zorlar; 2D fallback'i sınamak için. |
| `intro=0` | — | Mars küresi giriş ekranını ve tanıtım akışını (kask, holografik minimap, otomatik sürüş, ekip, biyom çipi) hiç kurmaz; eski davranışa (rota kurulum penceresi) döner. `npm run smoke` bu parametreyi kullanır (`scripts/smoke-e2e.mjs`). Varsayılan: giriş ekranı açık. |
| `showreel=1` | — | Küre ekranı açılınca tanıtım gösterisini otomatik başlatır (yalnız sunum/video içindir; `intro=0` ile birlikte etkisizdir). |
| `quality` | `auto` (varsayılan), `high`, `medium`, `low`, `minimal` | Uyarlanabilir kalite yöneticisi; adlandırılmış düzey sabitler (`view/3d/quality-governor.js`). |

`?view=3d`, `?demo=1` ve `?presentation=1` küre ekranını atlar (`main.js` veri yüklendikten sonraki dallanma); yalnız parametresiz (ve `intro=0` olmayan) açılışta küre görünür.

## Kontroller (`public/js/input/input.js` ve `main.js` ile doğrulandı)

| Tuş / eylem | Etki |
|---|---|
| `W` `A` `S` `D` veya ok tuşları | Hareket. 3D'de kamera yönüne göre. |
| `Space` | 3D'de küçük bir simülasyon sıçraması; 2D'de duraklatır/devam ettirir. |
| `P` | Duraklatır / devam ettirir. |
| `Esc` | Fare kilidini bırakır (tarayıcı davranışı); kilit yokken kurulum penceresini veya sunum modunu kapatır; genişletilmiş haritayı küçültür. |
| `M` | 3D görünümde holografik minimap'i ekranın %75'ine büyütür / küçültür (küre ekranı ve kurulum penceresi açıkken çalışmaz). |
| `R` | Yeniden başlatır. Küre ekranı açıkken ve gösteri çalışmıyorken ayrıca tanıtım gösterisini başlatır; gösteri çalışırken durdurur (`main.js`). |
| `+` / `-`, fare tekerleği | Yakınlaştırma. Küre ekranında tekerlek küreyi yakınlaştırır. |
| Sahneye tıklama (3D) | Fare bakışını açar. |

## Mars küresi giriş ekranı ve SİMÜLE ET akışı

Parametresiz açılışta (ve `intro=0` değilken) önce tam ekran bir Mars küresi görünür (`public/js/view/globe/`):

- **Doku:** USGS Astrogeology **Viking MDIM 2.1** renkli küresel mozaik karo piramidi (`data/viking-mdim`; 232 m/px). Doku yüklenemezse prosedürel yedek doku kullanılır; küre yine çalışır. Bu doku ortogörüntü veya kot verisi değildir.
- **Uzay arka planı (`Stage 13: i18n & galaxy background`):** Prosedürel Samanyolu galaksi bandı (`makeGalaxyPixels(1024, 512)`) ve `3200` yıldızlı alan (`makeStarField(3200)`) ile hafif paralaks ve `prefers-reduced-motion` desteği (`view/globe/globe.js`). Harici arka plan görseli kullanılmaz.
- **Dil anahtarı (`TR | EN`):** Ekranın sol alt köşesindeki `TR | EN` segment düğmesi (`app/lang-switch.js`) veya `?lang=tr|en` parametresi ile tüm arayüz Türkçe ve İngilizce arasında anlık değiştirilebilir (`app/i18n.js`, `app/i18n-dict.js`).
- **Dönüş:** Kullanıcı dokunmadıkça küre 5 saniyede bir tam tur döner (`AUTO_SPIN_SECONDS_PER_TURN = 5`); sürükleme dönüşü durdurur, bırakıldıktan ~0,5 s sonra yumuşakça yeniden başlar. Fare üzerine gelmek dönüşü durdurmaz.
- **Hover:** İmleç altındaki nokta için yakın isimli bölge varsa onun adı ve türü, yoksa "Mars yüzeyi" ve enlem/boylam yazılır; ipucu "yaklaşık, sunum amaçlı" notunu taşır. Bölge listesi ve konumları yaklaşıktır (`view/globe/regions.js`).
- **Başlangıç / varış:** Küre üzerinde herhangi bir noktaya tıklanır: ilk tıklama başlangıç, sonrakiler varış olur (isimli bölgeye yapışmaz; ad, 1500 km içindeki en yakın bölgeyi yalnız bağlam olarak ekler). Küre üzerinde işaretçiler ve aralarında büyük daire yayı çizilir; yay yalnız görseldir, rota değildir.
- **Sağ görev paneli (cam efektli):** Başlangıç / varış (temizle), ilgi çekici bölge türü çipleri, istenen varış süresi (dakika), kişi sayısı (1–4), birlikte / ayrı ilerleme, takip edilecek kişi ve **SİMÜLE ET**. Başlangıç ve varış seçilmeden veya aynı bölge olduğunda düğme pasiftir. Tür başına tahmini süreler **senaryo parametresidir**, kaynaklı değildir.
- **SİMÜLE ET:** Küre varış noktasına uçar (~1,2 s), ardından uygulama 3B kask moduna geçer. Seçimler bağlam ve etikettir; **simülasyon sahası yine yalnız Jezero HiRISE yamasıdır.** Serbest tıklanan bir nokta yamanın içine ve geçerli DTM hücresine düşüyorsa yerel başlangıç/varış olarak kullanılır; isimli bölge seçimi veya yama dışı nokta varsayılan Sol 120 → Sol 164 noktalarına döner ve ekranda "Simülasyon sahası: Jezero HiRISE" bilgi satırı çıkar (`app/free-start.js`).
- **Kask modu:** Kask çerçevesi, vinyet/buğu/parlama katmanları ve uyarı çipi (`view/helmet.js`). İstenen süre rota tahminini aşarsa "planlama göstergesi" dilinde bir uyarı verilir (12 s). Kaskta O₂ veya giysi sıcaklığı **gösterilmez** (ölçüm kaynağı yoktur). "Küreye dön" düğmesi küre ekranını geri getirir.
- **Holografik minimap:** Kask modunda sol üstte; kullanıcı `M` ile %75 boyuta büyütebilir. Rota çizimi, otomatik sürüş kontrolleri ve görüş modu çubuğu bu bölgededir.
- **Ekip yoldaşları:** Kişi sayısı ≥ 2 ise takip edilen kişi oyuncudur (gerçek simülasyon); diğerleri aynı rotada senaryo hızıyla ilerleyen yoldaşlardır (`simulation/crew-sim.js`). **Yalnız 2B minimap'te** gösterilir (3B sahneye eklenmez); sağ alttaki ekip şeridi kalan mesafeyi yazar.
- **Biyom çipi:** Üst-ortada, anlık gerçek jeolojik birimin (USGS SIM 3464 birim adı) sade Türkçe adı (ör. "Antik delta · düz"). Eşleme ad kalıplarına dayanan sezgiseldir; birim yoksa çip hiç gösterilmez (`app/biome-label.js`). Jeoloji belirsizliği (~100–200 m) geçerlidir; mineraloji veya geçilebilirlik iddiası değildir.
- **Otomatik sürüş:** Sağ alttaki panelden açılır. Zaman hızı 0,5–10× (0,5 adım), Durdur/Devam ve "Rotayı konumdan yeniden çiz" bulunur. **20 m kuralı:** Otomatik sürüş açıldığında oyuncu rota çizgisine ≤ 20 m uzaklıktaysa çizgiye katılır; daha uzaksa rota mevcut konumdan yeniden planlanır (`simulation/auto-drive.js` `rejoinThresholdM`). Hız çarpanı sunum/zaman ayarıdır; fizik parametresi veya güvenlik iddiası değildir. Rota Chaikin ile yumuşatılarak yalnız çizim/takip için kullanılır.
- **Tanıtım gösterisi (showreel):** `?showreel=1` veya küre ekranında `R`. Adımlar: küre döner → başlangıç Jezero, varış Olympus Mons → SİMÜLE ET → otomatik sürüş → görüş modları (Topo, Termal, Radyasyon, Normal) → 3× hız → kapat. Çalışırken `R` durdurur. Yalnız sunum içindir.

### Görüş modları (holografik minimap)

Tek seferde tek mod (`view/minimap/view-modes.js`). Her mod veri kökenini taşır; veri olmayan modlar (Jeofizik, Kimyasal) arayüzde listelenmez ve uydurma değer çizilmez. No-data hücreler hiçbir modda boyanmaz.

| Mod | Veri kökeni | Ne gösterir |
|---|---|---|
| Normal | Gerçek DTM | Minimap olduğu gibi. |
| Optik | Gerçek DTM | DTM hillshade; **ortogörüntü değildir.** |
| Topo | Gerçek DTM | Gerçek DTM kotlarından kontur çizgileri; no-data'dan çizgi geçmez. |
| Termal | Senaryo modeli ("model" rozeti) | Eğim/bakı ve varsayılan güneş açısından (35°, 13:00) göreli ısınma indeksi; **ölçüm değildir.** |
| Atmosfer | Senaryo modeli | Kottan barometrik göreli basınç gradyanı (ölçek yüksekliği 11 km senaryo parametresi). |
| Radyasyon | Senaryo modeli | Göreli, illüstratif gösterge; **MSL RAD ölçümü değildir.** |

### Görsel kaynak atfı

- Küre dokusu: USGS Astrogeology Viking MDIM 2.1 renkli küresel mozaik.
- NASA/JPL-Caltech Mars 2020 (Perseverance) ham görüntüleri yalnız **görsel referans** olarak kullanılmıştır; uygulamadaki dokular (giysi, yüzey ayrıntısı, kask katmanları) **prosedürel** üretilir, bu görüntülerden kopyalanmaz. Galeri önizlemeleri ayrıca ham arşiv JPEG'leridir (`SOURCES.md` #7).

## Statik Paketleme ve Canlıya Alma

Uygulama çalışma zamanında sunucu tarafı mantığa ihtiyaç duymayan %100 statik bir ES modül sitesidir (`public/` + `data/` + `SOURCES.md`). `server.mjs` yalnızca yerel geliştirme sunucusudur.

```powershell
cd Sim
node scripts/preflight.mjs
npm run build:pages
```

`npm run build:pages` (`scripts/build-pages.mjs`) komutu dağıtıma hazır tüm dosyaları `Sim/dist/` klasörüne toplar. Tüm varlık yolları alt-dizin göreli (subpath-relative) çözüldüğünden hem kök alan adlarında hem `/<repo-adı>/` alt yollarında sorunsuz çalışır.

- **GitHub Pages:** Depo kökündeki `.github/workflows/deploy-pages.yml` iş akışı (`Settings → Pages → Source: GitHub Actions`).
- **Cloudflare Pages:** `npx wrangler pages deploy dist --project-name=marswalk` (veya GitHub Actions değişken/gizlileri: `CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- **Netlify / Vercel:** Depo kökündeki `netlify.toml` (`base = "Sim"`, `command = "npm run build:pages"`, `publish = "dist"`) ve `vercel.json` ile otomatik algılanır.

Ayrıntılı yönergeler ve önizleme adımları için [`DEPLOYMENT.md`](DEPLOYMENT.md) dosyasına bakın.

## Jüri / demo akışı (60–90 sn)

1. `npm start` ardından `http://127.0.0.1:8080/?demo=1` açın. Sunum modu açılır ve Sol 120 → Sol 164 rotası hesaplanır.
2. "Örnek Görevi Başlat" ile 3D birinci şahıs görünüm ve turkuaz rota şeridi başlar. WASD ile yürüyün, `Space` ile sıçrayın.
3. Sunum modundan çıkmak için "Kapat" düğmesini kullanın veya fare kilidi yokken `Esc`'e basın (`main.js`); sağ panelde rota tercihini (dengeli / en kısa / en düz) değiştirip minimap'te "Mars globali göster" ve "Kapsama sığdır" düğmelerini deneyin.
4. Ayrıntılı sınır ve sayı notları için [`DEMO_NOTES.md`](DEMO_NOTES.md).

## Özellikler

1. **HiRISE DTM arazi tabanı (aktif: legacy yedek):** Gösterilen arazi PDS3 DTEEC DTM penceresidir (1669×1129, ~1,01 m/px). USGS Mars 2020 TRN 1 m penceresi (1676×1135) düşey datum kanıtı olmadığı için `needs_review` kalır, UI'de kullanılmaz ve analiz belgelerinde ölçülmüştür. 3×3 Horn gradyanı ile anlık eğim.
2. **HiRISE 25 cm WMTS ortomozaik kaplaması:** z17 (0,318 m/px) ve z14 (2,544 m/px) karoları; Hibrit / Ortomozaik / Hillshade modları. Hizalama ±1,5 m belirsizlikle gösterilir; yarım piksel hizası kanıtlanmadı. Hizası USGS adayı penceresinde ölçüldü; aktif legacy DTM ile hizası ölçülmedi (K3-8).
3. **A* EVA yürünebilirlik planlayıcısı:** Eğim, pürüzlülük ve veri geçerliliğine dayalı maliyet; minimap'te ısı haritası. Planlama göstergesi; güvenli rota sertifikası değildir.
4. **Rota tercihleri:** Dengeli, en kısa, en düz (`gentle` / `flattest`). Ağırlıklar `route/route-compare.js` içinde senaryo parametresidir.
5. **Minimap ve sürükle-bırak uçları:** Başlangıç/bitiş seçimi, tercih değişince bayat plan gösterilmez (`route/plan-response-state.js`). No-data ve kenar (`EDGE_UNKNOWN`) hücreleri seçilemez (kod ve birim testi; tarayıcı kanıtı için [`stage-final-acceptance.md`](stage-final-acceptance.md)).
6. **Viking MDIM 2.1 global bağlam:** 232 m/piksel renkli küresel mozaik, z0–z3 karo piramidi; "Mars globali göster" ile küresel görünüm. Viking verisi renk bağlamıdır; kot veya ortogörüntü değildir.
7. **Bölgesel MOLA ufku:** `data/regional-dem/` (~463 m/piksel, 384×384). Datum `needs_review`; yürünebilirlik puanı üretmez, yerel DTM ile birleştirilmez. `?horizon=off` ile kapatılır.
8. **1× gerçek dikey ölçek:** Varsayılan; 2× ve 3× görsel abartı seçenekleri ayrı rozetle gösterilir.
9. **Güneş, gökyüzü ve gölge (görsel):** Mars gökyüzü kubbesi, doğrusal ışık ve ACES ton eşleme, güneş gölge haritası. Sunum parametresidir; ölçülmüş değildir.
10. **Ayak izleri ve parlak rota şeridi (görsel):** Yürüyüşte DTM'den örneklenen ayak izleri; rota şeridi. İzler regolit mekaniği iddiası taşımaz.
11. **Birinci şahıs astronot:** Göz hizasında eldiven ve ön kollar; aşağı bakışta gövde ve bacaklar kademeli görünür. Yürüme salınımı, nefes, Stage 13 EVA loping/zıplama kinematiği (`view/3d/astronaut-rig.js`) ve yumuşak iniş kamera hareketi (`view/3d/camera-motion.js`).
12. **Mars yerçekimi zıplaması:** 3,71 m/s² (NASA küresel referansı), v0 = 2,4 m/s oyun girdisi; ~1,3 s havada, ~0,78 m tepe; inişte 0,25 s darbe sönümü. Atmosfer sürüklemesi yoktur.
13. **USGS SIM 3464 jeoloji haritası:** 1:75.000 formasyon sınırları ve kontağa anlık mesafe; belirsizlik bildirimli.
14. **Perseverance arşiv fotoğrafları ve sürüş izi:** Sol 120 ve Sol 164 durakları için ham JPEG önizlemeleri; arşiv izi rover izidir, insan rotası değildir.
15. **2D Canvas fallback:** WebGL2 yoksa veya 2D seçilirse tüm katmanlar ve rota planlaması 2D'de çalışır. Giriş küresi WebGL yoksa otomatik atlanır; ayrıntı için `stage-final-audit.md` (c).
16. **Mars küresi giriş ekranı, kask modu, holografik minimap, görüş modları, otomatik sürüş, ekip, biyom çipi ve TR|EN dil seçimi:** Yukarıdaki "Mars küresi giriş ekranı" bölümünde; küre seçimleri bağlam/etikettir, simülasyon sahası Jezero HiRISE yamasıdır.

## Yapı

| Dosya | Görev |
|---|---|
| `public/js/config.js` | Senaryo değerleri (hız 1,2 m/s, zaman hızlandırma ×8, koridor ±10 m, yerçekimi 3,71), waypoint'ler, harita çerçevesi, kaynaklar |
| `public/js/main.js` | Uygulama koordinatörü: veri yükleme, her karede `WorldSnapshot` üretimi, renderer ve HUD bağlantısı |
| `public/js/geo/` | Saf geometri: `geo.js` (projeksiyon, Horn gradyanı), `relief-metrics.js`, `viking-mosaic.js`, `trek-raster.js`, `regional-dem.js`, `geology.js`, `traverse.js` |
| `public/js/surface/` | Raster okuma, manifest doğrulama, `SurfaceProvider` ve fallback seçimi (`layers.js`, `registry.js`, `ortho-layer.js`, `thermal.js`) |
| `public/js/simulation/sim.js` | Oyuncu, senaryo saati, zıplama ve iniş fiziği, snapshot sözleşmesi |
| `public/js/route/` | A* planlayıcı (`cost-model.js`, `route-service.js`, `pathfinder.worker.js`), `route-compare.js` (tercihler), `plan-response-state.js`, `legacy-grid-plan.js` (K3-10) |
| `public/js/view/render.js` | 2D Canvas çizimi (yalnız snapshot ve hazır varlıklar alır) |
| `public/js/view/3d/` | WebGL2: `renderer.js` (render pass'leri), `camera.js`, `camera-motion.js`, `terrain-mesh.js`, `astronaut-rig.js`, `marker-mesh.js`, `footprint-trail.js`, `route-ribbon.js`, `horizon-mesh.js`, `shadow-map.js`, `sky-model.js`, `terrain-shading.js`, `quality-governor.js` |
| `public/js/view/minimap/minimap.js` | Minimap: Viking global, HiRISE yerel katman, rota planlama |
| `public/js/view/hud.js` | Snapshot okuyan HUD ve uyarı şeritleri |
| `public/js/input/input.js` | Klavye, fare tekerleği ve buton bağlamaları (simülasyon kuralı içermez) |
| `public/js/view/globe/` | Mars küresi (`globe.js`, WebGL + galaksi arka planı), giriş ekranı (`index.js`), sağ görev paneli (`globe-panel.js`), bölgeler, serbest nokta, ekip bölüşümü |
| `public/js/app/` | Tanıtım akışı (`demo-flow.js`), küreden yama noktası (`free-start.js`), biyom adı (`biome-label.js`), gösteri (`showreel.js`), iki dillilik (`i18n.js`, `i18n-dict.js`, `lang-switch.js`) |
| `public/js/simulation/auto-drive.js`, `crew-sim.js` | Rota takibi (0,5–10×, 20 m kuralı) ve 2B ekip yoldaşları; saf mantık |
| `public/js/view/` (`helmet.js`, `auto-drive-controls.js`, `crew-strip.js`, `biome-chip.js`, `minimap/view-modes.js`, `minimap/view-mode-bar.js`) | Kask katmanı, otomatik sürüş paneli, ekip şeridi, biyom çipi, görüş modları |
| `scripts/` | `extract-dtm.mjs`, `preflight.mjs`, `build-pages.mjs` (statik paketleme), `smoke-e2e.mjs`, `relief-report.mjs`, `ingest-viking-mosaic.mjs`, `fetch-regional-dem.mjs`, `validate-ortho-registration.mjs`, `build-sources-list.mjs` |
| `server.mjs` | Node standart kütüphanesiyle yerel geliştirme statik sunucusu (`127.0.0.1`) |

### 3D render pass sözleşmesi

`renderer.js` içinde `renderPass` değerleri: 0 arazi · 1 işaretçi ve rota kılavuzları · 2 astronot rig'i ve birinci şahıs view-model · 3 gökyüzü · 4 gölge derinliği (erken dönüş) · 5 ayak izleri · 6 rota şeridi · 7 bölgesel ufuk. Yeni pass'ler 8 ve sonrası kullanır.

## Koordinatlar ve veri kararları

- **Yerel düzlem:** x doğu, y kuzey, metre; orijin Sol 120 / WB1. Equirectangular, küre R = 3396,190 km, merkez meridyen 0°, standart enlem 0°, planetosentrik. Ölçek ekvatorda doğrudur; ~18,4°K'da doğu-batı mesafeleri ~%5,4 fazla çıkar.
- **Piksel dönüşümü (PixelIsArea):** `X = 4577366,5 + col`, `Y = 1106617,5 − row`.
- **Aktif DTM (karar bekliyor, K3-7):** Ekranda legacy PDS3 DTEEC yedeği (`data/legacy-hirise/dtm_subset.json`) gösterilir. Çerçeve dosyadan: EQUIRECTANGULAR, PLANETOCENTRIC, EAST, rotasyon 0; küre yarıçapı 3394,8398133163 km; merkez meridyen 77,44°E; standart enlem 15° (`crsText`); map scale 1,0096633268711 m/px; line/sample projection offset 1088495,5 / 3210,5. Etiket datumu: "Mars 2000 Datum (martian equipotential surface)". USGS 1 m adayı (`data/dtm_subset.json`) düşey datum kanıtı olmadığı için reddedilir (`surface/registry.js` `resolveActiveProvider`, neden `needs_review_verticalReference`). Legacy'nin kalması mı, USGS'nin `needs_review` etiketiyle etkinleşmesi mi, ürün kararıdır.
- **Düşey datum (USGS adayı):** Mars eşpotansiyel yüzeyi (MOLA areoid / DeltaGeoid). `data/dtm_subset.json` içinde `verticalDatumVerified: false` yazar; uygulama kodunda `config.js` bu değeri `true` gösterir (bkz. aşağıdaki sınırlar).
- **No-data:** `0xFF7FFFFB` tam bit deseni `no_data`; geçerli aralık dışı `invalid`. Asla 0 ile değiştirilmez. Eğim, 3×3 pencerede bir hücre bile geçersizse üretilmez.
- **Kapsam:** Tarayıcıya yalnız rota çevresindeki pencere yüklenir; dışı `out_of_bounds` olarak raporlanır. Aktif legacy penceresi 1 884 301 geçerli hücre, 0 no-data; USGS adayı penceresi 1 902 260 geçerli hücre, 0 no-data.
- **Rota kökeni:** İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değildir. PLACES kullanılmadı.

## Değer etiketleri

- **Analiz adayı (UI'de değil):** USGS Mars 2020 TRN HiRISE DTM mozaiği (`JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40`); lisans CC0 1.0 (`SOURCES.md` #1).
- **Aktif yedek:** Legacy PDS3 DTEEC DTM (`DTEEC_045994_1985_046060_1985_U01`); lisans belirtilmemiş (`SOURCES.md` #2).
- **Ölçülen [ADAY]:** USGS adayı penceresinde kot aralığı 44,84 m; eğim P50/P90/maks 3,11°/7,54°/35,77° (`stage35-scale-audit.md`). Aktif legacy penceresinde bu eğim dağılımı ölçülmedi.
- **Senaryo:** hız, zaman hızlandırma, koridor, yürünebilirlik eşikleri (20° vb.), rota tercih ağırlıkları.
- **Sunum:** gökyüzü ve ton, gölge, ayak izi, şerit, kamera salınımı, giysi malzemesi, abartı seçenekleri.

Tüm kaynak, lisans ve birim bilgileri [`SOURCES.md`](SOURCES.md) dosyasındadır (`scripts/build-sources-list.mjs` ile üretilir). Kaynakta lisans yazmayan alan **belirtilmemiş** olarak kalır; 14 kaynaktan 13'ünde lisans belirtilmemiştir.

## Bilinen sınırlar

- **Yürünebilirlik:** Planlama göstergesidir. Güvenli rota sertifikası değildir. Eşikler senaryo parametresidir.
- **Rota süresi ve saat ayrımı:** Rota tahmini ve simülasyon aynı senaryo hızını (`1,2 m/s`, `config.js` `SCENARIO.walkSpeedMps` → `route-service.js`) kullanır; arayüzde simülasyon saati ile duvar saati (`8×` / uçuşta `2×`) ayrı gösterilir (`DEMO_NOTES.md` §4).
- **"En düz" tercihi:** Maksimum eğimi dengeli tercihten düşürmeyebilir (K3-10 sonrası UI özetinde en kısa 11,7°, dengeli 9,8°, en düz 9,5°; K3-10 öncesi 14,1° / 9,8° / 10,1°; USGS adayında 10,64° / 9,81° / 9,27°). Tercih adı ne ölçtüğünü tam açıklamaz.
- **Aktif DTM ↔ analiz DTM'i:** UI aktif legacy DTM ile çalışır; rota ve eğim analizlerinin çoğu USGS adayı penceresinde yapıldı. Analizlerin legacy üzerinde yeniden koşulması K3-9 ve K3-10 kapsamında izlenmektedir.
- **Ortomozaik hizası:** ±1,5 m belirsizlik (USGS adayı penceresinde ölçüldü); aktif legacy DTM ile hizası **ölçülmedi**; yarım piksel hizası kanıtlanmadı. `hud.js:104` uyarısı WMTS katmanıyla çelişkili görünebilir.
- **Viking:** Renk bağlamıdır (232 m/px). Lisans "belirtilmemiş"; teyit bekliyor (K1-4).
- **MOLA ufku:** Datum doğrulanmadı (`needs_review`); uzak silüet alçak ve bulanık, bölgesel bağlam olarak sunulur.
- **Datum bayrağı:** `config.js` `verticalDatumVerified: true`; `data/dtm_subset.json` (USGS adayı) `false`. Aktif legacy etiketinin datum ifadesi 38A denetiminde incelenmedi. Kanıt eklenene kadar mutlak kot iddiası yapılmaz (K3-5, açık).
- **Görsel kalite:** Gölge yumuşak; eller kalın; uzak ufuk silüeti alçaktır. Bunlar sunum tercihleridir, ölçülmüş değildir.
- **Göz yüksekliği:** Kod `1,48 m` (`view/3d/camera.js:9`); eski bir commit mesajı `1,75 m` diyor. Kod esas alınır; suit ölçümü yoktur.
- **Atmosfer:** Mars basıncı ve yoğunluğu (NSSDC ortalama/mevsimsel) referanstır; hareket fiziğine sürükleme eklenmemiştir.
- **Render:** Ortogörüntü JP2 çözücüsü yoktur; DTM hillshade ve WMTS karoları kullanılır.
- **Kabul:** `npm run smoke` ve tam tarayıcı kabulü [`stage-final-acceptance.md`](stage-final-acceptance.md) içinde işaretlidir.

## Doğrulama

Güncel ağacın doğrulanması için şu komutları çalıştırın (bu belge güncelleme turunda testler yeniden çalıştırılmadı):

- `node scripts/preflight.mjs` — Node sürümü, veri varlığı ve SHA-256 manifest doğrulaması (`HAZIR` beklenir).
- `npm test` — `node --test "test/*.test.mjs"` birim test paketi.
- `npm run smoke` — İsteğe bağlı başsız Edge/Chrome E2E kontrolü (Node ≥ 22 gerektirir; ekran görüntülerini `test-output/` içine yazar).

Tarihsel kayıtlar: [`stage-final-acceptance.md`](stage-final-acceptance.md) (15 Kasım 2026) ve git commit geçmişi (`c9da091`: 723 birim testi / 38/38 smoke; `9a03250`: smoke 38/38; son özellik commit'i `6a6a27e`: Stage 13 i18n ve galaksi arka planı).

## Viking MDIM 2.1 yerel karo paketi

Uygulama `data/viking-mdim/manifest.json` ve küçük `tiles/` ile Jezero bölgesel PNG çıktılarını varsa kullanır. Çıktılar yoksa veya bir karo yüklenemezse global katman `unavailable` olur; yerel HiRISE minimap ve diğer akışlar çalışmayı sürdürür. "Mars globali göster" küresel görünümü açar; "Kapsama sığdır" Jezero'ya döner. 232 m/piksel bölgesel mozaik yalnız renkli bağlam sağlar; yerel yürünebilirlik puanı üretmez.

12,7 GB kaynak `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` uygulamanın çalışması için gerekmez ve git'e eklenmez. Kaynağı hazırlamak için `data-external/` klasörüne koyup ingest betiğine `--input` ile açıkça verin:

```powershell
node scripts/ingest-viking-mosaic.mjs --input data-external/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif --out data/viking-mdim
```

## Kaynaklar

- USGS Astropedia TRN HiRISE DTM: https://doi.org/10.5066/P9REJ9JN
- Fergason vd. 2020 (LPSC #2020): https://www.hou.usra.edu/meetings/lpsc2020/pdf/2020.pdf
- NASA Mars yerçekimi referansı (Planet Compare): https://solarsystem.nasa.gov/planet-compare/?intent=121
- Mars 2020 Initial Reports: https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf
- PLACES (kullanılmadı): https://pds-geosciences.wustl.edu/missions/mars2020/places.htm

Görüntü ve veri: NASA / JPL-Caltech / University of Arizona / USGS Astrogeology Science Center (ürün bazında atıflar [`SOURCES.md`](SOURCES.md) dosyasındadır).
