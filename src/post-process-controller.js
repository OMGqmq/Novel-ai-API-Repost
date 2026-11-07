/**
 * Post-Process Controller Module
 * Encapsulates Canvas Image Augmentation (lineart/sketch), AI Enhance, and 4x Upscaling.
 */
export function createPostProcessController({
    ui,
    els,
    engine,
    store,
    appState,
    collectAdvancedAndModelParams,
    saveToHistory
}) {
    function _getAuthsToTry() {
        const authBase = {
            adminToken: store.getSetting('nai_admin_token'),
            userKey: store.getSetting('nai_user_key'),
            userToken: localStorage.getItem('nai_user_token') || ""
        };
        const customApiKeyRaw = store.getSetting('nai_custom_api_key');
        const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
        return customApiKeys.length > 0
            ? customApiKeys.map(key => ({ ...authBase, customApiKey: key }))
            : [{ ...authBase, customApiKey: "" }];
    }

    async function _imageUrlToCappedBase64(imageUrl) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            const reader = new FileReader();
            reader.onloadend = () => { img.src = reader.result; };
            reader.readAsDataURL(blob);
        });

        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w * h > 1024 * 1024) {
            const ratio = Math.sqrt((1024 * 1024) / (w * h));
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return { base64Data: canvas.toDataURL('image/png').split(',')[1], width: w, height: h };
    }

    function getActiveCanvasImage() {
        if (ui.els.singleResultImg && !ui.els.singleResultArea.classList.contains('hidden') && ui.els.singleResultImg.src) {
            const src = ui.els.singleResultImg.src;
            if (src && !src.startsWith('chrome-extension') && src !== window.location.href) {
                return src;
            }
        }
        if (ui.els.resultGrid && !ui.els.resultGrid.classList.contains('hidden')) {
            const selectedImg = ui.els.resultGrid.querySelector('img.border-blue-500');
            if (selectedImg && selectedImg.src) return selectedImg.src;
            const firstImg = ui.els.resultGrid.querySelector('img');
            if (firstImg && firstImg.src) return firstImg.src;
        }
        if (typeof window !== 'undefined' && window.lastSelectedImageUrl) {
            return window.lastSelectedImageUrl;
        }
        return null;
    }

    async function doAugment(reqType) {
        if (!appState.currentImageData || !(appState.currentImageData.imageUrl || appState.currentImageData.image)) return;
        const imageUrl = appState.currentImageData.imageUrl || appState.currentImageData.image;
        const authsToTry = _getAuthsToTry();

        ui.setLoading(true, "处理中...");
        try {
            const { base64Data, width: w, height: h } = await _imageUrlToCappedBase64(imageUrl);
            const params = { req_type: reqType, width: w, height: h, image: base64Data };

            let result = null;
            let lastError = null;
            for (const auth of authsToTry) {
                try {
                    result = await engine.augment(params, auth);
                    break;
                } catch (err) {
                    console.warn('Augment API Key failed, trying next...', err);
                    lastError = err;
                }
            }
            if (!result) throw lastError || new Error("所有配置的 API Key 均请求失败");

            if (result.userRole) ui.updateCreditDisplay(result.userRole);

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

    function openEnhanceModal() {
        const targetSrc = getActiveCanvasImage();
        if (!targetSrc) {
            alert("请先生成或在画廊中选择一张图片以进行增强");
            return;
        }
        const modal = document.getElementById('enhanceModal');
        if (!modal) return;
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('modal-active');
            if (modal.firstElementChild) modal.firstElementChild.classList.remove('opacity-0');
            const content = modal.querySelector('.custom-modal-content');
            if (content) {
                content.classList.remove('opacity-0', 'scale-95');
                content.classList.add('opacity-100', 'scale-100');
            }
        }, 10);
    }

    function closeEnhanceModal() {
        const modal = document.getElementById('enhanceModal');
        if (!modal) return;
        modal.classList.remove('modal-active');
        if (modal.firstElementChild) modal.firstElementChild.classList.add('opacity-0');
        const content = modal.querySelector('.custom-modal-content');
        if (content) {
            content.classList.remove('opacity-100', 'scale-100');
            content.classList.add('opacity-0', 'scale-95');
        }
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    function setEnhancePreset(strength, noise) {
        const strengthSlider = document.getElementById('enhanceStrengthSlider');
        const noiseSlider = document.getElementById('enhanceNoiseSlider');
        const strengthVal = document.getElementById('enhanceStrengthVal');
        const noiseVal = document.getElementById('enhanceNoiseVal');

        if (strengthSlider) strengthSlider.value = strength;
        if (noiseSlider) noiseSlider.value = noise;
        if (strengthVal) strengthVal.textContent = parseFloat(strength).toFixed(2);
        if (noiseVal) noiseVal.textContent = parseFloat(noise).toFixed(2);

        document.querySelectorAll('.enhance-preset-btn').forEach(btn => {
            if (parseFloat(btn.dataset.strength) === parseFloat(strength)) {
                btn.classList.add('bg-slate-900', 'dark:bg-white', 'text-white', 'dark:text-slate-900', 'shadow-md', 'border-slate-900', 'dark:border-white', 'active-preset');
                btn.classList.remove('bg-gray-100', 'dark:bg-slate-800', 'text-gray-700', 'dark:text-gray-200');
                const sub = btn.querySelector('span');
                if (sub) { sub.classList.remove('text-gray-400'); sub.classList.add('text-slate-300', 'dark:text-slate-500'); }
            } else {
                btn.classList.remove('bg-slate-900', 'dark:bg-white', 'text-white', 'dark:text-slate-900', 'shadow-md', 'border-slate-900', 'dark:border-white', 'active-preset');
                btn.classList.add('bg-gray-100', 'dark:bg-slate-800', 'text-gray-700', 'dark:text-gray-200');
                const sub = btn.querySelector('span');
                if (sub) { sub.classList.add('text-gray-400'); sub.classList.remove('text-slate-300', 'dark:text-slate-500'); }
            }
        });
    }

    function initEnhanceSliders() {
        const strengthSlider = document.getElementById('enhanceStrengthSlider');
        const noiseSlider = document.getElementById('enhanceNoiseSlider');
        const strengthVal = document.getElementById('enhanceStrengthVal');
        const noiseVal = document.getElementById('enhanceNoiseVal');

        if (strengthSlider && strengthVal) {
            strengthSlider.addEventListener('input', () => {
                strengthVal.textContent = parseFloat(strengthSlider.value).toFixed(2);
                document.querySelectorAll('.enhance-preset-btn').forEach(btn => {
                    const match = Math.abs(parseFloat(btn.dataset.strength) - parseFloat(strengthSlider.value)) < 0.01;
                    if (!match) {
                        btn.classList.remove('bg-slate-900', 'dark:bg-white', 'text-white', 'dark:text-slate-900', 'shadow-md', 'border-slate-900', 'dark:border-white', 'active-preset');
                        btn.classList.add('bg-gray-100', 'dark:bg-slate-800', 'text-gray-700', 'dark:text-gray-200');
                        const sub = btn.querySelector('span');
                        if (sub) { sub.classList.add('text-gray-400'); sub.classList.remove('text-slate-300', 'dark:text-slate-500'); }
                    }
                });
            });
        }
        if (noiseSlider && noiseVal) {
            noiseSlider.addEventListener('input', () => {
                noiseVal.textContent = parseFloat(noiseSlider.value).toFixed(2);
            });
        }
    }

    async function doEnhance() {
        const targetSrc = getActiveCanvasImage();
        if (!targetSrc) {
            alert("请先生成或选择一张图片以进行增强");
            return;
        }

        const strengthSlider = document.getElementById('enhanceStrengthSlider');
        const noiseSlider = document.getElementById('enhanceNoiseSlider');
        const strength = strengthSlider ? parseFloat(strengthSlider.value) : 0.35;
        const noise = noiseSlider ? parseFloat(noiseSlider.value) : 0.0;

        closeEnhanceModal();
        ui.setLoading(true, "图像增强");

        try {
            const { base64Data, width: w, height: h } = await _imageUrlToCappedBase64(targetSrc);
            const selectedVersion = document.getElementById('modelValue').value;
            const promptText = els.prompt.value.trim() || appState.currentImageData?.prompt || "";
            const extraParams = collectAdvancedAndModelParams(selectedVersion);

            const params = {
                version: selectedVersion,
                prompt: promptText,
                negative_prompt: els.negative ? els.negative.value.trim() : "",
                width: w,
                height: h,
                steps: parseInt(els.steps.value) || 28,
                scale: parseFloat(els.scale.value) || 1.9,
                sampler: els.sampler ? els.sampler.value : "k_euler_ancestral",
                ...extraParams,
                action: 'img2img',
                image: base64Data,
                strength,
                noise,
                seed: Math.floor(Math.random() * 4294967295),
                extra_noise_seed: Math.floor(Math.random() * 4294967295)
            };

            const authsToTry = _getAuthsToTry();
            let result = null;
            let lastError = null;
            for (const auth of authsToTry) {
                try {
                    result = await engine.generate(params, auth);
                    break;
                } catch (err) {
                    console.warn('Enhance API Key failed, trying next...', err);
                    lastError = err;
                }
            }
            if (!result) throw lastError || new Error("所有配置的 API Key 均请求失败");

            if (result.userRole) ui.updateCreditDisplay(result.userRole);

            const reader2 = new FileReader();
            reader2.readAsDataURL(result.blob);
            reader2.onloadend = async () => {
                await saveToHistory(reader2.result, `[Enhance] ` + promptText, selectedVersion, result, true);
            };

            ui.showResultImages([result], (selected) => {
                appState.currentImageData = selected;
                if (selected.id) appState.currentImageId = selected.id;
                window.lastSelectedImageUrl = selected.imageUrl;
            });
        } catch (err) {
            console.error(err);
            if (err.message.includes('429')) alert("⚠️ 请求频繁,请稍候重试");
            else alert("增强失败: " + err.message);
        } finally {
            ui.setLoading(false);
        }
    }

    async function doUpscale() {
        const targetSrc = getActiveCanvasImage();
        if (!targetSrc) {
            alert("请先生成或选择一张图片以进行 4x 超分放大");
            return;
        }

        ui.setLoading(true, "4× 放大");
        try {
            const { base64Data, width: w, height: h } = await _imageUrlToCappedBase64(targetSrc);
            const selectedVersion = document.getElementById('modelValue')?.value || appState.currentImageData?.model || "v3";
            const params = {
                image: base64Data,
                width: w,
                height: h,
                scale: 4,
                version: selectedVersion,
                model: selectedVersion
            };

            const authsToTry = _getAuthsToTry();
            let result = null;
            let lastError = null;
            for (const auth of authsToTry) {
                try {
                    result = await engine.upscale(params, auth);
                    break;
                } catch (err) {
                    console.warn('Upscale API Key failed, trying next...', err);
                    lastError = err;
                }
            }
            if (!result) throw lastError || new Error("所有配置的 API Key 均请求失败");

            if (result.userRole) ui.updateCreditDisplay(result.userRole);

            const promptText = appState.currentImageData?.prompt || "";
            const reader2 = new FileReader();
            reader2.readAsDataURL(result.blob);
            reader2.onloadend = async () => {
                await saveToHistory(reader2.result, `[Upscaled 4x] ` + promptText, selectedVersion, result, true);
            };

            ui.showResultImages([result], (selected) => {
                appState.currentImageData = selected;
                if (selected.id) appState.currentImageId = selected.id;
                window.lastSelectedImageUrl = selected.imageUrl;
            });
        } catch (err) {
            console.error(err);
            if (err.message.includes('429')) alert("⚠️ 请求频繁,请稍候重试");
            else alert("超分辨率放大失败: " + err.message);
        } finally {
            ui.setLoading(false);
        }
    }

    return {
        getActiveCanvasImage,
        doAugment,
        openEnhanceModal,
        closeEnhanceModal,
        setEnhancePreset,
        initEnhanceSliders,
        doEnhance,
        doUpscale
    };
}
