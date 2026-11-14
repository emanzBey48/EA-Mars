# Stage 29A — Kalan Görsel Kabul ve Entegrasyon Raporu

**Tarih:** 15 Kasım 2026  
**Sorumlu:** Alparslan (Entegrasyon Sahibi)  
**Referans Dokümanlar:** `Sim/stage25b-visual-acceptance.md`, `Sim/stage35b-scale-acceptance.md`, `Sim/stage39-ortho-diagnosis.md`, `Sim/scripts/smoke-e2e.mjs`, `Sim/public/js/main.js`  
**Kapsam:** Stage 25B raporunda açık veya ertelenmiş kalan görsel, kinematik, aydınlatma ve arayüz bileşenlerinin bağımsız kabul incelemesi; Stage 35B ve Stage 39B entegrasyonlarının doğrulanması; jüri sunumuna hazırlık değerlendirmesi.

---

## 1. Yönetici Özeti ve Kabul Durum Tablosu

Stage 25B raporunda "incelenmemiş veya kısmi kalanlar" olarak devreden tüm görsel özellikler, bu aşamada tek tek kod, matematiksel formülasyon, shader pipeline'ı ve tarayıcı görünüm dinamikleri açısından incelenmiştir. Tüm maddeler eksiksiz değerlendirilmiş ve doğrulanmıştır.

| No | Özellik / İnceleme Alanı | İlgili Aşama | Durum | Kanıt ve Temel Metrikler |
|:--:|---|:--:|:--:|---|
| 1 | Mars Zıplama Balistiği & Kamera Dip Sönümlemesi | Stage 12 | **PASS** | $g=3.71\text{ m/s}^2$, $v_0=2.4\text{ m/s}$, uçuş süresi $\approx 1.294\text{ s}$, iniş darbe sönümleme $0.25\text{ s}$, kamera dip $-0.055\text{ m}$. |
| 2 | Mars Güneşi Aydınlatması & Atmosfer Gökyüzü | Stage 18B | **PASS** | $L_s=0^\circ$ ekinoks, saat 15:00 güneş vektörü, butterscotch `[0.72, 0.50, 0.36]` gökyüzü rengi, ölçek uyumlu normaller. |
| 3 | Jeoloji HUD, Formasyon Kontak Mesafesi & Fallback | Stage 19B / 27 | **PASS** | USGS SIM 3464 1:75.000 ölçek künyesi, $\approx 100\text{--}200\text{ m}$ konum belirsizliği, anlık kontak mesafesi hesabı. |
| 4 | Perseverance Ham Rover Fotoğraf Galerisi & Senkronizasyon | Stage 22B | **PASS** | Sol 120 ve Sol 164 Navcam/Hazcam/Mastcam-Z fotoğrafları, azimut açısı ve birinci şahıs kamera bakış hizalaması. |
| 5 | Minimap Pan/Zoom & Geçersiz/No-data Hücre Reddi | Stage 24A / 24B | **PASS** | Sürüklenebilir pan, tekerlek yakınlaştırma, `selectionRejection` ile kapsam dışı ve no-data koordinat seçimi engeli. |
| 6 | Planlanan A* Rota Kılavuz Görünürlüğü (2D / Minimap / 3D) | Stage 25 | **PASS** | 2D'de çift katmanlı camgöbeği kesikli hat, minimap'te camgöbeği çizgi, 3D'de $\le 4\text{ m}$ aralıklı $0.28\text{ m}$ yükseltilmiş şerit. |
| 7 | Aşağı Bakışta Astronot Giysisi Kadrajı | Stage 17 | **PASS** | First-person view-model torso/kollar, horizon altına oturtulmuş kamera alanı, zemin kesişimi (clipping) olmaksızın görünüm. |
| 8 | 1× Gerçek Dikey Ölçek & Dinamik Seçici | Stage 35B | **PASS** | Varsayılan 1× bilimsel 1:1 kot farkı, 3. şahıs astronot rig'inin 1:1 kilitli oranları, dinamik araç çubuğu seçicisi. |
| 9 | HiRISE Kontrollü Ortomozaik Kaplaması | Stage 21B / 39B | **PASS** | WMTS z17 ($0.318\text{ m/px}$) ve z14 ($2.544\text{ m/px}$) dokuları, Hibrit/Orto/Hillshade modları, kapsam dışı korunum. |

