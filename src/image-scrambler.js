/**
 * Lossless Image Scrambler/Decryptor for Web Canvas
 * Supports Tile Scrambling, Pixel XOR, and Row-Column Circular Shift.
 */

// 1. Seeded Pseudo-Random Number Generator (Mulberry32)
export function createPRNG(seedString) {
    // Generate a 32-bit hash value from the seed string using FNV-1a
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedString.length; i++) {
        h = Math.imul(h ^ seedString.charCodeAt(i), 16777619) >>> 0;
    }
    
    // Mulberry32 generator
    return function() {
        let z = (h += 0x6D2B79F5) | 0;
        z = Math.imul(z ^ (z >>> 15), z | 1);
        z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
        return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
}

// 2. Tile Scrambling Algorithm (Canvas-based tile movement)
function scrambleTiles(canvas, prng, isDecrypt, tileSize = 32) {
    const width = canvas.width;
    const height = canvas.height;
    const cols = Math.floor(width / tileSize);
    const rows = Math.floor(height / tileSize);
    const numBlocks = cols * rows;

    if (numBlocks <= 1) return; // Canvas too small to scramble

    // Generate random block sequence mapping
    const arr = Array.from({ length: numBlocks }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }

    // Create a temporary canvas for copying
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!tempCtx || !ctx) return;

    // Draw current canvas state into temporary canvas
    tempCtx.drawImage(canvas, 0, 0);

    // Clear original canvas (we draw the parts back)
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);
    // Draw back unchanged edges first
    ctx.drawImage(tempCanvas, 0, 0);

    // Swap tiles
    for (let i = 0; i < numBlocks; i++) {
        const srcIndex = isDecrypt ? arr[i] : i;
        const destIndex = isDecrypt ? i : arr[i];

        const srcCol = srcIndex % cols;
        const srcRow = Math.floor(srcIndex / cols);
        const destCol = destIndex % cols;
        const destRow = Math.floor(destIndex / cols);

        ctx.drawImage(
            tempCanvas,
            srcCol * tileSize,
            srcRow * tileSize,
            tileSize,
            tileSize,
            destCol * tileSize,
            destRow * tileSize,
            tileSize,
            tileSize
        );
    }
}

// 3. Pixel XOR Algorithm
function scramblePixelXOR(canvas, prng) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const rKey = Math.floor(prng() * 256);
        const gKey = Math.floor(prng() * 256);
        const bKey = Math.floor(prng() * 256);

        data[i] ^= rKey;     // R
        data[i + 1] ^= gKey; // G
        data[i + 2] ^= bKey; // B
        // Alpha channel (i+3) remains unchanged
    }

    ctx.putImageData(imageData, 0, 0);
}

// 4. Row-Column Shift Algorithm (Lossless circular shift)
function scrambleRowColShift(canvas, prng, isDecrypt) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // Use Uint32Array view on the image buffer for fast 32-bit pixel manipulations
    const buffer = new Uint32Array(imageData.data.buffer);

    // Pre-calculate shift offsets for each row and column to ensure reproducibility
    const rowShifts = new Array(height);
    for (let y = 0; y < height; y++) {
        rowShifts[y] = Math.floor(prng() * width);
    }

    const colShifts = new Array(width);
    for (let x = 0; x < width; x++) {
        colShifts[x] = Math.floor(prng() * height);
    }

    if (isDecrypt) {
        // Decrypt: Reverse operations (Shift columns back, then shift rows back)
        
        // 1. Shift columns back (Circular Up Shift)
        for (let x = 0; x < width; x++) {
            const shift = colShifts[x];
            if (shift > 0) {
                const temp = new Uint32Array(height);
                for (let y = 0; y < height; y++) {
                    temp[y] = buffer[y * width + x];
                }
                for (let y = 0; y < height; y++) {
                    // Shift UP: target = (y - shift + height) % height
                    const targetY = (y - shift + height) % height;
                    buffer[targetY * width + x] = temp[y];
                }
            }
        }

        // 2. Shift rows back (Circular Left Shift)
        for (let y = 0; y < height; y++) {
            const shift = rowShifts[y];
            if (shift > 0) {
                const rowStart = y * width;
                const temp = new Uint32Array(width);
                temp.set(buffer.subarray(rowStart, rowStart + width));
                for (let x = 0; x < width; x++) {
                    // Shift LEFT: target = (x - shift + width) % width
                    const targetX = (x - shift + width) % width;
                    buffer[rowStart + targetX] = temp[x];
                }
            }
        }

    } else {
        // Encrypt: (Shift rows first, then shift columns)

        // 1. Shift rows forward (Circular Right Shift)
        for (let y = 0; y < height; y++) {
            const shift = rowShifts[y];
            if (shift > 0) {
                const rowStart = y * width;
                const temp = new Uint32Array(width);
                temp.set(buffer.subarray(rowStart, rowStart + width));
                for (let x = 0; x < width; x++) {
                    // Shift RIGHT: target = (x + shift) % width
                    buffer[rowStart + ((x + shift) % width)] = temp[x];
                }
            }
        }

        // 2. Shift columns forward (Circular Down Shift)
        for (let x = 0; x < width; x++) {
            const shift = colShifts[x];
            if (shift > 0) {
                const temp = new Uint32Array(height);
                for (let y = 0; y < height; y++) {
                    temp[y] = buffer[y * width + x];
                }
                for (let y = 0; y < height; y++) {
                    // Shift DOWN: target = (y + shift) % height
                    buffer[((y + shift) % height) * width + x] = temp[y];
                }
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Public execution entry
 * @param {HTMLCanvasElement} canvas - Target canvas to transform
 * @param {string} algorithm - 'tile' | 'xor' | 'shift'
 * @param {string} key - String key to generate random seed
 * @param {boolean} isDecrypt - True for decryption, False for encryption
 * @param {object} [options] - Options like { tileSize: 32 }
 */
export function processImageScrambler(canvas, algorithm, key, isDecrypt, options = {}) {
    const prng = createPRNG(key || "default_scrambler_magic_key");
    const tileSize = options.tileSize || 32;

    switch (algorithm) {
        case 'tile':
            scrambleTiles(canvas, prng, isDecrypt, tileSize);
            break;
        case 'xor':
            scramblePixelXOR(canvas, prng);
            break;
        case 'shift':
            scrambleRowColShift(canvas, prng, isDecrypt);
            break;
        default:
            throw new Error("Unknown scrambling algorithm: " + algorithm);
    }
}
