import { scrypt } from "node:crypto";

// OWASP's 16 MiB scrypt profile fits the Workers memory and KDF cost limits.
// Store the algorithm/profile with the hash so Cloud Run uses the same format.
const HASH_PREFIX = "scrypt$16384$8$5$";
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const LEGACY_PBKDF2_ITERATIONS = 310_000;

function encode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

async function deriveScrypt(password: string, salt: Uint8Array) {
  return new Promise<Uint8Array>((resolve, reject) => {
    scrypt(password, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string, salt?: string) {
  const saltBytes = salt
    ? Buffer.from(salt, "base64url")
    : crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveScrypt(password, saltBytes);
  return { salt: encode(saltBytes), hash: HASH_PREFIX + encode(bits) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(salt)) return false;
  let candidate: string;
  if (expectedHash.startsWith(HASH_PREFIX)) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(expectedHash.slice(HASH_PREFIX.length))) return false;
    candidate = (await hashPassword(password, salt)).hash;
  } else {
    // Compatibility with passwords created by the earlier Node/Cloud Run build.
    // No legacy hashes were successfully created by the affected Sites build.
    if (!/^[A-Za-z0-9_-]{43}$/.test(expectedHash)) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(salt, "base64url"), iterations: LEGACY_PBKDF2_ITERATIONS },
      key, 256,
    );
    candidate = encode(new Uint8Array(bits));
  }
  const left = new TextEncoder().encode(candidate);
  const right = new TextEncoder().encode(expectedHash);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
