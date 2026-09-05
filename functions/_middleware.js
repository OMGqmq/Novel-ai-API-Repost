export async function onRequest(context) {
  // CORS Preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-admin-token, x-user-key, x-custom-api-key',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  try {
    const response = await context.next();
    const newHeaders = new Headers(response.headers);
    if (!newHeaders.has('Access-Control-Allow-Origin')) {
      newHeaders.set('Access-Control-Allow-Origin', '*');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: err.status || 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
