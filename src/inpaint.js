/**
 * Inpaint Editor Module
 * Handles canvas drawing, mask generation, and inpainting API interaction.
 */
export class InpaintEditor {
    constructor(dependencies) {
        this.ui = dependencies.ui;
        this.engine = dependencies.engine;
        this.store = dependencies.store;
        this.onComplete = dependencies.onComplete;
        this.getExtraParams = dependencies.getExtraParams;

        this.modal = document.getElementById('inpaintModal');
        this.baseCanvas = document.getElementById('inpaintBaseCanvas');
        this.maskCanvas = document.getElementById('inpaintMaskCanvas');
        this.baseCtx = this.baseCanvas.getContext('2d');
        this.maskCtx = this.maskCanvas.getContext('2d');
        this.brushCursor = document.getElementById('brushCursor');
        
        this.tool = 'brush';
        this.drawing = false;
        this.history = [];
        this.originalImgSrc = '';
        this.imgNaturalW = 0;
        this.imgNaturalH = 0;
        this.lastPos = null;
        this._cursorRaf = null;

        this._bindEvents();
    }

    _bindEvents() {
        const syncBrushSize = (val) => {
            const el1 = document.getElementById('inpaintBrushSize');
            const el2 = document.getElementById('inpaintBrushSizeMobile');
            const val1 = document.getElementById('inpaintBrushSizeVal');
            const val2 = document.getElementById('inpaintBrushSizeValMobile');
            if (el1) el1.value = val;
            if (el2) el2.value = val;
            if (val1) val1.textContent = val;
            if (val2) val2.textContent = val;
        };

        document.getElementById('inpaintBrushSize')?.addEventListener('input', e => syncBrushSize(e.target.value));
        document.getElementById('inpaintBrushSizeMobile')?.addEventListener('input', e => syncBrushSize(e.target.value));

        const syncStrength = (val) => {
            const formatted = parseFloat(val).toFixed(2);
            const strDesktop = document.getElementById('inpaintStrength');
            const strMobile = document.getElementById('inpaintStrengthMobile');
            const v1 = document.getElementById('inpaintStrengthVal');
            const v2 = document.getElementById('inpaintStrengthValMobile');
            if (strDesktop && strDesktop.value !== val) strDesktop.value = val;
            if (strMobile && strMobile.value !== val) strMobile.value = val;
            if (v1) v1.textContent = formatted;
            if (v2) v2.textContent = formatted;
        };

        document.getElementById('inpaintStrengthMobile')?.addEventListener('input', e => syncStrength(e.target.value));
        document.getElementById('inpaintStrength')?.addEventListener('input', e => syncStrength(e.target.value));

        const syncPrompt = (val) => {
            const p = document.getElementById('inpaintPrompt');
            const pm = document.getElementById('inpaintPromptMobile');
            if (p && p.value !== val) p.value = val;
            if (pm && pm.value !== val) pm.value = val;
        };
        document.getElementById('inpaintPromptMobile')?.addEventListener('input', e => syncPrompt(e.target.value));
        document.getElementById('inpaintPrompt')?.addEventListener('input', e => syncPrompt(e.target.value));

        document.getElementById('inpaintBlurStrength')?.addEventListener('input', e => {
            const v = document.getElementById('inpaintBlurStrengthVal');
            if (v) v.textContent = e.target.value;
        });
        document.getElementById('inpaintFillTolerance')?.addEventListener('input', e => {
            const v = document.getElementById('inpaintFillToleranceVal');
            if (v) v.textContent = e.target.value;
        });

        // 统一 Pointer Events 保证笔刷绘制无频闪、连续且不丢失事件
        this.maskCanvas.addEventListener('pointerdown', e => {
            e.preventDefault();
            if (this.tool === 'fill') {
                const pos = this._getCanvasPos(e);
                const tolerance = parseInt(document.getElementById('inpaintFillTolerance')?.value || 15);
                this.saveMaskState();
                this._floodFill(pos.x, pos.y, tolerance);
                return;
            }

            try {
                this.maskCanvas.setPointerCapture(e.pointerId);
            } catch (_) {}

            this.drawing = true;
            this.saveMaskState();
            const pos = this._getCanvasPos(e);
            this.lastPos = pos;
            this._drawDotOrStart(pos);
        });

        this.maskCanvas.addEventListener('pointermove', e => {
            this._updateCursor(e);
            if (!this.drawing) return;
            const pos = this._getCanvasPos(e);
            if (this.lastPos) {
                this._drawStroke(this.lastPos, pos);
            } else {
                this._drawDotOrStart(pos);
            }
            this.lastPos = pos;
        });

        const stopDrawing = (e) => {
            if (this.drawing) {
                this.drawing = false;
                this.lastPos = null;
                if (e && e.pointerId) {
                    try {
                        this.maskCanvas.releasePointerCapture(e.pointerId);
                    } catch (_) {}
                }
            }
        };

        this.maskCanvas.addEventListener('pointerup', stopDrawing);
        this.maskCanvas.addEventListener('pointercancel', stopDrawing);

        this.maskCanvas.addEventListener('mouseleave', () => {
            if (!this.drawing) {
                if (this.brushCursor) this.brushCursor.classList.add('hidden');
            }
        });
    }

