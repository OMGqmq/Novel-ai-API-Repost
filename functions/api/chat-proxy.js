/**
 * Cloudflare Pages Functions AI Chat Proxy
 * Forwards chat completions with Anti-SSRF, HTTPS enforcement, and authorization checks.
 */
import { verifyJwt } from '../_crypto-helper.js';

const TRUSTED_AI_HOSTS = new Set([
  'api.openai.com',
  'api.deepseek.com',
  'api.siliconflow.cn',
  'openrouter.ai',
  'api.groq.com',
  'api.together.xyz',
  'api.mistral.ai',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.cohere.ai',
  'api.perplexity.ai',
  'api.minimax.chat',
  'dashscope.aliyuncs.com',
  'api.moonshot.cn',
  'api.baichuan-ai.com',
  'api.stepfun.com',
  'api.zhipuai.cn'
]);

function isPrivateIpv4Octets(a, b) {
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // 224.0.0.0+ multicast / reserved
  return false;
}

function parseIpv6Hextets(rawHost) {
  let host = rawHost;
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  const zoneIdx = host.indexOf('%');
  if (zoneIdx !== -1) {
    host = host.slice(0, zoneIdx);
  }
  if (!host.includes(':')) return null;

  const doubleColonParts = host.split('::');
  if (doubleColonParts.length > 2) return null;

  const parseSegmentGroup = (group) => {
    if (!group) return [];
    const tokens = group.split(':');
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok) return null;
      if (tok.includes('.')) {
        if (i !== tokens.length - 1) return null;
        const m = tok.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return null;
        const octs = m.slice(1).map(n => parseInt(n, 10));
        if (octs.some(n => n < 0 || n > 255)) return null;
        out.push((octs[0] << 8) | octs[1], (octs[2] << 8) | octs[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(tok)) return null;
        out.push(parseInt(tok, 16));
      }
    }
    return out;
  };

  if (doubleColonParts.length === 1) {
    const segs = parseSegmentGroup(host);
    return segs && segs.length === 8 ? segs : null;
  }

  const head = parseSegmentGroup(doubleColonParts[0]);
  const tail = parseSegmentGroup(doubleColonParts[1]);
  if (!head || !tail) return null;
  const zeroFill = 8 - (head.length + tail.length);
  if (zeroFill < 1) return null;
  return [...head, ...new Array(zeroFill).fill(0), ...tail];
}

export function isPrivateOrLocalHost(hostname) {
  const lower = (hostname || '').toLowerCase().trim().replace(/\.+$/, '');
  if (!lower) return true;
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }

  // Check IPv4
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = parseInt(ipv4Match[1], 10);
    const b = parseInt(ipv4Match[2], 10);
    const c = parseInt(ipv4Match[3], 10);
    const d = parseInt(ipv4Match[4], 10);
    if ([a, b, c, d].some(n => n < 0 || n > 255)) return true;
    return isPrivateIpv4Octets(a, b);
  }

  // Check bracketed/unbracketed IPv6 literals cleanly
  if (lower.includes(':') || (lower.startsWith('[') && lower.endsWith(']'))) {
    const hextets = parseIpv6Hextets(lower);
    if (!hextets) return true; // Fail closed on malformed IPv6

    const isAllZeroPrefix6 = hextets.slice(0, 6).every(h => h === 0);
    const isAllZeroPrefix7 = isAllZeroPrefix6 && hextets[6] === 0;
    if (isAllZeroPrefix7 && (hextets[7] === 0 || hextets[7] === 1)) {
      return true; // :: unspecified or ::1 loopback
    }
    if ((hextets[0] & 0xfe00) === 0xfc00) {
      return true; // fc00::/7 Unique Local Address (fc00..fdff)
    }
    if ((hextets[0] & 0xffc0) === 0xfe80) {
      return true; // fe80::/10 link-local
    }
    if ((hextets[0] & 0xff00) === 0xff00) {
      return true; // ff00::/8 multicast
    }
    // IPv4-mapped (::ffff:0:0/96) or IPv4-compatible (::/96)
    const isIpv4Mapped = hextets.slice(0, 5).every(h => h === 0) && (hextets[5] === 0xffff || hextets[5] === 0);
    if (isIpv4Mapped) {
      const a = (hextets[6] >> 8) & 0xff;
      const b = hextets[6] & 0xff;
      return isPrivateIpv4Octets(a, b);
    }
  }

  return false;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token, x-custom-api-key'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { endpoint, apiKey, body } = await request.json();
    if (!endpoint || typeof endpoint !== 'string') {
      return new Response(JSON.stringify({ error: '缺少或无效的目标端点 (endpoint)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetUrl;
    try {
      targetUrl = new URL(endpoint);
    } catch {
      return new Response(JSON.stringify({ error: '目标端点不是有效的 URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 1. 协议强制为 HTTPS
    if (targetUrl.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: '安全限制：代理端点必须使用 HTTPS 协议' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 2. 防 SSRF：阻断私网与内网地址
    if (isPrivateOrLocalHost(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: '安全限制：禁止请求本地或私有内部网络' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 3. 白名单与权限校验
    const host = targetUrl.hostname.toLowerCase();
    const isTrusted = TRUSTED_AI_HOSTS.has(host) || Array.from(TRUSTED_AI_HOSTS).some(th => host.endsWith('.' + th));

    if (!isTrusted) {
      // 访问非主流公共 AI 提供商时，必须校验管理员密码或已登录用户身份
      const adminToken = (request.headers.get('x-admin-token') || '').trim();
      const serverAdminToken = (env?.ADMIN_TOKEN || '').trim();
      const authHeader = (request.headers.get('Authorization') || '').trim();
      let isAuthorized = !!(serverAdminToken && adminToken === serverAdminToken);

      if (!isAuthorized && authHeader.startsWith('Bearer ') && env?.JWT_SECRET) {
        const token = authHeader.substring(7).trim();
        const payload = await verifyJwt(token, env.JWT_SECRET);
        if (payload && payload.id) {
          if (env?.DB) {
            const user = await env.DB.prepare('SELECT status FROM users WHERE id = ?').bind(payload.id).first();
            if (user && user.status === 'Approved') {
              isAuthorized = true;
            }
          } else {
            isAuthorized = true;
          }
        }
      }

      if (!isAuthorized) {
        return new Response(JSON.stringify({ error: '安全限制：自定义 AI 端点仅限登录用户或管理员使用' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }

    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });

    const respHeaders = new Headers(upstreamResponse.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: respHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Chat proxy failure' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
