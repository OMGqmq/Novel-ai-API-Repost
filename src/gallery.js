/**
 * GalleryController Module
 * Encapsulates all gallery, infinite scrolling, showcase rendering, and ZIP exporting logic.
 */
export class GalleryController {
    constructor({ store, ui, appState }) {
        this.store = store;
        this.ui = ui;
        this.appState = appState;
        
        this.galleryPage = 0;
        this.galleryHasMore = true;
        this.galleryLoading = false;
        this.galleryItems = [];
        
        this.init();
    }
    
    init() {
        // Bind container scroll event for infinite scrolling
        const historyArea = document.getElementById('historyArea');
        if (historyArea) {
            historyArea.addEventListener('scroll', () => {
                if (historyArea.scrollTop + historyArea.clientHeight >= historyArea.scrollHeight - 100) {
                    this.loadMoreGallery();
                }
            });
        }
    }
    
    async loadGallery() {
        this.galleryPage = 0;
        this.galleryHasMore = true;
        this.galleryLoading = false;
        this.galleryItems = [];
        this.ui.els.galleryGrid.innerHTML = '';
        
        await this.loadMoreGallery(true);
    }
    
    async loadMoreGallery(isFirstLoad = false) {
        if (this.galleryLoading || (!this.galleryHasMore && !isFirstLoad)) return;
        this.galleryLoading = true;

        let loaderEl = document.getElementById('galleryLoader');
        if (!loaderEl) {
            loaderEl = document.createElement('div');
            loaderEl.id = 'galleryLoader';
            loaderEl.className = 'col-span-full py-4 flex justify-center text-gray-400 text-xs font-semibold';
            loaderEl.innerHTML = '<span class="loader w-4 h-4 mr-2"></span> 正在加载历史图片...';
            this.ui.els.galleryGrid.appendChild(loaderEl);
        }

        try {
            const limit = 24;
            const pageData = await this.store.getImagesPage(this.galleryPage, limit);
            
            loaderEl = document.getElementById('galleryLoader');
            if (loaderEl && loaderEl.parentNode) {
                loaderEl.parentNode.removeChild(loaderEl);
            }

            if (pageData.length < limit) {
                this.galleryHasMore = false;
            }

            if (isFirstLoad) {
                this.ui.els.galleryGrid.innerHTML = '';
                this.galleryItems = [];
            }

            if (pageData.length === 0) {
                if (this.galleryPage === 0) {
                    this.ui.els.emptyGallery.classList.remove('hidden');
                    this.ui.els.zipBtn.classList.add('hidden');
                    this.ui.els.clearBtn.classList.add('hidden');
                }
                return;
            }

            this.ui.els.emptyGallery.classList.add('hidden');
            if (this.ui.currentRightView === 'history') {
                this.ui.els.zipBtn.classList.remove('hidden');
                this.ui.els.clearBtn.classList.remove('hidden');
            }

            this.galleryItems = this.galleryItems.concat(pageData);

            const fragment = document.createDocumentFragment();
            pageData.forEach(item => {
                const el = document.createElement('div');
                el.className = 'gallery-item aspect-square bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border dark:border-slate-700 cursor-pointer shadow-sm hover:scale-[1.01] transition-transform duration-200';
                
                el.innerHTML = `
                    <img src="${item.image}" class="w-full h-full object-cover" loading="lazy">
                    <button class="delete-item-btn" title="删除此图片">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;

                const delBtn = el.querySelector('.delete-item-btn');
                if (delBtn) {
                    delBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (!(await window.showConfirm("您确定要从历史图库中删除这张图片吗？该操作不可撤销。", "删除图库图片", "trash-2"))) return;
                        try {
                            await this.store.deleteImage(item.id);
                            if (this.appState.currentImageId === item.id) {
                                this.ui.resetPreview();
                            }
                            this.loadGallery();
                        } catch (err) {
                            console.error("Failed to delete history image", err);
                        }
                    };
                }

                el.onclick = () => window.openLightbox(item);
                fragment.appendChild(el);
            });
            this.ui.els.galleryGrid.appendChild(fragment);

            this.galleryPage++;
        } catch (e) {
            console.error("Failed to load gallery page", e);
        } finally {
            this.galleryLoading = false;
        }
    }
    
    switchGalleryTab(tab) {
        this.appState.currentGalleryTab = tab;
        const tabShowcase = document.getElementById('tabShowcase');
        const tabHistory = document.getElementById('tabHistory');
        const showcaseGrid = document.getElementById('showcaseGrid');
        const activeClass = 'px-4 py-1.5 text-[11px] font-semibold rounded-full transition-all bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm';
        const inactiveClass = 'px-4 py-1.5 text-[11px] font-semibold rounded-full transition-all text-gray-500 dark:text-gray-400';
        if (tab === 'showcase') {
            if (tabShowcase) tabShowcase.className = activeClass;
            if (tabHistory) tabHistory.className = inactiveClass;
            if (showcaseGrid) showcaseGrid.classList.remove('hidden');
            this.ui.els.galleryGrid.classList.add('hidden');
            this.ui.els.emptyGallery.classList.add('hidden');
            this.ui.els.zipBtn.classList.add('hidden');
            this.ui.els.clearBtn.classList.add('hidden');
            if (showcaseGrid && showcaseGrid.children.length === 0) this.renderShowcase();
        } else {
            if (tabShowcase) tabShowcase.className = inactiveClass;
            if (tabHistory) tabHistory.className = activeClass;
            if (showcaseGrid) showcaseGrid.classList.add('hidden');
            this.ui.els.galleryGrid.classList.remove('hidden');
            this.ui.els.zipBtn.classList.remove('hidden');
            this.ui.els.clearBtn.classList.remove('hidden');
            this.loadGallery();
        }
    }
    
    renderShowcase() {
        const grid = document.getElementById('showcaseGrid');
        if (!grid || this.appState.showcaseData.length === 0) return;
        grid.innerHTML = '';
        
        const chunkSize = 24;
        let index = 0;
        const self = this;

        function renderChunk() {
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + chunkSize, self.appState.showcaseData.length);
            for (; index < end; index++) {
                const item = self.appState.showcaseData[index];
                const el = document.createElement('div');
                el.className = 'gallery-item aspect-square bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border dark:border-slate-700 cursor-pointer shadow-sm hover:shadow-md transition-shadow';
                const img = document.createElement('img');
                img.className = 'w-full h-full object-cover';
                img.loading = 'lazy';
                img.src = `images/${item.id}.png`;
                img.alt = '';
                el.appendChild(img);
                el.onclick = () => { item.isShowcase = true; window.openLightbox(item); };
                fragment.appendChild(el);
            }
            grid.appendChild(fragment);
            if (index < self.appState.showcaseData.length) {
                requestAnimationFrame(renderChunk);
            }
        }
        renderChunk();
    }
    
    loadPreviewFromHistory(item) {
        this.ui.switchRightView('preview');
        this.ui.showResultImage(item.image);
        this.appState.currentImageId = item.id;
        this.appState.currentImageData = { ...item, imageUrl: item.image };
        window.lastSelectedImageUrl = item.image;
        this.ui.showImageActions(true);
        this.ui.toggleMobileControls(false);
    }
    
    loadPreviewFromShowcase(item) {
        this.ui.switchRightView('preview');
        const url = `images/${item.id}.png`;
        this.ui.showResultImage(url);
        this.appState.currentImageId = null;
        this.appState.currentImageData = { prompt: item.prompt, model: item.model, isShowcase: true, imageUrl: url };
        window.lastSelectedImageUrl = url;
        this.ui.showImageActions(true);
        this.ui.toggleMobileControls(false);
    }
    
    useCurrentPrompt() {
        if (!this.appState.currentImageData) return;
        this.ui.els.prompt.value = this.appState.currentImageData.prompt;
        this.ui.els.prompt.dispatchEvent(new Event('input', { bubbles: true }));
        this.ui.setModel(this.appState.currentImageData.model || 'v3');
        this.ui.els.prompt.classList.add('bg-blue-50', 'dark:bg-blue-900/30');
        setTimeout(() => this.ui.els.prompt.classList.remove('bg-blue-50', 'dark:bg-blue-900/30'), 500);
        this.ui.toggleMobileControls(true);
    }
    
    async downloadZip() {
        try {
            const items = await this.store.getAllImages();
            if (!items.length) return;
            // Check if JSZip is loaded globally
            const JSZipLib = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
            if (!JSZipLib) {
                throw new Error("JSZip 库未加载");
            }
            const zip = new JSZipLib();
            const folder = zip.folder("novelai_gallery");
            items.forEach((item, idx) => {
                const safePrompt = item.prompt 
                    ? item.prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').replace(/_+/g, '_').substring(0, 30) 
                    : '';
                const cleanPrompt = safePrompt.trim().replace(/^_+|_+$/g, '');
                const filename = `${idx}_${cleanPrompt || 'untitled'}.png`;
                folder.file(filename, item.image.split(',')[1], { base64: true });
            });
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const filename = `history_${Date.now()}.zip`;
            window.triggerDownload(url, filename);
        } catch (e) {
            console.error("Failed to download gallery zip", e);
            if (window.showToast) window.showToast("打包下载失败: " + e.message, "error");
        }
    }
}
