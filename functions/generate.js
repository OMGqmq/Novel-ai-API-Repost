// functions/generate.js (终极诊断版本)

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
    
    // --- ZIP文件X光机：读取头部详细元数据 ---
    if (zipBuffer.byteLength < 30) {
        return new Response(JSON.stringify({ error: "响应数据太短，不是一个有效的ZIP文件。" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const view = new DataView(zipBuffer);
    const decoder = new TextDecoder(); // 用于将字节解码为文本

    // 读取本地文件头的各个字段
    const signature = view.getUint32(0, true); // 文件头标识 (应该是 PK\x03\x04)
    const compressionMethod = view.getUint16(8, true); // 压缩方法 (0=无, 8=DEFLATE)
    const compressedSize = view.getUint32(18, true); // 压缩后的大小
    const uncompressedSize = view.getUint32(22, true); // 原始大小
    const fileNameLength = view.getUint16(26, true); // 文件名长度
    const extraFieldLength = view.getUint16(28, true); // 额外字段长度

    // 读取文件名
    const fileNameBytes = new Uint8Array(zipBuffer, 30, fileNameLength);
    const fileName = decoder.decode(fileNameBytes);

    // 将诊断信息打包成一个对象
    const diagnosticReport = {
        isFileHeaderCorrect: (signature === 0x04034b50), // 检查是否以 'PK\x03\x04' 开头
        compressionMethod: compressionMethod === 0 ? "0 (No Compression)" : (compressionMethod === 8 ? "8 (DEFLATE)" : `Unknown (${compressionMethod})`),
        compressedSize: `${compressedSize} bytes`,
        uncompressedSize: `${uncompressedSize} bytes`,
        fileNameLength: fileNameLength,
        extraFieldLength: extraFieldLength,
        fileName: fileName,
        totalResponseSize: `${zipBuffer.byteLength} bytes`
    };

    // 将这份详细的报告发回给前端
    return new Response(JSON.stringify({
      error: '终极诊断报告：ZIP文件头部元数据如下。',
      details: diagnosticReport
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
