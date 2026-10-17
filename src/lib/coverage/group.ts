import { specificEntities } from "../edition/evidence";
import { contentTokens, GLOBAL_REGION, headlineSimilarity } from "../topics";
import type { Article } from "../types";

/**
 * Same-event grouping for the Story Explorer. Deliberately conservative: a false "these all
 * report the same thing" is worse than missing a match, so weaker matches are only "related".
 */
export const SAME_EVENT_SIMILARITY = 0.4;
export const STRONG_SIMILARITY = 0.55;
export const RELATED_SIMILARITY = 0.2;
export const SAME_EVENT_WINDOW_HOURS = 72;

export type Confidence = "high" | "medium" | "single";

export interface Coverage {
  target: Article;
  /** One report per publisher (the target's publisher represented by the target), oldest first. */
  reports: Article[];
  related: Article[];
  confidence: Confidence;
  firstSeen: string | null;
  lastSeen: string | null;
}

const time = (a: Article) => Date.parse(a.publishedAt ?? a.collectedAt);
const lc = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));

/** Places mentioned don't contradict each other (e.g. floods in Sindh vs. floods in Kenya). */
function regionsCompatible(a: Article, b: Article): boolean {
  const ra = a.regions.filter((r) => r !== GLOBAL_REGION);
  const rb = b.regions.filter((r) => r !== GLOBAL_REGION);
  return ra.length === 0 || rb.length === 0 || ra.some((r) => rb.includes(r));
}

export interface MatchScore {
  similarity: number;
  sharedEntities: string[];
  sharedRare: number;
  sameEvent: boolean;
  related: boolean;
}

/** Rarity weights over the pool: words most reports share ("Trump", "Pakistan") count for little. */
export interface Idf {
  weight: (token: string) => number;
  rare: (token: string) => boolean;
}

export function buildIdf(pool: Article[]): Idf {
  const df = new Map<string, number>();
  for (const a of pool) for (const t of contentTokens(`${a.title} ${a.description}`)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(pool.length, 1);
  const rareAt = Math.max(3, Math.ceil(n * 0.03));
  return {
    weight: (t) => Math.log(1 + n / (1 + (df.get(t) ?? 0))),
    rare: (t) => (df.get(t) ?? 0) <= rareAt,
  };
}

function weightedOverlap(a: Set<string>, b: Set<string>, idf: Idf): { score: number; sharedRare: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, sharedRare: 0 };
  let shared = 0;
  let sharedRare = 0;
  let wa = 0;
  let wb = 0;
  for (const t of a) wa += idf.weight(t);
  for (const t of b) {
    const w = idf.weight(t);
    wb += w;
    if (a.has(t)) {
      shared += w;
      if (idf.rare(t)) sharedRare++;
    }
  }
  return { score: shared / Math.min(wa, wb), sharedRare };
}

const firstSentenceOf = (text: string) => text.split(/(?<=[.!?])\s/)[0] ?? "";

export function matchScore(a: Article, b: Article, idf: Idf = buildIdf([a, b])): MatchScore {
  const title = weightedOverlap(contentTokens(a.title), contentTokens(b.title), idf);
  const full = weightedOverlap(contentTokens(`${a.title} ${firstSentenceOf(a.description)}`), contentTokens(`${b.title} ${firstSentenceOf(b.description)}`), idf);
  const similarity = 0.65 * title.score + 0.35 * full.score;
  const sharedRare = Math.max(title.sharedRare, full.sharedRare);
  const ea = lc(specificEntities(`${a.title}. ${a.description}`));
  const sharedEntities = [...new Set(specificEntities(`${b.title}. ${b.description}`).filter((e) => ea.has(e.toLowerCase())))];
  // Both headlines name specific things and none match (Sindh vs. Kenya): different events.
  const ha = specificEntities(a.title);
  const hb = specificEntities(b.title);
  const entitiesConflict = ha.length > 0 && hb.length > 0 && sharedEntities.length === 0;
  const close = Math.abs(time(a) - time(b)) <= SAME_EVENT_WINDOW_HOURS * 3600_000;
  const compatible = regionsCompatible(a, b) && !entitiesConflict;
  // Same event, in three tiers: a very close headline backed by a rare word; a strong overlap
  // backed by rare words or specific names; or a moderate overlap on rare words plus a shared
  // name ("Trump waives … Russia sanctions"). Weights come from the pool, so generic words
  // count for little.
  const sameEvent =
    close &&
    compatible &&
    ((similarity >= 0.5 && sharedRare >= 1) ||
      (similarity >= SAME_EVENT_SIMILARITY && (sharedRare >= 2 || sharedEntities.length >= 2)) ||
      (similarity >= 0.3 && sharedRare >= 2 && sharedEntities.length >= 1));
  const related = !sameEvent && regionsCompatible(a, b) && (similarity >= RELATED_SIMILARITY || sharedEntities.length >= 2) && (a.topics[0] === b.topics[0] || sharedEntities.length >= 2);
  return { similarity, sharedEntities, sharedRare, sameEvent, related };
}

export function findCoverage(target: Article, pool: Article[]): Coverage {
  const candidates = pool.filter((a) => a.id !== target.id && !a.sample);
  const idf = buildIdf(pool.some((a) => a.id === target.id) ? pool : [target, ...pool]);
  const same: { a: Article; score: MatchScore }[] = [];
  const related: { a: Article; score: MatchScore }[] = [];
  for (const a of candidates) {
    const score = matchScore(target, a, idf);
    if (score.sameEvent) same.push({ a, score });
    else if (score.related) related.push({ a, score });
  }
  // One report per publisher; the target speaks for its own publisher. Prefer the closest match.
  const byPublisher = new Map<string, { a: Article; score: MatchScore }>();
  for (const s of same.sort((x, y) => y.score.similarity - x.score.similarity)) {
    if (s.a.publisher !== target.publisher && !byPublisher.has(s.a.publisher)) byPublisher.set(s.a.publisher, s);
  }
  const reports = [target, ...[...byPublisher.values()].map((s) => s.a)].sort((x, y) => time(x) - time(y));
  const strong = [...byPublisher.values()].filter((s) => s.score.similarity >= STRONG_SIMILARITY || s.score.sharedRare >= 4).length;
  const confidence: Confidence = reports.length === 1 ? "single" : strong >= 1 ? "high" : "medium";
  const reportIds = new Set(reports.map((r) => r.id));
  const relatedOut = related
    .filter((r) => !reportIds.has(r.a.id))
    .sort((x, y) => y.score.similarity + y.score.sharedEntities.length * 0.1 - (x.score.similarity + x.score.sharedEntities.length * 0.1))
    .filter((r, i, arr) => arr.findIndex((o) => o.a.publisher === r.a.publisher && headlineSimilarity(o.a.title, r.a.title) > 0.6) === i)
    .slice(0, 6)
    .map((r) => r.a);
  const times = reports.map((r) => r.publishedAt).filter((t): t is string => Boolean(t)).sort();
  return { target, reports, related: relatedOut, confidence, firstSeen: times[0] ?? null, lastSeen: times[times.length - 1] ?? null };
}
