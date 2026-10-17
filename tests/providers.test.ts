import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAiMetrics, aiMetrics, errorKind } from "@/lib/ai/metrics";
import { withFallback } from "@/lib/ai/provider";
import { contentHash, copiesSource, precomputeSummaries } from "@/lib/ai/summaries";
import { llmConfig, llmFallbackConfig } from "@/lib/env";
import { describeFeedError } from "@/lib/news/ingest";
import { setRightsOverridesForTests } from "@/lib/news/rights";
import { FileStore } from "@/lib/store/file-store";
import { makeArticle } from "./fixtures/articles";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const ok = (text: string, modelId: string) =>
  new MockLanguageModelV4({ modelId, doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [], response: { modelId } }) });
const failing = (status: number) =>
  new MockLanguageModelV4({
    modelId: "groq-model",
    doGenerate: async () => {
      throw Object.assign(new Error(`provider said no, key=gsk_SECRET123`), { statusCode: status });
    },
  });

beforeEach(() => __resetAiMetrics());

describe("provider configuration", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const clear = () => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_STUDIO_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "LLM_PROVIDER", "LLM_MODEL", "GROQ_MODEL", "LLM_FALLBACK_PROVIDER"]) delete process.env[k];
  };

  it("prefers Groq, falls back to Gemini, and reads models from the environment", () => {
    clear();
    process.env.GROQ_API_KEY = "x";
    process.env.GEMINI_API_KEY = "y";
    expect(llmConfig()).toMatchObject({ provider: "groq", model: "openai/gpt-oss-120b" });
    expect(llmFallbackConfig()).toMatchObject({ provider: "google", model: "gemini-3.5-flash" });
    process.env.GROQ_MODEL = "openai/gpt-oss-20b";
    expect(llmConfig()?.model).toBe("openai/gpt-oss-20b");
    process.env.LLM_FALLBACK_PROVIDER = "none";
    expect(llmFallbackConfig()).toBeNull();
  });

  it("uses Gemini alone when there is no Groq key, with no fallback", () => {
    clear();
    process.env.GEMINI_API_KEY = "y";
    expect(llmConfig()?.provider).toBe("google");
    expect(llmFallbackConfig()).toBeNull();
  });
});

