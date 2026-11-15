# Görsel gerçekçilik — kurtarılan ara çıktılar (15 Kasım 2026)

Bu klasör, durdurulan/limit nedeniyle kesilen ilk görsel gerçekçilik ajanlarının ara çıktılarını saklar. Kod değildir; uygulama bunları yüklemez.

## `baseline-screenshots/` — değişiklik ÖNCESİ 3D görünüm
Ajan 1 tarafından tarayıcıda (ANGLE / Intel Iris Xe, D3D11) alındı: ~117 FPS, kare süresi medyan 0,30 ms. `before-log.txt` ayrıntıları ve tanı anahtarlarını içerir (konsolda bir 404 kaynak hatası var — incelenmedi).

Orkestra şefinin gözlemleri (görüntülerden):
- Gökyüzü düz, bulanık kahve-pembe; güneş küçük bir nokta, hale zayıf.
- Arazi tekdüze turuncu-kahve, ince ayrıntı/doku ve gölge yok; ~1 km sonra arazi bitiyor, ufukta silüet yok.
- Astronot parlak turuncu kutulardan oluşuyor (gerçek EVA giysileri beyazdır) — en belirgin gerçek dışılık.

## `viking-palette-measure/` — Viking MDIM 2.1 bölgesel renk ölçümü
Ajan 2'nin ölçümü (`regional-jezero-4deg-native.png`, DTM penceresi = 40 piksel):
- sRGB8 ortalama ≈ (34,1 ; 27,9 ; 39,5), medyan (33, 27, 39), P10 (30, 24, 36), P90 (38, 32, 43).
- Ton açısı ≈ **272°** (mavi > kırmızı) → bu ürünün rengi **işlenmiş/gerilmiş**; doğal Mars rengi olarak kullanılamaz. Arazi paleti için yalnız GÖRELİ parlaklık değişimi bilgisi olarak değerlendirilebilir; renk tonu başka (kaynaklı) bir referanstan ya da "görsel yaklaşım" etiketli sunum paletinden gelmelidir.
- `png.mjs` / `measure-viking.mjs`: bağımlılıksız PNG çözücü ve ölçüm betiği (Node).
