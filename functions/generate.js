import { unzipSync } from './fflate.js';

// 辅助函数：构建 V4 格式的 Prompt 结构
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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const NOVELAI_API_KEY = context.env.NOVELAI_API_KEY;
    if (!NOVELAI_API_KEY) {
      throw new Error('服务器未配置 NOVELAI_API_KEY');
    }

    const data = await context.request.json();
    
    // 获取参数，设置默认值
    const prompt = data.prompt || "";
    const negative_prompt = data.negative_prompt || "";
    const version = data.version || "v3"; // 默认为 v3
    const seed = Math.floor(Math.random() * 4294967295);

    let payload = {};

    // ================= 核心逻辑：根据版本构造不同的 Payload =================
    
    if (version === "v4.5") {
      // --- V4.5 配置 (参考提供的 auto_nai.py) ---
      payload = {
        input: prompt,
        model: "nai-diffusion-4-5-full", // 使用 V4.5 Full 模型
        action: "generate",
        parameters: {
          params_version: 3,
          width: data.width,
          height: data.height,
          scale: data.scale,
          sampler: data.sampler,
          steps: data.steps,
          seed: seed,
          n_samples: 1,
          // V4 特有参数结构
          v4_prompt: buildV4Prompt(prompt),
          v4_negative_prompt: buildV4Prompt(negative_prompt),
          negative_prompt: negative_prompt,
          
          // V4.5 特定参数 (来自脚本)
          ucPreset: 4, 
          dynamic_thresholding: false,
          controlnet_strength: 1,
          add_original_image: true,
          cfg_rescale: 0,
          noise_schedule: "exponential", // V4.5 推荐 exponential
          skip_cfg_above_sigma: 58,      // 脚本中的值
          legacy_v3_extend: false
        }
      };
    } else {
      // --- V3 配置 (原有逻辑) ---
      payload = {
        input: prompt,
        model: "nai-diffusion-3",
        action: "generate",
        // V3 的负面提示词放在 parameters 外面
        undesiredContent: negative_prompt, 
        parameters: {
          width: data.width,
          height: data.height,
          scale: data.scale,
          sampler: data.sampler,
          steps: data.steps,
          seed: seed,
          n_samples: 1,
          
          // V3 特定参数
          sm: true,
          sm_dyn: true,
          qualityToggle: true,
          ucPreset: 0
        }
      };
    }

    // ================= 发送请求 =================

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
      return new Response(JSON.stringify({ error: `NovelAI API Error (${version}): ${errorText}` }), { 
        status: response.status, headers: { 'Content-Type': 'application/json' } 
      });
    }

    // ================= 处理 ZIP =================
    
    const zipBuffer = await response.arrayBuffer();
    const zipBytes = new Uint8Array(zipBuffer);
    const decompressedFiles = unzipSync(zipBytes);
    
    // 查找图片文件 (通常是 image_0.png)
    const imageFileName = Object.keys(decompressedFiles).find(name => name.endsWith('.png'));
    
    if (!imageFileName) {
        throw new Error("解压后未找到 PNG 图片文件");
    }
    
    const imageDataBytes = decompressedFiles[imageFileName];

    // 转 Base64
    let binary = '';
    const len = imageDataBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(imageDataBytes[i]);
    }
    const imageBase64 = btoa(binary);

    return new Response(JSON.stringify({ 
      image: `data:image/png;base64,${imageBase64}`,
      model_used: version
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, headers: { 'Content-Type': 'application/json' } 
    });
  }
        }
