# Marswalk — Jüri ve sınır kartı

**Ne:** Jezero krateri üzerinde kullanıcı kontrollü, kısa bir keşif simülasyonu. Sol 120 / WB1 → Sol 164 / Roubion arasındaki ~687 m'lik bağlantıyı yürürsünüz.
**Ne değil:** Mars fizik motoru, canlı NASA telemetrisi, gerçek rover izi, güvenli rota sertifikası veya karar destek aracı.

Etiketler: **ÖLÇÜM** = depodaki veriden doğrudan okunmuş/ölçülmüş · **HESAP** = ölçümden türetilmiş · **SENARYO** = seçilmiş oyun/planlama parametresi · **SUNUM** = yalnızca görsel tercih, ölçülmüş değil.

DTM etiketleri: **[AKTİF]** = ekranda ve planda kullanılan USGS Mars 2020 TRN 1 m DTM · **[YEDEK]** = çevrimdışı fallback legacy PDS3 DTEEC DTM · **[TARİHSEL]** = etkinleştirme öncesindeki legacy UI kabul değeri. Eski kabul raporlarının etiketleri o tarihteki davranışı anlatır.

## 1. Sayılar ve durumları

| Değer | Etiket | Kaynak ve birim | Sınır |
|---|---|---|---|
| Yüzey yerçekimi 3,71 m/s² | ÖLÇÜM (literatür değeri) | NASA Planet Compare, küresel yuvarlatılmış değer (`SOURCES.md` #10) | Jezero yerel ölçümü değil. NSSDC Mars Fact Sheet 3,73 m/s² verir (`SOURCES.md` #11); fark yuvarlama/kaynak farkıdır, doğrulanmadı. |
| Zıplama yayı ~1,29 s sim-saniyesi, tepe ~0,78 m | HESAP | `2·v0/g`, `v0²/(2g)`, `v0 = 2,4 m/s` (oyun girdisi) | v0 oyun varsayımı; suit/insan performansı değildir. |
| Zıplama duvar saatinde ~0,6 s (uçuş zaman hızı 2×; 1,29 sim-s ÷ 2 ≈ 0,65 s; yumuşatma payı dahil ölçülen ~0,60 s) | HESAP / SUNUM | `config.js` (`airborneTimeScale`, `timeScaleSmoothingWallS`); `stage-airborne-timescale-note.md` | Fizik sim-saniyesinde aynı; yalnız sunum hızı değişir. 2×, kaynaksız sunum seçimidir. |
| İniş darbe sönümü 0,25 sim-s (uçuş zaman hızında ~0,13 s duvar); kamera dip ~0,055 m | SENARYO / SUNUM | `config.js` (`landingRecoveryDurationS`); ölçülen maks. kare farkı 0,0549 m (`stage-camera-motion-audit.md`) | Görsel yumuşatma. |
| Yürüme hızı 1,2 m/s × zaman hızlandırma 8 (uçuşta 2) | SENARYO | `config.js`; yürürken simülasyon saatinde 1,2 m/s, duvar saatinde ~9,6 m/s; havada duvar saatinde ~2,4 m/s | Gerçek astronot hızı iddiası değil; 687–730 m'lik rotayı 60–90 s'ye sığdırmak için. |
| Rota tahmini süresi = düz yol / 1,2 m/s (simülasyon saati); duvar saati = simülasyon saati / 8 | HESAP (senaryo hızı) | `config.js` `SCENARIO.walkSpeedMps` → `pathfinder.worker.js` → `route-service.js` `stats.durationAssumption`; arayüz `main.js` `renderRouteSummary` | Hız senaryo değeridir, eğim/giysi modellenmez. 0,8 m/s tutarsızlığı giderildi; bkz. §4 ve `stage-route-eta-note.md`. |
| **[AKTİF, UI] USGS Mars 2020 TRN 1 m:** 1676×1135 hücre, 1 m/px; 1 902 260 geçerli, 0 no-data | ÖLÇÜM | `data/dtm_subset.json` (`window`, `windowStats`), `stage35-scale-audit.md` | **Aktif DTM; gösterilen arazi budur (K3-7 / K5-7 kararı).** Mars eşpotansiyel yüzeyi (MOLA areoid / DeltaGeoid) datumu ve resmi PDS3 LBL kanıtıyla etkinleştirildi. Tüm analizler, 3D arazi mesh'i ve rota planlayıcı bu ızgarayla tam tutarlıdır. |
| **[YEDEK, fallback] Legacy PDS3 DTEEC DTM:** 1669×1129 hücre, ~1,0097 m/px; 1 884 301 geçerli, 0 no-data | ÖLÇÜM | `data/legacy-hirise/dtm_subset.json` (`label`, `windowStats`) | Çevrimdışı yedek sağlayıcı; ana USGS verisi bulunamazsa devreye girer. |
| [AKTİF] Pencerede kot aralığı 44,84 m; eğim P50/P90/maks 3,11°/7,54°/35,77° | HESAP | `stage35-scale-audit.md` (Horn 3×3, etkin USGS penceresi) | Yerel pencere istatistiği; küresel veya rota ölçüsü değil. |
| [AKTİF] Düz hat 687,3 m; eğim ort. 4,45°, P90 8,0°, maks 18,4° | ÖLÇÜM | `data/dtm_subset.json` `routeCheck` | Düz çizgi; A* rota değildir. |
| A* rotası. **Etkin USGS worker ölçümü:** 730,505 m (dengeli ve en kısa), 732,161 m (en düz); en dik eğim sırasıyla 9,81° / 10,64° / 9,27° | HESAP | `stage-perf-and-preference-review.md` (aynı USGS `dtm_subset` worker girdisi) | Worker ölçümü; güncel tarayıcı özeti ayrı kabul edilmedi. Maliyet tercihi güvenli rota iddiası değildir. |
| Yürünebilirlik puanı (100/100 vb.) | SENARYO | `route-compare.js`, `cost-model.js` | Planlama göstergesi; **güvenli rota sertifikası değildir**. |
| Maks. eğim eşiği 20° | SENARYO | `cost-model.js:39` — kaynak notu: "birincil belge doğrulanmadı" | Kaynaklı eşik değil. |
| En kısa / dengeli / en düz (`gentle`) ağırlıkları | SENARYO | `route-compare.js:33–45` (karşılaştırma ön ayarları) | Tasarım parametresi. |
| Ortomozaik hizası ±1,5 m belirsizlik | HESAP / belirsiz | `stage39-ortho-diagnosis.md` (ölçüm etkinleştirme öncesindeki USGS penceresinde) | Aynı veri penceresi artık etkindir; yine de yarım piksel hizası kanıtlanmadı, korelasyon tepesi r≈0,40 (zayıf). Hizalı olduğu iddia edilmez (K3-8). |
| Ortomozaik çözünürlüğü z17 0,318 m/px, z14 2,544 m/px | ÖLÇÜM (karo aritmetiği) | `data/ortho/*.json` | Nominal 25 cm karşılanmıyor. |
| Viking MDIM 2.1: 232 m/px, renkli küresel mozaik | ÖLÇÜM (ürün) | `data/viking-mdim/manifest.json`, `stage36-viking-audit.md` | İşlenmiş renk ürünü. Arazi rengi değil; **ortogörüntü ve kot değil**. Lisans: "belirtilmemiş". Ton (renk) ölçümü bu raporda yok; "renk doğruluğu" iddiası yapılmaz. |
| MOLA bölgesel kot: 384×384, ~463 m/px, −3777…+199 m | ÖLÇÜM | `data/regional-dem/mola-jezero.json`, `stage37-regional-dem-audit.md` | MOLA ufkunun datum durumu `needs_review`. Etkin USGS penceresinde MOLA−DTM ortalama +0,17 m, std 4,27 m (H1 planetosentrik varsayımı); ufuk rota kotuyla birleştirilmez. |
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
5. Sol 164'e varılınca varış rozeti belirir (README tarifi; bu belgenin kabulünde gözlenmedi). Doğrudan çizgi ~687 m, etkin USGS DTM ölçümüdür; A* worker ölçümleri tercihe göre ~730,5–732,2 m'dir. 1,2 m/s senaryo hızında bu, 8× yürüyüş saatiyle yaklaşık 76–77 sn duvar saatidir (HESAP; güncel tarayıcı kabulü değil). Arayüzdeki "Tahmini yürüme süresi" simülasyon saatidir.
6. Gösterilemiyorsa: `?view=3d` yerine varsayılan 2D görünüm açık kalır; WebGL2 yoksa 2D Canvas kesintisiz çalışır.

Kullanışlı parametreler: `?view=3d`, `?scale=1|2|3`, `?shadows=off|low|high`, `?horizon=off`.

## 3. Sınırlar (jüriye açıkça söylenecekler)

- **Gösterilen arazi resmî USGS TRN mozaiğidir:** Ekranda USGS Mars 2020 TRN 1 m DTM penceresi görünür (K3-7 / K5-7 aktif arazi kararı). Mars eşpotansiyel yüzeyi (MOLA areoid / DeltaGeoid) datumu kullanır; analizler, eğimler ve rota planlaması doğrudan bu arazi üzerinde çalışır.

- Yürünebilirlik puanı **planlama göstergesidir**; eşikler (20° vb.) senaryo parametresidir ve kaynaklı değildir.
- Rover izi **insan rotası değildir**; PLACES kullanılmadı. Rota iki tarihsel waypoint arasındaki düz bağlantıdan A* ile üretilir.
- Ortomozaik ↔ DTM hizası ±1,5 m belirsizliklidir; yarım piksel hizası ve kayaç düzeyinde eşleşme kanıtlanmadı. Ortomozaik lisansı kaynakta belirtilmemiş.
- Astronot, Apollo ve modern lunar-EVA referanslarından esinlenen sunum modelidir; Mars'a özel uçuşa hazır suit olarak sunulmaz. Loping/Froude animasyonu bir görsel benzetimdir: bacak boyu 0,9 m varsayımı, adım uzunluğu ve pozlar gerçek astronot ölçümü değildir. Bkz. [NASA Spacesuits](https://www.nasa.gov/humans-in-space/astronauts/spacesuits/) ve [NASA Z-2.5 suit description](https://ntrs.nasa.gov/api/citations/20190027581/downloads/20190027581.pdf).
- Viking renkleri işlenmiş küresel ürün (232 m/px); arazi renk doğruluğu iddiası yok.
- Ufuk MOLA bölgesel bağlamıdır (~463 m/px); datum doğrulanmadı.
- Atmosfer değerleri ortalama/mevsimsel; sürükleme kullanılmaz; suit/kütle parametresi yok.
- Lisanslar: `SOURCES.md` uyarınca 14 kaynaktan 12'sinde lisans **belirtilmemiş**. USGS 1 m DTM için kaynakta "CC0 1.0 Universal", Viking MDIM 2.1 için USGS metadata'sında "Public domain" ve "Use Constraints: None" yazılıdır.

## 4. Bilinen tutarsızlıklar (düzeltilmeden raporlandı)

- **Aktif DTM ile arazi/planlayıcı (ÇÖZÜLDÜ, K3-7/K5-7/K3-9):** Kullanıcı kararıyla USGS Mars 2020 TRN 1 m DTM aktiftir. `c6ab77d` arazi mesh'ini, DTM örneklemesini ve rota planlayıcıyı bu grid'e bağladı; legacy DTEEC yalnız fallback'tir. Bu, ortomozaik hizasını kanıtlamaz (K3-8); MOLA ufku da ayrı ve `needs_review` bölgesel katmandır.

- **Rota süresi (ÇÖZÜLDÜ, stage-route-eta):** Önceden süre 0,8 m/s ile hesaplanıp sabit metinle gösteriliyordu; simülasyon 1,2 m/s kullanıyordu (730 m: arayüz ~15 dk, simülasyon ~10 dk). Artık süre worker sınırında `config.js` `SCENARIO.walkSpeedMps` ile hesaplanır, `durationAssumption` kaynağını yazar ve arayüz "simülasyon saati" ile duvar saatini ayrı gösterir. Ayrıntı: `stage-route-eta-note.md`.
- **Rota uzunlukları:** `stage-perf-and-preference-review.md` içindeki 730,505 m / 732,161 m değerleri etkinleştirme öncesi USGS `dtm_subset` worker ölçümüdür; `c6ab77d` sonrası aynı USGS penceresi etkin yüzeydir. `stage-k3-10-integration-note.md` içindeki 729,66 / 730,50 m değerleri legacy DTM'in tarihsel grid düzenleme ölçümüdür, güncel aktif rota özeti değildir.
- **Göz yüksekliği:** kodda 1,48 m; `e9a0a78` commit mesajı 1,75 m diyor. Kod esas alınır.
- **Datum:** `c6ab77d` config ile etkin USGS DTM metadata'sını `verticalDatumVerified: true` ve PDS3 LBL kanıt URL'sinde eşitledi. Etiket MOLA areoid / DeltaGeoid referansını aktarır; bu, yüzey için arşiv datum bilgisidir.
- **`stage39-ortho-diagnosis.md`:** yazar ve 0,0 m tutarlılık açıklaması `9e13043` ile düzeltildi (K3-6 tamamlandı).

## 5. Olası jüri soruları ve dürüst yanıtlar

1. **Bu gerçek bir Mars yürüyüşü mü?** Hayır. Kullanıcı kontrollü bir keşif simülasyonudur; hız ve zaman ölçeği senaryo seçimidir.
2. **3,71 m/s² nereden?** NASA Planet Compare'ın yuvarlatılmış küresel değeri. Jezero'da ölçülmedi.
3. **Rota güvenli mi?** Hayır. Yürünebilirlik puanı planlama göstergesidir; eşikler senaryo parametresidir.
4. **Rota gerçek rover izi mi?** Hayır. İki tarihsel waypoint arasında A* ile üretilmiş bir bağlantıdır; PLACES verisi kullanılmadı.
5. **Atmosfer sürüklemesi var mı?** Hayır. Atmosfer değerleri ortalama/mevsimsel literatür değerleridir, Jezero anlık ölçümü değildir.
6. **Ortomozaik kot verisiyle hizalı mı?** DTM ile yaklaşık ±1,5 m fark ölçülmüştür; yarım piksel kayıt ve kayaç ayrıntısı hizası kanıtlanmamıştır. Güncel etkin DTM aynı USGS penceresidir, fakat WMTS katmanı kesin hizalı diye sunulmaz.
7. **Viking renkleri arazinin gerçek rengi mi?** Hayır. 232 m/px işlenmiş küresel renk ürünüdür; yükseklik ve ortogörüntü değildir.
8. **Ufuk gerçek kot mu?** Bölgesel bağlam (MOLA, ~463 m/px); datum `needs_review`, yürünebilirlik için kullanılmaz.
9. **Gerçek ölçek mi abartı mı?** Varsayılan 1× gerçek dikey ölçektir. 2× ve 3× görsel abartıdır ve rozetle belirtilir.
10. **Ayak izleri ve adım hızı ölçülmüş mü?** Hayır. Ayak izi görseldir; adım uzunluğu ve Froude modeli varsayımdır.
11. **Neden 8× hız?** Rotayı 60–90 saniyelik demoya sığdırmak için. Gerçek yürüyüş hızı iddiası değildir. (Rota süre tahmini de simülasyonla aynı 1,2 m/s senaryo hızını kullanır; duvar saati simülasyon saati / 8'dir.)
12. **Lisans sorunu var mı?** Kaynakta lisans bilgisi bulunmayan 12 kayıt "belirtilmemiş" olarak kalır. USGS Viking MDIM 2.1 ürün metadata'sı erişimi "Public domain", kullanım kısıtını "None" olarak verir.
13. **Bu kullanıcıya yön verir mi?** Hayır. Güvenlik veya karar desteği değildir.
14. **Hangi arazi verisini görüyoruz?** `c6ab77d` sonrası USGS Mars 2020 TRN 1 m DTM penceresi (1676×1135) aktiftir; config ve metadata'da PDS3 label'dan alınan Mars equipotential surface / MOLA areoid-DeltaGeoid referansı bulunur. Legacy PDS3 DTEEC (1669×1129) çevrimdışı fallback'tir. Tarihsel ekran görüntüleri eski aktif DTM davranışını gösterebilir.

## 6. Doğrulama durumu

- `node scripts/preflight.mjs`: HAZIR (hata 0, uyarı 0).
- `node --test test/`: 612/612, çıkış kodu 0 (bu belgeyi yazan oturumda, mevcut çalışma ağacında).
- Tarayıcı kabulü: `stage-final-acceptance.md` (PASS/FAIL/NOT-TESTED ve ekran görüntüleri).
- `npm run smoke`: bu belge yazılırken çalıştırılmadı (başka oturumun portlarıyla çakışmaması için).
- Aktif/aday DTM etiketleri: sayılar `data/dtm_subset.json`, `data/legacy-hirise/dtm_subset.json` ve ilgili `stage*` raporlarından yeniden okundu. Bu düzeltme turunda uygulama kodu çalıştırılmadı.
