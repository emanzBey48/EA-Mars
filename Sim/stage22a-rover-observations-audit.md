# Aşama 22A denetimi: Perseverance saha fotoğrafı gözlem modülü

Modül: `Sim/public/js/geo/rover-observations.js`. Test: `Sim/test/rover-observations.test.mjs` (14/14; `node --test test/` 91/91). Veri canlı telemetri değildir; görüntüler ham (raw) ve bilimsel kalibre değildir.

## Bulunan alanlar
- Manifest: `imageid, sol, instrument, camera_name, description_tr, date_taken_mars (LMST), date_taken_utc, site, drive, attitude "(w,x,y,z)", mastAz, mastEl, credit, sourceUrl`. Manifestte kamera modeli ve `xyz` YOK; ham API kaydında `extended.xyz`, `camera.camera_model_component_list` (CAHV A ekseni) var.
- CacheCam: mastAz/mastEl boş. Hazcam kayıtlarında sayı var ama açıklamada az/el yok.

## Konvansiyonlar ve doğrulama
- **DOĞRULANDI** `attitude` skaler-önce kuaterniyon, rover->site: roll/pitch/yaw, `M20_waypoints.json` 4_1250 (yaw -140.02, pitch 4.02, roll 1.91) ve 6_0 (yaw 141.08) satırlarını < 0,5° ile yeniden üretir.
- **DOĞRULANDI** Navcam/Mastcam-Z `mastAz/mastEl` ROVER çerçevesindedir (X ileri, Y sağ, Z aşağı): API kamera modeli A ekseninin az/el'i 1,5° içinde uyuşur. Site çerçevesi DEĞİLDİR; mutlak yön için rover yaw'ı (attitude) eklenmelidir.
- **DOĞRULANDI** API `xyz` site çerçevesi (K, D, Aşağı) konumudur: 4_0 -> 4_1250 farkıyla < 10 m uyumlu.
- **OLASI** Site çerçevesi kuzeye hizalı, yaw/azimut kuzeyden saat yönünde (veride yazmıyor; sürüş yönü-yaw istatistiği 233/367 uyum, ayna 95/367). Adlandırılmış varsayım: `SITE_FRAME_ASSUMPTION`; kabul edilmezse `resolvePointing` kapalı kalır (`available:false`). Üretilen her site/yerel/kamera değeri `conventionVerified:false`.
- Yerel/kamera: x=doğu, y=kuzey; `yaw = atan2(kuzey, doğu)` (kuzey=+90°, doğu=0), `pitch=+yukarı`. camera.js `getViewProjectionMatrix` ile sayısal doğrulandı (6 yön ekran merkezine düşer).
- Hazcam/CacheCam: mastAz/El mast pozudur, kamera ekseni değil -> `body_mounted_camera_mast_angles_not_camera_axis`, yön üretilmez.

## Görüntü tablosu (site az/el ve kamera yaw/pitch, OLASI varsayımla)
| id | alet | sol | mast az/el (rover) | site az/el | yaw/pitch |
|---|---|---|---|---|---|
| NLM_0120_…598265 | Navcam L | 120 | 359.8/-23.0 | 219.0/-19.0 | -129.0/-19.0 |
| NLM_0120_…598157 | Navcam L | 120 | 29.8/-23.0 | 248.3/-20.4 | -158.3/-20.4 |
| NRM_0120_…598024 | Navcam R | 120 | 60.4/-22.8 | 278.4/-22.4 | 171.6/-22.4 |
| NRM_0120_…597691 | Navcam R | 120 | 0.2/-22.8 | 219.4/-18.8 | -129.4/-18.8 |
| LRE_0120_…589519 | SuperCam RMI | 120 | 26.2/-1.1 | 246.1/1.7 | -156.1/1.7 |
| CCF_0120_…604710 | CacheCam | 120 | yok | yön yok | yok |
| ZL0_0164_…511875 | Mastcam-Z L | 164 | 349.8/-45.2 | 132.4/-44.1 | -42.4/-44.1 |
| FRF_0164_…506341 | Front Hazcam R | 164 | (mast) 315.8/13.9 | yön yok | yok |
| FLF_0164_…506341 | Front Hazcam L | 164 | (mast) 299.6/20.3 | yön yok | yok |
| NLF_0164_…510503 | Navcam L | 164 | 265.7/-13.2 | 47.1/-14.7 | 42.9/-14.7 |
| NRE_0164_…506334 | Navcam R | 164 | 336.3/-54.8 | 120.0/-54.0 | -30.0/-54.0 |
| CCF_0164_…521702 | CacheCam | 164 | yok | yön yok | yok |

Rover yönü: Sol 120 = 220° (GB), Sol 164 = 141° (GD). Pitch farkı (örn. -23 -> -19) rover eğiminden (4°) gelir.

## Uyumsuzluklar
- Açıklama az/el: 8 kayıt var, 8'i sayısal alanlarla uyumlu (<0,05°); 4 kayıtta (2 Hazcam, 2 CacheCam) değer yok.
- **Pusula sözcükleri**: "Kuzey/K-KD/D-KD" ifadeleri rover az'ını pusula yönü saymış; hesaplanan site azimutuna göre Sol 120 Navcam görüntüleri ~219-278° (GB-B) bakıyor, "Kuzey" etiketi tutmuyor (5 kayıt `disagree`: 4 Sol 120 Navcam + Sol 164 Navcam L "Batı" etiketi, hesaplanan 47°). Açıklama dizgilerindeki yön sözcüklerini HUD'da gösterme.
- SuperCam RMI: CAHV A ekseni (az 55,6°, el +27°) mastAz/El ile (26,2°/-1,1°) uyuşmuyor; çerçevesi bilinmiyor -> OLASI güvenilmez, doğrulanmadı.
- Roadmap künyesi "ASU/MSSS" diyor; veride yalnız `NASA/JPL-Caltech`, Mastcam-Z için `/ASU`, SuperCam için `/LANL/CNES/IRAP`. "MSSS" veride yok, eklenmedi.
- Foto sol'ları (120/164) ile waypoint satır sol'ları (116/157) farklıdır; eşleşme site/drive iledir (4/1250 = sol120-wb1, 6/0 = sol164-roubion; config lat/lon ile < 0,5 m aynı). Bilinmeyen site/drive -> `matched:false`.

## 22B (Alparslan) için açıklar
1. HUD yalnız `resolvePointing(o,{acceptAssumption:SITE_FRAME_ASSUMPTION})` sonucunu gösterir ve "çerçeve varsayımı doğrulanmadı" notunu taşır.
2. "Rover Kamerası Yönüne Bak" düğmesi yalnız `available:true` (mast kameraları) için; Hazcam/CacheCam için gizle. `camera.pitchClamped` yoksa kullan.
3. Künye satırı `observation.credit` ham metni + `OBSERVATION_DISCLAIMER`; "MSSS" ekleme.
4. Pusula sözcüklerini ve LMST/UTC'yi ayrı göster; açıklama yön sözcüğü gösterme. `config.js`/`camera.js` değişmedi.
5. SuperCam çerçevesi ve site çerçevesi kuzey-hizası için NASA belgesi gerekir; gelene kadar OLASI.
