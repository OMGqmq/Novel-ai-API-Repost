import { ImageEngine } from './engine.js';
import { GalleryStore } from './storage.js';
import { UIController } from './ui.js';
import { InpaintEditor } from './inpaint.js';
import { OutpaintEditor } from './outpaint.js';

// 防抖函数，用于降低高频触发事件（如打字输入）的执行频率
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

class PromptHelper {
    constructor(promptEl, tagData) {
        this.promptEl = promptEl;
        this.tagData = tagData;
        this.tagArray = Object.entries(tagData); // 预先生成 entries 数组，省去输入时高频 Object.entries 带来的巨大 GC 卡顿
        this.isTranslationExpanded = localStorage.getItem('nai_translation_expanded') !== 'false';
        
        this.initUI();
        this.bindEvents();
        this.updateTranslations();
    }

    initUI() {
        const container = this.promptEl.parentElement;
        if (!container) return;

        this.helperContainer = document.createElement('div');
        this.helperContainer.className = 'mt-2 space-y-2';

        this.suggestPanel = document.createElement('div');
        this.suggestPanel.id = 'tagSuggestPanel';
        this.suggestPanel.className = 'hidden bg-gray-50/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl p-3 border border-gray-200/50 dark:border-slate-700/50 shadow-sm';
        this.suggestPanel.innerHTML = `
            <div class="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1 mb-2 flex items-center justify-between select-none">
                <span>联想推荐 (Suggestions)</span>
                <span class="text-[9px] lowercase font-normal">点击填入</span>
            </div>
            <div id="tagSuggestList" class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scroll p-0.5"></div>
        `;

        this.translatePanel = document.createElement('div');
        this.translatePanel.id = 'tagTranslatePanel';
        this.translatePanel.className = 'bg-gray-50/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-sm overflow-hidden';
        this.translatePanel.innerHTML = `
            <button id="tagTranslateToggle" type="button" class="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest hover:bg-gray-100/50 dark:hover:bg-slate-700/30 transition-colors select-none">
                <span class="flex items-center gap-1.5">
                    <i data-lucide="languages" class="w-3.5 h-3.5 text-gray-400 dark:text-slate-500"></i>
                    实时翻译 (Translation) <span id="translateCount" class="ml-1 text-[9px] bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-1.5 py-0.2 rounded-full">0</span>
                </span>
                <i data-lucide="chevron-down" id="translateToggleIcon" class="w-3.5 h-3.5 transition-transform duration-200 text-gray-400 ${this.isTranslationExpanded ? 'rotate-180' : ''}"></i>
            </button>
            <div id="tagTranslateContent" class="${this.isTranslationExpanded ? '' : 'hidden'} p-3 border-t border-gray-100 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/20">
                <div id="tagTranslateList" class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scroll">
                    <div class="text-xs text-gray-400 dark:text-slate-500 italic select-none">输入提示词以查看实时翻译...</div>
                </div>
            </div>
        `;

        this.helperContainer.appendChild(this.suggestPanel);
        this.helperContainer.appendChild(this.translatePanel);
        
        container.insertBefore(this.helperContainer, this.promptEl.nextSibling);

        this.suggestListEl = this.suggestPanel.querySelector('#tagSuggestList');
        this.translateContentEl = this.translatePanel.querySelector('#tagTranslateContent');
        this.translateListEl = this.translatePanel.querySelector('#tagTranslateList');
        this.translateCountEl = this.translatePanel.querySelector('#translateCount');
        this.translateToggleIcon = this.translatePanel.querySelector('#translateToggleIcon');
        
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    calculateWeight(rawTag) {
        let t = rawTag.trim();

        // 1. 优先匹配 v4.5 的权重格式 xx::tag:: (或切开后的 xx::tag)
        const vibeMatch = t.match(/^(-?[0-9.]+)\s*::/);
        if (vibeMatch) {
            return parseFloat(vibeMatch[1]);
        }

        // 2. 原有的 NovelAI 括号叠乘加权/降权规则
        let weight = 1.0;
        let modified = true;
        while (modified) {
            modified = false;
            t = t.trim();
            if (t.startsWith('(') && t.endsWith(')')) {
                weight *= 1.1;
                t = t.slice(1, -1);
                modified = true;
            } else if (t.startsWith('{') && t.endsWith('}')) {
                weight *= 1.05;
                t = t.slice(1, -1);
                modified = true;
            } else if (t.startsWith('[') && t.endsWith(']')) {
                weight /= 1.05;
                t = t.slice(1, -1);
                modified = true;
            }
        }
        return weight;
    }

    cleanTag(tag) {
        let t = tag.trim();
        // 1. 清除 v4.5 的 xx:: 前缀和 :: 后缀
        t = t.replace(/^-?[0-9.]+\s*::\s*/, '');
        t = t.replace(/\s*::\s*$/, '');
        
        // 2. 清除首尾的括号和多余空格
        t = t.replace(/^[\(\{\[\s]+/, '');
        t = t.replace(/[\)\}\]\s]+$/, '');
        return t.trim();
    }

    getActiveTagInfo() {
        const textarea = this.promptEl;
        const text = textarea.value;
        const pos = textarea.selectionStart;
        
        const lastComma = text.lastIndexOf(',', pos - 1);
        const nextComma = text.indexOf(',', pos);
        
        const start = lastComma === -1 ? 0 : lastComma + 1;
        const end = nextComma === -1 ? text.length : nextComma;
        
        const rawQuery = text.substring(start, end);
        const query = this.cleanTag(rawQuery).trim();
        return {
            query,
            rawQuery,
            start,
            end
        };
    }

    bindEvents() {
        const toggleBtn = this.translatePanel.querySelector('#tagTranslateToggle');
        toggleBtn.addEventListener('click', () => {
            this.isTranslationExpanded = !this.isTranslationExpanded;
            localStorage.setItem('nai_translation_expanded', this.isTranslationExpanded.toString());
            
            if (this.isTranslationExpanded) {
                this.translateContentEl.classList.remove('hidden');
                this.translateToggleIcon.classList.add('rotate-180');
            } else {
                this.translateContentEl.classList.add('hidden');
                this.translateToggleIcon.classList.remove('rotate-180');
            }
        });

        // 采用防抖以极大降低 16 万项大数据匹配与 DOM 更新的 CPU 消耗和输入卡顿
        const debouncedUpdateSuggestions = debounce(() => this.updateSuggestions(), 150);
        const debouncedUpdateTranslations = debounce(() => this.updateTranslations(), 250);

        const handleInput = () => {
            debouncedUpdateSuggestions();
            debouncedUpdateTranslations();
        };

        this.promptEl.addEventListener('input', handleInput);
        this.promptEl.addEventListener('keyup', handleInput);
        this.promptEl.addEventListener('click', handleInput);
        this.promptEl.addEventListener('focus', handleInput);

        this.promptEl.addEventListener('blur', () => {
            setTimeout(() => {
                this.suggestPanel.classList.add('hidden');
            }, 250);
        });
    }

    updateSuggestions() {
        const info = this.getActiveTagInfo();
        const query = info.query.toLowerCase().trim();

        if (!query) {
            this.suggestPanel.classList.add('hidden');
            return;
        }

        const matches = [];
        const len = this.tagArray.length;
        for (let i = 0; i < len; i++) {
            const [en, cn] = this.tagArray[i];
            if (en.toLowerCase().includes(query) || cn.includes(query)) {
                matches.push({ en, cn });
            }
        }

        if (matches.length === 0) {
            this.suggestPanel.classList.add('hidden');
            return;
        }

        matches.sort((a, b) => {
            const aEnLower = a.en.toLowerCase();
            const bEnLower = b.en.toLowerCase();
            const aStartEn = aEnLower.startsWith(query);
            const bStartEn = bEnLower.startsWith(query);
            if (aStartEn && !bStartEn) return -1;
            if (!aStartEn && bStartEn) return 1;
            
            const aStartCn = a.cn.startsWith(query);
            const bStartCn = b.cn.startsWith(query);
            if (aStartCn && !bStartCn) return -1;
            if (!aStartCn && bStartCn) return 1;

            return a.en.length - b.en.length;
        });

        const topMatches = matches.slice(0, 15);
        
        this.suggestListEl.innerHTML = '';
        topMatches.forEach(({ en, cn }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'px-3 py-1.5 text-xs bg-white dark:bg-slate-700/60 hover:bg-yellow-50 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-600 hover:border-yellow-200 dark:hover:border-yellow-500/50 rounded-lg text-gray-700 dark:text-gray-200 flex items-center gap-1.5 transition-all shadow-sm active:scale-95 text-left';
            btn.innerHTML = `
                <span class="font-mono font-medium text-gray-900 dark:text-white">${en}</span>
                <span class="text-[10px] text-gray-400 dark:text-slate-400 border-l border-gray-100 dark:border-slate-600/80 pl-1.5">${cn}</span>
            `;
            
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectSuggestion(en);
            });
            
            this.suggestListEl.appendChild(btn);
        });

