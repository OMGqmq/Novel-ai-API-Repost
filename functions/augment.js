import { authenticate, AuthError } from './_auth-manager.js';

export async function onRequest(context) {
  // 只允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { request, env, waitUntil } = context;

    // 🛡️ 1. 鉴权与限流 (由 AuthManager 处理)
    const auth = await authenticate(request, env);
    const { apiKey, userRole, isVip, userKey, remainingCredits, recordUsage } = auth;

    // 2. 获取请求数据
    const data = await request.json();

    // 3. 解析 augment 参数
    const req_type = data.req_type; // 'sketch', 'lineart', 'bg-removal', 'colorize'
    const width = parseInt(data.width) || 832;
    const height = parseInt(data.height) || 1216;
    const image = data.image; // base64

    if (!req_type || !image) {
      throw new Error("Missing req_type or image parameter");
    }

    const allowBypass = env.ALLOW_CUSTOM_LIMITS !== 'false';
    const isRestricted = (userRole !== 'CustomAPI' && userRole !== 'Admin') || !allowBypass;
    if (isRestricted && (width * height > 1048576 + 50000)) {
      throw new Error("分辨率超出 Opus 免费限制");
    }

    // 4. 构建请求体
    const payload = {
      req_type,
      width,
      height,
      image
    };

    if (req_type === 'colorize' && data.prompt) {
      payload.prompt = data.prompt;
      payload.defry = data.defry || 0;
    }

    // 5. 请求 NovelAI
    const NAI_URL = 'https://image.novelai.net/ai/augment-image';
    const response = await fetch(NAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "服务器 Anlas 余额不足，请联系管理员。" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    // 6. 成功后的副作用 (扣费或记录限流)
    if (isVip && userKey && remainingCredits > 0 && userRole.startsWith("VIP")) {
      // VIP 扣费
      waitUntil(env.DB.prepare("UPDATE cards SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP WHERE card_key = ? AND credits > 0").bind(userKey).run());
    } else if (!isVip && recordUsage) {
      // 免费用户限流记录
      await recordUsage(waitUntil);
    }

    // 7. 透传响应 (ZIP)
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Content-Type', 'application/zip');
    newHeaders.set('X-User-Role', encodeURIComponent(userRole));

    return new Response(response.body, {
      status: 200,
      headers: newHeaders
    });

  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
