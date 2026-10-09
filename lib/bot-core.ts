export type CampaignConfig = {
  market: string;
  locations: string;
  services: string;
  brandName: string;
  count: number;
  budgetUsd: number;
  callingCode: string;
  mode: "discover" | "queue";
  focus?: "website_gaps" | "all_opportunities" | "automation";
  qualificationVersion?: number;
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
export function officialWebsite(raw: unknown) {
  const url = publicUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\./, "");
  const platforms = ["facebook.com", "fb.com", "instagram.com", "linkedin.com", "tiktok.com", "twitter.com", "x.com", "youtube.com", "whatsapp.com", "wa.me", "google.com", "google.co.za", "goo.gl", "maps.app.goo.gl", "tripadvisor.com", "tripadvisor.co.za", "restaurantguru.com", "restaurantguru.co.za", "restaurants.co.za", "brabys.com", "sayellow.com", "snupit.co.za", "yelp.com", "eatout.co.za", "cylex.net.za", "africabizinfo.com", "firmania.co.za"];
  return platforms.some(domain => host === domain || host.endsWith(`.${domain}`)) ? null : url;
}
export function officialSourceWebsite(companyName: string, sources: string[]) {
  const brand = companyName.toLowerCase().replace(/\b(?:pty|ltd|limited|llc|inc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  // A conservative fallback for an exact business-name domain. Retain the
  // actual retrieved branch URL, never invent a parent homepage. Arbitrary
  // subdomains, name-containing paths and suffix lookalikes do not match.
  if (brand.length < 8) return null;
  const countrySuffixes = ["co.za", "org.za", "net.za", "co.uk", "org.uk", "com.au", "co.nz"];
  for (const source of sources) {
    const url = officialWebsite(source);
    if (!url) continue;
    const labels = new URL(url).hostname.split(".");
    const index = labels.length - (countrySuffixes.includes(labels.slice(-2).join(".")) ? 3 : 2);
    if (index >= 0 && labels[index].replace(/-/g, "") === brand) return url;
  }
  return null;
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
// A directory's footer phone or another listing's email is not this lead's
// contact. Only use structured business data with an exact matching name.
export function extractListingContacts(html: string, url: string, callingCode: string, companyName: string) {
  const sources: ContactSource[] = [];
  const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let visited = 0;
  function visit(value: unknown) {
    if (!value || typeof value !== "object" || ++visited > 300) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const row = value as Record<string, unknown>;
    if (typeof row.name === "string" && nameKey(row.name) === nameKey(companyName)) {
      const contactPoints = Array.isArray(row.contactPoint) ? row.contactPoint : [row.contactPoint];
      for (const contact of [row, ...contactPoints]) {
        if (!contact || typeof contact !== "object") continue;
        const c = contact as Record<string, unknown>;
        if (typeof c.telephone === "string") {
          const phone = normalizePhone(c.telephone, callingCode);
          if (phone) sources.push({ field: "phone", value: phone, url });
        }
        if (typeof c.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
          sources.push({ field: "email", value: c.email.toLowerCase(), url });
      }
    }
    Object.values(row).forEach(visit);
  }
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(script[1])); } catch { /* Invalid directory data is not evidence. */ }
  }
  return { email: sources.find(x => x.field === "email")?.value ?? null,
    phone: sources.find(x => x.field === "phone")?.value ?? null, whatsappUrl: null as string | null, sources: sources.slice(0, 20) };
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

export type DiscoveredBusiness = {
  companyName: string;
  websiteUrl: string;
  region: string;
  category: string;
  sourceUrl: string;
};

// Preserve the actual retrieved URL. Ignore only common tracking parameters and
// a trailing slash when matching a model's citation to the search source list.
function citationKey(raw: string) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
}

export function verifyDiscovery(candidate: DiscoveredBusiness, sources: string[]) {
  const source = publicUrl(candidate.sourceUrl);
  if (!source || !candidate.companyName?.trim() || !candidate.region?.trim())
    return null;
  const retrieved = sources.map(publicUrl).filter((x): x is string => Boolean(x));
  const sourceUrl = retrieved.find((url) => citationKey(url) === citationKey(source));
  if (!sourceUrl) return null;
  const website = officialWebsite(candidate.websiteUrl);
  const websiteVerified = website && retrieved.some((url) =>
    new URL(url).hostname.replace(/^www\./, "") ===
    new URL(website).hostname.replace(/^www\./, ""),
  );
  // A directory can establish the business without establishing an official
  // website. Keep the sourced business and leave that website unconfirmed.
  return { sourceUrl, websiteUrl: websiteVerified ? website : officialSourceWebsite(candidate.companyName, retrieved) };
}

export function discoveryContinues(requested: number, saved: number, rounds: number) {
  return saved < requested && rounds < Math.max(3, Math.ceil(requested / 5) + 2);
}
export type OpportunityEvidence = {
  kind: "website_gap" | "manual_workflow" | "commerce_gap";
  observation: string;
  quote: string;
  url: string;
};
export type WebsiteChecks = {
  officialWebsite: boolean;
  viewport: boolean;
  fixedDesktopWidth: boolean;
  placeholder: boolean;
  textLength: number;
  title: string;
  checkedUrl: string;
};
export type Opportunity = {
  version: number;
  status: "qualified" | "review" | "not_fit";
  websiteStatus: "not_found" | "weak" | "healthy" | "unknown";
  service: "Launch" | "Sell" | "Scale" | "No clear fit";
  reason: string;
  evidence: OpportunityEvidence[];
  checks: WebsiteChecks | null;
  officialSearch: { checkedAt: string; sources: string[] } | null;
  checkedAt: string;
};
export function websiteChecks(html: string, url: string, officialWebsite = true): WebsiteChecks {
  const text = visibleText(html);
  return {
    officialWebsite,
    viewport: /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html),
    fixedDesktopWidth: /(?:width\s*:\s*(?:9[6-9]\d|[1-9]\d{3,})px|<table\b[^>]*width\s*=\s*["']?(?:9[6-9]\d|[1-9]\d{3,}))/i.test(html),
    placeholder: /\b(?:website|web site|site)\s+(?:is\s+|currently\s+)?(?:under construction|coming soon|being (?:updated|rebuilt))\b/i.test(text) || /\b(?:under construction|coming soon)\b/i.test(text) && text.length < 350,
    textLength: text.length,
    title: visibleText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200),
    checkedUrl: url,
  };
}
export function businessListingIdentity(html: string, companyName: string) {
  const normalize = (value: string) => visibleText(value).toLowerCase()
    .replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
  const name = normalize(companyName);
  if (name.length < 3) return false;
  // A name in a category list or footer does not establish an individual
  // business page. Its main heading or page title must identify the business.
  return [...html.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .some(match => ` ${normalize(match[2])} `.includes(` ${name} `));
}
export function digitalServiceProvider(category: string | null | undefined) {
  return /\b(?:web(?:site)? (?:design|development)|digital marketing|(?:web|marketing|seo) agency|ecommerce (?:development|solutions)|software development)\b/i.test(category ?? "");
}
export function qualifyOpportunity(input: {
  websiteUrl: string | null;
  category?: string | null;
  focus?: CampaignConfig["focus"];
  pages: Array<{ url: string; text: string }>;
  checks: WebsiteChecks;
  officialSearch: Opportunity["officialSearch"];
  identityConfirmed: boolean;
  assessment: {
    serviceFit: string;
    websiteStatus: string;
    targetMatch: boolean;
    competitor: boolean;
    opportunityReason: string;
    opportunityEvidence: OpportunityEvidence[];
  };
}): Opportunity {
  const { assessment: a, checks, focus = "all_opportunities" } = input;
  // Evidence must be copied from a page that was actually fetched. A model's
  // plausible explanation or a guessed URL cannot qualify an opportunity.
  const evidence = (Array.isArray(a.opportunityEvidence) ? a.opportunityEvidence : []).filter(e =>
    e && typeof e.quote === "string" && e.quote.trim().length >= 12 &&
    typeof e.observation === "string" && input.pages.some(p =>
      publicUrl(p.url) === publicUrl(e.url) && p.text.includes(e.quote.trim())
    ),
  ).slice(0, 6).map(e => ({ ...e, quote: e.quote.trim().slice(0, 600), observation: e.observation.slice(0, 600) }));
  let status: Opportunity["status"] = "review", service: Opportunity["service"] = "No clear fit";
  let reason = "Public evidence does not establish a specific Toran opportunity yet.";
  let websiteStatus: Opportunity["websiteStatus"] = "unknown";
  const weak = !!input.websiteUrl && (checks.placeholder || !checks.viewport && checks.fixedDesktopWidth);
  if (weak) websiteStatus = "weak";
  else if (input.websiteUrl && a.websiteStatus === "healthy") websiteStatus = "healthy";
  const manual = evidence.filter(e => e.kind === "manual_workflow" &&
    /\b(?:order|orders|ordering|book|booking|bookings|reserve|reservation|reservations|appointment|appointments|quote|quotation)\b/i.test(e.quote) &&
    /\b(?:call|phone|telephone|email|e-mail|whatsapp|send|message)\b/i.test(e.quote));
  const commerce = evidence.filter(e => e.kind === "commerce_gap" &&
    /\b(?:order|orders|ordering|payment|payments|checkout|purchase|buy)\b/i.test(e.quote) &&
    /\b(?:call|phone|email|e-mail|whatsapp|send|message|cash|no online|not available online)\b/i.test(e.quote));
  const providerConfirmed = digitalServiceProvider(input.category) || digitalServiceProvider(checks.title);
  if (providerConfirmed) {
    status = "not_fit";
    reason = "This business provides web, ecommerce or digital marketing services; excluded from Toran's customer prospect list.";
  } else if (a.competitor === true) {
    reason = "Business classification needs review before outreach.";
  } else if (a.targetMatch !== true) {
    status = "not_fit";
    reason = "This business does not match the requested business type and location.";
  } else if (focus !== "automation" && (weak || !input.websiteUrl && input.identityConfirmed && (input.officialSearch?.sources.length ?? 0) > 0)) {
    status = "qualified"; service = "Launch";
    websiteStatus = weak ? "weak" : "not_found";
    reason = weak
      ? checks.placeholder ? "The fetched website is a placeholder or under construction." : "The fetched HTML has a fixed desktop width and no mobile viewport metadata; a mobile rebuild is worth reviewing."
      : "No official website was found in a business-specific search. Offer a digital presence; confirm with the owner before claiming they have no site.";
  } else if (focus !== "website_gaps" && a.serviceFit === "Sell" && commerce.length) {
    status = "qualified"; service = "Sell";
    reason = "A public ordering or payment instruction suggests an ecommerce opportunity; confirm the current process with the owner.";
  } else if (focus !== "website_gaps" && a.serviceFit === "Scale" && manual.length) {
    status = "qualified"; service = "Scale";
    reason = "A public manual ordering, booking or quotation step suggests an automation opportunity; internal systems still need confirmation.";
  } else if (input.websiteUrl && a.websiteStatus === "healthy" && !manual.length && !commerce.length) {
    status = "not_fit";
    reason = "The site appears established and no specific website, ecommerce or automation gap was supported by the checked pages.";
  }
  return { version: 2, status, service, websiteStatus, reason, evidence, checks,
    officialSearch: input.officialSearch, checkedAt: new Date().toISOString() };
}
export function opportunityScore(score: number, opportunity: Opportunity, feedbackDelta = 0) {
  const maximum = opportunity.status === "qualified" ? 90 : opportunity.status === "review" ? 39 : 15;
  return Math.max(0, Math.min(maximum, Math.round(score) + (opportunity.status === "qualified" ? feedbackDelta : 0)));
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
