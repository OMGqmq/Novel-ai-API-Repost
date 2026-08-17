import { authenticate, preDeductQuota, rollbackQuota, AuthError } from './_auth-manager.js';
import { MAX_FREE_PIXELS } from './_config.js';

export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

async function writeRequestLog(env, { userId, authType, model, statusCode, durationMs, ip, errorMessage }) {
  if (!env.DB) return;
  try {
    const sql = `
      INSERT INTO request_logs (user_id, auth_type, model, status_code, duration_ms, ip, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
    `;
    await env.DB.prepare(sql).bind(
      userId || null,
      authType || 'Anonymous',
      model || 'Unknown',
      statusCode,
      durationMs,
      ip || 'Unknown',
      errorMessage || null
    ).run();
  } catch (err) {
    console.error("Failed to write request log:", err);
  }
}

export async function handleNovelAIProxy(context, { targetUrl, buildPayload }) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const startTime = Date.now();
  const { request, env, waitUntil } = context;
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || 'Unknown';

  let userId = null;
  let authType = 'Anonymous';
  let model = 'Unknown';
  let deductionReceipt = null;

  try {
    // 1. 鉴权与限流
    const auth = await authenticate(request, env);
    userId = auth.userId;
    authType = auth.authType;
    const { apiKey, userRole } = auth;

    // 2. 获取请求 data
    const data = await request.json();
    model = data.version || 'v3';

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

    // 5. 原子化预扣除算力/配额 (防并发刷算力)
    deductionReceipt = await preDeductQuota(auth, env);

    // 6. 请求模型 (如果是 zimage 则请求 pollinations.ai)
    let response;
    try {
      if (data.version === 'zimage') {
        const pKey = env.POLLINATIONS_API_KEY || "";
        const seedVal = data.seed ? parseInt(data.seed) : Math.floor(Math.random() * 1000000000);
        const promptEncoded = encodeURIComponent(data.prompt || "a beautiful scenery");
        
        const isTransparent = data.zi_transparent === true;
        const isEnhance = data.zi_enhance !== false; // 默认是 true
        const quality = data.zi_quality === 'hd' ? 'hd' : 'standard';
        
        let url = `https://gen.pollinations.ai/image/${promptEncoded}?model=zimage&width=${width}&height=${height}&seed=${seedVal}&nologo=true`;
        if (isTransparent) {
          url += `&transparent=true`;
        }
        if (!isEnhance) {
          url += `&enhance=false`;
        }
        if (quality === 'hd') {
          url += `&quality=hd`;
        }
        
        const pHeaders = {};
        if (pKey) {
          pHeaders['Authorization'] = `Bearer ${pKey}`;
        }
        
        response = await fetch(url, {
          method: 'GET',
          headers: pHeaders
        });
      } else {
        let fetchOptions = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        };

        response = await fetch(targetUrl, fetchOptions);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 402) {
          throw new Error("服务器 Anlas 余额不足，请联系管理员。");
        }
        throw new Error(`NovelAI API Error: ${errorText}`);
      }
    } catch (upstreamErr) {
      // 上游请求失败，执行补偿回滚
      if (deductionReceipt) {
        await rollbackQuota(deductionReceipt, env);
      }
      throw upstreamErr;
    }

    // 7. 成功出图后的副作用：记录付费点数扣减日志
    if (deductionReceipt && deductionReceipt.type === 'user_credits') {
      const logStmt = env.DB.prepare(
        "INSERT INTO credit_logs (user_id, action, amount, description, created_at) VALUES (?, 'generate', -1, '生成图像消费', datetime('now', '+8 hours'))"
      ).bind(deductionReceipt.userId);
      if (typeof waitUntil === 'function') {
        waitUntil(logStmt.run());
      } else {
        await logStmt.run();
      }
    }

    // 7. 透传响应
    const newHeaders = new Headers(response.headers);
    if (data.version === 'zimage') {
      newHeaders.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
    } else {
      newHeaders.set('Content-Type', 'application/zip');
    }
    newHeaders.set('X-User-Role', encodeURIComponent(userRole));

    const durationMs = Date.now() - startTime;
    const logPromise = writeRequestLog(env, {
      userId,
      authType,
      model,
      statusCode: 200,
      durationMs,
      ip,
      errorMessage: null
    });
    if (typeof waitUntil === 'function') {
      waitUntil(logPromise);
    }

    return new Response(response.body, {
      status: 200,
      headers: newHeaders
    });

  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const durationMs = Date.now() - startTime;
    const logPromise = writeRequestLog(env, {
      userId,
      authType,
      model,
      statusCode: status,
      durationMs,
      ip,
      errorMessage: e.message
    });
    if (typeof waitUntil === 'function') {
      waitUntil(logPromise);
    }
    return json({ error: e.message }, status);
  }
}
