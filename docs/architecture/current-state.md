# Current state (audit, 27 October 2026, before the orchestration work)

This is what the repository did at commit `b3f956a`, before branch `overhaul/orchestration-delivery`. It was written from the code, not the README.

## Stack

| Concern | What exists |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Deployed to Vercel in region `hnd1`, next to the Supabase database. |
| Data | Supabase Postgres with RLS, 7 migrations. A `FileStore` (JSON file) handles demo mode. Both sit behind one `Store` interface (`src/lib/store/types.ts`). |
| Auth | Supabase Auth: Google, password and magic link. Demo mode uses an anonymous httpOnly cookie. |
| News | 38 RSS/Atom feeds plus 8 GNews top-headline categories (key-gated). Implemented in `src/lib/news/sources.ts`. |
| AI | Vercel AI SDK 7 behind `createModel()`. Groq `openai/gpt-oss-120b` is the primary, with automatic fallback to Gemini. Anthropic, OpenAI and AI Gateway are supported. |
| Ranking | Deterministic scoring (`rank/score.ts`) and edition planning (`rank/plan.ts`). Feedback learning uses a 14-day half-life (`rank/learning.ts`). |
| PDF | `@react-pdf/renderer`, one "editorial" template, rendered from the saved edition. |
| Email | Resend. Used only for a one-time welcome email. |
| Scheduling | Vercel Cron, once a day each, for `/api/cron/ingest` and `/api/cron/prepare`. GitHub Actions calls ingest every 30 minutes. |
| Tests | 177 Vitest tests in 20 files, including RLS tests that apply every migration to PGlite. Playwright e2e covers demo, mobile and auth projects. |
| Baseline | `typecheck`, `lint` and `vitest` all passed. No failures existed before the changes. |

## Feature map (user-facing → code)

| Feature | UI | API | Logic | Data |
|---|---|---|---|---|
| Onboarding/personalisation | `(app)/onboarding`, `preferences-editor.tsx` | `PUT /api/preferences` | `preferences.ts` (zod) | `reader_preferences.prefs` jsonb |
| Today's paper | `(app)/newspaper`, `paper-view.tsx` | `POST /api/editions` | `edition/generate.ts` | `editions`, `edition_stories` (immutable) |
| Regenerate | `RegenerateButton` | `POST /api/editions {mode:"regenerate"}` | cooldown + revision | new revision row |
| Explore / Story | `(app)/explore`, `(app)/story/[id]` | — | `coverage/group.ts`, `ai/coverage.ts` | `articles` |
| Search | `(app)/search` | — | `store.listArticles` (Postgres tsvector) | `articles` |
| Saved | `(app)/saved` | `/api/bookmarks` | `feedback.ts` | `saved_articles` |
| Feedback learning | story actions | `/api/feedback`, `/api/interests` | `rank/learning.ts` | `feedback_events`, `topic_affinities` |
| Bigger Picture | `bigger-picture.tsx` | `POST /api/editions/[id]/bigger-picture` | `edition/bigger-picture.ts` | `edition_stories.bigger_picture` |
| PDF | download button | `GET /api/editions/[id]/pdf` | `pdf/edition-pdf.tsx` | — |
| Source health | Settings → Sources | `/api/news/status` | `news/ingest.ts` | `sources`, `ingestion_runs` |

## What already worked well

- **Idempotent editions.** `(user_id, edition_date, revision)` is unique, `create_edition()` is atomic, and editions are immutable (enforced by a trigger).
- **Ingestion.** It has per-feed timeouts, conditional GET, exponential backoff for failing feeds, a time budget and a single-holder lease (`ingest_lock`). One failing feed never fails a run.
- **Grounding.** The LLM output validator rejects numbers that are not in the source and copied wording. Precomputed summaries also reject invented names and dropped hedges. Summaries are cached by content hash.
- **Copyright.** Only headlines and a single excerpt sentence are shown. The app never fetches full article text.
- **Security.** Cron fails closed without `CRON_SECRET`. All fetches are SSRF-checked (`safeFetch`). Mutations are CSRF-checked (same-origin). There is RLS on every reader table, and logs carry no user content.

## Weaknesses (what the judges' "system design & orchestration" points at)

1. **No workflow model.** Generation was one function call. Nothing recorded which step ran, how long it took, whether it retried or where it failed. "Did my paper get made and why not?" could only be answered from Vercel logs.
2. **Manual and scheduled paths diverged.** The `prepare` cron and the API route each called `generateEdition` with their own error handling. Neither left a durable record.
3. **No delivery.** There was no scheduled email of the paper and no per-reader schedule or time zone. Readers had to open the app.
4. **Retries were ad hoc.** Feeds retried once, the LLM retried through the SDK, and nothing else retried. There was no shared transient/permanent classification and no retry budget for scheduled work.
5. **No user-visible operational status.** The UI could not show the last run, its duration, failures or the next delivery.
6. **No token or cost accounting per run.** Usage was logged but not stored.
7. **Verification gap.** The edition-time validator did not run the invented-name and dropped-hedge checks that precomputed summaries pass, and nothing audited the final edition.
8. **Search was limited to the stored pool.** Nothing could reach beyond collected news.
9. **One PDF layout.** There was no reading-time estimate and no audio.

## Not present, and deliberately not added

- **Vector database or embeddings.** Near-duplicates are already handled by title-similarity clustering, and search uses Postgres full-text. At roughly 2–6k articles over a 48-hour window there is no retrieval problem that embeddings would solve better than tsvector plus clustering. PGlite tests also cannot load `pgvector`. See ADR-003.
- **Server-side TTS.** See ADR-006.
