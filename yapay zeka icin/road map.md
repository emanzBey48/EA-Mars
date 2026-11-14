# Marswalk — Tam Proje Yol Haritası

**Son güncelleme:** 14 Kasım 2026 (gece — `04f12f4..a135d08` commitleri sonrası güncel durum ve sonraki aşamaların iş bölümü)
**Proje:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*  
**Bu belge:** Kodlama planı ve karar kaydıdır; uygulama/test çalıştırma kaydı değildir.

## Durum etiketleri ve bilgi kaynağı

- **TAMAMLANDI — dosya/kaynakla:** Güncel dosyalar veya birincil kaynak bunu destekliyor.
- **TAMAMLANDI — kullanıcı bildirimi:** Kullanıcı tamamlandığını söyledi; bağımsız doğrulama yapılmadı.
- **AÇIK:** İş sürüyor veya teslimi henüz kodda görünmüyor.
- **BEKLEMEDE:** Bağımlılık/etkinlik zamanı gelene kadar ertelendi.
- **KULLANICI BİLDİRDİ:** Kullanıcı tarafından iletilen tarih/test bilgisi; bağımsız doğrulama değildir.

**[KULLANICI BİLDİRDİ]** Etkinlik tarihleri 14–15 Kasım 2026 olarak bildirildi; bu tarih bilgisi resmi takvimden bağımsız doğrulanmış değildir.

**[KULLANICI BİLDİRDİ]** Alparslan regresyon kontrollerinin tümünün geçtiğini söyledi. Ayrıca 13 Kasım'da kullanıcı simülasyonun açıldığını, arayüzde “Ortogörüntü kullanılamıyor (JPEG 2000 çözülemiyor)” uyarısını gördüğünü ve mevcut 3D görünümün hedef FPS deneyimine yakın olmadığını bildirdi. Bu kullanıcı gözlemleri bağımsız runtime kabulü değildir.

## ÜRÜN YÖNÜ GÜNCELLEMESİ — Minimap, otomatik rota ve tüm Mars kapsamı (14 Kasım 2026, akşam)

**[KULLANICI/EKİP KARARI]** Proje yalnız geçmişteki Perseverance sürüşünü yeniden oynatan bir simülasyon olmaktan çıkar. Hedef: (1) Google Maps benzeri bir **2D minimap** üzerinde kullanıcı başlangıç ve bitiş noktası seçer; (2) uygulama, yol üzerindeki her konumun **insan yürüyüşüne uygunluğunu puanlayan** (eğim vb.) bir maliyet modeliyle **en mantıklı ve kısa yolu otomatik üretir**; (3) NASA Mars Trek (`trek.nasa.gov/mars`) katmanları ve elimizdeki jeolojik bilgilerle **tüm Mars yüzeyi** algoritmanın kapsamına girer. Bu bölüm, aşağıdaki tüm eski "güncel/sıradaki" ifadelerinin önündedir; eski bölümler tarihsel kayıt ve açık iş listesi olarak kalır.

### Karar değişikliği: "güvenlik skoru yok" kuralı → şeffaf yürünebilirlik puanı

Önceki kural "güvenlik skoru üretme" idi. Yeni karar: **EVA yürünebilirlik puanı** üretilir, ancak şu koşullarla:

- Puan bir **planlama yardımcısıdır**; "güvenli rota" sertifikası veya operasyonel karar değildir. UI metni: "Planlama göstergesi — nihai rota kararı ekip ve görev kontrolündedir."
- Her bileşenin (eğim, pürüzlülük, veri kapsamı, jeoloji) **formülü, girdisi, birimi ve kaynağı** görünür olur; kullanıcı bir hücrenin puanının neden o olduğunu açabilir.
- Eşikler (ör. en yüksek yürünebilir eğim) birincil kaynakla belgelenir. Kaynak bulunana kadar değer **"senaryo parametresi"** etiketiyle UI'da ayarlanabilir kalır; NASA eşiği gibi sunulmaz. Rover hareket limitleri insan için kullanılmaz.
- **Bilinmeyen veri asla güvenli sayılmaz:** no-data, kapsam dışı ve doğrulanmamış katman hücreleri geçilemez ya da "bilinmiyor" olarak işaretlenir; 0'a veya ortalamaya çevrilmez.
- **Çözünürlük dürüstlüğü:** İnsan adımı ölçeğinde yürünebilirlik yalnız ~1 m DTM (HiRISE) bulunan yerlerde hesaplanır. Küresel/bölgesel kaba DEM'lerden (yüzlerce metre/piksel) çıkan eğim yerel eğimi olduğundan düşük gösterir; bu katmanlarda çıktı "bölgesel ön planlama" olarak etiketlenir, yürünebilirlik puanı olarak sunulmaz.

**Belge uyumu:** `AGENTS.md` ve `yapay zeka icin/SYSTEM_PROMPT.md` hâlâ "güvenlik skoru üretme" diyor. Bu karar entegrasyon sahibi (Alparslan) onayıyla o belgelere de işlenmelidir; işlenene kadar ajanlar bu bölümü güncel ürün kararı olarak uygular.

### Mimari: çok çözünürlüklü veri katmanları

| Kat | Kapsam / çözünürlük | Aday kaynak (Mars Trek kataloğunda ve birincil kayıtta doğrulanacak) | Kullanım |
|---|---|---|---|
| **K0 — Küresel** | Tüm Mars, yüzlerce m/piksel | MOLA MEGDR DEM (~463 m/px), HRSC-MOLA birleşik DEM (~200 m/px), küresel jeoloji haritası (Tanaka vd. 2014, USGS SIM 3292, 1:20.000.000), CTX/THEMIS görüntü mozaikleri | Saha seçimi, bölgesel bağlam, kaba erişilebilirlik; **yürünebilirlik puanı değil** |
| **K1 — Bölgesel** | Seçili bölge, ~5–20 m | CTX DEM/ortho (varsa), bölgesel jeoloji haritaları (ör. SIM 3464 Jezero, 1:75.000) | Bölgesel rota ön planı, koridor daraltma |
| **K2 — Yerel (EVA)** | ~1 m ve altı | HiRISE DTM/ortho (Jezero mevcut; diğer sahalar Mars Trek/HiRISE kataloğuna göre) | **Yürünebilirlik puanı ve otomatik EVA rotası** |

- **Koordinat:** Küresel düzlem Mars 2000 küresi (R = 3.396.190 m) üzerinde planetosentrik enlem/boylam; Mars Trek bağlantısındaki `EPSG:104905` (Mars 2000 coğrafi) referansı doğrulanır. Her yerel saha kendi yerel metre düzlemine `geo/` adaptörüyle bağlanır; CRS/datum bilinmeyen katman örneklenmez.
- **Kot verisi:** Rota hesabı için **ham kot (float) rasterı** gerekir; renkli görselleştirme karolarından kot okunmaz. Mars Trek veya USGS Astropedia'nın indirilebilir DEM ürünleri ve erişim yolu (ve CORS) doğrulanır; tarayıcı erişemiyorsa `server.mjs` önbellekli vekil ya da önceden hazırlanmış saha paketleri kullanılır.
- **Atıf/lisans:** Her katman kaynak, ürün kimliği, çözünürlük ve lisans alanını taşır; kaynakta lisans yoksa "belirtilmemiş" yazılır, uydurulmaz.

### Yeni commitlerle gelen güncellemeler (`04f12f4` → `a135d08`)

**[DOSYA/KAYNAKLA DOĞRULANDI — 14 Kasım 2026, gece]** Son yol haritası commit'inden (`3ba15da`) sonra depoya aşağıdaki kod güncellemeleri eklendi (bu turda yalnızca statik kaynak/diff incelemesi yapıldı; test, smoke veya tarayıcı çalıştırılmadı):

