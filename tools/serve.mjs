#!/usr/bin/env node
// Minimal static file server for previewing dist/ locally.  Usage: node tools/serve.mjs [port] [dir]
// Mirrors GitHub Pages: folders serve their index.html, unknown paths serve 404.html with status 404.
// Build with `npm run build:local` first so absolute URLs point at http://localhost:4173.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf',
};

function resolveFile(dir, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  const target = normalize(join(dir, decoded));
  if (target !== dir && !target.startsWith(dir + sep)) return null; // never leave the served folder
  if (existsSync(target) && statSync(target).isDirectory()) {
    const index = join(target, 'index.html');
    return existsSync(index) ? index : null;
  }
  return existsSync(target) && statSync(target).isFile() ? target : null;
}

export function createStaticServer(dir) {
  return createServer((req, res) => {
    const file = resolveFile(dir, req.url ?? '/');
    const status = file ? 200 : 404;
    const served = file ?? join(dir, '404.html');
    if (!existsSync(served)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(status, { 'content-type': TYPES[extname(served)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(served).pipe(res);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  const dir = resolve(process.argv[3] ?? join(ROOT, 'dist'));
  createStaticServer(dir).listen(port, '127.0.0.1', () => console.log(`Serving ${dir} at http://localhost:${port}/ (Ctrl+C to stop)`));
}
