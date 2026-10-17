# AI summary audit

**Round 1: 17 Oct 2026, prompt `sum-v1`, model `openai/gpt-oss-20b` (Groq), production data.**
Sample: 25 summaries chosen by hash order (not cherry-picked) from `article_summaries`. Each was
compared with the headline and the stored excerpt (≤300 characters) it was generated from. The
auditor was Claude, the coding assistant, **not a human reviewer**. Treat it as a careful
second read, not independent verification.

| Result | Count |
|---|---:|
| Fully supported by the source | 22 / 25 (**88%**, target 95%) |
| Contradicts the source | 1 |
| Drops a hedge (reported claim stated as fact) | 1 |
| Imprecise title | 1 |

Failures:

1. *Eight-try Australia send Scotland to eighth straight defeat* (BBC Sport). The summary said
   "…ending Scotland's winning streak". The source reports a losing streak: an invented,
   contradictory conclusion.
2. *UAE agrees with Saudi Arabia to re-enter Yemen conflict* (The Guardian). The source says the
   UAE "will reportedly resume payments". The summary said "is set to resume", dropping the
   attribution.
3. *Minister rebukes JUI-F chief…* (Dawn). "State Minister for Interior" became "the interior
   minister".

Fixes in prompt `sum-v2`:
- The prompt requires keeping hedges and attribution and exact titles, and forbids unstated
  conclusions (streaks, records, causes, outcomes).
- A new automatic check (`dropsHedge`) rejects any summary that drops a "reportedly/allegedly"
  type attribution. It is tested against failure 2's real text.
- Failures 1 and 3 can't be caught reliably by a rule. They rely on the prompt, so the next audit
  round must check whether they recur.
- The version bump regenerates every cached summary.

The other 22 summaries were checked against: headline and excerpt, numbers, named people and
places, and attribution. They are listed here so the audit can be repeated:
Installer No. 148 (The Verge); IMF members call for more support (Business Recorder); Bank of
England governor walks out of IMF summit (The Guardian); Honeybees barging aside wild pollinators
(The Guardian); Fake Linda and me (The Guardian); Centre was compelled to impose emergency in KP
(Dawn); ATC judge in Imaan, Chattha case (Geo News); Jayawardene leaves Mumbai Indians (Business
Recorder); IMFC chair Al-Jadaan (Business Recorder); Kartal reaches Wuhan final (BBC Sport); Mumbai
Indians and Jayawardene part ways (ESPNcricinfo); Midterm money madness (NPR); India's food
regulator proposes ban on added sugars (Business Recorder); Oregon teacher fought school attacker
(BBC News); Govt rejects Achakzai's demand (Geo News); Pakistan, England and Sri Lanka tri-series
(Business Recorder); Sidewalk sleepers (NPR); Plaque telling story of African-Caribbean prisoners
(The Guardian); Kartal battles past Ostapenko (Business Recorder); Pakistan, Sri Lanka look to find
the right mix (ESPNcricinfo); Guardiola standing ovation (BBC Sport); Trump swing district blitz
(NPR).

## Round 2: 17 Oct 2026, prompt `sum-v2`, `openai/gpt-oss-20b`

Sample: all 18 summaries written after the `sum-v2` deploy. Same method and auditor as round 1.

| Result | Count |
|---|---:|
| Fully supported | 14 / 18 (**78%**, target 95%) |
| Misattribution (words credited to the wrong person) | 2 |
| Completed a truncated excerpt with an invented ending ("…unfounded") | 1 |
| Non-summary saved for a Hindi article ("no summary is provided") | 1 |
| Over-hedged but not false ("reportedly said" for "says") | 2, counted as supported |

The round-1 errors (contradiction, dropped hedge, title) didn't recur, but the 20b model
struggled with messy inputs: truncated, bullet-style and non-English excerpts. Changes in
`sum-v3`:
- Default model `openai/gpt-oss-120b`.
- Truncated excerpts are marked `[truncated]`, with an instruction never to complete them.
- Attribution must stay with the person the report names, and headline wording belongs to the
  publisher.
- "Says" stays "says".
- Non-Latin-script and fragment sources are skipped (`summarisableText`).
- Meta answers ("no summary…") are rejected.

## Round 3: 17 Oct 2026, prompt `sum-v3`, `openai/gpt-oss-120b`

Sample: 20 of the 23 summaries written after the `sum-v3` deploy (hash order). Same method and
auditor.

| Result | Count |
|---|---:|
| Fully supported | 17 / 20 (**85%**, target 95%: **not met**) |
| Misspelled name ("Zverkov" for Zverev) | 1 |
| Overstated ("set to bring in" reported as announced) | 1 |
| Claim credited to "sources" stated as fact | 1 |

Trend: 88% → 78% → 85%. The `sum-v3` rules removed misattribution, invented endings, junk
answers and over-hedging. A new `inventsName` check now rejects summaries naming people or
places missing from the source (tested on the Zverkov case). Tense and hedging subtleties
remain prompt-dependent. The 95% target is still unmet on the evidence so far, and needs a
fourth audit round on new output.

Re-run: query 25 rows of `article_summaries ⋈ articles` ordered by `md5(article_id)` for the
current model, and compare each summary with its source.
