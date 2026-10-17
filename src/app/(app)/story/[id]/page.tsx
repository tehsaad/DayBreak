import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { formatTime } from "@/components/paper/format";
import { Thumb } from "@/components/thumb";
import { log, rateLimit } from "@/lib/api";
import { aiHandle } from "@/lib/ai/handle";
import { analyseCoverage, coverageKey, isCoverageCached, type CitedPoint, type CoverageAnalysis } from "@/lib/ai/coverage";
import { findCoverage, type Coverage } from "@/lib/coverage/group";
import { displayExcerpt } from "@/lib/news/rights";
import { publicMemo } from "@/lib/public-cache";
import { safeLinkUrl } from "@/lib/security/url";
import { requireReader } from "@/lib/server/page-reader";
import { TOPICS, topicLabel } from "@/lib/topics";
import type { Article } from "@/lib/types";

export const metadata: Metadata = { title: "Full coverage", robots: { index: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const CONFIDENCE: Record<Coverage["confidence"], string> = {
  high: "Several publishers' headlines closely match — very likely the same event.",
  medium: "Headlines and names overlap — probably the same event. Check each report.",
  single: "Only one publisher in DAYBREAK's sources has reported this so far.",
};

function Cite({ ids, reports }: { ids: string[]; reports: Article[] }) {
  return (
    <span className="ml-1 font-sans text-xs">
      {ids.map((id) => {
        const r = reports.find((x) => x.id === id);
        return r ? (
          <a key={id} href={`#report-${id}`} className="mr-1 text-accent underline-offset-2 hover:underline">[{r.publisher}]</a>
        ) : null;
      })}
    </span>
  );
}

function PointList({ title, points, reports, empty }: { title: string; points: CitedPoint[]; reports: Article[]; empty: string }) {
  return (
    <section>
      <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted">{title}</h3>
      {points.length ? (
        <ul className="mt-2 space-y-2">
          {points.map((p, i) => (
            <li key={i} className="leading-relaxed text-ink-soft">{p.point}<Cite ids={p.sourceIds} reports={reports} /></li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm italic text-muted">{empty}</p>
      )}
    </section>
  );
}

async function Analysis({ coverage, userId }: { coverage: Coverage; userId: string }) {
  const ai = aiHandle();
  const reports = coverage.reports;
  if (!ai) {
    return (
      <div className="border border-dashed border-rule p-5">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-muted">Basic source grouping — no AI analysis</p>
        <p className="mt-2 text-ink-soft">
          AI analysis isn&apos;t configured on this deployment, so DAYBREAK can&apos;t say what these reports agree or differ on. Below are the {reports.length} report{reports.length === 1 ? "" : "s"} it grouped by headline and names, in the order they were published — read them side by side.
        </p>
      </div>
    );
  }
  if (reports.length < 2) {
    return <p className="border border-dashed border-rule p-5 text-ink-soft">There&apos;s only one report so far, so there&apos;s nothing to compare yet. Check back later or read the original below.</p>;
  }
  const key = coverageKey(ai.modelId, reports);
  if (!isCoverageCached(key) && !rateLimit("biggerPicture", `coverage:${userId}`).ok) {
    return <p className="border border-dashed border-rule p-5 text-ink-soft">You&apos;ve opened a lot of analyses in a short time. Please try again in a few minutes — the reports below are all available.</p>;
  }
  let analysis: CoverageAnalysis;
  try {
    analysis = await analyseCoverage(ai.model, ai.modelId, reports, { timeoutMs: ai.timeoutMs });
  } catch (err) {
    log("coverage_analysis_failed", { error: (err as Error).message?.slice(0, 200) });
    return <p className="border border-dashed border-rule p-5 text-ink-soft">The AI analysis is unavailable right now. The reports below are unaffected.</p>;
  }
  return (
    <div className="space-y-6 border border-ink bg-paper-card p-5">
      <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-accent">AI analysis · {analysis.model}</p>
      {analysis.overview ? <p className="font-display text-xl leading-relaxed">{analysis.overview}</p> : <p className="italic text-muted">The reports contain too little detail for an overview.</p>}
      <div className="grid gap-6 md:grid-cols-3">
        <PointList title="What sources agree on" points={analysis.agree} reports={reports} empty="No point is clearly stated by more than one report." />
        <PointList title="What differs between reports" points={analysis.differ} reports={reports} empty="No substantive differences in what these reports state." />
        <PointList title="What remains uncertain" points={analysis.uncertain} reports={reports} empty="Nothing flagged — but these are early reports; read the originals." />
      </div>
      {analysis.background ? (
        <section>
          <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted">Background</h3>
          <p className="mt-2 leading-relaxed text-ink-soft">{analysis.background}</p>
        </section>
      ) : null}
      <p className="border-t border-rule pt-3 font-sans text-xs text-muted">
        Written by AI from the headlines and short excerpts above, and checked so that every point cites a report and no figure appears that the cited reports don&apos;t contain{analysis.dropped ? ` (${analysis.dropped} unsupported point${analysis.dropped === 1 ? " was" : "s were"} removed)` : ""}. It is not a fact-check: open the originals.
      </p>
    </div>
  );
}

export default async function StoryPage({ params }: PageProps<"/story/[id]">) {
  const { id } = await params;
  const { reader, prefs } = await requireReader(`/story/${id}`);
  if (!/^[a-z0-9-]{6,64}$/i.test(id)) notFound();
  const [found] = await reader.store.getArticles([id]);
  if (!found) notFound();
  // Shared public news pool, computed once per instance every few minutes.
  const pool = await publicMemo("coverage-pool", 5 * 60_000, () => reader.store.listArticles({ sinceHours: 96, limit: 1500 }));
  const coverage = findCoverage(found, pool);
  const tz = prefs.timezone;
  const reports = coverage.reports;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/newspaper" className="inline-flex items-center gap-1 font-sans text-sm text-muted hover:text-ink"><ArrowLeft size={14} aria-hidden /> Back to your newspaper</Link>
      <header className="mt-4 border-b-2 border-ink pb-4">
        <p className="kicker">Full coverage · {topicLabel(found.topics[0] ?? "world")}</p>
        <h1 className="headline mt-2 text-[clamp(1.9rem,4vw,3rem)]">{found.title}</h1>
        <p className="meta mt-2">
          {reports.length} publisher{reports.length === 1 ? "" : "s"}
          {coverage.firstSeen ? ` · first reported ${formatTime(coverage.firstSeen, tz)}` : ""}
          {coverage.lastSeen && coverage.lastSeen !== coverage.firstSeen ? ` · latest ${formatTime(coverage.lastSeen, tz)}` : ""}
        </p>
        <p className="mt-2 font-sans text-xs text-muted">{CONFIDENCE[coverage.confidence]}</p>
      </header>

      <div className="mt-6">
        <Suspense
          fallback={
            <div className="space-y-2 border border-rule p-5" aria-busy="true" aria-label="Loading analysis">
              <div className="h-4 w-40 skeleton" /><div className="h-5 w-11/12 skeleton" /><div className="h-5 w-9/12 skeleton" />
            </div>
          }
        >
          <Analysis coverage={coverage} userId={reader.userId} />
        </Suspense>
      </div>

      <section aria-labelledby="reports-h" className="mt-10">
        <h2 id="reports-h" className="border-b border-ink pb-1 font-display text-2xl font-extrabold">How each publisher reported it</h2>
        <ol className="mt-4 grid gap-5 md:grid-cols-2">
          {reports.map((r, i) => {
            const href = safeLinkUrl(r.url);
            const next = reports[(i + 1) % reports.length];
            return (
              <li key={r.id} id={`report-${r.id}`} className="group scroll-mt-24 border border-rule bg-paper-card p-4">
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent">{r.publisher}</p>
                    <h3 className="headline mt-1 text-xl">{r.title}</h3>
                    <p className="meta mt-1">{formatTime(r.publishedAt, tz)}</p>
                  </div>
                  <Thumb src={r.imageUrl} alt={r.title} size="thumb" label={TOPICS[r.topics[0] ?? "world"].short} />
                </div>
                {displayExcerpt(r.description, r.sourceId) ? <p className="mt-2 text-sm text-ink-soft">“{displayExcerpt(r.description, r.sourceId)}”</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-xs">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                      Read at {r.publisher} <ArrowUpRight size={13} aria-hidden /><span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : null}
                  {reports.length > 1 && next ? <a href={`#report-${next.id}`} className="text-muted underline-offset-2 hover:text-ink hover:underline">Explore another perspective → {next.publisher}</a> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {reports.length > 1 ? (
        <section aria-labelledby="timeline-h" className="mt-10">
          <h2 id="timeline-h" className="border-b border-ink pb-1 font-display text-2xl font-extrabold">Timeline of reports</h2>
          <ol className="mt-3 border-l-2 border-rule pl-4">
            {reports.map((r) => (
              <li key={r.id} className="py-1.5 text-sm"><span className="font-sans text-xs font-semibold text-muted">{formatTime(r.publishedAt, tz)}</span> · {r.publisher}: <a href={`#report-${r.id}`} className="hover:underline">{r.title}</a></li>
            ))}
          </ol>
          <p className="mt-2 font-sans text-xs text-muted">Publication times from each publisher&apos;s feed — when they reported, not when events happened.</p>
        </section>
      ) : null}

      {coverage.related.length ? (
        <section aria-labelledby="related-h" className="mt-10">
          <h2 id="related-h" className="border-b border-ink pb-1 font-display text-2xl font-extrabold">Related stories</h2>
          <p className="mt-1 font-sans text-xs text-muted">Similar subject, but not confirmed to be the same event.</p>
          <ul className="mt-3 grid gap-x-8 md:grid-cols-2">
            {coverage.related.map((r) => (
              <li key={r.id} className="border-t border-rule py-3">
                <Link href={`/story/${r.id}`} className="headline text-lg hover:text-accent">{r.title}</Link>
                <p className="meta mt-1">{r.publisher} · {formatTime(r.publishedAt, tz)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
