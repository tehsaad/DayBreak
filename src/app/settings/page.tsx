import type { Metadata } from "next";
import { LearnedInterests } from "@/components/learned-interests";
import { SettingsForm } from "@/components/settings-form";
import { formatTime } from "@/components/paper/format";
import { gnewsApiKey, llmConfig, llmStatusNote, newsMode, storageMode } from "@/lib/env";
import { ALL_SOURCES, SOURCES } from "@/lib/news/sources";
import { FEEDBACK_WEIGHTS, LEARNING, computeLearnedProfile } from "@/lib/rank/learning";
import { WEIGHTS } from "@/lib/rank/score";
import { requireReader } from "@/lib/server/page-reader";
import { getServiceStore } from "@/lib/store";
import { regionName } from "@/lib/topics";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  ok: "text-forest",
  not_modified: "text-forest",
  empty: "text-warn",
  error: "text-accent",
  rate_limited: "text-warn",
};

export default async function SettingsPage() {
  const { reader, prefs } = await requireReader("/settings");
  const [feedback, health, lastRun] = await Promise.all([
    reader.store.listFeedback(reader.userId, 90),
    getServiceStore().getSourceHealth(),
    getServiceStore().lastIngestionRun(),
  ]);
  const learned = computeLearnedProfile(feedback);
  const healthById = new Map(health.map((h) => [h.sourceId, h]));
  const llm = llmConfig();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Settings</h1>
      <p className="mt-2 text-ink-soft">Your preferences, what DAYBREAK has learned about you, and where the news comes from.</p>
      <nav aria-label="Settings sections" className="mt-5 flex flex-wrap gap-2 font-sans text-xs">
        {[["#sections", "Sections"], ["#interests", "What DAYBREAK has learned"], ["#ranking", "How ranking works"], ["#sources", "Sources"], ["#data", "Your data"]].map(([href, label]) => (
          <a key={href} href={href} className="chip !py-1">{label}</a>
        ))}
      </nav>

      <SettingsForm initial={prefs} />

      <section id="interests" aria-labelledby="interests-h" className="scroll-mt-24 border-t-2 border-ink py-8">
        <h2 id="interests-h" className="font-display text-3xl font-extrabold">What DAYBREAK has learned</h2>
        <p className="mt-1 mb-5 text-sm text-ink-soft">Inferred from your feedback and used in every new edition. Reset any line you disagree with.</p>
        <LearnedInterests topics={learned.topics} publishers={learned.publishers} signals={learned.signalCount} followed={prefs.sections} />
      </section>

      <section id="ranking" aria-labelledby="ranking-h" className="scroll-mt-24 border-t border-rule py-8">
        <h2 id="ranking-h" className="font-display text-2xl font-bold">How ranking works</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Every candidate article gets a deterministic score — the same inputs always produce the same paper. Terms (each 0–1 before weighting):
        </p>
        <table className="mt-3 w-full font-sans text-xs">
          <tbody className="divide-y divide-rule">
            {Object.entries(WEIGHTS).map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="py-1.5 pr-4 text-left font-medium">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</th>
                <td className="py-1.5 tabular-nums text-muted">{["rejectedSimilarity", "exposure", "mutedSecondary"].includes(k) ? "−" : "+"}{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Feedback weights: {Object.entries(FEEDBACK_WEIGHTS).filter(([, v]) => v !== 0).map(([k, v]) => `${k.replace(/_/g, " ")} ${v > 0 ? "+" : ""}${v}`).join(", ")}; ratings count (rating − 3) × 0.75. Signals decay with a {LEARNING.halfLifeDays}-day half-life, are capped at ±{LEARNING.dailyCapPerTopic} per topic per day, and are squashed into −1…+1 so no single tap dominates. After scoring, the paper seeds one story per followed section, reserves “Beyond your usual” slots for strong stories outside your bubble, and limits any one publisher to about 30% of the edition.
        </p>
      </section>

      <section id="sources" aria-labelledby="sources-h" className="scroll-mt-24 border-t border-rule py-8">
        <h2 id="sources-h" className="font-display text-2xl font-bold">Sources</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {SOURCES.length} RSS feeds from {new Set(SOURCES.map((s) => s.publisher)).size} publishers, plus GNews top headlines {gnewsApiKey() ? "(enabled)" : "(off until GNEWS_API_KEY is set)"}. News mode: <strong>{newsMode() === "sample" ? "sample data (NEWS_MODE=sample)" : "live feeds"}</strong>.
          {lastRun ? ` Last refresh ${formatTime(lastRun.finishedAt, prefs.timezone)} (${lastRun.trigger.replace("_", "-")}), ${lastRun.inserted} new articles.` : " Feeds have not been fetched yet."}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] font-sans text-xs">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-1.5 pr-3 font-semibold">Feed</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Region</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Last success</th>
                <th scope="col" className="py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {ALL_SOURCES.map((s) => {
                const h = healthById.get(s.id);
                const off = s.kind === "gnews" && !gnewsApiKey();
                return (
                  <tr key={s.id}>
                    <td className="py-1.5 pr-3"><a className="hover:underline" href={s.homepage} target="_blank" rel="noopener noreferrer">{s.name}</a></td>
                    <td className="py-1.5 pr-3 text-muted">{s.region === "GLOBAL" ? "International" : regionName(s.region)}</td>
                    <td className="py-1.5 pr-3 text-muted">{h?.lastSuccessAt ? formatTime(h.lastSuccessAt, prefs.timezone) : "—"}</td>
                    <td className={`py-1.5 ${STATUS_STYLE[h?.lastStatus ?? ""] ?? "text-muted"}`} title={h?.lastError ?? undefined}>
                      {off ? "off · needs GNEWS_API_KEY" : h?.lastStatus ? `${h.lastStatus.replace("_", " ")}${h.lastStatus === "ok" ? ` · ${h.lastItemCount} items` : ""}` : "not fetched yet"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section id="data" aria-labelledby="data-h" className="scroll-mt-24 border-t border-rule py-8">
        <h2 id="data-h" className="font-display text-2xl font-bold">Your data</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <li>
            <strong>Storage:</strong>{" "}
            {storageMode() === "supabase"
              ? "Your account, preferences, editions, saved stories and feedback are stored in Supabase Postgres, protected by row-level security so only you can read them."
              : "Demo mode. Your profile is identified by an anonymous browser cookie and stored on this server only. It is not an account and is not synced across devices; on serverless hosting it may be cleared when the server restarts."}
          </li>
          <li>
            <strong>AI:</strong> {llm ? `Summaries and analysis use ${llm.provider} (${llm.model}), called only from the server. Article text is sent to the provider; your name, region and followed sections are included for personalisation.` : llmStatusNote()}
          </li>
          <li><strong>Collected:</strong> only what you enter here (name optional) and the feedback actions you take. No location tracking, no third-party analytics.</li>
        </ul>
      </section>
    </div>
  );
}