        this.suggestPanel.classList.remove('hidden');
    }

    selectSuggestion(suggestionEn) {
        const textarea = this.promptEl;
        const text = textarea.value;
        const info = this.getActiveTagInfo();
        
        const raw = info.rawQuery;
        const queryIndex = raw.toLowerCase().indexOf(info.query.toLowerCase());
        let prefix = '';
        let suffix = '';
        if (queryIndex !== -1) {
            prefix = raw.substring(0, queryIndex);
            suffix = raw.substring(queryIndex + info.query.length);
        }
        
        let replacement = prefix + suggestionEn + suffix;
        if (/^-?[0-9.]+\s*::/.test(prefix) && !replacement.endsWith('::')) {
            replacement += '::';
        }
        const newText = text.substring(0, info.start) + replacement + text.substring(info.end);
        
        textarea.value = newText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        
        const newCursorPos = info.start + replacement.length;
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        this.suggestPanel.classList.add('hidden');
        this.updateTranslations();
    }

    updateTranslations() {
        const text = this.promptEl.value;
        if (!text.trim()) {
            this.translateListEl.innerHTML = '<div class="text-xs text-gray-400 dark:text-slate-500 italic select-none">输入提示词以查看实时翻译...</div>';
            this.translateCountEl.textContent = '0';
            return;
        }

        const rawTags = text.split(',');
        const translatedItems = [];
        
        rawTags.forEach(rawTag => {
            const cleaned = this.cleanTag(rawTag);
            if (!cleaned) return;
            
            const lowerCleaned = cleaned.toLowerCase();
            const matchedCn = this.tagData[lowerCleaned];
            
            if (matchedCn) {
                translatedItems.push({
                    raw: rawTag.trim(),
                    clean: cleaned,
                    cn: matchedCn
                });
            }
        });

        this.translateCountEl.textContent = translatedItems.length.toString();

        if (translatedItems.length === 0) {
            this.translateListEl.innerHTML = '<div class="text-xs text-gray-400 dark:text-slate-500 italic select-none">未找到匹配的词汇翻译。</div>';
            return;
        }

        this.translateListEl.innerHTML = '';
        translatedItems.forEach(item => {
            const badge = document.createElement('div');
            
            const weight = this.calculateWeight(item.raw);
            let weightBadgeHtml = '';
            let badgeClass = 'px-2.5 py-1 text-xs bg-white dark:bg-slate-800/40 border border-gray-100 dark:border-slate-700/60 rounded-lg text-gray-700 dark:text-gray-300 flex items-center gap-1.5 shadow-sm select-none';
            
            if (weight > 1.01) {
                badgeClass = 'px-2.5 py-1 text-xs bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-lg text-amber-800 dark:text-amber-300 flex items-center gap-1.5 shadow-sm select-none';
                weightBadgeHtml = `<span class="text-[9px] bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.2 rounded font-bold font-mono">x${weight.toFixed(2)}</span>`;
            } else if (weight < 0.99) {
                badgeClass = 'px-2.5 py-1 text-xs bg-blue-50/50 dark:bg-slate-800/60 border border-blue-200/50 dark:border-slate-700/60 rounded-lg text-blue-800 dark:text-slate-400 flex items-center gap-1.5 shadow-sm select-none';
                weightBadgeHtml = `<span class="text-[9px] bg-blue-100 dark:bg-blue-950/50 px-1.5 py-0.2 rounded font-bold font-mono">x${weight.toFixed(2)}</span>`;
            }

            badge.className = badgeClass;
            badge.innerHTML = `
                <span class="font-mono text-gray-500 dark:text-gray-400">${item.clean}</span>
                <span class="text-gray-400 dark:text-slate-600">➔</span>
                <span class="font-medium">${item.cn}</span>
                ${weightBadgeHtml}
            `;
            this.translateListEl.appendChild(badge);
        });
    }
}

