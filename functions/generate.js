import { createPayload } from './_payload-factory.js';
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
    const { apiKey, userRole, isVip, userKey, remainingCredits, recordUsage, userId, authType } = auth;

    // 2. 获取请求数据
    const data = await request.json();

    // 3. 安全防护：步数和分辨率限制 (自定义 Key 与管理员在 ALLOW_CUSTOM_LIMITS !== 'false' 时放行，以便其能支付 Anlas 选用更高画幅与步数)
    const allowBypass = env.ALLOW_CUSTOM_LIMITS !== 'false';
    const isRestricted = (userRole !== 'CustomAPI' && userRole !== 'Admin') || !allowBypass;
    const MAX_STEPS = 28;
    const steps = isRestricted 
      ? Math.min(parseInt(data.steps) || 28, MAX_STEPS)
      : (parseInt(data.steps) || 28);
    const width = parseInt(data.width) || 832;
    const height = parseInt(data.height) || 1216;

    if (isRestricted && (width * height > 1048576 + 50000)) {
      throw new Error("分辨率超出 Opus 免费限制");
    }

    // 4. 构建请求体 (由 PayloadFactory 处理)
    const payload = createPayload(data.version || "v3", {
      ...data,
      steps,
      width,
      height
    });

    // 5. 请求 NovelAI
    const NAI_URL = 'https://image.novelai.net/ai/generate-image';
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

    // 6. 成功出图后的副作用 (扣费或记录限流)
    if (isVip && authType === 'JWT' && userId && remainingCredits > 0) {
      // 注册用户扣点 + 记录日志
      const updateStmt = env.DB.prepare("UPDATE users SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND credits > 0");
      const logStmt = env.DB.prepare("INSERT INTO credit_logs (user_id, action, amount, description) VALUES (?, 'generate', -1, '生成图画消费')");
      waitUntil(env.DB.batch([updateStmt.bind(userId), logStmt.bind(userId)]));
    } else if (isVip && userKey && remainingCredits > 0 && userRole.startsWith("VIP")) {
      // VIP 扣费
      waitUntil(env.DB.prepare("UPDATE cards SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP WHERE card_key = ? AND credits > 0").bind(userKey).run());
    } else if (!isVip && recordUsage) {
      // 免费用户限流记录
      await recordUsage(waitUntil);
    }

    // 7. 透传响应
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
