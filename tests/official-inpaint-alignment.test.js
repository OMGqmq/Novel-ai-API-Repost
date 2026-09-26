import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPayload, createV3Payload, createV45Payload, createV5Payload } from '../functions/_payload-factory.js';
import { InpaintEditor } from '../src/inpaint.js';

describe('Official NovelAI Inpainting Alignment Test Suite', () => {
    describe('1. Payload Factory Infill Schema', () => {
        const baseInfillData = {
            action: 'infill',
            prompt: 'masterpiece, solo, 1girl',
            image: 'base64_original_image',
            mask: 'base64_mask_image',
            width: 832,
            height: 1216,
            steps: 28,
            strength: 0.7
        };

        it('should align V3 inpainting with official NAI specs', () => {
            const payload = createV3Payload({ ...baseInfillData, sampler: 'ddim' });
            expect(payload.model).toBe('nai-diffusion-3-inpainting');
            expect(payload.action).toBe('infill');
            expect(payload.parameters.sampler).toBe('k_euler_ancestral'); // DDIM fallback
            expect(payload.parameters.add_original_image).toBe(false);
            expect(payload.parameters.sm).toBe(false);
            expect(payload.parameters.sm_dyn).toBe(false);
            expect(payload.parameters.img2img).toBeUndefined(); // V3 does not support img2img in infill
        });

        it('should align V4.5 inpainting with official NAI specs (img2img strength < 1.0)', () => {
            const payload = createV45Payload({ ...baseInfillData, sampler: 'ddim_v3', strength: 0.65 });
            expect(payload.model).toBe('nai-diffusion-4-5-full-inpainting');
            expect(payload.action).toBe('infill');
            expect(payload.parameters.sampler).toBe('k_euler_ancestral'); // DDIM fallback
            expect(payload.parameters.add_original_image).toBe(false);
            expect(payload.parameters.img2img).toEqual({
                strength: 0.65,
                color_correct: true
            });
        });

        it('should align V5 inpainting with official NAI specs (noise_schedule: karras, img2img)', () => {
            const payload = createV5Payload({ ...baseInfillData, strength: 0.8 });
            expect(payload.model).toBe('nai-diffusion-5-full-inpainting');
            expect(payload.action).toBe('infill');
            expect(payload.parameters.noise_schedule).toBe('karras');
            expect(payload.parameters.add_original_image).toBe(false);
            expect(payload.parameters.img2img).toEqual({
                strength: 0.8,
                color_correct: true
            });
        });

        it('should delete img2img when strength is 1.0 for V4.5 and V5', () => {
            const p45 = createV45Payload({ ...baseInfillData, strength: 1.0 });
            const p5 = createV5Payload({ ...baseInfillData, strength: 1.0 });
            expect(p45.parameters.img2img).toBeUndefined();
            expect(p5.parameters.img2img).toBeUndefined();
        });
    });

    describe('2. InpaintEditor Mask Export & Seamless Blending', () => {
        let mockElements = {};
        function getMockEl(id) {
            if (!mockElements[id]) {
                const ctx = {
                    clearRect: vi.fn(),
                    drawImage: vi.fn(),
                    getImageData: vi.fn((x, y, w, h) => {
                        const data = new Uint8ClampedArray(w * h * 4);
                        // Put some mock pixels with alpha > 155
                        data[3] = 200;
                        return { width: w, height: h, data };
                    }),
                    putImageData: vi.fn(),
                    fillRect: vi.fn(),
                    save: vi.fn(),
                    restore: vi.fn()
                };
                mockElements[id] = {
                    id,
                    width: 512,
                    height: 512,
                    getContext: vi.fn(() => ctx),
                    toDataURL: vi.fn(() => 'data:image/png;base64,mockBinarizedBase64'),
                    toBlob: vi.fn((cb) => cb(new Blob(['mock_blob'], { type: 'image/png' }))),
                    addEventListener: vi.fn(),
                    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                    style: {}
                };
            }
            return mockElements[id];
        }

        let editor;
        beforeEach(() => {
            mockElements = {};
            global.document = {
                getElementById: (id) => getMockEl(id),
                createElement: (tag) => getMockEl(`created_${tag}_${Math.random()}`)
            };
            global.window = { safeCreateIcons: vi.fn() };
            global.URL = {
                createObjectURL: vi.fn(() => 'blob:mock-url')
            };
            global.Image = class {
                constructor() {
                    setTimeout(() => { if (this.onload) this.onload(); }, 0);
                }
            };

            editor = new InpaintEditor({
                ui: { updateCreditDisplay: vi.fn() },
                engine: { generate: vi.fn() },
                store: { getSetting: vi.fn(() => '') }
            });
            editor.originalImgSrc = 'blob:original-img';
        });

        it('should export 1/8 binarized mask matching official NAI logic', () => {
            const b64 = editor._exportMaskAsBase64(832, 1216, true);
            expect(b64).toBe('mockBinarizedBase64');
        });

        it('should blend inpaint result seamlessly with feather mask', async () => {
            const mockBlob = new Blob(['mock_infilled'], { type: 'image/png' });
            const blended = await editor._featherBlendResult(mockBlob, 832, 1216);
            expect(blended).toBeDefined();
            expect(blended.imageUrl).toBe('blob:mock-url');
        });
    });
});
