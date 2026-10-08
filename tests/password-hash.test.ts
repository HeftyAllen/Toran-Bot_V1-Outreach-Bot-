import assert from "node:assert/strict";
import { pbkdf2Sync, scryptSync } from "node:crypto";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../lib/password-hash.ts";

test("password hashes use random salts and accept Unicode without truncation", async () => {
  const password = "Mobile access 🔐 é";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword(password, first.salt, first.hash), true);
  assert.equal(await verifyPassword(password + "wrong", first.salt, first.hash), false);
  const expected = scryptSync(password, Buffer.from(first.salt, "base64url"), 32, { N: 16384, r: 8, p: 5, maxmem: 33554432 });
  assert.equal(first.hash, "scrypt$16384$8$5$" + expected.toString("base64url"));
});

test("malformed and unknown hash profiles cannot request unbounded work", async () => {
  const salt = Buffer.alloc(16, 1).toString("base64url");
  for (const hash of ["", "scrypt$99999999$8$5$abc", "scrypt$16384$8$5$abc", "x".repeat(100)]) {
    assert.equal(await verifyPassword("test-password", salt, hash), false);
  }
  assert.equal(await verifyPassword("test-password", "bad-salt", "x".repeat(43)), false);
});

test("earlier PBKDF2 passwords remain compatible on Cloud Run", async () => {
  const password = "Earlier password";
  const salt = Buffer.alloc(16, 2).toString("base64url");
  const legacy = pbkdf2Sync(password, Buffer.from(salt, "base64url"), 310000, 32, "sha256").toString("base64url");
  assert.equal(await verifyPassword(password, salt, legacy), true);
  assert.equal(await verifyPassword("wrong password", salt, legacy), false);
});
