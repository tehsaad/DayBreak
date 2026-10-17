-- DAYBREAK schema, part 1/4 — tables and indexes.
-- Applied to the production Supabase project with this exact version and name.
-- Ownership model: shared news (sources, articles, article_summaries, ingestion_runs) is written
-- only by the server's service role; everything about a reader is private behind RLS.

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
