// functions/generate.js (最终解决方案)

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
        width: data.width,
        height: data.height,
        scale: data.scale,
        sampler: data.sampler,
        steps: data.steps,
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        // --- 关键修改 ---
        // 我们不要求返回原始图片或元数据，这通常会强制返回纯图片流
        add_original_image: false, 
        // --- 修改结束 ---
        uncond_scale: 1,
        cfg_rescale: 0,
        noise_schedule: 'native',
        negative_prompt: data.negative_prompt,
      },
    };

    const NAI_URL = 'https://image.novelai.net/ai/generate-image';

    const response = await fetch(NAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/octet-stream', // 明确告诉服务器我们想要二进制流
        Authorization: `Bearer ${NOVELAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    // 既然我们请求的是纯图片，返回的应该直接就是 PNG 数据
    const imageBuffer = await response.arrayBuffer();
    
    // 将纯粹的 PNG 二进制数据转换为 Base64
    let binary = '';
    const bytes = new Uint8Array(imageBuffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
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
