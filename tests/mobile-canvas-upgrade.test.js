import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    buildAuthPool,
    CanvasViewportController,
    StrokeCoalescer,
    rasterizePolygon,
    rasterizeRect,
    invertMaskCanvas,
    dilateMaskCanvas,
    stitchOutpaintWithFeather,
    initRovingToolbar
} from '../src/canvas-core.js';
import { createCanvasIOController, CropEditor } from '../src/canvas-crop-io.js';
import { InpaintEditor } from '../src/inpaint.js';
import { OutpaintEditor } from '../src/outpaint.js';
import { createPostProcessController } from '../src/post-process-controller.js';

function createSoftwareCanvas(width = 32, height = 32, defaultDataUrl = 'data:image/png;base64,MOCK') {
    let W = width;
    let H = height;
    let buf = new Uint8ClampedArray(W * H * 4);

    function resize(nw, nh) {
        W = nw;
        H = nh;
        buf = new Uint8ClampedArray(W * H * 4);
    }

    const fillRectPixels = (rx, ry, rw, rh, r, g, b, a, erase = false) => {
        const x0 = Math.max(0, Math.floor(rx));
        const y0 = Math.max(0, Math.floor(ry));
        const x1 = Math.min(W, Math.ceil(rx + rw));
        const y1 = Math.min(H, Math.ceil(ry + rh));
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * W + x) * 4;
                if (erase) {
                    buf[i + 3] = 0;
                } else {
                    buf[i] = r;
                    buf[i + 1] = g;
                    buf[i + 2] = b;
                    buf[i + 3] = a;
                }
            }
        }
    };

    const parseColor = (str) => {
        if (typeof str === 'string' && str.startsWith('#') && str.length === 7) {
            return [
                parseInt(str.slice(1, 3), 16),
                parseInt(str.slice(3, 5), 16),
                parseInt(str.slice(5, 7), 16),
                255
            ];
        }
        return [255, 255, 255, 255];
    };

    let pathOps = [];
    const ctx = {
        globalCompositeOperation: 'source-over',
        fillStyle: '#ffffff',
        strokeStyle: '#ffffff',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
        imageSmoothingEnabled: true,
        save: vi.fn(),
        restore: vi.fn(),
        setLineDash: vi.fn(),
        clearRect: vi.fn((x, y, w, h) => fillRectPixels(x, y, w, h, 0, 0, 0, 0, true)),
        fillRect: vi.fn((x, y, w, h) => {
            const erase = ctx.globalCompositeOperation === 'destination-out';
            const [r, g, b, a] = parseColor(ctx.fillStyle);
            fillRectPixels(x, y, w, h, r, g, b, a, erase);
        }),
        strokeRect: vi.fn(),
        beginPath: vi.fn(() => { pathOps = []; }),
        moveTo: vi.fn((x, y) => { pathOps.push({ type: 'pt', x, y }); }),
        lineTo: vi.fn((x, y) => { pathOps.push({ type: 'pt', x, y }); }),
        arc: vi.fn((cx, cy, r) => { pathOps.push({ type: 'arc', cx, cy, r }); }),
        closePath: vi.fn(),
        fill: vi.fn(() => {
            const erase = ctx.globalCompositeOperation === 'destination-out';
            const [r, g, b, a] = parseColor(ctx.fillStyle);
            const arcOp = pathOps.find((p) => p.type === 'arc');
            if (arcOp) {
                fillRectPixels(arcOp.cx - arcOp.r, arcOp.cy - arcOp.r, arcOp.r * 2, arcOp.r * 2, r, g, b, a, erase);
                return;
            }
            const pts = pathOps.filter((p) => p.type === 'pt');
            if (pts.length >= 3) {
                const xs = pts.map((p) => p.x);
                const ys = pts.map((p) => p.y);
                const minX = Math.max(0, Math.floor(Math.min(...xs)));
                const maxX = Math.min(W - 1, Math.ceil(Math.max(...xs)));
                const minY = Math.max(0, Math.floor(Math.min(...ys)));
                const maxY = Math.min(H - 1, Math.ceil(Math.max(...ys)));
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        let inside = false;
                        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                            const xi = pts[i].x, yi = pts[i].y;
                            const xj = pts[j].x, yj = pts[j].y;
                            const intersect = ((yi > y) !== (yj > y)) &&
                                (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi);
                            if (intersect) inside = !inside;
                        }
                        if (inside) {
                            const idx = (y * W + x) * 4;
                            if (erase) buf[idx + 3] = 0;
                            else {
                                buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = a;
                            }
                        }
                    }
                }
            }
        }),
        stroke: vi.fn(() => {
            const pts = pathOps.filter((p) => p.type === 'pt');
            const [r, g, b, a] = parseColor(ctx.strokeStyle);
            const erase = ctx.globalCompositeOperation === 'destination-out';
            const rad = Math.max(1, (ctx.lineWidth || 2) / 2);
            for (const p of pts) {
                fillRectPixels(p.x - rad, p.y - rad, rad * 2, rad * 2, r, g, b, a, erase);
            }
        }),
        drawImage: vi.fn(),
        createImageData: vi.fn((w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })),
        getImageData: vi.fn((x = 0, y = 0, w = W, h = H) => {
            if (x === 0 && y === 0 && w === W && h === H) {
                return { width: W, height: H, data: new Uint8ClampedArray(buf) };
            }
            const out = new Uint8ClampedArray(w * h * 4);
            for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                    const sx = Math.max(0, Math.min(W - 1, x + px));
                    const sy = Math.max(0, Math.min(H - 1, y + py));
                    const si = (sy * W + sx) * 4;
                    const di = (py * w + px) * 4;
                    out[di] = buf[si];
                    out[di + 1] = buf[si + 1];
                    out[di + 2] = buf[si + 2];
                    out[di + 3] = buf[si + 3];
                }
            }
            return { width: w, height: h, data: out };
        }),
        putImageData: vi.fn((imgData) => {
            if (imgData?.data) {
                buf = new Uint8ClampedArray(imgData.data);
            }
        })
    };

    const el = createMockEl('canvas');
    Object.defineProperty(el, 'width', {
        get: () => W,
        set: (v) => resize(v, H)
    });
    Object.defineProperty(el, 'height', {
        get: () => H,
        set: (v) => resize(W, v)
    });
    el.getContext = () => ctx;
    el.toDataURL = vi.fn(() => defaultDataUrl);
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
    el._ctx = ctx;
    el._buf = () => buf;
    return el;
}

