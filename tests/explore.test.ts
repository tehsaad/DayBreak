import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FeedbackTargetError, recordReaderFeedback, setTopicFollow } from "@/lib/feedback";
import { hydratePreferences, normalizePreferences } from "@/lib/preferences";
import { computeLearnedProfile } from "@/lib/rank/learning";
import { scoreArticle } from "@/lib/rank/score";
import { FileStore } from "@/lib/store/file-store";
import type { ReaderPreferences } from "@/lib/types";
import { makeArticle, NOW } from "./fixtures/articles";
import { PROFILES } from "./fixtures/profiles";

const USER = "44444444-4444-4444-8444-444444444444";
const store = () => new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-explore-")), "db.json"));

describe("onboarding drafts", () => {
  it("keeps a draft without marking the reader onboarded, then completes", () => {
    const draft = normalizePreferences({ sections: ["climate"] }, null, { complete: false });
    expect(draft.onboardedAt).toBeNull();
    const done = normalizePreferences({ sections: ["climate"] }, draft, { complete: true });
    expect(done.onboardedAt).not.toBeNull();
    // Later drafts never un-onboard a reader.
    expect(normalizePreferences({ sections: ["sports"] }, done, { complete: false }).onboardedAt).toBe(done.onboardedAt);
  });

  it("keeps trusted and excluded publishers exclusive, and fills defaults for old profiles", () => {
    const p = normalizePreferences({ sections: ["world"], preferredPublishers: ["dawn", "bbc-news"], excludedSources: ["dawn"] });
    expect(p.preferredPublishers).toEqual(["bbc-news"]);
    expect(p.language).toBe("en");
    const old = { ...p } as Partial<ReaderPreferences>;
    delete old.preferredPublishers;
    expect(hydratePreferences(old as ReaderPreferences)!.preferredPublishers).toEqual([]);
  });

  it("gives trusted publishers a small, explained boost", () => {
    const prefs = { ...PROFILES.climateReader, preferredPublishers: ["carbon-brief"] };
    const a = makeArticle({ title: "Solar capacity grows again", topics: ["climate"], publisher: "Carbon Brief" });
    const ctx = { prefs, learned: computeLearnedProfile([], NOW), now: NOW, coverage: new Map(), seenIds: new Set<string>(), seenTitles: [] };
    const boosted = scoreArticle(a, ctx);
    const plain = scoreArticle(a, { ...ctx, prefs: PROFILES.climateReader });
    expect(boosted.score - plain.score).toBeCloseTo(0.75);
    expect(boosted.reasons.map((r) => r.text)).toContain("From Carbon Brief, a publisher you trust.");
  });
});

describe("Explore and Search feedback", () => {
  it("records feedback on stored articles using server-side metadata, not the client's", async () => {
    const s = store();
    const a = makeArticle({ id: "explore-1", title: "Cricket board names new squad", topics: ["sports"], publisher: "Dawn" });
    await s.upsertArticles([a]);
    await recordReaderFeedback(s, USER, { type: "rating", value: 1, articleId: "explore-1" });
    await recordReaderFeedback(s, USER, { type: "save", articleId: "explore-1" });
    const events = await s.listFeedback(USER, 1);
    expect(events.find((e) => e.type === "rating")).toMatchObject({ topics: ["sports"], publisher: "Dawn", editionId: null, value: 1 });
    expect((await s.listBookmarks(USER))[0]).toMatchObject({ articleId: "explore-1", editionId: null });
    await expect(recordReaderFeedback(s, USER, { type: "save", articleId: "does-not-exist" })).rejects.toBeInstanceOf(FeedbackTargetError);
  });

  it("follows and unfollows topics as explicit preferences, dropping that topic's interests", async () => {
    const s = store();
    await s.savePreferences(USER, PROFILES.pakistanStudent);
    const followed = await setTopicFollow(s, USER, "climate", true);
    expect(followed.sections).toContain("climate");
    const unfollowed = await setTopicFollow(s, USER, "education", false);
    expect(unfollowed.sections).not.toContain("education");
    expect(unfollowed.interests.some((i) => ["scholarships", "universities"].includes(i))).toBe(false);
    const events = await s.listFeedback(USER, 1);
    expect(events.map((e) => e.type).sort()).toEqual(["follow_topic", "unfollow_topic"]);
    await expect(setTopicFollow(store(), USER, "climate", true)).rejects.toThrow(/onboarding/);
  });

  it("searches stored articles by words, publisher and date, newest or oldest first", async () => {
    const s = store();
    const hours = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    await s.upsertArticles([
      makeArticle({ id: "s1", title: "IMF approves Pakistan loan tranche", publisher: "Dawn", publishedAt: hours(2) }),
      makeArticle({ id: "s2", title: "IMF warns on global growth", publisher: "BBC News", publishedAt: hours(30) }),
      makeArticle({ id: "s3", title: "Glacier melt accelerates", publisher: "Dawn", publishedAt: hours(5 * 24) }),
    ]);
    expect((await s.listArticles({ text: "imf pakistan" })).map((a) => a.id)).toEqual(["s1"]);
    expect((await s.listArticles({ text: "imf" })).map((a) => a.id)).toEqual(["s1", "s2"]);
    expect((await s.listArticles({ text: "imf", sort: "oldest" })).map((a) => a.id)).toEqual(["s2", "s1"]);
    expect((await s.listArticles({ publisher: "Dawn" })).map((a) => a.id).sort()).toEqual(["s1", "s3"]);
    expect((await s.listArticles({ publisher: "Dawn", sinceHours: 24 })).map((a) => a.id)).toEqual(["s1"]);
  });
});
