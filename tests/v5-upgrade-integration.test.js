import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPayload, createV3Payload, createV45Payload, createV5Payload } from '../functions/_payload-factory.js';
import { onRequest as verifyKeyHandler } from '../functions/verify-key.js';
import { onRequest as generateHandler } from '../functions/generate.js';
import { CharRefManager } from '../src/char-ref-manager.js';
import { VibeManager } from '../src/vibe-manager.js';
import { NotebookManager } from '../src/notebook.js';
import { UI } from '../src/ui.js';

describe('NovelAI V5 Full Upgrade & Integration Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Decoupled Payload Builders', () => {
    it('should generate independent V3, V4.5, and V5 payloads without shared mutation', () => {
      const data = { prompt: '1girl', negative_prompt: 'bad quality', steps: 28, scale: 5.0 };
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
      expect(v5.parameters.scale).toBe(5.0);
      expect(v5.parameters.ucPresetId).toBe('heavy');
      expect(v5.parameters.qualityPresetId).toBe('standard');
      expect(v5.parameters.straight_alpha).toBe(true);
      expect(v5.parameters.image_format).toBe('webp');
      expect(v5.parameters.stream).toBe('msgpack');
    });

    it('should route version strings appropriately in createPayload dispatcher', () => {
      expect(createPayload('v5', { prompt: 'a' }).model).toBe('nai-diffusion-5-full');
      expect(createPayload('NAI5', { prompt: 'a' }).model).toBe('nai-diffusion-5-full');
      expect(createPayload('v5.0', { prompt: 'a' }).model).toBe('nai-diffusion-5-full');
      expect(createPayload('v4.5', { prompt: 'a' }).model).toBe('nai-diffusion-4-5-full');
      expect(createPayload('v3', { prompt: 'a' }).model).toBe('nai-diffusion-3');
    });
  });

  describe('2. Opus Quota Reporting in verify-key.js', () => {
    it('should extract opusUsage metrics when tier is Opus (Tier 3)', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/user/data')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              subscription: {
                tier: 3,
                active: true,
                expiresAt: 1789418938,
                trainingStepsLeft: { fixedTrainingStepsLeft: 8553, purchasedTrainingSteps: 0 },
                usage: {
                  percent: 58,
                  isNegative: false,
                  timeUntilNextPercent: 7888
                }
              },
              information: {
                email: 'test@example.com',
                emailVerified: true,
                accountCreatedAt: 1786739760
              }
            })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const context = {
        request: {
          method: 'POST',
          json: async () => ({ apiKey: 'pst-testkey123' })
        }
      };

      const response = await verifyKeyHandler(context);
      expect(response.status).toBe(200);
      const resData = await response.json();

      expect(resData.valid).toBe(true);
      expect(resData.tierName).toBe('Opus');
      expect(resData.opusUsage).toBeDefined();
      expect(resData.opusUsage.percent).toBe(58);
      expect(resData.opusUsage.estimatedImages).toBe(1003); // Math.round(17.3 * 58) = 1003
      expect(resData.opusUsage.timeUntilNextPercent).toBe(7888);
      expect(resData.opusUsage.refillRatePerDay).toBe(11); // Math.round(86400/7888 * 10)/10 = 11.0
      expect(resData.opusUsage.isNegative).toBe(false);
    });

    it('should return null for opusUsage if tier is lower than Opus', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/user/data')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              subscription: {
                tier: 1, // Tablet
                active: true,
                expiresAt: 1789418938,
                trainingStepsLeft: 1000
              },
              information: {
                email: 'tablet@example.com'
              }
            })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const context = {
        request: {
          method: 'POST',
          json: async () => ({ apiKey: 'pst-tabletkey' })
        }
      };

      const response = await verifyKeyHandler(context);
      expect(response.status).toBe(200);
      const resData = await response.json();

      expect(resData.tierName).toBe('Tablet');
      expect(resData.opusUsage).toBeNull();
    });
  });

  describe('3. Generate Handler V5 Proxy Integration', () => {
    it('should generate a valid V5 request payload when version is v5', async () => {
      let interceptedPayload = null;
      global.fetch = vi.fn().mockImplementation((url, opts) => {
        if (url.includes('/ai/generate-image')) {
          interceptedPayload = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'Content-Type': 'application/zip' }),
            body: 'binary-image-zip'
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = {
        request: {
          method: 'POST',
          headers: {
            get: (k) => k.toLowerCase() === 'authorization' ? 'Bearer pst-test' : 'application/json'
          },
          json: async () => ({
            prompt: 'masterpiece, 1girl',
            negative_prompt: 'bad quality',
            version: 'v5',
            width: 832,
            height: 1216,
            steps: 28,
            scale: 1.9,
            sampler: 'k_euler_ancestral'
          })
        },
        env: {
          NOVELAI_API_KEY: 'test-env-key'
        },
        waitUntil: vi.fn()
      };

      const res = await generateHandler(context);
      expect(res.status).toBe(200);
      expect(interceptedPayload).toBeDefined();
      expect(interceptedPayload.model).toBe('nai-diffusion-5-full');
      expect(interceptedPayload.parameters.params_version).toBe(4);
      expect(interceptedPayload.parameters.noise_schedule).toBe('karras');
      expect(interceptedPayload.parameters.straight_alpha).toBe(true);
      expect(interceptedPayload.parameters.scale).toBe(1.9);
    });
  });

  describe('4. Frontend Model Management (CharRef, Vibe, Notebook)', () => {
    beforeEach(() => {
      global.window = global.window || {};
      const storage = {};
      global.localStorage = {
        getItem: vi.fn((k) => storage[k] || null),
        setItem: vi.fn((k, v) => { storage[k] = String(v); }),
        removeItem: vi.fn((k) => { delete storage[k]; }),
        clear: vi.fn(() => { for (const k in storage) delete storage[k]; })
      };
      global.window.localStorage = global.localStorage;
      
      const elements = {};
      global.document = {
        getElementById: vi.fn((id) => {
          if (!elements[id]) {
            elements[id] = {
              id,
              value: '',
              checked: false,
              classList: {
                add: vi.fn(),
                remove: vi.fn(),
                contains: vi.fn()
              }
            };
          }
          return elements[id];
        }),
        createElement: vi.fn((tag) => ({
          tagName: tag.toUpperCase(),
          textContent: '',
          innerHTML: '',
          classList: { add: vi.fn(), remove: vi.fn() }
        })),
        querySelectorAll: vi.fn(() => [])
      };
    });

    it('CharRefManager should support V5 model for state keys and payload generation', () => {
      const mockStore = {
        getSetting: vi.fn((key) => {
          if (key === 'nai_char_ref_enabled_v4') return 'true';
          if (key === 'nai_char_ref_strength_v4') return '0.9';
          return null;
        })
      };

      const manager = new CharRefManager({ store: mockStore });
      expect(manager.getCharRefKey('test_key', 'v5')).toBe('test_key_v4');
      expect(manager.getCharRefKey('test_key', 'v4.5')).toBe('test_key_v4');
      expect(manager.getCharRefKey('test_key', 'v3')).toBe('test_key');

      // Validation test
      manager.currentCharRefImageBase64 = 'data:image/png;base64,xxxx';
      global.document.getElementById('charRefEnabled').checked = true;

      const v5Valid = manager.isValidForModel('v5', true);
      expect(v5Valid.isValid).toBe(true);

      const v3Valid = manager.isValidForModel('v3', true);
      expect(v3Valid.isValid).toBe(false);
    });

    it('VibeManager should support V5 model key calculation', () => {
      const mockStore = { getSetting: vi.fn() };
      const manager = new VibeManager({ store: mockStore });
      expect(manager.getVibeKey('vibe_test', 'v5')).toBe('vibe_test_v4');
      expect(manager.getVibeKey('vibe_test', 'v4.5')).toBe('vibe_test_v4');
      expect(manager.getVibeKey('vibe_test', 'v3')).toBe('vibe_test');
    });

    it('NotebookManager should support V5 notes and multi-model backup', () => {
      const notebook = new NotebookManager();
      notebook.saveNotebookNotes('v5', [{ id: '1', prompt: 'v5 note' }]);
      expect(notebook.getNotebookNotes('v5').length).toBe(1);
      expect(notebook.getNotebookNotes('v5')[0].prompt).toBe('v5 note');
    });
  });
});
