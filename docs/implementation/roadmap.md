# Implementation roadmap

Phases from the brief, reordered to match how the repository is built. Status as of 27 Oct 2026 on branch `overhaul/orchestration-delivery`.

| Phase | Scope | Status |
|---|---|---|
| A | Audit, baseline (typecheck, lint, 177 tests green), architecture docs | **Done** (`docs/architecture/*`) |
| B | Data model for runs and deliveries (migration 8, RLS, both stores) | **Done**, not yet applied to production |
| C | Workflow runner: stages, retries, idempotency, cancellation, resume; dispatcher; DST-safe schedules; cron and GitHub triggers | **Done** |
| D | Grounding audit at publish time; token accounting; cost estimate hooks | **Done.** Embeddings deliberately not added (ADR-003) |
| E | Delivery preferences (server-validated, partial saves); opt-in web search (GNews) with save | **Done.** Live GNews search not verified locally (no key in `.env.local`) |
| F | Email delivery (link, PDF or both; at-most-once; dev outbox); briefing PDF template; reading-time estimate | **Done.** Real PDFs rendered and inspected |
| G | Listen (Web Speech API) | **Done** (client-side; ADR-006) |
| H | Activity page, newspaper status strip, Settings → Delivery, docs, tests | **Done.** Playwright suite not re-run; manual browser verification done in demo mode |

## Next (prioritised)

1. **Apply migration 8 in production**, deploy, and watch one scheduled delivery end to end. Needs the owner: production database and deploy.
2. **Article retention in Postgres:** prune `articles` older than 21 days that no edition references. Keeps the database inside the free tier.
3. **Skip the editorial LLM call when every story is cached** (see the cost report). This is the largest cost lever.
4. **Fan out the dispatcher with Vercel Queues** once a single dispatch can't cover the readers who are due in 30 minutes (target-state §7).
5. **E2E coverage of the new flows:** a Playwright journey that enables delivery, triggers dispatch with the local secret and asserts the outbox file and the Activity page.
6. **An onboarding step for delivery**, so the schedule can be set at sign-up and not only in Settings.
