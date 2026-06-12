function processImageToPng(file, maxPixels = 1024 * 1024) {
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
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export class CharRefManager {
    constructor(config = {}) {
        this.store = config.store;
        this.compressImage = config.compressImage;
        this.onShowToast = config.onShowToast || (() => {});
        
        this.currentCharRefImageBase64 = null;
    }

    getCharRefKey(key, model) {
        return key + (model === 'v4.5' ? '_v4' : '');
    }

    loadState(model) {
        const savedData = this.store.getSetting(this.getCharRefKey('nai_char_ref_image', model));
        const savedEnabled = this.store.getSetting(this.getCharRefKey('nai_char_ref_enabled', model)) !== 'false';
        const savedStrength = this.store.getSetting(this.getCharRefKey('nai_char_ref_strength', model));
        const savedFidelity = this.store.getSetting(this.getCharRefKey('nai_char_ref_fidelity', model));
        const savedMode = this.store.getSetting(this.getCharRefKey('nai_char_ref_mode', model));

        const enabledCheckbox = document.getElementById('charRefEnabled');
        if (enabledCheckbox) {
            enabledCheckbox.checked = savedEnabled;
        }

        const modeSelect = document.getElementById('charRefMode');
        if (modeSelect && savedMode) {
            modeSelect.value = savedMode;
        }

        if (savedData) {
            if (!savedData.startsWith('iVBORw')) {
                // If it is not a PNG (doesn't start with standard PNG base64 prefix), convert it to PNG!
                console.log("检测到历史缓存的角色参考图不是 PNG 格式，正在自动转换...");
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const pngDataUrl = canvas.toDataURL('image/png');
                    this.currentCharRefImageBase64 = pngDataUrl.split(',')[1];
                    this.saveState(model);
                    
                    const previewImg = document.getElementById('charRefImagePreview');
                    if (previewImg) {
                        previewImg.src = pngDataUrl;
                        previewImg.classList.remove('hidden');
                    }
                    console.log("历史缓存图片已成功自动转换为 PNG。");
                };
                img.src = 'data:image/jpeg;base64,' + savedData;
            } else {
                this.currentCharRefImageBase64 = savedData;
                const previewImg = document.getElementById('charRefImagePreview');
                if (previewImg) {
                    previewImg.src = 'data:image/png;base64,' + savedData;
                    previewImg.classList.remove('hidden');
                }
            }

            const placeholder = document.getElementById('charRefImagePlaceholder');
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = document.getElementById('clearCharRefImageBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');

            const controls = document.getElementById('charRefControls');
            if (controls) controls.classList.remove('hidden');

            if (savedStrength) {
                const slider = document.getElementById('charRefStrength');
                if (slider) {
                    slider.value = savedStrength;
                    const valSpan = document.getElementById('charRefStrengthValue');
                    if (valSpan) valSpan.textContent = parseFloat(savedStrength).toFixed(2);
                }
            }

            if (savedFidelity) {
                const slider = document.getElementById('charRefFidelity');
                if (slider) {
                    slider.value = savedFidelity;
                    const valSpan = document.getElementById('charRefFidelityValue');
                    if (valSpan) valSpan.textContent = parseFloat(savedFidelity).toFixed(2);
                }
            }
        } else {
            this.clearCharRefImage(model);
        }

        this.toggleCharRefEnabled(model);
    }

    saveState(model) {
        this.store.setSetting(this.getCharRefKey('nai_char_ref_image', model), this.currentCharRefImageBase64 || '');
        this.store.setSetting(this.getCharRefKey('nai_char_ref_enabled', model), document.getElementById('charRefEnabled')?.checked.toString() || 'false');
        this.store.setSetting(this.getCharRefKey('nai_char_ref_mode', model), document.getElementById('charRefMode')?.value || 'character&style');
        this.store.setSetting(this.getCharRefKey('nai_char_ref_strength', model), document.getElementById('charRefStrength')?.value || '1.00');
        this.store.setSetting(this.getCharRefKey('nai_char_ref_fidelity', model), document.getElementById('charRefFidelity')?.value || '0.80');
    }

    clearCharRefImage(model) {
        this.currentCharRefImageBase64 = null;
        this.store.setSetting(this.getCharRefKey('nai_char_ref_image', model), '');
        
        const input = document.getElementById('charRefImageInput');
        if (input) input.value = '';

        const previewImg = document.getElementById('charRefImagePreview');
        if (previewImg) {
            previewImg.src = '';
            previewImg.classList.add('hidden');
        }

        const placeholder = document.getElementById('charRefImagePlaceholder');
        if (placeholder) placeholder.classList.remove('hidden');

        const clearBtn = document.getElementById('clearCharRefImageBtn');
        if (clearBtn) clearBtn.classList.add('hidden');

        const controls = document.getElementById('charRefControls');
        if (controls) controls.classList.add('hidden');
    }

    async handleCharRefImage(event, model) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const previewImg = document.getElementById('charRefImagePreview');
            const placeholder = document.getElementById('charRefImagePlaceholder');
            const clearBtn = document.getElementById('clearCharRefImageBtn');
            const controls = document.getElementById('charRefControls');

            if (placeholder) placeholder.classList.add('hidden');
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (controls) controls.classList.remove('hidden');

            const pngDataUrl = await processImageToPng(file);
            this.currentCharRefImageBase64 = pngDataUrl.split(',')[1];
            if (previewImg) {
                previewImg.src = pngDataUrl;
                previewImg.classList.remove('hidden');
            }
            this.saveState(model);
            this.onShowToast('角色参考图加载成功');

        } catch (err) {
            this.onShowToast('读取角色参考图失败: ' + err.message, 'error');
            this.clearCharRefImage(model);
        }
    }

    toggleCharRefEnabled(model) {
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const isEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        const container = document.getElementById('charRefImagePreviewContainer');
        const clearBtn = document.getElementById('clearCharRefImageBtn');

        if (container) {
            if (isEnabled) {
                container.classList.remove('opacity-50', 'pointer-events-none');
                if (clearBtn && this.currentCharRefImageBase64) clearBtn.classList.remove('hidden');
            } else {
                container.classList.add('opacity-50', 'pointer-events-none');
                if (clearBtn) clearBtn.classList.add('hidden');
            }
        }
        this.store.setSetting(this.getCharRefKey('nai_char_ref_enabled', model), isEnabled.toString());
    }

    toggleCharRefMode(model) {
        const modeSelect = document.getElementById('charRefMode');
        const mode = modeSelect ? modeSelect.value : 'character&style';
        this.store.setSetting(this.getCharRefKey('nai_char_ref_mode', model), mode);
    }

    initEventListeners(model) {
        const fidelitySlider = document.getElementById('charRefFidelity');
        const fidelityValSpan = document.getElementById('charRefFidelityValue');
        if (fidelitySlider) {
            fidelitySlider.replaceWith(fidelitySlider.cloneNode(true));
            const newFidelitySlider = document.getElementById('charRefFidelity');
            newFidelitySlider.addEventListener('input', (e) => {
                if (fidelityValSpan) fidelityValSpan.textContent = parseFloat(e.target.value).toFixed(2);
                this.store.setSetting(this.getCharRefKey('nai_char_ref_fidelity', model), e.target.value);
            });
            if (fidelityValSpan) fidelityValSpan.textContent = parseFloat(newFidelitySlider.value).toFixed(2);
        }

        const strengthSlider = document.getElementById('charRefStrength');
        const strengthValSpan = document.getElementById('charRefStrengthValue');
        if (strengthSlider) {
            strengthSlider.replaceWith(strengthSlider.cloneNode(true));
            const newStrengthSlider = document.getElementById('charRefStrength');
            newStrengthSlider.addEventListener('input', (e) => {
                if (strengthValSpan) strengthValSpan.textContent = parseFloat(e.target.value).toFixed(2);
                this.store.setSetting(this.getCharRefKey('nai_char_ref_strength', model), e.target.value);
            });
            if (strengthValSpan) strengthValSpan.textContent = parseFloat(newStrengthSlider.value).toFixed(2);
        }
    }

    isValidForModel(selectedVersion, hasCustomKey) {
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const charRefEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
        
        if (charRefEnabled && this.currentCharRefImageBase64) {
            if (selectedVersion !== 'v4.5') {
                return {
                    isValid: false,
                    error: "角色参考图功能目前仅支持 V4.5 模型，请切换到 V4.5 模型后重试。"
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

    getPayloadParams(model) {
        const enabledCheckbox = document.getElementById('charRefEnabled');
        const charRefEnabled = enabledCheckbox ? enabledCheckbox.checked : false;

        if (charRefEnabled && this.currentCharRefImageBase64 && model === 'v4.5') {
            const strengthEl = document.getElementById('charRefStrength');
            const fidelityEl = document.getElementById('charRefFidelity');
            const modeEl = document.getElementById('charRefMode');

            const strength = strengthEl ? parseFloat(strengthEl.value) : 1.0;
            const fidelity = fidelityEl ? parseFloat(fidelityEl.value) : 0.8;
            const mode = modeEl ? modeEl.value : 'character&style';

            return {
                director_reference_images: [this.currentCharRefImageBase64],
                director_reference_descriptions: [{
                    caption: {
                        base_caption: mode,
                        char_captions: []
                    },
                    legacy_uc: false
                }],
                director_reference_strength_values: [strength],
                director_reference_secondary_strength_values: [1.0 - fidelity],
                director_reference_information_extracted: [1.0]
            };
        }

        return {};
    }
}
