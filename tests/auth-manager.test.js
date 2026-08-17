import { describe, it, expect, vi } from 'vitest';
import { authenticate, preDeductQuota, rollbackQuota, AuthError } from '../functions/_auth-manager.js';

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

  describe('preDeductQuota', () => {
    it('should return type none for CustomAPI and Admin roles', async () => {
      const receiptCustom = await preDeductQuota({ userRole: 'CustomAPI' }, mockEnv);
      expect(receiptCustom).toEqual({ type: 'none' });

      const receiptAdmin = await preDeductQuota({ userRole: 'Admin' }, mockEnv);
      expect(receiptAdmin).toEqual({ type: 'none' });
    });

    it('should pre-deduct daily limit for JWT user when daily limit is available', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                return { success: true, meta: { changes: 1 } };
              })
            }))
          }))
        }
      };

      const auth = {
        authType: 'JWT',
        userId: 101,
        useDailyLimit: true,
        userLimitKey: 'user_limit:2026-08-18:101'
      };

      const receipt = await preDeductQuota(auth, env);
      expect(receipt).toEqual({ type: 'user_daily', key: 'user_limit:2026-08-18:101' });
      expect(executedSqls.length).toBe(1);
      expect(executedSqls[0].sql).toContain('free_limits');
    });

    it('should fall back to paid credits when daily limit is exhausted in concurrency', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                if (sql.includes('free_limits')) {
                  return { success: true, meta: { changes: 0 } }; // Daily limit exhausted
                }
                return { success: true, meta: { changes: 1 } }; // Paid credit deducted
              })
            }))
          }))
        }
      };

      const auth = {
        authType: 'JWT',
        userId: 101,
        useDailyLimit: true,
        userLimitKey: 'user_limit:2026-08-18:101'
      };

      const receipt = await preDeductQuota(auth, env);
      expect(receipt).toEqual({ type: 'user_credits', userId: 101 });
      expect(executedSqls.length).toBe(2);
      expect(executedSqls[0].sql).toContain('free_limits');
      expect(executedSqls[1].sql).toContain('UPDATE users SET credits = credits - 1');
    });

    it('should throw AuthError 402 if both daily limit and paid credits are exhausted for JWT user', async () => {
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                return { success: true, meta: { changes: 0 } }; // Insufficient credits
              })
            }))
          }))
        }
      };

      const auth = {
        authType: 'JWT',
        userId: 101,
        useDailyLimit: false,
        userLimitKey: 'user_limit:2026-08-18:101'
      };

      await expect(preDeductQuota(auth, env)).rejects.toThrow(AuthError);
    });

    it('should pre-deduct credits for VIP card user', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                return { success: true, meta: { changes: 1 } };
              })
            }))
          }))
        }
      };

      const auth = {
        userKey: 'VIP-CARD-123',
        userRole: 'VIP (余:5)'
      };

      const receipt = await preDeductQuota(auth, env);
      expect(receipt).toEqual({ type: 'card_credits', userKey: 'VIP-CARD-123' });
      expect(executedSqls.length).toBe(1);
      expect(executedSqls[0].sql).toContain('UPDATE cards SET credits = credits - 1');
    });

    it('should throw AuthError 402 if VIP card has 0 credits', async () => {
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                return { success: true, meta: { changes: 0 } };
              })
            }))
          }))
        }
      };

      const auth = {
        userKey: 'VIP-CARD-EMPTY',
        userRole: 'VIP (余:0)'
      };

      await expect(preDeductQuota(auth, env)).rejects.toThrow(AuthError);
    });

    it('should pre-increment limits for Free Guest', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                return { success: true, meta: { changes: 1 } };
              })
            }))
          }))
        }
      };

      const auth = {
        isVip: false,
        userRole: 'Free',
        globalKey: 'global:2026-08-18',
        ipKey: 'limit:2026-08-18:1.2.3.4'
      };

      const receipt = await preDeductQuota(auth, env);
      expect(receipt).toEqual({
        type: 'guest_limit',
        globalKey: 'global:2026-08-18',
        ipKey: 'limit:2026-08-18:1.2.3.4'
      });
      expect(executedSqls.length).toBe(2);
    });
  });

  describe('rollbackQuota', () => {
    it('should refund user_credits on rollback', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                return { success: true };
              })
            }))
          }))
        }
      };

      await rollbackQuota({ type: 'user_credits', userId: 101 }, env);
      expect(executedSqls.length).toBe(1);
      expect(executedSqls[0].sql).toContain('UPDATE users SET credits = credits + 1');
      expect(executedSqls[0].args).toEqual([101]);
    });

    it('should decrement free_limits on user_daily rollback', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                return { success: true };
              })
            }))
          }))
        }
      };

      await rollbackQuota({ type: 'user_daily', key: 'user_limit:2026-08-18:101' }, env);
      expect(executedSqls.length).toBe(1);
      expect(executedSqls[0].sql).toContain('UPDATE free_limits SET count = MAX(0, count - 1)');
      expect(executedSqls[0].args).toEqual(['user_limit:2026-08-18:101']);
    });

    it('should refund card_credits on rollback', async () => {
      const executedSqls = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executedSqls.push({ sql, args });
                return { success: true };
              })
            }))
          }))
        }
      };

      await rollbackQuota({ type: 'card_credits', userKey: 'VIP-CARD-123' }, env);
      expect(executedSqls.length).toBe(1);
      expect(executedSqls[0].sql).toContain('UPDATE cards SET credits = credits + 1');
      expect(executedSqls[0].args).toEqual(['VIP-CARD-123']);
    });

    it('should do nothing when receipt type is none', async () => {
      const env = {
        DB: {
          prepare: vi.fn()
        }
      };

      await rollbackQuota({ type: 'none' }, env);
      expect(env.DB.prepare).not.toHaveBeenCalled();
    });
  });
});
