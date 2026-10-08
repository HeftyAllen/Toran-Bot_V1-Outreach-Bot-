import { getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";
export async function PATCH(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = (await request.json()) as {
      id?: string;
      costUsd?: number;
      note?: string;
    };
    if (
      !input.id ||
      typeof input.costUsd !== "number" ||
      !Number.isFinite(input.costUsd) ||
      input.costUsd < 0 ||
      input.costUsd > 1000 ||
      !input.note ||
      input.note.length < 5 ||
      input.note.length > 1200
    )
      return Response.json(
        { error: "Enter a confirmed cost and billing evidence." },
        { status: 400 },
      );
    const rows = await getSupabaseDb().patch(
      "usage_events",
      { id: `eq.${input.id}`, state: "eq.unconfirmed" },
      {
        state: "actual",
        cost_usd: input.costUsd,
        metadata: {
          reconciledBy: user.email,
          billingEvidence: input.note,
          reconciledAt: new Date().toISOString(),
        },
      },
    );
    if (!rows.length)
      return Response.json(
        { error: "This request no longer needs reconciliation." },
        { status: 409 },
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not reconcile this billing record." },
      { status: 503 },
    );
  }
}
