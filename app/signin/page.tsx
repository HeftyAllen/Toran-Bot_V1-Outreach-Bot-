import SignInForm from "./signin-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ email?: string | string[] }> }) {
  const params = await searchParams;
  const email = Array.isArray(params.email) ? params.email[0] : params.email ?? "";
  return <SignInForm initialEmail={email} />;
}
