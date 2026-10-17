import { apiError, json, log } from "@/lib/api";
import { authorizeCron } from "@/lib/cron/auth";
import { newsMode } from "@/lib/env";
import { ingest, summarizeRun } from "@/lib/news/ingest";
import { getServiceStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) return apiError(auth.status, auth.error);
  if (newsMode() === "sample") return json({ skipped: "NEWS_MODE=sample" });
  const run = await ingest({ store: getServiceStore(), trigger: "cron", budgetMs: 45_000, log });
  const summary = summarizeRun(run);
  log("cron_ingest", summary);
  return json({ run: summary });
}
