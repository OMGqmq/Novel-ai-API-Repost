import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest as rechargeHandler } from '../functions/api/auth/recharge.js';
import { onRequest as loginHandler } from '../functions/api/auth/login.js';
import { onRequest as adminStatsHandler } from '../functions/api/admin/stats.js';
import { handleNovelAIProxy } from '../functions/_proxy-helper.js';
import { authenticate, preDeductQuota, rollbackQuota, AuthError } from '../functions/_auth-manager.js';
import { signJwt, hashPassword, generateSalt } from '../functions/_crypto-helper.js';

/**
 * High-Fidelity Mock D1 Engine that emulates atomic SQLite CAS transactions & meta.changes
 */
class MockD1Engine {
  constructor({ users = [], cards = [], free_limits = [], request_logs = [] } = {}) {
    this.users = new Map(users.map(u => [u.id, { ...u }]));
    this.cards = new Map(cards.map(c => [c.card_key, { ...c }]));
    this.free_limits = new Map(free_limits.map(f => [f.key, { ...f }]));
    this.request_logs = [...request_logs];
    this.credit_logs = [];
    this.batchExecutionCount = 0;
  }

  prepare(sql) {
    const self = this;
    return {
      sql,
      bind(...args) {
        return {
          sql,
          args,
          async first() {
            return self._executeFirst(sql, args);
          },
          async run() {
            return self._executeRun(sql, args);
          }
        };
      }
    };
  }

  async batch(statements) {
    this.batchExecutionCount++;
    const results = [];
    for (const stmt of statements) {
      if (typeof stmt.run === 'function') {
        results.push(await stmt.run());
      } else if (stmt.args) {
        results.push(await this._executeRun(stmt.sql, stmt.args));
      } else {
        results.push({ results: [], success: true, meta: { changes: 1 } });
      }
    }
    return results;
  }

  _executeFirst(sql, args) {
    if (sql.includes('FROM cards WHERE card_key = ?')) {
      const card = this.cards.get(args[0]);
      return card ? { ...card } : null;
    }
    if (sql.includes('FROM users WHERE id = ?')) {
      const user = this.users.get(args[0]);
      return user ? { ...user } : null;
    }
    if (sql.includes('FROM users WHERE username = ?')) {
      for (const u of this.users.values()) {
        if (u.username === args[0]) return { ...u };
      }
      return null;
    }
    if (sql.includes('FROM free_limits WHERE key = ?')) {
      const limit = this.free_limits.get(args[0]);
      return limit ? { ...limit } : null;
    }
    return null;
  }

