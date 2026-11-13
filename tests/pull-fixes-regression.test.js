import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { D1Adapter } from '../d1-adapter.js';
import { isPrivateOrLocalHost, onRequest as chatProxyHandler } from '../functions/api/chat-proxy.js';
import { signJwt } from '../functions/_crypto-helper.js';
import { AiHelperService } from '../src/ai-helper-service.js';
import { AiChatManager } from '../src/ai-chat-manager.js';
import { getApiBaseUrl, setApiBaseUrl } from '../src/api-config.js';
import { VibeManager } from '../src/vibe-manager.js';
import { UIController } from '../src/ui.js';
import { OutpaintEditor } from '../src/outpaint.js';
import { InpaintEditor } from '../src/inpaint.js';
import { PromptHelper } from '../src/prompt-helper.js';

function createMockStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getSetting: (k, def = '') => (map.has(k) ? map.get(k) : def),
    setSetting: (k, v) => { map.set(k, String(v)); },
    _map: map
  };
}

function createNodeResCapture() {
  const headers = new Map();
  const chunks = [];
  return {
    statusCode: 200,
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    setHeader(k, v) {
      headers.set(k.toLowerCase(), v);
    },
    getHeader(k) {
      return headers.get(k.toLowerCase());
    },
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) this.write(chunk);
      this.writableEnded = true;
    },
    once() {},
    removeListener() {},
    bodyText() {
      return Buffer.concat(chunks).toString('utf8');
    },
    headers
  };
}

