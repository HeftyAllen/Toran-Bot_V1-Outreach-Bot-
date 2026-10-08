import { requireApiUser } from "../../../../lib/server-auth";
import { getSupabaseDb } from "../../../../lib/supabase-db";
import { encryptSecret } from "../../../../lib/secret-box";
import {
  connection,
  credentials,
  encryptionKey,
} from "../../../../lib/whatsapp";
export async function GET(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  try {
    const row = await connection();
    return Response.json(
      {
        connected: !!row,
        label: row?.label,
        phoneNumberId: row?.phone_number_id,
        apiVersion: row?.api_version,
        webhookUrl: new URL("/api/whatsapp/webhook", request.url).toString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not check WhatsApp." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const phoneNumberId = String(input.phoneNumberId ?? "").trim(),
      apiVersion = String(input.apiVersion ?? "v23.0").trim();
    if (!/^\d{5,30}$/.test(phoneNumberId) || !/^v\d{1,2}\.0$/.test(apiVersion))
      return Response.json(
        { error: "Enter a valid Phone Number ID and Graph API version." },
        { status: 400 },
      );
    const old = await connection();
    const existing = old ? await credentials(old) : null;
    const token = String(input.token ?? "").trim() || existing?.token,
      appSecret = String(input.appSecret ?? "").trim() || existing?.appSecret,
      verifyToken =
        String(input.verifyToken ?? "").trim() || existing?.verifyToken;
    if (
      !token ||
      !appSecret ||
      !verifyToken ||
      token.length > 3000 ||
      appSecret.length > 500 ||
      verifyToken.length < 16 ||
      verifyToken.length > 200
    )
      return Response.json(
        {
          error:
            "Provide an access token, app secret, and webhook verify token (16+ characters). Blank fields keep saved values.",
        },
        { status: 400 },
      );
    const check = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!check.ok)
      return Response.json(
        {
          error: `Meta could not verify this connection (${check.status}). Check the token permissions, Phone Number ID, and API version.`,
        },
        { status: 400 },
      );
    const key = encryptionKey();
    await getSupabaseDb().upsert(
      "whatsapp_connection",
      {
        id: 1,
        phone_number_id: phoneNumberId,
        api_version: apiVersion,
        token_cipher: await encryptSecret(token, key),
        app_secret_cipher: await encryptSecret(appSecret, key),
        verify_token_cipher: await encryptSecret(verifyToken, key),
        label: String(input.label ?? "WhatsApp Business").slice(0, 100),
        updated_at: new Date().toISOString(),
      },
      "id",
    );
    return Response.json({
      ok: true,
      message:
        "Meta connection verified. Register the callback URL and verify token in Meta, then subscribe to messages.",
    });
  } catch {
    return Response.json(
      {
        error:
          "Could not save the WhatsApp connection. Check the server encryption key and retry.",
      },
      { status: 503 },
    );
  }
}
export async function DELETE() {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    await getSupabaseDb().delete("whatsapp_connection", { id: "eq.1" });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not disconnect WhatsApp." },
      { status: 503 },
    );
  }
}
