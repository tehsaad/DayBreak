import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { formatEditionDate, formatTime } from "@/components/paper/format";
import { findEarlierCoverage } from "@/lib/edition/evidence";
import { planEdition, clusterArticles } from "@/lib/rank/plan";
import { emptyLearnedProfile } from "@/lib/rank/learning";
import { freshness } from "@/lib/rank/score";
import { safeLinkUrl } from "@/lib/security/url";
import { requireReader } from "@/lib/server/page-reader";
import { getServiceStore } from "@/lib/store";
import { TOPICS, TOPIC_IDS, isTopicId, topicLabel } from "@/lib/topics";
import type { Article, Edition } from "@/lib/types";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

function ArticleLine({ a, tz }: { a: Article; tz: string }) {
  const href = safeLinkUrl(a.url);
  return (
    <li className="border-t border-rule py-3">
      <p className="kicker">{topicLabel(a.topics[0] ?? "world")}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="headline mt-1 inline-flex items-start gap-1 text-lg hover:text-accent">
          {a.title} <ArrowUpRight size={14} className="mt-1.5 shrink-0" aria-hidden />
        </a>
      ) : (
        <p className="headline mt-1 text-lg">{a.title}</p>
      )}
      <p className="meta mt-1">{a.publisher} · {formatTime(a.publishedAt, tz)}{a.sample ? " · Sample" : ""}</p>
      {a.description ? <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{a.description}</p> : null}
    </li>
  );
}

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const { reader, prefs } = await requireReader("/explore");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120).trim() : "";
  const topicParam = typeof sp.topic === "string" && isTopicId(sp.topic) ? sp.topic : undefined;
  const tz = prefs.timezone;
  const news = getServiceStore();

  const [results, pool, editions] = await Promise.all([
    q || topicParam ? news.listArticles({ text: q || undefined, topic: topicParam, sinceHours: 24 * 14, limit: 40 }) : Promise.resolve([] as Article[]),
    news.listArticles({ sinceHours: 36, limit: 1200 }),
    reader.store.listEditions(reader.userId, 8),
  ]);
  const livePool = pool.filter((a) => !a.sample);

  // One story, many newsrooms: clusters reported by 3+ publishers.
  const clusters = [...new Set(clusterArticles(livePool).values())]
    .filter((c) => c.publishers.size >= 3)
    .sort((a, b) => b.publishers.size - a.publishers.size)
    .slice(0, 4)
    .map((c) => {
      const perPublisher = new Map<string, Article>();
      for (const m of c.members.sort((x, y) => Date.parse(y.publishedAt ?? y.collectedAt) - Date.parse(x.publishedAt ?? x.collectedAt))) if (!perPublisher.has(m.publisher)) perPublisher.set(m.publisher, m);
      return [...perPublisher.values()].slice(0, 5);
    });

  // Outside your bubble: fresh, well-covered stories from sections you don't follow.
  const outside = livePool.filter((a) => a.topics[0] && !prefs.sections.includes(a.topics[0]) && !prefs.mutedTopics.includes(a.topics[0]));
  const bubblePlan = planEdition({ articles: outside, prefs: { ...prefs, sections: [], interests: [] }, learned: emptyLearnedProfile(), now: new Date() });
  const bubble = bubblePlan.stories.slice(0, 6).map((s) => s.scored.article).sort((a, b) => freshness(b, new Date()) - freshness(a, new Date()));

  // Story threads: today's stories that continue coverage from your earlier editions.
  const full = (await Promise.all(editions.slice(0, 8).map((e) => reader.store.getEdition(reader.userId, e.id)))).filter((e): e is Edition => Boolean(e));
  const latest = full[0];
  const history = full.filter((e) => latest && e.editionDate !== latest.editionDate);
  const threads = latest
    ? latest.stories.map((s) => ({ story: s, earlier: findEarlierCoverage(s.article, history, 3) })).filter((t) => t.earlier.length > 0).slice(0, 5)
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Explore</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Look beyond today&apos;s edition: search two weeks of reporting, compare how different newsrooms cover the same story, and follow threads across your archive.</p>

      <form action="/explore" className="mt-6 flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search recent reporting</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} className="input !pl-9" placeholder="Search headlines and excerpts, e.g. scholarships, IMF, glaciers" />
        </label>
        <select name="topic" defaultValue={topicParam ?? ""} className="input sm:w-56" aria-label="Section">
          <option value="">All sections</option>
          {TOPIC_IDS.map((t) => (
            <option key={t} value={t}>{TOPICS[t].label}</option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {q || topicParam ? (
        <section aria-labelledby="results-h" className="mt-8">
          <h2 id="results-h" className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {results.length} result{results.length === 1 ? "" : "s"}{q ? ` for “${q}”` : ""}{topicParam ? ` in ${TOPICS[topicParam].label}` : ""}
          </h2>
          {results.length ? (
            <ul className="mt-2 grid gap-x-8 md:grid-cols-2">{results.map((a) => <ArticleLine key={a.id} a={a} tz={tz} />)}</ul>
          ) : (
            <p className="mt-3 italic text-muted">Nothing found in the last two weeks of collected reporting. Try a broader word.</p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="compare-h" className="mt-12">
        <div className="border-b-2 border-ink pb-1.5">
          <h2 id="compare-h" className="font-display text-3xl font-extrabold">One story, many newsrooms</h2>
        </div>
        <p className="mt-2 text-sm text-ink-soft">The same event as headlined by different publishers in the last 36 hours. Notice what each chooses to emphasise.</p>
        {clusters.length === 0 ? (
          <p className="mt-4 italic text-muted">No story has been covered by three or more publishers in the current window.</p>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            {clusters.map((members, i) => (
              <article key={i} className="border border-rule bg-paper-card p-5">
                <p className="kicker">{topicLabel(members[0]!.topics[0] ?? "world")} · {members.length} publishers</p>
                <ul className="mt-2 space-y-3">
                  {members.map((m) => (
                    <li key={m.id}>
                      <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{m.publisher}</p>
                      <a href={safeLinkUrl(m.url) ?? "#"} target="_blank" rel="noopener noreferrer" className="headline text-lg hover:text-accent hover:underline">{m.title}</a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="threads-h" className="mt-12">
        <div className="border-b-2 border-ink pb-1.5">
          <h2 id="threads-h" className="font-display text-3xl font-extrabold">Story threads</h2>
        </div>
        <p className="mt-2 text-sm text-ink-soft">Stories in your latest edition that continue coverage from your earlier papers — matched by headline and the names they share.</p>
        {threads.length === 0 ? (
          <p className="mt-4 italic text-muted">{history.length ? "None of your latest stories continue an earlier thread." : "Threads appear once you have editions from more than one day."}</p>
        ) : (
          <ol className="mt-5 space-y-6">
            {threads.map(({ story, earlier }) => (
              <li key={story.article.id} className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <div>
                  <p className="kicker">Latest · {latest ? formatEditionDate(latest.editionDate, "short") : ""}</p>
                  <Link href={`/paper/${latest!.id}#story-${story.article.id}`} className="headline text-xl hover:text-accent">{story.article.title}</Link>
                </div>
                <ul className="border-l-2 border-rule pl-4">
                  {earlier.map((e) => (
                    <li key={e.editionId + e.title} className="py-1 text-sm">
                      <Link href={`/paper/${e.editionId}`} className="font-sans text-xs font-semibold text-muted hover:text-ink">{formatEditionDate(e.editionDate, "short")}</Link>{" "}
                      <span className="text-ink-soft">{e.title}</span> <span className="meta">({e.publisher})</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="bubble-h" className="mt-12">
        <div className="border-b-2 border-ink pb-1.5">
          <h2 id="bubble-h" className="font-display text-3xl font-extrabold">Outside your bubble</h2>
        </div>
        <p className="mt-2 text-sm text-ink-soft">Widely covered stories from sections you don&apos;t follow. Like one? Save it — DAYBREAK will notice.</p>
        {bubble.length ? <ul className="mt-2 grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">{bubble.map((a) => <ArticleLine key={a.id} a={a} tz={tz} />)}</ul> : <p className="mt-4 italic text-muted">You already follow every section with recent stories.</p>}
      </section>
    </div>
  );
}
