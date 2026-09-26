/**
 * Fast client-side image thumbnail generator.
 * Downscales full-resolution images to a lightweight WebP/JPEG thumbnail (~10-20KB).
 */
export async function createThumbnail(imageSource, maxDim = 256, quality = 0.8) {
    if (!imageSource || typeof document === 'undefined' || typeof Image === 'undefined') {
        return null;
    }
    try {
        let img;
        let blobUrlToRevoke = null;

        if (typeof Blob !== 'undefined' && imageSource instanceof Blob) {
            if (typeof URL !== 'undefined' && URL.createObjectURL) {
                blobUrlToRevoke = URL.createObjectURL(imageSource);
                img = new Image();
                img.src = blobUrlToRevoke;
            } else {
                return null;
            }
        } else if (typeof imageSource === 'string') {
            img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = imageSource;
        } else if (imageSource && (imageSource.nodeName === 'IMG' || imageSource.nodeName === 'CANVAS')) {
            img = imageSource;
        }

        if (!img) return null;

        if (img.nodeName !== 'CANVAS') {
            await new Promise((resolve) => {
                if (img.complete && (img.naturalWidth || img.width)) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
        }

        const srcW = img.naturalWidth || img.width || 0;
        const srcH = img.naturalHeight || img.height || 0;
        if (!srcW || !srcH) {
            if (blobUrlToRevoke && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                URL.revokeObjectURL(blobUrlToRevoke);
            }
            return null;
        }

        const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const dstW = Math.max(1, Math.round(srcW * scale));
        const dstH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = dstW;
        canvas.height = dstH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            if (blobUrlToRevoke && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                URL.revokeObjectURL(blobUrlToRevoke);
            }
            return null;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, dstW, dstH);

        if (blobUrlToRevoke && typeof URL !== 'undefined' && URL.revokeObjectURL) {
            URL.revokeObjectURL(blobUrlToRevoke);
        }

        return canvas.toDataURL('image/webp', quality);
    } catch (_) {
        return null;
    }
}

/**
 * Gallery Storage Module
 * Handles IndexedDB for image history and LocalStorage for user settings.
 */
export class GalleryStore {
    constructor() {
        this.dbName = 'nai_opus_db';
        this.storeName = 'history';
        this.db = null;
    }

    /**
     * Initializes the IndexedDB database.
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Saves a generated image to history with optional compressed thumbnail.
     */
    async saveImage(imgData, prompt, model, meta = null, thumb = null) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const entry = { image: imgData, prompt, model, date: Date.now() };
            if (meta) {
                entry.meta = meta;
            }
            if (thumb) {
                entry.thumb = thumb;
            }
            const request = store.add(entry);

            request.onsuccess = (e) => resolve({ id: e.target.result, ...entry });
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Loads all images from history, reversed (newest first).
     */
    async getAllImages() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = (e) => resolve(e.target.result.reverse());
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Deletes a specific image by ID.
     */
    async deleteImage(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Clears all history.
     */
    async clearAll() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Loads a page of images from history, reversed (newest first).
     * Uses cursors to efficiently skip entries without full deserialization.
     */
    async getImagesPage(page, pageSize = 24) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor(null, 'prev');
            const results = [];
            let advanced = false;
            let counter = 0;

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }

                if (page > 0 && !advanced) {
                    advanced = true;
                    cursor.advance(page * pageSize);
                    return;
                }

                results.push(cursor.value);
                counter++;

                if (counter < pageSize) {
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- LocalStorage Helpers ---
    getSetting(key, defaultValue = '') {
        return localStorage.getItem(key) || defaultValue;
    }

    setSetting(key, value) {
        localStorage.setItem(key, value);
    }
}
