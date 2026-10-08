export type CampaignConfig = {
  market: string;
  locations: string;
  services: string;
  brandName: string;
  count: number;
  budgetUsd: number;
  callingCode: string;
  mode: "discover" | "queue";
};
export type Feedback = {
  lead_id: string | null;
  company_name: string;
  outcome: string;
  service_fit: string | null;
  region: string | null;
  category: string | null;
  note: string | null;
  created_at: string;
};
export type ContactSource = { field: string; value: string; url: string };
export function publicUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 1500) return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !host.includes(".") ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return null;
    if (
      /^\d+(\.\d+){3}$/.test(host) ||
      host.includes(":") ||
      /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host)
    )
      return null;
    if (
      [
        "metadata.google.internal",
        "metadata",
        "instance-data.ec2.internal",
      ].includes(host)
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
export function normalizePhone(raw: string, callingCode = "27"): string | null {
  const clean = raw
    .replace(/\(0\)/g, "")
    .replace(/(?:ext\.?|extension|x)\s*\d+$/i, "")
    .replace(/[^\d+]/g, "");
  let digits = clean.replace(/\D/g, "");
  if (clean.startsWith("00")) digits = digits.slice(2);
  else if (!clean.startsWith("+")) {
    if (!/^\d{1,3}$/.test(callingCode)) return null;
    if (digits.startsWith("0")) digits = callingCode + digits.slice(1);
    else if (!(digits.startsWith(callingCode) && digits.length >= 11))
      digits = callingCode + digits;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
function decode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#64;/g, "@")
    .replace(/&#46;/g, ".")
    .replace(/&quot;/g, '"');
}
export function extractContacts(
  html: string,
  url: string,
  callingCode: string,
) {
  const sources: ContactSource[] = [];
  const add = (field: string, value: string) => {
    if (!sources.some((x) => x.field === field && x.value === value))
      sources.push({ field, value, url });
  };
  for (const match of html.matchAll(/href\s*=\s*["']mailto:([^"'?\s<>]+)/gi)) {
    let email = "";
    try {
      email = decodeURIComponent(decode(match[1]));
    } catch {
      continue;
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 255)
      add("email", email.toLowerCase());
  }
  for (const match of html.matchAll(/href\s*=\s*["']tel:([^"'<>]+)/gi)) {
    const phone = normalizePhone(decode(match[1]), callingCode);
    if (phone) add("phone", phone);
  }
  for (const match of html.matchAll(
    /https:\/\/(?:wa\.me\/\d+|api\.whatsapp\.com\/send\?[^\s"'<>]+)/gi,
  )) {
    try {
      const link = new URL(decode(match[0]));
      const phone = normalizePhone(
        "+" +
          (link.hostname === "wa.me"
            ? link.pathname.slice(1)
            : (link.searchParams.get("phone") ?? "")),
        callingCode,
      );
      if (phone) {
        add("whatsapp", `https://wa.me/${phone.slice(1)}`);
        add("phone", phone);
      }
    } catch {
      /* Invalid link. */
    }
  }
  for (const match of html.matchAll(
    /"(?:telephone|email)"\s*:\s*"([^"<>]{3,100})"/gi,
  )) {
    if (match[0].toLowerCase().startsWith('"telephone"')) {
      const phone = normalizePhone(match[1], callingCode);
      if (phone) add("phone", phone);
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(match[1]))
      add("email", match[1].toLowerCase());
  }
  const text = visibleText(html);
  for (const match of text.matchAll(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  )) {
    if (match[0].length < 255) add("email", match[0].toLowerCase());
  }
  for (const match of text.matchAll(
    /\b(?:phone|telephone|tel|call|contact)\s*[:\-]?\s*(\+?[\d][\d ().-]{6,24}\d)/gi,
  )) {
    const phone = normalizePhone(match[1], callingCode);
    if (phone) add("phone", phone);
  }
  return {
    email: sources.find((x) => x.field === "email")?.value ?? null,
    phone: sources.find((x) => x.field === "phone")?.value ?? null,
    whatsappUrl: sources.find((x) => x.field === "whatsapp")?.value ?? null,
    sources: sources.slice(0, 20),
  };
}
export function visibleText(html: string) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18000);
}
export function latestFeedback(history: Feedback[]) {
  const seen = new Set<string>();
  return history.filter((x) => {
    const key = x.lead_id ?? x.company_name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function calibration(
  history: Feedback[],
  service: string,
  region: string | null,
  category: string | null,
) {
  const unique = latestFeedback(history);
  const matches = unique.filter(
    (x) =>
      x.service_fit === service &&
      ((category && x.category?.toLowerCase() === category.toLowerCase()) ||
        (region && x.region?.toLowerCase() === region.toLowerCase())),
  );
  const positive = matches.filter((x) =>
    ["good_fit", "replied", "booked", "won"].includes(x.outcome),
  ).length;
  const delta =
    matches.length >= 5
      ? Math.max(
          -10,
          Math.min(
            10,
            Math.round(((positive + 2) / (matches.length + 4) - 0.5) * 24),
          ),
        )
      : 0;
  return { delta, samples: matches.length, version: unique.length };
}
export function estimateOpenAICost(
  model: string,
  input: number,
  output: number,
  cached: number,
  searchCalls: number,
) {
  const price =
    model === "gpt-4.1-mini"
      ? { input: 0.4, cached: 0.1, output: 1.6 }
      : { input: 0.15, cached: 0.075, output: 0.6 };
  // Search content has an 8,000-token fixed block on mini models. Kept as a
  // conservative estimate because response token reporting may overlap it.
  return (
    Math.round(
      ((Math.max(0, input - cached) * price.input +
        cached * price.cached +
        output * price.output) /
        1e6 +
        searchCalls * (0.01 + (8000 * price.input) / 1e6)) *
        1e6,
    ) / 1e6
  );
}
export function outputText(data: Record<string, unknown>) {
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content)
      if (part?.type === "output_text" && typeof part.text === "string")
        return part.text as string;
  }
  throw new Error("The AI response did not contain structured results.");
}
export function searchSources(data: Record<string, unknown>) {
  const urls = new Set<string>();
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const action = (record.action ?? {}) as {
      sources?: Array<{ url?: string }>;
    };
    for (const source of action.sources ?? [])
      if (source.url) urls.add(source.url);
    for (const part of Array.isArray(record.content) ? record.content : [])
      for (const a of part.annotations ?? []) if (a.url) urls.add(a.url);
  }
  return [...urls].map(publicUrl).filter((x): x is string => Boolean(x));
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function verifyWebhook(
  raw: string,
  signature: string,
  secret: string,
) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/.{2}/g) ?? [], (x) =>
    parseInt(x, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(raw),
  );
}
export function withinServiceWindow(inboundAt: string | null) {
  if (!inboundAt) return false;
  const age = Date.now() - new Date(inboundAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000;
}
export function optOut(text: string) {
  return /^(stop|unsubscribe|opt out|remove me|do not contact|no thanks)[.!\s]*$/i.test(
    text.trim(),
  );
}
