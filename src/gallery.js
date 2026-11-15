/**
 * GalleryController Module
 * Encapsulates all gallery, infinite scrolling, showcase rendering, and ZIP exporting logic.
 */
import * as motionMod from './motion-controller.js';

function getGalleryMotionController() {
    return (typeof window !== 'undefined' && window.motionController) || motionMod.motionController || null;
}

function prefersGalleryReducedMotion() {
    const mc = getGalleryMotionController();
    if (mc && typeof mc.prefersReducedMotion === 'function') {
        return mc.prefersReducedMotion();
    }
    if (typeof document !== 'undefined' && document.documentElement?.classList?.contains?.('low-perf')) {
        return true;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
}

function applyGalleryStagger(container, selector = '.gallery-item.studio-list-enter') {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    const mc = getGalleryMotionController();
    if (mc && typeof mc.setStaggerIndices === 'function') {
        mc.setStaggerIndices(container, selector, 10);
        return;
    }
    const items = container.querySelectorAll(selector);
    let idx = 0;
    items.forEach((el) => {
        if (el?.style?.setProperty) {
            el.style.setProperty('--sibling-index', String(Math.min(idx, 10)));
        }
        idx++;
    });
}

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
            loaderEl.className = 'col-span-full py-4 flex justify-center text-slate-500 dark:text-slate-400 text-xs font-semibold';
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
                    this.ui.renderFilmstrip?.([], null);
                }
                return;
            }

            this.ui.els.emptyGallery.classList.add('hidden');
            if (this.ui.currentRightView === 'history') {
                this.ui.els.zipBtn.classList.remove('hidden');
                this.ui.els.clearBtn.classList.remove('hidden');
            }

            this.galleryItems = this.galleryItems.concat(pageData);

            const isFirstPage = this.galleryPage === 0;
            const fragment = document.createDocumentFragment();
            pageData.forEach((item, idx) => {
                const card = this._createGalleryItemElement(item);
                if (card?.style?.setProperty) {
                    card.style.setProperty('--sibling-index', String(Math.min(idx, 10)));
                }
                fragment.appendChild(card);
            });
            this.ui.els.galleryGrid.appendChild(fragment);
            if (isFirstPage) {
                applyGalleryStagger(this.ui.els.galleryGrid, '.gallery-item.studio-list-enter');
            }
            this.ui.renderFilmstrip?.(this.galleryItems, this.appState?.currentImageId);

            this.galleryPage++;
        } catch (e) {
            console.error("Failed to load gallery page", e);
        } finally {
            this.galleryLoading = false;
        }
    }

    _createGalleryItemElement(item) {
        const el = document.createElement('div');
        el.className = 'gallery-item studio-card studio-list-enter aspect-square p-0 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border border-slate-200/80 dark:border-slate-700 cursor-pointer shadow-sm transition-colors duration-200';
        if (item.id !== undefined && item.id !== null) {
            el.id = `gallery-item-${item.id}`;
            if (el.dataset) el.dataset.id = item.id;
        }

        const fullSrc = (typeof Blob !== 'undefined' && item.image instanceof Blob)
            ? (item.imageUrl ||= URL.createObjectURL(item.image))
            : (item.imageUrl ||= (item.image || ''));

        const displaySrc = item.thumb || fullSrc;

        const img = document.createElement('img');
        img.src = displaySrc;
        img.className = 'w-full h-full object-cover';
        img.loading = 'lazy';
        img.alt = item.prompt ? String(item.prompt).slice(0, 80) : '历史作品';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'delete-item-btn';
        delBtn.title = '删除此图片';
        if (typeof delBtn.setAttribute === 'function') {
            delBtn.setAttribute('aria-label', '删除此图片');
        }

        if (typeof document.createElementNS === 'function') {
            const SVG_NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('class', 'w-3.5 h-3.5 pointer-events-none');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2.5');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.setAttribute('aria-hidden', 'true');
            const l1 = document.createElementNS(SVG_NS, 'line');
            l1.setAttribute('x1', '18'); l1.setAttribute('y1', '6'); l1.setAttribute('x2', '6'); l1.setAttribute('y2', '18');
            const l2 = document.createElementNS(SVG_NS, 'line');
            l2.setAttribute('x1', '6'); l2.setAttribute('y1', '6'); l2.setAttribute('x2', '18'); l2.setAttribute('y2', '18');
            svg.appendChild(l1);
            svg.appendChild(l2);
            delBtn.appendChild(svg);
        } else {
            delBtn.textContent = '×';
        }

        el.appendChild(img);
        el.appendChild(delBtn);

        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!(await window.showConfirm("您确定要从历史图库中删除这张图片吗？该操作不可撤销。", "删除图库图片", "trash-2"))) return;
            try {
                await this.store.deleteImage(item.id);
                if (this.appState.currentImageId === item.id) {
                    this.ui.resetPreview();
                }
                this.removeImage(item.id);
            } catch (err) {
                console.error("Failed to delete history image", err);
            }
        };

        el.onclick = () => window.openLightbox(item, img);
        return el;
    }

    prependImage(item) {
        if (!item) return;
        const existingIdx = this.galleryItems.findIndex(x => x.id === item.id);
        if (existingIdx !== -1) {
            this.galleryItems.splice(existingIdx, 1);
            const oldEl = document.getElementById(`gallery-item-${item.id}`) || (this.ui.els.galleryGrid ? this.ui.els.galleryGrid.querySelector(`[data-id="${item.id}"]`) : null);
            if (oldEl && oldEl.parentNode) oldEl.remove();
        }
        this.galleryItems.unshift(item);
        const el = this._createGalleryItemElement(item);
        if (this.ui.els.galleryGrid) {
            this.ui.els.galleryGrid.prepend(el);
        }
        if (this.ui.els.emptyGallery) this.ui.els.emptyGallery.classList.add('hidden');
        if (this.ui.currentRightView === 'history') {
            if (this.ui.els.zipBtn) this.ui.els.zipBtn.classList.remove('hidden');
            if (this.ui.els.clearBtn) this.ui.els.clearBtn.classList.remove('hidden');
        }
        this.ui.renderFilmstrip?.(this.galleryItems, this.appState?.currentImageId || item.id);
    }

    removeImage(id) {
        if (id === undefined || id === null) return;
        const index = this.galleryItems.findIndex(x => x.id === id);
        if (index !== -1) {
            const removed = this.galleryItems.splice(index, 1)[0];
            if (removed?.imageUrl && typeof Blob !== 'undefined' && removed.image instanceof Blob && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                try { URL.revokeObjectURL(removed.imageUrl); } catch (e) {}
            }
        }
        const el = document.getElementById(`gallery-item-${id}`) || (this.ui.els.galleryGrid ? this.ui.els.galleryGrid.querySelector(`[data-id="${id}"]`) : null);
        if (el && el.parentNode) {
            const reduced = prefersGalleryReducedMotion();
            const canAnimate = !reduced && typeof el.animate === 'function' && typeof el.getAnimations === 'function';
            if (canAnimate) {
                try {
                    const anim = el.animate(
                        [
                            { opacity: 1, transform: 'scale(1)' },
                            { opacity: 0, transform: 'scale(0.88)' }
                        ],
                        { duration: 160, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
                    );
                    let removedDone = false;
                    const finalize = () => {
                        if (removedDone) return;
                        removedDone = true;
                        if (el.parentNode) el.remove();
                    };
                    anim.onfinish = finalize;
                    setTimeout(finalize, 190);
                } catch (_) {
                    el.remove();
                }
            } else {
                el.remove();
            }
        }
        if (this.galleryItems.length === 0) {
            if (this.ui.els.emptyGallery) this.ui.els.emptyGallery.classList.remove('hidden');
            if (this.ui.els.zipBtn) this.ui.els.zipBtn.classList.add('hidden');
            if (this.ui.els.clearBtn) this.ui.els.clearBtn.classList.add('hidden');
        }
        this.ui.renderFilmstrip?.(this.galleryItems, this.appState?.currentImageId);
    }
    
    switchGalleryTab(tab) {
        this.appState.currentGalleryTab = tab;
        const tabShowcase = document.getElementById('tabShowcase');
        const tabHistory = document.getElementById('tabHistory');
        const tabGroup = document.getElementById('galleryTabToggle');
        const showcaseGrid = document.getElementById('showcaseGrid');
        const usesStudioTabs = Boolean(
            tabGroup?.classList?.contains?.('studio-tabs')
            || tabShowcase?.classList?.contains?.('studio-tab')
            || tabHistory?.classList?.contains?.('studio-tab')
        );
        const activeClass = usesStudioTabs
            ? 'studio-tab active'
            : 'studio-tab active px-4 py-1.5 text-[11px] font-semibold rounded-full transition-colors duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm';
        const inactiveClass = usesStudioTabs
            ? 'studio-tab'
            : 'studio-tab px-4 py-1.5 text-[11px] font-semibold rounded-full transition-colors duration-200 text-slate-500 dark:text-slate-400';
        const isShowcase = tab === 'showcase';
        if (tabShowcase) {
            tabShowcase.className = isShowcase ? activeClass : inactiveClass;
            tabShowcase.setAttribute?.('aria-pressed', isShowcase ? 'true' : 'false');
        }
        if (tabHistory) {
            tabHistory.className = isShowcase ? inactiveClass : activeClass;
            tabHistory.setAttribute?.('aria-pressed', isShowcase ? 'false' : 'true');
        }
        if (isShowcase) {
            if (showcaseGrid) showcaseGrid.classList.remove('hidden');
            this.ui.els.galleryGrid.classList.add('hidden');
            this.ui.els.emptyGallery.classList.add('hidden');
            this.ui.els.zipBtn.classList.add('hidden');
            this.ui.els.clearBtn.classList.add('hidden');
            if (showcaseGrid && showcaseGrid.children.length === 0) this.renderShowcase();
        } else {
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
            const isFirstChunk = index === 0;
            const chunkStart = index;
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + chunkSize, self.appState.showcaseData.length);
            for (; index < end; index++) {
                const item = self.appState.showcaseData[index];
                const el = document.createElement('div');
                el.className = 'gallery-item studio-card studio-list-enter aspect-square p-0 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border border-slate-200/80 dark:border-slate-700 cursor-pointer shadow-sm hover:shadow-md transition-colors duration-200';
                if (el?.style?.setProperty) {
                    el.style.setProperty('--sibling-index', String(Math.min(index - chunkStart, 10)));
                }
                const img = document.createElement('img');
                img.className = 'w-full h-full object-cover';
                img.loading = 'lazy';
                img.src = `images/${item.id}.png`;
                img.alt = '';
                el.appendChild(img);
                el.onclick = () => { item.isShowcase = true; window.openLightbox(item, img); };
                fragment.appendChild(el);
            }
            grid.appendChild(fragment);
            if (isFirstChunk) {
                applyGalleryStagger(grid, '.gallery-item.studio-list-enter');
            }
            if (index < self.appState.showcaseData.length) {
                requestAnimationFrame(renderChunk);
            }
        }
        renderChunk();
    }
    
    loadPreviewFromHistory(item) {
        this.ui.switchRightView('preview');
        const fullUrl = (typeof Blob !== 'undefined' && item.image instanceof Blob)
            ? (item.imageUrl ||= URL.createObjectURL(item.image))
            : (item.image || item.imageUrl);
        this.ui.showResultImage(fullUrl);
        this.appState.currentImageId = item.id;
        this.appState.currentImageData = { ...item, imageUrl: fullUrl };
        window.lastSelectedImageUrl = fullUrl;
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
        const flashClasses = ['bg-slate-200/70', 'dark:bg-slate-700/60', 'ring-2', 'ring-slate-900/20', 'dark:ring-white/25'];
        this.ui.els.prompt.classList.add(...flashClasses);
        setTimeout(() => this.ui.els.prompt.classList.remove(...flashClasses), 500);
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
            const filename = `history_${Date.now()}.zip`;
            window.triggerDownload(content, filename);
        } catch (e) {
            console.error("Failed to download gallery zip", e);
            if (window.showToast) window.showToast("打包下载失败: " + e.message, "error");
        }
    }
}
