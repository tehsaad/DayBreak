# Architecture decisions

Short ADRs. Each one has a context, the decision and its consequences. The last section lists the assumptions behind them.

## ADR-001 — Modular monolith on Vercel + Supabase; no microservices or broker

**Context.** One student maintainer, hundreds of readers, and work that is bursty but small. Vercel and Supabase were already in production.

**Decision.** Keep one Next.js app. Separate modules by interface (`Store`, `StageTracker`, `LanguageModel`, email transport), not by network hop.

**Consequences.** Deployment, auth and tracing stay simple. Fan-out is the scaling limit, and its upgrade path (Vercel Queues) is documented in target-state §7.

## ADR-002 — A native workflow runner, not n8n or LangGraph

**Context.** The pipeline is deterministic: fetch → rank → summarize → verify → render → deliver. Only one step calls an LLM, and it does not branch on model output.

**Decision.** A small runner (`lib/workflow/runner.ts`, ~250 lines) that provides:
- explicit run and stage states, persisted after every stage;
- idempotency keys;
- one running run per reader (a partial unique index);
- transient/permanent error classification with bounded, jittered retries;
- a retry budget (3 automatic attempts per day);
- cancellation at stage boundaries;
- resume from the saved edition.

**Why not n8n.** It would add a second always-on service, its own state and its own auth, and it would duplicate logic that already lives in typed code. The job does not need visual editing. n8n can still trigger `/api/cron/dispatch` with the Bearer secret if wanted, but the app never depends on it.

**Why not LangGraph.** There is no agent loop or model-driven branching to manage. A graph framework would add a dependency and checkpoint storage to model a straight line. Deterministic code is cheaper and easier to test.

**Consequences.** Every behaviour is unit-tested with a file store and fake clocks (`tests/workflow.test.ts`). There is no checkpointing inside a stage: a stage that crashes reruns from its start, which is acceptable because every stage is idempotent.

## ADR-003 — No embeddings or vector database (for now)

**Context.** Retrieval needs are:
1. near-duplicate clustering across publishers;
2. keyword and topic search over about 48 hours of headlines and excerpts;
3. grounding summaries in each article's own text.

**Decision.** Keep Postgres full-text search (a weighted `tsvector`) plus title-similarity clustering (`DUPLICATE_SIMILARITY = 0.62`). Grounding is per-article, since the summary source is that article's own headline and excerpt, so there is nothing to retrieve.

**Consequences.** There is no embedding cost or model-version drift, and PGlite tests keep working (they cannot load `pgvector`). Revisit when cross-day "story threads" or semantic search ("stories like this one") become product requirements. The path then is `pgvector` on Supabase, with embeddings keyed by `contentHash` and the model id, the same scheme the summary cache already uses.

## ADR-004 — Triggers: Vercel Cron (daily) + GitHub Actions (every 30 min)

**Context.** Vercel Hobby allows at most daily crons. Per-reader delivery times need sub-daily triggering.

**Decision.** `.github/workflows/ingest.yml` runs every 30 minutes. It calls `/api/cron/ingest`, then `/api/cron/dispatch`, both with `Authorization: Bearer $CRON_SECRET`. Vercel Cron keeps the daily ingest and prepare runs as a backstop.

**Consequences.** Delivery accuracy is "the selected time + up to ~30 minutes + GitHub scheduling jitter", and the UI says so. Because due-ness is "time reached and not done today", missed triggers delay delivery but never skip or duplicate it. On Vercel Pro, a `*/15` Vercel cron to `/api/cron/dispatch` can replace the GitHub trigger with no code changes.

## ADR-005 — At-most-once email by delivery key, and a safe default transport

**Decision.**
- Each edition and channel gets one `deliveries` row, keyed `edition:<id>:email`. It is checked before sending, and the same key goes to Resend as its `Idempotency-Key`, which covers a crash between "sent" and "recorded".
- Outside production the default transport is a local file outbox, so tests and local runs cannot email anyone.
- "Sent" means accepted by the provider, and the UI says exactly that.

**Consequences.** An edition can be emailed once. A regenerated edition is a new edition, so it can be emailed again.

## ADR-006 — "Listen" uses the browser's Web Speech API

**Context.** Server-side TTS would mean a paid provider, audio storage and caching, and possible licensing questions over reading publishers' text.

**Decision.** Client-side `speechSynthesis` reads the intro, headlines and summaries. It is hidden when the browser does not support it, and it states that it uses the device's voice.

**Consequences.** It costs nothing, needs no keys and creates no audio files. Voice quality and language coverage depend on the device. A provider adapter can come later behind the same button.

## ADR-007 — Deterministic grounding audit before publishing

**Decision.** `verifyStories` re-checks every AI summary against the text DAYBREAK has (headline + excerpt): no new numbers, no new names, and no stripping of hedges such as "reportedly". Failures revert to the publisher's excerpt and are counted on the run.

**Consequences.** This is a precision filter, not fact-checking, and the copy never calls it fact-checking. It can over-reject good paraphrases. That is acceptable, because the fallback is the publisher's own words.

## ADR-008 — Web search through GNews `/search`, opt-in per query

**Context.** Search was limited to stored news. Google News RSS returns `news.google.com` redirect URLs (not canonical publisher URLs) and is meant for personal use.

**Decision.** Use the documented GNews search API, the same key and provider already used for headlines. Results are normalised and stored like any article, so they can be saved. Each search is opt-in ("Also search the web"), cached for 30 minutes and capped per day.

**Consequences.** Results are real articles with publisher URLs. It is limited by the free quota and only enabled where `GNEWS_API_KEY` is set.

## Assumptions

- Hundreds of readers, not millions.
- Cost estimates use `LLM_PRICE_*` only when they are configured, and are never invented (see `docs/cost-report.md`).
- Reading speed is 230 wpm (`READING_WPM`), an assumption labelled as an estimate everywhere.
