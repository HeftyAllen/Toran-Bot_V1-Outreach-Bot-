"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Command, LoaderCircle, ShieldCheck } from "lucide-react";

export default function SignInForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not sign in.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><div className="brand-mark"><Command size={18} /></div><div><strong>BOT STUDIO</strong><span>BOT 1 WORKSPACE</span></div></div>
      <span className="auth-eyebrow">PRIVATE WORKSPACE</span>
      <h1>Sign in to Bot 1</h1>
      <p className="auth-copy">Use the email and password you created from your workspace invitation.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {message && <p className="auth-message" role="alert">{message}</p>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <>Sign in <ArrowRight size={15} /></>}</button>
      </form>
      <div className="auth-footnote"><ShieldCheck size={14} /> Only email addresses invited by the workspace owner can sign in.</div>
    </section>
  </main>;
}
