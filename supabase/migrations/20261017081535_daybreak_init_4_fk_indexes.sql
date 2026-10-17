-- DAYBREAK schema, part 4/4 — indexes for foreign keys (Supabase performance advisor).
-- Applied to the production Supabase project with this exact version and name.
-- Ownership model: shared news (sources, articles, article_summaries, ingestion_runs) is written
-- only by the server's service role; everything about a reader is private behind RLS.

create index if not exists articles_source_id_idx on public.articles (source_id);
create index if not exists feedback_events_edition_id_idx on public.feedback_events (edition_id);
create index if not exists saved_articles_edition_id_idx on public.saved_articles (edition_id);
