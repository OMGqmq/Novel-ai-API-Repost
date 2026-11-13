/**
 * API Configuration Module
 * Allows dynamic configuration of backend server URL (e.g. when frontend is hosted on Cloudflare Pages).
 */
export function normalizeBackendUrl(url, { throwOnInvalid = false } = {}) {
    const raw = String(url || '').trim().replace(/\/+$/, '');
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('后端地址仅支持 http:// 或 https:// 协议');
        }
        return raw;
    } catch (err) {
        if (throwOnInvalid) {
            throw new Error(err?.message?.includes('http') ? err.message : '后端地址格式无效，请输入完整的 http(s):// URL');
        }
        return '';
    }
}

export function getApiBaseUrl() {
    if (typeof window === 'undefined') return '';
    // Priority:
    // 1. User configured in localStorage (via Settings modal)
    // 2. Global window.NAI_BACKEND_URL (can be injected or set in index.html)
    // 3. Fallback: empty string (uses current domain/relative path)
    try {
        const url = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function')
            ? (localStorage.getItem('nai_backend_url') || (window.NAI_BACKEND_URL || ''))
            : (window.NAI_BACKEND_URL || '');
        return normalizeBackendUrl(url, { throwOnInvalid: false });
    } catch {
        return '';
    }
}

export function setApiBaseUrl(url) {
    if (typeof window === 'undefined') return;
    const cleanUrl = normalizeBackendUrl(url, { throwOnInvalid: true });
    try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
            if (cleanUrl) {
                localStorage.setItem('nai_backend_url', cleanUrl);
            } else {
                localStorage.removeItem('nai_backend_url');
            }
        }
    } catch (_) {}
}

export function apiUrl(path) {
    const base = getApiBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return base ? `${base}${cleanPath}` : cleanPath;
}
