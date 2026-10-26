import { apiError, json, log } from "@/lib/api";
import { authorizeCron } from "@/lib/cron/auth";
import { prepareEditions } from "@/lib/cron/prepare";
import { getServiceStore } from "@/lib/store";
import { appUrlFor } from "@/lib/workflow/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) return apiError(auth.status, auth.error);
  const report = await prepareEditions(getServiceStore(), { budgetMs: 45_000, useAi: process.env.CRON_USE_AI !== "false", appUrl: appUrlFor(req), log });
  log("cron_prepare", { ...report });
  return json({ report });
}
