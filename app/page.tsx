import { redirect } from "next/navigation";
import Dashboard from "./dashboard";
import { getAppIdentity, getWorkspaceMember } from "../lib/server-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, authSource } = await getAppIdentity();
  if (!user) redirect("/signin");
  let member = null;
  try {
    member = await getWorkspaceMember(user.email);
  } catch {
    return <main className="access-gate"><section><span className="eyebrow">BOT 1 WORKSPACE</span><h1>Workspace connection is starting.</h1><p>Refresh this page in a moment. The dashboard will open after Supabase is reachable.</p></section></main>;
  }
  if (!member) {
    return <main className="access-gate"><section><span className="eyebrow">BOT 1 WORKSPACE</span><h1>Access is invite-only.</h1><p>You’re signed in as <strong>{user.email}</strong>. Ask the workspace owner to add this email, then open the dashboard link again.</p></section></main>;
  }
  return <Dashboard displayName={user.displayName} email={user.email} role={member.role} authSource={authSource ?? "password"} />;
}
