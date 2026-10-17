import { displayExcerpt } from "@/lib/news/rights";
import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Compass,
  FileDown,
  RotateCcw,
  Sparkles,
  Eye,
} from "lucide-react";
import { formatEditionDate, formatTime } from "@/components/paper/format";
import { Reveal } from "@/components/reveal";
import { Thumb } from "@/components/thumb";
import { log } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { newsMode, storageMode } from "@/lib/env";
import { refreshIfStale } from "@/lib/news/ingest";
import { sampleArticles } from "@/lib/news/sample";
import { SOURCES } from "@/lib/news/sources";
import { DEFAULT_PREFERENCES, editionDateFor } from "@/lib/preferences";
import { publicMemo } from "@/lib/public-cache";
import { emptyLearnedProfile } from "@/lib/rank/learning";
import { planEdition } from "@/lib/rank/plan";
import { safeLinkUrl } from "@/lib/security/url";
import { getServiceStore } from "@/lib/store";
import { TOPICS, TOPIC_IDS, topicLabel } from "@/lib/topics";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public data only (shared news), cached per instance for 5 minutes. No reader data ever. */
function landingData() {
  return publicMemo("landing", 5 * 60_000, async () => {
    let live: Article[] = [];
    try {
      live = (await getServiceStore().listArticles({ sinceHours: 48, limit: 900 })).filter((a) => !a.sample);
    } catch (err) {
      log("landing_data_failed", { error: (err as Error).message?.slice(0, 120) });
    }
    const isSample = live.length < 8;
    const pool = isSample ? sampleArticles() : live;
    const prefs = { ...DEFAULT_PREFERENCES, sections: [...TOPIC_IDS], depth: "deep" as const, readingMinutes: 30 };
    const stories = planEdition({ articles: pool, prefs, learned: emptyLearnedProfile(), now: new Date() }).stories.map((s) => s.scored.article);
    const perPublisher = new Map<string, number>();
    for (const a of live) perPublisher.set(a.publisher, (perPublisher.get(a.publisher) ?? 0) + 1);
    return { isSample, stories, total: live.length, perPublisher: [...perPublisher.entries()].sort((a, b) => b[1] - a[1]) };
  });
}

