"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/paper", label: "Today" },
  { href: "/archive", label: "Archive" },
  { href: "/saved", label: "Saved" },
  { href: "/explore", label: "Explore" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Main" className="font-sans text-sm">
      <ul className="hidden items-center gap-1 md:flex">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`rounded px-2.5 py-1.5 transition-colors ${active(l.href) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep"}`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" className="rounded p-1.5 md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        <span className="sr-only">Menu</span>
      </button>
      {open ? (
        <ul id="mobile-nav" className="absolute inset-x-0 top-full border-b border-rule bg-paper px-4 py-2 shadow-sm md:hidden">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)} aria-current={active(l.href) ? "page" : undefined} className={`block border-b border-rule/60 py-3 ${active(l.href) ? "font-semibold text-accent" : ""}`}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
