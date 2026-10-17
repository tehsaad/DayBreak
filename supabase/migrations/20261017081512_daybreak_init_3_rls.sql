-- DAYBREAK schema, part 3/4 — Row Level Security.
-- Applied to the production Supabase project with this exact version and name.
-- Ownership model: shared news (sources, articles, article_summaries, ingestion_runs) is written
-- only by the server's service role; everything about a reader is private behind RLS.

alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.article_summaries enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.profiles enable row level security;
alter table public.reader_preferences enable row level security;
alter table public.editions enable row level security;
alter table public.edition_stories enable row level security;
alter table public.feedback_events enable row level security;
alter table public.saved_articles enable row level security;
alter table public.topic_affinities enable row level security;

-- Shared news: readable by signed-in readers; writes only via service role (which bypasses RLS).
create policy "articles readable" on public.articles for select to authenticated using (true);
create policy "sources readable" on public.sources for select to authenticated using (true);
create policy "summaries readable" on public.article_summaries for select to authenticated using (true);
-- ingestion_runs: no policies → only the service role can read or write.

-- Private reader data: owner only.
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own preferences" on public.reader_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own editions" on public.editions for select to authenticated using (user_id = (select auth.uid()));
create policy "create own editions" on public.editions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "delete own editions" on public.editions for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own stories" on public.edition_stories for select to authenticated using (user_id = (select auth.uid()));
create policy "create own stories" on public.edition_stories for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.editions e where e.id = edition_id and e.user_id = (select auth.uid()))
  );
create policy "annotate own stories" on public.edition_stories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own feedback" on public.feedback_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own bookmarks" on public.saved_articles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own affinities" on public.topic_affinities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
