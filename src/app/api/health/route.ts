import { json } from "@/lib/api";
import { llmConfig, newsMode, storageMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness and configuration overview — never reveals secrets, only whether they are set. */
export async function GET() {
  const llm = llmConfig();
  return json({
    ok: true,
    storage: storageMode(),
    news: newsMode(),
    ai: llm ? { provider: llm.provider, model: llm.model } : null,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  });
}