const engine = new ImageEngine();
const store = new GalleryStore();
const ui = new UIController();
const els = ui.els;

let currentInitImageBase64 = null;
let currentVibeImageBase64 = null;
let currentVibeIsJson = false;
let availableVibeEncodings = []; 
let currentImageId = null;
let currentImageData = null;
let showcaseData = [];
let currentGalleryTab = 'showcase';

function getVibeKey(key, model) {
    const m = model || document.getElementById('modelValue').value;
    return `${key}_${m}`;
}

function loadVibeState(model) {
    const savedVibeData = store.getSetting(getVibeKey('nai_vibe_image', model));
    const savedVibeIsJson = store.getSetting(getVibeKey('nai_vibe_is_json', model)) === 'true';
    const savedVibeEnabled = store.getSetting(getVibeKey('nai_vibe_enabled', model)) !== 'false';
    const savedVibeInfo = store.getSetting(getVibeKey('nai_vibe_info', model));
    const savedVibeStrength = store.getSetting(getVibeKey('nai_vibe_strength', model));
    const savedVibePreview = store.getSetting(getVibeKey('nai_vibe_preview', model));
    const savedVibeEncodings = store.getSetting(getVibeKey('nai_vibe_encodings', model));

    document.getElementById('vibeEnabled').checked = savedVibeEnabled;

    if (savedVibeData) {
        currentVibeImageBase64 = savedVibeData;
        currentVibeIsJson = savedVibeIsJson;
        if (savedVibeEncodings) {
            try {
                availableVibeEncodings = JSON.parse(savedVibeEncodings);
            } catch(e) {
                availableVibeEncodings = [];
            }
        } else {
            availableVibeEncodings = [];
        }
        
        const previewImg = document.getElementById('vibeImagePreview');
        if (savedVibePreview) {
            previewImg.src = savedVibePreview;
            if (savedVibePreview.includes('svg')) previewImg.classList.add('p-4');
            else previewImg.classList.remove('p-4');
        } else {
            // Legacy fallback
            if (currentVibeIsJson) {
                previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                previewImg.classList.add('p-4');
            } else {
                previewImg.src = 'data:image/jpeg;base64,' + savedVibeData;
                previewImg.classList.remove('p-4');
            }
        }
        
        previewImg.classList.remove('hidden');
        document.getElementById('vibeImagePlaceholder').classList.add('hidden');
        document.getElementById('clearVibeImageBtn').classList.remove('hidden');
        document.getElementById('vibeControls').classList.remove('hidden');
        
        updateVibeInfoUI(currentVibeIsJson);
        
        // Restore selection if multiple
        if (currentVibeIsJson && availableVibeEncodings.length > 1) {
            const savedIndex = store.getSetting(getVibeKey('nai_vibe_selected_index', model));
            if (savedIndex !== null) {
                document.getElementById('vibeInfoSelect').value = savedIndex;
                onVibeStrengthSelect(savedIndex);
            }
        } else if (!currentVibeIsJson && savedVibeInfo) {
            const slider = document.getElementById('vibeInfo');
            if (slider) {
                slider.value = savedVibeInfo;
            }
            document.getElementById('vibeInfoValue').textContent = parseFloat(savedVibeInfo || 1.0).toFixed(2);
        }
    } else {
        // Clear UI if no data for this model
        currentVibeImageBase64 = null;
        currentVibeIsJson = false;
        availableVibeEncodings = [];
        const previewImg = document.getElementById('vibeImagePreview');
        previewImg.src = '';
        previewImg.classList.add('hidden');
        document.getElementById('vibeImagePlaceholder').classList.remove('hidden');
        document.getElementById('clearVibeImageBtn').classList.add('hidden');
        document.getElementById('vibeControls').classList.add('hidden');
        updateVibeInfoUI(false);
    }
    
    if (savedVibeStrength) {
        document.getElementById('vibeStrength').value = savedVibeStrength;
        document.getElementById('vibeStrengthValue').textContent = parseFloat(savedVibeStrength).toFixed(2);
    } else {
        document.getElementById('vibeStrength').value = 0.6;
        document.getElementById('vibeStrengthValue').textContent = '0.60';
    }
    toggleVibeEnabled();
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

    // Restore bypass limits settings
    const savedBypass = store.getSetting('nai_bypass_limits') === 'true';
    const checkbox = document.getElementById('bypassLimitsEnabled');
    if (checkbox) {
        checkbox.checked = savedBypass;
        toggleBypassLimitsEnabled(savedBypass);
    }
} catch (e) {
    console.error("Initialization error (from cache):", e);
}

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

