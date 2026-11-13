/**
 * UI Controller Module
 * Handles DOM element references, class toggling, and view state management.
 */
export class UIController {
    constructor() {
        this.els = this._getElements();
        this.currentRightView = 'preview';
        this.isControlsExpanded = false;
        this.currentGalleryTab = 'showcase';

        this._compareBeforeUrl = null;
        this._compareAfterUrl = null;
        this._isCompareSplitOpen = false;
        this._isComparePeeking = false;
        this._compareSplitPct = 50;
        this._isFilmstripCollapsed = false;

        this._initBasicBindings();
        this._initCustomSelects();
        this._initCompareInteractions();
    }

    _getElements() {
        return {
            mobileControls: document.getElementById('mobileControls'),
            mobileBackdrop: document.getElementById('mobileBackdrop'),
            viewToggle: document.getElementById('viewToggle'),
            viewBtnPreview: document.getElementById('viewBtnPreview'),
            viewBtnHistory: document.getElementById('viewBtnHistory'),
            previewArea: document.getElementById('previewArea'),
            historyArea: document.getElementById('historyArea'),
            zipBtn: document.getElementById('zipBtn'),
            clearBtn: document.getElementById('clearBtn'),
            dlBtn: document.getElementById('dlBtn'),
            canvasDeleteBtn: document.getElementById('canvasDeleteBtn'),
            prompt: document.getElementById('prompt'),
            negative: document.getElementById('negativePrompt'),
            resolution: document.getElementById('resolution'),
            steps: document.getElementById('steps'),
            scale: document.getElementById('scale'),
            sampler: document.getElementById('sampler'),
            deskBtn: document.getElementById('desktopGenerateBtn'),
            floatBtn: document.getElementById('floatingGenerateBtn'),
            resultGrid: document.getElementById('resultGrid'), // 替换单个 resultImg
            singleResultArea: document.getElementById('singleResultArea'),
            singleResultImg: document.getElementById('singleResultImg'),
            backToGridBtn: document.getElementById('backToGridBtn'),
            placeholder: document.getElementById('placeholder'),
            imageActions: document.getElementById('imageActions'),
            stepsVal: document.getElementById('stepsValue'),
            scaleVal: document.getElementById('scaleValue'),
            galleryGrid: document.getElementById('galleryGrid'),
            emptyGallery: document.getElementById('emptyGallery'),
            adminLockBtn: document.getElementById('adminLockBtn'),
            adminLockBtnMobile: document.getElementById('adminLockBtnMobile'),
            adminControls: document.getElementById('adminControls'),
            batchCount: document.getElementById('batchCount'),
            batchValue: document.getElementById('batchValue'),
            keyBtn: document.getElementById('keyBtn'),
            keyBtnMobile: document.getElementById('keyBtnMobile'),
            tagSearchInput: document.getElementById('tagSearchInput'),
            tagSearchBtn: document.getElementById('tagSearchBtn'),
            tagResults: document.getElementById('tagResults'),
            sideDrawer: document.getElementById('sideDrawer'),
            drawerOverlay: document.getElementById('drawerOverlay'),
            tabSearch: document.getElementById('tab-search'),
            tabNotebook: document.getElementById('tab-notebook'),
            tabRandom: document.getElementById('tab-random'),
            viewSearch: document.getElementById('view-search'),
            viewNotebook: document.getElementById('view-notebook'),
            viewRandom: document.getElementById('view-random'),
            notebookList: document.getElementById('notebookList'),
            creditDisplayMobile: document.getElementById('creditDisplayMobile'),
            creditDisplayDesktop: document.getElementById('creditDisplayDesktop'),
            // New settings/credentials related DOM references:
            noise_schedule: document.getElementById('noise_schedule'),
            strength: document.getElementById('strength'),
            noise: document.getElementById('noise'),
            strengthVal: document.getElementById('strengthValue'),
            noiseVal: document.getElementById('noiseValue'),
            vibeStrength: document.getElementById('vibeStrength'),
            vibeStrengthVal: document.getElementById('vibeStrengthValue'),
            modelValue: document.getElementById('modelValue'),
            modelBadge: document.getElementById('modelBadge'),
            modelStatusMini: document.getElementById('modelStatusMini'),
            settingsV45ExperimentalCheckbox: document.getElementById('settingsV45ExperimentalCheckbox'),
            settingsKeyConcurrentCheckbox: document.getElementById('settingsKeyConcurrentCheckbox'),
            aiHelperBaseUrl: document.getElementById('aiHelperBaseUrl'),
            aiHelperApiKey: document.getElementById('aiHelperApiKey'),
            aiHelperModel: document.getElementById('aiHelperModel'),
            aiHelperSystemPrompt: document.getElementById('aiHelperSystemPrompt'),
            v45EulerBug: document.getElementById('v45EulerBug'),
            v45PreferBrownian: document.getElementById('v45PreferBrownian'),
            v45UseCoords: document.getElementById('v45UseCoords'),
            v45UseOrder: document.getElementById('v45UseOrder'),
            v45NegUseOrder: document.getElementById('v45NegUseOrder'),
            bypassLimitsEnabled: document.getElementById('bypassLimitsEnabled'),
            bypassLimitsIcon: document.getElementById('bypassLimitsIcon'),
            bypassLimitsBadge: document.getElementById('bypassLimitsBadge'),
            bypassLimitsHint: document.getElementById('bypassLimitsHint'),
            smEnabled: document.getElementById('smEnabled'),
            smDynEnabled: document.getElementById('smDynEnabled'),
            qualityToggleEnabled: document.getElementById('qualityToggleEnabled'),
            dynThresholdEnabled: document.getElementById('dynThresholdEnabled'),
            cfgRescale: document.getElementById('cfgRescale'),
            uncondScale: document.getElementById('uncondScale'),
            skipCfg: document.getElementById('skipCfg'),
            cfgRescaleValue: document.getElementById('cfgRescaleValue'),
            uncondScaleValue: document.getElementById('uncondScaleValue'),
            skipCfgValue: document.getElementById('skipCfgValue'),
            seed: document.getElementById('seed'),
            ziTransparent: document.getElementById('ziTransparent'),
            ziEnhance: document.getElementById('ziEnhance'),
            ziQuality: document.getElementById('ziQuality'),
            adminTokenInput: document.getElementById('adminTokenInput'),
            adminTokenStatus: document.getElementById('adminTokenStatus'),
            adminTokenClearBtn: document.getElementById('adminTokenClearBtn'),
            userKeyInput: document.getElementById('userKeyInput'),
            userKeyStatus: document.getElementById('userKeyStatus'),
            userKeyClearBtn: document.getElementById('userKeyClearBtn'),
            settingsLowPerfCheckbox: document.getElementById('settingsLowPerfCheckbox'),
            lowPerfBtn: document.getElementById('lowPerfBtn'),
            lowPerfBtnMobile: document.getElementById('lowPerfBtnMobile'),
            outpaintArea: document.getElementById('outpaintArea'),
            characterPromptsWrapper: document.getElementById('characterPromptsWrapper'),
            skipCfgContainer: document.getElementById('skipCfgContainer'),
            v45ParamsContainer: document.getElementById('v45ParamsContainer'),
            v5ParamsContainer: document.getElementById('v5ParamsContainer'),
            v5Effort: document.getElementById('v5Effort'),
            v5EffortBadge: document.getElementById('v5EffortBadge'),
            v5UcPreset: document.getElementById('v5UcPreset'),
            v5QualityPreset: document.getElementById('v5QualityPreset'),
            smeaContainer: document.getElementById('smeaContainer'),
            negativePromptWrapper: document.getElementById('negativePromptWrapper'),
            stepsWrapper: document.getElementById('stepsWrapper'),
            samplerSettingsWrapper: document.getElementById('samplerSettingsWrapper'),
            img2imgSettingsWrapper: document.getElementById('img2imgSettingsWrapper'),
            vibeSettingsWrapper: document.getElementById('vibeSettingsWrapper'),
            zimageSettingsWrapper: document.getElementById('zimageSettingsWrapper'),
            advancedSettingsWrapper: document.getElementById('advancedSettingsWrapper'),
            adminPanelBtn: document.getElementById('adminPanelBtn'),
            adminPanelBtnMobile: document.getElementById('adminPanelBtnMobile'),
            adminPanelEntrance: document.getElementById('adminPanelEntrance'),
            apiBtn: document.getElementById('apiBtn'),
            apiBtnMobile: document.getElementById('apiBtnMobile'),
            canvasCompareBtn: document.getElementById('canvasCompareBtn'),
            canvasCompareSep: document.getElementById('canvasCompareSep'),
            canvasCompareOverlay: document.getElementById('canvasCompareOverlay'),
            canvasBeforeImg: document.getElementById('canvasBeforeImg'),
            canvasCompareDivider: document.getElementById('canvasCompareDivider'),
            canvasFilmstripDock: document.getElementById('canvasFilmstripDock'),
            filmstripToggleBtn: document.getElementById('filmstripToggleBtn'),
            filmstripToggleSvg: document.getElementById('filmstripToggleSvg'),
            filmstripInner: document.getElementById('filmstripInner'),
            filmstripTrack: document.getElementById('filmstripTrack'),
            filmstripApplyParamsBtn: document.getElementById('filmstripApplyParamsBtn')
        };
    }

