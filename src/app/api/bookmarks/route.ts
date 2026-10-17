import { z } from "zod";
import { apiError, json, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { FeedbackTargetError, recordReaderFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  return json({ bookmarks: await reader.store.listBookmarks(reader.userId) });
}

const Add = z.object({ editionId: z.string().uuid(), articleId: z.string().min(1).max(64) });

/** Save a story. Recorded as a "save" signal too, since saving is a deliberate positive act. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const rl = rateLimit("write", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = await parseBody(req, Add);
  if (!body.ok) return body.response;
  try {
    await recordReaderFeedback(reader.store, reader.userId, { type: "save", ...body.data });
    return json({ ok: true });
  } catch (err) {
    if (err instanceof FeedbackTargetError) return apiError(404, err.message);
    throw err;
  }
}

const Remove = z.object({ articleId: z.string().min(1).max(64) });

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const body = await parseBody(req, Remove);
  if (!body.ok) return body.response;
  const bookmark = (await reader.store.listBookmarks(reader.userId)).find((b) => b.articleId === body.data.articleId);
  if (!bookmark) return apiError(404, "Bookmark not found");
  if (bookmark.editionId) {
    // Records an "unsave" signal and removes the bookmark.
    await recordReaderFeedback(reader.store, reader.userId, { type: "unsave", editionId: bookmark.editionId, articleId: bookmark.articleId }).catch(() => reader.store.removeBookmark(reader.userId, bookmark.articleId));
  } else {
    await reader.store.removeBookmark(reader.userId, bookmark.articleId);
  }
  return json({ ok: true });
}