async function handleVibeImage(event) {
    const file = event.target.files[0];
    if (file) {
        try {
            const isJson = file.name.endsWith('.json') || file.name.endsWith('.nai4vibe') || file.type === 'application/json';
            currentVibeIsJson = isJson;
            availableVibeEncodings = [];

            if (isJson) {
                const text = await file.text();
                const obj = JSON.parse(text);
                
                // Handle multiple formats (single object, NAI export with 'images' array, etc.)
                const extractEncoding = (item) => {
                    if (!item || typeof item !== 'object') return null;
                    
                    // Try common image/latent field names
                    const img = item.image || item.latent || item.vibe_image || item.encoded_image;
                    
                    // Try common info/strength field names
                    let info = undefined;
                    if (item.params && item.params.information_extracted !== undefined) {
                        info = item.params.information_extracted;
                    } else {
                        info = item.information_extracted ?? item.info ?? item.strength ?? item.extract_strength;
                    }
                    
                    if (img && info !== undefined) {
                        return { base64: img, info: parseFloat(info) };
                    }
                    return null;
                };

                const items = [];
                if (Array.isArray(obj)) {
                    items.push(...obj);
                } else if (obj.images && Array.isArray(obj.images)) {
                    items.push(...obj.images);
                } else if (obj.encodings) {
                    // Official .nai4vibe format
                    const section = obj.encodings['v4-5full'] || obj.encodings['v4full'];
                    if (section) {
                        Object.values(section).forEach(item => {
                            if (item.encoding) {
                                let info = 0.35;
                                if (item.params && item.params.information_extracted !== undefined) {
                                    info = item.params.information_extracted;
                                }
                                availableVibeEncodings.push({ base64: item.encoding, info: parseFloat(info) });
                            }
                        });
                    }
                    // Also check the root object for a preview image
                    items.push(obj);
                } else {
                    items.push(obj);
                }

                items.forEach(item => {
                    const enc = extractEncoding(item);
                    if (enc) {
                        availableVibeEncodings.push(enc);
                    } else if (item.vibe && typeof item.vibe === 'object') {
                        // Try nested 'vibe' object
                        const nestedEnc = extractEncoding(item.vibe);
                        if (nestedEnc) availableVibeEncodings.push(nestedEnc);
                    }
                });

                if (availableVibeEncodings.length === 0) {
                    console.error("Vibe JSON structure unrecognized:", obj);
                    throw new Error("未在文件中找到有效的 Vibe 编码数据 (识别到的字段不全)");
                }

                // Use source image, thumbnail or root image for preview
                const firstItem = items[0];
                let sourceImg = obj.source_image || firstItem?.source_image || obj.thumbnail || firstItem?.thumbnail || obj.image || firstItem?.image;
                
                const previewImg = document.getElementById('vibeImagePreview');
                if (sourceImg && (sourceImg.startsWith('data:image') || sourceImg.length > 1000)) {
                     previewImg.src = sourceImg.startsWith('data:image') ? sourceImg : ('data:image/png;base64,' + sourceImg);
                     previewImg.classList.remove('p-4');
                } else {
                     previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                     previewImg.classList.add('p-4');
                }
                previewImg.classList.remove('hidden');
                
                updateVibeInfoUI(true);
            } else {
                const compressedDataUrl = await compressImage(file);
                currentVibeImageBase64 = compressedDataUrl.split(',')[1];
                document.getElementById('vibeImagePreview').src = compressedDataUrl;
                document.getElementById('vibeImagePreview').classList.remove('hidden', 'p-4');
                updateVibeInfoUI(false);
            }
            
            saveVibeState();
            document.getElementById('vibeImagePlaceholder').classList.add('hidden');
            document.getElementById('clearVibeImageBtn').classList.remove('hidden');
            document.getElementById('vibeControls').classList.remove('hidden');
            toggleVibeEnabled(); 
        } catch (e) {
            console.error("Failed to process vibe file", e);
            alert("文件处理失败: " + e.message);
        }
    }
}

