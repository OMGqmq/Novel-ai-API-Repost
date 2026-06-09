import { ImageEngine } from './engine.js?v=202605292218';
import { GalleryStore } from './storage.js?v=202605292218';
import { UIController } from './ui.js?v=202605292218';
import { InpaintEditor } from './inpaint.js?v=202605292218';
import { OutpaintEditor } from './outpaint.js?v=202605292218';
import { PromptHelper } from './prompt-helper.js?v=202605292218';
import { NotebookManager } from './notebook.js?v=202605292218';
import { VibeManager } from './vibe-manager.js?v=202605292218';



function triggerDownload(url, filename) {
    console.log('[DEBUG-dl] triggerDownload called with filename:', filename);
    
    // 检测是否在微信浏览器中
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (isWeChat) {
        console.warn('[DEBUG-dl] Blocked due to WeChat environment.');
        if (window.showToast) {
            window.showToast('微信内无法直接下载，请长按图片选择“保存图片”，或在右上角选择在浏览器中打开。', 'warning');
        } else {
            alert('微信内无法直接下载，请长按图片选择“保存图片”，或在右上角选择在浏览器中打开。');
        }
        return;
    }

    const a = document.createElement('a');
    let blobUrl = null;
    
    if (url.startsWith('data:')) {
        console.log('[DEBUG-dl] Detecting data URL, converting to blob...');
        try {
            const parts = url.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const binary = atob(parts[1]);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([array], { type: mime });
            blobUrl = URL.createObjectURL(blob);
            a.href = blobUrl;
            console.log('[DEBUG-dl] Data URL successfully converted to Blob URL:', blobUrl);
        } catch (e) {
            console.error('[DEBUG-dl] Failed to convert dataURL to blob, falling back to data URL', e);
            a.href = url;
        }
    } else {
        console.log('[DEBUG-dl] Direct/Blob URL used:', url.substring(0, 120));
        a.href = url;
    }
    
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    console.log('[DEBUG-dl] Anchor element appended to DOM. Triggering click...');
    a.click();
    
    // 异步延迟 200ms 移除，让浏览器后台有足够时间拉起保存会话
    setTimeout(() => {
        document.body.removeChild(a);
        console.log('[DEBUG-dl] Anchor element removed from DOM.');
    }, 200);
    
    if (blobUrl) {
        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            console.log('[DEBUG-dl] Revoked blob URL:', blobUrl);
        }, 1500);
    }
}

// PromptHelper is now imported from './prompt-helper.js'

const engine = new ImageEngine();
const store = new GalleryStore();
const ui = new UIController();
const els = ui.els;

const notebookManager = new NotebookManager({
    listContainerEl: document.getElementById('notebookList'),
    onApplyNote: ({ prompt, negative, model }) => {
        els.prompt.value = prompt;
        els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
        if (negative) {
            els.negative.value = negative;
            els.negative.dispatchEvent(new Event('input', { bubbles: true }));
        }
        window.setModel(model);
        if (window.innerWidth < 768) ui.toggleDrawer();
        ui.toggleMobileControls(true);
        window.showToast('已应用笔记提示词', 'success', 1500);
    },
    onShowToast: (msg, type, duration) => window.showToast ? window.showToast(msg, type, duration) : console.log(msg),
    onConfirm: (msg, title, icon) => window.showConfirm ? window.showConfirm(msg, title, icon) : Promise.resolve(window.confirm(msg)),
    onOpenLightbox: (item) => window.openLightbox ? window.openLightbox(item) : console.log('Open lightbox', item)
});

const vibeManager = new VibeManager({
    store: store,
    compressImage: compressImage,
    onShowToast: (msg, type) => window.showToast ? window.showToast(msg, type) : console.log(msg)
});

let currentInitImageBase64 = null; 
let currentImageId = null;
let currentImageData = null;
let showcaseData = [];
let currentGalleryTab = 'showcase';

function loadVibeState(model) {
    vibeManager.loadState(model);
}

function safeCreateIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        // 延迟一下确保 DOM 已更新
        setTimeout(() => {
            try {
                lucide.createIcons();
            } catch (e) {
                console.warn('Lucide icons creation failed:', e);
            }
        }, 10);
    }
}
window.safeCreateIcons = safeCreateIcons;
safeCreateIcons();

// 缓存加载
try {
    const savedPrompt = store.getSetting('nai_prompt');
    if (savedPrompt && els.prompt) els.prompt.value = savedPrompt;
    const savedNegative = store.getSetting('nai_negative_prompt');
    if (savedNegative && els.negative) els.negative.value = savedNegative;

    if (els.prompt) {
        els.prompt.addEventListener('input', (e) => store.setSetting('nai_prompt', e.target.value));
    }
    if (els.negative) {
        els.negative.addEventListener('input', (e) => store.setSetting('nai_negative_prompt', e.target.value));
    }

    // Restore model version first
    const savedModel = store.getSetting('nai_model_version', 'v3');
    ui.setModel(savedModel);

    // Restore Vibe settings from storage
    loadVibeState(savedModel);

    // Restore low performance mode
    const savedLowPerf = store.getSetting('low_perf') === 'true';
    if (savedLowPerf) {
        document.documentElement.classList.add('low-perf');
        updateLowPerfUI(true);
    }

    // Restore V4.5 experimental settings
    const savedV45Exp = store.getSetting('v4_5_experimental') === 'true';
    const v45ExpCheckbox = document.getElementById('settingsV45ExperimentalCheckbox');
    if (v45ExpCheckbox) {
        v45ExpCheckbox.checked = savedV45Exp;
    }

    // Restore V4.5 customized parameters
    const savedEulerBug = store.getSetting('nai_v45_euler_bug', 'false') === 'true';
    const savedPreferBrownian = store.getSetting('nai_v45_prefer_brownian', 'true') === 'true';
    const savedUseCoords = store.getSetting('nai_v45_use_coords', 'true') === 'true';
    const savedUseOrder = store.getSetting('nai_v45_use_order', 'true') === 'true';
    const savedNegUseOrder = store.getSetting('nai_v45_neg_use_order', 'false') === 'true';

    const eulerBugEl = document.getElementById('v45EulerBug');
    const preferBrownianEl = document.getElementById('v45PreferBrownian');
    const useCoordsEl = document.getElementById('v45UseCoords');
    const useOrderEl = document.getElementById('v45UseOrder');
    const negUseOrderEl = document.getElementById('v45NegUseOrder');

    if (eulerBugEl) {
        eulerBugEl.checked = savedEulerBug;
        eulerBugEl.addEventListener('change', e => store.setSetting('nai_v45_euler_bug', e.target.checked ? 'true' : 'false'));
    }
    if (preferBrownianEl) {
        preferBrownianEl.checked = savedPreferBrownian;
        preferBrownianEl.addEventListener('change', e => store.setSetting('nai_v45_prefer_brownian', e.target.checked ? 'true' : 'false'));
    }
    if (useCoordsEl) {
        useCoordsEl.checked = savedUseCoords;
        useCoordsEl.addEventListener('change', e => store.setSetting('nai_v45_use_coords', e.target.checked ? 'true' : 'false'));
    }
    if (useOrderEl) {
        useOrderEl.checked = savedUseOrder;
        useOrderEl.addEventListener('change', e => store.setSetting('nai_v45_use_order', e.target.checked ? 'true' : 'false'));
    }
    if (negUseOrderEl) {
        negUseOrderEl.checked = savedNegUseOrder;
        negUseOrderEl.addEventListener('change', e => store.setSetting('nai_v45_neg_use_order', e.target.checked ? 'true' : 'false'));
    }

    // Restore bypass limits settings
    const savedBypass = store.getSetting('nai_bypass_limits') === 'true';
    const checkbox = document.getElementById('bypassLimitsEnabled');
    if (checkbox) {
        checkbox.checked = savedBypass;
        toggleBypassLimitsEnabled(savedBypass);
    }

    // Restore advanced settings
    const savedSm = store.getSetting('nai_sm', 'true') === 'true';
    const savedSmDyn = store.getSetting('nai_sm_dyn', 'true') === 'true';
    const savedQuality = store.getSetting('nai_quality_toggle', 'false') === 'true';
    const savedDynThreshold = store.getSetting('nai_dyn_threshold', 'false') === 'true';
    const savedCfgRescale = store.getSetting('nai_cfg_rescale', '0.00');
    const savedUncondScale = store.getSetting('nai_uncond_scale', '1.00');
    const savedSkipCfg = store.getSetting('nai_skip_cfg', '19');

    const smEl = document.getElementById('smEnabled');
    const smDynEl = document.getElementById('smDynEnabled');
    const qualityEl = document.getElementById('qualityToggleEnabled');
    const dynThresholdEl = document.getElementById('dynThresholdEnabled');
    const cfgRescaleEl = document.getElementById('cfgRescale');
    const uncondScaleEl = document.getElementById('uncondScale');
    const skipCfgEl = document.getElementById('skipCfg');

    if (smEl) smEl.checked = savedSm;
    if (smDynEl) smDynEl.checked = savedSmDyn;
    if (qualityEl) qualityEl.checked = savedQuality;
    if (dynThresholdEl) dynThresholdEl.checked = savedDynThreshold;
    if (cfgRescaleEl) {
        cfgRescaleEl.value = savedCfgRescale;
        const vEl = document.getElementById('cfgRescaleValue');
        if (vEl) vEl.textContent = parseFloat(savedCfgRescale).toFixed(2);
    }
    if (uncondScaleEl) {
        uncondScaleEl.value = savedUncondScale;
        const vEl = document.getElementById('uncondScaleValue');
        if (vEl) vEl.textContent = parseFloat(savedUncondScale).toFixed(2);
    }
    if (skipCfgEl) {
        skipCfgEl.value = savedSkipCfg;
        const vEl = document.getElementById('skipCfgValue');
        if (vEl) vEl.textContent = savedSkipCfg;
    }

    // Save on change & update value label
    smEl?.addEventListener('change', e => store.setSetting('nai_sm', e.target.checked.toString()));
    smDynEl?.addEventListener('change', e => store.setSetting('nai_sm_dyn', e.target.checked.toString()));
    qualityEl?.addEventListener('change', e => store.setSetting('nai_quality_toggle', e.target.checked.toString()));
    dynThresholdEl?.addEventListener('change', e => store.setSetting('nai_dyn_threshold', e.target.checked.toString()));
    cfgRescaleEl?.addEventListener('input', e => {
        const vEl = document.getElementById('cfgRescaleValue');
        if (vEl) vEl.textContent = parseFloat(e.target.value).toFixed(2);
        store.setSetting('nai_cfg_rescale', e.target.value);
    });
    uncondScaleEl?.addEventListener('input', e => {
        const vEl = document.getElementById('uncondScaleValue');
        if (vEl) vEl.textContent = parseFloat(e.target.value).toFixed(2);
        store.setSetting('nai_uncond_scale', e.target.value);
    });
    skipCfgEl?.addEventListener('input', e => {
        const vEl = document.getElementById('skipCfgValue');
        if (vEl) vEl.textContent = e.target.value;
        store.setSetting('nai_skip_cfg', e.target.value);
    });
} catch (e) {
    console.error("Initialization error (from cache):", e);
}

window.togglePanel = function(panelId, chevronId) {
    const panel = document.getElementById(panelId);
    const chevron = document.getElementById(chevronId);
    if (panel) {
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
            panel.classList.add('hidden');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    }
};

window.toggleAdvancedSettings = function() {
    window.togglePanel('advancedSettingsPanel', 'advChevron');
};

// Helper function to compress image
async function compressImage(file, maxPixels = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                let w = img.width;
                let h = img.height;
                if (w * h > maxPixels) {
                    const ratio = Math.sqrt(maxPixels / (w * h));
                    w = Math.floor(w * ratio);
                    h = Math.floor(h * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.9)); // Use JPEG for better compression
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleInitImage(event) {
    const file = event.target.files[0];
    if (file) {
        try {
            const compressedDataUrl = await compressImage(file);
            currentInitImageBase64 = compressedDataUrl.split(',')[1];
            document.getElementById('initImagePreview').src = compressedDataUrl;
            document.getElementById('initImagePreview').classList.remove('hidden');
            document.getElementById('initImagePlaceholder').classList.add('hidden');
            document.getElementById('clearInitImageBtn').classList.remove('hidden');
            document.getElementById('img2imgControls').classList.remove('hidden');
        } catch (e) {
            console.error("Failed to compress image", e);
            alert("图片处理失败，请重试。");
        }
    }
}
function clearInitImage() {
    currentInitImageBase64 = null;
    document.getElementById('initImageInput').value = '';
    document.getElementById('initImagePreview').src = '';
    document.getElementById('initImagePreview').classList.add('hidden');
    document.getElementById('initImagePlaceholder').classList.remove('hidden');
    document.getElementById('clearInitImageBtn').classList.add('hidden');
    document.getElementById('img2imgControls').classList.add('hidden');
}

window.handleVibeImage = (event) => vibeManager.handleVibeImage(event, document.getElementById('modelValue').value);
window.clearVibeImage = () => vibeManager.clearVibeImage(document.getElementById('modelValue').value);
window.toggleVibeEnabled = () => vibeManager.toggleVibeEnabled(document.getElementById('modelValue').value);
window.onVibeStrengthSelect = (index) => vibeManager.selectVibeStrength(index, document.getElementById('modelValue').value);

document.getElementById('strength')?.addEventListener('input', e => document.getElementById('strengthValue').textContent = e.target.value);
document.getElementById('noise')?.addEventListener('input', e => document.getElementById('noiseValue').textContent = e.target.value);
document.getElementById('vibeStrength')?.addEventListener('input', (e) => {
    const val = e.target.value;
    const model = document.getElementById('modelValue').value;
    document.getElementById('vibeStrengthValue').textContent = parseFloat(val).toFixed(2);
    store.setSetting(vibeManager.getVibeKey('nai_vibe_strength', model), val);
});

// 全局错误捕获，防止界面卡死
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error: ' + msg + '\nScript: ' + url + '\nLine: ' + lineNo + '\nColumn: ' + columnNo + '\nStackTrace: ' + (error ? error.stack : ''));
    if (window.ui) window.ui.setLoading(false);
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled rejection (promise):', event.reason);
    if (window.ui) window.ui.setLoading(false);
};

