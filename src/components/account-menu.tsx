"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";

/** Account menu: who is signed in, settings, and sign-out (a POST form, CSRF-checked server-side). */
export function AccountMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 text-ink-soft hover:border-ink hover:text-ink">
        <UserRound size={14} aria-hidden />
        <span className="hidden max-w-40 truncate sm:inline">{email ?? "Account"}</span>
        <ChevronDown size={13} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full mt-2 w-60 border border-ink bg-paper-card p-1 font-sans text-sm shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-muted" title={email ?? undefined}>Signed in as {email ?? "your account"}</p>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-paper-deep">
            <Settings size={14} aria-hidden /> Preferences
          </Link>
          <form action="/auth/signout" method="post">
            <button role="menuitem" type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-paper-deep">
              <LogOut size={14} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
