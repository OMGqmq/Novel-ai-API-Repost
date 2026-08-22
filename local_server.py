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

def extract_opus_usage(sub_data):
    if not sub_data or sub_data.get('tier', 0) < 3:
        return None
    usage = sub_data.get('usage', {})
    if not isinstance(usage, dict):
        return None
    is_negative = bool(usage.get('isNegative', False))
    try:
        raw_pct = int(usage.get('percent', 0))
    except (ValueError, TypeError):
        raw_pct = 0
    percent = 0 if is_negative else min(100, max(0, raw_pct))
    estimated_images = round(17.3 * percent)
    time_until_next = usage.get('timeUntilNextPercent', 0)
    refill_rate = round((86400 / time_until_next) * 10) / 10 if time_until_next > 0 else 0
    return {
        "percent": percent,
        "isNegative": is_negative,
        "timeUntilNextPercent": time_until_next,
        "estimatedImages": estimated_images,
        "refillRatePerDay": refill_rate
    }

def extract_char_captions(char_list):
    char_captions = []
    neg_char_captions = []
    if isinstance(char_list, list) and len(char_list) > 0:
        for c in char_list:
            x_val = float(c.get('x', 0.5)) if c.get('x') is not None else 0.5
            y_val = float(c.get('y', 0.5)) if c.get('y') is not None else 0.5
            char_captions.append({
                "char_caption": c.get('prompt', ''),
                "centers": [{"x": x_val, "y": y_val}]
            })
            neg_char_captions.append({
                "char_caption": c.get('negative_prompt', ''),
                "centers": [{"x": x_val, "y": y_val}]
            })
    return char_captions, neg_char_captions

def extract_vibe_arrays(data):
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
    return vibe_images, vibe_info, vibe_strength

def create_v3_payload(data, width=None, height=None, steps=None):
    prompt = data.get('prompt', '')
    negative_prompt = data.get('negative_prompt', '')
    is_inpaint = bool(data.get('action') == 'infill' and data.get('mask'))
    action = 'infill' if is_inpaint else ('img2img' if data.get('image') else 'generate')
    model = "nai-diffusion-3-inpainting" if is_inpaint else "nai-diffusion-3"
    
    width = width or int(data.get('width', 832))
    height = height or int(data.get('height', 1216))
    steps = steps or int(data.get('steps', 28))
    seed = int(data.get('seed', 0)) if data.get('seed') is not None else random.randint(0, 4294967295)
    
    vibe_images, vibe_info, vibe_strength = extract_vibe_arrays(data)
    
    payload = {
        "input": prompt,
        "model": model,
        "action": action,
        "parameters": {
            "params_version": 1,
            "width": width,
            "height": height,
            "scale": float(data.get('scale', 5.0)),
            "sampler": data.get('sampler', "k_euler"),
            "steps": steps,
            "seed": seed,
            "n_samples": 1,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "ucPreset": data.get('ucPreset', 3),
            "qualityToggle": data.get('qualityToggle', False),
            "sm": data.get('sm', True),
            "sm_dyn": data.get('sm_dyn', True),
            "dynamic_thresholding": data.get('dynamic_thresholding', False),
            "controlnet_strength": 1,
            "legacy": False,
            "add_original_image": True,
            "cfg_rescale": float(data.get('cfg_rescale', 0)),
            "noise_schedule": "native",
            "legacy_v3_extend": False,
            "uncond_scale": float(data.get('uncond_scale', 1.0)),
            "reference_image_multiple": vibe_images,
            "reference_information_extracted_multiple": vibe_info,
            "reference_strength_multiple": vibe_strength,
            "extra_noise_seed": seed
        }
    }
    if is_inpaint:
        inpaint_strength = float(data.get('strength', 1.0))
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
        payload["parameters"]["strength"] = float(data.get('strength', 0.5))
        payload["parameters"]["noise"] = float(data.get('noise', 0))
    return payload

