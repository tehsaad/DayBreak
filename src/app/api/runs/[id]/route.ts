import { apiError, json } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const run = await reader.store.getWorkflowRun(reader.userId, id).catch(() => null);
  if (!run) return apiError(404, "Run not found");
  return json({ run });
}
