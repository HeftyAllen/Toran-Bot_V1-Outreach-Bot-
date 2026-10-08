import {
  hashInviteToken,
  hashPassword,
  setPasswordSession,
} from "../../../../lib/password-auth";
import { getSupabaseDb } from "../../../../lib/supabase-db";

function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: "This invitation is invalid or expired." },
      { status: 400 },
    );
  }
  if (
    !validEmail(input.email) ||
    typeof input.token !== "string" ||
    input.token.length < 30 ||
    input.token.length > 200
  ) {
    return Response.json(
      { error: "This invitation is invalid or expired." },
      { status: 400 },
    );
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
  const email = input.email.trim().toLowerCase();
  try {
    const tokenHash = await hashInviteToken(input.token);
    const rows = await getSupabaseDb().select<{
      email: string;
      role: string;
      invite_token_hash: string | null;
      invite_expires_at: string | null;
    }>("workspace_members", {
      select: "email,role,invite_token_hash,invite_expires_at",
      email: `eq.${email}`,
      invite_token_hash: `eq.${tokenHash}`,
      invite_expires_at: `gt.${new Date().toISOString()}`,
      limit: 1,
    });
    if (!rows[0])
      return Response.json(
        {
          error:
            "This invitation is invalid or expired. Ask the owner for a new link.",
        },
        { status: 410 },
      );
    const hashed = await hashPassword(input.password);
    const updated = await getSupabaseDb().patch(
      "workspace_members",
      {
        email: `eq.${email}`,
        invite_token_hash: `eq.${tokenHash}`,
        invite_expires_at: `gt.${new Date().toISOString()}`,
      },
      {
        password_salt: hashed.salt,
        password_hash: hashed.hash,
        invite_token_hash: null,
        invite_expires_at: null,
      },
    );
    if (!updated.length)
      return Response.json(
        {
          error:
            "This invitation has already been used. Sign in with your password.",
        },
        { status: 409 },
      );
    await setPasswordSession(email);
    return Response.json({ ok: true, role: rows[0].role });
  } catch {
    return Response.json(
      { error: "Could not activate this invitation. Try again shortly." },
      { status: 503 },
    );
  }
}
