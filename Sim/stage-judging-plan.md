# Marswalk — Derece planı (K5)

**Tarih:** 15 Kasım 2026
**Kaynak dal:** `codex/efe-visual-realism` @ `57361da` (çalışma klasörü `C:\Users\efese\Desktop\Nasaspaceapps-efe`)
**Challenge:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map* (kullanıcı tanımı; resmî challenge listesinde bu başlık doğrulanamadı, aşağıda §1.4)
**Kapsam:** Yalnız plan. Uygulama kodu, veri ve testler bu belgede değiştirilmedi. Test koşusu: `node --test test/` → 601/601, çıkış kodu 0.

Etiketler: **[OKUNDU]** = bu oturumda kaynağı açılıp alıntısı alındı · **[ARAMA ÖZETİ]** = arama sonucunun özeti; kaynak sayfası açılamadı · **[DOĞRULANAMADI]** = kaynağa ulaşılamadı veya bulunamadı · **[GENEL ÇIKARIM]** = resmî olmayan jüri pratiği.

---

## 0. Önce bilinmesi gerekenler (acil)

> **Doğrulama güncellemesi (15 Kasım 2026, orkestra şefinin ek web araması):** Aşağıdaki "ARAMA ÖZETİ / DOĞRULANAMADI" etiketli kuralların çoğu, resmî 2026 kılavuzlarından alıntılayan **ikinci bir arama sonucuyla tutarlı bulundu**: <https://www.spaceappschallenge.org/resources/project-submission-guide/>, <https://www.spaceappschallenge.org/resources/judging-awards-guide/>, <https://www.spaceappschallenge.org/2026/>. Tutarlı çıkanlar: (a) proje teslimi **15 Kasım 23:59 yerel saat**te kapanır (Project sekmesinden; "Submit to Global Judging" gerekir); (b) demo **≤ 30 sn video VEYA ≤ 7 slayt** (aşım = Global Judging'e uygun değil), harici ve herkese açık barındırma; (c) **proje sayfası ve bağlı tüm materyaller İngilizce** (video yalnız İngilizce altyazıyla); (d) her kullanılan kaynak atıflanır; (e) ölçütler **Impact, Creativity, Validity, Relevance, Presentation**, her biri 1–5; (f) değerlendirmenin çoğu proje teslim sayfasına dayanır, güçlü demo Presentation'ı artırabilir; (g) takım ≤ 6 kişi. **Hâlâ doğrudan okunamadı:** resmî sayfalar bu ortamda TLS sertifika hatası verdi (sertifika doğrulaması kapatılmadı); kesin bitiş saati ve ölçüt tanımlarının tam metni için **kullanıcı sayfaları tarayıcıdan açıp teyit etmelidir** (özellikle yerel etkinliğinizin ek kuralları). Kullanıcının "2–3 dk demo" planı resmî sınırla **uyuşmaz**: tek bir 30 sn video veya 7 slayt kullanın; uzun video isteğe bağlı ek materyal olabilir ama yarışma demosu yerine geçmez.

1. **Son teslim saati doğrulanamadı; arama özetine göre bu gece 23:59 olabilir.** Kaynak: arama özeti, `spaceappschallenge.org/2026/` (açılamadı). Kullanıcı resmî sayfadan bugün bitiş saatini teyit etmeli. Teyit edilene kadar P0 listesi "en kısa teslim seti"ni temel alır (§5).
2. **Resmî sayfalar bu ortamda açılamadı.** `spaceappschallenge.org` sayfalarına (judging-awards-guide, 2026, project-submission-guide) WebFetch ve web-fetch ajanı ile erişimde `unable to get local issuer certificate` hatası alındı. Sertifika doğrulaması kapatılmadı. Bu yüzden resmî jüri ölçütlerinin tam metni ve açıklamaları **doğrudan okunamadı**; yalnızca arama özetleri var.
3. **Kullanıcının "2–3 dk demo videosu" planı, arama özetindeki kurala uymayabilir.** Özete göre demo ya **en fazla 30 saniyelik video** ya da **en fazla 7 slaytlık deck** olmalı; aşan projeler Global Judging'e uygun değil. Bu kural resmî sayfadan teyit edilmeli (§1.2).
4. **Ürün iddiası ile repo arasında açık çelişkiler var** (§3.3): aktif arazi yedek veridir, datum bayrağı tutarsızdır, FPS ölçümleri birbirini tutmuyor, rota hızı iki değerle yazılı, lisansların çoğu belirtilmemiş. Jüriye bunların dürüst biçimde söylenmesi gerekir.

