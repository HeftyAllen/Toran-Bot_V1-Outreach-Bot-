import { getSupabaseDb } from "../../../lib/supabase-db";
import { requireApiUser } from "../../../lib/server-auth";
import { hashInviteToken } from "../../../lib/password-auth";

function ownerRequired(role: string) {
  return role === "owner"
    ? null
    : Response.json(
        { error: "Only the workspace owner can manage access." },
        { status: 403 },
      );
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return null;
  return email;
}

function newInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export async function GET() {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerRequired(member.role);
  if (denial) return denial;
  try {
    const members = await getSupabaseDb().select("workspace_members", {
      select: "email,role,created_at",
      order: "created_at.asc",
    });
    return Response.json(
      { members },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load workspace access." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerRequired(member.role);
  if (denial) return denial;
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const email = normalizeEmail(input.email);
  if (!email)
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  if (email === user.email.trim().toLowerCase())
    return Response.json(
      { error: "You already have owner access." },
      { status: 409 },
    );
  try {
    const db = getSupabaseDb();
    const existing = await db.select<{ role: string }>("workspace_members", {
      select: "role",
      email: `eq.${email}`,
      limit: 1,
    });
    if (existing[0]?.role === "owner")
      return Response.json(
        { error: "An owner cannot be added as a viewer." },
        { status: 409 },
      );
    const token = newInviteToken();
    const tokenHash = await hashInviteToken(token);
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const members = await db.upsert(
      "workspace_members",
      {
        email,
        role: "viewer",
        invited_by: user.email.trim().toLowerCase(),
        invite_token_hash: tokenHash,
        invite_expires_at: expiresAt,
      },
      "email",
    );
    const inviteUrl = new URL("/invite", request.url);
    inviteUrl.searchParams.set("email", email);
    inviteUrl.searchParams.set("token", token);
    return Response.json({
      ok: true,
      member: {
        email,
        role: "viewer",
        created_at: (members[0] as { created_at?: string })?.created_at,
      },
      inviteUrl: inviteUrl.toString(),
      expiresAt,
    });
  } catch {
    return Response.json(
      { error: "Could not add that email. Try again." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  const denial = ownerRequired(member.role);
  if (denial) return denial;
  const email = normalizeEmail(new URL(request.url).searchParams.get("email"));
  if (!email || email === user.email.trim().toLowerCase())
    return Response.json(
      { error: "Choose a valid member email." },
      { status: 400 },
    );
  try {
    const removed = await getSupabaseDb().delete("workspace_members", {
      email: `eq.${email}`,
      role: "eq.viewer",
    });
    if (!removed.length)
      return Response.json(
        { error: "That viewer was not found." },
        { status: 404 },
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not remove that viewer." },
      { status: 503 },
    );
  }
}
