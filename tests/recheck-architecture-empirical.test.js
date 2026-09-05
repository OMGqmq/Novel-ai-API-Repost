import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

class AppError extends Error {
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// ----------------------------------------------------------------------------
// EXTRACTED PATTERN 1 FROM BLUEPRINT
// ----------------------------------------------------------------------------
// ✅ AFTER: Unit-testable KeyRotatorService with EventBus notification and fault isolation
export class TypedEventBus {
    constructor() {
        this.listeners = new Map();
    }
    on(event, handler) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(handler);
        return () => this.listeners.get(event)?.delete(handler);
    }
    emit(event, payload) {
        // Wrap subscriber callbacks in try/catch to isolate errors and prevent aborting calling flows
        this.listeners.get(event)?.forEach(handler => {
            try {
                handler(payload);
            } catch (err) {
                console.error(`[EventBus] Error in listener for event "${event}":`, err);
            }
        });
    }
}
export const eventBus = new TypedEventBus();

export class KeyRotatorService {
    constructor(engine, store, bus = eventBus) {
        this.engine = engine;
        this.store = store;
        this.eventBus = bus;
    }

    getCustomKeys() {
        // Defensive string coercion prevents TypeError if store returns null or undefined
        const raw = String(this.store.getSetting('nai_custom_api_key', '') || '');
        return raw.split(/[\n,]/).map(k => k.trim()).filter(Boolean);
    }

    getAuthBase() {
        return {
            adminToken: this.store.getSetting('nai_admin_token', ''),
            userKey: this.store.getSetting('nai_user_key', ''),
            userToken: localStorage.getItem('nai_user_token') || ''
        };
    }

    async executeWithFailover(apiMethodName, params, startIndex = 0) {
        const keys = this.getCustomKeys();
        const authBase = this.getAuthBase();
        const candidateKeys = keys.length > 0
            ? keys.slice(startIndex % keys.length).concat(keys.slice(0, startIndex % keys.length))
            : [''];

        let lastError = null;
        for (let i = 0; i < candidateKeys.length; i++) {
            const key = candidateKeys[i];
            try {
                const auth = { ...authBase, customApiKey: key };
                const result = await this.engine[apiMethodName](params, auth);
                
                if (result?.userRole) {
                    this.eventBus.emit('CREDIT_UPDATED', result.userRole);
                }
                return result;
            } catch (err) {
                // Fast-fail immediately on client syntax/validation errors (400, 413, 422) without wasting keys
                if (err?.status === 400 || err?.status === 413 || err?.status === 422 || err?.message?.includes('400')) {
                    throw err;
                }
                console.warn(`[KeyRotator] Key attempt ${i + 1}/${candidateKeys.length} failed:`, err);
                lastError = err;
            }
        }
        throw new Error(lastError?.message || '所有配置的 API Key 均请求失败');
    }
}

// Clean usage in OutpaintEditor, InpaintEditor, or MainController:
// const result = await this.keyRotator.executeWithFailover('generate', params);

// ----------------------------------------------------------------------------
// EXTRACTED PATTERN 2 FROM BLUEPRINT (stitcher)
// ----------------------------------------------------------------------------
// ✅ AFTER: Pure, Promise-wrapped canvas stitcher with error handling, abort signal, and resource cleanup
export async function stitchImageOntoCanvas(canvas, newImageDataUrl, targetRect, options = {}) {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            return reject(new DOMException('Operation aborted by user', 'AbortError'));
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';

        const onAbort = () => {
            img.src = '';
            reject(new DOMException('Operation aborted by user', 'AbortError'));
        };

        if (options.signal) {
            options.signal.addEventListener('abort', onAbort, { once: true });
        }

        img.onload = () => {
            if (options.signal) options.signal.removeEventListener('abort', onAbort);
            try {
                const { roundX, roundY, targetW, targetH } = targetRect;
                const newCanvasX = Math.min(0, roundX);
                const newCanvasY = Math.min(0, roundY);
                const finalW = Math.max(canvas.width, roundX + targetW) - newCanvasX;
                const finalH = Math.max(canvas.height, roundY + targetH) - newCanvasY;

                // Mobile guard: iOS Safari WebKit crashes on canvases exceeding 16,777,216 pixels (4096 x 4096)
                if (finalW * finalH > 16777216) {
                    throw new RangeError(`Canvas pixel limit exceeded (${finalW}x${finalH} > 16MP threshold). Operation clamped for mobile stability.`);
                }

                // Offscreen double-buffer to guarantee atomic canvas blitting without clearing current canvas on crash
                const buffer = document.createElement('canvas');
                buffer.width = finalW;
                buffer.height = finalH;
                const bufferCtx = buffer.getContext('2d');
                if (!bufferCtx) throw new Error('Failed to acquire offscreen 2D canvas context');

                bufferCtx.drawImage(canvas, -newCanvasX, -newCanvasY);
                bufferCtx.drawImage(img, roundX - newCanvasX, roundY - newCanvasY, targetW, targetH);

                // Commit buffer to main canvas only after offscreen composition completes successfully
                canvas.width = finalW;
                canvas.height = finalH;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, finalW, finalH);
                ctx.drawImage(buffer, 0, 0);

                resolve({
                    dataUrl: canvas.toDataURL('image/png'),
                    offsetX: newCanvasX,
                    offsetY: newCanvasY
                });
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => {
            if (options.signal) options.signal.removeEventListener('abort', onAbort);
            reject(new Error("Canvas stitch failed: Unable to decode generated image asset."));
        };

        img.src = newImageDataUrl;
    });
}