  _executeRun(sql, args) {
    // 1. Atomic recharge card Gatekeeper: UPDATE cards SET is_used = 1 ... WHERE card_key = ? AND is_used = 0
    if (sql.includes('UPDATE cards SET is_used = 1') && sql.includes('is_used = 0')) {
      const [usedById, cardKey] = args;
      const card = this.cards.get(cardKey);
      if (card && card.is_used === 0) {
        card.is_used = 1;
        card.used_by_id = usedById;
        card.used_at = new Date().toISOString();
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 2. User balance increment (recharge / refund)
    if (sql.includes('UPDATE users SET credits = credits +')) {
      const [amount, userId] = args.length === 2 ? args : [1, args[0]];
      const user = this.users.get(userId);
      if (user) {
        user.credits += amount;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 3. User balance decrement: UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0
    if (sql.includes('UPDATE users SET credits = credits - 1') && sql.includes('credits > 0')) {
      const [userId] = args;
      const user = this.users.get(userId);
      if (user && user.credits > 0) {
        user.credits -= 1;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 4. Card balance decrement: UPDATE cards SET credits = credits - 1 WHERE card_key = ? AND credits > 0
    if (sql.includes('UPDATE cards SET credits = credits - 1') && sql.includes('credits > 0')) {
      const [cardKey] = args;
      const card = this.cards.get(cardKey);
      if (card && card.credits > 0) {
        card.credits -= 1;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 5. Card balance refund: UPDATE cards SET credits = credits + 1 WHERE card_key = ?
    if (sql.includes('UPDATE cards SET credits = credits + 1')) {
      const [cardKey] = args;
      const card = this.cards.get(cardKey);
      if (card) {
        card.credits += 1;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 6. User daily free limit atomic increment: INSERT INTO free_limits ... WHERE free_limits.count < ?
    if (sql.includes('INSERT INTO free_limits') && sql.includes('WHERE free_limits.count < ?')) {
      const [key, maxLimit] = args;
      let entry = this.free_limits.get(key);
      if (!entry) {
        this.free_limits.set(key, { key, count: 1 });
        return { success: true, meta: { changes: 1 } };
      }
      if (entry.count < maxLimit) {
        entry.count += 1;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 7. General free_limits upsert
    if (sql.includes('INSERT INTO free_limits') && sql.includes('ON CONFLICT(key) DO UPDATE')) {
      const [key] = args;
      let entry = this.free_limits.get(key);
      if (!entry) {
        this.free_limits.set(key, { key, count: 1 });
      } else {
        entry.count += 1;
      }
      return { success: true, meta: { changes: 1 } };
    }

    // 8. Decrement free_limits: UPDATE free_limits SET count = MAX(0, count - 1)
    if (sql.includes('UPDATE free_limits SET count = MAX(0, count - 1)')) {
      const [key] = args;
      let entry = this.free_limits.get(key);
      if (entry) {
        entry.count = Math.max(0, entry.count - 1);
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // 9. Logs
    if (sql.includes('INSERT INTO credit_logs')) {
      this.credit_logs.push(args);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO request_logs')) {
      this.request_logs.push(args);
      return { success: true, meta: { changes: 1 } };
    }

    return { success: true, meta: { changes: 1 } };
  }
}

describe('Challenger 2 - Adversarial Concurrency & Security Stress Suite', () => {
  const JWT_SECRET = 'adversarial-test-jwt-secret-key-32chars!';

  describe('Objective 1: Concurrency Stress Test on recharge.js (Double-Recharge Attack)', () => {
    it('should grant credits to ONLY 1 request when 25 concurrent requests use the identical card key', async () => {
      const db = new MockD1Engine({
        users: [{ id: 10, username: 'victim_or_attacker', credits: 5, status: 'Approved' }],
        cards: [{ card_key: 'RCHG-CONCURRENT-CARD-999', credits: 100, is_used: 0, used_by_id: null }]
      });

      const token = await signJwt({ id: 10, username: 'victim_or_attacker', role: 'User' }, JWT_SECRET);

      const makeRequest = () => ({
        request: {
          method: 'POST',
          headers: new Map([['Authorization', `Bearer ${token}`]]),
          json: async () => ({ cardKey: 'RCHG-CONCURRENT-CARD-999' })
        },
        env: { DB: db, JWT_SECRET }
      });

      // Fire 25 concurrent requests simultaneously
      const concurrencyLevel = 25;
      const promises = Array.from({ length: concurrencyLevel }, () => rechargeHandler(makeRequest()));
      const responses = await Promise.all(promises);

      const statuses = responses.map(r => r.status);
      const successCount = statuses.filter(s => s === 200).length;
      const rejectedCount = statuses.filter(s => s === 400).length;

      expect(successCount).toBe(1);
      expect(rejectedCount).toBe(concurrencyLevel - 1);

      // Verify database state integrity
      const user = db.users.get(10);
      expect(user.credits).toBe(105); // 5 initial + 100 once (NOT 5 + 25*100)

      const card = db.cards.get('RCHG-CONCURRENT-CARD-999');
      expect(card.is_used).toBe(1);
      expect(card.used_by_id).toBe(10);

      // Verify credit_logs has exactly 1 entry
      expect(db.credit_logs.length).toBe(1);
      expect(db.batchExecutionCount).toBe(1);
    });

    it('should prevent cross-account racing: 10 distinct users racing for the same card key', async () => {
      const users = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        username: `user_${i + 1}`,
        credits: 0,
        status: 'Approved'
      }));

      const db = new MockD1Engine({
        users,
        cards: [{ card_key: 'CROSS-USER-RACE-CARD-777', credits: 50, is_used: 0, used_by_id: null }]
      });

      const tokens = await Promise.all(
        users.map(u => signJwt({ id: u.id, username: u.username, role: 'User' }, JWT_SECRET))
      );

      const promises = users.map((u, i) => {
        return rechargeHandler({
          request: {
            method: 'POST',
            headers: new Map([['Authorization', `Bearer ${tokens[i]}`]]),
            json: async () => ({ cardKey: 'CROSS-USER-RACE-CARD-777' })
          },
          env: { DB: db, JWT_SECRET }
        });
      });

      const responses = await Promise.all(promises);
      const successResponses = responses.filter(r => r.status === 200);
      const failResponses = responses.filter(r => r.status === 400);

      expect(successResponses.length).toBe(1);
      expect(failResponses.length).toBe(9);

      // Sum of all user balances must be exactly 50
      const totalUserCredits = Array.from(db.users.values()).reduce((sum, u) => sum + u.credits, 0);
      expect(totalUserCredits).toBe(50);
    });
  });

  describe('Objective 2: Concurrency & TOCTOU Stress Test on _proxy-helper.js & _auth-manager.js', () => {
    it('should allow only 1 generation when JWT user has balance = 1 and 20 concurrent requests fire', async () => {
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
      const userLimitKey = `user_limit:${today}:42`;

      const db = new MockD1Engine({
        users: [{ id: 42, username: 'tight_balance_user', credits: 1, role: 'User', status: 'Approved' }],
        free_limits: [{ key: userLimitKey, count: 10 }] // Free daily limit fully exhausted
      });

      const token = await signJwt({ id: 42, username: 'tight_balance_user', role: 'User' }, JWT_SECRET);

      // Mock upstream NovelAI fetch returning 200 OK
      global.fetch = vi.fn().mockImplementation(async (url) => {
        return new Response(new Uint8Array([80, 75, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'application/zip' }
        });
      });

      const makeProxyContext = () => ({
        request: {
          method: 'POST',
          headers: new Map([
            ['Authorization', `Bearer ${token}`],
            ['Content-Type', 'application/json']
          ]),
          json: async () => ({
            prompt: 'masterpiece, high quality',
            width: 832,
            height: 1216,
            version: 'v3'
          })
        },
        env: {
          DB: db,
          JWT_SECRET,
          NOVELAI_API_KEY: 'test-nai-api-key'
        },
        waitUntil: (p) => p
      });

      const concurrency = 20;
      const results = await Promise.all(
        Array.from({ length: concurrency }, () =>
          handleNovelAIProxy(makeProxyContext(), {
            targetUrl: 'https://image.novelai.net/ai/generate-image',
            buildPayload: () => ({ test: true })
          })
        )
      );

      const successResults = results.filter(r => r.status === 200);
      const rejectedResults = results.filter(r => r.status === 402);

      expect(successResults.length).toBe(1);
      expect(rejectedResults.length).toBe(concurrency - 1);

      // Ensure final user balance is exactly 0, never negative
      const finalUser = db.users.get(42);
      expect(finalUser.credits).toBe(0);
    });

    it('should allow only 1 generation when VIP card has balance = 1 and 15 concurrent requests fire', async () => {
      const db = new MockD1Engine({
        cards: [{ card_key: 'VIP-LAST-SHOT-1', credits: 1, is_used: 0 }]
      });

      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response(new Uint8Array([80, 75, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'application/zip' }
        });
      });

      const makeContext = () => ({
        request: {
          method: 'POST',
          headers: new Map([
            ['x-user-key', 'VIP-LAST-SHOT-1'],
            ['Content-Type', 'application/json']
          ]),
          json: async () => ({
            prompt: 'masterpiece',
            width: 832,
            height: 1216,
            version: 'v3'
          })
        },
        env: {
          DB: db,
          NOVELAI_API_KEY: 'test-nai-api-key'
        },
        waitUntil: (p) => p
      });

      const concurrency = 15;
      const results = await Promise.all(
        Array.from({ length: concurrency }, () =>
          handleNovelAIProxy(makeContext(), {
            targetUrl: 'https://image.novelai.net/ai/generate-image',
            buildPayload: () => ({ test: true })
          })
        )
      );

      const successResults = results.filter(r => r.status === 200);
      const rejectedResults = results.filter(r => r.status === 402);

      expect(successResults.length).toBe(1);
      expect(rejectedResults.length).toBe(concurrency - 1);

      const card = db.cards.get('VIP-LAST-SHOT-1');
      expect(card.credits).toBe(0);
    });

    it('should restore user balance via compensation rollback when upstream throws 500 error or network failure', async () => {
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
      const userLimitKey = `user_limit:${today}:88`;

      const db = new MockD1Engine({
        users: [{ id: 88, username: 'rollback_user', credits: 1, role: 'User', status: 'Approved' }],
        free_limits: [{ key: userLimitKey, count: 10 }] // Free limit exhausted
      });

      const token = await signJwt({ id: 88, username: 'rollback_user', role: 'User' }, JWT_SECRET);

      // 1. Simulate upstream 500 error
      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response('NovelAI Backend Crashed', { status: 500 });
      });

      const makeContext = () => ({
        request: {
          method: 'POST',
          headers: new Map([
            ['Authorization', `Bearer ${token}`],
            ['Content-Type', 'application/json']
          ]),
          json: async () => ({ prompt: 'test', width: 832, height: 1216, version: 'v3' })
        },
        env: {
          DB: db,
          JWT_SECRET,
          NOVELAI_API_KEY: 'test-nai-api-key'
        },
        waitUntil: (p) => p
      });

      const res1 = await handleNovelAIProxy(makeContext(), {
        targetUrl: 'https://image.novelai.net/ai/generate-image',
        buildPayload: () => ({ test: true })
      });

      expect(res1.status).toBe(500);
      // Verify that the pre-deducted credit was rolled back to 1
      expect(db.users.get(88).credits).toBe(1);

      // 2. Simulate upstream network throw (e.g. timeout / DNS fail)
      global.fetch = vi.fn().mockRejectedValue(new Error('Fetch network timeout'));

      const res2 = await handleNovelAIProxy(makeContext(), {
        targetUrl: 'https://image.novelai.net/ai/generate-image',
        buildPayload: () => ({ test: true })
      });

      expect(res2.status).toBe(500);
      expect(db.users.get(88).credits).toBe(1);

      // 3. Subsequent request succeeds when upstream recovers
      global.fetch = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([80, 75, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'application/zip' }
        })
      );

      const res3 = await handleNovelAIProxy(makeContext(), {
        targetUrl: 'https://image.novelai.net/ai/generate-image',
        buildPayload: () => ({ test: true })
      });

      expect(res3.status).toBe(200);
      expect(db.users.get(88).credits).toBe(0);
    });

    it('should restore daily free limit via rollback when upstream fails', async () => {
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
      const userLimitKey = `user_limit:${today}:99`;

      const db = new MockD1Engine({
        users: [{ id: 99, username: 'daily_user', credits: 0, role: 'User', status: 'Approved' }],
        free_limits: [{ key: userLimitKey, count: 2 }] // Used 2 of 10
      });

      const token = await signJwt({ id: 99, username: 'daily_user', role: 'User' }, JWT_SECRET);

      global.fetch = vi.fn().mockRejectedValue(new Error('Upstream Connection Reset'));

      const ctx = {
        request: {
          method: 'POST',
          headers: new Map([
            ['Authorization', `Bearer ${token}`],
            ['Content-Type', 'application/json']
          ]),
          json: async () => ({ prompt: 'test', width: 832, height: 1216, version: 'v3' })
        },
        env: {
          DB: db,
          JWT_SECRET,
          NOVELAI_API_KEY: 'test-nai-api-key'
        },
        waitUntil: (p) => p
      };

      const res = await handleNovelAIProxy(ctx, {
        targetUrl: 'https://image.novelai.net/ai/generate-image',
        buildPayload: () => ({ test: true })
      });

      expect(res.status).toBe(500);
      // Count should be rolled back to 2
      expect(db.free_limits.get(userLimitKey).count).toBe(2);
    });
  });

  describe('Objective 3: Security Test on login.js & Secret Enforcement', () => {
    it('should fail with HTTP 500 and strict error message when JWT_SECRET is unset, undefined, or empty', async () => {
      const salt = generateSalt();
      const passwordHash = await hashPassword('securePass123!', salt);

      const db = new MockD1Engine({
        users: [{
          id: 1,
          username: 'valid_user',
          password_hash: passwordHash,
          salt: salt,
          role: 'User',
          status: 'Approved',
          credits: 10
        }]
      });

      const makeLoginContext = (envOverrides) => ({
        request: {
          method: 'POST',
          json: async () => ({ username: 'valid_user', password: 'securePass123!' })
        },
        env: {
          DB: db,
          ...envOverrides
        }
      });

      // 1. JWT_SECRET undefined
      const resUndef = await loginHandler(makeLoginContext({}));
      expect(resUndef.status).toBe(500);
      const jsonUndef = await resUndef.json();
      expect(jsonUndef.error).toBe('服务器未配置 JWT_SECRET');

      // 2. JWT_SECRET empty string
      const resEmpty = await loginHandler(makeLoginContext({ JWT_SECRET: '' }));
      expect(resEmpty.status).toBe(500);
      const jsonEmpty = await resEmpty.json();
      expect(jsonEmpty.error).toBe('服务器未配置 JWT_SECRET');

      // 3. JWT_SECRET null
      const resNull = await loginHandler(makeLoginContext({ JWT_SECRET: null }));
      expect(resNull.status).toBe(500);
      const jsonNull = await resNull.json();
      expect(jsonNull.error).toBe('服务器未配置 JWT_SECRET');
    });

    it('should verify recharge.js strictly fails with HTTP 500 when JWT_SECRET is missing', async () => {
      const db = new MockD1Engine();
      const ctx = {
        request: {
          method: 'POST',
          headers: new Map([['Authorization', 'Bearer some.dummy.token']]),
          json: async () => ({ cardKey: 'ANY-CARD' })
        },
        env: { DB: db } // Missing JWT_SECRET
      };

      const res = await rechargeHandler(ctx);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('服务器未配置 JWT_SECRET');
    });

    it('should verify _auth-manager.js throws AuthError 500 when JWT_SECRET is missing for JWT auth', async () => {
      const db = new MockD1Engine();
      const req = {
        headers: new Map([['Authorization', 'Bearer some.dummy.token']])
      };
      const env = { DB: db, NOVELAI_API_KEY: 'test-key' }; // Missing JWT_SECRET

      await expect(authenticate(req, env)).rejects.toMatchObject({
        status: 500,
        message: '服务器未配置 JWT_SECRET'
      });
    });
  });

  describe('Objective 4: Stress Test admin/stats.js with Malformed & SQL Injection Payloads', () => {
    it('should safely handle edge case ranges (range=invalid, SQL injection strings) via parameterized bindings in single db.batch', async () => {
      const capturedBatchStatements = [];

      const mockDb = {
        prepare: vi.fn((sql) => ({
          sql,
          bind: vi.fn((...args) => ({
            sql,
            args
          }))
        })),
        batch: vi.fn(async (statements) => {
          capturedBatchStatements.push(...statements);
          return [
            { results: [{ total_requests: 5, success_rate: 100.0, avg_duration: 500 }] },
            { results: [{ time_bucket: '08-18 02:00', request_count: 5, avg_duration: 500 }] },
            { results: [{ model: 'nai-diffusion-3', count: 5 }] },
            { results: [] },
            { results: [{ ip: '127.0.0.1', count: 5 }] }
          ];
        })
      };

      const maliciousRanges = [
        "invalid_range_value",
        "'; DROP TABLE request_logs; --",
        "' OR '1'='1",
        "../../etc/passwd",
        "<script>alert(1)</script>",
        "1 UNION SELECT 1,2,3,4,5 --"
      ];

      for (const badRange of maliciousRanges) {
        capturedBatchStatements.length = 0;
        mockDb.prepare.mockClear();
        mockDb.batch.mockClear();

        const req = {
          url: `http://localhost/api/admin/stats?range=${encodeURIComponent(badRange)}`,
          headers: new Map([['x-admin-token', 'secret-admin-token']])
        };

        const res = await adminStatsHandler({
          request: req,
          env: {
            DB: mockDb,
            ADMIN_TOKEN: 'secret-admin-token'
          }
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);

        // Verify single db.batch execution with 5 statements
        expect(mockDb.batch).toHaveBeenCalledTimes(1);
        expect(capturedBatchStatements.length).toBe(5);

        // Verify default fallback to '-24 hours' modifier
        for (const stmt of capturedBatchStatements) {
          expect(stmt.args).toContain('-24 hours');
        }
      }
    });

    it('should handle completely empty database logs without crashing or NaN values', async () => {
      const mockDb = {
        prepare: vi.fn((sql) => ({
          sql,
          bind: vi.fn((...args) => ({ sql, args }))
        })),
        batch: vi.fn(async () => [
          { results: [{ total_requests: 0, success_rate: null, avg_duration: null }] },
          { results: [] },
          { results: [] },
          { results: [] },
          { results: [] }
        ])
      };

      const req = {
        url: 'http://localhost/api/admin/stats?range=24h',
        headers: new Map([['x-admin-token', 'secret-admin-token']])
      };

      const res = await adminStatsHandler({
        request: req,
        env: {
          DB: mockDb,
          ADMIN_TOKEN: 'secret-admin-token'
        }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.summary).toEqual({
        total_requests: 0,
        success_rate: 100,
        avg_duration: 0
      });
      expect(data.trend).toEqual([]);
      expect(data.models).toEqual([]);
      expect(data.errors).toEqual([]);
      expect(data.ips).toEqual([]);
    });
  });
});
