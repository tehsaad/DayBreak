import { displayExcerpt } from "@/lib/news/rights";
import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import { ArrowRight } from "lucide-react";
import { formatEditionDate, formatTime } from "@/components/paper/format";
import { Reveal } from "@/components/reveal";
import { Thumb } from "@/components/thumb";
import { log } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { llmConfig, newsMode, storageMode } from "@/lib/env";
import { refreshIfStale, summarizeRun } from "@/lib/news/ingest";
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
      <div className={big ? "mt-3" : "flex gap-3"}>
        <div className="min-w-0 flex-1">
          <p className="kicker">{topicLabel(a.topics[0] ?? "world")}</p>
          <h3 className={`headline mt-1 ${big ? "text-[clamp(1.6rem,3vw,2.2rem)]" : "text-[1.05rem]"}`}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="link-rule">
                {a.title}
                <span className="sr-only"> (opens {a.publisher} in a new tab)</span>
              </a>
            ) : (
              a.title
            )}
          </h3>
          <p className="meta mt-1">{a.publisher} · {formatTime(a.publishedAt, "UTC")}{a.sample ? " · Sample" : ""}</p>
          {big && displayExcerpt(a.description) ? <p className="mt-2 line-clamp-3 leading-relaxed text-ink-soft">{displayExcerpt(a.description)}</p> : null}
        </div>
        {!big ? <Thumb src={a.imageUrl} alt={a.title} size="thumb" label={TOPICS[a.topics[0] ?? "world"].short} /> : null}
      </div>
    </article>
  );
}

async function FrontPage() {
  const data = await landingData();
  if (newsMode() === "live") {
    after(() =>
      refreshIfStale(getServiceStore(), log)
        .then((run) => (run ? log("background_ingest", summarizeRun(run)) : undefined))
        .catch((e) => log("landing_ingest_failed", { error: (e as Error).message?.slice(0, 120) })),
    );
  }
  const [lead, ...rest] = data.stories;
  if (!lead) return null;
  return (
    <figure className="border border-ink bg-paper-card p-5 shadow-[10px_10px_0_0_var(--color-rule)]">
      <div className="flex items-baseline justify-between border-b border-ink pb-2 font-sans text-[0.65rem] uppercase tracking-[0.16em] text-muted">
        <span>Front page preview</span>
        <span>{data.isSample ? "Labelled sample stories" : "Ranked for a general reader"}</span>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <StoryCard a={lead} delay={150} big />
        <div className="space-y-4 md:border-l md:border-rule md:pl-5">
          {rest.slice(0, 4).map((a, i) => (
            <StoryCard key={a.id} a={a} delay={250 + i * 90} />
          ))}
        </div>
      </div>
      <figcaption className="mt-4 border-t border-rule pt-2 font-sans text-xs text-muted">
        {data.isSample ? "Shown while today's reporting is collected. Your paper uses live feeds." : `Real stories from DAYBREAK's sources. Your own paper is ranked for you.`}
      </figcaption>
    </figure>
  );
}

async function EditionStrip() {
  const data = await landingData();
  return (
    <span>
      {data.isSample ? "Today's edition is being gathered" : `${data.total} stories from ${data.perPublisher.length} publishers in the last 48 hours`}
    </span>
  );
}

