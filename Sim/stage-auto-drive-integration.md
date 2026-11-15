# Auto-drive entegrasyon notu (entegrator icin)

Modul: `Sim/public/js/simulation/auto-drive.js` (saf; `createAutoDrive`, `nearestPointOnPolyline`, `polylineLengthM`, `clampSpeedMultiplier`, `shortestAngleDelta`). Hiz carpani bir **sunum/zaman ayaridir**, fizik parametresi degildir; "guvenli rota" iddiasi yoktur (rota = planlama gostergesi).

## 1. Girdi tasarimi: sim.js kancasi GEREKMIYOR

3B dalinda sim zaten dunya cercevesinde yon alir: `stepFirstPerson(dt, {moveX, moveY, jump, headingRad}, surface)` (`sim.js:155`). `moveX/moveY` yalniz yon olarak kullanilir (buyukluk yok sayilir, hiz sabit `walkSpeedMps`, `sim.js:236-239`) ve `headingRad` dogrudan atanir (`sim.js:174`). Yani auto-drive sentetik tus yerine dogrudan bu nesneyi besler:

```js
moveX = decision.forward ? Math.cos(decision.steerYawRad) : 0
moveY = decision.forward ? Math.sin(decision.steerYawRad) : 0
headingRad = decision.steerYawRad
```

`keys` nesnesine sentetik giris YAPMAYIN: `cameraRelativeMovement(camera3d.yawRad, keys)` (`view/3d/camera.js:215`) kamera yaw'ina bagli; bunun yerine `camera3d.yawRad = decision.steerYawRad` atayin (kamera yonu de rotayi takip eder; fare bakisi auto-drive acikken yok sayilsin). 2B dalinda (`sim.step`, `sim.js:121`) yalniz up/down/left/right (sekiz yon) var; auto-drive yalniz 3B icin tasarlandi.

Istege bagli kanca (YAZILMADI, gerekmez): yalnizca dt carpani icin `stepFirstPerson` icinde ek bir sey gerekmez, bkz. 3.

## 2. main.js: her karede nereye

`main.js:1989` `frame(now)` icinde, `main.js:1999-2004` (3B dalindaki `cameraRelativeMovement` + `sim.stepFirstPerson`) blogunun yerine/oncesine:

```js
let move, yaw = camera3d.yawRad;
if (autoDrive.isEnabled() && sim.phase !== 'arrived') {
  const d = autoDrive.update(dt, { x: sim.pos.x, y: sim.pos.y }, camera3d.yawRad);
  camera3d.yawRad = d.steerYawRad;
  move = d.forward ? { moveX: Math.cos(d.steerYawRad), moveY: Math.sin(d.steerYawRad) } : { moveX: 0, moveY: 0 };
  // d.arrived -> UI'da "Varis"; sim kendi arrivalRadiusM'inde (sim.js:258) ARRIVED olur.
} else {
  move = cameraRelativeMovement(camera3d.yawRad, keys);
}
```

- `sim.phase` PAUSED ise sim zaten kare atlar (`sim.js:162`); P/pause butonu ile `autoDrive.setPaused(sim.phase === 'paused')` esleyin (veya ayri bir auto-drive duraklat dugmesi).
- Sim READY fazinda `moving` olunca RUNNING olur (`sim.js:171`); auto-drive baslarken `forward=true` ilk kareyi baslatir.
- Her auto-drive acilisinda: `autoDrive.setPolyline(activeRoute.path)` (`activeRoute.path` = `{xM,yM,row,col}[]`, modul xM/yM'i kabul eder; `main.js:719`) ve `const dec = autoDrive.engage({x: sim.pos.x, y: sim.pos.y}); autoDrive.setEnabled(true);` (`setEnabled(false)` fazi `idle`'a ceker, her acista tekrar `engage` gerekir).
- `dec.action === 'rejoin-line'`: baska is yok, auto-drive once `snapPoint`'e gider (`phase 'approaching-line'`), sonra rotayi izler.
- `dec.action === 'replan'` (oyuncu rotadan > 20 m): bkz. 4.
- Polyline yoksa (`activeRoute` null/`status !== 'ok'`) tek parca yedek: `[sim.route.a, sim.route.b]` (`sim.js:100`; `{x,y}` bicimi).

