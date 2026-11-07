import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { InpaintEditor } from '../src/inpaint.js';
import { OutpaintEditor } from '../src/outpaint.js';
import { UIController } from '../src/ui.js';
import { CharPromptManager } from '../src/char-prompt-manager.js';
import { createLightboxController } from '../src/lightbox-controller.js';
import {
    adjustPromptTagWeight,
    updateRangeProgress,
    initRangeSliderEnhancements,
    bindDrawerSwipeToClose
} from '../src/ux-enhancements.js';

function createMockClassList(initial = []) {
    const set = new Set(initial);
    return {
        add: (...cls) => cls.forEach(c => set.add(c)),
        remove: (...cls) => cls.forEach(c => set.delete(c)),
        contains: (c) => set.has(c),
        toggle: (c, force) => {
            if (typeof force === 'boolean') {
                if (force) set.add(c);
                else set.delete(c);
                return force;
            }
            if (set.has(c)) {
                set.delete(c);
                return false;
            }
            set.add(c);
            return true;
        }
    };
}

function createMockElement(id = '', initialClasses = [], tagName = 'DIV') {
    const listeners = {};
    const styleProps = {};
    const el = {
        id,
        tagName: tagName.toUpperCase(),
        value: '',
        textContent: '',
        innerHTML: '',
        disabled: false,
        width: 512,
        height: 512,
        dataset: {},
        children: [],
        style: {
            display: '',
            transform: '',
            aspectRatio: '',
            setProperty: (k, v) => { styleProps[k] = v; },
            getPropertyValue: (k) => styleProps[k] || ''
        },
        classList: createMockClassList(initialClasses),
        getAttribute: vi.fn((attr) => (attr === 'value' ? el._attrValue ?? null : null)),
        addEventListener: vi.fn((type, handler) => {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(handler);
        }),
        removeEventListener: vi.fn((type, handler) => {
            if (listeners[type]) {
                listeners[type] = listeners[type].filter(fn => fn !== handler);
            }
        }),
        dispatchEvent: vi.fn((evt) => {
            const list = listeners[evt.type] || [];
            list.forEach(fn => fn(evt));
            return true;
        }),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        appendChild: vi.fn((child) => {
            el.children.push(child);
            return child;
        }),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        getBoundingClientRect: vi.fn(() => ({
            left: 100,
            top: 50,
            width: 512,
            height: 512
        })),
        _trigger: (type, eventObj = {}) => {
            const evt = {
                type,
                target: el,
                preventDefault: vi.fn(),
                stopPropagation: vi.fn(),
                ...eventObj
            };
            (listeners[type] || []).forEach(fn => fn(evt));
        }
    };
    return el;
}

function createPixelCanvasElement(id, w = 64, h = 64) {
    const el = createMockElement(id, [], 'CANVAS');
    el.width = w;
    el.height = h;
    let buffer = new Uint8ClampedArray(w * h * 4);

    const resizeIfNeeded = () => {
        if (buffer.length !== el.width * el.height * 4) {
            buffer = new Uint8ClampedArray(el.width * el.height * 4);
        }
    };

    const ctx = {
        globalCompositeOperation: 'source-over',
        fillStyle: '#FFFFFF',
        strokeStyle: '#FFFFFF',
        lineWidth: 10,
        lineCap: 'round',
        lineJoin: 'round',
        imageSmoothingEnabled: true,
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(() => {
            resizeIfNeeded();
            buffer.fill(0);
        }),
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn((x, y) => { ctx._lastArc = { x, y }; }),
        fill: vi.fn(() => {
            resizeIfNeeded();
            const pt = ctx._lastArc || { x: 0, y: 0 };
            const px = Math.max(0, Math.min(el.width - 1, Math.floor(pt.x)));
            const py = Math.max(0, Math.min(el.height - 1, Math.floor(pt.y)));
            const idx = (py * el.width + px) * 4;
            if (ctx.globalCompositeOperation === 'destination-out') {
                buffer[idx + 3] = 0;
            } else {
                buffer[idx] = 255;
                buffer[idx + 1] = 255;
                buffer[idx + 2] = 255;
                buffer[idx + 3] = 255;
            }
        }),
        moveTo: vi.fn((x, y) => { ctx._moveFrom = { x, y }; }),
        lineTo: vi.fn((x, y) => { ctx._lineTo = { x, y }; }),
        stroke: vi.fn(() => {
            resizeIfNeeded();
            const pt = ctx._lineTo || ctx._moveFrom || { x: 0, y: 0 };
            const px = Math.max(0, Math.min(el.width - 1, Math.floor(pt.x)));
            const py = Math.max(0, Math.min(el.height - 1, Math.floor(pt.y)));
            const idx = (py * el.width + px) * 4;
            if (ctx.globalCompositeOperation === 'destination-out') {
                buffer[idx + 3] = 0;
            } else {
                buffer[idx] = 255;
                buffer[idx + 1] = 255;
                buffer[idx + 2] = 255;
                buffer[idx + 3] = 255;
            }
        }),
        createImageData: vi.fn((cw, ch) => ({
            width: cw,
            height: ch,
            data: new Uint8ClampedArray(cw * ch * 4)
        })),
        getImageData: vi.fn((_x, _y, cw, ch) => {
            resizeIfNeeded();
            return {
                width: cw,
                height: ch,
                data: new Uint8ClampedArray(buffer)
            };
        }),
        putImageData: vi.fn((imgData) => {
            buffer = new Uint8ClampedArray(imgData.data);
        })
    };

    el.getContext = vi.fn(() => ctx);
    el.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK_PNG_B64');
    el._getRawBuffer = () => buffer;
    return el;
}

