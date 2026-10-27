/** Dev check: one real GNews search (uses 1 request of the daily quota). Prints no secrets. */
import path from "node:path";
import { FileStore } from "../src/lib/store/file-store";
import { searchWebNews } from "../src/lib/news/web-search";

async function main() {
  const q = process.argv[2] ?? "artificial intelligence";
  const dir = process.env.DATA_DIR ?? ".data";
  const r = await searchWebNews(new FileStore(path.resolve(dir, "web-search-check.json")), q, 3);
  console.log(JSON.stringify({ status: r.status, message: r.message, count: r.articles.length, sample: r.articles.slice(0, 3).map((a) => ({ title: a.title, publisher: a.publisher, url: a.url, publishedAt: a.publishedAt, topics: a.topics })) }, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
