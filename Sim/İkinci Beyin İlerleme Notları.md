# Marswalk — İkinci Beyin İlerleme Notları (Proje Kapanış ve Retrospektif)

**Son Güncelleme:** 18 Kasım 2026  
**Durum:** Hackathon tamamlandı — Derece alınamadı; Nihai Proje Durumu, Statik Dağıtım Hazırlığı ve Kapsamlı Retrospektif Kaydı  
**Kapsam:** NASA Space Apps Challenge 2026 — *Interplanetary Survival Guide: Martian Map*  
**Kod Tabanı & Doğrulama:** `origin/codex/efe-visual-realism` (`6a6a27e` üzerine statik dağıtım ve dokümantasyon güncellemeleri), **769/769** birim testi PASS, preflight **HAZIR** (0 hata, 0 uyarı); tarayıcı smoke geçmişi (`6a6a27e` / `9a03250`): **38/38** PASS  
**Notun Amacı:** Projenin başlangıcından hackathon teslimine ve hackathon sonrası statik yayınlama hazırlığına kadar geçen tüm teknik evrimini, tamamlanan 13+ faz ve F0–F13 vitrin özelliklerini, mimari kararları, bilimsel veri sınırlarını ve yarışma sonucunun derinlemesine retrospektif analizini tek bir doğrulanmış kaynakta toplamak.

---

## 1. Hackathon Kapanışı ve Retrospektif Değerlendirme

NASA Space Apps Challenge 2026 süreci resmen tamamlanmış ve jüri değerlendirmeleri sonucunda projemiz derece alamamıştır. Bu sonuç, projenin teknik yetersizliğinden değil; hackathon dinamikleri, jüri beklentileri, sunum/dağıtım kısıtları ve stratejik tercihlerin bileşkesinden kaynaklanmıştır.

### 1.1. Neden Derece Alınamadı? (Objektif Jüri ve Süreç Analizi)

NASA Space Apps küresel ve yerel jüri değerlendirme kriterleri beş ana eksene dayanır: **Impact (Etki)**, **Creativity (Yaratıcılık)**, **Validity (Bilimsel Geçerlilik)**, **Relevance (Konuya Uygunluk)** ve **Presentation (Sunum)**.

1. **Presentation & Dağıtım Bariyerleri (En Kritik Faktör):**
   - **Canlı Demo ve Barındırma:** Hackathon jürileri genellikle projeyi yerel ortamda klonlayıp (`git clone`, `node server.mjs`) çalıştırmaz; doğrudan çalışan bir web bağlantısına (GitHub Pages, Cloudflare Pages, Netlify vb.) tıklar. Hackathon sırasında statik demo derlemesi ve harici canlı barındırma sürecinde yaşanan gelgitler, jürinin projeyi interaktif olarak deneyimleme olasılığını kısıtlamıştır. *(Bu açık hackathon sonrası `Sim/scripts/build-pages.mjs`, alt-dizin uyumlu göreli yollar, `.github/workflows/deploy-pages.yml`, `netlify.toml`, `vercel.json` ve `Sim/DEPLOYMENT.md` ile tamamen kapatılmıştır.)*
   - **Depo Görünürlüğü ve Klonlanabilirlik:** GitHub reposunun görünürlüğü (private/public) ve Git LFS bağımlılıkları son günlere kadar risk oluşturmuştur (son saatlerde `5c8090c` ile LFS kaldırılarak `.f32` dosyaları doğrudan blob yapılmış olsa da zamanlama baskısı yaratmıştır).
   - **30 Saniyelik Video Kuralı:** 2026 Space Apps kuralları gereği proje demosu en fazla 30 saniye veya en fazla 7 slaytla sınırlıydı. 1,14×1,69 km'lik HiRISE arazisini, Mars yerçekimi balistiğini, Froude hızı modelini, 3D küre seçimini, holografik minimap'i ve A* rota optimizasyonunu 30 saniyede bir jüriye tam anlamıyla anlatmak son derece zordu.

