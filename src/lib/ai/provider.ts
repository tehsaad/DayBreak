import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createGateway, type LanguageModel } from "ai";
import { llmConfig, llmFallbackConfig, providerApiKey, type LlmConfig } from "../env";
import { recordAiCall } from "./metrics";

/**
 * The one place that knows about LLM vendors. Everything else receives a LanguageModel,
 * so switching provider is an environment change (LLM_PROVIDER / LLM_MODEL), not a code change.
 * Keys are read server-side only.
 */
export function createModel(config: LlmConfig): LanguageModelV4 {
  switch (config.provider) {
    case "groq":
      return createGroq({ apiKey: providerApiKey("groq") })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: providerApiKey("anthropic") })(config.model);
    case "openai":
      return createOpenAI({ apiKey: providerApiKey("openai") })(config.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: providerApiKey("google") })(config.model);
    case "gateway":
      // With no AI_GATEWAY_API_KEY the gateway falls back to Vercel OIDC on deployments.
      return createGateway(providerApiKey("gateway") ? { apiKey: providerApiKey("gateway") } : {})(config.model) as LanguageModelV4;
  }
}

/** Max simultaneous LLM calls per instance (cost and rate-limit control). */
const MAX_CONCURRENT = Math.max(1, Math.min(16, Number(process.env.LLM_CONCURRENCY) || 4));
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function isAbort(err: unknown): boolean {
  return (err as Error)?.name === "AbortError";
}

async function measured<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const start = Date.now();
  try {
    const out = await fn();
    recordAiCall(label, Date.now() - start, null);
    return out;
  } catch (err) {
    recordAiCall(label, Date.now() - start, err);
    throw err;
  }
}

/**
 * Primary model with a fallback: any failure of the primary other than a caller abort (an error,
 * a 429 rate limit, a timeout) retries the same request once on the fallback provider. The AI
 * SDK's own maxRetries (exponential backoff) wraps this whole call. Latency and errors are
 * recorded per provider for /api/health.
 */
export function withFallback(primary: LanguageModelV4, primaryLabel: string, fallback: LanguageModelV4 | null, fallbackLabel: string): LanguageModelV4 {
  // gpt-oss models on Groq reason before answering; low effort keeps reasoning tokens from
  // consuming the output budget of short summaries.
  const tune = (options: Parameters<LanguageModelV4["doGenerate"]>[0]) =>
    primaryLabel.startsWith("groq/") && primary.modelId.includes("gpt-oss")
      ? { ...options, providerOptions: { ...options.providerOptions, groq: { reasoningEffort: "low", ...options.providerOptions?.groq } } }
      : options;
  return {
    specificationVersion: primary.specificationVersion,
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    doGenerate: (options) =>
      withSlot(async () => {
        try {
          return await measured(primaryLabel, () => primary.doGenerate(tune(options)));
        } catch (err) {
          if (!fallback || isAbort(err) || options.abortSignal?.aborted) throw err;
          return measured(fallbackLabel, () => fallback.doGenerate(options));
        }
      }),
    doStream: (options) =>
      withSlot(async () => {
        try {
          return await measured(primaryLabel, () => primary.doStream(tune(options)));
        } catch (err) {
          if (!fallback || isAbort(err) || options.abortSignal?.aborted) throw err;
          return measured(fallbackLabel, () => fallback.doStream(options));
        }
      }),
  };
}

export interface ModelHandle {
  model: LanguageModel;
  config: LlmConfig;
  fallback: LlmConfig | null;
}

export const labelOf = (c: LlmConfig) => `${c.provider}/${c.model}`;

export function configuredModel(): ModelHandle | null {
  const config = llmConfig();
  if (!config) return null;
  const fallback = llmFallbackConfig(config);
  return { model: withFallback(createModel(config), labelOf(config), fallback ? createModel(fallback) : null, fallback ? labelOf(fallback) : ""), config, fallback };
}