describe('In-Canvas Inpaint Fusion, Multi-Touch Viewport & UX Motion Upgrades', () => {
    describe('1. Static HTML & CSS Architecture Contracts', () => {
        const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
        const css = fs.readFileSync(path.resolve('src/style.css'), 'utf8');

        it('fuses #inpaintMaskCanvas directly inside #singleResultArea with a floating pure-SVG brush dock', () => {
            const previewIdx = html.indexOf('id="previewArea"');
            const singleAreaIdx = html.indexOf('id="singleResultArea"');
            const maskCanvasIdx = html.indexOf('id="inpaintMaskCanvas"');
            const inpaintDockIdx = html.indexOf('id="inpaintModal"');
            const historyIdx = html.indexOf('id="historyArea"');

            expect(previewIdx).toBeGreaterThan(-1);
            expect(singleAreaIdx).toBeGreaterThan(previewIdx);
            expect(maskCanvasIdx).toBeGreaterThan(singleAreaIdx);
            expect(maskCanvasIdx).toBeLessThan(inpaintDockIdx);
            expect(inpaintDockIdx).toBeLessThan(historyIdx);
            expect(html).not.toContain('id="inpaintModal" class="fixed');
            expect(html).not.toContain('<span>退出重绘</span>');
        });

        it('uses pure-SVG monochrome controls for toolbox & brush dock and enforces touch-action: none', () => {
            const imageActionsSlice = html.slice(html.indexOf('id="imageActions"'), html.indexOf('id="clearBtn"'));
            expect(html).toContain('id="inpaintToggleBtn"');
            expect(html).toContain('id="toolboxTriggerBtn"');
            expect(html).toContain('id="inpaintCanvasStage"');
            expect(html).toContain('id="inpaintRevertOrigBtn"');
            expect(html).toContain('id="inpaintMaskVisBtn"');
            expect(html).toContain('id="inpaintMoveBtn"');
            expect(html).toContain('id="generationSkeleton"');
            expect(html).toContain('id="pngDropOverlay"');
            expect(imageActionsSlice).toContain('<svg');
            expect(imageActionsSlice).not.toContain('工具箱');
            expect(imageActionsSlice).not.toContain('图像增强 (Enhance)');
            expect(imageActionsSlice).not.toContain('AI 放大 (Upscale x4)');
            expect(css).toMatch(/\.inpaint-canvas-wrap\s*\{[\s\S]*?touch-action:\s*none/);
            expect(css).toMatch(/#inpaintMaskCanvas\s*\{[\s\S]*?touch-action:\s*none/);
        });
    });

    describe('2. InpaintEditor Touch Pinch-Zoom/Pan & Dissatisfied Re-paint Recovery', () => {
        let elements;

        beforeEach(() => {
            elements = {
                inpaintModal: createMockElement('inpaintModal', ['modal-hidden']),
                inpaintCanvasWrap: createMockElement('inpaintCanvasWrap'),
                inpaintCanvasStage: createMockElement('inpaintCanvasStage'),
                inpaintBaseCanvas: createPixelCanvasElement('inpaintBaseCanvas', 64, 64),
                inpaintMaskCanvas: createPixelCanvasElement('inpaintMaskCanvas', 64, 64),
                brushCursor: createMockElement('brushCursor', ['hidden']),
                inpaintBrushSize: Object.assign(createMockElement('inpaintBrushSize', [], 'INPUT'), { value: '20' }),
                inpaintBrushSizeMobile: Object.assign(createMockElement('inpaintBrushSizeMobile', [], 'INPUT'), { value: '20' }),
                inpaintBrushSizeVal: createMockElement('inpaintBrushSizeVal'),
                inpaintBrushSizeValMobile: createMockElement('inpaintBrushSizeValMobile'),
                inpaintStrength: Object.assign(createMockElement('inpaintStrength', [], 'INPUT'), { value: '0.85' }),
                inpaintStrengthMobile: Object.assign(createMockElement('inpaintStrengthMobile', [], 'INPUT'), { value: '0.85' }),
                inpaintStrengthVal: createMockElement('inpaintStrengthVal'),
                inpaintStrengthValMobile: createMockElement('inpaintStrengthValMobile'),
                inpaintPrompt: Object.assign(createMockElement('inpaintPrompt', [], 'INPUT'), { value: '' }),
                inpaintPromptMobile: Object.assign(createMockElement('inpaintPromptMobile', [], 'TEXTAREA'), { value: '' }),
                prompt: Object.assign(createMockElement('prompt', [], 'TEXTAREA'), { value: '1girl, silver hair' }),
                negativePrompt: Object.assign(createMockElement('negativePrompt', [], 'TEXTAREA'), { value: 'lowres' }),
                steps: Object.assign(createMockElement('steps', [], 'INPUT'), { value: '28' }),
                scale: Object.assign(createMockElement('scale', [], 'INPUT'), { value: '5.5' }),
                sampler: Object.assign(createMockElement('sampler', [], 'SELECT'), { value: 'k_euler_ancestral' }),
                modelValue: Object.assign(createMockElement('modelValue', [], 'INPUT'), { value: 'v5' }),
                singleResultImg: Object.assign(createMockElement('singleResultImg', [], 'IMG'), { src: 'data:image/png;base64,ORIGINAL_IMG' }),
                inpaintToggleBtn: createMockElement('inpaintToggleBtn'),
                inpaintRevertOrigBtn: createMockElement('inpaintRevertOrigBtn', ['hidden']),
                inpaintQuickRetryBar: createMockElement('inpaintQuickRetryBar', ['hidden']),
                inpaintRestoreMaskBtn: createMockElement('inpaintRestoreMaskBtn', ['hidden']),
                inpaintZoomBadge: createMockElement('inpaintZoomBadge', ['hidden']),
                deskBtnText: createMockElement('deskBtnText')
            };

            global.document = {
                documentElement: createMockElement('html'),
                getElementById: (id) => elements[id] || null,
                createElement: (tag) => {
                    if (tag.toLowerCase() === 'canvas') return createPixelCanvasElement('temp', 64, 64);
                    return createMockElement('temp', [], tag);
                },
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            };
            global.window = {
                innerWidth: 390,
                innerHeight: 844,
                showToast: vi.fn(),
                safeCreateIcons: vi.fn()
            };
            global.Image = class {
                constructor() {
                    this.naturalWidth = 64;
                    this.naturalHeight = 64;
                }
                set src(val) {
                    this._src = val;
                    if (this.onload) this.onload();
                }
                get src() {
                    return this._src;
                }
            };
        });

        it('handles 2-finger pinch-zoom & pan cleanly while rolling back accidental 1-finger touch dot', () => {
            const editor = new InpaintEditor({
                ui: { currentRightView: 'preview', updateGenerateButtonText: vi.fn() },
                engine: {},
                store: { getSetting: () => '' }
            });
            editor.open();

            // Finger 1 touches down at (200, 150) -> draws initial dot
            elements.inpaintMaskCanvas._trigger('pointerdown', {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 200,
                clientY: 150
            });
            expect(editor.drawing).toBe(true);
            expect(editor._hasPaintedMask()).toBe(true);

            // Finger 2 touches down immediately -> rolls back dot & switches to pinch-zoom!
            elements.inpaintMaskCanvas._trigger('pointerdown', {
                pointerId: 2,
                pointerType: 'touch',
                clientX: 300,
                clientY: 150
            });
            expect(editor.drawing).toBe(false);
            expect(editor.isPinching).toBe(true);
            expect(editor._hasPaintedMask()).toBe(false);

            // Spread fingers apart from 100px distance to 200px distance -> 2x zoom!
            elements.inpaintMaskCanvas._trigger('pointermove', {
                pointerId: 2,
                pointerType: 'touch',
                clientX: 400,
                clientY: 150
            });
            expect(editor.viewport.scale).toBeCloseTo(2.0, 2);
            expect(elements.inpaintCanvasStage.style.transform).toContain('scale(2)');
            expect(elements.inpaintZoomBadge.textContent).toBe('200%');

            elements.inpaintMaskCanvas._trigger('pointerup', { pointerId: 1 });
            elements.inpaintMaskCanvas._trigger('pointerup', { pointerId: 2 });
            expect(editor.isPinching).toBe(false);
        });

        it('syncs main sidebar #prompt and #inpaintPrompt bidirectionally while active', () => {
            const editor = new InpaintEditor({
                ui: { currentRightView: 'preview', updateGenerateButtonText: vi.fn() },
                engine: {},
                store: { getSetting: () => '' }
            });
            editor.open();
            expect(elements.inpaintPrompt.value).toBe('1girl, silver hair');
            expect(elements.deskBtnText.textContent).toBe('确认局部重绘');

            // Edit main #prompt on the left sidebar -> updates #inpaintPrompt
            elements.prompt.value = '1girl, golden eyes, smile';
            elements.prompt._trigger('input');
            expect(elements.inpaintPrompt.value).toBe('1girl, golden eyes, smile');
            expect(elements.inpaintPromptMobile.value).toBe('1girl, golden eyes, smile');

            // Edit #inpaintPromptMobile -> updates main #prompt
            elements.inpaintPromptMobile.value = '1girl, blushing';
            elements.inpaintPromptMobile._trigger('input');
            expect(elements.prompt.value).toBe('1girl, blushing');
        });

        it('stays persistently active across doInpaint(), supports 1-click original revert, and commits new base on clearMask()', async () => {
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({
                    blob: new Blob(['new_result']),
                    imageUrl: 'data:image/png;base64,NEW_GENERATED_IMG'
                })
            };

            const editor = new InpaintEditor({
                ui: {
                    currentRightView: 'preview',
                    switchRightView: vi.fn(),
                    setLoading: vi.fn(),
                    updateGenerateButtonText: vi.fn()
                },
                engine: mockEngine,
                store: { getSetting: () => '' },
                onComplete: async (results) => {
                    // Simulate main.js replacing #singleResultImg with newly generated image
                    elements.singleResultImg.src = results[0].imageUrl;
                }
            });

            editor.toggle();
            expect(editor.isOpen).toBe(true);
            expect(elements.inpaintToggleBtn.classList.contains('inpaint-toggle-active')).toBe(true);

            // Paint a stroke on maskCanvas
            elements.inpaintMaskCanvas._trigger('pointerdown', {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 228,
                clientY: 178
            });
            elements.inpaintMaskCanvas._trigger('pointermove', {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 260,
                clientY: 210
            });
            elements.inpaintMaskCanvas._trigger('pointerup', { pointerId: 1 });
            expect(editor._hasPaintedMask()).toBe(true);

            // Submit inpaint -> stays open in persistent mode with mask intact & softened in peek mode!
            await editor.doInpaint();

            expect(editor.isOpen).toBe(true);
            expect(elements.singleResultImg.src).toBe('data:image/png;base64,NEW_GENERATED_IMG');
            expect(editor._hasPaintedMask()).toBe(true);
            expect(elements.inpaintMaskCanvas.classList.contains('mask-peek')).toBe(true);
            expect(elements.inpaintRevertOrigBtn.classList.contains('hidden')).toBe(false);
            expect(editor.originalImgSrc).toBe('data:image/png;base64,ORIGINAL_IMG');

            // User clicks Revert SVG -> restores original image visually while keeping painted mask!
            editor.revertToOriginalImage();
            expect(elements.singleResultImg.src).toBe('data:image/png;base64,ORIGINAL_IMG');
            expect(elements.inpaintMaskCanvas.classList.contains('mask-peek')).toBe(false);
            expect(editor._hasPaintedMask()).toBe(true);

            // Generate a second time without re-painting -> succeeds!
            await editor.doInpaint();
            expect(elements.singleResultImg.src).toBe('data:image/png;base64,NEW_GENERATED_IMG');
            expect(editor.hasGeneratedInSession).toBe(true);

            // User is happy with NEW_GENERATED_IMG and clicks Clear Mask to paint a new region -> commits new base!
            editor.clearMask();
            expect(editor._hasPaintedMask()).toBe(false);
            expect(editor.originalImgSrc).toBe('data:image/png;base64,NEW_GENERATED_IMG');
            expect(editor.hasGeneratedInSession).toBe(false);

            // Explicitly closing exits Inpaint mode & frees history
            editor.close();
            expect(editor.isOpen).toBe(false);
            expect(editor.history.length).toBe(0);
            expect(elements.inpaintToggleBtn.classList.contains('inpaint-toggle-active')).toBe(false);
        });
    });

    describe('3. UIController Single-Image Direct Focus & Shimmer Skeleton', () => {
        it('directly focuses single result image without intermediate grid click while preserving multi-image grid', () => {
            const mockDom = {};
            const ids = [
                'resultGrid', 'singleResultArea', 'singleResultImg', 'backToGridBtn',
                'placeholder', 'dlBtn', 'canvasDeleteBtn', 'imageActions',
                'generationSkeleton', 'generationSkeletonFrame', 'generationSkeletonStatus',
                'generationElapsedText', 'resolution', 'deskBtnText', 'outpaintArea'
            ];
            ids.forEach(id => {
                mockDom[id] = createMockElement(id, ['hidden']);
            });
            mockDom.placeholder.classList.remove('hidden');
            mockDom.resolution.value = '1216,832';

            global.document = {
                documentElement: createMockElement('html'),
                getElementById: (id) => mockDom[id] || createMockElement(id),
                createElement: (tag) => createMockElement('created_' + tag, [], tag),
                querySelectorAll: () => [],
                addEventListener: vi.fn()
            };
            global.window = { safeCreateIcons: vi.fn(), innerWidth: 1280 };

            const ui = new UIController();

            // Empty canvas loading -> full aspect-ratio frame (NOT compact HUD)
            ui.setLoading(true, '生成中...');
            expect(mockDom.generationSkeleton.classList.contains('hidden')).toBe(false);
            expect(mockDom.generationSkeleton.classList.contains('is-compact-hud')).toBe(false);
            expect(mockDom.generationSkeletonFrame.style.aspectRatio).toBe('1216 / 832');
            ui.setLoading(false);

            // Single image -> auto focuses directly!
            let selectedSingle = null;
            ui.showResultImages([{ imageUrl: 'blob:single-1' }], (sel) => { selectedSingle = sel; });
            expect(selectedSingle).toEqual({ imageUrl: 'blob:single-1' });
            expect(mockDom.singleResultArea.classList.contains('hidden')).toBe(false);
            expect(mockDom.resultGrid.classList.contains('hidden')).toBe(true);
            expect(mockDom.backToGridBtn.classList.contains('hidden')).toBe(true);
            expect(mockDom.singleResultImg.src).toBe('blob:single-1');
            expect(mockDom.singleResultImg.classList.contains('img-reveal')).toBe(true);
            expect(mockDom.imageActions.classList.contains('opacity-0')).toBe(false);

            // Loading state when canvas already has image -> switches to non-blocking top HUD pill!
            ui.setLoading(true, '生成中...');
            expect(mockDom.generationSkeleton.classList.contains('hidden')).toBe(false);
            expect(mockDom.generationSkeleton.classList.contains('is-compact-hud')).toBe(true);
            expect(mockDom.singleResultArea.classList.contains('is-sampling')).toBe(true);
            expect(mockDom.singleResultArea.classList.contains('blur-[2px]')).toBe(false);
            expect(mockDom.generationSkeletonFrame.style.aspectRatio).toBe('1216 / 832');
            ui.setLoading(false);
            expect(mockDom.generationSkeleton.classList.contains('hidden')).toBe(true);
            expect(mockDom.generationSkeleton.classList.contains('is-compact-hud')).toBe(false);
            expect(mockDom.singleResultArea.classList.contains('is-sampling')).toBe(false);

            // Multi-image batch -> shows grid first
            ui.showResultImages([{ imageUrl: 'blob:batch-1' }, { imageUrl: 'blob:batch-2' }]);
            expect(mockDom.resultGrid.classList.contains('hidden')).toBe(false);
            expect(mockDom.singleResultArea.classList.contains('hidden')).toBe(true);
        });

        it('supports Outpaint 2-finger mobile pinch-zoom, brush/eraser toggle, and mobile handle swipe-up', () => {
            const winListeners = {};
            const outDom = {};
            [
                'outpaintArea', 'outpaintContainer', 'outpaintCanvas', 'outpaintMaskCanvas',
                'outpaintSelection', 'outpaintSizeLabel', 'singleResultImg', 'outpaintBrushControl',
                'outpaintBrushSize', 'outpaintBrushSizeVal', 'outpaintModeMove', 'outpaintModePaint',
                'outpaintToolbar', 'outpaintToolbarInner', 'outpaintToolbarToggleBtn', 'outpaintSnapToggle',
                'outpaintToolBrush', 'outpaintToolEraser', 'outpaintSamplingBadge', 'outpaintElapsedText',
                'outpaintDimPath', 'outpaintDimOverlay'
            ].forEach(id => {
                outDom[id] = createPixelCanvasElement(id, 512, 512);
            });
            global.document = {
                getElementById: (id) => outDom[id] || createMockElement(id),
                createElement: (tag) => createPixelCanvasElement('tmp_' + tag, 64, 64)
            };
            global.window = {
                innerWidth: 390,
                addEventListener: (ev, cb) => {
                    if (!winListeners[ev]) winListeners[ev] = [];
                    winListeners[ev].push(cb);
                },
                requestAnimationFrame: (cb) => { cb(); return 1; }
            };

            const outEditor = new OutpaintEditor({
                engine: {},
                store: { getSetting: () => 'false' }
            });

            outEditor.setTool('eraser');
            expect(outDom.outpaintToolEraser.classList.contains('tool-active')).toBe(true);
            expect(outDom.outpaintToolBrush.classList.contains('tool-active')).toBe(false);

            // 2-finger touch pinch on outpaintArea -> zooms scale up smoothly
            outEditor.transform = { x: 0, y: 0, scale: 1 };
            outDom.outpaintArea._trigger('touchstart', {
                touches: [{ clientX: 100, clientY: 200 }, { clientX: 200, clientY: 200 }],
                preventDefault: vi.fn(),
                cancelable: true
            });
            (winListeners.touchmove || []).forEach(fn => fn({
                touches: [{ clientX: 50, clientY: 200 }, { clientX: 250, clientY: 200 }],
                preventDefault: vi.fn(),
                cancelable: true
            }));
            expect(outEditor.transform.scale).toBeCloseTo(2.0, 2);

            // Mobile bottom-sheet swipe-up opens collapsed drawer
            const handle = createMockElement('mobileControlsHandle');
            const drawer = createMockElement('mobileControls', ['collapsed']);
            let opened = false;
            bindDrawerSwipeToClose({
                handleEl: handle,
                drawerEl: drawer,
                isExpanded: () => false,
                onClose: () => {},
                onOpen: () => { opened = true; }
            });
            handle._trigger('pointerdown', { clientY: 620, pointerId: 1 });
            handle._trigger('pointermove', { clientY: 540, pointerId: 1 });
            handle._trigger('pointerup', { clientY: 540, pointerId: 1 });
            expect(opened).toBe(true);
        });
    });

    describe('4. Productivity Tag Weight Shortcuts, Range Progress & Lightbox Zoom', () => {
        it('adjusts NovelAI prompt tag weights up, down, and unwraps cleanly at 1.0', () => {
            // Bare tag at cursor -> 1.1::best quality::
            const step1 = adjustPromptTagWeight('1girl, best quality, smile', 10, 10, 0.1);
            expect(step1.text).toBe('1girl, 1.1::best quality::, smile');

            // Increment again -> 1.2::best quality::
            const step2 = adjustPromptTagWeight(step1.text, step1.selectionStart, step1.selectionEnd, 0.1);
            expect(step2.text).toBe('1girl, 1.2::best quality::, smile');

            // Decrement twice -> unwraps cleanly back to best quality at 1.0!
            const step3 = adjustPromptTagWeight(step2.text, step2.selectionStart + 5, step2.selectionStart + 5, -0.1);
            expect(step3.text).toBe('1girl, 1.1::best quality::, smile');
            const step4 = adjustPromptTagWeight(step3.text, step3.selectionStart, step3.selectionEnd, -0.1);
            expect(step4.text).toBe('1girl, best quality, smile');

            // Decrement below 1.0 -> 0.9::best quality::
            const step5 = adjustPromptTagWeight(step4.text, 10, 10, -0.1);
            expect(step5.text).toBe('1girl, 0.9::best quality::, smile');
        });

        it('updates range slider --range-pct and resets to default value on double-click', () => {
            const slider = createMockElement('steps', [], 'INPUT');
            slider.type = 'range';
            slider.min = '1';
            slider.max = '50';
            slider.value = '28';
            slider._attrValue = '28';

            const mockRoot = {
                querySelectorAll: () => [slider],
                addEventListener: vi.fn()
            };
            initRangeSliderEnhancements(mockRoot);
            expect(slider.style.getPropertyValue('--range-pct')).toBe('55.10%');

            // Move slider to 50 -> 100%
            slider.value = '50';
            updateRangeProgress(slider);
            expect(slider.style.getPropertyValue('--range-pct')).toBe('100.00%');

            // Double click -> resets back to default 28!
            global.Event = class {
                constructor(type) { this.type = type; }
            };
            slider._trigger('dblclick');
            expect(slider.value).toBe('28');
            expect(slider.style.getPropertyValue('--range-pct')).toBe('55.10%');
        });

        it('manages Lightbox zoom/pan state and resets on image change or close', () => {
            const mainImg = createMockElement('lightboxMainImg', [], 'IMG');
            const resetBtn = createMockElement('lightboxZoomReset', ['hidden']);
            const viewport = createMockElement('lightboxViewport');
            const modal = createMockElement('imageLightboxModal');
            global.document = {
                getElementById: (id) => ({
                    lightboxMainImg: mainImg,
                    lightboxZoomReset: resetBtn,
                    lightboxViewport: viewport,
                    imageLightboxModal: modal
                }[id] || null),
                querySelector: () => null,
                addEventListener: vi.fn()
            };

            const lb = createLightboxController({
                ui: {},
                els: {},
                store: {},
                appState: { showcaseData: [] },
                galleryController: { galleryItems: [] },
                charPromptManager: {},
                charRefManager: {},
                vibeManager: {},
                inpaintEditor: {},
                outpaintEditor: {},
                postProcess: {},
                triggerDownload: vi.fn()
            });

            lb.setLightboxZoom(2.5, 356, 306);
            expect(lb.getLightboxZoomState().scale).toBe(2.5);
            expect(mainImg.style.transform).toContain('scale(2.5)');
            expect(resetBtn.classList.contains('hidden')).toBe(false);
            expect(resetBtn.textContent).toContain('250%');

            lb.resetLightboxZoom();
            expect(lb.getLightboxZoomState().scale).toBe(1);
            expect(mainImg.style.transform).toBe('');
            expect(resetBtn.classList.contains('hidden')).toBe(true);
        });
    });

    describe('5. In-Place Before/After Comparison, Mini Filmstrip (Non-Overwrite) & In-Place Character Stage', () => {
        it('supports Before/After split slider drag and hold-to-peek (>160ms) directly on main canvas', () => {
            vi.useFakeTimers();
            const mockDom = {};
            [
                'canvasCompareBtn', 'canvasCompareSep', 'canvasCompareOverlay',
                'canvasBeforeImg', 'canvasCompareDivider', 'singleResultImg', 'singleResultArea'
            ].forEach(id => {
                mockDom[id] = createMockElement(id, ['hidden']);
            });
            mockDom.singleResultImg.src = 'blob:after-img';

            global.document = {
                documentElement: createMockElement('html'),
                getElementById: (id) => mockDom[id] || createMockElement(id),
                createElement: (tag) => createMockElement('created_' + tag, [], tag),
                querySelectorAll: () => [],
                addEventListener: vi.fn()
            };
            global.window = { safeCreateIcons: vi.fn(), innerWidth: 1280 };

            const ui = new UIController();

            // Set Before/After state -> reveals #canvasCompareBtn & #canvasCompareSep
            ui.setBeforeAfterImage('blob:before-img', 'blob:after-img');
            expect(mockDom.canvasCompareBtn.classList.contains('hidden')).toBe(false);
            expect(mockDom.canvasCompareSep.classList.contains('hidden')).toBe(false);
            expect(mockDom.canvasBeforeImg.src).toBe('blob:before-img');

            // 1. Short click (<160ms) -> toggles split comparison overlay
            mockDom.canvasCompareBtn._trigger('pointerdown', { button: 0 });
            vi.advanceTimersByTime(60);
            mockDom.canvasCompareBtn._trigger('pointerup', { button: 0 });

            expect(ui._isCompareSplitOpen).toBe(true);
            expect(mockDom.canvasCompareOverlay.classList.contains('hidden')).toBe(false);
            expect(mockDom.canvasCompareOverlay.classList.contains('peek-mode')).toBe(false);
            expect(mockDom.canvasCompareBtn.classList.contains('compare-active')).toBe(true);

            // Dragging divider updates --split-pct
            mockDom.canvasCompareDivider._trigger('pointerdown', { pointerId: 1, clientX: 228 }); // (228 - 100) / 512 = 25%
            expect(mockDom.canvasCompareOverlay.style.getPropertyValue('--split-pct')).toBe('25.0%');
            mockDom.canvasCompareDivider._trigger('pointerup', { pointerId: 1 });

            // Short click again -> closes split overlay
            mockDom.canvasCompareBtn._trigger('pointerdown', { button: 0 });
            vi.advanceTimersByTime(40);
            mockDom.canvasCompareBtn._trigger('pointerup', { button: 0 });
            expect(ui._isCompareSplitOpen).toBe(false);
            expect(mockDom.canvasCompareOverlay.classList.contains('hidden')).toBe(true);

            // 2. Hold press (>160ms) -> enters peek-mode (100% Before image), releasing restores After image
            mockDom.canvasCompareBtn._trigger('pointerdown', { button: 0 });
            vi.advanceTimersByTime(200);
            expect(ui._isComparePeeking).toBe(true);
            expect(mockDom.canvasCompareOverlay.classList.contains('hidden')).toBe(false);
            expect(mockDom.canvasCompareOverlay.classList.contains('peek-mode')).toBe(true);

            mockDom.canvasCompareBtn._trigger('pointerup', { button: 0 });
            expect(ui._isComparePeeking).toBe(false);
            expect(mockDom.canvasCompareOverlay.classList.contains('hidden')).toBe(true);

            vi.useRealTimers();
        });

        it('switches main canvas image on Filmstrip thumbnail click WITHOUT overwriting sidebar prompt/seed, and backfills only on SVG button', () => {
            const mockDom = {};
            [
                'canvasFilmstripDock', 'filmstripToggleBtn', 'filmstripToggleSvg',
                'filmstripInner', 'filmstripTrack', 'filmstripApplyParamsBtn',
                'prompt', 'negativePrompt', 'seed', 'steps', 'scale', 'singleResultImg', 'singleResultArea'
            ].forEach(id => {
                mockDom[id] = createMockElement(id, id === 'canvasFilmstripDock' ? ['hidden'] : []);
            });
            mockDom.prompt.value = 'USER_WORKING_PROMPT_DO_NOT_OVERWRITE';
            mockDom.seed.value = '999999';

            global.Event = class { constructor(type) { this.type = type; } };
            global.document = {
                documentElement: createMockElement('html'),
                getElementById: (id) => mockDom[id] || createMockElement(id),
                createElement: (tag) => createMockElement('created_' + tag, [], tag),
                querySelectorAll: () => [],
                addEventListener: vi.fn()
            };

            let selectedFilmstripId = null;
            global.window = {
                safeCreateIcons: vi.fn(),
                showToast: vi.fn(),
                setModel: vi.fn(),
                innerWidth: 1280,
                selectFilmstripImage: (id) => {
                    selectedFilmstripId = id;
                    // Simulate selectFilmstripImage: only switches canvas image, never touches prompt/seed
                    mockDom.singleResultImg.src = `blob:img-${id}`;
                }
            };

            const ui = new UIController();
            const historyItems = [
                { id: 101, imageUrl: 'blob:img-101', prompt: 'historical prompt 101', seed: 12345, steps: 24, scale: 4.5, model: 'v5' },
                { id: 102, imageUrl: 'blob:img-102', prompt: 'historical prompt 102', seed: 67890, steps: 28, scale: 6.0, model: 'v5' }
            ];

            ui.renderFilmstrip(historyItems, 101);
            expect(mockDom.canvasFilmstripDock.classList.contains('hidden')).toBe(false);
            expect(mockDom.filmstripTrack.children.length).toBe(2);

            // Click thumbnail #2 -> switches canvas image ONLY; sidebar prompt & seed MUST remain untouched!
            const secondThumb = mockDom.filmstripTrack.children[1];
            secondThumb.onclick({ stopPropagation: vi.fn() });
            expect(selectedFilmstripId).toBe(102);
            expect(mockDom.singleResultImg.src).toBe('blob:img-102');
            expect(mockDom.prompt.value).toBe('USER_WORKING_PROMPT_DO_NOT_OVERWRITE');
            expect(mockDom.seed.value).toBe('999999');

            // Clicking the dedicated pure-SVG applyItemParams button backfills parameters on demand
            const lb = createLightboxController({
                ui,
                els: { prompt: mockDom.prompt, negative: mockDom.negativePrompt },
                store: { setSetting: vi.fn() },
                appState: { showcaseData: [] },
                galleryController: { galleryItems: historyItems },
                charPromptManager: { addCharacterPromptRow: vi.fn(), updateCharacterIndexLabels: vi.fn(), onModelChange: vi.fn(), saveCharacterPromptsState: vi.fn() },
                charRefManager: { getCharRefKey: (k) => k, loadState: vi.fn() },
                vibeManager: { getVibeKey: (k) => k, loadState: vi.fn() },
                inpaintEditor: {},
                outpaintEditor: {},
                postProcess: {},
                triggerDownload: vi.fn()
            });

            lb.applyItemParams(historyItems[1], { closeAfter: false });
            expect(mockDom.prompt.value).toBe('historical prompt 102');
            expect(mockDom.seed.value).toBe(67890);
        });

        it('renders In-Place Character Position Stage inside #previewArea with V4.5 5x5 grid snapping and V5 continuous coords', () => {
            const htmlPath = path.resolve(process.cwd(), 'index.html');
            const html = fs.readFileSync(htmlPath, 'utf8');

            // Verify #charPositionStage is inside #previewArea (before #historyArea) and NOT a full-screen fixed z-[250] modal
            const previewIdx = html.indexOf('id="previewArea"');
            const charStageIdx = html.indexOf('id="charPositionStage"');
            const historyIdx = html.indexOf('id="historyArea"');
            expect(charStageIdx).toBeGreaterThan(previewIdx);
            expect(charStageIdx).toBeLessThan(historyIdx);
            expect(html).toContain('id="canvasFilmstripDock"');
            expect(html).toContain('id="filmstripApplyParamsBtn"');
            expect(html).toContain('id="toolboxSendToImg2ImgBtn"');

            const manager = new CharPromptManager();
            // Verify V4.5 5x5 grid snapping math & A1..E5 label mapping
            expect(manager._snapToV45Grid(0.04)).toBe(0.1);
            expect(manager._snapToV45Grid(0.28)).toBe(0.3);
            expect(manager._snapToV45Grid(0.52)).toBe(0.5);
            expect(manager._snapToV45Grid(0.88)).toBe(0.9);
            expect(manager._coordToGridLabel(0.1, 0.1)).toBe('A1');
            expect(manager._coordToGridLabel(0.5, 0.5)).toBe('C3');
            expect(manager._coordToGridLabel(0.9, 0.9)).toBe('E5');
        });
    });
});
