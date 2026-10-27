import { z } from "zod";
import { aiHandle } from "@/lib/ai/handle";
import { apiError, json, log, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { deliveryKey } from "@/lib/delivery/deliver";
import { CooldownError, NoContentError } from "@/lib/edition/generate";
import { editionDateFor } from "@/lib/preferences";
import { RunBusyError } from "@/lib/store/types";
import { appUrlFor } from "@/lib/workflow/dispatch";
import { runEditionWorkflow } from "@/lib/workflow/runner";
import { nextDelivery } from "@/lib/workflow/schedule";
import type { WorkflowRun } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The signed-in reader's recent workflow runs and deliveries, and the next scheduled delivery. */
export async function GET() {
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const prefs = await reader.store.getPreferences(reader.userId);
  try {
    const [runs, deliveries] = await Promise.all([reader.store.listWorkflowRuns(reader.userId, 30), reader.store.listDeliveries(reader.userId, 30)]);
    const today = prefs ? editionDateFor(prefs.timezone) : null;
    const todayDone = runs.some((r) => r.idempotencyKey === `scheduled:${today}` && r.status === "succeeded");
    return json({ runs, deliveries, nextDelivery: prefs ? nextDelivery(prefs, new Date(), { todayDone })?.toISOString() ?? null : null });
  } catch {
    return apiError(503, "Run history is not available yet on this server.");
  }
}

const Body = z.object({ deliver: z.literal(true) });

/**
 * "Email today's paper now": the same workflow as a scheduled delivery (today's edition is reused
 * or prepared, then emailed), but on demand. The per-edition delivery key still guarantees the
 * same edition is never emailed twice.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const rl = rateLimit("generate", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const prefs = await reader.store.getPreferences(reader.userId);
  if (!prefs?.onboardedAt) return apiError(409, "Complete onboarding first", { next: "/onboarding" });
  const email = reader.email ?? (await reader.store.getReaderEmail(reader.userId).catch(() => null));
  try {
    const result = await runEditionWorkflow({
      store: reader.store,
      userId: reader.userId,
      prefs,
      trigger: "manual",
      mode: "ensure",
      ai: aiHandle(),
      deliver: { email, appUrl: appUrlFor(req), format: prefs.delivery.format },
      log: (event, data) => log(event, { ...data, user: reader.userId.slice(0, 8) }),
    });
    const delivery = result.edition ? await reader.store.getDelivery(reader.userId, deliveryKey(result.edition.id)) : null;
    const deduplicated = result.run.stages.find((s) => s.name === "deliver")?.metrics.deduplicated === true;
    return json({ run: result.run, delivery, deduplicated });
  } catch (err) {
    const run = (err as { run?: WorkflowRun }).run ?? null;
    if (err instanceof RunBusyError) return apiError(409, "Your paper is already being prepared. Try again in a moment.", { busy: true });
    if (err instanceof CooldownError) return apiError(429, err.message);
    if (err instanceof NoContentError) return apiError(422, err.message, { run });
    return apiError(502, run?.error?.stage === "deliver" ? `The paper is ready but the email failed: ${run.error.message}` : "We couldn't prepare your paper. Please try again.", { run });
  }
}