async function doGenerate() {
    // Check if outpaint is active
    const outpaintArea = document.getElementById('outpaintArea');
    if (outpaintArea && !outpaintArea.classList.contains('hidden')) {
        if (window.outpaintEditor) {
            window.outpaintEditor.generate();
        }
        return;
    }

    try {
        const promptText = els.prompt.value.trim();
        if (!promptText) { els.prompt.focus(); ui.toggleMobileControls(true); return; }

        const selectedVersion = document.getElementById('modelValue').value;
        const resEl = document.getElementById('resolution');
        if (!resEl) throw new Error("找不到分辨率选择器");
        const [w, h] = resEl.value.split(',').map(Number);
        
        // 获取所有自定义 Key
        const customApiKeyRaw = store.getSetting('nai_custom_api_key');
        const customApiKeys = (customApiKeyRaw || "")
            .split(/[\n,]/)
            .map(k => k.trim())
            .filter(k => k);

        const authBase = {
            adminToken: store.getSetting('nai_admin_token'),
            userKey: store.getSetting('nai_user_key'),
            userToken: localStorage.getItem('nai_user_token') || ""
        };

        // 如果有多个 Key,构造多个 auth 对象用于并发
        const auths = customApiKeys.length > 0 
            ? customApiKeys.map(key => ({ ...authBase, customApiKey: key }))
            : [{ ...authBase, customApiKey: "" }];

        const isAdmin = !!authBase.adminToken || customApiKeys.length > 0;

        let batchTotal = 1;
        if (isAdmin && els.batchCount) {
            batchTotal = parseInt(els.batchCount.value) || 1;
        }

        if (ui.currentRightView !== 'preview') ui.switchRightView('preview');
        ui.toggleMobileControls(false);
        
        const vibeVal = vibeManager.isValidForModel(selectedVersion);
        if (!vibeVal.isValid) {
            alert(vibeVal.error);
            ui.setLoading(false);
            ui.toggleMobileControls(true);
            return;
        }

        for (let i = 0; i < batchTotal; i++) {
            const statusText = batchTotal > 1 ? `生成中 (${i + 1}/${batchTotal})` : "生成中...";
            ui.setLoading(true, statusText);

            try {
                const nsEl = document.getElementById('noise_schedule');
                const smEl = document.getElementById('smEnabled');
                const smDynEl = document.getElementById('smDynEnabled');
                const qualityEl = document.getElementById('qualityToggleEnabled');
                const dynThresholdEl = document.getElementById('dynThresholdEnabled');
                const cfgRescaleEl = document.getElementById('cfgRescale');
                const uncondScaleEl = document.getElementById('uncondScale');
                const skipCfgEl = document.getElementById('skipCfg');

                const params = {
                    version: selectedVersion,
                    prompt: promptText,
                    negative_prompt: els.negative.value.trim(),
                    width: w, height: h,
                    steps: parseInt(els.steps.value),
                    scale: parseFloat(els.scale.value),
                    sampler: els.sampler.value,
                    noise_schedule: nsEl ? nsEl.value : "exponential",
                    sm: (selectedVersion === 'v4.5') ? false : (smEl ? smEl.checked : true),
                    sm_dyn: (selectedVersion === 'v4.5') ? false : (smDynEl ? smDynEl.checked : true),
                    qualityToggle: qualityEl ? qualityEl.checked : false,
                    dynamic_thresholding: dynThresholdEl ? dynThresholdEl.checked : false,
                    cfg_rescale: cfgRescaleEl ? parseFloat(cfgRescaleEl.value) : 0.0,
                    uncond_scale: uncondScaleEl ? parseFloat(uncondScaleEl.value) : 1.0
                };

                if (selectedVersion === 'v4.5') {
                    const isExp = store.getSetting('v4_5_experimental', 'false') === 'true';
                    params.v4_5_experimental = isExp;
                    
                    // 搜集多角色提示词 (Character Prompts)
                    const charRows = document.querySelectorAll('.character-prompt-row');
                    const charCaptions = [];
                    let hasCustomCoords = false;
                    charRows.forEach(row => {
                        const enableToggle = row.querySelector('.char-enable-toggle');
                        if (enableToggle && !enableToggle.checked) {
                            return; // 忽略未启用的角色框
                        }
                        
                        const promptInput = row.querySelector('.char-prompt-input');
                        const negInput = row.querySelector('.char-neg-input');
                        const posXInput = row.querySelector('.char-pos-x');
                        const posYInput = row.querySelector('.char-pos-y');
                        const autoPosCheckbox = row.querySelector('.char-auto-pos');
                        
                        const promptVal = promptInput ? promptInput.value.trim() : "";
                        const negVal = negInput ? negInput.value.trim() : "";
                        const x = posXInput ? parseFloat(posXInput.value) : 0.5;
                        const y = posYInput ? parseFloat(posYInput.value) : 0.5;
                        const isAutoPos = autoPosCheckbox ? autoPosCheckbox.checked : true;
                        
                        if (promptVal) {
                            charCaptions.push({
                                prompt: promptVal,
                                negative_prompt: negVal,
                                x: x,
                                y: y
                            });
                            if (!isAutoPos) {
                                hasCustomCoords = true;
                            }
                        }
                    });

                    if (charCaptions.length > 0) {
                        params.char_captions = charCaptions;
                    }
                    
                    if (isExp) {
                        const eulerBugEl = document.getElementById('v45EulerBug');
                        const preferBrownianEl = document.getElementById('v45PreferBrownian');
                        const useCoordsEl = document.getElementById('v45UseCoords');
                        const useOrderEl = document.getElementById('v45UseOrder');
                        const negUseOrderEl = document.getElementById('v45NegUseOrder');
                        
                        if (eulerBugEl) params.deliberate_euler_ancestral_bug = eulerBugEl.checked;
                        if (preferBrownianEl) params.prefer_brownian = preferBrownianEl.checked;
                        if (useCoordsEl) params.v4_prompt_use_coords = useCoordsEl.checked;
                        if (useOrderEl) params.v4_prompt_use_order = useOrderEl.checked;
                        if (negUseOrderEl) params.v4_neg_use_order = negUseOrderEl.checked;
                    }
                    
                    // 如果存在自定义坐标，则强行覆盖开启坐标解析功能
                    if (hasCustomCoords) {
                        params.v4_prompt_use_coords = true;
                    }
                    
                    if (skipCfgEl) {
                        params.skip_cfg_above_sigma = isExp ? parseInt(skipCfgEl.value) : null;
                    }
                }

                if (currentInitImageBase64) {
                    const strEl = document.getElementById('strength');
                    const noiEl = document.getElementById('noise');
                    params.image = currentInitImageBase64;
                    params.strength = strEl ? parseFloat(strEl.value) : 0.5;
                    params.noise = noiEl ? parseFloat(noiEl.value) : 0;
                }
                
                const vibeParams = vibeManager.getPayloadParams(selectedVersion);
                Object.assign(params, vibeParams);

                // 读取用户指定的 Seed
                const seedEl = document.getElementById('seed');
                const userSeedVal = seedEl ? seedEl.value.trim() : "";

                // 为每个 API 实例生成 seed，避免产生的图片完全相同
                const localParamsList = auths.map((auth, idx) => {
                    let finalSeed;
                    if (userSeedVal && !isNaN(userSeedVal)) {
                        // 用户指定了 Seed。在批量循环第 i 次，多 API 轮询第 idx 个时，
                        // 我们使用 userSeedVal + i + idx，既保证批量各不相同，也保证多 API 并发时不重复，
                        // 同时也保证了单张生成时完全等于用户输入的 Seed。
                        finalSeed = (parseInt(userSeedVal) + i + idx) % 4294967296;
                    } else {
                        finalSeed = Math.floor(Math.random() * 4294967295);
                    }
                    return {
                        ...params,
                        seed: finalSeed
                    };
                });

                // 并发执行！
                const fetchPromises = auths.map((auth, idx) => engine.generate(localParamsList[idx], auth));
                const results = await Promise.allSettled(fetchPromises);

                const successfulResults = [];
                results.forEach((res, idx) => {
                    if (res.status === 'fulfilled') {
                        const result = res.value;
                        const localParams = localParamsList[idx];
                        if (result.userRole) {
                            ui.updateCreditDisplay(result.userRole);
                        }
                        successfulResults.push(result);

                        // 组装元数据
                        const metaData = {
                            negative_prompt: localParams.negative_prompt,
                            width: localParams.width,
                            height: localParams.height,
                            steps: localParams.steps,
                            scale: localParams.scale,
                            sampler: localParams.sampler,
                            seed: localParams.seed,
                            strength: localParams.strength || null,
                            noise: localParams.noise || null
                        };

                        // 转Base64存历史
                        const reader = new FileReader();
                        reader.readAsDataURL(result.blob);
                        reader.onloadend = async () => {
                            await saveToHistory(reader.result, promptText, selectedVersion, result, false, metaData);
                        }
                    } else {
                        console.error("Concurrent Gen Error:", res.reason);
                    }
                });

                if (successfulResults.length === 0) {
                    const firstError = results.find(r => r.status === 'rejected')?.reason || new Error("所有 API 请求均失败");
                    throw firstError;
                }

                // 批量展示！
                ui.showResultImages(successfulResults, (selected) => {
                    currentImageData = selected;
                    if (selected.id) currentImageId = selected.id;
                    window.lastSelectedImageUrl = selected.imageUrl;
                });

            } catch (err) {
                console.error(err);
                ui.setLoading(false);
                ui.toggleMobileControls(true);
                if (err.message.includes('429')) alert("⚠️ 并发生成,请稍候重试");
                else if (err.message.includes('403')) alert("后端账号已封禁");
                else alert("生成失败: " + err.message);
                break;
            }
        }
    } catch (globalErr) {
        console.error("Global doGenerate Error:", globalErr);
        alert("发生意外错误: " + globalErr.message);
    } finally {
        ui.setLoading(false);
    }
}

els.deskBtn.addEventListener('click', doGenerate);
els.floatBtn.addEventListener('click', doGenerate);

window.downloadImage = function() {
    const url = window.lastSelectedImageUrl;
    if (url) {
        const isJpeg = url.startsWith('data:image/jpeg');
        const filename = `novelai-gen-${Date.now()}.${isJpeg ? 'jpg' : 'png'}`;
        triggerDownload(url, filename);
    }
}

// --- Store Integration ---
store.init().then(() => loadGallery());

async function saveToHistory(imgData, prompt, model, resultObj = null, forceFocus = false, meta = null) {
    try {
        const savedItem = await store.saveImage(imgData, prompt, model, meta);
        if (resultObj) {
            resultObj.id = savedItem.id;
        }
        
        // If it's a legacy call (no resultObj) or we force focus, OR if the newly saved result is what the user is currently viewing
        if (forceFocus || (!resultObj && !forceFocus) || (resultObj && currentImageData === resultObj)) {
            currentImageId = savedItem.id;
            currentImageData = savedItem;
            ui.showImageActions(true);
        }
        
        loadGallery();
        return savedItem;
    } catch (e) {
        console.error("Failed to save to history", e);
    }
}

async function deleteCurrentImage() {
    if (currentImageData && currentImageData.isShowcase) return;
    if (!currentImageId || !(await window.showConfirm("您确定要从历史记录中删除这张图片吗？", "删除图片", "trash-2"))) return;
    try {
        await store.deleteImage(currentImageId);
        ui.resetPreview();
        loadGallery();
    } catch (e) {
        console.error("Failed to delete image", e);
    }
}

async function clearAllHistory() {
    if (!(await window.showConfirm("清空历史将永久删除所有已生成的本地图片，确定要继续吗？", "清空历史记录", "alert-triangle"))) return;
    try {
        await store.clearAll();
        loadGallery();
        ui.resetPreview();
    } catch (e) {
        console.error("Failed to clear history", e);
    }
}

function toggleToolbox() {
    const menu = document.getElementById('toolboxMenu');
    if (menu.classList.contains('opacity-0')) {
        menu.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        menu.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
    } else {
        menu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
        menu.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
    }
}

document.addEventListener('click', (e) => {
    const container = document.getElementById('toolboxContainer');
    if (container && !container.contains(e.target)) {
        const menu = document.getElementById('toolboxMenu');
        if (menu && menu.classList.contains('opacity-100')) {
            toggleToolbox();
        }
    }
});

async function doAugment(reqType) {
    if (!currentImageData || !(currentImageData.imageUrl || currentImageData.image)) return;
    
    const imageUrl = currentImageData.imageUrl || currentImageData.image;
    
    const authBase = {
        adminToken: store.getSetting('nai_admin_token'),
        userKey: store.getSetting('nai_user_key'),
        userToken: localStorage.getItem('nai_user_token') || ""
    };
    const customApiKeyRaw = store.getSetting('nai_custom_api_key');
    const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
    const auth = customApiKeys.length > 0 
        ? { ...authBase, customApiKey: customApiKeys[0] } 
        : { ...authBase, customApiKey: "" };

    ui.setLoading(true, "处理中...");
    try {
        // Fetch the current image to convert it to base64
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // create an Image to get width/height, and to draw to canvas if resizing is needed, but for simplicity let's just use it as is if it's not too big. 
        // Since NAI expects width/height, we should measure it.
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            const reader = new FileReader();
            reader.onloadend = () => {
                img.src = reader.result;
            };
            reader.readAsDataURL(blob);
        });
        
        // 移除 "data:image/png;base64," 等前缀
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        
        // Limit to 1024x1024 equivalent pixels for Opus Free
        if (w * h > 1024 * 1024) {
            const ratio = Math.sqrt((1024 * 1024) / (w * h));
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
        }
        
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const base64Data = canvas.toDataURL('image/png').split(',')[1];

        const params = {
            req_type: reqType,
            width: w,
            height: h,
            image: base64Data
        };

        const result = await engine.augment(params, auth);
        
        if (result.userRole) {
            ui.updateCreditDisplay(result.userRole);
        }

        // Save to history
        const reader2 = new FileReader();
        reader2.readAsDataURL(result.blob);
        reader2.onloadend = async () => {
            await saveToHistory(reader2.result, `[${reqType}] ` + (currentImageData.prompt || ""), currentImageData.model || "v3", result, true);
        };

        ui.showResultImages([result], (selected) => {
            currentImageData = selected;
            if (selected.id) currentImageId = selected.id;
            window.lastSelectedImageUrl = selected.imageUrl;
        });

    } catch (err) {
        console.error(err);
        if (err.message.includes('429')) alert("⚠️ 请求频繁,请稍候重试");
        else alert("处理失败: " + err.message);
    } finally {
        ui.setLoading(false);
    }
}

