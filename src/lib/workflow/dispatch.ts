import { aiHandle } from "../ai/handle";
import type { AiHandle } from "../edition/generate";
import { LIMITS } from "../env";
import { editionDateFor } from "../preferences";
import { RunBusyError, type Store } from "../store/types";
import { errorMessage } from "./errors";
import { runEditionWorkflow, type RunEditionOptions } from "./runner";
import { dueNow } from "./schedule";

export interface DispatchReport {
  considered: number;
  due: number;
  deliveryRuns: number;
  prepared: number;
  alreadyDone: number;
  busy: number;
  failed: number;
  stoppedForTime: boolean;
  /** Seconds between when each started delivery was due and when it started (scheduler delay). */
  delaysSeconds: number[];
}

export interface DispatchOptions {
  store: Store;
  appUrl: string;
  budgetMs: number;
  /** "deliver": readers whose delivery time has passed. "prepare": everyone without today's paper. */
  mode: "deliver" | "prepare";
  useAi: boolean;
  now?: () => Date;
  log: (m: string, d?: Record<string, unknown>) => void;
  run?: typeof runEditionWorkflow;
  ai?: AiHandle | null;
}

/**
 * The scheduler's single entry point (called by Vercel Cron and GitHub Actions through
 * /api/cron/*). Readers are processed one at a time inside a time budget; each reader's work is
 * a workflow run with idempotency key `<mode>:<local date>`, so calling this twice, or retrying
 * after a timeout, never produces a second paper or a second email for the same day.
 */
export async function dispatch(opts: DispatchOptions): Promise<DispatchReport> {
  const now = opts.now ?? (() => new Date());
  const started = Date.now();
  const run = opts.run ?? runEditionWorkflow;
  const ai = opts.ai !== undefined ? opts.ai : opts.useAi ? aiHandle() : null;
  const readers = await opts.store.listReadersForPreparation(LIMITS.cronEditionsPerRun * (opts.mode === "deliver" ? 5 : 1));
  const report: DispatchReport = { considered: readers.length, due: 0, deliveryRuns: 0, prepared: 0, alreadyDone: 0, busy: 0, failed: 0, stoppedForTime: false, delaysSeconds: [] };

  for (const userId of readers) {
    if (Date.now() - started > opts.budgetMs) {
      report.stoppedForTime = true;
      break;
    }
    try {
      const prefs = await opts.store.getPreferences(userId);
      if (!prefs?.onboardedAt) continue;
      const at = now();
      let options: RunEditionOptions;
      if (opts.mode === "deliver") {
        const due = dueNow(prefs, at);
        if (!due.due) continue;
        report.due++;
        const email = await opts.store.getReaderEmail(userId);
        options = { store: opts.store, userId, prefs, trigger: "scheduled", idempotencyKey: `scheduled:${due.localDate}`, mode: "ensure", ai, refreshNews: false, scheduledFor: due.scheduledFor, deliver: { email, appUrl: opts.appUrl, format: prefs.delivery.format }, now, log: opts.log };
      } else {
        const date = editionDateFor(prefs.timezone, at);
        if (await opts.store.latestEdition(userId, date)) {
          report.alreadyDone++;
          continue;
        }
        options = { store: opts.store, userId, prefs, trigger: "prepare", idempotencyKey: `prepare:${date}`, mode: "ensure", ai, refreshNews: false, now, log: opts.log };
      }
      const result = await run(options);
      if (!result.reused && options.scheduledFor) report.delaysSeconds.push(Math.max(0, Math.round((at.getTime() - options.scheduledFor.getTime()) / 1000)));
      if (result.reused) report.alreadyDone++;
      else if (opts.mode === "deliver") report.deliveryRuns++;
      else report.prepared++;
    } catch (err) {
      if (err instanceof RunBusyError) report.busy++;
      else report.failed++;
      opts.log("dispatch_reader_failed", { user: userId.slice(0, 8), mode: opts.mode, error: errorMessage(err) });
    }
  }
  return report;
}

/** Public base URL for links in emails: APP_URL, else the request's own origin. */
export function appUrlFor(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  return new URL(req.url).origin;
}
