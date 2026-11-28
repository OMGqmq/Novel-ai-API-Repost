import { updateRangeProgress } from './ux-enhancements.js';
import * as motionMod from './motion-controller.js';

const STANDARD_CANVASES = [[1024, 1536], [1536, 1024], [1472, 1472]];
const V45_MODES = [
    { value: 'character', label: '角色' },
    { value: 'character&style', label: '角色+画风' },
    { value: 'style', label: '画风' }
];
const V5_MODES = [
    { value: 'character', label: '角色' },
    { value: 'character&style', label: '角色+画风' },
    { value: 'style', label: '画风' },
    { value: 'outfit', label: '服装' }
];

function getMotionController() {
    return motionMod.motionController || (typeof window !== 'undefined' ? window.motionController : null);
}

function showControlBlock(el) {
    if (!el) return;
    const mc = getMotionController();
    if (mc && typeof mc.enter === 'function') {
        mc.enter(el);
    } else {
        el.classList.remove('hidden');
    }
}

function hideControlBlock(el) {
    if (!el) return;
    const mc = getMotionController();
    if (mc && typeof mc.exit === 'function' && typeof el.getAnimations === 'function') {
        mc.exit(el);
    } else {
        el.classList.add('hidden');
    }
}

function stripDataUriPrefix(val) {
    if (typeof val !== 'string') return val;
    return val.replace(/^data:image\/[^;]+;base64,/, '').trim();
}

