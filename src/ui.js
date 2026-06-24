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

        this._initBasicBindings();
        this._initCustomSelects();
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
            viewSearch: document.getElementById('view-search'),
            viewNotebook: document.getElementById('view-notebook'),
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
            smeaContainer: document.getElementById('smeaContainer'),
            negativePromptWrapper: document.getElementById('negativePromptWrapper'),
            stepsWrapper: document.getElementById('stepsWrapper'),
            samplerSettingsWrapper: document.getElementById('samplerSettingsWrapper'),
            img2imgSettingsWrapper: document.getElementById('img2imgSettingsWrapper'),
            vibeSettingsWrapper: document.getElementById('vibeSettingsWrapper'),
            zimageSettingsWrapper: document.getElementById('zimageSettingsWrapper'),
            advancedSettingsWrapper: document.getElementById('advancedSettingsWrapper'),
            adminSettingsWrapper: document.getElementById('adminSettingsWrapper'),
            adminPanelBtn: document.getElementById('adminPanelBtn'),
            adminPanelBtnMobile: document.getElementById('adminPanelBtnMobile'),
            adminPanelEntrance: document.getElementById('adminPanelEntrance'),
            apiBtn: document.getElementById('apiBtn'),
            apiBtnMobile: document.getElementById('apiBtnMobile')
        };
    }

    _initBasicBindings() {
        const { steps, stepsVal, scale, scaleVal, batchCount, batchValue } = this.els;
        if (steps) steps.addEventListener('input', e => stepsVal.textContent = e.target.value);
        if (scale) scale.addEventListener('input', e => scaleVal.textContent = parseFloat(e.target.value).toFixed(1));
        if (batchCount) batchCount.addEventListener('input', e => batchValue.textContent = e.target.value);
    }

    _initCustomSelects() {
        const selectIds = ['resolution', 'sampler', 'noise_schedule'];
        selectIds.forEach(id => {
            const selectEl = document.getElementById(id);
            if (!selectEl) return;

            // Hide original select
            selectEl.classList.add('hidden');

            // Create custom select container
            const container = document.createElement('div');
            container.className = 'custom-select-container relative w-full';
            container.setAttribute('data-select-id', id);

            // Get selected option
            const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
            const selectedText = selectedOpt ? selectedOpt.textContent : '';

            // Create trigger button
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'custom-select-trigger art-input w-full px-4 py-3 rounded-xl text-xs font-medium outline-none shadow-sm flex items-center justify-between cursor-pointer';
            trigger.innerHTML = `
                <span class="custom-select-label">${selectedText}</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400 custom-select-arrow transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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

            container.appendChild(trigger);
            container.appendChild(optionsPanel);

            // Hide select's sibling elements inside parent (like native chevron icon) and append custom select
            const wrapper = selectEl.parentElement;
            if (wrapper) {
                Array.from(wrapper.children).forEach(child => {
                    if (child !== selectEl) {
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
        document.getElementById('modelValue').value = ver;
        document.querySelectorAll('.switch-bg').forEach(bg => {
            if (ver === 'v4.5') bg.style.transform = 'translateX(100%)';
            else if (ver === 'zimage') bg.style.transform = 'translateX(200%)';
            else bg.style.transform = 'translateX(0)';
        });
        const badge = document.getElementById('modelBadge');
        if (badge) badge.innerText = (ver === 'zimage' ? 'ZIMAGE' : ver === 'v4.5' ? 'V4.5' : 'V3') + ' MODE';
        const mini = document.getElementById('modelStatusMini');
        if (mini) mini.innerText = ver === 'zimage' ? 'ZImage' : ver === 'v4.5' ? 'V4.5' : 'V3';

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

        // 控制 SMEA & SMEA DYN 面板的显示/隐藏（仅在 V3 模型下显示）
        const smeaContainer = document.getElementById('smeaContainer');
        if (smeaContainer) {
            if (ver === 'v3') {
                smeaContainer.classList.remove('hidden');
            } else {
                smeaContainer.classList.add('hidden');
            }
        }

        // 控制 Character Prompts 角色提示词面板的显示/隐藏（仅在 V4.5 模型下显示）
        const charWrapper = document.getElementById('characterPromptsWrapper');
        if (charWrapper) {
            if (ver === 'v4.5') {
                charWrapper.classList.remove('hidden');
            } else {
                charWrapper.classList.add('hidden');
            }
        }

        // 控制 NAI 专属组件在 zimage 模式下隐藏，而在 NAI 模型（v3, v4.5）下显示
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
            if (isZImage) vibeWrap.classList.add('hidden');
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

        const adminWrap = document.getElementById('adminSettingsWrapper');
        if (adminWrap) {
            if (isZImage) adminWrap.classList.add('hidden');
            else adminWrap.classList.remove('hidden');
        }
    }

    switchRightView(view, updateGalleryTabCallback = null) {
        this.currentRightView = view;
        const toggleBg = this.els.viewToggle.querySelector('.view-toggle-bg');
        if (view === 'history') toggleBg.style.transform = 'translateX(100%)';
        else toggleBg.style.transform = 'translateX(0)';

        if (view === 'preview') {
            this.els.viewBtnPreview.classList.add('active');
            this.els.viewBtnHistory.classList.remove('active');
            this.els.previewArea.classList.remove('hidden');
            this.els.historyArea.classList.add('hidden');
            this.els.zipBtn.classList.add('hidden');
            this.els.clearBtn.classList.add('hidden');
            this.els.dlBtn.classList.remove('hidden');
        } else {
            this.els.viewBtnPreview.classList.remove('active');
            this.els.viewBtnHistory.classList.add('active');
            this.els.previewArea.classList.add('hidden');
            this.els.historyArea.classList.remove('hidden');
            this.els.dlBtn.classList.add('hidden');
            if (updateGalleryTabCallback) updateGalleryTabCallback(this.currentGalleryTab);
        }
    }

    toggleDrawer() {
        this.els.sideDrawer.classList.toggle('drawer-open');
        this.els.sideDrawer.classList.toggle('drawer-closed');
        this.els.drawerOverlay.classList.toggle('opacity-0');
        this.els.drawerOverlay.classList.toggle('pointer-events-none');
    }

    switchDrawerTab(tab, renderNotebookCallback = null, isOpening = false) {
        const activeClass = "active flex-1 py-2 text-xs font-medium rounded-lg transition-all border shadow-sm text-gray-900 bg-white border-gray-200 dark:bg-slate-800 dark:border-gray-700 dark:text-gray-200";
        const inactiveClass = "flex-1 py-2 text-xs font-medium rounded-lg transition-all border border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

        // Reset all tabs to inactive
        this.els.tabSearch.className = inactiveClass;
        if (this.els.tabNotebook) this.els.tabNotebook.className = inactiveClass;

        // Hide all views
        this.els.viewSearch.classList.add('hidden');
        if (this.els.viewNotebook) this.els.viewNotebook.classList.add('hidden');

        if (tab === 'search') {
            this.els.tabSearch.className = activeClass;
            this.els.viewSearch.classList.remove('hidden');
        } else if (tab === 'notebook') {
            if (this.els.tabNotebook) this.els.tabNotebook.className = activeClass;
            if (this.els.viewNotebook) this.els.viewNotebook.classList.remove('hidden');
            if (renderNotebookCallback) {
                if (isOpening) {
                    setTimeout(renderNotebookCallback, 300);
                } else {
                    renderNotebookCallback();
                }
            }
        }
    }

    openNotebook(renderNotebookCallback = null) {
        const isOpening = !this.els.sideDrawer.classList.contains('drawer-open');
        if (isOpening) this.toggleDrawer();
        this.switchDrawerTab('notebook', renderNotebookCallback, isOpening);
    }

    setLoading(loading, text = "生成中...") {
        const { deskBtn, floatBtn, resultGrid } = this.els;
        // 桌面
        deskBtn.disabled = loading;
        if (loading) {
            deskBtn.querySelector('#deskBtnIcon').classList.add('hidden');
            deskBtn.querySelector('.loader').classList.remove('hidden');
            deskBtn.querySelector('#deskBtnText').textContent = text;
        } else {
            deskBtn.querySelector('#deskBtnIcon').classList.remove('hidden');
            deskBtn.querySelector('.loader').classList.add('hidden');
            deskBtn.querySelector('#deskBtnText').textContent = "免费生成";
        }

        // 悬浮
        floatBtn.disabled = loading;
        if (loading) {
            floatBtn.innerHTML = '<span class="loader border-gray-800 dark:border-white"></span>';
            floatBtn.classList.add('scale-90');
        } else {
            floatBtn.innerHTML = '<i data-lucide="sparkles" class="w-7 h-7 text-yellow-400 dark:text-gray-900"></i>';
            floatBtn.classList.remove('scale-90');
            if (window.safeCreateIcons) window.safeCreateIcons();
        }

        if (loading && !resultGrid.classList.contains('hidden')) {
            resultGrid.classList.add('opacity-50', 'blur-sm');
        } else if (!loading) {
            resultGrid.classList.remove('opacity-50', 'blur-sm');
        }
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

    showImageActions(show) {
        if (show) this.els.imageActions.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
        else this.els.imageActions.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }

    resetPreview() {
        const { resultGrid, singleResultArea, backToGridBtn, placeholder, dlBtn } = this.els;
        resultGrid.innerHTML = '';
        resultGrid.classList.add('hidden');
        singleResultArea.classList.add('hidden');
        backToGridBtn.classList.add('hidden');
        placeholder.classList.remove('hidden');
        dlBtn.disabled = true;
        dlBtn.classList.add('opacity-50', 'cursor-not-allowed');
        this.showImageActions(false);
    }

    showGrid() {
        const { resultGrid, singleResultArea, backToGridBtn, placeholder } = this.els;
        if (resultGrid.children.length === 0) return;
        
        placeholder.classList.add('hidden');
        resultGrid.classList.remove('hidden');
        singleResultArea.classList.add('hidden');
        backToGridBtn.classList.add('hidden');
        this.showImageActions(false);
    }

    focusImage(item) {
        const { resultGrid, singleResultArea, singleResultImg, backToGridBtn, placeholder } = this.els;
        
        placeholder.classList.add('hidden');
        resultGrid.classList.add('hidden');
        singleResultArea.classList.remove('hidden');
        
        // 如果网格中有超过一张图，才显示返回按钮
        if (resultGrid.children.length > 1) {
            backToGridBtn.classList.remove('hidden');
        } else {
            backToGridBtn.classList.add('hidden');
        }

        singleResultImg.src = item.imageUrl;
        this.showImageActions(true);
    }
    
    showResultImages(results, onSelect) {
        const { resultGrid, placeholder, dlBtn } = this.els;
        resultGrid.innerHTML = '';
        placeholder.classList.add('hidden');
        resultGrid.classList.remove('hidden');
        
        // 初始不显示操作按钮，除非之后点击了聚焦
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

    // 保持兼容性，虽然现在主要用 showResultImages
    showResultImage(url) {
        const item = { imageUrl: url };
        this.showResultImages([item]);
        this.focusImage(item);
    }

    initTheme() {
        if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    toggleTheme() {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('color-theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('color-theme', 'dark');
        }
    }

    updateAdminUI(isAdmin, hasAdminToken, customKey, toggleBypassLimitsEnabledCallback) {
        const updateLock = (btn) => {
            if (isAdmin) {
                btn.innerHTML = '<i data-lucide="unlock" class="w-4 h-4 text-green-500"></i>';
                this.els.adminControls?.classList.remove('hidden');
            } else {
                btn.innerHTML = '<i data-lucide="lock" class="w-4 h-4 text-gray-300 dark:text-gray-500"></i>';
                this.els.adminControls?.classList.add('hidden');
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
}