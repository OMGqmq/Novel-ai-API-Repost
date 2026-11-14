import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SettingsManager } from '../src/settings-manager.js';
import { GalleryStore } from '../src/storage.js';
import { PromptHelper } from '../src/prompt-helper.js';
import { RandomPromptController } from '../src/random-prompt-controller.js';
import { CharPromptManager } from '../src/char-prompt-manager.js';
import { UIController } from '../src/ui.js';

const root = path.resolve(import.meta.dirname, '..');

function createMiniElement(tagName = 'div', idRegistry = null) {
    const listeners = {};
    const attrs = new Map();
    const classSet = new Set();
    let _id = '';

    const el = {
        tagName: tagName.toUpperCase(),
        get id() {
            return _id;
        },
        set id(v) {
            _id = v;
            if (idRegistry && v) idRegistry.set(v, el);
        },
        name: '',
        type: '',
        value: '',
        defaultValue: undefined,
        checked: false,
        disabled: false,
        rows: 2,
        placeholder: '',
        selectionStart: 0,
        children: [],
        parentNode: null,
        parentElement: null,
        isConnected: true,
        _innerHTML: '',
        _textContent: '',
        classList: {
            add: (...cls) => cls.forEach((c) => classSet.add(c)),
            remove: (...cls) => cls.forEach((c) => classSet.delete(c)),
            contains: (c) => classSet.has(c),
            toggle: (c, force) => {
                if (typeof force === 'boolean') {
                    if (force) classSet.add(c);
                    else classSet.delete(c);
                    return force;
                }
                if (classSet.has(c)) {
                    classSet.delete(c);
                    return false;
                }
                classSet.add(c);
                return true;
            }
        },
        set className(val) {
            classSet.clear();
            String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c));
        },
        get className() {
            return Array.from(classSet).join(' ');
        },
        set innerHTML(val) {
            el._innerHTML = String(val || '');
            if (el._innerHTML === '') {
                el.children.forEach((c) => {
                    c.parentNode = null;
                    c.parentElement = null;
                });
                el.children = [];
            }
        },
        get innerHTML() {
            return el._innerHTML;
        },
        set textContent(val) {
            el._textContent = String(val ?? '');
        },
        get textContent() {
            return el._textContent || el.children.map((c) => c.textContent).join('');
        },
        setAttribute(k, v) {
            if (k === 'disabled') el.disabled = true;
            attrs.set(k, String(v));
        },
        getAttribute(k) {
            return attrs.has(k) ? attrs.get(k) : null;
        },
        removeAttribute(k) {
            if (k === 'disabled') el.disabled = false;
            attrs.delete(k);
        },
        appendChild(child) {
            if (child.parentNode && Array.isArray(child.parentNode.children)) {
                child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
            }
            child.parentNode = el;
            child.parentElement = el;
            el.children.push(child);
            return child;
        },
        insertBefore(newNode, refNode) {
            if (newNode.parentNode && Array.isArray(newNode.parentNode.children)) {
                newNode.parentNode.children = newNode.parentNode.children.filter((c) => c !== newNode);
            }
            newNode.parentNode = el;
            newNode.parentElement = el;
            const idx = refNode ? el.children.indexOf(refNode) : -1;
            if (idx === -1) el.children.push(newNode);
            else el.children.splice(idx, 0, newNode);
            return newNode;
        },
        addEventListener(type, fn) {
            (listeners[type] ||= []).push(fn);
        },
        dispatchEvent(evt) {
            evt.target ||= el;
            evt.currentTarget = el;
            (listeners[evt.type] || []).forEach((fn) => fn(evt));
            return !evt.defaultPrevented;
        },
        focus() {},
        select() {},
        setSelectionRange(start) {
            el.selectionStart = start;
        },
        closest() {
            return null;
        },
        querySelector(sel) {
            if (sel === 'svg') {
                const svg = createMiniElement('svg', idRegistry);
                el.appendChild(svg);
                return svg;
            }
            if (sel.startsWith('#')) {
                const targetId = sel.slice(1);
                if (!el._subMap) el._subMap = {};
                if (!el._subMap[targetId]) {
                    const sub = createMiniElement('div', idRegistry);
                    sub.id = targetId;
                    el._subMap[targetId] = sub;
                }
                return el._subMap[targetId];
            }
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
    return el;
}

