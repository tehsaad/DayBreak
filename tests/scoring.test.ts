import { describe, expect, it } from "vitest";
import { emptyLearnedProfile } from "@/lib/rank/learning";
import { scoreArticle, type ScoreContext } from "@/lib/rank/score";
import { classifyArticle, matchInterests } from "@/lib/topics";
import { PROFILES } from "./fixtures/profiles";
import { makeArticle, NOW } from "./fixtures/articles";

function ctx(prefs = PROFILES.aiResearcher): ScoreContext {
  return { prefs, learned: emptyLearnedProfile(), now: NOW, coverage: new Map(), seenIds: new Set(), seenTitles: [] };
}

describe("classifier", () => {
  it("assigns topics and regions from text and source priors", () => {
    const c = classifyArticle({ title: "HEC announces new scholarships for students in Lahore", description: "Universities will receive funding.", sourceRegion: "PK", localByDefault: true, sourceTopics: ["pakistan"] });
    expect(c.topics).toEqual(expect.arrayContaining(["education", "pakistan"]));
    expect(c.regions).toContain("PK");
  });

  it("does not treat the pronouns 'us' and 'who' as evidence", () => {
    const c = classifyArticle({ title: "Tell us who you think will win the cup final", description: "" });
    expect(c.topics).not.toContain("health");
    expect(c.regions).not.toContain("US");
  });

  it("requires headline evidence or two body keywords for an interest match", () => {
    expect(matchInterests("Off the record", "The campus is quiet", ["universities"])).toHaveLength(0);
    expect(matchInterests("University admissions open", "", ["universities"])).toHaveLength(1);
  });
});

describe("scoreArticle", () => {
  const ai = makeArticle({ title: "New AI model from DeepMind beats benchmark", topics: ["ai-tech"], imageUrl: "https://img.example.com/x.jpg" });
  const sport = makeArticle({ title: "Football club appoints new coach", topics: ["sports"] });

  it("ranks articles in followed topics and interests above unrelated ones", () => {
    const a = scoreArticle(ai, ctx());
    const s = scoreArticle(sport, ctx());
    expect(a.score).toBeGreaterThan(s.score);
    expect(a.breakdown.topic).toBe(3);
    expect(a.breakdown.interest).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(scoreArticle(ai, ctx())).toEqual(scoreArticle(ai, ctx()));
  });

  it("explains only what actually contributed", () => {
    const a = scoreArticle(ai, ctx());
    expect(a.reasons[0]?.text).toBe("Matches your interest in AI research.");
    const s = scoreArticle(sport, ctx());
    expect(s.reasons).toEqual([]);
  });

  it("prefers fresh stories, other things equal", () => {
    const fresh = makeArticle({ title: "Chip supply update", topics: ["ai-tech"], publishedAt: new Date(NOW.getTime() - 3600_000).toISOString() });
    const old = { ...fresh, id: "old", publishedAt: new Date(NOW.getTime() - 40 * 3600_000).toISOString() };
    expect(scoreArticle(fresh, ctx()).score).toBeGreaterThan(scoreArticle(old, ctx()).score);
  });

  it("weighs local stories by the reader's local/international balance", () => {
    const local = makeArticle({ title: "Karachi port expansion approved", topics: ["business"], regions: ["PK"] });
    const intl = makeArticle({ title: "Rotterdam port expansion approved", topics: ["business"], regions: ["GLOBAL"] });
    const pk = ctx(PROFILES.pakistanStudent);
    expect(scoreArticle(local, pk).breakdown.region).toBeGreaterThan(scoreArticle(intl, pk).breakdown.region!);
    expect(scoreArticle(local, pk).reasons.map((r) => r.code)).toContain("region");
  });

  it("penalises stories already shown on an earlier day", () => {
    const c = ctx();
    c.seenIds.add(ai.id);
    expect(scoreArticle(ai, c).breakdown.exposure).toBeLessThan(0);
  });
});
