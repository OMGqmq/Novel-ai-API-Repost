// functions/generate.js (最终方案：精确ZIP解析)

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
      parameters: {
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
    
    // --- 精确解析ZIP文件，提取图片数据 ---
    // DataView 允许我们从二进制数据中读取特定类型（如16位整数）
    const view = new DataView(zipBuffer);

    // ZIP文件的本地文件头以 'PK\x03\x04' (50 4B 03 04) 开头
    // 我们从文件头中读取元数据来定位文件内容
    // 文件名长度存储在偏移量为 26 的位置 (占2个字节)
    const fileNameLength = view.getUint16(26, true); // true 表示小端字节序
    // 额外字段长度存储在偏移量为 28 的位置 (占2个字节)
    const extraFieldLength = view.getUint16(28, true);

    // 图片数据的起始位置 = 本地文件头的固定长度 (30字节) + 文件名长度 + 额外字段长度
    const imageStartOffset = 30 + fileNameLength + extraFieldLength;

    // 从计算出的起始位置开始，切割出纯粹的图片数据
    const imageData = zipBuffer.slice(imageStartOffset);
    // --- 解析结束 ---

    // 将纯粹的图片二进制数据转换为 Base64
    let binary = '';
    const bytes = new Uint8Array(imageData);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const imageBase64 = btoa(binary);

    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    // 如果解析失败或发生其他错误，返回详细信息
    return new Response(JSON.stringify({ 
      error: "An error occurred while processing the ZIP file from NovelAI.",
      details: e.message,
      stack: e.stack 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
