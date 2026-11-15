# Son denetim: küre girişi, kask, otomatik sürüş, ekip (salt okunur)

Kapsam: yalnız kaynak okuma; kod, test ve veri değiştirilmedi, hiçbir şey çalıştırılmadı. Yollar `Sim/public/js/` altındadır. Dil: kısa, dosya:satır.

## (a) Yasak / iddialı ifade taraması (kullanıcıya görünen metin)

- **Düzeltilmeli (1 madde):** `view/globe/globe-panel.js:56` "Süre güvenlikten önceliklidir; **rota güvenli değilse** kask uyarısı verilir." Uygulama rota güvenliğini değerlendirmez; kask yalnız istenen süre aşımını uyarır (`app/demo-flow.js:20-28`). Öneri: "Süre planlama göstergesinde önceliklidir; rota tahmini istenen süreyi aşarsa kask uyarısı verilir."
- Temiz: "güvenli rota" yalnız olumsuz/uyarı bağlamında geçiyor (`index.html:187,234,245,263,275`; `main.js:500,748,812,933`; `route-ribbon.js:11,676`). "garanti" yalnız `route/pathfinder.js:579` ("global optimal garanti edilmez", olumsuz). "canlı telemetri" yalnız "değildir" bağlamında (`index.html:18,171,263,275`, `rover-observations.js:25`, `traverse.js:37`).
- "ortogörüntü" yalnız "değildir" bağlamında (`view-modes.js:14,78`, `hud.js:107`, `globe.js:2`, `layers.js:264,270`). Hillshade "orto" diye adlandırılmıyor. Optik modun adı "Optik (DTM hillshade)": kabul edilebilir, ama kısa etiket "Optik" tek başına ortogörüntü izlenimi verebilir; başlık/tooltip dipnotu mevcut (`view-mode-bar.js:25`).
- `view/globe/regions.js` tür ağırlıkları kod adı `typeSafetyWeight` (`globe-panel.js:3,106`): görünür değil; yorumda "güvenlik skoru değildir" yazıyor (`regions.js:8,26`). Yalnız isim olarak yanıltıcı; yeniden adlandırma önerilir (`typeDifficultyWeight`).
- Kask `setStatus` (O₂, giysi °C) tanımlı (`helmet.js:102-108`) ama `main.js` hiçbir yerde çağırmıyor: uydurma değer gösterilmiyor. Çağrılırsa kaynak/etiket gerekir.

## (b) Çalışma zamanı riskleri

Yüksek / orta:
- **R tuşu çakışması (orta):** `input/input.js:51` R'yi her zaman yeniden başlatma yapar; `main.js:1907-1913` aynı olayda gösteriyi başlatır/durdurur. İki dinleyici de çalışır (hiçbiri `preventDefault`/`stopPropagation` yapmıyor). Sonuç: küre ekranında R gösteriyi başlatırken `sim.restart()` de çağrılır; gösteri sırasında (3B/otomatik sürüş) R gösteriyi durdurur **ve oyuncuyu başa sarar** (`main.js:1793-1804`). Öneri: `main.js` R dinleyicisinde gösteri kullanıldığında olayı tüketmek (capture fazı + `stopImmediatePropagation`) ya da `input.js`'e `isRestartAllowed` enjekte etmek (entegrasyon sahibi karar verir).
- **Küre ekranı arkasında girdi (orta):** `input.js:5-8,45-50` küre görünürken de W/A/S/D/Space/P'yi işler; oyuncu ve duraklatma durumu küre arkasında değişebilir (Space tuşu `preventDefault` ile küre ekranında bile pause'u tetikler). Küre `z-index: 50` (`css/globe.css:3`) görsel olarak örter, girdi bloklamaz. Öneri: `isFirstPerson`-benzeri bir `isInputBlocked` parametresi.
- **"Küreye dön" sonrası simülasyon durumu (düşük/orta):** `demo-flow.js:58,141` `leave3d()` otomatik sürüşü kapatır ama oyuncuyu/simülasyonu durdurmaz; küre açıkken WASD ile hareket sürer. Ayrıca `setMapExpanded` (M) açıksa kapatılmaz (`main.js:2060-2069` yalnız M/Esc/scrim ile kapanır).
- **Küre rAF döngüsü (düşük):** `view/globe/globe.js:404-406,473` `active=false` iken bile her karede `requestAnimationFrame` yeniden kurar (yalnız erken dönüş). `dispose` temizliyor (`:490`). İkinci WebGL bağlamı (3B renderer) ile birlikte küre bağlamı sonuna kadar canlı kalır; zayıf GPU'da bağlam kaybı riski. Öneri: `setActive(false)` iken döngüyü durdurup `setActive(true)`'da yeniden başlatmak; `webglcontextlost` dinleyicisi yok.
- **`flyTo` ikinci çağrıda ilk söz çözülmez (düşük):** `globe.js:477-483` yeni `fly` eskisinin `resolve`'unu çağırmadan üzerine yazar. `index.js:70-82` `busy` koruması bunu şimdilik engelliyor; showreel + elle tıklama birlikte kullanılırsa pratik risk yok.
- **`simulate()` sonrası `busy` (düşük):** `index.js:70-82` `disposed` ise `busy` açık kalır (zararsız); `onSimulate` async olup `await` edilmiyor, hata yutulur (`unhandledrejection`). `main.js:2100-2107` içinde `startDemoTour` hatası yakalanmıyor: küre gizli kalıp uygulama yarım durumda kalabilir.
- **`index.js:95` `show()` içindeki `requestAnimationFrame(() => panel.show())`** hızlı `hide()` sonrası paneli gizli küre üzerinde açık bırakabilir (görünmez; `screen` display:none). Düşük.

