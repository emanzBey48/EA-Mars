// Optional browser smoke test (no dependencies): drives a local Edge/Chrome over the DevTools protocol,
// presses real keys and checks the acceptance flow. Requires Node >= 22 (global WebSocket).
// Usage: node scripts/smoke-e2e.mjs          (starts its own server on PORT 8181 unless SMOKE_URL is set)
// Screenshots are written to Sim/test-output/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test-output');
const profileDir = path.join(root, '.e2e-profile');
fs.mkdirSync(outDir, { recursive: true });
const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browserPath = BROWSERS.find((p) => fs.existsSync(p));
if (!browserPath) { console.error('Edge/Chrome bulunamadı; BROWSER ortam değişkeniyle yol verin.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

let server = null;
let url = process.env.SMOKE_URL;
if (!url) {
  server = spawn(process.execPath, [path.join(root, 'server.mjs')], { env: { ...process.env, PORT: '8181' }, stdio: 'ignore' });
  url = 'http://127.0.0.1:8181/';
  await sleep(600);
}
const port = 9333;
const browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--window-size=1600,1000', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

async function cleanup() {
  try { browser.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(800);
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

try {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
  const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyP: 80, KeyR: 82, Equal: 187, ArrowUp: 38 };
  const keyEvt = (type, code, key) => send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: VK[code], nativeVirtualKeyCode: VK[code] });
  const press = async (code, key) => { await keyEvt('keyDown', code, key); await keyEvt('keyUp', code, key); await sleep(150); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, 'base64')); };
  const state = () => evaluate(`(() => { const m = window.marswalk; m.updateHud(); const mt = m.sim.metrics(); return { x: m.sim.pos.x, y: m.sim.pos.y, t: m.sim.simTimeS, phase: m.sim.phase, dev: mt.deviationM, out: mt.outsideCorridor,
    banner: !document.getElementById('deviation-banner').hidden, elev: document.getElementById('v-elev').textContent, slope: document.getElementById('v-slope').textContent,
    a: m.waypoints[0].local, b: m.waypoints[1].local, zoom: m.camera.pxPerM }; })()`);
  const holdUntil = async (code, key, pred, maxMs = 15000) => { await keyEvt('keyDown', code, key); const t0 = Date.now(); let s; do { await sleep(50); s = await state(); } while (!pred(s) && Date.now() - t0 < maxMs); await keyEvt('keyUp', code, key); await sleep(120); return state(); };
  const segDist = (s) => { const { a, b } = s; const dx = b.x - a.x, dy = b.y - a.y; let t = ((s.x - a.x) * dx + (s.y - a.y) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); return Math.hypot(s.x - (a.x + t * dx), s.y - (a.y + t * dy)); };

  await send('Page.enable'); await send('Runtime.enable');
  // 0. Verify normal run does NOT expose window.marswalk
  const normalUrl = new URL(url); normalUrl.searchParams.delete('debug');
  await send('Page.navigate', { url: normalUrl.toString() });
  for (let i = 0; i < 60; i++) {
    const loaded = await evaluate(`document.getElementById('layers')?.innerText.includes('DTEEC_')`).catch(() => false);
    if (loaded) break;
    await sleep(200);
  }
  const normalDebug = await evaluate('typeof window.marswalk');
  check('0 Normal çalıştırmada window.marswalk dışarı açılmıyor', normalDebug === 'undefined', `typeof window.marswalk = ${normalDebug}`);

  // Explicitly enable debug mode (?debug=1) for state inspection and synthetic cell-mutation checks
  const debugUrl = new URL(url); debugUrl.searchParams.set('debug', '1');
  await send('Page.navigate', { url: debugUrl.toString() });
  for (let i = 0; i < 100; i++) { const ok = await evaluate('!!(window.marswalk && window.marswalk.layers.dtm.available)').catch(() => false); if (ok) break; await sleep(200); }
  await sleep(500);

  // Enter 3D from a paused, already-moved 2D run to exercise zero-time surface-anchor initialization.
  await keyEvt('keyDown', 'KeyW', 'w'); await sleep(120); await keyEvt('keyUp', 'KeyW', 'w'); await sleep(80);
  await evaluate(`document.getElementById('btn-pause').click()`); await sleep(60);
  const pre3dPhase = await evaluate('window.marswalk.sim.phase');
  check('0a 3D geçişi öncesi hareket ve duraklatma kabul ediliyor', pre3dPhase === 'paused', `faz=${pre3dPhase}`);

  // Stage 9 runtime coverage: lazily build/upload the full fixture mesh, switch both ways,
  // sample rendered-frame cadence/JS heap, and exercise unknown elevation without changing data.
  const heapBefore = await send('Runtime.getHeapUsage').then((r) => r.result?.usedSize ?? null);
  const threeDStart = Date.now();
  await evaluate(`document.getElementById('btn-view-3d').click()`);
  let diag3d = null;
  for (let i = 0; i < 100; i++) {
    diag3d = await evaluate('window.marswalk.getDiagnostics()').catch(() => null);
    if (diag3d?.activeView === '3d' && diag3d.renderer) break;
    await sleep(100);
  }
  const first3dWallMs = Date.now() - threeDStart;
  const canvas3dState = await evaluate(`(() => { const c=document.getElementById('map-3d'); const r=c.getBoundingClientRect(); return {hidden:c.hidden,w:r.width,h:r.height}; })()`);
  check('6a 2D→3D geçişi terrain mesh ile açılıyor', diag3d?.activeView === '3d' && diag3d.terrainMeshReady && !canvas3dState.hidden && canvas3dState.w > 400,
    `active=${diag3d?.activeView}, mesh=${diag3d?.terrainMeshReady}, hücre=${diag3d?.terrainMeshCellCount}, CPU build=${diag3d?.terrainMeshBuildMs?.toFixed(1)} ms, ilk geçiş=${first3dWallMs} ms`);
  const fpPose = await evaluate(`(() => { const m=window.marswalk,c=m.camera3d,s=m.getSnapshot(); const d=m.getDiagnostics();
    return {mode:c.mode,eyeHeightM:c.eyeHeightM,eyeZ:c.zDisplay,bodyZ:s.astronaut.bodyWorldZM,
      avatarDrawn:d.renderer?.avatarDrawn,triangles:d.renderer?.terrainTriangles}; })()`);
  check('6b Göz hizası first-person pozu geçerli DTM sahnesine bağlı', fpPose.mode === 'first-person' && fpPose.eyeHeightM > 0 &&
    Number.isFinite(fpPose.eyeZ) && Number.isFinite(fpPose.bodyZ) && fpPose.triangles > 0,
    `mode=${fpPose.mode}, eye=${fpPose.eyeHeightM} m, bodyWorldZM=${fpPose.bodyZ}, terrain triangles=${fpPose.triangles}`);
  await shot('05-stage9-3d.png');
  const heapAfter = await send('Runtime.getHeapUsage').then((r) => r.result?.usedSize ?? null);
  const fps = await evaluate(`new Promise(resolve => { let n=0, start=performance.now(); function tick(t){ n++; if(t-start>=2500) resolve({frames:n,elapsedMs:t-start,fps:n*1000/(t-start)}); else requestAnimationFrame(tick); } requestAnimationFrame(tick); })`);
  const frameMs = await evaluate(`window.marswalk.getDiagnostics().renderer?.frameRenderMs ?? null`);
  check('6c 3D frame cadence ölçüldü (başsız tarayıcı)', Number.isFinite(fps?.fps) && fps.fps > 0,
    `${fps?.fps?.toFixed(1)} FPS / ${fps?.frames} kare / ${fps?.elapsedMs?.toFixed(0)} ms; son render=${frameMs?.toFixed?.(2) ?? 'n/a'} ms`);
  check('6d JS heap farkı ölçüldü (GPU belleği dahil değil)', Number.isFinite(heapBefore) && Number.isFinite(heapAfter),
    `heap ${heapBefore ?? 'n/a'} → ${heapAfter ?? 'n/a'} bytes (Δ ${Number.isFinite(heapBefore) && Number.isFinite(heapAfter) ? heapAfter - heapBefore : 'n/a'}); GPU memory API yok`);
  await press('KeyP', 'p');
  const fpBefore = await evaluate(`(() => { const m=window.marswalk; return {x:m.sim.pos.x,y:m.sim.pos.y,yaw:m.camera3d.yawRad}; })()`);
  await keyEvt('keyDown', 'KeyW', 'w'); await sleep(450); await keyEvt('keyUp', 'KeyW', 'w'); await sleep(100);
  const fpAfter = await evaluate(`(() => { const m=window.marswalk,s=m.getSnapshot(),d=m.getDiagnostics(); return {x:m.sim.pos.x,y:m.sim.pos.y,
    yaw:m.camera3d.yawRad,mode:d.cameraMode,grounded:s.astronaut.movement.grounded,status:s.astronaut.elevationStatus,
    cameraX:m.camera3d.xM,cameraY:m.camera3d.yM}; })()`);
  const fpDeltaX = fpAfter.x - fpBefore.x, fpDeltaY = fpAfter.y - fpBefore.y;
  const fpAlong = fpDeltaX * Math.cos(fpBefore.yaw) + fpDeltaY * Math.sin(fpBefore.yaw);
  check('6h Birinci şahıs WASD kamera yönünde hareket ediyor ve geçerli DTM temasını koruyor',
    fpAfter.mode === 'first-person' && fpAlong > 0.5 && fpAfter.grounded && fpAfter.status === 'ok' &&
      Math.abs(fpAfter.cameraX - fpAfter.x) < 1e-6 && Math.abs(fpAfter.cameraY - fpAfter.y) < 1e-6,
    `kamera yönündeki ilerleme=${fpAlong.toFixed(2)} m, grounded=${fpAfter.grounded}, sample=${fpAfter.status}`);
  await evaluate(`document.getElementById('btn-view-2d').click()`); await sleep(100);
  const back2d = await evaluate(`({active:window.marswalk.getDiagnostics().activeView, hidden:document.getElementById('map').hidden})`);
  await evaluate(`document.getElementById('btn-view-3d').click()`); await sleep(150);
  const back3d = await evaluate(`window.marswalk.getDiagnostics()`);
  check('6e 3D→2D→3D tekrar geçişi çalışıyor', back2d.active === '2d' && !back2d.hidden && back3d.activeView === '3d',
    `2D=${back2d.active}, yeniden 3D=${back3d.activeView}`);
  const unknown = await evaluate(`(() => { const m=window.marswalk, L=m.layers.dtm, original=L.sampleSurface; L.sampleSurface=()=>({
    elevation:{status:'unavailable',value:null,unit:'m',verticalDatum:null,source:null,method:null,cell:null,reason:'test-only unknown elevation'},
    slope:{status:'unavailable',value:null,unit:'°',verticalDatum:null,source:null,method:null,window:'3×3',cell:null,reason:'test-only unknown elevation'},zM:null,status:'unavailable'});
    m.updateHud(); return {original: typeof original}; })()`);
  await sleep(150);
  const unknownState = await evaluate(`(() => { const m=window.marswalk,d=m.getDiagnostics(),s=m.getSnapshot(); return {zM:s.astronaut.zM,status:s.astronaut.elevationStatus,
    hud:document.getElementById('v-elev').textContent,avatarDrawn:d.renderer?.avatarDrawn,active:d.activeView}; })()`);
  check('6f Unknown elevation HUD açık, kot null ve avatar çizilmemiş', unknown.original === 'function' && unknownState.zM === null && unknownState.status === 'unavailable' && unknownState.hud.includes('Yükseklik bilinmiyor') && unknownState.avatarDrawn === false,
    `zM=${unknownState.zM}, status=${unknownState.status}, avatarDrawn=${unknownState.avatarDrawn}`);
  await evaluate(`location.reload()`);
  for (let i = 0; i < 100; i++) { const ok = await evaluate('!!(window.marswalk && window.marswalk.layers.dtm.available)').catch(() => false); if (ok) break; await sleep(200); }
  await sleep(300);
  const failureUrl = new URL(debugUrl); failureUrl.searchParams.set('testWebGL2Failure','1');
  await send('Page.navigate', { url: failureUrl.toString() });
  for (let i = 0; i < 100; i++) { const ready = await evaluate('!!window.marswalk').catch(() => false); if (ready) break; await sleep(100); }
  const fallback = await evaluate(`(() => { const d=window.marswalk.getDiagnostics(); return {available:d.rendererAvailable,error:d.rendererError,
    active:d.activeView,canvas2dHidden:document.getElementById('map').hidden,disabled:document.getElementById('btn-view-3d').disabled,
    text:document.getElementById('view-status').textContent}; })()`);
  check('6g WebGL2 init hatasında test-only deterministik 2D fallback çalışıyor', !fallback.available && fallback.active === '2d' && !fallback.canvas2dHidden && fallback.disabled && fallback.text.includes('2D harita kullanılabilir'),
    `${fallback.error}; aktif=${fallback.active}, 2D gizli=${fallback.canvas2dHidden}`);

  await send('Page.navigate', { url: debugUrl.toString() });
  for (let i = 0; i < 100; i++) { const ok = await evaluate('!!(window.marswalk && window.marswalk.layers.dtm.available)').catch(() => false); if (ok) break; await sleep(200); }
  await sleep(300);

  // 1. Opens; map + controls visible + immutable WorldSnapshot check
  const dom = await evaluate(`(() => { const c = document.getElementById('map'); const r = c.getBoundingClientRect(); const snap = window.marswalk.getSnapshot(); return { w: r.width, h: r.height, text: document.body.innerText, dtm: window.marswalk.layers.dtm.available, frozen: Object.isFrozen(snap) && Object.isFrozen(snap.astronaut) && Object.isFrozen(snap.route) && Object.isFrozen(snap.trail), zM: snap.astronaut.zM }; })()`);
  await shot('01-start.png');
  check('1 Uygulama açılıyor; harita kanvası, kontroller ve değiştirilemez WorldSnapshot hazır', dom.w > 400 && dom.h > 300 && dom.frozen && typeof dom.zM === 'number' && dom.zM < -2000 && /WASD|W\s*A\s*S\s*D/.test(dom.text.replace(/\n/g, ' ')) && dom.text.includes('yeniden başlat'), `kanvas ${dom.w}×${dom.h}, DTM=${dom.dtm}, frozen=${dom.frozen}, zM=${dom.zM?.toFixed(2)}`);

  // 2. Keyboard moves astronaut; clock runs; pause; restart
  let s0 = await state();
  let s1 = await holdUntil('KeyS', 's', (s) => s.y < -40);
  check('2a S tuşu konumu değiştiriyor (güneye)', s1.y < s0.y - 30 && Math.abs(s1.x - s0.x) < 1e-6, `y ${s0.y.toFixed(1)} → ${s1.y.toFixed(1)} m`);
  check('2b Senaryo saati ilerliyor', s1.t > 0 && s1.phase === 'running', `t=${s1.t.toFixed(2)} s, faz=${s1.phase}`);
  await press('KeyP', 'p'); const p1 = await state(); await sleep(1000); await keyEvt('keyDown', 'KeyW', 'w'); await sleep(300); await keyEvt('keyUp', 'KeyW', 'w'); const p2 = await state();
  check('2c Duraklatmada saat ve konum duruyor', p1.phase === 'paused' && p2.t === p1.t && p2.y === p1.y, `t ${p1.t.toFixed(2)} → ${p2.t.toFixed(2)}`);
  await press('KeyP', 'p'); await sleep(500); const p3 = await state();
  check('2d Devam edince saat yeniden ilerliyor', p3.phase === 'running' && p3.t > p2.t, `t=${p3.t.toFixed(2)}`);
  await press('Equal', '+'); const z = await state();
  check('2e Yakınlaştırma simülasyon konumunu değiştirmiyor', z.zoom > p3.zoom && z.x === p3.x && z.y === p3.y, `zoom ${p3.zoom.toFixed(2)} → ${z.zoom.toFixed(2)}`);

  // 3. Deviation measured in world metres
  const d1 = await holdUntil('KeyD', 'd', (s) => s.dev > 13);
  await shot('02-deviation.png');
  check('3a Koridor dışı (>10 m) uyarı gösteriliyor', d1.out && d1.banner && d1.dev > 10, `sapma ${d1.dev.toFixed(2)} m, banner=${d1.banner}`);
  check('3b Sapma dünya koordinatında, sonlu segmente en kısa uzaklık', Math.abs(segDist(d1) - d1.dev) < 1e-9, `bağımsız hesap ${segDist(d1).toFixed(3)} m`);
  const d2 = await holdUntil('KeyA', 'a', (s) => s.dev < 5);
  check('3c Koridora dönünce uyarı kalkıyor', !d2.out && !d2.banner, `sapma ${d2.dev.toFixed(2)} m, banner=${d2.banner}`);

  // 4. Elevation / slope sampling statuses
  check('4a Geçerli hücrede kot örnekleniyor', /-25\d\d\.\d\d m \(Mars 2000/.test(d2.elev), d2.elev.slice(0, 90));
  check('4b Geçerli 3×3 komşulukta eğim gösteriliyor', /^\d+\.\d °/.test(d2.slope), d2.slope.slice(0, 60));
  const oob = await evaluate(`(() => { const m = window.marswalk; m.sim.setPosition(1500, 0); m.updateHud(); return { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent }; })()`);
  await sleep(200); await shot('03-out-of-bounds.png');
  check('4c Kapsam dışı konum ve bilinmeyen kot açıkça ayrılıyor', oob.e.includes('Yükseklik bilinmiyor') && oob.e.includes('Kapsam dışı') && oob.s.startsWith('Kapsam dışı'), oob.e.slice(0, 90));
  // No-data: the loaded window contains no no-data cells, so inject the product MISSING_CONSTANT into one in-memory cell (test only).
  const nd = await evaluate(`(() => { const m = window.marswalk, L = m.layers.dtm; m.sim.setPosition(0, -100); const c = m.adapter.localToCell(0, -100);
    const i0 = (c.row - L.rowOffset) * L.cols + (c.col - L.colOffset); const keep = [L.bits[i0], L.bits[i0 + 1]];
    L.bits[i0] = L.noDataBits; m.updateHud(); const centre = { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent };
    L.bits[i0] = keep[0]; L.bits[i0 + 1] = L.noDataBits; m.updateHud(); const neigh = { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent };
    L.bits[i0 + 1] = keep[1]; m.updateHud(); const back = { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent };
    return { centre, neigh, back }; })()`);
  check('4d No-data hücresi kotu bilinmiyor ve "Veri yok" gösteriyor (0 değil)', nd.centre.e.includes('Yükseklik bilinmiyor') && nd.centre.e.includes('Veri yok') && nd.centre.e.includes('no-data') && !/\d+\.\d\d m/.test(nd.centre.e), nd.centre.e.slice(0, 80));
  check('4e Komşu hücre no-data ise eğim üretilmiyor, kot gösteriliyor', /m \(Mars 2000/.test(nd.neigh.e) && nd.neigh.s.startsWith('Veri yok'), nd.neigh.s.slice(0, 80));
  check('4f Geri yüklenince değerler dönüyor', /m \(Mars 2000/.test(nd.back.e) && /°/.test(nd.back.s));

  // 5. Labels and provenance
  const text = await evaluate('document.body.innerText');
  const need = ['Arşiv ürünü', 'Hesaplanan', 'Senaryo/UI', 'Rota kökeni', 'Mars 2000', 'DTEEC_045994_1985_046060_1985_U01', 'Birim',
    'İki tarihsel waypoint arasında sadeleştirilmiş bağlantı; gerçek rover izi değil.', 'Ortogörüntü kullanılamıyor', 'ortogörüntü değil',
    'senaryo varsayımı', 'NASA operasyon sınırı değil', 'yerel equirectangular projeksiyon düzleminde hesaplanır', 'güvenlik sınırı değil'];
  const missing = need.filter((n) => !text.includes(n));
  check('5a Kaynak/birim/datum ve kategori etiketleri görünür', missing.length === 0, missing.length ? 'eksik: ' + missing.join(', ') : `${need.length} etiket bulundu`);
  const disclaimer = 'Kot ve eğim yalnız arşiv DTM’sinden türetilmiş değerlerdir; güvenli/güvensiz yorumu, tehlike skoru veya rover karar desteği değildir.';
  const rest = text.replace(disclaimer, '');
  check('5b Güvenli/güvensiz veya tehlike etiketi yok (yalnız açık feragat metni)', text.includes(disclaimer) && !/güvenli(?!k)|güvensiz|tehlike/i.test(rest), '');

  // Restart
  await press('KeyR', 'r'); const r = await state();
  check('2f Yeniden başlatma başlangıç durumuna dönüyor', r.x === 0 && r.y === 0 && r.t === 0 && r.phase === 'ready', `(${r.x}, ${r.y}), t=${r.t}, faz=${r.phase}`);
  await shot('04-restart.png');
  ws.close();
} catch (e) {
  check('smoke test çalıştı', false, e.stack);
} finally {
  await cleanup();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} kontrol geçti. Ekran görüntüleri: ${outDir}`);
process.exit(failed ? 1 : 0);
