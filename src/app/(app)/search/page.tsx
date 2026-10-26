import type { Metadata } from "next";
import Link from "next/link";
import { ArticleRow } from "@/components/article-row";
import { formatTime } from "@/components/paper/format";
import { SearchShell } from "@/components/search-shell";
import { Thumb } from "@/components/thumb";
import { log } from "@/lib/api";
import { getRecommendations, POPULAR_CATEGORIES, type Recommendations, type RecommendedStory } from "@/lib/news/recommendations";
import { safeLinkUrl } from "@/lib/security/url";
import { searchWebNews, webSearchAvailable, type WebSearchResult } from "@/lib/news/web-search";
import { requireReader } from "@/lib/server/page-reader";
import { TOPICS, isTopicId, topicLabel, type TopicId } from "@/lib/topics";
import type { Article, ReaderPreferences } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const RANGES = [
  { days: 1, label: "Last 24 hours" },
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "Last week" },
  { days: 14, label: "Last 2 weeks" },
];

const q = (s: string) => `/search?q=${encodeURIComponent(s)}`;

function StoryLink({ story, timeZone }: { story: RecommendedStory; timeZone: string }) {
  const href = safeLinkUrl(story.url);
  return (
    <li className="group flex gap-3 border-t border-rule py-3">
      <div className="min-w-0 flex-1">
        <p className="kicker">{topicLabel(story.topics[0] ?? "world")}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="headline mt-1 block text-[1.05rem] group-hover:text-accent">
            {story.title}
            <span className="sr-only"> (opens {story.publisher} in a new tab)</span>
          </a>
        ) : (
          <p className="headline mt-1 text-[1.05rem]">{story.title}</p>
        )}
        <p className="meta mt-1">
          {story.publisher} · {formatTime(story.publishedAt, timeZone)}
          {story.publishers > 1 ? ` · covered by ${story.publishers} publishers` : ""}
        </p>
      </div>
      <Thumb src={story.imageUrl} alt={story.title} size="thumb" label={TOPICS[story.topics[0] ?? "world"].short} />
    </li>
  );
}