Null/dinleyici notları (sorun yok sayılabilir):
- `globe-panel.js:17,166`: tüm dinleyiciler `cleanups` ile söküldü. `globe.js:364-366,490-498`: canvas dinleyicileri söküldü; `ResizeObserver` bırakılıyor; doku yüklemesi `disposed` korumalı (`:311`).
- `helmet.js`: zamanlayıcı `hide()`/`dispose()` ile temizleniyor (`:82,112-116`); `createHelmetOverlay` DOM yoksa no-op döndürüyor.
- `biome-chip.js`: `destroy` zamanlayıcıyı temizliyor; `set` içindeki `requestAnimationFrame` iptal edilmiyor (ihmal edilebilir).
- `demo-flow.js:128` `setTimeout(checkEta, 800)` iptal edilmiyor; `leave3d` sonrası `checkEta` kask gizliyken uyarı kuyruğa alabilir (`helmet.showWarning` gizli sarmalayıcıda). `dispose()` (`:152`) hiç çağrılmıyor; `main.js` uygulama ömrü boyunca tek örnek kurduğu için kabul edilebilir.
- `main.js:2071-2080` M/Esc dinleyicisi hiç sökülmüyor (tek örnek). `Esc` iki ayrı dinleyicide ele alınıyor (`main.js:1914-1917` ve `:2073`): ikisi de çalışır, kurulum/ sunum kapanır ve harita aynı basışta küçülür; kasıtlı olabilir.
- M çakışması yok: `input.js` M'yi tanımıyor; `main.js:2074-2079` metin girişi, kurulum penceresi ve küre ekranında devre dışı.
- `main.js:1907` dinleyicisi `showreel`'e (`let`, `:1964`) erişir; modül üst düzeyi tamamlanmadan olay gelemeyeceği için TDZ riski yok. `showreel` yalnız `introEnabled` iken tanımlı ve dinleyici `showreel &&` ile korunuyor.
- `auto-drive.js:172,177`: `phase==='approaching-line'`/`'following'` dallarında `nearestPointOnPolyline(...)` null dönmez (`hasRoute()` korumalı); `target` tüm yollarda atanır. `crew-sim.js:59-66`: `prev` yalnız `pts.length>=2` iken kullanılıyor; boş polyline `getPositions()` `[]` döner.
- `demo-flow.js:75-86` `engageNow()` rota yokken `autoDrive.setEnabled(true)` + `waitingReplan=true` ile bekler; `requestReplan` `false` dönerse (plan sürüyor / uç nokta yok) hiçbir zaman tekrar denenmez: `main.js:1994` koşulları (`pendingPlanId`, `routeWorkerReady`, `minimapEndpoints.end`) sağlanmazsa kullanıcı "Otomatik sürüş: Açık" görür ama hareket olmaz, geri bildirim yok. Orta/düşük.

## (c) Smoke `intro=0` varsayımı ve WebGL-yok yedeği

