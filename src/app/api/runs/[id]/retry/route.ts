import { aiHandle } from "@/lib/ai/handle";
import { apiError, json, log, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { RunBusyError } from "@/lib/store/types";
import { appUrlFor } from "@/lib/workflow/dispatch";
import { runEditionWorkflow } from "@/lib/workflow/runner";
import type { WorkflowRun } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retry a failed, partial or cancelled run. Resumes the same run record: if its edition was
 * already saved, generation is skipped and only delivery is attempted (never twice per edition).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/retry">) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const rl = rateLimit("generate", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const [run, prefs] = await Promise.all([reader.store.getWorkflowRun(reader.userId, id).catch(() => null), reader.store.getPreferences(reader.userId)]);
  if (!run) return apiError(404, "Run not found");
  if (!prefs?.onboardedAt) return apiError(409, "Complete onboarding first");
  if (run.status === "succeeded" || run.status === "running") return apiError(409, `A ${run.status} run cannot be retried`);
  const email = run.deliver ? reader.email ?? (await reader.store.getReaderEmail(reader.userId).catch(() => null)) : null;
  try {
    const result = await runEditionWorkflow({
      store: reader.store,
      userId: reader.userId,
      prefs,
      trigger: "retry",
      resumeRunId: run.id,
      mode: "ensure",
      ai: aiHandle(),
      deliver: run.deliver ? { email, appUrl: appUrlFor(req), format: prefs.delivery.format } : null,
      log: (event, data) => log(event, { ...data, user: reader.userId.slice(0, 8) }),
    });
    return json({ run: result.run, editionId: result.edition?.id ?? null });
  } catch (err) {
    if (err instanceof RunBusyError) return apiError(409, "Another run is in progress.", { busy: true });
    const failed = (err as { run?: WorkflowRun }).run;
    return apiError(failed ? 502 : 500, (err as Error).message?.slice(0, 200) ?? "Retry failed", { run: failed ?? null });
  }
}
