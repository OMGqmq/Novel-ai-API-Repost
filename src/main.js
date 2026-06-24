import { ImageEngine } from './engine.js?v=202605292218';
import { GalleryStore } from './storage.js?v=202605292218';
import { UIController } from './ui.js?v=202605292218';
import { InpaintEditor } from './inpaint.js?v=202605292218';
import { OutpaintEditor } from './outpaint.js?v=202605292218';
import { PromptHelper } from './prompt-helper.js?v=202605292218';
import { NotebookManager } from './notebook.js?v=202605292218';
import { VibeManager } from './vibe-manager.js?v=202605292218';
import { CharRefManager } from './char-ref-manager.js?v=20260611';
import { AiHelperService } from './ai-helper-service.js?v=20260618';
import { appState } from './app-state.js';
import { GalleryController } from './gallery.js';
import { initToolbox, openToolboxModal, closeToolboxModal, switchToolboxTab, toggleScrambleHistoryList, handleScrambleFileUpload, setScrambleMode, onScrambleAlgorithmChange, toggleScramblePasswordInput, executeScrambleProcess, downloadScrambleResult, toggleMetadataHistoryList, handleMetadataFileUpload, applyMetadataParameters } from './toolbox-controller.js?v=20260620';
import { SettingsManager } from './settings-manager.js';
import { CharPromptManager } from './char-prompt-manager.js';
import { AuthController } from './auth-controller.js';
import { AdminController } from './admin-controller.js';
import { XyPlotManager } from './xy-plot-manager.js';
import { RandomPromptManager } from './random-prompt-manager.js';
import { RandomPromptController } from './random-prompt-controller.js';



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

    let finalUrl = url;
    let isBlobCreated = false;

    // 1. 如果是 data: Base64，同步转换为 Blob URL
    // 这能有效规避 Chrome/Edge 对 data: 协议大文件多次下载的安全拦截
    if (url.startsWith('data:')) {
        try {
            const parts = url.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const binary = atob(parts[1]);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([array], { type: mime });
            finalUrl = URL.createObjectURL(blob);
            isBlobCreated = true;
            console.log('[DEBUG-dl] Converted data URL to Blob URL successfully.');
        } catch (e) {
            console.error('[DEBUG-dl] Failed to convert data URL, using original:', e);
            finalUrl = url;
        }
    }

    // 2. 传统静态锚点点击下载 (完全同步，确保用户手势生命周期不丢失)
    let a = document.getElementById('globalDownloadAnchor');
    if (!a) {
        a = document.createElement('a');
        a.id = 'globalDownloadAnchor';
        a.style.display = 'none';
        a.rel = 'noopener';
        document.body.appendChild(a);
    }

    a.download = filename;
    a.href = finalUrl;
    
    try {
        a.click();
        console.log('[DEBUG-dl] Sync download triggered successfully.');
    } catch (e) {
        console.error('[DEBUG-dl] Direct click failed, attempting MouseEvent dispatch:', e);
        try {
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            a.dispatchEvent(event);
        } catch (err) {
            console.error('[DEBUG-dl] Dispatch failed too:', err);
        }
    }

    // 3. 延迟注销 Blob URL 防止内存泄漏，同时绝不阻断当前下载
    if (isBlobCreated && finalUrl.startsWith('blob:')) {
        setTimeout(() => {
            try {
                URL.revokeObjectURL(finalUrl);
                console.log('[DEBUG-dl] Blob URL revoked successfully after delay.');
            } catch (err) {
                console.error('[DEBUG-dl] Failed to revoke Blob URL:', err);
            }
        }, 15000); // 延迟 15 秒，确保浏览器已经开始并完成了下载的处理
    }
}

// PromptHelper is now imported from './prompt-helper.js'
const engine = new ImageEngine();
const store = new GalleryStore();
window.triggerDownload = triggerDownload;
initToolbox(store);
const ui = new UIController();
const els = ui.els;
const aiHelper = new AiHelperService(store);

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
const charRefManager = new CharRefManager({
    store: store,
    compressImage: compressImage,
    onShowToast: (msg, type) => window.showToast ? window.showToast(msg, type) : console.log(msg)
});

const galleryController = new GalleryController({ store, ui, appState });

function loadVibeState(model) {
    vibeManager.loadState(model);
    charRefManager.loadState(model);
    charRefManager.initEventListeners(model);
}

const settingsManager = new SettingsManager();
const charPromptManager = new CharPromptManager();
const authController = new AuthController();
const adminController = new AdminController();
const xyPlotManager = new XyPlotManager();
const randomPromptManager = new RandomPromptManager();
const randomPromptController = new RandomPromptController();

charPromptManager.bind(store);
authController.bind(ui, store);
adminController.bind(ui, store, authController);
xyPlotManager.bind(store);

settingsManager.bind(ui, store, {
    onModelChange: (model) => {
        loadVibeState(model);
    },
    onHydrate: () => {
        // Restore V4.5 cached character prompts
        const savedCharPrompts = store.getSetting('nai_v45_character_prompts');
        if (savedCharPrompts) {
            try {
                const list = JSON.parse(savedCharPrompts);
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        charPromptManager.addCharacterPromptRow(
                            item.prompt || '',
                            item.negative || '',
                            typeof item.x === 'number' ? item.x : 0.5,
                            typeof item.y === 'number' ? item.y : 0.5,
                            item.autoPos !== false,
                            item.enabled !== false,
                            true // isInitializing = true
                        );
                    });
                }
            } catch (err) {
                console.error('Failed to parse cached character prompts:', err);
            }
        }
    }
});

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

// Theme and settings initialization are handled by SettingsManager and UIController
ui.initTheme();

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
            appState.currentInitImageBase64 = compressedDataUrl.split(',')[1];
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
    appState.currentInitImageBase64 = null;
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
window.handleCharRefImage = (event) => charRefManager.handleCharRefImage(event, document.getElementById('modelValue').value);
window.clearCharRefImage = () => charRefManager.clearCharRefImage(document.getElementById('modelValue').value);
window.toggleCharRefEnabled = () => charRefManager.toggleCharRefEnabled(document.getElementById('modelValue').value);
window.toggleCharRefMode = () => charRefManager.toggleCharRefMode(document.getElementById('modelValue').value);

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

