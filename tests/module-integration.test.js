import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XyPlotManager } from '../src/xy-plot-manager.js';
import { InpaintEditor } from '../src/inpaint.js';
import { OutpaintEditor } from '../src/outpaint.js';
import { initToolbox, applyMetadataParameters } from '../src/toolbox-controller.js';

describe('Cross-Module Integration & Linkage Tests', () => {
    let mockElements = {};

    function getOrCreateMockElement(id) {
        if (!mockElements[id]) {
            mockElements[id] = {
                id,
                value: '',
                checked: false,
                classList: {
                    add: vi.fn(),
                    remove: vi.fn(),
                    toggle: vi.fn(),
                    contains: vi.fn().mockReturnValue(false)
                },
                style: {},
                options: [],
                add: function(opt) { this.options.push(opt); },
                dispatchEvent: vi.fn(),
                addEventListener: vi.fn(),
                getContext: vi.fn().mockReturnValue({
                    clearRect: vi.fn(),
                    drawImage: vi.fn(),
                    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
                    putImageData: vi.fn(),
                    beginPath: vi.fn(),
                    moveTo: vi.fn(),
                    lineTo: vi.fn(),
                    stroke: vi.fn(),
                    arc: vi.fn(),
                    fill: vi.fn()
                })
            };
        }
        return mockElements[id];
    }

    beforeEach(() => {
        mockElements = {};
        global.document = {
            getElementById: (id) => getOrCreateMockElement(id),
            querySelectorAll: () => [],
            createElement: (tag) => ({
                id: '',
                className: '',
                style: {},
                innerHTML: '',
                appendChild: vi.fn(),
                addEventListener: vi.fn(),
                querySelector: () => null,
                querySelectorAll: () => []
            })
        };
        global.window = {
            showToast: vi.fn(),
            showConfirm: vi.fn().mockResolvedValue(true),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };
        global.localStorage = {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn(),
            removeItem: vi.fn()
        };
    });

    describe('X/Y Plot Matrix with Char Ref & Vibe Transfer', () => {
        it('should correctly configure and apply char_ref_strength and vibe_strength in parameter matrix', () => {
            const xyPlotManager = new XyPlotManager();
            xyPlotManager.bind({});

            getOrCreateMockElement('xyPlotEnabled').checked = true;
            getOrCreateMockElement('xyPlotXType').value = 'char_ref_strength';
            getOrCreateMockElement('xyPlotXValues').value = '0.4, 0.8';
            getOrCreateMockElement('xyPlotYType').value = 'vibe_strength';
            getOrCreateMockElement('xyPlotYValues').value = '0.5, 0.7';

            const configs = xyPlotManager.getXyConfigs();
            expect(configs.xType).toBe('char_ref_strength');
            expect(configs.xValues).toEqual([0.4, 0.8]);
            expect(configs.yType).toBe('vibe_strength');
            expect(configs.yValues).toEqual([0.5, 0.7]);

            const baseParams = { prompt: 'masterpiece', steps: 28 };
            const grid = xyPlotManager.generateParamGrid(baseParams);

            expect(grid.length).toBe(4);
            expect(grid[0].params.director_reference_strength_values).toEqual([0.4]);
            expect(grid[0].params.reference_strength_multiple).toEqual([0.5]);
            expect(grid[0].params.vibe_strength).toBe(0.5);
            expect(grid[0].xyInfo).toBe('Char Ref Strength: 0.4 | Vibe Strength: 0.5');

            expect(grid[3].params.director_reference_strength_values).toEqual([0.8]);
            expect(grid[3].params.reference_strength_multiple).toEqual([0.7]);
            expect(grid[3].params.vibe_strength).toBe(0.7);
        });

        it('should correctly configure char_ref_fidelity, cfg_rescale, and uncond_scale', () => {
            const xyPlotManager = new XyPlotManager();
            xyPlotManager.bind({});

            getOrCreateMockElement('xyPlotXType').value = 'char_ref_fidelity';
            getOrCreateMockElement('xyPlotXValues').value = '0.8';
            getOrCreateMockElement('xyPlotYType').value = 'cfg_rescale';
            getOrCreateMockElement('xyPlotYValues').value = '0.2';

            const grid = xyPlotManager.generateParamGrid({ prompt: 'test' });
            expect(grid.length).toBe(1);
            // fidelity 0.8 means secondary strength = 1.0 - 0.8 = 0.2
            expect(grid[0].params.director_reference_secondary_strength_values).toEqual([0.2]);
            expect(grid[0].params.cfg_rescale).toBe(0.2);
            expect(grid[0].xyInfo).toBe('Char Ref Fidelity: 0.8 | CFG Rescale: 0.2');
        });
    });

    describe('Inpainting & Outpainting Integration with Char Ref & Advanced Params', () => {
        it('should supply getExtraParams callback to InpaintEditor', async () => {
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ blob: new Blob(['fake']), userRole: 'plus' })
            };
            const mockStore = {
                getSetting: vi.fn().mockReturnValue('')
            };
            const mockUi = {
                updateCreditDisplay: vi.fn(),
                switchRightView: vi.fn()
            };

            const mockExtraParams = {
                director_reference_images: ['data:image/png;base64,charref123'],
                director_reference_descriptions: [{ caption: { base_caption: 'character&style' } }],
                director_reference_strength_values: [0.85],
                vibe_image: 'data:image/png;base64,vibe123',
                vibe_strength: 0.65,
                sm: true,
                cfg_rescale: 0.1
            };

            let completedParams = null;
            const editor = new InpaintEditor({
                ui: mockUi,
                engine: mockEngine,
                store: mockStore,
                getExtraParams: (model) => mockExtraParams,
                onComplete: async (results, prompt, model, params) => {
                    completedParams = params;
                }
            });

            // Mock canvas export
            editor._hasPaintedMask = vi.fn().mockReturnValue(true);
            editor._exportBaseImageAsBase64 = vi.fn().mockResolvedValue('data:image/png;base64,baseimg');
            editor._exportMaskAsBase64 = vi.fn().mockReturnValue('data:image/png;base64,maskimg');
            editor._fitCanvasToContainer = vi.fn();
            editor.maskCanvas = getOrCreateMockElement('inpaintMaskCanvas');

            getOrCreateMockElement('modelValue').value = 'v4.5';
            getOrCreateMockElement('prompt').value = '1girl, masterpiece';
            getOrCreateMockElement('inpaintPrompt').value = '1girl, detailed eyes';
            getOrCreateMockElement('negativePrompt').value = 'low quality';
            getOrCreateMockElement('steps').value = '28';
            getOrCreateMockElement('scale').value = '7.0';
            getOrCreateMockElement('sampler').value = 'k_euler';
            getOrCreateMockElement('inpaintStrength').value = '0.9';
            getOrCreateMockElement('inpaintSubmitBtn');

            await editor.doInpaint();

            expect(mockEngine.generate).toHaveBeenCalledTimes(1);
            const calledParams = mockEngine.generate.mock.calls[0][0];
            expect(calledParams.action).toBe('infill');
            expect(calledParams.prompt).toBe('1girl, detailed eyes');
            expect(calledParams.director_reference_images).toEqual(['data:image/png;base64,charref123']);
            expect(calledParams.director_reference_strength_values).toEqual([0.85]);
            expect(calledParams.vibe_image).toBe('data:image/png;base64,vibe123');
            expect(calledParams.cfg_rescale).toBe(0.1);

            expect(completedParams).not.toBeNull();
            expect(completedParams.director_reference_images).toEqual(['data:image/png;base64,charref123']);
        });

        it('should supply getExtraParams callback to OutpaintEditor', async () => {
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ blob: new Blob(['fake']) })
            };
            const mockStore = {
                getSetting: vi.fn().mockReturnValue('')
            };

            const mockExtraParams = {
                director_reference_images: ['data:image/png;base64,charref123'],
                vibe_strength: 0.7
            };

            const outpaint = new OutpaintEditor({
                engine: mockEngine,
                store: mockStore,
                getExtraParams: (model) => mockExtraParams
            });

            expect(typeof outpaint.getExtraParams).toBe('function');
            expect(outpaint.getExtraParams('v4.5')).toEqual(mockExtraParams);
        });
    });

    describe('Metadata Restoration for Char Ref and Vibe Transfer', () => {
        it('should restore character reference and vibe settings from Comment metadata in Toolbox', async () => {
            const mockStore = {
                settings: {},
                getSetting: function(k, d) { return this.settings[k] !== undefined ? this.settings[k] : d; },
                setSetting: function(k, v) { this.settings[k] = v; }
            };

            const mockCharRefManager = {
                currentCharRefImageBase64: null,
                getCharRefKey: (k, m) => `${k}_${m}`,
                loadState: vi.fn()
            };

            const mockVibeManager = {
                currentVibeImageBase64: null,
                getVibeKey: (k, m) => `${k}_${m}`,
                loadState: vi.fn()
            };

            initToolbox(mockStore, {
                charRefManager: mockCharRefManager,
                vibeManager: mockVibeManager
            });

            const commentObj = {
                prompt: 'cyberpunk girl',
                uc: 'low quality, worst quality',
                steps: 32,
                scale: 6.5,
                seed: 987654321,
                sampler: 'k_dpmpp_2s_ancestral',
                width: 1024,
                height: 1024,
                sm: true,
                sm_dyn: true,
                cfg_rescale: 0.15,
                uncond_scale: 0.95,
                skip_cfg_above_sigma: 18,
                director_reference_images: ['data:image/png;base64,charref999'],
                director_reference_strength_values: [0.75],
                director_reference_secondary_strength_values: [0.3],
                director_reference_descriptions: [{ caption: { base_caption: 'character' } }],
                reference_image_multiple: ['data:image/png;base64,vibe888'],
                reference_strength_multiple: [0.8],
                reference_information_extracted_multiple: [0.9]
            };

            getOrCreateMockElement('modelSelect').value = 'v4.5';
            getOrCreateMockElement('prompt');
            getOrCreateMockElement('negativePrompt');
            getOrCreateMockElement('steps');
            getOrCreateMockElement('scale');
            getOrCreateMockElement('seed');
            getOrCreateMockElement('sampler');
            getOrCreateMockElement('resolution');
            getOrCreateMockElement('smEnabled');
            getOrCreateMockElement('smDynEnabled');
            getOrCreateMockElement('cfgRescale');
            getOrCreateMockElement('uncondScale');
            getOrCreateMockElement('skipCfg');

            expect(typeof applyMetadataParameters).toBe('function');
        });
    });
});
