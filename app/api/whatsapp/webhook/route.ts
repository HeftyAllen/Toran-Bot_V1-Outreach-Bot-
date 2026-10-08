import {
  connection,
  credentials,
  verifyWebhook,
  optOut,
} from "../../../../lib/whatsapp";
import { getSupabaseDb, SupabaseDbError } from "../../../../lib/supabase-db";
export async function GET(request: Request) {
  try {
    const row = await connection();
    if (!row) return new Response("Not connected", { status: 404 });
    const auth = await credentials(row);
    const url = new URL(request.url);
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === auth.verifyToken
    )
      return new Response(url.searchParams.get("hub.challenge") ?? "", {
        headers: { "Content-Type": "text/plain" },
      });
    return new Response("Verification failed", { status: 403 });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
type WebhookValue = {
  metadata?: { phone_number_id?: string };
  statuses?: Array<{
    id: string;
    status: string;
    errors?: Array<{ code: number }>;
  }>;
  messages?: Array<{
    id: string;
    from: string;
    timestamp: string;
    type?: string;
    text?: { body?: string };
    button?: { text?: string };
  }>;
};
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1000000)
    return new Response("Too large", { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > 1000000) return new Response("Too large", { status: 413 });
    const row = await connection();
    if (!row) return new Response("Not connected", { status: 404 });
    const auth = await credentials(row);
    if (
      !(await verifyWebhook(
        raw,
        request.headers.get("x-hub-signature-256") ?? "",
        auth.appSecret,
      ))
    )
      return new Response("Invalid signature", { status: 401 });
    const data = JSON.parse(raw) as {
      object?: string;
      entry?: Array<{
        changes?: Array<{ field?: string; value: WebhookValue }>;
      }>;
    };
    if (data.object !== "whatsapp_business_account")
      return new Response("Ignored", { status: 200 });
    const db = getSupabaseDb();
    for (const entry of data.entry ?? [])
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (value.metadata?.phone_number_id !== row.phone_number_id) continue;
        for (const status of value.statuses ?? []) {
          if (!["sent", "delivered", "read", "failed"].includes(status.status))
            continue;
          const messages = await db.select<{ id: string; status: string }>(
            "outreach_messages",
            {
              select: "id,status",
              provider_message_id: `eq.${status.id}`,
              limit: 1,
            },
          );
          const message = messages[0];
          if (!message) continue;
          const rank: Record<string, number> = {
            pending: 0,
            unknown: 0,
            sent: 1,
            delivered: 2,
            read: 3,
            failed: 4,
          };
          if (
            status.status !== "failed" &&
            (rank[message.status] ?? 0) >= rank[status.status]
          )
            continue;
          await db.patch(
            "outreach_messages",
            { id: `eq.${message.id}` },
            {
              status: status.status,
              error:
                status.status === "failed"
                  ? `Meta delivery failed (${status.errors?.[0]?.code ?? "unknown"})`
                  : null,
              updated_at: new Date().toISOString(),
            },
          );
        }
        for (const incoming of value.messages ?? []) {
          if (!incoming.id || !/^\d{8,15}$/.test(incoming.from)) continue;
          const timestamp = Number(incoming.timestamp) * 1000;
          if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60000)
            continue;
          const phone = "+" + incoming.from;
          const leads = await db.select<{
            id: string;
            last_inbound_at: string | null;
          }>("leads", {
            select: "id,last_inbound_at",
            phone: `eq.${phone}`,
            limit: 100,
          });
          const text = (
            incoming.text?.body ??
            incoming.button?.text ??
            ""
          ).slice(0, 3000);
          const received = new Date(timestamp).toISOString();
          try {
            await db.insert("whatsapp_inbound", {
              id: incoming.id,
              lead_id: leads[0]?.id ?? null,
              sender: phone,
              text_body: text,
              received_at: received,
            });
          } catch (e) {
            if (!(e instanceof SupabaseDbError && e.code === "23505")) throw e;
          }
          // Idempotent retry also completes lead updates after a partial webhook failure.
          for (const lead of leads) {
            const last =
              lead.last_inbound_at &&
              new Date(lead.last_inbound_at).getTime() > timestamp
                ? lead.last_inbound_at
                : received;
            await db.patch(
              "leads",
              { id: `eq.${lead.id}` },
              {
                last_inbound_at: last,
                ...(optOut(text)
                  ? {
                      do_not_contact: true,
                      consent_at: null,
                      consent_note: null,
                    }
                  : {}),
                updated_at: new Date().toISOString(),
              },
            );
          }
        }
      }
    return Response.json({ ok: true });
  } catch {
    return new Response("Retry later", { status: 503 });
  }
}
