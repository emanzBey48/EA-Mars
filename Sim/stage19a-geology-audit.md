# Aşama 19A — USGS SIM 3464 jeoloji modülü denetimi (Efe)

Kapsam: `public/js/geo/geology.js`, `test/geology.test.mjs`. Başka dosya değiştirilmedi. Etiket: DOĞRULANDI (bu turda ölçüldü/okundu) veya OLASI.

## API
- `createGeologyIndex(geojson, { source })` derin dondurulmuş indeks; geçersiz özellik/halka atlanır ve `counts` içinde sayılır, halka kapatılmaz/onarılmaz.
- `lookupGeologicUnit(index, { lonDeg, latDeg })` → `ok | outside_coverage | invalid_input | ambiguous` (+ `unit`, `featureId`, `onBoundary`, `candidates`, `reason`).
- `lookupGeologicUnitLocal(index, adapter, { xM, yM })` adapter'ın `localToLatLon(x,y) → {latDeg, lonDeg}` metodunu kullanır.
- `geologicBoundarySegments(index)` lon/lat polylineler (`clipEdge` bayrağıyla); `geologicBoundarySegmentsToLocal(segs, adapter)` yerel metre (`latLonToLocal`).
- Sınır kuralı: kenara <=1e-9° (~60 µm) mesafedeki nokta aday sayılır; adaylar aynı birim kodunda ise `ok` (en düşük featureId, `onBoundary:true`), farklı koddaysa `ambiguous` + featureId sıralı adaylar. Tahmin yok. Delik kenarı = poligon sınırı.

## Veri gerçekleri (DOĞRULANDI)
- Koridor GeoJSON: FeatureCollection, 3 özellik, hepsi Polygon (delik yok, MultiPolygon yok), bbox [77.42, 18.41, 77.48, 18.46], `crs` alanı yok, [lon, lat].
- Özellik `id` yok; kimlik `properties.OBJECTID`, birim kodu `properties.symbol`, ad `properties.name`.
- Birimler: Njf (1150, Jezero floor unit), Nle (987, Lower etched unit), NHjf2 (1105, Jezero fan 2 unit). Yol haritasındaki adlar doğru.
- Poligonlar bbox'a kırpılmış; kırpma kenarları jeolojik kontak değil (21 polyline, 11'i `clipEdge`).
- Atıf: Sun & Stack 2020, SIM 3464, DOI https://doi.org/10.3133/sim3464, 1:75.000; yerel CRS MTM clon 77.5°E, Mars 2000 küre R=3396190 m; GeoJSON dışa aktarımı planetosentrik lon/lat. Lisans: metadata `accconst: None`, kamu malı ifadesi YOK; modül `license: 'not_stated'` yazar.
- Konum belirsizliği (readme + FGDC `horizpar`): yarı-kontrollü CTX üzerinde üretilmiş, operasyon CTX mozaiğine göre ~100–200 m rastgele ofset. Bu, "onlarca metre" varsayımından kötüdür; modül caveat'ine bu hâliyle yazıldı.

## Waypoint sorguları (DOĞRULANDI; brute-force ray-cast ile çapraz doğrulandı)
| Nokta | Sonuç | En yakın kontak |
|---|---|---|
| config Sol 120 / WB1 | ok, Njf (1150), sınır dışı | 12,17 m (proje yerel düzlemi; ilk tur ~11,6 m) |
| config Sol 164 / Roubion | ok, Njf (1150) | 22,82 m (proje yerel düzlemi; ilk tur ~22,1 m) |
| Trek WB1 | Njf | ~6,0 m |
| Trek Roubion | Njf | ~30,4 m |
Kontaklar ofset belirsizliğinden (100–200 m) çok yakın; Njf ataması indikatiftir, saha gerçeği değil. Yerel (0,0) ve Sol 164 yerel koordinatı gerçek adapter ile aynı sonucu verir.

