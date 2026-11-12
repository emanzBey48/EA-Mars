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
  check('4c Kapsam dışı konum açıkça ayrılıyor', oob.e.startsWith('Kapsam dışı') && oob.s.startsWith('Kapsam dışı'), oob.e.slice(0, 90));
  // No-data: the loaded window contains no no-data cells, so inject the product MISSING_CONSTANT into one in-memory cell (test only).
  const nd = await evaluate(`(() => { const m = window.marswalk, L = m.layers.dtm; m.sim.setPosition(0, -100); const c = m.adapter.localToCell(0, -100);
    const i0 = (c.row - L.rowOffset) * L.cols + (c.col - L.colOffset); const keep = [L.bits[i0], L.bits[i0 + 1]];
    L.bits[i0] = L.noDataBits; m.updateHud(); const centre = { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent };
    L.bits[i0] = keep[0]; L.bits[i0 + 1] = L.noDataBits; m.updateHud(); const neigh = { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent };
    L.bits[i0 + 1] = keep[1]; m.updateHud(); const back = { e: document.getElementById('v-elev').textContent, s: document.getElementById('v-slope').textContent };
    return { centre, neigh, back }; })()`);
  check('4d No-data hücresi "Veri yok" gösteriyor (0 değil)', nd.centre.e.startsWith('Veri yok') && !/\d+\.\d\d m/.test(nd.centre.e), nd.centre.e.slice(0, 80));
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
