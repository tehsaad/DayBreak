/**
 * Verify the configured LLM provider with one tiny request (a few tokens).
 * Usage: npm run check:ai   — reads the same env as the app (LLM_PROVIDER, keys, VERCEL_OIDC_TOKEN).
 */
import { generateText } from "ai";
import { configuredModel } from "../src/lib/ai/provider";
import { llmStatusNote } from "../src/lib/env";

const handle = configuredModel();
if (!handle) {
  console.log(`No LLM configured: ${llmStatusNote()}`);
  process.exit(1);
}
console.log(`provider=${handle.config.provider} model=${handle.config.model}`);
const started = Date.now();
try {
  const r = await generateText({ model: handle.model, prompt: "Reply with exactly: DAYBREAK OK", maxOutputTokens: 16, timeout: 30_000, maxRetries: 0 });
  console.log(`reply="${r.text.trim()}" tokens in/out=${r.usage.inputTokens}/${r.usage.outputTokens} ${Date.now() - started}ms`);
} catch (err) {
  console.log(`LLM request failed: ${(err as Error).message.slice(0, 300)}`);
  process.exit(1);
}