function updateVibeInfoUI(isJson) {
    const container = document.getElementById('vibeInfoContainer');
    const infoVal = document.getElementById('vibeInfoValue');
    
    if (isJson && availableVibeEncodings.length > 0) {
        if (availableVibeEncodings.length === 1) {
            const enc = availableVibeEncodings[0];
            currentVibeImageBase64 = enc.base64;
            container.innerHTML = `<div class="text-[10px] text-gray-400 bg-gray-100 dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 italic">固定强度: ${enc.info.toFixed(2)} (已锁定)</div>`;
            infoVal.textContent = enc.info.toFixed(2);
        } else {
            // Create selector
            let html = `<select id="vibeInfoSelect" onchange="onVibeStrengthSelect(this.value)" class="art-input w-full px-3 py-2 rounded-xl text-xs font-medium outline-none shadow-sm appearance-none cursor-pointer text-gray-700 dark:text-gray-200">`;
            availableVibeEncodings.forEach((enc, index) => {
                html += `<option value="${index}">强度: ${enc.info.toFixed(2)}</option>`;
            });
            html += `</select>`;
            container.innerHTML = html;
            onVibeStrengthSelect(0);
        }
    } else {
        container.innerHTML = `<input type="range" id="vibeInfo" min="0.01" max="1.0" value="1.0" step="0.01" class="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer">`;
        const slider = document.getElementById('vibeInfo');
        slider.addEventListener('input', (e) => {
            infoVal.textContent = parseFloat(e.target.value).toFixed(2);
            store.setSetting(getVibeKey('nai_vibe_info'), e.target.value);
        });
        infoVal.textContent = parseFloat(slider.value).toFixed(2);
    }
}

window.onVibeStrengthSelect = function(index) {
    const enc = availableVibeEncodings[index];
    if (enc) {
        currentVibeImageBase64 = enc.base64;
        document.getElementById('vibeInfoValue').textContent = enc.info.toFixed(2);
        store.setSetting(getVibeKey('nai_vibe_selected_index'), index);
        store.setSetting(getVibeKey('nai_vibe_image'), currentVibeImageBase64);
    }
};

function saveVibeState() {
    store.setSetting(getVibeKey('nai_vibe_image'), currentVibeImageBase64);
    store.setSetting(getVibeKey('nai_vibe_is_json'), currentVibeIsJson.toString());
    store.setSetting(getVibeKey('nai_vibe_encodings'), JSON.stringify(availableVibeEncodings));
    store.setSetting(getVibeKey('nai_vibe_preview'), document.getElementById('vibeImagePreview').src);
}

