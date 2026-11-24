/**
 * Mobile/Desktop Canvas IO (file import, blank sketch canvas, Ctrl+V paste, dual-zone drop)
 * and interactive 8-handle CropEditor with aspect-ratio presets.
 */

const MAX_IMPORT_EDGE = 2048;

function _clampInt(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function _probeImageElement(src) {
    return new Promise((resolve) => {
        if (typeof Image === 'undefined') {
            resolve(null);
            return;
        }
        const img = new Image();
        let settled = false;
        const done = (res) => {
            if (settled) return;
            settled = true;
            resolve(res);
        };
        img.onload = () => done(img);
        img.onerror = () => done(null);
        img.src = src;
        setTimeout(() => done(null), 1500);
    });
}

export function createCanvasIOController({
    appState,
    ui,
    getActiveModel = () => 'v3',
    onOpenInpaint = null,
    onShowToast = (msg) => window.showToast?.(msg, 'info'),
    onAfterLoad = null
} = {}) {
    async function loadImageDataUrlToCanvas(
        dataUrl,
        {
            width = 0,
            height = 0,
            autoOpenSketch = false,
            openInpaintOnLoad = false,
            label = ''
        } = {}
    ) {
        if (!dataUrl) return null;

        let finalW = Number(width) || 0;
        let finalH = Number(height) || 0;
        if ((!finalW || !finalH) && typeof document !== 'undefined') {
            const probed = await _probeImageElement(dataUrl);
            if (probed && probed.naturalWidth > 0 && probed.naturalHeight > 0) {
                finalW = probed.naturalWidth;
                finalH = probed.naturalHeight;
            }
        }
        if (!finalW || !finalH) {
            finalW = 832;
            finalH = 1216;
        }

        const item = {
            imageUrl: dataUrl,
            image: dataUrl,
            width: finalW,
            height: finalH,
            prompt: '',
            model: getActiveModel() || 'v3',
            params: { width: finalW, height: finalH },
            importedAt: Date.now()
        };

        if (appState) {
            appState.currentImageData = item;
        }
        if (ui && typeof ui.showResultImages === 'function') {
            ui.showResultImages([item], (selected) => {
                if (appState) appState.currentImageData = selected;
            });
        }

        document.getElementById('blankCanvasPopover')?.hidePopover?.();
        document.getElementById('toolboxMenu')?.hidePopover?.();

        if (autoOpenSketch || openInpaintOnLoad) {
            if (typeof onOpenInpaint === 'function') {
                await onOpenInpaint();
            }
            if (autoOpenSketch && typeof window !== 'undefined') {
                window.inpaintEditor?.setLayerMode?.('sketch');
            }
        }

        if (label) {
            onShowToast?.(`已载入画布：${finalW} × ${finalH}`, 'success');
        }
        onAfterLoad?.(item);
        return item;
    }

    async function handleCanvasFileInput(file) {
        if (!file) return null;
        const isImgType = typeof file.type === 'string' && file.type.startsWith('image/');
        const isImgExt = typeof file.name === 'string' && /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
        if (!isImgType && !isImgExt) {
            onShowToast?.('请选择 PNG / JPG / WebP 图片文件', 'warning');
            return null;
        }

        const rawDataUrl = await new Promise((resolve, reject) => {
            if (typeof FileReader === 'undefined') {
                reject(new Error('FileReader 不可用'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('读取本地图片失败'));
            reader.readAsDataURL(file);
        });

        let finalUrl = rawDataUrl;
        let width = 0;
        let height = 0;

        const img = await _probeImageElement(rawDataUrl);
        if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
            width = img.naturalWidth;
            height = img.naturalHeight;
            const maxDim = Math.max(width, height);
            if (maxDim > MAX_IMPORT_EDGE && typeof document !== 'undefined') {
                const ratio = MAX_IMPORT_EDGE / maxDim;
                const scaledW = Math.max(8, Math.round(width * ratio));
                const scaledH = Math.max(8, Math.round(height * ratio));
                const c = document.createElement('canvas');
                c.width = scaledW;
                c.height = scaledH;
                const ctx = c.getContext?.('2d');
                if (ctx && typeof ctx.drawImage === 'function') {
                    ctx.drawImage(img, 0, 0, scaledW, scaledH);
                    finalUrl = c.toDataURL('image/png');
                    width = scaledW;
                    height = scaledH;
                }
            }
        }

        return loadImageDataUrlToCanvas(finalUrl, {
            width,
            height,
            label: file.name || '本地图片'
        });
    }

    async function createBlankCanvas(width = 832, height = 1216, { autoSketch = true } = {}) {
        const w = _clampInt(width, 64, 4096, 832);
        const h = _clampInt(height, 64, 4096, 1216);

        let dataUrl = '';
        if (typeof document !== 'undefined') {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext?.('2d');
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
            }
            dataUrl = typeof c.toDataURL === 'function' ? c.toDataURL('image/png') : '';
        }
        if (!dataUrl) {
            dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
        }

        return loadImageDataUrlToCanvas(dataUrl, {
            width: w,
            height: h,
            autoOpenSketch: autoSketch,
            label: autoSketch ? '新建空白涂鸦画布' : '新建空白画布'
        });
    }

    async function handleDroppedImageFile(file, dropTargetEl, { applyMetadataFn } = {}) {
        if (!file) return null;
        const zone = dropTargetEl?.closest?.('[data-drop-action]')?.dataset?.dropAction || '';
        if (zone === 'canvas') {
            return handleCanvasFileInput(file);
        }
        if (zone === 'meta') {
            return applyMetadataFn?.(file);
        }
        const isPng = file.type === 'image/png' || file.name?.toLowerCase?.().endsWith('.png');
        if (isPng && typeof applyMetadataFn === 'function') {
            return applyMetadataFn(file);
        }
        return handleCanvasFileInput(file);
    }

    function bindGlobalPasteAndDrop() {
        if (typeof document === 'undefined') return () => {};
        const onPaste = (e) => {
            const active = document.activeElement;
            if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type !== 'file'))) {
                return;
            }
            const items = Array.from(e.clipboardData?.items || []);
            const imgItem = items.find((it) => it.kind === 'file' && it.type?.startsWith('image/'));
            const file = imgItem?.getAsFile?.() || e.clipboardData?.files?.[0];
            if (!file) return;
            const isImage = file.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name || '');
            if (!isImage) return;
            e.preventDefault?.();
            handleCanvasFileInput(file);
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }

    return {
        loadImageDataUrlToCanvas,
        handleCanvasFileInput,
        createBlankCanvas,
        handleDroppedImageFile,
        bindGlobalPasteAndDrop
    };
}

