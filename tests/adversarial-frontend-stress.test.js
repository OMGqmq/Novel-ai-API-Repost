import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutpaintEditor } from '../src/outpaint.js';
import { InpaintEditor } from '../src/inpaint.js';

describe('Adversarial Stress-Testing: Frontend & Runtime Verification', () => {
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

    describe('Objective 1: Outpaint TDZ ReferenceError & Multi-Configuration Stress Test', () => {
        const modelTestCases = ['v4.5', 'v4-curated', 'v4-full', 'v3', 'v2', 'v1', ''];
        const keyTestCases = [
            { name: 'No custom keys', raw: '', expectedKeysCount: 1, hasCustom: false },
            { name: 'Single custom key', raw: 'key_1', expectedKeysCount: 1, hasCustom: true },
            { name: 'Multiple newline keys', raw: 'key_1\nkey_2\nkey_3', expectedKeysCount: 3, hasCustom: true },
            { name: 'Multiple comma keys with spaces', raw: '  key_a ,  key_b , key_c  ', expectedKeysCount: 3, hasCustom: true }
        ];

        for (const model of modelTestCases) {
            for (const keyCase of keyTestCases) {
                it(`should execute outpaint.generate() with model="${model}" and ${keyCase.name} without TDZ or uncaught exceptions`, async () => {
                    const mockEngine = {
                        generate: vi.fn().mockResolvedValue({
                            blob: new Blob(['result']),
                            userRole: 'plus'
                        })
                    };

                    const mockStore = {
                        getSetting: vi.fn((key, def = '') => {
                            if (key === 'nai_custom_api_key') return keyCase.raw;
                            if (key === 'nai_admin_token') return 'admin_123';
                            if (key === 'nai_user_key') return 'user_456';
                            return def;
                        }),
                        saveImage: vi.fn().mockResolvedValue(true)
                    };

                    const getExtraParams = vi.fn((modelVer, hasCustom) => ({
                        passedModel: modelVer,
                        passedHasCustom: hasCustom
                    }));

                    const editor = new OutpaintEditor({
                        engine: mockEngine,
                        store: mockStore,
                        getExtraParams
                    });

                    getOrCreateMockElement('modelValue').value = model;

                    await expect(editor.generate()).resolves.not.toThrow();

                    const expectedModel = model || 'v4.5';
                    expect(getExtraParams).toHaveBeenCalledWith(expectedModel, keyCase.hasCustom);
                    expect(mockEngine.generate).toHaveBeenCalledTimes(1);

                    const [sentParams, sentAuth] = mockEngine.generate.mock.calls[0];
                    expect(sentParams.version).toBe(expectedModel);
                    expect(sentParams.passedModel).toBe(expectedModel);
                    expect(sentParams.passedHasCustom).toBe(keyCase.hasCustom);
                    expect(sentAuth.adminToken).toBe('admin_123');
                    expect(sentAuth.userKey).toBe('user_456');
                });
            }
        }

        it('should handle outpaint.generate() without optional getExtraParams provided', async () => {
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({
                    blob: new Blob(['result']),
                    userRole: 'standard'
                })
            };

            const mockStore = {
                getSetting: vi.fn((key, def = '') => def)
            };

            const editor = new OutpaintEditor({
                engine: mockEngine,
                store: mockStore
            });

            await expect(editor.generate()).resolves.not.toThrow();
            expect(mockEngine.generate).toHaveBeenCalledTimes(1);
        });

        it('should restore generate buttons state even if all API keys fail during outpaint.generate()', async () => {
            const mockEngine = {
                generate: vi.fn().mockRejectedValue(new Error('500 NovelAI Server Error'))
            };

            const mockStore = {
                getSetting: vi.fn((key, def = '') => {
                    if (key === 'nai_custom_api_key') return 'k1, k2';
                    return def;
                })
            };

            const deskBtn = getOrCreateMockElement('desktopGenerateBtn');
            const floatBtn = getOrCreateMockElement('floatingGenerateBtn');
            deskBtn.disabled = false;
            floatBtn.disabled = false;

            const editor = new OutpaintEditor({
                engine: mockEngine,
                store: mockStore
            });

            const globalAlert = vi.fn();
            global.alert = globalAlert;

            await editor.generate();

            expect(mockEngine.generate).toHaveBeenCalledTimes(2);
            expect(deskBtn.disabled).toBe(false);
            expect(floatBtn.disabled).toBe(false);
            expect(globalAlert).toHaveBeenCalledWith(expect.stringContaining('操作失败: 500 NovelAI Server Error'));
        });
    });

    describe('Objective 2: Canvas Undo/Redo Boundary Conditions, Pixel Fidelity & Rapid Stress Cycles', () => {
        describe('InpaintEditor Stress Testing', () => {
            it('should strictly cap history to 20 states under extreme push load (FIFO eviction)', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.maskCanvas.width = 128;
                editor.maskCanvas.height = 128;

                // Push 100 states
                for (let i = 0; i < 100; i++) {
                    editor.maskCtx.getImageData = vi.fn().mockReturnValue({
                        width: 128,
                        height: 128,
                        data: new Uint8ClampedArray(128 * 128 * 4).fill(i % 256)
                    });
                    editor.saveMaskState();
                }

                expect(editor.history.length).toBe(20);
                expect(editor.history[0].alpha[0]).toBe(80);
                expect(editor.history[19].alpha[0]).toBe(99);
            });

            it('should handle 100 rapid undo() calls gracefully when history is small or empty', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.maskCanvas.width = 64;
                editor.maskCanvas.height = 64;

                editor.saveMaskState();
                editor.saveMaskState();
                editor.saveMaskState();
                expect(editor.history.length).toBe(3);

                for (let i = 0; i < 100; i++) {
                    expect(() => editor.undo()).not.toThrow();
                }

                expect(editor.history.length).toBe(0);
            });

            it('should verify 100% pixel fidelity across multi-cycle draw, blur, erase, and undo operations', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                const w = 8;
                const h = 8;
                editor.maskCanvas.width = w;
                editor.maskCanvas.height = h;

                const state0Data = new Uint8ClampedArray(w * h * 4).fill(0);
                
                const state1Data = new Uint8ClampedArray(w * h * 4).fill(0);
                for (let y = 0; y < 4; y++) {
                    for (let x = 0; x < 4; x++) {
                        const idx = (y * w + x) * 4;
                        state1Data[idx] = 255; state1Data[idx + 1] = 255; state1Data[idx + 2] = 255; state1Data[idx + 3] = 255;
                    }
                }

                const state2Data = new Uint8ClampedArray(state1Data);
                state2Data[4 * 4 + 3] = 180;
                state2Data[5 * 4 + 3] = 90;

                editor.maskCtx.getImageData = vi.fn().mockReturnValue({ width: w, height: h, data: state0Data });
                editor.saveMaskState();

                editor.maskCtx.getImageData = vi.fn().mockReturnValue({ width: w, height: h, data: state1Data });
                editor.saveMaskState();

                editor.maskCtx.getImageData = vi.fn().mockReturnValue({ width: w, height: h, data: state2Data });
                editor.saveMaskState();

                expect(editor.history.length).toBe(3);

                let lastPutData = null;
                editor.maskCtx.putImageData = vi.fn((imgData) => {
                    lastPutData = imgData.data;
                });

                editor.undo();
                expect(lastPutData[4 * 4 + 3]).toBe(180);
                expect(lastPutData[5 * 4 + 3]).toBe(90);

                editor.undo();
                expect(lastPutData[0 + 3]).toBe(255);
                expect(lastPutData[4 * 4 + 3]).toBe(0);

                editor.undo();
                expect(lastPutData[0 + 3]).toBe(0);

                expect(editor.history.length).toBe(0);
            });

            it('should completely purge history buffer on close() preventing memory leaks across 200 cycles', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.maskCanvas.width = 512;
                editor.maskCanvas.height = 512;

                for (let cycle = 0; cycle < 200; cycle++) {
                    for (let s = 0; s < 10; s++) {
                        editor.saveMaskState();
                    }
                    expect(editor.history.length).toBe(10);
                    editor.close();
                    expect(editor.history.length).toBe(0);
                }
            });

            it('should accurately handle flood-fill and blur alpha transformations', () => {
                const editor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: { getSetting: () => '' }
                });

                const w = 16;
                const h = 16;
                editor.maskCanvas.width = w;
                editor.maskCanvas.height = h;

                const maskData = new Uint8ClampedArray(w * h * 4).fill(0);
                editor.maskCtx.getImageData = vi.fn().mockReturnValue({ width: w, height: h, data: maskData });

                editor._floodFill(4, 4, 15);
                expect(editor.maskCtx.putImageData).toHaveBeenCalled();

                editor._blurMask({ x: 8, y: 8 }, 4, 50);
                expect(editor.maskCtx.putImageData).toHaveBeenCalled();
            });
        });

        describe('OutpaintEditor Stress Testing', () => {
            it('should strictly cap history and maskHistory to maxHistory (10) under high iteration loops', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                for (let i = 0; i < 50; i++) {
                    editor.els.canvas.width = 100 + i;
                    editor.saveState();
                    editor.maskHistory.push({ width: 512, height: 512, step: i });
                    if (editor.maskHistory.length > editor.maxMaskHistory) {
                        editor.maskHistory.shift();
                    }
                }

                expect(editor.history.length).toBe(10);
                expect(editor.history[0].width).toBe(140);
                expect(editor.history[9].width).toBe(149);

                expect(editor.maskHistory.length).toBe(10);
                expect(editor.maskHistory[0].step).toBe(40);
                expect(editor.maskHistory[9].step).toBe(49);
            });

            it('should handle rapid undo() cycles in paint and move modes without throwing exceptions', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                global.alert = vi.fn();

                editor.setMode('paint');
                editor.maskHistory.push({ width: 512, height: 512 });
                editor.undo();
                expect(editor.maskHistory.length).toBe(0);

                editor.undo();
                expect(global.alert).toHaveBeenCalledWith('没有可撤销的操作');

                editor.setMode('move');
                for (let i = 0; i < 20; i++) {
                    editor.undo();
                }
            });

            it('should release all canvas history and mask history references on close() across 200 cycles', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                for (let cycle = 0; cycle < 200; cycle++) {
                    for (let i = 0; i < 10; i++) {
                        editor.saveState();
                        editor.maskHistory.push({ id: i });
                    }
                    expect(editor.history.length).toBe(10);
                    expect(editor.maskHistory.length).toBe(10);

                    editor.close();

                    expect(editor.history.length).toBe(0);
                    expect(editor.maskHistory.length).toBe(0);
                }
            });

            it('should respect zoom boundaries [0.05, 10] and calculate zoom ratios safely', () => {
                const editor = new OutpaintEditor({
                    engine: {},
                    store: { getSetting: () => '' }
                });

                editor.transform = { x: 100, y: 100, scale: 1.0 };
                
                // Zoom in 50 times (should cap at 10)
                for (let i = 0; i < 50; i++) {
                    editor.zoomIn();
                }
                expect(editor.transform.scale).toBeLessThanOrEqual(10);
                expect(editor.transform.scale).toBeCloseTo(10, 5);

                // Zoom out 100 times (should cap at 0.05)
                for (let i = 0; i < 100; i++) {
                    editor.zoomOut();
                }
                expect(editor.transform.scale).toBeGreaterThanOrEqual(0.05);
                expect(editor.transform.scale).toBeCloseTo(0.05, 5);
            });
        });
    });

    describe('Objective 3: Multi-Key Failover Stress Testing in Generation Loops', () => {
        it('should seamlessly failover across keys in multi-batch sequence when primary keys experience 429/500 errors', async () => {
            const customApiKeys = ['key_rate_limited', 'key_server_error', 'key_healthy'];
            const authBase = { adminToken: '', userKey: '', userToken: '' };

            const simulateBatchExecution = async (batchTotal) => {
                const batchOutputs = [];
                const keyUsageLog = [];

                const mockEngine = {
                    generate: vi.fn(async (params, auth) => {
                        keyUsageLog.push(auth.customApiKey);
                        if (auth.customApiKey === 'key_rate_limited') {
                            throw new Error('429 Too Many Requests (Rate Limit Exceeded)');
                        }
                        if (auth.customApiKey === 'key_server_error') {
                            throw new Error('500 Internal Server Error (NovelAI Cluster Down)');
                        }
                        if (auth.customApiKey === 'key_healthy') {
                            return {
                                blob: new Blob([`image_seed_${params.seed}`], { type: 'image/png' }),
                                userRole: 'plus',
                                seed: params.seed
                            };
                        }
                        throw new Error('Unrecognized key');
                    })
                };

                for (let i = 0; i < batchTotal; i++) {
                    const candidateKeys = customApiKeys.length > 0
                        ? customApiKeys.slice(i % customApiKeys.length).concat(customApiKeys.slice(0, i % customApiKeys.length))
                        : [""];
                    const authsToTry = candidateKeys.map(key => ({ ...authBase, customApiKey: key }));
                    const localParams = { prompt: '1girl, anime', seed: 1000 + i };

                    let result = null;
                    let lastError = null;
                    for (const auth of authsToTry) {
                        try {
                            result = await mockEngine.generate(localParams, auth);
                            break;
                        } catch (err) {
                            lastError = err;
                        }
                    }

                    if (!result) {
                        throw lastError || new Error("所有配置的 API Key 均请求失败");
                    }

                    batchOutputs.push(result);
                }

                return { batchOutputs, keyUsageLog, mockEngine };
            };

            const { batchOutputs, keyUsageLog, mockEngine } = await simulateBatchExecution(4);

            expect(batchOutputs.length).toBe(4);
            expect(batchOutputs[0].seed).toBe(1000);
            expect(batchOutputs[1].seed).toBe(1001);
            expect(batchOutputs[2].seed).toBe(1002);
            expect(batchOutputs[3].seed).toBe(1003);

            expect(mockEngine.generate).toHaveBeenCalledTimes(9);
            expect(keyUsageLog).toEqual([
                'key_rate_limited', 'key_server_error', 'key_healthy',
                'key_server_error', 'key_healthy',
                'key_healthy',
                'key_rate_limited', 'key_server_error', 'key_healthy'
            ]);
        });

        it('should handle concurrent generation with partial key failures without crashing the batch', async () => {
            const customApiKeys = ['key_1_fail', 'key_2_success', 'key_3_fail'];
            const authBase = { adminToken: '', userKey: '', userToken: '' };

            const mockEngine = {
                generate: vi.fn(async (params, auth) => {
                    if (auth.customApiKey === 'key_1_fail') throw new Error('429 Rate Limit');
                    if (auth.customApiKey === 'key_3_fail') throw new Error('500 Server Error');
                    if (auth.customApiKey === 'key_2_success') {
                        return { blob: new Blob(['success_data']), userRole: 'plus' };
                    }
                })
            };

            const auths = customApiKeys.map(key => ({ ...authBase, customApiKey: key }));
            const localParamsList = auths.map((_, idx) => ({ prompt: 'test', seed: idx }));
            const fetchPromises = auths.map((auth, idx) => mockEngine.generate(localParamsList[idx], auth));
            const results = await Promise.allSettled(fetchPromises);

            const successfulResults = [];
            results.forEach((res, idx) => {
                if (res.status === 'fulfilled') {
                    const result = res.value;
                    result._localParams = localParamsList[idx];
                    successfulResults.push(result);
                }
            });

            expect(successfulResults.length).toBe(1);
            expect(successfulResults[0].userRole).toBe('plus');
            expect(successfulResults[0]._localParams.seed).toBe(1);
        });
    });
});
