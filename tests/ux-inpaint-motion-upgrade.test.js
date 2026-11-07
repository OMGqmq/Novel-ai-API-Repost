import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { InpaintEditor } from '../src/inpaint.js';
import { UIController } from '../src/ui.js';
import { createLightboxController } from '../src/lightbox-controller.js';
import {
    adjustPromptTagWeight,
    updateRangeProgress,
    initRangeSliderEnhancements
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

        it('docks #inpaintModal directly inside #previewArea instead of fixed body root', () => {
            const previewIdx = html.indexOf('id="previewArea"');
            const historyIdx = html.indexOf('id="historyArea"');
            const inpaintIdx = html.indexOf('id="inpaintModal"');
            expect(previewIdx).toBeGreaterThan(-1);
            expect(inpaintIdx).toBeGreaterThan(previewIdx);
            expect(inpaintIdx).toBeLessThan(historyIdx);
            expect(html).not.toContain('id="inpaintModal" class="fixed');
        });

        it('enforces touch-action: none on inpaint canvas wrap, stage, and mask canvas', () => {
            expect(html).toContain('id="inpaintCanvasStage"');
            expect(html).toContain('id="inpaintQuickRetryBar"');
            expect(html).toContain('id="inpaintRestoreMaskBtn"');
            expect(html).toContain('id="inpaintMoveBtn"');
            expect(html).toContain('id="generationSkeleton"');
            expect(html).toContain('id="pngDropOverlay"');
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
                inpaintQuickRetryBar: createMockElement('inpaintQuickRetryBar', ['hidden']),
                inpaintRestoreMaskBtn: createMockElement('inpaintRestoreMaskBtn', ['hidden']),
                inpaintZoomBadge: createMockElement('inpaintZoomBadge'),
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

        it('persists lastSession mask across doInpaint() and restores original image + mask on retryLastSession()', async () => {
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

            editor.open();

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

            // Submit inpaint
            await editor.doInpaint();

            // History stack cleared on close (memory safety), new image shown, quick retry bar visible!
            expect(editor.history.length).toBe(0);
            expect(elements.singleResultImg.src).toBe('data:image/png;base64,NEW_GENERATED_IMG');
            expect(elements.inpaintQuickRetryBar.classList.contains('hidden')).toBe(false);
            expect(editor.hasRestorableMask()).toBe(true);

            // User is dissatisfied -> clicks "不满意？回退原图重绘" (retryLastSession)
            const retried = editor.retryLastSession();
            expect(retried).toBe(true);
            expect(elements.singleResultImg.src).toBe('data:image/png;base64,ORIGINAL_IMG');
            expect(editor.originalImgSrc).toBe('data:image/png;base64,ORIGINAL_IMG');
            expect(editor._hasPaintedMask()).toBe(true);
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

            // Loading state -> displays aspect-ratio matched skeleton
            ui.setLoading(true, '生成中...');
            expect(mockDom.generationSkeleton.classList.contains('hidden')).toBe(false);
            expect(mockDom.generationSkeletonFrame.style.aspectRatio).toBe('1216 / 832');
            ui.setLoading(false);
            expect(mockDom.generationSkeleton.classList.contains('hidden')).toBe(true);

            // Multi-image batch -> shows grid first
            ui.showResultImages([{ imageUrl: 'blob:batch-1' }, { imageUrl: 'blob:batch-2' }]);
            expect(mockDom.resultGrid.classList.contains('hidden')).toBe(false);
            expect(mockDom.singleResultArea.classList.contains('hidden')).toBe(true);
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
});
