# Stage 27 — Çok çözünürlüklü / çok haritalı hazırlık denetimi (Efe)

Kod: `Sim/public/js/geo/geology-registry.js` (saf) · Test: `Sim/test/geology-registry.test.mjs` (7 test, yeşil). Ham kanıt: scratchpad `sim3292\` (readme, FGDC metadata, ArcGIS yanıtları; repoya yazılmadı).
Etiketler: DOĞRULANDI = ham kanıt dosyası var veya testle görüldü; OLASI = çıkarım/tek örnek, yeniden denetlenmeli. Hiçbir küresel katman entegre edilmedi.

## (a) Ne yapıldı
- `createGeologyRegistry(entries)`: her giriş = `{id, index (geology.js), mapScaleDenominator, positionalUncertaintyM{min,max}, license, citation, unitScheme?, extentLonLat?}`. Kapsam `index.coverageBbox`'tan alınır (verilen `extentLonLat` farklıysa reddedilir). En ayrıntılı (en küçük payda) önce sıralanır; giriş sırası sonucu etkilemez. Boş/yinelenen kimlik, geçersiz belirsizlik, lisans/atıf eksikliği, ölçeksiz harita, kapsamsız (boş) harita → `TypeError`. Lisans bilinmiyorsa `'not_stated'` yazılmalı; uydurma yok.
- `lookupBestGeologicUnit(registry, {lonDeg, latDeg})`: poligon kapsamıyla (`lookupGeologicUnit`, yalnız bbox değil) en ayrıntılı kapsayan haritayı seçer; `toGeologySnapshot` yeniden kullanıldı ve seçilen haritanın ölçek/belirsizlik/lisans/atıf/uyarı metniyle yeniden etiketlendi. Sonuç: `status` (ok | ambiguous | outside_coverage | invalid_input), `sourceMapId`, `mapScale`, `fallbackChain` (sorgulanan daha kaba haritalar ve yanıtları), `conflict {flag, comparable, codes[], note}`. En ayrıntılı haritanın `ambiguous` yanıtı kaba harita ile "çözülmez". Hiçbir harita kapsamıyorsa `outside_coverage`; sahte küresel yedek yok.
- Çelişki kuralı (DOĞRULANDI, testli): kaba kapsayan harita farklı birim kodu verirse `conflict.flag = true` ve iki kod listelenir; birim şemaları aynı olduğu bildirilmediyse `comparable=false` ve not "çelişki sayılmaz, farklı adlandırma olabilir" der. En ayrıntılı harita gösterilir, çelişki gizlenmez.
- Testler gerçek SIM 3464 koridor GeoJSON'unu + adı SYNTHETIC olan sentetik bir "kaba harita" kullanır (gerçek jeoloji değildir).
- BULGU (geology.js değişmedi): `toGeologySnapshot` SIM 3464'e sabit kodludur (belirsizlik 100–200 m, lisans, `GEOLOGY_CAVEAT_*` "1:75.000" metni, geology.js:258-279). Başka harita için kayıt katmanında yeniden etiketlendi; kalıcı çözüm `toGeologySnapshot(lookup, index, overrides)` olabilir (Alparslan/geology.js sahibi).

## (b) SIM 3292 (Tanaka vd. 2014) vektör verisi araştırması
- DOĞRULANDI: USGS yayın sayfası (`pubs.usgs.gov/sim/3292/`) `downloads/sim3292_database.zip` verir: **808.910.442 bayt (~809 MB)** (HEAD, CORS başlığı yok). İçerik: ESRI file geodatabase + shapefile (readme). İndirilmedi.
- DOĞRULANDI (readme `sim3292_readme.txt`): tüm GIS verisi **Robinson projeksiyonu**, `GCS_Mars_2000_Sphere`, **yarıçap 3396190,0 m**, birim metre, merkez boylam 0. Yani projemizin küresiyle (R=3396190) aynı küre; jeoloji için elipsoid dönüşümü gerekmez. Katmanlar: `SIM3292_Global_Geology` (çokgen; `Unit`, `UnitDesc`), `_Contacts`, `_Structure`. Shapefile'ların ondalık derece olduğu bildirilir.
- DOĞRULANDI (FGDC metadata): `Access_Constraints: None`, `Use_Constraints: please cite authors` (kamu malı/lisans ifadesi yok → lisans "belirtilmemiş/atıf iste" olarak taşınmalı). Hata payı: MOLA'ya bağlı ~100 m yatay; çizgiler ~1:2M ölçekte çizildi, 1:20.000.000 harita, en küçük sınır elemanı 40×100 km (metadata Process_Description).
- DOĞRULANDI: sorgulanabilir ArcGIS FeatureServer var: `https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer` (SIM 3464 ile aynı organizasyon kimliği); katmanlar 0 Global_Landing_sites, 1 Global_Contacts, 2 Global_Structure, **3 Global_Geology** (1311 çokgen, 44 ayrık `Unit`, alanlar `Unit`, `UnitDesc`, `PrimaryCharacteristics` …). Yetenek `Query`, maxRecordCount 2000, `Access-Control-Allow-Origin: *` (tarayıcıdan doğrudan sorgulanabilir). Öğe sahibi `mahunter@usgs.gov_USGS` (öğe JSON'u); öğe boyutu 276.889.600 bayt; **servis ve öğe metninde lisans/atıf alanı boş** → lisans bu kanaldan belirlenemedi.
- DOĞRULANDI (nokta sorgusu, 77,45°E 18,43°K, `outSR=4326`): 1 sonuç, `Unit=HNt` ("Hesperian and Noachian transition unit"), yanıt 157.794 bayt, ~0,9 s; dönen halka sorgu noktasını içeriyor (gidiş-dönüş tutarlı, `jezero-geom` kanıtı). Bu birim ölçeği 1:20 M'dir; Jezero SIM 3464 birimleriyle (Njf…) birebir karşılaştırılamaz → `unitScheme` farklı beyan edilmeli.
- OLASI: `outSR=4326` Mars küresi için sunucuda "derece" olarak yeniden izdüşürülür (ArcGIS 4326'yı Dünya diye etiketler); tek noktada tutarlı, ama bir WGS84 kayması uygulanıp uygulanmadığı bağımsız doğrulanmadı. Güvenli yol: yanıtı `GCS_Mars_2000_Sphere` WKT ile iste veya tüm 1311 çokgeni bir kez indirip kendi derece biçimimize çevir (önbellek).
- OLASI: bu FeatureServer'ın USGS yayınıyla birebir aynı olduğu (USGS hesabı sahibi, alan adları aynı) — çokgen sayısı/alan karşılaştırması yapılmadı. İkinci aday `nzS0F0zdNLvs7nc8/.../Mars_Geology_feature_layer` yalnız arama sonucunda görüldü, sorgulanmadı.
- Entegrasyon İDDİA EDİLMİYOR: kayıt modülü bir SIM 3292 indeksi alabilir ama böyle bir indeks üretilip projeye eklenmedi.

## (c) K0/K1/K2 veri matrisi (bugünkü bilgi)
| Kat | Ham veri | Çözünürlük | CRS/datum | Lisans | Durum |
|---|---|---|---|---|---|
| K0 kot | MOLA ImageServer (Trek) S16 | ~463 m/px (0,0078122°) | wkid 104905, GeoTIFF `GCS_Mars_2000`; elipsoid/küre farkı OLASI | belirtilmemiş | ham kot var (26A); puan üretilmez |
| K0 jeoloji | SIM 3292: zip (809 MB) veya ArcGIS Query (yukarıda) | 1:20 M | Robinson, Mars 2000 küre R=3396190 (readme) | "please cite authors" | erişilebilir; indirilmedi/entegre değil |
| K0 Trek jeoloji | WMTS `SIM3292_Global_Geology` | renkli karo z0..11 | EPSG::104905 | belirtilmemiş | birim kodu çıkarılamaz (26A) |
| K1 | CTX DEM 20 m (Jezero) katalogda | 20 m | — | belirtilmemiş | servisi yok (404/ArcGIS hata): ENGELLİ |
| K1 jeoloji | SIM 3464 (yalnız Jezero) | 1:75.000 | yerel kayıtlı | belirtilmemiş (FGDC "None") | entegre (19A) |
| K2 Jezero | USGS 1 m DTM (yerel paket) | 1 m | eş-dikdörtgen küre R=3396190 | CC0 (veri etiketi) | var; düşey datum durumu tutarsız (config true, etiket null) |
| K2 Gale | `Gale_DEM_SMG_1m` ImageServer F32 | 1 m (1,687e-5°) | wkid 104905; elipsoid OLASI | belirtilmemiş | ham kot var; datum/no-data doğrulanmadı |
| K2 Columbia Hills | `DEM_1m_ColumbiaHills_fixed` | 1 m | aynı | belirtilmemiş | ham kot servisi var, örneklenmedi (OLASI) |

## Alparslan için öneriler
1. 26B: `server.mjs` vekil + disk önbelleği. SIM 3292 için çokgenleri tek seferde (1311 öğe, 2000 sınırı altında) indirip önbelleğe al; nokta başına ağ sorgusu yapma. Önce lisans yazısı USGS'den teyit edilmeli (servis boş).
2. Datum: jeoloji için dönüşüm gerekmiyor (aynı küre). Kot için ImageServer `GCS_Mars_2000` elipsoid mi küre mi sayısal olarak ölçülmeli (26A uyarısı 1); ölçülene kadar Gale/Columbia Hills rotaları "bölgesel ön planlama" kalmalı.
3. K2 adayları: Jezero (var); Gale ve Columbia Hills yalnız kot datumu + no-data semantiği + yarım piksel hizası doğrulanınca EVA moduna açılır. Diğerleri K0/K1.
4. UI: `lookupBestGeologicUnit` sonucundaki `sourceMapId`, `mapScale`, `conflict.note` ve `fallbackChain` gösterilmeli; K0/K1 jeoloji için "yürünebilirlik" dili kullanılmamalı.
5. Rota tarafı: `route-service.js` çözünürlük koruması (≤2 m EVA; ≤50 m bölgesel ön plan; üstü reddedilir) kaba DEM'lerde puan üretmez; eşikler senaryo değeridir.