function RecommendationsPanel({ recs, prefs, following, timeZone }: { recs: Recommendations; prefs: ReaderPreferences; following: { topic: TopicId; stories: Article[] } | null; timeZone: string }) {
  const categories = (
      <section aria-labelledby="rec-cats">
        <h2 id="rec-cats" className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">Popular categories</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {POPULAR_CATEGORIES.map((t) => (
            <li key={t}>
              <Link href={`/search?topic=${t}`} className="chip">{TOPICS[t].label}</Link>
            </li>
          ))}
        </ul>
      </section>
  );
  if (recs.storyCount === 0) {
    return (
      <div className="space-y-6">
        {categories}
        <p className="font-sans text-sm text-muted">No recent live stories are stored yet, so there are no recommendations. Open your newspaper to fetch today&apos;s reporting, then come back.</p>
      </div>
    );
  }
  return (
    <div className="space-y-10">
      <section aria-labelledby="rec-topics">
        <h2 id="rec-topics" className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">Most covered topics · last {recs.windowHours} hours</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {recs.topTopics.map((t) => (
            <li key={t.topic}>
              <Link href={`/search?topic=${t.topic}&days=3`} className="chip">
                {t.label} <span className="text-muted">· {t.stories} stories</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {recs.suggestedQueries.length ? (
        <section aria-labelledby="rec-queries">
          <h2 id="rec-queries" className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">Suggested searches · names in several publishers&apos; headlines</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recs.suggestedQueries.map((s) => (
              <li key={s.query}>
                <Link href={q(s.query)} className="chip">
                  {s.query} <span className="text-muted">· {s.publishers} publishers</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {categories}

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
        <section aria-labelledby="rec-important">
          <h2 id="rec-important" className="border-b-2 border-ink pb-1 font-display text-2xl font-extrabold">Important right now</h2>
          <p className="mt-1 font-sans text-xs text-muted">Stories carried by the most publishers in the last {recs.windowHours} hours.</p>
          <ul className="mt-2">{recs.importantStories.map((s) => <StoryLink key={s.id} story={s} timeZone={timeZone} />)}</ul>
        </section>
        <div className="space-y-10">
          {following && following.stories.length ? (
            <section aria-labelledby="rec-following">
              <h2 id="rec-following" className="border-b-2 border-ink pb-1 font-display text-2xl font-extrabold">Because you follow {TOPICS[following.topic].label}</h2>
              <ul className="mt-2">
                {following.stories.map((a) => (
                  <StoryLink key={a.id} story={{ id: a.id, url: a.url, title: a.title, publisher: a.publisher, publishedAt: a.publishedAt, imageUrl: a.imageUrl, topics: a.topics, publishers: 1 }} timeZone={timeZone} />
                ))}
              </ul>
            </section>
          ) : null}
          {recs.mostCoveredThisWeek.length ? (
            <section aria-labelledby="rec-week">
              <h2 id="rec-week" className="border-b-2 border-ink pb-1 font-display text-2xl font-extrabold">Most covered this week</h2>
              <ul className="mt-2">{recs.mostCoveredThisWeek.slice(0, following ? 3 : 5).map((s) => <StoryLink key={s.id} story={s} timeZone={timeZone} />)}</ul>
            </section>
          ) : null}
        </div>
      </div>
      <p className="font-sans text-xs text-muted">Recommendations are computed from {recs.storyCount} stored stories and refreshed every few minutes. {prefs.sections.length ? "“Because you follow” uses your own sections and is never shown to anyone else." : ""}</p>
    </div>
  );
}

/**
 * "Search the web": live results from the GNews search API, clearly separated from DAYBREAK's own
 * collected news. Opt-in per search (a link), because each search spends the shared free quota.
 */
function WebResults({ web, query, days, sort, topic, publisher, storedIds, savedIds, timeZone }: { web: WebSearchResult | null; query: string; days: number; sort: string; topic?: string; publisher?: string; storedIds: Set<string>; savedIds: Set<string>; timeZone: string }) {
  if (!webSearchAvailable()) {
    return <p className="mt-8 font-sans text-xs text-muted">Web search is off on this server (it needs a GNews API key). Results above come from news DAYBREAK has already collected.</p>;
  }
  if (!web) {
    const href = `/search?${new URLSearchParams(Object.entries({ q: query, topic: topic ?? "", publisher: publisher ?? "", days: String(days), sort, web: "1" }).filter(([, v]) => v)).toString()}`;
    return (
      <div className="mt-8 border-t border-rule pt-5">
        <p className="font-sans text-sm text-ink-soft">Results above come from news DAYBREAK has already collected from its sources.</p>
        <Link href={href} className="btn btn-ghost mt-3">Also search the web for “{query}”</Link>
        <p className="meta mt-2">Uses the GNews search API (live, limited daily allowance).</p>
      </div>
    );
  }
  const fresh = web.articles.filter((a) => !storedIds.has(a.id));
  return (
    <section aria-labelledby="web-h" className="mt-10 border-t-2 border-ink pt-5">
      <h2 id="web-h" className="font-display text-2xl font-extrabold">From the wider web</h2>
      <p className="meta mt-1">
        Live results from GNews search for “{query}”, last {days} day{days === 1 ? "" : "s"}
        {web.fetchedAt ? ` · fetched ${formatTime(web.fetchedAt, timeZone)}${web.cached ? " (cached)" : ""}` : ""}. Each links to the publisher&apos;s original article; save any to add it to your collection.
      </p>
      {web.status !== "ok" ? (
        <p role="alert" className="mt-3 border border-warn bg-warn-soft px-3 py-2 font-sans text-sm text-warn">{web.message ?? "Web search is unavailable right now."}</p>
      ) : fresh.length ? (
        <ul className="mt-2 grid gap-x-8 md:grid-cols-2">
          {fresh.map((a) => (
            <ArticleRow key={a.id} article={a} timeZone={timeZone} saved={savedIds.has(a.id)} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 font-sans text-sm text-muted">{web.articles.length ? "Every web result is already in the results above." : "No web results for this search."}</p>
      )}
    </section>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { reader, prefs } = await requireReader("/search");
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const query = str(sp.q).slice(0, 120).trim();
  const topic = isTopicId(str(sp.topic)) ? (str(sp.topic) as TopicId) : undefined;
  const publisher = str(sp.publisher).slice(0, 80) || undefined;
  const days = RANGES.find((r) => String(r.days) === str(sp.days))?.days ?? 14;
  const sort = str(sp.sort) === "oldest" ? "oldest" : "newest";
  const searching = Boolean(query || topic || publisher);
  const wantWeb = str(sp.web) === "1" && query.length >= 2;

  const followTopic = prefs.sections[0] ?? null;
  // Independent reads run in parallel: public recommendations (cached), this reader's bookmarks,
  // and either the search itself or the reader's "because you follow" stories.
  const [recs, bookmarks, found, web] = await Promise.all([
    getRecommendations(reader.store).catch((err) => {
      log("search_recommendations_failed", { error: (err as Error).message?.slice(0, 200) });
      return null;
    }),
    reader.store.listBookmarks(reader.userId),
    (searching
      ? reader.store.listArticles({ text: query || undefined, topic, publisher, sinceHours: days * 24, sort, limit: 60 })
      : followTopic
        ? reader.store.listArticles({ topic: followTopic, sinceHours: 48, limit: 12 })
        : Promise.resolve([] as Article[])
    ).catch((err) => {
      log("search_failed", { error: (err as Error).message?.slice(0, 200) });
      return null;
    }),
    wantWeb ? searchWebNews(reader.store, query, days) : Promise.resolve(null),
  ]);
  if (web) log("web_search", { status: web.status, results: web.articles.length, cached: web.cached });
  const failed = found === null;
  const results = searching ? (found ?? []) : [];
  // Per-reader and computed per request — never cached or shared.
  const followingStories = searching ? [] : (found ?? []).filter((a) => !a.sample).slice(0, 3);
  const savedIds = new Set(bookmarks.map((b) => b.articleId));
  const publishers = [...new Set([...(recs?.publishers ?? []), ...(publisher ? [publisher] : [])])].sort((a, b) => a.localeCompare(b));
  const retryHref = `/search?${new URLSearchParams(Object.entries({ q: query, topic: topic ?? "", publisher: publisher ?? "", days: String(days), sort }).filter(([, v]) => v)).toString()}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Search</h1>
      <SearchShell initial={{ q: query, topic: topic ?? "", publisher: publisher ?? "", days: String(days), sort }} publishers={publishers} ranges={RANGES}>
        {failed ? (
          <div role="alert" className="border border-accent/30 bg-accent-soft px-4 py-3 font-sans text-sm text-accent">
            Search is unavailable right now. <a href={retryHref} className="font-semibold underline">Try again</a>
          </div>
        ) : !searching ? (
          recs ? (
            <RecommendationsPanel recs={recs} prefs={prefs} following={followTopic ? { topic: followTopic, stories: followingStories } : null} timeZone={prefs.timezone} />
          ) : (
            <p className="font-sans text-sm text-muted">Recommendations are unavailable right now — you can still search above.</p>
          )
        ) : (
          <section aria-labelledby="results-h">
            <h2 id="results-h" className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              {results.length === 60 ? "60+" : results.length} result{results.length === 1 ? "" : "s"}
              {query ? ` for “${query}”` : ""}
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
            {query ? <WebResults web={web} query={query} days={days} sort={sort} topic={topic} publisher={publisher} storedIds={new Set(results.map((a) => a.id))} savedIds={savedIds} timeZone={prefs.timezone} /> : null}
          </section>
        )}
      </SearchShell>
    </div>
  );
}
