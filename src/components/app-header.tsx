import Link from "next/link";
import { getReader } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";
import { AccountMenu } from "./account-menu";
import { NavLinks } from "./nav-links";

export async function AppHeader() {
  const reader = await getReader().catch(() => null);
  const mode = storageMode();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-ink bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/newspaper" className="font-display text-xl font-extrabold tracking-[0.18em] text-ink" aria-label="DAYBREAK — your newspaper">
          DAYBREAK
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-3 font-sans text-xs">
          {mode === "demo" ? (
            <Link href="/settings#data" className="rounded-full border border-warn/40 bg-warn-soft px-2.5 py-1 font-semibold text-warn" title="Demo mode: data is kept on this server only and is not synced across devices.">
              Demo mode
            </Link>
          ) : null}
          {mode === "supabase" && reader ? <AccountMenu email={reader.email} /> : null}
          {mode === "supabase" && !reader ? <Link href="/login" className="btn btn-ghost !py-1.5">Sign in</Link> : null}
        </div>
      </div>
    </header>
  );
}
