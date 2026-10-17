-- Additive only. 1) Run counts for the status page: raw items fetched and unique articles after
-- de-duplication (duplicates merged = raw - unique). Nullable, so older rows stay valid.
alter table public.ingestion_runs add column if not exists raw_items integer;
alter table public.ingestion_runs add column if not exists unique_items integer;

-- 2) One refresh at a time across all server instances (observed: two instances ingested and
-- summarised the same articles 5 s apart). A single-row lease; RLS with no policies plus
-- revoked function grants keep it service-role only.
create table if not exists public.ingest_lock (
  id smallint primary key default 1 check (id = 1),
  holder text,
  expires_at timestamptz not null default 'epoch'
);
alter table public.ingest_lock enable row level security;
insert into public.ingest_lock (id) values (1) on conflict (id) do nothing;

create or replace function public.claim_ingest_lock(p_holder text, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.ingest_lock
     set holder = p_holder, expires_at = now() + make_interval(secs => greatest(10, least(p_seconds, 600)))
   where id = 1 and expires_at < now();
  return found;
end $$;

create or replace function public.release_ingest_lock(p_holder text)
returns void language sql security invoker set search_path = public as $$
  update public.ingest_lock set expires_at = 'epoch' where id = 1 and holder = p_holder;
$$;

revoke all on function public.claim_ingest_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_ingest_lock(text) from public, anon, authenticated;
grant execute on function public.claim_ingest_lock(text, integer) to service_role;
grant execute on function public.release_ingest_lock(text) to service_role;
