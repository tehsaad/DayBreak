-- DAYBREAK schema, part 2/4 — immutability triggers, create_edition() and the new-user profile trigger.
-- Applied to the production Supabase project with this exact version and name.
-- Ownership model: shared news (sources, articles, article_summaries, ingestion_runs) is written
-- only by the server's service role; everything about a reader is private behind RLS.

-- Immutability: a published edition never changes. The only permitted update is filling in a
-- story's Bigger Picture analysis the first time it is requested.
create or replace function public.forbid_edition_update() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'editions are immutable once published';
end $$;

create trigger editions_immutable before update on public.editions
  for each row execute function public.forbid_edition_update();

create or replace function public.guard_story_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'bigger_picture') is distinct from (to_jsonb(old) - 'bigger_picture') then
    raise exception 'edition stories are immutable; only bigger_picture may be filled in';
  end if;
  return new;
end $$;

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

revoke execute on function public.create_edition(jsonb, jsonb) from public, anon;
grant execute on function public.create_edition(jsonb, jsonb) to authenticated, service_role;

-- New auth users get a profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- Trigger-only function: nobody should call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
