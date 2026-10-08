import { getSupabaseDb } from "../../../../lib/supabase-db";
import { setPasswordSession, verifyPassword } from "../../../../lib/password-auth";

export const runtime = "edge";

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Enter your email and password." }, { status: 400 }); }
  if (!validEmail(input.email) || typeof input.password !== "string" || input.password.length > 128) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }
  const email = input.email.trim().toLowerCase();
  try {
    const rows = await getSupabaseDb().select<{ email: string; role: string; password_salt: string | null; password_hash: string | null }>("workspace_members", {
      select: "email,role,password_salt,password_hash",
      email: `eq.${email}`,
      limit: 1,
    });
    const member = rows[0];
    if (!member?.password_salt || !member.password_hash || !(await verifyPassword(input.password, member.password_salt, member.password_hash))) {
      return Response.json({ error: "Email or password is incorrect. If you were just invited, open your invitation link first." }, { status: 401 });
    }
    await setPasswordSession(email);
    return Response.json({ ok: true, role: member.role });
  } catch {
    return Response.json({ error: "Sign-in is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
