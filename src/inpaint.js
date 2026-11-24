/**
 * Inpaint Editor Module
 * True Main-Canvas Fusion: paints directly over #singleResultImg in the main canvas,
 * stays persistently active across generations until closed, supports multi-touch
 * pinch-zoom/pan, mask peek/hide, and 1-click base-image revert.
 */
import * as motionMod from './motion-controller.js';
import {
    buildAuthPool,
    StrokeCoalescer,
    rasterizePolygon,
    rasterizeRect,
    invertMaskCanvas,
    dilateMaskCanvas
} from './canvas-core.js';

export class InpaintEditor {
    constructor(dependencies = {}) {
        this.ui = dependencies.ui;
        this.engine = dependencies.engine;
        this.store = dependencies.store;
        this.onComplete = dependencies.onComplete;
        this.getExtraParams = dependencies.getExtraParams;
        this.prepareBeforeGenerate = dependencies.prepareBeforeGenerate;

        this.modal = document.getElementById('inpaintModal');
        this.canvasWrap = document.getElementById('inpaintCanvasWrap');
        this.canvasStage = document.getElementById('inpaintCanvasStage');
        this.baseCanvas = document.getElementById('inpaintBaseCanvas');
        this.maskCanvas = document.getElementById('inpaintMaskCanvas');
        this.singleImg = document.getElementById('singleResultImg');
        this.baseCtx = this.baseCanvas ? this.baseCanvas.getContext('2d') : null;
        this.maskCtx = this.maskCanvas ? this.maskCanvas.getContext('2d') : null;
        this.brushCursor = document.getElementById('brushCursor');

        this.tool = 'brush';
        this.drawing = false;
        this.isOpen = false;
        this.history = [];
        this.lastSession = null;
        this.originalImgSrc = '';
        this.hasGeneratedInSession = false;
        this.maskHidden = false;
        this.maskPeek = false;
        this.paramsPopoverOpen = false;
        this._isSubmitting = false;
        this.imgNaturalW = 0;
        this.imgNaturalH = 0;
        this.lastPos = null;
        this._cursorRaf = null;

        // Viewport Zoom & Pan state
        this.viewport = { scale: 1, x: 0, y: 0 };
        this.activePointers = new Map();
        this.isPinching = false;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.pinchStart = null;
        this._spacePressed = false;
        this._strokeStartTime = 0;
        this._strokeMovedDist = 0;
        this._modalCloseTimer = null;
        this._stageTransitionTimer = null;
        this._wheelWillChangeTimer = null;

        this.sketchCanvas = typeof document !== 'undefined' ? document.getElementById('inpaintSketchCanvas') : null;
        this.sketchCtx = this.sketchCanvas?.getContext?.('2d') || null;
        this.selPreviewCanvas = typeof document !== 'undefined' ? document.getElementById('inpaintSelectionPreviewCanvas') : null;
        this.selPreviewCtx = this.selPreviewCanvas?.getContext?.('2d') || null;

        this.redoHistory = [];
        this.layerMode = 'mask';
        this.sketchColor = '#ef4444';
        this.eyedropperActive = false;
        this.sketchDirty = false;
        this.sketchHistory = [];
        this.sketchRedoHistory = [];
        this._lassoPoints = [];
        this._rectStart = null;
        this._rectEnd = null;
        this._brushRingTimer = null;
        this._strokeCoalescer = new StrokeCoalescer({
            onFlushPoints: (pts) => this._flushStrokePoints(pts)
        });

        this._bindEvents();
    }

    isActive() {
        if (this.isOpen) return true;
        if (!this.modal) return false;
        const hiddenByClass = this.modal.classList?.contains?.('modal-hidden') || this.modal.classList?.contains?.('hidden');
        const hiddenByStyle = this.modal.style?.display === 'none';
        return !hiddenByClass && !hiddenByStyle;
    }

    toggle(options = {}) {
        if (this.isActive()) {
            this.close();
        } else {
            this.open(options);
        }
    }

    _getMotionController() {
        return (typeof window !== 'undefined' && window.motionController) || motionMod.motionController || null;
    }

