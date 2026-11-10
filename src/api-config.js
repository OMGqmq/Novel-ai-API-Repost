/**
 * API Configuration Module
 * Allows dynamic configuration of backend server URL (e.g. when frontend is hosted on Cloudflare Pages).
 */
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
        return url.trim().replace(/\/+$/, '');
    } catch {
        return '';
    }
}

export function setApiBaseUrl(url) {
    if (typeof window === 'undefined') return;
    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
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