    _initBasicBindings() {
        const { steps, stepsVal, scale, scaleVal, batchCount, batchValue, resolution } = this.els;
        if (steps) {
            steps.addEventListener('input', e => {
                if (stepsVal) stepsVal.textContent = e.target.value;
                this.updateGenerateButtonText();
            });
        }
        if (scale) scale.addEventListener('input', e => scaleVal.textContent = parseFloat(e.target.value).toFixed(1));
        if (batchCount) batchCount.addEventListener('input', e => batchValue.textContent = e.target.value);
        if (resolution) {
            resolution.addEventListener('change', () => {
                this.updateGenerateButtonText();
            });
        }
        this.updateGenerateButtonText();
    }

    _initCustomSelects() {
        const selects = document.querySelectorAll('select');
        selects.forEach(selectEl => {
            if (!selectEl || selectEl.dataset.customized === 'true') return;
            selectEl.dataset.customized = 'true';

            // Hide original select
            selectEl.classList.add('hidden');

            // Create custom select container
            const container = document.createElement('div');
            const originalClasses = selectEl.className || '';
            const hasWFull = originalClasses.includes('w-full');
            container.className = `custom-select-container relative ${hasWFull ? 'w-full' : 'inline-block min-w-[120px]'}`;
            if (selectEl.id) {
                container.setAttribute('data-select-id', selectEl.id);
            }

            // Get selected option
            const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
            const selectedText = selectedOpt ? selectedOpt.textContent : '';

            // Create trigger button
            const trigger = document.createElement('button');
            trigger.type = 'button';
            
            // Extract spacing, styling, font size classes from original select to match layout
            const classesToCopy = [];
            originalClasses.split(' ').forEach(cls => {
                const c = cls.trim();
                if (!c || c === 'art-input' || c.startsWith('bg-') || c.startsWith('border-') || c.startsWith('w-') || c.startsWith('cursor-')) return;
                const cleanC = c.includes(':') ? c.split(':').pop() : c;
                if (cleanC.startsWith('py-') || cleanC.startsWith('px-') || cleanC.startsWith('rounded-') || cleanC.startsWith('text-') || cleanC.startsWith('font-') || cleanC.startsWith('shadow-') || cleanC.startsWith('h-')) {
                    classesToCopy.push(c);
                }
            });

            const extraClasses = classesToCopy.length > 0 ? ` ${classesToCopy.join(' ')}` : ' px-4 py-3 rounded-xl text-xs font-medium';
            trigger.className = `custom-select-trigger art-input w-full flex items-center justify-between outline-none shadow-sm cursor-pointer${extraClasses}`;
            trigger.innerHTML = `
                <span class="custom-select-label truncate">${selectedText}</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400 custom-select-arrow transition-transform duration-200 flex-shrink-0 ml-1.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            `;

            // Create options panel
            const optionsPanel = document.createElement('div');
            optionsPanel.className = 'custom-select-options absolute left-0 right-0 mt-1.5 py-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-gray-100 dark:border-slate-800 rounded-xl shadow-art z-[60] opacity-0 scale-95 pointer-events-none transition-all duration-150 origin-top custom-scroll overflow-y-auto max-h-60';

            const syncOptions = () => {
                optionsPanel.innerHTML = '';
                Array.from(selectEl.options).forEach(opt => {
                    const optEl = document.createElement('div');
                    optEl.className = 'custom-option px-4 py-2.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 flex items-center justify-between cursor-pointer transition-colors duration-150';
                    optEl.setAttribute('data-value', opt.value);
                    
                    const isSelected = opt.value === selectEl.value;
                    optEl.innerHTML = `
                        <span>${opt.textContent}</span>
                        <svg class="w-3.5 h-3.5 text-yellow-500 custom-option-check ${isSelected ? '' : 'hidden'}" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    `;

                    optEl.onclick = (e) => {
                        e.stopPropagation();
                        selectEl.value = opt.value;
                        // Fire change event to notify other modules
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        container.classList.remove('open');
                    };

                    optionsPanel.appendChild(optEl);
                });
            };

            // Initial options render
            syncOptions();

            // Handle dropdown toggle click
            trigger.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.custom-select-container').forEach(c => {
                    if (c !== container) c.classList.remove('open');
                });
                container.classList.toggle('open');
            };

            // Sync custom UI when the native select's value changes externally
            selectEl.addEventListener('change', () => {
                const updatedOpt = selectEl.options[selectEl.selectedIndex];
                if (updatedOpt) {
                    trigger.querySelector('.custom-select-label').textContent = updatedOpt.textContent;
                }
                syncOptions();
            });

            // Handle dynamically added/changed options via MutationObserver
            if (typeof MutationObserver !== 'undefined') {
                const observer = new MutationObserver(() => {
                    syncOptions();
                    const updatedOpt = selectEl.options[selectEl.selectedIndex];
                    if (updatedOpt) {
                        trigger.querySelector('.custom-select-label').textContent = updatedOpt.textContent;
                    }
                });
                observer.observe(selectEl, { childList: true, subtree: true });
            }

            container.appendChild(trigger);
            container.appendChild(optionsPanel);

