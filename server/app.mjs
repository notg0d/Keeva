import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTatumRequest } from './gateway.mjs';

const defaultDist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), clipboard-read=(self), clipboard-write=(self)',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https: wss:; frame-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:",
};

function proxyHeaders(headers, removed) {
  const omitted = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authorization',
    'proxy-authenticate', ...String(headers.connection ?? '').toLowerCase().split(',').map((name) => name.trim()), ...removed]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !omitted.has(name.toLowerCase())));
}

function proxyWalrus(request, response) {
  const path = request.url.slice('/gateway/walrus'.length) || '/';
  if (Number(request.headers['content-length'] ?? 0) > 10 * 1024 * 1024) { response.writeHead(413); response.end(); return; }
  const upstream = httpsRequest({ hostname: 'relayer.memory.walrus.xyz', port: 443, path, method: request.method,
    headers: proxyHeaders(request.headers, ['host', 'cookie', 'authorization']), rejectUnauthorized: true,
  }, (remote) => {
    response.writeHead(remote.statusCode ?? 502, proxyHeaders(remote.headers, ['set-cookie', 'cache-control']));
    remote.on('error', () => response.destroy()); remote.pipe(response);
  });
  upstream.setTimeout(120_000, () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', () => {
    if (response.destroyed) return;
    if (response.headersSent) { response.destroy(); return; }
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'WALRUS_UPSTREAM', message: 'The backend could not reach the Walrus relayer.' } }));
  });
  response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
  request.on('error', () => upstream.destroy());
  request.pipe(upstream);
}

async function serveFile(request, response, distDir) {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const root = resolve(distDir);
  let file = resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${sep}`) || pathname.split(/[\/\\]/).some((part) => part.startsWith('.'))) {
    if (pathname !== '/') { response.writeHead(404); response.end(); return; }
  }
  if (pathname === '/') file = resolve(root, 'index.html');
  let info = await stat(file).catch(() => null);
  if ((!info?.isFile()) && !extname(pathname) && !pathname.startsWith('/assets/')) {
    file = resolve(root, 'index.html'); info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size,
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' });
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(file);
  stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
}

export function createAppServer({ distDir = defaultDist, recoveryEndpoint = process.env.TATUM_GRAPHQL_RECOVERY_URL || '' } = {}) {
  return createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, async (request, response) => {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    try {
      if (await handleTatumRequest(request, response, { recoveryEndpoint })) return;
      const pathname = request.url?.split('?')[0] ?? '';
      if (pathname === '/gateway/walrus' || pathname.startsWith('/gateway/walrus/')) { proxyWalrus(request, response); return; }
      if (pathname.startsWith('/api/') || pathname.startsWith('/gateway/')) {
        response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unknown gateway route.' } })); return;
      }
      await serveFile(request, response, distDir);
    } catch {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('The application server could not complete this request.');
    }
  });
}
