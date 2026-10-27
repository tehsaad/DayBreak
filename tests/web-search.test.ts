import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gnewsSearchUrl } from "@/lib/news/gnews";
import { activeSources } from "@/lib/news/sources";
import { resetWebSearchForTests, searchWebNews } from "@/lib/news/web-search";
import { __setResolverForTests } from "@/lib/security/safe-fetch";
import { FileStore } from "@/lib/store/file-store";

const NOW = new Date("2026-10-27T08:00:00Z");
const store = () => new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-web-")), "db.json"));
const body = JSON.stringify({
  totalArticles: 2,
  articles: [
    { title: "Monsoon floods displace thousands in Sindh province", description: "Officials said rivers rose after heavy rain.", url: "https://www.example-news.com/floods?utm_source=gnews", image: null, publishedAt: "2026-10-27T06:00:00Z", source: { name: "Example News", url: "https://www.example-news.com" } },
    { title: "Sindh floods: relief camps set up as rivers keep rising", description: "Aid groups opened camps.", url: "https://another.example.org/sindh-relief", image: null, publishedAt: "2026-10-27T05:00:00Z", source: { name: "Another Paper", url: "https://another.example.org" } },
  ],
});

beforeEach(() => {
  __setResolverForTests(async () => ["93.184.216.34"]);
  resetWebSearchForTests();
  process.env.GNEWS_API_KEY = "test-gnews-key-123";
});
afterEach(() => {
  __setResolverForTests(null);
  delete process.env.GNEWS_API_KEY;
  delete process.env.WEB_SEARCH_DAILY_LIMIT;
});

describe("web news search (GNews)", () => {
  it("builds a search request without operators and with a date window", () => {
    const url = new URL(gnewsSearchUrl('floods "Sindh" (relief)', { apiKey: "k", from: NOW }));
    expect(url.origin + url.pathname).toBe("https://gnews.io/api/v4/search");
    expect(url.searchParams.get("q")).toBe("floods Sindh relief");
    expect(url.searchParams.get("from")).toBe("2026-10-27T08:00:00Z");
    expect(url.searchParams.get("lang")).toBe("en");
  });

  it("returns real, normalised, stored articles and caches repeat searches", async () => {
    let calls = 0;
    const fetchImpl = (async (u: URL) => {
      calls++;
      expect(String(u)).toContain("q=floods");
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const s = store();
    const first = await searchWebNews(s, "floods", 3, { now: NOW, fetchImpl });
    expect(first.status).toBe("ok");
    expect(first.articles.map((a) => a.publisher)).toEqual(["Example News", "Another Paper"]);
    // Tracking parameters stripped; publisher URL kept (not a redirect wrapper).
    expect(first.articles[0]!.url).toBe("https://www.example-news.com/floods");
    expect(first.articles.every((a) => a.sourceId === "gnews-search" && !a.sample)).toBe(true);
    // Stored, so Save works like any other article.
    expect(await s.getArticles(first.articles.map((a) => a.id))).toHaveLength(2);
    const again = await searchWebNews(s, "Floods", 3, { now: new Date(NOW.getTime() + 60_000), fetchImpl });
    expect(again.cached).toBe(true);
    expect(calls).toBe(1);
  });

  it("is honest about missing configuration, quota and errors, and never leaks the key", async () => {
    delete process.env.GNEWS_API_KEY;
    expect((await searchWebNews(store(), "floods", 3, { now: NOW })).status).toBe("not_configured");
    process.env.GNEWS_API_KEY = "test-gnews-key-123";
    process.env.WEB_SEARCH_DAILY_LIMIT = "1";
    const failing = (async () => { throw new Error("connect failed for https://gnews.io/api/v4/search?apikey=test-gnews-key-123"); }) as unknown as typeof fetch;
    const err = await searchWebNews(store(), "floods", 3, { now: NOW, fetchImpl: failing });
    expect(err.status).toBe("error");
    expect(err.message).not.toContain("test-gnews-key-123");
    expect((await searchWebNews(store(), "storms", 3, { now: NOW, fetchImpl: failing })).status).toBe("budget_exhausted");
  });

  it("is never fetched by scheduled ingestion", () => {
    process.env.GNEWS_API_KEY = "x";
    expect(activeSources().some((s) => s.id === "gnews-search")).toBe(false);
  });
});
