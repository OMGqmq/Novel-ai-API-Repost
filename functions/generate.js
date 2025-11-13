// functions/generate.js (带 PNG 提取功能)

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
      return new Response(JSON.stringify({ error: 'NOVELAI_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
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
        add_original_image: false,
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
        Authorization: `Bearer ${NOVELAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
       const errorText = await response.text();
       return new Response(JSON.stringify({ error: `NovelAI API Error: ${errorText}` }), {
         status: response.status,
         headers: { 'Content-Type': 'application/json' },
       });
    }

    const zipBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(zipBuffer);

    // --- 从 ZIP Buffer 中提取 PNG 数据的逻辑 ---
    // PNG 文件的魔数 (文件头) 是 ‰PNG，即 89 50 4E 47 0D 0A 1A 0A (十六进制)
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    let pngStart = -1;

    // 遍历字节数组，查找 PNG 文件头的起始位置
    for (let i = 0; i < bytes.length - pngHeader.length; i++) {
      let found = true;
      for (let j = 0; j < pngHeader.length; j++) {
        if (bytes[i + j] !== pngHeader[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        pngStart = i;
        break;
      }
    }

    if (pngStart === -1) {
      // 如果找不到 PNG 头，说明返回的数据格式有问题
      return new Response(JSON.stringify({ error: 'Could not find PNG data in the response from NovelAI.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从找到的位置开始，提取出纯粹的 PNG 数据
    const pngData = zipBuffer.slice(pngStart);

    // --- 将纯粹的 PNG 二进制数据转换为 Base64 ---
    let binary = '';
    const pngBytes = new Uint8Array(pngData);
    for (let i = 0; i < pngBytes.byteLength; i++) {
      binary += String.fromCharCode(pngBytes[i]);
    }
    const imageBase64 = btoa(binary);
    // --- 转换结束 ---

    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
