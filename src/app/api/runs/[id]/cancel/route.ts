import { apiError, json, sameOrigin } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";

export const dynamic = "force-dynamic";

/**
 * Request cancellation. A running workflow stops at the next stage boundary (work already
 * finished, e.g. a saved edition, is kept); a failed or partial run is cancelled outright so
 * automatic retries leave it alone. The update is conditional on the run's current state, so a
 * run that finished in the meantime is never overwritten.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const updated = await reader.store.requestCancel(reader.userId, id, new Date().toISOString()).catch(() => null);
  if (updated) return json({ run: updated });
  const run = await reader.store.getWorkflowRun(reader.userId, id).catch(() => null);
  if (!run) return apiError(404, "Run not found");
  return apiError(409, `A ${run.status} run cannot be cancelled`);
}
