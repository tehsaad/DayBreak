import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { analyseCoverage, coverageKey, validateCoverage } from "@/lib/ai/coverage";
import { findCoverage } from "@/lib/coverage/group";
import { evidenceBiggerPicture, findConnections, storyQuestion } from "@/lib/edition/evidence";
import { generateEdition, snapshot } from "@/lib/edition/generate";
import { DISPLAY_EXCERPT_MAX, displayExcerpt, rightsFor, setRightsOverridesForTests } from "@/lib/news/rights";
import { __clearPublicMemo } from "@/lib/public-cache";
import { FileStore } from "@/lib/store/file-store";
import manifest from "@/app/manifest";
import { makeArticle } from "./fixtures/articles";
import { PROFILES } from "./fixtures/profiles";

const T = Date.UTC(2026, 9, 17, 9);
const at = (h: number) => new Date(T - h * 3600_000).toISOString();

const imf = [
  makeArticle({ id: "i1", title: "IMF approves $1.1bn tranche for Pakistan after review", publisher: "Dawn", topics: ["business"], regions: ["PK"], publishedAt: at(5), description: "The IMF executive board approved the tranche on Friday, officials said." }),
  makeArticle({ id: "i2", title: "IMF board approves Pakistan loan tranche of $1.1bn", publisher: "Geo News", topics: ["business"], regions: ["PK"], publishedAt: at(4), description: "Pakistan will receive $1.1bn after the IMF review, the finance ministry said." }),
  makeArticle({ id: "i3", title: "Pakistan gets IMF nod for $1.1bn tranche", publisher: "Business Recorder", topics: ["business"], regions: ["PK"], publishedAt: at(3) }),
  makeArticle({ id: "i4", title: "IMF approves Pakistan tranche", publisher: "Dawn", topics: ["business"], regions: ["PK"], publishedAt: at(2) }),
];
const floods = [
  makeArticle({ id: "f1", title: "Floods kill dozens in Sindh as rivers burst banks", publisher: "Dawn", topics: ["climate"], regions: ["PK"], publishedAt: at(6) }),
  makeArticle({ id: "f2", title: "Floods kill dozens in Kenya as rivers burst banks", publisher: "BBC News", topics: ["climate"], regions: ["KE"], publishedAt: at(6) }),
];

describe("Story Explorer grouping", () => {
  it("groups several publishers' reports of the same event, one card per publisher, oldest first", () => {
    const c = findCoverage(imf[0]!, [...imf, ...floods]);
    expect(c.reports.map((r) => r.publisher)).toEqual(["Dawn", "Geo News", "Business Recorder"]);
    expect(c.confidence).toBe("high");
    expect(c.reports.find((r) => r.id === "i4")).toBeUndefined(); // same publisher again: not a separate source
  });

  it("does not merge look-alike headlines about different places", () => {
    const c = findCoverage(floods[0]!, [...imf, ...floods]);
    expect(c.reports.map((r) => r.id)).toEqual(["f1"]);
    expect(c.confidence).toBe("single");
  });

  it("handles a story only one publisher has reported", () => {
    const solo = makeArticle({ id: "s1", title: "Quantum sensor maps underground water in Thar desert", publisher: "Nature", topics: ["science"], publishedAt: at(1) });
    const c = findCoverage(solo, [solo, ...imf]);
    expect(c.reports).toHaveLength(1);
    expect(c.confidence).toBe("single");
  });
});

