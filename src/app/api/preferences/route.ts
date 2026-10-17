import { z } from "zod";
import { apiError, json, parseBody, rateLimit, sameOrigin, tooMany } from "@/lib/api";
import { getOrCreateReader, getReader } from "@/lib/auth/reader";
import { normalizePreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const reader = await getReader();
  if (!reader) return apiError(401, "Not signed in");
  const prefs = await reader.store.getPreferences(reader.userId);
  return json({ preferences: prefs, mode: reader.mode, onboarded: Boolean(prefs?.onboardedAt) });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Cross-origin request rejected");
  const reader = await getOrCreateReader();
  if (!reader) return apiError(401, "Sign in to save your preferences");
  const rl = rateLimit("write", reader.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  if (!body.ok) return body.response;
  const previous = await reader.store.getPreferences(reader.userId);
  // `complete: false` = onboarding draft (progress is kept, reader not yet marked onboarded).
  const complete = body.data.complete !== false;
  let prefs;
  try {
    prefs = normalizePreferences(body.data, previous, { complete });
  } catch (err) {
    return apiError(400, "Invalid preferences", { detail: err instanceof z.ZodError ? err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) : undefined });
  }
  await reader.store.savePreferences(reader.userId, prefs);
  return json({ preferences: prefs, mode: reader.mode, onboarded: Boolean(prefs.onboardedAt) });
}
