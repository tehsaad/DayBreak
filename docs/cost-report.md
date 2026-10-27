# Cost report

**Status: the structure is measured, the prices are not.** Every run now stores the provider-reported `inputTokens`/`outputTokens` and the answering model (`workflow_runs.usage`, and per stage under `summarize.metrics`). No dollar figure in this repository is real unless `LLM_PRICE_INPUT_PER_MTOK` and `LLM_PRICE_OUTPUT_PER_MTOK` are configured. When they are not, the UI says "cost not measured". This report gives no invented savings percentages.

During this work, no production token data could be read: the migration is not applied yet, and local runs used `LLM_PROVIDER=none`. The production query to run after a week of data is at the end of this report.

## Where LLM calls happen

| Call | When | Count | Inputs | Bounded by |
|---|---|---|---|---|
| Article summaries (`precomputeSummaries`) | After each ingestion refresh | Batches of 8 articles | Headline + ≤300-char excerpt per article | `AI_SUMMARIES_PER_RUN` (default 40) per run; content-hash cache means each article is summarised once per prompt version; `LLM_CONCURRENCY` |
| Edition editorial (`runEditorial`) | Once per new edition | 1 call | ~10–25 stories (cached summaries passed in for reuse) + up to 3 Bigger Picture requests | `LLM_MAX_OUTPUT_TOKENS` (default 4000); `LLM_TIMEOUT_MS`; regenerate cooldown + rate limit (6 per 10 min) |
| Bigger Picture on demand | Reader opens analysis for a story beyond the top 3 | 1 call, then stored on the story | 1 story + related coverage | Rate limit 20 per 10 min; result stored, never regenerated |
| Story Explorer coverage | Reader opens a story's coverage | 1 call per story, cached | Clustered headlines | Cache + rate limit |

**What does not use an LLM:** filtering, de-duplication, ranking, section planning, dates and time zones, reading time, the grounding audit, PDF, email and scheduling. These are all deterministic.

## Which stage consumes the most

By construction, the **edition editorial call** dominates per reader: one call per reader per day, with the largest prompt (all selected stories). Article summaries are shared across all readers, so their cost is per article, not per reader, and does not grow with readership.

So the cost is roughly:

```
daily_cost ≈ readers × (editorial_in × p_in + editorial_out × p_out)
           + new_articles_summarised × (≈ per-article tokens) × prices
```

Fill it in from measured data:

```sql
select count(*) as runs,
       avg((usage->>'inputTokens')::int)  as avg_in,
       avg((usage->>'outputTokens')::int) as avg_out
from workflow_runs
where usage->>'inputTokens' is not null and created_at > now() - interval '7 days';
```

## Controls in place

- **Caching.** Summaries are keyed by `contentHash` (prompt version + title + excerpt) and the model. Unchanged articles are never re-summarised.
- **One editorial call per edition.** Regeneration has a cooldown and a rate limit. Scheduled runs use `mode: "ensure"`, which reuses today's edition, so a scheduled delivery after an overnight prepare makes **no** new LLM call.
- **Bounded inputs.** Excerpts are capped at 300 characters, the story count is bounded by reading time and depth, and the output is capped.
- **Cheap-first model order.** Groq `gpt-oss-120b` with low reasoning effort is the primary; another provider is the fallback only on failure.
- **Retry budget.** The LLM step is not retried by the workflow (only by the SDK, once, plus the fallback). Scheduled runs stop after 3 attempts a day.
- **Deterministic fallback.** When AI is unavailable, the paper is still produced from publisher excerpts at zero LLM cost.
- **Concurrency.** `LLM_CONCURRENCY` (default 4) per instance.

## Opportunities (not yet done)

1. Skip the editorial call when every selected story already has a cached summary and no Bigger Picture is requested. Use a template intro instead. This could remove most per-reader cost; it needs product sign-off on intro quality.
2. Share one editorial call across readers whose selected story sets are identical (rare with personalisation).
3. Move Bigger Picture generation off the critical path, so it is lazy for all stories instead of eager for the top 3.
4. Add a monthly spend cap: sum `usage` per day and switch `LLM_PROVIDER=none` behaviour automatically above a threshold.
