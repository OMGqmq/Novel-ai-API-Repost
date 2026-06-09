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

  it('should create a valid V4.5 official generation payload', () => {
    const payload = createPayload('v4.5', baseData); // v4_5_experimental is falsy by default
    expect(payload.model).toBe('nai-diffusion-4-5-full');
    expect(payload.parameters.v4_prompt.use_coords).toBe(true);
    expect(payload.parameters.v4_negative_prompt.use_order).toBe(false);
    expect(payload.parameters.skip_cfg_above_sigma).toBe(null);
    expect(payload.parameters.deliberate_euler_ancestral_bug).toBe(false);
    expect(payload.parameters.prefer_brownian).toBe(true);
  });

  it('should create a valid V4.5 experimental generation payload', () => {
    const payload = createPayload('v4.5', { ...baseData, v4_5_experimental: true });
    expect(payload.model).toBe('nai-diffusion-4-5-full');
    expect(payload.parameters.v4_prompt.use_coords).toBe(false);
    expect(payload.parameters.v4_negative_prompt.use_order).toBe(true);
    expect(payload.parameters.skip_cfg_above_sigma).toBe(0.0);
    expect(payload.parameters.deliberate_euler_ancestral_bug).toBe(true);
    expect(payload.parameters.prefer_brownian).toBe(false);
  });

  it('should create a valid V4.5 customized generation payload', () => {
    const customData = {
      ...baseData,
      v4_prompt_use_coords: false,
      v4_prompt_use_order: false,
      v4_neg_use_order: true,
      deliberate_euler_ancestral_bug: true,
      prefer_brownian: true,
      skip_cfg_above_sigma: 12
    };
    const payload = createPayload('v4.5', customData);
    expect(payload.model).toBe('nai-diffusion-4-5-full');
    expect(payload.parameters.v4_prompt.use_coords).toBe(false);
    expect(payload.parameters.v4_prompt.use_order).toBe(false);
    expect(payload.parameters.v4_negative_prompt.use_order).toBe(true);
    expect(payload.parameters.skip_cfg_above_sigma).toBe(12);
    expect(payload.parameters.deliberate_euler_ancestral_bug).toBe(true);
    expect(payload.parameters.prefer_brownian).toBe(true);
  });

  it('should create a valid V4.5 generation payload with multiple character prompts and coordinates', () => {
    const charData = {
      ...baseData,
      v4_prompt_use_coords: true,
      char_captions: [
        { prompt: "boy, luo xiaohei", negative_prompt: "", x: 0.3, y: 0.5 },
        { prompt: "girl, nahida (genshin impact)", negative_prompt: "bad face", x: 0.7, y: 0.5 }
      ]
    };
    const payload = createPayload('v4.5', charData);
    expect(payload.model).toBe('nai-diffusion-4-5-full');
    
    // 正向
    expect(payload.parameters.v4_prompt.caption.char_captions.length).toBe(2);
    expect(payload.parameters.v4_prompt.caption.char_captions[0].char_caption).toBe("boy, luo xiaohei");
    expect(payload.parameters.v4_prompt.caption.char_captions[0].centers[0].x).toBe(0.3);
    expect(payload.parameters.v4_prompt.caption.char_captions[0].centers[0].y).toBe(0.5);
    
    // 负向
    expect(payload.parameters.v4_negative_prompt.caption.char_captions.length).toBe(2);
    expect(payload.parameters.v4_negative_prompt.caption.char_captions[0].char_caption).toBe("");
    expect(payload.parameters.v4_negative_prompt.caption.char_captions[1].char_caption).toBe("bad face");
    expect(payload.parameters.v4_negative_prompt.caption.char_captions[1].centers[0].x).toBe(0.7);
    expect(payload.parameters.v4_negative_prompt.caption.char_captions[1].centers[0].y).toBe(0.5);
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
