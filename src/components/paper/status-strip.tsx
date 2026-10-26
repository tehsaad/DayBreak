import Link from "next/link";
import { formatTime } from "./format";
import { estimateEditionMinutes } from "@/lib/reading-time";
import type { Edition, ReaderPreferences } from "@/lib/types";
import type { WorkflowRun } from "@/lib/workflow/types";

const ms = (n: number | null) => (n == null ? "" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

/**
 * One line under the masthead that answers: how long is this paper, how was it made, did the
 * last run work, and when does the next one arrive. Every value comes from stored records.
 */
export function StatusStrip({ edition, prefs, lastRun, next }: { edition: Edition; prefs: ReaderPreferences; lastRun: WorkflowRun | null; next: Date | null }) {
  const { minutes } = estimateEditionMinutes(edition);
  const deliver = lastRun?.stages.find((s) => s.name === "deliver");
  const items: React.ReactNode[] = [
    <span key="read">About {minutes} min read (estimate)</span>,
    <span key="ai">{edition.ai.used ? `Summaries by AI (${edition.ai.model}), checked against sources` : "Summaries are publishers' own excerpts"}</span>,
  ];
  if (lastRun) {
    const label = lastRun.status === "succeeded" ? `Last run succeeded in ${ms(lastRun.durationMs)}` : lastRun.status === "partial" ? "Last run: paper ready, email failed" : lastRun.status === "running" ? "A run is in progress" : `Last run ${lastRun.status}`;
    items.push(<span key="run" className={lastRun.status === "failed" || lastRun.status === "partial" ? "text-accent" : undefined}>{label}{deliver?.status === "succeeded" ? " · emailed" : ""}</span>);
  }
  items.push(
    <span key="next">{prefs.delivery.enabled && next ? `Next email ${formatTime(next.toISOString(), prefs.timezone)}` : <Link href="/settings#delivery" className="underline">Schedule email delivery</Link>}</span>,
  );
  return (
    <div className="border-b border-rule bg-paper-deep/60">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 font-sans text-xs text-ink-soft sm:px-6">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-3">
            {i > 0 ? <span aria-hidden className="text-rule">|</span> : null}
            {item}
          </span>
        ))}
        <Link href="/activity" className="ml-auto font-semibold text-ink underline">Activity</Link>
      </p>
    </div>
  );
}
