import { randomUUID } from "node:crypto";
import { z } from "zod";
import { computeLearnedProfile } from "./rank/learning";
import type { Store } from "./store/types";
import { TOPIC_IDS, type TopicId } from "./topics";
import type { FeedbackEvent } from "./types";

export const FeedbackInput = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["open", "save", "unsave", "skip", "not_interested"]),
    editionId: z.string().uuid(),
    articleId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("rating"),
    editionId: z.string().uuid(),
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
 * reader's own saved edition — never from the client — so feedback cannot be forged for
 * stories the reader was not shown.
 */
export async function recordReaderFeedback(store: Store, userId: string, input: FeedbackInput, now = new Date()) {
  let event: FeedbackEvent;
  if ("topic" in input) {
    event = { id: randomUUID(), userId, articleId: null, editionId: null, type: input.type, topics: [input.topic as TopicId], publisher: null, title: null, value: null, createdAt: now.toISOString() };
  } else {
    const edition = await store.getEdition(userId, input.editionId);
    const story = edition?.stories.find((s) => s.article.id === input.articleId);
    if (!edition || !story) throw new FeedbackTargetError("Story not found in your edition");
    event = {
      id: randomUUID(),
      userId,
      articleId: story.article.id,
      editionId: edition.id,
      type: input.type,
      topics: story.article.topics,
      publisher: story.article.publisher,
      title: story.article.title,
      value: input.type === "rating" ? input.value : null,
      createdAt: now.toISOString(),
    };
    if (input.type === "save") await store.addBookmark({ userId, articleId: story.article.id, editionId: edition.id, article: story.article, savedAt: now.toISOString() });
    if (input.type === "unsave") await store.removeBookmark(userId, story.article.id);
  }
  const { deduplicated } = await store.recordFeedback(event);
  const learned = computeLearnedProfile(await store.listFeedback(userId, 90), now);
  await store.saveAffinities(userId, Object.fromEntries(Object.entries(learned.topics).map(([t, s]) => [t, { weight: s!.weight, events: s!.events }])));
  return { deduplicated, learned };
}
