import { summarizeRun } from "@/lib/news/ingest";
import { json } from "@/lib/api";
import { getServiceStore } from "@/lib/store";
import { ALL_SOURCES } from "@/lib/news/sources";
import { gnewsApiKey } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Public source-health summary (no reader data). */
export async function GET() {
  const store = getServiceStore();
  const [health, last] = await Promise.all([store.getSourceHealth(), store.lastIngestionRun()]);
  const byId = new Map(health.map((h) => [h.sourceId, h]));
  // Public, non-personal data: let the CDN serve it for a minute.
  return json(
    {
    lastRun: last
      ? {
          finishedAt: last.finishedAt,
          trigger: last.trigger,
          ...summarizeRun(last),
          rawItems: last.rawItems ?? null,
          uniqueItems: last.uniqueItems ?? null,
          duplicatesMerged: last.rawItems != null && last.uniqueItems != null ? last.rawItems - last.uniqueItems : null,
        }
      : null,
    sourceHealth: {
      healthy: health.filter((h) => h.lastStatus === "ok" || h.lastStatus === "not_modified" || h.lastStatus === "empty").length,
      failing: health.filter((h) => h.lastStatus === "error" || h.lastStatus === "rate_limited").length,
      lastSuccessAt: health.map((h) => h.lastSuccessAt).filter((t): t is string => Boolean(t)).sort().at(-1) ?? null,
    },
    sources: ALL_SOURCES.map((s) => {
      const h = byId.get(s.id);
      const status = s.kind === "gnews" && !gnewsApiKey() ? "off" : s.status;
      return { id: s.id, kind: s.kind ?? "rss", name: s.name, publisher: s.publisher, region: s.region, topics: s.topics, status, lastSuccessAt: h?.lastSuccessAt ?? null, lastStatus: h?.lastStatus ?? null, lastError: h?.lastError ?? null, items: h?.lastItemCount ?? 0 };
    }),
    },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
