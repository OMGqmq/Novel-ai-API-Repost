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
                drawImage: vi.fn()
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
        // Mock image properties (e.g. 500x500, which is <= 1024x1024)
        vi.spyOn(MockImage.prototype, 'width', 'get').mockReturnValue(500);
        vi.spyOn(MockImage.prototype, 'height', 'get').mockReturnValue(500);

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
        // Mock image properties: 2000x2000 (total 4,000,000 pixels > 1,048,576)
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

        // It should call processImageToPng, resize it, and save the state
        expect(mockCanvas.width).toBeLessThan(2000);
        expect(mockCanvas.height).toBeLessThan(2000);
        // target width and height should scale to sqrt(1024*1024 / 4,000,000) = 0.509 -> 2000 * 0.509 = 1019
        expect(mockCanvas.width).toBe(1024);
        expect(mockCanvas.height).toBe(1024);

        // The base64 stored should be the new mockedPngBase64
        expect(manager.currentCharRefImageBase64).toBe('mockedPngBase64');
        expect(mockStore.setSetting).toHaveBeenCalledWith(expect.stringContaining('image'), 'mockedPngBase64');
    });
});
