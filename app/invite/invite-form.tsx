"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Command, LoaderCircle, ShieldCheck } from "lucide-react";

export default function InviteForm({ email, token }: { email: string; token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const validInvite = Boolean(email && token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not activate this invitation.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not activate this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><div className="brand-mark"><Command size={18} /></div><div><strong>BOT STUDIO</strong><span>BOT 1 WORKSPACE</span></div></div>
      <span className="auth-eyebrow">WORKSPACE INVITATION</span>
      <h1>Create your profile</h1>
      {validInvite ? <>
        <p className="auth-copy">You have been invited to view Bot 1 as <strong>{email}</strong>. Create a password to finish setting up your profile.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><span>Use at least 12 characters.</span></label>
          <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          {message && <p className="auth-message" role="alert">{message}</p>}
          <button className="button button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <>Create profile <ArrowRight size={15} /></>}</button>
        </form>
      </> : <p className="auth-message">This invitation link is incomplete. Ask the workspace owner to send you a new link.</p>}
      <div className="auth-footnote"><ShieldCheck size={14} /> This one-time invitation expires after seven days.</div>
    </section>
  </main>;
}
