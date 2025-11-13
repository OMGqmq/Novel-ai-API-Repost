// functions/generate.js (最终方案 V4: 地毯式搜索)

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
    const bytes = new Uint8Array(zipBuffer);

    // --- 地毯式搜索：在整个二进制流中寻找PNG的起始和结束标记 ---
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10]; // ‰PNG...
    const pngEnd = [73, 69, 78, 68, 174, 66, 96, 130];   // IEND®B`‚

    let pngStart = -1;
    let pngEndPos = -1;

    // 寻找PNG文件头
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
      return new Response(JSON.stringify({ error: '搜索失败：在响应中找不到PNG文件头。' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    
    // 从文件头开始，寻找PNG文件尾
    for (let i = pngStart; i < bytes.length - pngEnd.length; i++) {
        let found = true;
        for (let j = 0; j < pngEnd.length; j++) {
            if (bytes[i + j] !== pngEnd[j]) {
                found = false;
                break;
            }
        }
        if (found) {
            pngEndPos = i + pngEnd.length; // 结束位置是标记的末尾
            break;
        }
    }

    if (pngEndPos === -1) {
        return new Response(JSON.stringify({ error: '搜索失败：找到了PNG文件头，但找不到文件尾。' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 根据找到的起始和结束位置，精确地切割出完整的PNG数据
    const imageData = zipBuffer.slice(pngStart, pngEndPos);
    // --- 搜索结束 ---

    // 将纯粹的图片二进制数据转换为 Base64
    let binary = '';
    const pngBytes = new Uint8Array(imageData);
    for (let i = 0; i < pngBytes.byteLength; i++) {
      binary += String.fromCharCode(pngBytes[i]);
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
