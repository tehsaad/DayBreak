# Final engineering report: orchestration, scheduling and delivery

- **Branch:** `overhaul/orchestration-delivery` (9 commits on top of `main` @ `b3f956a`). It has **not been pushed, merged or deployed**.
- **Size:** 60+ files changed, ~3,700 lines added, including about 1,000 lines of tests and docs.

## 1. Original architecture and its main weaknesses

DAYBREAK was already a solid Next.js 16 + Supabase app. It had:
- RSS and GNews ingestion with backoff and an ingest lease;
- deterministic ranking;
- a grounded AI editor (Groq with Gemini fallback);
- immutable, idempotent editions;
- RLS on every reader table, tested in PGlite;
- 177 passing tests.

See `docs/architecture/current-state.md` for the full audit. The weaknesses the judges pointed at were real:

- **No workflow model.** Generation was one opaque function call, and no run record existed.
- **Manual and cron paths were separate,** with their own error handling.
- **No delivery and no per-reader schedule.**
- **Ad-hoc retries** with no transient/permanent distinction.
- **No user-visible status or run history, and no per-run token accounting.**

## 2. New architecture and why it is better

There is now one pipeline, with diagrams in `docs/architecture/target-state.md`:

**claim → fetch → rank → summarize → verify → render → deliver → record**

It serves all four triggers: manual, overnight prepare, scheduled delivery, and retry.

- **Persisted stage by stage.** Each stage records status, duration, attempts, metrics, notes and errors in `workflow_runs`, written after every stage.
- **Idempotent.** A unique `(user, idempotency_key)` with keys like `scheduled:<local date>`, plus a partial unique index allowing only one running run per reader.
- **Recoverable.**
  - Transient errors retry with jittered exponential backoff; permanent errors never retry.
  - Scheduled work has a retry budget of 3 attempts a day.
  - Abandoned runs are detected after 10 minutes and recovered.
  - A retry resumes from the saved edition, so delivery-only failures don't regenerate.
  - Cancellation is checked at stage boundaries.
- **At-most-once email.** A delivery row keyed by edition is checked before sending, and the same key goes to the provider as its idempotency key.
- **Correct across time zones and DST.**
  - Schedules are stored as local time plus an IANA zone.
  - "Due" means the time has been reached today and today's run has not yet succeeded.
  - So late or duplicate triggers never skip or duplicate a delivery.
- **No new infrastructure.** A native runner (ADR-002) is used instead of n8n or LangGraph. No vector database (ADR-003). Sub-daily triggering comes from the existing GitHub Actions schedule (ADR-004).

## 3. Implemented features, by phase

| Phase | Delivered |
|---|---|
| A — Audit and docs | `docs/architecture/{current-state,target-state,decisions}.md` (5 Mermaid diagrams, 8 ADRs), `docs/implementation/roadmap.md` |
| B — Data model | Migration 8: `workflow_runs` and `deliveries`, with RLS (owner-only), the one-running index and the idempotency unique key. Implemented in **both** stores (Supabase and file). |
| C — Orchestration | `lib/workflow/{types,errors,tracker,runner,schedule,dispatch}.ts`; `/api/cron/dispatch`; `/api/cron/prepare` and `POST /api/editions` now go through the runner; `/api/runs` (list, get, retry, cancel, "email now"); GitHub Actions `dispatch` job every 30 minutes after ingest |
| D — Accuracy and cost | `lib/edition/verify.ts`: a publish-time audit that reverts AI summaries adding numbers or names, or dropping hedges, that are not in the source. Per-run token usage is stored. Cost is estimated only when `LLM_PRICE_*` is set. `docs/cost-report.md` |
| E — Personalisation and search | Server-validated delivery preferences (time, frequency, weekday, format, PDF template); partial saves; opt-in **live web search** through the GNews search API, with results stored and saveable and clearly separated from collected news |
| F — Output | Edition email (headlines linked to originals; link, PDF or both); `EMAIL_TRANSPORT` with a local-file outbox by default outside production; a second PDF template ("Minimal briefing": one column, numbered table of contents, no images); a reading-time estimate (230 wpm, labelled as an estimate) |
| G — Audio | **Listen**, using the browser's Web Speech API: play, pause, resume, stop and progress. Hidden when unsupported. No server audio, no cost (ADR-006). |
| H — UX and ops | **Activity** page (KPIs, stage timeline per run, errors in plain words, Retry and Cancel, email log); a status strip on the newspaper (reading time, AI provenance, last run, next email); **Settings → Delivery & schedule**; "Activity" in the main navigation; `docs/operations.md` (SQL diagnostics, retry procedure, production scheduler verification) |