// ----------------------------------------------------------------------------
// EXTRACTED PATTERN 3 FROM BLUEPRINT
// ----------------------------------------------------------------------------
// ✅ AFTER: Single atomic D1 batch transaction with SQL-level CAS conditional gates
export async function redeemCardAtomic(db, { userId, cardKey }) {
    const trimmedCardKey = cardKey.trim();

    // 1. Initial validation
    const card = await db.prepare(
        "SELECT credits, is_used FROM cards WHERE card_key = ?"
    ).bind(trimmedCardKey).first();

    if (!card) {
        throw new AppError("卡密不存在，请核对输入", 404, "CARD_NOT_FOUND");
    }
    if (card.is_used === 1) {
        throw new AppError("该卡密已被使用，请勿重复充值", 409, "CARD_ALREADY_USED");
    }

    const addedCredits = card.credits;

    // 2. Prepare atomic batch where subsequent statements are strictly conditional on cards update
    const claimCardStmt = db.prepare(`
        UPDATE cards 
        SET is_used = 1, 
            used_by_id = ?, 
            used_at = datetime('now', '+8 hours'), 
            updated_at = datetime('now', '+8 hours') 
        WHERE card_key = ? AND is_used = 0
    `).bind(userId, trimmedCardKey);

    // CRITICAL FIX: In SQLite / D1 db.batch(), a 0-row update does NOT abort the batch.
    // We MUST enforce (SELECT changes()) = 1 so user credits are updated ONLY if claimCardStmt updated 1 row!
    const addCreditsStmt = db.prepare(`
        UPDATE users 
        SET credits = credits + ?, 
            updated_at = datetime('now', '+8 hours') 
        WHERE id = ? AND (SELECT changes()) = 1
    `).bind(addedCredits, userId);

    // CRITICAL FIX: Only insert credit log if previous statements succeeded!
    const writeLogStmt = db.prepare(`
        INSERT INTO credit_logs (user_id, action, amount, description, created_at) 
        SELECT ?, 'recharge', ?, ?, datetime('now', '+8 hours')
        WHERE (SELECT changes()) = 1
    `).bind(userId, addedCredits, `充值卡密: ${trimmedCardKey}`);

    // 3. Execute all statements atomically in a single D1 RPC batch
    const batchResults = await db.batch([claimCardStmt, addCreditsStmt, writeLogStmt]);

    // Verify CAS gatekeeper: if claimCardStmt modified 0 rows, concurrent race lost
    if (!batchResults[0]?.meta?.changes || batchResults[0].meta.changes === 0) {
        throw new AppError("卡密已被并发使用，充值失败", 409, "CONCURRENT_REDEMPTION");
    }

    // 4. Query and return confirmed updated balance
    const updatedUser = await db.prepare("SELECT credits FROM users WHERE id = ?").bind(userId).first();
    return {
        success: true,
        addedCredits,
        currentCredits: updatedUser.credits
    };
}

