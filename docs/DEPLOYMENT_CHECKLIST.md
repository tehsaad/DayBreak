# Deployment checklist

## Before deploying

- [ ] `npm ci && npm run lint && npm run typecheck && npm test && npm run build` all pass locally.
- [ ] Supabase project created; migration applied (`supabase db push`, or the SQL editor).
- [ ] Supabase Auth: Site URL set to the production URL; `https://<domain>/auth/callback` added to the redirect URLs.
- [ ] Vercel project linked to `tehsaad/DayBreak` (dashboard import, or `vercel link`).
- [ ] Environment variables set in Vercel for Production (and Preview if wanted):
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (do **not** prefix it with `NEXT_PUBLIC_`)
  - [ ] `CRON_SECRET` (a long random value, e.g. `openssl rand -hex 32`)
  - [ ] Optional: `ANTHROPIC_API_KEY` (or another provider), `LLM_PROVIDER`, `LLM_MODEL`
- [ ] No secrets in Git: `git grep -nE "sk-|eyJhbGci|service_role"` finds only documentation.

## Deploy

- [ ] `vercel deploy` (preview). Check that `GET /api/health` returns `"storage":"supabase"` and the expected `ai` provider.
- [ ] Sign in with a magic link, complete onboarding and generate a paper. Confirm the edition, feedback, bookmarks and PDF all work.
- [ ] In Supabase, confirm rows were created in `editions`, `edition_stories`, `feedback_events` and `saved_articles`.
- [ ] Sign in as a second user. Opening the first user's `/paper/<id>` must return "not found".
- [ ] `vercel deploy --prod`.

## After deploying

- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/ingest` and `/api/cron/prepare`.
- [ ] Trigger one manually and check that it returns 200: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/ingest`
- [ ] The same request without the header returns 401.
- [ ] Function logs show `cron_ingest` and `cron_prepare` events with no errors.
- [ ] Settings → Sources shows feeds as `ok`.

## Rollback

- Vercel → Deployments → previous deployment → **Promote to Production**. The database migration is additive, so older deployments keep working against it.