- `scripts/smoke-e2e.mjs:77,88` hem normal hem debug URL'ye `intro=0` ekliyor; `:264` hata URL'si `debugUrl`'den türüyor. **Küre girişi, SİMÜLE ET, kask, M/R tuşları ve otomatik sürüş için hiçbir smoke kontrolü yok.** Öneri (kod değişikliği istenirse): `intro` açık tek ek senaryo + `webgl` zorunlu başarısızlık.
- **WebGL yoksa yedek yol YOK (yüksek):** `view/globe/index.js:29-34` `createGlobe` hata atarsa yalnız "Küre gösterilemedi (...). WebGL gerekli." yazısı çıkar; küre ekranı `position: fixed; inset: 0; z-index: 50` (`css/globe.css:2-3`) olarak tüm uygulamayı örter. Seçim yalnız küre tıklamasıyla yapılabildiği için (`pickRegion` yalnız kod/showreel API'si, panelde bölge listesi yok) SİMÜLE ET asla etkinleşmez, ekranı kapatan düğme yok. `main.js:2185-2187` `globeScreen.show()` koşulsuz çağrılır (`startIn3dRequested` veya `?demo=1` hariç). Yani WebGL'siz tarayıcıda yeni kullanıcı 2B fallback'e ulaşamaz. Önerilen: `globe===null` iken `onUnavailable` geri çağrısı ile küreyi gizleyip `openMissionSetup` açmak ya da panelde bölge açılır listesi + "2B haritayla devam et" düğmesi. Not: yalnız WebGL2 yok / WebGL1 var ise küre açılır, ancak `renderer3d` kurulamadığı için SİMÜLE ET sonrası 3B moda geçiş `viewStatus` ile "3D görünüm kullanılamıyor" der; küre akışı bunu önceden denetlemiyor (`main.js:1379`).
- Küre dokusu (Viking karoları) yüklenemezse prosedürel yedek kullanılıyor (`globe.js:309-312`): bu yol sağlam.
- Dokümanlar (`README.md`, `DEMO_NOTES.md`) bu boşluğu belirtecek şekilde güncellendi; düzeltme kod sahibine kalır.

## (d) Kalan "yok / veri yok / belirtilmemiş" görünür metinler

Kullanıcıya görünen (UI):
- `view/3d/horizon-mesh.js:26` "… Yürünebilirlik puanı yok." (ufuk etiketi); `:28` "lisans belirtilmemiş …".
- `config.js:84` "Lisans: kaynakta belirtilmemiş".
- `geo/geology.js:102` ve `:127` "kaynakta belirtilmemiş" / "kaynak atfı belirtilmemiş".
- `route/route-compare.js:183,197` `scoreSource: 'yok (…)'`.
- `simulation/sim.js:379-380` "Yüzey sağlayıcı yok" (snapshot nedeni, HUD'a düşebilir).
- `view/route-guidance.js:126-136,186` "EVA puanı bilinmiyor", "yön bilinmiyor".
- `main.js:663,813,899,901,902` "bilinmiyor"; `:278,648,835,1023,1024,1036,1289,1379,1384,1394,2349` "kullanılamıyor"/"bilinmiyor" durum metinleri.
- `view/hud.js:12` "Kullanılamıyor"; `view/rover-gallery.js:60` "Fotoğraf arşivi kullanılamıyor."; `view/minimap/minimap.js:216` "komşu yüzey durumu bilinmiyor".
- Küre/yeni akış: `view/globe/regions.js:83` hazardNote "kum ve kaya dağılımı bilinmiyor" (şu an arayüzde gösterilmiyor; yalnız veri alanı). Yeni akışta "veri yok" tipi görünür metin eklenmemiş.

Arayüzde listelenmeyen ama modda tutulanlar: Jeofizik ve Kimyasal görüş modları `dataBasis: 'unavailable-data'` (`view-modes.js:19,25`); `VISIBLE_VIEW_MODES` ile gizli (`:32`). Jeofizik için `legendFor` metni "DTM pürüzlülüğü" diyor ama kökeni "veri yok" olarak işaretli: tutarsız etiket (kod yorumu `:19-20`); arayüzde görünmediği için kullanıcıya yansımıyor.

Kodlama notu: `view/3d/route-ribbon.js:2,31,160,694` yorum satırlarında bozuk (çift kodlanmış) UTF-8 karakterler var; yalnız yorum, kullanıcıya görünmez. Başka dosyalarda (`demo-flow.js` Windows PowerShell varsayılan kodlamasında bozuk görünse de UTF-8 doğru okunuyor).

## Doküman değişiklikleri (bu tur)

- `Sim/README.md`: URL parametreleri (`intro`, `showreel`, `quality`), kısayol tablosu, küre/SİMÜLE ET/kask/minimap/görüş modları/otomatik sürüş/ekip/biyom/showreel bölümü, görsel kaynak atfı, yapı tablosu.
- `Sim/DEMO_NOTES.md`: §2b küre girişli akış tablosu (etiketli), kısayol ve parametre satırı.
- `Sim/submission/README_EN.md`: URL parametreleri, küre girişi, M/R kısayolları, atıf.
- `Sim/SOURCES.md` dokunulmadı: dosya `scripts/build-sources-list.mjs` ile üretiliyor ("elle düzenlemeyin"). Üreticiye Viking MDIM #9 ve Mars 2020 ham görüntü #7 zaten girmiş; "NASA/JPL-Caltech Mars 2020 ham görüntüleri yalnız görsel referans, dokular prosedürel" notu üreticide yok: eklenmesi istenirse betiğin kod sahibine iletilmeli. `submission/sources-en.md` ve `project-page-en.md` yeni küre özelliğini kapsamıyor (kaynak listesi değişmedi, yalnız `project-page-en.md` "Features" bölümü güncellenebilir).
