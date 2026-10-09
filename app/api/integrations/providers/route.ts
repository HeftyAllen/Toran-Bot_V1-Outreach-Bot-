import { requireApiUser } from "../../../../lib/server-auth";
import { getSupabaseDb } from "../../../../lib/supabase-db";
import {
  providerRow,
  providerCredentials,
  saveProvider,
  validEmail,
} from "../../../../lib/providers";
import { publicUrl } from "../../../../lib/bot-core";
export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const rows = await getSupabaseDb().select<{
      id: string;
      settings: unknown;
    }>("provider_connections", { select: "id,settings" });
    return Response.json(
      { providers: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load integrations." },
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
    const id = input.provider;
    if (id !== "google_places" && id !== "resend")
      throw new Error("Choose an integration.");
    const apiKey = String(input.apiKey ?? "").trim();
    if (apiKey.length < 15 || apiKey.length > 500)
      throw new Error("Enter a valid provider API key.");
    let settings: Record<string, unknown>;
    if (id === "google_places") {
      const result = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id",
          },
          body: JSON.stringify({ textQuery: "South Africa", pageSize: 1 }),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!result.ok)
        throw new Error(
          `Google could not verify this key (${result.status}). Enable Places API (New), billing and key restrictions.`,
        );
      const unitCost = Number(input.unitCostUsd ?? 0.04);
      if (!Number.isFinite(unitCost) || unitCost < 0.035 || unitCost > 1)
        throw new Error(
          "Set a conservative Google search estimate between $0.035 and $1.",
        );
      settings = {
        unitCostUsd: unitCost,
        verifiedAt: new Date().toISOString(),
      };
    } else {
      const fromAddress = String(input.fromAddress ?? "")
          .trim()
          .toLowerCase(),
        replyTo = String(input.replyTo ?? fromAddress)
          .trim()
          .toLowerCase();
      if (!validEmail(fromAddress) || !validEmail(replyTo))
        throw new Error("Enter a sender and reply-to email address.");
      const publicBaseUrl = publicUrl(input.publicBaseUrl);
      if (!publicBaseUrl)
        throw new Error(
          "Enter your dashboard's public HTTPS URL for unsubscribe links.",
        );
      const dailyLimit = Number(input.dailyLimit ?? 10),
        unitCost = Number(input.unitCostUsd ?? 0.001);
      if (
        !Number.isInteger(dailyLimit) ||
        dailyLimit < 1 ||
        dailyLimit > 100 ||
        !Number.isFinite(unitCost) ||
        unitCost < 0.0001 ||
        unitCost > 1
      )
        throw new Error(
          "Use a daily limit of 1–100 and an email cost estimate from $0.0001–$1.",
        );
      const result = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(12000),
      });
      if (!result.ok)
        throw new Error(
          `Resend could not verify this key (${result.status}). Use a key with domain-read and sending access.`,
        );
      const data = (await result.json()) as {
        data?: { name: string; status: string }[];
      };
      const domain = fromAddress.split("@")[1];
      if (
        !Array.isArray(data.data) ||
        !data.data.some(
          (d: { name: string; status: string }) =>
            d.name.toLowerCase() === domain && d.status === "verified",
        )
      )
        throw new Error(
          "Verify the sender domain in Resend before connecting it here.",
        );
      settings = {
        fromAddress,
        fromName: String(input.fromName ?? "Toran Digital")
          .replace(/[\r\n<>]/g, "")
          .slice(0, 100),
        replyTo,
        dailyLimit,
        unitCostUsd: unitCost,
        publicBaseUrl: new URL(publicBaseUrl).origin,
        verifiedAt: new Date().toISOString(),
      };
    }
    let webhookSecret =
      id === "resend" ? String(input.webhookSecret ?? "").trim() : "";
    if (webhookSecret && !/^whsec_[A-Za-z0-9+/=]{16,}$/.test(webhookSecret))
      throw new Error(
        "Enter the Resend webhook signing secret beginning with whsec_.",
      );
    if (id === "resend" && !webhookSecret && (await providerRow(id)))
      webhookSecret = (await providerCredentials(id)).webhookSecret ?? "";
    await saveProvider(id, settings, {
      apiKey,
      ...(webhookSecret ? { webhookSecret } : {}),
    });
    return Response.json({
      ok: true,
      message: "Connection verified and saved. Credentials stay on the server.",
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not save integration." },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("provider");
  if (id !== "resend" && id !== "google_places")
    return Response.json({ error: "Choose an integration." }, { status: 400 });
  await getSupabaseDb().delete("provider_connections", { id: `eq.${id}` });
  return Response.json({ ok: true });
}
