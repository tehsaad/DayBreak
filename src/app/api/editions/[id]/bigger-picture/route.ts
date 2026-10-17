import { z } from "zod";
import { apiError, json, log, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { aiHandle } from "@/lib/ai/handle";
import { getReader } from "@/lib/auth/reader";
import { ensureBiggerPicture } from "@/lib/edition/bigger-picture";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const Body = z.object({ position: z.number().int().min(0).max(40) });

export async function POST(req: Request, ctx: RouteContext<"/api/editions/[id]/bigger-picture">) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const { id } = await ctx.params;
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const edition = await reader.store.getEdition(reader.userId, id);
  if (!edition) return apiError(404, "Edition not found");
  const story = edition.stories.find((s) => s.position === body.data.position);
  if (!story) return apiError(404, "Story not found");
  if (story.biggerPicture) return json({ biggerPicture: story.biggerPicture, generated: false });
  const rl = rateLimit("biggerPicture", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  try {
    const result = await ensureBiggerPicture({ store: reader.store, userId: reader.userId, edition, position: body.data.position, ai: aiHandle(), log });
    return json(result);
  } catch (err) {
    log("bigger_picture_failed", { error: (err as Error).message?.slice(0, 200) });
    return apiError(500, "The Bigger Picture is unavailable right now.");
  }
}
