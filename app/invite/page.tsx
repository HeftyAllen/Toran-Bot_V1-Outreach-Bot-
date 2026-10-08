import InviteForm from "./invite-form";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept Bot 1 invitation", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ email?: string | string[]; token?: string | string[] }> }) {
  const params = await searchParams;
  const email = Array.isArray(params.email) ? params.email[0] : params.email ?? "";
  const token = Array.isArray(params.token) ? params.token[0] : params.token ?? "";
  return <InviteForm email={email} token={token} />;
}
