import assert from 'assert';
import { PromptHelper } from '../src/prompt-helper.js';
import { NotebookManager } from '../src/notebook.js';

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

console.log('--- All Tests Passed Successfully! ---');
