import { describe, it } from 'vitest';
import assert from 'assert';
import { PromptHelper } from '../src/prompt-helper.js';
import { NotebookManager } from '../src/notebook.js';
import { VibeManager } from '../src/vibe-manager.js';
import { SettingsManager } from '../src/settings-manager.js';
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
  
});
