import { describe, it, expect, vi } from 'vitest';
import { authenticate } from '../functions/_auth-manager.js';

describe('AuthManager', () => {
  const mockEnv = {
    NOVELAI_API_KEY: 'server-key',
    ADMIN_TOKEN: 'admin-secret',
    DB: {
      prepare: vi.fn().mockImplementation((sql) => {
        return {
          bind: vi.fn().mockImplementation((...args) => {
            return {
              first: vi.fn().mockResolvedValue(null),
              run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
            };
          }),
          run: vi.fn().mockResolvedValue({ success: true })
        };
      })
    }
  };

  const createRequest = (headers = {}) => ({
    headers: new Map(Object.entries(headers)),
    headers_get: (key) => headers[key] || null
  });

  it('should use custom API key if provided', async () => {
    const req = { headers: new Map([['x-custom-api-key', 'user-key']]) };
    const result = await authenticate(req, mockEnv);
    expect(result.apiKey).toBe('user-key');
    expect(result.userRole).toBe('CustomAPI');
    expect(result.isVip).toBe(true);
  });

  it('should identify admin correctly', async () => {
    const req = { headers: new Map([['x-admin-token', 'admin-secret']]) };
    const result = await authenticate(req, mockEnv);
    expect(result.apiKey).toBe('server-key');
    expect(result.userRole).toBe('Admin');
  });

  it('should handle guest rate limiting', async () => {
    const req = { headers: new Map([['CF-Connecting-IP', '1.2.3.4']]) };
    const result = await authenticate(req, mockEnv);
    expect(result.userRole).toBe('Free');
    
    // Test the lazy recording
    const waitUntil = vi.fn();
    await result.recordUsage(waitUntil);
    expect(waitUntil).toHaveBeenCalled();
    expect(mockEnv.DB.prepare).toHaveBeenCalled();
  });
});
