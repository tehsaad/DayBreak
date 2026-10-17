# API keys and where they go

**Production URL (free Vercel domain):** https://daybreak-gilt.vercel.app. This address is public; pull-request previews and per-deployment URLs stay behind Vercel login (Standard Protection).

Every key is optional for local development. A **production deploy** needs Supabase, an AI provider and `CRON_SECRET`; the deploy workflow checks for them by name and refuses to deploy otherwise. Paste keys only into the places below, never into code, issues or chat.

| What | Variable name(s) | Get it from | Put it in |
|---|---|---|---|
| **Supabase** project URL | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Vercel env (Production) · `.env.local` |
| **Supabase** anon key (public) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Supabase → Project Settings → API | Vercel env (Production) · `.env.local` |
| **Supabase** service-role key (**secret**) | `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | Supabase → Project Settings → API | Vercel env (Production, **Sensitive**) · `.env.local` |
| **Gemini / Google AI Studio** | `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_AI_STUDIO_API_KEY`) | https://aistudio.google.com/apikey | Vercel env (Production, Sensitive) · `.env.local` |
| **GNews** (extra news) | `GNEWS_API_KEY` | https://gnews.io (dashboard) | Vercel env (Production, Sensitive) · `.env.local` |
| **Cron** secret | `CRON_SECRET` | `openssl rand -hex 32` | **Already set** in Vercel Production |
| **Vercel hosting**: deploy token | `VERCEL_TOKEN` | Vercel → Account Settings → Tokens (scope: team *teh-saad*) | GitHub → repo → Settings → Secrets and variables → Actions → **Secrets** |
| **Vercel hosting**: team ID | `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` (after `vercel link`) | GitHub Actions **Secrets** |
| **Vercel hosting**: project ID | `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` | GitHub Actions **Secrets** |

Gemini and Google AI Studio are the **same key**: Google AI Studio is where Gemini API keys are issued. Set it once under any of the three names.

## Adding a key to Vercel

Dashboard: **vercel.com → teh-saad → daybreak → Settings → Environment Variables → Add**. Enter the name exactly, choose **Production** (and **Development** if you use `vercel env pull`), and tick **Sensitive** for secrets.

CLI (the value is typed at a prompt, so it is not saved in shell history):

```bash
npx vercel@62.2.0 env add GEMINI_API_KEY production --sensitive --scope teh-saad
npx vercel@62.2.0 env add GNEWS_API_KEY production --sensitive --scope teh-saad
npx vercel@62.2.0 env add SUPABASE_SERVICE_ROLE_KEY production --sensitive --scope teh-saad
npx vercel@62.2.0 env add NEXT_PUBLIC_SUPABASE_URL production --scope teh-saad
npx vercel@62.2.0 env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production --scope teh-saad
```

Check what's set (names only, never values):

```bash
npx vercel@62.2.0 env ls production --scope teh-saad | node scripts/ci/check-vercel-env.mjs
```

## Adding the Vercel hosting secrets to GitHub

```bash
gh secret set VERCEL_TOKEN      -R tehsaad/DayBreak   # paste at the prompt
gh secret set VERCEL_ORG_ID     -R tehsaad/DayBreak
gh secret set VERCEL_PROJECT_ID -R tehsaad/DayBreak
```

Once all three exist, the next successful CI run on `main` triggers **Deploy production**, which verifies the Vercel variables, deploys a candidate, smoke-tests `/api/health`, and only then promotes it.

## Local use

`.env.local` is git-ignored and already has empty slots for these keys. Fill them in and restart `npm run dev`. To check the AI key with one tiny request, run `npm run check:ai`.

## After adding Supabase keys

1. Apply the database schema: the four files in `supabase/migrations/` (already applied to project `umjwrmnicqflmkoifejj`), pasted into Supabase → SQL Editor (or `supabase db push`).
2. In Supabase → Authentication → URL Configuration:
   - **Site URL:** `https://daybreak-gilt.vercel.app`
   - **Redirect URLs:** `https://daybreak-gilt.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`

## Groq (preferred LLM) and Gemini (fallback)

| Variable | Where | Notes |
|---|---|---|
| `GROQ_API_KEY` | Vercel (Production), server-only | From console.groq.com → API Keys. When set, Groq is the primary provider. |
| `GROQ_MODEL` | optional | Default `openai/gpt-oss-120b` (Groq production model, ~500 tokens/s, $0.15/$0.60 per M tokens), chosen after a summary audit (docs/SUMMARY_AUDIT.md). `openai/gpt-oss-20b` is faster and cheaper but made more attribution errors. Called with low reasoning effort. |
| `GEMINI_API_KEY` | Vercel, server-only | Automatic fallback when Groq errors, rate-limits or times out. |
| `LLM_FALLBACK_PROVIDER` | optional | Force a fallback provider, or `none` to disable it. |
| `LLM_CONCURRENCY` | optional | Max simultaneous LLM calls per instance (default 4). |
| `AI_SUMMARIES_PER_RUN` | optional | Articles pre-summarised after each ingestion (default 40), the main cost control. |

Summaries are generated in the background after ingestion. They're stored with a content hash
(`article_summaries.content_hash`) and reused until the article text or prompt version changes,
then labelled with the model that actually answered. `/api/health` shows per-provider call
counts, error kinds and p50/p95 latency for the current instance, but never messages or keys.

## Scheduled ingestion

Vercel Hobby crons run once a day. `.github/workflows/ingest.yml` calls `/api/cron/ingest` every
30 minutes once the GitHub repository secret `CRON_SECRET` is set to the same value as in Vercel.
Page visits also trigger a background refresh when the pool is older than `FEED_FRESH_MINUTES`.