// ----------------------------------------------------------------------------
// EXTRACTED PATTERN 4 FROM BLUEPRINT
// ----------------------------------------------------------------------------
// ✅ AFTER: Multi-key failover pool with native AbortSignal.timeout, 401/402/429 rotation, and 45s edge budget
export async function proxyNovelAIWithFailover(payload, targetUrl, { candidateKeys, timeoutPerKeyMs = 25000, maxTotalTimeoutMs = 45000 }) {
    if (!candidateKeys || candidateKeys.length === 0) {
        throw new AppError("未配置有效的 NovelAI API Key", 500, "CONFIG_ERROR");
    }

    const overallStart = Date.now();
    let lastError = null;

    for (let i = 0; i < candidateKeys.length; i++) {
        // Enforce total cumulative deadline before Cloudflare 50s subrequest/CPU execution limit
        const remainingBudget = maxTotalTimeoutMs - (Date.now() - overallStart);
        if (remainingBudget <= 3000) {
            throw new AppError("边缘网关超时预算耗尽，终止重试", 504, "GATEWAY_TIMEOUT");
        }

        const currentKey = candidateKeys[i];
        const keyTimeout = Math.min(timeoutPerKeyMs, remainingBudget);

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(keyTimeout) // Native V8 Edge Isolate timeout API
            });

            // Failover on Rate Limit (429), Quota Depletion (402), or Invalid/Expired Key (401)
            if (response.status === 429 || response.status === 402 || response.status === 401) {
                const errBody = await response.text().catch(() => '');
                console.warn(`[KeyPool] Key ...${currentKey.slice(-6)} failed with HTTP ${response.status}: ${errBody}. Rotating to next key...`);
                lastError = new AppError(`Key 故障 (${response.status})`, response.status, "UPSTREAM_KEY_FAILOVER");
                continue;
            }

            // Upstream transient server error (502/503/504): attempt next key if available
            if (response.status >= 500 && i < candidateKeys.length - 1) {
                const errBody = await response.text().catch(() => '');
                console.warn(`[KeyPool] Upstream ${response.status} on key ...${currentKey.slice(-6)}. Rotating to next key.`);
                lastError = new AppError(`上游暂态故障 (${response.status})`, response.status, "UPSTREAM_TEMPORARY_ERROR");
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown upstream error');
                throw new AppError(`NovelAI API Error: ${errorText}`, response.status, "UPSTREAM_ERROR");
            }

            return response; // Stream response directly to client

        } catch (err) {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                console.warn(`[KeyPool] Key ...${currentKey.slice(-6)} timed out after ${keyTimeout}ms.`);
                lastError = new AppError("NovelAI 上游响应超时", 504, "GATEWAY_TIMEOUT");
                // Allow attempting next key if time remains within total budget
                continue;
            }
            lastError = err;
            if (i < candidateKeys.length - 1) {
                console.warn(`[KeyPool] Network error on key ...${currentKey.slice(-6)}. Attempting next key.`);
                continue;
            }
        }
    }

    throw lastError || new AppError("所有配置的 NovelAI API Key 均已耗尽或请求失败", 503, "ALL_KEYS_FAILED");
}

// ----------------------------------------------------------------------------
// Cloudflare D1 Mock Engine wrapping SQLite DatabaseSync
// ----------------------------------------------------------------------------
class MockD1Database {
    constructor() {
        this.db = new DatabaseSync(':memory:');
        this.db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, credits INTEGER DEFAULT 0, updated_at TEXT); CREATE TABLE cards (card_key TEXT PRIMARY KEY, credits INTEGER, is_used INTEGER DEFAULT 0, used_by_id INTEGER, used_at TEXT, updated_at TEXT); CREATE TABLE credit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, amount INTEGER, description TEXT, created_at TEXT); INSERT INTO users (id, credits) VALUES (101, 10), (102, 0); INSERT INTO cards (card_key, credits, is_used) VALUES ('VIP-50-POINTS', 50, 0);");
    }

    prepare(sql) {
        const db = this.db;
        return {
            _sql: sql,
            _params: [],
            bind(...params) {
                this._params = params;
                return this;
            },
            async first() {
                const stmt = db.prepare(this._sql);
                const row = stmt.get(...this._params);
                return row || null;
            },
            async run() {
                const stmt = db.prepare(this._sql);
                const res = stmt.run(...this._params);
                return {
                    success: true,
                    meta: { changes: res.changes, last_row_id: Number(res.lastInsertRowid) }
                };
            }
        };
    }

    async batch(statements) {
        this.db.exec('BEGIN TRANSACTION');
        const results = [];
        try {
            for (const stmtObj of statements) {
                const prepared = this.db.prepare(stmtObj._sql);
                const res = prepared.run(...stmtObj._params);
                results.push({
                    success: true,
                    meta: { changes: res.changes, last_row_id: Number(res.lastInsertRowid) }
                });
            }
            this.db.exec('COMMIT');
            return results;
        } catch (err) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw err;
        }
    }
}