---

## 1. Resmî kaynaklar ve ölçütler

### 1.1 Jüri ölçütleri — [ARAMA ÖZETİ], doğrudan okunamadı
Kaynak: `https://www.spaceappschallenge.org/resources/judging-awards-guide` (arama sonucu başlık: "Judging & Awards Guide"; sayfa açılamadı). Arama özetleri şu beş ölçütü listeliyor: **Impact, Creativity, Validity, Relevance, Presentation**; her biri 1–5 puan. Özetlerdeki tanımlar (doğrudan alıntı değil, özet):
- **Impact:** Projenin kaç kişiyi ve ne ölçüde etkilediği.
- **Creativity:** Özgünlük ve yenilik.
- **Validity:** Bilimsel temel, teknik/işlevsel fizibilite, gerçek kullanım.
- **Relevance:** Challenge ile uyum ve NASA verisinin çözümde **ayrılmaz** olması ("integral, not decorative" özetinde).
- **Presentation:** Demo ve tam proje üzerinden açıklığın değerlendirilmesi.

Not: Özet, 2025 ve 2026 metinlerinin ayrımını net vermiyor; 2014–2018'de farklı kümeler (Sustainability dahil) kullanılmış. Bu nedenle ölçüt adları 2026 guide'dan teyit edilmeli.

### 1.2 Teslim gereksinimleri — [ARAMA ÖZETİ], teyit edilmeli
Kaynak: `https://www.spaceappschallenge.org/resources/project-submission-guide/` (açılamadı; arama özeti "age metadata is inconsistent" uyarısı veriyor).
- Demo: video **≤ 30 sn** veya deck **≤ 7 slayt** (başlık ve giriş slaytları dahil). Aşım = Global Judging'e uygun değil.
- Demo barındırma: dosya siteye yüklenmez; şifresiz, kayıt istemeyen dış bağlantı verilir.
- Dil: proje sayfası ve bağlantılı materyal İngilizce; video başka dilde olabilir ama İngilizce altyazılı olmalı; deck İngilizce olmalı.
- Slayt içeriği: takım adı, üye adları, seçilen challenge; projenin görseli, kullanıcı deneyimi, NASA/ortak veri kullanımı.
- Zorunlu alanlar: proje adı, "ne yapıldığı / challenge'a nasıl yanıt verdiği / neden önemli" özeti, demo bağlantısı.
- Kaynak: **tüm kaynaklar atıflanmalı** (2026 kuralları için arama özeti).
- Video: 18 yaş altı kişilerin tanınabilir görüntü/sesi olmamalı.

### 1.3 Bilinen zaman çizelgesi — [ARAMA ÖZETİ] / [DOĞRULANAMADI]
- Etkinlik: 14–15 Kasım 2026 (NASA Science sayfası ve arama özetleri; `science.nasa.gov/universe/nasa-welcomes-all-ages-experience-levels-for-space-apps-challenge/` [OKUNDU] — sayfada tarih ve "interplanetary survival guide" ifadesi var).
- Son teslim: arama özetine göre 15 Kasım 23:59 yerel saat. **[DOĞRULANAMADI]** (resmî sayfa açılamadı).
- Jüri başlangıcı: 16 Kasım (arama özeti). **[DOĞRULANAMADI]**.

