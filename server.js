import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1Adapter } from './d1-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REAL_ROOT_DIR = fs.realpathSync(__dirname);

// 1. Lightweight .env loader (zero external dependency)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || (process.env.VITEST ? ':memory:' : './data/nai.db');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const MAX_BODY_BYTES = (() => {
  const parsed = parseInt(process.env.MAX_BODY_BYTES || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
})();

function resolveJwtSecret() {
  const configured = (process.env.JWT_SECRET || '').trim();
  if (configured) return configured;
  if (!process.env.VITEST) {
    console.warn('[Security] WARNING: JWT_SECRET is not set. Using an ephemeral random secret; existing login sessions will invalidate on restart.');
  }
  return crypto.randomBytes(32).toString('hex');
}

// 2. Initialize Database with D1 Adapter
console.log(`[DB] Initializing SQLite database at ${DB_PATH}...`);
const d1 = new D1Adapter(DB_PATH);
d1.initSchema(path.join(__dirname, 'init_db.sql'));
console.log(`[DB] Database schema verified & ready.`);

// 3. Environment context bindings (matches Cloudflare Worker context.env)
const env = {
  DB: d1,
  NOVELAI_API_KEY: process.env.NOVELAI_API_KEY || '',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
  JWT_SECRET: resolveJwtSecret(),
  ALLOW_CUSTOM_LIMITS: process.env.ALLOW_CUSTOM_LIMITS || 'true',
  POLLINATIONS_API_KEY: process.env.POLLINATIONS_API_KEY || ''
};

// 4. Register Routes to Cloudflare Functions handlers
const routeModules = {
  '/generate': './functions/generate.js',
  '/augment': './functions/augment.js',
  '/upscale': './functions/upscale.js',
  '/encode-vibe': './functions/encode-vibe.js',
  '/verify-key': './functions/verify-key.js',
  '/danbooru': './functions/danbooru.js',
  '/api/auth/login': './functions/api/auth/login.js',
  '/api/auth/register': './functions/api/auth/register.js',
  '/api/auth/profile': './functions/api/auth/profile.js',
  '/api/auth/recharge': './functions/api/auth/recharge.js',
  '/api/admin/users': './functions/api/admin/users.js',
  '/api/admin/users/approve': './functions/api/admin/users/approve.js',
  '/api/admin/cards/generate': './functions/api/admin/cards/generate.js',
  '/api/admin/stats': './functions/api/admin/stats.js',
  '/api/chat-proxy': './functions/api/chat-proxy.js'
};

const routeHandlers = new Map();
for (const [routePath, moduleRelativePath] of Object.entries(routeModules)) {
  const mod = await import(moduleRelativePath);
  const handler = mod.onRequest || mod.onRequestPost || mod.onRequestGet || mod.default;
  if (typeof handler === 'function') {
    routeHandlers.set(routePath, handler);
  }
}

// 5. MIME Types for Static File Serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

const PUBLIC_STATIC_FILES = new Set([
  'index.html',
  'classified_tags.json',
  'gallery_index.json'
]);
const PUBLIC_STATIC_DIRS = new Set(['src', 'images', 'presets']);

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function sanitizeHostHeader(hostHeader) {
  const candidate = String(hostHeader || '').trim();
  if (/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(candidate) || /^\[[0-9a-fA-F:]+\](?::\d{1,5})?$/.test(candidate)) {
    return candidate;
  }
  return `localhost:${PORT}`;
}

function extractClientIp(req) {
  const socketIp = req.socket?.remoteAddress || '127.0.0.1';
  if (!TRUST_PROXY) return socketIp;
  const forwarded = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
  return req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || forwarded || socketIp;
}

