import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CharRefManager } from '../src/char-ref-manager.js';

// Setup Mock DOM and browser environment
global.window = {};
global.document = {
    getElementById: vi.fn(),
    createElement: vi.fn()
};

// Mock Image class
class MockImage {
    constructor() {
        this.onload = null;
        this.onerror = null;
        this._src = '';
    }
    get width() { return 0; }
    get height() { return 0; }
    set src(val) {
        this._src = val;
        // Simulate async image loading
        setTimeout(() => {
            if (this.onload) this.onload();
        }, 10);
    }
    get src() {
        return this._src;
    }
}
global.Image = MockImage;

global.FileReader = class MockFileReader {
    readAsDataURL(blob) {
        setTimeout(() => {
            if (this.onload) {
                this.onload({ target: { result: 'data:image/png;base64,mockedPngBase64' } });
            }
        }, 10);
    }
};

describe('CharRefManager', () => {
    let mockStore;
    let manager;
    let mockElements;
    let mockCanvas;

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore = {
            getSetting: vi.fn(),
            setSetting: vi.fn()
        };
        
        manager = new CharRefManager({
            store: mockStore,
            onShowToast: vi.fn()
        });

        mockElements = {
            charRefEnabled: { checked: false },
            charRefMode: { value: 'character&style' },
            charRefStrength: { value: '1.00' },
            charRefFidelity: { value: '0.80' },
            charRefImagePreview: { src: '', classList: { remove: vi.fn(), add: vi.fn() } },
            charRefImagePlaceholder: { classList: { remove: vi.fn(), add: vi.fn() } },
            clearCharRefImageBtn: { classList: { remove: vi.fn(), add: vi.fn() } },
            charRefControls: { classList: { remove: vi.fn(), add: vi.fn() } },
            charRefImagePreviewContainer: { classList: { remove: vi.fn(), add: vi.fn() } }
        };

        mockCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                drawImage: vi.fn(),
                fillRect: vi.fn()
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockedPngBase64')
        };

        global.document.getElementById.mockImplementation((id) => {
            return mockElements[id] || null;
        });

        global.document.createElement.mockImplementation((tag) => {
            if (tag === 'canvas') return mockCanvas;
            return {};
        });
    });

    it('should correctly load state if cached image is correct size and is png', async () => {
        // Mock image properties (e.g. 1472x1472, which is one of the standard sizes)
        vi.spyOn(MockImage.prototype, 'width', 'get').mockReturnValue(1472);
        vi.spyOn(MockImage.prototype, 'height', 'get').mockReturnValue(1472);

        // Mock saved setting
        const fakePngBase64 = 'iVBORw0KGgoAAAANS'; // starts with iVBORw
        mockStore.getSetting.mockImplementation((key) => {
            if (key.includes('image')) return fakePngBase64;
            if (key.includes('enabled')) return 'true';
            return null;
        });

        manager.loadState('v4.5');

        // wait for image onload timeout
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(manager.currentCharRefImageBase64).toBe(fakePngBase64);
        expect(mockElements.charRefImagePreview.src).toContain(fakePngBase64);
        expect(mockElements.charRefImagePreview.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should automatically convert cache image if it is too large or not png', async () => {
        // Mock image properties: 2000x2000 (total 4,000,000 pixels)
        vi.spyOn(MockImage.prototype, 'width', 'get').mockReturnValue(2000);
        vi.spyOn(MockImage.prototype, 'height', 'get').mockReturnValue(2000);

        const largeJpegBase64 = '/9j/4AAQSkZJRg'; // Jpeg, not starting with iVBORw
        mockStore.getSetting.mockImplementation((key) => {
            if (key.includes('image')) return largeJpegBase64;
            if (key.includes('enabled')) return 'true';
            return null;
        });

        manager.loadState('v4.5');

        // wait for image onload timeout and processImageToPng execution
        await new Promise(resolve => setTimeout(resolve, 150));

        // It should call processImageToPng, output standard NAI size 1472x1472 for 1:1 image, and save
        expect(mockCanvas.width).toBe(1472);
        expect(mockCanvas.height).toBe(1472);

        // The base64 stored should be the new mockedPngBase64
        expect(manager.currentCharRefImageBase64).toBe('mockedPngBase64');
        expect(mockStore.setSetting).toHaveBeenCalledWith(expect.stringContaining('image'), 'mockedPngBase64');
    });

    it('should support multiple reference images, V5 outfit mode, high strength (0-5), and QuotaExceededError resilience', async () => {
        vi.spyOn(MockImage.prototype, 'width', 'get').mockReturnValue(800);
        vi.spyOn(MockImage.prototype, 'height', 'get').mockReturnValue(1200);

        mockElements.charRefEnabled.checked = true;
        manager.loadState('v5');

        await manager.handleCharRefImage({
            target: {
                files: [new Blob(['a']), new Blob(['b'])],
                value: 'fakepath'
            }
        }, 'v5');

        expect(manager.charRefItems.length).toBe(2);
        manager.charRefItems[0].mode = 'character';
        manager.charRefItems[0].strength = 1.25;
        manager.charRefItems[1].mode = 'outfit';
        manager.charRefItems[1].strength = 4.2;

        const v5Payload = manager.getPayloadParams('v5');
        expect(v5Payload.director_reference_images).toEqual(['mockedPngBase64', 'mockedPngBase64']);
        expect(v5Payload.director_reference_descriptions).toEqual([
            { use_coords: false, use_order: false, legacy_uc: false, caption: { base_caption: 'character', char_captions: [] } },
            { use_coords: false, use_order: false, legacy_uc: false, caption: { base_caption: 'outfit', char_captions: [] } }
        ]);
        expect(v5Payload.director_reference_strength_values).toEqual([1.25, 4.2]);
        expect(v5Payload.director_reference_secondary_strength_values).toEqual([0, 0]);
        expect(v5Payload.director_reference_information_extracted).toEqual([1, 1]);

        // Coerce outfit -> character&style when queried under v4.5
        manager.itemsByModel['v4.5'] = [
            { id: 'c1', imageBase64: 'mockedPngBase64', mode: 'outfit', strength: 2.5, fidelity: 0.75, enabled: true }
        ];
        manager.renderList('v4.5');
        const v45Payload = manager.getPayloadParams('v4.5');
        expect(v45Payload.director_reference_descriptions[0].caption.base_caption).toBe('character&style');
        expect(v45Payload.director_reference_strength_values).toEqual([1]);
        expect(v45Payload.director_reference_secondary_strength_values).toEqual([0.25]);

        // QuotaExceededError should not crash saveState and should preserve items across loadState
        mockStore.setSetting.mockImplementation((k) => {
            if (k.includes('items')) throw new Error('QuotaExceededError');
        });
        mockStore.getSetting.mockReturnValue(null);
        expect(() => manager.saveState('v5')).not.toThrow();
        manager.loadState('v5');
        expect(manager.charRefItems.length).toBe(2);
    });

    it('should restore multiple references and legacy character_mainoutfit from metadata', () => {
        const stored = {};
        mockStore.setSetting.mockImplementation((k, v) => { stored[k] = v; });
        mockStore.getSetting.mockImplementation((k) => stored[k] ?? null);

        const ok = manager.restoreFromMetadata({
            director_reference_images: ['iVBORwAAA1', 'iVBORwAAA2', 'iVBORwAAA3'],
            director_reference_descriptions: [
                { caption: { base_caption: 'character_mainoutfit', char_captions: [] } },
                { caption: { base_caption: 'outfit', char_captions: [] } },
                { caption: { base_caption: 'style', char_captions: [] } }
            ],
            director_reference_strength_values: [1.0, 2.0, 1.5],
            director_reference_secondary_strength_values: [0.0, 0.0, 0.0]
        }, 'v5');

        expect(ok).toBe(true);
        const params = manager.getPayloadParams('v5');
        expect(params.director_reference_images).toEqual(['iVBORwAAA1', 'iVBORwAAA2', 'iVBORwAAA3']);
        expect(params.director_reference_descriptions.map(d => d.caption.base_caption)).toEqual([
            'character',
            'outfit',
            'style'
        ]);
        expect(params.director_reference_strength_values).toEqual([1, 2, 1.5]);
    });
});
