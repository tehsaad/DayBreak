import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderContext } from "@/lib/auth/reader";
import { generateEdition } from "@/lib/edition/generate";
import { FileStore } from "@/lib/store/file-store";
import type { Edition } from "@/lib/types";
import { PROFILES } from "./fixtures/profiles";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const store = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-api-")), "db.json"));
let current: ReaderContext | null = null;

vi.mock("@/lib/auth/reader", () => ({
  getReader: async () => current,
  getOrCreateReader: async () => current,
}));
vi.mock("@/lib/store", () => ({ getServiceStore: () => store, getFileStore: () => store }));

const as = (userId: string | null) => {
  current = userId ? { mode: "demo", userId, email: null, store } : null;
};
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/x", {
    method,
    headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

let edition: Edition;

beforeAll(async () => {
  await store.savePreferences(ALICE, PROFILES.aiResearcher);
  edition = (await generateEdition({ store, userId: ALICE, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null })).edition;
});
beforeEach(() => as(ALICE));

describe("preferences API", () => {
  it("validates and normalises input", async () => {
    const { PUT } = await import("@/app/api/preferences/route");
    const bad = await PUT(req("PUT", { depth: "infinite" }));
    expect(bad.status).toBe(400);
    const ok = await PUT(req("PUT", { displayName: "<b>Ali</b>", sections: ["climate"], interests: ["cricket"], region: "XX", timezone: "Not/AZone" }));
    expect(ok.status).toBe(200);
    const { preferences } = await ok.json();
    expect(preferences.displayName).toBe("bAli/b");
    expect(preferences.sections).toEqual(["climate", "sports"]);
    expect(preferences.region).toBe("GLOBAL");
    expect(preferences.timezone).toBe("UTC");
    await store.savePreferences(ALICE, PROFILES.aiResearcher);
  });

  it("rejects cross-origin writes and malformed JSON", async () => {
    const { PUT } = await import("@/app/api/preferences/route");
    expect((await PUT(req("PUT", { sections: [] }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await PUT(req("PUT", "{not json"))).status).toBe(400);
  });

  it("requires a reader", async () => {
    as(null);
    const { GET } = await import("@/app/api/preferences/route");
    expect((await GET()).status).toBe(401);
  });
});

describe("editions API and access control", () => {
  it("returns the reader's own edition and 404s for anyone else", async () => {
    const { GET } = await import("@/app/api/editions/[id]/route");
    expect((await GET(req("GET"), params(edition.id))).status).toBe(200);
    as(BOB);
    expect((await GET(req("GET"), params(edition.id))).status).toBe(404);
    as(null);
    expect((await GET(req("GET"), params(edition.id))).status).toBe(401);
  });

  it("requires onboarding before generating", async () => {
    as(BOB);
    const { POST } = await import("@/app/api/editions/route");
    const res = await POST(req("POST", { mode: "ensure" }));
    expect(res.status).toBe(409);
    expect((await res.json()).next).toBe("/onboarding");
  });

  it("is idempotent for 'ensure' and validates the mode", async () => {
    const { POST } = await import("@/app/api/editions/route");
    const res = await POST(req("POST", { mode: "ensure" }));
    expect((await res.json()).editionId).toBe(edition.id);
    expect((await POST(req("POST", { mode: "delete-everything" }))).status).toBe(400);
  });

  it("enforces the regeneration cooldown", async () => {
    const { POST } = await import("@/app/api/editions/route");
    const res = await POST(req("POST", { mode: "regenerate" }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("feedback and bookmarks API", () => {
  it("records feedback only for stories in the reader's own edition", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const articleId = edition.stories[2]!.article.id;
    expect((await POST(req("POST", { type: "skip", editionId: edition.id, articleId }))).status).toBe(200);
    expect((await POST(req("POST", { type: "skip", editionId: edition.id, articleId: "not-in-edition" }))).status).toBe(404);
    expect((await POST(req("POST", { type: "rating", editionId: edition.id, articleId, value: 9 }))).status).toBe(400);
    expect((await POST(req("POST", { type: "teleport", editionId: edition.id, articleId }))).status).toBe(400);
    as(BOB);
    expect((await POST(req("POST", { type: "save", editionId: edition.id, articleId }))).status).toBe(404);
  });

  it("supports undo", async () => {
    const { POST, DELETE } = await import("@/app/api/feedback/route");
    const articleId = edition.stories[3]!.article.id;
    await POST(req("POST", { type: "not_interested", editionId: edition.id, articleId }));
    const res = await DELETE(req("DELETE", { articleId, type: "not_interested" }));
    expect((await res.json()).removed).toBe(1);
  });

  it("saves and removes bookmarks", async () => {
    const { POST, GET, DELETE } = await import("@/app/api/bookmarks/route");
    const articleId = edition.stories[1]!.article.id;
    expect((await POST(req("POST", { editionId: edition.id, articleId }))).status).toBe(200);
    expect((await (await GET()).json()).bookmarks.map((b: { articleId: string }) => b.articleId)).toContain(articleId);
    expect((await DELETE(req("DELETE", { articleId }))).status).toBe(200);
    expect((await (await GET()).json()).bookmarks).toHaveLength(0);
  });
});

describe("PDF endpoint", () => {
  it("returns a downloadable PDF of exactly this edition", async () => {
    const { GET } = await import("@/app/api/editions/[id]/pdf/route");
    const res = await GET(req("GET"), params(edition.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="daybreak-\d{4}-\d{2}-\d{2}-edition-1\.pdf"/);
    expect(res.headers.get("x-daybreak-edition")).toBe(edition.id);
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // Every story's original link is embedded as a clickable annotation.
    const raw = pdf.toString("latin1");
    for (const s of edition.stories) expect(raw).toContain(s.article.url.replace(/[()\\]/g, (c) => `\\${c}`));
    // Cached: ETag round-trip returns 304.
    const again = await GET(req("GET", undefined, { "if-none-match": res.headers.get("etag")! }), params(edition.id));
    expect(again.status).toBe(304);
  }, 30_000);

  it("refuses other readers", async () => {
    as(BOB);
    const { GET } = await import("@/app/api/editions/[id]/pdf/route");
    expect((await GET(req("GET"), params(edition.id))).status).toBe(404);
  });
});

describe("cron endpoints", () => {
  it("fail closed without CRON_SECRET and reject a wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/prepare/route");
    expect((await GET(req("GET"))).status).toBe(503);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await GET(req("GET", undefined, { authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("prepares editions idempotently with the right secret", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    const { GET } = await import("@/app/api/cron/prepare/route");
    const res = await GET(req("GET", undefined, { authorization: "Bearer s3cret-value" }));
    expect(res.status).toBe(200);
    const { report } = await res.json();
    expect(report.alreadyHad).toBeGreaterThanOrEqual(1);
    expect(report.failed).toBe(0);
    const ingest = await (await import("@/app/api/cron/ingest/route")).GET(req("GET", undefined, { authorization: "Bearer s3cret-value" }));
    expect((await ingest.json()).skipped).toBe("NEWS_MODE=sample");
    delete process.env.CRON_SECRET;
  });
});

describe("health endpoint", () => {
  it("reports configuration without leaking secrets", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-leak";
    const { GET } = await import("@/app/api/health/route");
    const text = await (await GET()).text();
    expect(text).not.toContain("sk-ant");
    expect(JSON.parse(text).ai.provider).toBe("anthropic");
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe("Explore APIs", () => {
  it("follows a topic and requires completed onboarding to generate", async () => {
    const { POST } = await import("@/app/api/topics/route");
    const res = await POST(req("POST", { topic: "climate", follow: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).sections).toContain("climate");
    expect((await POST(req("POST", { topic: "astrology", follow: true }))).status).toBe(400);

    const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await store.savePreferences(CAROL, { ...PROFILES.climateReader, onboardedAt: null });
    as(CAROL);
    const gen = await (await import("@/app/api/editions/route")).POST(req("POST", { mode: "ensure" }));
    expect(gen.status).toBe(409);
  });

  it("saves a stored article that isn't in any edition", async () => {
    const { sampleArticles } = await import("@/lib/news/sample");
    await store.upsertArticles(sampleArticles().slice(0, 3));
    const [article] = await store.listArticles({ limit: 1 });
    const { POST, GET } = await import("@/app/api/bookmarks/route");
    expect((await POST(req("POST", { articleId: article!.id }))).status).toBe(200);
    const saved = (await (await GET()).json()).bookmarks as { articleId: string; editionId: string | null }[];
    expect(saved.find((b) => b.articleId === article!.id)?.editionId).toBeNull();
    expect((await POST(req("POST", { articleId: "nope" }))).status).toBe(404);
  });
});
