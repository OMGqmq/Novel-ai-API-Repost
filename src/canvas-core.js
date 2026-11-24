/**
 * Shared canvas primitives: viewport zoom/pan, coalesced stroke queue,
 * mask polygon/rect/morphology helpers, outpaint seam feathering, and ARIA toolbar roving focus.
 */

export function buildAuthPool(source) {
    if (typeof source?.getSetting === 'function') {
        const adminToken = source.getSetting('nai_admin_token');
        const userKey = source.getSetting('nai_user_key');
        const userToken = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
            ? localStorage.getItem('nai_user_token')
            : '') || '';
        const customApiKeyRaw = source.getSetting('nai_custom_api_key', '') || '';
        const seenKeys = new Set();
        const customKeys = [];
        for (const chunk of String(customApiKeyRaw).split(/[\n,]/)) {
            const key = chunk.trim();
            if (!key || seenKeys.has(key)) continue;
            seenKeys.add(key);
            customKeys.push(key);
        }
        const authBase = { adminToken, userKey, userToken };
        return customKeys.length > 0
            ? customKeys.map((key) => ({ ...authBase, customApiKey: key }))
            : [{ ...authBase, customApiKey: '' }];
    }

    const raw = [
        source?.authKeys?.primary,
        source?.authKeys?.secondary,
        source?.authKey
    ];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

export function initRovingToolbar(toolbarEl) {
    if (!toolbarEl || typeof toolbarEl.addEventListener !== 'function') return () => {};

    const getItems = () => {
        const candidates = Array.from(
            toolbarEl.querySelectorAll('button:not([disabled]), [role="button"]:not([aria-disabled="true"])')
        );
        return candidates.filter((el) => {
            if (el.classList?.contains('hidden')) return false;
            let cur = el.parentElement;
            while (cur && cur !== toolbarEl) {
                if (cur.classList?.contains('hidden')) return false;
                cur = cur.parentElement;
            }
            return true;
        });
    };

    const syncTabIndex = (activeEl) => {
        const items = getItems();
        if (items.length === 0) return;
        const target = items.includes(activeEl) ? activeEl : items[0];
        for (const item of items) {
            item.tabIndex = item === target ? 0 : -1;
        }
    };

    syncTabIndex(null);

    const onFocusIn = (e) => {
        const btn = e.target?.closest?.('button, [role="button"]');
        if (btn && toolbarEl.contains(btn)) {
            syncTabIndex(btn);
        }
    };

    const onKeyDown = (e) => {
        const key = e.key;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
            return;
        }
        const items = getItems();
        if (items.length === 0) return;
        const current = document.activeElement?.closest?.('button, [role="button"]');
        let idx = items.indexOf(current);
        if (idx < 0) idx = 0;

        if (key === 'ArrowRight' || key === 'ArrowDown') {
            idx = (idx + 1) % items.length;
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
            idx = (idx - 1 + items.length) % items.length;
        } else if (key === 'Home') {
            idx = 0;
        } else if (key === 'End') {
            idx = items.length - 1;
        }

        e.preventDefault();
        const nextEl = items[idx];
        syncTabIndex(nextEl);
        nextEl?.focus?.();
    };

    toolbarEl.addEventListener('focusin', onFocusIn);
    toolbarEl.addEventListener('keydown', onKeyDown);

    return () => {
        toolbarEl.removeEventListener('focusin', onFocusIn);
        toolbarEl.removeEventListener('keydown', onKeyDown);
    };
}

export class StrokeCoalescer {
    constructor({ onFlushPoints } = {}) {
        this.onFlushPoints = typeof onFlushPoints === 'function' ? onFlushPoints : () => {};
        this._pending = [];
        this._rafId = null;
    }

    enqueue(event, mapPoint) {
        if (!event || typeof mapPoint !== 'function') return;
        const coalesced = typeof event.getCoalescedEvents === 'function'
            ? event.getCoalescedEvents()
            : null;
        const sourceEvents = coalesced && coalesced.length > 0 ? coalesced : [event];
        for (const ev of sourceEvents) {
            const pt = mapPoint(ev);
            if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
                this._pending.push(pt);
            }
        }
        if (this._pending.length > 0 && this._rafId === null) {
            const raf = typeof globalThis.requestAnimationFrame === 'function'
                ? globalThis.requestAnimationFrame
                : (fn) => setTimeout(fn, 0);
            this._rafId = raf(() => {
                this._rafId = null;
                this.flush();
            });
        }
    }

    flush() {
        if (this._rafId !== null) {
            const caf = typeof globalThis.cancelAnimationFrame === 'function'
                ? globalThis.cancelAnimationFrame
                : clearTimeout;
            caf(this._rafId);
            this._rafId = null;
        }
        if (this._pending.length === 0) return;
        const batch = this._pending;
        this._pending = [];
        this.onFlushPoints(batch);
    }

    cancel() {
        if (this._rafId !== null) {
            const caf = typeof globalThis.cancelAnimationFrame === 'function'
                ? globalThis.cancelAnimationFrame
                : clearTimeout;
            caf(this._rafId);
            this._rafId = null;
        }
        this._pending = [];
    }
}

