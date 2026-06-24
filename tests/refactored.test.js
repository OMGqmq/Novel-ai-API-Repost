import { describe, it, vi } from 'vitest';
import assert from 'assert';
import { PromptHelper } from '../src/prompt-helper.js';
import { NotebookManager } from '../src/notebook.js';
import { VibeManager } from '../src/vibe-manager.js';
import { SettingsManager } from '../src/settings-manager.js';
import { CharPromptManager } from '../src/char-prompt-manager.js';
import { AuthController } from '../src/auth-controller.js';
import { AdminController } from '../src/admin-controller.js';
import { XyPlotManager } from '../src/xy-plot-manager.js';
import { RandomPromptManager } from '../src/random-prompt-manager.js';
import { generateSalt, hashPassword, signJwt, verifyJwt } from '../functions/_crypto-helper.js';

// Setup Mock DOM Environment for Testing
global.window = {
    location: { href: 'http://localhost/' }
};
global.document = {
    createElement: (tag) => {
        return {
            className: '',
            id: '',
            innerHTML: '',
            appendChild: () => {},
            querySelector: () => ({ addEventListener: () => {} }),
            addEventListener: () => {}
        };
    }
};
global.localStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, value) { this.store[key] = String(value); },
    removeItem(key) { delete this.store[key]; },
    clear() { this.store = {}; }
};
global.Option = function(text, value) {
    this.text = text;
    this.value = value;
};