describe("fallback wrapper", () => {
  it("answers from the fallback when the primary is rate limited, and records both", async () => {
    const model = withFallback(failing(429), "groq/m", ok("from gemini", "gemini-3.5-flash"), "google/gemini-3.5-flash");
    const r = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(r.text).toBe("from gemini");
    expect(r.response.modelId).toBe("gemini-3.5-flash"); // labelled by who actually answered
    const m = aiMetrics();
    expect(m["groq/m"]).toMatchObject({ calls: 1, errors: 1, lastErrorKind: "rate_limited" });
    expect(m["google/gemini-3.5-flash"]).toMatchObject({ calls: 1, errors: 0 });
    expect(JSON.stringify(m)).not.toContain("gsk_SECRET123");
  });

  it("does not fall back when the caller aborted", async () => {
    const fallback = ok("should not run", "g");
    const spy = vi.spyOn(fallback, "doGenerate");
    const ac = new AbortController();
    ac.abort();
    const model = withFallback(failing(500), "groq/m", fallback, "google/g");
    await expect(generateText({ model, prompt: "hi", maxRetries: 0, abortSignal: ac.signal })).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("classifies provider errors without keeping messages", () => {
    expect(errorKind({ statusCode: 401 })).toBe("invalid_credentials");
    expect(errorKind({ statusCode: 503 })).toBe("http_503");
    expect(errorKind({ name: "TimeoutError" })).toBe("timeout");
  });
});

describe("background summaries", () => {
  const store = () => new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-sum-")), "db.json"));
  const desc = "Officials said the provincial government approved a new flood relief package for affected districts on Thursday evening.";
  const articles = [makeArticle({ id: "s1", title: "Sindh approves flood relief package", description: desc, publishedAt: new Date().toISOString() })];
  const answer = (summary: string) => ok(JSON.stringify({ items: [{ id: "A1", summary }] }), "openai/gpt-oss-20b");

  it("saves original summaries with a content hash, reuses them, and redoes them when the article changes", async () => {
    const s = store();
    await s.upsertArticles(articles);
    const ai = { model: answer("The Sindh government has agreed a relief package for districts hit by floods, according to officials."), modelId: "openai/gpt-oss-20b", timeoutMs: 5000 };
    expect((await precomputeSummaries(s, ai)).saved).toBe(1);
    const [c] = await s.getCachedSummaries(["s1"], "openai/gpt-oss-20b");
    expect(c?.contentHash).toBe(contentHash(articles[0]!));
    expect((await precomputeSummaries(s, ai)).requested).toBe(0); // cached and still valid
    await s.upsertArticles([{ ...articles[0]!, description: desc + " The package covers 12 districts." }]);
    expect((await precomputeSummaries(s, ai)).requested).toBe(1); // source changed → regenerate
  });

  it("rejects summaries that copy the publisher's wording, and skips sources barred from AI", async () => {
    const s = store();
    await s.upsertArticles(articles);
    const copy = { model: answer("Officials said the provincial government approved a new flood relief package for affected districts."), modelId: "m", timeoutMs: 5000 };
    expect(await precomputeSummaries(s, copy)).toMatchObject({ saved: 0, rejected: 1 });
    setRightsOverridesForTests({ [articles[0]!.sourceId]: { ai: false } });
    expect((await precomputeSummaries(s, copy)).requested).toBe(0);
    setRightsOverridesForTests({});
  });

  it("detects 8-word reuse but allows shared names and short phrases", () => {
    expect(copiesSource("Officials said the provincial government approved a new flood relief package today", desc)).toBe(true);
    expect(copiesSource("Sindh has agreed flood relief for affected districts, officials said.", desc)).toBe(false);
  });
});

describe("hedge preservation", () => {
  it("rejects summaries that turn a reported claim into fact (real Groq output, 17 Oct)", async () => {
    const { dropsHedge } = await import("@/lib/ai/summaries");
    const src = "United Arab Emirates will reportedly resume payments to Yemeni forces as gains by Iran-backed Houthi fighters alarm Gulf state rulers";
    expect(dropsHedge("The UAE is set to resume payments to Yemeni forces, a move prompted by Houthi advances that alarm Gulf leaders.", src)).toBe(true);
    expect(dropsHedge("The UAE will reportedly resume payments to Yemeni forces after Houthi advances.", src)).toBe(false);
    expect(dropsHedge("Sonay Kartal reached the Wuhan Open final.", "Britain's Sonay Kartal beats Jelena Ostapenko to reach the Wuhan Open final.")).toBe(false);
  });
});

describe("summary input and output filters (real cases, 17 Oct)", () => {
  it("skips non-English and caption-fragment sources, and rejects meta answers", async () => {
    const { summarisableText, summariseArticles } = await import("@/lib/ai/summaries");
    expect(summarisableText("रणजी ट्रॉफ़ी के दूसरे राउंड में पंजाब के लिए खेलेंगे शुभमन गिल. नवंबर में वनडे सीरीज़")).toBe(false);
    expect(summarisableText("Sindh approves flood relief package. Officials said the package was approved.")).toBe(true);
    const a = makeArticle({ id: "m1", title: "Hindi cricket story", description: "Officials said the provincial government approved a new package for districts today." });
    const meta = ok(JSON.stringify({ items: [{ id: "A1", summary: "The excerpt is in Hindi and does not provide a clear English headline; no summary is provided." }] }), "m");
    expect((await summariseArticles(meta, "m", [a], { timeoutMs: 5000 })).run).toMatchObject({ saved: 0, rejected: 1 });
  });
});

describe("feed error messages", () => {
  it("explain what went wrong and what to do", () => {
    expect(describeFeedError("HTTP 403")).toMatch(/^Blocked by the publisher \(HTTP 403\)/);
    expect(describeFeedError("HTTP 404")).toMatch(/moved or removed/);
    expect(describeFeedError("HTTP 503")).toMatch(/server error/);
    expect(describeFeedError("Unexpected content type text/html")).toMatch(/Not a usable feed/);
    expect(describeFeedError("The operation was aborted due to timeout")).toMatch(/Timed out/);
    expect(describeFeedError("getaddrinfo ENOTFOUND example.invalid")).toMatch(/Network error/);
  });
});

describe("ingest lease", () => {
  it("lets only one refresh hold the lease until it is released or expires", async () => {
    const s = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-lock-")), "db.json"));
    expect(await s.claimIngestLock("a", 60)).toBe(true);
    expect(await s.claimIngestLock("b", 60)).toBe(false);
    await s.releaseIngestLock("b"); // not the holder: no effect
    expect(await s.claimIngestLock("b", 60)).toBe(false);
    await s.releaseIngestLock("a");
    expect(await s.claimIngestLock("b", 60)).toBe(true);
  });
});
