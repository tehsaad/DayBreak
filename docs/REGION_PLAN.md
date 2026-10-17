# Hosting region: findings and an optional database move (needs approval)

## Measured (17 Oct 2026)

| What | Value | How |
|---|---|---|
| Supabase database region | AWS **ap-northeast-1 (Tokyo)** | DB host IPv6 `2406:da14:…` is in AWS ip-ranges `ap-northeast-1` |
| Vercel functions, before | `iad1` (Washington DC) | `/api/health` → `region` |
| One trivial DB query from the function, before | **174–190 ms** warm, ~600 ms cold (10 samples) | `/api/health` → `dbMs` |
| Vercel functions, now | **`hnd1` (Tokyo)**, set in `vercel.json` `regions` | `/api/health` |
| One trivial DB query, now | **32–66 ms** warm (one cold outlier of 696 ms) | `/api/health` → `dbMs` |
| TCP connect, from a home connection in Pakistan | AWS ap-south-1 (Mumbai) 120 ms, ap-northeast-1 (Tokyo) 197 ms, us-east-1 241 ms, Vercel edge 119 ms | `curl time_connect`, median of 5 |

Co-locating the functions with the database removed the main cost, because signed-in pages make
several sequential queries. It was a reversible config change, and no data moved.

## Should the database move to Mumbai (ap-south-1)?

Now that functions and database are in the same region, a move would save only the reader ↔
function distance: about 77 ms per network round trip from Pakistan (197 → 120 ms), a few round
trips per page load. That's a real but modest gain, at real cost. **Recommendation: not now.**
Revisit if most readers stay in South Asia and the remaining latency is still a problem after
caching work.

If approved later, Supabase's documented path is a **new project in the target region plus a
migration**. Regions can't be changed in place.

1. Create a new Supabase project in ap-south-1 (same plan). Apply `supabase/migrations/*` in
   order, then run the advisors.
2. Freeze writes (maintenance banner, pause cron). Take a dashboard backup and a CLI dump
   (`supabase db dump --data-only`, and the `auth` schema) of the old project.
3. Restore into the new project. Verify row counts per table (`profiles`, `reader_preferences`,
   `editions`, `edition_stories`, `saved_articles`, `feedback_events`, `topic_affinities`,
   `articles`, `article_summaries`, `sources`) and spot-check RLS with two test readers.
4. Re-create the auth configuration: Site URL and redirect URLs, Google OAuth client id/secret,
   Resend SMTP and the email templates. Add the new callback URL in Google Cloud Console.
5. Update Vercel env (`NEXT_PUBLIC_SUPABASE_URL`, publishable key, `SUPABASE_SERVICE_ROLE_KEY`), set
   `vercel.json` `regions` to `bom1`, and deploy through CI.
6. **Impact:**
   - Every reader is signed out once, because sessions belong to the old project.
   - Downtime is roughly the restore time: minutes at the current size.
   - Cost is the same plan price, plus the old project until it's deleted.
7. **Rollback:** keep the old project untouched for at least 7 days, and switch the env vars back
   if anything fails.
