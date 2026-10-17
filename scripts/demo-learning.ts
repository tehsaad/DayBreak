/**
 * Live demonstration that feedback changes ranking. Usage: npm run demo:learning [-- --sample]
 * Prints one reader's edition, records "not interested" on the lead and saves a story from
 * another topic, regenerates, and prints the new ranking with the learned weights.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateEdition } from "../src/lib/edition/generate";
import { recordReaderFeedback } from "../src/lib/feedback";
import { sampleArticles } from "../src/lib/news/sample";
import { getFileStore } from "../src/lib/store";
import { FileStore } from "../src/lib/store/file-store";
import { TOPICS } from "../src/lib/topics";
import type { Edition } from "../src/lib/types";
import { PROFILES } from "../tests/fixtures/profiles";

const USER = "d0000000-0000-4000-8000-000000000001";

function show(e: Edition, mark?: string) {
  for (const s of e.stories) {
    const flag = s.article.id === mark ? "  ← you said not interested" : "";
    console.log(`  ${String(s.position + 1).padStart(2)}. [${s.score.toFixed(2).padStart(5)}] ${TOPICS[s.article.topics[0]!].short.padEnd(10)} ${s.article.title.slice(0, 78)}${flag}`);
  }
}

async function main() {
  const useSample = process.argv.includes("--sample");
  const now = new Date();
  const articles = useSample ? sampleArticles(now) : (await getFileStore().listArticles({ sinceHours: 48, limit: 1500 })).filter((a) => !a.sample);
  if (articles.length < 20) throw new Error('Not enough stored articles; run "npm run ingest" first or pass --sample.');
  const store = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-demo-")), "db.json"));
  const prefs = PROFILES.aiResearcher;

  const one = (await generateEdition({ store, userId: USER, prefs, mode: "ensure", ai: null, now, articles })).edition;
  console.log(`\nEdition 1 for ${prefs.displayName} (follows ${prefs.sections.map((t) => TOPICS[t].short).join(", ")}):`);
  show(one);

  const lead = one.stories[0]!;
  const liked = one.stories.find((s) => !prefs.sections.includes(s.article.topics[0]!)) ?? one.stories[one.stories.length - 1]!;
  await recordReaderFeedback(store, USER, { type: "not_interested", editionId: one.id, articleId: lead.article.id }, now);
  await recordReaderFeedback(store, USER, { type: "save", editionId: one.id, articleId: liked.article.id }, now);
  console.log(`\nFeedback: NOT INTERESTED in “${lead.article.title.slice(0, 60)}”`);
  console.log(`          SAVED “${liked.article.title.slice(0, 60)}” (${TOPICS[liked.article.topics[0]!].label})`);

  const two = (await generateEdition({ store, userId: USER, prefs, mode: "regenerate", ai: null, now: new Date(now.getTime() + 3600_000), articles })).edition;
  console.log("\nEdition 2 (re-ranked):");
  show(two, lead.article.id);
  console.log("\nLearned topic weights (−1 … +1):", two.ranking.learnedTopics);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
