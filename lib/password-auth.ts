import { cookies, headers } from "next/headers";
import { env } from "@bot1/runtime";
import type { ChatGPTUser } from "../app/chatgpt-auth";

const SESSION_COOKIE = "bot1_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 310_000;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sessionSecret() {
  const value = (env as typeof env & { APP_SESSION_SECRET?: string }).APP_SESSION_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("The session signing key is not configured.");
  return value;
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

export async function hashInviteToken(token: string) {
  return bytesToBase64Url(await sha256(token));
}

export async function hashPassword(password: string, salt?: string) {
  const saltBytes = salt ? base64UrlToBytes(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return { salt: bytesToBase64Url(saltBytes), hash: bytesToBase64Url(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const candidate = await hashPassword(password, salt);
  const left = new TextEncoder().encode(candidate.hash);
  const right = new TextEncoder().encode(expectedHash);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function setPasswordSession(email: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ email, expiresAt })));
  const value = `${payload}.${await hmac(payload)}`;
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = forwardedProto === "https" || requestHeaders.get("host")?.endsWith(".chatgpt.site") === true;
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearPasswordSession() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getPasswordSessionUser(): Promise<ChatGPTUser | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const expected = await hmac(payload);
    const left = new TextEncoder().encode(signature);
    const right = new TextEncoder().encode(expected);
    if (left.length !== right.length) return null;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    if (difference !== 0) return null;
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { email?: unknown; expiresAt?: unknown };
    if (typeof decoded.email !== "string" || typeof decoded.expiresAt !== "number" || decoded.expiresAt <= Date.now() / 1000) return null;
    const email = decoded.email.trim().toLowerCase();
    if (!email) return null;
    return { userId: `workspace:${email}`, displayName: email, email, fullName: null };
  } catch {
    return null;
  }
}
