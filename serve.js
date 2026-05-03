/**
 * serve.js — שרת סטטי פשוט ל-GTFS Explorer
 *
 * הרצה מתיקיית השורש של הפרויקט:
 *   node test_wasm_app/serve.js
 *
 * ואז פתח בדפדפן:
 *   http://localhost:8080/test_wasm_app/
 */

import http  from 'http';
import https from 'https';
import fs    from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = 3000;
const ROOT = path.resolve(__dirname, '..');

// Domains allowed to proxy (security whitelist)
const PROXY_ALLOWLIST = ['gtfs.mot.gov.il'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.txt':  'text/plain; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip':  'application/zip',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const COMMON_HEADERS = {
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length',
};

http.createServer((req, res) => {
  // ── Handle CORS preflight ──────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, COMMON_HEADERS);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const urlPath   = parsedUrl.pathname;

  // ── Proxy endpoint ─────────────────────────────
  if (urlPath === '/proxy') {
    const target = parsedUrl.searchParams.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url param'); return; }
    let host;
    try { host = new URL(target).hostname; } catch { res.writeHead(400); res.end('Bad url'); return; }
    if (!PROXY_ALLOWLIST.some(a => host === a || host.endsWith('.' + a))) {
      res.writeHead(403); res.end('Host not allowed'); return;
    }
    const proto = target.startsWith('https') ? https : http;
    const preq  = proto.get(target, { headers: { 'User-Agent': 'GTFS-Explorer/1.0' } }, pres => {
      res.writeHead(pres.statusCode, {
        ...COMMON_HEADERS,
        'Content-Type': pres.headers['content-type'] || 'application/octet-stream',
        ...(pres.headers['content-length'] ? { 'Content-Length': pres.headers['content-length'] } : {}),
      });
      pres.pipe(res);
    });
    preq.on('error', e => { res.writeHead(502); res.end(e.message); });
    return;
  }

  // ── Static file serving ────────────────────────
  let servePath = urlPath;
  if (servePath === '/' || servePath === '') servePath = '/test_wasm_app/index.html';
  if (servePath.endsWith('/')) servePath += 'index.html';

  const filePath = path.resolve(ROOT, '.' + servePath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (statErr, stats) => {
    const target = (!statErr && stats && stats.isDirectory())
      ? path.join(filePath, 'index.html')
      : filePath;

    fs.stat(target, (err2, fstat) => {
      if (err2) {
        res.writeHead(err2.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
        res.end(err2.code === 'ENOENT' ? `Not found: ${servePath}` : `Server error: ${err2.message}`);
        return;
      }
      const ext      = path.extname(target).toLowerCase();
      const mimeType = MIME[ext] || 'application/octet-stream';
      const fileSize = fstat.size;
      const rangeHdr = req.headers.range;

      if (rangeHdr) {
        // ── Range request (DuckDB HTTP streaming) ──
        const [, startStr, endStr] = /bytes=(\d*)-(\d*)/.exec(rangeHdr) || [];
        const start = startStr ? parseInt(startStr, 10) : 0;
        const end   = endStr   ? parseInt(endStr,   10) : fileSize - 1;
        if (start > end || end >= fileSize) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
          res.end(); return;
        }
        res.writeHead(206, {
          ...COMMON_HEADERS,
          'Content-Type':   mimeType,
          'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': end - start + 1,
          'Accept-Ranges':  'bytes',
        });
        fs.createReadStream(target, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          ...COMMON_HEADERS,
          'Content-Type':  mimeType,
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(target).pipe(res);
      }
    });
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  GTFS Explorer — DuckDB WASM Spatial');
  console.log('  ─────────────────────────────────────');
  console.log(`  http://localhost:${PORT}/test_wasm_app/`);
  console.log('');
  console.log('  Ctrl+C לעצירה');
  console.log('  Proxy: /proxy?url=https://gtfs.mot.gov.il/...');
});