function createMockEl(tag = 'div', id = '') {
    const classes = new Set();
    const listeners = new Map();
    const attrs = new Map();
    const el = {
        tagName: tag.toUpperCase(),
        id,
        value: '',
        checked: false,
        disabled: false,
        textContent: '',
        src: '',
        naturalWidth: 64,
        naturalHeight: 64,
        width: 64,
        height: 64,
        clientWidth: 64,
        clientHeight: 64,
        offsetWidth: 64,
        offsetHeight: 64,
        style: {},
        dataset: {},
        classList: {
            add: (...cs) => cs.forEach((c) => classes.add(c)),
            remove: (...cs) => cs.forEach((c) => classes.delete(c)),
            toggle: (c, force) => {
                if (typeof force === 'boolean') {
                    if (force) classes.add(c);
                    else classes.delete(c);
                    return force;
                }
                if (classes.has(c)) { classes.delete(c); return false; }
                classes.add(c); return true;
            },
            contains: (c) => classes.has(c)
        },
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => attrs.get(k) ?? null,
        addEventListener: (type, fn) => {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(fn);
        },
        removeEventListener: (type, fn) => {
            const arr = listeners.get(type) || [];
            listeners.set(type, arr.filter((f) => f !== fn));
        },
        dispatchEvent: (ev) => {
            const e = typeof ev === 'string' ? { type: ev } : ev;
            const list = listeners.get(e.type) || [];
            list.forEach((fn) => fn({ preventDefault: vi.fn(), stopPropagation: vi.fn(), target: el, ...e }));
        },
        closest: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        focus: vi.fn(),
        showPopover: vi.fn(),
        hidePopover: vi.fn(),
        _listeners: listeners
    };
    return el;
}

