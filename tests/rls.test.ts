import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies the real Supabase migration to Postgres (PGlite) with a minimal stand-in for
 * Supabase's auth schema, then checks Row Level Security, immutability and idempotency as the
 * `authenticated` role — the same role PostgREST uses for signed-in readers.
 */
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let db: PGlite;

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

const editionPayload = (id: string, user: string, revision = 1) => ({
  id,
  user_id: user,
  edition_date: "2026-10-17",
  revision,
  content_mode: "live",
  reader_name: "Test",
  intro: "Good morning.",
  intro_source: "template",
  preferences_snapshot: {},
  ranking: {},
  ai: {},
  sections: [],
  three_things: [],
});
const stories = [
  { position: 0, article_id: "a1", section: "front", tier: "lead", article: { title: "Lead" }, summary: "s", summary_source: "source", score: 7.5 },
  { position: 1, article_id: "a2", section: "front", tier: "top", article: { title: "Second" }, summary: "s", summary_source: "source", score: 6.1 },
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role anon nologin;
    create role service_role nologin bypassrls;
    grant usage on schema auth to authenticated, anon;
  `);
  // Apply every migration in version order, exactly as Supabase does.
  const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  // Supabase grants table privileges to these roles by default; RLS then restricts rows.
  await db.exec(`
    grant usage on schema public to authenticated, anon, service_role;
    grant all on all tables in schema public to authenticated, service_role;
    grant select on all tables in schema public to anon;
    insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
    insert into public.articles (id, url, title, publisher) values ('a1', 'https://example.com/1', 'Lead', 'Example');
  `);
}, 60_000);

afterAll(async () => db?.close());

describe("Supabase migration", () => {
  it("creates a profile for every new auth user", async () => {
    const r = await db.query("select count(*)::int as n from public.profiles");
    expect((r.rows[0] as { n: number }).n).toBe(2);
  });

  it("creates editions atomically and idempotently through create_edition", async () => {
    const first = await asUser(ALICE, () => db.query("select * from public.create_edition($1::jsonb, $2::jsonb)", [JSON.stringify(editionPayload("11111111-1111-4111-8111-111111111111", ALICE)), JSON.stringify(stories)]));
    expect(first.rows[0]).toMatchObject({ created: true });
    // Same (user, date, revision) again — e.g. a double click or concurrent request.
    const dup = await asUser(ALICE, () => db.query("select * from public.create_edition($1::jsonb, $2::jsonb)", [JSON.stringify(editionPayload("22222222-2222-4222-8222-222222222222", ALICE)), JSON.stringify(stories)]));
    expect(dup.rows[0]).toMatchObject({ edition_id: "11111111-1111-4111-8111-111111111111", created: false });
    const count = await db.query("select count(*)::int as n from public.edition_stories");
    expect((count.rows[0] as { n: number }).n).toBe(2);
  });

  it("hides one reader's editions, stories, feedback and bookmarks from another", async () => {
    await asUser(ALICE, async () => {
      await db.query("insert into public.feedback_events (user_id, article_id, type, topics) values ($1, 'a1', 'save', '{climate}')", [ALICE]);
      await db.query("insert into public.saved_articles (user_id, article_id, article) values ($1, 'a1', '{}')", [ALICE]);
      await db.query("insert into public.reader_preferences (user_id, prefs) values ($1, '{}')", [ALICE]);
    });
    const counts = await asUser(BOB, async () => {
      const q = async (t: string) => ((await db.query(`select count(*)::int as n from public.${t}`)).rows[0] as { n: number }).n;
      return { editions: await q("editions"), stories: await q("edition_stories"), feedback: await q("feedback_events"), saved: await q("saved_articles"), prefs: await q("reader_preferences"), profiles: await q("profiles") };
    });
    expect(counts).toEqual({ editions: 0, stories: 0, feedback: 0, saved: 0, prefs: 0, profiles: 1 });
    const mine = await asUser(ALICE, async () => ((await db.query("select count(*)::int as n from public.editions")).rows[0] as { n: number }).n);
    expect(mine).toBe(1);
  });

  it("prevents writing rows on behalf of another reader", async () => {
    await expect(asUser(BOB, () => db.query("insert into public.feedback_events (user_id, article_id, type) values ($1, 'a1', 'save')", [ALICE]))).rejects.toThrow(/row-level security/);
    await expect(
      asUser(BOB, () => db.query("select * from public.create_edition($1::jsonb, $2::jsonb)", [JSON.stringify({ ...editionPayload("33333333-3333-4333-8333-333333333333", ALICE), revision: 2 }), "[]"])),
    ).rejects.toThrow(/row-level security/);
    // Bob's update/delete of Alice's data silently affects zero rows.
    const res = await asUser(BOB, () => db.query("delete from public.saved_articles where user_id = $1", [ALICE]));
    expect(res.affectedRows ?? 0).toBe(0);
  });

  it("keeps published editions immutable except for filling in the Bigger Picture", async () => {
    // Readers have no UPDATE policy on editions: the statement matches nothing…
    await asUser(ALICE, () => db.query("update public.editions set intro = 'changed'"));
    expect((await db.query("select intro from public.editions")).rows[0]).toEqual({ intro: "Good morning." });
    // …and even the service role is stopped by the immutability trigger.
    await db.exec("set role service_role;");
    await expect(db.query("update public.editions set intro = 'changed'")).rejects.toThrow(/immutable/);
    await db.exec("reset role;");
    await expect(asUser(ALICE, () => db.query("update public.edition_stories set summary = 'rewritten' where position = 0"))).rejects.toThrow(/immutable/);
    await asUser(ALICE, () => db.query(`update public.edition_stories set bigger_picture = '{"source":"evidence"}' where position = 1`));
    const bp = await db.query("select bigger_picture from public.edition_stories where position = 1");
    expect((bp.rows[0] as { bigger_picture: unknown }).bigger_picture).toEqual({ source: "evidence" });
  });

  it("deduplicates repeated feedback on the same article", async () => {
    await expect(asUser(ALICE, () => db.query("insert into public.feedback_events (user_id, article_id, type) values ($1, 'a1', 'save')", [ALICE]))).rejects.toThrow(/duplicate key/);
  });

  it("lets signed-in readers read shared articles but not write them; ingestion runs are service-only", async () => {
    const n = await asUser(ALICE, async () => ((await db.query("select count(*)::int as n from public.articles")).rows[0] as { n: number }).n);
    expect(n).toBe(1);
    await expect(asUser(ALICE, () => db.query("insert into public.articles (id, url, title, publisher) values ('x', 'https://e.com', 't', 'p')"))).rejects.toThrow(/row-level security/);
    const runs = await asUser(ALICE, async () => ((await db.query("select count(*)::int as n from public.ingestion_runs")).rows[0] as { n: number }).n);
    expect(runs).toBe(0);
    await expect(asUser(ALICE, () => db.query("insert into public.ingestion_runs (started_at, finished_at, trigger) values (now(), now(), 'cron')"))).rejects.toThrow(/row-level security/);
  });

  it("rejects anonymous access to private tables", async () => {
    await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);");
    const r = await db.query("select count(*)::int as n from public.editions");
    await db.exec("reset role;");
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});
