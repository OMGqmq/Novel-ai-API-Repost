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

function isPrivateOrLocalHost(hostname) {
  const lower = (hostname || '').toLowerCase().trim();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  // Check IPv4
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = parseInt(ipv4Match[1], 10);
    const b = parseInt(ipv4Match[2], 10);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 0) return true; // 0.0.0.0
  }
  // Check IPv6 loopback / link-local / ULA
  if (lower === '::1' || lower === '[::1]' || lower.startsWith('fe80:') || lower.startsWith('fc00:') || lower.startsWith('fd00:')) {
    return true;
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
        const token = authHeader.substring(7);
        const payload = await verifyJwt(token, env.JWT_SECRET);
        if (payload && payload.id) {
          isAuthorized = true;
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