## Bütünlük (DOĞRULANDI)
- Ham dosya boyut/hash manifestle eşleşmiyor: geojson 142191 B (manifest 135587), subset 13312610 (12759133), metadata.xml 21666 (20924), metadata.txt 21507 (20767), readme 4005 (3914). CRLF→LF normalizasyonundan sonra bu 5 dosyanın hepsinin boyutu ve sha256'sı manifestle tam eşleşti. PDF ve service_info.json ham haliyle eşleşiyor (service_info.json normalizasyonla bozulur; git'in ikili saydığı/değiştirmediği anlaşılıyor).
- Neden: çalışma ağacında Windows CRLF dönüşümü (OLASI: `core.autocrlf`). `.gitattributes` yalnız LFS kurallarını içerir, `eol`/`text` kuralı yok; bu yüzden hash platforma bağlı. Git kurulu olmadığından blob içeriği doğrudan doğrulanmadı (OLASI: blob LF).
- Öneri (Alparslan): `.gitattributes` içine `Sim/data/usgs-sim3464-geology/*.geojson text eol=lf` (ve .txt/.xml) eklenmeli ya da doğrulayıcı hash'i LF-normalize etmeli. Test, geojson için normalize hash'i doğrular.

## Waypoint tutarsızlığı (DOĞRULANDI, düzeltilmedi)
`mars-trek/manifest.json` key_waypoints ile `config.js` WAYPOINTS arasındaki mesafe (eşdikdörtgen yaklaşım, R=3396190 m): WB1 ~26,0 m; Roubion ~305,1 m. Sol 120–164 arası: config ~686 m, Trek ~368 m. Birim iki varyantta da Njf (fark yok). Roubion 305 m fark kaynak tutarsızlığıdır; hangi koordinatın doğru olduğu bu turda çözülmedi (OLASI: Trek değerleri sondaj/ara nokta farkı). Config değişmedi; Alparslan karar verecek.

## Test sonuçları
`cd Sim; node --test test/geology.test.mjs`: 14/14; `node --test test/` (diğer ajanların eşzamanlı testleri dahil): 69/69. `npm run smoke` çalıştırılmadı.
Düzeltme: proje yerel düzlemi (`adapterFromLabel(MAP_FRAME, WAYPOINTS[0])`) ile ölçülen en yakın kontak WB1 12,17 m (Njf), Roubion 22,82 m (komşu Nle poligon kenarı); yukarıdaki ~11,6/~22,1 m değerleri farklı projeksiyonla bulunmuştu. Test brute-force ile 1e-6 m'ye eşleşir.

## Karar ve sözleşme (19B için)
**Sözleşme (uygulandı, `geology.js`):** `GEOLOGY_SNAPSHOT_CONTRACT` (şema `marswalk.geology-snapshot.v1`, alan adı `geology`). `toGeologySnapshot(lookupResult, index)` her zaman aynı 12 anahtarlı, derin dondurulmuş düz nesne döner: `status` (`ok|outside_coverage|invalid_input|ambiguous`), `unitCode`, `unitName`, `onBoundary`, `candidates` (hep dizi; yalnız `ambiguous`'ta dolu: `{featureId, unitCode, unitName}`), `positionalUncertaintyM {min:100,max:200}`, `mapScale '1:75,000'`, `citation`, `doi`, `license 'not_stated'`, `caveatTr`, `caveatEn`. Yalnız `ok` birim taşır; diğer durumlar ve bilinmeyen status `unitCode/unitName: null`. Index yoksa citation/doi/mapScale null kalır, caveat kalır.
**Belirsizlik kaynağı (DOĞRULANDI):** `sim3464_readme.txt` ve `sim3464_metadata.txt` (`horizpar`): "will have random offsets of about 100-200 meters from the surface operations CTX mosaic". Lisans: `accconst: None`.
**Caveat metinleri:** TR `GEOLOGY_CAVEAT_TR`: "Harita ölçeğinde (1:75.000) birim ataması indikatiftir; konum belirsizliği ~100–200 m, saha gerçeği değildir. Mineraloji, güvenlik veya geçilebilirlik iddiası yoktur." EN `GEOLOGY_CAVEAT_EN` aynı anlamda. HUD'da atıf ve "lisans belirtilmemiş" ayrıca gösterilmeli.
**Kontak mesafesi (uygulandı):** `createGeologicContactField(index, adapter)` bir kez kurulur (kırpma kenarları hariç, yerel metre); her karede `nearestGeologicContactM(field, {xM,yM})` → `{distanceM, featureId, unitCode}|null`. UI örneği: "kontağa ~12 m (harita belirsizliği 100–200 m)". Mesafe belirsizlikten küçükse birim ataması zayıf kabul edilmeli; "güvenli/emin" dili kullanılmamalı.

**KARAR BEKLİYOR (sahip: Alparslan) — bunlar öneridir, uygulanmadı:**
1. Waypoint kaynağı: öneri `config.js` (PDS Initial Reports) kanonik kalsın; Mars Trek koordinatları yalnız "referans" olarak gösterilsin. Ölçülen fark: WB1 ~26 m, Roubion ~305 m (eşdikdörtgen). Birim iki varyantta da Njf; 305 m farkın nedeni çözülmedi (OLASI: Trek ara nokta/sondaj konumu). Jeoloji belirsizliği (100–200 m) WB1 farkından büyük, Roubion farkından küçüktür.
2. `.gitattributes`: öneri `Sim/data/** -text`. Neden: hash'lenmiş veri dosyalarına hiçbir platformda EOL dönüşümü uygulanmaz (PDF/JSON/GeoJSON dahil); `eol=lf` yalnız metin dosyalarını LF'ye zorlar, ikili dosyalarda gereksiz risk ve auto-detect belirsizliği taşır. Uygulanırsa mevcut CRLF'li çalışma kopyaları yeniden checkout/`git add --renormalize` ile doğrulanmalı (blob'un LF olduğu burada doğrulanmadı).
3. Manifest hash doğrulayıcısı: kural 2 uygulanana dek metin dosyalarında CRLF→LF normalize edip hash'lemeli (test bugün bunu yapar); ikili dosyalarda (PDF) ham bayt. Kural uygulanınca normalizasyon kaldırılabilir. Manifest boyut/hash'leri LF baytlarına göre doğru; ham CRLF kopyalar uyuşmaz.

