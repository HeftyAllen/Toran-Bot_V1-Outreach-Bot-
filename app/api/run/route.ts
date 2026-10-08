import { env } from "@bot1/runtime";
import { campaignConfig, settingsRow } from "../../../lib/campaigns";
import { requireApiUser } from "../../../lib/server-auth";
import { getSupabaseDb, SupabaseDbError } from "../../../lib/supabase-db";
export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json(
      { error: "Only the owner can start campaigns." },
      { status: 403 },
    );
  if (!env.OPENAI_API_KEY || !env.WORKER_SECRET)
    return Response.json(
      { error: "The cloud worker or OpenAI connection is not configured." },
      { status: 503 },
    );
  try {
    const input = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const settings = await settingsRow();
    if (!settings.automation_enabled)
      return Response.json(
        { error: "Resume Bot 1 before starting a campaign." },
        { status: 409 },
      );
    let config;
    try {
      config = campaignConfig(input, settings);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Invalid campaign." },
        { status: 400 },
      );
    }
    const db = getSupabaseDb();
    const queued =
      config.mode === "queue"
        ? await db.select<{ id: string }>("leads", {
            select: "id",
            status: "in.(queued,new)",
            order: "created_at.asc",
            limit: config.count,
          })
        : [];
    if (config.mode === "queue" && !queued.length)
      return Response.json(
        {
          error:
            "No queued businesses. Add one or choose Discover new businesses.",
        },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    await db.insert("runs", {
      id,
      status: "running",
      config,
      requested: config.count,
      lead_ids: queued.map((x) => x.id),
      stage: config.mode === "queue" ? "research" : "discover",
      message: "Campaign queued in the cloud",
    });
    return Response.json(
      {
        ok: true,
        id,
        message:
          "Campaign queued. It continues in the cloud after you close this page.",
      },
      { status: 202 },
    );
  } catch (e) {
    if (e instanceof SupabaseDbError && e.code === "23505")
      return Response.json(
        { error: "A campaign is already running. Pause or cancel it first." },
        { status: 409 },
      );
    return Response.json(
      { error: "Could not queue the campaign." },
      { status: 503 },
    );
  }
}
export async function DELETE(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id)
      return Response.json({ error: "Choose a campaign." }, { status: 400 });
    await getSupabaseDb().patch(
      "runs",
      { id: `eq.${id}`, status: "eq.running" },
      {
        status: "canceled",
        message: "Canceled by owner; an in-flight request may still incur cost",
        finished_at: new Date().toISOString(),
      },
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not cancel the campaign." },
      { status: 503 },
    );
  }
}
