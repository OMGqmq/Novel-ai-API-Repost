/**
 * Download & File Saver Helper Module
 * Provides unified cross-platform saving capabilities:
 * - Desktop Chrome/Edge: Native File System Access API (showSaveFilePicker - "Save As" / 另存为)
 * - Mobile iOS/Android: Native Web Share API (navigator.share - "Save Image / 存储图像 / 存储到文件")
 * - Universal Fallback: Synchronous <a> anchor download with precise MIME typing and memory-safe cleanup
 */

export function getMimeFromFilename(filename, fallback = 'image/png') {
    if (!filename || typeof filename !== 'string') return fallback;
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'json') return 'application/json';
    if (ext === 'zip') return 'application/zip';
    return fallback;
}

export function dataUrlToBlob(dataUrl, preferredMime = null) {
    const parts = dataUrl.split(',');
    const headerMime = (parts[0].match(/:(.*?);/) || [])[1];
    const mime = preferredMime || headerMime || 'image/png';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

export async function triggerDownload(urlOrBlob, filename) {
    console.log('[DEBUG-dl] triggerDownload called with filename:', filename);
    
    // 微信内置浏览器拦截与友好提示
    const isWeChat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');
    if (isWeChat) {
        console.warn('[DEBUG-dl] Blocked due to WeChat environment.');
        const msg = '微信内无法直接下载，请长按图片选择“保存图片”，或在右上角选择在浏览器中打开。';
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast(msg, 'warning');
        } else if (typeof alert === 'function') {
            alert(msg);
        }
        return;
    }

    const expectedMime = getMimeFromFilename(filename, 'image/png');
    let blob = null;
    let fallbackUrl = typeof urlOrBlob === 'string' ? urlOrBlob : '';
    let isBlobCreated = false;

    // 1. 解析与构造标准 Blob (支持 Blob, data URL, 以及 HTTP/Blob URL)
    try {
        if (typeof Blob !== 'undefined' && urlOrBlob instanceof Blob) {
            blob = urlOrBlob.type ? urlOrBlob : new Blob([urlOrBlob], { type: expectedMime });
        } else if (typeof urlOrBlob === 'string') {
            if (urlOrBlob.startsWith('data:')) {
                blob = dataUrlToBlob(urlOrBlob, expectedMime);
            } else if (typeof fetch === 'function') {
                try {
                    const resp = await fetch(urlOrBlob);
                    if (resp.ok) {
                        blob = await resp.blob();
                    }
                } catch (fetchErr) {
                    console.warn('[DEBUG-dl] Fetch URL to Blob failed, using direct URL fallback:', fetchErr);
                }
            }
        }
    } catch (e) {
        console.error('[DEBUG-dl] Error preparing download Blob:', e);
    }

    const isMobile = typeof navigator !== 'undefined' && (
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || 
        (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent || ''))
    );

    // 2. PC 桌面端：系统原生“另存为”对话框 (File System Access API - Chrome/Edge 等支持的浏览器)
    if (!isMobile && blob && typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
        try {
            const ext = (filename.split('.').pop() || 'png').toLowerCase();
            const acceptMap = {
                'png': { mime: 'image/png', desc: 'PNG 图片 (*.png)', exts: ['.png'] },
                'jpg': { mime: 'image/jpeg', desc: 'JPEG 图片 (*.jpg; *.jpeg)', exts: ['.jpg', '.jpeg'] },
                'jpeg': { mime: 'image/jpeg', desc: 'JPEG 图片 (*.jpg; *.jpeg)', exts: ['.jpg', '.jpeg'] },
                'webp': { mime: 'image/webp', desc: 'WebP 图片 (*.webp)', exts: ['.webp'] },
                'json': { mime: 'application/json', desc: 'JSON 文件 (*.json)', exts: ['.json'] },
                'zip': { mime: 'application/zip', desc: 'ZIP 压缩包 (*.zip)', exts: ['.zip'] }
            };

            const mapping = acceptMap[ext] || { 
                mime: (blob.type && blob.type !== 'application/octet-stream') ? blob.type : expectedMime, 
                desc: `${ext.toUpperCase()} 文件 (*.${ext})`, 
                exts: [`.${ext}`] 
            };

            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: mapping.desc,
                    accept: { [mapping.mime]: mapping.exts }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            if (window.showToast) {
                window.showToast('已成功保存文件！', 'success', 2000);
            }
            return;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[DEBUG-dl] User cancelled native save picker.');
                return;
            }
            console.warn('[DEBUG-dl] showSaveFilePicker failed, falling back to direct download:', err);
        }
    }

    // 3. 手机端与通用标准：100% 纯同步 <a> 标签触发直接保存 (避免手势过期，强类型 Blob 入库系统相册)
    let finalUrl = fallbackUrl;
    if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        finalUrl = URL.createObjectURL(blob);
        isBlobCreated = true;
    }

    if (!finalUrl) {
        console.error('[DEBUG-dl] No valid URL to download.');
        return;
    }

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        console.warn('[DEBUG-dl] document is not defined in this environment.');
        return;
    }

    const a = document.createElement('a');
    a.style.display = 'none';
    a.rel = 'noopener';
    a.download = filename || `novelai-${Date.now()}.png`;
    a.href = finalUrl;
    if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(a);
    }
    
    try {
        if (typeof a.click === 'function') {
            a.click();
        }
        console.log('[DEBUG-dl] Synchronous anchor download triggered successfully.');
    } catch (e) {
        console.error('[DEBUG-dl] Direct click failed, dispatching MouseEvent:', e);
        try {
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            a.dispatchEvent(event);
        } catch (err) {
            console.error('[DEBUG-dl] MouseEvent dispatch failed:', err);
        }
    } finally {
        setTimeout(() => {
            if (a.parentNode && typeof a.parentNode.removeChild === 'function') {
                a.parentNode.removeChild(a);
            }
        }, 1500);
    }

    // 超长延迟 (40秒) 释放 Blob URL，确保后台下载管理器完成文件写入
    if (isBlobCreated && finalUrl.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        setTimeout(() => {
            try {
                URL.revokeObjectURL(finalUrl);
            } catch (err) {
                console.error('[DEBUG-dl] Failed to revoke Blob URL:', err);
            }
        }, 40000);
    }
}
