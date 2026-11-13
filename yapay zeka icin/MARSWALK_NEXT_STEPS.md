# NASA Space Apps 2026 — Martian Map devir notu

**Güncelleme:** 13 Kasım 2026
**Proje bağlamı:** Kullanıcı kontrollü Marswalk; uygulama kodu bu klasöre eklenmez.

**Ürün yönü:** Nihai hedef ayrıntılı kullanıcı kontrollü 3D Mars simülasyonudur. `Sim` içindeki 2D Canvas deneyimi etkinlik öncesi oynanabilir ara MVP’dir; sonraki planlar 3D hedefini sürdürmelidir.

**Durum notu:** Bu devir belgesi araştırma ve eski iş planı içerir. Güncel kod durumu için önce `Sim/README.md`, `Sim/public/js/` ve `Sim/İkinci Beyin İlerleme Notları.md` dosyalarını kontrol et. Ortak ürün/ajan kuralları `SYSTEM_PROMPT.md`, teknik plan ise `road map.md` içindedir.

## Doğrulanan yerel veriler

- `DTEEC_045994_1985_046060_1985_U01.IMG`: PDS3 HiRISE DTM, 6673 × 14266, 32-bit `PC_REAL`; Mars 2000 datumuna göre yükseklik, `OFFSET=0`, `SCALING_FACTOR=1`, no-data `16#FF7FFFFB#`, geçerli aralık −2679.20…−2388.31 m. Etiket ölçeği 1.009663 m/piksel; equirectangular, planetocentric; merkez meridyeni 77.44°, standart enlem 15°, yarıçap 3394.839813 km.
- `ESP_046060_1985_RED_C_01_ORTHO.JP2`: 8-bit tek bant, 6673 × 14266; gömülü GeoTIFF equirectangular Mars dönüşümü ve 1.009663 m/piksel grid.
- JP2 tie-point’i (0,0) pikselinde yaklaşık (−3240.5144, 1099012.9782) m. DTM ile CRS/boyut/ölçek metadata’sı benzer; ancak JP2 GeoTIFF `PixelIsArea` yorumu ile DTM PDS piksel-merkezi konvansiyonu arasında yarım piksel x/y farkı hesaplanmıştır. Bu farkın yorumu ve görsel hizalama kesin doğrulanmadı; görsel bindirme yapılmadı.
- Yaklaşık raster boyutu 6.74 × 14.40 km; enlem 18.305–18.548°, boylam 77.383–77.501°.
- Ölçek uyuşmazlığı: HiRISE ürün adlandırma SIS’inde `C=1.0 m`, `A=0.25 m`; bu `RED_C`/DTM dosyaları için yerel ~1.01 m/piksel metadata doğru. Ürün web sayfasının genel `0.25 m/pixel` özeti yerel `C` ürünüyle çelişiyor; bu proje için yerel ürün etiketi ve SIS esas alınmalı.

