import { publicUrl } from "./bot-core";
export async function fetchHtml(
  original: string,
): Promise<{ html: string; finalUrl: string }> {
  let current = original;
  for (let i = 0; i < 3; i++) {
    if (!publicUrl(current))
      throw new Error("Unsupported public website address.");
    const res = await fetch(current, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Bot1BusinessResearch/1.0",
      },
      signal: AbortSignal.timeout(7000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Missing redirect address.");
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Website returned ${res.status}.`);
    if (
      !/text\/html|application\/xhtml\+xml/.test(
        res.headers.get("content-type") ?? "",
      )
    )
      throw new Error("Website did not return HTML.");
    const reader = res.body?.getReader();
    if (!reader) return { html: "", finalUrl: current };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 360000) {
      const { value, done } = await reader.read();
      if (done) break;
      const piece = value.slice(0, 360000 - size);
      size += piece.length;
      chunks.push(piece);
    }
    await reader.cancel();
    const all = new Uint8Array(size);
    let at = 0;
    for (const part of chunks) {
      all.set(part, at);
      at += part.length;
    }
    return { html: new TextDecoder().decode(all), finalUrl: current };
  }
  throw new Error("Too many website redirects.");
}
