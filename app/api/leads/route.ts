import { publicUrl, normalizePhone } from "../../../lib/bot-core";
import { SupabaseDbError, getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";

const allowedOutcomes = new Set([
  "good_fit",
  "poor_fit",
  "replied",
  "not_interested",
  "booked",
  "won",
  "lost",
]);

function normalizeUrl(raw: unknown) {
  return typeof raw === "string"
    ? publicUrl(
        raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`,
      )
    : null;
}

function ownerOnly(role: string) {
  return role === "owner"
    ? null
    : Response.json(
        { error: "Only the workspace owner can make this change." },
        { status: 403 },
      );
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
    return Response.json(
      { leads },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load the lead queue." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerOnly(member.role);
  if (denial) return denial;
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: "Enter valid business details." },
      { status: 400 },
    );
  }
  const companyName =
    typeof input.companyName === "string"
      ? input.companyName.trim().slice(0, 120)
      : "";
  const websiteUrl = normalizeUrl(input.websiteUrl);
  const region =
    typeof input.region === "string" ? input.region.trim().slice(0, 120) : "";
  if (!companyName || !websiteUrl)
    return Response.json(
      { error: "Enter a business name and a valid HTTPS website." },
      { status: 400 },
    );
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
      return Response.json(
        { error: "That website is already in your queue." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Could not add the business. Try again." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerOnly(member.role);
  if (denial) return denial;
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Enter a valid outcome." }, { status: 400 });
  }
  const id = typeof input.id === "string" ? input.id : "";
  if (!id || id.length > 80)
    return Response.json({ error: "Choose a business." }, { status: 400 });
  try {
    const db = getSupabaseDb();
    const rows = await db.select<{ id: string }>("leads", {
      select: "id",
      id: `eq.${id}`,
      limit: 1,
    });
    if (!rows[0])
      return Response.json({ error: "Business not found." }, { status: 404 });
    if (
      typeof input.outcome === "string" &&
      allowedOutcomes.has(input.outcome)
    ) {
      await db.rpc("bot1_record_feedback", {
        p_lead_id: id,
        p_outcome: input.outcome,
        p_note:
          typeof input.note === "string" ? input.note.slice(0, 1200) : null,
        p_email: user.email,
      });
    } else if (input.retry === true) {
      const active = await db.select("runs", {
        select: "id",
        status: "eq.running",
        limit: 1,
      });
      if (active.length)
        return Response.json(
          { error: "Finish or cancel the current campaign before retrying." },
          { status: 409 },
        );
      await db.patch(
        "leads",
        { id: `eq.${id}` },
        { status: "queued", research_error: null },
      );
    } else if (typeof input.doNotContact === "boolean") {
      await db.patch(
        "leads",
        { id: `eq.${id}` },
        {
          do_not_contact: input.doNotContact,
          ...(input.doNotContact
            ? { consent_at: null, consent_note: null }
            : {}),
        },
      );
    } else if (input.recordConsent === true) {
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (note.length < 8 || note.length > 1200)
        return Response.json(
          {
            error:
              "Describe when and how the recipient agreed to WhatsApp messages.",
          },
          { status: 400 },
        );
      await db.patch(
        "leads",
        { id: `eq.${id}` },
        {
          consent_at: new Date().toISOString(),
          consent_note: note,
          do_not_contact: false,
        },
      );
    } else if (
      typeof input.phone === "string" ||
      typeof input.contactEmail === "string"
    ) {
      const source = publicUrl(input.sourceUrl);
      if (!source)
        return Response.json(
          { error: "Provide the public source URL for this contact." },
          { status: 400 },
        );
      const patch: Record<string, unknown> = {
        contacts_verified_at: new Date().toISOString(),
      };
      const sources = [];
      if (typeof input.phone === "string") {
        const phone = normalizePhone(
          input.phone,
          String(input.callingCode ?? "27"),
        );
        if (!phone)
          return Response.json(
            { error: "Use an international phone number." },
            { status: 400 },
          );
        patch.phone = phone;
        sources.push({ field: "phone", value: phone, url: source });
      }
      if (typeof input.contactEmail === "string") {
        const email = input.contactEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return Response.json(
            { error: "Enter a valid business email." },
            { status: 400 },
          );
        patch.contact_email = email;
        sources.push({ field: "email", value: email, url: source });
      }
      const old = await db.select<{ contact_sources: unknown[] }>("leads", {
        select: "contact_sources",
        id: `eq.${id}`,
        limit: 1,
      });
      patch.contact_sources = [
        ...(old[0]?.contact_sources ?? []),
        ...sources,
      ].slice(-30);
      await db.patch("leads", { id: `eq.${id}` }, patch);
    } else
      return Response.json(
        {
          error:
            "Choose an outcome, consent change, contact update, or research retry.",
        },
        { status: 400 },
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not save this change." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerOnly(member.role);
  if (denial) return denial;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.length > 80)
    return Response.json(
      { error: "Choose a business record to remove." },
      { status: 400 },
    );
  try {
    const rows = await getSupabaseDb().delete("leads", { id: `eq.${id}` });
    if (!rows.length)
      return Response.json(
        { error: "That business was not found." },
        { status: 404 },
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not remove that business." },
      { status: 503 },
    );
  }
}
