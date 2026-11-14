# Stage 34B Kabul Raporu: Minimap Rota Tercihleri, Sürüklenebilir Uç Noktalar ve Zenginleştirilmiş Rota Özeti

**Aşama:** Stage 34B (FAZ 4)  
**Tarih:** 15 Kasım 2026  
**Geliştirici Sorumlusu:** Alparslan (Entegrasyon & Görsel Katman)  
**Durum:** TAMAMLANDI (Alparslan)  
**İlgili Yol Haritası:** `yapay zeka icin/road map.md` (Stage 34B)  

---

## 1. Amaç ve Kapsam

Stage 34B geliştirmesi, kullanıcının 2D Jezero DTM minimap'i üzerinde planlanan EVA yürüyüş rotalarıyla doğrudan ve akıcı bir şekilde etkileşime geçebilmesini sağlar. Bu kapsamda:
1. Başlangıç ve bitiş işaretçilerinin fareyle doğrudan sürüklenip bırakılabilmesi (drag-and-drop),
2. Farklı yürüyüş stratejilerine olanak tanıyan senaryo rota tercihleri (`balanced`, `shortest`, `flattest`),
3. Noktalar sürüklenip bırakıldığında veya tercih değiştirildiğinde anında canlı yeniden planlama,
4. Mesafe, tahmini yürüme süresi, ortalama yürünebilirlik puanı, en dik eğim ve kot profili içeren zenginleştirilmiş rota özet kartı geliştirilmiştir.

---

## 2. Değiştirilen Dosyalar ve Mimari Sınırlar

Geliştirme yalnızca Alparslan'ın sahipliğindeki dosyalarda gerçekleştirilmiş; Efe'nin saf matematik/algoritma modüllerine (`geo/`, `route/`, `test/`) ve veri rasterlarına dokunulmamıştır.

| Dosya | Yapılan Değişiklikler |
|---|---|
| `Sim/public/js/view/minimap/minimap.js` | Sürüklenebilir uç nokta desteği (`state.draggingEndpoint`, `state.draggedPos`), ekran-dünya mesafesi kontrolü (`hitEndpoint`), hover ve drag imleç yönetimi (`grab`/`grabbing`), sürükleme anında dinamik no-data/sınır dışı denetimi ve pulsar hedef halkası çizimi. |
| `Sim/public/index.html` | Minimap kontrol kartına rota tercihi seçici (`#minimap-route-preference`) eklendi. |
| `Sim/public/styles.css` | `.minimap-preference-row` ve zenginleştirilmiş `.minimap-summary` (skor rozetleri, kontrast arka plan ve grid düzeni) stilleri eklendi. |
| `Sim/public/js/main.js` | Worker tarafından çözümlenen rota tercih seçimi, `minimap-route-preference` change dinleyicisi, sürükle-bırak sonrasında anında canlı planlama tetikleyicisi (`byDrag: true`), tercih kimliğinin (`options.preference`) worker'a iletilmesi; ısı haritasının dengeli referans alanı olarak etiketlenmesi ve zenginleştirilmiş metrik sunumu (`renderRouteSummary`). |
| `Sim/stage34b-minimap-acceptance.md` | Bu kabul raporu (yeni belge). |
| `yapay zeka icin/road map.md` | Stage 34B aşamasının tamamlandı olarak güncellenmesi. |

---

## 3. Gerçekleştirilen Yeteneklerin Detayları

### 3.1 Sürüklenebilir Uç Noktalar (Drag-and-Drop Endpoints)
- **Etkileşim:** Kullanıcı imleci başlangıç (yeşil) veya bitiş (turuncu) işaretçisinin üzerine getirdiğinde imleç `grab` şeklini alır.
- **Sürükleme:** Tıklanıp sürüklendiğinde imleç `grabbing` olur, harita pan hareketi kilitlenir ve seçilen işaretçi imleci takip eder.
- **Canlı Geri Bildirim:** Sürüklenen işaretçinin etrafında yarı şeffaf kesikli pulsar halkası belirir. İmleç altındaki hücre no-data veya DTM kapsamı dışındaysa anında uyarı mesajı görüntülenir.
- **Bırakma & Canlı Planlama:** İşaretçi geçerli bir hücreye bırakıldığında yeni koordinat kaydedilir. Eğer her iki uç nokta da tanımlıysa rota planlayıcı otomatik olarak (`byDrag: true`) devreye girerek yeni rotayı anında hesaplar.

### 3.2 Rota Tercihleri (Route Preferences)
Kullanıcı açılır menüden üç farklı strateji seçebilir:
1. **Dengeli EVA Yürünebilirlik (`balanced` - Varsayılan):** Referans `cost-model` önayarını kullanır; uzaklık, eğim ve pürüzlülüğü birlikte değerlendirir. Minimap ısı haritası bu dengeli referans alandan hazırlanır.
2. **En Kısa Mesafe (`shortest`):** Sert eğim sınırını korurken daha kısa mesafeye öncelik veren `route-compare` senaryo önayarını kullanır.
3. **En Düz / Düşük Eğim (`flattest`, Worker'da kanonik `gentle`):** Eğim ve pürüzlülük cezasını artıran, sert eğim sınırını koruyarak daha düz yüzeylere yönelen `route-compare` senaryo önayarını kullanır.

Tercih değiştirildiğinde, uç noktalar seçiliyse Web Worker'a yalnızca `options.preference` kimliği gönderilir. Worker, kimliği `route-compare` önayarına çözer; maliyet parametreleri UI tarafından gönderilmez.

### 3.3 Zenginleştirilmiş Rota Özet Kartı
Rota başarıyla hesaplandığında aşağıdaki metrikler dinamik olarak kartta listelenir:
- **Toplam mesafe:** Metre cinsinden rota uzunluğu.
- **Tahmini yürüme süresi:** 0,8 m/s senaryo hızlı yürüyüş varsayımıyla dakika ve saniye (ör. `15 dk 13 sn`).
- **Ortalama yürünebilirlik:** EVA yürünebilirlik puanı (0–100 arası; yeşil $\ge 70$, sarı $\ge 40$, kırmızı $< 40$ renk rozetleriyle).
- **En dik eğim:** Derece cinsinden rotadaki maksimum eğim ve maliyet çarpanı.
- **Kot değişimi ($\Delta Z$):** Kot kazanımı, kot kaybı ve net yükseklik farkı (ör. `+3.4 m / −16.8 m (net: −13.4 m)`).

---

## 4. Bilimsel Dürüstlük, Veri Doğruluğu ve Feragatler

1. **Kanonik Feragat Koruması:**
   Arayüzde ve özet kartında kanonik feragat metni aynen korunmuştur:
   > *"Planlama göstergesi — güvenli rota sertifikası değildir."*
2. **Yasaklı Kelime Denetimi:**
   `smoke-e2e.mjs` kuralları uyarınca eklenen yeni metinlerde ilgili regex kontrolü gözetilmiş; hiçbir sahte rota garanti sertifikası veya risk puanı iddiasında bulunulmamıştır.
3. **No-Data Koruması:**
   No-data veya DTM kapsamı dışındaki alanlara işaretçi bırakılmasına izin verilmez (fail-closed); bu alanlar sıfır kotuna dönüştürülmez veya geçilebilir kabul edilmez.
4. **Senaryo Parametreleri:**
   0,8 m/s yürüme hızı ve tercih ağırlıkları NASA operasyonel sınırı değil, açıkça etiketli senaryo varsayımıdır.