describe('Pulled Revision & Frontend Regression Fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.CSS;
    localStorage.clear();
  });

  describe('D1Adapter SQLite concurrency & RETURNING/comment handling', () => {
    it('executes concurrent batch() calls without transaction overlap errors', async () => {
      const db = new D1Adapter(':memory:');
      await db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, qty INTEGER NOT NULL);');
      await db.prepare('INSERT INTO items (qty) VALUES (?)').bind(100).run();

      const tasks = Array.from({ length: 12 }, (_, idx) =>
        db.batch([
          db.prepare('UPDATE items SET qty = qty - 1 WHERE id = ?').bind(1),
          db.prepare('SELECT qty FROM items WHERE id = ?').bind(1),
          idx % 2 === 0 ? db.prepare('SELECT qty + 0 AS checkVal FROM items WHERE id = ?').bind(1) : null
        ])
      );

      const allResults = await Promise.all(tasks);
      expect(allResults).toHaveLength(12);
      const row = await db.prepare('SELECT qty FROM items WHERE id = ?').bind(1).first();
      expect(row.qty).toBe(88);
      db.close();
    });

    it('detects leading SQL comments and RETURNING clauses in execute() while ignoring quoted "returning"', async () => {
      const db = new D1Adapter(':memory:');
      await db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT);');

      const insRet = await db.prepare('INSERT INTO notes (body) VALUES (?) RETURNING id, body').bind('hello').execute();
      expect(insRet.results).toEqual([{ id: 1, body: 'hello' }]);

      const commentedSelect = await db.prepare('-- lead comment\n/* multi\nline */ SELECT body FROM notes WHERE id = ?').bind(1).execute();
      expect(commentedSelect.results).toEqual([{ body: 'hello' }]);

      const quotedLiteral = await db.prepare("INSERT INTO notes (body) VALUES ('returning soon')").execute();
      expect(quotedLiteral.meta.changes).toBe(1);
      db.close();
    });
  });

  describe('server.js security & HTTP robustness', () => {
    it('blocks sensitive dotfiles, SQLite DB, and backend source via static allowlist while allowing public assets', async () => {
      const srvMod = await import('../server.js');
      expect(srvMod.env.JWT_SECRET).not.toBe('nai-server-secret-change-in-env');
      expect(srvMod.env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);

      const sensitivePaths = [
        '/.env',
        '/server.js',
        '/d1-adapter.js',
        '/init_db.sql',
        '/package.json',
        '/data/nai.db',
        '/functions/api/chat-proxy.js',
        '/tests/setup.js',
        '/%2e%2e/.env',
        '/src/%2e%2e/server.js',
        '/src/.secret'
      ];

      for (const p of sensitivePaths) {
        const res = createNodeResCapture();
        const handled = srvMod.serveStaticFile({ method: 'GET' }, res, p);
        expect(handled, `expected handled 403 for ${p}`).toBe(true);
        expect(res.statusCode, `expected 403 for ${p}`).toBe(403);
      }

      const missingPublicRes = createNodeResCapture();
      const handledMissing = srvMod.serveStaticFile({ method: 'GET' }, missingPublicRes, '/src/__does_not_exist__.js');
      expect(handledMissing).toBe(false);

      const resolvedIdx = srvMod.resolvePublicStaticFile('/');
      expect(resolvedIdx.status).toBe(200);
      expect(resolvedIdx.filePath?.endsWith('index.html')).toBe(true);
    });

    it('strips untrusted x-real-ip/CF-Connecting-IP when TRUST_PROXY is off and rejects oversized bodies / bad URLs', async () => {
      const srvMod = await import('../server.js');

      const fakeReq = Readable.from([]);
      fakeReq.method = 'GET';
      fakeReq.url = '/generate';
      fakeReq.headers = {
        host: 'bad host header',
        'x-real-ip': '8.8.8.8',
        'cf-connecting-ip': '1.1.1.1',
        'x-forwarded-for': '9.9.9.9'
      };
      fakeReq.socket = { remoteAddress: '10.20.30.40' };

      const webReq = await srvMod.nodeToWebRequest(fakeReq, fakeReq.headers.host);
      expect(webReq.headers.get('x-real-ip')).toBe('10.20.30.40');
      expect(webReq.headers.get('CF-Connecting-IP')).toBe('10.20.30.40');
      expect(webReq.headers.get('x-forwarded-for')).toBeNull();
      expect(webReq.url).toContain('http://localhost:');

      // Bad protocol-relative URL returns 400
      const badUrlRes = createNodeResCapture();
      await srvMod.handleHttpRequest({ method: 'GET', url: '//evil.com/.env', headers: {}, socket: {} }, badUrlRes);
      expect(badUrlRes.statusCode).toBe(400);

      // Oversized Content-Length on registered route returns 413 cleanly
      const bigBodyReq = Readable.from([]);
      bigBodyReq.method = 'POST';
      bigBodyReq.url = '/generate';
      bigBodyReq.headers = { 'content-length': String(srvMod.MAX_BODY_BYTES + 1024), host: 'localhost:3000' };
      bigBodyReq.socket = { remoteAddress: '127.0.0.1' };
      const bigRes = createNodeResCapture();
      await srvMod.handleHttpRequest(bigBodyReq, bigRes);
      expect(bigRes.statusCode).toBe(413);
    });
  });

  describe('chat-proxy SSRF, user status verification, & AiHelperService auth forwarding', () => {
    it('blocks bracketed IPv6 local/ULA/link-local/IPv4-mapped literals & CGNAT while allowing public hosts', () => {
      expect(isPrivateOrLocalHost('[::1]')).toBe(true);
      expect(isPrivateOrLocalHost('[::]')).toBe(true);
      expect(isPrivateOrLocalHost('[fe80::1]')).toBe(true);
      expect(isPrivateOrLocalHost('[fe80::1%eth0]')).toBe(true);
      expect(isPrivateOrLocalHost('[fc00::1]')).toBe(true);
      expect(isPrivateOrLocalHost('[fd12:3456:789a::1]')).toBe(true);
      expect(isPrivateOrLocalHost('[::ffff:127.0.0.1]')).toBe(true);
      expect(isPrivateOrLocalHost('[::ffff:169.254.169.254]')).toBe(true);
      expect(isPrivateOrLocalHost('[::ffff:7f00:1]')).toBe(true);
      expect(isPrivateOrLocalHost('localhost.')).toBe(true);
      expect(isPrivateOrLocalHost('100.64.0.1')).toBe(true);

      expect(isPrivateOrLocalHost('api.openai.com')).toBe(false);
      expect(isPrivateOrLocalHost('[2606:4700::1111]')).toBe(false);
    });

    it('rejects revoked/banned JWT users on custom endpoints when env.DB is attached', async () => {
      const db = new D1Adapter(':memory:');
      await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, status TEXT);');
      await db.prepare('INSERT INTO users (id, username, status) VALUES (?, ?, ?)').bind(7, 'banned_u', 'Banned').run();

      const secret = 'test-secret-key-123';
      const token = await signJwt({ id: 7, username: 'banned_u', role: 'vip' }, secret);

      const req = new Request('https://example.com/api/chat-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint: 'https://custom-llm.example.org/v1/chat/completions', apiKey: 'k', body: {} })
      });

      const res = await chatProxyHandler({ request: req, env: { JWT_SECRET: secret, DB: db } });
      expect(res.status).toBe(403);
      db.close();
    });

    it('forwards x-admin-token & Authorization Bearer userToken on /api/chat-proxy CORS fallback', async () => {
      const store = createMockStore({
        ai_helper_base_url: 'https://custom-ai.example.org/v1',
        ai_helper_api_key: 'sk-llm',
        ai_helper_model: 'custom-model',
        nai_admin_token: 'adm-secret',
        nai_user_token: 'jwt-user-tok'
      });
      const svc = new AiHelperService(store);

      const calls = [];
      vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        calls.push({ url, init });
        if (calls.length % 2 === 1) {
          throw new TypeError('Failed to fetch (CORS)');
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: 'fallback ok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }));

      const reply = await svc.chat([{ role: 'user', content: 'hi' }]);
      expect(reply).toBe('fallback ok');
      expect(calls).toHaveLength(2);
      expect(calls[1].url).toBe('/api/chat-proxy');
      expect(calls[1].init.headers['x-admin-token']).toBe('adm-secret');
      expect(calls[1].init.headers['Authorization']).toBe('Bearer jwt-user-tok');

      const enhanced = await svc.generatePrompt('girl in rain');
      expect(enhanced).toBe('fallback ok');
      expect(calls).toHaveLength(4);
      expect(calls[3].url).toBe('/api/chat-proxy');
      expect(calls[3].init.headers['x-admin-token']).toBe('adm-secret');
      expect(calls[3].init.headers['Authorization']).toBe('Bearer jwt-user-tok');
    });
  });

  describe('API URL scheme validation & VibeManager fixes', () => {
    it('rejects non-HTTP(S) backend server URLs cleanly', () => {
      globalThis.window = {};
      expect(() => setApiBaseUrl('javascript:alert(1)')).toThrow();
      expect(() => setApiBaseUrl('data:text/html,<script>1</script>')).toThrow();
      localStorage.setItem('nai_backend_url', 'javascript:alert(2)');
      expect(getApiBaseUrl()).toBe('');

      setApiBaseUrl('https://backend.example.com/');
      expect(getApiBaseUrl()).toBe('https://backend.example.com');
    });

    it('isolates cached encodings per image fingerprint and resets stale rawImageBase64 on JSON import', async () => {
      const store = createMockStore();
      const vm = new VibeManager({ store });

      const rawImgA = 'iVBORw0KGgo' + 'A'.repeat(120);
      const rawImgB = 'iVBORw0KGgo' + 'B'.repeat(120);
      vm.setCachedEncoding(rawImgA, 0.8, 'ENC_FROM_A');

      vm.rawImageBase64 = rawImgB;
      vm.currentVibeImageBase64 = rawImgB;
      vm.setCachedEncoding(rawImgB, 0.6, 'ENC_FROM_B');

      const docB = vm.buildDocFromCurrentState('v4.5');
      const entries = Object.values(docB.encodings['v4-5full']);
      expect(entries).toHaveLength(1);
      expect(entries[0].encoding).toBe('ENC_FROM_B');

      vm.rawImageBase64 = rawImgB;
      await vm.handleVibeImage({
        target: {
          files: [{
            name: 'bundle.nai4vibe',
            slice: () => ({ text: async () => '{"identifier":' }),
            text: async () => JSON.stringify({
              identifier: 'novelai-vibe-transfer',
              version: 1,
              encodings: {
                v4full: {
                  k1: { encoding: 'V4_LEGACY_TOK', params: { information_extracted: 0.7 } }
                }
              }
            })
          }]
        }
      }, 'v4.5');

      expect(vm.rawImageBase64).toBeNull();
      expect(vm.currentVibeIsJson).toBe(true);
      expect(vm.getCachedEncoding(null, 0.7)).toBe('V4_LEGACY_TOK');

      const alerts = [];
      vi.stubGlobal('alert', (m) => alerts.push(m));
      vm.exportNai4Vibe('v4.5');
      expect(alerts).toEqual([]);
    });

    it('preserves savedVibeIsJson=false on loadState & detects MIME types accurately', () => {
      const pngB64 = 'iVBORw0KGgoAAAANS';
      const store = createMockStore({
        nai_vibe_doc_summary_v4: JSON.stringify({
          id: 'doc1',
          encodings: { 'v4-5full': { k: { encoding: 'TOK1', params: { information_extracted: 1.0 } } } }
        }),
        nai_vibe_image_v4: 'TOK1',
        nai_vibe_raw_image_v4: pngB64,
        nai_vibe_is_json_v4: 'false',
        nai_vibe_enabled_v4: 'true'
      });

      const previewImg = { src: '', classList: { add: vi.fn(), remove: vi.fn() } };
      globalThis.document = {
        getElementById: (id) => (id === 'vibeImagePreview' ? previewImg : null)
      };

      const vm = new VibeManager({ store });
      vm.loadState('v4.5');

      expect(vm.currentVibeIsJson).toBe(false);
      expect(previewImg.src.startsWith('data:image/png;base64,')).toBe(true);

      vm.currentVibeIsJson = true;
      vm.currentVibeDoc = { id: 'doc2', image: pngB64, encodings: { 'v4-5full': {} } };
      vm.rawImageBase64 = pngB64;
      vm.currentVibeImageBase64 = pngB64;
      expect(vm.needsV45Encoding('v4.5')).toBe(true);
    });
  });

  describe('Frontend Modernizations & Lifecycle Hooks', () => {
    it('guards tagSearchInput Enter keydown during IME composition (isComposing / keyCode 229)', () => {
      const listeners = {};
      const searchBtn = { click: vi.fn(), onclick: null };
      const searchInput = {
        value: '青',
        addEventListener: (ev, fn) => { listeners[ev] = fn; }
      };

      PromptHelper.prototype.bindSearchEvents.call({
        searchInputEl: searchInput,
        searchBtnEl: searchBtn,
        searchResultsEl: null,
        tagArray: []
      });

      listeners.keydown({ key: 'Enter', isComposing: true, keyCode: 13, preventDefault: vi.fn() });
      listeners.keydown({ key: 'Enter', isComposing: false, keyCode: 229, preventDefault: vi.fn() });
      expect(searchBtn.click).not.toHaveBeenCalled();

      const preventDefault = vi.fn();
      listeners.keydown({ key: 'Enter', isComposing: false, keyCode: 13, preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(searchBtn.click).toHaveBeenCalledTimes(1);
    });

    it('skips JS scrollHeight resize in AiChatManager when CSS field-sizing: content is supported', () => {
      const inputHandlers = {};
      const inputEl = {
        value: 'hello',
        scrollHeight: 90,
        style: { height: '' },
        addEventListener: (ev, fn) => { inputHandlers[ev] = fn; },
        focus: vi.fn()
      };
      globalThis.document = {
        getElementById: (id) => (id === 'aiChatInput' ? inputEl : null)
      };

      // Native field-sizing supported -> no JS input resize listener or height mutation
      globalThis.CSS = { supports: (prop, val) => prop === 'field-sizing' && val === 'content' };
      const nativeMgr = new AiChatManager({ service: {} });
      expect(inputHandlers.input).toBeUndefined();
      nativeMgr.setPromptInput('updated');
      expect(inputEl.style.height).toBe('');

      // Fallback when field-sizing unsupported -> attaches input handler and updates height
      globalThis.CSS = { supports: () => false };
      const fallbackMgr = new AiChatManager({ service: {} });
      expect(typeof inputHandlers.input).toBe('function');
      inputHandlers.input();
      expect(inputEl.style.height).toBe('90px');
    });

    it('keeps color-scheme meta & system reset synchronized in UIController', () => {
      const metaEl = { content: 'light dark', setAttribute(k, v) { if (k === 'content') this.content = v; } };
      const classSet = new Set();
      globalThis.document = {
        documentElement: {
          classList: {
            add: (c) => classSet.add(c),
            remove: (c) => classSet.delete(c),
            contains: (c) => classSet.has(c)
          }
        },
        getElementById: () => null,
        querySelector: (sel) => (sel === 'meta[name="color-scheme"]' ? metaEl : null),
        querySelectorAll: () => [],
        addEventListener: () => {}
      };
      globalThis.window = {
        matchMedia: () => ({ matches: false, addEventListener: vi.fn() }),
        addEventListener: vi.fn()
      };

      const ui = new UIController({});
      ui.initTheme();
      expect(metaEl.content).toBe('light dark');

      ui.toggleTheme();
      expect(localStorage.getItem('color-theme')).toBe('dark');
      expect(metaEl.content).toBe('dark');

      ui.resetThemeToSystem();
      expect(localStorage.getItem('color-theme')).toBeNull();
      expect(metaEl.content).toBe('light dark');
      expect(classSet.has('dark')).toBe(false);
    });

    it('runs prepareBeforeGenerate before OutpaintEditor and InpaintEditor dispatch engine.generate & syncs toolbar a11y', async () => {
      const btnAttrs = new Map();
      const innerEl = { classList: { add: vi.fn(), remove: vi.fn() }, inert: false };
      const btnEl = {
        classList: { add: vi.fn(), remove: vi.fn() },
        setAttribute: (k, v) => btnAttrs.set(k, v)
      };

      const fakeCanvas = {
        width: 512,
        height: 512,
        getContext: () => ({
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          fillStyle: '',
          globalCompositeOperation: 'source-over',
          getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) })
        }),
        toDataURL: () => 'data:image/png;base64,AAAA'
      };

      globalThis.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      globalThis.document = {
        getElementById: (id) => {
          if (id === 'outpaintToolbarInner') return innerEl;
          if (id === 'outpaintToolbarToggleBtn') return btnEl;
          if (id === 'modelValue') return { value: 'v4.5' };
          return null;
        },
        createElement: () => ({
          width: 512,
          height: 512,
          getContext: () => ({
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            fillStyle: '',
            globalCompositeOperation: 'source-over',
            imageSmoothingEnabled: false,
            getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
            putImageData: vi.fn()
          }),
          toDataURL: () => 'data:image/png;base64,BBBB'
        })
      };

      const order = [];
      const editor = new OutpaintEditor({
        engine: {
          generate: vi.fn(async () => {
            order.push('generate');
            throw new Error('stop_after_verify');
          })
        },
        store: createMockStore({ nai_custom_api_key: 'k1' }),
        getExtraParams: () => {
          order.push('getExtraParams');
          return { vibe_image: 'ENCODED_V45' };
        },
        prepareBeforeGenerate: vi.fn(async (model, auths, hasKey) => {
          order.push(`prepare:${model}:${auths.length}:${hasKey}`);
        })
      });

      editor.toggleToolbar(false);
      expect(btnAttrs.get('aria-expanded')).toBe('false');
      expect(innerEl.inert).toBe(true);

      editor.els.canvas = fakeCanvas;
      editor.els.maskCanvas = fakeCanvas;
      editor.selection = { x: 0, y: 0, w: 512, h: 512 };
      editor.isOpen = true;
      vi.stubGlobal('alert', () => {});
      await editor.generate();
      expect(order).toEqual(['prepare:v4.5:1:true', 'getExtraParams', 'generate']);

      // InpaintEditor prepareBeforeGenerate ordering check
      const inpaintOrder = [];
      const inpaintEditor = new InpaintEditor({
        ui: { setLoading: vi.fn(), showResultImages: vi.fn(), focusImage: vi.fn() },
        engine: {
          generate: vi.fn(async (params) => {
            inpaintOrder.push(`inpaint-generate:${params.vibe_image}`);
            throw new Error('stop_inpaint');
          })
        },
        store: createMockStore({ nai_custom_api_key: 'k1' }),
        prepareBeforeGenerate: vi.fn(async (model, auths, hasKey) => {
          inpaintOrder.push(`inpaint-prepare:${model}:${auths.length}:${hasKey}`);
        }),
        getExtraParams: () => {
          inpaintOrder.push('inpaint-getExtraParams');
          return { vibe_image: 'ENCODED_INPAINT_V45' };
        }
      });
      inpaintEditor._hasPaintedMask = () => true;
      inpaintEditor._exportMaskAsBase64 = () => 'MASK_B64';
      inpaintEditor._exportBaseImageAsBase64 = async () => 'IMG_B64';
      inpaintEditor.toggleParamsPopover = vi.fn();
      await inpaintEditor.doInpaint();
      expect(inpaintOrder).toEqual([
        'inpaint-prepare:v4.5:1:true',
        'inpaint-getExtraParams',
        'inpaint-generate:ENCODED_INPAINT_V45'
      ]);
    });

    it('verifies index.html, src/main.js, and src/style.css structural fixes & modern CSS rules', () => {
      const root = path.resolve(import.meta.dirname, '..');
      const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
      const styleCss = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
      const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

      expect(indexHtml).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
      expect(indexHtml).not.toContain('user-scalable=no');
      expect(indexHtml).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">');
      expect(indexHtml).toContain('<meta name="color-scheme" content="light dark">');
      expect(indexHtml).toContain('integrity="sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG"');
      expect(indexHtml).toMatch(/<script\b[^>]*src="https:\/\/cdn\.tailwindcss\.com\/3\.4\.17"[^>]*>/);
      expect(indexHtml).not.toMatch(/<script\b[^>]*src="https:\/\/cdn\.tailwindcss\.com[^"]*"[^>]*\bcrossorigin=/);
      expect(indexHtml).toContain('popovertarget="vibeExportMenu"');
      expect(indexHtml).toContain('id="vibeExportMenu" popover="auto"');

      expect(styleCss).not.toContain("@import url('https://fonts.googleapis.com");
      expect(styleCss).toContain('color-scheme: light dark;');
      expect(styleCss).toContain('interpolate-size: allow-keywords;');
      expect(styleCss).toContain('field-sizing: content;');
      expect(styleCss).toContain('position-area: block-end span-inline-start;');
      expect(styleCss).toContain('content-visibility: auto;');

      expect(mainJs).not.toContain('selectVibeStrength');
      expect(mainJs).toContain('vibeManager.selectStrengthValue(');
      expect(mainJs).not.toContain("store.getSetting('nai_token')");
      expect(mainJs).toContain("store.getSetting('nai_user_token')");
      expect(mainJs).toContain('statusEl.replaceChildren(');
    });
  });
});
