import { describe, expect, it } from "vitest";
import { sampleArticles } from "@/lib/news/sample";
import { emptyLearnedProfile } from "@/lib/rank/learning";
import { clusterArticles, planEdition, targetStoryCount } from "@/lib/rank/plan";
import { headlineSimilarity } from "@/lib/topics";
import { PROFILES } from "./fixtures/profiles";
import { makeArticle, NOW } from "./fixtures/articles";

const articles = sampleArticles(NOW);
const plan = (prefs: (typeof PROFILES)[keyof typeof PROFILES]) => planEdition({ articles, prefs, learned: emptyLearnedProfile(), now: NOW });

describe("planEdition", () => {
  it("is reproducible for the same inputs", () => {
    expect(plan(PROFILES.pakistanStudent).stories.map((s) => s.scored.article.id)).toEqual(plan(PROFILES.pakistanStudent).stories.map((s) => s.scored.article.id));
  });

  it("sizes the paper by depth and reading time", () => {
    expect(targetStoryCount({ ...PROFILES.aiResearcher, depth: "brief", readingMinutes: 5 })).toBe(7);
    expect(plan(PROFILES.aiResearcher).stories.length).toBe(Math.min(targetStoryCount(PROFILES.aiResearcher), articles.length));
  });

  it("assigns one lead, up to three top stories and orders positions", () => {
    const p = plan(PROFILES.climateReader);
    expect(p.stories[0]!.tier).toBe("lead");
    expect(p.stories.filter((s) => s.tier === "lead")).toHaveLength(1);
    expect(p.stories.filter((s) => s.tier === "top").length).toBeLessThanOrEqual(3);
    expect(p.sections[0]!.id).toBe("front");
    const allPositions = p.sections.flatMap((s) => s.positions).sort((a, b) => a - b);
    expect(allPositions).toEqual(p.stories.map((_, i) => i));
  });

  it("limits any single publisher and keeps topic diversity", () => {
    const words = ["quantum", "battery", "satellite", "browser", "robotics", "semiconductor", "encryption", "drone", "telescope", "laptop", "router", "compiler", "database", "headset", "sensor", "server", "keyboard", "camera", "printer", "scanner", "tablet", "modem", "chipset", "firmware", "kernel", "plugin", "wearable", "monitor", "speaker", "charger"];
    const one = words.map((w, i) => makeArticle({ title: `${w[0]!.toUpperCase()}${w.slice(1)} launch`, topics: ["ai-tech"], publisher: i < 25 ? "Mega Wire" : `Paper ${i}` }));
    const p = planEdition({ articles: [...one, ...articles], prefs: PROFILES.aiResearcher, learned: emptyLearnedProfile(), now: NOW });
    const byPub = new Map<string, number>();
    for (const s of p.stories) byPub.set(s.scored.article.publisher, (byPub.get(s.scored.article.publisher) ?? 0) + 1);
    expect(Math.max(...byPub.values())).toBeLessThanOrEqual(Math.ceil(targetStoryCount(PROFILES.aiResearcher) * 0.3));
    expect(new Set(p.stories.map((s) => s.scored.article.topics[0])).size).toBeGreaterThanOrEqual(3);
  });

  it("includes stories outside the reader's sections, labelled as such", () => {
    const p = plan(PROFILES.aiResearcher);
    const broaden = p.stories.filter((s) => s.broaden);
    expect(broaden.length).toBeGreaterThanOrEqual(1);
    for (const s of broaden) {
      expect(PROFILES.aiResearcher.sections).not.toContain(s.scored.article.topics[0]);
      expect(s.scored.reasons[0]!.code).toBe("broaden");
    }
  });

  it("never includes muted topics, excluded publishers or muted keywords", () => {
    const prefs = { ...PROFILES.pakistanStudent, mutedTopics: ["sports" as const], excludedSources: ["sample-ledger-demo-data"], mutedKeywords: ["smog"] };
    const p = planEdition({ articles, prefs, learned: emptyLearnedProfile(), now: NOW });
    for (const s of p.stories) {
      expect(s.scored.article.topics[0]).not.toBe("sports");
      expect(s.scored.article.publisher).not.toBe("Sample Ledger (demo data)");
      expect(s.scored.article.title.toLowerCase()).not.toContain("smog");
    }
  });

  it("shows one story per event and credits the other publishers", () => {
    const p = plan(PROFILES.aiResearcher);
    const ids = p.stories.map((s) => s.scored.article.id);
    // s01 and s02 are the same event from two sample publishers.
    expect(ids.includes("sample-s01") && ids.includes("sample-s02")).toBe(false);
    const story = p.stories.find((s) => ["sample-s01", "sample-s02"].includes(s.scored.article.id))!;
    expect(story.alsoReportedBy).toHaveLength(1);
  });

  it("clusters same-event headlines across publishers only", () => {
    const a = makeArticle({ title: "Glacier monitoring network records faster melting", publisher: "A" });
    const b = makeArticle({ title: "Faster glacier melting recorded by monitoring network", publisher: "B" });
    const c = makeArticle({ title: "Football club appoints new head coach", publisher: "C" });
    const clusters = clusterArticles([a, b, c]);
    expect(clusters.get(a.id)).toBe(clusters.get(b.id));
    expect(clusters.get(c.id)).not.toBe(clusters.get(a.id));
    expect(headlineSimilarity(a.title, c.title)).toBeLessThan(0.2);
  });
});

describe("three reference readers get meaningfully different papers", () => {
  const editions = Object.fromEntries(Object.entries(PROFILES).map(([k, p]) => [k, plan(p)]));
  const ids = (k: string) => new Set(editions[k]!.stories.map((s) => s.scored.article.id));
  const overlap = (a: string, b: string) => [...ids(a)].filter((x) => ids(b).has(x)).length / Math.min(ids(a).size, ids(b).size);

  it("leads with a story in the reader's own sections", () => {
    for (const [k, prefs] of Object.entries(PROFILES)) {
      const lead = editions[k]!.stories[0]!.scored.article;
      expect(lead.topics.some((t) => prefs.sections.includes(t))).toBe(true);
    }
  });

  it("overlaps by at most half between any two readers, with different leads", () => {
    expect(overlap("aiResearcher", "pakistanStudent")).toBeLessThanOrEqual(0.5);
    expect(overlap("aiResearcher", "climateReader")).toBeLessThanOrEqual(0.5);
    expect(overlap("pakistanStudent", "climateReader")).toBeLessThanOrEqual(0.5);
    const leads = Object.values(editions).map((e) => e.stories[0]!.scored.article.id);
    expect(new Set(leads).size).toBe(3);
  });

  it("gives the Pakistan-focused student a local section", () => {
    expect(editions.pakistanStudent!.stories.filter((s) => s.scored.article.regions.includes("PK")).length).toBeGreaterThanOrEqual(4);
  });
});
