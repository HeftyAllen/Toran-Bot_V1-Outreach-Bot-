import { getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";

export const runtime = "edge";

const textFields: Record<string, string> = {
  brandName: "brand_name",
  brandDomain: "brand_domain",
  targetMarket: "target_market",
  targetLocations: "target_locations",
  services: "services",
};

export async function PATCH(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner") return Response.json({ error: "Only the workspace owner can change settings." }, { status: 403 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Enter valid settings." }, { status: 400 }); }
  const key = Object.keys(input)[0];
  if (!key) return Response.json({ error: "No setting was provided." }, { status: 400 });
  const now = new Date().toISOString();
  let update: Record<string, unknown>;
  if (key in textFields) {
    const value = input[key];
    if (typeof value !== "string" || value.length > 180) return Response.json({ error: "Use up to 180 characters." }, { status: 400 });
    update = { [textFields[key]]: value.trim(), updated_at: now };
  } else if (key === "automationEnabled") {
    if (typeof input[key] !== "boolean") return Response.json({ error: "Invalid run setting." }, { status: 400 });
    update = { automation_enabled: input[key], updated_at: now };
  } else if (key === "researchLimit") {
    if (![1, 3, 5].includes(Number(input[key]))) return Response.json({ error: "Choose a batch size of 1, 3, or 5 websites." }, { status: 400 });
    update = { research_limit: Number(input[key]), updated_at: now };
  } else {
    return Response.json({ error: "That setting cannot be changed here." }, { status: 400 });
  }
  try {
    const rows = await getSupabaseDb().patch("workspace_settings", { id: "eq.1" }, update);
    if (!rows.length) return Response.json({ error: "Workspace settings were not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not save that setting." }, { status: 503 });
  }
}
