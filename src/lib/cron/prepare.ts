import type { Store } from "../store/types";
import { dispatch } from "../workflow/dispatch";

export interface PrepareReport {
  considered: number;
  prepared: number;
  alreadyHad: number;
  busy: number;
  failed: number;
  stoppedForTime: boolean;
}

/**
 * Prepare today's edition for up to CRON_EDITIONS_PER_RUN readers within a time budget, through
 * the same workflow runner as manual generation (trigger "prepare", key `prepare:<local date>`).
 * Idempotent: readers who already have today's edition are skipped. Safe to retry.
 */
export async function prepareEditions(store: Store, opts: { budgetMs: number; useAi: boolean; appUrl: string; log: (m: string, d?: Record<string, unknown>) => void }): Promise<PrepareReport> {
  const r = await dispatch({ store, appUrl: opts.appUrl, budgetMs: opts.budgetMs, mode: "prepare", useAi: opts.useAi, log: opts.log });
  return { considered: r.considered, prepared: r.prepared, alreadyHad: r.alreadyDone, busy: r.busy, failed: r.failed, stoppedForTime: r.stoppedForTime };
}
