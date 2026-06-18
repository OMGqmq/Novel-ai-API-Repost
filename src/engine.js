/**
 * Image Generation Engine Module
 * Encapsulates the communication with NovelAI proxy and image processing.
 */
export class ImageEngine {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || '';
        // JSZip is expected to be available globally via CDN
        this.JSZip = window.JSZip;
    }

    /**
     * Generates an image based on provided parameters.
     * @param {Object} params - Generation parameters (prompt, model, resolution, etc.)
     * @param {Object} auth - Authentication tokens
     * @returns {Promise<{imageUrl: string, blob: Blob, userRole: string}>}
     */
    async generate(params, auth) {
        if (!this.JSZip) {
            throw new Error("JSZip library not found. Please ensure it is loaded.");
        }

        const { adminToken, userKey, customApiKey, userToken } = auth;

        const response = await fetch(`${this.baseUrl}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken || "",
                'x-user-key': userKey || "",
                'x-custom-api-key': customApiKey || "",
                ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
            },
            body: JSON.stringify(params)
        });

        await this._handleErrors(response);

        const userRole = this._parseUserRole(response);
        const contentType = response.headers.get("content-type") || "";
        const blob = await response.blob();
        
        let imgBlob;
        if (contentType.includes("application/zip")) {
            imgBlob = await this._extractImageFromZip(blob);
        } else {
            imgBlob = blob;
        }
        const imageUrl = URL.createObjectURL(imgBlob);

        return {
            imageUrl,
            blob: imgBlob,
            userRole
        };
    }

    /**
     * Augments an image (e.g., extract lineart or sketch).
     * @param {Object} params - Augment parameters (req_type, width, height, image)
     * @param {Object} auth - Authentication tokens
     * @returns {Promise<{imageUrl: string, blob: Blob, userRole: string}>}
     */
    async augment(params, auth) {
        if (!this.JSZip) {
            throw new Error("JSZip library not found. Please ensure it is loaded.");
        }

        const { adminToken, userKey, customApiKey, userToken } = auth;

        const response = await fetch(`${this.baseUrl}/augment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': adminToken || "",
                'x-user-key': userKey || "",
                'x-custom-api-key': customApiKey || "",
                ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
            },
            body: JSON.stringify(params)
        });

        await this._handleErrors(response);

        const userRole = this._parseUserRole(response);
        const contentType = response.headers.get("content-type") || "";
        const blob = await response.blob();
        
        let imgBlob;
        if (contentType.includes("application/zip")) {
            imgBlob = await this._extractImageFromZip(blob);
        } else {
            imgBlob = blob;
        }
        const imageUrl = URL.createObjectURL(imgBlob);

        return {
            imageUrl,
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
            if (relativePath.endsWith('.png')) {
                imgFile = file;
            }
        });

        if (!imgFile) {
            throw new Error("No image found in the received ZIP archive.");
        }

        return await imgFile.async("blob");
    }
}
