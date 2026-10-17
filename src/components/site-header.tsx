import Link from "next/link";
import { getReader } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";
import { NavLinks } from "./nav-links";

export async function SiteHeader() {
  const reader = await getReader().catch(() => null);
  const mode = storageMode();
  return (
    <header className="no-print border-b border-rule bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80 sticky top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="font-display text-xl font-extrabold tracking-[0.18em] text-ink" aria-label="DAYBREAK home">
          DAYBREAK
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-3 font-sans text-xs">
          {mode === "demo" ? (
            <Link href="/settings#data" className="rounded-full border border-warn/40 bg-warn-soft px-2.5 py-1 font-semibold text-warn" title="Demo mode: data is kept on this server only and is not synced across devices.">
              Demo mode
            </Link>
          ) : reader ? (
            <span className="hidden text-muted sm:inline" title="Signed in">{reader.email}</span>
          ) : (
            <Link href="/login" className="btn btn-ghost !py-1.5">Sign in</Link>
          )}
          {mode === "supabase" && reader ? (
            <form action="/auth/signout" method="post">
              <button className="text-muted underline-offset-2 hover:text-ink hover:underline" type="submit">Sign out</button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}
