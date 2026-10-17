import type { AiHandle } from "../edition/generate";
import { configuredModel } from "./provider";

/** The configured model as an AiHandle, or null when no provider is configured. */
export function aiHandle(): AiHandle | null {
  const handle = configuredModel();
  if (!handle) return null;
  return {
    model: handle.model,
    provider: handle.config.provider,
    modelId: handle.config.model,
    timeoutMs: handle.config.timeoutMs,
    maxOutputTokens: handle.config.maxOutputTokens,
  };
}