// --- 历史图库分页流式加载与滚动渲染 ---
let galleryPage = 0;
let galleryHasMore = true;
let galleryLoading = false;
let galleryItems = [];

async function loadGallery() {
    galleryPage = 0;
    galleryHasMore = true;
    galleryLoading = false;
    galleryItems = [];
    els.galleryGrid.innerHTML = '';
    
    await loadMoreGallery(true);
}

async function loadMoreGallery(isFirstLoad = false) {
    if (galleryLoading || (!galleryHasMore && !isFirstLoad)) return;
    galleryLoading = true;

    let loaderEl = document.getElementById('galleryLoader');
    if (!loaderEl) {
        loaderEl = document.createElement('div');
        loaderEl.id = 'galleryLoader';
        loaderEl.className = 'col-span-full py-4 flex justify-center text-gray-400 text-xs font-semibold';
        loaderEl.innerHTML = '<span class="loader w-4 h-4 mr-2"></span> 正在加载历史图片...';
        els.galleryGrid.appendChild(loaderEl);
    }

    try {
        const limit = 24;
        const pageData = await store.getImagesPage(galleryPage, limit);
        
        loaderEl = document.getElementById('galleryLoader');
        if (loaderEl && loaderEl.parentNode) {
            loaderEl.parentNode.removeChild(loaderEl);
        }

        if (pageData.length < limit) {
            galleryHasMore = false;
        }

        if (isFirstLoad) {
            els.galleryGrid.innerHTML = '';
            galleryItems = [];
        }

        if (pageData.length === 0) {
            if (galleryPage === 0) {
                els.emptyGallery.classList.remove('hidden');
                els.zipBtn.classList.add('hidden');
                els.clearBtn.classList.add('hidden');
            }
            return;
        }

        els.emptyGallery.classList.add('hidden');
        if (ui.currentRightView === 'history') {
            els.zipBtn.classList.remove('hidden');
            els.clearBtn.classList.remove('hidden');
        }

        galleryItems = galleryItems.concat(pageData);

        const fragment = document.createDocumentFragment();
        pageData.forEach(item => {
            const el = document.createElement('div');
            el.className = 'gallery-item aspect-square bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border dark:border-slate-700 cursor-pointer shadow-sm hover:scale-[1.01] transition-transform duration-200';
            
            // Render image and delete button
            el.innerHTML = `
                <img src="${item.image}" class="w-full h-full object-cover" loading="lazy">
                <button class="delete-item-btn" title="删除此图片">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;

            // Bind click event for delete button with stopPropagation to prevent triggering lightbox
            const delBtn = el.querySelector('.delete-item-btn');
            if (delBtn) {
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (!(await window.showConfirm("您确定要从历史图库中删除这张图片吗？该操作不可撤销。", "删除图库图片", "trash-2"))) return;
                    try {
                        await store.deleteImage(item.id);
                        if (currentImageId === item.id) {
                            ui.resetPreview();
                        }
                        loadGallery();
                    } catch (err) {
                        console.error("Failed to delete history image", err);
                    }
                };
            }

            el.onclick = () => openLightbox(item);
            fragment.appendChild(el);
        });
        els.galleryGrid.appendChild(fragment);

        galleryPage++;
    } catch (e) {
        console.error("Failed to load gallery page", e);
    } finally {
        galleryLoading = false;
    }
}

// 监听图库容器滚动事件以实现无限滚动加载
const historyArea = document.getElementById('historyArea');
if (historyArea) {
    historyArea.addEventListener('scroll', () => {
        if (historyArea.scrollTop + historyArea.clientHeight >= historyArea.scrollHeight - 100) {
            loadMoreGallery();
        }
    });
}

function loadPreviewFromHistory(item) {
    ui.switchRightView('preview');
    ui.showResultImage(item.image);
    currentImageId = item.id;
    currentImageData = { ...item, imageUrl: item.image };
    window.lastSelectedImageUrl = item.image;
    ui.showImageActions(true);
    ui.toggleMobileControls(false);
}

function useCurrentPrompt() {
    if (!currentImageData) return;
    els.prompt.value = currentImageData.prompt;
    els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
    ui.setModel(currentImageData.model || 'v3');
    els.prompt.classList.add('bg-blue-50', 'dark:bg-blue-900/30');
    setTimeout(() => els.prompt.classList.remove('bg-blue-50', 'dark:bg-blue-900/30'), 500);
    ui.toggleMobileControls(true);
}

async function downloadZip() {
    try {
        const items = await store.getAllImages();
        if (!items.length) return;
        const zip = new JSZip();
        const folder = zip.folder("novelai_gallery");
        items.forEach((item, idx) => {
            // 清洗提示词以生成安全的文件名，并截取前 30 个字符
            const safePrompt = item.prompt 
                ? item.prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').replace(/_+/g, '_').substring(0, 30) 
                : '';
            const cleanPrompt = safePrompt.trim().replace(/^_+|_+$/g, '');
            const filename = `${idx}_${cleanPrompt || 'untitled'}.png`;
            folder.file(filename, item.image.split(',')[1], { base64: true });
        });
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const filename = `history_${Date.now()}.zip`;
        triggerDownload(url, filename);
    } catch (e) {
        console.error("Failed to generate zip", e);
    }
}

function getActiveCanvasImage() {
    // 1. 如果单图聚焦区域可见且有 src
    if (ui.els.singleResultImg && !ui.els.singleResultArea.classList.contains('hidden') && ui.els.singleResultImg.src) {
        const src = ui.els.singleResultImg.src;
        if (src && !src.startsWith('chrome-extension') && src !== window.location.href) {
            return src;
        }
    }
    
    // 2. 如果网格显示，寻找被选中的（带蓝色边框的）图片
    if (ui.els.resultGrid && !ui.els.resultGrid.classList.contains('hidden')) {
        const selectedImg = ui.els.resultGrid.querySelector('img.border-blue-500');
        if (selectedImg && selectedImg.src) {
            return selectedImg.src;
        }
        
        // 3. 取网格中的第一张图片
        const firstImg = ui.els.resultGrid.querySelector('img');
        if (firstImg && firstImg.src) {
            return firstImg.src;
        }
    }
    
    // 4. 兜底使用 window.lastSelectedImageUrl
    if (window.lastSelectedImageUrl) {
        return window.lastSelectedImageUrl;
    }
    
    return null;
}

function saveCurrentPromptToNotebook() {
    const prompt = els.prompt.value.trim();
    const negative = els.negative.value.trim();
    const imageSrc = getActiveCanvasImage();
    notebookManager.saveNote({ prompt, negative, imageSrc });
}

function switchNotebookModel(model) {
    notebookManager.switchModel(model);
}

function renderNotebookNotes(model) {
    notebookManager.render(model);
}

function applyNotebookNote(model, noteId) {
    notebookManager.applyNote(model, noteId);
}

function editNotebookNote(model, noteId) {
    notebookManager.editNote(model, noteId);
}

function confirmEditNote(model, noteId) {
    notebookManager.confirmEditNote(model, noteId);
}

function cancelEditNote(model) {
    notebookManager.cancelEditNote(model);
}

function deleteNotebookNote(model, noteId) {
    notebookManager.deleteNote(model, noteId);
}

function bindCurrentCanvasToNote(model, noteId) {
    const imageSrc = getActiveCanvasImage();
    notebookManager.bindCurrentCanvasToNote(model, noteId, imageSrc);
}

function removeNotePreview(model, noteId) {
    notebookManager.removeNotePreview(model, noteId);
}

function viewNotebookNotePreview(model, noteId) {
    notebookManager.viewNotebookNotePreview(model, noteId);
}

function exportNotebook() {
    notebookManager.exportNotebook();
}

function triggerImportNotebook() {
    notebookManager.triggerImportNotebook();
}

function importNotebook(event) {
    notebookManager.importNotebook(event);
}

// --- 暴露给 Window 的代理方法 ---
const renderNotebookCallback = () => notebookManager.render();

Object.assign(window, {
    toggleMobileControls: (s) => ui.toggleMobileControls(s),
    setModel: (v) => {
        ui.setModel(v);
        store.setSetting('nai_model_version', v);
        loadVibeState(v);
    },
    switchRightView: (v) => ui.switchRightView(v, (tab) => switchGalleryTab(tab)),
    toggleDrawer: () => ui.toggleDrawer(),
    switchDrawerTab: (t) => ui.switchDrawerTab(t, renderNotebookCallback),
    openNotebook: () => ui.openNotebook(renderNotebookCallback),
    handleInitImage, clearInitImage, doGenerate, useCurrentPrompt,
    deleteCurrentImage, clearAllHistory, switchGalleryTab, downloadZip,
    backToGrid: () => ui.showGrid(),
    doAugment, toggleToolbox
});

fetch('gallery_index.json').then(r => r.json()).then(d => {
    showcaseData = d;
    // 数据就绪后,若当前在展示 tab 且 grid 为空则立即渲染
    const grid = document.getElementById('showcaseGrid');
    if (currentGalleryTab === 'showcase' && grid && grid.children.length === 0) {
        renderShowcase();
    }
}).catch(() => { });

function switchGalleryTab(tab) {
    currentGalleryTab = tab;
    const tabShowcase = document.getElementById('tabShowcase');
    const tabHistory = document.getElementById('tabHistory');
    const showcaseGrid = document.getElementById('showcaseGrid');
    const activeClass = 'px-4 py-1.5 text-[11px] font-semibold rounded-full transition-all bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm';
    const inactiveClass = 'px-4 py-1.5 text-[11px] font-semibold rounded-full transition-all text-gray-500 dark:text-gray-400';
    if (tab === 'showcase') {
        tabShowcase.className = activeClass;
        tabHistory.className = inactiveClass;
        showcaseGrid.classList.remove('hidden');
        els.galleryGrid.classList.add('hidden');
        els.emptyGallery.classList.add('hidden');
        els.zipBtn.classList.add('hidden');
        els.clearBtn.classList.add('hidden');
        if (showcaseGrid.children.length === 0) renderShowcase();
    } else {
        tabShowcase.className = inactiveClass;
        tabHistory.className = activeClass;
        showcaseGrid.classList.add('hidden');
        els.galleryGrid.classList.remove('hidden');
        els.zipBtn.classList.remove('hidden');
        els.clearBtn.classList.remove('hidden');
        loadGallery();
    }
}

function renderShowcase() {
    const grid = document.getElementById('showcaseGrid');
    if (!grid || showcaseData.length === 0) return;
    grid.innerHTML = '';
    
    // 分批渲染
    const chunkSize = 24;
    let index = 0;

    function renderChunk() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(index + chunkSize, showcaseData.length);
        for (; index < end; index++) {
            const item = showcaseData[index];
            const el = document.createElement('div');
            el.className = 'gallery-item aspect-square bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border dark:border-slate-700 cursor-pointer shadow-sm hover:shadow-md transition-shadow';
            const img = document.createElement('img');
            img.className = 'w-full h-full object-cover';
            img.loading = 'lazy';
            img.src = `images/${item.id}.png`;
            img.alt = '';
            el.appendChild(img);
            el.onclick = () => { item.isShowcase = true; openLightbox(item); };
            fragment.appendChild(el);
        }
        grid.appendChild(fragment);
        if (index < showcaseData.length) {
            requestAnimationFrame(renderChunk);
        }
    }
    renderChunk();
}

function loadPreviewFromShowcase(item) {
    ui.switchRightView('preview');
    const url = `images/${item.id}.png`;
    ui.showResultImage(url);
    currentImageId = null;
    currentImageData = { prompt: item.prompt, model: item.model, isShowcase: true, imageUrl: url };
    window.lastSelectedImageUrl = url;
    ui.showImageActions(true);
    ui.toggleMobileControls(false);
}


let tagData = {};
let promptHelper = null;

async function loadTags() {
    const TAGS_URL = 'all_tags.txt';
    const CACHE_NAME = 'nai-tags-cache-v1';
    let data = null;

    try {
        if ('caches' in window) {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(TAGS_URL);
            
            if (cachedResponse) {
                // 缓存命中的情况下，直接返回缓存数据进行毫秒级秒开
                data = await cachedResponse.json();
                
                // 异步后台拉取最新标签数据并写入缓存进行静默热更新 (Stale-While-Revalidate)
                fetch(TAGS_URL)
                    .then(response => {
                        if (response.ok) {
                            cache.put(TAGS_URL, response.clone());
                            response.json().then(freshData => {
                                tagData = freshData;
                                if (promptHelper) {
                                    promptHelper.updateTagData(freshData);
                                }
                            }).catch(() => {});
                        }
                    })
                    .catch(() => {});
            } else {
                // 缓存未命中的情况，fetch 后写入缓存并返回数据
                const response = await fetch(TAGS_URL);
                if (response.ok) {
                    await cache.put(TAGS_URL, response.clone());
                    data = await response.clone().json();
                } else {
                    data = await response.json();
                }
            }
        } else {
            // 浏览器不支持 caches API，直接请求
            const r = await fetch(TAGS_URL);
            data = await r.json();
        }
    } catch (e) {
        console.error("Failed to load tags from cache:", e);
        try {
            const r = await fetch(TAGS_URL);
            data = await r.json();
        } catch (err) {
            console.error("Tags fetch fallback failed:", err);
        }
    }
    
    if (data) {
        tagData = data;
        if (els.prompt) {
            promptHelper = new PromptHelper({
                promptEl: els.prompt,
                containerEl: document.getElementById('promptHelperContainer'),
                tagData: tagData,
                onTagSelected: (newText, newCursorPos) => {
                    els.prompt.value = newText;
                    els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
                    els.prompt.focus();
                    els.prompt.setSelectionRange(newCursorPos, newCursorPos);
                }
            });
        }
    }
}

loadTags();
els.tagSearchBtn.onclick = () => {
    const q = els.tagSearchInput.value.toLowerCase().trim();
    if (!q) {
        els.tagResults.innerHTML = '';
        return;
    }
    // Limit to top 100 results to prevent massive DOM rendering lag
    const res = Object.entries(tagData)
        .filter(([e, c]) => e.includes(q) || c.includes(q))
        .slice(0, 100);

    els.tagResults.innerHTML = '';
    res.forEach(([en, cn]) => {
        const d = document.createElement('div');
        d.className = "p-3 hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors";
        d.innerHTML = `<div class="text-sm font-medium text-gray-800 dark:text-gray-200">${en}</div><div class="text-xs text-gray-400 dark:text-gray-500">${cn}</div>`;
        d.onclick = () => {
            els.prompt.value += (els.prompt.value ? ', ' : '') + en;
            // Notify prompt input listeners so that it auto-saves to LocalStorage
            els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
            if (window.showToast) {
                window.showToast(`已添加标签: ${en}`, 'success', 1500);
            }
        };
        els.tagResults.appendChild(d);
    });
};

// Enter key search and debounced search-as-you-type support
if (els.tagSearchInput) {
    els.tagSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            els.tagSearchBtn.click();
        }
    });

    let tagSearchTimeout = null;
    els.tagSearchInput.addEventListener('input', () => {
        clearTimeout(tagSearchTimeout);
        tagSearchTimeout = setTimeout(() => {
            els.tagSearchBtn.click();
        }, 300);
    });
}

// --- 主题/鉴权 ---
function initTheme() {
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else document.documentElement.classList.remove('dark');
}
initTheme();
function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark'); localStorage.setItem('color-theme', 'light');
    } else {
        document.documentElement.classList.add('dark'); localStorage.setItem('color-theme', 'dark');
    }
}

// --- Low Performance Mode (低性能模式) Logic ---
function updateLowPerfUI(enabled) {
    const btn = document.getElementById('lowPerfBtn');
    const btnMobile = document.getElementById('lowPerfBtnMobile');
    
    const iconHtml = enabled 
        ? `<i data-lucide="zap-off" class="w-4 h-4 text-gray-400"></i>` 
        : `<i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>`;
        
    if (btn) {
        btn.innerHTML = iconHtml;
        btn.title = enabled ? "高性能模式" : "低性能模式";
    }
    if (btnMobile) {
        btnMobile.innerHTML = iconHtml;
        btnMobile.title = enabled ? "高性能模式" : "低性能模式";
    }
    if (window.safeCreateIcons) window.safeCreateIcons();
}

function toggleLowPerf(forceState) {
    const html = document.documentElement;
    const enabled = typeof forceState === 'boolean' ? forceState : !html.classList.contains('low-perf');
    
    if (enabled) {
        html.classList.add('low-perf');
        store.setSetting('low_perf', 'true');
        if (typeof forceState !== 'boolean') window.showToast("已开启低性能模式 (无动画与模糊)", "success");
    } else {
        html.classList.remove('low-perf');
        store.setSetting('low_perf', 'false');
        if (typeof forceState !== 'boolean') window.showToast("已恢复高性能视觉模式", "success");
    }
    updateLowPerfUI(enabled);
    
    const checkbox = document.getElementById('settingsLowPerfCheckbox');
    if (checkbox) checkbox.checked = enabled;
}
function toggleV45Experimental(forceState) {
    const checkbox = document.getElementById('settingsV45ExperimentalCheckbox');
    const enabled = typeof forceState === 'boolean' ? forceState : (checkbox ? checkbox.checked : false);
    
    store.setSetting('v4_5_experimental', enabled ? 'true' : 'false');
    if (checkbox) checkbox.checked = enabled;
    
    const eulerBugEl = document.getElementById('v45EulerBug');
    const preferBrownianEl = document.getElementById('v45PreferBrownian');
    const useCoordsEl = document.getElementById('v45UseCoords');
    const useOrderEl = document.getElementById('v45UseOrder');
    const negUseOrderEl = document.getElementById('v45NegUseOrder');

    // 根据主开关重置 5 个专属开关的值和本地缓存
    if (enabled) {
        if (eulerBugEl) { eulerBugEl.checked = true; store.setSetting('nai_v45_euler_bug', 'true'); }
        if (preferBrownianEl) { preferBrownianEl.checked = false; store.setSetting('nai_v45_prefer_brownian', 'false'); }
        if (useCoordsEl) { useCoordsEl.checked = false; store.setSetting('nai_v45_use_coords', 'false'); }
        if (useOrderEl) { useOrderEl.checked = true; store.setSetting('nai_v45_use_order', 'true'); }
        if (negUseOrderEl) { negUseOrderEl.checked = true; store.setSetting('nai_v45_neg_use_order', 'true'); }
    } else {
        if (eulerBugEl) { eulerBugEl.checked = false; store.setSetting('nai_v45_euler_bug', 'false'); }
        if (preferBrownianEl) { preferBrownianEl.checked = true; store.setSetting('nai_v45_prefer_brownian', 'true'); }
        if (useCoordsEl) { useCoordsEl.checked = true; store.setSetting('nai_v45_use_coords', 'true'); }
        if (useOrderEl) { useOrderEl.checked = true; store.setSetting('nai_v45_use_order', 'true'); }
        if (negUseOrderEl) { negUseOrderEl.checked = false; store.setSetting('nai_v45_neg_use_order', 'false'); }
    }
    
    // 联动刷新界面容器的显示隐藏
    const currentModel = store.getSetting('nai_model_version', 'v3');
    ui.setModel(currentModel);
    
    window.showToast(enabled ? "已启用 V4.5 实验性请求参数" : "已恢复 V4.5 官方默认参数", "success");
}
function randomizeSeed() {
    const input = document.getElementById('seed');
    if (input) {
        input.value = '';
        window.showToast("已设置为每次随机种子", "success");
    }
}
function enterAdminToken() {
    openSettingsModal('advanced');
}
function saveAdminToken() {
    const input = document.getElementById('adminTokenInput');
    const statusEl = document.getElementById('adminTokenStatus');
    const val = input.value.trim();
    if (!val) {
        statusEl.innerHTML = '<span class="text-red-500">✗ 请输入密码</span>';
        statusEl.classList.remove('hidden');
        return;
    }
    localStorage.setItem('nai_admin_token', val);
    statusEl.innerHTML = '<span class="text-green-500">✔ 管理员密码已保存，已解锁后台</span>';
    statusEl.classList.remove('hidden');
    
    const clearBtn = document.getElementById('adminTokenClearBtn');
    if (clearBtn) clearBtn.classList.remove('hidden');
    
    checkAdminStatus();
    
    setTimeout(() => {
        switchSettingsTab('admin');
        if (statusEl) statusEl.classList.add('hidden');
    }, 1000);
}
function clearAdminToken() {
    localStorage.removeItem('nai_admin_token');
    const input = document.getElementById('adminTokenInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('adminTokenClearBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const statusEl = document.getElementById('adminTokenStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="text-green-500">✔ 已注销管理员身份</span>';
        statusEl.classList.remove('hidden');
    }
    checkAdminStatus();
    
    setTimeout(() => {
        switchSettingsTab('advanced');
        if (statusEl) statusEl.classList.add('hidden');
    }, 1000);
}

function enterUserKey() {
    openSettingsModal('card');
}
function saveUserKey() {
    const input = document.getElementById('userKeyInput');
    const statusEl = document.getElementById('userKeyStatus');
    const val = input.value.trim();
    if (!val) {
        statusEl.innerHTML = '<span class="text-red-500">✗ 请输入卡密</span>';
        statusEl.classList.remove('hidden');
        return;
    }
    localStorage.setItem('nai_user_key', val);
    statusEl.innerHTML = '<span class="text-green-500">✔ VIP 卡密已保存</span>';
    statusEl.classList.remove('hidden');
    
    const clearBtn = document.getElementById('userKeyClearBtn');
    if (clearBtn) clearBtn.classList.remove('hidden');
    
    setTimeout(() => {
        if (statusEl) statusEl.classList.add('hidden');
    }, 1500);
}
function clearUserKey() {
    localStorage.removeItem('nai_user_key');
    const input = document.getElementById('userKeyInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('userKeyClearBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const statusEl = document.getElementById('userKeyStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="text-green-500">✔ 已注销卡密</span>';
        statusEl.classList.remove('hidden');
    }
    setTimeout(() => {
        if (statusEl) statusEl.classList.add('hidden');
    }, 1500);
}

function updateResolutionOptions(bypass) {
    const resEl = document.getElementById('resolution');
    if (!resEl) return;
    
    const standardResolutions = [
        { name: 'Portrait (832 x 1216)', value: '832,1216' },
        { name: 'Landscape (1216 x 832)', value: '1216,832' },
        { name: 'Square (1024 x 1024)', value: '1024,1024' }
    ];
    
    const xlResolutions = [
        { name: 'Portrait XL (1024 x 1536)', value: '1024,1536' },
        { name: 'Landscape XL (1536 x 1024)', value: '1536,1024' },
        { name: 'Square XL (1216 x 1216)', value: '1216,1216' }
    ];
    
    const currentVal = resEl.value;
    
    resEl.innerHTML = '';
    standardResolutions.forEach(r => {
        resEl.add(new Option(r.name, r.value));
    });
    
    if (bypass) {
        xlResolutions.forEach(r => {
            resEl.add(new Option(r.name, r.value));
        });
    }
    
    let valueToSet = currentVal;
    if (!bypass && xlResolutions.some(r => r.value === currentVal)) {
        valueToSet = '832,1216';
    }
    
    resEl.value = valueToSet;
    resEl.dispatchEvent(new Event('change', { bubbles: true }));
}

function toggleBypassLimitsEnabled(forceState) {
    const checkbox = document.getElementById('bypassLimitsEnabled');
    if (!checkbox) return;
    
    let enabled = checkbox.checked;
    if (forceState !== undefined) {
        enabled = forceState;
        checkbox.checked = enabled;
    }
    
    store.setSetting('nai_bypass_limits', enabled.toString());
    
    const stepsEl = document.getElementById('steps');
    const stepsVal = document.getElementById('stepsValue');
    if (stepsEl) {
        if (enabled) {
            stepsEl.max = '50';
        } else {
            stepsEl.max = '28';
            if (parseInt(stepsEl.value) > 28) {
                stepsEl.value = '28';
                if (stepsVal) stepsVal.textContent = '28';
            }
        }
    }
    
    updateResolutionOptions(enabled);
}

function updateAnlasUI(data) {
    const anlasVal = typeof data.totalAnlas === 'number' ? data.totalAnlas : (typeof data.anlas === 'number' ? data.anlas : 0);
    const keyCountVal = typeof data.keyCount === 'number' ? data.keyCount : 1;
    
    let text = `CustomAPI (Anlas: ${anlasVal})`;
    if (keyCountVal > 1) {
        text = `CustomAPI (Anlas: ${anlasVal} | ${keyCountVal}个Key)`;
    }

    const desktopDisplay = document.getElementById('creditDisplayDesktop');
    const mobileDisplay = document.getElementById('creditDisplayMobile');
    
    if (desktopDisplay) {
        desktopDisplay.textContent = text;
        desktopDisplay.classList.remove('hidden');
    }
    if (mobileDisplay) {
        mobileDisplay.textContent = text;
        mobileDisplay.classList.remove('hidden');
    }
}

window.refreshAnlasDisplay = async function() {
    const keysRaw = localStorage.getItem('nai_custom_api_key');
    if (!keysRaw) return;
    const keys = keysRaw.split('\n').map(k => k.trim()).filter(k => k);
    if (keys.length === 0) return;
    const keyToVerify = keys[0];

    try {
        const res = await fetch('/verify-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: keyToVerify, apiKeys: keys })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.valid) {
                updateAnlasUI(data);
            }
        }
    } catch (e) {
        console.warn('自动刷新 Anlas 余额失败:', e.message);
    }
};

function checkAdminStatus() {
    const t = localStorage.getItem('nai_admin_token');
    const customKey = localStorage.getItem('nai_custom_api_key');
    const isAdmin = !!t || !!customKey;
    const updateLock = (btn) => {
        if (isAdmin) {
            btn.innerHTML = '<i data-lucide="unlock" class="w-4 h-4 text-green-500"></i>';
            els.adminControls.classList.remove('hidden');
        } else {
            btn.innerHTML = '<i data-lucide="lock" class="w-4 h-4 text-gray-300 dark:text-gray-500"></i>';
            els.adminControls.classList.add('hidden');
        }
    };
    if (els.adminLockBtn) updateLock(els.adminLockBtn);
    if (els.adminLockBtnMobile) updateLock(els.adminLockBtnMobile);

    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const adminPanelBtnMobile = document.getElementById('adminPanelBtnMobile');
    const hasAdminToken = !!t;

    if (adminPanelBtn) {
        if (hasAdminToken) adminPanelBtn.classList.remove('hidden');
        else adminPanelBtn.classList.add('hidden');
    }
    if (adminPanelBtnMobile) {
        if (hasAdminToken) adminPanelBtnMobile.classList.remove('hidden');
        else adminPanelBtnMobile.classList.add('hidden');
    }

    const adminPanelEntrance = document.getElementById('adminPanelEntrance');
    if (adminPanelEntrance) {
        if (hasAdminToken) adminPanelEntrance.classList.remove('hidden');
        else adminPanelEntrance.classList.add('hidden');
    }

    // 更新解除限制开关的启用状态和视觉指示
    const checkbox = document.getElementById('bypassLimitsEnabled');
    const icon = document.getElementById('bypassLimitsIcon');
    const badge = document.getElementById('bypassLimitsBadge');
    const hint = document.getElementById('bypassLimitsHint');
    
    if (checkbox) {
        if (isAdmin) {
            checkbox.disabled = false;
            if (icon) {
                icon.setAttribute('data-lucide', 'unlock');
                icon.setAttribute('class', 'w-4 h-4 text-green-500');
            }
            if (badge) {
                badge.textContent = '已解锁';
                badge.className = 'text-[9px] bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200/50 dark:border-green-900/30';
            }
            if (hint) {
                hint.textContent = '开启后，可选用 1.5M 像素超大画幅与最高 50 步生成（将消耗您的 Anlas）。';
            }
        } else {
            checkbox.disabled = true;
            checkbox.checked = false;
            toggleBypassLimitsEnabled(false);
            if (icon) {
                icon.setAttribute('data-lucide', 'lock');
                icon.setAttribute('class', 'w-4 h-4 text-gray-400');
            }
            if (badge) {
                badge.textContent = '锁定';
                badge.className = 'text-[9px] bg-gray-100 dark:bg-slate-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700';
            }
            if (hint) {
                hint.textContent = '需在顶部工具栏配置您的自定义 API Key 或管理员密码以解锁此选项。';
            }
        }
    }

    // 更新 API 按钮状态
    const updateApiBtn = (btn) => {
        if (customKey) {
            btn.innerHTML = '<i data-lucide="globe" class="w-4 h-4 text-green-500"></i>';
        } else {
            btn.innerHTML = '<i data-lucide="globe" class="w-4 h-4"></i>';
        }
    };
    const apiBtn = document.getElementById('apiBtn');
    const apiBtnMobile = document.getElementById('apiBtnMobile');
    if (apiBtn) updateApiBtn(apiBtn);
    if (apiBtnMobile) updateApiBtn(apiBtnMobile);

    safeCreateIcons();

    // 异步在后台获取最新的 Anlas 并更新顶部显示
    if (customKey && window.refreshAnlasDisplay) {
        window.refreshAnlasDisplay();
    }
}
checkAdminStatus();

// --- 自定义 API Key ---
// --- 模态框通用开启/关闭 ---
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    setTimeout(() => {
        el.classList.add('modal-active');
    }, 10);
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal-active');
    setTimeout(() => {
        el.style.display = 'none';
    }, 300);
}

// --- Custom Toast, Alert, and Confirm System ---
window.showToast = function(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    // Glassmorphism styling
    toast.className = `flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg border backdrop-blur-md transition-all duration-300 translate-y-2 opacity-0 max-w-sm pointer-events-auto w-[90%] md:w-auto`;
    
    let iconName = 'info';
    let bgClass = 'bg-white/90 dark:bg-slate-900/90 border-gray-200/50 dark:border-slate-800/80 text-gray-700 dark:text-gray-200';
    if (type === 'success') {
        iconName = 'check-circle';
        bgClass = 'bg-emerald-50/90 dark:bg-emerald-950/90 border-emerald-200/50 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-200';
    } else if (type === 'error') {
        iconName = 'alert-triangle';
        bgClass = 'bg-rose-50/90 dark:bg-rose-950/90 border-rose-200/50 dark:border-rose-800/30 text-rose-800 dark:text-rose-200';
    } else if (type === 'warning') {
        iconName = 'alert-circle';
        bgClass = 'bg-amber-50/90 dark:bg-amber-950/90 border-amber-200/50 dark:border-amber-800/30 text-amber-800 dark:text-amber-200';
    }

    toast.className += ` ${bgClass}`;
    toast.innerHTML = `
        <div class="flex-shrink-0">
            <i data-lucide="${iconName}" class="w-4 h-4"></i>
        </div>
        <div class="text-xs font-semibold select-none leading-relaxed">${message}</div>
    `;

    container.appendChild(toast);
    if (window.safeCreateIcons) window.safeCreateIcons();

    // Force reflow and animate in
    toast.offsetHeight;
    toast.classList.remove('translate-y-2', 'opacity-0');

    const dismiss = () => {
        toast.classList.add('opacity-0', 'translate-y-[-8px]');
        setTimeout(() => {
            toast.remove();
        }, 300);
    };

    const timeoutId = setTimeout(dismiss, duration);
    toast.addEventListener('click', () => {
        clearTimeout(timeoutId);
        dismiss();
    });
};

window.showAlert = function(message, title = '系统提示', iconType = 'alert-circle') {
    return new Promise((resolve) => {
        const msgEl = document.getElementById('confirmModalMessage');
        const titleEl = document.getElementById('confirmModalTitle');
        const iconEl = document.getElementById('confirmModalIcon');
        const confirmBtn = document.getElementById('confirmConfirmBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const backdrop = document.getElementById('confirmModalBackdrop');

        if (msgEl) msgEl.textContent = message;
        if (titleEl) titleEl.textContent = title;
        
        if (iconEl) {
            iconEl.setAttribute('data-lucide', iconType);
            if (window.safeCreateIcons) window.safeCreateIcons();
        }

        // Hide cancel button for alert
        if (cancelBtn) cancelBtn.classList.add('hidden');

        // Clone nodes to remove old event listeners cleanly
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newBackdrop = backdrop.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        backdrop.replaceWith(newBackdrop);

        function cleanup() {
            closeModal('confirmModal');
            setTimeout(() => {
                if (cancelBtn) cancelBtn.classList.remove('hidden');
            }, 300);
            resolve();
        }

        openModal('confirmModal');

        newConfirmBtn.addEventListener('click', cleanup);
        newBackdrop.addEventListener('click', cleanup);
    });
};

window.showConfirm = function(message, title = '确认操作', iconType = 'help-circle') {
    return new Promise((resolve) => {
        const msgEl = document.getElementById('confirmModalMessage');
        const titleEl = document.getElementById('confirmModalTitle');
        const iconEl = document.getElementById('confirmModalIcon');
        const confirmBtn = document.getElementById('confirmConfirmBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const backdrop = document.getElementById('confirmModalBackdrop');

        if (msgEl) msgEl.textContent = message;
        if (titleEl) titleEl.textContent = title;
        
        if (iconEl) {
            iconEl.setAttribute('data-lucide', iconType);
            if (window.safeCreateIcons) window.safeCreateIcons();
        }

        // Ensure cancel button is visible
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        // Clone nodes to remove old event listeners cleanly
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newBackdrop = backdrop.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        cancelBtn.replaceWith(newCancelBtn);
        backdrop.replaceWith(newBackdrop);

        function cleanup(value) {
            closeModal('confirmModal');
            resolve(value);
        }

        openModal('confirmModal');

        newConfirmBtn.addEventListener('click', () => cleanup(true));
        newCancelBtn.addEventListener('click', () => cleanup(false));
        newBackdrop.addEventListener('click', () => cleanup(false));
    });
};

// Override default window.alert with custom toast/alert
window.alert = function(message) {
    if (message === undefined || message === null) return;
    const msgStr = String(message);
    const isShort = msgStr.length < 18;
    const isStatus = msgStr.includes('复制') || msgStr.includes('载入') || msgStr.includes('保存') || msgStr.includes('成功');
    
    if (isShort || isStatus) {
        let type = 'info';
        if (isStatus || msgStr.includes('成功') || msgStr.includes('复制') || msgStr.includes('载入')) {
            type = 'success';
        } else if (msgStr.includes('失败') || msgStr.includes('错误') || msgStr.includes('⚠️')) {
            type = 'error';
        }
        window.showToast(msgStr, type);
    } else {
        let icon = 'alert-circle';
        let title = '系统提示';
        if (msgStr.includes('失败') || msgStr.includes('错误') || msgStr.includes('封禁') || msgStr.includes('⚠️')) {
            icon = 'alert-triangle';
            title = '操作失败';
        }
        window.showAlert(msgStr, title, icon);
    }
};

// --- 自定义 API Key 管理 ---
function addApiKeyInputRow(val = '') {
    const container = document.getElementById('apiKeyList');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'flex flex-col gap-1.5 api-key-row group w-full border border-gray-100/50 dark:border-slate-800/50 p-2.5 rounded-2xl bg-gray-50/30 dark:bg-slate-950/20 transition-all';
    div.innerHTML = `
        <div class="flex gap-2 items-center w-full">
            <input type="text" value="${val}" placeholder="pst-xxxxxxxxxxxxxxxx..." class="art-input flex-1 px-4 py-3 rounded-xl text-xs outline-none font-mono tracking-tight" />
            <button onclick="removeApiKeyInputRow(this)" class="p-3 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400 hover:text-red-500 rounded-xl transition-all" title="删除">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
        </div>
        <div class="api-key-balance text-[10px] text-gray-400 px-3 hidden"></div>
    `;
    container.appendChild(div);
}

function removeApiKeyInputRow(button) {
    const row = button.closest('.api-key-row');
    if (row) {
        row.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            row.remove();
            const container = document.getElementById('apiKeyList');
            if (container && container.children.length === 0) {
                addApiKeyInputRow();
            }
        }, 200);
    }
}

// --- 角色提示词 (Character Prompts) 管理 ---
function addCharacterPromptRow(promptVal = '', negVal = '', x = 0.5, y = 0.5, autoPos = true) {
    const container = document.getElementById('characterPromptsContainer');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'flex flex-col gap-2.5 character-prompt-row border border-gray-100 dark:border-slate-800 p-3 rounded-2xl bg-gray-50/50 dark:bg-slate-900/20 transition-all';
    
    // 生成 5*5 交互式网格
    let gridHtml = '';
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const cellX = (c * 2 + 1) / 10;
            const cellY = (r * 2 + 1) / 10;
            const isTarget = Math.abs(cellX - x) < 0.01 && Math.abs(cellY - y) < 0.01;
            gridHtml += `
                <button type="button" 
                    onclick="window.selectCharGridCell(this, ${cellX}, ${cellY})"
                    class="char-grid-cell w-full h-full rounded-md border transition-all ${isTarget ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}"
                    style="aspect-ratio: 1/1;"
                    title="列 ${c+1}, 排 ${r+1} (x: ${cellX}, y: ${cellY})">
                </button>
            `;
        }
    }

    div.innerHTML = `
        <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest character-index-label">角色</span>
                <label class="flex items-center gap-1 cursor-pointer select-none text-[9px] text-gray-400 dark:text-gray-500 font-bold">
                    <input type="checkbox" class="char-enable-toggle sr-only peer" checked>
                    <div class="w-6 h-3.5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-green-600 relative scale-90"></div>
                    <span class="char-enable-text text-green-600 dark:text-green-500">已启用</span>
                </label>
            </div>
            <button type="button" onclick="window.removeCharacterPromptRow(this)" class="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400 hover:text-red-500 rounded-lg transition-all" title="删除角色">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
        </div>
        <div class="space-y-2">
            <div class="space-y-1">
                <label class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">描述提示词 (Character Prompt)</label>
                <input type="text" class="char-prompt-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${promptVal}" placeholder="例如: boy, luo xiaohei" />
            </div>
            <div class="space-y-1">
                <label class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">排除词 (Character Negative, 可选)</label>
                <input type="text" class="char-neg-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${negVal}" placeholder="特定于该角色的排除特征，默认为空" />
            </div>
            <div class="space-y-1 mt-2">
                <div class="flex justify-between items-center text-[9px] text-gray-400 dark:text-gray-500">
                    <span>角色定位 (Position)</span>
                    <label class="flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" class="char-auto-pos sr-only peer" ${autoPos ? 'checked' : ''}>
                        <div class="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 relative scale-90"></div>
                        <span>AI 自动位置</span>
                    </label>
                </div>
                <!-- 5*5 定位网格 -->
                <div class="char-grid-container ${autoPos ? 'hidden' : ''} grid grid-cols-5 gap-1 w-28 h-28 mx-auto mt-2 border border-gray-200 dark:border-gray-700 p-1 rounded-xl bg-gray-100 dark:bg-slate-900/50">
                    ${gridHtml}
                </div>
                <!-- 隐藏输入框以保存坐标 -->
                <input type="hidden" class="char-pos-x" value="${x}" />
                <input type="hidden" class="char-pos-y" value="${y}" />
            </div>
        </div>
    `;
    
    // 监听启用状态
    const enableToggle = div.querySelector('.char-enable-toggle');
    const enableText = div.querySelector('.char-enable-text');
    const inputs = div.querySelectorAll('.char-prompt-input, .char-neg-input, .char-auto-pos');
    const gridCells = div.querySelectorAll('.char-grid-cell');
    
    enableToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (isEnabled) {
            enableText.textContent = "已启用";
            enableText.className = "char-enable-text text-green-600 dark:text-green-500";
            div.classList.remove('opacity-60');
            inputs.forEach(input => input.disabled = false);
            gridCells.forEach(cell => cell.disabled = false);
        } else {
            enableText.textContent = "已禁用";
            enableText.className = "char-enable-text text-gray-400 dark:text-gray-500";
            div.classList.add('opacity-60');
            inputs.forEach(input => input.disabled = true);
            gridCells.forEach(cell => cell.disabled = true);
        }
    });

    // 监听 AI 自动位置开关
    const autoPosCheckbox = div.querySelector('.char-auto-pos');
    const gridContainer = div.querySelector('.char-grid-container');
    const posXInput = div.querySelector('.char-pos-x');
    const posYInput = div.querySelector('.char-pos-y');
    
    autoPosCheckbox.addEventListener('change', (e) => {
        if (autoPosCheckbox.disabled) return;
        if (e.target.checked) {
            gridContainer.classList.add('hidden');
            posXInput.value = "0.5";
            posYInput.value = "0.5";
            const cells = gridContainer.querySelectorAll('.char-grid-cell');
            cells.forEach((cell, idx) => {
                if (idx === 12) {
                    cell.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-indigo-600 border-indigo-600 dark:bg-indigo-500';
                } else {
                    cell.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50';
                }
            });
        } else {
            gridContainer.classList.remove('hidden');
        }
    });

    container.appendChild(div);
    updateCharacterIndexLabels();
}

function removeCharacterPromptRow(button) {
    const row = button.closest('.character-prompt-row');
    if (row) {
        row.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            row.remove();
            updateCharacterIndexLabels();
        }, 150);
    }
}

function updateCharacterIndexLabels() {
    const container = document.getElementById('characterPromptsContainer');
    if (!container) return;
    const rows = container.querySelectorAll('.character-prompt-row');
    rows.forEach((row, idx) => {
        const label = row.querySelector('.character-index-label');
        if (label) {
            label.textContent = `角色 ${idx + 1}`;
        }
    });
}

function selectCharGridCell(btn, x, y) {
    const grid = btn.closest('.char-grid-container');
    if (!grid) return;
    
    const cells = grid.querySelectorAll('.char-grid-cell');
    cells.forEach(cell => {
        cell.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50';
    });
    
    btn.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-indigo-600 border-indigo-600 dark:bg-indigo-500';
    
    const row = grid.closest('.character-prompt-row');
    if (row) {
        const posXInput = row.querySelector('.char-pos-x');
        const posYInput = row.querySelector('.char-pos-y');
        if (posXInput) posXInput.value = x;
        if (posYInput) posYInput.value = y;
    }
}

async function forceReloadApp() {
    if (window.showToast) window.showToast("正在清理页面离线缓存...", "info");
    
    // 1. 注销所有已注册的 Service Workers
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        } catch (e) {
            console.warn('Service Worker unregister failed:', e);
        }
    }
    
    // 2. 清除网页缓存数据库 (Cache Storage)
    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            for (let key of keys) {
                await caches.delete(key);
            }
        } catch (e) {
            console.warn('Cache Storage delete failed:', e);
        }
    }
    
    if (window.showToast) window.showToast("缓存清理成功，正在重新加载页面...", "success");
    
    setTimeout(() => {
        // 3. 追加当前时间戳参数，强制跳过任何可能残留的 index.html 强缓存并重新加载
        const url = new URL(window.location.href);
        url.searchParams.set('force_update', Date.now().toString());
        window.location.replace(url.toString());
    }, 800);
}

// --- 设置中心 (Settings Center) JS Logic ---
let currentSettingsTab = 'account';

function openSettingsModal(defaultTab) {
    openModal('settingsModal');
    
    if (defaultTab) {
        currentSettingsTab = defaultTab;
    }

    // 初始化时，载入 API Key 列表
    const container = document.getElementById('apiKeyList');
    if (container) {
        container.innerHTML = '';
        const cur = localStorage.getItem('nai_custom_api_key');
        const clearBtn = document.getElementById('apiKeyClearBtn');
        const statusEl = document.getElementById('apiKeyStatus');
        if (statusEl) statusEl.classList.add('hidden');
        
        if (cur) {
            const keys = cur.split(/[\n,]/).map(k => k.trim()).filter(k => k);
            keys.forEach(k => addApiKeyInputRow(k));
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (window.fetchAndShowAllKeysBalances) {
                window.fetchAndShowAllKeysBalances(keys);
            }
        } else {
            addApiKeyInputRow();
            if (clearBtn) clearBtn.classList.add('hidden');
        }
    }

    // 载入卡密兑换状态
    const userKeyInput = document.getElementById('userKeyInput');
    const userKeyClearBtn = document.getElementById('userKeyClearBtn');
    const userKeyStatus = document.getElementById('userKeyStatus');
    if (userKeyStatus) userKeyStatus.classList.add('hidden');
    const curUserKey = localStorage.getItem('nai_user_key');
    if (curUserKey) {
        if (userKeyInput) userKeyInput.value = curUserKey;
        if (userKeyClearBtn) userKeyClearBtn.classList.remove('hidden');
    } else {
        if (userKeyInput) userKeyInput.value = '';
        if (userKeyClearBtn) userKeyClearBtn.classList.add('hidden');
    }

    // 载入管理员密码状态
    const adminTokenInput = document.getElementById('adminTokenInput');
    const adminTokenClearBtn = document.getElementById('adminTokenClearBtn');
    const adminTokenStatus = document.getElementById('adminTokenStatus');
    if (adminTokenStatus) adminTokenStatus.classList.add('hidden');
    const curAdminToken = localStorage.getItem('nai_admin_token');
    if (curAdminToken) {
        if (adminTokenInput) adminTokenInput.value = curAdminToken;
        if (adminTokenClearBtn) adminTokenClearBtn.classList.remove('hidden');
    } else {
        if (adminTokenInput) adminTokenInput.value = '';
        if (adminTokenClearBtn) adminTokenClearBtn.classList.add('hidden');
    }

    // 载入账户中心状态
    const token = localStorage.getItem('nai_user_token');
    if (token) {
        fetchUserProfile();
    } else {
        const authPanel = document.getElementById('userAuthPanel');
        const profilePanel = document.getElementById('userProfilePanel');
        if (authPanel) authPanel.classList.remove('hidden');
        if (profilePanel) profilePanel.classList.add('hidden');
        switchAuthTab('login');
    }

    // 同步低性能优化开关状态
    const lowPerfCheckbox = document.getElementById('settingsLowPerfCheckbox');
    if (lowPerfCheckbox) {
        lowPerfCheckbox.checked = document.documentElement.classList.contains('low-perf');
    }

    // 同步 V4.5 实验性参数开关状态
    const v45ExpCheckbox = document.getElementById('settingsV45ExperimentalCheckbox');
    if (v45ExpCheckbox) {
        v45ExpCheckbox.checked = store.getSetting('v4_5_experimental', 'false') === 'true';
    }

    // 同步更新管理员特权入口
    checkAdminStatus();

    // 更新左下角用户卡片
    updateSettingsUserCard();

    // 渲染切换到当前的 Tab
    switchSettingsTab(currentSettingsTab);
}

function closeSettingsModal() {
    closeModal('settingsModal');
}

function switchSettingsTab(tabName) {
    if (tabName === 'admin') {
        const adminToken = localStorage.getItem('nai_admin_token');
        if (!adminToken) {
            window.showToast("未检测到管理员凭证，请先在系统设置中登录。", "error");
            tabName = 'advanced';
        } else {
            fetchAdminUsers();
        }
    }

    currentSettingsTab = tabName;
    
    // 1. 切换 Tab 按钮高亮
    const tabContainer = document.getElementById('settingsTabs');
    if (tabContainer) {
        const btns = tabContainer.querySelectorAll('.settings-tab-btn');
        btns.forEach(btn => {
            if (btn.id === `settingsTab-${tabName}`) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // 2. 切换右侧面板显隐
    const panels = document.querySelectorAll('.settings-panel');
    panels.forEach(panel => {
        if (panel.id === `settingsPanel-${tabName}`) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

function openUserModalFromSettings() {
    switchSettingsTab('account');
}

function openAdminPanelFromSettings() {
    switchSettingsTab('admin');
}

async function clearImageHistoryCache() {
    if (!(await window.showConfirm("您确定要清空全部本地生成的画图历史图片吗？此操作将彻底删除保存在此设备上的所有历史画图图片，不可恢复！", "清空历史图片", "trash-2"))) {
        return;
    }
    try {
        await store.clearAll();
        window.showToast("画图历史图片记录已彻底清空！", "success");
        loadGallery();
    } catch (err) {
        window.showToast("清空历史记录失败: " + err.message, "error");
    }
}

function updateSettingsUserCard() {
    const cardContainer = document.getElementById('settingsUserCard');
    if (!cardContainer) return;

    const token = localStorage.getItem('nai_user_token');
    if (!token) {
        cardContainer.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <i data-lucide="user" class="w-4 h-4 text-gray-400"></i>
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">商业计费系统</span>
                    <span class="text-[11px] font-bold text-gray-600 dark:text-gray-300 truncate">未登录账户</span>
                </div>
            </div>
            <button onclick="openUserModalFromSettings()" class="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1">
                <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> 注册 / 登录账户
            </button>
        `;
    } else {
        const desktopDisplay = document.getElementById('userCreditsDisplay');
        let username = "已登录";
        let credits = "--";
        if (desktopDisplay && desktopDisplay.textContent) {
            const match = desktopDisplay.textContent.match(/^(.*)\s*\(余:(.*)\)$/);
            if (match) {
                username = match[1].trim();
                credits = match[2].trim();
            }
        }
        cardContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <i data-lucide="user" class="w-4 h-4 text-emerald-500"></i>
                </div>
                <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-[11px] font-bold text-gray-800 dark:text-gray-100 truncate block w-full max-w-[120px]">${username}</span>
                    <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium block">余额: ${credits} 点</span>
                </div>
            </div>
            <button onclick="logoutUser()" class="w-full py-1.5 bg-gray-150 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-gray-500 dark:text-gray-400 rounded-xl text-[10px] font-bold transition-all">
                退出登录
            </button>
        `;
    }

    // 移动端专用迷你账户按钮状态同步
    const mobileAccountText = document.getElementById('mobileAccountText');
    if (mobileAccountText) {
        if (!token) {
            mobileAccountText.textContent = "账户";
            mobileAccountText.parentElement.classList.remove('bg-emerald-100', 'dark:bg-emerald-500/20');
        } else {
            mobileAccountText.textContent = "已登录";
            mobileAccountText.parentElement.classList.add('bg-emerald-100', 'dark:bg-emerald-500/20');
        }
    }

    if (window.safeCreateIcons) {
        window.safeCreateIcons();
    } else if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// 重新实现 API Key 面板的快捷入口
function enterCustomApiKey() {
    openSettingsModal();
    switchSettingsTab('api');
}
function closeApiKeyModal() {
    closeSettingsModal();
}

window.fetchAndShowAllKeysBalances = async function(keys) {
    const container = document.getElementById('apiKeyList');
    if (!container) return;
    
    const rows = container.querySelectorAll('.api-key-row');
    
    keys.forEach(async (key, idx) => {
        const row = rows[idx];
        if (!row) return;
        const balanceEl = row.querySelector('.api-key-balance');
        if (!balanceEl) return;
        
        balanceEl.classList.remove('hidden');
        balanceEl.innerHTML = '<span class="text-gray-400">⭮ 正在查询余额...</span>';
        
        try {
            const res = await fetch('/verify-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.valid) {
                    let detailText = `✔ 订阅: ${data.tierName} | 余额: ${data.anlas} Anlas`;
                    const detail = data.details && data.details[0];
                    if (detail) {
                        if (detail.email) {
                            detailText += ` | 邮箱: ${detail.email}`;
                        } else {
                            detailText += ` | 邮箱: 已隐藏(Token限制)`;
                        }
                        if (detail.accountCreatedAt) {
                            try {
                                // NovelAI 返回的 accountCreatedAt 是以秒为单位的 Unix 时间戳，而 JS 的 Date 构造函数需要毫秒
                                const timestamp = detail.accountCreatedAt < 10000000000 ? detail.accountCreatedAt * 1000 : detail.accountCreatedAt;
                                const createdDate = new Date(timestamp).toLocaleDateString();
                                detailText += ` | 创建: ${createdDate}`;
                            } catch (_) {}
                        }
                        if (detail.expiresAt) {
                            try {
                                // NovelAI 返回的 expiresAt 也是以秒为单位的 Unix 时间戳
                                const expireTimestamp = detail.expiresAt < 10000000000 ? detail.expiresAt * 1000 : detail.expiresAt;
                                const expireDate = new Date(expireTimestamp);
                                const expireDateString = expireDate.toLocaleDateString();
                                const msLeft = expireTimestamp - Date.now();
                                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                                if (daysLeft > 0) {
                                    detailText += ` | 到期: ${expireDateString} (剩余 ${daysLeft} 天)`;
                                } else {
                                    detailText += ` | 到期: ${expireDateString} (已过期)`;
                                }
                            } catch (_) {}
                        }
                    }
                    balanceEl.innerHTML = `<span class="text-emerald-500 font-semibold">${detailText}</span>`;
                } else {
                    balanceEl.innerHTML = `<span class="text-red-500">✗ ${data.error || '验证失败'}</span>`;
                }
            } else {
                const text = await res.text();
                let errMsg = '查询失败';
                try { errMsg = JSON.parse(text).error || errMsg; } catch(_) {}
                balanceEl.innerHTML = `<span class="text-red-500">✗ ${errMsg}</span>`;
            }
        } catch (e) {
            balanceEl.innerHTML = `<span class="text-red-500">✗ 查询异常: ${e.message}</span>`;
        }
    });
};


async function verifyCustomApiKey() {
    const container = document.getElementById('apiKeyList');
    const statusEl = document.getElementById('apiKeyStatus');
    const verifyBtn = document.getElementById('apiKeyVerifyBtn');
    
    const inputs = container.querySelectorAll('input');
    const keys = Array.from(inputs).map(i => i.value.trim()).filter(k => k);
    
    if (keys.length === 0) {
        statusEl.innerHTML = '<span class="text-red-500">✗ 请至少输入一个 API Key</span>';
        statusEl.classList.remove('hidden');
        return;
    }

    const keysRaw = keys.join('\n');
    const keyToVerify = keys[0];

    verifyBtn.disabled = true;
    verifyBtn.textContent = '验证中...';
    statusEl.innerHTML = `<span class="text-gray-400">⭮ 正在连接 NovelAI 验证 (共 ${keys.length} 个 Key)...</span>`;
    statusEl.classList.remove('hidden');

    try {
        let verified = false;
        try {
            const res = await fetch('/verify-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyToVerify, apiKeys: keys })
            });

            const text = await res.text();
            if (text) {
                const data = JSON.parse(text);
                if (res.ok && data.valid) {
                    localStorage.setItem('nai_custom_api_key', keysRaw);
                    statusEl.innerHTML = `<span class="text-green-500">✔ 验证成功! 首个 Key 订阅: <b>${data.tierName}</b>。已激活 ${keys.length} 个 Key 并发模式。</span>`;
                    document.getElementById('apiKeyClearBtn').classList.remove('hidden');
                    checkAdminStatus();
                    if (window.fetchAndShowAllKeysBalances) {
                        window.fetchAndShowAllKeysBalances(keys);
                    }
                    setTimeout(() => closeApiKeyModal(), 2000);
                    verified = true;
                } else if (data.error) {
                    statusEl.innerHTML = `<span class="text-red-500">✗ ${data.error}</span>`;
                    return;
                }
            }
        } catch (serverErr) {
            console.warn('后端验证接口不可用, 尝试直接验证:', serverErr.message);
        }

        if (verified) return;

        try {
            statusEl.innerHTML = '<span class="text-gray-400">⭮ 尝试直接连接 NovelAI 批量验证...</span>';
            const directPromises = keys.map(async (key) => {
                const directRes = await fetch('https://api.novelai.net/user/subscription', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!directRes.ok) {
                    throw new Error(`Key (${key.substring(0, 10)}...) 验证失败或已过期`);
                }
                return await directRes.json();
            });

            const subDatas = await Promise.all(directPromises);
            const subData = subDatas[0];
            const tierNames = { 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' };
            const tierName = tierNames[subData.tier] || `Tier ${subData.tier}`;
            localStorage.setItem('nai_custom_api_key', keysRaw);
            statusEl.innerHTML = `<span class="text-green-500">✔ 验证成功! 首个 Key 订阅: <b>${tierName}</b>。已激活 ${keys.length} 个 Key 并发模式。</span>`;
            document.getElementById('apiKeyClearBtn').classList.remove('hidden');
            checkAdminStatus();
            if (window.fetchAndShowAllKeysBalances) {
                window.fetchAndShowAllKeysBalances(keys);
            }
            setTimeout(() => closeApiKeyModal(), 2000);
            return;
        } catch (directErr) {
            console.warn('直接验证失败(可能 CORS 或存在无效 Key), 使用本地保存模式:', directErr.message);
            statusEl.innerHTML = `<span class="text-red-500">✗ 验证失败: ${directErr.message}</span>`;
            return;
        }

        localStorage.setItem('nai_custom_api_key', keysRaw);
        statusEl.innerHTML = `<span class="text-yellow-500">⚠ 无法在线验证(后端不可用)，已保存全部 ${keys.length} 个 Key 并激活并发。</span>`;
        document.getElementById('apiKeyClearBtn').classList.remove('hidden');
        checkAdminStatus();
        setTimeout(() => closeApiKeyModal(), 2500);

    } catch (e) {
        statusEl.innerHTML = `<span class="text-red-500">✗ 验证异常: ${e.message}</span>`;
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = '验证并保存';
    }
}

function clearCustomApiKey() {
    localStorage.removeItem('nai_custom_api_key');
    const container = document.getElementById('apiKeyList');
    if (container) {
        container.innerHTML = '';
        addApiKeyInputRow();
    }
    document.getElementById('apiKeyClearBtn').classList.add('hidden');
    const statusEl = document.getElementById('apiKeyStatus');
    statusEl.innerHTML = '<span class="text-gray-500">✔ 已清除自定义 Key</span>';
    statusEl.classList.remove('hidden');
    
    // 隐藏顶部自定义 Key 余额显示
    const oldDesktop = document.getElementById('creditDisplayDesktop');
    const oldMobile = document.getElementById('creditDisplayMobile');
    if (oldDesktop) oldDesktop.classList.add('hidden');
    if (oldMobile) oldMobile.classList.add('hidden');

    checkAdminStatus();
}



// =================== 局部重绘 (Inpainting) ===================
const inpaintEditor = new InpaintEditor({
    ui: ui,
    engine: engine,
    store: store,
    onComplete: async (successfulResults, promptText, selectedVersion) => {
        for (const result of successfulResults) {
            const reader = new FileReader();
            reader.readAsDataURL(result.blob);
            reader.onloadend = async () => {
                await saveToHistory(reader.result, promptText + ' [inpaint]', selectedVersion, result, true);
            };
        }

        ui.showResultImages(successfulResults, (selected) => {
            currentImageData = selected;
            if (selected.id) currentImageId = selected.id;
            window.lastSelectedImageUrl = selected.imageUrl;
        });
    }
});

const outpaintEditor = new OutpaintEditor({
    engine: engine,
    store: store
});

// =================== 图库大图详情弹窗 (Lightbox) ===================
let lightboxItems = [];
let lightboxIndex = 0;

async function openLightbox(item) {
    if (item.isShowcase) {
        lightboxItems = showcaseData.map(s => ({
            id: s.id,
            image: `images/${s.id}.png`,
            prompt: s.prompt,
            model: s.model || 'v3',
            isShowcase: true,
            meta: null
        }));
        lightboxIndex = lightboxItems.findIndex(x => x.id === item.id);
    } else {
        lightboxItems = galleryItems;
        lightboxIndex = galleryItems.findIndex(x => x.id === item.id);
    }

    if (lightboxIndex === -1) {
        lightboxItems = [item];
        lightboxIndex = 0;
    }

    renderLightboxCurrent();
    openModal('imageLightboxModal');
    
    const sidebar = document.getElementById('lightboxSidebar');
    if (sidebar) sidebar.classList.remove('expanded');
}

function closeLightbox() {
    closeModal('imageLightboxModal');
}

function renderLightboxCurrent() {
    if (lightboxItems.length === 0 || lightboxIndex < 0 || lightboxIndex >= lightboxItems.length) return;
    const item = lightboxItems[lightboxIndex];
    
    const mainImg = document.getElementById('lightboxMainImg');
    if (mainImg) {
        mainImg.style.opacity = 0;
        setTimeout(() => {
            mainImg.src = item.image || item.imageUrl;
            mainImg.onload = () => { mainImg.style.opacity = 1; };
        }, 100);
    }

    const modelEl = document.getElementById('lbInfoModel');
    if (modelEl) modelEl.textContent = `Model: ${item.model || 'v3'}`;
    
    const meta = item.meta;
    if (meta) {
        const resEl = document.getElementById('lbInfoResolution');
        if (resEl) resEl.textContent = `${meta.width || '--'} x ${meta.height || '--'}`;
        
        const promptEl = document.getElementById('lightboxPrompt');
        if (promptEl) promptEl.textContent = item.prompt || '--';
        
        const negPrompt = meta.negative_prompt || '';
        const negArea = document.getElementById('lightboxNegArea');
        const negEl = document.getElementById('lightboxNeg');
        if (negPrompt && negPrompt !== 'undefined') {
            if (negEl) negEl.textContent = negPrompt;
            if (negArea) negArea.style.display = 'block';
        } else {
            if (negArea) negArea.style.display = 'none';
        }
        
        const stepsEl = document.getElementById('lbMetaSteps');
        if (stepsEl) stepsEl.textContent = meta.steps || '--';
        
        const scaleEl = document.getElementById('lbMetaScale');
        if (scaleEl) scaleEl.textContent = meta.scale || '--';
        
        const seedEl = document.getElementById('lbMetaSeed');
        if (seedEl) seedEl.textContent = meta.seed !== undefined && meta.seed !== null ? meta.seed : '--';
        
        const strengthContainer = document.getElementById('lbMetaStrengthContainer');
        const strengthEl = document.getElementById('lbMetaStrength');
        if (meta.strength !== undefined && meta.strength !== null) {
            if (strengthEl) strengthEl.textContent = meta.strength;
            if (strengthContainer) strengthContainer.style.display = 'block';
        } else {
            if (strengthContainer) strengthContainer.style.display = 'none';
        }
    } else {
        const resEl = document.getElementById('lbInfoResolution');
        if (resEl) resEl.textContent = 'Resolution: --';
        
        const promptEl = document.getElementById('lightboxPrompt');
        if (promptEl) promptEl.textContent = item.prompt || '--';
        
        const negArea = document.getElementById('lightboxNegArea');
        if (negArea) negArea.style.display = 'none';
        
        const stepsEl = document.getElementById('lbMetaSteps');
        if (stepsEl) stepsEl.textContent = '--';
        
        const scaleEl = document.getElementById('lbMetaScale');
        if (scaleEl) scaleEl.textContent = '--';
        
        const seedEl = document.getElementById('lbMetaSeed');
        if (seedEl) seedEl.textContent = '--';
        
        const strengthContainer = document.getElementById('lbMetaStrengthContainer');
        if (strengthContainer) strengthContainer.style.display = 'none';
    }
    
    const deleteBtn = document.querySelector('[onclick="lightboxDelete()"]');
    if (item.isShowcase) {
        if (deleteBtn) deleteBtn.classList.add('hidden');
    } else {
        if (deleteBtn) deleteBtn.classList.remove('hidden');
    }
}

function prevLightboxImage() {
    if (lightboxIndex > 0) {
        lightboxIndex--;
        renderLightboxCurrent();
    }
}

async function nextLightboxImage() {
    if (lightboxIndex < lightboxItems.length - 1) {
        lightboxIndex++;
        renderLightboxCurrent();
    } else if (lightboxItems.length > 0 && !lightboxItems[0].isShowcase && galleryHasMore) {
        const prevLength = lightboxItems.length;
        await loadMoreGallery();
        lightboxItems = galleryItems;
        if (lightboxItems.length > prevLength) {
            lightboxIndex = prevLength;
            renderLightboxCurrent();
        }
    }
}

function copyLightboxText(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        window.showToast("已复制到剪贴板！", "success");
    }).catch(err => {
        console.error("复制失败", err);
    });
}

function lightboxApplyParams() {
    if (lightboxItems.length === 0) return;
    const item = lightboxItems[lightboxIndex];
    
    els.prompt.value = item.prompt || '';
    els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
    
    const meta = item.meta;
    if (meta) {
        if (meta.negative_prompt) els.negative.value = meta.negative_prompt;
        
        const stepsEl = document.getElementById('steps');
        if (stepsEl && meta.steps) {
            stepsEl.value = meta.steps;
            const stepsVal = document.getElementById('stepsValue');
            if (stepsVal) stepsVal.textContent = meta.steps;
        }
        
        const scaleEl = document.getElementById('scale');
        if (scaleEl && meta.scale) {
            scaleEl.value = meta.scale;
            const scaleVal = document.getElementById('scaleValue');
            if (scaleVal) scaleVal.textContent = parseFloat(meta.scale).toFixed(1);
        }
        
        if (meta.width && meta.height) {
            const resEl = document.getElementById('resolution');
            if (resEl) {
                const val = `${meta.width},${meta.height}`;
                let found = false;
                for (let opt of resEl.options) {
                    if (opt.value === val) { found = true; break; }
                }
                if (!found) {
                    const newOpt = new Option(`${meta.width} x ${meta.height}`, val);
                    resEl.add(newOpt);
                }
                resEl.value = val;
                resEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        const seedEl = document.getElementById('seed');
        if (seedEl) {
            seedEl.value = meta.seed !== undefined && meta.seed !== null ? meta.seed : '';
        }
    }
    
    setModel(item.model || 'v3');
    window.showToast("生成参数已载入主控制台！", "success");
    closeLightbox();
    ui.toggleMobileControls(true);
}

function lightboxDownload() {
    if (lightboxItems.length === 0) return;
    const item = lightboxItems[lightboxIndex];
    const filename = `novelai-${item.id || Date.now()}.png`;
    triggerDownload(item.image, filename);
}

async function lightboxDelete() {
    if (lightboxItems.length === 0) return;
    const item = lightboxItems[lightboxIndex];
    if (item.isShowcase) return;
    
    if (!(await window.showConfirm("您确定要从历史图库中删除这张图片吗？该操作不可撤销。", "删除图库图片", "trash-2"))) return;
    
    try {
        await store.deleteImage(item.id);
        lightboxItems.splice(lightboxIndex, 1);
        
        if (lightboxItems.length === 0) {
            closeLightbox();
        } else {
            if (lightboxIndex >= lightboxItems.length) {
                lightboxIndex = lightboxItems.length - 1;
            }
            renderLightboxCurrent();
        }
        loadGallery();
    } catch(e) {
        console.error("Failed to delete lightbox image", e);
    }
}

function lightboxCreate(type) {
    if (lightboxItems.length === 0) return;
    const item = lightboxItems[lightboxIndex];
    
    closeLightbox();
    
    // 切换到画布视图以确保二次创作时主界面也是画布模式
    ui.switchRightView('preview');
    
    const imgUrl = item.image || item.imageUrl;
    if (imgUrl) {
        ui.showResultImage(imgUrl);
    }
    
    currentImageId = item.id;
    currentImageData = { ...item, imageUrl: imgUrl };
    window.lastSelectedImageUrl = imgUrl;
    ui.showImageActions(true);

    if (type === 'inpaint') {
        inpaintEditor.open();
    } else if (type === 'outpaint') {
        outpaintEditor.open();
    } else if (type === 'lineart') {
        doAugment('lineart');
    } else if (type === 'sketch') {
        doAugment('sketch');
    }
}

function toggleLightboxSidebarMobile() {
    const sidebar = document.getElementById('lightboxSidebar');
    if (sidebar) {
        sidebar.classList.toggle('expanded');
    }
}

// 键盘翻页监听
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('imageLightboxModal');
    if (modal && modal.classList.contains('modal-active')) {
        if (e.key === 'ArrowLeft') {
            prevLightboxImage();
        } else if (e.key === 'ArrowRight') {
            nextLightboxImage();
        } else if (e.key === 'Escape') {
            closeLightbox();
        }
    }
});

// 移动端手势滑动监听
let touchStartX = 0;
let touchEndX = 0;
const lightboxModal = document.getElementById('imageLightboxModal');
if (lightboxModal) {
    lightboxModal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    lightboxModal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeThreshold = 50;
        if (touchEndX < touchStartX - swipeThreshold) {
            nextLightboxImage();
        } else if (touchEndX > touchStartX + swipeThreshold) {
            prevLightboxImage();
        }
    }, { passive: true });
}

// --- 暴露局部重绘、主题、API Key和鉴权等所有函数到全局 ---
Object.assign(window, {
    openInpaintEditor: () => inpaintEditor.open(),
    closeInpaintEditor: () => inpaintEditor.close(),
    setInpaintTool: (t) => inpaintEditor.setTool(t),
    inpaintUndo: () => inpaintEditor.undo(),
    inpaintClearMask: () => inpaintEditor.clearMask(),
    toggleInpaintDrawer: () => inpaintEditor.toggleDrawer(),
    doInpaint: () => inpaintEditor.doInpaint(),
    outpaintEditor,
    startOutpaint: () => outpaintEditor.open(),
    exitOutpaint: () => outpaintEditor.close(),
    enterCustomApiKey, closeApiKeyModal, verifyCustomApiKey, clearCustomApiKey,
    enterAdminToken, enterUserKey, toggleTheme,
    openLightbox, closeLightbox, prevLightboxImage, nextLightboxImage,
    copyLightboxText, lightboxApplyParams, lightboxDownload, lightboxDelete,
    lightboxCreate, toggleLightboxSidebarMobile,
    saveAdminToken, clearAdminToken,
    addApiKeyInputRow, removeApiKeyInputRow, toggleLowPerf, toggleV45Experimental, randomizeSeed, toggleBypassLimitsEnabled,
    addCharacterPromptRow, removeCharacterPromptRow, selectCharGridCell,
    saveCurrentPromptToNotebook, switchNotebookModel, renderNotebookNotes,
    applyNotebookNote, editNotebookNote, confirmEditNote, cancelEditNote, deleteNotebookNote,
    bindCurrentCanvasToNote, removeNotePreview, viewNotebookNotePreview,
    exportNotebook, triggerImportNotebook, importNotebook,

    // 设置中心方法
    openSettingsModal, closeSettingsModal, switchSettingsTab, openUserModalFromSettings, openAdminPanelFromSettings, updateSettingsUserCard, forceReloadApp, clearImageHistoryCache,

    // 用户系统方法
    openUserModal, closeUserModal, switchAuthTab, submitAuth, submitRecharge, logoutUser, fetchUserProfile,

    // 管理员后台方法
    openAdminPanel, closeAdminPanel, switchAdminTab, fetchAdminUsers, updateUserStatus, saveAdjustedCredits, deleteUserAccount, generateVipCards, copyGeneratedCards
});

// --- 用户系统 (User System) JS Logic ---
async function fetchUserProfile() {
    const token = localStorage.getItem('nai_user_token');
    if (!token) return;

    try {
        const res = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            if (res.status === 401) {
                logoutUser();
            }
            throw new Error('获取用户信息失败');
        }
        const data = await res.json();
        if (data.success && data.user) {
            updateUserCreditsUI(data.user);
        }
    } catch (err) {
        console.error('Fetch profile error:', err);
    }
}

function updateUserCreditsUI(user) {
    const desktopDisplay = document.getElementById('userCreditsDisplay');
    const mobileDisplay = document.getElementById('userCreditsDisplayMobile');
    
    const text = `${user.username} (余:${user.credits})`;
    
    if (desktopDisplay) {
        desktopDisplay.textContent = text;
        desktopDisplay.classList.remove('hidden');
    }
    if (mobileDisplay) {
        mobileDisplay.textContent = text;
        mobileDisplay.classList.remove('hidden');
    }
    
    const oldDesktop = document.getElementById('creditDisplayDesktop');
    const oldMobile = document.getElementById('creditDisplayMobile');
    if (oldDesktop) oldDesktop.classList.add('hidden');
    if (oldMobile) oldMobile.classList.add('hidden');
    
    const profileUsername = document.getElementById('profileUsername');
    const profileCredits = document.getElementById('profileCredits');
    if (profileUsername) profileUsername.textContent = user.username;
    if (profileCredits) profileCredits.textContent = `${user.credits} 点`;
    
    const authPanel = document.getElementById('userAuthPanel');
    const profilePanel = document.getElementById('userProfilePanel');
    if (authPanel) authPanel.classList.add('hidden');
    if (profilePanel) profilePanel.classList.remove('hidden');
    
    if (window.updateSettingsUserCard) {
        updateSettingsUserCard();
    }
}

function openUserModal() {
    openSettingsModal('account');
}

function closeUserModal() {
    closeSettingsModal();
}

function switchAuthTab(tab) {
    const tabLogin = document.getElementById('authTabLogin');
    const tabRegister = document.getElementById('authTabRegister');
    const submitBtn = document.getElementById('authSubmitBtn');
    const authPanel = document.getElementById('userAuthPanel');
    
    const activeClass = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 shadow-sm transition-all';
    const inactiveClass = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-250 transition-all';
    
    if (tab === 'login') {
        if (tabLogin) tabLogin.className = activeClass;
        if (tabRegister) tabRegister.className = inactiveClass;
        if (submitBtn) submitBtn.textContent = '登录';
        if (authPanel) authPanel.dataset.tab = 'login';
    } else {
        if (tabLogin) tabLogin.className = inactiveClass;
        if (tabRegister) tabRegister.className = activeClass;
        if (submitBtn) submitBtn.textContent = '注册 (赠送10点)';
        if (authPanel) authPanel.dataset.tab = 'register';
    }
}

async function submitAuth() {
    const authPanel = document.getElementById('userAuthPanel');
    const statusEl = document.getElementById('authStatus');
    const submitBtn = document.getElementById('authSubmitBtn');
    
    const usernameEl = document.getElementById('authUsername');
    const passwordEl = document.getElementById('authPassword');
    
    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();
    
    if (!username || !password) {
        statusEl.innerHTML = '<span class="text-red-500">✗ 用户名和密码不能为空</span>';
        statusEl.classList.remove('hidden');
        return;
    }
    
    const isLogin = authPanel.dataset.tab !== 'register';
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    statusEl.innerHTML = '<span class="text-gray-500"><span class="loader inline-block w-3 h-3 border-gray-500 border-t-transparent rounded-full animate-spin"></span> 处理中...</span>';
    statusEl.classList.remove('hidden');
    submitBtn.disabled = true;
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || '请求失败');
        }
        
        if (isLogin) {
            localStorage.setItem('nai_user_token', data.token);
            statusEl.innerHTML = '<span class="text-green-500">✔ 登录成功！</span>';
            updateUserCreditsUI(data.user);
            setTimeout(() => {
                statusEl.classList.add('hidden');
                usernameEl.value = '';
                passwordEl.value = '';
            }, 800);
        } else {
            statusEl.innerHTML = '<span class="text-green-500">✔ 注册成功，正在切换到登录...</span>';
            setTimeout(() => {
                passwordEl.value = '';
                switchAuthTab('login');
                statusEl.classList.add('hidden');
            }, 1200);
        }
    } catch (err) {
        statusEl.innerHTML = `<span class="text-red-500">✗ ${err.message}</span>`;
    } finally {
        submitBtn.disabled = false;
    }
}

async function submitRecharge() {
    const statusEl = document.getElementById('rechargeStatus');
    const submitBtn = document.getElementById('rechargeSubmitBtn');
    const cardKeyEl = document.getElementById('rechargeCardKey');
    const token = localStorage.getItem('nai_user_token');
    
    if (!token) {
        statusEl.innerHTML = '<span class="text-red-500">✗ 登录已失效，请重新登录</span>';
        statusEl.classList.remove('hidden');
        return;
    }
    
    const cardKey = cardKeyEl.value.trim();
    if (!cardKey) {
        statusEl.innerHTML = '<span class="text-red-500">✗ 请输入卡密</span>';
        statusEl.classList.remove('hidden');
        return;
    }
    
    statusEl.innerHTML = '<span class="text-gray-500"><span class="loader inline-block w-3 h-3 border-gray-500 border-t-transparent rounded-full animate-spin"></span> 充值中...</span>';
    statusEl.classList.remove('hidden');
    submitBtn.disabled = true;
    
    try {
        const res = await fetch('/api/auth/recharge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ cardKey })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || '充值失败');
        }
        
        statusEl.innerHTML = `<span class="text-green-500">✔ ${data.message}</span>`;
        cardKeyEl.value = '';
        fetchUserProfile();
    } catch (err) {
        statusEl.innerHTML = `<span class="text-red-500">✗ ${err.message}</span>`;
    } finally {
        submitBtn.disabled = false;
    }
}

function logoutUser() {
    localStorage.removeItem('nai_user_token');
    
    const desktopDisplay = document.getElementById('userCreditsDisplay');
    const mobileDisplay = document.getElementById('userCreditsDisplayMobile');
    if (desktopDisplay) desktopDisplay.classList.add('hidden');
    if (mobileDisplay) mobileDisplay.classList.add('hidden');
    
    const authPanel = document.getElementById('userAuthPanel');
    const profilePanel = document.getElementById('userProfilePanel');
    if (authPanel) authPanel.classList.remove('hidden');
    if (profilePanel) profilePanel.classList.add('hidden');
    switchAuthTab('login');
    
    closeUserModal();
    window.showToast("已退出登录", "info");
    
    if (window.updateSettingsUserCard) {
        updateSettingsUserCard();
    }
}

// On page load, fetch user profile if token exists
if (localStorage.getItem('nai_user_token')) {
    fetchUserProfile();
}
// 无论是否拥有 token，在页面加载时都初始化一次设置里的用户卡片
if (window.updateSettingsUserCard) {
    updateSettingsUserCard();
}

// --- 管理员后台 (Admin Panel) JS Logic ---
function openAdminPanel() {
    openSettingsModal('admin');
}

function closeAdminPanel() {
    closeSettingsModal();
}

function switchAdminTab(tab) {
    const tabUsers = document.getElementById('adminTabUsers');
    const tabCards = document.getElementById('adminTabCards');
    const panelUsers = document.getElementById('adminUsersPanel');
    const panelCards = document.getElementById('adminCardsPanel');

    const activeClass = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 shadow-sm transition-all';
    const inactiveClass = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all';

    if (tab === 'users') {
        if (tabUsers) tabUsers.className = activeClass;
        if (tabCards) tabCards.className = inactiveClass;
        if (panelUsers) panelUsers.classList.remove('hidden');
        if (panelCards) panelCards.classList.add('hidden');
    } else {
        if (tabUsers) tabUsers.className = inactiveClass;
        if (tabCards) tabCards.className = activeClass;
        if (panelUsers) panelUsers.classList.add('hidden');
        if (panelCards) panelCards.classList.remove('hidden');
    }
}

async function fetchAdminUsers() {
    const adminToken = localStorage.getItem('nai_admin_token');
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-8 text-gray-400">
                <span class="loader inline-block w-4 h-4 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></span> 正在获取用户列表...
            </td>
        </tr>
    `;

    try {
        const res = await fetch('/api/admin/users', {
            headers: {
                'x-admin-token': adminToken
            }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '获取用户列表失败');

        tbody.innerHTML = '';
        const users = data.users || [];

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">暂无注册用户</td></tr>';
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors';

            // 状态徽章样式
            let statusBadge = '';
            if (user.status === 'Approved') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">已激活</span>';
            } else if (user.status === 'Banned') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">已禁用</span>';
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">待审核</span>';
            }

            // 操作按钮
            let actionButtons = '';
            if (user.status === 'Pending') {
                actionButtons = `
                    <button onclick="updateUserStatus(${user.id}, 'Approved')" class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all mr-1 whitespace-nowrap">批准</button>
                    <button onclick="updateUserStatus(${user.id}, 'Banned')" class="px-2 py-0.5 text-[10px] font-semibold rounded border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all mr-1 whitespace-nowrap">禁用</button>
                `;
            } else if (user.status === 'Approved') {
                actionButtons = `
                    <button onclick="updateUserStatus(${user.id}, 'Banned')" class="px-2 py-0.5 text-[10px] font-semibold rounded border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all mr-1 whitespace-nowrap">禁用</button>
                `;
            } else if (user.status === 'Banned') {
                actionButtons = `
                    <button onclick="updateUserStatus(${user.id}, 'Approved')" class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all mr-1 whitespace-nowrap">激活</button>
                `;
            }
            // 无论任何状态，管理员都可以彻底删除该账号
            actionButtons += `
                <button onclick="deleteUserAccount(${user.id}, '${user.username}')" class="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-500 hover:bg-red-600 text-white transition-all whitespace-nowrap">删除</button>
            `;

            tr.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">${user.username}</td>
                <td class="px-4 py-3 text-gray-500 whitespace-nowrap">${user.role}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                        <input type="number" value="${user.credits}" id="adjustCreditsInput-${user.id}" class="w-14 px-1.5 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-center font-mono text-xs outline-none">
                        <button onclick="saveAdjustedCredits(${user.id})" class="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-emerald-600 dark:text-emerald-400" title="保存额度修改">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        </button>
                    </div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">${actionButtons}</td>
            `;

            tbody.appendChild(tr);
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">✗ 加载失败: ${err.message}</td></tr>`;
    }
}

async function updateUserStatus(userId, newStatus) {
    const adminToken = localStorage.getItem('nai_admin_token');
    
    try {
        const res = await fetch('/api/admin/users/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken
            },
            body: JSON.stringify({ userId, status: newStatus })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '操作失败');

        window.showToast("操作成功！", "success");
        fetchAdminUsers();
    } catch (err) {
        window.showToast(err.message, "error");
    }
}

async function deleteUserAccount(userId, username) {
    if (!userId || !(await window.showConfirm(`您确定要彻底删除用户 "${username}" 吗？此操作不可逆，将清除该用户的所有额度及记录。`, "删除账号", "trash-2"))) return;
    
    const adminToken = localStorage.getItem('nai_admin_token');
    
    try {
        const res = await fetch('/api/admin/users/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken
            },
            body: JSON.stringify({ userId, action: 'delete' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '删除用户失败');

        window.showToast(`已成功删除用户 ${username}`, "success");
        fetchAdminUsers();
    } catch (err) {
        window.showToast(err.message, "error");
    }
}

async function saveAdjustedCredits(userId) {
    const input = document.getElementById(`adjustCreditsInput-${userId}`);
    if (!input) return;
    
    const credits = parseInt(input.value);
    if (isNaN(credits) || credits < 0) {
        window.showToast("请输入大于或等于 0 的整数", "warning");
        return;
    }

    const adminToken = localStorage.getItem('nai_admin_token');
    
    try {
        const res = await fetch('/api/admin/users/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken
            },
            body: JSON.stringify({ userId, credits })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '操作失败');

        window.showToast("点数修改成功！", "success");
        fetchAdminUsers();
        // 顺便触发一下前台余额刷新，以防当前登录的就是被修改的管理员账号
        fetchUserProfile();
    } catch (err) {
        window.showToast(err.message, "error");
    }
}

async function generateVipCards() {
    const btn = document.getElementById('genCardsBtn');
    const countInput = document.getElementById('genCardCount');
    const creditsInput = document.getElementById('genCardCredits');
    
    const count = parseInt(countInput.value);
    const credits = parseInt(creditsInput.value);

    if (isNaN(count) || count < 1 || count > 100) {
        window.showToast("单次生成数量建议在 1 到 100 之间", "warning");
        return;
    }
    if (isNaN(credits) || credits < 1) {
        window.showToast("卡密点数必须大于 0", "warning");
        return;
    }

    const adminToken = localStorage.getItem('nai_admin_token');
    
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.innerHTML = '<span class="loader inline-block w-4 h-4 border-gray-800 dark:border-white border-t-transparent rounded-full animate-spin mr-2"></span> 正在批量写入...';

    try {
        const res = await fetch('/api/admin/cards/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken
            },
            body: JSON.stringify({ count, credits })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '生成卡密失败');

        // 显示生成的卡密列表
        const wrapper = document.getElementById('genCardsResultWrapper');
        const textarea = document.getElementById('genCardsTextarea');
        
        if (wrapper && textarea) {
            textarea.value = (data.cards || []).join('\n');
            wrapper.classList.remove('hidden');
        }

        window.showToast(data.message, "success");
    } catch (err) {
        window.showToast(err.message, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

function copyGeneratedCards() {
    const textarea = document.getElementById('genCardsTextarea');
    if (!textarea || !textarea.value) return;

    textarea.select();
    try {
        document.execCommand('copy');
        window.showToast("已成功复制全部卡密到剪贴板！", "success");
    } catch (err) {
        // Fallback for newer browser APIs
        navigator.clipboard.writeText(textarea.value)
            .then(() => window.showToast("已成功复制全部卡密到剪贴板！", "success"))
            .catch(() => window.showToast("复制失败，请手动选择复制", "error"));
    }
}