### 1.4 Challenge tanımı — [OKUNDU] kısmen
- Kaynak `science.nasa.gov/universe/nasa-welcomes-all-ages-experience-levels-for-space-apps-challenge/` [OKUNDU]: "students from around the world can use NASA's powerful data sets to help us build the ultimate interplanetary survival guide"; "Several challenges involve operational concepts for Martian surface activities, integrating data from multiple Mars missions, or reflecting the mission-design trade-offs"; "Challenges associated with these efforts focus on improving public access to mission data".
- **"Martian Map" başlığı hiçbir okunan kaynakta bulunmadı [DOĞRULANAMADI].** `spaceappschallenge.org/2026/` challenge listesi açılamadığı için başlık teyit edilemedi. Kullanıcı challenge başlığını resmî listeden kopyalamalı. Bu, Relevance puanı için kritik.

### 1.5 Kaynak kapsamı dışı kalanlar
- 2022 FAQ (`legacy.spaceappschallenge.org/resources/faq/` [OKUNDU]) 2022 challenge'ı ve 2 Ekim son teslim anlatıyor; **2026 için geçerli değildir**. Yalnız "tüm kaynakları atıfla", "kodu paylaş" gibi genel kuralların eski yıl örneği olarak not edildi.
- Özette geçen "Best Use of Data" gibi küresel ödül adları 2026 için doğrulanmadı.

---

## 2. Projenin dürüst durumu — depo kanıtı

Her madde bir depo dosyasına bağlıdır. Sayılar, bu oturumda çalıştırılan `node --test test/` (601/601, çıkış 0) ile belgeler arasında karşılaştırıldı.

