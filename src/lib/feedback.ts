import { randomUUID } from "node:crypto";
import { z } from "zod";
import { snapshot } from "./edition/generate";
import { computeLearnedProfile } from "./rank/learning";
import type { Store } from "./store/types";
import { TOPIC_IDS, type TopicId } from "./topics";
import type { ArticleSnapshot, FeedbackEvent } from "./types";

export const FeedbackInput = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["open", "save", "unsave", "skip", "not_interested"]),
    // Omitted for stories outside an edition (Explore, Search): the article is then looked up
    // in the shared article store instead.
    editionId: z.string().uuid().optional(),
    articleId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("rating"),
    editionId: z.string().uuid().optional(),
    articleId: z.string().min(1).max(64),
    value: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.enum(["follow_topic", "unfollow_topic"]),
    topic: z.enum(TOPIC_IDS),
  }),
]);
export type FeedbackInput = z.infer<typeof FeedbackInput>;

export class FeedbackTargetError extends Error {}

/**
 * Record one feedback event. Article metadata (topics, publisher, title) is taken from the
 * reader's own saved edition, or for Explore/Search from the shared article store — never from
 * the client — so feedback cannot describe stories that don't exist.
 */
export async function recordReaderFeedback(store: Store, userId: string, input: FeedbackInput, now = new Date()) {
  let event: FeedbackEvent;
  if ("topic" in input) {
    event = { id: randomUUID(), userId, articleId: null, editionId: null, type: input.type, topics: [input.topic as TopicId], publisher: null, title: null, value: null, createdAt: now.toISOString() };
  } else {
    let article: ArticleSnapshot | undefined;
    let editionId: string | null = null;
    if (input.editionId) {
      const edition = await store.getEdition(userId, input.editionId);
      article = edition?.stories.find((s) => s.article.id === input.articleId)?.article;
      if (!edition || !article) throw new FeedbackTargetError("Story not found in your edition");
      editionId = edition.id;
    } else {
      const [found] = await store.getArticles([input.articleId]);
      if (!found) throw new FeedbackTargetError("Story not found");
      article = snapshot(found);
    }
    event = {
      id: randomUUID(),
      userId,
      articleId: article.id,
      editionId,
      type: input.type,
      topics: article.topics,
      publisher: article.publisher,
      title: article.title,
      value: input.type === "rating" ? input.value : null,
      createdAt: now.toISOString(),
    };
    if (input.type === "save") await store.addBookmark({ userId, articleId: article.id, editionId, article, savedAt: now.toISOString() });
    if (input.type === "unsave") await store.removeBookmark(userId, article.id);
  }
  const { deduplicated } = await store.recordFeedback(event);
  const learned = computeLearnedProfile(await store.listFeedback(userId, 90), now);
  await store.saveAffinities(userId, Object.fromEntries(Object.entries(learned.topics).map(([t, s]) => [t, { weight: s!.weight, events: s!.events }])));
  return { deduplicated, learned };
}

export const TopicFollowInput = z.object({ topic: z.enum(TOPIC_IDS), follow: z.boolean() });

/**
 * Explicit follow / unfollow from Explore: changes the reader's sections (an explicit
 * preference) and records a follow signal. Unfollowing also drops that topic's narrower
 * interests, so the topic isn't silently re-added by them.
 */
export async function setTopicFollow(store: Store, userId: string, topic: TopicId, follow: boolean, now = new Date()) {
  const prefs = await store.getPreferences(userId);
  if (!prefs) throw new FeedbackTargetError("Complete onboarding first");
  const { INTEREST_BY_ID } = await import("./topics");
  const sections = follow ? [...new Set([...prefs.sections, topic])] : prefs.sections.filter((t) => t !== topic);
  const interests = follow ? prefs.interests : prefs.interests.filter((i) => INTEREST_BY_ID[i]?.topic !== topic);
  const mutedTopics = follow ? prefs.mutedTopics.filter((t) => t !== topic) : prefs.mutedTopics;
  const updated = { ...prefs, sections, interests, mutedTopics, updatedAt: now.toISOString() };
  await store.savePreferences(userId, updated);
  await recordReaderFeedback(store, userId, { type: follow ? "follow_topic" : "unfollow_topic", topic }, now);
  return updated;
}
