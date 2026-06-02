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
        this.currentVibeIsJson = false;
        this.availableVibeEncodings = [];
    }

    getVibeKey(key, model) {
        return key + (model === 'v4.5' ? '_v4' : '');
    }

    loadState(model) {
        const savedVibeData = this.store.getSetting(this.getVibeKey('nai_vibe_image', model));
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
                    if (savedVibePreview.includes('svg')) previewImg.classList.add('p-4');
                    else previewImg.classList.remove('p-4');
                } else {
                    if (this.currentVibeIsJson) {
                        // fallback placeholder
                        previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                        previewImg.classList.add('p-4');
                    } else {
                        previewImg.src = 'data:image/jpeg;base64,' + savedVibeData;
                        previewImg.classList.remove('p-4');
                    }
                }
                previewImg.classList.remove('hidden');
            }

            const placeholder = document.getElementById('vibeImagePlaceholder');
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = document.getElementById('clearVibeImageBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');

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
        this.store.setSetting(this.getVibeKey('nai_vibe_is_json', model), this.currentVibeIsJson.toString());
        this.store.setSetting(this.getVibeKey('nai_vibe_encodings', model), JSON.stringify(this.availableVibeEncodings));
        
        const previewImg = document.getElementById('vibeImagePreview');
        if (previewImg) {
            this.store.setSetting(this.getVibeKey('nai_vibe_preview', model), previewImg.src);
        }
    }

    clearVibeImage(model) {
        this.currentVibeImageBase64 = null;
        this.currentVibeIsJson = false;
        this.availableVibeEncodings = [];
        this.store.setSetting(this.getVibeKey('nai_vibe_image', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_is_json', model), 'false');
        this.store.setSetting(this.getVibeKey('nai_vibe_encodings', model), '[]');
        this.store.setSetting(this.getVibeKey('nai_vibe_preview', model), '');
        
        const input = document.getElementById('vibeImageInput');
        if (input) input.value = '';

        const previewImg = document.getElementById('vibeImagePreview');
        if (previewImg) {
            previewImg.src = '';
            previewImg.classList.remove('p-4');
            previewImg.classList.add('hidden');
        }

        const placeholder = document.getElementById('vibeImagePlaceholder');
        if (placeholder) placeholder.classList.remove('hidden');

        const clearBtn = document.getElementById('clearVibeImageBtn');
        if (clearBtn) clearBtn.classList.add('hidden');

        const vibeControls = document.getElementById('vibeControls');
        if (vibeControls) vibeControls.classList.add('hidden');

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
            const isJson = file.name.endsWith('.json') || file.name.endsWith('.nai4vibe') || file.type === 'application/json';
            this.currentVibeIsJson = isJson;
            this.availableVibeEncodings = [];

            if (isJson) {
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
                
                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    if (sourceImg && (sourceImg.startsWith('data:image') || sourceImg.length > 1000)) {
                         previewImg.src = sourceImg.startsWith('data:image') ? sourceImg : ('data:image/png;base64,' + sourceImg);
                         previewImg.classList.remove('p-4');
                    } else {
                         previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                         previewImg.classList.add('p-4');
                    }
                    previewImg.classList.remove('hidden');
                }
                
                this.updateVibeInfoUI(true, model);
            } else {
                const compressedDataUrl = await this.compressImage(file);
                this.currentVibeImageBase64 = compressedDataUrl.split(',')[1];
                
                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    previewImg.src = compressedDataUrl;
                    previewImg.classList.remove('hidden', 'p-4');
                }
                this.updateVibeInfoUI(false, model);
            }
            
            this.saveState(model);
            
            const placeholder = document.getElementById('vibeImagePlaceholder');
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = document.getElementById('clearVibeImageBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');

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
            container.innerHTML = `<input type="range" id="vibeInfo" min="0.01" max="1.0" value="1.0" step="0.01" class="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer">`;
            const slider = container.querySelector('#vibeInfo');
            if (slider) {
                slider.addEventListener('input', (e) => {
                    if (infoVal) infoVal.textContent = parseFloat(e.target.value).toFixed(2);
                    this.store.setSetting(this.getVibeKey('nai_vibe_info', model), e.target.value);
                });
                if (infoVal) infoVal.textContent = parseFloat(slider.value).toFixed(2);
            }
        }
    }

    isValidForModel(selectedVersion) {
        const enabledCheckbox = document.getElementById('vibeEnabled');
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        
        if (vibeEnabled && selectedVersion === 'v4.5' && this.currentVibeImageBase64 && !this.currentVibeIsJson) {
            return {
                isValid: false,
                error: "V4.5 模型氛围传输需要上传官方提取的 .nai4vibe 或 .json 编码文件。\n由于直接上传图片会重复消耗 Anlas 去编码，为了您的账号安全，请先在官方获取编码文件后再使用此功能。"
            };
        }
        return { isValid: true };
    }

    getPayloadParams(model) {
        const enabledCheckbox = document.getElementById('vibeEnabled');
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : false;

        if (vibeEnabled && this.currentVibeImageBase64) {
            const vibeInfoEl = document.getElementById('vibeInfo');
            const vibeStrengthEl = document.getElementById('vibeStrength');
            
            let vibeInfo = 1.0;
            if (vibeInfoEl) {
                vibeInfo = parseFloat(vibeInfoEl.value);
            } else {
                const infoVal = document.getElementById('vibeInfoValue');
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
