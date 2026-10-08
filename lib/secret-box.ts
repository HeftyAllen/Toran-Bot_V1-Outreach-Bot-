function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function keyFromSecret(secret: string) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string, secret: string) {
  const key = await keyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, secret: string) {
  const [version, ivPart, dataPart] = value.split(".");
  if (version !== "v1" || !ivPart || !dataPart) throw new Error("Saved API key could not be opened.");
  const key = await keyFromSecret(secret);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivPart) }, key, fromBase64(dataPart));
  return new TextDecoder().decode(decrypted);
}