## 19B için açık işler (Alparslan)
1. Yükleme: `main.js` içinde `fetch('data/usgs-sim3464-geology/jezero_geounits_corridor.geojson')` ve `manifest.json` (public servis yolu doğrulanmalı; veri `Sim/data/` altında, `public/` dışında), ardından `createGeologyIndex(geojson, { source: manifest })`. Başarısız yüklemede jeoloji kartı gizlenir, birim uydurulmaz.
2. Snapshot alan önerisi: `geology: { status, unitCode, unitName, onBoundary }` (`lookupGeologicUnitLocal` her karede, oyuncu x,y ile; ucuz: 3 bbox + ray cast).
3. HUD caveat metni: `GEOLOGY_CAVEATS` (1:75.000, ~100–200 m ofset, mineraloji/güvenlik iddiası yok) + `provenance.attribution`; lisans "belirtilmemiş" diye gösterilmeli.
4. Sınır çizimi: `geologicBoundarySegments` + `...ToLocal`; `clipEdge` olanları çizme; paylaşılan kontaklar iki kez gelir (yarı saydam çizgi için tekilleştir). 3D için yüzey yüksekliği örneklemesi renderer tarafında.
5. Kapsam: yalnız koridor bbox'ı; dışı `outside_coverage` döner, HUD "haritalanmamış/kapsam dışı" demeli.

## 19B kodu içeri alındı — statik uyum notu (14 Kasım 2026)
- `origin/codex/stage19b-geology-runtime` dalı (`eb74b6f`, `2d7c27b`; Stage 18 `b385af2` dahil) Efe dalına birleştirildi. `server.mjs` `/data/` isteklerini `Sim/data/` kökünden sunuyor; runtime yükleme yolu kaynakla uyumlu.
- **Açık sözleşme farkı (Alparslan):** Stage 19B `main.js` ham `lookupGeologicUnitLocal` sonucunu snapshot'a veriyor; `simulation/sim.js` yalnızca `status`, `unitCode`, `unitName`, `onBoundary` alanlarını kopyalıyor. Stage 19A'nın 12 anahtarlı `GEOLOGY_SNAPSHOT_CONTRACT` / `toGeologySnapshot` fonksiyonları runtime'da kullanılmıyor. Böylece `candidates`, belirsizlik aralığı, ölçek, atıf, DOI, lisans ve caveat snapshot sözleşmesinde yer almıyor (HUD bir kısmını sabit metinle gösteriyor). `createGeologicContactField` / `nearestGeologicContactM` da henüz kullanılmıyor.
- **Durum:** entegrasyon kodu kaynakta mevcut; bu turda test, smoke veya tarayıcı çalıştırılmadı. Yukarıdaki sözleşme farkı Alparslan'ın runtime/snapshot sahipliğinde kapatılmalı; görsel ve bilimsel kabul açık.