export class CropEditor {
    constructor({
        appState,
        onApplyCrop,
        onShowToast = (msg, type) => window.showToast?.(msg, type)
    } = {}) {
        this.appState = appState;
        this.onApplyCrop = onApplyCrop;
        this.onShowToast = onShowToast;

        this.isOpen = false;
        this.aspect = 'free';
        this.box = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
        this.imgW = 0;
        this.imgH = 0;
        this.srcUrl = '';

        this._dragState = null;
        this._boundMove = this._onPointerMove.bind(this);
        this._boundUp = this._onPointerUp.bind(this);
        this._eventsBound = false;
    }

    _els() {
        return {
            overlay: document.getElementById('canvasCropOverlay'),
            dock: document.getElementById('cropDockHost'),
            boxEl: document.getElementById('canvasCropBox'),
            dimLabel: document.getElementById('cropDimLabel'),
            img: document.getElementById('singleResultImg')
        };
    }

    _bindEvents() {
        if (this._eventsBound || typeof document === 'undefined') return;
        const { overlay } = this._els();
        if (!overlay) return;
        this._eventsBound = true;

        overlay.addEventListener('pointerdown', (e) => {
            if (!this.isOpen) return;
            const handleEl = e.target?.closest?.('.crop-handle');
            const boxEl = e.target?.closest?.('#canvasCropBox');
            if (!handleEl && !boxEl) return;

            e.preventDefault();
            e.stopPropagation();
            const rect = overlay.getBoundingClientRect();
            this._dragState = {
                type: handleEl ? handleEl.dataset.cropHandle : 'move',
                startX: e.clientX,
                startY: e.clientY,
                rectW: Math.max(1, rect.width),
                rectH: Math.max(1, rect.height),
                startBox: { ...this.box }
            };
        });

        window.addEventListener('pointermove', this._boundMove);
        window.addEventListener('pointerup', this._boundUp);
        window.addEventListener('pointercancel', this._boundUp);
    }

