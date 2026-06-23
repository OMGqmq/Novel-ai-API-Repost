import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GalleryController } from '../src/gallery.js';

// Setup Mock DOM and browser environment
global.window = {
    openLightbox: vi.fn(),
    triggerDownload: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
};
global.document = {
    getElementById: vi.fn().mockReturnValue(null),
    createElement: vi.fn().mockImplementation((tag) => {
        return {
            id: '',
            className: '',
            innerHTML: '',
            appendChild: vi.fn(),
            addEventListener: vi.fn(),
            querySelector: vi.fn().mockReturnValue({}),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            }
        };
    }),
};

describe('GalleryController', () => {
    const createMockUi = () => {
        const createMockEl = () => ({
            innerHTML: '',
            appendChild: vi.fn(),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            }
        });
        return {
            els: {
                galleryGrid: createMockEl(),
                emptyGallery: createMockEl(),
                zipBtn: createMockEl(),
                clearBtn: createMockEl(),
                prompt: {
                    value: '',
                    classList: {
                        add: vi.fn(),
                        remove: vi.fn(),
                    },
                    dispatchEvent: vi.fn(),
                },
            },
            currentRightView: 'history',
            switchRightView: vi.fn(),
            showResultImage: vi.fn(),
            showImageActions: vi.fn(),
            toggleMobileControls: vi.fn(),
            setModel: vi.fn(),
            resetPreview: vi.fn(),
        };
    };

    const createMockStore = () => ({
        getImagesPage: vi.fn().mockResolvedValue([]),
        deleteImage: vi.fn().mockResolvedValue(true),
        getAllImages: vi.fn().mockResolvedValue([]),
    });

    const createMockAppState = () => ({
        currentInitImageBase64: null,
        currentImageId: null,
        currentImageData: null,
        showcaseData: [],
        currentGalleryTab: 'showcase',
    });

    beforeEach(() => {
        vi.clearAllMocks();
        global.document.getElementById = vi.fn().mockImplementation((id) => {
            return {
                id,
                className: '',
                classList: {
                    add: vi.fn(),
                    remove: vi.fn(),
                },
                appendChild: vi.fn(),
                addEventListener: vi.fn(),
                children: [],
                innerHTML: '',
            };
        });
    });

    it('should switch gallery tab correctly', async () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();

        const controller = new GalleryController({ store, ui, appState });
        controller.switchGalleryTab('history');

        expect(appState.currentGalleryTab).toBe('history');
        expect(store.getImagesPage).toHaveBeenCalled();
    });

    it('should load preview from history correctly', () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();
        const controller = new GalleryController({ store, ui, appState });
        
        const item = { id: 123, image: 'data:image/png;base64,abc', prompt: 'test prompt', model: 'v3' };
        controller.loadPreviewFromHistory(item);
        
        expect(ui.switchRightView).toHaveBeenCalledWith('preview');
        expect(ui.showResultImage).toHaveBeenCalledWith(item.image);
        expect(appState.currentImageId).toBe(item.id);
        expect(appState.currentImageData.prompt).toBe(item.prompt);
    });
});
