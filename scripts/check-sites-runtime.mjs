import { readdir, readFile } from "node:fs/promises";
async function sources(dir) {
  let contents = "";
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) contents += await sources(path);
    else if (entry.name.endsWith(".js"))
      contents += await readFile(path, "utf8");
  }
  return contents;
}
const code = await sources("dist/server");
if (
  code.includes("node:dns/promises") ||
  /process\.env\.APP_RUNTIME/.test(code)
)
  throw new Error("Sites output contains a Node-only Bot 1 runtime adapter.");
if (!code.includes("cloudflare:workers"))
  throw new Error("Sites Worker bindings are missing.");
console.log(
  "Sites runtime verified: Worker bindings and public fetch adapter; no Node-only DNS adapter.",
);
