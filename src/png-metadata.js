/**
 * Extract PNG tEXt and iTXt metadata chunks from an ArrayBuffer.
 * Designed specifically to parse NovelAI generation parameters.
 * 
 * @param {ArrayBuffer} arrayBuffer - Raw PNG file data
 * @returns {Object} Key-value pairs of extracted metadata
 */
export function extractMetadata(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);
    let pos = 8; // Skip PNG signature (8 bytes)
    const chunks = {};

    while (pos < arrayBuffer.byteLength) {
        if (pos + 8 > arrayBuffer.byteLength) break;
        const length = view.getUint32(pos);
        
        // Read chunk type (4 bytes)
        let chunkType = "";
        for (let i = 0; i < 4; i++) {
            chunkType += String.fromCharCode(uint8[pos + 4 + i]);
        }
        
        if (pos + 12 + length > arrayBuffer.byteLength) break;
        
        if (chunkType === 'tEXt' || chunkType === 'iTXt') {
            const chunkData = uint8.subarray(pos + 8, pos + 8 + length);
            
            // Find first null byte separating the keyword
            let nullPos = -1;
            for (let i = 0; i < chunkData.length; i++) {
                if (chunkData[i] === 0) {
                    nullPos = i;
                    break;
                }
            }
            
            if (nullPos !== -1) {
                // Decode keyword (always ASCII/latin1)
                let keyword = "";
                for (let i = 0; i < nullPos; i++) {
                    keyword += String.fromCharCode(chunkData[i]);
                }
                
                let text = "";
                if (chunkType === 'iTXt') {
                    // iTXt chunk layout:
                    // keyword (null-terminated)
                    // compression flag (1 byte)
                    // compression method (1 byte)
                    // language tag (null-terminated)
                    // translated keyword (null-terminated)
                    // text (rest of chunk)
                    let p = nullPos + 1;
                    if (p + 2 <= chunkData.length) {
                        const compFlag = chunkData[p];
                        const compMethod = chunkData[p + 1];
                        p += 2;
                        
                        // find language tag end
                        let langTagEnd = -1;
                        for (let i = p; i < chunkData.length; i++) {
                            if (chunkData[i] === 0) {
                                langTagEnd = i;
                                break;
                            }
                        }
                        
                        if (langTagEnd !== -1) {
                            p = langTagEnd + 1;
                            
                            // find translated keyword end
                            let transKeyEnd = -1;
                            for (let i = p; i < chunkData.length; i++) {
                                if (chunkData[i] === 0) {
                                    transKeyEnd = i;
                                    break;
                                }
                            }
                            
                            if (transKeyEnd !== -1) {
                                p = transKeyEnd + 1;
                                const rawText = chunkData.subarray(p);
                                if (compFlag === 0) {
                                    text = new TextDecoder('utf-8').decode(rawText);
                                } else {
                                    text = "[Compressed iTXt data]";
                                }
                            }
                        }
                    }
                } else {
                    // tEXt chunk layout:
                    // keyword (null-terminated)
                    // text (rest of chunk)
                    const rawText = chunkData.subarray(nullPos + 1);
                    text = new TextDecoder('utf-8').decode(rawText);
                }
                chunks[keyword] = text;
            }
        }
        
        pos += 12 + length;
    }
    return chunks;
}
