/**
 * Shared App State Module
 * Centralizes mutable state to avoid cross-module lexical scope dependencies.
 */
export const appState = {
    currentInitImageBase64: null,
    currentImageId: null,
    currentImageData: null,
    showcaseData: [],
    currentGalleryTab: 'showcase',
};
