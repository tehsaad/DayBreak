import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getReader } from "@/lib/auth/reader";
import { llmConfig, storageMode } from "@/lib/env";
import { SOURCES } from "@/lib/news/sources";
import { TOPICS, TOPIC_IDS } from "@/lib/topics";

export const dynamic = "force-dynamic";

const FEATURES = [
  { kicker: "01 · Onboarding", title: "Designed in two minutes", body: "Choose sections and narrower interests, your region and how local you like it, reading depth and time. Mute what you never want to see." },
  { kicker: "02 · The paper", title: "A front page, not a feed", body: "A lead story, front-page companions, your sections and a deliberate “Beyond your usual” slot — each with an honest note on why it's there." },
  { kicker: "03 · Understanding", title: "The Bigger Picture", body: "What happened, why it matters, how it connects to other stories today and to your earlier editions — with interpretation clearly labelled." },
  { kicker: "04 · Learning", title: "Gets better as you read", body: "Saves, skips and “not interested” are stored and re-weight tomorrow's ranking. You can inspect every learned weight and reset it." },
  { kicker: "05 · Print", title: "A real PDF edition", body: "Download a typeset, multi-page newspaper of the exact edition you're reading, with working links to every source." },
  { kicker: "06 · Archive", title: "Every edition, kept", body: "Previous papers are preserved exactly as printed. Reopen or re-download any of them, and follow story threads across days." },
];

export default async function Home() {
  const reader = await getReader().catch(() => null);
  const prefs = reader ? await reader.store.getPreferences(reader.userId) : null;
  const publishers = [...new Set(SOURCES.map((s) => s.publisher))];
  const mode = storageMode();
  const ai = llmConfig();

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-14 text-center sm:px-6 sm:pt-20">
        <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-muted">A personal morning paper</p>
        <h1 className="mt-4 font-display text-[clamp(2.6rem,13vw,9rem)] font-extrabold leading-[0.9] tracking-[0.08em]">DAYBREAK</h1>
        <p className="mt-4 font-display text-2xl italic text-ink-soft sm:text-3xl">The world, filtered through you.</p>
        <div className="rule-double mx-auto mt-8 max-w-4xl" />
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          News is scattered across sites, apps and newsletters. DAYBREAK gathers real reporting from {publishers.length} publishers, ranks it around your interests, explains why the important stories matter, and prints it as a paper you can actually finish.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {prefs ? (
            <>
              <Link href="/paper" className="btn btn-primary !px-6 !py-3 !text-base">
                Read today&apos;s paper <ArrowRight size={18} aria-hidden />
              </Link>
              <Link href="/settings" className="btn btn-ghost !px-6 !py-3 !text-base">Adjust your paper</Link>
            </>
          ) : (
            <Link href="/onboarding" className="btn btn-primary !px-6 !py-3 !text-base">
              Design your paper <ArrowRight size={18} aria-hidden />
            </Link>
          )}
        </div>
        <p className="mt-4 font-sans text-xs text-muted">
          {mode === "demo" ? "Running in demo mode — no account needed; your profile stays on this server." : "Sign in with a one-time email link; your paper follows you across devices."}{" "}
          {ai ? `AI editing by ${ai.provider}.` : "AI editing is not configured, so summaries use publishers' own descriptions."}
        </p>
      </section>

      <section aria-labelledby="features-h" className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <h2 id="features-h" className="sr-only">What DAYBREAK does</h2>
        <div className="grid border-t-2 border-ink sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <article key={f.title} className={`border-b border-rule py-7 sm:px-6 ${i % 3 !== 2 ? "lg:border-r" : ""} ${i % 2 === 0 ? "sm:border-r lg:border-r" : "sm:border-r-0"} ${i % 3 === 2 ? "lg:border-r-0" : ""}`}>
              <p className="kicker">{f.kicker}</p>
              <h3 className="headline mt-2 text-2xl">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="sources-h" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="sources-h" className="font-display text-3xl font-extrabold">Where the news comes from</h2>
            <p className="mt-2 text-ink-soft">
              Public RSS feeds from established newsrooms. DAYBREAK keeps headlines and short excerpts, always links to the original, and never reproduces full articles or works around paywalls.
            </p>
          </div>
          <ul className="flex flex-wrap content-start gap-2 font-sans text-sm">
            {publishers.map((p) => (
              <li key={p} className="border border-rule bg-paper-card px-3 py-1.5">{p}</li>
            ))}
          </ul>
        </div>
        <div className="mt-10 border-t border-rule pt-6">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted">Sections</h3>
          <p className="mt-2 font-display text-xl leading-relaxed">
            {TOPIC_IDS.map((t, i) => (
              <span key={t}>
                {TOPICS[t].label}
                {i < TOPIC_IDS.length - 1 ? <span className="mx-2 text-rule">/</span> : null}
              </span>
            ))}
          </p>
        </div>
      </section>
    </div>
  );
}