export class CanvasViewportController {
    constructor({
        wrapEl,
        stageEl,
        badgeEl = null,
        minScale = 1,
        maxScale = 5,
        doubleTapScale = 2.2,
        isEnabled = () => true,
        canSingleFingerPan = () => false,
        canDoubleTap = () => true,
        onPinchStart = null,
        onTransformChange = null
    } = {}) {
        this.wrapEl = wrapEl;
        this.stageEl = stageEl;
        this.badgeEl = badgeEl;
        this.minScale = minScale;
        this.maxScale = maxScale;
        this.doubleTapScale = doubleTapScale;
        this.isEnabled = isEnabled;
        this.canSingleFingerPan = canSingleFingerPan;
        this.canDoubleTap = canDoubleTap;
        this.onPinchStart = onPinchStart;
        this.onTransformChange = onTransformChange;

        this.scale = 1;
        this.x = 0;
        this.y = 0;

        this.activePointers = new Map();
        this.isPinching = false;
        this.isPanning = false;
        this._pinchStart = null;
        this._panStart = null;
        this._lastTap = { time: 0, x: 0, y: 0 };
        this._pointerDownOrigin = null;
        this._attached = false;

        this._onPointerDown = this._handlePointerDown.bind(this);
        this._onPointerMove = this._handlePointerMove.bind(this);
        this._onPointerUp = this._handlePointerUp.bind(this);
        this._onWheel = this._handleWheel.bind(this);
        this._onBadgeClick = () => this.reset();
    }

    attach() {
        if (this._attached || !this.wrapEl) return;
        this._attached = true;
        this.wrapEl.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('pointercancel', this._onPointerUp);
        this.wrapEl.addEventListener('wheel', this._onWheel, { passive: false });
        if (this.badgeEl) {
            this.badgeEl.addEventListener('click', this._onBadgeClick);
        }
        this._applyTransform();
    }

    detach() {
        if (!this._attached || !this.wrapEl) return;
        this._attached = false;
        this.wrapEl.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('pointercancel', this._onPointerUp);
        this.wrapEl.removeEventListener('wheel', this._onWheel);
        if (this.badgeEl) {
            this.badgeEl.removeEventListener('click', this._onBadgeClick);
        }
        this.activePointers.clear();
        this.isPinching = false;
        this.isPanning = false;
    }

    getState() {
        return { scale: this.scale, x: this.x, y: this.y };
    }

    setTransform(scale, x = 0, y = 0) {
        const clamped = Math.max(this.minScale, Math.min(this.maxScale, Number(scale) || 1));
        if (clamped <= this.minScale + 0.01) {
            this.scale = 1;
            this.x = 0;
            this.y = 0;
        } else {
            this.scale = clamped;
            this.x = Number.isFinite(x) ? x : 0;
            this.y = Number.isFinite(y) ? y : 0;
        }
        this._applyTransform();
    }

    reset() {
        this.setTransform(1, 0, 0);
    }

    zoomAt(targetScale, clientX = null, clientY = null) {
        const clamped = Math.max(this.minScale, Math.min(this.maxScale, Number(targetScale) || 1));
        if (clamped <= this.minScale + 0.01) {
            this.reset();
            return;
        }
        const rect = this.wrapEl?.getBoundingClientRect?.();
        let dx = 0;
        let dy = 0;
        if (rect && rect.width > 0 && rect.height > 0 && clientX !== null && clientY !== null) {
            dx = clientX - (rect.left + rect.width / 2);
            dy = clientY - (rect.top + rect.height / 2);
        }
        const ratio = clamped / (this.scale || 1);
        const nextX = dx - (dx - this.x) * ratio;
        const nextY = dy - (dy - this.y) * ratio;
        this.setTransform(clamped, nextX, nextY);
    }

    _applyTransform() {
        if (this.stageEl) {
            if (Math.abs(this.scale - 1) <= 0.01 && Math.abs(this.x) <= 0.5 && Math.abs(this.y) <= 0.5) {
                this.stageEl.style.transform = '';
            } else {
                const tx = Number(this.x.toFixed(1));
                const ty = Number(this.y.toFixed(1));
                const sc = Number(this.scale.toFixed(3));
                this.stageEl.style.transform =
                    `translate3d(${tx}px, ${ty}px, 0) scale(${sc})`;
            }
        }
        if (this.badgeEl) {
            const isZoomed = this.scale > 1.02;
            this.badgeEl.classList.toggle('hidden', !isZoomed);
            this.badgeEl.textContent = `${Math.round(this.scale * 100)}%`;
        }
        this.onTransformChange?.(this.getState());
    }