async function TodayGrid() {
  const data = await landingData();
  const stories = data.stories.slice(5, 14);
  if (!stories.length) return null;
  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
      {stories.map((a, i) => (
        <div key={a.id} className="border-t border-rule pt-4">
          <StoryCard a={a} delay={i * 60} />
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
        <li key={p} className="flex items-baseline justify-between gap-2 bg-paper-card px-3 py-2.5 font-sans text-sm">
          <span className="truncate">{p}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted">{counts.get(p) ? `${counts.get(p)} stories` : "—"}</span>
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
  const ai = llmConfig();
  const build = reader ? (prefs?.onboardedAt ? "/newspaper" : "/onboarding") : accounts ? "/login?mode=signup" : "/onboarding";
  const today = formatEditionDate(editionDateFor("UTC"));

  return (
    <div>
      {/* Edition strip */}
      <div className="border-b border-ink bg-ink font-sans text-[0.68rem] uppercase tracking-[0.18em] text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5 sm:px-6">
          <span>{today}</span>
          <Suspense fallback={<span>Today&apos;s edition</span>}>
            <EditionStrip />
          </Suspense>
        </div>
      </div>

      {/* Masthead + hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <div className="text-center animate-fade-up">
          <p className="font-display text-[clamp(3rem,11vw,7.5rem)] font-extrabold leading-none tracking-[0.1em]">DAYBREAK</p>
          <p className="mt-2 font-display text-lg italic text-muted">The world, filtered through you.</p>
        </div>
        <div className="mt-6 origin-left border-t-2 border-ink animate-rule-draw" />
        <div className="mt-[3px] origin-right border-t border-ink animate-rule-draw" />

        <div className="grid items-start gap-12 pb-16 pt-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
            <p className="kicker">A personal morning paper</p>
            <h1 className="mt-3 font-display text-[clamp(2.4rem,5.5vw,4.2rem)] font-extrabold leading-[1.02] tracking-tight">Personalized news, without the noise.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
              DAYBREAK reads trusted publishers for you, ranks what matters to your interests and your part of the world, and lays it out as one front page you can finish over breakfast — every story linked to its original reporting.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={build} className="btn btn-primary group !px-6 !py-3 !text-base">
                {reader && prefs?.onboardedAt ? "Open my newspaper" : "Build my newspaper"} <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#today" className="btn btn-ghost !px-6 !py-3 !text-base">Explore today&apos;s stories</a>
            </div>
            <p className="mt-4 font-sans text-xs text-muted">
              {accounts ? "Sign in with Google or email — free." : "Demo mode: no account needed."} {ai ? "Summaries are AI-assisted and checked against the source." : "Summaries use each publisher's own description."}
            </p>
          </div>
          <div id="preview" className="scroll-mt-24">
            <Suspense fallback={<Skeleton h="h-[28rem]" />}>
              <FrontPage />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Your interests */}
      <Reveal as="section" className="border-y border-ink bg-paper-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight">Your interests. Your morning paper.</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">Choose sections and narrower interests, your region and how local you like it, and how long you have. Each story says plainly why it made your paper — and you can see and reset everything DAYBREAK learns from your saves and skips.</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {TOPIC_IDS.map((t) => (
                <li key={t} className="chip !cursor-default">{TOPICS[t].label}</li>
              ))}
            </ul>
          </div>
          <div className="border border-ink bg-paper p-5">
            <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">How a personal edition reads · example</p>
            {[
              ["Close to home: Pakistan", "Relevant to readers in Pakistan."],
              ["Education & Scholarships", "Matches your interest in scholarships & fellowships."],
              ["Beyond your usual", "Included to broaden today's coverage."],
            ].map(([section, reason]) => (
              <div key={section} className="mt-4 border-t border-rule pt-3">
                <p className="font-display text-xl font-bold">{section}</p>
                <p className="mt-1 font-sans text-xs text-ink-soft"><span className="font-semibold text-accent">Why this?</span> {reason}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Today's stories */}
      <Reveal as="section" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        <div id="today" className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
          <h2 className="font-display text-4xl font-extrabold tracking-tight">Today&apos;s stories</h2>
          <Link href={build} className="font-sans text-sm text-accent hover:underline">Get these ranked for you →</Link>
        </div>
        <div className="mt-6">
          <Suspense fallback={<Skeleton h="h-64" />}>
            <TodayGrid />
          </Suspense>
        </div>
      </Reveal>

      {/* Sources */}
      <Reveal as="section" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <div id="sources" className="grid scroll-mt-20 gap-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight">One paper, many trusted sources.</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">Headlines and short excerpts from established newsrooms, credited and linked — never rewritten, never behind a paywall trick. Counts are stories collected in the last 48 hours.</p>
          </div>
          <Suspense fallback={<Skeleton h="h-48" />}>
            <SourceWall />
          </Suspense>
        </div>
      </Reveal>

      {/* Better way */}
      <Reveal as="section" className="border-y border-ink bg-paper-card">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-4xl font-extrabold tracking-tight">A better way to stay informed.</h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["The Bigger Picture", "What happened, why it matters and how it connects to your other stories — interpretation clearly labelled."],
              ["Three Things to Remember", "Three takeaways from today's edition, each linked to the reporting it comes from."],
              ["A real archive", "Every edition kept exactly as printed, and downloadable as a typeset PDF with working links."],
              ["Explore & search", "Browse every topic, compare how newsrooms frame one event, and search two weeks of reporting."],
            ].map(([title, body]) => (
              <article key={title} className="border-t-2 border-ink pt-3">
                <h3 className="headline text-xl">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </Reveal>

      {/* How it works */}
      <Reveal as="section" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div id="how" className="scroll-mt-20">
          <h2 className="font-display text-4xl font-extrabold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-10 md:grid-cols-3">
            {[
              ["01", "Tell it what you care about", "Sections, interests, region, reading time, and anything to leave out. Two minutes, once."],
              ["02", "Get your front page", "DAYBREAK gathers fresh reporting, ranks it for you and prints today's edition."],
              ["03", "React, and it adapts", "Save, skip or mark “not interested” — tomorrow's paper re-weights, and you can reset it any time."],
            ].map(([n, title, body]) => (
              <li key={n}>
                <span className="font-display text-5xl font-extrabold text-accent" aria-hidden>{n}</span>
                <h3 className="headline mt-2 text-2xl">{title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 border-y-2 border-ink py-10 md:flex-row md:items-center">
          <p className="font-display text-3xl font-extrabold leading-tight md:text-4xl">Tomorrow&apos;s paper, made for you.</p>
          <Link href={build} className="btn btn-primary group !px-6 !py-3 !text-base">
            {reader && prefs?.onboardedAt ? "Open my newspaper" : "Build my newspaper"} <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
