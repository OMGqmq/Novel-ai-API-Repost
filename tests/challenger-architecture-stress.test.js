import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

// ============================================================================
// 1. PATTERN 1 STRESS HARNESS: KeyRotatorService & TypedEventBus
// ============================================================================

class TypedEventBus {
    constructor() {
        this.listeners = new Map();
    }
    on(event, handler) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(handler);
        return () => this.listeners.get(event)?.delete(handler);
    }
    emit(event, payload) {
        this.listeners.get(event)?.forEach(handler => handler(payload));
    }
}

class KeyRotatorService {
    constructor(engine, store, eventBus) {
        this.engine = engine;
        this.store = store;
        this.eventBus = eventBus;
    }

    getCustomKeys() {
        const raw = this.store.getSetting('nai_custom_api_key', '');
        return raw.split(new RegExp('[\n,]')).map(k => k.trim()).filter(Boolean);
    }

    getAuthBase() {
        return {
            adminToken: this.store.getSetting('nai_admin_token', ''),
            userKey: this.store.getSetting('nai_user_key', ''),
            userToken: ''
        };
    }

    async executeWithFailover(apiMethodName, params, startIndex = 0) {
        const raw = this.store.getSetting('nai_custom_api_key', '');
        const keys = raw.split(new RegExp('[\n,]')).map(k => k.trim()).filter(Boolean);
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
                    this.eventBus?.emit('CREDIT_UPDATED', result.userRole);
                }
                return result;
            } catch (err) {
                lastError = err;
            }
        }
        throw new Error(lastError?.message || '????? API Key ?????');
    }
}

// ============================================================================
// 2. PATTERN 2 STRESS HARNESS: stitchImageOntoCanvas
// ============================================================================

async function stitchImageOntoCanvas(canvas, newImageDataUrl, targetRect, options = {}) {
    return new Promise((resolve, reject) => {
        const img = options.mockImage || {
            crossOrigin: '',
            src: '',
            onload: null,
            onerror: null
        };
        img.crossOrigin = 'anonymous';

        const triggerLoad = () => {
            try {
                const { roundX, roundY, targetW, targetH } = targetRect;
                const newCanvasX = Math.min(0, roundX);
                const newCanvasY = Math.min(0, roundY);
                const finalW = Math.max(canvas.width, roundX + targetW) - newCanvasX;
                const finalH = Math.max(canvas.height, roundY + targetH) - newCanvasY;

                // Memory stress check: mobile canvas limits (iOS Safari: max 16,777,216 px)
                if (finalW * finalH > 16777216) {
                    throw new RangeError('Canvas pixel limit exceeded (iOS WebKit 16MP crash threshold)');
                }

                // Destructive mutation: in HTML5 Canvas, setting width clears all existing contents
                canvas.width = finalW;
                canvas.height = finalH;

                if (options.simulatedContextCrash) {
                    throw new Error('WebGL/2D Context lost during drawImage');
                }

                resolve({
                    dataUrl: 'data:image/png;base64,stitched',
                    offsetX: newCanvasX,
                    offsetY: newCanvasY
                });
            } catch (err) {
                reject(err);
            }
        };

        const triggerError = () => {
            reject(new Error('Canvas stitch failed: Unable to decode generated image asset.'));
        };

        if (options.immediateError) {
            triggerError();
        } else {
            triggerLoad();
        }
    });
}

// ============================================================================
// 3. TEST SUITE
// ============================================================================

