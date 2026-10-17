import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { formatEditionDate, formatTime } from "@/components/paper/format";
import { log } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { llmConfig, newsMode, storageMode } from "@/lib/env";
import { refreshIfStale } from "@/lib/news/ingest";
import { sampleArticles } from "@/lib/news/sample";
import { SOURCES } from "@/lib/news/sources";
import { DEFAULT_PREFERENCES, editionDateFor } from "@/lib/preferences";
import { emptyLearnedProfile } from "@/lib/rank/learning";
import { planEdition } from "@/lib/rank/plan";
import { safeLinkUrl } from "@/lib/security/url";
import { getServiceStore } from "@/lib/store";
import { TOPICS, TOPIC_IDS, topicLabel } from "@/lib/topics";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", title: "Tell it what you care about", body: "Pick sections and narrower interests, your region and how local you like it, how long you have, and what to leave out. Two minutes, once." },
  { n: "02", title: "Wake up to your paper", body: "Each morning DAYBREAK gathers fresh reporting, ranks it for you and lays it out as a front page — with a short note on why every story is there." },
  { n: "03", title: "Read, react, and it adapts", body: "Save, skip, or say “not interested”. Tomorrow's paper re-weights accordingly, and you can see — and reset — everything it has learned." },
];

const FEATURES = [
  { kicker: "Attribution", title: "Every story links to its publisher", body: "Headlines and short excerpts only, with the publisher and time on every story. No rewritten articles, no paywall tricks." },
  { kicker: "Understanding", title: "The Bigger Picture", body: "What happened, why it matters, how it connects to today's other stories and to your earlier editions — interpretation clearly labelled." },
  { kicker: "Explore", title: "Beyond your usual", body: "Browse every topic, compare how different newsrooms frame the same event, follow new topics and search two weeks of reporting." },
  { kicker: "Daily editions", title: "An archive you can trust", body: "Each edition is kept exactly as printed, and downloads as a typeset PDF with working links — the same edition you read on screen." },
];

function pickPreview(articles: Article[]) {
  const prefs = { ...DEFAULT_PREFERENCES, sections: [...TOPIC_IDS], depth: "brief" as const, readingMinutes: 8 };
  const plan = planEdition({ articles, prefs, learned: emptyLearnedProfile(), now: new Date() });
  return plan.stories.slice(0, 5).map((s) => s.scored.article);
}

