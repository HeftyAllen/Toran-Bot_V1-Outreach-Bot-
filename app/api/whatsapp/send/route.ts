import { requireApiUser } from "../../../../lib/server-auth";
import { getSupabaseDb, SupabaseDbError } from "../../../../lib/supabase-db";
import {
  connection,
  credentials,
  withinServiceWindow,
} from "../../../../lib/whatsapp";
import { settingsRow } from "../../../../lib/campaigns";
export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  const db = getSupabaseDb();
  let messageId: string | undefined;
  let usageId: string | undefined;
  let submitted = false;
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const leadId = String(input.leadId ?? ""),
      key = String(input.requestKey ?? "");
    if (!/^[a-f0-9-]{36}$/i.test(key) || !leadId)
      return Response.json(
        { error: "Select a lead and a valid send request." },
        { status: 400 },
      );
    const prior = await db.select<{ status: string }>("outreach_messages", {
      select: "status",
      request_key: `eq.${key}`,
      limit: 1,
    });
    if (prior[0])
      return Response.json({
        ok: true,
        status: prior[0].status,
        duplicate: true,
      });
    const rows = await db.select<{
      phone: string | null;
      consent_at: string | null;
      consent_note: string | null;
      do_not_contact: boolean;
      last_inbound_at: string | null;
    }>("leads", {
      select: "phone,consent_at,consent_note,do_not_contact,last_inbound_at",
      id: `eq.${leadId}`,
      limit: 1,
    });
    const lead = rows[0];
    if (!lead?.phone || !/^\+[1-9]\d{7,14}$/.test(lead.phone))
      return Response.json(
        { error: "This business needs a verified international phone number." },
        { status: 400 },
      );
    if (lead.do_not_contact || !lead.consent_at || !lead.consent_note)
      return Response.json(
        {
          error:
            "Record the recipient’s WhatsApp consent first. Suppressed contacts cannot be messaged.",
        },
        { status: 400 },
      );
    const unresolved = await db.select("outreach_messages", {
      select: "id",
      lead_id: `eq.${leadId}`,
      status: "in.(pending,unknown)",
      limit: 1,
    });
    if (unresolved.length)
      return Response.json(
        {
          error:
            "A previous send has an unresolved result. Check Meta and resolve its status before sending another message.",
        },
        { status: 409 },
      );
    const row = await connection();
    if (!row)
      return Response.json(
        { error: "Connect WhatsApp Business in Settings." },
        { status: 409 },
      );
    const kind = input.kind === "text" ? "text" : "template";
    const body = String(input.body ?? "").trim();
    const templateName = String(input.templateName ?? "").trim();
    const language = String(input.language ?? "en_US");
    if (
      kind === "text" &&
      (!withinServiceWindow(lead.last_inbound_at) ||
        !body ||
        body.length > 3000)
    )
      return Response.json(
        {
          error:
            "Text replies require an inbound message within 24 hours and a message under 3,000 characters. Otherwise use an approved template.",
        },
        { status: 400 },
      );
    if (
      kind === "template" &&
      (!/^[a-z0-9_]{1,100}$/.test(templateName) ||
        !/^\w{2,3}(?:_\w{2,4})?$/.test(language))
    )
      return Response.json(
        { error: "Enter an approved template name and language code." },
        { status: 400 },
      );
    const params = Array.isArray(input.parameters) ? input.parameters : [];
    if (
      params.length > 20 ||
      params.some((x) => typeof x !== "string" || x.length > 1000)
    )
      return Response.json(
        { error: "Use up to 20 text parameters, each under 1,000 characters." },
        { status: 400 },
      );
    const settings = await settingsRow();
    if (settings.whatsapp_unit_cost_usd === null)
      return Response.json(
        {
          error:
            "Set a conservative WhatsApp cost per message in Spending before sending. Meta fees depend on country and template category.",
        },
        { status: 409 },
      );
    const auth = await credentials(row);
    messageId = crypto.randomUUID();
    await db.insert("outreach_messages", {
      id: messageId,
      lead_id: leadId,
      request_key: key,
      recipient: lead.phone,
      kind,
      content: kind === "text" ? body : JSON.stringify(params),
      template_name: kind === "template" ? templateName : null,
      status: "pending",
    });
    usageId = await db.rpc<string>("bot1_reserve_cost", {
      p_run_id: null,
      p_kind: "whatsapp",
      p_model: null,
      p_max_usd: Number(settings.whatsapp_unit_cost_usd),
      p_metadata: {
        messageId,
        estimate: true,
        source:
          "Owner-configured per-message estimate; reconcile with Meta billing",
      },
    });
    await db.patch(
      "outreach_messages",
      { id: `eq.${messageId}` },
      { usage_id: usageId },
    );
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: lead.phone.slice(1),
      type: kind,
    };
    if (kind === "text") payload.text = { preview_url: false, body };
    else
      payload.template = {
        name: templateName,
        language: { code: language },
        ...(params.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: params.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      };
    submitted = true;
    const result = await fetch(
      `https://graph.facebook.com/${row.api_version}/${row.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = (await result.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
    };
    if (!result.ok) {
      await db.patch(
        "outreach_messages",
        { id: `eq.${messageId}` },
        {
          status: result.status >= 500 ? "unknown" : "failed",
          error: `Meta returned ${result.status}`,
          updated_at: new Date().toISOString(),
        },
      );
      await db.patch(
        "usage_events",
        { id: `eq.${usageId}` },
        {
          state: result.status >= 500 ? "unconfirmed" : "void",
          cost_usd: result.status >= 500 ? null : 0,
        },
      );
      return Response.json(
        {
          error: `Meta returned ${result.status}. Check the approved template and account. No automatic retry will be made.`,
        },
        { status: 502 },
      );
    }
    if (!data.messages?.[0]?.id)
      throw new Error("Meta did not confirm a message ID.");
    await db.patch(
      "outreach_messages",
      { id: `eq.${messageId}` },
      {
        status: "sent",
        provider_message_id: data.messages[0].id,
        updated_at: new Date().toISOString(),
      },
    );
    await db.patch(
      "usage_events",
      { id: `eq.${usageId}` },
      {
        state: "estimated",
        cost_usd: Number(settings.whatsapp_unit_cost_usd),
        provider_response_id: data.messages[0].id,
      },
    );
    return Response.json({
      ok: true,
      status: "sent",
      messageId,
      message:
        "Accepted by Meta. Delivery updates will appear after the webhook is connected.",
    });
  } catch (error) {
    if (error instanceof SupabaseDbError && error.code === "23505")
      return Response.json({ ok: true, status: "pending", duplicate: true });
    if (messageId)
      await db
        .patch(
          "outreach_messages",
          { id: `eq.${messageId}` },
          {
            status: submitted ? "unknown" : "failed",
            error: submitted
              ? "Delivery result unknown. Check Meta before resending."
              : "Send stopped before provider submission.",
            updated_at: new Date().toISOString(),
          },
        )
        .catch(() => undefined);
    if (usageId)
      await db
        .patch(
          "usage_events",
          { id: `eq.${usageId}` },
          {
            state: submitted ? "unconfirmed" : "void",
            cost_usd: submitted ? null : 0,
          },
        )
        .catch(() => undefined);
    const reason =
      error instanceof Error && /budget/i.test(error.message)
        ? error.message
        : submitted
          ? "Delivery result is unknown. Check Meta before trying again."
          : "Could not prepare the message.";
    return Response.json({ error: reason }, { status: 503 });
  }
}
