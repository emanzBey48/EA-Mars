# Marswalk — Jüri ve sınır kartı

**Ne:** Jezero krateri üzerinde kullanıcı kontrollü, kısa bir keşif simülasyonu. Sol 120 / WB1 → Sol 164 / Roubion arasındaki ~687 m'lik bağlantıyı yürürsünüz.
**Ne değil:** Mars fizik motoru, canlı NASA telemetrisi, gerçek rover izi, güvenli rota sertifikası veya karar destek aracı.

Etiketler: **ÖLÇÜM** = depodaki veriden doğrudan okunmuş/ölçülmüş · **HESAP** = ölçümden türetilmiş · **SENARYO** = seçilmiş oyun/planlama parametresi · **SUNUM** = yalnızca görsel tercih, ölçülmüş değil.

## 1. Sayılar ve durumları

| Değer | Etiket | Kaynak ve birim | Sınır |
|---|---|---|---|
| Yüzey yerçekimi 3,71 m/s² | ÖLÇÜM (literatür değeri) | NASA Planet Compare, küresel yuvarlatılmış değer (`SOURCES.md` #10) | Jezero yerel ölçümü değil. NSSDC Mars Fact Sheet 3,73 m/s² verir (`SOURCES.md` #11); fark yuvarlama/kaynak farkıdır, doğrulanmadı. |
| Zıplama yayı ~1,29 s, tepe ~0,78 m | HESAP | `2·v0/g`, `v0²/(2g)`, `v0 = 2,4 m/s` (oyun girdisi) | v0 oyun varsayımı; suit/insan performansı değildir. |
| İniş darbe sönümü 0,25 s; kamera dip ~0,055 m | SENARYO / SUNUM | `config.js` (`landingRecoveryDurationS`); ölçülen maks. kare farkı 0,0549 m (`stage-camera-motion-audit.md`) | Görsel yumuşatma. |
| Yürüme hızı 1,2 m/s × zaman hızlandırma 8 | SENARYO | `config.js`; simülasyon saatinde 1,2 m/s, duvar saatinde ~9,6 m/s | Gerçek astronot hızı iddiası değil; 687–730 m'lik rotayı 60–90 s'ye sığdırmak için. |
| Rota tahmini süresi 0,8 m/s | SENARYO (çelişki) | `route-service.js:301` (0,8 m/s) ve `main.js:348` (sabit metin) | Simülasyonun 1,2 m/s'siyle **tutarsız**; bkz. §4. |
| DTM penceresi 1676×1135 hücre, 1 m; 1 902 260 geçerli, 0 no-data | ÖLÇÜM | `data/dtm_subset.json`, `stage35-scale-audit.md` | Yalnızca yüklenen pencere; kaynak mozaik 21488×21400. |
| Pencerede kot aralığı 44,84 m; eğim P50/P90/maks 3,11°/7,54°/35,77° | HESAP | `stage35-scale-audit.md` (Horn 3×3) | Pencere istatistiği; küresel veya rota ölçüsü değil. |
| Düz hat 687,3 m; eğim ort. 4,45°, P90 8,0°, maks 18,4° | ÖLÇÜM | `data/dtm_subset.json` `routeCheck`, `README.md` | Düz çizgi; rota değil. |
| A* rotası ~730 m (en kısa) / ~731–732 m (en düz) | HESAP | `stage34b`/devir notu ve UI özeti (bkz. §4) | Planlama göstergesi. |
| Yürünebilirlik puanı (100/100 vb.) | SENARYO | `route-compare.js`, `cost-model.js` | Planlama göstergesi; **güvenli rota sertifikası değildir**. |
| Maks. eğim eşiği 20° | SENARYO | `cost-model.js:39` — kaynak notu: "birincil belge doğrulanmadı" | Kaynaklı eşik değil. |
| En kısa / dengeli / en düz (`gentle`) ağırlıkları | SENARYO | `route-compare.js:33–45` (karşılaştırma ön ayarları) | Tasarım parametresi. |
| Ortomozaik hizası ±1,5 m belirsizlik | HESAP / belirsiz | `stage39-ortho-diagnosis.md` | Yarım piksel hizası **kanıtlanmadı**; yüksek geçiren filtre sonrası korelasyon tepesi r≈0,40 (zayıf). `stage21b` hizayı "kanıtlanmadı" olarak raporlar. |
| Ortomozaik çözünürlüğü z17 0,318 m/px, z14 2,544 m/px | ÖLÇÜM (karo aritmetiği) | `data/ortho/*.json` | Nominal 25 cm karşılanmıyor. |
| Viking MDIM 2.1: 232 m/px, renkli küresel mozaik | ÖLÇÜM (ürün) | `data/viking-mdim/manifest.json`, `stage36-viking-audit.md` | İşlenmiş renk ürünü. Arazi rengi değil; **ortogörüntü ve kot değil**. Lisans: "belirtilmemiş". Ton (renk) ölçümü bu raporda yok; "renk doğruluğu" iddiası yapılmaz. |
| MOLA bölgesel kot: 384×384, ~463 m/px, −3777…+199 m | ÖLÇÜM | `data/regional-dem/mola-jezero.json`, `stage37-regional-dem-audit.md` | Datum **`needs_review`**. Yerel DTM ile karşılaştırma ortalama +0,17 m, std 4,27 m (H1 planetosentrik varsayımı). Ufuk, rota yüksekliğiyle birleştirilmez. |
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
5. Sol 164'e varılınca varış rozeti belirir (README tarifi; bu belgenin kabulünde gözlenmedi). Hedef ~687 m doğrudan, ~730 m A* rotasıyla; yürüme süresi (1,2 m/s × 8 ≈ 9,6 m/s duvar saati) yaklaşık 60–90 sn'dir (HESAP).
6. Gösterilemiyorsa: `?view=3d` yerine varsayılan 2D görünüm açık kalır; WebGL2 yoksa 2D Canvas kesintisiz çalışır.

Kullanışlı parametreler: `?view=3d`, `?scale=1|2|3`, `?shadows=off|low|high`, `?horizon=off`.

## 3. Sınırlar (jüriye açıkça söylenecekler)

- Yürünebilirlik puanı **planlama göstergesidir**; eşikler (20° vb.) senaryo parametresidir ve kaynaklı değildir.
- Rover izi **insan rotası değildir**; PLACES kullanılmadı. Rota iki tarihsel waypoint arasındaki düz bağlantıdan A* ile üretilir.
- Ortomozaik hizası ±1,5 m belirsizlikle gösterilir; yarım piksel hizası kanıtlanmadı. Ortomozaik lisansı kaynakta belirtilmemiş.
- Viking renkleri işlenmiş küresel ürün (232 m/px); arazi renk doğruluğu iddiası yok.
- Ufuk MOLA bölgesel bağlamıdır (~463 m/px); datum doğrulanmadı.
- Atmosfer değerleri ortalama/mevsimsel; sürükleme kullanılmaz; suit/kütle parametresi yok.
- Lisanslar: `SOURCES.md` uyarınca 14 kaynaktan 13'ünde lisans **belirtilmemiş**; yalnız USGS 1 m DTM "CC0 1.0" olarak yazılıdır. Kullanım öncesi lisans teyidi gerekir (K1-4 Viking).

## 4. Bilinen tutarsızlıklar (düzeltilmeden raporlandı)

- **Rota süresi 0,8 m/s, simülasyon 1,2 m/s:** `route-service.js:301` ve `main.js:348` (sabit metin) ile `config.js:5` çelişir.
- **Rota uzunlukları:** UI'de en kısa 730 m / en düz 731 m; devir notunda 730,505 m / 732,161 m. Aynı uçlar ve yuvarlama doğrulanmadı.
- **Göz yüksekliği:** kodda 1,48 m; `e9a0a78` commit mesajı 1,75 m diyor. Kod esas alınır.
- **Datum:** `config.js:56` `verticalDatumVerified: true`; `data/dtm_subset.json` `verticalDatumVerified: false`. Kanıt yoksa `false` olmalıdır (K3-5, açık).
- **`stage39-ortho-diagnosis.md`** "Yazar: Efe" diyor; devir notu bu raporun Efe'ye ait olmadığını yazıyor (K3-6, açık).

## 5. Olası jüri soruları ve dürüst yanıtlar

1. **Bu gerçek bir Mars yürüyüşü mü?** Hayır. Kullanıcı kontrollü bir keşif simülasyonudur; hız ve zaman ölçeği senaryo seçimidir.
2. **3,71 m/s² nereden?** NASA Planet Compare'ın yuvarlatılmış küresel değeri. Jezero'da ölçülmedi.
3. **Rota güvenli mi?** Hayır. Yürünebilirlik puanı planlama göstergesidir; eşikler senaryo parametresidir.
4. **Rota gerçek rover izi mi?** Hayır. İki tarihsel waypoint arasında A* ile üretilmiş bir bağlantıdır; PLACES verisi kullanılmadı.
5. **Atmosfer sürüklemesi var mı?** Hayır. Atmosfer değerleri ortalama/mevsimsel literatür değerleridir, Jezero anlık ölçümü değildir.
6. **Ortomozaik kot verisiyle hizalı mı?** ±1,5 m belirsizlikle; yarım piksel hizası kanıtlanmadı. Bu bir kanıtlı hizalama değildir.
7. **Viking renkleri arazinin gerçek rengi mi?** Hayır. 232 m/px işlenmiş küresel renk ürünüdür; yükseklik ve ortogörüntü değildir.
8. **Ufuk gerçek kot mu?** Bölgesel bağlam (MOLA, ~463 m/px); datum `needs_review`, yürünebilirlik için kullanılmaz.
9. **Gerçek ölçek mi abartı mı?** Varsayılan 1× gerçek dikey ölçektir. 2× ve 3× görsel abartıdır ve rozetle belirtilir.
10. **Ayak izleri ve adım hızı ölçülmüş mü?** Hayır. Ayak izi görseldir; adım uzunluğu ve Froude modeli varsayımdır.
11. **Neden 8× hız?** Rotayı 60–90 saniyelik demoya sığdırmak için. Gerçek yürüyüş hızı iddiası değildir. (Rota süre tahmini 0,8 m/s kullanır; bu tutarsızlık §4'te açıktır.)
12. **Lisans sorunu var mı?** Evet: 13 kaynakta lisans kaynakta belirtilmemiştir. Teslim öncesi teyit gerekir; uydurulmuş lisans yoktur.
13. **Bu kullanıcıya yön verir mi?** Hayır. Güvenlik veya karar desteği değildir.

## 6. Doğrulama durumu

- `node scripts/preflight.mjs`: HAZIR (hata 0, uyarı 0).
- `node --test test/`: 574/574, çıkış kodu 0 (bu belgeyi yazan oturumda, mevcut çalışma ağacında).
- Tarayıcı kabulü: `stage-final-acceptance.md` (PASS/FAIL/NOT-TESTED ve ekran görüntüleri).
- `npm run smoke`: bu belge yazılırken çalıştırılmadı (başka oturumun portlarıyla çakışmaması için).
