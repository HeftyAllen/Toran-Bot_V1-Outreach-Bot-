import { clearPasswordSession } from "../../../../lib/password-auth";

export async function POST() {
  await clearPasswordSession();
  return Response.json({ ok: true });
}
