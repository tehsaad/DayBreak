/** Fetch all configured feeds into the configured store. Usage: npm run ingest [-- --force] */
import { getServiceStore } from "../src/lib/store";
import { ingest, summarizeRun } from "../src/lib/news/ingest";

async function main() {
  const store = getServiceStore();
  const run = await ingest({ store, trigger: "script", budgetMs: 60_000, force: process.argv.includes("--force") });
  console.log(JSON.stringify(summarizeRun(run)));
  for (const r of run.results) console.log(`${r.outcome.padEnd(15)} ${String(r.items).padStart(4)} ${String(r.ms).padStart(6)}ms  ${r.sourceId}${r.error ? `  (${r.error})` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
