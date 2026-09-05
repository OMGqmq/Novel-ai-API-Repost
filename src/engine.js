/**
 * Image Generation Engine Module
 * Encapsulates the communication with NovelAI proxy and image processing.
 */
export class ImageEngine {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || '';
        // JSZip is expected to be available globally via CDN
        this.JSZip = (typeof window !== 'undefined' && window.JSZip) ? window.JSZip : null;
    }

    async generate(params, auth) {
        return this._request('/generate', params, auth);
    }

    async augment(params, auth) {
        return this._request('/augment', params, auth);
    }

    async upscale(params, auth) {
        return this._request('/upscale', params, auth);
    }

    async _request(endpoint, params, auth = {}) {
        if (!this.JSZip) {
            throw new Error("JSZip library not found. Please ensure it is loaded.");
        }

        const { adminToken, userKey, customApiKey, userToken } = auth;
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken || "",
                'x-user-key': userKey || "",
                'x-custom-api-key': customApiKey || "",
                ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
            },
            body: JSON.stringify(params),
            signal: AbortSignal.timeout(60000)
        });

        await this._handleErrors(response);

        const userRole = this._parseUserRole(response);
        const contentType = response.headers.get("content-type") || "";
        const blob = await response.blob();
        const imgBlob = contentType.includes("application/zip") ? await this._extractImageFromZip(blob) : blob;

        return {
            imageUrl: URL.createObjectURL(imgBlob),
            blob: imgBlob,
            userRole
        };
    }

    async _handleErrors(response) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const errData = await response.json();
            throw new Error(errData.error || `Server Error: ${response.status}`);
        }
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
    }

    _parseUserRole(response) {
        const rawRole = response.headers.get("X-User-Role");
        return rawRole ? decodeURIComponent(rawRole) : null;
    }

    async _extractImageFromZip(zipBlob) {
        const zip = await this.JSZip.loadAsync(zipBlob);
        let imgFile = null;

        zip.forEach((relativePath, file) => {
            if (!file.dir && !imgFile) {
                const lower = relativePath.toLowerCase();
                if (lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
                    imgFile = file;
                }
            }
        });

        // Fallback: 如果没有匹配到常见后缀，获取压缩包内的第一个非目录文件
        if (!imgFile) {
            zip.forEach((relativePath, file) => {
                if (!file.dir && !imgFile) {
                    imgFile = file;
                }
            });
        }

        if (!imgFile) {
            throw new Error("No image found in the received ZIP archive.");
        }

        return await imgFile.async("blob");
    }
}
