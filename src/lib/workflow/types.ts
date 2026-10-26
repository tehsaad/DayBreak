/**
 * The edition workflow: one persisted record per attempt to produce (and optionally deliver) a
 * reader's newspaper. Manual generation, the nightly prepare cron and scheduled delivery all run
 * through the same stages, so their status, timing and failures are recorded the same way.
 *
 *   fetch → rank → summarize → verify → render → deliver
 */
export const STAGES = ["fetch", "rank", "summarize", "verify", "render", "deliver"] as const;
export type StageName = (typeof STAGES)[number];

/** "degraded": the stage finished with a documented fallback (e.g. publisher excerpts instead of AI summaries). */
export type StageStatus = "pending" | "running" | "succeeded" | "degraded" | "skipped" | "failed";

/** "partial": the edition exists but a later stage (delivery) failed; retrying resumes from there. */
export type RunStatus = "pending" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export type RunTrigger = "manual" | "prepare" | "scheduled" | "retry";

export type StageMetric = number | string | boolean | null;

export interface StageRecord {
  name: StageName;
  status: StageStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  attempts: number;
  metrics: Record<string, StageMetric>;
  error: string | null;
  /** Why a stage was degraded or skipped, in plain words. */
  note: string | null;
}

export interface RunError {
  stage: StageName | "workflow";
  message: string;
  transient: boolean;
}

export interface RunUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Estimated from LLM_PRICE_* settings; null when no prices are configured ("not measured"). */
  estimatedCostUsd: number | null;
  model: string | null;
}

export interface WorkflowRun {
  id: string;
  userId: string;
  trigger: RunTrigger;
  /**
   * Unique per reader. Scheduled and prepare runs use `<trigger>:<local date>` so a retried or
   * duplicated cron call resumes the same run instead of producing a second paper or email.
   */
  idempotencyKey: string;
  status: RunStatus;
  /** The reader's local date the edition belongs to. */
  editionDate: string;
  /** When a scheduled run was due (UTC ISO), for delay measurement. */
  scheduledFor: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  attempt: number;
  stages: StageRecord[];
  editionId: string | null;
  /** True when the run produced a new edition revision, false when it reused one. */
  editionCreated: boolean | null;
  deliver: boolean;
  usage: RunUsage;
  error: RunError | null;
  cancelRequested: boolean;
  updatedAt: string;
}

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";
export type DeliveryFormat = "link" | "pdf" | "both";

export interface Delivery {
  /** `edition:<editionId>:email` — also the provider idempotency key. */
  key: string;
  userId: string;
  editionId: string;
  runId: string;
  channel: "email";
  format: DeliveryFormat;
  status: DeliveryStatus;
  attempts: number;
  /** Provider message id when the provider accepted it (acceptance, not proof of inbox delivery). */
  providerId: string | null;
  transport: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function emptyStages(): StageRecord[] {
  return STAGES.map((name) => ({ name, status: "pending", startedAt: null, finishedAt: null, durationMs: null, attempts: 0, metrics: {}, error: null, note: null }));
}

/** Minutes after which a "running" run is treated as abandoned (the function was killed). */
export const STALE_RUN_MINUTES = 10;

export function isStale(run: WorkflowRun, now: Date): boolean {
  return run.status === "running" && now.getTime() - Date.parse(run.updatedAt) > STALE_RUN_MINUTES * 60_000;
}
