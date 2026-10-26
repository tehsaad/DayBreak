import { apiError, json, sameOrigin } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";

export const dynamic = "force-dynamic";

/**
 * Request cancellation. The runner checks the flag before each stage, so a running workflow stops
 * at the next stage boundary; work already finished (e.g. a saved edition) is kept.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const run = await reader.store.getWorkflowRun(reader.userId, id).catch(() => null);
  if (!run) return apiError(404, "Run not found");
  if (run.status !== "running" && run.status !== "pending" && run.status !== "failed" && run.status !== "partial") return apiError(409, `A ${run.status} run cannot be cancelled`);
  // A failed or partial run is cancelled outright, so automatic retries leave it alone.
  const next = run.status === "running" || run.status === "pending" ? { ...run, cancelRequested: true } : { ...run, status: "cancelled" as const, cancelRequested: true };
  await reader.store.saveWorkflowRun({ ...next, updatedAt: new Date().toISOString() });
  return json({ run: next });
}
