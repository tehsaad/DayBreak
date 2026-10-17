import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createGateway, type LanguageModel } from "ai";
import { llmConfig, providerApiKey, type LlmConfig } from "../env";

/**
 * The one place that knows about LLM vendors. Everything else receives a LanguageModel,
 * so switching provider is an environment change (LLM_PROVIDER / LLM_MODEL), not a code change.
 * Keys are read server-side only.
 */
export function createModel(config: LlmConfig): LanguageModel {
  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: providerApiKey("anthropic") })(config.model);
    case "openai":
      return createOpenAI({ apiKey: providerApiKey("openai") })(config.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: providerApiKey("google") })(config.model);
    case "gateway":
      // With no AI_GATEWAY_API_KEY the gateway falls back to Vercel OIDC on deployments.
      return createGateway(providerApiKey("gateway") ? { apiKey: providerApiKey("gateway") } : {})(config.model);
  }
}

export interface ModelHandle {
  model: LanguageModel;
  config: LlmConfig;
}

export function configuredModel(): ModelHandle | null {
  const config = llmConfig();
  if (!config) return null;
  return { model: createModel(config), config };
}