    async open() {
        const current = this.appState?.currentImageData;
        const { img, overlay, dock } = this._els();
        const src = current?.imageUrl || current?.image || img?.src;
        if (!src) {
            this.onShowToast?.('请先生成或导入图片后再裁剪', 'warning');
            return false;
        }

        if (typeof window !== 'undefined') {
            if (window.inpaintEditor?.isOpen) {
                window.inpaintEditor.close();
            }
            if (window.outpaintEditor?.isOpen) {
                window.exitOutpaint?.();
            }
        }

        this.srcUrl = src;
        let w = Number(current?.width || img?.naturalWidth || 0);
        let h = Number(current?.height || img?.naturalHeight || 0);
        if (!w || !h) {
            const probed = await _probeImageElement(src);
            w = probed?.naturalWidth || 832;
            h = probed?.naturalHeight || 1216;
        }
        this.imgW = w;
        this.imgH = h;
        this.aspect = 'free';
        this.box = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
        this.isOpen = true;

        this._bindEvents();
        if (overlay) {
            overlay.classList.remove('hidden');
        }
        if (dock) {
            dock.classList.remove('hidden');
            dock.style.display = '';
        }
        this._syncPresetButtons();
        this._renderBox();
        return true;
    }

    close() {
        const { overlay, dock } = this._els();
        this.isOpen = false;
        this._dragState = null;
        if (overlay) overlay.classList.add('hidden');
        if (dock) {
            dock.classList.add('hidden');
            dock.style.display = 'none';
        }
    }

    _getNumericAspect() {
        switch (this.aspect) {
            case '2:3': return 2 / 3;
            case '3:2': return 3 / 2;
            case '1:1': return 1;
            default: return null;
        }
    }

