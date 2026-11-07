import { ImageEngine } from './engine.js';
import { GalleryStore, createThumbnail } from './storage.js';
import { UIController } from './ui.js';
import { InpaintEditor } from './inpaint.js';
import { OutpaintEditor } from './outpaint.js';
import { PromptHelper } from './prompt-helper.js';
import { NotebookManager } from './notebook.js';
import { VibeManager } from './vibe-manager.js';
import { CharRefManager } from './char-ref-manager.js';
import { AiHelperService, AI_PROVIDER_PRESETS, AI_SYSTEM_PROMPTS } from './ai-helper-service.js';
import { AiChatManager } from './ai-chat-manager.js';
import { appState } from './app-state.js';
import { GalleryController } from './gallery.js';
import { initToolbox, openToolboxModal, closeToolboxModal, switchToolboxTab, toggleScrambleHistoryList, handleScrambleFileUpload, setScrambleMode, onScrambleAlgorithmChange, toggleScramblePasswordInput, executeScrambleProcess, downloadScrambleResult, toggleMetadataHistoryList, handleMetadataFileUpload, applyMetadataParameters } from './toolbox-controller.js';
import { SettingsManager } from './settings-manager.js';
import { CharPromptManager } from './char-prompt-manager.js';
import { AuthController } from './auth-controller.js';
import { AdminController } from './admin-controller.js';
import { openModal, closeModal, showToast, showAlert, showConfirm, initModalToastGlobals } from './modal-toast.js';
import { createPostProcessController } from './post-process-controller.js';
import { createLightboxController, resolveLightboxMeta, normalizeModelVersion } from './lightbox-controller.js';
import { initUxEnhancements } from './ux-enhancements.js';
import { RandomPromptManager } from './random-prompt-manager.js';
import { RandomPromptController } from './random-prompt-controller.js';
import { InspirationManager } from './inspiration-manager.js';
import { MotionController } from './motion-controller.js';

import { getMimeFromFilename, dataUrlToBlob, triggerDownload } from './download-helper.js';
import { extractMetadata } from './png-metadata.js';

const motionController = new MotionController();
if (typeof window !== 'undefined') {
    window.MotionController = MotionController;
    window.motionController = motionController;
}
// Start single-run entrance animation lifecycle
motionController.startEntrance();

export { getMimeFromFilename, dataUrlToBlob, triggerDownload, doGenerate, doAugment, motionController, MotionController };

