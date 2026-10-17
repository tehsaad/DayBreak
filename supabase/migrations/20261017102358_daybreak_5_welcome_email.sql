-- DAYBREAK schema, part 5 — one-time welcome email.
-- Applied to the production Supabase project with this exact version and name.
-- The app claims the row with
--   update profiles set welcome_email_sent_at = now() where id = auth.uid() and welcome_email_sent_at is null
-- so concurrent or retried OAuth callbacks can send at most one welcome email.
alter table public.profiles add column if not exists welcome_email_sent_at timestamptz;