    _updateCursor(e) {
        if (!this.brushCursor) return;
        const rect = this.maskCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const scaleX = this.maskCanvas.width / rect.width;
        const visualBs = Math.max(4, this.getBrushSize() / scaleX);

        const rAF = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : setTimeout);
        const cancelRAF = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : (typeof window !== 'undefined' && window.cancelAnimationFrame ? window.cancelAnimationFrame : clearTimeout);

        if (this._cursorRaf) cancelRAF(this._cursorRaf);
        this._cursorRaf = rAF(() => {
            this.brushCursor.style.width = `${visualBs}px`;
            this.brushCursor.style.height = `${visualBs}px`;
            this.brushCursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
            this.brushCursor.classList.remove('hidden');
        });
    }

    toggleDrawer() {
        const drawer = document.getElementById('inpaintMobileDrawer');
        const label = document.getElementById('drawerToggleLabel');
        if (drawer) {
            const isExpanded = drawer.classList.toggle('expanded');
            if (label) {
                label.textContent = isExpanded ? '收起 ▼' : '展开 ▲';
            }
        }
    }

    open() {
        const imgEl = document.getElementById('singleResultImg');
        
        if (!imgEl || !imgEl.src) {
            alert('请先生成或选择一张图片');
            return;
        }
        this.originalImgSrc = imgEl.src;

        const mainPrompt = document.getElementById('prompt')?.value || '';
        const inpaintPrompt = document.getElementById('inpaintPrompt');
        const inpaintPromptMobile = document.getElementById('inpaintPromptMobile');
        if (inpaintPrompt && !inpaintPrompt.value.trim()) {
            inpaintPrompt.value = mainPrompt;
        }
        if (inpaintPromptMobile && !inpaintPromptMobile.value.trim()) {
            inpaintPromptMobile.value = inpaintPrompt ? inpaintPrompt.value : mainPrompt;
        }

        const drawer = document.getElementById('inpaintMobileDrawer');
        const label = document.getElementById('drawerToggleLabel');
        if (drawer) {
            drawer.classList.remove('expanded');
            if (label) label.textContent = '展开 ▲';
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.imgNaturalW = img.naturalWidth;
            this.imgNaturalH = img.naturalHeight;
            this._fitCanvasToContainer(img);
            this.history = [];
            this.modal.style.display = 'flex';
            setTimeout(() => {
                this.modal.classList.remove('modal-hidden');
                this.modal.classList.add('modal-visible');
            }, 10);
            if (window.safeCreateIcons) window.safeCreateIcons();
        };
        img.src = this.originalImgSrc;
    }

    close() {
        this.history = [];
        this.modal.classList.add('modal-hidden');
        this.modal.classList.remove('modal-visible');
        setTimeout(() => {
            this.modal.style.display = 'none';
        }, 300);
        if (this.brushCursor) this.brushCursor.classList.add('hidden');
        if (this._cursorRaf) cancelAnimationFrame(this._cursorRaf);
    }

    setTool(tool) {
        this.tool = tool;
        document.getElementById('inpaintBrushBtn')?.classList.toggle('tool-active', tool === 'brush');
        document.getElementById('inpaintEraserBtn')?.classList.toggle('tool-active', tool === 'eraser');
        document.getElementById('inpaintBlurBtn')?.classList.toggle('tool-active', tool === 'blur');
        document.getElementById('inpaintFillBtn')?.classList.toggle('tool-active', tool === 'fill');
        const blurWrap = document.getElementById('blurStrengthWrap');
        if (blurWrap) blurWrap.style.display = tool === 'blur' ? 'flex' : 'none';
        const fillWrap = document.getElementById('fillToleranceWrap');
        if (fillWrap) fillWrap.style.display = tool === 'fill' ? 'flex' : 'none';
    }

    getBrushSize() {
        return parseInt(document.getElementById('inpaintBrushSize')?.value || 50);
    }

    saveMaskState() {
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        if (!w || !h) return;
        const imageData = this.maskCtx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const alpha = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            alpha[j] = (data[i + 3] === 255 && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) ? 0 : data[i + 3];
        }
        this.history.push({ width: w, height: h, alpha });
        if (this.history.length > 20) this.history.shift();
    }

    undo() {
        if (this.history.length === 0) return;
        const state = this.history.pop();
        if (typeof ImageData !== 'undefined' && state instanceof ImageData) {
            this.maskCtx.putImageData(state, 0, 0);
            return;
        }
        if (state && state.alpha) {
            const w = state.width || this.maskCanvas.width;
            const h = state.height || this.maskCanvas.height;
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
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = a;
            }
            this.maskCtx.putImageData(imgData, 0, 0);
        }
    }

    clearMask() {
        this.saveMaskState();
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }

    _getCanvasPos(e) {
        const rect = this.maskCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = this.maskCanvas.width / rect.width;
        const scaleY = this.maskCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    _drawDotOrStart(pos) {
        const r = this.getBrushSize();
        const tool = this.tool;
        this.maskCtx.save();
        if (tool === 'eraser') {
            this.maskCtx.globalCompositeOperation = 'destination-out';
            this.maskCtx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            this.maskCtx.globalCompositeOperation = 'source-over';
            this.maskCtx.fillStyle = '#FFFFFF';
        }
        this.maskCtx.beginPath();
        this.maskCtx.arc(pos.x, pos.y, r / 2, 0, Math.PI * 2);
        this.maskCtx.fill();
        this.maskCtx.restore();
    }

    _drawStroke(from, to) {
        const r = this.getBrushSize();
        const tool = this.tool;
        this.maskCtx.save();
        this.maskCtx.lineCap = 'round';
        this.maskCtx.lineJoin = 'round';
        this.maskCtx.lineWidth = r;

        if (tool === 'eraser') {
            this.maskCtx.globalCompositeOperation = 'destination-out';
            this.maskCtx.strokeStyle = 'rgba(0,0,0,1)';
            this.maskCtx.beginPath();
            this.maskCtx.moveTo(from.x, from.y);
            this.maskCtx.lineTo(to.x, to.y);
            this.maskCtx.stroke();
        } else if (tool === 'brush') {
            this.maskCtx.globalCompositeOperation = 'source-over';
            this.maskCtx.strokeStyle = '#FFFFFF';
            this.maskCtx.beginPath();
            this.maskCtx.moveTo(from.x, from.y);
            this.maskCtx.lineTo(to.x, to.y);
            this.maskCtx.stroke();
        }
        this.maskCtx.restore();
    }

    _floodFill(startX, startY, tolerance) {
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        const imageData = this.maskCtx.getImageData(0, 0, w, h);
        const data = imageData.data;

        const startIdx = (Math.floor(startY) * w + Math.floor(startX)) * 4;
        const startAlpha = data[startIdx + 3];
        const targetAlpha = startAlpha > 127 ? 0 : 255;

        const stack = [[Math.floor(startX), Math.floor(startY)]];
        const visited = new Uint8Array(w * h);

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            const idx = y * w + x;
            if (visited[idx]) continue;
            const pixelIdx = idx * 4;
            const pixelAlpha = data[pixelIdx + 3];
            if (Math.abs(pixelAlpha - startAlpha) > tolerance) continue;
            visited[idx] = 1;
            data[pixelIdx] = targetAlpha;
            data[pixelIdx + 1] = targetAlpha;
            data[pixelIdx + 2] = targetAlpha;
            data[pixelIdx + 3] = 255;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        this.maskCtx.putImageData(imageData, 0, 0);
    }

    _blurMask(pos, radius, intensity) {
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        const imageData = this.maskCtx.getImageData(0, 0, w, h);
        const data = imageData.data;

        const bx = Math.round(pos.x);
        const by = Math.round(pos.y);
        const r = Math.round(radius * 1.5);
        const alphaReduce = intensity / 100;

        for (let y = Math.max(0, by - r); y <= Math.min(h - 1, by + r); y++) {
            for (let x = Math.max(0, bx - r); x <= Math.min(w - 1, bx + r); x++) {
                const dx = x - bx;
                const dy = y - by;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= r) {
                    const idx = (y * w + x) * 4;
                    const fade = 1 - (dist / r) * alphaReduce;
                    data[idx + 3] = Math.round(data[idx + 3] * fade);
                }
            }
        }
        this.maskCtx.putImageData(imageData, 0, 0);
    }

    _fitCanvasToContainer(img) {
        this.baseCanvas.width = this.imgNaturalW;
        this.baseCanvas.height = this.imgNaturalH;
        this.maskCanvas.width = this.imgNaturalW;
        this.maskCanvas.height = this.imgNaturalH;

        this.baseCtx.drawImage(img, 0, 0, this.imgNaturalW, this.imgNaturalH);
        this.maskCtx.clearRect(0, 0, this.imgNaturalW, this.imgNaturalH);
    }

    _hasPaintedMask() {
        const data = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 10) return true;
        }
        return false;
    }

    _exportMaskAsBase64(targetW, targetH, isV4) {
        const latentW = Math.ceil(targetW / 64) * 8;
        const latentH = Math.ceil(targetH / 64) * 8;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = latentW;
        tempCanvas.height = latentH;
        const ctx = tempCanvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, latentW, latentH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.maskCanvas, 0, 0, latentW, latentH);

        if (isV4) {
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = latentW * 8;
            finalCanvas.height = latentH * 8;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.imageSmoothingEnabled = false;
            finalCtx.drawImage(tempCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
            return finalCanvas.toDataURL('image/png').split(',')[1];
        }

        return tempCanvas.toDataURL('image/png').split(',')[1];
    }

    _exportBaseImageAsBase64(targetW, targetH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetW;
        tempCanvas.height = targetH;
        const ctx = tempCanvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        return new Promise((resolve) => {
            img.onload = () => {
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, 0, 0, targetW, targetH);
                resolve(tempCanvas.toDataURL('image/png').split(',')[1]);
            };
            img.src = this.originalImgSrc;
        });
    }

    async doInpaint() {
        if (!this._hasPaintedMask()) {
            window.showToast('请先在图片上绘制需要重绘的区域', 'warning');
            return;
        }

        const targetW = Math.ceil(this.imgNaturalW / 64) * 64;
        const targetH = Math.ceil(this.imgNaturalH / 64) * 64;
        
        const selectedVersion = document.getElementById('modelValue').value;
        const isV4 = selectedVersion.includes('v4');
        const maskB64 = this._exportMaskAsBase64(targetW, targetH, isV4);

        const submitBtn = document.getElementById('inpaintSubmitBtn');
        const submitBtnMobile = document.getElementById('inpaintSubmitBtnMobile');
        
        submitBtn.disabled = true;
        if (submitBtnMobile) submitBtnMobile.disabled = true;
        
        const loadingHtml = '<span class="loader w-4 h-4 border-white/50"></span> 重绘中...';
        submitBtn.innerHTML = loadingHtml;
        if (submitBtnMobile) submitBtnMobile.innerHTML = loadingHtml;

        try {
            const imageB64 = await this._exportBaseImageAsBase64(targetW, targetH);
            const inpaintPromptText = document.getElementById('inpaintPrompt').value.trim() || document.getElementById('prompt').value.trim();
            
            const authBase = {
                adminToken: this.store.getSetting('nai_admin_token'),
                userKey: this.store.getSetting('nai_user_key'),
                userToken: localStorage.getItem('nai_user_token') || ""
            };
            const customApiKeyRaw = this.store.getSetting('nai_custom_api_key');
            const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
            const auths = customApiKeys.length > 0 
                ? customApiKeys.map(key => ({ ...authBase, customApiKey: key }))
                : [{ ...authBase, customApiKey: "" }];

            const extraParams = this.getExtraParams ? this.getExtraParams(selectedVersion, customApiKeys.length > 0) : {};

            const params = {
                version: selectedVersion,
                prompt: inpaintPromptText,
                negative_prompt: document.getElementById('negativePrompt').value.trim(),
                width: targetW,
                height: targetH,
                steps: parseInt(document.getElementById('steps').value),
                scale: parseFloat(document.getElementById('scale').value),
                sampler: document.getElementById('sampler').value,
                image: imageB64,
                mask: maskB64,
                strength: parseFloat(document.getElementById('inpaintStrength').value),
                action: 'infill',
                add_original_image: true,
                ...extraParams
            };

            const fetchPromises = auths.map(auth => this.engine.generate(params, auth));
            const results = await Promise.allSettled(fetchPromises);

            const successfulResults = [];
            for (const res of results) {
                if (res.status === 'fulfilled') {
                    const result = res.value;
                    if (result.userRole) {
                        this.ui.updateCreditDisplay(result.userRole);
                    }
                    successfulResults.push(result);
                } else {
                    console.error("Concurrent Inpaint Error:", res.reason);
                }
            }

            if (successfulResults.length === 0) {
                const firstError = results.find(r => r.status === 'rejected')?.reason || new Error("所有 API 请求均失败");
                throw firstError;
            }

            this.close();
            if (this.ui.currentRightView !== 'preview') this.ui.switchRightView('preview');

            if (this.onComplete) {
                await this.onComplete(successfulResults, inpaintPromptText, selectedVersion, params);
            }

        } catch (err) {
            console.error(err);
            window.showToast('重绘失败: ' + err.message, 'error');
        } finally {
            const normalHtml = '<i data-lucide="sparkles" class="w-4 h-4"></i> 确认重绘';
            submitBtn.disabled = false;
            submitBtn.innerHTML = normalHtml;
            if (submitBtnMobile) {
                submitBtnMobile.disabled = false;
                submitBtnMobile.innerHTML = normalHtml;
            }
            if (window.safeCreateIcons) window.safeCreateIcons();
        }
    }
}
