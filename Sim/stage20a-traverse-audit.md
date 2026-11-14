# Aşama 20A denetimi: arşiv sürüş izi (Sol 120–164 penceresi)

Kapsam: `geo/traverse.js`, `view/3d/marker-mesh.js` (ek: `buildIntermediateSolMarkers`), `test/traverse.test.mjs`. Test: `traverse.test.mjs` + `marker-mesh.test.mjs` 15/15 geçti.

## Veri gerçekleri
- DOĞRULANDI: `M20_traverse.json` 559 LineString (sol 14..2022), `M20_waypoints.json` 708 nokta; RMC anahtarları benzersiz. Koordinat sırası lon, lat, elev (CRS84). Örnek elev alanı "elev_geoid" (arşiv; DTM örneği DEĞİL, kodda `archiveElevationM` adıyla ayrı tutulur).
- DOĞRULANDI: Sol 120–164 aralığında 16 sürüş segmenti var, sol = 122,123,124,126,127,128,129,130,131,134,135,136,137,153,155,157. Zincir kesintisiz: 4_1250 → 4_1422 → … → 5_2512 → 6_0. 521 ham / 491 tutulan köşe (30 ardışık yinelenen köşe birleştirildi), geçersiz köşe 0.
- DÜZELTME (yol haritası): başlangıç Site 4 Drive 1250 arşivde Sol **116** kaydıdır (Sol 120 değil; 117–121 arasında sürüş yok, OLASI: rover o süre durağan). Varış Site 6 Drive 0 Sol **157**'dir; Sol 164 kaydı veya sürüşü yoktur (sonraki sürüş Sol 168, 6_170; OLASI: Sol 157–167 arası 6_0'da durağan, bu veri dosyasından doğrudan kanıtlanmaz).
- "16 ara durak": 16 sürüş sonu konumu var, bunlardan SON (Sol 157, 6_0) varış noktasıdır; ara durak sayısı 15, başlangıç (4_1250) ayrı. Roadmap'teki "Sol 122..157" doğru, "16 ara durak" ancak varış dahilse doğru.
- DOĞRULANDI: `manifest.json` M20_traverse boyutu/hash'i LF normalizasyonu sonrası eşleşir (6ddd0ece…); diskteki dosya CRLF (1723784 B), manifest 1723218 B yazar. Bütünlük hatası değil, satır sonu farkı.
- Sağlayıcı/atıf: FGDC (`perseverance_traverse_fgdc.html`) Originator, Use_Constraints, dc.rights alanları BOŞ; kredi/lisans metni dosyada yoktur, uydurulmadı (`credit: null`). Kaynak: NASA/JPL Mars 2020 MMGIS, URL'ler manifestten. FGDC özeti iniş öncesi metindir (güncel değil).

## Ölçümler (yerel düzlem, config MAP_FRAME + WAYPOINTS[0] orijin)
- Arşiv polyline uzunluğu: 896.53 m (yerel düzlem), 885.54 m (küre üzerinde büyük daire, R=3396190); arşivin kendi `length` toplamı 885.47 m (fark %0.008). Yerel düzlem E-W'yi 1/cos(lat) ≈ %5.4 büyütür, bu yüzden düzlem değeri >= yüzey değeri.
- Düz WB1→Roubion (config) hattı: 687.34 m. Fark +209.18 m (oran 1.304).
- Düz hattan yanal sapma: maks 106.36 m (x=197, y=−449 yakını), ortalama 59.04 m (uzunluk ağırlıklı).
- 10 m senaryo koridoru içinde kalan iz payı: %11.97 (koridor SENARYO varsayımıdır, NASA limiti değil). Yani arşiv izinin yaklaşık %88'i senaryo koridorunun dışındadır.
- İz uç noktaları arasındaki kiriş için (4_1250→6_0): 687.26 m, maks sapma 106.39 m, ortalama 59.06 m.

## Waypoint uyuşmazlıkları (yalnız sayı; kanonik karar verilmedi)
- config WAYPOINTS (PDS) Sol 120 = MMGIS 4_1250 ile hane hane aynı (0.00 m); config Sol 164 ↔ MMGIS 6_0 (Sol 157): 0.087 m.
- Mars Trek manifest `key_waypoints` Sol_120_WB1 ↔ 4_1250: 26.04 m; Sol_164_Roubion ↔ 6_0: 305.07 m (yerel düzlem 305.07 m). Manifest koordinatları ya yaklaşık/yuvarlanmış ya da farklı kaynaklıdır; OLASI, kanıtlanmadı. Manifest `corridor_bounds` bu değerlerden türetilmiştir, güvenilirlik aynı sorgudadır.

## Eklenen API
- `selectTraverseSubset`, `projectTraverse`, `compareToStraightLine`, `compareEndpointsToReferences`, `polylineLengthM`, `polylineSurfaceLengthM`, `haversineM`, `TRAVERSE_PROVENANCE` (dondurulmuş; "archival MMGIS traverse; not live telemetry; not a safety route").
- `buildIntermediateSolMarkers({stops, displayConfig, sampleElevation|surfaceProvider})`: mor mikro-işaretçi (taban + direk + küçük kristal, ~134 köşe/işaretçi). Yalnız DTM/örnekleyici yüksekliği kullanır; arşiv elev kullanılmaz; yüksekliği olmayan durak atlanır ve sayılır. `buildMarkerMeshes` çıktısı önce/sonra bayt düzeyinde aynı doğrulandı.

## 20B için açık noktalar (Alparslan)
1. Hangi waypoint kaynağı kanonik: config/PDS mi, manifest mi? (26 m ve 305 m fark.) Karar verilmeden manifest `key_waypoints` ile koridor kurulmamalı.
2. Katman etiketi: "Sol 120/164" yerine arşiv sol numaraları (116 başlangıç, 157 varış) HUD'da görünmeli; Sol 157–164 Roubion operasyonu bu veriden kanıtlanamaz.
3. Düz koridor korunacaksa iz katmanı "gerçek iz değil / arşiv" uyarısıyla ayrı çizilmeli; izin %88'i 10 m koridor dışında.
4. 3D iz çizgisi için yükseklik DTM'den örneklenmeli; arşiv `elev_geoid` DTM datumu ile aynı varsayılmamalı.
5. Köşe başına DTM no-data durumunda polyline kesilmeli (boşluk doldurulmamalı).
