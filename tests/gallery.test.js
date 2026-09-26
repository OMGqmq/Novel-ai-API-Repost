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
            prepend: vi.fn(),
            remove: vi.fn(),
            addEventListener: vi.fn(),
            querySelector: vi.fn().mockReturnValue({}),
            dataset: {},
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            },
            parentNode: {
                removeChild: vi.fn()
            }
        };
    }),
};

describe('GalleryController', () => {
    const createMockUi = () => {
        const createMockEl = () => ({
            innerHTML: '',
            appendChild: vi.fn(),
            prepend: vi.fn(),
            querySelector: vi.fn().mockReturnValue(null),
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

    it('should call unified triggerDownload with zip blob on downloadZip', async () => {
        const ui = createMockUi();
        const mockBlob = new Blob(['mock-zip-binary'], { type: 'application/zip' });
        const mockZipInstance = {
            folder: vi.fn().mockReturnThis(),
            file: vi.fn().mockReturnThis(),
            generateAsync: vi.fn().mockResolvedValue(mockBlob)
        };
        global.window.JSZip = vi.fn().mockImplementation(function () {
            return mockZipInstance;
        });

        const store = createMockStore();
        store.getAllImages = vi.fn().mockResolvedValue([
            { id: 1, image: 'data:image/png;base64,AAAA', prompt: 'masterpiece girl' }
        ]);
        const appState = createMockAppState();

        const controller = new GalleryController({ store, ui, appState });
        await controller.downloadZip();

        expect(store.getAllImages).toHaveBeenCalled();
        expect(mockZipInstance.generateAsync).toHaveBeenCalledWith({ type: 'blob' });
        expect(global.window.triggerDownload).toHaveBeenCalledWith(
            mockBlob,
            expect.stringMatching(/^history_\d+\.zip$/)
        );

        delete global.window.JSZip;
    });

    it('should use thumbnail in _createGalleryItemElement when present, or fallback to original', () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();
        const controller = new GalleryController({ store, ui, appState });

        const itemWithThumb = {
            id: 101,
            image: 'data:image/png;base64,ORIGINAL_FULL_RES',
            thumb: 'data:image/webp;base64,THUMB_COMPRESSED'
        };
        const elWithThumb = controller._createGalleryItemElement(itemWithThumb);
        expect(elWithThumb.innerHTML).toContain('data:image/webp;base64,THUMB_COMPRESSED');

        const itemWithoutThumb = {
            id: 102,
            image: 'data:image/png;base64,ORIGINAL_FULL_RES_ONLY'
        };
        const elWithoutThumb = controller._createGalleryItemElement(itemWithoutThumb);
        expect(elWithoutThumb.innerHTML).toContain('data:image/png;base64,ORIGINAL_FULL_RES_ONLY');
    });

    it('should prependImage to galleryItems and DOM grid', () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();
        const controller = new GalleryController({ store, ui, appState });

        const newItem = { id: 999, image: 'data:image/png;base64,xyz', thumb: 'data:image/webp;base64,thumb_xyz' };
        controller.prependImage(newItem);

        expect(controller.galleryItems[0]).toBe(newItem);
        expect(ui.els.galleryGrid.prepend).toHaveBeenCalled();
        expect(ui.els.emptyGallery.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should removeImage in-place from galleryItems and DOM element', () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();
        const controller = new GalleryController({ store, ui, appState });

        const mockDomEl = {
            parentNode: { removeChild: vi.fn() },
            remove: vi.fn()
        };
        global.document.getElementById = vi.fn().mockImplementation((id) => {
            if (id === 'gallery-item-555') return mockDomEl;
            return null;
        });

        controller.galleryItems = [{ id: 555, image: 'test555' }, { id: 666, image: 'test666' }];
        controller.removeImage(555);

        expect(controller.galleryItems.length).toBe(1);
        expect(controller.galleryItems[0].id).toBe(666);
        expect(mockDomEl.remove).toHaveBeenCalled();
    });

    it('should show empty state when last item is removed via removeImage', () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();
        const controller = new GalleryController({ store, ui, appState });

        controller.galleryItems = [{ id: 777, image: 'test777' }];
        controller.removeImage(777);

        expect(controller.galleryItems.length).toBe(0);
        expect(ui.els.emptyGallery.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should load preview from history using uncompressed original image even when thumb exists', () => {
        const ui = createMockUi();
        const store = createMockStore();
        const appState = createMockAppState();
        const controller = new GalleryController({ store, ui, appState });

        const item = {
            id: 888,
            image: 'data:image/png;base64,ORIGINAL_FULL_UNCOMPRESSED',
            thumb: 'data:image/webp;base64,SMALL_THUMB',
            prompt: 'masterpiece',
            model: 'v5'
        };
        controller.loadPreviewFromHistory(item);

        expect(ui.switchRightView).toHaveBeenCalledWith('preview');
        // Critical: Must be original, not thumbnail
        expect(ui.showResultImage).toHaveBeenCalledWith('data:image/png;base64,ORIGINAL_FULL_UNCOMPRESSED');
        expect(appState.currentImageData.imageUrl).toBe('data:image/png;base64,ORIGINAL_FULL_UNCOMPRESSED');
    });
});
