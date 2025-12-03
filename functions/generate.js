import { unzipSync } from './fflate.js';

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
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const env = context.env;
    const NOVELAI_API_KEY = env.NOVELAI_API_KEY;
    if (!NOVELAI_API_KEY) throw new Error('服务器未配置 NOVELAI_API_KEY');

    // ================== 🛡️ 强化版访问控制 ==================
    
    const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const clientToken = context.request.headers.get('x-admin-token'); 
    const serverToken = env.ADMIN_TOKEN; 
    
    // 检查是否是管理员
    const isAdmin = serverToken && clientToken === serverToken;

    if (!isAdmin) {
        const kv = env.NAI_LIMIT;
        if (!kv) throw new Error("Server KV Error: Database not bound");

        const today = new Date().toISOString().split('T')[0]; // 2023-10-27
        
        // --- 1. 检查全站总上限 (防止 VPN 刷爆) ---
        // 设定全站每天最多允许生成多少张 (例如 200 张)
        // 这样即使有人换 IP，总量用完后他也跑不了
        const GLOBAL_MAX_DAILY = 200; 
        const globalKey = `global:${today}`;
        
        let globalCount = await kv.get(globalKey);
        globalCount = parseInt(globalCount) || 0;

        if (globalCount >= GLOBAL_MAX_DAILY) {
             return new Response(JSON.stringify({ 
                error: `本站今日免费次数已耗尽 (${globalCount}/${GLOBAL_MAX_DAILY})。请明天再来，或联系站长。` 
            }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }

        // --- 2. 检查单 IP 上限 (防止单人霸占) ---
        const MAX_IP_DAILY = 20;
        const ipKey = `limit:${today}:${clientIP}`;

        let ipCount = await kv.get(ipKey);
        ipCount = parseInt(ipCount) || 0;

        if (ipCount >= MAX_IP_DAILY) {
            return new Response(JSON.stringify({ 
                error: `您今日的免费额度已用完 (${ipCount}/${MAX_IP_DAILY})。请明天再来。` 
            }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }

        // --- 3. 增加计数 (并发下可能不绝对精确，但足够安全) ---
        // 更新全站计数
        await kv.put(globalKey, globalCount + 1, { expirationTtl: 86400 });
        // 更新 IP 计数
        await kv.put(ipKey, ipCount + 1, { expirationTtl: 86400 });
    }
    // =======================================================

    const data = await context.request.json();
    
    // 安全防护
    const MAX_FREE_STEPS = 28; 
    const steps = Math.min(parseInt(data.steps) || 28, MAX_FREE_STEPS);
    const width = parseInt(data.width) || 832;
    const height = parseInt(data.height) || 1216;
    if (width * height > 1048576 + 10000) { 
        throw new Error("分辨率超出 Opus 免费限制");
    }

    const prompt = data.prompt || "";
    const negative_prompt = data.negative_prompt || "";
    const version = data.version || "v3";
    const seed = Math.floor(Math.random() * 4294967295);

    let payload = {};
    
    if (version === "v4.5") {
      payload = {
        input: prompt,
        model: "nai-diffusion-4-5-full",
        action: "generate",
        parameters: {
          params_version: 3,
          width: width,
          height: height,
          scale: data.scale,
          sampler: data.sampler,
          steps: steps,
          seed: seed,
          n_samples: 1,
          v4_prompt: buildV4Prompt(prompt),
          v4_negative_prompt: buildV4Prompt(negative_prompt),
          negative_prompt: negative_prompt,
          ucPreset: 4, 
          dynamic_thresholding: false,
          controlnet_strength: 1,
          add_original_image: true,
          cfg_rescale: 0,
          noise_schedule: "exponential",
          skip_cfg_above_sigma: 58,
          legacy_v3_extend: false
        }
      };
    } else {
      payload = {
        input: prompt,
        model: "nai-diffusion-3",
        action: "generate",
        undesiredContent: negative_prompt, 
        parameters: {
          width: width,
          height: height,
          scale: data.scale,
          sampler: data.sampler,
          steps: steps,
          seed: seed,
          n_samples: 1,
          sm: true,
          sm_dyn: true,
          qualityToggle: true,
          ucPreset: 0
        }
      };
    }

    const NAI_URL = 'https://image.novelai.net/ai/generate-image';
    const response = await fetch(NAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NOVELAI_API_KEY}` },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    const zipBuffer = await response.arrayBuffer();
    const zipBytes = new Uint8Array(zipBuffer);
    const decompressedFiles = unzipSync(zipBytes);
    const imageFileName = Object.keys(decompressedFiles).find(name => name.endsWith('.png'));
    
    if (!imageFileName) {
        throw new Error("解压后未找到 PNG 图片文件");
    }
    
    const imageDataBytes = decompressedFiles[imageFileName];
    let binary = '';
    const len = imageDataBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(imageDataBytes[i]);
    }
    const imageBase64 = btoa(binary);

    return new Response(JSON.stringify({ 
        image: `data:image/png;base64,${imageBase64}`, 
        steps_used: steps,
        user_role: isAdmin ? "Admin (Unlimited)" : "Guest (Limited)" 
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
