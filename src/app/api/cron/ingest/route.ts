import { randomUUID } from "node:crypto";
import { apiError, json, log } from "@/lib/api";
import { authorizeCron } from "@/lib/cron/auth";
import { newsMode } from "@/lib/env";
import { refreshNews, summarizeRun } from "@/lib/news/ingest";
import { getServiceStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) return apiError(auth.status, auth.error);
  if (newsMode() === "sample") return json({ skipped: "NEWS_MODE=sample" });
  const store = getServiceStore();
  const holder = randomUUID();
  if (!(await store.claimIngestLock(holder, 120).catch(() => true))) {
    log("cron_ingest_skipped", { reason: "another refresh is running" });
    return json({ skipped: "another refresh is running" });
  }
  const { run, summaries } = await refreshNews(store, { trigger: "cron", budgetMs: 45_000, totalMs: 105_000, log }).finally(() => store.releaseIngestLock(holder).catch(() => undefined));
  const summary = summarizeRun(run);
  log("cron_ingest", { ...summary, summaries });
  return json({ run: summary, summaries });
}
