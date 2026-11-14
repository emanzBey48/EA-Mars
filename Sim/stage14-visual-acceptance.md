# Stage 13/14 — Görsel kabul raporu

**Tarih:** 14 Kasım 2026  
**Hazırlayan:** Codex (Luna) · **Entegrasyon sahibi:** Alparslan  
**Dal / başlangıç HEAD:** `codex/stage14-visual-acceptance` / `268fd93`  
**Karar:** **BEKLEMEDE — görsel kabul için kanıt yok.**

## Kapsam ve yöntem

İnceleme, yol haritasındaki Stage 13/14 görsel kabul görevine göre `main.js`, 3D renderer/kamera entegrasyonu ve smoke senaryosu kapsamını içerir. İstenen geçici uygulama çalıştırması `node server.mjs` ile `127.0.0.1:8091` üzerinde başlatıldı; `npm test`, `npm run smoke` ve `prepare-data` çalıştırılmadı. Uygulama/kaynak/veri/test dosyası değiştirilmedi.

Gerçek tarayıcıda ekran gözlemi elde edilemedi: ilk CUA envanter çağrısı zaman aşımına uğradı; sonraki denemede Chrome penceresi küçültülmüş olarak bildirildi ve pencere durumunu yenileme isteği başarısız oldu. Bu nedenle yeni ekran görüntüsü alınmadı. Mevcut `Sim/test-output/*.png` dosyaları kullanıcı değişikliği olduğundan açılmadı ve bu raporda kanıt sayılmadı.

## Statik inceleme bulguları

- `astronaut-rig.js`, renderer’dan bağımsız rig şablonu ve deterministik poz üretimi tanımlıyor. First-person parça listesi torso, göğüs ünitesi, iki kol ve iki eldiven içeriyor. Bunların alt kadrajda okunurluğu veya kesilip kesilmediği statik kaynaktan doğrulanamaz.
- Poz üretiminde yürüyüş, düşey hızlı sıçrama evreleri, iniş toparlanması ve temas bilinmiyorsa nötr `unknown` poz dalları mevcut. Kaynak açıklaması, unknown temasın tek başına yerde olma veya düşme iddiası kurmaması gerektiğini belirtiyor.
- `smoke-e2e.mjs` içinde hareket/duraklatma, unknown kot HUD durumu, unknown temas sırasında önceden başlamış sıçramanın korunması ve WebGL2 başarısızlığında fallback kontrolleri tanımlı. Bu kontroller bu görevde çalıştırılmadı ve kendi başlarına görsel kanıt sağlamaz.
- README’ye göre 2D’de Space duraklat/devam; 3D’de Space sıçramadır. 3D seçimi doğrulanmış DTM/WebGL2/başlangıç kotuna bağlıdır; WebGL2 kullanılamazsa 2D görünümün korunması beklenir.
- Kaynakta DTM hillshade’i ortogörüntü değildir. Orto uyarısı/katman atfı gözlemlenemedi.

## Görsel kabul matrisi

Herhangi bir satır **PASS** değildir. Durumların tümü tarayıcıda canlı görülüp yeni kanıt kaydedilene kadar beklemededir.

| Durum | Görselde doğrulanacak nokta | Sonuç |
|---|---|---|
| Başlangıç / 3D açılış | Başlangıç konumu, gövde ve first-person alt kadraj kolları okunur; HUD/uyarılarla çakışma yok | **BEKLEMEDE** — gözlem yok |
| Yürüyüş | Kol/gövde salınımı görünür ve tutarlı; model kadrajdan taşmıyor veya HUD’ı örtmüyor | **BEKLEMEDE** — gözlem yok |
| Sıçrama yükselişi | First-person kollar/gövde ile kamera duruşu yükseliş pozunu okunur kılıyor; kesilme veya örtüşme yok | **BEKLEMEDE** — gözlem yok |
| Sıçrama tepesi | First-person kol/gövde dengesi ve kamera duruşu ayırt edilebilir; model kadrajda kalıyor | **BEKLEMEDE** — gözlem yok |
| Sıçrama inişi | First-person kollar/gövde ve kamera duruşu inişe hazırlığı okunur kılıyor; görsel çelişki yok | **BEKLEMEDE** — gözlem yok |
| İniş toparlanması | First-person gövde/kol toparlanması ve kamera esnemesi seçilebilir; kollar örtüşmüyor | **BEKLEMEDE** — gözlem yok |
| Duraklatma | Görsel poz ve saat duraklatmada sabit kalıyor; resume sonrası hareket sürüyor | **BEKLEMEDE** — bu görevde denenmedi |
| Bilinmeyen yüzey teması | Kot bilinmiyor uyarısı görünür; nötr poz belirsiz teması yere basma/düşüş gibi göstermiyor | **BEKLEMEDE** — gözlem yok |
| 2D fallback | WebGL2/3D kullanılamadığında harita görünür ve kontroller kullanılabilir; 3D varmış izlenimi yok | **BEKLEMEDE** — gözlem yok |

## Sonuç ve sonraki kapı

Bu rapor, statik kaynak ve senaryo kapsamını kaydeder; görsel ürün kabulü vermez. Tarayıcı ekranına erişim sağlanıp yukarıdaki durumlar canlı gözlemlendiğinde her satır için PASS/FAIL kararı ve yeni, duruma bağlı kanıt eklenmelidir. Bir görsel kusur bulunursa düzeltme ayrı kapsamlı görev olarak ele alınmalıdır. Bu rapor hazırlanırken test, smoke veya veri hazırlama komutu çalıştırılmadı.
