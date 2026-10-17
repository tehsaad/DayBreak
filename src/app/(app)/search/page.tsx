import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { ArticleRow } from "@/components/article-row";
import { log } from "@/lib/api";
import { requireReader } from "@/lib/server/page-reader";
import { TOPICS, TOPIC_IDS, isTopicId } from "@/lib/topics";
import type { Article } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const RANGES = [
  { days: 1, label: "Last 24 hours" },
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "Last week" },
  { days: 14, label: "Last 2 weeks" },
] as const;

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { reader, prefs } = await requireReader("/search");
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const q = str(sp.q).slice(0, 120).trim();
  const topic = isTopicId(str(sp.topic)) ? (str(sp.topic) as (typeof TOPIC_IDS)[number]) : undefined;
  const publisher = str(sp.publisher).slice(0, 80) || undefined;
  const days = RANGES.find((r) => String(r.days) === str(sp.days))?.days ?? 14;
  const sort = str(sp.sort) === "oldest" ? "oldest" : "newest";
  const searching = Boolean(q || topic || publisher);

  let results: Article[] = [];
  let failed = false;
  let pool: Article[] = [];
  try {
    [pool, results] = await Promise.all([
      reader.store.listArticles({ sinceHours: 14 * 24, limit: 1500 }),
      searching ? reader.store.listArticles({ text: q || undefined, topic, publisher, sinceHours: days * 24, sort, limit: 60 }) : Promise.resolve([] as Article[]),
    ]);
  } catch (err) {
    failed = true;
    log("search_failed", { error: (err as Error).message?.slice(0, 200) });
  }
  const publishers = [...new Set(pool.filter((a) => !a.sample).map((a) => a.publisher))].sort((a, b) => a.localeCompare(b));
  const savedIds = new Set((await reader.store.listBookmarks(reader.userId)).map((b) => b.articleId));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Search</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Search the headlines and summaries DAYBREAK has collected from its sources over the last two weeks. This searches stored reporting — it is not a live web search.
      </p>

      <form action="/search" role="search" className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search words</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} className="input !pl-9" placeholder="e.g. scholarships, IMF, glacier, cricket" autoFocus={!searching} />
        </label>
        <button className="btn btn-primary justify-center" type="submit">Search</button>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
          <label>
            <span className="sr-only">Section</span>
            <select name="topic" defaultValue={topic ?? ""} className="input">
              <option value="">All sections</option>
              {TOPIC_IDS.map((t) => (
                <option key={t} value={t}>{TOPICS[t].label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Publisher</span>
            <select name="publisher" defaultValue={publisher ?? ""} className="input">
              <option value="">All publishers</option>
              {publishers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Date range</span>
            <select name="days" defaultValue={String(days)} className="input">
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>{r.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={sort} className="input">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </form>

      {failed ? (
        <p role="alert" className="mt-8 border border-accent/30 bg-accent-soft px-4 py-3 font-sans text-sm text-accent">Search is unavailable right now. Please try again in a moment.</p>
      ) : !searching ? (
        <div className="mt-10">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">Try a section</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(prefs.sections.length ? prefs.sections : TOPIC_IDS.slice(0, 6)).map((t) => (
              <Link key={t} href={`/search?topic=${t}`} className="chip">{TOPICS[t].label}</Link>
            ))}
          </div>
          <p className="mt-6 font-sans text-sm text-muted">{pool.length ? `${pool.length} stored articles are searchable right now.` : "No articles are stored yet — open your newspaper to fetch today's reporting."}</p>
        </div>
      ) : (
        <section aria-labelledby="results-h" className="mt-8">
          <h2 id="results-h" className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted" aria-live="polite">
            {results.length === 60 ? "60+" : results.length} result{results.length === 1 ? "" : "s"}
            {q ? ` for “${q}”` : ""}
            {topic ? ` in ${TOPICS[topic].label}` : ""}
            {publisher ? ` from ${publisher}` : ""}
          </h2>
          {results.length ? (
            <ul className="mt-2 grid gap-x-8 md:grid-cols-2">
              {results.map((a) => (
                <ArticleRow key={a.id} article={a} timeZone={prefs.timezone} saved={savedIds.has(a.id)} />
              ))}
            </ul>
          ) : (
            <div className="mt-6 border border-dashed border-rule p-6">
              <p className="font-display text-xl">No stored stories match.</p>
              <p className="mt-1 text-sm text-ink-soft">Try fewer or broader words, a longer date range, or remove the filters.</p>
              <Link href="/search" className="mt-3 inline-block font-sans text-sm text-accent underline">Clear search</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