describe('Refactored Suite', () => {
  
  it('should run PromptHelper tests', () => {
    const mockTextarea = {
        value: '',
        selectionStart: 0,
        addEventListener: () => {}
    };

    const tagData = {
        "masterpiece": "杰作",
        "1girl": "一个女孩",
        "solo": "单人"
    };

    const promptHelper = new PromptHelper({
        promptEl: mockTextarea,
        containerEl: {
            appendChild: () => {},
            className: '',
            innerHTML: ''
        },
        tagData
    });

    // 1. calculateWeight
    assert.strictEqual(promptHelper.calculateWeight('masterpiece'), 1.0);
    assert.strictEqual(promptHelper.calculateWeight('(masterpiece)'), 1.1);
    assert.ok(Math.abs(promptHelper.calculateWeight('((masterpiece))') - 1.21) < 0.001);
    assert.strictEqual(promptHelper.calculateWeight('[masterpiece]'), 1 / 1.05);
    assert.strictEqual(promptHelper.calculateWeight('{masterpiece}'), 1.05);
    assert.strictEqual(promptHelper.calculateWeight('1.5::masterpiece::'), 1.5);
    assert.strictEqual(promptHelper.calculateWeight('-0.5::masterpiece'), -0.5);

    // 2. cleanTag
    assert.strictEqual(promptHelper.cleanTag('(masterpiece)'), 'masterpiece');
    assert.strictEqual(promptHelper.cleanTag('((masterpiece))'), 'masterpiece');
    assert.strictEqual(promptHelper.cleanTag('[masterpiece]'), 'masterpiece');
    assert.strictEqual(promptHelper.cleanTag('1.5::masterpiece::'), 'masterpiece');
    assert.strictEqual(promptHelper.cleanTag(' -0.5::solo '), 'solo');

    // 3. expandPromptTags
    assert.deepStrictEqual(promptHelper.expandPromptTags('masterpiece, 1girl'), ['masterpiece', '1girl']);
    assert.deepStrictEqual(promptHelper.expandPromptTags('(masterpiece, 1girl)'), ['(masterpiece)', '(1girl)']);
    assert.deepStrictEqual(promptHelper.expandPromptTags('1.5::masterpiece, 1girl::'), ['1.5::masterpiece::', '1.5::1girl::']);
  });

  it('should run NotebookManager tests', () => {
    localStorage.clear();

    let appliedNotes = null;
    const notebookManager = new NotebookManager({
        listContainerEl: {
            innerHTML: '',
            querySelector: () => null
        },
        onApplyNote: (note) => {
            appliedNotes = note;
        },
        onShowToast: () => {}
    });

    // 1. Storage basic CRUD
    assert.deepStrictEqual(notebookManager.getNotebookNotes('v3'), []);
    const testNoteList = [
        { id: '1', prompt: 'masterpiece', negative: 'bad', createdAt: 1000 }
    ];
    notebookManager.saveNotebookNotes('v3', testNoteList);
    assert.deepStrictEqual(notebookManager.getNotebookNotes('v3'), testNoteList);

    // 2. Merging notes
    const currentNotes = [
        { id: '1', prompt: 'masterpiece', negative: 'bad', createdAt: 1000 }
    ];
    const importedNotes = [
        { id: '1', prompt: 'masterpiece', negative: 'bad', createdAt: 1000 },
        { id: '2', prompt: '1girl', negative: 'lowres', createdAt: 2000 }
    ];
    const merged = notebookManager._mergeNotes(currentNotes, importedNotes);
    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged[0].id, '2');
    assert.strictEqual(merged[1].id, '1');

    // 3. Applying note
    notebookManager.applyNote('v3', '1');
    assert.deepStrictEqual(appliedNotes, {
        prompt: 'masterpiece',
        negative: 'bad',
        model: 'v3'
    });
  });

  it('should run VibeManager tests', async () => {
    const elements = {};
    function getOrCreateMockElement(id, attrs = {}) {
        if (!elements[id]) {
            elements[id] = {
                id,
                classList: {
                    add: (cls) => elements[id].classes.add(cls),
                    remove: (cls) => elements[id].classes.delete(cls),
                    contains: (cls) => elements[id].classes.has(cls)
                },
                classes: new Set(),
                value: attrs.value || '',
                checked: attrs.checked !== undefined ? attrs.checked : false,
                src: attrs.src || '',
                textContent: attrs.textContent || '',
                innerHTML: attrs.innerHTML || '',
                querySelector: (sel) => {
                    const subId = id + '-' + sel.replace(/[#.]/g, '');
                    return getOrCreateMockElement(subId);
                },
                addEventListener: (event, cb) => {
                    elements[id].listeners = elements[id].listeners || {};
                    elements[id].listeners[event] = cb;
                },
                ...attrs
            };
        }
        return elements[id];
    }

    global.document.getElementById = (id) => getOrCreateMockElement(id);

    const mockStore = {
        settings: {},
        getSetting(key, defaultVal) {
            return this.settings[key] !== undefined ? this.settings[key] : defaultVal;
        },
        setSetting(key, val) {
            this.settings[key] = String(val);
        }
    };

    const vibeManager = new VibeManager({
        store: mockStore,
        compressImage: async (file) => 'data:image/jpeg;base64,mocked_base64_data',
        onShowToast: () => {}
    });

    // 1. getVibeKey
    assert.strictEqual(vibeManager.getVibeKey('test_key', 'v3'), 'test_key');
    assert.strictEqual(vibeManager.getVibeKey('test_key', 'v4.5'), 'test_key_v4');

    // 2. loadState / saveState with raw image (v3)
    mockStore.setSetting('nai_vibe_image', 'raw_image_data_v3');
    mockStore.setSetting('nai_vibe_is_json', 'false');
    mockStore.setSetting('nai_vibe_enabled', 'true');
    mockStore.setSetting('nai_vibe_strength', '0.75');

    // Mock inputs
    getOrCreateMockElement('vibeEnabled', { checked: true });
    getOrCreateMockElement('vibeStrength', { value: '0.75' });

    vibeManager.loadState('v3');

    assert.strictEqual(vibeManager.currentVibeImageBase64, 'raw_image_data_v3');
    assert.strictEqual(vibeManager.currentVibeIsJson, false);
    assert.strictEqual(getOrCreateMockElement('vibeStrengthValue').textContent, '0.75');

    // 3. isValidForModel validation
    assert.deepStrictEqual(vibeManager.isValidForModel('v3'), { isValid: true });
    const validationV45 = vibeManager.isValidForModel('v4.5');
    assert.strictEqual(validationV45.isValid, false);
    assert.ok(validationV45.error.includes('Anlas'));

    // 4. getPayloadParams
    const payloadParams = vibeManager.getPayloadParams('v3');
    assert.strictEqual(payloadParams.vibe_image, 'raw_image_data_v3');
    assert.strictEqual(payloadParams.vibe_strength, 0.75);

    // 5. handleVibeImage with JSON
    const mockJsonFile = {
        name: 'test.nai4vibe',
        type: 'application/json',
        text: async () => JSON.stringify({
            image: 'json_image_v45_base64',
            information_extracted: 0.45
        })
    };

    await vibeManager.handleVibeImage({ target: { files: [mockJsonFile] } }, 'v4.5');
    assert.strictEqual(vibeManager.currentVibeIsJson, true);
    assert.strictEqual(vibeManager.currentVibeImageBase64, 'json_image_v45_base64');
    assert.strictEqual(vibeManager.availableVibeEncodings.length, 1);
    assert.strictEqual(vibeManager.availableVibeEncodings[0].info, 0.45);

    // With V4.5 JSON, it should be valid for V4.5 model
    assert.deepStrictEqual(vibeManager.isValidForModel('v4.5'), { isValid: true });

    // 6. clearVibeImage
    vibeManager.clearVibeImage('v3');
    assert.strictEqual(vibeManager.currentVibeImageBase64, null);
    assert.strictEqual(vibeManager.currentVibeIsJson, false);
    assert.deepStrictEqual(vibeManager.availableVibeEncodings, []);
  });

  it('should run SettingsManager tests', () => {
    localStorage.clear();

    const elements = {};
    function getOrCreateMockElement(id, attrs = {}) {
        if (!elements[id]) {
            elements[id] = {
                id,
                classList: {
                    add: (cls) => elements[id].classes.add(cls),
                    remove: (cls) => elements[id].classes.delete(cls),
                    contains: (cls) => elements[id].classes.has(cls)
                },
                classes: new Set(),
                value: attrs.value || '',
                checked: attrs.checked !== undefined ? attrs.checked : false,
                src: attrs.src || '',
                textContent: attrs.textContent || '',
                innerHTML: attrs.innerHTML || '',
                querySelector: (sel) => {
                    const subId = id + '-' + sel.replace(/[#.]/g, '');
                    return getOrCreateMockElement(subId);
                },
                addEventListener: (event, cb) => {
                    elements[id].listeners = elements[id].listeners || {};
                    elements[id].listeners[event] = cb;
                },
                dispatchEvent: () => {},
                add: () => {},
                ...attrs
            };
        }
        return elements[id];
    }

    global.document.getElementById = (id) => getOrCreateMockElement(id);
    global.document.documentElement = {
        classList: {
            add: (cls) => {},
            remove: (cls) => {},
            contains: (cls) => false
        }
    };

    const mockStore = {
        settings: {},
        getSetting(key, defaultVal) {
            return this.settings[key] !== undefined ? this.settings[key] : (defaultVal !== undefined ? defaultVal : '');
        },
        setSetting(key, val) {
            this.settings[key] = String(val);
        }
    };

    const mockUi = {
        els: {
            prompt: getOrCreateMockElement('prompt'),
            negative: getOrCreateMockElement('negative'),
            steps: getOrCreateMockElement('steps'),
            stepsVal: getOrCreateMockElement('stepsVal'),
            scale: getOrCreateMockElement('scale'),
            scaleVal: getOrCreateMockElement('scaleVal'),
            sampler: getOrCreateMockElement('sampler'),
            resolution: getOrCreateMockElement('resolution'),
            noise_schedule: getOrCreateMockElement('noise_schedule'),
            strength: getOrCreateMockElement('strength'),
            strengthVal: getOrCreateMockElement('strengthVal'),
            noise: getOrCreateMockElement('noise'),
            noiseVal: getOrCreateMockElement('noiseVal'),
            smEnabled: getOrCreateMockElement('smEnabled'),
            smDynEnabled: getOrCreateMockElement('smDynEnabled'),
            qualityToggleEnabled: getOrCreateMockElement('qualityToggleEnabled'),
            dynThresholdEnabled: getOrCreateMockElement('dynThresholdEnabled'),
            cfgRescale: getOrCreateMockElement('cfgRescale'),
            uncondScale: getOrCreateMockElement('uncondScale'),
            skipCfg: getOrCreateMockElement('skipCfg'),
            v45EulerBug: getOrCreateMockElement('v45EulerBug'),
            v45PreferBrownian: getOrCreateMockElement('v45PreferBrownian'),
            v45UseCoords: getOrCreateMockElement('v45UseCoords'),
            v45UseOrder: getOrCreateMockElement('v45UseOrder'),
            v45NegUseOrder: getOrCreateMockElement('v45NegUseOrder'),
            settingsLowPerfCheckbox: getOrCreateMockElement('settingsLowPerfCheckbox'),
            settingsV45ExperimentalCheckbox: getOrCreateMockElement('settingsV45ExperimentalCheckbox'),
            settingsKeyConcurrentCheckbox: getOrCreateMockElement('settingsKeyConcurrentCheckbox'),
            adminTokenInput: getOrCreateMockElement('adminTokenInput'),
            adminTokenClearBtn: getOrCreateMockElement('adminTokenClearBtn'),
            userKeyInput: getOrCreateMockElement('userKeyInput'),
            userKeyClearBtn: getOrCreateMockElement('userKeyClearBtn'),
            bypassLimitsEnabled: getOrCreateMockElement('bypassLimitsEnabled')
        },
        updateLowPerfUI: () => {},
        updateAdminUI: () => {},
        setModel: () => {}
    };

    let modelChanged = null;
    let hydrated = false;

    const settingsManager = new SettingsManager();
    settingsManager.bind(mockUi, mockStore, {
        onModelChange: (model) => { modelChanged = model; },
        onHydrate: () => { hydrated = true; }
    });

    // 1. Initial State / Hydration
    assert.strictEqual(hydrated, true);
    assert.strictEqual(modelChanged, 'v3');

    // 2. Standard Input binding
    mockUi.els.prompt.value = 'a masterpiece';
    mockUi.els.prompt.listeners['input']({ target: mockUi.els.prompt });
    assert.strictEqual(mockStore.getSetting('nai_prompt'), 'a masterpiece');

    // 3. Admin / User Credentials
    settingsManager.saveAdminToken('my-secret-token');
    assert.strictEqual(localStorage.getItem('nai_admin_token'), 'my-secret-token');

    settingsManager.clearAdminToken();
    assert.strictEqual(localStorage.getItem('nai_admin_token'), null);

    settingsManager.saveUserKey('my-vip-card');
    assert.strictEqual(localStorage.getItem('nai_user_key'), 'my-vip-card');

    settingsManager.clearUserKey();
    assert.strictEqual(localStorage.getItem('nai_user_key'), null);

    // 4. Low Performance Toggle
    settingsManager.toggleLowPerf(true);
    assert.strictEqual(mockStore.getSetting('low_perf'), 'true');
    settingsManager.toggleLowPerf(false);
    assert.strictEqual(mockStore.getSetting('low_perf'), 'false');

    // 5. Experimental Mode Toggle
    settingsManager.toggleV45Experimental(true);
    assert.strictEqual(mockStore.getSetting('v4_5_experimental'), 'true');
    assert.strictEqual(mockStore.getSetting('nai_v45_euler_bug'), 'true');

    settingsManager.toggleV45Experimental(false);
    assert.strictEqual(mockStore.getSetting('v4_5_experimental'), 'false');
    assert.strictEqual(mockStore.getSetting('nai_v45_euler_bug'), 'false');
  });

  it('should run CryptoHelper tests', async () => {
    // 1. Salt Generation
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    assert.strictEqual(typeof salt1, 'string');
    assert.strictEqual(salt1.length, 32);
    assert.notStrictEqual(salt1, salt2);

    // 2. Password Hashing
    const pass = "user_password_123";
    const hash1 = await hashPassword(pass, salt1);
    const hash2 = await hashPassword(pass, salt1);
    const hash3 = await hashPassword("different_pass", salt1);
    const hash4 = await hashPassword(pass, salt2);

    assert.strictEqual(hash1, hash2);
    assert.notStrictEqual(hash1, hash3);
    assert.notStrictEqual(hash1, hash4);

    // 3. JWT Sign & Verify
    const jwtSecret = "my-test-jwt-secret-key-123456";
    const payload = { id: 42, username: "alice", role: "User" };
    const token = await signJwt(payload, jwtSecret, 3600);

    assert.strictEqual(typeof token, 'string');
    assert.ok(token.split('.').length === 3);

    const decoded = await verifyJwt(token, jwtSecret);
    assert.ok(decoded !== null);
    assert.strictEqual(decoded.id, 42);
    assert.strictEqual(decoded.username, "alice");
    assert.strictEqual(decoded.role, "User");

    // Expired token test
    const expiredToken = await signJwt(payload, jwtSecret, -10);
    const decodedExpired = await verifyJwt(expiredToken, jwtSecret);
    assert.strictEqual(decodedExpired, null);

    // Wrong secret key test
    const decodedWrongSecret = await verifyJwt(token, "wrong-secret-key");
    assert.strictEqual(decodedWrongSecret, null);
  });

  it('should verify user status restrictions in registration and login', async () => {
    const { onRequest: registerHandler } = await import('../functions/api/auth/register.js');
    const { onRequest: loginHandler } = await import('../functions/api/auth/login.js');

    // 1. 注册默认状态校验
    let registeredStatus = null;
    let registeredCredits = null;
    const mockDbRegister = {
      prepare: (sql) => ({
        bind: (...args) => ({
          first: async () => null,
          run: async () => {
            if (sql.includes('INSERT INTO users')) {
              registeredCredits = args[3];
              registeredStatus = sql.includes("'Pending'") ? 'Pending' : null;
            }
            return { success: true };
          }
        })
      })
    };

    const registerCtx = {
      request: {
        method: 'POST',
        json: async () => ({ username: 'bob_test', password: 'password123' })
      },
      env: { DB: mockDbRegister, DEFAULT_CREDITS: '15' }
    };

    await registerHandler(registerCtx);
    assert.strictEqual(registeredCredits, 15);
    assert.strictEqual(registeredStatus, 'Pending');

    // 2. 登录拦截校验
    const salt = generateSalt();
    const passwordHash = await hashPassword('password123', salt);

    const mockUser = {
      id: 10,
      username: 'bob_test',
      password_hash: passwordHash,
      salt: salt,
      role: 'User',
      credits: 15,
      status: 'Pending'
    };

    const mockDbLogin = {
      prepare: (sql) => ({
        bind: (...args) => ({
          first: async () => mockUser
        })
      })
    };

    const loginCtx = {
      request: {
        method: 'POST',
        json: async () => ({ username: 'bob_test', password: 'password123' })
      },
      env: { DB: mockDbLogin, JWT_SECRET: 'testsecret' }
    };

    // A. 待审核状态拦截
    let res = await loginHandler(loginCtx);
    assert.strictEqual(res.status, 403);
    let resJson = await res.json();
    assert.ok(resJson.error.includes('审核中'));

    // B. 禁用状态拦截
    mockUser.status = 'Banned';
    res = await loginHandler(loginCtx);
    assert.strictEqual(res.status, 403);
    resJson = await res.json();
    assert.ok(resJson.error.includes('禁用'));

    // C. 激活状态通过
    mockUser.status = 'Approved';
    res = await loginHandler(loginCtx);
    assert.strictEqual(res.status, 200);
    resJson = await res.json();
    assert.strictEqual(resJson.success, true);
    assert.strictEqual(typeof resJson.token, 'string');
    assert.strictEqual(resJson.user.credits, 15);
  });

  it('should run CharPromptManager tests', () => {
    localStorage.clear();

    const mockStore = {
      settings: {},
      getSetting(key, defaultVal) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultVal;
      },
      setSetting(key, val) {
        this.settings[key] = String(val);
      }
    };

    const charPromptManager = new CharPromptManager();
    charPromptManager.bind(mockStore);

    // Mock elements
    const elements = {};
    const createdElements = [];

    function createMockElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        classList: {
          add: (cls) => el.classes.add(cls),
          remove: (cls) => el.classes.delete(cls),
          contains: (cls) => el.classes.has(cls),
          toggle: (cls, cond) => {
            if (cond === undefined) cond = !el.classes.has(cls);
            if (cond) el.classes.add(cls); else el.classes.delete(cls);
          }
        },
        classes: new Set(),
        value: '',
        checked: false,
        disabled: false,
        textContent: '',
        listeners: {},
        addEventListener(event, cb) {
          this.listeners[event] = cb;
        },
        querySelector(sel) {
          if (sel === '.char-enable-toggle') return el.enableToggle;
          if (sel === '.char-enable-text') return el.enableText;
          if (sel === '.char-prompt-input') return el.promptInput;
          if (sel === '.char-neg-input') return el.negInput;
          if (sel === '.char-pos-x') return el.posXInput;
          if (sel === '.char-pos-y') return el.posYInput;
          if (sel === '.char-auto-pos') return el.autoPosCheckbox;
          if (sel === '.char-grid-container') return el.gridContainer;
          if (sel === '.character-index-label') return el.indexLabel;
          if (sel === '.char-row-summary') return el.summarySpan;
          if (sel === '.char-row-header') return el.rowHeader;
          if (sel === '.char-row-content') return el.rowContent;
          if (sel === '.char-row-chevron') return el.rowChevron;
          if (sel === '.char-row-actions') return el.rowActions;
          return null;
        },
        querySelectorAll(sel) {
          if (sel === '.char-prompt-input, .char-neg-input, .char-auto-pos') {
            return [el.promptInput, el.negInput, el.autoPosCheckbox];
          }
          if (sel === '.char-grid-cell') {
            return el.gridCells || [];
          }
          if (sel === '.character-prompt-row') {
            return createdElements;
          }
          return [];
        },
        closest(sel) {
          if (sel === '.character-prompt-row') return el;
          if (sel === '.char-grid-container') return el.gridContainer;
          return null;
        },
        remove() {
          const idx = createdElements.indexOf(el);
          if (idx !== -1) createdElements.splice(idx, 1);
        }
      };

      // Child elements for the row element
      el.enableToggle = { checked: true, addEventListener: (ev, cb) => { el.enableToggle.listener = cb; } };
      el.enableText = { textContent: '', className: '' };
      el.promptInput = { value: '', addEventListener: (ev, cb) => { el.promptInput.listener = cb; } };
      el.negInput = { value: '', addEventListener: (ev, cb) => { el.negInput.listener = cb; } };
      el.posXInput = { value: '0.5' };
      el.posYInput = { value: '0.5' };
      el.autoPosCheckbox = { checked: true, addEventListener: (ev, cb) => { el.autoPosCheckbox.listener = cb; } };
      el.gridContainer = {
        classList: el.classList,
        querySelectorAll(sel) {
          if (sel === '.char-grid-cell') return el.gridCells;
          return [];
        },
        closest(sel) {
          if (sel === '.character-prompt-row') return el;
          return null;
        }
      };
      el.indexLabel = { textContent: '' };
      el.summarySpan = { textContent: '' };
      el.rowHeader = { addEventListener: (ev, cb) => { el.rowHeader.listener = cb; } };
      el.rowContent = { classList: { add: (cls) => el.rowContent.classes.add(cls), remove: (cls) => el.rowContent.classes.delete(cls), contains: (cls) => el.rowContent.classes.has(cls) }, classes: new Set() };
      el.rowChevron = { classList: { add: (cls) => {}, remove: (cls) => {} } };
      el.rowActions = { addEventListener: (ev, cb) => { el.rowActions.listener = cb; } };
      el.gridCells = Array.from({ length: 25 }, (_, i) => ({
        className: '',
        title: '',
        style: {}
      }));

      Object.defineProperty(el, 'innerHTML', {
        set(val) {
          const promptMatch = val.match(/class="char-prompt-input[^"]*"\s+value="([^"]*)"/);
          if (promptMatch) el.promptInput.value = promptMatch[1];
          
          const negMatch = val.match(/class="char-neg-input[^"]*"\s+value="([^"]*)"/);
          if (negMatch) el.negInput.value = negMatch[1];

          const posXMatch = val.match(/class="char-pos-x"\s+value="([^"]*)"/);
          if (posXMatch) el.posXInput.value = posXMatch[1];

          const posYMatch = val.match(/class="char-pos-y"\s+value="([^"]*)"/);
          if (posYMatch) el.posYInput.value = posYMatch[1];

          const autoPosMatch = val.match(/class="char-auto-pos[^"]*"\s+([^>]*)/);
          if (autoPosMatch) el.autoPosCheckbox.checked = autoPosMatch[1].includes('checked');

          const enabledMatch = val.match(/class="char-enable-toggle[^"]*"\s+([^>]*)/);
          if (enabledMatch) el.enableToggle.checked = enabledMatch[1].includes('checked');
        },
        get() {
          return '';
        }
      });

      createdElements.push(el);
      return el;
    }

    global.document.createElement = createMockElement;
    global.document.getElementById = (id) => {
      if (id === 'characterPromptsContainer') {
        return {
          appendChild: (child) => {},
          querySelectorAll(sel) {
            if (sel === '.character-prompt-row') return createdElements;
            return [];
          }
        };
      }
      if (id === 'charCountBadge') {
        return {
          textContent: '',
          classList: {
            add: (cls) => {},
            remove: (cls) => {}
          }
        };
      }
      return null;
    };

    // Test addCharacterPromptRow
    charPromptManager.addCharacterPromptRow('prompt1', 'neg1', 0.5, 0.5, true, true, true);
    assert.strictEqual(createdElements.length, 1);
    const row = createdElements[0];
    assert.strictEqual(row.promptInput.value, 'prompt1');
    assert.strictEqual(row.negInput.value, 'neg1');

    // Test enable/disable toggle
    row.enableToggle.listener({ target: { checked: false } });
    assert.strictEqual(row.enableText.textContent, '已禁用');

    row.enableToggle.listener({ target: { checked: true } });
    assert.strictEqual(row.enableText.textContent, '已启用');

    // Test prompt input updates summary
    row.promptInput.value = 'hello';
    row.promptInput.listener();
    assert.strictEqual(row.summarySpan.textContent, '(hello)');

    // Test autoPos toggle change
    row.autoPosCheckbox.listener({ target: { checked: false } });
    row.autoPosCheckbox.listener({ target: { checked: true } });

    // Test selectCharGridCell
    const dummyBtn = {
      closest: (sel) => {
        if (sel === '.char-grid-container') return row.gridContainer;
        return null;
      },
      className: ''
    };
    charPromptManager.selectCharGridCell(dummyBtn, 0.3, 0.7);
    assert.strictEqual(row.posXInput.value, 0.3);
    assert.strictEqual(row.posYInput.value, 0.7);

    // Test row collapse/expand
    row.rowHeader.listener();
    row.rowActions.listener({ stopPropagation: () => {} });

    // Test removeCharacterPromptRow
    // Simulating setTimeout callback execution
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (cb) => cb();
    try {
      const dummyDelBtn = {
        closest: (sel) => {
          if (sel === '.character-prompt-row') return row;
          return null;
        }
      };
      charPromptManager.removeCharacterPromptRow(dummyDelBtn);
      assert.strictEqual(createdElements.length, 0);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should run AuthController tests', async () => {
    localStorage.clear();
    const authController = new AuthController();

    const mockUi = {};
    const mockStore = {};
    authController.bind(mockUi, mockStore);

    // Mock fetch responses
    let fetchUrl = '';
    let fetchOptions = {};
    global.fetch = async (url, options = {}) => {
      fetchUrl = url;
      fetchOptions = options;
      if (url === '/api/auth/profile') {
        if (options.headers && options.headers['Authorization'] === 'Bearer invalid-token') {
          return { ok: false, status: 401, json: async () => ({ success: false }) };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            user: { username: 'alice', credits: 100, daily_limit: 10, daily_count: 3 }
          })
        };
      }
      if (url === '/api/auth/login' || url === '/api/auth/register') {
        const body = JSON.parse(options.body);
        if (body.username === 'error') {
          return { ok: false, status: 400, json: async () => ({ error: 'Bad request' }) };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            token: 'mock-jwt-token',
            user: { username: body.username, credits: 100 }
          })
        };
      }
      if (url === '/api/auth/recharge') {
        const body = JSON.parse(options.body);
        if (body.cardKey === 'invalid') {
          return { ok: false, status: 400, json: async () => ({ error: 'Card invalid' }) };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: '充值成功'
          })
        };
      }
      return { ok: false, status: 404 };
    };

    // Elements mock
    const elements = {};
    function getOrCreateMockElement(id) {
      if (!elements[id]) {
        elements[id] = {
          id,
          value: '',
          checked: false,
          disabled: false,
          textContent: '',
          innerHTML: '',
          classList: {
            add: (cls) => {},
            remove: (cls) => {}
          },
          dataset: {}
        };
      }
      return elements[id];
    }
    global.document.getElementById = getOrCreateMockElement;

    // Test fetchUserProfile (no token)
    await authController.fetchUserProfile();
    assert.strictEqual(fetchUrl, '');

    // With token
    localStorage.setItem('nai_user_token', 'valid-token');
    await authController.fetchUserProfile();
    assert.strictEqual(fetchUrl, '/api/auth/profile');
    assert.strictEqual(getOrCreateMockElement('profileUsername').textContent, 'alice');

    // Test switchAuthTab
    authController.switchAuthTab('login');
    assert.strictEqual(getOrCreateMockElement('userAuthPanel').dataset.tab, 'login');
    authController.switchAuthTab('register');
    assert.strictEqual(getOrCreateMockElement('userAuthPanel').dataset.tab, 'register');

    // Test submitAuth empty input
    const authStatus = getOrCreateMockElement('authStatus');
    getOrCreateMockElement('authUsername').value = '';
    getOrCreateMockElement('authPassword').value = '';
    await authController.submitAuth();
    assert.ok(authStatus.innerHTML.includes('不能为空'));

    // Test submitAuth Login
    getOrCreateMockElement('authUsername').value = 'alice';
    getOrCreateMockElement('authPassword').value = 'pass';
    getOrCreateMockElement('userAuthPanel').dataset.tab = 'login';
    await authController.submitAuth();
    assert.strictEqual(localStorage.getItem('nai_user_token'), 'mock-jwt-token');

    // Test submitAuth Register
    getOrCreateMockElement('authUsername').value = 'bob';
    getOrCreateMockElement('authPassword').value = 'pass';
    getOrCreateMockElement('userAuthPanel').dataset.tab = 'register';
    await authController.submitAuth();
    assert.ok(authStatus.innerHTML.includes('注册成功'));

    // Test submitRecharge
    getOrCreateMockElement('rechargeCardKey').value = 'VIP-123';
    await authController.submitRecharge();
    assert.ok(getOrCreateMockElement('rechargeStatus').innerHTML.includes('充值成功'));

    // Test logoutUser
    authController.logoutUser();
    assert.strictEqual(localStorage.getItem('nai_user_token'), null);
  });

  it('should run AdminController tests', async () => {
    const adminController = new AdminController();
    const mockUi = {};
    const mockStore = {};
    const mockAuthController = { fetchUserProfile: vi.fn() };
    adminController.bind(mockUi, mockStore, mockAuthController);

    // Mock Chart
    global.Chart = function(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.destroy = vi.fn();
    };

    // Mock confirm/showConfirm
    global.window.showConfirm = async () => true;
    global.window.showToast = vi.fn();

    // Mock fetch responses
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      const call = { url, options };
      fetchCalls.push(call);
      if (url === '/api/admin/users') {
        return {
          ok: true,
          json: async () => ({
            users: [
              { id: 1, username: 'user1', role: 'User', credits: 10, status: 'Pending' },
              { id: 2, username: 'user2', role: 'User', credits: 20, status: 'Approved' },
              { id: 3, username: 'user3', role: 'User', credits: 30, status: 'Banned' }
            ]
          })
        };
      }
      if (url === '/api/admin/users/approve') {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === '/api/admin/cards/generate') {
        return { ok: true, json: async () => ({ message: 'Generated', cards: ['CARD1', 'CARD2'] }) };
      }
      if (url.startsWith('/api/admin/stats')) {
        return {
          ok: true,
          json: async () => ({
            summary: { total_requests: 10, success_rate: 90, avg_duration: 500 },
            ips: [{ ip: '1.1.1.1', count: 5 }],
            errors: [{ error_message: 'Error 1', count: 2 }],
            trend: [{ time_bucket: '12:00', request_count: 5, avg_duration: 400 }],
            models: [{ model: 'v4.5', count: 10 }]
          })
        };
      }
      return { ok: false, status: 404 };
    };

    // Elements mock
    const elements = {};
    function getOrCreateMockElement(id) {
      if (!elements[id]) {
        elements[id] = {
          id,
          value: '',
          checked: false,
          disabled: false,
          textContent: '',
          innerHTML: '',
          classList: {
            add: (cls) => {},
            remove: (cls) => {},
            toggle: vi.fn()
          },
          appendChild: vi.fn(),
          getContext: () => ({})
        };
      }
      return elements[id];
    }
    global.document.getElementById = getOrCreateMockElement;

    // Test switchAdminTab
    adminController.switchAdminTab('users');
    adminController.switchAdminTab('stats');
    assert.ok(fetchCalls.some(c => c.url.startsWith('/api/admin/stats')));

    // Test fetchAdminUsers
    const tbody = getOrCreateMockElement('adminUsersTableBody');
    tbody.innerHTML = '';
    fetchCalls.length = 0;
    await adminController.fetchAdminUsers();
    assert.strictEqual(fetchCalls[0].url, '/api/admin/users');

    // Test updateUserStatus
    fetchCalls.length = 0;
    await adminController.updateUserStatus(1, 'Approved');
    const callApproved = fetchCalls.find(c => c.url === '/api/admin/users/approve');
    assert.ok(callApproved);
    const bodyApproved = JSON.parse(callApproved.options.body);
    assert.strictEqual(bodyApproved.userId, 1);
    assert.strictEqual(bodyApproved.status, 'Approved');

    // Test deleteUserAccount
    fetchCalls.length = 0;
    await adminController.deleteUserAccount(2, 'user2');
    const callDelete = fetchCalls.find(c => c.url === '/api/admin/users/approve');
    assert.ok(callDelete);
    const bodyDelete = JSON.parse(callDelete.options.body);
    assert.strictEqual(bodyDelete.userId, 2);
    assert.strictEqual(bodyDelete.action, 'delete');

    // Test saveAdjustedCredits
    getOrCreateMockElement('adjustCreditsInput-3').value = '50';
    fetchCalls.length = 0;
    await adminController.saveAdjustedCredits(3);
    const callCredits = fetchCalls.find(c => c.url === '/api/admin/users/approve');
    assert.ok(callCredits);
    const bodyCredits = JSON.parse(callCredits.options.body);
    assert.strictEqual(bodyCredits.userId, 3);
    assert.strictEqual(bodyCredits.credits, 50);

    // Test generateVipCards
    getOrCreateMockElement('genCardCount').value = '5';
    getOrCreateMockElement('genCardCredits').value = '10';
    await adminController.generateVipCards();
    assert.strictEqual(getOrCreateMockElement('genCardsTextarea').value, 'CARD1\nCARD2');

    // Test copyGeneratedCards
    getOrCreateMockElement('genCardsTextarea').value = 'CARD1\nCARD2';
    getOrCreateMockElement('genCardsTextarea').select = vi.fn();
    global.document.execCommand = vi.fn();
    adminController.copyGeneratedCards();

    // Test fetchAdminStats
    await adminController.fetchAdminStats();
    assert.strictEqual(getOrCreateMockElement('statTotalRequests').textContent, 10);
  });

  it('should run XyPlotManager tests', () => {
    const mockStore = {};
    const xyPlotManager = new XyPlotManager();
    xyPlotManager.bind(mockStore);

    const elements = {};
    function getOrCreateMockElement(id) {
      if (!elements[id]) {
        elements[id] = {
          id,
          value: '',
          checked: false
        };
      }
      return elements[id];
    }
    global.document.getElementById = getOrCreateMockElement;

    // Test isEnabled
    getOrCreateMockElement('xyPlotEnabled').checked = false;
    assert.strictEqual(xyPlotManager.isEnabled(), false);
    getOrCreateMockElement('xyPlotEnabled').checked = true;
    assert.strictEqual(xyPlotManager.isEnabled(), true);

    // Test getXyConfigs with Steps and Scale
    getOrCreateMockElement('xyPlotXType').value = 'steps';
    getOrCreateMockElement('xyPlotXValues').value = ' 10, 20 , 30 ';
    getOrCreateMockElement('xyPlotYType').value = 'scale';
    getOrCreateMockElement('xyPlotYValues').value = ' 5.0, 7.5 ';

    const configs = xyPlotManager.getXyConfigs();
    assert.strictEqual(configs.xType, 'steps');
    assert.deepStrictEqual(configs.xValues, [10, 20, 30]);
    assert.strictEqual(configs.yType, 'scale');
    assert.deepStrictEqual(configs.yValues, [5.0, 7.5]);

    // Test generateParamGrid
    const baseParams = { prompt: 'masterpiece', steps: 28, scale: 7.0 };
    const grid = xyPlotManager.generateParamGrid(baseParams);

    assert.strictEqual(grid.length, 6); // 2 rows * 3 columns = 6 cells
    assert.strictEqual(grid[0].params.steps, 10);
    assert.strictEqual(grid[0].params.scale, 5.0);
    assert.strictEqual(grid[0].xyInfo, 'Steps: 10 | Scale: 5');

    assert.strictEqual(grid[5].params.steps, 30);
    assert.strictEqual(grid[5].params.scale, 7.5);
    assert.strictEqual(grid[5].xyInfo, 'Steps: 30 | Scale: 7.5');

    // Test getXyConfigs with X axis set to 'none'
    getOrCreateMockElement('xyPlotXType').value = 'none';
    getOrCreateMockElement('xyPlotXValues').value = ' 10, 20 , 30 '; // Should be ignored
    getOrCreateMockElement('xyPlotYType').value = 'scale';
    getOrCreateMockElement('xyPlotYValues').value = ' 5.0, 7.5 ';

    const configsXNone = xyPlotManager.getXyConfigs();
    assert.strictEqual(configsXNone.xType, 'none');
    assert.deepStrictEqual(configsXNone.xValues, [null]);
    assert.strictEqual(configsXNone.yType, 'scale');
    assert.deepStrictEqual(configsXNone.yValues, [5.0, 7.5]);

    const gridXNone = xyPlotManager.generateParamGrid(baseParams);
    assert.strictEqual(gridXNone.length, 2); // 1 (X none) * 2 (Y scale) = 2 cells
    assert.strictEqual(gridXNone[0].params.steps, 28); // steps stays as baseParams.steps
    assert.strictEqual(gridXNone[0].params.scale, 5.0);
    assert.strictEqual(gridXNone[0].xyInfo, 'Scale: 5');
    assert.strictEqual(gridXNone[1].params.steps, 28);
    assert.strictEqual(gridXNone[1].params.scale, 7.5);
    assert.strictEqual(gridXNone[1].xyInfo, 'Scale: 7.5');

    // Test getXyConfigs with Y axis set to 'none'
    getOrCreateMockElement('xyPlotXType').value = 'steps';
    getOrCreateMockElement('xyPlotXValues').value = ' 10, 20 , 30 ';
    getOrCreateMockElement('xyPlotYType').value = 'none';
    getOrCreateMockElement('xyPlotYValues').value = ' 5.0, 7.5 '; // Should be ignored

    const configsYNone = xyPlotManager.getXyConfigs();
    assert.strictEqual(configsYNone.xType, 'steps');
    assert.deepStrictEqual(configsYNone.xValues, [10, 20, 30]);
    assert.strictEqual(configsYNone.yType, 'none');
    assert.deepStrictEqual(configsYNone.yValues, [null]);

    const gridYNone = xyPlotManager.generateParamGrid(baseParams);
    assert.strictEqual(gridYNone.length, 3); // 3 (X steps) * 1 (Y none) = 3 cells
    assert.strictEqual(gridYNone[0].params.steps, 10);
    assert.strictEqual(gridYNone[0].params.scale, 7.0); // scale stays as baseParams.scale
    assert.strictEqual(gridYNone[0].xyInfo, 'Steps: 10');

    // Test getXyConfigs with both axes set to 'none'
    getOrCreateMockElement('xyPlotXType').value = 'none';
    getOrCreateMockElement('xyPlotYType').value = 'none';

    const configsBothNone = xyPlotManager.getXyConfigs();
    assert.deepStrictEqual(configsBothNone.xValues, [null]);
    assert.deepStrictEqual(configsBothNone.yValues, [null]);

    const gridBothNone = xyPlotManager.generateParamGrid(baseParams);
    assert.strictEqual(gridBothNone.length, 1);
    assert.strictEqual(gridBothNone[0].params.steps, 28);
    assert.strictEqual(gridBothNone[0].params.scale, 7.0);
    assert.strictEqual(gridBothNone[0].xyInfo, null);
  });

  it('should run RandomPromptManager tests', () => {
    const manager = new RandomPromptManager();
    
    // Check defaults
    assert.strictEqual(manager.isEnabled(), false);
    const cats = manager.getCategories();
    assert.strictEqual(cats.length, 4);
    assert.strictEqual(cats[0].name, '服装');
    assert.strictEqual(cats[0].enabled, true);
    assert.strictEqual(cats[0].custom, false);

    // Test enabled global state
    manager.setEnabled(true);
    assert.strictEqual(manager.isEnabled(), true);

    // Test addCategory
    const addRes1 = manager.addCategory('  ');
    assert.ok(addRes1.error);
    
    const addRes2 = manager.addCategory('服装'); // Already exists
    assert.ok(addRes2.error);

    const addRes3 = manager.addCategory('背景', 'sky, cloud; night, stars');
    assert.strictEqual(addRes3.success, true);
    assert.strictEqual(addRes3.category.name, '背景');
    assert.strictEqual(addRes3.category.content, 'sky, cloud; night, stars');
    assert.strictEqual(addRes3.category.custom, true);
    assert.strictEqual(manager.getCategories().length, 5);

    // Test updateCategory
    const updRes1 = manager.updateCategory('背景', { enabled: false, content: 'noon, sun; rain, wet' });
    assert.strictEqual(updRes1.success, true);
    const cat = manager.getCategories().find(c => c.name === '背景');
    assert.strictEqual(cat.enabled, false);
    assert.strictEqual(cat.content, 'noon, sun; rain, wet');

    // Test removeCategory
    const delRes1 = manager.removeCategory('非真实分类');
    assert.ok(delRes1.error);

    const delRes2 = manager.removeCategory('背景');
    assert.strictEqual(delRes2.success, true);
    assert.strictEqual(manager.getCategories().length, 4);

    // Test getRandomSelection
    manager.setEnabled(true);
    // Disable all except Clothing (服装)
    manager.getCategories().forEach(c => {
      manager.updateCategory(c.name, { enabled: c.name === '服装' });
    });
    // Set a predictable content for 服装
    manager.updateCategory('服装', { content: 'only_clothing' });
    
    const selection = manager.getRandomSelection();
    assert.strictEqual(selection.selectedTags, 'only_clothing');
    assert.deepStrictEqual(selection.individualSelections, { '服装': 'only_clothing' });

    // Test export/import
    const exported = manager.exportData();
    const importedManager = new RandomPromptManager();
    const importRes = importedManager.importData(exported);
    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importedManager.isEnabled(), true);
    assert.strictEqual(importedManager.getCategories().length, 4);
    assert.strictEqual(importedManager.getCategories().find(c => c.name === '服装').content, 'only_clothing');
  });

});
