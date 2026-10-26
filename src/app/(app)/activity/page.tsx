import type { Metadata } from "next";
import Link from "next/link";
import { RunActions } from "@/components/run-actions";
import { formatTime } from "@/components/paper/format";
import { emailTransport } from "@/lib/email/transport";
import { editionDateFor } from "@/lib/preferences";
import { requireReader } from "@/lib/server/page-reader";
import { nextDelivery } from "@/lib/workflow/schedule";
import { isStale, type RunStatus, type StageRecord, type WorkflowRun } from "@/lib/workflow/types";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const RUN_STYLE: Record<RunStatus, string> = {
  succeeded: "bg-forest-soft text-forest",
  partial: "bg-warn-soft text-warn",
  failed: "bg-accent-soft text-accent",
  cancelled: "bg-paper-deep text-muted",
  running: "bg-paper-deep text-ink",
  pending: "bg-paper-deep text-muted",
};

const STAGE_STYLE: Record<StageRecord["status"], string> = {
  succeeded: "border-forest bg-forest-soft text-forest",
  degraded: "border-warn bg-warn-soft text-warn",
  failed: "border-accent bg-accent-soft text-accent",
  skipped: "border-rule bg-paper text-muted",
  running: "border-ink bg-paper-deep text-ink",
  pending: "border-rule bg-paper text-muted",
};

const TRIGGER_LABEL: Record<WorkflowRun["trigger"], string> = {
  manual: "You asked for it",
  prepare: "Prepared overnight",
  scheduled: "Scheduled delivery",
  retry: "Retried",
};