function clearVibeImage() {
    currentVibeImageBase64 = null;
    currentVibeIsJson = false;
    availableVibeEncodings = [];
    store.setSetting(getVibeKey('nai_vibe_image'), '');
    store.setSetting(getVibeKey('nai_vibe_is_json'), 'false');
    store.setSetting(getVibeKey('nai_vibe_encodings'), '[]');
    store.setSetting(getVibeKey('nai_vibe_preview'), '');
    document.getElementById('vibeImageInput').value = '';
    document.getElementById('vibeImagePreview').src = '';
    document.getElementById('vibeImagePreview').classList.remove('p-4');
    document.getElementById('vibeImagePreview').classList.add('hidden');
    document.getElementById('vibeImagePlaceholder').classList.remove('hidden');
    document.getElementById('clearVibeImageBtn').classList.add('hidden');
    document.getElementById('vibeControls').classList.add('hidden');
    updateVibeInfoUI(false);
}

function toggleVibeEnabled() {
    const enabled = document.getElementById('vibeEnabled').checked;
    store.setSetting(getVibeKey('nai_vibe_enabled'), enabled.toString());
    const previewContainer = document.getElementById('vibeImagePreviewContainer');
    const controls = document.getElementById('vibeControls');
    if (enabled) {
        previewContainer.classList.remove('opacity-40', 'grayscale-[0.5]');
        if (currentVibeImageBase64) controls.classList.remove('hidden');
    } else {
        previewContainer.classList.add('opacity-40', 'grayscale-[0.5]');
        controls.classList.add('hidden');
    }
}