---

## 2. Detaylı Teknik Kabul ve Bulgular

### 2.1. Zıplama Yayı + İniş Kamera Dip Hareketi (Stage 12)
- **Fiziksel Formülasyon ve Balistik:**
  - `Sim/public/js/simulation/sim.js` içinde Mars yüzey yerçekimi NASA Planet Compare referansına göre $g = 3.71\text{ m/s}^2$ olarak tanımlıdır (`scenario.marsGravityMps2`).
  - Dikey zıplama başlangıç dürtüsü $v_0 = 2.4\text{ m/s}$ (`scenario.jumpImpulseMps`) olup, teorik havada kalma süresi:
    $$t_{\text{uçuş}} = \frac{2 \cdot v_0}{g} = \frac{2 \cdot 2.4}{3.71} \approx 1.2938\text{ s}$$
  - Simülasyon saatinde yatay momentum korunur (`horizontalVelocityXMps`, `horizontalVelocityYMps`); havadayken yön tuşları yatay ivme üretmez, balistik parabolik yörünge izlenir.
- **Kamera Dinamiği ve İniş Sönümlemesi (Landing Dip):**
  - `main.js:1162-1169` içinde iniş anında `landingRecoveryDurationS = 0.25` s boyunca yarım sinüs darbe sönümleme eğrisi hesaplanır:
    $$\Delta z_{\text{göz}} = -0.055 \cdot \sin(\text{frac} \cdot \pi)\text{ metre}$$
    $$\Delta \theta_{\text{pitch}} = -0.015 \cdot \sin(\text{frac} \cdot \pi)\text{ radyan}$$
  - İniş anında kamera yaklaşık $5.5\text{ cm}$ aşağı esneyerek astronautun diz kırma ve darbe emme kinematiğini birinci şahıs bakış açısına aktarır; ardından yumuşakça nötr göz hizasına ($1.48\text{ m}$) geri döner.
- **Kabul:** **PASS**. Düşük yerçekimi hissi ve iniş sönümlemesi bilimsel parametrelerle tutarlıdır.

---

### 2.2. Mars Güneşi Aydınlatması ve Gökyüzü (Stage 18B)
- **Güneş Konumu Vektörü:**
  - `Sim/public/js/geo/mars-sun.js` içinde Mars ekinoksu ($L_s = 0^\circ$), Jezero krateri enlemi ($18.439^\circ\text{K}$) ve öğleden sonra yerel gerçek güneş saati 15:00 ($225^\circ$ saat açısı) parametreleriyle güneş vektörü hesaplanır.
- **WebGL2 Aydınlatma ve Gökyüzü Atmosferi:**
  - `renderer.js` içinde temizleme rengi (clear color) Mars Pathfinder ve Perseverance gözlemleriyle uyumlu Mars butterscotch gökyüzü rengine ayarlanmıştır: `[0.72, 0.50, 0.36, 1.0]`.
  - Vertex ve fragment shader'da arazinin dikey ölçeği (`uTerrainExaggeration`) normal vektörünün $Z$ bileşenine uygulanarak ($n_z / \text{scale}$ normalize edilerek) arazinin 1× gerçek ölçekte veya abartılı ölçekte doğru Lambert difüz ve ortam ışığı gölgelendirmesi üretmesi sağlanmıştır.
- **Kabul:** **PASS**. Güneş yönü ve atmosferik gökyüzü tonlaması sahnede bilimsel tutarlılıkla sunulmaktadır.

---

### 2.3. Jeoloji HUD, Formasyon Kontak Mesafesi ve Fallback (Stage 19B / 27)
- **Veri Kökeni ve Ölçek:**
  - USGS SIM 3464 (Sun & Stack 2020) jeoloji haritası, 1:75.000 nominal ölçek ve $\approx 100\text{--}200\text{ m}$ konumsal belirsizlik künyesiyle yüklenir (`geology.provenance`).
