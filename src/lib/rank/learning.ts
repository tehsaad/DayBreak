import { isTopicId, type TopicId } from "../topics";
import type { FeedbackEvent, FeedbackType } from "../types";

/**
 * Learning from feedback.
 *
 * Each event contributes a signed weight to the topics of the article it was about
 * (the primary topic fully, secondary topics at half strength) and to its publisher.
 * Contributions decay with a half-life, are capped per topic per day so a burst of
 * accidental taps cannot dominate, and the total is squashed with tanh into [-1, 1].
 */

export const FEEDBACK_WEIGHTS: Record<FeedbackType, number> = {
  open: 0.3, // a click is weak evidence of interest
  save: 1.5, // saving is a deliberate positive act
  unsave: -0.75, // partly reverses a save
  skip: -0.4, // mild negative
  not_interested: -2.0, // explicit negative
  rating: 0, // computed from the 1–5 value: (value − 3) × 0.75
  follow_topic: 1.0,
  unfollow_topic: -1.0,
};

export const LEARNING = {
  /** Days until an event counts half as much. */
  halfLifeDays: 21,
  /** tanh(raw / squash): larger = slower to saturate. */
  squash: 4,
  /** Max absolute contribution per topic per calendar day. */
  dailyCapPerTopic: 3,
  secondaryTopicShare: 0.5,
  /** Events older than this are ignored entirely. */
  windowDays: 90,
  /** Not-interested headlines used for "similar story" penalties. */
  rejectedWindowDays: 30,
};

export function eventWeight(type: FeedbackType, value: number | null): number {
  if (type === "rating") {
    const v = Math.min(5, Math.max(1, value ?? 3));
    return (v - 3) * 0.75;
  }
  return FEEDBACK_WEIGHTS[type];
}

export function decayFactor(ageDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / LEARNING.halfLifeDays);
}

export interface TopicSignal {
  weight: number;
  events: number;
  positive: number;
  negative: number;
}

export interface LearnedProfile {
  topics: Partial<Record<TopicId, TopicSignal>>;
  publishers: Record<string, { weight: number; events: number }>;
  rejected: { articleId: string | null; title: string }[];
  rejectedIds: Set<string>;
  savedIds: Set<string>;
  signalCount: number;
}

export function emptyLearnedProfile(): LearnedProfile {
  return { topics: {}, publishers: {}, rejected: [], rejectedIds: new Set(), savedIds: new Set(), signalCount: 0 };
}

export function computeLearnedProfile(events: FeedbackEvent[], now: Date = new Date()): LearnedProfile {
  const profile = emptyLearnedProfile();
  const topicDaily = new Map<string, number>(); // `${topic}|${day}` → summed contribution
  const topicCounts = new Map<TopicId, { events: number; positive: number; negative: number }>();
  const publisherRaw = new Map<string, { raw: number; events: number }>();

  for (const e of events) {
    const ageDays = (now.getTime() - Date.parse(e.createdAt)) / 86400_000;
    if (!Number.isFinite(ageDays) || ageDays > LEARNING.windowDays) continue;
    const w = eventWeight(e.type, e.value) * decayFactor(ageDays);
    if (w === 0) continue;
    profile.signalCount++;
    const day = e.createdAt.slice(0, 10);

    e.topics.filter(isTopicId).forEach((topic, i) => {
      const share = i === 0 ? 1 : LEARNING.secondaryTopicShare;
      const key = `${topic}|${day}`;
      topicDaily.set(key, (topicDaily.get(key) ?? 0) + w * share);
      const c = topicCounts.get(topic) ?? { events: 0, positive: 0, negative: 0 };
      c.events++;
      if (w > 0) c.positive++;
      else c.negative++;
      topicCounts.set(topic, c);
    });

    if (e.publisher && e.type !== "follow_topic" && e.type !== "unfollow_topic" && e.type !== "open") {
      const p = publisherRaw.get(e.publisher) ?? { raw: 0, events: 0 };
      p.raw += w;
      p.events++;
      publisherRaw.set(e.publisher, p);
    }

    if (e.type === "not_interested" && ageDays <= LEARNING.rejectedWindowDays) {
      if (e.title) profile.rejected.push({ articleId: e.articleId, title: e.title });
      if (e.articleId) profile.rejectedIds.add(e.articleId);
    }
    if (e.type === "save" && e.articleId) profile.savedIds.add(e.articleId);
    if (e.type === "unsave" && e.articleId) profile.savedIds.delete(e.articleId);
  }

  const topicRaw = new Map<TopicId, number>();
  for (const [key, sum] of topicDaily) {
    const topic = key.split("|")[0] as TopicId;
    const capped = Math.max(-LEARNING.dailyCapPerTopic, Math.min(LEARNING.dailyCapPerTopic, sum));
    topicRaw.set(topic, (topicRaw.get(topic) ?? 0) + capped);
  }
  for (const [topic, raw] of topicRaw) {
    const c = topicCounts.get(topic)!;
    profile.topics[topic] = { weight: round(Math.tanh(raw / LEARNING.squash)), ...c };
  }
  for (const [publisher, p] of publisherRaw) {
    profile.publishers[publisher] = { weight: round(Math.tanh(p.raw / (LEARNING.squash * 1.5))), events: p.events };
  }
  return profile;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Plain topic → weight map, for storage and display. */
export function topicWeights(profile: LearnedProfile): Partial<Record<TopicId, number>> {
  const out: Partial<Record<TopicId, number>> = {};
  for (const [topic, s] of Object.entries(profile.topics) as [TopicId, TopicSignal][]) out[topic] = s.weight;
  return out;
}
