import { describe, it, expect, vi } from 'vitest';
import { onRequest } from '../functions/generate.js';

describe('generate.js integration tests', () => {
  it('should return 405 for non-POST requests', async () => {
    const context = {
      request: {
        method: 'GET'
      }
    };
    const response = await onRequest(context);
    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data.error).toBe('Method not allowed');
  });

  it('should return 500 error if NOVELAI_API_KEY is missing', async () => {
    const context = {
      request: {
        method: 'POST',
        headers: new Map(),
        json: async () => ({})
      },
      env: {} // Missing NOVELAI_API_KEY
    };
    const response = await onRequest(context);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('服务器未配置 NOVELAI_API_KEY');
  });
});