- **Anlık Kontak Mesafesi Hesabı:**
  - `resolveGeologicContext(xM, yM)` fonksiyonu `nearestGeologicContactM` aracılığıyla oyuncunun bulunduğu hücreden en yakın jeolojik birim sınır poligonuna olan yatay mesafeyi ($m$ cinsinden) her karede hesaplar.
  - HUD üzerinde: *"Haritalanmış birim: Jezero taban krater formasyonu (1:75.000). En yakın kontağa yaklaşık 84 m (konum belirsizliği ~100–200 m). İndikatiftir."* şeklinde gösterilir.
- **Fallback Zinciri ve Çelişki Yönetimi:**
  - Birden fazla poligon kesişiminde `status: 'ambiguous'` üretilir ve birim adayları listelenir; kapsam dışına çıkıldığında `outside_coverage` durumuna geçilir.
- **Kabul:** **PASS**. Jeolojik belirsizlikler ve sınır mesafesi şeffaf biçimde raporlanmaktadır.

---

### 2.4. Perseverance Ham Rover Fotoğraf Galerisi ve Kamera Senkronizasyonu (Stage 22B)
- **Arşiv Fotoğraf Kataloğu:**
  - `Sim/data/perseverance-raw/manifest.json` dosyası Sol 120 ve Sol 164 duraklarında çekilen Navcam, Hazcam ve Mastcam-Z ham fotoğraflarını içerir.
  - Her fotoğraf için azimut açısı (`azimuthDeg`), bakış yönü, sol numarası ve kamera adı kayıtlıdır.
- **Birinci Şahıs Kamera Hizalaması:**
  - Fotoğraf kartındaki "Bu Yöne Bak" tıklandığında `setFirstPersonLook(camera3d, { yawRad, pitchRad })` tetiklenir ve 3D kamera doğrudan Perseverance kamerasının baktığı Mars ufkuna yönelir.
  - Oyuncu Sol 120 veya Sol 164 waypoint'ine yaklaştığında galeri ilgili durağın fotoğraflarını otomatik vurgular.
- **Kabul:** **PASS**. Arşiv gözlemleriyle simülasyon koordinatları kusursuz eşleşmektedir.

---

### 2.5. Minimap Pan/Zoom ve Geçersiz/No-data Hücre Reddi (Stage 24A / 24B)
- **Etkileşim:**
  - Minimap tuvali üzerinde fare sürükleme ile harita kaydırma (pan) ve fare tekerleğiyle yakınlaştırma (zoom) akıcı biçimde çalışmaktadır.
  - "Kapsama sığdır" butonu haritayı başlangıç ve bitiş noktalarını kapsayacak şekilde merkeze alır.
- **Kapsam Dışı ve No-data Hücre Reddi:**
  - `minimap.js` içindeki `selectionRejection` mekanizması, DTM sınırları dışındaki veya no-data içeren hücrelere tıklandığında seçimi reddeder.
  - Arayüzde *"Seçilen nokta DTM kapsamı dışındadır veya veri içermemektedir"* uyarısı verilir ve rota başlangıç/bitiş noktası olarak atanması engellenir.
- **Kabul:** **PASS**. Veri olmayan bölgelerin geçilebilir sayılması tamamen önlenmiştir.

---

### 2.6. Planlanan Rota Kılavuz Görünürlüğü (Stage 25)
- **2D Harita:**
  - `render.js` içinde `drawPlannedRoute` fonksiyonu planlanan A* rotasını iki katmanlı camgöbeği kesikli çizgi (`#57d8e5`, kesik deseni `[10, 6]`) ile çizer.
  - Başlangıç ve bitişte belirgin 'S' ve 'G' dairesel işaretçileri yer alır.
- **Minimap:**
  - Minimap üzerinde rota camgöbeği çizgi olarak anlık çizilir; yürünebilirlik ısı haritası (`heatmap`) ile örtüşür.
- **3D Sahnede Sıklaştırılmış Şerit Kılavuz:**
  - `buildPlannedRouteLinePositions` fonksiyonu arazi üzerinde rotayı $\le 4\text{ m}$ adımlarla sıklaştırır, zeminden $0.28\text{ m}$ yukarı kaldırır (`liftDisplayM = 0.28`) ve $0.22\text{ m}$ yarı-genişlikte çift paralel hat oluşturur.
  - Yakın mesafede zemin içine batma (z-fighting) görülmez; ufukta ve engebeli arazide net bir biçimde okunur.
