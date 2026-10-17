import { publicEdition } from "@/lib/news/rights";
import { apiError, json } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/editions/[id]">) {
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const edition = await reader.store.getEdition(reader.userId, id);
  // Same response for "doesn't exist" and "belongs to someone else".
  if (!edition) return apiError(404, "Edition not found");
  return json({ edition: publicEdition(edition) });
}
