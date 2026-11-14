# Stage 39A: HiRISE Ortomozaik Kayıt Teşhisi v2 ve Hizalama Doğrulaması

**Rapor Tarihi:** 14 Kasım 2026  
**Yazar:** Efe (Marswalk Projesi)  
**Kayıt ve Hizalama Durumu:** **WMTS Aritmetik Projeksiyon Kaydı Doğrulandı (Ortak TRN Baz Haritası: `JEZ_hirise_soc_006`, ±1.5 m Yerel Belirsizlik; Yarım-Piksel Görsel Kaya Kontrolü Doğrulanmamış)**

---

## 1. Yönetici Özeti ve Temel Bulgular

Stage 21A ve Stage 21B raporlarında iki kritik soru çözümsüz bırakılmıştı:
1. **Waypoint Farkı:** `config.js` rotası ile `manifest.json` waypoint'leri arasındaki ~26 m (Sol 120) ve ~305 m (Sol 164) farkın bir raster/projeksiyon kaymasından mı kaynaklandığı bilinmiyordu.
2. **Korelasyon Belirsizliği:** DTM hillshade ile ortomozaik ham parlaklığı arasındaki Pearson korelasyonunun ($r \approx 0.31$) ve gradyan korelasyonunun ($r \approx 0.11$) zayıf kalmasının nedeni belirsizdi.

Stage 39A kapsamında yürütülen v2 sayısal teşhisi (`scripts/validate-ortho-registration.mjs --stage39a`) ile her iki konu da kesin matematiksel ve jeodezik kanıtlarla çözüme kavuşturulmuştur:

- **0.0 m Projeksiyon Sapması:** HiRISE 1 m DTM (`JEZ_hirise_soc_006_DTM_...`) ve HiRISE 25 cm Ortomozaik (`JEZ_hirise_soc_006_orthoMosaic_25cm_...`) aynı jeodezik aileden (`JEZ_hirise_soc_006`, USGS Astrogeology Mars 2020 Controlled TRN Basemap) türetilmiştir. WMTS karo grid aritmetiği ile DTM etiket projeksiyon sınırları (`S0 = -4577366.5`, `L0 = 1106617.5`, $R = 3396190\text{ m}$, Equirectangular `latTs0=0, lon0=0`) arasındaki kenar sapması **tam olarak 0.0 metre** ($< 10^{-12}\text{ m}$) ölçülmüştür.
- **Waypoint Farkının Gerçek Nedeni:** ~26 m (Sol 120) ve ~305 m (Sol 164) farklar **asla bir raster kayması DEĞİLDİR**. Sayısal jeodezi analizi ve `data/mars-trek/M20_waypoints.json` travers kayıtları, `config.js` koordinatlarının Sol 116 (Site 4, Drive 1250) ve Sol 157 (Site 6, Drive 0 — Roubion sondaj parkı) son durak lokasyonlarına ait olduğunu; `manifest.json` koordinatlarının ise Sol 123/124 ve Sol 134 civarındaki farklı intikal duraklarına ait olduğunu kanıtlamıştır. Raster kayması olsaydı iki noktadaki fark vektörü özdeş olurdu; oysa Sol 120 fark vektörü $(dx = -0.03\text{ m}, dy = -26.04\text{ m})$ iken Sol 164 fark vektörü $(dx = +5.14\text{ m}, dy = +305.10\text{ m})$'dir (tamamen rover'ın sürüş patikasına bağlı katalog seçimi).
- **Albedo vs Topografik Gölgeleme:** Ham ortomozaik gri tonları geniş ölçekli yüzey albedo değişimlerine (parlak açık renkli Mars tozu vs koyu bazaltik kum) duyarlıdır. Geniş ölçekli albedoyu süzüp yerel topografik gölgelemeyi izole eden sıfır-ortalamalı yüksek geçiren filtre (High-Pass Filter, $radius=5$) uygulandığında, korelasyon tepesi $r = 0.3975$'e yükselmekte ve tepe konumu $(dx = +0.5\text{ px}, dy = -0.5\text{ px})$ olarak origin merkezine (1 DTM hücresi / $\pm 1.5\text{ m}$ belirsizlik aralığına) kilitlenmektedir.

---

## 2. Sayısal Ölçüm Sonuçları

### 2.1. DTM vs WMTS Projeksiyon Kenar Sapması
- **Kullanılan DTM Penceresi:** `data/dtm_subset.json` + `dtm_subset.f32` (1676 × 1135 hücre, 1 902 260 geçerli piksel, 0 no-data).
- **Projeksiyon Parametreleri:** Equirectangular, `latTs0 = 0°`, `lon0 = 0°`, $R = 3\,396\,190\text{ m}$.
- **DTM Etiket Ofsetleri:** `sampleProjectionOffset (S0) = -4577366.5`, `lineProjectionOffset (L0) = 1106617.5`.
- **Ölçülen Kenar Artıkları (Extractor vs Projeksiyon Formülü):**
  - Batı: $0.0\times 10^0\text{ m}$
  - Doğu: $0.0\times 10^0\text{ m}$
  - Kuzey: $0.0\times 10^0\text{ m}$
  - Güney: $0.0\times 10^0\text{ m}$
- **Sonuç:** Projeksiyon aritmetiği açısından iki ürün arasında sıfır teorik kayma vardır.

### 2.2. Waypoint Katalog Çelişkisi Analizi

