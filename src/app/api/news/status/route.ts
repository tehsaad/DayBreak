import { json } from "@/lib/api";
import { getServiceStore } from "@/lib/store";
import { SOURCES } from "@/lib/news/sources";

export const dynamic = "force-dynamic";

/** Public source-health summary (no reader data). */
export async function GET() {
  const store = getServiceStore();
  const [health, last] = await Promise.all([store.getSourceHealth(), store.lastIngestionRun()]);
  const byId = new Map(health.map((h) => [h.sourceId, h]));
  return json({
    lastRun: last ? { finishedAt: last.finishedAt, trigger: last.trigger, inserted: last.inserted } : null,
    sources: SOURCES.map((s) => {
      const h = byId.get(s.id);
      return { id: s.id, name: s.name, publisher: s.publisher, region: s.region, topics: s.topics, status: s.status, lastSuccessAt: h?.lastSuccessAt ?? null, lastStatus: h?.lastStatus ?? null, lastError: h?.lastError ?? null, items: h?.lastItemCount ?? 0 };
    }),
  });
}
