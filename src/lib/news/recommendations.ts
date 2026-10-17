import { extractEntities } from "../edition/evidence";
import { publicMemo } from "../public-cache";
import { clusterArticles } from "../rank/plan";
import type { Store } from "../store/types";
import { TOPICS, type TopicId } from "../topics";
import type { Article } from "../types";

/**
 * Search-page recommendations computed only from stored public articles. Every number shown to
 * readers is a real count over a stated window — no invented "trending" statistics.
 */
export interface RecommendedStory {
  id: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  imageUrl: string | null;
  topics: TopicId[];
  /** Distinct publishers that carried this story in the window. */
  publishers: number;
}

export interface Recommendations {
  generatedAt: string;
  windowHours: number;
  storyCount: number;
  topTopics: { topic: TopicId; label: string; stories: number }[];
  suggestedQueries: { query: string; publishers: number }[];
  importantStories: RecommendedStory[];
  mostCoveredThisWeek: RecommendedStory[];
  /** Publishers with stored stories this week, for the search filter. */
  publishers: string[];
}

export const POPULAR_CATEGORIES: TopicId[] = ["pakistan", "ai-tech", "science", "education", "business", "climate", "world"];

// Capitalised words that are not useful searches on their own.
const QUERY_STOP = new Set(["Live", "Update", "Updates", "News", "Watch", "Video", "Photos", "Report", "Review", "Opinion", "Analysis", "Explainer", "What", "Why", "How", "Who", "Here", "This", "That", "First", "New", "Old", "Says", "Day", "Week", "Year", "Mr", "Ms", "Dr", "UK", "US", "UN"]);

const at = (a: Article) => Date.parse(a.publishedAt ?? a.collectedAt);

function toStory(a: Article, publishers: number): RecommendedStory {
  return { id: a.id, url: a.url, title: a.title, publisher: a.publisher, publishedAt: a.publishedAt, imageUrl: a.imageUrl, topics: a.topics, publishers };
}

/** Best article per same-event cluster, ranked by how many publishers covered it, then recency, then having an image. */
function rankByCoverage(articles: Article[], limit: number): RecommendedStory[] {
  const clusters = clusterArticles(articles);
  const seen = new Set<unknown>();
  const reps: { a: Article; publishers: number }[] = [];
  for (const a of [...articles].sort((x, y) => (y.imageUrl ? 1 : 0) - (x.imageUrl ? 1 : 0) || at(y) - at(x))) {
    const c = clusters.get(a.id);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    reps.push({ a, publishers: c.publishers.size });
  }
  return reps
    .sort((x, y) => y.publishers - x.publishers || at(y.a) - at(x.a))
    .slice(0, limit)
    .map(({ a, publishers }) => toStory(a, publishers));
}

export function computeRecommendations(articles: Article[], now: Date = new Date(), windowHours = 48): Recommendations {
  const live = articles.filter((a) => !a.sample);
  const recent = live.filter((a) => now.getTime() - at(a) <= windowHours * 3600_000);
  const week = live.filter((a) => now.getTime() - at(a) <= 7 * 86400_000);

  const topicCounts = new Map<TopicId, number>();
  for (const a of recent) if (a.topics[0]) topicCounts.set(a.topics[0], (topicCounts.get(a.topics[0]) ?? 0) + 1);
  const topTopics = [...topicCounts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 6)
    .map(([topic, stories]) => ({ topic, label: TOPICS[topic].label, stories }));

  const publisherNames = new Set(live.map((a) => a.publisher.toLowerCase()));
  const entityPublishers = new Map<string, Set<string>>();
  for (const a of recent) {
    for (const e of extractEntities(a.title)) {
      if (e.length < 3 || QUERY_STOP.has(e) || publisherNames.has(e.toLowerCase())) continue;
      const set = entityPublishers.get(e) ?? new Set<string>();
      set.add(a.publisher);
      entityPublishers.set(e, set);
    }
  }
  const suggestedQueries = [...entityPublishers.entries()]
    .filter(([, pubs]) => pubs.size >= 2)
    .sort((x, y) => y[1].size - x[1].size || x[0].localeCompare(y[0]))
    .slice(0, 8)
    .map(([query, pubs]) => ({ query, publishers: pubs.size }));

  const importantStories = rankByCoverage(recent, 4);
  const importantIds = new Set(importantStories.map((s) => s.id));
  const mostCoveredThisWeek = rankByCoverage(week, 9).filter((s) => !importantIds.has(s.id)).slice(0, 5);

  const publishers = [...new Set(week.map((a) => a.publisher))].sort((a, b) => a.localeCompare(b));
  return { generatedAt: now.toISOString(), windowHours, storyCount: recent.length, topTopics, suggestedQueries, importantStories, mostCoveredThisWeek, publishers };
}

export const RECOMMENDATION_TTL_MS = 5 * 60_000;

/** Public data only, so one cached copy per server instance serves every reader. */
export function getRecommendations(store: Store, now = Date.now()): Promise<Recommendations> {
  return publicMemo(
    "search-recommendations",
    RECOMMENDATION_TTL_MS,
    async () => computeRecommendations(await store.listArticles({ sinceHours: 7 * 24, limit: 1500 }), new Date(now)),
    now,
  );
}
