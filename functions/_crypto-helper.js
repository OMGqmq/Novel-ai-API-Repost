/**
 * Crypto Helper for Cloudflare Workers
 * Uses native Web Crypto API for secure PBKDF2 hashing and HS256 JWT operations.
 */

// Helper: Convert string to ArrayBuffer
function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

// Helper: Convert ArrayBuffer to Hex string
function bufferToHex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Helper: Base64Url encode (RFC 4648)
function base64urlEncode(strOrBuffer) {
  let base64;
  if (typeof strOrBuffer === 'string') {
    base64 = btoa(unescape(encodeURIComponent(strOrBuffer)));
  } else {
    // ArrayBuffer
    const bin = String.fromCharCode.apply(null, new Uint8Array(strOrBuffer));
    base64 = btoa(bin);
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Helper: Base64Url decode
function base64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Generates a random 16-byte salt represented as a hex string.
 */
export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bufferToHex(arr);
}

/**
 * PBKDF2 Password Hashing
 * Runs 100,000 iterations of SHA-256 to hash the password with a salt.
 */
export async function hashPassword(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    stringToBuffer(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: stringToBuffer(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["verify"]
  );
  
  const exported = await crypto.subtle.exportKey("raw", derivedKey);
  return bufferToHex(exported);
}

/**
 * Retrieves the HMAC cryptokey for JWT signing/verification
 */
async function getHmacKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    stringToBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Signs a payload as a JWT (expires in 7 days by default)
 */
export async function signJwt(payload, secret, expiresInSeconds = 7 * 24 * 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const hmacKey = await getHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    stringToBuffer(dataToSign)
  );

  const encodedSignature = base64urlEncode(signature);
  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifies and parses a JWT. Returns null if invalid or expired.
 */
export async function verifyJwt(token, secret) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const dataToVerify = `${encodedHeader}.${encodedPayload}`;

    const hmacKey = await getHmacKey(secret);
    
    // Decode base64url signature back to ArrayBuffer
    const signatureBin = atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'));
    const signatureBuffer = new Uint8Array(signatureBin.length);
    for (let i = 0; i < signatureBin.length; i++) {
      signatureBuffer[i] = signatureBin.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      "HMAC",
      hmacKey,
      signatureBuffer,
      stringToBuffer(dataToVerify)
    );

    if (!isValid) return null;

    const payload = JSON.parse(base64urlDecode(encodedPayload));
    
    // Validate expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}
