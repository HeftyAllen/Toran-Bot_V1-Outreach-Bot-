export type EmailLead = {
  id: string;
  contact_email: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  email_consent_at: string | null;
  email_consent_note: string | null;
  do_not_contact: boolean;
  opportunity: { version: number; status: string } | null;
  contact_sources?: { field: string; value: string; url: string }[];
};
export function emailEligibility(lead: EmailLead | null) {
  if (!lead) return "Business not found.";
  if (lead.do_not_contact) return "Contact is suppressed.";
  if (!lead.email_consent_at || !lead.email_consent_note)
    return "Recipient email consent is required.";
  if (
    lead.opportunity?.version !== 2 ||
    lead.opportunity.status !== "qualified"
  )
    return "A current qualified opportunity is required.";
  if (
    !lead.contact_email ||
    !lead.contact_sources?.some(
      (s) =>
        s.field === "email" &&
        s.value.toLowerCase() === lead.contact_email!.toLowerCase() &&
        /^https:\/\//.test(s.url),
    )
  )
    return "A sourced business email is required.";
  if (!lead.draft_subject || !lead.draft_body)
    return "An outreach draft is required.";
  return null;
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function from64(raw: string) {
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}
export async function unsubscribeToken(id: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode("bot1-email-unsubscribe:" + id),
      ),
    ),
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
export async function verifyUnsubscribe(
  id: string,
  token: string,
  secret: string,
) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      from64(
        token.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (token.length % 4)) % 4),
      ),
      new TextEncoder().encode("bot1-email-unsubscribe:" + id),
    );
  } catch {
    return false;
  }
}
export async function verifyEmailWebhook(
  raw: string,
  headers: Headers,
  secret: string,
) {
  try {
    const id = headers.get("svix-id"),
      timestamp = headers.get("svix-timestamp"),
      signatures = headers.get("svix-signature");
    if (
      !id ||
      !timestamp ||
      !signatures ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !Number.isFinite(Number(timestamp))
    )
      return false;
    const key = await crypto.subtle.importKey(
      "raw",
      from64(secret.replace(/^whsec_/, "")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    for (const s of signatures.split(" ")) {
      const [version, value] = s.split(",");
      if (
        version === "v1" &&
        value &&
        (await crypto.subtle.verify(
          "HMAC",
          key,
          from64(value),
          new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
        ))
      )
        return true;
    }
    return false;
  } catch {
    return false;
  }
}
