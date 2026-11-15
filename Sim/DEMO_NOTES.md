# Marswalk — Jüri ve sınır kartı

**Ne:** Jezero krateri üzerinde kullanıcı kontrollü, kısa bir keşif simülasyonu. Sol 120 / WB1 → Sol 164 / Roubion arasındaki ~687 m'lik bağlantıyı yürürsünüz.
**Ne değil:** Mars fizik motoru, canlı NASA telemetrisi, gerçek rover izi, güvenli rota sertifikası veya karar destek aracı.

Etiketler: **ÖLÇÜM** = depodaki veriden doğrudan okunmuş/ölçülmüş · **HESAP** = ölçümden türetilmiş · **SENARYO** = seçilmiş oyun/planlama parametresi · **SUNUM** = yalnızca görsel tercih, ölçülmüş değil.

DTM etiketleri: **[AKTİF]** = ekranda gösterilen arazi (legacy PDS3 DTEEC yedeği) · **[ADAY]** = analizlerde ölçülen USGS 1 m penceresi (UI'de kullanılmıyor). Her DTM kaynaklı sayı bu etiketlerden biriyle işaretlidir.

## 1. Sayılar ve durumları

| Değer | Etiket | Kaynak ve birim | Sınır |
|---|---|---|---|
| Yüzey yerçekimi 3,71 m/s² | ÖLÇÜM (literatür değeri) | NASA Planet Compare, küresel yuvarlatılmış değer (`SOURCES.md` #10) | Jezero yerel ölçümü değil. NSSDC Mars Fact Sheet 3,73 m/s² verir (`SOURCES.md` #11); fark yuvarlama/kaynak farkıdır, doğrulanmadı. |
| Zıplama yayı ~1,29 s sim-saniyesi, tepe ~0,78 m | HESAP | `2·v0/g`, `v0²/(2g)`, `v0 = 2,4 m/s` (oyun girdisi) | v0 oyun varsayımı; suit/insan performansı değildir. |
| Zıplama duvar saatinde ~0,6 s (uçuş zaman hızı 2×; 1,29 sim-s ÷ 2 ≈ 0,65 s; yumuşatma payı dahil ölçülen ~0,60 s) | HESAP / SUNUM | `config.js` (`airborneTimeScale`, `timeScaleSmoothingWallS`); `stage-airborne-timescale-note.md` | Fizik sim-saniyesinde aynı; yalnız sunum hızı değişir. 2×, kaynaksız sunum seçimidir. |
| İniş darbe sönümü 0,25 sim-s (uçuş zaman hızında ~0,13 s duvar); kamera dip ~0,055 m | SENARYO / SUNUM | `config.js` (`landingRecoveryDurationS`); ölçülen maks. kare farkı 0,0549 m (`stage-camera-motion-audit.md`) | Görsel yumuşatma. |
| Yürüme hızı 1,2 m/s × zaman hızlandırma 8 (uçuşta 2) | SENARYO | `config.js`; yürürken simülasyon saatinde 1,2 m/s, duvar saatinde ~9,6 m/s; havada duvar saatinde ~2,4 m/s | Gerçek astronot hızı iddiası değil; 687–730 m'lik rotayı 60–90 s'ye sığdırmak için. |
| Rota tahmini süresi = düz yol / 1,2 m/s (simülasyon saati); duvar saati = simülasyon saati / 8 | HESAP (senaryo hızı) | `config.js` `SCENARIO.walkSpeedMps` → `pathfinder.worker.js` → `route-service.js` `stats.durationAssumption`; arayüz `main.js` `renderRouteSummary` | Hız senaryo değeridir, eğim/giysi modellenmez. 0,8 m/s tutarsızlığı giderildi; bkz. §4 ve `stage-route-eta-note.md`. |
| **[AKTİF, UI] Legacy PDS3 DTEEC DTM:** 1669×1129 hücre, ~1,0097 m/px; 1 884 301 geçerli, 0 no-data | ÖLÇÜM | `data/legacy-hirise/dtm_subset.json` (`label`, `windowStats`) | **Yedek (fallback); gösterilen arazi budur.** USGS adayı reddedilip bu etkinleştiriliyor (`surface/registry.js` `resolveActiveProvider`, neden `needs_review_verticalReference`). Karar bekliyor (K3-7). |
| **[AKTİF, UI] Planlayıcı ve minimap ızgarası (K3-10):** 1670×1170 hücre düzenli yerel ızgara, 1,00966 m; 1 952 230 geçerli, 1 670 no-data (kenar) (`nearest`) | ÖLÇÜM (tarayıcı, `routeGrid`) | `route/legacy-grid-plan.js`, `stage-k3-10-integration-note.md` | Legacy köprü DTM'i bir kez düzenli ızgaraya yeniden örneklenir; planlayıcı, minimap ve ısı haritası bu ızgarayı kullanır. Hücre merkezi kotu 3D/sim örnekleyicisiyle birebir aynı. Yükleme: ~100 ms (tarayıcı). |
| **[ADAY, analiz] USGS Mars 2020 TRN 1 m:** 1676×1135 hücre, 1 m/px; 1 902 260 geçerli, 0 no-data | ÖLÇÜM | `data/dtm_subset.json` (`window`, `windowStats`), `stage35-scale-audit.md` | **UI'de kullanılmıyor** (`needs_review`, düşey datum kanıtı yok). Kabartma, rota doğrulama ve ortomozaik ölçümleri bu pencerede yapıldı. Kaynak mozaik 21488×21400. |
| [ADAY] Pencerede kot aralığı 44,84 m; eğim P50/P90/maks 3,11°/7,54°/35,77° | HESAP | `stage35-scale-audit.md` (Horn 3×3, USGS adayı penceresi) | Aday pencere istatistiği; küresel veya rota ölçüsü değil. Aktif legacy penceresinde eğim dağılımı **ölçülmedi** (kot aralığı, `windowStats`: −2592,83…−2546,74 m = 46,09 m). |
| [ADAY] Düz hat 687,3 m; eğim ort. 4,45°, P90 8,0°, maks 18,4° | ÖLÇÜM | `data/dtm_subset.json` `routeCheck` (aktif legacy dosyasının `routeCheck`i: 686,2 m; ort. 4,69°, P90 8,36°, maks 18,90°) | Düz çizgi; rota değil. |
| A* rotası. **UI özeti [AKTİF legacy, K3-10 sonrası düzenli ızgara]:** 730 m (en kısa, dengeli, en düz); en dik eğim 11,7° / 9,8° / 9,5°. (K3-10 öncesi: 730 / 730 / 731 m, 14,1° / 9,8° / 10,1°.) **Worker ölçümü [ADAY USGS]:** 730,505 m (dengeli, en kısa), 732,161 m (en düz) | HESAP | UI: `stage-final-acceptance.md` (R1); USGS: `stage-perf-and-preference-review.md` (worker), `stage23-route-validation.md` | Aynı uç noktalar iki DTM'de farklı maks. eğim veriyor (bkz. §4). Planlama göstergesi. |
| Yürünebilirlik puanı (100/100 vb.) | SENARYO | `route-compare.js`, `cost-model.js` | Planlama göstergesi; **güvenli rota sertifikası değildir**. |
| Maks. eğim eşiği 20° | SENARYO | `cost-model.js:39` — kaynak notu: "birincil belge doğrulanmadı" | Kaynaklı eşik değil. |
| En kısa / dengeli / en düz (`gentle`) ağırlıkları | SENARYO | `route-compare.js:33–45` (karşılaştırma ön ayarları) | Tasarım parametresi. |
| Ortomozaik hizası ±1,5 m belirsizlik | HESAP / belirsiz | `stage39-ortho-diagnosis.md` (ölçüm **USGS adayı** penceresinde) | **Aktif legacy DTM ile hizası ölçülmedi** (K3-8). Yarım piksel hizası **kanıtlanmadı**; yüksek geçiren filtre sonrası korelasyon tepesi r≈0,40 (zayıf). `stage21b` hizayı "kanıtlanmadı" olarak raporlar. |
| Ortomozaik çözünürlüğü z17 0,318 m/px, z14 2,544 m/px | ÖLÇÜM (karo aritmetiği) | `data/ortho/*.json` | Nominal 25 cm karşılanmıyor. |
| Viking MDIM 2.1: 232 m/px, renkli küresel mozaik | ÖLÇÜM (ürün) | `data/viking-mdim/manifest.json`, `stage36-viking-audit.md` | İşlenmiş renk ürünü. Arazi rengi değil; **ortogörüntü ve kot değil**. Lisans: "belirtilmemiş". Ton (renk) ölçümü bu raporda yok; "renk doğruluğu" iddiası yapılmaz. |
| MOLA bölgesel kot: 384×384, ~463 m/px, −3777…+199 m | ÖLÇÜM | `data/regional-dem/mola-jezero.json`, `stage37-regional-dem-audit.md` | Datum **`needs_review`**. [ADAY USGS] pencerede MOLA−DTM ortalama +0,17 m, std 4,27 m (H1 planetosentrik varsayımı; aktif legacy ile ölçülmedi). Ufuk, rota yüksekliğiyle birleştirilmez. |
| Güneş görünür çapı 1919″ (1 AU) | ÖLÇÜM (literatür) | NSSDC Sun Fact Sheet (`SOURCES.md` #12) | Mars mesafesiyle ölçeklenir; gökyüzü renkleri sunumdur. |
| Yerel güneş saati 15:00, L_s 0° | SENARYO | Mars24 algoritması (`SOURCES.md` #14) | Senaryo parametresi; Jezero anlık ölçümü değil. |
| Ortalama basınç 6,36 mbar (mevsimsel 4,0–8,7) | ÖLÇÜM (ortalama/mevsimsel) | NSSDC Mars Fact Sheet (`SOURCES.md` #11) | **Jezero anlık değeri değil.** Hareket fiziğine atmosfer sürüklemesi **eklenmedi**. |
| Gölge haritası çözünürlüğü 2048 px (varsayılan), 1024, kapalı | SUNUM | `shadow-map.js` | Görsel kalite ayarı. |
| 1× dikey ölçek (varsayılan); 2× ve 3× "görsel abartı" | SUNUM | `index.html:101–103`, `hud.js` | 3× abartı gerçek arazi değildir. |
| Mikro yüzey detayı, gökyüzü modeli, ton eşleme, gölge, ayak izi, parlak rota şeridi, kamera salınımı, giysi malzemesi | SUNUM | ilgili `stage*-audit.md` | Ölçülmüş fiziksel değer yok. |
| Ayak izi (regolit) | SUNUM | `footprint-trail.js` | Regolit mekaniği iddiası **yok**. |
| Yürüme adım uzunluğu 6 m; Froude modeli L = 0,9 m | SENARYO / SUNUM | `stage-visual-b-astronaut-audit.md` §7 ("kaynak doğrulanmadı") | İnsan adım/bacak ölçümü değildir. |
| Göz yüksekliği 1,48 m | SUNUM | `view/3d/camera.js:9` | Suit/insan ölçümü değil (bkz. §4). |

## 2. Demo akışı (60–90 sn)

1. `npm start` → `http://127.0.0.1:8080/?demo=1` — sunum modu açılır.
2. "Örnek Görevi Başlat (Sol 120 → Sol 164)" — A* rotası hesaplanır. Hesaplama süresi ölçülmedi.
3. 3D birinci şahıs: **W/A/S/D** yürür, turkuaz şerit rotayı gösterir, **Space** küçük bir senaryo sıçraması yapar, **P** duraklatır, **Esc** fare kilidini bırakır. Ufuk, gölge ve ortomozaik kaplama aynı sahnededir.
4. Sağ panel (sunum modu kapalıyken): rota tercihi (dengeli / en kısa / en düz) değişince özet yeniden hesaplanır; minimap "Mars globali göster" ile Viking bağlamına, "Kapsama sığdır" ile Jezero'ya döner.
5. Sol 164'e varılınca varış rozeti belirir (README tarifi; bu belgenin kabulünde gözlenmedi). Doğrudan çizgi ~687 m (USGS adayı ölçümü), A* rotası ~730 m (UI özeti, aktif legacy DTM); yürüme süresi (1,2 m/s × 8 ≈ 9,6 m/s duvar saati) yaklaşık 60–90 sn'dir (HESAP). Arayüzdeki "Tahmini yürüme süresi" simülasyon saatidir (730 m ≈ 10 dk 8 sn); duvar saati satırı ayrıca ≈ 1 dk 16 sn gösterir.
6. Gösterilemiyorsa: `?view=3d` yerine varsayılan 2D görünüm açık kalır; WebGL2 yoksa 2D Canvas kesintisiz çalışır.

Kullanışlı parametreler: `?view=3d`, `?scale=1|2|3`, `?shadows=off|low|high`, `?horizon=off`, `?intro=0` (küre girişi kapalı), `?showreel=1` (küre ekranında otomatik gösteri), `?quality=auto|high|medium|low|minimal`.
Kısayollar: W/A/S/D (hareket), Space (3D'de sıçrama; 2D'de duraklat), P (duraklat), Esc (fare kilidi / kapat / haritayı küçült), M (haritayı %75 büyüt/küçült), R (yeniden başlat; küre ekranında gösteri).

### 2b. Küre girişli akış (parametresiz açılış)

`http://127.0.0.1:8080/` (veya `?showreel=1`) önce Mars küresini açar: Viking MDIM 2.1 dokusu, 5 sn/tur otomatik dönüş, hover'da bölge adı, herhangi bir noktadan başlangıç/varış seçimi, sağ görev paneli. **SİMÜLE ET** kask modunu açar; holografik minimap `M` ile %75'e büyür; görüş modları Normal / Optik / Topo / Termal / Atmosfer / Radyasyon; otomatik sürüş 0,5–10× (rota çizgisine ≤ 20 m ise katılır, aksi halde yeniden planlanır); 2 ve üzeri kişide yoldaşlar yalnız 2B minimap'te. `R` küre ekranında gösteriyi başlatır/durdurur. `?intro=0` bu akışı tamamen kapatır; `?view=3d`, `?demo=1` küreyi atlar.

| Değer / öğe | Etiket | Sınır |
|---|---|---|
| Küre dokusu (Viking MDIM 2.1, 232 m/px) | ÖLÇÜM (ürün) / SUNUM | Renk bağlamı; ortogörüntü ve kot değil. Küre konumları ve bölge yarıçapları yaklaşıktır. |
| Başlangıç/varış seçimi | SENARYO | Küre seçimi bağlam/etikettir. **Simülasyon sahası yalnız Jezero HiRISE yamasıdır;** yama dışı veya isimli bölge seçimi varsayılan Sol 120 → Sol 164'e döner ve bilgi satırı gösterilir. |
| Bölge türü başına tahmini süre (20 + 40 × ağırlık dk) | SENARYO | Kaynaklı değil; güvenlik skoru değil. |
| Görüş modları Optik, Topo | HESAP (gerçek DTM) | Optik = DTM hillshade, ortogörüntü değil. Topo = DTM kot konturu. |
| Görüş modları Termal, Atmosfer, Radyasyon | SENARYO (model) | Göreli göstergeler; ölçüm değil (Termal: güneş 35°/13:00 varsayımı; Atmosfer: ölçek yüksekliği 11 km; Radyasyon: MSL RAD ölçümü değil). Jeofizik ve Kimyasal modlar veri olmadığı için listelenmez. |
| Otomatik sürüş hız çarpanı 0,5–10×, 20 m katılma eşiği | SENARYO / SUNUM | Zaman ayarıdır; fizik veya güvenlik iddiası değil. |
| Ekip yoldaşları (2–4 kişi) | SENARYO | Yalnız 2B; yoldaşlar senaryo hızıyla aynı rotada ilerler, gerçek ekip modeli değildir. |
| Biyom çipi | HESAP (USGS SIM 3464 birim adından sezgisel eşleme) | ~100–200 m konum belirsizliği; mineraloji/geçilebilirlik iddiası yok; birim yoksa çip yok. |
| Kask uyarısı (istenen süre aşıldı) | SENARYO | "Planlama göstergesi"; güvenli rota iddiası değil. Kaskta O₂/giysi sıcaklığı gösterilmez. |

Atıf: küre dokusu USGS Astrogeology Viking MDIM 2.1; NASA/JPL-Caltech Mars 2020 ham görüntüleri yalnız görsel referanstır, uygulama dokuları prosedüreldir.

## 3. Sınırlar (jüriye açıkça söylenecekler)

- **Gösterilen arazi yedek veridir:** Ekranda legacy PDS3 DTEEC DTM görünür. Daha yeni USGS 1 m penceresi düşey datum kanıtı olmadığı için etkinleştirilmedi ve analizlerde kullanıldı. Hangisinin kalacağı açık bir ürün kararıdır (K3-7).

- Yürünebilirlik puanı **planlama göstergesidir**; eşikler (20° vb.) senaryo parametresidir ve kaynaklı değildir.
- Rover izi **insan rotası değildir**; PLACES kullanılmadı. Rota iki tarihsel waypoint arasındaki düz bağlantıdan A* ile üretilir.
- Ortomozaik hizası ±1,5 m belirsizlikle gösterilir; yarım piksel hizası kanıtlanmadı. Ortomozaik lisansı kaynakta belirtilmemiş.
- Viking renkleri işlenmiş küresel ürün (232 m/px); arazi renk doğruluğu iddiası yok.
- Ufuk MOLA bölgesel bağlamıdır (~463 m/px); datum doğrulanmadı.
- Atmosfer değerleri ortalama/mevsimsel; sürükleme kullanılmaz; suit/kütle parametresi yok.
- Lisanslar: `SOURCES.md` uyarınca 14 kaynaktan 13'ünde lisans **belirtilmemiş**; yalnız USGS 1 m DTM "CC0 1.0" olarak yazılıdır. Kullanım öncesi lisans teyidi gerekir (K1-4 Viking).

## 4. Bilinen tutarsızlıklar (düzeltilmeden raporlandı)

- **Aktif DTM ile analiz DTM'i farklı (karar bekliyor, K3-7 / K3-9):** UI aktif legacy DTM'i gösterir; kabartma (35A), rota doğrulama (23C), tercih tablosu, ortomozaik hizası (39A/21B) ve MOLA karşılaştırması (37A) USGS 1 m adayında yapıldı. Aynı uç noktalarda sonuçlar farklı: en kısa rotanın maks. eğimi UI'de 11,7° (K3-10 öncesi 14,1°), USGS adayında 10,64°; en düz UI'de 9,5° (öncesi 10,1°), USGS adayında 9,27°; dengeli ise iki DTM'de yakın (UI 9,8°, USGS 9,81°). Analizler legacy üzerinde yeniden koşulmadı.

- **Rota süresi (ÇÖZÜLDÜ, stage-route-eta):** Önceden süre 0,8 m/s ile hesaplanıp sabit metinle gösteriliyordu; simülasyon 1,2 m/s kullanıyordu (730 m: arayüz ~15 dk, simülasyon ~10 dk). Artık süre worker sınırında `config.js` `SCENARIO.walkSpeedMps` ile hesaplanır, `durationAssumption` kaynağını yazar ve arayüz "simülasyon saati" ile duvar saatini ayrı gösterir. Ayrıntı: `stage-route-eta-note.md`.
- **Rota uzunlukları (açıklandı, yuvarlama değil):** Arayüz tek kuralla tamsayı metre gösterir (`toFixed(0)`). UI'deki 730 m (üç tercih) aktif legacy DTM'den gelir; düzenli planlama ızgarasında en kısa 729,66 m, en düz 730,50 m (K3-10 öncesi eski çerçevede 731,09 m; bkz. `stage-k3-10-integration-note.md`). Devir notundaki 730,505 m ve 732,161 m USGS adayı penceresinden gelir; fark DTM kaynaklıdır, biçimlendirmeden değil.
- **Göz yüksekliği:** kodda 1,48 m; `e9a0a78` commit mesajı 1,75 m diyor. Kod esas alınır.
- **Datum:** `config.js:56` `verticalDatumVerified: true`; `data/dtm_subset.json` `verticalDatumVerified: false`. Kanıt yoksa `false` olmalıdır (K3-5, açık). Aktif legacy etiketinin datum ifadesi (`label.note`: "Mars 2000 Datum") 38A denetiminde incelenmedi.
- **`stage39-ortho-diagnosis.md`** "Yazar: Efe" diyor; devir notu bu raporun Efe'ye ait olmadığını yazıyor (K3-6, açık).

## 5. Olası jüri soruları ve dürüst yanıtlar

1. **Bu gerçek bir Mars yürüyüşü mü?** Hayır. Kullanıcı kontrollü bir keşif simülasyonudur; hız ve zaman ölçeği senaryo seçimidir.
2. **3,71 m/s² nereden?** NASA Planet Compare'ın yuvarlatılmış küresel değeri. Jezero'da ölçülmedi.
3. **Rota güvenli mi?** Hayır. Yürünebilirlik puanı planlama göstergesidir; eşikler senaryo parametresidir.
4. **Rota gerçek rover izi mi?** Hayır. İki tarihsel waypoint arasında A* ile üretilmiş bir bağlantıdır; PLACES verisi kullanılmadı.
5. **Atmosfer sürüklemesi var mı?** Hayır. Atmosfer değerleri ortalama/mevsimsel literatür değerleridir, Jezero anlık ölçümü değildir.
6. **Ortomozaik kot verisiyle hizalı mı?** ±1,5 m belirsizlik, USGS adayı penceresinde ölçüldü; ekrandaki aktif legacy DTM ile hizası ölçülmedi. Yarım piksel hizası kanıtlanmadı. Bu bir kanıtlı hizalama değildir.
7. **Viking renkleri arazinin gerçek rengi mi?** Hayır. 232 m/px işlenmiş küresel renk ürünüdür; yükseklik ve ortogörüntü değildir.
8. **Ufuk gerçek kot mu?** Bölgesel bağlam (MOLA, ~463 m/px); datum `needs_review`, yürünebilirlik için kullanılmaz.
9. **Gerçek ölçek mi abartı mı?** Varsayılan 1× gerçek dikey ölçektir. 2× ve 3× görsel abartıdır ve rozetle belirtilir.
10. **Ayak izleri ve adım hızı ölçülmüş mü?** Hayır. Ayak izi görseldir; adım uzunluğu ve Froude modeli varsayımdır.
11. **Neden 8× hız?** Rotayı 60–90 saniyelik demoya sığdırmak için. Gerçek yürüyüş hızı iddiası değildir. (Rota süre tahmini de simülasyonla aynı 1,2 m/s senaryo hızını kullanır; duvar saati simülasyon saati / 8'dir.)
12. **Lisans sorunu var mı?** Evet: 13 kaynakta lisans kaynakta belirtilmemiştir. Teslim öncesi teyit gerekir; uydurulmuş lisans yoktur.
13. **Bu kullanıcıya yön verir mi?** Hayır. Güvenlik veya karar desteği değildir.
14. **Hangi arazi verisini görüyoruz?** Ekranda PDS3 DTEEC (legacy) yedek DTM görünür: 1669×1129 hücre, ~1,01 m/px. Daha yeni USGS Mars 2020 TRN 1 m penceresi (1676×1135) düşey datum kanıtı olmadığı için etkinleştirilmedi (`needs_review`); analizlerin çoğu o pencerede yapıldı. Bu yüzden sayılar [AKTİF] veya [ADAY] olarak etiketli; hangi verinin kalacağı bir ürün kararıdır (K3-7).

## 6. Doğrulama durumu

- `node scripts/preflight.mjs`: HAZIR (hata 0, uyarı 0).
- `node --test test/`: 612/612, çıkış kodu 0 (bu belgeyi yazan oturumda, mevcut çalışma ağacında).
- Tarayıcı kabulü: `stage-final-acceptance.md` (PASS/FAIL/NOT-TESTED ve ekran görüntüleri).
- `npm run smoke`: bu belge yazılırken çalıştırılmadı (başka oturumun portlarıyla çakışmaması için).
- Aktif/aday DTM etiketleri: sayılar `data/dtm_subset.json`, `data/legacy-hirise/dtm_subset.json` ve ilgili `stage*` raporlarından yeniden okundu. Bu düzeltme turunda uygulama kodu çalıştırılmadı.