async function readRequestBody(req) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw createHttpError(413, 'Payload Too Large');
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      if (typeof req.destroy === 'function') req.destroy();
      throw createHttpError(413, 'Payload Too Large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

// 6. Convert Node HTTP request to WHATWG Request
async function nodeToWebRequest(req, hostHeader) {
  const rawProto = TRUST_PROXY ? String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() : 'http';
  const protocol = rawProto === 'https' || rawProto === 'http' ? rawProto : 'http';
  const safeHost = sanitizeHostHeader(hostHeader);

  let fullUrl;
  try {
    fullUrl = new URL(req.url || '/', `${protocol}://${safeHost}`);
  } catch (_) {
    throw createHttpError(400, 'Malformed Request URL');
  }
  if (fullUrl.host !== safeHost) {
    throw createHttpError(400, 'Invalid Request URL');
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  // Strip untrusted client-supplied proxy headers unless TRUST_PROXY is explicitly enabled
  const remoteIp = String(extractClientIp(req)).trim();
  if (!TRUST_PROXY) {
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-proto');
  }
  headers.set('x-real-ip', remoteIp);
  headers.set('CF-Connecting-IP', remoteIp);

  const isBodyAllowed = !['GET', 'HEAD'].includes((req.method || 'GET').toUpperCase());
  const body = isBodyAllowed ? await readRequestBody(req) : undefined;

  return new Request(fullUrl, {
    method: req.method,
    headers,
    body,
    duplex: isBodyAllowed ? 'half' : undefined
  });
}

function waitForDrainOrClose(nodeRes) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (canContinue) => {
      if (settled) return;
      settled = true;
      nodeRes.removeListener('drain', onDrain);
      nodeRes.removeListener('close', onClose);
      nodeRes.removeListener('error', onClose);
      resolve(canContinue);
    };
    const onDrain = () => done(true);
    const onClose = () => done(false);
    nodeRes.once('drain', onDrain);
    nodeRes.once('close', onClose);
    nodeRes.once('error', onClose);
  });
}

// 7. Write WHATWG Response to Node HTTP response
async function writeWebResponse(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;

  webRes.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value);
  });

  // Ensure CORS headers are present
  if (!nodeRes.getHeader('Access-Control-Allow-Origin')) {
    nodeRes.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  }
  nodeRes.setHeader('Access-Control-Expose-Headers', 'X-User-Role, Content-Disposition');

  if (webRes.body) {
    const reader = webRes.body.getReader();
    let aborted = false;
    const onClose = () => {
      aborted = true;
      reader.cancel().catch(() => {});
    };
    if (typeof nodeRes.once === 'function') {
      nodeRes.once('close', onClose);
    }
    try {
      while (!aborted && !nodeRes.destroyed && !nodeRes.writableEnded) {
        const { done, value } = await reader.read();
        if (done || aborted || nodeRes.destroyed) break;
        const ok = nodeRes.write(value);
        if (!ok) {
          const canContinue = await waitForDrainOrClose(nodeRes);
          if (!canContinue) break;
        }
      }
    } finally {
      if (typeof nodeRes.removeListener === 'function') {
        nodeRes.removeListener('close', onClose);
      }
      if (aborted) {
        await reader.cancel().catch(() => {});
      }
    }
  }
  if (!nodeRes.destroyed && !nodeRes.writableEnded) {
    nodeRes.end();
  }
}

function resolvePublicStaticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname || '/');
  } catch (_) {
    return { status: 400, filePath: null };
  }

  if (decoded.includes('\0') || decoded.includes('\\')) {
    return { status: 403, filePath: null };
  }

  const normalized = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (segments.length === 0 || segments.some(seg => !seg || seg === '.' || seg === '..' || seg.startsWith('.'))) {
    return { status: 403, filePath: null };
  }

  const isAllowedRootFile = segments.length === 1 && PUBLIC_STATIC_FILES.has(segments[0]);
  const isAllowedPublicDir = segments.length > 1 && PUBLIC_STATIC_DIRS.has(segments[0]);
  if (!isAllowedRootFile && !isAllowedPublicDir) {
    return { status: 403, filePath: null };
  }

  const candidatePath = path.resolve(REAL_ROOT_DIR, ...segments);
  const rel = path.relative(REAL_ROOT_DIR, candidatePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { status: 403, filePath: null };
  }

  if (!fs.existsSync(candidatePath)) {
    return { status: 404, filePath: null };
  }

  let realFilePath;
  try {
    realFilePath = fs.realpathSync(candidatePath);
  } catch (_) {
    return { status: 404, filePath: null };
  }
  const realRel = path.relative(REAL_ROOT_DIR, realFilePath);
  if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel)) {
    return { status: 403, filePath: null };
  }

  const stat = fs.statSync(realFilePath);
  if (!stat.isFile()) {
    return { status: 403, filePath: null };
  }

  return { status: 200, filePath: realFilePath };
}

