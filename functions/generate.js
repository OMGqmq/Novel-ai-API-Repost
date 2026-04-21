// functions/generate.js

// 辅助函数：构建 V4 Prompt
function buildV4Prompt(prompt) {
  return {
    caption: {
      base_caption: prompt,
      char_captions: []
    },
    use_coords: false,
    use_order: true
  };
}

export async function onRequest(context) {
  // 只允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const env = context.env;

    // 1. 检查服务器 API Key
    const SERVER_API_KEY = env.NOVELAI_API_KEY;

    // 2. 检查自定义 API Key (用户自带 Key)
    const customApiKeyHeader = context.request.headers.get('x-custom-api-key');
    const customApiKey = customApiKeyHeader ? customApiKeyHeader.trim() : "";
    const useCustomKey = !!customApiKey;

    // 如果没有自定义 Key，也没有服务器 Key，则报错
    if (!useCustomKey && !SERVER_API_KEY) {
      throw new Error('服务器未配置 NOVELAI_API_KEY');
    }

    // 最终使用的 API Key
    const NOVELAI_API_KEY = useCustomKey ? customApiKey : SERVER_API_KEY;

    // 3. 检查 KV 数据库
    const kv = env.NAI_LIMIT;
    if (!kv) {
      console.warn("KV 数据库未绑定 (NAI_LIMIT)，限流功能将失效");
    }

    // ================== 🛡️ 鉴权逻辑 (自定义Key / 管理员 + 卡密 + 免费限制) ==================
    const adminTokenHeader = context.request.headers.get('x-admin-token');
    const userKeyHeader = context.request.headers.get('x-user-key');
    const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';

    // 去除可能存在的空格
    const adminToken = adminTokenHeader ? adminTokenHeader.trim() : "";
    const userKey = userKeyHeader ? userKeyHeader.trim() : "";
    const serverAdminToken = env.ADMIN_TOKEN ? env.ADMIN_TOKEN.trim() : "";

    let isVip = false; // 是否拥有特权（管理员或有余额的卡密用户）
    let remainingCredits = -1; // 剩余点数 (-1代表无限)
    let userRole = "Free"; // 返回给前端显示的角色

    // 0. 自定义 API Key 用户 (等同管理员权限，无限制)
    if (useCustomKey) {
      isVip = true;
      userRole = "CustomAPI";
    }
    // A. 管理员 (最高权限)
    else if (serverAdminToken && adminToken === serverAdminToken) {
      isVip = true;
      userRole = "Admin";
    }
    // B. 卡密用户 (VIP)
    else if (userKey && kv) {
      // 在 KV 中查找这个卡密，Key 的格式建议为 "card:卡密"
      // 这样可以避免和其他配置项冲突
      const creditsStr = await kv.get(`card:${userKey}`);

      if (creditsStr === null) {
        // 卡密不存在
        return new Response(JSON.stringify({ error: "无效的卡密，请检查输入或联系卖家。" }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }

      remainingCredits = parseInt(creditsStr);

      if (isNaN(remainingCredits) || remainingCredits <= 0) {
        return new Response(JSON.stringify({ error: "您的卡密余额已耗尽，请购买新卡密。" }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }

      isVip = true;
      // 预扣费后的余额显示给前端（实际扣费在生成成功后）
      userRole = `VIP (余:${remainingCredits - 1})`;
    }
    // C. 免费用户 (限流)
    else if (kv) {
      const today = new Date().toISOString().split('T')[0];

      // 全站总限 (防止被刷爆)
      const globalKey = `global:${today}`;
      const globalCount = parseInt(await kv.get(globalKey) || "0");
      if (globalCount >= 200) {
        return new Response(JSON.stringify({ error: "今日全站免费算力已耗尽，请使用卡密或明天再来。" }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }

      // 单IP限 (防止单人滥用)
      const ipKey = `limit:${today}:${clientIP}`;
      const ipCount = parseInt(await kv.get(ipKey) || "0");
      if (ipCount >= 5) { // 限制为 5 张
        return new Response(JSON.stringify({ error: "今日免费额度已用完 (5/5)。购买卡密可解锁更多次数。" }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }

      // 记录免费用户的计数 (异步写入，不阻塞)
      context.waitUntil(Promise.all([
        kv.put(globalKey, globalCount + 1, { expirationTtl: 86400 }),
        kv.put(ipKey, ipCount + 1, { expirationTtl: 86400 })
      ]));
    }
    // ===========================================================================

    const data = await context.request.json();

    // 安全防护：步数和分辨率限制
    // 即便是 VIP，为了防止封号，也建议限制单次生成的规格
    const MAX_STEPS = 28;
    const steps = Math.min(parseInt(data.steps) || 28, MAX_STEPS);
    const width = parseInt(data.width) || 832;
    const height = parseInt(data.height) || 1216;

    // 简单的像素总量检查
    if (width * height > 1048576 + 50000) {
      throw new Error("分辨率超出 Opus 免费限制");
    }

    // 构建请求体
    const prompt = data.prompt || "";
    const negative_prompt = data.negative_prompt || "";
    const version = data.version || "v3";
    const seed = data.seed ? parseInt(data.seed) : Math.floor(Math.random() * 4294967295);

    // 检查是否局部重绘 
    const isInpaint = data.action === "infill" && data.mask;

    // 决定 action
    let action = "generate";
    if (isInpaint) {
      action = "infill";
    } else if (data.image) {
      action = "img2img";
    }

    let payload = {};
    if (version === "v4.5") {
      payload = {
        input: prompt,
        model: isInpaint ? "nai-diffusion-4-5-full-inpainting" : "nai-diffusion-4-5-full",
        action: action,
        parameters: {
          params_version: 3,
          width: width, height: height, scale: data.scale, sampler: data.sampler, steps: steps, seed: seed,
          n_samples: 1,
          v4_prompt: buildV4Prompt(prompt),
          v4_negative_prompt: buildV4Prompt(negative_prompt),
          negative_prompt: negative_prompt,
          ucPreset: 4, dynamic_thresholding: false, controlnet_strength: 1, add_original_image: true,
          cfg_rescale: 0, noise_schedule: "exponential", skip_cfg_above_sigma: 58, legacy_v3_extend: false
        }
      };
    } else {
      payload = {
        input: prompt,
        model: isInpaint ? "nai-diffusion-3-inpainting" : "nai-diffusion-3",
        action: action,
        undesiredContent: negative_prompt,
        parameters: {
          width: width, height: height, scale: data.scale, sampler: data.sampler, steps: steps, seed: seed,
          n_samples: 1, sm: true, sm_dyn: true, qualityToggle: true, ucPreset: 0
        }
      };
    }

    // img2img 参数
    if (data.image) {
      payload.parameters.image = data.image;
      payload.parameters.strength = parseFloat(data.strength) || 0.5;
      payload.parameters.noise = parseFloat(data.noise) || 0;
      payload.parameters.extra_noise_seed = seed;
    }

    // 局部重绘 (inpainting) 参数
    if (isInpaint) {
      payload.parameters.mask = data.mask;
      payload.parameters.add_original_image = false;
    }

    // 请求 NovelAI
    const NAI_URL = 'https://image.novelai.net/ai/generate-image';
    const response = await fetch(NAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOVELAI_API_KEY}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 如果 NAI 返回 402 Payment Required，说明你的账号余额不足
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "服务器 Anlas 余额不足，请联系管理员。" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    // ================= 💰 扣费逻辑 (成功出图后才扣) =================
    // 只有当用户是卡密用户 (userKey存在) 且不是管理员 (isVip为true但adminToken不对) 时扣费
    // 但上面的逻辑里，如果是管理员，userKey 会被忽略。
    // 这里重新判断：只有当 remainingCredits > 0 时才扣费。
    if (userKey && kv && remainingCredits > 0 && !(serverAdminToken && adminToken === serverAdminToken)) {
      // 扣除 1 点
      const newBalance = remainingCredits - 1;
      // 异步更新数据库，不阻塞图片返回
      context.waitUntil(kv.put(`card:${userKey}`, newBalance.toString()));
    }
    // ==============================================================

    // 透传 ZIP 数据流 (这是最稳定、最省 CPU 的方式)
    // 我们把用户身份信息放在 Header 里传给前端，让前端知道剩余次数
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Content-Type', 'application/zip'); // 强制标记为 ZIP
    newHeaders.set('X-User-Role', encodeURIComponent(userRole));           // 告诉前端用户身份和余额

    return new Response(response.body, {
      status: 200,
      headers: newHeaders
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


