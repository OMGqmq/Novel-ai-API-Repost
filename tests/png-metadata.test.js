import { describe, it, expect } from 'vitest';
import { extractMetadata } from '../src/png-metadata.js';

describe('PNG Metadata Extractor', () => {
    it('should correctly parse tEXt chunks from binary array buffer', () => {
        // Construct a mock PNG ArrayBuffer
        const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        
        // Construct tEXt chunk: Keyword: "Description", Text: "A beautiful scenery"
        const textKey = "Description";
        const textValue = "A beautiful scenery";
        const textKeyBytes = new TextEncoder().encode(textKey);
        const textValBytes = new TextEncoder().encode(textValue);
        
        const chunkDataBytes = new Uint8Array(textKeyBytes.length + 1 + textValBytes.length);
        chunkDataBytes.set(textKeyBytes, 0);
        chunkDataBytes[textKeyBytes.length] = 0;
        chunkDataBytes.set(textValBytes, textKeyBytes.length + 1);
        
        const chunkLength = chunkDataBytes.length;
        const chunkTypeBytes = new TextEncoder().encode("tEXt");
        const crcBytes = [0, 0, 0, 0];
        
        const textChunkBuffer = new Uint8Array(4 + 4 + chunkLength + 4);
        const view = new DataView(textChunkBuffer.buffer);
        view.setUint32(0, chunkLength);
        textChunkBuffer.set(chunkTypeBytes, 4);
        textChunkBuffer.set(chunkDataBytes, 8);
        textChunkBuffer.set(crcBytes, 8 + chunkLength);
        
        // Assemble final buffer
        const totalLength = signature.length + textChunkBuffer.length;
        const fileBuffer = new Uint8Array(totalLength);
        fileBuffer.set(signature, 0);
        fileBuffer.set(textChunkBuffer, signature.length);
        
        const result = extractMetadata(fileBuffer.buffer);
        expect(result).toHaveProperty('Description');
        expect(result.Description).toBe('A beautiful scenery');
    });

    it('should correctly parse iTXt chunks from binary array buffer', () => {
        // Construct a mock PNG ArrayBuffer
        const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        
        // Construct iTXt chunk:
        // Keyword: "Description" (null-terminated)
        // Compression flag: 0 (1 byte, uncompressed)
        // Compression method: 0 (1 byte)
        // Language tag: "en" (null-terminated)
        // Translated keyword: "desc" (null-terminated)
        // Text: "A beautiful scenery in english"
        const keyword = "Description";
        const lang = "en";
        const transKey = "desc";
        const text = "A beautiful scenery in english";
        
        const keywordBytes = new TextEncoder().encode(keyword);
        const langBytes = new TextEncoder().encode(lang);
        const transKeyBytes = new TextEncoder().encode(transKey);
        const textBytes = new TextEncoder().encode(text);
        
        const chunkDataBytes = new Uint8Array(
            keywordBytes.length + 1 +
            1 + 1 +
            langBytes.length + 1 +
            transKeyBytes.length + 1 +
            textBytes.length
        );
        
        let offset = 0;
        chunkDataBytes.set(keywordBytes, offset);
        offset += keywordBytes.length;
        chunkDataBytes[offset] = 0; // null separator
        offset += 1;
        
        chunkDataBytes[offset] = 0; // compFlag = 0
        offset += 1;
        chunkDataBytes[offset] = 0; // compMethod = 0
        offset += 1;
        
        chunkDataBytes.set(langBytes, offset);
        offset += langBytes.length;
        chunkDataBytes[offset] = 0; // null separator
        offset += 1;
        
        chunkDataBytes.set(transKeyBytes, offset);
        offset += transKeyBytes.length;
        chunkDataBytes[offset] = 0; // null separator
        offset += 1;
        
        chunkDataBytes.set(textBytes, offset);
        
        const chunkLength = chunkDataBytes.length;
        const chunkTypeBytes = new TextEncoder().encode("iTXt");
        const crcBytes = [0, 0, 0, 0];
        
        const itxtChunkBuffer = new Uint8Array(4 + 4 + chunkLength + 4);
        const view = new DataView(itxtChunkBuffer.buffer);
        view.setUint32(0, chunkLength);
        itxtChunkBuffer.set(chunkTypeBytes, 4);
        itxtChunkBuffer.set(chunkDataBytes, 8);
        itxtChunkBuffer.set(crcBytes, 8 + chunkLength);
        
        const totalLength = signature.length + itxtChunkBuffer.length;
        const fileBuffer = new Uint8Array(totalLength);
        fileBuffer.set(signature, 0);
        fileBuffer.set(itxtChunkBuffer, signature.length);
        
        const result = extractMetadata(fileBuffer.buffer);
        expect(result).toHaveProperty('Description');
        expect(result.Description).toBe('A beautiful scenery in english');
    });
});
