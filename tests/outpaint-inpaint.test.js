import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutpaintEditor } from '../src/outpaint.js';
import { InpaintEditor } from '../src/inpaint.js';

describe('Frontend Runtime Fixes & Canvas Stability (R1)', () => {
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
                createImageData: vi.fn((w, h) => ({
                    width: w,
                    height: h,
                    data: new Uint8ClampedArray(w * h * 4)
                }))
            };

            mockElements[id] = {
                id,
                value: '',
                checked: false,
                width: 512,
                height: 512,
                naturalWidth: 512,
                naturalHeight: 512,
                src: 'data:image/png;base64,mock',
                classList: {
                    add: vi.fn(),
                    remove: vi.fn(),
                    toggle: vi.fn(),
                    contains: vi.fn().mockReturnValue(false)
                },
                style: {},
                dataset: {},
                options: [],
                add: function(opt) { this.options.push(opt); },
                dispatchEvent: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                getBoundingClientRect: vi.fn().mockReturnValue({ left: 0, top: 0, width: 512, height: 512 }),
                getContext: vi.fn().mockReturnValue(ctxMock),
                toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockdata')
            };
        }
        return mockElements[id];
    }

    beforeEach(() => {
        mockElements = {};
        global.document = {
            getElementById: (id) => getOrCreateMockElement(id),
            querySelectorAll: () => [],
            createElement: (tag) => {
                const el = getOrCreateMockElement(`created_${tag}_${Math.random()}`);
                el.tagName = tag.toUpperCase();
                return el;
            }
        };
        getOrCreateMockElement('modelValue').value = 'v4.5';
        global.window = {
            showToast: vi.fn(),
            showConfirm: vi.fn().mockResolvedValue(true),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            safeCreateIcons: vi.fn()
        };
        global.localStorage = {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn(),
            removeItem: vi.fn()
        };
        global.Image = class {
            constructor() {
                this.naturalWidth = 512;
                this.naturalHeight = 512;
                this.width = 512;
                this.height = 512;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }
        };
    });

    describe('1. Outpaint TDZ ReferenceError Fix', () => {
        it('should execute outpaint.generate() without TDZ ReferenceError when custom keys are present', async () => {
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({
                    blob: new Blob(['outpaint_result'], { type: 'image/png' }),
                    userRole: 'plus'
                })
            };

            const settings = {
                nai_admin_token: 'admin_tok',
                nai_user_key: 'user_k',
                nai_custom_api_key: 'custom_k1, custom_k2'
            };

            const mockStore = {
                getSetting: vi.fn((k, def = '') => settings[k] !== undefined ? settings[k] : def),
                saveImage: vi.fn().mockResolvedValue(true)
            };

            const getExtraParams = vi.fn((modelVersion, hasCustomKey) => ({
                custom_flag: hasCustomKey,
                model_ver: modelVersion
            }));

            const editor = new OutpaintEditor({
                engine: mockEngine,
                store: mockStore,
                getExtraParams
            });

            // Set up DOM values
            getOrCreateMockElement('modelValue').value = 'v4.5';
            getOrCreateMockElement('prompt').value = 'fantasy landscape, 8k';
            getOrCreateMockElement('negativePrompt').value = 'blurry';
            getOrCreateMockElement('steps').value = '28';
            getOrCreateMockElement('scale').value = '5.0';
            getOrCreateMockElement('sampler').value = 'k_euler';

            // Ensure generate completes without throwing ReferenceError
            await expect(editor.generate()).resolves.not.toThrow();

            expect(getExtraParams).toHaveBeenCalledWith('v4.5', true);
            expect(mockEngine.generate).toHaveBeenCalledTimes(1);

            const [calledParams, calledAuth] = mockEngine.generate.mock.calls[0];
            expect(calledParams.prompt).toBe('fantasy landscape, 8k');
            expect(calledParams.custom_flag).toBe(true);
            expect(calledAuth.customApiKey).toBe('custom_k1');
        });

        it('should handle getExtraParams with hasCustomKey=false when custom keys are empty', async () => {
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({
                    blob: new Blob(['result']),
                    userRole: 'standard'
                })
            };

            const mockStore = {
                getSetting: vi.fn((k, def = '') => def),
                saveImage: vi.fn().mockResolvedValue(true)
            };

            const getExtraParams = vi.fn((modelVersion, hasCustomKey) => ({
                hasCustomKey
            }));

            const editor = new OutpaintEditor({
                engine: mockEngine,
                store: mockStore,
                getExtraParams
            });

            await expect(editor.generate()).resolves.not.toThrow();
            expect(getExtraParams).toHaveBeenCalledWith('v4.5', false);
            expect(mockEngine.generate).toHaveBeenCalledTimes(1);
        });

        it('should failover to next key in OutpaintEditor if first key fails', async () => {
            const mockEngine = {
                generate: vi.fn()
                    .mockRejectedValueOnce(new Error('429 Too Many Requests'))
                    .mockResolvedValueOnce({
                        blob: new Blob(['result']),
                        userRole: 'plus'
                    })
            };

            const settings = {
                nai_custom_api_key: 'key1, key2'
            };

            const mockStore = {
                getSetting: vi.fn((k, def = '') => settings[k] !== undefined ? settings[k] : def),
                saveImage: vi.fn().mockResolvedValue(true)
            };

            const editor = new OutpaintEditor({
                engine: mockEngine,
                store: mockStore,
                getExtraParams: () => ({})
            });

            await expect(editor.generate()).resolves.not.toThrow();
            expect(mockEngine.generate).toHaveBeenCalledTimes(2);
            expect(mockEngine.generate.mock.calls[0][1].customApiKey).toBe('key1');
            expect(mockEngine.generate.mock.calls[1][1].customApiKey).toBe('key2');
        });
    });

    describe('2. Canvas History Memory Optimization & Bounds', () => {
        describe('OutpaintEditor History', () => {
            it('should cap history to maxHistory (10 states) in OutpaintEditor', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                expect(editor.maxHistory).toBe(10);
                expect(editor.maxMaskHistory).toBe(10);

                // Push 15 states
                for (let i = 0; i < 15; i++) {
                    editor.els.canvas.width = 500 + i;
                    editor.saveState();
                }

                expect(editor.history.length).toBe(10);
                // Earliest 5 states should have been shifted out
                expect(editor.history[0].width).toBe(505);
                expect(editor.history[9].width).toBe(514);
            });

            it('should cap maskHistory to maxMaskHistory (10 states) in OutpaintEditor', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                for (let i = 0; i < 15; i++) {
                    editor.maskHistory.push({ width: 512, height: 512, id: i });
                    if (editor.maskHistory.length > editor.maxMaskHistory) {
                        editor.maskHistory.shift();
                    }
                }

                expect(editor.maskHistory.length).toBe(10);
                expect(editor.maskHistory[0].id).toBe(5);
                expect(editor.maskHistory[9].id).toBe(14);
            });

            it('should clean up history and maskHistory buffers on close() in OutpaintEditor', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.saveState();
                editor.saveState();
                editor.maskHistory.push({ width: 512, height: 512 });

                expect(editor.history.length).toBe(2);
                expect(editor.maskHistory.length).toBe(1);

                editor.close();

                expect(editor.history.length).toBe(0);
                expect(editor.maskHistory.length).toBe(0);
            });

            it('should preserve canvas transformation, selection, and pixel fidelity on undo()', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.selection = { x: 10, y: 20, w: 256, h: 256 };
                editor.transform = { x: 5, y: 15, scale: 1.5 };
                editor.els.canvas.width = 800;
                editor.els.canvas.height = 600;

                editor.saveState();

                // Mutate
                editor.selection = { x: 100, y: 200, w: 512, h: 512 };
                editor.transform = { x: 0, y: 0, scale: 1.0 };
                editor.els.canvas.width = 1024;
                editor.els.canvas.height = 1024;

                editor.undo();

                expect(editor.selection).toEqual({ x: 10, y: 20, w: 256, h: 256 });
                expect(editor.transform).toEqual({ x: 5, y: 15, scale: 1.5 });
                expect(editor.els.canvas.width).toBe(800);
                expect(editor.els.canvas.height).toBe(600);
            });
        });

        describe('InpaintEditor History & Compact Alpha Mask', () => {
            it('should store compact Uint8Array alpha mask data and cap history to 20 states', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                const w = 64;
                const h = 64;
                editor.maskCanvas.width = w;
                editor.maskCanvas.height = h;

                // Push 25 states
                for (let i = 0; i < 25; i++) {
                    editor.saveMaskState();
                }

                expect(editor.history.length).toBe(20);
                const firstState = editor.history[0];
                expect(firstState.width).toBe(w);
                expect(firstState.height).toBe(h);
                expect(firstState.alpha).toBeInstanceOf(Uint8Array);
                expect(firstState.alpha.length).toBe(w * h);
            });

            it('should maintain 100% pixel fidelity when saving and undoing alpha mask states', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                const w = 4;
                const h = 4;
                editor.maskCanvas.width = w;
                editor.maskCanvas.height = h;

                // Mock maskCtx.getImageData with specific alpha pattern
                const testData = new Uint8ClampedArray(w * h * 4);
                // Pixel 0: alpha 255 (white brush)
                testData[0] = 255; testData[1] = 255; testData[2] = 255; testData[3] = 255;
                // Pixel 1: alpha 128 (blurred mask)
                testData[4] = 255; testData[5] = 255; testData[6] = 255; testData[7] = 128;
                // Pixel 2: alpha 0 (transparent/erased)
                testData[8] = 0; testData[9] = 0; testData[10] = 0; testData[11] = 0;
                // Pixel 3: flood filled black (0,0,0,255) -> should treat as 0
                testData[12] = 0; testData[13] = 0; testData[14] = 0; testData[15] = 255;

                editor.maskCtx.getImageData = vi.fn().mockReturnValue({
                    width: w,
                    height: h,
                    data: testData
                });

                let restoredImageData = null;
                editor.maskCtx.putImageData = vi.fn((imgData) => {
                    restoredImageData = imgData;
                });

                editor.saveMaskState();

                expect(editor.history.length).toBe(1);
                const savedAlpha = editor.history[0].alpha;
                expect(savedAlpha[0]).toBe(255);
                expect(savedAlpha[1]).toBe(128);
                expect(savedAlpha[2]).toBe(0);
                expect(savedAlpha[3]).toBe(0);

                editor.undo();

                expect(editor.maskCtx.putImageData).toHaveBeenCalledTimes(1);
                expect(restoredImageData).not.toBeNull();
                const restored = restoredImageData.data;

                // Pixel 0
                expect(restored[0]).toBe(255);
                expect(restored[1]).toBe(255);
                expect(restored[2]).toBe(255);
                expect(restored[3]).toBe(255);

                // Pixel 1
                expect(restored[4]).toBe(255);
                expect(restored[5]).toBe(255);
                expect(restored[6]).toBe(255);
                expect(restored[7]).toBe(128);

                // Pixel 2
                expect(restored[11]).toBe(0);

                // Pixel 3
                expect(restored[15]).toBe(0);
            });

            it('should clean up history on close() in InpaintEditor', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.maskCanvas.width = 100;
                editor.maskCanvas.height = 100;
                editor.saveMaskState();
                editor.saveMaskState();

                expect(editor.history.length).toBe(2);

                editor.close();

                expect(editor.history.length).toBe(0);
            });
        });
    });

    describe('3. Multi-Key Failover Logic', () => {
        it('should failover to candidate keys sequentially when earlier keys fail', async () => {
            const customApiKeys = ['key_fail_429', 'key_fail_500', 'key_success'];
            const authBase = { adminToken: '', userKey: '', userToken: '' };

            const candidateKeys = customApiKeys.slice(0).concat(customApiKeys.slice(0, 0));
            const authsToTry = candidateKeys.map(key => ({ ...authBase, customApiKey: key }));

            const mockEngine = {
                generate: vi.fn(async (params, auth) => {
                    if (auth.customApiKey === 'key_fail_429') {
                        throw new Error('429 Rate Limit Exceeded');
                    }
                    if (auth.customApiKey === 'key_fail_500') {
                        throw new Error('500 Internal Server Error');
                    }
                    if (auth.customApiKey === 'key_success') {
                        return { blob: new Blob(['success']), userRole: 'plus' };
                    }
                    throw new Error('Unknown key');
                })
            };

            let result = null;
            let lastError = null;
            for (const auth of authsToTry) {
                try {
                    result = await mockEngine.generate({ prompt: 'test' }, auth);
                    break;
                } catch (err) {
                    lastError = err;
                }
            }

            expect(result).not.toBeNull();
            expect(result.userRole).toBe('plus');
            expect(mockEngine.generate).toHaveBeenCalledTimes(3);
            expect(mockEngine.generate.mock.calls[0][1].customApiKey).toBe('key_fail_429');
            expect(mockEngine.generate.mock.calls[1][1].customApiKey).toBe('key_fail_500');
            expect(mockEngine.generate.mock.calls[2][1].customApiKey).toBe('key_success');
        });

        it('should correctly rotate key priority across sequential batch iterations with round-robin failover', async () => {
            const customApiKeys = ['keyA', 'keyB', 'keyC'];
            const authBase = { adminToken: '', userKey: '', userToken: '' };

            const getAuthsForBatchIndex = (i) => {
                const candidateKeys = customApiKeys.length > 0
                    ? customApiKeys.slice(i % customApiKeys.length).concat(customApiKeys.slice(0, i % customApiKeys.length))
                    : [""];
                return candidateKeys.map(key => ({ ...authBase, customApiKey: key }));
            };

            // Iteration 0: keyA, keyB, keyC
            const auths0 = getAuthsForBatchIndex(0);
            expect(auths0.map(a => a.customApiKey)).toEqual(['keyA', 'keyB', 'keyC']);

            // Iteration 1: keyB, keyC, keyA
            const auths1 = getAuthsForBatchIndex(1);
            expect(auths1.map(a => a.customApiKey)).toEqual(['keyB', 'keyC', 'keyA']);

            // Iteration 2: keyC, keyA, keyB
            const auths2 = getAuthsForBatchIndex(2);
            expect(auths2.map(a => a.customApiKey)).toEqual(['keyC', 'keyA', 'keyB']);

            // Iteration 3 (wraparound): keyA, keyB, keyC
            const auths3 = getAuthsForBatchIndex(3);
            expect(auths3.map(a => a.customApiKey)).toEqual(['keyA', 'keyB', 'keyC']);
        });

        it('should throw error when all candidate keys fail', async () => {
            const customApiKeys = ['key1', 'key2'];
            const authBase = { adminToken: '', userKey: '', userToken: '' };
            const authsToTry = customApiKeys.map(key => ({ ...authBase, customApiKey: key }));

            const mockEngine = {
                generate: vi.fn().mockRejectedValue(new Error('403 Forbidden'))
            };

            let result = null;
            let lastError = null;
            for (const auth of authsToTry) {
                try {
                    result = await mockEngine.generate({ prompt: 'test' }, auth);
                    break;
                } catch (err) {
                    lastError = err;
                }
            }

            expect(result).toBeNull();
            expect(lastError).not.toBeNull();
            expect(lastError.message).toBe('403 Forbidden');
            expect(mockEngine.generate).toHaveBeenCalledTimes(2);
        });
    });
});
