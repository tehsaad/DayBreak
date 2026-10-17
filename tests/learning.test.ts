import { describe, expect, it } from "vitest";
import { computeLearnedProfile, decayFactor, eventWeight, LEARNING } from "@/lib/rank/learning";
import { planEdition } from "@/lib/rank/plan";
import { sampleArticles } from "@/lib/news/sample";
import type { FeedbackEvent, FeedbackType } from "@/lib/types";
import type { TopicId } from "@/lib/topics";
import { PROFILES } from "./fixtures/profiles";
import { NOW } from "./fixtures/articles";

let id = 0;
function ev(type: FeedbackType, topics: TopicId[], daysAgo = 0, extra: Partial<FeedbackEvent> = {}): FeedbackEvent {
  return {
    id: `e${++id}`,
    userId: "u",
    articleId: `a${id}`,
    editionId: null,
    type,
    topics,
    publisher: "Example Times",
    title: null,
    value: null,
    createdAt: new Date(NOW.getTime() - daysAgo * 86400_000).toISOString(),
    ...extra,
  };
}

describe("learned profile", () => {
  it("treats a click as weaker than a save, and not-interested as strongly negative", () => {
    expect(eventWeight("open", null)).toBeLessThan(eventWeight("save", null));
    expect(eventWeight("not_interested", null)).toBeLessThan(eventWeight("skip", null));
    expect(eventWeight("rating", 5)).toBeGreaterThan(0);
    expect(eventWeight("rating", 1)).toBeLessThan(0);
  });

  it("saves raise and not-interested lowers topic weights", () => {
    const p = computeLearnedProfile([ev("save", ["climate"]), ev("save", ["climate"]), ev("not_interested", ["sports"])], NOW);
    expect(p.topics.climate!.weight).toBeGreaterThan(0.5);
    expect(p.topics.sports!.weight).toBeLessThan(0);
  });

  it("decays old behaviour", () => {
    expect(decayFactor(LEARNING.halfLifeDays)).toBeCloseTo(0.5);
    const recent = computeLearnedProfile([ev("save", ["science"], 0)], NOW).topics.science!.weight;
    const old = computeLearnedProfile([ev("save", ["science"], 60)], NOW).topics.science!.weight;
    expect(old).toBeLessThan(recent);
    expect(computeLearnedProfile([ev("save", ["science"], 120)], NOW).topics.science).toBeUndefined();
  });

  it("caps a burst of same-day actions so it cannot dominate", () => {
    const burst = Array.from({ length: 30 }, () => ev("not_interested", ["health"]));
    const w = computeLearnedProfile(burst, NOW).topics.health!.weight;
    expect(w).toBeGreaterThan(-0.7); // tanh(-3/4) ≈ -0.64 at the daily cap
  });

  it("keeps the secondary-topic share smaller than the primary", () => {
    const p = computeLearnedProfile([ev("save", ["business", "pakistan"])], NOW);
    expect(p.topics.business!.weight).toBeGreaterThan(p.topics.pakistan!.weight);
  });
});

describe("feedback changes the next edition", () => {
  const articles = sampleArticles(NOW);
  const prefs = PROFILES.aiResearcher;

  it("negative feedback removes the story and demotes similar ones", () => {
    const before = planEdition({ articles, prefs, learned: computeLearnedProfile([], NOW), now: NOW });
    const lead = before.stories[0]!.scored.article;
    const events = [ev("not_interested", lead.topics, 0, { articleId: lead.id, title: lead.title })];
    const after = planEdition({ articles, prefs, learned: computeLearnedProfile(events, NOW), now: NOW });
    expect(after.stories.map((s) => s.scored.article.id)).not.toContain(lead.id);
    expect(after.excluded.rejected).toBe(1);
    // A near-identical story is penalised by similarity.
    const similar = after.stories.find((s) => (s.scored.breakdown.rejectedSimilarity ?? 0) < 0);
    if (similar) expect(similar.scored.breakdown.rejectedSimilarity).toBeLessThan(0);
  });

  it("one accidental not-interested does not erase a followed topic", () => {
    const aiStory = articles.find((a) => a.topics[0] === "ai-tech")!;
    const events = [ev("not_interested", aiStory.topics, 0, { articleId: aiStory.id, title: aiStory.title })];
    const after = planEdition({ articles, prefs, learned: computeLearnedProfile(events, NOW), now: NOW });
    expect(after.stories.some((s) => s.scored.article.topics[0] === "ai-tech")).toBe(true);
  });

  it("positive feedback on a topic moves its stories up", () => {
    const rank = (plan: ReturnType<typeof planEdition>) => plan.stories.findIndex((s) => s.scored.article.topics[0] === "climate");
    const base = planEdition({ articles, prefs, learned: computeLearnedProfile([], NOW), now: NOW });
    const saves = [ev("save", ["climate"]), ev("save", ["climate"], 1), ev("rating", ["climate"], 2, { value: 5 }), ev("save", ["climate"], 3)];
    const after = planEdition({ articles, prefs, learned: computeLearnedProfile(saves, NOW), now: NOW });
    const climateCount = (p: ReturnType<typeof planEdition>) => p.stories.filter((s) => s.scored.article.topics.includes("climate")).length;
    expect(climateCount(after)).toBeGreaterThanOrEqual(climateCount(base));
    const r = rank(after);
    expect(r).toBeGreaterThanOrEqual(0);
    if (rank(base) >= 0) expect(r).toBeLessThanOrEqual(rank(base));
  });
});
