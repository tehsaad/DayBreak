import Link from "next/link";
import { getReader } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";

export async function MarketingHeader() {
  const reader = await getReader().catch(() => null);
  const accounts = storageMode() === "supabase";
  return (
    <header className="no-print sticky top-0 z-30 border-b border-rule/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-xl font-extrabold tracking-[0.18em] text-ink" aria-label="DAYBREAK home">
          DAYBREAK
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-5 font-sans text-sm text-ink-soft md:flex">
          <Link href="/#how" className="hover:text-ink">How it works</Link>
          <Link href="/#preview" className="hover:text-ink">Today&apos;s preview</Link>
          <Link href="/#sources" className="hover:text-ink">Sources</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 font-sans text-sm">
          {reader ? (
            <Link href="/newspaper" className="btn btn-primary !py-1.5">Open your paper</Link>
          ) : accounts ? (
            <>
              <Link href="/login" className="rounded px-3 py-1.5 text-ink-soft hover:bg-paper-deep hover:text-ink">Sign in</Link>
              <Link href="/login?mode=signup" className="btn btn-primary !py-1.5">Get started</Link>
            </>
          ) : (
            <Link href="/onboarding" className="btn btn-primary !py-1.5">Get started</Link>
          )}
        </div>
      </div>
    </header>
  );
}
