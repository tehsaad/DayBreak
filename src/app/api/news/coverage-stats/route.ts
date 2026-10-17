import { json } from "@/lib/api";
import { findCoverage } from "@/lib/coverage/group";
import { publicMemo } from "@/lib/public-cache";
import { getServiceStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public, aggregate view of Full Coverage on the live pool (shared news only, no reader data):
 * how many distinct publishers each recent story is matched with, and the largest groups, so
 * matching quality can be checked against real data. Cached for 10 minutes.
 */
export async function GET() {
  const stats = await publicMemo("coverage-stats", 10 * 60_000, async () => {
    const started = Date.now();
    const pool = (await getServiceStore().listArticles({ sinceHours: 96, limit: 1500 })).filter((a) => !a.sample);
    const sample = [...pool].sort((a, b) => Date.parse(b.publishedAt ?? b.collectedAt) - Date.parse(a.publishedAt ?? a.collectedAt)).slice(0, 200);
    const histogram: Record<string, number> = {};
    const groups: { publishers: number; reports: { publisher: string; title: string }[] }[] = [];
    for (const a of sample) {
      const c = findCoverage(a, pool);
      histogram[c.reports.length] = (histogram[c.reports.length] ?? 0) + 1;
      if (c.reports.length >= 3) groups.push({ publishers: c.reports.length, reports: c.reports.map((r) => ({ publisher: r.publisher, title: r.title })) });
    }
    const seen = new Set<string>();
    const largest = groups
      .sort((x, y) => y.publishers - x.publishers)
      .filter((g) => {
        const k = g.reports.map((r) => r.title).sort().join("|");
        return seen.has(k) ? false : (seen.add(k), true);
      })
      .slice(0, 8);
    return { poolSize: pool.length, publishers: new Set(pool.map((a) => a.publisher)).size, sampled: sample.length, histogram, largest, computeMs: Date.now() - started };
  });
  return json(stats, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=1200" } });
}
