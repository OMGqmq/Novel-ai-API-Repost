import { describe, it, expect } from 'vitest';
import { createPayload } from '../functions/_payload-factory.js';

describe('PayloadFactory', () => {
  const baseData = {
    prompt: 'masterpiece, 1girl',
    negative_prompt: 'lowres',
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5.0,
    sampler: 'k_euler',
    seed: 12345
  };

  it('should create a valid V3 generation payload', () => {
    const payload = createPayload('v3', baseData);
    expect(payload.model).toBe('nai-diffusion-3');
    expect(payload.parameters.prompt).toBe(baseData.prompt);
    expect(payload.parameters.steps).toBe(28);
    expect(payload.parameters.sm).toBe(true); // V3 default
  });

  it('should create a valid V4.5 generation payload', () => {
    const payload = createPayload('v4.5', baseData);
    expect(payload.model).toBe('nai-diffusion-4-5-full');
    expect(payload.parameters.v4_prompt).toBeDefined();
    expect(payload.parameters.sm).toBe(false); // V4 default
  });

  it('should handle infill (inpainting) correctly for V4.5', () => {
    const infillData = { ...baseData, action: 'infill', mask: 'base64mask', image: 'base64img' };
    const payload = createPayload('v4.5', infillData);
    expect(payload.model).toBe('nai-diffusion-4-5-full-inpainting');
    expect(payload.action).toBe('infill');
    expect(payload.parameters.image).toBe('base64img');
    expect(payload.parameters.mask).toBe('base64mask');
  });
});
