import { env } from "@bot1/runtime";
import { verifyUnsubscribe } from "../../lib/outreach-core";
import { getSupabaseDb } from "../../lib/supabase-db";
async function allowed(request: Request) {
  const url = new URL(request.url),
    id = url.searchParams.get("id") ?? "",
    token = url.searchParams.get("token") ?? "";
  if (
    !env.APP_ENCRYPTION_SECRET ||
    !id ||
    id.length > 80 ||
    token.length > 100 ||
    !(await verifyUnsubscribe(id, token, env.APP_ENCRYPTION_SECRET))
  )
    return null;
  return id;
}
export async function GET(request: Request) {
  if (!(await allowed(request)))
    return new Response("This unsubscribe link is invalid.", { status: 400 });
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h1>Stop Toran outreach</h1><p>Confirm below to stop further outreach to this contact.</p><form method="post"><button style="font:inherit;padding:14px 24px">Unsubscribe</button></form></body></html>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
export async function POST(request: Request) {
  const id = await allowed(request);
  if (!id) return new Response("Invalid unsubscribe link.", { status: 400 });
  await getSupabaseDb().patch(
    "leads",
    { id: `eq.${id}` },
    {
      do_not_contact: true,
      email_consent_at: null,
      email_consent_note: null,
      consent_at: null,
      consent_note: null,
    },
  );
  return new Response("You have been unsubscribed from Toran outreach.", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
