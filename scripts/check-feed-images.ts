/** Dev helper: how many items in each feed yield an image candidate. Usage: npx tsx scripts/check-feed-images.ts [url…] */
import { parseFeed } from "../src/lib/news/parse";
import { SOURCES } from "../src/lib/news/sources";

const urls = process.argv.slice(2).length ? process.argv.slice(2) : SOURCES.map((s) => s.feedUrl);
for (const u of urls) {
  try {
    const xml = await (await fetch(u, { headers: { "user-agent": "DaybreakReader/1.0" }, signal: AbortSignal.timeout(15000) })).text();
    const f = parseFeed(xml);
    const n = f.items.filter((i) => i.imageCandidates.length).length;
    console.log(`${String(n).padStart(3)}/${String(f.items.length).padEnd(3)} ${u}`);
  } catch (e) {
    console.log(`  error ${u}: ${(e as Error).message.slice(0, 80)}`);
  }
}