## 3. Zaman olcegi ile hiz carpani

`SCENARIO.timeScale = 8`, `airborneTimeScale = 2` (`config.js:13,17`). `advanceSimClock` (`sim.js:77`) sim dt'sini zaten wall dt'den uretir; fizik sim saniyesinde calisir. Carpan **sim'e verilen wall dt'ye** uygulanir, `airborneTimeScale` ile carpilmaz/degistirilmez (ucus saati ayri kalir):

```js
const scaledDt = dt * autoDrive.effectiveTimeScaleMultiplier(); // duraklatilmis -> 0; varisa yaklasirken yavaslama dahil
```

`stepFirstPerson` ve `step` icinde `dt = min(0.1, dtWall)` kenetlemesi var (`sim.js:122,156`). 10x'te 60 fps karede `scaledDt` ~0.167 s olur ve 0.1'de kesilir, yani hiz sessizce 6x'te tavanlanir. Bu yuzden alt-adimlayin:

```js
let remaining = scaledDt;
while (remaining > 1e-9) {
  const h = Math.min(remaining, 0.05);
  sim.stepFirstPerson(h, { ...move, jump: false, headingRad: camera3d.yawRad }, surfaceSampleNow);
  sim.resolveSurfaceContact(layers.dtm.sampleElevation(sim.pos.x, sim.pos.y)); // main.js:2010 ile ayni, her alt-adimda
  remaining -= h;
}
```

Kare basina en fazla `ceil(10*dt/0.05)` (~4) alt-adim; `dt` ust siniri 0.1 oldugu icin sinirli. `d.steerYawRad` icin `update` yine gercek wall `dt` ile cagrilir (donus hizi sunum olarak gercek sureye bagli). Carpan 1'de `scaledDt === dt`, yani mevcut davranis. Zaman kisalmasi gorsel animasyonlari (`timeS` tabanli yuruyus/sicrama kinematigi) da hizlandirir; bu sunum amaclidir.

## 4. Rota yeniden cizme (replan)

`dec.action === 'replan'` ise mevcut konumdan yeni rota istenir. Yol: `main.js:895` `planMinimapRoute()` worker'a `{type:'plan-walking-route', startLocal, endLocal, options:{preference}}` yollar (`pathfinder.worker.js:94` -> `route-service.js:321` `planWalkingRoute`). Gereken: `minimapEndpoints.start = {xM: sim.pos.x, yM: sim.pos.y}` ata (hedef `minimapEndpoints.end` kalir), `planMinimapRoute()` cagir; `handleRouteWorkerMessage` (`main.js:700`) sonucu `activeRoute`'a yazinca (`status==='ok'`) `autoDrive.setPolyline(activeRoute.path); autoDrive.engage(pos)` cagir (yeni rota oyuncudan baslar, sonuc `rejoin-line`). Plan gelene dek `phase==='idle'` ve `forward=false` (oyuncu durur); `no_path`/`start_blocked` gibi hatada auto-drive'i kapat ve durumu HUD'a yaz. Planlayici baslangic hucresi gecilemezse `options.snapToNearestPassableWithinM` verilebilir (`route-service.js:340`). Not: `planMinimapRoute` `pendingPlanId !== null` iken geri doner (`main.js:896`), yani cagri ise yaramayabilir; sonucu bekleyin.

`sim.setRoute` (`sim.js:100`, `main.js:297`) yalniz duz a->b alir ve `restart()` cagirir (oyuncuyu a'ya tasir); replan sirasinda cagirmayin. Varis (`ARRIVED`) sim'de `route.b` yaricapi ile belirlenir (`sim.js:258`); polyline son noktasi `route.b` ile ayni olmali.

## 5. Bilinen sinirlar

- Yavaslama: sim hiz buyuklugunu yok saydigindan "son noktada yavaslama" `effectiveTimeScaleMultiplier()` icindeki `slowdown` (0.35..1, son 8 m) ile saglanir; carpan 1 iken de gecerlidir.
- Yerel arazi/egim yoktur; auto-drive yalniz polyline'i izler, dik/yetersiz-veri hucrelerini bilmez.
- Sicrama (`jump`) auto-drive tarafindan uretilmez.