2. **Bilimsel Titizlik (Validity) vs. Popüler Hackathon Beklentisi:**
   - Projemiz başından sonuna kadar **"bilimsel dürüstlük ve anti-fake"** ilkesiyle yönetildi: Bilinmeyen veriye `0` değeri verilmedi, no-data alanları gizlenmedi, USGS DTM'in düşey datumu kesinleşmediğinde `needs_review` etiketi konuldu, A* rotası "operasyonel güvenli rota sertifikası" değil "senaryo planlama göstergesi" olarak sunuldu.
   - Buna karşılık birçok dereceye giren hackathon projesi, arka planda gerçek veri hesaplaması olmasa dahi jüriye "yapay zeka destekli %100 güvenli Mars rotası" gibi gösterişli ve abartılı vaatlerle pazarlanmaktadır. Projemizin dürüst feragatnameleri (disclaimers) ve temkinli bilimsel dili, jüri tarafından bir "güç" yerine "eksiklik" olarak algılanmış olabilir.

3. **Challenge Temasıyla Hizalanma (Relevance & Impact):**
   - Challenge başlığı: *Interplanetary Survival Guide: Martian Map*.
   - Projemiz ağırlıklı olarak **jeodezik doğruluk, 1. şahıs fotogerçekçi astronot hareket kinematiği ve WebGL2 rendering motoru** üzerine odaklandı.
   - Jüri ise bir "Hayatta Kalma Rehberi (Survival Guide)" temasında; oksijen tüketim simülasyonu, radyasyon sığınakları, acil durum kaynak yönetimi, toz fırtınası senaryoları gibi daha çok oyunlaştırılmış/senaryo bazlı rehber özellikleri aramış olabilir. Bizim simülasyonumuz hayatta kalma mekaniklerinden ziyade yüksek hassasiyetli bir topografik keşif ve navigasyon simülatörü olarak şekillendi.

4. **Kapsam Genişlemesi (Scope Creep) ve Zaman Dağılımı:**
   - Son 48 saatte; 3D Mars küresi, holografik radar minimap, kask vizör efektleri, otopilot showreel'ı, 6 görünüm katmanı ve 542 sözlük girdili iki dilli (TR/EN) altyapı sıfırdan inşa edildi.
   - Bu inanılmaz mühendislik maratonu kod kalitesini ve teknik zenginliği zirveye taşırken; sunum videosunun cilalanmasına, tasarım odaklı slaytların hazırlanmasına ve jüri odaklı hikaye anlatımına (storytelling) ayrılan zamanı daralttı.

---

## 2. Teknik Miras: Neler Başarıldı?

Hackathon derecesinden bağımsız olarak, Marswalk projesi sıfır harici framework bağımlılığıyla inşa edilmiş, tarayıcı üzerinde çalışan kapsamlı açık kaynaklı Mars keşif simülasyonlarından biri haline gelmiştir:

