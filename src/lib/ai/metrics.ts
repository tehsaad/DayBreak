/**
 * Per-instance LLM call metrics for /api/health: counts, error kinds and latency percentiles.
 * Only provider/model labels, HTTP status codes and error class names are kept — never prompts,
 * responses, messages or keys.
 */
interface Stat {
  calls: number;
  errors: number;
  lastErrorKind: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  latencies: number[];
}

const stats = new Map<string, Stat>();
const WINDOW = 100;

export function errorKind(err: unknown): string {
  const e = err as { statusCode?: number; status?: number; name?: string };
  const status = e?.statusCode ?? e?.status;
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "invalid_credentials";
  if (typeof status === "number") return `http_${status}`;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  return e?.name ? e.name.replace(/[^A-Za-z_]/g, "").slice(0, 40) : "error";
}

export function recordAiCall(label: string, ms: number, err: unknown) {
  const s = stats.get(label) ?? { calls: 0, errors: 0, lastErrorKind: null, lastErrorAt: null, lastSuccessAt: null, latencies: [] };
  s.calls++;
  if (err) {
    s.errors++;
    s.lastErrorKind = errorKind(err);
    s.lastErrorAt = new Date().toISOString();
  } else {
    s.lastSuccessAt = new Date().toISOString();
    s.latencies.push(ms);
    if (s.latencies.length > WINDOW) s.latencies.shift();
  }
  stats.set(label, s);
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

export function aiMetrics() {
  return Object.fromEntries(
    [...stats.entries()].map(([label, s]) => [
      label,
      { calls: s.calls, errors: s.errors, lastErrorKind: s.lastErrorKind, lastErrorAt: s.lastErrorAt, lastSuccessAt: s.lastSuccessAt, p50Ms: pct(s.latencies, 50), p95Ms: pct(s.latencies, 95) },
    ]),
  );
}

export function __resetAiMetrics() {
  stats.clear();
}