async function FrontPagePreview() {
  let live: Article[] = [];
  try {
    live = (await getServiceStore().listArticles({ sinceHours: 36, limit: 800 })).filter((a) => !a.sample);
  } catch (err) {
    log("landing_preview_failed", { error: (err as Error).message?.slice(0, 120) });
  }
  if (live.length < 8 && newsMode() === "live") {
    // Fetch feeds after responding, so the next visitor sees today's real reporting.
    after(() => refreshIfStale(getServiceStore()).catch((e) => log("landing_ingest_failed", { error: (e as Error).message?.slice(0, 120) })));
  }
  const isSample = live.length < 8;
  const stories = pickPreview(isSample ? sampleArticles() : live);
  const [lead, ...rest] = stories;
  const today = editionDateFor("UTC");
  if (!lead) return null;
  const leadHref = safeLinkUrl(lead.url);

  return (
    <figure className="border border-ink bg-paper-card shadow-[8px_8px_0_0_var(--color-rule)]">
      <div className="border-b border-ink px-5 pb-3 pt-4 text-center">
        <p className="font-display text-3xl font-extrabold tracking-[0.14em]">DAYBREAK</p>
        <div className="mt-2 flex justify-between font-sans text-[0.65rem] uppercase tracking-[0.14em] text-muted">
          <span>{formatEditionDate(today)}</span>
          <span>{isSample ? "Sample preview" : "Today's general edition"}</span>
        </div>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[3fr_2fr]">
        <article className="md:border-r md:border-rule md:pr-5">
          <p className="kicker">Lead · {topicLabel(lead.topics[0] ?? "world")}</p>
          <h3 className="headline mt-1.5 text-3xl">{leadHref ? <a href={leadHref} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{lead.title}</a> : lead.title}</h3>
          <p className="meta mt-1.5">{lead.publisher} · {formatTime(lead.publishedAt, "UTC")}{lead.sample ? " · Sample" : ""}</p>
          {lead.description ? <p className="mt-3 line-clamp-4 leading-relaxed text-ink-soft">{lead.description}</p> : null}
          {leadHref ? (
            <a href={leadHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-sans text-xs font-semibold text-accent hover:underline">
              {lead.sample ? "About this sample item" : `Read at ${lead.publisher}`} <ArrowUpRight size={13} aria-hidden />
            </a>
          ) : null}
        </article>
        <ul className="space-y-4">
          {rest.map((a) => {
            const href = safeLinkUrl(a.url);
            return (
              <li key={a.id} className="border-b border-rule pb-3 last:border-0">
                <p className="kicker">{topicLabel(a.topics[0] ?? "world")}</p>
                <p className="headline mt-1 text-lg">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{a.title}</a> : a.title}</p>
                <p className="meta mt-1">{a.publisher} · {formatTime(a.publishedAt, "UTC")}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <figcaption className="border-t border-rule px-5 py-2.5 font-sans text-xs text-muted">
        {isSample
          ? "Labelled sample stories while today's reporting is being collected. Your own paper uses live feeds."
          : "Real stories collected from DAYBREAK's sources, ranked for a general reader. Your paper is ranked for you."}
      </figcaption>
    </figure>
  );
}

function PreviewSkeleton() {
  return (
    <div className="border border-ink bg-paper-card p-5" aria-busy="true" aria-label="Loading today's preview">
      <div className="mx-auto h-8 w-48 skeleton" />
      <div className="mt-5 grid gap-5 md:grid-cols-[3fr_2fr]">
        <div className="space-y-2">
          <div className="h-7 w-11/12 skeleton" />
          <div className="h-7 w-8/12 skeleton" />
          <div className="mt-3 h-4 w-full skeleton" />
          <div className="h-4 w-10/12 skeleton" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-5 w-full skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const reader = await getReader().catch(() => null);
  const prefs = reader ? await reader.store.getPreferences(reader.userId).catch(() => null) : null;
  const publishers = [...new Set(SOURCES.map((s) => s.publisher))];
  const accounts = storageMode() === "supabase";
  const ai = llmConfig();
  const start = reader ? (prefs?.onboardedAt ? "/newspaper" : "/onboarding") : accounts ? "/login?mode=signup" : "/onboarding";

  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-accent">A personal morning paper</p>
          <h1 className="mt-4 font-display text-[clamp(2.6rem,6.5vw,4.6rem)] font-extrabold leading-[0.98] tracking-tight">
            The news that matters to you, on one front page.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            DAYBREAK gathers real reporting from {publishers.length} publishers, ranks it around your interests and your part of the world, explains why the important stories matter — and prints it as a paper you can actually finish before breakfast.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={start} className="btn btn-primary !px-6 !py-3 !text-base">
              {reader ? (prefs?.onboardedAt ? "Open your paper" : "Finish setting up") : "Get started — it's free"} <ArrowRight size={18} aria-hidden />
            </Link>
            {!reader && accounts ? (
              <Link href="/login" className="rounded px-4 py-3 font-sans text-sm font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink">
                Sign in
              </Link>
            ) : null}
          </div>
          <p className="mt-4 font-sans text-xs text-muted">
            {accounts ? "Sign in with Google or email. Your paper follows you across devices." : "Demo mode — no account needed; your profile stays on this server."}{" "}
            {ai ? "Summaries are AI-assisted and checked against the source text." : "Summaries use each publisher's own description."}
          </p>
        </div>
        <div id="preview" className="scroll-mt-24">
          <Suspense fallback={<PreviewSkeleton />}>
            <FrontPagePreview />
          </Suspense>
        </div>
      </section>

      <section id="how" aria-labelledby="how-h" className="scroll-mt-20 border-y border-ink bg-paper-card">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="how-h" className="font-display text-4xl font-extrabold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="font-display text-5xl font-extrabold text-accent" aria-hidden>{s.n}</span>
                <h3 className="headline mt-2 text-2xl">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="features-h" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="features-h" className="sr-only">What makes DAYBREAK different</h2>
        <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="border-t-2 border-ink pt-4">
              <p className="kicker">{f.kicker}</p>
              <h3 className="headline mt-2 text-2xl">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="sources" aria-labelledby="sources-h" className="mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
        <div className="grid gap-8 border-t border-rule pt-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="sources-h" className="font-display text-3xl font-extrabold">Where the news comes from</h2>
            <p className="mt-2 text-ink-soft">Public feeds from established newsrooms. DAYBREAK keeps headlines and short excerpts, credits the publisher and links to the original.</p>
          </div>
          <ul className="flex flex-wrap content-start gap-2 font-sans text-sm">
            {publishers.map((p) => (
              <li key={p} className="border border-rule bg-paper-card px-3 py-1.5">{p}</li>
            ))}
          </ul>
        </div>
        <p className="mt-8 font-display text-lg leading-relaxed text-ink-soft">
          {TOPIC_IDS.map((t, i) => (
            <span key={t}>
              {TOPICS[t].label}
              {i < TOPIC_IDS.length - 1 ? <span className="mx-2 text-rule">/</span> : null}
            </span>
          ))}
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 border-y-2 border-ink py-10 md:flex-row md:items-center">
          <p className="font-display text-3xl font-extrabold leading-tight md:text-4xl">Tomorrow&apos;s paper, made for you.</p>
          <Link href={start} className="btn btn-primary !px-6 !py-3 !text-base">
            {reader ? "Open your paper" : "Get started"} <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
