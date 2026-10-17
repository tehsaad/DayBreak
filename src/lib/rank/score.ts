import {
  GLOBAL_REGION,
  INTEREST_BY_ID,
  TOPICS,
  headlineSimilarity,
  interestPhrase,
  matchInterests,
  matchKeywords,
  regionName,
  type TopicId,
} from "../topics";
import { publisherId } from "../news/sources";
import type { Article, ReaderPreferences, ReasonItem } from "../types";
import type { LearnedProfile } from "./learning";

export const RANKING_VERSION = "daybreak-rank-1.0";

/**
 * Ranking weights. Every term below is in [0, 1] (penalties in [0, 1] too) before weighting,
 * so the weights read directly as relative importance. Tune here; tests pin the behaviour.
 */
export const WEIGHTS = {
  /** Article's topic is one the reader follows (primary 1.0, secondary 0.6). */
  topic: 3.0,
  /** Fine-grained interest keywords found in the headline or excerpt. */
  interest: 2.0,
  /** Local vs international fit, using the reader's balance setting. */
  region: 1.5,
  /** Exponential freshness, half-life FRESHNESS_HALF_LIFE_HOURS. */
  freshness: 1.5,
  /** Learned topic affinity from feedback, in [-1, 1]. */
  learnedTopic: 2.0,
  /** Learned publisher affinity from feedback, in [-1, 1]. */
  learnedPublisher: 0.6,
  /** Source-provided completeness: excerpt, image, author, timestamp. */
  quality: 0.5,
  /** Several publishers covering the same story. */
  coverage: 1.0,
  /** Penalty: similar to a story the reader marked "not interested". */
  rejectedSimilarity: 3.0,
  /** Penalty: already shown in a previous day's edition (or a near-identical story). */
  exposure: 2.5,
  /** Penalty: a secondary topic is muted. */
  mutedSecondary: 1.5,
} as const;

export const FRESHNESS_HALF_LIFE_HOURS = 18;
/** Similarity at which a candidate counts as "like" a rejected headline. */
export const REJECTED_SIMILARITY_FLOOR = 0.22;

export interface ScoreContext {
  prefs: ReaderPreferences;
  learned: LearnedProfile;
  now: Date;
  /** articleId → number of distinct publishers covering the same story cluster. */
  coverage: Map<string, number>;
  /** Article ids shown in earlier days' editions. */
  seenIds: Set<string>;
  /** Headlines shown in earlier days' editions. */
  seenTitles: string[];
}

export interface ScoredArticle {
  article: Article;
  score: number;
  breakdown: Record<string, number>;
  reasons: ReasonItem[];
  matchedInterests: string[];
}

export type Exclusion = "muted_topic" | "excluded_source" | "muted_keyword" | "rejected" | "sample_in_live";

export function exclusionFor(article: Article, prefs: ReaderPreferences, learned: LearnedProfile): Exclusion | null {
  const primary = article.topics[0];
  if (primary && prefs.mutedTopics.includes(primary)) return "muted_topic";
  if (prefs.excludedSources.includes(publisherId(article.publisher))) return "excluded_source";
  if (prefs.mutedKeywords.length > 0 && matchKeywords(`${article.title} ${article.description}`, prefs.mutedKeywords.map((k) => k.toLowerCase())).length > 0) {
    return "muted_keyword";
  }
  if (learned.rejectedIds.has(article.id)) return "rejected";
  return null;
}

function ageHours(article: Article, now: Date): number {
  const t = Date.parse(article.publishedAt ?? article.collectedAt);
  return Math.max(0, (now.getTime() - t) / 3600_000);
}

export function freshness(article: Article, now: Date): number {
  const f = Math.pow(0.5, ageHours(article, now) / FRESHNESS_HALF_LIFE_HOURS);
  return article.publishedAt ? f : f * 0.7;
}

export function qualityScore(article: Article): number {
  let q = 0;
  if (article.description.length >= 80) q += 0.4;
  else if (article.description.length >= 30) q += 0.2;
  if (article.imageUrl) q += 0.3;
  if (article.author) q += 0.1;
  if (article.publishedAt) q += 0.2;
  return q;
}

