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
    const NOVELAI_API_KEY = context.env.NOVELAI_API_KEY;
    if (!NOVELAI_API_KEY) {
      throw new Error('服务器未配置 NOVELAI_API_KEY');
    }

    const data = await context.request.json();
    
    // ================= 安全防护核心逻辑 =================
    // 强制限制步数：即使前端传了50，后端也只给28
    const MAX_FREE_STEPS = 28;
    const steps = Math.min(parseInt(data.steps) || 28, MAX_FREE_STEPS);
    
    const width = parseInt(data.width) || 832;
    const height = parseInt(data.height) || 1216;
    if (width * height > 1048576) {
        throw new Error("分辨率超出 Opus 免费限制 (Max 1024x1024)");
    }
    // =================================================

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
          steps: steps, // 使用被限制的安全步数
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
          steps: steps, // 使用被限制的安全步数
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

    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}`, steps_used: steps }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
