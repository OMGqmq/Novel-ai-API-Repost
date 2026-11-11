/**
 * Vibe Reference Image Manager Module
 * Handles file reading, official .nai4vibe JSON bundle structure parsing,
 * multi-intensity encoding caching, IndexedDB persistence, status rendering, and parameter serialization.
 */

class VibeDB {
    constructor() {
        this.dbName = 'nai_vibe_cache_db';
        this.storeName = 'vibe_docs';
        this.db = null;
    }

    async getDb() {
        if (typeof indexedDB === 'undefined') return null;
        if (this.db) return this.db;
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(this.dbName, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    resolve(this.db);
                };
                req.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }

    async saveDoc(doc) {
        if (!doc || !doc.id) return;
        try {
            const db = await this.getDb();
            if (!db) return;
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                store.put(doc);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch {}
    }

    async getDoc(id) {
        if (!id) return null;
        try {
            const db = await this.getDb();
            if (!db) return null;
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.get(id);
                req.onsuccess = (e) => resolve(e.target.result || null);
                req.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }
}

export class VibeManager {
    constructor(config = {}) {
        this.store = config.store;
        this.compressImage = config.compressImage;
        this.onShowToast = config.onShowToast || (() => {});
        this.vibeDb = new VibeDB();

        this.currentVibeDoc = null; // Official .nai4vibe JSON bundle containing multiple encodings
        this.currentVibeImageBase64 = null;
        this.rawImageBase64 = null;
        this.encodedVibeData = null;
        this.currentVibeIsJson = false;
        this.availableVibeEncodings = [];
        this.vibeEncodingsCache = new Map();
    }

    getVibeKey(key, model) {
        return key + (model === 'v4.5' ? '_v4' : '');
    }

    isRawImage(b64) {
        if (!b64 || typeof b64 !== 'string') return false;
        const clean = b64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        return clean.startsWith('iVBORw0KGgo') || 
               clean.startsWith('/9j/') || 
               clean.startsWith('UklGR') || 
               clean.startsWith('R0lGOD');
    }

    getImageFingerprint(b64) {
        if (!b64 || typeof b64 !== 'string') return '';
        const clean = b64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        const len = clean.length;
        const mid = Math.floor(len / 2);
        return `${len}_${clean.slice(0, 32)}_${clean.slice(mid, mid + 32)}_${clean.slice(-32)}`;
    }

    getCacheKey(rawImg, info) {
        const fp = this.getImageFingerprint(rawImg);
        const infoKey = parseFloat(info).toFixed(2);
        return `${fp}_${infoKey}`;
    }

    getCachedEncoding(rawImg, info) {
        // 1. Check in currentVibeDoc
        if (this.currentVibeDoc && this.currentVibeDoc.encodings) {
            const section = this.currentVibeDoc.encodings['v4-5full'] || this.currentVibeDoc.encodings['v4full'];
            if (section) {
                const targetInfo = parseFloat(info);
                for (const item of Object.values(section)) {
                    if (item && item.encoding) {
                        const itemInfo = item.params?.information_extracted !== undefined 
                            ? parseFloat(item.params.information_extracted) 
                            : parseFloat(item.information_extracted ?? 1.0);
                        if (Math.abs(itemInfo - targetInfo) < 0.005) {
                            return item.encoding;
                        }
                    }
                }
            }
        }

        // 2. Fallback to Map cache
        if (!rawImg) return null;
        const key = this.getCacheKey(rawImg, info);
        return this.vibeEncodingsCache.get(key) || null;
    }

    setCachedEncoding(rawImg, info, encoding) {
        if (!rawImg || !encoding) return;
        const key = this.getCacheKey(rawImg, info);
        this.vibeEncodingsCache.set(key, encoding);
        this.encodedVibeData = {
            rawImage: rawImg,
            info: parseFloat(info),
            encoding: encoding
        };
    }

    generateDocId(b64, name = '') {
        const clean = (b64 || name || 'vibe').replace(/^data:image\/[a-z]+;base64,/, '').slice(0, 5000);
        let h1 = 0xdeadbeef, h2 = 0x41c64e6d, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
        for (let i = 0; i < clean.length; i++) {
            const ch = clean.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
            h3 = Math.imul(h3 ^ ch, 2246822507);
            h4 = Math.imul(h4 ^ ch, 3266489909);
        }
        const p1 = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
        const p2 = (h3 >>> 0).toString(16).padStart(8, '0') + (h4 >>> 0).toString(16).padStart(8, '0');
        return (p1 + p2 + p1 + p2).slice(0, 64);
    }

    generateEncodingKey(docId, info, encoding) {
        const raw = `${docId || 'vibe'}_${parseFloat(info).toFixed(2)}_${encoding ? encoding.slice(0, 64) : ''}`;
        let h1 = 0x12345678, h2 = 0x87654321, h3 = 0xabcdef01, h4 = 0x10fedcba;
        for (let i = 0; i < raw.length; i++) {
            const ch = raw.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
            h3 = Math.imul(h3 ^ ch, 2246822507);
            h4 = Math.imul(h4 ^ ch, 3266489909);
        }
        const p1 = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
        const p2 = (h3 >>> 0).toString(16).padStart(8, '0') + (h4 >>> 0).toString(16).padStart(8, '0');
        return (p1 + p2 + p1 + p2).slice(0, 64);
    }

    syncDocToCache() {
        if (!this.currentVibeDoc) return;
        this.availableVibeEncodings = [];

        if (this.currentVibeDoc.image && typeof this.currentVibeDoc.image === 'string' && this.isRawImage(this.currentVibeDoc.image)) {
            this.rawImageBase64 = this.currentVibeDoc.image.replace(/^data:image\/[a-z]+;base64,/, '');
        }

        if (this.currentVibeDoc.encodings) {
            const section = this.currentVibeDoc.encodings['v4-5full'] || this.currentVibeDoc.encodings['v4full'];
            if (section) {
                Object.values(section).forEach(item => {
                    if (item && item.encoding) {
                        const info = item.params?.information_extracted !== undefined 
                            ? parseFloat(item.params.information_extracted) 
                            : parseFloat(item.information_extracted ?? 1.0);
                        this.availableVibeEncodings.push({
                            base64: item.encoding,
                            info: info
                        });
                        if (this.rawImageBase64) {
                            this.setCachedEncoding(this.rawImageBase64, info, item.encoding);
                        }
                    }
                });
            }
        }

        // Sort encodings by info ascending
        this.availableVibeEncodings.sort((a, b) => a.info - b.info);
    }

    buildDocFromCurrentState(model) {
        const raw = this.rawImageBase64 || this.currentVibeImageBase64;
        if (!raw) return null;
        const docId = this.generateDocId(raw);
        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;
        const vibeStrengthEl = typeof document !== 'undefined' ? document.getElementById('vibeStrength') : null;
        const str = vibeStrengthEl ? parseFloat(vibeStrengthEl.value) : 0.6;

        this.currentVibeDoc = {
            identifier: "novelai-vibe-transfer",
            version: 1,
            type: "image",
            id: docId,
            name: `vibe_${docId.slice(0, 6)}`,
            image: this.isRawImage(raw) ? raw : null,
            thumbnail: null,
            createdAt: Date.now(),
            importInfo: {
                model: 'nai-diffusion-4-5-full',
                information_extracted: info,
                strength: str
            },
            encodings: {
                "v4-5full": {}
            }
        };

        // Populate from cache
        for (const [k, v] of this.vibeEncodingsCache.entries()) {
            const infoStr = k.split('_').pop();
            const infoNum = parseFloat(infoStr);
            if (!isNaN(infoNum)) {
                const encKey = this.generateEncodingKey(docId, infoNum, v);
                this.currentVibeDoc.encodings['v4-5full'][encKey] = {
                    encoding: v,
                    params: { information_extracted: infoNum }
                };
            }
        }

        if (this.currentVibeImageBase64 && !this.isRawImage(this.currentVibeImageBase64)) {
            const encKey = this.generateEncodingKey(docId, info, this.currentVibeImageBase64);
            this.currentVibeDoc.encodings['v4-5full'][encKey] = {
                encoding: this.currentVibeImageBase64,
                params: { information_extracted: info }
            };
        }

        this.syncDocToCache();
        return this.currentVibeDoc;
    }

    loadState(model) {
        // 1. Restore map cache from local store
        const savedCache = this.store.getSetting(this.getVibeKey('nai_vibe_cache', model));
        if (savedCache) {
            try {
                const parsed = JSON.parse(savedCache);
                for (const [k, v] of Object.entries(parsed)) {
                    this.vibeEncodingsCache.set(k, v);
                }
            } catch {}
        }

        // 2. Restore synchronous document summary if available
        const savedSummary = this.store.getSetting(this.getVibeKey('nai_vibe_doc_summary', model));
        if (savedSummary) {
            try {
                this.currentVibeDoc = JSON.parse(savedSummary);
                this.syncDocToCache();
            } catch {}
        }

        const savedVibeData = this.store.getSetting(this.getVibeKey('nai_vibe_image', model));
        const savedRawImage = this.store.getSetting(this.getVibeKey('nai_vibe_raw_image', model));
        const savedVibeIsJson = this.store.getSetting(this.getVibeKey('nai_vibe_is_json', model)) === 'true';
        const savedVibeEnabled = this.store.getSetting(this.getVibeKey('nai_vibe_enabled', model)) !== 'false';
        const savedVibeInfo = this.store.getSetting(this.getVibeKey('nai_vibe_info', model));
        const savedVibeStrength = this.store.getSetting(this.getVibeKey('nai_vibe_strength', model));
        const savedVibePreview = this.store.getSetting(this.getVibeKey('nai_vibe_preview', model));
        const savedDocId = this.store.getSetting(this.getVibeKey('nai_vibe_doc_id', model));

        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        if (enabledCheckbox) {
            enabledCheckbox.checked = savedVibeEnabled;
        }

        if (savedVibeData || this.currentVibeDoc) {
            this.currentVibeImageBase64 = savedVibeData || (this.currentVibeDoc?.image);
            this.rawImageBase64 = savedRawImage || (this.currentVibeDoc?.image) || (this.isRawImage(savedVibeData) ? savedVibeData : null);
            this.currentVibeIsJson = savedVibeIsJson || Boolean(this.currentVibeDoc?.encodings);

            if (typeof document !== 'undefined') {
                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    if (savedVibePreview) {
                        previewImg.src = savedVibePreview;
                        if (savedVibePreview.includes('svg')) previewImg.classList.add('p-3');
                        else previewImg.classList.remove('p-4', 'p-3');
                    } else if (this.currentVibeDoc?.image) {
                        previewImg.src = this.currentVibeDoc.image.startsWith('data:') ? this.currentVibeDoc.image : ('data:image/png;base64,' + this.currentVibeDoc.image);
                        previewImg.classList.remove('p-4', 'p-3');
                    } else if (this.currentVibeDoc?.thumbnail) {
                        previewImg.src = this.currentVibeDoc.thumbnail.startsWith('data:') ? this.currentVibeDoc.thumbnail : ('data:image/webp;base64,' + this.currentVibeDoc.thumbnail);
                        previewImg.classList.remove('p-4', 'p-3');
                    } else {
                        previewImg.src = 'data:image/jpeg;base64,' + (this.rawImageBase64 || savedVibeData);
                        previewImg.classList.remove('p-4', 'p-3');
                    }
                    previewImg.classList.remove('hidden');
                }

                const placeholder = document.getElementById('vibeImagePlaceholder');
                if (placeholder) placeholder.classList.add('hidden');

                const clearBtn = document.getElementById('clearVibeImageBtn');
                if (clearBtn) clearBtn.classList.remove('hidden');

                const exportBtn = document.getElementById('exportVibeHeaderBtn');
                if (exportBtn) exportBtn.classList.remove('hidden');

                const vibeControls = document.getElementById('vibeControls');
                if (vibeControls) vibeControls.classList.remove('hidden');
            }

            this.updateVibeInfoUI(this.currentVibeIsJson, model);

            if (typeof document !== 'undefined') {
                const slider = document.getElementById('vibeInfo');
                if (slider) {
                    const infoToSet = savedVibeInfo || this.currentVibeDoc?.importInfo?.information_extracted || (this.availableVibeEncodings[0]?.info);
                    if (infoToSet !== undefined) {
                        slider.value = infoToSet;
                        const valSpan = document.getElementById('vibeInfoValue');
                        if (valSpan) valSpan.textContent = parseFloat(infoToSet).toFixed(2);
                    }
                }
            }

            // Asynchronously retrieve full document from IndexedDB
            if (savedDocId && (!this.currentVibeDoc || !this.currentVibeDoc.image)) {
                this.vibeDb.getDoc(savedDocId).then(fullDoc => {
                    if (fullDoc) {
                        this.currentVibeDoc = fullDoc;
                        this.syncDocToCache();
                        if (typeof document !== 'undefined' && fullDoc.image) {
                            const pImg = document.getElementById('vibeImagePreview');
                            if (pImg) {
                                pImg.src = fullDoc.image.startsWith('data:') ? fullDoc.image : ('data:image/png;base64,' + fullDoc.image);
                                pImg.classList.remove('p-4', 'p-3');
                            }
                        }
                        this.updateVibeStatus(model);
                    }
                });
            }
        } else {
            this.clearVibeImage(model);
        }

        if (savedVibeStrength && typeof document !== 'undefined') {
            const strSlider = document.getElementById('vibeStrength');
            if (strSlider) {
                strSlider.value = savedVibeStrength;
                const strSpan = document.getElementById('vibeStrengthValue');
                if (strSpan) strSpan.textContent = parseFloat(savedVibeStrength).toFixed(2);
            }
        }

        this.toggleVibeEnabled(model);
    }

    saveState(model) {
        if (!this.currentVibeDoc && (this.rawImageBase64 || this.currentVibeImageBase64)) {
            this.buildDocFromCurrentState(model);
        }

        if (this.currentVibeDoc) {
            // 1. Asynchronously persist full document (with image) to IndexedDB
            this.vibeDb.saveDoc(this.currentVibeDoc);

            // 2. Persist lightweight summary (without the massive image) to localStorage
            const docSummary = {
                identifier: this.currentVibeDoc.identifier,
                version: this.currentVibeDoc.version,
                type: this.currentVibeDoc.type,
                id: this.currentVibeDoc.id,
                name: this.currentVibeDoc.name,
                thumbnail: this.currentVibeDoc.thumbnail,
                createdAt: this.currentVibeDoc.createdAt,
                importInfo: this.currentVibeDoc.importInfo,
                encodings: this.currentVibeDoc.encodings
            };
            this.store.setSetting(this.getVibeKey('nai_vibe_doc_summary', model), JSON.stringify(docSummary));
            this.store.setSetting(this.getVibeKey('nai_vibe_doc_id', model), this.currentVibeDoc.id);
        }

        this.store.setSetting(this.getVibeKey('nai_vibe_image', model), this.currentVibeImageBase64 || '');
        this.store.setSetting(this.getVibeKey('nai_vibe_raw_image', model), this.rawImageBase64 || '');
        this.store.setSetting(this.getVibeKey('nai_vibe_is_json', model), this.currentVibeIsJson.toString());
        this.store.setSetting(this.getVibeKey('nai_vibe_encodings', model), JSON.stringify(this.availableVibeEncodings));
        
        if (this.vibeEncodingsCache && this.vibeEncodingsCache.size > 0) {
            const cacheObj = {};
            const entries = Array.from(this.vibeEncodingsCache.entries()).slice(-15);
            for (const [k, v] of entries) {
                cacheObj[k] = v;
            }
            this.store.setSetting(this.getVibeKey('nai_vibe_cache', model), JSON.stringify(cacheObj));
        }

        const previewImg = typeof document !== 'undefined' ? document.getElementById('vibeImagePreview') : null;
        if (previewImg) {
            this.store.setSetting(this.getVibeKey('nai_vibe_preview', model), previewImg.src);
        }
    }

    clearVibeImage(model) {
        this.currentVibeDoc = null;
        this.currentVibeImageBase64 = null;
        this.rawImageBase64 = null;
        this.encodedVibeData = null;
        this.currentVibeIsJson = false;
        this.availableVibeEncodings = [];
        this.store.setSetting(this.getVibeKey('nai_vibe_image', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_raw_image', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_is_json', model), 'false');
        this.store.setSetting(this.getVibeKey('nai_vibe_encodings', model), '[]');
        this.store.setSetting(this.getVibeKey('nai_vibe_preview', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_doc_id', model), '');
        this.store.setSetting(this.getVibeKey('nai_vibe_doc_summary', model), '');
        
        if (typeof document !== 'undefined') {
            const input = document.getElementById('vibeImageInput');
            if (input) input.value = '';

            const previewImg = document.getElementById('vibeImagePreview');
            if (previewImg) {
                previewImg.src = '';
                previewImg.classList.remove('p-4', 'p-3');
                previewImg.classList.add('hidden');
            }

            const placeholder = document.getElementById('vibeImagePlaceholder');
            if (placeholder) placeholder.classList.remove('hidden');

            const clearBtn = document.getElementById('clearVibeImageBtn');
            if (clearBtn) clearBtn.classList.add('hidden');

            const exportBtn = document.getElementById('exportVibeHeaderBtn');
            if (exportBtn) exportBtn.classList.add('hidden');

            const exportMenu = document.getElementById('vibeExportMenu');
            if (exportMenu) exportMenu.classList.add('hidden');

            const vibeControls = document.getElementById('vibeControls');
            if (vibeControls) vibeControls.classList.add('hidden');
        }

        this.updateVibeInfoUI(false, model);
    }

    toggleVibeEnabled(model) {
        if (typeof document === 'undefined') return;
        const enabledCheckbox = document.getElementById('vibeEnabled');
        const enabled = enabledCheckbox ? enabledCheckbox.checked : true;
        this.store.setSetting(this.getVibeKey('nai_vibe_enabled', model), enabled.toString());
        
        const previewContainer = document.getElementById('vibeImagePreviewContainer');
        const controls = document.getElementById('vibeControls');
        
        if (previewContainer) {
            if (enabled) {
                previewContainer.classList.remove('opacity-40', 'grayscale-[0.5]');
                if (this.currentVibeImageBase64 && controls) controls.classList.remove('hidden');
            } else {
                previewContainer.classList.add('opacity-40', 'grayscale-[0.5]');
                if (controls) controls.classList.add('hidden');
            }
        }
    }

    async handleVibeImage(event, model) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const fileName = (file.name || '').toLowerCase();
            const isJsonExt = fileName.endsWith('.json') || fileName.endsWith('.nai4vibe') || file.type === 'application/json';
            const isVibeExt = fileName.endsWith('.vibe') || fileName.endsWith('.vibe40');

            let isJson = isJsonExt;
            let isBinaryVibe = false;

            this.availableVibeEncodings = [];

            if (isVibeExt) {
                try {
                    const textHead = await file.slice(0, 32).text();
                    if (textHead.trim().startsWith('{') || textHead.trim().startsWith('[')) {
                        isJson = true;
                    } else {
                        isBinaryVibe = true;
                    }
                } catch {
                    isBinaryVibe = true;
                }
            }

            if (isJson) {
                this.currentVibeIsJson = true;
                const text = await file.text();
                const obj = JSON.parse(text);

                // Load directly into currentVibeDoc
                this.currentVibeDoc = obj;
                if (!this.currentVibeDoc.id) {
                    this.currentVibeDoc.id = this.generateDocId(obj.image || file.name, file.name);
                }
                if (!this.currentVibeDoc.name) {
                    this.currentVibeDoc.name = file.name.replace(/\.[^/.]+$/, '');
                }

                this.syncDocToCache();

                if (this.availableVibeEncodings.length === 0) {
                    // Check if old array structure or flat json structure
                    if (Array.isArray(obj)) {
                        this.currentVibeDoc.encodings = { "v4-5full": {} };
                        obj.forEach(item => {
                            if (item.image && item.information_extracted !== undefined) {
                                const k = this.generateEncodingKey(this.currentVibeDoc.id, item.information_extracted, item.image);
                                this.currentVibeDoc.encodings["v4-5full"][k] = {
                                    encoding: item.image,
                                    params: { information_extracted: parseFloat(item.information_extracted) }
                                };
                            }
                        });
                        this.syncDocToCache();
                    } else if (obj && (obj.image || obj.encoding) && obj.information_extracted !== undefined) {
                        const encData = obj.image || obj.encoding;
                        const infoVal = parseFloat(obj.information_extracted);
                        this.currentVibeDoc.encodings = { "v4-5full": {} };
                        const k = this.generateEncodingKey(this.currentVibeDoc.id, infoVal, encData);
                        this.currentVibeDoc.encodings["v4-5full"][k] = {
                            encoding: encData,
                            params: { information_extracted: infoVal }
                        };
                        this.syncDocToCache();
                    }
                }

                if (this.availableVibeEncodings.length === 0) {
                    console.error("Vibe JSON structure unrecognized:", obj);
                    throw new Error("未在文件中找到有效的 Vibe 编码数据 (识别到的字段不全)");
                }

                // Determine active encoding and set currentVibeImageBase64
                if (obj.importInfo && obj.importInfo.information_extracted !== undefined) {
                    const targetInfo = parseFloat(obj.importInfo.information_extracted);
                    const matched = this.availableVibeEncodings.find(e => Math.abs(e.info - targetInfo) < 0.005);
                    this.currentVibeImageBase64 = matched ? matched.base64 : (this.availableVibeEncodings[0]?.base64 || obj.image);
                } else {
                    this.currentVibeImageBase64 = this.availableVibeEncodings[0]?.base64 || obj.image;
                }

                let sourceImg = obj.image || obj.source_image || obj.thumbnail;
                
                const previewImg = typeof document !== 'undefined' ? document.getElementById('vibeImagePreview') : null;
                if (previewImg) {
                    if (sourceImg && (sourceImg.startsWith('data:image') || sourceImg.length > 1000)) {
                         previewImg.src = sourceImg.startsWith('data:image') ? sourceImg : ('data:image/png;base64,' + sourceImg);
                         previewImg.classList.remove('p-4', 'p-3');
                    } else {
                         previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                         previewImg.classList.add('p-4');
                    }
                    previewImg.classList.remove('hidden');
                }

                // Restore importInfo slider positions
                if (obj.importInfo) {
                    if (obj.importInfo.information_extracted !== undefined) {
                        const slider = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
                        if (slider) slider.value = obj.importInfo.information_extracted;
                        const valSpan = typeof document !== 'undefined' ? document.getElementById('vibeInfoValue') : null;
                        if (valSpan) valSpan.textContent = parseFloat(obj.importInfo.information_extracted).toFixed(2);
                    }
                    if (obj.importInfo.strength !== undefined) {
                        const strSlider = typeof document !== 'undefined' ? document.getElementById('vibeStrength') : null;
                        if (strSlider) strSlider.value = obj.importInfo.strength;
                        const strSpan = typeof document !== 'undefined' ? document.getElementById('vibeStrengthValue') : null;
                        if (strSpan) strSpan.textContent = parseFloat(obj.importInfo.strength).toFixed(2);
                    }
                } else if (this.availableVibeEncodings.length > 0) {
                    const firstEnc = this.availableVibeEncodings[0];
                    const slider = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
                    if (slider) slider.value = firstEnc.info;
                    const valSpan = typeof document !== 'undefined' ? document.getElementById('vibeInfoValue') : null;
                    if (valSpan) valSpan.textContent = firstEnc.info.toFixed(2);
                }
                
                this.updateVibeInfoUI(true, model);
            } else if (isBinaryVibe) {
                this.currentVibeIsJson = false;
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                const chunk = 8192;
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                const base64 = btoa(binary);

                const docId = this.generateDocId(base64, file.name);
                this.currentVibeDoc = {
                    identifier: "novelai-vibe-transfer",
                    version: 1,
                    type: "image",
                    id: docId,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    image: null,
                    thumbnail: null,
                    createdAt: Date.now(),
                    importInfo: {
                        model: 'nai-diffusion-4-5-full',
                        information_extracted: 1.0,
                        strength: 0.6
                    },
                    encodings: {
                        "v4-5full": {
                            [this.generateEncodingKey(docId, 1.0, base64)]: {
                                encoding: base64,
                                params: { information_extracted: 1.0 }
                            }
                        }
                    }
                };
                this.syncDocToCache();
                this.currentVibeImageBase64 = base64;
                this.rawImageBase64 = null;
                this.encodedVibeData = {
                    rawImage: null,
                    info: 1.0,
                    encoding: base64
                };

                const previewImg = document.getElementById('vibeImagePreview');
                if (previewImg) {
                    previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                    previewImg.classList.add('p-3');
                    previewImg.classList.remove('hidden');
                }

                this.updateVibeInfoUI(false, model);
            } else {
                const compressedDataUrl = await this.compressImage(file);
                this.rawImageBase64 = compressedDataUrl.split(',')[1];
                this.currentVibeImageBase64 = this.rawImageBase64;
                this.currentVibeIsJson = false;

                const docId = this.generateDocId(this.rawImageBase64, file.name);

                // Check if existing document for this image already exists in IndexedDB
                const cachedDoc = await this.vibeDb.getDoc(docId);
                if (cachedDoc && cachedDoc.encodings) {
                    this.currentVibeDoc = cachedDoc;
                    this.syncDocToCache();
                } else {
                    this.currentVibeDoc = {
                        identifier: "novelai-vibe-transfer",
                        version: 1,
                        type: "image",
                        id: docId,
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        image: this.rawImageBase64,
                        thumbnail: compressedDataUrl,
                        createdAt: Date.now(),
                        importInfo: {
                            model: 'nai-diffusion-4-5-full',
                            information_extracted: 1.0,
                            strength: 0.6
                        },
                        encodings: {
                            "v4-5full": {}
                        }
                    };
                    this.syncDocToCache();
                }
                
                const previewImg = typeof document !== 'undefined' ? document.getElementById('vibeImagePreview') : null;
                if (previewImg) {
                    previewImg.src = compressedDataUrl;
                    previewImg.classList.remove('hidden', 'p-4', 'p-3');
                }
                this.updateVibeInfoUI(false, model);
            }
            
            this.saveState(model);
            
            const placeholder = typeof document !== 'undefined' ? document.getElementById('vibeImagePlaceholder') : null;
            if (placeholder) placeholder.classList.add('hidden');

            const clearBtn = typeof document !== 'undefined' ? document.getElementById('clearVibeImageBtn') : null;
            if (clearBtn) clearBtn.classList.remove('hidden');

            const exportBtn = typeof document !== 'undefined' ? document.getElementById('exportVibeHeaderBtn') : null;
            if (exportBtn) exportBtn.classList.remove('hidden');

            const vibeControls = typeof document !== 'undefined' ? document.getElementById('vibeControls') : null;
            if (vibeControls) vibeControls.classList.remove('hidden');

            this.toggleVibeEnabled(model); 
        } catch (e) {
            console.error("Failed to process vibe file", e);
            if (typeof alert === 'function') {
                alert("文件处理失败: " + e.message);
            }
        }
    }

    selectStrengthValue(val, model = 'v4.5') {
        const slider = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const infoVal = typeof document !== 'undefined' ? document.getElementById('vibeInfoValue') : null;
        const num = parseFloat(val);
        if (slider) slider.value = num;
        if (infoVal) infoVal.textContent = num.toFixed(2);
        this.store.setSetting(this.getVibeKey('nai_vibe_info', model), num.toString());
        this.updateVibeStatus(model);
    }

    updateVibeInfoUI(isJson, model) {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('vibeInfoContainer');
        const infoVal = document.getElementById('vibeInfoValue');
        if (!container) return;

        const isV45 = model === 'v4.5';
        const existingSlider = document.getElementById('vibeInfo');
        const savedInfo = this.store.getSetting(this.getVibeKey('nai_vibe_info', model));
        const currentVal = existingSlider ? existingSlider.value : (savedInfo || this.currentVibeDoc?.importInfo?.information_extracted || "1.0");

        container.innerHTML = `
            <div class="space-y-2">
                <input type="range" id="vibeInfo" min="0.01" max="1.0" value="${currentVal}" step="0.01" class="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer">
                <div id="vibeStrengthsChips"></div>
                <div id="vibeEncodeStatus"></div>
            </div>
        `;
        const slider = container.querySelector('#vibeInfo');
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (infoVal) infoVal.textContent = val.toFixed(2);
                this.store.setSetting(this.getVibeKey('nai_vibe_info', model), e.target.value);
                if (isV45) {
                    this.updateVibeStatus(model);
                }
            });
            if (infoVal) infoVal.textContent = parseFloat(slider.value).toFixed(2);
        }
        if (isV45) {
            this.updateVibeStatus(model);
        }

        const exportBtn = document.getElementById('exportVibeHeaderBtn');
        if (exportBtn) {
            if (this.currentVibeImageBase64 || this.currentVibeDoc) {
                exportBtn.classList.remove('hidden');
            } else {
                exportBtn.classList.add('hidden');
            }
        }
    }

    updateVibeStatus(model) {
        if (typeof document === 'undefined') return;
        const statusContainer = document.getElementById('vibeEncodeStatus');
        const chipsContainer = document.getElementById('vibeStrengthsChips');
        if (!statusContainer) return;

        const isV45 = model === 'v4.5';
        if (!isV45 || (!this.currentVibeImageBase64 && !this.currentVibeDoc)) {
            statusContainer.innerHTML = '';
            if (chipsContainer) chipsContainer.innerHTML = '';
            return;
        }

        const vibeInfoEl = document.getElementById('vibeInfo');
        const currentInfo = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;
        const rawImg = this.rawImageBase64 || (this.isRawImage(this.currentVibeImageBase64) ? this.currentVibeImageBase64 : null);

        // Render chips for all strengths contained in this .nai4vibe file
        if (chipsContainer) {
            if (this.availableVibeEncodings.length > 0) {
                let chipsHtml = `
                    <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span class="text-[10px] text-gray-400 font-medium">已包含强度:</span>
                `;
                this.availableVibeEncodings.forEach(enc => {
                    const isMatched = Math.abs(enc.info - currentInfo) < 0.005;
                    chipsHtml += `
                        <button type="button" onclick="window.vibeManager && window.vibeManager.selectStrengthValue(${enc.info}, '${model}')" class="px-2 py-0.5 rounded text-[10px] font-mono transition-all ${isMatched ? 'bg-blue-600 text-white shadow-sm font-bold scale-105' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'}">
                            ${enc.info.toFixed(2)}
                        </button>
                    `;
                });
                chipsHtml += `</div>`;
                chipsContainer.innerHTML = chipsHtml;
            } else {
                chipsContainer.innerHTML = '';
            }
        }

        let cachedToken = this.getCachedEncoding(rawImg, currentInfo);

        if (cachedToken) {
            this.currentVibeImageBase64 = cachedToken;
            statusContainer.innerHTML = `
                <div class="mt-2 flex items-center justify-between text-[11px] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                    <span class="flex items-center gap-1 font-medium">✓ 已官方编码 (出图免耗点)</span>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportNai4Vibe('${model}')" class="bg-green-600 hover:bg-green-700 active:scale-95 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-sm transition-all" title="导出 .nai4vibe.json 官方多强度文件">导出 .nai4vibe</button>
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportVibeBinary('${model}')" class="border border-green-600/50 hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-95 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-medium transition-all" title="导出当前强度 .vibe 二进制文件">.vibe</button>
                    </div>
                </div>`;
        } else if (rawImg) {
            this.currentVibeImageBase64 = rawImg;
            statusContainer.innerHTML = `
                <div class="mt-2 flex items-center justify-between text-[11px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                    <span class="text-[10px] font-medium">需官方编码 (消耗 2 Anlas)</span>
                    <button type="button" onclick="window.triggerEncodeVibe && window.triggerEncodeVibe()" class="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-sm transition-all">立即编码</button>
                </div>`;
        } else {
            statusContainer.innerHTML = `
                <div class="mt-2 flex items-center justify-between text-[11px] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                    <span class="flex items-center gap-1 font-medium">✓ 已载入编码 Token (出图免耗点)</span>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportNai4Vibe('${model}')" class="bg-green-600 hover:bg-green-700 active:scale-95 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-sm transition-all">导出 .nai4vibe</button>
                        <button type="button" onclick="window.vibeManager && window.vibeManager.exportVibeBinary('${model}')" class="border border-green-600/50 hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-95 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-medium transition-all">.vibe</button>
                    </div>
                </div>`;
        }
    }

    needsV45Encoding(model = 'v4.5') {
        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : true;
        if (!vibeEnabled || model !== 'v4.5') return false;
        if (this.currentVibeIsJson) return false;
        if (!this.currentVibeImageBase64 && !this.currentVibeDoc) return false;

        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;
        const rawImg = this.rawImageBase64 || (this.isRawImage(this.currentVibeImageBase64) ? this.currentVibeImageBase64 : null);

        const cached = this.getCachedEncoding(rawImg, info);
        if (cached) {
            this.currentVibeImageBase64 = cached;
            this.encodedVibeData = {
                rawImage: rawImg,
                info: info,
                encoding: cached
            };
            return false;
        }

        if (!this.isRawImage(this.currentVibeImageBase64)) return false;

        return true;
    }

    async ensureV45Encoded(engine, auth, model = 'v4.5') {
        if (model !== 'v4.5') return;
        if (!this.currentVibeImageBase64 && !this.currentVibeDoc) return;

        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : 1.0;
        const rawImg = this.rawImageBase64 || (this.isRawImage(this.currentVibeImageBase64) ? this.currentVibeImageBase64 : null);

        if (!rawImg) return;

        const cached = this.getCachedEncoding(rawImg, info);
        if (cached) {
            this.currentVibeImageBase64 = cached;
            this.encodedVibeData = {
                rawImage: rawImg,
                info: info,
                encoding: cached
            };
            this.updateVibeStatus(model);
            return;
        }

        const res = await engine.encodeVibe({
            image: rawImg,
            model: 'nai-diffusion-4-5-full',
            information_extracted: info
        }, auth);

        if (res && res.encoding) {
            if (!this.currentVibeDoc) {
                this.buildDocFromCurrentState(model);
            }
            if (!this.currentVibeDoc.encodings) {
                this.currentVibeDoc.encodings = { "v4-5full": {} };
            }
            if (!this.currentVibeDoc.encodings["v4-5full"]) {
                this.currentVibeDoc.encodings["v4-5full"] = {};
            }

            const encKey = this.generateEncodingKey(this.currentVibeDoc.id, info, res.encoding);
            this.currentVibeDoc.encodings["v4-5full"][encKey] = {
                encoding: res.encoding,
                params: {
                    information_extracted: info
                }
            };
            const strengthEl = typeof document !== 'undefined' ? document.getElementById('vibeStrength') : null;
            this.currentVibeDoc.importInfo = {
                model: 'nai-diffusion-4-5-full',
                information_extracted: info,
                strength: parseFloat(strengthEl?.value || 0.6)
            };

            this.syncDocToCache();
            this.currentVibeImageBase64 = res.encoding;
            this.saveState(model);
            this.updateVibeStatus(model);
        }
    }

    exportVibeBinary(model = 'v4.5') {
        const rawImg = this.rawImageBase64;
        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const info = vibeInfoEl ? parseFloat(vibeInfoEl.value) : (this.encodedVibeData?.info || 1.0);
        
        let token = (!this.isRawImage(this.currentVibeImageBase64)) ? this.currentVibeImageBase64 : null;
        if (!token && rawImg) {
            token = this.getCachedEncoding(rawImg, info);
        }
        if (!token && this.availableVibeEncodings.length > 0) {
            token = this.availableVibeEncodings[0].base64;
        }

        if (!token) {
            if (typeof alert === 'function') alert("当前所选强度尚未进行官方编码，请先点击【立即编码】后再导出 .vibe 文件。");
            return;
        }

        try {
            const cleanBase64 = token.replace(/^data:application\/[a-z0-9-]+;base64,/, '').trim();
            const binaryString = atob(cleanBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            if (typeof document !== 'undefined') {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const infoStr = info.toFixed(2).replace('.', '_');
                const docName = this.currentVibeDoc?.name || 'novelai_vibe';
                a.download = `${docName}_${infoStr}.vibe`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }
        } catch (e) {
            console.error("Export .vibe binary failed:", e);
            if (typeof alert === 'function') alert("导出 .vibe 失败: " + e.message);
        }
    }

    exportNai4Vibe(model = 'v4.5') {
        if (!this.currentVibeDoc) {
            this.buildDocFromCurrentState(model);
        }

        const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
        const currentInfo = vibeInfoEl ? parseFloat(vibeInfoEl.value) : (this.encodedVibeData?.info || 1.0);
        const vibeStrengthEl = typeof document !== 'undefined' ? document.getElementById('vibeStrength') : null;
        const currentStrength = vibeStrengthEl ? parseFloat(vibeStrengthEl.value) : 0.6;

        if (!this.currentVibeDoc || !this.currentVibeDoc.encodings || Object.keys(this.currentVibeDoc.encodings['v4-5full'] || {}).length === 0) {
            if (typeof alert === 'function') alert("当前尚未包含官方编码，请先点击【立即编码】后再导出 .nai4vibe 文件。");
            return;
        }

        this.currentVibeDoc.importInfo = {
            model: 'nai-diffusion-4-5-full',
            information_extracted: currentInfo,
            strength: currentStrength
        };

        try {
            const jsonString = JSON.stringify(this.currentVibeDoc, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            if (typeof document !== 'undefined') {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const docName = this.currentVibeDoc.name || 'novelai_vibe';
                a.download = `${docName}.nai4vibe.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }
        } catch (e) {
            console.error("Export .nai4vibe failed:", e);
            if (typeof alert === 'function') alert("导出 .nai4vibe 失败: " + e.message);
        }
    }

    isValidForModel(selectedVersion, hasCustomKey = false) {
        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : true;
        
        if (vibeEnabled && (this.currentVibeImageBase64 || this.currentVibeDoc)) {
            if (selectedVersion === 'v5') {
                return {
                    isValid: false,
                    error: "V5 模型目前暂不支持氛围传输 (Vibe Transfer) 功能，请切换至 V3 或 V4.5 模型后使用。"
                };
            }
            if (selectedVersion === 'v4.5' && !this.currentVibeIsJson && !hasCustomKey) {
                return {
                    isValid: false,
                    error: "V4.5 模型氛围传输直接上传图片需要消耗官方 Anlas 算力编码。\n为了公共额度安全，请先在右上角配置您的【自定义 API Key】后使用，或上传官方提取的 .nai4vibe 或 .json 编码文件。"
                };
            }
        }
        return { isValid: true };
    }

    getPayloadParams(model) {
        const enabledCheckbox = typeof document !== 'undefined' ? document.getElementById('vibeEnabled') : null;
        const vibeEnabled = enabledCheckbox ? enabledCheckbox.checked : true;

        if (vibeEnabled && (this.currentVibeImageBase64 || this.currentVibeDoc) && model !== 'v5') {
            const vibeInfoEl = typeof document !== 'undefined' ? document.getElementById('vibeInfo') : null;
            const vibeStrengthEl = typeof document !== 'undefined' ? document.getElementById('vibeStrength') : null;
            
            let vibeInfo = 1.0;
            if (vibeInfoEl) {
                vibeInfo = parseFloat(vibeInfoEl.value);
            } else {
                const infoVal = typeof document !== 'undefined' ? document.getElementById('vibeInfoValue') : null;
                vibeInfo = infoVal ? parseFloat(infoVal.textContent || "1.0") : 1.0;
            }

            const vibeStrength = vibeStrengthEl ? parseFloat(vibeStrengthEl.value) : 0.6;

            return {
                vibe_image: this.currentVibeImageBase64,
                vibe_info: vibeInfo,
                vibe_strength: vibeStrength
            };
        }

        return {};
    }
}
