/**
 * Advanced Toolbox Controller Module
 * Handles UI interactions, modal states, and scrambling workflow.
 */
import { processImageScrambler } from './image-scrambler.js';
import { extractMetadata } from './png-metadata.js';
import { openModal, closeModal } from './modal-toast.js';
import * as motionMod from './motion-controller.js';

function getToolboxMotionController() {
    return (typeof window !== 'undefined' && window.motionController) || motionMod.motionController || null;
}

function isToolboxReducedMotion() {
    const mc = getToolboxMotionController();
    if (mc && typeof mc.prefersReducedMotion === 'function') {
        return mc.prefersReducedMotion();
    }
    if (typeof document !== 'undefined' && document.documentElement?.classList?.contains?.('low-perf')) {
        return true;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
}

function syncToolboxTriggerState(triggerEl, isOpen) {
    if (!triggerEl || typeof triggerEl.setAttribute !== 'function') return;
    triggerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (typeof triggerEl.querySelector === 'function') {
        const chevron = triggerEl.querySelector('[data-chevron], svg.chevron-icon');
        if (chevron?.classList) {
            chevron.classList.toggle('rotate-180', Boolean(isOpen));
        }
    }
}

function syncToolboxSectionVisibility(el, isOpen, { triggerEl = null, immediate = false } = {}) {
    if (!el) return;
    syncToolboxTriggerState(triggerEl, Boolean(isOpen));

    const accordionRoot = el.classList?.contains?.('studio-accordion')
        ? el
        : el.closest?.('.studio-accordion');

    if (accordionRoot && !immediate) {
        el.classList?.remove?.('hidden');
        accordionRoot.classList?.toggle?.('is-open', Boolean(isOpen));
        if ('inert' in accordionRoot) accordionRoot.inert = !isOpen;
        return;
    }

    const mc = getToolboxMotionController();
    if (!immediate && mc && typeof mc.enter === 'function' && typeof mc.exit === 'function' && typeof el.getAnimations === 'function') {
        if (isOpen) mc.enter(el, { hiddenClass: 'hidden' });
        else mc.exit(el, { hiddenClass: 'hidden' });
        return;
    }

    if (!immediate && !isToolboxReducedMotion() && typeof el.animate === 'function' && typeof el.getAnimations === 'function') {
        try {
            el.getAnimations().forEach(a => { try { a.cancel(); } catch (_) {} });
        } catch (_) {}

        if (isOpen) {
            el.removeAttribute?.('data-closing');
            el.classList?.remove?.('hidden');
            try {
                el.animate(
                    [
                        { opacity: 0, transform: 'translate3d(0, -4px, 0)' },
                        { opacity: 1, transform: 'translate3d(0, 0, 0)' }
                    ],
                    { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
                );
            } catch (_) {}
        } else if (!el.classList?.contains?.('hidden')) {
            el.setAttribute?.('data-closing', '');
            try {
                const anim = el.animate(
                    [
                        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
                        { opacity: 0, transform: 'translate3d(0, -4px, 0)' }
                    ],
                    { duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
                );
                let done = false;
                const finish = () => {
                    if (done || !el.hasAttribute?.('data-closing')) return;
                    done = true;
                    el.removeAttribute?.('data-closing');
                    el.classList?.add?.('hidden');
                };
                anim.onfinish = finish;
                setTimeout(finish, 170);
            } catch (_) {
                el.removeAttribute?.('data-closing');
                el.classList?.add?.('hidden');
            }
        }
        return;
    }

    el.removeAttribute?.('data-closing');
    el.classList?.toggle?.('hidden', !isOpen);
}

async function renderToolboxHistoryPicker({ wrapperId, containerId, isOpen, triggerSelector, onSelect }) {
    const wrapper = typeof document !== 'undefined' ? document.getElementById(wrapperId) : null;
    if (!wrapper) return;

    const triggerEl = typeof document !== 'undefined' && triggerSelector ? document.querySelector(triggerSelector) : null;
    syncToolboxSectionVisibility(wrapper, isOpen, { triggerEl });
    if (!isOpen) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div class="text-[10px] text-slate-500 dark:text-slate-400 text-center w-full py-4">正在载入生图历史...</div>';

    try {
        if (!store) {
            container.innerHTML = '<div class="text-[10px] text-red-500 dark:text-red-400 text-center w-full py-4">存储未初始化</div>';
            return;
        }
        const images = await store.getImagesPage(0, 50);
        if (!images || images.length === 0) {
            container.innerHTML = '<div class="text-[10px] text-slate-500 dark:text-slate-400 text-center w-full py-4">无历史生成图片</div>';
            return;
        }

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        images.forEach((item, idx) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'studio-card studio-list-enter relative w-12 h-12 p-0 rounded-lg overflow-hidden cursor-pointer border border-transparent hover:border-slate-500 dark:hover:border-slate-400 transition-colors duration-200 shrink-0 bg-slate-900/10 dark:bg-slate-900/50';
            if (imgContainer.style?.setProperty) {
                imgContainer.style.setProperty('--sibling-index', String(Math.min(idx, 10)));
            }
            imgContainer.onclick = () => onSelect(item.image);

            const img = document.createElement('img');
            img.src = item.image;
            img.alt = '';
            img.className = 'w-full h-full object-cover';
            imgContainer.appendChild(img);
            fragment.appendChild(imgContainer);
        });
        container.appendChild(fragment);
        const mc = getToolboxMotionController();
        if (mc && typeof mc.setStaggerIndices === 'function' && typeof container.querySelectorAll === 'function') {
            mc.setStaggerIndices(container, '.studio-list-enter', 10);
        }
    } catch (e) {
        console.error('加载生图历史失败:', e);
        container.innerHTML = '<div class="text-[10px] text-red-500 dark:text-red-400 text-center w-full py-4">加载失败</div>';
    }
}

let store = null;
let charRefManager = null;
let vibeManager = null;
let scrambleSourceImageBase64 = null;
let isScrambleDecryptMode = false;
let isHistoryListOpen = false;
let parsedMetadata = null;
let isMetadataHistoryListOpen = false;

/**
 * Initialize the toolbox controller with required store instance and dependencies
 */
export function initToolbox(storeInstance, deps = {}) {
    store = storeInstance;
    charRefManager = deps.charRefManager || window.charRefManager || null;
    vibeManager = deps.vibeManager || window.vibeManager || null;
}

export function openToolboxModal() {
    openModal('toolboxModal');
    switchToolboxTab('scrambler');
    onScrambleAlgorithmChange();
    toggleScramblePasswordInput();
}

export function closeToolboxModal() {
    closeModal('toolboxModal');
}

export function switchToolboxTab(tabId) {
    document.querySelectorAll('.toolbox-tab-btn').forEach(btn => {
        const isActive = btn.id === `toolboxTab-${tabId}`;
        const usesStudioTabs = btn.classList?.contains?.('studio-tab') || Boolean(btn.closest?.('.studio-tabs'));
        btn.classList.toggle('active-tab', isActive);
        btn.classList.toggle('active', isActive);
        btn.setAttribute?.('aria-pressed', isActive ? 'true' : 'false');
        btn.classList.remove('bg-gray-100', 'text-gray-900', 'text-gray-500', 'dark:text-gray-400');
        if (usesStudioTabs) {
            btn.classList.add('studio-tab');
            btn.classList.remove('dark:bg-slate-800', 'dark:text-white', 'shadow-sm', 'bg-slate-100', 'text-slate-900', 'text-slate-500', 'dark:text-slate-400');
        } else if (isActive) {
            btn.classList.add('studio-tab', 'bg-slate-100', 'dark:bg-slate-800', 'text-slate-900', 'dark:text-white', 'shadow-sm', 'transition-colors');
            btn.classList.remove('text-slate-500', 'dark:text-slate-400');
        } else {
            btn.classList.add('studio-tab', 'text-slate-500', 'dark:text-slate-400', 'transition-colors');
            btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-900', 'dark:text-white', 'shadow-sm');
        }
    });

    document.querySelectorAll('.toolbox-panel').forEach(panel => {
        const isTarget = panel.id === `toolboxPanel-${tabId}`;
        if (isTarget) {
            syncToolboxSectionVisibility(panel, true);
        } else {
            syncToolboxSectionVisibility(panel, false, { immediate: true });
        }
    });
}

export async function toggleScrambleHistoryList() {
    isHistoryListOpen = !isHistoryListOpen;
    await renderToolboxHistoryPicker({
        wrapperId: 'scrambleHistoryListWrapper',
        containerId: 'scrambleHistoryThumbnails',
        isOpen: isHistoryListOpen,
        triggerSelector: '[onclick*="toggleScrambleHistoryList"]',
        onSelect: (img) => selectScrambleHistoryImage(img)
    });
}

export function selectScrambleHistoryImage(imageSrc) {
    if (!imageSrc) return;
    loadScrambleCanvas(imageSrc);
    if (window.showToast) window.showToast('成功导入生图历史图片', 'success');
}

export function handleScrambleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        loadScrambleCanvas(e.target.result);
        if (window.showToast) window.showToast('成功导入本地图片', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

export function loadScrambleCanvas(imgSrc) {
    if (!imgSrc) return;
    scrambleSourceImageBase64 = imgSrc;
    
    const canvas = document.getElementById('scrambleCanvas');
    const placeholder = document.getElementById('scramblePlaceholder');
    const downloadBtn = document.getElementById('downloadScrambleBtn');
    if (!canvas || !placeholder) return;
    
    const img = new Image();
    img.onload = function() {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
        }
        
        syncToolboxSectionVisibility(placeholder, false, { immediate: true });
        syncToolboxSectionVisibility(canvas, true);
        
        if (downloadBtn) {
            syncToolboxSectionVisibility(downloadBtn, false, { immediate: true });
        }
    };
    img.src = imgSrc;
}

export function setScrambleMode(isDecryptMode) {
    isScrambleDecryptMode = isDecryptMode;
    
    const encryptBtn = document.getElementById('scrambleModeEncrypt');
    const decryptBtn = document.getElementById('scrambleModeDecrypt');
    const actionBtn = document.getElementById('scrambleActionBtn');
    
    if (!encryptBtn || !decryptBtn || !actionBtn) return;

    const activeCls = 'studio-tab active flex-1 text-center py-1.5 text-xs font-bold rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm transition-colors duration-200';
    const inactiveCls = 'studio-tab flex-1 text-center py-1.5 text-xs font-semibold rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors duration-200';

    encryptBtn.className = isScrambleDecryptMode ? inactiveCls : activeCls;
    decryptBtn.className = isScrambleDecryptMode ? activeCls : inactiveCls;
    encryptBtn.setAttribute?.('aria-pressed', isScrambleDecryptMode ? 'false' : 'true');
    decryptBtn.setAttribute?.('aria-pressed', isScrambleDecryptMode ? 'true' : 'false');
    actionBtn.innerText = isScrambleDecryptMode ? '开始解密还原' : '开始混淆加密';
}

export function onScrambleAlgorithmChange() {
    const select = document.getElementById('scrambleAlgorithmSelect');
    const wrapper = document.getElementById('scrambleTileSizeWrapper');
    if (!select || !wrapper) return;

    const isTile = select.value === 'tile';
    syncToolboxSectionVisibility(wrapper, isTile, { triggerEl: select });
}

export function toggleScramblePasswordInput() {
    const usePwCheckbox = document.getElementById('scrambleUsePassword');
    const wrapper = document.getElementById('scramblePasswordWrapper');
    if (!usePwCheckbox || !wrapper) return;

    syncToolboxSectionVisibility(wrapper, Boolean(usePwCheckbox.checked), { triggerEl: usePwCheckbox });
}

export function executeScrambleProcess() {
    if (!scrambleSourceImageBase64) {
        if (window.showToast) window.showToast('请先选择或上传一张图片', 'warning');
        return;
    }
    
    const canvas = document.getElementById('scrambleCanvas');
    if (!canvas) return;
    
    const algoSelect = document.getElementById('scrambleAlgorithmSelect');
    const algo = algoSelect ? algoSelect.value : 'tile';
    
    const usePwCheckbox = document.getElementById('scrambleUsePassword');
    const usePw = usePwCheckbox ? usePwCheckbox.checked : false;
    
    let key = "default_free_scramble_key_2026";
    if (usePw) {
        const pwInput = document.getElementById('scramblePasswordInput');
        key = pwInput ? pwInput.value.trim() : "";
        if (!key) {
            if (window.showToast) window.showToast('启用了密码保护，请输入密码', 'warning');
            return;
        }
    }
    
    let tileSize = 32;
    if (algo === 'tile') {
        const sizeSelect = document.getElementById('scrambleTileSizeSelect');
        tileSize = sizeSelect ? parseInt(sizeSelect.value, 10) : 32;
    }
    
    const actionBtn = document.getElementById('scrambleActionBtn');
    const origText = actionBtn ? actionBtn.innerText : '';
    if (actionBtn) {
        actionBtn.innerText = isScrambleDecryptMode ? "正在还原..." : "正在加密...";
        actionBtn.disabled = true;
    }
    
    const img = new Image();
    img.onload = function() {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            if (actionBtn) {
                actionBtn.innerText = origText;
                actionBtn.disabled = false;
            }
            return;
        }
        ctx.drawImage(img, 0, 0);
        
        try {
            processImageScrambler(canvas, algo, key, isScrambleDecryptMode, { tileSize });
            
            if (window.showToast) {
                window.showToast(isScrambleDecryptMode ? '解密还原处理完成' : '加密混淆处理完成', 'success');
            }
            
            const downloadBtn = document.getElementById('downloadScrambleBtn');
            if (downloadBtn) {
                syncToolboxSectionVisibility(downloadBtn, true);
            }
        } catch (e) {
            console.error('处理图像失败:', e);
            if (window.showToast) window.showToast('图像处理失败: ' + e.message, 'error');
        } finally {
            if (actionBtn) {
                actionBtn.innerText = origText;
                actionBtn.disabled = false;
            }
        }
    };
    img.onerror = function() {
        if (window.showToast) window.showToast('加载原始图片失败', 'error');
        if (actionBtn) {
            actionBtn.innerText = origText;
            actionBtn.disabled = false;
        }
    };
    img.src = scrambleSourceImageBase64;
}

export function downloadScrambleResult() {
    const canvas = document.getElementById('scrambleCanvas');
    if (!canvas) return;
    
    try {
        const dataUrl = canvas.toDataURL('image/png');
        const filename = `scrambled_${isScrambleDecryptMode ? 'decrypted' : 'encrypted'}_${Date.now()}.png`;
        if (window.triggerDownload) {
            window.triggerDownload(dataUrl, filename);
            if (window.showToast) window.showToast('图片下载已触发', 'success');
        } else {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = filename;
            a.click();
        }
    } catch (e) {
        console.error('图片下载失败:', e);
        if (window.showToast) window.showToast('图片下载失败: ' + e.message, 'error');
    }
}

export function loadMetadataImage(imgSrc) {
    if (!imgSrc) return;
    
    const placeholder = document.getElementById('metadataPlaceholder');
    const resultSection = document.getElementById('metadataResultSection');
    const resultContent = document.getElementById('metadataResultContent');
    const applyBtn = document.getElementById('applyMetadataBtn');
    
    if (!placeholder || !resultSection || !resultContent) return;
    
    try {
        let arrayBuffer;
        if (imgSrc.startsWith('data:')) {
            const parts = imgSrc.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const binary = atob(parts[1]);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            arrayBuffer = array.buffer;
        } else {
            throw new Error("只能解析本地上传或生图历史的图片数据");
        }
        
        const metadata = extractMetadata(arrayBuffer);
        
        if (!metadata || Object.keys(metadata).length === 0) {
            if (window.showToast) window.showToast('该图片中没有找到任何元数据', 'warning');
            parsedMetadata = null;
            syncToolboxSectionVisibility(resultSection, false, { immediate: true });
            syncToolboxSectionVisibility(placeholder, true);
            return;
        }
        
        parsedMetadata = metadata;
        syncToolboxSectionVisibility(placeholder, false, { immediate: true });
        syncToolboxSectionVisibility(resultSection, true);
        
        resultContent.innerHTML = '';
        
        let hasNaiParams = false;
        let prompt = "";
        let negative = "";
        let steps = "";
        let scale = "";
        let seed = "";
        let sampler = "";
        
        if (metadata.Description) {
            prompt = metadata.Description;
            hasNaiParams = true;
        }
        
        if (metadata.Comment) {
            try {
                const commentObj = JSON.parse(metadata.Comment);
                if (commentObj.steps) steps = commentObj.steps;
                if (commentObj.scale) scale = commentObj.scale;
                if (commentObj.seed) seed = commentObj.seed;
                if (commentObj.sampler) sampler = commentObj.sampler;
                if (commentObj.uc) negative = commentObj.uc;
                hasNaiParams = true;
            } catch (e) {
                console.warn('解析 Comment 失败:', e);
            }
        }
        
        const renderItem = (label, value) => {
            const div = document.createElement('div');
            div.className = 'studio-card studio-list-enter space-y-1 bg-white/70 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80';
            
            const lbl = document.createElement('div');
            lbl.className = 'text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest';
            lbl.textContent = label;
            
            const val = document.createElement('pre');
            val.className = 'text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all';
            val.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
            
            div.appendChild(lbl);
            div.appendChild(val);
            resultContent.appendChild(div);
        };
        
        if (prompt) renderItem('提示词 (Prompt)', prompt);
        if (negative) renderItem('负面提示词 (Negative Prompt / UC)', negative);
        
        const paramsGrid = [];
        if (steps) paramsGrid.push({ label: '步数 (Steps)', value: steps });
        if (scale) paramsGrid.push({ label: 'CFG Scale', value: scale });
        if (seed) paramsGrid.push({ label: '随机种子 (Seed)', value: seed });
        if (sampler) paramsGrid.push({ label: '采样器 (Sampler)', value: sampler });
        
        if (paramsGrid.length > 0) {
            const gridDiv = document.createElement('div');
            gridDiv.className = 'grid grid-cols-2 gap-3';
            paramsGrid.forEach(param => {
                const div = document.createElement('div');
                div.className = 'studio-card studio-list-enter bg-white/70 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80';
                
                const lbl = document.createElement('div');
                lbl.className = 'text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest';
                lbl.textContent = param.label;
                
                const val = document.createElement('div');
                val.className = 'text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums';
                val.textContent = param.value;
                
                div.appendChild(lbl);
                div.appendChild(val);
                gridDiv.appendChild(div);
            });
            resultContent.appendChild(gridDiv);
        }
        
        Object.keys(metadata).forEach(key => {
            if (key !== 'Description' && key !== 'Comment') {
                renderItem(key, metadata[key]);
            }
        });

        const mc = getToolboxMotionController();
        if (mc && typeof mc.setStaggerIndices === 'function' && typeof resultContent.querySelectorAll === 'function') {
            mc.setStaggerIndices(resultContent, '.studio-list-enter', 10);
        }
        
        if (applyBtn) {
            syncToolboxSectionVisibility(applyBtn, hasNaiParams);
        }
        
    } catch (e) {
        console.error('分析图片元数据失败:', e);
        if (window.showToast) window.showToast('元数据分析失败: ' + e.message, 'error');
        parsedMetadata = null;
        syncToolboxSectionVisibility(resultSection, false, { immediate: true });
        syncToolboxSectionVisibility(placeholder, true);
    }
}

export function applyMetadataParameters() {
    if (!parsedMetadata) {
        if (window.showToast) window.showToast('无可用参数可应用', 'warning');
        return;
    }
    
    try {
        let appliedCount = 0;
        const modelVer = document.getElementById('modelSelect')?.value || 'v4.5';
        
        if (parsedMetadata.Description) {
            const promptInput = document.getElementById('prompt');
            if (promptInput) {
                promptInput.value = parsedMetadata.Description;
                promptInput.dispatchEvent(new Event('input', { bubbles: true }));
                appliedCount++;
            }
        }
        
        if (parsedMetadata.Comment) {
            let commentObj = null;
            try {
                commentObj = JSON.parse(parsedMetadata.Comment);
            } catch (err) {
                console.warn("Could not parse Comment metadata as JSON:", err);
            }
            
            if (commentObj) {
                if (commentObj.uc) {
                    const negInput = document.getElementById('negativePrompt');
                    if (negInput) {
                        negInput.value = commentObj.uc;
                        negInput.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }
                
                if (commentObj.steps) {
                    const stepsInput = document.getElementById('steps');
                    if (stepsInput) {
                        stepsInput.value = commentObj.steps;
                        stepsInput.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }
                
                if (commentObj.scale) {
                    const scaleInput = document.getElementById('scale');
                    if (scaleInput) {
                        scaleInput.value = commentObj.scale;
                        scaleInput.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }
                
                if (commentObj.seed) {
                    const seedInput = document.getElementById('seed');
                    if (seedInput) {
                        seedInput.value = commentObj.seed;
                        seedInput.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }
                
                if (commentObj.sampler) {
                    const samplerInput = document.getElementById('sampler');
                    if (samplerInput) {
                        samplerInput.value = commentObj.sampler;
                        samplerInput.dispatchEvent(new Event('input', { bubbles: true }));
                        samplerInput.dispatchEvent(new Event('change', { bubbles: true }));
                        appliedCount++;
                    }
                }

                if (commentObj.width && commentObj.height) {
                    const resSelect = document.getElementById('resolution');
                    if (resSelect) {
                        const targetVal = `${commentObj.width},${commentObj.height}`;
                        let found = false;
                        for (let opt of resSelect.options) {
                            if (opt.value === targetVal) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            resSelect.add(new Option(`${commentObj.width} x ${commentObj.height}`, targetVal));
                        }
                        resSelect.value = targetVal;
                        resSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        appliedCount++;
                    }
                }

                if (commentObj.sm !== undefined) {
                    const smEl = document.getElementById('smEnabled');
                    if (smEl) {
                        smEl.checked = Boolean(commentObj.sm);
                        smEl.dispatchEvent(new Event('change', { bubbles: true }));
                        appliedCount++;
                    }
                }

                if (commentObj.sm_dyn !== undefined) {
                    const smDynEl = document.getElementById('smDynEnabled');
                    if (smDynEl) {
                        smDynEl.checked = Boolean(commentObj.sm_dyn);
                        smDynEl.dispatchEvent(new Event('change', { bubbles: true }));
                        appliedCount++;
                    }
                }

                if (commentObj.cfg_rescale !== undefined) {
                    const cfgEl = document.getElementById('cfgRescale');
                    if (cfgEl) {
                        cfgEl.value = commentObj.cfg_rescale;
                        cfgEl.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }

                if (commentObj.uncond_scale !== undefined) {
                    const ucEl = document.getElementById('uncondScale');
                    if (ucEl) {
                        ucEl.value = commentObj.uncond_scale;
                        ucEl.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }

                if (commentObj.skip_cfg_above_sigma !== undefined && commentObj.skip_cfg_above_sigma !== null) {
                    const skipCfgEl = document.getElementById('skipCfg');
                    if (skipCfgEl) {
                        skipCfgEl.value = commentObj.skip_cfg_above_sigma;
                        skipCfgEl.dispatchEvent(new Event('input', { bubbles: true }));
                        appliedCount++;
                    }
                }

                // 恢复多角色提示词 (Character Prompts)
                let charList = commentObj.characterPrompts || commentObj.char_captions;
                if (!charList && commentObj.v4_prompt?.caption?.char_captions) {
                    charList = commentObj.v4_prompt.caption.char_captions;
                }
                if (Array.isArray(charList) && window.addCharacterPromptRow) {
                    const container = document.getElementById('characterPromptsContainer');
                    if (container) container.innerHTML = '';
                    const useCoords = commentObj.use_coords !== undefined ? Boolean(commentObj.use_coords) :
                                      (commentObj.v4_prompt_use_coords !== undefined 
                                          ? commentObj.v4_prompt_use_coords 
                                          : (commentObj.v4_prompt ? commentObj.v4_prompt.use_coords : false));

                    charList.forEach((char, idx) => {
                        const promptVal = char.prompt || char.char_caption || '';
                        let negVal = char.negative_prompt || char.uc || '';
                        if (!negVal && commentObj.v4_negative_prompt?.caption?.char_captions?.[idx]) {
                            negVal = commentObj.v4_negative_prompt.caption.char_captions[idx].char_caption || '';
                        }
                        let cx = 0.5, cy = 0.5;
                        if (typeof char.x === 'number') cx = char.x;
                        else if (char.center?.x !== undefined) cx = char.center.x;
                        else if (char.centers?.[0]?.x !== undefined) cx = char.centers[0].x;
                        
                        if (typeof char.y === 'number') cy = char.y;
                        else if (char.center?.y !== undefined) cy = char.center.y;
                        else if (char.centers?.[0]?.y !== undefined) cy = char.centers[0].y;

                        const isEnabled = char.enabled !== undefined ? char.enabled : true;
                        window.addCharacterPromptRow(promptVal, negVal, cx, cy, !useCoords, isEnabled);
                    });
                    if (window.saveCharacterPromptsState) window.saveCharacterPromptsState();
                    appliedCount++;
                }

                // 恢复角色参考 (Char Ref)
                const charMgr = charRefManager || window.charRefManager;
                if (charMgr && store && commentObj.director_reference_images && commentObj.director_reference_images.length > 0) {
                    const charRefImgB64 = commentObj.director_reference_images[0];
                    const str = commentObj.director_reference_strength_values && commentObj.director_reference_strength_values[0] !== undefined
                        ? commentObj.director_reference_strength_values[0]
                        : 1.0;
                    const secStr = commentObj.director_reference_secondary_strength_values && commentObj.director_reference_secondary_strength_values[0] !== undefined
                        ? commentObj.director_reference_secondary_strength_values[0]
                        : 0.2;
                    const fidelity = (1.0 - secStr);
                    const desc = commentObj.director_reference_descriptions && commentObj.director_reference_descriptions[0]
                        ? (commentObj.director_reference_descriptions[0].caption?.base_caption || commentObj.director_reference_descriptions[0])
                        : 'character&style';

                    charMgr.currentCharRefImageBase64 = charRefImgB64;
                    store.setSetting(charMgr.getCharRefKey('nai_char_ref_image', modelVer), charRefImgB64);
                    store.setSetting(charMgr.getCharRefKey('nai_char_ref_enabled', modelVer), 'true');
                    store.setSetting(charMgr.getCharRefKey('nai_char_ref_strength', modelVer), str.toString());
                    store.setSetting(charMgr.getCharRefKey('nai_char_ref_fidelity', modelVer), fidelity.toFixed(2));
                    store.setSetting(charMgr.getCharRefKey('nai_char_ref_mode', modelVer), typeof desc === 'string' ? desc : 'character&style');
                    charMgr.loadState(modelVer);
                    appliedCount++;
                }

                // 恢复风格参考 (Vibe Transfer)
                const vibeMgr = vibeManager || window.vibeManager;
                const vibeImgs = commentObj.reference_image_multiple || (commentObj.vibe_image ? [commentObj.vibe_image] : null);
                if (vibeMgr && store && vibeImgs && vibeImgs.length > 0) {
                    const vibeImgB64 = vibeImgs[0];
                    const str = commentObj.reference_strength_multiple && commentObj.reference_strength_multiple[0] !== undefined
                        ? commentObj.reference_strength_multiple[0]
                        : (commentObj.vibe_strength !== undefined ? commentObj.vibe_strength : 0.6);
                    const info = commentObj.reference_information_extracted_multiple && commentObj.reference_information_extracted_multiple[0] !== undefined
                        ? commentObj.reference_information_extracted_multiple[0]
                        : (commentObj.vibe_info !== undefined ? commentObj.vibe_info : 1.0);

                    vibeMgr.currentVibeImageBase64 = vibeImgB64;
                    store.setSetting(vibeMgr.getVibeKey('nai_vibe_image', modelVer), vibeImgB64);
                    store.setSetting(vibeMgr.getVibeKey('nai_vibe_enabled', modelVer), 'true');
                    store.setSetting(vibeMgr.getVibeKey('nai_vibe_strength', modelVer), str.toString());
                    store.setSetting(vibeMgr.getVibeKey('nai_vibe_info', modelVer), info.toString());
                    vibeMgr.loadState(modelVer);
                    appliedCount++;
                }
            }
        }
        
        if (appliedCount > 0) {
            if (window.showToast) window.showToast(`成功应用了 ${appliedCount} 个生成参数！`, 'success');
            closeToolboxModal();
        } else {
            if (window.showToast) window.showToast('未找到支持的参数以应用', 'warning');
        }
    } catch (e) {
        console.error('应用参数失败:', e);
        if (window.showToast) window.showToast('应用参数失败: ' + e.message, 'error');
    }
}

export async function toggleMetadataHistoryList() {
    isMetadataHistoryListOpen = !isMetadataHistoryListOpen;
    await renderToolboxHistoryPicker({
        wrapperId: 'metadataHistoryListWrapper',
        containerId: 'metadataHistoryThumbnails',
        isOpen: isMetadataHistoryListOpen,
        triggerSelector: '[onclick*="toggleMetadataHistoryList"]',
        onSelect: (img) => selectMetadataHistoryImage(img)
    });
}

export function selectMetadataHistoryImage(imageSrc) {
    if (!imageSrc) return;
    loadMetadataImage(imageSrc);
    if (window.showToast) window.showToast('成功导入生图历史图片', 'success');
}

export function handleMetadataFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        loadMetadataImage(e.target.result);
        if (window.showToast) window.showToast('成功导入本地图片', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}
