// Tests run without any external credentials: demo storage, no LLM, labelled sample news.
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "LLM_PROVIDER",
  "CRON_SECRET",
]) {
  delete process.env[key];
}
process.env.NEWS_MODE = "sample";
process.env.REGENERATE_COOLDOWN_SECONDS = "30";