    _prefersReducedMotion() {
        const mc = this._getMotionController();
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

    _setSubControlVisible(el, visible, { displayFlex = false, offsetY = 6 } = {}) {
        if (!el) return;
        const canAnimate = Boolean(
            typeof el.getAnimations === 'function'
            && typeof el.animate === 'function'
            && !this._prefersReducedMotion()
        );

        if (!displayFlex) {
            const mc = this._getMotionController();
            if (canAnimate && mc && typeof mc.enter === 'function' && typeof mc.exit === 'function') {
                if (visible) mc.enter(el, { hiddenClass: 'hidden' });
                else mc.exit(el, { hiddenClass: 'hidden' });
                return;
            }
        }

        if (canAnimate) {
            try {
                el.getAnimations().forEach(a => { try { a.cancel(); } catch (_) {} });
            } catch (_) {}

            if (visible) {
                const wasHidden = displayFlex
                    ? el.style?.display === 'none'
                    : Boolean(el.classList?.contains?.('hidden'));
                el.removeAttribute?.('data-closing');
                if (displayFlex) {
                    if (el.style) el.style.display = 'flex';
                } else {
                    el.classList?.remove?.('hidden');
                }
                if (wasHidden) {
                    try {
                        el.animate(
                            [
                                { opacity: 0, transform: `translate3d(0, ${offsetY}px, 0) scale(0.96)` },
                                { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
                            ],
                            { duration: 170, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
                        );
                    } catch (_) {}
                }
            } else {
                const currentlyHidden = displayFlex
                    ? el.style?.display === 'none'
                    : Boolean(el.classList?.contains?.('hidden'));
                if (!currentlyHidden && !el.hasAttribute?.('data-closing')) {
                    el.setAttribute?.('data-closing', '');
                    try {
                        const anim = el.animate(
                            [
                                { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
                                { opacity: 0, transform: `translate3d(0, ${offsetY}px, 0) scale(0.96)` }
                            ],
                            { duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
                        );
                        let done = false;
                        const finishHide = () => {
                            if (done || !el.hasAttribute?.('data-closing')) return;
                            done = true;
                            el.removeAttribute?.('data-closing');
                            if (displayFlex) {
                                if (el.style) el.style.display = 'none';
                            } else {
                                el.classList?.add?.('hidden');
                            }
                        };
                        anim.onfinish = finishHide;
                        setTimeout(finishHide, 170);
                    } catch (_) {
                        el.removeAttribute?.('data-closing');
                        if (displayFlex) {
                            if (el.style) el.style.display = 'none';
                        } else {
                            el.classList?.add?.('hidden');
                        }
                    }
                }
            }
            return;
        }

        el.removeAttribute?.('data-closing');
        if (displayFlex) {
            if (el.style) el.style.display = visible ? 'flex' : 'none';
        } else {
            el.classList?.toggle?.('hidden', !visible);
        }
    }

    _setModalVisible(visible) {
        if (!this.modal) return;
        if (this._modalCloseTimer) {
            clearTimeout(this._modalCloseTimer);
            this._modalCloseTimer = null;
        }
        const canAnimate = Boolean(
            typeof this.modal.getAnimations === 'function'
            && !this._prefersReducedMotion()
        );
        if (visible) {
            this.modal.removeAttribute?.('data-closing');
            if (this.modal.style) this.modal.style.display = 'flex';
            this.modal.classList?.remove?.('hidden', 'modal-hidden');
            if (canAnimate && typeof requestAnimationFrame === 'function') {
                this.modal.classList?.add?.('modal-hidden');
                requestAnimationFrame(() => {
                    if (!this.isOpen) return;
                    this.modal.classList?.remove?.('modal-hidden');
                    this.modal.classList?.add?.('modal-visible');
                });
            } else {
                this.modal.classList?.add?.('modal-visible');
            }
        } else {
            const hasTransition = canAnimate && (
                typeof getComputedStyle === 'function'
                    ? parseFloat(getComputedStyle(this.modal).transitionDuration || '0') > 0
                    : true
            );
            if (hasTransition && this.modal.style?.display !== 'none') {
                this.modal.setAttribute?.('data-closing', '');
                this.modal.classList?.add?.('modal-hidden');
                this.modal.classList?.remove?.('modal-visible');
                let done = false;
                const finishClose = () => {
                    if (done || this.isOpen || !this.modal.hasAttribute?.('data-closing')) return;
                    done = true;
                    this.modal.removeAttribute?.('data-closing');
                    if (this.modal.style) this.modal.style.display = 'none';
                };
                this.modal.addEventListener?.('transitionend', finishClose, { once: true });
                this._modalCloseTimer = setTimeout(finishClose, 260);
            } else {
                this.modal.removeAttribute?.('data-closing');
                this.modal.classList?.add?.('modal-hidden');
                this.modal.classList?.remove?.('modal-visible');
                if (this.modal.style) this.modal.style.display = 'none';
            }
        }
    }

    _setStageInteracting(active) {
        const target = this.canvasStage || (typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null);
        if (!target) return;
        if (active && this._stageTransitionTimer) {
            clearTimeout(this._stageTransitionTimer);
            this._stageTransitionTimer = null;
        }
        if (target.style) {
            if (active) target.style.transition = '';
            target.style.willChange = active ? 'transform' : '';
        }
        target.classList?.toggle?.('is-interacting', Boolean(active));
    }

    hasRestorableMask() {
        return Boolean(this.lastSession && this.lastSession.maskAlpha && this.lastSession.width > 0 && this.lastSession.height > 0);
    }

    showQuickRetryBar(show) {
        const bar = typeof document !== 'undefined' ? document.getElementById('inpaintQuickRetryBar') : null;
        if (!bar) return;
        this._setSubControlVisible(bar, Boolean(show && this.hasRestorableMask()));
    }

    _syncToggleBtnState() {
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintToggleBtn') : null;
        if (btn && btn.classList) {
            btn.classList.toggle('inpaint-toggle-active', Boolean(this.isOpen));
        }
    }

    _syncRevertOrigBtnVisibility() {
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintRevertOrigBtn') : null;
        if (btn) {
            this._setSubControlVisible(btn, Boolean(this.hasGeneratedInSession));
        }
    }

    _syncRestoreBtnVisibility() {
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintRestoreMaskBtn') : null;
        if (!btn) return;
        this._setSubControlVisible(btn, Boolean(this.hasRestorableMask()));
    }

    setMaskPeek(peek) {
        this.maskPeek = Boolean(peek);
        if (this.maskCanvas && this.maskCanvas.classList) {
            this.maskCanvas.classList.toggle('mask-peek', this.maskPeek && !this.maskHidden);
        }
    }

    toggleMaskVisibility(forceHidden) {
        this.maskHidden = typeof forceHidden === 'boolean' ? forceHidden : !this.maskHidden;
        if (this.maskPeek && !this.maskHidden) {
            this.maskPeek = false;
        }
        if (this.maskCanvas && this.maskCanvas.classList) {
            this.maskCanvas.classList.toggle('mask-hidden', this.maskHidden);
            this.maskCanvas.classList.toggle('mask-peek', this.maskPeek && !this.maskHidden);
        }
        const eyeOpen = typeof document !== 'undefined' ? document.getElementById('inpaintEyeOpenIcon') : null;
        const eyeOff = typeof document !== 'undefined' ? document.getElementById('inpaintEyeOffIcon') : null;
        const visBtn = typeof document !== 'undefined' ? document.getElementById('inpaintMaskVisBtn') : null;
        if (eyeOpen?.classList) eyeOpen.classList.toggle('hidden', this.maskHidden);
        if (eyeOff?.classList) eyeOff.classList.toggle('hidden', !this.maskHidden);
        if (visBtn?.classList) visBtn.classList.toggle('tool-active', this.maskHidden);
        return !this.maskHidden;
    }

    toggleParamsPopover(forceState) {
        const pop = typeof document !== 'undefined' ? document.getElementById('inpaintParamsPopover') : null;
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintParamsBtn') : null;
        this.paramsPopoverOpen = typeof forceState === 'boolean' ? forceState : !this.paramsPopoverOpen;
        this._setSubControlVisible(pop, this.paramsPopoverOpen, { offsetY: 8 });
        if (btn?.classList) {
            btn.classList.toggle('tool-active', this.paramsPopoverOpen);
        }
        if (btn?.setAttribute) {
            btn.setAttribute('aria-expanded', this.paramsPopoverOpen ? 'true' : 'false');
        }
    }

    /**
     * Locks #inpaintMaskCanvas CSS width/height 1:1 over the visible rendered box of #singleResultImg.
     */
    syncOverlayGeometry() {
        const imgEl = this.singleImg || (typeof document !== 'undefined' ? document.getElementById('singleResultImg') : null);
        const maskEl = this.maskCanvas || (typeof document !== 'undefined' ? document.getElementById('inpaintMaskCanvas') : null);
        if (!imgEl || !maskEl || !maskEl.style) return;

        const boxW = imgEl.clientWidth || imgEl.offsetWidth || 0;
        const boxH = imgEl.clientHeight || imgEl.offsetHeight || 0;
        const natW = this.imgNaturalW || imgEl.naturalWidth || boxW;
        const natH = this.imgNaturalH || imgEl.naturalHeight || boxH;

        if (boxW > 0 && boxH > 0 && natW > 0 && natH > 0) {
            const fitScale = Math.min(boxW / natW, boxH / natH);
            const dispW = Math.round(natW * fitScale);
            const dispH = Math.round(natH * fitScale);
            maskEl.style.width = `${dispW}px`;
            maskEl.style.height = `${dispH}px`;
            for (const extraEl of [this.sketchCanvas, this.selPreviewCanvas]) {
                if (extraEl && extraEl.style) {
                    extraEl.style.width = `${dispW}px`;
                    extraEl.style.height = `${dispH}px`;
                }
            }
        }
    }

    applyViewportTransform({ animate = false } = {}) {
        const target = this.canvasStage || (typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null);
        const isIdentity = Math.abs(this.viewport.scale - 1) < 0.005 && Math.abs(this.viewport.x) < 0.5 && Math.abs(this.viewport.y) < 0.5;
        if (target && target.style) {
            if (this._stageTransitionTimer) {
                clearTimeout(this._stageTransitionTimer);
                this._stageTransitionTimer = null;
            }
            const shouldAnimate = Boolean(
                animate
                && !this.isPanning
                && !this.isPinching
                && !this._prefersReducedMotion()
                && typeof target.getAnimations === 'function'
            );
            if (shouldAnimate) {
                target.style.willChange = 'transform';
                target.style.transition = 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)';
                this._stageTransitionTimer = setTimeout(() => {
                    this._stageTransitionTimer = null;
                    if (target.style) {
                        target.style.transition = '';
                        if (!this.isPanning && !this.isPinching && !this._wheelWillChangeTimer) {
                            target.style.willChange = '';
                        }
                    }
                }, 200);
            } else {
                target.style.transition = '';
                if (!this.isPanning && !this.isPinching && !this._wheelWillChangeTimer) {
                    target.style.willChange = '';
                }
            }
            target.style.transform = (!this.isOpen && isIdentity)
                ? ''
                : `translate3d(${this.viewport.x}px, ${this.viewport.y}px, 0) scale(${this.viewport.scale})`;
        }
        const badge = typeof document !== 'undefined' ? document.getElementById('inpaintZoomBadge') : null;
        if (badge) {
            const pct = Math.round(this.viewport.scale * 100);
            badge.textContent = `${pct}%`;
            if (badge.classList) {
                badge.classList.toggle('opacity-60', isIdentity);
                badge.classList.toggle('hidden', isIdentity);
            }
        }
    }

    setZoom(nextScale, anchorClientX = null, anchorClientY = null, options = {}) {
        const clamped = Math.max(0.5, Math.min(6.0, nextScale));
        const prevScale = this.viewport.scale || 1;
        if (Math.abs(clamped - prevScale) < 0.001) return;

        const wrap = this.canvasWrap || document.getElementById('inpaintCanvasWrap');
        if (wrap && typeof wrap.getBoundingClientRect === 'function' && anchorClientX !== null && anchorClientY !== null) {
            const rect = wrap.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const ox = anchorClientX - cx;
                const oy = anchorClientY - cy;
                const ratio = clamped / prevScale;
                this.viewport.x = ox - (ox - this.viewport.x) * ratio;
                this.viewport.y = oy - (oy - this.viewport.y) * ratio;
            }
        }

        this.viewport.scale = clamped;
        if (Math.abs(clamped - 1) < 0.02 && Math.hypot(this.viewport.x, this.viewport.y) < 12) {
            this.viewport.scale = 1;
            this.viewport.x = 0;
            this.viewport.y = 0;
        }
        this.applyViewportTransform({ animate: options.animate !== false });
    }

    zoomIn() {
        this.setZoom(this.viewport.scale * 1.25, null, null, { animate: true });
    }

    zoomOut() {
        this.setZoom(this.viewport.scale / 1.25, null, null, { animate: true });
    }

    resetZoom(options = {}) {
        this.viewport = { scale: 1, x: 0, y: 0 };
        this.applyViewportTransform({ animate: !options.immediate });
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

        document.getElementById('inpaintBrushSize')?.addEventListener('input', e => {
            syncBrushSize(e.target.value);
            if (this.isActive()) this._showBrushSizePreviewRing(e.target.value);
        });
        document.getElementById('inpaintBrushSizeMobile')?.addEventListener('input', e => {
            syncBrushSize(e.target.value);
            if (this.isActive()) this._showBrushSizePreviewRing(e.target.value);
        });
        if (typeof document !== 'undefined') {
            document.querySelectorAll?.('[data-sketch-color]')?.forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.setSketchColor(btn.dataset.sketchColor);
                    this.setEyedropper(false);
                });
            });
            document.getElementById('inpaintSketchColorInput')?.addEventListener('input', (e) => {
                this.setSketchColor(e.target.value);
                this.setEyedropper(false);
            });
        }

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

