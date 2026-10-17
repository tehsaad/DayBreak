import { createHash } from "node:crypto";
import { classifyArticle, headlineSimilarity } from "../topics";
import { cleanText, htmlToText, stripFeedBoilerplate, truncateText } from "../text";
import { parseExternalUrl, safeImageUrl } from "../security/url";
import type { Article } from "../types";
import type { RawFeedItem } from "./parse";
import type { SourceDef } from "./sources";

const TRACKING_PARAMS = /^(utm_.+|at_.+|fbclid|gclid|dclid|mc_cid|mc_eid|cmpid|ref|ref_src|ocid|ito|guccounter|src|feature|CMP|smid|taid|mbid|rss)$/i;

/**
 * Canonical form of an article URL used for deduplication: lower-case host without "www.",
 * no tracking parameters, no fragment, sorted query, no trailing slash, scheme ignored.
 */
export function normalizeUrl(raw: string): string | null {
  const url = parseExternalUrl(raw);
  if (!url) return null;
  url.hash = "";
  const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [k, v] of params) url.searchParams.append(k, v);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  const query = url.searchParams.toString();
  return `${host}${path}${query ? `?${query}` : ""}`;
}

/** Clean link to store and show: original scheme/host, tracking parameters removed. */
export function cleanArticleUrl(raw: string): string | null {
  const url = parseExternalUrl(raw);
  if (!url) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  return url.toString();
}

export function articleIdFor(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 24);
}

function pickImage(candidates: RawFeedItem["imageCandidates"]): string | null {
  const sorted = [...candidates].sort((a, b) => b.width - a.width);
  for (const c of sorted) {
    let url = safeImageUrl(c.url.trim());
    if (!url) continue;
    // BBC serves the same image at larger widths by path; ask for a newspaper-sized one.
    url = url.replace(/(ichef\.bbci\.co\.uk\/(?:ace|news)\/(?:standard|ws)\/)\d+\//, "$1976/");
    return url;
  }
  return null;
}

export function parseDate(raw: string | null, now: Date): string | null {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  if (d.getUTCFullYear() < 2000) return null;
  // Clamp small clock skews; reject dates far in the future.
  if (t > now.getTime() + 6 * 3600_000) return null;
  return new Date(Math.min(t, now.getTime())).toISOString();
}

const MAX_EXCERPT = 480;
const MAX_EXCERPT_FULLTEXT_FEEDS = 300;

/**
 * Turn a raw feed item into an Article, or null when it is unusable (no title, unsafe URL).
 * Only a short excerpt of the description is kept — never the full article text.
 */
export function normalizeItem(item: RawFeedItem, source: SourceDef, now: Date = new Date()): Article | null {
  const title = truncateText(cleanText(htmlToText(item.title)), 300);
  if (title.length < 8) return null;
  const link = cleanArticleUrl(item.link.trim());
  const normalized = link ? normalizeUrl(link) : null;
  if (!link || !normalized) return null;

  const rawDescription = item.description || item.content;
  let description = stripFeedBoilerplate(htmlToText(rawDescription));
  if (description.toLowerCase() === title.toLowerCase()) description = "";
  description = truncateText(description, source.fullTextInFeed ? MAX_EXCERPT_FULLTEXT_FEEDS : MAX_EXCERPT);

  const author = item.author ? truncateText(cleanText(htmlToText(item.author)), 120) || null : null;
  const categories = item.categories.map((c) => cleanText(htmlToText(c))).filter((c) => c.length > 0 && c.length < 60).slice(0, 12);
  const { topics, regions } = classifyArticle({
    title,
    description,
    categories,
    sourceTopics: source.topics,
    sourceRegion: source.region,
    localByDefault: source.localByDefault,
  });

  return {
    id: articleIdFor(normalized),
    url: link,
    title,
    description,
    publisher: item.publisher ? truncateText(cleanText(item.publisher), 80) : source.publisher,
    sourceId: source.id,
    author,
    imageUrl: pickImage(item.imageCandidates),
    publishedAt: parseDate(item.published, now),
    collectedAt: now.toISOString(),
    topics,
    regions,
    categories,
    sample: false,
  };
}

/** Threshold above which two headlines are treated as the same story. */
export const DUPLICATE_SIMILARITY = 0.62;

/**
 * Remove exact (same canonical URL) and near (very similar headline from the same publisher)
 * duplicates. Cross-publisher coverage of the same event is kept — it is clustered later so the
 * reader sees one story with "also reported by".
 */
export function dedupeArticles(articles: Article[]): Article[] {
  const byId = new Map<string, Article>();
  for (const a of articles) {
    const existing = byId.get(a.id);
    if (!existing || richness(a) > richness(existing)) byId.set(a.id, a);
  }
  const out: Article[] = [];
  for (const a of [...byId.values()].sort((x, y) => richness(y) - richness(x))) {
    const dup = out.find(
      (b) => b.publisher === a.publisher && (b.title.toLowerCase() === a.title.toLowerCase() || headlineSimilarity(a.title, b.title) >= DUPLICATE_SIMILARITY),
    );
    if (!dup) out.push(a);
  }
  return out;
}

function richness(a: Article): number {
  return (a.description ? Math.min(a.description.length, 300) / 100 : 0) + (a.imageUrl ? 1 : 0) + (a.publishedAt ? 1 : 0) + (a.author ? 0.3 : 0);
}
