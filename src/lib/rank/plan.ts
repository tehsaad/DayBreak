import { TOPICS, contentTokens, headlineSimilarity, regionName, type TopicId } from "../topics";
import type { Article, Depth, EditionSection, EvidenceRef, ReaderPreferences, ReasonItem, StoryTier } from "../types";
import { exclusionFor, isLocal, scoreArticle, type ScoreContext, type ScoredArticle } from "./score";
import type { LearnedProfile } from "./learning";

/** Headlines at or above this similarity from different publishers are one story cluster. */
export const CLUSTER_SIMILARITY = 0.4;

export interface Cluster {
  members: Article[];
  publishers: Set<string>;
}

/**
 * Group articles that report the same event. Uses an inverted token index so only headline
 * pairs sharing a word are compared.
 */
export function clusterArticles(articles: Article[]): Map<string, Cluster> {
  const tokens = articles.map((a) => contentTokens(a.title));
  const index = new Map<string, number[]>();
  tokens.forEach((set, i) => set.forEach((t) => index.set(t, [...(index.get(t) ?? []), i])));

  const parent = articles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < articles.length; i++) {
    const candidates = new Set<number>();
    for (const t of tokens[i]!) for (const j of index.get(t) ?? []) if (j > i) candidates.add(j);
    for (const j of candidates) {
      if (articles[i]!.publisher === articles[j]!.publisher) continue;
      if (headlineSimilarity(articles[i]!.title, articles[j]!.title) >= CLUSTER_SIMILARITY) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Cluster>();
  articles.forEach((a, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { members: [], publishers: new Set<string>() };
    g.members.push(a);
    g.publishers.add(a.publisher);
    groups.set(root, g);
  });
  const byArticle = new Map<string, Cluster>();
  for (const g of groups.values()) for (const a of g.members) byArticle.set(a.id, g);
  return byArticle;
}

export const STORY_COUNT: Record<Depth, { base: number; minutesPerStory: number }> = {
  brief: { base: 8, minutesPerStory: 0.75 },
  balanced: { base: 12, minutesPerStory: 1.2 },
  deep: { base: 16, minutesPerStory: 2 },
};

export function targetStoryCount(prefs: ReaderPreferences): number {
  const d = STORY_COUNT[prefs.depth];
  const byTime = Math.round(prefs.readingMinutes / d.minutesPerStory);
  return Math.max(6, Math.min(20, Math.min(d.base, byTime || d.base)));
}

export interface PlannedStory {
  scored: ScoredArticle;
  tier: StoryTier;
  section: string;
  broaden: boolean;
  alsoReportedBy: EvidenceRef[];
}

export interface EditionPlan {
  stories: PlannedStory[];
  sections: EditionSection[];
  candidateCount: number;
  excluded: Record<string, number>;
}

export interface PlanInput {
  articles: Article[];
  prefs: ReaderPreferences;
  learned: LearnedProfile;
  now: Date;
  seenIds?: Set<string>;
  seenTitles?: string[];
}

const BROADEN_REASON: ReasonItem = { code: "broaden", text: "Included to broaden today's coverage." };

/**
 * Select and arrange an edition. Deterministic: ties are broken by article id.
 *
 * 1. Drop excluded articles (muted topics/keywords, excluded sources, rejected stories).
 * 2. Cluster same-event coverage; each cluster is represented by its best-scoring article.
 * 3. Seed one story per followed section, reserve "broaden" slots outside the reader's
 *    sections, then fill by score with topic/publisher diversity penalties.
 * 4. Pick the lead, assign tiers and sections.
 */
export function planEdition(input: PlanInput): EditionPlan {
  const { prefs, learned, now } = input;
  const excluded: Record<string, number> = {};
  const eligible: Article[] = [];
  for (const a of input.articles) {
    const why = exclusionFor(a, prefs, learned);
    if (why) excluded[why] = (excluded[why] ?? 0) + 1;
    else eligible.push(a);
  }

  const clusters = clusterArticles(eligible);
  const coverage = new Map<string, number>();
  for (const [id, c] of clusters) coverage.set(id, c.publishers.size);

  const ctx: ScoreContext = {
    prefs,
    learned,
    now,
    coverage,
    seenIds: input.seenIds ?? new Set(),
    seenTitles: input.seenTitles ?? [],
  };
  const scored = eligible.map((a) => scoreArticle(a, ctx));
  const byScore = (x: ScoredArticle, y: ScoredArticle) => y.score - x.score || x.article.id.localeCompare(y.article.id);

  // Best article per cluster
  const bestOfCluster = new Map<Cluster, ScoredArticle>();
  for (const s of scored) {
    const c = clusters.get(s.article.id)!;
    const cur = bestOfCluster.get(c);
    if (!cur || byScore(s, cur) < 0) bestOfCluster.set(c, s);
  }
  const pool = [...bestOfCluster.values()].sort(byScore);

  const n = Math.min(targetStoryCount(prefs), pool.length);
  // ~30% per publisher, relaxed when the pool simply doesn't have enough distinct publishers.
  const distinctPublishers = new Set(pool.map((p) => p.article.publisher)).size;
  const publisherCap = Math.max(2, Math.ceil(n * 0.3), Math.ceil(n / Math.max(1, distinctPublishers)));
  const chosen: ScoredArticle[] = [];
  const broadenIds = new Set<string>();
  const used = new Set<string>();
  const pubCount = new Map<string, number>();
  const topicCount = new Map<TopicId, number>();

  const take = (s: ScoredArticle) => {
    chosen.push(s);
    used.add(s.article.id);
    pubCount.set(s.article.publisher, (pubCount.get(s.article.publisher) ?? 0) + 1);
    const t = s.article.topics[0];
    if (t) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  };
  const publisherOk = (s: ScoredArticle) => (pubCount.get(s.article.publisher) ?? 0) < publisherCap;

  // Seed: best story for each followed section, in the reader's order.
  for (const topic of prefs.sections) {
    if (chosen.length >= Math.max(1, n - 2)) break;
    const best = pool.find((s) => !used.has(s.article.id) && s.article.topics[0] === topic && publisherOk(s));
    if (best) take(best);
  }

  // Broaden: strong stories from topics the reader doesn't follow (never muted ones).
  const broadenSlots = prefs.sections.length === 0 ? 0 : n >= 10 ? 2 : 1;
  for (let i = 0; i < broadenSlots && chosen.length < n; i++) {
    const outside = pool.find(
      (s) =>
        !used.has(s.article.id) &&
        publisherOk(s) &&
        s.article.topics[0] !== undefined &&
        !prefs.sections.includes(s.article.topics[0]) &&
        !s.article.topics.some((t) => prefs.sections.includes(t)) &&
        !broadenTopicTaken(chosen, broadenIds, s.article.topics[0]) &&
        (s.breakdown.learnedTopic ?? 0) > -0.5,
    );
    if (!outside) break;
    take(outside);
    broadenIds.add(outside.article.id);
  }

  // Fill with diversity penalties: repeated topics and publishers cost points.
  while (chosen.length < n) {
    let best: ScoredArticle | null = null;
    let bestAdj = -Infinity;
    for (const s of pool) {
      if (used.has(s.article.id) || !publisherOk(s)) continue;
      const t = s.article.topics[0];
      const adj = s.score - 0.6 * (t ? topicCount.get(t) ?? 0 : 0) - 0.8 * (pubCount.get(s.article.publisher) ?? 0);
      if (adj > bestAdj || (adj === bestAdj && best && s.article.id < best.article.id)) {
        best = s;
        bestAdj = adj;
      }
    }
    if (!best) break;
    take(best);
  }

  // Lead: highest score with a bonus for images and multi-publisher coverage; prefer followed topics.
  const leadValue = (s: ScoredArticle) =>
    s.score + (s.article.imageUrl ? 0.6 : 0) + (s.breakdown.coverage ?? 0) * 0.5 + (broadenIds.has(s.article.id) ? -2 : 0);
  const ordered = [...chosen].sort((x, y) => leadValue(y) - leadValue(x) || x.article.id.localeCompare(y.article.id));
  const lead = ordered[0];
  const rest = chosen.filter((s) => s !== lead).sort(byScore);
  const final = lead ? [lead, ...rest] : [];

  const briefFrom = final.length - Math.floor(final.length / 3);
  const stories: PlannedStory[] = final.map((s, position) => {
    const cluster = clusters.get(s.article.id);
    const broaden = broadenIds.has(s.article.id);
    const tier: StoryTier = position === 0 ? "lead" : position <= 3 ? "top" : position >= briefFrom ? "brief" : "standard";
    const section = position <= 3 ? "front" : broaden ? "broaden" : isLocal(s.article, prefs) ? "local" : s.article.topics[0] ?? "world";
    const alsoReportedBy: EvidenceRef[] = (cluster?.members ?? [])
      .filter((m) => m.id !== s.article.id && m.publisher !== s.article.publisher)
      .filter((m, i, arr) => arr.findIndex((x) => x.publisher === m.publisher) === i)
      .slice(0, 4)
      .map((m) => ({ articleId: m.id, title: m.title, publisher: m.publisher, url: m.url, publishedAt: m.publishedAt }));
    const scoredWithReasons = broaden
      ? { ...s, reasons: [BROADEN_REASON, ...s.reasons.filter((r) => r.code !== "topic")].slice(0, 2) }
      : s;
    return { scored: scoredWithReasons, tier, section, broaden, alsoReportedBy };
  });

  return { stories, sections: buildSections(stories, prefs), candidateCount: input.articles.length, excluded };
}

function broadenTopicTaken(chosen: ScoredArticle[], broadenIds: Set<string>, topic: TopicId): boolean {
  return chosen.some((c) => broadenIds.has(c.article.id) && c.article.topics[0] === topic);
}

export function sectionTitle(id: string, prefs: ReaderPreferences): string {
  if (id === "front") return "Front page";
  if (id === "local") return `Close to home: ${regionName(prefs.region)}`;
  if (id === "broaden") return "Beyond your usual";
  return TOPICS[id as TopicId]?.label ?? id;
}

function buildSections(stories: PlannedStory[], prefs: ReaderPreferences): EditionSection[] {
  const ids: string[] = ["front"];
  if (stories.some((s) => s.section === "local") && prefs.localBalance >= 0.5) ids.push("local");
  for (const t of prefs.sections) ids.push(t);
  if (stories.some((s) => s.section === "local") && !ids.includes("local")) ids.push("local");
  for (const s of stories) if (!ids.includes(s.section) && s.section !== "broaden") ids.push(s.section);
  ids.push("broaden");
  return ids
    .map((id) => ({
      id,
      title: sectionTitle(id, prefs),
      positions: stories.map((s, i) => (s.section === id ? i : -1)).filter((i) => i >= 0),
    }))
    .filter((s) => s.positions.length > 0);
}
