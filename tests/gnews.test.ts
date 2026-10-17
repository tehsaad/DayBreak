import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { llmConfig, providerApiKey } from "@/lib/env";
import { parseGNews, redactKey } from "@/lib/news/gnews";
import { ingest } from "@/lib/news/ingest";
import { activeSources, GNEWS_SOURCES } from "@/lib/news/sources";
import { __setResolverForTests } from "@/lib/security/safe-fetch";
import { FileStore } from "@/lib/store/file-store";

const KEY = "test-gnews-key-1234567890";
const store = () => new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-gnews-")), "db.json"));

const BODY = JSON.stringify({
  totalArticles: 2,
  articles: [
    {
      title: "Scholarship programme expands for students in Lahore",
      description: "The programme will fund undergraduate study at public universities in Punjab, officials said.",
      content: "Long truncated body… [1234 chars]",
      url: "https://www.example-pk-news.com/story/1?utm_source=gnews",
      image: "https://img.example-pk-news.com/1.jpg",
      publishedAt: "2026-10-17T05:00:00Z",
      source: { name: "Example PK News", url: "https://www.example-pk-news.com" },
    },
    { title: "", url: "https://broken.example.com/x", source: { name: "Broken" } },
  ],
});

beforeEach(() => __setResolverForTests(async () => ["93.184.216.34"]));
afterEach(() => {
  __setResolverForTests(null);
  delete process.env.GNEWS_API_KEY;
});

describe("GNews source", () => {
  it("is only active when GNEWS_API_KEY is set", () => {
    expect(activeSources().some((s) => s.kind === "gnews")).toBe(false);
    process.env.GNEWS_API_KEY = KEY;
    expect(activeSources().filter((s) => s.kind === "gnews")).toHaveLength(GNEWS_SOURCES.length);
  });

  it("parses articles and keeps the real publisher", () => {
    const items = parseGNews(BODY);
    expect(items[0]).toMatchObject({ title: "Scholarship programme expands for students in Lahore", publisher: "Example PK News", content: "" });
    expect(() => parseGNews('{"errors":["You have reached the request limit"]}')).toThrow(/request limit/);
    expect(() => parseGNews("<html>")).toThrow(/invalid JSON/);
  });

  it("ingests into normal articles, sending the key only to gnews.io", async () => {
    process.env.GNEWS_API_KEY = KEY;
    const requested: URL[] = [];
    const fetchImpl = (async (url: URL) => {
      requested.push(url);
      return new Response(BODY, { headers: { "content-type": "application/json; charset=utf-8" } });
    }) as unknown as typeof fetch;
    const s = store();
    const source = GNEWS_SOURCES.find((x) => x.id === "gnews-pk-nation")!;
    const run = await ingest({ store: s, trigger: "script", sources: [source], fetchImpl });
    expect(requested).toHaveLength(1);
    expect(requested[0]!.hostname).toBe("gnews.io");
    expect(requested[0]!.searchParams.get("category")).toBe("nation");
    expect(requested[0]!.searchParams.get("country")).toBe("pk");
    expect(requested[0]!.searchParams.get("apikey")).toBe(KEY);
    expect(run.results[0]).toMatchObject({ sourceId: "gnews-pk-nation", outcome: "ok", items: 1 });
    const [article] = await s.listArticles({ limit: 10 });
    expect(article).toMatchObject({ publisher: "Example PK News", sourceId: "gnews-pk-nation", url: "https://www.example-pk-news.com/story/1" });
    expect(article!.regions).toContain("PK");
    expect(JSON.stringify(await s.getSourceHealth())).not.toContain(KEY);
  });

  it("records quota and auth failures without leaking the key, and respects its interval even when forced", async () => {
    process.env.GNEWS_API_KEY = KEY;
    const source = GNEWS_SOURCES[2]!;
    const s = store();
    const limited = (async () => new Response("{}", { status: 429, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    expect((await ingest({ store: s, trigger: "script", sources: [source], fetchImpl: limited })).results[0]!.outcome).toBe("rate_limited");
    const denied = (async () => new Response("{}", { status: 403, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const r = (await ingest({ store: store(), trigger: "script", sources: [source], fetchImpl: denied })).results[0]!;
    expect(r.error).toMatch(/rejected the API key/);
    expect(JSON.stringify(r)).not.toContain(KEY);

    const ok = (async () => new Response(BODY, { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const fresh = store();
    await ingest({ store: fresh, trigger: "script", sources: [source], fetchImpl: ok });
    let calls = 0;
    const counting = (async () => (calls++, new Response(BODY, { headers: { "content-type": "application/json" } }))) as unknown as typeof fetch;
    const again = await ingest({ store: fresh, trigger: "script", sources: [source], fetchImpl: counting, force: true });
    expect(again.results[0]!.outcome).toBe("skipped_fresh");
    expect(calls).toBe(0);
  });

  it("redacts keys from arbitrary text", () => {
    expect(redactKey(`GET https://gnews.io/api/v4/top-headlines?apikey=${KEY}&max=10 failed: ${KEY}`, KEY)).toBe("GET https://gnews.io/api/v4/top-headlines?apikey=[redacted]&max=10 failed: [redacted]");
  });
});

describe("Gemini / Google AI Studio key names", () => {
  afterEach(() => {
    for (const k of ["GEMINI_API_KEY", "GOOGLE_AI_STUDIO_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "LLM_PROVIDER"]) delete process.env[k];
  });

  it("accepts GEMINI_API_KEY and GOOGLE_AI_STUDIO_API_KEY for the Google provider", () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(llmConfig()).toMatchObject({ provider: "google" });
    expect(providerApiKey("google")).toBe("gemini-test");
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_AI_STUDIO_API_KEY = "studio-test";
    process.env.LLM_PROVIDER = "google";
    expect(providerApiKey("google")).toBe("studio-test");
    expect(llmConfig()?.provider).toBe("google");
  });
});