## 4. New and modified files (main ones)

**New**
- `src/lib/workflow/*`, `src/lib/delivery/deliver.ts`, `src/lib/edition/verify.ts`
- `src/lib/email/transport.ts`, `src/lib/news/web-search.ts`, `src/lib/reading-time.ts`
- `src/app/api/runs/**`, `src/app/api/cron/dispatch/route.ts`, `src/app/(app)/activity/page.tsx`
- `src/components/{delivery-settings,run-actions}.tsx`, `src/components/paper/{status-strip,listen-button}.tsx`
- `supabase/migrations/20261027090000_daybreak_8_workflow_runs_and_deliveries.sql`
- `tests/{workflow,schedule,web-search}.test.ts`, `scripts/check-web-search.ts`
- The docs listed above

**Modified**
- `edition/generate.ts`: stages are tracked, the verify stage was added, and usage is returned.
- `store/{types,file-store,supabase-store}.ts`
- `preferences.ts`, `types.ts`, `email/{resend,templates}.ts`, `pdf/edition-pdf.tsx`
- `news/{gnews,sources}.ts`, `cron/prepare.ts`
- API routes: editions, preferences, pdf and prepare
- `search/page.tsx`, `settings/page.tsx`, `newspaper/page.tsx`, `nav-links.tsx`, `paper-view.tsx`
- `.github/workflows/ingest.yml`, `.env.example`, `README.md`
- Tests: `setup.ts`, `rls.test.ts`, `api.test.ts`

## 5. Dependencies added

**None.** Everything uses packages already in `package.json`: AI SDK, zod, @react-pdf/renderer, supabase-js and lucide-react.

