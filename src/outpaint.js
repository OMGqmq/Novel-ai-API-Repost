export class OutpaintEditor {
    constructor(dependencies) {
        this.engine = dependencies.engine;
        this.store = dependencies.store;

        this.els = {
            area: document.getElementById('outpaintArea'),
            container: document.getElementById('outpaintContainer'),
            canvas: document.getElementById('outpaintCanvas'),
            selection: document.getElementById('outpaintSelection'),
            sizeLabel: document.getElementById('outpaintSizeLabel'),
            sourceImg: document.getElementById('singleResultImg')
        };

        this.ctx = this.els.canvas.getContext('2d');

        // Transform state
        this.transform = { x: 0, y: 0, scale: 1 };
        
        // Selection state
        this.selection = { x: 0, y: 0, w: 512, h: 512 };
        this.maxPixels = 1024 * 1024; // 1048576
        
        // Interaction state
        this.isPanning = false;
        this.isDraggingSelection = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.lastMouse = { x: 0, y: 0 };
        this.startTransform = null;
        this.startSelection = null;

        this._bindEvents();
    }

    open() {
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

    async generate() {
        const btn = document.getElementById('outpaintGenerateBtn');
        if (!btn) return;
        
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="loader w-3 h-3 border-white/50 border-t-transparent rounded-full animate-spin"></span>';

        try {
            const { w, h, x, y } = this.selection;
            const targetW = Math.round(w / 64) * 64;
            const targetH = Math.round(h / 64) * 64;

            // Crop image
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = targetW;
            cropCanvas.height = targetH;
            const cropCtx = cropCanvas.getContext('2d');
            
            // Draw background (transparent)
            cropCtx.drawImage(this.els.canvas, -x, -y);

            // Generate mask based on alpha channel
            const imgData = cropCtx.getImageData(0, 0, targetW, targetH);
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = targetW;
            maskCanvas.height = targetH;
            const maskCtx = maskCanvas.getContext('2d');
            const maskData = maskCtx.createImageData(targetW, targetH);

            for (let i = 0; i < imgData.data.length; i += 4) {
                const alpha = imgData.data[i + 3];
                const isMasked = alpha < 128; // If transparent, we mask it
                const color = isMasked ? 255 : 0; // White for masked (generate), Black for unmasked (keep)
                
                maskData.data[i] = color;
                maskData.data[i + 1] = color;
                maskData.data[i + 2] = color;
                maskData.data[i + 3] = 255;
            }
            maskCtx.putImageData(maskData, 0, 0);

            // Do not mutate cropCtx image data; leave transparent areas transparent 
            // so NovelAI can use the alpha channel for proper edge-padding.
            
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
            tempCtx.drawImage(maskCanvas, 0, 0, latentW, latentH);

            if (isV4) {
                const finalMaskCanvas = document.createElement('canvas');
                finalMaskCanvas.width = latentW * 8;
                finalMaskCanvas.height = latentH * 8;
                const finalCtx = finalMaskCanvas.getContext('2d');
                finalCtx.imageSmoothingEnabled = false;
                finalCtx.drawImage(tempMaskCanvas, 0, 0, finalMaskCanvas.width, finalMaskCanvas.height);
                finalMaskBase64 = finalMaskCanvas.toDataURL('image/png').split(',')[1];
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
                strength: 1.0,
                action: 'infill',
                add_original_image: true
            };

            // Handling Multi-API Keys gracefully (Fallback strategy)
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
                    break; // Success, exit fallback loop
                } catch (err) {
                    console.warn('API Key failed, trying next (if available)...', err);
                    lastError = err;
                }
            }

            if (!result) {
                throw new Error(lastError?.message || '所有配置的 API Key 均请求失败');
            }

            // Stitch the resulting image back
            const newImg = new Image();
            newImg.onload = () => {
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

                // Save as JPEG to reduce IndexedDB bloat (Canvas PNGs get massive)
                const finalBase64 = this.els.canvas.toDataURL('image/jpeg', 0.95);
                this.store.saveImage(finalBase64, prompt, modelVersion).then(() => {
                    alert("扩图成功并已保存到历史记录");
                    if (this.els.sourceImg) this.els.sourceImg.src = finalBase64;
                    if (window.switchGalleryTab) window.switchGalleryTab('history');
                });
            };
            newImg.src = result.imageUrl;

            if (result.userRole && document.getElementById('creditDisplayDesktop')) {
                const text = result.userRole.replace(" (Limited)", "").replace(" (Unlimited)", "");
                document.getElementById('creditDisplayDesktop').textContent = text;
                document.getElementById('creditDisplayDesktop').classList.remove('hidden');
                document.getElementById('creditDisplayMobile').textContent = text;
                document.getElementById('creditDisplayMobile').classList.remove('hidden');
            }

        } catch (err) {
            console.error(err);
            alert('扩图失败: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
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

        const newScale = Math.max(0.1, Math.min(this.transform.scale * factor, 5));
        const ratio = newScale / this.transform.scale;

        this.transform.x = originX - (originX - this.transform.x) * ratio;
        this.transform.y = originY - (originY - this.transform.y) * ratio;
        this.transform.scale = newScale;

        this._applyTransform();
    }

    _applyTransform() {
        this.els.container.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
    }

    _updateSelectionDOM() {
        this.els.selection.style.width = `${this.selection.w}px`;
        this.els.selection.style.height = `${this.selection.h}px`;
        this.els.selection.style.transform = `translate(${this.selection.x}px, ${this.selection.y}px)`;
        
        // Ensure snap to 64 for display label
        this.els.sizeLabel.textContent = `${Math.round(this.selection.w)} x ${Math.round(this.selection.h)}`;
        
        if (this.selection.w * this.selection.h > this.maxPixels) {
            this.els.sizeLabel.classList.add('text-red-400');
        } else {
            this.els.sizeLabel.classList.remove('text-red-400');
        }
    }

    _bindEvents() {
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

        const handlePanStart = (e) => {
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
                
                this.selection.x = this.startSelection.x + dx;
                this.selection.y = this.startSelection.y + dy;
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

        const handleUp = () => {
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
                this._updateSelectionDOM();
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchend', handleUp);
    }
}
