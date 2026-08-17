import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest } from '../functions/generate.js';
import { signJwt } from '../functions/_crypto-helper.js';

describe('generate.js integration tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

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

  it('should atomically pre-deduct credits and rollback when upstream fetch fails', async () => {
    const jwtSecret = 'test-jwt-secret-12345';
    const token = await signJwt({ id: 88, username: 'testuser', role: 'User' }, jwtSecret);

    const executedSqls = [];
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({
          first: vi.fn(async () => {
            executedSqls.push({ action: 'first', sql, args });
            if (sql.includes('SELECT id, username, role, credits FROM users')) {
              return { id: 88, username: 'testuser', role: 'User', credits: 5 };
            }
            if (sql.includes('SELECT count FROM free_limits')) {
              return { count: 5 }; // Daily free limit already exhausted
            }
            return null;
          }),
          run: vi.fn(async () => {
            executedSqls.push({ action: 'run', sql, args });
            return { success: true, meta: { changes: 1 } };
          })
        }))
      }))
    };

    // Mock upstream fetch failure (e.g. 500 from NovelAI API)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal NovelAI Error'
    });

    const headersMap = new Map([
      ['authorization', `Bearer ${token}`],
      ['content-type', 'application/json']
    ]);

    const context = {
      request: {
        method: 'POST',
        headers: {
          get: (k) => headersMap.get(k.toLowerCase()) || null
        },
        json: async () => ({ prompt: '1girl, solo', version: 'v3', width: 832, height: 1216 })
      },
      env: {
        NOVELAI_API_KEY: 'test-api-key',
        JWT_SECRET: jwtSecret,
        DB: mockDb
      },
      waitUntil: vi.fn()
    };

    const response = await onRequest(context);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toContain('NovelAI API Error');

    // Verify SQL operations:
    // 1. Pre-deduction: UPDATE users SET credits = credits - 1 WHERE id = 88
    // 2. Rollback: UPDATE users SET credits = credits + 1 WHERE id = 88
    const deductSql = executedSqls.find(s => s.sql && s.sql.includes('UPDATE users SET credits = credits - 1'));
    expect(deductSql).toBeDefined();
    expect(deductSql.args).toEqual([88]);

    const rollbackSql = executedSqls.find(s => s.sql && s.sql.includes('UPDATE users SET credits = credits + 1'));
    expect(rollbackSql).toBeDefined();
    expect(rollbackSql.args).toEqual([88]);
  });

  it('should keep deducted credits and write credit log on successful upstream generation', async () => {
    const jwtSecret = 'test-jwt-secret-12345';
    const token = await signJwt({ id: 88, username: 'testuser', role: 'User' }, jwtSecret);

    const executedSqls = [];
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({
          first: vi.fn(async () => {
            executedSqls.push({ action: 'first', sql, args });
            if (sql.includes('SELECT id, username, role, credits FROM users')) {
              return { id: 88, username: 'testuser', role: 'User', credits: 5 };
            }
            if (sql.includes('SELECT count FROM free_limits')) {
              return { count: 5 }; // Daily limit exhausted, using credits
            }
            return null;
          }),
          run: vi.fn(async () => {
            executedSqls.push({ action: 'run', sql, args });
            return { success: true, meta: { changes: 1 } };
          })
        }))
      }))
    };

    // Mock upstream fetch success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/zip' }),
      body: 'mock-zip-binary-stream'
    });

    const headersMap = new Map([
      ['authorization', `Bearer ${token}`],
      ['content-type', 'application/json']
    ]);

    const waitUntilMock = vi.fn();
    const context = {
      request: {
        method: 'POST',
        headers: {
          get: (k) => headersMap.get(k.toLowerCase()) || null
        },
        json: async () => ({ prompt: '1girl, solo', version: 'v3', width: 832, height: 1216 })
      },
      env: {
        NOVELAI_API_KEY: 'test-api-key',
        JWT_SECRET: jwtSecret,
        DB: mockDb
      },
      waitUntil: waitUntilMock
    };

    const response = await onRequest(context);
    expect(response.status).toBe(200);

    // Verify pre-deduction occurred
    const deductSql = executedSqls.find(s => s.sql && s.sql.includes('UPDATE users SET credits = credits - 1'));
    expect(deductSql).toBeDefined();

    // Verify NO rollback occurred
    const rollbackSql = executedSqls.find(s => s.sql && s.sql.includes('UPDATE users SET credits = credits + 1'));
    expect(rollbackSql).toBeUndefined();

    // Verify credit consumption log was written
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO credit_logs'));
  });
});
