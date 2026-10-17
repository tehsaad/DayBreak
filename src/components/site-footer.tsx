import Link from "next/link";
import { SOURCES } from "@/lib/news/sources";

export function SiteFooter() {
  const publishers = new Set(SOURCES.map((s) => s.publisher)).size;
  return (
    <footer className="no-print mt-16 border-t border-rule">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 font-sans text-xs text-muted sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display text-base font-extrabold tracking-[0.18em] text-ink">DAYBREAK</p>
          <p className="mt-1 italic">The world, filtered through you.</p>
        </div>
        <p>
          Headlines and short excerpts come from {publishers} publishers&apos; public RSS feeds. Every story links to the original reporting; DAYBREAK does not reproduce full articles or bypass paywalls.
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
          <li><Link className="hover:text-ink hover:underline" href="/settings#sources">Sources</Link></li>
          <li><Link className="hover:text-ink hover:underline" href="/settings#interests">How ranking works</Link></li>
          <li><a className="hover:text-ink hover:underline" href="https://github.com/tehsaad/DayBreak">Source code</a></li>
        </ul>
      </div>
    </footer>
  );
}
