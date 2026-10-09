import { requireApiUser } from "../../../lib/server-auth";
import { getSupabaseDb } from "../../../lib/supabase-db";
export async function PATCH(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = (await request.json()) as {
      id?: string;
      status?: string;
      note?: string;
    };
    if (
      !input.id ||
      !["sent", "failed"].includes(input.status ?? "") ||
      !input.note ||
      input.note.length < 8 ||
      input.note.length > 1200
    )
      return Response.json(
        {
          error:
            "Choose the confirmed result and provide evidence from the sending provider.",
        },
        { status: 400 },
      );
    const db = getSupabaseDb();
    const rows = await db.select<{
      id: string;
      status: string;
      created_at: string;
    }>("outreach_messages", {
      select: "id,status,created_at",
      id: `eq.${input.id}`,
      status: "in.(pending,unknown)",
      limit: 1,
    });
    const message = rows[0];
    if (!message)
      return Response.json(
        { error: "This message no longer needs review." },
        { status: 409 },
      );
    if (
      message.status === "pending" &&
      Date.now() - new Date(message.created_at).getTime() < 60000
    )
      return Response.json(
        {
          error:
            "The send is still in progress. Wait a minute before reconciling.",
        },
        { status: 409 },
      );
    await db.patch(
      "outreach_messages",
      { id: `eq.${input.id}`, status: "in.(pending,unknown)" },
      {
        status: input.status,
        error: `Owner confirmed ${input.status}: ${input.note}`,
        updated_at: new Date().toISOString(),
      },
    );
    return Response.json({
      ok: true,
      message:
        "Send result recorded. Review its spending reservation separately using provider billing.",
    });
  } catch {
    return Response.json(
      { error: "Could not record this send result." },
      { status: 503 },
    );
  }
}