// PromptHelper is now imported from './prompt-helper.js'
const engine = new ImageEngine();
const store = new GalleryStore();
window.triggerDownload = triggerDownload;
initToolbox(store);
const ui = new UIController();
if (typeof window !== 'undefined') {
    window.ui = ui;
}
const els = ui.els;
const aiHelper = new AiHelperService(store);
const aiChatManager = new AiChatManager({
    service: aiHelper,
    onApplyPrompt: (text, mode) => {
        if (mode === 'append') {
            const existing = els.prompt.value.trim();
            els.prompt.value = existing ? `${existing}, ${text}` : text;
        } else {
            els.prompt.value = text;
        }
        els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
    },
    onAddCharacter: (charData) => {
        const charWrapper = document.getElementById('characterPromptsWrapper');
        if (charWrapper) charWrapper.classList.remove('hidden');
        if (window.charPromptManager) {
            window.charPromptManager.addCharacterPromptRow(
                charData.prompt,
                charData.negative || '',
                charData.x,
                charData.y,
                charData.autoPos,
                true
            );
            window.charPromptManager.saveCharacterPromptsState();
        } else if (typeof window.addCharacterPromptRow === 'function') {
            window.addCharacterPromptRow(
                charData.prompt,
                charData.negative || '',
                charData.x,
                charData.y,
                charData.autoPos,
                true
            );
        }
    },
    onSetModel: (ver) => {
        window.setModel(ver);
    },
    onSetParameters: (params) => {
        if (params.resValue) {
            const resEl = document.getElementById('resolution');
            if (resEl) {
                resEl.value = params.resValue;
                resEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        if (params.steps !== undefined) {
            const stepsEl = document.getElementById('steps');
            const stepsValEl = document.getElementById('stepsValue');
            if (stepsEl) {
                stepsEl.value = params.steps;
                stepsEl.dispatchEvent(new Event('input', { bubbles: true }));
                stepsEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (stepsValEl) stepsValEl.textContent = params.steps;
        }
        if (params.scale !== undefined) {
            const scaleEl = document.getElementById('scale');
            const scaleValEl = document.getElementById('scaleValue');
            if (scaleEl) {
                scaleEl.value = params.scale;
                scaleEl.dispatchEvent(new Event('input', { bubbles: true }));
                scaleEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (scaleValEl) scaleValEl.textContent = params.scale.toFixed(1);
        }
        if (params.seed !== undefined) {
            const seedEl = document.getElementById('seed');
            if (seedEl) {
                seedEl.value = params.seed === '' ? '' : params.seed;
                seedEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        if (params.sampler) {
            const samplerEl = document.getElementById('sampler');
            if (samplerEl) {
                samplerEl.value = params.sampler;
                samplerEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    },
    onRemoveCharacter: ({ index }) => {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return { success: false, error: '未找到角色容器' };
        const rows = Array.from(container.querySelectorAll('.character-prompt-row'));
        if (rows.length === 0) return { success: false, error: '当前画板暂无角色' };
        if (String(index).toLowerCase() === 'all') {
            rows.forEach(r => r.remove());
            if (window.charPromptManager) {
                window.charPromptManager.updateCharacterIndexLabels();
                window.charPromptManager.saveCharacterPromptsState();
            }
            return { success: true, count: rows.length };
        }
        const idx = parseInt(index, 10);
        const targetIdx = (idx >= 1 && idx <= rows.length) ? idx - 1 : idx;
        if (targetIdx < 0 || targetIdx >= rows.length) {
            return { success: false, error: `角色序号 #${index} 超出范围 (当前共有 ${rows.length} 个角色)` };
        }
        rows[targetIdx].remove();
        if (window.charPromptManager) {
            window.charPromptManager.updateCharacterIndexLabels();
            window.charPromptManager.saveCharacterPromptsState();
        }
        return { success: true, removedIndex: targetIdx + 1 };
    },
    onGenerateImage: async (overrideParams = {}) => {
        return await doGenerate({ skipSaveHistory: true, ...overrideParams });
    },
    getCanvasState: () => {
        const model = (typeof document !== 'undefined' ? document.getElementById('modelValue')?.value : '') || store.getSetting('nai_model_version', 'v5');
        const prompt = els.prompt ? els.prompt.value.trim() : '';
        const negative = els.negative ? els.negative.value.trim() : '';
        const resVal = (typeof document !== 'undefined' ? document.getElementById('resolution')?.value : '') || '832,1216';
        const [w, h] = resVal.split(',').map(Number);
        const steps = parseInt(typeof document !== 'undefined' ? document.getElementById('steps')?.value : '28', 10) || 28;
        const scale = parseFloat(typeof document !== 'undefined' ? document.getElementById('scale')?.value : '5.0') || 5.0;
        const sampler = (typeof document !== 'undefined' ? document.getElementById('sampler')?.value : '') || 'k_euler';
        const seed = (typeof document !== 'undefined' ? document.getElementById('seed')?.value : '') || '';
        const captions = (window.charPromptManager && typeof window.charPromptManager.getCharacterCaptions === 'function')
            ? window.charPromptManager.getCharacterCaptions().charCaptions
            : [];
        return {
            model,
            prompt,
            negative,
            width: w,
            height: h,
            steps,
            scale,
            sampler,
            seed,
            characters: captions
        };
    },
    onShowToast: window.showToast
});
window.aiChatManager = aiChatManager;
window.openAiChatModal = () => aiChatManager.open();
window.closeAiChatModal = () => aiChatManager.close();

// Global Image Helpers for Agent inline cards & Lightbox saving
window.saveImageItemToGallery = async (item) => {
    if (!item) return null;
    let base64 = item.imageUrl || item.image;
    if (!base64) return null;

    if (!base64.startsWith('data:')) {
        const resp = await fetch(base64);
        const blob = await resp.blob();
        base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    const model = item.model || (typeof document !== 'undefined' ? document.getElementById('modelValue')?.value : '') || 'v5';
    const prompt = item.prompt || '';
    const meta = item.meta || {
        width: item.width,
        height: item.height,
        steps: item.steps,
        scale: item.scale,
        sampler: item.sampler,
        seed: item.seed,
        negative_prompt: item.negative_prompt || '',
        characterPrompts: item.characterPrompts || item.char_captions || null
    };

    const savedItem = await saveToHistory(base64, prompt, model, null, false, meta);
    item.isSavedToHistory = true;
    if (savedItem?.id) item.id = savedItem.id;
    if (window.showToast) window.showToast("已成功保存至历史画廊！", "success");
    return savedItem;
};

window.applyImageAsCanvasInit = async (imageUrl) => {
    try {
        if (!imageUrl) return;
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            appState.currentInitImageBase64 = dataUrl.split(',')[1] || dataUrl;
            const previewEl = document.getElementById('initImagePreview');
            const placeholderEl = document.getElementById('initImagePlaceholder');
            const clearBtn = document.getElementById('clearInitImageBtn');
            const controls = document.getElementById('img2imgControls');
            if (previewEl) {
                previewEl.src = dataUrl;
                previewEl.classList.remove('hidden');
            }
            if (placeholderEl) placeholderEl.classList.add('hidden');
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (controls) controls.classList.remove('hidden');

            const panel = document.getElementById('img2imgSettingsPanel');
            const chevron = document.getElementById('img2imgChevron');
            if (panel && panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                if (chevron) chevron.classList.add('rotate-180');
            }
            if (window.showToast) window.showToast("已将生成图片设为画板底图", "success");
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        if (window.showToast) window.showToast(`设为底图失败: ${err.message}`, "error");
    }
};

window.downloadImageUrl = (imageUrl, filename = 'nai_agent_output.png') => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

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

window.vibeManager = vibeManager;
window.charRefManager = charRefManager;
initToolbox(store, { charRefManager, vibeManager });

const galleryController = new GalleryController({ store, ui, appState });
if (typeof window !== 'undefined') {
    window.galleryController = galleryController;
    window.loadGallery = () => galleryController.loadGallery();
}

function loadVibeState(model) {
    vibeManager.loadState(model);
    charRefManager.loadState(model);
    charRefManager.initEventListeners(model);
}

function collectAdvancedAndModelParams(selectedVersion) {
    const extraParams = {};

    if (selectedVersion === 'v4.5' || selectedVersion === 'v5') {
        const isExp = store.getSetting('v4_5_experimental', 'false') === 'true';
        if (selectedVersion === 'v4.5') {
            extraParams.v4_5_experimental = isExp;
        }

        // 使用 CharPromptManager 集中提取多角色提示词 (Character Prompts)
        const { charCaptions, hasCustomCoords } = charPromptManager.getCharacterCaptions();
        if (charCaptions.length > 0) extraParams.char_captions = charCaptions;

        if (selectedVersion === 'v4.5' && isExp) {
            const eulerBugEl = document.getElementById('v45EulerBug');
            const preferBrownianEl = document.getElementById('v45PreferBrownian');
            const useCoordsEl = document.getElementById('v45UseCoords');
            const useOrderEl = document.getElementById('v45UseOrder');
            const negUseOrderEl = document.getElementById('v45NegUseOrder');

            if (eulerBugEl) extraParams.deliberate_euler_ancestral_bug = eulerBugEl.checked;
            if (preferBrownianEl) extraParams.prefer_brownian = preferBrownianEl.checked;
            if (useCoordsEl) extraParams.v4_prompt_use_coords = useCoordsEl.checked;
            if (useOrderEl) extraParams.v4_prompt_use_order = useOrderEl.checked;
            if (negUseOrderEl) extraParams.v4_neg_use_order = negUseOrderEl.checked;
        }
        if (hasCustomCoords) extraParams.v4_prompt_use_coords = true;

        if (selectedVersion === 'v4.5') {
            const skipCfgEl = document.getElementById('skipCfg');
            if (skipCfgEl) {
                extraParams.skip_cfg_above_sigma = isExp && skipCfgEl.value ? parseInt(skipCfgEl.value) : null;
            }
        } else if (selectedVersion === 'v5') {
            const v5UcEl = document.getElementById('v5UcPreset');
            const v5QualityEl = document.getElementById('v5QualityPreset');
            const v5EffortEl = document.getElementById('v5Effort');
            const effort = v5EffortEl?.value || 'high';
            extraParams.effort = effort;
            extraParams.ucPresetId = effort === 'medium' ? 'heavy' : (v5UcEl?.value || 'heavy');
            extraParams.qualityPresetId = v5QualityEl?.value || 'standard';
            extraParams.straight_alpha = true;
            if (effort === 'medium') {
                extraParams.steps = 14;
                extraParams.sampler = 'k_euler_ancestral';
            }
        }
    }

    if (selectedVersion !== 'v5') {
        const vibeParams = vibeManager.getPayloadParams(selectedVersion);
        Object.assign(extraParams, vibeParams);
        const charRefParams = charRefManager.getPayloadParams(selectedVersion);
        Object.assign(extraParams, charRefParams);
    }

    const smEl = document.getElementById('smEnabled');
    const smDynEl = document.getElementById('smDynEnabled');
    const cfgRescaleEl = document.getElementById('cfgRescale');
    const uncondScaleEl = document.getElementById('uncondScale');
    const decrispEl = document.getElementById('dynThresholdEnabled') || document.getElementById('decrisp');
    const noiseScheduleEl = document.getElementById('noise_schedule') || document.getElementById('noiseSchedule');
    const qualityToggleEl = document.getElementById('qualityToggleEnabled') || document.getElementById('qualityToggle');

    extraParams.sm = (selectedVersion === 'v4.5' || selectedVersion === 'v5') ? false : (smEl ? smEl.checked : true);
    extraParams.sm_dyn = (selectedVersion === 'v4.5' || selectedVersion === 'v5') ? false : (smDynEl ? smDynEl.checked : true);
    extraParams.cfg_rescale = (selectedVersion === 'v5' && extraParams.effort === 'medium') 
        ? 0.0 
        : (cfgRescaleEl ? parseFloat(cfgRescaleEl.value) : 0.0);
    extraParams.uncond_scale = uncondScaleEl ? parseFloat(uncondScaleEl.value) : 1.0;
    if (decrispEl) extraParams.dynamic_thresholding = decrispEl.checked;
    if (noiseScheduleEl && noiseScheduleEl.value) {
        extraParams.noise_schedule = noiseScheduleEl.value;
    } else if (selectedVersion === 'v5') {
        extraParams.noise_schedule = 'karras';
    }
    if (qualityToggleEl) extraParams.qualityToggle = qualityToggleEl.checked;

    return extraParams;
}

const settingsManager = new SettingsManager();
const charPromptManager = new CharPromptManager();
const authController = new AuthController();
const adminController = new AdminController();
const randomPromptManager = new RandomPromptManager();
const randomPromptController = new RandomPromptController();

charPromptManager.bind(store);
window.charPromptManager = charPromptManager;
authController.bind(ui, store);
adminController.bind(ui, store, authController);

settingsManager.bind(ui, store, {
    onModelChange: (model) => {
        loadVibeState(model);
        charPromptManager.onModelChange(model);
    },
    onHydrate: () => {
        const currentModel = store.getSetting('nai_model_version', 'v3');
        charPromptManager.loadState(currentModel);
        charPromptManager.updatePadAspectRatio();
    }
});

// 监听画幅分辨率切换，动态联动侧边栏选点画板比例
const resElement = document.getElementById('resolution');
if (resElement) {
    resElement.addEventListener('change', () => {
        charPromptManager.updatePadAspectRatio();
    });
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

// Theme and settings initialization are handled by SettingsManager and UIController
ui.initTheme();

window.togglePanel = function(panelId, chevronId) {
    const panel = document.getElementById(panelId);
    const chevron = document.getElementById(chevronId);
    if (panel) {
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            if (!document.documentElement.classList.contains('low-perf')) {
                panel.classList.remove('panel-expand-anim');
                try { void panel.offsetWidth; } catch (_) {}
                panel.classList.add('panel-expand-anim');
            }
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
            panel.classList.add('hidden');
            panel.classList.remove('panel-expand-anim');
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
    if (typeof ui !== 'undefined' && ui && ui.setLoading) ui.setLoading(false);
    else if (window.ui && window.ui.setLoading) window.ui.setLoading(false);
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled rejection (promise):', event.reason);
    if (typeof ui !== 'undefined' && ui && ui.setLoading) ui.setLoading(false);
    else if (window.ui && window.ui.setLoading) window.ui.setLoading(false);
};

async function doGenerateZImage(rawOptions = {}) {
    const isEvent = (typeof Event !== 'undefined' && rawOptions instanceof Event) || (rawOptions && typeof rawOptions.preventDefault === 'function') || (rawOptions && rawOptions.target);
    const options = isEvent || typeof rawOptions !== 'object' || rawOptions === null ? {} : rawOptions;

    try {
        const promptText = (typeof options.prompt === 'string' ? options.prompt : (els.prompt ? els.prompt.value.trim() : '')).trim();
        if (!promptText) { 
            if (els.prompt) els.prompt.focus(); 
            if (ui.toggleMobileControls) ui.toggleMobileControls(true); 
            return { success: false, error: "提示词不能为空" }; 
        }

        let w, h;
        if (typeof options.width === 'number' && options.width >= 64 && typeof options.height === 'number' && options.height >= 64) {
            w = options.width;
            h = options.height;
        } else {
            const resEl = document.getElementById('resolution');
            if (!resEl) throw new Error("找不到分辨率选择器");
            [w, h] = resEl.value.split(',').map(Number);
        }

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
        if (options.seed !== undefined && options.seed !== null && options.seed !== "") {
            finalSeed = parseInt(options.seed, 10) % 2147483648;
        } else if (userSeedVal && !isNaN(userSeedVal)) {
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

        // 转 Base64 存历史 (仅当未指定 skipSaveHistory 时)
        if (!options.skipSaveHistory && result.blob) {
            const reader = new FileReader();
            reader.readAsDataURL(result.blob);
            reader.onloadend = async () => {
                await saveToHistory(reader.result, promptText, 'zimage', result, false, metaData);
            };
        }

        // 展示图片
        ui.showResultImages([result], (selected) => {
            appState.currentImageData = selected;
            if (selected.id) appState.currentImageId = selected.id;
            window.lastSelectedImageUrl = selected.imageUrl;
        });

        return {
            success: true,
            imageUrl: result.imageUrl,
            seed: params.seed,
            prompt: promptText,
            negative_prompt: '',
            width: params.width,
            height: params.height,
            model: 'zimage',
            meta: metaData,
            isSavedToHistory: !options.skipSaveHistory,
            results: [result]
        };

    } catch (err) {
        console.error("ZImage Generate Error:", err);
        alert(err.message || err);
        return { success: false, error: err.message || String(err) };
    } finally {
        ui.setLoading(false);
        ui.toggleMobileControls(true);
    }
}

async function doGenerate(rawOptions = {}) {
    const isEvent = (typeof Event !== 'undefined' && rawOptions instanceof Event) || (rawOptions && typeof rawOptions.preventDefault === 'function') || (rawOptions && rawOptions.target);
    const options = isEvent || typeof rawOptions !== 'object' || rawOptions === null ? {} : rawOptions;

    if (appState.isGenerating) {
        appState.cancelRequested = true;
        if (appState.abortController) {
            try { appState.abortController.abort(); } catch (_) {}
        }
        const deskText = document.getElementById('deskBtnText');
        if (deskText) deskText.textContent = "正在停止...";
        if (window.showToast) window.showToast("已发送停止指令，正在中断生成...", "info");
        return { success: false, error: "已有生成任务正在进行中，已发送停止指令" };
    }

    // Persistent Main-Canvas Inpaint: as long as Brush UI is open, Generate / Ctrl+Enter executes local inpaint!
    if (inpaintEditor && inpaintEditor.isActive()) {
        await inpaintEditor.doInpaint();
        return { success: false, error: "正在进行局部重绘" };
    }

    // Check if outpaint is active
    const outpaintArea = document.getElementById('outpaintArea');
    if (outpaintArea && !outpaintArea.classList.contains('hidden')) {
        if (window.outpaintEditor) {
            window.outpaintEditor.generate();
        }
        return { success: false, error: "正在进行画布扩图" };
    }

    if (inpaintEditor && typeof inpaintEditor.showQuickRetryBar === 'function') {
        inpaintEditor.showQuickRetryBar(false);
    }

    const selectedVersion = (typeof options.model === 'string' && options.model)
        ? options.model
        : (document.getElementById('modelValue') ? document.getElementById('modelValue').value : 'v5');
    if (selectedVersion === 'zimage') {
        return doGenerateZImage(options);
    }

    appState.isGenerating = true;
    appState.cancelRequested = false;
    appState.abortController = new AbortController();

    try {
        const promptText = (typeof options.prompt === 'string' ? options.prompt : (els.prompt ? els.prompt.value.trim() : '')).trim();
        if (!promptText) {
            if (els.prompt) els.prompt.focus();
            if (ui.toggleMobileControls) ui.toggleMobileControls(true);
            return { success: false, error: "提示词不能为空" };
        }

        let w, h;
        if (typeof options.width === 'number' && options.width >= 64 && typeof options.height === 'number' && options.height >= 64) {
            w = options.width;
            h = options.height;
        } else {
            const resEl = document.getElementById('resolution');
            if (!resEl) throw new Error("找不到分辨率选择器");
            [w, h] = resEl.value.split(',').map(Number);
        }
        
        // 获取所有自定义 Key
        const customApiKeyRaw = store.getSetting('nai_custom_api_key');
        const customApiKeys = (customApiKeyRaw || "")
            .split(/[\n,]/)
            .map(k => k.trim())
            .filter(k => k);

        const authBase = {
            adminToken: store.getSetting('nai_admin_token'),
            userKey: store.getSetting('nai_user_key'),
            userToken: localStorage.getItem('nai_user_token') || "",
            signal: appState.abortController?.signal
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

        const allGeneratedResults = [];

        for (let i = 0; i < batchTotal; i++) {
            if (appState.cancelRequested) {
                console.log("用户取消了连续/批量生成");
                break;
            }

            const statusText = batchTotal > 1 ? `停止生成 (${i + 1}/${batchTotal})` : "停止生成...";
            ui.setLoading(true, statusText);

            const isConcurrent = store.getSetting('nai_custom_key_concurrent') === 'true';

            try {
                const extraParams = collectAdvancedAndModelParams(selectedVersion);
                const negativePrompt = typeof options.negative === 'string'
                    ? options.negative 
                    : (els.negative ? els.negative.value.trim() : '');
                let stepsVal = (typeof options.steps === 'number' && !isNaN(options.steps))
                    ? Math.min(options.steps, 28) 
                    : parseInt(els.steps ? els.steps.value : '28', 10);
                const scaleVal = (typeof options.scale === 'number' && !isNaN(options.scale))
                    ? options.scale 
                    : parseFloat(els.scale ? els.scale.value : '5.0');
                let samplerVal = (typeof options.sampler === 'string' && options.sampler)
                    ? options.sampler 
                    : (els.sampler ? els.sampler.value : 'k_euler');

                const params = {
                    version: selectedVersion,
                    prompt: promptText,
                    negative_prompt: negativePrompt,
                    width: w, height: h,
                    steps: stepsVal,
                    scale: scaleVal,
                    sampler: samplerVal,
                    ...extraParams
                };

                if (appState.currentInitImageBase64) {
                    const strEl = document.getElementById('strength');
                    const noiEl = document.getElementById('noise');
                    params.image = appState.currentInitImageBase64;
                    params.strength = strEl ? parseFloat(strEl.value) : 0.5;
                    params.noise = noiEl ? parseFloat(noiEl.value) : 0;
                }

                // 读取用户指定的 Seed
                const seedEl = document.getElementById('seed');
                const userSeedVal = seedEl ? seedEl.value.trim() : "";

                const buildLocalParams = (seedOffset) => {
                    let finalSeed;
                    if (options.seed !== undefined && options.seed !== null && options.seed !== "") {
                        finalSeed = (parseInt(options.seed, 10) + i + seedOffset) % 4294967296;
                    } else if (userSeedVal && !isNaN(userSeedVal)) {
                        finalSeed = (parseInt(userSeedVal) + i + seedOffset) % 4294967296;
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
                };

                const successfulResults = [];

                if (isConcurrent && customApiKeys.length > 0) {
                    const auths = customApiKeys.map(key => ({ ...authBase, customApiKey: key }));
                    const localParamsList = auths.map((_, idx) => buildLocalParams(idx));
                    const fetchPromises = auths.map((auth, idx) => engine.generate(localParamsList[idx], auth));
                    const results = await Promise.allSettled(fetchPromises);

                    results.forEach((res, idx) => {
                        if (res.status === 'fulfilled') {
                            const result = res.value;
                            const localParams = localParamsList[idx];
                            if (result.userRole) {
                                ui.updateCreditDisplay(result.userRole);
                            }
                            result._localParams = localParams;
                            successfulResults.push(result);
                        } else {
                            console.error("Concurrent Gen Error:", res.reason);
                        }
                    });

                    if (successfulResults.length === 0) {
                        const firstError = results.find(r => r.status === 'rejected')?.reason || new Error("所有 API 请求均失败");
                        throw firstError;
                    }
                } else {
                    const candidateKeys = customApiKeys.length > 0
                        ? customApiKeys.slice(i % customApiKeys.length).concat(customApiKeys.slice(0, i % customApiKeys.length))
                        : [""];
                    const authsToTry = candidateKeys.map(key => ({ ...authBase, customApiKey: key }));
                    const localParams = buildLocalParams(0);

                    let result = null;
                    let lastError = null;
                    for (const auth of authsToTry) {
                        try {
                            result = await engine.generate(localParams, auth);
                            break;
                        } catch (err) {
                            console.warn("API Key 请求失败，尝试下一个候选 Key...", err);
                            lastError = err;
                        }
                    }

                    if (!result) {
                        throw lastError || new Error("所有配置的 API Key 均请求失败");
                    }

                    if (result.userRole) {
                        ui.updateCreditDisplay(result.userRole);
                    }
                    result._localParams = localParams;
                    successfulResults.push(result);
                }

                // 组装元数据并保存历史
                for (const result of successfulResults) {
                    const localParams = result._localParams || buildLocalParams(0);
                    delete result._localParams;

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

                        // Char Ref 元数据
                        director_reference_images: localParams.director_reference_images || null,
                        director_reference_descriptions: localParams.director_reference_descriptions || null,
                        director_reference_strength_values: localParams.director_reference_strength_values || null,
                        director_reference_secondary_strength_values: localParams.director_reference_secondary_strength_values || null,
                        director_reference_information_extracted: localParams.director_reference_information_extracted || null,

                        // Vibe Transfer 元数据
                        vibe_image: localParams.vibe_image || null,
                        vibe_info: localParams.vibe_info !== undefined ? localParams.vibe_info : null,
                        vibe_strength: localParams.vibe_strength !== undefined ? localParams.vibe_strength : null,
                        reference_image_multiple: localParams.reference_image_multiple || null,
                        reference_information_extracted_multiple: localParams.reference_information_extracted_multiple || null,
                        reference_strength_multiple: localParams.reference_strength_multiple || null,

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
                        effort: localParams.effort || null,
                        ucPresetId: localParams.ucPresetId || null,
                        qualityPresetId: localParams.qualityPresetId || null,
                        char_captions: localParams.char_captions || null,
                        random_prompt_selections: localParams.randomSelections || null
                    };

                    if (!options.skipSaveHistory && result.blob) {
                        const reader = new FileReader();
                        reader.readAsDataURL(result.blob);
                        reader.onloadend = async () => {
                            await saveToHistory(reader.result, localParams.prompt, selectedVersion, result, false, metaData);
                        };
                    }
                }

                // 批量展示！
                ui.showResultImages(successfulResults, (selected) => {
                    appState.currentImageData = selected;
                    if (selected.id) appState.currentImageId = selected.id;
                    window.lastSelectedImageUrl = selected.imageUrl;
                });

                allGeneratedResults.push(...successfulResults);

                if (appState.cancelRequested) {
                    console.log("收到停止请求，终止后续循环");
                    break;
                }

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

        if (allGeneratedResults.length > 0) {
            const first = allGeneratedResults[0];
            const negativePrompt = options.negative !== undefined 
                ? options.negative 
                : (els.negative ? els.negative.value.trim() : '');
            const stepsVal = options.steps !== undefined 
                ? Math.min(options.steps, 28) 
                : parseInt(els.steps ? els.steps.value : '28', 10);
            const scaleVal = options.scale !== undefined 
                ? options.scale 
                : parseFloat(els.scale ? els.scale.value : '5.0');
            const samplerVal = options.sampler !== undefined 
                ? options.sampler 
                : (els.sampler ? els.sampler.value : 'k_euler');
            return {
                success: true,
                imageUrl: first.imageUrl,
                seed: first.seed,
                prompt: promptText,
                negative_prompt: negativePrompt,
                width: w,
                height: h,
                steps: stepsVal,
                scale: scaleVal,
                sampler: samplerVal,
                model: selectedVersion,
                meta: {
                    width: w,
                    height: h,
                    steps: stepsVal,
                    scale: scaleVal,
                    sampler: samplerVal,
                    seed: first.seed,
                    negative_prompt: negativePrompt
                },
                isSavedToHistory: !options.skipSaveHistory,
                results: allGeneratedResults
            };
        }
        return { success: false, error: "未生成任何有效图像" };
    } catch (globalErr) {
        if (globalErr.name === 'AbortError' || appState.cancelRequested) {
            console.log("Generation aborted by user");
            return { success: false, error: "已取消生成" };
        }
        console.error("Global doGenerate Error:", globalErr);
        alert("发生意外错误: " + globalErr.message);
        return { success: false, error: globalErr.message };
    } finally {
        appState.isGenerating = false;
        appState.cancelRequested = false;
        appState.abortController = null;
        ui.setLoading(false);
    }
}

els.deskBtn.addEventListener('click', () => doGenerate());
els.floatBtn.addEventListener('click', () => doGenerate());

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
        const thumb = await createThumbnail(imgData, 256, 0.8);
        const savedItem = await store.saveImage(imgData, prompt, model, meta, thumb);
        if (resultObj) {
            resultObj.id = savedItem.id;
        }
        
        // If it's a legacy call (no resultObj) or we force focus, OR if the newly saved result is what the user is currently viewing
        if (forceFocus || (!resultObj && !forceFocus) || (resultObj && appState.currentImageData === resultObj)) {
            appState.currentImageId = savedItem.id;
            appState.currentImageData = savedItem;
            ui.showImageActions(true);
        }
        
        galleryController.prependImage(savedItem);
        if (window.refreshAnlasDisplay) {
            window.refreshAnlasDisplay();
        }
        return savedItem;
    } catch (e) {
        console.error("Failed to save to history", e);
    }
}

async function deleteCurrentImage() {
    if (appState.currentImageData && appState.currentImageData.isShowcase) return;
    if (!appState.currentImageId || !(await window.showConfirm("您确定要从历史记录中删除这张图片吗？", "删除图片", "trash-2"))) return;
    try {
        const idToDelete = appState.currentImageId;
        await store.deleteImage(idToDelete);
        ui.resetPreview();
        galleryController.removeImage(idToDelete);
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
    const btn = document.getElementById('toolboxTriggerBtn');
    if (!menu) return;
    if (menu.classList.contains('opacity-0')) {
        menu.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        menu.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
        if (btn) btn.classList.add('toolbox-open');
    } else {
        menu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
        menu.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
        if (btn) btn.classList.remove('toolbox-open');
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

const postProcess = createPostProcessController({
    ui,
    els,
    engine,
    store,
    appState,
    collectAdvancedAndModelParams,
    saveToHistory
});
const {
    getActiveCanvasImage,
    doAugment,
    openEnhanceModal,
    closeEnhanceModal,
    setEnhancePreset,
    initEnhanceSliders,
    doEnhance,
    doUpscale
} = postProcess;
initEnhanceSliders();

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
const renderRandomPromptCallback = () => renderRandomPromptsList();

Object.assign(window, {
    toggleMobileControls: (s) => ui.toggleMobileControls(s),
    setModel: (v) => {
        ui.setModel(v);
        store.setSetting('nai_model_version', v);
        loadVibeState(v);
    },
    switchRightView: (v) => ui.switchRightView(v, (tab) => galleryController.switchGalleryTab(tab)),
    toggleDrawer: () => ui.toggleDrawer(),
    switchDrawerTab: (t) => ui.switchDrawerTab(t, t === 'random' ? renderRandomPromptCallback : renderNotebookCallback),
    openNotebook: () => ui.openNotebook(renderNotebookCallback),
    openRandomPrompt: () => ui.openRandomPrompt(renderRandomPromptCallback),
    handleInitImage, clearInitImage, doGenerate, saveToHistory,
    useCurrentPrompt: () => galleryController.useCurrentPrompt(),
    deleteCurrentImage, clearAllHistory,
    switchGalleryTab: (tab) => galleryController.switchGalleryTab(tab),
    downloadZip: () => galleryController.downloadZip(),
    backToGrid: () => ui.showGrid(),
    doAugment, toggleToolbox
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

// 初始化灵感激发器
const inspirationManager = new InspirationManager({
    engine: engine,
    promptHelper: promptHelper,
    store: store,
    onShowToast: (msg, type) => window.showToast ? window.showToast(msg, type) : console.log(msg)
});

function toggleTheme() {
    ui.toggleTheme();
}

// --- Low Performance Mode (低性能模式) Logic ---
function updateLowPerfUI(enabled) {
    if (typeof ui !== 'undefined' && ui.updateLowPerfUI) {
        ui.updateLowPerfUI(enabled);
    }
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

function onSettingsAiHelperProviderChange() {
    const key = document.getElementById('settingsAiHelperProviderSelect')?.value;
    if (key && AI_PROVIDER_PRESETS[key] && key !== 'custom') {
        const preset = AI_PROVIDER_PRESETS[key];
        const baseEl = document.getElementById('aiHelperBaseUrl');
        const modelEl = document.getElementById('aiHelperModel');
        if (baseEl) baseEl.value = preset.baseUrl;
        if (modelEl) modelEl.value = preset.model;
    }
}
window.onSettingsAiHelperProviderChange = onSettingsAiHelperProviderChange;

function onSettingsAiHelperPresetChange() {
    const key = document.getElementById('settingsAiHelperPresetSelect')?.value;
    if (key && AI_SYSTEM_PROMPTS[key]) {
        const sysEl = document.getElementById('aiHelperSystemPrompt');
        if (sysEl) sysEl.value = AI_SYSTEM_PROMPTS[key].prompt;
    }
}
window.onSettingsAiHelperPresetChange = onSettingsAiHelperPresetChange;

function saveAiHelperSettings() {
    const baseUrl = document.getElementById('aiHelperBaseUrl')?.value.trim() || "";
    const apiKey = document.getElementById('aiHelperApiKey')?.value.trim() || "";
    const model = document.getElementById('aiHelperModel')?.value.trim() || "";
    const systemPrompt = document.getElementById('aiHelperSystemPrompt')?.value.trim() || "";

    store.setSetting('ai_helper_base_url', baseUrl);
    store.setSetting('ai_helper_api_key', apiKey);
    store.setSetting('ai_helper_model', model);
    store.setSetting('ai_helper_system_prompt', systemPrompt);

    // Sync to aiChatManager inline inputs
    const inlineBase = document.getElementById('aiChatBaseUrl');
    const inlineKey = document.getElementById('aiChatApiKey');
    const inlineModel = document.getElementById('aiChatModel');
    const inlineSys = document.getElementById('aiChatSystemPrompt');
    const badge = document.getElementById('aiChatModelBadge');

    if (inlineBase) inlineBase.value = baseUrl;
    if (inlineKey) inlineKey.value = apiKey;
    if (inlineModel) inlineModel.value = model;
    if (inlineSys) inlineSys.value = systemPrompt;
    if (badge) badge.textContent = model || '未配置模型';

    window.showToast("AI 对话助手配置已保存", "success");
}
window.saveAiHelperSettings = saveAiHelperSettings;

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
window.testAiHelperConnection = testAiHelperConnection;

async function optimizePromptWithAi() {
    // Open the full AI Chat modal and trigger prompt optimization
    aiChatManager.open();
    const promptInput = document.getElementById('prompt');
    const userIdea = promptInput ? promptInput.value.trim() : '';
    if (userIdea) {
        aiChatManager.handleQuickPrompt('optimize');
    }
}
window.optimizePromptWithAi = optimizePromptWithAi;

function toggleV45Experimental(forceState, silent = false) {
    const checkbox = document.getElementById('settingsV45ExperimentalCheckbox');
    const enabled = typeof forceState === 'boolean' ? forceState : (checkbox ? checkbox.checked : false);
    settingsManager.toggleV45Experimental(enabled);
    if (!silent) {
        window.showToast(enabled ? "已启用 V4.5 实验性请求参数" : "已恢复 V4.5 官方默认参数", "success");
    }
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
    settingsManager.updateResolutionOptions(bypass);
}

function toggleBypassLimitsEnabled(forceState) {
    settingsManager.toggleBypassLimitsEnabled(forceState);
}

function updateAnlasUI(data) {
    if (ui && typeof ui.updateCustomApiCredit === 'function') {
        ui.updateCustomApiCredit(data);
    }
}

window.refreshAnlasDisplay = async function() {
    const keysRaw = localStorage.getItem('nai_custom_api_key');
    if (!keysRaw) return;
    const keys = keysRaw.split(/[\n,]/).map(k => k.trim()).filter(k => k);
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
        console.warn('自动刷新 Anlas/Opus 额度失败:', e.message);
    }
};

function checkAdminStatus() {
    settingsManager.checkAdminStatus();
}
checkAdminStatus();

// --- 自定义 API Key ---
// --- 模态框通用开启/关闭与全局提示系统 ---
initModalToastGlobals();

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
    window.togglePanel('characterPromptsPanel', 'charChevron');
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

function setCharPosition(target, x, y) {
    charPromptManager.setCharPosition(target, x, y);
}
window.setCharPosition = setCharPosition;

function saveCharacterPromptsState() {
    charPromptManager.saveCharacterPromptsState();
}
window.saveCharacterPromptsState = saveCharacterPromptsState;

function openCharPositionStage(idx = 0) {
    charPromptManager.openStage(idx);
}
window.openCharPositionStage = openCharPositionStage;

function closeCharPositionStage() {
    charPromptManager.closeStage();
}
window.closeCharPositionStage = closeCharPositionStage;

function setCharStageGridMode(mode) {
    charPromptManager.setStageGridMode(mode);
}
window.setCharStageGridMode = setCharStageGridMode;

function autoArrangeCharPositions() {
    charPromptManager.autoArrange();
}
window.autoArrangeCharPositions = autoArrangeCharPositions;

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
        galleryController.loadGallery();
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
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">个人中心</span>
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
                    const opusUsage = (detail && detail.opusUsage) || data.opusUsage;
                    if (opusUsage && typeof opusUsage.percent === 'number') {
                        detailText += ` | Opus免费生成: 剩余 ${opusUsage.percent}% (约 ${opusUsage.estimatedImages} 张)`;
                    }
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
                const opusUsage = data.opusUsage || (data.details && data.details[0] && data.details[0].opusUsage);
                let opusInfo = '';
                if (opusUsage && typeof opusUsage.percent === 'number') {
                    opusInfo = ` | Opus免费生成额度: 剩余 <b>${opusUsage.percent}%</b> (约 ${opusUsage.estimatedImages} 张)`;
                }
                statusEl.innerHTML = `<span class="text-green-500">✔ 验证成功! 首个 Key 订阅: <b>${data.tierName}</b>${opusInfo}。已激活 ${keys.length} 个 Key 并发模式。</span>`;
                document.getElementById('apiKeyClearBtn').classList.remove('hidden');
                checkAdminStatus();
                updateAnlasUI(data);
                if (window.fetchAndShowAllKeysBalances) {
                    window.fetchAndShowAllKeysBalances(keys);
                }
                setTimeout(() => closeApiKeyModal(), 2000);
            } else if (data.error) {
                statusEl.innerHTML = `<span class="text-red-500">✗ ${data.error}</span>`;
            } else {
                statusEl.innerHTML = `<span class="text-red-500">✗ 验证失败，请检查 Key 是否有效</span>`;
            }
        } else {
            statusEl.innerHTML = `<span class="text-red-500">✗ 验证服务无响应，请确保后端代理正在运行</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = `<span class="text-red-500">✗ 验证异常: ${e.message}（请确保后端服务正常运行）</span>`;
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
    getExtraParams: (model, hasCustomKey) => {
        const charRefVal = charRefManager.isValidForModel(model, hasCustomKey);
        if (!charRefVal.isValid) {
            throw new Error(charRefVal.error);
        }
        return collectAdvancedAndModelParams(model);
    },
    onComplete: async (successfulResults, promptText, selectedVersion, inpaintParams = null) => {
        for (const result of successfulResults) {
            const reader = new FileReader();
            reader.readAsDataURL(result.blob);
            reader.onloadend = async () => {
                const meta = inpaintParams ? { ...inpaintParams, inpaint: true } : null;
                await saveToHistory(reader.result, promptText + ' [inpaint]', selectedVersion, result, true, meta);
            };
        }

        ui.showResultImages(successfulResults, (selected) => {
            appState.currentImageData = selected;
            if (selected.id) appState.currentImageId = selected.id;
            window.lastSelectedImageUrl = selected.imageUrl;
        });
        if (inpaintEditor.isOpen && successfulResults.length > 1) {
            ui.focusImage(successfulResults[0]);
        }
    }
});

const outpaintEditor = new OutpaintEditor({
    engine: engine,
    store: store,
    getExtraParams: (model, hasCustomKey) => {
        const charRefVal = charRefManager.isValidForModel(model, hasCustomKey);
        if (!charRefVal.isValid) {
            throw new Error(charRefVal.error);
        }
        return collectAdvancedAndModelParams(model);
    }
});

// =================== 图库大图详情弹窗 (Lightbox) ===================
const lightboxController = createLightboxController({
    ui,
    els,
    store,
    appState,
    galleryController,
    charPromptManager,
    charRefManager,
    vibeManager,
    inpaintEditor,
    outpaintEditor,
    postProcess,
    triggerDownload
});
const {
    openLightbox,
    closeLightbox,
    resetLightboxZoom,
    renderLightboxCurrent,
    prevLightboxImage,
    nextLightboxImage,
    copyLightboxAllCharacters,
    copyLightboxText,
    lightboxApplyParams,
    lightboxDownload,
    lightboxSaveCurrentToGallery,
    lightboxDelete,
    lightboxCreate,
    toggleLightboxSidebarMobile
} = lightboxController;
if (typeof window !== 'undefined') {
    Object.assign(window, {
        openLightbox,
        resolveLightboxMeta,
        normalizeModelVersion,
        copyLightboxAllCharacters,
        lightboxSaveCurrentToGallery
    });
}

// --- 暴露局部重绘、主题、API Key和鉴权等所有函数到全局 ---
Object.assign(window, {
    openEnhanceModal, closeEnhanceModal, setEnhancePreset, doEnhance, doUpscale,
    inpaintEditor,
    toggleInpaintEditor: (opts) => inpaintEditor.toggle(opts),
    openInpaintEditor: (opts) => inpaintEditor.open(opts),
    closeInpaintEditor: () => inpaintEditor.close(),
    setInpaintTool: (t) => inpaintEditor.setTool(t),
    toggleInpaintParamsPopover: (s) => inpaintEditor.toggleParamsPopover(s),
    inpaintToggleMaskVis: () => inpaintEditor.toggleMaskVisibility(),
    inpaintRevertOriginal: () => inpaintEditor.revertToOriginalImage(),
    inpaintUndo: () => inpaintEditor.undo(),
    inpaintClearMask: () => inpaintEditor.clearMask(),
    inpaintRestoreMask: () => inpaintEditor.restoreLastMask(true),
    inpaintRetryOriginal: () => inpaintEditor.retryLastSession(),
    inpaintContinueNew: () => inpaintEditor.continueOnCurrentImage(false),
    inpaintResetZoom: () => inpaintEditor.resetZoom(),
    toggleInpaintDrawer: () => inpaintEditor.toggleDrawer(),
    doInpaint: () => inpaintEditor.doInpaint(),
    resetLightboxZoom,
    outpaintEditor,
    startOutpaint: () => outpaintEditor.open(),
    exitOutpaint: () => outpaintEditor.close(),
    enterCustomApiKey, closeApiKeyModal, verifyCustomApiKey, clearCustomApiKey,
    enterAdminToken, enterUserKey, toggleTheme,
    openLightbox, closeLightbox, prevLightboxImage, nextLightboxImage,
    copyLightboxText, lightboxApplyParams, lightboxDownload, lightboxDelete, lightboxSaveCurrentToGallery,
    lightboxCreate, toggleLightboxSidebarMobile,
    saveAdminToken, clearAdminToken,
    addApiKeyInputRow, removeApiKeyInputRow, toggleLowPerf, toggleKeyConcurrent, toggleV45Experimental, randomizeSeed, toggleBypassLimitsEnabled,
    addCharacterPromptRow, removeCharacterPromptRow, selectCharGridCell, setCharPosition, toggleCharacterPromptsPanel,
    openCharPositionStage, closeCharPositionStage, setCharStageGridMode, autoArrangeCharPositions,
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
// 如果已配置自定义 API Key，自动刷新并显示 Anlas / Opus 免费额度
if (window.refreshAnlasDisplay) {
    window.refreshAnlasDisplay();
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





// --- Random Prompt Library UI Helper Functions ---
function renderRandomPromptsList() {
    const globalCheckbox = document.getElementById('randomPromptEnabled');
    if (globalCheckbox) {
        globalCheckbox.checked = randomPromptManager.isEnabled();
    }
    randomPromptController.renderList();
}
window.renderRandomPromptsList = renderRandomPromptsList;

function toggleRandomPromptEnabled(checked) {
    randomPromptController.toggleEnabled(checked);
}
window.toggleRandomPromptEnabled = toggleRandomPromptEnabled;

function toggleRandomCategory(name, checked) {
    randomPromptController.toggleCategory(name, checked);
}
window.toggleRandomCategory = toggleRandomCategory;

function toggleRandomCategoryFold(name, event) {
    randomPromptController.toggleFold(name, event);
}
window.toggleRandomCategoryFold = toggleRandomCategoryFold;

function updateRandomCategoryContent(name, content) {
    randomPromptController.updateCategoryContent(name, content);
}
window.updateRandomCategoryContent = updateRandomCategoryContent;

async function deleteRandomCategory(name) {
    await randomPromptController.deleteCategory(name);
}
window.deleteRandomCategory = deleteRandomCategory;

function addRandomPromptCategory() {
    randomPromptController.addCategory();
}
window.addRandomPromptCategory = addRandomPromptCategory;

function exportRandomPromptFile() {
    randomPromptController.exportFile();
}
window.exportRandomPromptFile = exportRandomPromptFile;

function importRandomPromptFile(event) {
    randomPromptController.importFile(event);
}
window.importRandomPromptFile = importRandomPromptFile;

// Initialize UX & Motion Enhancements (shortcuts, PNG drop overlay, range progress, drawer swipe physics)
initUxEnhancements({
    onTriggerGenerate: () => doGenerate(),
    ui,
    inpaintEditor
});

// --- Native HTML5 Drag and Drop NovelAI PNG Metadata Auto-Fill ---
if (typeof window !== 'undefined') {
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('drop', async (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'file'))) {
            return;
        }
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
            e.preventDefault();
            try {
                const buffer = await file.arrayBuffer();
                const meta = extractMetadata(buffer);
                if (meta && (meta.Description || meta.Comment)) {
                    let count = 0;
                    if (meta.Description) {
                        const promptEl = document.getElementById('prompt');
                        if (promptEl) {
                            promptEl.value = meta.Description;
                            promptEl.dispatchEvent(new Event('input', { bubbles: true }));
                            count++;
                        }
                    }
                    if (meta.Comment) {
                        try {
                            const commentObj = JSON.parse(meta.Comment);
                            if (commentObj.uc) {
                                const negEl = document.getElementById('negativePrompt');
                                if (negEl) {
                                    negEl.value = commentObj.uc;
                                    negEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    count++;
                                }
                            }
                            if (commentObj.steps) {
                                const stepsEl = document.getElementById('steps');
                                if (stepsEl) {
                                    stepsEl.value = commentObj.steps;
                                    stepsEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    count++;
                                }
                            }
                            if (commentObj.scale) {
                                const scaleEl = document.getElementById('scale');
                                if (scaleEl) {
                                    scaleEl.value = commentObj.scale;
                                    scaleEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    count++;
                                }
                            }
                            if (commentObj.seed) {
                                const seedEl = document.getElementById('seed');
                                if (seedEl) {
                                    seedEl.value = commentObj.seed;
                                    seedEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    count++;
                                }
                            }
                            if (commentObj.sampler) {
                                const samplerEl = document.getElementById('sampler');
                                if (samplerEl) {
                                    samplerEl.value = commentObj.sampler;
                                    samplerEl.dispatchEvent(new Event('change', { bubbles: true }));
                                    count++;
                                }
                            }
                            if (commentObj.width && commentObj.height) {
                                const resSelect = document.getElementById('resolution');
                                if (resSelect) {
                                    const targetVal = `${commentObj.width},${commentObj.height}`;
                                    let found = false;
                                    for (let opt of resSelect.options) {
                                        if (opt.value === targetVal) { found = true; break; }
                                    }
                                    if (!found) {
                                        resSelect.add(new Option(`${commentObj.width} x ${commentObj.height}`, targetVal));
                                    }
                                    resSelect.value = targetVal;
                                    resSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                    count++;
                                }
                            }
                        } catch (_) {}
                    }
                    if (count > 0 && window.showToast) {
                        window.showToast(`已从拖拽图片中解析并自动填入 ${count} 项生成参数！`, 'success');
                    }
                } else if (window.showToast) {
                    window.showToast('拖拽的图片中未检测到 NovelAI 生成元数据', 'info');
                }
            } catch (err) {
                console.error('Failed to parse dropped image metadata:', err);
            }
        }
    });
}