async function doGenerateZImage() {
    try {
        const promptText = els.prompt.value.trim();
        if (!promptText) { els.prompt.focus(); ui.toggleMobileControls(true); return; }

        const resEl = document.getElementById('resolution');
        if (!resEl) throw new Error("找不到分辨率选择器");
        const [w, h] = resEl.value.split(',').map(Number);

        // 切换 UI 到 preview 状态
        if (ui.currentRightView !== 'preview') ui.switchRightView('preview');
        ui.toggleMobileControls(false);
        ui.setLoading(true, "生成中...");

        // 获取 ZImage 专属参数
        const ziTransparentEl = document.getElementById('ziTransparent');
        const ziEnhanceEl = document.getElementById('ziEnhance');
        const ziQualityEl = document.getElementById('ziQuality');

        const zi_transparent = ziTransparentEl ? ziTransparentEl.checked : false;
        const zi_enhance = ziEnhanceEl ? ziEnhanceEl.checked : true;
        const zi_quality = ziQualityEl ? ziQualityEl.value : "standard";

        // 提取或生成 Seed
        const seedEl = document.getElementById('seed');
        const userSeedVal = seedEl ? seedEl.value.trim() : "";
        let finalSeed;
        if (userSeedVal && !isNaN(userSeedVal)) {
            finalSeed = parseInt(userSeedVal) % 2147483648;
        } else {
            finalSeed = Math.floor(Math.random() * 2147483647);
        }

        const params = {
            version: 'zimage',
            prompt: promptText,
            width: w,
            height: h,
            seed: finalSeed,
            zi_transparent,
            zi_enhance,
            zi_quality
        };

        // 构造极简的 auth
        const auth = {
            adminToken: store.getSetting('nai_admin_token'),
            userKey: store.getSetting('nai_user_key'),
            userToken: localStorage.getItem('nai_user_token') || "",
            customApiKey: ""
        };

        // 发起生成请求
        const result = await engine.generate(params, auth);

        if (result.userRole) {
            ui.updateCreditDisplay(result.userRole);
        }

        // 保存历史
        const metaData = {
            width: params.width,
            height: params.height,
            seed: params.seed,
            zi_transparent: params.zi_transparent,
            zi_enhance: params.zi_enhance,
            zi_quality: params.zi_quality
        };

        // 转 Base64 存历史
        const reader = new FileReader();
        reader.readAsDataURL(result.blob);
        reader.onloadend = async () => {
            await saveToHistory(reader.result, promptText, 'zimage', result, false, metaData);
        };

        // 展示图片
        ui.showResultImages([result], (selected) => {
            appState.currentImageData = selected;
            if (selected.id) appState.currentImageId = selected.id;
            window.lastSelectedImageUrl = selected.imageUrl;
        });

    } catch (err) {
        console.error("ZImage Generate Error:", err);
        alert(err.message || err);
    } finally {
        ui.setLoading(false);
        ui.toggleMobileControls(true);
    }
}

