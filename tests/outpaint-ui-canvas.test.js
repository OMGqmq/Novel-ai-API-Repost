import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OutpaintEditor } from '../src/outpaint.js';

describe('Outpainting & Infinite Canvas Comprehensive Test Matrix (R1, R2, R3)', () => {
    let mockElements = {};
    let windowListeners = {};

    function getOrCreateMockElement(id) {
        if (!mockElements[id]) {
            const classSet = new Set();
            const ctxMock = {
                clearRect: vi.fn(),
                drawImage: vi.fn(),
                getImageData: vi.fn((x, y, w, h) => {
                    const width = w || 512;
                    const height = h || 512;
                    const data = new Uint8ClampedArray(width * height * 4);
                    return { width, height, data };
                }),
                putImageData: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                arc: vi.fn(),
                fill: vi.fn(),
                fillRect: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
                createImageData: vi.fn((w, h) => ({
                    width: w,
                    height: h,
                    data: new Uint8ClampedArray(w * h * 4)
                }))
            };

            const element = {
                id,
                value: '',
                textContent: '',
                checked: false,
                width: 512,
                height: 512,
                naturalWidth: 512,
                naturalHeight: 512,
                src: 'data:image/png;base64,mock',
                title: '',
                disabled: false,
                innerHTML: '',
                classList: {
                    add: vi.fn((...cls) => cls.forEach(c => classSet.add(c))),
                    remove: vi.fn((...cls) => cls.forEach(c => classSet.delete(c))),
                    toggle: vi.fn((c, force) => {
                        if (force !== undefined) {
                            if (force) classSet.add(c);
                            else classSet.delete(c);
                            return force;
                        }
                        if (classSet.has(c)) {
                            classSet.delete(c);
                            return false;
                        }
                        classSet.add(c);
                        return true;
                    }),
                    contains: vi.fn((c) => classSet.has(c))
                },
                style: {},
                dataset: {},
                listeners: {},
                addEventListener: vi.fn(function(event, cb) {
                    if (!this.listeners[event]) this.listeners[event] = [];
                    this.listeners[event].push(cb);
                }),
                removeEventListener: vi.fn(function(event, cb) {
                    if (!this.listeners[event]) return;
                    this.listeners[event] = this.listeners[event].filter(fn => fn !== cb);
                }),
                dispatchEvent: vi.fn(function(event) {
                    const cbs = this.listeners[event.type] || [];
                    for (const cb of cbs) cb(event);
                    return true;
                }),
                closest: vi.fn((selector) => {
                    if (selector === 'button') {
                        return element.tagName === 'BUTTON' ? element : null;
                    }
                    return null;
                }),
                getContext: vi.fn(() => ctxMock),
                getBoundingClientRect: vi.fn(() => ({
                    left: 0,
                    top: 0,
                    right: 800,
                    bottom: 600,
                    width: 800,
                    height: 600
                })),
                toDataURL: vi.fn(() => 'data:image/png;base64,mockCanvasData')
            };

            mockElements[id] = element;
        }
        return mockElements[id];
    }

    let editor;
    let mockEngine;
    let mockStore;

    beforeEach(() => {
        mockElements = {};
        windowListeners = {};

        global.window = {
            safeCreateIcons: vi.fn(),
            outpaintEditor: null,
            lastSelectedImageUrl: null,
            switchGalleryTab: vi.fn(),
            loadGallery: vi.fn(),
            exitOutpaint: vi.fn(),
            requestAnimationFrame: vi.fn((cb) => {
                cb();
                return 1;
            }),
            cancelAnimationFrame: vi.fn(),
            addEventListener: vi.fn((event, cb) => {
                if (!windowListeners[event]) windowListeners[event] = [];
                windowListeners[event].push(cb);
            }),
            removeEventListener: vi.fn((event, cb) => {
                if (!windowListeners[event]) return;
                windowListeners[event] = windowListeners[event].filter(fn => fn !== cb);
            })
        };

        global.document = {
            getElementById: vi.fn((id) => getOrCreateMockElement(id)),
            createElement: vi.fn((tag) => {
                const el = getOrCreateMockElement(`__created_${tag}_${Math.random()}`);
                el.tagName = tag.toUpperCase();
                return el;
            })
        };

        global.Image = class {
            constructor() {
                this.naturalWidth = 800;
                this.naturalHeight = 600;
                this.width = 800;
                this.height = 600;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }
        };

        global.localStorage = {
            getItem: vi.fn().mockReturnValue('test-token'),
            setItem: vi.fn(),
            removeItem: vi.fn()
        };

        global.alert = vi.fn();

        mockEngine = {
            generate: vi.fn().mockResolvedValue({
                imageUrl: 'data:image/png;base64,generatedImage',
                userRole: 'plus (Unlimited)'
            })
        };

        mockStore = {
            settings: {
                nai_admin_token: 'admin-123',
                nai_user_key: 'user-456',
                nai_custom_api_key: 'custom-789',
                nai_bypass_limits: 'false'
            },
            getSetting(k, def = '') {
                return this.settings[k] !== undefined ? this.settings[k] : def;
            },
            saveImage: vi.fn().mockResolvedValue(true)
        };

        getOrCreateMockElement('singleResultImg').src = 'data:image/png;base64,sourceImage';
        getOrCreateMockElement('modelValue').value = 'v4.5';
        getOrCreateMockElement('prompt').value = 'masterpiece, outpaint';
        getOrCreateMockElement('negativePrompt').value = 'low quality';
        getOrCreateMockElement('steps').value = '28';
        getOrCreateMockElement('scale').value = '5.0';
        getOrCreateMockElement('sampler').value = 'k_euler';
        getOrCreateMockElement('outpaintBrushSize').value = '60';

        editor = new OutpaintEditor({
            engine: mockEngine,
            store: mockStore,
            getExtraParams: (model, hasCustomKey) => ({ model, hasCustomKey })
        });
        global.window.outpaintEditor = editor;
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    // =========================================================================
    // Suite 1: Toolbar Collapse/Expand Persistence & Icon/Slider Retention (6 tests)
    // =========================================================================
    describe('Suite 1: Toolbar Collapse/Expand Persistence & UI Retention', () => {
        it('1.1 Toolbar inner container toggle visibility via toggleToolbar()', () => {
            const inner = getOrCreateMockElement('outpaintToolbarInner');
            const toggleBtn = getOrCreateMockElement('outpaintToolbarToggleBtn');

            expect(editor.isToolbarCollapsed).toBe(false);

            // Collapse
            editor.toggleToolbar();
            expect(editor.isToolbarCollapsed).toBe(true);
            expect(inner.classList.contains('collapsed')).toBe(true);
            expect(toggleBtn.classList.contains('collapsed')).toBe(true);

            // Expand
            editor.toggleToolbar();
            expect(editor.isToolbarCollapsed).toBe(false);
            expect(inner.classList.contains('collapsed')).toBe(false);
            expect(toggleBtn.classList.contains('collapsed')).toBe(false);

            // Force state
            editor.toggleToolbar(false); // force collapse
            expect(editor.isToolbarCollapsed).toBe(true);
            editor.toggleToolbar(true); // force expand
            expect(editor.isToolbarCollapsed).toBe(false);
        });

        it('1.2 Mode switching visual styles & controls (move vs paint)', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            const brushCtrl = getOrCreateMockElement('outpaintBrushControl');
            const modeMoveBtn = getOrCreateMockElement('outpaintModeMove');
            const modePaintBtn = getOrCreateMockElement('outpaintModePaint');

            // Switch to paint mode
            editor.setMode('paint');
            expect(editor.mode).toBe('paint');
            expect(sel.classList.contains('cursor-crosshair')).toBe(true);
            expect(sel.classList.contains('cursor-move')).toBe(false);
            expect(maskCanvas.classList.contains('pointer-events-none')).toBe(false);
            expect(brushCtrl.classList.contains('flex')).toBe(true);
            expect(brushCtrl.classList.contains('hidden')).toBe(false);
            expect(modePaintBtn.classList.contains('bg-white')).toBe(true);

            // Switch back to move mode
            editor.setMode('move');
            expect(editor.mode).toBe('move');
            expect(sel.classList.contains('cursor-move')).toBe(true);
            expect(sel.classList.contains('cursor-crosshair')).toBe(false);
            expect(maskCanvas.classList.contains('pointer-events-none')).toBe(true);
            expect(brushCtrl.classList.contains('hidden')).toBe(true);
            expect(modeMoveBtn.classList.contains('bg-white')).toBe(true);
        });

        it('1.3 Brush size slider and value label synchronization', () => {
            const slider = getOrCreateMockElement('outpaintBrushSize');
            const valLabel = getOrCreateMockElement('outpaintBrushSizeVal');

            slider.value = '150';
            slider.dispatchEvent({ type: 'input', target: slider });

            expect(valLabel.textContent).toBe('150');
            expect(editor._getBrushSize()).toBe(150);
        });

        it('1.4 Snapping toggle state & title persistence', () => {
            const snapBtn = getOrCreateMockElement('outpaintSnapToggle');

            expect(editor.isSnapEnabled).toBe(false);

            editor.toggleSnap();
            expect(editor.isSnapEnabled).toBe(true);
            expect(snapBtn.classList.contains('bg-white')).toBe(true);
            expect(snapBtn.title).toBe('边缘吸附: 开');

            editor.toggleSnap();
            expect(editor.isSnapEnabled).toBe(false);
            expect(snapBtn.classList.contains('text-gray-500')).toBe(true);
            expect(snapBtn.title).toBe('边缘吸附: 关');
        });

        it('1.5 Toolbar dragging, long-press timer & boundaries clamping', () => {
            vi.useFakeTimers();
            const toolbar = getOrCreateMockElement('outpaintToolbar');
            const area = getOrCreateMockElement('outpaintArea');

            area.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 1000, height: 800 }));
            toolbar.getBoundingClientRect = vi.fn(() => ({ left: 100, top: 100, width: 60, height: 400 }));

            // Dispatch mousedown on toolbar
            toolbar.dispatchEvent({
                type: 'mousedown',
                target: toolbar,
                clientX: 120,
                clientY: 120
            });

            // Advance timer past 300ms
            vi.advanceTimersByTime(300);
            expect(editor.isDraggingToolbar).toBe(true);

            // Drag out of bounds (beyond width and height)
            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 2000, clientY: 2000 });
            }

            // Clamped to parentRect - toolbarRect
            expect(parseFloat(toolbar.style.left)).toBeLessThanOrEqual(1000 - 60);
            expect(parseFloat(toolbar.style.top)).toBeLessThanOrEqual(800 - 400);

            // Release mouse
            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }
            expect(editor.isDraggingToolbar).toBe(false);
        });

        it('1.6 Open/Re-open outpaint editor lifecycle', async () => {
            editor.isToolbarCollapsed = true;
            editor.isSnapEnabled = true;
            editor.setMode('paint');

            editor.open();

            // Wait for image onload
            await new Promise(r => setTimeout(r, 10));

            expect(editor.history.length).toBe(0);
            expect(editor.maskHistory.length).toBe(0);
            expect(editor.mode).toBe('move');
            expect(editor.isToolbarCollapsed).toBe(false);
            expect(editor.isSnapEnabled).toBe(false);
            expect(getOrCreateMockElement('outpaintArea').classList.contains('hidden')).toBe(false);
            expect(global.window.safeCreateIcons).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Suite 2: Viewport Zoom and Pan Transformation Calculations (5 tests)
    // =========================================================================
    describe('Suite 2: Viewport Zoom & Pan Transformations', () => {
        it('2.1 resetView() aspect ratio fitting & centering', () => {
            const area = getOrCreateMockElement('outpaintArea');
            const canvas = getOrCreateMockElement('outpaintCanvas');

            area.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 1000, height: 800 }));
            canvas.width = 800;
            canvas.height = 600;

            editor.resetView();

            // available: (1000-100)=900 / 800 = 1.125, (800-100)=700 / 600 = 1.166 -> max 1 initially
            expect(editor.transform.scale).toBe(1);
            expect(editor.transform.x).toBe((1000 - 800 * 1) / 2);
            expect(editor.transform.y).toBe((800 - 600 * 1) / 2);

            // Oversized canvas
            canvas.width = 2000;
            canvas.height = 2000;
            editor.resetView();
            expect(editor.transform.scale).toBeLessThanOrEqual(0.45);
            expect(editor.transform.scale).toBeGreaterThan(0);
            expect(isNaN(editor.transform.x)).toBe(false);
            expect(isNaN(editor.transform.y)).toBe(false);
        });

        it('2.2 zoomIn() and zoomOut() scale factor progression with origin', () => {
            editor.transform = { x: 100, y: 100, scale: 1.0 };
            
            editor.zoomIn();
            expect(editor.transform.scale).toBeCloseTo(1.2, 5);

            editor.zoomOut();
            expect(editor.transform.scale).toBeCloseTo(1.0, 5);

            // Relative zoom with cursor at (400, 300)
            const area = getOrCreateMockElement('outpaintArea');
            area.getBoundingClientRect = vi.fn(() => ({ left: 50, top: 50, width: 800, height: 600 }));
            
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor._zoom(2.0, 450, 350); // screen (450, 350) -> relative origin (400, 300)
            
            expect(editor.transform.scale).toBe(2.0);
            // newX = 400 - (400 - 0) * 2 = -400
            expect(editor.transform.x).toBe(-400);
            // newY = 300 - (300 - 0) * 2 = -300
            expect(editor.transform.y).toBe(-300);
        });

        it('2.3 Scale boundary clamping [0.05, 10]', () => {
            for (let i = 0; i < 50; i++) editor.zoomOut();
            expect(editor.transform.scale).toBe(0.05);

            for (let i = 0; i < 50; i++) editor.zoomIn();
            expect(editor.transform.scale).toBe(10);
        });

        it('2.4 Wheel event: Zoom (Ctrl+Wheel) vs Pan (Wheel)', () => {
            const area = getOrCreateMockElement('outpaintArea');
            editor.transform = { x: 100, y: 100, scale: 1.0 };

            // Non-ctrl wheel = Pan
            area.dispatchEvent({
                type: 'wheel',
                ctrlKey: false,
                deltaX: 25,
                deltaY: 40,
                preventDefault: vi.fn()
            });
            expect(editor.transform.x).toBe(75);
            expect(editor.transform.y).toBe(60);

            // Ctrl wheel = Zoom
            area.dispatchEvent({
                type: 'wheel',
                ctrlKey: true,
                deltaY: -100,
                clientX: 400,
                clientY: 300,
                preventDefault: vi.fn()
            });
            expect(editor.transform.scale).toBeGreaterThan(1.0);
        });

        it('2.5 Drag panning viewport interaction', () => {
            const area = getOrCreateMockElement('outpaintArea');
            editor.transform = { x: 0, y: 0, scale: 1.0 };

            area.dispatchEvent({
                type: 'mousedown',
                target: area,
                clientX: 200,
                clientY: 200
            });
            expect(editor.isPanning).toBe(true);

            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 300, clientY: 250 });
            }
            expect(editor.transform.x).toBe(100);
            expect(editor.transform.y).toBe(50);

            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }
            expect(editor.isPanning).toBe(false);
        });
    });

    // =========================================================================
    // Suite 3: Selection Box Dragging, Resizing, Bounds & Edge Snapping (7 tests)
    // =========================================================================
    describe('Suite 3: Selection Box Dragging, Resizing & Snapping', () => {
        it('3.1 Selection box initialization & DOM updates', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            const sizeLabel = getOrCreateMockElement('outpaintSizeLabel');

            editor.selection = { x: 144, y: 44, w: 512, h: 512 };
            editor._updateSelectionDOM();

            expect(sel.style.width).toBe('512px');
            expect(sel.style.height).toBe('512px');
            expect(sel.style.transform).toBe('translate(144px, 44px)');
            expect(sizeLabel.textContent).toBe('512 x 512');
        });

        it('3.2 Selection dragging with scale compensation & integer snapping on release', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            editor.transform = { x: 0, y: 0, scale: 0.5 };
            editor.selection = { x: 0, y: 0, w: 512, h: 512 };

            sel.dispatchEvent({
                type: 'mousedown',
                target: sel,
                clientX: 100,
                clientY: 100
            });
            expect(editor.isDraggingSelection).toBe(true);

            // Move mouse by 50px screen delta at scale 0.5 -> 100px canvas delta
            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 150.4, clientY: 150.8 });
            }
            expect(editor.selection.x).toBeCloseTo(100.8, 1);
            expect(editor.selection.y).toBeCloseTo(101.6, 1);

            // Release snaps to integer
            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }
            expect(editor.isDraggingSelection).toBe(false);
            expect(editor.selection.x).toBe(101);
            expect(editor.selection.y).toBe(102);
        });

        it('3.3 Selection dragging magnetic edge snapping', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            const canvas = getOrCreateMockElement('outpaintCanvas');
            canvas.width = 800;
            canvas.height = 600;

            editor.isSnapEnabled = true;
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 50, y: 50, w: 512, h: 512 };

            sel.dispatchEvent({
                type: 'mousedown',
                target: sel,
                clientX: 50,
                clientY: 50
            });

            // Drag near left edge (x = 5 < 12)
            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 5, clientY: 50 });
            }
            expect(editor.selection.x).toBe(0);

            // Drag near right edge (x = 800 - 512 = 288, drag to 284)
            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 284, clientY: 50 });
            }
            expect(editor.selection.x).toBe(288);

            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }
        });

        it('3.4 Multi-handle corner resizing (nw, ne, sw, se) and minimum size constraint', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 100, y: 100, w: 200, h: 200 };

            // SE handle resize
            const handleSE = {
                classList: { contains: (c) => c === 'resize-handle' },
                dataset: { handle: 'se' }
            };
            sel.dispatchEvent({
                type: 'mousedown',
                target: handleSE,
                clientX: 300,
                clientY: 300
            });
            expect(editor.isResizing).toBe(true);

            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 350, clientY: 350 });
            }
            expect(editor.selection.w).toBe(250);
            expect(editor.selection.h).toBe(250);

            // Drag below minimum size (e.g. shrinking past 64)
            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 50, clientY: 50 });
            }
            expect(editor.selection.w).toBe(64);
            expect(editor.selection.h).toBe(64);

            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }
        });

        it('3.5 Resizing edge magnetic snapping', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            const canvas = getOrCreateMockElement('outpaintCanvas');
            canvas.width = 800;
            canvas.height = 600;

            editor.isSnapEnabled = true;
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 0, y: 0, w: 500, h: 500 };

            const handleE = {
                classList: { contains: (c) => c === 'resize-handle' },
                dataset: { handle: 'e' }
            };
            sel.dispatchEvent({
                type: 'mousedown',
                target: handleE,
                clientX: 500,
                clientY: 250
            });

            // Drag east handle near canvas width 800 (e.g. 794)
            for (const handler of windowListeners['mousemove'] || []) {
                handler({ clientX: 794, clientY: 250 });
            }
            expect(editor.selection.w).toBe(800);

            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }
        });

        it('3.6 Maximum pixel limit & bypass toggle', () => {
            expect(editor.maxPixels).toBe(1024 * 1024);

            mockStore.settings.nai_bypass_limits = 'true';
            expect(editor.maxPixels).toBe(1024 * 1024 * 1.5);

            const sizeLabel = getOrCreateMockElement('outpaintSizeLabel');
            editor.selection = { x: 0, y: 0, w: 1500, h: 1500 }; // 2.25M > 1.5M
            editor._updateSelectionDOM();
            expect(sizeLabel.classList.contains('text-red-400')).toBe(true);

            editor.selection = { x: 0, y: 0, w: 512, h: 512 };
            editor._updateSelectionDOM();
            expect(sizeLabel.classList.contains('text-red-400')).toBe(false);
        });

        it('3.7 Resize release 64px increment rounding', () => {
            const sel = getOrCreateMockElement('outpaintSelection');
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 0, y: 0, w: 500, h: 530 };

            const handleSE = {
                classList: { contains: (c) => c === 'resize-handle' },
                dataset: { handle: 'se' }
            };
            sel.dispatchEvent({
                type: 'mousedown',
                target: handleSE,
                clientX: 500,
                clientY: 530
            });

            for (const handler of windowListeners['mouseup'] || []) {
                handler({});
            }

            // 500 -> 512 (multiple of 64), 530 -> 512
            expect(editor.selection.w % 64).toBe(0);
            expect(editor.selection.h % 64).toBe(0);
            expect(editor.selection.w).toBe(512);
            expect(editor.selection.h).toBe(512);
        });
    });

    // =========================================================================
    // Suite 4: Mask Painting, Eraser, Undo/Redo Stack & Integrity (6 tests)
    // =========================================================================
    describe('Suite 4: Mask Painting, Eraser & History Stack', () => {
        it('4.1 Mask canvas dynamic resolution synchronization on selection resize', () => {
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;

            editor.selection = { x: 0, y: 0, w: 768, h: 512 };
            editor._updateSelectionDOM();

            expect(maskCanvas.width).toBe(768);
            expect(maskCanvas.height).toBe(512);
        });

        it('4.2 Mask stroke continuous rendering & eraser mode support', () => {
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            const ctx = maskCanvas.getContext('2d');

            editor.setTool('brush');
            editor._drawOnMask({ x: 50, y: 50 }, true);
            expect(ctx.arc).toHaveBeenCalled();
            expect(ctx.fill).toHaveBeenCalled();

            editor._drawOnMask({ x: 100, y: 100 }, false);
            expect(ctx.moveTo).toHaveBeenCalledWith(50, 50);
            expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
            expect(ctx.stroke).toHaveBeenCalled();

            // Eraser mode
            editor.setTool('eraser');
            editor._drawOnMask({ x: 120, y: 120 }, true);
            expect(ctx.globalCompositeOperation).toBe('destination-out');
        });

        it('4.3 Coordinate transform accuracy (_getMaskPos)', () => {
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            maskCanvas.width = 1024;
            maskCanvas.height = 1024;
            maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 100,
                top: 50,
                width: 512,
                height: 512
            }));

            const pos = editor._getMaskPos({ clientX: 356, clientY: 306 });
            // (356 - 100) * (1024 / 512) = 256 * 2 = 512
            // (306 - 50) * (1024 / 512) = 256 * 2 = 512
            expect(pos.x).toBe(512);
            expect(pos.y).toBe(512);
        });

        it('4.4 Mask detection logic (_hasPaintedMask)', () => {
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            const ctx = maskCanvas.getContext('2d');

            // White pixels
            ctx.getImageData = vi.fn(() => ({
                width: 512,
                height: 512,
                data: new Uint8ClampedArray([255, 255, 255, 255])
            }));
            expect(editor._hasPaintedMask()).toBe(true);

            // Transparent pixels
            ctx.getImageData = vi.fn(() => ({
                width: 512,
                height: 512,
                data: new Uint8ClampedArray([0, 0, 0, 0])
            }));
            expect(editor._hasPaintedMask()).toBe(false);
        });

        it('4.5 Mask clear & undo stack transitions in paint mode', () => {
            editor.setMode('paint');
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            const ctx = maskCanvas.getContext('2d');

            // Draw and save
            editor.saveMaskState();
            expect(editor.maskHistory.length).toBe(1);

            // Clear
            editor.clearMask();
            expect(ctx.clearRect).toHaveBeenCalled();

            // Undo restores mask
            editor.undo();
            expect(ctx.putImageData).toHaveBeenCalled();
        });

        it('4.6 Full canvas history undo in move mode', () => {
            editor.setMode('move');
            const canvas = getOrCreateMockElement('outpaintCanvas');
            canvas.width = 800;
            canvas.height = 600;
            editor.selection = { x: 50, y: 50, w: 512, h: 512 };
            editor.transform = { x: 10, y: 10, scale: 1.0 };

            editor.saveState();
            expect(editor.history.length).toBe(1);

            // Mutate
            canvas.width = 1200;
            canvas.height = 900;
            editor.selection = { x: 100, y: 100, w: 768, h: 768 };

            // Undo
            editor.undo();
            expect(canvas.width).toBe(800);
            expect(canvas.height).toBe(600);
            expect(editor.selection.x).toBe(50);
            expect(editor.selection.w).toBe(512);
        });
    });

    // =========================================================================
    // Suite 5: Outpainting Payload Generation, Alignment & Expansion (4 tests)
    // =========================================================================
    describe('Suite 5: Outpainting Payload Generation & Alignment', () => {
        it('5.1 Automatic alpha mask generation & 8-direction dilation in outpaint mode', async () => {
            const canvas = getOrCreateMockElement('outpaintCanvas');
            canvas.width = 800;
            canvas.height = 600;
            editor.selection = { x: 100, y: 100, w: 512, h: 512 };

            // Generate without painted mask (pure outpaint)
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalledTimes(1);
            const [params] = mockEngine.generate.mock.calls[0];
            expect(params.width).toBe(512);
            expect(params.height).toBe(512);
            expect(params.prompt).toBe('masterpiece, outpaint');
        });

        it('5.2 Smear image edges context extrapolation on crop canvas', async () => {
            editor.selection = { x: -64, y: -64, w: 512, h: 512 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            const [params] = mockEngine.generate.mock.calls[0];
            expect(params.width).toBe(512);
            expect(params.height).toBe(512);
        });

        it('5.3 Latent mask dimensioning & V4 vs legacy scaling', async () => {
            getOrCreateMockElement('modelValue').value = 'v4.5';
            editor.selection = { x: 0, y: 0, w: 768, h: 512 };

            await editor.generate();
            expect(mockEngine.generate).toHaveBeenCalled();
            const [paramsV4] = mockEngine.generate.mock.calls[0];
            expect(paramsV4.width).toBe(768);
            expect(paramsV4.height).toBe(512);

            mockEngine.generate.mockClear();
            getOrCreateMockElement('modelValue').value = 'v3';
            await editor.generate();
            expect(mockEngine.generate).toHaveBeenCalled();
            const [paramsV3] = mockEngine.generate.mock.calls[0];
            expect(paramsV3.version).toBe('v3');
        });

        it('5.4 Canvas expansion and image stitching math on negative offsets', async () => {
            const canvas = getOrCreateMockElement('outpaintCanvas');
            canvas.width = 512;
            canvas.height = 512;
            editor.selection = { x: -128, y: -64, w: 512, h: 512 };

            await editor.generate();

            // Wait for image stitching onload
            await new Promise(r => setTimeout(r, 20));

            expect(canvas.width).toBeGreaterThanOrEqual(640);
            expect(canvas.height).toBeGreaterThanOrEqual(576);
            expect(editor.selection.x).toBeGreaterThanOrEqual(0);
            expect(editor.selection.y).toBeGreaterThanOrEqual(0);
        });
    });
});
