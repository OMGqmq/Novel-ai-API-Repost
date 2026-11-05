import { openModal, closeModal } from './modal-toast.js';

/**
 * Lightbox Controller Module
 * Encapsulates full-screen gallery image inspection, metadata parsing, parameter restoration, and quick actions.
 */
export function resolveLightboxMeta(item) {
    if (!item) return {};
    let meta = item.meta || item;
    if (typeof meta === 'string') {
        try {
            meta = JSON.parse(meta);
        } catch (e) {
            meta = {};
        }
    }
    const commentRaw = meta?.Comment || meta?.comment || item?.Comment || item?.comment;
    if (typeof commentRaw === 'string') {
        try {
            const parsedComment = JSON.parse(commentRaw);
            meta = { ...parsedComment, ...meta };
        } catch (e) {}
    } else if (typeof commentRaw === 'object' && commentRaw !== null) {
        meta = { ...commentRaw, ...meta };
    }
    return meta;
}

export function normalizeModelVersion(rawModel) {
    if (!rawModel || typeof rawModel !== 'string') return 'v3';
    const lower = rawModel.toLowerCase().trim();
    if (lower.includes('zimage')) return 'zimage';
    if (lower.includes('4.5') || lower.includes('4-5') || lower.includes('v4') || lower.includes('diffusion-4')) return 'v4.5';
    if (lower.includes('5') || lower.includes('v5') || lower.includes('diffusion-5')) return 'v5';
    if (lower.includes('3') || lower.includes('v3') || lower.includes('diffusion-3')) return 'v3';
    return 'v3';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function createLightboxController({
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
}) {
    let lightboxItems = [];
    let lightboxIndex = 0;

    async function openLightbox(item) {
        if (typeof item === 'string') {
            const found = (galleryController.galleryItems || []).find(x => x.image === item || x.imageUrl === item);
            if (found) {
                item = found;
            } else {
                item = {
                    id: 'chat_' + Date.now(),
                    image: item,
                    imageUrl: item,
                    prompt: '--',
                    model: 'v5',
                    isSavedToHistory: false,
                    meta: null
                };
            }
        } else if (item && typeof item === 'object') {
            if (!item.image && item.imageUrl) item.image = item.imageUrl;
            if (!item.imageUrl && item.image) item.imageUrl = item.image;
            if (!item.id) item.id = 'chat_' + Date.now();
        }

        if (item.isShowcase) {
            lightboxItems = appState.showcaseData.map(s => ({
                id: s.id,
                image: `images/${s.id}.png`,
                prompt: s.prompt,
                model: s.model || 'v3',
                isShowcase: true,
                meta: null
            }));
            lightboxIndex = lightboxItems.findIndex(x => x.id === item.id);
        } else {
            lightboxItems = galleryController.galleryItems || [];
            lightboxIndex = lightboxItems.findIndex(x => x.id === item.id || (item.image && (x.image === item.image || x.imageUrl === item.image)));
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

        const meta = resolveLightboxMeta(item);
        let rawModel = item.model || meta?.model || '';
        const charList = meta?.characterPrompts || meta?.char_captions || meta?.v4_prompt?.caption?.char_captions || item?.characterPrompts || item?.char_captions || null;
        if (!rawModel && (Array.isArray(charList) && charList.length > 0 || meta?.v4_prompt)) {
            rawModel = (meta?.noise_schedule === 'karras' || meta?.ucPresetId === 'heavy') ? 'v5' : 'v4.5';
        }
        const currentModelVer = normalizeModelVersion(rawModel || 'v3');
        const isMediumEffort = String(rawModel).includes('medium') || meta?.effort === 'medium' || item?.effort === 'medium';

        const modelEl = document.getElementById('lbInfoModel');
        if (modelEl) {
            const baseLabel = currentModelVer.toUpperCase();
            modelEl.textContent = currentModelVer === 'v5'
                ? `Model: ${baseLabel} (${isMediumEffort ? 'MEDIUM' : 'HIGH'})`
                : `Model: ${baseLabel}`;
        }

        const promptText = item.prompt || meta?.prompt || '';
        const negPrompt = meta?.negative_prompt !== undefined ? meta.negative_prompt : (meta?.uc !== undefined ? meta.uc : (item.negative_prompt || ''));
        const width = meta?.width || item.width || '--';
        const height = meta?.height || item.height || '--';
        const steps = meta?.steps !== undefined ? meta.steps : (item.steps !== undefined ? item.steps : '--');
        const scale = meta?.scale !== undefined ? meta.scale : (item.scale !== undefined ? item.scale : '--');
        const seed = meta?.seed !== undefined && meta.seed !== null ? meta.seed : (item.seed !== undefined && item.seed !== null ? item.seed : '--');

        const resEl = document.getElementById('lbInfoResolution');
        if (resEl) resEl.textContent = `${width} x ${height}`;

        const promptEl = document.getElementById('lightboxPrompt');
        if (promptEl) promptEl.textContent = promptText || '--';

        const negArea = document.getElementById('lightboxNegArea');
        const negEl = document.getElementById('lightboxNeg');
        if (negPrompt && negPrompt !== 'undefined') {
            if (negEl) negEl.textContent = negPrompt;
            if (negArea) negArea.style.display = 'block';
        } else {
            if (negArea) negArea.style.display = 'none';
        }

        const charArea = document.getElementById('lightboxCharArea');
        const charTitle = document.getElementById('lightboxCharTitle');
        const charListEl = document.getElementById('lightboxCharList');
        if (charArea && charListEl) {
            if (Array.isArray(charList) && charList.length > 0) {
                charArea.classList.remove('hidden');
                if (charTitle) {
                    charTitle.innerHTML = `<i data-lucide="users" class="w-3.5 h-3.5"></i> 角色提示词 (${charList.length}人)`;
                }
                charListEl.innerHTML = charList.map((c, i) => {
                    const p = c.prompt || c.char_caption || '';
                    let uc = c.negative_prompt || c.negative || c.uc || '';
                    if (!uc && meta?.v4_negative_prompt?.caption?.char_captions?.[i]) {
                        const negC = meta.v4_negative_prompt.caption.char_captions[i];
                        uc = negC.char_caption || negC.prompt || negC.uc || '';
                    }
                    let posLabel = '';
                    if (c.x !== undefined && c.y !== undefined) {
                        posLabel = `${Math.round(c.x * 100)}%, ${Math.round(c.y * 100)}%`;
                    } else if (c.centers && c.centers[0]) {
                        posLabel = `${Math.round(c.centers[0].x * 100)}%, ${Math.round(c.centers[0].y * 100)}%`;
                    } else if (c.center) {
                        posLabel = `${Math.round(c.center.x * 100)}%, ${Math.round(c.center.y * 100)}%`;
                    }
                    return `
                        <div class="p-2.5 bg-white/5 border border-white/10 rounded-xl space-y-1 text-xs">
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] font-semibold text-indigo-400">角色 ${i + 1} ${posLabel ? `<span class="text-slate-500 font-mono text-[9px]">· ${posLabel}</span>` : ''}</span>
                                <button type="button" onclick="navigator.clipboard.writeText(${JSON.stringify(p)}); window.showToast('角色提示词已复制', 'success')" class="text-slate-400 hover:text-white text-[10px] flex items-center gap-0.5">
                                    <i data-lucide="copy" class="w-2.5 h-2.5"></i>
                                </button>
                            </div>
                            <div class="text-slate-200 font-light break-all select-text text-[11px] leading-relaxed">${escapeHtml(p)}</div>
                            ${uc ? `<div class="text-slate-400 font-light break-all select-text text-[10px] pt-0.5 border-t border-white/5"><span class="text-slate-500 font-mono">UC:</span> ${escapeHtml(uc)}</div>` : ''}
                        </div>
                    `;
                }).join('');
            } else {
                charArea.classList.add('hidden');
                charListEl.innerHTML = '';
            }
        }

        const stepsEl = document.getElementById('lbMetaSteps');
        if (stepsEl) stepsEl.textContent = steps;
        const scaleEl = document.getElementById('lbMetaScale');
        if (scaleEl) scaleEl.textContent = scale;
        const seedEl = document.getElementById('lbMetaSeed');
        if (seedEl) seedEl.textContent = seed;

        const strengthContainer = document.getElementById('lbMetaStrengthContainer');
        const strengthEl = document.getElementById('lbMetaStrength');
        if (meta && meta.strength !== undefined && meta.strength !== null) {
            if (strengthEl) strengthEl.textContent = meta.strength;
            if (strengthContainer) strengthContainer.style.display = 'block';
        } else {
            if (strengthContainer) strengthContainer.style.display = 'none';
        }

        const deleteBtn = document.querySelector('[onclick="lightboxDelete()"]');
        const saveBtn = document.getElementById('lightboxSaveBtn');
        const isSaved = item.isSavedToHistory !== false && (item.id && !String(item.id).startsWith('chat_') && !String(item.id).startsWith('temp_'));

        if (item.isShowcase) {
            if (deleteBtn) deleteBtn.classList.add('hidden');
            if (saveBtn) saveBtn.classList.add('hidden');
        } else if (!isSaved) {
            if (deleteBtn) deleteBtn.classList.add('hidden');
            if (saveBtn) {
                saveBtn.classList.remove('hidden');
                saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-4 h-4"></i>`;
                saveBtn.title = "保存到历史画廊";
                saveBtn.disabled = false;
            }
        } else {
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (saveBtn) saveBtn.classList.add('hidden');
        }

        const hasFullParams = Boolean(
            meta && (meta.steps !== undefined || meta.scale !== undefined || meta.sampler || (meta.width && meta.height) || (Array.isArray(charList) && charList.length > 0))
        );
        const applyBtnText = document.getElementById('lightboxApplyBtnText');
        if (applyBtnText) {
            applyBtnText.textContent = hasFullParams ? "套用全部参数" : "套用提示词";
        }

        if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
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
        } else if (lightboxItems.length > 0 && !lightboxItems[0].isShowcase && galleryController.galleryHasMore) {
            const prevLength = lightboxItems.length;
            await galleryController.loadMoreGallery();
            lightboxItems = galleryController.galleryItems;
            if (lightboxItems.length > prevLength) {
                lightboxIndex = prevLength;
                renderLightboxCurrent();
            }
        }
    }

    function copyLightboxAllCharacters() {
        if (lightboxItems.length === 0) return;
        const item = lightboxItems[lightboxIndex];
        const meta = resolveLightboxMeta(item);
        const charList = meta?.characterPrompts || meta?.char_captions || meta?.v4_prompt?.caption?.char_captions || item?.characterPrompts || item?.char_captions;
        if (!Array.isArray(charList) || charList.length === 0) return;

        const text = charList.map((c, i) => {
            const p = c.prompt || c.char_caption || '';
            let uc = c.negative_prompt || c.negative || c.uc || '';
            if (!uc && meta?.v4_negative_prompt?.caption?.char_captions?.[i]) {
                const negC = meta.v4_negative_prompt.caption.char_captions[i];
                uc = negC.char_caption || negC.prompt || negC.uc || '';
            }
            return `[角色 ${i + 1}]\n提示词: ${p}${uc ? `\n负向: ${uc}` : ''}`;
        }).join('\n\n');

        navigator.clipboard.writeText(text).then(() => {
            window.showToast("已复制全部角色提示词！", "success");
        }).catch(err => {
            console.error("复制失败", err);
        });
    }

    function copyLightboxText(id) {
        const el = document.getElementById(id);
        if (!el) return;
        navigator.clipboard.writeText(el.textContent).then(() => {
            window.showToast("已复制到剪贴板！", "success");
        }).catch(err => {
            console.error("复制失败", err);
        });
    }

    function lightboxApplyParams() {
        if (lightboxItems.length === 0) return;
        const item = lightboxItems[lightboxIndex];
        const meta = resolveLightboxMeta(item);

        let rawModel = item.model || meta?.model || '';
        const charList = meta?.characterPrompts || meta?.char_captions || meta?.v4_prompt?.caption?.char_captions || item?.characterPrompts || item?.char_captions || null;
        if (!rawModel && (Array.isArray(charList) && charList.length > 0 || meta?.v4_prompt)) {
            rawModel = (meta?.noise_schedule === 'karras' || meta?.ucPresetId === 'heavy') ? 'v5' : 'v4.5';
        }
        const modelVer = normalizeModelVersion(rawModel || 'v3');
        if (window.setModel) window.setModel(modelVer);

        const promptText = item.prompt || meta?.prompt || '';
        els.prompt.value = promptText;
        els.prompt.dispatchEvent(new Event('input', { bubbles: true }));

        if (meta) {
            const negText = meta.negative_prompt !== undefined ? meta.negative_prompt : (meta.uc !== undefined ? meta.uc : null);
            if (negText !== null) {
                els.negative.value = negText || '';
                els.negative.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const stepsEl = document.getElementById('steps');
            if (stepsEl && meta.steps !== undefined) {
                stepsEl.value = meta.steps;
                const stepsVal = document.getElementById('stepsValue');
                if (stepsVal) stepsVal.textContent = meta.steps;
            }

            const scaleEl = document.getElementById('scale');
            if (scaleEl && meta.scale !== undefined) {
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
                        resEl.add(new Option(`${meta.width} x ${meta.height}`, val));
                    }
                    resEl.value = val;
                    resEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            const seedEl = document.getElementById('seed');
            if (seedEl) {
                seedEl.value = meta.seed !== undefined && meta.seed !== null ? meta.seed : '';
            }

            const samplerEl = document.getElementById('sampler');
            if (samplerEl && meta.sampler) {
                samplerEl.value = meta.sampler;
                samplerEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const smEl = document.getElementById('smEnabled');
            if (smEl && meta.sm !== undefined) {
                smEl.checked = meta.sm;
                smEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const smDynEl = document.getElementById('smDynEnabled');
            if (smDynEl && meta.sm_dyn !== undefined) {
                smDynEl.checked = meta.sm_dyn;
                smDynEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const cfgRescaleEl = document.getElementById('cfgRescale');
            if (cfgRescaleEl && meta.cfg_rescale !== undefined) {
                cfgRescaleEl.value = meta.cfg_rescale;
                const vEl = document.getElementById('cfgRescaleValue');
                if (vEl) vEl.textContent = parseFloat(meta.cfg_rescale).toFixed(2);
                cfgRescaleEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const uncondScaleEl = document.getElementById('uncondScale');
            if (uncondScaleEl && meta.uncond_scale !== undefined) {
                uncondScaleEl.value = meta.uncond_scale;
                const vEl = document.getElementById('uncondScaleValue');
                if (vEl) vEl.textContent = parseFloat(meta.uncond_scale).toFixed(2);
                uncondScaleEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const skipCfgEl = document.getElementById('skipCfg');
            if (skipCfgEl && meta.skip_cfg_above_sigma !== undefined) {
                const val = meta.skip_cfg_above_sigma === null ? '' : meta.skip_cfg_above_sigma;
                skipCfgEl.value = val;
                const vEl = document.getElementById('skipCfgValue');
                if (vEl) vEl.textContent = val;
                skipCfgEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            if (modelVer === 'v4.5') {
                const isExp = meta.v4_5_experimental === true || (meta.v4_5_experimental === undefined && (
                    meta.v4_prompt_use_coords !== undefined || meta.v4_prompt_use_order !== undefined || meta.v4_neg_use_order !== undefined
                ));
                const expCheckbox = document.getElementById('settingsV45ExperimentalCheckbox');
                if (expCheckbox) {
                    expCheckbox.checked = isExp;
                    if (window.toggleV45Experimental) window.toggleV45Experimental(isExp, true);
                }

                const eulerBugEl = document.getElementById('v45EulerBug');
                const eulerBugVal = meta.deliberate_euler_ancestral_bug !== undefined ? meta.deliberate_euler_ancestral_bug : false;
                if (eulerBugEl) {
                    eulerBugEl.checked = eulerBugVal;
                    eulerBugEl.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const preferBrownianEl = document.getElementById('v45PreferBrownian');
                const preferBrownianVal = meta.prefer_brownian !== undefined ? meta.prefer_brownian : true;
                if (preferBrownianEl) {
                    preferBrownianEl.checked = preferBrownianVal;
                    preferBrownianEl.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const useCoordsEl = document.getElementById('v45UseCoords');
                const useCoordsVal = meta.v4_prompt_use_coords !== undefined ? meta.v4_prompt_use_coords :
                                     (meta.v4_prompt ? meta.v4_prompt.use_coords : false);
                if (useCoordsEl) {
                    useCoordsEl.checked = useCoordsVal;
                    useCoordsEl.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const useOrderEl = document.getElementById('v45UseOrder');
                const useOrderVal = meta.v4_prompt_use_order !== undefined ? meta.v4_prompt_use_order :
                                    (meta.v4_prompt ? meta.v4_prompt.use_order : true);
                if (useOrderEl) {
                    useOrderEl.checked = useOrderVal;
                    useOrderEl.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const negUseOrderEl = document.getElementById('v45NegUseOrder');
                const negUseOrderVal = meta.v4_neg_use_order !== undefined ? meta.v4_neg_use_order :
                                       (meta.v4_negative_prompt ? meta.v4_negative_prompt.use_order : false);
                if (negUseOrderEl) {
                    negUseOrderEl.checked = negUseOrderVal;
                    negUseOrderEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (modelVer === 'v5') {
                const effortVal = String(meta.effort || (String(item.model || '').toLowerCase().includes('medium') ? 'medium' : 'high')).toLowerCase();
                const v5EffortEl = document.getElementById('v5Effort');
                if (v5EffortEl) {
                    v5EffortEl.value = effortVal;
                    v5EffortEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const v5UcEl = document.getElementById('v5UcPreset');
                if (v5UcEl && meta.ucPresetId) {
                    v5UcEl.value = meta.ucPresetId;
                    v5UcEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const v5QualityEl = document.getElementById('v5QualityPreset');
                if (v5QualityEl && meta.qualityPresetId) {
                    v5QualityEl.value = meta.qualityPresetId;
                    v5QualityEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            if (Array.isArray(charList) && charList.length > 0) {
                const container = document.getElementById('characterPromptsContainer');
                if (container) container.innerHTML = '';

                const useCoords = meta.use_coords !== undefined ? Boolean(meta.use_coords) :
                                  (meta.v4_prompt_use_coords !== undefined ? meta.v4_prompt_use_coords :
                                  (meta.v4_prompt ? meta.v4_prompt.use_coords : false));

                charList.forEach((char, idx) => {
                    const promptVal = char.prompt || char.char_caption || '';
                    let negVal = char.negative_prompt || char.negative || char.uc || '';
                    if (!negVal && meta.v4_negative_prompt?.caption?.char_captions) {
                        const negChar = meta.v4_negative_prompt.caption.char_captions[idx];
                        if (negChar) negVal = negChar.char_caption || negChar.prompt || negChar.uc || '';
                    }

                    let cx = 0.5;
                    let cy = 0.5;
                    if (typeof char.x === 'number') cx = char.x;
                    else if (char.center && typeof char.center.x === 'number') cx = char.center.x;
                    else if (char.centers?.[0] && typeof char.centers[0].x === 'number') cx = char.centers[0].x;

                    if (typeof char.y === 'number') cy = char.y;
                    else if (char.center && typeof char.center.y === 'number') cy = char.center.y;
                    else if (char.centers?.[0] && typeof char.centers[0].y === 'number') cy = char.centers[0].y;

                    const autoPos = char.autoPos !== undefined ? Boolean(char.autoPos) : !useCoords;
                    const enabled = char.enabled !== undefined ? Boolean(char.enabled) : true;
                    charPromptManager.addCharacterPromptRow(promptVal, negVal, cx, cy, autoPos, enabled, true);
                });

                const charWrapper = document.getElementById('characterPromptsWrapper');
                if (charWrapper) charWrapper.classList.remove('hidden');
                const charPanel = document.getElementById('characterPromptsPanel');
                const charChevron = document.getElementById('charChevron');
                if (charPanel) {
                    charPanel.classList.remove('hidden');
                    if (charChevron) charChevron.style.transform = 'rotate(180deg)';
                }

                charPromptManager.updateCharacterIndexLabels();
                charPromptManager.onModelChange(modelVer, { reload: false });
                charPromptManager.saveCharacterPromptsState(modelVer);
            }

            if (meta.director_reference_images && meta.director_reference_images.length > 0) {
                const charRefImgB64 = meta.director_reference_images[0];
                const str = meta.director_reference_strength_values?.[0] !== undefined ? meta.director_reference_strength_values[0] : 1.0;
                const secStr = meta.director_reference_secondary_strength_values?.[0] !== undefined ? meta.director_reference_secondary_strength_values[0] : 0.2;
                const fidelity = (1.0 - secStr);
                const desc = meta.director_reference_descriptions?.[0]
                    ? (meta.director_reference_descriptions[0].caption?.base_caption || meta.director_reference_descriptions[0])
                    : 'character&style';

                charRefManager.currentCharRefImageBase64 = charRefImgB64;
                store.setSetting(charRefManager.getCharRefKey('nai_char_ref_image', modelVer), charRefImgB64);
                store.setSetting(charRefManager.getCharRefKey('nai_char_ref_enabled', modelVer), 'true');
                store.setSetting(charRefManager.getCharRefKey('nai_char_ref_strength', modelVer), str.toString());
                store.setSetting(charRefManager.getCharRefKey('nai_char_ref_fidelity', modelVer), fidelity.toFixed(2));
                store.setSetting(charRefManager.getCharRefKey('nai_char_ref_mode', modelVer), typeof desc === 'string' ? desc : 'character&style');
                charRefManager.loadState(modelVer);
            }

            const vibeImgs = meta.reference_image_multiple || (meta.vibe_image ? [meta.vibe_image] : null);
            if (vibeImgs && vibeImgs.length > 0) {
                const vibeImgB64 = vibeImgs[0];
                const str = meta.reference_strength_multiple?.[0] !== undefined
                    ? meta.reference_strength_multiple[0]
                    : (meta.vibe_strength !== undefined ? meta.vibe_strength : 0.6);
                const info = meta.reference_information_extracted_multiple?.[0] !== undefined
                    ? meta.reference_information_extracted_multiple[0]
                    : (meta.vibe_info !== undefined ? meta.vibe_info : 1.0);

                vibeManager.currentVibeImageBase64 = vibeImgB64;
                store.setSetting(vibeManager.getVibeKey('nai_vibe_image', modelVer), vibeImgB64);
                store.setSetting(vibeManager.getVibeKey('nai_vibe_enabled', modelVer), 'true');
                store.setSetting(vibeManager.getVibeKey('nai_vibe_strength', modelVer), str.toString());
                store.setSetting(vibeManager.getVibeKey('nai_vibe_info', modelVer), info.toString());
                vibeManager.loadState(modelVer);
            }
        }

        const applyBtnText = document.getElementById('lightboxApplyBtnText');
        if (applyBtnText) applyBtnText.textContent = "已套用 ✓";
        window.showToast("生成参数已载入主控制台！", "success");
        setTimeout(() => {
            closeLightbox();
            ui.toggleMobileControls(true);
        }, 200);
    }

    function lightboxDownload() {
        if (lightboxItems.length === 0) return;
        const item = lightboxItems[lightboxIndex];
        const filename = `novelai-${item.id || Date.now()}.png`;
        triggerDownload(item.image || item.imageUrl, filename);
    }

    async function lightboxSaveCurrentToGallery() {
        if (lightboxItems.length === 0 || lightboxIndex < 0 || lightboxIndex >= lightboxItems.length) return;
        const item = lightboxItems[lightboxIndex];
        if (item.isShowcase) return;

        const saveBtn = document.getElementById('lightboxSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`;
            if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
        }

        try {
            if (typeof window.saveImageItemToGallery === 'function') {
                const saved = await window.saveImageItemToGallery(item);
                item.isSavedToHistory = true;
                if (saved?.id) item.id = saved.id;

                if (window.aiChatManager && window.aiChatManager.messages) {
                    for (const m of window.aiChatManager.messages) {
                        if (m.tool_calls) {
                            for (const tc of m.tool_calls) {
                                if (tc.imageUrl === (item.imageUrl || item.image)) {
                                    tc.isSavedToHistory = true;
                                    if (saved?.id) tc.id = saved.id;
                                }
                                if (Array.isArray(tc.images)) {
                                    for (const img of tc.images) {
                                        if (img.imageUrl === (item.imageUrl || item.image)) {
                                            img.isSavedToHistory = true;
                                            if (saved?.id) img.id = saved.id;
                                            if (tc.images[tc.currentIndex] === img) {
                                                tc.isSavedToHistory = true;
                                                if (saved?.id) tc.id = saved.id;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    window.aiChatManager.saveHistory();
                    window.aiChatManager.renderMessages();
                }

                renderLightboxCurrent();
            }
        } catch (err) {
            console.error("Lightbox save error:", err);
            if (window.showToast) window.showToast(`保存失败: ${err.message}`, "error");
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-4 h-4"></i>`;
                if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            }
        }
    }

    async function lightboxDelete() {
        if (lightboxItems.length === 0) return;
        const item = lightboxItems[lightboxIndex];
        if (item.isShowcase) return;

        if (!(await window.showConfirm("您确定要从历史图库中删除这张图片吗？该操作不可撤销。", "删除图库图片", "trash-2"))) return;

        try {
            const deletedId = item.id;
            await store.deleteImage(deletedId);
            lightboxItems.splice(lightboxIndex, 1);

            if (lightboxItems.length === 0) {
                closeLightbox();
            } else {
                if (lightboxIndex >= lightboxItems.length) {
                    lightboxIndex = lightboxItems.length - 1;
                }
                renderLightboxCurrent();
            }
            galleryController.removeImage(deletedId);
        } catch (e) {
            console.error("Failed to delete lightbox image", e);
        }
    }

    function lightboxCreate(type) {
        if (lightboxItems.length === 0) return;
        const item = lightboxItems[lightboxIndex];

        closeLightbox();
        ui.switchRightView('preview');

        const imgUrl = item.image || item.imageUrl;
        if (imgUrl) ui.showResultImage(imgUrl);

        appState.currentImageId = item.id;
        appState.currentImageData = { ...item, imageUrl: imgUrl };
        window.lastSelectedImageUrl = imgUrl;
        ui.showImageActions(true);

        if (type === 'enhance') postProcess.openEnhanceModal();
        else if (type === 'upscale') postProcess.doUpscale();
        else if (type === 'inpaint') inpaintEditor.open();
        else if (type === 'outpaint') outpaintEditor.open();
        else if (type === 'lineart') postProcess.doAugment('lineart');
        else if (type === 'sketch') postProcess.doAugment('sketch');
    }

    function toggleLightboxSidebarMobile() {
        const sidebar = document.getElementById('lightboxSidebar');
        if (sidebar) sidebar.classList.toggle('expanded');
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('imageLightboxModal');
            if (modal && modal.classList.contains('modal-active')) {
                if (e.key === 'ArrowLeft') prevLightboxImage();
                else if (e.key === 'ArrowRight') nextLightboxImage();
                else if (e.key === 'Escape') closeLightbox();
            }
        });

        let touchStartX = 0;
        const lightboxModal = document.getElementById('imageLightboxModal');
        if (lightboxModal) {
            lightboxModal.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            lightboxModal.addEventListener('touchend', (e) => {
                const touchEndX = e.changedTouches[0].screenX;
                const swipeThreshold = 50;
                if (touchEndX < touchStartX - swipeThreshold) nextLightboxImage();
                else if (touchEndX > touchStartX + swipeThreshold) prevLightboxImage();
            }, { passive: true });
        }
    }

    return {
        openLightbox,
        closeLightbox,
        resolveLightboxMeta,
        normalizeModelVersion,
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
    };
}
