
import os
import json
import base64
import zipfile
import io
import requests

# ✅ 你的配置区域保持不变，但API Key的获取方式有变化
# NOVELAI_API_KEY 将通过 Cloudflare 的环境变量来设置，而不是直接写在这里
# PROXY 配置也一样

NAI_URL = "https://api.novelai.net/ai/generate-image"

# 这是 Cloudflare Function 的主处理函数
# 它会在每次 /generate 请求时被调用
async def onRequest(context):
    # 1. 从环境变量中安全地获取 API Key 和代理设置
    # 这些变量需要在 Cloudflare Pages 的仪表盘中设置
    env = context.env
    NOVELAI_API_KEY = env.get("NOVELAI_API_KEY")
    PROXY_URL = env.get("PROXY_URL", None)
    
    PROXY = {"https": PROXY_URL} if PROXY_URL else None

    if not NOVELAI_API_KEY:
        error_response = {"error": "NOVELAI_API_KEY environment variable not set in Cloudflare."}
        return Response(json.dumps(error_response), status=500, headers={'Content-Type': 'application/json'})

    # 2. 检查请求方法是否为 POST
    if context.request.method != 'POST':
        error_response = {"error": "Method not allowed. Please use POST."}
        return Response(json.dumps(error_response), status=405, headers={'Content-Type': 'application/json'})

    try:
        # 3. 解析前端发来的 JSON 数据
        data = await context.request.json()
        
        # 解析参数 (与你原来的代码几乎一样)
        prompt = data.get('prompt', '')
        negative_prompt = data.get('negative_prompt', 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry')
        width = int(data.get('width', 832))
        height = int(data.get('height', 1216))
        steps = int(data.get('steps', 28))
        sampler = data.get('sampler', 'k_euler_ancestral')
        sm = data.get('sm', True)
        sm_dyn = data.get('sm_dyn', True)
        scale = float(data.get('scale', 5.0))

        # 构建 NovelAI 请求载荷 (与你原来的代码完全一样)
        payload = {
            "input": prompt,
            "model": "nai-diffusion-3",
            "action": "generate",
            "parameters": {
                "width": width, "height": height, "scale": scale, "sampler": sampler,
                "steps": steps, "n_samples": 1, "ucPreset": 0, "qualityToggle": True,
                "sm": sm, "sm_dyn": sm_dyn, "dynamic_thresholding": False,
                "controlnet_strength": 1, "legacy": False, "add_original_image": False,
                "uncond_scale": 1, "cfg_rescale": 0, "noise_schedule": "native",
                "negative_prompt": negative_prompt
            }
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {NOVELAI_API_KEY}"
        }

        # 4. 发送请求到 NovelAI (使用 requests 库)
        response = requests.post(
            NAI_URL, 
            json=payload, 
            headers=headers, 
            proxies=PROXY,
            timeout=20, # Cloudflare Functions 有执行时间限制，120秒太长，建议缩短
            stream=True
        )

        if response.status_code != 200:
            error_response = {"error": f"NovelAI API Error: {response.text}"}
            return Response(json.dumps(error_response), status=response.status_code, headers={'Content-Type': 'application/json'})

        # 5. 处理返回的图片数据 (与你原来的代码完全一样)
        try:
            with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                file_name = z.namelist()[0]
                image_data = z.read(file_name)
                b64_img = base64.b64encode(image_data).decode('utf-8')
            
            # 6. 构建并返回成功的响应
            success_response = {"image": f"data:image/png;base64,{b64_img}"}
            return Response(json.dumps(success_response), status=200, headers={'Content-Type': 'application/json'})
        except Exception as e:
            error_response = {"error": f"Failed to process image data: {str(e)}"}
            return Response(json.dumps(error_response), status=500, headers={'Content-Type': 'application/json'})

    except Exception as e:
        error_response = {"error": str(e)}
        return Response(json.dumps(error_response), status=500, headers={'Content-Type': 'application/json'})
