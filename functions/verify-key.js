// functions/verify-key.js
// 验证用户自定义的 NovelAI API Key 是否有效，并获取 Anlas 余额

export async function onRequest(context) {
  // CORS 响应头定义，支持预检和跨域
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // 1. 兼容处理 OPTIONS 预检请求
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // 2. 只放行 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const promises = keysToVerify.map(async (key) => {
        const res = await fetch('https://api.novelai.net/user/data', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!res.ok) {
          throw new Error(`API Key (${key.substring(0, 10)}...) 验证失败`);
        }
        const data = await res.json();
        const sub = data.subscription || {};
        const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };
        return {
          key,
          valid: true,
          tier: sub.tier,
          tierName: tierNames[sub.tier] || `Tier ${sub.tier}`,
          active: sub.active,
          anlas: data.anlas || 0
        };
      });

      const results = await Promise.allSettled(promises);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        const errors = failed.map(f => f.reason.message).join(', ');
        return new Response(JSON.stringify({ error: `部分 Key 验证失败: ${errors}` }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const firstSuccess = results[0].value;
      return new Response(JSON.stringify({
        valid: true,
        tier: firstSuccess.tier,
        tierName: firstSuccess.tierName,
        active: firstSuccess.active,
        anlas: firstSuccess.anlas,
        allKeysValid: true
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // 2. 单个 API Key 的原有验证逻辑
    if (!apiKey || !apiKey.trim()) {
      return new Response(JSON.stringify({ error: '请输入 API Key' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // 向 NovelAI 请求用户完整数据以验证 Key 并获取 Anlas 余额
    const res = await fetch('https://api.novelai.net/user/data', {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'API Key 无效或已过期，请检查后重试。' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const data = await res.json();
    const sub = data.subscription || {};
    // tier: 0=free, 1=tablet, 2=scroll, 3=opus
    const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };
    const tierName = tierNames[sub.tier] || `Tier ${sub.tier}`;

    return new Response(JSON.stringify({
      valid: true,
      tier: sub.tier,
      tierName: tierName,
      active: sub.active,
      anlas: data.anlas || 0
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: '验证失败: ' + e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
