/**
 * Vibe Reference Image Manager Module
 * Handles file reading, JSON vibe-encoding structure parsing, status rendering, and parameter serialization.
 */

export class VibeManager {
    constructor(config = {}) {
        this.store = config.store;
        this.compressImage = config.compressImage;
        this.onShowToast = config.onShowToast || (() => {});
        
        this.currentVibeImageBase64 = null;
        this.rawImageBase64 = null;
        this.encodedVibeData = null;
        this.currentVibeIsJson = false;
        this.availableVibeEncodings = [];
        this.vibeEncodingsCache = new Map();
    }

    getVibeKey(key, model) {
        return key + (model === 'v4.5' ? '_v4' : '');
    }

    isRawImage(b64) {
        if (!b64 || typeof b64 !== 'string') return false;
        const clean = b64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        return clean.startsWith('iVBORw0KGgo') || 
               clean.startsWith('/9j/') || 
               clean.startsWith('UklGR') || 
               clean.startsWith('R0lGOD');
    }

    getImageFingerprint(b64) {
        if (!b64 || typeof b64 !== 'string') return '';
        const clean = b64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        const len = clean.length;
        const mid = Math.floor(len / 2);
        return `${len}_${clean.slice(0, 32)}_${clean.slice(mid, mid + 32)}_${clean.slice(-32)}`;
    }

    getCacheKey(rawImg, info) {
        const fp = this.getImageFingerprint(rawImg);
        const infoKey = parseFloat(info).toFixed(2);
        return `${fp}_${infoKey}`;
    }

    getCachedEncoding(rawImg, info) {
        if (!rawImg) return null;
        const key = this.getCacheKey(rawImg, info);
        return this.vibeEncodingsCache.get(key) || null;
    }

    setCachedEncoding(rawImg, info, encoding) {
        if (!rawImg || !encoding) return;
        const key = this.getCacheKey(rawImg, info);
        this.vibeEncodingsCache.set(key, encoding);
        this.encodedVibeData = {
            rawImage: rawImg,
            info: parseFloat(info),
            encoding: encoding
        };
    }

