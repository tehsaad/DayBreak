import { apiError, json, log, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { newsMode } from "@/lib/env";
import { ingest, summarizeRun } from "@/lib/news/ingest";
import { getServiceStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Reader-triggered news refresh. Bounded, rate-limited, and freshness-aware (fresh feeds are skipped). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  if (newsMode() === "sample") return apiError(409, "News refresh is disabled in sample mode (NEWS_MODE=sample).");
  const rl = rateLimit("refresh", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const run = await ingest({ store: getServiceStore(), trigger: "on_demand", budgetMs: 20_000, log });
  return json({ run: summarizeRun(run) });
}