| Waypoint | `config.js` (PDS Initial Reports) | `manifest.json` (Mars Trek) | Geodezik Fark | Fark Vektörü (Doğu, Kuzey) | `M20_waypoints.json` Eşleşmesi ve Açıklama |
|---|---|---|---|---|---|
| **Sol 120 (WB1)** | `18.43906919° N`, `77.44940206° E` | `18.4386299° N`, `77.4494015° E` | **26.04 m** | `dx = -0.03 m`, `dy = -26.04 m` | `config.js`, Sol 116 (Site 4, Drive 1250) son durağı ile **0.00 m** mesafeyle örtüşür (Perseverance Sol 120 WB1 durağında burada park etmiştir). `manifest.json` ise Sol 123/124 intikal durağını listelemiştir. |
| **Sol 164 (Roubion)** | `18.42769340° N`, `77.45165066° E` | `18.4328406° N`, `77.4517420° E` | **305.14 m** | `dx = +5.14 m`, `dy = +305.10 m` | `config.js`, Sol 157 (Site 6, Drive 0) son durağı ile **0.087 m** (< 9 cm) mesafeyle örtüşür (Perseverance Sol 164 Roubion sondajını bu lokasyonda yapmıştır). `manifest.json` ise Site 5 / Sol 134 civarındaki ~305 m kuzeydeki ara durağı listelemiştir. |

**Kesin Sonuç:** ~26 m ve ~305 m sapmalar, raster veri kayması değil, katalogdaki farklı sol ve drive duraklarının seçilmesinden kaynaklanmaktadır.

### 2.3. Korelasyon Taramaları: Ham vs High-Pass vs Yönlü Türev

| Ölçüm Yöntemi | En İyi Azimut | Tepe $(dx, dy)$ (px / m) | Tepe Pearson $r$ | İkinci Tepe Farkı (Margin) | Analiz ve Anlam |
|---|---|---|---|---|---|
| **Ham Hillshade (Stage 21B)** | $315^\circ$ | $(+1.5, +0.5)$ | $0.3169$ | $0.0060$ | Düşük margin, geniş ölçekli toz albedosu topografik gölgeyi maskeliyor. |
| **High-Pass Filtreli ($radius=5$)** | $270^\circ$ | **$(+0.5, -0.5)$** | **$0.3975$** | **$0.0245$** | Belirgin tepe; albedo süzüldüğünde en iyi hizalama 0.5 piksel (0.5 m) mesafede origin çevresinde toplanıyor. |
| **High-Pass Filtreli ($radius=5$)** | $315^\circ$ | **$(+0.5, -0.5)$** | **$0.3627$** | **$0.0242$** | $270^\circ$ ile tamamen tutarlı $(+0.5, -0.5)$ tepesi. |
| **Yönlü Türev ($\nabla I \cdot \hat{L}$)** | $315^\circ$ | $(-2.0, -2.0)$ | $0.2430$ | $0.0110$ | Yüzey eğim türevi ile ışık yönündeki parlaklık türevinin tutarlılığı. |
| **Gradyan Büyüklüğü (Ham)** | Işıktan bağımsız | $(-3.0, -3.0)$ | $0.1135$ | $0.0250$ | Ham gradyan albedo sınırlarına takılıyor. |

---

## 3. Bilimsel ve Mühendislik Değerlendirmesi

1. **Ortak TRN Baz Haritası Güvencesi:**  
   Hem DTM hem de Ortomozaik, USGS Astrogeology Science Center tarafından Mars 2020 Terrain-Relative Navigation (TRN) operasyonları için fotogrametrik ve jeodezik olarak kontrol edilmiş `JEZ_hirise_soc_006` mozaik ailesine aittir.
2. **Kalan Belirsizlik (±1.5 m):**  
   High-pass korelasyon tepeleri $(+0.5, -0.5)$ piksel aralığında yer almaktadır. 1 m DTM hücre boyutu ve 0.318 m ortomozaik çözünürlüğü göz önüne alındığında, yerel topografik hizalama doğruluğu **$\pm 1.5\text{ m}$ (1–1.5 DTM hücresi)** içerisindedir.
3. **Yarım-Piksel Görsel Kaya Doğrulaması:**  
   Bireysel kaya blokları (boulder-level) üzerinde zemin gerçeği (ground truth) optik kontrol noktası (GCP) bulunmadığından, yarım-piksel altı optik tescil iddiasında bulunulamaz.
4. **Kapsam Dışı Davranışı:**  
   z17 ortomozaik karoları yalnızca koridor ve Sol 120 bölgesini kapsar; Sol 164 bölgesinde z17 karoları mevcut değildir (z14 karoları ise tüm alanı kapsar). Ortomozaik bulunmayan piksellerde kenarlar asla uzatılmamalı/clamp edilmemeli, DTM hillshade kesintisiz biçimde korunmalıdır (`fail-closed` ve `hybrid` rendering).

---

## 4. Kullanım ve Etiketleme Kuralı

Uygulama arayüzünde (HUD, Minimap, Metadata Dialog) ortomozaik için şu resmi etiket kullanılmalıdır:

> **Kayıt Türü:** WMTS Aritmetik Projeksiyon Kaydı (JEZ_hirise_soc_006 ortak TRN tabanı, ±1.5 m yerel belirsizlik; yarım-piksel kaya kontrolü doğrulanmamış)  
> **Kaynak:** USGS Astrogeology Science Center / NASA JPL Mars Trek (MRO HiRISE Controlled Orthomosaic 25cm, WMTS z17/z14)
