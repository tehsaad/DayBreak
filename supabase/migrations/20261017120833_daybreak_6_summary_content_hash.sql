-- Summaries are reused only while the article text they were written from is unchanged:
-- content_hash = sha256(prompt version + title + excerpt). Nullable, so existing rows stay valid
-- until regenerated (a null hash never matches, so they are refreshed on next use).
alter table public.article_summaries add column if not exists content_hash text;
