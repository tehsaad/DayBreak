# DAYBREAK evaluation

Generated 2026-10-17T06:36:18.444Z by `npm run eval` from 596 real articles collected from the configured feeds in the previous 48 hours. Deterministic ranking, no LLM (no API key was configured when this was run), so AI summary faithfulness could not be measured — see "Not measured" below.

## 1. Personalisation across three reference readers

| Metric | AI & tech researcher | Pakistan-focused student | Climate & science reader |
|---|---|---|---|
| Followed sections | Technology, Science, Business | Pakistan, Education, Business, Sport | Climate, Science, Health |
| Stories in edition | 13 | 12 | 12 |
| Lead story | 'I am a normal human being': Khawaja Asif brushes off online trolling over AI-generated Marilyn Monroe riddle (Dawn) | Pakistan to chair IMF, World Bank boards of governors after 74 years (Business Recorder) | Evacuation orders as fast-moving California wildfire burns homes (BBC News) |
| Lead in a followed section | yes | yes | yes |
| Front page (4) in followed sections | 4/4 | 4/4 | 4/4 |
| Stories in followed sections | 85% | 83% | 83% |
| “Beyond your usual” stories | 2 | 2 | 2 |
| Distinct primary topics | 6 | 6 | 6 |
| Distinct publishers | 12 | 9 | 10 |
| Largest single-publisher share | 15% | 25% | 17% |
| Near-duplicate story pairs | 0 | 0 | 0 |
| Stories with a ranking reason | 100% | 100% | 100% |
| Summaries whose figures all appear in the source | 100% | 100% | 100% |

Story overlap between editions: researcher↔student 0, researcher↔climate 0, student↔climate 0 shared stories.

## 2. Effect of feedback

Starting from the researcher's edition, we marked the lead (“'I am a normal human being': Khawaja Asif brushes off online trolling over AI-generated Marilyn Monroe riddle”, AI & Technology) as **not interested**, and **saved** and rated 5/5 a World Affairs story (“India detains ‘cockroach’ founder, student leaders”). Then we regenerated.

| | Before | After |
|---|---|---|
| Rejected story in edition | yes (position 1) | no |
| Lead story | 'I am a normal human being': Khawaja Asif brushes off online trolling over AI-generated Marilyn Monroe riddle | Call for more food funding due to high living cost |
| AI & Technology stories | 5 | 4 |
| World Affairs stories | 2 | 3 |
| Learned weight, AI & Technology | 0 | -0.462 |
| Learned weight, World Affairs | 0 | 0.635 |
| Feedback signals used | 0 | 3 |

## 3. PDF and website consistency

- **aiResearcher**: 4 A4 pages, 70 KB, rendered in 1939 ms; 13/13 story links embedded as clickable annotations; generated from saved edition `08e1b946-e10b-4c87-bc73-27a1d93991e8` (no new search, no model call).
- **pakistanStudent**: 4 A4 pages, 68 KB, rendered in 1236 ms; 12/12 story links embedded as clickable annotations; generated from saved edition `0a5097f6-9ea8-4382-b6df-a2065a961eef` (no new search, no model call).
- **climateReader**: 3 A4 pages, 65 KB, rendered in 1092 ms; 12/12 story links embedded as clickable annotations; generated from saved edition `78b3a393-f41b-4d7d-a2a7-1d9be2a29fa7` (no new search, no model call).

## 4. Graceful degradation

- All feeds failing: ingestion reported 43 source errors (not an empty result), and the edition fell back to the labelled sample set (contentMode = `sample`, 13 stories, every one marked as sample: true).
- No LLM key: editions are produced with publisher descriptions (`summarySource = "source"`), a template editor's note and evidence-only Bigger Picture; the UI states that no AI text was used. LLM failures and malformed output are covered by `tests/ai.test.ts`.

## Not measured

- **AI summary faithfulness** on live data: requires an LLM API key. The mechanism (Zod validation, invented-id rejection, numbers-must-appear-in-source check, per-item fallback) is tested with a mock model in `tests/ai.test.ts`.
- **Supabase end-to-end**: RLS, immutability triggers and idempotent edition creation are tested against the real migration on Postgres (PGlite) in `tests/rls.test.ts`; a hosted Supabase project was not available.