## 6. Checks actually run (real results)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ✅ pass (0 problems) |
| `vitest run` | ✅ **217 passed / 23 files.** Baseline was 177 / 20; 40 new tests. |
| `next build` | ✅ pass |
| RLS tests in PGlite (all migrations including #8) | ✅ Bob cannot read, create or update Alice's runs or deliveries; duplicate key rejected; second running run rejected |
| PDF generation | ✅ Both templates rendered, rasterised and **inspected visually**. Two briefing bugs were found and fixed: the title overlapped the subtitle, and a section heading was orphaned at the foot of a page. |
| Browser check (isolated demo mode, port 3200, no production keys) | ✅ Onboarded via the API; enabled delivery in the Settings UI with an overdue time, PDF format and briefing template. `/api/cron/dispatch` then delivered exactly once: the outbox got `.html`, `.json` and a briefing PDF. A second call returned `alreadyDone: 1`; an unauthenticated call returned 401. The Activity page showed the stage timeline (desktop and mobile). Regenerate and "Email now" created manual runs. |
| Playwright e2e | Desktop and mobile journeys: **11 passed**. Auth project: **5 failed — identical on unmodified `main`**, so these are pre-existing and environmental. That project's server came up in demo mode locally and was not investigated further. |

## 7. Remaining bugs, incomplete work and unverified items

**Blocked on the owner (not done, by design)**
- **Migration 8 is not applied to production.** Production data and deployment need explicit authorisation. The code degrades safely if it is missing: run tracking is skipped, a warning is logged and Activity shows a notice.
- **Not pushed, no PR, not deployed.**

**Unverified**
- **Live GNews search.** `GNEWS_API_KEY` is empty in `.env.local`. It is tested only against mocked responses. Run `npx tsx --env-file=.env.local scripts/check-web-search.ts "climate"` once a key is present.
- **A real Resend send.** Intentionally not done; no email was sent to anyone. The Resend payload with attachments follows the API docs and is covered by mocked tests.
- **Real LLM token numbers.** Local runs used `LLM_PROVIDER=none`, so usage capture is tested with mocked values only.
- **Supabase-store implementations** of the new methods. Typechecked, and the SQL is tested in PGlite, but not exercised against a live Supabase instance.

**Known limitations**
- The dispatcher is sequential and lists at most 100 readers per call (`CRON_EDITIONS_PER_RUN × 5`). That is fine at the current scale; the upgrade path is documented.
- Each stage costs an extra read and write to the run row (about 12 extra round trips per run).
- The Activity page shows only the reader's own runs. There is no cross-user admin UI; operators use the SQL in `docs/operations.md`.
- Embeddings and semantic retrieval were deliberately not built (ADR-003).
- Cancel is a conditional update (it never overwrites a finished run). A cancel that arrives *while* a stage is being saved can still be lost; the run then simply completes.
- If run tracking fails transiently while the tables exist, the delivery row's `run_id` foreign key rejects the insert and no email is sent. The next dispatch recovers it, and there is no duplicate.

## 8. Environment variables

**Existing:**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `GNEWS_API_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`

**New, all optional:**
- `EMAIL_TRANSPORT`, `APP_URL`, `DEMO_DELIVERY_EMAIL`
- `LLM_PRICE_INPUT_PER_MTOK`, `LLM_PRICE_OUTPUT_PER_MTOK`
- `READING_WPM`, `WEB_SEARCH_DAILY_LIMIT`

**GitHub:** the `CRON_SECRET` secret and the optional `PRODUCTION_URL` variable.

No values appear in this report or in any commit.

## 9. Scheduling configuration and verification

- GitHub Actions runs **"Scheduled ingestion and delivery"** at `7,37 * * * *`: ingest, then dispatch.
- Vercel Cron keeps the daily ingest (23:00 UTC) and prepare (23:30 UTC) runs.
- To verify production, use the Actions run logs (HTTP 200 and the report JSON), Vercel logs `cron_dispatch` (including `maxDelaySeconds`), and a reader's Activity page ("Due …, started N min later").
- Details are in `docs/operations.md`.

## 10. Security, factual accuracy and cost control

**Security**
- The new endpoints require auth plus same-origin for mutations; cron requires the Bearer secret and fails closed.
- Every run and delivery query is scoped by user id **and** protected by RLS.
- Email HTML escapes all text, and links pass `safeLinkUrl`.
- Web search goes through `safeFetch` (SSRF-checked), and the API key is redacted from errors (this is tested).
- Logs carry ids and counts only.
- Local and test runs cannot email anyone, because the transport defaults to file or log.

**Factual accuracy**
- The existing validators are unchanged.
- The new publish-time audit reverts unsupported numbers, names and dropped hedges to the publisher's excerpt.
- The UI and email say "checked against sources", never "fact-checked".
- Sample data is labelled in the app, the PDF and the email.

**Cost control**
- Scheduled deliveries reuse the overnight edition, so they make no extra LLM call.
- There is no workflow-level retry of the LLM step, plus a daily retry budget.
- Usage is stored per run.
- Prices are never guessed.

## 11. UI/UX changes

- New **Activity** page.
- Newspaper status strip.
- **Settings → Delivery & schedule**, with a template picker, honest transport notes and "Email today's paper now".
- **Listen** controls.
- Search: "Also search the web" plus a separate "From the wider web" section with freshness and cache labels.
- Activity added to the navigation.
- All of it uses the existing design tokens and is checked at 375 px and at desktop width.

## 12. Deployment steps

1. Review the branch, then push it and open a PR (CI runs typecheck, lint and tests).
2. Apply migration 8 in Supabase.
3. Optionally set `APP_URL` and the `LLM_PRICE_*` values in Vercel.
4. Merge to `main`. The existing CI-gated workflow deploys production.
5. Check that the GitHub schedule's next run shows a `dispatch` job with HTTP 200.
6. Enable delivery on a test account. Confirm the run in Activity and the email in Resend's dashboard.

## 13. The five most valuable next improvements

1. **Ship it:** apply migration 8, deploy, and watch one real scheduled delivery.
2. **Skip the per-reader editorial LLM call** when all stories have cached summaries. This is the largest cost lever.
3. **Add a Playwright journey for delivery:** enable, dispatch, check the outbox file and Activity.
4. **Add delivery setup to onboarding,** so a reader's first paper arrives without visiting Settings.
5. **Add Postgres article retention and a run-history retention job,** plus a small admin view of success rate and p95 duration, built from the SQL in `docs/operations.md`.
