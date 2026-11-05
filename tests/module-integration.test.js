import { describe, it, expect, vi, beforeEach } from 'vitest';
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
