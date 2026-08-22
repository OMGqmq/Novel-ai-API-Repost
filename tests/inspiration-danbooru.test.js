import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest as danbooruHandler } from '../functions/danbooru.js';
import { InspirationManager, ERA_OPTIONS, FRANCHISE_OPTIONS, ARTIST_STYLE_OPTIONS } from '../src/inspiration-manager.js';

// Setup Mock DOM
const mockDomStore = {};
function createMockEl(id = '', tagName = 'div') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    innerHTML: '',
    textContent: '',
    src: '',
    alt: '',
    href: '',
    disabled: false,
    options: [],
    classList: {
      _classes: new Set(),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); },
    },
    querySelector: (sel) => {
      if (sel === '.relative') return createMockEl('relative');
      if (sel === '.char-prompt-input') return mockDomStore['charPromptInput'] || createMockEl('charPromptInput');
      return createMockEl();
    },
    querySelectorAll: (sel) => {
      return [];
    },
    appendChild: (child) => {},
    dispatchEvent: vi.fn(),
  };
  mockDomStore[id] = el;
  return el;
}

global.window = global.window || {};
global.document = {
  getElementById: (id) => {
    if (!mockDomStore[id]) {
      mockDomStore[id] = createMockEl(id);
    }
    return mockDomStore[id];
  },
  querySelector: (sel) => {
    if (sel === '#prompt' || sel === '#positivePrompt') return mockDomStore['positivePrompt'] || createMockEl('positivePrompt');
    return createMockEl();
  },
  querySelectorAll: () => [],
  createElement: (tag) => createMockEl('', tag)
};
global.Event = function(name) { this.name = name; };

