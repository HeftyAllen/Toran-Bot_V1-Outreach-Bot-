import { env } from "@bot1/runtime";
import { getSupabaseDb } from "./supabase-db";
import { providerCredentials } from "./providers";
import { emailEligibility, unsubscribeToken } from "./outreach-core";
import type { EmailLead } from "./outreach-core";
export async function sendCampaignEmail(leadId: string, runId: string | null) {
  const db = getSupabaseDb();
  let prepared:
    | {
        messageId: string;
        usageId: string;
        recipient: string;
        subject: string;
        body: string;
      }
    | undefined;
  let submitted = false;
  try {
    const lead =
      (
        await db.select<EmailLead>("leads", {
          select:
            "id,contact_email,draft_subject,draft_body,email_consent_at,email_consent_note,do_not_contact,opportunity,contact_sources",
          id: `eq.${leadId}`,
          limit: 1,
        })
      )[0] ?? null;
    const reason = emailEligibility(lead);
    if (reason) return { accepted: false, reason };
    const connection = await providerCredentials("resend"),
      settings = connection.settings;
    if (!env.APP_ENCRYPTION_SECRET || !settings.publicBaseUrl)
      throw new Error("Email unsubscribe configuration is incomplete.");
    prepared = await db.rpc("bot1_prepare_email", {
      p_lead_id: leadId,
      p_run_id: runId,
      p_key: `email:${runId ?? "manual"}:${leadId}:${crypto.randomUUID()}`,
    });
    const link = new URL("/unsubscribe", String(settings.publicBaseUrl));
    link.searchParams.set("id", leadId);
    link.searchParams.set(
      "token",
      await unsubscribeToken(leadId, env.APP_ENCRYPTION_SECRET),
    );
    const message =
      prepared!.body +
      `\n\nSent by ${String(settings.fromName)}. Unsubscribe: ${link.href}`;
    submitted = true;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `bot1-${prepared!.messageId}`,
      },
      body: JSON.stringify({
        from: `${settings.fromName} <${settings.fromAddress}>`,
        reply_to: settings.replyTo,
        to: [prepared!.recipient],
        subject: prepared!.subject,
        text: message,
        headers: {
          "List-Unsubscribe": `<${link.href}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const ambiguous = response.status >= 500;
      await db.patch(
        "outreach_messages",
        { id: `eq.${prepared!.messageId}` },
        {
          status: ambiguous ? "unknown" : "failed",
          error: `Resend returned ${response.status}; ${ambiguous ? "check provider before retrying" : "message was not accepted"}`,
        },
      );
      await db.patch(
        "usage_events",
        { id: `eq.${prepared!.usageId}` },
        {
          state: ambiguous ? "unconfirmed" : "void",
          cost_usd: ambiguous ? null : 0,
        },
      );
      return {
        accepted: false,
        reason: ambiguous
          ? "Email result is unknown; check the provider before retrying."
          : "Provider rejected the email.",
      };
    }
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id !== "string")
      throw new Error("Email response did not contain a message ID.");
    await db.patch(
      "outreach_messages",
      { id: `eq.${prepared!.messageId}` },
      { status: "sent", provider_message_id: data.id, content: message },
    );
    await db.patch(
      "usage_events",
      { id: `eq.${prepared!.usageId}` },
      {
        state: "estimated",
        cost_usd: Number(settings.unitCostUsd),
        provider_response_id: data.id,
      },
    );
    return {
      accepted: true,
      reason: "Accepted by email provider; delivery is not yet confirmed.",
    };
  } catch (e) {
    if (prepared) {
      await db.patch(
        "outreach_messages",
        { id: `eq.${prepared.messageId}` },
        {
          status: submitted ? "unknown" : "failed",
          error: submitted
            ? "Email send result is unresolved. Check provider before retrying."
            : "Email could not be submitted.",
        },
      );
      await db.patch(
        "usage_events",
        { id: `eq.${prepared.usageId}` },
        {
          state: submitted ? "unconfirmed" : "void",
          cost_usd: submitted ? null : 0,
        },
      );
    }
    return {
      accepted: false,
      reason: e instanceof Error ? e.message : "Could not prepare email.",
    };
  }
}
