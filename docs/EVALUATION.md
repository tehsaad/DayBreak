# DAYBREAK evaluation

Generated 2026-10-17T14:39:53.144Z by `npm run eval` from 679 real articles collected from the configured feeds in the previous 48 hours. Deterministic ranking, no LLM (no API key was configured when this was run), so AI summary faithfulness could not be measured — see "Not measured" below.

## 1. Personalisation across three reference readers

| Metric | AI & tech researcher | Pakistan-focused student | Climate & science reader |
|---|---|---|---|
| Followed sections | Technology, Science, Business | Pakistan, Education, Business, Sport | Climate, Science, Health |
| Stories in edition | 13 | 12 | 12 |
| Lead story | Websites are closing their doors to AI agents (The Verge) | Pakistan to chair IMF, World Bank boards of governors after 74 years (Business Recorder) | Sri Lanka suffers nationwide electricity blackout (Business Recorder) |
| Lead in a followed section | yes | yes | yes |
| Front page (4) in followed sections | 4/4 | 4/4 | 4/4 |
| Stories in followed sections | 85% | 83% | 83% |
| “Beyond your usual” stories | 2 | 2 | 2 |
| Distinct primary topics | 6 | 6 | 7 |
| Distinct publishers | 12 | 10 | 9 |
| Largest single-publisher share | 15% | 17% | 17% |
| Near-duplicate story pairs | 0 | 0 | 0 |
| Stories with a ranking reason | 100% | 100% | 100% |
| Summaries whose figures all appear in the source | 100% | 100% | 100% |

Story overlap between editions: researcher↔student 0, researcher↔climate 0, student↔climate 0 shared stories.

## 2. Effect of feedback

Starting from the researcher's edition, we marked the lead (“Websites are closing their doors to AI agents”, AI & Technology) as **not interested**, and **saved** and rated 5/5 a World Affairs story (“India's 'cockroach' movement founder released a day after detention”). Then we regenerated.

| | Before | After |
|---|---|---|
| Rejected story in edition | yes (position 1) | no |
| Lead story | Websites are closing their doors to AI agents | Call for more food funding due to high living cost |
| AI & Technology stories | 5 | 3 |
| World Affairs stories | 1 | 2 |
| Learned weight, AI & Technology | 0 | -0.462 |
| Learned weight, World Affairs | 0 | 0.635 |
| Feedback signals used | 0 | 3 |

## 2b. Acceptance metrics (targets from the production-readiness brief)

| Metric | Target | Measured | Sample |
|---|---:|---:|---|
| Same-event duplicates among the top 20 stories | under 10% | 0% | 37 stories across 3 editions, Full Coverage same-event matcher |
| Story links that are the publisher's own feed URL, well-formed https | 98% | 100% | 37 links |
| Story links that are broken (HTTP 404/410) | 0 | 0 | same URLs |
| Story links that load (HTTP 2xx/3xx after redirects) | 98% | 84% | 37 unique URLs, live GET from this machine; 1 refused automated requests (401/403/429), 2 timed out or failed |

Links that did not load: arstechnica.com → 405; www.npr.org → TimeoutError; www.cricinfo.com → 403.

Relevance as rated by test readers and the summary-claim audit cannot be computed by this script: see the notes in “Not measured”.

## 3. PDF and website consistency

- **aiResearcher**: 4 A4 pages, 333 KB, rendered in 3953 ms; 13/13 story links embedded as clickable annotations; generated from saved edition `65dbe8a0-afa1-48b1-8405-55d7e2fa4a9c` (no new search, no model call).
- **pakistanStudent**: 4 A4 pages, 69 KB, rendered in 1484 ms; 12/12 story links embedded as clickable annotations; generated from saved edition `8ec6b04b-6bd7-4427-889e-cc15775d496a` (no new search, no model call).
- **climateReader**: 4 A4 pages, 67 KB, rendered in 1442 ms; 12/12 story links embedded as clickable annotations; generated from saved edition `ed223d42-46a6-4360-be2e-c09da82baacc` (no new search, no model call).

## 4. Graceful degradation

- All feeds failing: ingestion reported 43 source errors (not an empty result), and the edition fell back to the labelled sample set (contentMode = `sample`, 13 stories, every one marked as sample: true).
- No LLM key: editions are produced with publisher descriptions (`summarySource = "source"`), a template editor's note and evidence-only Bigger Picture; the UI states that no AI text was used. LLM failures and malformed output are covered by `tests/ai.test.ts`.

## Not measured

- **Relevance rated by human test readers** (target 80%): needs people. The proxy above (share of stories in followed sections) is not a substitute.
- **AI summary faithfulness** on live data: requires an LLM API key. The mechanism (Zod validation, invented-id rejection, numbers-must-appear-in-source check, per-item fallback) is tested with a mock model in `tests/ai.test.ts`.
- **Supabase end-to-end**: RLS, immutability triggers and idempotent edition creation are tested against the real migration on Postgres (PGlite) in `tests/rls.test.ts`; a hosted Supabase project was not available.
