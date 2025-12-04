export async function onRequest(context) {
  // 只允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const env = context.env;
    // === 核心配置：适配 https://allgpt.xianyuw.cn ===
    const MJ_BASE_URL = "https://allgpt.xianyuw.cn/v1/images/generations"; 
    const MJ_API_KEY = env.MJ_API_KEY; // 请在 Cloudflare 后台设置这个变量 (sk-...)
    
    if (!MJ_API_KEY) throw new Error("服务器未配置 MJ_API_KEY");
    // =================================================

    const reqData = await context.request.json();
    const { action, prompt, taskId } = reqData;

    // ================== 🛡️ 鉴权与限流系统 ==================
    const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const clientToken = context.request.headers.get('x-admin-token');
    const serverToken = env.ADMIN_TOKEN;
    
    // 判断是否是管理员
    const isAdmin = serverToken && clientToken === serverToken;

    // 只有“提交任务 (imagine)”才扣费和检查限制，“查询进度 (fetch)”不限制
    if (action === 'imagine' && !isAdmin) {
        const kv = env.NAI_LIMIT;
        if (!kv) throw new Error("KV Database Error: NAI_LIMIT binding not found");

        // 1. 检查云端总开关
        const publicAccess = await kv.get("MJ_PUBLIC_ACCESS");
        if (publicAccess !== "true") {
            return new Response(JSON.stringify({ error: "🔒 MJ 绘图功能目前仅对管理员开放。" }), { status: 403 });
        }

        const today = new Date().toISOString().split('T')[0];

        // 2. 全站每日总量限制 (10张)
        const GLOBAL_MAX = 10;
        const globalKey = `mj_global:${today}`;
        let globalCount = parseInt(await kv.get(globalKey) || "0");
        
        if (globalCount >= GLOBAL_MAX) {
            return new Response(JSON.stringify({ error: `今日全站 MJ 免费额度已耗尽 (${globalCount}/${GLOBAL_MAX})。请明天再来。` }), { status: 429 });
        }

        // 3. 单 IP 每日限制 (2张)
        const IP_MAX = 2;
        const ipKey = `mj_ip:${today}:${clientIP}`;
        let ipCount = parseInt(await kv.get(ipKey) || "0");

        if (ipCount >= IP_MAX) {
            return new Response(JSON.stringify({ error: `您今日的 MJ 免费额度已用完 (${ipCount}/${IP_MAX})。` }), { status: 429 });
        }

        // 4. 扣费 (增加计数)
        // 设置 24 小时过期，自动重置
        await kv.put(globalKey, globalCount + 1, { expirationTtl: 86400 });
        await kv.put(ipKey, ipCount + 1, { expirationTtl: 86400 });
    }
    // =======================================================

    // === API 转发逻辑 (适配 New API / One API) ===
    
    let upstreamUrl = "";
    let upstreamBody = {};
    let method = "POST";

    if (action === 'imagine') {
        // 提交绘画
        upstreamUrl = `${MJ_BASE_URL}/mj/submit/imagine`;
        upstreamBody = { prompt: prompt };
    } else if (action === 'fetch') {
        // 查询进度 (New API 通常使用 GET)
        upstreamUrl = `${MJ_BASE_URL}/mj/task/${taskId}/fetch`;
        method = "GET";
    }

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MJ_API_KEY}` // New API 标准鉴权
    };

    let response;
    if (method === "POST") {
        response = await fetch(upstreamUrl, { method, headers, body: JSON.stringify(upstreamBody) });
    } else {
        response = await fetch(upstreamUrl, { method, headers });
    }

    if (!response.ok) {
        const errText = await response.text();
        return new Response(JSON.stringify({ error: `Upstream Error (${response.status}): ${errText}` }), { status: response.status });
    }

    const data = await response.json();
    
    // 如果是 fetch 操作，检查 New API 返回的 status
    // New API 通常返回: { status: "SUCCESS", imageUrl: "...", progress: "100%", ... }
    return new Response(JSON.stringify(data), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