| Başarı Alanı | Gerçekleşen Çıktı ve Standart |
|---|---|
| **Sıfır Bağımlılık (Zero-Dependency)** | Ne Three.js ne Babylon ne de harici bir kütüphane kullanıldı. Vanilla ES modülleri, saf WebGL2 gölgelendiricileri ve tarayıcı Canvas 2D API'si ile sıfırdan yazıldı. |
| **Birim ve E2E Test Kapsamı** | Proje `node:test` ile **769/769 birim testine** (`Sim/test/*.test.mjs`) ve başsız DevTools üzerinde doğrulanmış **38/38 smoke testine** (`9a03250`/`6a6a27e` geçmişi) sahiptir. |
| **PDS / HiRISE 1 m Veri Entegrasyonu** | Jezero Krateri Sol 120 (WB1) - Sol 164 (Roubion) hattında 1,009663 m/piksel çözünürlüklü gerçek MRO HiRISE DTM verisi işlendi; 3×3 Horn eğim analizi ve mikro kabartma gölgelendirmesi çıkarıldı. |
| **K3-10 Izgara Hizalaması** | Legacy HiRISE DTM çerçevesi ile yerel A* planlayıcı arasındaki ~20–40 m'lik koordinat uyuşmazlığı, saf yeniden örnekleme modülü (`route/legacy-grid-plan.js`) ile çözüldü; planlayıcı ve 3D örnekleyici tek düzenli yerel ızgarada (`1670×1170`) eşitlendi. |
| **Mars Yerçekimi ve Balistik Zıplama** | NASA 3,71 m/s² yerçekimi altında parabolik zıplama yörüngesi (~1,29 s uçuş, ~0,78 m apex; havada 2× saat hızı), havada yatay momentum korunumu ve iniş darbe sönümleme mekaniği (`landingRecovery`) tamamlandı. |
| **EVA Loping Yürüyüş Kinematiği** | Apollo/Mars düşük yerçekimi araştırmalarına dayanan loping gait (sıçramalı yürüyüş), üç aşamalı uçuş pozu, iniş diz bükme/darbe emme pozları ve nefes/adım salınımı (`astronaut-rig.js`) geliştirildi. |
| **3D İnteraktif Mars Küresi** | Viking MDIM 2.1 z0–z3 piramidini kullanan, fareyle döndürülebilen, 5 sn/tur otopilot dönüşlü, koordinat ışınlama ve serbest başlangıç noktası seçtiren WebGL küre motoru (`view/globe/`) eklendi. |
| **Holografik Kask ve Minimap** | 1. şahıs kask vizörü (altın kaplama çerçeve, iç yansıma, dinamik nefes buğusu) ve Normal/Optik/Topo/Termal/Atmosfer/Radyasyon modlarına sahip yarı saydam minimap HUD'ı kuruldu. |
| **Otopilot & Showreel Modu** | Chaikin algoritmasıyla yumuşatılmış A* rotasını 0,5×–10× hızda takip eden, 20 m koridor dışına çıkınca rotayı yeniden planlayan otomatik sürüş ve showreel (`?showreel=1`) eklendi. |
| **İki Dilli (TR/EN) Tam Altyapı** | `i18n.js`, `i18n-dict.js` (542 sözlük girdisi + 12 kural) ve `lang-switch.js` ile tüm arayüz tek tıkla veya `?lang=en|tr` ile Türkçe ve İngilizce arasında geçiş yapabilir hale getirildi. |
| **Galaksi & Atmosferik Render** | Dinamik Samanyolu bandı (`makeGalaxyPixels`), 3.200 yıldızlı uzay alanı (`makeStarField`), Mars gökyüzü pus/toz saçılımı ve prosedürel regolit/çakıl zemin dokuları entegre edildi. |
| **LFS Bağımsızlığı & Statik Yayınlama** | 7,5–7,6 MB'lık iki `.f32` arazi dosyası düz Git blob'una dönüştürüldü (`5c8090c`), tüm asset URL'leri alt-dizin göreli hale getirildi ve `npm run build:pages` + GitHub Pages / Cloudflare / Netlify / Vercel yapılandırmaları eklendi. |

---

## 3. Bilginin ve Verinin Durumu

Projede yer alan bilgilerin güvenilirlik seviyeleri:

- **[DOSYA/KAYNAKLA DOĞRULANDI]**: Depodaki kaynak kod, metadata veya birincil bilimsel kaynaklarda (NASA PDS, USGS, HiRISE SIS) doğrulanmış bulgular.
- **[KULLANICI BİLDİRDİ]**: Takım üyelerinin veya kullanıcının bildirdiği operasyonel notlar.
- **[AÇIK / SINIRLI]**: Dış veri kısıtı, lisans belirsizliği veya bilinmeyen datum nedeniyle dürüstçe açık bırakılan hususlar.

