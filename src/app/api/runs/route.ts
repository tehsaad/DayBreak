import { apiError, json } from "@/lib/api";
import { getReader } from "@/lib/auth/reader";
import { editionDateFor } from "@/lib/preferences";
import { nextDelivery } from "@/lib/workflow/schedule";

export const dynamic = "force-dynamic";

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
