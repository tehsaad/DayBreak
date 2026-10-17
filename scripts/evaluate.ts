/**
 * Evaluation on live (or stored) news for the three reference readers.
 * Writes docs/EVALUATION.md with the measured numbers. Usage: npm run eval
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { numbersGrounded } from "../src/lib/ai/editorial";
import { generateEdition } from "../src/lib/edition/generate";
import { recordReaderFeedback } from "../src/lib/feedback";
import { ingest } from "../src/lib/news/ingest";
import { renderEditionPdf } from "../src/lib/pdf/edition-pdf";
import { CLUSTER_SIMILARITY } from "../src/lib/rank/plan";
import { FileStore } from "../src/lib/store/file-store";
import { getFileStore } from "../src/lib/store";
import { headlineSimilarity, TOPICS } from "../src/lib/topics";
import type { Edition } from "../src/lib/types";
import { PROFILES } from "../tests/fixtures/profiles";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function metrics(e: Edition) {
  const prefs = e.preferencesSnapshot;
  const n = e.stories.length;
  const lead = e.stories[0]!.article;
  const inSections = e.stories.filter((s) => s.article.topics.some((t) => prefs.sections.includes(t))).length;
  const top4 = e.stories.slice(0, 4).filter((s) => s.article.topics.some((t) => prefs.sections.includes(t))).length;
  const pubs = new Map<string, number>();
  for (const s of e.stories) pubs.set(s.article.publisher, (pubs.get(s.article.publisher) ?? 0) + 1);
  const topics = new Set(e.stories.map((s) => s.article.topics[0]));
  let dupPairs = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (headlineSimilarity(e.stories[i]!.article.title, e.stories[j]!.article.title) >= CLUSTER_SIMILARITY) dupPairs++;
  const grounded = e.stories.filter((s) => numbersGrounded(s.summary, `${s.article.title} ${s.article.excerpt}`)).length;
  return {
    stories: n,
    leadInSections: lead.topics.some((t) => prefs.sections.includes(t)),
    leadTitle: lead.title,
    leadPublisher: lead.publisher,
    shareInSections: inSections / n,
    top4InSections: top4,
    distinctTopics: topics.size,
    distinctPublishers: pubs.size,
    maxPublisherShare: Math.max(...pubs.values()) / n,
    duplicatePairs: dupPairs,
    summariesGrounded: grounded / n,
    aiSummaries: e.stories.filter((s) => s.summarySource === "ai").length,
    withReasons: e.stories.filter((s) => s.reasons.length > 0).length / n,
    broaden: e.stories.filter((s) => s.section === "broaden").length,
  };
}

async function main() {
  const live = getFileStore();
  if (process.argv.includes("--refresh")) await ingest({ store: live, trigger: "script", budgetMs: 60_000 });
  const pool = (await live.listArticles({ sinceHours: 48, limit: 1500 })).filter((a) => !a.sample);
  if (pool.length < 50) throw new Error(`Only ${pool.length} stored articles — run "npm run ingest" first.`);
  const now = new Date();
  const store = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-eval-")), "db.json"));
  const lines: string[] = [];
  const out = (s = "") => lines.push(s);

  out("# DAYBREAK evaluation");
  out();
  out(`Generated ${now.toISOString()} by \`npm run eval\` from ${pool.length} real articles collected from the configured feeds in the previous 48 hours. Deterministic ranking, no LLM (no API key was configured when this was run), so AI summary faithfulness could not be measured — see "Not measured" below.`);
  out();

  const editions: Record<string, Edition> = {};
  const ids = { aiResearcher: "e1111111-1111-4111-8111-111111111111", pakistanStudent: "e2222222-2222-4222-8222-222222222222", climateReader: "e3333333-3333-4333-8333-333333333333" } as const;
  for (const [name, prefs] of Object.entries(PROFILES) as [keyof typeof PROFILES, (typeof PROFILES)[keyof typeof PROFILES]][]) {
    editions[name] = (await generateEdition({ store, userId: ids[name], prefs, mode: "ensure", ai: null, now, articles: pool })).edition;
  }

  out("## 1. Personalisation across three reference readers");
  out();
  out("| Metric | AI & tech researcher | Pakistan-focused student | Climate & science reader |");
  out("|---|---|---|---|");
  const m = Object.fromEntries(Object.entries(editions).map(([k, e]) => [k, metrics(e)])) as Record<keyof typeof PROFILES, ReturnType<typeof metrics>>;
  const row = (label: string, f: (x: ReturnType<typeof metrics>) => string) => out(`| ${label} | ${f(m.aiResearcher)} | ${f(m.pakistanStudent)} | ${f(m.climateReader)} |`);
  out(`| Followed sections | ${PROFILES.aiResearcher.sections.map((t) => TOPICS[t].short).join(", ")} | ${PROFILES.pakistanStudent.sections.map((t) => TOPICS[t].short).join(", ")} | ${PROFILES.climateReader.sections.map((t) => TOPICS[t].short).join(", ")} |`);
  row("Stories in edition", (x) => String(x.stories));
  row("Lead story", (x) => `${x.leadTitle.replace(/\|/g, "/")} (${x.leadPublisher})`);
  row("Lead in a followed section", (x) => (x.leadInSections ? "yes" : "no"));
  row("Front page (4) in followed sections", (x) => `${x.top4InSections}/4`);
  row("Stories in followed sections", (x) => pct(x.shareInSections));
  row("“Beyond your usual” stories", (x) => String(x.broaden));
  row("Distinct primary topics", (x) => String(x.distinctTopics));
  row("Distinct publishers", (x) => String(x.distinctPublishers));
  row("Largest single-publisher share", (x) => pct(x.maxPublisherShare));
  row("Near-duplicate story pairs", (x) => String(x.duplicatePairs));
  row("Stories with a ranking reason", (x) => pct(x.withReasons));
  row("Summaries whose figures all appear in the source", (x) => pct(x.summariesGrounded));
  out();
  const setOf = (k: keyof typeof PROFILES) => new Set(editions[k]!.stories.map((s) => s.article.id));
  const ov = (a: keyof typeof PROFILES, b: keyof typeof PROFILES) => [...setOf(a)].filter((x) => setOf(b).has(x)).length;
  out(`Story overlap between editions: researcher↔student ${ov("aiResearcher", "pakistanStudent")}, researcher↔climate ${ov("aiResearcher", "climateReader")}, student↔climate ${ov("pakistanStudent", "climateReader")} shared stories.`);
  out();

  // 2. Feedback
  out("## 2. Effect of feedback");
  out();
  const reader = ids.aiResearcher;
  const before = editions.aiResearcher!;
  const lead = before.stories[0]!.article;
  const target = before.stories.find((s) => s.section === "broaden") ?? before.stories[before.stories.length - 1]!;
  await recordReaderFeedback(store, reader, { type: "not_interested", editionId: before.id, articleId: lead.id }, now);
  await recordReaderFeedback(store, reader, { type: "save", editionId: before.id, articleId: target.article.id }, now);
  await recordReaderFeedback(store, reader, { type: "rating", value: 5, editionId: before.id, articleId: target.article.id }, now);
  const after = (await generateEdition({ store, userId: reader, prefs: PROFILES.aiResearcher, mode: "regenerate", ai: null, now: new Date(now.getTime() + 3600_000), articles: pool })).edition;
  const t0 = target.article.topics[0]!;
  const countTopic = (e: Edition, t: string) => e.stories.filter((s) => s.article.topics[0] === t).length;
  const leadTopic = lead.topics[0]!;
  out(`Starting from the researcher's edition, we marked the lead (“${lead.title}”, ${TOPICS[leadTopic].label}) as **not interested**, and **saved** and rated 5/5 a ${TOPICS[t0].label} story (“${target.article.title}”). Then we regenerated.`);
  out();
  out("| | Before | After |");
  out("|---|---|---|");
  out(`| Rejected story in edition | yes (position 1) | ${after.stories.some((s) => s.article.id === lead.id) ? "yes" : "no"} |`);
  out(`| Lead story | ${lead.title} | ${after.stories[0]!.article.title} |`);
  out(`| ${TOPICS[leadTopic].label} stories | ${countTopic(before, leadTopic)} | ${countTopic(after, leadTopic)} |`);
  out(`| ${TOPICS[t0].label} stories | ${countTopic(before, t0)} | ${countTopic(after, t0)} |`);
  out(`| Learned weight, ${TOPICS[leadTopic].label} | 0 | ${after.ranking.learnedTopics[leadTopic] ?? 0} |`);
  out(`| Learned weight, ${TOPICS[t0].label} | 0 | ${after.ranking.learnedTopics[t0] ?? 0} |`);
  out(`| Feedback signals used | 0 | ${after.ranking.feedbackSignals} |`);
  out();

  // 3. PDF consistency
  out("## 3. PDF and website consistency");
  out();
  for (const [name, e] of Object.entries(editions)) {
    const started = Date.now();
    const pdf = await renderEditionPdf(e, { images: true });
    const raw = pdf.toString("latin1");
    const linked = e.stories.filter((s) => raw.includes(s.article.url.replace(/[()\\]/g, (c) => `\\${c}`))).length;
    const pages = (raw.match(/\/Type\s*\/Page\b/g) ?? []).length;
    out(`- **${name}**: ${pages} A4 pages, ${Math.round(pdf.length / 1024)} KB, rendered in ${Date.now() - started} ms; ${linked}/${e.stories.length} story links embedded as clickable annotations; generated from saved edition \`${e.id}\` (no new search, no model call).`);
  }
  out();

  // 4. Degradation
  out("## 4. Graceful degradation");
  out();
  const offline = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-off-")), "db.json"));
  const failingFetch = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  const run = await ingest({ store: offline, trigger: "script", budgetMs: 10_000, fetchImpl: failingFetch });
  const fallback = (await generateEdition({ store: offline, userId: reader, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null, now, refreshNews: false })).edition;
  out(`- All feeds failing: ingestion reported ${run.results.filter((r) => r.outcome === "error").length} source errors (not an empty result), and the edition fell back to the labelled sample set (contentMode = \`${fallback.contentMode}\`, ${fallback.stories.length} stories, every one marked as sample: ${fallback.stories.every((s) => s.article.sample)}).`);
  out(`- No LLM key: editions are produced with publisher descriptions (\`summarySource = "source"\`), a template editor's note and evidence-only Bigger Picture; the UI states that no AI text was used. LLM failures and malformed output are covered by \`tests/ai.test.ts\`.`);
  out();
  out("## Not measured");
  out();
  out("- **AI summary faithfulness** on live data: requires an LLM API key. The mechanism (Zod validation, invented-id rejection, numbers-must-appear-in-source check, per-item fallback) is tested with a mock model in `tests/ai.test.ts`.");
  out("- **Supabase end-to-end**: RLS, immutability triggers and idempotent edition creation are tested against the real migration on Postgres (PGlite) in `tests/rls.test.ts`; a hosted Supabase project was not available.");
  writeFileSync(path.resolve("docs/EVALUATION.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
