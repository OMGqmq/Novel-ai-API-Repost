import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMimeFromFilename, dataUrlToBlob, triggerDownload } from '../src/download-helper.js';

// Setup Mock DOM and browser environment if running in Node
if (typeof global.window === 'undefined') {
    global.window = {};
}
if (typeof global.document === 'undefined') {
    global.document = {
        body: {
            appendChild: vi.fn(),
            removeChild: vi.fn()
        },
        createElement: vi.fn().mockImplementation((tag) => ({
            tagName: tag.toUpperCase(),
            style: {},
            download: '',
            href: '',
            rel: '',
            click: vi.fn(),
            dispatchEvent: vi.fn(),
            parentNode: {
                removeChild: vi.fn()
            }
        }))
    };
}
if (typeof global.navigator === 'undefined') {
    global.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 0
    };
}
if (typeof global.URL === 'undefined' || !global.URL.createObjectURL) {
    global.URL = {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url'),
        revokeObjectURL: vi.fn()
    };
}

describe('Download Functionality Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.window.showToast = vi.fn();
    });

    describe('getMimeFromFilename', () => {
        it('should correctly determine MIME type based on extension', () => {
            expect(getMimeFromFilename('image.png')).toBe('image/png');
            expect(getMimeFromFilename('photo.jpg')).toBe('image/jpeg');
            expect(getMimeFromFilename('photo.jpeg')).toBe('image/jpeg');
            expect(getMimeFromFilename('art.webp')).toBe('image/webp');
            expect(getMimeFromFilename('backup.json')).toBe('application/json');
            expect(getMimeFromFilename('archive.zip')).toBe('application/zip');
            expect(getMimeFromFilename('unknown.xyz', 'image/png')).toBe('image/png');
            expect(getMimeFromFilename(null)).toBe('image/png');
        });
    });

    describe('dataUrlToBlob', () => {
        it('should correctly convert a base64 data URL to a typed Blob', () => {
            const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const blob = dataUrlToBlob(dataUrl, 'image/png');
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe('image/png');
            expect(blob.size).toBeGreaterThan(0);
        });
    });

    describe('triggerDownload behavior', () => {
        it('should warn and block download inside WeChat browser environment', async () => {
            const originalUA = global.navigator.userAgent;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.30',
                configurable: true
            });

            await triggerDownload('data:image/png;base64,AAAA', 'test.png');

            expect(global.window.showToast).toHaveBeenCalledWith(
                expect.stringContaining('微信内无法直接下载'),
                'warning'
            );

            Object.defineProperty(global.navigator, 'userAgent', {
                value: originalUA,
                configurable: true
            });
        });

        it('should call window.showSaveFilePicker on desktop when supported', async () => {
            const originalUA = global.navigator.userAgent;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                configurable: true
            });

            const mockWritable = {
                write: vi.fn().mockResolvedValue(),
                close: vi.fn().mockResolvedValue()
            };
            const mockHandle = {
                createWritable: vi.fn().mockResolvedValue(mockWritable)
            };
            global.window.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

            const testBlob = new Blob(['test-content'], { type: 'image/png' });
            await triggerDownload(testBlob, 'test_art.png');

            expect(global.window.showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
                suggestedName: 'test_art.png'
            }));
            expect(mockWritable.write).toHaveBeenCalledWith(testBlob);
            expect(mockWritable.close).toHaveBeenCalled();
            expect(global.window.showToast).toHaveBeenCalledWith('已成功保存文件！', 'success', 2000);

            delete global.window.showSaveFilePicker;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: originalUA,
                configurable: true
            });
        });

        it('should handle desktop showSaveFilePicker user cancellation gracefully', async () => {
            const originalUA = global.navigator.userAgent;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                configurable: true
            });

            const abortError = new Error('User cancelled');
            abortError.name = 'AbortError';
            global.window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError);

            const appendSpy = vi.spyOn(global.document.body, 'appendChild');

            const testBlob = new Blob(['test-content'], { type: 'image/png' });
            await triggerDownload(testBlob, 'test_art.png');

            expect(global.window.showSaveFilePicker).toHaveBeenCalled();
            expect(appendSpy).not.toHaveBeenCalled();

            delete global.window.showSaveFilePicker;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: originalUA,
                configurable: true
            });
        });

        it('should call navigator.share on mobile devices when supported', async () => {
            const originalUA = global.navigator.userAgent;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
                configurable: true
            });

            global.navigator.share = vi.fn().mockResolvedValue();
            global.navigator.canShare = vi.fn().mockReturnValue(true);

            const testBlob = new Blob(['test-image'], { type: 'image/png' });
            await triggerDownload(testBlob, 'mobile_art.png');

            expect(global.navigator.canShare).toHaveBeenCalled();
            expect(global.navigator.share).toHaveBeenCalledWith(expect.objectContaining({
                title: 'mobile_art.png'
            }));

            delete global.navigator.share;
            delete global.navigator.canShare;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: originalUA,
                configurable: true
            });
        });

        it('should fallback to <a> tag click when special APIs are not supported', async () => {
            const originalUA = global.navigator.userAgent;
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
                configurable: true
            });

            delete global.window.showSaveFilePicker;
            delete global.navigator.share;
            delete global.navigator.canShare;

            let createdAnchor = null;
            vi.spyOn(global.document, 'createElement').mockImplementation((tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    style: {},
                    download: '',
                    href: '',
                    rel: '',
                    click: vi.fn(),
                    parentNode: {
                        removeChild: vi.fn()
                    }
                };
                if (tag === 'a') {
                    createdAnchor = el;
                }
                return el;
            });

            const testBlob = new Blob(['fallback-content'], { type: 'image/png' });
            await triggerDownload(testBlob, 'fallback_test.png');

            expect(createdAnchor).not.toBeNull();
            expect(createdAnchor.download).toBe('fallback_test.png');
            expect(createdAnchor.click).toHaveBeenCalled();

            Object.defineProperty(global.navigator, 'userAgent', {
                value: originalUA,
                configurable: true
            });
        });
    });
});
