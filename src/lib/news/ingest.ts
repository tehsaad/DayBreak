import { randomUUID } from "node:crypto";
import { gnewsApiKey, LIMITS } from "../env";
import { safeFetch } from "../security/safe-fetch";
import type { Store } from "../store/types";
import type { Article, FetchOutcome, IngestionRun, SourceHealth } from "../types";
import { dedupeArticles, normalizeItem } from "./normalize";
import { gnewsRequestUrl, parseGNews, redactKey } from "./gnews";
import { parseFeed } from "./parse";
import { activeSources, type SourceDef } from "./sources";

export interface IngestOptions {
  store: Store;
  trigger: IngestionRun["trigger"];
  sources?: SourceDef[];
  /** Total wall-clock budget. Sources not started within it are reported as skipped_budget. */
  budgetMs?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Ignore freshness windows (still respects backoff for failing feeds). */
  force?: boolean;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

const FEED_TYPES = ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "application/rdf+xml", "text/html", "application/octet-stream", "text/plain"];

function emptyHealth(sourceId: string): SourceHealth {
  return { sourceId, lastFetchedAt: null, lastSuccessAt: null, lastStatus: null, lastError: null, consecutiveFailures: 0, lastItemCount: 0, etag: null, lastModified: null };
}

/** Minutes to wait before retrying a feed that keeps failing: 15, 30, 60 … capped at 12 hours. */
export function backoffMinutes(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(720, 15 * 2 ** (failures - 3));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SourceResult {
  sourceId: string;
  outcome: FetchOutcome;
  items: Article[];
  error?: string;
  ms: number;
  health: SourceHealth;
}

async function fetchGNews(source: SourceDef, health: SourceHealth, opts: Required<Pick<IngestOptions, "timeoutMs">> & IngestOptions, now: Date): Promise<SourceResult> {
  const started = Date.now();
  const h: SourceHealth = { ...health, lastFetchedAt: now.toISOString() };
  const key = gnewsApiKey();
  const fail = (outcome: FetchOutcome, message: string, countFailure = true): SourceResult => {
    const error = redactKey(message, key).slice(0, 300);
    return { sourceId: source.id, outcome, items: [], error, ms: Date.now() - started, health: { ...h, lastStatus: outcome, lastError: error, consecutiveFailures: countFailure ? h.consecutiveFailures + 1 : h.consecutiveFailures } };
  };
  if (!key) return fail("error", "GNEWS_API_KEY is not set", false);
  try {
    const res = await safeFetch(gnewsRequestUrl(source, key), { timeoutMs: opts.timeoutMs, headers: { accept: "application/json" }, accept: ["application/json"], fetchImpl: opts.fetchImpl, maxBytes: 1_000_000, maxRedirects: 0 });
    if (res.status === 429) return fail("rate_limited", "GNews daily request quota reached (HTTP 429)");
    if (res.status === 401 || res.status === 403) return fail("error", `GNews rejected the API key (HTTP ${res.status})`);
    if (res.status !== 200) return fail("error", `GNews HTTP ${res.status}`);
    const items = parseGNews(res.body.toString("utf8"))
      .map((i) => normalizeItem(i, source, now))
      .filter((a): a is Article => a !== null);
    return {
      sourceId: source.id,
      outcome: items.length ? "ok" : "empty",
      items,
      ms: Date.now() - started,
      health: { ...h, lastSuccessAt: now.toISOString(), lastStatus: items.length ? "ok" : "empty", lastError: null, consecutiveFailures: 0, lastItemCount: items.length, etag: null, lastModified: null },
    };
  } catch (err) {
    return fail("error", err instanceof Error ? err.message : String(err));
  }
}

async function fetchSource(source: SourceDef, health: SourceHealth, opts: Required<Pick<IngestOptions, "timeoutMs">> & IngestOptions, now: Date): Promise<SourceResult> {
  if (source.kind === "gnews") return fetchGNews(source, health, opts, now);
  const started = Date.now();
  const h: SourceHealth = { ...health, lastFetchedAt: now.toISOString() };
  const headers: Record<string, string> = { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5" };
  if (health.etag) headers["if-none-match"] = health.etag;
  if (health.lastModified) headers["if-modified-since"] = health.lastModified;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await safeFetch(source.feedUrl, { timeoutMs: opts.timeoutMs, headers, accept: FEED_TYPES, fetchImpl: opts.fetchImpl, maxBytes: 4_000_000 });
      if (res.status === 304) {
        return { sourceId: source.id, outcome: "not_modified", items: [], ms: Date.now() - started, health: { ...h, lastSuccessAt: now.toISOString(), lastStatus: "not_modified", lastError: null, consecutiveFailures: 0 } };
      }
      if (res.status === 429) {
        return { sourceId: source.id, outcome: "rate_limited", items: [], error: "HTTP 429", ms: Date.now() - started, health: { ...h, lastStatus: "rate_limited", lastError: "Rate limited by publisher (HTTP 429)", consecutiveFailures: h.consecutiveFailures + 1 } };
      }
      if (res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        if (attempt === 0) {
          await sleep(400);
          continue;
        }
        break;
      }
      if (res.status !== 200) {
        lastError = `HTTP ${res.status}`;
        break;
      }
      const feed = parseFeed(res.body.toString("utf8"));
      const items = feed.items.map((i) => normalizeItem(i, source, now)).filter((a): a is Article => a !== null);
      return {
        sourceId: source.id,
        outcome: items.length ? "ok" : "empty",
        items,
        ms: Date.now() - started,
        health: {
          ...h,
          lastSuccessAt: now.toISOString(),
          lastStatus: items.length ? "ok" : "empty",
          lastError: null,
          consecutiveFailures: 0,
          lastItemCount: items.length,
          etag: res.headers.get("etag"),
          lastModified: res.headers.get("last-modified"),
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Retry network errors and timeouts once; parsing/safety errors are not transient.
      if (attempt === 0 && !/not an allowed|non-public|Invalid XML|not an RSS|content type/i.test(lastError)) {
        await sleep(400);
        continue;
      }
      break;
    }
  }
  return { sourceId: source.id, outcome: "error", items: [], error: lastError.slice(0, 300), ms: Date.now() - started, health: { ...h, lastStatus: "error", lastError: lastError.slice(0, 300), consecutiveFailures: h.consecutiveFailures + 1 } };
}

/**
 * Fetch, parse, normalise, dedupe and store articles from the source registry.
 * Bounded (time budget + concurrency), idempotent (articles keyed by canonical URL) and
 * resilient: one failing feed never fails the run.
 */
export async function ingest(options: IngestOptions): Promise<IngestionRun> {
  const opts = { budgetMs: 20_000, concurrency: 6, timeoutMs: 8_000, ...options };
  const now = (opts.now ?? (() => new Date()))();
  const startedAt = now.toISOString();
  const deadline = Date.now() + opts.budgetMs;
  const log = opts.log ?? (() => undefined);

  const healthList = await opts.store.getSourceHealth();
  const healthById = new Map(healthList.map((h) => [h.sourceId, h]));
  const sources = [...(opts.sources ?? activeSources())].sort((a, b) => a.priority - b.priority);

  const results: SourceResult[] = [];
  const queue = [...sources];
  const worker = async () => {
    for (;;) {
      const source = queue.shift();
      if (!source) return;
      const health = healthById.get(source.id) ?? emptyHealth(source.id);
      const lastOk = health.lastSuccessAt ? Date.parse(health.lastSuccessAt) : 0;
      const lastTry = health.lastFetchedAt ? Date.parse(health.lastFetchedAt) : 0;
      // GNews has a daily request quota, so its interval applies even to forced refreshes.
      const isGNews = source.kind === "gnews";
      const freshMinutes = isGNews ? LIMITS.gnewsFreshMinutes : LIMITS.feedFreshMinutes;
      if ((!opts.force || isGNews) && lastOk && now.getTime() - lastOk < freshMinutes * 60_000 && health.consecutiveFailures === 0) {
        results.push({ sourceId: source.id, outcome: "skipped_fresh", items: [], ms: 0, health });
        continue;
      }
      const wait = backoffMinutes(health.consecutiveFailures);
      if (wait && now.getTime() - lastTry < wait * 60_000) {
        results.push({ sourceId: source.id, outcome: "skipped_backoff", items: [], ms: 0, health });
        continue;
      }
      if (Date.now() + Math.min(opts.timeoutMs, 4000) > deadline) {
        results.push({ sourceId: source.id, outcome: "skipped_budget", items: [], ms: 0, health });
        continue;
      }
      const remaining = Math.max(1500, Math.min(opts.timeoutMs, deadline - Date.now()));
      const r = await fetchSource(source, health, { ...opts, timeoutMs: remaining }, now);
      log("feed", { source: source.id, outcome: r.outcome, items: r.items.length, ms: r.ms, error: r.error });
      results.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, sources.length) }, worker));

  const articles = dedupeArticles(results.flatMap((r) => r.items));
  const inserted = articles.length ? await opts.store.upsertArticles(articles) : 0;
  const touched = results.filter((r) => !r.outcome.startsWith("skipped")).map((r) => r.health);
  if (touched.length) await opts.store.saveSourceHealth(touched);

  const run: IngestionRun = {
    id: randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    trigger: opts.trigger,
    inserted,
    results: results.map((r) => ({ sourceId: r.sourceId, outcome: r.outcome, items: r.items.length, ms: r.ms, ...(r.error ? { error: r.error } : {}) })),
  };
  await opts.store.recordIngestionRun(run);
  log("ingest_done", { inserted, fetched: touched.length, articles: articles.length });
  return run;
}

export function summarizeRun(run: IngestionRun) {
  const count = (o: FetchOutcome) => run.results.filter((r) => r.outcome === o).length;
  return {
    ok: count("ok"),
    empty: count("empty"),
    notModified: count("not_modified"),
    errors: count("error"),
    rateLimited: count("rate_limited"),
    skipped: count("skipped_fresh") + count("skipped_backoff") + count("skipped_budget"),
    inserted: run.inserted,
  };
}
