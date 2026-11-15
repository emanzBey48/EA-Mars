# Stage 38A - Düşey datum ve veri bütünlüğü denetimi

Sahip: Efe. Kapsam: yalnız okuma ve denetim. `config.js`, `data/`, `.gitattributes`, `.gitignore` ve diğer kaynak dosyalara dokunulmadı. Etiketler: **DOĞRULANDI** (repo dosyası veya çalıştırılan komut kanıtlar), **OLASI** (kanıt dolaylı), **doğrulanmadı** (kaynak okunamadı).

Komut (depo kökü `Sim/`):
`node scripts/validate-data-integrity.mjs [--json <out>]` - çıkış kodu **1** (3 hata, 11 bilgi).
Test: `node --test test/` - **593/593 geçti, çıkış 0** (başlangıç 574 + 19 yeni test).

## 1. Düşey datum tutarsızlığı (K3-5)

| Alan | `config.js` MAP_FRAME | `data/dtm_subset.json` label | Durum |
|---|---|---|---|
| `verticalDatum` | `'Mars equipotential surface (MOLA areoid / DeltaGeoid, tied to HRSC & CTX LVS)'` (`config.js:55`) | `null` (`dtm_subset.json:58`) | **DOĞRULANDI** tutarsız |
| `verticalDatumVerified` | `true` (`config.js:56`) | `false` (`dtm_subset.json:59`) | **DOĞRULANDI** tutarsız |
| `verticalDatumEvidence` | `'Fergason vd. 2020 ... CTX LVS tie (~0.4m median offset)'` (`config.js:57`) | `null` (`dtm_subset.json:60`) | **DOĞRULANDI** tutarsız |

Kanıt durumu:
- Config'in "CTX LVS tie (~0.4 m median offset)" iddiasının kaynağı repoda yok. İfade yalnız `config.js:55-57` içinde geçiyor (repo geneli `grep`). **DOĞRULANDI: kanıt yok.**
- Yerel DTM'in FGDC metadatası (`data/mars-trek/hirise_dtm_1m_fgdc.html`, düz metne çevrilip tarandı) hiçbir düşey datum ifadesi içermiyor. **DOĞRULANDI.**
- USGS ürün sayfası (`usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic`, WebFetch ile okundu) "MOLAtopography" ve "DeltaGeoid" terimlerini açıklamıyor, bir datum da belirtmiyor. Yalnız CC0 1.0 lisans metni var. **DOĞRULANDI (sayfa okundu).**
- `dtm_subset.json` label'ı `verticalDatumEvidence: null` diyor; config'in gösterdiği Fergason/DOI kaynakları label'da citation olarak geçiyor ama datum kanıtı olarak bağlanmamış. **DOĞRULANDI.**

Sonuç: `verticalDatumVerified: true` için repoda kanıt yok. Kanıt yoksa değer `false` veya `needs_review` olmalı.

Çalışma zamanı etkisi (kod okumasıyla, tarayıcıda çalıştırılmadı):
- DTM katmanı gerçek etiketten okunduğu için (`surface/layers.js:222`, `surface/registry.js:514-516`) "düşey datum doğrulanmadı" gösteriyor. **DOĞRULANDI (kod).** HUD bu yolu okuyor (`view/hud.js:109,119`).
- Fallback yolu: `dtm_subset.json` yüklenemezse `surface/registry.js:794` `buildHiriseManifestFromMeta({ label: expectedFrame })` çağrılıyor. Config `true` olduğu için `registry.js:567` `humanReviewRequired` değeri `false` oluyor. Evidence düz metin olduğundan `validateLayerManifest` içindeki datum kapısı (`registry.js:248-257`) yine geçmiyor. **OLASI etki, kod okumasıyla doğrulandı; fallback davranışı çalıştırılarak test edilmedi.**
- `MAP_FRAME.verticalDatum` ve `verticalDatumVerified` minimap tanımlayıcısı için de geçiyor (`main.js:216`), ama bu alanlar ekranda gösterilmiyor. **DOĞRULANDI.**

