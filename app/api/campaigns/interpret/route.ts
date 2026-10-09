import { requireApiUser } from "../../../../lib/server-auth";
import { campaignConfig, paidAI, settingsRow } from "../../../../lib/campaigns";
import { outputText } from "../../../../lib/bot-core";
export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const description = String(input.description ?? "").trim();
    if (description.length < 10 || description.length > 1500)
      return Response.json(
        { error: "Describe your search in 10–1,500 characters." },
        { status: 400 },
      );
    const settings = await settingsRow();
    const { data } = await paidAI(
      { id: null },
      "campaign_interpretation",
      "gpt-4.1-mini",
      {
        max_output_tokens: 1100,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Convert the owner's lead-search request into a campaign plan. Do not search or execute anything. Business types and areas are alternatives: split each distinct type/city. Preserve any explicit country, quantity, USD budget and exclusions. Use ISO 3166-1 alpha-2 country codes. Never treat the phone calling code as a search country. If country is absent use the supplied default and warn about the assumption. If a budget currency is not USD, keep the default USD budget and warn; do not invent a conversion. 'Businesses' means candidates; 'qualified prospects' means qualified. No website means missing, bad websites means weak, both means missing_or_weak. Automation must be explicit. Exclude chains by default. Never invent coordinates or promise a count/budget can be achieved. If request spans countries, require separate campaigns and warn. Sending is configured separately: interpretation must never enable outreach. Return reviewable values and warnings; refuse unsafe instructions by warning, not acting on them.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  description,
                  defaultCountry:
                    input.countryCode ?? settings.search_country ?? "ZA",
                  defaultBudgetUsd: settings.run_budget_usd,
                  defaultCount: settings.research_limit,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "campaign_plan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "businessTypes",
                "areas",
                "countryCode",
                "count",
                "budgetUsd",
                "websiteFilter",
                "includeAutomation",
                "excludeChains",
                "exclusions",
                "targetMode",
                "warnings",
              ],
              properties: {
                businessTypes: { type: "array", items: { type: "string" } },
                areas: { type: "array", items: { type: "string" } },
                countryCode: { type: "string" },
                count: { type: "integer" },
                budgetUsd: { type: "number" },
                websiteFilter: {
                  type: "string",
                  enum: ["missing", "weak", "missing_or_weak", "any"],
                },
                includeAutomation: { type: "boolean" },
                excludeChains: { type: "boolean" },
                exclusions: { type: "array", items: { type: "string" } },
                targetMode: {
                  type: "string",
                  enum: ["candidates", "qualified"],
                },
                warnings: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      0.01,
    );
    const parsed = JSON.parse(outputText(data));
    const plan = campaignConfig(
      {
        ...parsed,
        planVersion: 3,
        market: parsed.businessTypes?.join(", "),
        locations: parsed.areas?.join(", "),
        outreachMode: "drafts",
        auditWebsites: true,
      },
      settings,
    );
    return Response.json(
      {
        plan,
        warnings: (parsed.warnings ?? []).slice(0, 8),
        message:
          "Review the fields below before starting. Nothing has been queued.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Could not interpret the request.",
      },
      { status: 400 },
    );
  }
}