describe('Danbooru Inspiration Proxy & Manager', () => {
  describe('functions/danbooru.js Handler', () => {
    it('should handle OPTIONS preflight request', async () => {
      const context = {
        request: {
          method: 'OPTIONS',
          headers: new Headers(),
        }
      };
      const res = await danbooruHandler(context);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should proxy and sanitize GET queries to Danbooru', async () => {
      const mockDanbooruPosts = [
        {
          id: 11400000,
          created_at: '2026-05-18T10:00:00Z',
          score: 150,
          fav_count: 320,
          rating: 'g',
          tag_string_artist: 'frieren_artist',
          tag_string_character: 'frieren',
          tag_string_copyright: 'sousou_no_frieren',
          tag_string_general: '1girl solo twintails white_robe green_eyes staff sky',
          tag_string: 'frieren_artist frieren sousou_no_frieren 1girl solo twintails white_robe green_eyes staff sky',
          preview_file_url: 'https://cdn.donmai.us/preview/11400000.jpg',
          image_width: 832,
          image_height: 1216,
          media_asset: {
            variants: [
              { type: '360x360', url: 'https://cdn.donmai.us/sample/11400000.jpg' }
            ]
          }
        }
      ];

      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDanbooruPosts,
      });

      const context = {
        request: {
          method: 'GET',
          url: 'https://example.com/danbooru?tags=sousou_no_frieren+score:>=50&limit=10&page=1',
          headers: new Headers(),
        }
      };

      const res = await danbooruHandler(context);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(1);
      expect(data.posts[0].id).toBe(11400000);
      expect(data.posts[0].preview_url).toBe('https://cdn.donmai.us/sample/11400000.jpg');
      expect(data.posts[0].tag_string_character).toBe('frieren');

      global.fetch = originalFetch;
    });

    it('should handle Danbooru API error responses gracefully', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () => 'Search error',
      });

      const context = {
        request: {
          method: 'GET',
          url: 'https://example.com/danbooru?tags=invalid_query',
          headers: new Headers(),
        }
      };

      const res = await danbooruHandler(context);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toContain('Danbooru API error');

      global.fetch = originalFetch;
    });
  });

  describe('InspirationManager Core Logic', () => {
    let manager;
    let mockPromptHelper;

    beforeEach(() => {
      // Clear mock dom store
      for (const k in mockDomStore) delete mockDomStore[k];
      
      mockDomStore['positivePrompt'] = createMockEl('positivePrompt', 'textarea');
      mockDomStore['characterPromptsContainer'] = createMockEl('characterPromptsContainer');
      mockDomStore['charPromptInput'] = createMockEl('charPromptInput', 'input');

      mockPromptHelper = {
        dictionary: {
          'twintails': '双马尾',
          'white_robe': '白色长袍',
          'green_eyes': '绿瞳',
          'staff': '法杖',
          'sky': '天空'
        },
        classifiedData: {}
      };

      manager = new InspirationManager({
        promptHelper: mockPromptHelper,
        onShowToast: vi.fn(),
      });
    });

    it('should build proper Danbooru query strings for different dimensions', () => {
      manager.currentEra = '2026';
      manager.currentFranchise = 'frieren';
      manager.currentRating = 'g';
      manager.minScore = 100;
      
      const query = manager.buildDanbooruQuery();
      expect(query).toContain('sousou_no_frieren');
      expect(query.length).toBeGreaterThan(0);
    });

    it('should correctly classify tags into categories', () => {
      expect(manager.categorizeTag('t_artist', 'artist')).toBe('artist');
      expect(manager.categorizeTag('frieren', 'character')).toBe('character');
      expect(manager.categorizeTag('white_robe', 'general')).toBe('clothing');
      expect(manager.categorizeTag('sitting', 'general')).toBe('action');
      expect(manager.categorizeTag('blue_sky', 'general')).toBe('background');
      expect(manager.categorizeTag('1girl', 'general')).toBe('general');
    });

    it('should translate tags using promptHelper dictionary', () => {
      expect(manager.findChineseTranslation('twintails')).toBe('双马尾');
      expect(manager.findChineseTranslation('white_robe')).toBe('白色长袍');
      expect(manager.findChineseTranslation('unknown_tag_xyz')).toBe('');
    });

    it('should render post tags, toggle selection, and lock tags', () => {
      manager.posts = [
        {
          id: 1001,
          score: 200,
          fav_count: 500,
          created_at: '2026-05-18T00:00:00Z',
          preview_url: 'https://cdn.donmai.us/sample/1.jpg',
          tag_string_artist: 'mika_art',
          tag_string_character: 'frieren',
          tag_string_copyright: 'sousou_no_frieren',
          tag_string_general: 'white_robe green_eyes sitting blue_sky'
        }
      ];
      manager.currentPostIndex = 0;
      manager.renderCurrentPost();

      expect(manager.currentTags.length).toBeGreaterThan(0);
      expect(manager.getAssembledPrompt()).toContain('artist:mika_art');
      expect(manager.getAssembledPrompt()).toContain('frieren');

      // Test toggle tag
      manager.toggleTag(0);
      expect(manager.currentTags[0].selected).toBe(false);

      // Test tag lock
      manager.toggleTagLock(1);
      expect(manager.currentTags[1].locked).toBe(true);
      expect(manager.lockedTags.has(manager.currentTags[1].name)).toBe(true);
    });

    it('should import prompts in replace, append, and smart_v5 modes', () => {
      manager.currentTags = [
        { name: 'artist:super_art', category: 'artist', selected: true },
        { name: 'frieren', category: 'character', selected: true },
        { name: 'white_robe', category: 'clothing', selected: true },
        { name: 'blue_sky', category: 'background', selected: true }
      ];

      const posInput = mockDomStore['positivePrompt'];
      posInput.value = 'masterpiece';

      // 1. Append mode
      manager.importPrompt('append');
      expect(posInput.value).toContain('masterpiece, artist:super_art, frieren, white_robe, blue_sky');

      // 2. Replace mode
      manager.importPrompt('replace');
      expect(posInput.value).toBe('artist:super_art, frieren, white_robe, blue_sky');

      // 3. Smart V5 mode
      posInput.value = 'masterpiece';
      manager.importPrompt('smart_v5');
      // Global prompt should get artist & background
      expect(posInput.value).toContain('artist:super_art');
      expect(posInput.value).toContain('blue_sky');
      // Character prompt row should get character & clothing
      const charInput = mockDomStore['charPromptInput'];
      expect(charInput.value).toContain('frieren');
      expect(charInput.value).toContain('white_robe');
    });
  });
});
