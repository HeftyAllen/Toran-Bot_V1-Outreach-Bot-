import { getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";
const textFields: Record<string, string> = {
  brandName: "brand_name",
  brandDomain: "brand_domain",
  targetMarket: "target_market",
  targetLocations: "target_locations",
  services: "services",
};
const numbers: Record<
  string,
  { column: string; min: number; max: number; integer?: boolean }
> = {
  researchLimit: { column: "research_limit", min: 1, max: 100, integer: true },
  monthlyBudgetUsd: { column: "monthly_budget_usd", min: 0, max: 10000 },
  runBudgetUsd: { column: "run_budget_usd", min: 0.05, max: 100 },
  whatsappUnitCostUsd: { column: "whatsapp_unit_cost_usd", min: 0, max: 10 },
};
export async function PATCH(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (!Object.keys(input).length)
      return Response.json(
        { error: "Provide a setting to save." },
        { status: 400 },
      );
    for (const [key, value] of Object.entries(input)) {
      if (key in textFields) {
        if (typeof value !== "string" || value.length > 500)
          return Response.json(
            { error: "Use text under 500 characters." },
            { status: 400 },
          );
        patch[textFields[key]] = value.trim();
      } else if (key in numbers) {
        const field = numbers[key];
        if (key === "whatsappUnitCostUsd" && value === null) {
          patch[field.column] = null;
          continue;
        }
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < field.min ||
          value > field.max ||
          (field.integer && !Number.isInteger(value))
        )
          return Response.json(
            { error: `${key}: choose ${field.min}–${field.max}.` },
            { status: 400 },
          );
        patch[field.column] = value;
      } else if (key === "automationEnabled" && typeof value === "boolean")
        patch.automation_enabled = value;
      else if (
        key === "callingCode" &&
        typeof value === "string" &&
        /^\d{1,3}$/.test(value)
      )
        patch.calling_code = value;
      else
        return Response.json(
          { error: "Unknown or invalid setting." },
          { status: 400 },
        );
    }
    await getSupabaseDb().patch("workspace_settings", { id: "eq.1" }, patch);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not save settings." },
      { status: 503 },
    );
  }
}