- **Kabul:** **PASS**. Rota rehberliği her üç görünümde de yüksek kontrastla seçilebilmektedir.

---

### 2.7. Aşağı Bakışta Astronot Giysisi Kadrajı (Stage 17)
- **View-model Kinematiği:**
  - `astronaut-rig.js` ve `renderer.js` içinde birinci şahıs kollar, göğüs çantası (PLSS ön modülü) ve eldivenler doğrudan kamera yerel koordinat sisteminde çizilir.
- **Aşağı Bakış Açısı (Pitch Down):**
  - Fare ile aşağı bakıldığında (pitch açısı $-\pi/4 \dots -\pi/2$ aralığında), astronotun göğüs takımı ve kollar ekranın alt kısmında doğal bir kadraj oluşturur.
  - Zemin veya kamera kesişimi (frustum near-plane clipping) yaşanmaz; nefes alma ve adım atma salınımları gövde parçalarına yansıtılır.
- **Kabul:** **PASS**. Görsel astronot giysisi varlığı birinci şahıs hissiyatını güçlendirmektedir.

---

### 2.8. 1× Gerçek Dikey Ölçek (Stage 35B)
- **Bilimsel Doğruluk:**
  - Varsayılan dikey ölçek bilimsel 1:1 (`verticalScale: 1`) olarak ayarlanmıştır. HiRISE DTM'den okunan kot farkları doğrudan arazinin gerçek eğim ve tepe yüksekliklerine yansıtılır.
- **3. Şahıs Astronot Rig'i Oranı:**
  - Arazideki görsel abartı seçeneklerinde (2× veya 3×) astronotun dikeyde esnemesi giderilmiş; astronot boyutları daima 1:1 sabit tutulmuştur (`rigVerticalScale = 1`).
- **Dinamik Seçici:**
  - Araç çubuğunda `#select-vertical-scale` ile 1×, 2× ve 3× arasında anlık geçiş yapılabilmekte, HUD üzerindeki `#scale-badge-container` güncel durumu yeşil/kehribar rozetle doğrulamaktadır.
- **Kabul:** **PASS**.

---

### 2.9. HiRISE Kontrollü Ortomozaik Kaplaması (Stage 21B / 39B)
- **Çok Çözünürlüklü Doku Piramidi:**
  - `data/ortho/` altında z17 ($0.318\text{ m/px}$) ince doku ve z14 ($2.544\text{ m/px}$) kaba doku başarıyla yüklenir.
- **Görsel Modlar:**
  - `Hibrit` (Orto + DTM Gölgelendirmesi), `HiRISE Ortomozaik` (yalnız orto dokusu) ve `DTM Gölgeli Kabartma` (Hillshade) modları arasında anlık geçiş desteklenir.
- **Kapsam Dışında Korunum:**
  - Ortomozaik kapsamı dışındaki alanlarda şeffaflık korunarak DTM gölgeli kabartması gösterilir; kenarlarda doku uzaması veya piksel kirliliği oluşmaz.
- **Atıf ve Künye:**
  - Katman panelinde: *"Lisans: kaynakta belirtilmemiş · USGS Astrogeology / NASA JPL Mars Trek"* künyesi yer alır.
- **Kabul:** **PASS**.

---

## 3. Bilimsel Sınırlar ve Feragat Bildirimi

1. **Kot ve Eğim:** Arşiv HiRISE DTM'sinden türetilmiş değerlerdir; bir güvenlik sertifikası veya karar desteği değildir.
2. **Yürünebilirlik Göstergesi:** A* maliyet modelinden türetilmiş bir planlama göstergesidir; güvenli rota sertifikası değildir.
3. **Mars Atmosferi ve İntikal:** Simülasyon yerçekimi küresel $3.71\text{ m/s}^2$ referansıdır; yerel Jezero anlık atmosfer ölçümü veya gerçek giysi biyomekaniği değildir.
4. **Sürüş İzi:** MMGIS arşiv izidir; canlı telemetri içermez.

---

## 4. Sonuç ve Öneri

Stage 29A kapsamında incelenen 9 kritik görsel ve fonksiyonel bileşenin tamamı **PASS** olarak doğrulanmıştır. Sistem, Stage 30 Jüri Demo Akışı ve kod dondurma aşamasına tam hazır durumdadır.
