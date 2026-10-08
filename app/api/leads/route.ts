import { SupabaseDbError, getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";

export const runtime = "edge";

const allowedOutcomes = new Set(["good_fit", "poor_fit", "replied", "not_interested", "booked", "won", "lost"]);

function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let url: URL;
  try { url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !host.includes(".") || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test")) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return null;
  url.hash = "";
  return url.toString();
}

function ownerOnly(role: string) {
  return role === "owner" ? null : Response.json({ error: "Only the workspace owner can make this change." }, { status: 403 });
}

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const leads = await getSupabaseDb().select("leads", {
      select: "*",
      order: "created_at.desc",
      limit: 100,
    });
    return Response.json({ leads }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load the lead queue." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerOnly(member.role);
  if (denial) return denial;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Enter valid business details." }, { status: 400 }); }
  const companyName = typeof input.companyName === "string" ? input.companyName.trim().slice(0, 120) : "";
  const websiteUrl = normalizeUrl(input.websiteUrl);
  const region = typeof input.region === "string" ? input.region.trim().slice(0, 120) : "";
  if (!companyName || !websiteUrl) return Response.json({ error: "Enter a business name and a valid HTTPS website." }, { status: 400 });
  const now = new Date().toISOString();
  try {
    const rows = await getSupabaseDb().insert<{ id: string }>("leads", {
      id: crypto.randomUUID(),
      company_name: companyName,
      website_url: websiteUrl,
      region: region || null,
      status: "queued",
      created_at: now,
      updated_at: now,
    });
    return Response.json({ id: rows[0]?.id, ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof SupabaseDbError && error.code === "23505") {
      return Response.json({ error: "That website is already in your queue." }, { status: 409 });
    }
    return Response.json({ error: "Could not add the business. Try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerOnly(member.role);
  if (denial) return denial;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Enter a valid outcome." }, { status: 400 }); }
  const id = typeof input.id === "string" ? input.id : "";
  const outcome = typeof input.outcome === "string" ? input.outcome : "";
  if (!id || !allowedOutcomes.has(outcome)) return Response.json({ error: "Choose a valid lead outcome." }, { status: 400 });
  try {
    const rows = await getSupabaseDb().patch("leads", { id: `eq.${id}` }, {
      outcome,
      updated_at: new Date().toISOString(),
    });
    if (!rows.length) return Response.json({ error: "That business was not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not save that outcome." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerOnly(member.role);
  if (denial) return denial;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.length > 80) return Response.json({ error: "Choose a business record to remove." }, { status: 400 });
  try {
    const rows = await getSupabaseDb().delete("leads", { id: `eq.${id}` });
    if (!rows.length) return Response.json({ error: "That business was not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not remove that business." }, { status: 503 });
  }
}