Kaynaklar: [HiRISE Jezero DTM ve ortogörüntü sayfası](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_046060_1985), [HiRISE RDR/DTM SIS](https://hirise.lpl.arizona.edu/PDS/DOCUMENT/HIRISE_RDR_SIS.PDF).

## Sol 120 → Roubion: sadeleştirilmiş waypoint bağlantısı

PDS *Mars 2020 Initial Reports*, WB1 için Sol 120 (21 Haziran 2021) konumunu **18.43906919°N, 77.44940206°E**; Roubion Sol 164 (5 Ağustos 2021) konumunu **18.42769340°N, 77.45165066°E** bildiriyor. Rapor OEB iniş alanından Roubion’a Perseverance’ın yaklaşık 1 km güneye gittiğini; Sol 131’de yaklaşık 650 m, Sol 138’de yaklaşık 1020 m doğrusal uzaklıkta olduğunu söylüyor.

Equirectangular dönüşümü ve JP2 tie-point/grid ölçeğiyle waypointler yaklaşık (satır, sütun) **(6415,3742)** ve **(7083,3870)**. İki nokta arasındaki düz çizgi **686.204 m**. Bu, gerçek PLACES traverse geometrisi değildir; waypointlerden oluşturulan sadeleştirilmiş bir rekonstrüksiyondur.

Bu çizgi boyunca en yakın DTM hücresinden 681 örnek (~1.0091 m aralık) alındı. DTM no-data örneği yok. Elevasyon aralığı **−2588.546…−2568.352 m**, ortalama **−2576.332 m**, medyan **−2574.083 m**; uç değerler **−2569.435 → −2588.449 m**, net değişim −19.014 m.

Eğim, her örnekte 3×3 Horn sonlu farkı ve `atan(sqrt((dz/dx)^2+(dz/dy)^2))` ile hesaplandı; 3×3 pencereler no-data içermiyor. Merkez çizgide ortalama **4.691°**, medyan **4.484°**, P90 **8.360°**, maksimum **18.904°**. Senaryo olarak seçilen **10 m/yan** koridorun 13,768 piksel merkezinin tamamında DTM geçerli; bu koridordaki ortalama eğim 4.805°, P90 8.407°, maksimum 28.381°.

Bu değerler yalnız sadeleştirilmiş hat/koridor için DTM ürün değeri ve türetilmiş eğim özetidir; güvenli rota kanıtı değildir. PDS raporundaki yükseklik alanları Sol 120 için −2568.073 m, Roubion için −2584.96 m; yerel en yakın DTM pikselleriyle farklar sırasıyla ~1.36 ve ~3.49 m. Datum/koordinat/yerel yüzey farkı ayrıca çözülmedi; ekranda DTM örneklemesini PDS saha yüksekliğiyle eşitlemeyin.

Kaynak: [NASA PDS Mars 2020 Initial Reports](https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%201-4%20April%202022.pdf).

## Uygun NASA katmanları

- **HiRISE DTM:** Yerel yükseklik tabanı ve DTM’den türetilen hillshade. Çözünürlük ~1 m/piksel. JP2 ortogörüntü uygulamada çözümlenip gösterilmiyor; DTM hillshade orto olarak adlandırılmamalı.
- **Mars 2020 PLACES:** Gerçek Perseverance konumları/traverse için birincil devam işi. Resmî PDS Search API bundle `urn:nasa:pds:mars2020_rover_places::16.0` ve localization collection için 271 kayıtlı ürün doğruluyor; `best_interp.csv` ürün kimliği `urn:nasa:pds:mars2020_rover_places:data_localizations:best_interp.csv::16.0` (8,684,070 bayt), yanında PDS4 XML label var. API metadata/ürün dizini indirilebildi, ancak `file_ref` ve label adresleri WUSTL arşivine işaret ediyor. Hem `best_interp.csv` hem küçük `m20_best_interp_siteframe.xmlx` dosyasına doğrudan erişim MEB erişim-engel HTML’ine yöneldi; web aracı ham CSV’yi açmadı. Dolayısıyla gerçek polyline henüz alınmadı veya rasterle kesiştirilmedi. API sadece metadata referansını sağladı; veri içeriğini sağlamadı. [PDS Search API](https://pds.nasa.gov/api/search/1/products/urn:nasa:pds:mars2020_rover_places), [API rehberi](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html).
- **MEDA:** Nokta/sol bazlı geçmiş basınç, sıcaklık, rüzgâr vb. için opsiyonel. Kalibre ürünler ölçüm; türetilmiş ürünler modele/varsayıma dayanabilir. Rover konumu ve sol ile sınırlıdır; küresel/rota boyu hava veya canlı telemetri değildir.

Kaynaklar: [PDS Mars 2020 Rover PLACES](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm), [PLACES lokalizasyon ürünleri](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_rover_places/data_localizations/), [PDS MEDA ürün rehberi](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html), [MEDA PDS bundle ve DOI](https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn:nasa:pds:mars2020_meda&version=1.0).

## Minimum demo akışı ve değer etiketleri

1. DTM’den türetilmiş hillshade üzerinde Marswalk sahnesi aç; bunu ortogörüntü diye sunma.
2. Kullanıcı astronotu kendisi hareket ettirsin; simülasyon saati ve ilerleme kullanıcı hareketiyle artsın.
3. Sol120–Roubion sadeleştirilmiş düz hattını, iki gerçek PDS waypointini ve yükseklik profilini göster.
4. Hat çevresinde **10 m/yan demo koridoru** kullan; sonlu çizgi parçasına en kısa yatay mesafeyi hesapla, 10 m üstünde sapma uyarısı ver. Koridor genişliği bir senaryo varsayımıdır, görev toleransı/güvenlik sınırı değildir.
5. Göstergeleri şöyle etiketle: DTM kotu = “HiRISE arşiv DTM değeri, Mars 2000 (m)”; eğim = “DTM’den hesaplandı (3×3 Horn)”; avatar, simülasyon zamanı, mesafe, sapma ve koridor = “simülasyon/arayüz hesabı”; çizgi = “iki PDS waypointi arasındaki sadeleştirilmiş bağlantı, gerçek rover izi değil.”

Eğim ve yükseklik tehlike/safety skoru değildir. DTM’den kaya, regolit, gevşeklik, görüş veya hareket kabiliyeti çıkarımı yapılmaz.

## Uygulama işleri

| Durum | İş / çıktı | Kabul / kalan not |
|---|---|---|
| Kaynakta mevcut | HiRISE DTM penceresi, PDS grid dönüşümü, kullanıcı hareketi, saat, rota sapması/koridoru, DTM kotu ve Horn eğimi | Çalışan kod ve kabul davranışı için `Sim/README.md` ile kaynak/testleri esas al. DTM yoksa oyun açılmalı, katman unavailable kalmalı. |
| Kaynakta mevcut | `SurfaceProvider`, manifest validator/registry, HiRISE default ve fallback, immutable `WorldSnapshot` | Registry genel yeni format parser’ı değildir. Stage 6 validator boşlukları aşağıda açıkça listelenmiştir. |
| Kaynakta mevcut | Modül ayrımı ve snapshot/provider sözleşmesi | Dosya yolları için `Sim/README.md` ve `Sim/public/js/` esas alınır; registry ve `WorldSnapshot` kaynakta vardır. |
| Şu an ana odak | 3D dikey dilim | Mevcut HiRISE DTM fixture’ı ile `view/3d/` terrain mesh’i; avatar/kamera entegrasyonu Alparslan’da; `zM` ile görsel Z ayrılır, no-data boş kalır. |
| Yarışma verisi gelince | Stage 6 manifest doğrulaması | License/usage, sayısal footprint+kesişim, açıkça doğrulanmış vertical datum, zorunlu `expectedFrame` ve dönüşüm kanıtıyla fail-closed intake. |
| Dış erişime bağlı | PLACES gerçek traverse verisini indirip doğrula | Aynı PDS ürünü ve label/SIS kullanılmalı; erişim yoksa sadeleştirilmiş rota caveat’ı korunur. |
| Kaydedilmiş Git durumu | İki kişilik paylaşım | `docs/shared-code-boundaries` dalındaki `aae4830` ve bu belge eşitlemesinin `docs/parallel-roadmap` dalındaki `3060829` commit’i remote’da kayıtlı. |

## Sıradaki somut işler

1. **3D arayüzünü kilitle — Alparslan:** Renderer’ın alacağı snapshot, hazırlanmış terrain varlığı, `zM`→görsel Z kuralı ve no-data davranışını kabul ölçütleriyle yaz; `main.js`/`config.js`/snapshot sözleşmeleri tek sahipte kalsın.
2. **Terrain modülü — takım arkadaşı:** 3D deneyimi varsa sadece yeni `view/3d/terrain.js` ve özel yardımcılarında HiRISE fixture’ından mesh üret. Deneyimi yoksa bağımsız 3D etkileşim, HUD ve asset gereksinimleri araştırması/wireframe kabul listesi ver. Aynı anda aynı dosyalara girmeyin.
3. **Sıralı avatar-kamera entegrasyonu — Alparslan:** Terrain arayüzü sabitlenince ayrı `view/3d/` modüllerinde avatar/kamera işini bağla; mevcut 2D seçeneğini koru.
4. **Yarışma verisi geldiğinde Stage 6:** Registry mevcut; lisans/usage, sayısal coverage+kesişim, verified vertical datum, zorunlu expectedFrame ve transform kanıtını fail-closed doğrula. PLACES gerçek izi ayrıca PDS kaynağına erişim varsa ele alınır.

### Git başlangıç durumu

`docs/shared-code-boundaries` üzerindeki `aae4830` ile `docs/parallel-roadmap` üzerindeki belge commit’leri remote’a push edildi; mevcut dal bu görev başında `ae570b5` idi. AI her önemli ve gözden geçirilebilir aşamada ilgili dosyaları ayrı commit etsin, commit öncesi staged diff’i denetlesin ve paylaşım için branch’ini push etsin. Push olmazsa local commit ile remote paylaşımı birbirinden ayrı raporlansın; TLS doğrulaması kapatılmasın.
