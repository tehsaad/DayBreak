import { apiError, json, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { FeedbackTargetError, setTopicFollow, TopicFollowInput } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/** Follow or unfollow a topic (an explicit preference change). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const rl = rateLimit("write", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = await parseBody(req, TopicFollowInput);
  if (!body.ok) return body.response;
  try {
    const prefs = await setTopicFollow(reader.store, reader.userId, body.data.topic, body.data.follow);
    return json({ ok: true, sections: prefs.sections });
  } catch (err) {
    if (err instanceof FeedbackTargetError) return apiError(409, err.message, { next: "/onboarding" });
    throw err;
  }
}
