// Execute the actual hash module in workerd; local workerd does not enforce the
// production PBKDF2 ceiling, so explicitly emulate it to catch this regression.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scryptSync } from "node:crypto";
import { Miniflare } from "miniflare";
import ts from "typescript";

const source = await readFile(new URL("../lib/password-hash.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const worker = new Miniflare({
  modules: true,
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  script: compiled + `
    const originalDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
    crypto.subtle.deriveBits = (algorithm, ...args) => {
      if (algorithm.name === "PBKDF2" && algorithm.iterations > 100000) {
        throw new Error("PBKDF2 iteration counts above 100000 are not supported");
      }
      return originalDeriveBits(algorithm, ...args);
    };
    export default { async fetch(request) {
      const { password, salt } = await request.json();
      const hashed = await hashPassword(password, salt);
      return Response.json({ ...hashed,
        correct: await verifyPassword(password, hashed.salt, hashed.hash),
        incorrect: await verifyPassword(password + "wrong", hashed.salt, hashed.hash) });
    }};
  `,
});
try {
  const password = "Mobile access 🔐 é";
  const salt = Buffer.alloc(16, 3).toString("base64url");
  const response = await worker.dispatchFetch("https://test.invalid", { method: "POST", body: JSON.stringify({ password, salt }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  const expected = scryptSync(password, Buffer.from(salt, "base64url"), 32, { N: 16384, r: 8, p: 5, maxmem: 33554432 });
  assert.equal(result.hash, "scrypt$16384$8$5$" + expected.toString("base64url"));
  assert.equal(result.correct, true);
  assert.equal(result.incorrect, false);
  console.log("Worker password hashing passed with the production PBKDF2 ceiling and Node-compatible hashes.");
} finally {
  await worker.dispose();
}