describe("AI coverage analysis", () => {
  beforeEach(() => __clearPublicMemo());
  const reports = imf.slice(0, 3);
  const model = (calls: { n: number }, out: unknown) =>
    new MockLanguageModelV4({
      doGenerate: async () => {
        calls.n++;
        await new Promise((r) => setTimeout(r, 20));
        return { content: [{ type: "text", text: JSON.stringify(out) }], finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } }, warnings: [] };
      },
    });
  const good = {
    overview: "The IMF approved a $1.1bn tranche for Pakistan after a review.",
    agree: [{ point: "The tranche is worth $1.1bn.", sources: ["R1", "R2"] }, { point: "Invented consensus", sources: ["R9"] }],
    differ: [{ point: "Only one side cited", sources: ["R1"] }, { point: "Dawn cites officials while Geo News cites the finance ministry.", sources: ["R1", "R2"] }],
    uncertain: [{ point: "It will cut inflation by 40%.", sources: ["R2"] }],
    background: null,
  };

  it("keeps only cited, grounded points and requires two publishers for a 'differs' point", () => {
    const v = validateCoverage(good, reports, "mock");
    expect(v.agree.map((p) => p.point)).toEqual(["The tranche is worth $1.1bn."]);
    expect(v.differ.map((p) => p.point)).toEqual(["Dawn cites officials while Geo News cites the finance ministry."]);
    expect(v.uncertain).toEqual([]); // "40%" is not in the cited source
    expect(v.dropped).toBe(3);
    expect(v.agree[0]!.sourceIds).toEqual(["i1", "i2"]);
  });

  it("de-duplicates concurrent requests and re-runs when a source changes", async () => {
    const calls = { n: 0 };
    const m = model(calls, good);
    await Promise.all([analyseCoverage(m, "mock", reports, { timeoutMs: 5000 }), analyseCoverage(m, "mock", reports, { timeoutMs: 5000 })]);
    expect(calls.n).toBe(1);
    await analyseCoverage(m, "mock", reports, { timeoutMs: 5000 });
    expect(calls.n).toBe(1); // cached
    const edited = [{ ...reports[0]!, description: "Updated: the board approved the tranche late on Friday." }, ...reports.slice(1)];
    expect(coverageKey("mock", edited)).not.toBe(coverageKey("mock", reports));
    await analyseCoverage(m, "mock", edited, { timeoutMs: 5000 });
    expect(calls.n).toBe(2);
  });
});

describe("copyright safeguards", () => {
  it("shows at most one short sentence of publisher text, and nothing for restricted sources", () => {
    const long = "First sentence of the report that runs on. " + "More detail ".repeat(60);
    expect(displayExcerpt(long).length).toBeLessThanOrEqual(DISPLAY_EXCERPT_MAX);
    setRightsOverridesForTests({ restricted: { excerpt: "none", images: false } });
    expect(displayExcerpt(long, "restricted-feed")).toBe("");
    expect(rightsFor("restricted-feed").images).toBe(false);
    setRightsOverridesForTests({});
  });

  it("never puts long publisher text into a non-AI edition", async () => {
    const store = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-rights-")), "db.json"));
    const long = "Opening sentence of a long report about the budget. " + "Further paragraph text from the publisher. ".repeat(20);
    const articles = Array.from({ length: 12 }, (_, i) => makeArticle({ id: `r${i}`, title: `Budget story number ${i} on taxes`, topics: ["business"], publisher: `Pub ${i % 4}`, description: long }));
    const { edition } = await generateEdition({ store, userId: "77777777-7777-4777-8777-777777777777", prefs: PROFILES.pakistanStudent, mode: "ensure", ai: null, articles });
    for (const s of edition.stories) {
      expect(s.summary.length).toBeLessThanOrEqual(DISPLAY_EXCERPT_MAX);
      if (s.biggerPicture) expect(s.biggerPicture.whatHappened.length).toBeLessThanOrEqual(DISPLAY_EXCERPT_MAX);
    }
    for (const t of edition.threeThings) expect(t.fact.length).toBeLessThanOrEqual(DISPLAY_EXCERPT_MAX);
  });
});

describe("The Bigger Picture without AI", () => {
  it("never connects stories through generic names like AI or US", () => {
    const a = snapshot(makeArticle({ id: "c1", title: "AI chatbots spread in US schools", topics: ["ai-tech"] }));
    const b = snapshot(makeArticle({ id: "c2", title: "US regulators open AI copyright inquiry", topics: ["ai-tech"] }));
    expect(findConnections(a, [b])).toEqual([]);
    const c = snapshot(makeArticle({ id: "c3", title: "Shehbaz Sharif meets Kristalina Georgieva on IMF programme", topics: ["pakistan"] }));
    const d = snapshot(makeArticle({ id: "c4", title: "Georgieva says Shehbaz Sharif committed to reforms", topics: ["business"] }));
    expect(findConnections(c, [d])[0]?.relation).toMatch(/^Basic metadata connection:/);
  });

  it("asks a question about the actual story and labels the view as basic", () => {
    const phd = snapshot(makeArticle({ id: "p1", title: "PhD students who write dissertation with AI less likely to stay in academia", description: "A study of 2,000 doctoral graduates across European universities found that those who used AI tools to write were more likely to take industry jobs within a year of graduating.", topics: ["education"] }));
    const q = storyQuestion(phd);
    expect(q).toContain("PhD students who write dissertation with AI");
    expect(q).not.toMatch(/eligible or affected|deadlines or costs/);
    const bp = evidenceBiggerPicture(phd, [phd], []);
    expect(bp.source).toBe("evidence");
    expect(bp.note).toMatch(/Basic metadata-based view/);
  });
});

