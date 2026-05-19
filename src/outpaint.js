export class OutpaintEditor {
    constructor(dependencies) {
        this.engine = dependencies.engine;
        this.store = dependencies.store;

        this.els = {
            area: document.getElementById('outpaintArea'),
            container: document.getElementById('outpaintContainer'),
            canvas: document.getElementById('outpaintCanvas'),
            maskCanvas: document.getElementById('outpaintMaskCanvas'),
            selection: document.getElementById('outpaintSelection'),
            sizeLabel: document.getElementById('outpaintSizeLabel'),
            sourceImg: document.getElementById('singleResultImg'),
            brushControl: document.getElementById('outpaintBrushControl'),
            brushSizeInput: document.getElementById('outpaintBrushSize'),
            brushSizeVal: document.getElementById('outpaintBrushSizeVal'),
            modeMoveBtn: document.getElementById('outpaintModeMove'),
            modePaintBtn: document.getElementById('outpaintModePaint'),
            toolbar: document.getElementById('outpaintToolbar')
        };

        this.ctx = this.els.canvas.getContext('2d');
        this.maskCtx = this.els.maskCanvas.getContext('2d');

        // Transform state
        this.transform = { x: 0, y: 0, scale: 1 };
        
        // Selection state
        this.selection = { x: 0, y: 0, w: 512, h: 512 };
        this.maxPixels = 1024 * 1024; // 1048576
        
        // Mode state
        this.mode = 'move'; // 'move' or 'paint'
        this.isPainting = false;
        this.lastPos = null;

        // History state
        this.history = [];
        this.maskHistory = [];
        this.maxHistory = 10;
        
        // Interaction state
        this.isPanning = false;
        this.isDraggingSelection = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.lastMouse = { x: 0, y: 0 };
        this.startTransform = null;
        this.startSelection = null;
        this.isSnapEnabled = false;

        this._bindEvents();
    }

    toggleSnap() {
        this.isSnapEnabled = !this.isSnapEnabled;
        const btn = document.getElementById('outpaintSnapToggle');
        if (btn) {
            if (this.isSnapEnabled) {
                btn.classList.remove('text-gray-500');
                btn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-gray-700', 'dark:text-gray-300');
                btn.title = '边缘吸附: 开';
            } else {
                btn.classList.add('text-gray-500');
                btn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-gray-700', 'dark:text-gray-300');
                btn.title = '边缘吸附: 关';
            }
        }
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'move') {
            this.els.selection.classList.remove('cursor-crosshair');
            this.els.selection.classList.add('cursor-move');
            this.els.maskCanvas.classList.add('pointer-events-none');
            this.els.brushControl.classList.remove('flex');
            this.els.brushControl.classList.add('hidden');
            this.els.modeMoveBtn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm');
            this.els.modeMoveBtn.classList.remove('text-gray-500');
            this.els.modePaintBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm');
            this.els.modePaintBtn.classList.add('text-gray-500');
        } else {
            this.els.selection.classList.remove('cursor-move');
            this.els.selection.classList.add('cursor-crosshair');
            this.els.maskCanvas.classList.remove('pointer-events-none');
            this.els.brushControl.classList.remove('hidden');
            this.els.brushControl.classList.add('flex');
            this.els.modePaintBtn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm');
            this.els.modePaintBtn.classList.remove('text-gray-500');
            this.els.modeMoveBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm');
            this.els.modeMoveBtn.classList.add('text-gray-500');
        }
    }

    _getBrushSize() {
        return parseInt(this.els.brushSizeInput.value || 60);
    }

    _drawOnMask(pos, isStart = false) {
        const r = this._getBrushSize();
        this.maskCtx.globalCompositeOperation = 'source-over';
        this.maskCtx.fillStyle = '#FFFFFF';
        
        if (isStart || !this.lastPos) {
            this.maskCtx.beginPath();
            this.maskCtx.arc(Math.round(pos.x), Math.round(pos.y), r / 2, 0, Math.PI * 2);
            this.maskCtx.fill();
        } else {
            const dx = pos.x - this.lastPos.x;
            const dy = pos.y - this.lastPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const step = Math.max(1, Math.floor(r / 8));
            const numSteps = Math.max(1, Math.ceil(dist / step));
            for (let i = 0; i <= numSteps; i++) {
                const t = i / numSteps;
                const tx = this.lastPos.x + dx * t;
                const ty = this.lastPos.y + dy * t;
                this.maskCtx.beginPath();
                this.maskCtx.arc(Math.round(tx), Math.round(ty), r / 2, 0, Math.PI * 2);
                this.maskCtx.fill();
            }
        }
        this.lastPos = pos;
    }

    _getMaskPos(e) {
        const rect = this.els.maskCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = this.els.maskCanvas.width / rect.width;
        const scaleY = this.els.maskCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    open() {
        this.history = [];
        this.maskHistory = [];
        this.setMode('move');
        this.els.brushSizeInput.value = 60;
        this.els.brushSizeVal.textContent = 60;
        this.maskCtx.clearRect(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height);

        if (!this.els.sourceImg || !this.els.sourceImg.src) {
            alert('请先选择一张图片进行扩图');
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // Setup canvas
            this.els.canvas.width = img.naturalWidth;
            this.els.canvas.height = img.naturalHeight;
            this.ctx.clearRect(0, 0, this.els.canvas.width, this.els.canvas.height);
            this.ctx.drawImage(img, 0, 0);

            // Setup initial selection
            this.selection.w = Math.min(img.naturalWidth, 1024);
            this.selection.h = Math.min(img.naturalHeight, 1024);
            this.selection.x = (img.naturalWidth - this.selection.w) / 2;
            this.selection.y = (img.naturalHeight - this.selection.h) / 2;

            this._updateSelectionDOM();
            this.resetView();

            this.els.area.classList.remove('hidden');
            if (window.safeCreateIcons) window.safeCreateIcons();
        };
        img.src = this.els.sourceImg.src;
    }

    close() {
        this.els.area.classList.add('hidden');
    }

    saveState() {
        // Save current canvas state and selection
        const state = {
            width: this.els.canvas.width,
            height: this.els.canvas.height,
            imageData: this.ctx.getImageData(0, 0, this.els.canvas.width, this.els.canvas.height),
            selection: { ...this.selection },
            transform: { ...this.transform }
        };
        this.history.push(state);
        if (this.history.length > this.maxHistory) this.history.shift();
    }

    undo() {
        if (this.mode === 'paint' && this.maskHistory.length > 0) {
            const state = this.maskHistory.pop();
            this.maskCtx.putImageData(state, 0, 0);
            return;
        }

        if (this.history.length === 0) {
            alert('没有可撤销的操作');
            return;
        }
        const state = this.history.pop();
        
        this.els.canvas.width = state.width;
        this.els.canvas.height = state.height;
        this.ctx.putImageData(state.imageData, 0, 0);
        
        this.selection = { ...state.selection };
        this.transform = { ...state.transform };
        
        this._applyTransform();
        this._updateSelectionDOM();
        
        // Update UI preview if needed
        const finalBase64 = this.els.canvas.toDataURL('image/jpeg', 0.95);
        if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
        window.lastSelectedImageUrl = finalBase64;
    }

    _hasPaintedMask() {
        const data = this.maskCtx.getImageData(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 200 && data[i + 3] > 128) return true;
        }
        return false;
    }

    clearMask() {
        if (this.maskHistory.length > 0 || this._hasPaintedMask()) {
            this.maskHistory.push(this.maskCtx.getImageData(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height));
            if (this.maskHistory.length > 20) this.maskHistory.shift();
        }
        this.maskCtx.clearRect(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height);
    }

    async saveToHistory() {
        const finalBase64 = this.els.canvas.toDataURL('image/jpeg', 0.95);
        const modelVersionEl = document.getElementById('modelValue');
        const modelVersion = modelVersionEl ? modelVersionEl.value : 'v3';
        const prompt = document.getElementById('prompt')?.value || '';
        
        await this.store.saveImage(finalBase64, prompt, modelVersion);
        // 静默保存，控制台记录
        console.log("Image saved to history");
        if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
        window.lastSelectedImageUrl = finalBase64;
        if (window.switchGalleryTab) window.switchGalleryTab('history');
        // Let the global scope update the grid if needed
        if (window.loadGallery) window.loadGallery();
    }

    async generate() {
        const deskBtn = document.getElementById('desktopGenerateBtn');
        const floatBtn = document.getElementById('floatingGenerateBtn');
        let originalDeskHtml = '', originalFloatHtml = '';

        if (deskBtn) {
            originalDeskHtml = deskBtn.innerHTML;
            deskBtn.disabled = true;
            deskBtn.innerHTML = '<span class="loader w-4 h-4 border-white/50 border-t-transparent rounded-full animate-spin"></span> 生成中...';
        }
        if (floatBtn) {
            originalFloatHtml = floatBtn.innerHTML;
            floatBtn.disabled = true;
            floatBtn.innerHTML = '<span class="loader w-5 h-5 border-white/50 border-t-transparent rounded-full animate-spin"></span>';
        }

        try {
            const { w, h, x, y } = this.selection;
            const targetW = Math.round(w / 64) * 64;
            const targetH = Math.round(h / 64) * 64;

            // Crop image
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = targetW;
            cropCanvas.height = targetH;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(this.els.canvas, -x, -y);

            // Check if there is a painted mask
            const hasPaintedMask = this._hasPaintedMask();

            let finalMaskCanvas;
            let action = 'infill';

            if (hasPaintedMask) {
                // INPAINT MODE: Use the painted mask
                finalMaskCanvas = document.createElement('canvas');
                finalMaskCanvas.width = targetW;
                finalMaskCanvas.height = targetH;
                const fmcCtx = finalMaskCanvas.getContext('2d');
                fmcCtx.drawImage(this.els.maskCanvas, 0, 0, targetW, targetH);
                action = 'infill'; // NovelAI's inpaint action is often called 'infill' in their UI for legacy reasons, or handled by strength
            } else {
                // OUTPAINT MODE: Generate mask based on alpha channel
                const imgData = cropCtx.getImageData(0, 0, targetW, targetH);
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = targetW;
                maskCanvas.height = targetH;
                const maskCtx = maskCanvas.getContext('2d');
                
                // Fill mask background with white (Generate/Redraw area)
                maskCtx.fillStyle = '#FFFFFF';
                maskCtx.fillRect(0, 0, targetW, targetH);
                const maskData = maskCtx.getImageData(0, 0, targetW, targetH);

                for (let i = 0; i < imgData.data.length; i += 4) {
                    const alpha = imgData.data[i + 3];
                    if (alpha > 128) {
                        // If pixel is opaque, we want to KEEP it, so Mask = Black
                        maskData.data[i] = 0;
                        maskData.data[i + 1] = 0;
                        maskData.data[i + 2] = 0;
                    }
                }
                maskCtx.putImageData(maskData, 0, 0);

                // DILATE MASK: Expand the white area (generate) slightly into the black area (keep).
                finalMaskCanvas = document.createElement('canvas');
                finalMaskCanvas.width = targetW;
                finalMaskCanvas.height = targetH;
                const eCtx = finalMaskCanvas.getContext('2d');
                eCtx.fillStyle = '#000000';
                eCtx.fillRect(0, 0, targetW, targetH);
                eCtx.globalCompositeOperation = 'lighten';
                for(let dx = -8; dx <= 8; dx += 8) {
                    for(let dy = -8; dy <= 8; dy += 8) {
                        eCtx.drawImage(maskCanvas, dx, dy);
                    }
                }
            }

            // SMEAR IMAGE EDGES: Pull the edge colors outward so the AI has context.
            cropCtx.globalCompositeOperation = 'destination-over';
            for (let dist = 1; dist <= 32; dist *= 2) {
                cropCtx.drawImage(cropCanvas, dist, 0);
                cropCtx.drawImage(cropCanvas, -dist, 0);
                cropCtx.drawImage(cropCanvas, 0, dist);
                cropCtx.drawImage(cropCanvas, 0, -dist);
            }
            
            // Fill remaining transparent space with neutral gray (128,128,128)
            cropCtx.fillStyle = '#808080';
            cropCtx.fillRect(0, 0, targetW, targetH);

            // Check model version
            const modelVersionEl = document.getElementById('modelValue');
            const modelVersion = modelVersionEl ? modelVersionEl.value : 'v4.5';
            const isV4 = modelVersion.includes('v4');

            // Format mask
            const latentW = Math.ceil(targetW / 64) * 8;
            const latentH = Math.ceil(targetH / 64) * 8;
            let finalMaskBase64 = '';
            
            const tempMaskCanvas = document.createElement('canvas');
            tempMaskCanvas.width = latentW;
            tempMaskCanvas.height = latentH;
            const tempCtx = tempMaskCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = false;
            tempCtx.drawImage(finalMaskCanvas, 0, 0, latentW, latentH);

            if (isV4) {
                const finalMaskCanvasV4 = document.createElement('canvas');
                finalMaskCanvasV4.width = latentW * 8;
                finalMaskCanvasV4.height = latentH * 8;
                const finalCtx = finalMaskCanvasV4.getContext('2d');
                finalCtx.imageSmoothingEnabled = false;
                finalCtx.drawImage(tempMaskCanvas, 0, 0, finalMaskCanvasV4.width, finalMaskCanvasV4.height);
                finalMaskBase64 = finalMaskCanvasV4.toDataURL('image/png').split(',')[1];
            } else {
                finalMaskBase64 = tempMaskCanvas.toDataURL('image/png').split(',')[1];
            }

            const imageBase64 = cropCanvas.toDataURL('image/png').split(',')[1];

            // Build API params
            const prompt = document.getElementById('prompt')?.value || '';
            const negative_prompt = document.getElementById('negativePrompt')?.value || '';
            const steps = parseInt(document.getElementById('steps')?.value || 28);
            const scale = parseFloat(document.getElementById('scale')?.value || 5);
            const sampler = document.getElementById('sampler')?.value || 'k_euler';
            const strength = hasPaintedMask ? 0.7 : 1.0; // Use partial strength for inpaint if needed, though infill 1.0 is standard

            const params = {
                version: modelVersion,
                prompt,
                negative_prompt,
                width: targetW,
                height: targetH,
                steps,
                scale,
                sampler,
                image: imageBase64,
                mask: finalMaskBase64,
                strength: strength,
                action: action,
                add_original_image: true
            };

            // ... (Rest of the generate method for API call and stitching)
            // Handling Multi-API Keys gracefully
            const adminToken = this.store.getSetting('nai_admin_token');
            const userKey = this.store.getSetting('nai_user_key');
            const customApiKeyRaw = this.store.getSetting('nai_custom_api_key', '');
            const customKeys = customApiKeyRaw.split(/[\n,]/).map(k => k.trim()).filter(k => k);
            
            const authBase = { adminToken, userKey };
            const authsToTry = customKeys.length > 0 
                ? customKeys.map(key => ({ ...authBase, customApiKey: key }))
                : [{ ...authBase, customApiKey: "" }];

            let result = null;
            let lastError = null;

            for (const auth of authsToTry) {
                try {
                    result = await this.engine.generate(params, auth);
                    break;
                } catch (err) {
                    console.warn('API Key failed, trying next...', err);
                    lastError = err;
                }
            }

            if (!result) {
                throw new Error(lastError?.message || '所有配置的 API Key 均请求失败');
            }

            // Stitch the resulting image back
            const newImg = new Image();
            newImg.onload = () => {
                this.saveState();
                
                // Clear the mask after successful generation if it was an inpaint
                if (hasPaintedMask) {
                    this.maskCtx.clearRect(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height);
                    this.maskHistory = [];
                }

                const newCanvasW = Math.max(this.els.canvas.width, x + targetW);
                const newCanvasH = Math.max(this.els.canvas.height, y + targetH);
                const newCanvasX = Math.min(0, x);
                const newCanvasY = Math.min(0, y);

                const finalW = newCanvasW - newCanvasX;
                const finalH = newCanvasH - newCanvasY;

                const combinedCanvas = document.createElement('canvas');
                combinedCanvas.width = finalW;
                combinedCanvas.height = finalH;
                const combinedCtx = combinedCanvas.getContext('2d');

                combinedCtx.drawImage(this.els.canvas, -newCanvasX, -newCanvasY);
                combinedCtx.drawImage(newImg, x - newCanvasX, y - newCanvasY, targetW, targetH);

                this.els.canvas.width = finalW;
                this.els.canvas.height = finalH;
                this.ctx.clearRect(0, 0, finalW, finalH);
                this.ctx.drawImage(combinedCanvas, 0, 0);

                this.selection.x -= newCanvasX;
                this.selection.y -= newCanvasY;
                
                this.transform.x -= newCanvasX * this.transform.scale;
                this.transform.y -= newCanvasY * this.transform.scale;

                this._applyTransform();
                this._updateSelectionDOM();

                const finalBase64 = this.els.canvas.toDataURL('image/jpeg', 0.95);
                // 静默更新，不弹窗
                console.log(hasPaintedMask ? "Inpaint generated" : "Outpaint generated");
                if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
                window.lastSelectedImageUrl = finalBase64;
            };
            newImg.src = result.imageUrl;

            if (result.userRole && document.getElementById('creditDisplayDesktop')) {
                const text = result.userRole.replace(" (Limited)", "").replace(" (Unlimited)", "");
                document.getElementById('creditDisplayDesktop').textContent = text;
                document.getElementById('creditDisplayMobile').textContent = text;
            }

        } catch (err) {
            console.error(err);
            alert('操作失败: ' + err.message);
        } finally {
            if (deskBtn) {
                deskBtn.disabled = false;
                deskBtn.innerHTML = originalDeskHtml;
            }
            if (floatBtn) {
                floatBtn.disabled = false;
                floatBtn.innerHTML = originalFloatHtml;
            }
        }
    }

    resetView() {
        const areaRect = this.els.area.getBoundingClientRect();
        const contentW = this.els.canvas.width;
        const contentH = this.els.canvas.height;

        // Fit content into view with some padding
        const padding = 100;
        const scaleX = (areaRect.width - padding) / contentW;
        const scaleY = (areaRect.height - padding) / contentH;
        this.transform.scale = Math.min(scaleX, scaleY, 1); // Don't scale up past 1x initially
        if (isNaN(this.transform.scale) || this.transform.scale <= 0) this.transform.scale = 1;

        this.transform.x = (areaRect.width - contentW * this.transform.scale) / 2;
        this.transform.y = (areaRect.height - contentH * this.transform.scale) / 2;

        this._applyTransform();
    }

    zoomIn() {
        this._zoom(1.2);
    }

    zoomOut() {
        this._zoom(1 / 1.2);
    }

    _zoom(factor, originX = null, originY = null) {
        if (originX === null) {
            const rect = this.els.area.getBoundingClientRect();
            originX = rect.width / 2;
            originY = rect.height / 2;
        }

        const newScale = Math.max(0.05, Math.min(this.transform.scale * factor, 10));
        const ratio = newScale / (this.transform.scale || 1);

        this.transform.x = originX - (originX - this.transform.x) * ratio;
        this.transform.y = originY - (originY - this.transform.y) * ratio;
        this.transform.scale = newScale;

        this._applyTransform();
    }

    _applyTransform() {
        this.els.container.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
    }

    _updateSelectionDOM() {
        const w = Math.round(this.selection.w);
        const h = Math.round(this.selection.h);
        
        // Update mask canvas resolution if selection size changed
        if (this.els.maskCanvas.width !== w || this.els.maskCanvas.height !== h) {
            // Backup current mask
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.els.maskCanvas.width;
            tempCanvas.height = this.els.maskCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.els.maskCanvas, 0, 0);
            
            this.els.maskCanvas.width = w;
            this.els.maskCanvas.height = h;
            
            // Rescale mask to new size
            this.maskCtx.imageSmoothingEnabled = false;
            this.maskCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, w, h);
        }

        this.els.selection.style.width = `${w}px`;
        this.els.selection.style.height = `${h}px`;
        this.els.selection.style.transform = `translate(${this.selection.x}px, ${this.selection.y}px)`;
        
        this.els.sizeLabel.textContent = `${w} x ${h}`;
        
        if (this.selection.w * this.selection.h > this.maxPixels) {
            this.els.sizeLabel.classList.add('text-red-400');
        } else {
            this.els.sizeLabel.classList.remove('text-red-400');
        }
    }

    _bindEvents() {
        // --- Toolbar Dragging ---
        let dragTimer = null;
        let isDraggingToolbar = false;
        let tbStartX = 0, tbStartY = 0;
        let tbInitialLeft = 0, tbInitialTop = 0;

        const startToolbarDrag = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            dragTimer = setTimeout(() => {
                isDraggingToolbar = true;
                const rect = this.els.toolbar.getBoundingClientRect();
                const parentRect = this.els.area.getBoundingClientRect();
                
                this.els.toolbar.style.right = 'auto';
                this.els.toolbar.style.bottom = 'auto';
                this.els.toolbar.style.transform = 'none';
                
                tbInitialLeft = rect.left - parentRect.left;
                tbInitialTop = rect.top - parentRect.top;
                
                this.els.toolbar.style.left = `${tbInitialLeft}px`;
                this.els.toolbar.style.top = `${tbInitialTop}px`;
                this.els.toolbar.style.transition = 'none';
                this.els.toolbar.style.cursor = 'grabbing';
                
                tbStartX = clientX;
                tbStartY = clientY;
            }, 300); // 300ms long press to drag
        };

        const stopToolbarDrag = (e) => {
            if (dragTimer) clearTimeout(dragTimer);
            if (isDraggingToolbar) {
                isDraggingToolbar = false;
                this.els.toolbar.style.transition = '';
                this.els.toolbar.style.cursor = 'move';
                if (e) e.preventDefault();
            }
        };

        if (this.els.toolbar) {
            this.els.toolbar.addEventListener('mousedown', startToolbarDrag);
            this.els.toolbar.addEventListener('touchstart', startToolbarDrag, { passive: true });
            this.els.toolbar.style.cursor = 'move';
        }

        // --- Panning & Zooming (Area) ---
        this.els.area.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
                // Zoom
                const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                this._zoom(factor, e.clientX, e.clientY);
            } else {
                // Pan
                this.transform.x -= e.deltaX;
                this.transform.y -= e.deltaY;
                this._applyTransform();
            }
        }, { passive: false });

        this.els.brushSizeInput?.addEventListener('input', e => {
            this.els.brushSizeVal.textContent = e.target.value;
        });

        const handlePanStart = (e) => {
            if (this.mode === 'paint' && (e.target === this.els.maskCanvas || e.target === this.els.selection)) {
                this.isPainting = true;
                this.maskHistory.push(this.maskCtx.getImageData(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height));
                if (this.maskHistory.length > 20) this.maskHistory.shift();
                this._drawOnMask(this._getMaskPos(e), true);
                return;
            }

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            if (e.target === this.els.area || e.target === this.els.canvas) {
                this.isPanning = true;
                this.lastMouse = { x: clientX, y: clientY };
                this.startTransform = { ...this.transform };
                this.els.area.style.cursor = 'grabbing';
            }
        };

        this.els.area.addEventListener('mousedown', handlePanStart);
        this.els.area.addEventListener('touchstart', handlePanStart, { passive: false });

        // --- Selection Interaction ---
        const handleSelectionStart = (e) => {
            if (this.mode === 'paint') return; // Handled in handlePanStart for painting

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            if (e.target.classList.contains('resize-handle')) {
                this.isResizing = true;
                this.resizeHandle = e.target.dataset.handle;
            } else {
                this.isDraggingSelection = true;
            }
            
            this.lastMouse = { x: clientX, y: clientY };
            this.startSelection = { ...this.selection };
            e.stopPropagation(); // Prevent panning
            if(e.touches) e.preventDefault(); // Prevent scrolling on mobile
        };

        this.els.selection.addEventListener('mousedown', handleSelectionStart);
        this.els.selection.addEventListener('touchstart', handleSelectionStart, { passive: false });

        // --- Global Move & Up/End ---
        const handleMove = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // Handle Toolbar dragging first
            if (isDraggingToolbar) {
                if(e.touches) e.preventDefault();
                const dx = clientX - tbStartX;
                const dy = clientY - tbStartY;
                
                // Restrict toolbar within the area
                const rect = this.els.toolbar.getBoundingClientRect();
                const parentRect = this.els.area.getBoundingClientRect();
                
                let newLeft = tbInitialLeft + dx;
                let newTop = tbInitialTop + dy;
                
                newLeft = Math.max(0, Math.min(newLeft, parentRect.width - rect.width));
                newTop = Math.max(0, Math.min(newTop, parentRect.height - rect.height));

                this.els.toolbar.style.left = `${newLeft}px`;
                this.els.toolbar.style.top = `${newTop}px`;
                return; // Stop other interactions
            }
            
            // Abort toolbar drag timer if moving too much before timeout
            if (dragTimer && (Math.abs(clientX - tbStartX) > 10 || Math.abs(clientY - tbStartY) > 10)) {
                clearTimeout(dragTimer);
                dragTimer = null;
            }

            if (this.isPainting) {
                this._drawOnMask(this._getMaskPos(e), false);
                return;
            }

            if (this.isPanning) {
                if(e.touches) e.preventDefault();
                const dx = clientX - this.lastMouse.x;
                const dy = clientY - this.lastMouse.y;
                this.transform.x = this.startTransform.x + dx;
                this.transform.y = this.startTransform.y + dy;
                this._applyTransform();
            } else if (this.isDraggingSelection) {
                if(e.touches) e.preventDefault();
                const dx = (clientX - this.lastMouse.x) / this.transform.scale;
                const dy = (clientY - this.lastMouse.y) / this.transform.scale;
                
                let newX = this.startSelection.x + dx;
                let newY = this.startSelection.y + dy;

                if (this.isSnapEnabled) {
                    const snapThreshold = 10 / this.transform.scale; // Reduced to 1/2 roughly
                    const canvasW = this.els.canvas.width;
                    const canvasH = this.els.canvas.height;
                    
                    if (Math.abs(newX) < snapThreshold) newX = 0;
                    if (Math.abs(newX + this.selection.w - canvasW) < snapThreshold) newX = canvasW - this.selection.w;
                    if (Math.abs(newY) < snapThreshold) newY = 0;
                    if (Math.abs(newY + this.selection.h - canvasH) < snapThreshold) newY = canvasH - this.selection.h;
                }

                this.selection.x = newX;
                this.selection.y = newY;
                this._updateSelectionDOM();
            } else if (this.isResizing) {
                if(e.touches) e.preventDefault();
                const dx = (clientX - this.lastMouse.x) / this.transform.scale;
                const dy = (clientY - this.lastMouse.y) / this.transform.scale;
                
                let newW = this.startSelection.w;
                let newH = this.startSelection.h;
                let newX = this.startSelection.x;
                let newY = this.startSelection.y;

                if (this.resizeHandle.includes('e')) newW += dx;
                if (this.resizeHandle.includes('s')) newH += dy;
                if (this.resizeHandle.includes('w')) {
                    newW -= dx;
                    newX += dx;
                }
                if (this.resizeHandle.includes('n')) {
                    newH -= dy;
                    newY += dy;
                }

                if (this.isSnapEnabled) {
                    const snapThreshold = 10 / this.transform.scale;
                    const canvasW = this.els.canvas.width;
                    const canvasH = this.els.canvas.height;

                    if (this.resizeHandle.includes('e')) {
                        if (Math.abs(newX + newW - canvasW) < snapThreshold) newW = canvasW - newX;
                    }
                    if (this.resizeHandle.includes('w')) {
                        if (Math.abs(newX) < snapThreshold) {
                            newW = newW + newX;
                            newX = 0;
                        }
                    }
                    if (this.resizeHandle.includes('s')) {
                        if (Math.abs(newY + newH - canvasH) < snapThreshold) newH = canvasH - newY;
                    }
                    if (this.resizeHandle.includes('n')) {
                        if (Math.abs(newY) < snapThreshold) {
                            newH = newH + newY;
                            newY = 0;
                        }
                    }
                }

                // Snap to 64 increment optionally, but definitely min size limit
                newW = Math.max(64, newW);
                newH = Math.max(64, newH);

                // Enforce max pixel area limit (1024x1024 = 1048576)
                if (newW * newH > this.maxPixels) {
                    const maxAllowedArea = this.maxPixels;
                    if (this.resizeHandle === 'e' || this.resizeHandle === 'w') {
                         newW = maxAllowedArea / newH;
                         if (this.resizeHandle === 'w') newX = this.startSelection.x + (this.startSelection.w - newW);
                    } else if (this.resizeHandle === 'n' || this.resizeHandle === 's') {
                         newH = maxAllowedArea / newW;
                         if (this.resizeHandle === 'n') newY = this.startSelection.y + (this.startSelection.h - newH);
                    } else {
                         const ratio = Math.sqrt(maxAllowedArea / (newW * newH));
                         const adjustW = newW - (newW * ratio);
                         const adjustH = newH - (newH * ratio);
                         newW *= ratio;
                         newH *= ratio;
                         if (this.resizeHandle.includes('w')) newX += adjustW;
                         if (this.resizeHandle.includes('n')) newY += adjustH;
                    }
                }

                this.selection.w = newW;
                this.selection.h = newH;
                this.selection.x = newX;
                this.selection.y = newY;
                
                this._updateSelectionDOM();
            }
        };

        const handleUp = (e) => {
            stopToolbarDrag(e);
            
            if (this.isPainting) {
                this.isPainting = false;
                this.lastPos = null;
            }
            if (this.isPanning) {
                this.isPanning = false;
                this.els.area.style.cursor = 'default';
            }
            if (this.isDraggingSelection) {
                this.isDraggingSelection = false;
                // Snap position to integers
                this.selection.x = Math.round(this.selection.x);
                this.selection.y = Math.round(this.selection.y);
                this._updateSelectionDOM();
            }
            if (this.isResizing) {
                const isAtRight = this.isSnapEnabled && Math.abs(this.selection.x + this.selection.w - this.els.canvas.width) < 1;
                const isAtBottom = this.isSnapEnabled && Math.abs(this.selection.y + this.selection.h - this.els.canvas.height) < 1;
                const isAtLeft = this.isSnapEnabled && Math.abs(this.selection.x) < 1;
                const isAtTop = this.isSnapEnabled && Math.abs(this.selection.y) < 1;

                this.isResizing = false;
                this.resizeHandle = null;
                // Snap dimensions to 64px multiples on release for optimal NovelAI generation
                this.selection.w = Math.round(this.selection.w / 64) * 64;
                this.selection.h = Math.round(this.selection.h / 64) * 64;
                // Double check max pixels
                if (this.selection.w * this.selection.h > this.maxPixels) {
                    if (this.selection.w > this.selection.h) {
                        this.selection.w -= 64;
                    } else {
                        this.selection.h -= 64;
                    }
                }

                // If we were snapped to an edge, adjust position after dimension rounding
                if (isAtRight) this.selection.x = this.els.canvas.width - this.selection.w;
                if (isAtBottom) this.selection.y = this.els.canvas.height - this.selection.h;
                if (isAtLeft) this.selection.x = 0;
                if (isAtTop) this.selection.y = 0;

                this._updateSelectionDOM();
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchend', handleUp);
    }
}