### `MOLAtopography_DeltaGeoid` ifadesi
- Repo içinde: yalnız ürün adında ve manifest'in kendi `datum` alanında geçiyor. Yerel FGDC'de yok. **DOĞRULANDI.**
- USGS sayfasında açıklama yok. **doğrulanmadı** (resmi PDS etiketi `..._pds3.lbl` çevrimdışı okunamadı).
- `Sim/stage37-regional-dem-audit.md:73(b)` notu: DTM'in düşük frekans içeriği MOLA kotlarından türetilmiş; bu nedenle H1 (yerel DTM ↔ MOLA regional DEM) uyumunun bir kısmı üretim sürecinden gelebilir. **Bu, H1 bulgusunun bağımsız doğrulama olmadığı anlamına gelir.** Datum kanıtı olarak kullanılamaz.

## 2. Hash denetimi (D3)

Manifest hash kayıtları: 15 dosya (14 doğrulanabilir + 1 repoda olmayan kaynak). Ek olarak ortho JSON'larındaki 60 kayıt.

| Sonuç | Adet | Dosyalar |
|---|---|---|
| `ok-raw` (ham bayt eşleşti) | 4 | `M20_waypoints.json`, `sim3464_pamphlet.pdf`, `service_info.json`, `viking-mdim/regional-jezero-4deg-native.png` (ikili) |
| `ok-lf-normalized` (yalnız CRLF→LF sonrası eşleşti) | 10 | `mars-trek/`: `hirise_dtm_1m_fgdc.html`, `hirise_ortho_25cm_fgdc.html`, `hirise_ortho_25cm_WMTSCapabilities.xml`, `perseverance_traverse_fgdc.html`, `M20_traverse.json`; `usgs-sim3464-geology/`: `sim3464_metadata.xml`, `sim3464_metadata.txt`, `sim3464_readme.txt`, `jezero_geounits_jezero_subset.geojson`, `jezero_geounits_corridor.geojson` |
| `not-in-repo` | 1 | `viking-mdim` kaynak TIFF (12,7 GB, repoda yok; hash doğrulanamadı) |
| Uyuşmazlık | 0 | - |
| Ortho JSON kayıtları (ham, ikili) | 60 | 2 mozaik PNG + 58 karo (`ortho-alignment-z14/z17-tiles.json`); karo yolu `pathOrder` ile çözüldü |

Boyut kontrolü: eşleşen varyantın boyutu (ham veya LF) manifest boyutuyla tüm dosyalarda uyuştu. **DOĞRULANDI.**

Bağımsız doğrulama (script dışı, ayrı kod):
- Node `crypto` ile 5 dosya ve PowerShell `Get-FileHash` ile 7 dosya (ham hash) hesaplandı. Her LF-normalize eşleşme ve ikili ham eşleşme script çıktısıyla aynı.
- `dtm_subset.f32` ham SHA-256 = `fa1265290add466c7d68af1cfdb0aefbf9a49a35b710ab0fc6543d6f7ce379c9`. Bu, git'teki LFS işaretçisinin OID değeriyle (`git cat-file -p HEAD:Sim/data/dtm_subset.f32`) birebir aynı. Yani disk üzerindeki gerçek raster doğru.
- Ortho karo `14/6513/23433.png`: disk SHA-256 = JSON kaydıyla aynı (`56900051...`).
- Tek fark: `Get-FileHash` ile ilk denemede `M20_traverse` ve diğer metin dosyaları ham eşleşmedi; bu beklenen davranış (CRLF).

Git durumu (DOĞRULANDI): `core.autocrlf=true`. Metin dosyaları index'te `i/lf`, çalışma kopyasında `w/crlf`. `.gitattributes` yalnız `/Sim/data/dtm_subset.f32` ve `/Sim/data/legacy-hirise/dtm_subset.f32` için LFS kuralı içeriyor.

Eksik hash kapsamı (DOĞRULANDI): 306 veri dosyasının 228'inde manifest hash kaydı yok. Büyük kısmı `viking-mdim` karoları (170), `mars-trek` karolarından 33 tanesi ve `dtm_subset.f32/json`, `legacy-hirise`, `nodata-fixture`, `regional-dem/mola-jezero.*`, `perseverance-raw` ham fotoğrafları. Bunlar kendi kendini bildiren boyut alanlarıyla ya da yalnız boyutla denetlendi.

