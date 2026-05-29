import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os

PORT = 8000

def load_env():
    env_vars = {}
    if os.path.exists('.env'):
        try:
            with open('.env', 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        parts = line.split('=', 1)
                        if len(parts) == 2:
                            env_vars[parts[0].strip()] = parts[1].strip().strip('"').strip("'")
        except Exception as e:
            print(f"读取 .env 文件失败: {e}")
    return env_vars

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # 1. /generate 接口
        if self.path == '/generate':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                
                # 从请求头中提取 Api Key
                api_key = self.headers.get('x-custom-api-key', '').strip()
                if not api_key:
                    # 尝试从本地加载
                    env_vars = load_env()
                    api_key = env_vars.get('NOVELAI_API_KEY', os.environ.get('NOVELAI_API_KEY', '')).strip()
                
                # 如果依然没有 Key，尝试兼容从请求体中提取 (早期版本设计)
                if not api_key:
                    api_key = data.get('apiKey', '').strip()
                
                if not api_key:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "未配置 API Key。请在前端“自定义 API Key”设置中添加，或在本地创建 .env 配置 NOVELAI_API_KEY。"}).encode('utf-8'))
                    return
                
                # 确定是否受限（支持 ALLOW_CUSTOM_LIMITS 环境变量开关控制是否允许自定义 Key/管理员绕过限制）
                env_vars = load_env()
                allow_bypass = env_vars.get('ALLOW_CUSTOM_LIMITS', os.environ.get('ALLOW_CUSTOM_LIMITS', 'true')).strip().lower() != 'false'
                is_custom_or_admin = bool(self.headers.get('x-custom-api-key')) or bool(env_vars.get('ADMIN_TOKEN') and self.headers.get('x-admin-token') == env_vars.get('ADMIN_TOKEN'))
                is_restricted = not is_custom_or_admin or not allow_bypass

                width = int(data.get('width', 832))
                height = int(data.get('height', 1216))
                
                if is_restricted and (width * height > 1048576 + 50000):
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "分辨率超出 Opus 免费限制"}).encode('utf-8'))
                    return

                steps = min(int(data.get('steps', 28)), 28) if is_restricted else int(data.get('steps', 28))

                # Payload 构造 (与 Cloudflare Workers 的 _payload-factory.js 保持 100% 对齐)
                prompt = data.get('prompt', '')
                negative_prompt = data.get('negative_prompt', '')
                version = data.get('version', 'v3')
                seed = data.get('seed', 0)
                
                isInpaint = data.get('action') == 'infill' and data.get('mask')
                action = 'generate'
                if isInpaint:
                    action = 'infill'
                elif data.get('image'):
                    action = 'img2img'
                    
                # 处理 Vibe Transfer (氛围传输)
                vibe_images = []
                vibe_info = []
                vibe_strength = []
                if data.get('vibe_image'):
                    vibe_images.append(data.get('vibe_image'))
                    
                    v_info = 1.0
                    try:
                        v_info = float(data.get('vibe_info', 1.0))
                    except:
                        pass
                    vibe_info.append(v_info)
                    
                    v_strength = 0.6
                    try:
                        v_strength = float(data.get('vibe_strength', 0.6))
                    except:
                        pass
                    vibe_strength.append(v_strength)
                    
                payload = {}
                if version == 'v4.5':
                    model = "nai-diffusion-4-5-full-inpainting" if isInpaint else "nai-diffusion-4-5-full"
                    payload = {
                        "input": prompt,
                        "model": model,
                        "action": action,
                        "parameters": {
                            "params_version": 3,
                            "width": width,
                            "height": height,
                            "scale": data.get('scale', 5.0),
                            "sampler": data.get('sampler', "k_euler"),
                            "steps": steps,
                            "seed": seed,
                            "n_samples": 1,
                            "prompt": prompt,
                            "negative_prompt": negative_prompt,
                            "v4_prompt": {
                                "caption": {"base_caption": prompt, "char_captions": []},
                                "use_coords": False,
                                "use_order": True
                            },
                            "v4_negative_prompt": {
                                "caption": {"base_caption": negative_prompt, "char_captions": []},
                                "use_coords": False,
                                "use_order": True
                            },
                            "ucPreset": 4,
                            "qualityToggle": data.get('qualityToggle', False),
                            "sm": data.get('sm', False),
                            "sm_dyn": data.get('sm_dyn', False),
                            "dynamic_thresholding": data.get('dynamic_thresholding', False),
                            "controlnet_strength": 1,
                            "legacy": False,
                            "add_original_image": True,
                            "cfg_rescale": data.get('cfg_rescale', 0),
                            "noise_schedule": data.get('noise_schedule', 'exponential'),
                            "legacy_v3_extend": False,
                            "uncond_scale": data.get('uncond_scale', 1.0),
                            "skip_cfg_above_sigma": data.get('skip_cfg_above_sigma', 19),
                            "reference_image_multiple": vibe_images,
                            "reference_information_extracted_multiple": vibe_info,
                            "reference_strength_multiple": vibe_strength,
                            "extra_noise_seed": seed
                        }
                    }
                else:
                    model = "nai-diffusion-3-inpainting" if isInpaint else "nai-diffusion-3"
                    payload = {
                        "input": prompt,
                        "model": model,
                        "action": action,
                        "parameters": {
                            "params_version": 1,
                            "width": width,
                            "height": height,
                            "scale": data.get('scale', 5.0),
                            "sampler": data.get('sampler', "k_euler"),
                            "steps": steps,
                            "seed": seed,
                            "n_samples": 1,
                            "prompt": prompt,
                            "negative_prompt": negative_prompt,
                            "ucPreset": 3,
                            "qualityToggle": data.get('qualityToggle', False),
                            "sm": data.get('sm', True),
                            "sm_dyn": data.get('sm_dyn', True),
                            "dynamic_thresholding": data.get('dynamic_thresholding', False),
                            "controlnet_strength": 1,
                            "legacy": False,
                            "add_original_image": True,
                            "cfg_rescale": data.get('cfg_rescale', 0),
                            "noise_schedule": "native",
                            "legacy_v3_extend": False,
                            "uncond_scale": data.get('uncond_scale', 1.0),
                            "reference_image_multiple": vibe_images,
                            "reference_information_extracted_multiple": vibe_info,
                            "reference_strength_multiple": vibe_strength,
                            "extra_noise_seed": seed
                        }
                    }
                
                # 处理局部重绘 (infill) 和 图生图 (img2img) 专有字段
                if isInpaint:
                    inpaint_strength = 1.0
                    try:
                        inpaint_strength = float(data.get('strength', 1.0))
                    except:
                        pass
                    payload["parameters"]["image"] = data.get('image')
                    payload["parameters"]["mask"] = data.get('mask')
                    payload["parameters"]["add_original_image"] = data.get('add_original_image', True)
                    payload["parameters"]["inpaintImg2ImgStrength"] = inpaint_strength
                    payload["parameters"]["strength"] = 1.0
                    payload["parameters"]["noise"] = 0
                    payload["parameters"]["sm"] = False
                    payload["parameters"]["sm_dyn"] = False
                elif data.get('image'):
                    payload["parameters"]["image"] = data.get('image')
                    payload["parameters"]["strength"] = data.get('strength', 0.5)
                    payload["parameters"]["noise"] = data.get('noise', 0)
                
                # 打印调试信息到控制台
                print(f"--- 正在向 NovelAI 发送 {action} 请求 ---")
                print(f"Model: {payload['model']}")
                
                debug_params = {k: v for k, v in payload['parameters'].items() 
                               if k not in ('image', 'mask', 'reference_image_multiple')}
                print(f"Parameters: {json.dumps(debug_params, indent=2, default=str)}")
                
                req = urllib.request.Request(
                    'https://image.novelai.net/ai/generate-image',
                    data=json.dumps(payload).encode('utf-8'),
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': 'application/json',
                        'Accept': '*/*',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        'Origin': 'https://novelai.net',
                        'Referer': 'https://novelai.net/'
                    },
                    method='POST'
                )
                
                with urllib.request.urlopen(req) as response:
                    resp_data = response.read()
                    
                    self.send_response(response.status)
                    for k, v in response.headers.items():
                        if k.lower() not in ['transfer-encoding']:
                            self.send_header(k, v)
                    # 添加 X-User-Role 响应头，指示使用的是自定义 Key 还是管理员
                    self.send_header('X-User-Role', 'CustomAPI')
                    self.end_headers()
                    self.wfile.write(resp_data)
                    print("--- 请求成功 ---")
                    
            except urllib.error.HTTPError as e:
                err_body = e.read().decode('utf-8')
                print(f"--- NovelAI API 报错: {e.code} ---")
                print(err_body)
                self.send_response(e.code)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": err_body}).encode('utf-8'))
            except Exception as e:
                print(f"--- 本地代理错误: {str(e)} ---")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        # 2. /verify-key 接口
        elif self.path == '/verify-key':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                api_key = data.get('apiKey', '').strip()
                api_keys = data.get('apiKeys', [])
                
                # 1. 数组验证逻辑
                if isinstance(api_keys, list) and len(api_keys) > 0:
                    keys_to_verify = [k.strip() for k in api_keys if k.strip()]
                    if not keys_to_verify:
                        self.send_response(400)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": "请输入 API Key"}).encode('utf-8'))
                        return
                    
                    print(f"--- 本地并发验证 {len(keys_to_verify)} 个 API Key... ---")
                    success_results = []
                    failed_keys = []
                    
                    for key in keys_to_verify:
                        try:
                            req = urllib.request.Request(
                                'https://api.novelai.net/user/subscription',
                                headers={
                                    'Authorization': f'Bearer {key}',
                                    'User-Agent': 'Mozilla/5.0'
                                },
                                method='GET'
                            )
                            with urllib.request.urlopen(req) as response:
                                resp_data = response.read()
                                sub_data = json.loads(resp_data.decode('utf-8'))
                                tier = sub_data.get('tier', 0)
                                tier_names = {0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'}
                                tier_name = tier_names.get(tier, f'Tier {tier}')
                                success_results.append({
                                    "key": key,
                                    "tier": tier,
                                    "tierName": tier_name,
                                    "active": sub_data.get('active', False)
                                })
                        except Exception as e:
                            failed_keys.append(f"{key[:10]}...")
                    
                    if failed_keys:
                        self.send_response(401)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": f"部分 Key 验证失败: {', '.join(failed_keys)}"}).encode('utf-8'))
                        return
                    
                    first_success = success_results[0]
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "valid": True,
                        "tier": first_success["tier"],
                        "tierName": first_success["tierName"],
                        "active": first_success["active"],
                        "allKeysValid": True
                    }).encode('utf-8'))
                    print(f"--- 验证成功! 共 {len(success_results)} 个 Key 均有效。首个 Key 订阅等级: {first_success['tierName']} ---")
                    return

                # 2. 单个 API Key 的原有验证逻辑
                if not api_key:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "请输入 API Key"}).encode('utf-8'))
                    return
                
                print("--- 正在验证 API Key 有效性... ---")
                req = urllib.request.Request(
                    'https://api.novelai.net/user/subscription',
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    method='GET'
                )
                
                with urllib.request.urlopen(req) as response:
                    resp_data = response.read()
                    sub_data = json.loads(resp_data.decode('utf-8'))
                    tier = sub_data.get('tier', 0)
                    tier_names = {0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'}
                    tier_name = tier_names.get(tier, f'Tier {tier}')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "valid": True,
                        "tier": tier,
                        "tierName": tier_name,
                        "active": sub_data.get('active', False)
                    }).encode('utf-8'))
                    print(f"--- 验证成功! 订阅等级: {tier_name} ---")
                    
            except urllib.error.HTTPError as e:
                err_body = e.read().decode('utf-8')
                print(f"--- 验证失败 (HTTP Error): {e.code} ---")
                print(err_body)
                self.send_response(e.code)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "API Key 无效或已过期，请检查后重试。"}).encode('utf-8'))
            except Exception as e:
                print(f"--- 验证异常: {str(e)} ---")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"验证失败: {str(e)}"}).encode('utf-8'))

        # 3. /augment 接口
        elif self.path == '/augment':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                req_type = data.get('req_type')
                width = int(data.get('width', 832))
                height = int(data.get('height', 1216))
                image = data.get('image')
                
                if not req_type or not image:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Missing req_type or image parameter"}).encode('utf-8'))
                    return
                
                # 提取 Api Key
                api_key = self.headers.get('x-custom-api-key', '').strip()
                if not api_key:
                    env_vars = load_env()
                    api_key = env_vars.get('NOVELAI_API_KEY', os.environ.get('NOVELAI_API_KEY', '')).strip()
                
                if not api_key:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "未配置 API Key。请在前端“自定义 API Key”设置中添加，或在本地配置环境变量 NOVELAI_API_KEY。"}).encode('utf-8'))
                    return

                # 确定是否受限
                env_vars = load_env()
                allow_bypass = env_vars.get('ALLOW_CUSTOM_LIMITS', os.environ.get('ALLOW_CUSTOM_LIMITS', 'true')).strip().lower() != 'false'
                is_custom_or_admin = bool(self.headers.get('x-custom-api-key')) or bool(env_vars.get('ADMIN_TOKEN') and self.headers.get('x-admin-token') == env_vars.get('ADMIN_TOKEN'))
                is_restricted = not is_custom_or_admin or not allow_bypass
                
                if is_restricted and (width * height > 1048576 + 50000):
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "分辨率超出 Opus 免费限制"}).encode('utf-8'))
                    return
                
                payload = {
                    "req_type": req_type,
                    "width": width,
                    "height": height,
                    "image": image
                }
                if req_type == 'colorize' and data.get('prompt'):
                    payload['prompt'] = data.get('prompt')
                    payload['defry'] = data.get('defry', 0)
                
                print(f"--- 正在向 NovelAI 发送 augment ({req_type}) 请求 ---")
                
                req = urllib.request.Request(
                    'https://image.novelai.net/ai/augment-image',
                    data=json.dumps(payload).encode('utf-8'),
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': 'application/json',
                        'Accept': '*/*',
                        'User-Agent': 'Mozilla/5.0',
                        'Origin': 'https://novelai.net',
                        'Referer': 'https://novelai.net/'
                    },
                    method='POST'
                )
                
                with urllib.request.urlopen(req) as response:
                    resp_data = response.read()
                    
                    self.send_response(response.status)
                    for k, v in response.headers.items():
                        if k.lower() not in ['transfer-encoding']:
                            self.send_header(k, v)
                    self.send_header('X-User-Role', 'CustomAPI')
                    self.end_headers()
                    self.wfile.write(resp_data)
                    print("--- Augment 请求成功 ---")
                    
            except urllib.error.HTTPError as e:
                err_body = e.read().decode('utf-8')
                print(f"--- NovelAI API Augment 报错: {e.code} ---")
                print(err_body)
                self.send_response(e.code)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": err_body}).encode('utf-8'))
            except Exception as e:
                print(f"--- 本地代理 Augment 错误: {str(e)} ---")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_error(404, "Not Found")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"本地测试服务器已启动: http://localhost:{PORT}")
    print("请在浏览器中打开这个地址，然后在新弹出的页面里按 F12 打开开发者工具。")
    print("在控制台中发出的所有异常，以及在这里的终端输出都会对我们大有帮助！")
    httpd.serve_forever()
