# Operations guide

## Before deploying this branch

1. **Apply migration 8.** `supabase/migrations/20261027090000_daybreak_8_workflow_runs_and_deliveries.sql` is additive: it creates two tables, their indexes and RLS. It has **not** been applied to production. Apply it in the Supabase SQL editor or with `supabase db push`, then confirm:
   ```sql
   select count(*) from public.workflow_runs;      -- 0, no error
   select indexname from pg_indexes where tablename = 'workflow_runs';  -- includes workflow_runs_one_running_idx
   ```
   If the code is deployed first, papers still work. Run tracking logs `workflow_tracking_unavailable` and is skipped, and Activity shows a notice.
2. **Environment variables (Vercel → Production).** None are new and required. Optional:
   - `APP_URL`: the public origin used in email links. It defaults to the request origin.
   - `EMAIL_TRANSPORT`: defaults to `resend` in production when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set, otherwise `disabled`.
   - `LLM_PRICE_INPUT_PER_MTOK` and `LLM_PRICE_OUTPUT_PER_MTOK`: USD per million tokens. They enable cost estimates.
   - `READING_WPM`, default 230.
   - `WEB_SEARCH_DAILY_LIMIT`, default 25.
3. **GitHub.** The repository secret `CRON_SECRET` must equal Vercel's. The repository variable `PRODUCTION_URL` is optional.

## How scheduled work actually runs in production

| What | Trigger | Endpoint |
|---|---|---|
| News refresh | GitHub Actions `*/30` (`ingest` job) and Vercel Cron 23:00 UTC | `/api/cron/ingest` |
| Scheduled email delivery | GitHub Actions `*/30` (`dispatch` job, after ingest) | `/api/cron/dispatch` |
| Overnight preparation (no email) | Vercel Cron 23:30 UTC | `/api/cron/prepare` |

**Verify it really runs:**
- GitHub → Actions → "Scheduled ingestion and delivery". Each run prints `HTTP 200` and the JSON report: `due`, `deliveryRuns`, `alreadyDone`, `failed`, `busy`, `stoppedForTime`.
- Vercel → Logs, filtered by `cron_dispatch`, shows the same report plus `maxDelaySeconds` (how late the most-delayed delivery started).
- For a reader, Activity shows a "Scheduled delivery" run with "Due …, started N min later".

**Manual trigger:**
```bash
curl -s -H "authorization: Bearer $CRON_SECRET" https://<host>/api/cron/dispatch
```
It is idempotent. Calling it twice in a row returns `alreadyDone` for everyone handled by the first call.

## Inspecting a failed workflow

1. **Reader view.** Go to `/activity`. The failing stage is red, the error says whether it is temporary, and **Details** lists each stage's metrics, notes and errors.
2. **SQL (service role):**
   ```sql
   -- Recent failures with the failing stage
   select id, user_id, trigger, status, attempt, error->>'stage' as stage, error->>'message' as message, updated_at
   from workflow_runs where status in ('failed','partial') order by updated_at desc limit 20;

   -- Stage timings for one run
   select s->>'name' as stage, s->>'status' as status, (s->>'durationMs')::int as ms, s->>'attempts' as attempts, s->>'error' as error, s->'metrics' as metrics
   from workflow_runs, jsonb_array_elements(stages) s where id = '<run id>';

   -- Success rate and p50/p95 duration, last 7 days
   select trigger, count(*) filter (where status='succeeded')::float / count(*) as success_rate,
          percentile_cont(0.5) within group (order by duration_ms) as p50_ms,
          percentile_cont(0.95) within group (order by duration_ms) as p95_ms
   from workflow_runs where created_at > now() - interval '7 days' group by trigger;

   -- Runs stuck in "running" (should be empty; they are auto-recovered after 10 min)
   select id, user_id, updated_at from workflow_runs where status='running' and updated_at < now() - interval '10 minutes';

   -- Deliveries that failed
   select key, user_id, attempts, error, updated_at from deliveries where status='failed' order by updated_at desc;

   -- Token usage by day
   select date(created_at), sum((usage->>'inputTokens')::int) as input_tokens, sum((usage->>'outputTokens')::int) as output_tokens
   from workflow_runs group by 1 order by 1 desc limit 14;
   ```
3. **Logs.** One JSON line per event: `workflow_started`, `stage_done`, `stage_retry`, `stage_failed`, `workflow_finished`, `dispatch_reader_failed`. They contain ids (user ids truncated to 8 characters) and counts, never article text, emails or keys.

## Retrying safely

- **Reader:** Activity → **Retry**. This resumes the same run. If the edition was already saved, only delivery is attempted, and an edition that was already emailed is never sent again.
- **Scheduled runs** retry themselves on the next dispatch, up to 3 attempts per day. After that the run stays failed until a manual retry.
- **Operator:** call `/api/cron/dispatch` again, which is idempotent. To force today's delivery for one reader after fixing the cause, retry their run from Activity while signed in as them, or delete the failed run row (`delete from workflow_runs where id = …`) so the next dispatch creates a fresh one. The delivery key still prevents a duplicate email.

## Failure → what to check

| Symptom | Likely cause | Check |
|---|---|---|
| `deliver` failed, "HTTP 403/422" | Sender domain not verified, or invalid address | Resend dashboard → Domains; `RESEND_FROM_EMAIL` |
| `deliver` skipped, "not configured" | `RESEND_*` missing, or `EMAIL_TRANSPORT=disabled` | Vercel env |
| `fetch` degraded, "sample set" | Feeds unreachable and the pool is empty | Settings → Sources, `/api/news/status` |
| `summarize` degraded | LLM error, rate limit or timeout | `/api/health` → AI call stats |
| `verify` reverted N | Model added names or numbers | Normal if rare; a rising rate means the prompt or model got worse |
| No scheduled runs at all | GitHub schedule disabled (repos inactive for 60 days pause it) or wrong `CRON_SECRET` | Actions tab; the job prints a notice when the secret is missing |
| Many `busy` | Overlapping dispatches | GitHub `concurrency: ingest` should prevent this; check for manual curls |

## Retention (suggested, not automated)

```sql
delete from workflow_runs where created_at < now() - interval '90 days';
```
Deliveries keep the run row via `on delete set null`.

## Local development without touching production

`.env.local` contains production keys. To run locally in isolation (demo storage, sample news, no AI, file outbox):
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= GEMINI_API_KEY= LLM_PROVIDER=none NEWS_MODE=sample EMAIL_TRANSPORT=file DEMO_DELIVERY_EMAIL=you@example.com CRON_SECRET=local DATA_DIR=.data-local npx next start -p 3200
```
Emails then land in `.data-local/outbox/` as `.html` and `.json` files, plus the PDF when one is attached.
