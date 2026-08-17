export class OutpaintEditor {
    constructor(dependencies) {
        this.engine = dependencies.engine;
        this.store = dependencies.store;
        this.getExtraParams = dependencies.getExtraParams;

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
            toolbar: document.getElementById('outpaintToolbar'),
            toolbarInner: document.getElementById('outpaintToolbarInner'),
            toolbarToggleBtn: document.getElementById('outpaintToolbarToggleBtn'),
            snapToggleBtn: document.getElementById('outpaintSnapToggle'),
            dimPath: document.getElementById('outpaintDimPath'),
            dimOverlay: document.getElementById('outpaintDimOverlay')
        };

        this.ctx = this.els.canvas ? this.els.canvas.getContext('2d') : null;
        this.maskCtx = this.els.maskCanvas ? this.els.maskCanvas.getContext('2d') : null;

        // Transform state
        this.transform = { x: 0, y: 0, scale: 1 };
        
        // Selection state
        this.selection = { x: 0, y: 0, w: 512, h: 512 };
        
        // Mode state
        this.mode = 'move'; // 'move' or 'paint'
        this.tool = 'brush'; // 'brush' or 'eraser'
        this.isPainting = false;
        this.lastPos = null;

        // Toolbar state
        this.isToolbarCollapsed = false;

        // History state
        this.history = [];
        this.maskHistory = [];
        this.maxHistory = 10;
        this.maxMaskHistory = 10;
        
        // Interaction state
        this.isPanning = false;
        this.isDraggingSelection = false;
        this.isResizing = false;
        this.isDraggingToolbar = false;
        this.resizeHandle = null;
        this.lastMouse = { x: 0, y: 0 };
        this.startTransform = null;
        this.startSelection = null;
        this.isSnapEnabled = false;

        // rAF Render Scheduler
        this._renderPending = false;
        this._rafId = null;

        this._bindEvents();
    }

    get maxPixels() {
        const bypass = this.store && this.store.getSetting ? this.store.getSetting('nai_bypass_limits') === 'true' : false;
        return bypass ? 1024 * 1024 * 1.5 : 1024 * 1024; // 解锁限制后放宽至 1.5M 像素，否则限制在 1M 像素
    }

    toggleToolbar(forceState) {
        if (typeof forceState === 'boolean') {
            this.isToolbarCollapsed = !forceState;
        } else {
            this.isToolbarCollapsed = !this.isToolbarCollapsed;
        }

        const inner = this.els.toolbarInner || document.getElementById('outpaintToolbarInner');
        const btn = this.els.toolbarToggleBtn || document.getElementById('outpaintToolbarToggleBtn');

        if (inner) {
            if (this.isToolbarCollapsed) {
                inner.classList.add('collapsed');
            } else {
                inner.classList.remove('collapsed');
            }
        }

        if (btn) {
            if (this.isToolbarCollapsed) {
                btn.classList.add('collapsed');
            } else {
                btn.classList.remove('collapsed');
            }
        }

        if (!this.isToolbarCollapsed) {
            this.clampToolbarPosition();
        }
    }

    clampToolbarPosition() {
        const toolbar = this.els.toolbar || document.getElementById('outpaintToolbar');
        const area = this.els.area || document.getElementById('outpaintArea');
        if (!toolbar || !area) return;

        const parentRect = area.getBoundingClientRect ? area.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
        const rect = toolbar.getBoundingClientRect ? toolbar.getBoundingClientRect() : { width: 60, height: 400 };

        if (!parentRect.width || !parentRect.height) return;

        const hasLeft = toolbar.style.left && toolbar.style.left !== 'auto';
        const hasTop = toolbar.style.top && toolbar.style.top !== 'auto';

        if (hasLeft || hasTop) {
            let left = parseFloat(toolbar.style.left) || 0;
            let top = parseFloat(toolbar.style.top) || 0;

            const maxLeft = Math.max(0, parentRect.width - (rect.width || 60));
            const maxTop = Math.max(0, parentRect.height - (rect.height || 60));

            left = Math.max(0, Math.min(left, maxLeft));
            top = Math.max(0, Math.min(top, maxTop));

            toolbar.style.right = 'auto';
            toolbar.style.bottom = 'auto';
            toolbar.style.transform = 'none';
            toolbar.style.left = `${Math.round(left)}px`;
            toolbar.style.top = `${Math.round(top)}px`;
        }
    }

    toggleSnap(forceState) {
        if (typeof forceState === 'boolean') {
            this.isSnapEnabled = forceState;
        } else {
            this.isSnapEnabled = !this.isSnapEnabled;
        }
        const btn = this.els.snapToggleBtn || document.getElementById('outpaintSnapToggle');
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
            if (this.els.selection) {
                this.els.selection.classList.remove('cursor-crosshair');
                this.els.selection.classList.add('cursor-move');
            }
            if (this.els.maskCanvas) {
                this.els.maskCanvas.classList.add('pointer-events-none');
            }
            if (this.els.brushControl) {
                this.els.brushControl.classList.remove('flex');
                this.els.brushControl.classList.add('hidden');
            }
            if (this.els.modeMoveBtn) {
                this.els.modeMoveBtn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                this.els.modeMoveBtn.classList.remove('text-gray-500');
            }
            if (this.els.modePaintBtn) {
                this.els.modePaintBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                this.els.modePaintBtn.classList.add('text-gray-500');
            }
        } else {
            if (this.els.selection) {
                this.els.selection.classList.remove('cursor-move');
                this.els.selection.classList.add('cursor-crosshair');
            }
            if (this.els.maskCanvas) {
                this.els.maskCanvas.classList.remove('pointer-events-none');
            }
            if (this.els.brushControl) {
                this.els.brushControl.classList.remove('hidden');
                this.els.brushControl.classList.add('flex');
            }
            if (this.els.modePaintBtn) {
                this.els.modePaintBtn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                this.els.modePaintBtn.classList.remove('text-gray-500');
            }
            if (this.els.modeMoveBtn) {
                this.els.modeMoveBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                this.els.modeMoveBtn.classList.add('text-gray-500');
            }
        }
    }

    setTool(tool) {
        this.tool = tool; // 'brush' or 'eraser'
    }

    _getBrushSize() {
        return parseInt(this.els.brushSizeInput?.value || 60);
    }

    _drawOnMask(pos, isStart = false) {
        if (!this.maskCtx || !pos) return;
        const r = this._getBrushSize();
        const tool = this.tool || 'brush';
        this.maskCtx.save();

        if (tool === 'eraser') {
            this.maskCtx.globalCompositeOperation = 'destination-out';
            this.maskCtx.fillStyle = 'rgba(0,0,0,1)';
            this.maskCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            this.maskCtx.globalCompositeOperation = 'source-over';
            this.maskCtx.fillStyle = '#FFFFFF';
            this.maskCtx.strokeStyle = '#FFFFFF';
        }

        if (isStart || !this.lastPos) {
            this.maskCtx.beginPath();
            this.maskCtx.arc(Math.round(pos.x), Math.round(pos.y), r / 2, 0, Math.PI * 2);
            this.maskCtx.fill();
        } else {
            this.maskCtx.lineCap = 'round';
            this.maskCtx.lineJoin = 'round';
            this.maskCtx.lineWidth = r;
            this.maskCtx.beginPath();
            this.maskCtx.moveTo(this.lastPos.x, this.lastPos.y);
            this.maskCtx.lineTo(pos.x, pos.y);
            this.maskCtx.stroke();
        }
        this.maskCtx.restore();
        this.lastPos = pos;
    }

    _getMaskPos(e) {
        if (!this.els.maskCanvas) return { x: 0, y: 0 };
        const rect = this.els.maskCanvas.getBoundingClientRect ? this.els.maskCanvas.getBoundingClientRect() : { left: 0, top: 0, width: 512, height: 512 };
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const width = rect.width || this.els.maskCanvas.width || 512;
        const height = rect.height || this.els.maskCanvas.height || 512;
        const scaleX = this.els.maskCanvas.width / width;
        const scaleY = this.els.maskCanvas.height / height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    open() {
        this.history = [];
        this.maskHistory = [];
        this.setMode('move');
        this.toggleToolbar(true); // Ensure toolbar is visible / expanded
        this.toggleSnap(false); // Reset snap state
        
        if (this.els.brushSizeInput) this.els.brushSizeInput.value = 60;
        if (this.els.brushSizeVal) this.els.brushSizeVal.textContent = 60;
        if (this.els.maskCanvas && this.maskCtx) {
            this.maskCtx.clearRect(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height);
        }

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
            this.clampToolbarPosition();

            if (this.els.area) this.els.area.classList.remove('hidden');
            if (window.safeCreateIcons) window.safeCreateIcons();
        };
        img.src = this.els.sourceImg.src;
    }

    close() {
        this.history = [];
        this.maskHistory = [];
        this.isPainting = false;
        this.isPanning = false;
        this.isDraggingSelection = false;
        this.isResizing = false;
        this.isDraggingToolbar = false;
        if (this._rafId) {
            const cancelRAF = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : (typeof window !== 'undefined' && window.cancelAnimationFrame ? window.cancelAnimationFrame : clearTimeout);
            cancelRAF(this._rafId);
            this._renderPending = false;
        }
        if (this.els.area) {
            this.els.area.classList.add('hidden');
        }
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

    saveMaskState() {
        if (!this.els.maskCanvas || !this.maskCtx) return;
        const w = this.els.maskCanvas.width;
        const h = this.els.maskCanvas.height;
        if (!w || !h) return;
        const imgData = this.maskCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const alpha = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            alpha[j] = data[i + 3];
        }
        this.maskHistory.push({ width: w, height: h, alpha });
        if (this.maskHistory.length > this.maxMaskHistory) this.maskHistory.shift();
    }

    _restoreMaskState(state) {
        if (!state || !this.maskCtx) return;
        if (typeof ImageData !== 'undefined' && state instanceof ImageData) {
            this.maskCtx.putImageData(state, 0, 0);
            return;
        }
        if (state.data && typeof state.width === 'number') {
            this.maskCtx.putImageData(state, 0, 0);
            return;
        }
        if (state.alpha) {
            const w = state.width || this.els.maskCanvas.width;
            const h = state.height || this.els.maskCanvas.height;
            if (this.els.maskCanvas.width !== w || this.els.maskCanvas.height !== h) {
                this.els.maskCanvas.width = w;
                this.els.maskCanvas.height = h;
            }
            let imgData;
            if (this.maskCtx.createImageData) {
                imgData = this.maskCtx.createImageData(w, h);
            } else if (typeof ImageData !== 'undefined') {
                imgData = new ImageData(w, h);
            } else {
                imgData = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
            }
            const data = imgData.data;
            const alpha = state.alpha;
            for (let j = 0, i = 0; j < alpha.length; j++, i += 4) {
                const a = alpha[j];
                if (a > 0) {
                    data[i] = 255;
                    data[i + 1] = 255;
                    data[i + 2] = 255;
                    data[i + 3] = a;
                }
            }
            this.maskCtx.putImageData(imgData, 0, 0);
        }
    }

    undo() {
        if (this.mode === 'paint' && this.maskHistory.length > 0) {
            const state = this.maskHistory.pop();
            this._restoreMaskState(state);
            return;
        }

        if (this.history.length === 0) {
            if (this.maskHistory.length > 0) {
                const state = this.maskHistory.pop();
                this._restoreMaskState(state);
                return;
            }
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
        const finalBase64 = this.els.canvas.toDataURL('image/png');
        if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
        window.lastSelectedImageUrl = finalBase64;
    }

    _hasPaintedMask() {
        if (!this.els.maskCanvas || !this.maskCtx) return false;
        const data = this.maskCtx.getImageData(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 200 && data[i + 3] > 128) return true;
        }
        return false;
    }

    clearMask() {
        if (this.maskHistory.length > 0 || this._hasPaintedMask()) {
            this.saveMaskState();
        }
        if (this.els.maskCanvas && this.maskCtx) {
            this.maskCtx.clearRect(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height);
        }
    }

    async saveToHistory() {
        const finalBase64 = this.els.canvas.toDataURL('image/png');
        const modelVersionEl = document.getElementById('modelValue');
        const modelVersion = modelVersionEl ? modelVersionEl.value : 'v3';
        const prompt = document.getElementById('prompt')?.value || '';
        
        await this.store.saveImage(finalBase64, prompt, modelVersion);
        console.log("Image saved to history");
        if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
        window.lastSelectedImageUrl = finalBase64;
        if (window.switchGalleryTab) window.switchGalleryTab('history');
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
            const targetW = Math.max(64, Math.round(w / 64) * 64);
            const targetH = Math.max(64, Math.round(h / 64) * 64);
            const roundX = Math.round(x);
            const roundY = Math.round(y);

            // Crop image 1:1
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = targetW;
            cropCanvas.height = targetH;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(this.els.canvas, -roundX, -roundY);

            // Check if there is a painted mask
            const hasPaintedMask = this._hasPaintedMask();

            let finalMaskCanvas;
            let action = 'infill';
            let isPureGeneration = false;

            if (hasPaintedMask) {
                // INPAINT MODE: Use the painted mask (1:1 aligned)
                finalMaskCanvas = document.createElement('canvas');
                finalMaskCanvas.width = targetW;
                finalMaskCanvas.height = targetH;
                const fmcCtx = finalMaskCanvas.getContext('2d');
                fmcCtx.fillStyle = '#000000';
                fmcCtx.fillRect(0, 0, targetW, targetH);
                fmcCtx.drawImage(this.els.maskCanvas, 0, 0, Math.min(this.els.maskCanvas.width, targetW), Math.min(this.els.maskCanvas.height, targetH));
                action = 'infill';
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

                let hasOpaquePixels = false;
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const alpha = imgData.data[i + 3];
                    if (alpha > 128) {
                        hasOpaquePixels = true;
                        maskData.data[i] = 0;
                        maskData.data[i + 1] = 0;
                        maskData.data[i + 2] = 0;
                    }
                }
                maskCtx.putImageData(maskData, 0, 0);

                if (!hasOpaquePixels) {
                    isPureGeneration = true;
                }

                // DILATE MASK
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

            // SMEAR IMAGE EDGES: 精准的边缘像素 Clamp-to-Edge 拉伸
            cropCtx.globalCompositeOperation = 'destination-over';
            const left = Math.max(0, -roundX);
            const right = Math.min(targetW, -roundX + this.els.canvas.width);
            const top = Math.max(0, -roundY);
            const bottom = Math.min(targetH, -roundY + this.els.canvas.height);

            if (right > left && bottom > top) {
                if (top > 0) {
                    cropCtx.drawImage(cropCanvas, left, top, right - left, 1, left, 0, right - left, top);
                }
                if (bottom < targetH) {
                    cropCtx.drawImage(cropCanvas, left, bottom - 1, right - left, 1, left, bottom, right - left, targetH - bottom);
                }
                if (left > 0) {
                    cropCtx.drawImage(cropCanvas, left, 0, 1, targetH, 0, 0, left, targetH);
                }
                if (right < targetW) {
                    cropCtx.drawImage(cropCanvas, right - 1, 0, 1, targetH, right, 0, targetW - right, targetH);
                }
            }
            
            // Fill remaining transparent space with neutral gray (128,128,128)
            cropCtx.fillStyle = '#808080';
            cropCtx.fillRect(0, 0, targetW, targetH);

            // Check model version
            const modelVersionEl = document.getElementById('modelValue');
            const modelVersion = (modelVersionEl && modelVersionEl.value) ? modelVersionEl.value : 'v4.5';
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
            const strength = hasPaintedMask ? 0.7 : 1.0;

            // Handling Multi-API Keys gracefully
            const adminToken = this.store.getSetting('nai_admin_token');
            const userKey = this.store.getSetting('nai_user_key');
            const customApiKeyRaw = this.store.getSetting('nai_custom_api_key', '');
            const customKeys = customApiKeyRaw.split(/[\n,]/).map(k => k.trim()).filter(k => k);
            
            const authBase = { adminToken, userKey, userToken: (typeof localStorage !== 'undefined' ? localStorage.getItem('nai_user_token') : null) || "" };
            const authsToTry = customKeys.length > 0 
                ? customKeys.map(key => ({ ...authBase, customApiKey: key }))
                : [{ ...authBase, customApiKey: "" }];

            const extraParams = this.getExtraParams ? this.getExtraParams(modelVersion, customKeys.length > 0) : {};

            const params = {
                version: modelVersion,
                prompt,
                negative_prompt,
                width: targetW,
                height: targetH,
                steps,
                scale,
                sampler,
                add_original_image: true,
                ...extraParams
            };

            if (isPureGeneration) {
                params.action = 'generate';
            } else {
                params.image = imageBase64;
                params.mask = finalMaskBase64;
                params.strength = strength;
                params.action = action;
            }

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
            newImg.crossOrigin = 'anonymous';
            newImg.onload = () => {
                this.saveState();
                
                if (hasPaintedMask) {
                    this.maskCtx.clearRect(0, 0, this.els.maskCanvas.width, this.els.maskCanvas.height);
                    this.maskHistory = [];
                }

                const newCanvasW = Math.max(this.els.canvas.width, roundX + targetW);
                const newCanvasH = Math.max(this.els.canvas.height, roundY + targetH);
                const newCanvasX = Math.min(0, roundX);
                const newCanvasY = Math.min(0, roundY);

                const finalW = newCanvasW - newCanvasX;
                const finalH = newCanvasH - newCanvasY;

                const combinedCanvas = document.createElement('canvas');
                combinedCanvas.width = finalW;
                combinedCanvas.height = finalH;
                const combinedCtx = combinedCanvas.getContext('2d');

                combinedCtx.drawImage(this.els.canvas, -newCanvasX, -newCanvasY);
                combinedCtx.drawImage(newImg, roundX - newCanvasX, roundY - newCanvasY, targetW, targetH);

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

                const finalBase64 = this.els.canvas.toDataURL('image/png');
                console.log(hasPaintedMask ? "Inpaint generated" : "Outpaint generated");
                if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
                window.lastSelectedImageUrl = finalBase64;
            };
            newImg.src = result.imageUrl || (result.blob ? URL.createObjectURL(result.blob) : 'data:image/png;base64,mock');

            if (result.userRole && document.getElementById('creditDisplayDesktop')) {
                const text = result.userRole.replace(" (Limited)", "").replace(" (Unlimited)", "");
                document.getElementById('creditDisplayDesktop').textContent = text;
                const mob = document.getElementById('creditDisplayMobile');
                if (mob) mob.textContent = text;
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
        const areaRect = this.els.area ? this.els.area.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
        const contentW = this.els.canvas ? this.els.canvas.width : 512;
        const contentH = this.els.canvas ? this.els.canvas.height : 512;

        const padding = 100;
        const availableW = Math.max(10, (areaRect.width || 800) - padding);
        const availableH = Math.max(10, (areaRect.height || 600) - padding);
        const scaleX = availableW / contentW;
        const scaleY = availableH / contentH;
        this.transform.scale = Math.min(scaleX, scaleY, 1);
        if (isNaN(this.transform.scale) || this.transform.scale <= 0) this.transform.scale = 1;

        this.transform.x = ((areaRect.width || 800) - contentW * this.transform.scale) / 2;
        this.transform.y = ((areaRect.height || 600) - contentH * this.transform.scale) / 2;

        this._applyTransform();
        this._scheduleRender();
    }

    zoomIn() {
        this._zoom(1.2);
    }

    zoomOut() {
        this._zoom(1 / 1.2);
    }

    _zoom(factor, clientX = null, clientY = null) {
        const areaRect = this.els.area ? this.els.area.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
        
        let originX, originY;
        if (clientX !== null && clientY !== null) {
            originX = clientX - areaRect.left;
            originY = clientY - areaRect.top;
        } else {
            originX = (areaRect.width || 800) / 2;
            originY = (areaRect.height || 600) / 2;
        }

        const currentScale = this.transform.scale || 1;
        const newScale = Math.max(0.05, Math.min(currentScale * factor, 10));
        const ratio = newScale / currentScale;

        this.transform.x = originX - (originX - this.transform.x) * ratio;
        this.transform.y = originY - (originY - this.transform.y) * ratio;
        this.transform.scale = newScale;

        this._applyTransform();
        this._scheduleRender();
    }

    _scheduleRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        const rAF = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : (cb) => setTimeout(cb, 0));
        this._rafId = rAF(() => {
            this._renderPending = false;
            this._renderTransforms();
        });
    }

    _renderTransforms() {
        this._applyTransform();
        this._updateSelectionDOM();
        this._updateDimOverlay();
    }

    _applyTransform() {
        if (this.els.container) {
            const tx = Math.round(this.transform.x * 100) / 100;
            const ty = Math.round(this.transform.y * 100) / 100;
            const scale = Math.round(this.transform.scale * 10000) / 10000;
            this.els.container.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
        }
    }

    _updateDimOverlay() {
        const path = this.els.dimPath || document.getElementById('outpaintDimPath');
        const area = this.els.area || document.getElementById('outpaintArea');
        if (!path || !area) return;

        const areaRect = area.getBoundingClientRect ? area.getBoundingClientRect() : { width: 1920, height: 1080 };
        const vw = Math.max(1, Math.round(areaRect.width || (typeof window !== 'undefined' ? window.innerWidth : 1920) || 1920));
        const vh = Math.max(1, Math.round(areaRect.height || (typeof window !== 'undefined' ? window.innerHeight : 1080) || 1080));

        const scale = this.transform.scale || 1;
        const x = Math.round((this.transform.x + this.selection.x * scale) * 100) / 100;
        const y = Math.round((this.transform.y + this.selection.y * scale) * 100) / 100;
        const w = Math.round((this.selection.w * scale) * 100) / 100;
        const h = Math.round((this.selection.h * scale) * 100) / 100;

        // Outer full viewport rectangle + Inner selection cutout window (evenodd creates a transparent hole)
        if (path.setAttribute) {
            path.setAttribute('d', `M 0 0 H ${vw} V ${vh} H 0 Z M ${x} ${y} V ${y + h} H ${x + w} V ${y} Z`);
        }
    }

    _updateSelectionDOM() {
        const w = Math.round(this.selection.w);
        const h = Math.round(this.selection.h);
        const x = Math.round(this.selection.x);
        const y = Math.round(this.selection.y);
        
        if (this.els.maskCanvas && (this.els.maskCanvas.width !== w || this.els.maskCanvas.height !== h)) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.els.maskCanvas.width || 512;
            tempCanvas.height = this.els.maskCanvas.height || 512;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.els.maskCanvas, 0, 0);
            
            this.els.maskCanvas.width = w;
            this.els.maskCanvas.height = h;
            
            this.maskCtx.imageSmoothingEnabled = false;
            this.maskCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, w, h);
        }

        if (this.els.selection) {
            this.els.selection.style.width = `${w}px`;
            this.els.selection.style.height = `${h}px`;
            this.els.selection.style.transform = `translate(${x}px, ${y}px)`;
        }
        
        if (this.els.sizeLabel) {
            this.els.sizeLabel.textContent = `${w} x ${h}`;
            if (this.selection.w * this.selection.h > this.maxPixels) {
                this.els.sizeLabel.classList.add('text-red-400');
            } else {
                this.els.sizeLabel.classList.remove('text-red-400');
            }
        }
    }

    _bindEvents() {
        // --- Toolbar Dragging ---
        let dragTimer = null;
        let isDraggingToolbar = false;
        let tbStartX = 0, tbStartY = 0;
        let tbInitialLeft = 0, tbInitialTop = 0;

        const startToolbarDrag = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || (e.target.closest && e.target.closest('button'))) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            tbStartX = clientX;
            tbStartY = clientY;

            dragTimer = setTimeout(() => {
                isDraggingToolbar = true;
                this.isDraggingToolbar = true;
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
            }, 300); // 300ms long press to drag
        };

        const stopToolbarDrag = (e) => {
            if (dragTimer) clearTimeout(dragTimer);
            if (isDraggingToolbar || this.isDraggingToolbar) {
                isDraggingToolbar = false;
                this.isDraggingToolbar = false;
                if (this.els.toolbar) {
                    this.els.toolbar.style.transition = '';
                    this.els.toolbar.style.cursor = 'move';
                }
                if (e && e.preventDefault && e.cancelable) e.preventDefault();
            }
        };

        if (this.els.toolbar) {
            this.els.toolbar.addEventListener('mousedown', startToolbarDrag);
            this.els.toolbar.addEventListener('touchstart', startToolbarDrag, { passive: true });
            this.els.toolbar.style.cursor = 'move';
        }

        // --- Panning & Zooming (Area) ---
        if (this.els.area) {
            this.els.area.addEventListener('wheel', (e) => {
                e.preventDefault();
                if (e.ctrlKey) {
                    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                    this._zoom(factor, e.clientX, e.clientY);
                } else {
                    this.transform.x -= e.deltaX;
                    this.transform.y -= e.deltaY;
                    this._applyTransform();
                    this._scheduleRender();
                }
            }, { passive: false });
        }

        this.els.brushSizeInput?.addEventListener('input', e => {
            if (this.els.brushSizeVal) this.els.brushSizeVal.textContent = e.target.value;
        });

        const handlePanStart = (e) => {
            if (this.mode === 'paint' && (e.target === this.els.maskCanvas || e.target === this.els.selection)) {
                this.isPainting = true;
                this.saveMaskState();
                this._drawOnMask(this._getMaskPos(e), true);
                return;
            }

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            if (e.target === this.els.area || e.target === this.els.canvas) {
                this.isPanning = true;
                this.lastMouse = { x: clientX, y: clientY };
                this.startTransform = { ...this.transform };
                if (this.els.area) this.els.area.style.cursor = 'grabbing';
            }
        };

        if (this.els.area) {
            this.els.area.addEventListener('mousedown', handlePanStart);
            this.els.area.addEventListener('touchstart', handlePanStart, { passive: false });
        }

        // --- Selection Interaction ---
        const handleSelectionStart = (e) => {
            if (this.mode === 'paint') return;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            if (e.target && e.target.classList && e.target.classList.contains('resize-handle')) {
                this.isResizing = true;
                this.resizeHandle = e.target.dataset ? e.target.dataset.handle : 'se';
            } else {
                this.isDraggingSelection = true;
            }
            
            this.lastMouse = { x: clientX, y: clientY };
            this.startSelection = { ...this.selection };
            if (e.stopPropagation) e.stopPropagation();
            if (e.touches && e.preventDefault && e.cancelable) e.preventDefault();
        };

        if (this.els.selection) {
            this.els.selection.addEventListener('mousedown', handleSelectionStart);
            this.els.selection.addEventListener('touchstart', handleSelectionStart, { passive: false });
        }

        // --- Global Move & Up/End ---
        const handleMove = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // Handle Toolbar dragging first
            if (isDraggingToolbar || this.isDraggingToolbar) {
                if(e.touches && e.cancelable) e.preventDefault();
                const dx = clientX - tbStartX;
                const dy = clientY - tbStartY;
                
                const rect = this.els.toolbar.getBoundingClientRect();
                const parentRect = this.els.area.getBoundingClientRect();
                
                let newLeft = tbInitialLeft + dx;
                let newTop = tbInitialTop + dy;
                
                const maxLeft = Math.max(0, parentRect.width - rect.width);
                const maxTop = Math.max(0, parentRect.height - rect.height);

                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));

                this.els.toolbar.style.left = `${Math.round(newLeft)}px`;
                this.els.toolbar.style.top = `${Math.round(newTop)}px`;
                return;
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
                if (e.touches && e.cancelable) e.preventDefault();
                const dx = clientX - this.lastMouse.x;
                const dy = clientY - this.lastMouse.y;
                this.transform.x = this.startTransform.x + dx;
                this.transform.y = this.startTransform.y + dy;
                this._applyTransform();
                this._scheduleRender();
            } else if (this.isDraggingSelection) {
                if (e.touches && e.cancelable) e.preventDefault();
                const dx = (clientX - this.lastMouse.x) / this.transform.scale;
                const dy = (clientY - this.lastMouse.y) / this.transform.scale;
                
                let newX = this.startSelection.x + dx;
                let newY = this.startSelection.y + dy;

                if (this.isSnapEnabled) {
                    const snapThreshold = 12 / this.transform.scale;
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
                this._scheduleRender();
            } else if (this.isResizing) {
                if (e.touches && e.cancelable) e.preventDefault();
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
                    const snapThreshold = 12 / this.transform.scale;
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

                newW = Math.max(64, newW);
                newH = Math.max(64, newH);

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
                this._scheduleRender();
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
                if (this.els.area) this.els.area.style.cursor = 'default';
            }
            if (this.isDraggingSelection) {
                this.isDraggingSelection = false;
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
                this.selection.w = Math.max(64, Math.round(this.selection.w / 64) * 64);
                this.selection.h = Math.max(64, Math.round(this.selection.h / 64) * 64);
                
                if (this.selection.w * this.selection.h > this.maxPixels) {
                    if (this.selection.w > this.selection.h) {
                        this.selection.w -= 64;
                    } else {
                        this.selection.h -= 64;
                    }
                }

                if (isAtRight) this.selection.x = this.els.canvas.width - this.selection.w;
                if (isAtBottom) this.selection.y = this.els.canvas.height - this.selection.h;
                if (isAtLeft) this.selection.x = 0;
                if (isAtTop) this.selection.y = 0;

                this.selection.x = Math.round(this.selection.x);
                this.selection.y = Math.round(this.selection.y);

                this._updateSelectionDOM();
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchend', handleUp);
        window.addEventListener('resize', () => {
            this.clampToolbarPosition();
        });
    }
}
