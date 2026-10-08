import { clearPasswordSession } from "../../../../lib/password-auth";

export const runtime = "edge";

export async function POST() {
  await clearPasswordSession();
  return Response.json({ ok: true });
}
