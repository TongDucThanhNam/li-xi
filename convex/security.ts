function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSalt(byteLength = 16) {
  const buffer = new Uint8Array(byteLength);
  crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

export async function hashWithSalt(secret: string, salt: string) {
  const payload = new TextEncoder().encode(`${salt}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return bytesToHex(new Uint8Array(digest));
}

export async function createPinHash(pin: string) {
  const salt = generateSalt();
  const hash = await hashWithSalt(pin, salt);
  return { salt, hash };
}

export async function verifyPinHash(pin: string, salt: string, expectedHash: string) {
  const actualHash = await hashWithSalt(pin, salt);
  return timingSafeEqual(actualHash, expectedHash);
}
