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
  const { run, summaries } = await refreshNews(getServiceStore(), { trigger: "cron", budgetMs: 45_000, totalMs: 105_000, log });
  const summary = summarizeRun(run);
  log("cron_ingest", { ...summary, summaries });
  return json({ run: summary, summaries });
}