// ----------------------------------------------------------------------------
// EMPIRICAL TESTS
// ----------------------------------------------------------------------------
describe('Adversarial Verification of Remediated Blueprint Code Patterns', () => {

    describe('Pattern 3: D1 db.batch() Atomic CAS & Concurrency Safety', () => {
        let d1;

        beforeEach(() => {
            d1 = new MockD1Database();
        });

        it('3.1 Valid single redemption updates card, credits, and logs atomically', async () => {
            const res = await redeemCardAtomic(d1, { userId: 101, cardKey: 'VIP-50-POINTS' });
            expect(res.success).toBe(true);
            expect(res.addedCredits).toBe(50);
            expect(res.currentCredits).toBe(60);

            const user = await d1.prepare('SELECT credits FROM users WHERE id = 101').first();
            expect(user.credits).toBe(60);

            const card = await d1.prepare('SELECT is_used, used_by_id FROM cards WHERE card_key = ?').bind('VIP-50-POINTS').first();
            expect(card.is_used).toBe(1);
            expect(card.used_by_id).toBe(101);

            const log = await d1.prepare('SELECT * FROM credit_logs WHERE user_id = 101').first();
            expect(log.amount).toBe(50);
        });

        it('3.2 Sequential attempt to redeem already used card rejects with 409 CARD_ALREADY_USED', async () => {
            await redeemCardAtomic(d1, { userId: 101, cardKey: 'VIP-50-POINTS' });

            await expect(redeemCardAtomic(d1, { userId: 102, cardKey: 'VIP-50-POINTS' }))
                .rejects
                .toMatchObject({ status: 409, code: 'CARD_ALREADY_USED' });

            const user102 = await d1.prepare('SELECT credits FROM users WHERE id = 102').first();
            expect(user102.credits).toBe(0);
        });

        it('3.3 CAS Race Condition: (SELECT changes()) = 1 blocks double-spending if pre-check passed concurrently', async () => {
            // Simulate that two requests A and B both passed step 1 (pre-check) simultaneously.
            // Request A claimed the card:
            await d1.prepare('UPDATE cards SET is_used = 1, used_by_id = 101 WHERE card_key = ?').bind('VIP-50-POINTS').run();

            // Request B now executes its batch:
            const claimCardStmt = d1.prepare(
                "UPDATE cards SET is_used = 1, used_by_id = ?, used_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE card_key = ? AND is_used = 0"
            ).bind(102, 'VIP-50-POINTS');

            const addCreditsStmt = d1.prepare(
                "UPDATE users SET credits = credits + ?, updated_at = datetime('now', '+8 hours') WHERE id = ? AND (SELECT changes()) = 1"
            ).bind(50, 102);

            const writeLogStmt = d1.prepare(
                "INSERT INTO credit_logs (user_id, action, amount, description, created_at) SELECT ?, 'recharge', ?, ?, datetime('now', '+8 hours') WHERE (SELECT changes()) = 1"
            ).bind(102, 50, '充值卡密: VIP-50-POINTS');

            const batchResults = await d1.batch([claimCardStmt, addCreditsStmt, writeLogStmt]);

            // claimCardStmt updated 0 rows!
            expect(batchResults[0].meta.changes).toBe(0);
            // addCreditsStmt updated 0 rows because (SELECT changes()) was 0!
            expect(batchResults[1].meta.changes).toBe(0);
            // writeLogStmt inserted 0 rows because (SELECT changes()) was 0!
            expect(batchResults[2].meta.changes).toBe(0);

            // User 102 credits remain 0!
            const user102 = await d1.prepare('SELECT credits FROM users WHERE id = 102').first();
            expect(user102.credits).toBe(0);

            // No log inserted for user 102!
            const logs = d1.db.prepare('SELECT COUNT(*) as count FROM credit_logs WHERE user_id = 102').get();
            expect(logs.count).toBe(0);
        });

        it('3.4 High concurrency: 20 serialized attempts on single card grant exactly 50 credits', async () => {
            let success = 0;
            let failure = 0;
            for (let i = 0; i < 20; i++) {
                try {
                    await redeemCardAtomic(d1, { userId: 101, cardKey: 'VIP-50-POINTS' });
                    success++;
                } catch (e) {
                    failure++;
                }
            }
            expect(success).toBe(1);
            expect(failure).toBe(19);

            const user101 = await d1.prepare('SELECT credits FROM users WHERE id = 101').first();
            expect(user101.credits).toBe(60);
        });
    });

    describe('Pattern 1: KeyRotatorService & TypedEventBus', () => {
        beforeEach(() => {
            globalThis.localStorage = {
                getItem: vi.fn(() => ''),
                setItem: vi.fn()
            };
        });
        it('1.1 Coerces null custom API key safely without TypeError', async () => {
            const mockStore = {
                getSetting: vi.fn((key) => key === 'nai_custom_api_key' ? null : '')
            };
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ success: true })
            };
            const rotator = new KeyRotatorService(mockEngine, mockStore, new TypedEventBus());

            const res = await rotator.executeWithFailover('generate', {});
            expect(res.success).toBe(true);
            expect(mockEngine.generate).toHaveBeenCalledWith({}, expect.objectContaining({ customApiKey: '' }));
        });

        it('1.2 Fast-fails immediately on HTTP 400 Bad Request without burning keys', async () => {
            const mockStore = {
                getSetting: vi.fn((key) => key === 'nai_custom_api_key' ? 'key1,key2,key3' : '')
            };
            const badReq = { status: 400, message: 'Invalid prompt parameters' };
            const mockEngine = {
                generate: vi.fn().mockRejectedValue(badReq)
            };
            const rotator = new KeyRotatorService(mockEngine, mockStore, new TypedEventBus());

            await expect(rotator.executeWithFailover('generate', { prompt: 'bad' }))
                .rejects
                .toMatchObject({ status: 400 });

            expect(mockEngine.generate).toHaveBeenCalledTimes(1);
        });

        it('1.3 Isolates subscriber errors so CREDIT_UPDATED does not abort caller', async () => {
            const mockStore = {
                getSetting: vi.fn(() => 'key1')
            };
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ success: true, image: 'img_ok', userRole: { credits: 50 } })
            };
            const bus = new TypedEventBus();
            bus.on('CREDIT_UPDATED', () => {
                throw new Error('Subscriber component crashed');
            });
            const rotator = new KeyRotatorService(mockEngine, mockStore, bus);

            const res = await rotator.executeWithFailover('generate', {});
            expect(res.success).toBe(true);
            expect(res.image).toBe('img_ok');
        });
    });

    describe('Pattern 2: stitchImageOntoCanvas Safety & Lifecycle', () => {
        it('2.1 Pre-aborted signal aborts immediately', async () => {
            const canvas = { width: 512, height: 512 };
            const controller = new AbortController();
            controller.abort();

            await expect(stitchImageOntoCanvas(canvas, 'data:img', { roundX: 0, roundY: 0, targetW: 512, targetH: 512 }, { signal: controller.signal }))
                .rejects
                .toThrow('Operation aborted by user');
        });

        it('2.2 Mobile 16MP limit guard triggers RangeError', async () => {
            const canvas = { width: 4096, height: 4096 };
            const targetRect = { roundX: -1024, roundY: -1024, targetW: 5120, targetH: 5120 };

            const originalImage = globalThis.Image;
            globalThis.Image = class {
                constructor() {
                    setTimeout(() => this.onload && this.onload(), 10);
                }
            };

            try {
                await expect(stitchImageOntoCanvas(canvas, 'data:img', targetRect))
                    .rejects
                    .toThrow(/16MP threshold/);
            } finally {
                globalThis.Image = originalImage;
            }
        });
    });

    describe('Pattern 4: proxyNovelAIWithFailover Multi-Key Pool & Budget', () => {
        it('4.1 Rotates through 401, 402, 429 and succeeds on valid backup key', async () => {
            const mockFetch = vi.fn()
                .mockResolvedValueOnce({ status: 401, text: () => Promise.resolve('Expired') })
                .mockResolvedValueOnce({ status: 402, text: () => Promise.resolve('No Anlas') })
                .mockResolvedValueOnce({ status: 429, text: () => Promise.resolve('Rate limit') })
                .mockResolvedValueOnce({ status: 200, ok: true });

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            try {
                const res = await proxyNovelAIWithFailover(
                    { prompt: 'test' },
                    'https://api.novelai.net/generate',
                    { candidateKeys: ['k1', 'k2', 'k3', 'k4'] }
                );
                expect(res.ok).toBe(true);
                expect(mockFetch).toHaveBeenCalledTimes(4);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('4.2 Fast-fails with 504 when remaining budget is <= 3000ms', async () => {
            await expect(proxyNovelAIWithFailover(
                { prompt: 'test' },
                'https://api.novelai.net/generate',
                { candidateKeys: ['k1', 'k2'], maxTotalTimeoutMs: 2500 }
            )).rejects.toMatchObject({
                status: 504,
                code: 'GATEWAY_TIMEOUT'
            });
        });
    });
});
