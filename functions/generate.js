// functions/generate.js (最终方案 V5: 引入解压库)

// 从一个公共 CDN 导入一个轻量级的 ZIP 解压库 fflate
import { unzipSync } from 'https://unpkg.com/fflate@0.8.2/esm/browser.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const NOVELAI_API_KEY = context.env.NOVELAI_API_KEY;
    if (!NOVELAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'NOVELAI_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await context.request.json();
    const payload = {
      input: data.prompt,
      model: 'nai-diffusion-3',
      action: 'generate',
      parameters: { /* ...所有参数... */
        width: data.width, height: data.height, scale: data.scale, sampler: data.sampler,
        steps: data.steps, n_samples: 1, ucPreset: 0, qualityToggle: true, sm: false,
        sm_dyn: false, dynamic_thresholding: false, controlnet_strength: 1, legacy: false,
        add_original_image: false, uncond_scale: 1, cfg_rescale: 0, noise_schedule: 'native',
        negative_prompt: data.negative_prompt,
      },
    };

    const NAI_URL = 'https://image.novelai.net/ai/generate-image';
    const response = await fetch(NAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NOVELAI_API_KEY}` },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    const zipBuffer = await response.arrayBuffer();
    const zipBytes = new Uint8Array(zipBuffer);

    // --- 使用 fflate 库解压 ZIP 文件 ---
    const decompressedFiles = unzipSync(zipBytes);
    
    // 我们从之前的诊断中知道，图片文件名是 'image_0.png'
    const imageFileName = 'image_0.png';
    const imageDataBytes = decompressedFiles[imageFileName];

    if (!imageDataBytes) {
      // 如果解压后找不到指定的文件
      const foundFiles = Object.keys(decompressedFiles);
      return new Response(JSON.stringify({ 
          error: `解压成功，但在ZIP文件中找不到 '${imageFileName}'。`,
          details: `找到的文件有: ${foundFiles.join(', ')}`
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    // --- 解压成功 ---

    // 将解压后的、纯粹的图片二进制数据转换为 Base64
    let binary = '';
    for (let i = 0; i < imageDataBytes.byteLength; i++) {
      binary += String.fromCharCode(imageDataBytes[i]);
    }
    const imageBase64 = btoa(binary);

    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
