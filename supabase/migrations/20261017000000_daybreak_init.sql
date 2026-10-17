-- DAYBREAK — initial schema
-- Apply with `supabase db push` or paste into the Supabase SQL editor.
--
-- Ownership model:
--   * News data (sources, articles, article_summaries, ingestion_runs) is shared and is written
--     only by the server with the service-role key. Signed-in readers may read articles/sources.
--   * Everything about a reader (profile, preferences, editions, stories, feedback, bookmarks,
--     inferred interests) is private and protected by Row Level Security on user_id = auth.uid().

-- gen_random_uuid() is built into Postgres 13+, so no extension is required.

-- ---------------------------------------------------------------------------
-- Shared news data
-- ---------------------------------------------------------------------------

create table if not exists public.sources (
  id text primary key,
  publisher text not null,
  name text not null,
  feed_url text not null,
  homepage text,
  topics text[] not null default '{}',
  region text not null default 'GLOBAL',
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_error text,
  consecutive_failures integer not null default 0,
  last_item_count integer not null default 0,
  etag text,
  last_modified text,
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id text primary key,
  url text not null,
  title text not null check (char_length(title) <= 400),
  description text not null default '' check (char_length(description) <= 1200),
  publisher text not null,
  source_id text references public.sources(id) on delete set null,
  author text,
  image_url text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  topics text[] not null default '{}',
  regions text[] not null default '{}',
  categories text[] not null default '{}',
  sample boolean not null default false,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored
);

create index if not exists articles_recent_idx on public.articles (coalesce(published_at, collected_at) desc);
create index if not exists articles_topics_idx on public.articles using gin (topics);
create index if not exists articles_search_idx on public.articles using gin (search);

-- Article-level AI summaries are not personalised, so one cached summary serves every reader.
create table if not exists public.article_summaries (
  article_id text not null references public.articles(id) on delete cascade,
  model text not null,
  summary text not null check (char_length(summary) <= 1200),
  created_at timestamptz not null default now(),
  primary key (article_id, model)
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  trigger text not null check (trigger in ('cron', 'on_demand', 'script')),
  inserted integer not null default 0,
  results jsonb not null default '[]'
);

create index if not exists ingestion_runs_recent_idx on public.ingestion_runs (finished_at desc);

-- ---------------------------------------------------------------------------
-- Reader data
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists public.reader_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null,
  region text not null default 'GLOBAL',
  onboarded_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.editions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_date date not null,
  revision integer not null default 1 check (revision between 1 and 100),
  created_at timestamptz not null default now(),
  content_mode text not null check (content_mode in ('live', 'sample')),
  reader_name text not null default '',
  intro text not null,
  intro_source text not null check (intro_source in ('ai', 'template')),
  preferences_snapshot jsonb not null,
  ranking jsonb not null,
  ai jsonb not null,
  sections jsonb not null,
  three_things jsonb not null,
  -- One row per reader, day and revision: refreshes and concurrent requests cannot duplicate an edition.
  unique (user_id, edition_date, revision)
);

create index if not exists editions_user_recent_idx on public.editions (user_id, edition_date desc, revision desc);

create table if not exists public.edition_stories (
  edition_id uuid not null references public.editions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  article_id text not null,
  section text not null,
  tier text not null check (tier in ('lead', 'top', 'standard', 'brief')),
  article jsonb not null,           -- immutable snapshot of the article as published in this edition
  summary text not null,
  summary_source text not null check (summary_source in ('ai', 'source')),
  why_it_matters text,
  reasons jsonb not null default '[]',
  score real not null,
  score_breakdown jsonb not null default '{}',
  also_reported_by jsonb not null default '[]',
  bigger_picture jsonb,
  primary key (edition_id, position),
  unique (edition_id, article_id)
);

create index if not exists edition_stories_user_idx on public.edition_stories (user_id);

create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id text,
  edition_id uuid references public.editions(id) on delete set null,
  type text not null check (type in ('open', 'save', 'unsave', 'skip', 'not_interested', 'rating', 'follow_topic', 'unfollow_topic')),
  topics text[] not null default '{}',
  publisher text,
  title text check (char_length(title) <= 400),
  value smallint check (value between 1 and 5),
  created_at timestamptz not null default now()
);

-- Repeating the same action on the same article updates the existing event instead of stacking weight.
create unique index if not exists feedback_dedupe_idx on public.feedback_events (user_id, article_id, type) where article_id is not null;
create index if not exists feedback_user_recent_idx on public.feedback_events (user_id, created_at desc);

