import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseStore } from "@/lib/store/supabase-store";
import type { Store } from "@/lib/store/types";
import { makeArticle } from "./fixtures/articles";

/**
 * Regression: PostgREST builds one column list from the union of all rows in a bulk upsert, so a
 * row without collected_at is written as NULL. Ingestion failed on every run after the first
 * because new rows (with collected_at) and known rows (without) were sent together.
 */
function fakeService(existingIds: string[]) {
  const calls: { table: string; rows: Record<string, unknown>[] }[] = [];
  const builder = (table: string) => ({
    select: () => ({ in: async () => ({ data: existingIds.map((id) => ({ id })), error: null }) }),
    upsert: async (rows: Record<string, unknown>[]) => {
      calls.push({ table, rows });
      const keys = new Set(rows.flatMap((r) => Object.keys(r)));
      const missing = table === "articles" && keys.has("collected_at") && rows.some((r) => !("collected_at" in r));
      return { data: null, error: missing ? { message: 'null value in column "collected_at" violates not-null constraint' } : null };
    },
  });
  return { client: { from: builder } as unknown as SupabaseClient, calls };
}

describe("SupabaseStore.upsertArticles", () => {
  it("never mixes new and existing rows in one request, and keeps existing collected_at", async () => {
    const { client, calls } = fakeService(["old1"]);
    const store = new SupabaseStore(client, client, {} as Store);
    const inserted = await store.upsertArticles([makeArticle({ id: "old1" }), makeArticle({ id: "new1" }), makeArticle({ id: "new2" })]);
    expect(inserted).toBe(2);
    const articleCalls = calls.filter((c) => c.table === "articles");
    expect(articleCalls).toHaveLength(2);
    for (const c of articleCalls) expect(new Set(c.rows.map((r) => "collected_at" in r)).size).toBe(1);
    expect(articleCalls.find((c) => c.rows.some((r) => r.id === "old1"))!.rows[0]).not.toHaveProperty("collected_at");
  });
});