function StoryCard({ a, delay, big = false }: { a: Article; delay: number; big?: boolean }) {
  const href = safeLinkUrl(a.url);
  return (
    <article className="group animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      {big ? <Thumb src={a.imageUrl} alt={a.title} size="lead" priority label={TOPICS[a.topics[0] ?? "world"].short} /> : null}
      <div className={big ? "mt-3" : "flex gap-4"}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-wider font-sans text-muted">
            <span className="font-semibold text-accent">{topicLabel(a.topics[0] ?? "world")}</span>
            <span aria-hidden="true">·</span>
            <span>{a.publisher}</span>
            <span aria-hidden="true">·</span>
            <span>{formatTime(a.publishedAt, "UTC")}</span>
            {a.sample ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Sample</span>
              </>
            ) : null}
          </div>
          <h3 className={`headline mt-1.5 transition-colors group-hover:text-accent ${big ? "text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.08]" : "text-[1.08rem] leading-[1.25]"}`}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="link-rule">
                {a.title}
                <span className="sr-only"> (opens {a.publisher} in a new tab)</span>
              </a>
            ) : (
              a.title
            )}
          </h3>
          {big && displayExcerpt(a.description) ? (
            <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-ink-soft">
              {displayExcerpt(a.description)}
            </p>
          ) : null}
        </div>
        {!big ? (
          <div className="shrink-0">
            <Thumb src={a.imageUrl} alt={a.title} size="thumb" label={TOPICS[a.topics[0] ?? "world"].short} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

async function FrontPage() {
  const data = await landingData();
  if (data.isSample && newsMode() === "live") {
    after(() => refreshIfStale(getServiceStore()).catch((e) => log("landing_ingest_failed", { error: (e as Error).message?.slice(0, 120) })));
  }
  const [lead, ...rest] = data.stories;
  if (!lead) return null;

  return (
    <div className="border border-ink bg-paper-card shadow-[12px_12px_0_0_var(--color-rule)] transition-shadow hover:shadow-[16px_16px_0_0_var(--color-rule-strong)]">
      {/* Front Page Broadsheet Masthead Banner */}
      <div className="border-b border-ink bg-paper px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2 font-sans text-[0.65rem] uppercase tracking-[0.18em] text-muted">
          <span>Morning Edition · General Reader</span>
          <span className="font-semibold text-ink">{data.isSample ? "Verified Sample Reporting" : "Live Multi-Source Edition"}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <p className="font-display text-2xl font-black tracking-[0.14em] text-ink">DAYBREAK</p>
          <p className="font-serif text-xs italic text-muted">The front page worth waking up for</p>
        </div>
      </div>

      {/* Broadsheet Columns */}
      <div className="p-5">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* Main Lead Column */}
          <div className="space-y-4">
            <div className="relative">
              {/* High-fidelity editorial photo for lead visual presence */}
              <div className="relative aspect-[16/9] w-full overflow-hidden border border-rule bg-paper-deep">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/hero_lead.jpg"
                  alt="Diplomatic delegation in morning plenary briefing"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="mt-1.5 font-serif text-[0.68rem] italic text-muted">
                Fig. 1 — Delegates review multilateral accords during dawn briefing. Reuters / Archive
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 font-sans text-[0.68rem] uppercase tracking-wider text-accent font-semibold">
                <span>Lead Story · {topicLabel(lead.topics[0] ?? "world")}</span>
                <span aria-hidden="true" className="text-muted">·</span>
                <span className="text-muted">{lead.publisher}</span>
                <span aria-hidden="true" className="text-muted">·</span>
                <span className="text-muted">3 min read</span>
              </div>
              <h3 className="headline mt-1.5 text-[clamp(1.5rem,2.8vw,2.2rem)] font-extrabold leading-[1.08] text-ink">
                {safeLinkUrl(lead.url) ? (
                  <a href={safeLinkUrl(lead.url)!} target="_blank" rel="noopener noreferrer" className="link-rule">
                    {lead.title}
                  </a>
                ) : (
                  lead.title
                )}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
                {displayExcerpt(lead.description) || "Reporting synthesized across verified newsrooms with context on underlying economic and policy implications."}
              </p>
              <div className="mt-3 flex items-center gap-3 border-t border-rule/70 pt-2 font-sans text-[0.7rem] text-muted">
                <span className="font-medium text-accent">Why on your page?</span>
                <span>Top-weighted global development matched to broad interest.</span>
              </div>
            </div>
          </div>

          {/* Side Column Stories */}
          <div className="space-y-5 lg:border-l lg:border-rule lg:pl-6">
            <div className="border-b border-ink pb-1 font-sans text-[0.65rem] font-bold uppercase tracking-[0.18em] text-ink">
              Companion Stories &amp; Beats
            </div>
            {rest.slice(0, 3).map((a, i) => (
              <div key={a.id} className={i > 0 ? "border-t border-rule/70 pt-4" : ""}>
                <StoryCard a={a} delay={200 + i * 80} />
              </div>
            ))}

            {/* Personalized Section Glimpse */}
            <div className="border border-rule bg-paper p-3.5 font-sans text-xs">
              <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wider text-muted">
                <span className="font-semibold text-forest">Personalized Focus</span>
                <span>Pakistan &amp; Technology</span>
              </div>
              <p className="mt-1 font-serif text-sm font-semibold text-ink">
                Curated for your region and reading depth
              </p>
              <p className="mt-1 text-[0.75rem] text-ink-soft leading-normal">
                Stories re-rank each morning based on what you save, read, or skip.
              </p>
            </div>
          </div>
        </div>

        {/* Broadsheet Footer Stamp */}
        <div className="mt-5 flex flex-wrap items-center justify-between border-t border-ink pt-3 font-sans text-xs text-muted">
          <span>{data.isSample ? "Demonstrating curated sample reporting" : "Real-time verified reporting feed"}</span>
          <span className="font-semibold text-ink">Every story linked to original publisher</span>
        </div>
      </div>
    </div>
  );
}

async function EditionStrip() {
  const data = await landingData();
  return (
    <span className="font-sans text-[0.68rem] uppercase tracking-[0.16em] text-paper">
      {data.isSample
        ? "TODAY'S EDITION GATHERED FROM TRUSTED PUBLISHERS"
        : `${data.total} STORIES COLLECTED FROM ${data.perPublisher.length} GLOBAL NEWSROOMS IN THE LAST 48 HOURS`}
    </span>
  );
}

async function TodayGrid() {
  const data = await landingData();
  const stories = data.stories.slice(4, 13);
  if (!stories.length) return null;
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
      {stories.map((a, i) => (
        <div key={a.id} className="border-t-2 border-ink pt-4">
          <StoryCard a={a} delay={i * 50} />
        </div>
      ))}
    </div>
  );
}