    loadState(model) {
        const savedCache = this.store.getSetting(this.getVibeKey('nai_vibe_cache', model));
        if (savedCache) {
            try {
                const parsed = JSON.parse(savedCache);
                for (const [k, v] of Object.entries(parsed)) {
                    this.vibeEncodingsCache.set(k, v);
                }
            } catch {}
        }

        const savedVibeData = this.store.getSetting(this.getVibeKey('nai_vibe_image', model));
        const savedRawImage = this.store.getSetting(this.getVibeKey('nai_vibe_raw_image', model));
        const savedVibeIsJson = this.store.getSetting(this.getVibeKey('nai_vibe_is_json', model)) === 'true';
        const savedVibeEnabled = this.store.getSetting(this.getVibeKey('nai_vibe_enabled', model)) !== 'false';
        const savedVibeInfo = this.store.getSetting(this.getVibeKey('nai_vibe_info', model));
        const savedVibeStrength = this.store.getSetting(this.getVibeKey('nai_vibe_strength', model));
        const savedVibePreview = this.store.getSetting(this.getVibeKey('nai_vibe_preview', model));
        const savedVibeEncodings = this.store.getSetting(this.getVibeKey('nai_vibe_encodings', model));

        const enabledCheckbox = document.getElementById('vibeEnabled');
        if (enabledCheckbox) {
            enabledCheckbox.checked = savedVibeEnabled;
        }

        if (savedVibeData) {
            this.currentVibeImageBase64 = savedVibeData;
            this.rawImageBase64 = savedRawImage || (this.isRawImage(savedVibeData) ? savedVibeData : null);
            this.currentVibeIsJson = savedVibeIsJson;
            if (savedVibeEncodings) {
                try {
                    this.availableVibeEncodings = JSON.parse(savedVibeEncodings);
                } catch {
                    this.availableVibeEncodings = [];
                }
            } else {
                this.availableVibeEncodings = [];
            }

            const previewImg = document.getElementById('vibeImagePreview');
            if (previewImg) {
                if (savedVibePreview) {
                    previewImg.src = savedVibePreview;
                    if (savedVibePreview.includes('svg')) previewImg.classList.add('p-3');
                    else previewImg.classList.remove('p-4', 'p-3');
                } else {
                    if (this.currentVibeIsJson) {
                        // fallback placeholder
                        previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                        previewImg.classList.add('p-4');
                    } else {
                        previewImg.src = 'data:image/jpeg;base64,' + savedVibeData;
                        previewImg.classList.remove('p-4', 'p-3');
                    }
                }
                previewImg.classList.remove('hidden');
            }

            const placeholder = document.getElementById('vibeImagePlaceholder');
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = document.getElementById('clearVibeImageBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');

            const exportBtn = document.getElementById('exportVibeHeaderBtn');
            if (exportBtn) exportBtn.classList.remove('hidden');

            const vibeControls = document.getElementById('vibeControls');
            if (vibeControls) vibeControls.classList.remove('hidden');

            this.updateVibeInfoUI(this.currentVibeIsJson, model);

            if (this.currentVibeIsJson && this.availableVibeEncodings.length > 1) {
                const savedIndex = this.store.getSetting(this.getVibeKey('nai_vibe_selected_index', model));
                const vibeSelect = document.getElementById('vibeInfoSelect');
                if (vibeSelect && savedIndex) {
                    vibeSelect.value = savedIndex;
                    this.selectVibeStrength(savedIndex, model);
                }
            } else if (!this.currentVibeIsJson && savedVibeInfo) {
                const slider = document.getElementById('vibeInfo');
                if (slider) {
                    slider.value = savedVibeInfo;
                    const valSpan = document.getElementById('vibeInfoValue');
                    if (valSpan) valSpan.textContent = parseFloat(savedVibeInfo).toFixed(2);
                }
            }
        } else {
            this.clearVibeImage(model);
        }

        if (savedVibeStrength) {
            const strSlider = document.getElementById('vibeStrength');
            if (strSlider) {
                strSlider.value = savedVibeStrength;
                const strSpan = document.getElementById('vibeStrengthValue');
                if (strSpan) strSpan.textContent = parseFloat(savedVibeStrength).toFixed(2);
            }
        }

        this.toggleVibeEnabled(model);
    }

    saveState(model) {
        this.store.setSetting(this.getVibeKey('nai_vibe_image', model), this.currentVibeImageBase64 || '');
        this.store.setSetting(this.getVibeKey('nai_vibe_raw_image', model), this.rawImageBase64 || '');
        this.store.setSetting(this.getVibeKey('nai_vibe_is_json', model), this.currentVibeIsJson.toString());
        this.store.setSetting(this.getVibeKey('nai_vibe_encodings', model), JSON.stringify(this.availableVibeEncodings));
        
        if (this.vibeEncodingsCache && this.vibeEncodingsCache.size > 0) {
            const cacheObj = {};
            const entries = Array.from(this.vibeEncodingsCache.entries()).slice(-15);
            for (const [k, v] of entries) {
                cacheObj[k] = v;
            }
            this.store.setSetting(this.getVibeKey('nai_vibe_cache', model), JSON.stringify(cacheObj));
        }

        const previewImg = typeof document !== 'undefined' ? document.getElementById('vibeImagePreview') : null;
        if (previewImg) {
            this.store.setSetting(this.getVibeKey('nai_vibe_preview', model), previewImg.src);
        }
    }

