import { describe, expect, it, vi } from "vitest";
import { computeRecommendations } from "@/lib/news/recommendations";
import { __clearPublicMemo, publicMemo } from "@/lib/public-cache";
import { makeArticle } from "./fixtures/articles";

const NOW = new Date("2026-10-17T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("search recommendations", () => {
  const articles = [
    makeArticle({ id: "a1", title: "IMF approves new Pakistan loan tranche", publisher: "Dawn", topics: ["business"], publishedAt: hoursAgo(2), imageUrl: "https://img.example.com/1.jpg" }),
    makeArticle({ id: "a2", title: "Pakistan secures IMF tranche after review", publisher: "Geo News", topics: ["business"], publishedAt: hoursAgo(3) }),
    makeArticle({ id: "a3", title: "IMF board backs Pakistan tranche", publisher: "BBC News", topics: ["business"], publishedAt: hoursAgo(4) }),
    makeArticle({ id: "a4", title: "Glacier melt accelerates in Gilgit", publisher: "Dawn", topics: ["climate"], publishedAt: hoursAgo(5) }),
    makeArticle({ id: "a5", title: "Cricket board names Babar Azam captain", publisher: "ESPNcricinfo", topics: ["sports"], publishedAt: hoursAgo(80) }),
    makeArticle({ id: "s1", title: "Sample story about IMF", publisher: "Sample Wire (demo data)", topics: ["business"], publishedAt: hoursAgo(1), sample: true }),
  ];
  const recs = computeRecommendations(articles, NOW);

  it("counts real stories in the stated window and ignores labelled sample data", () => {
    expect(recs.windowHours).toBe(48);
    expect(recs.storyCount).toBe(4);
    expect(recs.topTopics[0]).toEqual({ topic: "business", label: "Business & Economy", stories: 3 });
    expect(recs.topTopics.find((t) => t.topic === "sports")).toBeUndefined(); // outside 48h
  });

  it("suggests names that appear in several publishers' headlines", () => {
    const queries = recs.suggestedQueries.map((q) => q.query);
    expect(queries).toContain("IMF");
    expect(queries).toContain("Pakistan");
    expect(recs.suggestedQueries.find((q) => q.query === "IMF")!.publishers).toBe(3);
    expect(queries).not.toContain("Gilgit"); // only one publisher
  });

  it("ranks important stories by real multi-publisher coverage and prefers an article with an image", () => {
    expect(recs.importantStories[0]).toMatchObject({ id: "a1", publishers: 3, imageUrl: "https://img.example.com/1.jpg" });
    expect(recs.mostCoveredThisWeek.map((s) => s.id)).toContain("a5");
    expect(recs.mostCoveredThisWeek.map((s) => s.id)).not.toContain("a1"); // no duplicates across sections
    expect(recs.publishers).toEqual(["BBC News", "Dawn", "ESPNcricinfo", "Geo News"]);
  });
});

describe("public memo", () => {
  it("shares one load per key within the TTL, and doesn't cache failures", async () => {
    __clearPublicMemo();
    const load = vi.fn(async () => 42);
    await Promise.all([publicMemo("k", 1000, load, 0), publicMemo("k", 1000, load, 10)]);
    expect(load).toHaveBeenCalledTimes(1);
    await publicMemo("k", 1000, load, 2000);
    expect(load).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(publicMemo("f", 1000, failing, 0)).rejects.toThrow("db down");
    await expect(publicMemo("f", 1000, failing, 1)).rejects.toThrow("db down");
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