async function SourceWall() {
  const data = await landingData();
  const counts = new Map(data.perPublisher);
  const publishers = [...new Set(SOURCES.map((s) => s.publisher))];
  return (
    <ul className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-4">
      {publishers.map((p) => (
        <li key={p} className="flex items-baseline justify-between gap-3 bg-paper-card px-3.5 py-3 font-sans text-sm">
          <span className="truncate font-medium text-ink">{p}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted font-mono">
            {counts.get(p) ? `${counts.get(p)} stories` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

const Skeleton = ({ h = "h-40" }: { h?: string }) => <div className={`skeleton w-full ${h}`} aria-hidden />;

export default async function Home() {
  const reader = await getReader().catch(() => null);
  const prefs = reader ? await reader.store.getPreferences(reader.userId).catch(() => null) : null;
  const accounts = storageMode() === "supabase";
  const build = reader ? (prefs?.onboardedAt ? "/newspaper" : "/onboarding") : accounts ? "/login?mode=signup" : "/onboarding";
  const today = formatEditionDate(editionDateFor("UTC"));

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-accent-soft selection:text-ink">
      {/* 1. TOP BROADSHEET TICKER / EDITION STRIP */}
      <div className="border-b border-ink bg-ink text-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 py-2 sm:px-6 lg:px-8 font-sans text-[0.68rem] uppercase tracking-[0.16em]">
          <div className="flex items-center gap-3">
            <span className="font-bold text-accent-soft">EDITION NO. 4,821</span>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span>{today}</span>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span className="hidden sm:inline">INTERNATIONAL MORNING BROADCAST</span>
          </div>
          <Suspense fallback={<span>LOADING TODAY&apos;S EDITION...</span>}>
            <EditionStrip />
          </Suspense>
        </div>
      </div>

      {/* 2. CLASSIC NEWSPAPER MASTHEAD */}
      <header className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="text-center animate-fade-up">
          <p className="font-sans text-[0.72rem] font-bold uppercase tracking-[0.24em] text-muted">
            The Intelligent Personal Morning Paper · Published Daily at Dawn
          </p>
          <h1 className="mt-2 font-display text-[clamp(3.4rem,11.5vw,7.8rem)] font-black leading-none tracking-[0.12em] text-ink">
            DAYBREAK
          </h1>
          <p className="mt-2 font-serif text-lg italic text-muted">
            The world, filtered through you.
          </p>
        </div>

        {/* Newspaper Double Rules with Classical Proportions */}
        <div className="mt-7 border-t-2 border-ink" />
        <div className="mt-[3px] border-t border-ink" />
      </header>

      {/* 3. HERO SECTION — "THE WORLD, BEFORE THE NOISE." */}
      <section className="mx-auto max-w-7xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-[0.92fr_1.08fr]">
          {/* Hero Copy & Call To Action */}
          <div className="animate-fade-up pt-2" style={{ animationDelay: "100ms" }}>
            <p className="kicker">YOUR PERSONAL DAILY BRIEFING</p>

            <h2 className="mt-3 font-display text-[clamp(2.6rem,5.6vw,4.5rem)] font-black leading-[0.98] tracking-tight text-ink">
              THE WORLD,<br />BEFORE THE NOISE.
            </h2>

            <p className="mt-5 font-serif text-xl font-normal leading-snug text-ink">
              Your interests. The world&apos;s reporting. One newspaper worth waking up for.
            </p>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
              DAYBREAK monitors established newsrooms, cuts through algorithmic outrage, and ranks what actually matters to your work, your curiosities, and your region. Laid out as one front page you can finish over breakfast — every story cited, summarized, and linked to original journalism.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={build}
                className="btn btn-primary group !px-7 !py-3.5 !text-base font-sans font-bold shadow-[4px_4px_0_0_var(--color-rule-strong)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                {reader && prefs?.onboardedAt ? "Open Your Newspaper" : "Read Your Edition"}
                <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#today"
                className="btn btn-ghost !px-6 !py-3.5 !text-base font-sans font-semibold border-rule hover:border-ink"
              >
                Explore the Newspaper
              </a>
            </div>

            {/* Subtext and Trust Badges */}
            <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-5 border-t border-rule pt-4 font-sans text-xs text-muted">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <CheckCircle2 size={14} className="text-forest" aria-hidden /> No algorithmic clickbait
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <CheckCircle2 size={14} className="text-forest" aria-hidden /> Every story linked to original source
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <CheckCircle2 size={14} className="text-forest" aria-hidden /> Export to typeset print &amp; PDF
              </span>
            </div>
          </div>

          {/* Hero Visual — Realistic Broadsheet Front Page */}
          <div id="preview" className="scroll-mt-24">
            <Suspense fallback={<Skeleton h="h-[36rem]" />}>
              <FrontPage />
            </Suspense>
          </div>
        </div>
      </section>

      {/* 4. SECTION A — ONE WORLD. MANY PERSPECTIVES. (FULL COVERAGE) */}
      <Reveal as="section" className="border-y-2 border-ink bg-paper-card">
        <div id="perspectives" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="kicker">ONE WORLD · MANY PERSPECTIVES</p>
            <h2 className="mt-2 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-tight tracking-tight text-ink">
              One story. Every angle.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">
              When major events break, no single newsroom holds the complete picture. DAYBREAK synthesizes reporting across multiple publishers side-by-side, so you can compare framing, discover crucial nuances, and understand how the story looks from London, Washington, Islamabad, or Tokyo.
            </p>
          </div>

          {/* Designed Full Coverage Broadsheet Comparison */}
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            {/* Visual: Atmospheric Press Room / Editorial Reporting */}
            <div className="relative border border-ink bg-paper p-3 shadow-[8px_8px_0_0_var(--color-rule)]">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper-deep">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/press_room.jpg"
                  alt="Journalists and correspondents comparing morning newspapers and digital dispatches"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
              <figcaption className="mt-2 font-serif text-xs italic text-muted">
                Fig. 2 — Correspondents cross-examine multilateral releases and regional angles. Photo: DAYBREAK Editorial Archive
              </figcaption>
            </div>

            {/* Designed Full Coverage Module */}
            <div className="border border-ink bg-paper p-6 shadow-[8px_8px_0_0_var(--color-rule)]">
              <div className="flex items-center justify-between border-b-2 border-ink pb-3 font-sans text-xs">
                <span className="font-bold uppercase tracking-wider text-accent">Full Coverage Preview</span>
                <span className="text-muted font-medium">3 Global Perspectives</span>
              </div>

              <div className="mt-4">
                <span className="kicker">GLOBAL CLIMATE &amp; FINANCE</span>
                <h3 className="headline mt-1 text-2xl font-bold">
                  Multilateral Energy Transition Pact Agrees on $300B Framework
                </h3>
              </div>

              {/* Multi-publisher perspective comparison */}
              <div className="mt-5 space-y-4">
                <div className="border-t border-rule pt-3">
                  <div className="flex items-baseline justify-between font-sans text-xs">
                    <span className="font-bold text-ink">Reuters</span>
                    <span className="text-muted font-mono">18m ago · London</span>
                  </div>
                  <p className="headline mt-1 text-sm font-semibold text-ink">
                    &ldquo;Finance ministers commit $300B target via sovereign guarantees and multilateral development banks.&rdquo;
                  </p>
                  <p className="mt-1 font-sans text-xs text-muted">
                    Angle: Institutional capital commitments, borrowing costs, and treaty ratification timelines.
                  </p>
                </div>

                <div className="border-t border-rule pt-3">
                  <div className="flex items-baseline justify-between font-sans text-xs">
                    <span className="font-bold text-ink">The Guardian</span>
                    <span className="text-muted font-mono">1h ago · Environment</span>
                  </div>
                  <p className="headline mt-1 text-sm font-semibold text-ink">
                    &ldquo;Developing nations voice dissent, arguing concessions on adaptation grants fall far short of need.&rdquo;
                  </p>
                  <p className="mt-1 font-sans text-xs text-muted">
                    Angle: Environmental justice, vulnerable coastal nations, and loss-and-damage fund mechanisms.
                  </p>
                </div>

                <div className="border-t border-rule pt-3">
                  <div className="flex items-baseline justify-between font-sans text-xs">
                    <span className="font-bold text-ink">Financial Times</span>
                    <span className="text-muted font-mono">2h ago · Markets</span>
                  </div>
                  <p className="headline mt-1 text-sm font-semibold text-ink">
                    &ldquo;How sovereign wealth funds plan to reallocate heavy industry investments under new carbon taxonomies.&rdquo;
                  </p>
                  <p className="mt-1 font-sans text-xs text-muted">
                    Angle: Private capital markets, corporate balance sheets, and carbon border adjustments.
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t-2 border-ink pt-3 flex items-center justify-between font-sans text-xs">
                <span className="text-muted">Preserving original journalist reporting</span>
                <Link href={build} className="font-semibold text-accent hover:underline flex items-center gap-1">
                  Explore full coverage in your paper →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* 5. SECTION B — YOUR INTERESTS SHAPE YOUR EDITION */}
      <Reveal as="section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div id="interests" className="scroll-mt-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-ink pb-4">
            <div>
              <p className="kicker">BESPOKE BROADSHEET CURATION</p>
              <h2 className="mt-2 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-tight tracking-tight text-ink">
                Your interests shape your edition.
              </h2>
            </div>
            <p className="max-w-md font-serif text-base text-ink-soft">
              You choose the sections, regional beats, and reading length. DAYBREAK prints transparent reasoning for every story chosen.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Real topic ecosystem */}
            <div>
              <h3 className="font-display text-2xl font-bold text-ink">
                Tailor your front page beats
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Select high-priority sectors and regions. DAYBREAK balances essential world coverage with deep focus on your specific interests — from technology architectures to regional developments in South Asia.
              </p>

              {/* Clean Unboxed Topic Badges with Broadsheet Styling (Zero-pill discipline) */}
              <div className="mt-6 flex flex-wrap gap-2">
                {TOPIC_IDS.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 border border-rule bg-paper-card px-3.5 py-1.5 font-sans text-xs font-medium text-ink transition-colors hover:border-ink"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {TOPICS[t].label}
                  </span>
                ))}
              </div>

              {/* Reader Preferences Dimensions */}
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="border border-rule bg-paper-card p-4">
                  <p className="font-sans text-[0.65rem] font-bold uppercase tracking-wider text-accent">Reading Pace</p>
                  <p className="mt-1 font-display text-lg font-bold">5, 15, or 30 Mins</p>
                  <p className="mt-1 text-xs text-muted">Fit to your morning coffee schedule.</p>
                </div>
                <div className="border border-rule bg-paper-card p-4">
                  <p className="font-sans text-[0.65rem] font-bold uppercase tracking-wider text-accent">Regional Anchor</p>
                  <p className="mt-1 font-display text-lg font-bold">Global + Local</p>
                  <p className="mt-1 text-xs text-muted">Prioritize Pakistan, Europe, Asia, or the Americas.</p>
                </div>
                <div className="border border-rule bg-paper-card p-4">
                  <p className="font-sans text-[0.65rem] font-bold uppercase tracking-wider text-accent">Editorial Depth</p>
                  <p className="mt-1 font-display text-lg font-bold">Digest or Deep</p>
                  <p className="mt-1 text-xs text-muted">Control context length and source diversity.</p>
                </div>
              </div>
            </div>

            {/* Live Example: How a Personal Edition Reads */}
            <div className="border-2 border-ink bg-paper-card p-6 shadow-[8px_8px_0_0_var(--color-rule)]">
              <div className="flex items-center justify-between border-b border-ink pb-2 font-sans text-[0.68rem] font-bold uppercase tracking-[0.18em] text-muted">
                <span>Personal Edition Anatomy</span>
                <span className="text-accent">Transparent Curation</span>
              </div>

              <div className="mt-4 space-y-4">
                {[
                  {
                    topic: "Close to home · Pakistan",
                    title: "State Bank of Pakistan Maintains Policy Rate Amid Easing Headline Inflation",
                    reason: "Relevant to readers in Pakistan tracking monetary policy and macroeconomic reform.",
                    publisher: "Dawn / Reuters",
                  },
                  {
                    topic: "Technology & Semiconductors",
                    title: "Next-Generation Photonic Interconnects Show 10x Bandwidth Gain for AI Datacenters",
                    reason: "Matches your saved preferences for high-performance computing & silicon architecture.",
                    publisher: "Ars Technica",
                  },
                  {
                    topic: "Beyond your usual beat · Science",
                    title: "James Webb Space Telescope Identifies Atmospheric Carbon Dioxide on Temperate Exoplanet",
                    reason: "Curated serendipity: broadens today's coverage beyond your primary daily topics.",
                    publisher: "Nature / NASA",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="border-t border-rule pt-3">
                    <div className="flex items-center justify-between font-sans text-[0.68rem] text-muted">
                      <span className="font-bold uppercase tracking-wider text-accent">{item.topic}</span>
                      <span>{item.publisher}</span>
                    </div>
                    <p className="headline mt-1 text-base font-bold text-ink">{item.title}</p>
                    <p className="mt-1.5 font-sans text-xs text-ink-soft">
                      <span className="font-semibold text-accent">Why this?</span> {item.reason}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-rule pt-3 font-sans text-xs text-muted flex items-center justify-between">
                <span>No hidden scores or black-box algorithms</span>
                <span className="font-semibold text-ink">Reset anytime</span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* 6. SECTION C — MORE THAN HEADLINES (THE EDITORIAL CRAFT) */}
      <Reveal as="section" className="border-y-2 border-ink bg-paper-card">
        <div id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="kicker">THE EDITORIAL EXPERIENCE</p>
            <h2 className="mt-2 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-tight tracking-tight text-ink">
              More than headlines.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">
              Modern news feeds are engineered for anxiety. DAYBREAK is designed for comprehension, retention, and calm. Every story provides context, verified data, and direct pathways to original reporting.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {/* Feature 1 */}
            <article className="border-t-2 border-ink pt-4 flex flex-col justify-between">
              <div>
                <p className="font-mono text-xs font-bold text-accent">01</p>
                <h3 className="headline mt-2 text-xl font-bold">The Bigger Picture</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  What happened, why it matters, and how it connects to the other stories on your page. Thoughtful interpretation clearly labeled and checked against reported facts.
                </p>
              </div>
              <div className="mt-6 border-t border-rule pt-3 font-sans text-xs text-muted flex items-center gap-1.5">
                <Sparkles size={14} className="text-accent" /> Explicitly labeled context
              </div>
            </article>

            {/* Feature 2 */}
            <article className="border-t-2 border-ink pt-4 flex flex-col justify-between">
              <div>
                <p className="font-mono text-xs font-bold text-accent">02</p>
                <h3 className="headline mt-2 text-xl font-bold">Three Things to Remember</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  Three memorable, high-signal takeaways distilled from today&apos;s edition. Read them in 60 seconds over morning tea, each linked back to original reporting.
                </p>
              </div>
              <div className="mt-6 border-t border-rule pt-3 font-sans text-xs text-muted flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-forest" /> Distilled key takeaways
              </div>
            </article>

            {/* Feature 3 */}
            <article className="border-t-2 border-ink pt-4 flex flex-col justify-between">
              <div>
                <p className="font-mono text-xs font-bold text-accent">03</p>
                <h3 className="headline mt-2 text-xl font-bold">Typeset Broadsheet PDF</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  Every edition can be downloaded with one click as a crisp, multi-column typeset PDF broadsheet. Read offline on your tablet, e-ink reader, or printed for breakfast.
                </p>
              </div>
              <div className="mt-6 border-t border-rule pt-3 font-sans text-xs text-muted flex items-center gap-1.5">
                <FileDown size={14} className="text-accent" /> Real vector typography
              </div>
            </article>

            {/* Feature 4 */}
            <article className="border-t-2 border-ink pt-4 flex flex-col justify-between">
              <div>
                <p className="font-mono text-xs font-bold text-accent">04</p>
                <h3 className="headline mt-2 text-xl font-bold">Archive &amp; Story Explorer</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  Search two weeks of indexed reporting from premier newsrooms. Compare how different publications covered one historic week and retrieve saved articles anytime.
                </p>
              </div>
              <div className="mt-6 border-t border-rule pt-3 font-sans text-xs text-muted flex items-center gap-1.5">
                <Compass size={14} className="text-ink" /> Deep searchable archive
              </div>
            </article>
          </div>
        </div>
      </Reveal>

      {/* 7. SECTION D — A NEWSPAPER THAT LEARNS WHAT MATTERS TO YOU */}
      <Reveal as="section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="kicker">TRANSPARENT ADAPTATION</p>
            <h2 className="mt-2 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-tight tracking-tight text-ink">
              A newspaper that learns what matters to you.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">
              DAYBREAK adapts as you read — but without secret behavioral profiles or surveillance capitalism. Every adaptation happens through clear, user-controlled feedback loops:
            </p>

            <div className="mt-8 space-y-5">
              <div className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink bg-paper-card font-mono text-sm font-bold text-accent">
                  <Bookmark size={16} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">Save for Later</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    Signals high resonance. The ranker gently boosts depth for this topic, sector, or region in subsequent editions.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink bg-paper-card font-mono text-sm font-bold text-accent">
                  <Eye size={16} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">Skip &amp; Not Interested</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    Tired of a repetitive storyline? Mark it as &ldquo;not interested&rdquo; to dial back similar coverage without building an echo chamber.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink bg-paper-card font-mono text-sm font-bold text-accent">
                  <RotateCcw size={16} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">Inspect &amp; Reset Anytime</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    Open your settings anytime to see the exact topic scores DAYBREAK has learned. Reset to blank slate with one click.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href={build}
                className="btn btn-primary !px-6 !py-3 font-sans font-bold shadow-[4px_4px_0_0_var(--color-rule-strong)]"
              >
                Start Your Learned Edition
              </Link>
            </div>
          </div>

          {/* Visual: Research Lab / Editorial Precision */}
          <div className="relative border border-ink bg-paper p-4 shadow-[10px_10px_0_0_var(--color-rule)]">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper-deep">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/climate_lab.jpg"
                alt="Editorial intelligence and sensor calibration cleanroom"
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
            <figcaption className="mt-3 font-serif text-xs italic text-muted">
              Fig. 3 — High-precision verification systems ensure every summary is anchored in publisher facts.
            </figcaption>
          </div>
        </div>
      </Reveal>

      {/* 8. SECTION E — TODAY'S STORIES (THE LIVE NEWSSTAND) */}
      <Reveal as="section" className="border-t-2 border-ink bg-paper-card">
        <div id="today" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-ink pb-4">
            <div>
              <p className="kicker">TODAY&apos;S REPORTING POOL</p>
              <h2 className="mt-1 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-tight tracking-tight text-ink">
                Today&apos;s stories
              </h2>
            </div>
            <Link
              href={build}
              className="font-sans text-sm font-bold text-accent hover:underline flex items-center gap-1.5"
            >
              Get these ranked for your interests →
            </Link>
          </div>

          <div className="mt-8">
            <Suspense fallback={<Skeleton h="h-72" />}>
              <TodayGrid />
            </Suspense>
          </div>
        </div>
      </Reveal>

      {/* 9. SECTION F — VERIFIED NEWSROOMS (THE SOURCE DIRECTORY) */}
      <Reveal as="section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div id="sources" className="grid scroll-mt-20 gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="kicker">ETHICAL SOURCING</p>
            <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              One paper, many trusted sources.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Headlines and short excerpts come directly from established newsrooms, credited and linked. Never scraped into generic AI slop, never behind a paywall trick. Counts reflect stories indexed in the last 48 hours.
            </p>
            <div className="mt-6 border-t border-rule pt-4 font-sans text-xs text-muted">
              <p>
                Interested in adding a feed or verifying attribution? Check our transparent RSS indexing specifications in the settings.
              </p>
            </div>
          </div>

          <Suspense fallback={<Skeleton h="h-48" />}>
            <SourceWall />
          </Suspense>
        </div>
      </Reveal>

      {/* 10. CLOSING HERO CALL TO ACTION — "MAKE ROOM FOR WHAT MATTERS." */}
      <section className="border-t-2 border-ink bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="border-2 border-ink bg-paper-card p-8 md:p-14 shadow-[12px_12px_0_0_var(--color-rule-strong)]">
            <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <p className="kicker">YOUR DAILY RITUAL</p>
                <h2 className="mt-2 font-display text-[clamp(2.4rem,5vw,4rem)] font-black leading-[1.02] tracking-tight text-ink">
                  MAKE ROOM FOR WHAT MATTERS.
                </h2>
                <p className="mt-4 font-serif text-xl italic text-ink-soft">
                  Start your morning informed, not overwhelmed.
                </p>
                <p className="mt-3 text-sm text-muted">
                  {accounts ? "Sign in with Google or email — Free. No credit card required." : "Demo mode ready — explore the newspaper immediately."}
                </p>
              </div>

              <div className="shrink-0">
                <Link
                  href={build}
                  className="btn btn-primary group !px-8 !py-4 !text-lg font-sans font-bold shadow-[6px_6px_0_0_var(--color-ink)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                >
                  {reader && prefs?.onboardedAt ? "Open My Newspaper" : "Build My Newspaper"}
                  <ArrowRight size={20} aria-hidden className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
