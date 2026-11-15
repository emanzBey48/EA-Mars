# Showreel entegrasyonu (entegratör için, 15 satır)
Modül: `public/js/app/showreel.js` (`createShowreel`, `buildDefaultShowreelSteps`). Var olan dosyalar bu görevde düzenlenmedi.
1. `view/globe/index.js:83` dönüş nesnesine `pickRegion(id, which)` ekle: `regions.find(r=>r.id===id)` bul; which==='start' ise `state.start=r; panel.setStart(r)`, 'end' ise `state.end=r; panel.setEnd(r)` (index.js:64-65 ile aynı); sonra `syncMarkers()` (:41). `state.busy` iken yok say.
2. Aynı dönüşe `simulate()` ekle: `simulate({ start: state.start, end: state.end })` (index.js:69; ikisi de seçili değilse zaten döner).
3. `main.js:1996` (`globeScreen = createGlobeScreen(...)`) sonrasında, `introEnabled` bloğu içinde: `import { createShowreel, buildDefaultShowreelSteps } from './app/showreel.js'` ekle ve `api` kur:
   `{ globe: globeScreen, setViewMode: (id)=>{ modeBar.setMode(id); modeState.mode=id; ... }, setAutoDrive: (on)=>demoFlow.toggleAuto(on), setAutoSpeed: (n)=>demoFlow.setSpeed(n) }`.
4. Dikkat: `modeBar.setMode(id)` bildirim YAPMAZ (view-mode-bar.js:83, notify=false); `onChange` gövdesini (main.js:1988-1994: field hesabı + `modeBar.setField`) ortak bir `applyMode(id)` fonksiyonuna çıkar, hem `onChange` hem showreel `setViewMode` onu çağırsın.
5. `const reel = createShowreel({ steps: buildDefaultShowreelSteps(api), onStep: (e)=>console.info('[showreel]', e.status, e.id) })`.
6. URL: `urlParams` main.js:46 zaten var; `if (urlParams.get('showreel') === '1') reel.start();` — `globeScreen` kurulduktan ve `globeScreen.show()` çağrıldıktan sonra (şu an show() çağrısının yerini main.js'te doğrula).
7. R tuşu: main.js:1897 keydown dinleyicisine ekle: `if (e.key==='r'||e.key==='R') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA/.test(e.target.tagName) { reel.isRunning() ? reel.stop() : reel.start(); }` (pointer-lock iken de çalışsın istenirse `document.pointerLockElement` koşulunu koyma).
8. Not: `simulate()` adımı `onSimulate` -> `startDemoTour()` (main.js:1999-2004) bekler; showreel `await globe.simulate()` bu sözü döndürmez (index.js:80 onSimulate sonucunu beklemiyor), süre `waitMs` ile ayarlıdır.
9. Gösteri yalnız sunum içindir; arayüzde "güvenli rota" veya "canlı telemetri" ifadesi kullanma.
