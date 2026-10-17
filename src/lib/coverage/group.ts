import { specificEntities } from "../edition/evidence";
import { GLOBAL_REGION, headlineSimilarity } from "../topics";
import type { Article } from "../types";

/**
 * Same-event grouping for the Story Explorer. Deliberately conservative: a false "these all
 * report the same thing" is worse than missing a match, so weaker matches are only "related".
 */
export const SAME_EVENT_SIMILARITY = 0.42;
export const STRONG_SIMILARITY = 0.55;
export const RELATED_SIMILARITY = 0.22;
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
  sameEvent: boolean;
  related: boolean;
}

export function matchScore(a: Article, b: Article): MatchScore {
  const similarity = headlineSimilarity(a.title, b.title);
  const ea = lc(specificEntities(`${a.title}. ${a.description}`));
  const eb = specificEntities(`${b.title}. ${b.description}`);
  const sharedEntities = [...new Set(eb.filter((e) => ea.has(e.toLowerCase())))];
  const headlineEntitiesA = specificEntities(a.title);
  const headlineEntitiesB = specificEntities(b.title);
  const entitiesAgree = sharedEntities.length > 0 || (headlineEntitiesA.length === 0 && headlineEntitiesB.length === 0);
  const close = Math.abs(time(a) - time(b)) <= SAME_EVENT_WINDOW_HOURS * 3600_000;
  const compatible = regionsCompatible(a, b);
  const sameEvent = close && compatible && ((similarity >= SAME_EVENT_SIMILARITY && entitiesAgree) || (similarity >= 0.3 && sharedEntities.length >= 3));
  const related = !sameEvent && compatible && (similarity >= RELATED_SIMILARITY || sharedEntities.length >= 2) && a.topics[0] === b.topics[0];
  return { similarity, sharedEntities, sameEvent, related };
}

export function findCoverage(target: Article, pool: Article[]): Coverage {
  const candidates = pool.filter((a) => a.id !== target.id && !a.sample);
  const same: { a: Article; score: MatchScore }[] = [];
  const related: { a: Article; score: MatchScore }[] = [];
  for (const a of candidates) {
    const score = matchScore(target, a);
    if (score.sameEvent) same.push({ a, score });
    else if (score.related) related.push({ a, score });
  }
  // One report per publisher; the target speaks for its own publisher. Prefer the closest match.
  const byPublisher = new Map<string, { a: Article; score: MatchScore }>();
  for (const s of same.sort((x, y) => y.score.similarity - x.score.similarity)) {
    if (s.a.publisher !== target.publisher && !byPublisher.has(s.a.publisher)) byPublisher.set(s.a.publisher, s);
  }
  const reports = [target, ...[...byPublisher.values()].map((s) => s.a)].sort((x, y) => time(x) - time(y));
  const strong = [...byPublisher.values()].filter((s) => s.score.similarity >= STRONG_SIMILARITY || s.score.sharedEntities.length >= 3).length;
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
