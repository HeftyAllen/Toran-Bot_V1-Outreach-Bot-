import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  hashPassword,
  setPasswordSession,
  verifyPassword,
} from "../../../../lib/password-auth";
import { getSupabaseDb } from "../../../../lib/supabase-db";
import { requireApiUser } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Enter a new password." }, { status: 400 });
  }
  if (
    typeof input.password !== "string" ||
    input.password.length < 12 ||
    input.password.length > 128
  ) {
    return Response.json(
      { error: "Choose a password between 12 and 128 characters." },
      { status: 400 },
    );
  }
  try {
    const db = getSupabaseDb();
    const rows = await db.select<{
      password_salt: string | null;
      password_hash: string | null;
    }>("workspace_members", {
      select: "password_salt,password_hash",
      email: `eq.${user.email.trim().toLowerCase()}`,
      limit: 1,
    });
    const current = rows[0];
    const platformUser = await getChatGPTUser();
    if (
      platformUser?.email.trim().toLowerCase() !==
        user.email.trim().toLowerCase() &&
      current?.password_hash &&
      current.password_salt
    ) {
      if (
        typeof input.currentPassword !== "string" ||
        !(await verifyPassword(
          input.currentPassword,
          current.password_salt,
          current.password_hash,
        ))
      ) {
        return Response.json(
          { error: "Enter your current password to change it." },
          { status: 403 },
        );
      }
    }
    const hashed = await hashPassword(input.password);
    await db.patch(
      "workspace_members",
      { email: `eq.${user.email.trim().toLowerCase()}` },
      {
        password_salt: hashed.salt,
        password_hash: hashed.hash,
      },
    );
    await setPasswordSession(user.email.trim().toLowerCase());
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not save your password. Try again." },
      { status: 503 },
    );
  }
}
