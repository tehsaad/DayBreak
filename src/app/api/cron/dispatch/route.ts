import { apiError, json, log } from "@/lib/api";
import { authorizeCron } from "@/lib/cron/auth";
import { getServiceStore } from "@/lib/store";
import { appUrlFor, dispatch } from "@/lib/workflow/dispatch";

export const dynamic = "force-dynamic";
// Each due reader: generation (≤ ~40 s with AI) + PDF + email. Readers left over when the budget
// runs out are picked up by the next trigger (due-ness is "time reached and not yet done").
export const maxDuration = 300;

/**
 * Scheduled delivery. Called every 30 minutes by .github/workflows/ingest.yml (Vercel Hobby
 * crons run at most daily). Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) return apiError(auth.status, auth.error);
  const started = Date.now();
  const report = await dispatch({ store: getServiceStore(), appUrl: appUrlFor(req), budgetMs: 240_000, mode: "deliver", useAi: process.env.CRON_USE_AI !== "false", log });
  log("cron_dispatch", { ...report, delaysSeconds: undefined, maxDelaySeconds: Math.max(0, ...report.delaysSeconds), ms: Date.now() - started });
  return json({ report });
}
