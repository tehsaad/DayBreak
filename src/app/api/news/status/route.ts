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
  return json({
    lastRun: last ? { finishedAt: last.finishedAt, trigger: last.trigger, inserted: last.inserted } : null,
    sources: ALL_SOURCES.map((s) => {
      const h = byId.get(s.id);
      const status = s.kind === "gnews" && !gnewsApiKey() ? "off" : s.status;
      return { id: s.id, kind: s.kind ?? "rss", name: s.name, publisher: s.publisher, region: s.region, topics: s.topics, status, lastSuccessAt: h?.lastSuccessAt ?? null, lastStatus: h?.lastStatus ?? null, lastError: h?.lastError ?? null, items: h?.lastItemCount ?? 0 };
    }),
  });
}
