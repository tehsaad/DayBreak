-- DAYBREAK schema, part 8 — workflow runs and deliveries. Additive only.
-- NOT yet applied to production: apply before deploying the code that uses it (docs/operations.md).
-- Until it is applied the app keeps working: run tracking logs a warning and is skipped.
--
-- workflow_runs: one row per attempt to produce (and optionally deliver) an edition, with every
-- stage's status, timing and metrics in `stages`. Editions stay immutable; run and delivery state
-- lives here instead.

create table if not exists public.workflow_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'prepare', 'scheduled', 'retry')),
  idempotency_key text not null check (char_length(idempotency_key) <= 120),
  status text not null check (status in ('pending', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  edition_date date not null,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  attempt integer not null default 1 check (attempt between 1 and 20),
  stages jsonb not null default '[]',
  edition_id uuid references public.editions(id) on delete set null,
  edition_created boolean,
  deliver boolean not null default false,
  usage jsonb not null default '{}',
  error jsonb,
  cancel_requested boolean not null default false,
  updated_at timestamptz not null default now(),
  -- A retried or duplicated scheduled trigger finds this row instead of creating a second run.
  unique (user_id, idempotency_key)
);

-- At most one running workflow per reader (no overlapping generations or deliveries).
create unique index if not exists workflow_runs_one_running_idx on public.workflow_runs (user_id) where status = 'running';
create index if not exists workflow_runs_user_recent_idx on public.workflow_runs (user_id, created_at desc);
create index if not exists workflow_runs_status_idx on public.workflow_runs (status, updated_at desc);
create index if not exists workflow_runs_edition_id_idx on public.workflow_runs (edition_id);

-- deliveries: one row per edition and channel. The key doubles as the email provider's
-- idempotency key, so retries can never send the same edition twice.
create table if not exists public.deliveries (
  key text primary key check (char_length(key) <= 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  run_id uuid references public.workflow_runs(id) on delete set null,
  channel text not null check (channel in ('email')),
  format text not null check (format in ('link', 'pdf', 'both')),
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_id text,
  transport text not null,
  error text check (char_length(error) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deliveries_user_recent_idx on public.deliveries (user_id, created_at desc);
create index if not exists deliveries_edition_id_idx on public.deliveries (edition_id);
create index if not exists deliveries_run_id_idx on public.deliveries (run_id);

alter table public.workflow_runs enable row level security;
alter table public.deliveries enable row level security;

-- Owner-only. Readers create and update their own runs (manual generation, retry, cancel);
-- the scheduler uses the service role. No delete policy: history is kept (see retention in docs).
create policy "read own runs" on public.workflow_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "create own runs" on public.workflow_runs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own runs" on public.workflow_runs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own deliveries" on public.deliveries for select to authenticated using (user_id = (select auth.uid()));
create policy "create own deliveries" on public.deliveries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.editions e where e.id = edition_id and e.user_id = (select auth.uid()))
  );
create policy "update own deliveries" on public.deliveries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
