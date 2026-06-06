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
            creditDisplayDesktop: document.getElementById('creditDisplayDesktop')
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
            bg.style.transform = ver === 'v4.5' ? 'translateX(100%)' : 'translateX(0)';
        });
        const badge = document.getElementById('modelBadge');
        if (badge) badge.innerText = (ver === 'v4.5' ? 'V4.5' : 'V3') + ' MODE';
        const mini = document.getElementById('modelStatusMini');
        if (mini) mini.innerText = ver === 'v4.5' ? 'V4.5' : 'V3';

        // 控制 V4.5 专属参数面板的显示/隐藏
        const skipCfgContainer = document.getElementById('skipCfgContainer');
        if (skipCfgContainer) {
            if (ver === 'v4.5') {
                skipCfgContainer.classList.remove('hidden');
            } else {
                skipCfgContainer.classList.add('hidden');
            }
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

        if (creditDisplayMobile) {
            creditDisplayMobile.textContent = text;
            creditDisplayMobile.classList.remove('hidden');
        }
        if (creditDisplayDesktop) {
            creditDisplayDesktop.textContent = text;
            creditDisplayDesktop.classList.remove('hidden');
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
}