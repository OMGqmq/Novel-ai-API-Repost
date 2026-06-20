import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processImageScrambler } from '../src/image-scrambler.js';

// Setup Mock DOM and document
global.window = {};
global.document = {
    createElement: vi.fn()
};

function createMockCanvas(width, height) {
    const dataSize = width * height * 4;
    const pixelData = new Uint8ClampedArray(dataSize);
    
    // Fill with gradient non-zero test pixel data
    for (let i = 0; i < dataSize; i += 4) {
        pixelData[i] = (i / 4) % 256;          // R
        pixelData[i + 1] = ((i / 4) * 3) % 256; // G
        pixelData[i + 2] = ((i / 4) * 7) % 256; // B
        pixelData[i + 3] = 255;                // A
    }

    const mockCtx = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn().mockImplementation((sourceCanvas, ...args) => {
            // Emulate canvas 2d context drawImage overrides:
            // 1. drawImage(image, dx, dy)
            // 2. drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
            const srcBuf = sourceCanvas._pixelData;
            const destBuf = pixelData;
            const sWidth = sourceCanvas.width;
            const sHeight = sourceCanvas.height;
            const dWidth = width;

            let sx = 0, sy = 0, sw = sWidth, sh = sHeight;
            let dx = 0, dy = 0, dw = width, dh = height;

            if (args.length === 2) {
                dx = args[0];
                dy = args[1];
                dw = sWidth;
                dh = sHeight;
            } else if (args.length === 8) {
                sx = args[0];
                sy = args[1];
                sw = args[2];
                sh = args[3];
                dx = args[4];
                dy = args[5];
                dw = args[6];
                dh = args[7];
            }

            for (let r = 0; r < sh; r++) {
                for (let c = 0; c < sw; c++) {
                    const srcIdx = ((sy + r) * sWidth + (sx + c)) * 4;
                    const destIdx = ((dy + r) * dWidth + (dx + c)) * 4;
                    if (srcIdx < srcBuf.length && destIdx < destBuf.length) {
                        destBuf[destIdx] = srcBuf[srcIdx];
                        destBuf[destIdx + 1] = srcBuf[srcIdx + 1];
                        destBuf[destIdx + 2] = srcBuf[srcIdx + 2];
                        destBuf[destIdx + 3] = srcBuf[srcIdx + 3];
                    }
                }
            }
        }),
        getImageData: vi.fn().mockImplementation((x, y, w, h) => {
            return {
                width: w,
                height: h,
                data: new Uint8ClampedArray(pixelData)
            };
        }),
        putImageData: vi.fn().mockImplementation((imgData) => {
            pixelData.set(imgData.data);
        })
    };

    const canvas = {
        width,
        height,
        getContext: vi.fn().mockReturnValue(mockCtx),
        _pixelData: pixelData
    };

    return canvas;
}

describe('ImageScrambler Core Algorithms', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock document.createElement to spawn mock canvases for Tile Scrambling
        global.document.createElement.mockImplementation((tag) => {
            if (tag === 'canvas') {
                return createMockCanvas(128, 128);
            }
            return {};
        });
    });

    it('should encrypt and decrypt using Pixel XOR algorithm losslessly', () => {
        const canvas = createMockCanvas(128, 128);
        const originalPixels = new Uint8ClampedArray(canvas._pixelData);

        // 1. Encrypt
        processImageScrambler(canvas, 'xor', 'my-super-secret-key-123', false);
        const encryptedPixels = new Uint8ClampedArray(canvas._pixelData);
        
        // Assert pixels actually changed (encrypted)
        expect(encryptedPixels).not.toEqual(originalPixels);

        // 2. Decrypt with correct key
        processImageScrambler(canvas, 'xor', 'my-super-secret-key-123', true);
        const decryptedPixels = new Uint8ClampedArray(canvas._pixelData);

        // Assert 100% lossless restoration
        expect(decryptedPixels).toEqual(originalPixels);
    });

    it('should fail to decrypt using Pixel XOR with incorrect key', () => {
        const canvas = createMockCanvas(128, 128);
        const originalPixels = new Uint8ClampedArray(canvas._pixelData);

        // 1. Encrypt
        processImageScrambler(canvas, 'xor', 'my-super-secret-key-123', false);

        // 2. Decrypt with WRONG key
        processImageScrambler(canvas, 'xor', 'wrong-key-456', true);
        const decryptedPixels = new Uint8ClampedArray(canvas._pixelData);

        // Assert decryption failed (still scrambled/mismatched)
        expect(decryptedPixels).not.toEqual(originalPixels);
    });

    it('should encrypt and decrypt using Row-Column Shift algorithm losslessly', () => {
        const canvas = createMockCanvas(128, 128);
        const originalPixels = new Uint8ClampedArray(canvas._pixelData);

        // 1. Encrypt
        processImageScrambler(canvas, 'shift', 'my-shift-key', false);
        const encryptedPixels = new Uint8ClampedArray(canvas._pixelData);
        expect(encryptedPixels).not.toEqual(originalPixels);

        // 2. Decrypt
        processImageScrambler(canvas, 'shift', 'my-shift-key', true);
        const decryptedPixels = new Uint8ClampedArray(canvas._pixelData);
        expect(decryptedPixels).toEqual(originalPixels);
    });

    it('should encrypt and decrypt using Tile Scrambling algorithm losslessly', () => {
        const canvas = createMockCanvas(128, 128); // 128x128 pixels
        const originalPixels = new Uint8ClampedArray(canvas._pixelData);

        // 1. Encrypt (Tile Scrambling with 32px tile size)
        processImageScrambler(canvas, 'tile', 'my-tile-key', false, { tileSize: 32 });
        const encryptedPixels = new Uint8ClampedArray(canvas._pixelData);
        expect(encryptedPixels).not.toEqual(originalPixels);

        // 2. Decrypt
        processImageScrambler(canvas, 'tile', 'my-tile-key', true, { tileSize: 32 });
        const decryptedPixels = new Uint8ClampedArray(canvas._pixelData);
        expect(decryptedPixels).toEqual(originalPixels);
    });
});
