import { randomUUID } from "node:crypto";
import { deliverEdition, type DeliverOptions } from "../delivery/deliver";
import { generateEdition, type AiHandle, type GenerateOptions, type GenerateResult } from "../edition/generate";
import { editionDateFor } from "../preferences";
import { RunBusyError, type Store } from "../store/types";
import type { Edition, ReaderPreferences } from "../types";
import { errorMessage, isTransient, withRetry, NO_RETRY } from "./errors";
import type { StageOutcome, StageTracker } from "./tracker";
import { emptyStages, isStale, type RunTrigger, type StageName, type StageRecord, type WorkflowRun } from "./types";

/** Scheduled/prepare runs give up for the day after this many attempts (retry budget). */
export const MAX_AUTOMATIC_ATTEMPTS = 3;

export class RunCancelledError extends Error {
  readonly transient = false;
  constructor() {
    super("Run was cancelled");
    this.name = "RunCancelledError";
  }
}

export interface RunEditionOptions {
  store: Store;
  userId: string;
  prefs: ReaderPreferences;
  trigger: RunTrigger;
  /** Defaults to a unique key for manual runs; scheduled runs pass `scheduled:<local date>`. */
  idempotencyKey?: string;
  mode: "ensure" | "regenerate";
  ai: AiHandle | null;
  refreshNews?: boolean;
  /** Deliver by email after generation. Null: generate only. */
  deliver?: { email: string | null; appUrl: string; format: DeliverOptions["format"] } | null;
  scheduledFor?: Date | null;
  /** Explicit retry of this run (from the UI): resumes it even past the automatic retry budget. */
  resumeRunId?: string;
  now?: () => Date;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  generate?: (opts: GenerateOptions) => Promise<GenerateResult>;
  deliverImpl?: typeof deliverEdition;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunEditionResult {
  run: WorkflowRun;
  /** True when an existing run already covered this key and nothing was executed. */
  reused: boolean;
  edition: Edition | null;
  generation: GenerateResult | null;
}

/** USD per million tokens from LLM_PRICE_INPUT_PER_MTOK / LLM_PRICE_OUTPUT_PER_MTOK; null when unset. */
export function estimateCostUsd(inputTokens: number | null, outputTokens: number | null, env: Record<string, string | undefined> = process.env): number | null {
  const pin = Number(env.LLM_PRICE_INPUT_PER_MTOK);
  const pout = Number(env.LLM_PRICE_OUTPUT_PER_MTOK);
  if (!env.LLM_PRICE_INPUT_PER_MTOK || !env.LLM_PRICE_OUTPUT_PER_MTOK || !Number.isFinite(pin) || !Number.isFinite(pout)) return null;
  if (inputTokens == null && outputTokens == null) return null;
  return Math.round((((inputTokens ?? 0) * pin + (outputTokens ?? 0) * pout) / 1_000_000) * 1e6) / 1e6;
}

/**
 * The one pipeline behind manual generation, the nightly prepare job and scheduled delivery:
 *
 *   claim (idempotency key, one running run per reader)
 *   → fetch → rank → summarize → verify → render   (generateEdition, each stage tracked)
 *   → deliver (optional, at most once per edition)
 *   → record (status, durations, tokens, errors)
 *
 * The run row is persisted after every stage, so a crash leaves an inspectable record, a retry
 * resumes it (skipping generation when the edition already exists) and a duplicate trigger finds
 * the finished run instead of doing the work twice. If run tracking itself is unavailable (the
 * migration is not applied yet), the pipeline still runs and logs that tracking was skipped.
 */
export async function runEditionWorkflow(opts: RunEditionOptions): Promise<RunEditionResult> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => undefined);
  const { store, userId } = opts;
  const startedAt = now();
  const editionDate = editionDateFor(opts.prefs.timezone, startedAt);
  const key = opts.idempotencyKey ?? `manual:${randomUUID()}`;
  let persist = true;

  // ---- Claim ---------------------------------------------------------------------------------
  let existing: WorkflowRun | null = null;
  try {
    existing = opts.resumeRunId ? await store.getWorkflowRun(userId, opts.resumeRunId) : await store.findWorkflowRun(userId, key);
  } catch (err) {
    persist = false;
    log("workflow_tracking_unavailable", { error: errorMessage(err) });
  }
  if (opts.resumeRunId && persist && !existing) throw new Error("Run not found");
  if (existing) {
    const explicit = Boolean(opts.resumeRunId);
    const exhausted = existing.attempt >= MAX_AUTOMATIC_ATTEMPTS && !explicit;
    if (existing.status === "succeeded" || (existing.status === "cancelled" && !explicit) || (exhausted && existing.status !== "running")) {
      return { run: existing, reused: true, edition: null, generation: null };
    }
    if (existing.status === "running" && !isStale(existing, startedAt)) throw new RunBusyError();
  }

  const stamp = () => now().toISOString();
  const run: WorkflowRun = existing
    ? { ...existing, status: "running", attempt: Math.min(20, existing.attempt + 1), error: null, cancelRequested: false, startedAt: stamp(), finishedAt: null, durationMs: null, updatedAt: stamp(), trigger: opts.resumeRunId ? "retry" : existing.trigger, deliver: Boolean(opts.deliver) }
    : {
        id: randomUUID(),
        userId,
        trigger: opts.trigger,
        idempotencyKey: key,
        status: "running",
        editionDate,
        scheduledFor: opts.scheduledFor?.toISOString() ?? null,
        createdAt: stamp(),
        startedAt: stamp(),
        finishedAt: null,
        durationMs: null,
        attempt: 1,
        stages: emptyStages(),
        editionId: null,
        editionCreated: null,
        deliver: Boolean(opts.deliver),
        usage: { inputTokens: null, outputTokens: null, estimatedCostUsd: null, model: null },
        error: null,
        cancelRequested: false,
        updatedAt: stamp(),
      };
  // A resumed run keeps the stages that already succeeded (their results are preserved).
  const resumeEdition = existing?.editionId && existing.stages.find((s) => s.name === "render")?.status === "succeeded" ? existing.editionId : null;
  if (existing) run.stages = existing.stages.map((s) => (resumeEdition && s.name !== "deliver" ? s : { ...emptyStages().find((e) => e.name === s.name)! }));

  const save = async () => {
    if (!persist) return;
    run.updatedAt = stamp();
    try {
      // Never overwrite a cancellation the reader requested while this stage was running.
      if (!run.cancelRequested && (await store.getWorkflowRun(userId, run.id).catch(() => null))?.cancelRequested) run.cancelRequested = true;
      await store.saveWorkflowRun(run);
    } catch (err) {
      if (err instanceof RunBusyError) throw err;
      log("workflow_save_failed", { run: run.id, error: errorMessage(err) });
    }
  };

  if (persist) {
    try {
      if (existing) await store.saveWorkflowRun(run);
      else {
        const created = await createWithStaleRecovery(store, run, startedAt, log);
        if (!created.created) return { run: created.run, reused: true, edition: null, generation: null };
      }
    } catch (err) {
      if (err instanceof RunBusyError) throw err;
      persist = false;
      log("workflow_tracking_unavailable", { error: errorMessage(err) });
    }
  }
  log("workflow_started", { run: run.id, trigger: run.trigger, attempt: run.attempt, user: userId.slice(0, 8) });

  const stage = (name: StageName): StageRecord => run.stages.find((s) => s.name === name)!;
  const tracker: StageTracker = {
    async run<T>(name: StageName, fn: () => Promise<T>, describe?: (value: T) => StageOutcome, retry = NO_RETRY): Promise<T> {
      if (persist) {
        const latest = await store.getWorkflowRun(userId, run.id).catch(() => null);
        if (latest?.cancelRequested || run.cancelRequested) throw new RunCancelledError();
      }
      const rec = stage(name);
      const t0 = Date.now();
      Object.assign(rec, { status: "running", startedAt: stamp(), finishedAt: null, durationMs: null, error: null, note: null, metrics: {} });
      await save();
      try {
        const { value, attempts } = await withRetry(() => fn(), retry, { sleep: opts.sleep, onRetry: (n, err, delay) => log("stage_retry", { run: run.id, stage: name, attempt: n, delay, error: errorMessage(err) }) });
        const outcome = describe?.(value) ?? {};
        Object.assign(rec, { status: outcome.status ?? "succeeded", finishedAt: stamp(), durationMs: Date.now() - t0, attempts, metrics: outcome.metrics ?? {}, note: outcome.note ?? null });
        await save();
        log("stage_done", { run: run.id, stage: name, status: rec.status, ms: rec.durationMs, attempts });
        return value;
      } catch (err) {
        Object.assign(rec, { status: "failed", finishedAt: stamp(), durationMs: Date.now() - t0, attempts: (err as { attempts?: number }).attempts ?? 1, error: errorMessage(err) });
        await save();
        log("stage_failed", { run: run.id, stage: name, ms: rec.durationMs, transient: isTransient(err), error: errorMessage(err) });
        throw Object.assign(err as object, { stage: name });
      }
    },
    async skip(name: StageName, note: string) {
      Object.assign(stage(name), { status: "skipped", note, startedAt: null, finishedAt: stamp(), durationMs: 0 });
    },
  };

  let edition: Edition | null = null;
  let generation: GenerateResult | null = null;
  const t0 = Date.now();
  try {
    if (resumeEdition) {
      edition = await store.getEdition(userId, resumeEdition);
      if (!edition) throw new Error("The edition from the earlier attempt is no longer available");
    } else {
      generation = await (opts.generate ?? generateEdition)({ store, userId, prefs: opts.prefs, mode: opts.mode, ai: opts.ai, refreshNews: opts.refreshNews, now: startedAt, log, tracker });
      edition = generation.edition;
      run.editionId = edition.id;
      run.editionCreated = generation.created;
      if (generation.usage) {
        run.usage = { ...generation.usage, estimatedCostUsd: estimateCostUsd(generation.usage.inputTokens, generation.usage.outputTokens) };
      }
    }

    if (opts.deliver) {
      const deliver = opts.deliverImpl ?? deliverEdition;
      const target = edition;
      const d = opts.deliver;
      await tracker.run(
        "deliver",
        () => deliver({ store, edition: target, runId: run.id, email: d.email, format: d.format, appUrl: d.appUrl, sleep: opts.sleep }),
        (r) => ({
          status: r.delivery.status === "skipped" ? "skipped" : r.pdfFallback ? "degraded" : "succeeded",
          note: r.deduplicated ? "Already delivered by an earlier attempt; not sent again." : r.delivery.status === "skipped" ? r.delivery.error : r.pdfFallback,
          metrics: { status: r.delivery.status, transport: r.delivery.transport, format: r.delivery.format, attempts: r.delivery.attempts, providerId: r.delivery.providerId, deduplicated: r.deduplicated },
        }),
      );
    } else {
      await tracker.skip("deliver", "Delivery was not requested for this run.");
    }
    run.status = "succeeded";
  } catch (err) {
    const failedStage = (err as { stage?: StageName }).stage;
    if (err instanceof RunCancelledError) run.status = "cancelled";
    // An edition that exists is a partial success: retrying resumes at delivery.
    else run.status = run.editionId && failedStage === "deliver" ? "partial" : "failed";
    run.error = { stage: failedStage ?? "workflow", message: errorMessage(err), transient: isTransient(err) };
    for (const s of run.stages) if (s.status === "pending" || s.status === "running") Object.assign(s, { status: "skipped", note: s.status === "running" ? "Interrupted." : "Not reached." });
    throw Object.assign(err as object, { run });
  } finally {
    run.finishedAt = stamp();
    run.durationMs = Date.now() - t0;
    await save().catch(() => undefined);
    log("workflow_finished", { run: run.id, status: run.status, ms: run.durationMs, stage: run.error?.stage ?? null });
  }
  return { run, reused: false, edition, generation };
}

/** Create the run; if an abandoned "running" run blocks it, mark that one failed and try once more. */
async function createWithStaleRecovery(store: Store, run: WorkflowRun, now: Date, log: (msg: string, data?: Record<string, unknown>) => void) {
  try {
    return await store.createWorkflowRun(run);
  } catch (err) {
    if (!(err instanceof RunBusyError)) throw err;
    const blocking = (await store.listWorkflowRuns(run.userId, 20)).find((r) => r.status === "running");
    if (!blocking || !isStale(blocking, now)) throw err;
    log("workflow_abandoned", { run: blocking.id });
    await store.saveWorkflowRun({ ...blocking, status: "failed", finishedAt: now.toISOString(), error: { stage: "workflow", message: "Abandoned: the worker stopped before finishing (timeout or restart).", transient: true }, updatedAt: now.toISOString() });
    return store.createWorkflowRun(run);
  }
}
