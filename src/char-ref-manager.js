/**
 * Character Reference (Char Ref) Manager Module
 * Handles file reading, status rendering, and parameter serialization.
 */

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
        const savedFidelity = this.store.getSetting(this.getCharRefKey('nai_char_ref_fidelity', model));
        const savedStyleAware = this.store.getSetting(this.getCharRefKey('nai_char_ref_style_aware', model)) !== 'false';

        const enabledCheckbox = document.getElementById('charRefEnabled');
        if (enabledCheckbox) {
            enabledCheckbox.checked = savedEnabled;
        }

        const styleAwareCheckbox = document.getElementById('charRefStyleAware');
        if (styleAwareCheckbox) {
            styleAwareCheckbox.checked = savedStyleAware;
        }

        if (savedData) {
            this.currentCharRefImageBase64 = savedData;

            const previewImg = document.getElementById('charRefImagePreview');
            if (previewImg) {
                previewImg.src = 'data:image/jpeg;base64,' + savedData;
                previewImg.classList.remove('hidden');
            }

            const placeholder = document.getElementById('charRefImagePlaceholder');
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = document.getElementById('clearCharRefImageBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');

            const controls = document.getElementById('charRefControls');
            if (controls) controls.classList.remove('hidden');

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
        this.store.setSetting(this.getCharRefKey('nai_char_ref_style_aware', model), document.getElementById('charRefStyleAware')?.checked.toString() || 'true');
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

            if (this.compressImage && typeof this.compressImage === 'function') {
                const compressedDataUrl = await this.compressImage(file);
                this.currentCharRefImageBase64 = compressedDataUrl.split(',')[1];
                if (previewImg) {
                    previewImg.src = compressedDataUrl;
                    previewImg.classList.remove('hidden');
                }
                this.saveState(model);
                this.onShowToast('角色参考图加载成功');
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.currentCharRefImageBase64 = e.target.result.split(',')[1];
                    if (previewImg) {
                        previewImg.src = e.target.result;
                        previewImg.classList.remove('hidden');
                    }
                    this.saveState(model);
                    this.onShowToast('角色参考图加载成功');
                };
                reader.readAsDataURL(file);
            }

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

    toggleCharRefStyleAware(model) {
        const styleCheckbox = document.getElementById('charRefStyleAware');
        const isStyleAware = styleCheckbox ? styleCheckbox.checked : true;
        this.store.setSetting(this.getCharRefKey('nai_char_ref_style_aware', model), isStyleAware.toString());
    }

    initEventListeners(model) {
        const slider = document.getElementById('charRefFidelity');
        const valSpan = document.getElementById('charRefFidelityValue');
        if (slider) {
            slider.replaceWith(slider.cloneNode(true)); // 防止重复绑定
            const newSlider = document.getElementById('charRefFidelity');
            newSlider.addEventListener('input', (e) => {
                if (valSpan) valSpan.textContent = parseFloat(e.target.value).toFixed(2);
                this.store.setSetting(this.getCharRefKey('nai_char_ref_fidelity', model), e.target.value);
            });
            if (valSpan) valSpan.textContent = parseFloat(newSlider.value).toFixed(2);
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
            const fidelityEl = document.getElementById('charRefFidelity');
            const styleAwareEl = document.getElementById('charRefStyleAware');

            const fidelity = fidelityEl ? parseFloat(fidelityEl.value) : 0.8;
            const styleAware = styleAwareEl ? styleAwareEl.checked : true;

            const base_caption = styleAware ? "character&style" : "character";

            return {
                director_reference_images: [this.currentCharRefImageBase64],
                director_reference_descriptions: [{
                    caption: {
                        base_caption: base_caption,
                        char_captions: []
                    },
                    legacy_uc: false
                }],
                director_reference_strength_values: [1.0],
                director_reference_secondary_strength_values: [1.0 - fidelity],
                director_reference_information_extracted: [1.0]
            };
        }

        return {};
    }
}
