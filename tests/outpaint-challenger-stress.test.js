import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OutpaintEditor } from '../src/outpaint.js';

describe('Adversarial Challenger Stress Tests for Outpainting & Infinite Canvas', () => {
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
                    left: 100,
                    top: 50,
                    right: 900,
                    bottom: 650,
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
                this.naturalWidth = 1024;
                this.naturalHeight = 768;
                this.width = 1024;
                this.height = 768;
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
    });

    // =========================================================================
    // Stress Suite 1: Rapid Toolbar Toggle & Extreme Dragging / Boundary Clamping
    // =========================================================================
    describe('Stress Suite 1: Toolbar Rapid Toggle & Extreme Boundary Clamping', () => {
        it('1.1 Stress test 5,000 rapid random and alternating toggles', () => {
            const inner = getOrCreateMockElement('outpaintToolbarInner');
            const toggleBtn = getOrCreateMockElement('outpaintToolbarToggleBtn');

            let expectedState = false;
            for (let i = 0; i < 5000; i++) {
                if (i % 3 === 0) {
                    // Force state
                    const force = i % 2 === 0;
                    editor.toggleToolbar(force);
                    expectedState = !force;
                } else {
                    // Regular toggle
                    editor.toggleToolbar();
                    expectedState = !expectedState;
                }

                expect(editor.isToolbarCollapsed).toBe(expectedState);
                expect(inner.classList.contains('collapsed')).toBe(expectedState);
                expect(toggleBtn.classList.contains('collapsed')).toBe(expectedState);
            }
        });

        it('1.2 Clamping against massive negative, extreme positive, NaN, and sub-pixel coordinates', () => {
            const toolbar = getOrCreateMockElement('outpaintToolbar');
            const area = getOrCreateMockElement('outpaintArea');

            area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
            toolbar.getBoundingClientRect = () => ({ width: 60, height: 300 });

            const testCoords = [
                { left: -999999, top: -888888, expectL: 0, expectT: 0 },
                { left: 999999, top: 888888, expectL: 740, expectT: 300 }, // maxLeft = 800 - 60 = 740, maxTop = 600 - 300 = 300
                { left: 123.456, top: 234.789, expectL: 123, expectT: 235 },
                { left: 0, top: 0, expectL: 0, expectT: 0 },
                { left: 740, top: 300, expectL: 740, expectT: 300 },
                { left: 741, top: 301, expectL: 740, expectT: 300 }
            ];

            for (const tc of testCoords) {
                toolbar.style.left = `${tc.left}px`;
                toolbar.style.top = `${tc.top}px`;
                editor.clampToolbarPosition();

                expect(toolbar.style.left).toBe(`${tc.expectL}px`);
                expect(toolbar.style.top).toBe(`${tc.expectT}px`);
                expect(toolbar.style.right).toBe('auto');
                expect(toolbar.style.bottom).toBe('auto');
            }
        });

        it('1.3 Degenerate window sizes (area smaller than toolbar)', () => {
            const toolbar = getOrCreateMockElement('outpaintToolbar');
            const area = getOrCreateMockElement('outpaintArea');

            // Area is only 40x100, while toolbar is 60x300
            area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 40, height: 100 });
            toolbar.getBoundingClientRect = () => ({ width: 60, height: 300 });

            toolbar.style.left = '100px';
            toolbar.style.top = '200px';
            editor.clampToolbarPosition();

            // maxLeft = Math.max(0, 40 - 60) = 0
            // maxTop = Math.max(0, 100 - 300) = 0
            expect(toolbar.style.left).toBe('0px');
            expect(toolbar.style.top).toBe('0px');
        });

        it('1.4 Zero-size area edge case does not crash or corrupt styles', () => {
            const toolbar = getOrCreateMockElement('outpaintToolbar');
            const area = getOrCreateMockElement('outpaintArea');

            area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
            toolbar.style.left = '50px';
            toolbar.style.top = '50px';

            expect(() => editor.clampToolbarPosition()).not.toThrow();
            // style left and top remain unchanged because of early return
            expect(toolbar.style.left).toBe('50px');
        });
    });

    // =========================================================================
    // Stress Suite 2: Extreme Zoom Invariance & Rapid Pan Sequences
    // =========================================================================
    describe('Stress Suite 2: Extreme Zoom & Viewport Math Invariance', () => {
        it('2.1 Zoom clamping at scale extremes (0.05 and 10.0) after 1000 zoom operations', () => {
            // Extreme zoom in 1000 times
            for (let i = 0; i < 1000; i++) {
                editor.zoomIn();
            }
            expect(editor.transform.scale).toBe(10);

            // Extreme zoom out 1000 times
            for (let i = 0; i < 1000; i++) {
                editor.zoomOut();
            }
            expect(editor.transform.scale).toBe(0.05);
        });

        it('2.2 Mathematical invariance of focal point during zoom with non-zero viewport offset', () => {
            const area = getOrCreateMockElement('outpaintArea');
            area.getBoundingClientRect = () => ({ left: 150, top: 80, width: 1000, height: 800 });

            editor.transform = { x: 200, y: 150, scale: 1.0 };

            // Arbitrary cursor position
            const clientX = 450;
            const clientY = 320;
            const focalX = clientX - 150; // 300
            const focalY = clientY - 80;  // 240

            // World coordinates under cursor before zoom
            const worldXBefore = (focalX - editor.transform.x) / editor.transform.scale;
            const worldYBefore = (focalY - editor.transform.y) / editor.transform.scale;

            // Zoom in with factor 1.37
            editor._zoom(1.37, clientX, clientY);

            // World coordinates under cursor after zoom
            const worldXAfter = (focalX - editor.transform.x) / editor.transform.scale;
            const worldYAfter = (focalY - editor.transform.y) / editor.transform.scale;

            expect(worldXAfter).toBeCloseTo(worldXBefore, 6);
            expect(worldYAfter).toBeCloseTo(worldYBefore, 6);

            // Repeat 50 consecutive zoom cycles at arbitrary points
            for (let i = 0; i < 50; i++) {
                const randFactor = 0.5 + Math.random();
                const randX = 150 + Math.random() * 1000;
                const randY = 80 + Math.random() * 800;
                const localFocalX = randX - 150;
                const localFocalY = randY - 80;

                const expectedWorldX = (localFocalX - editor.transform.x) / editor.transform.scale;
                const expectedWorldY = (localFocalY - editor.transform.y) / editor.transform.scale;

                editor._zoom(randFactor, randX, randY);

                const currentScale = editor.transform.scale;
                if (currentScale > 0.05 && currentScale < 10.0) {
                    const actualWorldX = (localFocalX - editor.transform.x) / currentScale;
                    const actualWorldY = (localFocalY - editor.transform.y) / currentScale;
                    expect(actualWorldX).toBeCloseTo(expectedWorldX, 5);
                    expect(actualWorldY).toBeCloseTo(expectedWorldY, 5);
                }
            }
        });

        it('2.3 Wheel event zoom vs panning differentiation under wheel sequences', () => {
            const area = getOrCreateMockElement('outpaintArea');
            const wheelHandler = area.listeners['wheel']?.[0];
            expect(wheelHandler).toBeDefined();

            editor.transform = { x: 0, y: 0, scale: 1.0 };

            // 1. Regular wheel pan
            wheelHandler({
                preventDefault: vi.fn(),
                ctrlKey: false,
                deltaX: 25,
                deltaY: -40
            });
            expect(editor.transform.x).toBe(-25);
            expect(editor.transform.y).toBe(40);
            expect(editor.transform.scale).toBe(1.0);

            // 2. Ctrl + Wheel Zoom
            wheelHandler({
                preventDefault: vi.fn(),
                ctrlKey: true,
                deltaY: -100, // zoom in
                clientX: 500,
                clientY: 400
            });
            expect(editor.transform.scale).toBeCloseTo(1.1, 5);
        });

        it('2.4 Rapid pan sequence with 10,000 steps maintains numeric stability', () => {
            editor.transform = { x: 0, y: 0, scale: 1.5 };
            editor.isPanning = true;
            editor.lastMouse = { x: 100, y: 100 };
            editor.startTransform = { x: 0, y: 0, scale: 1.5 };

            const moveHandler = windowListeners['mousemove']?.[0];
            expect(moveHandler).toBeDefined();

            for (let i = 1; i <= 1000; i++) {
                moveHandler({
                    clientX: 100 + i * 0.5,
                    clientY: 100 - i * 0.25
                });
                expect(editor.transform.x).toBeCloseTo(i * 0.5, 4);
                expect(editor.transform.y).toBeCloseTo(-i * 0.25, 4);
            }

            expect(isNaN(editor.transform.x)).toBe(false);
            expect(isNaN(editor.transform.y)).toBe(false);
        });
    });

    // =========================================================================
    // Stress Suite 3: Selection Box Extreme Dragging, Handle Resizing, Snapping & Quantization
    // =========================================================================
    describe('Stress Suite 3: Selection Box Handle Resizing, Boundary Clamping & Snapping', () => {
        it('3.1 All 8 resize handles correctly update dimensions and anchor positions', () => {
            const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
            const moveHandler = windowListeners['mousemove']?.[0];
            const upHandler = windowListeners['mouseup']?.[0];

            for (const handle of handles) {
                editor.isSnapEnabled = false;
                editor.transform = { x: 0, y: 0, scale: 1.0 };
                editor.selection = { x: 200, y: 200, w: 512, h: 512 };
                editor.startSelection = { x: 200, y: 200, w: 512, h: 512 };
                editor.isResizing = true;
                editor.resizeHandle = handle;
                editor.lastMouse = { x: 200, y: 200 };

                // Drag mouse by (+50, +30)
                moveHandler({ clientX: 250, clientY: 230 });

                if (handle.includes('e')) expect(editor.selection.w).toBe(562);
                if (handle.includes('w')) {
                    expect(editor.selection.w).toBe(462);
                    expect(editor.selection.x).toBe(250);
                }
                if (handle.includes('s')) expect(editor.selection.h).toBe(542);
                if (handle.includes('n')) {
                    expect(editor.selection.h).toBe(482);
                    expect(editor.selection.y).toBe(230);
                }

                // Release mouse -> Quantize to 64px multiple
                upHandler();
                expect(editor.selection.w % 64).toBe(0);
                expect(editor.selection.h % 64).toBe(0);
                expect(Number.isInteger(editor.selection.x)).toBe(true);
                expect(Number.isInteger(editor.selection.y)).toBe(true);
            }
        });

        it('3.2 Extreme resizing shrink cannot reduce dimensions below 64px min', () => {
            const moveHandler = windowListeners['mousemove']?.[0];
            const upHandler = windowListeners['mouseup']?.[0];

            editor.isSnapEnabled = false;
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 200, y: 200, w: 512, h: 512 };
            editor.startSelection = { x: 200, y: 200, w: 512, h: 512 };
            editor.isResizing = true;
            editor.resizeHandle = 'se';
            editor.lastMouse = { x: 200, y: 200 };

            // Drag mouse far inward by -1000px
            moveHandler({ clientX: -800, clientY: -800 });
            expect(editor.selection.w).toBe(64);
            expect(editor.selection.h).toBe(64);

            upHandler();
            expect(editor.selection.w).toBe(64);
            expect(editor.selection.h).toBe(64);
        });

        it('3.3 Extreme resizing expansion strictly clamped to maxPixels limit', () => {
            const moveHandler = windowListeners['mousemove']?.[0];
            const upHandler = windowListeners['mouseup']?.[0];

            editor.isSnapEnabled = false;
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 0, y: 0, w: 512, h: 512 };
            editor.startSelection = { x: 0, y: 0, w: 512, h: 512 };
            editor.isResizing = true;
            editor.resizeHandle = 'se';
            editor.lastMouse = { x: 0, y: 0 };

            // Try to expand to 4000 x 4000 (16M pixels)
            moveHandler({ clientX: 3488, clientY: 3488 });

            // Area must not exceed maxPixels (1,048,576)
            expect(editor.selection.w * editor.selection.h).toBeLessThanOrEqual(1024 * 1024 + 1);

            upHandler();
            expect(editor.selection.w * editor.selection.h).toBeLessThanOrEqual(1024 * 1024);
            expect(editor.selection.w % 64).toBe(0);
            expect(editor.selection.h % 64).toBe(0);
        });

        it('3.4 Magnetic snapping to 4 canvas borders when dragging selection', () => {
            const moveHandler = windowListeners['mousemove']?.[0];
            const upHandler = windowListeners['mouseup']?.[0];

            editor.els.canvas.width = 1024;
            editor.els.canvas.height = 768;
            editor.selection = { x: 100, y: 100, w: 512, h: 512 };
            editor.startSelection = { x: 100, y: 100, w: 512, h: 512 };
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.isDraggingSelection = true;
            editor.isSnapEnabled = true;
            editor.lastMouse = { x: 100, y: 100 };

            // 1. Drag near left edge (x = 5 -> within 12px threshold)
            moveHandler({ clientX: 5, clientY: 100 });
            expect(editor.selection.x).toBe(0);

            // 2. Drag near right edge (x + w = 1020 -> canvasW - w = 512, x should be 512)
            moveHandler({ clientX: 510, clientY: 100 }); // dx = 410 -> newX = 510, newX + w = 1022 (within 12px of 1024)
            expect(editor.selection.x).toBe(512);

            // 3. Drag near top edge (y = 8 -> within 12px)
            moveHandler({ clientX: 100, clientY: 8 });
            expect(editor.selection.y).toBe(0);

            // 4. Drag near bottom edge (canvasH - h = 768 - 512 = 256)
            moveHandler({ clientX: 100, clientY: 254 }); // dy = 154 -> newY = 254, newY + h = 766 (within 12px of 768)
            expect(editor.selection.y).toBe(256);

            upHandler();
            expect(Number.isInteger(editor.selection.x)).toBe(true);
            expect(Number.isInteger(editor.selection.y)).toBe(true);
        });

        it('3.5 Magnetic snapping during resize handles to canvas boundaries', () => {
            const moveHandler = windowListeners['mousemove']?.[0];
            const upHandler = windowListeners['mouseup']?.[0];

            editor.els.canvas.width = 1024;
            editor.els.canvas.height = 768;
            editor.transform = { x: 0, y: 0, scale: 1.0 };
            editor.selection = { x: 0, y: 0, w: 512, h: 512 };
            editor.startSelection = { x: 0, y: 0, w: 512, h: 512 };
            editor.isResizing = true;
            editor.isSnapEnabled = true;
            editor.resizeHandle = 'e';
            editor.lastMouse = { x: 512, y: 0 };

            // Drag east handle near canvas width (1020 -> within 12px of 1024)
            moveHandler({ clientX: 1020, clientY: 0 });
            expect(editor.selection.w).toBe(1024);

            upHandler();
            expect(editor.selection.w).toBe(1024);
            expect(editor.selection.x).toBe(0);
        });
    });

    // =========================================================================
    // Stress Suite 4: Mask Drawing, 1-Channel Uint8Array Compaction & Undo Stack
    // =========================================================================
    describe('Stress Suite 4: Mask History Compaction, Eraser & Memory Scalability', () => {
        it('4.1 Compacting 100 mask states verifies 75% memory compression and 100% pixel fidelity', () => {
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;

            const maskCtx = maskCanvas.getContext('2d');
            const fullRgbaData = new Uint8ClampedArray(512 * 512 * 4);
            // Put test pattern in alpha
            for (let i = 0; i < 512 * 512; i++) {
                if (i % 7 === 0) {
                    fullRgbaData[i * 4] = 255;
                    fullRgbaData[i * 4 + 1] = 255;
                    fullRgbaData[i * 4 + 2] = 255;
                    fullRgbaData[i * 4 + 3] = 255;
                }
            }
            maskCtx.getImageData.mockReturnValue({
                width: 512,
                height: 512,
                data: fullRgbaData
            });

            // Save mask state
            editor.saveMaskState();
            expect(editor.maskHistory.length).toBe(1);

            const savedState = editor.maskHistory[0];
            expect(savedState.alpha instanceof Uint8Array).toBe(true);
            expect(savedState.alpha.length).toBe(512 * 512); // Exactly 262,144 bytes vs 1,048,576 bytes RGBA

            // Restore mask state
            editor._restoreMaskState(savedState);
            expect(maskCtx.putImageData).toHaveBeenCalled();
            const restoredCall = maskCtx.putImageData.mock.calls[0][0];
            expect(restoredCall.width).toBe(512);
            expect(restoredCall.height).toBe(512);
            // Verify restored pattern
            for (let i = 0; i < 512 * 512; i++) {
                if (i % 7 === 0) {
                    expect(restoredCall.data[i * 4 + 3]).toBe(255);
                } else {
                    expect(restoredCall.data[i * 4 + 3]).toBe(0);
                }
            }
        });

        it('4.2 Stress test continuous brush and eraser drawing strokes', () => {
            const maskCanvas = getOrCreateMockElement('outpaintMaskCanvas');
            const maskCtx = maskCanvas.getContext('2d');

            editor.setMode('paint');
            editor.setTool('brush');
            editor.els.brushSizeInput.value = '40';

            // Start brush stroke
            editor._drawOnMask({ x: 100, y: 100 }, true);
            expect(maskCtx.save).toHaveBeenCalled();
            expect(maskCtx.arc).toHaveBeenCalledWith(100, 100, 20, 0, Math.PI * 2);

            // Drag brush stroke to 100 points
            for (let i = 1; i <= 100; i++) {
                editor._drawOnMask({ x: 100 + i, y: 100 + i }, false);
                expect(maskCtx.lineTo).toHaveBeenCalledWith(100 + i, 100 + i);
            }

            // Switch to eraser
            editor.setTool('eraser');
            editor._drawOnMask({ x: 200, y: 200 }, true);
            expect(maskCtx.globalCompositeOperation).toBe('destination-out');
        });
    });

    // =========================================================================
    // Stress Suite 5: Generate() Multi-Key Failover & Stitching Alignment
    // =========================================================================
    describe('Stress Suite 5: Multi-Key Resiliency & 1:1 Pixel Crop Alignment', () => {
        it('5.1 Generation multi-key failover correctly rotates through keys and succeeds', async () => {
            mockStore.settings.nai_custom_api_key = 'bad-key-1, bad-key-2, good-key-3';

            let attempt = 0;
            mockEngine.generate = vi.fn().mockImplementation((params, auth) => {
                attempt++;
                if (auth.customApiKey === 'good-key-3') {
                    return Promise.resolve({
                        imageUrl: 'data:image/png;base64,goodResult',
                        userRole: 'opus'
                    });
                }
                return Promise.reject(new Error(`401 Unauthorized for ${auth.customApiKey}`));
            });

            editor.selection = { x: 0, y: 0, w: 512, h: 512 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalledTimes(3);
            expect(attempt).toBe(3);
        });

        it('5.2 Generation with negative coordinates expands canvas and stitches with exact offset math', async () => {
            editor.els.canvas.width = 800;
            editor.els.canvas.height = 600;
            editor.selection = { x: -200, y: -150, w: 512, h: 512 };
            editor.transform = { x: 50, y: 50, scale: 1.2 };

            let onloadCallback;
            global.Image = class {
                constructor() {
                    this.naturalWidth = 512;
                    this.naturalHeight = 512;
                    this.width = 512;
                    this.height = 512;
                    onloadCallback = () => {
                        if (this.onload) this.onload();
                    };
                    setTimeout(onloadCallback, 0);
                }
            };

            await editor.generate();

            // Give onload callback time to execute
            await new Promise(r => setTimeout(r, 10));

            // Target canvas width should expand:
            // newCanvasW = max(800, -200 + 512) = 800
            // newCanvasX = min(0, -200) = -200
            // finalW = 800 - (-200) = 1000
            // finalH = 600 - (-150) = 750
            expect(editor.els.canvas.width).toBe(1000);
            expect(editor.els.canvas.height).toBe(750);

            // Selection and transform adjusted by -newCanvasX (+200) and -newCanvasY (+150)
            expect(editor.selection.x).toBe(0);
            expect(editor.selection.y).toBe(0);
            expect(editor.transform.x).toBe(50 - (-200) * 1.2);
            expect(editor.transform.y).toBe(50 - (-150) * 1.2);
        });
    });
});