            // Hide select's sibling icons/chevrons and append custom select
            const wrapper = selectEl.parentElement;
            if (wrapper) {
                Array.from(wrapper.children).forEach(child => {
                    if (child !== selectEl && (
                        child.tagName === 'I' || 
                        child.tagName === 'SVG' || 
                        child.classList.contains('pointer-events-none') ||
                        (child.getAttribute && child.getAttribute('data-lucide') === 'chevron-down')
                    )) {
                        child.classList.add('hidden');
                    }
                });
                wrapper.appendChild(container);
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
        });
    }

    toggleMobileControls(forceState) {
        if (window.innerWidth >= 768) return;
        this.isControlsExpanded = typeof forceState !== 'undefined' ? forceState : !this.isControlsExpanded;

        const { mobileControls, mobileBackdrop } = this.els;
        if (this.isControlsExpanded) {
            mobileControls.classList.remove('collapsed');
            mobileControls.classList.add('expanded');
            mobileBackdrop.classList.remove('hidden-backdrop', 'opacity-0', 'pointer-events-none');
        } else {
            mobileControls.classList.remove('expanded');
            mobileControls.classList.add('collapsed');
            mobileBackdrop.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => mobileBackdrop.classList.add('hidden-backdrop'), 300);
        }
    }

    setModel(ver) {
        if (typeof ver === 'string') {
            const lower = ver.toLowerCase().trim();
            if (lower.includes('zimage')) ver = 'zimage';
            else if (lower.includes('4.5') || lower.includes('4-5') || lower.includes('v4') || lower.includes('diffusion-4')) ver = 'v4.5';
            else if (lower.includes('5') || lower.includes('v5') || lower.includes('diffusion-5')) ver = 'v5';
            else if (lower.includes('3') || lower.includes('v3') || lower.includes('diffusion-3')) ver = 'v3';
            else ver = 'v3';
        }
        const modelInput = document.getElementById('modelValue');
        if (modelInput) modelInput.value = ver;
        document.querySelectorAll('.switch-bg').forEach(bg => {
            if (ver === 'v4.5') bg.style.transform = 'translateX(100%)';
            else if (ver === 'v5') bg.style.transform = 'translateX(200%)';
            else if (ver === 'zimage') bg.style.transform = 'translateX(300%)';
            else bg.style.transform = 'translateX(0)';
        });
        const badge = document.getElementById('modelBadge');
        if (badge) {
            let label = 'V3';
            if (ver === 'zimage') label = 'ZIMAGE';
            else if (ver === 'v5') label = 'V5';
            else if (ver === 'v4.5') label = 'V4.5';
            badge.innerText = label + ' MODE';
        }
        const mini = document.getElementById('modelStatusMini');
        if (mini) {
            let miniLabel = 'V3';
            if (ver === 'zimage') miniLabel = 'ZImage';
            else if (ver === 'v5') miniLabel = 'V5';
            else if (ver === 'v4.5') miniLabel = 'V4.5';
            mini.innerText = miniLabel;
        }

        // 控制 V4.5 专属参数面板的显示/隐藏（仅在 V4.5 且开启了实验性配置时显示）
        const isV45Exp = localStorage.getItem('v4_5_experimental') === 'true';
        const skipCfgContainer = document.getElementById('skipCfgContainer');
        const v45ParamsContainer = document.getElementById('v45ParamsContainer');
        
        if (skipCfgContainer) {
            if (ver === 'v4.5' && isV45Exp) {
                skipCfgContainer.classList.remove('hidden');
            } else {
                skipCfgContainer.classList.add('hidden');
            }
        }
        
        if (v45ParamsContainer) {
            if (ver === 'v4.5' && isV45Exp) {
                v45ParamsContainer.classList.remove('hidden');
            } else {
                v45ParamsContainer.classList.add('hidden');
            }
        }

        const v5ParamsContainer = document.getElementById('v5ParamsContainer');
        if (v5ParamsContainer) {
            if (ver === 'v5') {
                v5ParamsContainer.classList.remove('hidden');
            } else {
                v5ParamsContainer.classList.add('hidden');
            }
        }
        this.updateV5EffortUI(document.getElementById('v5Effort')?.value || 'high');

        // 控制 SMEA & SMEA DYN 面板的显示/隐藏（仅在 V3 模型下显示）
        const smeaContainer = document.getElementById('smeaContainer');
        if (smeaContainer) {
            if (ver === 'v3') {
                smeaContainer.classList.remove('hidden');
            } else {
                smeaContainer.classList.add('hidden');
            }
        }

        // 控制 Character Prompts 角色提示词面板的显示/隐藏（在 V4.5 和 V5 模型下均支持显示）
        const charWrapper = document.getElementById('characterPromptsWrapper');
        if (charWrapper) {
            if (ver === 'v4.5' || ver === 'v5') {
                charWrapper.classList.remove('hidden');
            } else {
                charWrapper.classList.add('hidden');
            }
        }

        // 通知 CharPromptManager 模型变更以进行 V4.5 (5x5点阵) / V5 (2D自由选点) 解耦
        if (typeof window !== 'undefined' && window.charPromptManager && typeof window.charPromptManager.onModelChange === 'function') {
            window.charPromptManager.onModelChange(ver);
        }

        // 控制 NAI 专属组件在 zimage 模式下隐藏，而在 NAI 模型（v3, v4.5, v5）下显示
        const isZImage = ver === 'zimage';
        
        const negPromptWrap = document.getElementById('negativePromptWrapper');
        if (negPromptWrap) {
            if (isZImage) negPromptWrap.classList.add('hidden');
            else negPromptWrap.classList.remove('hidden');
        }

        const stepsWrap = document.getElementById('stepsWrapper');
        if (stepsWrap) {
            if (isZImage) stepsWrap.classList.add('hidden');
            else stepsWrap.classList.remove('hidden');
        }

        const samplerWrap = document.getElementById('samplerSettingsWrapper');
        if (samplerWrap) {
            if (isZImage) samplerWrap.classList.add('hidden');
            else samplerWrap.classList.remove('hidden');
        }

        const img2imgWrap = document.getElementById('img2imgSettingsWrapper');
        if (img2imgWrap) {
            if (isZImage) img2imgWrap.classList.add('hidden');
            else img2imgWrap.classList.remove('hidden');
        }

        const vibeWrap = document.getElementById('vibeSettingsWrapper');
        if (vibeWrap) {
            if (isZImage || ver === 'v5') vibeWrap.classList.add('hidden');
            else vibeWrap.classList.remove('hidden');
        }

        const zimageWrap = document.getElementById('zimageSettingsWrapper');
        if (zimageWrap) {
            if (isZImage) zimageWrap.classList.remove('hidden');
            else zimageWrap.classList.add('hidden');
        }

        const advancedWrap = document.getElementById('advancedSettingsWrapper');
        if (advancedWrap) {
            if (isZImage) advancedWrap.classList.add('hidden');
            else advancedWrap.classList.remove('hidden');
        }

        this.updateGenerateButtonText();
    }

    updateV5EffortUI(effort = 'high') {
        const isMed = effort === 'medium';
        const badge = document.getElementById('v5EffortBadge');
        const v5Effort = document.getElementById('v5Effort');
        const syncSelectUI = (el) => {
            const opt = el?.options?.[el.selectedIndex];
            const lbl = el?.parentElement?.querySelector('.custom-select-label');
            if (opt && lbl) lbl.textContent = opt.textContent;
        };

        if (v5Effort && v5Effort.value !== effort) {
            v5Effort.value = effort;
            syncSelectUI(v5Effort);
        }

        if (badge) {
            badge.textContent = isMed ? 'Medium (14步)' : 'High';
            badge.className = isMed
                ? 'text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-500/10 text-indigo-500 dark:text-indigo-400';
        }

        const modelBadge = document.getElementById('modelBadge');
        const currentModel = document.getElementById('modelValue')?.value;
        if (modelBadge && currentModel === 'v5') {
            modelBadge.innerText = (isMed ? 'V5 (MED)' : 'V5') + ' MODE';
        }

        const isLocked = currentModel === 'v5' && isMed;
        ['stepsWrapper', 'samplerSettingsWrapper', 'v5UcPresetWrapper', 'negativePromptWrapper'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList[isLocked ? 'add' : 'remove']('opacity-50', 'pointer-events-none');
            }
        });

        const stepsEl = document.getElementById('steps');
        const stepsVal = document.getElementById('stepsValue');
        const samplerEl = document.getElementById('sampler');

        if (isLocked) {
            this._v5MedLocked = true;
            if (stepsEl) stepsEl.value = '14';
            if (stepsVal) stepsVal.textContent = '14';
            if (samplerEl) {
                samplerEl.value = 'k_euler_ancestral';
                syncSelectUI(samplerEl);
            }
        } else if (this._v5MedLocked) {
            this._v5MedLocked = false;
            const savedSteps = localStorage.getItem('nai_steps') || '28';
            const savedSampler = localStorage.getItem('nai_sampler') || 'k_euler_ancestral';
            if (stepsEl) stepsEl.value = savedSteps;
            if (stepsVal) stepsVal.textContent = savedSteps;
            if (samplerEl) {
                samplerEl.value = savedSampler;
                syncSelectUI(samplerEl);
            }
        }
    }

    switchRightView(view, updateGalleryTabCallback = null) {
        this.currentRightView = view;
        const toggleBg = this.els.viewToggle.querySelector('.view-toggle-bg');
        if (view === 'history') toggleBg.style.transform = 'translateX(100%)';
        else toggleBg.style.transform = 'translateX(0)';

        const triggerViewEnter = (el) => {
            if (!el || !el.classList) return;
            if (typeof document !== 'undefined' && document.documentElement?.classList?.contains?.('low-perf')) return;
            el.classList.remove('view-fade-enter');
            try { void el.offsetWidth; } catch (_) {}
            el.classList.add('view-fade-enter');
        };

        if (view === 'preview') {
            this.els.viewBtnPreview.classList.add('active');
            this.els.viewBtnHistory.classList.remove('active');
            this.els.previewArea.classList.remove('hidden');
            this.els.historyArea.classList.add('hidden');
            triggerViewEnter(this.els.previewArea);
            this.els.zipBtn.classList.add('hidden');
            this.els.clearBtn.classList.add('hidden');
            this.els.dlBtn.classList.remove('hidden');
            if (this.els.canvasDeleteBtn) this.els.canvasDeleteBtn.classList.remove('hidden');
            if (this.els.singleResultArea && !this.els.singleResultArea.classList.contains('hidden')) {
                this.showImageActions(true);
            }
        } else {
            if (typeof window !== 'undefined' && window.inpaintEditor?.isOpen) {
                window.inpaintEditor.close();
            }
            if (typeof window !== 'undefined' && window.outpaintEditor && this.els.outpaintArea && !this.els.outpaintArea.classList.contains('hidden')) {
                window.outpaintEditor.close();
            }
            if (typeof window !== 'undefined' && window.charPromptManager?.isOpen) {
                window.charPromptManager.closeStage();
            }
            this.els.viewBtnPreview.classList.remove('active');
            this.els.viewBtnHistory.classList.add('active');
            this.els.previewArea.classList.add('hidden');
            this.els.historyArea.classList.remove('hidden');
            triggerViewEnter(this.els.historyArea);
            this.els.dlBtn.classList.add('hidden');
            if (this.els.canvasDeleteBtn) this.els.canvasDeleteBtn.classList.add('hidden');
            this.showImageActions(false);
            if (updateGalleryTabCallback) updateGalleryTabCallback(this.currentGalleryTab);
        }
    }

    toggleDrawer() {
        this.els.sideDrawer.classList.toggle('drawer-open');
        this.els.sideDrawer.classList.toggle('drawer-closed');
        this.els.drawerOverlay.classList.toggle('opacity-0');
        this.els.drawerOverlay.classList.toggle('pointer-events-none');
    }

    switchDrawerTab(tab, renderCallback = null, isOpening = false) {
        const activeClass = "active flex-1 py-2 text-xs font-medium rounded-lg transition-all border shadow-sm text-gray-900 bg-white border-gray-200 dark:bg-slate-800 dark:border-gray-700 dark:text-gray-200";
        const inactiveClass = "flex-1 py-2 text-xs font-medium rounded-lg transition-all border border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

        // Reset all tabs to inactive
        if (this.els.tabSearch) this.els.tabSearch.className = inactiveClass;
        if (this.els.tabNotebook) this.els.tabNotebook.className = inactiveClass;
        if (this.els.tabRandom) this.els.tabRandom.className = inactiveClass;

        // Hide all views
        if (this.els.viewSearch) this.els.viewSearch.classList.add('hidden');
        if (this.els.viewNotebook) this.els.viewNotebook.classList.add('hidden');
        if (this.els.viewRandom) this.els.viewRandom.classList.add('hidden');

        if (tab === 'search') {
            if (this.els.tabSearch) this.els.tabSearch.className = activeClass;
            if (this.els.viewSearch) this.els.viewSearch.classList.remove('hidden');
        } else if (tab === 'notebook') {
            if (this.els.tabNotebook) this.els.tabNotebook.className = activeClass;
            if (this.els.viewNotebook) this.els.viewNotebook.classList.remove('hidden');
            if (renderCallback) {
                if (isOpening) setTimeout(renderCallback, 300);
                else renderCallback();
            }
        } else if (tab === 'random') {
            if (this.els.tabRandom) this.els.tabRandom.className = activeClass;
            if (this.els.viewRandom) this.els.viewRandom.classList.remove('hidden');
            const fn = renderCallback || (typeof window !== 'undefined' ? window.renderRandomPromptsList : null);
            if (fn) {
                if (isOpening) setTimeout(fn, 300);
                else fn();
            }
        }
    }

    openNotebook(renderNotebookCallback = null) {
        const isOpening = !this.els.sideDrawer.classList.contains('drawer-open');
        if (isOpening) this.toggleDrawer();
        this.switchDrawerTab('notebook', renderNotebookCallback, isOpening);
    }

    openRandomPrompt(renderRandomCallback = null) {
        const isOpening = !this.els.sideDrawer.classList.contains('drawer-open');
        if (isOpening) this.toggleDrawer();
        this.switchDrawerTab('random', renderRandomCallback, isOpening);
    }

    setLoading(loading, text = "生成中...") {
        const { deskBtn, floatBtn, resultGrid } = this.els;
        // 桌面：不禁用按钮，支持点击暂停/停止生成
        if (deskBtn) {
            deskBtn.disabled = false;
            const icon = deskBtn.querySelector?.('#deskBtnIcon');
            const loader = deskBtn.querySelector?.('.loader');
            const textEl = deskBtn.querySelector?.('#deskBtnText');

            if (loading) {
                if (icon) icon.classList.add('hidden');
                if (loader) loader.classList.remove('hidden');
                if (textEl) textEl.textContent = text;
                deskBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'dark:bg-red-600', 'dark:hover:bg-red-700');
            } else {
                if (icon) icon.classList.remove('hidden');
                if (loader) loader.classList.add('hidden');
                this.updateGenerateButtonText();
                deskBtn.classList.remove('bg-red-600', 'hover:bg-red-700', 'dark:bg-red-600', 'dark:hover:bg-red-700');
            }
        }

        // 悬浮生成按钮 (纯内联 SVG，避免图标闪烁)
        if (floatBtn) {
            floatBtn.disabled = false;
            if (loading) {
                floatBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" class="w-4 h-4 animate-spin pointer-events-none"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
                floatBtn.classList.add('scale-95', 'is-generating');
            } else {
                floatBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>';
                floatBtn.classList.remove('scale-95', 'scale-90', 'bg-red-600', 'is-generating');
            }
        }

        if (resultGrid) {
            if (loading && !resultGrid.classList.contains('hidden')) {
                resultGrid.classList.add('is-sampling');
            } else if (!loading) {
                resultGrid.classList.remove('opacity-50', 'blur-sm', 'is-sampling');
            }
        }

        // 双态自适应采样提示：空画布显示等比流光画框，已有图像/重绘时切换为顶部悬浮胶囊 HUD
        if (this._loadingTimerId) {
            clearInterval(this._loadingTimerId);
            this._loadingTimerId = null;
        }
        const skeleton = typeof document !== 'undefined' ? document.getElementById('generationSkeleton') : null;
        const skeletonFrame = typeof document !== 'undefined' ? document.getElementById('generationSkeletonFrame') : null;
        const skeletonStatus = typeof document !== 'undefined' ? document.getElementById('generationSkeletonStatus') : null;
        const skeletonElapsed = typeof document !== 'undefined' ? document.getElementById('generationElapsedText') : null;
        const outpaintArea = typeof document !== 'undefined' ? document.getElementById('outpaintArea') : null;
        const outpaintVisible = Boolean(outpaintArea && !outpaintArea.classList?.contains?.('hidden'));
        const activeInpaint = (typeof window !== 'undefined' && window.inpaintEditor?.isOpen) ? window.inpaintEditor : null;
        const hasSingleNow = Boolean(this.els?.singleResultArea && !this.els.singleResultArea.classList.contains('hidden'));
        const hasGridNow = Boolean(resultGrid && !resultGrid.classList.contains('hidden'));
        const useCompactHud = hasSingleNow || hasGridNow;

        if (loading) {
            if (skeleton && !outpaintVisible) {
                const resVal = (this.els?.resolution || (typeof document !== 'undefined' ? document.getElementById('resolution') : null))?.value || '832,1216';
                let [rw, rh] = resVal.split(',').map(Number);
                if (activeInpaint && activeInpaint.imgNaturalW > 0 && activeInpaint.imgNaturalH > 0) {
                    rw = activeInpaint.imgNaturalW;
                    rh = activeInpaint.imgNaturalH;
                }
                if (skeletonFrame && skeletonFrame.style && rw > 0 && rh > 0) {
                    skeletonFrame.style.aspectRatio = `${rw} / ${rh}`;
                }
                skeleton.classList?.toggle?.('is-compact-hud', useCompactHud);
                if (skeletonStatus) {
                    const cleanLabel = (text && !text.includes('停止') && text !== '生成中...')
                        ? text.replace(/\.\.\.$/, '')
                        : (activeInpaint ? '重绘中' : '采样中');
                    skeletonStatus.textContent = cleanLabel;
                }
                if (skeletonElapsed) {
                    skeletonElapsed.textContent = '0.0s';
                }
                if (this.els?.placeholder) {
                    this.els.placeholder.classList.add('hidden');
                }
                if (hasSingleNow) {
                    this.els.singleResultArea.classList.add('is-sampling');
                }
                skeleton.classList.remove('hidden');
                const startedAt = Date.now();
                this._loadingTimerId = setInterval(() => {
                    if (skeletonElapsed) {
                        skeletonElapsed.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
                    }
                }, 100);
            }
        } else {
            if (skeleton) {
                skeleton.classList.add('hidden');
                skeleton.classList?.remove?.('is-compact-hud');
            }
            if (this.els?.singleResultArea) {
                this.els.singleResultArea.classList.remove('opacity-25', 'blur-[2px]', 'is-sampling');
            }
            if (!hasSingleNow && !hasGridNow && this.els?.placeholder) {
                this.els.placeholder.classList.remove('hidden');
            }
        }
    }

    checkIfConsumesAnlas() {
        try {
            const modelVal = (typeof document !== 'undefined' ? document.getElementById('modelValue')?.value : '') || 'v3';
            if (modelVal === 'zimage') return false;

            const stepsEl = this.els?.steps || (typeof document !== 'undefined' ? document.getElementById('steps') : null);
            const steps = stepsEl ? parseInt(stepsEl.value, 10) : 28;
            if (steps > 28) return true;

            const resEl = this.els?.resolution || (typeof document !== 'undefined' ? document.getElementById('resolution') : null);
            if (resEl && resEl.value) {
                const parts = resEl.value.split(',').map(Number);
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    if (parts[0] * parts[1] > 1048576) return true;
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    updateGenerateButtonText() {
        const deskText = typeof document !== 'undefined' ? document.getElementById('deskBtnText') : null;
        if (!deskText) return;
        if (typeof window !== 'undefined' && window.appState && window.appState.isGenerating) return;
        const inpaintModal = typeof document !== 'undefined' ? document.getElementById('inpaintModal') : null;
        if (inpaintModal && !inpaintModal.classList?.contains?.('modal-hidden') && inpaintModal.style?.display !== 'none') {
            deskText.textContent = "确认局部重绘";
            return;
        }
        const outpaintArea = typeof document !== 'undefined' ? document.getElementById('outpaintArea') : null;
        if (outpaintArea && !outpaintArea.classList?.contains?.('hidden')) {
            deskText.textContent = "确认扩图";
            return;
        }
        deskText.textContent = this.checkIfConsumesAnlas() ? "耗点生成" : "生成";
    }

    updateCreditDisplay(roleStr) {
        if (!roleStr) return;
        const text = roleStr.replace(" (Limited)", "").replace(" (Unlimited)", "");
        const { creditDisplayMobile, creditDisplayDesktop } = this.els;

        const userCreditsDisplay = document.getElementById('userCreditsDisplay');
        const userCreditsDisplayMobile = document.getElementById('userCreditsDisplayMobile');

        const isJwtUser = roleStr.startsWith('用户:');

        if (isJwtUser) {
            const displayText = text.replace('用户:', '');
            if (userCreditsDisplay) {
                userCreditsDisplay.textContent = displayText;
                userCreditsDisplay.classList.remove('hidden');
            }
            if (userCreditsDisplayMobile) {
                userCreditsDisplayMobile.textContent = displayText;
                userCreditsDisplayMobile.classList.remove('hidden');
            }
            if (creditDisplayDesktop) creditDisplayDesktop.classList.add('hidden');
            if (creditDisplayMobile) creditDisplayMobile.classList.add('hidden');
        } else {
            if (creditDisplayMobile) {
                creditDisplayMobile.textContent = text;
                creditDisplayMobile.classList.remove('hidden');
            }
            if (creditDisplayDesktop) {
                creditDisplayDesktop.textContent = text;
                creditDisplayDesktop.classList.remove('hidden');
            }
            if (userCreditsDisplay) userCreditsDisplay.classList.add('hidden');
            if (userCreditsDisplayMobile) userCreditsDisplayMobile.classList.add('hidden');
        }

        // 如果角色是 CustomAPI，自动在后台拉取并显示最新 Anlas 余额
        if (roleStr.includes('CustomAPI') && window.refreshAnlasDisplay) {
            window.refreshAnlasDisplay();
        }
    }

    updateCustomApiCredit(data) {
        if (!data) return;
        const anlasVal = typeof data.totalAnlas === 'number' ? data.totalAnlas : (typeof data.anlas === 'number' ? data.anlas : 0);
        const keyCountVal = typeof data.keyCount === 'number' ? data.keyCount : 1;
        const opusUsage = data.opusUsage || (data.details && data.details[0] && data.details[0].opusUsage);
        
        let text = "";
        const keyPart = keyCountVal > 1 ? ` | ${keyCountVal}Key` : "";
        if (opusUsage && typeof opusUsage.percent === 'number') {
            text = `CustomAPI (Anlas: ${anlasVal}${keyPart} |\nOpus免费: ${opusUsage.percent}% (约${opusUsage.estimatedImages}张))`;
        } else {
            text = `CustomAPI (Anlas: ${anlasVal}${keyPart})`;
        }

        const { creditDisplayMobile, creditDisplayDesktop } = this.els;
        const userCreditsDisplay = document.getElementById('userCreditsDisplay');
        const userCreditsDisplayMobile = document.getElementById('userCreditsDisplayMobile');

        if (userCreditsDisplay) userCreditsDisplay.classList.add('hidden');
        if (userCreditsDisplayMobile) userCreditsDisplayMobile.classList.add('hidden');

        if (creditDisplayDesktop) {
            creditDisplayDesktop.textContent = text;
            creditDisplayDesktop.classList.remove('hidden');
            if (opusUsage && typeof opusUsage.percent === 'number') {
                creditDisplayDesktop.title = `Opus 免费生成额度: 剩余 ${opusUsage.percent}% (约 ${opusUsage.estimatedImages} 张图片)`;
            }
        }
        if (creditDisplayMobile) {
            creditDisplayMobile.textContent = text;
            creditDisplayMobile.classList.remove('hidden');
        }
    }

    showImageActions(show) {
        if (!this.els.imageActions) return;
        if (show) {
            this.els.imageActions.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
            if (this.els.canvasDeleteBtn) {
                this.els.canvasDeleteBtn.disabled = false;
                this.els.canvasDeleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                this.els.canvasDeleteBtn.classList.add('cursor-pointer');
            }
            if (this.els.dlBtn) {
                this.els.dlBtn.disabled = false;
                this.els.dlBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                this.els.dlBtn.classList.add('cursor-pointer');
            }
        } else {
            this.els.imageActions.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            if (this.els.canvasDeleteBtn) {
                this.els.canvasDeleteBtn.disabled = true;
                this.els.canvasDeleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
                this.els.canvasDeleteBtn.classList.remove('cursor-pointer');
            }
        }
    }

    resetPreview() {
        if (typeof window !== 'undefined' && window.inpaintEditor?.isOpen) {
            window.inpaintEditor.close();
        }
        const { resultGrid, singleResultArea, backToGridBtn, placeholder, dlBtn, canvasDeleteBtn } = this.els;
        if (resultGrid) {
            resultGrid.innerHTML = '';
            resultGrid.classList.add('hidden');
        }
        if (singleResultArea) singleResultArea.classList.add('hidden');
        if (backToGridBtn) backToGridBtn.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
        if (dlBtn) {
            dlBtn.disabled = true;
            dlBtn.classList.add('opacity-50', 'cursor-not-allowed');
            dlBtn.classList.remove('cursor-pointer');
        }
        if (canvasDeleteBtn) {
            canvasDeleteBtn.disabled = true;
            canvasDeleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
            canvasDeleteBtn.classList.remove('cursor-pointer');
        }
        this.clearBeforeAfterState();
        this.showImageActions(false);
        if (typeof window !== 'undefined') {
            if (window.appState) {
                window.appState.currentImageId = null;
                window.appState.currentImageData = null;
            }
            window.lastSelectedImageUrl = null;
        }
    }

    showGrid() {
        const { resultGrid, singleResultArea, backToGridBtn, placeholder } = this.els;
        if (resultGrid.children.length === 0) return;
        if (typeof window !== 'undefined' && window.inpaintEditor?.isOpen) {
            window.inpaintEditor.close();
        }
        
        placeholder.classList.add('hidden');
        resultGrid.classList.remove('hidden');
        this.toggleCompareSplit(false);
        singleResultArea.classList.add('hidden');
        backToGridBtn.classList.add('hidden');
        this.showImageActions(false);
    }

    _triggerImageReveal(imgEl) {
        if (!imgEl || !imgEl.classList) return;
        if (typeof document !== 'undefined' && document.documentElement?.classList?.contains?.('low-perf')) return;
        imgEl.classList.remove('img-reveal');
        try { void imgEl.offsetWidth; } catch (_) {}
        imgEl.classList.add('img-reveal');
    }

    focusImage(item) {
        const { resultGrid, singleResultArea, singleResultImg, backToGridBtn, placeholder } = this.els;
        
        if (placeholder) placeholder.classList.add('hidden');
        if (resultGrid) resultGrid.classList.add('hidden');
        if (singleResultArea) singleResultArea.classList.remove('hidden');
        
        // 如果网格中有超过一张图，才显示返回按钮
        if (backToGridBtn) {
            if (resultGrid && resultGrid.children && resultGrid.children.length > 1) {
                backToGridBtn.classList.remove('hidden');
            } else {
                backToGridBtn.classList.add('hidden');
            }
        }

        if (singleResultImg) {
            singleResultImg.src = item.imageUrl;
            this._triggerImageReveal(singleResultImg);
        }
        if (this._compareAfterUrl && item?.imageUrl && item.imageUrl !== this._compareAfterUrl) {
            this.clearBeforeAfterState();
        }
        if (typeof window !== 'undefined' && window.inpaintEditor?.isOpen) {
            window.inpaintEditor.syncOverlayGeometry?.();
        }
        if (typeof window !== 'undefined' && window.charPromptManager?.isOpen) {
            window.charPromptManager.updatePadAspectRatio?.();
            window.charPromptManager.renderStage?.();
        }
        if (item?.id != null) {
            this.updateFilmstripActive(item.id);
        }
        this.showImageActions(true);
    }
    
    showResultImages(results, onSelect) {
        if (!Array.isArray(results) || results.length === 0) return;
        const { resultGrid, singleResultArea, singleResultImg, backToGridBtn, placeholder, dlBtn } = this.els;
        if (resultGrid) resultGrid.innerHTML = '';
        if (placeholder) placeholder.classList.add('hidden');
        if (backToGridBtn) backToGridBtn.classList.add('hidden');

        // 单图直达聚焦模式 (UX-1: 省去多余的“点击聚焦”步骤，工具箱与局部重绘直接可用)
        if (results.length === 1) {
            const singleItem = results[0];
            if (resultGrid) resultGrid.classList.add('hidden');
            if (onSelect) onSelect(singleItem);
            this.focusImage(singleItem);
            if (dlBtn) {
                dlBtn.disabled = false;
                dlBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                dlBtn.classList.add('cursor-pointer');
            }
            if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();
            return;
        }

        if (singleResultArea) singleResultArea.classList.add('hidden');
        if (singleResultImg) singleResultImg.src = '';
        if (resultGrid) resultGrid.classList.remove('hidden');
        
        // 多图并发网格初始隐藏单图工具箱，点击任一卡片后进入聚焦
        this.showImageActions(false);

        // 根据图片数量决定网格列数
        const count = results.length;
        let cols = 1;
        if (count >= 5) cols = 3;
        else if (count >= 2) cols = 2;
        
        resultGrid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        
        results.forEach((item, index) => {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'relative group cursor-pointer transition-all duration-300 transform hover:scale-[1.02] active:scale-95';
            
            const img = document.createElement('img');
            img.src = item.imageUrl;
            img.className = 'max-w-full max-h-full object-contain shadow-2xl rounded-lg border-2 border-transparent transition-all';
            
            // 如果是第一张图，默认高亮选中并初始化选择回调（但不进入聚焦单图模式以保留网格）
            if (index === 0) {
                img.classList.add('border-blue-500', 'ring-4', 'ring-blue-500/20');
                if (onSelect) onSelect(item);
            }
            
            // 聚焦按钮叠加层
            const focusOverlay = document.createElement('div');
            focusOverlay.className = 'absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg z-10';
            focusOverlay.innerHTML = `
                <button class="bg-white/20 hover:bg-white/40 backdrop-blur-md text-white border border-white/30 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 shadow-xl">
                    <i data-lucide="maximize" class="w-4 h-4"></i>
                    聚焦 (Focus)
                </button>
            `;
            
            imgWrapper.appendChild(img);
            imgWrapper.appendChild(focusOverlay);
            
            if (item.xyInfo) {
                const badge = document.createElement('div');
                badge.className = 'absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-2 py-0.5 rounded font-mono font-bold border border-white/10 z-20 pointer-events-none';
                badge.textContent = item.xyInfo;
                imgWrapper.appendChild(badge);
            }
            
            const select = (e) => {
                if (e) e.stopPropagation();
                // 清除其他选中状态
                resultGrid.querySelectorAll('img').forEach(i => i.classList.remove('border-blue-500', 'ring-4', 'ring-blue-500/20'));
                img.classList.add('border-blue-500', 'ring-4', 'ring-blue-500/20');
                if (onSelect) onSelect(item);
                
                // 进入聚焦单图模式
                this.focusImage(item);
            };

            imgWrapper.onclick = select;
            resultGrid.appendChild(imgWrapper);
        });

        // 重新创建图标 (Lucide) - 循环外调用一次即可
        if (window.safeCreateIcons) window.safeCreateIcons();

        dlBtn.disabled = false;
        dlBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        dlBtn.classList.add('cursor-pointer');
    }

    // 保持兼容性，单图直接进入聚焦画布
    showResultImage(url) {
        this.showResultImages([{ imageUrl: url }]);
    }

    _syncThemeMeta(content) {
        if (typeof document === 'undefined') return;
        const meta = document.querySelector?.('meta[name="color-scheme"]');
        if (meta) meta.setAttribute('content', content);
    }

    _applyColorScheme(savedTheme) {
        const prefersDark = Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        this._syncThemeMeta((savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light dark');
    }

    initTheme() {
        let savedTheme = null;
        try {
            savedTheme = localStorage.getItem('color-theme');
        } catch (_) {}
        this._applyColorScheme(savedTheme);

        if (!this._themeListenersBound && typeof window !== 'undefined') {
            this._themeListenersBound = true;
            if (typeof window.addEventListener === 'function') {
                window.addEventListener('storage', (event) => {
                    if (event && event.key === 'color-theme') {
                        this._applyColorScheme(event.newValue);
                    }
                });
            }
            const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
            if (mql && typeof mql.addEventListener === 'function') {
                mql.addEventListener('change', () => {
                    let current = null;
                    try {
                        current = localStorage.getItem('color-theme');
                    } catch (_) {}
                    if (!current) this._applyColorScheme(null);
                });
            }
        }
    }

    resetThemeToSystem() {
        try {
            localStorage.removeItem('color-theme');
        } catch (_) {}
        this._applyColorScheme(null);
    }

    toggleTheme() {
        const applyToggle = () => {
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                try { localStorage.setItem('color-theme', 'light'); } catch (_) {}
                this._syncThemeMeta('light');
            } else {
                document.documentElement.classList.add('dark');
                try { localStorage.setItem('color-theme', 'dark'); } catch (_) {}
                this._syncThemeMeta('dark');
            }
        };

        const isLowPerf = Boolean(document.documentElement?.classList?.contains?.('low-perf')) ||
            Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

        if (!isLowPerf && typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
            try {
                document.startViewTransition(() => applyToggle());
                return;
            } catch (_) {}
        }
        applyToggle();
    }

    updateAdminUI(isAdmin, hasAdminToken, customKey, toggleBypassLimitsEnabledCallback) {
        if (this.els.adminControls) {
            if (isAdmin) {
                this.els.adminControls.classList.remove('hidden');
            } else {
                this.els.adminControls.classList.add('hidden');
            }
        }

        const updateLock = (btn) => {
            if (isAdmin) {
                btn.innerHTML = '<i data-lucide="unlock" class="w-4 h-4 text-green-500"></i>';
            } else {
                btn.innerHTML = '<i data-lucide="lock" class="w-4 h-4 text-gray-300 dark:text-gray-500"></i>';
            }
        };
        if (this.els.adminLockBtn) updateLock(this.els.adminLockBtn);
        if (this.els.adminLockBtnMobile) updateLock(this.els.adminLockBtnMobile);

        const showHide = (el, show) => {
            if (el) {
                if (show) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        };
        showHide(this.els.adminPanelBtn, hasAdminToken);
        showHide(this.els.adminPanelBtnMobile, hasAdminToken);
        showHide(this.els.adminPanelEntrance, hasAdminToken);

        const checkbox = this.els.bypassLimitsEnabled;
        const icon = this.els.bypassLimitsIcon;
        const badge = this.els.bypassLimitsBadge;
        const hint = this.els.bypassLimitsHint;

        if (checkbox) {
            if (isAdmin) {
                checkbox.disabled = false;
                if (icon) {
                    icon.setAttribute('data-lucide', 'unlock');
                    icon.setAttribute('class', 'w-4 h-4 text-green-500');
                }
                if (badge) {
                    badge.textContent = '已解锁';
                    badge.className = 'text-[9px] bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200/50 dark:border-green-900/30';
                }
                if (hint) {
                    hint.textContent = '开启后，可选用 1.5M 像素超大画幅与最高 50 步生成（将消耗您的 Anlas）。';
                }
            } else {
                checkbox.disabled = true;
                checkbox.checked = false;
                if (toggleBypassLimitsEnabledCallback) {
                    toggleBypassLimitsEnabledCallback(false);
                }
                if (icon) {
                    icon.setAttribute('data-lucide', 'lock');
                    icon.setAttribute('class', 'w-4 h-4 text-gray-400');
                }
                if (badge) {
                    badge.textContent = '锁定';
                    badge.className = 'text-[9px] bg-gray-100 dark:bg-slate-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700';
                }
                if (hint) {
                    hint.textContent = '需在顶部工具栏配置您的自定义 API Key 或管理员密码以解锁此选项。';
                }
            }
        }

        const updateApiBtn = (btn) => {
            if (btn) {
                if (customKey) {
                    btn.innerHTML = '<i data-lucide="globe" class="w-4 h-4 text-green-500"></i>';
                } else {
                    btn.innerHTML = '<i data-lucide="globe" class="w-4 h-4"></i>';
                }
            }
        };
        updateApiBtn(this.els.apiBtn);
        updateApiBtn(this.els.apiBtnMobile);

        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    updateLowPerfUI(enabled) {
        const iconHtml = enabled 
            ? `<i data-lucide="zap-off" class="w-4 h-4 text-gray-400"></i>` 
            : `<i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>`;
            
        if (this.els.lowPerfBtn) {
            this.els.lowPerfBtn.innerHTML = iconHtml;
            this.els.lowPerfBtn.title = enabled ? "高性能模式" : "低性能模式";
        }
        if (this.els.lowPerfBtnMobile) {
            this.els.lowPerfBtnMobile.innerHTML = iconHtml;
            this.els.lowPerfBtnMobile.title = enabled ? "高性能模式" : "低性能模式";
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    // =========================================================================
    // In-Place Main Canvas Before / After Comparison (Split Slider + Hold Peek)
    // =========================================================================

    _initCompareInteractions() {
        const btn = this.els?.canvasCompareBtn || (typeof document !== 'undefined' ? document.getElementById('canvasCompareBtn') : null);
        const divider = this.els?.canvasCompareDivider || (typeof document !== 'undefined' ? document.getElementById('canvasCompareDivider') : null);

        if (btn && !btn.dataset.compareBound) {
            btn.dataset.compareBound = 'true';
            let holdTimer = null;
            let didHold = false;

            const clearHold = () => {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
            };

            btn.addEventListener('pointerdown', (e) => {
                if (e.button && e.button !== 0) return;
                didHold = false;
                clearHold();
                holdTimer = setTimeout(() => {
                    didHold = true;
                    this.startComparePeek();
                }, 160);
            });

            const finishPress = () => {
                clearHold();
                if (didHold) {
                    this.endComparePeek();
                } else {
                    this.toggleCompareSplit();
                }
                didHold = false;
            };

            btn.addEventListener('pointerup', finishPress);
            btn.addEventListener('pointercancel', () => {
                clearHold();
                if (didHold) this.endComparePeek();
                didHold = false;
            });
            btn.addEventListener('pointerleave', () => {
                if (didHold) {
                    clearHold();
                    this.endComparePeek();
                    didHold = false;
                }
            });
        }

        if (divider && !divider.dataset.compareDividerBound) {
            divider.dataset.compareDividerBound = 'true';
            let dragging = false;

            const updateFromClientX = (clientX) => {
                const overlay = this.els?.canvasCompareOverlay || document.getElementById('canvasCompareOverlay');
                const rect = overlay?.getBoundingClientRect?.();
                if (!rect || rect.width <= 0) return;
                const pct = ((clientX - rect.left) / rect.width) * 100;
                this.setCompareSplitPct(pct);
            };

            divider.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dragging = true;
                try { divider.setPointerCapture?.(e.pointerId); } catch (_) {}
                updateFromClientX(e.clientX);
            });

            divider.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                updateFromClientX(e.clientX);
            });

            const stopDrag = (e) => {
                if (!dragging) return;
                dragging = false;
                try { divider.releasePointerCapture?.(e.pointerId); } catch (_) {}
            };

            divider.addEventListener('pointerup', stopDrag);
            divider.addEventListener('pointercancel', stopDrag);
        }
    }

    setBeforeAfterImage(beforeUrl, afterUrl = null) {
        if (!beforeUrl) {
            this.clearBeforeAfterState();
            return;
        }
        const resolvedAfter = afterUrl || this.els?.singleResultImg?.src || null;
        if (resolvedAfter && beforeUrl === resolvedAfter) return;

        this._compareBeforeUrl = beforeUrl;
        this._compareAfterUrl = resolvedAfter;

        const beforeImg = this.els?.canvasBeforeImg || (typeof document !== 'undefined' ? document.getElementById('canvasBeforeImg') : null);
        const btn = this.els?.canvasCompareBtn || (typeof document !== 'undefined' ? document.getElementById('canvasCompareBtn') : null);
        const sep = this.els?.canvasCompareSep || (typeof document !== 'undefined' ? document.getElementById('canvasCompareSep') : null);

        if (beforeImg) beforeImg.src = beforeUrl;
        if (btn) btn.classList.remove('hidden');
        if (sep) sep.classList.remove('hidden');
        this.setCompareSplitPct(this._compareSplitPct || 50);
    }

    clearBeforeAfterState() {
        this._compareBeforeUrl = null;
        this._compareAfterUrl = null;
        this._isCompareSplitOpen = false;
        this._isComparePeeking = false;

        const overlay = this.els?.canvasCompareOverlay || (typeof document !== 'undefined' ? document.getElementById('canvasCompareOverlay') : null);
        const stage = typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null;
        const singleImg = this.els?.singleResultImg || (typeof document !== 'undefined' ? document.getElementById('singleResultImg') : null);
        const beforeImg = this.els?.canvasBeforeImg || (typeof document !== 'undefined' ? document.getElementById('canvasBeforeImg') : null);
        const btn = this.els?.canvasCompareBtn || (typeof document !== 'undefined' ? document.getElementById('canvasCompareBtn') : null);
        const sep = this.els?.canvasCompareSep || (typeof document !== 'undefined' ? document.getElementById('canvasCompareSep') : null);

        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('peek-mode');
        }
        if (stage && stage.classList) {
            stage.classList.remove('is-compare-split', 'is-compare-peek');
        }
        if (singleImg && singleImg.style) {
            singleImg.style.clipPath = '';
        }
        if (beforeImg) beforeImg.src = '';
        if (btn) {
            btn.classList.add('hidden');
            btn.classList.remove('compare-active');
        }
        if (sep) sep.classList.add('hidden');
    }

    setCompareSplitPct(pct) {
        const clamped = Math.max(2, Math.min(98, Number.isFinite(Number(pct)) ? Number(pct) : 50));
        this._compareSplitPct = clamped;
        const val = clamped.toFixed(1) + '%';
        const overlay = this.els?.canvasCompareOverlay || (typeof document !== 'undefined' ? document.getElementById('canvasCompareOverlay') : null);
        const stage = typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null;
        const singleImg = this.els?.singleResultImg || (typeof document !== 'undefined' ? document.getElementById('singleResultImg') : null);
        if (overlay && overlay.style && typeof overlay.style.setProperty === 'function') {
            overlay.style.setProperty('--split-pct', val);
        }
        if (stage && stage.style && typeof stage.style.setProperty === 'function') {
            stage.style.setProperty('--split-pct', val);
        }
        if (singleImg && singleImg.style && typeof singleImg.style.setProperty === 'function') {
            singleImg.style.setProperty('--split-pct', val);
        }
    }

    toggleCompareSplit(forceState) {
        if (!this._compareBeforeUrl && forceState !== false) return false;
        const next = typeof forceState === 'boolean' ? forceState : !this._isCompareSplitOpen;
        this._isCompareSplitOpen = next;

        const overlay = this.els?.canvasCompareOverlay || (typeof document !== 'undefined' ? document.getElementById('canvasCompareOverlay') : null);
        const stage = typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null;
        const btn = this.els?.canvasCompareBtn || (typeof document !== 'undefined' ? document.getElementById('canvasCompareBtn') : null);

        if (overlay) {
            overlay.classList.remove('peek-mode');
            if (next) {
                this.setCompareSplitPct(this._compareSplitPct || 50);
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
        if (stage && stage.classList) {
            stage.classList.remove('is-compare-peek');
            stage.classList.toggle('is-compare-split', next);
        }
        if (btn) {
            btn.classList.toggle('compare-active', next);
        }
        return next;
    }

    startComparePeek() {
        if (!this._compareBeforeUrl) return;
        this._isComparePeeking = true;
        const overlay = this.els?.canvasCompareOverlay || (typeof document !== 'undefined' ? document.getElementById('canvasCompareOverlay') : null);
        const stage = typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null;
        const btn = this.els?.canvasCompareBtn || (typeof document !== 'undefined' ? document.getElementById('canvasCompareBtn') : null);
        if (overlay) {
            overlay.classList.add('peek-mode');
            overlay.classList.remove('hidden');
        }
        if (stage && stage.classList) {
            stage.classList.add('is-compare-peek');
        }
        if (btn) btn.classList.add('compare-active');
    }

    endComparePeek() {
        if (!this._isComparePeeking) return;
        this._isComparePeeking = false;
        const overlay = this.els?.canvasCompareOverlay || (typeof document !== 'undefined' ? document.getElementById('canvasCompareOverlay') : null);
        const stage = typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null;
        const btn = this.els?.canvasCompareBtn || (typeof document !== 'undefined' ? document.getElementById('canvasCompareBtn') : null);
        if (overlay) {
            overlay.classList.remove('peek-mode');
            if (!this._isCompareSplitOpen) {
                overlay.classList.add('hidden');
            }
        }
        if (stage && stage.classList) {
            stage.classList.remove('is-compare-peek');
            stage.classList.toggle('is-compare-split', Boolean(this._isCompareSplitOpen));
        }
        if (btn) {
            btn.classList.toggle('compare-active', Boolean(this._isCompareSplitOpen));
        }
    }

    // =========================================================================
    // Main Canvas Bottom Mini History Filmstrip Dock
    // =========================================================================

    renderFilmstrip(items = [], activeId = null) {
        const dock = this.els?.canvasFilmstripDock || (typeof document !== 'undefined' ? document.getElementById('canvasFilmstripDock') : null);
        const track = this.els?.filmstripTrack || (typeof document !== 'undefined' ? document.getElementById('filmstripTrack') : null);
        if (!dock || !track) return;

        const validItems = Array.isArray(items) ? items.filter(it => it && it.imageUrl).slice(0, 8) : [];
        if (validItems.length === 0) {
            dock.classList.add('hidden');
            track.innerHTML = '';
            return;
        }

        dock.classList.remove('hidden');
        track.innerHTML = '';

        validItems.forEach((item, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isActive = activeId != null && String(item.id) === String(activeId);
            btn.className = 'filmstrip-thumb-btn' + (isActive ? ' active' : '');
            btn.dataset.imageId = String(item.id ?? idx);
            btn.title = item.seed ? ('Seed: ' + item.seed + ' (点击仅切图)') : '点击切换主画布图片';
            btn.setAttribute?.('aria-label', btn.title);

            const img = document.createElement('img');
            img.src = item.imageUrl;
            img.alt = '';
            img.loading = 'lazy';
            btn.appendChild(img);

            btn.onclick = (e) => {
                e.stopPropagation();
                if (typeof window !== 'undefined' && typeof window.selectFilmstripImage === 'function') {
                    window.selectFilmstripImage(item.id);
                }
            };

            track.appendChild(btn);
        });
    }

    updateFilmstripActive(activeId) {
        const track = this.els?.filmstripTrack || (typeof document !== 'undefined' ? document.getElementById('filmstripTrack') : null);
        if (!track || !track.querySelectorAll) return;
        track.querySelectorAll('.filmstrip-thumb-btn').forEach(btn => {
            const isMatch = activeId != null && String(btn.dataset?.imageId) === String(activeId);
            btn.classList.toggle('active', isMatch);
        });
    }

    toggleFilmstripCollapsed(forceState) {
        const inner = this.els?.filmstripInner || (typeof document !== 'undefined' ? document.getElementById('filmstripInner') : null);
        const svg = this.els?.filmstripToggleSvg || (typeof document !== 'undefined' ? document.getElementById('filmstripToggleSvg') : null);
        this._isFilmstripCollapsed = typeof forceState === 'boolean' ? forceState : !this._isFilmstripCollapsed;
        if (inner) {
            inner.classList.toggle('collapsed', this._isFilmstripCollapsed);
        }
        if (svg && svg.style) {
            svg.style.transform = this._isFilmstripCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        return this._isFilmstripCollapsed;
    }
}