### 2.1 Güçlü yönler
- **Test ve kabul altyapısı:** `node --test test/` 601/601, çıkış 0 (bu oturumda doğrulandı). `scripts/preflight.mjs` HAZIR (yol haritası "Proje kapanış durumu", `yapay zeka icin/road map.md`; Efe'nin kendi çalıştırma kaydı, bağımsız değil).
- **Smoke:** `Sim/stage-merge-review.md` → son 38/38 (birleşim incelemesi). `Sim/stage-final-acceptance.md` → `npm run smoke` **NOT-TESTED** (port çakışması). Yani 38/38 bir birleşim anına ait; K1 kabulünde smoke yok.
- **Sınır dürüstlüğü:** `Sim/DEMO_NOTES.md` §3 ve §5 — "Ne değil" bölümü (canlı telemetri yok, güvenli rota sertifikası yok, PLACES yok), her sayı için ÖLÇÜM/HESAP/SENARYO/SUNUM etiketi, 14 dürüst jüri sorusu. Bu, Validity ve Presentation için gerçek bir koz.
- **Veri kaynakları ve atıf:** `Sim/SOURCES.md` 14 kaynak, her biri için ürün kimliği, çözünürlük, lisans, atıf sütunları; "uydurulmuş lisans yok" ilkesi açık.
- **NASA verisi aktif kullanımda:** HiRISE DTEEC (legacy, ekranda), MOLA bölgesel kot (ufuk), Viking MDIM 2.1 (minimap), USGS Mars 2020 TRN (analiz adayı), NSSDC Mars/Sun fact sheet değerleri (atmosfer, güneş). Relevance için güçlü zemin; ancak "integral" (çözümün kendisi) mi "dekoratif" mi, jüri için anlatılmalı.
- **Sunum ve demo modu:** `?demo=1` otomatik Sol 120→164 rotası; `Sim/README.md` satır 31, 47. 2D fallback ve WebGL2 fallback `Sim/DEMO_NOTES.md` §2 adım 6.
- **Rota planlama:** A* ve üç tercih (dengeli / en kısa / en düz), `Sim/stage-final-acceptance.md` R1 ve `Sim/stage23-route-validation.md`.

### 2.2 Zayıf / riskli yönler (kanıtla)
| # | Bulgu | Kanıt (dosya) | Ağırlık |
|---|---|---|---|
| W1 | Ekranda gösterilen arazi **legacy PDS3 DTEEC yedeği**; USGS 1 m aday "needs_review" ile reddedilmiş. Analizlerin çoğu aday pencerede yapıldı; UI'de yeniden koşulmadı. Karar bekliyor (K3-7). | `Sim/DEMO_NOTES.md` §1 ve §4; `Sim/stage-final-acceptance.md` satır 7; `road map.md` K3-7, K3-9 | Yüksek (Validity) |
| W2 | **Datum tutarsızlığı:** `config.js:56` `verticalDatumVerified: true`; `data/dtm_subset.json` `false`. Kanıt yok. | `Sim/stage38-integrity-audit.md` satır 23; `road map.md` K3-5 | Yüksek (Validity) |
| W3 | **Ortomozaik hizası ölçülmedi** (aktif legacy DTM ile). Ölçüm USGS aday penceresinde; korelasyon r≈0,40 (zayıf); yarım piksel kanıtlanmadı. | `Sim/DEMO_NOTES.md` §1 ve §3; `road map.md` K3-8 | Yüksek (Validity) |
| W4 | **FPS sayıları çelişkili:** commit/yol haritası "~54 FPS" diyor; `Sim/stage-camera-motion-audit.md` satır 89 **82–88 FPS** (smoke 6c, başsız Chrome); `Sim/stage-perf-and-preference-review.md` satır 7 demo koşusu **23–30 FPS** (yük değişken). Tek bir doğru değer ve cihaz bilgisi yok. | ilgili üç dosya | Orta (Validity, Presentation) |
| W5 | **Rota hızı çelişkisi:** rota tahmini 0,8 m/s (`route-service.js:301`, `status: 'scenario'`), simülasyon 1,2 m/s × 8 (`config.js:5,13`). | `Sim/DEMO_NOTES.md` §1, §4 | Orta (Validity) |
| W6 | **Lisans:** 14 kaynağın 13'ünde lisans "belirtilmemiş" (`SOURCES.md` satır 4). Viking K1-4 teyidi elle bekliyor. Teslimde "cite every source" kuralı için lisans metni yoksa atıf eksik kalır. | `Sim/SOURCES.md`; `road map.md` K1-4 | Yüksek (uyum, Validity) |
| W7 | **Kabul kanıtı eksik:** K1-2 tarayıcı kabulü açık; `stage29-acceptance.md` eski "9/9 PASS" ifadesi yeni K1-2 bölümüyle çelişiyor; 9 görüntünün 5'i iddiayı destekliyor. | `Sim/stage-merge-review.md` satır 16 | Yüksek (Presentation) |
| W8 | **Feragatler katlanmış panelde:** smoke 1, 5a, 5b bu yüzden kırmızıydı; `<details>` içinde kalan sınırlar ilk bakışta görünmüyor. Düzeltilmiş kabul ile tek başına yeterli değil. | `Sim/stage-merge-review.md` satır 12, 19–40 | Yüksek (Validity, jüri güveni) |
| W9 | **Viking rengi işlenmiş küresel ürün** (232 m/px); "arazi rengi" iddiası yok, ama minimap'te gösteriliyor. | `Sim/DEMO_NOTES.md` §1 | Düşük-orta |
| W10 | **MOLA datum `needs_review`**; ufuk yalnız bağlam olarak. | `Sim/DEMO_NOTES.md` §1, §3 | Orta |
| W11 | **Rapor metin hataları:** "Yazar: Efe" (`stage39-ortho-diagnosis.md`); "costParams iletilir" (`stage34b`); göz yüksekliği 1,48 m (kod) / 1,75 m (`e9a0a78` commit mesajı). | `road map.md` K3-6; `Sim/DEMO_NOTES.md` §4 | Düşük (ama jüri dikkatli okursa güveni düşürür) |
| W12 | **Sunum materyali yok:** çalışma ağacında (data hariç) pptx, mp4, webm, pdf veya gif bulunamadı. Repo kökünde README ve LICENSE dosyası yok (yalnız `Sim/README.md`). | Glob taraması, bu oturum | Yüksek (Presentation; teslimin kendisi) |
| W13 | **Impact tanımlı değil:** dokümanlarda "kimin işine yarar" sorusuna yanıt yok; DEMO_NOTES "Ne değil" bölümü etkiyi sınırlıyor. Bu dürüst ama puan kaybı. | `Sim/DEMO_NOTES.md` §5 Q13 | Yüksek (Impact) |
| W14 | **Demo süresi:** 60–90 sn akış (DEMO_NOTES §2) ile resmî 30 sn/7 slayt sınırı [ARAMA ÖZETİ] uyuşmuyor. | §1.2 | Yüksek (teslim) — teyit edilmeli |

---

## 3. Ölçüt eşleme tablosu

Ölçüt adları §1.1'den (arama özeti). Puan düzeyi: **G** güçlü, **O** orta, **Z** zayıf (kendi değerlendirmem, ölçülmüş değil).

| Ölçüt | Bugünkü kanıt | Boşluk | Düzey | Önerilen iş |
|---|---|---|---|---|
| **Impact** | Jezero demosu, senaryo zamanı, "survival guide" bağlantısı (sadece sunumda) | Hedef kullanıcı ve etki hikâyesi yok; "Ne değil" bölümü etkiyi sınırlıyor | **Z** | P1-1 (etki paragrafı, sınırlarla tutarlı) |
| **Creativity** | Birinci şahıs astronot, zıplama, rota tercihleri, minimap/Viking bağlamı | Yeniliği anlatan tek sayfa yok; demo akışı kırılgan | **O** | P1-2 (tek slayt: "ne yeni") |
| **Validity** | 601/601 testler, preflight, DEMO_NOTES sınırları, SOURCES | W1–W5: yedek DTM, datum, hiza, FPS, hız, lisans | **Z-O** | **P0-3 (kararlar), P0-4 (lisans), P1-3 (FPS/hız)** |
| **Relevance** | HiRISE, MOLA, Viking, USGS, NSSDC kaynakları UI'da | NASA verisinin çözümde "integral" olduğu anlatılmıyor; challenge başlığı doğrulanmadı | **O-G** | P0-2 (challenge başlığı ve NASA veri rolü tek slaytta) |
| **Presentation** | Demo modu, 2D fallback, sınır kartı | Pptx/video yok; K1-2 kabulü açık; teslim formu içeriği yok | **Z** | **P0-1, P0-2, P0-5** |

**En büyük 3 boşluk:**
1. **Sunum materyali ve teslim yok** (W12, W14). Presentation ve teslimin tamamı buna bağlı.
2. **Validity'yi zayıflatan çözülmemiş kararlar** (W1, W2, W3). Jüri "bu arazi gerçek mi?" diye sorarsa yanıt karışık.
3. **Impact hikâyesi yok** (W13). Survival guide bağlantısı tek cümle.

---

## 4. Riskler ve dürüstlük çizgisi

- **Puan için iddia şişirme yasak.** "Güvenli rota", "gerçek rover izi", "canlı telemetri", "Jezero'da ölçülmüş yerçekimi", "atmosfer sürüklemesi", "ortomozaik kanıtlı hizalı", "Viking arazi rengi" iddiaları **kullanılmaz**. DEMO_NOTES §5 sorularına verilen yanıtlar slayt ve form metninde aynen kullanılır.
- **Üç sayının kaynağını göster:** ÖLÇÜM / HESAP / SENARYO / SUNUM etiketleri slaytta da bulunsun.
- **Çelişkiler düzeltilmeden jüriye gitme:** FPS tek değer (ölçüm koşulu ile), rota hızı tek değer (senaryo olarak), datum bayrağı tek değer (kanıt yoksa `false`).
- **Lisans uydurma yok.** Belirtilmeyen lisans "belirtilmemiş" yazılır; Viking metni bulunmazsa aynen kalır.
- **Yedek plan:** internetsiz/GPU'suz makinede demo çalışmayabilir (FPS 23–30 ölçüldü). Demo videosu, 2D fallback ekran görüntüsü ve sınır kartı yedek olarak hazır tutulur.
- **Ekip hedefi:** derece için kalite, dürüstlük ve açık sınırlar birlikte değerlendirilir. Bu bir **[GENEL ÇIKARIM]**: resmî ölçüt metni bu oturumda okunamadı.

---

## 5. Öncelikli iş listesi

Süre tahmini: iş başına saat, toplamlar eklenerek verilmiştir. Efe tarafı = kullanıcı + Claude ajanları. Alparslan = entegrasyon/UI/kod.

### P0 — teslim bloklayıcı (bu gece / en kısa sürede)

| ID | İş | Sahip | Süre (saat) | Kabul ölçütü | Bağımlılık |
|---|---|---|---|---|---|
| P0-1 | **Son teslim saatini ve demo kuralını resmî sayfadan teyit et** (judging-awards-guide, project-submission-guide, 2026 sayfası). Challenge başlığını resmî listeden kopyala. | **Kullanıcı elle** | 0,3 | Bitiş saati, demo sınırı (30 sn / 7 slayt), challenge başlığı yazılı; bu plandaki [DOĞRULANAMADI] etiketleri kapanır | yok |
| P0-2 | **Demo: 7 slaytlık deck** (takım adı, challenge, sorun, çözüm, NASA verisi rolü, ekran görüntüsü, sınırlar). Metin Efe taslağı, görsel kullanıcı. 30 sn video alternatifi yalnız P0-1 onayıyla. | **Efe** (metin, 1,5 saat) + **Kullanıcı** (tasarım, 2 saat) | 3,5 | 7 slayta uyar; her sayı DEMO_NOTES'a bağlı; İngilizce; kaynak slaytı var | P0-1 |
| P0-3 | **Yedek demo kaydı:** `?demo=1` akışının 60–90 sn ekran kaydı ve 2D fallback ekran görüntüsü. Canlı hata olursa bu kullanılır. | **Kullanıcı elle** (kayıt) + **Alparslan** (akış çalışıyor mu, K1-2'nin demo kısmı) | 1,0 (Kullanıcı 0,5, Alparslan 0,5) | Kayıt tek dosyada, kaynak sürümü yazılı | K1-1 çalıştırma |
| P0-4 | **Kaynak ve lisans bölümü:** `SOURCES.md`'den 14 kaynaklı atıf listesi; Viking için USGS sayfasında lisans metnini elle kopyala (K1-4); belirtilmeyenler "belirtilmemiş". | **Efe** (liste, 1,0) + **Kullanıcı elle** (Viking, 0,5) | 1,5 | 14 kaynak atıflı; "cite every source" kuralı karşılanır; uydurma lisans yok | P0-1 (kaynak kuralı teyidi) |
| P0-5 | **Proje sayfası metni:** proje adı, "ne yapıldı / challenge'a nasıl yanıt / neden önemli" özeti; sınır paragrafı (DEMO_NOTES §3). İngilizce. | **Efe** taslak (1,0) + **Kullanıcı** gözden geçirme ve gönderim (0,5) | 1,5 | Zorunlu alanlar tamam; her iddia depoya bağlı; sınırlar açık | P0-1 |
| P0-6 | **Datum bayrağını dürüst yap:** `config.js:56` `verticalDatumVerified` kanıt yoksa `false`; `dtm_subset.json` ile tutarlı (K3-5). | **Alparslan** (karar + düzeltme, 0,5) | 0,5 | İki kaynak aynı değeri gösterir; testler `node --test test/` 601/601 kalır (kullanıcı istediğinde koşulur) | yok |
| P0-7 | **Aktif arazi kararı (K3-7):** (a) legacy kalır, etiketle; (b) USGS aday `needs_review` etiketiyle etkinleşir. **Kullanıcı kararı** gerekir. | **Kullanıcı karar** (0,2) + **Alparslan** uygulama (2,0) | 2,2 | Karar kayıtlı; UI etiketi ve DEMO_NOTES ile tutarlı | yok |

**P0 toplam (≈10,5 sa):** Efe 3,5 sa (P0-2 metin 1,5, P0-4 liste 1,0, P0-5 taslak 1,0); Alparslan 3,0 sa (P0-3 akış 0,5, P0-6 0,5, P0-7 uygulama 2,0); Kullanıcı 4,0 sa (P0-1 0,3, P0-2 tasarım 2,0, P0-3 kayıt 0,5, P0-4 Viking 0,5, P0-5 gönderim 0,5, P0-7 karar 0,2). **Gece teslim olursa P0-1, P0-2 (en az 5 slayt), P0-4, P0-5 önce.**

Not: Toplamlar kişi başı değil, iş kalemi toplamıdır; paralel çalışılırsa takvim kısalır.

### P1 — puan getirir

| ID | İş | Sahip | Süre (saat) | Kabul ölçütü | Bağımlılık |
|---|---|---|---|---|---|
| P1-1 | **Impact paragrafı** ("kimin işine yarar" 3 hedef kitle, ölçüsüz iddia yok; "Ne değil" ile tutarlı). | **Efe** (0,5) + **Kullanıcı** onay (0,2) | 0,7 | Etki hikâyesi 1 paragraf, sınırlar ayrı | P0-5 |
| P1-2 | **Creativity tek slayt:** birinci şahıs ve zıplama ne yeni; rota tercihi ve Viking bağlamı. | **Kullanıcı** tasarım, **Efe** metin | 0,8 | Tek slayt, kanıt ekran görüntüsü | P0-2 |
| P1-3 | **FPS tek değer:** cihaz ve yük bilgisiyle tek ölçüm (K2-6). Üç farklı sayı kaldırılır. | **Alparslan** (ölçüm, 1,0) | 1,0 | Cihaz, GPU, ölçüm koşulu, tek değer; kodda değişiklik yok | yok |
| P1-4 | **Rota hızı tek değer:** `route-service.js:301` 0,8 yerine simülasyonla aynı 1,2 m/s (senaryo) ya da metinde açık "farklı varsayım". | **Alparslan** (kod, 0,3) veya **Efe** (metin, 0,2) | 0,3 | Tek değer ya da açık etiket; DEMO_NOTES §4 güncel | P0-6 |
| P1-5 | **Ortomozaik ↔ aktif DTM ölçümü** (K3-8): `validate-ortho-registration.mjs`'in legacy DTM'e uyarlanması; sonuç "ölçüldü" ya da "kanıtlanamadı". | **Efe** (3,0) | 3,0 | Ölçülmüş öteleme ± belirsizlik veya açık "kanıtlanamadı" | P0-7 |
| P1-6 | **K1-2 tarayıcı kabulü tamamlanması** (PASS/FAIL + ekran görüntüsü, feragatler görünür). | **Alparslan** | 2,0 | Her madde gözlenmiş kanıt veya NOT-TESTED nedeni | yok |
| P1-7 | **Rapor düzeltmeleri** (K3-6: "Yazar: Efe", "costParams", göz yüksekliği 1,48 / 1,75). | **Alparslan** (0,5) + **Efe** (0,2) | 0,7 | Üç metin düzeltilmiş, `git diff` ile gösterilir | yok |
| P1-8 | **Repo kökü:** kısa `README.md` (çalıştırma, sınırlar, lisans durumu) ve LICENSE kararı (kullanıcı). | **Efe** taslak (0,7) + **Kullanıcı** lisans kararı (0,2) | 0,9 | Kökte okunabilir README; LICENSE seçimi yazılı | P0-4 |

**P1 toplam:** Efe 4,7 sa; Alparslan 3,8 sa (P1-3 1,0, P1-4 0,3, P1-6 2,0, P1-7 0,5); Kullanıcı 0,6 sa.

### P2 — olursa

| ID | İş | Sahip | Süre (saat) | Kabul |
|---|---|---|---|---|
| P2-1 | K2-5 son gerçekçilik turu (vizör, gölge, sıçrama pozu, güneş hale) | **Efe** (Opus limiti sıfırlanınca) | 3,0 | Önce/sonra ekran görüntüsü; iyileştirmeyen geri alınır |
| P2-2 | K2-6 GPU/FPS ölçüm tablosu (1×/3×, gölge yüksek/düşük/kapalı) | **Alparslan** | 2,0 | Tablo, cihaz bilgisiyle |
| P2-3 | K3-3 rig test sınırı tasarım onayı | **Alparslan** + **Efe** | 0,5 | Onay kaydı |
| P2-4 | K3-4 `left*` isimleri / `side` düzeltmesi | **Efe** | 0,8 | Adlar `side` ile tutarlı |
| P2-5 | K4 (çok haritalı jeoloji, Gale/Columbia Hills, hiyerarşik planlayıcı, LOD) | **Efe**/**Alparslan** | >20 | Yarışma sonrası; teslime dahil değil |

---

## 6. Sahiplik özeti

- **Efe:** P0-2 metin (1,5), P0-4 liste (1,0), P0-5 taslak (1,0), P1-1 (0,5), P1-2 metin (0,3), P1-5 (3,0), P1-7 (0,2), P1-8 taslak (0,7), P2-1, P2-4.
- **Alparslan:** P0-3 akış (0,5), P0-6 (0,5), P0-7 uygulama (2,0), P1-3 (1,0), P1-4 (0,3), P1-6 (2,0), P1-7 (0,5), P2-2, P2-3.
- **Kullanıcı elle:** P0-1 (0,3), P0-2 tasarım (2,0), P0-3 kayıt (0,5), P0-4 Viking (0,5), P0-5 gönderim (0,5), P0-7 karar (0,2), P1-1 onay (0,2), P1-2 tasarım, P1-8 lisans kararı (0,2).

Dosya sınırı: Efe `Sim/stage-judging-plan.md`, `yapay zeka icin/road map.md` (yalnız K5), `Sim/DEMO_NOTES.md` ve `Sim/SOURCES.md` metinleri (P0-4/P0-5/P1-7) — bu dosyalar Ajan E ile çakışmayacak şekilde ayrı commit'lenir. Alparslan kodları `config.js`, `route-service.js`, `main.js`, `view/3d/` altındadır.

---

## 7. Kullanıcıya sorular

1. **Son teslim saati:** resmî sayfadan bugün saat kaçta? Bu gece ise P0 listesi kısaltılır.
2. **Demo biçimi:** 30 saniyelik video mu, 7 slaytlık deck mi? (Kullanıcının 2–3 dk planı resmî sınırla uyuşmuyor.)
3. **Challenge başlığı:** resmî listede "Martian Map" tam olarak nasıl yazılıyor?
4. **Sunum dili:** İngilizce zorunlu gibi görünüyor; Türkçe anlatım yalnız kişisel sunumda mı?
5. **Ekip adı ve üye adları:** slayt 1 için; bu plana yazılmadı.
6. **Aktif arazi (K3-7):** legacy yedek mi kalsın, yoksa USGS 1 m `needs_review` etiketiyle mi görünsün?
7. **LICENSE:** proje açık kaynak mı, hangi lisansla? Kararsızsa "belirtilmemiş" kalır.
8. **Video kaydı:** yedek demo kaydı için makinede ekran kaydı yapılabilir mi?

---

## 8. Doğrulama özeti

- `node --test test/` (Sim): **601/601, çıkış kodu 0** (bu oturumda çalıştırıldı).
- Resmî spaceappschallenge.org sayfaları: **açılamadı** (TLS sertifika hatası). Ölçütler arama özetinden, [ARAMA ÖZETİ] etiketiyle.
- `science.nasa.gov` sayfası: **okundu** (challenge tanımı, kısmi).
- `legacy.spaceappschallenge.org/resources/faq/`: **okundu**, 2022 — 2026'ya uygulanmaz.
- Depo kanıtı: §2'deki her madde dosya yoluyla. Ağırlık düzeyleri değerlendirmedir, ölçüm değildir.
- Çalıştırılmayanlar: `npm run smoke`, tarayıcı testleri, `preflight.mjs`, uygulama kodu değişikliği. Hiçbir uygulama, veri veya test dosyası değiştirilmedi.
