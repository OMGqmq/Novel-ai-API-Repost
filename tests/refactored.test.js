import assert from 'assert';
import { PromptHelper } from '../src/prompt-helper.js';
import { NotebookManager } from '../src/notebook.js';
import { VibeManager } from '../src/vibe-manager.js';

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
    clear() { this.store = {}; }
};

// ----------------- Test PromptHelper -----------------
console.log('--- Testing PromptHelper ---');

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
console.log('✔ calculateWeight tests passed.');

// 2. cleanTag
assert.strictEqual(promptHelper.cleanTag('(masterpiece)'), 'masterpiece');
assert.strictEqual(promptHelper.cleanTag('((masterpiece))'), 'masterpiece');
assert.strictEqual(promptHelper.cleanTag('[masterpiece]'), 'masterpiece');
assert.strictEqual(promptHelper.cleanTag('1.5::masterpiece::'), 'masterpiece');
assert.strictEqual(promptHelper.cleanTag(' -0.5::solo '), 'solo');
console.log('✔ cleanTag tests passed.');

// 3. expandPromptTags
assert.deepStrictEqual(promptHelper.expandPromptTags('masterpiece, 1girl'), ['masterpiece', '1girl']);
assert.deepStrictEqual(promptHelper.expandPromptTags('(masterpiece, 1girl)'), ['(masterpiece)', '(1girl)']);
assert.deepStrictEqual(promptHelper.expandPromptTags('1.5::masterpiece, 1girl::'), ['1.5::masterpiece::', '1.5::1girl::']);
console.log('✔ expandPromptTags tests passed.');

// ----------------- Test NotebookManager -----------------
console.log('--- Testing NotebookManager ---');

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
console.log('✔ save/getNotebookNotes tests passed.');

// 2. Merging notes
const currentNotes = [
    { id: '1', prompt: 'masterpiece', negative: 'bad', createdAt: 1000 }
];
const importedNotes = [
    { id: '1', prompt: 'masterpiece', negative: 'bad', createdAt: 1000 }, // duplicate
    { id: '2', prompt: '1girl', negative: 'lowres', createdAt: 2000 }      // new
];
const merged = notebookManager._mergeNotes(currentNotes, importedNotes);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0].id, '2'); // newest first
assert.strictEqual(merged[1].id, '1');
console.log('✔ merging notes tests passed.');

// 3. Applying note
notebookManager.applyNote('v3', '1');
assert.deepStrictEqual(appliedNotes, {
    prompt: 'masterpiece',
    negative: 'bad',
    model: 'v3'
});
console.log('✔ applyNote tests passed.');

// ----------------- Test VibeManager -----------------
console.log('--- Testing VibeManager ---');

// Set up the DOM registry and elements
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
console.log('✔ getVibeKey tests passed.');

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
console.log('✔ loadState raw image (v3) tests passed.');

// 3. isValidForModel validation
// V3 model with raw image -> valid
assert.deepStrictEqual(vibeManager.isValidForModel('v3'), { isValid: true });
// V4.5 model with raw image -> invalid (Anlas warning)
const validationV45 = vibeManager.isValidForModel('v4.5');
assert.strictEqual(validationV45.isValid, false);
assert.ok(validationV45.error.includes('Anlas'));
console.log('✔ isValidForModel validation tests passed.');

// 4. getPayloadParams
const payloadParams = vibeManager.getPayloadParams('v3');
assert.strictEqual(payloadParams.vibe_image, 'raw_image_data_v3');
assert.strictEqual(payloadParams.vibe_strength, 0.75);
console.log('✔ getPayloadParams tests passed.');

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
console.log('✔ handleVibeImage JSON tests passed.');

// 6. clearVibeImage
vibeManager.clearVibeImage('v3');
assert.strictEqual(vibeManager.currentVibeImageBase64, null);
assert.strictEqual(vibeManager.currentVibeIsJson, false);
assert.deepStrictEqual(vibeManager.availableVibeEncodings, []);
console.log('✔ clearVibeImage tests passed.');

console.log('--- All Tests Passed Successfully! ---');
