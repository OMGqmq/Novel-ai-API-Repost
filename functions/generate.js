
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
    // 从环境变量中获取 API Key 和代理（如果需要）
    const NOVELAI_API_KEY = context.env.NOVELAI_API_KEY;
    // 注意: Cloudflare 环境不支持直接设置 HTTP 代理，这一步通常省略

    if (!NOVELAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'NOVELAI_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 解析前端发来的 JSON 数据
    const data = await context.request.json();

    // 构建 NovelAI 请求的 payload (和 Python 版本一致)
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

    // 使用 fetch API 发送请求到 NovelAI
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

    // NovelAI 返回的是 zip 文件流，我们需要处理它
    // Cloudflare Workers/Functions 环境可以直接处理 ArrayBuffer
    const zipBlob = await response.blob();
    const zipBuffer = await zipBlob.arrayBuffer();

    // JS 没有内置的解压库，所以我们不能直接解压。
    // 但是，NovelAI 返回的 zip 文件通常只有一个图片文件，且没有压缩。
    // 我们可以通过一些技巧来提取它，但更简单的方法是直接将 zip 文件内容作为 base64 返回。
    // 更稳妥的方法是假设 NovelAI 的响应就是图片本身，如果返回的是 zip，需要更复杂的处理。
    // 幸运的是，通常可以直接将 blob 转换为 base64。
    // 为了简单起见，我们先假设返回的直接是图片数据流。
    // 如果 NovelAI 强制返回 zip，我们需要调整策略。
    
    // 我们直接将返回的 blob 转换为 base64
    const reader = new FileReader(); // FileReader 在 Worker 环境中不可用
    // 我们需要一种在 worker 中将 ArrayBuffer 转为 base64 的方法
    const base64String = btoa(String.fromCharCode(...new Uint8Array(zipBuffer)));

    // 查找 PNG 图像的开始和结束位置来提取
    // 这是一个更健壮的方法来处理 NAI 返回的 zip
    const bytes = new Uint8Array(zipBuffer);
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10]; // PNG 文件头
    const pngEnd = [73, 69, 78, 68, 174, 66, 96, 130]; // IEND chunk
    
    let pngStart = -1;
    for (let i = 0; i < bytes.length - 8; i++) {
        let match = true;
        for (let j = 0; j < 8; j++) {
            if (bytes[i + j] !== pngHeader[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            pngStart = i;
            break;
        }
    }

    if (pngStart === -1) {
        throw new Error("Could not find PNG header in the response.");
    }

    const imageData = zipBuffer.slice(pngStart);
    const imageBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(imageData)));


    return new Response(JSON.stringify({ image: `data:image/png;base64,${imageBase64}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
