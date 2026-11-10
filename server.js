import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1Adapter } from './d1-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const DB_PATH = process.env.DB_PATH || './data/nai.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

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
  JWT_SECRET: process.env.JWT_SECRET || 'nai-server-secret-change-in-env',
  ALLOW_CUSTOM_LIMITS: process.env.ALLOW_CUSTOM_LIMITS || 'true',
  POLLINATIONS_API_KEY: process.env.POLLINATIONS_API_KEY || ''
};

// 4. Register Routes to Cloudflare Functions handlers
const routeModules = {
  '/generate': './functions/generate.js',
  '/augment': './functions/augment.js',
  '/upscale': './functions/upscale.js',
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

// 6. Convert Node HTTP request to WHATWG Request
async function nodeToWebRequest(req, hostHeader) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const fullUrl = new URL(req.url, `${protocol}://${hostHeader || `localhost:${PORT}`}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  // Populate client IP into headers expected by _auth-manager.js
  const remoteIp = req.headers['x-real-ip'] || 
                   req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                   req.socket.remoteAddress || 
                   '127.0.0.1';
  headers.set('x-real-ip', remoteIp);
  if (!headers.has('CF-Connecting-IP')) {
    headers.set('CF-Connecting-IP', remoteIp);
  }

  const isBodyAllowed = !['GET', 'HEAD'].includes(req.method.toUpperCase());
  let body = undefined;
  if (isBodyAllowed) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
  }

  return new Request(fullUrl, {
    method: req.method,
    headers,
    body,
    duplex: isBodyAllowed ? 'half' : undefined
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeRes.write(value);
    }
  }
  nodeRes.end();
}

// 8. Static File Handler
function serveStaticFile(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  // Security: prevent directory traversal
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return true;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

// 9. Start HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

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
      console.error(`[Server Error] ${req.method} ${pathname}:`, err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
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
});

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 NovelAI Dedicated Backend Server is running!`);
  console.log(`📡 Local Address:   http://localhost:${PORT}`);
  console.log(`🌐 Network Access:  http://${HOST === '0.0.0.0' ? 'YOUR_SERVER_IP' : HOST}:${PORT}`);
  console.log(`🗄️  SQLite Database: ${path.resolve(DB_PATH)}`);
  console.log(`✨ CORS Allowed:    ${CORS_ORIGIN}`);
  console.log(`======================================================\n`);
});
