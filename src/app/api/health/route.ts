import { json } from "@/lib/api";
import { aiMetrics } from "@/lib/ai/metrics";
import { gnewsApiKey, llmConfig, llmFallbackConfig, newsMode, sharedNewsStorage, storageMode } from "@/lib/env";
import { getServiceStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Liveness and configuration overview — never reveals secrets, only whether they are set.
 * `region` and `dbMs` separate network distance from server work: dbMs is one trivial query from
 * this function to the database. `aiCalls` are this instance's LLM call counts and latencies.
 */
export async function GET() {
  const llm = llmConfig();
  const fallback = llmFallbackConfig(llm);
  let dbMs: number | null = null;
  if (sharedNewsStorage() === "supabase") {
    const t = Date.now();
    dbMs = await getServiceStore()
      .lastIngestionRun()
      .then(() => Date.now() - t)
      .catch(() => null);
  }
  return json({
    ok: true,
    storage: storageMode(),
    // Where the shared news pool lives: "supabase" needs SUPABASE_SERVICE_ROLE_KEY.
    sharedNews: sharedNewsStorage(),
    news: newsMode(),
    ai: llm ? { provider: llm.provider, model: llm.model, fallback: fallback ? { provider: fallback.provider, model: fallback.model } : null } : null,
    aiCalls: aiMetrics(),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    gnewsConfigured: Boolean(gnewsApiKey()),
    region: process.env.VERCEL_REGION ?? null,
    dbMs,
  });
}
