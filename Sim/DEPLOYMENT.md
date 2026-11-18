# Marswalk — Statik Paketleme ve Canlıya Alma Kılavuzu / Static Deployment Guide

> **Türkçe ve İngilizce iki dilli yayınlama kılavuzu** · Ana proje tanıtımı: [`../README.md`](../README.md) · Uygulama teknik belgeleri: [`README.md`](README.md) · Veri kaynakları: [`SOURCES.md`](SOURCES.md)

---

## 1. Mimari Özet / Architecture Overview

### Türkçe
Marswalk çalışma zamanında sunucu tarafı kod veya npm paketi gerektirmeyen **%100 statik bir ES modül web uygulamasıdır**:
- Paketlenecek statik içerik yalnızca `Sim/public/`, `Sim/data/` ve `Sim/SOURCES.md` dosyalarından oluşur (`build-pages.mjs` ayrıca GitHub Pages'in Jekyll işlemesini kapatmak için kök dizine `.nojekyll` ekler).
- `Sim/server.mjs` yalnızca yerel geliştirme içindir (`127.0.0.1:8080` üzerinde `/` → `public/`, `/data/` → `data/` ve `/SOURCES.md` eşlemesi yapar). Canlı ortamda gerekli değildir.
- Tüm varlık ve veri URL'leri **alt-dizin göreli (subpath-relative)** tanımlanmıştır; bu sayede aynı statik çıktı (`Sim/dist/`) hem kök alan adlarında (`https://ornek.com/`) hem de proje alt yollarında (`https://kullanici.github.io/depo-adi/`) ek yapılandırma olmadan çalışır.
- `5c8090c` commit'inden itibaren ~7,5–7,6 MB boyutundaki `.f32` arazi dosyaları düz Git blob'u olarak izlenir; CI/CD ortamlarında `git-lfs` kurulumu gerekmez. (Depo kökündeki büyük ham `.IMG` ve `.JP2` dosyaları statik pakete alınmaz.)

### English
Marswalk is a **100% static ES module web application** with zero runtime npm dependencies and no server-side execution:
- The deployable static bundle consists solely of `Sim/public/`, `Sim/data/`, and `Sim/SOURCES.md` (`build-pages.mjs` also writes an empty `.nojekyll` file so GitHub Pages skips Jekyll processing).
- `Sim/server.mjs` is only for local development (mapping `/` → `public/`, `/data/` → `data/`, `/SOURCES.md` → `SOURCES.md` on `127.0.0.1:8080`) and is not used in production hosting.
- All asset and dataset URLs are **subpath-relative**, so the same `Sim/dist/` output works out of the box on both root domains (`https://example.com/`) and `/<repo-name>/` project subpaths (`https://user.github.io/repo-name/`).
- Since commit `5c8090c`, the ~7.5–7.6 MB `.f32` terrain subsets are stored as plain Git blobs, so standard CI checkouts work without `git-lfs`. (Large raw `.IMG`/`.JP2` files at repo root are excluded from static builds.)

---

## 2. Yerel Paketleme ve Önizleme / Local Build & Preview

Her canlıya alma öncesinde veri bütünlüğünü doğrulayın ve statik çıktıyı `Sim/dist/` içine üretin (**Node.js ≥ 20**):

```bash
cd Sim
node scripts/preflight.mjs   # Veri dosyalarını ve SHA-256 manifestlerini doğrular (HAZIR bekleyin)
npm run build:pages          # scripts/build-pages.mjs ile Sim/dist/ klasörünü oluşturur
```

### Statik Çıktıyı Yerelde Önizleme / Previewing `Sim/dist/` Locally
Tarayıcılar ES modüllerini ve `fetch()` isteklerini `file://` protokolünde güvenlik nedeniyle engeller; bu yüzden `Sim/dist/` klasörünü herhangi bir basit statik HTTP sunucusuyla test edin:

```bash
# Seçenek 1 (Node.js / npx)
npx serve Sim/dist

# Seçenek 2 (Python)
python -m http.server 8080 --directory Sim/dist
```

Ardından tarayıcıda `http://127.0.0.1:8080/` adresini açın.

---

## 3. GitHub Pages

Depo kökündeki [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) iş akışı GitHub Pages için hazırdır (`Sim/` içinde `preflight` ve `npm run build:pages` çalıştırıp `Sim/dist/` çıktısını yayınlar).

### Kurulum Adımları / Setup Steps
1. GitHub deponuzda **Settings → Pages** bölümünü açın.
2. **Build and deployment → Source** seçeneğini **GitHub Actions** olarak ayarlayın.
3. `main` veya `codex/efe-visual-realism` dallarına push yapın ya da **Actions** sekmesinden `workflow_dispatch` ile iş akışını manuel tetikleyin.
4. İş akışı tamamlandığında site `https://<kullanici>.github.io/<depo-adi>/` adresinde alt-dizin uyumlu şekilde yayına alınır.

---

## 4. Cloudflare Pages

### Seçenek A: Wrangler CLI ile Doğrudan Yükleme / Direct Upload via CLI
```bash
cd Sim
node scripts/preflight.mjs
npm run build:pages
npx wrangler pages deploy dist --project-name=marswalk
```

### Seçenek B: GitHub Actions Otomasyonu / Automated via GitHub Actions
Cloudflare Pages dağıtımını GitHub Actions üzerinden otomatikleştirmek için depo ayarlarında (**Settings → Secrets and variables → Actions**) şu değerleri tanımlayın:
- **Variable:** `CLOUDFLARE_PAGES_PROJECT` (örn. `marswalk`)
- **Secret:** `CLOUDFLARE_API_TOKEN` (Cloudflare Pages *Edit* yetkili API jetonu)
- **Secret:** `CLOUDFLARE_ACCOUNT_ID` (Cloudflare hesap kimliği)

*(Cloudflare Dashboard üzerinden Git entegrasyonu kullanıyorsanız build ayarlarını Root directory: `Sim`, Build command: `npm run build:pages`, Build output directory: `dist` olarak girin.)*

---

## 5. Netlify

Depo kökündeki [`netlify.toml`](../netlify.toml) dosyası Netlify tarafından otomatik algılanır:
- **Base directory:** `Sim`
- **Build command:** `npm run build:pages`
- **Publish directory:** `dist` (base dizinine göre `Sim/dist`)

### CLI Alternatifi / CLI Alternative
```bash
cd Sim
node scripts/preflight.mjs
npm run build:pages
npx netlify deploy --prod --dir=dist
```

---

## 6. Vercel

Depo kökündeki [`vercel.json`](../vercel.json) dosyası Vercel tarafından otomatik algılanır ve `Sim/` içinde `npm run build:pages` çalıştırarak `Sim/dist` çıktı klasörünü sunar.

### CLI Alternatifi / CLI Alternative
Depo kökünden:
```bash
npx vercel --prod
```

*(Vercel Dashboard'da manuel ayar gerekirse **Build & Development Settings** içinde **Install Command** boş bırakılabilir veya `node -v`, **Build Command** `cd Sim && npm run build:pages`, **Output Directory** `Sim/dist` olmalıdır.)*

---

## 7. Yayın Sonrası Kontrol Listesi / Post-Deploy Verification Checklist

1. **Küre ekranı (`/`):** Viking MDIM 2.1 dokusu, samanyolu/yıldız alanı arka planı ve sağ görev paneli açılıyor mu?
2. **Dil anahtarı (`TR | EN` ve `?lang=en`):** Sol alt anahtar ve `?lang=en` URL parametresi tüm metinleri güncelliyor mu?
3. **3B sahne (`?demo=1` veya `SİMÜLE ET`):** HiRISE arazi ağı, kask katmanı, holografik minimap (`M`) ve otomatik sürüş çalışıyor mu?
4. **Ağ sekmesi (DevTools → Network):** Özellikle alt-dizinde (`/depo-adi/`) barındırılıyorsa `data/legacy-hirise/dtm_subset.f32`, `data/viking-mdim/manifest.json`, `data/ortho/ortho-alignment-z17-tiles.json` ve `SOURCES.md` isteklerinin **HTTP 200** döndüğünü doğrulayın.
5. **2D yedek (`?view=2d` veya `?intro=0`):** Harita, rota planlama (`pathfinder.worker.js`) ve katman bilgileri hatasız yükleniyor mu?
