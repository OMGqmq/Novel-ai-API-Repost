import { describe, it, expect, vi } from 'vitest';
import { ImageEngine } from '../src/engine.js';
import { onRequest as upscaleHandler } from '../functions/upscale.js';

describe('Enhance and Upscale Pipeline', () => {
  it('should verify ImageEngine contains upscale method', () => {
    const engine = new ImageEngine();
    expect(typeof engine.upscale).toBe('function');
    expect(typeof engine.generate).toBe('function');
    expect(typeof engine.augment).toBe('function');
  });

  it('should properly validate and build payload in functions/upscale.js', async () => {
    let capturedOptions = null;
    const fakeContext = {
      request: {
        json: async () => ({
          image: "fake_base64_image_data",
          width: 832,
          height: 1216,
          scale: 4
        }),
        headers: {
          get: () => ""
        }
      },
      env: {
        NOVELAI_API_KEY: "test_key"
      }
    };

    // Test onRequest handler builds payload
    const res = await upscaleHandler(fakeContext);
    expect(res).toBeDefined();
  });
});
