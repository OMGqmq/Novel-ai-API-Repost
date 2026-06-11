// functions/verify-key.js
// 验证用户自定义的 NovelAI API Key 是否有效，并获取 Anlas 余额与账号详细信息

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

    // Helper: 从 NovelAI subscription.trainingStepsLeft 提取计算 Anlas
    const getAnlasFromSub = (sub) => {
      const tsl = sub.trainingStepsLeft;
      if (typeof tsl === 'number') {
        return tsl;
      } else if (tsl && typeof tsl === 'object') {
        return (tsl.fixedTrainingStepsLeft || 0) + (tsl.purchasedTrainingSteps || 0);
      }
      return 0;
    };

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
        const info = data.information || {};
        const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };

        let emailVal = info.email || '';
        let rawInfoVal = info;
        if (!emailVal) {
          try {
            const resInfo = await fetch('https://api.novelai.net/user/information', {
              headers: { 'Authorization': `Bearer ${key}` }
            });
            if (resInfo.ok) {
              const infoData = await resInfo.json();
              emailVal = infoData.email || infoData.username || '';
              rawInfoVal = infoData;
            } else {
              rawInfoVal = { error: `HTTP ${resInfo.status}`, text: await resInfo.text() };
            }
          } catch (e) {
            console.warn('获取 email 失败:', e.message);
            rawInfoVal = { error: 'fetch_failed', message: e.message };
          }
        }

        return {
          key,
          valid: true,
          tier: sub.tier,
          tierName: tierNames[sub.tier] || `Tier ${sub.tier}`,
          active: sub.active,
          anlas: getAnlasFromSub(sub),
          emailVerified: info.emailVerified || false,
          accountCreatedAt: info.accountCreatedAt || 0,
          expiresAt: sub.expiresAt || 0,
          email: emailVal,
          rawInfo: rawInfoVal
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

      // 累加所有有效 Key 的点数
      let totalAnlas = 0;
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          totalAnlas += (r.value.anlas || 0);
        }
      });

      const firstSuccess = results[0].value;
      const details = results.map((r, idx) => {
        if (r.status === 'fulfilled') {
          return {
            key: keysToVerify[idx],
            valid: true,
            tier: r.value.tier,
            tierName: r.value.tierName,
            active: r.value.active,
            anlas: r.value.anlas,
            emailVerified: r.value.emailVerified,
            accountCreatedAt: r.value.accountCreatedAt,
            expiresAt: r.value.expiresAt,
            email: r.value.email,
            rawInfo: r.value.rawInfo
          };
        } else {
          return {
            key: keysToVerify[idx],
            valid: false,
            error: r.reason.message
          };
        }
      });

      return new Response(JSON.stringify({
        valid: true,
        tier: firstSuccess.tier,
        tierName: firstSuccess.tierName,
        active: firstSuccess.active,
        anlas: firstSuccess.anlas,
        totalAnlas: totalAnlas,
        keyCount: keysToVerify.length,
        allKeysValid: true,
        details: details
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

    // 向 NovelAI 请求用户完整数据以验证 Key 并获取 Anlas 余额及账号信息
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
    const info = data.information || {};
    const anlasVal = getAnlasFromSub(sub);
    // tier: 0=free, 1=tablet, 2=scroll, 3=opus
    const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };
    const tierName = tierNames[sub.tier] || `Tier ${sub.tier}`;

    let emailVal = info.email || '';
    let rawInfoVal = info;
    if (!emailVal) {
      try {
        const resInfo = await fetch('https://api.novelai.net/user/information', {
          headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
        });
        if (resInfo.ok) {
          const infoData = await resInfo.json();
          emailVal = infoData.email || infoData.username || '';
          rawInfoVal = infoData;
        } else {
          rawInfoVal = { error: `HTTP ${resInfo.status}`, text: await resInfo.text() };
        }
      } catch (e) {
        console.warn('获取 email 失败:', e.message);
        rawInfoVal = { error: 'fetch_failed', message: e.message };
      }
    }

    return new Response(JSON.stringify({
      valid: true,
      tier: sub.tier,
      tierName: tierName,
      active: sub.active,
      anlas: anlasVal,
      totalAnlas: anlasVal,
      keyCount: 1,
      details: [{
        key: apiKey,
        valid: true,
        tier: sub.tier,
        tierName: tierName,
        active: sub.active,
        anlas: anlasVal,
        emailVerified: info.emailVerified || false,
        accountCreatedAt: info.accountCreatedAt || 0,
        expiresAt: sub.expiresAt || 0,
        email: emailVal,
        rawInfo: rawInfoVal
      }]
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (e) {
    console.error("Verify Key Exception:", e);
    return new Response(JSON.stringify({ error: "验证失败，请稍后重试" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
