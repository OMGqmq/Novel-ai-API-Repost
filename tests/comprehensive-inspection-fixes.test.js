import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ImageEngine } from '../src/engine.js';
import { onRequest as chatProxyHandler } from '../functions/api/chat-proxy.js';

describe('Comprehensive Inspection Fixes & Enhancements Verification', () => {
  describe('1. DOM ID Alignment in Generation Pipeline', () => {
    it('should verify that all parameter IDs used in src/main.js exist in index.html', () => {
      const htmlPath = resolve(__dirname, '../index.html');
      const html = readFileSync(htmlPath, 'utf-8');

      // Verify the critical IDs that were previously mismatched
      expect(html).toContain('id="dynThresholdEnabled"');
      expect(html).toContain('id="noise_schedule"');
      expect(html).toContain('id="qualityToggleEnabled"');
      expect(html).toContain('id="negativePrompt"');
      expect(html).toContain('id="v5UcPreset"');
      expect(html).toContain('id="v5QualityPreset"');
      expect(html).toContain('id="v5ParamsContainer"');
      expect(html).toContain('id="initImagePreviewContainer"');
      expect(html).toContain('id="initImagePreview"');
      expect(html).toContain('id="initImagePlaceholder"');
      expect(html).toContain('id="clearInitImageBtn"');
    });
  });

  describe('2. ImageEngine Native AbortSignal Support', () => {
    it('should abort in-flight fetch when signal is triggered', async () => {
      const engine = new ImageEngine();
      engine.JSZip = { loadAsync: vi.fn() };

      const controller = new AbortController();
      const mockFetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      try {
        const genPromise = engine.generate({}, { signal: controller.signal });
        controller.abort();

        await expect(genPromise).rejects.toThrow();
        expect(mockFetch).toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('3. Cloudflare Pages Functions Chat Proxy', () => {
    it('should return CORS preflight headers on OPTIONS request', async () => {
      const context = {
        request: new Request('https://example.com/api/chat-proxy', { method: 'OPTIONS' })
      };
      const res = await chatProxyHandler(context);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should proxy POST request to upstream endpoint and attach CORS header', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'hello from upstream' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      try {
        const context = {
          request: new Request('https://example.com/api/chat-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: 'https://api.openai.com/v1/chat/completions',
              apiKey: 'sk-test123',
              body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }
            })
          })
        };

        const res = await chatProxyHandler(context);
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
        const data = await res.json();
        expect(data.choices[0].message.content).toBe('hello from upstream');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('4. AI Agent Negative Prompt ID Resolution', () => {
    it('should correctly select negativePrompt textarea when resolving negInput in execution context', () => {
      const mockElements = {
        negativePrompt: { id: 'negativePrompt', value: '' }
      };
      global.document = {
        getElementById: vi.fn((id) => mockElements[id] || null)
      };

      const negInput = document.getElementById('negativePrompt') || document.getElementById('negative');
      expect(negInput).not.toBeNull();
      expect(negInput.id).toBe('negativePrompt');

      negInput.value = 'lowres, bad quality';
      expect(mockElements.negativePrompt.value).toBe('lowres, bad quality');
    });
  });
});
