import { requireApiUser } from "../../../../lib/server-auth";
import { sendCampaignEmail } from "../../../../lib/email";
export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json({ error: "Owner access required." }, { status: 403 });
  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  > | null;
  const id = String(input?.leadId ?? "");
  if (!id || id.length > 80 || input?.confirm !== true)
    return Response.json(
      { error: "Choose a lead and confirm email sending." },
      { status: 400 },
    );
  const result = await sendCampaignEmail(id, null);
  return Response.json(
    { ...result, ok: result.accepted },
    { status: result.accepted ? 200 : 409 },
  );
}
