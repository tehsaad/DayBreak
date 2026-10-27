import { NO_RETRY, type RetryPolicy } from "./errors";
import type { StageMetric, StageName } from "./types";

export interface StageOutcome {
  metrics?: Record<string, StageMetric>;
  /** Defaults to "succeeded". */
  status?: "succeeded" | "degraded" | "skipped";
  note?: string | null;
}

/**
 * How pipeline code reports its stages. Edition generation calls `run` around each step; the
 * workflow runner implements it with timing, retries, persistence and cancellation checks.
 */
export interface StageTracker {
  run<T>(name: StageName, fn: () => Promise<T>, describe?: (value: T) => StageOutcome, retry?: RetryPolicy): Promise<T>;
  skip(name: StageName, note: string): Promise<void>;
}

/** Runs stages without recording them (tests, scripts, evaluation). */
export const untracked: StageTracker = {
  run: (_name, fn) => fn(),
  skip: async () => undefined,
};

export { NO_RETRY };
