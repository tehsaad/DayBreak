import { z } from "zod";
import { apiError, json, log, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { aiHandle } from "@/lib/ai/handle";
import { getReader } from "@/lib/auth/reader";
import { CooldownError, NoContentError, generateEdition } from "@/lib/edition/generate";

export const dynamic = "force-dynamic";
// Generation may refresh feeds (≤18 s budget) and make one LLM call (≤30 s by default).
export const maxDuration = 60;

export async function GET() {
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  return json({ editions: await reader.store.listEditions(reader.userId, 90) });
}

const Body = z.object({ mode: z.enum(["ensure", "regenerate"]).default("ensure") });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const prefs = await reader.store.getPreferences(reader.userId);
  if (!prefs) return apiError(409, "Complete onboarding first", { next: "/onboarding" });
  if (body.data.mode === "regenerate") {
    const rl = rateLimit("generate", reader.userId);
    if (!rl.ok) return tooMany(rl.retryAfter);
  }
  try {
    const started = Date.now();
    const result = await generateEdition({ store: reader.store, userId: reader.userId, prefs, mode: body.data.mode, ai: aiHandle(), log: (event, data) => log(event, { ...data, user: reader.userId.slice(0, 8) }) });
    log("edition_request", { mode: body.data.mode, created: result.created, ms: Date.now() - started, ai: result.aiUsed });
    return json({ editionId: result.edition.id, created: result.created, aiUsed: result.aiUsed, contentMode: result.edition.contentMode, ingestion: result.ingestion });
  } catch (err) {
    if (err instanceof CooldownError) return apiError(429, err.message, { retryAfter: err.retryAfterSeconds }, { "retry-after": String(err.retryAfterSeconds) });
    if (err instanceof NoContentError) return apiError(422, err.message);
    log("edition_failed", { error: (err as Error).message?.slice(0, 300) });
    return apiError(500, "We couldn't prepare your edition. Please try again in a moment.");
  }
}
