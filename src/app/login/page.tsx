import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { storageMode } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/paper";
  const failed = sp.error === "auth";
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Sign in</h1>
      {storageMode() === "supabase" ? (
        <>
          <p className="mt-3 text-ink-soft">We&apos;ll email you a one-time sign-in link. No password, and your paper follows you to any device.</p>
          {failed ? <p role="alert" className="mt-4 font-sans text-sm text-accent">That sign-in link was invalid or expired. Request a new one.</p> : null}
          <LoginForm next={next} url={process.env.NEXT_PUBLIC_SUPABASE_URL!} anonKey={(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!} />
        </>
      ) : (
        <>
          <p className="mt-3 text-ink-soft">
            This deployment runs in <strong>demo mode</strong>: there are no accounts. Your profile is tied to an anonymous cookie in this browser and stored on this server only — it won&apos;t sync to other devices.
          </p>
          <p className="mt-3 text-sm text-muted">To enable accounts, configure Supabase (see the README).</p>
          <Link href="/onboarding" className="btn btn-primary mt-6">Continue in demo mode</Link>
        </>
      )}
    </div>
  );
}
