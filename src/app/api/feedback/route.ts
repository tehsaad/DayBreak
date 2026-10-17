import { z } from "zod";
import { apiError, json, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { FeedbackInput, FeedbackTargetError, recordReaderFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const rl = rateLimit("feedback", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = await parseBody(req, FeedbackInput);
  if (!body.ok) return body.response;
  try {
    const { deduplicated, learned } = await recordReaderFeedback(reader.store, reader.userId, body.data);
    return json({ ok: true, deduplicated, signals: learned.signalCount });
  } catch (err) {
    if (err instanceof FeedbackTargetError) return apiError(404, err.message);
    throw err;
  }
}

const Undo = z.object({ articleId: z.string().min(1).max(64), type: z.enum(["skip", "not_interested", "rating"]) });

/** Undo a skip / not-interested / rating on one story. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const body = await parseBody(req, Undo);
  if (!body.ok) return body.response;
  const removed = await reader.store.deleteFeedback(reader.userId, body.data);
  return json({ ok: true, removed });
}
