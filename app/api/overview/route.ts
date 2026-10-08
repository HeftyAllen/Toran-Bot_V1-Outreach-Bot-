import { env } from "cloudflare:workers";
import { getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";

export const runtime = "edge";

type SettingsRow = {
  id: number;
  brand_name: string;
  brand_domain: string;
  target_market: string;
  target_locations: string;
  services: string;
  automation_enabled: boolean;
  research_limit: number;
};
type DataRow = Record<string, unknown>;

export async function GET() {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  try {
    const db = getSupabaseDb();
    const [settingsRows, leadRows, runRows] = await Promise.all([
      db.select<SettingsRow>("workspace_settings", { select: "*", id: "eq.1", limit: 1 }),
      db.select<DataRow>("leads", { select: "*", order: "created_at.desc", limit: 100 }),
      db.select<DataRow>("runs", { select: "*", order: "created_at.desc", limit: 8 }),
    ]);
    const settings = settingsRows[0];
    if (!settings) throw new Error("Workspace settings are missing.");
    const leads = leadRows.map((row) => ({
      id: row.id,
      companyName: row.company_name,
      websiteUrl: row.website_url,
      region: row.region,
      status: row.status,
      fitScore: row.fit_score,
      confidence: row.confidence,
      serviceFit: row.service_fit,
      summary: row.summary,
      evidence: row.evidence,
      draftSubject: row.draft_subject,
      draftBody: row.draft_body,
      discoverySourceUrl: row.discovery_source_url,
      outcome: row.outcome,
      createdAt: row.created_at,
    }));
    const runs = runRows.map((row) => ({
      id: row.id,
      status: row.status,
      processed: row.processed,
      message: row.message,
      createdAt: row.created_at,
    }));
    return Response.json({
      settings: {
        brandName: settings.brand_name,
        brandDomain: settings.brand_domain,
        targetMarket: settings.target_market,
        targetLocations: settings.target_locations,
        services: settings.services,
        automationEnabled: Boolean(settings.automation_enabled),
        researchLimit: settings.research_limit,
        apiConfigured: Boolean(env.OPENAI_API_KEY),
      },
      leads,
      runs,
      role: member.role,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load the Bot 1 workspace." }, { status: 503 });
  }
}