def create_v45_payload(data, width=None, height=None, steps=None):
    prompt = data.get('prompt', '')
    negative_prompt = data.get('negative_prompt', '')
    is_inpaint = bool(data.get('action') == 'infill' and data.get('mask'))
    action = 'infill' if is_inpaint else ('img2img' if data.get('image') else 'generate')
    model = "nai-diffusion-4-5-full-inpainting" if is_inpaint else "nai-diffusion-4-5-full"
    
    width = width or int(data.get('width', 832))
    height = height or int(data.get('height', 1216))
    steps = steps or int(data.get('steps', 28))
    seed = int(data.get('seed', 0)) if data.get('seed') is not None else random.randint(0, 4294967295)
    
    is_experimental = data.get('v4_5_experimental') is True
    char_captions, neg_char_captions = extract_char_captions(data.get('char_captions'))
    
    use_coords = data.get('v4_prompt_use_coords') if data.get('v4_prompt_use_coords') is not None else (not is_experimental)
    use_order = data.get('v4_prompt_use_order') if data.get('v4_prompt_use_order') is not None else True
    neg_use_order = data.get('v4_neg_use_order') if data.get('v4_neg_use_order') is not None else is_experimental
    deliberate_euler_bug = data.get('deliberate_euler_ancestral_bug') if data.get('deliberate_euler_ancestral_bug') is not None else is_experimental
    prefer_brownian = data.get('prefer_brownian') if data.get('prefer_brownian') is not None else (not is_experimental)
    
    skip_cfg = 0.0 if is_experimental else None
    if data.get('skip_cfg_above_sigma') is not None:
        if data.get('skip_cfg_above_sigma') == 'null':
            skip_cfg = None
        else:
            try:
                skip_cfg = float(data.get('skip_cfg_above_sigma'))
            except:
                pass

    vibe_images, vibe_info, vibe_strength = extract_vibe_arrays(data)
    
    payload = {
        "input": prompt,
        "model": model,
        "action": action,
        "use_new_shared_trial": True,
        "parameters": {
            "params_version": 3,
            "width": width,
            "height": height,
            "scale": float(data.get('scale', 5.0)),
            "sampler": data.get('sampler', "k_euler"),
            "steps": steps,
            "seed": seed,
            "n_samples": 1,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "v4_prompt": {
                "caption": {"base_caption": prompt, "char_captions": char_captions},
                "use_coords": use_coords,
                "use_order": use_order
            },
            "v4_negative_prompt": {
                "caption": {"base_caption": negative_prompt, "char_captions": neg_char_captions},
                "use_order": neg_use_order,
                "legacy_uc": data.get('legacy_uc', False)
            },
            "ucPreset": data.get('ucPreset', 4),
            "qualityToggle": data.get('qualityToggle', False),
            "sm": data.get('sm', False),
            "sm_dyn": data.get('sm_dyn', False),
            "dynamic_thresholding": data.get('dynamic_thresholding', False),
            "controlnet_strength": 1,
            "legacy": False,
            "add_original_image": True,
            "cfg_rescale": float(data.get('cfg_rescale', 0)),
            "noise_schedule": data.get('noise_schedule', 'exponential'),
            "legacy_v3_extend": False,
            "legacy_uc": data.get('legacy_uc', False),
            "characterPrompts": data.get('characterPrompts', []),
            "normalize_reference_strength_multiple": True,
            "uncond_scale": float(data.get('uncond_scale', 1.0)),
            "skip_cfg_above_sigma": skip_cfg,
            "deliberate_euler_ancestral_bug": deliberate_euler_bug,
            "prefer_brownian": prefer_brownian,
            "reference_image_multiple": vibe_images,
            "reference_information_extracted_multiple": vibe_info,
            "reference_strength_multiple": vibe_strength,
            "extra_noise_seed": seed
        }
    }
    
    if data.get('director_reference_images') and len(data.get('director_reference_images')) > 0:
        payload["parameters"]["director_reference_images"] = data.get('director_reference_images')
        payload["parameters"]["director_reference_descriptions"] = data.get('director_reference_descriptions', [])
        payload["parameters"]["director_reference_strength_values"] = data.get('director_reference_strength_values', [])
        payload["parameters"]["director_reference_secondary_strength_values"] = data.get('director_reference_secondary_strength_values', [])
        payload["parameters"]["director_reference_information_extracted"] = data.get('director_reference_information_extracted', [])

    if is_inpaint:
        inpaint_strength = float(data.get('strength', 1.0))
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
        payload["parameters"]["strength"] = float(data.get('strength', 0.5))
        payload["parameters"]["noise"] = float(data.get('noise', 0))
    return payload