    _handlePointerDown(e) {
        if (!this.isEnabled(e)) return;
        if (e.target?.closest?.('button, input, select, textarea, a, [data-no-viewport], .crop-handle')) {
            return;
        }

        this.activePointers.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            pointerType: e.pointerType || 'mouse'
        });

        if (this.activePointers.size === 1) {
            this._pointerDownOrigin = { x: e.clientX, y: e.clientY, time: Date.now() };
            if (this.canSingleFingerPan(e)) {
                this.isPanning = true;
                this._panStart = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    x: this.x,
                    y: this.y
                };
            }
            return;
        }

        if (this.activePointers.size === 2) {
            this.isPanning = false;
            this.isPinching = true;
            const pts = Array.from(this.activePointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            this._pinchStart = {
                dist: Math.max(dist, 1),
                midX,
                midY,
                scale: this.scale,
                x: this.x,
                y: this.y
            };
            this.onPinchStart?.(pts[0]);
        }
    }

    _handlePointerMove(e) {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            pointerType: e.pointerType || 'mouse'
        });

        if (this.isPinching && this.activePointers.size >= 2 && this._pinchStart) {
            e.preventDefault?.();
            const pts = Array.from(this.activePointers.values());
            const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const curMidX = (pts[0].x + pts[1].x) / 2;
            const curMidY = (pts[0].y + pts[1].y) / 2;
            const targetScale = Math.max(
                this.minScale,
                Math.min(this.maxScale, this._pinchStart.scale * (curDist / this._pinchStart.dist))
            );
            const rect = this.wrapEl?.getBoundingClientRect?.();
            let anchorDx = 0;
            let anchorDy = 0;
            if (rect && rect.width > 0 && rect.height > 0) {
                anchorDx = this._pinchStart.midX - (rect.left + rect.width / 2);
                anchorDy = this._pinchStart.midY - (rect.top + rect.height / 2);
            }
            const ratio = targetScale / (this._pinchStart.scale || 1);
            const zoomX = anchorDx - (anchorDx - this._pinchStart.x) * ratio;
            const zoomY = anchorDy - (anchorDy - this._pinchStart.y) * ratio;
            this.setTransform(
                targetScale,
                zoomX + (curMidX - this._pinchStart.midX),
                zoomY + (curMidY - this._pinchStart.midY)
            );
            return;
        }

        if (this.isPanning && this.activePointers.size === 1 && this._panStart) {
            e.preventDefault?.();
            this.setTransform(
                this.scale,
                this._panStart.x + (e.clientX - this._panStart.clientX),
                this._panStart.y + (e.clientY - this._panStart.clientY)
            );
        }
    }

    _handlePointerUp(e) {
        const hadPinch = this.isPinching;
        this.activePointers.delete(e.pointerId);

        if (this.activePointers.size < 2) {
            this.isPinching = false;
            this._pinchStart = null;
        }
        if (this.activePointers.size === 0) {
            const movedDist = this._pointerDownOrigin
                ? Math.hypot(e.clientX - this._pointerDownOrigin.x, e.clientY - this._pointerDownOrigin.y)
                : 999;
            const isQuickTap = !hadPinch && !this.isPanning || movedDist < 10;
            if (
                !hadPinch &&
                isQuickTap &&
                movedDist < 12 &&
                e.pointerType === 'touch' &&
                this.isEnabled(e) &&
                this.canDoubleTap(e)
            ) {
                const now = Date.now();
                const dt = now - this._lastTap.time;
                const dTap = Math.hypot(e.clientX - this._lastTap.x, e.clientY - this._lastTap.y);
                if (this._lastTap.time > 0 && dt >= 0 && dt < 320 && dTap < 28) {
                    this._lastTap = { time: 0, x: 0, y: 0 };
                    const target = this.scale > 1.15 ? 1 : this.doubleTapScale;
                    this.zoomAt(target, e.clientX, e.clientY);
                } else {
                    this._lastTap = { time: now, x: e.clientX, y: e.clientY };
                }
            }
            this.isPanning = false;
            this._panStart = null;
            this._pointerDownOrigin = null;
        }
    }

    _handleWheel(e) {
        if (!this.isEnabled(e)) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        this.zoomAt(this.scale * factor, e.clientX, e.clientY);
    }
}

