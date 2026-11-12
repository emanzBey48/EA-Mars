// Minimal static file server (Node standard library only). Serves public/ at / and data/ at /data/.
// Usage: node server.mjs   (PORT env var optional, default 8080; binds to 127.0.0.1)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(root, 'public');
const DATA = path.join(root, 'data');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.f32': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const [base, rel] = urlPath.startsWith('/data/') ? [DATA, urlPath.slice(6)] : [PUBLIC, urlPath.slice(1)];
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Marswalk: http://127.0.0.1:${PORT}/`));
