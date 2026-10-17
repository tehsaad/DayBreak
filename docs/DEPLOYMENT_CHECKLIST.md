# Deployment checklist

Production deploys go through GitHub Actions (`.github/workflows/deploy-production.yml`). They run only after CI passes on `main`, and only once the steps below are complete. The full explanation is in the README under [CI/CD and deploying to Vercel](../README.md#cicd-and-deploying-to-vercel).

Where each key goes: [`docs/API_KEYS.md`](API_KEYS.md).

## 1. Services

- [ ] Supabase project created; migration `supabase/migrations/20261017000000_daybreak_init.sql` applied (`supabase db push`, or the SQL editor).
- [ ] Supabase Auth: Site URL set to the production URL. Redirect URLs include `https://<domain>/auth/callback` (plus `https://*-<team>.vercel.app/auth/callback` if previews use this project).
- [ ] An LLM API key obtained (Anthropic by default, or OpenAI, Google or Vercel AI Gateway).

## 2. Vercel project

- [x] Vercel project `daybreak` (team `teh-saad`) created and connected to `tehsaad/DayBreak`, with Node 22.x and production branch `main`.
- [ ] Production environment variables set. Names must match exactly:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`): **server-only**, marked Sensitive, **never** `NEXT_PUBLIC_…`
  - [x] `CRON_SECRET` (already set in Vercel Production)
  - [ ] An AI key: `GEMINI_API_KEY` (Gemini / Google AI Studio; also accepted as `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_AI_STUDIO_API_KEY`), or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, with `LLM_PROVIDER` / `LLM_MODEL` as needed
  - [ ] Optional: `GNEWS_API_KEY` (extra GNews headlines)
  - [ ] `NEWS_MODE` unset, or `live`
- [ ] Check locally (prints names only): `npx vercel@62.2.0 env ls production | node scripts/ci/check-vercel-env.mjs`
- [ ] Note the Project ID and Team ID, and create an access token.

## 3. GitHub repository settings

- [ ] Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (optionally `VERCEL_AUTOMATION_BYPASS_SECRET`).
- [ ] Actions variable (optional): `PRODUCTION_URL`.
- [ ] Environment `production`, limited to the `main` branch (optionally with required reviewers).
- [ ] Ruleset for `main`:
  - [ ] require a pull request before merging
  - [ ] require the status checks **Typecheck, lint & unit tests** and **Build & end-to-end**, with branches up to date
  - [ ] block force pushes and deletions
- [ ] No secrets in Git: `git grep -nE "sk-ant-|eyJhbGci|service_role\s*[:=]\s*\S{20,}"` finds nothing.

## 4. First release

- [ ] Push `main` (or merge a PR). The **CI** workflow passes.
- [ ] **Deploy production** runs automatically. In order, it verifies CI, the environment variable names, the build, the candidate deploy, the health smoke test and the promotion.
- [ ] Sign in with a magic link, complete onboarding and generate a paper. Check that the edition, feedback, bookmarks and PDF work.
- [ ] In Supabase, rows exist in `editions`, `edition_stories`, `feedback_events` and `saved_articles`.
- [ ] A second account opening the first user's `/paper/<id>` gets "not found".
- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/ingest` and `/api/cron/prepare`.
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/ingest` returns 200; the same request without the header returns 401.

## Rollback

- Vercel → Deployments → previous production deployment → **Promote to Production**, or `npx vercel@62.2.0 rollback`. The migration is additive, so older deployments keep working against it.
- A failed deploy-workflow run never moves the domain: it stops before `vercel promote`.