### 3.1. Jeodezik ve Raster Veri Envanteri

1. **Aktif HiRISE DTM (`DTEEC_045994_1985_046060_1985_U01`):**
   - PDS Veri Kümesi: `MRO-M-HIRISE-5-DTM-V1.0` (`Sim/data/legacy-hirise/dtm_subset.f32` & `.json`).
   - Çözünürlük: ~1,009663 m/piksel, 32-bit float kot verisi (1669×1129 alt küme).
   - No-Data değeri: `0xFF7FFFFB`. Boşluklar sıfıra çevrilmez; mesh üretilirken no-data quad'ları atlanır.
2. **USGS TRN Jezero DTM Adayı:**
   - 1 m çözünürlüklü mozaik adayı (`Sim/data/dtm_subset.f32`, 1676×1135, CC0 1.0) depoda mevcuttur ancak ürün-özel düşey datum (`verticalDatumVerified: false`) bağımsız doğrulanamadığı için `needs_review_verticalReference` etiketiyle güvenli legacy fallback aktif tutulur.
3. **Viking MDIM 2.1 Küresel Renkli Mozaik:**
   - Küre dokusu z0–z3 karo piramidi (`Sim/data/viking-mdim/`, 232 m/px kaynak) olarak yerel depoda mevcuttur. Renkli işlenmiş mozaiktir; "gerçek Mars rengi" değil bağlamsal sunum olarak etiketlenmiştir (`license: belirtilmemiş`).
4. **Perseverance Rota Verisi (Sol 120–164):**
   - WB1 `(18.43906919°N, 77.44940206°E)` ile Roubion `(18.42769340°N, 77.45165066°E)` arasındaki düz hat ~686–687 m'dir. A* ile hesaplanan yürünebilir rota ~730 m uzunluğundadır. Ham PLACES CSV izi kullanılmadığından, rotanın basitleştirilmiş bir DTM waypoint bağlantısı olduğu açıkça belirtilir.

---

## 4. Uygulama Mimarisi ve Statik Yayınlama Yapısı

```
.
├── README.md                        # Çift dilli (TR/EN) ana vitrin ve tanıtım belgesi
├── netlify.toml                     # Netlify tek tıkla statik yayın yapılandırması
├── vercel.json                      # Vercel statik yayın yapılandırması
├── .github/workflows/deploy-pages.yml # GitHub Pages (+ opsiyonel Cloudflare) CI/CD iş akışı
└── Sim/
    ├── README.md                    # Teknik geliştirici ve mimari dokümantasyonu
    ├── DEPLOYMENT.md                # Statik paketleme ve platform bazlı yayın kılavuzu
    ├── SOURCES.md                   # 14 kaynaklı otomatik üretilen atıf ve lisans envanteri
    ├── DEMO_NOTES.md                # Jüri sınır kartı ve ölçüm/senaryo ayrım tablosu
    ├── scripts/build-pages.mjs      # Subpath-uyumlu Sim/dist/ statik paket üreticisi
    ├── test/                        # 769 birim testi (build-pages.test.mjs dahil)
    └── public/js/
        ├── main.js                  # Composition root & WorldSnapshot döngüsü
        ├── config.js                # Salt okunur senaryo, waypoint ve kaynak sabitleri
        ├── app/                     # demo-flow, free-start, biome-label, showreel, i18n
        ├── geo/                     # geo, local-grid (K3-10), geology, regional-dem, traverse
        ├── surface/                 # layers, registry (fail-closed), ortho-layer, thermal
        ├── simulation/              # sim (3.71 m/s² balistik), auto-drive, crew-sim
        ├── route/                   # cost-model, pathfinder.worker, route-compare, legacy-grid-plan
        ├── input/                   # input.js (WASD, Space, P, R, M, fare kilidi)
        └── view/                    # render.js (2D), 3d/ (WebGL2 0-7 pass), globe/, minimap/, helmet.js
```

---

