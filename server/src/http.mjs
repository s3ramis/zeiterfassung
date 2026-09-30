import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function sendJson(response, status, payload) {
  response.setHeader('Cache-Control', 'no-store');
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

export async function readJson(request, maxBytes = 8 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Anfrage ist zu groß.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Ungültiges JSON.'), { statusCode: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Die Anfrage muss ein JSON-Objekt enthalten.'), { statusCode: 400 });
  }
  return parsed;
}

export function applyCors(request, response) {
  const origin = request.headers.origin;
  const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((value) => value.trim());
  // CORS headers alone do not stop cross-origin requests reaching local services.
  if (origin && !allowed.includes(origin) && !allowed.includes('*')) return false;
  if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  return true;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

export function serveFrontend(request, response) {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  if (!fs.existsSync(dist)) return false;
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(dist, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(dist)) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(dist, 'index.html');
  const extension = path.extname(filePath);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Cache-Control': extension === '.html' || path.basename(filePath) === 'sw.js' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(response);
  return true;
}
