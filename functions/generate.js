// functions/generate.js

export async function onRequest(context) {
  // 只允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 从环境变量中获取 API Key
    const NOVELAI_API_KEY = context.env.NOVELAI_API_KEY;
    if (!NOVELAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'NOVELAI_API_KEY not set in Cloudflare environment variables' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 解析前端发来的 JSON 数据
    const data = await context.request.json();

    // 构建 NovelAI 请求的 payload
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
        sm: true,
        sm_dyn: true,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: false,
        uncond_scale: 1,
        cfg_rescale: 0,
        noise_schedule: 'native',
        negative_prompt: data.negative_prompt,
      },
    };

    // 使用正确的 NovelAI API URL
    const NAI_URL = 'https://image.novelai.net/ai/generate-image';

    // 发送请求到 NovelAI
    const response = await fetch(NAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NOVELAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // 检查 NovelAI 的响应状态
    if (!response.ok) {
       const errorText = await response.text();
       return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), {
         status: response.status,
         headers: { 'Content-Type': 'application/json' },
       });
    }

    // NovelAI 返回的是一个 zip 文件流 (实际上是一个包含 PNG 的 zip)
    // 我们需要将它作为二进制数据读取
    const zipBuffer = await response.arrayBuffer();
    
    // --- 在 Worker 环境中将 ArrayBuffer (二进制) 转换为 Base64 的标准方法 ---
    let binary = '';
    const bytes = new Uint8Array(zipBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const imageBase64 = btoa(binary);
    // --- 转换结束 ---

    // 返回包含 Base64 编码图片的 JSON 响应
    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    // 捕获并返回任何意外错误
    return new Response(JSON.stringify({ 
      error: e.message, 
      stack: e.stack // 包含堆栈信息以便调试
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
