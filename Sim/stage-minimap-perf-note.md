# Minimap performans notu (demo modu FPS)

Kapsam: `Sim/public/js/view/minimap/minimap.js` ve `Sim/test/minimap.test.mjs`. Diğer dosyalara dokunulmadı.

## Neden

Rota planlıyken minimap her karede tamamen yeniden çiziliyordu. Rota bloğunda her segment için `shadowBlur = 8` kullanılıyordu (~670 segment), ve animasyon döngüsü minimap görünmezken de sürüyordu. Demo modunda (`body.presentation-mode #panel` `display:none`) minimap gizli olsa bile bu maliyet ödeniyordu.

## Ne değişti

- Segment başına `shadowBlur` kaldırıldı. Parlama, segmentlerin renkleriyle çizilen geniş (20 px), düşük alfalı (0.2) bir halo katmanına dönüştü; ardından katı gövde (8 px) ve kesikli çekirdek (3.2 px) gelir.
- Rota animasyonu rAF üzerinde en fazla ~15 Hz ile sınırlandı. Etkileşim (sürükleme, yakınlaştırma, uç nokta seçimi, rota değişimi) animasyon beklemeden anında çizer.
- Minimap gizliyken (`getClientRects()` boş, `document.hidden`) çizim atlanır ve `drawPending` işaretlenir. Görünür olunca ResizeObserver ya da `visibilitychange` ile çizim yapılır. Animasyon döngüsü gizliyken kendini durdurur.

## Ölçüm (3 s rAF, 1600x1000, başsız Edge, paylaşımlı makine)

| Koşul | Önce | Sonra |
|---|---|---|
| demo (rota + sunum) | 29.7 / 24.7 / 27.6 | 66.8 / 75.5 |
| demo, rota temizlendi | 71.9 / 72.9 / 76.1 | 75.7 |

Makinede başka süreçler çalıştığı için değerler dalgalı; medyan demo ~27 -> ~71 FPS.

## Görsel karşılaştırma

Panel geçici olarak açılıp minimap kırpımı alındı (önce/sonra). Rota gövdesi, kesikli çekirdek, segment renkleri, Başlangıç/Bitiş işaretleri ve metinler aynı. Tek fark: eski `shadowBlur` yumuşak bir gradyan veriyordu; yeni halo daha düz bir bant. Segment birleşim noktalarında yuvarlak uçların üst üste binmesi biraz daha parlak nokta oluşturabilir.

## Doğrulama

- `node --test test/`: 598/598 (önceki 593 + bu değişikliğin 5 testi).
- `npm run smoke`: 38/38.
- Yeni testler: shadowBlur hiç pozitif atanmaz ve sızmaz; rota değişimi görünürken anında çizilir; gizli kanvas çizilmez ve görününce çizilir; gizli sekme çizilmez ve `visibilitychange` ile çizilir; animasyon ~15 Hz ile sınırlanır ve gizliyken durur.
