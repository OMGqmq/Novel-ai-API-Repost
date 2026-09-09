import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CharPromptManager } from '../src/char-prompt-manager.js';

describe('CharPromptManager Model-Specific Storage & Lightbox Adaptations', () => {
  let store;
  let manager;
  let originalDocument;
  let rowsInDom = [];

  function createMockNode() {
    const node = {
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      style: {},
      value: '',
      checked: true,
      textContent: '',
      innerHTML: '',
      children: [],
      appendChild: (c) => node.children.push(c),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
      querySelectorAll: (sel) => {
        if (sel === '.character-prompt-row') return rowsInDom;
        return [];
      },
      querySelector: (sel) => {
        const child = createMockNode();
        if (sel === '.char-enable-toggle') child.checked = node.enabled !== false;
        else if (sel === '.char-prompt-input') child.value = node.prompt || '';
        else if (sel === '.char-neg-input') child.value = node.negative || '';
        else if (sel === '.char-pos-x') child.value = String(node.x ?? 0.5);
        else if (sel === '.char-pos-y') child.value = String(node.y ?? 0.5);
        else if (sel === '.char-auto-pos') child.checked = node.autoPos !== false;
        return child;
      }
    };
    return node;
  }

  beforeEach(() => {
    rowsInDom = [];
    const storageMap = {};
    store = {
      getSetting: (k, d = null) => (storageMap[k] !== undefined ? storageMap[k] : d),
      setSetting: (k, v) => { storageMap[k] = String(v); },
      storageMap
    };

    originalDocument = global.document;
    global.document = {
      createElement: () => {
        const el = createMockNode();
        return el;
      },
      getElementById: (id) => {
        if (id === 'characterPromptsContainer') {
          return {
            get innerHTML() { return ''; },
            set innerHTML(val) { if (val === '') rowsInDom = []; },
            appendChild: (child) => rowsInDom.push(child),
            querySelectorAll: (sel) => (sel === '.character-prompt-row' ? rowsInDom : [])
          };
        }
        return createMockNode();
      },
      querySelectorAll: () => []
    };

    manager = new CharPromptManager();
    manager.bind(store);
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it('1. should resolve correct storage key per model (v4.5 vs v5)', () => {
    expect(manager.getCharPromptKey('v4.5')).toBe('nai_v45_character_prompts');
    expect(manager.getCharPromptKey('v5')).toBe('nai_v5_character_prompts');
    expect(manager.getCharPromptKey('v3')).toBe('nai_v45_character_prompts');
  });

  it('2. should save character prompts to model-specific key', () => {
    const mockRow = createMockNode();
    mockRow.prompt = '1girl, blonde hair';
    mockRow.negative = 'lowres';
    mockRow.x = 0.25;
    mockRow.y = 0.75;
    mockRow.autoPos = false;
    mockRow.enabled = true;
    rowsInDom.push(mockRow);

    manager.currentModel = 'v5';
    manager.saveCharacterPromptsState('v5');
    expect(store.storageMap['nai_v5_character_prompts']).toBeDefined();
    const v5Data = JSON.parse(store.storageMap['nai_v5_character_prompts']);
    expect(v5Data.length).toBe(1);
    expect(v5Data[0].prompt).toBe('1girl, blonde hair');
    expect(v5Data[0].x).toBe(0.25);
    expect(v5Data[0].y).toBe(0.75);

    manager.saveCharacterPromptsState('v4.5');
    expect(store.storageMap['nai_v45_character_prompts']).toBeDefined();
  });

  it('3. should isolate character prompts between V4.5 and V5 upon model change', () => {
    store.setSetting('nai_v45_character_prompts', JSON.stringify([
      { prompt: 'v4.5 character', negative: '', x: 0.5, y: 0.5, autoPos: true, enabled: true }
    ]));
    store.setSetting('nai_v5_character_prompts', JSON.stringify([
      { prompt: 'v5 character A', negative: '', x: 0.1, y: 0.2, autoPos: false, enabled: true },
      { prompt: 'v5 character B', negative: '', x: 0.8, y: 0.9, autoPos: false, enabled: true }
    ]));

    manager.loadState('v4.5');
    expect(manager.currentModel).toBe('v4.5');
    expect(rowsInDom.length).toBe(1);

    // Mock rowsInDom to reflect newly added row from loadState
    rowsInDom.forEach(r => { r.prompt = 'v4.5 character'; });

    manager.onModelChange('v5');
    expect(manager.currentModel).toBe('v5');
    expect(rowsInDom.length).toBe(2);

    manager.onModelChange('v4.5');
    expect(manager.currentModel).toBe('v4.5');
    expect(rowsInDom.length).toBe(1);
  });

  it('4. should fallback to v4.5 prompts if v5 has not been initialized yet', () => {
    store.setSetting('nai_v45_character_prompts', JSON.stringify([
      { prompt: 'legacy character', negative: 'bad eyes', x: 0.5, y: 0.5, autoPos: true, enabled: true }
    ]));

    manager.loadState('v5');
    expect(manager.currentModel).toBe('v5');
    expect(rowsInDom.length).toBe(1);
  });

  it('5. should correctly resolve v4.5 without collapsing to v5 due to character 5', () => {
    function normalizeModelVersion(rawModel) {
      if (!rawModel || typeof rawModel !== 'string') return 'v3';
      const lower = rawModel.toLowerCase().trim();
      if (lower.includes('zimage')) return 'zimage';
      if (lower.includes('4.5') || lower.includes('4-5') || lower.includes('v4') || lower.includes('diffusion-4')) return 'v4.5';
      if (lower.includes('5') || lower.includes('v5') || lower.includes('diffusion-5')) return 'v5';
      if (lower.includes('3') || lower.includes('v3') || lower.includes('diffusion-3')) return 'v3';
      return 'v3';
    }

    expect(normalizeModelVersion('v4.5')).toBe('v4.5');
    expect(normalizeModelVersion('nai-diffusion-4-5-full')).toBe('v4.5');
    expect(normalizeModelVersion('nai-diffusion-4-full')).toBe('v4.5');
    expect(normalizeModelVersion('v4')).toBe('v4.5');
    expect(normalizeModelVersion('v5')).toBe('v5');
    expect(normalizeModelVersion('nai-diffusion-5-full')).toBe('v5');
    expect(normalizeModelVersion('v3')).toBe('v3');
    expect(normalizeModelVersion('nai-diffusion-3')).toBe('v3');
    expect(normalizeModelVersion('zimage')).toBe('zimage');
  });

  it('6. should unpack NovelAI Comment JSON string into full metadata and character prompts', () => {
    function resolveLightboxMeta(item) {
      if (!item) return {};
      let meta = item.meta || item;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch (e) {
          meta = {};
        }
      }
      const commentRaw = meta?.Comment || meta?.comment || item?.Comment || item?.comment;
      if (typeof commentRaw === 'string') {
        try {
          const parsedComment = JSON.parse(commentRaw);
          meta = { ...parsedComment, ...meta };
        } catch (e) {}
      } else if (typeof commentRaw === 'object' && commentRaw !== null) {
        meta = { ...commentRaw, ...meta };
      }
      return meta;
    }

    const naiPngItem = {
      image: 'data:image/png;base64,mock',
      Comment: JSON.stringify({
        prompt: '1girl, masterpiece',
        uc: 'lowres, bad hands',
        steps: 28,
        scale: 5.5,
        seed: 987654321,
        v4_prompt: {
          caption: {
            base_caption: '1girl, masterpiece',
            char_captions: [
              { char_caption: '1girl, red hair', centers: [{ x: 0.25, y: 0.5 }] }
            ]
          }
        },
        v4_negative_prompt: {
          caption: {
            char_captions: [
              { char_caption: 'bad hair' }
            ]
          }
        }
      })
    };

    const resolved = resolveLightboxMeta(naiPngItem);
    expect(resolved.steps).toBe(28);
    expect(resolved.scale).toBe(5.5);
    expect(resolved.seed).toBe(987654321);
    expect(resolved.uc).toBe('lowres, bad hands');
    expect(resolved.v4_prompt?.caption?.char_captions?.length).toBe(1);
    expect(resolved.v4_prompt.caption.char_captions[0].char_caption).toBe('1girl, red hair');
    expect(resolved.v4_negative_prompt.caption.char_captions[0].char_caption).toBe('bad hair');
  });
});
