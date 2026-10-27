// Tests run without any external credentials: demo storage, no LLM, labelled sample news.
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_AI_STUDIO_API_KEY",
  "GNEWS_API_KEY",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "LLM_PROVIDER",
  "CRON_SECRET",
  "GROQ_API_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "LLM_PRICE_INPUT_PER_MTOK",
  "LLM_PRICE_OUTPUT_PER_MTOK",
  "DEMO_DELIVERY_EMAIL",
]) {
  delete process.env[key];
}
process.env.NEWS_MODE = "sample";
process.env.REGENERATE_COOLDOWN_SECONDS = "30";
// Never email anyone from tests: messages become one log line each.
process.env.EMAIL_TRANSPORT = "log";
