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
            presetGrid: document.getElementById('presetGrid'),
            btnPreV3: document.getElementById('btn-pre-v3'),
            btnPreV4: document.getElementById('btn-pre-v4'),
            tagSearchInput: document.getElementById('tagSearchInput'),
            tagSearchBtn: document.getElementById('tagSearchBtn'),
            tagResults: document.getElementById('tagResults'),
            sideDrawer: document.getElementById('sideDrawer'),
            drawerOverlay: document.getElementById('drawerOverlay'),
            tabSearch: document.getElementById('tab-search'),
            tabPreset: document.getElementById('tab-preset'),
            viewSearch: document.getElementById('view-search'),
            viewPreset: document.getElementById('view-preset'),
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
        this.els.drawerOverlay.classList.toggle('hidden');
    }

    switchDrawerTab(tab, renderPresetsCallback = null) {
        const activeClass = "active flex-1 py-2 text-xs font-medium rounded-lg transition-all border shadow-sm text-gray-900 bg-white border-gray-200 dark:bg-slate-800 dark:border-gray-700 dark:text-gray-200";
        const inactiveClass = "flex-1 py-2 text-xs font-medium rounded-lg transition-all border border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

        if (tab === 'search') {
            this.els.tabSearch.className = activeClass;
            this.els.tabPreset.className = inactiveClass;
            this.els.viewSearch.classList.remove('hidden');
            this.els.viewPreset.classList.add('hidden');
        } else {
            this.els.tabSearch.className = inactiveClass;
            this.els.tabPreset.className = activeClass;
            this.els.viewSearch.classList.add('hidden');
            this.els.viewPreset.classList.remove('hidden');
            if (renderPresetsCallback) renderPresetsCallback();
        }
    }

    openPresets(renderPresetsCallback = null) {
        if (!this.els.sideDrawer.classList.contains('drawer-open')) this.toggleDrawer();
        this.switchDrawerTab('preset', renderPresetsCallback);
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
    }

    showImageActions(show) {
        if (show) this.els.imageActions.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
        else this.els.imageActions.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }

    resetPreview() {
        const { resultGrid, placeholder, dlBtn } = this.els;
        resultGrid.innerHTML = '';
        resultGrid.classList.add('hidden');
        placeholder.classList.remove('hidden');
        dlBtn.disabled = true;
        dlBtn.classList.add('opacity-50', 'cursor-not-allowed');
        this.showImageActions(false);
    }
    
    showResultImages(results, onSelect) {
        const { resultGrid, placeholder, dlBtn } = this.els;
        resultGrid.innerHTML = '';
        placeholder.classList.add('hidden');
        resultGrid.classList.remove('hidden');
        
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
            
            imgWrapper.appendChild(img);
            
            const select = () => {
                // 清除其他选中状态
                resultGrid.querySelectorAll('img').forEach(i => i.classList.remove('border-blue-500', 'ring-4', 'ring-blue-500/20'));
                img.classList.add('border-blue-500', 'ring-4', 'ring-blue-500/20');
                if (onSelect) onSelect(item);
            };

            imgWrapper.onclick = select;
            resultGrid.appendChild(imgWrapper);

            // 默认选中第一个
            if (index === 0) select();
        });

        dlBtn.disabled = false;
        dlBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        dlBtn.classList.add('cursor-pointer');
    }

    // 保持兼容性，虽然现在主要用 showResultImages
    showResultImage(url) {
        this.showResultImages([{ imageUrl: url }]);
    }
}
}