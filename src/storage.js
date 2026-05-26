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
     * Saves a generated image to history.
     */
    async saveImage(imgData, prompt, model, meta = null) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const entry = { image: imgData, prompt, model, date: Date.now() };
            if (meta) {
                entry.meta = meta;
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

    // --- LocalStorage Helpers ---
    getSetting(key, defaultValue = '') {
        return localStorage.getItem(key) || defaultValue;
    }

    setSetting(key, value) {
        localStorage.setItem(key, value);
    }
}
