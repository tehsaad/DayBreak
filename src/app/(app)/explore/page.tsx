import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { ArticleRow, FollowTopicButton } from "@/components/article-row";
import { formatEditionDate } from "@/components/paper/format";
import { findEarlierCoverage } from "@/lib/edition/evidence";
import { planEdition, clusterArticles } from "@/lib/rank/plan";
import { emptyLearnedProfile } from "@/lib/rank/learning";
import { freshness } from "@/lib/rank/score";
import { publicMemo } from "@/lib/public-cache";
import { safeLinkUrl } from "@/lib/security/url";
import { requireReader } from "@/lib/server/page-reader";
import { TOPICS, TOPIC_IDS, isTopicId, topicLabel } from "@/lib/topics";
import type { Article, Edition } from "@/lib/types";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const { reader, prefs } = await requireReader("/explore");
  const sp = await searchParams;
  const topicParam = typeof sp.topic === "string" && isTopicId(sp.topic) ? sp.topic : undefined;
  const sort = sp.sort === "covered" ? "covered" : "newest";
  const tz = prefs.timezone;

  // The shared news pool and its same-event clusters are public, so they're computed once per
  // server instance every few minutes; everything per-reader below is computed per request.
  const [{ livePool, clusterMap }, editions, bookmarks] = await Promise.all([
    publicMemo("explore-pool", 5 * 60_000, async () => {
      const live = (await reader.store.listArticles({ sinceHours: 36, limit: 1200 })).filter((a) => !a.sample);
      return { livePool: live, clusterMap: clusterArticles(live) };
    }),
    reader.store.listEditions(reader.userId, 6),
    reader.store.listBookmarks(reader.userId),
  ]);
  const savedIds = new Set(bookmarks.map((b) => b.articleId));

  // Browse by topic: every topic (not only followed ones), newest or most widely covered first.
  const topicCounts = new Map<string, number>();
  for (const a of livePool) if (a.topics[0]) topicCounts.set(a.topics[0], (topicCounts.get(a.topics[0]) ?? 0) + 1);
  const browse = topicParam
    ? livePool
        .filter((a) => a.topics.includes(topicParam) && !prefs.mutedTopics.includes(a.topics[0]!))
        .sort((a, b) =>
          sort === "covered"
            ? (clusterMap.get(b.id)?.publishers.size ?? 1) - (clusterMap.get(a.id)?.publishers.size ?? 1) || Date.parse(b.publishedAt ?? b.collectedAt) - Date.parse(a.publishedAt ?? a.collectedAt)
            : Date.parse(b.publishedAt ?? b.collectedAt) - Date.parse(a.publishedAt ?? a.collectedAt),
        )
        .filter((a, i, arr) => arr.findIndex((x) => clusterMap.get(x.id) === clusterMap.get(a.id)) === i)
        .slice(0, 12)
    : [];

  // One story, many newsrooms: clusters reported by 3+ publishers.
  const clusters = [...new Set(clusterMap.values())]
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
  const full = (await Promise.all(editions.slice(0, 6).map((e) => reader.store.getEdition(reader.userId, e.id)))).filter((e): e is Edition => Boolean(e));
  const latest = full[0];
  const history = full.filter((e) => latest && e.editionDate !== latest.editionDate);
  const threads = latest
    ? latest.stories.map((s) => ({ story: s, earlier: findEarlierCoverage(s.article, history, 3) })).filter((t) => t.earlier.length > 0).slice(0, 5)
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Explore</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Look beyond today&apos;s edition: browse every topic, follow new ones, compare how different newsrooms cover the same story, and follow threads across your archive.</p>
      <p className="mt-2 font-sans text-sm"><Link href="/search" className="inline-flex items-center gap-1 text-accent underline"><Search size={14} aria-hidden /> Search stored reporting</Link></p>

      <section aria-labelledby="topics-h" className="mt-10">
        <div className="border-b-2 border-ink pb-1.5">
          <h2 id="topics-h" className="font-display text-3xl font-extrabold">Browse by topic</h2>
        </div>
        <p className="mt-2 text-sm text-ink-soft">Every topic DAYBREAK covers — including ones you don&apos;t follow yet. Following a topic adds it as a section of your paper; you can unfollow at any time.</p>
        <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOPIC_IDS.map((t) => {
            const muted = prefs.mutedTopics.includes(t);
            return (
              <li key={t} className="flex items-center justify-between gap-3 border-b border-rule py-2">
                <Link href={`/explore?topic=${t}${sort === "covered" ? "&sort=covered" : ""}#topics-h`} aria-current={topicParam === t ? "page" : undefined} className={`font-sans text-sm ${topicParam === t ? "font-semibold text-accent" : "text-ink hover:text-accent"}`}>
                  {TOPICS[t].label} <span className="text-muted">· {topicCounts.get(t) ?? 0}</span>
                </Link>
                {muted ? <span className="font-sans text-xs text-muted">Muted</span> : <FollowTopicButton topic={t} label={TOPICS[t].label} following={prefs.sections.includes(t)} />}
              </li>
            );
          })}
        </ul>
        {topicParam ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-2xl font-bold">{TOPICS[topicParam].label}</h3>
              <nav aria-label="Sort" className="flex gap-2 font-sans text-xs">
                <Link href={`/explore?topic=${topicParam}#topics-h`} className="chip !py-1" aria-current={sort === "newest" ? "true" : undefined}>Newest</Link>
                <Link href={`/explore?topic=${topicParam}&sort=covered#topics-h`} className="chip !py-1" aria-current={sort === "covered" ? "true" : undefined}>Most covered</Link>
              </nav>
            </div>
            {browse.length ? (
              <ul className="mt-2 grid gap-x-8 md:grid-cols-2">{browse.map((a) => <ArticleRow key={a.id} article={a} timeZone={tz} saved={savedIds.has(a.id)} />)}</ul>
            ) : (
              <p className="mt-3 italic text-muted">No stories in this topic in the last 36 hours.</p>
            )}
          </div>
        ) : null}
      </section>

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
                  <Link href={`/newspaper/${latest!.id}#story-${story.article.id}`} className="headline text-xl hover:text-accent">{story.article.title}</Link>
                </div>
                <ul className="border-l-2 border-rule pl-4">
                  {earlier.map((e) => (
                    <li key={e.editionId + e.title} className="py-1 text-sm">
                      <Link href={`/newspaper/${e.editionId}`} className="font-sans text-xs font-semibold text-muted hover:text-ink">{formatEditionDate(e.editionDate, "short")}</Link>{" "}
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
        {bubble.length ? <ul className="mt-2 grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">{bubble.map((a) => <ArticleRow key={a.id} article={a} timeZone={tz} saved={savedIds.has(a.id)} />)}</ul> : <p className="mt-4 italic text-muted">You already follow every section with recent stories.</p>}
      </section>
    </div>
  );
}
