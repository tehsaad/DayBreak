/**
 * Server-side configuration. Secrets are read from process.env at call time and never exported
 * to client components (only NEXT_PUBLIC_* values are safe for the browser).
 */

export type LlmProvider = "groq" | "anthropic" | "openai" | "google" | "gateway";

/**
 * Groq default verified against console.groq.com/docs/models (production models, Oct 2026).
 * gpt-oss-120b rather than -20b: in a 43-summary audit of real output (docs/SUMMARY_AUDIT.md)
 * the 20b model misattributed quotes and completed truncated excerpts.
 */
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  groq: "openai/gpt-oss-120b",
  anthropic: "claude-haiku-5-5",
  openai: "gpt-5-mini",
  google: "gemini-3.5-flash",
  gateway: "anthropic/claude-haiku-5.5",
};

/**
 * Accepted key names per provider, first match wins. Gemini keys come from Google AI Studio, so
 * GEMINI_API_KEY and GOOGLE_AI_STUDIO_API_KEY are aliases of the AI SDK's own variable name.
 */
export const KEY_VARS: Record<LlmProvider, string[]> = {
  groq: ["GROQ_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_STUDIO_API_KEY"],
  gateway: ["AI_GATEWAY_API_KEY"],
};

/** The API key for a provider, from whichever accepted variable is set (server-only). */
export function providerApiKey(provider: LlmProvider): string | undefined {
  for (const name of KEY_VARS[provider]) {
    const v = value(name);
    if (v) return v;
  }
  return undefined;
}

