/**
 * Inpaint Editor Module
 * True Main-Canvas Fusion: paints directly over #singleResultImg in the main canvas,
 * stays persistently active across generations until closed, supports multi-touch
 * pinch-zoom/pan, mask peek/hide, and 1-click base-image revert.
 */
export class InpaintEditor {
    constructor(dependencies = {}) {
        this.ui = dependencies.ui;
        this.engine = dependencies.engine;
        this.store = dependencies.store;
        this.onComplete = dependencies.onComplete;
        this.getExtraParams = dependencies.getExtraParams;

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

    hasRestorableMask() {
        return Boolean(this.lastSession && this.lastSession.maskAlpha && this.lastSession.width > 0 && this.lastSession.height > 0);
    }

    showQuickRetryBar(show) {
        const bar = typeof document !== 'undefined' ? document.getElementById('inpaintQuickRetryBar') : null;
        if (!bar) return;
        if (show && this.hasRestorableMask()) {
            bar.classList.remove('hidden');
        } else {
            bar.classList.add('hidden');
        }
    }

    _syncToggleBtnState() {
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintToggleBtn') : null;
        if (btn && btn.classList) {
            btn.classList.toggle('inpaint-toggle-active', Boolean(this.isOpen));
        }
    }

    _syncRevertOrigBtnVisibility() {
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintRevertOrigBtn') : null;
        if (btn && btn.classList) {
            btn.classList.toggle('hidden', !this.hasGeneratedInSession);
        }
    }

    _syncRestoreBtnVisibility() {
        const btn = typeof document !== 'undefined' ? document.getElementById('inpaintRestoreMaskBtn') : null;
        if (!btn) return;
        if (this.hasRestorableMask()) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
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
        if (pop?.classList) {
            pop.classList.toggle('hidden', !this.paramsPopoverOpen);
        }
        if (btn?.classList) {
            btn.classList.toggle('tool-active', this.paramsPopoverOpen);
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
        }
    }

    applyViewportTransform() {
        const target = this.canvasStage || (typeof document !== 'undefined' ? document.getElementById('inpaintCanvasStage') : null);
        const isIdentity = Math.abs(this.viewport.scale - 1) < 0.005 && Math.abs(this.viewport.x) < 0.5 && Math.abs(this.viewport.y) < 0.5;
        if (target && target.style) {
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

    setZoom(nextScale, anchorClientX = null, anchorClientY = null) {
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
        this.applyViewportTransform();
    }

    zoomIn() {
        this.setZoom(this.viewport.scale * 1.25);
    }

    zoomOut() {
        this.setZoom(this.viewport.scale / 1.25);
    }

    resetZoom() {
        this.viewport = { scale: 1, x: 0, y: 0 };
        this.applyViewportTransform();
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
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                if (e.code === 'Space') {
                    this._spacePressed = true;
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    this.undo();
                } else if (e.key === 'Escape') {
                    if (this.paramsPopoverOpen) {
                        this.toggleParamsPopover(false);
                    } else {
                        this.close();
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
                const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
                this.setZoom(this.viewport.scale * factor, e.clientX, e.clientY);
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
                if (this.activePointers.size === 0) this.isPanning = false;
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
                this.panStart = {
                    x: e.clientX - this.viewport.x,
                    y: e.clientY - this.viewport.y
                };
                return;
            }

            // Restore full mask visibility as soon as user starts painting
            if (this.maskHidden) {
                this.toggleMaskVisibility(false);
            } else if (this.maskPeek) {
                this.setMaskPeek(false);
            }

            if (this.tool === 'fill') {
                const pos = this._getCanvasPos(e);
                const tolerance = parseInt(document.getElementById('inpaintFillTolerance')?.value || 15);
                this.saveMaskState();
                this._floodFill(pos.x, pos.y, tolerance);
                return;
            }

            this.drawing = true;
            this._strokeStartTime = Date.now();
            this._strokeMovedDist = 0;
            this.saveMaskState();
            const pos = this._getCanvasPos(e);
            this.lastPos = pos;
            if (this.tool === 'blur') {
                const intensity = parseInt(document.getElementById('inpaintBlurStrength')?.value || 50);
                this._blurMask(pos, Math.max(2, this.getBrushSize() / 2), intensity);
            } else {
                this._drawDotOrStart(pos);
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
            if (this.lastPos) {
                this._strokeMovedDist += Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y);
                if (this.tool === 'blur') {
                    const intensity = parseInt(document.getElementById('inpaintBlurStrength')?.value || 50);
                    this._blurMask(pos, Math.max(2, this.getBrushSize() / 2), intensity);
                } else {
                    this._drawStroke(this.lastPos, pos);
                }
            } else {
                this._drawDotOrStart(pos);
            }
            this.lastPos = pos;
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
                this.isPanning = false;
                this.drawing = false;
                this.lastPos = null;
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

        // Close outpaint if open so main workspace canvas stays mutually exclusive
        const outpaintArea = document.getElementById('outpaintArea');
        if (outpaintArea && !outpaintArea.classList.contains('hidden') && typeof window !== 'undefined' && window.outpaintEditor) {
            window.outpaintEditor.close();
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
            this.activePointers.clear();
            this.isOpen = true;
            this.maskHidden = false;
            this.setMaskPeek(false);

            if (this.maskCanvas?.classList) {
                this.maskCanvas.classList.remove('hidden', 'pointer-events-none', 'mask-hidden', 'mask-peek');
            }
            if (this.canvasWrap?.classList) {
                this.canvasWrap.classList.add('inpaint-live');
            }

            this.syncOverlayGeometry();
            this.resetZoom();
            this._syncToggleBtnState();
            this._syncRevertOrigBtnVisibility();
            this._syncRestoreBtnVisibility();
            this.toggleMaskVisibility(false);

            if (options.restoreMask && this.hasRestorableMask()) {
                this.restoreLastMask(false);
            }

            if (this.modal) {
                this.modal.style.display = 'flex';
                this.modal.classList?.remove?.('hidden', 'modal-hidden');
                this.modal.classList?.add?.('modal-visible');
            }
            const deskText = document.getElementById('deskBtnText');
            if (deskText) deskText.textContent = '确认局部重绘';
            if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();
        };
        img.src = this.originalImgSrc;
    }

    close() {
        this.isOpen = false;
        this.history = [];
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
        if (this.canvasWrap?.classList) {
            this.canvasWrap.classList.remove('inpaint-live');
        }
        this.resetZoom();
        this._syncToggleBtnState();
        this._syncRevertOrigBtnVisibility();

        if (this.modal) {
            this.modal.classList?.add?.('modal-hidden');
            this.modal.classList?.remove?.('modal-visible');
            this.modal.style.display = 'none';
        }
        if (this.brushCursor) this.brushCursor.classList.add('hidden');
        if (this._cursorRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._cursorRaf);
        }
        if (this.ui && typeof this.ui.updateGenerateButtonText === 'function') {
            this.ui.updateGenerateButtonText();
        }
    }

    setTool(tool) {
        this.tool = tool;
        document.getElementById('inpaintBrushBtn')?.classList.toggle('tool-active', tool === 'brush');
        document.getElementById('inpaintEraserBtn')?.classList.toggle('tool-active', tool === 'eraser');
        document.getElementById('inpaintMoveBtn')?.classList.toggle('tool-active', tool === 'move');
        document.getElementById('inpaintBlurBtn')?.classList.toggle('tool-active', tool === 'blur');
        document.getElementById('inpaintFillBtn')?.classList.toggle('tool-active', tool === 'fill');
        if (this.maskCanvas && this.maskCanvas.style) {
            this.maskCanvas.style.cursor = tool === 'move' ? 'grab' : 'none';
        }
        const blurWrap = document.getElementById('blurStrengthWrap');
        if (blurWrap) blurWrap.style.display = tool === 'blur' ? 'flex' : 'none';
        const fillWrap = document.getElementById('fillToleranceWrap');
        if (fillWrap) fillWrap.style.display = tool === 'fill' ? 'flex' : 'none';
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
    }

    undo() {
        if (this.history.length === 0) return;
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
        if (!this._hasPaintedMask()) {
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('请先在图片上涂抹需要局部重绘的区域', 'warning');
            }
            return;
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

            const authBase = {
                adminToken: this.store.getSetting('nai_admin_token'),
                userKey: this.store.getSetting('nai_user_key'),
                userToken: (typeof localStorage !== 'undefined' ? localStorage.getItem('nai_user_token') : '') || ""
            };
            const customApiKeyRaw = this.store.getSetting('nai_custom_api_key');
            const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
            const auths = customApiKeys.length > 0
                ? customApiKeys.map(key => ({ ...authBase, customApiKey: key }))
                : [{ ...authBase, customApiKey: "" }];

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

            if (this.ui && this.ui.currentRightView !== 'preview' && typeof this.ui.switchRightView === 'function') {
                this.ui.switchRightView('preview');
            }

            if (this.onComplete) {
                await this.onComplete(successfulResults, inpaintPromptText, selectedVersion, params);
            }

            // Persistent Inpaint Mode: stay open on main canvas, keep mask intact & soften opacity for result inspection!
            if (this.isOpen) {
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