async function doGenerate() {
    // Check if outpaint is active
    const outpaintArea = document.getElementById('outpaintArea');
    if (outpaintArea && !outpaintArea.classList.contains('hidden')) {
        if (window.outpaintEditor) {
            window.outpaintEditor.generate();
        }
        return;
    }

    const selectedVersion = document.getElementById('modelValue').value;
    if (selectedVersion === 'zimage') {
        return doGenerateZImage();
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


        const isAdmin = !!authBase.adminToken || customApiKeys.length > 0;

        let batchTotal = 1;
        if (isAdmin && els.batchCount) {
            batchTotal = parseInt(els.batchCount.value) || 1;
        }

        if (ui.currentRightView !== 'preview') ui.switchRightView('preview');
        ui.toggleMobileControls(false);
        
        const hasCustomKey = customApiKeys.length > 0;

        const vibeVal = vibeManager.isValidForModel(selectedVersion);
        if (!vibeVal.isValid) {
            alert(vibeVal.error);
            ui.setLoading(false);
            ui.toggleMobileControls(true);
            return;
        }

        const charRefVal = charRefManager.isValidForModel(selectedVersion, hasCustomKey);
        if (!charRefVal.isValid) {
            alert(charRefVal.error);
            ui.setLoading(false);
            ui.toggleMobileControls(true);
            return;
        }

        if (xyPlotManager.isEnabled()) {
            return doGenerateXyPlot({ selectedVersion, promptText, hasCustomKey, authBase });
        }

        for (let i = 0; i < batchTotal; i++) {
            const statusText = batchTotal > 1 ? `生成中 (${i + 1}/${batchTotal})` : "生成中...";
            ui.setLoading(true, statusText);

            const isConcurrent = store.getSetting('nai_custom_key_concurrent') === 'true';
            const auths = (isConcurrent && customApiKeys.length > 0)
                ? customApiKeys.map(key => ({ ...authBase, customApiKey: key }))
                : [{ ...authBase, customApiKey: (customApiKeys.length > 0 ? customApiKeys[i % customApiKeys.length] : "") }];

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

                if (appState.currentInitImageBase64) {
                    const strEl = document.getElementById('strength');
                    const noiEl = document.getElementById('noise');
                    params.image = appState.currentInitImageBase64;
                    params.strength = strEl ? parseFloat(strEl.value) : 0.5;
                    params.noise = noiEl ? parseFloat(noiEl.value) : 0;
                }
                
                const vibeParams = vibeManager.getPayloadParams(selectedVersion);
                Object.assign(params, vibeParams);
                const charRefParams = charRefManager.getPayloadParams(selectedVersion);
                Object.assign(params, charRefParams);


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

                    let finalPrompt = promptText;
                    let randomSelections = null;
                    if (randomPromptManager.isEnabled()) {
                        const { selectedTags, individualSelections } = randomPromptManager.getRandomSelection();
                        if (selectedTags) {
                            finalPrompt = promptText + (promptText ? ', ' : '') + selectedTags;
                            randomSelections = individualSelections;
                        }
                    }

                    return {
                        ...params,
                        prompt: finalPrompt,
                        seed: finalSeed,
                        randomSelections
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
                            noise: localParams.noise || null,

                            // 以下为新增套用支持的高级/微调参数与多角色数据
                            sm: localParams.sm !== undefined ? localParams.sm : false,
                            sm_dyn: localParams.sm_dyn !== undefined ? localParams.sm_dyn : false,
                            cfg_rescale: localParams.cfg_rescale !== undefined ? localParams.cfg_rescale : 0.0,
                            uncond_scale: localParams.uncond_scale !== undefined ? localParams.uncond_scale : 1.0,
                            skip_cfg_above_sigma: localParams.skip_cfg_above_sigma !== undefined ? localParams.skip_cfg_above_sigma : null,
                            v4_5_experimental: localParams.v4_5_experimental !== undefined ? localParams.v4_5_experimental : false,
                            v4_prompt_use_coords: localParams.v4_prompt_use_coords !== undefined ? localParams.v4_prompt_use_coords : false,
                            v4_prompt_use_order: localParams.v4_prompt_use_order !== undefined ? localParams.v4_prompt_use_order : true,
                            v4_neg_use_order: localParams.v4_neg_use_order !== undefined ? localParams.v4_neg_use_order : false,
                            deliberate_euler_ancestral_bug: localParams.deliberate_euler_ancestral_bug !== undefined ? localParams.deliberate_euler_ancestral_bug : false,
                            prefer_brownian: localParams.prefer_brownian !== undefined ? localParams.prefer_brownian : true,
                            char_captions: localParams.char_captions || null,
                            random_prompt_selections: localParams.randomSelections || null
                        };

                        // 转Base64存历史
                        const reader = new FileReader();
                        reader.readAsDataURL(result.blob);
                        reader.onloadend = async () => {
                            await saveToHistory(reader.result, localParams.prompt, selectedVersion, result, false, metaData);
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
                    appState.currentImageData = selected;
                    if (selected.id) appState.currentImageId = selected.id;
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

async function doGenerateXyPlot({ selectedVersion, promptText, hasCustomKey, authBase }) {
    try {
        const resEl = document.getElementById('resolution');
        const [w, h] = resEl.value.split(',').map(Number);

        const nsEl = document.getElementById('noise_schedule');
        const smEl = document.getElementById('smEnabled');
        const smDynEl = document.getElementById('smDynEnabled');
        const qualityEl = document.getElementById('qualityToggleEnabled');
        const dynThresholdEl = document.getElementById('dynThresholdEnabled');
        const cfgRescaleEl = document.getElementById('cfgRescale');
        const uncondScaleEl = document.getElementById('uncondScale');
        const skipCfgEl = document.getElementById('skipCfg');

        let finalPrompt = promptText;
        let randomSelections = null;
        if (randomPromptManager.isEnabled()) {
            const { selectedTags, individualSelections } = randomPromptManager.getRandomSelection();
            if (selectedTags) {
                finalPrompt = promptText + (promptText ? ', ' : '') + selectedTags;
                randomSelections = individualSelections;
            }
        }

        const baseParams = {
            version: selectedVersion,
            prompt: finalPrompt,
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
            baseParams.v4_5_experimental = isExp;
            
            const charRows = document.querySelectorAll('.character-prompt-row');
            const charCaptions = [];
            let hasCustomCoords = false;
            charRows.forEach(row => {
                const enableToggle = row.querySelector('.char-enable-toggle');
                if (enableToggle && !enableToggle.checked) return;
                
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
                    if (!isAutoPos) hasCustomCoords = true;
                }
            });

            if (charCaptions.length > 0) baseParams.char_captions = charCaptions;
            
            if (isExp) {
                const eulerBugEl = document.getElementById('v45EulerBug');
                const preferBrownianEl = document.getElementById('v45PreferBrownian');
                const useCoordsEl = document.getElementById('v45UseCoords');
                const useOrderEl = document.getElementById('v45UseOrder');
                const negUseOrderEl = document.getElementById('v45NegUseOrder');
                
                if (eulerBugEl) baseParams.deliberate_euler_ancestral_bug = eulerBugEl.checked;
                if (preferBrownianEl) baseParams.prefer_brownian = preferBrownianEl.checked;
                if (useCoordsEl) baseParams.v4_prompt_use_coords = useCoordsEl.checked;
                if (useOrderEl) baseParams.v4_prompt_use_order = useOrderEl.checked;
                if (negUseOrderEl) baseParams.v4_neg_use_order = negUseOrderEl.checked;
            }
            if (hasCustomCoords) baseParams.v4_prompt_use_coords = true;
            if (skipCfgEl) baseParams.skip_cfg_above_sigma = isExp ? parseInt(skipCfgEl.value) : null;
        }

        if (appState.currentInitImageBase64) {
            const strEl = document.getElementById('strength');
            const noiEl = document.getElementById('noise');
            baseParams.image = appState.currentInitImageBase64;
            baseParams.strength = strEl ? parseFloat(strEl.value) : 0.5;
            baseParams.noise = noiEl ? parseFloat(noiEl.value) : 0;
        }
        
        const vibeParams = vibeManager.getPayloadParams(selectedVersion);
        Object.assign(baseParams, vibeParams);
        const charRefParams = charRefManager.getPayloadParams(selectedVersion);
        Object.assign(baseParams, charRefParams);

        const seedEl = document.getElementById('seed');
        const userSeedVal = seedEl ? seedEl.value.trim() : "";
        let baseSeed;
        if (userSeedVal && !isNaN(userSeedVal)) {
            baseSeed = parseInt(userSeedVal);
        } else {
            baseSeed = Math.floor(Math.random() * 4294967295);
        }
        baseParams.seed = baseSeed;

        const paramGrid = xyPlotManager.generateParamGrid(baseParams);
        if (paramGrid.length === 0) {
            throw new Error("X/Y Plot 参数值配置为空，无法生成对比网格");
        }

        const successfulResults = [];

        for (let idx = 0; idx < paramGrid.length; idx++) {
            const cell = paramGrid[idx];
            ui.setLoading(true, `X/Y Plot 生成中 (${idx + 1}/${paramGrid.length})`);

            const customApiKeyRaw = store.getSetting('nai_custom_api_key');
            const customApiKeys = (customApiKeyRaw || "")
                .split(/[\n,]/)
                .map(k => k.trim())
                .filter(k => k);

            const auth = {
                ...authBase,
                customApiKey: (customApiKeys.length > 0 ? customApiKeys[idx % customApiKeys.length] : "")
            };

            const isSeedPlot = (xyPlotManager.getXyConfigs().xType === 'seed' || xyPlotManager.getXyConfigs().yType === 'seed');
            if (!isSeedPlot) {
                cell.params.seed = (baseSeed + idx) % 4294967296;
            }

            try {
                const result = await engine.generate(cell.params, auth);

                if (result.userRole) {
                    ui.updateCreditDisplay(result.userRole);
                }

                result.xyInfo = cell.xyInfo;
                successfulResults.push(result);

                const metaData = {
                    negative_prompt: cell.params.negative_prompt,
                    width: cell.params.width,
                    height: cell.params.height,
                    steps: cell.params.steps,
                    scale: cell.params.scale,
                    sampler: cell.params.sampler,
                    seed: cell.params.seed,
                    strength: cell.params.strength || null,
                    noise: cell.params.noise || null,
                    sm: cell.params.sm !== undefined ? cell.params.sm : false,
                    sm_dyn: cell.params.sm_dyn !== undefined ? cell.params.sm_dyn : false,
                    cfg_rescale: cell.params.cfg_rescale !== undefined ? cell.params.cfg_rescale : 0.0,
                    uncond_scale: cell.params.uncond_scale !== undefined ? cell.params.uncond_scale : 1.0,
                    skip_cfg_above_sigma: cell.params.skip_cfg_above_sigma !== undefined ? cell.params.skip_cfg_above_sigma : null,
                    v4_5_experimental: cell.params.v4_5_experimental !== undefined ? cell.params.v4_5_experimental : false,
                    v4_prompt_use_coords: cell.params.v4_prompt_use_coords !== undefined ? cell.params.v4_prompt_use_coords : false,
                    v4_prompt_use_order: cell.params.v4_prompt_use_order !== undefined ? cell.params.v4_prompt_use_order : true,
                    v4_neg_use_order: cell.params.v4_neg_use_order !== undefined ? cell.params.v4_neg_use_order : false,
                    deliberate_euler_ancestral_bug: cell.params.deliberate_euler_ancestral_bug !== undefined ? cell.params.deliberate_euler_ancestral_bug : false,
                    prefer_brownian: cell.params.prefer_brownian !== undefined ? cell.params.prefer_brownian : true,
                    char_captions: cell.params.char_captions || null,
                    xyInfo: cell.xyInfo,
                    random_prompt_selections: randomSelections
                };

                const reader = new FileReader();
                reader.readAsDataURL(result.blob);
                reader.onloadend = async () => {
                    await saveToHistory(reader.result, finalPrompt, selectedVersion, result, false, metaData);
                };

            } catch (cellErr) {
                console.error(`X/Y Plot grid cell [${cell.xyInfo}] failed:`, cellErr);
            }
        }

        if (successfulResults.length === 0) {
            throw new Error("X/Y Plot 网格中所有生成请求均失败");
        }

        ui.showResultImages(successfulResults, (selected) => {
            appState.currentImageData = selected;
            if (selected.id) appState.currentImageId = selected.id;
            window.lastSelectedImageUrl = selected.imageUrl;
        });

    } catch (err) {
        console.error("X/Y Plot Grid Gen Error:", err);
        alert(err.message || err);
    } finally {
        ui.setLoading(false);
        ui.toggleMobileControls(true);
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
store.init().then(() => galleryController.loadGallery());

async function saveToHistory(imgData, prompt, model, resultObj = null, forceFocus = false, meta = null) {
    try {
        const savedItem = await store.saveImage(imgData, prompt, model, meta);
        if (resultObj) {
            resultObj.id = savedItem.id;
        }
        
        // If it's a legacy call (no resultObj) or we force focus, OR if the newly saved result is what the user is currently viewing
        if (forceFocus || (!resultObj && !forceFocus) || (resultObj && appState.currentImageData === resultObj)) {
            appState.currentImageId = savedItem.id;
            appState.currentImageData = savedItem;
            ui.showImageActions(true);
        }
        
        galleryController.loadGallery();
        return savedItem;
    } catch (e) {
        console.error("Failed to save to history", e);
    }
}

async function deleteCurrentImage() {
    if (appState.currentImageData && appState.currentImageData.isShowcase) return;
    if (!appState.currentImageId || !(await window.showConfirm("您确定要从历史记录中删除这张图片吗？", "删除图片", "trash-2"))) return;
    try {
        await store.deleteImage(appState.currentImageId);
        ui.resetPreview();
        galleryController.loadGallery();
    } catch (e) {
        console.error("Failed to delete image", e);
    }
}

async function clearAllHistory() {
    if (!(await window.showConfirm("清空历史将永久删除所有已生成的本地图片，确定要继续吗？", "清空历史记录", "alert-triangle"))) return;
    try {
        await store.clearAll();
        galleryController.loadGallery();
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
    if (!appState.currentImageData || !(appState.currentImageData.imageUrl || appState.currentImageData.image)) return;
    
    const imageUrl = appState.currentImageData.imageUrl || appState.currentImageData.image;
    
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
            await saveToHistory(reader2.result, `[${reqType}] ` + (appState.currentImageData.prompt || ""), appState.currentImageData.model || "v3", result, true);
        };

        ui.showResultImages([result], (selected) => {
            appState.currentImageData = selected;
            if (selected.id) appState.currentImageId = selected.id;
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

// 画廊流式加载与滚动监听逻辑已抽离至 src/gallery.js 模块中

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

function toggleXyPlotEnabled(checked) {
    const controls = document.getElementById('xyPlotControls');
    if (controls) {
        controls.classList.toggle('hidden', !checked);
    }
    updateXyPlotCountPreview();
}
window.toggleXyPlotEnabled = toggleXyPlotEnabled;

function updateXyPlotCountPreview() {
    const previewEl = document.getElementById('xyPlotCountPreview');
    if (!previewEl) return;

    const { xValues, yValues } = xyPlotManager.getXyConfigs();
    const total = xValues.length * yValues.length;
    previewEl.textContent = total;
}
window.updateXyPlotCountPreview = updateXyPlotCountPreview;

// --- 暴露给 Window 的代理方法 ---
const renderNotebookCallback = () => notebookManager.render();

Object.assign(window, {
    toggleMobileControls: (s) => ui.toggleMobileControls(s),
    setModel: (v) => {
        ui.setModel(v);
        store.setSetting('nai_model_version', v);
        loadVibeState(v);
    },
    switchRightView: (v) => ui.switchRightView(v, (tab) => galleryController.switchGalleryTab(tab)),
    toggleDrawer: () => ui.toggleDrawer(),
    switchDrawerTab: (t) => ui.switchDrawerTab(t, renderNotebookCallback),
    openNotebook: () => ui.openNotebook(renderNotebookCallback),
    handleInitImage, clearInitImage, doGenerate,
    useCurrentPrompt: () => galleryController.useCurrentPrompt(),
    deleteCurrentImage, clearAllHistory,
    switchGalleryTab: (tab) => galleryController.switchGalleryTab(tab),
    downloadZip: () => galleryController.downloadZip(),
    backToGrid: () => ui.showGrid(),
    doAugment, toggleToolbox,
    openLightbox
});

fetch('gallery_index.json').then(r => r.json()).then(d => {
    appState.showcaseData = d;
    // 数据就绪后,若当前在展示 tab 且 grid 为空则立即渲染
    const grid = document.getElementById('showcaseGrid');
    if (appState.currentGalleryTab === 'showcase' && grid && grid.children.length === 0) {
        galleryController.renderShowcase();
    }
}).catch(() => { });


const promptHelper = new PromptHelper({
    promptEl: els.prompt,
    containerEl: document.getElementById('promptHelperContainer'),
    searchInputEl: els.tagSearchInput,
    searchBtnEl: els.tagSearchBtn,
    searchResultsEl: els.tagResults,
    onShowToast: (msg, type) => window.showToast ? window.showToast(msg, type) : console.log(msg)
});

randomPromptController.bind(randomPromptManager, promptHelper);

function toggleTheme() {
    ui.toggleTheme();
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
function toggleKeyConcurrent(forceState) {
    const checkbox = document.getElementById('settingsKeyConcurrentCheckbox');
    const enabled = typeof forceState === 'boolean' ? forceState : (checkbox ? checkbox.checked : false);
    
    store.setSetting('nai_custom_key_concurrent', enabled ? 'true' : 'false');
    if (checkbox) checkbox.checked = enabled;
    
    window.showToast(enabled ? "已启用多 Key 并发生成" : "已切换为多 Key 轮询生成", "success");
}

function saveAiHelperSettings() {
    const baseUrl = document.getElementById('aiHelperBaseUrl')?.value.trim() || "";
    const apiKey = document.getElementById('aiHelperApiKey')?.value.trim() || "";
    const model = document.getElementById('aiHelperModel')?.value.trim() || "";
    const systemPrompt = document.getElementById('aiHelperSystemPrompt')?.value.trim() || "";

    store.setSetting('ai_helper_base_url', baseUrl);
    store.setSetting('ai_helper_api_key', apiKey);
    store.setSetting('ai_helper_model', model);
    store.setSetting('ai_helper_system_prompt', systemPrompt);

    window.showToast("AI 提示词助手配置已保存", "success");
}

async function testAiHelperConnection() {
    const statusEl = document.getElementById('aiHelperStatus');
    const testBtn = document.getElementById('aiHelperTestBtn');
    if (statusEl) {
        statusEl.className = "text-xs px-1 text-gray-500 mt-2 block";
        statusEl.textContent = "正在测试连接...";
        statusEl.classList.remove('hidden');
    }
    if (testBtn) testBtn.disabled = true;

    try {
        const tempStore = {
            getSetting(key, defVal) {
                if (key === 'ai_helper_base_url') return document.getElementById('aiHelperBaseUrl')?.value.trim() || defVal;
                if (key === 'ai_helper_api_key') return document.getElementById('aiHelperApiKey')?.value.trim() || defVal;
                if (key === 'ai_helper_model') return document.getElementById('aiHelperModel')?.value.trim() || defVal;
                if (key === 'ai_helper_system_prompt') return document.getElementById('aiHelperSystemPrompt')?.value.trim() || defVal;
                return defVal;
            }
        };
        const tempService = new AiHelperService(tempStore);
        // 用最简问题快速测试
        const res = await tempService.generatePrompt("Say 'ok'");
        
        if (statusEl) {
            statusEl.className = "text-xs px-1 text-emerald-500 font-semibold mt-2 block";
            statusEl.textContent = `连接成功! 响应: ${res}`;
        }
        window.showToast("连接测试成功!", "success");
    } catch (err) {
        if (statusEl) {
            statusEl.className = "text-xs px-1 text-red-500 font-semibold mt-2 block";
            statusEl.textContent = `连接失败: ${err.message}`;
        }
        window.showToast("连接测试失败", "error");
    } finally {
        if (testBtn) testBtn.disabled = false;
    }
}

async function optimizePromptWithAi() {
    const btn = document.getElementById('promptAiBtn');
    const promptInput = document.getElementById('prompt');
    if (!promptInput) return;

    const originalHtml = btn ? btn.innerHTML : "";
    const userIdea = promptInput.value.trim();

    if (!userIdea) {
        window.showToast("请先在正向提示词中输入一些简单想法", "warning");
        promptInput.focus();
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 优化中...`;
    }

    try {
        const expandedPrompt = await aiHelper.generatePrompt(userIdea);
        promptInput.value = expandedPrompt;
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        window.showToast("提示词优化成功!", "success");
    } catch (err) {
        console.error("AI Optimize Error:", err);
        window.showToast(`优化失败: ${err.message}`, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }
}

function toggleV45Experimental(forceState) {
    const checkbox = document.getElementById('settingsV45ExperimentalCheckbox');
    const enabled = typeof forceState === 'boolean' ? forceState : (checkbox ? checkbox.checked : false);
    settingsManager.toggleV45Experimental(enabled);
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
    settingsManager.saveAdminToken(val);
    statusEl.innerHTML = '<span class="text-green-500">✔ 管理员密码已保存，已解锁后台</span>';
    statusEl.classList.remove('hidden');
    
    setTimeout(() => {
        switchSettingsTab('admin');
        if (statusEl) statusEl.classList.add('hidden');
    }, 1000);
}
function clearAdminToken() {
    settingsManager.clearAdminToken();
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
    settingsManager.checkAdminStatus();
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
function toggleCharacterPromptsPanel() {
    const panel = document.getElementById('characterPromptsPanel');
    const chevron = document.getElementById('charChevron');
    if (!panel) return;
    
    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        panel.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}
window.toggleCharacterPromptsPanel = toggleCharacterPromptsPanel;

function addCharacterPromptRow(promptVal = '', negVal = '', x = 0.5, y = 0.5, autoPos = true, enabled = true, isInitializing = false) {
    charPromptManager.addCharacterPromptRow(promptVal, negVal, x, y, autoPos, enabled, isInitializing);
}
window.addCharacterPromptRow = addCharacterPromptRow;

function removeCharacterPromptRow(button) {
    charPromptManager.removeCharacterPromptRow(button);
}
window.removeCharacterPromptRow = removeCharacterPromptRow;

function selectCharGridCell(btn, x, y) {
    charPromptManager.selectCharGridCell(btn, x, y);
}
window.selectCharGridCell = selectCharGridCell;

function saveCharacterPromptsState() {
    charPromptManager.saveCharacterPromptsState();
}
window.saveCharacterPromptsState = saveCharacterPromptsState;

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

    if (tabName === 'randomPrompt') {
        randomPromptController.renderList();
        const globalCheckbox = document.getElementById('randomPromptEnabled');
        if (globalCheckbox) {
            globalCheckbox.checked = randomPromptManager.isEnabled();
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
            appState.currentImageData = selected;
            if (selected.id) appState.currentImageId = selected.id;
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
        lightboxItems = appState.showcaseData.map(s => ({
            id: s.id,
            image: `images/${s.id}.png`,
            prompt: s.prompt,
            model: s.model || 'v3',
            isShowcase: true,
            meta: null
        }));
        lightboxIndex = lightboxItems.findIndex(x => x.id === item.id);
    } else {
        lightboxItems = galleryController.galleryItems;
        lightboxIndex = galleryController.galleryItems.findIndex(x => x.id === item.id);
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
    } else if (lightboxItems.length > 0 && !lightboxItems[0].isShowcase && galleryController.galleryHasMore) {
        const prevLength = lightboxItems.length;
        await galleryController.loadMoreGallery();
        lightboxItems = galleryController.galleryItems;
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
    
    // 1. 先载入并应用模型版本，以便正确初始化模型专属的高级面板显示状态
    const modelVer = item.model || 'v3';
    if (window.setModel) {
        window.setModel(modelVer);
    } else if (typeof setModel === 'function') {
        setModel(modelVer);
    }
    
    // 2. 载入正向提示词
    els.prompt.value = item.prompt || '';
    els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
    
    const meta = item.meta;
    if (meta) {
        // 3. 载入负向提示词
        if (meta.negative_prompt !== undefined) {
            els.negative.value = meta.negative_prompt || '';
            els.negative.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // 4. 载入 Steps, Scale, Seed, Resolution
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

        // 5. 载入高级/微调参数：Sampler, SMEA, CFG Rescale, UC Scale, Skip CFG
        const samplerEl = document.getElementById('sampler');
        if (samplerEl && meta.sampler) {
            samplerEl.value = meta.sampler;
            samplerEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const smEl = document.getElementById('smEnabled');
        if (smEl && meta.sm !== undefined) {
            smEl.checked = meta.sm;
            smEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const smDynEl = document.getElementById('smDynEnabled');
        if (smDynEl && meta.sm_dyn !== undefined) {
            smDynEl.checked = meta.sm_dyn;
            smDynEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const cfgRescaleEl = document.getElementById('cfgRescale');
        if (cfgRescaleEl && meta.cfg_rescale !== undefined) {
            cfgRescaleEl.value = meta.cfg_rescale;
            const vEl = document.getElementById('cfgRescaleValue');
            if (vEl) vEl.textContent = parseFloat(meta.cfg_rescale).toFixed(2);
            cfgRescaleEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const uncondScaleEl = document.getElementById('uncondScale');
        if (uncondScaleEl && meta.uncond_scale !== undefined) {
            uncondScaleEl.value = meta.uncond_scale;
            const vEl = document.getElementById('uncondScaleValue');
            if (vEl) vEl.textContent = parseFloat(meta.uncond_scale).toFixed(2);
            uncondScaleEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const skipCfgEl = document.getElementById('skipCfg');
        if (skipCfgEl && meta.skip_cfg_above_sigma !== undefined) {
            const val = meta.skip_cfg_above_sigma === null ? '' : meta.skip_cfg_above_sigma;
            skipCfgEl.value = val;
            const vEl = document.getElementById('skipCfgValue');
            if (vEl) vEl.textContent = val;
            skipCfgEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 6. 载入 V4.5 专属高级微调参数
        const isExp = meta.v4_5_experimental === true || (meta.v4_5_experimental === undefined && (
            meta.v4_prompt_use_coords !== undefined || meta.v4_prompt_use_order !== undefined || meta.v4_neg_use_order !== undefined
        ));
        const expCheckbox = document.getElementById('settingsV45ExperimentalCheckbox');
        if (expCheckbox) {
            expCheckbox.checked = isExp;
            if (window.toggleV45Experimental) {
                window.toggleV45Experimental(isExp);
            }
        }

        const eulerBugEl = document.getElementById('v45EulerBug');
        const eulerBugVal = meta.deliberate_euler_ancestral_bug !== undefined ? meta.deliberate_euler_ancestral_bug : false;
        if (eulerBugEl) {
            eulerBugEl.checked = eulerBugVal;
            eulerBugEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const preferBrownianEl = document.getElementById('v45PreferBrownian');
        const preferBrownianVal = meta.prefer_brownian !== undefined ? meta.prefer_brownian : true;
        if (preferBrownianEl) {
            preferBrownianEl.checked = preferBrownianVal;
            preferBrownianEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const useCoordsEl = document.getElementById('v45UseCoords');
        const useCoordsVal = meta.v4_prompt_use_coords !== undefined ? meta.v4_prompt_use_coords : 
                             (meta.v4_prompt ? meta.v4_prompt.use_coords : false);
        if (useCoordsEl) {
            useCoordsEl.checked = useCoordsVal;
            useCoordsEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const useOrderEl = document.getElementById('v45UseOrder');
        const useOrderVal = meta.v4_prompt_use_order !== undefined ? meta.v4_prompt_use_order : 
                            (meta.v4_prompt ? meta.v4_prompt.use_order : true);
        if (useOrderEl) {
            useOrderEl.checked = useOrderVal;
            useOrderEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const negUseOrderEl = document.getElementById('v45NegUseOrder');
        const negUseOrderVal = meta.v4_neg_use_order !== undefined ? meta.v4_neg_use_order : 
                               (meta.v4_negative_prompt ? meta.v4_negative_prompt.use_order : false);
        if (negUseOrderEl) {
            negUseOrderEl.checked = negUseOrderVal;
            negUseOrderEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 7. 恢复多角色提示词 (Character Prompts)
        const container = document.getElementById('characterPromptsContainer');
        if (container) {
            container.innerHTML = '';
            updateCharacterIndexLabels();
        }
        
        let charList = meta.char_captions;
        if (!charList && meta.v4_prompt && meta.v4_prompt.caption && meta.v4_prompt.caption.char_captions) {
            charList = meta.v4_prompt.caption.char_captions;
        }
        
        if (Array.isArray(charList)) {
            const useCoords = meta.v4_prompt_use_coords !== undefined ? meta.v4_prompt_use_coords : 
                              (meta.v4_prompt ? meta.v4_prompt.use_coords : false);
            
            charList.forEach(char => {
                const promptVal = char.prompt || char.char_caption || '';
                let negVal = char.negative_prompt || '';
                if (!negVal && meta.v4_negative_prompt && meta.v4_negative_prompt.caption && meta.v4_negative_prompt.caption.char_captions) {
                    const idx = charList.indexOf(char);
                    const negChar = meta.v4_negative_prompt.caption.char_captions[idx];
                    if (negChar) {
                        negVal = negChar.char_caption || '';
                    }
                }
                
                let cx = 0.5;
                let cy = 0.5;
                if (typeof char.x === 'number') cx = char.x;
                else if (char.centers && char.centers[0] && typeof char.centers[0].x === 'number') cx = char.centers[0].x;
                
                if (typeof char.y === 'number') cy = char.y;
                else if (char.centers && char.centers[0] && typeof char.centers[0].y === 'number') cy = char.centers[0].y;
                
                const autoPos = !useCoords;
                addCharacterPromptRow(promptVal, negVal, cx, cy, autoPos, true);
            });
        }
        
        // 自动将恢复后的数据落盘到 LocalStorage
        saveCharacterPromptsState();
    }
    
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
        galleryController.loadGallery();
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
    
    appState.currentImageId = item.id;
    appState.currentImageData = { ...item, imageUrl: imgUrl };
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
    addApiKeyInputRow, removeApiKeyInputRow, toggleLowPerf, toggleKeyConcurrent, toggleV45Experimental, randomizeSeed, toggleBypassLimitsEnabled,
    addCharacterPromptRow, removeCharacterPromptRow, selectCharGridCell, toggleCharacterPromptsPanel,
    saveCurrentPromptToNotebook, switchNotebookModel, renderNotebookNotes,
    applyNotebookNote, editNotebookNote, confirmEditNote, cancelEditNote, deleteNotebookNote,
    bindCurrentCanvasToNote, removeNotePreview, viewNotebookNotePreview,
    exportNotebook, triggerImportNotebook, importNotebook,

    // 设置中心方法
    openSettingsModal, closeSettingsModal, switchSettingsTab, openUserModalFromSettings, openAdminPanelFromSettings, updateSettingsUserCard, forceReloadApp, clearImageHistoryCache,
    saveAiHelperSettings, testAiHelperConnection, optimizePromptWithAi,

    // 用户系统方法
    openUserModal, closeUserModal, switchAuthTab, submitAuth, submitRecharge, logoutUser, fetchUserProfile,

    // 管理员后台方法
    openAdminPanel, closeAdminPanel, switchAdminTab, fetchAdminUsers, updateUserStatus, saveAdjustedCredits, deleteUserAccount, generateVipCards, copyGeneratedCards, fetchAdminStats,
    
    // 工具箱及图像加密解密方法
    openToolboxModal, closeToolboxModal, switchToolboxTab, toggleScrambleHistoryList, handleScrambleFileUpload, setScrambleMode, onScrambleAlgorithmChange, toggleScramblePasswordInput, executeScrambleProcess, downloadScrambleResult,
    toggleMetadataHistoryList, handleMetadataFileUpload, applyMetadataParameters,

    // 随机词库方法
    toggleRandomPromptEnabled, toggleRandomCategory, toggleRandomCategoryFold, updateRandomCategoryContent, deleteRandomCategory, addRandomPromptCategory, exportRandomPromptFile, importRandomPromptFile, renderRandomPromptsList
});

// --- 用户系统 (User System) JS Logic ---
function fetchUserProfile() {
    authController.fetchUserProfile();
}
window.fetchUserProfile = fetchUserProfile;

function openUserModal() {
    openSettingsModal('account');
}
window.openUserModal = openUserModal;

function closeUserModal() {
    closeSettingsModal();
}
window.closeUserModal = closeUserModal;

function switchAuthTab(tab) {
    authController.switchAuthTab(tab);
}
window.switchAuthTab = switchAuthTab;

async function submitAuth() {
    await authController.submitAuth();
}
window.submitAuth = submitAuth;

async function submitRecharge() {
    await authController.submitRecharge();
}
window.submitRecharge = submitRecharge;

function logoutUser() {
    authController.logoutUser();
}
window.logoutUser = logoutUser;

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
window.openAdminPanel = openAdminPanel;

function closeAdminPanel() {
    closeSettingsModal();
}
window.closeAdminPanel = closeAdminPanel;

function switchAdminTab(tab) {
    adminController.switchAdminTab(tab);
}
window.switchAdminTab = switchAdminTab;

async function fetchAdminUsers() {
    await adminController.fetchAdminUsers();
}
window.fetchAdminUsers = fetchAdminUsers;

async function updateUserStatus(userId, newStatus) {
    await adminController.updateUserStatus(userId, newStatus);
}
window.updateUserStatus = updateUserStatus;

async function deleteUserAccount(userId, username) {
    await adminController.deleteUserAccount(userId, username);
}
window.deleteUserAccount = deleteUserAccount;

async function saveAdjustedCredits(userId) {
    await adminController.saveAdjustedCredits(userId);
}
window.saveAdjustedCredits = saveAdjustedCredits;

async function generateVipCards() {
    await adminController.generateVipCards();
}
window.generateVipCards = generateVipCards;

function copyGeneratedCards() {
    adminController.copyGeneratedCards();
}
window.copyGeneratedCards = copyGeneratedCards;

async function fetchAdminStats() {
    await adminController.fetchAdminStats();
}
window.fetchAdminStats = fetchAdminStats;


// --- Custom Select Dropdown UI Enhancements ---
function initCustomSelects() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
        return;
    }

    const selects = document.querySelectorAll('select');
    selects.forEach(selectEl => {
        if (selectEl.dataset.customized === 'true') return;
        selectEl.dataset.customized = 'true';

        // Hide original select
        selectEl.style.display = 'none';

        // Create wrapper
        const wrapper = document.createElement('div');
        const originalClasses = selectEl.className || '';
        const hasWFull = originalClasses.includes('w-full');
        
        wrapper.className = `relative custom-select-wrapper ${hasWFull ? 'w-full' : 'inline-block min-w-[120px]'}`;
        selectEl.parentNode.insertBefore(wrapper, selectEl);
        wrapper.appendChild(selectEl); // keep original select hidden inside wrapper for structure

        // Create trigger button
        const button = document.createElement('button');
        button.type = 'button';
        
        // Base tailwind styling for the select button matching our custom style system
        button.className = `w-full flex items-center justify-between outline-none bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 text-gray-700 dark:text-gray-250 cursor-pointer shadow-sm hover:border-gray-200 dark:hover:border-slate-700 transition-all select-none`;

        // Extract spacing, styling, font size classes from original select to match layout
        const classesToCopy = [];
        originalClasses.split(' ').forEach(cls => {
            const c = cls.trim();
            if (!c || c === 'art-input' || c.startsWith('bg-') || c.startsWith('border-') || c.startsWith('w-') || c.startsWith('cursor-')) return;
            if (c.startsWith('py-') || c.startsWith('px-') || c.startsWith('rounded-') || c.startsWith('text-') || c.startsWith('font-') || c.startsWith('shadow-') || c.startsWith('h-')) {
                classesToCopy.push(c);
            }
        });
        if (classesToCopy.length > 0) {
            button.className += ` ${classesToCopy.join(' ')}`;
        } else {
            button.className += ' px-3 py-2 rounded-xl text-xs';
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'truncate';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'flex-shrink-0 ml-1.5 text-gray-400 dark:text-gray-500';
        iconSpan.innerHTML = '<i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200 pointer-events-none"></i>';

        button.appendChild(textSpan);
        button.appendChild(iconSpan);
        wrapper.appendChild(button);

        // Create dropdown options list container
        const listContainer = document.createElement('div');
        listContainer.className = 'hidden absolute z-[9999] w-full mt-1.5 py-1 bg-white/95 dark:bg-slate-900/95 border border-gray-100 dark:border-slate-800/80 rounded-2xl shadow-xl backdrop-blur-md max-h-60 overflow-y-auto transition-all duration-200 opacity-0 scale-95 origin-top';
        wrapper.appendChild(listContainer);

        // Update selected text display
        const updateDisplay = () => {
            const selectedOption = selectEl.options[selectEl.selectedIndex];
            textSpan.textContent = selectedOption ? selectedOption.textContent : '';
            // Highlight active item in list
            const items = listContainer.querySelectorAll('.custom-select-item');
            items.forEach(item => {
                if (item.dataset.value === selectEl.value) {
                    item.className = 'custom-select-item px-3 py-2 text-xs font-semibold bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 cursor-pointer transition-colors';
                } else {
                    item.className = 'custom-select-item px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors';
                }
            });
        };

        // Rebuild options list
        const rebuildOptions = () => {
            listContainer.innerHTML = '';
            Array.from(selectEl.options).forEach(opt => {
                const item = document.createElement('div');
                item.dataset.value = opt.value;
                item.className = 'custom-select-item px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors';
                item.textContent = opt.textContent;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    closeDropdown();
                });
                listContainer.appendChild(item);
            });
            updateDisplay();
        };

        rebuildOptions();

        // Toggle dropdown
        const openDropdown = () => {
            // Close all other custom selects first
            document.querySelectorAll('.custom-select-wrapper').forEach(w => {
                if (w !== wrapper) {
                    const list = w.querySelector('div:not(.hidden)');
                    const btn = w.querySelector('button');
                    if (list) {
                        list.classList.add('opacity-0', 'scale-95');
                        setTimeout(() => list.classList.add('hidden'), 200);
                        const chevron = btn.querySelector('[data-lucide="chevron-down"]');
                        if (chevron) chevron.classList.remove('rotate-180');
                    }
                }
            });

            listContainer.classList.remove('hidden');
            // Force reflow
            listContainer.offsetHeight;
            listContainer.classList.remove('opacity-0', 'scale-95');
            const chevron = button.querySelector('[data-lucide="chevron-down"]');
            if (chevron) chevron.classList.add('rotate-180');
        };

        const closeDropdown = () => {
            listContainer.classList.add('opacity-0', 'scale-95');
            const chevron = button.querySelector('[data-lucide="chevron-down"]');
            if (chevron) chevron.classList.remove('rotate-180');
            setTimeout(() => {
                if (listContainer.classList.contains('opacity-0')) {
                    listContainer.classList.add('hidden');
                }
            }, 200);
        };

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !listContainer.classList.contains('hidden') && !listContainer.classList.contains('opacity-0');
            if (isOpen) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        // Close on click outside
        document.addEventListener('click', () => {
            closeDropdown();
        });

        // Listen to native change event (in case value changes from outside)
        selectEl.addEventListener('change', () => {
            updateDisplay();
        });

        // Intercept .value property setter to update custom display
        if (typeof HTMLSelectElement !== 'undefined') {
            const originalValueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
            if (originalValueProp) {
                Object.defineProperty(selectEl, 'value', {
                    get() {
                        return originalValueProp.get.call(this);
                    },
                    set(val) {
                        originalValueProp.set.call(this, val);
                        updateDisplay();
                    },
                    configurable: true
                });
            }

            // Intercept selectedIndex
            const originalIndexProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
            if (originalIndexProp) {
                Object.defineProperty(selectEl, 'selectedIndex', {
                    get() {
                        return originalIndexProp.get.call(this);
                    },
                    set(idx) {
                        originalIndexProp.set.call(this, idx);
                        updateDisplay();
                    },
                    configurable: true
                });
            }
        }

        // Handle dynamically added/changed options via MutationObserver
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(() => {
                rebuildOptions();
            });
            observer.observe(selectEl, { childList: true, subtree: true });
        }

        // Initialize icons inside trigger button
        if (window.safeCreateIcons) window.safeCreateIcons();
    });
}

// Run custom select initialization
initCustomSelects();


// --- Random Prompt Library UI Helper Functions ---
// --- Random Prompt Library UI Helper Delegation ---
function renderRandomPromptsList() {
    randomPromptController.renderList();
}

function toggleRandomPromptEnabled(checked) {
    randomPromptController.toggleEnabled(checked);
}

function toggleRandomCategory(name, checked) {
    randomPromptController.toggleCategory(name, checked);
}

function toggleRandomCategoryFold(name, event) {
    randomPromptController.toggleFold(name, event);
}

function updateRandomCategoryContent(name, content) {
    randomPromptController.updateCategoryContent(name, content);
}

async function deleteRandomCategory(name) {
    await randomPromptController.deleteCategory(name);
}

function addRandomPromptCategory() {
    randomPromptController.addCategory();
}

function exportRandomPromptFile() {
    randomPromptController.exportFile();
}

function importRandomPromptFile(event) {
    randomPromptController.importFile(event);
}




