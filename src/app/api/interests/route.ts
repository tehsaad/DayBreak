import { z } from "zod";
import { apiError, json, parseBody, sameOrigin } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { computeLearnedProfile } from "@/lib/rank/learning";
import { TOPIC_IDS } from "@/lib/topics";

export const dynamic = "force-dynamic";

/** What DAYBREAK has inferred from this reader's feedback. */
export async function GET() {
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const learned = computeLearnedProfile(await reader.store.listFeedback(reader.userId, 90));
  return json({ topics: learned.topics, publishers: learned.publishers, signals: learned.signalCount, rejected: learned.rejected.length });
}

const Reset = z.object({ topic: z.enum(TOPIC_IDS).optional(), all: z.boolean().optional() }).refine((v) => v.topic || v.all, "Give a topic or all: true");

/** Forget learned signals for one topic (or all). Explicit preferences are untouched. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const body = await parseBody(req, Reset);
  if (!body.ok) return body.response;
  const removed = await reader.store.deleteFeedback(reader.userId, body.data);
  const learned = computeLearnedProfile(await reader.store.listFeedback(reader.userId, 90));
  await reader.store.saveAffinities(reader.userId, Object.fromEntries(Object.entries(learned.topics).map(([t, s]) => [t, { weight: s!.weight, events: s!.events }])));
  return json({ ok: true, removed });
}
