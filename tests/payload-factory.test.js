import { describe, it, expect } from 'vitest';
import { createPayload, createV3Payload, createV45Payload, createV5Payload } from '../functions/_payload-factory.js';

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
    expect(payload.parameters.noise_schedule).toBe('native');
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

  describe('V5 Payload (nai-diffusion-5-full)', () => {
    it('should create a valid V5 generation payload matching official schema', () => {
      const payload = createPayload('v5', {
        prompt: '1girl, cute',
        negative_prompt: 'bad quality',
        seed: 99999
      });

      expect(payload.model).toBe('nai-diffusion-5-full');
      expect(payload.action).toBe('generate');
      expect(payload.use_new_shared_trial).toBe(true);
      expect(payload.parameters.params_version).toBe(4);
      expect(payload.parameters.scale).toBe(1.9);
      expect(payload.parameters.sampler).toBe('k_euler_ancestral');
      expect(payload.parameters.ucPresetId).toBe('heavy');
      expect(payload.parameters.qualityPresetId).toBe('standard');
      expect(payload.parameters.noise_schedule).toBe('karras');
      expect(payload.parameters.straight_alpha).toBe(true);
      expect(payload.parameters.image_format).toBe('webp');
      expect(payload.parameters.stream).toBe('msgpack');
      expect(payload.parameters.tag_hint_qt).toBe(1);
      expect(payload.parameters.tag_hint_uc_preset).toBe(2);
      expect(payload.parameters.v4_prompt.caption.base_caption).toBe('1girl, cute');
      expect(payload.parameters.v4_negative_prompt.caption.base_caption).toBe('bad quality');
    });

    it('should support aliases for v5 like "nai5" and "v5.0"', () => {
      const p1 = createPayload('nai5', { prompt: 'test' });
      const p2 = createPayload('v5.0', { prompt: 'test' });
      expect(p1.model).toBe('nai-diffusion-5-full');
      expect(p2.model).toBe('nai-diffusion-5-full');
    });

    it('should handle V5 character captions, characterPrompts array and single-character custom coordinates', () => {
      const payload = createV5Payload({
        prompt: 'scenery, 2girls',
        negative_prompt: 'ugly',
        v4_prompt_use_coords: true,
        char_captions: [
          { prompt: 'girl with blue hair', negative_prompt: 'bad eyes', x: 0.25, y: 0.5 },
          { prompt: 'girl with red hair', negative_prompt: 'extra hands', x: 0.75, y: 0.5 }
        ]
      });

      expect(payload.parameters.params_version).toBe(4);
      expect(payload.parameters.use_coords).toBe(true);
      expect(payload.parameters.v4_prompt.use_coords).toBe(true);
      expect(payload.parameters.v4_prompt.use_order).toBe(true);
      
      // char_captions in v4_prompt
      expect(payload.parameters.v4_prompt.caption.char_captions.length).toBe(2);
      expect(payload.parameters.v4_prompt.caption.char_captions[0].char_caption).toBe('girl with blue hair');
      expect(payload.parameters.v4_prompt.caption.char_captions[0].centers[0].x).toBe(0.25);
      expect(payload.parameters.v4_negative_prompt.caption.char_captions[1].char_caption).toBe('extra hands');

      // characterPrompts in parameters
      expect(payload.parameters.characterPrompts.length).toBe(2);
      expect(payload.parameters.characterPrompts[0].prompt).toBe('girl with blue hair');
      expect(payload.parameters.characterPrompts[0].uc).toBe('bad eyes');
      expect(payload.parameters.characterPrompts[0].center).toEqual({ x: 0.25, y: 0.5 });
      expect(payload.parameters.characterPrompts[0].enabled).toBe(true);
    });

    it('should handle V5 inpainting (infill) correctly', () => {
      const payload = createV5Payload({
        prompt: '1girl, repair',
        action: 'infill',
        image: 'base64source',
        mask: 'base64mask',
        strength: 0.85
      });

      expect(payload.model).toBe('nai-diffusion-5-full-inpainting');
      expect(payload.action).toBe('infill');
      expect(payload.parameters.image).toBe('base64source');
      expect(payload.parameters.mask).toBe('base64mask');
      expect(payload.parameters.inpaintImg2ImgStrength).toBe(0.85);
    });

    it('V5 should NOT attach director reference or vibe transfer', () => {
      const payload = createV5Payload({
        prompt: 'character test',
        vibe_image: 'base64vibe',
        vibe_info: 0.8,
        vibe_strength: 0.6,
        director_reference_images: ['base64director'],
        director_reference_descriptions: [{ caption: { base_caption: 'character' } }]
      });

      expect(payload.parameters.reference_image_multiple).toBeUndefined();
      expect(payload.parameters.director_reference_images).toBeUndefined();
    });
  });

  describe('Decoupled Builders Isolation', () => {
    it('calling createV3Payload, createV45Payload, and createV5Payload independently should not cross-pollinate', () => {
      const data = { prompt: 'isolated', steps: 20 };
      const v3 = createV3Payload(data);
      const v45 = createV45Payload(data);
      const v5 = createV5Payload(data);

      expect(v3.model).toBe('nai-diffusion-3');
      expect(v3.parameters.params_version).toBe(1);
      expect(v3.parameters.noise_schedule).toBe('native');
      expect(v3.parameters.sm).toBe(true);

      expect(v45.model).toBe('nai-diffusion-4-5-full');
      expect(v45.parameters.params_version).toBe(3);
      expect(v45.parameters.noise_schedule).toBe('exponential');
      expect(v45.parameters.sm).toBe(false);

      expect(v5.model).toBe('nai-diffusion-5-full');
      expect(v5.parameters.params_version).toBe(4);
      expect(v5.parameters.noise_schedule).toBe('karras');
      expect(v5.parameters.ucPresetId).toBe('heavy');
      expect(v5.parameters.qualityPresetId).toBe('standard');
    });
  });
});

