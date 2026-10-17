import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_ERRORS, AUTH_NOTICES, safeNext } from "@/lib/auth/redirect";
import { storageMode } from "@/lib/env";
import { PendingForm, SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const next = safeNext(str(sp.next)) ?? "";
  const signup = str(sp.mode) === "signup";
  const error = str(sp.error);
  const notice = str(sp.notice);
  const errorText = error ? AUTH_ERRORS[error] ?? AUTH_ERRORS.unknown : null;
  const noticeText = notice ? AUTH_NOTICES[notice] : null;

  if (storageMode() !== "supabase") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mt-3 text-ink-soft">
          This deployment runs in <strong>demo mode</strong>: accounts aren&apos;t configured, so your profile is tied to an anonymous cookie in this browser and isn&apos;t synced to other devices.
        </p>
        <Link href="/onboarding" className="btn btn-primary mt-6">Continue in demo mode</Link>
      </div>
    );
  }

  const tab = (active: boolean) => `flex-1 border-b-2 pb-2 text-center font-sans text-sm font-semibold ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`;
  const nextQs = next ? `&next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-12 sm:px-6 md:grid-cols-[1fr_minmax(0,26rem)] md:py-20">
      <section className="hidden md:block" aria-hidden>
        <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-muted">Your morning paper</p>
        <p className="mt-4 font-display text-6xl font-extrabold leading-[0.95] tracking-tight">Sign in once. Wake up to a paper made for you.</p>
        <div className="rule-double mt-8" />
        <ul className="mt-6 space-y-3 font-sans text-sm text-ink-soft">
          <li>Real reporting from 21 publishers, always linked to the original.</li>
          <li>Your preferences, editions and saved stories follow you to any device.</li>
          <li>Private by design: only you can read your paper.</li>
        </ul>
      </section>

      <section aria-labelledby="auth-h">
        <h1 id="auth-h" className="font-display text-4xl font-extrabold tracking-tight">{signup ? "Create your account" : "Welcome back"}</h1>
        <nav className="mt-6 flex gap-4" aria-label="Sign in or create account">
          <Link href={`/login?mode=signin${nextQs}`} className={tab(!signup)} aria-current={!signup ? "page" : undefined}>Sign in</Link>
          <Link href={`/login?mode=signup${nextQs}`} className={tab(signup)} aria-current={signup ? "page" : undefined}>Create account</Link>
        </nav>

        {errorText ? <p role="alert" className="mt-5 border border-accent/30 bg-accent-soft px-3 py-2 font-sans text-sm text-accent">{errorText}</p> : null}
        {noticeText ? <p role="status" className="mt-5 border border-forest/30 bg-forest-soft px-3 py-2 font-sans text-sm text-forest">{noticeText}</p> : null}

        <a href={`/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="btn btn-ghost mt-6 w-full justify-center !py-2.5">
          <GoogleMark /> Continue with Google
        </a>

        <div className="my-6 flex items-center gap-3 font-sans text-xs uppercase tracking-widest text-muted" aria-hidden>
          <span className="h-px flex-1 bg-rule" /> or with email <span className="h-px flex-1 bg-rule" />
        </div>

        <PendingForm action={signup ? "/auth/sign-up" : "/auth/sign-in"} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="field-label">Email</span>
            <input name="email" type="email" required autoComplete="email" maxLength={254} className="input mt-1.5" />
          </label>
          <label className="block">
            <span className="field-label">Password{signup ? " (at least 8 characters)" : ""}</span>
            <input name="password" type="password" required minLength={signup ? 8 : 1} maxLength={200} autoComplete={signup ? "new-password" : "current-password"} className="input mt-1.5" />
          </label>
          <SubmitButton pendingLabel={signup ? "Creating account…" : "Signing in…"}>{signup ? "Create account" : "Sign in"}</SubmitButton>
        </PendingForm>

        {!signup ? (
          <details className="mt-6 font-sans text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">Prefer a one-time link instead of a password?</summary>
            <PendingForm action="/auth/magic-link" className="mt-3 flex gap-2">
              <input type="hidden" name="next" value={next} />
              <label className="flex-1">
                <span className="sr-only">Email for sign-in link</span>
                <input name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
              </label>
              <SubmitButton variant="ghost" pendingLabel="Sending…">Email me a link</SubmitButton>
            </PendingForm>
          </details>
        ) : (
          <p className="mt-6 font-sans text-xs text-muted">We&apos;ll email you a link to confirm your address. DAYBREAK asks for nothing else.</p>
        )}
      </section>
    </div>
  );
}
