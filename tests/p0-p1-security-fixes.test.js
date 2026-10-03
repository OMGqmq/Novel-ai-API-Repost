import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest as rechargeHandler } from '../functions/api/auth/recharge.js';
import { onRequest as chatProxyHandler } from '../functions/api/chat-proxy.js';
import { authenticate, preDeductQuota, AuthError } from '../functions/_auth-manager.js';
import { handleNovelAIProxy } from '../functions/_proxy-helper.js';
import { signJwt } from '../functions/_crypto-helper.js';

describe('P0 & P1 Security Fixes & Regression Verification', () => {
  const JWT_SECRET = 'test-jwt-secret-for-security-tests-32chars!';

  describe('1. P0-1: VIP Card Double-Spend Elimination', () => {
    it('should set credits=0 and is_used=1 upon recharge, preventing secondary usage via x-user-key', async () => {
      const cards = new Map([
        ['VIP-DOUBLESPEND-TEST', { card_key: 'VIP-DOUBLESPEND-TEST', credits: 100, is_used: 0, used_by_id: null }]
      ]);
      const users = new Map([
        [1, { id: 1, username: 'recharge_user', credits: 10, status: 'Approved' }]
      ]);

      const mockDb = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn((...args) => ({
            sql,
            args,
            first: vi.fn(async () => {
              if (sql.includes('FROM cards WHERE card_key = ?')) {
                const c = cards.get(args[0]);
                return c ? { ...c } : null;
              }
              if (sql.includes('FROM users WHERE id = ?')) {
                const u = users.get(args[0]);
                return u ? { ...u } : null;
              }
              return null;
            }),
            run: vi.fn(async () => {
              if (sql.includes('UPDATE cards SET is_used = 1') && sql.includes('credits = 0')) {
                const [userId, cardKey] = args;
                const c = cards.get(cardKey);
                if (c && c.is_used === 0) {
                  c.is_used = 1;
                  c.credits = 0;
                  c.used_by_id = userId;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              return { success: true, meta: { changes: 1 } };
            })
          })),
          run: vi.fn(async () => ({ success: true }))
        })),
        batch: vi.fn(async (stmts) => {
          for (const s of stmts) {
            if (s.sql && s.sql.includes('UPDATE users SET credits = credits +')) {
              const u = users.get(s.args[1]);
              if (u) u.credits += s.args[0];
            }
          }
          return [{ success: true }];
        })
      };

      const token = await signJwt({ id: 1, username: 'recharge_user' }, JWT_SECRET);

      // Step 1: User recharges the 100-credit card into account
      const req = {
        method: 'POST',
        headers: new Map([['Authorization', `Bearer ${token}`]]),
        json: async () => ({ cardKey: 'VIP-DOUBLESPEND-TEST' })
      };
      const rechargeRes = await rechargeHandler({ request: req, env: { DB: mockDb, JWT_SECRET } });
      expect(rechargeRes.status).toBe(200);
      const resData = await rechargeRes.json();
      expect(resData.credits).toBe(110);

      // Verify the card's state in DB: must be is_used=1 AND credits=0
      const cardInDb = cards.get('VIP-DOUBLESPEND-TEST');
      expect(cardInDb.is_used).toBe(1);
      expect(cardInDb.credits).toBe(0);

      // Step 2: Attacker attempts to use the SAME card key directly as x-user-key to authenticate
      const attackReq = {
        headers: new Map([['x-user-key', 'VIP-DOUBLESPEND-TEST']])
      };
      await expect(authenticate(attackReq, { DB: mockDb, NOVELAI_API_KEY: 'test-key' }))
        .rejects.toThrow('该卡密已被使用或已充值入账');
    });
  });

  describe('2. P0-2: /api/chat-proxy SSRF & Access Control', () => {
    it('should reject non-HTTPS endpoints with HTTP 400', async () => {
      const context = {
        request: new Request('https://example.com/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: 'http://api.openai.com/v1/chat/completions',
            body: {}
          })
        }),
        env: {}
      };
      const res = await chatProxyHandler(context);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('HTTPS');
    });

    it('should reject localhost and private IP addresses (SSRF) with HTTP 403', async () => {
      const privateEndpoints = [
        'https://localhost:8080/v1/chat/completions',
        'https://127.0.0.1:11434/v1/chat/completions',
        'https://169.254.169.254/latest/meta-data',
        'https://10.0.0.5/api',
        'https://192.168.1.1/admin',
        'https://172.20.0.1/internal'
      ];

      for (const ep of privateEndpoints) {
        const context = {
          request: new Request('https://example.com/api/chat-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: ep, body: {} })
          }),
          env: {}
        };
        const res = await chatProxyHandler(context);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain('禁止请求本地或私有内部网络');
      }
    });

    it('should reject unauthenticated requests to non-whitelisted arbitrary domains with HTTP 403', async () => {
      const context = {
        request: new Request('https://example.com/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: 'https://evil-unauthorized-relay.example.com/chat/completions',
            body: {}
          })
        }),
        env: { ADMIN_TOKEN: 'super-admin-secret' }
      };
      const res = await chatProxyHandler(context);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('自定义 AI 端点仅限登录用户或管理员使用');
    });

    it('should allow non-whitelisted custom endpoints when valid admin token is provided', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'custom proxy response' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      try {
        const context = {
          request: new Request('https://example.com/api/chat-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-token': 'super-admin-secret'
            },
            body: JSON.stringify({
              endpoint: 'https://custom-ai-host.corp.org/v1/chat/completions',
              apiKey: 'corp-key',
              body: { model: 'llama-3' }
            })
          }),
          env: { ADMIN_TOKEN: 'super-admin-secret' }
        };
        const res = await chatProxyHandler(context);
        expect(res.status).toBe(200);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('3. P1-1: Free Guest Concurrency TOCTOU Hardening', () => {
    it('should enforce atomic limit check and rollback global count when IP limit is exceeded', async () => {
      const freeLimits = new Map();

      const mockDb = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn((...args) => ({
            run: vi.fn(async () => {
              if (sql.includes('INSERT INTO free_limits') && sql.includes('WHERE free_limits.count < ?')) {
                const [key, maxLimit] = args;
                const entry = freeLimits.get(key) || { count: 0 };
                if (entry.count < maxLimit) {
                  entry.count += 1;
                  freeLimits.set(key, entry);
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              if (sql.includes('UPDATE free_limits SET count = MAX(0, count - 1)')) {
                const [key] = args;
                const entry = freeLimits.get(key);
                if (entry) entry.count = Math.max(0, entry.count - 1);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            })
          }))
        }))
      };

      const auth = {
        isVip: false,
        globalKey: 'global:2026-10-03',
        ipKey: 'limit:2026-10-03:8.8.8.8'
      };

      // Populate IP limit to 5 (already at maximum allowed 5)
      freeLimits.set('limit:2026-10-03:8.8.8.8', { count: 5 });

      await expect(preDeductQuota(auth, { DB: mockDb }))
        .rejects.toThrow('今日免费额度已用完');

      // Global count must be rolled back to 0, not incremented
      expect(freeLimits.get('global:2026-10-03')?.count || 0).toBe(0);
    });
  });

  describe('4. P1-2: Immediate Invalidation of Banned / Pending JWT Accounts', () => {
    it('should reject a Banned user immediately even if their JWT token is valid', async () => {
      const mockDb = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              id: 999,
              username: 'banned_user',
              role: 'User',
              credits: 100,
              status: 'Banned'
            }))
          }))
        }))
      };

      const token = await signJwt({ id: 999, username: 'banned_user' }, JWT_SECRET);
      const req = {
        headers: new Map([['Authorization', `Bearer ${token}`]])
      };

      await expect(authenticate(req, { DB: mockDb, JWT_SECRET, NOVELAI_API_KEY: 'server-key' }))
        .rejects.toThrow('您的账号已被管理员封禁');
    });

    it('should reject a Pending user immediately during generation requests', async () => {
      const mockDb = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              id: 888,
              username: 'pending_user',
              role: 'User',
              credits: 10,
              status: 'Pending'
            }))
          }))
        }))
      };

      const token = await signJwt({ id: 888, username: 'pending_user' }, JWT_SECRET);
      const req = {
        headers: new Map([['Authorization', `Bearer ${token}`]])
      };

      await expect(authenticate(req, { DB: mockDb, JWT_SECRET, NOVELAI_API_KEY: 'server-key' }))
        .rejects.toThrow('您的账号处于待审核状态');
    });
  });

  describe('5. P1-3: Protect Server Anlas from Free Upscale Abuse & Return 400 on Pixel Overrun', () => {
    it('should reject free guests calling /ai/upscale with HTTP 403 to prevent consuming server Anlas', async () => {
      const context = {
        request: {
          method: 'POST',
          headers: new Map([['CF-Connecting-IP', '1.1.1.1']]),
          json: async () => ({ image: 'base64_data', width: 832, height: 1216 })
        },
        env: {
          NOVELAI_API_KEY: 'server-opus-key',
          DB: {
            prepare: vi.fn(() => ({
              bind: vi.fn(() => ({
                first: vi.fn(async () => ({ count: 0 })),
                run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
              }))
            }))
          }
        },
        waitUntil: vi.fn()
      };

      const res = await handleNovelAIProxy(context, {
        targetUrl: 'https://image.novelai.net/ai/upscale',
        buildPayload: () => ({})
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('4x AI 超分辨率放大功能会消耗服务器付费 Anlas 算力');
    });

    it('should return HTTP 400 when image resolution exceeds Opus free limits', async () => {
      const context = {
        request: {
          method: 'POST',
          headers: new Map([['CF-Connecting-IP', '1.1.1.1']]),
          json: async () => ({ width: 2048, height: 2048 })
        },
        env: {
          NOVELAI_API_KEY: 'server-opus-key',
          DB: {
            prepare: vi.fn(() => ({
              bind: vi.fn(() => ({
                first: vi.fn(async () => ({ count: 0 })),
                run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
              }))
            }))
          }
        },
        waitUntil: vi.fn()
      };

      const res = await handleNovelAIProxy(context, {
        targetUrl: 'https://image.novelai.net/ai/generate-image',
        buildPayload: () => ({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('分辨率超出 Opus 免费限制');
    });
  });
});
