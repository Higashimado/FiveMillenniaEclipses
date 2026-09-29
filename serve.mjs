// Static file server for local preview; run with `npm start` (port 8002, or pass another as the first argument).
import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const portArg = process.argv.find(a => /^\d{4,5}$/.test(a));
const PORT = Number(portArg || process.env.PORT || 8002);
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      const idx = path.join(file, 'index.html');
      return fs.stat(idx, (e2, st2) => {
        if (e2 || !st2.isFile()) { res.writeHead(404).end('not found: ' + url); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        fs.createReadStream(idx).pipe(res);
      });
    }
    if (err || !st.isFile()) { res.writeHead(404).end('not found: ' + url); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${ROOT} → http://localhost:${PORT}/`);
});