    clearVibeImage(model) {
        this.currentVibeImageBase64 = null;
        this.rawImageBase64 = null;
        this.encodedVibeData = null;
        this.currentVibeIsJson = false;
        this.availableVibeEncodings = [];
        this.store.setSetting(this.getVibeKey('nai_vibe_image', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_raw_image', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_is_json', model), 'false');
        this.store.setSetting(this.getVibeKey('nai_vibe_encodings', model), '[]');
        this.store.setSetting(this.getVibeKey('nai_vibe_preview', model), '');
        
        if (typeof document !== 'undefined') {
            const input = document.getElementById('vibeImageInput');
            if (input) input.value = '';

            const previewImg = document.getElementById('vibeImagePreview');
            if (previewImg) {
                previewImg.src = '';
                previewImg.classList.remove('p-4', 'p-3');
                previewImg.classList.add('hidden');
            }

            const placeholder = document.getElementById('vibeImagePlaceholder');
            if (placeholder) placeholder.classList.remove('hidden');

            const clearBtn = document.getElementById('clearVibeImageBtn');
            if (clearBtn) clearBtn.classList.add('hidden');

            const exportBtn = document.getElementById('exportVibeHeaderBtn');
            if (exportBtn) exportBtn.classList.add('hidden');

            const exportMenu = document.getElementById('vibeExportMenu');
            if (exportMenu) exportMenu.classList.add('hidden');

            const vibeControls = document.getElementById('vibeControls');
            if (vibeControls) vibeControls.classList.add('hidden');
        }

        this.updateVibeInfoUI(false, model);
    }

    toggleVibeEnabled(model) {
        const enabledCheckbox = document.getElementById('vibeEnabled');
        const enabled = enabledCheckbox ? enabledCheckbox.checked : true;
        this.store.setSetting(this.getVibeKey('nai_vibe_enabled', model), enabled.toString());
        
        const previewContainer = document.getElementById('vibeImagePreviewContainer');
        const controls = document.getElementById('vibeControls');
        
        if (previewContainer) {
            if (enabled) {
                previewContainer.classList.remove('opacity-40', 'grayscale-[0.5]');
                if (this.currentVibeImageBase64 && controls) controls.classList.remove('hidden');
            } else {
                previewContainer.classList.add('opacity-40', 'grayscale-[0.5]');
                if (controls) controls.classList.add('hidden');
            }
        }
    }

    async handleVibeImage(event, model) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const fileName = (file.name || '').toLowerCase();
            const isJsonExt = fileName.endsWith('.json') || fileName.endsWith('.nai4vibe') || file.type === 'application/json';
            const isVibeExt = fileName.endsWith('.vibe') || fileName.endsWith('.vibe40');

            let isJson = isJsonExt;
            let isBinaryVibe = false;

            this.availableVibeEncodings = [];

            if (isVibeExt) {
                try {
                    const textHead = await file.slice(0, 32).text();
                    if (textHead.trim().startsWith('{') || textHead.trim().startsWith('[')) {
                        isJson = true;
                    } else {
                        isBinaryVibe = true;
                    }
                } catch {
                    isBinaryVibe = true;
                }
            }

            if (isJson) {
                this.currentVibeIsJson = true;
                const text = await file.text();
                const obj = JSON.parse(text);
                
                const extractEncoding = (item) => {
                    if (!item || typeof item !== 'object') return null;
                    const img = item.image || item.latent || item.vibe_image || item.encoded_image;
                    
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
                    const section = obj.encodings['v4-5full'] || obj.encodings['v4full'];
                    if (section) {
                        Object.values(section).forEach(item => {
                            if (item.encoding) {
                                let info = 0.35;
                                if (item.params && item.params.information_extracted !== undefined) {
                                    info = item.params.information_extracted;
                                }
                                this.availableVibeEncodings.push({ base64: item.encoding, info: parseFloat(info) });
                            }
                        });
                    }
                    items.push(obj);
                } else {
                    items.push(obj);
                }

                items.forEach(item => {
                    const enc = extractEncoding(item);
                    if (enc) {
                        this.availableVibeEncodings.push(enc);
                    } else if (item.vibe && typeof item.vibe === 'object') {
                        const nestedEnc = extractEncoding(item.vibe);
                        if (nestedEnc) this.availableVibeEncodings.push(nestedEnc);
                    }
                });

                if (this.availableVibeEncodings.length === 0) {
                    console.error("Vibe JSON structure unrecognized:", obj);
                    throw new Error("未在文件中找到有效的 Vibe 编码数据 (识别到的字段不全)");
                }

                const firstItem = items[0];
                let sourceImg = obj.source_image || firstItem?.source_image || obj.thumbnail || firstItem?.thumbnail || obj.image || firstItem?.image;
                if (sourceImg && typeof sourceImg === 'string') {
                    this.rawImageBase64 = sourceImg.replace(/^data:image\/[a-z]+;base64,/, '');
                } else {
                    this.rawImageBase64 = null;
                }

                if (this.rawImageBase64) {
                    this.availableVibeEncodings.forEach(e => {
                        this.setCachedEncoding(this.rawImageBase64, e.info, e.base64);
                    });
                }
                
                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    if (sourceImg && (sourceImg.startsWith('data:image') || sourceImg.length > 1000)) {
                         previewImg.src = sourceImg.startsWith('data:image') ? sourceImg : ('data:image/png;base64,' + sourceImg);
                         previewImg.classList.remove('p-4', 'p-3');
                    } else {
                         previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                         previewImg.classList.add('p-4');
                    }
                    previewImg.classList.remove('hidden');
                }
                
