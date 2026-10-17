import Link from "next/link";
import { getReader } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";

export async function MarketingHeader() {
  const reader = await getReader().catch(() => null);
  const accounts = storageMode() === "supabase";

  return (
    <header className="no-print sticky top-0 z-40 border-b border-rule/80 bg-paper/95 backdrop-blur-md supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark in display face */}
        <Link
          href="/"
          className="font-display text-xl font-black tracking-[0.22em] text-ink transition-colors hover:text-accent whitespace-nowrap shrink-0"
          aria-label="DAYBREAK home"
        >
          DAYBREAK
        </Link>

        {/* Zone 2: 4-5 clean single-line text navigation links */}
        <nav
          aria-label="Main Navigation"
          className="hidden items-center gap-7 font-sans text-xs font-semibold tracking-wider uppercase text-muted md:flex"
        >
          <a
            href="#today"
            className="transition-colors hover:text-ink whitespace-nowrap shrink-0"
          >
            Today&apos;s Edition
          </a>
          <a
            href="#perspectives"
            className="transition-colors hover:text-ink whitespace-nowrap shrink-0"
          >
            Full Coverage
          </a>
          <a
            href="#interests"
            className="transition-colors hover:text-ink whitespace-nowrap shrink-0"
          >
            Your Topics
          </a>
          <a
            href="#features"
            className="transition-colors hover:text-ink whitespace-nowrap shrink-0"
          >
            The Experience
          </a>
          <a
            href="#sources"
            className="transition-colors hover:text-ink whitespace-nowrap shrink-0"
          >
            Newsrooms
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0 font-sans text-xs font-semibold">
          {reader ? (
            <Link
              href="/newspaper"
              className="btn btn-primary !px-4 !py-2 whitespace-nowrap shrink-0"
            >
              Open Your Paper
            </Link>
          ) : accounts ? (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-block px-3 py-1.5 text-ink-soft hover:text-ink whitespace-nowrap shrink-0"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                className="btn btn-primary !px-4 !py-2 whitespace-nowrap shrink-0"
              >
                Read Your Edition
              </Link>
            </>
          ) : (
            <Link
              href="/onboarding"
              className="btn btn-primary !px-4 !py-2 whitespace-nowrap shrink-0"
            >
              Read Your Edition
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
