# Accounts and sign-in setup

DAYBREAK uses **Supabase Auth** with `@supabase/ssr` cookie sessions. Every sign-in method is a server-side route handler, and identity is always verified on the server with `supabase.auth.getUser()`.

| Flow | Route | Notes |
|---|---|---|
| Continue with Google | `GET /auth/google` | OAuth 2.0 with PKCE; the code verifier is kept in an httpOnly cookie |
| Email + password sign-up | `POST /auth/sign-up` | Sends a confirmation email when "Confirm email" is on (Supabase's default) |
| Email + password sign-in | `POST /auth/sign-in` | |
| One-time email link | `POST /auth/magic-link` | Also creates the account on first use |
| Callback | `GET /auth/callback` | `?code=` (OAuth/PKCE), `?token_hash=&type=` (email links), `?error=` (cancelled or failed) |
| First-login router | `GET /auth/continue` | First-time readers → `/onboarding`; returning readers → `/newspaper` (or the page they asked for) |
| Sign out | `POST /auth/signout` | Signs out this browser |

Sessions survive refreshes and browser restarts through Supabase's cookies, refreshed by `src/proxy.ts`. Signed-out visitors to private pages are sent to `/login?next=…`. Every page and API route re-checks the reader server-side, so the proxy is only a convenience.

## 1. Supabase → Authentication → URL Configuration

- **Site URL:** `https://daybreak-gilt.vercel.app`
- **Redirect URLs (allow list):**
  - `https://daybreak-gilt.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`, for local development

DAYBREAK keeps the post-login destination in a cookie rather than the callback URL, so these exact entries are enough and no wildcards are needed.

## 2. Supabase → Authentication → Sign In / Providers

- **Email:** enabled by default. Keep **Confirm email** on: sign-up then emails a confirmation link that lands on `/auth/callback`.
- **Google:** enable it and paste the Client ID and Client secret from step 3.

> Supabase's built-in email sender is rate-limited and meant for testing. For real users, configure custom SMTP under **Authentication → Emails → SMTP settings**.

## 3. Google Cloud Console (for Continue with Google)

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: create the consent screen (app name DAYBREAK, your support email). Scopes: `openid`, `email`, `profile`.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorised JavaScript origins:** `https://daybreak-gilt.vercel.app` and `http://localhost:3000`
   - **Authorised redirect URIs:** `https://umjwrmnicqflmkoifejj.supabase.co/auth/v1/callback`. This is Supabase's callback, not DAYBREAK's: Google returns to Supabase, which then redirects to `/auth/callback`.
3. Copy the Client ID and Client secret into Supabase (step 2). While the consent screen is in **Testing**, only the test users you list can sign in; publish it for everyone.

## 4. Vercel environment variables

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://umjwrmnicqflmkoifejj.supabase.co` | ✅ set |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key | ✅ set. Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret / service_role | **You add this** (Sensitive). Without it, accounts still work but the shared news pool is cached per server instance, and cron preparation is skipped |

Environment changes apply to the **next** deployment.

## What has and hasn't been verified

- **Verified automatically:** the route logic, with a mocked Supabase client (`tests/auth.test.ts`). The real auth pages in Supabase mode were tested against an unreachable Supabase (`e2e/auth.spec.ts`): route protection, the OAuth redirect with PKCE, and the cancelled, expired and unreachable error states.
- **Verified live:** database RLS isolation between two users on the production database, run in a transaction and rolled back. See the README.
- **Not yet verified live:** a real Google sign-in and a real email sign-up or confirmation. Both need the provider configuration above and a real inbox or Google account.
