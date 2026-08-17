import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InpaintEditor } from '../src/inpaint.js';

describe('InpaintEditor UI & Canvas Rendering', () => {
    let mockElements = {};

    function getOrCreateMockElement(id) {
        if (!mockElements[id]) {
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

            const classSet = new Set();
            mockElements[id] = {
                id,
                value: '',
                textContent: '',
                checked: false,
                width: 512,
                height: 512,
                naturalWidth: 512,
                naturalHeight: 512,
                src: 'data:image/png;base64,mock',
                classList: {
                    add: vi.fn((c) => classSet.add(c)),
                    remove: vi.fn((c) => classSet.delete(c)),
                    toggle: vi.fn((c) => {
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
                dispatchEvent: vi.fn(function(event) {
                    const cbs = this.listeners[event.type] || [];
                    for (const cb of cbs) cb(event);
                    return true;
                }),
                getContext: vi.fn(() => ctxMock),
                getBoundingClientRect: vi.fn(() => ({
                    left: 0,
                    top: 0,
                    right: 512,
                    bottom: 512,
                    width: 512,
                    height: 512
                })),
                setPointerCapture: vi.fn(),
                releasePointerCapture: vi.fn()
            };
        }
        return mockElements[id];
    }

    let editor;
    let mockEngine;
    let mockStore;
    let mockUi;

    beforeEach(() => {
        mockElements = {};

        global.window = {
            safeCreateIcons: vi.fn(),
            outpaintEditor: null,
            requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 0)),
            cancelAnimationFrame: vi.fn()
        };

        global.document = {
            getElementById: vi.fn((id) => getOrCreateMockElement(id)),
            createElement: vi.fn((tag) => {
                const el = getOrCreateMockElement(`__created_${Math.random()}`);
                el.tagName = tag.toUpperCase();
                el.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,mockResultData');
                return el;
            })
        };

        global.Image = class {
            constructor() {
                this.naturalWidth = 512;
                this.naturalHeight = 512;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }
        };

        mockEngine = { generate: vi.fn().mockResolvedValue({ blob: new Blob(['fake']) }) };
        mockStore = { getSetting: vi.fn().mockReturnValue('') };
        mockUi = { updateCreditDisplay: vi.fn() };

        editor = new InpaintEditor({
            ui: mockUi,
            engine: mockEngine,
            store: mockStore,
            onComplete: vi.fn(),
            getExtraParams: vi.fn().mockReturnValue({})
        });
    });

    it('should cleanly initialize tool and sync inputs between desktop and mobile', () => {
        expect(editor.tool).toBe('brush');

        const strMobile = document.getElementById('inpaintStrengthMobile');
        strMobile.value = '0.75';
        strMobile.dispatchEvent({ type: 'input', target: { value: '0.75' } });

        expect(document.getElementById('inpaintStrength').value).toBe('0.75');
        expect(document.getElementById('inpaintStrengthVal').textContent).toBe('0.75');
        expect(document.getElementById('inpaintStrengthValMobile').textContent).toBe('0.75');
    });

    it('should toggle mobile drawer and update toggle indicator label without losing UI elements', () => {
        const drawer = document.getElementById('inpaintMobileDrawer');
        const label = document.getElementById('drawerToggleLabel');

        expect(drawer.classList.contains('expanded')).toBe(false);

        editor.toggleDrawer();
        expect(drawer.classList.contains('expanded')).toBe(true);
        expect(label.textContent).toBe('收起 ▼');

        editor.toggleDrawer();
        expect(drawer.classList.contains('expanded')).toBe(false);
        expect(label.textContent).toBe('展开 ▲');
    });

    it('should handle pointer down, move, and up drawing strokes cleanly', () => {
        const canvas = editor.maskCanvas;

        canvas.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 100, clientY: 100, preventDefault: vi.fn() });
        expect(editor.drawing).toBe(true);
        expect(editor.history.length).toBe(1);

        canvas.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 150, clientY: 150, preventDefault: vi.fn() });
        expect(editor.drawing).toBe(true);

        canvas.dispatchEvent({ type: 'pointerup', pointerId: 1, preventDefault: vi.fn() });
        expect(editor.drawing).toBe(false);
        expect(editor.lastPos).toBeNull();
    });

    it('should accurately switch tools and undo mask states', () => {
        editor.setTool('eraser');
        expect(editor.tool).toBe('eraser');

        editor.setTool('brush');
        expect(editor.tool).toBe('brush');

        editor.saveMaskState();
        expect(editor.history.length).toBe(1);
        editor.clearMask();
        expect(editor.history.length).toBe(2);

        editor.undo();
        expect(editor.history.length).toBe(1);
    });
});