1. **Hareket düzeltmeleri ve arşiv katmanlarının entegrasyonu (`04f12f4` — Alparslan):**
   - **H1 düzeltildi (`sim.js`):** Geçerli daha alçak zemin örneğinde `heightAboveReferenceM > 0` kaldığında `airborne = true` atanarak havada asılı kalma giderildi; yerçekimi düşüşü geçerli zemine inene kadar sürer, no-data üzerinde sahte temas kurulmaz.
   - **H2 düzeltildi (`sim.js`):** `PHASE.PAUSED` iken `stepFirstPerson` ve `resolveSurfaceContact` erken döner; havadayken duraklatmada yatay/düşey momentum sıfırlanmaz.
   - **H4 düzeltildi (`main.js`):** Kamera kafa salınımı (head-bob) eşiği `astronaut-rig.js` ile aynı `0,04 m/s` değerine çekildi.
   - **H5 ve Aşama 19B tamamlandı (`main.js`, `sim.js`, `hud.js`):** Runtime snapshot `toGeologySnapshot` (12 alanlı `GEOLOGY_SNAPSHOT_CONTRACT`), `createGeologicContactField` ve `nearestGeologicContactM` fonksiyonlarını kullanır; HUD kaynak/DOI/lisans (`not_stated`)/belirsizlik (`100–200 m`) ve kontak mesafesini snapshot'tan gösterir.
   - **Aşama 20B tamamlandı (`view/traverse-layer.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `index.html`):** MMGIS arşiv Perseverance sürüş izi (`Sol 116 Site 4 Drive 1250 → Sol 157 Site 6 Drive 0`) ve ara sol dikmeleri (`combineTraverseMarkers`) 2D Canvas, 3D WebGL2 (no-data boşluklarında çizgi kırılarak) ve minimap katmanlarına bağlandı; D1/D2 sol ayrımı ("Sol 120 ve 164 görüntü kayıtlarına aittir") arayüz metnine işlendi.
   - **Aşama 22B tamamlandı (`view/rover-gallery.js`, `main.js`, `view/3d/camera.js`, `index.html`):** WB1 ve Roubion duraklarında yerel arşiv JPEG'lerini gösteren galeri, `observation.credit` ham künyesi (D5), pusula yönü sözcüklerinin gizlenmesi (D4), `SUPERCAM_RMI` yönünün hariç tutulması ve `SITE_FRAME_ASSUMPTION` uyarısıyla "Rover kamerasının tahmini yönüne bak" (`setFirstPersonLook`) özelliği eklendi.
   - **Aşama 21B durumu:** Ortomozaik katmanı etkin DTM ile piksel/yarım-piksel hizası doğrulanana kadar kapalı tutuldu; arayüze açık bilgi notu eklendi.
2. **Birinci şahıs kamera–kask, rig ankraj/üst beden hareketi ve test beklentisi (`c10e885`, `4bd5967`, `a135d08`, `3ff4976` — Alparslan):**
   - `camera.js` içinde `FIRST_PERSON_EYE_HEIGHT_M` `1,75 m`'den `1,48 m`'ye (rig kask merkezi `Z = 1,48 m` ve `FIRST_PERSON_RIG_ROOT_BELOW_EYE_M = 1,48 m`) çekilerek **H3** gövde–bacak kök farkı kodda kapatıldı; `a135d08` ile `test/core.test.mjs` beklentisi `1,48 m` olarak eşitlendi.
   - `renderer.js` içinde `FIRST_PERSON_RIG_FORWARD_M = 0,55` ileri ofseti kaldırıldı; first-person rig kökü doğrudan göz ankrajının `[camera.xM, camera.yM]` koordinatına hizalandı ve `3ff4976` ile üst beden view-model hareketi (`rigPose.rootOffset` / `rootRotationRad`) göz ankrajına göre korundu.
3. **Aşama 24A — 2D minimap temel arayüzü ve fail-closed seçim koruması (`3167130`, `6497d62` — Alparslan):**
   - `public/js/view/minimap/minimap.js`, `index.html`, `styles.css` ve `main.js` ile sürükle/yakınlaştır minimap kanvası, ölçek çubuğu, kuzey oku, kaynak atfı, jeoloji/arşiv izi katman anahtarları ve başlangıç/bitiş noktası seçimi eklendi.
   - `6497d62` ile `selectionRejection()` eklendi: DTM yüklenmemişse, tıklanan nokta kapsam dışındaysa veya hazırlanan terrain görselinde eflatun taramalı (`no-data`/`invalid`) hücredeyse seçim reddedilir ve uyarı gösterilir.
   - Rota hesabı ve hücre puan açıklaması, Efe'nin **23A/23B** modülleri henüz mevcut olmadığı için açık mesajla bekletilmektedir (**Aşama 24B**'de bağlanacaktır).
4. **Aşama 18B — Mars güneş geometrisi ve arazi/sahne aydınlatması (`f41fbb0`, `f223414` — Alparslan/Efe ortak hat):**
   - `public/js/geo/mars-sun.js` içinde NASA GISS Mars24 algoritmasına (Bölüm D-1 ve D-5/D-6) dayalı küresel güneş yönü (`marsSunDirection({ latitudeDeg, solarLongitudeDeg, trueSolarHour })`) eklendi (`LTST 15.00, Lₛ 0°`).
   - `view/3d/renderer.js` içinde arazi normallerindeki `3×` görsel dikey abartı güneş ışığı hesabından önce geri alındı (`uTerrainExaggeration`), gökyüzü güneş diski ve tüm render geçişlerinde (`daylight = smoothstep(0.0, 0.08, lightDir.z)`) ufuk sönümlemesi eşitlendi.

### Sonraki aşamalar ve güncellenmiş iş bölümü

Dosya sahipliği kuralı korunur: **Efe** saf modüller (`route/`, `geo/`), doğrulama/hazırlama araçları (`scripts/`) ve birim testleri (`test/`); **Alparslan** composition root (`main.js`), `simulation/`, `surface/`, `view/` (HUD, 2D/3D renderer, minimap UI) ve uçtan uca entegrasyon. Her aşama ayrı kısa ömürlü branch ve tek kabul ölçütüyle ilerler.

**FAZ 1 — Jezero'da çalışan minimap + otomatik rota + test/kabul kapanışı (yarışma demosu için öncelikli)**

| Aşama | Sahip | Durum | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|---|
| **23A — Yürünebilirlik maliyet modeli** | **Efe** | **SIRADAKİ 1. İŞ (AÇIK)** | `public/js/route/cost-model.js` (yeni), `test/cost-model.test.mjs` (yeni) | Hücre başına eğim (3×3 Horn), pürüzlülük (DTM'den yerel kot std/TRI), veri durumu ve isteğe bağlı jeoloji bilgisinden `0–100` yürünebilirlik puanı ve geçiş maliyeti. Donmuş parametre seti (`source`/`status: 'scenario'|'sourced'`). Sert kısıt: eşik üstü eğim, `no_data`, `out_of_bounds`, `invalid` = geçilemez (`Infinity`). Hücre puanını şeffaf açıklayan `explainCell(grid, cell, costParams)` çıktısı. | Saf ve deterministik; bilinmeyen veri hiçbir zaman geçilebilir değil; sentetik eğim/no-data ızgaralarında beklenen puanlar; parametre değişince puan monoton değişir. Runtime/UI dosyalarına dokunmaz. |
| **23B — Otomatik rota (A\*) motoru ve Worker** | **Efe** | **SIRADAKİ 2. İŞ (AÇIK)** | `public/js/route/pathfinder.js` (yeni), `public/js/route/pathfinder.worker.js` (yeni), `test/pathfinder.test.mjs` (yeni) | 8 komşulu ızgara A\* (`planRoute({ grid, costParams, start, end, budget })`), oktil sezgisel × min birim maliyet (admissible), deterministik eşitlik kırma, düğüm/süre bütçesi, isteğe bağlı maliyet-farkında yol düzleştirme. Çıktı: `{ status, path, stats, segments, reason }` (yerel m ve lon/lat noktaları, uzunluk, toplam/maks eğim, en düşük puan, kot kazanımı/kaybı, segment dökümü, senaryo hızıyla tahmini EVA süresi; yol yoksa açık `no_path` nedeni). Web Worker sarmalayıcısı. | Sentetik testler: engel etrafından dolanma, dik yamaçtan kaçınma, no-data adası, başlangıç/bitiş geçilemez hücrede, bütçe aşımı. Aynı girdi → aynı yol. |
| **23C — Gerçek veriyle rota doğrulama raporu** | **Efe** | **AÇIK (23B sonrası)** | `scripts/validate-route-planner.mjs` (yeni), `Sim/stage23-route-validation.md` (yeni) | Jezero 1 m DTM penceresinde WB1 → Roubion için planlanan rotayı **düz hat** ve **arşiv Perseverance izi** (20A) ile karşılaştırır: uzunluk, ortalama/maks sapma, eğim/pürüzlülük profilleri, en düşük puan. | Sayısal tablo ve kısa yorum; rover izi insan rotası değildir notu; planlayıcı rover izinden "daha iyi/güvenli" iddiası kurmaz, yalnız ölçüm verir. |
| **23D — Son commitlerin birim test ve regresyon eşlemesi** | **Efe** | **AÇIK (23A/B ile paralel veya hemen ardından)** | `test/mars-sun.test.mjs` (yeni), `test/minimap.test.mjs` (yeni), `test/core.test.mjs` | (1) `marsSunDirection` için ekinoks/gündönümü, öğle (`LTST 12`), sabah/akşam ve birim vektör normu (`1 ± 1e-12`) testleri; (2) `test/core.test.mjs` içinde H1/H2/H5 regresyon testleri (`1,48 m` kamera test beklentisi **T1** `a135d08` ile güncellendi); (3) `createMinimap` için sahte kanvas üzerinde kapsam dışı/no-data reddi (`selectionRejection`) birim testi. | `public/js/**` uygulama koduna dokunmaz; yalnız `test/` altında deterministik test kapsamını güncel kod sözleşmesiyle eşitler. |
| **24A — 2D minimap temel arayüzü ve seçim koruması** | **Alparslan** | **TAMAMLANDI — kodda (`3167130`, `6497d62`)** | `public/js/view/minimap/minimap.js`, `index.html`, `styles.css`, `main.js` | Sürükle/yakınlaştır minimap, ölçek çubuğu, kuzey oku, atıf, jeoloji ve arşiv izi katman geçişleri, kapsam dışı ve eflatun `no-data` hücre seçimlerini reddeden başlangıç/bitiş seçici. | Kodda mevcut; görsel/tarayıcı kabulü 24B ile birlikte yapılır. |
| **24B — Minimap ↔ 23A/23B rota, ısı haritası ve hücre açıklaması entegrasyonu** | **Alparslan** | **AÇIK (23A ve 23B tesliminden sonra)** | `public/js/view/minimap/minimap.js`, `main.js`, `index.html`, `styles.css` | Başlangıç ve bitiş seçildiğinde `pathfinder.worker.js` üzerinden otomatik rotayı hesaplayıp minimap'te çizme; seçilebilir eğim/yürünebilirlik puanı ısı haritası katmanı; rota özet paneli (uzunluk, tahmini süre, kot kazanımı/kaybı, en zor segment); haritada tıklanan hücre için `explainCell()` açıklama kartı. | Rota hesaplanırken UI donmaz; `no_path` nedeni açıkça gösterilir; puanlar "Planlama göstergesi — güvenli rota sertifikası değildir" etiketi taşır; 2D/3D fallback bozulmaz. |
| **25 — Planlanan rota ↔ 3D sahne ve first-person HUD bağlantısı** | **Alparslan** | **AÇIK (24B sonrası)** | `main.js`, `view/hud.js`, `view/3d/renderer.js`, `view/3d/marker-mesh.js` | Minimap'te üretilen rotanın 3D sahnede zemin kılavuz çizgisi/işaretçileri olarak çizilmesi (no-data boşluklarında köprü kurmadan); HUD'da sıradaki rota noktasına yön/mesafe, mevcut hücrenin yürünebilirlik puanı ve eğim uyarısı. Sabit WB1→Roubion senaryosu "örnek görev" olarak korunur. | Rota değişince 2D/3D kılavuz güncellenir; puan HUD'da "planlama göstergesi" etiketiyle görünür; no-data üzerinde sahte zemin teması yok. |
| **25B — Birleşik görsel kabul ve smoke betiği senkronizasyonu** | **Alparslan** | **AÇIK (paralel / 24B öncesi veya sonrası)** | `scripts/smoke-e2e.mjs` ve tarayıcı kabul raporu | (1) Stage 15–18 (1,48 m göz/kask hizası, ileri ofsetsiz rig, Mars güneş aydınlatması) + 19B/20B/22B/24A için tarayıcıda görsel kabul; (2) `scripts/smoke-e2e.mjs` içindeki `5b` feragat kontrolünün `index.html`'e eklenen `"güvenli rota bilgisi içermez"` cümlesiyle ve güncel HUD etiketleriyle (**T2**) uyumlu hale getirilmesi. | Gerçek tarayıcıda alt beden/kollar kadrajda kırpılmaz; smoke kontrolleri yeni arşiv/minimap feragat metinleriyle çelişmez. |

**FAZ 2 — Ortomozaik kayıt kanıtı (21B) ve tüm Mars kapsamı (Mars Trek entegrasyonu; FAZ 1 tamamlandıktan sonra)**

| Aşama | Sahip | Durum | Dosya sınırı | Çıktı | Kabul |
|---|---|---|---|---|---|
| **21B-Ön — Ortomozaik ↔ DTM piksel kayıt doğrulaması** | **Efe** | **BEKLEMEDE (FAZ 1 sonrası)** | `scripts/build-ortho-mosaic.mjs`, `test/ortho-mosaic.test.mjs`, `Sim/stage21a-ortho-audit.md` | 21A'da birleştirilen z17/z14 Mars Trek HiRISE ortomozaik karoları ile etkin DTM penceresi arasındaki piksel/yarım-piksel hizasını sayısal kontrol noktaları/gradyan korelasyonu ile test eder; hizalama kanıtını veya kalan kaymayı belgeler. | Sayısal kayıt kanıtı olmadan "hizalı ortho" bayrağı açılmaz; kapsam dışı alan şeffaf kalır. |
| **21B — 2D/3D/Minimap ortomozaik doku kaplaması** | **Alparslan** | **BEKLEMEDE (21B-Ön kanıtından sonra)** | `config.js`, `surface/`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`, `view/hud.js` | Kayıt kanıtı geçen 25 cm HiRISE ortomozaik dokusunu 2D Canvas, minimap ve 3D WebGL2 arazi mesh'ine UV olarak giydirir; hillshade ↔ ortomozaik geçişi ve açık katman/lisans (`belirtilmemiş`) atfı ekler. | Kapsam dışı alanlarda sahte doku üretilmez; hillshade hiçbir zaman ortogörüntü diye adlandırılmaz. |
| **26A — Mars Trek katman kataloğu ve karo matematiği** | **Efe** | **BEKLEMEDE (FAZ 2)** | `public/js/geo/trek-tiles.js` (yeni; 21A karo matematiğini genelleştirir), `scripts/trek-catalog.mjs` (yeni), testler | Mars Trek WMTS `GetCapabilities` belgelerinden katman kataloğu (ad, ürün kimliği, CRS, TileMatrixSet, çözünürlük, kapsam, atıf/lisans alanları); küresel lon/lat ↔ karo dönüşümü; zoom seçimi. Katman adları belgeden okunur, uydurulmaz. | Katalog gerçek capabilities belgelerinden üretilir; karo sınırları belgeyle 1e-9° içinde; bilinmeyen CRS'li katman `needs_review`. |
| **26B — Karo/DEM istemcisi ve önbellek** | **Alparslan** | **BEKLEMEDE (FAZ 2)** | `surface/` (yeni sağlayıcı), `server.mjs` (vekil/önbellek), `main.js` | Minimap için görüntü karoları; rota için ham DEM erişimi (indirilebilir ürün veya hazırlanmış saha paketi). CORS ve erişim doğrulaması; çevrimdışı demo önbelleği. | Ağ yokken önbellekten çalışır; erişilemeyen katman `unavailable` görünür; atıf her katmanda gösterilir. |
| **27 — Küresel jeoloji ve çok çözünürlüklü planlama** | **Efe** (saf), **Alparslan** (UI) | **BEKLEMEDE (FAZ 2)** | `geo/geology.js` genişletmesi (çoklu harita: SIM 3292 küresel + SIM 3464 Jezero), `route/` hiyerarşik planlayıcı | Herhangi bir noktada mevcut en ayrıntılı jeoloji haritasından birim + ölçek/belirsizlik; K0/K1'de bölgesel ön rota, K2 bulunan alt alanlarda EVA rotası. | Her sonuç hangi katmandan ve hangi çözünürlükten geldiğini taşır; K0/K1 çıktısı yürünebilirlik puanı olarak etiketlenmez. |
| **28 — Saha seçici ve yeni sahalar** | **Alparslan** | **BEKLEMEDE (FAZ 2)** | UI/entegrasyon | Minimap'te küresel görünümden saha seçimi; 1 m DTM bulunan sahalar (Jezero ve doğrulanacak diğerleri, ör. Gale) için yerel paket hazırlama akışı. | Yalnız DTM'i, datumu ve kapsamı doğrulanmış sahalar EVA rotasına açılır; diğerleri "bölgesel ön planlama" modunda kalır. |

### Güncel öncelik ve yürütme sırası (14 Kasım 2026, gece)

1. **Paralel Şerit A (Efe — Saf Rota Motoru ve Testler):**
   - **Adım 1:** **23A** (`public/js/route/cost-model.js`, `test/cost-model.test.mjs`) — `evaluateCellCost(grid, cell, costParams)` ve `explainCell(grid, cell, costParams)`.
   - **Adım 2:** **23B** (`public/js/route/pathfinder.js`, `public/js/route/pathfinder.worker.js`, `test/pathfinder.test.mjs`) — `planRoute({ grid, costParams, start, end, budget }) → { status, path, stats, segments, reason }`.
   - **Adım 3:** **23C** (`scripts/validate-route-planner.mjs`, `Sim/stage23-route-validation.md`) ve **23D** (`test/mars-sun.test.mjs`, `test/minimap.test.mjs`, `test/core.test.mjs` içinde H1/H2/H5 test eşlemesi).
2. **Paralel Şerit B (Alparslan — Görsel Kabul, Smoke Eşlemesi ve UI Entegrasyonu):**
   - **Adım 1 (hemen, Efe 23A/B'yi yazarken):** **25B** — `c10e885`/`4bd5967`/`f223414` sonrası 3D kamera/rig/güneş aydınlatması ile 19B/20B/22B/24A'nın tarayıcı görsel kontrolü ve `scripts/smoke-e2e.mjs` metin/etiket senkronizasyonu (**T2**).
   - **Adım 2 (Efe 23A ve 23B'yi teslim edince):** **24B** — `minimap.js` ve `main.js` içinde başlangıç/bitiş noktalarını Worker'a bağlayıp planlanan rotayı, ısı haritasını, rota özet panelini ve `explainCell()` hücre açıklamasını gösterme.
   - **Adım 3 (24B sonrası):** **25** — Planlanan rotayı 3D arazi kılavuzuna ve first-person HUD göstergelerine bağlama.
3. **FAZ 2 (Demo çekirdeği tamamlandıktan sonra):** **21B-Ön → 21B** ortomozaik kaplaması ve zaman kalırsa **26A → 26B → 27 → 28** tüm Mars kapsamı.

### Açık araştırma maddeleri

- **Yürünebilir eğim eşiği ve eğim–hız ilişkisi:** NASA EVA/uzay giysisi literatüründen birincil kaynak (ör. Apollo yürüyüş deneyimleri, NASA insan sistemleri standartları). Bulunana kadar senaryo parametresi.
- **Pürüzlülük ölçüsü:** 1 m DTM'den TRI/kot std; kaya tespiti iddiası kurulmaz (1 m DTM tek tek kayaları çözmez). HiRISE kaya yoğunluğu ürünleri varsa ayrı katman olarak değerlendirilir.
- **Mars Trek erişimi:** Hangi katmanların ham DEM indirmesi sunduğu, kullanım/lisans koşulları, CORS ve hız sınırları.
- **Jeolojinin maliyete etkisi:** Birim bazlı yürünebilirlik etkisi için kaynak yoksa jeoloji yalnız bilgi katmanı olur, maliyete katılmaz.

## Önceki yürütme kararı — 14 Kasım 2026 (tarihsel; yukarıdaki ürün yönü önceliklidir)

**Repo kaydı ve kaynakla doğrulandı (14 Kasım 2026):** HEAD `94f7bac` (`codex/stage17-first-person-lower-body`), origin ile eşit. Stage 16 rig güncellemesi `8e7173c`; Stage 17 alt beden first-person renderer entegrasyonu `94f7bac` içinde. Stage 13 ve 16 kodu mevcut; Stage 17 kodu da eklenmiş. Stage 17 için bu turdaki bağımsız kontrol salt statikti: test, smoke ve tarayıcı çalıştırılmadı, görsel kabul açık. Stage 19A saf geometri modülü `cdc7ca3` ile mevcut; `Sim/stage19a-geology-audit.md` kaynak ve sorgu belirsizliklerini gösterir. USGS DTM adayı ürün özelinde düşey datum kanıtı olmadığı için `needs_review` kalır; legacy HiRISE fallback korunur. Veri/raster runtime kabulü yoktur.

**Alparslan — sıradaki görev:** Stage 15–17 kamera, gait ve alt beden görünürlüğü için kullanıcının manuel deneme isteğine uygun görsel kabul kaydı al; başlangıç, yürüme, aşağı bakış, sıçrama/iniş, bilinmeyen yüzey teması ve 2D fallback durumlarını incele. Kabul ölçütü: gerçek tarayıcı görüntüsü/kaydında alt beden kadrajı ve kamera/rig adım ritmi kullanılabilir, clipping veya sahte yüzey teması yoktur; aksi durumda tek dosya sınırındaki düzeltme görevi tanımla. Stage 18 rölyef işi bu kabulden sonra başlar.

**Efe — Stage 16 ve 19A teslimleri:** Stage 16 `8e7173c`, Stage 19A saf jeoloji sorgusu `cdc7ca3` ile kaydedildi. Stage 19A audit (`Sim/stage19a-geology-audit.md`) düzeltme/karar gerektiren kaynak, waypoint ve manifest hash belirsizliklerini listeler. 19B ancak bu sözleşme ve caveat metinleri karara bağlandıktan sonra başlar. Stage 20, 21 ve 22 için her A hazırlık işi kendi kabulinden sonra kendi B entegrasyonuna geçer; bu işler birbirini otomatik olarak başlatmaz.

**Doğrulama ayrımı:** Bu turda Git kaydı, README, ilgili kaynaklar ve audit statik olarak incelendi. Stage 17 için bu bağımsız incelemede test, smoke, uygulama veya tarayıcı çalıştırılmadı. Efe'nin önceki Stage 16 test bildirimi ve kullanıcı manuel test gözlemleri bağımsız görsel kabul yerine geçmez. Son runtime/görsel kabul sahibi Alparslan'dır; kullanıcı test yasağı sürdüğü için yeni test çalıştırılmaz.

**Teslim ve paylaşım:** Alparslan ve Efe kendi rapor görevleri bittiğinde yalnız ilgili teslim dosyasını `git status` ve staged diff ile denetleyip kısa ömürlü kendi dallarında açıklayıcı commit atar ve remote'a push eder. Kullanıcıya commit hash'i, push sonucu ve çalıştırılmamış testleri açıkça bildirirler; push hatasında yerel commit'i paylaşılmış gibi sunmazlar. Mevcut kullanıcı belge, ekran görüntüsü, TIFF ve `.crdownload` değişiklikleri görev commit'lerine eklenmez.

## Sonraki 3D kalite aşamaları — 14 Kasım 2026

**[KULLANICI BİLDİRDİ]** Elle denemede kamera karakterin arkasında/uygunsuz konumda, kollar fazla hızlı, karakter ölçeği yapay, bacaklar görünmüyor ve yükselti-alçalma yeterince belirgin değil. Bunlar kullanıcı gözlemidir; bağımsız görsel kabul sonucu değildir. `c4fb930` kamera/ofset ölçeğini güncelledi; `8e7173c` rig stride'ını ve alt beden metadata'sını iyileştirdi; `94f7bac` alt beden görünürlüğünü renderer'a bağladı ve `gaitDistanceM` snapshot aktarımını yaptı. Kod değişiklikleri tek başına görsel kabul kanıtı değildir. Arazi `verticalScale: 3` sunum parametresi olarak kalır. Tarayıcı kabulinde kamera, gait, kadraj ve rölyef incelenmelidir.

1. **Aşama 15 — göz hizası ve ölçek sözleşmesi (Alparslan) — KOD GÜNCELLENDİ, GÖRSEL KABUL AÇIK.** `c4fb930` first-person kamera/ofset ölçeğini güncelledi. Stage 15–17 birleşik görsel kabulinde başlangıç/yürüyüş/zıplama/iniş göz hizası, arkadan takip etkisi, yüzey clipping'i ve 2D fallback incelenir. Kaynak kot `zM` ve yüzey teması değişmez.
2. **Aşama 16 — EVA pozları ve alt beden rig verisi (Efe) — KOD/TEST DOSYALARI MEVCUT, GÖRSEL KABUL AÇIK.** `8e7173c` `astronaut-rig.js` ve birim testlerini güncelledi; kol salınımını yavaşlattı, iniş-yürüyüş geçişlerini hizaladı ve bacak/bot parça verisini ekledi. Önceki yerel test raporu 55/55'tir; bu turda tekrar çalıştırılmadı. Görsel stride tasarım parametresidir, suit biyomekaniği değildir. Tarayıcı kabulü Stage 15–17 incelemesinde yapılır.
3. **Aşama 17 — alt bedenin first-person entegrasyonu (Alparslan) — KODDA MEVCUT (`94f7bac`), GÖRSEL KABUL AÇIK.** `renderer.js`, `camera.js`, `main.js` Stage 16 rig sözleşmesini bağlar; aşağı bakışta bacak/bot görünürlüğü ve `gaitDistanceM` snapshot/kamera fazı kodda vardır. Bu commit için bu turdaki bağımsız inceleme statiktir; test, smoke veya tarayıcı sonucu yoktur. Kabul: kollar/bacaklar doğru kadrajda, zemin içine girme/görüşü kapatma/sahte no-data teması yok; 2D/WebGL2 fallback korunur.
4. **Aşama 18 — arazi rölyefi ve okunabilirlik (Alparslan, kamera/rig kabulünden sonra).** Dosya sahibi: `Sim/public/js/main.js`, `view/3d/terrain-mesh.js`, `renderer.js`, `marker-mesh.js` ve ilgili sunum sınırı; Efe rig dosyasına dokunmaz. Mevcut DTM'nin yerel kot aralığı, mesh çözünürlüğü, ışık/gölgelendirme, bakış açısı ve dikey abartı ayrı ayrı incelenir. Önce görünürlüğü aydınlatma/kontrast/kadrajla iyileştir; `verticalScale` değişecekse terrain, marker, kamera ve rig temasını aynı sunum dönüşümünde tut. Kabul: aynı kaynak DTM'deki gerçek yükselti-alçalmalar iki sabit karşılaştırma noktasında daha okunur; `sourceElevationsM`/`zM` değişmez, no-data boşlukları korunur ve arayüz görsel dikey abartı değerini açıkça belirtir. Yeni USGS adayını datum kanıtı olmadan etkinleştirme.

**Açık teknik/görsel riskler (14 Kasım 2026, Stage 17 kodu sonrası):** Kod incelemesi ile tarayıcıda gözlenmesi gerekenler ayrıdır.

- **R1 — Kamera/rig adım uyumu (görsel kabul açık).** `main.js` kamera fazı artık `gaitDistanceM` varsa onu, yoksa rig'in `presentationStrideLengthM` değerini kullanır; `sim.js` snapshot'a `gaitDistanceM` koyar. Kod sözleşmesi mevcut, faz uyumu gerçek tarayıcıda henüz gözlenmedi.
- **R2 — Ayak kayması ve görüş kadrajı riski (görsel kabul gerekli).** Görsel stride 6 m'dir; bu tasarım parametresidir, gerçek biyomekanik ölçüm değildir. Yürüyüş/dönüşte ayak kayması, alt gövdenin kadrajı kapatması veya zemine girmesi gerçek zamanlı gözlenmeli.
- **R4 — Durumsuz animasyon geçişleri.** Rig stateless olduğundan stop/descent/walk-airborne geçişlerinde ölçülen poz farkları kalır; sayısal ölçümler `Sim/stage14-rig-audit.md` içindedir. İyileştirme ayrı kabul ölçütüyle planlanır.
- **R5 — Stage 17 alt beden entegrasyonu mevcut, görsel kabul açık.** Renderer aşağı bakışa bağlı bacak/bot çizimini ve pitch görünürlüğünü uygular; kadraj/örtüşme eşikleri tarayıcıda doğrulanmadı.
- **R6 — Görsel kabul bekliyor.** Stage 13/16/17 rig-kamera birleşimi için bu turda browser QA yoktur; kaynak kod incelemesi görsel kabul yerine geçmez.

**Aşama numarası notu:** Buradaki Stage 17, 3D alt beden entegrasyon aşamasıdır; tarihsel `codex/stage17-usgs-validation` dalındaki raster validator işiyle aynı görev değildir.

## İndirilen NASA/USGS Veri Kümeleri İçin Yeni Aşamalar ve İş Bölümü (Aşama 19–22) — 14 Kasım 2026

**Veri Hazırlık Kaydı (`805f739` — `alparslan/stage14-kinematics-visuals-integration`):** NASA Mars Trek WMTS/MMGIS, USGS Astrogeology (`SIM 3464`) ve NASA Mars 2020 Perseverance Raw Images kaynakları ile ilişkilendirilmiş veri paketleri (`Sim/data/mars-trek/`, `Sim/data/usgs-sim3464-geology/`, `Sim/data/perseverance-raw/`) depoya eklendi. Mars Trek manifesti 91 karo için bütünlük kontrolü bildiriyor; Perseverance paketi 12 fotoğraf kaydı, USGS paketi resmi SIM 3464 metaveri/atıf içeriyor. Bu turda hash'ler ve koordinat/telemetri dönüşümleri bağımsız yeniden hesaplanmadı; verilerin uygulamaya entegrasyonu ve ürün kabulü tamamlanmış sayılmaz. İşler, Aşama 15–18 kamera/rig/rölyef dosyalarıyla çakışmayacak şekilde Efe (saf veri/geometri/sorgu modülleri ve birim testleri) ile Alparslan (composition root, snapshot, HUD ve 2D/3D renderer entegrasyonu) arasında bölünmüştür:

| Aşama | Veri Kaynağı (`Sim/data/`) | Efe'nin Bağımsız Paketi (Saf Modül / Hazırlama / Test) | Alparslan'ın Entegrasyon Paketi (Runtime / Snapshot / HUD / Render) |
|---|---|---|---|
| **Aşama 19: Canlı USGS SIM 3464 Jeolojik Birim Motoru ve Harita Katmanı** | `Sim/data/usgs-sim3464-geology/jezero_geounits_corridor.geojson` (`Njf`, `Nle`, `NHjf2`) + `manifest.json` | **19A (Efe):** `Sim/public/js/geo/geology.js` ve `Sim/test/geology.test.mjs`. Koridor GeoJSON poligonlarından yerel `(x, y)` / `(lon, lat)` Point-in-Polygon birim sorgusu (`lookupGeologicUnit`), birim sınır çizgileri ve resmi USGS `SIM 3464` (Sun & Stack, 2020) metadata/atıf dondurucusu. Runtime/UI dosyalarına dokunmaz. | **19B (Alparslan):** `config.js`, `main.js`, `simulation/sim.js`, `view/hud.js`, `view/render.js`, `view/3d/renderer.js`. `WorldSnapshot` içine aktif jeolojik birimi (`Njf` Jezero floor vs. `Nle` Séítah) bağlar; HUD'da canlı jeoloji kartı ve 2D/3D görünümde yarı saydam jeolojik sınır katmanı sunar. |
| **Aşama 20: Arşiv Perseverance Sürüş İzi ve 16 Ara Sol Durağı (Sol 120–164)** | `Sim/data/mars-trek/M20_traverse.json` & `M20_waypoints.json` | **20A (Efe):** `Sim/public/js/geo/traverse.js`, `Sim/public/js/view/3d/marker-mesh.js` (ara sol dikmeleri genişletmesi) ve `Sim/test/traverse.test.mjs`. Sol 120–164 (`Site 4 Drive 1250` $\to$ `Site 6 Drive 0`, Sol 122..157 ara durakları) alt kümesini yerel metre düzlemine dönüştürür; kuş uçuşu hat ile gerçek arşiv sürüş izinin sapma/uzunluk farkını ve 3D ara sol mikro-işaretçi geometrisini üretir. | **20B (Alparslan):** `config.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/hud.js`. Basitleştirilmiş düz koridoru koruyarak yanına seçilebilir "Arşiv Perseverance Sürüş İzi (MMGIS)" katmanını ve 3D ara sol işaretçilerini bağlar; Sol 157 varışı ve Sol 157–164 Roubion operasyon bilgisini HUD'da gösterir. |
| **Aşama 21: 25 cm HiRISE Ortomozaik WMTS Karo Birleştirme ve 2D/3D Doku Kaplaması** | `Sim/data/mars-trek/ortho-tiles/` (91 PNG karo, Zoom 13–17) & `hirise_ortho_25cm_fgdc.html` | **21A (Efe):** `Sim/scripts/build-ortho-mosaic.mjs` ve `Sim/test/ortho-mosaic.test.mjs`. Zoom 16/17 PNG karolarının WMTS `TileMatrix` sınırlarını `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` referansıyla doğrulayıp çalışma penceresi (`1328×1234 m`) için UV/piksel hizalama manifestini ve birleşik doku çıktısını üretir. | **21B (Alparslan):** `config.js`, `surface/`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/hud.js`. Eksik JP2 yerine doğrulanmış 25 cm ortomozaik dokusunu 2D Canvas ve 3D WebGL2 arazi mesh'ine UV olarak giydirir; "DTM Hipsometrik Kabartma" $\leftrightarrow$ "25 cm HiRISE Ortomozaik" geçişi ve açık katman atıfı ekler. |
| **Aşama 22: Sol 120 / Sol 164 Yer Seviyesi Perseverance Saha Fotoğrafları ve Kamera Hizalama** | `Sim/data/perseverance-raw/manifest.json` + `sol120/` (6 JPG) + `sol164/` (6 JPG) | **22A (Efe):** `Sim/public/js/geo/rover-observations.js` ve `Sim/test/rover-observations.test.mjs`. 12 gerçek rover fotoğrafının (`Navcam`, `Mastcam-Z`, `Hazcam`, `SuperCam RMI`, `CacheCam`) `attitude`, `mastAz` ve `mastEl` telemetrisini 3D birinci şahıs kamera açılarına (`yawRad`, `pitchRad`) dönüştüren saf fonksiyonları ve durak yakınlık eşleşmesini yazar. | **22B (Alparslan):** `main.js`, `view/3d/camera.js`, `view/hud.js`, `styles.css`. Sol 120 ve Sol 164 duraklarında gerçek Perseverance saha fotoğraflarını (NASA/JPL-Caltech/ASU/MSSS künyesi ve LMST saatiyle) açan HUD inceleme panelini ve 3D kamerayı fotoğrafın çekildiği azimut/eğime döndüren "Rover Kamerası Yönüne Bak" özelliğini bağlar. |

**Yürütme kapısı ve sırası:** (1) Alparslan Stage 15–17 görsel kabulini yapar; kabul ölçütü first-person kamera/kol/bacak kadrajının yürüyüş, bakış aşağı, zıplama/iniş ve bilinmeyen temas durumlarında doğru görünmesi, 2D fallback'in çalışmasıdır. (2) Kabulden sonra Alparslan Stage 18 rölyef okunabilirliği görevini yürütür. (3) Efe 19A audit kararlarını ve caveat sözleşmesini netleştirir; Alparslan ancak bundan sonra 19B'yi uygular. (4) Aşama 20, 21, 22 ayrı ayrı A hazırlığı → ilgili B entegrasyonu sırasıyla ilerler; veri/frame kanıtı olmayan aşama bekler. Her iş ayrı kısa ömürlü branch, tek kabul ölçütü ve ayrı commit'tir. Kullanıcı test yasağı geçerlidir; uygulama kodu/veri/test değişikliği veya test çalıştırma bu yol haritası görevi kapsamında değildir.

## Efe A paketleri teslim durumu ve açık kararlar — 14 Kasım 2026

**Durum:** 19A sözleşmesi, 20A, 21A ve 22A hazırlık paketleri kodda mevcut. Bağımsız kontrolde `node --test test/` **112/112** geçti (kullanıcının açık hata kontrol isteğiyle çalıştırıldı); smoke, tarayıcı ve görsel kabul çalıştırılmadı. Ayrıntılar ve ölçümler her paketin kendi raporundadır: `Sim/stage19a-geology-audit.md`, `Sim/stage20a-traverse-audit.md`, `Sim/stage21a-ortho-audit.md`, `Sim/stage22a-rover-observations-audit.md`. Commit/push durumu ilgili teslim kaydında ayrıca belirtilir.

| Paket | Dosyalar | Sonuç | B entegrasyonu durumu |
|---|---|---|---|
| **19A — jeoloji sözleşmesi** | `geo/geology.js`, `test/geology.test.mjs` | `GEOLOGY_SNAPSHOT_CONTRACT` (`marswalk.geology-snapshot.v1`, alan adı `geology`), `toGeologySnapshot`, `createGeologicContactField`/`nearestGeologicContactM`. Koridorda 3 birim (Njf, Nle, NHjf2); WB1 ve Roubion **Njf**. En yakın kontak WB1 12,2 m, Roubion 22,8 m. Konum belirsizliği **100–200 m** (SIM 3464 `horizpar`); lisans `not_stated` (`accconst: None`). | **19B kodda tamamlandı (`04f12f4`):** `main.js` ve `sim.js` 12 alanlı `toGeologySnapshot` sözleşmesini, `createGeologicContactField` ve `nearestGeologicContactM` fonksiyonlarını kullanır; 2D/3D/minimap sınır çizgileri (no-data kırılmalı) ve HUD belirsizlik/lisans/caveat bilgileri bağlıdır. |
| **20A — arşiv sürüş izi** | `geo/traverse.js`, `test/traverse.test.mjs`, `view/3d/marker-mesh.js` (yalnız ek `buildIntermediateSolMarkers`; eski çıktılar bayt bayt aynı) | Sol 122–157 arası 16 sürüş segmenti, kesintisiz `4_1250 → 6_0`. İz 885,5 m (küre), düz hat 687,3 m: **+209 m**, en fazla 106 m sapma, izin yalnız %12'si 10 m senaryo koridorunda. FGDC kredi/lisans alanları boş (`credit: null`). | **20B kodda tamamlandı (`04f12f4`, `3167130`):** `view/traverse-layer.js` ile düz koridor korunarak arşiv MMGIS izi ve 3D ara sol dikmeleri 2D, 3D ve minimap'e eklendi; D1/D2 sol ayrımı (`Sol 116 → Sol 157` sürüş, `Sol 120/164` fotoğraf) ve feragat metni eklendi. |
| **21A — ortomozaik** | `scripts/build-ortho-mosaic.mjs`, `test/ortho-mosaic.test.mjs` | 91 karo, 256×256 gri+alfa PNG; yol `{z}/{row}/{col}`. z17 = **0,318 m/px** (D-B 0,302); "25 cm" ürün adıdır, sunulan en ince seviye daha kabadır. XML `ScaleDenominator` Dünya yarıçapına göre, kullanılmadı. Koridor z17'de eksiksiz (54 karo); rota kutusu z17'de 6 karo eksik, z14'te tam. Mozaik DTM mesh penceresinin ~%11,5'ini kaplar. Karo başına hash manifestte yok, araç kendisi hesaplar. Lisans `NOT_STATED_IN_PROVIDED_FGDC`. "1328×1234 m" pencere değeri hiçbir veriden üretilemedi. | **21B beklemede:** Hizalama yalnız karo aritmetiğinden türetildi; etkin DTM ile piksel/yarım-piksel kayıt doğrulanmadan doku kaplaması açılmaz (`index.html`'de açık durum notu mevcut). |
| **22A — rover gözlem açıları** | `geo/rover-observations.js`, `test/rover-observations.test.mjs` | `mastAz/mastEl` rover çerçevesinde (Navcam/Mastcam-Z için CAHV ekseniyle 1,5° içinde). `attitude` kuaterniyonu (w,x,y,z, rover→site) arşiv roll/pitch/yaw değerlerini 0,5° altında üretir; rover yönü Sol 120 ≈220°, Sol 164 ≈141°. Kamera yaw/pitch dönüşümü `camera.js` ile altı yönde sayısal doğrulandı. Hazcam/CacheCam için yön üretilmez; SuperCam RMI çerçevesi çözülemedi. | **22B kodda tamamlandı (`04f12f4`):** `view/rover-gallery.js` ile WB1/Roubion duraklarında fotoğraf galerisi, ham `observation.credit` künyesi, `SUPERCAM_RMI` hariç tutulması ve `SITE_FRAME_ASSUMPTION` uyarılı kamera yönlendirme butonu bağlandı. |

**Alparslan kararı bekleyen / uygulanan veri bulguları:**

- **D1 — Kanonik waypoint kaynağı (uygulandı: PDS korundu).** `config.js` WAYPOINTS (PDS Initial Reports) arşiv MMGIS iziyle **0,09 m** içinde örtüşür. `Sim/data/mars-trek/manifest.json` içindeki sapmalı `key_waypoints` runtime'da kullanılmadı.
- **D2 — Sol etiketleri (uygulandı, `04f12f4`).** Arayüzde sürüş arşivinin **Sol 116 (Site 4 Drive 1250) → Sol 157 (Site 6 Drive 0)** olduğu, Sol 120 ve 164'ün bu duraklardaki görüntü kayıtlarına ait olduğu açıkça yazıldı.
- **D3 — Satır sonu ve hash doğrulama.** Metin veri dosyalarının (GeoJSON, XML, FGDC, metadata) ham hash/boyutu manifestlerle uyuşmaz; CRLF→LF normalizasyonundan sonra birebir eşleşir. Öneri: `.gitattributes` içine `Sim/data/** -text` eklenmesi; kural uygulanana kadar hash doğrulayıcı metin dosyalarını normalize etmeli, ikili dosyalarda ham bayt kullanmalı.
- **D4 — Fotoğraf manifestindeki yön sözcükleri hatalı (uygulandı, `04f12f4`).** `rover-gallery.js` manifestteki hatalı pusula sözcüklerini HUD'da göstermiyor.
- **D5 — Künye (uygulandı, `04f12f4`).** `rover-gallery.js` künyeyi doğrudan kayıttaki `observation.credit` metninden alıyor.
- **D6 — Lisans alanları boş (uygulandı, `04f12f4`).** UI'da "Lisans kaynakta belirtilmemiş" ifadesi gösteriliyor; yalnız DTM ürünü CC0 olarak etiketli.

**Önceki teknik hataların kapanış durumu ve yeni statik test bulguları (14 Kasım 2026, gece):**

- **H1 — Yüksek: havada asılı kalma — KODDA DÜZELTİLDİ (`04f12f4`).** `sim.js` `resolveSurfaceContact` içinde daha alçak geçerli zeminde `heightAboveReferenceM > 0` kaldığında `this.airborne = true` atanarak balistik düşüş başlatılıyor; no-data üzerinde sahte temas kurulmuyor. (**23D**'de birim testi eklenecek.)
- **H2 — Orta: duraklatmada momentum kaybı — KODDA DÜZELTİLDİ (`04f12f4`).** `sim.js` `stepFirstPerson` ve `resolveSurfaceContact` `PHASE.PAUSED` durumunda erken dönüyor; hız ve zaman korunuyor. (**23D**'de birim testi eklenecek.)
- **H3 — Düşük: gövde–bacak boşluğu ve ileri ofset — KODDA DÜZELTİLDİ (`c10e885`, `4bd5967`).** `camera.js` `FIRST_PERSON_EYE_HEIGHT_M = 1.48` ve `renderer.js` `FIRST_PERSON_RIG_ROOT_BELOW_EYE_M = 1.48` eşitlendi; `0,55 m` ileri rig ofseti kaldırıldı. Gerçek tarayıcıda aşağı bakış görsel kabulü (**25B**) açık.
- **H4 — Düşük: kamera bob eşiği — KODDA DÜZELTİLDİ (`04f12f4`).** `main.js` ve `astronaut-rig.js` `0,04 m/s` eşiğini paylaşıyor.
- **H5 — Orta: Stage 19A/19B snapshot sözleşmesi — KODDA DÜZELTİLDİ (`04f12f4`).** `main.js` ve `sim.js` 12 alanlı `toGeologySnapshot` sözleşmesini ve kontak mesafesini kullanıyor.
- **T1 — Kamera göz yüksekliği test eşlemesi — KODDA DÜZELTİLDİ (`a135d08`):** `c10e885` sonrası `Sim/test/core.test.mjs` içindeki Stage 12 kamera testi `1,48 m` (`FIRST_PERSON_EYE_HEIGHT_M`) beklentisiyle eşitlendi.
- **T2 — Yeni statik bulgu (Alparslan — 25B'de düzeltilecek):** `04f12f4` ile `Sim/public/index.html` satır 106'ya eklenen `"Sürüş izi canlı telemetri veya güvenli rota bilgisi içermez."` feragat cümlesindeki `"güvenli "` sözcüğü, `Sim/scripts/smoke-e2e.mjs` satır 245'teki tek cümlelik `disclaimer` istisnası dışında kaldığından `!/güvenli(?!k)|güvensiz|tehlike/i` kontrolüne takılır. **25B** paketinde smoke feragat kontrolü yeni arşiv/minimap feragat cümlelerini kapsayacak biçimde güncellenmeli.

**Sıradaki iş bölümü özeti:** Efe **23A** (`cost-model.js`) → **23B** (`pathfinder.js` + `pathfinder.worker.js`) → **23C** (`validate-route-planner.mjs`) ve **23D** (`mars-sun`, `minimap`, `core.test.mjs` H1/H2/H5 testleri) paketlerini ayrı branch'te yürütür. Alparslan paralelde **25B** (görsel kabul + `smoke-e2e.mjs` T2 senkronizasyonu) işini tamamlar; Efe'nin 23A/23B tesliminden sonra **24B** (minimap rota/ısı haritası/`explainCell` bağlantısı) ve **25** (3D sahne/HUD rota kılavuzu) entegrasyonlarını yapar.

## 14 Kasım 2026 — USGS DTM migration durumu

**Güncel not (repo kaydı; bu turda yeniden doğrulanmadı):** `7df26df` ve `1bc85f6` `codex/usgs-dtm-fail-closed` dalına push edildiği, önceki kod engellerinin statik tekrar incelemede giderildiği kaydedilmiş. USGS adayı ürün-özel düşey datum kanıtı olmadığı için `needs_review`; legacy HiRISE fallback etkin. Bu turda USGS veri kodu, `prepare-data` veya runtime test edilmedi; terrain kabulü açık ve JP2 decoder mevcut değil.

**Tarihsel ilk inceleme: FAIL / kabul edilmedi (`eb385ea`).** İlk USGS migration incelemesinde aşağıdaki engeller kaydedildi. Sonraki `codex/usgs-dtm-fail-closed` commitleri için yol haritasında statik tekrar inceleme sonucu raporlanmış olsa da, bu turda kodu bağımsız yeniden incelemedim. Ürün-özel datum kanıtı ve açık veri kabulü hâlâ gereklidir.

- `extract-dtm.mjs` ürün kimliği, boyut, tiepoint/yarıçap, no-data, geçerli değer aralığı, datum ve lisans gibi kritik değerleri TIFF etiketlerinden kanıtlamadan varsayıyor/sabitliyor; strip düzeni ve sıkıştırma doğrulanmıyor.
- Registry’de boolean/metin bayrakları ve `frameMatchesConfig` “supported” durumuna geçirebiliyor, ancak bağımsız dönüşüm/rezidüel kanıtı yok. Piksel kontrolü yalnızca değerin sonlu olup olmadığını test ediyor.
- Resmî ürün etiketi/SIS, provenance, datum ve lisans-kullanım QC kapısı kapatılmadı. USGS release sayfası hak bilgisini tam olarak “This work is marked with CC0 1.0 Universal” diye verir ([USGS data release](https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic)); bu kaynak ifadesi manifest/doğrulayıcıya bağlanmalı, dosya/ürün kimliği ve kullanım kaydı ayrıca doğrulanmalıdır.
- Yeni migration için bağımsız kabul testi/çalıştırması yapılmadı. Stage 8–12 için geçmişte kaydedilmiş test sonuçları yeni terrain kabulü değildir.

**Tarihsel Stage 6 kod görevi (Alparslan):** çıkarıcıyı TIFF tag’leri/strip ve compression düzeni doğrulanmadan veri üretmeyecek biçimde fail-closed yap; manifestte kaynak, ürün kimliği, datum, lisans ve kullanım şartını birincil kayda bağla; kanonik frame/footprint ve raster dönüşümünü sayısal test/rezidüel kanıtıyla doğrula; ardından bağımsız review ve açıkça istenen kabul çalıştırmasına sun. Güncel yürütme önceliği belgenin başındadır.

İnceleme anında working tree’de legacy IMG/JP2 silme kayıtları ile camera/renderer/test/screenshot değişiklikleri ve TIFF/`.crdownload` untracked dosyaları vardı. Bunlar `eb385ea`’e veya yalnız notları kapsayan commit’e atfedilmez.

## Ürün hedefi ve kapsam sınırları

Marswalk’ın nihai ürün vizyonu, oyuncunun Mars yüzeyinde astronotu **birinci şahıs bakışla keşif amacıyla** yönettiği ayrıntılı, kullanıcı kontrollü bir 3D simülasyondur. “FPS” first-person kamera/kontrol anlamındadır; shooter, silah veya çatışma mekaniği değildir. Çalışan 2D Canvas MVP ve WebGL2 terrain görüntüleyicisi bu hedefe giden ara kilometre taşlarıdır; Stage 10 first-person/rig dikey dilimi eklense de nihai deneyim değildir. Kullanıcının 13 Kasım’daki “3D deneyim hedefe yakın değil” bildirimi Stage 10 entegrasyonundan önceki görünüm içindir; sonraki dilimin bağımsız doğrulaması ayrı kayıtlıdır. Seçili resmi challenge: *Interplanetary Survival Guide: Martian Map*.

**Bilimsel/ürün sınırı:** Canlı NASA telemetrisi izlenimi, gerçek rover karar desteği, güvenli/güvensiz rota **kararı** veya veriyle desteklenmeyen risk/güvenlik skoru üretme. **14 Kasım 2026 akşam güncellemesi:** Şeffaf, kaynaklı ve parametrik bir **EVA yürünebilirlik puanı** ile otomatik rota önerisi artık ürün kapsamındadır; koşulları en üstteki "ÜRÜN YÖNÜ GÜNCELLEMESİ" bölümündedir (planlama yardımcısı, bilinmeyen veri asla güvenli değil, kaynaksız eşik senaryo parametresi, kaba çözünürlükte puan yok). FPS hareketi Mars yerçekimi ve atmosfer koşullarını dikkate almalı; sayıların birimi, birincil kaynak, uzamsal/zamansal kapsam ve senaryo varsayımları ayrı gösterilmeli. Astronot/giysi kütlesi ve aerodinamik katsayıları kaynaksızsa atmosfer sürüklemesini gerçekçi fizik gibi uygulama. 14 Kasım 2026 itibarıyla kullanıcı eski IMG DTM ve JP2 orto dosyalarının geçersiz olduğunu bildirdi; bunları aktif veri girdisi veya otomatik fallback olarak kullanma. Yeni raster ancak provenance, datum, lisans/kullanım ve uzamsal uygunluğu doğrulandıktan sonra ana yüzey kaynağı olabilir.

NASA başlangıç referansları: yüzey yerçekimi NASA Planet Compare'da 3.71 m/s², NASA NSSDC Mars Fact Sheet'te yaklaşık 3.73 m/s² olarak yuvarlanır; kaynak/yuvarlama farkı saklı tutulur. NSSDC ortalama yüzey basıncını 6.36 mbar (mevsimsel 4.0–8.7 mbar), yüzey yoğunluğunu yaklaşık 0.016 ± 0.006 kg/m³ ve atmosferin hacimce çoğunluğunu CO₂ (~95.1%) olarak listeler. Bunlar Jezero'da belirli bir sol/saate ait atmosfer ölçümü değildir. [NASA Planet Compare](https://solarsystem.nasa.gov/planet-compare/?intent=121), [NASA NSSDC Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html).

## Bilimsel veri zemini ve kurallar

### Yerel rasterlar

**[TARİHSEL METADATA; AKTİF GİRDİ DEĞİL]** Önceki DTM `DTEEC_045994_1985_046060_1985_U01.IMG` için kaydedilmiş PDS3 metadata: 6673×14266 piksel, yaklaşık 1.009663 m/piksel, 32-bit PC_REAL, Mars 2000 eşpotansiyel yüzeyine göre metre. Equirectangular, planetosentrik enlem, 15° standart paralel, merkez meridyen 77.44°E, yarıçap yaklaşık 3394.8398 km; no-data `FF7FFFFB`, geçerli aralık yaklaşık −2679.20…−2388.31 m. **[KULLANICI BİLDİRDİ]** Bu DTM ile `ESP_046060_1985_RED_C_01_ORTHO.JP2` geçersizdir; sebep henüz belgelenmedi. Aşağıdaki tarihsel rota/profil ve stage kayıtları eski veriyle yapılmış kayıt olarak kalır, yeni veri için doğrulama sayılmaz.

Eski orto `ESP_046060_1985_RED_C_01_ORTHO.JP2` için aynı boyut/CRS, yarım piksel kayıt notu ve decoder sınırlaması yalnızca tarihsel kayıttır; kullanıcı bu dosyanın geçersiz olduğunu bildirmiştir. Kullanılabilir yeni ortogörüntü bildirilmedi. Hillshade hiçbir zaman orto diye adlandırılmaz.

**[KULLANICI/TEKNİK METADATA BİLDİRİMİ; ÜRÜN KABULÜ DEĞİL]** Yeni aday `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`, 1,839,545,409 bayttır. TIFF metadata incelemesi 21,400×21,488, tek bant float32, sıkıştırmasız, 1 m/piksel, `PixelIsArea`, no-data `-3.40282265508890445e+38` ve user-defined equirectangular Mars Sphere frame’i (yarıçap/semi-axes 3,396,190 m, lat_ts=0, lon₀=0) gösterdi. Raster köşe kapsamı X=4,577,366…4,598,766 m, Y=1,085,130…1,106,618 m. Sol 120/WB1 (4,590,789.880; 1,092,970.249 m; sütun/satır 13,423/13,647) ile Sol 164/Roubion (4,590,923.166; 1,092,295.952 m; 13,557/14,322) raster içinde; örnek değerleri sırasıyla −2568.0872 m ve −2584.9160 m. Bu iki noktanın hücreleri geçerli görünür; **tüm rota boyunca no-data taraması yapılmadı**. Dosya boyutu/TIFF şeritleri/EOF tutarlı, tam dosya hash’i alınmadı. Bu TIFF incelemesi resmi label/SIS, kaynak/provenance, düşey datum, lisans/kullanım koşulu veya DTM kotlarının bilimsel yorumunu doğrulamamıştır; nokta kotlarını eski DTM/PDS değerleriyle eşdeğer kabul etme.

### Rota ve göstergeler

- Sol 120/WB1: 18.43906919°N, 77.44940206°E.
- Sol 164/Roubion: 18.42769340°N, 77.45165066°E.
- Uç noktaları birleştiren doğru, yerel projeksiyon düzleminde 686.204 m.
- **Kritik uyarı:** Bu çizgi gerçek PDS PLACES traverse polyline’ı değildir; iki tarihsel waypoint arasındaki sadeleştirilmiş bağlantıdır.
- `data/dtm_subset.json` içindeki `routeCheck`: 681 örnek, kot örneklemlerinde no-data yok; min/max −2588.546/−2568.352 m; uç kotlar −2569.435/−2588.449 m. 3×3 Horn eğimi ortalama 4.691°, P90 8.360°, maksimum 18.904°. Bunlar bu basitleştirilmiş çizgi boyunca arşiv DTM’den örneklenmiş/türetilmiş sonuçlardır; saha ölçümü veya güvenlik sınıflandırması değildir.
- 10 m/yan koridor **senaryo varsayımıdır**. Mesafe/koridor yerel equirectangular projeksiyon düzleminde hesaplanır; ~18.4° enlemde doğu-batı ölçek farkı yaklaşık %1.8’dir.

### Kaynak/attribution

- [HiRISE Jezero DTM ürün sayfası](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985)
- [HiRISE RDR/DTM SIS](https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF)
- [Mars 2020 PDS Initial Reports](https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf)
- [PDS PLACES bilgi sayfası](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm)
- [NASA PDS Search API kılavuzu](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html)

Veri katmanlarında kaynak, ürün/sürüm, atıf/lisans bilgisi, birim, düşey datum, CRS, mekânsal ve zamansal kapsam, dönüşüm ve no-data kuralı taşınmalı. Ölçülen/arşivlenen ürün değeri, model/hesap sonucu, senaryo varsayımı ve UI değeri ayrı etiketlenmeli. CRS veya datum bilinmiyorsa tahmin edilmemeli; gösterge `unavailable`/`needs_review` kalmalı. No-data asla 0’a dönüştürülmemeli. Simülasyon saati NASA gözlem zamanı değildir.

## Aşamalar

Tahminler bugünden ileriye yönelik odaklı çalışma saatidir; iki kişilik ekibin toplamı belirtilmedikçe Alparslan’ın entegrasyon/uygulama emeği içindir. İş paketleri kişinin daha önce belirli bir 3D kütüphanesini kullanmış olmasına bağlanmaz; kapsam, kabul ölçütü ve dosya sahipliği açıktır.

Aşama numaraları yürütme sırası değildir. **Güncel durum (14 Kasım 2026):** Stage 13 ve 16 rig kodu/testleri, Stage 17 alt beden entegrasyonu mevcut; Stage 17'nin bu turdaki bağımsız incelemesi statik olup görsel kabul açık. Önce Stage 15–17 first-person görsel kabul, sonra Stage 18 rölyef okunabilirliği gelir. Stage 19A kodu mevcut, fakat audit'teki veri/koordinat/hash caveat'leri nedeniyle 19B sözleşmesi henüz hazır değildir. Yeni USGS GeoTIFF adayı ürün özelinde düşey datum kanıtı olmadığı için `needs_review` sürer; legacy HiRISE fallback korunur. Orto verisi ve kayıt kanıtı ayrı iştir.

### 1. MVP kapsamını sabitleme — TAMAMLANDI

- **Amaç:** Challenge’a bağlı, kısa ve oynanabilir demo sınırını belirlemek.
- **Çıktı:** Kullanıcı kontrollü astronot; yerel harita; 60–90 sn demo akışı; rota/sapma ve en çok iki savunulabilir arazi göstergesi.
- **Sahip:** Alparslan (ürün kararı); Efe daha sonra gözden geçirebilir.
- **Bağımlılık:** Challenge ve veri kapsamı.
- **Kabul:** Kullanıcı astronotu kendisi kontrol eder; açıkça ölçüm/hesap/senaryo ayrımı vardır; güvenlik skoru yoktur.
- **Tahmin:** Tamamlandı; ileriye dönük ek iş yok.

### 2. Veri ve rota doğrulama — TAMAMLANDI / PLACES KOLU AÇIK

- **Amaç:** Kullanılabilir alanı, grid/ölçeği ve rota uçlarını kanıta dayalı belirlemek.
- **Çıktı:** HiRISE DTM/orto metadata’sı, PDS merkez-piksel transformu, yarım piksel kaydı notu, Sol120–Sol164 uçları ve yerel DTM profil/eğim özeti.
- **Sahip:** Alparslan; PLACES ham dosya doğrulaması için kısıtsız ağ erişimi olan ekip üyesi koşullu olarak.
- **Bağımlılık:** Yerel rasterlar ve PDS/HiRISE birincil dokümantasyonu.
- **Kabul:** Raster boyutu, CRS, ölçek, datum, no-data ve örnekleme açıklanmış; çizginin gerçek rover polyline’ı olmadığı görünür biçimde etiketli.
- **Tahmin:** Mevcut kanıt tamamlandı. PLACES ham CSV erişirse 2–4 saat; WUSTL/MEB engeli 45–60 dakikada çözülmezse durdur, veri uydurma.

### 3. Fixture tabanlı oynanabilir 2D MVP — TAMAMLANDI (kaynakta); kullanıcı kabulü bildirimi ayrıca

- **Amaç:** Uçtan uca demo akışını çalışır kılmak.
- **Çıktı:** `Sim` içinde vanilla JS Canvas 2D; WASD/oklar; senaryo saati; duraklat/yeniden başlat; rota/±10 m senaryo koridoru; DTM kotu/Horn eğimi; kaynak ve sınırlama paneli.
- **Sahip:** Alparslan (entegrasyon); Efe becerisi uygunsa demo/QA paketine destek olabilir.
- **Bağımlılık:** Aşamalar 1–2 ve yerel raster.
- **Kabul:** README’deki komutlarla başlar; hareket ve sapma çalışır; raster verisi yoksa uygulama açılır ve katman unavailable görünür; gerçek PLACES izi/güvenlik aracı gibi sunulmaz.
- **Tahmin:** Kod mevcut. Son regresyon başarısı kullanıcı bildirimi; bağımsız tekrar bu notta yapılmadı.

### 4. Hesaplama/veri/render ayrımı ve snapshot sözleşmesi — TAMAMLANDI (kaynakta)

- **Amaç:** Bilimsel hesapları UI/render durumundan ayırıp ileride başka renderer’a geçişi ucuzlatmak.
- **Çıktı:** `public/js/geo/geo.js` koordinat ve Horn saf fonksiyonları; `public/js/surface/layers.js` SurfaceProvider rolü; `public/js/simulation/sim.js` derin dondurulmuş `WorldSnapshot`; HUD ve render aynı snapshot’ı tüketir; debug yalnız opt-in.
- **Sahip:** Alparslan.
- **Bağımlılık:** 2D MVP.
- **Kabul:** Snapshot kopyalanıp derin dondurulmuş; `zM` Mars 2000 kotu, datum/status ile; no-data/unavailable `zM:null`; HUD örnekleme yapmıyor; renderer canlı sim/layer/adapter almıyor.
- **Tahmin:** Kod ve testler mevcut. Kullanıcı regresyonu geçtiğini bildirdi; bu ajan çalıştırmadı.

### 5. Regresyon kapısı — TAMAMLANDI (kullanıcı bildirimi)

- **Amaç:** Snapshot refaktöründen sonra oynanabilir 2D davranışını doğrulamak.
- **Çıktı:** Kullanıcı `npm test`, `npm run smoke` ve yerel elle denemelerin geçtiğini bildirdi.
- **Sahip:** Alparslan.
- **Bağımlılık:** Aşama 4.
- **Kabul:** Kullanıcının bildirimine göre regresyon kontrolleri başarılı. Loglar bu belgede incelenmiş/yeniden çalıştırılmış sayılmaz.
- **Tahmin:** Bildirilen test emeği tamamlandı; yeni kod öncesinde regression komutlarını tekrar çalıştırmak kodlama AI’sının kabul işi olmalı.

### 6. Yeni raster intake ve adapter kayıt katmanı — KISMEN TAMAMLANDI; yeni GeoTIFF doğrulaması açık

- **Amaç:** Yeni GeoTIFF adayını, kaynak/datum/kapsam doğrulandıktan sonra mevcut `SurfaceProvider`/snapshot yoluna bağlamak; belirsiz veriyle yanlış bilimsel değer üretimini engellemek.
- **Mevcut kaynak:** `public/js/surface/registry.js` manifest validator’ı, `SurfaceProviderRegistry`, HiRISE sağlayıcı/factory ve fallback’i içeriyor. `main.js` varsayılan HiRISE sağlayıcısını seçiyor; HUD doğrulama/seçim durumunu gösterebiliyor. `test/core.test.mjs` sentetik manifest ve fallback kontrolleri içeriyor.
- **Açık çıktı:** Eklenmiş TIFF adayının resmî ürün label/SIS ve kullanım koşullarını doğrula; düşey datum/provenance’ı kanıtla; tüm demo alanı ve rota boyunca footprint/no-data kapsamını çıkar; yeniden çerçeveleme ve raster hazırlama yöntemini belirle. Bu artık “veri gelmesini bekleme” işi değil, **resmi metadata doğrulama kapısıdır**. Kanıt geçerse yeni TIFF için bounded-window ingest/adapter tasarla ve registry geçişini yap. Veri/etiket belirsizken yeni formatı veya değerleri supported sayma.
- **Sahip:** Alparslan (factory/entegrasyon). Efe'nin becerisi ve kapasitesi uygunsa ayrı manifest/atıf denetimi veya test QA paketi alabilir.
- **Bağımlılık:** Aşama 4 SurfaceProvider/WorldSnapshot; yeni TIFF’in resmi tanımlayıcıları ve kullanım koşulu erişilebilir olmalı. Eski IMG/JP2 kullanıcı bildirimine göre geçersiz ve çalışma ağacında silinmiş görünüyor; dosya değişikliklerine dokunma.
- **Mevcut açıklar:** (1) license/usage alanı yok ve doğrulanmıyor; (2) coverage yalnız `description` metniyle denetleniyor, sayısal footprint ve rota/dünya kesişimi doğrulanmıyor; (3) `verticalDatumVerified` yalnız `false` iken review oluşturuyor, alan yokken manifest supported olabilir; (4) `expectedFrame` `validateLayerManifest()` için opsiyonel ve verilmezse CRS/grid karşılaştırmaları atlanıyor; `transformVerified` bayrağı dönüşümü matematiksel olarak doğrulamıyor.
- **Kabul:** Yeni rasterın kaynak, datum, lisans/kullanım, frame dönüşümü, sayısal footprint ve tüm rota no-data durumu belgelendirilmiş doğrulanabilir kanıtla geçer; geçmezse aktif örnekleme olmaz. Başarılı geçişte 2D ve 3D aynı yeni provider/snapshot sözleşmesini kullanır. Registry’nin fallback kabiliyeti korunur; fallback yalnız ayrı doğrulanmış/kullanılabilir HiRISE provider’a gider. Kullanıcı tarafından geçersiz bildirilen mevcut IMG/JP2 provider olarak seçilmez; kullanılabilir doğrulanmış provider yoksa katman `unavailable` olur.
- **Tahmin:** Kodun yeni denetiminden önce süre tahmini verilmesin. Gerçek format geldiğinde adapter kapsamı o verinin label/SIS ve dönüşümüne göre ayrıca belirlenir.
- **Kesme çizgisi:** Bilinmeyen CRS/datum’ı “otomatik algılama” ile içeri alma. Doğrulama/adapter tamamlanamıyorsa eski fixture’a sessizce dönme; katmanı `unavailable` bırakıp UI’da ve demo planında durumu açıkça göster.

**Not:** Registry/manifest validator kaynakta mevcut, ancak desteklenen mevcut biçim hazırlanmış `PDS3_PC_REAL_F32_WINDOW` ve varsayılan provider eski HiRISE DTM’dir. Yeni GeoTIFF’in kayıt/loader biçimi henüz uygulanmış veya doğrulanmış değildir. Eski validator test kayıtları yeni TIFF kabulü sayılmaz.

### 7. Gerçek PLACES traverse doğrulaması — AÇIK / 3D dikey dilimden sonra ayrı dış veri işi

- **Amaç:** Basitleştirilmiş çizgiyi gerçek traverse ile, erişilebilir olduğu ölçüde değiştirmek veya karşılaştırmak.
- **Çıktı:** PDS release/ürün kimliği doğrulanmış ham lokalizasyon dosyası ve PDS4 label/SIS; Sol 120–164 kayıt filtresi; koordinat/frame dönüşümü; DTM extent ve no-data filtresi; gerçek polyline uzunluk/profil karşılaştırması.
- **Sahip:** Alparslan; Efe'nin erişimi varsa indirme/label incelemesine destek vermesi koşullu.
- **Bağımlılık:** PDS’nin raw CSV’sine engelsiz erişim ve coordinate frame belgeleri.
- **Kabul:** Üçüncü taraf yerine PDS primary file; koordinatlar dokümana göre dönüştürülmüş; footprint/no-data gerçekten kontrol edilmiş; yol noktaları/ölçüm zamanları kaynağıyla sunulmuş. Erişim yoksa mevcut çizgi simülasyonda kalır ve “gerçek PLACES değil” etiketi korunur.
- **Tahmin:** 2–4 saat erişim sağlandığında; 45–60 dakika endpoint denemesinden sonra engel tekrarlanırsa park et ve hackathon demosunu bloke etme.

### 8. Demo kapsamı ve sunum akışı — TAMAMLANDI

- **Amaç:** Kısa, tekrar edilebilir ve bilimsel sınırlamaları açık demo hazırlamak.
- **Çıktı:** 3D `?view=3d` doğrudan açılış parametresi, başlangıçta Sol 164 Roubion fenerine hedef kilidi (`targetYawRad`), first-person ekran nişangahı (`#fp-reticle`), ekran içi HUD kontrol kapsülü (`#fp-hud-hint`) ve Sol 164 varış başarı rozeti entegre edildi. 2D fallback tam olarak korunur.
- **Sahip:** Alparslan (entegrasyon ve demo sunumu).
- **Kabul:** Yeni makinede README adımları; WASD, duraklat, koridor dışı/geri dönüş ve katman unavailable durumu denenmiş; gerçek PLACES değil ve güvenlik aracı değil açıklaması gözle görünür; attribution okunabilir. Bağımsız testlerde 24/24 unit test, 32/32 smoke testi ve 60.4 FPS geçmiştir.

### 9. 3D terrain viewer — İLK RUNTIME KABULÜ TAMAM; SON OPTİMİZASYON REGRESYONU SIRADA

- **Amaç:** Doğrulanmış HiRISE DTM/fixture’ını kaynağı değiştirilebilir provider sınırında tutarak 3D terrain ve snapshot-driven renderer için teknik taban sağlamak. Bu orbit-camera viewer, nihai FPS keşif deneyimi değildir.
- **Çıktı:** Aşamalı 3D sahne/terrain ve etkileşim. Terrain mesh ve no-data boşlukları; kullanıcı kontrollü astronot/avatar; kamera ve temel aydınlatma; mevcut WorldSnapshot/HUD ile entegrasyon. Ayrı render modülü; Mars 2000 bilimsel `zM` ile görsel vertical scale/offset kararı yazılı. 2D renderer ara sürüm/fallback olarak korunur.
- **Sahip:** Alparslan runtime/scene/camera seçimi ve uygulama entegrasyonunun; Efe renderer’dan bağımsız CPU terrain mesh builder’ın sahibidir.
- **Bağımlılık:** Aşama 4 WorldSnapshot/SurfaceProvider sınırı; başlangıç verisi olarak yerel HiRISE fixture. Organizer verisi gelirse aşama 6 intake tamamlanmadan ona geçme.
- **Kabul:** 3D yalnız mevcut arşiv/hesaplanan veriyi doğru provenance ile sunar; `zM` kaynak kotu olarak kalır ve görsel dikey abartıdan ayrılır; no-data mesh’te sahte sıfır yüzey üretmez; `zM=null` iken 3D avatar modeli gizlenip yatay konum ve “yükseklik bilinmiyor” durumu HUD/ekran göstergesinde korunur; avatar ve kamera snapshot/sim kurallarıyla çalışır; 2D sürüm açılabilir kalır.
- **Tarihsel ilk kabul (13 Kasım 2026):** Stage 9 kabul düzeltmeleri `d471d6a` commit’inde; o turda `npm test` 13/13, `npm run smoke` 26/26 geçti. Başsız smoke ölçümü 1.93 sn mesh CPU / 3.21 sn ilk 3D geçişi ve 29.1 FPS verdi; FPS ortam koşullarına duyarlıdır, GPU belleği ölçülmedi. Sonraki `661d9c7` optimizasyonu `643026b` ile entegre edildi.
- **Güncel kapanış:** `fbc623f` üzerinde optimizasyon sonrası birleşik sürüm bağımsız olarak denetlendi; `npm test` 18/18 ve `npm run smoke` 32/32 geçti. İlk bağımsız smoke turundaki iki mevcut 2D timing kontrolü tekrar çalıştırmada geçti. Stage 9 regresyon kontrolü artık beklemede değildir.

### 10. Birinci şahıs Mars keşfi ve karakter hareketi — ENTEGRASYON TAMAMLANDI

- **Amaç:** Terrain viewer'ı FPS/first-person keşif yönünde ilerletmek: göz hizası kamera, kamera yönüne göre hareket, DTM üzerinde zemin teması ve kaynaklı Mars yerçekimiyle düşey hareket. Bu shooter değildir.
- **Çıktı:** Küçük ve oynanabilir first-person dikey dilim; simülasyon zaman adımına bağlı hız/ivme ve zemin teması kuralları; 3D kamera/input/snapshot entegrasyonu. Oyuncu ayak/beden yüksekliği, kaynak yüzey kotu `zM` ve görsel `zDisplay` ayrı temsil edilir. Astronot rig/pozu ayrı modülde hazırlanır ve sonra renderer’a bağlanır.
- **Sahiplik:** Tamamlanan Stage 10 paketinde Alparslan `main.js`, `config.js`, `simulation/`, `input/`, `view/3d/camera.js`, `renderer.js` ve snapshot/provider entegrasyonunu koordine etti; Efe `view/3d/astronaut-rig.js` içinde renderer’dan bağımsız, sunum amaçlı parça geometrisi ve poz üreticisini sağladı. Ortak hareket API’si `timeS`, yatay/düşey hız, `grounded`, açık jump trajectory `airborne`, `phase` ve `groundContactStatus` alanlarını taşır. Gelecek işlerde de entegrasyon sıcak noktalarının tek sahibi Alparslan’dır; Efe’ye yeni modül/QA paketi açık dosya sınırıyla ayrıca atanır. Aynı dosya kümesi eşzamanlı düzenlenmez.
- **Bağımlılık:** Stage 9 runtime kabulinde HiRISE 3D terrain akışının kullanılabilirliği; Stage 4 snapshot/provider sınırı; HiRISE DTM fixture. Yarışma dataset’i veya yeni terrain adapter gerekmez.
- **Fizik/atmosfer:** Model parametreleri NASA birincil kaynak, birim ve kapsamla belgelensin. 3.71 ve 3.73 m/s² kaynak yuvarlamaları açık tutulup seçilen g girdisi gerekçelendirilsin. Basınç/yoğunluk genel/ortalama referans olarak etiketlensin. İnsan/giysi kütlesi, kesit alanı, sürükleme katsayısı ve yerel rüzgâr doğrulanmadan bunların etkisi gerçekçi karakter fiziği diye sunulmasın; atmosfer girdisi parametrelenmemişse sayısal kuvvet eklenmesin.
- **Kabul:** Kamera göz hizasında oyuncu konum/yönünü izler; bakış açısı kullanıcı kontrolündedir; kamera yönüne göre normalize edilmiş hareket; simülasyon zaman adımından bağımsız tutarlı hareket ve pause/restart; geçerli DTM kotuna basma; no-data/invalid/out-of-bounds/unavailable kot sıfıra çevrilmeden açık fallback; `zM` ile görsel Z ayrımı; 2D fallback korunur. Efe’nin animasyon modülü aynı girdi için deterministik idle/walk/stop/airborne pozları verir; renderer entegrasyonu sonrası first-person görünümde kolların/gövdenin kadrajda okunabilirliği ayrıca gözden geçirilir.
- **Durum (13 Kasım 2026):** Stage 10 kod paketi `fbc623f` (`feat: integrate astronaut rig into first-person renderer`) ile tamamlandı ve origin’e push edildi. Alparslan first-person kamera/yönlü hareket/DTM teması/kaynaklı Mars g girdisi ile rig renderer entegrasyonunu; Efe renderer’dan bağımsız `astronaut-rig.js` parça şablonu ve deterministik poz üreticisini sağladı. Snapshot API’si `grounded`, açık `airborne` jump niyeti ve `groundContactStatus` değerlerini ayırır; bilinmeyen temas tek başına yerçekimi başlatmaz veya uçuş pozu iddia etmez. Bilinmeyen kotta dünya rig’i gizlenir, first-person view-model retained kamera pozu varsa kalabilir. Bağımsız doğrulama `npm test` 18/18, `npm run smoke` 32/32 geçti. Bu, nihai ürün tamamlandı anlamına gelmez; UX gözden geçirmesi ve demo kararı sürer.

### 11. 3D Waypoint beacon'ları ve rota kılavuz geometrisi (marker-mesh) — TAMAMLANDI

- **Amaç:** Stage 8 first-person demo akışında astronotun arazide ilerlerken hedefini (Sol 164 / Roubion), başlangıç noktasını (Sol 120 / WB1) ve basitleştirilmiş rota koridorunu 3D uzayda görebilmesini sağlamak; renderer'dan bağımsız saf geometri üretmek.
- **Çıktı:** `Sim/public/js/view/3d/marker-mesh.js` içinde `buildMarkerMeshes({ waypoints, routePoints, corridorWidthM, displayConfig })` API'si ve `Sim/test/marker-mesh.test.mjs` testleri. Sol 120 ve Sol 164 zemin beacon'ları (kaide, dikme, fener), rota boyunca zemin kılavuz şeridi/segmentleri, ±10 m senaryo koridor sınır işaretleri. Saf `Float32Array`/`Uint32Array` geometri veya parça tanımları, derin dondurulmuş veri yapısı ve PDS/sadeleştirilmiş rota caveat metadata'sı.
- **Sahip:** Efe (bağımsız 3D geometri modülü); Alparslan (renderer entegrasyonu).
- **Bağımlılık:** Stage 10 first-person temeli; `config.js` waypoint koordinatları ve DTM yüzey kotu. Renderer entegrasyonu Alparslan'da kalır.
- **Kabul:** WebGL veya DOM nesnesi döndürmez; saf veri üretir. `npm test` altında deterministik 6 birim testi (toplam 24/24) geçer. Sol 120/164 PDS koordinatları ve rota basitleştirilmiş bağlantı caveat'ı metadata içinde taşınır. Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` dosyalarına dokunmaz.
- **Durum:** `8054b1a` ile tamamlandı, Alparslan renderer'a entegre etti; bağımsız birim testleri (24/24) geçti.

### 12. Mars Düşük Yerçekimi Zıplama Fiziği ve Kamera Dinamiği (Alparslan) — TAMAMLANDI

- **Amaç:** Mars'ın 3.71 m/s² yerçekimi altında astronotun zıplama fiziğini gerçekçi kılmak (uzun havada kalma süresi ~1.3 saniye, havada yatay momentumun korunumu / balistik ark, iniş darbe sönümleme süresi / landing impact absorption). Birinci şahıs kamerada adım kafa salınımı (head-bobbing) ve yere inişte yumuşak kamera esnemesi (landing camera dip).
- **Dosya Sınırı:** `Sim/public/js/simulation/sim.js`, `Sim/public/js/config.js`, `Sim/public/js/view/3d/camera.js`, `Sim/public/js/main.js`.
- **Çıktı:**
  - `sim.js`: Mars yerçekimi ($3.71\text{ m/s}^2$) altında zıplama balistiği (itki hızı $\approx 2.4\text{ m/s}$, tepe yüksekliği $\approx 0.78\text{ m}$, havada kalma süresi $\approx 1.29\text{ s} \approx 1.3\text{ s}$), havada yatay momentumun korunumu (havada anlık yön sıfırlanması yerine balistik serbest intikal), zemin temasında iniş darbe sönümleme süresi (`landingRecovery` $\approx 0.25\text{ s}$, zemin temasında ani tekrar zıplamayı engelleyen ve yatay hızı sönümleyip toparlayan mekanizma).
  - `config.js`: Zıplama fizik sabitleri ($g = 3.71\text{ m/s}^2$, $v_{z0} = 2.4\text{ m/s}$, `landingRecoveryDurationS: 0.25`).
  - `camera.js`: Birinci şahıs kamerada adım adım yürüyüş döngüsüne bağlı sinüsoidal kafa salınımı (head-bobbing) ve iniş anında aşağı doğru yumuşak yaylanma/esneme (landing camera dip: `eyeOffsetM` ve `pitchOffsetRad` dinamik ofsetleri).
  - `main.js` & Snapshot sözleşmesi: `WorldSnapshot` astronot nesnesinde Efe'nin kinematik modülünün tüketeceği durum alanları (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`, `landingRecoveryFrac`).
- **Sahip:** Alparslan (simülasyon, config, kamera ve entegrasyon koordinatörü).
- **Doğrulama:** Commit `58660f0` ile uygulandı; bağımsız `npm test` 29/29, `npm run smoke` 32/32 (59.3 FPS). Efe'nin `astronaut-rig.js` dosyasına dokunulmadı.

### 13. Düşük Yerçekimi EVA Loping ve Sıçrama/İniş Poz Kinematiği (Efe) — KODDA TAMAMLANDI; GÖRSEL KABUL AÇIK

- **Amaç:** Apollo/Mars EVA araştırmalarındaki düşük yerçekimi sıçramalı yürüyüş döngüsü (loping gait), zıplamada havada süzülme (apex balance pose) ve inişte diz bükme/darbe emme (landing squash & recover) pozları. First-person view-model kollarda nefes ve adım salınımı.
- **Dosya Sınırı:** Yalnızca `Sim/public/js/view/3d/astronaut-rig.js` ve buna ait birim testleri.
- **Sınır Kuralı:** Efe `renderer.js`, `camera.js`, `main.js`, `config.js`, `simulation/`, `input/` ve snapshot sözleşmelerine DOKUNMAZ. Alparslan'ın movement API girdilerine (`timeS`, `horizontalSpeedMps`, `verticalSpeedMps`, `grounded`, `airborne`, `phase`, `landingRecovery`) göre saf deterministik poz üretir.
- **Çıktı:**
  - `astronaut-rig.js`:
    - Düşük yerçekimli EVA loping gait: Apollo astronotlarının Ay/Mars benzeri düşük g ortamındaki karakteristik sıçramalı/sekerek adım kinematiği.
    - Zıplama havada süzülme pozu (apex balance pose): dikey hız sıfıra yaklaşırken bacak ve gövde denge açısı.
    - İniş darbe emme pozu (landing squash & recover): iniş temasında dizlerin bükülmesi ve gövdenin esneyerek toparlanması.
    - First-person view-model: alt kadrajda görünen kollarda dururken nefes alma (idle breathing) ve adım senkronize salınım.
  - Birim testleri: Deterministik poz açıları, bilinmeyen girdide güvenli nötr poza dönüş.
- **Sahip:** Efe (bağımsız astronot rig ve animasyon kinematiği).
- **Durum:** Kod mevcut; kaynakta deterministik poz ve API alanları (`landingRecoveryFrac`, `groundContactStatus`, `gaitDistanceM`) bulunur. `8e7173c` Stage 16 iyileştirmeleri de rig'i geliştirmiştir. Yeni Stage 13 kod görevi açık değildir; görsel kabul Stage 15–17 tarayıcı incelemesinin parçasıdır.
- **Bağımlılık:** Stage 10 astronot rig temeli ve Stage 12 movement API girdileri. Raster/provider migration’ına teknik bağımlılığı yoktur.
- **Kabul:** Deterministik çıktı: aynı hareket durum parametreleri için aynı eklem açıları/poz transformları üretilir. Bilinmeyen veya tanımsız girdide nötr güvenli poza döner. WebGL veya DOM nesnesi üretmez. Birim testleri yalnız kullanıcı test çalıştırmaya izin verirse çalıştırılır; varsayılan iş akışına test çalıştırma dahil değildir.

### 14. EVA suit ayrıntıları ve first-person entegrasyonu — KODDA MEVCUT; GÖRSEL KABUL AÇIK

- **Dosya/Git kanıtı:** `e14b661` rig'e eldiven/göğüs ünitesi ve zincirli eklem verisi ekledi; `502d76c` kask/ayak bileği, kamera ve renderer entegrasyonunu; `18b4137` koordinat, HUD ve 1:1 first-person view-model düzeltmelerini içerir.
- **Sınır:** Rig geometrisi ve pozları sunum amaçlıdır. Atmosfer shader'ı çevresel görseldir; Jezero anlık ölçümü veya astronot hareketine atmosfer kuvveti kanıtı değildir.
- **Açık kabul:** Yürüyüş, sıçrama evreleri, iniş, duraklatma ve bilinmeyen yüzey temasında gerçek görüntü incelenmeden kadraj/örtüşme kalitesi kabul edilmiş sayılmaz. Başlıktaki Alparslan görsel kabulü ve Efe rig denetimi bu açık için tanımlanmıştır.

### 19. Kullanıcı Konumunda USGS SIM 3464 Jeolojik Birim Motoru ve Harita Katmanı — 19A VE 19B KODDA TAMAMLANDI (`c5d0e51`, `04f12f4`); GÖRSEL KABUL AÇIK

- **Amaç:** Astronotun Sol 120–164 koridorunda yürürken üzerinde bulunduğu resmi USGS jeolojik birimini (`Njf` Jezero floor unit, `Nle` Lower etched unit / Séítah, `NHjf2` Jezero floor unit 2) anlık olarak tespit etmek; HUD'da birimin resmi kodunu, yaşını ve kayaç/mineral özetini göstermek; 2D/3D/minimap görünümde isteğe bağlı yarı saydam jeolojik birim sınır katmanı sunmak.
- **Kaynak Veri:** `Sim/data/usgs-sim3464-geology/jezero_geounits_corridor.geojson` (`135 KB`), `manifest.json`, `sim3464_metadata.xml` ve `sim3464_pamphlet.pdf` (Sun & Stack, 2020 — USGS Scientific Investigations Map 3464).
- **İş Bölümü ve Dosya Sınırı:**
  - **19A — Efe (tamamlandı, `cdc7ca3`, `c5d0e51`):** `Sim/public/js/geo/geology.js`, `Sim/test/geology.test.mjs`; 12 alanlı `GEOLOGY_SNAPSHOT_CONTRACT`, `toGeologySnapshot` ve `createGeologicContactField`/`nearestGeologicContactM` yazıldı; belirsizlikler `Sim/stage19a-geology-audit.md` içinde belgelendi.
  - **19B — Alparslan (kodda tamamlandı, `eb74b6f`, `2d7c27b`, `04f12f4`, `3167130`):** `main.js`, `simulation/sim.js`, `view/hud.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`; 12 alanlı snapshot sözleşmesi, kontak mesafesi, no-data boşluklarında kırılan 3D sınır çizgileri ve HUD belirsizlik (`100–200 m`)/lisans (`not_stated`)/caveat metinleri bağlandı.
- **Kabul:** Yalnız kaynak ve CRS/konum kayıtları yeterli ise gösterim yapılır; 100–200 m belirsizliği gizlenmez ve saha gerçeği iddiası kurulmaz.

### 20. Arşiv Perseverance Sürüş İzi (`M20_traverse.json`) ve 16 Ara Sol Durağı (`M20_waypoints.json`) — 20A VE 20B KODDA TAMAMLANDI (`48e330b`, `04f12f4`); GÖRSEL KABUL AÇIK

- **Amaç:** Mevcut sadeleştirilmiş kuş uçuşu yürüyüş koridorunu korurken, yanına gerçek arşiv Perseverance rover sürüş izini (`Sol 116 Site 4 Drive 1250` $\to$ `Sol 157 Site 6 Drive 0`) ve aradaki 16 resmi sol durağını (`Sol 122..157`) karşılaştırmalı referans katmanı olarak eklemek.
- **Kaynak Veri:** `Sim/data/mars-trek/M20_waypoints.json`, `Sim/data/mars-trek/M20_traverse.json` ve `perseverance_traverse_fgdc.html`.
- **İş Bölümü ve Dosya Sınırı:**
  - **20A — Efe (tamamlandı, `48e330b`):** `Sim/public/js/geo/traverse.js`, `Sim/public/js/view/3d/marker-mesh.js` (`buildIntermediateSolMarkers`) ve `Sim/test/traverse.test.mjs`.
  - **20B — Alparslan (kodda tamamlandı, `04f12f4`, `3167130`):** `Sim/public/js/view/traverse-layer.js`, `main.js`, `view/render.js`, `view/3d/renderer.js`, `view/minimap/minimap.js`, `index.html`. 2D, 3D ve minimap sahnesinde arşiv izini ve 3D ara sol dikmelerini sunar; Sol 116→157 sürüş kaydı ile Sol 120/164 görüntü kayıtları ayrımını gösterir.
- **Kabul:** Canlı rover telemetrisi veya güvenli rota iddiası kurulmaz; arşiv ürünü ile senaryo koridoru görsel ve metinsel olarak net biçimde ayrılır.

### 21. 25 cm HiRISE Ortomozaik WMTS Karo Birleştirme ve 2D/3D Doku Kaplaması — 21A TAMAMLANDI (`d1abe35`); 21B PİKSEL HİZALAMA KANITI BEKLİYOR

- **Amaç:** Tarayıcıda çözülemeyen ve geçersiz bildirilen eski `.JP2` ortogörüntü yerine, aktif 1 m DTM ile aynı `soc_006` kontrol ağını paylaşan resmi Mars Trek HiRISE ortomozaik PNG karolarını (`JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`) piksel hizası doğrulandıktan sonra 2D harita, minimap ve 3D WebGL2 arazi mesh'ine doku olarak bağlamak.
- **Kaynak Veri:** `Sim/data/mars-trek/ortho-tiles/` (91 PNG karo, Zoom 13–17), `hirise_ortho_25cm_WMTSCapabilities.xml` ve `hirise_ortho_25cm_fgdc.html`.
- **İş Bölümü ve Dosya Sınırı:**
  - **21A — Efe (tamamlandı, `d1abe35`):** `Sim/scripts/build-ortho-mosaic.mjs`, `Sim/test/ortho-mosaic.test.mjs` ve `Sim/stage21a-ortho-audit.md`.
  - **21B-Ön / 21B — Efe (kayıt kanıtı) → Alparslan (2D/3D/minimap doku kaplaması):** Etkin DTM ile piksel/yarım-piksel hizası doğrulanana kadar katman kapalı tutulur (`index.html`'de açık bilgi notu mevcut).
- **Kabul:** DTM'den türetilen hillshade hiçbir zaman ortofoto diye adlandırılmaz; ortomozaik yalnızca WMTS piksel/UV kaydı doğrulandığında çizilir ve kapsam dışı alan şeffaf kalır.

### 22. Sol 120 ve Sol 164 Perseverance Yer Seviyesi Saha Fotoğrafları ve 3D Kamera Bakış Hizalama — 22A VE 22B KODDA TAMAMLANDI (`4d6bd10`, `04f12f4`); GÖRSEL KABUL AÇIK

- **Amaç:** Astronot WB1 (`Site 4, Drive 1250`) veya Roubion (`Site 6, Drive 0`) durağındayken, Perseverance rover'ın o noktada çektiği gerçek yer seviyesi fotoğrafları göstermek ve 3D birinci şahıs kamerasını rover'ın fotoğrafı çekerken baktığı tahmini azimut/eğim (`mastAz`/`mastEl`) açısına hizalamak.
- **Kaynak Veri:** `Sim/data/perseverance-raw/manifest.json`, `sol120/` (6 JPEG), `sol164/` (6 JPEG).
- **İş Bölümü ve Dosya Sınırı:**
  - **22A — Efe (tamamlandı, `4d6bd10`):** `Sim/public/js/geo/rover-observations.js`, `Sim/test/rover-observations.test.mjs` ve `Sim/stage22a-rover-observations-audit.md`.
  - **22B — Alparslan (kodda tamamlandı, `04f12f4`):** `Sim/public/js/view/rover-gallery.js`, `main.js`, `view/3d/camera.js`, `index.html`, `styles.css`. Duraklarda fotoğraf galerisini (`observation.credit` ham künyesi ve LMST/UTC saatiyle) ve `SUPERCAM_RMI` hariç mast kameralarında `SITE_FRAME_ASSUMPTION` uyarılı "Rover kamerasının tahmini yönüne bak" butonunu bağlar.
- **Kabul:** Fotoğraflar arşiv gözlemi olarak sunulur; canlı yayın izlenimi verilmez; site çerçevesi varsayımı açıkça belirtilir.

## Paralel çalışma şeritleri ve dosya sınırları

Her bağımsız iş bir kabul ölçütü ve belirli bir dosya kümesiyle tanımlansın. Aynı dosya kümesini aynı anda yalnız bir kişi/AI değiştirsin; bağımsız şeritler ayrı branch ve commit'lerle ilerleyebilir. Efe'nin 3D runtime deneyimi bilinmiyor diye kod görevi bekletilmez: CPU mesh builder görevinde render kütüphanesi bağımlılığı yoktur; gerçek teknik engel çıkarsa Alparslan’la kapsamı daraltıp yardım istenir.

| Şerit | Ana klasör | Bağımsız iş örnekleri ve sınır |
|---|---|---|
| Geometri (`geo`) | `Sim/public/js/geo/` | PDS koordinat dönüşümünü veya saf geometri fonksiyonlarını incelemek; dönüşüm varsayımlarını belgelemek. Veri yükleyicisini veya simülasyon state'ini değiştirmez. |
| Yüzey/veri (`surface`) | `Sim/public/js/surface/` | Manifest/atıf/lisans metadata QA’sı veya yeni validator kuralının sınırlı uygulaması. Gerçek dataset, label ve kullanım koşulu doğrulanmadan adapter/format uydurulmaz. |
| Simülasyon (`simulation`) | `Sim/public/js/simulation/` | Hareket, saat, faz ve rota metriği kurallarını incelemek; UI/DOM veya Canvas koduna dokunmamak. |
| Girdi (`input`) | `Sim/public/js/input/` | Klavye ve kontrol erişilebilirliği/olay eşlemesini iyileştirmek; simülasyon kuralını bu dosyalara taşımamak. |
| Görünüm (`view`) | `Sim/public/js/view/` | 2D Canvas ara sürümü ve yeni `view/3d/` sahne, terrain, kamera modülleri; bilimsel örnekleme veya rota hesabını görünüm katmanına eklememek. |

PLACES kaynağı, yeni raster geçişi, orto decoder/alignment ve attribution/manifest QA ayrı kabul ölçütlü şeritlerdir. `public/js/main.js`, `config.js`, `geo/` frame varsayımları ve snapshot/provider sözleşmeleri Alparslan'ın koordine ettiği entegrasyon sıcak noktalarıdır. Stage 13 ve 16 kodu tamamlandı; Stage 17 entegrasyonu kaynakta mevcut fakat görsel kabulü açık. Stage 18, Stage 15–17 görsel kabulinden sonra başlar. Stage 19B, yalnız 19A audit caveat'leri ve sözleşmesi netleştiğinde yürütülür. Stage 20/21/22'nin her birinde A hazırlığı kendi B entegrasyonunun önkoşuludur; her çift ayrı kabul kapısıyla ilerler. Stage 6 USGS adayının datum belirsizliği nedeniyle açık kalır ve Stage 19–22 ile karıştırılmaz.

### Tarihsel iş bölümü: Stage 8–12 sonrası raster migration ve Stage 13 planı

| Sahip | Görev paketi | Dosya sınırı | Kabul ölçütü |
|---|---|---|---|
| Alparslan (veri kabul kapısı; ilk iş) | Yeni TIFF için resmî product identity/label/SIS, provenance, lisans/kullanım, vertical datum, grid/PixelIsArea yorumunu doğrula; rota boyunca footprint/no-data QC kanıtını tamamla. | Belge/araştırma çıktısı; çalışma ağacındaki rastera salt okunur erişim. Henüz kod/veri/test değişikliği yok. | Kullanılabilir bir kaynak/datum/kullanım beyanı, dönüşüm girdileri ve tüm demo rotası/kapsam QC’si belgelenir; bilinmeyen alan kalırsa aday reddedilir veya `needs_review` olarak kalır. |
| Alparslan (frame/provider entegrasyonu; QC kapısı geçince) | Equirectangular lat_ts=0/lon₀=0 frame'ine ve yeni provider'a kontrollü geçiş; 2D/3D render aynı snapshot/provider sözleşmesini kullanır. Eski sabitler, HUD atıfları ve örnekleme durumları birlikte güncellenir. | Entegrasyon sahibi tek başına: `Sim/public/js/config.js`, `geo/`, `surface/registry.js`, provider/layers sözleşmeleri, `Sim/public/js/main.js`, HUD ve zorunlu entegrasyon noktaları. | Yeni kaynak doğrulandığında 2D ve WebGL2 aynı konumda geçerli örnek verir; başarısız/unknown candidate `unavailable` kalır. Fallback kabiliyeti kayıtlı kalır fakat yalnız ayrı doğrulanmış/kullanılabilir provider seçilebilir; mevcut geçersiz bildirilen IMG/JP2’ye fallback yapılmaz. |
| Efe (bounded raster hazırlama; frame/metadata sözleşmesi dondurulduktan sonra ayrı branch) | 1.84 GB tam GeoTIFF’i tarayıcıya yüklemeyen, doğrulanmış demo kapsamı için sınırlı pencere/tiling hazırlama akışını tanımla ve uygula; kaynağın provenance/no-data bilgisi çıktıda korunur. | `Sim/scripts/` içindeki ayrı hazırlama aracı ve ona ait yeni test dosyaları; `config.js`, `main.js`, `registry.js`, provider/snapshot sözleşmelerine dokunmaz. Testler kullanıcı istemedikçe çalıştırılmaz. | Hazırlanan çıktı sınırları bellidir, metadata ile kaynak raster/frame/no-data’ya izlenebilir ve tam kaynak raster runtime belleğine alınmadan okunabilir; rotanın her hücresi için no-data durumu raporlanır. |
| Alparslan (Stage 15–17 görsel kabul) | Kamera, gait, alt beden görünürlüğünü browser'da incele. | Gözlem/rapor; kod düzeltmesi gerekirse ayrı görev ve dosya kümesi. | Yürüme, aşağı bakış, sıçrama/iniş ve unknown-contact kareleriyle görsel kabul kararı; 2D fallback ve temas caveat'i korunur. |
| Alparslan (Stage 18 rölyef) | Stage 15–17 görsel kabulinden sonra arazi rölyef okunabilirliği. | `main.js`, `view/3d/terrain-mesh.js`, `renderer.js`, `marker-mesh.js` ve sunum sınırı; tek görevde. | İki sabit noktada yükselti değişimi daha okunur; kaynak kot/no-data korunur, görsel abartı etiketlidir. |
| Efe (Stage 19A audit kapanışı) | Mevcut `cdc7ca3` jeoloji modülü için koordinat/waypoint/hash/lisans caveat'lerini kaynakla netleştir. | Audit raporu ve yalnız önceden koordine edilmiş metadata belgeleri; Alparslan'ın runtime dosyalarına dokunmaz. | 19B için birim/konum güveni ve açıkça gösterilecek belirsizlikler donmuş sözleşmede yazılıdır. |
| Sonraki bağımsız işler | Gerçek PLACES izi (dış erişim), orto decoder/alignment (yeni orto ve kayıt kanıtı gelirse), demo anlatısı. | Her iş ayrı branch/dosya sınırı; entegrasyon sıcak noktaları yukarıdaki sahibinde kalır. | Yeni veri migration’ını bloke etmez; kaynak ve kayıt kanıtı olmadan gerçek traverse veya orto overlay iddiası üretilmez. |

#### 3D renderer arayüz sözleşmesi — ilk dikey dilim

- **Kurulum/veri hazırlama:** `buildTerrainMesh(layer, displayConfig)` benzeri builder yalnız DTM/provider yüklendikten sonra bir kez çağrılır. `GridElevationLayer.cellState()` ile hücre geçerliliğini ve grid koordinatlarını kullanıp kopyalanmış, hazırlanmış bir terrain mesh asset’i döndürür. Kare başına builder çağrılmaz. Runtime’dan bağımsız arayüz: `positions: Float32Array` (her vertex için local X/Y metre + display Z), `normals: Float32Array`, `indices: Uint32Array`, `sourceElevationsM: Float32Array` (her vertex’in özgün Mars 2000 kotu), `bounds` (local min/max X/Y/display Z), `provenance` (source/product, datum, çözünürlük, kaynak kot aralığı, valid vertex ve atlanan quad sayıları) ve kullanılan display config. Grid eksenleri mevcut `GridElevationLayer` dönüşümlerinden alınır; CRS/datum varsayımı eklenmez. Test çalışması veya test dosyası değişikliği bu görev kapsamında değildir.
- **Kare çizimi:** `render3D({ snapshot, camera, terrainMesh })` benzeri saf render girişi yalnız derin dondurulmuş `WorldSnapshot`, kamera ve hazırlanmış mesh asset’ini tüketir. Renderer canlı `sim`, `layer`, `SurfaceProvider` veya adapter almaz; yükseklik örneklemesi başlatmaz. `main.js` kurulumda builder’ı, her karede renderer’ı çağırıp aynı snapshot’ı paylaşır.
- **Görsel kot dönüşümü (mevcut eski HiRISE provider sözleşmesi):** Eski kaynak `snapshot.astronaut.zM` ve mesh kotları Mars 2000 metre değerleri olarak korunur. Yeni TIFF için düşey datum henüz doğrulanmadığından bu varsayım yeni kaynağa aktarılmaz; yeni manifest kaynak datumunu açıkça taşır ve dönüşüm kanıtlanmadan örnekleme açılmaz. Görsel yükseklik yalnız açık `displayConfig` girdileriyle `zDisplay = (zM - referenceElevationM) × verticalScale` formülünden türetilir. `referenceElevationM` bir görüntüleme başlangıcıdır, datum dönüşümü değildir; WB1 için sabit offset veya bilimsel datum düzeltmesi hardcode edilmez.
- **No-data ve avatar:** Mesh builder yalnız dört köşesi de geçerli olan grid quad’larını triangulate eder; no-data/invalid hücreyi sıfıra çevirmeden ve bilinmeyen üzerinden üçgen köprü kurmadan boş bırakır. Snapshot’ta `astronaut.zM === null` veya `elevationStatus !== 'ok'` ise dünya koordinatındaki tam avatar rig’i çizilmez; HUD “yükseklik bilinmiyor” durumunu korur. First-person’de geçerli bir kamera/poz ankrajı varsa yalnız sunum amaçlı torso/kollar view-model olarak kalabilir; bu retained dünya rig’i veya güncel zemin kotu iddiası değildir. Son geçerli kot ya da sıfır güncel yüzey diye ikame edilmez; yatay hareket snapshot’a göre sürer.
- **Tarihsel ilk dikey dilim kararı:** İlk uygulama doğrulanmış kabul edilen yerel HiRISE fixture’ı ile başlamıştı; bu IMG/JP2 artık kullanıcı bildirimine göre geçersizdir. Registry’nin genel fallback özelliği korunur; sadece ayrı doğrulanmış ve kullanılabilir HiRISE provider’a dönebilir. Mevcut geçersiz bildirilen dosyalar fallback adayı değildir; başka doğrulanmış provider yoksa yüzey `unavailable` kalır. 2D Canvas arayüzü korunur.

Bu sözleşme Efe'nin mesh builder'ı ile Alparslan'ın entegrasyon paketinin arayüzünü tanımlar. Runtime kararı WebGL2 olarak uygulanmış; `referenceElevationM` yüklenen DTM kot aralığının orta noktası, `verticalScale` ise açıkça sunum amaçlı 3× seçilmiştir. Bu değerler ölçüm veya datum düzeltmesi değildir. Mesh arayüzünde değişiklik gerekirse iki görev sahibinin yazılı eşgüdümüyle, ilgili dosyalar düzenlenmeden önce netleştirilir.

Gerçek eşzamanlı çalışma/commit için her takım üyesi ve coding AI kendi clone’unu kullansın; OneDrive dışı clone/worktree tercih edilsin. Entegrasyon sahibi branch/PR diff’lerini gözden geçirip birleştirir. Kodlama işleri tek kabul ölçütlü, kısa ömürlü branch ve açık dosya sınırıyla yürür; `main.js`, `config.js`, registry/provider/snapshot sözleşmeleri entegrasyon sahibinde tek sahipli kalır. Yeni 1.8 GB GeoTIFF’in tamamı tarayıcı belleğine yüklenmez; yalnız doğrulanmış kapsamı taşıyan bounded window/tile yaklaşımı kullanılır. Registry fallback kabiliyeti korunur; geçersiz bildirilen IMG/JP2 aktif/fallback veri değildir. Stage 6 bağımsız kabulinden sonra Stage 13 kendi rig/test dosyalarıyla ayrı branch’te başlatılır; ortak OneDrive checkout’unda eşzamanlı Git işlemi yapılmaz.

## Git paylaşımı — 14 Kasım 2026 durum kaydı

- Workspace kökünde `emanzBey48/EA-Mars` için yerel Git deposu ve `origin` ayarlı. `alparslan/stage8-demo-orchestration` çalışma dalında Stage 12 Mars zıplama ve kamera dinamikleri (`58660f0`) ile Efe Stage 8 QA merge'i (`9819da2`) remote'a push edilmiş durumdadır.
- Güncel paralel 3D görev bölümü `d6a1189 docs: align 3D roadmap for parallel work` commit’iyle `origin/docs/parallel-roadmap` dalına push edilmişti.
- `yapay zeka icin` yönergeleri ile `Sim` kodu aynı repo kökündedir. 381 MB IMG, 34 MB JP2 ve 7.5 MB F32 `.gitattributes` ile Git LFS üzerinden izlenir; normal Git’e eklenmez.
- Workspace OneDrive altında olduğundan, Git çalışma kopyasını OneDrive senkronizasyonunun dışına almak daha güvenlidir. Takım üyeleri ayrı clone/worktree kullansın; OneDrive `.git` senkronizasyonu ortak Git yöntemi olmasın.
- `Sim/.gitignore` `dtm_subset.f32`, `dtm_subset.json` ve `ortho_inspection.json` dosyalarını izlemeye alır; F32 LFS üzerinden klonlanır. Mevcut `test-output` ekran görüntüleri de ilk importta eklendi.
- AI’lar her önemli, gözden geçirilebilir görev aşamasında ilgili değişiklikleri ayrı commit etsin; büyük işleri tek commit’e yığmasın. Commit öncesi `git status` ve staged diff kontrol edilsin; ilgisiz kullanıcı değişiklikleri eklenmesin. Kullanıcı onayı gereken durumda onay olmadan commit/push yapılmasın. Push başarısızsa hash ve engel raporlansın. Güvenlik/sertifika doğrulaması kapatılmasın.
- Commit author kimliği AI’yı belirtmeli ve bir insanı taklit etmemeli. Ana dal entegrasyon sahibi tarafından PR/diff incelemesiyle birleştirilmeli. Testler yalnız kullanıcı istediğinde çalıştırılmalı; çalıştırılmayan test başarılıymış gibi raporlanmamalı.

## Tarihsel raster geçişi ve kalan işler — 14 Kasım 2026

| Sahip | Uygulama durumu | Yarışma verisinden önce kalan |
|---|---|---|
| Alparslan | WebGL2 viewer ve Stage 8–12 tamamlandı. | Önce yeni TIFF’in provenance/datum/lisans/rota kapsamını doğrula; sonra frame, provider, HUD ve `main.js` migration’ını tek entegrasyon görevi olarak yürüt. |
| Efe | CPU mesh, memory optimization, astronaut rig, marker mesh ve Stage 8 QA katkısı tamamlandı. | Alparslan’ın migration’ından bağımsız olarak ayrı clone/branch’te Stage 13 rig kinematiği; raster preparation aracı ise frame/metadata sözleşmesi dondurulduğunda ayrı dosya kümesinde. |

- **Stage 9:** İlk runtime kabul turu `d471d6a` üzerinde (`13/13`, `26/26`) geçti. Sonraki mesh optimizasyonunu da içeren `fbc623f` kod HEAD’i bağımsız `18/18`, `32/32` ile tekrar doğrulandı; birleşik regresyon tamamlandı. Orbit viewer nihai ürün değildir.
- **Stage 10:** First-person movement/camera/surface-contact ve bağımsız rig + renderer entegrasyonu `fbc623f` ile tamamlandı; bağımsız QA `npm test` 18/18, `npm run smoke` 32/32. İlk smoke tekrarında iki mevcut 2D timing kontrolü geçti.
- **Stage 11:** Efe'nin `marker-mesh.js` modülü ve Alparslan'ın renderer entegrasyonu `8054b1a` ile tamamlandı; bağımsız `npm test` 24/24. Sol 120/164 beacon'ları ve rota kılavuz çizgileri sahneye eklendi.
- **Stage 8:** First-person demo akışı ve HUD entegrasyonu `f5259d2` ile tamamlandı (3D doğrudan açılış `?view=3d`, Sol 164 hedef feneri kilidi, nişangah, kontrol paneli kapsülü ve varış başarı rozeti; Efe QA ve marker doğrulama birleştirmesi `7ed695e` / `9819da2`; 25/25 unit test, 32/32 smoke, 60.4 FPS).
- **Stage 12:** Alparslan tarafından tamamlandı (`58660f0`); Mars $3.71\text{ m/s}^2$ yerçekimi altında zıplama balistiği, havada momentum korunumu, iniş darbe sönümlemesi ve kamerada adım kafa salınımı ile iniş esnemesi uygulandı (29/29 unit test, 32/32 smoke, 59.3 FPS).
- **Stage 13:** Efe’nin migration’dan bağımsız paralel görevi; ayrı clone/branch ve yalnız `astronaut-rig.js` + ilgili test dosyaları. Düşük yerçekimli EVA loping gait, apex balance, landing squash & recover ve view-model nefes/adım salınım kinematiği. Testler ancak kullanıcı isterse çalıştırılır.
- **Stage 7 / PLACES:** Alparslan’ın ayrı, bloke etmeyen dış veri işi. PDS dosyasına erişim olursa 2–4 saat; endpoint engeli 45–60 dakikada çözülmezse park et.
- **Stage 6 / yeni raster intake:** Yeni TIFF adayı mevcut; resmi product label/SIS, kaynak, lisans/kullanım, düşey datum ve rota-wide footprint/no-data doğrulama kapısı açık. Kanıt geçmeden adapter aktif edilmez; bu artık verinin gelmesini bekleme işi değildir.

**Geçmişte kalan sıradaki işler güncellendi:** Stage 13/16/17 rig kinematiği ve renderer bağlantısı artık kaynakta mevcut. Stage 6 USGS adayına ait önceki validator engelleri fail-closed kodla ele alınmış olsa da ürün-spesifik datum kanıtı/runtime kabul hâlâ açık; bu görev Stage 18/19'dan bağımsız ve datum kanıtı gelmeden aday etkinleştirilmez. Güncel sıra: Stage 15–17 görsel kabul → Stage 18 rölyef; paralelde Stage 19A audit sözleşmesi → 19B; ardından her biri kendi A→B kapısıyla Stage 20, 21 ve 22. JP2 hizalaması ve PLACES izi ayrı/koşullu kalır. Testler kullanıcı isteği olmadan çalıştırılmaz.

