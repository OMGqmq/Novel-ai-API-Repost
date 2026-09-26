/**
 * Minimal Cloudflare Pages Functions AI Chat Proxy
 * Forwards chat completions to avoid browser CORS restrictions.
 */
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { endpoint, apiKey, body } = await request.json();
    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'Missing target endpoint' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
