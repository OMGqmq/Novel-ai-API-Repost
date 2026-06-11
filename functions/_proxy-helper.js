import { authenticate, AuthError } from './_auth-manager.js';
import { MAX_FREE_PIXELS } from './_config.js';

export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

export async function handleNovelAIProxy(context, { targetUrl, buildPayload }) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { request, env, waitUntil } = context;

    // 1. 鉴权与限流
    const auth = await authenticate(request, env);
    const { apiKey, userRole, isVip, userKey, remainingCredits, recordUsage, userId, authType } = auth;

    // 2. 获取请求数据
    const data = await request.json();

        // 3. 安全防护：像素限制与角色参考限制
    const allowBypass = env.ALLOW_CUSTOM_LIMITS !== 'false';
    const isRestricted = (userRole !== 'CustomAPI' && userRole !== 'Admin') || !allowBypass;

    if (isRestricted && data.director_reference_images && data.director_reference_images.length > 0) {
      throw new AuthError("角色参考功能会消耗 Anlas 算力，仅限自定义 API Key 或管理员使用", 403);
    }
    
    const width = parseInt(data.width) || 832;
    const height = parseInt(data.height) || 1216;

    if (isRestricted && (width * height > MAX_FREE_PIXELS)) {
      throw new Error("分辨率超出 Opus 免费限制");
    }

    // 4. 构建 payload
    const payload = buildPayload(data, isRestricted, width, height);

    // 5. 请求 NovelAI
    const response = await fetch(targetUrl, {
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
        return json({ error: "服务器 Anlas 余额不足，请联系管理员。" }, 500);
      }
      return json({ error: `NovelAI API Error: ${errorText}` }, response.status);
    }

    // 6. 成功出图后的副作用
    if (isVip && authType === 'JWT' && userId && remainingCredits > 0) {
      const updateStmt = env.DB.prepare("UPDATE users SET credits = credits - 1, updated_at = datetime('now', '+8 hours') WHERE id = ? AND credits > 0");
      const logStmt = env.DB.prepare("INSERT INTO credit_logs (user_id, action, amount, description, created_at) VALUES (?, 'generate', -1, '生成图像消费', datetime('now', '+8 hours'))");
      waitUntil(env.DB.batch([updateStmt.bind(userId), logStmt.bind(userId)]));
    } else if (isVip && userKey && remainingCredits > 0 && userRole.startsWith("VIP")) {
      waitUntil(env.DB.prepare("UPDATE cards SET credits = credits - 1, updated_at = datetime('now', '+8 hours') WHERE card_key = ? AND credits > 0").bind(userKey).run());
    } else if (!isVip && recordUsage) {
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
    return json({ error: e.message }, status);
  }
}
