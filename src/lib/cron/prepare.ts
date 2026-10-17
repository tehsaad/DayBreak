import { aiHandle } from "../ai/handle";
import { generateEdition } from "../edition/generate";
import { LIMITS } from "../env";
import { editionDateFor } from "../preferences";
import type { Store } from "../store/types";

export interface PrepareReport {
  considered: number;
  prepared: number;
  alreadyHad: number;
  failed: number;
  stoppedForTime: boolean;
}

/**
 * Prepare today's edition for up to CRON_EDITIONS_PER_RUN readers within a time budget.
 * Idempotent: readers who already have today's edition are skipped, and generation itself is
 * guarded by the (user, date, revision) unique key. Safe to retry.
 */
export async function prepareEditions(store: Store, opts: { budgetMs: number; useAi: boolean; log: (m: string, d?: Record<string, unknown>) => void }): Promise<PrepareReport> {
  const started = Date.now();
  const readers = await store.listReadersForPreparation(LIMITS.cronEditionsPerRun);
  const report: PrepareReport = { considered: readers.length, prepared: 0, alreadyHad: 0, failed: 0, stoppedForTime: false };
  const ai = opts.useAi ? aiHandle() : null;
  for (const userId of readers) {
    if (Date.now() - started > opts.budgetMs) {
      report.stoppedForTime = true;
      break;
    }
    try {
      const prefs = await store.getPreferences(userId);
      if (!prefs) continue;
      const today = await store.latestEdition(userId, editionDateFor(prefs.timezone));
      if (today) {
        report.alreadyHad++;
        continue;
      }
      // News was refreshed by the ingest job; don't refetch per reader.
      await generateEdition({ store, userId, prefs, mode: "ensure", ai, refreshNews: false });
      report.prepared++;
    } catch (err) {
      report.failed++;
      opts.log("cron_prepare_failed", { user: userId.slice(0, 8), error: (err as Error).message?.slice(0, 200) });
    }
  }
  return report;
}