function value(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

/**
 * The configured LLM, or null when none is usable. With LLM_PROVIDER unset we pick the first
 * provider whose key is present. The AI Gateway can also authenticate with Vercel OIDC: locally
 * through VERCEL_OIDC_TOKEN (from `vercel env pull`), and on Vercel deployments through the
 * per-request x-vercel-oidc-token header — so LLM_PROVIDER=gateway on Vercel needs no API key.
 */
export function llmConfig(): LlmConfig | null {
  const requested = value("LLM_PROVIDER")?.toLowerCase();
  if (requested === "none" || requested === "off") return null;
  const candidates: LlmProvider[] = requested && requested in KEY_VARS ? [requested as LlmProvider] : PROVIDER_ORDER;
  for (const provider of candidates) {
    // OIDC never selects the gateway on its own: it must be requested with LLM_PROVIDER=gateway.
    const oidc = provider === "gateway" && requested === "gateway" && (Boolean(value("VERCEL_OIDC_TOKEN")) || Boolean(value("VERCEL")));
    const hasKey = Boolean(providerApiKey(provider)) || oidc;
    if (hasKey) {
      return {
        provider,
        model: value("LLM_MODEL") ?? modelFor(provider),
        timeoutMs: clampInt(value("LLM_TIMEOUT_MS"), 5_000, 55_000, 30_000),
        maxOutputTokens: clampInt(value("LLM_MAX_OUTPUT_TOKENS"), 512, 8_000, 4_000),
      };
    }
  }
  return null;
}

/** Fastest first: Groq for summaries, then the others. */
const PROVIDER_ORDER: LlmProvider[] = ["groq", "anthropic", "openai", "google", "gateway"];
const MODEL_VARS: Partial<Record<LlmProvider, string[]>> = { groq: ["GROQ_MODEL"], google: ["GEMINI_MODEL", "GOOGLE_MODEL"] };

function modelFor(provider: LlmProvider): string {
  for (const name of MODEL_VARS[provider] ?? []) {
    const v = value(name);
    if (v) return v;
  }
  return DEFAULT_MODELS[provider];
}

/**
 * The provider used when the primary fails (error, rate limit, timeout): LLM_FALLBACK_PROVIDER,
 * or else the next provider in PROVIDER_ORDER that has a key. "none" disables the fallback.
 */
export function llmFallbackConfig(primary: LlmConfig | null = llmConfig()): LlmConfig | null {
  if (!primary) return null;
  const requested = value("LLM_FALLBACK_PROVIDER")?.toLowerCase();
  if (requested === "none" || requested === "off") return null;
  const candidates = requested && requested in KEY_VARS ? [requested as LlmProvider] : PROVIDER_ORDER.filter((p) => p !== "gateway");
  const provider = candidates.find((p) => p !== primary.provider && Boolean(providerApiKey(p)));
  return provider ? { ...primary, provider, model: modelFor(provider) } : null;
}

/** Human-readable reason AI is off, for honest UI labelling. */
export function llmStatusNote(): string {
  const requested = value("LLM_PROVIDER")?.toLowerCase();
  if (requested === "none" || requested === "off") return "AI features are switched off (LLM_PROVIDER=none).";
  if (requested === "gateway") return "LLM_PROVIDER is \"gateway\" but there is no AI_GATEWAY_API_KEY, and Vercel OIDC is only available on Vercel deployments or after `vercel env pull`.";
  if (requested && requested in KEY_VARS && !providerApiKey(requested as LlmProvider)) {
    return `LLM_PROVIDER is "${requested}" but none of ${KEY_VARS[requested as LlmProvider].join(" / ")} is set.`;
  }
  return "No language-model API key is configured, so summaries come from publishers' own descriptions and analysis is assembled from article metadata.";
}

export interface SupabaseConfig {
  url: string;
  /** Anon or publishable key: public by design, restricted by RLS. */
  anonKey: string;
  /** Service-role / secret key: server-only. Null when not configured. */
  serviceRoleKey: string | null;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = value("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = value("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = value("SUPABASE_SERVICE_ROLE_KEY") ?? value("SUPABASE_SECRET_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceRoleKey: serviceRoleKey ?? null };
}

/**
 * Where the shared news pool lives. Reader data is always in Supabase in Supabase mode; shared
 * news needs the service-role key for Postgres and otherwise uses a per-instance cache.
 */
export function sharedNewsStorage(): "supabase" | "instance-cache" | "file" {
  const cfg = supabaseConfig();
  if (!cfg) return "file";
  return cfg.serviceRoleKey ? "supabase" : "instance-cache";
}

export type StorageMode = "supabase" | "demo";

export function storageMode(): StorageMode {
  return supabaseConfig() ? "supabase" : "demo";
}

/** "sample" forces the labelled offline sample set; "live" (default) fetches the configured feeds. */
export function newsMode(): "live" | "sample" {
  return value("NEWS_MODE")?.toLowerCase() === "sample" ? "sample" : "live";
}

/** GNews API key (https://gnews.io). When set, GNews top headlines join the RSS sources. */
export function gnewsApiKey(): string | undefined {
  return value("GNEWS_API_KEY");
}

export function cronSecret(): string | undefined {
  return value("CRON_SECRET");
}

export function dataDir(): string {
  return value("DATA_DIR") ?? (process.env.VERCEL ? "/tmp/daybreak" : ".data");
}

export function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Tunables with documented defaults (see README → Operations). */
export const LIMITS = {
  /** Re-fetch a feed at most this often. */
  feedFreshMinutes: clampInt(process.env.FEED_FRESH_MINUTES, 5, 720, 30),
  /** Re-fetch each GNews category at most this often (8 categories × 8/day ≈ 64 of the free 100 requests). */
  gnewsFreshMinutes: clampInt(process.env.GNEWS_FRESH_MINUTES, 60, 1440, 180),
  /** Before generating a paper, refresh news if the newest ingestion is older than this. */
  poolStaleMinutes: clampInt(process.env.POOL_STALE_MINUTES, 10, 1440, 90),
  /** Minimum seconds between regenerations for one reader. */
  regenerateCooldownSeconds: clampInt(process.env.REGENERATE_COOLDOWN_SECONDS, 0, 3600, 45),
  /** Article pool considered for an edition. */
  candidateHours: clampInt(process.env.CANDIDATE_HOURS, 12, 168, 48),
  /** Cron: maximum editions prepared per invocation. */
  cronEditionsPerRun: clampInt(process.env.CRON_EDITIONS_PER_RUN, 1, 100, 20),
};