        // Optional prompt sync (kept for backward compatibility with unit tests)
        const syncPromptFromInpaint = (val) => {
            const p = document.getElementById('inpaintPrompt');
            const pm = document.getElementById('inpaintPromptMobile');
            const mainP = document.getElementById('prompt');
            if (p && p.value !== val) p.value = val;
            if (pm && pm.value !== val) pm.value = val;
            if (this.isActive() && mainP && mainP.value !== val) {
                mainP.value = val;
            }
        };
        document.getElementById('inpaintPromptMobile')?.addEventListener('input', e => syncPromptFromInpaint(e.target.value));
        document.getElementById('inpaintPrompt')?.addEventListener('input', e => syncPromptFromInpaint(e.target.value));
        document.getElementById('prompt')?.addEventListener('input', e => {
            if (!this.isActive()) return;
            const val = e.target.value;
            const p = document.getElementById('inpaintPrompt');
            const pm = document.getElementById('inpaintPromptMobile');
            if (p && p.value !== val) p.value = val;
            if (pm && pm.value !== val) pm.value = val;
        });

        document.getElementById('inpaintBlurStrength')?.addEventListener('input', e => {
            const v = document.getElementById('inpaintBlurStrengthVal');
            if (v) v.textContent = e.target.value;
        });
        document.getElementById('inpaintFillTolerance')?.addEventListener('input', e => {
            const v = document.getElementById('inpaintFillToleranceVal');
            if (v) v.textContent = e.target.value;
        });

        // Keep #inpaintMaskCanvas overlay geometry synced 1:1 with #singleResultImg
        if (this.singleImg && typeof this.singleImg.addEventListener === 'function') {
            this.singleImg.addEventListener('load', () => {
                if (this.isActive()) this.syncOverlayGeometry();
            });
        }
        if (typeof ResizeObserver !== 'undefined' && this.singleImg) {
            try {
                this._resizeObserver = new ResizeObserver(() => {
                    if (this.isActive()) this.syncOverlayGeometry();
                });
                this._resizeObserver.observe(this.singleImg);
            } catch (_) {}
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('resize', () => {
                if (this.isActive()) this.syncOverlayGeometry();
            });
        }