export function rasterizePolygon(ctx, points, { erase = false } = {}) {
    if (!ctx || !Array.isArray(points) || points.length < 3) return false;
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = erase ? 'rgba(0,0,0,1)' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return true;
}

export function rasterizeRect(ctx, p1, p2, { erase = false } = {}) {
    if (!ctx || !p1 || !p2) return false;
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    if (w < 1 || h < 1) return false;
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = erase ? 'rgba(0,0,0,1)' : '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return true;
}

export function invertMaskCanvas(ctx, width, height) {
    if (!ctx || !width || !height) return;
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const nextAlpha = 255 - d[i + 3];
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = nextAlpha;
    }
    ctx.putImageData(imgData, 0, 0);
}

export function dilateMaskCanvas(ctx, width, height, radiusPx = 8) {
    const r = Math.max(0, Math.round(radiusPx));
    if (!ctx || !width || !height || r <= 0) return;

    const imgData = ctx.getImageData(0, 0, width, height);
    const src = imgData.data;
    const total = width * height;
    const horiz = new Uint8Array(total);
    const out = new Uint8Array(total);

    // Separable sliding-window horizontal max pass
    const deque = new Int32Array(width);
    for (let y = 0; y < height; y++) {
        const rowOff = y * width;
        let head = 0;
        let tail = 0;
        for (let x = 0; x < width + r; x++) {
            if (x < width) {
                const a = src[(rowOff + x) * 4 + 3];
                while (tail > head && src[(rowOff + deque[tail - 1]) * 4 + 3] <= a) {
                    tail--;
                }
                deque[tail++] = x;
            }
            const outX = x - r;
            if (outX >= 0 && outX < width) {
                while (head < tail && deque[head] < outX - r) {
                    head++;
                }
                horiz[rowOff + outX] = head < tail ? src[(rowOff + deque[head]) * 4 + 3] : 0;
            }
        }
    }

    // Separable sliding-window vertical max pass
    const vDeque = new Int32Array(height);
    for (let x = 0; x < width; x++) {
        let head = 0;
        let tail = 0;
        for (let y = 0; y < height + r; y++) {
            if (y < height) {
                const a = horiz[y * width + x];
                while (tail > head && horiz[vDeque[tail - 1] * width + x] <= a) {
                    tail--;
                }
                vDeque[tail++] = y;
            }
            const outY = y - r;
            if (outY >= 0 && outY < height) {
                while (head < tail && vDeque[head] < outY - r) {
                    head++;
                }
                out[outY * width + x] = head < tail ? horiz[vDeque[head] * width + x] : 0;
            }
        }
    }

    for (let i = 0; i < total; i++) {
        const a = out[i];
        const p = i * 4;
        if (a > 0) {
            src[p] = 255;
            src[p + 1] = 255;
            src[p + 2] = 255;
            src[p + 3] = a;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

export function stitchOutpaintWithFeather(
    combinedCtx,
    newImg,
    newX,
    newY,
    width,
    height,
    { featherPx = 24, canvasW = width, canvasH = height } = {}
) {
    if (!combinedCtx || !newImg) return;
    const f = Math.min(Math.max(0, featherPx), Math.floor(Math.min(width, height) / 4));
    const featherLeft = f > 0 && newX > 0;
    const featherTop = f > 0 && newY > 0;
    const featherRight = f > 0 && (newX + width < canvasW);
    const featherBottom = f > 0 && (newY + height < canvasH);

    if (!featherLeft && !featherTop && !featherRight && !featherBottom) {
        combinedCtx.drawImage(newImg, newX, newY, width, height);
        return;
    }

    const tempCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!tempCanvas) {
        combinedCtx.drawImage(newImg, newX, newY, width, height);
        return;
    }
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext?.('2d');
    if (!tempCtx || typeof tempCtx.createLinearGradient !== 'function') {
        combinedCtx.drawImage(newImg, newX, newY, width, height);
        return;
    }

    tempCtx.clearRect(0, 0, width, height);
    tempCtx.drawImage(newImg, 0, 0, width, height);
    tempCtx.globalCompositeOperation = 'destination-in';

    const applyEdgeFade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const grad = tempCtx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
        tempCtx.fillStyle = grad;
        tempCtx.fillRect(rx, ry, rw, rh);
    };

    if (featherLeft) applyEdgeFade(0, 0, f, 0, 0, 0, f, height);
    if (featherRight) applyEdgeFade(width, 0, width - f, 0, width - f, 0, f, height);
    if (featherTop) applyEdgeFade(0, 0, 0, f, 0, 0, width, f);
    if (featherBottom) applyEdgeFade(0, height, 0, height - f, 0, height - f, width, f);

    tempCtx.globalCompositeOperation = 'source-over';
    combinedCtx.drawImage(tempCanvas, newX, newY, width, height);
}
