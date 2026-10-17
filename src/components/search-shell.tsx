"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { TOPICS, TOPIC_IDS } from "@/lib/topics";

const RECENT_KEY = "daybreak.recentSearches";
const DEBOUNCE_MS = 450;

export interface SearchState {
  q: string;
  topic: string;
  publisher: string;
  days: string;
  sort: string;
}

const RECENT_EVENT = "daybreak:recent-searches";

function rawRecent(): string {
  try {
    return localStorage.getItem(RECENT_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseRecent(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* storage may be unavailable (private mode); recent searches are optional */
  }
  window.dispatchEvent(new Event(RECENT_EVENT));
}

function subscribeRecent(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(RECENT_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(RECENT_EVENT, cb);
  };
}

/**
 * Search input + filters. Typing searches after a short pause (debounced); Enter searches now.
 * Results are server-rendered children; while a newer search is loading they're replaced by a
 * skeleton, and only the latest navigation renders, so stale results never flash.
 * Recent searches live only in this browser (localStorage) and are never sent anywhere.
 */
export function SearchShell({ initial, publishers, ranges, children }: { initial: SearchState; publishers: string[]; ranges: { days: number; label: string }[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(initial);
  // When the URL changes from outside (a recommendation link, back/forward), follow it.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial && JSON.stringify(seenInitial) !== JSON.stringify(initial)) {
    setSeenInitial(initial);
    setState(initial);
  }
  const [pending, start] = useTransition();
  const recentRaw = useSyncExternalStore(subscribeRecent, rawRecent, () => "[]");
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Remember executed searches on this device only.
  useEffect(() => {
    if (!initial.q) return;
    writeRecent([initial.q, ...parseRecent(rawRecent()).filter((r) => r.toLowerCase() !== initial.q.toLowerCase())]);
  }, [initial.q]);

  const navigate = useCallback(
    (s: SearchState) => {
      const params = new URLSearchParams();
      if (s.q.trim()) params.set("q", s.q.trim());
      if (s.topic) params.set("topic", s.topic);
      if (s.publisher) params.set("publisher", s.publisher);
      if (s.days && s.days !== "14") params.set("days", s.days);
      if (s.sort && s.sort !== "newest") params.set("sort", s.sort);
      const qs = params.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  const update = (patch: Partial<SearchState>, debounce: boolean) => {
    const next = { ...state, ...patch };
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
    else navigate(next);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const select = "input";
  return (
    <div>
      <form
        role="search"
        className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          update({}, false);
        }}
      >
        <label className="relative">
          <span className="sr-only">Search stored reporting</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            name="q"
            value={state.q}
            onChange={(e) => update({ q: e.target.value }, true)}
            onKeyDown={(e) => e.key === "Escape" && state.q && (e.preventDefault(), update({ q: "" }, false))}
            className="input !pl-9 !pr-9"
            placeholder="e.g. scholarships, IMF, glacier, cricket"
            autoComplete="off"
            aria-describedby="search-scope"
          />
          {state.q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                update({ q: "" }, false);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-paper-deep hover:text-ink"
            >
              <X size={15} aria-hidden />
            </button>
          ) : null}
        </label>
        <button className="btn btn-primary justify-center" type="submit">Search</button>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
          <label>
            <span className="sr-only">Section</span>
            <select className={select} value={state.topic} onChange={(e) => update({ topic: e.target.value }, false)}>
              <option value="">All sections</option>
              {TOPIC_IDS.map((t) => (
                <option key={t} value={t}>{TOPICS[t].label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Publisher</span>
            <select className={select} value={state.publisher} onChange={(e) => update({ publisher: e.target.value }, false)}>
              <option value="">All publishers</option>
              {publishers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Date range</span>
            <select className={select} value={state.days} onChange={(e) => update({ days: e.target.value }, false)}>
              {ranges.map((r) => (
                <option key={r.days} value={String(r.days)}>{r.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <select className={select} value={state.sort} onChange={(e) => update({ sort: e.target.value }, false)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </form>
      <p id="search-scope" className="mt-2 font-sans text-xs text-muted">Searches headlines and summaries DAYBREAK has stored from its sources in the last two weeks — not the live web.</p>

      {!state.q && recent.length ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 font-sans text-xs">
          <span className="text-muted">Your recent searches (this device only):</span>
          {recent.map((r) => (
            <button key={r} type="button" className="chip !py-1 !text-xs" onClick={() => update({ q: r }, false)}>{r}</button>
          ))}
          <button
            type="button"
            className="text-muted underline hover:text-ink"
            onClick={() => writeRecent([])}
          >
            Clear history
          </button>
        </div>
      ) : null}

      <div aria-live="polite" aria-busy={pending} className="mt-8">
        {pending ? <ResultsSkeleton /> : children}
      </div>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="grid gap-x-8 md:grid-cols-2" aria-label="Loading results">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 border-t border-rule py-4">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 skeleton" />
            <div className="h-5 w-11/12 skeleton" />
            <div className="h-3 w-40 skeleton" />
          </div>
          <div className="h-16 w-24 skeleton" />
        </div>
      ))}
    </div>
  );
}
