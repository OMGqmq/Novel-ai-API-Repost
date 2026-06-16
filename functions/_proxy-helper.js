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
    const { apiKey, userRole, isVip, userKey, remainingCredits, recordUsage, userId, authType, useDailyLimit, userLimitKey } = auth;

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
    let fetchOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const directorRefImgs = payload.parameters?.director_reference_images;
    if (directorRefImgs && Array.isArray(directorRefImgs) && directorRefImgs.length > 0) {
      const formData = new FormData();
      const cachedImages = [];

      for (let i = 0; i < directorRefImgs.length; i++) {
        let base64Str = directorRefImgs[i];
        if (base64Str.includes(',')) {
          base64Str = base64Str.split(',')[1];
        }
        
        // Decode base64 to binary bytes
        const binaryString = atob(base64Str);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let j = 0; j < len; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }

        // Detect MIME type
        let mimeType = 'image/png';
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
          mimeType = 'image/png';
        } else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
          mimeType = 'image/jpeg';
        } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
          mimeType = 'image/webp';
        }

        const partName = `director_ref_${i}`;
        const blob = new Blob([bytes], { type: mimeType });
        formData.append(partName, blob, 'blob');

        // Generate SHA-256 cache key using Web Crypto API
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const cacheKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        cachedImages.push({
          cache_secret_key: cacheKey,
          data: partName
        });
      }

      // Modify payload parameters
      delete payload.parameters.director_reference_images;
      payload.parameters.director_reference_images_cached = cachedImages;

      formData.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'blob');
      fetchOptions.body = formData;
    } else {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 402) {
        return json({ error: "服务器 Anlas 余额不足，请联系管理员。" }, 500);
      }
      return json({ error: `NovelAI API Error: ${errorText}` }, response.status);
    }

    // 6. 成功出图后的副作用
    if (isVip && authType === 'JWT' && userId) {
      if (useDailyLimit) {
        const sql = `
          INSERT INTO free_limits (key, count, updated_at) 
          VALUES (?, 1, datetime('now', '+8 hours'))
          ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = datetime('now', '+8 hours')
        `;
        waitUntil(env.DB.prepare(sql).bind(userLimitKey).run());
      } else if (remainingCredits > 0) {
        const updateStmt = env.DB.prepare("UPDATE users SET credits = credits - 1, updated_at = datetime('now', '+8 hours') WHERE id = ? AND credits > 0");
        const logStmt = env.DB.prepare("INSERT INTO credit_logs (user_id, action, amount, description, created_at) VALUES (?, 'generate', -1, '生成图像消费', datetime('now', '+8 hours'))");
        waitUntil(env.DB.batch([updateStmt.bind(userId), logStmt.bind(userId)]));
      }
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
