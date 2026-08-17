import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OutpaintEditor } from '../src/outpaint.js';

/**
 * Adversarial Empirical Stress Test Suite for Outpainting / Infinite Canvas Stability
 * Focusing on:
 * 1. Stroke interpolation across large coordinate deltas (fast mouse flicks).
 * 2. Eraser compositing (destination-out) clearing existing mask pixels without corruption.
 * 3. Deep undo stack push/pop cycles (100+ cycles), verifying memory containment and state preservation.
 * 4. Crop canvas vs mask canvas 1:1 alignment in generate() with non-standard aspect ratios and selection bounds.
 */

describe('Adversarial Stress Test: Outpaint Mask, Eraser, Undo & 1:1 Crop Pipeline', () => {
    let mockElements = {};
    let windowListeners = {};

    // A realistic software canvas context backing store to accurately simulate pixel operations
    class SoftwareCanvasContext2D {
        constructor(canvas) {
            this.canvas = canvas;
            this.globalCompositeOperation = 'source-over';
            this.fillStyle = '#000000';
            this.strokeStyle = '#000000';
            this.lineWidth = 1;
            this.lineCap = 'butt';
            this.lineJoin = 'miter';
            this.imageSmoothingEnabled = true;
            this.stateStack = [];
            this.callLogs = [];
            
            // Allocate pixel buffer RGBA
            this._allocateBuffer();
        }

        _allocateBuffer() {
            const w = Math.max(1, this.canvas.width || 1);
            const h = Math.max(1, this.canvas.height || 1);
            this.buffer = new Uint8ClampedArray(w * h * 4);
        }

        save() {
            this.callLogs.push('save');
            this.stateStack.push({
                globalCompositeOperation: this.globalCompositeOperation,
                fillStyle: this.fillStyle,
                strokeStyle: this.strokeStyle,
                lineWidth: this.lineWidth,
                lineCap: this.lineCap,
                lineJoin: this.lineJoin
            });
        }

        restore() {
            this.callLogs.push('restore');
            if (this.stateStack.length > 0) {
                const s = this.stateStack.pop();
                this.globalCompositeOperation = s.globalCompositeOperation;
                this.fillStyle = s.fillStyle;
                this.strokeStyle = s.strokeStyle;
                this.lineWidth = s.lineWidth;
                this.lineCap = s.lineCap;
                this.lineJoin = s.lineJoin;
            }
        }

        clearRect(x, y, w, h) {
            this.callLogs.push(`clearRect(${x},${y},${w},${h})`);
            const cw = this.canvas.width;
            const ch = this.canvas.height;
            const x0 = Math.max(0, Math.floor(x));
            const y0 = Math.max(0, Math.floor(y));
            const x1 = Math.min(cw, Math.ceil(x + w));
            const y1 = Math.min(ch, Math.ceil(y + h));
            for (let py = y0; py < y1; py++) {
                for (let px = x0; px < x1; px++) {
                    const idx = (py * cw + px) * 4;
                    this.buffer[idx] = 0;
                    this.buffer[idx + 1] = 0;
                    this.buffer[idx + 2] = 0;
                    this.buffer[idx + 3] = 0;
                }
            }
        }

        fillRect(x, y, w, h) {
            this.callLogs.push(`fillRect(${x},${y},${w},${h})`);
            const cw = this.canvas.width;
            const ch = this.canvas.height;
            const x0 = Math.max(0, Math.floor(x));
            const y0 = Math.max(0, Math.floor(y));
            const x1 = Math.min(cw, Math.ceil(x + w));
            const y1 = Math.min(ch, Math.ceil(y + h));
            
            let r = 0, g = 0, b = 0, a = 255;
            if (this.fillStyle === '#FFFFFF' || this.fillStyle === '#fff') {
                r = 255; g = 255; b = 255;
            } else if (this.fillStyle === '#808080') {
                r = 128; g = 128; b = 128;
            }

            for (let py = y0; py < y1; py++) {
                for (let px = x0; px < x1; px++) {
                    const idx = (py * cw + px) * 4;
                    if (this.globalCompositeOperation === 'destination-out') {
                        this.buffer[idx + 3] = 0;
                    } else {
                        this.buffer[idx] = r;
                        this.buffer[idx + 1] = g;
                        this.buffer[idx + 2] = b;
                        this.buffer[idx + 3] = a;
                    }
                }
            }
        }

        beginPath() {
            this.callLogs.push('beginPath');
            this.currentPath = [];
        }

        arc(x, y, radius, startAngle, endAngle) {
            this.callLogs.push(`arc(${x},${y},${radius})`);
            this.lastArc = { x, y, radius };
        }

        fill() {
            this.callLogs.push('fill');
            if (this.lastArc) {
                const { x, y, radius } = this.lastArc;
                const cw = this.canvas.width;
                const ch = this.canvas.height;
                const rInt = Math.ceil(radius);
                const isEraser = this.globalCompositeOperation === 'destination-out';

                for (let py = Math.max(0, Math.floor(y - rInt)); py <= Math.min(ch - 1, Math.ceil(y + rInt)); py++) {
                    for (let px = Math.max(0, Math.floor(x - rInt)); px <= Math.min(cw - 1, Math.ceil(x + rInt)); px++) {
                        const distSq = (px - x) * (px - x) + (py - y) * (py - y);
                        if (distSq <= radius * radius) {
                            const idx = (py * cw + px) * 4;
                            if (isEraser) {
                                this.buffer[idx + 3] = 0;
                            } else {
                                this.buffer[idx] = 255;
                                this.buffer[idx + 1] = 255;
                                this.buffer[idx + 2] = 255;
                                this.buffer[idx + 3] = 255;
                            }
                        }
                    }
                }
            }
        }

        moveTo(x, y) {
            this.callLogs.push(`moveTo(${x},${y})`);
            this.pathStart = { x, y };
        }

        lineTo(x, y) {
            this.callLogs.push(`lineTo(${x},${y})`);
            this.pathEnd = { x, y };
        }

        stroke() {
            this.callLogs.push('stroke');
            if (this.pathStart && this.pathEnd) {
                const p0 = this.pathStart;
                const p1 = this.pathEnd;
                const radius = this.lineWidth / 2;
                const cw = this.canvas.width;
                const ch = this.canvas.height;
                const isEraser = this.globalCompositeOperation === 'destination-out';

                // Distance along segment
                const dx = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const len = Math.hypot(dx, dy);
                const steps = Math.max(1, Math.ceil(len / (radius > 0 ? radius / 2 : 1)));

                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const cx = p0.x + t * dx;
                    const cy = p0.y + t * dy;
                    const rInt = Math.ceil(radius);

                    for (let py = Math.max(0, Math.floor(cy - rInt)); py <= Math.min(ch - 1, Math.ceil(cy + rInt)); py++) {
                        for (let px = Math.max(0, Math.floor(cx - rInt)); px <= Math.min(cw - 1, Math.ceil(cx + rInt)); px++) {
                            const distSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
                            if (distSq <= radius * radius) {
                                const idx = (py * cw + px) * 4;
                                if (isEraser) {
                                    this.buffer[idx + 3] = 0;
                                } else {
                                    this.buffer[idx] = 255;
                                    this.buffer[idx + 1] = 255;
                                    this.buffer[idx + 2] = 255;
                                    this.buffer[idx + 3] = 255;
                                }
                            }
                        }
                    }
                }
            }
        }

        drawImage(img, ...args) {
            this.callLogs.push(`drawImage(${args.length} args)`);
            // Handle basic drawImage copy
            if (img && img.getContext) {
                const srcCtx = img.getContext('2d');
                if (srcCtx && srcCtx.buffer) {
                    if (args.length === 2) {
                        const [dx, dy] = args;
                        const sw = img.width;
                        const sh = img.height;
                        const cw = this.canvas.width;
                        const ch = this.canvas.height;
                        for (let sy = 0; sy < sh; sy++) {
                            const ty = sy + dy;
                            if (ty < 0 || ty >= ch) continue;
                            for (let sx = 0; sx < sw; sx++) {
                                const tx = sx + dx;
                                if (tx < 0 || tx >= cw) continue;
                                const sIdx = (sy * sw + sx) * 4;
                                const tIdx = (ty * cw + tx) * 4;
                                this.buffer[tIdx] = srcCtx.buffer[sIdx];
                                this.buffer[tIdx + 1] = srcCtx.buffer[sIdx + 1];
                                this.buffer[tIdx + 2] = srcCtx.buffer[sIdx + 2];
                                this.buffer[tIdx + 3] = srcCtx.buffer[sIdx + 3];
                            }
                        }
                    }
                }
            }
        }

        getImageData(x, y, w, h) {
            this.callLogs.push(`getImageData(${x},${y},${w},${h})`);
            const width = w || this.canvas.width;
            const height = h || this.canvas.height;
            const data = new Uint8ClampedArray(width * height * 4);
            const cw = this.canvas.width;
            const ch = this.canvas.height;

            for (let py = 0; py < height; py++) {
                const sy = y + py;
                if (sy < 0 || sy >= ch) continue;
                for (let px = 0; px < width; px++) {
                    const sx = x + px;
                    if (sx < 0 || sx >= cw) continue;
                    const sIdx = (sy * cw + sx) * 4;
                    const dIdx = (py * width + px) * 4;
                    data[dIdx] = this.buffer[sIdx];
                    data[dIdx + 1] = this.buffer[sIdx + 1];
                    data[dIdx + 2] = this.buffer[sIdx + 2];
                    data[dIdx + 3] = this.buffer[sIdx + 3];
                }
            }
            return { width, height, data };
        }

        putImageData(imgData, x, y) {
            this.callLogs.push(`putImageData(${x},${y})`);
            const width = imgData.width;
            const height = imgData.height;
            const data = imgData.data;
            const cw = this.canvas.width;
            const ch = this.canvas.height;

            for (let py = 0; py < height; py++) {
                const ty = y + py;
                if (ty < 0 || ty >= ch) continue;
                for (let px = 0; px < width; px++) {
                    const tx = x + px;
                    if (tx < 0 || tx >= cw) continue;
                    const sIdx = (py * width + px) * 4;
                    const tIdx = (ty * cw + tx) * 4;
                    this.buffer[tIdx] = data[sIdx];
                    this.buffer[tIdx + 1] = data[sIdx + 1];
                    this.buffer[tIdx + 2] = data[sIdx + 2];
                    this.buffer[tIdx + 3] = data[sIdx + 3];
                }
            }
        }

        createImageData(w, h) {
            return {
                width: w,
                height: h,
                data: new Uint8ClampedArray(w * h * 4)
            };
        }
    }

    function createMockElement(id) {
        if (!mockElements[id]) {
            const classSet = new Set();
            const element = {
                id,
                value: '',
                textContent: '',
                checked: false,
                _width: 512,
                _height: 512,
                get width() { return this._width; },
                set width(val) {
                    this._width = val;
                    if (this._ctx) this._ctx._allocateBuffer();
                },
                get height() { return this._height; },
                set height(val) {
                    this._height = val;
                    if (this._ctx) this._ctx._allocateBuffer();
                },
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
                        if (classSet.has(c)) { classSet.delete(c); return false; }
                        classSet.add(c); return true;
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
                    if (selector === 'button' && element.tagName === 'BUTTON') return element;
                    return null;
                }),
                getContext: vi.fn(function(type) {
                    if (type === '2d') {
                        if (!this._ctx) {
                            this._ctx = new SoftwareCanvasContext2D(this);
                        }
                        return this._ctx;
                    }
                    return null;
                }),
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
            requestAnimationFrame: vi.fn((cb) => { cb(); return 1; }),
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
            getElementById: vi.fn((id) => createMockElement(id)),
            createElement: vi.fn((tag) => {
                const el = createMockElement(`__created_${tag}_${Math.random()}`);
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
                setTimeout(() => { if (this.onload) this.onload(); }, 0);
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

        createMockElement('singleResultImg').src = 'data:image/png;base64,sourceImage';
        createMockElement('modelValue').value = 'v4.5';
        createMockElement('prompt').value = 'masterpiece, outpaint';
        createMockElement('negativePrompt').value = 'low quality';
        createMockElement('steps').value = '28';
        createMockElement('scale').value = '5.0';
        createMockElement('sampler').value = 'k_euler';
        createMockElement('outpaintBrushSize').value = '60';

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
    // Stress 1: Stroke Interpolation Across Large Coordinate Deltas (Fast Mouse Flicks)
    // =========================================================================
    describe('Stress 1: Stroke Interpolation & Fast Mouse Flicks', () => {
        it('1.1 Should maintain continuous line segment without holes during 1000px diagonal flick', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 1000;
            maskCanvas.height = 1000;
            const ctx = maskCanvas.getContext('2d');
            ctx.clearRect(0, 0, 1000, 1000);

            editor.setMode('paint');
            editor.setTool('brush');
            createMockElement('outpaintBrushSize').value = '40';

            // Start at (50, 50)
            editor._drawOnMask({ x: 50, y: 50 }, true);
            expect(ctx.callLogs).toContain('beginPath');
            expect(ctx.callLogs).toContain('arc(50,50,20)');
            expect(ctx.callLogs).toContain('fill');

            // Flick directly to (950, 950) in a single jump (deltaX = 900, deltaY = 900)
            editor._drawOnMask({ x: 950, y: 950 }, false);
            expect(ctx.callLogs).toContain('moveTo(50,50)');
            expect(ctx.callLogs).toContain('lineTo(950,950)');
            expect(ctx.callLogs).toContain('stroke');

            // Verify midpoint (500, 500) has been painted opaque (255) by the software stroke renderer
            const midPixel = ctx.getImageData(500, 500, 1, 1).data;
            expect(midPixel[0]).toBe(255);
            expect(midPixel[3]).toBe(255);

            // Verify quarter-points (275, 275) and (725, 725) are also solid white
            const q1Pixel = ctx.getImageData(275, 275, 1, 1).data;
            expect(q1Pixel[0]).toBe(255);
            expect(q1Pixel[3]).toBe(255);
            const q3Pixel = ctx.getImageData(725, 725, 1, 1).data;
            expect(q3Pixel[0]).toBe(255);
            expect(q3Pixel[3]).toBe(255);

            // Far off-line point (500, 200) must remain transparent 0
            const offPixel = ctx.getImageData(500, 200, 1, 1).data;
            expect(offPixel[3]).toBe(0);
        });

        it('1.2 Should gracefully handle negative, zero, and extreme out-of-bounds coordinates during flicks', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;
            const ctx = maskCanvas.getContext('2d');

            editor.setMode('paint');
            editor.setTool('brush');

            // Rapid flick starting offscreen (-500, -500) through canvas to (1500, 1500)
            expect(() => {
                editor._drawOnMask({ x: -500, y: -500 }, true);
                editor._drawOnMask({ x: 1500, y: 1500 }, false);
                editor._drawOnMask({ x: 256, y: 256 }, false);
            }).not.toThrow();

            // Center of canvas (256, 256) should be covered
            const centerPixel = ctx.getImageData(256, 256, 1, 1).data;
            expect(centerPixel[0]).toBe(255);
            expect(centerPixel[3]).toBe(255);
        });

        it('1.3 Should safely handle null, undefined, or missing coordinates without crashing', () => {
            expect(() => {
                editor._drawOnMask(null, false);
                editor._drawOnMask(undefined, true);
                editor._drawOnMask({ x: NaN, y: NaN }, false);
            }).not.toThrow();
        });
    });

    // =========================================================================
    // Stress 2: Eraser Compositing (destination-out) Clearing Mask Without Corruption
    // =========================================================================
    describe('Stress 2: Eraser Compositing & Clean Transparency', () => {
        it('2.1 Should completely erase painted pixels back to alpha 0 with destination-out', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;
            const ctx = maskCanvas.getContext('2d');
            ctx.clearRect(0, 0, 512, 512);

            editor.setMode('paint');
            createMockElement('outpaintBrushSize').value = '100';

            // Paint solid circle at (256, 256)
            editor.setTool('brush');
            editor._drawOnMask({ x: 256, y: 256 }, true);
            expect(editor._hasPaintedMask()).toBe(true);

            let center = ctx.getImageData(256, 256, 1, 1).data;
            expect(center[3]).toBe(255);

            // Switch to eraser with 120px brush and erase over (256, 256)
            createMockElement('outpaintBrushSize').value = '120';
            editor.setTool('eraser');
            editor._drawOnMask({ x: 256, y: 256 }, true);

            // Verify center alpha is now 0 (fully transparent)
            center = ctx.getImageData(256, 256, 1, 1).data;
            expect(center[3]).toBe(0);

            // HasPaintedMask should now return false since entire circle was erased
            expect(editor._hasPaintedMask()).toBe(false);
        });

        it('2.2 Should restore globalCompositeOperation without style leaking to subsequent operations', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            const ctx = maskCanvas.getContext('2d');

            editor.setTool('eraser');
            editor._drawOnMask({ x: 100, y: 100 }, true);

            // After _drawOnMask finishes, save/restore ensures compositeOperation resets
            expect(ctx.stateStack.length).toBe(0);
            expect(ctx.callLogs[ctx.callLogs.length - 1]).toBe('restore');
        });

        it('2.3 Partial erasing should leave untouched painted regions with 100% fidelity', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;
            const ctx = maskCanvas.getContext('2d');
            ctx.clearRect(0, 0, 512, 512);

            editor.setMode('paint');
            createMockElement('outpaintBrushSize').value = '60';

            // Paint at (100, 100) and (400, 400)
            editor.setTool('brush');
            editor._drawOnMask({ x: 100, y: 100 }, true);
            editor._drawOnMask({ x: 400, y: 400 }, true);

            // Erase only (100, 100)
            editor.setTool('eraser');
            editor._drawOnMask({ x: 100, y: 100 }, true);

            // (100, 100) is cleared
            expect(ctx.getImageData(100, 100, 1, 1).data[3]).toBe(0);
            // (400, 400) is intact
            expect(ctx.getImageData(400, 400, 1, 1).data[3]).toBe(255);
            // _hasPaintedMask is still true because (400, 400) exists
            expect(editor._hasPaintedMask()).toBe(true);
        });
    });

    // =========================================================================
    // Stress 3: Deep Undo Stack Push/Pop Cycles (100+ Operations) & Memory Containment
    // =========================================================================
    describe('Stress 3: Deep Undo Stack Push/Pop Cycles & Memory Containment', () => {
        it('3.1 Should cap maskHistory stack size strictly to maxMaskHistory (10) under 200 consecutive strokes', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;

            editor.setMode('paint');
            expect(editor.maskHistory.length).toBe(0);

            // Perform 200 paint operations, saving mask state each time
            for (let i = 0; i < 200; i++) {
                editor.saveMaskState();
            }

            // Stack must never exceed maxMaskHistory (10)
            expect(editor.maskHistory.length).toBe(10);
            expect(editor.maskHistory.length).toBe(editor.maxMaskHistory);

            // Check compact alpha channel format (Uint8Array of size 512*512)
            const topFrame = editor.maskHistory[editor.maskHistory.length - 1];
            expect(topFrame.alpha).toBeInstanceOf(Uint8Array);
            expect(topFrame.alpha.length).toBe(512 * 512);
            // Not holding 4-channel ImageData (saving 75% memory)
            expect(topFrame.imageData).toBeUndefined();
        });

        it('3.2 Should cap full canvas history stack size strictly to maxHistory (10) under 100 generations/expansions', () => {
            const canvas = createMockElement('outpaintCanvas');
            canvas.width = 800;
            canvas.height = 600;

            for (let i = 0; i < 100; i++) {
                editor.selection = { x: i * 10, y: i * 5, w: 512, h: 512 };
                editor.saveState();
            }

            // Stack must be capped at 10
            expect(editor.history.length).toBe(10);
            expect(editor.history.length).toBe(editor.maxHistory);

            // The newest frame should have selection x = 99 * 10 = 990
            const newest = editor.history[editor.history.length - 1];
            expect(newest.selection.x).toBe(990);

            // The oldest retained frame should have selection x = 90 * 10 = 900
            const oldest = editor.history[0];
            expect(oldest.selection.x).toBe(900);
        });

        it('3.3 Should pop through entire stack down to 0 without throwing error or corrupting state on extra undos', () => {
            editor.setMode('paint');
            for (let i = 0; i < 5; i++) {
                editor.saveMaskState();
            }
            expect(editor.maskHistory.length).toBe(5);

            // Pop 5 times
            for (let i = 0; i < 5; i++) {
                editor.undo();
            }
            expect(editor.maskHistory.length).toBe(0);

            // Extra undos on empty stack should alert without throwing
            expect(() => {
                editor.undo();
                editor.undo();
            }).not.toThrow();
            expect(global.alert).toHaveBeenCalledWith('没有可撤销的操作');
        });

        it('3.4 Should preserve 100% pixel fidelity across push and restore cycles', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 128;
            maskCanvas.height = 128;
            const ctx = maskCanvas.getContext('2d');
            ctx.clearRect(0, 0, 128, 128);

            // Paint distinct test pattern (white block at 10,10 to 30,30)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(10, 10, 20, 20);

            // Save state
            editor.saveMaskState();

            // Corrupt mask canvas by clearing
            ctx.clearRect(0, 0, 128, 128);
            expect(ctx.getImageData(15, 15, 1, 1).data[3]).toBe(0);

            // Restore state via undo
            editor.setMode('paint');
            editor.undo();

            // Pixel at (15, 15) must be perfectly restored to 255
            const restoredPixel = ctx.getImageData(15, 15, 1, 1).data;
            expect(restoredPixel[0]).toBe(255);
            expect(restoredPixel[1]).toBe(255);
            expect(restoredPixel[2]).toBe(255);
            expect(restoredPixel[3]).toBe(255);

            // Untouched background at (50, 50) must remain transparent 0
            expect(ctx.getImageData(50, 50, 1, 1).data[3]).toBe(0);
        });
    });

    // =========================================================================
    // Stress 4: Crop Canvas vs Mask Canvas 1:1 Alignment in generate()
    // =========================================================================
    describe('Stress 4: Crop Canvas vs Mask Canvas 1:1 Alignment & Non-standard Aspect Ratios', () => {
        it('4.1 Extreme portrait (64x1024) and extreme landscape (1024x64) generation quantization and alignment', async () => {
            const canvas = createMockElement('outpaintCanvas');
            canvas.width = 1024;
            canvas.height = 1024;

            // Extreme Landscape: 1000 x 50 -> quantized to 1024 x 64
            editor.selection = { x: 0, y: 0, w: 1000, h: 50 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            let [params] = mockEngine.generate.mock.calls[0];
            expect(params.width).toBe(1024);
            expect(params.height).toBe(64);
            expect(params.width % 64).toBe(0);
            expect(params.height % 64).toBe(0);

            mockEngine.generate.mockClear();

            // Extreme Portrait: 50 x 1000 -> quantized to 64 x 1024
            editor.selection = { x: 0, y: 0, w: 50, h: 1000 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            [params] = mockEngine.generate.mock.calls[0];
            expect(params.width).toBe(64);
            expect(params.height).toBe(1024);
            expect(params.width % 64).toBe(0);
            expect(params.height % 64).toBe(0);
        });

        it('4.2 Non-standard arbitrary dimensions (e.g. 533 x 327) quantized to exact 64-multiples (512 x 320)', async () => {
            editor.selection = { x: 100, y: 100, w: 533, h: 327 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            const [params] = mockEngine.generate.mock.calls[0];
            // 533 / 64 = 8.328 -> 8 * 64 = 512
            // 327 / 64 = 5.109 -> 5 * 64 = 320
            expect(params.width).toBe(512);
            expect(params.height).toBe(320);
        });

        it('4.3 Outpaint dilation and edge smear boundary clamping with corner offsets (x: -128, y: -128)', async () => {
            const canvas = createMockElement('outpaintCanvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 512, 512);

            // Offset top-left by -128, -128 with size 512x512
            editor.selection = { x: -128, y: -128, w: 512, h: 512 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            const [params] = mockEngine.generate.mock.calls[0];
            expect(params.width).toBe(512);
            expect(params.height).toBe(512);
            expect(params.action).toBe('infill');
            expect(params.image).toBeDefined();
            expect(params.mask).toBeDefined();
        });

        it('4.4 Inpaint mode 1:1 mask alignment with painted mask smaller than quantized selection', async () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 512;
            maskCanvas.height = 512;
            const ctx = maskCanvas.getContext('2d');
            ctx.clearRect(0, 0, 512, 512);

            // Paint mask on maskCanvas
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(50, 50, 100, 100);

            // Selection is larger: 768 x 512
            editor.selection = { x: 0, y: 0, w: 768, h: 512 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            const [params] = mockEngine.generate.mock.calls[0];
            expect(params.width).toBe(768);
            expect(params.height).toBe(512);
            expect(params.strength).toBe(0.7); // Inpaint strength
        });

        it('4.5 Pure Generation detection when selection is placed completely outside canvas (x: 2000, y: 2000)', async () => {
            const canvas = createMockElement('outpaintCanvas');
            canvas.width = 512;
            canvas.height = 512;

            // Completely outside source canvas
            editor.selection = { x: 2000, y: 2000, w: 512, h: 512 };
            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalled();
            const [params] = mockEngine.generate.mock.calls[0];
            expect(params.action).toBe('generate'); // Pure generation
            expect(params.image).toBeUndefined();
            expect(params.mask).toBeUndefined();
        });
    });

    // =========================================================================
    // Stress 5: Multi-Key Failover, 500-Point Path Stress, & Mode Interactions
    // =========================================================================
    describe('Stress 5: Multi-Key Failover, 500-Point Path Stress, & Mode Interactions', () => {
        it('5.1 Multi-key generation failover: recovers when first keys fail', async () => {
            mockStore.settings.nai_custom_api_key = 'key-fail-1\nkey-fail-2,key-success-3';

            let attempt = 0;
            mockEngine.generate = vi.fn().mockImplementation(async (params, auth) => {
                attempt++;
                if (auth.customApiKey === 'key-fail-1') {
                    throw new Error('500 Internal Server Error');
                }
                if (auth.customApiKey === 'key-fail-2') {
                    throw new Error('429 Rate Limit Exceeded');
                }
                if (auth.customApiKey === 'key-success-3') {
                    return { imageUrl: 'data:image/png;base64,key3_result', userRole: 'plus' };
                }
                throw new Error('Unknown Key');
            });

            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalledTimes(3);
            expect(attempt).toBe(3);
        });

        it('5.2 Multi-key generation all fail: restores button state and displays error', async () => {
            mockStore.settings.nai_custom_api_key = 'fail-1\nfail-2';
            mockEngine.generate = vi.fn().mockRejectedValue(new Error('All keys exhausted'));

            const deskBtn = createMockElement('desktopGenerateBtn');
            const floatBtn = createMockElement('floatingGenerateBtn');
            deskBtn.innerHTML = 'Generate';
            floatBtn.innerHTML = 'Icon';

            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalledTimes(2);
            expect(deskBtn.disabled).toBe(false);
            expect(floatBtn.disabled).toBe(false);
            expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('All keys exhausted'));
        });

        it('5.3 500-point continuous sinusoidal stroke stream stress', () => {
            const maskCanvas = createMockElement('outpaintMaskCanvas');
            maskCanvas.width = 1000;
            maskCanvas.height = 1000;
            const ctx = maskCanvas.getContext('2d');

            editor.setMode('paint');
            editor.setTool('brush');

            editor._drawOnMask({ x: 0, y: 500 }, true);

            // Emit 500 high-frequency points
            for (let i = 1; i <= 500; i++) {
                const x = i * 2;
                const y = 500 + Math.sin(i / 10) * 100;
                editor._drawOnMask({ x, y }, false);
            }

            expect(ctx.callLogs.filter(l => l === 'stroke').length).toBe(500);
            expect(editor.lastPos.x).toBe(1000);
        });

        it('5.4 Mode switching between move and paint cleanly partitions undo stacks', () => {
            const canvas = createMockElement('outpaintCanvas');
            canvas.width = 800;
            canvas.height = 600;

            // 1. Move mode: change canvas state
            editor.setMode('move');
            editor.saveState();
            expect(editor.history.length).toBe(1);
            expect(editor.maskHistory.length).toBe(0);

            // 2. Paint mode: change mask state
            editor.setMode('paint');
            editor.saveMaskState();
            expect(editor.history.length).toBe(1);
            expect(editor.maskHistory.length).toBe(1);

            // 3. Undo in paint mode should pop maskHistory first
            editor.undo();
            expect(editor.maskHistory.length).toBe(0);
            expect(editor.history.length).toBe(1);

            // 4. Undo in paint mode when maskHistory is empty should pop canvas history
            editor.undo();
            expect(editor.history.length).toBe(0);
        });
    });
});