## 5. Kronolojik Aşama Özeti (Stage 1 – Stage 13, K-Aşamaları & Yayınlama)

1. **Stage 1–7 (MVP Temelleri):** 2D Canvas üzerinde Mars yüzeyinde hareket, PDS DTM'den Horn gradyanıyla eğim çıkarma, senaryo saati, rota koridoru ve sapma metrikleri.
2. **Stage 8 (Sunum & Demo Akışı):** Sol 164 Roubion varış rozeti, nişangah (`#fp-reticle`), kontrol kapsülü ve sunum HUD'ı.
3. **Stage 9 (CPU Mesh Builder):** HiRISE DTM'den dinamik WebGL2 üçgen ağı üretimi, bellek optimizasyonu ve no-data deliklerinin düzgün işlenmesi.
4. **Stage 10 (1. Şahıs Keşif & Yüzey Teması):** Kamera göz hizası (1,48 m), kamera yönlü hareket, zemin temas kontrolü ve astronot rig view-model entegrasyonu.
5. **Stage 11 (3D Beacon & Rota Kılavuzu):** Sol 120 ve Sol 164 konumlarında gökyüzüne uzanan ışık sütunları (beacon) ve zemin üzeri kılavuz geometrisi.
6. **Stage 12 (Mars Zıplama Balistiği & Kamera Dinamiği):** `3,71 m/s²` Mars yerçekimi, `2,4 m/s` dikey itme ile ~1,29 s havada kalış, momentum korunumu, iniş darbe sönümleme (`landingRecovery`) ve adım kafa salınımı (head-bobbing).
7. **Stage 13 (EVA Loping Kinematiği, i18n & Galaksi Arka Planı):** Apollo/Mars EVA düşük yerçekimi sıçramalı yürüyüş adımları, apex denge pozu, iniş darbe emme, TR/EN dil anahtarı (`i18n.js`, `i18n-dict.js`, `lang-switch.js`) ve Samanyolu/yıldız alanı (`6a6a27e`).
8. **K3-10 Izgara Entegrasyonu:** Legacy DTM koordinat çerçeve kaymasını düzelten `local-grid.js` ile planlayıcı hücresi = örnekleyici hücresi eşitliği sağlandı (`1ff13c8`, `aa0203c`).
9. **Final Vitrin Aşamaları (F0–F13):** Dönebilen 3D Mars Küresi (`f03dcdd`), Holografik Minimap, Kask Vizörü + Dinamik Nefes Buğusu (`c9da091`), Chaikin Otopilot, Ekip Yoldaşları, LFS'siz blob dönüşümü (`5c8090c`) ve 7 slaytlık İngilizce `.pptx` sunumu (`9211856`).
10. **Hackathon Sonrası Yayınlama & Dokümantasyon Paketi (18 Kasım 2026):** Alt-dizin uyumlu göreli yollar, `Sim/scripts/build-pages.mjs` (`npm run build:pages`), `.github/workflows/deploy-pages.yml`, `netlify.toml`, `vercel.json`, `README.md`, `Sim/DEPLOYMENT.md` ve `Sim/test/build-pages.test.mjs` (`769/769` test PASS).

---

## 6. Sonuç ve Özet

Marswalk, 2026 NASA Space Apps Challenge kapsamında yüksek bir mühendislik ve bilimsel doğruluk standardıyla inşa edilmiş; harici 3D oyun motorlarına yaslanmadan sıfırdan saf WebGL2 ve matematiksel jeodezi ile hayata geçirilmiştir.

Derece alınamamış olması projenin değerini azaltmaz; aksine **769 birim testiyle** doğrulanmış, bilimsel olarak dürüst, sıfır bağımlılıklı ve statik platformlarda tek tıkla canlıya alınabilen kalıcı bir açık kaynak Mars keşif simülatörü kazanılmıştır. Emeği geçen tüm ekibin ve yapay zeka ajanlarının ellerine sağlık.