    _syncPresetButtons() {
        const { dock } = this._els();
        if (!dock) return;
        dock.querySelectorAll('[data-crop-aspect]').forEach((btn) => {
            const active = btn.dataset.cropAspect === this.aspect;
            btn.classList.toggle('tool-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    setAspect(preset = 'free') {
        this.aspect = preset;
        this._syncPresetButtons();
        const targetRatio = this._getNumericAspect();
        if (!targetRatio || !this.imgW || !this.imgH) {
            this._renderBox();
            return;
        }
        const imgAspect = this.imgW / this.imgH;
        const normAspect = targetRatio / imgAspect;
        const cx = this.box.x + this.box.w / 2;
        const cy = this.box.y + this.box.h / 2;

        let newW = this.box.w;
        let newH = newW / normAspect;
        if (newH > 0.96) {
            newH = 0.96;
            newW = newH * normAspect;
        }
        if (newW > 0.96) {
            newW = 0.96;
            newH = newW / normAspect;
        }

        const x = Math.max(0, Math.min(1 - newW, cx - newW / 2));
        const y = Math.max(0, Math.min(1 - newH, cy - newH / 2));
        this.box = { x, y, w: newW, h: newH };
        this._renderBox();
    }

    _onPointerMove(e) {
        if (!this.isOpen || !this._dragState) return;
        const { type, startX, startY, rectW, rectH, startBox } = this._dragState;
        const dx = (e.clientX - startX) / rectW;
        const dy = (e.clientY - startY) / rectH;
        const minNorm = 0.08;

        if (type === 'move') {
            this.box.x = Math.max(0, Math.min(1 - startBox.w, startBox.x + dx));
            this.box.y = Math.max(0, Math.min(1 - startBox.h, startBox.y + dy));
            this._renderBox();
            return;
        }

        let left = startBox.x;
        let top = startBox.y;
        let right = startBox.x + startBox.w;
        let bottom = startBox.y + startBox.h;

        if (type.includes('w')) left = Math.max(0, Math.min(right - minNorm, startBox.x + dx));
        if (type.includes('e')) right = Math.min(1, Math.max(left + minNorm, startBox.x + startBox.w + dx));
        if (type.includes('n')) top = Math.max(0, Math.min(bottom - minNorm, startBox.y + dy));
        if (type.includes('s')) bottom = Math.min(1, Math.max(top + minNorm, startBox.y + startBox.h + dy));

        let w = right - left;
        let h = bottom - top;

        const targetRatio = this._getNumericAspect();
        if (targetRatio && this.imgW && this.imgH) {
            const normAspect = targetRatio / (this.imgW / this.imgH);
            if (type === 'n' || type === 's') {
                w = Math.min(1 - left, Math.max(minNorm, h * normAspect));
                h = w / normAspect;
            } else {
                h = Math.max(minNorm, w / normAspect);
                if (top + h > 1) {
                    h = 1 - top;
                    w = h * normAspect;
                }
            }
            if (type.includes('w')) left = right - w;
            if (type.includes('n')) top = bottom - h;
        }

        this.box = {
            x: Math.max(0, left),
            y: Math.max(0, top),
            w: Math.max(minNorm, Math.min(1 - Math.max(0, left), w)),
            h: Math.max(minNorm, Math.min(1 - Math.max(0, top), h))
        };
        this._renderBox();
    }

    _onPointerUp() {
        this._dragState = null;
    }

    _renderBox() {
        const { boxEl, dimLabel } = this._els();
        if (boxEl) {
            boxEl.style.left = `${(this.box.x * 100).toFixed(2)}%`;
            boxEl.style.top = `${(this.box.y * 100).toFixed(2)}%`;
            boxEl.style.width = `${(this.box.w * 100).toFixed(2)}%`;
            boxEl.style.height = `${(this.box.h * 100).toFixed(2)}%`;
        }
        if (dimLabel && this.imgW && this.imgH) {
            const pxW = Math.max(8, Math.round(this.box.w * this.imgW));
            const pxH = Math.max(8, Math.round(this.box.h * this.imgH));
            dimLabel.textContent = `${pxW} × ${pxH}`;
        }
    }

    async applyCrop() {
        if (!this.isOpen || !this.srcUrl) return null;
        const sx = Math.max(0, Math.round(this.box.x * this.imgW));
        const sy = Math.max(0, Math.round(this.box.y * this.imgH));
        const sw = Math.max(64, Math.min(this.imgW - sx, Math.round(this.box.w * this.imgW)));
        const sh = Math.max(64, Math.min(this.imgH - sy, Math.round(this.box.h * this.imgH)));

        let dataUrl = this.srcUrl;
        if (typeof document !== 'undefined') {
            const img = await _probeImageElement(this.srcUrl);
            const canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext?.('2d');
            if (ctx && img && typeof ctx.drawImage === 'function') {
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            }
            if (typeof canvas.toDataURL === 'function') {
                const exported = canvas.toDataURL('image/png');
                if (exported) dataUrl = exported;
            }
        }

        this.close();
        if (typeof this.onApplyCrop === 'function') {
            await this.onApplyCrop({ dataUrl, width: sw, height: sh });
        }
        this.onShowToast?.(`已裁剪画布：${sw} × ${sh}`, 'success');
        return { dataUrl, width: sw, height: sh };
    }
}
