function processImageToPng(source) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            // 1. 寻找最贴合比例的官方三大标准分辨率之一
            const rd = [[1024, 1536], [1536, 1024], [1472, 1472]];
            const imgRatio = img.width / img.height;
            let targetSize = rd[0];
            for (const t of rd) {
                if (Math.abs(t[0] / t[1] - imgRatio) < Math.abs(targetSize[0] / targetSize[1] - imgRatio)) {
                    targetSize = t;
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

            // 2. 算绘制尺寸 (drawW, drawH)：最大不能超出画布边界
            const canvasRatio = canvas.width / canvas.height;
            let maxDrawW = canvas.width;
            let maxDrawH = canvas.height;
            if (imgRatio > canvasRatio) {
                maxDrawW = canvas.width;
                maxDrawH = Math.round(canvas.width / imgRatio);
            } else {
                maxDrawH = canvas.height;
                maxDrawW = Math.round(canvas.height * imgRatio);
            }

            // 如果图片本身小于等于这个限制边界，则不要强行放大它，保持原本的分辨率绘制；
            // 否则 (大图) 我们等比缩小到贴边限制
            let drawW = img.width;
            let drawH = img.height;

            if (img.width > maxDrawW || img.height > maxDrawH) {
                drawW = maxDrawW;
                drawH = maxDrawH;
            }

            // 对于仍然超大或者总像素数超出 1024*1024 的情况，我们等比限制到该总像素上限
            const maxPixels = 1024 * 1024;
            if (drawW * drawH > maxPixels) {
                const ratio = Math.sqrt(maxPixels / (drawW * drawH));
                drawW = Math.floor(drawW * ratio);
                drawH = Math.floor(drawH * ratio);
            }

            // 3. 居中绘制到 Canvas 黑色画布上
            const offsetX = (canvas.width - drawW) / 2;
            const offsetY = (canvas.height - drawH) / 2;
            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;

        if (source instanceof File || source instanceof Blob) {
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
            const img = new Image();
            img.onload = () => {
                const rd = [[1024, 1536], [1536, 1024], [1472, 1472]];
                const isCorrectSize = rd.some(t => t[0] === img.width && t[1] === img.height);
                const isPng = savedData.startsWith('iVBORw');

                if (isCorrectSize && isPng) {
                    this.currentCharRefImageBase64 = savedData;
                    const previewImg = document.getElementById('charRefImagePreview');
                    if (previewImg) {
                        previewImg.src = 'data:image/png;base64,' + savedData;
                        previewImg.classList.remove('hidden');
                    }
                } else {
                    console.log("检测到历史缓存的角色参考图尺寸或格式不符，正在自动转换...");
                    processImageToPng(savedData).then(pngDataUrl => {
                        this.currentCharRefImageBase64 = pngDataUrl.split(',')[1];
                        this.saveState(model);
                        
                        const previewImg = document.getElementById('charRefImagePreview');
                        if (previewImg) {
                            previewImg.src = pngDataUrl;
                            previewImg.classList.remove('hidden');
                        }
                        console.log("历史缓存图片已成功转换为符合 NAI V4.5 规范的 PNG。");
                    }).catch(err => {
                        console.error("历史缓存图片转换失败:", err);
                    });
                }
            };
            img.onerror = () => {
                console.error("加载历史缓存的角色参考图失败");
            };
            if (savedData.startsWith('data:')) {
                img.src = savedData;
            } else if (savedData.startsWith('iVBORw')) {
                img.src = 'data:image/png;base64,' + savedData;
            } else {
                img.src = 'data:image/jpeg;base64,' + savedData;
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
