# DAYBREAK: five-minute Loom demo

**Before recording**

- Deploy, or run `npm run build && npm start`.
- Run `npm run ingest` so the feeds are warm.
- Use a fresh browser profile, so onboarding starts clean. In demo mode, clearing the `daybreak_demo` cookie does the same.
- Have [`docs/EVALUATION.md`](EVALUATION.md) and the README architecture diagram open in tabs.
- If an LLM key is configured, say so; if not, say so too: the product is honest either way.

| Time | Screen | What to say |
|---|---|---|
| 0:00–0:30 | Landing page | "News is scattered across sites and apps, and nobody finishes it. DAYBREAK is a personal morning paper: real reporting from 21 publishers, ranked around you, explained, and printable. *The world, filtered through you.*" |
| 0:30–1:15 | Onboarding | Enter a name. Choose **Pakistan**, **Education** and **Business**, then the interests *Scholarships & fellowships* and *Pakistan's economy*. Set the region to Pakistan and move the slider towards local. Choose **Balanced** and 15 minutes. Point out the progress bar, the Back button and the Review step. Click **Print my first paper**. |
| 1:15–2:00 | The paper | Masthead, date and edition number; "from N articles". The lead story has a source link, "Also reported by …" and **Why this?** ("Matches your interest in Pakistan's economy"). Show the "Close to home: Pakistan" section and "Beyond your usual" ("so your paper doesn't become an echo chamber"). Search within the edition and filter by section. |
| 2:00–2:45 | The Bigger Picture | Open it on the lead: what happened, why it matters, connections to other stories today, comparison with earlier editions, what to watch (labelled *interpretation*) and a question to ask. Then **Three Things to Remember**. "Every statement links to evidence. Without an AI key, DAYBREAK assembles this from source text only and says so." |
| 2:45–3:35 | Learning | Click **Not interested** on a story ("Noted, future editions will carry fewer stories like this", with Undo). **Save** a story from another section. Click **Regenerate**. Edition 2: the rejected story is gone and the ranking has shifted. Open **Settings → What DAYBREAK has learned** to show the weights going negative and positive, with the per-topic reset. Mention decay and caps: "one accidental tap can't wipe out a section". Optionally show `npm run demo:learning` in a terminal. |
| 3:35–4:10 | PDF | Click **PDF** and open it: the same edition id, masthead, lead with image, front-page sidebar, sections and clickable links, "Page X of Y". "It's rendered from the saved edition, with no new search and no new AI call, so it matches the website exactly." |
| 4:10–4:35 | Archive | Open **Archive**: both editions are listed. Open edition 1: "previous editions are preserved exactly as published." Briefly show **Explore → One story, many newsrooms**. |
| 4:35–5:00 | Architecture | Show the README Mermaid diagram: Next.js on Vercel Functions, Supabase Postgres with RLS and Auth, a provider-agnostic AI layer with grounding checks and fallbacks, and Vercel Cron with a secret. Close with the measured results in `docs/EVALUATION.md` and the tests (82 unit/integration and 3 end-to-end). |

**Fallbacks if something goes wrong live**

- If the network is down, set `NEWS_MODE=sample`. The banner makes it clear that the data is sample data.
- If regeneration is in cooldown (45 s), use the time to show Settings → How ranking works.