// 8. Static File Handler (strict allowlist prevents exposing .env, SQLite DB, server code, or backend routes)
function serveStaticFile(req, res, pathname) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  const resolved = resolvePublicStaticFile(pathname);
  if (resolved.status === 400 || resolved.status === 403) {
    res.statusCode = resolved.status;
    res.end(resolved.status === 400 ? 'Bad Request' : 'Forbidden');
    return true;
  }
  if (!resolved.filePath) {
    return false;
  }

  const ext = path.extname(resolved.filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(resolved.filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    } else if (!res.destroyed) {
      res.destroy();
    }
  });
  if (typeof res.once === 'function') {
    res.once('close', () => stream.destroy());
  }
  stream.pipe(res);
  return true;
}

// 9. Start HTTP Server
async function handleHttpRequest(req, res) {
  let pathname;
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    if (parsedUrl.origin !== 'http://localhost') {
      throw createHttpError(400, 'Invalid Request URL');
    }
    pathname = parsedUrl.pathname;
  } catch (_) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.end(JSON.stringify({ error: 'Invalid Request URL' }));
    return;
  }

  // Global CORS Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-user-key, x-custom-api-key, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'X-User-Role, Content-Disposition');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return;
  }

  // Check if route matches an API endpoint
  const handler = routeHandlers.get(pathname);
  if (handler) {
    try {
      const webReq = await nodeToWebRequest(req, req.headers.host);
      const context = {
        request: webReq,
        env,
        waitUntil: (p) => {
          if (p && typeof p.then === 'function') {
            p.catch(err => console.error('[waitUntil error]:', err));
          }
        },
        next: async () => {},
        data: {}
      };

      const webRes = await handler(context);
      await writeWebResponse(webRes, res);
    } catch (err) {
      const status = err?.statusCode || 500;
      if (status >= 500) {
        console.error(`[Server Error] ${req.method} ${pathname}:`, err);
      }
      if (!res.headersSent) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
      }
      if (!res.destroyed && !res.writableEnded) {
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
    }
    return;
  }

  // Otherwise, serve static files for standalone UI hosting
  const served = serveStaticFile(req, res, pathname);
  if (!served) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.end(JSON.stringify({ error: `Not Found: ${pathname}` }));
  }
}

const server = http.createServer(handleHttpRequest);

if (!process.env.VITEST) {
  server.listen(PORT, HOST, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 NovelAI Dedicated Backend Server is running!`);
    console.log(`📡 Local Address:   http://localhost:${PORT}`);
    console.log(`🌐 Network Access:  http://${HOST === '0.0.0.0' ? 'YOUR_SERVER_IP' : HOST}:${PORT}`);
    console.log(`🗄️  SQLite Database: ${path.resolve(DB_PATH)}`);
    console.log(`✨ CORS Allowed:    ${CORS_ORIGIN}`);
    console.log(`======================================================\n`);
  });
}

export {
  env,
  d1,
  routeHandlers,
  serveStaticFile,
  resolvePublicStaticFile,
  nodeToWebRequest,
  writeWebResponse,
  handleHttpRequest,
  server,
  PORT,
  HOST,
  MAX_BODY_BYTES
};