        // Spacebar hold for quick desktop canvas panning + Ctrl+Z / Esc
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('keydown', (e) => {
                if (!this.isActive()) return;
                const tag = e.target?.tagName?.toUpperCase?.() || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                const key = (e.key || '').toLowerCase();
                if (e.code === 'Space') {
                    this._spacePressed = true;
                } else if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && key === 'z') || key === 'y')) {
                    e.preventDefault();
                    this.redo();
                } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
                    e.preventDefault();
                    this.undo();
                } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    if (key === 'b') this.setTool('brush');
                    else if (key === 'e') this.setTool('eraser');
                    else if (key === 'l') this.setTool('lasso');
                    else if (key === 'r') this.setTool('rect');
                    else if (key === 'h') this.setTool('move');
                    else if (key === 's') this.toggleSketchLayer();
                    else if (key === 'i') this.invertMask();
                    else if (e.key === '[' || e.key === ']') {
                        const slider = document.getElementById('inpaintBrushSize');
                        if (slider) {
                            const next = Math.max(5, Math.min(300, (parseInt(slider.value, 10) || 60) + (e.key === ']' ? 8 : -8)));
                            slider.value = String(next);
                            slider.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } else if (e.key === 'Escape') {
                        if (this.paramsPopoverOpen) {
                            this.toggleParamsPopover(false);
                        } else {
                            this.close();
                        }
                    }
                }
            });
            document.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    this._spacePressed = false;
                }
            });
        }

        // Wheel zoom on stage wrapper or maskCanvas (only when inpaint mode is active)
        const wheelTarget = this.canvasWrap || this.maskCanvas;
        if (wheelTarget && typeof wheelTarget.addEventListener === 'function') {
            wheelTarget.addEventListener('wheel', (e) => {
                if (!this.isActive()) return;
                e.preventDefault();
                this._setStageInteracting(true);
                const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
                this.setZoom(this.viewport.scale * factor, e.clientX, e.clientY, { animate: false });
                if (this._wheelWillChangeTimer) clearTimeout(this._wheelWillChangeTimer);
                this._wheelWillChangeTimer = setTimeout(() => {
                    this._wheelWillChangeTimer = null;
                    if (!this.isPanning && !this.isPinching) this._setStageInteracting(false);
                }, 180);
            }, { passive: false });
        }

        // Allow panning / pinching when touching the surround outside the image while active
        if (this.canvasWrap && typeof this.canvasWrap.addEventListener === 'function') {
            this.canvasWrap.addEventListener('pointerdown', (e) => {
                if (!this.isActive()) return;
                if (e.target !== this.canvasWrap && e.target !== this.canvasStage) return;
                e.preventDefault();
                if (this.paramsPopoverOpen) this.toggleParamsPopover(false);
                const pid = e.pointerId ?? 0;
                this.activePointers.set(pid, { clientX: e.clientX, clientY: e.clientY });
                try { this.canvasWrap.setPointerCapture?.(pid); } catch (_) {}

                if (this.activePointers.size >= 2) {
                    this._startPinchGesture();
                } else {
                    this.isPanning = true;
                    this._setStageInteracting(true);
                    this.panStart = {
                        x: e.clientX - this.viewport.x,
                        y: e.clientY - this.viewport.y
                    };
                }
            });

            this.canvasWrap.addEventListener('pointermove', (e) => {
                if (!this.isActive()) return;
                const pid = e.pointerId ?? 0;
                if (!this.activePointers.has(pid)) return;
                if (e.target === this.maskCanvas && !this.isPinching && !this.isPanning) return;
                this.activePointers.set(pid, { clientX: e.clientX, clientY: e.clientY });
                if (this.isPinching && this.activePointers.size >= 2) {
                    this._updatePinchGesture();
                } else if (this.isPanning) {
                    this.viewport.x = e.clientX - this.panStart.x;
                    this.viewport.y = e.clientY - this.panStart.y;
                    this.applyViewportTransform();
                }
            });

            const endWrapPointer = (e) => {
                const pid = e?.pointerId ?? 0;
                this.activePointers.delete(pid);
                try { this.canvasWrap.releasePointerCapture?.(pid); } catch (_) {}
                if (this.activePointers.size < 2) this.isPinching = false;
                if (this.activePointers.size === 0) {
                    this.isPanning = false;
                    this._setStageInteracting(false);
                }
            };
            this.canvasWrap.addEventListener('pointerup', endWrapPointer);
            this.canvasWrap.addEventListener('pointercancel', endWrapPointer);
        }

        if (!this.maskCanvas || typeof this.maskCanvas.addEventListener !== 'function') return;

        // Unified Pointer Events on maskCanvas (supports 1-finger draw, move-mode pan, and 2-finger pinch-zoom/pan)
        this.maskCanvas.addEventListener('pointerdown', e => {
            e.preventDefault?.();
            if (this.paramsPopoverOpen) {
                this.toggleParamsPopover(false);
            }
            const pid = e.pointerId ?? 0;
            this.activePointers.set(pid, { clientX: e.clientX, clientY: e.clientY });

            try {
                this.maskCanvas.setPointerCapture?.(pid);
            } catch (_) {}

            // 2-finger pinch-zoom / pan takeover (rollback tiny accidental 1-finger dot)
            if (this.activePointers.size >= 2) {
                this._strokeCoalescer.cancel();
                this._hideTouchLoupe();
                this._lassoPoints = [];
                this._rectStart = null;
                this._rectEnd = null;
                this._clearSelectionPreview();
                if (this.drawing && (Date.now() - this._strokeStartTime < 200) && this._strokeMovedDist < 14) {
                    this.undo();
                }
                this.drawing = false;
                this.lastPos = null;
                this._startPinchGesture();
                if (this.brushCursor) this.brushCursor.classList.add('hidden');
                return;
            }

            // Single-pointer Pan Mode (Move tool, Spacebar held, or Middle mouse button)
            if (this.tool === 'move' || this._spacePressed || e.button === 1) {
                this.isPanning = true;
                this._setStageInteracting(true);
                this.panStart = {
                    x: e.clientX - this.viewport.x,
                    y: e.clientY - this.viewport.y
                };
                return;
            }

            // Touch Eyedropper mode for Sketch color picking
            if (this.eyedropperActive) {
                const pos = this._getCanvasPos(e);
                this.drawing = true;
                this._sampleCanvasColorAt(pos);
                if (e.pointerType === 'touch') {
                    this._updateTouchLoupe(pos, e.clientX, e.clientY);
                }
                return;
            }

            // Restore full mask visibility as soon as user starts painting
            if (this.layerMode === 'mask') {
                if (this.maskHidden) {
                    this.toggleMaskVisibility(false);
                } else if (this.maskPeek) {
                    this.setMaskPeek(false);
                }
            }

            if (this.layerMode === 'mask' && this.tool === 'fill') {
                const pos = this._getCanvasPos(e);
                const tolerance = parseInt(document.getElementById('inpaintFillTolerance')?.value || 15);
                this.saveMaskState();
                this._floodFill(pos.x, pos.y, tolerance);
                return;
            }

            const pos = this._getCanvasPos(e);

            if (this.layerMode === 'mask' && this.tool === 'lasso') {
                this.drawing = true;
                this._strokeStartTime = Date.now();
                this._strokeMovedDist = 0;
                this.lastPos = pos;
                this._lassoPoints = [pos];
                this._renderSelectionPreview();
                if (e.pointerType === 'touch') this._updateTouchLoupe(pos, e.clientX, e.clientY);
                return;
            }

            if (this.layerMode === 'mask' && this.tool === 'rect') {
                this.drawing = true;
                this._strokeStartTime = Date.now();
                this._strokeMovedDist = 0;
                this.lastPos = pos;
                this._rectStart = pos;
                this._rectEnd = pos;
                this._renderSelectionPreview();
                if (e.pointerType === 'touch') this._updateTouchLoupe(pos, e.clientX, e.clientY);
                return;
            }

            this.drawing = true;
            this._strokeStartTime = Date.now();
            this._strokeMovedDist = 0;
            if (this.layerMode === 'sketch') {
                this._saveSketchState();
            } else {
                this.saveMaskState();
            }
            this.lastPos = pos;
            if (this.layerMode === 'mask' && this.tool === 'blur') {
                const intensity = parseInt(document.getElementById('inpaintBlurStrength')?.value || 50);
                this._blurMask(pos, Math.max(2, this.getBrushSize() / 2), intensity);
            } else {
                this._drawDotOrStart(pos);
            }
            if (e.pointerType === 'touch') {
                this._updateTouchLoupe(pos, e.clientX, e.clientY);
            }
        });

        this.maskCanvas.addEventListener('pointermove', e => {
            const pid = e.pointerId ?? 0;
            if (this.activePointers.has(pid)) {
                this.activePointers.set(pid, { clientX: e.clientX, clientY: e.clientY });
            }

            if (this.isPinching && this.activePointers.size >= 2) {
                this._updatePinchGesture();
                return;
            }

            if (this.isPanning) {
                this.viewport.x = e.clientX - this.panStart.x;
                this.viewport.y = e.clientY - this.panStart.y;
                this.applyViewportTransform();
                return;
            }

            if (e.pointerType !== 'touch') {
                this._updateCursor(e);
            }
            if (!this.drawing) return;

            const pos = this._getCanvasPos(e);
            if (this.eyedropperActive) {
                this._sampleCanvasColorAt(pos);
                if (e.pointerType === 'touch') this._updateTouchLoupe(pos, e.clientX, e.clientY);
                return;
            }

            if (this.layerMode === 'mask' && this.tool === 'lasso') {
                const prev = this._lassoPoints[this._lassoPoints.length - 1];
                if (!prev || Math.hypot(pos.x - prev.x, pos.y - prev.y) >= 2) {
                    this._lassoPoints.push(pos);
                    if (prev) this._strokeMovedDist += Math.hypot(pos.x - prev.x, pos.y - prev.y);
                    this._renderSelectionPreview();
                }
                if (e.pointerType === 'touch') this._updateTouchLoupe(pos, e.clientX, e.clientY);
                this.lastPos = pos;
                return;
            }

            if (this.layerMode === 'mask' && this.tool === 'rect') {
                if (this._rectStart) {
                    this._rectEnd = pos;
                    this._strokeMovedDist = Math.hypot(pos.x - this._rectStart.x, pos.y - this._rectStart.y);
                    this._renderSelectionPreview();
                }
                if (e.pointerType === 'touch') this._updateTouchLoupe(pos, e.clientX, e.clientY);
                this.lastPos = pos;
                return;
            }

            if (this.layerMode === 'mask' && this.tool === 'blur') {
                const intensity = parseInt(document.getElementById('inpaintBlurStrength')?.value || 50);
                this._blurMask(pos, Math.max(2, this.getBrushSize() / 2), intensity);
                this.lastPos = pos;
            } else {
                this._strokeCoalescer.enqueue(e, (ev) => this._getCanvasPos(ev));
            }
            if (e.pointerType === 'touch') {
                this._updateTouchLoupe(pos, e.clientX, e.clientY);
            }
        });

        const stopDrawing = (e) => {
            const pid = e?.pointerId ?? 0;
            this.activePointers.delete(pid);
            if (e && e.pointerId !== undefined) {
                try {
                    this.maskCanvas.releasePointerCapture?.(e.pointerId);
                } catch (_) {}
            }

            if (this.activePointers.size < 2) {
                this.isPinching = false;
                this.pinchStart = null;
            }
            if (this.activePointers.size === 0) {
                if (this.eyedropperActive && this.drawing) {
                    this.setEyedropper(false);
                } else if (this.drawing && this.layerMode === 'mask' && this.tool === 'lasso') {
                    this._clearSelectionPreview();
                    if (this._lassoPoints.length >= 3) {
                        this.saveMaskState();
                        rasterizePolygon(this.maskCtx, this._lassoPoints);
                    }
                    this._lassoPoints = [];
                } else if (this.drawing && this.layerMode === 'mask' && this.tool === 'rect') {
                    this._clearSelectionPreview();
                    if (this._rectStart && this._rectEnd) {
                        const dx = Math.abs(this._rectEnd.x - this._rectStart.x);
                        const dy = Math.abs(this._rectEnd.y - this._rectStart.y);
                        if (dx >= 2 && dy >= 2) {
                            this.saveMaskState();
                            rasterizeRect(this.maskCtx, this._rectStart, this._rectEnd);
                        }
                    }
                    this._rectStart = null;
                    this._rectEnd = null;
                } else {
                    this._strokeCoalescer.flush();
                }
                this._hideTouchLoupe();
                this.isPanning = false;
                this.drawing = false;
                this.lastPos = null;
                this._setStageInteracting(false);
            }
        };

        this.maskCanvas.addEventListener('pointerup', stopDrawing);
        this.maskCanvas.addEventListener('pointercancel', stopDrawing);

        this.maskCanvas.addEventListener('mouseleave', () => {
            if (!this.drawing && this.brushCursor) {
                this.brushCursor.classList.add('hidden');
            }
        });
    }

    _startPinchGesture() {
        const pts = Array.from(this.activePointers.values());
        if (pts.length < 2) return;
        const dx = pts[1].clientX - pts[0].clientX;
        const dy = pts[1].clientY - pts[0].clientY;
        const dist = Math.max(10, Math.hypot(dx, dy));
        const midX = (pts[0].clientX + pts[1].clientX) / 2;
        const midY = (pts[0].clientY + pts[1].clientY) / 2;
        this.isPinching = true;
        this.isPanning = false;
        this._setStageInteracting(true);
        this.pinchStart = {
            dist,
            midX,
            midY,
            scale: this.viewport.scale,
            x: this.viewport.x,
            y: this.viewport.y
        };
    }

    _updatePinchGesture() {
        if (!this.pinchStart) return;
        const pts = Array.from(this.activePointers.values());
        if (pts.length < 2) return;
        const dx = pts[1].clientX - pts[0].clientX;
        const dy = pts[1].clientY - pts[0].clientY;
        const dist = Math.max(10, Math.hypot(dx, dy));
        const midX = (pts[0].clientX + pts[1].clientX) / 2;
        const midY = (pts[0].clientY + pts[1].clientY) / 2;

        const nextScale = Math.max(0.5, Math.min(6.0, this.pinchStart.scale * (dist / this.pinchStart.dist)));
        const ratio = nextScale / this.pinchStart.scale;

        const wrap = this.canvasWrap || document.getElementById('inpaintCanvasWrap');
        let cx = 0;
        let cy = 0;
        if (wrap && typeof wrap.getBoundingClientRect === 'function') {
            const rect = wrap.getBoundingClientRect();
            cx = rect.left + rect.width / 2;
            cy = rect.top + rect.height / 2;
        }
        const ox = this.pinchStart.midX - cx;
        const oy = this.pinchStart.midY - cy;

        this.viewport.scale = nextScale;
        this.viewport.x = (ox - (ox - this.pinchStart.x) * ratio) + (midX - this.pinchStart.midX);
        this.viewport.y = (oy - (oy - this.pinchStart.y) * ratio) + (midY - this.pinchStart.midY);
        this.applyViewportTransform();
    }

    _updateCursor(e) {
        if (!this.brushCursor || this.tool === 'move' || this._spacePressed) {
            if (this.brushCursor) this.brushCursor.classList.add('hidden');
            return;
        }
        const rect = this.maskCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const scaleX = this.maskCanvas.width / rect.width;
        const visualBs = Math.max(4, this.getBrushSize() / scaleX);

        const baseCursorPx = 32;
        const brushScale = Math.max(0.125, visualBs / baseCursorPx);
        const rAF = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : setTimeout);
        const cancelRAF = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : (typeof window !== 'undefined' && window.cancelAnimationFrame ? window.cancelAnimationFrame : clearTimeout);

        if (this._cursorRaf) cancelRAF(this._cursorRaf);
        this._cursorRaf = rAF(() => {
            if (typeof this.brushCursor.style?.setProperty === 'function') {
                this.brushCursor.style.setProperty('--brush-scale', brushScale.toFixed(4));
            } else if (this.brushCursor.style) {
                this.brushCursor.style.width = `${visualBs}px`;
                this.brushCursor.style.height = `${visualBs}px`;
            }
            this.brushCursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
            this.brushCursor.classList.remove('hidden');
        });
    }

    toggleDrawer(forceState) {
        const drawer = document.getElementById('inpaintMobileDrawer');
        const label = document.getElementById('drawerToggleLabel');
        if (drawer) {
            const isExpanded = typeof forceState === 'boolean'
                ? (drawer.classList.toggle('expanded', forceState), forceState)
                : drawer.classList.toggle('expanded');
            if (label) {
                label.textContent = isExpanded ? '收起 ▼' : '展开 ▲';
            }
        }
    }

    open(options = {}) {
        const imgEl = this.singleImg || document.getElementById('singleResultImg');
        const targetSrc = options.imageSrc || (imgEl ? imgEl.src : '');

        if (!targetSrc) {
            if (typeof alert === 'function') alert('请先生成或选择一张图片');
            return;
        }

        if (options.imageSrc && imgEl) {
            imgEl.src = options.imageSrc;
            if (typeof window !== 'undefined') {
                window.lastSelectedImageUrl = options.imageSrc;
            }
        }
        this.originalImgSrc = targetSrc;
        this.hasGeneratedInSession = false;

        // Close outpaint or charPositionStage if open so main workspace canvas stays mutually exclusive
        const outpaintArea = document.getElementById('outpaintArea');
        if (outpaintArea && !outpaintArea.classList.contains('hidden') && typeof window !== 'undefined' && window.outpaintEditor) {
            window.outpaintEditor.close();
        }
        if (typeof window !== 'undefined' && window.charPromptManager?.isOpen) {
            window.charPromptManager.closeStage();
        }
        if (typeof document !== 'undefined' && document.body?.classList) {
            document.body.classList.add('inpaint-active');
        }

        if (this.ui && this.ui.currentRightView !== 'preview' && typeof this.ui.switchRightView === 'function') {
            this.ui.switchRightView('preview');
        }

        const singleArea = document.getElementById('singleResultArea');
        const placeholder = document.getElementById('placeholder');
        if (singleArea?.classList) singleArea.classList.remove('hidden');
        if (placeholder?.classList) placeholder.classList.add('hidden');

        const mainPrompt = document.getElementById('prompt')?.value || '';
        const inpaintPrompt = document.getElementById('inpaintPrompt');
        const inpaintPromptMobile = document.getElementById('inpaintPromptMobile');
        if (inpaintPrompt) inpaintPrompt.value = mainPrompt;
        if (inpaintPromptMobile) inpaintPromptMobile.value = mainPrompt;

        this.showQuickRetryBar(false);
        this.toggleParamsPopover(false);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.imgNaturalW = img.naturalWidth || img.width || 512;
            this.imgNaturalH = img.naturalHeight || img.height || 512;
            this._fitCanvasToContainer(img);
            this.history = [];
            this.redoHistory = [];
            this.sketchHistory = [];
            this.sketchRedoHistory = [];
            this.sketchDirty = false;
            this.eyedropperActive = false;
            this._lassoPoints = [];
            this._rectStart = null;
            this._rectEnd = null;
            this.activePointers.clear();
            this.isOpen = true;
            this.maskHidden = false;
            this.setMaskPeek(false);

            if (this.maskCanvas?.classList) {
                this.maskCanvas.classList.remove('hidden', 'pointer-events-none', 'mask-hidden', 'mask-peek');
            }
            if (this.sketchCanvas?.classList) {
                this.sketchCanvas.classList.remove('hidden');
            }
            if (this.selPreviewCanvas?.classList) {
                this.selPreviewCanvas.classList.remove('hidden');
            }
            if (this.canvasWrap?.classList) {
                this.canvasWrap.classList.add('inpaint-live');
            }

            this.syncOverlayGeometry();
            const pv = this.ui?.previewViewport?.getState?.();
            if (pv && pv.scale > 1.02) {
                this.viewport = { scale: pv.scale, x: pv.x, y: pv.y };
                this.applyViewportTransform({ animate: false });
            } else {
                this.resetZoom({ immediate: true });
            }
            this.setLayerMode(options.layerMode === 'sketch' ? 'sketch' : 'mask');
            this._syncToggleBtnState();
            this._syncRevertOrigBtnVisibility();
            this._syncRestoreBtnVisibility();
            this.toggleMaskVisibility(false);

            if (options.restoreMask && this.hasRestorableMask()) {
                this.restoreLastMask(false);
            }

            this._setModalVisible(true);
            const deskText = document.getElementById('deskBtnText');
            if (deskText) deskText.textContent = '确认局部重绘';
            if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();
        };
        img.src = this.originalImgSrc;
    }

    close() {
        this.isOpen = false;
        this.history = [];
        this.redoHistory = [];
        this.sketchHistory = [];
        this.sketchRedoHistory = [];
        this.sketchDirty = false;
        this.eyedropperActive = false;
        this._lassoPoints = [];
        this._rectStart = null;
        this._rectEnd = null;
        this._strokeCoalescer?.cancel?.();
        this._clearSelectionPreview();
        this._hideTouchLoupe();
        if (this._brushRingTimer) {
            clearTimeout(this._brushRingTimer);
            this._brushRingTimer = null;
        }
        document.getElementById('brushSizePreviewRing')?.classList?.add('hidden');
        document.getElementById('inpaintSketchPalette')?.classList?.add('hidden');
        if (typeof document !== 'undefined' && document.body?.classList) {
            document.body.classList.remove('inpaint-active');
        }
        this.drawing = false;
        this.isPanning = false;
        this.isPinching = false;
        this.hasGeneratedInSession = false;
        this.activePointers.clear();
        this.toggleParamsPopover(false);

        if (this.maskCanvas?.classList) {
            this.maskCanvas.classList.add('hidden', 'pointer-events-none');
            this.maskCanvas.classList.remove('mask-peek', 'mask-hidden');
        }
        if (this.sketchCanvas?.classList) {
            this.sketchCanvas.classList.add('hidden');
        }
        if (this.selPreviewCanvas?.classList) {
            this.selPreviewCanvas.classList.add('hidden');
        }
        if (this.canvasWrap?.classList) {
            this.canvasWrap.classList.remove('inpaint-live');
        }
        if (this._wheelWillChangeTimer) {
            clearTimeout(this._wheelWillChangeTimer);
            this._wheelWillChangeTimer = null;
        }
        this._setStageInteracting(false);
        this.resetZoom({ immediate: true });
        this.ui?.previewViewport?.reset?.();
        this._syncToggleBtnState();
        this._syncRevertOrigBtnVisibility();

        this._setModalVisible(false);
        if (this.brushCursor) this.brushCursor.classList.add('hidden');
        if (this._cursorRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._cursorRaf);
        }
        if (this.ui && typeof this.ui.updateGenerateButtonText === 'function') {
            this.ui.updateGenerateButtonText();
        }
    }

    setTool(tool) {
        if ((tool === 'lasso' || tool === 'rect') && this.layerMode === 'sketch') {
            this.setLayerMode('mask');
        }
        this.tool = tool;
        const toolButtons = [
            ['inpaintBrushBtn', tool === 'brush'],
            ['inpaintEraserBtn', tool === 'eraser'],
            ['inpaintLassoBtn', tool === 'lasso'],
            ['inpaintRectBtn', tool === 'rect'],
            ['inpaintMoveBtn', tool === 'move'],
            ['inpaintBlurBtn', tool === 'blur'],
            ['inpaintFillBtn', tool === 'fill']
        ];
        for (const [id, active] of toolButtons) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            btn.classList?.toggle('tool-active', active);
            btn.setAttribute?.('aria-pressed', active ? 'true' : 'false');
        }
        if (this.maskCanvas && this.maskCanvas.style) {
            this.maskCanvas.style.cursor = tool === 'move' ? 'grab' : (tool === 'lasso' || tool === 'rect' || this.eyedropperActive ? 'crosshair' : 'none');
        }
        const blurWrap = document.getElementById('blurStrengthWrap');
        if (blurWrap) this._setSubControlVisible(blurWrap, tool === 'blur', { displayFlex: true });
        const fillWrap = document.getElementById('fillToleranceWrap');
        if (fillWrap) this._setSubControlVisible(fillWrap, tool === 'fill', { displayFlex: true });
    }

    getBrushSize() {
        return parseInt(document.getElementById('inpaintBrushSize')?.value || 50);
    }

    _extractCurrentAlpha() {
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        if (!w || !h) return null;
        const imageData = this.maskCtx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const alpha = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            alpha[j] = (data[i + 3] === 255 && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) ? 0 : data[i + 3];
        }
        return { width: w, height: h, alpha };
    }

    _writeAlphaToMask(alpha, srcW, srcH) {
        const dstW = this.maskCanvas.width;
        const dstH = this.maskCanvas.height;
        if (!dstW || !dstH || !alpha) return;

        let imgData;
        if (this.maskCtx.createImageData) {
            imgData = this.maskCtx.createImageData(srcW, srcH);
        } else if (typeof ImageData !== 'undefined') {
            imgData = new ImageData(srcW, srcH);
        } else {
            imgData = { width: srcW, height: srcH, data: new Uint8ClampedArray(srcW * srcH * 4) };
        }

        const data = imgData.data;
        for (let j = 0, i = 0; j < alpha.length; j++, i += 4) {
            const a = alpha[j];
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = a;
        }

        if (srcW === dstW && srcH === dstH) {
            this.maskCtx.putImageData(imgData, 0, 0);
        } else {
            const tmp = document.createElement('canvas');
            tmp.width = srcW;
            tmp.height = srcH;
            const tCtx = tmp.getContext('2d');
            tCtx.putImageData(imgData, 0, 0);
            this.maskCtx.clearRect(0, 0, dstW, dstH);
            this.maskCtx.drawImage(tmp, 0, 0, dstW, dstH);
        }
    }

    saveMaskState() {
        const extracted = this._extractCurrentAlpha();
        if (!extracted) return;
        this.history.push(extracted);
        if (this.history.length > 20) this.history.shift();
        this.redoHistory = [];
    }

    _saveSketchState() {
        if (!this.sketchCanvas || !this.sketchCtx) return;
        try {
            const w = this.sketchCanvas.width;
            const h = this.sketchCanvas.height;
            if (!w || !h) return;
            const imgData = this.sketchCtx.getImageData(0, 0, w, h);
            if (!imgData?.data) return;
            this.sketchHistory.push({
                width: w,
                height: h,
                data: new Uint8ClampedArray(imgData.data)
            });
            if (this.sketchHistory.length > 20) this.sketchHistory.shift();
            this.sketchRedoHistory = [];
        } catch (_) {}
    }

    _restoreSketchSnapshot(snap) {
        if (!snap || !this.sketchCtx || !this.sketchCanvas) return;
        const w = snap.width || this.sketchCanvas.width;
        const h = snap.height || this.sketchCanvas.height;
        const imgData = this.sketchCtx.createImageData(w, h);
        imgData.data.set(snap.data);
        this.sketchCtx.putImageData(imgData, 0, 0);
        this.sketchDirty = this._hasSketchContent();
    }

    undo() {
        if (this.layerMode === 'sketch' && this.sketchHistory.length > 0) {
            try {
                const w = this.sketchCanvas.width;
                const h = this.sketchCanvas.height;
                const cur = this.sketchCtx.getImageData(0, 0, w, h);
                if (cur?.data) {
                    this.sketchRedoHistory.push({ width: w, height: h, data: new Uint8ClampedArray(cur.data) });
                    if (this.sketchRedoHistory.length > 20) this.sketchRedoHistory.shift();
                }
            } catch (_) {}
            const prev = this.sketchHistory.pop();
            this._restoreSketchSnapshot(prev);
            return;
        }
        if (this.history.length === 0) return;
        const current = this._extractCurrentAlpha();
        if (current) {
            this.redoHistory.push(current);
            if (this.redoHistory.length > 20) this.redoHistory.shift();
        }
        const state = this.history.pop();
        if (this.maskPeek) this.setMaskPeek(false);
        if (typeof ImageData !== 'undefined' && state instanceof ImageData) {
            this.maskCtx.putImageData(state, 0, 0);
            return;
        }
        if (state && state.alpha) {
            const w = state.width || this.maskCanvas.width;
            const h = state.height || this.maskCanvas.height;
            this._writeAlphaToMask(state.alpha, w, h);
        }
    }

    redo() {
        if (this.layerMode === 'sketch' && this.sketchRedoHistory.length > 0) {
            try {
                const w = this.sketchCanvas.width;
                const h = this.sketchCanvas.height;
                const cur = this.sketchCtx.getImageData(0, 0, w, h);
                if (cur?.data) {
                    this.sketchHistory.push({ width: w, height: h, data: new Uint8ClampedArray(cur.data) });
                    if (this.sketchHistory.length > 20) this.sketchHistory.shift();
                }
            } catch (_) {}
            const next = this.sketchRedoHistory.pop();
            this._restoreSketchSnapshot(next);
            return;
        }
        if (this.redoHistory.length === 0) return;
        const current = this._extractCurrentAlpha();
        if (current) {
            this.history.push(current);
            if (this.history.length > 20) this.history.shift();
        }
        const state = this.redoHistory.pop();
        if (this.maskPeek) this.setMaskPeek(false);
        if (state && state.alpha) {
            const w = state.width || this.maskCanvas.width;
            const h = state.height || this.maskCanvas.height;
            this._writeAlphaToMask(state.alpha, w, h);
        }
    }

    invertMask() {
        if (!this.maskCtx || !this.maskCanvas) return;
        this.saveMaskState();
        invertMaskCanvas(this.maskCtx, this.maskCanvas.width, this.maskCanvas.height);
        this.setMaskPeek(false);
    }

    growMask(radiusPx = 8) {
        if (!this.maskCtx || !this.maskCanvas) return;
        this.saveMaskState();
        dilateMaskCanvas(this.maskCtx, this.maskCanvas.width, this.maskCanvas.height, radiusPx);
        this.setMaskPeek(false);
    }

    setLayerMode(mode = 'mask') {
        const next = mode === 'sketch' ? 'sketch' : 'mask';
        this.layerMode = next;
        const sketchBtn = document.getElementById('inpaintSketchBtn');
        if (sketchBtn) {
            sketchBtn.classList?.toggle('tool-active', next === 'sketch');
            sketchBtn.setAttribute?.('aria-pressed', next === 'sketch' ? 'true' : 'false');
        }
        const palette = document.getElementById('inpaintSketchPalette');
        if (palette) {
            palette.classList?.toggle('hidden', next !== 'sketch');
        }
        if (next === 'sketch' && (this.tool === 'move' || this.tool === 'lasso' || this.tool === 'rect')) {
            this.setTool('brush');
        }
        if (next !== 'sketch') {
            this.setEyedropper(false);
        }
    }

    toggleSketchLayer() {
        this.setLayerMode(this.layerMode === 'sketch' ? 'mask' : 'sketch');
    }

    setSketchColor(color) {
        if (!color) return;
        this.sketchColor = color;
        const picker = document.getElementById('inpaintSketchColorInput');
        if (picker && /^#[0-9a-fA-F]{6}$/.test(color)) picker.value = color;
        document.querySelectorAll?.('[data-sketch-color]')?.forEach((btn) => {
            btn.classList?.toggle('active', (btn.dataset.sketchColor || '').toLowerCase() === color.toLowerCase());
        });
    }

    setEyedropper(active) {
        this.eyedropperActive = Boolean(active);
        const btn = document.getElementById('inpaintEyedropperBtn');
        if (btn) {
            btn.classList?.toggle('tool-active', this.eyedropperActive);
            btn.setAttribute?.('aria-pressed', this.eyedropperActive ? 'true' : 'false');
        }
        if (this.maskCanvas?.style) {
            this.maskCanvas.style.cursor = this.eyedropperActive ? 'crosshair' : (this.tool === 'move' ? 'grab' : 'none');
        }
    }

    toggleEyedropper() {
        this.setEyedropper(!this.eyedropperActive);
    }

    clearSketch() {
        if (!this.sketchCtx || !this.sketchCanvas) return;
        this._saveSketchState();
        this.sketchCtx.clearRect(0, 0, this.sketchCanvas.width, this.sketchCanvas.height);
        this.sketchDirty = false;
    }

    _hasSketchContent() {
        if (!this.sketchCtx || !this.sketchCanvas || !this.sketchCanvas.width || !this.sketchCanvas.height) {
            return false;
        }
        try {
            const data = this.sketchCtx.getImageData(0, 0, this.sketchCanvas.width, this.sketchCanvas.height).data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 10) return true;
            }
        } catch (_) {}
        return false;
    }

    _sampleCanvasColorAt(pos) {
        if (!pos) return null;
        const x = Math.max(0, Math.min((this.maskCanvas?.width || 1) - 1, Math.round(pos.x)));
        const y = Math.max(0, Math.min((this.maskCanvas?.height || 1) - 1, Math.round(pos.y)));
        const readPx = (ctx) => {
            try {
                const px = ctx?.getImageData?.(x, y, 1, 1)?.data;
                return px && px.length >= 4 ? px : null;
            } catch (_) {
                return null;
            }
        };
        let px = this.sketchCtx ? readPx(this.sketchCtx) : null;
        if (!px || px[3] <= 20) {
            px = this.baseCtx ? readPx(this.baseCtx) : null;
        }
        if (!px) return null;
        const toHex = (n) => Number(n || 0).toString(16).padStart(2, '0');
        const hex = `#${toHex(px[0])}${toHex(px[1])}${toHex(px[2])}`;
        this.setSketchColor(hex);
        return hex;
    }

    _flushStrokePoints(points) {
        if (!this.drawing || !Array.isArray(points) || points.length === 0) return;
        for (const pos of points) {
            if (this.lastPos) {
                this._strokeMovedDist += Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y);
                this._drawStroke(this.lastPos, pos);
            } else {
                this._drawDotOrStart(pos);
            }
            this.lastPos = pos;
        }
    }

    _renderSelectionPreview() {
        const ctx = this.selPreviewCtx;
        const canvas = this.selPreviewCanvas;
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, (canvas.width || 512) / 260);
        ctx.setLineDash?.([8, 6]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        if (this.tool === 'lasso' && this._lassoPoints.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(this._lassoPoints[0].x, this._lassoPoints[0].y);
            for (let i = 1; i < this._lassoPoints.length; i++) {
                ctx.lineTo(this._lassoPoints[i].x, this._lassoPoints[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (this.tool === 'rect' && this._rectStart && this._rectEnd) {
            const x = Math.min(this._rectStart.x, this._rectEnd.x);
            const y = Math.min(this._rectStart.y, this._rectEnd.y);
            const w = Math.abs(this._rectEnd.x - this._rectStart.x);
            const h = Math.abs(this._rectEnd.y - this._rectStart.y);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
    }

    _clearSelectionPreview() {
        if (this.selPreviewCtx && this.selPreviewCanvas) {
            this.selPreviewCtx.clearRect(0, 0, this.selPreviewCanvas.width, this.selPreviewCanvas.height);
        }
    }

    _updateTouchLoupe(pos, clientX, clientY) {
        if (typeof document === 'undefined') return;
        const loupe = document.getElementById('canvasTouchLoupe');
        const loupeCanvas = document.getElementById('canvasTouchLoupeCanvas');
        if (!loupe) return;
        const vw = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 400;
        if (loupe.style) {
            loupe.style.left = `${Math.max(54, Math.min(vw - 54, clientX))}px`;
            loupe.style.top = `${Math.max(58, clientY - 96)}px`;
        }
        loupe.classList?.remove('hidden');
        const ctx = loupeCanvas?.getContext?.('2d');
        if (ctx && this.baseCanvas && pos) {
            const srcSize = 40;
            const half = srcSize / 2;
            const sx = pos.x - half;
            const sy = pos.y - half;
            ctx.clearRect(0, 0, 96, 96);
            ctx.drawImage(this.baseCanvas, sx, sy, srcSize, srcSize, 0, 0, 96, 96);
            if (this.sketchCanvas && this._hasSketchContent()) {
                ctx.drawImage(this.sketchCanvas, sx, sy, srcSize, srcSize, 0, 0, 96, 96);
            }
            ctx.strokeStyle = this.layerMode === 'sketch' ? this.sketchColor : '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(48, 48, 8, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    _hideTouchLoupe() {
        if (typeof document !== 'undefined') {
            document.getElementById('canvasTouchLoupe')?.classList?.add('hidden');
        }
    }

    _showBrushSizePreviewRing(sizeVal) {
        if (typeof document === 'undefined') return;
        const ring = document.getElementById('brushSizePreviewRing');
        if (!ring) return;
        const rect = this.maskCanvas?.getBoundingClientRect?.();
        const displayScale = (rect && rect.width > 0 && this.maskCanvas?.width > 0)
            ? (rect.width / this.maskCanvas.width)
            : 1;
        const px = Math.min(280, Math.max(8, Math.round(Number(sizeVal || this.getBrushSize()) * displayScale)));
        if (ring.style) {
            ring.style.width = `${px}px`;
            ring.style.height = `${px}px`;
        }
        ring.classList?.remove('hidden');
        if (this._brushRingTimer) clearTimeout(this._brushRingTimer);
        this._brushRingTimer = setTimeout(() => {
            this._brushRingTimer = null;
            ring.classList?.add('hidden');
        }, 650);
    }

    clearMask() {
        this.saveMaskState();
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.setMaskPeek(false);

        // If user already generated a new inpaint result in this session and clicks Clear Mask,
        // commit the currently displayed result on #singleResultImg as the new base image!
        if (this.isOpen && this.hasGeneratedInSession) {
            const imgEl = this.singleImg || (typeof document !== 'undefined' ? document.getElementById('singleResultImg') : null);
            const currentDisplayedSrc = imgEl?.src || '';
            if (currentDisplayedSrc && currentDisplayedSrc !== this.originalImgSrc) {
                this.originalImgSrc = currentDisplayedSrc;
                this.hasGeneratedInSession = false;
                this._syncRevertOrigBtnVisibility();
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const newW = img.naturalWidth || img.width || this.imgNaturalW;
                    const newH = img.naturalHeight || img.height || this.imgNaturalH;
                    if (newW > 0 && newH > 0) {
                        this.imgNaturalW = newW;
                        this.imgNaturalH = newH;
                        this.baseCanvas.width = newW;
                        this.baseCanvas.height = newH;
                        if (this.maskCanvas.width !== newW || this.maskCanvas.height !== newH) {
                            this.maskCanvas.width = newW;
                            this.maskCanvas.height = newH;
                        }
                        this.baseCtx.drawImage(img, 0, 0, newW, newH);
                        this.syncOverlayGeometry();
                    }
                };
                img.src = currentDisplayedSrc;
            }
        }
    }

    /**
     * Reverts #singleResultImg back to the pre-inpaint base image while keeping the painted mask intact.
     */
    revertToOriginalImage() {
        if (!this.originalImgSrc) return false;
        const imgEl = this.singleImg || (typeof document !== 'undefined' ? document.getElementById('singleResultImg') : null);
        if (imgEl) {
            imgEl.src = this.originalImgSrc;
        }
        if (typeof window !== 'undefined') {
            window.lastSelectedImageUrl = this.originalImgSrc;
        }
        this.hasGeneratedInSession = false;
        this.setMaskPeek(false);
        this._syncRevertOrigBtnVisibility();
        this.syncOverlayGeometry();
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast('已还原重绘前原图，涂抹区域已保留', 'info');
        }
        return true;
    }

    /**
     * Restores the mask from the previous inpaint session onto the active maskCanvas.
     */
    restoreLastMask(saveUndo = true) {
        if (!this.hasRestorableMask()) {
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('暂无可恢复的上次涂抹蒙版', 'info');
            }
            return false;
        }
        if (saveUndo) {
            this.saveMaskState();
        }
        this._writeAlphaToMask(this.lastSession.maskAlpha, this.lastSession.width, this.lastSession.height);
        this.setMaskPeek(false);
        if (saveUndo && typeof window !== 'undefined' && window.showToast) {
            window.showToast('已恢复上次涂抹区域', 'success');
        }
        return true;
    }

    /**
     * Reverts to the pre-inpaint base image AND automatically restores the painted mask.
     */
    retryLastSession() {
        if (!this.lastSession || !this.lastSession.originalImgSrc) {
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('暂无可回退的原图重绘记录', 'info');
            }
            return false;
        }
        if (this.lastSession.strength !== undefined) {
            const strVal = String(this.lastSession.strength);
            const strEl = document.getElementById('inpaintStrength');
            const strMob = document.getElementById('inpaintStrengthMobile');
            const v1 = document.getElementById('inpaintStrengthVal');
            const v2 = document.getElementById('inpaintStrengthValMobile');
            if (strEl) strEl.value = strVal;
            if (strMob) strMob.value = strVal;
            if (v1) v1.textContent = parseFloat(strVal).toFixed(2);
            if (v2) v2.textContent = parseFloat(strVal).toFixed(2);
        }
        if (this.isOpen) {
            this.originalImgSrc = this.lastSession.originalImgSrc;
            this.revertToOriginalImage();
            this.restoreLastMask(false);
            return true;
        }
        this.open({
            imageSrc: this.lastSession.originalImgSrc,
            restoreMask: true
        });
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast('已还原重绘前原图与涂抹区域，可直接再次生成或微调', 'info');
        }
        return true;
    }

    continueOnCurrentImage(restoreMask = false) {
        this.open({ restoreMask });
    }

    _getCanvasPos(e) {
        const rect = this.maskCanvas.getBoundingClientRect();
        const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
        const scaleX = rect.width ? (this.maskCanvas.width / rect.width) : 1;
        const scaleY = rect.height ? (this.maskCanvas.height / rect.height) : 1;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    _drawDotOrStart(pos) {
        const r = this.getBrushSize();
        const tool = this.tool;
        const isSketch = this.layerMode === 'sketch' && this.sketchCtx;
        const ctx = isSketch ? this.sketchCtx : this.maskCtx;
        if (!ctx) return;
        ctx.save();
        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = isSketch ? (this.sketchColor || '#ef4444') : '#FFFFFF';
        }
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (isSketch && tool !== 'eraser') this.sketchDirty = true;
    }

    _drawStroke(from, to) {
        const r = this.getBrushSize();
        const tool = this.tool;
        const isSketch = this.layerMode === 'sketch' && this.sketchCtx;
        const ctx = isSketch ? this.sketchCtx : this.maskCtx;
        if (!ctx) return;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = r;

        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        } else if (tool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = isSketch ? (this.sketchColor || '#ef4444') : '#FFFFFF';
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
            if (isSketch) this.sketchDirty = true;
        }
        ctx.restore();
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
            data[pixelIdx + 3] = targetAlpha;
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
        if (this.sketchCanvas && this.sketchCtx) {
            this.sketchCanvas.width = this.imgNaturalW;
            this.sketchCanvas.height = this.imgNaturalH;
            this.sketchCtx.clearRect(0, 0, this.imgNaturalW, this.imgNaturalH);
        }
        if (this.selPreviewCanvas && this.selPreviewCtx) {
            this.selPreviewCanvas.width = this.imgNaturalW;
            this.selPreviewCanvas.height = this.imgNaturalH;
            this.selPreviewCtx.clearRect(0, 0, this.imgNaturalW, this.imgNaturalH);
        }

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

    _exportMaskAsBase64(targetW, targetH, isFullRes = true) {
        // Official NAI: downsample to 1/8 latent space, threshold at 155, then upscale to targetW x targetH (nearest neighbor)
        const latentW = Math.max(8, Math.round(targetW / 8));
        const latentH = Math.max(8, Math.round(targetH / 8));

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = latentW;
        tempCanvas.height = latentH;
        const ctx = tempCanvas.getContext('2d');

        ctx.clearRect(0, 0, latentW, latentH);
        ctx.drawImage(this.maskCanvas, 0, 0, latentW, latentH);

        // Binarize with threshold 155 (exact official NAI logic YMj(mask, 155))
        try {
            const imgData = ctx.getImageData(0, 0, latentW, latentH);
            if (imgData && imgData.data) {
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const isMask = d[i + 3] > 155 || (d[i] > 155 && d[i + 3] > 50);
                    const val = isMask ? 255 : 0;
                    d[i] = val;
                    d[i + 1] = val;
                    d[i + 2] = val;
                    d[i + 3] = 255;
                }
                ctx.putImageData(imgData, 0, 0);
            }
        } catch (_) {}

        if (isFullRes) {
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetW;
            finalCanvas.height = targetH;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.imageSmoothingEnabled = false;
            finalCtx.drawImage(tempCanvas, 0, 0, targetW, targetH);
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
                if (this.sketchCanvas && this._hasSketchContent()) {
                    ctx.drawImage(this.sketchCanvas, 0, 0, targetW, targetH);
                }
                resolve(tempCanvas.toDataURL('image/png').split(',')[1]);
            };
            img.src = this.originalImgSrc;
        });
    }

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    async _featherBlendResult(resultBlob, targetW, targetH) {
        try {
            if (!resultBlob || typeof document === 'undefined' || typeof Image === 'undefined') return null;
            const infilledUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(resultBlob) : null;
            if (!infilledUrl) return null;
            const infilledImg = await this._loadImage(infilledUrl);
            const baseImg = await this._loadImage(this.originalImgSrc);

            // 1. Build feather mask with blur
            const featherCanvas = document.createElement('canvas');
            featherCanvas.width = targetW;
            featherCanvas.height = targetH;
            const fCtx = featherCanvas.getContext('2d');
            if (fCtx.filter !== undefined) {
                fCtx.filter = 'blur(16px)';
            }
            fCtx.drawImage(this.maskCanvas, 0, 0, targetW, targetH);

            // 2. Mask infilled image with feather mask
            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = targetW;
            patchCanvas.height = targetH;
            const pCtx = patchCanvas.getContext('2d');
            pCtx.drawImage(infilledImg, 0, 0, targetW, targetH);
            pCtx.globalCompositeOperation = 'destination-in';
            pCtx.drawImage(featherCanvas, 0, 0);

            // 3. Composite patch over original image
            const compCanvas = document.createElement('canvas');
            compCanvas.width = targetW;
            compCanvas.height = targetH;
            const cCtx = compCanvas.getContext('2d');
            cCtx.drawImage(baseImg, 0, 0, targetW, targetH);
            cCtx.drawImage(patchCanvas, 0, 0);

            return await new Promise((resolve) => {
                if (typeof compCanvas.toBlob === 'function') {
                    compCanvas.toBlob((blob) => {
                        if (blob) {
                            resolve({
                                blob,
                                imageUrl: URL.createObjectURL(blob)
                            });
                        } else {
                            resolve(null);
                        }
                    }, 'image/png');
                } else if (typeof compCanvas.toDataURL === 'function') {
                    const dataUrl = compCanvas.toDataURL('image/png');
                    resolve({
                        blob: resultBlob,
                        imageUrl: dataUrl
                    });
                } else {
                    resolve(null);
                }
            });
        } catch (_) {
            return null;
        }
    }

    async doInpaint() {
        if (this._isSubmitting) return;
        const hasMask = this._hasPaintedMask();
        const hasSketch = this._hasSketchContent();
        if (!hasMask && !hasSketch) {
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('请先在图片上涂抹需要局部重绘的区域或涂鸦线稿', 'warning');
            }
            return;
        }

        if (!hasMask && hasSketch && this.maskCanvas && this.maskCtx && this.sketchCtx) {
            const w = this.maskCanvas.width;
            const h = this.maskCanvas.height;
            const sData = this.sketchCtx.getImageData(0, 0, w, h).data;
            const alphaArr = new Uint8Array(w * h);
            for (let i = 0; i < alphaArr.length; i++) {
                alphaArr[i] = sData[i * 4 + 3] > 10 ? 255 : 0;
            }
            this.saveMaskState();
            this._writeAlphaToMask(alphaArr, w, h);
            dilateMaskCanvas(this.maskCtx, w, h, 10);
        }

        this._isSubmitting = true;
        this.toggleParamsPopover(false);

        const targetW = Math.ceil((this.imgNaturalW || 512) / 64) * 64;
        const targetH = Math.ceil((this.imgNaturalH || 512) / 64) * 64;

        const selectedVersion = document.getElementById('modelValue')?.value || 'v4_5';
        const isFullRes = selectedVersion.includes('v4') || selectedVersion.includes('v5') || selectedVersion === 'v5';

        // Snapshot current base image & mask so user can always revert or restore even across sessions
        try {
            const extracted = this._extractCurrentAlpha();
            const strengthNum = parseFloat(document.getElementById('inpaintStrength')?.value || 1.0);
            if (extracted && this.originalImgSrc) {
                this.lastSession = {
                    originalImgSrc: this.originalImgSrc,
                    width: extracted.width,
                    height: extracted.height,
                    maskAlpha: extracted.alpha,
                    strength: strengthNum,
                    timestamp: Date.now()
                };
                this._syncRestoreBtnVisibility();
            }
        } catch (_) {}

        const maskB64 = this._exportMaskAsBase64(targetW, targetH, isFullRes);

        const submitBtn = document.getElementById('inpaintSubmitBtn');
        const submitBtnMobile = document.getElementById('inpaintSubmitBtnMobile');
        if (submitBtn) submitBtn.disabled = true;
        if (submitBtnMobile) submitBtnMobile.disabled = true;

        if (this.ui && typeof this.ui.setLoading === 'function') {
            this.ui.setLoading(true, '局部重绘中...');
        }

        try {
            const imageB64 = await this._exportBaseImageAsBase64(targetW, targetH);
            const inpaintPromptText = document.getElementById('inpaintPrompt')?.value?.trim() || document.getElementById('prompt')?.value?.trim() || '';

            const customApiKeyRaw = this.store.getSetting('nai_custom_api_key');
            const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
            const auths = buildAuthPool(this.store);

            if (typeof this.prepareBeforeGenerate === 'function') {
                await this.prepareBeforeGenerate(selectedVersion, auths, customApiKeys.length > 0);
            }
            const extraParams = this.getExtraParams ? this.getExtraParams(selectedVersion, customApiKeys.length > 0) : {};

            const seedEl = document.getElementById('seed');
            const userSeedVal = seedEl ? seedEl.value?.trim?.() : '';
            const seedParam = (userSeedVal && !isNaN(userSeedVal))
                ? (parseInt(userSeedVal, 10) % 4294967296)
                : Math.floor(Math.random() * 4294967295);

            const params = {
                version: selectedVersion,
                prompt: inpaintPromptText,
                negative_prompt: document.getElementById('negativePrompt')?.value?.trim() || '',
                width: targetW,
                height: targetH,
                steps: parseInt(document.getElementById('steps')?.value || 28),
                scale: parseFloat(document.getElementById('scale')?.value || 5.0),
                sampler: document.getElementById('sampler')?.value || 'k_euler',
                seed: seedParam,
                image: imageB64,
                mask: maskB64,
                strength: parseFloat(document.getElementById('inpaintStrength')?.value || 1.0),
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
                    if (result.userRole && this.ui && typeof this.ui.updateCreditDisplay === 'function') {
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

            const seamlessEl = typeof document !== 'undefined' ? document.getElementById('inpaintSeamlessToggle') : null;
            const seamlessEnabled = Boolean(seamlessEl && seamlessEl.checked);
            if (seamlessEnabled && successfulResults[0]?.blob) {
                const blended = await this._featherBlendResult(successfulResults[0].blob, targetW, targetH);
                if (blended?.imageUrl) {
                    successfulResults[0] = { ...successfulResults[0], ...blended };
                }
            }

            if (this.ui && this.ui.currentRightView !== 'preview' && typeof this.ui.switchRightView === 'function') {
                this.ui.switchRightView('preview');
            }

            if (this.onComplete) {
                await this.onComplete(successfulResults, inpaintPromptText, selectedVersion, params);
            }
            if (this.ui && typeof this.ui.setBeforeAfterImage === 'function' && this.originalImgSrc && successfulResults[0]?.imageUrl) {
                this.ui.setBeforeAfterImage(this.originalImgSrc, successfulResults[0].imageUrl);
            }

            // Persistent Inpaint Mode: stay open on main canvas, keep mask intact & soften opacity for result inspection!
            if (this.isOpen) {
                if (hasSketch && this.sketchCtx && this.sketchCanvas) {
                    this.sketchCtx.clearRect(0, 0, this.sketchCanvas.width, this.sketchCanvas.height);
                    this.sketchDirty = false;
                }
                this.hasGeneratedInSession = true;
                this.setMaskPeek(true);
                this._syncRevertOrigBtnVisibility();
                this.syncOverlayGeometry();
                const deskText = typeof document !== 'undefined' ? document.getElementById('deskBtnText') : null;
                if (deskText) deskText.textContent = '确认局部重绘';
            }

        } catch (err) {
            console.error(err);
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('重绘失败: ' + err.message, 'error');
            }
        } finally {
            this._isSubmitting = false;
            if (this.ui && typeof this.ui.setLoading === 'function') {
                this.ui.setLoading(false);
            }
            if (submitBtn) submitBtn.disabled = false;
            if (submitBtnMobile) submitBtnMobile.disabled = false;
            if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();
        }
    }
}
