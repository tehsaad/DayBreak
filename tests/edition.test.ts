import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CooldownError, generateEdition } from "@/lib/edition/generate";
import { ensureBiggerPicture } from "@/lib/edition/bigger-picture";
import { recordReaderFeedback } from "@/lib/feedback";
import { sampleArticles } from "@/lib/news/sample";
import { FileStore } from "@/lib/store/file-store";
import { PROFILES } from "./fixtures/profiles";
import { NOW } from "./fixtures/articles";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function freshStore() {
  return new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-")), "db.json"));
}

describe("edition generation", () => {
  it("creates, persists and returns the same edition on repeat 'ensure' calls", async () => {
    const store = freshStore();
    const prefs = PROFILES.pakistanStudent;
    const first = await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now: NOW });
    expect(first.created).toBe(true);
    expect(first.edition.contentMode).toBe("sample");
    expect(first.edition.ai.used).toBe(false);
    expect(first.edition.ai.note).toMatch(/No language-model API key/);
    const again = await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now: new Date(NOW.getTime() + 60_000) });
    expect(again.created).toBe(false);
    expect(again.edition.id).toBe(first.edition.id);
    expect((await store.listEditions(USER)).length).toBe(1);
  });

  it("deduplicates concurrent generation requests", async () => {
    const store = freshStore();
    const results = await Promise.all(Array.from({ length: 5 }, () => generateEdition({ store, userId: USER, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null, now: NOW })));
    expect(new Set(results.map((r) => r.edition.id)).size).toBe(1);
    expect((await store.listEditions(USER)).length).toBe(1);
  });

  it("regenerates as a new revision with a cooldown, keeping the old edition unchanged", async () => {
    const store = freshStore();
    const prefs = PROFILES.climateReader;
    const one = await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now: NOW });
    await expect(generateEdition({ store, userId: USER, prefs, mode: "regenerate", ai: null, now: new Date(NOW.getTime() + 5_000) })).rejects.toBeInstanceOf(CooldownError);
    const snapshot = JSON.stringify(await store.getEdition(USER, one.edition.id));
    const two = await generateEdition({ store, userId: USER, prefs, mode: "regenerate", ai: null, now: new Date(NOW.getTime() + 120_000) });
    expect(two.edition.revision).toBe(2);
    expect(JSON.stringify(await store.getEdition(USER, one.edition.id))).toBe(snapshot);
  });

  it("stores everything an edition needs to be re-read without regeneration", async () => {
    const store = freshStore();
    const { edition } = await generateEdition({ store, userId: USER, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null, now: NOW });
    expect(edition.stories[0]!.article.url).toMatch(/^https:\/\//);
    expect(edition.stories[0]!.biggerPicture?.source).toBe("evidence");
    expect(edition.threeThings).toHaveLength(3);
    expect(edition.preferencesSnapshot.sections).toEqual(PROFILES.aiResearcher.sections);
    expect(edition.stories.every((s, i) => s.position === i)).toBe(true);
    for (const t of edition.threeThings) for (const id of t.articleIds) expect(edition.stories.some((s) => s.article.id === id)).toBe(true);
  });

  it("keeps readers' editions private to them", async () => {
    const store = freshStore();
    const { edition } = await generateEdition({ store, userId: USER, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null, now: NOW });
    expect(await store.getEdition(OTHER, edition.id)).toBeNull();
    expect(await store.listEditions(OTHER)).toEqual([]);
    await expect(recordReaderFeedback(store, OTHER, { type: "save", editionId: edition.id, articleId: edition.stories[0]!.article.id })).rejects.toThrow(/not found/);
  });

  it("learns: not-interested + saves change the next revision", async () => {
    const store = freshStore();
    const prefs = PROFILES.aiResearcher;
    const one = await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now: NOW });
    const lead = one.edition.stories[0]!.article;
    await recordReaderFeedback(store, USER, { type: "not_interested", editionId: one.edition.id, articleId: lead.id }, NOW);
    const climate = one.edition.stories.find((s) => s.article.topics.includes("climate") || s.article.topics.includes("science"));
    if (climate) await recordReaderFeedback(store, USER, { type: "save", editionId: one.edition.id, articleId: climate.article.id }, NOW);
    const two = await generateEdition({ store, userId: USER, prefs, mode: "regenerate", ai: null, now: new Date(NOW.getTime() + 120_000) });
    expect(two.edition.stories.map((s) => s.article.id)).not.toContain(lead.id);
    expect(two.edition.ranking.feedbackSignals).toBeGreaterThanOrEqual(1);
    expect(two.edition.ranking.learnedTopics[lead.topics[0]!]).toBeLessThan(0);
    // Saving also bookmarks
    if (climate) expect((await store.listBookmarks(USER)).map((b) => b.articleId)).toContain(climate.article.id);
  });

  it("deduplicates repeated feedback on the same story", async () => {
    const store = freshStore();
    const { edition } = await generateEdition({ store, userId: USER, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null, now: NOW });
    const articleId = edition.stories[1]!.article.id;
    const a = await recordReaderFeedback(store, USER, { type: "open", editionId: edition.id, articleId });
    const b = await recordReaderFeedback(store, USER, { type: "open", editionId: edition.id, articleId });
    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(true);
    expect((await store.listFeedback(USER, 1)).filter((f) => f.type === "open")).toHaveLength(1);
  });

  it("fills in the Bigger Picture on demand once, comparing only with earlier editions", async () => {
    const store = freshStore();
    const prefs = PROFILES.pakistanStudent;
    const day1 = await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now: new Date(NOW.getTime() - 86400_000), articles: sampleArticles(new Date(NOW.getTime() - 86400_000)) });
    const day2 = await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now: NOW });
    const pos = day2.edition.stories.findIndex((s) => !s.biggerPicture);
    const first = await ensureBiggerPicture({ store, userId: USER, edition: day2.edition, position: pos, ai: null });
    expect(first.generated).toBe(true);
    const reloaded = (await store.getEdition(USER, day2.edition.id))!;
    const second = await ensureBiggerPicture({ store, userId: USER, edition: reloaded, position: pos, ai: null });
    expect(second.generated).toBe(false);
    for (const e of first.biggerPicture.earlierCoverage) expect(e.editionId).toBe(day1.edition.id);
  });
});
