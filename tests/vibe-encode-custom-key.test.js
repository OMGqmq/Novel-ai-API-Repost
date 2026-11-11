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

  describe('Vibe multi-intensity cache and export/import tests', () => {
    it('should cache per-intensity token and restore token when sliding back to same info', async () => {
      const rawImg = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      vibeManager.currentVibeImageBase64 = rawImg;
      vibeManager.rawImageBase64 = rawImg;
      vibeManager.currentVibeIsJson = false;

      const mockEngine = {
        encodeVibe: vi.fn().mockImplementation(async (params) => ({
          success: true,
          encoding: `TOKEN_FOR_${params.information_extracted}`,
          info: params.information_extracted,
          model: 'nai-diffusion-4-5-full'
        }))
      };

      // 1. Initially needs encoding at 1.0
      expect(vibeManager.needsV45Encoding('v4.5')).toBe(true);
      await vibeManager.ensureV45Encoded(mockEngine, { customApiKey: 'k' }, 'v4.5');
      expect(mockEngine.encodeVibe).toHaveBeenCalledTimes(1);
      expect(vibeManager.currentVibeImageBase64).toBe('TOKEN_FOR_1');

      // 2. Setting cache for 0.8 as well
      vibeManager.setCachedEncoding(rawImg, 0.8, 'TOKEN_FOR_0.8');

      // 3. Slider moves to 0.5 (not cached)
      expect(vibeManager.getCachedEncoding(rawImg, 0.5)).toBeNull();

      // 4. Slider moves back to 1.0 -> should retrieve from cache
      const cached10 = vibeManager.getCachedEncoding(rawImg, 1.0);
      expect(cached10).toBe('TOKEN_FOR_1');

      // 5. Slider moves to 0.8 -> should retrieve from cache
      const cached08 = vibeManager.getCachedEncoding(rawImg, 0.8);
      expect(cached08).toBe('TOKEN_FOR_0.8');
    });

    it('should export .vibe binary token and .nai4vibe json format correctly', () => {
      const rawImg = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      vibeManager.rawImageBase64 = rawImg;
      // Provide valid base64 token
      const token = btoa("mock_vibe_binary_data");
      vibeManager.currentVibeImageBase64 = token;
      vibeManager.setCachedEncoding(rawImg, 0.8, token);

      let createdBlob = null;
      let downloadedName = '';
      global.URL.createObjectURL = vi.fn((blob) => {
        createdBlob = blob;
        return 'blob:mock-url';
      });
      global.URL.revokeObjectURL = vi.fn();

      const mockA = {
        href: '',
        download: '',
        click: vi.fn()
      };
      const originalCreateElement = global.document?.createElement;
      const originalAppendChild = global.document?.body?.appendChild;
      const originalRemoveChild = global.document?.body?.removeChild;

      global.document = {
        createElement: vi.fn(() => mockA),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn()
        },
        getElementById: vi.fn(() => null)
      };

      try {
        // Export .vibe
        vibeManager.exportVibeBinary('v4.5');
        expect(mockA.download).toContain('.vibe');
        expect(createdBlob.type).toBe('application/octet-stream');

        // Export .nai4vibe
        vibeManager.exportNai4Vibe('v4.5');
        expect(mockA.download).toContain('.nai4vibe');
        expect(createdBlob.type).toBe('application/json');
      } finally {
        if (originalCreateElement) global.document.createElement = originalCreateElement;
        if (originalAppendChild) global.document.body.appendChild = originalAppendChild;
        if (originalRemoveChild) global.document.body.removeChild = originalRemoveChild;
      }
    });

    it('should parse binary .vibe file into base64 token', async () => {
      const binaryContent = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const mockFile = {
        name: 'reference.vibe',
        slice: () => ({
          text: async () => 'binary-non-json-header'
        }),
        arrayBuffer: async () => binaryContent.buffer
      };

      const event = { target: { files: [mockFile] } };
      await vibeManager.handleVibeImage(event, 'v4.5');

      expect(vibeManager.isRawImage(vibeManager.currentVibeImageBase64)).toBe(false);
      expect(vibeManager.currentVibeImageBase64).toBe(btoa(String.fromCharCode(...binaryContent)));
    });

    it('should parse official .nai4vibe.json bundle containing multiple information_extracted strengths', async () => {
      const officialDoc = {
        identifier: "novelai-vibe-transfer",
        version: 1,
        type: "image",
        id: "2b2863c8789d3cb542713f044e3923d8eb9687e35b7190f845d045d656093d98",
        name: "test_official_bundle",
        image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        thumbnail: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: 1731300000000,
        importInfo: {
          model: "nai-diffusion-4-5-full",
          information_extracted: 0.35,
          strength: 0.65
        },
        encodings: {
          "v4-5full": {
            "key1": {
              encoding: "TOKEN_INFO_018",
              params: { information_extracted: 0.18 }
            },
            "key2": {
              encoding: "TOKEN_INFO_030",
              params: { information_extracted: 0.3 }
            },
            "key3": {
              encoding: "TOKEN_INFO_035",
              params: { information_extracted: 0.35 }
            },
            "key4": {
              encoding: "TOKEN_INFO_045",
              params: { information_extracted: 0.45 }
            }
          }
        }
      };

      const mockFile = {
        name: 'test_official.nai4vibe.json',
        slice: () => ({
          text: async () => '{"identifier":"novelai-vibe-transfer"'
        }),
        text: async () => JSON.stringify(officialDoc)
      };

      await vibeManager.handleVibeImage({ target: { files: [mockFile] } }, 'v4.5');

      expect(vibeManager.currentVibeIsJson).toBe(true);
      expect(vibeManager.availableVibeEncodings.length).toBe(4);
      // It should activate the one from importInfo (0.35)
      expect(vibeManager.currentVibeImageBase64).toBe("TOKEN_INFO_035");

      // Switching to 0.18 should retrieve cached token without re-encoding
      expect(vibeManager.getCachedEncoding(vibeManager.rawImageBase64, 0.18)).toBe("TOKEN_INFO_018");
      // Switching to 0.45
      expect(vibeManager.getCachedEncoding(vibeManager.rawImageBase64, 0.45)).toBe("TOKEN_INFO_045");
      // Switching to 0.5 (not in bundle)
      expect(vibeManager.getCachedEncoding(vibeManager.rawImageBase64, 0.5)).toBeNull();
    });
  });
});