describe('Regression Suite: Random Prompt Contamination & Switch Alignment', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const charSrc = fs.readFileSync(path.join(root, 'src/char-prompt-manager.js'), 'utf8');
    const notebookSrc = fs.readFileSync(path.join(root, 'src/notebook.js'), 'utf8');
    const rpControllerSrc = fs.readFileSync(path.join(root, 'src/random-prompt-controller.js'), 'utf8');

    describe('Bug 1: Form-State Restoration Hardening & Markup Integrity', () => {
        it('ensures every static <textarea> in index.html has a unique name and autocomplete="off"', () => {
            const tags = html.match(/<textarea\b[^>]*>/g) || [];
            expect(tags.length).toBeGreaterThanOrEqual(7);

            const names = new Set();
            for (const tag of tags) {
                const nameMatch = tag.match(/\bname="([^"]+)"/);
                expect(nameMatch, `Missing name on textarea: ${tag}`).toBeTruthy();
                expect(names.has(nameMatch[1]), `Duplicate textarea name: ${nameMatch[1]}`).toBe(false);
                names.add(nameMatch[1]);
                expect(tag, `Missing autocomplete="off" on textarea: ${tag}`).toMatch(/\bautocomplete="off"/);
            }

            expect(names.has('nai_main_prompt')).toBe(true);
            expect(names.has('nai_main_negative_prompt')).toBe(true);
            expect(names.has('nai_insp_prompt_preview')).toBe(true);
            expect(names.has('nai_ai_chat_system_prompt')).toBe(true);
            expect(names.has('nai_ai_chat_input')).toBe(true);
            expect(names.has('nai_ai_helper_system_prompt')).toBe(true);
            expect(names.has('nai_gen_cards_output')).toBe(true);
        });

        it('ensures dynamic inputs in notebook.js, char-prompt-manager.js, and random-prompt-controller.js opt out of cross-restoration', () => {
            expect(notebookSrc).toMatch(/id="editNotePrompt"[^>]*name="nai_edit_note_prompt"[^>]*autocomplete="off"/);
            expect(notebookSrc).toMatch(/id="editNoteNeg"[^>]*name="nai_edit_note_neg"[^>]*autocomplete="off"/);

            expect(rpControllerSrc).toContain('checkbox.name = `nai_rp_chk_${idx}`');
            expect(rpControllerSrc).toContain("checkbox.setAttribute('autocomplete', 'off')");
            expect(rpControllerSrc).toContain('textarea.name = `nai_rp_txt_${idx}`');
            expect(rpControllerSrc).toContain("textarea.setAttribute('autocomplete', 'off')");

            expect(charSrc).toMatch(/class="char-enable-toggle[^"]*"[^>]*autocomplete="off"/);
            expect(charSrc).toMatch(/class="char-auto-pos[^"]*"[^>]*autocomplete="off"/);
            expect(charSrc).toMatch(/autocomplete="off"[^>]*class="char-prompt-input/);
            expect(charSrc).toMatch(/autocomplete="off"[^>]*class="char-neg-input/);
        });

        it('GalleryStore.hasSetting & SettingsManager.bind clear/reset dirty browser-restored #prompt and #negativePrompt values', () => {
            localStorage.clear();
            const origDoc = globalThis.document;
            const origEvent = globalThis.Event;

            globalThis.Event = class MockEvent {
                constructor(type, opts = {}) {
                    this.type = type;
                    this.bubbles = !!opts.bubbles;
                }
            };

            const byId = {};
            globalThis.document = {
                getElementById: (id) => (byId[id] ||= createMiniElement('div')),
                documentElement: { classList: { add: () => {}, remove: () => {}, contains: () => false } }
            };

            try {
                const store = new GalleryStore();
                expect(store.hasSetting('nai_prompt')).toBe(false);

                const createMockUi = (promptVal, promptDef, negVal, negDef) => {
                    const promptEl = createMiniElement('textarea');
                    promptEl.id = 'prompt';
                    promptEl.value = promptVal;
                    promptEl.defaultValue = promptDef;

                    const negEl = createMiniElement('textarea');
                    negEl.id = 'negativePrompt';
                    negEl.value = negVal;
                    negEl.defaultValue = negDef;

                    const selectEl = createMiniElement('select');
                    selectEl.value = 'k_euler';
                    // select elements have defaultValue === undefined in DOM
                    selectEl.defaultValue = undefined;

                    return {
                        els: {
                            prompt: promptEl,
                            negative: negEl,
                            sampler: selectEl
                        },
                        updateLowPerfUI: () => {},
                        updateAdminUI: () => {},
                        setModel: () => {}
                    };
                };

                // Case A: Explicit empty nai_prompt ('') must wipe stale restored value in #prompt
                localStorage.setItem('nai_prompt', '');
                expect(store.hasSetting('nai_prompt')).toBe(true);
                const uiA = createMockUi('white bloomers,puffy dress,;,maid apron,maid,;,', '', 'lowres', 'lowres');
                let firedInput = false;
                uiA.els.prompt.addEventListener('input', () => { firedInput = true; });
                new SettingsManager().bind(uiA, store, {});
                expect(uiA.els.prompt.value).toBe('');
                expect(firedInput).toBe(true);

                // Case B: Unset nai_prompt & nai_negative_prompt must reset back to defaultValue when dirtied
                localStorage.clear();
                expect(store.hasSetting('nai_prompt')).toBe(false);
                const uiB = createMockUi(
                    'white bloomers,puffy dress,;,maid apron,maid,;,',
                    '',
                    'wrong_restored_neg',
                    'lowres, bad anatomy, bad hands, text, error'
                );
                new SettingsManager().bind(uiB, store, {});
                expect(uiB.els.prompt.value).toBe('');
                expect(uiB.els.negative.value).toBe('lowres, bad anatomy, bad hands, text, error');
                expect(uiB.els.sampler.value).toBe('k_euler');

                // Case C: Populated nai_prompt must win over any stale value
                localStorage.setItem('nai_prompt', 'masterpiece, 1girl');
                const uiC = createMockUi('white bloomers,puffy dress,;,maid apron,maid,;,', '', '', '');
                new SettingsManager().bind(uiC, store, {});
                expect(uiC.els.prompt.value).toBe('masterpiece, 1girl');
            } finally {
                globalThis.document = origDoc;
                globalThis.Event = origEvent;
                localStorage.clear();
            }
        });

        it('PromptHelper isolates registerInput() from main #prompt, handles ; / , / \\n delimiters, and safely detaches on close/tab switch', () => {
            vi.useFakeTimers();
            const origDoc = globalThis.document;
            const origWin = globalThis.window;
            const origEvent = globalThis.Event;

            globalThis.Event = class MockEvent {
                constructor(type, opts = {}) {
                    this.type = type;
                    this.bubbles = !!opts.bubbles;
                }
            };

            const elemMap = new Map();
            const makeTrackedEl = (tag) => {
                const el = createMiniElement(tag);
                const origSetId = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'id');
                let _id = '';
                Object.defineProperty(el, 'id', {
                    get() { return _id; },
                    set(v) {
                        _id = v;
                        if (v) elemMap.set(v, el);
                    }
                });
                return el;
            };

            globalThis.document = {
                createElement: (tag) => makeTrackedEl(tag),
                getElementById: (id) => elemMap.get(id) || null,
                querySelectorAll: () => []
            };
            globalThis.window = {};

            try {
                const mainPromptEl = makeTrackedEl('textarea');
                mainPromptEl.id = 'prompt';
                mainPromptEl.value = '1girl, solo';

                const containerEl = makeTrackedEl('div');
                containerEl.id = 'promptHelperContainer';
                const searchInputEl = makeTrackedEl('input');
                searchInputEl.id = 'tagSearchInput';
                const searchBtnEl = makeTrackedEl('button');
                searchBtnEl.id = 'tagSearchBtn';
                const searchResultsEl = makeTrackedEl('div');
                searchResultsEl.id = 'tagResults';

                const helper = new PromptHelper({
                    promptEl: mainPromptEl,
                    containerEl,
                    searchInputEl,
                    searchBtnEl,
                    searchResultsEl,
                    tagData: {
                        'white bloomers': '白色灯笼裤',
                        'puffy dress': '蓬松连衣裙',
                        'maid apron': '女仆围裙',
                        'maid headdress': '女仆头饰',
                        '1girl': '一个女孩',
                        'solo': '单人'
                    },
                    onShowToast: () => {}
                });
                helper.tagCategoryMap = {
                    'white bloomers': 'clothing',
                    'puffy dress': 'clothing',
                    'maid apron': 'clothing',
                    'maid headdress': 'clothing',
                    '1girl': 'character',
                    'solo': 'character'
                };
                globalThis.window.promptHelperInstance = helper;

                // Simulate opening Random Prompts tab & registering rp-txt-服装
                const rpTextarea = makeTrackedEl('textarea');
                rpTextarea.id = 'rp-txt-服装';
                rpTextarea.value = 'white bloomers,puffy dress,;,maid apron,maid,;,';
                const rpPlaceholder = makeTrackedEl('div');
                rpPlaceholder.id = 'rp-placeholder-服装';

                helper.registerInput(rpTextarea, rpPlaceholder);

                // main promptEl and mainPromptEl must NEVER be hijacked by registerInput()
                expect(helper.promptEl).toBe(mainPromptEl);
                expect(helper.mainPromptEl).toBe(mainPromptEl);
                expect(mainPromptEl.value).toBe('1girl, solo');

                // Focus rpTextarea & type partial tag after ';,' delimiters
                rpTextarea.selectionStart = rpTextarea.value.indexOf('maid,') + 4; // on second "maid"
                const tagInfo = helper.getActiveTagInfo(rpTextarea);
                expect(tagInfo.query).toBe('maid');
                expect(tagInfo.rawQuery).toBe('maid');

                rpTextarea.dispatchEvent({ type: 'focus' });
                vi.advanceTimersByTime(200);
                expect(helper.suggestPanel.parentNode).toBe(rpPlaceholder);
                expect(helper.suggestPanel.classList.contains('hidden')).toBe(false);

                // Select suggestion on rpTextarea: must update ONLY rpTextarea, leaving main #prompt untouched
                helper.selectSuggestion('maid headdress', rpTextarea);
                expect(rpTextarea.value).toBe('white bloomers,puffy dress,;,maid apron,maid headdress,;,');
                expect(mainPromptEl.value).toBe('1girl, solo');

                // Searching and clicking a tag in Search results must STILL insert into #prompt, NEVER rpTextarea
                searchInputEl.value = 'maid';
                searchBtnEl.onclick();
                const resultItems = searchResultsEl.children;
                expect(resultItems.length).toBeGreaterThan(0);
                const beforeRp = rpTextarea.value;
                resultItems[0].onclick();
                expect(mainPromptEl.value).toContain('1girl, solo,');
                expect(rpTextarea.value).toBe(beforeRp);

                // Blur/disconnect protection: stale timer must NOT reveal panel after blur
                rpTextarea.dispatchEvent({ type: 'input' });
                rpTextarea.dispatchEvent({ type: 'blur' });
                vi.advanceTimersByTime(300);
                expect(helper.suggestPanel.classList.contains('hidden')).toBe(true);

                // Tab switch & drawer close must detachSuggestPanel back to main containerEl
                rpPlaceholder.appendChild(helper.suggestPanel);
                helper.suggestPanel.classList.remove('hidden');

                const uiCtrl = {
                    els: {
                        tabSearch: createMiniElement('button'),
                        tabNotebook: createMiniElement('button'),
                        tabRandom: createMiniElement('button'),
                        viewSearch: createMiniElement('div'),
                        viewNotebook: createMiniElement('div'),
                        viewRandom: createMiniElement('div'),
                        sideDrawer: Object.assign(createMiniElement('div'), { inert: true }),
                        drawerOverlay: createMiniElement('div')
                    }
                };
                uiCtrl.els.sideDrawer.classList.add('drawer-closed');
                UIController.prototype.switchDrawerTab.call(uiCtrl, 'search');
                expect(helper.suggestPanel.parentNode).toBe(containerEl);
                expect(helper.suggestPanel.classList.contains('hidden')).toBe(true);

                // Open drawer then close drawer
                UIController.prototype.toggleDrawer.call(uiCtrl);
                rpPlaceholder.appendChild(helper.suggestPanel);
                helper.suggestPanel.classList.remove('hidden');
                UIController.prototype.toggleDrawer.call(uiCtrl);
                expect(helper.suggestPanel.parentNode).toBe(containerEl);
                expect(helper.suggestPanel.classList.contains('hidden')).toBe(true);
            } finally {
                vi.useRealTimers();
                globalThis.document = origDoc;
                globalThis.window = origWin;
                globalThis.Event = origEvent;
            }
        });

        it('RandomPromptController renders safely for arbitrary category names and toggles fold on chevron click', () => {
            const origDoc = globalThis.document;
            const origWin = globalThis.window;

            const elemMap = new Map();
            const makeEl = (tag) => createMiniElement(tag, elemMap);

            globalThis.document = {
                createElement: (tag) => makeEl(tag),
                getElementById: (id) => elemMap.get(id) || null
            };
            globalThis.window = {};

            try {
                const listContainer = makeEl('div');
                listContainer.id = 'randomPromptCategoriesContainer';

                const catName = 'special "服装" & <script>';
                const controller = new RandomPromptController();
                const manager = {
                    isEnabled: () => true,
                    getCategories: () => [
                        { name: catName, enabled: true, content: 'white bloomers,puffy dress,;,maid apron,maid,;,', custom: true }
                    ]
                };
                const detachSpy = vi.fn();
                const registerSpy = vi.fn();
                controller.bind(manager, { detachSuggestPanel: detachSpy, registerInput: registerSpy });

                controller.renderList();
                expect(detachSpy).toHaveBeenCalledTimes(1);
                expect(registerSpy).toHaveBeenCalledTimes(1);

                const txt = elemMap.get(`rp-txt-${catName}`);
                const body = elemMap.get(`rp-body-${catName}`);
                const chevron = elemMap.get(`rp-chevron-${catName}`);
                const header = elemMap.get(`rp-header-${catName}`);
                expect(txt).toBeTruthy();
                expect(txt.name).toBe('nai_rp_txt_0');
                expect(txt.getAttribute('autocomplete')).toBe('off');
                expect(txt.value).toBe('white bloomers,puffy dress,;,maid apron,maid,;,');

                // Find fold button in header's rightGroup and click it
                const rightGroup = header.children[1];
                const foldBtn = rightGroup.children.find((btn) => btn.getAttribute('aria-label') === '展开或收起');
                expect(foldBtn).toBeTruthy();

                expect(body.classList.contains('hidden')).toBe(false);
                foldBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
                expect(body.classList.contains('hidden')).toBe(true);
                expect(chevron.classList.contains('-rotate-90')).toBe(true);

                foldBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
                expect(body.classList.contains('hidden')).toBe(false);
                expect(chevron.classList.contains('-rotate-90')).toBe(false);
            } finally {
                globalThis.document = origDoc;
                globalThis.window = origWin;
            }
        });
    });

    describe('Bug 2 & Bug 3: Toggle Thumb & Flex Anti-Squish Alignment', () => {
        it('guards every role="switch" in index.html against flex compression and positioning drift', () => {
            // Check Random Prompt header switch specifically
            const rpHeader = html.match(/id="view-random"[\s\S]*?id="randomPromptEnabled"[\s\S]*?<\/label>/);
            expect(rpHeader).toBeTruthy();
            expect(rpHeader[0]).toContain('gap-3');
            expect(rpHeader[0]).toContain('min-w-0 flex-1');
            expect(rpHeader[0]).toContain('whitespace-nowrap shrink-0');

            // Check EVERY static role="switch" input + adjacent track div pair
            const switchPairs = [...html.matchAll(/<label\b([^>]*)>\s*<input\b([^>]*role="switch"[^>]*)>\s*<div\b([^>]*)><\/div>/g)];
            expect(switchPairs.length).toBeGreaterThanOrEqual(15);

            for (const [, labelAttrs, inputAttrs, divAttrs] of switchPairs) {
                expect(labelAttrs, `Switch <label> missing shrink-0: ${labelAttrs}`).toContain('shrink-0');
                expect(inputAttrs, `Switch <input> missing autocomplete="off": ${inputAttrs}`).toContain('autocomplete="off"');
                expect(divAttrs, `Switch track <div> missing relative: ${divAttrs}`).toContain('relative');
                expect(divAttrs, `Switch track <div> missing shrink-0: ${divAttrs}`).toContain('shrink-0');
            }
        });

        it('aligns character prompt enable & auto-pos switch thumbs with exact symmetric 2px insets and no scale-90 distortion', () => {
            // 1. Character enable switch
            const enableMatch = charSrc.match(/<label\b([^>]*)>\s*<input\b[^>]*char-enable-toggle[^>]*>\s*<div\b([^>]*)><\/div>\s*<span\b([^>]*)>/);
            expect(enableMatch).toBeTruthy();
            const [, enLabel, enTrack, enSpan] = enableMatch;
            expect(enLabel).toContain('shrink-0');
            expect(enLabel).not.toContain('scale-90');
            expect(enTrack).toContain('w-6 h-3.5 shrink-0');
            expect(enTrack).toContain('after:top-[2px] after:left-[2px]');
            expect(enTrack).toContain('after:h-2.5 after:w-2.5');
            expect(enTrack).toContain('relative');
            expect(enTrack).not.toContain('after:top-[1px]');
            expect(enTrack).not.toContain('after:left-[1px]');
            expect(enSpan).toContain('whitespace-nowrap shrink-0');

            // 2. Character auto-pos switch
            const autoPosMatch = charSrc.match(/<label\b([^>]*)>\s*<input\b[^>]*char-auto-pos[^>]*>\s*<div\b([^>]*)><\/div>\s*<span\b([^>]*)>/);
            expect(autoPosMatch).toBeTruthy();
            const [, apLabel, apTrack, apSpan] = autoPosMatch;
            expect(apLabel).toContain('shrink-0');
            expect(apLabel).not.toContain('scale-90');
            expect(apTrack).toContain('w-7 h-4 shrink-0');
            expect(apTrack).toContain('after:top-[2px] after:left-[2px]');
            expect(apTrack).toContain('after:h-3 after:w-3');
            expect(apTrack).toContain('relative');
            expect(apSpan).toContain('whitespace-nowrap shrink-0');

            // 3. Summary/position title truncation + applyEnabledState keeps aria-checked & nowrap
            expect(charSrc).toContain('char-pos-title min-w-0 truncate');
            expect(charSrc).toContain('char-enable-text text-green-600 dark:text-green-500 whitespace-nowrap shrink-0');
            expect(charSrc).toContain('char-enable-text text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0');
            expect(charSrc).toContain("enableToggle.setAttribute('aria-checked'");
        });

        it('CharacterPromptManager synchronizes aria-checked and nowrap classes when toggling enabled state', () => {
            const origDoc = globalThis.document;
            const elemMap = new Map();
            const container = createMiniElement('div');
            container.id = 'characterPromptsContainer';
            elemMap.set('characterPromptsContainer', container);

            let createdRow = null;
            globalThis.document = {
                createElement: () => {
                    const row = createMiniElement('div');
                    const enToggle = createMiniElement('input');
                    enToggle.checked = true;
                    const enText = createMiniElement('span');
                    const pInput = createMiniElement('input');
                    const nInput = createMiniElement('input');
                    const aInput = createMiniElement('input');
                    const posX = createMiniElement('input');
                    const posY = createMiniElement('input');
                    const header = createMiniElement('div');
                    const content = createMiniElement('div');
                    const chevron = createMiniElement('svg');
                    const actions = createMiniElement('div');
                    const pad = Object.assign(createMiniElement('div'), {
                        getBoundingClientRect: () => ({ left: 0, top: 0, width: 140, height: 205 })
                    });
                    const pin = Object.assign(createMiniElement('div'), { style: {} });
                    const coords = createMiniElement('div');
                    const pinIndex = createMiniElement('span');
                    const v5Wrap = createMiniElement('div');
                    const v45Wrap = createMiniElement('div');
                    const summary = createMiniElement('span');
                    const idxLabel = createMiniElement('span');

                    row.querySelector = (sel) => ({
                        '.char-enable-toggle': enToggle,
                        '.char-enable-text': enText,
                        '.char-row-header': header,
                        '.char-row-content': content,
                        '.char-row-chevron': chevron,
                        '.char-row-actions': actions,
                        '.char-prompt-input': pInput,
                        '.char-neg-input': nInput,
                        '.char-auto-pos': aInput,
                        '.char-pos-x': posX,
                        '.char-pos-y': posY,
                        '.char-pos-pad': pad,
                        '.char-pos-pin': pin,
                        '.char-pos-coords': coords,
                        '.char-pos-pin-index': pinIndex,
                        '.char-v5-pos-wrapper': v5Wrap,
                        '.char-v45-grid-wrapper': v45Wrap,
                        '.char-row-summary': summary,
                        '.character-index-label': idxLabel
                    }[sel] || null);
                    row.querySelectorAll = (sel) => {
                        if (sel === '.char-prompt-input, .char-neg-input, .char-auto-pos') return [pInput, nInput, aInput];
                        return [];
                    };
                    createdRow = { row, enToggle, enText };
                    return row;
                },
                getElementById: (id) => elemMap.get(id) || null,
                querySelectorAll: () => (createdRow ? [createdRow.row] : [])
            };

            try {
                const mgr = new CharPromptManager();
                mgr.addCharacterPromptRow('1girl', '', 0.5, 0.5, true, true, true);
                expect(createdRow).toBeTruthy();
                expect(createdRow.enToggle.getAttribute('aria-checked')).toBe('true');

                createdRow.enToggle.checked = false;
                createdRow.enToggle.dispatchEvent({ type: 'change' });
                expect(createdRow.enToggle.getAttribute('aria-checked')).toBe('false');
                expect(createdRow.enText.className).toContain('whitespace-nowrap');
                expect(createdRow.enText.className).toContain('shrink-0');
                expect(createdRow.enText.textContent).toBe('已禁用');
            } finally {
                globalThis.document = origDoc;
            }
        });
    });
});