const ms = (n: number | null) => (n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

function metricText(stage: StageRecord): string {
  const m = stage.metrics;
  switch (stage.name) {
    case "fetch":
      return m.candidates != null ? `${m.candidates} candidate articles${m.refreshed ? `, feeds refreshed (+${m.inserted ?? 0})` : ""}${m.contentMode === "sample" ? " · sample data" : ""}` : "";
    case "rank":
      return m.selected != null ? `${m.selected} of ${m.candidates} selected · ${m.sections} sections` : "";
    case "summarize":
      return m.aiSummaries != null ? `${m.aiSummaries} AI summaries (${m.cachedSummaries} reused) · ${m.rejectedByValidator} rejected by validator${m.inputTokens != null ? ` · ${m.inputTokens}/${m.outputTokens} tokens in/out` : ""}` : "";
    case "verify":
      return m.checked != null ? `${m.aiSummaries} AI, ${m.sourceSummaries} publisher excerpts · ${m.reverted} reverted` : "";
    case "render":
      return m.stories != null ? `${m.stories} stories · revision ${m.revision}${m.created === false ? " (already existed)" : ""}` : "";
    case "deliver":
      return m.status ? `${m.status} via ${m.transport} (${m.format})${m.deduplicated ? " · duplicate prevented" : ""}` : "";
  }
}

export default async function ActivityPage() {
  const { reader, prefs } = await requireReader("/activity");
  let runs: WorkflowRun[] = [];
  let unavailable = false;
  try {
    runs = await reader.store.listWorkflowRuns(reader.userId, 25);
  } catch {
    unavailable = true;
  }
  const deliveries = unavailable ? [] : await reader.store.listDeliveries(reader.userId, 10).catch(() => []);
  const now = new Date();
  const todayDone = runs.some((r) => r.idempotencyKey === `scheduled:${editionDateFor(prefs.timezone, now)}` && r.status === "succeeded");
  const next = nextDelivery(prefs, now, { todayDone });
  const finished = runs.filter((r) => r.status !== "running" && r.status !== "pending");
  const ok = finished.filter((r) => r.status === "succeeded").length;
  const durations = finished.filter((r) => r.status === "succeeded" && r.durationMs != null).map((r) => r.durationMs!).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)]! : null;
  const tokens = runs.reduce((n, r) => n + (r.usage.inputTokens ?? 0) + (r.usage.outputTokens ?? 0), 0);
  const cost = runs.some((r) => r.usage.estimatedCostUsd != null) ? runs.reduce((n, r) => n + (r.usage.estimatedCostUsd ?? 0), 0) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Activity</h1>
      <p className="mt-2 text-ink-soft">Every time DAYBREAK prepares or delivers your paper, each step is recorded here: what ran, how long it took, and what went wrong.</p>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-rule bg-rule font-sans sm:grid-cols-4">
        {[
          ["Next delivery", prefs.delivery.enabled ? (next ? formatTime(next.toISOString(), prefs.timezone) : "—") : "Off"],
          ["Runs succeeded", finished.length ? `${ok} of ${finished.length}` : "—"],
          ["Typical run time", median != null ? ms(median) : "—"],
          ["AI tokens (recent runs)", tokens ? `${tokens.toLocaleString("en-GB")}${cost != null ? ` · ~$${cost.toFixed(4)}` : ""}` : "none recorded"],
        ].map(([k, v]) => (
          <div key={k} className="bg-paper-card p-3">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">{k}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {!prefs.delivery.enabled ? (
        <p className="mt-3 font-sans text-sm text-ink-soft">
          Scheduled email delivery is off. <Link href="/settings#delivery" className="font-semibold underline">Turn it on in Settings</Link>.
        </p>
      ) : null}

      {unavailable ? (
        <p className="mt-8 border border-warn bg-warn-soft p-4 font-sans text-sm text-warn">
          Run history isn&apos;t available on this server yet (the database migration for workflow runs has not been applied). Your paper still works normally.
        </p>
      ) : runs.length === 0 ? (
        <p className="mt-8 font-sans text-sm text-muted">No runs yet. <Link href="/newspaper" className="font-semibold text-ink underline">Print today&apos;s paper</Link> and it will appear here.</p>
      ) : (
        <ol className="mt-8 space-y-4">
          {runs.map((r) => {
            const stale = isStale(r, now);
            const shownStatus: RunStatus = stale ? "failed" : r.status;
            return (
              <li key={r.id} className="border border-rule bg-paper-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-sans text-sm">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${RUN_STYLE[shownStatus]}`}>{stale ? "stalled" : r.status}</span>
                    <span className="font-semibold">{TRIGGER_LABEL[r.trigger]}</span>
                    <span className="text-muted">
                      {formatTime(r.createdAt, prefs.timezone)} · {ms(r.durationMs)}
                      {r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.editionId ? <Link href={`/newspaper/${r.editionId}`} className="font-sans text-xs font-semibold underline">Open edition</Link> : null}
                    <RunActions runId={r.id} canRetry={["failed", "partial", "cancelled"].includes(r.status) || stale} canCancel={r.status === "running" && !stale} />
                  </div>
                </div>
                {r.error ? (
                  <p className="mt-2 font-sans text-sm text-accent">
                    {r.error.stage === "deliver" ? "Your paper was made, but the email failed: " : r.error.stage === "workflow" ? "" : `Failed at “${r.error.stage}”: `}
                    {r.error.message} {r.error.transient ? "(temporary — retrying should help)" : ""}
                  </p>
                ) : null}
                {r.scheduledFor && r.startedAt ? (
                  <p className="meta mt-1">Due {formatTime(r.scheduledFor, prefs.timezone)}, started {Math.max(0, Math.round((Date.parse(r.startedAt) - Date.parse(r.scheduledFor)) / 60_000))} min later.</p>
                ) : null}
                <ol className="mt-3 grid gap-1.5 sm:grid-cols-6" aria-label="Stages">
                  {r.stages.map((s) => (
                    <li key={s.name} className={`border-l-4 px-2 py-1.5 font-sans text-xs ${STAGE_STYLE[s.status]}`} title={[metricText(s), s.note, s.error].filter(Boolean).join(" — ")}>
                      <span className="block font-semibold capitalize">{s.name}</span>
                      <span className="block">{s.status}{s.durationMs ? ` · ${ms(s.durationMs)}` : ""}{s.attempts > 1 ? ` · ${s.attempts} tries` : ""}</span>
                    </li>
                  ))}
                </ol>
                <details className="mt-2 font-sans text-xs text-ink-soft">
                  <summary className="cursor-pointer text-muted">Details</summary>
                  <ul className="mt-2 space-y-1">
                    {r.stages.map((s) => (
                      <li key={s.name}>
                        <strong className="capitalize">{s.name}:</strong> {[metricText(s), s.note, s.error].filter(Boolean).join(" — ") || s.status}
                      </li>
                    ))}
                    {r.usage.model ? <li><strong>Model:</strong> {r.usage.model}{r.usage.estimatedCostUsd != null ? ` · estimated cost $${r.usage.estimatedCostUsd.toFixed(5)}` : " · cost not measured (no LLM_PRICE_* configured)"}</li> : null}
                    <li className="text-muted">Run {r.id.slice(0, 8)} · key {r.idempotencyKey.startsWith("manual:") ? "manual" : r.idempotencyKey}</li>
                  </ul>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {deliveries.length ? (
        <section aria-labelledby="deliveries-h" className="mt-10 border-t border-rule pt-6">
          <h2 id="deliveries-h" className="font-display text-2xl font-bold">Emails</h2>
          <p className="mt-1 text-sm text-ink-soft">“Sent” means the email provider accepted the message; it does not confirm it reached your inbox. Transport: {emailTransport()}.</p>
          <table className="mt-3 w-full font-sans text-xs">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-1.5 pr-3">When</th>
                <th scope="col" className="py-1.5 pr-3">Status</th>
                <th scope="col" className="py-1.5 pr-3">Format</th>
                <th scope="col" className="py-1.5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {deliveries.map((d) => (
                <tr key={d.key}>
                  <td className="py-1.5 pr-3 text-muted">{formatTime(d.updatedAt, prefs.timezone)}</td>
                  <td className="py-1.5 pr-3 font-semibold">{d.status}{d.attempts > 1 ? ` (${d.attempts} attempts)` : ""}</td>
                  <td className="py-1.5 pr-3">{d.format}</td>
                  <td className="py-1.5 text-muted">{d.error ?? (d.providerId ? `id ${d.providerId.slice(0, 18)}` : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
