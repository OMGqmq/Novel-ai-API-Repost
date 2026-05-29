// functions/verify-key.js
// 验证用户自定义的 NovelAI API Key 是否有效

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { apiKey, apiKeys } = await context.request.json();

    // 1. 如果传了 apiKeys 数组，支持并发验证所有 Key
    if (apiKeys && Array.isArray(apiKeys)) {
      const keysToVerify = apiKeys.map(k => k.trim()).filter(k => k);
      if (keysToVerify.length === 0) {
        return new Response(JSON.stringify({ error: '请输入 API Key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const promises = keysToVerify.map(async (key) => {
        const res = await fetch('https://api.novelai.net/user/subscription', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!res.ok) {
          throw new Error(`API Key (${key.substring(0, 10)}...) 验证失败`);
        }
        const data = await res.json();
        const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };
        return {
          key,
          valid: true,
          tier: data.tier,
          tierName: tierNames[data.tier] || `Tier ${data.tier}`,
          active: data.active
        };
      });

      const results = await Promise.allSettled(promises);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        const errors = failed.map(f => f.reason.message).join(', ');
        return new Response(JSON.stringify({ error: `部分 Key 验证失败: ${errors}` }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const firstSuccess = results[0].value;
      return new Response(JSON.stringify({
        valid: true,
        tier: firstSuccess.tier,
        tierName: firstSuccess.tierName,
        active: firstSuccess.active,
        allKeysValid: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 单个 API Key 的原有验证逻辑
    if (!apiKey || !apiKey.trim()) {
      return new Response(JSON.stringify({ error: '请输入 API Key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 向 NovelAI 请求用户订阅信息来验证 Key 是否有效
    const res = await fetch('https://api.novelai.net/user/subscription', {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'API Key 无效或已过期，请检查后重试。' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await res.json();
    // tier: 0=free, 1=tablet, 2=scroll, 3=opus
    const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };
    const tierName = tierNames[data.tier] || `Tier ${data.tier}`;

    return new Response(JSON.stringify({
      valid: true,
      tier: data.tier,
      tierName: tierName,
      active: data.active
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: '验证失败: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
