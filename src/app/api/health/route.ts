import { json } from "@/lib/api";
import { gnewsApiKey, llmConfig, newsMode, sharedNewsStorage, storageMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness and configuration overview — never reveals secrets, only whether they are set. */
export async function GET() {
  const llm = llmConfig();
  return json({
    ok: true,
    storage: storageMode(),
    // Where the shared news pool lives: "supabase" needs SUPABASE_SERVICE_ROLE_KEY.
    sharedNews: sharedNewsStorage(),
    news: newsMode(),
    ai: llm ? { provider: llm.provider, model: llm.model } : null,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    gnewsConfigured: Boolean(gnewsApiKey()),
  });
}
