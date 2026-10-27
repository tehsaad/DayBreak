import { gnewsApiKey, clampInt } from "../env";
import { safeFetch } from "../security/safe-fetch";
import type { Store } from "../store/types";
import type { Article } from "../types";
import { gnewsSearchUrl, parseGNews, redactKey } from "./gnews";
import { dedupeArticles, normalizeItem } from "./normalize";
import { GNEWS_SEARCH_SOURCE } from "./sources";

export type WebSearchStatus = "ok" | "not_configured" | "budget_exhausted" | "rate_limited" | "error";

export interface WebSearchResult {
  status: WebSearchStatus;
  articles: Article[];
  /** When these results were fetched from GNews (older than now when served from cache). */
  fetchedAt: string | null;
  cached: boolean;
  message: string | null;
}

/**
 * Reader-initiated web news search through the GNews search API — the same documented provider
 * and key DAYBREAK already uses for headlines. Results are real articles with their publisher's
 * own URL; they are normalised and stored like ingested news so they can be opened, saved and
 * de-duplicated. GNews' free plan allows 100 requests a day shared with ingestion, so searches
 * are cached for 30 minutes and capped per instance per day (WEB_SEARCH_DAILY_LIMIT).
 */
const CACHE_MS = 30 * 60_000;
const cache = new Map<string, { at: number; articles: Article[] }>();
let budget = { day: "", used: 0 };

export function webSearchAvailable(): boolean {
  return Boolean(gnewsApiKey());
}

export async function searchWebNews(store: Store, query: string, days: number, opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<WebSearchResult> {
  const now = opts.now ?? new Date();
  const key = gnewsApiKey();
  if (!key) return { status: "not_configured", articles: [], fetchedAt: null, cached: false, message: "Web search needs GNEWS_API_KEY on the server." };
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { status: "error", articles: [], fetchedAt: null, cached: false, message: "Type at least two characters." };
  const cacheKey = `${q.toLowerCase()}|${days}`;
  const hit = cache.get(cacheKey);
  if (hit && now.getTime() - hit.at < CACHE_MS) return { status: "ok", articles: hit.articles, fetchedAt: new Date(hit.at).toISOString(), cached: true, message: null };

  const today = now.toISOString().slice(0, 10);
  if (budget.day !== today) budget = { day: today, used: 0 };
  const limit = clampInt(process.env.WEB_SEARCH_DAILY_LIMIT, 0, 100, 25);
  if (budget.used >= limit) return { status: "budget_exhausted", articles: [], fetchedAt: null, cached: false, message: "Today's web-search allowance is used up (it protects the free GNews quota). Stored news search still works." };
  budget.used++;

  try {
    const res = await safeFetch(gnewsSearchUrl(q, { apiKey: key, from: new Date(now.getTime() - days * 86_400_000) }), { timeoutMs: 6000, headers: { accept: "application/json" }, accept: ["application/json"], fetchImpl: opts.fetchImpl, maxBytes: 1_000_000, maxRedirects: 0 });
    if (res.status === 429) return { status: "rate_limited", articles: [], fetchedAt: null, cached: false, message: "GNews' daily quota is used up; try again tomorrow." };
    if (res.status !== 200) return { status: "error", articles: [], fetchedAt: null, cached: false, message: `GNews returned HTTP ${res.status}.` };
    const articles = dedupeArticles(parseGNews(res.body.toString("utf8")).map((i) => normalizeItem(i, GNEWS_SEARCH_SOURCE, now)).filter((a): a is Article => a !== null));
    // Store them so "Save" and story pages work exactly as for ingested news.
    if (articles.length) await store.upsertArticles(articles);
    const stored = articles.length ? await store.getArticles(articles.map((a) => a.id)) : [];
    const byId = new Map(stored.map((a) => [a.id, a]));
    const final = articles.map((a) => byId.get(a.id) ?? a);
    cache.set(cacheKey, { at: now.getTime(), articles: final });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return { status: "ok", articles: final, fetchedAt: now.toISOString(), cached: false, message: null };
  } catch (err) {
    return { status: "error", articles: [], fetchedAt: null, cached: false, message: redactKey((err as Error).message ?? "Search failed", key).slice(0, 160) };
  }
}

export function resetWebSearchForTests() {
  cache.clear();
  budget = { day: "", used: 0 };
}
