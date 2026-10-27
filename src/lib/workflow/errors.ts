/**
 * Transient errors are worth retrying (timeouts, network resets, rate limits, 5xx); permanent ones
 * are not (validation, missing configuration, "no stories matched"). Unknown errors are treated
 * as permanent so a bug can never turn into a retry loop.
 */
export class PermanentError extends Error {
  readonly transient = false;
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

export class TransientError extends Error {
  readonly transient = true;
  constructor(message: string) {
    super(message);
    this.name = "TransientError";
  }
}

const TRANSIENT = /timeout|timed out|abort|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed|network|rate.?limit|too many requests|\b429\b|\b50[0-4]\b|temporarily|unavailable/i;

export function isTransient(err: unknown): boolean {
  if (err && typeof err === "object" && "transient" in err && typeof (err as { transient: unknown }).transient === "boolean") return (err as { transient: boolean }).transient;
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT.test(message);
}

export function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

/** Exponential backoff with full jitter: base · 2^attempt, capped. */
export function backoffDelay(attempt: number, baseMs: number, capMs: number, random = Math.random): number {
  return Math.round(random() * Math.min(capMs, baseMs * 2 ** attempt));
}

export interface RetryPolicy {
  /** Total attempts including the first. */
  attempts: number;
  baseMs: number;
  capMs: number;
}

export const NO_RETRY: RetryPolicy = { attempts: 1, baseMs: 0, capMs: 0 };

/**
 * Run `fn` with bounded retries for transient failures only. Returns the value and the number of
 * attempts used; rethrows the last error.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  opts: { sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, err: unknown, delayMs: number) => void } = {},
): Promise<{ value: T; attempts: number }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt + 1 };
    } catch (err) {
      if (attempt + 1 >= policy.attempts || !isTransient(err)) {
        (err as { attempts?: number }).attempts = attempt + 1;
        throw err;
      }
      const delay = backoffDelay(attempt, policy.baseMs, policy.capMs);
      opts.onRetry?.(attempt + 1, err, delay);
      await sleep(delay);
    }
  }
}
