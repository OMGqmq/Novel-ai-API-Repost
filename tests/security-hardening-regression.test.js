import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { onRequest as generateHandler } from '../functions/generate.js';
import { onRequest as augmentHandler } from '../functions/augment.js';
import { onRequest as rechargeHandler } from '../functions/api/auth/recharge.js';
import { onRequest as chatProxyHandler } from '../functions/api/chat-proxy.js';
import { rollbackQuota } from '../functions/_auth-manager.js';
import { signJwt, verifyJwt } from '../functions/_crypto-helper.js';
import { NotebookManager } from '../src/notebook.js';

const RAW_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JWT_SECRET = 'test-secret-for-hardening-regression-32chars!';

function createGuestEnv() {
  return {
    NOVELAI_API_KEY: 'server-opus-key',
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({ count: 0 })),
          run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
        }))
      }))
    }
  };
}

describe('Security Hardening & P0 Regression Suite', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. V4.5 Vibe Auto-Encode Bypass Prevention', () => {
    it.each(['v4', 'v4-full', 'v4-curated', 'V4.5', ' v4 '])(
      'should block free guests from triggering server Anlas encode-vibe via version alias "%s"',
      async (versionAlias) => {
        const fetchMock = vi.fn();
        global.fetch = fetchMock;

        const res = await generateHandler({
          request: new Request('https://example.com/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': '1.2.3.4'
            },
            body: JSON.stringify({
              version: versionAlias,
              prompt: '1girl',
              width: 832,
              height: 1216,
              vibe_image: RAW_PNG_B64
            })
          }),
          env: createGuestEnv(),
          waitUntil: vi.fn()
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain('Anlas');
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it('should still allow Custom API Key users to auto-encode V4.5 raw vibe images', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }))
        .mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4]), {
          status: 200,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Encoding': 'gzip',
            'Content-Length': '9999',
            'Set-Cookie': 'session=secret'
          }
        }));
      global.fetch = fetchMock;

      const res = await generateHandler({
        request: new Request('https://example.com/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-custom-api-key': 'pst-user-custom-key'
          },
          body: JSON.stringify({
            version: 'v4',
            prompt: '1girl',
            width: 832,
            height: 1216,
            vibe_image: RAW_PNG_B64
          })
        }),
        env: { NOVELAI_API_KEY: 'server-opus-key' },
        waitUntil: vi.fn()
      });

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe('https://image.novelai.net/ai/encode-vibe');
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer pst-user-custom-key');
      // Verify decompression-conflicting & cookie headers were stripped
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(res.headers.get('content-length')).toBeNull();
      expect(res.headers.get('transfer-encoding')).toBeNull();
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('2. Resolution Validation & Paid Augment Guard', () => {
    it('should reject negative or sub-64 width/height that could bypass pixel-area checks', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      for (const dims of [
        { width: -100, height: 5000 },
        { width: 832, height: -64 },
        { width: 0, height: 1024 },
        { width: 32, height: 1024 }
      ]) {
        const res = await generateHandler({
          request: new Request('https://example.com/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': '1.2.3.4'
            },
            body: JSON.stringify({ version: 'v3', prompt: '1girl', ...dims })
          }),
          env: createGuestEnv(),
          waitUntil: vi.fn()
        });
        expect(res.status).toBe(400);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject bg-removal augment requests for restricted users', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const res = await augmentHandler({
        request: new Request('https://example.com/augment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '1.2.3.4'
          },
          body: JSON.stringify({
            req_type: 'bg-removal',
            image: RAW_PNG_B64,
            width: 512,
            height: 512
          })
        }),
        env: createGuestEnv(),
        waitUntil: vi.fn()
      });

      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('3. Recharge Optimistic Locking, User Status, & Card Rollback Protection', () => {
    it('should reject recharge if card credits changed concurrently between SELECT and UPDATE', async () => {
      const card = { card_key: 'CARD-RACE', credits: 10, is_used: 0, used_by_id: null };
      const user = { id: 1, username: 'alice', credits: 0, status: 'Approved' };

      const mockDb = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn((...args) => ({
            sql,
            args,
            first: vi.fn(async () => {
              if (sql.includes('FROM cards WHERE card_key = ?')) {
                const snapshot = { ...card };
                // Simulate concurrent x-user-key deduction right after SELECT
                card.credits -= 1;
                return snapshot;
              }
              if (sql.includes('FROM users WHERE id = ?')) return { ...user };
              return null;
            }),
            run: vi.fn(async () => {
              if (sql.includes('UPDATE cards SET is_used = 1') && sql.includes('AND credits = ?')) {
                const [usedById, cardKey, expectedCredits] = args;
                if (card.card_key === cardKey && card.is_used === 0 && card.credits === expectedCredits) {
                  card.is_used = 1;
                  card.credits = 0;
                  card.used_by_id = usedById;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              return { success: true, meta: { changes: 1 } };
            })
          }))
        })),
        batch: vi.fn()
      };

      const token = await signJwt({ id: 1, username: 'alice' }, JWT_SECRET);
      const res = await rechargeHandler({
        request: new Request('https://example.com/api/auth/recharge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ cardKey: 'CARD-RACE' })
        }),
        env: { DB: mockDb, JWT_SECRET }
      });

      expect(res.status).toBe(400);
      expect(mockDb.batch).not.toHaveBeenCalled();
      expect(user.credits).toBe(0);
    });

    it('should reject recharge for Banned users with HTTP 403', async () => {
      const mockDb = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM cards')) return { card_key: 'CARD-1', credits: 10, is_used: 0 };
              if (sql.includes('FROM users')) return { credits: 5, status: 'Banned' };
              return null;
            })
          }))
        }))
      };

      const token = await signJwt({ id: 9, username: 'banned' }, JWT_SECRET);
      const res = await rechargeHandler({
        request: new Request('https://example.com/api/auth/recharge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ cardKey: 'CARD-1' })
        }),
        env: { DB: mockDb, JWT_SECRET }
      });

      expect(res.status).toBe(403);
    });

    it('should guard card_credits rollback with AND used_by_id IS NULL', async () => {
      const executed = [];
      const env = {
        DB: {
          prepare: vi.fn((sql) => ({
            bind: vi.fn((...args) => ({
              run: vi.fn(async () => {
                executed.push({ sql, args });
                return { success: true };
              })
            }))
          }))
        }
      };

      await rollbackQuota({ type: 'card_credits', userKey: 'VIP-CARD-99' }, env);
      expect(executed).toHaveLength(1);
      expect(executed[0].sql).toContain('AND used_by_id IS NULL');
      expect(executed[0].args).toEqual(['VIP-CARD-99']);
    });
  });

  describe('4. Chat Proxy Redirect SSRF Block & Header Sanitization', () => {
    it('should block 3xx redirects from upstream AI endpoints with HTTP 403', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: 'http://169.254.169.254/latest/meta-data/' }
        })
      );
      global.fetch = fetchMock;

      const res = await chatProxyHandler({
        request: new Request('https://example.com/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: 'https://api.openai.com/v1/chat/completions',
            body: { model: 'gpt-4o-mini' }
          })
        }),
        env: {}
      });

      expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('重定向');
    });

    it('should strip content-encoding and content-length from proxied chat responses', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Encoding': 'br',
            'Content-Length': '12345',
            'Set-Cookie': 'a=b'
          }
        })
      );

      const res = await chatProxyHandler({
        request: new Request('https://example.com/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: 'https://api.openai.com/v1/chat/completions',
            body: {}
          })
        }),
        env: {}
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(res.headers.get('content-length')).toBeNull();
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('5. JWT Mandatory Expiration Claim', () => {
    it('should reject a validly HMAC-signed JWT that omits exp', async () => {
      const b64url = (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = b64url(JSON.stringify({ id: 1, username: 'noexp' }));
      const dataToSign = `${header}.${payload}`;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataToSign));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const tokenWithoutExp = `${dataToSign}.${sigB64}`;

      const verified = await verifyJwt(tokenWithoutExp, JWT_SECRET);
      expect(verified).toBeNull();
    });
  });

  describe('6. Notebook XSS Sanitization & Dockerfile Integrity', () => {
    it('should escape malicious note IDs and drop non-image preview URLs when rendering notes', () => {
      localStorage.clear();
      const container = { innerHTML: '' };
      const manager = new NotebookManager({ listContainerEl: container });
      manager.saveNotebookNotes('v3', [
        {
          id: `x');alert(1);//`,
          prompt: '1girl, <script>alert(1)</script>',
          negative: 'bad hands',
          preview: 'javascript:alert(1)" onerror="alert(2)',
          createdAt: Date.now()
        }
      ]);

      manager.render('v3');
      expect(container.innerHTML).not.toContain(`alert(1);//'`);
      expect(container.innerHTML).not.toContain('<script>');
      expect(container.innerHTML).not.toContain('javascript:alert');
      expect(container.innerHTML).not.toContain('onerror=');
    });

    it('should ensure Dockerfile does not reference missing .env.example and copies required assets', () => {
      const rootDir = path.resolve(process.cwd());
      const dockerfile = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
      expect(dockerfile).not.toContain('.env.example');
      expect(dockerfile).toContain('COPY classified_tags.json');
      expect(dockerfile).toContain('COPY gallery_index.json');
      expect(dockerfile).toContain('COPY presets');
      expect(dockerfile).toContain('USER node');
    });
  });
});
