import { requireApiUser } from "../../../lib/server-auth";
import { getSupabaseDb } from "../../../lib/supabase-db";
import { csvCell } from "../../../lib/bot-core";
export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const rows = await getSupabaseDb().select<Record<string, unknown>>(
      "leads",
      {
        select:
          "company_name,website_url,region,category,address,contact_email,phone,whatsapp_url,fit_score,confidence,outcome,do_not_contact,discovery_source_url",
        order: "created_at.desc",
        limit: 5000,
      },
    );
    const fields = [
      "company_name",
      "website_url",
      "region",
      "category",
      "address",
      "contact_email",
      "phone",
      "whatsapp_url",
      "fit_score",
      "confidence",
      "outcome",
      "do_not_contact",
      "discovery_source_url",
    ];
    return new Response(
      [
        fields.map(csvCell).join(","),
        ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(",")),
      ].join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="bot1-businesses.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Could not export businesses." },
      { status: 503 },
    );
  }
}
