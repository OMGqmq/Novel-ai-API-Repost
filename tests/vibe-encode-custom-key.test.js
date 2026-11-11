import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VibeManager } from '../src/vibe-manager.js';
import { onRequest as encodeVibeHandler } from '../functions/encode-vibe.js';

describe('V4.5 Vibe Transfer Custom API Direct Encoding', () => {
  let mockStore;
  let vibeManager;

  beforeEach(() => {
    mockStore = {
      getSetting: vi.fn(),
      setSetting: vi.fn()
    };
    vibeManager = new VibeManager({
      store: mockStore,
      compressImage: async (f) => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    });
  });

  describe('VibeManager isValidForModel & hasCustomKey checks', () => {
    it('should disallow raw image for V4.5 when hasCustomKey is false', () => {
      vibeManager.currentVibeImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      vibeManager.currentVibeIsJson = false;

      const resNoKey = vibeManager.isValidForModel('v4.5', false);
      expect(resNoKey.isValid).toBe(false);
      expect(resNoKey.error).toContain('自定义 API Key');
    });

    it('should allow raw image for V4.5 when hasCustomKey is true', () => {
      vibeManager.currentVibeImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      vibeManager.currentVibeIsJson = false;

      const resWithKey = vibeManager.isValidForModel('v4.5', true);
      expect(resWithKey.isValid).toBe(true);
    });

    it('should identify whether V4.5 raw image needs encoding', () => {
      vibeManager.currentVibeImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      vibeManager.currentVibeIsJson = false;

      expect(vibeManager.needsV45Encoding('v4.5')).toBe(true);
      expect(vibeManager.needsV45Encoding('v3')).toBe(false);

      // Once it is JSON, needsV45Encoding is false
      vibeManager.currentVibeIsJson = true;
      expect(vibeManager.needsV45Encoding('v4.5')).toBe(false);
    });

    it('ensureV45Encoded should call engine.encodeVibe and cache encoding', async () => {
      vibeManager.currentVibeImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      vibeManager.rawImageBase64 = vibeManager.currentVibeImageBase64;
      vibeManager.currentVibeIsJson = false;

      const mockEngine = {
        encodeVibe: vi.fn().mockResolvedValue({
          success: true,
          encoding: 'ENCODED_VIBE_BINARY_BASE64_TOKEN',
          info: 1.0,
          model: 'nai-diffusion-4-5-full'
        })
      };

      const auth = { customApiKey: 'pst-test-key' };
      await vibeManager.ensureV45Encoded(mockEngine, auth, 'v4.5');

      expect(mockEngine.encodeVibe).toHaveBeenCalledTimes(1);
      expect(vibeManager.currentVibeImageBase64).toBe('ENCODED_VIBE_BINARY_BASE64_TOKEN');
      expect(vibeManager.encodedVibeData.encoding).toBe('ENCODED_VIBE_BINARY_BASE64_TOKEN');

      // Subsequent call with same info & image should use cache and not re-call engine
      await vibeManager.ensureV45Encoded(mockEngine, auth, 'v4.5');
      expect(mockEngine.encodeVibe).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cloudflare function encode-vibe', () => {
    it('should reject non-POST requests with 405', async () => {
      const context = {
        request: new Request('http://localhost/encode-vibe', { method: 'GET' }),
        env: {}
      };
      const res = await encodeVibeHandler(context);
      expect(res.status).toBe(405);
    });

    it('should reject unauthenticated or non-custom/admin requests with 403', async () => {
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ count: 0 })
          })
        })
      };
      const context = {
        request: new Request('http://localhost/encode-vibe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: 'abc' })
        }),
        env: { NOVELAI_API_KEY: 'server-key', ADMIN_TOKEN: 'adm', DB: mockDb }
      };
      const res = await encodeVibeHandler(context);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('自定义 API Key');
    });

    it('should proxy encode-vibe when x-custom-api-key is present', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'application/binary' }
      }));
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      try {
        const context = {
          request: new Request('http://localhost/encode-vibe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-custom-api-key': 'pst-custom-key'
            },
            body: JSON.stringify({
              image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              model: 'nai-diffusion-4-5-full',
              information_extracted: 0.8
            })
          }),
          env: { NOVELAI_API_KEY: 'server-key' }
        };

        const res = await encodeVibeHandler(context);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.info).toBe(0.8);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://image.novelai.net/ai/encode-vibe',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer pst-custom-key'
            })
          })
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
