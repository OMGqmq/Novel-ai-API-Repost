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

    // Helper: 提取 Opus 免费额度与生成张数估算
    const extractOpusUsage = (sub) => {
      if (!sub || sub.tier < 3) return null;
      const usage = sub.usage || {};
      const percent = usage.isNegative ? 0 : Math.min(100, Math.max(0, (typeof usage.percent === 'number' ? usage.percent : 0)));
      const estimatedImages = Math.round(17.3 * percent);
      const timeUntilNextPercent = usage.timeUntilNextPercent || 0;
      const refillRatePerDay = timeUntilNextPercent > 0 ? Math.round((86400 / timeUntilNextPercent) * 10) / 10 : 0;
      return {
        percent,
        isNegative: !!usage.isNegative,
        timeUntilNextPercent,
        estimatedImages,
        refillRatePerDay
      };
    };

    const isMulti = Array.isArray(apiKeys);
    const keysToVerify = isMulti
      ? apiKeys.map(k => (k || '').trim()).filter(Boolean)
      : (apiKey && apiKey.trim() ? [apiKey.trim()] : []);

    if (keysToVerify.length === 0) {
      return new Response(JSON.stringify({ error: '请输入 API Key' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };

    const promises = keysToVerify.map(async (key) => {
      const res = await fetch('https://image.novelai.net/user/data', {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        throw new Error(isMulti ? `API Key (${key.substring(0, 10)}...) 验证失败` : 'API Key 无效或已过期，请检查后重试。');
      }
      const data = await res.json();
      const sub = data.subscription || {};
      const info = data.information || {};

      let emailVal = info.email || '';
      let rawInfoVal = info;
      if (!emailVal) {
        try {
          const resInfo = await fetch('https://image.novelai.net/user/information', {
            headers: { 'Authorization': `Bearer ${key}` },
            signal: AbortSignal.timeout(5000)
          });
          if (resInfo.ok) {
            const infoData = await resInfo.json();
            emailVal = infoData.email || infoData.username || '';
            rawInfoVal = infoData;
          } else {
            rawInfoVal = { error: `HTTP ${resInfo.status}`, text: await resInfo.text() };
          }
        } catch (e) {
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
        rawInfo: rawInfoVal,
        opusUsage: extractOpusUsage(sub)
      };
    });

    const results = await Promise.allSettled(promises);
    const failed = results.filter(r => r.status === 'rejected');

    if (failed.length > 0) {
      const errorMsg = isMulti
        ? `部分 Key 验证失败: ${failed.map(f => f.reason.message).join(', ')}`
        : (failed[0].reason.message || 'API Key 无效或已过期，请检查后重试。');
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    let totalAnlas = 0;
    results.forEach(r => {
      if (r.status === 'fulfilled') totalAnlas += (r.value.anlas || 0);
    });

    const firstSuccess = results[0].value;
    const details = results.map((r, idx) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      return {
        key: keysToVerify[idx],
        valid: false,
        error: r.reason.message
      };
    });

    return new Response(JSON.stringify({
      valid: true,
      tier: firstSuccess.tier,
      tierName: firstSuccess.tierName,
      active: firstSuccess.active,
      anlas: firstSuccess.anlas,
      totalAnlas: totalAnlas,
      keyCount: keysToVerify.length,
      ...(isMulti ? { allKeysValid: true } : {}),
      opusUsage: firstSuccess.opusUsage,
      details: details
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
