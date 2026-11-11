import { authenticate, AuthError } from './_auth-manager.js';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { request, env } = context;

  try {
    const auth = await authenticate(request, env);
    const { apiKey, userRole } = auth;

    // 安全检查：只有具备自定义 API Key 或者是管理员才能调用官方 encode-vibe 扣除 Anlas
    const allowBypass = env.ALLOW_CUSTOM_LIMITS !== 'false';
    const isRestricted = (userRole !== 'CustomAPI' && userRole !== 'Admin') || !allowBypass;

    if (isRestricted) {
      throw new AuthError("氛围编码功能会消耗官方 Anlas 算力，仅限自定义 API Key 或管理员使用", 403);
    }

    const data = await request.json();
    let image = data.image;
    if (!image) {
      throw new Error("Missing image parameter for encode-vibe");
    }

    // 去除 data:image 前缀
    if (image.includes(',')) {
      image = image.split(',')[1];
    }

    const rawModel = (data.model || data.version || 'v4.5').toLowerCase();
    let modelName = 'nai-diffusion-4-5-full';
    if (rawModel.includes('4-5') || rawModel.includes('4.5')) {
      modelName = 'nai-diffusion-4-5-full';
    } else if (rawModel.includes('4')) {
      modelName = 'nai-diffusion-4-full';
    }

    const info = data.information_extracted !== undefined && !isNaN(data.information_extracted)
      ? parseFloat(data.information_extracted)
      : 1.0;

    const upstreamRes = await fetch('https://image.novelai.net/ai/encode-vibe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        image,
        model: modelName,
        information_extracted: info
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.message) errMsg = parsed.message;
      } catch (e) {}
      return new Response(JSON.stringify({ error: `NovelAI Vibe 编码失败: ${errMsg}` }), {
        status: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const arrayBuf = await upstreamRes.arrayBuffer();
    const encodingBase64 = arrayBufferToBase64(arrayBuf);

    return new Response(JSON.stringify({
      success: true,
      encoding: encodingBase64,
      info,
      model: modelName
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': encodeURIComponent(userRole)
      }
    });

  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
