import { describe, expect, it } from "vitest";
import { cleanArticleUrl, dedupeArticles, normalizeItem, normalizeUrl, parseDate } from "@/lib/news/normalize";
import type { RawFeedItem } from "@/lib/news/parse";
import { SOURCE_BY_ID } from "@/lib/news/sources";
import { makeArticle, NOW } from "./fixtures/articles";

const source = SOURCE_BY_ID["dawn-pakistan"]!;
const raw = (over: Partial<RawFeedItem> = {}): RawFeedItem => ({
  title: "Karachi schools reopen after rain",
  link: "https://www.dawn.com/news/123/karachi-schools?utm_source=rss&utm_medium=feed#comments",
  description: "<p>Schools in Karachi reopened on Friday after two days of heavy rain, officials said.</p>",
  content: "",
  published: "Fri, 16 Oct 2026 10:00:00 GMT",
  author: null,
  categories: [],
  imageCandidates: [{ url: "http://img.example.com/a.jpg", width: 600 }],
  ...over,
});

describe("URL normalisation", () => {
  it("strips tracking parameters, fragments, www and trailing slashes", () => {
    expect(normalizeUrl("https://www.Example.com/a/b/?utm_source=x&b=2&a=1#frag")).toBe("example.com/a/b?a=1&b=2");
    expect(normalizeUrl("http://example.com/a")).toBe(normalizeUrl("https://example.com/a/"));
    expect(cleanArticleUrl("https://example.com/x?at_medium=RSS&id=3")).toBe("https://example.com/x?id=3");
  });

  it("rejects dangerous or internal URLs", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x", "http://169.254.169.254/latest", "https://user:pw@example.com/"]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
});

describe("normalizeItem", () => {
  it("builds a clean article with topics, region and a short excerpt", () => {
    const a = normalizeItem(raw(), source, NOW)!;
    expect(a.url).toBe("https://www.dawn.com/news/123/karachi-schools");
    expect(a.title).toBe("Karachi schools reopen after rain");
    expect(a.description).toBe("Schools in Karachi reopened on Friday after two days of heavy rain, officials said.");
    expect(a.publisher).toBe("Dawn");
    expect(a.regions).toContain("PK");
    expect(a.topics).toContain("pakistan");
    expect(a.imageUrl).toBe("https://img.example.com/a.jpg");
    expect(a.publishedAt).toBe("2026-10-16T10:00:00.000Z");
  });

  it("drops items without a usable title or link", () => {
    expect(normalizeItem(raw({ title: "" }), source, NOW)).toBeNull();
    expect(normalizeItem(raw({ link: "javascript:alert(1)" }), source, NOW)).toBeNull();
  });

  it("never stores a full article: excerpts are capped", () => {
    const long = "This is a sentence of reporting. ".repeat(200);
    const a = normalizeItem(raw({ description: long }), source, NOW)!;
    expect(a.description.length).toBeLessThanOrEqual(300);
  });

  it("handles missing and invalid dates", () => {
    expect(parseDate(null, NOW)).toBeNull();
    expect(parseDate("not a date", NOW)).toBeNull();
    expect(parseDate("2030-01-01T00:00:00Z", NOW)).toBeNull();
    expect(parseDate("Fri, 16 Oct 26 21:47:32 +0500", NOW)).toBe("2026-10-16T16:47:32.000Z");
  });

  it("strips feed boilerplate", () => {
    const a = normalizeItem(raw({ description: "Nature, Published online: 16 October 2026; doi:10.1038/d41586-026-0 Real text starts here and continues for a while. Continue reading..." }), source, NOW)!;
    expect(a.description).toBe("Real text starts here and continues for a while.");
  });
});

describe("dedupeArticles", () => {
  it("removes exact URL duplicates and same-publisher near-duplicates, keeps cross-publisher coverage", () => {
    const a = makeArticle({ id: "x1", title: "Central bank holds interest rate steady amid inflation", publisher: "A" });
    const sameUrl = { ...a, description: "" };
    const nearSamePub = makeArticle({ id: "x2", title: "Central bank holds interest rate steady amid inflation fears", publisher: "A" });
    const otherPub = makeArticle({ id: "x3", title: "Central bank holds interest rate steady amid inflation", publisher: "B" });
    const unrelated = makeArticle({ id: "x4", title: "Cricket board names squad for Test series", publisher: "A" });
    const out = dedupeArticles([a, sameUrl, nearSamePub, otherPub, unrelated]);
    expect(out.map((x) => x.id).sort()).toEqual(["x1", "x3", "x4"]);
  });
});