def create_v5_payload(data, width=None, height=None, steps=None):
    prompt = data.get('prompt', '')
    negative_prompt = data.get('negative_prompt', '')
    is_inpaint = bool(data.get('action') == 'infill' and data.get('mask'))
    action = 'infill' if is_inpaint else ('img2img' if data.get('image') else 'generate')
    model = "nai-diffusion-5-full-inpainting" if is_inpaint else "nai-diffusion-5-full"
    
    width = width or int(data.get('width', 832))
    height = height or int(data.get('height', 1216))
    steps = steps or int(data.get('steps', 28))
    seed = int(data.get('seed', 0)) if data.get('seed') is not None else random.randint(0, 4294967295)
    
    char_captions, neg_char_captions = extract_char_captions(data.get('char_captions'))
    inpaint_strength = float(data.get('strength', 1.0))

    raw_char_prompts = data.get('characterPrompts')
    if isinstance(raw_char_prompts, list) and len(raw_char_prompts) > 0:
        character_prompts = raw_char_prompts
    elif isinstance(data.get('char_captions'), list) and len(data.get('char_captions')) > 0:
        character_prompts = []
        for c in data.get('char_captions'):
            c_dict = c if isinstance(c, dict) else {}
            character_prompts.append({
                "prompt": c_dict.get('prompt', ''),
                "uc": c_dict.get('negative_prompt', c_dict.get('uc', '')),
                "center": {
                    "x": float(c_dict.get('x', c_dict.get('center', {}).get('x', 0.5))),
                    "y": float(c_dict.get('y', c_dict.get('center', {}).get('y', 0.5)))
                },
                "enabled": c_dict.get('enabled', True)
            })
    else:
        character_prompts = []

    use_coords = bool(data.get('v4_prompt_use_coords', data.get('use_coords', False)))

    payload = {
        "input": prompt,
        "model": model,
        "action": action,
        "use_new_shared_trial": True,
        "parameters": {
            "params_version": 4,
            "width": width,
            "height": height,
            "scale": float(data.get('scale', 1.9)),
            "sampler": data.get('sampler', "k_euler_ancestral"),
            "steps": steps,
            "seed": seed,
            "n_samples": 1,
            "ucPresetId": data.get('ucPresetId', "heavy"),
            "qualityPresetId": data.get('qualityPresetId', "standard"),
            "autoSmea": data.get('autoSmea', False),
            "dynamic_thresholding": data.get('dynamic_thresholding', False),
            "controlnet_strength": 1,
            "legacy": False,
            "add_original_image": data.get('add_original_image', True),
            "cfg_rescale": float(data.get('cfg_rescale', 0)),
            "legacy_v3_extend": False,
            "use_coords": use_coords,
            "legacy_uc": False,
            "normalize_reference_strength_multiple": True,
            "inpaintImg2ImgStrength": inpaint_strength if is_inpaint else 1,
            "characterPrompts": character_prompts,
            "straight_alpha": True,
            "tag_hint_qt": data.get('tag_hint_qt', 1),
            "tag_hint_uc_preset": data.get('tag_hint_uc_preset', 2),
            "v4_prompt": {
                "caption": {"base_caption": prompt, "char_captions": char_captions},
                "use_coords": use_coords,
                "use_order": data.get('v4_prompt_use_order', True)
            },
            "v4_negative_prompt": {
                "caption": {"base_caption": negative_prompt, "char_captions": neg_char_captions},
                "legacy_uc": False
            },
            "negative_prompt": negative_prompt,
            "deliberate_euler_ancestral_bug": data.get('deliberate_euler_ancestral_bug', False),
            "prefer_brownian": data.get('prefer_brownian', True),
            "noise_schedule": data.get('noise_schedule', 'karras'),
            "image_format": data.get('image_format', 'webp'),
            "stream": data.get('stream', 'msgpack')
        }
    }

    if is_inpaint:
        payload["parameters"]["image"] = data.get('image')
        payload["parameters"]["mask"] = data.get('mask')
        payload["parameters"]["strength"] = 1.0
        payload["parameters"]["noise"] = 0
    elif data.get('image'):
        payload["parameters"]["image"] = data.get('image')
        payload["parameters"]["strength"] = float(data.get('strength', 0.5))
        payload["parameters"]["noise"] = float(data.get('noise', 0))
    return payload

