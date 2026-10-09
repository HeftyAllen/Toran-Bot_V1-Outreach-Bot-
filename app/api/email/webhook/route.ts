import { providerCredentials } from "../../../../lib/providers";
import { verifyEmailWebhook } from "../../../../lib/outreach-core";
import { getSupabaseDb } from "../../../../lib/supabase-db";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 100000)
      return Response.json({ error: "Payload too large." }, { status: 413 });
    const auth = await providerCredentials("resend");
    if (
      !auth.webhookSecret ||
      !(await verifyEmailWebhook(raw, request.headers, auth.webhookSecret))
    )
      return Response.json(
        { error: "Invalid webhook signature." },
        { status: 401 },
      );
    const event = JSON.parse(raw),
      id = event.data?.email_id;
    if (typeof id !== "string") return Response.json({ ok: true });
    const db = getSupabaseDb(),
      rows = await db.select<{
        id: string;
        lead_id: string | null;
        status: string;
      }>("outreach_messages", {
        select: "id,lead_id,status",
        provider_message_id: `eq.${id}`,
        channel: "eq.email",
        limit: 1,
      });
    const message = rows[0];
    if (!message) return Response.json({ ok: true });
    if (
      ["email.bounced", "email.complained", "email.failed"].includes(event.type)
    ) {
      await db.patch(
        "outreach_messages",
        { id: `eq.${message.id}` },
        { status: "failed", error: String(event.type) },
      );
      if (message.lead_id && event.type !== "email.failed")
        await db.patch(
          "leads",
          { id: `eq.${message.lead_id}` },
          {
            do_not_contact: true,
            email_consent_at: null,
            email_consent_note: null,
          },
        );
    } else if (
      event.type === "email.delivered" &&
      ["pending", "unknown", "sent"].includes(message.status)
    )
      await db.patch(
        "outreach_messages",
        { id: `eq.${message.id}`, status: "in.(pending,unknown,sent)" },
        { status: "delivered" },
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not process email event." },
      { status: 503 },
    );
  }
}