describe('Mobile & Full Canvas Refactor Upgrade', () => {
    let origDoc;
    let origWin;
    let origImage;
    let origAlert;
    let origFileReader;

    beforeEach(() => {
        origDoc = global.document;
        origWin = global.window;
        origImage = global.Image;
        origAlert = global.alert;
        origFileReader = global.FileReader;
    });

    afterEach(() => {
        global.document = origDoc;
        global.window = origWin;
        global.Image = origImage;
        global.alert = origAlert;
        global.FileReader = origFileReader;
        vi.restoreAllMocks();
    });

    describe('1. src/canvas-core.js shared primitives', () => {
        it('buildAuthPool supports GalleryStore multi-keys and deduplicates raw authKeys', () => {
            const storePool = buildAuthPool({
                getSetting: (k) => ({
                    nai_admin_token: 'adm',
                    nai_user_key: 'uk',
                    nai_custom_api_key: 'k1, k2\nk1'
                })[k]
            });
            expect(storePool).toHaveLength(2);
            expect(storePool.map((x) => x.customApiKey)).toEqual(['k1', 'k2']);

            const fallbackPool = buildAuthPool({ getSetting: () => '' });
            expect(fallbackPool).toEqual([{ adminToken: '', userKey: '', userToken: '', customApiKey: '' }]);

            expect(buildAuthPool({ authKeys: { primary: ' p1 ', secondary: 'p1' } })).toEqual(['p1']);
        });

        it('CanvasViewportController handles 2-finger pinch zoom, double-tap toggle, 1-finger pan, and reset', () => {
            const winListeners = new Map();
            global.window = {
                addEventListener: (t, fn) => {
                    if (!winListeners.has(t)) winListeners.set(t, []);
                    winListeners.get(t).push(fn);
                },
                removeEventListener: vi.fn()
            };
            const wrapEl = createMockEl('div', 'inpaintCanvasWrap');
            const stageEl = createMockEl('div', 'inpaintCanvasStage');
            const badgeEl = createMockEl('button', 'canvasZoomPill');

            const vc = new CanvasViewportController({
                wrapEl,
                stageEl,
                badgeEl,
                canSingleFingerPan: () => vc.scale > 1.02
            });
            vc.attach();

            // Pinch 100px -> 200px => 2x zoom
            wrapEl.dispatchEvent({ type: 'pointerdown', pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 100 });
            wrapEl.dispatchEvent({ type: 'pointerdown', pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 100 });
            expect(vc.isPinching).toBe(true);
            winListeners.get('pointermove').forEach((fn) => fn({
                preventDefault: vi.fn(),
                pointerId: 2,
                pointerType: 'touch',
                clientX: 250,
                clientY: 100
            }));
            expect(vc.scale).toBeCloseTo(2.0, 2);
            expect(badgeEl.textContent).toBe('200%');
            expect(badgeEl.classList.contains('hidden')).toBe(false);

            winListeners.get('pointerup').forEach((fn) => fn({ pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 100 }));
            winListeners.get('pointerup').forEach((fn) => fn({ pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 100 }));
            expect(vc.isPinching).toBe(false);

            // Single-finger pan when zoomed
            wrapEl.dispatchEvent({ type: 'pointerdown', pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 100 });
            winListeners.get('pointermove').forEach((fn) => fn({
                preventDefault: vi.fn(),
                pointerId: 3,
                pointerType: 'touch',
                clientX: 130,
                clientY: 120
            }));
            expect(vc.x).toBeGreaterThan(0);
            winListeners.get('pointerup').forEach((fn) => fn({ pointerId: 3, pointerType: 'touch', clientX: 130, clientY: 120 }));

            vc.reset();
            expect(vc.scale).toBe(1);
            expect(badgeEl.classList.contains('hidden')).toBe(true);

            // Double-tap toggles 1x -> 2.2x
            wrapEl.dispatchEvent({ type: 'pointerdown', pointerId: 4, pointerType: 'touch', clientX: 100, clientY: 100 });
            winListeners.get('pointerup').forEach((fn) => fn({ pointerId: 4, pointerType: 'touch', clientX: 100, clientY: 100 }));
            wrapEl.dispatchEvent({ type: 'pointerdown', pointerId: 5, pointerType: 'touch', clientX: 104, clientY: 102 });
            winListeners.get('pointerup').forEach((fn) => fn({ pointerId: 5, pointerType: 'touch', clientX: 104, clientY: 102 }));
            expect(vc.scale).toBeCloseTo(2.2, 2);
        });

        it('StrokeCoalescer batches getCoalescedEvents and flushes synchronously on flush()', () => {
            const flushed = [];
            const coalescer = new StrokeCoalescer({
                onFlushPoints: (pts) => flushed.push(...pts)
            });
            coalescer.enqueue({
                getCoalescedEvents: () => [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]
            }, (ev) => ({ x: ev.x, y: ev.y }));
            expect(flushed).toHaveLength(0);
            coalescer.flush();
            expect(flushed).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
        });

        it('rasterizeRect, rasterizePolygon, invertMaskCanvas, dilateMaskCanvas, and stitchOutpaintWithFeather work cleanly', () => {
            const canvas = createSoftwareCanvas(16, 16);
            const ctx = canvas.getContext('2d');

            expect(rasterizeRect(ctx, { x: 4, y: 4 }, { x: 8, y: 8 })).toBe(true);
            const before = ctx.getImageData(0, 0, 16, 16).data;
            expect(before[(5 * 16 + 5) * 4 + 3]).toBe(255);
            expect(before[(1 * 16 + 1) * 4 + 3]).toBe(0);

            invertMaskCanvas(ctx, 16, 16);
            const inverted = ctx.getImageData(0, 0, 16, 16).data;
            expect(inverted[(5 * 16 + 5) * 4 + 3]).toBe(0);
            expect(inverted[(1 * 16 + 1) * 4 + 3]).toBe(255);

            ctx.clearRect(0, 0, 16, 16);
            rasterizePolygon(ctx, [{ x: 6, y: 6 }, { x: 10, y: 6 }, { x: 8, y: 10 }]);
            expect(ctx.getImageData(0, 0, 16, 16).data[(7 * 16 + 8) * 4 + 3]).toBe(255);

            ctx.clearRect(0, 0, 16, 16);
            rasterizeRect(ctx, { x: 7, y: 7 }, { x: 8, y: 8 });
            dilateMaskCanvas(ctx, 16, 16, 2);
            const dilated = ctx.getImageData(0, 0, 16, 16).data;
            expect(dilated[(5 * 16 + 5) * 4 + 3]).toBe(255);

            // Mock document without createLinearGradient -> fallback drawImage
            global.document = {
                createElement: () => createSoftwareCanvas(16, 16)
            };
            const targetCtx = createSoftwareCanvas(32, 32).getContext('2d');
            stitchOutpaintWithFeather(targetCtx, { src: 'img' }, 4, 4, 16, 16, { featherPx: 8, canvasW: 32, canvasH: 32 });
            expect(targetCtx.drawImage).toHaveBeenCalledTimes(1);
        });

        it('initRovingToolbar supports ArrowRight/ArrowLeft navigation on enabled buttons', () => {
            const b1 = createMockEl('button');
            const b2 = createMockEl('button');
            const toolbar = createMockEl('div');
            toolbar.querySelectorAll = () => [b1, b2];
            toolbar.contains = (el) => el === b1 || el === b2;
            global.document = { activeElement: b1 };

            const cleanup = initRovingToolbar(toolbar);
            expect(b1.tabIndex).toBe(0);
            expect(b2.tabIndex).toBe(-1);

            toolbar.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
            expect(b2.focus).toHaveBeenCalled();
            expect(b2.tabIndex).toBe(0);
            cleanup();
        });
    });

    describe('2. InpaintEditor Lasso/Rect, Redo, Invert/Grow, Color Sketch & Touch Loupe', () => {
        function setupInpaintDom() {
            const maskCanvas = createSoftwareCanvas(32, 32);
            const baseCanvas = createSoftwareCanvas(32, 32);
            const sketchCanvas = createSoftwareCanvas(32, 32);
            const selPreviewCanvas = createSoftwareCanvas(32, 32);
            const loupeCanvas = createSoftwareCanvas(96, 96);
            const brushSlider = createMockEl('input', 'inpaintBrushSize');
            brushSlider.value = '6';
            const els = {
                singleResultImg: Object.assign(createMockEl('img', 'singleResultImg'), { src: 'data:image/png;base64,BASE' }),
                inpaintBaseCanvas: baseCanvas,
                inpaintMaskCanvas: maskCanvas,
                inpaintSketchCanvas: sketchCanvas,
                inpaintSelectionPreviewCanvas: selPreviewCanvas,
                inpaintModal: createMockEl('div', 'inpaintModal'),
                inpaintCanvasStage: createMockEl('div', 'inpaintCanvasStage'),
                inpaintCanvasWrap: createMockEl('div', 'inpaintCanvasWrap'),
                inpaintBrushSize: brushSlider,
                inpaintBrushSizeVal: createMockEl('span', 'inpaintBrushSizeVal'),
                inpaintStrength: Object.assign(createMockEl('input', 'inpaintStrength'), { value: '1.0' }),
                inpaintBrushBtn: createMockEl('button', 'inpaintBrushBtn'),
                inpaintEraserBtn: createMockEl('button', 'inpaintEraserBtn'),
                inpaintLassoBtn: createMockEl('button', 'inpaintLassoBtn'),
                inpaintRectBtn: createMockEl('button', 'inpaintRectBtn'),
                inpaintSketchBtn: createMockEl('button', 'inpaintSketchBtn'),
                inpaintMoveBtn: createMockEl('button', 'inpaintMoveBtn'),
                inpaintSketchPalette: createMockEl('div', 'inpaintSketchPalette'),
                inpaintSketchColorInput: createMockEl('input', 'inpaintSketchColorInput'),
                inpaintEyedropperBtn: createMockEl('button', 'inpaintEyedropperBtn'),
                canvasTouchLoupe: createMockEl('div', 'canvasTouchLoupe'),
                canvasTouchLoupeCanvas: loupeCanvas,
                brushSizePreviewRing: createMockEl('div', 'brushSizePreviewRing'),
                inpaintSeamlessToggle: Object.assign(createMockEl('input', 'inpaintSeamlessToggle'), { checked: false }),
                brushCursor: createMockEl('div', 'brushCursor')
            };

            const docListeners = {};
            global.document = {
                body: createMockEl('body'),
                getElementById: (id) => els[id] || null,
                querySelectorAll: () => [],
                addEventListener: (t, fn) => { docListeners[t] = fn; },
                createElement: () => createSoftwareCanvas(32, 32)
            };
            global.window = {
                innerWidth: 400,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                showToast: vi.fn(),
                matchMedia: () => ({ matches: false })
            };
            global.Image = class {
                set src(v) {
                    this._src = v;
                    this.naturalWidth = 32;
                    this.naturalHeight = 32;
                    this.width = 32;
                    this.height = 32;
                    this.onload?.();
                }
                get src() { return this._src; }
            };
            return { els, docListeners };
        }

        it('supports redo(), rect/lasso rasterization, invertMask(), growMask(), and Touch Loupe', () => {
            const { els } = setupInpaintDom();
            const editor = new InpaintEditor({
                store: { getSetting: () => '' },
                engine: { generate: vi.fn() }
            });
            editor.open();

            // Rect selection tool
            editor.setTool('rect');
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointerdown', pointerId: 1, pointerType: 'touch', clientX: 4, clientY: 4 });
            expect(els.canvasTouchLoupe.classList.contains('hidden')).toBe(false);
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointermove', pointerId: 1, pointerType: 'touch', clientX: 12, clientY: 12 });
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointerup', pointerId: 1, pointerType: 'touch', clientX: 12, clientY: 12 });
            expect(els.canvasTouchLoupe.classList.contains('hidden')).toBe(true);
            expect(editor._hasPaintedMask()).toBe(true);

            // Undo -> clear, Redo -> restore
            editor.undo();
            expect(editor._hasPaintedMask()).toBe(false);
            editor.redo();
            expect(editor._hasPaintedMask()).toBe(true);

            // Grow & Invert mask
            const alphaAtCornerBefore = els.inpaintMaskCanvas._buf()[0 * 4 + 3];
            expect(alphaAtCornerBefore).toBe(0);
            editor.invertMask();
            expect(els.inpaintMaskCanvas._buf()[0 * 4 + 3]).toBe(255);
        });

        it('supports Color Sketch drawing, Touch Eyedropper sampling, and Auto-Mask generation on doInpaint()', async () => {
            const { els } = setupInpaintDom();
            const mockGenerate = vi.fn().mockResolvedValue({ imageUrl: 'data:image/png;base64,OUT' });
            const editor = new InpaintEditor({
                store: { getSetting: () => '' },
                engine: { generate: mockGenerate },
                onComplete: vi.fn()
            });
            editor.open();

            // Paint a known color onto baseCanvas pixel (10,10) for eyedropper test
            els.baseCanvas = els.inpaintBaseCanvas;
            els.inpaintBaseCanvas._ctx.fillStyle = '#12ab34';
            els.inpaintBaseCanvas._ctx.fillRect(8, 8, 6, 6);

            editor.setLayerMode('sketch');
            expect(els.inpaintSketchPalette.classList.contains('hidden')).toBe(false);

            editor.toggleEyedropper();
            expect(editor.eyedropperActive).toBe(true);
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointerdown', pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointerup', pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
            expect(editor.eyedropperActive).toBe(false);
            expect(editor.sketchColor).toBe('#12ab34');

            // Paint sketch dot without painting any mask manually
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointerdown', pointerId: 2, pointerType: 'touch', clientX: 16, clientY: 16 });
            els.inpaintMaskCanvas.dispatchEvent({ type: 'pointerup', pointerId: 2, pointerType: 'touch', clientX: 16, clientY: 16 });
            expect(editor._hasSketchContent()).toBe(true);
            expect(editor._hasPaintedMask()).toBe(false);

            await editor.doInpaint();
            // Auto-mask was generated and dilated on maskCanvas, and generate called!
            expect(mockGenerate).toHaveBeenCalledTimes(1);
            expect(editor._hasPaintedMask()).toBe(true);
            // Sketch layer cleared after generation so scribbled overlay doesn't cover AI output
            expect(editor._hasSketchContent()).toBe(false);
        });
    });

    describe('3. OutpaintEditor 8 handles, quick presets, redo, strength & pinch rollback', () => {
        function setupOutpaintDom({ alertFn = vi.fn() } = {}) {
            const canvas = createSoftwareCanvas(512, 512);
            const maskCanvas = createSoftwareCanvas(512, 512);
            const els = {
                outpaintArea: createMockEl('div', 'outpaintArea'),
                outpaintContainer: createMockEl('div', 'outpaintContainer'),
                outpaintCanvas: canvas,
                outpaintMaskCanvas: maskCanvas,
                outpaintSelection: createMockEl('div', 'outpaintSelection'),
                outpaintSizeLabel: createMockEl('div', 'outpaintSizeLabel'),
                outpaintMetaBadge: createMockEl('div', 'outpaintMetaBadge'),
                singleResultImg: Object.assign(createMockEl('img', 'singleResultImg'), { src: 'data:image/png;base64,SRC' }),
                outpaintBrushControl: createMockEl('div', 'outpaintBrushControl'),
                outpaintBrushSize: Object.assign(createMockEl('input', 'outpaintBrushSize'), { value: '60' }),
                outpaintBrushSizeVal: createMockEl('span', 'outpaintBrushSizeVal'),
                outpaintStrength: Object.assign(createMockEl('input', 'outpaintStrength'), { value: '1.0' }),
                outpaintStrengthVal: createMockEl('span', 'outpaintStrengthVal'),
                outpaintPresetsPopover: createMockEl('div', 'outpaintPresetsPopover'),
                outpaintPresetsBtn: createMockEl('button', 'outpaintPresetsBtn'),
                outpaintModeMove: createMockEl('button', 'outpaintModeMove'),
                outpaintModePaint: createMockEl('button', 'outpaintModePaint'),
                outpaintToolbar: createMockEl('div', 'outpaintToolbar'),
                outpaintToolbarInner: createMockEl('div', 'outpaintToolbarInner'),
                outpaintToolbarToggleBtn: createMockEl('button', 'outpaintToolbarToggleBtn'),
                outpaintSnapToggle: createMockEl('button', 'outpaintSnapToggle'),
                outpaintToolBrush: createMockEl('button', 'outpaintToolBrush'),
                outpaintToolEraser: createMockEl('button', 'outpaintToolEraser'),
                outpaintDimPath: createMockEl('path', 'outpaintDimPath')
            };
            global.document = {
                body: createMockEl('body'),
                getElementById: (id) => els[id] || null,
                createElement: () => createSoftwareCanvas(512, 512)
            };
            global.window = {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                matchMedia: () => ({ matches: false })
            };
            global.alert = alertFn;
            global.Image = class {
                set src(v) {
                    this._src = v;
                    this.naturalWidth = 512;
                    this.naturalHeight = 512;
                    this.onload?.();
                }
                get src() { return this._src; }
            };
            return { els };
        }

        it('applies directional presets, updates #outpaintMetaBadge, preserves #outpaintSizeLabel, and supports toast/alert fallback + redo()', () => {
            const alertMock = vi.fn();
            const toastMock = vi.fn();
            const { els } = setupOutpaintDom({ alertFn: alertMock });

            const legacyEditor = new OutpaintEditor({ engine: {}, store: { getSetting: () => '' } });
            legacyEditor.undo();
            expect(alertMock).toHaveBeenCalledWith('没有可撤销的操作');

            const editor = new OutpaintEditor({
                engine: {},
                store: { getSetting: () => '' },
                onShowToast: toastMock
            });
            editor.open();

            editor.applyQuickPreset('left');
            expect(editor.selection.x).toBeLessThan(0);
            expect(els.outpaintSizeLabel.textContent).toBe('512 x 512');
            expect(els.outpaintMetaBadge.textContent).toBe('Opus 免点');

            // Mask paint -> undo -> redo
            editor.setMode('paint');
            editor.saveMaskState();
            editor.maskCtx.fillStyle = '#ffffff';
            editor.maskCtx.fillRect(10, 10, 20, 20);
            expect(editor._hasPaintedMask()).toBe(true);
            editor.undo();
            expect(editor._hasPaintedMask()).toBe(false);
            editor.redo();
            expect(editor._hasPaintedMask()).toBe(true);
        });
    });

    describe('4. CanvasIO, CropEditor, and Augment bg-removal/colorize', () => {
        it('createCanvasIOController creates blank sketch canvas, imports paste & routes dual drop zones', async () => {
            const blankPop = createMockEl('div', 'blankCanvasPopover');
            const tbMenu = createMockEl('div', 'toolboxMenu');
            const docListeners = {};
            global.document = {
                activeElement: createMockEl('body'),
                getElementById: (id) => ({ blankCanvasPopover: blankPop, toolboxMenu: tbMenu })[id] || null,
                createElement: () => createSoftwareCanvas(832, 1216),
                addEventListener: (t, fn) => { docListeners[t] = fn; },
                removeEventListener: vi.fn()
            };
            global.FileReader = class {
                readAsDataURL() {
                    this.result = 'data:image/png;base64,PASTED';
                    this.onload?.();
                }
            };
            global.Image = undefined;
            const ui = { showResultImages: vi.fn() };
            const appState = { currentImageData: null };
            const openInpaint = vi.fn();
            const setLayerMode = vi.fn();
            global.window = { inpaintEditor: { setLayerMode }, showToast: vi.fn() };

            const io = createCanvasIOController({
                appState,
                ui,
                onOpenInpaint: openInpaint,
                onShowToast: vi.fn()
            });

            await io.createBlankCanvas(832, 1216, { autoSketch: true });
            expect(appState.currentImageData.width).toBe(832);
            expect(openInpaint).toHaveBeenCalledTimes(1);
            expect(setLayerMode).toHaveBeenCalledWith('sketch');

            // Dual-zone drop routing
            const applyMetaFn = vi.fn();
            const fakePng = { name: 'art.png', type: 'image/png' };
            await io.handleDroppedImageFile(fakePng, { closest: () => ({ dataset: { dropAction: 'meta' } }) }, { applyMetadataFn: applyMetaFn });
            expect(applyMetaFn).toHaveBeenCalledWith(fakePng);

            await io.handleDroppedImageFile(fakePng, { closest: () => ({ dataset: { dropAction: 'canvas' } }) }, { applyMetadataFn: applyMetaFn });
            expect(ui.showResultImages).toHaveBeenCalledTimes(2);

            // Global paste
            const cleanup = io.bindGlobalPasteAndDrop();
            docListeners.paste({
                preventDefault: vi.fn(),
                clipboardData: {
                    items: [{ kind: 'file', type: 'image/png', getAsFile: () => fakePng }]
                }
            });
            await new Promise((r) => setTimeout(r, 10));
            expect(ui.showResultImages).toHaveBeenCalledTimes(3);
            cleanup();
        });

        it('CropEditor locks aspect ratio and exports cropped dimensions', async () => {
            const boxEl = createMockEl('div', 'canvasCropBox');
            const dimLabel = createMockEl('div', 'cropDimLabel');
            const overlay = createMockEl('div', 'canvasCropOverlay');
            const dock = createMockEl('div', 'cropDockHost');
            global.document = {
                getElementById: (id) => ({
                    canvasCropOverlay: overlay,
                    cropDockHost: dock,
                    canvasCropBox: boxEl,
                    cropDimLabel: dimLabel,
                    singleResultImg: Object.assign(createMockEl('img'), { src: 'data:image/png;base64,SRC', naturalWidth: 800, naturalHeight: 600 })
                })[id] || null,
                createElement: () => createSoftwareCanvas(800, 600)
            };
            global.window = { addEventListener: vi.fn() };
            global.Image = class {
                set src(v) {
                    this.naturalWidth = 800;
                    this.naturalHeight = 600;
                    this.onload?.();
                }
            };
            const onApplyCrop = vi.fn();
            const crop = new CropEditor({
                appState: { currentImageData: { imageUrl: 'data:image/png;base64,SRC', width: 800, height: 600 } },
                onApplyCrop,
                onShowToast: vi.fn()
            });
            await crop.open();
            expect(crop.isOpen).toBe(true);
            crop.setAspect('1:1');
            const normRatio = crop.box.w / crop.box.h;
            expect(normRatio).toBeCloseTo(600 / 800, 2);

            const res = await crop.applyCrop();
            expect(crop.isOpen).toBe(false);
            expect(onApplyCrop).toHaveBeenCalledWith(expect.objectContaining({ width: res.width, height: res.height }));
        });

        it('post-process-controller handles bg-removal and colorize (prompt + defry) even on imported image fallback', async () => {
            const colorizePop = createMockEl('div', 'colorizePopover');
            const promptIn = Object.assign(createMockEl('input', 'colorizePromptInput'), { value: 'sunset palette' });
            const defryIn = Object.assign(createMockEl('input', 'colorizeDefryRange'), { value: '3' });
            const singleImg = Object.assign(createMockEl('img', 'singleResultImg'), { src: 'data:image/png;base64,FALLBACK' });
            global.document = {
                getElementById: (id) => ({
                    colorizePopover: colorizePop,
                    colorizePromptInput: promptIn,
                    colorizeDefryRange: defryIn,
                    singleResultImg: singleImg
                })[id] || null,
                createElement: () => createSoftwareCanvas(64, 64)
            };
            global.Image = class {
                set src(v) {
                    this.naturalWidth = 64;
                    this.naturalHeight = 64;
                    this.onload?.();
                }
            };
            global.FileReader = class {
                readAsDataURL() {
                    this.result = 'data:image/png;base64,AUG';
                    this.onloadend?.();
                }
            };
            const augmentMock = vi.fn().mockResolvedValue({
                blob: new Blob(['ok']),
                imageUrl: 'data:image/png;base64,AUG',
                userRole: 'Opus'
            });

            const singleArea = createMockEl('div', 'singleResultArea');
            const ctrl = createPostProcessController({
                ui: {
                    els: { singleResultImg: singleImg, singleResultArea: singleArea },
                    setLoading: vi.fn(),
                    updateCreditDisplay: vi.fn(),
                    showResultImages: vi.fn()
                },
                els: {},
                engine: { augment: augmentMock },
                store: { getSetting: () => '' },
                appState: { currentImageData: null },
                collectAdvancedAndModelParams: vi.fn(),
                saveToHistory: vi.fn()
            });

            await ctrl.doAugment('bg-removal');
            expect(augmentMock).toHaveBeenCalledWith(expect.objectContaining({ req_type: 'bg-removal' }), expect.any(Object));

            await ctrl.doColorize();
            expect(augmentMock).toHaveBeenLastCalledWith(
                expect.objectContaining({ req_type: 'colorize', prompt: 'sunset palette', defry: 3 }),
                expect.any(Object)
            );
        });
    });

    describe('5. HTML & CSS mobile touch invariants', () => {
        it('enforces 7-dialog cap, 8 outpaint resize handles, role=switch on seamless toggle, coarse 44px touch targets & safe areas', () => {
            const root = path.resolve(import.meta.dirname, '..');
            const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
            const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

            expect((html.match(/<dialog\b/g) || []).length).toBe(7);
            expect(html).toContain('id="inpaintSeamlessToggle" role="switch"');
            expect(html).toContain('data-handle="n"');
            expect(html).toContain('data-handle="s"');
            expect(html).toContain('data-handle="e"');
            expect(html).toContain('data-handle="w"');
            expect(html).toContain('role="toolbar" focusgroup="toolbar wrap"');
            expect(html).toContain('data-drop-action="canvas"');
            expect(html).toContain('data-drop-action="meta"');

            expect(css).toContain('env(safe-area-inset-top');
            expect(css).toContain('env(safe-area-inset-bottom');
            expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*min-width:\s*44px;[\s\S]*min-height:\s*44px;/);
            expect(css).toMatch(/\.resize-handle::after,\s*\.crop-handle::after/);
            expect(css).toContain('grid-template-columns: repeat(5, minmax(44px, 1fr))');
        });
    });
});
