// functions/generate.js (严格按照文档理论的版本)

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

    // --- 严格按照文档理论的核心步骤 ---

    // 1. 假设响应体是一个 JSON，并进行解析。
    const responseData = await response.json();

    // 2. 假设 JSON 中有一个 'image' 字段，其值为 Base64 字符串。
    //    注意：真实的字段名可能不同，比如 'images' 或 'data'，但我们先按最常见的 'image' 假设。
    const base64Image = responseData.image; 

    if (!base64Image) {
        return new Response(JSON.stringify({ 
            error: "按照文档理论解析失败：API返回的JSON中没有找到 'image' 字段。",
            details: `收到的JSON内容是: ${JSON.stringify(responseData)}`
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. 直接返回这个 Base64 字符串给前端。
    //    前端的 JS 代码会自动处理它。
    //    为了符合我们前端的逻辑，我们依然把它包装在 { image: ... } 对象里。
    return new Response(JSON.stringify({ image: `data:image/png;base64,${base64Image}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    // --- 核心步骤结束 ---

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