export function isLocal(article: Article, prefs: ReaderPreferences): boolean {
  return prefs.region !== GLOBAL_REGION && article.regions.includes(prefs.region);
}

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Deterministic score for one article. Same inputs → same output. */
export function scoreArticle(article: Article, ctx: ScoreContext): ScoredArticle {
  const { prefs, learned, now } = ctx;
  const b: Record<string, number> = {};
  const [primary, ...secondary] = article.topics;

  // Explicit topic follow
  const follows = prefs.sections;
  let topicTerm = 0;
  if (follows.length === 0) topicTerm = 0.3;
  else if (primary && follows.includes(primary)) topicTerm = 1;
  else if (secondary.some((t) => follows.includes(t))) topicTerm = 0.6;
  b.topic = WEIGHTS.topic * topicTerm;

  // Fine-grained interests
  const interests = matchInterests(article.title, article.description, prefs.interests);
  const interestTerm =
    interests.length === 0 ? 0 : Math.min(1, (interests[0]!.inTitle ? 0.8 : 0.6) + 0.2 * (interests.length - 1));
  b.interest = WEIGHTS.interest * interestTerm;

  // Region
  let regionTerm = 0.5;
  const local = isLocal(article, prefs);
  if (prefs.region !== GLOBAL_REGION) regionTerm = local ? prefs.localBalance : 1 - prefs.localBalance;
  b.region = WEIGHTS.region * regionTerm;

  // Freshness and quality
  b.freshness = WEIGHTS.freshness * freshness(article, now);
  b.quality = WEIGHTS.quality * qualityScore(article);

  // Learned affinities
  const tPrimary = primary ? learned.topics[primary]?.weight ?? 0 : 0;
  const tSecondary = secondary.length ? secondary.reduce((s, t) => s + (learned.topics[t]?.weight ?? 0), 0) / secondary.length : 0;
  b.learnedTopic = WEIGHTS.learnedTopic * Math.max(-1, Math.min(1, tPrimary + 0.5 * tSecondary));
  b.learnedPublisher = WEIGHTS.learnedPublisher * (learned.publishers[article.publisher]?.weight ?? 0);

  // Coverage by several publishers
  const cov = ctx.coverage.get(article.id) ?? 1;
  b.coverage = WEIGHTS.coverage * Math.min(1, Math.log2(Math.max(1, cov)) / 2);

  // Penalties
  let rejectedSim = 0;
  for (const r of learned.rejected) rejectedSim = Math.max(rejectedSim, headlineSimilarity(article.title, r.title));
  b.rejectedSimilarity = rejectedSim >= REJECTED_SIMILARITY_FLOOR ? -WEIGHTS.rejectedSimilarity * Math.min(1, rejectedSim * 1.6) : 0;

  let exposure = 0;
  if (ctx.seenIds.has(article.id)) exposure = 1;
  else for (const t of ctx.seenTitles) exposure = Math.max(exposure, headlineSimilarity(article.title, t) >= 0.55 ? 0.5 : 0);
  b.exposure = -WEIGHTS.exposure * exposure;

  b.mutedSecondary = secondary.some((t) => prefs.mutedTopics.includes(t)) ? -WEIGHTS.mutedSecondary : 0;

  for (const k of Object.keys(b)) b[k] = r3(b[k]!);
  const score = r3(Object.values(b).reduce((s, v) => s + v, 0));

  return {
    article,
    score,
    breakdown: b,
    reasons: buildReasons(article, b, { interests: interests.map((i) => i.interest.id), local, prefs, learned, coverage: cov }),
    matchedInterests: interests.map((i) => i.interest.id),
  };
}

/**
 * Human-readable reasons, derived only from terms that actually contributed. At most two.
 */
export function buildReasons(
  article: Article,
  b: Record<string, number>,
  info: { interests: string[]; local: boolean; prefs: ReaderPreferences; learned: LearnedProfile; coverage: number },
): ReasonItem[] {
  const out: ReasonItem[] = [];
  const primary = article.topics[0] as TopicId | undefined;
  const followedTopic = article.topics.find((t) => info.prefs.sections.includes(t));

  if (info.coverage >= 3 && followedTopic) {
    out.push({ code: "major", text: `A major development in ${TOPICS[followedTopic].label.toLowerCase()}, reported by ${info.coverage} publishers.` });
  }
  const interest = info.interests[0] ? INTEREST_BY_ID[info.interests[0]] : undefined;
  if (interest && (b.interest ?? 0) > 0) out.push({ code: "interest", text: `Matches your interest in ${interestPhrase(interest)}.` });
  if (info.local && (b.region ?? 0) >= 0.75) out.push({ code: "region", text: `Relevant to readers in ${regionName(info.prefs.region)}.` });
  if (primary && (b.learnedTopic ?? 0) >= 0.3) {
    out.push({ code: "learned", text: `You've been engaging with ${TOPICS[primary].label.toLowerCase()} stories.` });
  }
  if (followedTopic && !interest && out.length === 0) out.push({ code: "topic", text: `From ${TOPICS[followedTopic].label}, a section you follow.` });
  if (info.coverage === 2 && out.length < 2) out.push({ code: "coverage", text: "Reported by more than one publisher today." });
  return out.slice(0, 2);
}