function toPreviewDataUrl(val) {
    if (!val || typeof val !== 'string') return '';
    if (val.startsWith('data:')) return val;
    if (val.startsWith('iVBORw')) return 'data:image/png;base64,' + val;
    if (val.startsWith('/9j/')) return 'data:image/jpeg;base64,' + val;
    return 'data:image/png;base64,' + val;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function processImageToPng(source) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            // 1. 寻找最贴合比例的官方三大标准分辨率之一
            const hasValidDims = img.width > 0 && img.height > 0;
            const imgRatio = hasValidDims ? (img.width / img.height) : 1;
            let targetSize = STANDARD_CANVASES[0];
            if (hasValidDims) {
                for (const t of STANDARD_CANVASES) {
                    if (Math.abs(t[0] / t[1] - imgRatio) < Math.abs(targetSize[0] / targetSize[1] - imgRatio)) {
                        targetSize = t;
                    }
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetSize[0];
            canvas.height = targetSize[1];
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Could not get 2d context from canvas"));
                return;
            }

            // 填充纯黑色背景，避免透明通道和 NAI 网关对非 RGB 格式的报错
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let drawW = 0;
            let drawH = 0;
            if (hasValidDims) {
                const canvasRatio = canvas.width / canvas.height;
                if (imgRatio > canvasRatio) {
                    drawW = canvas.width;
                    drawH = Math.round(canvas.width / imgRatio);
                } else {
                    drawH = canvas.height;
                    drawW = Math.round(canvas.height * imgRatio);
                }
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const offsetX = (canvas.width - drawW) / 2;
            const offsetY = (canvas.height - drawH) / 2;
            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;

        if (typeof File !== 'undefined' && source instanceof File || typeof Blob !== 'undefined' && source instanceof Blob) {
            const reader = new FileReader();
            reader.onload = function(e) {
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(source);
        } else if (typeof source === 'string') {
            if (source.startsWith('data:')) {
                img.src = source;
            } else if (source.startsWith('iVBORw')) {
                img.src = 'data:image/png;base64,' + source;
            } else {
                img.src = 'data:image/jpeg;base64,' + source;
            }
        } else {
            reject(new Error("Unsupported source type for processImageToPng"));
        }
    });
}

export class CharRefManager {
    constructor(config = {}) {
        this.store = config.store;
        this.compressImage = config.compressImage;
        this.onShowToast = config.onShowToast || (() => {});
        this.currentModel = 'v4.5';
        this.itemsByModel = {};
        this._quotaOverflowModels = new Set();
        this._idSeq = 0;
    }

    _getBucketKey(model = this.currentModel) {
        if (model === 'v5') return 'v5';
        if (model === 'v4.5') return 'v4.5';
        return String(model || 'v4.5');
    }

    get charRefItems() {
        const key = this._getBucketKey(this.currentModel);
        if (!this.itemsByModel[key]) {
            this.itemsByModel[key] = [];
        }
        return this.itemsByModel[key];
    }

    set charRefItems(items) {
        const key = this._getBucketKey(this.currentModel);
        this.itemsByModel[key] = Array.isArray(items) ? items : [];
    }

    get currentCharRefImageBase64() {
        return this.charRefItems[0]?.imageBase64 || null;
    }

    set currentCharRefImageBase64(val) {
        if (!val) {
            this.charRefItems = [];
            return;
        }
        const items = this.charRefItems;
        if (items.length === 0) {
            items.push(this._createItem({ imageBase64: val }, this.currentModel));
        } else {
            items[0].imageBase64 = val;
        }
    }

    getCharRefKey(key, model) {
        if (model === 'v4.5') return key + '_v4';
        if (model === 'v5') return key + '_v5';
        return key;
    }

    _normalizeMode(mode, model = this.currentModel) {
        let raw = typeof mode === 'string' ? mode.trim() : 'character&style';
        if (raw === 'character_mainoutfit') raw = 'character';
        if (raw === 'character&style_mainoutfit') raw = 'character&style';

        const allowed = model === 'v5'
            ? ['character', 'character&style', 'style', 'outfit']
            : ['character', 'character&style', 'style'];
        return allowed.includes(raw) ? raw : 'character&style';
    }

    _clampStrength(val, model = this.currentModel) {
        const num = parseFloat(val);
        const max = model === 'v5' ? 5.0 : 1.0;
        if (!Number.isFinite(num)) return 1.0;
        return round2(Math.max(0.0, Math.min(max, num)));
    }

    _clampFidelity(val) {
        const num = parseFloat(val);
        if (!Number.isFinite(num)) return 0.8;
        return round2(Math.max(0.0, Math.min(1.0, num)));
    }

    _createItem(partial = {}, model = this.currentModel) {
        const rawMax = model === 'v5' ? 5.0 : 1.0;
        const parsedStr = parseFloat(partial.strength);
        const strength = Number.isFinite(parsedStr) ? round2(Math.max(0.0, Math.min(rawMax, parsedStr))) : 1.0;
        return {
            id: partial.id || `cr_${++this._idSeq}`,
            imageBase64: partial.imageBase64 || '',
            mode: this._normalizeMode(partial.mode, model),
            strength,
            fidelity: this._clampFidelity(partial.fidelity),
            enabled: partial.enabled !== false
        };
    }

    _verifyAndNormalizeItemPng(item, model) {
        if (!item || !item.imageBase64 || typeof Image === 'undefined') return;
        const raw = item.imageBase64;
        const img = new Image();
        img.onload = () => {
            const isCorrectSize = STANDARD_CANVASES.some(t => t[0] === img.width && t[1] === img.height);
            const clean = stripDataUriPrefix(raw);
            const isPng = typeof clean === 'string' && clean.startsWith('iVBORw');

            if (isCorrectSize && isPng) {
                item.imageBase64 = clean;
                this.renderList(model);
            } else {
                processImageToPng(raw).then(pngDataUrl => {
                    item.imageBase64 = pngDataUrl.split(',')[1];
                    this.saveState(model);
                    this.renderList(model);
                }).catch(err => {
                    console.error("历史缓存角色参考图转换失败:", err);
                });
            }
        };
        img.onerror = () => {
            console.error("加载历史缓存的角色参考图失败");
        };
        img.src = toPreviewDataUrl(raw);
    }

    loadState(model) {
        const targetModel = model || this.currentModel || 'v4.5';
        this.currentModel = targetModel;
        const bucketKey = this._getBucketKey(targetModel);

        const savedEnabled = this.store?.getSetting?.(this.getCharRefKey('nai_char_ref_enabled', targetModel)) !== 'false';
        const enabledCheckbox = document.getElementById('charRefEnabled');
        if (enabledCheckbox) {
            enabledCheckbox.checked = savedEnabled;
            enabledCheckbox.setAttribute?.('aria-checked', savedEnabled ? 'true' : 'false');
        }

        const savedItemsRaw = this.store?.getSetting?.(this.getCharRefKey('nai_char_ref_items', targetModel));
        const savedData = this.store?.getSetting?.(this.getCharRefKey('nai_char_ref_image', targetModel));
        const savedStrength = this.store?.getSetting?.(this.getCharRefKey('nai_char_ref_strength', targetModel));
        const savedFidelity = this.store?.getSetting?.(this.getCharRefKey('nai_char_ref_fidelity', targetModel));
        const savedMode = this.store?.getSetting?.(this.getCharRefKey('nai_char_ref_mode', targetModel));

        let loadedItems = null;
        if (savedItemsRaw) {
            try {
                const parsed = JSON.parse(savedItemsRaw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    loadedItems = parsed
                        .filter(it => it && it.imageBase64)
                        .map(it => this._createItem(it, targetModel));
                }
            } catch (err) {
                console.warn('解析角色参考图列表失败，尝试回退单图缓存:', err);
            }
        }

        if (!loadedItems && savedData) {
            loadedItems = [
                this._createItem({
                    imageBase64: savedData,
                    mode: savedMode || 'character&style',
                    strength: savedStrength || 1.0,
                    fidelity: savedFidelity || 0.8,
                    enabled: true
                }, targetModel)
            ];
        }

        if (loadedItems && loadedItems.length > 0) {
            this.itemsByModel[bucketKey] = loadedItems;
            loadedItems.forEach(item => this._verifyAndNormalizeItemPng(item, targetModel));
            this.renderList(targetModel);
        } else if (this._quotaOverflowModels.has(bucketKey) && (this.itemsByModel[bucketKey]?.length || 0) > 0) {
            this.renderList(targetModel);
        } else {
            this.itemsByModel[bucketKey] = [];
            this.clearCharRefImage(targetModel, { skipSave: !savedData && !savedItemsRaw });
        }

        this.toggleCharRefEnabled(targetModel);
    }

    syncModelUI(model) {
        if (!model) return;
        this.currentModel = model;
        this.renderList(model);
        this.toggleCharRefEnabled(model);
    }

    saveState(model = this.currentModel) {
        if (!this.store || typeof this.store.setSetting !== 'function') return;
        const targetModel = model || this.currentModel || 'v4.5';
        const bucketKey = this._getBucketKey(targetModel);
        const items = this.itemsByModel[bucketKey] || [];
        const first = items[0];

        const enabledChecked = document.getElementById('charRefEnabled')?.checked;
        const enabledStr = typeof enabledChecked === 'boolean' ? enabledChecked.toString() : 'false';

        try {
            this.store.setSetting(this.getCharRefKey('nai_char_ref_enabled', targetModel), enabledStr);
            this.store.setSetting(
                this.getCharRefKey('nai_char_ref_mode', targetModel),
                first ? first.mode : (document.getElementById('charRefMode')?.value || 'character&style')
            );
            this.store.setSetting(
                this.getCharRefKey('nai_char_ref_strength', targetModel),
                first ? first.strength.toFixed(2) : (document.getElementById('charRefStrength')?.value || '1.00')
            );
            this.store.setSetting(
                this.getCharRefKey('nai_char_ref_fidelity', targetModel),
                first ? first.fidelity.toFixed(2) : (document.getElementById('charRefFidelity')?.value || '0.80')
            );

            if (items.length === 0) {
                this.store.setSetting(this.getCharRefKey('nai_char_ref_items', targetModel), '');
                this.store.setSetting(this.getCharRefKey('nai_char_ref_image', targetModel), '');
                this._quotaOverflowModels.delete(bucketKey);
            } else if (items.length === 1) {
                // Single item uses legacy key only so storage footprint stays half size
                this.store.setSetting(this.getCharRefKey('nai_char_ref_items', targetModel), '');
                this.store.setSetting(this.getCharRefKey('nai_char_ref_image', targetModel), first.imageBase64 || '');
                this._quotaOverflowModels.delete(bucketKey);
            } else {
                this.store.setSetting(this.getCharRefKey('nai_char_ref_image', targetModel), '');
                this.store.setSetting(this.getCharRefKey('nai_char_ref_items', targetModel), JSON.stringify(items));
                this._quotaOverflowModels.delete(bucketKey);
            }
        } catch (err) {
            this._quotaOverflowModels.add(bucketKey);
            console.warn('角色参考图超出浏览器本地存储上限，仅在本会话内存中保留:', err);
        }
    }

    clearCharRefImage(model = this.currentModel, options = {}) {
        const targetModel = model || this.currentModel || 'v4.5';
        const bucketKey = this._getBucketKey(targetModel);
        this.itemsByModel[bucketKey] = [];
        this._quotaOverflowModels.delete(bucketKey);

        if (!options.skipSave && this.store?.setSetting) {
            try {
                this.store.setSetting(this.getCharRefKey('nai_char_ref_items', targetModel), '');
                this.store.setSetting(this.getCharRefKey('nai_char_ref_image', targetModel), '');
            } catch (err) {
                console.warn('清空参考图缓存失败:', err);
            }
        }

        const input = document.getElementById('charRefImageInput');
        if (input) input.value = '';

        this.renderList(targetModel);
        if (typeof window !== 'undefined' && window.ui?.updateGenerateButtonText) {
            window.ui.updateGenerateButtonText();
        }
    }

    removeItem(index, model = this.currentModel) {
        const bucketKey = this._getBucketKey(model);
        const items = this.itemsByModel[bucketKey] || [];
        if (index < 0 || index >= items.length) return;
        items.splice(index, 1);
        this.saveState(model);
        this.renderList(model);
        if (typeof window !== 'undefined' && window.ui?.updateGenerateButtonText) {
            window.ui.updateGenerateButtonText();
        }
    }

    async handleCharRefImage(event, model = this.currentModel) {
        const files = Array.from(event?.target?.files || []);
        if (files.length === 0) return;

        const targetModel = model || this.currentModel || 'v4.5';
        const bucketKey = this._getBucketKey(targetModel);
        const currentList = this.itemsByModel[bucketKey] || (this.itemsByModel[bucketKey] = []);
        const wasEmpty = currentList.length === 0;

        let addedCount = 0;
        let lastErr = null;

        for (const file of files) {
            try {
                const pngDataUrl = await processImageToPng(file);
                const base64 = pngDataUrl.split(',')[1];
                currentList.push(this._createItem({
                    imageBase64: base64,
                    mode: 'character&style',
                    strength: 1.0,
                    fidelity: 0.8,
                    enabled: true
                }, targetModel));
                addedCount++;
            } catch (err) {
                lastErr = err;
            }
        }

        if (event?.target) {
            try { event.target.value = ''; } catch (_) {}
        }

        if (addedCount > 0) {
            if (wasEmpty) {
                const enabledCheckbox = document.getElementById('charRefEnabled');
                if (enabledCheckbox) {
                    enabledCheckbox.checked = true;
                    enabledCheckbox.setAttribute?.('aria-checked', 'true');
                }
            }
            this.saveState(targetModel);
            this.renderList(targetModel);
            this.toggleCharRefEnabled(targetModel);
            if (typeof window !== 'undefined' && window.ui?.updateGenerateButtonText) {
                window.ui.updateGenerateButtonText();
            }
            this.onShowToast(addedCount > 1 ? `已添加 ${addedCount} 张参考图` : '角色参考图加载成功');
        } else if (lastErr) {
            this.onShowToast('读取角色参考图失败: ' + lastErr.message, 'error');
            if (wasEmpty) this.clearCharRefImage(targetModel);
        }
    }

    renderList(model = this.currentModel) {
        const targetModel = model || this.currentModel || 'v4.5';
        const bucketKey = this._getBucketKey(targetModel);
        const items = this.itemsByModel[bucketKey] || [];
        const listEl = document.getElementById('charRefListContainer');
        const previewContainer = document.getElementById('charRefImagePreviewContainer');
        const previewImg = document.getElementById('charRefImagePreview');
        const placeholder = document.getElementById('charRefImagePlaceholder');
        const clearBtn = document.getElementById('clearCharRefImageBtn');
        const controls = document.getElementById('charRefControls');
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const isMasterEnabled = enabledCheckbox ? enabledCheckbox.checked : false;

        this._updateCostBadge(targetModel, items, isMasterEnabled);

        // Fallback for unit tests with minimal legacy single-item DOM mocks
        if (!listEl) {
            const first = items[0];
            if (first && first.imageBase64) {
                if (previewImg) {
                    previewImg.src = toPreviewDataUrl(first.imageBase64);
                    previewImg.classList.remove('hidden');
                }
                if (placeholder) placeholder.classList.add('hidden');
                if (clearBtn && isMasterEnabled) clearBtn.classList.remove('hidden');
                showControlBlock(controls);

                const strEl = document.getElementById('charRefStrength');
                if (strEl) {
                    strEl.value = this._clampStrength(first.strength, targetModel).toFixed(2);
                    if (strEl.style?.setProperty) updateRangeProgress(strEl);
                    const strValEl = document.getElementById('charRefStrengthValue');
                    if (strValEl) strValEl.textContent = parseFloat(strEl.value).toFixed(2);
                }
                const fidEl = document.getElementById('charRefFidelity');
                if (fidEl) {
                    fidEl.value = this._clampFidelity(first.fidelity).toFixed(2);
                    if (fidEl.style?.setProperty) updateRangeProgress(fidEl);
                    const fidValEl = document.getElementById('charRefFidelityValue');
                    if (fidValEl) fidValEl.textContent = parseFloat(fidEl.value).toFixed(2);
                }
                const modeEl = document.getElementById('charRefMode');
                if (modeEl) modeEl.value = this._normalizeMode(first.mode, targetModel);
            } else {
                if (previewImg) {
                    previewImg.src = '';
                    previewImg.classList.add('hidden');
                }
                if (placeholder) placeholder.classList.remove('hidden');
                if (clearBtn) clearBtn.classList.add('hidden');
                hideControlBlock(controls);
            }
            return;
        }

        if (items.length === 0) {
            if (previewContainer) previewContainer.classList.remove('hidden');
            if (previewImg) {
                previewImg.src = '';
                previewImg.classList.add('hidden');
            }
            if (placeholder) placeholder.classList.remove('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
            listEl.classList.add('hidden');
            if (typeof listEl.replaceChildren === 'function') listEl.replaceChildren();
            else listEl.innerHTML = '';
            return;
        }

        if (previewContainer) previewContainer.classList.add('hidden');
        if (clearBtn) {
            if (isMasterEnabled) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }
        listEl.classList.remove('hidden');

        if (typeof document.createElement !== 'function') return;

        const isV5 = targetModel === 'v5';
        const modes = isV5 ? V5_MODES : V45_MODES;
        const fragment = typeof document.createDocumentFragment === 'function' ? document.createDocumentFragment() : null;
        const nodes = [];

        items.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'studio-card border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-2.5 bg-slate-50/70 dark:bg-slate-900/40 space-y-2.5 transition-opacity duration-200';
            card.dataset.charRefIndex = String(idx);
            if (!item.enabled) card.classList.add('opacity-60');

            // Top Row: thumbnail + title + item switch + remove button
            const topRow = document.createElement('div');
            topRow.className = 'flex items-center justify-between gap-2';

            const leftInfo = document.createElement('div');
            leftInfo.className = 'flex items-center gap-2 min-w-0';

            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'w-11 h-11 rounded-lg overflow-hidden bg-black border border-slate-200/80 dark:border-slate-700/80 shrink-0 flex items-center justify-center';
            const thumb = document.createElement('img');
            thumb.src = toPreviewDataUrl(item.imageBase64);
            thumb.alt = `参考图 ${idx + 1}`;
            thumb.className = 'w-full h-full object-contain';
            thumbWrap.appendChild(thumb);

            const titleCol = document.createElement('div');
            titleCol.className = 'min-w-0';
            const titleEl = document.createElement('div');
            titleEl.className = 'text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate';
            titleEl.textContent = `参考图 #${idx + 1}`;
            const subEl = document.createElement('div');
            subEl.className = 'text-[9px] text-slate-500 dark:text-slate-400 tabular-nums';
            subEl.textContent = item.enabled ? '5 Anlas · 参与生成' : '已暂停';
            titleCol.appendChild(titleEl);
            titleCol.appendChild(subEl);

            leftInfo.appendChild(thumbWrap);
            leftInfo.appendChild(titleCol);

            const rightActions = document.createElement('div');
            rightActions.className = 'flex items-center gap-1.5 shrink-0';

            const itemToggleLabel = document.createElement('label');
            itemToggleLabel.className = 'relative inline-flex items-center cursor-pointer shrink-0';
            const itemToggleInput = document.createElement('input');
            itemToggleInput.type = 'checkbox';
            itemToggleInput.checked = item.enabled;
            itemToggleInput.setAttribute('role', 'switch');
            itemToggleInput.setAttribute('aria-checked', item.enabled ? 'true' : 'false');
            itemToggleInput.setAttribute('aria-label', `启用参考图 ${idx + 1}`);
            itemToggleInput.className = 'sr-only peer';
            itemToggleInput.addEventListener('change', (e) => {
                item.enabled = Boolean(e.target.checked);
                itemToggleInput.setAttribute('aria-checked', item.enabled ? 'true' : 'false');
                this.saveState(targetModel);
                this.renderList(targetModel);
                if (typeof window !== 'undefined' && window.ui?.updateGenerateButtonText) {
                    window.ui.updateGenerateButtonText();
                }
            });
            const itemToggleTrack = document.createElement('div');
            itemToggleTrack.className = "relative shrink-0 w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-transform peer-checked:bg-slate-900 dark:peer-checked:bg-white dark:peer-checked:after:bg-slate-900";
            itemToggleLabel.appendChild(itemToggleInput);
            itemToggleLabel.appendChild(itemToggleTrack);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'studio-icon-btn w-6 h-6 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer flex items-center justify-center';
            removeBtn.setAttribute('aria-label', `移除参考图 ${idx + 1}`);
            removeBtn.title = `移除参考图 ${idx + 1}`;
            removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
            removeBtn.addEventListener('click', () => this.removeItem(idx, targetModel));

            rightActions.appendChild(itemToggleLabel);
            rightActions.appendChild(removeBtn);

            topRow.appendChild(leftInfo);
            topRow.appendChild(rightActions);
            card.appendChild(topRow);

            // Mode Radio Fieldset (2-4 mutually exclusive choices rendered as visible radio pills)
            const effectiveMode = this._normalizeMode(item.mode, targetModel);
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'space-y-1 border-0 p-0 m-0';
            const legend = document.createElement('legend');
            legend.className = 'sr-only';
            legend.textContent = `参考图 ${idx + 1} 模式`;
            fieldset.appendChild(legend);

            const modeGroup = document.createElement('div');
            modeGroup.className = 'char-ref-mode-group';
            modes.forEach((opt) => {
                const radioId = `charRefMode_${item.id}_${opt.value.replace(/[^a-z0-9]/gi, '_')}`;
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.id = radioId;
                radio.name = `charRefMode_${item.id}`;
                radio.value = opt.value;
                radio.checked = effectiveMode === opt.value;
                radio.className = 'sr-only char-ref-mode-radio';
                radio.addEventListener('change', () => {
                    if (radio.checked) {
                        item.mode = opt.value;
                        this.saveState(targetModel);
                    }
                });

                const lbl = document.createElement('label');
                lbl.setAttribute('for', radioId);
                lbl.className = 'char-ref-mode-label';
                lbl.textContent = opt.label;

                modeGroup.appendChild(radio);
                modeGroup.appendChild(lbl);
            });
            fieldset.appendChild(modeGroup);
            card.appendChild(fieldset);

            // Strength Slider
            const displayStr = this._clampStrength(item.strength, targetModel);
            const strWrap = document.createElement('div');
            strWrap.className = 'space-y-1.5';
            const strHeader = document.createElement('div');
            strHeader.className = 'flex justify-between text-[11px] px-0.5';
            const strLabel = document.createElement('label');
            const strId = `charRefStr_${item.id}`;
            strLabel.setAttribute('for', strId);
            strLabel.className = 'text-slate-600 dark:text-slate-400';
            strLabel.textContent = '参考强度 (Strength)';
            const strValSpan = document.createElement('span');
            strValSpan.className = 'font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums';
            strValSpan.textContent = displayStr.toFixed(2);
            strHeader.appendChild(strLabel);
            strHeader.appendChild(strValSpan);

            const strSlider = document.createElement('input');
            strSlider.type = 'range';
            strSlider.id = strId;
            strSlider.min = '0.00';
            strSlider.max = isV5 ? '5.00' : '1.00';
            strSlider.step = '0.01';
            strSlider.value = displayStr.toFixed(2);
            strSlider.className = 'enhanced-range w-full rounded-full appearance-none cursor-pointer';
            strSlider.setAttribute('aria-valuetext', displayStr.toFixed(2));
            if (strSlider.dataset) strSlider.dataset.defaultValue = '1.00';
            updateRangeProgress(strSlider);
            strSlider.addEventListener('input', (e) => {
                const v = this._clampStrength(e.target.value, targetModel);
                item.strength = v;
                strValSpan.textContent = v.toFixed(2);
                strSlider.setAttribute('aria-valuetext', v.toFixed(2));
                updateRangeProgress(strSlider);
                this.saveState(targetModel);
            });

            strWrap.appendChild(strHeader);
            strWrap.appendChild(strSlider);
            card.appendChild(strWrap);

            // Fidelity Slider (V4.5 only; V5 removed Fidelity and fixes secondary_strength to 0.0)
            if (!isV5) {
                const displayFid = this._clampFidelity(item.fidelity);
                const fidWrap = document.createElement('div');
                fidWrap.className = 'space-y-1.5';
                const fidHeader = document.createElement('div');
                fidHeader.className = 'flex justify-between text-[11px] px-0.5';
                const fidLabel = document.createElement('label');
                const fidId = `charRefFid_${item.id}`;
                fidLabel.setAttribute('for', fidId);
                fidLabel.className = 'text-slate-600 dark:text-slate-400';
                fidLabel.textContent = '角色符合度 (Fidelity)';
                const fidValSpan = document.createElement('span');
                fidValSpan.className = 'font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums';
                fidValSpan.textContent = displayFid.toFixed(2);
                fidHeader.appendChild(fidLabel);
                fidHeader.appendChild(fidValSpan);

                const fidSlider = document.createElement('input');
                fidSlider.type = 'range';
                fidSlider.id = fidId;
                fidSlider.min = '0.00';
                fidSlider.max = '1.00';
                fidSlider.step = '0.01';
                fidSlider.value = displayFid.toFixed(2);
                fidSlider.className = 'enhanced-range w-full rounded-full appearance-none cursor-pointer';
                fidSlider.setAttribute('aria-valuetext', displayFid.toFixed(2));
                if (fidSlider.dataset) fidSlider.dataset.defaultValue = '0.80';
                updateRangeProgress(fidSlider);
                fidSlider.addEventListener('input', (e) => {
                    const v = this._clampFidelity(e.target.value);
                    item.fidelity = v;
                    fidValSpan.textContent = v.toFixed(2);
                    fidSlider.setAttribute('aria-valuetext', v.toFixed(2));
                    updateRangeProgress(fidSlider);
                    this.saveState(targetModel);
                });

                fidWrap.appendChild(fidHeader);
                fidWrap.appendChild(fidSlider);
                card.appendChild(fidWrap);
            }

            if (fragment) fragment.appendChild(card);
            nodes.push(card);
        });

        if (fragment && typeof listEl.replaceChildren === 'function') {
            listEl.replaceChildren(fragment);
        } else if (typeof listEl.replaceChildren === 'function') {
            listEl.replaceChildren(...nodes);
        } else {
            listEl.innerHTML = '';
            nodes.forEach(n => listEl.appendChild?.(n));
        }
    }

    _updateCostBadge(model, items, isMasterEnabled) {
        const badge = document.getElementById('charRefCostBadge');
        if (!badge) return;
        const activeCount = isMasterEnabled
            ? items.filter(it => it && it.enabled !== false && it.imageBase64).length
            : 0;
        if (activeCount > 0) {
            badge.textContent = `(${activeCount}张 · ${activeCount * 5} Anlas)`;
        } else {
            badge.textContent = '(5 Anlas/张)';
        }
    }

    toggleCharRefEnabled(model = this.currentModel) {
        const targetModel = model || this.currentModel || 'v4.5';
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const isEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        enabledCheckbox?.setAttribute?.('aria-checked', isEnabled ? 'true' : 'false');

        const container = document.getElementById('charRefImagePreviewContainer');
        const listEl = document.getElementById('charRefListContainer');
        const addBtn = document.getElementById('addCharRefBtn');
        const clearBtn = document.getElementById('clearCharRefImageBtn');
        const items = this.itemsByModel[this._getBucketKey(targetModel)] || [];
        const hasImages = items.length > 0;

        [container, listEl, addBtn].forEach(el => {
            if (!el?.classList) return;
            el.classList.add('transition-opacity', 'duration-200');
            if (isEnabled) {
                el.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                el.classList.add('opacity-50', 'pointer-events-none');
            }
        });

        if (clearBtn?.classList) {
            if (isEnabled && hasImages) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }

        this._updateCostBadge(targetModel, items, isEnabled);
        this.store?.setSetting?.(this.getCharRefKey('nai_char_ref_enabled', targetModel), isEnabled.toString());
        if (typeof window !== 'undefined' && window.ui?.updateGenerateButtonText) {
            window.ui.updateGenerateButtonText();
        }
    }

    toggleCharRefMode(model = this.currentModel) {
        const modeSelect = document.getElementById('charRefMode');
        const mode = this._normalizeMode(modeSelect ? modeSelect.value : 'character&style', model);
        const items = this.itemsByModel[this._getBucketKey(model)] || [];
        if (items[0]) items[0].mode = mode;
        this.store?.setSetting?.(this.getCharRefKey('nai_char_ref_mode', model), mode);
    }

    initEventListeners(model = this.currentModel) {
        const fidelitySlider = document.getElementById('charRefFidelity');
        const fidelityValSpan = document.getElementById('charRefFidelityValue');
        if (fidelitySlider) {
            if (fidelitySlider._charRefInputHandler && typeof fidelitySlider.removeEventListener === 'function') {
                fidelitySlider.removeEventListener('input', fidelitySlider._charRefInputHandler);
            }
            fidelitySlider._charRefInputHandler = (e) => {
                const v = this._clampFidelity(e.target.value);
                const items = this.itemsByModel[this._getBucketKey(model)] || [];
                if (items[0]) items[0].fidelity = v;
                if (fidelityValSpan) fidelityValSpan.textContent = v.toFixed(2);
                if (fidelitySlider.style?.setProperty) updateRangeProgress(fidelitySlider);
                this.store?.setSetting?.(this.getCharRefKey('nai_char_ref_fidelity', model), e.target.value);
            };
            fidelitySlider.addEventListener('input', fidelitySlider._charRefInputHandler);
            if (fidelityValSpan) fidelityValSpan.textContent = parseFloat(fidelitySlider.value).toFixed(2);
            if (fidelitySlider.style?.setProperty) updateRangeProgress(fidelitySlider);
        }

        const strengthSlider = document.getElementById('charRefStrength');
        const strengthValSpan = document.getElementById('charRefStrengthValue');
        if (strengthSlider) {
            if (strengthSlider._charRefInputHandler && typeof strengthSlider.removeEventListener === 'function') {
                strengthSlider.removeEventListener('input', strengthSlider._charRefInputHandler);
            }
            strengthSlider._charRefInputHandler = (e) => {
                const v = this._clampStrength(e.target.value, model);
                const items = this.itemsByModel[this._getBucketKey(model)] || [];
                if (items[0]) items[0].strength = v;
                if (strengthValSpan) strengthValSpan.textContent = v.toFixed(2);
                if (strengthSlider.style?.setProperty) updateRangeProgress(strengthSlider);
                this.store?.setSetting?.(this.getCharRefKey('nai_char_ref_strength', model), e.target.value);
            };
            strengthSlider.addEventListener('input', strengthSlider._charRefInputHandler);
            if (strengthValSpan) strengthValSpan.textContent = parseFloat(strengthSlider.value).toFixed(2);
            if (strengthSlider.style?.setProperty) updateRangeProgress(strengthSlider);
        }
    }

    getActiveItems(model = this.currentModel) {
        const items = this.itemsByModel[this._getBucketKey(model)] || [];
        return items.filter(it => it && it.enabled !== false && Boolean(it.imageBase64));
    }

    hasActiveReferences(model = this.currentModel) {
        if (model !== 'v4.5' && model !== 'v5') return false;
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const charRefEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        return charRefEnabled && this.getActiveItems(model).length > 0;
    }

    isValidForModel(selectedVersion, hasCustomKey) {
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const charRefEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        const activeItems = this.getActiveItems(selectedVersion);

        if (charRefEnabled && activeItems.length > 0) {
            if (selectedVersion !== 'v4.5' && selectedVersion !== 'v5') {
                return {
                    isValid: false,
                    error: "角色参考图功能仅支持 V4.5 与 V5 模型，请切换模型后重试。"
                };
            }
            if (!hasCustomKey) {
                return {
                    isValid: false,
                    error: "角色参考图需要消耗官方 Anlas 算力，为了公共额度安全，请先在右上角配置您的【自定义 API Key】后使用。"
                };
            }
        }
        return { isValid: true };
    }

    getPayloadParams(model = this.currentModel) {
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const charRefEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        if (!charRefEnabled || (model !== 'v4.5' && model !== 'v5')) {
            return {};
        }

        const activeItems = this.getActiveItems(model);
        if (activeItems.length === 0) {
            return {};
        }

        // Legacy mock DOM support when charRefListContainer is absent
        const listEl = document.getElementById('charRefListContainer');
        const useLegacySingleDom = !listEl && activeItems.length === 1;
        const legacyStrEl = useLegacySingleDom ? document.getElementById('charRefStrength') : null;
        const legacyFidEl = useLegacySingleDom ? document.getElementById('charRefFidelity') : null;
        const legacyModeEl = useLegacySingleDom ? document.getElementById('charRefMode') : null;

        const isV5 = model === 'v5';
        const images = [];
        const descriptions = [];
        const strengths = [];
        const secondaryStrengths = [];
        const infoExtracted = [];

        activeItems.forEach((item, idx) => {
            const rawStr = idx === 0 && legacyStrEl ? legacyStrEl.value : item.strength;
            const rawFid = idx === 0 && legacyFidEl ? legacyFidEl.value : item.fidelity;
            const rawMode = idx === 0 && legacyModeEl ? legacyModeEl.value : item.mode;

            const effectiveStr = this._clampStrength(rawStr, model);
            const effectiveMode = this._normalizeMode(rawMode, model);
            const secondary = isV5 ? 0.0 : round2(1.0 - this._clampFidelity(rawFid));

            images.push(stripDataUriPrefix(item.imageBase64));
            descriptions.push({
                use_coords: false,
                use_order: false,
                legacy_uc: false,
                caption: {
                    base_caption: effectiveMode,
                    char_captions: []
                }
            });
            strengths.push(effectiveStr);
            secondaryStrengths.push(secondary);
            infoExtracted.push(1.0);
        });

        return {
            director_reference_images: images,
            director_reference_descriptions: descriptions,
            director_reference_strength_values: strengths,
            director_reference_secondary_strength_values: secondaryStrengths,
            director_reference_information_extracted: infoExtracted
        };
    }

    restoreFromMetadata(meta, modelVer = 'v4.5') {
        if (!meta || !Array.isArray(meta.director_reference_images) || meta.director_reference_images.length === 0) {
            return false;
        }
        const bucketKey = this._getBucketKey(modelVer);
        const restored = meta.director_reference_images.map((img, i) => {
            const rawStr = meta.director_reference_strength_values?.[i];
            const rawSecStr = meta.director_reference_secondary_strength_values?.[i];
            const rawDesc = meta.director_reference_descriptions?.[i];
            const descStr = typeof rawDesc === 'string'
                ? rawDesc
                : (rawDesc?.caption?.base_caption || 'character&style');
            const fidelity = rawSecStr !== undefined ? (1.0 - parseFloat(rawSecStr)) : 0.8;

            return this._createItem({
                imageBase64: stripDataUriPrefix(img),
                mode: this._normalizeMode(descStr, modelVer),
                strength: rawStr !== undefined ? rawStr : 1.0,
                fidelity,
                enabled: true
            }, modelVer);
        });

        this.currentModel = modelVer;
        this.itemsByModel[bucketKey] = restored;

        const enabledCheckbox = document.getElementById('charRefEnabled');
        if (enabledCheckbox) {
            enabledCheckbox.checked = true;
            enabledCheckbox.setAttribute?.('aria-checked', 'true');
        }
        try {
            this.store?.setSetting?.(this.getCharRefKey('nai_char_ref_enabled', modelVer), 'true');
        } catch (_) {}
        this.saveState(modelVer);
        this.loadState(modelVer);
        return true;
    }
}