document.getElementById('strength')?.addEventListener('input', e => document.getElementById('strengthValue').textContent = e.target.value);
document.getElementById('noise')?.addEventListener('input', e => document.getElementById('noiseValue').textContent = e.target.value);
document.getElementById('vibeInfo')?.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('vibeInfoValue').textContent = parseFloat(val).toFixed(2);
    store.setSetting(getVibeKey('nai_vibe_info'), val);
});
document.getElementById('vibeStrength')?.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('vibeStrengthValue').textContent = parseFloat(val).toFixed(2);
    store.setSetting(getVibeKey('nai_vibe_strength'), val);
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
            userKey: store.getSetting('nai_user_key')
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
        
        const vibeEnabled = document.getElementById('vibeEnabled')?.checked;
        if (vibeEnabled && selectedVersion === 'v4.5' && currentVibeImageBase64 && !currentVibeIsJson) {
            alert("V4.5 模型氛围传输需要上传官方提取的 .nai4vibe 或 .json 编码文件。\n由于直接上传图片会重复消耗 Anlas 去编码，为了您的账号安全，请先在官方获取编码文件后再使用此功能。");
            ui.setLoading(false);
            ui.toggleMobileControls(true);
            return;
        }

        for (let i = 0; i < batchTotal; i++) {
            const statusText = batchTotal > 1 ? `生成中 (${i + 1}/${batchTotal})` : "生成中...";
            ui.setLoading(true, statusText);

            try {
                const nsEl = document.getElementById('noise_schedule');
                const params = {
                    version: selectedVersion,
                    prompt: promptText,
                    negative_prompt: els.negative.value.trim(),
                    width: w, height: h,
                    steps: parseInt(els.steps.value),
                    scale: parseFloat(els.scale.value),
                    sampler: els.sampler.value,
                    noise_schedule: nsEl ? nsEl.value : "exponential"
                };

                if (currentInitImageBase64) {
                    const strEl = document.getElementById('strength');
                    const noiEl = document.getElementById('noise');
                    params.image = currentInitImageBase64;
                    params.strength = strEl ? parseFloat(strEl.value) : 0.5;
                    params.noise = noiEl ? parseFloat(noiEl.value) : 0;
                }
                
                if (vibeEnabled && currentVibeImageBase64) {
                    params.vibe_image = currentVibeImageBase64;
                    const vibeInfoEl = document.getElementById('vibeInfo');
                    const vibeStrengthEl = document.getElementById('vibeStrength');
                    params.vibe_info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : parseFloat(document.getElementById('vibeInfoValue')?.textContent || "1.0");
                    params.vibe_strength = vibeStrengthEl ? parseFloat(vibeStrengthEl.value) : 0.6;
                }

                // 为每个 API 实例生成独立的随机 seed，避免多 API 产生的图片完全相同
                const localParamsList = auths.map(() => {
                    return {
                        ...params,
                        seed: Math.floor(Math.random() * 4294967295)
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
        const a = document.createElement('a');
        a.href = url;
        const isJpeg = url.startsWith('data:image/jpeg');
        a.download = `novelai-gen-${Date.now()}.${isJpeg ? 'jpg' : 'png'}`;
        a.click();
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
    if (!currentImageData || !currentImageData.imageUrl) return;
    
    const authBase = {
        adminToken: store.getSetting('nai_admin_token'),
        userKey: store.getSetting('nai_user_key')
    };
    const customApiKeyRaw = store.getSetting('nai_custom_api_key');
    const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
    const auth = customApiKeys.length > 0 
        ? { ...authBase, customApiKey: customApiKeys[0] } 
        : { ...authBase, customApiKey: "" };

    ui.setLoading(true, "处理中...");
    try {
        // Fetch the current image to convert it to base64
        const response = await fetch(currentImageData.imageUrl);
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
    currentImageData = item;
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
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `history_${Date.now()}.zip`;
        a.click();
    } catch (e) {
        console.error("Failed to generate zip", e);
    }
}

// --- 暴露给 Window 的代理方法 ---
Object.assign(window, {
    toggleMobileControls: (s) => ui.toggleMobileControls(s),
    setModel: (v) => {
        ui.setModel(v);
        store.setSetting('nai_model_version', v);
        loadVibeState(v);
    },
    switchRightView: (v) => ui.switchRightView(v, (tab) => switchGalleryTab(tab)),
    toggleDrawer: () => ui.toggleDrawer(),
    switchDrawerTab: (t) => ui.switchDrawerTab(t, () => renderPresets(document.getElementById('modelValue').value)),
    openPresets: () => ui.openPresets(() => renderPresets(document.getElementById('modelValue').value)),
    handleInitImage, clearInitImage, doGenerate, useCurrentPrompt,
    handleVibeImage, clearVibeImage,
    deleteCurrentImage, clearAllHistory, switchGalleryTab, downloadZip,
    backToGrid: () => ui.showGrid(),
    doAugment, toggleToolbox, toggleVibeEnabled
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

// --- 预设与搜词 ---
const presetFiles = [
    { id: '1_v3', model: 'v3', name: '未知' }, { id: '2_v3', model: 'v3', name: '未知' },
    { id: '1_v4.5', model: 'v4.5', name: '铃兰' }, { id: '2_v4.5', model: 'v4.5', name: '未知' }
];
function renderPresets(model) {
    const active = "px-3 py-1 rounded-full text-[10px] font-bold transition-all border bg-gray-900 text-white dark:bg-slate-100 dark:text-gray-900 border-transparent shadow-md";
    const inactive = "px-3 py-1 rounded-full text-[10px] font-bold transition-all border bg-white text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-gray-700";

    if (model === 'v3') { els.btnPreV3.className = active; els.btnPreV4.className = inactive; }
    else { els.btnPreV3.className = inactive; els.btnPreV4.className = active; }

    els.presetGrid.innerHTML = '';
    const filtered = presetFiles.filter(p => p.model === model);
    if (filtered.length === 0) { els.presetGrid.innerHTML = '<div class="col-span-2 text-center text-xs text-gray-400">暂无预设</div>'; return; }
    filtered.forEach(p => {
        const d = document.createElement('div');
        d.className = "group cursor-pointer flex flex-col gap-2";
        d.innerHTML = `<div class="aspect-[2/3] w-full rounded-lg bg-gray-100 dark:bg-slate-700 relative overflow-hidden group-hover:shadow-lg transition-all"><img src="presets/${p.id}.png" class="w-full h-full object-cover"></div><span class="text-xs text-center text-gray-500 dark:text-gray-400">${p.name}</span>`;
        d.onclick = async () => {
            try {
                const res = await fetch(`presets/${p.id}.txt`);
                if (res.ok) {
                    els.prompt.value = (await res.text()).trim();
                    els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
                    setModel(model);
                    ui.toggleMobileControls(true);
                    if (window.innerWidth < 768) toggleDrawer();
                }
            } catch (e) { }
        };
        els.presetGrid.appendChild(d);
    });
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
                                    promptHelper.tagData = freshData;
                                    promptHelper.tagArray = Object.entries(freshData); // 同步更新 entries 缓存
                                    promptHelper.updateTranslations();
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
            promptHelper = new PromptHelper(els.prompt, tagData);
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

function toggleLowPerf() {
    const html = document.documentElement;
    const enabled = !html.classList.contains('low-perf');
    
    if (enabled) {
        html.classList.add('low-perf');
        store.setSetting('low_perf', 'true');
        window.showToast("已开启低性能模式 (无动画与模糊)", "success");
    } else {
        html.classList.remove('low-perf');
        store.setSetting('low_perf', 'false');
        window.showToast("已恢复高性能视觉模式", "success");
    }
    updateLowPerfUI(enabled);
}
function enterAdminToken() {
    openModal('adminTokenModal');
    const cur = localStorage.getItem('nai_admin_token');
    const input = document.getElementById('adminTokenInput');
    const clearBtn = document.getElementById('adminTokenClearBtn');
    const statusEl = document.getElementById('adminTokenStatus');
    statusEl.classList.add('hidden');
    if (cur) {
        input.value = cur;
        clearBtn.classList.remove('hidden');
    } else {
        input.value = '';
        clearBtn.classList.add('hidden');
    }
}
function closeAdminTokenModal() {
    closeModal('adminTokenModal');
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
    statusEl.innerHTML = '<span class="text-green-500">✔ 密码已保存</span>';
    statusEl.classList.remove('hidden');
    checkAdminStatus();
    setTimeout(() => closeAdminTokenModal(), 1000);
}
function clearAdminToken() {
    localStorage.removeItem('nai_admin_token');
    document.getElementById('adminTokenInput').value = '';
    document.getElementById('adminTokenClearBtn').classList.add('hidden');
    const statusEl = document.getElementById('adminTokenStatus');
    statusEl.innerHTML = '<span class="text-green-500">✔ 已注销管理员身份</span>';
    statusEl.classList.remove('hidden');
    checkAdminStatus();
    setTimeout(() => closeAdminTokenModal(), 1000);
}

function enterUserKey() {
    openModal('userKeyModal');
    const cur = localStorage.getItem('nai_user_key');
    const input = document.getElementById('userKeyInput');
    const clearBtn = document.getElementById('userKeyClearBtn');
    const statusEl = document.getElementById('userKeyStatus');
    statusEl.classList.add('hidden');
    if (cur) {
        input.value = cur;
        clearBtn.classList.remove('hidden');
    } else {
        input.value = '';
        clearBtn.classList.add('hidden');
    }
}
function closeUserKeyModal() {
    closeModal('userKeyModal');
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
    setTimeout(() => closeUserKeyModal(), 1000);
}
function clearUserKey() {
    localStorage.removeItem('nai_user_key');
    document.getElementById('userKeyInput').value = '';
    document.getElementById('userKeyClearBtn').classList.add('hidden');
    const statusEl = document.getElementById('userKeyStatus');
    statusEl.innerHTML = '<span class="text-green-500">✔ 已注销卡密</span>';
    statusEl.classList.remove('hidden');
    setTimeout(() => closeUserKeyModal(), 1000);
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

    // 显示/隐藏解除限制开关
    const bypassContainer = document.getElementById('bypassLimitsContainer');
    if (bypassContainer) {
        if (isAdmin) {
            bypassContainer.classList.remove('hidden');
        } else {
            bypassContainer.classList.add('hidden');
            const checkbox = document.getElementById('bypassLimitsEnabled');
            if (checkbox && checkbox.checked) {
                checkbox.checked = false;
                toggleBypassLimitsEnabled(false);
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
    div.className = 'flex gap-2 items-center api-key-row group';
    div.innerHTML = `
        <input type="text" value="${val}" placeholder="pst-xxxxxxxxxxxxxxxx..." class="art-input flex-1 px-4 py-3 rounded-xl text-xs outline-none font-mono tracking-tight" />
        <button onclick="removeApiKeyInputRow(this)" class="p-3 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400 hover:text-red-500 rounded-xl transition-all" title="删除">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </button>
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

function enterCustomApiKey() {
    openModal('apiKeyModal');
    const container = document.getElementById('apiKeyList');
    if (container) container.innerHTML = '';
    
    const cur = localStorage.getItem('nai_custom_api_key');
    const clearBtn = document.getElementById('apiKeyClearBtn');
    const statusEl = document.getElementById('apiKeyStatus');
    statusEl.classList.add('hidden');
    
    if (cur) {
        const keys = cur.split(/[\n,]/).map(k => k.trim()).filter(k => k);
        keys.forEach(k => addApiKeyInputRow(k));
        clearBtn.classList.remove('hidden');
    } else {
        addApiKeyInputRow();
        clearBtn.classList.add('hidden');
    }
}

function closeApiKeyModal() {
    closeModal('apiKeyModal');
}

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
                    setTimeout(() => closeApiKeyModal(), 1500);
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
            setTimeout(() => closeApiKeyModal(), 1500);
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
    }
    
    setModel(item.model || 'v3');
    window.showToast("生成参数已载入主控制台！", "success");
    closeLightbox();
    ui.toggleMobileControls(true);
}

function lightboxDownload() {
    if (lightboxItems.length === 0) return;
    const item = lightboxItems[lightboxIndex];
    const a = document.createElement('a');
    a.href = item.image;
    a.download = `novelai-${item.id || Date.now()}.png`;
    a.click();
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
    
    const imgUrl = item.image || item.imageUrl;
    if (imgUrl) {
        ui.showResultImage(imgUrl);
    }
    
    currentImageId = item.id;
    currentImageData = item;
    window.lastSelectedImageUrl = imgUrl;
    ui.showImageActions(true);

    if (type === 'inpaint') {
        inpaintEditor.open();
    } else if (type === 'outpaint') {
        outpaintEditor.open();
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
    enterAdminToken, enterUserKey, toggleTheme, renderPresets,
    openLightbox, closeLightbox, prevLightboxImage, nextLightboxImage,
    copyLightboxText, lightboxApplyParams, lightboxDownload, lightboxDelete,
    lightboxCreate, toggleLightboxSidebarMobile,
    saveAdminToken, closeAdminTokenModal, clearAdminToken,
    saveUserKey, closeUserKeyModal, clearUserKey,
    addApiKeyInputRow, removeApiKeyInputRow, toggleLowPerf, toggleBypassLimitsEnabled
});
