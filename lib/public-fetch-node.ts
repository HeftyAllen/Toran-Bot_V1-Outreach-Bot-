import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { publicUrl } from "./bot-core";
export function isPublicAddress(ip: string) {
  if (ip.includes(":"))
    return /^2[0-9a-f]{3}:/i.test(ip) && !/^2001:(?:db8|0|10|20):/i.test(ip);
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
    return false;
  return !(
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && (p[1] === 168 || p[1] === 0)) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
    (p[0] === 198 && p[1] === 51 && p[2] === 100) ||
    (p[0] === 203 && p[1] === 0 && p[2] === 113)
  );
}
export async function fetchHtml(
  original: string,
): Promise<{ html: string; finalUrl: string }> {
  let current = original;
  for (let i = 0; i < 3; i++) {
    const safe = publicUrl(current);
    if (!safe) throw new Error("Unsupported public website address.");
    const url = new URL(safe);
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
      throw new Error("Website does not resolve to a public address.");
    const pinned = addresses[0];
    const result = await new Promise<{
      status: number;
      location?: string;
      html: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Bot1BusinessResearch/1.0",
            "Accept-Encoding": "identity",
          },
          lookup: (_host, _options, callback) => callback(null, [pinned]),
        },
        (res) => {
          const status = res.statusCode ?? 500;
          if ([301, 302, 303, 307, 308].includes(status)) {
            res.resume();
            resolve({ status, location: res.headers.location, html: "" });
            return;
          }
          if (
            status < 200 ||
            status >= 300 ||
            !/text\/html|application\/xhtml\+xml/.test(
              res.headers["content-type"] ?? "",
            )
          ) {
            res.resume();
            reject(new Error(`Website could not be read (${status}).`));
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on("data", (chunk: Buffer) => {
            const piece = chunk.subarray(0, Math.max(0, 360000 - total));
            chunks.push(piece);
            total += piece.length;
            if (total >= 360000) {
              resolve({ status, html: Buffer.concat(chunks).toString("utf8") });
              res.destroy();
            }
          });
          res.on("end", () =>
            resolve({ status, html: Buffer.concat(chunks).toString("utf8") }),
          );
          res.on("error", reject);
        },
      );
      req.setTimeout(7000, () => req.destroy(new Error("Website timed out.")));
      req.on("error", reject);
      req.end();
    });
    if (result.location) {
      current = new URL(result.location, current).toString();
      continue;
    }
    return { html: result.html, finalUrl: current };
  }
  throw new Error("Too many website redirects.");
}
