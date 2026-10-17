import type { Article } from "@/lib/types";
import type { TopicId } from "@/lib/topics";

let n = 0;
/** Build a synthetic article. Synthetic data only — never real headlines. */
export function makeArticle(over: Partial<Article> & { title: string }): Article {
  n++;
  const now = over.publishedAt ?? new Date(Date.UTC(2026, 9, 17, 6, 0, 0) - n * 60_000).toISOString();
  return {
    id: over.id ?? `art-${n}`,
    url: over.url ?? `https://news.example.com/story-${n}`,
    description: "A synthetic test description that is comfortably longer than eighty characters for quality scoring purposes.",
    publisher: "Example Times",
    sourceId: "example",
    author: null,
    imageUrl: null,
    publishedAt: now,
    collectedAt: now,
    topics: ["world"] as TopicId[],
    regions: ["GLOBAL"],
    categories: [],
    sample: false,
    ...over,
  };
}

export const NOW = new Date(Date.UTC(2026, 9, 17, 7, 0, 0));
