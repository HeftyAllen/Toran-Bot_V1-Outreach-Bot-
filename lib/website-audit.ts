import { env } from "@bot1/runtime";
import { publicUrl } from "./bot-core";
import type { MobileAudit } from "./bot-core";
export async function mobileAudit(raw: string): Promise<MobileAudit> {
  const base: Omit<MobileAudit, "status"> = {
    checkedAt: new Date().toISOString(),
    url: raw,
    performance: null,
    accessibility: null,
    lcpMs: null,
    cls: null,
    screenshot: null,
    issues: [],
  };
  const url = publicUrl(raw);
  if (!url)
    return {
      ...base,
      status: "unavailable",
      error: "A public HTTPS website is required.",
    };
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.append("category", "performance");
  endpoint.searchParams.append("category", "accessibility");
  if (env.PAGESPEED_API_KEY)
    endpoint.searchParams.set("key", env.PAGESPEED_API_KEY);
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!response.ok)
      return {
        ...base,
        status: "unavailable",
        error: `Mobile lab test unavailable (${response.status}); HTML screening still applies.`,
      };
    const data = (await response.json()) as {
      lighthouseResult?: {
        runtimeError?: unknown;
        categories?: Record<string, { score?: number | null }>;
        audits?: Record<
          string,
          {
            id?: string;
            score?: number | null;
            title?: string;
            numericValue?: number;
            details?: { data?: string };
          }
        >;
      };
    };
    const lab = data.lighthouseResult;
    if (!lab?.categories || lab.runtimeError)
      return {
        ...base,
        status: "unavailable",
        error: "The lab could not complete this website test.",
      };
    const audits = lab.audits ?? {};
    const finite = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) ? n : null;
    const performance = finite(lab.categories.performance?.score),
      accessibility = finite(lab.categories.accessibility?.score);
    const screenshot = audits["final-screenshot"]?.details?.data;
    const issues = Object.values(audits)
      .filter(
        (a) =>
          typeof a.score === "number" &&
          a.score < 0.5 &&
          [
            "largest-contentful-paint",
            "cumulative-layout-shift",
            "color-contrast",
            "target-size",
            "meta-viewport",
          ].includes(a.id ?? ""),
      )
      .map((a) => String(a.title ?? a.id).slice(0, 200));
    return {
      ...base,
      status: "complete",
      performance: performance === null ? null : Math.round(performance * 100),
      accessibility:
        accessibility === null ? null : Math.round(accessibility * 100),
      lcpMs: finite(audits["largest-contentful-paint"]?.numericValue),
      cls: finite(audits["cumulative-layout-shift"]?.numericValue),
      screenshot:
        typeof screenshot === "string" &&
        /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
          screenshot,
        ) &&
        screenshot.length < 180000
          ? screenshot
          : null,
      issues,
    };
  } catch {
    return {
      ...base,
      status: "unavailable",
      error:
        "The mobile lab timed out or could not connect; HTML screening still applies.",
    };
  }
}