## 3. Yapısal kontroller (hepsi geçti)
- Git LFS işaretçisi: çalışma kopyasında **0** (script tüm `data/` taranarak doğrulandı).
- Viking piramidi z0-z3: karo sayısı ve PNG bayt toplamları manifestle eşleşti (2, 8, 32, 128 karo).
- `dtm_subset.f32`: 7 609 040 bayt = `window.rows × window.cols × 4` (1676 × 1135 × 4).
- `mola-jezero.f32`: 589 824 bayt = `grid.byteLength` = 384 × 384 × 4.
- `nodata-fixture.f32`: 192 000 bayt = 200 × 240 × 4.

## 4. Config ↔ DTM label alan karşılaştırması (özet)
17 frame alanı karşılaştırıldı: 14 eşleşti, 3 tutarsız (datum üçlüsü). Ek satırlar:
- `validMin..validMax` pencere gözlemi (`-2592.68..-2547.84`) config aralığının içinde. Etiket aralığı pencere ekstremumudur, ürün aralığı değildir; tutarsızlık sayılmadı.
- `frameMatchesConfig` beyanı (`true`) bağımsız hesapla eşleşti.

## 5. Alparslan için 38B önerileri

1. `Sim/public/js/config.js:56` - `verticalDatumVerified: true` → **`false`** (kanıt repoda yok). Alternatif: `needs_review` için alanı ayrı bir durum değeriyle değiştirmek, ama mevcut kod (`layers.js:222`, `registry.js:515`) yalnız `=== true` kontrolü yaptığından `false` en güvenli değer.
2. `Sim/public/js/config.js:55` - `verticalDatum` metni "tied to HRSC & CTX LVS" ifadesini içeriyor. Kanıt yoksa bu eke gerek yok: öneri `verticalDatum: null` veya yalnız `'MOLA-derived product; vertical datum not verified'` gibi bir uyarı. `registry.js:248-257` için `verticalDatum` dolu ama `verticalDatumVerified: false` durumu zaten "doğrulanmadı" üretir.
3. `Sim/public/js/config.js:57` - `verticalDatumEvidence` içindeki "CTX LVS tie (~0.4m median offset)" repoda kaynaksız; kaldırılmalı veya kaynak eklenmeli. Öneri: `null`.
4. `Sim/public/js/surface/registry.js:794` fallback: config `verticalDatumVerified` true olduğu için `humanReviewRequired` yanlış `false` oluyor. Düzeltme 1 uygulanınca otomatik düzelir; ek olarak `buildHiriseManifestFromMeta` içinde `verticalDatumEvidence` nesne bekleyen `validateLayerManifest` ile uyumlu hale getirilmeli (şu an düz metin).
5. `.gitattributes` - öneri (roadmap D3'teki `Sim/data/** -text` yerine, daha kontrollü):
   ```
   Sim/data/**/*.json       text eol=lf
   Sim/data/**/*.geojson    text eol=lf
   Sim/data/**/*.xml        text eol=lf
   Sim/data/**/*.html       text eol=lf
   Sim/data/**/*.txt        text eol=lf
   ```
   Gerekçe: metin veri dosyalarının çalışma kopyasında CRLF olması hash'i bozuyor (10 dosya). `eol=lf` çalışma kopyasını LF'de tutar ve hash'leri index ile aynı yapar; `-text` de işe yarar ama diff'i ikili gösterir. Git kuralı Windows'ta mevcut CRLF kopyalarını değiştirmez; `git add --renormalize Sim/data` veya temiz checkout gerekir. LFS kuralları (`/Sim/data/*.f32`) korunmalı.
6. `dtm_subset.json` içine `sha256` ve `bytes` alanları eklenmeli (`dtm_subset.f32` için, ham LFS OID `fa1265...` kullanılabilir). Bu, f32 için yalnız boyut kontrolünün yerini alır.

## 6. Çalıştırılmayanlar
- Tarayıcı ve smoke testleri çalıştırılmadı (port ve ajan kısıtı).
- Fallback DTM yolu (`dtm_subset.json` yokken) çalıştırılmadı; yalnız kod okundu.
- Resmi PDS etiketi (`..._pds3.lbl`) ve Fergason 2020 makalesi okunmadı.
- `legacy-hirise/dtm_subset.*` denetlenmedi (kapsam dışı).
- Git LFS işaretçisi OID'si script içinde okunmuyor; bağımsız kontrol yapıldı.
