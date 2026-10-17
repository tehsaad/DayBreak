"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Mail } from "lucide-react";

export function LoginForm({ next, url, anonKey }: { next: string; url: string; anonKey: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const supabase = createBrowserClient(url, anonKey);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) setError(error.message);
      else setSent(true);
    });
  };

  if (sent) {
    return (
      <p role="status" className="mt-6 border border-forest/40 bg-forest-soft p-4 font-sans text-sm text-forest">
        Check your inbox: we sent a sign-in link to <strong>{email}</strong>.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block">
        <span className="field-label">Email</span>
        <input type="email" required autoComplete="email" className="input mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn btn-primary w-full justify-center" disabled={pending}>
        <Mail size={16} aria-hidden /> {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {error ? <p role="alert" className="font-sans text-sm text-accent">{error}</p> : null}
    </form>
  );
}