                this.updateVibeInfoUI(true, model);
            } else if (isBinaryVibe) {
                this.currentVibeIsJson = false;
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                const chunk = 8192;
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                const base64 = btoa(binary);

                this.currentVibeImageBase64 = base64;
                this.rawImageBase64 = null;
                this.encodedVibeData = {
                    rawImage: null,
                    info: 1.0,
                    encoding: base64
                };

                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                    previewImg.classList.add('p-3');
                    previewImg.classList.remove('hidden');
                }

                this.updateVibeInfoUI(false, model);
            } else {
                const compressedDataUrl = await this.compressImage(file);
                this.rawImageBase64 = compressedDataUrl.split(',')[1];
                this.currentVibeImageBase64 = this.rawImageBase64;
                this.currentVibeIsJson = false;
                
                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    previewImg.src = compressedDataUrl;
                    previewImg.classList.remove('hidden', 'p-4', 'p-3');
                }
                this.updateVibeInfoUI(false, model);
            }
            
            this.saveState(model);
            
            const placeholder = document.getElementById('vibeImagePlaceholder');
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = document.getElementById('clearVibeImageBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');

            const exportBtn = document.getElementById('exportVibeHeaderBtn');
            if (exportBtn) exportBtn.classList.remove('hidden');

            const vibeControls = document.getElementById('vibeControls');
            if (vibeControls) vibeControls.classList.remove('hidden');

            this.toggleVibeEnabled(model); 
        } catch (e) {
            console.error("Failed to process vibe file", e);
            alert("文件处理失败: " + e.message);
        }
    }

    selectVibeStrength(index, model) {
        const enc = this.availableVibeEncodings[index];
        if (enc) {
            this.currentVibeImageBase64 = enc.base64;
            const valSpan = document.getElementById('vibeInfoValue');
            if (valSpan) valSpan.textContent = enc.info.toFixed(2);
            this.store.setSetting(this.getVibeKey('nai_vibe_selected_index', model), index);
            this.store.setSetting(this.getVibeKey('nai_vibe_image', model), this.currentVibeImageBase64);
        }
    }

    updateVibeInfoUI(isJson, model) {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('vibeInfoContainer');
        const infoVal = document.getElementById('vibeInfoValue');
        if (!container) return;
        
        if (isJson && this.availableVibeEncodings.length > 0) {
            if (this.availableVibeEncodings.length === 1) {
                const enc = this.availableVibeEncodings[0];
                this.currentVibeImageBase64 = enc.base64;
                container.innerHTML = `<div class="text-[10px] text-gray-400 bg-gray-100 dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 italic">固定强度: ${enc.info.toFixed(2)} (已锁定)</div>`;
                if (infoVal) infoVal.textContent = enc.info.toFixed(2);
            } else {
                let html = `<select id="vibeInfoSelect" class="art-input w-full px-3 py-2 rounded-xl text-xs font-medium outline-none shadow-sm appearance-none cursor-pointer text-gray-700 dark:text-gray-200">`;
                this.availableVibeEncodings.forEach((enc, index) => {
                    html += `<option value="${index}">强度: ${enc.info.toFixed(2)}</option>`;
                });
                html += `</select>`;
                container.innerHTML = html;
                
                const selectEl = container.querySelector('#vibeInfoSelect');
                if (selectEl) {
                    selectEl.addEventListener('change', (e) => {
                        this.selectVibeStrength(e.target.value, model);
                    });
                }
                this.selectVibeStrength(0, model);
            }
        } else {
            const isV45 = model === 'v4.5';
            const existingSlider = document.getElementById('vibeInfo');
            const savedInfo = this.store.getSetting(this.getVibeKey('nai_vibe_info', model));
            const currentVal = existingSlider ? existingSlider.value : (savedInfo || "1.0");

            container.innerHTML = `
                <div class="space-y-2">
                    <input type="range" id="vibeInfo" min="0.01" max="1.0" value="${currentVal}" step="0.01" class="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer">
                    <div id="vibeEncodeStatus"></div>
                </div>
            `;
            const slider = container.querySelector('#vibeInfo');
            if (slider) {
                slider.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    if (infoVal) infoVal.textContent = val.toFixed(2);
                    this.store.setSetting(this.getVibeKey('nai_vibe_info', model), e.target.value);
                    if (isV45) {
                        this.updateVibeStatus(model);
                    }
                });
                if (infoVal) infoVal.textContent = parseFloat(slider.value).toFixed(2);
            }
            if (isV45) {
                this.updateVibeStatus(model);
            }
        }

        const exportBtn = document.getElementById('exportVibeHeaderBtn');
        if (exportBtn) {
            if (this.currentVibeImageBase64) {
                exportBtn.classList.remove('hidden');
            } else {
                exportBtn.classList.add('hidden');
            }
        }
    }

    updateVibeStatus(model) {
        if (typeof document === 'undefined') return;
        const statusContainer = document.getElementById('vibeEncodeStatus');
        if (!statusContainer) return;

        const isV45 = model === 'v4.5';
        if (!isV45 || !this.currentVibeImageBase64) {
            statusContainer.innerHTML = '';
            return;
        }

        const vibeInfoEl = document.getElementById('vibeInfo');
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;
        const rawImg = this.rawImageBase64 || (this.isRawImage(this.currentVibeImageBase64) ? this.currentVibeImageBase64 : null);

        let cachedToken = null;
        if (rawImg) {
            cachedToken = this.getCachedEncoding(rawImg, info);
        }

        if (cachedToken) {
            this.currentVibeImageBase64 = cachedToken;
            statusContainer.innerHTML = `
                <div class="mt-2 flex items-center justify-between text-[11px] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                    <span class="flex items-center gap-1 font-medium">✓ 已官方编码 (出图免耗点)</span>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportVibeBinary('${model}')" class="bg-green-600 hover:bg-green-700 active:scale-95 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-sm transition-all" title="导出 .vibe 二进制文件">导出 .vibe</button>
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportNai4Vibe('${model}')" class="border border-green-600/50 hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-95 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-medium transition-all" title="导出 .nai4vibe JSON 文件">导出 .nai4vibe</button>
                    </div>
                </div>`;
        } else if (rawImg) {
            this.currentVibeImageBase64 = rawImg;
            statusContainer.innerHTML = `
                <div class="mt-2 flex items-center justify-between text-[11px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                    <span class="text-[10px] font-medium">需官方编码 (消耗 2 Anlas)</span>
                    <button type="button" onclick="window.triggerEncodeVibe && window.triggerEncodeVibe()" class="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-sm transition-all">立即编码</button>
                </div>`;
        } else {
            statusContainer.innerHTML = `
                <div class="mt-2 flex items-center justify-between text-[11px] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                    <span class="flex items-center gap-1 font-medium">✓ 已载入编码 Token (出图免耗点)</span>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportVibeBinary('${model}')" class="bg-green-600 hover:bg-green-700 active:scale-95 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-sm transition-all" title="导出 .vibe 二进制文件">导出 .vibe</button>
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportNai4Vibe('${model}')" class="border border-green-600/50 hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-95 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-medium transition-all" title="导出 .nai4vibe JSON 文件">导出 .nai4vibe</button>
                    </div>
                </div>`;
        }
    }

    needsV45Encoding(model = 'v4.5') {
        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : true;
        if (!vibeEnabled || model !== 'v4.5' || this.currentVibeIsJson) return false;
        if (!this.currentVibeImageBase64) return false;

        if (!this.isRawImage(this.currentVibeImageBase64)) return false;

        const rawImg = this.rawImageBase64 || this.currentVibeImageBase64;
        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;

        const cached = this.getCachedEncoding(rawImg, info);
        if (cached) {
            this.currentVibeImageBase64 = cached;
            this.encodedVibeData = {
                rawImage: rawImg,
                info: info,
                encoding: cached
            };
            return false;
        }

        return true;
    }

    async ensureV45Encoded(engine, auth, model = 'v4.5') {
        if (model !== 'v4.5' || this.currentVibeIsJson) return;
        if (!this.currentVibeImageBase64) return;

        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;
        const rawImg = this.rawImageBase64 || (this.isRawImage(this.currentVibeImageBase64) ? this.currentVibeImageBase64 : null);

        if (!rawImg) return;

        const cached = this.getCachedEncoding(rawImg, info);
        if (cached) {
            this.currentVibeImageBase64 = cached;
            this.encodedVibeData = {
                rawImage: rawImg,
                info: info,
                encoding: cached
            };
            this.updateVibeStatus(model);
            return;
        }

        const res = await engine.encodeVibe({
            image: rawImg,
            model: 'nai-diffusion-4-5-full',
            information_extracted: info
        }, auth);

        if (res && res.encoding) {
            this.setCachedEncoding(rawImg, info, res.encoding);
            this.currentVibeImageBase64 = res.encoding;
            this.saveState(model);
            this.updateVibeStatus(model);
        }
    }

    exportVibeBinary(model = 'v4.5') {
        const rawImg = this.rawImageBase64;
        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : (this.encodedVibeData?.info || 1.0);
        
        let token = (!this.isRawImage(this.currentVibeImageBase64)) ? this.currentVibeImageBase64 : null;
        if (!token && rawImg) {
            token = this.getCachedEncoding(rawImg, info);
        }
        if (!token && this.availableVibeEncodings.length > 0) {
            token = this.availableVibeEncodings[0].base64;
        }

        if (!token) {
            if (typeof alert === 'function') alert("当前所选强度尚未进行官方编码，请先点击【立即编码】后再导出 .vibe 文件。");
            return;
        }

        try {
            const cleanBase64 = token.replace(/^data:application\/[a-z0-9-]+;base64,/, '').trim();
            const binaryString = atob(cleanBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            if (typeof document !== 'undefined') {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const infoStr = info.toFixed(2).replace('.', '_');
                a.download = `novelai_vibe_${infoStr}_${Date.now()}.vibe`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }
        } catch (e) {
            console.error("Export .vibe binary failed:", e);
            if (typeof alert === 'function') alert("导出 .vibe 失败: " + e.message);
        }
    }

    exportNai4Vibe(model = 'v4.5') {
        const rawImg = this.rawImageBase64;
        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const currentInfo = vibeInfoEl ? parseFloat(vibeInfoEl.value) : (this.encodedVibeData?.info || 1.0);

        let currentToken = (!this.isRawImage(this.currentVibeImageBase64)) ? this.currentVibeImageBase64 : null;
        if (!currentToken && rawImg) {
            currentToken = this.getCachedEncoding(rawImg, currentInfo);
        }

        if (!currentToken && (!this.availableVibeEncodings || this.availableVibeEncodings.length === 0)) {
            if (typeof alert === 'function') alert("当前尚未完成官方编码，请先点击【立即编码】后再导出 .nai4vibe 文件。");
            return;
        }

        try {
            const encodingsObj = {};
            let idx = 0;

            if (currentToken) {
                encodingsObj[String(idx++)] = {
                    encoding: currentToken,
                    params: {
                        information_extracted: currentInfo
                    }
                };
            }

            if (rawImg) {
                const fp = this.getImageFingerprint(rawImg);
                for (const [key, enc] of this.vibeEncodingsCache.entries()) {
                    if (key.startsWith(fp + '_')) {
                        const infoStr = key.substring(fp.length + 1);
                        const infoNum = parseFloat(infoStr);
                        if (Math.abs(infoNum - currentInfo) > 0.005) {
                            encodingsObj[String(idx++)] = {
                                encoding: enc,
                                params: {
                                    information_extracted: infoNum
                                }
                            };
                        }
                    }
                }
            }

            if (this.availableVibeEncodings && this.availableVibeEncodings.length > 0) {
                this.availableVibeEncodings.forEach(enc => {
                    const alreadyExists = Object.values(encodingsObj).some(e => Math.abs(e.params.information_extracted - enc.info) < 0.005);
                    if (!alreadyExists) {
                        encodingsObj[String(idx++)] = {
                            encoding: enc.base64,
                            params: {
                                information_extracted: enc.info
                            }
                        };
                    }
                });
            }

            const exportData = {
                encodings: {
                    "v4-5full": encodingsObj
                },
                source_image: rawImg ? (rawImg.startsWith('data:') ? rawImg : `data:image/png;base64,${rawImg}`) : null
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            if (typeof document !== 'undefined') {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const infoStr = currentInfo.toFixed(2).replace('.', '_');
                a.download = `novelai_vibe_${infoStr}_${Date.now()}.nai4vibe`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }
        } catch (e) {
            console.error("Export .nai4vibe failed:", e);
            if (typeof alert === 'function') alert("导出 .nai4vibe 失败: " + e.message);
        }
    }

    isValidForModel(selectedVersion, hasCustomKey = false) {
        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : true;
        
        if (vibeEnabled && this.currentVibeImageBase64) {
            if (selectedVersion === 'v5') {
                return {
                    isValid: false,
                    error: "V5 模型目前暂不支持氛围传输 (Vibe Transfer) 功能，请切换至 V3 或 V4.5 模型后使用。"
                };
            }
            if (selectedVersion === 'v4.5' && !this.currentVibeIsJson && !hasCustomKey) {
                return {
                    isValid: false,
                    error: "V4.5 模型氛围传输直接上传图片需要消耗官方 Anlas 算力编码。\n为了公共额度安全，请先在右上角配置您的【自定义 API Key】后使用，或上传官方提取的 .nai4vibe 或 .json 编码文件。"
                };
            }
        }
        return { isValid: true };
    }

    getPayloadParams(model) {
        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : true;

        if (vibeEnabled && this.currentVibeImageBase64 && model !== 'v5') {
            const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
            const vibeStrengthEl = typeof document !== 'undefined' ? document.getElementById('vibeStrength') : null;
            
            let vibeInfo = 1.0;
            if (vibeInfoEl) {
                vibeInfo = parseFloat(vibeInfoEl.value);
            } else {
                const infoVal = typeof document !== 'undefined' ? document.getElementById('vibeInfoValue') : null;
                vibeInfo = infoVal ? parseFloat(infoVal.textContent || "1.0") : 1.0;
            }

            const vibeStrength = vibeStrengthEl ? parseFloat(vibeStrengthEl.value) : 0.6;

            return {
                vibe_image: this.currentVibeImageBase64,
                vibe_info: vibeInfo,
                vibe_strength: vibeStrength
            };
        }

        return {};
    }
}
