// Visual harness (scratchpad only). Usage: node shoot.mjs <prefix> [extraQuery] [views=comma list]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SIM = 'c:/Users/efese/Desktop/Nasaspaceapps/Sim';
const OUT = 'C:/Users/efese/AppData/Local/Temp/claude/95fe7bc92ea59d43/8f5c2ec4-3cd4-45ba-b2aa-e64e9fc874df/scratchpad/visual';
const prefix = process.argv[2] ?? 'after';
const extra = process.argv[3] ?? '';
const only = process.argv[4] ? process.argv[4].split(',') : null;
const PORT = 8191, DBG = 9444;
const profile = path.join(OUT, '.profile-' + prefix);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browserPath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const server = spawn(process.execPath, [path.join(SIM, 'server.mjs')], { cwd: SIM, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(700);
const browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, '--window-size=1600,1000', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const errors = [];
try {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('console: ' + m.params.entry.text + (m.params.entry.url ? ' (' + m.params.entry.url + ')' : ''));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?debug=1${extra ? '&' + extra : ''}` });
  for (let i = 0; i < 150; i++) { const ok = await evaluate('!!(window.marswalk && window.marswalk.layers.dtm.available)').catch(() => false); if (ok) break; await sleep(200); }
  await sleep(500);
  await evaluate(`document.getElementById('btn-view-3d').click()`);
  let diag = null;
  for (let i = 0; i < 150; i++) { diag = await evaluate('window.marswalk.getDiagnostics()').catch(() => null); if (diag?.activeView === '3d' && diag.renderer) break; await sleep(100); }
  await sleep(3500); // let ortho tiles stream
  const gpu = await evaluate(`(() => { const c=document.createElement('canvas'); const g=c.getContext('webgl2'); const e=g.getExtension('WEBGL_debug_renderer_info'); return e? g.getParameter(e.UNMASKED_RENDERER_WEBGL):'n/a'; })()`);
  console.log('GPU:', gpu);
  const sun = await evaluate(`(() => { const d = window.marswalk.getDiagnostics(); return d.renderer?.lighting?.sunDirection ?? null; })()`);
  const base = await evaluate('({yaw: window.marswalk.camera3d.yawRad, pitch: window.marswalk.camera3d.pitchRad})');
  const sunAz = sun ? Math.atan2(sun[1], sun[0]) : base.yaw;
  const views = {
    overview: [base.yaw, base.pitch],
    'fp-toward-sun': [sunAz, 0.12],
    'fp-horizon-away': [sunAz + Math.PI, 0.02],
    'fp-lookdown': [base.yaw, -1.15],
    'fp-side': [sunAz + Math.PI / 2, 0.0],
    'fp-sky': [sunAz, 0.85],
  };
  for (const [name, [yaw, pitch]] of Object.entries(views)) {
    if (only && !only.includes(name)) continue;
    await evaluate(`(() => { const c = window.marswalk.camera3d; c.yawRad = ${yaw}; c.pitchRad = ${pitch}; })()`);
    await sleep(900);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `${prefix}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  }
  const fps = await evaluate(`new Promise(resolve => { let n=0, start=performance.now(); function tick(t){ n++; if(t-start>=3000) resolve({frames:n,elapsedMs:t-start,fps:n*1000/(t-start)}); else requestAnimationFrame(tick); } requestAnimationFrame(tick); })`);
  const samples = [];
  for (let i = 0; i < 40; i++) { const d = await evaluate('window.marswalk.getDiagnostics().renderer'); if (d) samples.push(d.frameRenderMs); await sleep(40); }
  samples.sort((a, b) => a - b);
  console.log(`FPS ${fps.fps.toFixed(1)} (${fps.frames} frames / ${fps.elapsedMs.toFixed(0)} ms)`);
  console.log(`frameRenderMs median=${samples[Math.floor(samples.length / 2)]?.toFixed(2)} p90=${samples[Math.floor(samples.length * 0.9)]?.toFixed(2)}`);
  const finalDiag = await evaluate('window.marswalk.getDiagnostics()');
  console.log('rendererError:', finalDiag.rendererError, 'terrainTriangles:', finalDiag.renderer?.terrainTriangles);
  console.log('lighting:', JSON.stringify(finalDiag.renderer?.lighting));
  console.log('renderTimingMs:', JSON.stringify(finalDiag.renderer?.renderTimingMs));
  console.log('shadowResolution:', finalDiag.renderer?.shadowResolution);
  console.log('errors:', errors.length ? errors.join('\n  ') : 'none');
} finally {
  try { browser.kill(); } catch {}
  try { server.kill(); } catch {}
  await sleep(800);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(0);