create table if not exists public.saved_articles (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id text not null,
  edition_id uuid references public.editions(id) on delete set null,
  article jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- Materialised view of what DAYBREAK has inferred from feedback (recomputed after each event).
create table if not exists public.topic_affinities (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  weight real not null check (weight between -1 and 1),
  events integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);

-- ---------------------------------------------------------------------------
-- Immutability: a published edition never changes. The only permitted update is filling in
-- a story's Bigger Picture analysis the first time it is requested.
-- ---------------------------------------------------------------------------

create or replace function public.forbid_edition_update() returns trigger
language plpgsql as $$
begin
  raise exception 'editions are immutable once published';
end $$;

drop trigger if exists editions_immutable on public.editions;
create trigger editions_immutable before update on public.editions
  for each row execute function public.forbid_edition_update();

create or replace function public.guard_story_update() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'bigger_picture') is distinct from (to_jsonb(old) - 'bigger_picture') then
    raise exception 'edition stories are immutable; only bigger_picture may be filled in';
  end if;
  return new;
end $$;

drop trigger if exists edition_stories_guard on public.edition_stories;
create trigger edition_stories_guard before update on public.edition_stories
  for each row execute function public.guard_story_update();

-- Atomic, idempotent edition creation. Runs as the caller, so RLS still applies.
create or replace function public.create_edition(edition jsonb, stories jsonb)
returns table (edition_id uuid, created boolean)
language plpgsql security invoker set search_path = public as $$
declare
  new_id uuid;
begin
  insert into public.editions (
    id, user_id, edition_date, revision, created_at, content_mode, reader_name, intro, intro_source,
    preferences_snapshot, ranking, ai, sections, three_things
  ) values (
    (edition->>'id')::uuid, (edition->>'user_id')::uuid, (edition->>'edition_date')::date,
    (edition->>'revision')::int, coalesce((edition->>'created_at')::timestamptz, now()),
    edition->>'content_mode', coalesce(edition->>'reader_name', ''), edition->>'intro', edition->>'intro_source',
    edition->'preferences_snapshot', edition->'ranking', edition->'ai', edition->'sections', edition->'three_things'
  )
  on conflict (user_id, edition_date, revision) do nothing
  returning id into new_id;

  if new_id is null then
    select e.id into new_id from public.editions e
      where e.user_id = (edition->>'user_id')::uuid
        and e.edition_date = (edition->>'edition_date')::date
        and e.revision = (edition->>'revision')::int;
    return query select new_id, false;
    return;
  end if;

  insert into public.edition_stories (
    edition_id, user_id, position, article_id, section, tier, article, summary, summary_source,
    why_it_matters, reasons, score, score_breakdown, also_reported_by, bigger_picture
  )
  select new_id, (edition->>'user_id')::uuid, (s->>'position')::int, s->>'article_id', s->>'section', s->>'tier',
         s->'article', s->>'summary', s->>'summary_source', s->>'why_it_matters', coalesce(s->'reasons', '[]'),
         (s->>'score')::real, coalesce(s->'score_breakdown', '{}'), coalesce(s->'also_reported_by', '[]'),
         case when s ? 'bigger_picture' and jsonb_typeof(s->'bigger_picture') = 'object' then s->'bigger_picture' else null end
  from jsonb_array_elements(stories) as s;

  return query select new_id, true;
end $$;

-- New auth users get a profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

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
drop policy if exists "articles readable" on public.articles;
create policy "articles readable" on public.articles for select to authenticated using (true);
drop policy if exists "sources readable" on public.sources;
create policy "sources readable" on public.sources for select to authenticated using (true);
drop policy if exists "summaries readable" on public.article_summaries;
create policy "summaries readable" on public.article_summaries for select to authenticated using (true);
-- ingestion_runs: no policies → only the service role can read or write.

-- Private reader data: owner only.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own preferences" on public.reader_preferences;
create policy "own preferences" on public.reader_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "read own editions" on public.editions;
create policy "read own editions" on public.editions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "create own editions" on public.editions;
create policy "create own editions" on public.editions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "delete own editions" on public.editions;
create policy "delete own editions" on public.editions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "read own stories" on public.edition_stories;
create policy "read own stories" on public.edition_stories for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "create own stories" on public.edition_stories;
create policy "create own stories" on public.edition_stories for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.editions e where e.id = edition_id and e.user_id = (select auth.uid()))
  );
drop policy if exists "annotate own stories" on public.edition_stories;
create policy "annotate own stories" on public.edition_stories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own feedback" on public.feedback_events;
create policy "own feedback" on public.feedback_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own bookmarks" on public.saved_articles;
create policy "own bookmarks" on public.saved_articles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own affinities" on public.topic_affinities;
create policy "own affinities" on public.topic_affinities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant execute on function public.create_edition(jsonb, jsonb) to authenticated, service_role;
