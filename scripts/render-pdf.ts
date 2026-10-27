/** Dev helper: generate an edition for a reference profile and render its PDF. */
import { writeFile } from "node:fs/promises";
import { getFileStore } from "../src/lib/store";
import { generateEdition } from "../src/lib/edition/generate";
import { renderEditionPdf } from "../src/lib/pdf/edition-pdf";
import { PROFILES } from "../tests/fixtures/profiles";

async function main() {
  const which = (process.argv[2] ?? "pakistanStudent") as keyof typeof PROFILES;
  const out = process.argv[3] ?? `/tmp/daybreak-${which}.pdf`;
  const store = getFileStore();
  const prefs = PROFILES[which];
  const { edition } = await generateEdition({ store, userId: `00000000-0000-4000-8000-00000000000${Object.keys(PROFILES).indexOf(which) + 1}`, prefs, mode: "regenerate", ai: null, refreshNews: false, log: (m, d) => console.error(m, JSON.stringify(d)) });
  const t = Date.now();
  const template = process.argv[4] === "briefing" ? "briefing" : "editorial";
  const pdf = await renderEditionPdf(edition, { template });
  await writeFile(out, pdf);
  console.log(`edition ${edition.id} stories=${edition.stories.length} pdf=${pdf.length}B in ${Date.now() - t}ms -> ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
