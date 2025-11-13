// functions/generate.js (诊断版本)

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
      parameters: { /* ... 这里是所有的参数 ... */
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

    const responseBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(responseBuffer);

    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    let pngStart = -1;

    for (let i = 0; i < bytes.length - pngHeader.length; i++) {
      let found = true;
      for (let j = 0; j < pngHeader.length; j++) {
        if (bytes[i + j] !== pngHeader[j]) { found = false; break; }
      }
      if (found) { pngStart = i; break; }
    }

    if (pngStart === -1) {
      // --- 这是新的诊断部分 ---
      const contentType = response.headers.get('Content-Type');
      const firstBytes = Array.from(bytes.slice(0, 16)); // 获取前16个字节
      const firstBytesAsChars = String.fromCharCode.apply(null, firstBytes);

      return new Response(JSON.stringify({
        error: '诊断信息：在原始响应中找不到 PNG 文件头。',
        details: {
          responseContentType: contentType,
          responseLengthBytes: responseBuffer.byteLength,
          responseFirst16Bytes: firstBytes,
          responseFirst16Chars: firstBytesAsChars
        }
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const pngData = responseBuffer.slice(pngStart);
    let binary = '';
    const pngBytes = new Uint8Array(pngData);
    for (let i = 0; i < pngBytes.byteLength; i++) { binary += String.fromCharCode(pngBytes[i]); }
    const imageBase64 = btoa(binary);

    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