describe("PWA manifest", () => {
  it("is installable: name, start URL, standalone display and 192/512 icons", () => {
    const m = manifest();
    expect(m).toMatchObject({ short_name: "DAYBREAK", display: "standalone", start_url: "/newspaper?source=pwa", theme_color: "#1b1a17" });
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });
});

describe("API payloads", () => {
  it("clamp stored publisher text in editions and bookmarks, even for older records", async () => {
    const { publicEdition, publicBookmark } = await import("@/lib/news/rights");
    const long = "A first sentence. " + "Long stored paragraph text. ".repeat(40);
    const e = publicEdition({ stories: [{ summary: long, summarySource: "source", article: { sourceId: "x", excerpt: long } }, { summary: "AI text", summarySource: "ai", article: { sourceId: "x", excerpt: long } }] });
    expect(e.stories.every((s) => s.summary.length <= DISPLAY_EXCERPT_MAX && s.article.excerpt.length <= DISPLAY_EXCERPT_MAX)).toBe(true);
    expect(e.stories[1]!.summary).toBe("AI text");
    expect(publicBookmark({ article: { sourceId: "x", excerpt: long } }).article.excerpt.length).toBeLessThanOrEqual(DISPLAY_EXCERPT_MAX);
  });
});

describe("Story Explorer on real headlines (17 Oct 2026 pool)", () => {
  const h = (id: string, publisher: string, title: string, regions: string[], hour: number, topic = "world") =>
    makeArticle({ id, publisher, title, regions, topics: [topic as "world"], publishedAt: at(hour), description: "" });
  const pool = [
    h("wb1", "The Guardian", "Israeli settlers attack olive farmers and Washington Post journalist in West Bank", ["US"], 8),
    h("wb2", "NPR", "Israeli settlers beat Palestinians and a U.S. photojournalist in West Bank attacks", ["US"], 9),
    h("wb3", "BBC News", "Palestinians and US journalist injured by Israeli settlers in West Bank harvest attack", ["US"], 10),
    h("wb4", "UN News", "Settler attacks on West Bank olive harvest injure Palestinians and a journalist", ["GLOBAL"], 7),
    h("wb5", "BBC News", "China tells Israel to stop 'forced establishment' of West Bank settlements", ["GLOBAL"], 12),
    h("t1", "Business Recorder", "Trump waives key Russia-related sanctions, tariffs before they take effect under new law", ["US"], 4),
    h("t2", "BBC News", "Trump waives several Russia sanctions as row with Zelensky intensifies", ["US"], 5),
    h("t3", "BBC News", "Trump denies limiting Ukraine access to Starlink network", ["GLOBAL"], 13),
    h("t4", "NPR", "Trump promised a swing district blitz. He's going to a lot of very red states", ["GLOBAL"], 3),
    h("c1", "Business Recorder", "India detains ‘cockroach’ founder, student leaders", ["IN"], 11),
    h("c2", "The Guardian", "India’s Cockroach Janta party leader arrested amid crackdown on protests", ["IN"], 20),
    h("c3", "BBC News", "India's 'cockroach' party founder detained ahead of protest", ["IN"], 21),
    h("x1", "Geo News", "Parts of Karachi to face gas supply suspension this weekend: SSGC", ["PK"], 8, "pakistan"),
    h("x2", "The Express Tribune", "H-9, G-6 markets face temporary closure", ["PK"], 9, "pakistan"),
  ];

  it("shows all four publishers that reported the West Bank attack, and not the separate settlements story", () => {
    const c = findCoverage(pool[0]!, pool);
    expect(c.reports.map((r) => r.publisher).sort()).toEqual(["BBC News", "NPR", "The Guardian", "UN News"]);
    expect(c.reports.map((r) => r.id)).not.toContain("wb5");
  });

  it("groups the three 'cockroach' party reports despite different wording", () => {
    expect(findCoverage(pool[9]!, pool).reports).toHaveLength(3);
  });

  it("keeps separate Trump stories apart: sanctions ≠ Starlink ≠ campaign", () => {
    const c = findCoverage(pool[5]!, pool);
    expect(c.reports.map((r) => r.id).sort()).toEqual(["t1", "t2"]);
    expect(findCoverage(pool[7]!, pool).reports.map((r) => r.id)).toEqual(["t3"]);
    expect(findCoverage(pool[8]!, pool).reports.map((r) => r.id)).toEqual(["t4"]);
  });

  it("does not merge unrelated local stories that share generic words ('face')", () => {
    expect(findCoverage(pool[12]!, pool).reports).toHaveLength(1);
  });
});
