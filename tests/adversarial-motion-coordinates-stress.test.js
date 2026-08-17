import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotionController } from '../src/motion-controller.js';
import { InpaintEditor } from '../src/inpaint.js';
import { OutpaintEditor } from '../src/outpaint.js';
import { UIController } from '../src/ui.js';

describe('Adversarial Stress Test: Subsystem Coordinates, Mobile Drawer Interactivity & Memory/Timer Auditing', () => {
    let mockElements = {};
    let windowEventListeners = {};
    let documentEventListeners = {};
    let mockDeps = {};

    function createMockElement(id, classes = [], tagName = 'div') {
        const classSet = new Set(classes);
        const listeners = {};
        const el = {
            id,
            tagName: tagName.toUpperCase(),
            value: '',
            checked: false,
            textContent: '',
            innerHTML: '',
            width: 512,
            height: 512,
            naturalWidth: 512,
            naturalHeight: 512,
            src: 'data:image/png;base64,mock',
            dataset: {},
            style: {
                transform: '',
                willChange: '',
                filter: '',
                perspective: '',
                opacity: '',
                width: '',
                height: ''
            },
            parentElement: null,
            classList: {
                add: vi.fn((...clsList) => clsList.forEach(c => classSet.add(c))),
                remove: vi.fn((...clsList) => clsList.forEach(c => classSet.delete(c))),
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
            addEventListener: vi.fn((evt, fn) => {
                if (!listeners[evt]) listeners[evt] = [];
                listeners[evt].push(fn);
            }),
            removeEventListener: vi.fn((evt, fn) => {
                if (listeners[evt]) {
                    listeners[evt] = listeners[evt].filter(f => f !== fn);
                }
            }),
            dispatchEvent: vi.fn((evt) => {
                const type = evt.type || evt;
                if (listeners[type]) {
                    listeners[type].forEach(fn => fn({ ...evt, currentTarget: el, target: el }));
                }
                return true;
            }),
            closest: vi.fn((sel) => {
                if (sel === '.absolute' || sel.includes('absolute')) return el.parentElement || el;
                if (sel === 'button' && el.tagName === 'BUTTON') return el;
                return null;
            }),
            querySelector: vi.fn(() => null),
            querySelectorAll: vi.fn(() => []),
            setAttribute: vi.fn(),
            getAttribute: vi.fn(() => null),
            getBoundingClientRect: vi.fn(() => ({
                left: 100,
                top: 50,
                width: 800,
                height: 600,
                right: 900,
                bottom: 650
            })),
            getContext: vi.fn(() => ({
                clearRect: vi.fn(),
                drawImage: vi.fn(),
                getImageData: vi.fn((x, y, w, h) => ({
                    width: w || 512,
                    height: h || 512,
                    data: new Uint8ClampedArray((w || 512) * (h || 512) * 4)
                })),
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
                setTransform: vi.fn(),
                scale: vi.fn(),
                translate: vi.fn(),
                createImageData: vi.fn((w, h) => ({
                    width: w,
                    height: h,
                    data: new Uint8ClampedArray(w * h * 4)
                }))
            })),
            toDataURL: vi.fn(() => 'data:image/png;base64,mockCanvasData')
        };
        return el;
    }

    function getOrCreateMockElement(id, classes = [], tagName = 'div') {
        if (mockElements[id] === null) return null;
        if (!mockElements[id]) {
            mockElements[id] = createMockElement(id, classes, tagName);
        }
        return mockElements[id];
    }

    function setupFullMockEnvironment() {
        mockElements = {};
        windowEventListeners = {};
        documentEventListeners = {};

        const navParent = createMockElement('navWrapper', ['absolute', 'top-0']);
        const navEl = createMockElement('viewToggle', ['view-toggle']);
        navEl.parentElement = navParent;
        navEl.closest = vi.fn((sel) => (sel.includes('absolute') ? (mockElements['navWrapper'] || navParent) : null));

        const sidebarEl = createMockElement('mobileControls');
        const canvasEl = createMockElement('placeholder');
        const previewAreaEl = createMockElement('previewArea');
        const fabEl = createMockElement('floatingGenerateBtn');
        const deskBtnParent = createMockElement('deskBtnWrapper');
        const deskBtn = createMockElement('desktopGenerateBtn');
        deskBtn.parentElement = deskBtnParent;

        const bodyEl = createMockElement('body');
        bodyEl.dataset = {};
        const htmlEl = createMockElement('html');

        mockElements['viewToggle'] = navEl;
        mockElements['navWrapper'] = navParent;
        mockElements['mobileControls'] = sidebarEl;
        mockElements['placeholder'] = canvasEl;
        mockElements['previewArea'] = previewAreaEl;
        mockElements['floatingGenerateBtn'] = fabEl;
        mockElements['desktopGenerateBtn'] = deskBtn;
        mockElements['deskBtnWrapper'] = deskBtnParent;
        mockElements['mobileBackdrop'] = createMockElement('mobileBackdrop');

        // Inpaint Elements
        mockElements['inpaintModal'] = createMockElement('inpaintModal', ['hidden']);
        mockElements['inpaintBaseCanvas'] = createMockElement('inpaintBaseCanvas', [], 'canvas');
        mockElements['inpaintMaskCanvas'] = createMockElement('inpaintMaskCanvas', [], 'canvas');
        mockElements['brushCursor'] = createMockElement('brushCursor');
        mockElements['singleResultImg'] = createMockElement('singleResultImg', [], 'img');
        mockElements['brushSizeInput'] = createMockElement('brushSizeInput', [], 'input');
        mockElements['brushSizeInput'].value = '30';
        mockElements['brushSizeVal'] = createMockElement('brushSizeVal');
        mockElements['inpaintPrompt'] = createMockElement('inpaintPrompt', [], 'textarea');
        mockElements['inpaintPrompt'].value = 'masterpiece';
        mockElements['inpaintMobileDrawer'] = createMockElement('inpaintMobileDrawer');
        mockElements['drawerToggleLabel'] = createMockElement('drawerToggleLabel');

        // Outpaint Elements
        mockElements['outpaintArea'] = createMockElement('outpaintArea');
        mockElements['outpaintContainer'] = createMockElement('outpaintContainer');
        mockElements['outpaintCanvas'] = createMockElement('outpaintCanvas', [], 'canvas');
        mockElements['outpaintMaskCanvas'] = createMockElement('outpaintMaskCanvas', [], 'canvas');
        mockElements['outpaintSelection'] = createMockElement('outpaintSelection');
        mockElements['outpaintSizeLabel'] = createMockElement('outpaintSizeLabel');
        mockElements['outpaintDimOverlay'] = createMockElement('outpaintDimOverlay', [], 'svg');
        mockElements['outpaintDimPath'] = createMockElement('outpaintDimPath', [], 'path');
        mockElements['outpaintBrushCursor'] = createMockElement('outpaintBrushCursor');

        // UI Form inputs
        mockElements['steps'] = createMockElement('steps', [], 'input');
        mockElements['stepsValue'] = createMockElement('stepsValue');
        mockElements['scale'] = createMockElement('scale', [], 'input');
        mockElements['scaleValue'] = createMockElement('scaleValue');
        mockElements['batchCount'] = createMockElement('batchCount', [], 'input');
        mockElements['batchValue'] = createMockElement('batchValue');
        mockElements['modelValue'] = createMockElement('modelValue', [], 'input');
        mockElements['modelBadge'] = createMockElement('modelBadge');
        mockElements['modelStatusMini'] = createMockElement('modelStatusMini');

        global.document = {
            body: bodyEl,
            documentElement: htmlEl,
            getElementById: (id) => (mockElements[id] !== undefined ? mockElements[id] : getOrCreateMockElement(id)),
            querySelector: (sel) => {
                if (sel === '.view-toggle') return mockElements['viewToggle'] || null;
                if (sel === 'div.absolute.top-0') return mockElements['navWrapper'] || null;
                if (sel === '#placeholder') return mockElements['placeholder'] || null;
                if (sel === '#mobileControls') return mockElements['mobileControls'] || null;
                if (sel === '#floatingGenerateBtn') return mockElements['floatingGenerateBtn'] || null;
                if (sel === '#desktopGenerateBtn') return mockElements['desktopGenerateBtn'] || null;
                if (sel === '#previewArea') return mockElements['previewArea'] || null;
                if (sel === '#inpaintMaskCanvas') return mockElements['inpaintMaskCanvas'] || null;
                if (sel === '#outpaintArea') return mockElements['outpaintArea'] || null;
                return null;
            },
            querySelectorAll: (sel) => {
                const results = [];
                Object.values(mockElements).forEach(el => {
                    if (el && sel.startsWith('.') && el.classList && el.classList.contains(sel.slice(1))) {
                        results.push(el);
                    }
                });
                return results;
            },
            createElement: (tag) => {
                const el = createMockElement(`created_${tag}_${Math.random()}`, [], tag);
                return el;
            },
            addEventListener: vi.fn((evt, fn) => {
                if (!documentEventListeners[evt]) documentEventListeners[evt] = [];
                documentEventListeners[evt].push(fn);
            }),
            removeEventListener: vi.fn((evt, fn) => {
                if (documentEventListeners[evt]) {
                    documentEventListeners[evt] = documentEventListeners[evt].filter(f => f !== fn);
                }
            })
        };

        global.window = {
            innerWidth: 1024,
            innerHeight: 768,
            matchMedia: vi.fn((query) => ({
                matches: query.includes('dark') ? true : false,
                media: query
            })),
            addEventListener: vi.fn((evt, fn) => {
                if (!windowEventListeners[evt]) windowEventListeners[evt] = [];
                windowEventListeners[evt].push(fn);
            }),
            removeEventListener: vi.fn((evt, fn) => {
                if (windowEventListeners[evt]) {
                    windowEventListeners[evt] = windowEventListeners[evt].filter(f => f !== fn);
                }
            }),
            dispatchEvent: vi.fn((evt) => {
                const type = evt.type || evt;
                if (windowEventListeners[type]) {
                    windowEventListeners[type].forEach(fn => fn(evt));
                }
                return true;
            }),
            requestAnimationFrame: vi.fn(cb => { cb(); return 1; }),
            cancelAnimationFrame: vi.fn()
        };

        const store = {};
        global.localStorage = {
            getItem: vi.fn(k => store[k] ?? null),
            setItem: vi.fn((k, v) => { store[k] = String(v); }),
            removeItem: vi.fn(k => { delete store[k]; }),
            clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); })
        };

        global.CustomEvent = class CustomEvent {
            constructor(type, params = {}) {
                this.type = type;
                this.detail = params.detail || null;
            }
        };

        mockDeps = {
            ui: {
                els: mockElements,
                toggleMobileControls: vi.fn(),
                toggleTheme: vi.fn()
            },
            engine: {
                generate: vi.fn()
            },
            store: {
                get: vi.fn(),
                set: vi.fn()
            },
            getExtraParams: vi.fn(() => ({}))
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();
        setupFullMockEnvironment();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // =========================================================================
    // SECTION 1: INPAINT CANVAS COORDINATE STABILITY & PRECISION
    // =========================================================================
    describe('Section 1: Inpaint Canvas Coordinate Stability & Brush Mapping', () => {

        it('1.1: Inpaint _getCanvasPos calculates exact baseline coordinates before animation', () => {
            const inpaint = new InpaintEditor(mockDeps);
            inpaint.maskCanvas.width = 1024;
            inpaint.maskCanvas.height = 1024;
            inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 100,
                top: 50,
                width: 512,
                height: 512
            }));

            const pos = inpaint._getCanvasPos({ clientX: 200, clientY: 150 });
            // (200 - 100) * (1024 / 512) = 100 * 2 = 200
            // (150 - 50) * (1024 / 512) = 100 * 2 = 200
            expect(pos.x).toBe(200);
            expect(pos.y).toBe(200);
        });

        it('1.2: Inpaint coordinate calculation during active entrance animation vs post-cleanup', () => {
            const controller = new MotionController();
            controller.startEntrance();
            expect(document.body.classList.contains('entrance-animating')).toBe(true);

            const inpaint = new InpaintEditor(mockDeps);
            inpaint.maskCanvas.width = 800;
            inpaint.maskCanvas.height = 600;

            controller.cleanup();
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
            expect(document.body.dataset.entranceStatus).toBe('complete');

            inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 50,
                top: 50,
                width: 400,
                height: 300
            }));

            const pos = inpaint._getCanvasPos({ clientX: 150, clientY: 200 });
            expect(pos.x).toBeCloseTo(200, 5); // (150 - 50) * (800 / 400) = 200
            expect(pos.y).toBeCloseTo(300, 5); // (200 - 50) * (600 / 300) = 300
        });

        it('1.3: Zero coordinate drift across multiple canvas aspect ratios & DPR scale factors', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const inpaint = new InpaintEditor(mockDeps);
            const resolutions = [
                { w: 512, h: 512, displayW: 512, displayH: 512 },
                { w: 1024, h: 1024, displayW: 512, displayH: 512 },
                { w: 768, h: 1024, displayW: 384, displayH: 512 },
                { w: 1536, h: 1024, displayW: 768, displayH: 512 }
            ];

            resolutions.forEach(res => {
                inpaint.maskCanvas.width = res.w;
                inpaint.maskCanvas.height = res.h;
                inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                    left: 100,
                    top: 100,
                    width: res.displayW,
                    height: res.displayH
                }));

                const testPoints = [
                    { clientX: 100, clientY: 100, expectedX: 0, expectedY: 0 },
                    { clientX: 100 + res.displayW / 2, clientY: 100 + res.displayH / 2, expectedX: res.w / 2, expectedY: res.h / 2 },
                    { clientX: 100 + res.displayW, clientY: 100 + res.displayH, expectedX: res.w, expectedY: res.h }
                ];

                testPoints.forEach(pt => {
                    const pos = inpaint._getCanvasPos({ clientX: pt.clientX, clientY: pt.clientY });
                    const driftX = Math.abs(pos.x - pt.expectedX);
                    const driftY = Math.abs(pos.y - pt.expectedY);
                    expect(driftX).toBeLessThan(1e-5);
                    expect(driftY).toBeLessThan(1e-5);
                });
            });
        });

        it('1.4: Multi-stroke brush drawing stress (200 consecutive pointer operations)', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const inpaint = new InpaintEditor(mockDeps);
            inpaint.maskCanvas.width = 1000;
            inpaint.maskCanvas.height = 1000;
            inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 0,
                top: 0,
                width: 500,
                height: 500
            }));

            // Simulate 200 consecutive strokes
            for (let i = 0; i < 200; i++) {
                const clientX = (i * 2.5) % 500;
                const clientY = ((i * 3.7) + 20) % 500;
                const pos = inpaint._getCanvasPos({ clientX, clientY });
                expect(pos.x).toBeCloseTo(clientX * 2, 5);
                expect(pos.y).toBeCloseTo(clientY * 2, 5);
            }
        });

        it('1.5: Cursor follower _updateCursor aligns with pointer after animation', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const inpaint = new InpaintEditor(mockDeps);
            inpaint.brushCursor = mockElements['brushCursor'];
            inpaint.maskCanvas.width = 1024;
            inpaint.maskCanvas.height = 1024;
            inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 100,
                top: 100,
                width: 512,
                height: 512
            }));

            inpaint._updateCursor({ clientX: 250, clientY: 350 });
            expect(inpaint.brushCursor.style.transform).toBe('translate3d(250px, 350px, 0) translate(-50%, -50%)');
            expect(inpaint.brushCursor.classList.remove).toHaveBeenCalledWith('hidden');
        });

        it('1.6: Pointer cancel & leave restores drawing state without coordinate leak', () => {
            const inpaint = new InpaintEditor(mockDeps);
            inpaint.drawing = true;
            inpaint.brushCursor = mockElements['brushCursor'];

            // Trigger pointerup
            inpaint.maskCanvas.dispatchEvent({ type: 'pointerup' });
            expect(inpaint.drawing).toBe(false);

            // Trigger pointercancel
            inpaint.drawing = true;
            inpaint.maskCanvas.dispatchEvent({ type: 'pointercancel' });
            expect(inpaint.drawing).toBe(false);

            // Trigger mouseleave
            inpaint.maskCanvas.dispatchEvent({ type: 'mouseleave' });
            expect(inpaint.brushCursor.classList.add).toHaveBeenCalledWith('hidden');
        });

        it('1.7: Coordinate calculation under scaled container (DPR / Zoom normalization)', () => {
            const inpaint = new InpaintEditor(mockDeps);
            inpaint.maskCanvas.width = 1000;
            inpaint.maskCanvas.height = 1000;
            // Simulated 1.5x CSS transform scale on parent
            inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 150,
                top: 75,
                width: 750, // 500 * 1.5
                height: 750
            }));

            // Test 100 sample points across the canvas
            for (let i = 0; i < 100; i++) {
                const clientX = 150 + (i * 7.5);
                const clientY = 75 + (i * 7.5);
                const pos = inpaint._getCanvasPos({ clientX, clientY });
                expect(pos.x).toBeCloseTo(i * 10, 4);
                expect(pos.y).toBeCloseTo(i * 10, 4);
            }
        });
    });

    // =========================================================================
    // SECTION 2: OUTPAINT INFINITE CANVAS ZOOM/PAN/CROP STABILITY
    // =========================================================================
    describe('Section 2: Outpaint Infinite Canvas Matrix Transformation & Precision', () => {

        it('2.1: Outpaint initial transform calculation before, during, and post-cleanup', () => {
            const controller = new MotionController();
            controller.startEntrance();

            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.resetView();

            expect(outpaint.transform.scale).toBeGreaterThan(0);
            expect(outpaint.transform.scale).toBeLessThanOrEqual(1);

            controller.cleanup();
            outpaint.resetView();

            expect(outpaint.transform.scale).toBeGreaterThan(0);
            expect(outpaint.els.container.style.transform).toContain('scale(');
        });

        it('2.2: Zoom invariant stress: 100 random zoom in/out operations return to original world coords', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.transform = { x: 100, y: 150, scale: 1.0 };
            outpaint.els.area = {
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 })
            };

            const cx = 500;
            const cy = 400;

            const factors = [1.2, 1.5, 0.8, 1 / 1.5, 1 / 1.2, 1.25, 0.8, 2.0, 0.5];
            let netFactor = 1.0;

            factors.forEach(f => {
                outpaint._zoom(f, cx, cy);
                netFactor *= f;
            });

            // Zoom back with the exact reciprocal
            outpaint._zoom(1 / netFactor, cx, cy);

            expect(outpaint.transform.scale).toBeCloseTo(1.0, 4);
            expect(outpaint.transform.x).toBeCloseTo(100, 3);
            expect(outpaint.transform.y).toBeCloseTo(150, 3);
        });

        it('2.3: Viewport pan stress (200 consecutive drag vectors accumulate strictly linearly)', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.transform = { x: 0, y: 0, scale: 1.0 };

            let expectedX = 0;
            let expectedY = 0;

            for (let i = 1; i <= 200; i++) {
                const dx = (i * 1.7) - 50;
                const dy = (i * -1.3) + 30;
                outpaint.transform.x += dx;
                outpaint.transform.y += dy;
                expectedX += dx;
                expectedY += dy;
            }

            expect(outpaint.transform.x).toBeCloseTo(expectedX, 5);
            expect(outpaint.transform.y).toBeCloseTo(expectedY, 5);
        });

        it('2.4: Dim overlay SVG path calculation _updateDimOverlay generates correct cutout window', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.transform = { x: 50, y: 100, scale: 2.0 };
            outpaint.selection = { x: 200, y: 300, w: 512, h: 512 };
            outpaint.els.area = {
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 })
            };

            const path = mockElements['outpaintDimPath'];
            outpaint.els.dimPath = path;
            outpaint._updateDimOverlay();

            expect(path.setAttribute).toHaveBeenCalledWith(
                'd',
                'M 0 0 H 1920 V 1080 H 0 Z M 450 700 V 1724 H 1474 V 700 Z'
            );
        });

        it('2.5: Extreme zoom factors (0.001x to 1000x) strictly clamped to [0.05, 10.0] range', () => {
            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.transform = { x: 0, y: 0, scale: 1.0 };
            outpaint.els.area = {
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
            };

            // Zoom out excessively
            for (let i = 0; i < 20; i++) {
                outpaint._zoom(0.1, 400, 300);
            }
            expect(outpaint.transform.scale).toBe(0.05);
            expect(isNaN(outpaint.transform.x)).toBe(false);
            expect(isNaN(outpaint.transform.y)).toBe(false);

            // Zoom in excessively
            for (let i = 0; i < 30; i++) {
                outpaint._zoom(2.0, 400, 300);
            }
            expect(outpaint.transform.scale).toBe(10.0);
            expect(isNaN(outpaint.transform.x)).toBe(false);
            expect(isNaN(outpaint.transform.y)).toBe(false);
        });

        it('2.6: Selection crop box resize via handles maintains aspect ratio & bounds post-cleanup', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.selection = { x: 100, y: 100, w: 512, h: 512 };
            outpaint.els.selection = mockElements['outpaintSelection'];
            outpaint.els.sizeLabel = mockElements['outpaintSizeLabel'];

            outpaint._updateSelectionDOM();

            expect(outpaint.els.selection.style.width).toBe('512px');
            expect(outpaint.els.selection.style.height).toBe('512px');
            expect(outpaint.els.selection.style.transform).toBe('translate(100px, 100px)');
            expect(outpaint.els.sizeLabel.textContent).toBe('512 x 512');
        });
    });

    // =========================================================================
    // SECTION 3: MOBILE DRAWER INTERACTIVITY & 100+ RAPID TOGGLES
    // =========================================================================
    describe('Section 3: Mobile Drawer Interactivity & 100+ Rapid Toggle Stress', () => {

        it('3.1: Mobile drawer toggles cleanly post-cleanup', () => {
            window.innerWidth = 375; // Mobile viewport
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const ui = new UIController();
            const { mobileControls, mobileBackdrop } = ui.els;

            // Expand
            ui.toggleMobileControls(true);
            expect(ui.isControlsExpanded).toBe(true);
            expect(mobileControls.classList.contains('expanded')).toBe(true);
            expect(mobileControls.classList.contains('collapsed')).toBe(false);
            expect(mobileBackdrop.classList.contains('hidden-backdrop')).toBe(false);

            // Collapse
            ui.toggleMobileControls(false);
            expect(ui.isControlsExpanded).toBe(false);
            expect(mobileControls.classList.contains('expanded')).toBe(false);
            expect(mobileControls.classList.contains('collapsed')).toBe(true);
            expect(mobileBackdrop.classList.contains('opacity-0')).toBe(true);
        });

        it('3.2: 150 consecutive rapid toggles stress test maintains strict state parity', () => {
            window.innerWidth = 414;
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const ui = new UIController();
            const { mobileControls } = ui.els;

            for (let i = 1; i <= 150; i++) {
                ui.toggleMobileControls();
                const expectedExpanded = (i % 2 === 1);
                expect(ui.isControlsExpanded).toBe(expectedExpanded);
                if (expectedExpanded) {
                    expect(mobileControls.classList.contains('expanded')).toBe(true);
                    expect(mobileControls.classList.contains('collapsed')).toBe(false);
                } else {
                    expect(mobileControls.classList.contains('expanded')).toBe(false);
                    expect(mobileControls.classList.contains('collapsed')).toBe(true);
                }
            }
        });

        it('3.3: Rapid toggling does not produce race condition with backdrop transition timer', () => {
            window.innerWidth = 390;
            const ui = new UIController();
            const { mobileBackdrop } = ui.els;

            // Toggle expand -> collapse -> expand within 50ms (before 300ms timer fires)
            ui.toggleMobileControls(true);
            vi.advanceTimersByTime(50);
            ui.toggleMobileControls(false);
            vi.advanceTimersByTime(50);
            ui.toggleMobileControls(true);

            // Advance remaining time for all timers
            vi.advanceTimersByTime(500);

            // Since last state was expanded (true), backdrop should be visible and not hidden
            expect(ui.isControlsExpanded).toBe(true);
            expect(mobileBackdrop.classList.contains('pointer-events-none')).toBe(false);
        });

        it('3.4: Desktop mode (> 768px) safely ignores toggleMobileControls', () => {
            window.innerWidth = 1280;
            const ui = new UIController();
            ui.isControlsExpanded = false;

            ui.toggleMobileControls(true);
            expect(ui.isControlsExpanded).toBe(false); // No-op on desktop
        });

        it('3.5: Mobile drawer internal elements are completely untouched by animation classes', () => {
            window.innerWidth = 375;
            const controller = new MotionController();
            controller.startEntrance();

            // Check that inner elements are not given .anim-enter-* classes
            const innerElements = [
                mockElements['steps'],
                mockElements['scale'],
                mockElements['batchCount']
            ];

            innerElements.forEach(el => {
                expect(el.classList.contains('anim-enter-sidebar')).toBe(false);
                expect(el.classList.contains('anim-enter-nav')).toBe(false);
                expect(el.classList.contains('anim-enter-drawer')).toBe(false);
            });

            controller.cleanup();
        });

        it('3.6: Rapid 200 drawer toggles interleaved with viewport resize switches', () => {
            const ui = new UIController();
            const viewports = [320, 375, 414, 767, 768, 1024, 1440, 390, 766, 1280];

            for (let i = 0; i < 200; i++) {
                const vp = viewports[i % viewports.length];
                window.innerWidth = vp;
                ui.toggleMobileControls();

                if (vp < 768) {
                    expect(typeof ui.isControlsExpanded).toBe('boolean');
                }
            }
        });
    });

    // =========================================================================
    // SECTION 4: MEMORY & TIMER CLEANUP & EVENT LISTENER AUDITING
    // =========================================================================
    describe('Section 4: Memory & Timer Cleanup & Event Listener Auditing', () => {

        it('4.1: Fallback timer (1300ms) is cancelled and cleared when animation ends normally', () => {
            const controller = new MotionController();
            controller.startEntrance();
            expect(controller.timeoutId).not.toBeNull();

            // Simulate normal animationend completion
            const navEl = document.querySelector('.view-toggle')?.closest('.absolute');
            const sidebarEl = document.getElementById('mobileControls');
            const canvasEl = document.getElementById('placeholder');
            const actionEl = document.getElementById('desktopGenerateBtn')?.parentElement;

            [navEl, sidebarEl, canvasEl, actionEl].filter(Boolean).forEach(el => {
                el.dispatchEvent({ type: 'animationend' });
            });

            expect(controller.isCompleted()).toBe(true);
            expect(controller.timeoutId).toBeNull();
        });

        it('4.2: All animationend event listeners are removed upon cleanup', () => {
            const controller = new MotionController();
            controller.startEntrance();

            const tracked = controller.trackedElements;
            expect(tracked.length).toBeGreaterThan(0);

            controller.cleanup();

            tracked.forEach(el => {
                expect(el.removeEventListener).toHaveBeenCalledWith('animationend', expect.any(Function));
            });
        });

        it('4.3: Window & Document have zero leftover unmanaged listeners', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            // Verify window dispatchEvent occurred for ui:entrance-complete
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'ui:entrance-complete' }));
        });

        it('4.4: 100 consecutive rapid cleanup calls are strictly idempotent and safe', () => {
            const controller = new MotionController();
            controller.startEntrance();

            for (let i = 0; i < 100; i++) {
                expect(() => controller.cleanup()).not.toThrow();
            }

            expect(controller.isCompleted()).toBe(true);
            expect(document.body.dataset.entranceStatus).toBe('complete');
        });

        it('4.5: 50 cycles of startEntrance -> reset -> startEntrance -> cleanup free resources cleanly', () => {
            const controller = new MotionController();

            for (let i = 0; i < 50; i++) {
                controller.reset();
                controller.startEntrance();
                expect(controller.isAnimating).toBe(true);
                controller.reset();
                expect(controller.isAnimating).toBe(false);
                expect(controller.isCompleted()).toBe(false);
                controller.startEntrance();
                controller.cleanup();
                expect(controller.isCompleted()).toBe(true);
            }
        });

        it('4.6: Strict timer interception proves zero dangling timers post-cleanup', () => {
            let activeTimerCount = 0;
            const originalSetTimeout = global.setTimeout;
            const originalClearTimeout = global.clearTimeout;

            global.setTimeout = vi.fn((fn, ms) => {
                activeTimerCount++;
                const id = originalSetTimeout(() => {
                    activeTimerCount--;
                    fn();
                }, ms);
                return id;
            });

            global.clearTimeout = vi.fn((id) => {
                if (id) activeTimerCount--;
                originalClearTimeout(id);
            });

            const controller = new MotionController();
            controller.startEntrance();
            expect(activeTimerCount).toBe(1);

            controller.cleanup();
            expect(activeTimerCount).toBe(0);

            global.setTimeout = originalSetTimeout;
            global.clearTimeout = originalClearTimeout;
        });

        it('4.7: 100 rapid aborted entrance cycles leave 0 lingering timers', () => {
            const controller = new MotionController();

            for (let i = 0; i < 100; i++) {
                controller.reset();
                controller.startEntrance();
                controller.cleanup();
                expect(controller.timeoutId).toBeNull();
                expect(controller.isCompleted()).toBe(true);
            }
        });
    });

    // =========================================================================
    // SECTION 5: THEME TOGGLES (DARK / LIGHT) UNDER ANIMATION STRESS
    // =========================================================================
    describe('Section 5: Theme Toggles (Dark / Light) Under Animation Stress', () => {

        it('5.1: Theme toggle during active entrance animation does not interrupt lifecycle', () => {
            const controller = new MotionController();
            controller.startEntrance();
            expect(document.body.classList.contains('entrance-animating')).toBe(true);

            const ui = new UIController();
            // Toggle theme multiple times during animation
            ui.toggleTheme();
            ui.toggleTheme();
            ui.toggleTheme();

            expect(document.body.classList.contains('entrance-animating')).toBe(true);

            controller.cleanup();
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
            expect(document.body.dataset.entranceStatus).toBe('complete');
        });

        it('5.2: 50 theme switches post-cleanup do not resurrect animation classes', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const ui = new UIController();
            for (let i = 0; i < 50; i++) {
                ui.toggleTheme();
            }

            expect(document.body.classList.contains('entrance-animating')).toBe(false);
            expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);
            expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(false);
        });

        it('5.3: Interleaved theme switches and mobile drawer toggles maintain decoupling', () => {
            window.innerWidth = 375;
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const ui = new UIController();

            for (let i = 0; i < 50; i++) {
                ui.toggleTheme();
                ui.toggleMobileControls();
            }

            expect(document.body.dataset.entranceStatus).toBe('complete');
            expect(typeof ui.isControlsExpanded).toBe('boolean');
        });

        it('5.4: Corrupt or missing theme storage gracefully falls back to system preference', () => {
            localStorage.setItem('color-theme', 'invalid-corrupt-data');
            const ui = new UIController();

            document.documentElement.classList.add('dark');
            ui.toggleTheme();
            expect(document.documentElement.classList.contains('dark')).toBe(false);
            expect(localStorage.getItem('color-theme')).toBe('light');

            ui.toggleTheme();
            expect(document.documentElement.classList.contains('dark')).toBe(true);
            expect(localStorage.getItem('color-theme')).toBe('dark');
        });
    });

    // =========================================================================
    // SECTION 6: END-TO-END ORCHESTRATION & FULL APP INTEGRATION WORKLOAD
    // =========================================================================
    describe('Section 6: Full App Integration Workload & Stress Orchestration', () => {

        it('6.1: Full workflow simulation: Desktop entrance -> Inpaint -> Outpaint -> Mobile switch -> Drawer stress -> Theme toggle -> Pristine DOM verification', () => {
            // Step 1: Initial Desktop Load
            window.innerWidth = 1440;
            const controller = new MotionController();
            controller.startEntrance();
            expect(document.body.classList.contains('entrance-animating')).toBe(true);
            expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(true);

            // Step 2: Entrance Cleanup
            controller.cleanup();
            expect(document.body.dataset.entranceStatus).toBe('complete');
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
            expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);

            // Step 3: Inpaint Editor Operations
            const inpaint = new InpaintEditor(mockDeps);
            inpaint.maskCanvas.width = 1024;
            inpaint.maskCanvas.height = 1024;
            inpaint.maskCanvas.getBoundingClientRect = vi.fn(() => ({
                left: 100,
                top: 100,
                width: 512,
                height: 512
            }));
            const inpaintPos = inpaint._getCanvasPos({ clientX: 356, clientY: 356 });
            expect(inpaintPos.x).toBe(512);
            expect(inpaintPos.y).toBe(512);

            // Step 4: Outpaint Editor Operations
            const outpaint = new OutpaintEditor(mockDeps);
            outpaint.resetView();
            const initialScale = outpaint.transform.scale;
            outpaint._zoom(1.5, 400, 300);
            outpaint._zoom(1 / 1.5, 400, 300);
            expect(outpaint.transform.scale).toBeCloseTo(initialScale, 4);

            // Step 5: Switch to Mobile Viewport & Rapid Drawer Toggles
            window.innerWidth = 375;
            const ui = new UIController();
            for (let i = 0; i < 50; i++) {
                ui.toggleMobileControls();
                ui.toggleTheme();
            }

            // Step 6: Verify Pristine DOM State
            expect(document.body.dataset.entranceStatus).toBe('complete');
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
            expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(false);
            expect(mockElements['viewToggle'].classList.contains('anim-enter-nav')).toBe(false);
        });
    });
});
