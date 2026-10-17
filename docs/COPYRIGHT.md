# Publisher content and copyright

DAYBREAK has **no licence agreement with any publisher**. It uses what publishers distribute in
their public RSS feeds (and the GNews API) under a deliberately conservative policy. This
document records what the code enforces and what still needs **human legal review**. It is not
legal advice, and the application is not claimed to be risk-free.

## What the code enforces (`src/lib/news/rights.ts`)

| Content | Rule | Where enforced |
|---|---|---|
| Headlines | Shown with publisher name and a direct link to the original | everywhere |
| Excerpts | Readers see **at most one sentence, ≤ 200 characters** (`DISPLAY_EXCERPT_MAX`). Up to 300 characters are stored server-side only, for matching and to ground AI analysis | ingestion (`normalize.ts`), web components, PDF, `/api/editions/:id`, `/api/bookmarks` (also clamps editions stored before this rule) |
| Full article text | Never fetched, stored or shown. Feeds that ship full text (`fullTextInFeed`) are cut to 240 characters at ingestion | `normalize.ts` |
| Images | The feed's own thumbnail URL, **hotlinked, never copied or re-hosted**, credited "Image: Publisher". Sources can be set to `images: false`, and missing or blocked images use neutral striped placeholder artwork | `allowedImage()`, `Thumb` |
| AI summaries and analysis | Written fresh from the headline and short excerpt. The prompt forbids copying sentences. Story Explorer output is validated: every point must cite a report, and figures must appear in the cited source | `ai/editorial.ts`, `ai/coverage.ts` |
| Paywalls and access controls | Never bypassed. DAYBREAK does not fetch article pages at all | — |
| Retention | Shared articles are pruned by the ingestion job. Editions keep a snapshot (headline, ≤ 300-character excerpt, URL) so the archive stays accurate | `ingest.ts` |
| Per-source overrides | `OVERRIDES` in `rights.ts`: set `excerpt: "none"` (headline + link only) or `images: false` for any source whose terms require it | `rightsFor()` |

Tests (`tests/coverage.test.ts`, `e2e/explorer-pwa.spec.ts`) fail if long publisher text reaches
an edition, a PDF-bound summary or an API payload, or if a restricted source's excerpt or images
appear.

## Unresolved, for human review

1. **Feed terms per publisher.** BBC, The Guardian, NPR, Dawn, Express Tribune, Geo, Business
   Recorder, Ars Technica, MIT Technology Review, The Verge, TechCrunch, Rest of World, Nature,
   ScienceDaily, Quanta, Carbon Brief, WHO, UN News, Inside Higher Ed and ESPNcricinfo publish
   feeds with their own terms of use. Several (e.g. BBC) restrict feeds to **personal,
   non-commercial use**. If DAYBREAK is offered commercially, each publisher's terms must be
   checked and either licensed or the source set to `excerpt: "none"` / removed.
2. **GNews API.** Check your GNews plan's terms on displaying article metadata and images, and
   on storage duration.
3. **Thumbnails.** Hotlinking a publisher-provided feed image is common practice but is not an
   explicit licence. Disable images per source (`images: false`) where terms prohibit it.
4. **AI processing.** Some publishers prohibit using their content for AI processing. Where that
   applies, set `ai: false` for the source and exclude it from prompts. *The flag exists, but
   prompts do not consult it yet. This is a known gap to finish once terms are reviewed.*
5. **Bias ratings / ownership.** DAYBREAK shows **no** bias scores or political labels, because
   it has no licensed, documented dataset for them. Add them only with a cited methodology.

## Update: AI summaries (Groq / Gemini)

- Summaries are written from the headline and the ≤300-character stored excerpt only. The model
  is told to use its own words. Any output that reuses 8 or more consecutive words from the
  source is rejected (`copiesSource`), as is any output with figures not in the source.
- Paraphrasing is not treated as a licence. The per-source `ai: false` rule now removes a source
  from every AI prompt (summaries, editions); the previously noted gap is closed.
- Dawn: its feeds return HTTP 403 to DAYBREAK's cloud servers (they return 200 from a home
  connection). DAYBREAK does not work around this. The source is shown as "Blocked by the
  publisher" on the status page.
