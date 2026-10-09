import { env } from "@bot1/runtime";
import { getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";
import { settingsRow } from "../../../lib/campaigns";
const camel = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      v,
    ]),
  );
export async function GET() {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  try {
    const db = getSupabaseDb();
    const [
      settings,
      leads,
      runs,
      usage,
      events,
      feedback,
      messages,
      inbound,
      wa,
      providers,
      runSpending,
    ] = await Promise.all([
      settingsRow(),
      db.select<Record<string, unknown>>("leads", {
        select: "*",
        order: "created_at.desc",
        limit: 1000,
      }),
      db.select<Record<string, unknown>>("runs", {
        select: "*",
        order: "created_at.desc",
        limit: 20,
      }),
      db.rpc("bot1_usage_summary", {}),
      db.select("usage_events", {
        select:
          "id,run_id,provider,kind,model,state,reserved_usd,cost_usd,input_tokens,output_tokens,search_calls,created_at",
        order: "created_at.desc",
        limit: 100,
      }),
      db.select("feedback_events", {
        select: "*",
        order: "created_at.desc",
        limit: 1000,
      }),
      db.select("outreach_messages", {
        select: "id,lead_id,channel,kind,template_name,status,error,created_at",
        order: "created_at.desc",
        limit: 100,
      }),
      db.select("whatsapp_inbound", {
        select: "id,lead_id,sender,text_body,received_at",
        order: "received_at.desc",
        limit: 50,
      }),
      db.select("whatsapp_connection", {
        select: "id,label,phone_number_id,api_version",
        id: "eq.1",
        limit: 1,
      }),
      db.select("provider_connections", { select: "id,settings" }),
      db.rpc("bot1_run_spend", {}),
    ]);
    return Response.json(
      {
        settings: {
          ...camel(settings as unknown as Record<string, unknown>),
          apiConfigured: Boolean(env.OPENAI_API_KEY),
          workerConfigured: Boolean(env.WORKER_SECRET),
        },
        leads: leads.map(camel),
        runs: runs.map((row) => {
          const { lease_token: _token, ...safe } = row;
          void _token;
          return camel(safe);
        }),
        usage,
        usageEvents: events,
        feedback,
        messages,
        inbound,
        whatsapp: wa[0] ?? null,
        providers,
        runSpending,
        role: member.role,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load the workspace. Retry shortly." },
      { status: 503 },
    );
  }
}
