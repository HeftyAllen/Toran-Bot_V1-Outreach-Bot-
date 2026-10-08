import { env } from "@bot1/runtime";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { getPasswordSessionUser } from "./password-auth";
import { getSupabaseDb } from "./supabase-db";

export type WorkspaceRole = "owner" | "viewer";
export type WorkspaceMember = {
  email: string;
  role: WorkspaceRole;
  created_at: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getWorkspaceMember(email: string): Promise<WorkspaceMember | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const db = getSupabaseDb();
  const members = await db.select<WorkspaceMember>("workspace_members", {
    select: "email,role,created_at",
    email: `eq.${normalizedEmail}`,
    limit: 1,
  });
  if (members[0]) return members[0];

  const ownerEmail = typeof env.OWNER_EMAIL === "string"
    ? normalizeEmail(env.OWNER_EMAIL)
    : "";
  if (normalizedEmail !== ownerEmail) return null;

  const created = await db.upsert<WorkspaceMember>(
    "workspace_members",
    { email: normalizedEmail, role: "owner", invited_by: "system" },
    "email",
  );
  return created[0] ?? null;
}

export async function getAppUser() {
  return (await getPasswordSessionUser()) ?? (await getChatGPTUser());
}

export async function getAppIdentity() {
  const sessionUser = await getPasswordSessionUser();
  if (sessionUser) return { user: sessionUser, authSource: "password" as const };
  const platformUser = await getChatGPTUser();
  return platformUser ? { user: platformUser, authSource: "chatgpt" as const } : { user: null, authSource: null };
}

export async function requireApiUser() {
  const user = await getAppUser();
  if (!user) return { user: null, response: Response.json({ error: "Sign in to use this workspace." }, { status: 401 }) };
  try {
    const member = await getWorkspaceMember(user.email);
    if (!member) {
      return {
        user: null,
        response: Response.json({ error: "This email does not have access to the Bot 1 workspace." }, { status: 403 }),
      };
    }
    return { user, member, response: null };
  } catch {
    return {
      user: null,
      response: Response.json({ error: "Workspace access could not be checked. Try again shortly." }, { status: 503 }),
    };
  }
}