def create_payload(version, data, width=None, height=None, steps=None):
    norm_ver = str(version or "").lower().strip()
    if norm_ver in ("v5", "nai5", "v5.0"):
        return create_v5_payload(data, width, height, steps)
    if norm_ver in ("v4.5", "v4", "v4-full", "v4-curated"):
        return create_v45_payload(data, width, height, steps)
    return create_v3_payload(data, width, height, steps)

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

                if is_restricted and data.get('director_reference_images') and len(data.get('director_reference_images')) > 0:
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "角色参考功能会消耗 Anlas 算力，仅限自定义 API Key 或管理员使用"}).encode('utf-8'))
                    return

                steps = min(int(data.get('steps', 28)), 28) if is_restricted else int(data.get('steps', 28))

                # Payload 构造 (与 Cloudflare Workers 的 _payload-factory.js 保持 100% 对齐)
                version = data.get('version', 'v3')
                payload = create_payload(version, data, width=width, height=height, steps=steps)

                req_data = json.dumps(payload).encode('utf-8')
                content_type = 'application/json'

                debug_params = {k: v for k, v in payload['parameters'].items() 
                               if k not in ('image', 'mask', 'reference_image_multiple', 'director_reference_images', 'director_reference_images_cached')}
                print(f"Parameters: {json.dumps(debug_params, indent=2, default=str)}")
                
                req = urllib.request.Request(
                    'https://image.novelai.net/ai/generate-image',
                    data=req_data,
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': content_type,
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
                                'https://image.novelai.net/user/data',
                                headers={
                                    'Authorization': f'Bearer {key}',
                                    'User-Agent': 'Mozilla/5.0'
                                },
                                method='GET'
                            )
                            with urllib.request.urlopen(req) as response:
                                resp_data = response.read()
                                user_data = json.loads(resp_data.decode('utf-8'))
                                sub_data = user_data.get('subscription', {})
                                info_data = user_data.get('information', {})
                                tier = sub_data.get('tier', 0)
                                tier_names = {0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'}
                                tier_name = tier_names.get(tier, f'Tier {tier}')
                                tsl = sub_data.get('trainingStepsLeft', 0)
                                if isinstance(tsl, dict):
                                    anlas_val = tsl.get('fixedTrainingStepsLeft', 0) + tsl.get('purchasedTrainingSteps', 0)
                                elif isinstance(tsl, (int, float)):
                                    anlas_val = int(tsl)
                                else:
                                    anlas_val = 0

                                # 获取 Email
                                email_val = info_data.get("email", "")
                                raw_info_val = info_data
                                if not email_val:
                                    try:
                                        info_req = urllib.request.Request(
                                            'https://image.novelai.net/user/information',
                                            headers={
                                                'Authorization': f'Bearer {key}',
                                                'User-Agent': 'Mozilla/5.0'
                                            },
                                            method='GET'
                                        )
                                        with urllib.request.urlopen(info_req, timeout=5) as info_resp:
                                            info_json = json.loads(info_resp.read().decode('utf-8'))
                                            email_val = info_json.get("email") or info_json.get("username") or ""
                                            raw_info_val = info_json
                                    except urllib.error.HTTPError as info_err:
                                        raw_info_val = {"error": f"HTTP {info_err.code}"}
                                        print(f"获取邮箱失败: {info_err}")
                                    except Exception as info_err:
                                        raw_info_val = {"error": "fetch_failed", "message": str(info_err)}
                                        print(f"获取邮箱失败: {info_err}")

                                opus_usage = extract_opus_usage(sub_data)

                                success_results.append({
                                    "key": key,
                                    "tier": tier,
                                    "tierName": tier_name,
                                    "active": sub_data.get('active', False),
                                    "anlas": anlas_val,
                                    "emailVerified": info_data.get("emailVerified", False),
                                    "accountCreatedAt": info_data.get("accountCreatedAt", 0),
                                    "expiresAt": sub_data.get("expiresAt", 0),
                                    "email": email_val,
                                    "rawInfo": raw_info_val,
                                    "opusUsage": opus_usage
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
                    total_anlas = sum(item.get("anlas", 0) for item in success_results)
                    
                    details = []
                    for item in success_results:
                        details.append({
                            "key": item["key"],
                            "valid": True,
                            "tier": item["tier"],
                            "tierName": item["tierName"],
                            "active": item["active"],
                            "anlas": item["anlas"],
                            "emailVerified": item.get("emailVerified", False),
                            "accountCreatedAt": item.get("accountCreatedAt", 0),
                            "expiresAt": item.get("expiresAt", 0),
                            "email": item.get("email", ""),
                            "rawInfo": item.get("rawInfo", {}),
                            "opusUsage": item.get("opusUsage")
                        })

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "valid": True,
                        "tier": first_success["tier"],
                        "tierName": first_success["tierName"],
                        "active": first_success["active"],
                        "anlas": first_success.get("anlas", 0),
                        "totalAnlas": total_anlas,
                        "keyCount": len(success_results),
                        "allKeysValid": True,
                        "opusUsage": first_success.get("opusUsage"),
                        "details": details
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
                    'https://image.novelai.net/user/data',
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    method='GET'
                )
                
                with urllib.request.urlopen(req) as response:
                    resp_data = response.read()
                    user_data = json.loads(resp_data.decode('utf-8'))
                    sub_data = user_data.get('subscription', {})
                    tier = sub_data.get('tier', 0)
                    tier_names = {0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'}
                    tier_name = tier_names.get(tier, f'Tier {tier}')
                    
                    tsl = sub_data.get('trainingStepsLeft', 0)
                    if isinstance(tsl, dict):
                        anlas_val = tsl.get('fixedTrainingStepsLeft', 0) + tsl.get('purchasedTrainingSteps', 0)
                    elif isinstance(tsl, (int, float)):
                        anlas_val = int(tsl)
                    else:
                        anlas_val = 0
                    info_data = user_data.get('information', {})

                    # 获取 Email
                    email_val = info_data.get("email", "")
                    if not email_val:
                        try:
                            info_req = urllib.request.Request(
                                'https://image.novelai.net/user/information',
                                headers={
                                    'Authorization': f'Bearer {api_key}',
                                    'User-Agent': 'Mozilla/5.0'
                                },
                                method='GET'
                            )
                            with urllib.request.urlopen(info_req, timeout=5) as info_resp:
                                info_json = json.loads(info_resp.read().decode('utf-8'))
                                email_val = info_json.get("email") or info_json.get("username") or ""
                        except Exception as info_err:
                            print(f"获取邮箱失败: {info_err}")

                    single_opus_usage = extract_opus_usage(sub_data)

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "valid": True,
                        "tier": tier,
                        "tierName": tier_name,
                        "active": sub_data.get('active', False),
                        "anlas": anlas_val,
                        "totalAnlas": anlas_val,
                        "keyCount": 1,
                        "opusUsage": single_opus_usage,
                        "details": [{
                            "key": api_key,
                            "valid": True,
                            "tier": tier,
                            "tierName": tier_name,
                            "active": sub_data.get('active', False),
                            "anlas": anlas_val,
                            "emailVerified": info_data.get("emailVerified", False),
                            "accountCreatedAt": info_data.get("accountCreatedAt", 0),
                            "expiresAt": sub_data.get("expiresAt", 0),
                            "email": email_val,
                            "opusUsage": single_opus_usage
                        }]
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
        elif self.path == '/upscale':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                api_key = self.headers.get('x-custom-api-key', '').strip()
                if not api_key:
                    env_vars = load_env()
                    api_key = env_vars.get('NOVELAI_API_KEY', os.environ.get('NOVELAI_API_KEY', '')).strip()
                if not api_key:
                    api_key = data.get('apiKey', '').strip()
                if not api_key:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "未配置 API Key"}).encode('utf-8'))
                    return
                
                image = data.get('image')
                if not image:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Missing image parameter"}).encode('utf-8'))
                    return

                width = int(data.get('width', 832))
                height = int(data.get('height', 1216))
                scale = int(data.get('scale', 4))
                
                model_name = 'nai-diffusion-3'
                raw_model = data.get('model') or data.get('version') or 'v3'
                if raw_model == 'v5' or '5' in str(raw_model):
                    model_name = 'nai-diffusion-5-full'
                elif raw_model == 'v4.5' or raw_model == 'v4' or '4' in str(raw_model):
                    model_name = 'nai-diffusion-4-full'
                elif 'furry' in str(raw_model):
                    model_name = 'furry-diffusion-3'
                elif str(raw_model).startswith('nai-diffusion') or str(raw_model).startswith('safe-diffusion'):
                    model_name = str(raw_model)

                payload = {
                    "image": image,
                    "width": width,
                    "height": height,
                    "scale": scale,
                    "model": model_name
                }
                
                print("--- 正在向 NovelAI 发送 upscale (4x) 请求 ---")
                req = urllib.request.Request(
                    'https://image.novelai.net/ai/upscale',
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
                    print("--- Upscale 请求成功 ---")
        elif self.path == '/danbooru' or self.path == '/api/danbooru':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8')) if post_data else {}
                tags = data.get('tags', '')
                limit = min(int(data.get('limit', 20)), 50)
                page = int(data.get('page', 1))

                posts = self.fetch_booru_posts(tags, limit, page)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "count": len(posts), "posts": posts}).encode('utf-8'))
            except Exception as e:
                print(f"--- 本地代理 Danbooru 错误: {str(e)} ---")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_error(404, "Not Found")

    def fetch_booru_posts(self, tags, limit=20, page=1):
        sanitized_posts = []
        danbooru_success = False

        # 1. 优先尝试 Danbooru 官方接口
        try:
            query_params = urllib.parse.urlencode({
                'tags': tags,
                'limit': limit,
                'page': page
            })
            target_url = f'https://danbooru.donmai.us/posts.json?{query_params}'
            print(f"--- 正在请求 Danbooru API: {target_url} ---")

            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                method='GET'
            )

            with urllib.request.urlopen(req, timeout=5) as response:
                resp_data = response.read()
                posts = json.loads(resp_data.decode('utf-8'))
                if isinstance(posts, list):
                    for p in posts:
                        preview_url = p.get('preview_file_url') or p.get('large_file_url') or p.get('file_url') or ''
                        media_asset = p.get('media_asset') or {}
                        variants = media_asset.get('variants') or []
                        for v in variants:
                            if v.get('type') in ['sample', '360x360', '180x180'] and v.get('url'):
                                preview_url = v.get('url')
                                break
                        
                        sanitized_posts.append({
                            "id": p.get('id'),
                            "created_at": p.get('created_at'),
                            "score": p.get('score', 0),
                            "fav_count": p.get('fav_count', 0),
                            "rating": p.get('rating', 'g'),
                            "tag_string_artist": p.get('tag_string_artist', ''),
                            "tag_string_character": p.get('tag_string_character', ''),
                            "tag_string_copyright": p.get('tag_string_copyright', ''),
                            "tag_string_general": p.get('tag_string_general', ''),
                            "tag_string": p.get('tag_string', ''),
                            "preview_url": preview_url,
                            "source_url": f"https://danbooru.donmai.us/posts/{p.get('id')}",
                            "image_width": p.get('image_width'),
                            "image_height": p.get('image_height')
                        })
                    danbooru_success = True
        except Exception as d_err:
            print(f"--- Danbooru API 直连受限 ({d_err})，自动切换至 Danbooru 同步镜像 Safebooru ---")

        # 2. 高可用镜像降级 (Safebooru 100% 同步 Danbooru 标签)
        if not danbooru_success:
            try:
                clean_tags = re.sub(r'date:[^\s]+', '', tags)
                clean_tags = re.sub(r'score:>=', 'score:', clean_tags).strip()
                safebooru_params = urllib.parse.urlencode({
                    'page': 'dapi',
                    's': 'post',
                    'q': 'index',
                    'json': '1',
                    'tags': clean_tags or '1girl',
                    'limit': limit,
                    'pid': max(0, page - 1)
                })
                target_url = f'https://safebooru.org/index.php?{safebooru_params}'
                print(f"--- 正在请求 Safebooru 镜像: {target_url} ---")

                req = urllib.request.Request(
                    target_url,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    },
                    method='GET'
                )

                with urllib.request.urlopen(req, timeout=8) as response:
                    resp_data = response.read()
                    posts = json.loads(resp_data.decode('utf-8'))
                    if isinstance(posts, list):
                        for p in posts:
                            preview_url = p.get('sample_url') or p.get('preview_url') or p.get('file_url') or ''
                            sanitized_posts.append({
                                "id": p.get('id'),
                                "created_at": str(p.get('change', '')),
                                "score": p.get('score') or 0,
                                "fav_count": p.get('comment_count', 0),
                                "rating": p.get('rating', 'g'),
                                "tag_string_artist": '',
                                "tag_string_character": '',
                                "tag_string_copyright": '',
                                "tag_string_general": p.get('tags', ''),
                                "tag_string": p.get('tags', ''),
                                "preview_url": preview_url,
                                "source_url": f"https://safebooru.org/index.php?page=post&s=view&id={p.get('id')}",
                                "image_width": p.get('width'),
                                "image_height": p.get('height')
                            })
            except Exception as s_err:
                print(f"--- Safebooru 镜像请求失败: {s_err} ---")

        return sanitized_posts

    def do_GET(self):
        if self.path.startswith('/danbooru') or self.path.startswith('/api/danbooru'):
            try:
                parsed_url = urllib.parse.urlparse(self.path)
                params = urllib.parse.parse_qs(parsed_url.query)
                tags = params.get('tags', [''])[0]
                limit = min(int(params.get('limit', ['20'])[0]), 50)
                page = int(params.get('page', ['1'])[0])

                posts = self.fetch_booru_posts(tags, limit, page)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "count": len(posts), "posts": posts}).encode('utf-8'))
            except Exception as e:
                print(f"--- 本地代理 Danbooru GET 错误: {str(e)} ---")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            super().do_GET()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"本地测试服务器已启动: http://localhost:{PORT}")
        print("请在浏览器中打开这个地址，然后在新弹出的页面里按 F12 打开开发者工具。")
        print("在控制台中发出的所有异常，以及在这里的终端输出都会对我们大有帮助！")
        httpd.serve_forever()
