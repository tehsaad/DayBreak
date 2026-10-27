import { z } from "zod";
import { apiError, json, log, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { aiHandle } from "@/lib/ai/handle";
import { getReader } from "@/lib/auth/reader";
import { CooldownError, NoContentError } from "@/lib/edition/generate";
import { editionDateFor } from "@/lib/preferences";
import { RunBusyError } from "@/lib/store/types";
import { runEditionWorkflow } from "@/lib/workflow/runner";
import type { WorkflowRun } from "@/lib/workflow/types";

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
  if (!prefs?.onboardedAt) return apiError(409, "Complete onboarding first", { next: "/onboarding" });
  if (body.data.mode === "regenerate") {
    const rl = rateLimit("generate", reader.userId);
    if (!rl.ok) return tooMany(rl.retryAfter);
  }
  // "ensure" with today's paper already made: answer from the database, no workflow run.
  if (body.data.mode === "ensure") {
    const today = await reader.store.latestEdition(reader.userId, editionDateFor(prefs.timezone));
    if (today) return json({ editionId: today.id, created: false, aiUsed: today.ai.used, contentMode: today.contentMode, ingestion: null, runId: null });
  }
  try {
    const started = Date.now();
    const result = await runEditionWorkflow({
      store: reader.store,
      userId: reader.userId,
      prefs,
      trigger: "manual",
      mode: body.data.mode,
      ai: aiHandle(),
      log: (event, data) => log(event, { ...data, user: reader.userId.slice(0, 8) }),
    });
    const edition = result.edition!;
    log("edition_request", { mode: body.data.mode, created: result.generation?.created ?? false, ms: Date.now() - started, ai: result.generation?.aiUsed ?? false, run: result.run.id });
    return json({ editionId: edition.id, created: result.generation?.created ?? false, aiUsed: result.generation?.aiUsed ?? edition.ai.used, contentMode: edition.contentMode, ingestion: result.generation?.ingestion ?? null, runId: result.run.id });
  } catch (err) {
    const runId = (err as { run?: WorkflowRun }).run?.id ?? null;
    if (err instanceof RunBusyError) return apiError(409, "Your paper is already being prepared. It will appear in a moment.", { busy: true });
    if (err instanceof CooldownError) return apiError(429, err.message, { retryAfter: err.retryAfterSeconds, runId }, { "retry-after": String(err.retryAfterSeconds) });
    if (err instanceof NoContentError) return apiError(422, err.message, { runId });
    log("edition_failed", { error: (err as Error).message?.slice(0, 300), run: runId });
    return apiError(500, "We couldn't prepare your edition. Please try again in a moment.", { runId });
  }
}