describe('Challenger 2 Empirical Stress Tests: Blueprint Refactoring Patterns', () => {

    describe('Pattern 1: KeyRotatorService Stress Tests', () => {
        it('1.1 Malformed key: throws unhandled TypeError if store returns null', async () => {
            const mockStore = {
                getSetting: vi.fn((key) => {
                    if (key === 'nai_custom_api_key') return null;
                    return '';
                })
            };
            const rotator = new KeyRotatorService({}, mockStore, new TypedEventBus());
            
            await expect(rotator.executeWithFailover('generate', {}))
                .rejects
                .toThrow(TypeError);
        });

        it('1.2 Empty candidate list: falls back to empty key attempt and succeeds if server key is used', async () => {
            const mockStore = {
                getSetting: vi.fn((key, def) => def)
            };
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ success: true })
            };
            const rotator = new KeyRotatorService(mockEngine, mockStore, new TypedEventBus());
            
            const result = await rotator.executeWithFailover('generate', { prompt: 'test' });
            expect(result.success).toBe(true);
            expect(mockEngine.generate).toHaveBeenCalledWith(
                { prompt: 'test' },
                expect.objectContaining({ customApiKey: '' })
            );
        });

        it('1.3 HTTP 400 Bad Request: blindly rotates all keys instead of fast-failing', async () => {
            const mockStore = {
                getSetting: vi.fn((key) => key === 'nai_custom_api_key' ? 'key1,key2,key3' : '')
            };
            const badRequestError = new Error('HTTP 400: Prompt token limit exceeded');
            const mockEngine = {
                generate: vi.fn().mockRejectedValue(badRequestError)
            };
            const rotator = new KeyRotatorService(mockEngine, mockStore, new TypedEventBus());
            
            await expect(rotator.executeWithFailover('generate', { prompt: 'invalid' }))
                .rejects
                .toThrow('HTTP 400: Prompt token limit exceeded');

            // Flaw: KeyRotatorService tried all 3 keys for a client-side syntax error!
            expect(mockEngine.generate).toHaveBeenCalledTimes(3);
        });

        it('1.4 EventBus listener exception: unhandled error in consumer drops generated image result', async () => {
            const mockStore = {
                getSetting: vi.fn((key) => key === 'nai_custom_api_key' ? 'key1' : '')
            };
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ success: true, userRole: { credits: 100 } })
            };
            const bus = new TypedEventBus();
            bus.on('CREDIT_UPDATED', () => {
                throw new Error('DOM update crashed in consumer');
            });

            const rotator = new KeyRotatorService(mockEngine, mockStore, bus);

            await expect(rotator.executeWithFailover('generate', {}))
                .rejects
                .toThrow('DOM update crashed in consumer');
        });

        it('1.5 Negative startIndex: handles slice math without crashing but risks unexpected rotation', async () => {
            const mockStore = {
                getSetting: vi.fn((key) => key === 'nai_custom_api_key' ? 'keyA,keyB,keyC' : '')
            };
            const mockEngine = {
                generate: vi.fn().mockResolvedValue({ success: true })
            };
            const rotator = new KeyRotatorService(mockEngine, mockStore, new TypedEventBus());
            
            await rotator.executeWithFailover('generate', {}, -1);
            expect(mockEngine.generate).toHaveBeenCalledWith(
                {},
                expect.objectContaining({ customApiKey: 'keyC' })
            );
        });
    });

    describe('Pattern 3: Cloudflare D1 db.batch() Real SQLite Atomicity & Double-Spend Hazard', () => {
        it('3.1 CRITICAL VULNERABILITY: SQLite batch commits credit update even when card UPDATE affects 0 rows', () => {
            const db = new DatabaseSync(':memory:');

            db.exec(`
                CREATE TABLE users (id INTEGER PRIMARY KEY, credits INTEGER DEFAULT 0);
                CREATE TABLE cards (card_key TEXT PRIMARY KEY, credits INTEGER, is_used INTEGER DEFAULT 0, used_by_id INTEGER);
                CREATE TABLE credit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, amount INTEGER, description TEXT);

                INSERT INTO users (id, credits) VALUES (101, 10), (102, 0);
                INSERT INTO cards (card_key, credits, is_used) VALUES ('VIP-50-POINTS', 50, 0);
            `);

            // Step 1: User 101 legitimately claims the card
            db.exec('BEGIN TRANSACTION');
            const claim1 = db.prepare("UPDATE cards SET is_used = 1, used_by_id = ? WHERE card_key = ? AND is_used = 0").run(101, 'VIP-50-POINTS');
            const cred1 = db.prepare("UPDATE users SET credits = credits + 50 WHERE id = ?").run(101);
            const log1 = db.prepare("INSERT INTO credit_logs (user_id, action, amount, description) VALUES (?, 'recharge', 50, 'claim')").run(101);
            db.exec('COMMIT');

            expect(claim1.changes).toBe(1);
            expect(cred1.changes).toBe(1);

            const user101 = db.prepare('SELECT credits FROM users WHERE id = 101').get();
            expect(user101.credits).toBe(60);

            // Step 2: User 102 attempts concurrent claim with the exact D1 db.batch() pattern proposed in blueprint
            db.exec('BEGIN TRANSACTION');
            const claim2 = db.prepare("UPDATE cards SET is_used = 1, used_by_id = ? WHERE card_key = ? AND is_used = 0").run(102, 'VIP-50-POINTS');
            const cred2 = db.prepare("UPDATE users SET credits = credits + 50 WHERE id = ?").run(102);
            const log2 = db.prepare("INSERT INTO credit_logs (user_id, action, amount, description) VALUES (?, 'recharge', 50, 'claim')").run(102);
            db.exec('COMMIT');

            // EMPIRICAL VERIFICATION OF DOUBLE SPEND:
            expect(claim2.changes).toBe(0); // Card was NOT updated
            expect(cred2.changes).toBe(1);  // User 102's credits WERE incremented!

            const user102 = db.prepare('SELECT credits FROM users WHERE id = 102').get();
            expect(user102.credits).toBe(50); // DOUBLE-SPEND: User 102 got 50 unearned credits!

            const totalLogs = db.prepare('SELECT COUNT(*) as count FROM credit_logs').get();
            expect(totalLogs.count).toBe(2); // Two logs written for one card!
        });

        it('3.2 RIGOROUS ORACLE: Demonstrates the robust, non-vulnerable conditional SQL batch pattern', () => {
            const db = new DatabaseSync(':memory:');
            db.exec(`
                CREATE TABLE users (id INTEGER PRIMARY KEY, credits INTEGER DEFAULT 0);
                CREATE TABLE cards (card_key TEXT PRIMARY KEY, credits INTEGER, is_used INTEGER DEFAULT 0, used_by_id INTEGER);
                INSERT INTO users (id, credits) VALUES (101, 10), (102, 0);
                INSERT INTO cards (card_key, credits, is_used) VALUES ('VIP-VALID', 50, 0);
            `);

            db.exec(`
                CREATE TRIGGER check_card_before_update
                BEFORE UPDATE ON cards
                FOR EACH ROW
                WHEN OLD.is_used = 1 AND NEW.is_used = 1
                BEGIN
                    SELECT RAISE(ABORT, 'CARD_ALREADY_USED');
                END;
            `);

            // Claim 1: succeeds
            db.exec('BEGIN TRANSACTION');
            db.prepare("UPDATE cards SET is_used = 1, used_by_id = 101 WHERE card_key = 'VIP-VALID'").run();
            db.prepare("UPDATE users SET credits = credits + 50 WHERE id = 101").run();
            db.exec('COMMIT');

            // Claim 2: fails with SQL error, causing SQLite to rollback the entire batch!
            expect(() => {
                db.exec('BEGIN TRANSACTION');
                try {
                    db.prepare("UPDATE cards SET is_used = 1, used_by_id = 102 WHERE card_key = 'VIP-VALID'").run();
                    db.prepare("UPDATE users SET credits = credits + 50 WHERE id = 102").run();
                    db.exec('COMMIT');
                } catch (err) {
                    db.exec('ROLLBACK');
                    throw err;
                }
            }).toThrow(/CARD_ALREADY_USED/);

            const user102 = db.prepare('SELECT credits FROM users WHERE id = 102').get();
            expect(user102.credits).toBe(0);
        });
    });

    describe('Pattern 2: Canvas stitchImageOntoCanvas Stress Tests', () => {
        it('2.1 Corrupted image blob: rejects immediately on load failure', async () => {
            const canvas = { width: 512, height: 512 };
            await expect(stitchImageOntoCanvas(canvas, 'corrupted_blob_data', { roundX: 0, roundY: 0, targetW: 512, targetH: 512 }, { immediateError: true }))
                .rejects
                .toThrow('Canvas stitch failed: Unable to decode generated image asset.');
        });

        it('2.2 Mobile canvas memory explosion: throws RangeError when exceeding 16MP threshold', async () => {
            const canvas = { width: 4096, height: 4096 };
            const targetRect = { roundX: -1024, roundY: -1024, targetW: 5120, targetH: 5120 };

            await expect(stitchImageOntoCanvas(canvas, 'valid_data', targetRect))
                .rejects
                .toThrow('Canvas pixel limit exceeded (iOS WebKit 16MP crash threshold)');
        });

        it('2.3 Irreversible canvas wiping: setting canvas.width clears canvas buffer before drawing completes', async () => {
            let bufferWiped = false;
            const canvas = {
                _w: 512,
                _h: 512,
                get width() { return this._w; },
                set width(val) {
                    this._w = val;
                    bufferWiped = true;
                },
                get height() { return this._h; },
                set height(val) { this._h = val; }
            };

            await expect(stitchImageOntoCanvas(canvas, 'valid_data', { roundX: 0, roundY: 0, targetW: 512, targetH: 512 }, { simulatedContextCrash: true }))
                .rejects
                .toThrow('WebGL/2D Context lost during drawImage');

            expect(bufferWiped).toBe(true);
        });
    });
});