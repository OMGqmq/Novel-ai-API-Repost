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
    const { apiKey } = await context.request.json();

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
